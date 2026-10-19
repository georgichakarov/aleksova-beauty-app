import { addMinutes } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import type { PGlite } from "@electric-sql/pglite";
import { getDatabase } from "./db";

const TZ = "Europe/Sofia";
const SLOT_STEP = 15;
const LOCK_KEY = 734219;

type Runner = Pick<PGlite, "query">;
type Settings = {
  timezone: string;
  min_notice_hours: number;
  booking_horizon_days: number;
  pending_expiry_minutes: number;
  default_buffer_minutes: number;
};
type ServiceRow = {
  id: string;
  name: string;
  description: string;
  price_minor: number;
  duration_minutes: number;
  buffer_minutes: number | null;
  bookable: boolean;
  archived: boolean;
};
type BreakRange = { start: number; end: number };
type Schedule = { open: boolean; start: number; end: number; breaks: BreakRange[] };

export type BookingInput = {
  name: string;
  phone: string;
  email?: string;
  notes?: string;
  serviceId: string;
  date: string;
  time: string;
  source?: "website" | "instagram" | "phone" | "other";
  status?: "pending" | "confirmed";
  ownerId?: string;
};

export function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function validTime(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  return Boolean(match && Number(match[1]) < 24 && Number(match[2]) < 60);
}

function minuteOfDay(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return (hour ?? 0) * 60 + (minute ?? 0);
}

function localInstant(date: string, minute: number, timezone: string) {
  const dayOffset = Math.floor(minute / 1440);
  const minuteOfDate = minute % 1440;
  const localDate = new Date(`${date}T12:00:00Z`);
  localDate.setUTCDate(localDate.getUTCDate() + dayOffset);
  const datePart = localDate.toISOString().slice(0, 10);
  const local = `${datePart}T${String(Math.floor(minuteOfDate / 60)).padStart(2, "0")}:${String(minuteOfDate % 60).padStart(2, "0")}:00`;
  const instant = fromZonedTime(local, timezone);
  if (formatInTimeZone(instant, timezone, "yyyy-MM-dd'T'HH:mm:ss") !== local) return null;
  return instant;
}

async function settingsFor(runner: Runner): Promise<Settings> {
  const { rows } = await runner.query<Settings>(
    "SELECT timezone, min_notice_hours, booking_horizon_days, pending_expiry_minutes, default_buffer_minutes FROM business_settings WHERE id = 1",
  );
  return (
    rows[0] ?? {
      timezone: TZ,
      min_notice_hours: 12,
      booking_horizon_days: 90,
      pending_expiry_minutes: 60,
      default_buffer_minutes: 10,
    }
  );
}

export async function expirePendingRequests(runner: Runner) {
  const expired = await runner.query<{ id: string }>(
    "UPDATE appointments SET status = 'expired', \"updatedAt\" = now() WHERE status = 'pending' AND pending_expires_at <= now() RETURNING id",
  );
  for (const appointment of expired.rows) {
    await runner.query(
      "INSERT INTO audit_events (action, entity_type, entity_id) VALUES ('appointment.expired', 'appointment', $1)",
      [appointment.id],
    );
  }
}

async function scheduleFor(runner: Runner, date: string): Promise<Schedule | null> {
  const weekday = (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;
  const exception = await runner.query<{
    is_closed: boolean;
    start_minute: number | null;
    end_minute: number | null;
    breaks: BreakRange[];
  }>(
    "SELECT is_closed, start_minute, end_minute, breaks FROM date_exceptions WHERE date = $1::date",
    [date],
  );
  if (exception.rows[0]) {
    const value = exception.rows[0];
    if (value.is_closed || value.start_minute === null || value.end_minute === null) return null;
    return {
      open: true,
      start: value.start_minute,
      end: value.end_minute,
      breaks: value.breaks ?? [],
    };
  }
  const result = await runner.query<{
    is_open: boolean;
    start_minute: number;
    end_minute: number;
    breaks: BreakRange[];
  }>("SELECT is_open, start_minute, end_minute, breaks FROM working_hours WHERE weekday = $1", [
    weekday,
  ]);
  const hours = result.rows[0];
  if (!hours || !hours.is_open) return null;
  return {
    open: true,
    start: hours.start_minute,
    end: hours.end_minute,
    breaks: hours.breaks ?? [],
  };
}

function overlaps(start: number, end: number, otherStart: number, otherEnd: number) {
  return start < otherEnd && otherStart < end;
}

async function slotFree(
  runner: Runner,
  date: string,
  start: Date,
  duration: number,
  buffer: number,
  ignoreId?: string,
  checkAdvanceWindow = true,
) {
  const settings = await settingsFor(runner);
  const schedule = await scheduleFor(runner, date);
  if (!schedule) return false;
  const startMinute = minuteOfDay(formatInTimeZone(start, settings.timezone, "HH:mm"));
  const endMinute = startMinute + duration;
  if (startMinute < schedule.start || endMinute > schedule.end) return false;
  if (schedule.breaks.some((range) => overlaps(startMinute, endMinute, range.start, range.end)))
    return false;

  const localToday = formatInTimeZone(new Date(), settings.timezone, "yyyy-MM-dd");
  const horizonDate = new Date(`${localToday}T12:00:00Z`);
  horizonDate.setUTCDate(horizonDate.getUTCDate() + settings.booking_horizon_days);
  if (date < localToday || date > horizonDate.toISOString().slice(0, 10)) return false;
  if (checkAdvanceWindow && start.getTime() < Date.now() + settings.min_notice_hours * 60_000)
    return false;

  const endAt = addMinutes(start, duration);
  const reservedUntil = addMinutes(endAt, buffer);
  const blocked = await runner.query<{ id: string }>(
    "SELECT id FROM blocked_periods WHERE start_at < $1::timestamptz AND end_at > $2::timestamptz LIMIT 1",
    [reservedUntil.toISOString(), start.toISOString()],
  );
  if (blocked.rows.length) return false;

  const appointments = await runner.query<{ id: string }>(
    `SELECT id FROM appointments
     WHERE (status = 'confirmed' OR (status = 'pending' AND pending_expires_at > now()))
       AND ($1::uuid IS NULL OR id <> $1::uuid)
       AND start_at < $2::timestamptz AND reserved_until > $3::timestamptz
     LIMIT 1`,
    [ignoreId ?? null, reservedUntil.toISOString(), start.toISOString()],
  );
  return appointments.rows.length === 0;
}

export async function listBookableServices() {
  const { client } = await getDatabase();
  const { rows } = await client.query<ServiceRow>(
    "SELECT id, name, description, price_minor, duration_minutes, buffer_minutes, bookable, archived FROM services WHERE bookable AND NOT archived ORDER BY name",
  );
  return rows.map((service) => ({
    id: service.id,
    name: service.name,
    description: service.description,
    price: service.price_minor / 100,
    duration: service.duration_minutes,
    buffer: service.buffer_minutes,
    active: service.bookable && !service.archived,
  }));
}

export async function availableTimes(date: string, serviceId: string) {
  if (!validDate(date)) return [];
  const { client } = await getDatabase();
  const settings = await settingsFor(client);
  const serviceResult = await client.query<ServiceRow>(
    "SELECT id, name, description, price_minor, duration_minutes, buffer_minutes, bookable, archived FROM services WHERE id = $1 AND bookable AND NOT archived",
    [serviceId],
  );
  const service = serviceResult.rows[0];
  const schedule = await scheduleFor(client, date);
  if (!service || !schedule) return [];
  const buffer = service.buffer_minutes ?? settings.default_buffer_minutes;
  const out: string[] = [];
  for (
    let minute = schedule.start;
    minute + service.duration_minutes <= schedule.end;
    minute += SLOT_STEP
  ) {
    const start = localInstant(date, minute, settings.timezone);
    if (!start) continue;
    if (await slotFree(client, date, start, service.duration_minutes, buffer))
      out.push(start.toISOString());
  }
  return out;
}

export async function slotAvailableForReschedule(
  runner: Runner,
  date: string,
  start: Date,
  duration: number,
  buffer: number,
  ignoreId: string,
) {
  return slotFree(runner, date, start, duration, buffer, ignoreId);
}

export async function rescheduleBooking(
  id: string,
  date: string,
  time: string,
  actorId: string | null,
) {
  if (!validDate(date) || !validTime(time)) return { ok: false as const, reason: "invalid" };
  const { client } = await getDatabase();
  try {
    return await client.transaction(async (tx) => {
      await tx.query("SELECT pg_advisory_xact_lock($1)", [LOCK_KEY]);
      await expirePendingRequests(tx);
      const result = await tx.query<{
        id: string;
        status: string;
        duration_minutes: number;
        buffer_minutes: number;
        pending_expires_at: string | null;
      }>(
        "SELECT id, status, duration_minutes, buffer_minutes, pending_expires_at FROM appointments WHERE id = $1 FOR UPDATE",
        [id],
      );
      const appointment = result.rows[0];
      if (!appointment || !["pending", "confirmed"].includes(appointment.status))
        return { ok: false as const, reason: "status" };
      if (
        appointment.status === "pending" &&
        appointment.pending_expires_at &&
        new Date(appointment.pending_expires_at) <= new Date()
      ) {
        await tx.query(
          "UPDATE appointments SET status = 'expired', \"updatedAt\" = now() WHERE id = $1",
          [id],
        );
        await tx.query(
          "INSERT INTO audit_events (actor_id, action, entity_type, entity_id) VALUES ($1, 'appointment.expired', 'appointment', $2)",
          [actorId, id],
        );
        return { ok: false as const, reason: "expired" };
      }
      const settings = await settingsFor(tx);
      const start = localInstant(date, minuteOfDay(time), settings.timezone);
      if (
        !start ||
        !(await slotFree(
          tx,
          date,
          start,
          appointment.duration_minutes,
          appointment.buffer_minutes,
          id,
        ))
      ) {
        return { ok: false as const, reason: "unavailable" };
      }
      const end = addMinutes(start, appointment.duration_minutes);
      const reservedUntil = addMinutes(end, appointment.buffer_minutes);
      await tx.query(
        'UPDATE appointments SET start_at = $1, end_at = $2, reserved_until = $3, "updatedAt" = now() WHERE id = $4',
        [start.toISOString(), end.toISOString(), reservedUntil.toISOString(), id],
      );
      await tx.query(
        "INSERT INTO audit_events (actor_id, action, entity_type, entity_id) VALUES ($1, 'appointment.rescheduled', 'appointment', $2)",
        [actorId, id],
      );
      return { ok: true as const };
    });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23P01") {
      return { ok: false as const, reason: "unavailable" };
    }
    throw error;
  }
}

export async function createBooking(input: BookingInput) {
  if (!validDate(input.date) || !validTime(input.time))
    return { ok: false as const, reason: "invalid" };
  const { client } = await getDatabase();
  try {
    const result = await client.transaction(async (tx) => {
      await tx.query("SELECT pg_advisory_xact_lock($1)", [LOCK_KEY]);
      await expirePendingRequests(tx);
      const serviceResult = await tx.query<ServiceRow>(
        "SELECT id, name, description, price_minor, duration_minutes, buffer_minutes, bookable, archived FROM services WHERE id = $1 AND bookable AND NOT archived",
        [input.serviceId],
      );
      const service = serviceResult.rows[0];
      if (!service) return { ok: false as const, reason: "service" };
      const settings = await settingsFor(tx);
      const start = localInstant(input.date, minuteOfDay(input.time), settings.timezone);
      if (!start) return { ok: false as const, reason: "time" };
      const buffer = service.buffer_minutes ?? settings.default_buffer_minutes;
      const status = input.status ?? "pending";
      if (
        !(await slotFree(
          tx,
          input.date,
          start,
          service.duration_minutes,
          buffer,
          undefined,
          status === "pending",
        ))
      ) {
        return { ok: false as const, reason: "unavailable" };
      }

      const phone = input.phone.trim();
      const foundClient = await tx.query<{ id: string }>(
        'SELECT id FROM clients WHERE lower(phone) = lower($1) ORDER BY "createdAt" LIMIT 1',
        [phone],
      );
      const clientId =
        foundClient.rows[0]?.id ??
        (
          await tx.query<{ id: string }>(
            "INSERT INTO clients (name, phone, email) VALUES ($1, $2, $3) RETURNING id",
            [input.name.trim(), phone, input.email?.trim() || null],
          )
        ).rows[0]?.id;
      if (!clientId) throw new Error("client insert failed");
      if (foundClient.rows[0]) {
        await tx.query("UPDATE clients SET name = $1, email = $2 WHERE id = $3", [
          input.name.trim(),
          input.email?.trim() || null,
          clientId,
        ]);
      }

      const end = addMinutes(start, service.duration_minutes);
      const reservedUntil = addMinutes(end, buffer);
      const expiry =
        status === "pending"
          ? new Date(Date.now() + settings.pending_expiry_minutes * 60_000)
          : null;
      const appointment = await tx.query<{ id: string }>(
        `INSERT INTO appointments
          (client_id, service_id, service_name, price_minor, duration_minutes, buffer_minutes,
           start_at, end_at, reserved_until, pending_expires_at, status, source, notes, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         RETURNING id`,
        [
          clientId,
          service.id,
          service.name,
          service.price_minor,
          service.duration_minutes,
          buffer,
          start.toISOString(),
          end.toISOString(),
          reservedUntil.toISOString(),
          expiry?.toISOString() ?? null,
          status,
          input.source ?? "website",
          input.notes?.trim() ?? "",
          input.ownerId ?? null,
        ],
      );
      const id = appointment.rows[0]?.id;
      if (!id) throw new Error("appointment insert failed");
      await tx.query(
        "INSERT INTO audit_events (actor_id, action, entity_type, entity_id, details) VALUES ($1, 'appointment.created', 'appointment', $2, $3::jsonb)",
        [input.ownerId ?? null, id, JSON.stringify({ source: input.source ?? "website", status })],
      );
      return { ok: true as const, id, status };
    });
    return result;
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23P01") {
      return { ok: false as const, reason: "unavailable" };
    }
    throw error;
  }
}

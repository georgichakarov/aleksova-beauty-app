import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { z } from "zod";
import { getDatabase } from "./db";
import { getOwner } from "./auth";
import {
  availableTimes,
  createBooking,
  expirePendingRequests,
  listBookableServices,
  rescheduleBooking,
  validDate,
} from "./booking";
import { notifyBookingRequest } from "./notifications";

const TZ = "Europe/Sofia";
const LOCK_KEY = 734219;
const bookingAttempts = new Map<string, { start: number; count: number }>();

const json = (body: unknown, status = 200) => Response.json(body, { status });
const badRequest = (message: string) => json({ error: message }, 400);
const unauthorized = () => json({ error: "Authentication required." }, 401);

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

function clientAddress(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

function bookingRateLimited(request: Request) {
  const now = Date.now();
  const key = clientAddress(request);
  const current = bookingAttempts.get(key);
  if (!current || now - current.start >= 60_000) {
    bookingAttempts.set(key, { start: now, count: 1 });
    return false;
  }
  current.count += 1;
  return current.count > 5;
}

export async function getSessionResponse(request: Request) {
  const owner = await getOwner(request);
  return owner
    ? json({ authenticated: true, name: owner.name, email: owner.email })
    : json({ authenticated: false }, 401);
}

export async function getServicesResponse() {
  return json({ services: await listBookableServices(), timezone: TZ, currency: "EUR" });
}

export async function getAvailabilityResponse(request: Request) {
  const url = new URL(request.url);
  const date = url.searchParams.get("date") ?? "";
  const serviceId = url.searchParams.get("service") ?? "";
  if (!validDate(date) || !z.string().uuid().safeParse(serviceId).success)
    return badRequest("Choose a valid service and date.");
  return json({ slots: await availableTimes(date, serviceId), timezone: TZ });
}

const bookingSchema = z.object({
  name: z.string().trim().min(2).max(100),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9][0-9\s()-]{5,24}$/),
  email: z.union([z.string().trim().email().max(254), z.literal("")]).optional(),
  notes: z.string().trim().max(1000).optional(),
  serviceId: z.string().uuid(),
  date: z.string(),
  time: z.string().regex(/^\d{2}:\d{2}$/),
});

export async function createBookingResponse(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Cross-origin requests are not allowed." }, 403);
  if (bookingRateLimited(request))
    return json({ error: "Too many booking requests. Try again shortly." }, 429);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid request body.");
  }
  const input = bookingSchema.safeParse(body);
  if (!input.success) return badRequest("Check the booking details and try again.");
  const { email, notes, ...bookingData } = input.data;
  const result = await createBooking({
    ...bookingData,
    ...(email ? { email } : {}),
    ...(notes ? { notes } : {}),
  });
  if (!result.ok) {
    const message =
      result.reason === "unavailable"
        ? "That time is no longer available. Choose another slot."
        : "The selected service or time is invalid.";
    return json({ error: message }, 409);
  }
  const reference = `ABS-${result.id.slice(0, 8).toUpperCase()}`;
  const notification = await notifyBookingRequest({ reference, status: "pending" });
  return json({ reference, status: "pending", notification }, 201);
}

type AppointmentRow = {
  id: string;
  client_id: string;
  client_name: string;
  phone: string;
  email: string | null;
  service_id: string;
  service_name: string;
  price_minor: number;
  duration_minutes: number;
  buffer_minutes: number;
  start_at: string;
  status: string;
  source: string;
  notes: string;
  created_at: string;
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
type PaymentRow = {
  id: string;
  appointment_id: string;
  kind: "payment" | "refund";
  amount_minor: number;
  occurred_at: string;
  method: string;
  note: string;
};
type HoursRow = {
  weekday: number;
  is_open: boolean;
  start_minute: number;
  end_minute: number;
  breaks: { start: number; end: number }[];
};
type BlockRow = { id: string; start_at: string; end_at: string; reason: string };
type ExceptionRow = {
  date: string;
  is_closed: boolean;
  start_minute: number | null;
  end_minute: number | null;
  breaks: { start: number; end: number }[];
  note: string;
};

function dateMinute(start: string) {
  const instant = new Date(start);
  return {
    date: formatInTimeZone(instant, TZ, "yyyy-MM-dd"),
    start:
      Number(formatInTimeZone(instant, TZ, "HH")) * 60 +
      Number(formatInTimeZone(instant, TZ, "mm")),
  };
}

async function readStudioState(from?: string, to?: string) {
  const { client } = await getDatabase();
  const [
    serviceResult,
    apptResult,
    paymentResult,
    hoursResult,
    blockResult,
    exceptionResult,
    settingsResult,
  ] = await Promise.all([
    client.query<ServiceRow>(
      "SELECT id, name, description, price_minor, duration_minutes, buffer_minutes, bookable, archived FROM services ORDER BY name",
    ),
    client.query<AppointmentRow>(
      `SELECT a.id, a.client_id, c.name AS client_name, c.phone, c.email,
              a.service_id, a.service_name, a.price_minor, a.duration_minutes, a.buffer_minutes,
              a.start_at, a.status, a.source, a.notes, a."createdAt" AS created_at
       FROM appointments a JOIN clients c ON c.id = a.client_id
       WHERE ($1::date IS NULL OR (a.start_at AT TIME ZONE $3)::date >= $1::date)
         AND ($2::date IS NULL OR (a.start_at AT TIME ZONE $3)::date <= $2::date)
       ORDER BY a.start_at`,
      [from ?? null, to ?? null, TZ],
    ),
    client.query<PaymentRow>(
      "SELECT id, appointment_id, kind, amount_minor, occurred_at, method, note FROM payment_transactions ORDER BY occurred_at DESC",
    ),
    client.query<HoursRow>(
      "SELECT weekday, is_open, start_minute, end_minute, breaks FROM working_hours ORDER BY weekday",
    ),
    client.query<BlockRow>(
      "SELECT id, start_at, end_at, reason FROM blocked_periods ORDER BY start_at",
    ),
    client.query<ExceptionRow>(
      "SELECT date, is_closed, start_minute, end_minute, breaks, note FROM date_exceptions ORDER BY date",
    ),
    client.query<{
      default_buffer_minutes: number;
      min_notice_hours: number;
      booking_horizon_days: number;
      pending_expiry_minutes: number;
    }>(
      "SELECT default_buffer_minutes, min_notice_hours, booking_horizon_days, pending_expiry_minutes FROM business_settings WHERE id = 1",
    ),
  ]);
  const services = serviceResult.rows.map((service) => ({
    id: service.id,
    name: service.name,
    description: service.description,
    price: service.price_minor / 100,
    duration: service.duration_minutes,
    buffer: service.buffer_minutes,
    bookable: service.bookable,
    archived: service.archived,
  }));
  const appointments = apptResult.rows.map((appointment) => ({
    ...appointment,
    ...dateMinute(appointment.start_at),
    clientName: appointment.client_name,
    serviceId: appointment.service_id,
    serviceName: appointment.service_name,
    price: appointment.price_minor / 100,
    duration: appointment.duration_minutes,
    buffer: appointment.buffer_minutes,
    createdAt: new Date(appointment.created_at).getTime(),
  }));
  const payments = paymentResult.rows.map((payment) => ({
    id: payment.id,
    appointmentId: payment.appointment_id,
    amount: ((payment.kind === "refund" ? -1 : 1) * payment.amount_minor) / 100,
    date: formatInTimeZone(new Date(payment.occurred_at), TZ, "yyyy-MM-dd"),
    method: payment.method,
    note: payment.note,
    kind: payment.kind,
    createdAt: new Date(payment.occurred_at).getTime(),
  }));
  const hours = Array.from({ length: 7 }, (_, weekday) => {
    const item = hoursResult.rows.find((row) => row.weekday === weekday);
    return item
      ? {
          open: item.is_open,
          start: item.start_minute,
          end: item.end_minute,
          breaks: item.breaks ?? [],
        }
      : { open: false, start: 540, end: 1020, breaks: [] };
  });
  const blocks = blockResult.rows.map((block) => {
    const start = new Date(block.start_at);
    const end = new Date(block.end_at);
    const allDay =
      formatInTimeZone(start, TZ, "HH:mm") === "00:00" &&
      formatInTimeZone(end, TZ, "HH:mm") === "00:00";
    return {
      id: block.id,
      date: formatInTimeZone(start, TZ, "yyyy-MM-dd"),
      allDay,
      start:
        Number(formatInTimeZone(start, TZ, "HH")) * 60 + Number(formatInTimeZone(start, TZ, "mm")),
      end: Number(formatInTimeZone(end, TZ, "HH")) * 60 + Number(formatInTimeZone(end, TZ, "mm")),
      reason: block.reason,
    };
  });
  const exceptions = exceptionResult.rows.map((item) => ({ ...item, date: String(item.date) }));
  return {
    services,
    appointments,
    payments,
    hours,
    defaultBuffer: settingsResult.rows[0]?.default_buffer_minutes ?? 10,
    minNoticeHours: settingsResult.rows[0]?.min_notice_hours ?? 12,
    bookingHorizonDays: settingsResult.rows[0]?.booking_horizon_days ?? 90,
    pendingExpiryMinutes: settingsResult.rows[0]?.pending_expiry_minutes ?? 60,
    blocks,
    exceptions,
  };
}

export async function getAdminStateResponse(request: Request) {
  if (!(await getOwner(request))) return unauthorized();
  const url = new URL(request.url);
  const from = url.searchParams.get("from") ?? undefined;
  const to = url.searchParams.get("to") ?? undefined;
  if ((from && !validDate(from)) || (to && !validDate(to)))
    return badRequest("Invalid date filter.");
  const { client } = await getDatabase();
  await client.transaction(async (tx) => {
    await tx.query("SELECT pg_advisory_xact_lock($1)", [LOCK_KEY]);
    await expirePendingRequests(tx);
  });
  return json(await readStudioState(from, to));
}

const statusTransitions: Record<string, string[]> = {
  pending: ["confirmed", "declined", "cancelled"],
  confirmed: ["cancelled", "completed", "no_show"],
  completed: [],
  no_show: [],
  cancelled: [],
  declined: [],
  expired: [],
};

const adminActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("status"),
    id: z.string().uuid(),
    status: z.enum(["confirmed", "declined", "cancelled", "completed", "no_show"]),
  }),
  z.object({
    action: z.literal("reschedule"),
    id: z.string().uuid(),
    date: z.string(),
    time: z.string().regex(/^\d{2}:\d{2}$/),
  }),
  z.object({
    action: z.literal("create"),
    name: z.string().trim().min(2).max(100),
    phone: z.string().trim().min(6).max(30),
    email: z.string().email().max(254).optional().or(z.literal("")),
    notes: z.string().max(1000).optional(),
    serviceId: z.string().uuid(),
    date: z.string(),
    time: z.string().regex(/^\d{2}:\d{2}$/),
    source: z.enum(["instagram", "phone", "other"]),
    status: z.enum(["pending", "confirmed"]).default("confirmed"),
  }),
  z.object({
    action: z.literal("hours"),
    weekday: z.number().int().min(0).max(6),
    open: z.boolean(),
    start: z.number().int().min(0).max(1439),
    end: z.number().int().min(1).max(1440),
    breaks: z
      .array(
        z.object({
          start: z.number().int().min(0).max(1439),
          end: z.number().int().min(1).max(1440),
        }),
      )
      .max(8),
  }),
  z.object({
    action: z.literal("settings"),
    defaultBuffer: z.number().int().min(0).max(120),
    minNoticeHours: z.number().int().min(0).max(720).optional(),
    bookingHorizonDays: z.number().int().min(1).max(365).optional(),
    pendingExpiryMinutes: z.number().int().min(5).max(10080).optional(),
  }),
  z.object({
    action: z.literal("exception"),
    date: z.string(),
    closed: z.boolean(),
    start: z.number().int().min(0).max(1439).optional(),
    end: z.number().int().min(1).max(1440).optional(),
    breaks: z
      .array(
        z.object({
          start: z.number().int().min(0).max(1439),
          end: z.number().int().min(1).max(1440),
        }),
      )
      .max(8)
      .default([]),
    note: z.string().max(250).default(""),
  }),
  z.object({ action: z.literal("deleteException"), date: z.string() }),
  z.object({
    action: z.literal("block"),
    date: z.string(),
    allDay: z.boolean(),
    start: z.number().int().min(0).max(1439),
    end: z.number().int().min(1).max(1440),
    reason: z.string().max(250).default(""),
  }),
  z.object({ action: z.literal("unblock"), id: z.string().uuid() }),
  z.object({
    action: z.literal("service"),
    id: z.string().uuid().optional(),
    name: z.string().trim().min(2).max(100),
    description: z.string().max(1000),
    priceMinor: z.number().int().min(0).max(10_000_000),
    duration: z.number().int().min(5).max(600),
    buffer: z.number().int().min(0).max(120).nullable(),
    bookable: z.boolean(),
    archived: z.boolean(),
  }),
  z.object({
    action: z.literal("payment"),
    idempotencyKey: z.string().uuid(),
    appointmentId: z.string().uuid(),
    kind: z.enum(["payment", "refund"]),
    amountMinor: z.number().int().positive().max(10_000_000),
    date: z.string(),
    method: z.enum(["cash", "card", "bank", "other"]),
    note: z.string().max(500).default(""),
  }),
  z.object({
    action: z.literal("correctPayment"),
    id: z.string().uuid(),
    amountMinor: z.number().int().positive().max(10_000_000),
    date: z.string(),
    method: z.enum(["cash", "card", "bank", "other"]),
    idempotencyKey: z.string().uuid(),
  }),
]);

function validBreaksWithin(start: number, end: number, breaks: { start: number; end: number }[]) {
  return (
    end > start &&
    breaks.every((item) => item.start >= start && item.end <= end && item.end > item.start)
  );
}

export async function updateAdminResponse(request: Request) {
  const owner = await getOwner(request);
  if (!owner) return unauthorized();
  if (!sameOrigin(request)) return json({ error: "Cross-origin requests are not allowed." }, 403);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid request body.");
  }
  const parsed = adminActionSchema.safeParse(body);
  if (!parsed.success) return badRequest("Invalid action data.");
  const input = parsed.data;
  const { client } = await getDatabase();

  if (input.action === "status") {
    const result = await client.transaction(async (tx) => {
      await tx.query("SELECT pg_advisory_xact_lock($1)", [LOCK_KEY]);
      const current = await tx.query<{ status: string; pending_expires_at: string | null }>(
        "SELECT status, pending_expires_at FROM appointments WHERE id = $1 FOR UPDATE",
        [input.id],
      );
      const appointment = current.rows[0];
      const oldStatus = appointment?.status;
      if (
        oldStatus === "pending" &&
        appointment?.pending_expires_at &&
        new Date(appointment.pending_expires_at) <= new Date()
      ) {
        await tx.query(
          "UPDATE appointments SET status = 'expired', \"updatedAt\" = now() WHERE id = $1",
          [input.id],
        );
        await tx.query(
          "INSERT INTO audit_events (action, entity_type, entity_id) VALUES ('appointment.expired', 'appointment', $1)",
          [input.id],
        );
        return false;
      }
      if (!oldStatus || !statusTransitions[oldStatus]?.includes(input.status)) return false;
      const updated = await tx.query(
        'UPDATE appointments SET status = $1, pending_expires_at = NULL, "updatedAt" = now() WHERE id = $2',
        [input.status, input.id],
      );
      if (updated.affectedRows !== 1) return false;
      await tx.query(
        "INSERT INTO audit_events (actor_id, action, entity_type, entity_id) VALUES ($1, $2, 'appointment', $3)",
        [owner.id, `appointment.${input.status}`, input.id],
      );
      return true;
    });
    return result
      ? json({ ok: true })
      : json({ error: "That status transition is not allowed." }, 409);
  }

  if (input.action === "create") {
    const { email, notes, ...bookingData } = input;
    const created = await createBooking({
      ...bookingData,
      ...(email ? { email } : {}),
      ...(notes ? { notes } : {}),
      ownerId: owner.id,
    });
    return created.ok
      ? json({ ok: true, id: created.id }, 201)
      : json({ error: "That time is unavailable." }, 409);
  }

  if (input.action === "reschedule") {
    const moved = await rescheduleBooking(input.id, input.date, input.time, owner.id);
    return moved.ok
      ? json({ ok: true })
      : json({ error: "The new time is unavailable; the original booking was kept." }, 409);
  }

  if (input.action === "hours") {
    if (input.open && !validBreaksWithin(input.start, input.end, input.breaks))
      return badRequest("Working hours and breaks are inconsistent.");
    const saved = await client.transaction(async (tx) => {
      await tx.query("SELECT pg_advisory_xact_lock($1)", [LOCK_KEY]);
      const existing = await tx.query<{ id: string; start_at: string; end_at: string }>(
        `SELECT id, start_at, end_at FROM appointments
         WHERE (status = 'confirmed' OR (status = 'pending' AND pending_expires_at > now()))
           AND EXTRACT(ISODOW FROM start_at AT TIME ZONE $1) - 1 = $2`,
        [TZ, input.weekday],
      );
      const conflicts = existing.rows.filter((appointment) => {
        const start = new Date(appointment.start_at);
        const end = new Date(appointment.end_at);
        const startMinute =
          Number(formatInTimeZone(start, TZ, "HH")) * 60 +
          Number(formatInTimeZone(start, TZ, "mm"));
        const endMinute =
          Number(formatInTimeZone(end, TZ, "HH")) * 60 + Number(formatInTimeZone(end, TZ, "mm"));
        return (
          !input.open ||
          startMinute < input.start ||
          endMinute > input.end ||
          input.breaks.some(
            (breakRange) => startMinute < breakRange.end && breakRange.start < endMinute,
          )
        );
      });
      if (conflicts.length) return false;
      await tx.query(
        `INSERT INTO working_hours (weekday, is_open, start_minute, end_minute, breaks) VALUES ($1,$2,$3,$4,$5::jsonb)
         ON CONFLICT (weekday) DO UPDATE SET is_open = excluded.is_open, start_minute = excluded.start_minute, end_minute = excluded.end_minute, breaks = excluded.breaks`,
        [input.weekday, input.open, input.start, input.end, JSON.stringify(input.breaks)],
      );
      await tx.query(
        "INSERT INTO audit_events (actor_id, action, entity_type, details) VALUES ($1, 'availability.hours.updated', 'working_hours', $2::jsonb)",
        [owner.id, JSON.stringify({ weekday: input.weekday })],
      );
      return true;
    });
    return saved
      ? json({ ok: true })
      : json({ error: "Existing appointments conflict with these working hours or breaks." }, 409);
  }

  if (input.action === "settings") {
    await client.query(
      `INSERT INTO business_settings (id, default_buffer_minutes, min_notice_hours, booking_horizon_days, pending_expiry_minutes)
       VALUES (1,$1,coalesce($2,12),coalesce($3,90),coalesce($4,60))
       ON CONFLICT (id) DO UPDATE SET default_buffer_minutes = excluded.default_buffer_minutes,
       min_notice_hours = coalesce($2, business_settings.min_notice_hours),
       booking_horizon_days = coalesce($3, business_settings.booking_horizon_days),
       pending_expiry_minutes = coalesce($4, business_settings.pending_expiry_minutes)`,
      [
        input.defaultBuffer,
        input.minNoticeHours ?? null,
        input.bookingHorizonDays ?? null,
        input.pendingExpiryMinutes ?? null,
      ],
    );
    await client.query(
      "INSERT INTO audit_events (actor_id, action, entity_type) VALUES ($1, 'business.settings.updated', 'business_settings')",
      [owner.id],
    );
    return json({ ok: true });
  }

  if (input.action === "exception") {
    if (
      !validDate(input.date) ||
      (!input.closed &&
        (input.start === undefined ||
          input.end === undefined ||
          !validBreaksWithin(input.start, input.end, input.breaks)))
    )
      return badRequest("Choose valid exception hours.");
    const saved = await client.transaction(async (tx) => {
      await tx.query("SELECT pg_advisory_xact_lock($1)", [LOCK_KEY]);
      const active = await tx.query<{ id: string; start_at: string; end_at: string }>(
        `SELECT id, start_at, end_at FROM appointments
         WHERE (status = 'confirmed' OR (status = 'pending' AND pending_expires_at > now()))
           AND (start_at AT TIME ZONE $1)::date = $2::date`,
        [TZ, input.date],
      );
      const conflict = active.rows.some((appointment) => {
        const start = new Date(appointment.start_at);
        const end = new Date(appointment.end_at);
        const startMinute =
          Number(formatInTimeZone(start, TZ, "HH")) * 60 +
          Number(formatInTimeZone(start, TZ, "mm"));
        const endMinute =
          Number(formatInTimeZone(end, TZ, "HH")) * 60 + Number(formatInTimeZone(end, TZ, "mm"));
        return (
          input.closed ||
          input.start === undefined ||
          input.end === undefined ||
          startMinute < input.start ||
          endMinute > input.end ||
          input.breaks.some(
            (breakRange) => startMinute < breakRange.end && breakRange.start < endMinute,
          )
        );
      });
      if (conflict) return false;
      await tx.query(
        `INSERT INTO date_exceptions (date, is_closed, start_minute, end_minute, breaks, note)
         VALUES ($1::date,$2,$3,$4,$5::jsonb,$6) ON CONFLICT (date) DO UPDATE SET is_closed = excluded.is_closed,
         start_minute = excluded.start_minute, end_minute = excluded.end_minute, breaks = excluded.breaks, note = excluded.note`,
        [
          input.date,
          input.closed,
          input.start ?? null,
          input.end ?? null,
          JSON.stringify(input.breaks),
          input.note,
        ],
      );
      await tx.query(
        "INSERT INTO audit_events (actor_id, action, entity_type, entity_id) VALUES ($1, 'availability.exception.updated', 'date_exception', $2)",
        [owner.id, input.date],
      );
      return true;
    });
    return saved
      ? json({ ok: true })
      : json({ error: "Existing appointments conflict with this exception." }, 409);
  }

  if (input.action === "deleteException") {
    if (!validDate(input.date)) return badRequest("Choose a valid date.");
    await client.query("DELETE FROM date_exceptions WHERE date = $1::date", [input.date]);
    return json({ ok: true });
  }

  if (input.action === "block") {
    if (!validDate(input.date) || (!input.allDay && input.end <= input.start))
      return badRequest("Choose a valid blocked period.");
    const startText = input.allDay
      ? "00:00"
      : `${String(Math.floor(input.start / 60)).padStart(2, "0")}:${String(input.start % 60).padStart(2, "0")}`;
    const endText = input.allDay
      ? "00:00"
      : `${String(Math.floor(input.end / 60)).padStart(2, "0")}:${String(input.end % 60).padStart(2, "0")}`;
    const endDate = input.allDay ? new Date(`${input.date}T12:00:00Z`) : null;
    if (endDate) endDate.setUTCDate(endDate.getUTCDate() + 1);
    const start = fromZonedTime(`${input.date}T${startText}:00`, TZ);
    const end = fromZonedTime(
      `${endDate?.toISOString().slice(0, 10) ?? input.date}T${endText}:00`,
      TZ,
    );
    const result = await client.transaction(async (tx) => {
      await tx.query("SELECT pg_advisory_xact_lock($1)", [LOCK_KEY]);
      const conflicts = await tx.query<{
        id: string;
        client_name: string;
        service_name: string;
        start_at: string;
      }>(
        `SELECT a.id, c.name AS client_name, a.service_name, a.start_at FROM appointments a
         JOIN clients c ON c.id = a.client_id
         WHERE (a.status = 'confirmed' OR (a.status = 'pending' AND a.pending_expires_at > now()))
           AND a.start_at < $1::timestamptz AND a.reserved_until > $2::timestamptz`,
        [end.toISOString(), start.toISOString()],
      );
      if (conflicts.rows.length)
        return {
          conflicts: conflicts.rows.map((item) => ({
            id: item.id,
            clientName: item.client_name,
            serviceName: item.service_name,
            ...dateMinute(item.start_at),
          })),
        };
      const created = await tx.query<{ id: string }>(
        "INSERT INTO blocked_periods (start_at, end_at, reason) VALUES ($1,$2,$3) RETURNING id",
        [start.toISOString(), end.toISOString(), input.reason],
      );
      await tx.query(
        "INSERT INTO audit_events (actor_id, action, entity_type, entity_id) VALUES ($1, 'availability.block.created', 'blocked_period', $2)",
        [owner.id, created.rows[0]?.id],
      );
      return { id: created.rows[0]?.id };
    });
    if ("conflicts" in result)
      return json(
        { error: "Existing appointments conflict with this block.", conflicts: result.conflicts },
        409,
      );
    return json({ ok: true, id: result.id }, 201);
  }

  if (input.action === "unblock") {
    await client.query("DELETE FROM blocked_periods WHERE id = $1", [input.id]);
    await client.query(
      "INSERT INTO audit_events (actor_id, action, entity_type, entity_id) VALUES ($1, 'availability.block.removed', 'blocked_period', $2)",
      [owner.id, input.id],
    );
    return json({ ok: true });
  }

  if (input.action === "service") {
    if (input.id) {
      await client.query(
        `UPDATE services SET name=$1, description=$2, price_minor=$3, duration_minutes=$4, buffer_minutes=$5,
         bookable=$6, archived=$7, "updatedAt"=now() WHERE id=$8`,
        [
          input.name,
          input.description,
          input.priceMinor,
          input.duration,
          input.buffer,
          input.bookable,
          input.archived,
          input.id,
        ],
      );
    } else {
      await client.query(
        "INSERT INTO services (name, description, price_minor, duration_minutes, buffer_minutes, bookable, archived) VALUES ($1,$2,$3,$4,$5,$6,$7)",
        [
          input.name,
          input.description,
          input.priceMinor,
          input.duration,
          input.buffer,
          input.bookable,
          input.archived,
        ],
      );
    }
    await client.query(
      "INSERT INTO audit_events (actor_id, action, entity_type, entity_id) VALUES ($1, 'service.saved', 'service', $2)",
      [owner.id, input.id ?? null],
    );
    return json({ ok: true });
  }

  if (input.action === "payment") {
    if (!validDate(input.date)) return badRequest("Choose a valid payment date.");
    const occurredAt = fromZonedTime(`${input.date}T12:00:00`, TZ);
    const result = await client.transaction(async (tx) => {
      const duplicate = await tx.query<{ id: string }>(
        "SELECT id FROM payment_transactions WHERE idempotency_key = $1",
        [input.idempotencyKey],
      );
      if (duplicate.rows[0]) return { id: duplicate.rows[0].id, duplicate: true };
      const appointmentResult = await tx.query<{ price_minor: number; status: string }>(
        "SELECT price_minor, status FROM appointments WHERE id = $1 FOR UPDATE",
        [input.appointmentId],
      );
      const appointment = appointmentResult.rows[0];
      if (!appointment || ["cancelled", "declined", "expired"].includes(appointment.status))
        return { error: "This appointment cannot accept payments." };
      const totals = await tx.query<{ net_minor: string | number }>(
        "SELECT coalesce(sum(CASE WHEN kind = 'payment' THEN amount_minor ELSE -amount_minor END), 0)::bigint AS net_minor FROM payment_transactions WHERE appointment_id = $1",
        [input.appointmentId],
      );
      const paid = Number(totals.rows[0]?.net_minor ?? 0);
      if (
        (input.kind === "payment" && paid + input.amountMinor > appointment.price_minor) ||
        (input.kind === "refund" && input.amountMinor > paid)
      ) {
        return {
          error:
            input.kind === "refund"
              ? "Refund exceeds the amount received."
              : "Payment exceeds the remaining balance.",
        };
      }
      const inserted = await tx.query<{ id: string }>(
        `INSERT INTO payment_transactions (appointment_id, kind, amount_minor, occurred_at, method, note, idempotency_key, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (idempotency_key) DO NOTHING RETURNING id`,
        [
          input.appointmentId,
          input.kind,
          input.amountMinor,
          occurredAt.toISOString(),
          input.method,
          input.note,
          input.idempotencyKey,
          owner.id,
        ],
      );
      const id =
        inserted.rows[0]?.id ??
        (
          await tx.query<{ id: string }>(
            "SELECT id FROM payment_transactions WHERE idempotency_key = $1",
            [input.idempotencyKey],
          )
        ).rows[0]?.id;
      if (!id) throw new Error("Payment transaction insert failed.");
      if (inserted.rows[0])
        await tx.query(
          "INSERT INTO audit_events (actor_id, action, entity_type, entity_id, details) VALUES ($1, $2, 'payment', $3, $4::jsonb)",
          [
            owner.id,
            `payment.${input.kind}`,
            id,
            JSON.stringify({ appointmentId: input.appointmentId, amountMinor: input.amountMinor }),
          ],
        );
      return { id, duplicate: !inserted.rows[0] };
    });
    return "error" in result
      ? json({ error: result.error }, 409)
      : json({ ok: true, id: result.id }, result.duplicate ? 200 : 201);
  }

  if (input.action === "correctPayment") {
    if (!validDate(input.date)) return badRequest("Choose a valid payment date.");
    const outcome = await client.transaction(async (tx) => {
      const duplicate = await tx.query<{ id: string }>(
        "SELECT id FROM payment_transactions WHERE idempotency_key = $1",
        [input.idempotencyKey],
      );
      if (duplicate.rows[0]) return { ok: true as const };
      const old = await tx.query<{
        appointment_id: string;
        amount_minor: number;
        kind: string;
        occurred_at: string;
        method: string;
        note: string;
      }>(
        "SELECT appointment_id, amount_minor, kind, occurred_at, method, note FROM payment_transactions WHERE id = $1 FOR UPDATE",
        [input.id],
      );
      const payment = old.rows[0];
      if (!payment) return { error: "Payment not found." };
      const appointment = await tx.query<{ price_minor: number }>(
        "SELECT price_minor FROM appointments WHERE id = $1 FOR UPDATE",
        [payment.appointment_id],
      );
      const totals = await tx.query<{ net_minor: string | number }>(
        "SELECT coalesce(sum(CASE WHEN kind = 'payment' THEN amount_minor ELSE -amount_minor END), 0)::bigint AS net_minor FROM payment_transactions WHERE appointment_id = $1",
        [payment.appointment_id],
      );
      const sign = payment.kind === "payment" ? 1 : -1;
      const nextNet =
        Number(totals.rows[0]?.net_minor ?? 0) -
        sign * payment.amount_minor +
        sign * input.amountMinor;
      if (nextNet < 0 || nextNet > (appointment.rows[0]?.price_minor ?? 0))
        return { error: "That correction would exceed the appointment's booked amount." };
      await tx.query(
        "INSERT INTO payment_transactions (appointment_id, kind, amount_minor, occurred_at, method, note, idempotency_key, correction_of, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
        [
          payment.appointment_id,
          payment.kind === "payment" ? "refund" : "payment",
          payment.amount_minor,
          new Date().toISOString(),
          payment.method,
          "Correction reversal",
          crypto.randomUUID(),
          input.id,
          owner.id,
        ],
      );
      await tx.query(
        "INSERT INTO payment_transactions (appointment_id, kind, amount_minor, occurred_at, method, note, idempotency_key, correction_of, created_by) VALUES ($1,$2,$3,$4,$5,'Corrected entry',$6,$7,$8)",
        [
          payment.appointment_id,
          payment.kind,
          input.amountMinor,
          fromZonedTime(`${input.date}T12:00:00`, TZ).toISOString(),
          input.method,
          input.idempotencyKey,
          input.id,
          owner.id,
        ],
      );
      await tx.query(
        "INSERT INTO audit_events (actor_id, action, entity_type, entity_id) VALUES ($1, 'payment.corrected', 'payment', $2)",
        [owner.id, input.id],
      );
      return { ok: true as const };
    });
    return "error" in outcome ? json({ error: outcome.error }, 409) : json(outcome);
  }

  return badRequest("Unsupported action.");
}

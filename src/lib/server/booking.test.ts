// @vitest-environment node
import { addDays } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const SERVICE_ID = "00000000-0000-4000-8000-000000000001";
const TIMEZONE = "Europe/Sofia";
let dataDir = "";
let client: Awaited<ReturnType<(typeof import("./db"))["getDatabase"]>>["client"];
let createBooking: (typeof import("./booking"))["createBooking"];
let availableTimes: (typeof import("./booking"))["availableTimes"];
let rescheduleBooking: (typeof import("./booking"))["rescheduleBooking"];
let createBookingResponse: (typeof import("./api"))["createBookingResponse"];
let getAdminStateResponse: (typeof import("./api"))["getAdminStateResponse"];
let updateAdminResponse: (typeof import("./api"))["updateAdminResponse"];
let ownerCookie = "";
let ownerEmail = "";
const appUrl = "http://localhost:3000";

const testDate = () => formatInTimeZone(addDays(new Date(), 14), TIMEZONE, "yyyy-MM-dd");

async function requestBooking(date: string, time: string) {
  return createBooking({
    name: "Test Client",
    phone: "+359 88 123 4567",
    serviceId: SERVICE_ID,
    date,
    time,
  });
}

beforeAll(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "aleksova-pglite-test-"));
  process.env["PGLITE_DATA_DIR"] = dataDir;
  process.env["OWNER_EMAIL"] = "";
  const database = await import("./db");
  const booking = await import("./booking");
  const api = await import("./api");
  client = (await database.getDatabase()).client;
  createBooking = booking.createBooking;
  availableTimes = booking.availableTimes;
  rescheduleBooking = booking.rescheduleBooking;
  createBookingResponse = api.createBookingResponse;
  getAdminStateResponse = api.getAdminStateResponse;
  updateAdminResponse = api.updateAdminResponse;

  ownerEmail = `owner-${randomUUID()}@example.invalid`;
  process.env["APP_URL"] = appUrl;
  process.env["BETTER_AUTH_SECRET"] = randomBytes(32).toString("base64url");
  process.env["OWNER_EMAIL"] = ownerEmail;
  process.env["OWNER_SETUP"] = "1";
  const { getAuth } = await import("./auth");
  const auth = await getAuth();
  const signUp = await auth.handler(
    new Request(`${appUrl}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { origin: appUrl, "content-type": "application/json" },
      body: JSON.stringify({
        name: "Test Owner",
        email: ownerEmail,
        password: `${randomBytes(24).toString("base64url")}Aa1!`,
      }),
    }),
  );
  if (!signUp.ok) throw new Error(`Temporary test owner setup failed: ${await signUp.text()}`);
  ownerCookie = signUp.headers.get("set-cookie")?.split(";")[0] ?? "";
  if (!ownerCookie) throw new Error("Better Auth did not set a test session cookie.");
  process.env["OWNER_SETUP"] = "0";

  await client.query(
    `INSERT INTO services (id, name, description, price_minor, duration_minutes, buffer_minutes)
     VALUES ($1, 'Test Lashes', 'Test fixture', 6000, 60, 15)`,
    [SERVICE_ID],
  );
  for (let weekday = 0; weekday < 7; weekday += 1) {
    await client.query(
      "INSERT INTO working_hours (weekday, is_open, start_minute, end_minute, breaks) VALUES ($1, true, 540, 1080, '[]'::jsonb)",
      [weekday],
    );
  }
  await client.query(
    "INSERT INTO business_settings (id, min_notice_hours, booking_horizon_days, pending_expiry_minutes, default_buffer_minutes) VALUES (1, 0, 90, 60, 10)",
  );
});

beforeEach(async () => {
  await client.query("DELETE FROM audit_events");
  await client.query("DELETE FROM payment_transactions");
  await client.query("DELETE FROM appointments");
  await client.query("DELETE FROM clients");
  await client.query("DELETE FROM blocked_periods");
  await client.query("DELETE FROM date_exceptions");
  await client.query(
    "UPDATE services SET name = 'Test Lashes', price_minor = 6000, duration_minutes = 60, buffer_minutes = 15 WHERE id = $1",
    [SERVICE_ID],
  );
  await client.query(
    "UPDATE business_settings SET min_notice_hours = 0, booking_horizon_days = 90, pending_expiry_minutes = 60, default_buffer_minutes = 10 WHERE id = 1",
  );
});

afterAll(async () => {
  const database = await import("./db");
  await database.closeDatabase();
  if (dataDir) await rm(dataDir, { recursive: true, force: true });
  delete process.env["PGLITE_DATA_DIR"];
  delete process.env["BETTER_AUTH_SECRET"];
  delete process.env["APP_URL"];
  delete process.env["OWNER_EMAIL"];
  delete process.env["OWNER_SETUP"];
});

async function ownerPost(body: unknown) {
  return updateAdminResponse(
    new Request(`${appUrl}/api/admin`, {
      method: "POST",
      headers: { origin: appUrl, cookie: ownerCookie, "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

async function ownerGet() {
  return getAdminStateResponse(
    new Request(`${appUrl}/api/admin`, { headers: { cookie: ownerCookie } }),
  );
}

describe("database-backed booking", () => {
  it("reserves a pending request and its service buffer", async () => {
    const date = testDate();
    const created = await requestBooking(date, "10:00");
    expect(created.ok).toBe(true);
    const localSlots = (await availableTimes(date, SERVICE_ID)).map((slot) =>
      formatInTimeZone(new Date(slot), TIMEZONE, "HH:mm"),
    );
    expect(localSlots).not.toContain("10:00");
    expect(localSlots).not.toContain("11:00");
    expect(localSlots).toContain("11:15");
  });

  it("allows only one of two concurrent overlapping requests", async () => {
    const date = testDate();
    const results = await Promise.all([
      requestBooking(date, "12:00"),
      requestBooking(date, "12:00"),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
  });

  it("releases expired pending requests without waiting for a cleanup job", async () => {
    const date = testDate();
    const first = await requestBooking(date, "10:00");
    if (!first.ok) throw new Error("Initial booking failed.");
    await client.query(
      "UPDATE appointments SET pending_expires_at = now() - interval '1 minute' WHERE id = $1",
      [first.id],
    );
    const slots = await availableTimes(date, SERVICE_ID);
    expect(
      slots.some((slot) => formatInTimeZone(new Date(slot), TIMEZONE, "HH:mm") === "10:00"),
    ).toBe(true);
    await ownerGet();
    const replacement = await requestBooking(date, "10:00");
    expect(replacement.ok).toBe(true);
    const old = await client.query<{ status: string }>(
      "SELECT status FROM appointments WHERE id = $1",
      [first.id],
    );
    expect(old.rows[0]?.status).toBe("expired");
  });

  it("does not offer blocked periods", async () => {
    const date = testDate();
    const start = fromZonedTime(`${date}T10:00:00`, TIMEZONE);
    const end = fromZonedTime(`${date}T12:00:00`, TIMEZONE);
    await client.query(
      "INSERT INTO blocked_periods (start_at, end_at, reason) VALUES ($1,$2,'test')",
      [start.toISOString(), end.toISOString()],
    );
    const localSlots = (await availableTimes(date, SERVICE_ID)).map((slot) =>
      formatInTimeZone(new Date(slot), TIMEZONE, "HH:mm"),
    );
    expect(localSlots).not.toContain("10:00");
    expect(localSlots).not.toContain("11:00");
    expect(await requestBooking(date, "10:00")).toMatchObject({ ok: false, reason: "unavailable" });
  });

  it("keeps the original appointment when rescheduling to an occupied slot fails", async () => {
    const date = testDate();
    const original = await requestBooking(date, "10:00");
    const other = await requestBooking(date, "13:00");
    if (!original.ok || !other.ok) throw new Error("Fixture bookings failed.");
    const result = await rescheduleBooking(original.id, date, "13:00", null);
    expect(result.ok).toBe(false);
    const retained = await client.query<{ start_at: string }>(
      "SELECT start_at FROM appointments WHERE id = $1",
      [original.id],
    );
    expect(formatInTimeZone(new Date(retained.rows[0]!.start_at), TIMEZONE, "HH:mm")).toBe("10:00");
  });

  it("preserves booked price and duration after the service is edited", async () => {
    const result = await requestBooking(testDate(), "10:00");
    if (!result.ok) throw new Error("Fixture booking failed.");
    await client.query(
      "UPDATE services SET price_minor = 9000, duration_minutes = 90 WHERE id = $1",
      [SERVICE_ID],
    );
    const snapshot = await client.query<{ price_minor: number; duration_minutes: number }>(
      "SELECT price_minor, duration_minutes FROM appointments WHERE id = $1",
      [result.id],
    );
    expect(snapshot.rows[0]).toEqual({ price_minor: 6000, duration_minutes: 60 });
  });

  it("shows public requests to the owner and applies allowed status transitions", async () => {
    const date = testDate();
    const publicResponse = await createBookingResponse(
      new Request(`${appUrl}/api/bookings`, {
        method: "POST",
        headers: {
          origin: appUrl,
          "content-type": "application/json",
          "x-forwarded-for": randomUUID(),
        },
        body: JSON.stringify({
          name: "Website Client",
          phone: "+359 88 123 4567",
          serviceId: SERVICE_ID,
          date,
          time: "10:00",
        }),
      }),
    );
    expect(publicResponse.status).toBe(201);
    const stateResponse = await ownerGet();
    const state = (await stateResponse.json()) as {
      appointments: { id: string; status: string; clientName: string }[];
    };
    const request = state.appointments[0];
    expect(request).toMatchObject({ status: "pending", clientName: "Website Client" });
    const approval = await ownerPost({ action: "status", id: request!.id, status: "confirmed" });
    expect(approval.status).toBe(200);
    const invalidTransition = await ownerPost({
      action: "status",
      id: request!.id,
      status: "declined",
    });
    expect(invalidTransition.status).toBe(409);
    await ownerGet();
    const declined = await requestBooking(date, "13:00");
    if (!declined.ok) throw new Error("Second fixture booking failed.");
    expect(
      (await ownerPost({ action: "status", id: declined.id, status: "declined" })).status,
    ).toBe(200);
    const slots = (await availableTimes(date, SERVICE_ID)).map((slot) =>
      formatInTimeZone(new Date(slot), TIMEZONE, "HH:mm"),
    );
    expect(slots).toContain("13:00");
    expect(
      (await ownerPost({ action: "status", id: request!.id, status: "cancelled" })).status,
    ).toBe(200);
    expect(
      (await availableTimes(date, SERVICE_ID)).some(
        (slot) => formatInTimeZone(new Date(slot), TIMEZONE, "HH:mm") === "10:00",
      ),
    ).toBe(true);
  });

  it("records partial payments, idempotent retries, refunds, and corrections", async () => {
    const booking = await requestBooking(testDate(), "10:00");
    if (!booking.ok) throw new Error("Fixture booking failed.");
    const firstKey = randomUUID();
    const firstPayment = {
      action: "payment",
      idempotencyKey: firstKey,
      appointmentId: booking.id,
      kind: "payment",
      amountMinor: 3000,
      date: testDate(),
      method: "cash",
      note: "deposit",
    };
    const first = await ownerPost(firstPayment);
    const retry = await ownerPost(firstPayment);
    expect(first.status).toBe(201);
    expect(retry.status).toBe(200);
    const firstResult = (await first.json()) as { id: string };
    const second = await ownerPost({
      ...firstPayment,
      idempotencyKey: randomUUID(),
      amountMinor: 3000,
    });
    expect(second.status).toBe(201);
    expect(
      (await ownerPost({ ...firstPayment, idempotencyKey: randomUUID(), amountMinor: 1 })).status,
    ).toBe(409);
    const refund = await ownerPost({
      ...firstPayment,
      idempotencyKey: randomUUID(),
      kind: "refund",
      amountMinor: 1500,
    });
    expect(refund.status).toBe(201);
    expect(
      (
        await ownerPost({
          ...firstPayment,
          idempotencyKey: randomUUID(),
          kind: "refund",
          amountMinor: 4501,
        })
      ).status,
    ).toBe(409);
    const correction = await ownerPost({
      action: "correctPayment",
      id: firstResult.id,
      idempotencyKey: randomUUID(),
      amountMinor: 3500,
      date: testDate(),
      method: "card",
    });
    expect(correction.status).toBe(200);
    const total = await client.query<{ net_minor: string }>(
      "SELECT sum(CASE WHEN kind = 'payment' THEN amount_minor ELSE -amount_minor END)::text AS net_minor FROM payment_transactions WHERE appointment_id = $1",
      [booking.id],
    );
    expect(Number(total.rows[0]?.net_minor)).toBe(5000);
  });

  it("rejects unauthenticated admin reads and actions and cross-origin booking writes", async () => {
    const savedOwnerEmail = process.env["OWNER_EMAIL"];
    process.env["OWNER_EMAIL"] = "";
    const get = await getAdminStateResponse(new Request("http://localhost/api/admin"));
    const action = await updateAdminResponse(
      new Request("http://localhost/api/admin", { method: "POST", body: "{}" }),
    );
    const booking = await createBookingResponse(
      new Request("http://localhost/api/bookings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
    );
    process.env["OWNER_EMAIL"] = savedOwnerEmail;
    expect(get.status).toBe(401);
    expect(action.status).toBe(401);
    expect(booking.status).toBe(403);
  });

  it("persists appointments after closing and reopening the database", async () => {
    const created = await requestBooking(testDate(), "10:00");
    if (!created.ok) throw new Error("Fixture booking failed.");
    const database = await import("./db");
    await database.closeDatabase();
    client = (await database.getDatabase()).client;
    const persisted = await client.query<{ id: string }>(
      "SELECT id FROM appointments WHERE id = $1",
      [created.id],
    );
    expect(persisted.rows).toHaveLength(1);
  });
});

import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const createdAt = () => timestamp("createdAt", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updatedAt", { withTimezone: true }).notNull().defaultNow();

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("emailVerified").notNull().default(false),
  image: text("image"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    ipAddress: text("ipAddress"),
    userAgent: text("userAgent"),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_user_id_idx").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("accountId").notNull(),
    providerId: text("providerId").notNull(),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("accessToken"),
    refreshToken: text("refreshToken"),
    idToken: text("idToken"),
    accessTokenExpiresAt: timestamp("accessTokenExpiresAt", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("account_user_id_idx").on(table.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const clients = pgTable(
  "clients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    phone: text("phone").notNull(),
    email: text("email"),
    createdAt: createdAt(),
  },
  (table) => [index("clients_phone_idx").on(sql`lower(${table.phone})`)],
);

export const services = pgTable(
  "services",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    priceMinor: integer("price_minor").notNull(),
    durationMinutes: integer("duration_minutes").notNull(),
    bufferMinutes: integer("buffer_minutes"),
    bookable: boolean("bookable").notNull().default(true),
    archived: boolean("archived").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    check("services_price_nonnegative", sql`${table.priceMinor} >= 0`),
    check("services_duration_positive", sql`${table.durationMinutes} BETWEEN 5 AND 600`),
    check(
      "services_buffer_valid",
      sql`${table.bufferMinutes} IS NULL OR ${table.bufferMinutes} BETWEEN 0 AND 120`,
    ),
  ],
);

export const workingHours = pgTable(
  "working_hours",
  {
    weekday: integer("weekday").primaryKey(),
    isOpen: boolean("is_open").notNull(),
    startMinute: integer("start_minute").notNull(),
    endMinute: integer("end_minute").notNull(),
    breaks: jsonb("breaks").notNull().default([]),
  },
  (table) => [
    check("working_hours_weekday_valid", sql`${table.weekday} BETWEEN 0 AND 6`),
    check(
      "working_hours_range_valid",
      sql`${table.startMinute} >= 0 AND ${table.endMinute} <= 1440 AND ${table.endMinute} > ${table.startMinute}`,
    ),
  ],
);

export const dateExceptions = pgTable(
  "date_exceptions",
  {
    date: date("date").primaryKey(),
    isClosed: boolean("is_closed").notNull().default(false),
    startMinute: integer("start_minute"),
    endMinute: integer("end_minute"),
    breaks: jsonb("breaks").notNull().default([]),
    note: text("note").notNull().default(""),
  },
  (table) => [
    check(
      "date_exception_range_valid",
      sql`${table.isClosed} OR (${table.startMinute} BETWEEN 0 AND 1439 AND ${table.endMinute} BETWEEN 1 AND 1440 AND ${table.endMinute} > ${table.startMinute})`,
    ),
  ],
);

export const blockedPeriods = pgTable(
  "blocked_periods",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }).notNull(),
    reason: text("reason").notNull().default(""),
    createdAt: createdAt(),
  },
  (table) => [check("blocked_period_range_valid", sql`${table.endAt} > ${table.startAt}`)],
);

export const appointments = pgTable(
  "appointments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id),
    serviceName: text("service_name").notNull(),
    priceMinor: integer("price_minor").notNull(),
    durationMinutes: integer("duration_minutes").notNull(),
    bufferMinutes: integer("buffer_minutes").notNull(),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }).notNull(),
    reservedUntil: timestamp("reserved_until", { withTimezone: true }).notNull(),
    pendingExpiresAt: timestamp("pending_expires_at", { withTimezone: true }),
    status: text("status").notNull(),
    source: text("source").notNull(),
    notes: text("notes").notNull().default(""),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    check("appointments_price_nonnegative", sql`${table.priceMinor} >= 0`),
    check("appointments_duration_positive", sql`${table.durationMinutes} > 0`),
    check("appointments_buffer_nonnegative", sql`${table.bufferMinutes} >= 0`),
    check(
      "appointments_range_valid",
      sql`${table.endAt} > ${table.startAt} AND ${table.reservedUntil} >= ${table.endAt}`,
    ),
    check(
      "appointments_status_valid",
      sql`${table.status} IN ('pending', 'confirmed', 'completed', 'cancelled', 'declined', 'no_show', 'expired')`,
    ),
    check(
      "appointments_source_valid",
      sql`${table.source} IN ('website', 'instagram', 'phone', 'other')`,
    ),
    index("appointments_start_idx").on(table.startAt),
    index("appointments_status_expiry_idx").on(table.status, table.pendingExpiresAt),
  ],
);

export const paymentTransactions = pgTable(
  "payment_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    appointmentId: uuid("appointment_id")
      .notNull()
      .references(() => appointments.id),
    kind: text("kind").notNull(),
    amountMinor: integer("amount_minor").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    method: text("method").notNull(),
    note: text("note").notNull().default(""),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    correctionOf: uuid("correction_of"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (table) => [
    check("payment_amount_positive", sql`${table.amountMinor} > 0`),
    check("payment_kind_valid", sql`${table.kind} IN ('payment', 'refund')`),
    check("payment_method_valid", sql`${table.method} IN ('cash', 'card', 'bank', 'other')`),
    index("payment_appointment_idx").on(table.appointmentId),
    index("payment_date_idx").on(table.occurredAt),
  ],
);

export const businessSettings = pgTable(
  "business_settings",
  {
    id: integer("id").primaryKey().default(1),
    timezone: text("timezone").notNull().default("Europe/Sofia"),
    currency: text("currency").notNull().default("EUR"),
    minNoticeHours: integer("min_notice_hours").notNull().default(12),
    bookingHorizonDays: integer("booking_horizon_days").notNull().default(90),
    pendingExpiryMinutes: integer("pending_expiry_minutes").notNull().default(60),
    defaultBufferMinutes: integer("default_buffer_minutes").notNull().default(10),
  },
  (table) => [
    check("business_settings_singleton", sql`${table.id} = 1`),
    check("business_settings_notice_valid", sql`${table.minNoticeHours} BETWEEN 0 AND 720`),
    check("business_settings_horizon_valid", sql`${table.bookingHorizonDays} BETWEEN 1 AND 365`),
    check("business_settings_expiry_valid", sql`${table.pendingExpiryMinutes} BETWEEN 5 AND 10080`),
  ],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    details: jsonb("details").notNull().default({}),
    createdAt: createdAt(),
  },
  (table) => [index("audit_events_created_idx").on(table.createdAt)],
);

export const schema = { user, session, account, verification };

CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"accountId" text NOT NULL,
	"providerId" text NOT NULL,
	"userId" text NOT NULL,
	"accessToken" text,
	"refreshToken" text,
	"idToken" text,
	"accessTokenExpiresAt" timestamp with time zone,
	"refreshTokenExpiresAt" timestamp with time zone,
	"scope" text,
	"password" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appointments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"service_name" text NOT NULL,
	"price_minor" integer NOT NULL,
	"duration_minutes" integer NOT NULL,
	"buffer_minutes" integer NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"reserved_until" timestamp with time zone NOT NULL,
	"pending_expires_at" timestamp with time zone,
	"status" text NOT NULL,
	"source" text NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_by" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "appointments_price_nonnegative" CHECK ("appointments"."price_minor" >= 0),
	CONSTRAINT "appointments_duration_positive" CHECK ("appointments"."duration_minutes" > 0),
	CONSTRAINT "appointments_buffer_nonnegative" CHECK ("appointments"."buffer_minutes" >= 0),
	CONSTRAINT "appointments_range_valid" CHECK ("appointments"."end_at" > "appointments"."start_at" AND "appointments"."reserved_until" >= "appointments"."end_at"),
	CONSTRAINT "appointments_status_valid" CHECK ("appointments"."status" IN ('pending', 'confirmed', 'completed', 'cancelled', 'declined', 'no_show')),
	CONSTRAINT "appointments_source_valid" CHECK ("appointments"."source" IN ('website', 'instagram', 'phone', 'other'))
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blocked_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blocked_period_range_valid" CHECK ("blocked_periods"."end_at" > "blocked_periods"."start_at")
);
--> statement-breakpoint
CREATE TABLE "business_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"timezone" text DEFAULT 'Europe/Sofia' NOT NULL,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"min_notice_hours" integer DEFAULT 12 NOT NULL,
	"booking_horizon_days" integer DEFAULT 90 NOT NULL,
	"pending_expiry_minutes" integer DEFAULT 60 NOT NULL,
	"default_buffer_minutes" integer DEFAULT 10 NOT NULL,
	CONSTRAINT "business_settings_singleton" CHECK ("business_settings"."id" = 1),
	CONSTRAINT "business_settings_notice_valid" CHECK ("business_settings"."min_notice_hours" BETWEEN 0 AND 720),
	CONSTRAINT "business_settings_horizon_valid" CHECK ("business_settings"."booking_horizon_days" BETWEEN 1 AND 365),
	CONSTRAINT "business_settings_expiry_valid" CHECK ("business_settings"."pending_expiry_minutes" BETWEEN 5 AND 10080)
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "date_exceptions" (
	"date" date PRIMARY KEY NOT NULL,
	"is_closed" boolean DEFAULT false NOT NULL,
	"start_minute" integer,
	"end_minute" integer,
	"breaks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	CONSTRAINT "date_exception_range_valid" CHECK ("date_exceptions"."is_closed" OR ("date_exceptions"."start_minute" BETWEEN 0 AND 1439 AND "date_exceptions"."end_minute" BETWEEN 1 AND 1440 AND "date_exceptions"."end_minute" > "date_exceptions"."start_minute"))
);
--> statement-breakpoint
CREATE TABLE "payment_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"appointment_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"amount_minor" integer NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"method" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"idempotency_key" text NOT NULL,
	"correction_of" uuid,
	"created_by" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_transactions_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "payment_amount_positive" CHECK ("payment_transactions"."amount_minor" > 0),
	CONSTRAINT "payment_kind_valid" CHECK ("payment_transactions"."kind" IN ('payment', 'refund')),
	CONSTRAINT "payment_method_valid" CHECK ("payment_transactions"."method" IN ('cash', 'card', 'bank', 'other'))
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"price_minor" integer NOT NULL,
	"duration_minutes" integer NOT NULL,
	"buffer_minutes" integer,
	"bookable" boolean DEFAULT true NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "services_price_nonnegative" CHECK ("services"."price_minor" >= 0),
	CONSTRAINT "services_duration_positive" CHECK ("services"."duration_minutes" BETWEEN 5 AND 600),
	CONSTRAINT "services_buffer_valid" CHECK ("services"."buffer_minutes" IS NULL OR "services"."buffer_minutes" BETWEEN 0 AND 120)
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"ipAddress" text,
	"userAgent" text,
	"userId" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"emailVerified" boolean DEFAULT false NOT NULL,
	"image" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "working_hours" (
	"weekday" integer PRIMARY KEY NOT NULL,
	"is_open" boolean NOT NULL,
	"start_minute" integer NOT NULL,
	"end_minute" integer NOT NULL,
	"breaks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "working_hours_weekday_valid" CHECK ("working_hours"."weekday" BETWEEN 0 AND 6),
	CONSTRAINT "working_hours_range_valid" CHECK ("working_hours"."start_minute" >= 0 AND "working_hours"."end_minute" <= 1440 AND "working_hours"."end_minute" > "working_hours"."start_minute")
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "appointments_start_idx" ON "appointments" USING btree ("start_at");--> statement-breakpoint
CREATE INDEX "appointments_status_expiry_idx" ON "appointments" USING btree ("status","pending_expires_at");--> statement-breakpoint
CREATE INDEX "audit_events_created_idx" ON "audit_events" USING btree ("createdAt");--> statement-breakpoint
CREATE INDEX "clients_phone_idx" ON "clients" USING btree (lower("phone"));--> statement-breakpoint
CREATE INDEX "payment_appointment_idx" ON "payment_transactions" USING btree ("appointment_id");--> statement-breakpoint
CREATE INDEX "payment_date_idx" ON "payment_transactions" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");
ALTER TABLE "appointments"
ADD CONSTRAINT "appointments_reserved_slot_excl"
EXCLUDE USING gist (
	tstzrange("start_at", "reserved_until", '[)') WITH &&
)
WHERE ("status" IN ('pending', 'confirmed'));
--> statement-breakpoint
CREATE INDEX "blocked_periods_range_idx"
ON "blocked_periods" USING gist (tstzrange("start_at", "end_at", '[)'));
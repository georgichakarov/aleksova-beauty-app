import { createFileRoute } from "@tanstack/react-router";
import { createBookingResponse } from "@/lib/server/api";

export const Route = createFileRoute("/api/bookings")({
  server: { handlers: { POST: ({ request }) => createBookingResponse(request) } },
});

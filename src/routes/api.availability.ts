import { createFileRoute } from "@tanstack/react-router";
import { getAvailabilityResponse } from "@/lib/server/api";

export const Route = createFileRoute("/api/availability")({
  server: { handlers: { GET: ({ request }) => getAvailabilityResponse(request) } },
});

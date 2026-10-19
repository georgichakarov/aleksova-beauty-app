import { createFileRoute } from "@tanstack/react-router";
import { getSessionResponse } from "@/lib/server/api";

export const Route = createFileRoute("/api/session")({
  server: { handlers: { GET: ({ request }) => getSessionResponse(request) } },
});

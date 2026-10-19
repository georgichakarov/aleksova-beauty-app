import { createFileRoute } from "@tanstack/react-router";
import { getAdminStateResponse, updateAdminResponse } from "@/lib/server/api";

export const Route = createFileRoute("/api/admin")({
  server: {
    handlers: {
      GET: ({ request }) => getAdminStateResponse(request),
      POST: ({ request }) => updateAdminResponse(request),
    },
  },
});

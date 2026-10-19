import { createFileRoute } from "@tanstack/react-router";
import { getServicesResponse } from "@/lib/server/api";

export const Route = createFileRoute("/api/services")({
  server: { handlers: { GET: () => getServicesResponse() } },
});

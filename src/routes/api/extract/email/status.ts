import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/extract/email/status")({
  server: {
    handlers: {
      GET: async () => {
        const { GET } = await import("@/app/api/extract/email/status/route");
        return GET();
      },
    },
  },
});

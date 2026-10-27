import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/extract/email/check-new")({
  server: {
    handlers: {
      GET: async () => {
        const { GET } = await import("@/app/api/extract/email/check-new/route");
        return GET();
      },
    },
  },
});

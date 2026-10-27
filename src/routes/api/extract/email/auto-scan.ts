import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/extract/email/auto-scan")({
  server: {
    handlers: {
      GET: async () => {
        const { GET } = await import("@/app/api/extract/email/auto-scan/route");
        return GET();
      },
      POST: async ({ request }) => {
        const { POST } = await import("@/app/api/extract/email/auto-scan/route");
        return POST(request);
      },
    },
  },
});

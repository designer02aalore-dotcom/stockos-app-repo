import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/extract/email/webhook")({
  server: {
    handlers: {
      GET: async () => {
        const { GET } = await import("@/app/api/extract/email/webhook/route");
        return GET();
      },
      POST: async ({ request }) => {
        const { POST } = await import("@/app/api/extract/email/webhook/route");
        return POST(request);
      },
    },
  },
});

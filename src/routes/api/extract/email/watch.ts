import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/extract/email/watch")({
  server: {
    handlers: {
      GET: async () => {
        const { GET } = await import("@/app/api/extract/email/watch/route");
        return GET();
      },
      POST: async ({ request }) => {
        const { POST } = await import("@/app/api/extract/email/watch/route");
        return POST(request);
      },
    },
  },
});

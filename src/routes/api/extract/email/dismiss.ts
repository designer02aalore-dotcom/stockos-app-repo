import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/extract/email/dismiss")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { POST } = await import("@/app/api/extract/email/dismiss/route");
        return POST(request);
      },
    },
  },
});

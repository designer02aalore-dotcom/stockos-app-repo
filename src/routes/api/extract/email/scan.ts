import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/extract/email/scan")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { POST } = await import("@/app/api/extract/email/scan/route");
        return POST(request);
      },
    },
  },
});

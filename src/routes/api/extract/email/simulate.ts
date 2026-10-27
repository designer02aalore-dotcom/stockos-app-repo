import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/extract/email/simulate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { POST } = await import("@/app/api/extract/email/simulate/route");
        return POST(request);
      },
    },
  },
});

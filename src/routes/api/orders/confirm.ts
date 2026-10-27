import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/orders/confirm")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { POST } = await import("@/app/api/orders/confirm/route");
        return POST(request);
      },
    },
  },
});

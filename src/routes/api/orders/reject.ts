import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/orders/reject")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { POST } = await import("@/app/api/orders/reject/route");
        return POST(request);
      },
    },
  },
});

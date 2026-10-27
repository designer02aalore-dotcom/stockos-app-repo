import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/orders/re-extract")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { POST } = await import("@/app/api/orders/re-extract/route");
        return POST(request);
      },
    },
  },
});

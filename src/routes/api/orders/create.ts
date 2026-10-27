import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/orders/create")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { GET } = await import("@/app/api/orders/create/route");
        return GET(request);
      },
      POST: async ({ request }) => {
        const { POST } = await import("@/app/api/orders/create/route");
        return POST(request);
      },
    },
  },
});

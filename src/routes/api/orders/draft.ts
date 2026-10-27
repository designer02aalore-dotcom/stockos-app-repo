import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/orders/draft")({
  server: {
    handlers: {
      GET: async () => {
        const { GET } = await import("@/app/api/orders/draft/route");
        return GET();
      },
    },
  },
});

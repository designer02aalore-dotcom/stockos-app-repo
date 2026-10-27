import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/match/items")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { GET } = await import("@/app/api/match/items/route");
        return GET(request);
      },
      POST: async ({ request }) => {
        const { POST } = await import("@/app/api/match/items/route");
        return POST(request);
      },
    },
  },
});

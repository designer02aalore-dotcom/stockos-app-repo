import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/related-items")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { GET } = await import("@/app/api/related-items/route");
        return GET(request);
      },
      POST: async ({ request }) => {
        const { POST } = await import("@/app/api/related-items/route");
        return POST(request);
      },
    },
  },
});

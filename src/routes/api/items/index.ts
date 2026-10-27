import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/items/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { GET } = await import("@/app/api/items/route");
        return GET(request);
      },
      POST: async ({ request }) => {
        const { POST } = await import("@/app/api/items/route");
        return POST(request);
      },
      PUT: async ({ request }) => {
        const { PUT } = await import("@/app/api/items/route");
        return PUT(request);
      },
      DELETE: async ({ request }) => {
        const { DELETE } = await import("@/app/api/items/route");
        return DELETE(request);
      },
    },
  },
});

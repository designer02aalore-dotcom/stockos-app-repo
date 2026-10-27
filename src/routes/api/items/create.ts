import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/items/create")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { POST } = await import("@/app/api/items/create/route");
        return POST(request);
      },
    },
  },
});

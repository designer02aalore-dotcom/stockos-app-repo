import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/additional-options")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { GET } = await import("@/app/api/additional-options/route");
        return GET(request);
      },
      POST: async ({ request }) => {
        const { POST } = await import("@/app/api/additional-options/route");
        return POST(request);
      },
    },
  },
});

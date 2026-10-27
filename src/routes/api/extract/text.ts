import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/extract/text")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { POST } = await import("@/app/api/extract/text/route");
        return POST(request);
      },
    },
  },
});

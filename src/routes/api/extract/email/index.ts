import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/extract/email/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { GET } = await import("@/app/api/extract/email/route");
        return GET(request);
      },
    },
  },
});

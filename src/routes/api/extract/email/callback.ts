import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/extract/email/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { GET } = await import("@/app/api/extract/email/callback/route");
        return GET(request);
      },
    },
  },
});

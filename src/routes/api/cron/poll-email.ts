import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/cron/poll-email")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { GET } = await import("@/app/api/cron/poll-email/route");
        return GET(request);
      },
    },
  },
});

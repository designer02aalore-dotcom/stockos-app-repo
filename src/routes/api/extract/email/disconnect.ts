import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/extract/email/disconnect")({
  server: {
    handlers: {
      POST: async () => {
        const { POST } = await import("@/app/api/extract/email/disconnect/route");
        return POST();
      },
    },
  },
});

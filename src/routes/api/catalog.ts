import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/catalog")({
  server: {
    handlers: {
      GET: async () => {
        const { GET } = await import("@/app/api/catalog/route");
        return GET();
      },
    },
  },
});

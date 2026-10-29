import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/order")({
  beforeLoad: () => {
    throw redirect({ to: "/orders" });
  },
});

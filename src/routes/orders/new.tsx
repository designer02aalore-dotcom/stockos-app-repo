import { createFileRoute } from "@tanstack/react-router";
import NewOrderPage from "@/app/orders/new/page";

export const Route = createFileRoute("/orders/new")({
  component: NewOrderPage,
});

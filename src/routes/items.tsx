import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { createAdminClient } from "@/lib/supabase/admin";
import { ItemsManagement, CatalogItem } from "@/components/items/ItemsManagement";

const getItemsData = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("items")
      .select("id, name, code, barcode, descriptions, unit, price, weight, is_deleted")
      .eq("is_deleted", false)
      .order("name", { ascending: true });

    if (error) {
      console.error("[src/routes/items] Error fetching items:", error);
      return { items: [] as CatalogItem[] };
    }

    return { items: (data || []) as CatalogItem[] };
  } catch (err) {
    console.error("[src/routes/items] Unexpected error:", err);
    return { items: [] as CatalogItem[] };
  }
});

export const Route = createFileRoute("/items")({
  loader: () => getItemsData(),
  component: ItemsPage,
});

function ItemsPage() {
  const { items } = Route.useLoaderData();
  return <ItemsManagement initialItems={items} />;
}

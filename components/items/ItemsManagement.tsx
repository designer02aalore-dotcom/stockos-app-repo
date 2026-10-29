import React, { useState, useMemo } from "react";
import { Link } from "@/lib/router";
import { formatINR } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  Package,
  Search,
  Plus,
  Edit3,
  Trash2,
  Check,
  X,
  Loader2,
  AlertCircle,
  Tag,
  Barcode,
  ArrowLeft,
  Sparkles,
  Layers,
  IndianRupee,
  RefreshCw,
  CheckCircle2,
} from "lucide-react";

export interface CatalogItem {
  id: string;
  name: string;
  code?: string | null;
  barcode?: string | null;
  descriptions?: string | null;
  unit?: string | null;
  price?: number | null;
  weight?: number | null;
  is_deleted?: boolean;
}

interface ItemsManagementProps {
  initialItems: CatalogItem[];
}

export function ItemsManagement({ initialItems }: ItemsManagementProps) {
  const [items, setItems] = useState<CatalogItem[]>(initialItems);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMode, setFilterMode] = useState<"all" | "priced" | "missing_price" | "has_sku">("all");

  // Notification notices
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);

  // Add / Edit Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<CatalogItem | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Form Fields
  const [formName, setFormName] = useState("");
  const [formCode, setFormCode] = useState("");
  const [formUnit, setFormUnit] = useState("PCS");
  const [formPrice, setFormPrice] = useState<string>("");
  const [formBarcode, setFormBarcode] = useState("");
  const [formDescriptions, setFormDescriptions] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  // Delete Confirmation Modal State
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<CatalogItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Open modal for New Item
  const handleOpenAddModal = () => {
    setEditingItem(null);
    setFormName("");
    setFormCode("");
    setFormUnit("PCS");
    setFormPrice("");
    setFormBarcode("");
    setFormDescriptions("");
    setFormError(null);
    setIsModalOpen(true);
  };

  // Open modal for Editing Item
  const handleOpenEditModal = (item: CatalogItem) => {
    setEditingItem(item);
    setFormName(item.name || "");
    setFormCode(item.code || "");
    setFormUnit(item.unit || "PCS");
    setFormPrice(item.price != null ? String(item.price) : "");
    setFormBarcode(item.barcode || "");
    setFormDescriptions(item.descriptions || "");
    setFormError(null);
    setIsModalOpen(true);
  };

  // Save (Create or Update) Item
  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      setFormError("Item name is required.");
      return;
    }

    setIsSaving(true);
    setFormError(null);

    const priceNum = formPrice.trim() !== "" ? parseFloat(formPrice) : 0;
    if (isNaN(priceNum) || priceNum < 0) {
      setFormError("Please enter a valid price (greater than or equal to 0).");
      setIsSaving(false);
      return;
    }

    const payload = {
      id: editingItem?.id,
      name: formName.trim(),
      code: formCode.trim() || null,
      unit: formUnit.trim().toUpperCase() || "PCS",
      price: priceNum,
      barcode: formBarcode.trim() || null,
      descriptions: formDescriptions.trim() || formName.trim(),
    };

    try {
      const isEdit = Boolean(editingItem?.id);
      const res = await fetch("/api/items", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Failed to save item.");
      }

      if (isEdit) {
        setItems((prev) =>
          prev.map((it) => (it.id === editingItem!.id ? { ...it, ...data.item } : it))
        );
        setStatusNotice(`Item "${data.item.name}" updated successfully.`);
      } else {
        setItems((prev) => [data.item, ...prev]);
        setStatusNotice(`New item "${data.item.name}" added to catalog.`);
      }

      setIsModalOpen(false);
      setTimeout(() => setStatusNotice(null), 5000);
    } catch (err: any) {
      setFormError(err.message || "Failed to save item.");
    } finally {
      setIsSaving(false);
    }
  };

  // Confirm Delete Item
  const handleDeleteItem = async () => {
    if (!deleteConfirmItem) return;
    setIsDeleting(true);
    setErrorNotice(null);

    try {
      const res = await fetch("/api/items", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: deleteConfirmItem.id }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Failed to delete item.");
      }

      setItems((prev) => prev.filter((it) => it.id !== deleteConfirmItem.id));
      setStatusNotice(`Item "${deleteConfirmItem.name}" deleted from catalog.`);
      setDeleteConfirmItem(null);
      setTimeout(() => setStatusNotice(null), 5000);
    } catch (err: any) {
      setErrorNotice(err.message || "Failed to delete item.");
    } finally {
      setIsDeleting(false);
    }
  };

  // Filtering & Search
  const filteredItems = useMemo(() => {
    let list = [...items];
    const q = searchQuery.trim().toLowerCase();

    if (q) {
      list = list.filter(
        (it) =>
          it.name?.toLowerCase().includes(q) ||
          it.code?.toLowerCase().includes(q) ||
          it.descriptions?.toLowerCase().includes(q)
      );
    }

    if (filterMode === "priced") {
      list = list.filter((it) => it.price != null && it.price > 0);
    } else if (filterMode === "missing_price") {
      list = list.filter((it) => it.price == null || it.price === 0);
    } else if (filterMode === "has_sku") {
      list = list.filter((it) => it.code && it.code.trim() !== "");
    }

    return list;
  }, [items, searchQuery, filterMode]);

  // Statistics
  const totalCount = items.length;
  const pricedCount = items.filter((it) => it.price != null && it.price > 0).length;
  const skuCount = items.filter((it) => it.code && it.code.trim() !== "").length;

  return (
    <div className="min-h-screen bg-slate-50/70 dark:bg-slate-950 flex flex-col">
      {/* ========================================================
          1. TOP ENTERPRISE COMMAND BAR
      ======================================================== */}
      <header className="sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 shadow-2xs px-4 sm:px-6 lg:px-8 py-3">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Logo & Operational Status */}
          <div className="flex items-center gap-3">
            <Link
              to="/"
              title="Back to Dashboard"
              className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-200 text-xs font-semibold shadow-2xs transition-all cursor-pointer group shrink-0 active:scale-95"
            >
              <ArrowLeft className="size-3.5 text-slate-500 group-hover:text-slate-900 dark:text-slate-400 dark:group-hover:text-slate-100 transition-transform group-hover:-translate-x-0.5" />
              <span>Back</span>
            </Link>

            <div className="size-9 rounded-xl bg-gradient-to-tr from-indigo-700 via-blue-600 to-sky-500 text-white flex items-center justify-center font-black text-base shadow-sm shrink-0">
              <Package className="size-5" />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-base text-foreground tracking-tight">
                  StockOS
                </span>
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Item Catalog Master
                </span>
                <Badge
                  variant="outline"
                  className="bg-indigo-50 text-indigo-700 border-indigo-300 dark:bg-indigo-950/40 dark:text-indigo-300 text-[10px] h-4.5 px-1.5 font-semibold"
                >
                  <span className="size-1.5 rounded-full bg-indigo-500 mr-1 animate-pulse" />
                  Live Sync
                </Badge>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Manage products, standard rates, SKU identifiers, and catalog matching rules
              </p>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <Link
              to="/orders"
              className={
                buttonVariants({ variant: "outline", size: "sm" }) +
                " gap-1.5 h-8.5 text-xs font-semibold border-slate-300 dark:border-slate-700 hover:bg-slate-50"
              }
            >
              <CheckCircle2 className="size-3.5 text-emerald-600" />
              <span>Orders Queue</span>
            </Link>

            <Button
              type="button"
              onClick={handleOpenAddModal}
              className="gap-1.5 h-8.5 px-3.5 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-xs cursor-pointer"
            >
              <Plus className="size-3.5" />
              <span>+ Add New Item</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 space-y-6 flex-1">
        {/* Alerts / Notifications */}
        {statusNotice && (
          <div className="flex items-center justify-between p-3 px-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-700 rounded-xl text-xs font-semibold text-emerald-800 dark:text-emerald-200 animate-in fade-in duration-200">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-4 text-emerald-600" />
              <span>{statusNotice}</span>
            </div>
            <button
              onClick={() => setStatusNotice(null)}
              className="text-emerald-700 hover:text-emerald-950 text-xs font-bold"
            >
              ✕
            </button>
          </div>
        )}

        {errorNotice && (
          <div className="flex items-center justify-between p-3 px-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-700 rounded-xl text-xs font-semibold text-rose-800 dark:text-rose-200 animate-in fade-in duration-200">
            <div className="flex items-center gap-2">
              <AlertCircle className="size-4 text-rose-600" />
              <span>{errorNotice}</span>
            </div>
            <button
              onClick={() => setErrorNotice(null)}
              className="text-rose-700 hover:text-rose-950 text-xs font-bold"
            >
              ✕
            </button>
          </div>
        )}

        {/* 2. STATS OVERVIEW CARDS */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="border border-slate-200 dark:border-slate-800 shadow-2xs bg-white dark:bg-slate-900">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Total Catalog Items
                </p>
                <p className="text-2xl font-black text-foreground mt-0.5">{totalCount}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Active in StockOS database</p>
              </div>
              <div className="size-11 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                <Package className="size-6" />
              </div>
            </CardContent>
          </Card>

          <Card className="border border-slate-200 dark:border-slate-800 shadow-2xs bg-white dark:bg-slate-900">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Priced Products
                </p>
                <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-0.5">
                  {pricedCount}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">With standard unit rate &gt; ₹0</p>
              </div>
              <div className="size-11 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <IndianRupee className="size-6" />
              </div>
            </CardContent>
          </Card>

          <Card className="border border-slate-200 dark:border-slate-800 shadow-2xs bg-white dark:bg-slate-900">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Identified with SKU
                </p>
                <p className="text-2xl font-black text-indigo-600 dark:text-indigo-400 mt-0.5">
                  {skuCount}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Assigned product/barcode code</p>
              </div>
              <div className="size-11 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                <Tag className="size-6" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 3. SEARCH & FILTER CONTROLS */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs space-y-3">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative w-full sm:max-w-md">
              <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search items by name, SKU code, or series..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-8 h-9 text-xs bg-slate-50 dark:bg-slate-950"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground text-xs"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-1.5 flex-wrap w-full sm:w-auto">
              <button
                type="button"
                onClick={() => setFilterMode("all")}
                className={`text-xs font-semibold px-2.5 py-1 rounded-lg transition cursor-pointer border ${
                  filterMode === "all"
                    ? "bg-blue-600 text-white border-blue-600 shadow-2xs"
                    : "bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100"
                }`}
              >
                All ({items.length})
              </button>

              <button
                type="button"
                onClick={() => setFilterMode("priced")}
                className={`text-xs font-semibold px-2.5 py-1 rounded-lg transition cursor-pointer border ${
                  filterMode === "priced"
                    ? "bg-emerald-600 text-white border-emerald-600 shadow-2xs"
                    : "bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100"
                }`}
              >
                Priced ({pricedCount})
              </button>

              <button
                type="button"
                onClick={() => setFilterMode("missing_price")}
                className={`text-xs font-semibold px-2.5 py-1 rounded-lg transition cursor-pointer border ${
                  filterMode === "missing_price"
                    ? "bg-amber-600 text-white border-amber-600 shadow-2xs"
                    : "bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100"
                }`}
              >
                Missing Price ({items.length - pricedCount})
              </button>

              <button
                type="button"
                onClick={() => setFilterMode("has_sku")}
                className={`text-xs font-semibold px-2.5 py-1 rounded-lg transition cursor-pointer border ${
                  filterMode === "has_sku"
                    ? "bg-indigo-600 text-white border-indigo-600 shadow-2xs"
                    : "bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100"
                }`}
              >
                Has SKU ({skuCount})
              </button>
            </div>
          </div>
        </div>

        {/* 4. ITEMS TABLE */}
        <Card className="border border-slate-200 dark:border-slate-800 shadow-2xs overflow-hidden bg-white dark:bg-slate-900">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-slate-50/80 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700">
                <TableRow>
                  <TableHead className="w-12 text-center text-[10px] font-bold uppercase tracking-wider">
                    #
                  </TableHead>
                  <TableHead className="min-w-[260px] text-[10px] font-bold uppercase tracking-wider">
                    Product Title &amp; Catalog Name
                  </TableHead>
                  <TableHead className="w-36 text-left text-[10px] font-bold uppercase tracking-wider">
                    SKU / Code
                  </TableHead>
                  <TableHead className="w-24 text-center text-[10px] font-bold uppercase tracking-wider">
                    Unit
                  </TableHead>
                  <TableHead className="w-32 text-right text-[10px] font-bold uppercase tracking-wider">
                    Standard Rate
                  </TableHead>
                  <TableHead className="min-w-[200px] text-left text-[10px] font-bold uppercase tracking-wider hidden md:table-cell">
                    Description / Series Note
                  </TableHead>
                  <TableHead className="w-28 text-center text-[10px] font-bold uppercase tracking-wider">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {filteredItems.length > 0 ? (
                  filteredItems.map((item, idx) => (
                    <TableRow
                      key={item.id}
                      className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <TableCell className="w-12 text-center font-mono text-xs text-muted-foreground font-semibold py-3">
                        {(idx + 1).toString().padStart(2, "0")}
                      </TableCell>

                      <TableCell className="min-w-[260px] py-3">
                        <div className="font-bold text-xs text-foreground flex items-center gap-2">
                          <span>{item.name}</span>
                          {item.barcode && (
                            <span className="text-[10px] font-mono bg-slate-100 dark:bg-slate-800 text-slate-500 px-1 rounded">
                              {item.barcode}
                            </span>
                          )}
                        </div>
                      </TableCell>

                      <TableCell className="w-36 py-3">
                        {item.code ? (
                          <span className="font-mono text-[11px] font-bold bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2 py-0.5 rounded text-foreground">
                            {item.code}
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400 font-mono italic">
                            No SKU
                          </span>
                        )}
                      </TableCell>

                      <TableCell className="w-24 text-center py-3">
                        <Badge
                          variant="outline"
                          className="text-[10px] font-semibold uppercase px-1.5 py-0.5 border-slate-300 dark:border-slate-700"
                        >
                          {item.unit || "PCS"}
                        </Badge>
                      </TableCell>

                      <TableCell className="w-32 text-right py-3">
                        {item.price != null && item.price > 0 ? (
                          <span className="font-bold text-xs text-emerald-600 dark:text-emerald-400">
                            {formatINR(item.price)}
                          </span>
                        ) : (
                          <span className="text-[11px] text-muted-foreground italic">
                            ₹0.00
                          </span>
                        )}
                      </TableCell>

                      <TableCell className="min-w-[200px] text-left py-3 text-xs text-muted-foreground truncate hidden md:table-cell">
                        {item.descriptions || "—"}
                      </TableCell>

                      <TableCell className="w-28 text-center py-3">
                        <div className="flex items-center justify-center gap-1.5">
                          <Button
                            type="button"
                            size="icon-xs"
                            variant="ghost"
                            onClick={() => handleOpenEditModal(item)}
                            className="size-7 text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded-lg cursor-pointer"
                            title="Edit Item"
                          >
                            <Edit3 className="size-3.5" />
                          </Button>

                          <Button
                            type="button"
                            size="icon-xs"
                            variant="ghost"
                            onClick={() => setDeleteConfirmItem(item)}
                            className="size-7 text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg cursor-pointer"
                            title="Delete Item"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                      <div className="flex flex-col items-center justify-center space-y-2">
                        <Package className="size-8 text-slate-300 dark:text-slate-700" />
                        <p className="text-sm font-semibold">No items match your search or filter.</p>
                        <p className="text-xs text-muted-foreground">
                          Try searching with a different keyword or add a new item to catalog.
                        </p>
                        <Button
                          type="button"
                          size="sm"
                          onClick={handleOpenAddModal}
                          className="mt-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white cursor-pointer"
                        >
                          <Plus className="size-3.5 mr-1" />
                          Add Product
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      </main>

      {/* ========================================================
          5. ADD / EDIT PRODUCT MODAL
      ======================================================== */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50">
              <div className="flex items-center gap-2">
                <div className="size-7 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold">
                  {editingItem ? <Edit3 className="size-4" /> : <Plus className="size-4" />}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-foreground">
                    {editingItem ? "Edit Catalog Product" : "Add New Catalog Product"}
                  </h3>
                  <p className="text-[11px] text-muted-foreground">
                    {editingItem
                      ? "Update item pricing, SKU code, or name in database"
                      : "Create a new item record for automatic AI order matching"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg p-1 hover:bg-slate-200/50 cursor-pointer"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveItem} className="p-6 space-y-4">
              {formError && (
                <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs font-semibold text-rose-700 dark:text-rose-300 flex items-center gap-2">
                  <AlertCircle className="size-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Item Name */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-foreground flex items-center justify-between">
                  <span>Product Title / Name *</span>
                  <span className="text-[10px] text-muted-foreground font-normal">Official catalog name</span>
                </label>
                <Input
                  type="text"
                  placeholder="e.g. Worksheets 7, Nova Kids Nur, WTW GK 2"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="h-9 text-xs"
                  required
                />
              </div>

              {/* SKU Code & Unit in 2 columns */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-foreground">
                    SKU / Product Code
                  </label>
                  <Input
                    type="text"
                    placeholder="e.g. WS-07, WTW-GK2"
                    value={formCode}
                    onChange={(e) => setFormCode(e.target.value)}
                    className="h-9 text-xs font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-foreground">
                    Unit of Measurement
                  </label>
                  <Input
                    type="text"
                    placeholder="e.g. PCS, SET, PKT, BOX"
                    value={formUnit}
                    onChange={(e) => setFormUnit(e.target.value.toUpperCase())}
                    className="h-9 text-xs font-mono uppercase"
                  />
                </div>
              </div>

              {/* Price & Barcode in 2 columns */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-foreground">
                    Standard Rate (₹)
                  </label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={formPrice}
                    onChange={(e) => setFormPrice(e.target.value)}
                    className="h-9 text-xs font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-foreground">
                    Barcode (Optional)
                  </label>
                  <Input
                    type="text"
                    placeholder="Barcode / EAN"
                    value={formBarcode}
                    onChange={(e) => setFormBarcode(e.target.value)}
                    className="h-9 text-xs font-mono"
                  />
                </div>
              </div>

              {/* Description */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-foreground">
                  Description / Series Note (Optional)
                </label>
                <Input
                  type="text"
                  placeholder="Additional details or series information"
                  value={formDescriptions}
                  onChange={(e) => setFormDescriptions(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>

              {/* Modal Actions */}
              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsModalOpen(false)}
                  disabled={isSaving}
                  className="text-xs cursor-pointer"
                >
                  Cancel
                </Button>

                <Button
                  type="submit"
                  size="sm"
                  disabled={isSaving}
                  className="text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white cursor-pointer min-w-24"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin mr-1.5" />
                      Saving...
                    </>
                  ) : editingItem ? (
                    "Save Changes"
                  ) : (
                    "Add Product"
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================
          6. DELETE CONFIRMATION MODAL
      ======================================================== */}
      {deleteConfirmItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden p-6 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="size-10 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-600 flex items-center justify-center mx-auto">
              <Trash2 className="size-5" />
            </div>

            <div className="text-center space-y-1">
              <h3 className="text-base font-bold text-foreground">
                Delete &ldquo;{deleteConfirmItem.name}&rdquo;?
              </h3>
              <p className="text-xs text-muted-foreground">
                Are you sure you want to remove this product from the active catalog? This will prevent AI from matching new orders to this SKU.
              </p>
            </div>

            <div className="flex items-center justify-center gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setDeleteConfirmItem(null)}
                disabled={isDeleting}
                className="text-xs cursor-pointer"
              >
                Cancel
              </Button>

              <Button
                type="button"
                size="sm"
                onClick={handleDeleteItem}
                disabled={isDeleting}
                className="text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white cursor-pointer min-w-20"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin mr-1" />
                    Deleting...
                  </>
                ) : (
                  "Delete Product"
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

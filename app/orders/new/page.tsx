"use client";

import React, { useState, useEffect, useMemo, Suspense } from "react";
import { Link, useRouter } from "@/lib/router";
import { formatINR } from "@/lib/utils";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Building2,
  Calendar,
  FileText,
  User,
  ShoppingBag,
  Sparkles,
  Loader2,
  Save,
  Search,
  Check,
  PackagePlus,
} from "lucide-react";
import { MissingItemsModal, MissingItemToInsert } from "@/components/orders/MissingItemsModal";
import { ConfirmDialog } from "@/components/orders/ConfirmDialog";
import { OrderConfirmedModal } from "@/components/orders/OrderConfirmedModal";
import type { DraftOrder } from "@/types/order";

interface CustomerOption {
  customer_id: string;
  name: string;
  code: string | null;
  contact_person_mobile: string | null;
  billing_city: string | null;
}

interface ItemOption {
  id: string;
  name: string;
  code: string | null;
  price: number;
  unit: string | null;
}

interface ManualLineItem {
  id: string;
  itemId?: string;
  sku: string;
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

function NewOrderContent() {
  const router = useRouter();

  // Catalog data from database
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [catalogItems, setCatalogItems] = useState<ItemOption[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);

  // Form Fields
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [customCustomerName, setCustomCustomerName] = useState<string>("");
  const [isCustomCustomer, setIsCustomCustomer] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);

  // State initialized deterministically for Next.js prerender safety
  const [orderNumber, setOrderNumber] = useState<string>("SO-MAN-001");
  const [orderDate, setOrderDate] = useState<string>("");
  const [deliveryDate, setDeliveryDate] = useState<string>("");
  const [notes, setNotes] = useState<string>("Payment within 30 days. Standard shipping.");
  const [status, setStatus] = useState<"confirmed" | "draft">("confirmed");

  // Confirmation and Post-save display states
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [savedOrderResult, setSavedOrderResult] = useState<{
    orderId: string;
    orderNumber: string;
    status: string;
    customerName: string;
    totalAmount: number;
    subtotal?: number;
    discount?: number;
    tax?: number;
    itemCount: number;
    totalUnits?: number;
    isUpdate: boolean;
  } | null>(null);

  // Client-side hydration for dynamic default values
  useEffect(() => {
    const randomHex = Math.random().toString(16).substring(2, 8).toUpperCase();
    setOrderNumber(`SO-MAN-${randomHex}`);
    setOrderDate(new Date().toISOString().split("T")[0]);
  }, []);

  // Line items
  const [lineItems, setLineItems] = useState<ManualLineItem[]>([
    {
      id: "row-1",
      sku: "",
      description: "",
      quantity: 1,
      unitPrice: 0,
      lineTotal: 0,
    },
  ]);

  // Adjustments
  const [discountAmount, setDiscountAmount] = useState<number>(0);
  const [taxRate, setTaxRate] = useState<number>(0); // e.g. 0, 5, 12, 18

  // Submission state
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Missing items insertion modal state
  const [missingItemsModal, setMissingItemsModal] = useState<{
    isOpen: boolean;
    items: MissingItemToInsert[];
    pendingStatus: "confirmed" | "draft";
    mode: "single" | "all_confirm";
  }>({
    isOpen: false,
    items: [],
    pendingStatus: "confirmed",
    mode: "single",
  });

  // Fetch catalog on mount
  useEffect(() => {
    async function loadCatalog() {
      try {
        const res = await fetch("/api/catalog");
        if (res.ok) {
          const data = await res.json();
          setCustomers(data.customers || []);
          setCatalogItems(data.items || []);
        }
      } catch (err) {
        console.error("Failed to load catalog data:", err);
      } finally {
        setLoadingCatalog(false);
      }
    }
    loadCatalog();
  }, []);

  // Filtered customer list
  const filteredCustomers = useMemo(() => {
    if (!customerSearch.trim()) return customers;
    const q = customerSearch.toLowerCase();
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.code && c.code.toLowerCase().includes(q)) ||
        (c.billing_city && c.billing_city.toLowerCase().includes(q)) ||
        (c.contact_person_mobile && c.contact_person_mobile.includes(q))
    );
  }, [customers, customerSearch]);

  const selectedCustomer = useMemo(() => {
    return customers.find((c) => c.customer_id === selectedCustomerId);
  }, [customers, selectedCustomerId]);

  // Financial calculations
  const subtotal = useMemo(() => {
    return lineItems.reduce((acc, it) => acc + (it.lineTotal || 0), 0);
  }, [lineItems]);

  const taxAmount = useMemo(() => {
    const afterDiscount = Math.max(0, subtotal - discountAmount);
    return Number(((afterDiscount * taxRate) / 100).toFixed(2));
  }, [subtotal, discountAmount, taxRate]);

  const totalAmount = useMemo(() => {
    return Math.max(0, Number((subtotal - discountAmount + taxAmount).toFixed(2)));
  }, [subtotal, discountAmount, taxAmount]);

  const totalUnits = useMemo(() => {
    return lineItems.reduce((acc, it) => acc + (it.quantity || 0), 0);
  }, [lineItems]);

  // Handle line item changes
  const handleItemChange = (
    id: string,
    field: "description" | "sku" | "quantity" | "unitPrice",
    val: string | number
  ) => {
    setLineItems((prev) =>
      prev.map((it) => {
        if (it.id !== id) return it;
        const updated = { ...it, [field]: val };
        const q = field === "quantity" ? (val === "" ? 0 : Math.max(0, Number(val) || 0)) : it.quantity;
        const p = field === "unitPrice" ? Math.max(0, Number(val) || 0) : it.unitPrice;
        updated.lineTotal = Number((q * p).toFixed(2));
        return updated;
      })
    );
  };

  const handleSelectCatalogItem = (rowId: string, item: ItemOption) => {
    setLineItems((prev) =>
      prev.map((it) => {
        if (it.id !== rowId) return it;
        const q = it.quantity || 0;
        const p = item.price || 0;
        return {
          ...it,
          itemId: item.id,
          sku: item.code || "",
          description: item.name,
          unitPrice: p,
          lineTotal: Number((q * p).toFixed(2)),
        };
      })
    );
  };

  const handleAddRow = () => {
    const newId = `row-${Date.now()}`;
    setLineItems((prev) => [
      ...prev,
      {
        id: newId,
        sku: "",
        description: "",
        quantity: 1,
        unitPrice: 0,
        lineTotal: 0,
      },
    ]);
  };

  const handleDeleteRow = (id: string) => {
    if (lineItems.length <= 1) {
      // Keep at least one row, just reset it
      setLineItems([
        {
          id: `row-${Date.now()}`,
          sku: "",
          description: "",
          quantity: 1,
          unitPrice: 0,
          lineTotal: 0,
        },
      ]);
      return;
    }
    setLineItems((prev) => prev.filter((it) => it.id !== id));
  };

  const handlePromptSingleItem = (item: ManualLineItem) => {
    if (!item.description.trim() && !item.sku.trim()) return;
    setMissingItemsModal({
      isOpen: true,
      items: [
        {
          tempId: item.id,
          name: item.description.trim() || item.sku.trim(),
          code: item.sku.trim(),
          price: item.unitPrice,
          unit: "PCS",
          quantity: item.quantity,
        },
      ],
      pendingStatus: status,
      mode: "single",
    });
  };

  const handleModalInserted = async (
    insertedItems: Array<{
      tempId: string;
      id: string;
      name: string;
      code: string | null;
      price: number | null;
      unit: string | null;
    }>
  ) => {
    const updatedLineItems = lineItems.map((line) => {
      const match = insertedItems.find((ins) => ins.tempId === line.id);
      if (match) {
        return {
          ...line,
          itemId: match.id,
          sku: match.code || line.sku,
          description: match.name,
          unitPrice: line.unitPrice || match.price || 0,
        };
      }
      return line;
    });

    setLineItems(updatedLineItems);
    const wasConfirmMode = missingItemsModal.mode === "all_confirm";
    const pendingSaveStatus = missingItemsModal.pendingStatus;
    setMissingItemsModal({ isOpen: false, items: [], pendingStatus: "confirmed", mode: "single" });

    // Refresh catalog items so new items show up in catalog dropdown
    try {
      const res = await fetch("/api/catalog");
      if (res.ok) {
        const data = await res.json();
        setCatalogItems(data.items || []);
      }
    } catch {
      // ignore
    }

    if (wasConfirmMode) {
      const validItems = updatedLineItems.filter((it) => it.description.trim() !== "");
      promptConfirmDialog(pendingSaveStatus, validItems);
    }
  };

  const promptConfirmDialog = (
    saveStatus: "confirmed" | "draft",
    itemsToConfirm: ManualLineItem[]
  ) => {
    const customerName = isCustomCustomer
      ? customCustomerName.trim()
      : selectedCustomer?.name || "";

    const draftObj: DraftOrder = {
      importId: "manual",
      sourceType: "image",
      sourceReference: `Manual Order ${orderNumber}`,
      extracted: {
        customer: {
          name: customerName,
          address: selectedCustomer?.billing_city || undefined,
          phone: selectedCustomer?.contact_person_mobile || undefined,
        },
        po_number: orderNumber,
        order_date: orderDate,
        delivery_date: deliveryDate || undefined,
        items: itemsToConfirm.map((it) => ({
          sku: it.sku || undefined,
          description: it.description,
          quantity: it.quantity,
          unit_price: it.unitPrice,
          line_total: it.lineTotal,
        })),
        terms: notes || undefined,
      },
      matchedCustomerId: isCustomCustomer ? undefined : selectedCustomerId || undefined,
      customerConfidence: !isCustomCustomer && selectedCustomerId ? 100 : 0,
      lineItems: itemsToConfirm.map((it) => ({
        tempId: it.id,
        matchedItemId: it.itemId,
        sku: it.sku || undefined,
        description: it.description,
        quantity: it.quantity,
        unit_price: it.unitPrice,
        line_total: it.lineTotal,
        confidence: it.itemId ? 100 : 70,
      })),
      totals: {
        subtotal,
        discount: discountAmount,
        tax: taxAmount,
        total: totalAmount,
      },
    };

    setPendingDraftForConfirm({
      status: saveStatus,
      items: itemsToConfirm,
      draft: draftObj,
    });
    setIsConfirmModalOpen(true);
  };

  const [pendingDraftForConfirm, setPendingDraftForConfirm] = useState<{
    status: "confirmed" | "draft";
    items: ManualLineItem[];
    draft: DraftOrder;
  } | null>(null);

  const executeSaveOrder = async (
    saveStatus: "confirmed" | "draft",
    itemsToSave: ManualLineItem[]
  ) => {
    const customerName = isCustomCustomer
      ? customCustomerName.trim()
      : selectedCustomer?.name || "";

    setIsSaving(true);
    setError(null);

    try {
      const payload = {
        customerId: isCustomCustomer ? null : selectedCustomerId || null,
        customerName: customerName,
        orderNumber: orderNumber.trim() || `SO-${Date.now().toString().slice(-6)}`,
        orderDate,
        deliveryDate: deliveryDate || null,
        notes,
        status: saveStatus,
        items: itemsToSave.map((it) => ({
          itemId: it.itemId || null,
          sku: it.sku || null,
          description: it.description,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          lineTotal: it.lineTotal,
        })),
        totals: {
          subtotal,
          discount: discountAmount,
          tax: taxAmount,
          total: totalAmount,
        },
      };

      const res = await fetch("/api/orders/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to create order");
      }

      const createdOrderNumber = data.order?.order_number || payload.orderNumber || orderNumber;

      setSavedOrderResult({
        orderId: data.order?.id || "saved",
        orderNumber: createdOrderNumber,
        status: "Confirmed & Saved to Database",
        customerName: payload.customerName || "Customer",
        totalAmount,
        subtotal,
        discount: discountAmount,
        tax: taxAmount,
        itemCount: itemsToSave.length,
        totalUnits: itemsToSave.reduce((acc, it) => acc + (it.quantity || 0), 0),
        isUpdate: false,
      });

      setIsConfirmModalOpen(false);
      setIsSaving(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setIsSaving(false);
    }
  };

  // Submit Order
  const handleSaveOrder = async (saveStatus: "confirmed" | "draft") => {
    // Validation
    const customerName = isCustomCustomer
      ? customCustomerName.trim()
      : selectedCustomer?.name || "";

    if (!customerName) {
      setError("Please select a customer or type a customer name.");
      return;
    }

    const validItems = lineItems.filter((it) => it.description.trim() !== "");
    if (validItems.length === 0) {
      setError("Please enter at least one line item with a description.");
      return;
    }

    const invalidQty = validItems.filter((it) => !it.quantity || it.quantity <= 0);
    if (invalidQty.length > 0) {
      setError("Every item must have a valid quantity greater than 0. Missing quantities cannot be defaulted.");
      return;
    }

    // Check if any line items do not exist in items table (no itemId)
    const unlinked = validItems.filter((it) => !it.itemId);
    if (unlinked.length > 0) {
      setMissingItemsModal({
        isOpen: true,
        items: unlinked.map((it) => ({
          tempId: it.id,
          name: it.description.trim(),
          code: it.sku.trim(),
          price: it.unitPrice,
          unit: "PCS",
          quantity: it.quantity,
        })),
        pendingStatus: saveStatus,
        mode: "all_confirm",
      });
      return;
    }

    promptConfirmDialog(saveStatus, validItems);
  };

  return (
    <main className="min-h-screen bg-muted/20 pb-16">
      {/* Sticky Header */}
      <header className="bg-background/95 backdrop-blur-md border-b sticky top-0 z-40 shadow-xs">
        <div className="mx-auto max-w-6xl px-6 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/orders"
              title="Back to Orders"
              className={
                buttonVariants({ variant: "ghost", size: "icon-sm" }) +
                " text-muted-foreground hover:text-foreground border border-slate-300 dark:border-slate-600 rounded-lg size-8"
              }
            >
              <ArrowLeft className="size-4" />
            </Link>
            <div className="h-4 w-px bg-border" />
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-base font-bold text-foreground tracking-tight">
                  New Sales Order
                </h1>
                <Badge
                  variant="outline"
                  className="border-emerald-300 text-emerald-700 bg-emerald-50 text-[10px] h-4.5 px-2 font-semibold"
                >
                  Manual Entry
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Create a sales order directly with customer and catalog line items
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <Link
              href="/upload"
              className={
                buttonVariants({ variant: "outline", size: "sm" }) +
                " gap-1.5 h-8 px-3 text-xs font-semibold border-slate-400 text-primary hover:bg-primary/5"
              }
            >
              <Sparkles className="size-3.5 text-blue-600" />
              <span>Extract with AI Vision instead</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <div className="mx-auto max-w-6xl px-6 py-6 space-y-6">
        {/* Error Alert */}
        {error && (
          <Card className="border border-destructive/50 bg-destructive/5 shadow-xs">
            <CardContent className="p-4 flex items-start gap-3">
              <AlertCircle className="size-5 text-destructive shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <h4 className="text-xs font-bold text-destructive">Submission Error</h4>
                <p className="text-xs text-destructive/90">{error}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 1. Header Details Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Customer Selection Card */}
          <Card className="border border-slate-500 dark:border-slate-400 shadow-sm bg-card">
            <CardContent className="p-4 flex flex-col justify-between h-full space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="size-7 rounded-md bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100 shrink-0">
                    <User className="size-3.5" />
                  </div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    Customer
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsCustomCustomer(!isCustomCustomer);
                    setShowCustomerDropdown(false);
                  }}
                  className="text-[10px] text-primary hover:underline font-semibold"
                >
                  {isCustomCustomer ? "Pick from Master" : "+ Custom Name"}
                </button>
              </div>

              {isCustomCustomer ? (
                <div>
                  <Input
                    type="text"
                    value={customCustomerName}
                    onChange={(e) => setCustomCustomerName(e.target.value)}
                    placeholder="Enter customer name..."
                    className="h-8.5 text-sm font-bold bg-background border-input focus-visible:ring-1"
                    autoFocus
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Unlinked / New Customer
                  </p>
                </div>
              ) : (
                <div className="relative">
                  <div
                    onClick={() => setShowCustomerDropdown(!showCustomerDropdown)}
                    className="flex items-center justify-between border border-input rounded-md px-2.5 h-8.5 bg-background text-sm font-bold cursor-pointer hover:border-primary/60 transition-colors"
                  >
                    <span className="truncate">
                      {selectedCustomer ? selectedCustomer.name : "Select Customer..."}
                    </span>
                    <Search className="size-3.5 text-muted-foreground shrink-0 ml-1.5" />
                  </div>

                  {/* Customer Dropdown */}
                  {showCustomerDropdown && (
                    <div className="absolute left-0 top-10 w-72 bg-card border border-slate-400 rounded-lg shadow-xl z-50 p-2 space-y-1.5 animate-in fade-in-50">
                      <Input
                        type="text"
                        placeholder="Search customers..."
                        value={customerSearch}
                        onChange={(e) => setCustomerSearch(e.target.value)}
                        className="h-7.5 text-xs bg-muted/40"
                        autoFocus
                      />
                      <div className="max-h-48 overflow-y-auto space-y-1 pt-1">
                        {loadingCatalog ? (
                          <div className="p-3 text-center text-xs text-muted-foreground">
                            <Loader2 className="size-4 animate-spin mx-auto mb-1 text-primary" />
                            Loading customers...
                          </div>
                        ) : filteredCustomers.length === 0 ? (
                          <div className="p-3 text-center text-xs text-muted-foreground">
                            No customers found.
                          </div>
                        ) : (
                          filteredCustomers.map((c) => (
                            <button
                              key={c.customer_id}
                              type="button"
                              onClick={() => {
                                setSelectedCustomerId(c.customer_id);
                                setShowCustomerDropdown(false);
                              }}
                              className={`w-full text-left p-1.5 rounded-md text-xs transition-colors flex items-center justify-between ${
                                selectedCustomerId === c.customer_id
                                  ? "bg-primary text-primary-foreground font-semibold"
                                  : "hover:bg-muted/70 text-foreground"
                              }`}
                            >
                              <div className="truncate">
                                <div className="font-semibold truncate">{c.name}</div>
                                <div className="text-[10px] opacity-80 truncate">
                                  {c.code ? `[${c.code}] ` : ""}
                                  {c.billing_city || "No City"}
                                </div>
                              </div>
                              {selectedCustomerId === c.customer_id && (
                                <Check className="size-3.5 shrink-0 ml-2" />
                              )}
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <p className="text-[11px] text-muted-foreground truncate">
                {selectedCustomer
                  ? `${selectedCustomer.billing_city || "City N/A"} • ${selectedCustomer.contact_person_mobile || "Mobile N/A"}`
                  : isCustomCustomer
                  ? "Custom customer record"
                  : "Pick from Supabase customer master"}
              </p>
            </CardContent>
          </Card>

          {/* Order Reference Number */}
          <Card className="border border-slate-500 dark:border-slate-400 shadow-sm bg-card">
            <CardContent className="p-4 flex flex-col justify-between h-full space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="size-7 rounded-md bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100 shrink-0">
                    <FileText className="size-3.5" />
                  </div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    Order / PO Ref
                  </span>
                </div>
                <Badge variant="outline" className="font-mono text-[10px] h-5 px-1.5 uppercase font-medium">
                  Direct SO
                </Badge>
              </div>

              <div>
                <Input
                  type="text"
                  value={orderNumber}
                  onChange={(e) => setOrderNumber(e.target.value)}
                  placeholder="e.g. SO-2026-001"
                  className="h-8.5 font-mono text-sm font-bold bg-background border-input focus-visible:ring-1"
                />
              </div>

              <p className="text-[11px] text-muted-foreground truncate">
                Sales order tracking identifier
              </p>
            </CardContent>
          </Card>

          {/* Dates Card */}
          <Card className="border border-slate-500 dark:border-slate-400 shadow-sm bg-card">
            <CardContent className="p-4 flex flex-col justify-between h-full space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="size-7 rounded-md bg-purple-50 text-purple-600 flex items-center justify-center border border-purple-100 shrink-0">
                    <Calendar className="size-3.5" />
                  </div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    Order Date
                  </span>
                </div>
                <Badge variant="secondary" className="text-[10px] h-5 px-1.5 font-medium">
                  Required
                </Badge>
              </div>

              <div>
                <Input
                  type="date"
                  value={orderDate}
                  onChange={(e) => setOrderDate(e.target.value)}
                  className="h-8.5 text-xs font-semibold bg-background border-input focus-visible:ring-1"
                />
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-muted-foreground shrink-0">Delivery:</span>
                <Input
                  type="date"
                  value={deliveryDate}
                  onChange={(e) => setDeliveryDate(e.target.value)}
                  className="h-6 text-[10px] px-1 bg-background border-input"
                  title="Delivery Date"
                />
              </div>
            </CardContent>
          </Card>

          {/* Order Total Overview Card */}
          <Card className="border border-slate-500 dark:border-slate-400 shadow-sm bg-blue-50/20">
            <CardContent className="p-4 flex flex-col justify-between h-full space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="size-7 rounded-md bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100 shrink-0 font-bold text-xs">
                    ₹
                  </div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-primary">
                    Grand Total
                  </span>
                </div>
                <Badge variant="default" className="text-[10px] h-5 px-1.5 font-medium bg-primary">
                  {lineItems.length} {lineItems.length === 1 ? "Item" : "Items"}
                </Badge>
              </div>

              <div className="h-8.5 flex items-center">
                <span className="text-xl font-black text-primary tracking-tight">
                  {formatINR(totalAmount)}
                </span>
              </div>

              <p className="text-[11px] text-muted-foreground font-medium truncate">
                Total Quantity: <strong className="text-foreground">{totalUnits} pcs</strong>
              </p>
            </CardContent>
          </Card>
        </div>

        {/* 2. Line Items Table */}
        <Card className="border border-slate-500 dark:border-slate-400 shadow-sm bg-card">
          <CardHeader className="flex flex-row items-center justify-between border-b pb-4 px-6">
            <div>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Building2 className="size-4 text-primary" />
                Sales Order Line Items
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Select items from catalog or type item descriptions and pricing manually.
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddRow}
              className="gap-1.5 h-8 text-xs font-semibold cursor-pointer border-slate-400"
            >
              <Plus className="size-3.5" />
              Add Line Item
            </Button>
          </CardHeader>

          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-muted/60 border-b">
                <TableRow>
                  <TableHead className="w-12 text-center text-xs font-semibold uppercase tracking-wider">
                    #
                  </TableHead>
                  <TableHead className="min-w-[280px] text-xs font-semibold uppercase tracking-wider">
                    Item Description
                  </TableHead>
                  <TableHead className="w-40 text-center text-xs font-semibold uppercase tracking-wider">
                    Catalog Preset
                  </TableHead>
                  <TableHead className="w-32 text-center text-xs font-semibold uppercase tracking-wider">
                    SKU / Code
                  </TableHead>
                  <TableHead className="w-28 text-right text-xs font-semibold uppercase tracking-wider">
                    Quantity
                  </TableHead>
                  <TableHead className="w-36 text-right text-xs font-semibold uppercase tracking-wider">
                    Rate / Unit Price
                  </TableHead>
                  <TableHead className="w-36 text-right text-xs font-semibold uppercase tracking-wider">
                    Line Total
                  </TableHead>
                  <TableHead className="w-12 text-center"></TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {lineItems.map((item, idx) => (
                  <TableRow
                    key={item.id}
                    className="hover:bg-muted/30 transition-colors border-b last:border-b-0"
                  >
                    {/* Index */}
                    <TableCell className="w-12 text-center font-mono text-xs text-muted-foreground font-semibold py-3 align-middle">
                      {(idx + 1).toString().padStart(2, "0")}
                    </TableCell>

                    {/* Description */}
                    <TableCell className="min-w-[280px] py-3 align-middle">
                      <Input
                        type="text"
                        value={item.description}
                        onChange={(e) =>
                          handleItemChange(item.id, "description", e.target.value)
                        }
                        placeholder="Type item title or description..."
                        className="font-medium h-9 bg-background border-input focus-visible:ring-1 text-sm shadow-2xs"
                      />
                    </TableCell>

                    {/* Catalog Quick Select Dropdown & Status */}
                    <TableCell className="w-48 py-3 align-middle text-center">
                      <div className="flex flex-col gap-1 items-center">
                        <select
                          value={item.itemId || ""}
                          onChange={(e) => {
                            const selectedId = e.target.value;
                            const found = catalogItems.find((cat) => cat.id === selectedId);
                            if (found) {
                              handleSelectCatalogItem(item.id, found);
                            }
                          }}
                          className="h-8 w-full text-[11px] rounded-md border border-input bg-background px-2 text-foreground font-medium focus:ring-1 focus:ring-primary focus:outline-none"
                        >
                          <option value="" disabled>
                            Catalog item...
                          </option>
                          {catalogItems.map((cat) => (
                            <option key={cat.id} value={cat.id}>
                              {cat.name} (₹{cat.price})
                            </option>
                          ))}
                        </select>
                        <div className="flex items-center justify-center gap-1 mt-0.5">
                          {item.itemId ? (
                            <Badge
                              variant="default"
                              className="text-[10px] h-5 px-1.5 bg-emerald-600 hover:bg-emerald-700 font-medium inline-flex items-center gap-1"
                            >
                              <Check className="size-2.5" />
                              Linked
                            </Badge>
                          ) : (item.description.trim() || item.sku.trim()) ? (
                            <button
                              type="button"
                              onClick={() => handlePromptSingleItem(item)}
                              title="Item does not exist in catalog. Click to insert into items table."
                              className="inline-flex items-center gap-1 text-[10px] h-5 px-2 rounded font-semibold text-amber-800 dark:text-amber-300 bg-amber-100 hover:bg-amber-200 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-700 cursor-pointer shadow-2xs"
                            >
                              <Plus className="size-2.5" />
                              + Add to Items
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </TableCell>

                    {/* SKU / Code */}
                    <TableCell className="w-32 py-3 align-middle text-center">
                      <Input
                        type="text"
                        value={item.sku}
                        onChange={(e) => handleItemChange(item.id, "sku", e.target.value)}
                        placeholder="SKU..."
                        className="h-8 text-xs font-mono text-center bg-background border-input shadow-2xs"
                      />
                    </TableCell>

                    {/* Quantity */}
                    <TableCell className="w-28 py-3 align-middle text-right">
                      <Input
                        type="number"
                        min="0"
                        value={item.quantity === 0 ? "" : item.quantity}
                        placeholder="0"
                        onChange={(e) =>
                          handleItemChange(
                            item.id,
                            "quantity",
                            e.target.value === "" ? 0 : Math.max(0, parseInt(e.target.value, 10) || 0)
                          )
                        }
                        className={`h-9 w-20 ml-auto font-bold text-sm text-right bg-background border-input focus-visible:ring-1 shadow-2xs ${
                          !item.quantity || item.quantity <= 0 ? "border-amber-400 bg-amber-50/20" : ""
                        }`}
                      />
                    </TableCell>

                    {/* Rate / Unit Price */}
                    <TableCell className="w-36 py-3 align-middle text-right">
                      <div className="relative flex items-center justify-end">
                        <span className="absolute left-2.5 text-xs text-muted-foreground font-semibold">
                          ₹
                        </span>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={item.unitPrice}
                          onChange={(e) =>
                            handleItemChange(
                              item.id,
                              "unitPrice",
                              parseFloat(e.target.value) || 0
                            )
                          }
                          className="h-9 w-28 pl-6 text-right font-bold text-sm bg-background border-input focus-visible:ring-1 shadow-2xs"
                        />
                      </div>
                    </TableCell>

                    {/* Line Total */}
                    <TableCell className="w-36 py-3 align-middle text-right">
                      <span className="font-mono font-bold text-sm text-foreground tracking-tight">
                        {formatINR(item.lineTotal)}
                      </span>
                    </TableCell>

                    {/* Delete Row */}
                    <TableCell className="w-12 text-center py-3 align-middle">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => handleDeleteRow(item.id)}
                        className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md cursor-pointer size-7"
                        title="Delete item row"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* 3. Notes, Terms & Financial Totals */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Notes & Terms Box */}
          <Card className="lg:col-span-2 border border-slate-500 dark:border-slate-400 shadow-sm bg-card p-5 space-y-4">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              <FileText className="size-4 text-primary" />
              Order Terms & Special Instructions
            </h3>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">
                Payment Terms & Notes (printed on invoice / packing slip)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="e.g. Goods once sold will not be taken back. Payment due in 15 days."
                className="w-full text-xs rounded-md border border-input bg-background p-2.5 text-foreground focus:ring-1 focus:ring-primary focus:outline-none"
              />
            </div>

            <div className="pt-2 flex items-center gap-4 text-xs">
              <span className="font-semibold text-muted-foreground">Order Status on Save:</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setStatus("confirmed")}
                  className={`px-3 py-1 rounded-md font-semibold transition-colors cursor-pointer border ${
                    status === "confirmed"
                      ? "bg-emerald-600 text-white border-emerald-600"
                      : "bg-muted text-muted-foreground border-border hover:text-foreground"
                  }`}
                >
                  Confirmed (Ready)
                </button>
                <button
                  type="button"
                  onClick={() => setStatus("draft")}
                  className={`px-3 py-1 rounded-md font-semibold transition-colors cursor-pointer border ${
                    status === "draft"
                      ? "bg-amber-600 text-white border-amber-600"
                      : "bg-muted text-muted-foreground border-border hover:text-foreground"
                  }`}
                >
                  Draft (Needs Review)
                </button>
              </div>
            </div>
          </Card>

          {/* Financial Breakdown Card */}
          <Card className="border border-slate-500 dark:border-slate-400 shadow-sm bg-card p-5 space-y-4">
            <h3 className="text-sm font-bold text-foreground">Financial Summary</h3>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between items-center text-muted-foreground">
                <span className="text-xs">Subtotal ({totalUnits} pcs)</span>
                <span className="font-semibold text-foreground">
                  {formatINR(subtotal)}
                </span>
              </div>

              {/* Discount Input */}
              <div className="flex justify-between items-center text-muted-foreground">
                <span className="text-xs">Discount (₹)</span>
                <div className="w-24">
                  <Input
                    type="number"
                    min="0"
                    value={discountAmount}
                    onChange={(e) => setDiscountAmount(Math.max(0, parseFloat(e.target.value) || 0))}
                    className="h-7 text-xs text-right font-semibold"
                  />
                </div>
              </div>

              {/* Tax / GST Selection */}
              <div className="flex justify-between items-center text-muted-foreground">
                <span className="text-xs">GST / Tax Rate</span>
                <div className="flex items-center gap-1.5">
                  <select
                    value={taxRate}
                    onChange={(e) => setTaxRate(Number(e.target.value))}
                    className="h-7 text-xs border rounded-md px-1.5 bg-background font-semibold"
                  >
                    <option value={0}>0% GST</option>
                    <option value={5}>5% GST</option>
                    <option value={12}>12% GST</option>
                    <option value={18}>18% GST</option>
                  </select>
                  <span className="text-xs font-semibold text-foreground w-16 text-right">
                    +{formatINR(taxAmount)}
                  </span>
                </div>
              </div>

              <div className="h-px bg-border my-2" />

              {/* Grand Total */}
              <div className="rounded-lg bg-blue-50/60 border border-blue-300 p-3.5 flex justify-between items-center">
                <div>
                  <span className="text-sm font-bold text-foreground block">Grand Total</span>
                  <span className="text-[10px] text-muted-foreground">Final payable value</span>
                </div>
                <span className="text-2xl font-black text-primary tracking-tight">
                  {formatINR(totalAmount)}
                </span>
              </div>
            </div>
          </Card>
        </div>

        {/* 4. Action Footer */}
        <Card className="border border-slate-500 dark:border-slate-400 shadow-sm bg-card px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <CheckCircle2 className="size-4 text-emerald-600 shrink-0" />
            <span>
              Order will be saved directly into Supabase <code className="font-mono text-foreground font-semibold">sales_order</code> table.
            </span>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push("/orders")}
              disabled={isSaving}
              className="h-9 px-4 text-xs font-medium cursor-pointer border-slate-400"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => handleSaveOrder("draft")}
              disabled={isSaving}
              className="h-9 px-4 text-xs font-semibold cursor-pointer border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
            >
              Save as Draft
            </Button>
            <Button
              type="button"
              onClick={() => handleSaveOrder(status)}
              disabled={isSaving}
              className="h-9 px-6 gap-2 shadow-xs font-semibold text-sm cursor-pointer bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              {isSaving ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Creating Order...
                </>
              ) : (
                <>
                  <CheckCircle2 className="size-4" />
                  Save & Confirm Order
                </>
              )}
            </Button>
          </div>
        </Card>
      </div>

      {/* Missing Items Insertion Confirmation Modal */}
      <MissingItemsModal
        isOpen={missingItemsModal.isOpen}
        items={missingItemsModal.items}
        title={
          missingItemsModal.items.length === 1
            ? "Item Not Found in Item Table"
            : `${missingItemsModal.items.length} Items Not in Item Table`
        }
        actionButtonLabel={
          missingItemsModal.mode === "all_confirm"
            ? "Yes, Insert into Items & Save Order"
            : "Yes, Insert into Items Table"
        }
        onConfirm={handleModalInserted}
        onCancel={() =>
          setMissingItemsModal({ isOpen: false, items: [], pendingStatus: "confirmed", mode: "single" })
        }
        onSkip={() => {
          const wasConfirmMode = missingItemsModal.mode === "all_confirm";
          const pendingSaveStatus = missingItemsModal.pendingStatus;
          setMissingItemsModal({ isOpen: false, items: [], pendingStatus: "confirmed", mode: "single" });
          if (wasConfirmMode) {
            const validItems = lineItems.filter((it) => it.description.trim() !== "");
            promptConfirmDialog(pendingSaveStatus, validItems);
          }
        }}
      />

      {/* Confirm Before Saving Dialog */}
      {pendingDraftForConfirm && (
        <ConfirmDialog
          isOpen={isConfirmModalOpen}
          draft={pendingDraftForConfirm.draft}
          isSaving={isSaving}
          onConfirm={async () => {
            await executeSaveOrder(pendingDraftForConfirm.status, pendingDraftForConfirm.items);
          }}
          onCancel={() => setIsConfirmModalOpen(false)}
        />
      )}

      {/* Order Confirmed & Save Status Modal */}
      <OrderConfirmedModal
        isOpen={!!savedOrderResult}
        orderNumber={savedOrderResult?.orderNumber || ""}
        orderId={savedOrderResult?.orderId || ""}
        status={savedOrderResult?.status || "Confirmed"}
        customerName={savedOrderResult?.customerName}
        totalAmount={savedOrderResult?.totalAmount || 0}
        subtotal={savedOrderResult?.subtotal}
        discount={savedOrderResult?.discount}
        tax={savedOrderResult?.tax}
        itemCount={savedOrderResult?.itemCount || 0}
        totalUnits={savedOrderResult?.totalUnits}
        isUpdate={savedOrderResult?.isUpdate}
        onClose={() => setSavedOrderResult(null)}
      />
    </main>
  );
}

export default function NewOrderPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-muted/20 flex items-center justify-center p-8">
          <div className="flex items-center gap-3 text-muted-foreground">
            <Loader2 className="size-5 animate-spin text-primary" />
            <span className="text-sm font-medium">Loading New Order workspace...</span>
          </div>
        </div>
      }
    >
      <NewOrderContent />
    </Suspense>
  );
}


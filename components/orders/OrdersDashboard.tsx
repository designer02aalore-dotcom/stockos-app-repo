import React, { useState, useMemo } from "react";
import { Link, useRouter } from "@/lib/router";
import { formatINR } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  Search,
  Plus,
  FileText,
  Calendar,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  User,
  ShoppingBag,
  IndianRupee,
  Layers,
  Sparkles,
  X,
  FileSpreadsheet,
  ScanLine,
  Mail,
} from "lucide-react";

export interface OrderItemViewModel {
  id: string;
  orderNumber: string;
  poNumber?: string;
  orderDate: string;
  createdAt: string;
  customerName: string;
  isCustomerLinked: boolean;
  itemCount: number;
  totalQuantity: number;
  totalAmount: number;
  status: "confirmed" | "draft" | "pending";
  sourceType: "image" | "email" | "manual";
  sourceReference?: string;
}

interface OrdersDashboardProps {
  initialOrders: OrderItemViewModel[];
}

export function OrdersDashboard({ initialOrders }: OrdersDashboardProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "confirmed" | "draft">("all");

  // Summary Metrics
  const metrics = useMemo(() => {
    const totalOrders = initialOrders.length;
    const totalValue = initialOrders.reduce((acc, o) => acc + (o.totalAmount || 0), 0);
    const confirmedCount = initialOrders.filter((o) => o.status === "confirmed").length;
    const draftCount = initialOrders.filter((o) => o.status === "draft" || o.status === "pending").length;
    return { totalOrders, totalValue, confirmedCount, draftCount };
  }, [initialOrders]);

  // Filtered Orders
  const filteredOrders = useMemo(() => {
    return initialOrders.filter((order) => {
      // Status filter
      if (statusFilter === "confirmed" && order.status !== "confirmed") return false;
      if (statusFilter === "draft" && order.status !== "draft" && order.status !== "pending") return false;

      // Search query filter
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const matchOrderNum = order.orderNumber.toLowerCase().includes(q);
      const matchPoNum = order.poNumber?.toLowerCase().includes(q);
      const matchCustomer = order.customerName.toLowerCase().includes(q);
      const matchRef = order.sourceReference?.toLowerCase().includes(q);

      return matchOrderNum || matchPoNum || matchCustomer || matchRef;
    });
  }, [initialOrders, statusFilter, searchQuery]);

  return (
    <div className="space-y-6">
      {/* 1. Top KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Orders */}
        <Card className="border border-slate-500 dark:border-slate-400 bg-card shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                Total Orders
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black text-foreground tracking-tight">
                  {metrics.totalOrders}
                </span>
                <span className="text-xs text-muted-foreground">in database</span>
              </div>
            </div>
            <div className="size-11 rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400 flex items-center justify-center border border-blue-200 dark:border-blue-900 shrink-0">
              <ShoppingBag className="size-5" />
            </div>
          </CardContent>
        </Card>

        {/* Card 2: Total Volume (INR) */}
        <Card className="border border-slate-500 dark:border-slate-400 bg-card shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                Total Volume
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400 tracking-tight">
                  {formatINR(metrics.totalValue)}
                </span>
              </div>
            </div>
            <div className="size-11 rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400 flex items-center justify-center border border-emerald-200 dark:border-emerald-900 shrink-0">
              <IndianRupee className="size-5" />
            </div>
          </CardContent>
        </Card>

        {/* Card 3: Confirmed Orders */}
        <Card className="border border-slate-500 dark:border-slate-400 bg-card shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                Confirmed Orders
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black text-foreground tracking-tight">
                  {metrics.confirmedCount}
                </span>
                <Badge variant="outline" className="text-[10px] h-4 px-1 border-emerald-300 text-emerald-700 bg-emerald-50">
                  Ready
                </Badge>
              </div>
            </div>
            <div className="size-11 rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400 flex items-center justify-center border border-emerald-200 dark:border-emerald-900 shrink-0">
              <CheckCircle2 className="size-5" />
            </div>
          </CardContent>
        </Card>

        {/* Card 4: Drafts & In-Review */}
        <Card className="border border-slate-500 dark:border-slate-400 bg-card shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                Pending Drafts
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black text-amber-600 dark:text-amber-400 tracking-tight">
                  {metrics.draftCount}
                </span>
                {metrics.draftCount > 0 && (
                  <Badge variant="outline" className="text-[10px] h-4 px-1 border-amber-300 text-amber-700 bg-amber-50">
                    Needs Review
                  </Badge>
                )}
              </div>
            </div>
            <div className="size-11 rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400 flex items-center justify-center border border-amber-200 dark:border-amber-900 shrink-0">
              <Clock className="size-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 2. Search & Filter Bar */}
      <Card className="border border-slate-500 dark:border-slate-400 bg-card shadow-sm">
        <CardContent className="p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
          {/* Search Box */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search by order #, PO ref, or customer name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-8 h-9 text-xs bg-background border-slate-400 focus-visible:ring-1"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          {/* Filter Tabs & CTAs */}
          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-lg bg-muted/60 p-1 border border-slate-300 dark:border-slate-600 text-xs">
              <button
                type="button"
                onClick={() => setStatusFilter("all")}
                className={`px-3 py-1 font-semibold rounded-md transition-colors cursor-pointer ${
                  statusFilter === "all"
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                All ({metrics.totalOrders})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("confirmed")}
                className={`px-3 py-1 font-semibold rounded-md transition-colors cursor-pointer ${
                  statusFilter === "confirmed"
                    ? "bg-background text-emerald-600 shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Confirmed ({metrics.confirmedCount})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("draft")}
                className={`px-3 py-1 font-semibold rounded-md transition-colors cursor-pointer ${
                  statusFilter === "draft"
                    ? "bg-background text-amber-600 shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Drafts ({metrics.draftCount})
              </button>
            </div>

            <Link
              href="/orders/new"
              className="h-9 px-3.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors shrink-0 cursor-pointer"
              title="Create a new manual sales order"
            >
              <Plus className="size-3.5" />
              <span>New Order</span>
            </Link>

            <Link
              href="/upload"
              className="h-9 px-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-background hover:bg-muted/70 text-foreground text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors shrink-0 cursor-pointer"
              title="Upload image or memo to extract order with AI"
            >
              <Sparkles className="size-3.5 text-blue-600" />
              <span className="hidden sm:inline">Extract Order</span>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* 3. The Main Orders Table Card */}
      <Card className="border border-slate-500 dark:border-slate-400 bg-card shadow-sm rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-300 dark:border-slate-700 bg-muted/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="size-4 text-primary" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-foreground">
              Sales Orders List
            </h2>
            <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-slate-400 font-mono">
              {filteredOrders.length} {filteredOrders.length === 1 ? "record" : "records"}
            </Badge>
          </div>

          <span className="text-[11px] text-muted-foreground hidden sm:inline">
            Click any row to review or open order details
          </span>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/40 border-b border-slate-300 dark:border-slate-700">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[180px] font-bold text-[11px] text-muted-foreground uppercase tracking-wider pl-5 py-3">
                  Order / PO Ref
                </TableHead>
                <TableHead className="w-[140px] font-bold text-[11px] text-muted-foreground uppercase tracking-wider py-3">
                  Date
                </TableHead>
                <TableHead className="min-w-[220px] font-bold text-[11px] text-muted-foreground uppercase tracking-wider py-3">
                  Customer Name
                </TableHead>
                <TableHead className="w-[130px] font-bold text-[11px] text-muted-foreground uppercase tracking-wider py-3">
                  Items Count
                </TableHead>
                <TableHead className="w-[160px] font-bold text-[11px] text-muted-foreground uppercase tracking-wider text-right py-3">
                  Total Amount (₹)
                </TableHead>
                <TableHead className="w-[140px] font-bold text-[11px] text-muted-foreground uppercase tracking-wider text-center py-3">
                  Status
                </TableHead>
                <TableHead className="w-[120px] font-bold text-[11px] text-muted-foreground uppercase tracking-wider text-right pr-5 py-3">
                  Action
                </TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {filteredOrders.length > 0 ? (
                filteredOrders.map((order) => {
                  const isDraft = order.status === "draft" || order.status === "pending";

                  return (
                    <TableRow
                      key={order.id}
                      onClick={() => router.push(`/orders/${order.id}`)}
                      className="cursor-pointer hover:bg-blue-50/40 dark:hover:bg-blue-950/20 transition-colors border-b border-slate-200 dark:border-slate-700"
                    >
                      {/* Order Number & PO */}
                      <TableCell className="pl-5 py-3.5 align-middle">
                        <div className="flex flex-col">
                          <span className="font-mono font-bold text-sm text-foreground hover:text-primary transition-colors flex items-center gap-1.5">
                            <FileText className="size-3.5 text-muted-foreground shrink-0" />
                            {order.orderNumber}
                          </span>
                          {order.poNumber && (
                            <span className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                              PO: {order.poNumber}
                            </span>
                          )}
                          {order.sourceReference && !order.poNumber && (
                            <span className="text-[10px] text-muted-foreground/80 truncate max-w-[150px] mt-0.5">
                              Ref: {order.sourceReference}
                            </span>
                          )}
                        </div>
                      </TableCell>

                      {/* Date */}
                      <TableCell className="py-3.5 align-middle text-muted-foreground">
                        <div className="flex items-center gap-1.5 text-xs font-medium">
                          <Calendar className="size-3.5 text-muted-foreground/70 shrink-0" />
                          <span>{order.orderDate}</span>
                        </div>
                      </TableCell>

                      {/* Customer */}
                      <TableCell className="py-3.5 align-middle">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1.5">
                            <User className="size-3.5 text-muted-foreground shrink-0" />
                            <span className="text-xs font-semibold text-foreground">
                              {order.customerName}
                            </span>
                          </div>
                          <div>
                            {order.isCustomerLinked ? (
                              <Badge
                                variant="outline"
                                className="text-[10px] h-4 px-1.5 font-medium border-emerald-300 text-emerald-700 bg-emerald-50 gap-1 inline-flex"
                              >
                                <span className="size-1 rounded-full bg-emerald-500" />
                                Customer Linked
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="text-[10px] h-4 px-1.5 font-medium border-slate-300 text-muted-foreground bg-muted/40 gap-1 inline-flex"
                              >
                                <span className="size-1 rounded-full bg-slate-400" />
                                Not Linked
                              </Badge>
                            )}
                          </div>
                        </div>
                      </TableCell>

                      {/* Items Count */}
                      <TableCell className="py-3.5 align-middle">
                        <div className="flex items-center gap-1.5">
                          <Badge variant="secondary" className="text-xs font-semibold px-2 py-0.5">
                            {order.itemCount} {order.itemCount === 1 ? "item" : "items"}
                          </Badge>
                          {order.totalQuantity > 0 && (
                            <span className="text-[11px] text-muted-foreground">
                              ({order.totalQuantity} pcs)
                            </span>
                          )}
                        </div>
                      </TableCell>

                      {/* Total Amount */}
                      <TableCell className="py-3.5 align-middle text-right">
                        <span className="font-bold text-sm text-foreground tracking-tight">
                          {formatINR(order.totalAmount)}
                        </span>
                      </TableCell>

                      {/* Status */}
                      <TableCell className="py-3.5 align-middle text-center">
                        {isDraft ? (
                          <Badge
                            variant="outline"
                            className="border-amber-400 text-amber-700 bg-amber-50 gap-1 text-[11px] font-semibold py-0.5 px-2.5 inline-flex"
                          >
                            <span className="size-1.5 rounded-full bg-amber-500 animate-pulse" />
                            Draft
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="border-emerald-400 text-emerald-700 bg-emerald-50 gap-1 text-[11px] font-semibold py-0.5 px-2.5 inline-flex"
                          >
                            <span className="size-1.5 rounded-full bg-emerald-500" />
                            Confirmed
                          </Badge>
                        )}
                      </TableCell>

                      {/* Actions */}
                      <TableCell className="pr-5 py-3.5 align-middle text-right">
                        <Link
                          href={`/orders/${order.id}`}
                          onClick={(e: React.MouseEvent) => e.stopPropagation()}
                          className={`inline-flex items-center gap-1 h-7 px-2.5 rounded-md text-xs font-semibold transition-colors ${
                            isDraft
                              ? "bg-amber-100 hover:bg-amber-200 text-amber-800"
                              : "bg-blue-50 hover:bg-blue-100 text-blue-700"
                          }`}
                        >
                          <span>{isDraft ? "Review" : "View"}</span>
                          <ArrowUpRight className="size-3" />
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12">
                    <div className="max-w-sm mx-auto flex flex-col items-center justify-center space-y-3">
                      <div className="size-12 rounded-2xl bg-muted flex items-center justify-center text-muted-foreground border border-slate-300 dark:border-slate-700">
                        <FileSpreadsheet className="size-6" />
                      </div>
                      <div className="space-y-1 text-center">
                        <h3 className="text-sm font-bold text-foreground">No orders found</h3>
                        <p className="text-xs text-muted-foreground">
                          {searchQuery
                            ? `No orders matching "${searchQuery}". Try clearing the search query.`
                            : "There are no sales orders in this view yet."}
                        </p>
                      </div>
                      {searchQuery ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSearchQuery("")}
                          className="text-xs h-8 border-slate-400"
                        >
                          Clear Search
                        </Button>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Link
                            href="/orders/new"
                            className="h-8 px-3 rounded-md bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold inline-flex items-center gap-1.5 shadow-xs"
                          >
                            <Plus className="size-3.5" />
                            Create New Order
                          </Link>
                          <Link
                            href="/upload"
                            className="h-8 px-3 rounded-md border border-slate-300 dark:border-slate-600 bg-background hover:bg-muted text-foreground text-xs font-semibold inline-flex items-center gap-1.5 shadow-xs"
                          >
                            <Sparkles className="size-3.5 text-blue-600" />
                            Extract from Image
                          </Link>
                        </div>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Table Footer Summary */}
        <div className="px-5 py-3 border-t border-slate-300 dark:border-slate-700 bg-muted/20 flex flex-col sm:flex-row items-center justify-between text-xs text-muted-foreground gap-2">
          <span>
            Showing <strong className="text-foreground">{filteredOrders.length}</strong> of{" "}
            <strong className="text-foreground">{initialOrders.length}</strong> total orders
          </span>
          <div className="flex items-center gap-4">
            <span>
              Filtered Value:{" "}
              <strong className="text-foreground font-semibold">
                {formatINR(filteredOrders.reduce((acc, o) => acc + (o.totalAmount || 0), 0))}
              </strong>
            </span>
          </div>
        </div>
      </Card>
    </div>
  );
}

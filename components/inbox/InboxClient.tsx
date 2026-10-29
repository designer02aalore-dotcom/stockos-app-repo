import { useState, useEffect, useCallback } from "react";
import { Link, useRouter, useSearchParams } from "@/lib/router";
import { formatINR } from "@/lib/utils";
import { playOrderDetectedChime } from "@/lib/audio/chime";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Mail,
  RefreshCw,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  FileText,
  Clock,
  Send,
  Building2,
  Package,
  Search,
  Unlink,
  ChevronDown,
  ChevronUp,
  Inbox,
  AlertTriangle,
  Activity,
  ShoppingCart,
  Calendar,
  X,
  FileUp,
  ArrowLeft,
  History,
  Check,
} from "lucide-react";

export interface EmailImportRecord {
  id: string;
  source_type: string;
  source_reference: string | null;
  customer_id: string | null;
  sales_order_id: string | null;
  extracted_data: any;
  processing_status: string | null;
  created_at: string;
}

interface InboxClientProps {
  initialConnected: boolean;
  initialUserEmail: string | null;
  initialOrders: EmailImportRecord[];
}

const SAMPLE_EMAIL = {
  subject: "Purchase Order - Primary School Book Sets 2026",
  fromName: "Cambridge Exp. School",
  fromEmail: "purchasing@cambridge.org",
  bodyText: `Dear Sales Team,

Please accept and process our purchase order for the upcoming academic session:

1. आनंदी मराठी Std 1 - Quantity: 15 copies - Rate: ₹120 each
2. आनंदी मराठी Std 2 - Quantity: 20 copies - Rate: ₹130 each
3. WTW GK 2 - Quantity: 10 copies - Rate: ₹145 each
4. Lets write English MO 5 - Quantity: 8 copies - Rate: ₹125 each

Delivery Address:
Cambridge Exp. School, Main Road, Pusad, Maharashtra
Phone: 9823450791

Please deliver by this Friday.

Regards,
Mr. Sharma, Principal`,
};

export function InboxClient({
  initialConnected,
  initialUserEmail,
  initialOrders,
}: InboxClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [connected, setConnected] = useState(initialConnected);
  const [userEmail, setUserEmail] = useState<string | null>(initialUserEmail);
  const [orders, setOrders] = useState<EmailImportRecord[]>(initialOrders);

  // Auto-Scan State
  const [autoScanEnabled, setAutoScanEnabled] = useState(false);
  const [scanInterval, setScanInterval] = useState(60);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [secondsRemaining, setSecondsRemaining] = useState(60);

  // Status & loading states
  const [isScanning, setIsScanning] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(
    searchParams.get("error") || null
  );
  const [hasAuthExpired, setHasAuthExpired] = useState(
    Boolean(searchParams.get("error")?.includes("invalid_grant"))
  );
  const [successBanner, setSuccessBanner] = useState<string | null>(
    searchParams.get("connected") ? "Gmail connected successfully!" : null
  );

  // Simulation form modal / drawer
  const [showSimulate, setShowSimulate] = useState(false);
  const [simSubject, setSimSubject] = useState(SAMPLE_EMAIL.subject);
  const [simFromName, setSimFromName] = useState(SAMPLE_EMAIL.fromName);
  const [simFromEmail, setSimFromEmail] = useState(SAMPLE_EMAIL.fromEmail);
  const [simBody, setSimBody] = useState(SAMPLE_EMAIL.bodyText);

  // UI Panels & Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "needs_review" | "pending" | "confirmed">("all");
  const [expandedEvidenceId, setExpandedEvidenceId] = useState<string | null>(null);


  // Selected orders for bulk actions
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);

  useEffect(() => {
    setOrders(initialOrders);
  }, [initialOrders]);

  // Realtime Supabase listener: Automatically refresh inbox when any order is imported
  useEffect(() => {
    let supabase: any;
    try {
      supabase = createClient();
    } catch {
      return;
    }

    const channel = supabase
      .channel("realtime-inbox-order-imports")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "order_imports",
        },
        () => {
          console.log("[InboxClient] New order imported into DB via Realtime, refreshing view...");
          router.refresh();
        }
      )
      .subscribe();

    return () => {
      if (supabase && channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [router]);

  // Load Auto-Scan configuration
  const loadAutoScanConfig = useCallback(async () => {
    try {
      const res = await fetch("/api/extract/email/auto-scan");
      if (!res.ok) {
        if (res.status === 401) setHasAuthExpired(true);
        return;
      }
      const data = await res.json();
      if (data.success && data.config) {
        setAutoScanEnabled(data.config.enabled);
        setScanInterval(data.config.intervalSeconds || 60);
        setSoundEnabled(data.config.soundEnabled);
        if (data.config.lastScanStatus?.includes("invalid_grant") || data.config.lastScanStatus?.includes("expired")) {
          setHasAuthExpired(true);
        }
      }
    } catch (err) {
      console.debug("[InboxClient] Error loading auto-scan config:", err);
    }
  }, []);

  useEffect(() => {
    loadAutoScanConfig();
  }, [loadAutoScanConfig]);

  const updateAutoScanSettings = async (updates: { enabled?: boolean; intervalSeconds?: number }) => {
    if (typeof updates.enabled === "boolean") setAutoScanEnabled(updates.enabled);
    if (typeof updates.intervalSeconds === "number") {
      setScanInterval(updates.intervalSeconds);
      setSecondsRemaining(updates.intervalSeconds);
    }

    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("stockos:scanner-state-changed", {
          detail: {
            enabled: typeof updates.enabled === "boolean" ? updates.enabled : autoScanEnabled,
            intervalSeconds: updates.intervalSeconds || scanInterval,
          },
        })
      );
    }

    try {
      await fetch("/api/extract/email/auto-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
    } catch (err) {
      console.error("[InboxClient] Failed to persist auto-scan settings:", err);
    }
  };

  const runScanCycle = useCallback(
    async (isManual = false) => {
      if (isScanning || !connected) return;
      setIsScanning(true);
      setScanMessage(
        isManual
          ? "Scanning Gmail inbox for new purchase orders..."
          : "Auto-scanning Gmail inbox..."
      );

      try {
        const res = await fetch("/api/extract/email/auto-scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ triggerScan: true }),
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || "Auto-scan failed");
        }

        const scanResult = data.scanResult;

        if (scanResult && scanResult.importedCount > 0) {
          const statusText = `Found ${scanResult.importedCount} new order(s)!`;
          setScanMessage(`🎉 ${statusText} AI has extracted the line items into drafts.`);

          if (soundEnabled) {
            playOrderDetectedChime();
          }

          router.refresh();
        } else {
          const statusText = `Checked ${scanResult?.totalFound || 0} unread email(s) — no new purchase orders`;
          setScanMessage(statusText);
          router.refresh();
        }
      } catch (err: any) {
        const isGrantErr = Boolean(
          err.message?.includes("invalid_grant") ||
          err.message?.includes("expired or revoked")
        );
        if (isGrantErr) {
          setHasAuthExpired(true);
          setAutoScanEnabled(false);
        }
        setErrorMessage(err.message || "Failed to scan Gmail inbox");
        setScanMessage(null);
      } finally {
        setIsScanning(false);
        setSecondsRemaining(scanInterval);
      }
    },
    [isScanning, connected, soundEnabled, scanInterval, router]
  );

  // Removed continuous setInterval loop to prevent server load & quota exhaustion
  // Scans now run via Webhook push notification or when user clicks "Scan Now"

  const handleDisconnect = async () => {
    if (!confirm("Are you sure you want to disconnect this Gmail account?")) return;
    setIsDisconnecting(true);
    try {
      const res = await fetch("/api/extract/email/disconnect", { method: "POST" });
      if (res.ok) {
        setConnected(false);
        setUserEmail(null);
        setSuccessBanner("Gmail account disconnected.");
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to disconnect Gmail");
    } finally {
      setIsDisconnecting(false);
    }
  };

  const handleSimulateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!simBody.trim()) {
      setErrorMessage("Please enter email body text.");
      return;
    }

    setIsSimulating(true);
    setErrorMessage(null);
    setSuccessBanner(null);

    try {
      const res = await fetch("/api/extract/email/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: simSubject,
          fromName: simFromName,
          fromEmail: simFromEmail,
          bodyText: simBody,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to process simulated order");
      }

      if (soundEnabled) {
        playOrderDetectedChime();
      }

      router.push(`/orders/${data.importId}`);
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to extract order from email text");
      setIsSimulating(false);
    }
  };

  const isNeedsReview = (o: EmailImportRecord) => {
    const ext = o.extracted_data || {};
    return (
      !o.sales_order_id &&
      (o.processing_status === "review" ||
        o.processing_status === "needs_review" ||
        Boolean(ext._classification?.requiresReview) ||
        ext._classification?.category === "ambiguous" ||
        (ext._classification?.confidence != null && ext._classification.confidence < 0.75) ||
        (ext.items || []).length === 0)
    );
  };

  const needsReviewOrdersCount = orders.filter((o) => isNeedsReview(o)).length;
  const pendingOrdersCount = orders.filter((o) => !o.sales_order_id && !isNeedsReview(o)).length;
  const confirmedOrdersCount = orders.filter((o) => !!o.sales_order_id).length;
  const totalOrderValue = orders.reduce((sum, o) => sum + (Number(o.extracted_data?.total) || 0), 0);

  const filteredOrders = orders.filter((o) => {
    const extracted = o.extracted_data || {};
    const customer = extracted.customer?.name || "";
    const po = extracted.po_number || "";
    const subject = extracted._email_source?.subject || o.source_reference || "";

    const matchesSearch =
      customer.toLowerCase().includes(searchTerm.toLowerCase()) ||
      po.toLowerCase().includes(searchTerm.toLowerCase()) ||
      subject.toLowerCase().includes(searchTerm.toLowerCase());

    if (!matchesSearch) return false;

    if (statusFilter === "needs_review") {
      return isNeedsReview(o);
    }
    if (statusFilter === "pending") {
      return !o.sales_order_id && !isNeedsReview(o);
    }
    if (statusFilter === "confirmed") {
      return !!o.sales_order_id;
    }
    return true;
  });

  const toggleSelectAll = () => {
    if (selectedOrderIds.length === filteredOrders.length) {
      setSelectedOrderIds([]);
    } else {
      setSelectedOrderIds(filteredOrders.map((o) => o.id));
    }
  };

  const toggleSelectOrder = (id: string) => {
    setSelectedOrderIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };



  const isInvalidGrant = Boolean(
    hasAuthExpired ||
    errorMessage?.includes("invalid_grant") ||
    errorMessage?.includes("expired or revoked")
  );

  return (
    <div className="space-y-6">
      {/* Top Banner: Navigation & Notifications */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-1">
        <div className="flex items-center gap-3">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-200 text-xs font-semibold shadow-2xs transition-all cursor-pointer group shrink-0 active:scale-95"
            title="Back to Home"
          >
            <ArrowLeft className="size-3.5 text-slate-500 group-hover:text-slate-900 dark:text-slate-400 dark:group-hover:text-slate-100 transition-transform group-hover:-translate-x-0.5" />
            <span>Back</span>
          </Link>
          <div>
            <h1 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
              <span>Order Intake & Triage Hub</span>
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100">
                StockOS AI
              </span>
            </h1>
            <p className="text-xs text-slate-500">
              Live automated purchase order intake, AI classification & verification
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            to="/orders"
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl border border-slate-200/90 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs transition"
          >
            <History className="size-3.5 text-slate-500" />
            <span>Order History</span>
          </Link>

          <Button
            size="sm"
            onClick={() => setShowSimulate(!showSimulate)}
            variant="outline"
            className="h-9 px-3.5 text-xs font-semibold rounded-xl border-purple-200 text-purple-700 hover:bg-purple-50 shadow-2xs gap-1.5"
          >
            <Sparkles className="size-3.5 text-purple-600" />
            <span>Simulate Order</span>
          </Button>

          <Link
            to="/upload"
            className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-blue-700 transition gap-1.5 h-9"
          >
            <FileUp className="size-3.5" />
            <span>+ Ingest Order</span>
          </Link>
        </div>
      </div>

      {/* Notifications */}
      {successBanner && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/90 p-4 text-emerald-800 flex items-center justify-between shadow-2xs animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="size-5 text-emerald-600 shrink-0" />
            <p className="text-xs sm:text-sm font-semibold">{successBanner}</p>
          </div>
          <button
            onClick={() => setSuccessBanner(null)}
            className="text-emerald-700 hover:text-emerald-900 text-xs font-bold px-2 py-1"
          >
            ✕
          </button>
        </div>
      )}

      {errorMessage && !isInvalidGrant && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50/90 p-4 text-rose-800 flex items-center justify-between shadow-2xs animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="size-5 text-rose-600 shrink-0" />
            <p className="text-xs sm:text-sm font-semibold">{errorMessage}</p>
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-rose-700 hover:text-rose-900 text-xs font-bold px-2 py-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* Prominent invalid_grant Action Banner */}
      {isInvalidGrant && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50/95 p-5 text-amber-950 shadow-sm animate-in fade-in">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-2xl bg-amber-100 border border-amber-200 flex items-center justify-center shrink-0 text-amber-700 mt-0.5">
                <AlertTriangle className="size-5" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-amber-950">
                    Gmail Authorization Expired (invalid_grant)
                  </h3>
                  <Badge className="bg-amber-200 text-amber-900 border-amber-300 hover:bg-amber-200 text-[10px] px-2 py-0.5">
                    Action Required
                  </Badge>
                </div>
                <p className="text-xs text-amber-800 leading-relaxed max-w-2xl">
                  Your Google OAuth token has expired or was revoked. If your OAuth Consent Screen in Google Cloud Console is set to <strong>Testing</strong>, refresh tokens automatically expire after <strong>7 days</strong>.
                </p>
                <div className="text-[11px] text-amber-700 pt-1 flex flex-wrap items-center gap-x-4 gap-y-1 font-medium">
                  <span>⚡ <strong>Quick fix:</strong> Click &quot;Reconnect Gmail Account&quot; to authorize and save a fresh refresh token.</span>
                  <span>🛡️ <strong>Permanent fix:</strong> In Google Cloud Console &rarr; OAuth consent screen, publish to &quot;Production&quot; so tokens never expire in 7 days.</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2.5 shrink-0 self-end md:self-center">
              <a
                href="/api/extract/email"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-xs transition"
              >
                <RefreshCw className="size-3.5" />
                <span>Reconnect Gmail Account</span>
              </a>
            </div>
          </div>
        </div>
      )}

      {/* 1. Gmail Sync Status Banner (Screen 1 Mockup) */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-4 sm:p-5 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-red-50/80 flex items-center justify-center border border-red-100 shadow-2xs shrink-0">
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#EA4335" d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z"/>
            </svg>
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-bold text-slate-900">Gmail sync status</h2>
              {isInvalidGrant ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-600 animate-pulse" />
                  Session Expired — Reconnect Required
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-100">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse" />
                  Listening to incoming POs and school orders
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {connected ? (
                <>Connected as <span className="font-semibold text-slate-800">{userEmail}</span> • Auto-scan: {autoScanEnabled ? `Continuous (every ${scanInterval}s)` : "Active on notification"}</>
              ) : (
                "Connect your school sales inbox to automatically convert purchase order emails into drafts."
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {connected ? (
            <>
              <a
                href="/api/extract/email"
                className={`inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl text-xs font-bold shadow-2xs transition ${
                  isInvalidGrant
                    ? "bg-amber-600 hover:bg-amber-700 text-white"
                    : "border border-slate-200 bg-white hover:bg-slate-50 text-slate-700"
                }`}
                title="Sign in with Google to refresh or reconnect OAuth access"
              >
                <RefreshCw className={`size-3.5 ${isInvalidGrant ? "text-white" : "text-slate-500"}`} />
                <span>Reconnect Gmail</span>
              </a>

              {!isInvalidGrant && (
                <>
                  <Button
                    size="sm"
                    onClick={() => runScanCycle(true)}
                    disabled={isScanning}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-9 px-4 gap-2 shadow-xs rounded-xl"
                  >
                    <RefreshCw className={`size-3.5 ${isScanning ? "animate-spin" : ""}`} />
                    {isScanning ? "Scanning Gmail..." : "Scan Now"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => updateAutoScanSettings({ enabled: !autoScanEnabled })}
                    className={`text-xs h-9 px-3 gap-1.5 rounded-xl border ${autoScanEnabled ? "bg-emerald-50 text-emerald-800 border-emerald-200 font-semibold" : "text-slate-600"}`}
                  >
                    <Activity className="size-3.5" />
                    {autoScanEnabled ? "Auto-Scan ON" : "Auto-Scan OFF"}
                  </Button>
                </>
              )}

              <Button
                size="sm"
                variant="ghost"
                onClick={handleDisconnect}
                disabled={isDisconnecting}
                className="text-xs h-9 px-2 text-rose-600 hover:bg-rose-50 rounded-xl"
                title="Disconnect Gmail"
              >
                <Unlink className="size-3.5" />
              </Button>
            </>
          ) : (
            <a
              href="/api/extract/email"
              className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 transition gap-2"
            >
              <Mail className="size-4" />
              Connect Gmail Account
            </a>
          )}
        </div>
      </div>

      {/* 2. Top Metric Cards (KPIs - Screen 1 Mockup) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Orders */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">Total Orders</p>
            <p className="text-3xl font-black text-slate-900 mt-1">{orders.length}</p>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100 shadow-2xs">
            <ShoppingCart className="size-5" />
          </div>
        </div>

        {/* Pending Review */}
        <div className="rounded-2xl border border-amber-200/90 bg-amber-50/20 p-5 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-amber-800">Pending Review</p>
            <div className="flex items-baseline gap-2 mt-1">
              <p className="text-3xl font-black text-amber-900">{needsReviewOrdersCount}</p>
              <span className="text-[11px] font-semibold text-amber-800 bg-amber-100/90 px-2 py-0.5 rounded-full">
                flagged by AI
              </span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-amber-100/80 text-amber-700 flex items-center justify-center border border-amber-200 shadow-2xs">
            <AlertTriangle className="size-5" />
          </div>
        </div>

        {/* Verified Drafts */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">Verified Drafts</p>
            <p className="text-3xl font-black text-emerald-700 mt-1">{pendingOrdersCount}</p>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100 shadow-2xs">
            <CheckCircle2 className="size-5" />
          </div>
        </div>

        {/* Total Order Value */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">Total Order Value</p>
            <p className="text-2xl sm:text-3xl font-black text-slate-900 mt-1 truncate">
              {formatINR(totalOrderValue)}
            </p>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center border border-purple-100 shadow-2xs">
            <Building2 className="size-5" />
          </div>
        </div>
      </div>

      {/* Simulator Modal Form (Collapsible) */}
      {showSimulate && (
        <div className="rounded-2xl border border-purple-200 bg-gradient-to-br from-purple-50/40 via-white to-white p-5 shadow-sm animate-in fade-in space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-purple-600 text-white flex items-center justify-center shadow-xs">
                <FileText className="size-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Test Order Extraction via Email Simulator</h3>
                <p className="text-xs text-slate-500">Paste any book requisition text or load sample school purchase order.</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setSimSubject(SAMPLE_EMAIL.subject);
                  setSimFromName(SAMPLE_EMAIL.fromName);
                  setSimFromEmail(SAMPLE_EMAIL.fromEmail);
                  setSimBody(SAMPLE_EMAIL.bodyText);
                }}
                className="text-xs h-8 text-purple-700 border-purple-200 hover:bg-purple-50 rounded-xl"
              >
                Load Sample Order
              </Button>
              <button
                onClick={() => setShowSimulate(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="size-4" />
              </button>
            </div>
          </div>

          <form onSubmit={handleSimulateSubmit} className="space-y-3 pt-1">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">Subject</label>
                <Input
                  value={simSubject}
                  onChange={(e) => setSimSubject(e.target.value)}
                  placeholder="e.g. Purchase Order for Class Books"
                  className="h-8 text-xs bg-white rounded-xl"
                  required
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">School / Customer Name</label>
                <Input
                  value={simFromName}
                  onChange={(e) => setSimFromName(e.target.value)}
                  placeholder="e.g. Cambridge School"
                  className="h-8 text-xs bg-white rounded-xl"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">Sender Email</label>
                <Input
                  type="email"
                  value={simFromEmail}
                  onChange={(e) => setSimFromEmail(e.target.value)}
                  placeholder="orders@school.edu"
                  className="h-8 text-xs bg-white rounded-xl"
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-700 block mb-1">Email Body Content</label>
              <textarea
                rows={5}
                value={simBody}
                onChange={(e) => setSimBody(e.target.value)}
                placeholder="Paste requisition slip text here..."
                className="w-full text-xs font-mono p-3 rounded-xl border border-slate-300 bg-white focus:outline-hidden focus:ring-2 focus:ring-purple-500/20"
                required
              />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowSimulate(false)}
                className="text-xs h-8 rounded-xl"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSimulating}
                className="bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs h-8 px-4 rounded-xl gap-2 shadow-xs"
              >
                <Sparkles className={`size-3.5 ${isSimulating ? "animate-spin" : ""}`} />
                {isSimulating ? "Extracting with AI..." : "Extract & Review Draft"}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* 3. Filter Toolbar (Screen 1 Mockup) */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white p-3 sm:p-3.5 rounded-2xl border border-slate-200/90 shadow-xs">
        <div className="flex flex-1 items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search order #, school or item..."
              className="h-9 text-xs pl-9 bg-slate-50/70 border-slate-200 rounded-xl"
            />
          </div>

          {/* Segmented Filter Pills */}
          <div className="hidden sm:flex items-center bg-slate-100/80 p-1 rounded-xl text-xs font-medium">
            <button
              onClick={() => setStatusFilter("all")}
              className={`px-3 py-1.5 rounded-lg transition ${
                statusFilter === "all"
                  ? "bg-white text-slate-900 shadow-2xs font-bold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              All
            </button>
            <button
              onClick={() => setStatusFilter("needs_review")}
              className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 ${
                statusFilter === "needs_review"
                  ? "bg-white text-amber-900 shadow-2xs font-bold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <span>Pending Review</span>
              {needsReviewOrdersCount > 0 && (
                <span className="w-4 h-4 rounded-full bg-amber-100 text-amber-800 text-[10px] font-extrabold flex items-center justify-center">
                  {needsReviewOrdersCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setStatusFilter("pending")}
              className={`px-3 py-1.5 rounded-lg transition ${
                statusFilter === "pending"
                  ? "bg-white text-emerald-900 shadow-2xs font-bold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Auto-Drafted ({pendingOrdersCount})
            </button>
            <button
              onClick={() => setStatusFilter("confirmed")}
              className={`px-3 py-1.5 rounded-lg transition ${
                statusFilter === "confirmed"
                  ? "bg-white text-blue-900 shadow-2xs font-bold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Confirmed ({confirmedOrdersCount})
            </button>
          </div>
        </div>

      </div>

      {/* 4. Orders Table (Full Width) */}
      <div className="w-full">
          <div className="rounded-2xl border border-slate-200/90 bg-white shadow-xs overflow-hidden">
            {filteredOrders.length === 0 ? (
              <div className="p-12 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
                  <Inbox className="size-6" />
                </div>
                <h3 className="text-sm font-bold text-slate-800">
                  {orders.length === 0 ? "No email orders scanned yet" : "No orders match your filter criteria"}
                </h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  {orders.length === 0
                    ? "Click 'Scan Now' above to check your Gmail inbox or test extraction using the simulator."
                    : "Try adjusting your search query or switching tabs."}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/70 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                      <th className="py-3 px-4 w-10">
                        <input
                          type="checkbox"
                          checked={selectedOrderIds.length === filteredOrders.length && filteredOrders.length > 0}
                          onChange={toggleSelectAll}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500/20"
                        />
                      </th>
                      <th className="py-3 px-3">Order / PO #</th>
                      <th className="py-3 px-3">Customer / School Name</th>
                      <th className="py-3 px-3">Channel</th>
                      <th className="py-3 px-3 text-center">Items</th>
                      <th className="py-3 px-3">Total Amount</th>
                      <th className="py-3 px-3 text-center">AI Confidence</th>
                      <th className="py-3 px-3 text-center">Status</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredOrders.map((order) => {
                      const ext = order.extracted_data || {};
                      const emailSource = ext._email_source || {};
                      const classification = ext._classification || {};
                      const items = ext.items || [];
                      const totalAmount = ext.total || 0;
                      const customerName = ext.customer?.name || "Customer";
                      const isConfirmed = !!order.sales_order_id;
                      const needsReview = isNeedsReview(order);
                      const poDisplay = ext.po_number || order.source_reference?.slice(0, 10) || order.id.slice(0, 8);
                      const confidencePercent = Math.round((classification.confidence || 0.85) * 100);

                      return (
                        <tr
                          key={order.id}
                          className={`hover:bg-slate-50/80 transition-colors group ${
                            needsReview ? "bg-amber-50/15" : ""
                          }`}
                        >
                          <td className="py-3.5 px-4">
                            <input
                              type="checkbox"
                              checked={selectedOrderIds.includes(order.id)}
                              onChange={() => toggleSelectOrder(order.id)}
                              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500/20"
                            />
                          </td>

                          {/* Order / PO # */}
                          <td className="py-3.5 px-3 whitespace-nowrap">
                            <Link
                              to={`/orders/${order.id}`}
                              className="font-bold text-blue-600 hover:text-blue-800 transition flex items-center gap-1.5"
                            >
                              <span>{poDisplay}</span>
                            </Link>
                          </td>

                          {/* Customer / School Name */}
                          <td className="py-3.5 px-3 min-w-[180px]">
                            <div className="font-bold text-slate-900 group-hover:text-blue-600 transition">
                              {customerName}
                            </div>
                            <div className="text-[11px] text-slate-500 truncate max-w-xs">
                              {emailSource.from || emailSource.subject || "Order Ingested"}
                            </div>
                          </td>

                          {/* Channel Badge */}
                          <td className="py-3.5 px-3 whitespace-nowrap">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200/80">
                              <span className="w-3.5 h-3.5 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-[9px] font-black">
                                M
                              </span>
                              <span>Email Gmail</span>
                            </span>
                          </td>

                          {/* Items Count */}
                          <td className="py-3.5 px-3 text-center whitespace-nowrap">
                            <span className="font-bold text-slate-800">{items.length}</span>
                          </td>

                          {/* Total Amount */}
                          <td className="py-3.5 px-3 whitespace-nowrap">
                            <span className="font-black text-slate-900">{formatINR(totalAmount)}</span>
                          </td>

                          {/* AI Confidence */}
                          <td className="py-3.5 px-3 text-center whitespace-nowrap">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-black ${
                                confidencePercent >= 85
                                  ? "bg-emerald-100/80 text-emerald-800 border border-emerald-200"
                                  : confidencePercent >= 70
                                  ? "bg-amber-100/80 text-amber-800 border border-amber-200"
                                  : "bg-purple-100/80 text-purple-800 border border-purple-200"
                              }`}
                            >
                              {confidencePercent}%
                            </span>
                          </td>

                          {/* Status Badge */}
                          <td className="py-3.5 px-3 text-center whitespace-nowrap">
                            {isConfirmed ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                Approved
                              </span>
                            ) : needsReview ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                                Pending Review
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                                Draft
                              </span>
                            )}
                          </td>

                          {/* Action Button */}
                          <td className="py-3.5 px-4 text-right whitespace-nowrap">
                            <Link
                              to={`/orders/${order.id}`}
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition shadow-2xs ${
                                needsReview
                                  ? "bg-amber-600 hover:bg-amber-700 text-white"
                                  : "bg-white hover:bg-slate-50 text-slate-700 border border-slate-200/90"
                              }`}
                            >
                              <span>{needsReview ? "Inspect" : "Review Draft"}</span>
                              <ArrowRight className="size-3" />
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Link, useRouter } from "@/lib/router";
import { formatINR } from "@/lib/utils";
import { playOrderDetectedChime } from "@/lib/audio/chime";
import {
  Mail,
  Sparkles,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  X,
  ArrowRight,
  Volume2,
  VolumeX,
  Clock,
  Play,
  Pause,
  ExternalLink,
  ChevronDown,
  Building2,
  Package,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export interface AutoScanState {
  enabled: boolean;
  intervalSeconds: number;
  soundEnabled: boolean;
  autoOpenReview: boolean;
  markAsRead: boolean;
  lastScanAt: string | null;
  lastScanStatus: string | null;
  lastNewOrdersCount: number;
}

export interface DetectedOrder {
  importId: string;
  customerName?: string;
  itemsCount?: number;
  total?: number;
  subject?: string;
  from?: string;
}

export function GlobalAutoScanner() {
  const router = useRouter();

  const [connected, setConnected] = useState<boolean | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [config, setConfig] = useState<AutoScanState>({
    enabled: false, // OFF by default: entering software does NOT trigger auto-scan
    intervalSeconds: 60,
    soundEnabled: true,
    autoOpenReview: false,
    markAsRead: true,
    lastScanAt: null,
    lastScanStatus: null,
    lastNewOrdersCount: 0,
  });

  const [isScanning, setIsScanning] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState<number>(60);
  const [hasAuthExpired, setHasAuthExpired] = useState(false);
  const [detectedOrders, setDetectedOrders] = useState<DetectedOrder[]>([]);
  const [showNotification, setShowNotification] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close popover when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setPopoverOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Fetch initial auto-scan config & connection status
  const loadConfig = useCallback(async () => {
    try {
      const res = await fetch("/api/extract/email/auto-scan");
      if (!res.ok) {
        if (res.status === 401) setHasAuthExpired(true);
        return;
      }
      const data = await res.json();
      if (data.success) {
        setConnected(data.connected);
        setUserEmail(data.userEmail);
        if (data.config) {
          setConfig(data.config);
          setSecondsRemaining(data.config.intervalSeconds || 60);
          if (data.config.lastScanStatus?.includes("invalid_grant") || data.config.lastScanStatus?.includes("expired")) {
            setHasAuthExpired(true);
          }
        }
      }
    } catch (err) {
      console.debug("[GlobalAutoScanner] Error loading status:", err);
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  // Execute scan pass
  const executeScan = useCallback(
    async (manual = false) => {
      if (isScanning) return;
      setIsScanning(true);

      try {
        const res = await fetch("/api/extract/email/auto-scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ triggerScan: true }),
        });

        if (!res.ok) {
          if (res.status === 401) {
            setConfig((prev) => ({ ...prev, enabled: false }));
            setHasAuthExpired(true);
            console.warn("[GlobalAutoScanner] Gmail session expired (invalid_grant). Pausing auto-scan loop.");
          }
          setIsScanning(false);
          return;
        }

        const data = await res.json();
        setHasAuthExpired(false);
        if (data.config) {
          setConfig(data.config);
          setSecondsRemaining(data.config.intervalSeconds || 60);
        }

        const scanResult = data.scanResult;
        if (scanResult && scanResult.importedCount > 0) {
          const importedItems: DetectedOrder[] = (scanResult.results || [])
            .filter((r: any) => r.status === "imported")
            .map((r: any) => ({
              importId: r.importId,
              customerName: r.customerName || "Customer",
              itemsCount: r.itemsCount || 0,
              total: r.total || 0,
              subject: r.subject || "Order from Email",
              from: r.from || "",
            }));

          if (importedItems.length > 0) {
            setDetectedOrders(importedItems);
            setShowNotification(true);

            // Play notification sound if enabled
            if (config.soundEnabled) {
              playOrderDetectedChime();
            }

            // Dispatch global event for other components to react
            if (typeof window !== "undefined") {
              window.dispatchEvent(
                new CustomEvent("stockos:email-order-detected", {
                  detail: { orders: importedItems },
                })
              );

              // Request desktop notification if supported
              if ("Notification" in window && Notification.permission === "granted") {
                const first = importedItems[0];
                new Notification("StockOS: New Order Email Detected! 📬", {
                  body: `${first.customerName} - ${first.itemsCount} items (${formatINR(first.total || 0)})`,
                  icon: "/favicon.svg",
                });
              }
            }

            // Auto redirect if configured
            if (config.autoOpenReview && importedItems[0]?.importId) {
              router.push(`/orders/${importedItems[0].importId}`);
            }
          }
        }
      } catch (err) {
        console.warn("[GlobalAutoScanner] Scan cycle failed:", err);
      } finally {
        setIsScanning(false);
      }
    },
    [isScanning, config.soundEnabled, config.autoOpenReview, router]
  );

  // Event-driven execution (NO continuous 30s background loop)
  useEffect(() => {
    // When manual scan or push notification trigger occurs
    function handleManualTrigger() {
      executeScan(true);
    }

    window.addEventListener("stockos:trigger-manual-email-scan", handleManualTrigger);
    return () => {
      window.removeEventListener("stockos:trigger-manual-email-scan", handleManualTrigger);
    };
  }, [executeScan]);

  // Request browser notification permissions once on user interaction
  const requestNotificationPermission = async () => {
    if (typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission === "default") {
        await Notification.requestPermission();
      }
    }
  };

  // Update config
  const updateSettings = async (updates: Partial<AutoScanState>) => {
    const newConfig = { ...config, ...updates };
    setConfig(newConfig);

    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("stockos:scanner-state-changed", {
          detail: { enabled: newConfig.enabled, intervalSeconds: newConfig.intervalSeconds },
        })
      );
    }

    try {
      await fetch("/api/extract/email/auto-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (updates.intervalSeconds) {
        setSecondsRemaining(updates.intervalSeconds);
      }
    } catch (err) {
      console.error("[GlobalAutoScanner] Failed to update config:", err);
    }
  };

  // If Gmail is not connected, we still provide an indicator pointing to connect
  return (
    <>
      {/* Floating Status Pill (Fixed at Bottom-Right or Top-Right) */}
      <div className="fixed bottom-4 right-4 z-40" ref={popoverRef}>
        {/* Toggle Pill Button */}
        <div className="relative inline-flex items-center">
          <button
            onClick={() => {
              setPopoverOpen(!popoverOpen);
              requestNotificationPermission();
            }}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold shadow-lg backdrop-blur-md border transition-all duration-200 ${
              hasAuthExpired
                ? "bg-amber-600 text-white border-amber-500 shadow-amber-500/20 hover:bg-amber-700"
                : !connected
                ? "bg-white/95 text-slate-600 border-slate-200 hover:bg-slate-50"
                : isScanning
                ? "bg-blue-600 text-white border-blue-500 shadow-blue-500/20"
                : config.enabled
                ? "bg-slate-900/90 text-white border-slate-800 hover:bg-slate-900 shadow-emerald-500/10"
                : "bg-white/90 text-slate-700 border-slate-200 hover:bg-white"
            }`}
            title="StockOS Email Auto-Scanner"
          >
            {/* Radar / Pulsing Indicator */}
            <span className="relative flex h-2 w-2">
              {hasAuthExpired && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-300 opacity-75" />
              )}
              {connected && config.enabled && !isScanning && !hasAuthExpired && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              )}
              {isScanning && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-300 opacity-75" />
              )}
              <span
                className={`relative inline-flex rounded-full h-2 w-2 ${
                  hasAuthExpired
                    ? "bg-amber-200"
                    : !connected
                    ? "bg-slate-400"
                    : isScanning
                    ? "bg-blue-300"
                    : config.enabled
                    ? "bg-emerald-400"
                    : "bg-slate-400"
                }`}
              />
            </span>

            {/* Label */}
            <span>
              {hasAuthExpired
                ? "Gmail Expired ⚠️"
                : !connected
                ? "Connect Email"
                : isScanning
                ? "Scanning Order Email..."
                : config.enabled
                ? `Auto-Scanning (${secondsRemaining}s)`
                : "Order Scanner (Ready)"}
            </span>

            <ChevronDown
              className={`size-3 text-current transition-transform duration-200 ${
                popoverOpen ? "rotate-180" : ""
              }`}
            />
          </button>
        </div>

        {/* Dropdown Popover */}
        {popoverOpen && (
          <div className="absolute right-0 bottom-10 w-80 rounded-2xl bg-white border border-slate-200 shadow-2xl p-4 text-slate-800 z-50 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <Mail className="size-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-900">Email Auto-Scanner</h4>
                  <p className="text-[10px] text-slate-500">
                    {userEmail || "Gmail Account"}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setPopoverOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-md"
              >
                <X className="size-3.5" />
              </button>
            </div>

            {connected ? (
              <div className="space-y-3 pt-3">
                {hasAuthExpired && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 text-xs text-amber-900 space-y-1.5">
                    <div className="flex items-center gap-1.5 font-bold text-amber-950">
                      <AlertCircle className="size-3.5 text-amber-600 shrink-0" />
                      <span>Gmail Session Expired</span>
                    </div>
                    <p className="text-[11px] text-amber-800 leading-tight">
                      Google OAuth refresh token expired (7-day test limit or revoked).
                    </p>
                    <Link
                      to="/inbox"
                      onClick={() => setPopoverOpen(false)}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-800 hover:text-amber-950 underline pt-0.5"
                    >
                      Reconnect Gmail at /inbox <ArrowRight className="size-3" />
                    </Link>
                  </div>
                )}

                {/* Status & Toggle */}
                <div className="flex items-center justify-between bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                  <div className="space-y-0.5">
                    <span className="text-xs font-semibold text-slate-900 block">
                      Auto-Scan Status
                    </span>
                    <span className="text-[11px] text-slate-500 block">
                      {config.enabled
                        ? `Checking inbox every ${config.intervalSeconds}s`
                        : "Scanner is currently paused"}
                    </span>
                  </div>

                  <Button
                    size="sm"
                    variant={config.enabled ? "default" : "outline"}
                    onClick={() => updateSettings({ enabled: !config.enabled })}
                    className={`h-7 px-3 text-xs font-semibold gap-1.5 ${
                      config.enabled
                        ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                        : "border-slate-300 text-slate-700"
                    }`}
                  >
                    {config.enabled ? (
                      <>
                        <Pause className="size-3" /> Pause
                      </>
                    ) : (
                      <>
                        <Play className="size-3" /> Resume
                      </>
                    )}
                  </Button>
                </div>

                {/* Interval Frequency Selector */}
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1.5">
                    Scan Frequency
                  </label>
                  <div className="grid grid-cols-4 gap-1">
                    {[
                      { label: "30s", val: 30 },
                      { label: "1m", val: 60 },
                      { label: "2m", val: 120 },
                      { label: "5m", val: 300 },
                    ].map((item) => (
                      <button
                        key={item.val}
                        onClick={() => updateSettings({ intervalSeconds: item.val })}
                        className={`text-xs py-1 rounded-lg font-medium transition ${
                          config.intervalSeconds === item.val
                            ? "bg-slate-900 text-white font-bold shadow-xs"
                            : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Sound & Options */}
                <div className="flex items-center justify-between pt-1">
                  <button
                    onClick={() => updateSettings({ soundEnabled: !config.soundEnabled })}
                    className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900"
                  >
                    {config.soundEnabled ? (
                      <Volume2 className="size-3.5 text-emerald-600" />
                    ) : (
                      <VolumeX className="size-3.5 text-slate-400" />
                    )}
                    <span>Sound Chime: {config.soundEnabled ? "ON" : "OFF"}</span>
                  </button>

                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => executeScan(true)}
                    disabled={isScanning}
                    className="h-7 text-xs text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 gap-1.5"
                  >
                    <RefreshCw className={`size-3 ${isScanning ? "animate-spin" : ""}`} />
                    Scan Now
                  </Button>
                </div>

                {/* Last scan status info */}
                {config.lastScanAt && (
                  <div className="bg-slate-50 rounded-lg p-2 text-[10px] text-slate-500 border border-slate-100">
                    <span className="font-semibold text-slate-700">Last scan:</span>{" "}
                    {new Date(config.lastScanAt).toLocaleTimeString("en-IN", {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}{" "}
                    — {config.lastScanStatus || "No new orders"}
                  </div>
                )}

                {/* Footer link to full inbox */}
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                  <Link
                    href="/inbox"
                    onClick={() => setPopoverOpen(false)}
                    className="text-emerald-700 hover:underline font-semibold flex items-center gap-1"
                  >
                    <span>Open Email Inbox Hub</span>
                    <ArrowRight className="size-3" />
                  </Link>
                </div>
              </div>
            ) : (
              <div className="space-y-3 pt-3">
                <p className="text-xs text-slate-600">
                  Connect your Gmail account to enable automatic scanning of incoming purchase order emails.
                </p>
                <Link
                  href="/inbox"
                  onClick={() => setPopoverOpen(false)}
                  className="w-full inline-flex items-center justify-center rounded-xl bg-emerald-600 py-2 text-xs font-semibold text-white hover:bg-emerald-700 transition gap-1.5 shadow-sm"
                >
                  <Mail className="size-3.5" />
                  Go to Connect Gmail
                </Link>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Prominent Floating Alert Banner When Order Is Auto-Detected */}
      {showNotification && detectedOrders.length > 0 && (
        <div className="fixed top-5 right-5 z-50 max-w-md w-full animate-in slide-in-from-top-4 fade-in duration-300">
          <div className="rounded-2xl border-2 border-emerald-500/40 bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-950 text-white p-4 shadow-2xl backdrop-blur-xl relative overflow-hidden">
            {/* Ambient background glow */}
            <div className="absolute -top-12 -right-12 w-32 h-32 bg-emerald-500/20 rounded-full blur-2xl pointer-events-none" />

            <div className="flex items-start justify-between gap-3 relative z-10">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                  <Sparkles className="size-4 animate-pulse" />
                </div>
                <div>
                  <Badge className="bg-emerald-500 text-slate-950 font-black text-[10px] px-2 py-0.5 tracking-wider uppercase">
                    New Order Auto-Scanned
                  </Badge>
                  <p className="text-xs text-slate-300 mt-0.5">
                    AI successfully extracted order from email!
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowNotification(false)}
                className="text-slate-400 hover:text-white p-1 rounded-md"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Order Details Preview */}
            <div className="mt-3.5 bg-white/5 rounded-xl p-3 border border-white/10 space-y-2 relative z-10">
              {detectedOrders.map((ord, idx) => (
                <div key={idx} className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-white truncate flex items-center gap-1.5">
                      <Building2 className="size-3.5 text-emerald-400 shrink-0" />
                      {ord.customerName}
                    </span>
                    <span className="text-sm font-extrabold text-emerald-400 shrink-0">
                      {formatINR(ord.total || 0)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-300">
                    <span className="truncate max-w-[200px] text-slate-400">
                      {ord.subject}
                    </span>
                    <span className="flex items-center gap-1 text-slate-300 shrink-0">
                      <Package className="size-3 text-slate-400" />
                      {ord.itemsCount} line items
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="mt-3.5 flex items-center justify-between gap-2 relative z-10">
              <button
                onClick={() => setShowNotification(false)}
                className="text-xs text-slate-400 hover:text-white font-medium px-2 py-1"
              >
                Dismiss
              </button>

              <div className="flex items-center gap-2">
                <Link
                  href="/inbox"
                  onClick={() => setShowNotification(false)}
                  className="px-3 py-1.5 rounded-lg border border-white/20 text-xs font-semibold text-white hover:bg-white/10 transition"
                >
                  View in Inbox
                </Link>

                <Link
                  href={`/orders/${detectedOrders[0].importId}`}
                  onClick={() => setShowNotification(false)}
                  className="px-4 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition flex items-center gap-1 shadow-lg shadow-emerald-500/20"
                >
                  <span>Review Draft</span>
                  <ArrowRight className="size-3.5" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

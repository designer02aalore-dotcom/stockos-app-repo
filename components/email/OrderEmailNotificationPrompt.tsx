"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "@/lib/router";
import { formatINR } from "@/lib/utils";
import { playOrderDetectedChime } from "@/lib/audio/chime";
import { createClient } from "@/lib/supabase/client";
import {
  Mail,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  X,
  FileCheck,
  Building2,
  Clock,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// Firebase Imports
import { initializeApp, getApps } from "firebase/app";
import { getMessaging, getToken, onMessage } from "firebase/messaging";

export interface PendingOrderEmail {
  messageId: string;
  subject: string;
  from: string;
  fromName: string;
  date: string;
}

export function OrderEmailNotificationPrompt() {
  const router = useRouter();

  const [orderEmail, setOrderEmail] = useState<PendingOrderEmail | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingAction, setProcessingAction] = useState<"scan" | "make_order" | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isAutoScanActive, setIsAutoScanActive] = useState<boolean>(false);
  const [scanIntervalSeconds, setScanIntervalSeconds] = useState<number>(60);

  // Track dismissed message IDs so we don't prompt repeatedly for the same email in the session
  const dismissedIdsRef = useRef<Set<string>>(new Set());

  // =====================================================================
  // 1. FIREBASE CLOUD MESSAGING (FCM) SETUP
  // =====================================================================
  useEffect(() => {
    // Prevent SSR crash
    if (typeof window === "undefined" || !("Notification" in window)) return;

    const firebaseConfig = {
      apiKey: "AIzaSyCX_z85EcYkrZCzVRsmK-P2lgLAUHY3zXQ",
      authDomain: "stockos-sales-orders-9d60a.firebaseapp.com",
      projectId: "stockos-sales-orders-9d60a",
      storageBucket: "stockos-sales-orders-9d60a.firebasestorage.app",
      messagingSenderId: "223929515444",
      appId: "1:223929515444:web:7e29cdf5adb6f8940946e1",
      measurementId: "G-90W1L0MG2Q"
    };

    let unsubscribeFCM: (() => void) | undefined;

    const setupFCM = async () => {
      try {
        // Initialize Firebase only if it hasn't been initialized yet
        const app = !getApps().length ? initializeApp(firebaseConfig) : getApps()[0];
        const messaging = getMessaging(app);

        console.log("=== [fcm/client] Initializing FCM Push Notifications ===");
        console.log("[fcm/client] ── STEP 1: Requesting Notification Permission ──");
        // Request notification permission
        const permission = await Notification.requestPermission();
        if (permission === "granted") {
          console.log("[fcm/client] ✅ Notification permission granted.");
          try {
            console.log("[fcm/client] ── STEP 2: Retrieving Device FCM Token ──");
            // Ensure service worker is registered
            const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js').catch(() => undefined);
            
            // Get FCM Token
            const currentToken = await getToken(messaging, {
              vapidKey: "BIIjuAbfMAqxvERchpSf7MVt8CipnxWWC28FMTpmXDtYIxC74-ch2jffvieueyXwDor0lcad538TNk5tQAFCjTU",
              serviceWorkerRegistration: registration,
            });

            if (currentToken) {
              console.log("[fcm/client] ✅ FCM Token received:", currentToken.slice(0, 30) + "...");

              console.log("[fcm/client] ── STEP 3: Registering Token in Supabase (user_tokens) ──");
              // Save token to Supabase
              const supabase = createClient();
              const { error: upsertErr } = await supabase.from('user_tokens').upsert({
                token: currentToken,
                user_id: '8b049054-7d30-450c-aa40-02f6101962fe',
              });

              if (upsertErr) {
                console.error("[fcm/client] ❌ Failed to register token in Supabase:", upsertErr.message);
              } else {
                console.log("[fcm/client] ✅ Token registered successfully in Supabase!");
                console.log("=== [fcm/client] Ready to receive push notifications ===");
              }
            } else {
              console.warn("[fcm/client] ⚠️ No FCM token returned by Firebase.");
            }
          } catch (err) {
            console.error("[fcm/client] ❌ Error retrieving FCM token:", err);
          }
        } else {
          console.warn(`[fcm/client] ⚠️ Notification permission was "${permission}". Enable notifications in browser to receive alerts.`);
        }

        // Handle foreground notifications (when app is open)
        unsubscribeFCM = onMessage(messaging, (payload) => {
          console.log("Foreground FCM Message:", payload);
          if (payload.notification) {
            setOrderEmail({
              messageId: `fcm-${Date.now()}`,
              subject: payload.notification.title || "New Order from FCM",
              from: "FCM Alert",
              fromName: "Push Notification",
              date: new Date().toISOString(),
            });
            setIsOpen(true);
            playOrderDetectedChime();
          }
        });

      } catch (error) {
        console.error("Firebase initialization error:", error);
      }
    };

    setupFCM();

    return () => {
      if (unsubscribeFCM) unsubscribeFCM();
    };
  }, []);

  // =====================================================================
  // 2. AUTO-SCAN SYNC & EVENT LISTENERS
  // =====================================================================
  useEffect(() => {
    fetch("/api/extract/email/auto-scan")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.success && data.config) {
          setIsAutoScanActive(Boolean(data.config.enabled));
          if (data.config.intervalSeconds) {
            setScanIntervalSeconds(data.config.intervalSeconds);
          }
        }
      })
      .catch(() => { });
  }, []);

  // Listen to global stop/pause/resume events from scanner controls
  useEffect(() => {
    function handleScannerState(e: any) {
      if (typeof e.detail?.enabled === "boolean") {
        setIsAutoScanActive(e.detail.enabled);
      }
      if (typeof e.detail?.intervalSeconds === "number") {
        setScanIntervalSeconds(e.detail.intervalSeconds);
      }
    }

    window.addEventListener("stockos:scanner-state-changed", handleScannerState);
    return () => {
      window.removeEventListener("stockos:scanner-state-changed", handleScannerState);
    };
  }, []);

  // =====================================================================
  // 3. SMART EMAIL CHECKING (Fallback Check)
  // =====================================================================
  const checkForIncomingOrderEmail = useCallback(async (signal?: AbortSignal) => {
    if (isOpen || isProcessing) return;

    try {
      const res = await fetch("/api/extract/email/check-new", { signal });
      if (!res.ok) {
        if (res.status === 401) {
          setIsAutoScanActive(false);
          console.warn("[Order Scanner] Gmail authentication expired. Polling paused.");
        }
        return;
      }
      const data = await res.json();

      if (data.paused) {
        setIsAutoScanActive(false);
        return;
      }

      if (data.hasNewOrderEmail && data.email) {
        const msgId = data.email.messageId;
        if (!dismissedIdsRef.current.has(msgId)) {
          setOrderEmail(data.email);
          setIsOpen(true);
          playOrderDetectedChime();

          if (Notification.permission === "granted") {
            new Notification("StockOS: You have received an order email!", {
              body: `"${data.email.subject}" from ${data.email.fromName}.`,
              icon: "/favicon.svg",
            });
          }
        }
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        console.debug("[OrderEmailPrompt] Check failed:", err);
      }
    }
  }, [isOpen, isProcessing]);

  // =====================================================================
  // 4. SUPABASE REALTIME LISTENER
  // =====================================================================
  useEffect(() => {
    let supabase: any;
    try {
      supabase = createClient();
    } catch (err) {
      console.warn("[OrderEmailPrompt] Supabase client init warning:", err);
      return;
    }

    const channel = supabase
      .channel("realtime-order-notification-prompt")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "order_imports" },
        (payload: any) => {
          console.log("[Realtime] Incoming order detected via Supabase:", payload.new);
          const newOrder = payload.new;
          if (!newOrder) return;

          const msgId = newOrder.source_reference || newOrder.id;
          if (dismissedIdsRef.current.has(msgId)) return;

          const emailMeta = newOrder.extracted_data?._email_source || {};
          const subject = emailMeta.subject || (newOrder.customer_name ? `Order: ${newOrder.customer_name}` : "New Purchase Order");
          const from = emailMeta.from || newOrder.source_reference || "Customer";
          const fromName = emailMeta.fromName || newOrder.customer_name || "Customer";

          setOrderEmail({
            messageId: msgId,
            subject,
            from,
            fromName,
            date: newOrder.created_at || new Date().toISOString(),
          });
          setIsOpen(true);
          playOrderDetectedChime();
        }
      )
      .subscribe((status: string) => {
        console.log("[Realtime] Subscription status:", status);
      });

    return () => {
      if (supabase && channel) supabase.removeChannel(channel);
    };
  }, []);

  // =====================================================================
  // 5. TAB FOCUS FALLBACK & EVENT BUS LISTENERS
  // =====================================================================
  const lastCheckTimeRef = useRef<number>(Date.now());

  useEffect(() => {
    function handleVisibilityOrFocus() {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastCheckTimeRef.current >= 60000) {
        lastCheckTimeRef.current = now;
        checkForIncomingOrderEmail();
      }
    }

    window.addEventListener("focus", handleVisibilityOrFocus);
    document.addEventListener("visibilitychange", handleVisibilityOrFocus);

    return () => {
      window.removeEventListener("focus", handleVisibilityOrFocus);
      document.removeEventListener("visibilitychange", handleVisibilityOrFocus);
    };
  }, [checkForIncomingOrderEmail]);

  useEffect(() => {
    function handleOrderDetected(e: any) {
      if (e.detail?.orders?.[0]) {
        const first = e.detail.orders[0];
        setOrderEmail({
          messageId: first.importId,
          subject: first.subject || "Order from Email",
          from: first.from || "Customer",
          fromName: first.customerName || "Customer",
          date: new Date().toISOString(),
        });
        setIsOpen(true);
        playOrderDetectedChime();
      }
    }

    function handleTestEvent(e: any) {
      const testEmail: PendingOrderEmail = e.detail?.email || {
        messageId: `test-${Date.now()}`,
        subject: "Purchase Order - Primary School Book Sets 2026",
        from: "Cambridge Exp. School <purchasing@cambridge.org>",
        fromName: "Cambridge Exp. School",
        date: new Date().toISOString(),
      };
      setOrderEmail(testEmail);
      setIsOpen(true);
      playOrderDetectedChime();
    }

    window.addEventListener("stockos:email-order-detected", handleOrderDetected);
    window.addEventListener("stockos:trigger-order-email-notification", handleTestEvent);

    return () => {
      window.removeEventListener("stockos:email-order-detected", handleOrderDetected);
      window.removeEventListener("stockos:trigger-order-email-notification", handleTestEvent);
    };
  }, []);

  // =====================================================================
  // 6. HANDLE USER ACTIONS
  // =====================================================================
  const handleAction = async (action: "scan" | "make_order") => {
    if (!orderEmail) return;

    setIsProcessing(true);
    setProcessingAction(action);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      let importId: string;
      let itemsCount = 0;
      let totalAmount = 0;

      if (orderEmail.messageId.startsWith("test-")) {
        const res = await fetch("/api/extract/email/simulate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subject: orderEmail.subject,
            fromName: orderEmail.fromName,
            fromEmail: "orders@cambridge.org",
            bodyText: `Purchase order for school books:\n1. आनंदी मराठी Std 1 - Qty: 15 (Rate: 120)\n2. आनंदी मराठी Std 2 - Qty: 20 (Rate: 130)\n3. WTW GK 2 - Qty: 10 (Rate: 145)\n4. Lets write English MO 5 - Qty: 8 (Rate: 125)\nTotal: 4600`,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || "Failed to process test email");
        importId = data.importId;
        itemsCount = data.extracted?.items?.length || 4;
        totalAmount = data.extracted?.total || 4600;
      } else {
        const res = await fetch("/api/extract/email/scan-message", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messageId: orderEmail.messageId }),
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || "Failed to scan and extract order line items");
        }
        importId = data.importId;
        itemsCount = data.extracted?.items?.length || 0;
        totalAmount = data.extracted?.total || 0;
      }

      dismissedIdsRef.current.add(orderEmail.messageId);

      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("stockos:email-order-detected", {
            detail: { importId, customerName: orderEmail.fromName },
          })
        );
      }

      if (action === "make_order") {
        setSuccessMessage("Opening Sales Order confirmation draft...");
        setTimeout(() => {
          setIsOpen(false);
          setIsProcessing(false);
          router.push(`/orders/${importId}`);
        }, 800);
      } else {
        setSuccessMessage(
          `Extracted ${itemsCount} line items (${formatINR(totalAmount)}) from ${orderEmail.fromName}! Saved to your order drafts.`
        );
        router.refresh();
        setTimeout(() => {
          setIsOpen(false);
          setIsProcessing(false);
        }, 2200);
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to process this order email");
      setIsProcessing(false);
      setProcessingAction(null);
    }
  };

  const handleDismiss = () => {
    if (orderEmail) {
      dismissedIdsRef.current.add(orderEmail.messageId);
      fetch("/api/extract/email/dismiss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId: orderEmail.messageId }),
      }).catch((err) => console.debug("[OrderEmailPrompt] Dismiss error:", err));
    }
    setIsOpen(false);
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  if (!isOpen || !orderEmail) return null;

  // =====================================================================
  // 7. UI RENDER
  // =====================================================================
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Top Header with Amber/Emerald Pulse */}
        <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 text-white p-5 relative">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/20 border border-white/30 flex items-center justify-center text-white shrink-0 shadow-xs">
                <Mail className="size-5 animate-bounce" />
              </div>
              <div>
                <Badge className="bg-white/20 text-white font-bold text-[10px] px-2 py-0.5 tracking-wider uppercase backdrop-blur-xs border border-white/30">
                  New Order Email Received
                </Badge>
                <h3 className="text-base font-bold text-white mt-1 leading-snug">
                  You have received an order email!
                </h3>
              </div>
            </div>

            <button
              onClick={handleDismiss}
              disabled={isProcessing}
              className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition"
              title="Close"
            >
              <X className="size-5" />
            </button>
          </div>
        </div>

        {/* Email Metadata Card */}
        <div className="p-5 space-y-4">
          <div className="rounded-xl bg-slate-50 border border-slate-200/80 p-3.5 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Email Subject
              </span>
              <span className="text-[11px] text-slate-400 flex items-center gap-1">
                <Clock className="size-3" />
                Just now
              </span>
            </div>
            <p className="text-sm font-bold text-slate-900 leading-snug">
              {orderEmail.subject}
            </p>

            <div className="flex items-center gap-1.5 text-xs text-slate-600 pt-1 border-t border-slate-200/60">
              <Building2 className="size-3.5 text-emerald-600 shrink-0" />
              <span className="font-semibold text-slate-800">{orderEmail.fromName}</span>
              <span className="text-slate-400 truncate max-w-[220px]">
                ({orderEmail.from})
              </span>
            </div>
          </div>

          {/* User Decision Prompt Question */}
          <div className="rounded-xl bg-emerald-50/70 border border-emerald-200/80 p-3.5 text-center sm:text-left">
            <p className="text-sm font-bold text-emerald-950">
              Do you want to scan this email or make a sales order from this mail?
            </p>
            <p className="text-xs text-emerald-800 mt-1">
              StockOS AI will extract the school, book titles, quantities, and pricing automatically.
            </p>
          </div>

          {/* Success Message Banner */}
          {successMessage && (
            <div className="rounded-xl bg-emerald-100/80 border border-emerald-300 p-3 text-xs text-emerald-900 flex items-center gap-2 animate-in fade-in">
              <CheckCircle2 className="size-4 text-emerald-700 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Error Message Banner */}
          {errorMessage && (
            <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800 flex items-center gap-2 animate-in fade-in">
              <AlertCircle className="size-4 text-rose-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2.5 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleDismiss}
              disabled={isProcessing}
              className="text-xs h-10 order-3 sm:order-1 text-slate-600 border-slate-300 hover:bg-slate-100"
            >
              Dismiss / Later
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={() => handleAction("scan")}
              disabled={isProcessing}
              className="text-xs h-10 font-bold border-emerald-300 text-emerald-800 bg-emerald-50/50 hover:bg-emerald-100/80 order-2 gap-1.5 shadow-2xs"
            >
              {isProcessing && processingAction === "scan" ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Scanning Email...
                </>
              ) : (
                <>
                  <Sparkles className="size-3.5 text-emerald-600" />
                  Scan & Extract Order
                </>
              )}
            </Button>

            <Button
              type="button"
              onClick={() => handleAction("make_order")}
              disabled={isProcessing}
              className="text-xs h-10 font-bold bg-emerald-600 hover:bg-emerald-700 text-white order-1 sm:order-3 gap-1.5 shadow-md shadow-emerald-600/20"
            >
              {isProcessing && processingAction === "make_order" ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Making Sales Order...
                </>
              ) : (
                <>
                  <FileCheck className="size-3.5" />
                  Make Sales Order Now →
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
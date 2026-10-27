import { createAdminClient } from "@/lib/supabase/admin";
import { fetchUnreadOrderEmails, type EmailScanResponse } from "./fetchEmails";
import { getStoredGmailTokens } from "./gmailClient";

export interface AutoScanConfig {
  enabled: boolean;
  intervalSeconds: number; // e.g. 30, 60, 120, 300
  soundEnabled: boolean;
  autoOpenReview: boolean;
  markAsRead: boolean;
  lastScanAt: string | null;
  lastScanStatus: string | null;
  lastNewOrdersCount: number;
}

export const DEFAULT_AUTOSCAN_CONFIG: AutoScanConfig = {
  enabled: false, // OFF by default: never scan automatically just because user entered software
  intervalSeconds: 60,
  soundEnabled: true,
  autoOpenReview: false,
  markAsRead: true,
  lastScanAt: null,
  lastScanStatus: null,
  lastNewOrdersCount: 0,
};

/**
 * Retrieve current auto-scan settings from Supabase app_settings
 */
export async function getAutoScanConfig(): Promise<AutoScanConfig> {
  const supabase = createAdminClient();
  const config: AutoScanConfig = { ...DEFAULT_AUTOSCAN_CONFIG };

  try {
    const { data: rows } = await supabase
      .from("app_settings")
      .select("key, value")
      .in("key", [
        "email_auto_scan_enabled",
        "email_auto_scan_interval",
        "email_auto_scan_sound",
        "email_auto_scan_auto_open",
        "email_auto_scan_mark_read",
        "email_last_scan_at",
        "email_last_scan_status",
        "email_last_scan_new_orders",
      ]);

    if (rows && rows.length > 0) {
      for (const row of rows) {
        if (row.key === "email_auto_scan_enabled") {
          config.enabled = row.value === "true";
        } else if (row.key === "email_auto_scan_interval") {
          const val = parseInt(row.value, 10);
          if (!isNaN(val) && val >= 15) config.intervalSeconds = val;
        } else if (row.key === "email_auto_scan_sound") {
          config.soundEnabled = row.value !== "false";
        } else if (row.key === "email_auto_scan_auto_open") {
          config.autoOpenReview = row.value === "true";
        } else if (row.key === "email_auto_scan_mark_read") {
          config.markAsRead = row.value !== "false";
        } else if (row.key === "email_last_scan_at") {
          config.lastScanAt = row.value;
        } else if (row.key === "email_last_scan_status") {
          config.lastScanStatus = row.value;
        } else if (row.key === "email_last_scan_new_orders") {
          config.lastNewOrdersCount = parseInt(row.value, 10) || 0;
        }
      }
    }
  } catch (err) {
    console.warn("[AutoScan] Could not read app_settings:", err);
  }

  return config;
}

/**
 * Save updated auto-scan settings to app_settings
 */
export async function updateAutoScanConfig(
  updates: Partial<AutoScanConfig>
): Promise<AutoScanConfig> {
  const supabase = createAdminClient();
  const now = new Date().toISOString();
  const rowsToUpsert: Array<{ key: string; value: string; updated_at: string }> = [];

  if (typeof updates.enabled === "boolean") {
    rowsToUpsert.push({
      key: "email_auto_scan_enabled",
      value: String(updates.enabled),
      updated_at: now,
    });
  }
  if (typeof updates.intervalSeconds === "number") {
    rowsToUpsert.push({
      key: "email_auto_scan_interval",
      value: String(updates.intervalSeconds),
      updated_at: now,
    });
  }
  if (typeof updates.soundEnabled === "boolean") {
    rowsToUpsert.push({
      key: "email_auto_scan_sound",
      value: String(updates.soundEnabled),
      updated_at: now,
    });
  }
  if (typeof updates.autoOpenReview === "boolean") {
    rowsToUpsert.push({
      key: "email_auto_scan_auto_open",
      value: String(updates.autoOpenReview),
      updated_at: now,
    });
  }
  if (typeof updates.markAsRead === "boolean") {
    rowsToUpsert.push({
      key: "email_auto_scan_mark_read",
      value: String(updates.markAsRead),
      updated_at: now,
    });
  }

  if (rowsToUpsert.length > 0) {
    try {
      await supabase.from("app_settings").upsert(rowsToUpsert, { onConflict: "key" });
    } catch (err) {
      console.error("[AutoScan] Failed to save config updates:", err);
    }
  }

  return getAutoScanConfig();
}

/**
 * Perform a single auto-scan pass
 */
export async function runAutoScanPass(options?: {
  maxResults?: number;
  query?: string;
  markAsRead?: boolean;
}): Promise<EmailScanResponse> {
  const tokens = await getStoredGmailTokens();
  if (!tokens.refreshToken) {
    return {
      success: false,
      totalFound: 0,
      importedCount: 0,
      skippedCount: 0,
      results: [],
      error: "Gmail account is not connected",
    };
  }

  const config = await getAutoScanConfig();
  const markAsRead = options?.markAsRead !== undefined ? options.markAsRead : config.markAsRead;
  const query =
    options?.query ||
    'label:INBOX is:unread (order OR purchase OR po OR "sales order" OR requisition OR books OR sets OR quotation OR invoice OR urgent OR प्रत OR नग OR किताब OR पुस्तक)';
  const maxResults = options?.maxResults || 10;

  const result = await fetchUnreadOrderEmails({
    maxResults,
    query,
    markAsRead,
  });

  // Record scan stats
  const now = new Date().toISOString();
  const statusMsg = result.importedCount > 0
    ? `Auto-scan imported ${result.importedCount} new order(s) from ${result.totalFound} checked email(s)`
    : `Auto-scan checked ${result.totalFound} email(s) — no new purchase orders`;

  try {
    const supabase = createAdminClient();
    await supabase.from("app_settings").upsert([
      { key: "email_last_scan_at", value: now, updated_at: now },
      { key: "email_last_scan_status", value: statusMsg, updated_at: now },
      { key: "email_last_scan_new_orders", value: String(result.importedCount), updated_at: now },
    ], { onConflict: "key" });
  } catch (err) {
    console.warn("[AutoScan] Failed to persist scan log in app_settings:", err);
  }

  return result;
}

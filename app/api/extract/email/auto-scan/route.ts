import { NextRequest, NextResponse } from "@/lib/response";
import {
  getAutoScanConfig,
  updateAutoScanConfig,
  runAutoScanPass,
} from "@/lib/email/autoScan";
import { getStoredGmailTokens } from "@/lib/email/gmailClient";

export async function GET() {
  try {
    const tokens = await getStoredGmailTokens();
    const config = await getAutoScanConfig();

    return NextResponse.json({
      success: true,
      connected: !!tokens.refreshToken,
      userEmail: tokens.userEmail || null,
      config,
    });
  } catch (err: any) {
    console.error("[AutoScan API] GET Error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to fetch auto-scan configuration" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    let body: any = {};
    try {
      body = await request.json();
    } catch {
      // Empty body is allowed
    }

    const {
      enabled,
      intervalSeconds,
      soundEnabled,
      autoOpenReview,
      markAsRead,
      triggerScan,
      maxResults,
      query,
    } = body;

    // Apply config updates if provided
    let updatedConfig = await getAutoScanConfig();
    const hasConfigUpdates =
      typeof enabled === "boolean" ||
      typeof intervalSeconds === "number" ||
      typeof soundEnabled === "boolean" ||
      typeof autoOpenReview === "boolean" ||
      typeof markAsRead === "boolean";

    if (hasConfigUpdates) {
      updatedConfig = await updateAutoScanConfig({
        enabled,
        intervalSeconds,
        soundEnabled,
        autoOpenReview,
        markAsRead,
      });
    }

    // If triggerScan requested, run a scan pass immediately
    let scanResult = null;
    if (triggerScan) {
      scanResult = await runAutoScanPass({
        maxResults,
        query,
        markAsRead,
      });
      // Refresh config to get latest lastScanAt & lastScanStatus
      updatedConfig = await getAutoScanConfig();
    }

    const tokens = await getStoredGmailTokens();

    return NextResponse.json({
      success: true,
      connected: !!tokens.refreshToken,
      userEmail: tokens.userEmail || null,
      config: updatedConfig,
      scanResult,
    });
  } catch (err: any) {
    const isInvalidGrant = Boolean(
      err?.message?.includes("invalid_grant") ||
      err?.response?.data?.error === "invalid_grant"
    );

    if (isInvalidGrant) {
      console.warn("[AutoScan API] Gmail token expired (invalid_grant). Pausing auto-scan and notifying client.");
      try {
        const { createAdminClient } = await import("@/lib/supabase/admin");
        const supabase = createAdminClient();
        const now = new Date().toISOString();
        await supabase.from("app_settings").upsert(
          [
            { key: "email_auto_scan_enabled", value: "false", updated_at: now },
            {
              key: "email_last_scan_status",
              value: "Gmail session expired (invalid_grant). Please reconnect account at /inbox.",
              updated_at: now,
            },
          ],
          { onConflict: "key" }
        );
      } catch (dbErr) {
        console.warn("[AutoScan API] Failed to auto-pause on invalid_grant:", dbErr);
      }
    } else {
      console.error("[AutoScan API] POST Error:", err);
    }

    return NextResponse.json(
      {
        success: false,
        error: isInvalidGrant
          ? "Gmail API error: invalid_grant (Google refresh token has expired or was revoked. Please reconnect your Gmail account at /inbox)"
          : err.message || "Failed to update or trigger auto-scan",
        invalidGrant: isInvalidGrant,
      },
      { status: isInvalidGrant ? 401 : 500 }
    );
  }
}

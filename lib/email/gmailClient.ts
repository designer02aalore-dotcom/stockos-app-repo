import { createAdminClient } from "@/lib/supabase/admin";

export async function getOAuth2Client() {
  const { google } = await import("googleapis");
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const redirectUri = process.env.GMAIL_REDIRECT_URI || `${appUrl}/api/extract/email/callback`;

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export interface StoredGmailTokens {
  refreshToken: string | null;
  accessToken: string | null;
  userEmail: string | null;
}

export async function getStoredGmailTokens(): Promise<StoredGmailTokens> {
  const supabase = createAdminClient();

  let refreshToken: string | null = null;
  let accessToken: string | null = null;
  let userEmail: string | null = null;

  try {
    const { data: settings } = await supabase
      .from("app_settings")
      .select("key, value")
      .in("key", ["gmail_refresh_token", "gmail_access_token", "gmail_user_email"]);

    if (settings && settings.length > 0) {
      for (const s of settings) {
        if (s.key === "gmail_refresh_token" && s.value && s.value !== "...") {
          refreshToken = s.value;
        } else if (s.key === "gmail_access_token" && s.value) {
          accessToken = s.value;
        } else if (s.key === "gmail_user_email" && s.value) {
          userEmail = s.value;
        }
      }
    }
  } catch (err) {
    console.warn("[GmailClient] Failed to load tokens from app_settings:", err);
  }

  // Fallback to environment variables if not found in DB
  if (!refreshToken && process.env.GMAIL_REFRESH_TOKEN && process.env.GMAIL_REFRESH_TOKEN !== "...") {
    refreshToken = process.env.GMAIL_REFRESH_TOKEN;
  }
  if (!userEmail && process.env.GMAIL_USER) {
    userEmail = process.env.GMAIL_USER;
  }

  return { refreshToken, accessToken, userEmail };
}

export async function saveGmailTokens(tokens: {
  refreshToken?: string | null;
  accessToken?: string | null;
  userEmail?: string | null;
}) {
  const supabase = createAdminClient();
  const updates: Array<{ key: string; value: string; updated_at: string }> = [];
  const now = new Date().toISOString();

  if (tokens.refreshToken) {
    updates.push({ key: "gmail_refresh_token", value: tokens.refreshToken, updated_at: now });
    updates.push({ key: "email_last_scan_status", value: "Gmail account connected and authorized.", updated_at: now });
  }
  if (tokens.accessToken) {
    updates.push({ key: "gmail_access_token", value: tokens.accessToken, updated_at: now });
  }
  if (tokens.userEmail) {
    updates.push({ key: "gmail_user_email", value: tokens.userEmail, updated_at: now });
  }

  if (updates.length > 0) {
    await supabase.from("app_settings").upsert(updates, { onConflict: "key" });
  }
}

export async function disconnectGmail() {
  const supabase = createAdminClient();
  await supabase
    .from("app_settings")
    .delete()
    .in("key", ["gmail_refresh_token", "gmail_access_token", "gmail_user_email"]);
}

export async function getAuthenticatedGmailClient() {
  const tokens = await getStoredGmailTokens();

  if (!tokens.refreshToken) {
    return null;
  }

  const oauth2Client = await getOAuth2Client();
  oauth2Client.setCredentials({
    refresh_token: tokens.refreshToken,
    access_token: tokens.accessToken || undefined,
  });

  oauth2Client.on("tokens", async (newTokens) => {
    try {
      await saveGmailTokens({
        refreshToken: newTokens.refresh_token,
        accessToken: newTokens.access_token,
      });
    } catch (saveErr) {
      console.warn("[GmailClient] Failed to save refreshed tokens:", saveErr);
    }
  });

  const { google } = await import("googleapis");
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });
  return {
    gmail,
    oauth2Client,
    userEmail: tokens.userEmail || "Connected Gmail Account",
  };
}

/**
 * Standardized Gmail API & OAuth error logger with step and cause breakdown
 */
export function logGmailApiError(stepName: string, err: any) {
  const isInvalidGrant =
    err?.message?.includes("invalid_grant") ||
    err?.response?.data?.error === "invalid_grant" ||
    err?.response?.data?.error_description?.includes("expired or revoked");

  console.error("\n================================================================================");
  console.error(`❌ [GMAIL API ERROR] FAILED AT: ${stepName}`);
  console.error(`Error Message: ${err?.message || "Unknown error"}`);
  if (err?.code) console.error(`HTTP Status Code: ${err.code}`);
  if (err?.response?.data) {
    console.error(`Google API Response Data:`, JSON.stringify(err.response.data, null, 2));
  }

  if (isInvalidGrant) {
    console.error("\n🔍 WHY 'invalid_grant' HAPPENED:");
    console.error("1. Google OAuth 'Testing' Mode (Most Common):");
    console.error("   In Google Cloud Console, if OAuth Consent Screen is set to 'Testing',");
    console.error("   refresh tokens expire after 7 days.");
    console.error("2. Token Revocation / Password Change:");
    console.error("   The user account revoked access at myaccount.google.com/permissions or password was changed.");
    console.error("3. Client ID / Secret Mismatch:");
    console.error("   The GMAIL_REFRESH_TOKEN does not match GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET.");
    console.error("\n👉 HOW TO FIX:");
    console.error("   1. Open http://localhost:4173/inbox in your browser.");
    console.error("   2. Click 'Disconnect' (or 'Reconnect Gmail Account').");
    console.error("   3. Complete Google sign-in to save a fresh refresh token.");
    console.error("   4. (Recommended) In Google Cloud Console -> OAuth consent screen, publish to 'Production' so tokens don't expire in 7 days.");
  }
  console.error("================================================================================\n");
}

/**
 * Register a 7-day Gmail Watch subscription with Google Cloud Pub/Sub
 */
export async function registerGmailPushWatch() {
  const auth = await getAuthenticatedGmailClient();
  if (!auth) {
    throw new Error("Gmail is not connected. Please connect your Gmail account first at /inbox.");
  }

  const projectId = process.env.GCP_PROJECT_ID || "stockos-sales-orders";
  const topicName = `projects/${projectId}/topics/stockos-gmail-notifications`;

  console.log(`[Gmail Push Watch] Registering watch on topic: ${topicName} for ${auth.userEmail}...`);

  // Stop previous watch first to prevent Google's "Only one user push notification client allowed per developer" error
  try {
    await auth.gmail.users.stop({ userId: "me" });
  } catch (stopErr: any) {
    // Ignore if not previously watching
  }

  const res = await auth.gmail.users.watch({
    userId: "me",
    requestBody: {
      topicName,
      labelIds: ["INBOX"],
    },
  });

  console.log("[Gmail Push Watch] Successfully registered watch:", res.data);

  // Persist watch details in app_settings for monitoring and auto-renewal
  try {
    const supabase = createAdminClient();
    const now = new Date().toISOString();
    await supabase.from("app_settings").upsert([
      { key: "gmail_watch_history_id", value: String(res.data.historyId || ""), updated_at: now },
      { key: "gmail_watch_expiration", value: String(res.data.expiration || ""), updated_at: now },
      { key: "gmail_watch_updated_at", value: now, updated_at: now },
    ], { onConflict: "key" });
  } catch (err) {
    console.warn("[Gmail Push Watch] Could not save watch settings in DB:", err);
  }

  return {
    success: true,
    userEmail: auth.userEmail,
    topicName,
    historyId: res.data.historyId,
    expiration: res.data.expiration ? new Date(Number(res.data.expiration)).toISOString() : null,
    raw: res.data,
  };
}

/**
 * Stop / Unwatch Gmail Push notifications
 */
export async function stopGmailPushWatch() {
  const auth = await getAuthenticatedGmailClient();
  if (!auth) {
    return { success: false, message: "Gmail is not connected" };
  }

  await auth.gmail.users.stop({
    userId: "me",
  });

  console.log("[Gmail Push Watch] Stopped watch successfully.");
  return { success: true };
}


import { NextRequest, NextResponse } from "@/lib/response";
import { google } from "googleapis";
import { getOAuth2Client, saveGmailTokens } from "@/lib/email/gmailClient";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  const reqOrigin = new URL(request.url).origin;
  const appUrl = (reqOrigin && reqOrigin.startsWith("http")) ? reqOrigin : (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000");

  if (error) {
    console.error("[Gmail OAuth Callback] Google returned error:", error);
    return NextResponse.redirect(`${appUrl}/inbox?error=${encodeURIComponent(error)}`);
  }

  if (!code) {
    console.error("[Gmail OAuth Callback] No code received");
    return NextResponse.redirect(`${appUrl}/inbox?error=No+authorization+code+provided`);
  }

  try {
    const oauth2Client = await getOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    let userEmail: string | null = null;
    try {
      const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
      const userInfo = await oauth2.userinfo.get();
      userEmail = userInfo.data.email || null;
    } catch (profileErr) {
      console.warn("[Gmail OAuth Callback] Could not fetch user email info:", profileErr);
    }

    if (!userEmail && process.env.GMAIL_USER) {
      userEmail = process.env.GMAIL_USER;
    }

    // Save tokens in app_settings table
    await saveGmailTokens({
      refreshToken: tokens.refresh_token,
      accessToken: tokens.access_token,
      userEmail: userEmail || "Connected Account",
    });

    console.log(`[Gmail OAuth Callback] Successfully connected Gmail for: ${userEmail}`);
    return NextResponse.redirect(`${appUrl}/inbox?connected=true&email=${encodeURIComponent(userEmail || "")}`);
  } catch (err: any) {
    console.error("[Gmail OAuth Callback] Token exchange failed:", err);
    return NextResponse.redirect(
      `${appUrl}/inbox?error=${encodeURIComponent(err.message || "Failed to exchange authorization code")}`
    );
  }
}

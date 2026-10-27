import { NextResponse } from "@/lib/response";
import { getStoredGmailTokens } from "@/lib/email/gmailClient";

export async function GET() {
  try {
    const hasClientId = !!process.env.GMAIL_CLIENT_ID;
    const hasClientSecret = !!process.env.GMAIL_CLIENT_SECRET;
    const tokens = await getStoredGmailTokens();

    const isConnected = !!tokens.refreshToken;

    return NextResponse.json({
      connected: isConnected,
      email: tokens.userEmail || (isConnected ? "Connected Account" : null),
      hasCredentialsConfigured: hasClientId && hasClientSecret,
    });
  } catch (err: any) {
    console.error("[Email Status API] Error:", err);
    return NextResponse.json(
      {
        connected: false,
        email: null,
        hasCredentialsConfigured: false,
        error: err.message,
      },
      { status: 500 }
    );
  }
}

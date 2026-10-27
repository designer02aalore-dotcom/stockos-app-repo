import { NextResponse } from "@/lib/response";
import { registerGmailPushWatch, stopGmailPushWatch } from "@/lib/email/gmailClient";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  try {
    const result = await registerGmailPushWatch();
    return NextResponse.json({
      success: true,
      message: "Gmail Push Watch is ACTIVE! Incoming emails will trigger webhooks instantaneously without polling.",
      account: result.userEmail,
      topic: result.topicName,
      historyId: result.historyId,
      expiresAt: result.expiration,
      instructions: "Gmail is now monitoring your INBOX. New emails will push to your Pub/Sub webhook automatically.",
    });
  } catch (err: any) {
    console.error("[Gmail Watch API] Error:", err);
    return NextResponse.json(
      {
        success: false,
        error: err.message || "Failed to register Gmail watch",
        hint: err.message?.includes("not connected")
          ? "Please visit http://localhost:3000/inbox and connect your Gmail account first."
          : "Check that your GCP_PROJECT_ID is correct and Pub/Sub Publisher role was granted to gmail-api-push@system.gserviceaccount.com.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    let body: any = {};
    try {
      body = await request.json();
    } catch {
      // Empty body
    }

    if (body.action === "stop") {
      const res = await stopGmailPushWatch();
      return NextResponse.json(res);
    }

    const result = await registerGmailPushWatch();
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}

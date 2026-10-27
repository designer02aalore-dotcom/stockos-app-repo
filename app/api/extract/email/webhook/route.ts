import { NextRequest, NextResponse } from "@/lib/response";
import { runAutoScanPass } from "@/lib/email/autoScan";

/**
 * Inbound Webhook for Google Cloud Pub/Sub Order Email Notifications
 * 
 * Triggered by Google Cloud Pub/Sub push subscription (Gmail users.watch)
 * Whenever a new email arrives in the connected Gmail inbox, Google publishes
 * a message to the Pub/Sub topic which pushes to this endpoint.
 */
export async function POST(request: NextRequest) {
  try {
    let body: any = {};
    try {
      body = await request.json();
    } catch {
      // Body may not be JSON
    }

    const timestamp = new Date().toLocaleTimeString();
    console.log(`\n📬 [${timestamp}] [Gmail Webhook] Push notification received from Google Pub/Sub`);

    let targetEmail = "";
    let historyId = "";

    // Google Cloud Pub/Sub Push Notification payload
    // Format: { message: { data: "base64EncodedJSON", messageId: "..." }, subscription: "..." }
    if (body?.message?.data) {
      try {
        const decodedString = Buffer.from(body.message.data, "base64").toString("utf-8");
        const pushPayload = JSON.parse(decodedString);
        targetEmail = pushPayload.emailAddress || "";
        historyId = pushPayload.historyId || "";
        console.log(`👤 [Gmail Webhook] Account: ${targetEmail || "Gmail user"} (History ID: ${historyId})`);
      } catch (decodeErr) {
        console.warn("⚠️ [Gmail Webhook] Could not decode Pub/Sub data payload:", decodeErr);
      }
    }

    console.log("⚡ [Gmail Webhook] Scanning inbox for incoming order emails & attachments...");

    // Trigger instant scan pass for new unread order emails
    const scanResult = await runAutoScanPass({
      maxResults: 5,
      markAsRead: true,
    });

    console.log(`✅ [Gmail Webhook] Pass complete: ${scanResult.importedCount} order(s) imported, ${scanResult.totalFound} checked.`);

    // MUST return 200 OK so Google Pub/Sub acknowledges message receipt and stops retrying
    return NextResponse.json({
      success: true,
      message: "Order email notification processed successfully",
      importedCount: scanResult.importedCount,
      scanResult,
    });
  } catch (err: any) {
    console.error("❌ [Gmail Webhook] Processing error:", err);
    // Acknowledge with 200 so Pub/Sub doesn't storm the server with infinite redelivery retries
    return NextResponse.json(
      {
        success: false,
        error: err.message || "Failed to process email notification",
      },
      { status: 200 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    status: "active",
    endpoint: "/api/extract/email/webhook",
    description: "Inbound webhook receiver for Google Pub/Sub Gmail order notifications",
    timestamp: new Date().toISOString(),
  });
}

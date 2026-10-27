import { NextRequest, NextResponse } from "@/lib/response";
import { getAuthenticatedGmailClient } from "@/lib/email/gmailClient";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { messageId } = body;

    if (!messageId) {
      return NextResponse.json(
        { success: false, error: "messageId is required" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // 1. Mark as read in Gmail (remove UNREAD label)
    const auth = await getAuthenticatedGmailClient();
    if (auth && !messageId.startsWith("test-")) {
      try {
        await auth.gmail.users.messages.modify({
          userId: "me",
          id: messageId,
          requestBody: {
            removeLabelIds: ["UNREAD"],
          },
        });
        console.log(`[Dismiss Email] Marked email ${messageId} as read in Gmail`);
      } catch (gmailErr) {
        console.warn(`[Dismiss Email] Could not modify Gmail label for ${messageId}:`, gmailErr);
      }
    }

    // 2. Record in order_imports as dismissed so check-new skips it permanently
    try {
      await supabase.from("order_imports").upsert(
        {
          source_type: "email",
          source_reference: messageId,
          processing_status: "rejected",
          extracted_data: {
            reason: "dismissed_by_user",
            _email_source: { messageId },
          },
        },
        { onConflict: "source_reference" }
      );
    } catch (dbErr) {
      console.warn(`[Dismiss Email] DB record warning for ${messageId}:`, dbErr);
    }

    return NextResponse.json({ success: true, messageId });
  } catch (error: any) {
    console.error("[Dismiss Email] Error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to dismiss email" },
      { status: 500 }
    );
  }
}

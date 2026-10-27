import { NextRequest, NextResponse } from "@/lib/response";
import { getAuthenticatedGmailClient } from "@/lib/email/gmailClient";
import { parseGmailMessage, type ParsedEmailMessage } from "@/lib/email/parseEmail";
import { processEmailOrderText } from "@/lib/email/fetchEmails";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const messageId = body.messageId;

    if (!messageId) {
      return NextResponse.json(
        { success: false, error: "messageId is required" },
        { status: 400 }
      );
    }

    const auth = await getAuthenticatedGmailClient();
    if (!auth) {
      return NextResponse.json(
        { success: false, error: "Gmail is not connected" },
        { status: 401 }
      );
    }

    const { gmail } = auth;

    // 1. Fetch full message
    console.log(`[Scan Message API] Fetching full message ${messageId}...`);
    const msgRes = await gmail.users.messages.get({
      userId: "me",
      id: messageId,
      format: "full",
    });

    const parsed: ParsedEmailMessage = parseGmailMessage(msgRes.data);

    // 2. Check for attachments (image/pdf)
    let imageBuffer: Buffer | undefined;
    let imageMimeType: string | undefined;
    let imageFileName: string | undefined;

    const imageAttachment = parsed.attachments.find(
      (a) => a.mimeType.startsWith("image/") || /\.(jpe?g|png|webp)$/i.test(a.filename)
    );

    if (imageAttachment && imageAttachment.attachmentId) {
      try {
        const attachRes = await gmail.users.messages.attachments.get({
          userId: "me",
          messageId,
          id: imageAttachment.attachmentId,
        });

        if (attachRes.data.data) {
          imageBuffer = Buffer.from(attachRes.data.data, "base64url");
          imageMimeType = imageAttachment.mimeType;
          imageFileName = imageAttachment.filename;
        }
      } catch (attachErr) {
        console.warn("[Scan Message API] Failed to download attachment:", attachErr);
      }
    }

    // 3. Process email with AI extraction
    const processResult = await processEmailOrderText({
      subject: parsed.subject || "Order Email",
      fromName: parsed.fromName,
      fromEmail: parsed.fromEmail,
      date: parsed.date,
      bodyText: parsed.bodyText,
      messageId,
      imageBuffer,
      imageMimeType,
      imageFileName,
    });

    if (!processResult) {
      return NextResponse.json({
        success: false,
        error: "No valid order items could be extracted from this email.",
      }, { status: 422 });
    }

    // 4. Mark as read in Gmail
    try {
      await gmail.users.messages.modify({
        userId: "me",
        id: messageId,
        requestBody: {
          removeLabelIds: ["UNREAD"],
        },
      });
      console.log(`[Scan Message API] Marked email ${messageId} as read`);
    } catch (readErr) {
      console.warn(`[Scan Message API] Could not mark ${messageId} as read:`, readErr);
    }

    return NextResponse.json({
      success: true,
      importId: processResult.importId,
      extracted: processResult.extracted,
      customerId: processResult.customerId,
    });
  } catch (err: any) {
    const { logGmailApiError } = await import("@/lib/email/gmailClient");
    logGmailApiError("[Scan Message API: POST /api/extract/email/scan-message]", err);
    const isInvalidGrant = Boolean(err.message?.includes("invalid_grant"));
    return NextResponse.json(
      {
        success: false,
        error: isInvalidGrant
          ? "Gmail API error: invalid_grant (Your Gmail refresh token has expired or was revoked. Please reconnect at /inbox)."
          : (err.message || "Failed to scan and extract order"),
        invalidGrant: isInvalidGrant,
      },
      { status: isInvalidGrant ? 401 : 500 }
    );
  }
}


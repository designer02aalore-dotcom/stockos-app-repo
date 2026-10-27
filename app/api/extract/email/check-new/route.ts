import { NextResponse } from "@/lib/response";
import { getAuthenticatedGmailClient, logGmailApiError } from "@/lib/email/gmailClient";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAutomatedOrNonOrderEmail } from "@/lib/email/fetchEmails";
import { getAutoScanConfig } from "@/lib/email/autoScan";

let lastCheckCache: {
  timestamp: number;
  data: any;
} | null = null;
const CACHE_TTL_MS = 20000; // 20s cache protects against multi-tab quota exhaustion

export async function GET() {
  try {
    // Return cached response if within TTL
    if (lastCheckCache && Date.now() - lastCheckCache.timestamp < CACHE_TTL_MS) {
      return NextResponse.json(lastCheckCache.data);
    }
    console.log("[Gmail Check-New Step 1/3] Authenticating Gmail OAuth client...");
    const auth = await getAuthenticatedGmailClient();
    if (!auth) {
      return NextResponse.json({
        success: true,
        connected: false,
        hasNewOrderEmail: false,
      });
    }

    const { gmail } = auth;
    const supabase = createAdminClient();

    // Query strictly for UNREAD emails in INBOX matching order criteria or having attachments
    // Read emails MUST NEVER show notifications.
    const query =
      'label:INBOX is:unread (has:attachment OR filename:pdf OR filename:jpg OR filename:jpeg OR filename:png OR filename:webp OR order OR purchase OR po OR "sales order" OR requisition OR books OR sets OR quotation OR invoice OR urgent OR प्रत OR नग OR किताब OR पुस्तक)';

    console.log(`[Gmail Check-New Step 2/3] Calling Gmail API (messages.list) for new unread messages...`);
    let listRes;
    try {
      listRes = await gmail.users.messages.list({
        userId: "me",
        q: query,
        maxResults: 3,
      });
    } catch (listErr: any) {
      logGmailApiError("[Gmail Check-New Step 2/3: messages.list]", listErr);
      return NextResponse.json(
        {
          success: false,
          error: listErr.message?.includes("invalid_grant")
            ? "Gmail API error: invalid_grant (Refresh token expired or revoked. Please reconnect at /inbox)"
            : listErr.message,
          invalidGrant: Boolean(listErr.message?.includes("invalid_grant")),
        },
        { status: listErr.message?.includes("invalid_grant") ? 401 : 500 }
      );
    }

    const messages = listRes.data.messages || [];
    if (messages.length === 0) {
      return NextResponse.json({
        success: true,
        connected: true,
        hasNewOrderEmail: false,
      });
    }

    // Check each candidate message
    for (const msg of messages) {
      if (!msg.id) continue;

      // 1. Strict check: skip if already scanned or extracted in order_imports
      const { data: existingByRef } = await supabase
        .from("order_imports")
        .select("id")
        .eq("source_reference", msg.id)
        .maybeSingle();

      if (existingByRef) {
        continue;
      }

      const { data: existingByMeta } = await supabase
        .from("order_imports")
        .select("id")
        .contains("extracted_data", { _email_source: { messageId: msg.id } })
        .maybeSingle();

      if (existingByMeta) {
        continue;
      }

      // 2. Fetch full message to inspect attachments, labels, and headers
      const msgRes = await gmail.users.messages.get({
        userId: "me",
        id: msg.id,
        format: "full",
      });

      // Strict check: Read emails must never trigger notifications
      const labels = msgRes.data.labelIds || [];
      if (!labels.includes("UNREAD")) {
        console.log(`[check-new] Skipping read email ${msg.id} (not UNREAD)`);
        continue;
      }

      const headers = msgRes.data.payload?.headers || [];
      const subjectHeader = headers.find((h) => h.name?.toLowerCase() === "subject");
      const fromHeader = headers.find((h) => h.name?.toLowerCase() === "from");
      const dateHeader = headers.find((h) => h.name?.toLowerCase() === "date");

      const from = fromHeader?.value || "Customer";
      const date = dateHeader?.value || new Date().toISOString();

      // Find any attachment filenames
      let attachmentName = "";
      function scanParts(parts: any[]) {
        for (const p of parts || []) {
          if (p.filename && (p.mimeType?.startsWith("image/") || p.mimeType?.includes("pdf") || /\.(jpe?g|png|webp|pdf)$/i.test(p.filename))) {
            attachmentName = p.filename;
            return;
          }
          if (p.parts) scanParts(p.parts);
        }
      }
      scanParts(msgRes.data.payload?.parts || []);

      let subject = subjectHeader?.value?.trim() || "";
      if (!subject && attachmentName) {
        subject = `Order Attachment (${attachmentName})`;
      } else if (!subject) {
        subject = "Incoming Purchase Order";
      }

      // Skip automated newsletters or security notifications
      if (isAutomatedOrNonOrderEmail(from, subject)) {
        continue;
      }

      // Extract sender display name if present (e.g. "Cambridge School <orders@cambridge.edu>")
      let fromName = from;
      const match = from.match(/^"?([^"<]+)"?\s*<([^>]+)>/);
      if (match) {
        fromName = match[1].trim();
      }

      // Found a genuinely new unread order email!
      const payload = {
        success: true,
        connected: true,
        hasNewOrderEmail: true,
        email: {
          messageId: msg.id,
          subject,
          from,
          fromName,
          date,
        },
      };
      lastCheckCache = { timestamp: Date.now(), data: payload };
      return NextResponse.json(payload);
    }

    const emptyPayload = {
      success: true,
      connected: true,
      hasNewOrderEmail: false,
    };
    lastCheckCache = { timestamp: Date.now(), data: emptyPayload };
    return NextResponse.json(emptyPayload);
  } catch (err: any) {
    logGmailApiError("[Check New Order Email Step 3/3: Error]", err);
    return NextResponse.json(
      {
        success: false,
        error: err.message || "Failed to check order emails",
        invalidGrant: Boolean(err.message?.includes("invalid_grant")),
      },
      { status: err.message?.includes("invalid_grant") ? 401 : 500 }
    );
  }
}

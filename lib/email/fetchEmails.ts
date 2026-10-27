import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedGmailClient, logGmailApiError } from "./gmailClient";
import { parseGmailMessage, type ParsedEmailMessage } from "./parseEmail";
import { extractOrderFromImage, extractOrderFromText } from "@/lib/ai/extractOrder";
import { matchCustomer } from "@/lib/customer/matchCustomer";
import { expandSeriesRanges } from "@/lib/ai/cleanItem";
import type { ExtractedOrder, ExtractedLineItem } from "@/types/order";
import {
  classifyOrderEmail,
  type EmailClassificationResult,
} from "./classifyOrderEmail";

export interface EmailScanResultItem {
  messageId: string;
  subject: string;
  from: string;
  status: "imported" | "skipped_duplicate" | "error" | "no_order_detected";
  importId?: string;
  salesOrderId?: string | null;
  itemsCount?: number;
  total?: number;
  customerName?: string;
  error?: string;
}

export interface EmailScanResponse {
  success: boolean;
  totalFound: number;
  importedCount: number;
  skippedCount: number;
  results: EmailScanResultItem[];
  error?: string;
}

/**
 * Process a raw email text/subject/sender into an order import
 */
export async function processEmailOrderText(params: {
  subject: string;
  fromName?: string;
  fromEmail?: string;
  date?: string;
  bodyText: string;
  messageId?: string;
  imageBuffer?: Buffer;
  imageMimeType?: string;
  imageFileName?: string;
  classification?: EmailClassificationResult;
}): Promise<{ importId: string; extracted: ExtractedOrder; customerId?: string } | null> {
  const supabase = createAdminClient();
  const msgId = params.messageId || `manual-${crypto.randomUUID()}`;

  // 1. Check duplicate if messageId provided
  if (params.messageId) {
    const { data: existing } = await supabase
      .from("order_imports")
      .select("id, sales_order_id, extracted_data, customer_id")
      .eq("source_reference", params.messageId)
      .maybeSingle();

    if (existing) {
      const existingItems = Array.isArray((existing.extracted_data as any)?.items)
        ? (existing.extracted_data as any).items
        : [];
      if (existingItems.length === 0) {
        await supabase.from("order_imports").delete().eq("id", existing.id);
      } else {
        return {
          importId: existing.id,
          extracted: existing.extracted_data as unknown as ExtractedOrder,
          customerId: existing.customer_id || undefined,
        };
      }
    }

    // Also check if extracted_data->_email_source->messageId matches
    const { data: existingByMeta } = await supabase
      .from("order_imports")
      .select("id, sales_order_id, extracted_data, customer_id")
      .contains("extracted_data", { _email_source: { messageId: params.messageId } })
      .maybeSingle();

    if (existingByMeta) {
      const existingItems = Array.isArray((existingByMeta.extracted_data as any)?.items)
        ? (existingByMeta.extracted_data as any).items
        : [];
      if (existingItems.length > 0) {
        return {
          importId: existingByMeta.id,
          extracted: existingByMeta.extracted_data as unknown as ExtractedOrder,
          customerId: existingByMeta.customer_id || undefined,
        };
      }
    }
  }

  // 2. Extract using AI
  let extracted: ExtractedOrder | null = null;
  let storedFileName: string | null = null;

  if (params.imageBuffer && params.imageMimeType) {
    // Upload image to storage
    const ext = params.imageFileName?.split(".").pop() || "png";
    storedFileName = `email_${crypto.randomUUID()}.${ext}`;

    const { error: uploadErr } = await supabase.storage
      .from("order-uploads")
      .upload(storedFileName, params.imageBuffer, {
        contentType: params.imageMimeType,
        upsert: false,
      });

    if (uploadErr) {
      console.warn("[Email Process] Storage upload warning:", uploadErr);
    }

    try {
      const extractionResult = await extractOrderFromImage(params.imageBuffer, params.imageMimeType);
      extracted = extractionResult.order;
    } catch (err) {
      console.warn("[Email Process] Image extraction failed:", err);

      if (storedFileName) {

        await supabase.storage.from("order-uploads").remove([storedFileName]);

      }
      return null;
    }
  } else {
    const fullText = `From: ${params.fromName || params.fromEmail || "Customer"}${params.fromEmail ? ` <${params.fromEmail}>` : ""
      }\nSubject: ${params.subject}\nDate: ${params.date || new Date().toISOString()}\n\nEmail Body:\n${params.bodyText}`;

    try {
      extracted = await extractOrderFromText(fullText);
    } catch (err) {
      console.warn("[Email Process] Text extraction failed:", err);
      return null;
    }
  }

  // Intelligently expand series ranges (e.g. "computer 1to8" -> "computer 1" .. "computer 8")
  if (extracted && Array.isArray(extracted.items)) {
    extracted.items = expandSeriesRanges(extracted.items);
  }

  // STRICT VALIDATION: If valid line items could not be parsed automatically,
  // but multi-signal classification indicates order or ambiguous intent, stage as 'review'
  // instead of discarding so operators can inspect and recover genuine orders.
  const validItems = (extracted?.items || []).filter(
    (it) =>
      it &&
      (Boolean(it.description?.trim()) || Boolean(it.sku?.trim())) &&
      ((Number(it.quantity) || 0) > 0 || (Number(it.unit_price) || 0) > 0 || (it.description?.trim().length || 0) > 1)
  );

  if (!extracted || validItems.length === 0) {
    if (params.classification?.isOrder) {
      console.log(`[Email Process] Order intent detected in email ${msgId} ("${params.subject}"), but line items require manual entry. Staging as review.`);
      const fallbackItems: ExtractedLineItem[] =
        params.classification.detectedItemsPreview && params.classification.detectedItemsPreview.length > 0
          ? params.classification.detectedItemsPreview.map((desc) => ({
            description: desc,
            quantity: 1,
            unit_price: 0,
          }))
          : [
            {
              description: params.subject || "Order item from email (requires manual entry)",
              quantity: 1,
              unit_price: 0,
            },
          ];

      extracted = extracted || {
        customer: {
          name: params.fromName || params.fromEmail || "Email Customer",
          email: params.fromEmail,
        },
        items: fallbackItems,
      };
      extracted.items = fallbackItems;
    } else {
      console.log(`[Email Process] No line items found in email ${msgId} ("${params.subject}"). Discarding non-order email.`);
      if (storedFileName) {
        await supabase.storage.from("order-uploads").remove([storedFileName]);
      }
      return null;
    }
  } else {
    extracted.items = validItems;
  }

  // 3. Fallback missing customer name/email from sender info
  if (!extracted.customer?.name || extracted.customer.name.trim() === "") {
    extracted.customer = extracted.customer || {};
    extracted.customer.name = params.fromName || params.fromEmail || "Email Customer";
  }
  if (!extracted.customer?.email && params.fromEmail) {
    extracted.customer = extracted.customer || {};
    extracted.customer.email = params.fromEmail;
  }

  // DO NOT fabricate customer PO numbers if missing from email/document.
  // Leave undefined/empty so operators can verify and input the actual customer PO.
  if (extracted.po_number && !extracted.po_number.trim()) {
    delete extracted.po_number;
  }

  // 4. Attach email metadata and AI classification to extracted_data
  (extracted as any)._email_source = {
    messageId: msgId,
    subject: params.subject,
    from: params.fromEmail ? `${params.fromName || ""} <${params.fromEmail}>`.trim() : params.fromName || "",
    date: params.date || new Date().toISOString(),
    bodySnippet: params.bodyText.slice(0, 300),
  };

  if (params.classification) {
    (extracted as any)._classification = params.classification;
  }

  // 5. Match customer
  const customerMatch = await matchCustomer(extracted.customer);

  // 5b. Deduplicate by PO number: check if an import or sales order with this PO number already exists
  if (extracted.po_number && extracted.po_number.trim()) {
    const cleanPo = extracted.po_number.trim();

    // Check if a sales_order already exists with this PO number
    const { data: existingSo } = await supabase
      .from("sales_order")
      .select("id, order_number, customer_id")
      .eq("order_number", cleanPo)
      .maybeSingle();

    // Check if an existing order_imports record already has this PO number
    const { data: existingImports } = await supabase
      .from("order_imports")
      .select("id, sales_order_id, customer_id, extracted_data, processing_status")
      .order("created_at", { ascending: false })
      .limit(50);

    const matchImp = existingImports?.find((imp) => {
      const po = (imp.extracted_data as any)?.po_number;
      return po && po.trim().toLowerCase() === cleanPo.toLowerCase();
    });

    if (matchImp) {
      console.log(
        `[Email Process] Found existing import ${matchImp.id} for PO '${cleanPo}'. Reusing to prevent duplicate drafts.`
      );
      return {
        importId: matchImp.id,
        extracted: (matchImp.extracted_data as unknown as ExtractedOrder) || extracted,
        customerId: matchImp.customer_id || customerMatch.customerId || undefined,
      };
    }
  }

  // 6. Insert into order_imports (flagged as 'review' if ambiguous, low confidence, or manual items needed)
  const isReviewNeeded = Boolean(
    params.classification?.requiresReview ||
    params.classification?.category === "ambiguous" ||
    (params.classification?.confidence != null && params.classification.confidence < 0.75) ||
    params.classification?.suggestedAction === "flag_for_review" ||
    validItems.length === 0
  );
  const initialStatus = isReviewNeeded ? "review" : "pending";
  const sourceRef = msgId || storedFileName;
  const { data: importRecord, error: insertError } = await supabase
    .from("order_imports")
    .insert({
      source_type: "email",
      source_reference: sourceRef,
      customer_id: customerMatch.customerId || null,
      extracted_data: extracted as any,
      processing_status: initialStatus,
    })
    .select()
    .single();

  if (insertError || !importRecord) {
    throw new Error(`Failed to save email order import: ${insertError?.message || "Unknown error"}`);
  }

  return {
    importId: importRecord.id,
    extracted,
    customerId: customerMatch.customerId || undefined,
  };
}

export function isAutomatedOrNonOrderEmail(from: string, subject: string): boolean {
  const f = (from || "").toLowerCase();
  const s = (subject || "").toLowerCase();

  const botSenders = [
    "noreply", "no-reply", "notification", "notifications", "marketing", "updates",
    "newsletter", "mailer-daemon", "support@", "welcome@", "changelog",
    "redditmail.com", "engage.canva.com", "canva.com", "docker.com", "lovable.dev",
    "supabase.com", "neon.tech", "openrouter.ai", "contact.elevenlabs.io", "tm.openai.com",
    "googleplay-noreply", "googleone-noreply", "accounts.google.com"
  ];
  if (botSenders.some(b => f.includes(b))) return true;

  const nonOrderSubjects = [
    "reminder about", "we are investigating", "has been paused", "going to be paused",
    "welcome to", "getting started", "security alert", "sign-in attempt", "terms and policies",
    "changelog", "try gemini", "meet manus", "meet your", "chatgpt -", "annual creative report",
    "deprecat", "quarterly reminder", "teachers day", "invitation", "invoice paid", "payment receipt",
    "statement of account", "password reset", "verification code", "verify your email"
  ];
  if (nonOrderSubjects.some(p => s.includes(p))) return true;

  return false;
}

export function hasOrderIntent(parsed: ParsedEmailMessage): boolean {
  if (isAutomatedOrNonOrderEmail(parsed.from, parsed.subject)) return false;

  const textToScan = `${parsed.subject} ${parsed.bodyText}`.toLowerCase();
  const orderKeywords = [
    "order", "po", "purchase", "requisition", "books", "book", "set", "sets",
    "copies", "item", "items", "qty", "quantity", "rate", "price", "mrp",
    "invoice", "quotation", "dispatch", "transport", "delivery", "school",
    "urgent", "additional order", "class-", "class 1", "class 2", "class 3", "std",
    "किताब", "ऑर्डर", "प्रत", "नग", "पाठ्यपुस्तक"
  ];

  const hasKeywords = orderKeywords.some(kw => textToScan.includes(kw));

  // Only consider attachments if they are substantial (> 10KB) image or PDF
  const hasSubstantialAttachment = (parsed.attachments || []).some(
    a => (a.mimeType.startsWith("image/") || a.mimeType.includes("pdf") || /\.(jpe?g|png|webp|pdf)$/i.test(a.filename)) &&
      (a.size === 0 || a.size > 10000)
  );

  return hasKeywords || hasSubstantialAttachment;
}

/**
 * Fetch unread order emails from authenticated Gmail inbox
 */
export async function fetchUnreadOrderEmails(options?: {
  maxResults?: number;
  query?: string;
  markAsRead?: boolean;
}): Promise<EmailScanResponse> {
  console.log("\n================================================================================");
  console.log("[Gmail Scan] 🚀 Starting Gmail Order Inbox Scan");
  console.log("[Gmail Scan Step 1/4: Authentication] Verifying OAuth credentials...");
  const auth = await getAuthenticatedGmailClient();
  if (!auth) {
    console.error("[Gmail Scan Step 1/4: Authentication] ❌ Gmail is not connected. Missing refresh token.");
    throw new Error("Gmail is not connected. Please connect your Gmail account first at /inbox.");
  }
  console.log(`[Gmail Scan Step 1/4: Authentication] ✅ Authenticated as: ${auth.userEmail}`);

  const { gmail } = auth;
  const supabase = createAdminClient();
  const maxResults = options?.maxResults || 10;
  const markAsRead = options?.markAsRead !== false; // default true

  // Search unread messages from INBOX. Ensures keyword-free genuine orders reach classification.
  const query = options?.query || "label:INBOX is:unread";
  console.log(`[Gmail Scan Step 2/4: Query INBOX] Searching messages with query: "${query}" (max: ${maxResults})...`);

  let listRes;
  try {
    listRes = await gmail.users.messages.list({
      userId: "me",
      q: query,
      maxResults,
    });
    console.log(`[Gmail Scan Step 2/4: Query INBOX] ✅ messages.list succeeded. Found ${listRes.data.messages?.length || 0} candidate message(s).`);
  } catch (err: any) {
    logGmailApiError("[Gmail Scan Step 2/4: messages.list]", err);
    if (err.message?.includes("invalid_grant") || err.response?.data?.error === "invalid_grant") {
      throw new Error(`Gmail API error: invalid_grant (Google refresh token has expired or was revoked. Please reconnect your Gmail account at /inbox)`);
    }
    throw new Error(`Gmail API error: ${err.message || "Unable to list emails"}`);
  }

  const messages = listRes.data.messages || [];

  if (messages.length === 0) {
    console.log("[Gmail Scan Step 2/4: Query INBOX] No unread candidate messages in INBOX.");
    return {
      success: true,
      totalFound: 0,
      importedCount: 0,
      skippedCount: 0,
      results: [],
    };
  }

  const results: EmailScanResultItem[] = [];
  let importedCount = 0;
  let skippedCount = 0;

  for (const msg of messages) {
    if (!msg.id) continue;

    try {
      // 1. Check duplicate by message ID
      const { data: existing } = await supabase
        .from("order_imports")
        .select("id, sales_order_id, processing_status")
        .eq("source_reference", msg.id)
        .maybeSingle();

      if (existing) {
        console.log(`[Gmail Scan] Skipping duplicate email ${msg.id}`);
        skippedCount++;
        results.push({
          messageId: msg.id,
          subject: "(Previously Scanned)",
          from: "",
          status: "skipped_duplicate",
          importId: existing.id,
          salesOrderId: existing.sales_order_id,
        });
        continue;
      }

      // 2. Fetch full message
      console.log(`[Gmail Scan Step 3/4: Fetch Message] Fetching full details for message ID ${msg.id}...`);
      const msgRes = await gmail.users.messages.get({
        userId: "me",
        id: msg.id,
        format: "full",
      });

      const parsed: ParsedEmailMessage = parseGmailMessage(msgRes.data);

      // Multi-Signal + AI Intent Classification
      console.log(`\n[Gmail Scan Step 4/4: AI Classification] ── Evaluating Multi-Signal AI Intent for ${msg.id} ──`);
      console.log(`[Gmail Scan Step 4/4] Subject: "${parsed.subject}", From: ${parsed.from}`);

      const classification = await classifyOrderEmail(parsed, supabase);
      console.log(
        `[Gmail Scan] Multi-Signal Category: ${classification.category} (${Math.round(
          classification.confidence * 100
        )}% confidence), Requires Review: ${classification.requiresReview}`
      );
      console.log(`[Gmail Scan] AI Explanation: "${classification.explanation}"`);

      if (!classification.isOrder) {
        console.log(
          `[Gmail Scan] ⏭️ Skipping non-order email (${classification.category}): "${parsed.subject}" — ${classification.explanation}`
        );

        // Cache as rejected in order_imports with exact multi-signal classification
        try {
          await supabase.from("order_imports").insert({
            source_type: "email",
            source_reference: msg.id,
            processing_status: "rejected",
            extracted_data: {
              _email_source: {
                messageId: msg.id,
                subject: parsed.subject,
                from: parsed.from,
                date: parsed.date,
              },
              _classification: classification,
              items: [],
              reason: classification.category,
              summary: classification.explanation,
            },
          });
        } catch {
          // ignore duplicate insert errors
        }

        if (markAsRead) {
          try {
            await gmail.users.messages.modify({
              userId: "me",
              id: msg.id,
              requestBody: { removeLabelIds: ["UNREAD"] },
            });
          } catch { }
        }

        results.push({
          messageId: msg.id,
          subject: parsed.subject,
          from: parsed.from,
          status: "no_order_detected",
        });
        continue;
      }

      console.log(
        `[Gmail Scan] 🚀 Proceeding with verified order (${classification.category}, Action: ${classification.suggestedAction})`
      );

      // Check if duplicate with storage reference
      const { data: existingBySubject } = await supabase
        .from("order_imports")
        .select("id, sales_order_id, processing_status, extracted_data")
        .contains("extracted_data", { _email_source: { messageId: msg.id } })
        .maybeSingle();

      if (existingBySubject) {
        console.log(`[Gmail Scan] Duplicate found via JSON metadata for ${msg.id}`);
        skippedCount++;
        results.push({
          messageId: msg.id,
          subject: parsed.subject,
          from: parsed.from,
          status: "skipped_duplicate",
          importId: existingBySubject.id,
          salesOrderId: existingBySubject.sales_order_id,
        });
        continue;
      }

      // 3. Check for attachments (image)
      let imageBuffer: Buffer | undefined;
      let imageMimeType: string | undefined;
      let imageFileName: string | undefined;

      const imageAttachment = parsed.attachments.find(
        (a) => a.mimeType.startsWith("image/") || /\.(jpe?g|png|webp)$/i.test(a.filename)
      );

      if (imageAttachment && imageAttachment.attachmentId) {
        console.log(`[Gmail Scan] Found image attachment: ${imageAttachment.filename} (${imageAttachment.size} bytes)`);
        try {
          const attachRes = await gmail.users.messages.attachments.get({
            userId: "me",
            messageId: msg.id,
            id: imageAttachment.attachmentId,
          });

          if (attachRes.data.data) {
            imageBuffer = Buffer.from(attachRes.data.data, "base64url");
            imageMimeType = imageAttachment.mimeType;
            imageFileName = imageAttachment.filename;
          }
        } catch (attachErr) {
          console.warn(`[Gmail Scan] Failed to download attachment:`, attachErr);
        }
      }

      // 4. Process email into order
      const processResult = await processEmailOrderText({
        subject: parsed.subject || "Order Email",
        fromName: parsed.fromName,
        fromEmail: parsed.fromEmail,
        date: parsed.date,
        bodyText: parsed.bodyText,
        messageId: msg.id,
        imageBuffer,
        imageMimeType,
        imageFileName,
        classification,
      });

      // 5. Mark as read in Gmail if requested
      if (markAsRead) {
        try {
          await gmail.users.messages.modify({
            userId: "me",
            id: msg.id,
            requestBody: {
              removeLabelIds: ["UNREAD"],
            },
          });
          console.log(`[Gmail Scan] Marked email ${msg.id} as read`);
        } catch (readErr) {
          console.warn(`[Gmail Scan] Could not remove UNREAD label from ${msg.id}:`, readErr);
        }
      }

      if (!processResult) {
        console.log(`[Gmail Scan] Email ${msg.id} ("${parsed.subject}") contains no valid order items. Skipping.`);
        try {
          await supabase.from("order_imports").insert({
            source_type: "email",
            source_reference: msg.id,
            processing_status: "rejected",
            extracted_data: {
              _email_source: {
                messageId: msg.id,
                subject: parsed.subject,
                from: parsed.from,
                date: parsed.date,
              },
              items: [],
              reason: "no_order_detected",
            },
          });
        } catch { }

        results.push({
          messageId: msg.id,
          subject: parsed.subject,
          from: parsed.from,
          status: "no_order_detected",
        });
        continue;
      }

      importedCount++;
      results.push({
        messageId: msg.id,
        subject: parsed.subject,
        from: parsed.from,
        status: "imported",
        importId: processResult.importId,
        itemsCount: processResult.extracted.items?.length || 0,
        total: processResult.extracted.total || 0,
        customerName: processResult.extracted.customer?.name || parsed.fromName,
      });
    } catch (err: any) {
      console.error(`[Gmail Scan] Error processing email ${msg.id}:`, err);
      results.push({
        messageId: msg.id,
        subject: "(Failed to process)",
        from: "",
        status: "error",
        error: err.message || "Unknown error",
      });
    }
  }

  // Update last scan info in app_settings
  try {
    const now = new Date().toISOString();
    await supabase.from("app_settings").upsert([
      { key: "email_last_scan_at", value: now, updated_at: now },
      { key: "email_last_scan_new_orders", value: String(importedCount), updated_at: now },
      {
        key: "email_last_scan_status",
        value: importedCount > 0
          ? `Scanned ${messages.length} email(s) — imported ${importedCount} new order(s)`
          : `Scanned ${messages.length} email(s) — no new purchase orders`,
        updated_at: now,
      },
    ], { onConflict: "key" });
  } catch { }

  return {
    success: true,
    totalFound: messages.length,
    importedCount,
    skippedCount,
    results,
  };
}

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAutomatedOrNonOrderEmail, type ParsedEmailMessage } from "./parseEmail";
import { getApiKey } from "@/lib/ai/geminiText";

/**
 * The 6 canonical commercial intent categories for incoming emails
 */
export const OrderCategoryEnum = z.enum([
  "order_request",       // Clear purchase or supply requirement
  "ambiguous",           // Unclear or tentative purchase intent (needs manual review)
  "enquiry",             // Price inquiries, catalog requests, specimen copy requests
  "invoice_receipt",     // Inbound vendor invoices, bills, payment confirmations
  "tracking_or_support", // Delivery tracking, transport LR queries, complaints
  "unrelated_spam",      // Newsletters, marketing, automated alerts, system notifications
]);

export type OrderCategory = z.infer<typeof OrderCategoryEnum>;

/**
 * Structured evidence gathered from multiple signals
 */
export const ClassificationEvidenceSchema = z.object({
  senderContext: z.string().describe("Evidence from sender identity, customer matching, and order history"),
  catalogContext: z.string().describe("Evidence from product titles, SKUs, classes, editions, and languages matched"),
  attachmentContext: z.string().describe("Evidence from attached documents, photos of slips, or lack of order docs"),
  languageContext: z.string().describe("Evidence from phrasing, commercial intent tone, and multilingual signals"),
});

export type ClassificationEvidence = z.infer<typeof ClassificationEvidenceSchema>;

/**
 * Schema validating the AI classifier output
 */
export const EmailClassificationSchema = z.object({
  category: OrderCategoryEnum,
  isOrder: z.boolean().describe("True if commercial intent represents a purchase order or supply requirement"),
  confidence: z.number().min(0).max(1).describe("Confidence score between 0.0 and 1.0"),
  requiresReview: z.boolean().describe("True if intent is ambiguous or confidence is below 75%"),
  explanation: z.string().describe("Concise explanation detailing why this classification was made"),
  evidence: ClassificationEvidenceSchema,
  detectedItemsPreview: z.array(z.string()).default([]).describe("Names/descriptions and quantities of items detected"),
  suggestedAction: z.enum(["import_draft", "flag_for_review", "skip_rejected"]),
});

export type EmailClassificationResult = z.infer<typeof EmailClassificationSchema> & {
  signals: EmailClassificationSignals;
};

export interface EmailClassificationSignals {
  fromEmail: string;
  fromName: string;
  subject: string;
  bodySnippet: string;
  textLength: number;

  // Sender & Customer History
  isKnownCustomer: boolean;
  customerId?: string;
  customerName?: string;
  customerCode?: string;
  pastOrdersCount: number;

  // Product Catalog Matches
  catalogMatches: string[];
  catalogMatchCount: number;
  detectedClasses: string[];

  // Attachment Analysis
  hasDocumentAttachment: boolean;
  attachmentCount: number;
  attachmentDetails: Array<{
    filename: string;
    mimeType: string;
    size: number;
    isLikelyOrderDoc: boolean;
  }>;
  attachmentSummary: string;
}

/**
 * 1. Multi-Signal Context Gathering
 * Inspects:
 * - Sender identity & history in Supabase (customers & sales_order)
 * - Product catalog matches (items table: names, codes, descriptions)
 * - Supported attachments (PDF, JPEG, PNG, WEBP, XLSX, CSV)
 * - Multilingual and class/standard patterns (Marathi, English, Hindi, Std 1-10)
 */
export async function collectEmailSignals(
  parsed: ParsedEmailMessage,
  supabase = createAdminClient()
): Promise<EmailClassificationSignals> {
  const fromEmail = (parsed.fromEmail || "").toLowerCase().trim();
  const fromName = (parsed.fromName || "").trim();
  const subject = parsed.subject || "";
  const bodyText = parsed.bodyText || "";
  const combinedText = `${subject}\n${bodyText}`.toLowerCase();

  // 1. Sender & Customer Context Lookup
  let isKnownCustomer = false;
  let customerId: string | undefined;
  let customerName: string | undefined;
  let customerCode: string | undefined;
  let pastOrdersCount = 0;

  try {
    if (fromEmail && fromEmail.includes("@")) {
      const emailDomain = fromEmail.split("@")[1];
      // Search exact email or domain match on active customers
      const { data: matchedCustomers } = await supabase
        .from("customers")
        .select("customer_id, name, code, email")
        .eq("is_deleted", false)
        .or(`email.ilike.%${fromEmail}%,email.ilike.%@${emailDomain}%`)
        .limit(1);

      if (matchedCustomers && matchedCustomers.length > 0) {
        const c = matchedCustomers[0];
        isKnownCustomer = true;
        customerId = c.customer_id;
        customerName = c.name;
        customerCode = c.code || undefined;
      }
    }

    if (!isKnownCustomer && fromName.length > 3) {
      const { data: matchedByName } = await supabase
        .from("customers")
        .select("customer_id, name, code, email")
        .eq("is_deleted", false)
        .ilike("name", `%${fromName.slice(0, 25)}%`)
        .limit(1);

      if (matchedByName && matchedByName.length > 0) {
        const c = matchedByName[0];
        isKnownCustomer = true;
        customerId = c.customer_id;
        customerName = c.name;
        customerCode = c.code || undefined;
      }
    }

    if (customerId) {
      const { count } = await supabase
        .from("sales_order")
        .select("id", { count: "exact", head: true })
        .eq("customer_id", customerId);

      pastOrdersCount = count || 0;
    }
  } catch (err) {
    console.warn("[MultiSignal] Customer lookup error:", err);
  }

  // 2. Product Catalog Context Matching (Query items table)
  const catalogMatches: string[] = [];
  const detectedClasses: string[] = [];

  try {
    // Sample active catalog items (correct column names: id, name, code, descriptions)
    const { data: items } = await supabase
      .from("items")
      .select("id, name, code, descriptions")
      .eq("is_deleted", false)
      .limit(80);

    if (items && items.length > 0) {
      for (const item of items) {
        const title = (item.name || "").toLowerCase().trim();
        const code = (item.code || "").toLowerCase().trim();

        if (title.length > 3 && combinedText.includes(title)) {
          if (!catalogMatches.includes(item.name)) {
            catalogMatches.push(item.name);
          }
        } else if (code.length > 3 && combinedText.includes(code)) {
          if (!catalogMatches.includes(item.code)) {
            catalogMatches.push(item.code);
          }
        }
      }
    }

    // Common educational publishing terms & class standards
    const standardMatches = combinedText.match(
      /\b(?:std|class|grade|standard|इयत्ता)\s*[-.:]?\s*(?:[1-9]|1[0-2]|[१-९]|१०|११|१२)\b/gi
    );
    if (standardMatches) {
      for (const m of standardMatches.slice(0, 5)) {
        if (!detectedClasses.includes(m)) detectedClasses.push(m);
      }
    }

    const publishingSubjectMatches = combinedText.match(
      /\b(?:आनंदी\s*मराठी|lets\s*write\s*english|wtw\s*gk|balbharati|marathi|mathematics|maths?|science|evs|social\s*studies|drawing|कथा|कविता|सुगम\s*भारती)\b/gi
    );
    if (publishingSubjectMatches) {
      for (const s of publishingSubjectMatches.slice(0, 5)) {
        if (!catalogMatches.includes(s)) catalogMatches.push(s);
      }
    }
  } catch (err) {
    console.warn("[MultiSignal] Product matching error:", err);
  }

  // 3. Attachment Signals Analysis
  const attachmentDetails = (parsed.attachments || []).map((a) => {
    const fn = (a.filename || "").toLowerCase();
    const isDoc =
      a.mimeType.startsWith("image/") ||
      a.mimeType.includes("pdf") ||
      /\.(jpe?g|png|webp|pdf|xlsx?|csv)$/i.test(fn);

    // Distinguish real order docs from tiny email signatures, logos, or tracking pixels
    const isSmallIcon =
      (a.size > 0 && a.size < 8192) ||
      /(logo|icon|banner|signature|footer|image001|image002|avatar|spacer|badge)/i.test(fn);

    const isLikelyOrderDoc = isDoc && !isSmallIcon;

    return {
      filename: a.filename || "unnamed-attachment",
      mimeType: a.mimeType || "application/octet-stream",
      size: a.size || 0,
      isLikelyOrderDoc,
    };
  });

  const hasDocumentAttachment = attachmentDetails.some((a) => a.isLikelyOrderDoc);
  const attachmentSummary =
    attachmentDetails.length > 0
      ? attachmentDetails
        .map((a) => `${a.filename} (${(a.size / 1024).toFixed(1)} KB, ${a.mimeType}${a.isLikelyOrderDoc ? ", Genuine Doc" : ""})`)
        .join(", ")
      : "No attachments";

  return {
    fromEmail,
    fromName,
    subject,
    bodySnippet: bodyText.slice(0, 2000),
    textLength: bodyText.length,
    isKnownCustomer,
    customerId,
    customerName,
    customerCode,
    pastOrdersCount,
    catalogMatches: catalogMatches.slice(0, 8),
    catalogMatchCount: catalogMatches.length,
    detectedClasses,
    hasDocumentAttachment,
    attachmentCount: attachmentDetails.length,
    attachmentDetails,
    attachmentSummary,
  };
}

/**
 * 2. Multi-Signal AI Classifier
 * Combines gathered evidence and evaluates commercial intent via Gemini AI with Zod validation.
 */
export async function classifyOrderEmail(
  parsed: ParsedEmailMessage,
  supabase = createAdminClient()
): Promise<EmailClassificationResult> {
  const signals = await collectEmailSignals(parsed, supabase);

  // Fast pre-filter for obvious automated bots/newsletters or system notifications
  if (isAutomatedOrNonOrderEmail(signals.fromEmail, signals.subject)) {
    return {
      category: "unrelated_spam",
      isOrder: false,
      confidence: 0.99,
      requiresReview: false,
      explanation: "Automated notification, system newsletter, or bot sender.",
      evidence: {
        senderContext: `Sender address or subject contains bot/non-order pattern: ${signals.fromEmail}`,
        catalogContext: "No catalog context evaluated for automated email.",
        attachmentContext: signals.attachmentSummary,
        languageContext: "Automated broadcast email or non-order subject.",
      },
      detectedItemsPreview: [],
      suggestedAction: "skip_rejected",
      signals,
    };
  }

  const apiKey = getApiKey();
  if (apiKey) {
    try {
      const aiResult = await queryGeminiClassification(signals, apiKey);
      if (aiResult) {
        return {
          ...aiResult,
          signals,
        };
      }
    } catch (aiErr) {
      console.warn("[MultiSignal AI] Gemini classifier warning, using heuristic fallback:", aiErr);
    }
  }

  // Fallback: Multi-Signal Deterministic Scoring
  return heuristicMultiSignalClassifier(signals);
}

/**
 * AI Query & Schema Validation using Zod
 */
async function queryGeminiClassification(
  signals: EmailClassificationSignals,
  apiKey: string
): Promise<Omit<EmailClassificationResult, "signals"> | null> {
  const candidateModels = [
    process.env.GEMINI_MODEL || "gemini-3.8-flash",
    "gemini-3.5-flash",
    "gemini-3.7-flash",
    "gemini-3-flash-preview",
  ];

  const prompt = `
You are the Chief Sales Order Intake Intelligence System for StockOS (an educational and school publishing distributor in India).
Your task is to classify incoming emails using MULTI-SIGNAL EVIDENCE into one of 6 commercial categories.

=== EVIDENCE GATHERED ===
1. SENDER CONTEXT:
   - Name: "${signals.fromName || "Unknown"}"
   - Email: "${signals.fromEmail || "Unknown"}"
   - Known Existing Customer in DB: ${signals.isKnownCustomer
      ? `YES (Name: "${signals.customerName}", Code: "${signals.customerCode || "N/A"}", Past Orders: ${signals.pastOrdersCount})`
      : "NO (New or unrecognized sender)"
    }

2. PRODUCT CATALOG MATCHES:
   - Matched Inventory Items: ${signals.catalogMatches.length > 0 ? signals.catalogMatches.join(", ") : "None detected directly"}
   - Matched Class / Standard Grades: ${signals.detectedClasses.length > 0 ? signals.detectedClasses.join(", ") : "None"}

3. ATTACHMENT SIGNALS:
   - Document Attachments: ${signals.attachmentSummary}

4. EMAIL CONTENT:
   - Subject: "${signals.subject}"
   - Body:
"""
${signals.bodySnippet}
"""

=== CLASSIFICATION CATEGORIES ===
1. "order_request":
   The sender clearly intends to purchase, book, or request physical supply of books/items.
   * CRITICAL: An order does NOT need to use the word "order" or "purchase". For example:
     - "Please dispatch 50 copies of Class 4 English to our school by Friday" -> order_request
     - "Requirement for academic session 2026: 1. Marathi Std 1 (20 copies)..." -> order_request
     - "Urgent requirement for Class 2 sets: send to Pune branch" -> order_request
     - Attached photo of a handwritten requisition slip or cash memo -> order_request

2. "ambiguous":
   Unclear or tentative purchase intent (e.g. an informal list of books with no clear confirmation to buy, mixed inquiry and order, or a photo that might be an order but requires human inspection).

3. "enquiry":
   Asking for price lists, catalogs, quotations, specimen copies, or discounts WITHOUT placing an order (e.g., "What is the price of Std 4 Science?", "Please send your 2026 book catalogue").

4. "invoice_receipt":
   Inbound vendor bill, utility receipt, payment confirmation sent TO StockOS (where StockOS owes money or received a receipt). NOT a customer order.

5. "tracking_or_support":
   Follow-up regarding shipment status, courier transport LR numbers, delivery delays, or damaged copies.

6. "unrelated_spam":
   Newsletters, marketing, security alerts, platform notifications, job applications, or cold spam.

=== DECISION GUIDELINES ===
- Do not treat any single signal as conclusive; combine sender history, catalog terms, attachments, and tone.
- If it is clearly an "order_request" and confidence >= 0.75, set "isOrder": true, "requiresReview": false, "suggestedAction": "import_draft".
- If it has order signals but is tentative or confidence < 0.75, set "isOrder": true, "requiresReview": true, "category": "ambiguous", "suggestedAction": "flag_for_review".
- If it is an "enquiry", "invoice_receipt", "tracking_or_support", or "unrelated_spam", set "isOrder": false, "suggestedAction": "skip_rejected".

=== OUTPUT FORMAT ===
Respond strictly with valid JSON conforming to this schema:
{
  "category": "order_request" | "ambiguous" | "enquiry" | "invoice_receipt" | "tracking_or_support" | "unrelated_spam",
  "isOrder": boolean,
  "confidence": number, // 0.0 to 1.0
  "requiresReview": boolean,
  "explanation": "Concise 1-2 sentences explaining why this classification was chosen based on evidence",
  "evidence": {
    "senderContext": "Summary of sender credibility and customer history",
    "catalogContext": "Summary of product matches, grades, or publishing terms",
    "attachmentContext": "Summary of attachment relevance",
    "languageContext": "Summary of phrasing and purchase intent"
  },
  "detectedItemsPreview": ["string describing item and qty if visible"],
  "suggestedAction": "import_draft" | "flag_for_review" | "skip_rejected"
}
`;

  for (const model of candidateModels) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.1,
              responseMimeType: "application/json",
            },
          }),
        }
      );

      clearTimeout(timeout);

      if (!res.ok) continue;

      const data = await res.json();
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) continue;

      const parsedJson = JSON.parse(rawText);

      // Validate with Zod
      const validated = EmailClassificationSchema.safeParse(parsedJson);
      if (validated.success) {
        // Enforce review if confidence is below 75%
        const finalRequiresReview =
          validated.data.requiresReview ||
          validated.data.confidence < 0.75 ||
          validated.data.category === "ambiguous";

        return {
          ...validated.data,
          requiresReview: finalRequiresReview,
          suggestedAction:
            finalRequiresReview && validated.data.isOrder
              ? "flag_for_review"
              : validated.data.suggestedAction,
        };
      } else {
        console.warn("[MultiSignal AI] Zod validation issues:", validated.error);
      }
    } catch {
      // try next candidate model
    }
  }

  return null;
}

/**
 * Heuristic Multi-Signal Classifier (Resilient Fallback)
 */
function heuristicMultiSignalClassifier(
  signals: EmailClassificationSignals
): EmailClassificationResult {
  const text = `${signals.subject} ${signals.bodySnippet}`.toLowerCase();

  // 1. Negative Filters

  const isReceipt = /(payment\s*received|receipt\s*for|your\s*bill|transaction\s*id|statement\s*of\s*account|paid\s*successfully)/i.test(text);
  const isEnquiry = /(quotation|price\s*list|catalogue|sample\s*copy|specimen|how\s*much\s*is|discount\s*rate|enquiry)/i.test(text);
  const isTracking = /(lr\s*no|tracking\s*number|where\s*is\s*my\s*order|dispatch\s*status|courier\s*status|consignment)/i.test(text);

  if (isReceipt) {
    return {
      category: "invoice_receipt",
      isOrder: false,
      confidence: 0.9,
      requiresReview: false,
      explanation: "Detected inbound payment receipt or vendor billing statement.",
      evidence: {
        senderContext: signals.fromEmail,
        catalogContext: "No customer purchase intent detected.",
        attachmentContext: signals.attachmentSummary,
        languageContext: "Contains receipt/payment keywords.",
      },
      detectedItemsPreview: [],
      suggestedAction: "skip_rejected",
      signals,
    };
  }

  if (isEnquiry && !signals.hasDocumentAttachment) {
    return {
      category: "enquiry",
      isOrder: false,
      confidence: 0.85,
      requiresReview: false,
      explanation: "Sender is requesting pricing, quotations, or product catalogue without purchase commitment.",
      evidence: {
        senderContext: signals.isKnownCustomer ? `Known customer (${signals.customerName})` : signals.fromEmail,
        catalogContext: signals.catalogMatches.join(", ") || "General inquiry",
        attachmentContext: signals.attachmentSummary,
        languageContext: "Contains inquiry and quotation terms.",
      },
      detectedItemsPreview: [],
      suggestedAction: "skip_rejected",
      signals,
    };
  }

  if (isTracking) {
    return {
      category: "tracking_or_support",
      isOrder: false,
      confidence: 0.85,
      requiresReview: false,
      explanation: "Message is a follow-up inquiry regarding order delivery or tracking.",
      evidence: {
        senderContext: signals.fromEmail,
        catalogContext: "Tracking dispatch",
        attachmentContext: signals.attachmentSummary,
        languageContext: "Contains delivery tracking tokens.",
      },
      detectedItemsPreview: [],
      suggestedAction: "skip_rejected",
      signals,
    };
  }

  // 2. Positive Scoring
  let score = 0;
  if (signals.isKnownCustomer) score += 35;
  if (signals.hasDocumentAttachment) score += 35;
  if (signals.catalogMatchCount >= 1) score += 25;
  if (signals.pastOrdersCount > 0) score += 15;
  if (/(dispatch|send|deliver|require|need|copies|set|qty|urgent|प्रत|नग|पुस्तके)/i.test(text)) score += 20;

  if (score >= 60) {
    const confidence = Math.min(0.92, Math.max(0.76, score / 100));
    return {
      category: "order_request",
      isOrder: true,
      confidence,
      requiresReview: false,
      explanation: "High confidence order request matching customer history, catalog products, and document signals.",
      evidence: {
        senderContext: signals.isKnownCustomer ? `Verified customer ${signals.customerName} (${signals.pastOrdersCount} previous orders)` : "New customer",
        catalogContext: signals.catalogMatches.join(", ") || "Order terms matched",
        attachmentContext: signals.attachmentSummary,
        languageContext: "Commercial order phrasing identified.",
      },
      detectedItemsPreview: signals.catalogMatches,
      suggestedAction: "import_draft",
      signals,
    };
  }

  if (score >= 35) {
    return {
      category: "ambiguous",
      isOrder: true,
      confidence: 0.68,
      requiresReview: true,
      explanation: "Moderate purchase signals detected but requires manual confirmation by operator.",
      evidence: {
        senderContext: signals.isKnownCustomer ? `Customer: ${signals.customerName}` : signals.fromEmail,
        catalogContext: signals.catalogMatches.join(", ") || "General terms",
        attachmentContext: signals.attachmentSummary,
        languageContext: "Tentative purchase phrasing.",
      },
      detectedItemsPreview: signals.catalogMatches,
      suggestedAction: "flag_for_review",
      signals,
    };
  }

  return {
    category: "unrelated_spam",
    isOrder: false,
    confidence: 0.8,
    requiresReview: false,
    explanation: "Insufficient commercial order or product catalog signals detected.",
    evidence: {
      senderContext: signals.fromEmail,
      catalogContext: "No products matched",
      attachmentContext: signals.attachmentSummary,
      languageContext: "No order intent found",
    },
    detectedItemsPreview: [],
    suggestedAction: "skip_rejected",
    signals,
  };
}

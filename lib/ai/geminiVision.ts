/**
 * Stage E: Conditional Vision Fallback
 * Sends the original image / PDF directly to Google Gemini Multimodal Vision
 * when primary OCR extraction is poor, illegible, or incomplete.
 */

import fs from "fs";
import path from "path";
import { ExtractedOrderSchema, ORDER_EXTRACTION_PROMPT } from "./prompts";
import { cleanItemDescriptionAndQuantity, expandSeriesRanges } from "./cleanItem";
import { detectAndAutoRotateImage } from "../image/autoRotate";
import type { ExtractedOrder } from "@/types/order";

function getApiKey(): string | undefined {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  try {
    const envPath = path.resolve(process.cwd(), ".env.local");
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, "utf-8");
      const match = content.match(/^\s*GEMINI_API_KEY\s*=\s*(.*)$/m);
      if (match && match[1]) {
        return match[1].trim().replace(/^['"]|['"]$/g, "");
      }
    }
  } catch {
    // ignore
  }
  return undefined;
}

/**
 * Normalizes extracted fields, dates, and line totals from Vision response.
 */
function normalizeVisionOrder(parsed: any): ExtractedOrder {
  // Normalize alternative root-level field keys from LLMs
  if (!parsed.po_number && (parsed.order_number || parsed.order_no)) {
    parsed.po_number = String(parsed.order_number || parsed.order_no).trim();
  }
  if (!parsed.customer && parsed.customer_details) {
    parsed.customer = parsed.customer_details;
  }
  if (!parsed.total && parsed.total_amount) {
    parsed.total = Number(parsed.total_amount) || 0;
  }

  if (Array.isArray(parsed.items)) {
    for (const it of parsed.items) {
      if (!it.description && (it.item_name || it.name)) {
        it.description = String(it.item_name || it.name).trim();
      }
      if (it.unit_price == null && (it.rate != null || it.price != null)) {
        it.unit_price = it.rate != null ? it.rate : it.price;
      }
      if (it.quantity == null && (it.qty != null || it.quantity_ordered != null)) {
        it.quantity = it.qty != null ? it.qty : it.quantity_ordered;
      }

      // Intelligently separate item description from quantity/packaging units (e.g. "Amigos Nur 2 sets" -> "Amigos Nur", qty: 2)
      if (it.description) {
        const cleaned = cleanItemDescriptionAndQuantity(it.description, it.quantity);
        it.description = cleaned.description;
        if (cleaned.quantity != null && (it.quantity == null || it.quantity === 0)) {
          it.quantity = cleaned.quantity;
        }
      }

      // Default missing or zero quantity to 1
      const parsedQty = it.quantity != null ? Number(it.quantity) : NaN;
      it.quantity = !isNaN(parsedQty) && parsedQty > 0 ? parsedQty : 1;
      if (it.unit_price != null) {
        it.unit_price = Number(it.unit_price) || null;
      }
      if (!it.line_total || it.line_total === 0) {
        if (it.quantity && it.quantity > 0 && it.unit_price && it.unit_price > 0) {
          it.line_total = Number((it.quantity * it.unit_price).toFixed(2));
        } else {
          it.line_total = null;
        }
      }
    }

    // Automatically expand any class series ranges (e.g. "computer 1to8" -> "computer 1" ... "computer 8")
    parsed.items = expandSeriesRanges(parsed.items);
  }

  if (!parsed.total || parsed.total === 0) {
    parsed.total = (parsed.items || []).reduce(
      (acc: number, it: any) => acc + (it.line_total || 0),
      0
    );
  }

  if (parsed.order_date && typeof parsed.order_date === "string") {
    const dMatch = parsed.order_date.match(
      /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/
    );
    if (dMatch) {
      const day = dMatch[1].padStart(2, "0");
      const month = dMatch[2].padStart(2, "0");
      let year = dMatch[3];
      if (year.length === 2) year = `20${year}`;
      parsed.order_date = `${year}-${month}-${day}`;
    }
  }

  const validated = ExtractedOrderSchema.parse(parsed) as ExtractedOrder;
  validated.document_type = parsed.document_type || "sales_order";
  validated.extraction_method = "gemini_vision";

  return validated;
}

/**
 * Extracts order from Image / PDF buffer directly using Gemini Multimodal Vision.
 */
export async function extractOrderWithVision(
  imageOrPdfBuffer: Buffer | ArrayBuffer | Uint8Array | string,
  mimeTypeHint: string = "image/jpeg"
): Promise<ExtractedOrder | null> {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.warn("[Gemini Vision] GEMINI_API_KEY is missing. Skipping Vision fallback.");
    return null;
  }

  let base64Data: string;
  let mimeType = mimeTypeHint || "image/jpeg";

  if (typeof imageOrPdfBuffer === "string") {
    // URL or data URL
    if (imageOrPdfBuffer.startsWith("data:")) {
      const parts = imageOrPdfBuffer.split(",");
      const match = parts[0].match(/:(.*?);/);
      if (match) mimeType = match[1];
      base64Data = parts[1];
    } else {
      console.log("[Gemini Vision] Fetching document from URL:", imageOrPdfBuffer);
      try {
        const res = await fetch(imageOrPdfBuffer);
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        const cType = res.headers.get("content-type");
        if (cType && !cType.includes("text") && !cType.includes("html")) {
          mimeType = cType.split(";")[0];
        }
        const ab = await res.arrayBuffer();
        base64Data = Buffer.from(ab).toString("base64");
      } catch (err) {
        console.error("[Gemini Vision] Failed to fetch image URL:", err);
        return null;
      }
    }
  } else if (Buffer.isBuffer(imageOrPdfBuffer)) {
    base64Data = imageOrPdfBuffer.toString("base64");
  } else if (imageOrPdfBuffer instanceof ArrayBuffer) {
    base64Data = Buffer.from(imageOrPdfBuffer).toString("base64");
  } else if (imageOrPdfBuffer instanceof Uint8Array) {
    base64Data = Buffer.from(imageOrPdfBuffer).toString("base64");
  } else {
    base64Data = Buffer.from(imageOrPdfBuffer as any).toString("base64");
  }

  // Physically rotate phone / WhatsApp photos if taken sideways or upside-down
  if (mimeType !== "application/pdf") {
    try {
      const rawBuf = Buffer.from(base64Data, "base64");
      const rotated = await detectAndAutoRotateImage(rawBuf, mimeType, apiKey);
      if (rotated.rotated) {
        console.log(`[Gemini Vision] 🔄 Auto-rotated image by ${rotated.angle}° CW for upright OCR precision.`);
        base64Data = rotated.buffer.toString("base64");
      }
    } catch (rotErr) {
      console.warn("[Gemini Vision] Auto-rotate check non-blocking error:", rotErr);
    }
  }

  // Load active catalog items from database to assist Vision model
  let catalogContext = "";
  try {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const supabase = createAdminClient();
    const { data: dbItems } = await supabase
      .from("items")
      .select("name")
      .eq("is_deleted", false)
      .limit(200);

    if (dbItems && dbItems.length > 0) {
      const names = dbItems.map((i: any) => i.name).filter(Boolean);
      catalogContext = `
PRODUCT CATALOG REFERENCE (from items database):
${names.map((n: string) => `- "${n}"`).join("\n")}

STRICT TRANSCRIPTION & VERBATIM INTEGRITY RULES:
1. STRICT VERBATIM RULE:
   - Extract EXACTLY what is written on each line.
   - NEVER invent, substitute, or prepend brand names (e.g. NEVER replace 'Olive' with 'Pikaso'). Only include a brand name if it is clearly written on that specific line or header.
   - The catalog list above is provided ONLY as an optical reference to verify correct spelling of known titles, NEVER to overwrite, rename, or force titles from different publishers.

2. CRITICAL QUANTITY / PACKAGING SEPARATION RULE:
   - When a handwritten line contains quantity or unit notes like "Amigos Nur 2 sets", "Amigos Nur 2 sets 02", or "Natural Science I 6 pcs":
     ALWAYS extract the pure book/product title (e.g. "Amigos Nur", "Natural Science I") into the "description" field!
     NEVER include "2 sets", "sets", or "6 pcs" in the "description" field!
     Extract "2" or "6" into the "quantity" field. "2 sets" means that 2 is the quantity!
`;
    }
  } catch (cErr) {
    console.warn("[Gemini Vision] Could not fetch catalog items for prompt context:", cErr);
  }

  const candidateModels = [
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
    "gemini-flash-lite-latest",
    process.env.GEMINI_MODEL || "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-3.7-flash",
    "gemini-3.8-flash",
    "gemini-flash-latest",
    "gemini-pro-latest",
  ];

  const visionPrompt = `
${ORDER_EXTRACTION_PROMPT}

You are provided with a high-resolution image/PDF of a sales order, purchase order, invoice, or handwritten order document.

CRITICAL ORIENTATION & ROTATION CHECK:
- Smartphone photos of handwritten diaries, notepads, or slips are frequently captured in portrait mode while the diary is written in landscape (rotated 90° or 270° sideways).
- Check the printed ruling lines and printed date/day headers (e.g. "17 MAY SATURDAY" or calendar grids) to orient the handwriting correctly before reading.
- Read strictly horizontally along the ruled lines from start to finish.
- NEVER read across rows vertically. Each ruled line is a separate item!
- When arrows (←) or ditto marks appear on subsequent lines (e.g. "Campus - write well small letter B" followed by "← Maths B"), carry forward the series/publisher name so the second item is "Campus Maths B".
- Quantities with leading zeros like "09" represent the number 9 (NOT 3).

1. Determine the document type: "sales_order", "purchase_order", "invoice", "cash_memo", "handwritten_slip", "quotation", or "other".
2. Read the layout, tables, handwritten ink, and printed numbers with extreme precision.
3. Extract all details into the required JSON schema. Include "document_type" in the output JSON.
${catalogContext}
`;

  for (const model of candidateModels) {
    let attempts = 0;
    const maxAttempts = 2;

    while (attempts < maxAttempts) {
      attempts++;
      try {
        console.log(`[Gemini Vision] Calling model ${model} (attempt ${attempts}/${maxAttempts}) with mimeType: ${mimeType}...`);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 60000);

        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: controller.signal,
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    { text: visionPrompt },
                    {
                      inline_data: {
                        mime_type: mimeType,
                        data: base64Data,
                      },
                    },
                  ],
                },
              ],
              generationConfig: {
                responseMimeType: "application/json",
                temperature: 0.1,
              },
            }),
          }
        );
        clearTimeout(timeout);

        if (!res.ok) {
          const errorText = await res.text();
          console.warn(`[Gemini Vision] Model ${model} returned error status ${res.status}:`, errorText.slice(0, 150));
          if ((res.status === 503 || res.status === 429) && attempts < maxAttempts) {
            console.log(`[Gemini Vision] ⏳ Backing off 2s due to ${res.status} before retry...`);
            await new Promise((resolve) => setTimeout(resolve, 2000));
            continue;
          }
          break; // proceed to next candidate model
        }

        const data = await res.json();
        const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!responseText?.trim()) {
          console.warn(`[Gemini Vision] Model ${model} returned empty response.`);
          break;
        }

        const jsonMatch = responseText.match(/```(?:json)?\n([\s\S]*?)\n```/);
        const jsonString = jsonMatch ? jsonMatch[1] : responseText;

        const parsed = JSON.parse(jsonString);
        const normalized = normalizeVisionOrder(parsed);

        console.log(
          `[Gemini Vision] ✅ Extraction succeeded with ${model}. Extracted items: ${normalized.items.length}, total: ₹${normalized.total}`
        );
        return normalized;
      } catch (err) {
        console.warn(`[Gemini Vision] Model ${model} error:`, err instanceof Error ? err.message : err);
        if (attempts < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 1500));
        }
      }
    }
  }

  return null;
}

export async function extractOrderFromVision(
  imageInput: Buffer | ArrayBuffer | Uint8Array | string,
  mimeTypeHint: string = "image/jpeg"
): Promise<ExtractedOrder> {
  const result = await extractOrderWithVision(imageInput, mimeTypeHint);
  if (!result) {
    throw new Error("Gemini Vision was unable to extract order details from the image.");
  }
  return result;
}


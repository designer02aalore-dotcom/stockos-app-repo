/**
 * Stage C: Gemini AI — Order Analysis
 * Identifies document type from OCR text, extracts structured fields,
 * and formats the output into standard ExtractedOrder JSON schema.
 */

import fs from "fs";
import path from "path";
import { ExtractedOrderSchema, ORDER_EXTRACTION_PROMPT } from "./prompts";
import { cleanItemDescriptionAndQuantity, expandSeriesRanges } from "./cleanItem";
import type { ExtractedOrder } from "@/types/order";

export function getApiKey(): string | undefined {
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
 * Normalizes extracted fields, dates, and line totals.
 */
function normalizeOrder(parsed: any, ocrText: string, ocrConfidence?: number): ExtractedOrder {
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

  // Line items normalization & calculation
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

  // Calculate total if missing or zero
  if (!parsed.total || parsed.total === 0) {
    parsed.total = (parsed.items || []).reduce(
      (acc: number, it: any) => acc + (it.line_total || 0),
      0
    );
  }

  // Normalize date if written as DD/MM/YY or DD/MM/YYYY
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

  // Preserve raw text, OCR confidence, and document type
  validated.raw_text = ocrText;
  if (typeof ocrConfidence === "number") {
    validated.ocr_confidence = ocrConfidence;
  }
  validated.document_type =
    parsed.document_type || "sales_order";
  validated.extraction_method = "ocr_gemini_text";

  return validated;
}

/**
 * Extracts order from OCR text using Google Gemini AI.
 */
export async function extractOrderFromOcrText(
  ocrText: string,
  ocrConfidence?: number
): Promise<ExtractedOrder> {
  const text = (ocrText || "").trim();
  if (!text) {
    throw new Error("OCR text is empty.");
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is missing from the environment.");
  }

  const candidateModels = [
    process.env.GEMINI_MODEL || "gemini-3.8-flash",
    "gemini-3.7-flash",
    "gemini-3.5-flash",
    "gemini-3.1-flash-lite",
    "gemini-flash-latest",
  ];

  const promptContent = `
${ORDER_EXTRACTION_PROMPT}

You are provided with raw text extracted from a business document via OCR.
1. Determine the document type: "sales_order", "purchase_order", "invoice", "cash_memo", "handwritten_slip", "quotation", or "other".
2. Extract customer details, PO number, order date, and all line items with quantity, unit price, and line total.
3. Include "document_type" as a top-level string field in the JSON output.

Raw OCR Text:
<ocr_text>
${text}
</ocr_text>
`;

  let lastError: Error | null = null;

  for (const model of candidateModels) {
    try {
      console.log(`[Gemini Text] Calling Gemini model: ${model}...`);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 45000);

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            contents: [
              {
                parts: [{ text: promptContent }],
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
        console.warn(`[Gemini Text] Model ${model} returned error status ${res.status}:`, errorText.slice(0, 150));
        continue;
      }

      const data = await res.json();
      const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!responseText?.trim()) {
        console.warn(`[Gemini Text] Model ${model} returned empty response.`);
        continue;
      }

      const jsonMatch = responseText.match(/```(?:json)?\n([\s\S]*?)\n```/);
      const jsonString = jsonMatch ? jsonMatch[1] : responseText;

      const parsed = JSON.parse(jsonString);
      const normalized = normalizeOrder(parsed, text, ocrConfidence);

      console.log(
        `[Gemini Text] ✅ Extraction succeeded with ${model}. Extracted items: ${normalized.items.length}, doc_type: ${normalized.document_type}`
      );
      return normalized;
    } catch (err) {
      console.warn(`[Gemini Text] Model ${model} error:`, err instanceof Error ? err.message : err);
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastError || new Error("Gemini AI failed to extract order from OCR text.");
}

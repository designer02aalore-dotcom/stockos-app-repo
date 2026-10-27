import type { ExtractedOrder } from "@/types/order";

import { extractTextWithOcr, extractOrderText } from "../ocr/extractText";
import { validateExtractedOrder } from "../order/validateOrder";

import { extractOrderFromOcrText } from "./geminiText";
import { extractOrderWithVision } from "./geminiVision";

/**
 * Describes how the order was extracted.
 */
export type OrderExtractionResult = {
  order: ExtractedOrder;
  method: "ocr-gemini-text" | "gemini-vision-fallback";
  ocrText: string;
  validation: ReturnType<typeof validateExtractedOrder>;
  warnings: string[];
};

/**
 * Robust Sales Order extraction workflow:
 *
 * Step 1: Extract text using OCR (Tesseract).
 * Step 2: Send OCR text to Gemini Text model for structured JSON parsing.
 * Step 3: If OCR text produces zero items, is unreadable, or fails,
 *         fall back to Gemini Multimodal Vision to inspect the image directly.
 * Step 4: Validate the extracted order.
 */
export async function extractOrderFromImage(
  imageUrlOrBuffer: string | Buffer | ArrayBuffer,
  mimeTypeHint = "image/jpeg"
): Promise<OrderExtractionResult> {
  const warnings: string[] = [];
  let ocrText = "";
  let ocrConfidence = 0;
  let method: "ocr-gemini-text" | "gemini-vision-fallback" = "ocr-gemini-text";

  console.log("\n================================================================================");
  console.log(`[Order Extraction Pipeline] 🚀 Starting extraction pipeline (MIME: ${mimeTypeHint})`);
  console.log("================================================================================");

  let extractedOrder: ExtractedOrder | null = null;

  // -------------------------------------------------------------
  // STEP 1: PRIMARY - Gemini Multimodal Vision AI Extraction
  // Directly reads the document image, layout, table grid lines,
  // handwritten tick marks, and printed text simultaneously.
  // -------------------------------------------------------------
  console.log("[Pipeline] ── STEP 1: Primary Multimodal Vision AI Extraction ──");
  try {
    console.log("[Pipeline] 👁️ Passing image to Gemini Multimodal Vision AI...");
    const visionResult = await extractOrderWithVision(imageUrlOrBuffer, mimeTypeHint);
    if (visionResult && (visionResult.items?.length || 0) > 0) {
      console.log(`[Pipeline] ✅ Vision AI succeeded! Extracted ${visionResult.items.length} items.`);
      extractedOrder = visionResult;
      method = "gemini-vision-fallback";
    }
  } catch (vErr) {
    console.warn("[Pipeline] ⚠️ Vision AI extraction encountered an error:", vErr);
  }

  // -------------------------------------------------------------
  // STEP 2: FALLBACK - Tesseract OCR Text Extraction + Text AI
  // If Vision AI failed or extracted 0 items, run Tesseract OCR
  // -------------------------------------------------------------
  if (!extractedOrder || (extractedOrder.items?.length || 0) === 0) {
    console.log("\n[Pipeline] ── STEP 2: Fallback to Tesseract OCR Text Extraction ──");
    try {
      console.log("[Pipeline] 🔍 Running Tesseract OCR on document image...");
      const ocrResult = await extractTextWithOcr(imageUrlOrBuffer);
      ocrText = (ocrResult.text || "").trim();
      ocrConfidence = ocrResult.confidence;
      console.log(`[Pipeline] ✅ OCR complete: ${ocrText.length} chars extracted (Confidence: ${ocrConfidence}%).`);
    } catch (ocrErr) {
      console.warn("[Pipeline] ⚠️ Tesseract OCR extraction encountered an error:", ocrErr);
    }

    if (ocrText.length >= 15) {
      console.log("\n[Pipeline] ── Gemini AI Data Analysis on Extracted OCR Text ──");
      try {
        console.log(`[Pipeline] 🧠 Sending ${ocrText.length} characters of OCR text to Gemini for data analysis...`);
        const textResult = await extractOrderFromOcrText(ocrText, ocrConfidence);
        if (textResult && (textResult.items?.length || 0) > 0) {
          console.log(`[Pipeline] ✅ Gemini AI data analysis succeeded! Extracted ${textResult.items.length} items.`);
          extractedOrder = textResult;
          method = "ocr-gemini-text";
        } else {
          console.warn("[Pipeline] ⚠️ Gemini AI analyzed OCR text but found 0 line items.");
        }
      } catch (aiErr) {
        console.warn("[Pipeline] ⚠️ Gemini AI analysis on OCR text encountered an issue:", aiErr);
      }
    } else {
      console.log(`[Pipeline] OCR text was very short or sparse (${ocrText.length} chars).`);
    }
  }

  if (!extractedOrder) {
    throw new Error(
      "Failed to extract order details from document. Both OCR data analysis and Vision AI were unable to read the order."
    );
  }

  // ---------------------------------------------
  // STEP 3: Validate the extracted order
  // ---------------------------------------------
  console.log("\n[Pipeline] ── STEP 3: Validating Extracted Order ──");
  const validation = validateExtractedOrder(extractedOrder);
  console.log(
    `[Pipeline] 📋 Validation Results: isCompleteEnough = ${validation.isCompleteEnough}, isValid = ${validation.isValid}`
  );
  console.log(
    `[Pipeline] 📦 Extracted Line Items: ${extractedOrder.items?.length || 0}, Customer: "${
      extractedOrder.customer?.name || "N/A"
    }", PO: "${extractedOrder.po_number || "N/A"}"`
  );

  if (!validation.isValid || !validation.isCompleteEnough) {
    console.warn("[Pipeline] ⚠️ Order extraction validation issues detected:");
    validation.issues.forEach((issue) => {
      console.warn(`   - ${issue.toString()}`);
      warnings.push(issue.toString());
    });
  }

  console.log("\n================================================================================");
  console.log(`[Pipeline] 🎯 SUCCESS: Order extracted via ${method}`);
  console.log("================================================================================\n");

  return {
    order: extractedOrder,
    method,
    ocrText,
    validation,
    warnings,
  };
}

/**
 * Compatibility function for code that already imports
 * extractOrderFromText().
 */
export async function extractOrderFromText(
  text: string
): Promise<ExtractedOrder> {
  return extractOrderFromOcrText(text);
}
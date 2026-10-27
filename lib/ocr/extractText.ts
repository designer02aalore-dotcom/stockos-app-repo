/**
 * Stage B: OCR — Primary Text Extraction
 * Independent module for local/primary OCR using Tesseract.
 * Preserves raw extracted text and overall extraction confidence.
 */
import Tesseract from "tesseract.js";

export interface OcrResult {
  text: string;
  confidence: number; // 0 to 100
}

/**
 * Extract raw text and confidence score from image buffer or image URL.
 */
export async function extractTextWithOcr(
  imageUrlOrBuffer: string | Buffer | ArrayBuffer
): Promise<OcrResult> {
  try {
    console.log("[OCR] Starting primary OCR text extraction...");

    const inputData =
      imageUrlOrBuffer instanceof ArrayBuffer
        ? Buffer.from(imageUrlOrBuffer)
        : imageUrlOrBuffer;

    const result = await Tesseract.recognize(inputData as any, "eng", {
      logger: (m) => {
        if (m.status === "recognizing text" && typeof m.progress === "number") {
          console.log(`[OCR] ${m.status}: ${Math.round(m.progress * 100)}%`);
        }
      },
    });

    const rawText = (result.data?.text || "").trim();
    const confidence =
      typeof result.data?.confidence === "number"
        ? Math.round(result.data.confidence)
        : 0;

    console.log(
      `[OCR] Extraction complete. Length: ${rawText.length} chars, Confidence: ${confidence}%`
    );

    return {
      text: rawText,
      confidence,
    };
  } catch (error) {
    console.error("[OCR] Error during OCR extraction:", error);
    return {
      text: "",
      confidence: 0,
    };
  }
}

/**
 * Backward compatibility helper returning raw string.
 */
export async function extractTextFromImage(
  imageUrlOrBuffer: string | Buffer | ArrayBuffer
): Promise<string> {
  const res = await extractTextWithOcr(imageUrlOrBuffer);
  return res.text;
}

export const extractOrderText = extractTextFromImage;
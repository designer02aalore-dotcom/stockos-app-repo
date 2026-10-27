import fs from "fs";
import path from "path";
import sharp from "sharp";

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

export interface AutoRotateResult {
  buffer: Buffer;
  mimeType: string;
  rotated: boolean;
  angle: number;
}

/**
 * Detects whether an image is sideways or upside down, and physically rotates it upright using Sharp.
 * 1. Checks EXIF orientation tags.
 * 2. If EXIF is missing (common with WhatsApp uploads), uses a fast, lightweight Gemini Vision check.
 * 3. Rotates full-resolution image pixels so OCR and Multimodal AI receive a perfectly upright image.
 */
export async function detectAndAutoRotateImage(
  inputBuffer: Buffer | ArrayBuffer | Uint8Array,
  mimeTypeHint: string = "image/jpeg",
  providedApiKey?: string
): Promise<AutoRotateResult> {
  const buf = Buffer.isBuffer(inputBuffer) ? inputBuffer : Buffer.from(inputBuffer as any);

  // Skip non-image types (e.g., PDF)
  if (mimeTypeHint === "application/pdf" || (!mimeTypeHint.startsWith("image/") && !mimeTypeHint.includes("png") && !mimeTypeHint.includes("jpeg"))) {
    return { buffer: buf, mimeType: mimeTypeHint, rotated: false, angle: 0 };
  }

  try {
    // 1. Initial EXIF auto-rotate via Sharp
    const metadata = await sharp(buf).metadata();
    if (!metadata.format) {
      return { buffer: buf, mimeType: mimeTypeHint, rotated: false, angle: 0 };
    }

    let normalizedBuf = await sharp(buf).rotate().normalize().toBuffer();

    const apiKey = providedApiKey || getApiKey();
    if (!apiKey) {
      return { buffer: normalizedBuf, mimeType: mimeTypeHint, rotated: false, angle: 0 };
    }

    // 2. Create small, lightweight thumbnail for ultra-fast visual orientation detection
    const thumbBuf = await sharp(normalizedBuf)
      .resize({ width: 512, height: 512, fit: "inside" })
      .jpeg({ quality: 80 })
      .toBuffer();

    const detectPrompt = `Inspect the handwritten lines, printed date/headers (e.g. calendar headers), or ruling lines on this document.
How many degrees CLOCKWISE must this image be rotated so that the text and document headers (like dates or titles) are completely right-side up and readable horizontally from left to right?
- 0: already right-side up
- 90: needs 90 degrees clockwise rotation
- 180: needs 180 degrees rotation (upside down)
- 270: needs 270 degrees clockwise rotation (90 degrees counter-clockwise)
Return strict JSON only: { "rotate_degrees_clockwise": 0 | 90 | 180 | 270 }`;

    const rotationModels = [
      "gemini-3.5-flash-lite",
      "gemini-3.1-flash-lite",
      "gemini-flash-lite-latest",
      "gemini-3.6-flash",
      "gemini-3.5-flash",
      "gemini-3.7-flash",
    ];
    let detectedRot = 0;

    for (const model of rotationModels) {
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
              contents: [
                {
                  parts: [
                    { text: detectPrompt },
                    {
                      inline_data: {
                        mime_type: "image/jpeg",
                        data: thumbBuf.toString("base64"),
                      },
                    },
                  ],
                },
              ],
              generationConfig: {
                response_mime_type: "application/json",
                temperature: 0,
              },
            }),
          }
        );
        clearTimeout(timeout);

        if (res.ok) {
          const data = await res.json();
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
          const parsed = JSON.parse(text || "{}");
          const rot = Number(parsed.rotate_degrees_clockwise ?? parsed.rotation_degrees ?? 0);
          if (rot === 90 || rot === 180 || rot === 270) {
            detectedRot = rot;
            break;
          }
        }
      } catch (mErr) {
        console.warn(`[AutoRotate] Model ${model} failed, trying fallback:`, mErr);
      }
    }

    if (detectedRot === 90 || detectedRot === 180 || detectedRot === 270) {
      console.log(`[AutoRotate] 🔄 Detected phone image needs ${detectedRot}° CW physical rotation to become upright.`);
      const finalBuf = await sharp(normalizedBuf).rotate(detectedRot).toBuffer();
      return {
        buffer: finalBuf,
        mimeType: mimeTypeHint,
        rotated: true,
        angle: detectedRot,
      };
    }

    return { buffer: normalizedBuf, mimeType: mimeTypeHint, rotated: false, angle: 0 };
  } catch (err) {
    console.warn("[AutoRotate] Non-blocking auto-rotation warning:", err);
    return { buffer: buf, mimeType: mimeTypeHint, rotated: false, angle: 0 };
  }
}

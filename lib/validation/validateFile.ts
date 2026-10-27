/**
 * Stage A: File Validation & Quality Check
 * Validates Image / PDF format, file size limits, and buffer integrity.
 */

export interface FileValidationResult {
  isValid: boolean;
  error?: string;
  fileType: "image" | "pdf";
  mimeType: string;
  sizeBytes: number;
  fileName: string;
}

const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "application/pdf",
];

const ALLOWED_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "pdf"];

const MIN_FILE_SIZE_BYTES = 64; // Minimum bytes to avoid empty/corrupted files

export function validateOrderFile(file: {
  name?: string;
  type?: string;
  size: number;
  buffer?: Buffer | ArrayBuffer | Uint8Array;
}): FileValidationResult {
  const fileName = file.name || "uploaded-document";
  const sizeBytes = file.size;

  // 1. File size check (verify not empty or corrupted)
  if (!sizeBytes || sizeBytes <= 0) {
    return {
      isValid: false,
      error: "The uploaded file is empty (0 bytes). Please upload a valid order document.",
      fileType: "image",
      mimeType: "application/octet-stream",
      sizeBytes: 0,
      fileName,
    };
  }

  if (sizeBytes < MIN_FILE_SIZE_BYTES) {
    return {
      isValid: false,
      error: `File is too small (${sizeBytes} bytes) and appears damaged or corrupt.`,
      fileType: "image",
      mimeType: "application/octet-stream",
      sizeBytes,
      fileName,
    };
  }

  // 2. Extension check
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  let mimeType = file.type?.toLowerCase() || "";

  // Infer MIME type if generic or missing
  if (!mimeType || mimeType === "application/octet-stream") {
    if (ext === "pdf") mimeType = "application/pdf";
    else if (ext === "jpg" || ext === "jpeg") mimeType = "image/jpeg";
    else if (ext === "png") mimeType = "image/png";
    else if (ext === "webp") mimeType = "image/webp";
  }

  const isAllowedExt = ALLOWED_EXTENSIONS.includes(ext);
  const isAllowedMime = ALLOWED_MIME_TYPES.includes(mimeType);

  if (!isAllowedExt && !isAllowedMime) {
    return {
      isValid: false,
      error: `Unsupported file format (.${ext || "unknown"}). Allowed formats are JPG, JPEG, PNG, WEBP, and PDF.`,
      fileType: ext === "pdf" || mimeType.includes("pdf") ? "pdf" : "image",
      mimeType: mimeType || "application/octet-stream",
      sizeBytes,
      fileName,
    };
  }

  const fileType: "image" | "pdf" =
    ext === "pdf" || mimeType.includes("pdf") ? "pdf" : "image";

  // 3. Buffer integrity & magic bytes check (if buffer is present)
  if (file.buffer) {
    const bytes =
      file.buffer instanceof Uint8Array
        ? file.buffer
        : Buffer.isBuffer(file.buffer)
        ? new Uint8Array(file.buffer)
        : new Uint8Array(file.buffer as ArrayBuffer);

    if (bytes.length >= 4) {
      if (fileType === "pdf") {
        // PDF header check: %PDF
        const header = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
        if (!header.startsWith("%PDF")) {
          return {
            isValid: false,
            error: "The uploaded PDF file header is corrupted or not a valid PDF document.",
            fileType: "pdf",
            mimeType: "application/pdf",
            sizeBytes,
            fileName,
          };
        }
      } else {
        // Image signature checks
        const isPng =
          bytes[0] === 0x89 &&
          bytes[1] === 0x50 &&
          bytes[2] === 0x4e &&
          bytes[3] === 0x47;
        const isJpg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
        const isWebp =
          bytes.length >= 12 &&
          String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) === "RIFF" &&
          String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]) === "WEBP";

        if (!isPng && !isJpg && !isWebp) {
          console.warn("[validateOrderFile] Unrecognized image header bytes:", bytes.slice(0, 4));
          // If extension was valid image, allow with warning unless totally zeroed out
          const allZero = bytes.slice(0, 16).every((b) => b === 0);
          if (allZero) {
            return {
              isValid: false,
              error: "Image file content is empty or contains zeroed data bytes.",
              fileType: "image",
              mimeType,
              sizeBytes,
              fileName,
            };
          }
        }
      }
    }
  }

  return {
    isValid: true,
    fileType,
    mimeType: mimeType || (fileType === "pdf" ? "application/pdf" : "image/jpeg"),
    sizeBytes,
    fileName,
  };
}

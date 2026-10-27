/**
 * Normalizes item descriptions and extracts quantity/packaging units.
 *
 * In handwritten orders, invoices, and cash memos, writers frequently append quantity
 * or packaging notes into the description column, such as:
 * - "Amigos Nur 2 sets" -> Description: "Amigos Nur", Quantity: 2, Unit: "sets"
 * - "Amigos Nur 2 sets 02" -> Description: "Amigos Nur", Quantity: 2
 * - "Natural Science I 6 pcs" -> Description: "Natural Science I", Quantity: 6
 * - "Wise Math I 10 bdl" -> Description: "Wise Math I", Quantity: 10
 * - "Hindi 5 pkts" -> Description: "Hindi", Quantity: 5
 * - "Drawing Book (2 sets)" -> Description: "Drawing Book", Quantity: 2
 * - "English - 2 sets" -> Description: "English", Quantity: 2
 * - "आनंदी मराठी २ संच" -> Description: "आनंदी मराठी", Quantity: 2
 *
 * This function cleans the description to only contain the actual product/book name,
 * and extracts the quantity if it was not already provided or if it confirms the quantity.
 */

const DEVANAGARI_DIGITS: Record<string, string> = {
  "०": "0", "१": "1", "२": "2", "३": "3", "४": "4",
  "५": "5", "६": "6", "७": "7", "८": "8", "९": "9",
};

function normalizeDigits(str: string): string {
  return str.replace(/[०-९]/g, (d) => DEVANAGARI_DIGITS[d] || d);
}

// Packaging unit words in English and Devanagari (Hindi / Marathi)
const UNIT_WORDS_GROUP =
  "(sets?|(?:pcs|pc)\\b|pieces?|pkts?|packets?|bdl|bundles?|copies|copy|nos?\\.?|books?|kits?|box(?:es)?|cartons?|pairs?|संच|सेट|प्रती?|नग|पुस्तके?|बंडल)";

// Regex 1: Trailing quantity + unit notation:
// e.g. "Amigos Nur 2 sets", "Amigos Nur 2 sets 02", "Amigos Nur (2 sets)", "Amigos Nur - 2 sets", "Amigos Nur 2sets"
const TRAILING_QTY_UNIT_REGEX = new RegExp(
  `^(.*?)[\\s,–\\-–—]*[\\(\\[]?(\\d+|[०-९]+)\\s*${UNIT_WORDS_GROUP}[\\)\\]]?(?:[\\s,–\\-–—]*(\\d+|[०-९]+))?[\\s.,]*$`,
  "i"
);

// Regex 2: Trailing unit without digit if quantity was already specified or written separately
// e.g. "Amigos Nur sets"
const TRAILING_UNIT_ONLY_REGEX = new RegExp(
  `^(.*?)[\\s,–\\-–—]+[\\(\\[]?${UNIT_WORDS_GROUP}[\\)\\]]?[\\s.,]*$`,
  "i"
);

// Regex 3: Leading quantity + unit notation:
// e.g. "2 sets Amigos Nur", "2 sets of Amigos Nur", "2 pcs Natural Science I"
const LEADING_QTY_UNIT_REGEX = new RegExp(
  `^[\\(\\[]?(\\d+|[०-९]+)\\s*${UNIT_WORDS_GROUP}[\\)\\]]?[\\s,–\\-–—]+(?:of\\s+)?(.*?)[\\s.,]*$`,
  "i"
);

export interface CleanItemResult {
  description: string;
  quantity: number | null;
  unit: string | null;
  modified: boolean;
}

/**
 * Standardizes common unit strings (e.g. "sets" -> "SETS", "pcs" -> "PCS")
 */
function standardizeUnit(rawUnit?: string | null): string | null {
  if (!rawUnit) return null;
  const lower = rawUnit.toLowerCase().trim().replace(/\.$/, "");
  if (lower.startsWith("set") || lower === "संच" || lower === "सेट") return "SETS";
  if (lower.startsWith("pc") || lower.startsWith("piece") || lower === "नग" || lower.startsWith("प्रत")) return "PCS";
  if (lower.startsWith("pkt") || lower.startsWith("packet")) return "PKT";
  if (lower.startsWith("bdl") || lower.startsWith("bundle") || lower === "बंडल") return "BDL";
  if (lower.startsWith("cop") || lower.startsWith("book") || lower.startsWith("पुस्त")) return "PCS";
  if (lower.startsWith("box")) return "BOX";
  if (lower.startsWith("carton")) return "CTN";
  if (lower.startsWith("pair")) return "PAIR";
  return lower.toUpperCase();
}

/**
 * Separates the actual product/book name from quantity & packaging units.
 *
 * @param rawDescription The raw description string from OCR or AI extraction
 * @param existingQuantity Any quantity already extracted from a dedicated Qty column
 */
export function cleanItemDescriptionAndQuantity(
  rawDescription?: string | null,
  existingQuantity?: number | string | null
): CleanItemResult {
  if (!rawDescription || typeof rawDescription !== "string") {
    const parsedExisting =
      existingQuantity != null && !isNaN(Number(existingQuantity)) && Number(existingQuantity) > 0
        ? Number(existingQuantity)
        : null;
    return {
      description: "",
      quantity: parsedExisting,
      unit: null,
      modified: false,
    };
  }

  const trimmed = rawDescription.trim();
  let existingQtyNum: number | null = null;
  if (existingQuantity != null && !isNaN(Number(existingQuantity))) {
    const num = Number(existingQuantity);
    if (num > 0) existingQtyNum = num;
  }

  // 1. Check Trailing Quantity + Unit (e.g. "Amigos Nur 2 sets", "Amigos Nur 2 sets 02")
  const trailingMatch = trimmed.match(TRAILING_QTY_UNIT_REGEX);
  if (trailingMatch) {
    const cleanTitle = trailingMatch[1].trim();
    const qtyFromUnit = parseInt(normalizeDigits(trailingMatch[2]), 10);
    const matchedUnit = trailingMatch[3];
    const trailingSecondNumber = trailingMatch[4]
      ? parseInt(normalizeDigits(trailingMatch[4]), 10)
      : null;

    if (cleanTitle.length > 0 && !isNaN(qtyFromUnit) && qtyFromUnit > 0) {
      // Determine final quantity: prioritize explicit valid quantity or extracted quantity
      const finalQty = existingQtyNum ?? trailingSecondNumber ?? qtyFromUnit;
      return {
        description: cleanTitle,
        quantity: finalQty,
        unit: standardizeUnit(matchedUnit) || "SETS",
        modified: true,
      };
    }
  }

  // 2. Check Leading Quantity + Unit (e.g. "2 sets Amigos Nur")
  const leadingMatch = trimmed.match(LEADING_QTY_UNIT_REGEX);
  if (leadingMatch) {
    const qtyFromUnit = parseInt(normalizeDigits(leadingMatch[1]), 10);
    const matchedUnit = leadingMatch[2];
    const cleanTitle = leadingMatch[3].trim();

    if (cleanTitle.length > 0 && !isNaN(qtyFromUnit) && qtyFromUnit > 0) {
      const finalQty = existingQtyNum ?? qtyFromUnit;
      return {
        description: cleanTitle,
        quantity: finalQty,
        unit: standardizeUnit(matchedUnit) || "SETS",
        modified: true,
      };
    }
  }

  // 3. Check Trailing Unit Only (e.g. "Amigos Nur sets")
  const unitOnlyMatch = trimmed.match(TRAILING_UNIT_ONLY_REGEX);
  if (unitOnlyMatch && unitOnlyMatch[1].trim().length > 0) {
    const cleanTitle = unitOnlyMatch[1].trim();
    const matchedUnit = unitOnlyMatch[2];
    return {
      description: cleanTitle,
      quantity: existingQtyNum,
      unit: standardizeUnit(matchedUnit) || "SETS",
      modified: true,
    };
  }

  // Return unchanged if no quantity/packaging unit pattern matched
  return {
    description: trimmed,
    quantity: existingQtyNum,
    unit: null,
    modified: false,
  };
}

/**
 * Cleans only the item title string by stripping trailing or leading quantity/pack unit notations.
 */
export function cleanItemDescription(rawDescription?: string | null): string {
  return cleanItemDescriptionAndQuantity(rawDescription).description;
}

// Regex for class number ranges: "computer 1to8", "Evs1to5", "Worksheets 6to8", "Roots of society 1 to 8"
const NUMERIC_RANGE_REGEX =
  /^(.*?)(?:\s*(?:class|std|grade|level|part)?\s*?)(\d{1,2})\s*(?:to|-|–|—)\s*(\d{1,2})\s*$/i;

// Regex for pre-primary level sequences: "Nova kids nur lkg- ukg", "Nova kids nur to ukg"
const PRE_PRIMARY_RANGE_REGEX =
  /^(.*?)(?:[\s,–\-—]+)(?:(?:classes?|grades?|levels?)\s*)?(nur(?:sery)?)\s*(?:[,–\-—\s]+(lkg)\s*)?(?:to|-|–|—|[,–\-—\s]+)\s*(ukg)\s*$/i;

const ROMAN_NUMERALS_MAP: Record<string, number> = {
  i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10, xi: 11, xii: 12,
};

const ROMAN_TO_STR: Record<number, string> = {
  1: "I", 2: "II", 3: "III", 4: "IV", 5: "V", 6: "VI", 7: "VII", 8: "VIII", 9: "IX", 10: "X", 11: "XI", 12: "XII",
};

const ROMAN_RANGE_REGEX =
  /^(.*?)(?:\s*(?:class|std|grade|level|part)?\s*?)\b(i{1,3}|iv|v|vi{0,3}|ix|x)\s*(?:to|-|–|—)\s*(i{1,3}|iv|v|vi{0,3}|ix|x)\s*$/i;

/**
 * Expands series range descriptions (e.g. "computer 1to8", "Evs1to5", "Worksheets 6to8", "Nova kids nur lkg- ukg")
 * into individual line items for each class/standard.
 */
export function expandSeriesRanges<
  T extends {
    description?: string | null;
    quantity?: number | string | null;
    unit_price?: number | null;
    line_total?: number | null;
    [key: string]: any;
  }
>(items: T[]): T[] {
  if (!Array.isArray(items) || items.length === 0) return [];

  const expanded: T[] = [];

  for (const item of items) {
    const rawDesc = item.description || "";
    // Clean quantity or unit packaging notes if still attached (e.g. "computer 1to8-7sets" -> "computer 1to8", qty: 7)
    const cleaned = cleanItemDescriptionAndQuantity(rawDesc, item.quantity);
    const desc = cleaned.description.trim();
    const qty = cleaned.quantity ?? (
      item.quantity != null && !isNaN(Number(item.quantity)) && Number(item.quantity) > 0
        ? Number(item.quantity)
        : null
    );

    // 1. Check numeric class range: "computer 1to8", "Worksheets 6to8", "Evs1to5"
    const mNum = desc.match(NUMERIC_RANGE_REGEX);
    if (mNum) {
      const baseTitle = mNum[1].trim();
      const start = parseInt(mNum[2], 10);
      const end = parseInt(mNum[3], 10);

      // School grade spans in India are between 1 and 12, with start < end
      if (start >= 1 && end <= 12 && end > start && end - start <= 12 && baseTitle.length >= 2) {
        for (let classNum = start; classNum <= end; classNum++) {
          const lineTotal =
            qty !== null && qty > 0 && typeof item.unit_price === "number" && item.unit_price > 0
              ? Number((qty * item.unit_price).toFixed(2))
              : item.line_total ?? null;

          expanded.push({
            ...item,
            description: `${baseTitle} ${classNum}`,
            quantity: qty,
            line_total: lineTotal,
          });
        }
        continue;
      }
    }

    // 2. Check pre-primary sequence: "Nova kids nur lkg- ukg" -> "Nova kids Nur", "Nova kids LKG", "Nova kids UKG"
    const mPre = desc.match(PRE_PRIMARY_RANGE_REGEX);
    if (mPre) {
      const baseTitle = mPre[1].trim();
      if (baseTitle.length >= 2) {
        const levels = ["Nur", "LKG", "UKG"];
        for (const lvl of levels) {
          const lineTotal =
            qty !== null && qty > 0 && typeof item.unit_price === "number" && item.unit_price > 0
              ? Number((qty * item.unit_price).toFixed(2))
              : item.line_total ?? null;

          expanded.push({
            ...item,
            description: `${baseTitle} ${lvl}`,
            quantity: qty,
            line_total: lineTotal,
          });
        }
        continue;
      }
    }

    // 3. Check Roman numeral range: "Wise Math I to V" -> "Wise Math I", ..., "Wise Math V"
    const mRoman = desc.match(ROMAN_RANGE_REGEX);
    if (mRoman) {
      const baseTitle = mRoman[1].trim();
      const startNum = ROMAN_NUMERALS_MAP[mRoman[2].toLowerCase()];
      const endNum = ROMAN_NUMERALS_MAP[mRoman[3].toLowerCase()];

      if (
        startNum &&
        endNum &&
        startNum >= 1 &&
        endNum <= 12 &&
        endNum > startNum &&
        endNum - startNum <= 12 &&
        baseTitle.length >= 2
      ) {
        for (let classNum = startNum; classNum <= endNum; classNum++) {
          const lineTotal =
            qty !== null && qty > 0 && typeof item.unit_price === "number" && item.unit_price > 0
              ? Number((qty * item.unit_price).toFixed(2))
              : item.line_total ?? null;

          expanded.push({
            ...item,
            description: `${baseTitle} ${ROMAN_TO_STR[classNum]}`,
            quantity: qty,
            line_total: lineTotal,
          });
        }
        continue;
      }
    }

    // Normal non-range item
    expanded.push({
      ...item,
      description: desc,
      quantity: qty,
    });
  }

  return expanded;
}


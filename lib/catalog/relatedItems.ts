import { createAdminClient } from "@/lib/supabase/admin";
import {
  calculatePartialMatches,
  CatalogItem,
  PartialMatchCandidate,
} from "@/app/api/match/items/route";

const SELECT_FIELDS = "id, name, code, barcode, price, unit, descriptions, weight";

const extractDigits = (str: string): string => {
  const m = str.match(/\b(?:class|std|grade|level|part)?\s*(\d+)(?:st|nd|rd|th)?\b/i);
  if (m) return m[1];
  const r = str.match(/\b(i{1,3}|iv|v|vi{0,3}|ix|x)\b/i);
  if (r) {
    const map: Record<string, string> = {
      i: "1",
      ii: "2",
      iii: "3",
      iv: "4",
      v: "5",
      vi: "6",
      vii: "7",
      viii: "8",
      ix: "9",
      x: "10",
    };
    return map[r[1].toLowerCase()] || r[1].toLowerCase();
  }
  return "";
};

const normalizeSeriesBase = (str: string): string => {
  return str
    .toLowerCase()
    .replace(/\b(i{1,3}|iv|v|vi{0,3}|ix|x)\b/gi, "")
    .replace(/\b\d+(st|nd|rd|th)?\b/gi, "")
    .replace(/[^\p{L}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
};

export const isSameSeriesDifferentGrade = (titleA: string, titleB: string): boolean => {
  const baseA = normalizeSeriesBase(titleA);
  const baseB = normalizeSeriesBase(titleB);
  if (!baseA || !baseB) return false;
  const digitsA = extractDigits(titleA);
  const digitsB = extractDigits(titleB);
  return baseA === baseB && Boolean(digitsA && digitsB && digitsA !== digitsB);
};

const SUBJECT_KEYWORDS: Array<{ key: string; synonyms: string[] }> = [
  { key: "gk", synonyms: ["gk", "g.k", "general", "सामान्य"] },
  { key: "english", synonyms: ["english", "eng", "grammar", "cursive", "rhyme", "rhymes"] },
  { key: "hindi", synonyms: ["hindi", "हिंदी", "हिन्दी", "balpothi", "sulekh"] },
  { key: "maths", synonyms: ["maths", "math", "mathematics", "ganit", "गणित", "tables"] },
  { key: "science", synonyms: ["science", "sci", "vigyan", "विज्ञान"] },
  { key: "evs", synonyms: ["evs", "environment", "environmental"] },
  { key: "sst", synonyms: ["sst", "social", "history", "geography"] },
  { key: "computer", synonyms: ["computer", "computers", "it"] },
  { key: "drawing", synonyms: ["drawing", "art", "chitrakala"] },
];

export const getSubjectFromTitle = (str: string): string | null => {
  const clean = str.toLowerCase().replace(/[^a-z0-9\s]/g, " ");
  const tokens = clean.split(/\s+/).filter(Boolean);
  for (const s of SUBJECT_KEYWORDS) {
    if (tokens.some((t) => s.synonyms.includes(t))) return s.key;
  }
  return null;
};

function findSubjectPublisherAlternatives(
  query: string,
  itemId: string | null | undefined,
  currentSubject: string,
  allItems: CatalogItem[]
): PartialMatchCandidate[] {
  const queryDigits = extractDigits(query);
  const exactGradeMatches: PartialMatchCandidate[] = [];
  const otherMatches: PartialMatchCandidate[] = [];

  for (const it of allItems) {
    if (itemId && it.id === itemId) continue;
    if (it.name.toLowerCase().trim() === query.toLowerCase().trim()) continue;
    if (isSameSeriesDifferentGrade(query, it.name)) continue;

    const itSub = getSubjectFromTitle(it.name);
    if (itSub === currentSubject) {
      const itDigits = extractDigits(it.name);
      const isExactGrade = Boolean(queryDigits && itDigits && queryDigits === itDigits);

      const candidate: PartialMatchCandidate = {
        id: it.id,
        name: it.name,
        code: it.code,
        price: it.price,
        unit: it.unit,
        confidence: isExactGrade ? 90 : 85,
        reason: "Alternative Publisher Option",
      };

      if (isExactGrade) {
        exactGradeMatches.push(candidate);
      } else {
        otherMatches.push(candidate);
      }
    }
  }

  // If an exact grade alternative exists (e.g. WTW GK 3 for IOP. GK III), ONLY return that exact grade!
  // if (exactGradeMatches.length > 0) {
  //   return exactGradeMatches;
  // }
  // return exactGradeMatches;
  // return otherMatches;
  return exactGradeMatches;
}

/**
 * Searches and ranks related items / additional options from the catalog.
 */
export async function getRelatedCatalogItems(
  itemName?: string | null,
  sku?: string | null,
  itemId?: string | null
): Promise<PartialMatchCandidate[]> {
  let query = (itemName || "").trim();
  if (!query && !sku && !itemId) return [];

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("items")
    .select(SELECT_FIELDS)
    .eq("is_deleted", false);

  if (error || !data) {
    return [];
  }

  const items = (data ?? []) as unknown as CatalogItem[];
  const namedItems = items.filter(
    (item) => typeof item.name === "string" && item.name.trim() !== ""
  );

  // If query is empty but itemId or sku was passed, resolve the title from catalog
  if (!query) {
    if (itemId) {
      const it = namedItems.find((i) => i.id === itemId);
      if (it?.name) query = it.name;
    } else if (sku) {
      const it = namedItems.find((i) => i.code === sku || i.barcode === sku);
      if (it?.name) query = it.name;
    }
  }

  if (!query) return [];

  const matchedCandidates = calculatePartialMatches(query, namedItems);
  const currentSubject = getSubjectFromTitle(query);

  // Filter out:
  // 1. Items with confidence below 90% (only 90% and above matches allowed)
  // 2. Current item ID
  // 3. Different grade of the SAME series/publisher (e.g. WTW GK 3, 4, 5 for WTW GK 2)
  const results = matchedCandidates.filter(
    (p) =>
      p.confidence >= 90 &&
      (!itemId || p.id !== itemId) &&
      !isSameSeriesDifferentGrade(query, p.name)
  );

  // If no candidates found and subject is known (e.g. GK), find alternative publisher editions of this subject (>= 90% only)
  if (results.length === 0 && currentSubject) {
    const publisherAlts = findSubjectPublisherAlternatives(query, itemId, currentSubject, namedItems).filter(
      (p) => p.confidence >= 90
    );
    results.push(...publisherAlts);
  }

  return results;
}

/**
 * Batch version to fetch related items for multiple order lines simultaneously.
 */
export async function getBatchRelatedCatalogItems(
  items: Array<{ tempId?: string; name?: string; sku?: string; itemId?: string }>
): Promise<Array<{ tempId?: string; name: string; relatedItems: PartialMatchCandidate[]; count: number }>> {
  if (!items || items.length === 0) return [];

  const supabase = createAdminClient();
  const { data } = await supabase
    .from("items")
    .select(SELECT_FIELDS)
    .eq("is_deleted", false);

  const allItems = ((data ?? []) as unknown as CatalogItem[]).filter(
    (item) => typeof item.name === "string" && item.name.trim() !== ""
  );

  return items.map((it) => {
    const name = (it.name || "").trim();
    if (!name) {
      return { tempId: it.tempId, name: "", relatedItems: [], count: 0 };
    }

    const currentSubject = getSubjectFromTitle(name);
    let related = calculatePartialMatches(name, allItems).filter(
      (p) =>
        p.confidence >= 90 &&
        (!it.itemId || p.id !== it.itemId) &&
        !isSameSeriesDifferentGrade(name, p.name)
    );

    if (related.length === 0 && currentSubject) {
      const publisherAlts = findSubjectPublisherAlternatives(name, it.itemId, currentSubject, allItems).filter(
        (p) => p.confidence >= 90
      );
      related.push(...publisherAlts);
    }

    return {
      tempId: it.tempId,
      name,
      relatedItems: related,
      count: related.length,
    };
  });
}


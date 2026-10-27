import { NextRequest, NextResponse } from "@/lib/response";
import { createAdminClient } from "@/lib/supabase/admin";
import { cleanItemDescription } from "@/lib/ai/cleanItem";

export interface CatalogItem {
  id: string;
  name: string | null;
  code: string | null;
  barcode: string | null;
  price: number | null;
  unit: string | null;
  descriptions?: string | null;
  weight?: number | null;
}

export interface PartialMatchCandidate {
  id: string;
  name: string;
  code?: string | null;
  price?: number | null;
  unit?: string | null;
  confidence: number;
  reason?: string;
}

export interface ItemMatchResult {
  matched: boolean;
  itemId: string | null;
  confidence: number;
  catalogItem: CatalogItem | null;
  partialMatches?: PartialMatchCandidate[];
}

type MatchCandidate = {
  item: CatalogItem;
  confidence: number;
};

const SELECT_FIELDS =
  "id, name, code, barcode, price, unit, descriptions, weight";

const DEVANAGARI_WORD_MAP: Record<string, string> = {
  // Languages
  "हिंदी": "hindi",
  "हिन्दी": "hindi",
  "मराठी": "marathi",
  "संस्कृत": "sanskrit",
  "इंग्रजी": "english",
  "इंग्लिश": "english",

  // Core book components & subjects
  "अक्षर": "akshar",
  "ज्ञान": "gyan",
  "शब्द": "shabd",
  "स्वर": "swar",
  "सुलेख": "sulekh",
  "व्याकरण": "vyakaran",
  "गणित": "ganit",
  "बोध": "bodh",
  "अंक": "ank",
  "बाल": "bal",
  "गीत": "geet",
  "कविता": "kavita",
  "चित्रकला": "chitrakala",
  "सुगम": "sugam",
  "सुलभ": "sulabh",
  "भारती": "bharati",
  "अभ्यास": "abhyas",
  "पुस्तिका": "pustika",
  "पुस्तक": "pustak",
  "वाचन": "vachan",
  "लेखन": "lekhan",
  "पाढे": "padhe",
  "पहाड़ा": "pahada",
  "विज्ञान": "vigyan",
  "इतिहास": "itihas",
  "भूगोल": "bhugol",
  "नागरिकशास्त्र": "nagrikshastra",
  "प्रज्ञा": "pradnya",
  "दीप": "deep",
  "रंगोली": "rangoli",
  "कला": "kala",
  "सृजन": "srijan",
  "रचना": "rachana",
  "सदाबहार": "sadabahar",
  "पंखुड़ी": "pankhudi",
  "रिमझिम": "rimjhim",
  "गुंजन": "gunjan",
  "मधुप": "madhup",
  "मेधा": "medha",
  "पराग": "parag",
  "तरंग": "tarang",
  "उमंग": "umang",
  "आनंद": "anand",
  "आनंदी": "anandi",
  "सचित्र": "sachitra",
  "प्रवेशिका": "praveshika",
  "भाग": "part",
  "स्तर": "level",
  "कक्षा": "class",
  "इयत्ता": "std",
};

const DEVA_CONSONANTS: Record<string, string> = {
  "क": "k", "ख": "kh", "ग": "g", "घ": "gh", "ङ": "ng",
  "च": "ch", "छ": "chh", "ज": "j", "झ": "jh", "ञ": "ny",
  "ट": "t", "ठ": "th", "ड": "d", "ढ": "dh", "ण": "n",
  "त": "t", "थ": "th", "द": "d", "ध": "dh", "न": "n",
  "प": "p", "फ": "ph", "ब": "b", "भ": "bh", "म": "m",
  "य": "y", "र": "r", "ल": "l", "व": "v", "श": "sh", "ष": "sh", "स": "s", "ह": "h", "ळ": "l",
};

const DEVA_VOWELS: Record<string, string> = {
  "अ": "a", "आ": "aa", "इ": "i", "ई": "ee", "उ": "u", "ऊ": "oo", "ऋ": "ri",
  "ए": "e", "ऐ": "ai", "ओ": "o", "औ": "au", "अं": "an", "अः": "ah",
};

const DEVA_MATRAS: Record<string, string> = {
  "ा": "a", "ि": "i", "ी": "i", "ु": "u", "ू": "u", "ृ": "ri", "े": "e", "ै": "ai", "ो": "o", "ौ": "au",
  "ं": "n", "ँ": "n", "ः": "h",
};

function transliterateDevanagariGeneral(text: string): string {
  let s = text
    .replace(/ज्ञ/g, "gyan")
    .replace(/क्ष/g, "kshar")
    .replace(/श्र/g, "shr")
    .replace(/त्र/g, "tr");

  let out = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    const next = s[i + 1];

    if (DEVA_VOWELS[ch]) {
      out += DEVA_VOWELS[ch];
    } else if (DEVA_CONSONANTS[ch]) {
      out += DEVA_CONSONANTS[ch];
      if (next === "्") {
        i++;
      } else if (DEVA_MATRAS[next]) {
        // Matra supplies vowel
      } else if (DEVA_CONSONANTS[next] || next === " " || !next) {
        if (next && next !== " " && DEVA_CONSONANTS[next]) {
          out += "a";
        }
      }
    } else if (DEVA_MATRAS[ch]) {
      out += DEVA_MATRAS[ch];
    } else if (ch === "्") {
      // halant
    } else {
      out += ch;
    }
  }
  return out;
}

export function canonicalizeDevanagari(text: string): string {
  let s = (text || "")
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/\r?\n|\r/g, " ")
    .trim();

  // 1. Replace known Devanagari dictionary words
  for (const [dev, lat] of Object.entries(DEVANAGARI_WORD_MAP)) {
    s = s.replace(new RegExp(dev, "gu"), lat);
  }

  // 2. Transliterate any remaining Devanagari script characters
  if (/[\u0900-\u097F]/.test(s)) {
    s = transliterateDevanagariGeneral(s);
  }

  // 3. Normalize Marathi / Hindi phonetic variations of 'ज्ञान' (dyan, dnyan, gyan, gyaan, jnan)
  s = s.replace(/\b(dnyan|dyan|gyaan|jnan)\b/g, "gyan");

  // 4. Normalize minor phonetic spelling differences
  s = s.replace(/\bakshara\b/g, "akshar");
  s = s.replace(/\bshabda\b/g, "shabd");
  s = s.replace(/\bganita\b/g, "ganit");
  s = s.replace(/\bbodha\b/g, "bodh");
  s = s.replace(/\bswara\b/g, "swar");
  s = s.replace(/\bsulekha\b/g, "sulekh");
  s = s.replace(/\blekhana\b/g, "lekhan");
  s = s.replace(/\bvachana\b/g, "vachan");
  s = s.replace(/\bpustaka\b/g, "pustak");
  s = s.replace(/\bchitrakalaa?\b/g, "chitrakala");

  // 5. Clean whitespace
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

function normalizeName(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/\r?\n|\r/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Ignore punctuation only for the punctuation-comparison stage.
function normalizePunctuation(value: string): string {
  return normalizeName(value)
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Convert a final Roman numeral or "Std I" to an Arabic number.
function normalizeRomanNumeral(value: string): string {
  const romanMap: Record<string, string> = {
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

  return normalizeName(value).replace(
    /\b(std\.?\s+)?(i{1,3}|iv|v|vi{0,3}|ix|x)$/i,
    (_match, prefix: string | undefined, roman: string) =>
      `${prefix ? "std " : ""}${romanMap[roman.toLowerCase()]}`,
  );
}

function normalizeForTypo(value: string): string {
  return normalizeRomanNumeral(value)
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshteinDistance(a: string, b: string): number {
  const previous = Array.from(
    { length: b.length + 1 },
    (_, index) => index,
  );

  for (let i = 1; i <= a.length; i++) {
    let diagonal = previous[0];
    previous[0] = i;

    for (let j = 1; j <= b.length; j++) {
      const above = previous[j];
      previous[j] =
        a[i - 1] === b[j - 1]
          ? diagonal
          : 1 + Math.min(previous[j], previous[j - 1], diagonal);
      diagonal = above;
    }
  }

  return previous[b.length];
}

function noMatch(partialMatches: PartialMatchCandidate[] = []): ItemMatchResult {
  return {
    matched: false,
    itemId: null,
    confidence: partialMatches.length > 0 ? partialMatches[0].confidence : 0,
    catalogItem: null,
    partialMatches,
  };
}

function uniqueResult(
  candidates: MatchCandidate[],
  partialMatches: PartialMatchCandidate[] = []
): ItemMatchResult {
  // Multiple distinct catalog records are ambiguous.
  const uniqueItems = new Map<string, MatchCandidate>();

  for (const candidate of candidates) {
    uniqueItems.set(candidate.item.id, candidate);
  }

  if (uniqueItems.size !== 1) {
    return noMatch(partialMatches);
  }

  const candidate = [...uniqueItems.values()][0];

  // The matched item is the exact/chosen match, so it must not be listed as a partial match.
  // Filter out any partial matches that correspond to the matched item.
  const filteredPartialMatches = partialMatches.filter(
    (p) =>
      p.id !== candidate.item.id &&
      normalizeName(p.name) !== normalizeName(candidate.item.name || "")
  );

  return {
    matched: true,
    itemId: candidate.item.id,
    confidence: candidate.confidence,
    catalogItem: candidate.item,
    partialMatches: filteredPartialMatches,
  };
}

const SUBJECT_GROUPS: string[][] = [
  ["maths", "mathematics", "ganit", "math", "गणित", "अंकगणित"],
  ["science", "vigyan", "sci", "विज्ञान"],
  ["sst", "social", "history", "geography", "civics", "itihas", "bhugol", "इतिहास", "भूगोल", "नागरिकशास्त्र"],
  ["english", "eng", "इंग्रजी", "इंग्लिश"],
  ["hindi", "हिंदी", "हिन्दी"],
  ["sanskrit", "संस्कृत"],
  ["marathi", "मराठी"],
  ["gk", "general", "सामान्य"],
  ["computer", "computers", "it", "संगणक"],
  ["drawing", "art", "chitrakala", "चित्रकला", "कला"],
];

function getSubject(tokens: string[]): string | null {
  for (const group of SUBJECT_GROUPS) {
    for (const t of tokens) {
      if (group.includes(t)) return group[0];
    }
  }
  return null;
}

export function extractLevel(str: string): string {
  // 1. Numeric class (e.g. Class 1-12, Std 6, 6th, Grade 6)
  const numMatch = str.match(/\b(?:class|std|grade|level|part)?\s*(\d+)(?:st|nd|rd|th)?\b/i);
  if (numMatch) return numMatch[1].toLowerCase();

  // 2. Pre-primary keywords (Nursery, LKG, UKG, KG)
  const preMatch = str.match(/\b(nur(?:sery)?|lkg|ukg|kg)\b/i);
  if (preMatch) return preMatch[1].toLowerCase();

  // 3. Roman numerals (I - XII)
  const romanMatch = str.match(/\b(i{1,3}|iv|v|vi{0,3}|ix|x|xi|xii)\b/i);
  if (romanMatch) return romanMatch[1].toLowerCase();

  // 4. Letter levels: Level A, Part B, or standalone A/B/C/D at end or before publisher delimiter
  const letterMatch =
    str.match(/\b(?:level|part|grade)?\s*([a-d])\b(?:\s*[-–—]|\s*$|\s+(?:pikaso|ncert|new star|\w+))/i) ||
    str.match(/\s+([a-d])\s*$/i);
  if (letterMatch) return letterMatch[1].toLowerCase();

  return "";
}

export function normalizeTitleStems(str: string): string {
  return str
    .toLowerCase()
    .replace(/\bmixed\b/gi, "mix")
    .replace(/\brhymes\b/gi, "rhyme")
    .replace(/\bmathematics\b/gi, "maths")
    .replace(/\bdrawings?\b/gi, "art");
}

export function extractPublisherAndBase(title: string): { baseTitle: string; publisher: string } {
  const hyphenMatch = title.match(/^(.*?)\s*[-–—]\s*([a-zA-Z0-9\s&]+)$/);
  if (hyphenMatch) {
    const p1 = hyphenMatch[1].trim();
    const p2 = hyphenMatch[2].trim();
    if (p2.split(/\s+/).length <= 3) {
      return { baseTitle: p1, publisher: p2 };
    }
  }
  const parenMatch = title.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (parenMatch) {
    return { baseTitle: parenMatch[1].trim(), publisher: parenMatch[2].trim() };
  }
  const knownPublishers = [
    "pikaso",
    "olive",
    "olive kids",
    "pupil",
    "new star",
    "ncert",
    "av ncert",
    "amigos",
    "navneet",
    "madhubun",
    "cbse",
    "wtw",
    "w.t.w.",
    "w.t.w",
    "iop",
    "i.o.p.",
    "i.o.p",
    "scholastic",
    "oxford",
    "cambridge",
    "macmillan",
    "s.chand",
    "vikas",
    "frank",
    "pearson",
  ];
  const lower = title.toLowerCase();
  for (const pub of knownPublishers) {
    if (lower.startsWith(pub + " ") || lower.startsWith(pub + ".") || lower.startsWith(pub + "-")) {
      const rest = title.slice(pub.length).replace(/^[\s.:-]+/, "").trim();
      return { baseTitle: rest, publisher: title.slice(0, pub.length).trim() };
    }
  }
  return { baseTitle: title, publisher: "" };
}

function extractBookComponents(str: string) {
  const canon = canonicalizeDevanagari(str);
  const { baseTitle, publisher } = extractPublisherAndBase(canon);
  const clean = canon.toLowerCase().replace(/[\-_/.,()]/g, " ").trim();
  const tokens = clean.split(/\s+/).filter(Boolean);
  const digits = extractLevel(str) || extractLevel(canon);
  const subject = getSubject(tokens);
  const stopWords = new Set([
    "ncert",
    "ws",
    "workbook",
    "textbook",
    "book",
    "part",
    "vol",
    "level",
    "class",
    "std",
    "grade",
  ]);
  const isLevelToken = (t: string) =>
    t === digits ||
    (Boolean(digits) &&
      /^\d+$/.test(digits) &&
      new RegExp(`^${digits}(st|nd|rd|th)?$`, "i").test(t));

  const pubTokens = new Set(
    publisher ? publisher.toLowerCase().split(/\s+/).filter(Boolean) : []
  );

  const coreTokens = tokens.filter(
    (t) => !stopWords.has(t) && !isLevelToken(t) && !pubTokens.has(t)
  );
  return { clean, canon, tokens, digits, subject, coreTokens, baseTitle, publisher };
}

export function calculatePartialMatches(
  input: string,
  namedItems: CatalogItem[]
): PartialMatchCandidate[] {
  const cleanedInput = cleanItemDescription(input);
  const q = (cleanedInput || input || "").trim();
  if (!q) return [];
  const qComp = extractBookComponents(q);
  const qCanonBase = normalizeTitleStems(
    normalizePunctuation(canonicalizeDevanagari(qComp.baseTitle))
  );

  const scored: PartialMatchCandidate[] = [];

  for (const item of namedItems) {
    if (!item.name) continue;
    const itComp = extractBookComponents(item.name);
    const itCanonBase = normalizeTitleStems(
      normalizePunctuation(canonicalizeDevanagari(itComp.baseTitle))
    );

    // Exact Match of the full canonical string is handled separately, not as a partial/alternative
    if (qComp.canon === itComp.canon) {
      continue;
    }

    // 1. Base Title Exact Match (e.g. "Olive mix Rhymes A" <=> "Pikaso Mix Rhymes A", "हिंदी अक्षर ज्ञान A" <=> "Hindi Akshar Gyan A - Pikaso")
    if (qCanonBase && itCanonBase && qCanonBase === itCanonBase) {
      const pub = itComp.publisher || "Alternative";
      const pubName = pub.charAt(0).toUpperCase() + pub.slice(1);
      scored.push({
        id: item.id,
        name: item.name,
        code: item.code,
        price: item.price,
        unit: item.unit,
        confidence: 94,
        reason: itComp.publisher ? `Publisher Variant (${pubName})` : "Alternative Edition",
      });
      continue;
    }

    // Class / Digit Mismatch: strictly prohibit matching different classes
    if (qComp.digits && itComp.digits && qComp.digits !== itComp.digits) {
      continue;
    }

    // Subject Mismatch: strictly prohibit matching different subjects (e.g. Maths vs Science vs SST)
    if (qComp.subject && itComp.subject && qComp.subject !== itComp.subject) {
      continue;
    }

    // Both have subject and class matching (e.g. Science 6 across different publishers)
    if (
      qComp.digits &&
      itComp.digits &&
      qComp.digits === itComp.digits &&
      qComp.subject &&
      itComp.subject &&
      qComp.subject === itComp.subject
    ) {
      const pub =
        itComp.tokens.find((t) => !qComp.tokens.includes(t)) || "Alternative";
      const pubName = pub.charAt(0).toUpperCase() + pub.slice(1);
      scored.push({
        id: item.id,
        name: item.name,
        code: item.code,
        price: item.price,
        unit: item.unit,
        confidence: 90,
        reason: `Publisher Variant (${pubName})`,
      });
      continue;
    }

    // Core token overlap (e.g. non-generic title tokens like "Hindi Akshar Gyan" across editions)
    if (qComp.coreTokens.length > 0 && itComp.coreTokens.length > 0) {
      const sharedCore = qComp.coreTokens.filter((t) =>
        itComp.coreTokens.includes(t)
      );
      const overlapRatio = sharedCore.length / qComp.coreTokens.length;
      if (
        overlapRatio >= 0.50 &&
        (!qComp.digits || qComp.digits === itComp.digits) &&
        (!qComp.subject || qComp.subject === itComp.subject)
      ) {
        const pub =
          itComp.publisher ||
          itComp.tokens.find((t) => !qComp.tokens.includes(t)) ||
          "";
        const pubName = pub ? pub.charAt(0).toUpperCase() + pub.slice(1) : "";
        scored.push({
          id: item.id,
          name: item.name,
          code: item.code,
          price: item.price,
          unit: item.unit,
          confidence: Math.round(75 + overlapRatio * 15),
          reason: pubName ? `Publisher Variant (${pubName})` : "Alternative Edition",
        });
      }
    }
  }

  // Sort descending by confidence, tie-break alphabetically by name, and deduplicate
  const seen = new Set<string>();
  const results: PartialMatchCandidate[] = [];
  for (const s of scored.sort(
    (a, b) => b.confidence - a.confidence || a.name.localeCompare(b.name)
  )) {
    // Only return candidates with confidence >= 90% (strictly no 85% or below 90%)
    if (s.confidence < 90) continue;
    if (!seen.has(s.id)) {
      seen.add(s.id);
      results.push(s);
    }
  }
  return results.slice(0, 15);
}



export async function matchItemInDatabase(
  itemName?: string | null,
  skuOrCode?: string | null,
  itemId?: string | null,
): Promise<ItemMatchResult> {
  const cleanedName = cleanItemDescription(itemName);
  const input = (cleanedName || itemName || "").trim();
  const rawSku = (skuOrCode ?? "").trim();

  if (!input && !rawSku && !itemId) return noMatch();

  const supabase = createAdminClient();

  // 0. Direct lookup by ID if provided
  if (itemId && itemId.trim()) {
    const { data: byId } = await supabase
      .from("items")
      .select(SELECT_FIELDS)
      .eq("id", itemId.trim())
      .eq("is_deleted", false)
      .maybeSingle();

    if (byId) {
      let isCompatible = true;
      if (input && byId.name) {
        const normInput = normalizeName(input);
        const normById = normalizeName(byId.name);
        if (normInput !== normById) {
          const inputDig = extractLevel(input);
          const byIdDig = extractLevel(byId.name);
          const digitsMismatch = Boolean(inputDig && byIdDig && inputDig !== byIdDig);

          const inputTokens = extractBookComponents(input).tokens;
          const byIdTokens = extractBookComponents(byId.name).tokens;
          const inputSub = getSubject(inputTokens);
          const byIdSub = getSubject(byIdTokens);
          const subjectMismatch = Boolean(inputSub && byIdSub && inputSub !== byIdSub);

          const inWords = new Set(normInput.split(/\s+/).filter((w) => w.length > 1));
          const byWords = new Set(normById.split(/\s+/).filter((w) => w.length > 1));
          let sharedWords = 0;
          for (const w of inWords) {
            if (byWords.has(w)) sharedWords++;
          }

          if (digitsMismatch || subjectMismatch || (sharedWords === 0 && inWords.size > 0)) {
            isCompatible = false;
            console.warn(
              `[matchItemInDatabase] Stale/incompatible itemId ${itemId} ("${byId.name}") rejected for input "${input}"`
            );
          }
        }
      }

      if (isCompatible) {
        let altMatches: PartialMatchCandidate[] = [];
        const queryName = input || byId.name;
        if (queryName) {
          const { data: allItems } = await supabase
            .from("items")
            .select(SELECT_FIELDS)
            .eq("is_deleted", false);
          if (allItems) {
            const named = (allItems as unknown as CatalogItem[]).filter(
              (it) => typeof it.name === "string" && it.name.trim() !== ""
            );
            altMatches = calculatePartialMatches(queryName, named).filter(
              (p) =>
                p.id !== byId.id &&
                normalizeName(p.name) !== normalizeName(byId.name || "")
            );
          }
        }

        return {
          matched: true,
          itemId: byId.id,
          confidence: 100,
          catalogItem: byId as unknown as CatalogItem,
          partialMatches: altMatches,
        };
      }
    }
  }

  // 0b. Exact match by SKU / Code / Barcode if provided
  if (rawSku) {
    const { data: byCode } = await supabase
      .from("items")
      .select(SELECT_FIELDS)
      .or(`code.eq."${rawSku}",barcode.eq."${rawSku}"`)
      .eq("is_deleted", false)
      .limit(1);

    if (byCode && byCode.length > 0) {
      const matched = byCode[0] as unknown as CatalogItem;
      let altMatches: PartialMatchCandidate[] = [];
      const queryName = input || matched.name;
      if (queryName) {
        const { data: allItems } = await supabase
          .from("items")
          .select(SELECT_FIELDS)
          .eq("is_deleted", false);
        if (allItems) {
          const named = (allItems as unknown as CatalogItem[]).filter(
            (it) => typeof it.name === "string" && it.name.trim() !== ""
          );
          altMatches = calculatePartialMatches(queryName, named).filter(
            (p) =>
              p.id !== matched.id &&
              normalizeName(p.name) !== normalizeName(matched.name || "")
          );
        }
      }

      return {
        matched: true,
        itemId: matched.id,
        confidence: 100,
        catalogItem: matched,
        partialMatches: altMatches,
      };
    }
  }

  if (!input) return noMatch();

  const { data, error } = await supabase
    .from("items")
    .select(SELECT_FIELDS)
    .eq("is_deleted", false);

  if (error) {
    throw new Error("Failed to retrieve catalog items");
  }

  const items = (data ?? []) as unknown as CatalogItem[];
  const namedItems = items.filter(
    (item) => typeof item.name === "string" && item.name.trim() !== "",
  );

  // Compute fuzzy and partial match candidates for alternative publisher options
  const partialMatches = calculatePartialMatches(input, namedItems);

  // 1. Exact name match: case-insensitive, whitespace-normalized.
  const exact = namedItems.filter(
    (item) => normalizeName(item.name!) === normalizeName(input),
  );

  if (exact.length > 0) {
    return uniqueResult(exact.map((item) => ({ item, confidence: 100 })), partialMatches);
  }

  // 2. Devanagari (Hindi/Marathi) <-> English transliteration & phonetic match
  // E.g. "हिंदी अक्षर ज्ञान - A" <==> "hindi akshar dyan - A"
  const canonicalInput = canonicalizeDevanagari(input);
  const devanagariMatches = namedItems.filter(
    (item) => canonicalizeDevanagari(item.name!) === canonicalInput,
  );

  if (devanagariMatches.length > 0) {
    return uniqueResult(
      devanagariMatches.map((item) => ({ item, confidence: 98 })),
      partialMatches,
    );
  }

  // 2b. Devanagari with punctuation normalized
  const canonicalInputPunct = normalizePunctuation(canonicalInput);
  const devanagariPunctMatches = namedItems.filter(
    (item) =>
      normalizePunctuation(canonicalizeDevanagari(item.name!)) ===
      canonicalInputPunct,
  );

  if (devanagariPunctMatches.length > 0) {
    return uniqueResult(
      devanagariPunctMatches.map((item) => ({ item, confidence: 96 })),
      partialMatches,
    );
  }

  // 2c. Base Title Match (where catalog item has publisher brand suffix/prefix e.g. "Hindi Akshar Gyan A - Pikaso" <=> "हिंदी अक्षर ज्ञान A")
  const inputExtracted = extractPublisherAndBase(input);
  const inputBaseCanon = normalizeTitleStems(
    normalizePunctuation(canonicalizeDevanagari(inputExtracted.baseTitle))
  );
  if (inputBaseCanon) {
    const qPub = inputExtracted.publisher.toLowerCase().trim();
    const baseTitleMatches = namedItems.filter((item) => {
      const itExtracted = extractPublisherAndBase(item.name!);
      const itPub = itExtracted.publisher.toLowerCase().trim();
      // If both the input and the catalog item explicitly have different publisher brands (e.g. "Olive" vs "Pikaso"),
      // do NOT force primary match! The order item stays "Olive mix Rhymes A" as written on chit,
      // and "Pikaso Mix Rhymes A" is provided in Related Items (partialMatches) for the user to select.
      if (qPub && itPub && qPub !== itPub) {
        return false;
      }
      const itBaseCanon = normalizeTitleStems(
        normalizePunctuation(canonicalizeDevanagari(itExtracted.baseTitle))
      );
      return itBaseCanon === inputBaseCanon;
    });

    if (baseTitleMatches.length === 1) {
      return uniqueResult(
        baseTitleMatches.map((item) => ({ item, confidence: 94 })),
        partialMatches,
      );
    }
  }

  // 3. Punctuation variations, e.g. W.T.W. vs WTW.
  const punctuationKey = normalizePunctuation(input);
  const punctuation = namedItems.filter(
    (item) => normalizePunctuation(item.name!) === punctuationKey,
  );

  if (punctuation.length > 0) {
    return uniqueResult(
      punctuation.map((item) => ({ item, confidence: 98 })),
      partialMatches,
    );
  }

  // 4. Roman numeral variations, e.g. Title I vs Title 1.
  const romanKey = normalizeRomanNumeral(canonicalInput);
  const roman = namedItems.filter(
    (item) =>
      normalizeRomanNumeral(canonicalizeDevanagari(item.name!)) === romanKey,
  );

  if (roman.length > 0) {
    return uniqueResult(
      roman.map((item) => ({ item, confidence: 95 })),
      partialMatches,
    );
  }

  // 5. Minor typo tolerance & abbreviation matching (e.g. "Wrkshet 7" <=> "Worksheets 7").
  // All digits must match exactly to protect class/edition numbers.
  const typoKey = normalizeForTypo(canonicalInput);
  const inputDigits = typoKey.replace(/\D/g, "");
  const inputConsonants = typoKey.replace(/[aeiou\s\d]/g, "");

  const typoCandidates: MatchCandidate[] = [];

  for (const item of namedItems) {
    const catalogKey = normalizeForTypo(canonicalizeDevanagari(item.name!));
    const catalogDigits = catalogKey.replace(/\D/g, "");

    if (inputDigits !== catalogDigits) continue;

    const catalogConsonants = catalogKey.replace(/[aeiou\s\d]/g, "");
    const distance = levenshteinDistance(typoKey, catalogKey);
    const maxLen = Math.max(typoKey.length, catalogKey.length);
    const similarity = maxLen > 0 ? 1 - distance / maxLen : 0;

    // Check consonant skeleton match (e.g. wrksht 7 <=> wrkshts 7 / worksheets 7)
    const isConsonantMatch =
      inputConsonants.length >= 3 &&
      catalogConsonants.length >= 3 &&
      (inputConsonants === catalogConsonants ||
        catalogConsonants.startsWith(inputConsonants) ||
        inputConsonants.startsWith(catalogConsonants));

    const allowedDistance = typoKey.length >= 10 ? 2 : 1;

    if (isConsonantMatch && distance <= 3) {
      typoCandidates.push({ item, confidence: 94 });
    } else if (distance > 0 && distance <= allowedDistance) {
      typoCandidates.push({ item, confidence: 94 });
    } else if (distance > 0 && distance <= 3 && similarity >= 0.70) {
      typoCandidates.push({ item, confidence: 92 });
    }
  }

  if (typoCandidates.length > 0) {
    return uniqueResult(typoCandidates, partialMatches);
  }

  // No safe exact match found, but return partial matches / alternatives
  return noMatch(partialMatches);
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const itemName =
      url.searchParams.get("name") ||
      url.searchParams.get("description") ||
      url.searchParams.get("query") ||
      url.searchParams.get("search");
    const sku =
      url.searchParams.get("sku") || url.searchParams.get("code");
    const itemId =
      url.searchParams.get("itemId") || url.searchParams.get("id");

    if (!itemName?.trim() && !sku?.trim() && !itemId?.trim()) {
      return NextResponse.json(
        { error: "Provide an item name, sku, or itemId parameter." },
        { status: 400 },
      );
    }

    const match = await matchItemInDatabase(itemName, sku, itemId);
    return NextResponse.json({
      api: "match items",
      ...match,
    });
  } catch (error) {
    console.error("[api/match/items] Matching failed:", error);

    return NextResponse.json(
      { api: "match items", error: "Failed to match item", ...noMatch() },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Batch matching.
    if (Array.isArray(body?.items)) {
      const results = await Promise.all(
        body.items.map(async (rawItem: unknown) => {
          const item =
            rawItem && typeof rawItem === "object"
              ? (rawItem as Record<string, unknown>)
              : {};

          const itemName =
            typeof item.itemName === "string"
              ? item.itemName
              : typeof item.name === "string"
                ? item.name
                : typeof item.description === "string"
                  ? item.description
                  : "";

          const sku =
            typeof item.sku === "string"
              ? item.sku
              : typeof item.code === "string"
                ? item.code
                : "";

          const itemId =
            typeof item.matchedItemId === "string"
              ? item.matchedItemId
              : typeof item.itemId === "string"
                ? item.itemId
                : null;

          try {
            const matchResult = await matchItemInDatabase(itemName, sku, itemId);
            return {
              tempId: item.tempId ?? null,
              inputName: itemName,
              inputSku: sku,
              ...matchResult,
            };
          } catch {
            return {
              tempId: item.tempId ?? null,
              inputName: itemName,
              inputSku: sku,
              ...noMatch(),
              error: "Failed to match this item",
            };
          }
        }),
      );

      // If an importId is provided, also synchronize pre-matched items directly in order_imports record
      if (body?.importId) {
        try {
          const supabase = createAdminClient();
          const { data: imp } = await supabase
            .from("order_imports")
            .select("extracted_data")
            .eq("id", body.importId)
            .maybeSingle();

          if (imp?.extracted_data) {
            const currentExtracted = imp.extracted_data as any;
            if (Array.isArray(currentExtracted.items)) {
              currentExtracted.items = currentExtracted.items.map(
                (line: any, idx: number) => {
                  const match =
                    results[idx] ||
                    results.find(
                      (r: any) => r.tempId && r.tempId === line.tempId,
                    );
                  if (match?.matched) {
                    return {
                      ...line,
                      matchedItemId: match.itemId,
                      matchedItemCode: match.catalogItem?.code || line.sku,
                      matchedItemName:
                        match.catalogItem?.name || line.description,
                      catalogPrice:
                        match.catalogItem?.price ?? line.catalogPrice,
                      confidence: match.confidence,
                      matched: true,
                    };
                  }
                  return line;
                },
              );

              await supabase
                .from("order_imports")
                .update({ extracted_data: currentExtracted })
                .eq("id", body.importId);
            }
          }
        } catch (dbErr) {
          console.warn("[api/match/items] Failed to sync order_imports:", dbErr);
        }
      }

      return NextResponse.json({
        api: "match items",
        items: results,
        matchedCount: results.filter((item) => item.matched).length,
        unmatchedCount: results.filter((item) => !item.matched).length,
      });
    }

    // Single-item matching.
    const itemName =
      typeof body?.itemName === "string"
        ? body.itemName
        : typeof body?.name === "string"
          ? body.name
          : typeof body?.description === "string"
            ? body.description
            : "";

    const sku =
      typeof body?.sku === "string"
        ? body.sku
        : typeof body?.code === "string"
          ? body.code
          : "";

    if (!itemName.trim() && !sku.trim()) {
      return NextResponse.json(
        {
          api: "match items",
          error: "Provide 'itemName' or 'sku' in the request body.",
          ...noMatch(),
        },
        { status: 400 },
      );
    }

    const singleResult = await matchItemInDatabase(itemName, sku);
    return NextResponse.json({
      api: "match items",
      ...singleResult,
    });
  } catch (error) {
    console.error("[api/match/items] Matching failed:", error);

    return NextResponse.json(
      { error: "Failed to process item matching", ...noMatch() },
      { status: 500 },
    );
  }
}

"use client";

import React, { useState } from "react";
import { Link, useRouter } from "@/lib/router";
import type { DraftOrder, DraftLineItem } from "@/types/order";
import { formatINR } from "@/lib/utils";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  User,
  FileText,
  Calendar,
  Package,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Truck,
  Building2,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Columns2,
  FileImage,
  PackagePlus,
  Mail,
  UploadCloud,
  Sparkles,
  Ban,
  Save,
  Check,
  ShieldCheck,
  CreditCard,
  ChevronDown,
  Loader2,
  AlertTriangle,
  ArrowRight,
  Search,
  X,
  Unlink,
} from "lucide-react";
import { DocumentViewer } from "./DocumentViewer";
import { EmailSourceViewer } from "./EmailSourceViewer";
import { MissingItemsModal, MissingItemToInsert } from "./MissingItemsModal";
import { ConfirmDialog } from "./ConfirmDialog";
import { OrderConfirmedModal } from "./OrderConfirmedModal";
import { RejectConfirmModal } from "./RejectConfirmModal";

const extractDigits = (str: string): string => {
  const m = str.match(/\b(?:class|std|grade|level|part)?\s*(\d+)(?:st|nd|rd|th)?\b/i);
  if (m) return m[1];
  const r = str.match(/\b(i{1,3}|iv|v|vi{0,3}|ix|x)\b/i);
  if (r) {
    const map: Record<string, string> = {
      i: "1", ii: "2", iii: "3", iv: "4", v: "5",
      vi: "6", vii: "7", viii: "8", ix: "9", x: "10",
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

const isSameSeriesDifferentGrade = (titleA: string, titleB: string): boolean => {
  const baseA = normalizeSeriesBase(titleA);
  const baseB = normalizeSeriesBase(titleB);
  if (!baseA || !baseB) return false;
  const digitsA = extractDigits(titleA);
  const digitsB = extractDigits(titleB);
  return baseA === baseB && Boolean(digitsA && digitsB && digitsA !== digitsB);
};

const normalizeName = (value: string): string => {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/\s+/g, " ")
    .trim();
};

const levenshteinDistance = (a: string, b: string): number => {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
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
};

const SUBJECT_KEYWORDS: Array<{ key: string; synonyms: string[] }> = [
  { key: "gk", synonyms: ["gk", "g.k", "general", "सामान्य", "knowledge"] },
  { key: "english", synonyms: ["english", "eng", "grammar", "cursive", "rhyme", "rhymes"] },
  { key: "hindi", synonyms: ["hindi", "हिंदी", "हिन्दी", "balpothi", "sulekh"] },
  { key: "maths", synonyms: ["maths", "math", "mathematics", "ganit", "गणित", "tables"] },
  { key: "science", synonyms: ["science", "sci", "vigyan", "विज्ञान"] },
  { key: "evs", synonyms: ["evs", "environment", "environmental"] },
  { key: "sst", synonyms: ["sst", "social", "history", "geography"] },
  { key: "computer", synonyms: ["computer", "computers", "it"] },
  { key: "drawing", synonyms: ["drawing", "art", "chitrakala"] },
];

const getSubjectFromTitle = (str: string): string | null => {
  if (!str) return null;
  const dotClean = str.toLowerCase().replace(/\./g, "");
  const clean = dotClean.replace(/[^a-z0-9\s]/g, " ");
  const tokens = clean.split(/\s+/).filter(Boolean);
  for (const s of SUBJECT_KEYWORDS) {
    if (tokens.some((t) => s.synonyms.includes(t) || s.synonyms.some((syn) => syn.replace(/\./g, "") === t))) {
      return s.key;
    }
  }
  return null;
};

function normalizeTokens(str: string): string[] {
  return str
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => {
      if (t.length > 4 && t.endsWith("s") && !t.endsWith("ss")) return t.slice(0, -1);
      return t;
    });
}

function findSpellingSuggestions(
  query: string,
  catalog: Array<{ id: string; name: string; code?: string | null; price?: number | null; unit?: string | null }>,
  excludeIds?: Set<string>
): Array<{ item: { id: string; name: string; code?: string | null; price?: number | null; unit?: string | null }; score: number }> {
  if (!query || query.trim().length < 2) return [];

  const qClean = query.toLowerCase().replace(/\./g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  const qDigits = extractDigits(query);
  const qSubject = getSubjectFromTitle(query);
  const qTokens = normalizeTokens(query);
  const qTokensSorted = [...qTokens].sort().join(" ");
  const qNonDigit = qClean.replace(/\d+/g, "").replace(/\s+/g, " ").trim();
  const qConsonants = qClean.replace(/[aeiou\s\d]/g, "");

  const scored: Array<{ item: typeof catalog[0]; score: number; distance: number }> = [];

  for (const item of catalog) {
    if (!item.name) continue;
    if (excludeIds && excludeIds.has(item.id)) continue;

    const itClean = item.name.toLowerCase().replace(/\./g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
    if (itClean === qClean) continue;

    // 1. Grade mismatch guard:
    const itDigits = extractDigits(item.name);
    if (qDigits && itDigits && qDigits !== itDigits) continue;

    // 2. Subject mismatch guard: E.g., GK vs EVS must NEVER match
    const itSubject = getSubjectFromTitle(item.name);
    if (qSubject && itSubject && qSubject !== itSubject) continue;

    // 2b. Base Title Match / Substring Match (e.g. query is "New Star Sci 6" and catalog has "Sci 6", or vice versa)
    const itTokens = normalizeTokens(item.name);
    const allItInQ = itTokens.length > 0 && itTokens.every((t) => qTokens.includes(t));
    const allQInIt = qTokens.length > 0 && qTokens.every((t) => itTokens.includes(t));
    if ((allItInQ || allQInIt) && (!qDigits || qDigits === itDigits) && (!qSubject || qSubject === itSubject)) {
      scored.push({ item, score: 94, distance: 0 });
      continue;
    }

    const qBaseTitle = normalizeSeriesBase(query);
    const itBaseTitle = normalizeSeriesBase(item.name);
    if (qBaseTitle && itBaseTitle && qBaseTitle === itBaseTitle && (!qDigits || qDigits === itDigits)) {
      scored.push({ item, score: 94, distance: 0 });
      continue;
    }

    // 3. Exact token re-ordering match (e.g. "6 worksheet" <=> "Worksheets 6")
    const itTokensSorted = [...itTokens].sort().join(" ");
    if (qTokensSorted === itTokensSorted && qTokens.length > 0) {
      scored.push({ item, score: 98, distance: 0 });
      continue;
    }

    const itNonDigit = itClean.replace(/\d+/g, "").replace(/\s+/g, " ").trim();
    const itConsonants = itClean.replace(/[aeiou\s\d]/g, "");

    // 4. Character overlap check on non-numeric letters (must share common letters)
    const qLetters = new Set(qNonDigit.replace(/\s+/g, ""));
    const itLetters = new Set(itNonDigit.replace(/\s+/g, ""));
    let commonLetters = 0;
    for (const char of qLetters) {
      if (itLetters.has(char)) commonLetters++;
    }
    const overlapRatio = qLetters.size > 0 ? commonLetters / qLetters.size : 0;
    // If letters share less than 50% overlap, do NOT fuzzy match (avoids completely distinct words like "gk" vs "evs")
    if (overlapRatio < 0.5 && qNonDigit.length >= 2) continue;

    const dist = levenshteinDistance(qNonDigit, itNonDigit);
    const maxLen = Math.max(qNonDigit.length, itNonDigit.length);
    const similarity = maxLen > 0 ? 1 - dist / maxLen : 0;

    // 5. If both have the same recognized subject and matching grade (e.g. "G.K. 2" <=> "WTW GK 2")
    if (qSubject && itSubject && qSubject === itSubject && qDigits && itDigits && qDigits === itDigits) {
      scored.push({ item, score: 92, distance: dist });
      continue;
    }

    // Word length guards for typos:
    // If word is short (<= 3 chars, e.g. "gk"), max distance allowed is 1, not 3!
    const maxAllowedDist = qNonDigit.length <= 3 ? 1 : qNonDigit.length <= 5 ? 2 : 3;

    // Consonant skeleton match (e.g. "wrksht 6" or "woorsht 6" <=> "worksheets 6")
    const cDist = levenshteinDistance(qConsonants, itConsonants);
    const cMax = Math.max(qConsonants.length, itConsonants.length);
    const cSim = cMax > 0 ? 1 - cDist / cMax : 0;

    let score = 0;
    if (
      qConsonants.length >= 3 &&
      itConsonants.length >= 3 &&
      (qConsonants === itConsonants ||
        itConsonants.includes(qConsonants) ||
        qConsonants.includes(itConsonants) ||
        (cDist <= 2 && cSim >= 0.70))
    ) {
      score = 90;
    } else if (dist <= maxAllowedDist && similarity >= 0.70) {
      score = Math.round(75 + similarity * 20);
    }

    if (score >= 70) {
      scored.push({ item, score, distance: dist });
    }
  }

  scored.sort((a, b) => b.score - a.score || a.distance - b.distance);
  return scored.slice(0, 2);
}

export function DraftOrderForm({ initialDraft }: { initialDraft: DraftOrder }) {
  const router = useRouter();
  const [draft, setDraft] = useState<DraftOrder>(initialDraft);

  // Sync state if initialDraft changes or reloads
  React.useEffect(() => {
    setDraft(initialDraft);
    if (initialDraft.imageUrl) {
      setSourceTab("image");
    }
  }, [initialDraft.importId, initialDraft.existingOrderNumber, initialDraft.isAlreadyConfirmed]);

  // Automatically fetch related items / additional options on page load / refresh
  React.useEffect(() => {
    if (!initialDraft?.lineItems || initialDraft.lineItems.length === 0) return;

    const fetchRelatedItemsOnLoad = async () => {
      try {
        const payload = {
          items: initialDraft.lineItems.map((it) => ({
            tempId: it.tempId,
            name: it.description || it.matchedItemName || "",
            sku: it.sku || "",
            itemId: it.matchedItemId || "",
          })),
        };

        const res = await fetch("/api/related-items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.items)) {
            setDraft((prev) => ({
              ...prev,
              lineItems: prev.lineItems.map((line) => {
                const itemRelated = data.items.find((d: any) => d.tempId === line.tempId);
                if (
                  itemRelated &&
                  Array.isArray(itemRelated.relatedItems) &&
                  itemRelated.relatedItems.length > 0
                ) {
                  return {
                    ...line,
                    partialMatches: itemRelated.relatedItems.filter(
                      (r: any) => (r.confidence ?? 100) >= 90
                    ),
                  };
                }
                return line;
              }),
            }));
          }
        }
      } catch (err) {
        console.warn("[DraftOrderForm] Auto-fetching related items on refresh warning:", err);
      }
    };

    fetchRelatedItemsOnLoad();
  }, [initialDraft.importId]);

  // View mode: default is split-screen (Screen 2 design)
  const [viewMode, setViewMode] = useState<"split" | "form" | "document">("split");

  // Source tab for left pane when both image and email body exist
  const [sourceTab, setSourceTab] = useState<"image" | "email">(
    initialDraft.imageUrl ? "image" : "email"
  );

  const [isSaving, setIsSaving] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [draftSavedNotice, setDraftSavedNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCheckingMatchingApi, setIsCheckingMatchingApi] = useState(false);
  const [isReExtracting, setIsReExtracting] = useState(false);
  const [matchApiStatusNotice, setMatchApiStatusNotice] = useState<string | null>(null);
  const [activeSuggestionsTempId, setActiveSuggestionsTempId] = useState<string | null>(null);
  const [fetchingAlternativesTempId, setFetchingAlternativesTempId] = useState<string | null>(null);
  const [catalogSearchQuery, setCatalogSearchQuery] = useState("");
  const [catalogItems, setCatalogItems] = useState<
    Array<{
      id: string;
      name: string;
      code?: string | null;
      price?: number | null;
      unit?: string | null;
    }>
  >([]);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(false);

  // Pre-load items catalog for interactive item picker
  React.useEffect(() => {
    let isMounted = true;
    const loadCatalog = async () => {
      setIsLoadingCatalog(true);
      try {
        const res = await fetch("/api/catalog");
        if (res.ok) {
          const data = await res.json();
          if (isMounted && Array.isArray(data.items)) {
            setCatalogItems(data.items);
          }
        }
      } catch (err) {
        console.warn("[DraftOrderForm] Failed to load catalog items:", err);
      } finally {
        if (isMounted) setIsLoadingCatalog(false);
      }
    };
    loadCatalog();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleToggleAlternatives = async (item: DraftLineItem) => {
    // If clicking the same item that's already open, toggle it off
    if (activeSuggestionsTempId === item.tempId) {
      setActiveSuggestionsTempId(null);
      setCatalogSearchQuery("");
      return;
    }

    // Open card immediately so user sees the modal
    setActiveSuggestionsTempId(item.tempId);
    setCatalogSearchQuery("");

    // If catalog hasn't finished loading yet, fetch now
    if (catalogItems.length === 0) {
      fetch("/api/catalog")
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data.items)) setCatalogItems(data.items);
        })
        .catch((err) => console.warn(err));
    }

    const query = (item.description || item.matchedItemName || "").trim();
    if (!query) return;

    // Trigger dedicated Related Items / Additional Options API
    setFetchingAlternativesTempId(item.tempId);
    try {
      const params = new URLSearchParams();
      params.set("name", query);
      if (item.matchedItemId) params.set("itemId", item.matchedItemId);
      if (item.sku && item.sku !== "NO SKU") params.set("sku", item.sku);

      const res = await fetch(`/api/related-items?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        const rawPartials = data.relatedItems || data.partialMatches || [];
        const partials = rawPartials.filter((r: any) => (r.confidence ?? 100) >= 90);
        setDraft((prev) => ({
          ...prev,
          lineItems: prev.lineItems.map((it) => {
            if (it.tempId !== item.tempId) return it;
            return {
              ...it,
              partialMatches: partials,
            };
          }),
        }));
      }
    } catch (err) {
      console.warn("Failed to fetch related items from API:", err);
    } finally {
      setFetchingAlternativesTempId(null);
    }
  };

  const handleUnlinkItem = (tempId: string) => {
    setDraft((prev) => {
      const newLineItems = prev.lineItems.map((it) => {
        if (it.tempId !== tempId) return it;
        return {
          ...it,
          sku: "",
          matchedItemId: undefined,
          matchedItemCode: undefined,
          matchedItemName: undefined,
          catalogPrice: undefined,
          matched: false,
          confidence: 0,
        };
      });
      return {
        ...prev,
        lineItems: newLineItems,
      };
    });
  };

  const handleSelectPartialMatch = (
    tempId: string,
    candidate: {
      id: string;
      name: string;
      code?: string | null;
      price?: number | null;
      confidence?: number;
    }
  ) => {
    setDraft((prev) => {
      const newLineItems = prev.lineItems.map((it) => {
        if (it.tempId !== tempId) return it;
        const newPrice =
          candidate.price !== undefined && candidate.price !== null && candidate.price > 0
            ? candidate.price
            : it.unit_price || 0;
        const qty = it.quantity || 0;

        // Preserve previous selected catalog item so it becomes available in alternatives list
        const prevAsCandidate = it.matchedItemId
          ? {
            id: it.matchedItemId,
            name: it.matchedItemName || it.description || "",
            code: it.matchedItemCode || it.sku || null,
            price: it.catalogPrice ?? it.unit_price ?? null,
            confidence: it.confidence || 100,
            reason: "Previous Selection",
          }
          : null;

        const filteredPartials = (it.partialMatches || []).filter((p) => p.id !== candidate.id);
        if (prevAsCandidate && !filteredPartials.some((p) => p.id === prevAsCandidate.id)) {
          filteredPartials.unshift(prevAsCandidate);
        }

        return {
          ...it,
          description: candidate.name,
          sku: candidate.code || it.sku || "",
          matchedItemId: candidate.id,
          matchedItemCode: candidate.code || undefined,
          matchedItemName: candidate.name,
          catalogPrice: candidate.price ?? undefined,
          unit_price: newPrice,
          line_total: qty > 0 && newPrice > 0 ? Number((qty * newPrice).toFixed(2)) : it.line_total,
          confidence: candidate.confidence || 100,
          matched: true,
          partialMatches: filteredPartials,
        };
      });

      const subtotal = newLineItems.reduce((acc, it) => acc + (it.line_total || 0), 0);
      const tax = prev.totals.tax || 0;
      const discount = prev.totals.discount || 0;
      const total = Number((subtotal + tax - discount).toFixed(2));

      return {
        ...prev,
        lineItems: newLineItems,
        totals: {
          ...prev.totals,
          subtotal: Number(subtotal.toFixed(2)),
          total,
        },
      };
    });
  };

  const handleTriggerMatchItemsApi = async () => {
    if (isCheckingMatchingApi || draft.lineItems.length === 0) return;
    setIsCheckingMatchingApi(true);
    setError(null);
    setMatchApiStatusNotice(null);
    try {
      const res = await fetch("/api/match/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          importId: draft.importId,
          items: draft.lineItems.map((it) => ({
            tempId: it.tempId,
            name: it.description,
            sku: it.sku,
          })),
        }),
      });

      if (!res.ok) {
        throw new Error("Match Items API request failed");
      }

      const matchData = await res.json();
      if (Array.isArray(matchData.items)) {
        setDraft((prev) => {
          const updatedLines = prev.lineItems.map((line) => {
            const match = matchData.items.find((m: any) => m.tempId === line.tempId);
            if (match) {
              const catalogPrice = match.catalogItem?.price ?? line.unit_price;
              const unitPrice = line.unit_price && line.unit_price > 0 ? line.unit_price : (catalogPrice || 0);
              const qty = line.quantity || 0;
              return {
                ...line,
                matchedItemId: match.matched ? match.itemId : null,
                matchedItemCode: match.matched ? (match.catalogItem?.code || line.sku || null) : null,
                matchedItemName: match.matched ? (match.catalogItem?.name || null) : null,
                unit_price: match.matched ? unitPrice : line.unit_price,
                line_total: match.matched && qty > 0 ? Number((qty * unitPrice).toFixed(2)) : line.line_total,
                confidence: match.matched ? match.confidence : 0,
                matched: match.matched,
              };
            }
            return line;
          });

          return {
            ...prev,
            lineItems: updatedLines,
          };
        });

        const matchedCount = matchData.matchedCount ?? matchData.items.filter((m: any) => m.matched).length;
        setMatchApiStatusNotice(
          `Checked via Match Items API (/api/match/items): ${matchedCount} of ${matchData.items.length} items matched in database.`
        );
        setTimeout(() => setMatchApiStatusNotice(null), 5000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsCheckingMatchingApi(false);
    }
  };

  // Saved Order Info to display created order number and save status modal
  const [savedOrderResult, setSavedOrderResult] = useState<{
    orderId: string;
    orderNumber: string;
    status: string;
    customerName: string;
    totalAmount: number;
    subtotal?: number;
    discount?: number;
    tax?: number;
    itemCount: number;
    totalUnits?: number;
    isUpdate: boolean;
  } | null>(null);

  // Pagination state
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(25);

  // Missing items insertion modal state
  const [missingItemsModal, setMissingItemsModal] = useState<{
    isOpen: boolean;
    items: MissingItemToInsert[];
    mode: "single" | "all_confirm";
  }>({
    isOpen: false,
    items: [],
    mode: "single",
  });

  const handlePromptSingleItem = (item: DraftLineItem) => {
    setMissingItemsModal({
      isOpen: true,
      items: [
        {
          tempId: item.tempId,
          name: item.description?.trim() || item.sku?.trim() || "New Item",
          code: item.sku?.trim() || "",
          price: itemUnitPrice(item),
          unit: "PCS",
          quantity: item.quantity ?? undefined,
        },
      ],
      mode: "single",
    });
  };

  const isUnlinkedLineItem = (it: DraftLineItem) => {
    if (!it.matchedItemId || !it.matched) return true;
    const isExact = catalogItems.some(
      (c) => c.name && normalizeName(c.name) === normalizeName(it.description || "")
    );
    if (isExact) return false;
    if (it.matchedItemName && normalizeName(it.matchedItemName) === normalizeName(it.description || "")) {
      return false;
    }
    return true;
  };

  const handlePromptAllUnlinked = () => {
    const unlinked = draft.lineItems.filter(
      (it) => isUnlinkedLineItem(it) && (it.description?.trim() || it.sku?.trim())
    );
    if (unlinked.length === 0) return;

    setMissingItemsModal({
      isOpen: true,
      items: unlinked.map((it) => ({
        tempId: it.tempId,
        name: it.description?.trim() || it.sku?.trim() || "Item",
        code: it.sku?.trim() || "",
        price: itemUnitPrice(it),
        unit: "PCS",
        quantity: it.quantity ?? undefined,
      })),
      mode: "single",
    });
  };

  const itemUnitPrice = (item: DraftLineItem) => {
    return item.unit_price || 0;
  };

  // 1. Confirm & Save Order flow
  const handleConfirmClick = () => {
    // COMPLIANCE: Ensure no line item has missing or non-positive quantity
    const missingQty = draft.lineItems.filter(
      (it) => it.quantity == null || it.quantity <= 0
    );
    if (missingQty.length > 0) {
      setError(
        "Every line item must have a valid quantity greater than 0. Missing quantities cannot be defaulted."
      );
      return;
    }

    // Check if there are any unlinked line items (items without matchedItemId or mismatching catalog)
    const unlinked = draft.lineItems.filter(
      (it) => isUnlinkedLineItem(it) && (it.description?.trim() || it.sku?.trim())
    );

    if (unlinked.length > 0) {
      setMissingItemsModal({
        isOpen: true,
        items: unlinked.map((it) => ({
          tempId: it.tempId,
          name: it.description?.trim() || it.sku?.trim() || "Item",
          code: it.sku?.trim() || "",
          price: itemUnitPrice(it),
          unit: "PCS",
          quantity: it.quantity ?? undefined,
        })),
        mode: "all_confirm",
      });
      return;
    }

    setIsConfirmModalOpen(true);
  };

  // 1b. Re-scan document with latest Gemini AI Vision
  const handleReExtractClick = async () => {
    if (!draft.importId || isReExtracting || isSaving || isSavingDraft) return;
    setIsReExtracting(true);
    setError(null);
    setDraftSavedNotice(null);
    try {
      const res = await fetch("/api/orders/re-extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ importId: draft.importId }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Failed to re-extract document");
      }
      if (data.draft) {
        setDraft(data.draft);
        setDraftSavedNotice(
          data.message || `Document re-analyzed! Extracted ${data.draft.lineItems.length} items with 100% verbatim accuracy.`
        );
        setTimeout(() => setDraftSavedNotice(null), 8000);
      }
    } catch (err: any) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsReExtracting(false);
    }
  };

  // 2. Save as Draft flow (preserves changes without confirming sales order)
  const handleSaveDraftClick = async () => {
    if (isSavingDraft || isSaving) return;
    setIsSavingDraft(true);
    setError(null);
    setDraftSavedNotice(null);
    try {
      const res = await fetch("/api/orders/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draft, status: "draft" }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to save draft order");
      }

      setDraftSavedNotice(
        "Order draft edits saved to database successfully. You can return to inspect or confirm at any time."
      );
      setTimeout(() => setDraftSavedNotice(null), 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSavingDraft(false);
    }
  };

  // 3. Reject Non-Order flow
  const handleRejectConfirm = async () => {
    if (isRejecting) return;
    setIsRejecting(true);
    setError(null);
    try {
      const res = await fetch("/api/orders/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          importId: draft.importId,
          reason: "rejected_by_operator",
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to reject order");
      }

      setIsRejectModalOpen(false);
      // Navigate back to orders or inbox
      router.push("/inbox");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsRejecting(false);
    }
  };

  const handleModalInserted = async (
    insertedItems: Array<{
      tempId: string;
      id: string;
      name: string;
      code: string | null;
      price: number | null;
      unit: string | null;
    }>
  ) => {
    const updatedLineItems = draft.lineItems.map((line) => {
      const match = insertedItems.find((ins) => ins.tempId === line.tempId);
      if (match) {
        return {
          ...line,
          description: match.name,
          matchedItemId: match.id,
          matchedItemCode: match.code || undefined,
          matchedItemName: match.name,
          unit_price: line.unit_price || match.price || 0,
          confidence: 100,
          matched: true,
        };
      }
      return line;
    });

    const updatedDraft: DraftOrder = {
      ...draft,
      lineItems: updatedLineItems,
    };

    setDraft(updatedDraft);
    setCatalogItems((prev) => {
      const existing = new Set(prev.map((p) => p.id));
      const newItems = insertedItems
        .filter((ins) => !existing.has(ins.id))
        .map((ins) => ({
          id: ins.id,
          name: ins.name,
          code: ins.code,
          price: ins.price,
          unit: ins.unit,
        }));
      return [...prev, ...newItems];
    });
    const wasConfirmMode = missingItemsModal.mode === "all_confirm";
    setMissingItemsModal({ isOpen: false, items: [], mode: "single" });

    if (wasConfirmMode) {
      setIsConfirmModalOpen(true);
    }
  };

  const executeSaveOrder = async (draftToSave: DraftOrder) => {
    if (isSaving) return;
    setIsSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/orders/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draftToSave, status: "confirmed" }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to confirm order");
      }

      const data = await res.json();
      const confirmedNumber =
        data.order?.order_number ||
        draftToSave.extracted.po_number ||
        draftToSave.existingOrderNumber ||
        "SO-CONFIRMED";

      setSavedOrderResult({
        orderId: data.order?.id || draftToSave.importId || "",
        orderNumber: confirmedNumber,
        status: "Confirmed & Saved to Database",
        customerName: draftToSave.extracted.customer?.name || "Customer",
        totalAmount: draftToSave.totals.total,
        subtotal: draftToSave.totals.subtotal,
        discount: draftToSave.totals.discount,
        tax: draftToSave.totals.tax,
        itemCount: draftToSave.lineItems.length,
        totalUnits: draftToSave.lineItems.reduce((acc, it) => acc + (it.quantity || 0), 0),
        isUpdate: !!draftToSave.isAlreadyConfirmed,
      });

      setDraft((prev) => ({
        ...prev,
        isAlreadyConfirmed: true,
        existingOrderNumber: confirmedNumber,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSaving(false);
    }
  };

  const handleApplySuggestion = (
    tempId: string,
    suggestion: {
      id: string;
      name: string;
      code?: string | null;
      price?: number | null;
    }
  ) => {
    setDraft((prev) => {
      const newLineItems = prev.lineItems.map((it) => {
        if (it.tempId !== tempId) return it;
        const newPrice =
          suggestion.price != null && suggestion.price > 0
            ? suggestion.price
            : it.unit_price || 0;
        const qty = it.quantity || 0;
        return {
          ...it,
          description: suggestion.name,
          sku: suggestion.code || it.sku || "",
          matchedItemId: suggestion.id,
          matchedItemCode: suggestion.code || undefined,
          matchedItemName: suggestion.name,
          catalogPrice: suggestion.price ?? undefined,
          unit_price: newPrice,
          line_total:
            qty > 0 && newPrice > 0
              ? Number((qty * newPrice).toFixed(2))
              : it.line_total,
          confidence: 100,
          matched: true,
        };
      });

      const subtotal = newLineItems.reduce(
        (acc, it) => acc + (it.line_total || 0),
        0
      );
      const tax = prev.totals.tax || 0;
      const discount = prev.totals.discount || 0;
      const total = Number((subtotal + tax - discount).toFixed(2));

      return {
        ...prev,
        lineItems: newLineItems,
        totals: {
          ...prev.totals,
          subtotal: Number(subtotal.toFixed(2)),
          total,
        },
      };
    });
  };

  const handleItemChange = (
    tempId: string,
    field: "quantity" | "unit_price" | "description" | "sku",
    val: string | number
  ) => {
    setDraft((prev) => {
      const newLineItems = prev.lineItems.map((it) => {
        if (it.tempId !== tempId) return it;
        const updated = { ...it, [field]: val, ...(field === "unit_price" ? { isPriceFromCatalog: false } : {}) };
        const q = field === "quantity" ? (val === "" ? null : Math.max(0, Number(val) || 0)) : it.quantity;
        const p =
          field === "unit_price"
            ? (val === "" ? null : Math.max(0, Number(val) || 0))
            : it.unit_price;
        updated.quantity = q;
        const numQ = q != null ? q : null;
        const numP = p != null ? p : null;
        updated.line_total = (numQ !== null && numP !== null) ? Number((numQ * numP).toFixed(2)) : null;

        // Auto-check exact match or invalidate obsolete link when user edits description
        if (field === "description") {
          const trimmedVal = String(val).trim();
          const exactMatch = catalogItems.find(
            (c) => c.name && normalizeName(c.name) === normalizeName(trimmedVal)
          );
          if (exactMatch) {
            updated.matchedItemId = exactMatch.id;
            updated.matchedItemName = exactMatch.name;
            updated.matchedItemCode = exactMatch.code || updated.sku;
            updated.unit_price = updated.unit_price || exactMatch.price || 0;
            updated.confidence = 100;
            updated.matched = true;
          } else {
            // Text does not match any catalog product: mark as unlinked new item
            updated.confidence = 0;
            updated.matched = false;
            updated.matchedItemId = null;
            updated.matchedItemName = null;
            updated.matchedItemCode = null;
          }
        }

        return updated;
      });

      const subtotal = newLineItems.reduce(
        (acc, it) => acc + (it.line_total || 0),
        0
      );
      const tax = prev.totals.tax || 0;
      const discount = prev.totals.discount || 0;
      const total = Number((subtotal + tax - discount).toFixed(2));

      return {
        ...prev,
        lineItems: newLineItems,
        totals: {
          ...prev.totals,
          subtotal: Number(subtotal.toFixed(2)),
          total,
        },
      };
    });

  };

  const handleDeleteItem = (tempId: string) => {
    setDraft((prev) => {
      const newLineItems = prev.lineItems.filter((it) => it.tempId !== tempId);
      const subtotal = newLineItems.reduce(
        (acc, it) => acc + (it.line_total || 0),
        0
      );
      const tax = prev.totals.tax || 0;
      const discount = prev.totals.discount || 0;
      const total = Number((subtotal + tax - discount).toFixed(2));

      return {
        ...prev,
        lineItems: newLineItems,
        totals: {
          ...prev.totals,
          subtotal: Number(subtotal.toFixed(2)),
          total,
        },
      };
    });

    if (itemsPerPage > 0) {
      const newTotalPages = Math.max(1, Math.ceil((draft.lineItems.length - 1) / itemsPerPage));
      if (currentPage > newTotalPages) {
        setCurrentPage(newTotalPages);
      }
    }
  };

  const handleAddLineItem = () => {
    const newItem: DraftLineItem = {
      tempId: crypto.randomUUID(),
      description: "",
      sku: "",
      // quantity: null as any,
      quantity: 1,  // <-- Defaults new manual rows to 1

      unit_price: 0,
      line_total: 0,
      confidence: 100,
    };
    setDraft((prev) => ({
      ...prev,
      lineItems: [...prev.lineItems, newItem],
    }));

    if (itemsPerPage > 0) {
      const newTotalPages = Math.ceil((draft.lineItems.length + 1) / itemsPerPage);
      setCurrentPage(newTotalPages);
    }
  };

  const handleCustomerChange = (val: string) => {
    setDraft((prev) => ({
      ...prev,
      extracted: {
        ...prev.extracted,
        customer: {
          ...prev.extracted.customer,
          name: val,
        },
      },
    }));
  };

  const handlePoChange = (val: string) => {
    setDraft((prev) => ({
      ...prev,
      extracted: {
        ...prev.extracted,
        po_number: val,
      },
    }));
  };

  const handleDateChange = (val: string) => {
    setDraft((prev) => ({
      ...prev,
      extracted: {
        ...prev.extracted,
        order_date: val,
      },
    }));
  };

  const handleDeliveryDateChange = (val: string) => {
    setDraft((prev) => ({
      ...prev,
      extracted: {
        ...prev.extracted,
        delivery_date: val,
      },
    }));
  };

  const handleDiscountChange = (val: string | number) => {
    const discountVal = val === "" ? 0 : Math.max(0, Number(val) || 0);
    setDraft((prev) => {
      const subtotal = prev.totals.subtotal || 0;
      const tax = prev.totals.tax || 0;
      const total = Number(Math.max(0, subtotal + tax - discountVal).toFixed(2));
      return {
        ...prev,
        totals: {
          ...prev.totals,
          discount: Number(discountVal.toFixed(2)),
          total,
        },
      };
    });
  };

  const handleTaxChange = (val: string | number) => {
    const taxVal = val === "" ? 0 : Math.max(0, Number(val) || 0);
    setDraft((prev) => {
      const subtotal = prev.totals.subtotal || 0;
      const discount = prev.totals.discount || 0;
      const total = Number(Math.max(0, subtotal + taxVal - discount).toFixed(2));
      return {
        ...prev,
        totals: {
          ...prev.totals,
          tax: Number(taxVal.toFixed(2)),
          total,
        },
      };
    });
  };

  const handleTaxPreset = (gstPercent: number) => {
    setDraft((prev) => {
      const subtotal = prev.totals.subtotal || 0;
      const discount = prev.totals.discount || 0;
      const taxable = Math.max(0, subtotal - discount);
      const taxVal = Number((taxable * (gstPercent / 100)).toFixed(2));
      const total = Number(Math.max(0, taxable + taxVal).toFixed(2));
      return {
        ...prev,
        totals: {
          ...prev.totals,
          tax: taxVal,
          total,
        },
      };
    });
  };

  const handleTermsChange = (val: string) => {
    setDraft((prev) => ({
      ...prev,
      extracted: {
        ...prev.extracted,
        terms: val,
      },
    }));
  };

  const handleAddressChange = (val: string) => {
    setDraft((prev) => ({
      ...prev,
      extracted: {
        ...prev.extracted,
        customer: {
          ...prev.extracted.customer,
          address: val,
        },
      },
    }));
  };

  const totalUnits = draft.lineItems.reduce((acc, it) => acc + (it.quantity || 0), 0);

  // Missing and uncertain information detection
  const missingQtyItems = draft.lineItems.filter(
    (it) => it.quantity == null || it.quantity <= 0
  );
  const uncertainItems = draft.lineItems.filter(
    (it) => it.confidence != null && it.confidence < 80
  );

  // Pagination calculations
  const totalItems = draft.lineItems.length;
  const pageSize = itemsPerPage === 0 ? totalItems : itemsPerPage;
  const totalPages = Math.max(1, Math.ceil(totalItems / (pageSize || 1)));
  const safePage = Math.min(Math.max(1, currentPage), totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);
  const visibleLineItems = draft.lineItems.slice(startIndex, endIndex);

  // PO Identifier & Status Labels
  const poReference =
    draft.existingOrderNumber ||
    draft.duplicateOrderNumber ||
    draft.extracted.po_number ||
    (draft.importId ? `PO-${draft.importId.slice(0, 8).toUpperCase()}` : "PO-DRAFT");

  const classification = (draft.extracted as any)?._classification || {};
  const confidencePercent = Math.round((classification.confidence || 0.98) * 100);

  return (
    <main className="min-h-screen bg-slate-50/60 dark:bg-slate-950 flex flex-col">
      {/* ========================================================
          SCREEN 2 TOP ACTION BAR (No generic sidebars or headers)
          Order ID, Status, Confidence, Reject, Save Draft, Approve
      ======================================================== */}
      <header className="sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 shadow-2xs px-4 sm:px-6 lg:px-8 py-3">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Left Block: Back Arrow, PO Badge, Status, Confidence */}
          <div className="flex flex-wrap items-center gap-2.5">
            <Link
              to="/orders"
              title="Return to Sales Orders"
              className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700/80 text-slate-700 dark:text-slate-200 text-xs font-semibold shadow-2xs transition-all cursor-pointer group shrink-0 active:scale-95"
            >
              <ArrowLeft className="size-3.5 text-slate-500 group-hover:text-slate-900 dark:text-slate-400 dark:group-hover:text-slate-100 transition-transform group-hover:-translate-x-0.5" />
              <span>Back to Orders</span>
            </Link>

            {/* Direct Breadcrumbs: Dashboard / Orders / Inbox */}
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
              <Link
                to="/"
                className="hover:text-foreground hover:underline transition-colors text-slate-600 dark:text-slate-400"
                title="Go to Dashboard"
              >
                Dashboard
              </Link>
              <span className="text-slate-300 dark:text-slate-600 select-none">/</span>
              <Link
                to="/orders"
                className="hover:text-foreground hover:underline transition-colors text-slate-600 dark:text-slate-400"
                title="Go to Orders"
              >
                Orders
              </Link>
              {draft.sourceType === "email" && (
                <>
                  <span className="text-slate-300 dark:text-slate-600 select-none">/</span>
                  <Link
                    to="/inbox"
                    className="hover:text-foreground hover:underline transition-colors text-slate-600 dark:text-slate-400"
                    title="Go to Inbox"
                  >
                    Inbox
                  </Link>
                </>
              )}
              <span className="text-slate-300 dark:text-slate-600 select-none">/</span>
            </div>

            <div className="h-4 w-px bg-slate-200 dark:bg-slate-700 hidden sm:block" />

            <div className="flex items-center gap-2">
              <span className="font-mono text-sm sm:text-base font-extrabold text-foreground tracking-tight">
                #{poReference}
              </span>

              {draft.isAlreadyConfirmed || draft.duplicateOrderId ? (
                <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[11px] h-5 px-2">
                  <CheckCircle2 className="size-3 mr-1" />
                  Confirmed Sales Order
                </Badge>
              ) : (
                <Badge className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-[11px] h-5 px-2 gap-1">
                  <Sparkles className="size-3" />
                  Draft Review (AI Parsed)
                </Badge>
              )}

              <Badge
                variant="outline"
                className="hidden sm:inline-flex text-[11px] h-5 px-2 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-medium"
              >
                <span className="size-1.5 rounded-full bg-emerald-500 mr-1.5 animate-pulse" />
                {confidencePercent}% Extraction Match
              </Badge>

              <Badge
                variant="secondary"
                className="hidden lg:inline-flex text-[10px] h-5 px-1.5 font-medium border border-slate-200 dark:border-slate-700"
              >
                {draft.sourceType === "email" ? (
                  <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                    <Mail className="size-3" /> Gmail Channel
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-blue-700 dark:text-blue-400">
                    <FileImage className="size-3" /> Document Scan
                  </span>
                )}
              </Badge>
            </div>
          </div>

          {/* Right Block: View Switcher & Action Buttons */}
          <div className="flex items-center gap-2 justify-end flex-wrap">
            {/* Split / Form View Mode Switcher */}
            <div className="hidden sm:flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700 mr-1">
              <button
                type="button"
                onClick={() => setViewMode("split")}
                title="Split View (40% Source / 60% Form)"
                className={`text-xs font-semibold px-2.5 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1 ${viewMode === "split"
                  ? "bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-300 shadow-2xs font-bold"
                  : "text-muted-foreground hover:text-foreground"
                  }`}
              >
                <Columns2 className="size-3.5" />
                <span>Split (40/60)</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("form")}
                title="Structured Form Only"
                className={`text-xs font-semibold px-2.5 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1 ${viewMode === "form"
                  ? "bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-300 shadow-2xs font-bold"
                  : "text-muted-foreground hover:text-foreground"
                  }`}
              >
                <FileText className="size-3.5" />
                <span>Form Only</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("document")}
                title="Source Verifier Only"
                className={`text-xs font-semibold px-2.5 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1 ${viewMode === "document"
                  ? "bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-300 shadow-2xs font-bold"
                  : "text-muted-foreground hover:text-foreground"
                  }`}
              >
                <FileImage className="size-3.5" />
                <span>Source Only</span>
              </button>
            </div>

            {/* Action 1: Reject Non-Order */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsRejectModalOpen(true)}
              disabled={isSaving || isSavingDraft || isRejecting}
              className="h-8.5 text-xs font-semibold text-rose-600 dark:text-rose-400 border-rose-300 dark:border-rose-800 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:border-rose-400 cursor-pointer gap-1.5"
            >
              <Ban className="size-3.5" />
              <span>Reject Non-Order</span>
            </Button>

            {/* Action 1b: Re-Scan Document with AI */}
            {draft.imageUrl && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleReExtractClick}
                disabled={isSaving || isSavingDraft || isRejecting || isReExtracting}
                title="Re-run Gemini AI Vision extraction directly on the original document image with 100% verbatim accuracy"
                className="h-8.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300 border-indigo-300 dark:border-indigo-700 bg-indigo-50/50 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:hover:bg-indigo-900/60 cursor-pointer gap-1.5"
              >
                {isReExtracting ? (
                  <>
                    <RotateCcw className="size-3.5 animate-spin text-indigo-600 dark:text-indigo-400" />
                    <span>Re-Analyzing...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="size-3.5 text-indigo-600 dark:text-indigo-400" />
                    <span>Re-Scan with AI</span>
                  </>
                )}
              </Button>
            )}

            {/* Action 2: Save as Draft */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleSaveDraftClick}
              disabled={isSaving || isSavingDraft || isRejecting}
              className="h-8.5 text-xs font-semibold border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer gap-1.5"
            >
              {isSavingDraft ? (
                <>
                  <RotateCcw className="size-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Save className="size-3.5 text-slate-600 dark:text-slate-400" />
                  <span>Save as Draft</span>
                </>
              )}
            </Button>

            {/* Action 3: Approve & Confirm Sales Order */}
            <Button
              type="button"
              size="sm"
              onClick={handleConfirmClick}
              disabled={isSaving || isSavingDraft || isRejecting}
              className="h-8.5 px-4 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-xs cursor-pointer gap-1.5"
            >
              {isSaving ? (
                <>
                  <RotateCcw className="size-3.5 animate-spin" />
                  <span>Confirming...</span>
                </>
              ) : draft.isAlreadyConfirmed ? (
                <>
                  <Check className="size-4" />
                  <span>Update Order</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="size-4" />
                  <span>Approve & Confirm Sales Order</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-5 flex-1">
        {/* Alerts & Notifications */}
        <div className="space-y-3 mb-5">
          {/* Draft Saved Success Notice */}
          {draftSavedNotice && (
            <div className="p-3 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-xl text-blue-900 dark:text-blue-200 text-xs flex items-center justify-between gap-3 shadow-xs animate-in fade-in">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-blue-600 dark:text-blue-400 shrink-0" />
                <span className="font-medium">{draftSavedNotice}</span>
              </div>
              <button
                type="button"
                onClick={() => setDraftSavedNotice(null)}
                className="text-xs font-semibold underline text-blue-700 dark:text-blue-300"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Duplicate Order Detected Alert Banner */}
          {(draft.duplicateOrderNumber || draft.duplicateWarning || draft.duplicateOrderId) && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-amber-50 dark:bg-amber-950/40 border-2 border-amber-400 dark:border-amber-700 rounded-xl text-amber-950 dark:text-amber-200 text-xs shadow-xs animate-in fade-in">
              <div className="flex items-start gap-3">
                <AlertTriangle className="size-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-sm text-amber-900 dark:text-amber-100 flex items-center gap-2">
                    <span>Duplicate Order Detected</span>
                    {(draft.duplicateOrderNumber || draft.existingOrderNumber) && (
                      <Badge className="bg-amber-500/20 text-amber-800 dark:text-amber-200 border-amber-400 text-[10px] font-bold">
                        Matches #{draft.duplicateOrderNumber || draft.existingOrderNumber}
                      </Badge>
                    )}
                  </p>
                  <p className="mt-1 text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                    {draft.duplicateWarning || (
                      <>An identical confirmed sales order <strong className="font-mono font-bold">#{draft.duplicateOrderNumber || draft.existingOrderNumber}</strong> already exists in the system. Submitting changes will update the existing sales order instead of creating a duplicate.</>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                <Badge className="bg-emerald-600 text-white font-bold text-xs px-2.5 py-1">
                  Will Update Order
                </Badge>
              </div>
            </div>
          )}

          {/* Attention Banner for Missing Quantities / Low Confidence */}
          {(missingQtyItems.length > 0 || uncertainItems.length > 0) && (
            <div className="flex items-start justify-between gap-3 p-3.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800 rounded-xl text-amber-950 dark:text-amber-200 text-xs shadow-xs">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="size-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-sm text-amber-900 dark:text-amber-100">
                    Review Attention Needed
                  </p>
                  <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px] text-amber-800 dark:text-amber-300">
                    {missingQtyItems.length > 0 && (
                      <Badge variant="outline" className="bg-amber-100 dark:bg-amber-900 text-amber-900 dark:text-amber-200 border-amber-300 dark:border-amber-700 font-semibold">
                        {missingQtyItems.length} item(s) missing quantity
                      </Badge>
                    )}
                    {uncertainItems.length > 0 && (
                      <Badge variant="outline" className="bg-amber-100 dark:bg-amber-900 text-amber-900 dark:text-amber-200 border-amber-300 dark:border-amber-700 font-semibold">
                        {uncertainItems.length} item(s) with low extraction confidence (&lt;80%)
                      </Badge>
                    )}
                    <span>Please verify or correct highlighted fields before confirming.</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="p-3.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 rounded-xl text-rose-950 dark:text-rose-200 text-xs flex items-start gap-2.5 shadow-xs">
              <AlertCircle className="size-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <strong className="block text-rose-900 dark:text-rose-100">Operation Error</strong>
                <span>{error}</span>
              </div>
            </div>
          )}
        </div>

        {/* ========================================================
            SPLIT-SCREEN WORKSPACE LAYOUT
            Left (40% / 5 cols): Visual Document & Email Source Verifier
            Right (60% / 7 cols): Structured Order Studio Form
        ======================================================== */}
        <div
          className={
            viewMode === "split"
              ? "grid grid-cols-1 xl:grid-cols-12 gap-6 items-start"
              : "space-y-6"
          }
        >
          {/* ========================================================
              LEFT PANE (40% Width): Visual Document / Email Verifier
          ======================================================== */}
          {(viewMode === "split" || viewMode === "document") && (
            <div
              className={
                viewMode === "split"
                  ? "xl:col-span-5 sticky top-18 z-10 space-y-2 max-h-[calc(100vh-5.5rem)] flex flex-col"
                  : "w-full space-y-2"
              }
            >
              {/* If both image and email exist, provide a quick tab */}
              {draft.imageUrl && draft.sourceType === "email" && (
                <div className="flex items-center justify-between bg-card border border-slate-200 dark:border-slate-800 p-1.5 rounded-xl shadow-2xs">
                  <span className="text-[11px] font-bold text-muted-foreground px-2 uppercase tracking-wider">
                    Source View:
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setSourceTab("image")}
                      className={`text-xs font-semibold px-2.5 py-1 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${sourceTab === "image"
                        ? "bg-blue-600 text-white shadow-2xs font-bold"
                        : "text-muted-foreground hover:text-foreground"
                        }`}
                    >
                      <FileImage className="size-3.5" />
                      <span>Document Scan</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSourceTab("email")}
                      className={`text-xs font-semibold px-2.5 py-1 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${sourceTab === "email"
                        ? "bg-blue-600 text-white shadow-2xs font-bold"
                        : "text-muted-foreground hover:text-foreground"
                        }`}
                    >
                      <Mail className="size-3.5" />
                      <span>Email Message</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Render DocumentViewer if image mode, else EmailSourceViewer */}
              {draft.imageUrl && sourceTab === "image" ? (
                <DocumentViewer
                  imageUrl={draft.imageUrl}
                  sourceReference={draft.sourceReference}
                  onClose={() => setViewMode("form")}
                />
              ) : (
                <EmailSourceViewer
                  draft={draft}
                  onOpenImage={draft.imageUrl ? () => setSourceTab("image") : undefined}
                />
              )}
            </div>
          )}

          {/* ========================================================
              RIGHT PANE (60% Width): Structured ERP Order Studio
          ======================================================== */}
          {viewMode !== "document" && (
            <div
              className={
                viewMode === "split" ? "xl:col-span-7 space-y-5" : "space-y-5"
              }
            >
              {/* 1. Customer Card & Parameters Grid */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                {/* Customer Information Card (md:col-span-6) */}
                <Card className="md:col-span-6 border border-slate-200 dark:border-slate-800 shadow-xs hover:border-primary/40 transition-all bg-card">
                  <CardContent className="p-4 flex flex-col justify-between h-full space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="size-7 rounded-md bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-300 flex items-center justify-center border border-blue-100 dark:border-blue-900 shrink-0">
                          <User className="size-3.5" />
                        </div>
                        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                          Customer Account
                        </span>
                      </div>
                      {draft.matchedCustomerId ? (
                        <Badge variant="default" className="text-[10px] h-5 px-1.5 bg-emerald-600 hover:bg-emerald-700 font-medium">
                          Linked {draft.customerConfidence ? `(${draft.customerConfidence}%)` : ""}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] h-5 px-1.5 border-amber-300 text-amber-700 bg-amber-50 font-medium">
                          Unlinked Customer
                        </Badge>
                      )}
                    </div>

                    <div>
                      <Input
                        type="text"
                        value={draft.extracted.customer?.name || ""}
                        onChange={(e) => handleCustomerChange(e.target.value)}
                        placeholder="Customer Name..."
                        className="h-8.5 text-sm font-bold bg-background border-input focus-visible:ring-1 shadow-none"
                      />
                    </div>

                    {!draft.matchedCustomerId ? (
                      <div className="flex items-center gap-1.5 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                        <AlertCircle className="size-3.5 shrink-0" />
                        <span>Customer unverified in database.</span>
                      </div>
                    ) : (
                      <p className="text-[11px] text-muted-foreground truncate" title={draft.extracted.customer?.address || "Verified Account"}>
                        {draft.extracted.customer?.address || draft.extracted.customer?.email || "Account linked to active customer record"}
                      </p>
                    )}
                  </CardContent>
                </Card>

                {/* PO Reference Card (md:col-span-6) */}
                <Card className="md:col-span-6 border border-slate-200 dark:border-slate-800 shadow-xs hover:border-primary/40 transition-all bg-card">
                  <CardContent className="p-4 flex flex-col justify-between h-full space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="size-7 rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-300 flex items-center justify-center border border-indigo-100 dark:border-indigo-900 shrink-0">
                          <FileText className="size-3.5" />
                        </div>
                        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                          Order / PO Number
                        </span>
                      </div>
                      <Badge variant="secondary" className="font-mono text-[10px] h-5 px-1.5 uppercase font-medium">
                        {draft.sourceType === "image" ? "Scan Doc" : "Email PO"}
                      </Badge>
                    </div>

                    <div>
                      <Input
                        type="text"
                        value={draft.extracted.po_number || ""}
                        onChange={(e) => handlePoChange(e.target.value)}
                        placeholder="PO Number (e.g. PO-2026-0089)..."
                        className="h-8.5 font-mono text-sm font-bold bg-background border-input focus-visible:ring-1 shadow-none"
                      />
                    </div>

                    <p className="text-[11px] text-muted-foreground truncate">
                      Extracted reference for sales order tracking & dispatch slips.
                    </p>
                  </CardContent>
                </Card>

                {/* Dates & Payment Terms Grid (Full width 12 cols, split in 3) */}
                <div className="md:col-span-12 grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Order Date */}
                  <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-card space-y-1.5">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <Calendar className="size-3 text-purple-600" />
                      Order / Invoice Date
                    </label>
                    <Input
                      type="date"
                      value={draft.extracted.order_date || ""}
                      onChange={(e) => handleDateChange(e.target.value)}
                      className="h-8 text-xs font-semibold bg-background"
                    />
                  </div>

                  {/* Delivery Date */}
                  <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-card space-y-1.5">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <Truck className="size-3 text-emerald-600" />
                      Expected Delivery Date
                    </label>
                    <Input
                      type="date"
                      value={draft.extracted.delivery_date || ""}
                      onChange={(e) => handleDeliveryDateChange(e.target.value)}
                      className="h-8 text-xs font-semibold bg-background"
                    />
                  </div>

                  {/* Payment Terms */}
                  <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-card space-y-1.5">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <CreditCard className="size-3 text-blue-600" />
                      Payment Terms
                    </label>
                    <Input
                      type="text"
                      value={draft.extracted.terms || "Net 30 Days"}
                      onChange={(e) => handleTermsChange(e.target.value)}
                      placeholder="e.g. Net 30, Advance"
                      className="h-8 text-xs font-semibold bg-background"
                    />
                  </div>
                </div>
              </div>

              {/* 2. Structured Line Items Table Card */}
              <Card className="border border-slate-200 dark:border-slate-800 shadow-xs bg-card overflow-hidden">
                <CardHeader className="flex flex-row items-center justify-between border-b border-slate-100 dark:border-slate-800 px-5 py-3.5 bg-slate-50/50 dark:bg-slate-900/40">
                  <div>
                    <CardTitle className="text-sm font-bold flex items-center gap-2 text-foreground">
                      <Building2 className="size-4 text-blue-600" />
                      <span>Sales Order Line Items</span>
                      <Badge variant="secondary" className="text-[10px] h-4.5 px-1.5 font-bold">
                        {draft.lineItems.length} lines
                      </Badge>
                    </CardTitle>
                    <CardDescription className="text-[11px] text-muted-foreground mt-0.5">
                      Adjust quantities, rates, or catalog matching in real-time.
                    </CardDescription>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      onClick={handleTriggerMatchItemsApi}
                      disabled={isCheckingMatchingApi}
                      title="Call /api/match/items API to re-check all line items against catalog"
                      className="gap-1.5 h-7.5 text-xs font-semibold cursor-pointer border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 bg-blue-50/50 hover:bg-blue-100 dark:bg-blue-950/40 dark:hover:bg-blue-900/60"
                    >
                      <Sparkles className="size-3.5 text-blue-600" />
                      <span>{isCheckingMatchingApi ? "Checking..." : "Check Items API"}</span>
                    </Button>
                    {draft.lineItems.some((it) => !it.matchedItemId && (it.description?.trim() || it.sku?.trim())) && (
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        onClick={handlePromptAllUnlinked}
                        className="gap-1.5 h-7.5 text-xs font-semibold text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/60 cursor-pointer"
                      >
                        <PackagePlus className="size-3.5" />
                        <span>Insert Unlinked to Items</span>
                      </Button>
                    )}
                    <Link
                      to="/items"
                      target="_blank"
                      rel="noopener noreferrer"
                      className={
                        buttonVariants({ variant: "outline", size: "xs" }) +
                        " gap-1.5 h-7.5 text-xs font-semibold cursor-pointer border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100"
                      }
                      title="Manage all items in catalog (Add, Update, Delete)"
                    >
                      <Package className="size-3.5 text-indigo-600" />
                      <span>Manage Items</span>
                    </Link>
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      onClick={handleAddLineItem}
                      className="gap-1.5 h-7.5 text-xs font-semibold cursor-pointer border-slate-300 dark:border-slate-700"
                    >
                      <Plus className="size-3.5" />
                      <span>Add Line Item</span>
                    </Button>
                  </div>
                </CardHeader>

                {/* Match API Success / Info Banner */}
                {matchApiStatusNotice && (
                  <div className="mx-4 mt-3 p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 flex items-center gap-2 text-xs text-blue-800 dark:text-blue-200 animate-in fade-in duration-200">
                    <CheckCircle2 className="size-4 text-blue-600 shrink-0" />
                    <span className="font-medium">{matchApiStatusNotice}</span>
                  </div>
                )}

                {/* Warning banner for unlinked items */}
                {draft.lineItems.some((it) => isUnlinkedLineItem(it) && (it.description?.trim() || it.sku?.trim())) && (
                  <div className="mx-4 mt-3.5 p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200">
                      <AlertCircle className="size-4 text-amber-600 shrink-0" />
                      <span>
                        <strong>
                          {draft.lineItems.filter((it) => isUnlinkedLineItem(it) && (it.description?.trim() || it.sku?.trim())).length}{" "}
                          item(s) not in catalog table.
                        </strong>{" "}
                        Click to insert or adjust.
                      </span>
                    </div>
                    <Button
                      type="button"
                      size="xs"
                      onClick={handlePromptAllUnlinked}
                      className="h-6.5 text-[11px] bg-amber-600 hover:bg-amber-700 text-white font-semibold cursor-pointer shrink-0"
                    >
                      <Plus className="size-3 mr-1" />
                      Insert to Items Table
                    </Button>
                  </div>
                )}

                <CardContent className="p-0">
                  <Table>
                    <TableHeader className="bg-muted/40 border-b border-slate-100 dark:border-slate-800">
                      <TableRow>
                        <TableHead className="w-10 text-center text-[10px] font-bold uppercase tracking-wider">
                          #
                        </TableHead>
                        <TableHead className="min-w-[240px] text-[10px] font-bold uppercase tracking-wider">
                          Item Description
                        </TableHead>
                        <TableHead className="w-32 text-center text-[10px] font-bold uppercase tracking-wider">
                          SKU / Code
                        </TableHead>
                        <TableHead className="w-28 text-center text-[10px] font-bold uppercase tracking-wider">
                          Stock Status
                        </TableHead>
                        <TableHead className="w-28 text-right text-[10px] font-bold uppercase tracking-wider">
                          Quantity
                        </TableHead>
                        <TableHead className="w-32 text-right text-[10px] font-bold uppercase tracking-wider">
                          Unit Rate
                        </TableHead>
                        <TableHead className="w-32 text-right text-[10px] font-bold uppercase tracking-wider">
                          Amount
                        </TableHead>
                        <TableHead className="w-10 text-center"></TableHead>
                      </TableRow>
                    </TableHeader>

                    <TableBody>
                      {draft.lineItems.length > 0 ? (
                        visibleLineItems.map((item, visibleIdx) => {
                          const itemNumber = startIndex + visibleIdx + 1;
                          const isUncertain = item.confidence != null && item.confidence < 80;
                          const isMissingQty = item.quantity == null || item.quantity <= 0;
                          const isMissingDesc = !item.description || item.description.trim() === "";

                          return (
                            <TableRow
                              key={item.tempId}
                              className={`transition-colors border-b last:border-b-0 hover:bg-muted/30 ${isUncertain ? "bg-amber-50/20 dark:bg-amber-950/20 border-l-2 border-l-amber-500" : ""
                                }`}
                            >
                              {/* Index */}
                              <TableCell className="w-10 text-center font-mono text-xs text-muted-foreground font-semibold py-2.5 align-middle">
                                {itemNumber.toString().padStart(2, "0")}
                              </TableCell>

                              {/* Item Description with Partial Match Options */}
                              <TableCell className="min-w-[260px] py-2.5 align-middle relative">
                                {(() => {
                                  const currentTitle = item.description || item.matchedItemName || "";
                                  const otherLinesMatchedIds = new Set(
                                    draft.lineItems
                                      .filter((li) => li.tempId !== item.tempId && li.matchedItemId)
                                      .map((li) => li.matchedItemId!)
                                  );

                                  const queryDigits = extractDigits(currentTitle);
                                  const hasExactGradeCandidate = queryDigits
                                    ? (item.partialMatches || []).some(
                                        (cand) =>
                                          cand.id !== item.matchedItemId &&
                                          !otherLinesMatchedIds.has(cand.id) &&
                                          !isSameSeriesDifferentGrade(currentTitle, cand.name) &&
                                          extractDigits(cand.name) === queryDigits
                                      )
                                    : false;

                                  const alternativeMatches = (item.partialMatches || []).filter((cand) => {
                                    if (cand.id === item.matchedItemId) return false;
                                    if (otherLinesMatchedIds.has(cand.id)) return false;
                                    if (isSameSeriesDifferentGrade(currentTitle, cand.name)) return false;
                                    if (cand.name?.toLowerCase().trim() === (item.matchedItemName || item.description)?.toLowerCase().trim()) return false;
                                    if (cand.confidence != null && cand.confidence < 90) return false;
                                    // If an exact grade match exists (e.g. WTW GK 3 for IOP. GK III), NEVER show other grades (2, 4, 5)!
                                    if (hasExactGradeCandidate && queryDigits) {
                                      const candDigits = extractDigits(cand.name);
                                      if (candDigits && candDigits !== queryDigits) return false;
                                    }
                                    return true;
                                  });
                                  const isExactCatalogMatch = catalogItems.some(
                                    (c) => c.name && normalizeName(c.name) === normalizeName(currentTitle)
                                  );

                                  const isAlreadyMatchedToCatalog = Boolean(
                                    (item.matchedItemId || (item.sku && item.sku !== "NO SKU" && item.matched)) &&
                                    item.matched &&
                                    (item.confidence == null || item.confidence >= 60) &&
                                    (!item.matchedItemName || isExactCatalogMatch || normalizeName(item.matchedItemName) === normalizeName(currentTitle))
                                  );

                                  const spellingSuggestions =
                                    !isExactCatalogMatch && !isAlreadyMatchedToCatalog && currentTitle.trim().length >= 2
                                      ? findSpellingSuggestions(currentTitle, catalogItems, otherLinesMatchedIds)
                                      : [];

                                  const combinedSuggestions = [
                                    ...alternativeMatches.map((alt) => {
                                      const catalogEntry = catalogItems.find((c) => c.id === alt.id);
                                      return {
                                        item: {
                                          id: alt.id,
                                          name: alt.name,
                                          code: alt.code ?? catalogEntry?.code,
                                          price: alt.price ?? catalogEntry?.price,
                                          unit: alt.unit ?? catalogEntry?.unit,
                                        },
                                        score: alt.confidence,
                                      };
                                    }),
                                    ...spellingSuggestions,
                                  ];

                                  const seenSugIds = new Set<string>();
                                  const allCatalogSuggestions = combinedSuggestions.filter((s) => {
                                    if (seenSugIds.has(s.item.id)) return false;
                                    seenSugIds.add(s.item.id);
                                    return true;
                                  });

                                  const hasSelectedCatalogItem = Boolean(
                                    (item.matchedItemId || (item.sku && item.sku !== "NO SKU" && item.matched)) &&
                                    item.matched &&
                                    (item.confidence == null || item.confidence >= 50) &&
                                    (!item.matchedItemName || isExactCatalogMatch || normalizeName(item.matchedItemName) === normalizeName(currentTitle))
                                  );

                                  return (
                                    <div className="space-y-1.5">
                                      <Input
                                        type="text"
                                        value={item.description || ""}
                                        onChange={(e) =>
                                          handleItemChange(item.tempId, "description", e.target.value)
                                        }
                                        className={`font-medium h-8 bg-background border-input focus-visible:ring-1 text-xs shadow-2xs ${isMissingDesc ? "border-amber-400 bg-amber-50/20" : ""
                                          }`}
                                        placeholder="Enter item description..."
                                      />

                                      {/* Intelligent Catalogue Match Suggestion: "This item does not match with the catalogue item. Do you want [Item Name]?" */}
                                      {allCatalogSuggestions.length > 0 && !isExactCatalogMatch && !hasSelectedCatalogItem && (
                                        <div className="flex items-center gap-1.5 p-1.5 px-2 bg-amber-50/95 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-700/80 rounded-md text-xs text-amber-900 dark:text-amber-200 shadow-2xs animate-in fade-in duration-150">
                                          <AlertTriangle className="size-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                                          <div className="flex items-center gap-1.5 flex-wrap flex-1 min-w-0">
                                            <span className="text-[11px] font-medium text-amber-900 dark:text-amber-200 shrink-0">
                                              This item does not match with the catalogue item.
                                              {allCatalogSuggestions.length === 1
                                                ? ` Do you want “${allCatalogSuggestions[0].item.name}”?`
                                                : " Do you want:"}
                                            </span>
                                            {allCatalogSuggestions.slice(0, 2).map(({ item: sugItem, score }) => (
                                              <button
                                                key={sugItem.id}
                                                type="button"
                                                onClick={(e) => {
                                                  e.preventDefault();
                                                  e.stopPropagation();
                                                  handleApplySuggestion(item.tempId, sugItem);
                                                }}
                                                className="inline-flex items-center gap-1 text-[11px] font-bold bg-amber-600 hover:bg-amber-700 text-white px-2 py-0.5 rounded shadow-2xs transition cursor-pointer"
                                                title={`Click to link and use "${sugItem.name}" (${score}% match)`}
                                              >
                                                <Check className="size-3" />
                                                Use &ldquo;{sugItem.name}&rdquo;
                                              </button>
                                            ))}
                                          </div>
                                        </div>
                                      )}

                                      {allCatalogSuggestions.length === 0 && !isExactCatalogMatch && !hasSelectedCatalogItem && currentTitle.trim().length >= 2 && (
                                        <div className="flex items-center gap-1.5 p-1.5 px-2 bg-amber-50/70 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-md text-xs text-amber-900 dark:text-amber-200 shadow-2xs animate-in fade-in duration-150">
                                          <AlertTriangle className="size-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                                          <span className="text-[11px] font-medium text-amber-900 dark:text-amber-200 shrink-0">
                                            This item does not match with the catalogue item.
                                          </span>
                                        </div>
                                      )}

                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        {/* Selected Catalog Item Badge - Clickable to open options */}
                                        {hasSelectedCatalogItem ? (
                                          <Badge
                                            variant="outline"
                                            onClick={(e) => {
                                              e.preventDefault();
                                              e.stopPropagation();
                                              handleToggleAlternatives(item);
                                            }}
                                            className="text-[9px] h-4.5 px-2 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700 font-semibold gap-1 inline-flex items-center cursor-pointer hover:bg-emerald-100 dark:hover:bg-emerald-900/60 transition"
                                            title={`Linked to: ${item.matchedItemName || item.description} (SKU: ${item.matchedItemCode || item.sku || "None"}). Click to change item or unlink.`}
                                          >
                                            <Check className="size-2.5 text-emerald-600 dark:text-emerald-400" />
                                            <span>
                                              {item.matchedItemCode || (item.sku && item.sku !== "NO SKU" ? item.sku : null)
                                                ? `Selected: ${item.matchedItemCode || item.sku}`
                                                : "Catalog Matched"}
                                            </span>
                                          </Badge>
                                        ) : (
                                          <Badge
                                            variant="outline"
                                            onClick={(e) => {
                                              e.preventDefault();
                                              e.stopPropagation();
                                              handleToggleAlternatives(item);
                                            }}
                                            className="text-[9px] h-4.5 px-2 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700 font-semibold gap-1 inline-flex items-center cursor-pointer hover:bg-amber-100 dark:hover:bg-amber-900/60 transition"
                                            title="Click to search catalog and link product"
                                          >
                                            <Search className="size-2.5 text-amber-600" />
                                            <span>Unlinked / Pick Item</span>
                                          </Badge>
                                        )}

                                        {/* Alternative Matches / Change Item Trigger Button */}
                                        {alternativeMatches.length > 0 && (
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.preventDefault();
                                              e.stopPropagation();
                                              handleToggleAlternatives(item);
                                            }}
                                            className={`inline-flex items-center gap-1 text-[9px] h-4.5 px-1.5 rounded font-semibold transition cursor-pointer border ${activeSuggestionsTempId === item.tempId
                                              ? "bg-blue-600 text-white border-blue-600 shadow-2xs"
                                              : "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/60"
                                              }`}
                                            title="View alternative matches and select different variant"
                                          >
                                            {fetchingAlternativesTempId === item.tempId ? (
                                              <Loader2 className="size-2.5 animate-spin" />
                                            ) : (
                                              <Sparkles className="size-2.5" />
                                            )}
                                            <span>
                                              {alternativeMatches.length} Related Option{alternativeMatches.length > 1 ? "s" : ""}
                                            </span>
                                            <ChevronDown className={`size-2.5 transition-transform ${activeSuggestionsTempId === item.tempId ? "rotate-180" : ""}`} />
                                          </button>
                                        )}

                                        {isUncertain && (
                                          <Badge
                                            variant="outline"
                                            className="text-[9px] h-4 px-1.5 bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200 border-amber-300 dark:border-amber-700 font-semibold gap-1"
                                          >
                                            <AlertCircle className="size-2.5 text-amber-600" />
                                            Low Confidence ({item.confidence}%)
                                          </Badge>
                                        )}

                                        {Boolean(hasSelectedCatalogItem && item.matchedItemId && item.matched && item.matchedItemName && item.matchedItemName !== item.description && (item.confidence == null || item.confidence >= 50)) && (
                                          <div className="flex items-center gap-1 text-[10px] text-muted-foreground truncate" title={item.matchedItemName}>
                                            <span>Catalog Match: <strong>{item.matchedItemName}</strong></span>
                                            <button
                                              type="button"
                                              onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                const found = catalogItems.find(
                                                  (c) => c.name === item.matchedItemName || c.id === item.matchedItemId
                                                );
                                                if (found) {
                                                  handleApplySuggestion(item.tempId, found);
                                                } else {
                                                  handleItemChange(item.tempId, "description", item.matchedItemName!);
                                                }
                                              }}
                                              className="text-[9px] text-blue-600 dark:text-blue-400 hover:underline font-semibold cursor-pointer"
                                              title="Update description field to match official catalog name"
                                            >
                                              (Sync)
                                            </button>
                                          </div>
                                        )}
                                      </div>

                                      {/* Expandable Inline Card for Selected Item, Alternatives & Full Catalog Picker */}
                                      {activeSuggestionsTempId === item.tempId && (
                                        <div className="mt-2 w-full max-w-xl bg-slate-50 dark:bg-slate-900 border-2 border-blue-400 dark:border-blue-600 rounded-xl shadow-lg p-3 space-y-3 animate-in fade-in zoom-in-95 duration-150 text-left z-30 relative">
                                          <div className="flex items-center justify-between pb-1.5 border-b border-slate-200 dark:border-slate-800">
                                            <div className="flex items-center gap-2">
                                              {fetchingAlternativesTempId === item.tempId ? (
                                                <Loader2 className="size-4 text-blue-600 animate-spin" />
                                              ) : (
                                                <Sparkles className="size-4 text-blue-600" />
                                              )}
                                              <span className="text-xs font-bold text-foreground">
                                                Catalog Selection & Item Options
                                              </span>
                                            </div>
                                            <button
                                              type="button"
                                              onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                setActiveSuggestionsTempId(null);
                                              }}
                                              className="text-xs text-muted-foreground hover:text-foreground font-semibold px-2 py-0.5 rounded hover:bg-muted cursor-pointer"
                                            >
                                              ✕ Close
                                            </button>
                                          </div>

                                          {/* 1. CURRENTLY SELECTED ITEM & UNLINK ACTION */}
                                          {hasSelectedCatalogItem ? (
                                            <div className="rounded-lg border-2 border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/40 p-2.5 shadow-2xs space-y-2">
                                              <div className="flex items-center justify-between gap-2">
                                                <div className="flex items-center gap-1.5">
                                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-emerald-600 text-white px-2 py-0.5 rounded">
                                                    <Check className="size-3" />
                                                    Currently Selected
                                                  </span>
                                                  {(item.matchedItemCode || (item.sku && item.sku !== "NO SKU" ? item.sku : null)) && (
                                                    <span className="font-mono bg-white dark:bg-slate-800 border border-emerald-300 dark:border-emerald-700 px-1.5 py-0.5 rounded text-[10px] font-bold text-emerald-800 dark:text-emerald-300">
                                                      {item.matchedItemCode || item.sku}
                                                    </span>
                                                  )}
                                                </div>
                                                <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/60 px-2 py-0.5 rounded-full border border-emerald-300 dark:border-emerald-700">
                                                  Active in Order
                                                </span>
                                              </div>

                                              <div className="text-xs font-bold text-foreground">
                                                {item.matchedItemName || item.description}
                                              </div>

                                              <div className="flex items-center justify-between gap-2 pt-1 border-t border-emerald-200/60 dark:border-emerald-800/60 flex-wrap">
                                                <div className="flex items-center gap-2.5 text-[11px] text-muted-foreground">
                                                  {item.unit_price != null && item.unit_price > 0 && (
                                                    <span className="font-bold text-emerald-700 dark:text-emerald-300 text-xs">
                                                      ₹{Number(item.unit_price).toFixed(2)}
                                                    </span>
                                                  )}
                                                  <span className="text-emerald-700 dark:text-emerald-400 font-semibold text-[10px]">
                                                    ✓ Catalog Linked
                                                  </span>
                                                  {item.confidence && (
                                                    <span className="text-slate-500 dark:text-slate-400 text-[10px]">
                                                      • {item.confidence}% Confidence
                                                    </span>
                                                  )}
                                                </div>

                                                <Button
                                                  type="button"
                                                  variant="outline"
                                                  size="xs"
                                                  onClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    handleUnlinkItem(item.tempId);
                                                  }}
                                                  className="h-6.5 text-[11px] font-semibold text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                                                  title="Unlink from this catalog product and keep as a separate new/custom item"
                                                >
                                                  <Unlink className="size-3 mr-1" />
                                                  Not this item? Unlink
                                                </Button>
                                              </div>
                                            </div>
                                          ) : (
                                            <div className="p-2.5 rounded-lg border border-dashed border-amber-300 bg-amber-50/50 dark:bg-amber-950/20 text-xs text-amber-800 dark:text-amber-200 flex items-center justify-between gap-2">
                                              <div className="flex items-center gap-1.5">
                                                <AlertCircle className="size-3.5 text-amber-600 shrink-0" />
                                                <span>No catalog product linked. Choose from catalog below, search, or create new:</span>
                                              </div>
                                              <Button
                                                type="button"
                                                size="xs"
                                                variant="outline"
                                                onClick={(e) => {
                                                  e.preventDefault();
                                                  e.stopPropagation();
                                                  handlePromptSingleItem(item);
                                                }}
                                                className="text-xs h-6.5 font-bold text-amber-800 dark:text-amber-300 border-amber-300 cursor-pointer shrink-0"
                                              >
                                                <Plus className="size-3 mr-1" />
                                                + New Item
                                              </Button>
                                            </div>
                                          )}

                                          {/* 2. SMART PUBLISHER / SERIES ALTERNATIVES (IF FOUND) */}
                                          {alternativeMatches.length > 0 && (
                                            <div className="space-y-1.5">
                                              <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                                                <span>Smart Suggested Options ({alternativeMatches.length})</span>
                                                <span className="text-[10px] font-normal normal-case">Click "Select" to switch variant</span>
                                              </div>

                                              <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1 divide-y divide-slate-200 dark:divide-slate-800">
                                                {alternativeMatches.map((cand) => (
                                                  <div
                                                    key={cand.id}
                                                    className="pt-1.5 first:pt-0 p-2 rounded-lg border transition flex items-center justify-between gap-3 bg-background hover:bg-slate-100 dark:hover:bg-slate-800 border-slate-200 dark:border-slate-700"
                                                  >
                                                    <div className="min-w-0 flex-1">
                                                      <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="text-xs font-bold text-foreground">
                                                          {cand.name}
                                                        </span>
                                                        {cand.code && (
                                                          <span className="font-mono bg-muted px-1.5 py-0.2 rounded text-[10px] text-muted-foreground">
                                                            {cand.code}
                                                          </span>
                                                        )}
                                                      </div>

                                                      <div className="flex items-center gap-2.5 text-[11px] text-muted-foreground mt-0.5 flex-wrap">
                                                        {cand.price != null && cand.price > 0 && (
                                                          <span className="font-bold text-emerald-600 dark:text-emerald-400 text-xs">
                                                            ₹{cand.price.toFixed(2)}
                                                          </span>
                                                        )}
                                                        <span className="text-blue-600 dark:text-blue-400 font-semibold text-[11px]">
                                                          {cand.confidence}% Match
                                                        </span>
                                                        {cand.reason && (
                                                          <span className="text-slate-500 dark:text-slate-400 text-[10px]">
                                                            • {cand.reason}
                                                          </span>
                                                        )}
                                                      </div>
                                                    </div>

                                                    <Button
                                                      type="button"
                                                      size="xs"
                                                      onClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        handleSelectPartialMatch(item.tempId, cand);
                                                      }}
                                                      className="h-7 text-xs px-2.5 font-bold cursor-pointer shrink-0"
                                                      variant="default"
                                                    >
                                                      Select
                                                    </Button>
                                                  </div>
                                                ))}
                                              </div>
                                            </div>
                                          )}

                                          {/* 3. INTERACTIVE CATALOG SEARCH & SELECT (ALWAYS ACCESSIBLE!) */}
                                          <div className="space-y-2 pt-1 border-t border-slate-200 dark:border-slate-800">
                                            {(() => {
                                              const query = catalogSearchQuery.trim().toLowerCase();
                                              const currentTitle = item.description || item.matchedItemName || "";
                                              const currentSubject = getSubjectFromTitle(currentTitle);

                                              // Exclude current item and items already in smart alternatives
                                              const altIds = new Set(alternativeMatches.map((a) => a.id));
                                              if (item.matchedItemId) altIds.add(item.matchedItemId);

                                              // Exclude items already active on other lines in this order
                                              const otherLinesMatchedIds = new Set(
                                                draft.lineItems
                                                  .filter((li) => li.tempId !== item.tempId && li.matchedItemId)
                                                  .map((li) => li.matchedItemId!)
                                              );

                                              let filtered = catalogItems.filter((cat) => {
                                                // Always exclude current item and smart alternatives already displayed above
                                                if (altIds.has(cat.id)) return false;

                                                if (query) {
                                                  // Explicit search typed by user: search across catalog
                                                  return (
                                                    cat.name.toLowerCase().includes(query) ||
                                                    (cat.code && cat.code.toLowerCase().includes(query))
                                                  );
                                                }

                                                // Default alternative options mode (search box empty):
                                                // 1. Strictly exclude items already active on other lines in this order (e.g. WTW GK 3, 4, 5)
                                                if (otherLinesMatchedIds.has(cat.id)) return false;

                                                // 2. Strictly exclude same series with different grades (e.g. WTW GK 3, 4, 5 for WTW GK 2)
                                                if (isSameSeriesDifferentGrade(currentTitle, cat.name)) return false;

                                                // 3. If subject is known (e.g. GK), ONLY show alternative publisher options for this subject (e.g. IOP. GK III)
                                                if (currentSubject) {
                                                  const catSub = getSubjectFromTitle(cat.name);
                                                  if (catSub !== currentSubject) return false;
                                                }

                                                return true;
                                              });

                                              if (!query) {
                                                const queryDigits = extractDigits(currentTitle);
                                                if (queryDigits) {
                                                  const exactGradeItems = filtered.filter(
                                                    (cat) => extractDigits(cat.name) === queryDigits
                                                  );
                                                  if (exactGradeItems.length > 0) {
                                                    filtered = exactGradeItems;
                                                  }
                                                }
                                                filtered.sort((a, b) => a.name.localeCompare(b.name));
                                              }

                                              const displayItems = filtered.slice(0, 10);

                                              return (
                                                <>
                                                  <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                                                    <span>
                                                      {query
                                                        ? `Search Results (${filtered.length})`
                                                        : currentSubject
                                                          ? `Alternative ${currentSubject.toUpperCase()} Options (${filtered.length})`
                                                          : `Select from Catalog Products (${filtered.length})`}
                                                    </span>
                                                    {isLoadingCatalog && (
                                                      <span className="flex items-center gap-1 normal-case text-muted-foreground font-normal">
                                                        <Loader2 className="size-3 animate-spin text-blue-500" /> Loading catalog...
                                                      </span>
                                                    )}
                                                  </div>

                                                  <div className="relative">
                                                    <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
                                                    <Input
                                                      type="text"
                                                      placeholder="Search catalog by title, series, or code..."
                                                      value={catalogSearchQuery}
                                                      onChange={(e) => setCatalogSearchQuery(e.target.value)}
                                                      className="h-8 pl-8 pr-7 text-xs bg-background"
                                                    />
                                                    {catalogSearchQuery && (
                                                      <button
                                                        type="button"
                                                        onClick={() => setCatalogSearchQuery("")}
                                                        className="absolute right-2 top-2 p-0.5 rounded text-muted-foreground hover:text-foreground cursor-pointer"
                                                      >
                                                        <X className="size-3.5" />
                                                      </button>
                                                    )}
                                                  </div>

                                                  {displayItems.length === 0 ? (
                                                    <div className="p-3 text-center text-xs text-muted-foreground bg-muted/20 rounded-lg border border-dashed border-slate-200 dark:border-slate-700 space-y-1.5">
                                                      <p className="font-semibold text-foreground">
                                                        {query
                                                          ? `No items found matching "${catalogSearchQuery}"`
                                                          : `No other publisher alternatives found for ${currentSubject ? currentSubject.toUpperCase() : "this item"}`}
                                                      </p>
                                                      <p className="text-[11px]">
                                                        {query
                                                          ? "Try searching for a different keyword or add as a new catalog item."
                                                          : "The catalog does not have other publisher variants for this subject. Use the search bar above to browse or add a new item."}
                                                      </p>
                                                      <Button
                                                        type="button"
                                                        size="xs"
                                                        variant="outline"
                                                        onClick={(e) => {
                                                          e.preventDefault();
                                                          e.stopPropagation();
                                                          handlePromptSingleItem(item);
                                                        }}
                                                        className="mt-1 font-semibold text-blue-600 dark:text-blue-400 border-blue-300 dark:border-blue-700 cursor-pointer"
                                                      >
                                                        <Plus className="size-3 mr-1" />
                                                        Add "{item.description || "Item"}" to Catalog
                                                      </Button>
                                                    </div>
                                                  ) : (
                                                    <div className="max-h-52 overflow-y-auto space-y-1.5 pr-1 divide-y divide-slate-200 dark:divide-slate-800">
                                                      {displayItems.map((cat) => (
                                                        <div
                                                          key={cat.id}
                                                          className="pt-1.5 first:pt-0 p-2 rounded-lg border transition flex items-center justify-between gap-3 bg-background hover:bg-slate-100 dark:hover:bg-slate-800 border-slate-200 dark:border-slate-700"
                                                        >
                                                          <div className="min-w-0 flex-1">
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                              <span className="text-xs font-bold text-foreground">
                                                                {cat.name}
                                                              </span>
                                                              {cat.code && (
                                                                <span className="font-mono bg-muted px-1.5 py-0.2 rounded text-[10px] text-muted-foreground">
                                                                  {cat.code}
                                                                </span>
                                                              )}
                                                            </div>
                                                            <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
                                                              {cat.price != null && cat.price > 0 ? (
                                                                <span className="font-bold text-emerald-600 dark:text-emerald-400 text-xs">
                                                                  ₹{Number(cat.price).toFixed(2)}
                                                                </span>
                                                              ) : (
                                                                <span className="text-[10px] text-slate-400">Price on invoice</span>
                                                              )}
                                                            </div>
                                                          </div>

                                                          <Button
                                                            type="button"
                                                            size="xs"
                                                            onClick={(e) => {
                                                              e.preventDefault();
                                                              e.stopPropagation();
                                                              handleSelectPartialMatch(item.tempId, {
                                                                id: cat.id,
                                                                name: cat.name,
                                                                code: cat.code,
                                                                price: cat.price,
                                                                confidence: 100,
                                                              });
                                                            }}
                                                            className="h-7 text-xs px-2.5 font-bold cursor-pointer shrink-0"
                                                            variant="outline"
                                                          >
                                                            Select This Item
                                                          </Button>
                                                        </div>
                                                      ))}
                                                      {filtered.length > 10 && (
                                                        <div className="text-center text-[10px] text-muted-foreground pt-1">
                                                          Showing top 10 of {filtered.length} products. Type above to filter.
                                                        </div>
                                                      )}
                                                    </div>
                                                  )}
                                                </>
                                              );
                                            })()}
                                          </div>

                                          {/* 4. FOOTER / CREATE NEW PRODUCT ACTION */}
                                          <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-muted-foreground">
                                            <span>Item not found in catalog?</span>
                                            <Button
                                              type="button"
                                              size="xs"
                                              variant="secondary"
                                              onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                handlePromptSingleItem(item);
                                              }}
                                              className="text-xs h-7 cursor-pointer font-medium"
                                            >
                                              <Plus className="size-3 mr-1" />
                                              Add "{item.description || "Item"}" to Catalog
                                            </Button>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })()}
                              </TableCell>

                              {/* SKU / Code */}
                              <TableCell className="w-32 py-2.5 align-middle text-center">
                                <Input
                                  type="text"
                                  value={item.sku || ""}
                                  onChange={(e) =>
                                    handleItemChange(item.tempId, "sku", e.target.value)
                                  }
                                  placeholder="NO SKU"
                                  className="h-7.5 text-center font-mono text-[11px] uppercase bg-muted/20 border-input shadow-2xs"
                                />
                              </TableCell>

                              {/* Stock Status Badge */}
                              <TableCell className="w-28 py-2.5 align-middle text-center">
                                {!isUnlinkedLineItem(item) && item.matchedItemId && item.matched ? (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] h-5 px-1.5 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700 font-medium inline-flex items-center gap-1"
                                  >
                                    <span className="size-1.5 rounded-full bg-emerald-500"></span>
                                    In Stock
                                  </Badge>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handlePromptSingleItem(item)}
                                    title="Click to insert into items catalog"
                                    className="inline-flex items-center gap-1 text-[9px] h-5 px-1.5 rounded font-semibold text-amber-800 dark:text-amber-300 bg-amber-100 hover:bg-amber-200 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-700 transition cursor-pointer"
                                  >
                                    <Plus className="size-2.5" />
                                    New Item
                                  </button>
                                )}
                              </TableCell>

                              {/* Quantity */}
                              <TableCell className="w-28 py-2.5 text-right align-middle">
                                <div className="flex items-center justify-end gap-1">
                                  <Input
                                    type="number"
                                    min="0"
                                    value={item.quantity ?? ""}
                                    placeholder="0"
                                    onChange={(e) =>
                                      handleItemChange(item.tempId, "quantity", e.target.value)
                                    }
                                    className={`w-16 text-right font-bold h-8 text-xs bg-background border-input focus-visible:ring-1 shadow-2xs ${isMissingQty
                                      ? "border-amber-400 bg-amber-50/40 dark:bg-amber-950/40 ring-1 ring-amber-400"
                                      : ""
                                      }`}
                                  />
                                  <span className="text-[11px] font-semibold text-muted-foreground select-none w-5 text-left">
                                    pcs
                                  </span>
                                </div>
                              </TableCell>

                              {/* Unit Rate */}
                              <TableCell className="w-32 py-2.5 text-right align-middle">
                                <div className="flex flex-col items-end">
                                  <div className="relative inline-flex items-center justify-end w-24">
                                    <span className="absolute left-2 text-muted-foreground text-xs font-bold select-none pointer-events-none">
                                      ₹
                                    </span>
                                    <Input
                                      type="number"
                                      step="0.01"
                                      min="0"
                                      value={item.unit_price ?? ""}
                                      onChange={(e) =>
                                        handleItemChange(item.tempId, "unit_price", e.target.value)
                                      }
                                      className="w-full text-right font-semibold h-8 pl-5 text-xs bg-background border-input focus-visible:ring-1 shadow-2xs"
                                    />
                                  </div>
                                  {item.isPriceFromCatalog && (
                                    <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-semibold mt-0.5 tracking-tight">
                                      ★ Catalog Rate
                                    </span>
                                  )}
                                </div>
                              </TableCell>

                              {/* Amount */}
                              <TableCell className="w-32 py-2.5 text-right font-bold text-foreground text-xs align-middle pr-2">
                                {formatINR(
                                  item.line_total ??
                                  (item.quantity || 0) * (item.unit_price || 0)
                                )}
                              </TableCell>

                              {/* Action Delete */}
                              <TableCell className="w-10 py-2.5 text-center align-middle">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-xs"
                                  onClick={() => handleDeleteItem(item.tempId)}
                                  className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 size-7 mx-auto"
                                  title="Remove item row"
                                >
                                  <Trash2 className="size-3.5" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      ) : (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center py-10 text-muted-foreground">
                            <p className="text-xs font-medium">No line items in this order.</p>
                            <Button
                              variant="link"
                              size="sm"
                              onClick={handleAddLineItem}
                              className="text-xs mt-1"
                            >
                              + Add the first line item
                            </Button>
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>

                {/* Table Footer with Pagination */}
                <CardFooter className="flex flex-col sm:flex-row items-center justify-between border-t border-slate-100 dark:border-slate-800 bg-muted/20 px-5 py-2.5 gap-3">
                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground font-medium">
                    <span>
                      Showing <strong className="text-foreground">{totalItems > 0 ? startIndex + 1 : 0}–{endIndex}</strong> of <strong className="text-foreground">{totalItems}</strong> items
                    </span>
                    <span>•</span>
                    <span>
                      Total Quantity: <strong className="text-foreground">{totalUnits} pcs</strong>
                    </span>
                  </div>

                  {totalPages > 1 && (
                    <div className="flex items-center gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        disabled={safePage <= 1}
                        className="h-7 px-2 text-xs font-semibold"
                      >
                        <ChevronLeft className="size-3 mr-0.5" />
                        Prev
                      </Button>
                      <span className="text-[11px] font-semibold text-muted-foreground px-1">
                        {safePage} / {totalPages}
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        disabled={safePage >= totalPages}
                        className="h-7 px-2 text-xs font-semibold"
                      >
                        Next
                        <ChevronRight className="size-3 ml-0.5" />
                      </Button>
                    </div>
                  )}
                </CardFooter>
              </Card>

              {/* 3. Shipping Terms & Financial Summary */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
                {/* Left Card: Dispatch Terms & Shipping Address */}
                <Card className="border border-slate-200 dark:border-slate-800 shadow-xs h-full bg-card p-4 flex flex-col justify-between space-y-3">
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="size-6 rounded-md bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-300 flex items-center justify-center border border-blue-100 dark:border-blue-900 shrink-0">
                          <Truck className="size-3" />
                        </div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          Shipping & Dispatch Details
                        </span>
                      </div>
                      <Badge variant="secondary" className="text-[9px] h-4.5 px-1.5 font-medium">
                        Standard
                      </Badge>
                    </div>

                    <div className="space-y-2.5">
                      <div className="space-y-1">
                        <label className="text-[11px] font-semibold text-foreground">
                          Dispatch Terms / Delivery Notes:
                        </label>
                        <Input
                          type="text"
                          value={draft.extracted.terms || ""}
                          onChange={(e) => handleTermsChange(e.target.value)}
                          placeholder="Standard dispatch terms apply..."
                          className="h-8 text-xs bg-background"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11px] font-semibold text-foreground">
                          Delivery Shipping Address:
                        </label>
                        <Input
                          type="text"
                          value={draft.extracted.customer?.address || ""}
                          onChange={(e) => handleAddressChange(e.target.value)}
                          placeholder="Enter destination delivery address..."
                          className="h-8 text-xs bg-background"
                        />
                      </div>
                    </div>
                  </div>

                  <p className="text-[10px] text-muted-foreground pt-2 border-t border-slate-100 dark:border-slate-800">
                    Confirmed orders generate warehouse dispatch packing slips automatically.
                  </p>
                </Card>

                {/* Right Card: Financial Breakdown & Grand Total */}
                <Card className="border border-slate-200 dark:border-slate-800 shadow-xs h-full bg-card p-4 flex flex-col justify-between space-y-3">
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="size-6 rounded-md bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-300 flex items-center justify-center border border-emerald-100 dark:border-emerald-900 shrink-0 font-bold text-xs">
                          ₹
                        </div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
                          Order Financial Summary
                        </span>
                      </div>
                      <Badge variant="outline" className="font-mono text-[9px] h-4.5 px-1.5 font-medium border-slate-300 dark:border-slate-700">
                        INR (₹)
                      </Badge>
                    </div>

                    <div className="space-y-2.5 text-xs">
                      {/* Subtotal */}
                      <div className="flex justify-between items-center text-muted-foreground">
                        <span className="text-xs font-medium">Subtotal ({draft.lineItems.length} lines, {totalUnits} pcs)</span>
                        <span className="font-bold text-foreground text-sm">
                          {formatINR(draft.totals.subtotal)}
                        </span>
                      </div>

                      {/* Discount */}
                      <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center">
                        <label className="text-xs font-medium text-foreground flex items-center gap-1">
                          <span>Institutional Discount</span>
                          {draft.totals.discount > 0 && (
                            <span className="text-emerald-600 font-bold text-[10px]">
                              (-{formatINR(draft.totals.discount)})
                            </span>
                          )}
                        </label>
                        <div className="relative inline-flex items-center justify-end w-24">
                          <span className="absolute left-2 text-muted-foreground text-xs font-bold select-none pointer-events-none">
                            ₹
                          </span>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={draft.totals.discount || ""}
                            placeholder="0.00"
                            onChange={(e) => handleDiscountChange(e.target.value)}
                            className="w-full text-right font-semibold h-7 pl-5 text-xs bg-background border-input shadow-2xs"
                          />
                        </div>
                      </div>

                      {/* Tax / GST */}
                      <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1">
                        <div className="flex justify-between items-center">
                          <label className="text-xs font-medium text-foreground flex items-center gap-1">
                            <span>Tax / GST</span>
                            {draft.totals.tax > 0 && (
                              <span className="text-primary font-bold text-[10px]">
                                (+{formatINR(draft.totals.tax)})
                              </span>
                            )}
                          </label>
                          <div className="relative inline-flex items-center justify-end w-24">
                            <span className="absolute left-2 text-muted-foreground text-xs font-bold select-none pointer-events-none">
                              ₹
                            </span>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              value={draft.totals.tax || ""}
                              placeholder="0.00"
                              onChange={(e) => handleTaxChange(e.target.value)}
                              className="w-full text-right font-semibold h-7 pl-5 text-xs bg-background border-input shadow-2xs"
                            />
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-1 text-[10px] text-muted-foreground">
                          <span>GST Presets:</span>
                          <div className="flex items-center gap-1">
                            {[0, 5, 12, 18].map((rate) => (
                              <button
                                key={rate}
                                type="button"
                                onClick={() => handleTaxPreset(rate)}
                                className="px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-background hover:bg-muted text-[10px] font-medium transition cursor-pointer"
                              >
                                {rate}%
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Grand Total Box */}
                  <div className="rounded-xl bg-blue-600 dark:bg-blue-700 text-white p-3 flex justify-between items-center shadow-xs">
                    <div>
                      <span className="text-xs font-bold block uppercase tracking-wide opacity-90">Grand Total</span>
                      <span className="text-[10px] opacity-75">Subtotal - Discount + Tax</span>
                    </div>
                    <span className="text-xl sm:text-2xl font-black tracking-tight">
                      {formatINR(draft.totals.total)}
                    </span>
                  </div>
                </Card>
              </div>

              {/* 4. Bottom Sticky Summary Bar */}
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-card p-4 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <ShieldCheck className="size-4 text-emerald-600 shrink-0" />
                  <span>
                    Operator review verified. StockOS prevents duplicate ERP records and ensures catalog alignment.
                  </span>
                </div>

                <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleSaveDraftClick}
                    disabled={isSaving || isSavingDraft || isRejecting}
                    className="h-8.5 text-xs font-semibold cursor-pointer border-slate-300 dark:border-slate-700"
                  >
                    Save as Draft
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleConfirmClick}
                    disabled={isSaving || isSavingDraft || isRejecting}
                    className="h-8.5 px-5 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-xs cursor-pointer gap-1.5"
                  >
                    {draft.isAlreadyConfirmed || draft.duplicateOrderId ? (
                      <>
                        <Check className="size-4" />
                        <span>Update Order</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="size-4" />
                        <span>Approve & Confirm Sales Order</span>
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ========================================================
          MODALS & OVERLAYS
      ======================================================== */}
      {/* 1. Missing Items Insertion Modal */}
      <MissingItemsModal
        isOpen={missingItemsModal.isOpen}
        items={missingItemsModal.items}
        title={
          missingItemsModal.items.length === 1
            ? "Item Not Found in Items Table"
            : `${missingItemsModal.items.length} Items Not in Items Table`
        }
        actionButtonLabel={
          missingItemsModal.mode === "all_confirm"
            ? "Yes, Insert into Items & Save Order"
            : "Yes, Insert into Items Table"
        }
        onConfirm={handleModalInserted}
        onCancel={() =>
          setMissingItemsModal({ isOpen: false, items: [], mode: "single" })
        }
        onSkip={() => {
          const wasConfirmMode = missingItemsModal.mode === "all_confirm";
          setMissingItemsModal({ isOpen: false, items: [], mode: "single" });
          if (wasConfirmMode) {
            setIsConfirmModalOpen(true);
          }
        }}
      />

      {/* 2. Confirm Pre-Save Verification Dialog */}
      <ConfirmDialog
        isOpen={isConfirmModalOpen}
        draft={draft}
        isSaving={isSaving}
        onConfirm={async () => {
          if (isSaving) return;
          setIsConfirmModalOpen(false);
          await executeSaveOrder(draft);
        }}
        onCancel={() => setIsConfirmModalOpen(false)}
      />

      {/* 3. Order Confirmed Success Modal */}
      <OrderConfirmedModal
        isOpen={!!savedOrderResult}
        orderNumber={savedOrderResult?.orderNumber || ""}
        orderId={savedOrderResult?.orderId || ""}
        status={savedOrderResult?.status || "Confirmed"}
        customerName={savedOrderResult?.customerName}
        totalAmount={savedOrderResult?.totalAmount || 0}
        subtotal={savedOrderResult?.subtotal}
        discount={savedOrderResult?.discount}
        tax={savedOrderResult?.tax}
        itemCount={savedOrderResult?.itemCount || 0}
        totalUnits={savedOrderResult?.totalUnits}
        isUpdate={savedOrderResult?.isUpdate}
        sourceType={draft.sourceType}
        onClose={() => setSavedOrderResult(null)}
      />

      {/* 4. Reject Non-Order Confirmation Modal */}
      <RejectConfirmModal
        isOpen={isRejectModalOpen}
        poNumber={poReference}
        customerName={draft.extracted.customer?.name}
        isRejecting={isRejecting}
        onConfirm={handleRejectConfirm}
        onCancel={() => setIsRejectModalOpen(false)}
      />
    </main>
  );
}

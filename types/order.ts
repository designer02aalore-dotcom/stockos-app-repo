export interface PartialMatchCandidate {
  id: string;
  name: string;
  code?: string | null;
  price?: number | null;
  unit?: string | null;
  confidence: number;
  reason?: string;
}

export interface ExtractedLineItem {
  sku?: string;
  description?: string;
  quantity?: number | string | null;
  unit_price?: number | null;
  line_total?: number | null;
  confidence?: number;
  matchedItemId?: string | null;
  matchedItemCode?: string | null;
  matchedItemName?: string | null;
  catalogPrice?: number | null;
  matched?: boolean;
  partialMatches?: PartialMatchCandidate[];
  tempId?: string;
}

export interface ExtractedOrder {
  customer?: {
    name?: string;
    phone?: string;
    email?: string;
    address?: string;
  };
  po_number?: string;
  order_date?: string;
  delivery_date?: string;
  items: ExtractedLineItem[];
  totals?: {
    subtotal?: number;
    tax?: number;
    total?: number;
  };
  terms?: string;
}

export interface DraftLineItem extends ExtractedLineItem {
  tempId: string;
  description: string;
  sku?: string;
  matchedItemId?: string | null;
  matchedItemCode?: string | null;
  matchedItemName?: string | null;
  catalogPrice?: number;
  isPriceFromCatalog?: boolean;
  quantity: number | null;
  unit_price: number;
  line_total: number | null;
  confidence: number;
  partialMatches: PartialMatchCandidate[];
  matched?: boolean;
}

export interface DraftOrder {
  importId: string;
  sourceType: "image" | "email";
  sourceReference?: string | null;
  imageUrl?: string | null;
  extracted: ExtractedOrder;
  matchedCustomerId?: string;
  customerConfidence?: number;
  lineItems: DraftLineItem[];
  totals: {
    subtotal: number;
    tax: number;
    total: number;
  };
  isAlreadyConfirmed?: boolean;
  existingOrderNumber?: string | null;
  duplicateWarning?: string | null;
  duplicateOrderId?: string | null;
  duplicateOrderNumber?: string | null;
}

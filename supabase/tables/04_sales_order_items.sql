-- ============================================================================
-- Table 4: sales_order_items (New Table - Order Line Items)
-- ============================================================================
-- Purpose: Stores the individual products, quantities, rates, and line totals.
-- Relationships:
--   • sales_order.id (1) ──< sales_order_items.sales_order_id (N)
--   • items.id       (1) ──< sales_order_items.item_id        (N)

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.sales_order_items (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sales_order_id          UUID NOT NULL REFERENCES public.sales_order(id) ON DELETE CASCADE,
    item_id                 UUID REFERENCES public.items(id) ON DELETE RESTRICT,
    quantity                NUMERIC(12, 2) NOT NULL DEFAULT 1.00 CHECK (quantity >= 0),
    unit_price              NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    discount                NUMERIC(12, 2) DEFAULT 0.00,
    tax                     NUMERIC(12, 2) DEFAULT 0.00,
    line_total              NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    created_at              TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for foreign key lookups & order calculation performance
CREATE INDEX IF NOT EXISTS idx_so_items_order_id ON public.sales_order_items (sales_order_id);
CREATE INDEX IF NOT EXISTS idx_so_items_item_id ON public.sales_order_items (item_id);

COMMENT ON TABLE public.sales_order_items IS 'Line items table storing individual products and quantities for each sales order.';
COMMENT ON COLUMN public.sales_order_items.id IS 'Unique line item ID (Primary Key).';
COMMENT ON COLUMN public.sales_order_items.sales_order_id IS 'Foreign key referencing sales_order.id (Cascades on delete).';
COMMENT ON COLUMN public.sales_order_items.item_id IS 'Foreign key referencing items.id in the product catalog.';
COMMENT ON COLUMN public.sales_order_items.quantity IS 'Quantity ordered (must be >= 0; never defaulted blindly).';
COMMENT ON COLUMN public.sales_order_items.unit_price IS 'Effective rate/price at time of order creation.';
COMMENT ON COLUMN public.sales_order_items.line_total IS 'Final amount for this line: (quantity * unit_price).';

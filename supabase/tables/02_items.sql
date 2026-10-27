-- ============================================================================
-- Table 2: items (Existing Foundation)
-- ============================================================================
-- Purpose: Stores inventory items, product codes, barcodes, descriptions, and catalog rates.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.items (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id              UUID,
    name                    VARCHAR(255) NOT NULL,
    code                    VARCHAR(100),
    barcode                 VARCHAR(100),
    descriptions            TEXT,
    unit                    VARCHAR(50) DEFAULT 'PCS',
    price                   NUMERIC(12, 2) DEFAULT 0.00,
    weight                  NUMERIC(10, 2),
    is_deleted              BOOLEAN DEFAULT false,
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    updated_at              TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance & matching
CREATE INDEX IF NOT EXISTS idx_items_name ON public.items (name);
CREATE INDEX IF NOT EXISTS idx_items_code ON public.items (code);
CREATE INDEX IF NOT EXISTS idx_items_barcode ON public.items (barcode);
CREATE INDEX IF NOT EXISTS idx_items_deleted ON public.items (is_deleted);

COMMENT ON TABLE public.items IS 'Inventory item master table storing products, SKUs, and default catalog rates.';
COMMENT ON COLUMN public.items.id IS 'Unique item ID (Primary Key).';
COMMENT ON COLUMN public.items.name IS 'Product name used for AI title & description matching.';
COMMENT ON COLUMN public.items.code IS 'SKU / Item code used for exact product matching.';
COMMENT ON COLUMN public.items.price IS 'Standard unit price auto-populated if document omits rate.';
COMMENT ON COLUMN public.items.unit IS 'Unit of measurement (e.g., PCS, BOX, SET).';
COMMENT ON COLUMN public.items.is_deleted IS 'Soft-delete flag to filter out inactive inventory.';

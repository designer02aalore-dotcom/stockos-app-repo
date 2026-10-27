-- ============================================================================
-- Table 5: order_imports (New Table - AI Intake & Staging)
-- ============================================================================
-- Purpose: Tracks raw orders extracted from uploaded images and incoming emails.
-- Relationships:
--   • customers.customer_id (1) ──< order_imports.customer_id (N, optional)
--   • sales_order.id        (1) ──< order_imports.sales_order_id (0..1)

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.order_imports (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_type             TEXT NOT NULL CHECK (source_type IN ('image', 'email', 'manual')),
    source_reference        TEXT, -- File path in order-uploads bucket or Gmail message ID
    customer_id             UUID REFERENCES public.customers(customer_id) ON DELETE SET NULL,
    extracted_data          JSONB NOT NULL DEFAULT '{}'::jsonb, -- Raw AI-extracted payload (Zod schema)
    processing_status       TEXT NOT NULL DEFAULT 'pending' 
                            CHECK (processing_status IN ('pending', 'review', 'confirmed', 'rejected', 'failed')),
    sales_order_id          UUID REFERENCES public.sales_order(id) ON DELETE SET NULL,
    error_message           TEXT,
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    updated_at              TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for status filtering, deduplication, and relationship lookups
CREATE INDEX IF NOT EXISTS idx_order_imports_status ON public.order_imports (processing_status);
CREATE INDEX IF NOT EXISTS idx_order_imports_source ON public.order_imports (source_type, source_reference);
CREATE INDEX IF NOT EXISTS idx_order_imports_sales_order ON public.order_imports (sales_order_id);
CREATE INDEX IF NOT EXISTS idx_order_imports_customer ON public.order_imports (customer_id);
CREATE INDEX IF NOT EXISTS idx_order_imports_created_at ON public.order_imports (created_at DESC);

COMMENT ON TABLE public.order_imports IS 'Intake staging table tracking AI extractions from uploaded images and incoming emails.';
COMMENT ON COLUMN public.order_imports.id IS 'Unique import intake record ID (Primary Key).';
COMMENT ON COLUMN public.order_imports.source_type IS 'Intake channel: image, email, or manual.';
COMMENT ON COLUMN public.order_imports.source_reference IS 'Storage file path or Gmail message ID used for deduplication.';
COMMENT ON COLUMN public.order_imports.customer_id IS 'Matched customer ID in customers table (nullable until matched).';
COMMENT ON COLUMN public.order_imports.extracted_data IS 'Complete structured JSON extracted by OCR/LLM.';
COMMENT ON COLUMN public.order_imports.processing_status IS 'Lifecycle stage: pending -> review -> confirmed/rejected/failed.';
COMMENT ON COLUMN public.order_imports.sales_order_id IS 'Foreign key linking to created sales_order.id once user confirms.';

-- ============================================================================
-- Table 1: customers (Existing Foundation)
-- ============================================================================
-- Purpose: Stores customer master records, codes, contact mobile, and billing info.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.customers (
    customer_id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id              UUID,
    name                    VARCHAR(255) NOT NULL,
    code                    VARCHAR(50),
    contact_person_name     VARCHAR(255),
    contact_person_mobile   VARCHAR(20),
    email                   VARCHAR(255),
    billing_address_line    VARCHAR(500),
    billing_city            VARCHAR(100),
    billing_state           VARCHAR(100),
    billing_pincode         VARCHAR(10),
    shipping_addresses      JSONB DEFAULT '[]'::jsonb,
    is_deleted              BOOLEAN DEFAULT false,
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    updated_at              TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance & matching
CREATE INDEX IF NOT EXISTS idx_customers_name ON public.customers (name);
CREATE INDEX IF NOT EXISTS idx_customers_code ON public.customers (code);
CREATE INDEX IF NOT EXISTS idx_customers_mobile ON public.customers (contact_person_mobile);
CREATE INDEX IF NOT EXISTS idx_customers_deleted ON public.customers (is_deleted);

COMMENT ON TABLE public.customers IS 'Customer master table storing contact, code, and address data.';
COMMENT ON COLUMN public.customers.customer_id IS 'Unique customer ID (Primary Key).';
COMMENT ON COLUMN public.customers.name IS 'Official business/customer name used in AI fuzzy matching.';
COMMENT ON COLUMN public.customers.code IS 'Unique customer reference code.';
COMMENT ON COLUMN public.customers.contact_person_mobile IS 'Phone number used for AI customer matching.';
COMMENT ON COLUMN public.customers.is_deleted IS 'Soft-delete flag to filter out deleted customers.';

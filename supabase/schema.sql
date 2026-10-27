-- ============================================================================
-- StockOS Sales Orders - Database Schema & Table Structure
-- ============================================================================
-- Description: Complete DDL definition for the 5 core tables and their 
--              relationships according to the StockOS specification.
--
-- 1. customers         (Existing) - Customer profiles, mobile, billing info
-- 2. items             (Existing) - Inventory products, codes, default rates
-- 3. sales_order       (Existing) - Confirmed order header, dates, & totals
-- 4. sales_order_items (New)      - Order line items linked to order & items
-- 5. order_imports     (New)      - Staging table for AI image & email intake
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- Table 1: customers (Existing Foundation)
-- ============================================================================
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

-- Indexes for customers
CREATE INDEX IF NOT EXISTS idx_customers_name ON public.customers (name);
CREATE INDEX IF NOT EXISTS idx_customers_code ON public.customers (code);
CREATE INDEX IF NOT EXISTS idx_customers_mobile ON public.customers (contact_person_mobile);
CREATE INDEX IF NOT EXISTS idx_customers_deleted ON public.customers (is_deleted);

-- ============================================================================
-- Table 2: items (Existing Foundation)
-- ============================================================================
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

-- Indexes for items
CREATE INDEX IF NOT EXISTS idx_items_name ON public.items (name);
CREATE INDEX IF NOT EXISTS idx_items_code ON public.items (code);
CREATE INDEX IF NOT EXISTS idx_items_deleted ON public.items (is_deleted);

-- ============================================================================
-- Table 3: sales_order (Existing Foundation)
-- Relationship: customers.customer_id (1) ──< sales_order.customer_id (N)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.sales_order (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id              UUID,
    order_number            VARCHAR(50) NOT NULL UNIQUE,
    customer_id             UUID REFERENCES public.customers(customer_id) ON DELETE SET NULL,
    order_date              DATE DEFAULT CURRENT_DATE,
    delivery_date           DATE,
    status                  VARCHAR(50) DEFAULT 'confirmed', -- 'draft', 'confirmed', 'cancelled'
    sale_person_id          UUID,
    warehouse_id            UUID,
    
    -- Billing & Shipping Details
    billing_address_line    VARCHAR(500),
    billing_city            VARCHAR(100),
    billing_state           VARCHAR(100),
    billing_pincode         VARCHAR(10),
    shipping_address_line   VARCHAR(500),
    shipping_city           VARCHAR(100),
    shipping_state          VARCHAR(100),
    shipping_pincode        VARCHAR(10),
    
    -- Financial Totals
    subtotal                NUMERIC(12, 2) DEFAULT 0.00,
    discount                NUMERIC(12, 2) DEFAULT 0.00,
    tax                     NUMERIC(12, 2) DEFAULT 0.00,
    total                   NUMERIC(12, 2) DEFAULT 0.00,
    
    -- Notes & Timestamps
    notes                   TEXT,
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    updated_at              TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for sales_order
CREATE INDEX IF NOT EXISTS idx_sales_order_number ON public.sales_order (order_number);
CREATE INDEX IF NOT EXISTS idx_sales_order_customer ON public.sales_order (customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_order_status ON public.sales_order (status);
CREATE INDEX IF NOT EXISTS idx_sales_order_date ON public.sales_order (order_date);

-- ============================================================================
-- Table 4: sales_order_items (New Table - Line Items)
-- Relationships:
--   • sales_order.id (1) ──< sales_order_items.sales_order_id (N)
--   • items.id       (1) ──< sales_order_items.item_id        (N)
-- ============================================================================
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

-- Indexes for sales_order_items
CREATE INDEX IF NOT EXISTS idx_so_items_order_id ON public.sales_order_items (sales_order_id);
CREATE INDEX IF NOT EXISTS idx_so_items_item_id ON public.sales_order_items (item_id);

-- ============================================================================
-- Table 5: order_imports (New Table - Intake & Staging)
-- Relationships:
--   • customers.customer_id (1) ──< order_imports.customer_id (N, optional)
--   • sales_order.id        (1) ──< order_imports.sales_order_id (0..1)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.order_imports (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_type             TEXT NOT NULL CHECK (source_type IN ('image', 'email', 'manual')),
    source_reference        TEXT, -- Storage file path (image) or Gmail message ID (email)
    customer_id             UUID REFERENCES public.customers(customer_id) ON DELETE SET NULL,
    extracted_data          JSONB NOT NULL DEFAULT '{}'::jsonb, -- AI-extracted payload
    processing_status       TEXT NOT NULL DEFAULT 'pending' 
                            CHECK (processing_status IN ('pending', 'review', 'confirmed', 'rejected', 'failed')),
    sales_order_id          UUID REFERENCES public.sales_order(id) ON DELETE SET NULL,
    error_message           TEXT,
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    updated_at              TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for order_imports
CREATE INDEX IF NOT EXISTS idx_order_imports_status ON public.order_imports (processing_status);
CREATE INDEX IF NOT EXISTS idx_order_imports_source ON public.order_imports (source_type, source_reference);
CREATE INDEX IF NOT EXISTS idx_order_imports_sales_order ON public.order_imports (sales_order_id);
CREATE INDEX IF NOT EXISTS idx_order_imports_customer ON public.order_imports (customer_id);

-- ============================================================================
-- Comments for Documentation & Studio Schema Viewer
-- ============================================================================
COMMENT ON TABLE public.customers IS 'Customer master table storing contact, code, and address data.';
COMMENT ON TABLE public.items IS 'Inventory item master table storing products, SKUs, and default catalog rates.';
COMMENT ON TABLE public.sales_order IS 'Header table storing confirmed orders, delivery dates, and financial totals.';
COMMENT ON TABLE public.sales_order_items IS 'Line items table storing quantities, unit rates, and totals for each order.';
COMMENT ON TABLE public.order_imports IS 'Intake staging table tracking AI extractions from uploaded images and incoming emails.';

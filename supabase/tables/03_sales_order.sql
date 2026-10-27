-- ============================================================================
-- Table 3: sales_order (Existing Foundation)
-- ============================================================================
-- Purpose: Stores confirmed sales order headers, dates, addresses, and financial totals.
-- Relationship: customers.customer_id (1) ──< sales_order.customer_id (N)

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

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
    
    -- Billing Address & Contact
    billing_address_line    VARCHAR(500),
    billing_city            VARCHAR(100),
    billing_state           VARCHAR(100),
    billing_pincode         VARCHAR(10),
    
    -- Shipping Address & Contact
    shipping_address_line   VARCHAR(500),
    shipping_city           VARCHAR(100),
    shipping_state          VARCHAR(100),
    shipping_pincode        VARCHAR(10),
    
    -- Financial Totals (Computed on Server)
    subtotal                NUMERIC(12, 2) DEFAULT 0.00,
    discount                NUMERIC(12, 2) DEFAULT 0.00,
    tax                     NUMERIC(12, 2) DEFAULT 0.00,
    total                   NUMERIC(12, 2) DEFAULT 0.00,
    
    -- Dispatch Terms & Notes
    notes                   TEXT,
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    updated_at              TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance & query lookups
CREATE INDEX IF NOT EXISTS idx_sales_order_number ON public.sales_order (order_number);
CREATE INDEX IF NOT EXISTS idx_sales_order_customer ON public.sales_order (customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_order_status ON public.sales_order (status);
CREATE INDEX IF NOT EXISTS idx_sales_order_date ON public.sales_order (order_date);
CREATE INDEX IF NOT EXISTS idx_sales_order_created_at ON public.sales_order (created_at DESC);

COMMENT ON TABLE public.sales_order IS 'Header table storing confirmed orders, delivery dates, and financial totals.';
COMMENT ON COLUMN public.sales_order.id IS 'Unique sales order ID (Primary Key).';
COMMENT ON COLUMN public.sales_order.order_number IS 'Unique reference/PO number (e.g. SO-20261015-01).';
COMMENT ON COLUMN public.sales_order.customer_id IS 'Foreign key referencing customers.customer_id.';
COMMENT ON COLUMN public.sales_order.status IS 'Order state: confirmed, draft, or cancelled.';
COMMENT ON COLUMN public.sales_order.subtotal IS 'Sum of all line items before discounts and taxes.';
COMMENT ON COLUMN public.sales_order.total IS 'Final payable amount: (subtotal - discount + tax).';

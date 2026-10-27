# StockOS Sales Order AI (TanStack Start)

A full-stack application built with **TanStack Start** (`@tanstack/react-start`), **TanStack Router**, Vite, Tailwind CSS v4, and Supabase. It automatically converts purchase orders from scanned documents, invoice images, and incoming emails into validated sales orders with AI OCR extraction, catalog item matching, and a confirm-before-save workflow.

## Framework Architecture

- **Framework**: [TanStack Start](https://tanstack.com/start) (`@tanstack/react-start`)
- **Routing**: [TanStack Router](https://tanstack.com/router) (`@tanstack/react-router`) with type-safe file routes in `src/routes/`
- **Build Tool**: Vite 6 with `@tanstack/react-start/plugin/vite` and `@tailwindcss/vite`
- **Backend / Database**: Supabase (`stockos_sales_orders_db`)
- **AI Extraction**: Multi-model vision pipeline (Groq llama-3.3-70b / gpt-oss-120b + Google Gemini Flash + Tesseract OCR)
- **Email Sync**: Google Gmail API OAuth integration with automated duplicate order prevention

## Getting Started

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Features

1. **AI Vision Extraction**: Upload invoice images or handwritten purchase orders to automatically extract vendor, customer, line items, and quantities.
2. **Email Order Scanner**: Connect your Gmail inbox to automatically detect purchase orders, deduplicate existing message IDs, and convert them to draft sales orders.
3. **Smart Catalog Matching**: Match raw extracted line items to catalog inventory codes with automated fuzzy matching and manual item creation modals.
4. **Confirm Before Saving**: Comprehensive verification modal before writing confirmed orders to the Supabase database.
5. **Atomic Database Transactions**: Saves order headers and line items together inside a single database transaction (`supabase/migrations/save_sales_order_transaction.sql`) with automated rollback compensation, preventing orphaned records or partial writes.

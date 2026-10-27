-- Migration: save_sales_order_transaction
-- Description: Saves order header, line items, and import status together in a single atomic database transaction.
-- If any part of the insert fails, PostgreSQL automatically rolls back the entire transaction.

CREATE OR REPLACE FUNCTION save_sales_order_transaction(
  p_order JSONB,
  p_items JSONB,
  p_import_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order_id UUID;
  v_order_number TEXT;
  v_item JSONB;
  v_existing_id UUID := NULL;
  v_customer_id UUID := NULL;
  v_target_order_number TEXT;
BEGIN
  -- Parse customer_id safely
  IF (p_order->>'customer_id') IS NOT NULL AND (p_order->>'customer_id') != '' THEN
    BEGIN
      v_customer_id := (p_order->>'customer_id')::UUID;
    EXCEPTION WHEN OTHERS THEN
      v_customer_id := NULL;
    END;
  END IF;

  -- 1. Check if an existing order matches by id or order_number
  IF (p_order->>'id') IS NOT NULL AND (p_order->>'id') != '' THEN
    BEGIN
      SELECT id, order_number INTO v_existing_id, v_order_number
      FROM sales_order
      WHERE id = (p_order->>'id')::UUID;
    EXCEPTION WHEN OTHERS THEN
      v_existing_id := NULL;
    END;
  END IF;

  v_target_order_number := COALESCE(NULLIF(TRIM(p_order->>'order_number'), ''), 'SO-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT), 1, 8)));

  IF v_existing_id IS NULL THEN
    SELECT id, order_number INTO v_existing_id, v_order_number
    FROM sales_order
    WHERE order_number = v_target_order_number;
  END IF;

  v_order_number := COALESCE(v_order_number, v_target_order_number);

  -- 2. Upsert Order Header atomically
  IF v_existing_id IS NOT NULL THEN
    UPDATE sales_order
    SET
      customer_id = v_customer_id,
      order_number = v_order_number,
      order_date = COALESCE((p_order->>'order_date')::DATE, CURRENT_DATE),
      delivery_date = NULLIF(p_order->>'delivery_date', '')::DATE,
      status = COALESCE(p_order->>'status', 'confirmed'),
      subtotal = COALESCE((p_order->>'subtotal')::NUMERIC, 0),
      discount = COALESCE((p_order->>'discount')::NUMERIC, 0),
      tax = COALESCE((p_order->>'tax')::NUMERIC, 0),
      total = COALESCE((p_order->>'total')::NUMERIC, 0),
      notes = p_order->>'notes',
      updated_at = NOW()
    WHERE id = v_existing_id
    RETURNING id, order_number INTO v_order_id, v_order_number;

    -- Clean existing line items to replace inside this transaction
    DELETE FROM sales_order_items WHERE sales_order_id = v_order_id;
  ELSE
    INSERT INTO sales_order (
      customer_id,
      order_number,
      order_date,
      delivery_date,
      status,
      subtotal,
      discount,
      tax,
      total,
      notes,
      created_at,
      updated_at
    ) VALUES (
      v_customer_id,
      v_order_number,
      COALESCE((p_order->>'order_date')::DATE, CURRENT_DATE),
      NULLIF(p_order->>'delivery_date', '')::DATE,
      COALESCE(p_order->>'status', 'confirmed'),
      COALESCE((p_order->>'subtotal')::NUMERIC, 0),
      COALESCE((p_order->>'discount')::NUMERIC, 0),
      COALESCE((p_order->>'tax')::NUMERIC, 0),
      COALESCE((p_order->>'total')::NUMERIC, 0),
      p_order->>'notes',
      NOW(),
      NOW()
    )
    RETURNING id, order_number INTO v_order_id, v_order_number;
  END IF;

  -- 3. Insert Line Items atomically within the same transaction
  IF p_items IS NOT NULL AND jsonb_array_length(p_items) > 0 THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
      DECLARE
        v_item_id UUID := NULL;
        v_qty NUMERIC := 0;
        v_price NUMERIC := 0;
        v_total NUMERIC := 0;
      BEGIN
        IF (v_item->>'item_id') IS NOT NULL AND (v_item->>'item_id') != '' THEN
          BEGIN
            v_item_id := (v_item->>'item_id')::UUID;
          EXCEPTION WHEN OTHERS THEN
            v_item_id := NULL;
          END;
        END IF;

        v_qty := COALESCE((v_item->>'quantity')::NUMERIC, 0);
        v_price := COALESCE((v_item->>'unit_price')::NUMERIC, 0);
        v_total := COALESCE((v_item->>'line_total')::NUMERIC, ROUND(v_qty * v_price, 2));

        INSERT INTO sales_order_items (
          sales_order_id,
          item_id,
          quantity,
          unit_price,
          line_total,
          created_at
        ) VALUES (
          v_order_id,
          v_item_id,
          v_qty,
          v_price,
          v_total,
          NOW()
        );
      END;
    END LOOP;
  END IF;

  -- 4. Update order_imports link if present
  IF p_import_id IS NOT NULL AND p_import_id != '' AND p_import_id != 'manual' THEN
    BEGIN
      UPDATE order_imports
      SET
        sales_order_id = v_order_id,
        customer_id = v_customer_id,
        processing_status = 'confirmed'
      WHERE id = p_import_id::UUID;
    EXCEPTION WHEN OTHERS THEN
      -- Ignore non-UUID import IDs
    END;
  END IF;

  -- Return successfully committed order
  RETURN jsonb_build_object(
    'id', v_order_id,
    'order_number', v_order_number,
    'success', true
  );

EXCEPTION
  WHEN OTHERS THEN
    -- Any failure inside this block automatically rolls back all operations
    RAISE EXCEPTION 'Database transaction failed: %', SQLERRM;
END;
$$;

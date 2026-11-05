-- Productos asociados a cada importacion
CREATE TABLE IF NOT EXISTS public.import_shipment_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id uuid NOT NULL REFERENCES public.import_shipments(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity numeric NOT NULL CHECK (quantity > 0),
  currency text NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD', 'NIO')),
  amount_original numeric NOT NULL CHECK (amount_original > 0),
  exchange_rate numeric NOT NULL DEFAULT 37.11 CHECK (exchange_rate > 0),
  inventory_registered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT import_item_nio_rate CHECK (currency <> 'NIO' OR exchange_rate = 1)
);

ALTER TABLE public.import_shipments
ADD COLUMN IF NOT EXISTS inventory_processed_at timestamptz;

ALTER TABLE public.import_shipment_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS import_shipment_items_admin_only
ON public.import_shipment_items;

CREATE POLICY import_shipment_items_admin_only
ON public.import_shipment_items
FOR ALL TO authenticated
USING (private.is_admin())
WITH CHECK (private.is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE
ON public.import_shipment_items TO authenticated;

-- Recibir una importacion e ingresar sus productos al inventario.
-- Cada linea se procesa una sola vez.
CREATE OR REPLACE FUNCTION public.receive_import_shipment(
  p_shipment_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_shipment public.import_shipments%ROWTYPE;
  v_item record;
  v_count integer := 0;
  v_unit_cost numeric;
BEGIN
  IF NOT private.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede recibir importaciones.';
  END IF;

  SELECT *
  INTO v_shipment
  FROM public.import_shipments
  WHERE id = p_shipment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se encontro la importacion.';
  END IF;

  IF v_shipment.status = 'cancelled' THEN
    RAISE EXCEPTION 'No se puede recibir una importacion cancelada.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.import_shipment_items
    WHERE shipment_id = p_shipment_id
  ) THEN
    RAISE EXCEPTION 'Agrega al menos un producto antes de recibir la importacion.';
  END IF;

  FOR v_item IN
    SELECT *
    FROM public.import_shipment_items
    WHERE shipment_id = p_shipment_id
      AND inventory_registered_at IS NULL
    ORDER BY created_at, id
    FOR UPDATE
  LOOP
    v_unit_cost :=
      (v_item.amount_original * v_item.exchange_rate) / v_item.quantity;

    PERFORM public.register_inventory_entry(
      v_item.product_id,
      v_item.quantity,
      'Importacion: ' || COALESCE(v_shipment.reference, v_shipment.id::text),
      v_unit_cost,
      v_shipment.supplier,
      v_item.currency,
      v_item.amount_original,
      v_item.exchange_rate,
      NULL,
      'other'
    );

    UPDATE public.import_shipment_items
    SET inventory_registered_at = now()
    WHERE id = v_item.id;

    v_count := v_count + 1;
  END LOOP;

  IF v_count = 0 AND v_shipment.inventory_processed_at IS NULL THEN
    RAISE EXCEPTION 'No hay productos pendientes de ingresar al inventario.';
  END IF;

  UPDATE public.import_shipments
  SET status = 'received',
      received_at = COALESCE(received_at, now()),
      inventory_processed_at = COALESCE(inventory_processed_at, now())
  WHERE id = p_shipment_id;

  UPDATE public.import_packages
  SET status = 'received',
      received_at = COALESCE(received_at, now())
  WHERE shipment_id = p_shipment_id;

  RETURN jsonb_build_object(
    'success', true,
    'products_registered', v_count,
    'message', 'Importacion recibida correctamente.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.receive_import_shipment(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.receive_import_shipment(uuid) TO authenticated;

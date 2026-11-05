begin;

-- Registra una comisión libre para una venta de vendedor dentro de la misma transacción.
create or replace function public.create_sale_with_commission(
  p_items jsonb,
  p_customer_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_sales_channel text,
  p_salesperson_id uuid,
  p_discount numeric,
  p_delivery_type text,
  p_delivery_address text,
  p_delivery_charge numeric,
  p_delivery_cost numeric,
  p_payment_amount numeric,
  p_payment_method public.payment_method,
  p_payment_reference text,
  p_notes text,
  p_payment_currency text,
  p_payment_amount_original numeric,
  p_payment_exchange_rate numeric,
  p_commission_amount numeric
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sale jsonb;
  v_sale_id uuid;
  v_sale_total numeric(14,2);
begin
  if auth.uid() is null or not private.is_admin() then
    raise exception 'Solo el administrador puede asignar la comisión de una venta.';
  end if;

  if p_sales_channel is distinct from 'seller' then
    raise exception 'La comisión personalizada solo aplica a ventas de vendedor.';
  end if;

  if p_commission_amount is null or p_commission_amount < 0 then
    raise exception 'Ingresa una comisión válida igual o mayor que cero.';
  end if;

  v_sale := public.create_sale(
    p_items,
    p_customer_id,
    p_customer_name,
    p_customer_phone,
    p_sales_channel,
    p_salesperson_id,
    p_discount,
    p_delivery_type,
    p_delivery_address,
    p_delivery_charge,
    p_delivery_cost,
    p_payment_amount,
    p_payment_method,
    p_payment_reference,
    p_notes,
    p_payment_currency,
    p_payment_amount_original,
    p_payment_exchange_rate
  );

  v_sale_id := (v_sale->>'sale_id')::uuid;
  v_sale_total := (v_sale->>'total')::numeric;

  if p_commission_amount > v_sale_total then
    raise exception 'La comisión no puede superar el total de la venta.';
  end if;

  update public.sales
     set commission_rate_snapshot = null,
         commission_amount = p_commission_amount,
         commission_status = 'pending'
   where id = v_sale_id;

  insert into public.audit_log (
    actor_id, action, table_name, record_id, details
  ) values (
    auth.uid(), 'set_sale_commission', 'sales', v_sale_id::text,
    jsonb_build_object(
      'salesperson_id', p_salesperson_id,
      'commission_amount', p_commission_amount,
      'currency', 'NIO'
    )
  );

  return v_sale || jsonb_build_object(
    'commission_amount', p_commission_amount,
    'commission_status', 'pending'
  );
end;
$$;

revoke all on function public.create_sale_with_commission(
  jsonb, uuid, text, text, text, uuid, numeric, text, text,
  numeric, numeric, numeric, public.payment_method, text, text,
  text, numeric, numeric, numeric
) from public, anon, authenticated;

grant execute on function public.create_sale_with_commission(
  jsonb, uuid, text, text, text, uuid, numeric, text, text,
  numeric, numeric, numeric, public.payment_method, text, text,
  text, numeric, numeric, numeric
) to authenticated;

commit;

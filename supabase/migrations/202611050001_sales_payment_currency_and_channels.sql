-- Keep sales ledgers in NIO while preserving the currency used by the customer.
alter table public.payments
  add column if not exists currency text not null default 'NIO',
  add column if not exists amount_original numeric(14,2),
  add column if not exists exchange_rate numeric(14,4) not null default 1;

update public.payments
set amount_original = amount
where amount_original is null;

alter table public.payments
  alter column amount_original set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname='payments_currency_valid' and conrelid='public.payments'::regclass) then
    alter table public.payments add constraint payments_currency_valid check (currency in ('USD','NIO'));
  end if;
  if not exists (select 1 from pg_constraint where conname='payments_exchange_rate_positive' and conrelid='public.payments'::regclass) then
    alter table public.payments add constraint payments_exchange_rate_positive check (exchange_rate > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname='payments_nio_rate' and conrelid='public.payments'::regclass) then
    alter table public.payments add constraint payments_nio_rate check (currency <> 'NIO' or exchange_rate = 1);
  end if;
end;
$$;

alter table public.sales drop constraint if exists sales_sales_channel_check;
alter table public.sales add constraint sales_sales_channel_check
  check (sales_channel in ('direct', 'seller', 'collective'));

-- Employees need the current conversion rate to record USD payments accurately.
create or replace function public.get_usd_nio_rate()
returns numeric
language sql stable security definer set search_path = ''
as $$ select usd_nio_rate from private.business_settings where id = true and private.is_active_user() $$;

-- Replace the UI wrapper so seller commission and foreign-currency payment
-- snapshots are written in the same transaction as the sale.
drop function if exists public.create_sale(
  jsonb, uuid, text, text, text, uuid, numeric, text, text,
  numeric, numeric, numeric, public.payment_method, text, text
);

create or replace function public.create_sale(
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
  p_payment_exchange_rate numeric
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_items jsonb;
  v_sale jsonb;
  v_sale_id uuid;
  v_base_total numeric(14,2);
  v_total numeric(14,2);
  v_charge numeric(14,2);
  v_cost numeric(14,2);
  v_paid_original numeric(14,2);
  v_rate numeric(14,4);
  v_payment_nio numeric(14,2);
  v_base_channel text;
begin
  if auth.uid() is null or not private.is_active_user() then raise exception 'Usuario no autorizado.'; end if;
  if p_sales_channel is null or p_sales_channel not in ('direct','seller','collective') then raise exception 'Canal de venta no válido.'; end if;
  if p_delivery_type is null or p_delivery_type not in ('none','colectivo','privado') then raise exception 'Tipo de entrega no válido.'; end if;
  if p_payment_currency is null or p_payment_currency not in ('USD','NIO') then raise exception 'Moneda de pago no válida.'; end if;
  v_paid_original := coalesce(p_payment_amount_original,0);
  v_rate := case when p_payment_currency = 'NIO' then 1 else coalesce(p_payment_exchange_rate,0) end;
  if v_paid_original < 0 or v_rate <= 0 then raise exception 'Revisa el monto y la tasa del pago.'; end if;
  if p_payment_currency = 'NIO' and coalesce(p_payment_exchange_rate,1) <> 1 then raise exception 'Un pago en córdobas debe usar tasa 1.'; end if;
  v_payment_nio := round(v_paid_original * v_rate,2);
  if abs(coalesce(p_payment_amount,0) - v_payment_nio) > 0.01 then raise exception 'El equivalente del pago no coincide con su moneda y tasa.'; end if;

  v_charge := case when p_delivery_type = 'none' then 0 else coalesce(p_delivery_charge,0) end;
  v_cost := case when p_delivery_type = 'none' then 0 else coalesce(p_delivery_cost,0) end;
  if v_charge < 0 or v_cost < 0 then raise exception 'Los importes de entrega no pueden ser negativos.'; end if;
  if p_delivery_type <> 'none' and nullif(trim(coalesce(p_delivery_address,'')),'') is null then raise exception 'La dirección de entrega es obligatoria.'; end if;

  select coalesce(jsonb_agg(case when value ? 'location_id' then value else value || jsonb_build_object('location_id','home') end),'[]'::jsonb)
    into v_items from jsonb_array_elements(coalesce(p_items,'[]'::jsonb));

  v_base_channel := case when p_sales_channel = 'collective' then 'collective' else 'direct' end;
  v_sale := public.create_sale(
    p_customer_id,p_customer_name,p_customer_phone,v_base_channel,
    p_salesperson_id,v_items,p_discount,0,p_payment_method,null,p_notes
  );
  v_sale_id := (v_sale->>'sale_id')::uuid;
  v_base_total := (v_sale->>'total')::numeric;
  v_total := round(v_base_total + v_charge,2);
  if v_payment_nio > v_total then raise exception 'El pago recibido no puede superar el total de la venta.'; end if;

  update public.sales set sales_channel=p_sales_channel,
    delivery_type=p_delivery_type,
    delivery_address=nullif(trim(coalesce(p_delivery_address,'')),''),
    delivery_charge=v_charge,delivery_cost=v_cost,total=v_total,
    commission_rate_snapshot=case when p_sales_channel='direct' then null else commission_rate_snapshot end,
    commission_amount=case when p_sales_channel='direct' then null else commission_amount end,
    commission_status=case when p_sales_channel='direct' then 'not_applicable' else commission_status end
  where id=v_sale_id;

  if v_paid_original > 0 then
    insert into public.payments(sale_id,amount,method,reference,received_by,notes,currency,amount_original,exchange_rate)
    values(v_sale_id,v_payment_nio,p_payment_method,p_payment_reference,auth.uid(),
      'Pago recibido al emitir la venta',p_payment_currency,v_paid_original,v_rate);
  end if;

  insert into public.audit_log(actor_id,action,table_name,record_id,details)
  values(auth.uid(),'set_sale_delivery','sales',v_sale_id::text,
    jsonb_build_object('delivery_type',p_delivery_type,'delivery_charge',v_charge,'delivery_cost',v_cost,'total',v_total,
      'payment_currency',p_payment_currency,'payment_amount_original',v_paid_original,'payment_exchange_rate',v_rate,
      'sales_channel',p_sales_channel));

  v_sale := jsonb_set(jsonb_set(v_sale,'{total}',to_jsonb(v_total)),'{delivery_charge}',to_jsonb(v_charge));
  v_sale := jsonb_set(v_sale,'{sales_channel}',to_jsonb(p_sales_channel));
  if p_sales_channel='direct' then
    v_sale := jsonb_set(v_sale,'{commission_status}',to_jsonb('not_applicable'::text));
  end if;
  return v_sale;
end;
$$;

revoke all on function public.create_sale(
  jsonb,uuid,text,text,text,uuid,numeric,text,text,numeric,numeric,numeric,
  public.payment_method,text,text,text,numeric,numeric
) from public, anon, authenticated;
grant execute on function public.create_sale(
  jsonb,uuid,text,text,text,uuid,numeric,text,text,numeric,numeric,numeric,
  public.payment_method,text,text,text,numeric,numeric
) to authenticated;

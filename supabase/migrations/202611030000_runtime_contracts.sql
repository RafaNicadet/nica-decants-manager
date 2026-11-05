begin;

-- Complete the schema contracts used by the current React client. This migration
-- is additive and can also run after an installation that created these objects
-- manually; it does not delete or rewrite transaction rows.

-- Inventory RPCs invoked by the UI and by import receiving.
create table if not exists private.product_purchase_history (
  id bigint generated always as identity primary key,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity numeric(14,3) not null check (quantity > 0),
  amount_original numeric(14,2),
  currency text not null default 'NIO' check (currency in ('USD', 'NIO')),
  exchange_rate numeric(14,4) not null default 1 check (exchange_rate > 0),
  unit_cost numeric(14,4) not null check (unit_cost >= 0),
  total_cost numeric(14,2) not null check (total_cost >= 0),
  supplier text,
  bank_name text,
  payment_method public.payment_method not null default 'other',
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint purchase_history_nio_rate check (currency <> 'NIO' or exchange_rate = 1)
);

alter table private.product_purchase_history enable row level security;
revoke all on private.product_purchase_history from anon, authenticated;
grant select on private.product_purchase_history to authenticated;
drop policy if exists product_purchase_history_admin_read on private.product_purchase_history;
create policy product_purchase_history_admin_read on private.product_purchase_history
  for select to authenticated using ((select private.is_admin()));

create or replace function public.register_inventory_entry(
  p_product_id uuid,
  p_quantity numeric,
  p_note text default null,
  p_unit_cost numeric default null,
  p_supplier text default null,
  p_currency text default 'NIO',
  p_amount_original numeric default null,
  p_exchange_rate numeric default 1,
  p_bank_name text default null,
  p_payment_method public.payment_method default 'other'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_product public.products%rowtype;
  v_old_cost numeric(14,4) := 0;
  v_new_cost numeric(14,4);
  v_new_stock numeric(14,3);
  v_total numeric(14,2);
begin
  if v_user is null or not private.is_admin() then
    raise exception 'Solo un administrador puede registrar entradas de inventario.';
  end if;
  if p_quantity is null or p_quantity <= 0 or p_unit_cost is null or p_unit_cost < 0 then
    raise exception 'La cantidad debe ser positiva y el costo no puede ser negativo.';
  end if;
  if p_currency not in ('USD', 'NIO') or p_exchange_rate is null or p_exchange_rate <= 0 then
    raise exception 'Moneda o tasa de cambio no válida.';
  end if;
  if p_currency = 'NIO' and p_exchange_rate <> 1 then
    raise exception 'Las compras en córdobas deben usar tasa 1.';
  end if;
  if p_amount_original is not null and p_amount_original < 0 then
    raise exception 'El importe original no puede ser negativo.';
  end if;

  select * into v_product from public.products
   where id = p_product_id and active for update;
  if not found then raise exception 'Producto no encontrado o inactivo.'; end if;

  select unit_cost into v_old_cost from private.product_costs where product_id = p_product_id;
  v_old_cost := coalesce(v_old_cost, 0);
  v_new_stock := v_product.stock_qty + p_quantity;
  v_new_cost := case when v_new_stock = 0 then p_unit_cost
    else round(((v_product.stock_qty * v_old_cost) + (p_quantity * p_unit_cost)) / v_new_stock, 4)
  end;
  v_total := round(p_quantity * p_unit_cost, 2);

  update public.products set stock_qty = v_new_stock, updated_at = now() where id = p_product_id;
  insert into private.product_costs(product_id, unit_cost, updated_at)
  values (p_product_id, v_new_cost, now())
  on conflict (product_id) do update set unit_cost = excluded.unit_cost, updated_at = now();
  insert into private.product_cost_history(product_id, unit_cost, source, note, created_by)
  values (p_product_id, v_new_cost, 'purchase', p_note, v_user);
  insert into public.inventory_movements(product_id, movement_kind, quantity_delta, unit_cost, note, created_by)
  values (p_product_id, 'purchase', p_quantity, p_unit_cost, coalesce(p_note, 'Entrada de inventario'), v_user);

  insert into public.inventory_location_stock(product_id, location_id, quantity)
  values (p_product_id, 'home', p_quantity)
  on conflict (product_id, location_id) do update
    set quantity = public.inventory_location_stock.quantity + excluded.quantity, updated_at = now();
  insert into public.inventory_location_movements(product_id, movement_kind, quantity, to_location_id, note, created_by)
  values (p_product_id, 'purchase', p_quantity, 'home', coalesce(p_note, 'Entrada de inventario'), v_user);

  insert into private.product_purchase_history(
    product_id, quantity, amount_original, currency, exchange_rate, unit_cost,
    total_cost, supplier, bank_name, payment_method, note, created_by
  ) values (
    p_product_id, p_quantity, p_amount_original, p_currency, p_exchange_rate,
    p_unit_cost, v_total, nullif(trim(coalesce(p_supplier, '')), ''),
    nullif(trim(coalesce(p_bank_name, '')), ''), coalesce(p_payment_method, 'other'), p_note, v_user
  );
  insert into public.audit_log(actor_id, action, table_name, record_id, details)
  values (v_user, 'register_inventory_entry', 'products', p_product_id::text,
    jsonb_build_object('quantity', p_quantity, 'unit_cost', p_unit_cost, 'currency', p_currency,
      'exchange_rate', p_exchange_rate, 'new_stock', v_new_stock));

  return jsonb_build_object('stock_qty', v_new_stock, 'unit_cost', v_new_cost,
    'purchase_total', v_total, 'previous_quantity', v_product.stock_qty);
end;
$$;

create or replace function public.adjust_inventory(
  p_product_id uuid, p_target_quantity numeric, p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_product public.products%rowtype;
  v_difference numeric(14,3);
begin
  if v_user is null or not private.is_admin() then
    raise exception 'Solo un administrador puede ajustar el inventario.';
  end if;
  if p_target_quantity is null or p_target_quantity < 0 then
    raise exception 'La existencia final no puede ser negativa.';
  end if;
  select * into v_product from public.products where id = p_product_id and active for update;
  if not found then raise exception 'Producto no encontrado o inactivo.'; end if;
  v_difference := p_target_quantity - v_product.stock_qty;
  update public.products set stock_qty = p_target_quantity, updated_at = now() where id = p_product_id;
  insert into public.inventory_location_stock(product_id, location_id, quantity)
  values (p_product_id, 'home', p_target_quantity)
  on conflict (product_id, location_id) do update set quantity = excluded.quantity, updated_at = now();
  if v_difference <> 0 then
    insert into public.inventory_movements(product_id, movement_kind, quantity_delta, note, created_by)
    values (p_product_id, 'adjustment', v_difference, coalesce(p_note, 'Ajuste por conteo físico'), v_user);
    insert into public.inventory_location_movements(
      product_id, movement_kind, quantity, from_location_id, to_location_id, note, created_by
    ) values (p_product_id, 'adjustment', abs(v_difference),
      case when v_difference < 0 then 'home' else null end,
      case when v_difference > 0 then 'home' else null end,
      coalesce(p_note, 'Ajuste por conteo físico'), v_user);
  end if;
  insert into public.audit_log(actor_id, action, table_name, record_id, details)
  values (v_user, 'adjust_inventory', 'products', p_product_id::text,
    jsonb_build_object('previous_quantity', v_product.stock_qty,
      'new_quantity', p_target_quantity, 'difference', v_difference, 'note', p_note));
  return jsonb_build_object('previous_quantity', v_product.stock_qty,
    'new_quantity', p_target_quantity, 'difference', v_difference);
end;
$$;

create or replace function public.get_product_costs_and_purchases()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_result jsonb;
begin
  if auth.uid() is null or not private.is_admin() then
    raise exception 'Solo un administrador puede consultar costos y compras.';
  end if;
  select jsonb_build_object(
    'products', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'stock_qty', p.stock_qty,
        'unit_cost', pc.unit_cost, 'last_purchase_cost', lastp.unit_cost,
        'last_supplier', lastp.supplier
      ) order by p.name)
      from public.products p
      left join private.product_costs pc on pc.product_id = p.id
      left join lateral (
        select h.unit_cost, h.supplier from private.product_purchase_history h
        where h.product_id = p.id order by h.created_at desc, h.id desc limit 1
      ) lastp on true
      where p.active
    ), '[]'::jsonb),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', h.id, 'created_at', h.created_at, 'product_id', h.product_id,
        'product_name', p.name, 'quantity', h.quantity,
        'amount_original', h.amount_original, 'currency', h.currency,
        'exchange_rate', h.exchange_rate, 'unit_cost', h.unit_cost,
        'total_cost', h.total_cost, 'supplier', h.supplier,
        'bank_name', h.bank_name, 'payment_method', h.payment_method, 'note', h.note
      ) order by h.created_at desc, h.id desc)
      from private.product_purchase_history h join public.products p on p.id = h.product_id
    ), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

-- Import ledger tables required by the UI and by the following receiving migration.
create table if not exists public.import_shipments (
  id uuid primary key default gen_random_uuid(),
  supplier text not null,
  origin_country text not null default 'Estados Unidos',
  shipping_agency text not null,
  transport_mode text not null default 'air' check (transport_mode in ('air', 'sea', 'ground')),
  reference text,
  status text not null default 'pending' check (status in ('pending', 'in_transit', 'received', 'cancelled')),
  ordered_at date not null default current_date,
  estimated_arrival date,
  received_at timestamptz,
  purchase_total numeric(14,2) not null default 0 check (purchase_total >= 0),
  exchange_rate numeric(14,4) not null default 37.11 check (exchange_rate > 0),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  inventory_processed_at timestamptz
);

create table if not exists public.import_packages (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.import_shipments(id) on delete cascade,
  tracking_reference text,
  weight_lb numeric(14,3) not null check (weight_lb > 0),
  rate_per_lb numeric(14,4) not null check (rate_per_lb >= 0),
  rate_per_lb_usd numeric(14,4) not null default 0 check (rate_per_lb_usd >= 0),
  shipping_cost numeric(14,2) generated always as (round(weight_lb * rate_per_lb, 2)) stored,
  shipping_cost_usd numeric(14,2) generated always as (round(weight_lb * rate_per_lb_usd, 2)) stored,
  status text not null default 'pending' check (status in ('pending', 'in_transit', 'received')),
  notes text,
  received_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.import_payments (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.import_shipments(id) on delete restrict,
  amount numeric(14,2) not null check (amount > 0),
  amount_original numeric(14,2) not null check (amount_original > 0),
  currency text not null check (currency in ('USD', 'NIO')),
  exchange_rate numeric(14,4) not null check (exchange_rate > 0),
  payment_type text not null default 'supplier' check (payment_type in ('supplier', 'shipping')),
  store_name text,
  bank_name text,
  payment_date date not null default current_date,
  payment_method public.payment_method not null default 'other',
  reference text,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint import_payment_nio_rate check (currency <> 'NIO' or exchange_rate = 1)
);

create table if not exists public.import_shipment_items (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.import_shipments(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity numeric(14,3) not null check (quantity > 0),
  currency text not null default 'USD' check (currency in ('USD', 'NIO')),
  amount_original numeric(14,2) not null check (amount_original > 0),
  exchange_rate numeric(14,4) not null default 37.11 check (exchange_rate > 0),
  inventory_registered_at timestamptz,
  created_at timestamptz not null default now(),
  constraint import_item_nio_rate check (currency <> 'NIO' or exchange_rate = 1)
);

alter table public.import_shipments add column if not exists received_at timestamptz;
alter table public.import_shipments add column if not exists inventory_processed_at timestamptz;
alter table public.import_packages add column if not exists rate_per_lb_usd numeric(14,4) not null default 0;
alter table public.import_packages add column if not exists notes text;
alter table public.import_packages add column if not exists received_at timestamptz;

do $$
declare t text;
begin
  foreach t in array array['import_shipments','import_packages','import_payments','import_shipment_items'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_only', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()))',
      t || '_admin_only', t
    );
  end loop;
end;
$$;

-- Sales fields used by finance and the delivery inputs already present in React.
alter table public.sales
  add column if not exists delivery_type text not null default 'none',
  add column if not exists delivery_address text,
  add column if not exists delivery_charge numeric(14,2) not null default 0,
  add column if not exists delivery_cost numeric(14,2) not null default 0;

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
  p_notes text
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
begin
  if auth.uid() is null or not private.is_active_user() then raise exception 'Usuario no autorizado.'; end if;
  if p_delivery_type not in ('none', 'colectivo', 'privado') then raise exception 'Tipo de entrega no válido.'; end if;
  v_charge := case when p_delivery_type = 'none' then 0 else coalesce(p_delivery_charge, 0) end;
  v_cost := case when p_delivery_type = 'none' then 0 else coalesce(p_delivery_cost, 0) end;
  if v_charge < 0 or v_cost < 0 then raise exception 'Los importes de entrega no pueden ser negativos.'; end if;
  if p_delivery_type <> 'none' and nullif(trim(coalesce(p_delivery_address, '')), '') is null then
    raise exception 'La dirección de entrega es obligatoria.';
  end if;
  if p_payment_amount is null or p_payment_amount < 0 then raise exception 'El pago no puede ser negativo.'; end if;

  select coalesce(jsonb_agg(
    case when value ? 'location_id' then value else value || jsonb_build_object('location_id', 'home') end
  ), '[]'::jsonb) into v_items from jsonb_array_elements(coalesce(p_items, '[]'::jsonb));

  -- Call the original transactional sale RPC with no payment, then add delivery
  -- and payment in the same outer transaction. Any failure rolls back the sale.
  v_sale := public.create_sale(
    p_customer_id, p_customer_name, p_customer_phone, p_sales_channel,
    p_salesperson_id, v_items, p_discount, 0, p_payment_method, null, p_notes
  );
  v_sale_id := (v_sale->>'sale_id')::uuid;
  v_base_total := (v_sale->>'total')::numeric;
  v_total := round(v_base_total + v_charge, 2);
  if p_payment_amount > v_total then raise exception 'El pago recibido no puede superar el total de la venta.'; end if;

  update public.sales set delivery_type = p_delivery_type,
    delivery_address = nullif(trim(coalesce(p_delivery_address, '')), ''),
    delivery_charge = v_charge, delivery_cost = v_cost, total = v_total
  where id = v_sale_id;

  if p_payment_amount > 0 then
    insert into public.payments(sale_id, amount, method, reference, received_by, notes)
    values (v_sale_id, p_payment_amount, p_payment_method, p_payment_reference,
      auth.uid(), 'Pago recibido al emitir la venta');
  end if;

  insert into public.audit_log(actor_id, action, table_name, record_id, details)
  values (auth.uid(), 'set_sale_delivery', 'sales', v_sale_id::text,
    jsonb_build_object('delivery_type', p_delivery_type, 'delivery_charge', v_charge,
      'delivery_cost', v_cost, 'total', v_total));

  return jsonb_set(jsonb_set(v_sale, '{total}', to_jsonb(v_total)),
    '{delivery_charge}', to_jsonb(v_charge));
end;
$$;

-- Administrative defaults for USD/NIO. Past transactions keep their own snapshots.
create table if not exists private.business_settings (
  id boolean primary key default true check (id),
  usd_nio_rate numeric(14,4) not null default 37.11 check (usd_nio_rate > 0),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into private.business_settings(id, usd_nio_rate) values (true, 37.11)
on conflict (id) do nothing;
alter table private.business_settings enable row level security;
revoke all on private.business_settings from anon, authenticated;
grant select on private.business_settings to authenticated;
drop policy if exists business_settings_admin_read on private.business_settings;
create policy business_settings_admin_read on private.business_settings
  for select to authenticated using ((select private.is_admin()));

create or replace function public.get_usd_nio_rate()
returns numeric
language sql stable security definer set search_path = ''
as $$ select usd_nio_rate from private.business_settings where id = true and private.is_admin() $$;

create or replace function public.set_usd_nio_rate(p_rate numeric)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null or not private.is_admin() then raise exception 'Solo un administrador puede cambiar la tasa.'; end if;
  if p_rate is null or p_rate <= 0 then raise exception 'La tasa debe ser mayor que cero.'; end if;
  update private.business_settings set usd_nio_rate = p_rate, updated_by = auth.uid(), updated_at = now() where id = true;
  insert into public.audit_log(actor_id, action, table_name, record_id, details)
  values (auth.uid(), 'set_usd_nio_rate', 'business_settings', 'true', jsonb_build_object('usd_nio_rate', p_rate));
end;
$$;

-- Keep direct admin CRUD used by the current screens bounded by their existing RLS policies.
grant insert, update on public.products to authenticated;
grant insert, update, delete on public.expenses to authenticated;
alter table public.expenses
  add column if not exists currency text not null default 'NIO',
  add column if not exists amount_original numeric(14,2),
  add column if not exists exchange_rate numeric(14,4) not null default 1;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'expenses_currency_valid') then
    alter table public.expenses add constraint expenses_currency_valid check (currency in ('USD', 'NIO'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'expenses_exchange_rate_positive') then
    alter table public.expenses add constraint expenses_exchange_rate_positive check (exchange_rate > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'expenses_nio_rate') then
    alter table public.expenses add constraint expenses_nio_rate check (currency <> 'NIO' or exchange_rate = 1);
  end if;
end $$;

create or replace function private.audit_row_change()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare v_row jsonb; v_id text;
begin
  v_row := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_id := v_row ->> 'id';
  insert into public.audit_log(actor_id, action, table_name, record_id, details)
  values (auth.uid(), lower(tg_op), tg_table_name, v_id,
    jsonb_build_object('row', v_row));
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists audit_expense_changes on public.expenses;
create trigger audit_expense_changes after insert or update or delete on public.expenses
  for each row execute function private.audit_row_change();
drop trigger if exists audit_product_changes on public.products;
create trigger audit_product_changes after insert or update or delete on public.products
  for each row execute function private.audit_row_change();
drop trigger if exists audit_customer_changes on public.customers;
create trigger audit_customer_changes after insert or update or delete on public.customers
  for each row execute function private.audit_row_change();

revoke all on function public.register_inventory_entry(uuid,numeric,text,numeric,text,text,numeric,numeric,text,public.payment_method) from public, anon, authenticated;
revoke all on function public.adjust_inventory(uuid,numeric,text) from public, anon, authenticated;
revoke all on function public.get_product_costs_and_purchases() from public, anon, authenticated;
revoke all on function public.get_usd_nio_rate() from public, anon, authenticated;
revoke all on function public.set_usd_nio_rate(numeric) from public, anon, authenticated;
revoke all on function public.create_sale(jsonb,uuid,text,text,text,uuid,numeric,text,text,numeric,numeric,numeric,public.payment_method,text,text) from public, anon, authenticated;

grant execute on function public.register_inventory_entry(uuid,numeric,text,numeric,text,text,numeric,numeric,text,public.payment_method) to authenticated;
grant execute on function public.adjust_inventory(uuid,numeric,text) to authenticated;
grant execute on function public.get_product_costs_and_purchases() to authenticated;
grant execute on function public.get_usd_nio_rate() to authenticated;
grant execute on function public.set_usd_nio_rate(numeric) to authenticated;
grant execute on function public.create_sale(jsonb,uuid,text,text,text,uuid,numeric,text,text,numeric,numeric,numeric,public.payment_method,text,text) to authenticated;

commit;

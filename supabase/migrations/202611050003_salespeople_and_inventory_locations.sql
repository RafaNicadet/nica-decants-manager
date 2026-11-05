begin;

-- Registro comercial de vendedores, independiente de las cuentas de acceso.
create table if not exists public.salespeople (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (length(trim(display_name)) between 1 and 80),
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create unique index if not exists salespeople_display_name_ci
  on public.salespeople (lower(trim(display_name)));

insert into public.salespeople (display_name)
select 'Juan O.'
where not exists (
  select 1 from public.salespeople where lower(trim(display_name)) = lower('Juan O.')
);

alter table public.salespeople enable row level security;
revoke all on public.salespeople from anon, authenticated;
grant select, insert, update on public.salespeople to authenticated;
drop policy if exists salespeople_admin_select on public.salespeople;
drop policy if exists salespeople_admin_insert on public.salespeople;
drop policy if exists salespeople_admin_update on public.salespeople;
create policy salespeople_admin_select on public.salespeople
  for select to authenticated using ((select private.is_admin()));
create policy salespeople_admin_insert on public.salespeople
  for insert to authenticated with check ((select private.is_admin()));
create policy salespeople_admin_update on public.salespeople
  for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

alter table public.sales
  add column if not exists salesperson_directory_id uuid references public.salespeople(id) on delete set null,
  add column if not exists salesperson_name_snapshot text;

-- Save a seller sale with the directory ID and immutable name snapshot, while the
-- existing transactional sale RPC continues to handle stock, invoice and commission.
create or replace function public.create_sale_with_commission_for_directory(
  p_items jsonb,
  p_customer_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_sales_channel text,
  p_salesperson_directory_id uuid,
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
  v_person public.salespeople%rowtype;
  v_sale jsonb;
  v_sale_id uuid;
begin
  if auth.uid() is null or not private.is_admin() then
    raise exception 'Solo el administrador puede asignar una venta a un vendedor.';
  end if;
  if p_sales_channel is distinct from 'seller' then
    raise exception 'Selecciona el canal de venta de vendedor.';
  end if;
  select * into v_person from public.salespeople
   where id = p_salesperson_directory_id and active for share;
  if not found then raise exception 'El vendedor no existe o está inactivo.'; end if;

  v_sale := public.create_sale_with_commission(
    p_items, p_customer_id, p_customer_name, p_customer_phone,
    p_sales_channel, auth.uid(), p_discount, p_delivery_type,
    p_delivery_address, p_delivery_charge, p_delivery_cost,
    p_payment_amount, p_payment_method, p_payment_reference, p_notes,
    p_payment_currency, p_payment_amount_original, p_payment_exchange_rate,
    p_commission_amount
  );
  v_sale_id := (v_sale->>'sale_id')::uuid;

  update public.sales
     set salesperson_id = null,
         salesperson_directory_id = v_person.id,
         salesperson_name_snapshot = v_person.display_name
   where id = v_sale_id;

  insert into public.audit_log(actor_id, action, table_name, record_id, details)
  values (auth.uid(), 'assign_sale_to_directory_seller', 'sales', v_sale_id::text,
    jsonb_build_object('salesperson_directory_id', v_person.id,
      'salesperson_name', v_person.display_name));

  return v_sale || jsonb_build_object('salesperson_name', v_person.display_name);
end;
$$;

revoke all on function public.create_sale_with_commission_for_directory(
  jsonb, uuid, text, text, text, uuid, numeric, text, text,
  numeric, numeric, numeric, public.payment_method, text, text,
  text, numeric, numeric, numeric
) from public, anon, authenticated;
grant execute on function public.create_sale_with_commission_for_directory(
  jsonb, uuid, text, text, text, uuid, numeric, text, text,
  numeric, numeric, numeric, public.payment_method, text, text,
  text, numeric, numeric, numeric
) to authenticated;

-- Receive regular inventory entries into Casa or Colectivo Somos.
create or replace function public.register_inventory_entry_at_location(
  p_product_id uuid,
  p_quantity numeric,
  p_note text,
  p_unit_cost numeric,
  p_supplier text,
  p_location_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null or not private.is_admin() then
    raise exception 'Solo un administrador puede registrar entradas de inventario.';
  end if;
  if p_location_id not in ('home', 'collective') then
    raise exception 'La ubicación seleccionada no es válida.';
  end if;
  v_result := public.register_inventory_entry(
    p_product_id, p_quantity, p_note, p_unit_cost, p_supplier,
    'NIO', null, 1, null, 'other'::public.payment_method
  );
  if p_location_id = 'collective' then
    perform public.transfer_inventory(
      p_product_id, 'home', 'collective', p_quantity,
      coalesce(nullif(trim(p_note), ''), 'Entrada registrada directamente en Colectivo Somos')
    );
  end if;
  return v_result || jsonb_build_object('location_id', p_location_id);
end;
$$;

revoke all on function public.register_inventory_entry_at_location(uuid,numeric,text,numeric,text,text)
  from public, anon, authenticated;
grant execute on function public.register_inventory_entry_at_location(uuid,numeric,text,numeric,text,text)
  to authenticated;

-- Count or correct one location without overwriting the product's total stock.
create or replace function public.adjust_inventory_location(
  p_product_id uuid,
  p_location_id text,
  p_target_quantity numeric,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_product public.products%rowtype;
  v_current numeric(14,3);
  v_delta numeric(14,3);
begin
  if v_user is null or not private.is_admin() then
    raise exception 'Solo un administrador puede ajustar el inventario.';
  end if;
  if p_location_id not in ('home', 'collective') or p_target_quantity is null or p_target_quantity < 0 then
    raise exception 'La ubicación o la cantidad indicada no son válidas.';
  end if;
  select * into v_product from public.products
   where id = p_product_id and active for update;
  if not found then raise exception 'Producto no encontrado o inactivo.'; end if;
  select quantity into v_current from public.inventory_location_stock
   where product_id = p_product_id and location_id = p_location_id for update;
  if not found then
    insert into public.inventory_location_stock(product_id, location_id, quantity)
    values (p_product_id, p_location_id, 0);
    v_current := 0;
  end if;
  v_delta := p_target_quantity - v_current;
  update public.inventory_location_stock set quantity = p_target_quantity, updated_at = now()
   where product_id = p_product_id and location_id = p_location_id;
  if v_delta <> 0 then
    update public.products set stock_qty = stock_qty + v_delta, updated_at = now()
     where id = p_product_id;
    insert into public.inventory_movements(product_id, movement_kind, quantity_delta, note, created_by)
    values (p_product_id, 'adjustment', v_delta,
      coalesce(p_note, 'Ajuste por ubicación: ' || p_location_id), v_user);
    insert into public.inventory_location_movements(
      product_id, movement_kind, quantity, from_location_id, to_location_id, note, created_by
    ) values (
      p_product_id, 'adjustment', abs(v_delta),
      case when v_delta < 0 then p_location_id else null end,
      case when v_delta > 0 then p_location_id else null end,
      coalesce(p_note, 'Conteo físico en ubicación'), v_user
    );
    insert into public.audit_log(actor_id, action, table_name, record_id, details)
    values (v_user, 'adjust_inventory_location', 'products', p_product_id::text,
      jsonb_build_object('location_id', p_location_id, 'previous_quantity', v_current,
        'new_quantity', p_target_quantity, 'difference', v_delta));
  end if;
  return jsonb_build_object(
    'location_quantity', p_target_quantity,
    'total_quantity', v_product.stock_qty + v_delta,
    'difference', v_delta
  );
end;
$$;

revoke all on function public.adjust_inventory_location(uuid,text,numeric,text)
  from public, anon, authenticated;
grant execute on function public.adjust_inventory_location(uuid,text,numeric,text)
  to authenticated;

commit;

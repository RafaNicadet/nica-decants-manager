begin;

-- 1. Ubicaciones de inventario
create table if not exists public.inventory_locations (
  id text primary key,
  name text not null,
  active boolean not null default true
);

insert into public.inventory_locations (id, name)
values ('home', 'Casa'), ('collective', 'Colectivo Somos')
on conflict (id) do nothing;

create table if not exists public.inventory_location_stock (
  product_id uuid not null references public.products(id) on delete restrict,
  location_id text not null references public.inventory_locations(id) on delete restrict,
  quantity numeric(14,3) not null default 0 check (quantity >= 0),
  updated_at timestamptz not null default now(),
  primary key (product_id, location_id)
);

-- La existencia actual se conserva en Casa; Colectivo inicia en cero.
insert into public.inventory_location_stock (product_id, location_id, quantity)
select p.id, l.id,
       case when l.id = 'home' then p.stock_qty else 0 end
from public.products p
cross join public.inventory_locations l
on conflict (product_id, location_id) do nothing;

-- Los productos nuevos tendrán una fila para cada ubicación.
create or replace function private.initialize_product_locations()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.inventory_location_stock (product_id, location_id, quantity)
  values (new.id, 'home', new.stock_qty),
         (new.id, 'collective', 0)
  on conflict (product_id, location_id) do nothing;
  return new;
end;
$$;

drop trigger if exists initialize_product_locations on public.products;
create trigger initialize_product_locations
after insert on public.products
for each row execute function private.initialize_product_locations();

-- 2. Clasificación de ventas y atribución comercial
alter table public.sales
  add column if not exists sales_channel text not null default 'direct'
    check (sales_channel in ('direct', 'collective')),
  add column if not exists salesperson_id uuid references public.profiles(user_id),
  add column if not exists commission_rate_snapshot numeric(7,4),
  add column if not exists commission_amount numeric(14,2),
  add column if not exists commission_status text not null default 'not_applicable';

update public.sales
set salesperson_id = created_by
where salesperson_id is null;

alter table public.sale_items
  add column if not exists location_id text
    references public.inventory_locations(id);

alter table private.sale_item_costs
  add column if not exists cost_recorded boolean not null default true;

-- 3. Historial privado de costos
create table if not exists private.product_cost_history (
  id bigint generated always as identity primary key,
  product_id uuid not null references public.products(id) on delete restrict,
  unit_cost numeric(14,4) not null check (unit_cost >= 0),
  source text not null default 'manual',
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Comisión sin tasa hasta que el administrador la configure.
create table if not exists private.commission_settings (
  id boolean primary key default true check (id),
  rate_percent numeric(7,4) check (rate_percent >= 0 and rate_percent <= 100),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into private.commission_settings (id, rate_percent)
values (true, null)
on conflict (id) do nothing;

-- 4. Libro de movimientos por ubicación, incluido el historial de traslados.
create table if not exists public.inventory_location_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  movement_kind text not null check (
    movement_kind in ('opening', 'purchase', 'sale', 'adjustment', 'return', 'transfer')
  ),
  quantity numeric(14,3) not null check (quantity > 0),
  from_location_id text references public.inventory_locations(id),
  to_location_id text references public.inventory_locations(id),
  related_sale_id uuid references public.sales(id) on delete restrict,
  note text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

-- 5. Permisos de lectura. Las escrituras se harán mediante funciones seguras.
alter table public.inventory_locations enable row level security;
alter table public.inventory_location_stock enable row level security;
alter table public.inventory_location_movements enable row level security;
alter table private.product_cost_history enable row level security;
alter table private.commission_settings enable row level security;

revoke all on public.inventory_locations, public.inventory_location_stock,
  public.inventory_location_movements from anon, authenticated;
revoke all on private.product_cost_history, private.commission_settings
  from anon, authenticated;

grant select on public.inventory_locations, public.inventory_location_stock
  to authenticated;
grant select on public.inventory_location_movements to authenticated;
grant select on private.product_cost_history, private.commission_settings
  to authenticated;
grant usage on schema private to authenticated;

create policy locations_read_active_users
on public.inventory_locations for select to authenticated
using ((select private.is_active_user()));

create policy location_stock_read_active_users
on public.inventory_location_stock for select to authenticated
using ((select private.is_active_user()));

create policy location_movements_admin_read
on public.inventory_location_movements for select to authenticated
using ((select private.is_admin()));

create policy product_cost_history_admin_read
on private.product_cost_history for select to authenticated
using ((select private.is_admin()));

create policy commission_settings_admin_read
on private.commission_settings for select to authenticated
using ((select private.is_admin()));

-- 6. Registrar venta, pagos y salidas de inventario como una transacción.
create or replace function public.create_sale(
  p_customer_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_sales_channel text,
  p_salesperson_id uuid,
  p_items jsonb,
  p_discount numeric default 0,
  p_payment_amount numeric default 0,
  p_payment_method public.payment_method default 'cash',
  p_payment_reference text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_role public.app_role;
  v_seller uuid;
  v_sale_id uuid;
  v_sale_item_id uuid;
  v_invoice bigint;
  v_customer_name text;
  v_customer_phone text;
  v_item jsonb;
  v_product public.products%rowtype;
  v_location text;
  v_quantity numeric(14,3);
  v_price numeric(14,2);
  v_line_discount numeric(14,2);
  v_line_total numeric(14,2);
  v_unit_cost numeric(14,4);
  v_cost_known boolean;
  v_cost_total numeric(14,2) := 0;
  v_subtotal numeric(14,2) := 0;
  v_total numeric(14,2);
  v_available numeric(14,3);
  v_rate numeric(7,4);
  v_commission numeric(14,2);
  v_commission_status text;
  v_invoice_series text := 'ND';
begin
  if v_user is null or not private.is_active_user() then
    raise exception 'Usuario no autorizado.';
  end if;

  v_role := private.current_role();

  if jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'Agrega al menos un producto a la venta.';
  end if;

  if p_sales_channel not in ('direct', 'collective') then
    raise exception 'Canal de venta no válido.';
  end if;

  v_seller := coalesce(p_salesperson_id, v_user);

  if v_role <> 'admin' and v_seller <> v_user then
    raise exception 'Solo el administrador puede atribuir una venta a otro vendedor.';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.user_id = v_seller and p.active
  ) then
    raise exception 'El vendedor seleccionado no está activo.';
  end if;

  if p_discount is null or p_discount < 0
     or p_payment_amount is null or p_payment_amount < 0 then
    raise exception 'El descuento y el pago no pueden ser negativos.';
  end if;

  if p_customer_id is not null then
    select c.full_name, c.phone
      into v_customer_name, v_customer_phone
    from public.customers c
    where c.id = p_customer_id and c.active;

    if not found then
      raise exception 'El cliente no existe o está inactivo.';
    end if;
  else
    v_customer_name := nullif(trim(coalesce(p_customer_name, '')), '');
    v_customer_phone := nullif(trim(coalesce(p_customer_phone, '')), '');
    if v_customer_name is null then
      raise exception 'Indica el nombre del cliente.';
    end if;
  end if;

  -- Reservar número de factura de forma atómica.
  update public.invoice_sequences
     set next_number = next_number + 1
   where series = v_invoice_series
   returning next_number - 1 into v_invoice;

  if v_invoice is null then
    raise exception 'No existe una secuencia de facturas configurada.';
  end if;

  insert into public.sales (
    invoice_series, invoice_number, status,
    customer_id, customer_name_snapshot, customer_phone_snapshot,
    subtotal, discount, total, created_by, salesperson_id,
    sales_channel, issued_at, notes
  ) values (
    v_invoice_series, v_invoice, 'issued',
    p_customer_id, v_customer_name, v_customer_phone,
    0, 0, 0, v_user, v_seller,
    p_sales_channel, now(), p_notes
  )
  returning id into v_sale_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    if coalesce(v_item->>'product_id', '') = ''
       or coalesce(v_item->>'location_id', '') = '' then
      raise exception 'Cada línea necesita producto y ubicación.';
    end if;

    v_location := v_item->>'location_id';

    if v_location not in ('home', 'collective') then
      raise exception 'Ubicación de inventario no válida.';
    end if;

    v_quantity := (v_item->>'quantity')::numeric;
    v_price := (v_item->>'unit_price')::numeric;
    v_line_discount := coalesce((v_item->>'line_discount')::numeric, 0);

    if v_quantity <= 0 or v_price < 0 or v_line_discount < 0 then
      raise exception 'Cantidad, precio o descuento de línea no válidos.';
    end if;

    select p.* into v_product
    from public.products p
    where p.id = (v_item->>'product_id')::uuid
      and p.active
    for update;

    if not found then
      raise exception 'Uno de los productos no existe o está inactivo.';
    end if;

    select s.quantity into v_available
    from public.inventory_location_stock s
    where s.product_id = v_product.id
      and s.location_id = v_location
    for update;

    if not found then
      raise exception 'No existe registro de existencias para % en %.',
        v_product.name, v_location;
    end if;

    if v_available < v_quantity then
      raise exception 'Existencias insuficientes de % en %. Disponible: %.',
        v_product.name, v_location, v_available;
    end if;

    v_line_total := round(v_quantity * v_price - v_line_discount, 2);

    if v_line_total < 0 then
      raise exception 'El descuento de línea supera el importe de la línea.';
    end if;

    select pc.unit_cost into v_unit_cost
    from private.product_costs pc
    where pc.product_id = v_product.id;

    v_cost_known := found;
    v_unit_cost := coalesce(v_unit_cost, 0);

    insert into public.sale_items (
      sale_id, product_id, product_name_snapshot,
      quantity, unit_price, line_discount, line_total, location_id
    ) values (
      v_sale_id, v_product.id, v_product.name,
      v_quantity, v_price, v_line_discount, v_line_total, v_location
    )
    returning id into v_sale_item_id;

    insert into private.sale_item_costs (
      sale_item_id, unit_cost, total_cost, cost_recorded
    ) values (
      v_sale_item_id,
      v_unit_cost, round(v_unit_cost * v_quantity, 2), v_cost_known
    );

    update public.inventory_location_stock
       set quantity = quantity - v_quantity, updated_at = now()
     where product_id = v_product.id and location_id = v_location;

    update public.products
       set stock_qty = stock_qty - v_quantity, updated_at = now()
     where id = v_product.id;

    insert into public.inventory_movements (
      product_id, movement_kind, quantity_delta, unit_cost,
      related_sale_id, note, created_by
    ) values (
      v_product.id, 'sale', -v_quantity, v_unit_cost,
      v_sale_id, 'Venta ' || v_invoice_series || '-' ||
      (select s.invoice_number::text from public.sales s where s.id = v_sale_id),
      v_user
    );

    insert into public.inventory_location_movements (
      product_id, movement_kind, quantity, from_location_id,
      related_sale_id, note, created_by
    ) values (
      v_product.id, 'sale', v_quantity, v_location,
      v_sale_id, 'Salida por venta', v_user
    );

    v_subtotal := v_subtotal + v_line_total;
    v_cost_total := v_cost_total + round(v_unit_cost * v_quantity, 2);

    if not v_cost_known then
      v_cost_total := v_cost_total;
    end if;
  end loop;

  if p_discount > v_subtotal then
    raise exception 'El descuento general no puede superar el subtotal.';
  end if;

  v_total := round(v_subtotal - p_discount, 2);

  if p_payment_amount > v_total then
    raise exception 'El pago recibido no puede superar el total de la venta.';
  end if;

  update public.sales
     set subtotal = v_subtotal, discount = p_discount, total = v_total
   where id = v_sale_id;

  if p_payment_amount > 0 then
    insert into public.payments (
      sale_id, amount, method, reference, received_by, notes
    ) values (
      v_sale_id, p_payment_amount, p_payment_method,
      p_payment_reference, v_user, 'Pago registrado al crear la venta'
    );
  end if;

  select cs.rate_percent into v_rate
  from private.commission_settings cs
  where cs.id = true;

  if p_sales_channel = 'collective' then
    v_commission_status := 'not_applicable';
    v_commission := null;
    v_rate := null;
  elsif v_rate is null then
    v_commission_status := 'rate_pending';
    v_commission := null;
  elsif exists (
    select 1
    from public.sale_items si
    join private.sale_item_costs sc on sc.sale_item_id = si.id
    where si.sale_id = v_sale_id and not sc.cost_recorded
  ) then
    v_commission_status := 'cost_pending';
    v_commission := null;
  else
    v_commission_status := 'pending';
    v_commission := round(
      greatest(v_total - v_cost_total, 0) * v_rate / 100, 2
    );
  end if;

  update public.sales
     set commission_rate_snapshot = v_rate,
         commission_amount = v_commission,
         commission_status = v_commission_status
   where id = v_sale_id;

  insert into public.audit_log (
    actor_id, action, table_name, record_id, details
  ) values (
    v_user, 'create_sale', 'sales', v_sale_id::text,
    jsonb_build_object(
      'invoice', v_invoice_series || '-' || v_invoice,
      'channel', p_sales_channel,
      'salesperson_id', v_seller,
      'total', v_total
    )
  );

  return jsonb_build_object(
    'sale_id', v_sale_id,
    'invoice_series', v_invoice_series,
    'invoice_number', v_invoice,
    'subtotal', v_subtotal,
    'discount', p_discount,
    'total', v_total,
    'commission_status', v_commission_status
  );
end;
$$;

-- 7. Trasladar existencias sin cambiar el inventario global.
create or replace function public.transfer_inventory(
  p_product_id uuid,
  p_from_location text,
  p_to_location text,
  p_quantity numeric,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_available numeric(14,3);
  v_name text;
begin
  if v_user is null or not private.is_active_user() then
    raise exception 'Usuario no autorizado.';
  end if;

  if p_from_location = p_to_location
     or p_from_location not in ('home', 'collective')
     or p_to_location not in ('home', 'collective')
     or p_quantity is null or p_quantity <= 0 then
    raise exception 'Datos de traslado no válidos.';
  end if;

  select p.name into v_name
  from public.products p
  where p.id = p_product_id and p.active
  for update;

  if not found then
    raise exception 'Producto no encontrado o inactivo.';
  end if;

  -- Bloquear ambas ubicaciones en orden estable.
  perform 1
  from public.inventory_location_stock s
  where s.product_id = p_product_id
    and s.location_id in (p_from_location, p_to_location)
  order by s.location_id
  for update;

  select s.quantity into v_available
  from public.inventory_location_stock s
  where s.product_id = p_product_id
    and s.location_id = p_from_location;

  if v_available is null or v_available < p_quantity then
    raise exception 'Existencias insuficientes para trasladar %.', v_name;
  end if;

  update public.inventory_location_stock
     set quantity = quantity - p_quantity, updated_at = now()
   where product_id = p_product_id and location_id = p_from_location;

  update public.inventory_location_stock
     set quantity = quantity + p_quantity, updated_at = now()
   where product_id = p_product_id and location_id = p_to_location;

  insert into public.inventory_location_movements (
    product_id, movement_kind, quantity,
    from_location_id, to_location_id, note, created_by
  ) values (
    p_product_id, 'transfer', p_quantity,
    p_from_location, p_to_location, p_note, v_user
  );

  insert into public.audit_log (
    actor_id, action, table_name, record_id, details
  ) values (
    v_user, 'transfer_inventory', 'inventory_location_stock',
    p_product_id::text,
    jsonb_build_object(
      'from', p_from_location, 'to', p_to_location,
      'quantity', p_quantity
    )
  );

  return jsonb_build_object(
    'product_id', p_product_id,
    'from', p_from_location,
    'to', p_to_location,
    'quantity', p_quantity
  );
end;
$$;

-- 8. Gastos y costos: solo administrador.
create or replace function public.create_expense(
  p_description text,
  p_category text,
  p_amount numeric,
  p_expense_date date default current_date,
  p_payment_method public.payment_method default 'cash',
  p_receipt_path text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
begin
  if v_user is null or not private.is_admin() then
    raise exception 'Solo el administrador puede registrar gastos.';
  end if;

  if nullif(trim(coalesce(p_description, '')), '') is null
     or p_amount is null or p_amount <= 0 then
    raise exception 'Descripción e importe positivo son obligatorios.';
  end if;

  insert into public.expenses (
    description, category, amount, expense_date,
    payment_method, receipt_path, created_by
  ) values (
    trim(p_description), coalesce(nullif(trim(p_category), ''), 'Otros'),
    p_amount, coalesce(p_expense_date, current_date),
    coalesce(p_payment_method, 'cash'), p_receipt_path, v_user
  )
  returning id into v_id;

  insert into public.audit_log (
    actor_id, action, table_name, record_id, details
  ) values (
    v_user, 'create_expense', 'expenses', v_id::text,
    jsonb_build_object('category', p_category, 'amount', p_amount)
  );

  return v_id;
end;
$$;

create or replace function public.set_product_cost(
  p_product_id uuid,
  p_unit_cost numeric,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null or not private.is_admin() then
    raise exception 'Solo el administrador puede modificar costos.';
  end if;

  if p_unit_cost is null or p_unit_cost < 0 then
    raise exception 'El costo no puede ser negativo.';
  end if;

  if not exists (select 1 from public.products p where p.id = p_product_id) then
    raise exception 'Producto no encontrado.';
  end if;

  insert into private.product_costs (product_id, unit_cost, updated_at)
  values (p_product_id, p_unit_cost, now())
  on conflict (product_id) do update
    set unit_cost = excluded.unit_cost, updated_at = now();

  insert into private.product_cost_history (
    product_id, unit_cost, source, note, created_by
  ) values (
    p_product_id, p_unit_cost, 'manual', p_note, v_user
  );

  insert into public.audit_log (
    actor_id, action, table_name, record_id, details
  ) values (
    v_user, 'set_product_cost', 'product_costs', p_product_id::text,
    jsonb_build_object('unit_cost', p_unit_cost, 'note', p_note)
  );
end;
$$;

create or replace function public.set_commission_rate(p_rate_percent numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null or not private.is_admin() then
    raise exception 'Solo el administrador puede configurar comisiones.';
  end if;

  if p_rate_percent is not null
     and (p_rate_percent < 0 or p_rate_percent > 100) then
    raise exception 'La comisión debe estar entre 0 y 100, o vacía.';
  end if;

  update private.commission_settings
     set rate_percent = p_rate_percent,
         updated_by = v_user, updated_at = now()
   where id = true;

  insert into public.audit_log (
    actor_id, action, table_name, record_id, details
  ) values (
    v_user, 'set_commission_rate', 'commission_settings', 'true',
    jsonb_build_object('rate_percent', p_rate_percent)
  );
end;
$$;

-- 9. RPC: sin escritura directa desde el navegador.
revoke all on function public.create_sale(
  uuid, text, text, text, uuid, jsonb, numeric, numeric,
  public.payment_method, text, text
) from public, anon, authenticated;
revoke all on function public.transfer_inventory(
  uuid, text, text, numeric, text
) from public, anon, authenticated;
revoke all on function public.create_expense(
  text, text, numeric, date, public.payment_method, text
) from public, anon, authenticated;
revoke all on function public.set_product_cost(uuid, numeric, text)
  from public, anon, authenticated;
revoke all on function public.set_commission_rate(numeric)
  from public, anon, authenticated;

grant execute on function public.create_sale(
  uuid, text, text, text, uuid, jsonb, numeric, numeric,
  public.payment_method, text, text
) to authenticated;
grant execute on function public.transfer_inventory(
  uuid, text, text, numeric, text
) to authenticated;
grant execute on function public.create_expense(
  text, text, numeric, date, public.payment_method, text
) to authenticated;
grant execute on function public.set_product_cost(uuid, numeric, text)
  to authenticated;
grant execute on function public.set_commission_rate(numeric)
  to authenticated;

commit;

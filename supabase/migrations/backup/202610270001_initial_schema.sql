

begin;

create extension if not exists pgcrypto;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create type public.app_role as enum ('admin', 'employee');
create type public.product_kind as enum ('finished', 'supply', 'source_perfume');
create type public.sale_status as enum ('draft', 'issued', 'void');
create type public.payment_method as enum ('cash', 'transfer', 'card', 'other');
create type public.inventory_movement_kind as enum ('purchase', 'sale', 'adjustment', 'decant_use', 'return');

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete restrict,
  display_name text not null,
  role public.app_role not null default 'employee',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  sku text unique,
  name text not null,
  category text not null default 'General',
  kind public.product_kind not null default 'finished',
  sell_unit text not null default 'unidad',
  stock_qty numeric(14,3) not null default 0 check (stock_qty >= 0),
  low_stock_threshold numeric(14,3) not null default 0 check (low_stock_threshold >= 0),
  sale_price numeric(14,2) not null default 0 check (sale_price >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Costos y márgenes separados: empleados no reciben permisos sobre este esquema/tabla.
create table private.product_costs (
  product_id uuid primary key references public.products(id) on delete restrict,
  unit_cost numeric(14,4) not null default 0 check (unit_cost >= 0),
  updated_at timestamptz not null default now()
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text,
  email text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create table public.invoice_sequences (
  series text primary key default 'ND',
  next_number bigint not null default 1 check (next_number > 0)
);
insert into public.invoice_sequences(series, next_number) values ('ND', 1)
on conflict (series) do nothing;

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  invoice_series text not null default 'ND',
  invoice_number bigint,
  status public.sale_status not null default 'draft',
  customer_id uuid references public.customers(id) on delete restrict,
  customer_name_snapshot text not null,
  customer_phone_snapshot text,
  subtotal numeric(14,2) not null default 0 check (subtotal >= 0),
  discount numeric(14,2) not null default 0 check (discount >= 0),
  total numeric(14,2) not null default 0 check (total >= 0),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  issued_at timestamptz,
  notes text,
  unique(invoice_series, invoice_number),
  check (discount <= subtotal),
  check ((status <> 'issued') or (invoice_number is not null and issued_at is not null))
);

create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  product_name_snapshot text not null,
  quantity numeric(14,3) not null check (quantity > 0),
  unit_price numeric(14,2) not null check (unit_price >= 0),
  line_discount numeric(14,2) not null default 0 check (line_discount >= 0),
  line_total numeric(14,2) not null check (line_total >= 0),
  created_at timestamptz not null default now()
);

-- Snapshot de costo privado, uno por línea de venta. Solo funciones internas/admin.
create table private.sale_item_costs (
  sale_item_id uuid primary key references public.sale_items(id) on delete restrict,
  unit_cost numeric(14,4) not null check (unit_cost >= 0),
  total_cost numeric(14,2) not null check (total_cost >= 0)
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete restrict,
  amount numeric(14,2) not null check (amount > 0),
  method public.payment_method not null default 'cash',
  reference text,
  received_by uuid not null references auth.users(id) on delete restrict,
  paid_at timestamptz not null default now(),
  notes text
);

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  movement_kind public.inventory_movement_kind not null,
  quantity_delta numeric(14,3) not null check (quantity_delta <> 0),
  unit_cost numeric(14,4),
  related_sale_id uuid references public.sales(id) on delete restrict,
  note text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  description text not null,
  category text not null default 'General',
  amount numeric(14,2) not null check (amount > 0),
  expense_date date not null default current_date,
  payment_method public.payment_method not null default 'cash',
  receipt_path text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  table_name text not null,
  record_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Helpers de autorización. No aceptar el rol desde el navegador.
create or replace function private.current_role()
returns public.app_role
language sql stable security definer
set search_path = ''
as $$
  select p.role
  from public.profiles p
  where p.user_id = (select auth.uid()) and p.active = true
$$;

create or replace function private.is_active_user()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.user_id = (select auth.uid()) and p.active = true
  )
$$;

create or replace function private.is_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce(private.current_role() = 'admin'::public.app_role, false)
$$;

revoke all on function private.current_role() from public, anon, authenticated;
revoke all on function private.is_active_user() from public, anon, authenticated;
revoke all on function private.is_admin() from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.current_role() to authenticated;
grant execute on function private.is_active_user() to authenticated;
grant execute on function private.is_admin() to authenticated;

-- No usuario anónimo; toda tabla expuesta queda protegida con RLS.
alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table private.product_costs enable row level security;
alter table public.customers enable row level security;
alter table public.invoice_sequences enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table private.sale_item_costs enable row level security;
alter table public.payments enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.expenses enable row level security;
alter table public.audit_log enable row level security;

-- Revocar permisos generales y conceder solo lo necesario.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all tables in schema private from anon, authenticated;
grant select on public.products to authenticated;
grant select, insert, update on public.customers to authenticated;
grant select on public.sales, public.sale_items, public.payments to authenticated;
grant select on public.profiles to authenticated;
grant select on public.inventory_movements to authenticated;
grant select on public.expenses to authenticated;
grant select on public.audit_log to authenticated;
grant select on private.product_costs, private.sale_item_costs to authenticated;

-- Perfiles: cada usuario ve su perfil; admin ve todos. No se concede update/insert.
create policy "profile_read_self_or_admin" on public.profiles
for select to authenticated
using (user_id = (select auth.uid()) or (select private.is_admin()));

create policy "products_read_active_users" on public.products
for select to authenticated
using ((select private.is_active_user()) and (active or (select private.is_admin())));

create policy "products_admin_write" on public.products
for all to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy "costs_admin_only" on private.product_costs
for all to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy "customers_read_active_users" on public.customers
for select to authenticated
using ((select private.is_active_user()));

create policy "customers_insert_active_users" on public.customers
for insert to authenticated
with check ((select private.is_active_user()));

create policy "customers_update_active_users" on public.customers
for update to authenticated
using ((select private.is_active_user()))
with check ((select private.is_active_user()));

create policy "sales_read_active_users" on public.sales
for select to authenticated
using ((select private.is_active_user()));

create policy "sale_items_read_active_users" on public.sale_items
for select to authenticated
using ((select private.is_active_user()));

create policy "payments_read_active_users" on public.payments
for select to authenticated
using ((select private.is_active_user()));

create policy "movements_admin_read_only" on public.inventory_movements
for select to authenticated
using ((select private.is_admin()));

create policy "expenses_admin_only" on public.expenses
for all to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy "audit_admin_read_only" on public.audit_log
for select to authenticated
using ((select private.is_admin()));

create policy "sequence_admin_only" on public.invoice_sequences
for all to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy "sale_cost_admin_only" on private.sale_item_costs
for all to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

-- Las ventas, pagos, facturas y movimientos NO se escriben directamente desde el cliente.
-- Se habilitarán mediante funciones transaccionales RPC en la siguiente migración.
revoke insert, update, delete, truncate on public.sales, public.sale_items, public.payments,
  public.inventory_movements, public.audit_log, public.invoice_sequences
from anon, authenticated;

-- Evitar que perfiles puedan ser creados o elevarse a admin desde el navegador.
revoke insert, update, delete on public.profiles from anon, authenticated;

commit;



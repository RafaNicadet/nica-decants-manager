-- Preserve the currency and exchange rate used for an import purchase.
-- purchase_total remains the NIO equivalent for existing reports and balances.
alter table public.import_shipments
  add column if not exists purchase_amount_original numeric(14,2),
  add column if not exists purchase_currency text not null default 'NIO',
  add column if not exists purchase_exchange_rate numeric(14,4) not null default 1;

update public.import_shipments
set purchase_amount_original = purchase_total
where purchase_amount_original is null;

alter table public.import_shipments
  alter column purchase_amount_original set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'import_shipments_purchase_currency_valid'
      and conrelid = 'public.import_shipments'::regclass
  ) then
    alter table public.import_shipments
      add constraint import_shipments_purchase_currency_valid
      check (purchase_currency in ('USD', 'NIO'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'import_shipments_purchase_exchange_rate_positive'
      and conrelid = 'public.import_shipments'::regclass
  ) then
    alter table public.import_shipments
      add constraint import_shipments_purchase_exchange_rate_positive
      check (purchase_exchange_rate > 0);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'import_shipments_purchase_nio_rate'
      and conrelid = 'public.import_shipments'::regclass
  ) then
    alter table public.import_shipments
      add constraint import_shipments_purchase_nio_rate
      check (purchase_currency <> 'NIO' or purchase_exchange_rate = 1);
  end if;
end;
$$;

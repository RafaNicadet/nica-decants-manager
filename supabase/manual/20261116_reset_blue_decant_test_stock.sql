-- PRUEBA MANUAL: reinicia únicamente el stock actual de Blue de Chiela y sus decants.
-- Conserva ventas, costos, movimientos y el historial. Ejecutar una sola vez,
-- antes de volver a probar la preparación.
begin;

do $$
declare
  v_source_id uuid;
  v_source_name text;
  v_decant_ids uuid[];
  v_old_source_stock numeric;
  v_decant_count integer;
begin
  select id, name, stock_qty
    into v_source_id, v_source_name, v_old_source_stock
  from public.products
  where active
    and kind = 'source_perfume'
    and lower(name) like 'blue de chi%'
  order by name
  limit 1
  for update;

  if v_source_id is null then
    raise exception 'No encontré un perfume original activo cuyo nombre comience con Blue de Chi. No se modificó nada.';
  end if;

  if (select count(*) from public.products
      where active and kind = 'source_perfume' and lower(name) like 'blue de chi%') <> 1 then
    raise exception 'Encontré más de un perfume original Blue de Chi. No se modificó nada; hace falta identificar el correcto.';
  end if;

  select coalesce(array_agg(id), '{}'::uuid[]), count(*)
    into v_decant_ids, v_decant_count
  from public.products
  where active and is_decant and decant_source_product_id = v_source_id;

  -- Una botella cerrada de 100 ml disponible en Casa; ninguna en Colectivo.
  update public.products
     set bottle_volume_ml = 100,
         sell_unit = 'botella',
         stock_qty = 1,
         updated_at = now()
   where id = v_source_id;

  insert into public.inventory_location_stock(product_id, location_id, quantity)
  values (v_source_id, 'home', 1), (v_source_id, 'collective', 0)
  on conflict (product_id, location_id) do update
    set quantity = excluded.quantity, updated_at = now();

  -- El líquido abierto vuelve a cero; la botella cerrada contiene los 100 ml.
  insert into public.inventory_open_perfume_ml(product_id, location_id, remaining_ml, remaining_cost)
  values (v_source_id, 'home', 0, null), (v_source_id, 'collective', 0, null)
  on conflict (product_id, location_id) do update
    set remaining_ml = 0, remaining_cost = null, updated_at = now();

  -- Deja en cero solo los decants vinculados a este perfume.
  if cardinality(v_decant_ids) > 0 then
    update public.products
       set stock_qty = 0, updated_at = now()
     where id = any(v_decant_ids);

    update public.inventory_location_stock
       set quantity = 0, updated_at = now()
     where product_id = any(v_decant_ids);
  end if;

  insert into public.audit_log(actor_id, action, table_name, record_id, details)
  values (null, 'reset_blue_decant_test_stock', 'products', v_source_id::text,
    jsonb_build_object(
      'source_name', v_source_name,
      'previous_source_stock', v_old_source_stock,
      'new_source_stock', 1,
      'bottle_volume_ml', 100,
      'source_location', 'home',
      'decant_skus_reset_to_zero', v_decant_count,
      'historical_records_preserved', true
    ));
end;
$$;

commit;

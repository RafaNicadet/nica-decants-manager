begin;

-- Prevent mixing bottle counts with milliliters in source inventory. The RPC
-- stores unopened bottle counts separately from leftover liquid in ml.
create or replace function public.prepare_decants(
  p_decant_product_id uuid,
  p_location_id text,
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
  v_target public.products%rowtype;
  v_source public.products%rowtype;
  v_container public.products%rowtype;
  v_source_stock numeric(14,3);
  v_container_stock numeric(14,3);
  v_open_ml numeric(14,3);
  v_open_cost numeric(14,4);
  v_required_ml numeric(14,3);
  v_open_bottles numeric(14,3);
  v_pool_ml numeric(14,3);
  v_pool_cost numeric(14,4);
  v_source_cost numeric(14,4);
  v_container_cost numeric(14,4);
  v_source_cost_known boolean;
  v_container_cost_known boolean;
  v_consumed_cost numeric(14,4);
  v_batch_unit_cost numeric(14,4);
  v_old_target_cost numeric(14,4);
  v_new_target_cost numeric(14,4);
  v_old_target_stock numeric(14,3);
  v_batch_id uuid;
begin
  if v_user is null or not private.is_admin() then
    raise exception 'Solo un administrador puede preparar decants.';
  end if;
  if p_location_id not in ('home','collective')
     or p_quantity is null or p_quantity <= 0 or p_quantity <> trunc(p_quantity) then
    raise exception 'Selecciona una ubicación y una cantidad entera válida.';
  end if;

  select * into v_target from public.products
   where id = p_decant_product_id and active for update;
  if not found or not v_target.is_decant then
    raise exception 'El producto seleccionado no está configurado como decant.';
  end if;
  select * into v_source from public.products
   where id = v_target.decant_source_product_id and active;
  if not found or v_source.kind <> 'source_perfume'
     or v_source.bottle_volume_ml is null or v_source.bottle_volume_ml <= 0 then
    raise exception 'Configura el perfume original y los ml de su botella.';
  end if;
  if lower(trim(v_source.sell_unit)) not in ('botella','botellas') then
    raise exception 'El inventario del perfume original debe registrarse por botellas cerradas (por ejemplo, 1 botella de 100 ml), no como unidades de ml. Corrige la unidad y el stock antes de preparar decants.';
  end if;
  select * into v_container from public.products
   where id = v_target.decant_container_product_id and active;
  if not found or v_container.kind <> 'supply' then
    raise exception 'Configura un producto de frasco vacío válido.';
  end if;
  if p_decant_product_id in (v_source.id, v_container.id) or v_source.id = v_container.id then
    raise exception 'Los productos relacionados no pueden ser el mismo producto.';
  end if;

  -- Lock related product rows in a stable order to avoid concurrent stock races.
  perform 1 from public.products
   where id in (v_target.id, v_source.id, v_container.id)
   order by id for update;

  insert into public.inventory_location_stock(product_id,location_id,quantity)
    values (v_source.id,p_location_id,0),(v_container.id,p_location_id,0),(v_target.id,p_location_id,0)
    on conflict (product_id,location_id) do nothing;
  insert into public.inventory_open_perfume_ml(product_id,location_id,remaining_ml)
    values (v_source.id,p_location_id,0)
    on conflict (product_id,location_id) do nothing;

  select quantity into v_source_stock from public.inventory_location_stock
   where product_id=v_source.id and location_id=p_location_id for update;
  select quantity into v_container_stock from public.inventory_location_stock
   where product_id=v_container.id and location_id=p_location_id for update;
  select remaining_ml,remaining_cost into v_open_ml,v_open_cost
   from public.inventory_open_perfume_ml
   where product_id=v_source.id and location_id=p_location_id for update;

  v_required_ml := round(p_quantity * v_target.decant_size_ml,3);
  v_open_bottles := ceil(greatest(0,v_required_ml-coalesce(v_open_ml,0))/v_source.bottle_volume_ml);
  if coalesce(v_source_stock,0) < v_open_bottles then
    raise exception 'No hay suficientes botellas cerradas en esta ubicación. Se necesitan abrir %; hay %.',
      v_open_bottles, coalesce(v_source_stock,0);
  end if;
  if coalesce(v_container_stock,0) < p_quantity then
    raise exception 'No hay suficientes frascos vacíos en esta ubicación. Necesitas % y hay %.',
      p_quantity, coalesce(v_container_stock,0);
  end if;
  if coalesce(v_open_ml,0) > 0 and v_open_cost is null then
    raise exception 'El perfume abierto no tiene costo registrado. Revisa Costos antes de continuar.';
  end if;

  select unit_cost into v_source_cost from private.product_costs where product_id=v_source.id;
  v_source_cost_known := found;
  select unit_cost into v_container_cost from private.product_costs where product_id=v_container.id;
  v_container_cost_known := found;
  if (v_open_bottles > 0 and not v_source_cost_known) or not v_container_cost_known then
    raise exception 'Registra primero el costo promedio del perfume y de los frascos vacíos en Costos.';
  end if;

  v_pool_ml := coalesce(v_open_ml,0) + v_open_bottles * v_source.bottle_volume_ml;
  v_pool_cost := coalesce(v_open_cost,0) + v_open_bottles * coalesce(v_source_cost,0);
  v_consumed_cost := case when v_pool_ml > 0 then round(v_pool_cost * v_required_ml / v_pool_ml,4) else 0 end;
  v_batch_unit_cost := round((v_consumed_cost + p_quantity * v_container_cost) / p_quantity,4);

  if v_open_bottles > 0 then
    update public.inventory_location_stock set quantity=quantity-v_open_bottles,updated_at=now()
     where product_id=v_source.id and location_id=p_location_id;
    update public.products set stock_qty=stock_qty-v_open_bottles,updated_at=now() where id=v_source.id;
    insert into public.inventory_movements(product_id,movement_kind,quantity_delta,unit_cost,note,created_by)
    values (v_source.id,'adjustment',-v_open_bottles,v_source_cost,'Botellas abiertas para preparar decants',v_user);
    insert into public.inventory_location_movements(product_id,movement_kind,quantity,from_location_id,note,created_by)
    values (v_source.id,'adjustment',v_open_bottles,p_location_id,'Botellas abiertas para preparar decants',v_user);
  end if;

  update public.inventory_open_perfume_ml
     set remaining_ml=round(v_pool_ml-v_required_ml,3),
         remaining_cost=round(v_pool_cost-v_consumed_cost,4),
         updated_at=now()
   where product_id=v_source.id and location_id=p_location_id;

  update public.inventory_location_stock set quantity=quantity-p_quantity,updated_at=now()
   where product_id=v_container.id and location_id=p_location_id;
  update public.products set stock_qty=stock_qty-p_quantity,updated_at=now() where id=v_container.id;
  insert into public.inventory_movements(product_id,movement_kind,quantity_delta,unit_cost,note,created_by)
  values (v_container.id,'adjustment',-p_quantity,v_container_cost,'Frascos usados en producción de decants',v_user);
  insert into public.inventory_location_movements(product_id,movement_kind,quantity,from_location_id,note,created_by)
  values (v_container.id,'adjustment',p_quantity,p_location_id,'Frascos usados en producción de decants',v_user);

  update public.inventory_location_stock set quantity=quantity+p_quantity,updated_at=now()
   where product_id=v_target.id and location_id=p_location_id;
  update public.products set stock_qty=stock_qty+p_quantity,updated_at=now() where id=v_target.id;
  insert into public.inventory_movements(product_id,movement_kind,quantity_delta,unit_cost,note,created_by)
  values (v_target.id,'adjustment',p_quantity,v_batch_unit_cost,'Decants preparados',v_user);
  insert into public.inventory_location_movements(product_id,movement_kind,quantity,to_location_id,note,created_by)
  values (v_target.id,'adjustment',p_quantity,p_location_id,'Decants preparados',v_user);

  select unit_cost into v_old_target_cost from private.product_costs where product_id=v_target.id;
  v_old_target_stock := v_target.stock_qty;
  if not found and v_old_target_stock > 0 then
    raise exception 'Este decant ya tiene existencias sin costo registrado. Registra su costo antes de preparar más.';
  end if;
  v_new_target_cost := case when v_old_target_stock <= 0 then v_batch_unit_cost
    else round((v_old_target_stock*v_old_target_cost+p_quantity*v_batch_unit_cost)/(v_old_target_stock+p_quantity),4)
  end;
  insert into private.product_costs(product_id,unit_cost,updated_at)
  values(v_target.id,v_new_target_cost,now())
  on conflict(product_id) do update set unit_cost=excluded.unit_cost,updated_at=now();
  insert into private.product_cost_history(product_id,unit_cost,source,note,created_by)
  values(v_target.id,v_new_target_cost,'production',coalesce(p_note,'Preparación de decants'),v_user);

  insert into public.decant_production_batches(
    source_product_id,decant_product_id,container_product_id,location_id,quantity,
    source_ml_used,unit_cost,created_by,note
  ) values (
    v_source.id,v_target.id,v_container.id,p_location_id,p_quantity,
    v_required_ml,v_batch_unit_cost,v_user,nullif(trim(coalesce(p_note,'')),'')
  ) returning id into v_batch_id;

  insert into public.audit_log(actor_id,action,table_name,record_id,details)
  values(v_user,'prepare_decants','decant_production_batches',v_batch_id::text,
    jsonb_build_object('source_product_id',v_source.id,'container_product_id',v_container.id,
      'location_id',p_location_id,'quantity',p_quantity,'source_ml_used',v_required_ml,
      'unit_cost',v_batch_unit_cost));

  return jsonb_build_object(
    'batch_id',v_batch_id,'quantity',p_quantity,'source_ml_used',v_required_ml,
    'remaining_ml',(v_pool_ml-v_required_ml),'unit_cost',v_batch_unit_cost,
    'location_id',p_location_id
  );
end;
$$;


commit;

begin;

-- Allow package SKUs to consume loose supplies or already prepared decants.
create or replace function public.change_inventory_bundle(
  p_bundle_product_id uuid,
  p_location_id text,
  p_quantity numeric,
  p_action text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_bundle public.products%rowtype;
  v_component public.products%rowtype;
  v_bundle_stock numeric(14,3);
  v_component_stock numeric(14,3);
  v_component_qty numeric(14,3);
  v_component_cost numeric(14,4);
  v_component_cost_known boolean := false;
  v_bundle_cost numeric(14,4);
  v_bundle_cost_known boolean := false;
  v_bundle_unit_cost numeric(14,4);
begin
  if v_user is null or not private.is_admin() then raise exception 'Solo un administrador puede armar o desarmar paquetes.'; end if;
  if p_location_id not in ('home','collective') or p_quantity is null or p_quantity <= 0
     or p_quantity <> trunc(p_quantity) or p_action not in ('build','unbuild') then
    raise exception 'Revisa la ubicación, la cantidad entera y la operación.';
  end if;
  select * into v_bundle from public.products where id=p_bundle_product_id and active for update;
  if not found or v_bundle.bundle_component_product_id is null
     or not (v_bundle.kind='supply' or (v_bundle.kind='finished' and not v_bundle.is_decant)) then
    raise exception 'Configura este producto como paquete antes de armarlo.';
  end if;
  select * into v_component from public.products
   where id=v_bundle.bundle_component_product_id and active for update;
  if not found or v_component.id=v_bundle.id
     or not (v_component.kind='supply' or (v_component.kind='finished' and v_component.is_decant))
     or v_component.bundle_component_product_id is not null then
    raise exception 'El componente debe ser un suministro unitario o un decant ya preparado.';
  end if;
  v_component_qty := p_quantity * v_bundle.bundle_component_quantity;

  insert into public.inventory_location_stock(product_id,location_id,quantity)
    values (v_bundle.id,p_location_id,0),(v_component.id,p_location_id,0)
    on conflict(product_id,location_id) do nothing;
  select quantity into v_bundle_stock from public.inventory_location_stock
   where product_id=v_bundle.id and location_id=p_location_id for update;
  select quantity into v_component_stock from public.inventory_location_stock
   where product_id=v_component.id and location_id=p_location_id for update;

  select unit_cost into v_component_cost from private.product_costs where product_id=v_component.id;
  v_component_cost_known := found;
  select unit_cost into v_bundle_cost from private.product_costs where product_id=v_bundle.id;
  v_bundle_cost_known := found;
  if p_action='build' then
    if v_component_stock < v_component_qty then
      raise exception 'No hay suficientes unidades sueltas. Necesitas % y hay %.',v_component_qty,v_component_stock;
    end if;
    update public.inventory_location_stock set quantity=quantity-v_component_qty,updated_at=now()
     where product_id=v_component.id and location_id=p_location_id;
    update public.products set stock_qty=stock_qty-v_component_qty,updated_at=now() where id=v_component.id;
    update public.inventory_location_stock set quantity=quantity+p_quantity,updated_at=now()
     where product_id=v_bundle.id and location_id=p_location_id;
    update public.products set stock_qty=stock_qty+p_quantity,updated_at=now() where id=v_bundle.id;
    if v_component_cost_known then
      v_bundle_unit_cost := round(v_component_cost*v_bundle.bundle_component_quantity,4);
      if v_bundle_cost_known then
        v_bundle_cost := round((v_bundle.stock_qty*v_bundle_cost+p_quantity*v_bundle_unit_cost)/
          greatest(v_bundle.stock_qty+p_quantity,1),4);
      elsif v_bundle.stock_qty=0 then
        v_bundle_cost := v_bundle_unit_cost;
        v_bundle_cost_known := true;
      end if;
      if v_bundle_cost_known then
        insert into private.product_costs(product_id,unit_cost,updated_at)
        values(v_bundle.id,v_bundle_cost,now())
        on conflict(product_id) do update set unit_cost=excluded.unit_cost,updated_at=now();
        insert into private.product_cost_history(product_id,unit_cost,source,note,created_by)
        values(v_bundle.id,v_bundle_cost,'production',coalesce(p_note,'Armado de paquete'),v_user);
      end if;
    end if;
  else
    if v_bundle_stock < p_quantity then raise exception 'No hay suficientes paquetes armados para desarmar.'; end if;
    update public.inventory_location_stock set quantity=quantity-p_quantity,updated_at=now()
     where product_id=v_bundle.id and location_id=p_location_id;
    update public.products set stock_qty=stock_qty-p_quantity,updated_at=now() where id=v_bundle.id;
    update public.inventory_location_stock set quantity=quantity+v_component_qty,updated_at=now()
     where product_id=v_component.id and location_id=p_location_id;
    update public.products set stock_qty=stock_qty+v_component_qty,updated_at=now() where id=v_component.id;
  end if;

  insert into public.inventory_movements(product_id,movement_kind,quantity_delta,unit_cost,note,created_by)
  values (v_component.id,'adjustment',case when p_action='build' then -v_component_qty else v_component_qty end,
      v_component_cost,coalesce(p_note,case when p_action='build' then 'Unidades usadas para armar paquetes' else 'Unidades recuperadas al desarmar paquetes' end),v_user),
    (v_bundle.id,'adjustment',case when p_action='build' then p_quantity else -p_quantity end,
      v_bundle_cost,coalesce(p_note,case when p_action='build' then 'Paquetes armados' else 'Paquetes desarmados' end),v_user);
  insert into public.inventory_location_movements(product_id,movement_kind,quantity,from_location_id,to_location_id,note,created_by)
  values
    (v_component.id,'adjustment',v_component_qty,case when p_action='build' then p_location_id else null end,case when p_action='unbuild' then p_location_id else null end,coalesce(p_note,'Movimiento de componentes de paquete'),v_user),
    (v_bundle.id,'adjustment',p_quantity,case when p_action='unbuild' then p_location_id else null end,case when p_action='build' then p_location_id else null end,coalesce(p_note,case when p_action='build' then 'Paquetes armados' else 'Paquetes desarmados' end),v_user);
  insert into public.audit_log(actor_id,action,table_name,record_id,details)
  values(v_user,'change_inventory_bundle','products',v_bundle.id::text,
    jsonb_build_object('action',p_action,'location_id',p_location_id,'quantity',p_quantity,
      'component_product_id',v_component.id,'component_quantity',v_component_qty));

  return jsonb_build_object('action',p_action,'bundle_quantity',p_quantity,
    'component_quantity',v_component_qty,'location_id',p_location_id);
end;
$$;

revoke all on function public.change_inventory_bundle(uuid,text,numeric,text,text) from public,anon,authenticated;
grant execute on function public.change_inventory_bundle(uuid,text,numeric,text,text) to authenticated;


commit;

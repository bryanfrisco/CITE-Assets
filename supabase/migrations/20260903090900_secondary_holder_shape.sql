-- The wrapper exists to keep the old contract, so it has to keep the old SHAPE
-- too: callers read `secondaryName`, not the new `holderNames` array.
create or replace function set_secondary_holder(p_asset uuid, p_account uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  r := set_asset_holders(
    p_asset,
    case when p_account is null then array[]::uuid[] else array[p_account] end
  );
  return r || jsonb_build_object('secondaryName', (r -> 'holderNames') ->> 0);
end $$;

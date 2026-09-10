-- ============================================================================
-- CITE Assets — 0092 A label says who is holding the device it is stuck to
--
-- The Labels register printed location, asset code and asset name under each
-- sticker, and stopped there. So "In use" answered only half the question it
-- appears to answer: the sticker is on a device, yes — but with whom?
--
-- TWO DIFFERENT THINGS WORE ONE BADGE
-- -----------------------------------
-- A tag is `tagged` the moment somebody sticks it on a machine. Whether that
-- machine is then handed to a person is a separate fact, and the screen could
-- not tell them apart:
--
--   tagged, asset held by somebody   the label is doing its job
--   tagged, asset held by nobody     the label is on a device sitting in a
--                                    cupboard — still "In use", but there is
--                                    nothing to walk up to and check
--
-- Both read "In use". Somebody auditing labels had to open every row to find
-- out which was which.
--
-- `holder_name` is added to the row, and `p_status` gains a value the tag
-- lifecycle itself does not have:
--
--   'unassigned'   tagged, but the asset has no holder
--
-- It is deliberately not a fourth `tag_status`. The tag is genuinely `tagged`;
-- "unassigned" is a fact about the ASSET underneath it, and inventing a tag
-- state for it would put the same truth in two places to drift apart. The
-- filter derives it on read instead.
--
-- `tag_stock` gains the matching count so the tiles above the list can show it
-- without a second round trip.
--
-- Both functions are DROPPED first. `list_tags` returns a table and cannot
-- gain a column in place; `tag_stock` returns jsonb and could have been
-- replaced, but is dropped alongside so the two always move together.
-- ============================================================================

drop function if exists list_tags(text, uuid, uuid[]);

create function list_tags(
  p_status    text    default null,
  p_batch     uuid    default null,
  p_locations uuid[]  default null
)
returns table (
  id uuid, code text, status tag_status, batch_id uuid,
  asset_code text, asset_name text, tagged_at timestamptz, created_at timestamptz,
  location_id uuid, location_name text,
  -- Null when the label is blank, or when it is on a device nobody holds.
  -- The screen tells those two apart by `asset_code` being null or not.
  holder_name text
)
language sql stable security invoker set search_path = public as $$
  select
    t.id, t.code, t.status, t.batch_id,
    a.asset_code, a.name, t.tagged_at, t.created_at,
    t.location_id, l.name,
    acc.full_name
  from asset_tags t
  left join assets    a   on a.id = t.asset_id
  left join accounts  acc on acc.id = a.assigned_to
  left join locations l   on l.id = t.location_id
  where (
      p_status is null
      or (p_status = 'unassigned' and t.status = 'tagged' and a.assigned_to is null)
      or (p_status <> 'unassigned' and t.status::text = p_status)
    )
    and (p_batch is null or t.batch_id = p_batch)
    -- Labels from before migration 0033 carry no location. They stay visible in
    -- every scope rather than disappearing from a screen that used to show them.
    and (p_locations is null or t.location_id is null or t.location_id = any (p_locations))
  order by t.code;
$$;

drop function if exists tag_stock(uuid[]);

create function tag_stock(p_locations uuid[] default null)
returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'untagged',   count(*) filter (where t.status = 'untagged'),
    'tagged',     count(*) filter (where t.status = 'tagged'),
    -- A subset of `tagged`, not a fourth state: these are counted twice on
    -- purpose, because the question "how many labels are in use" and "how many
    -- of those are on kit nobody holds" are both worth an answer.
    'unassigned', count(*) filter (where t.status = 'tagged' and a.assigned_to is null),
    'void',       count(*) filter (where t.status = 'void'),
    'total',      count(*)
  )
  from asset_tags t
  left join assets a on a.id = t.asset_id
  where p_locations is null or t.location_id is null or t.location_id = any (p_locations);
$$;

revoke all on function list_tags(text, uuid, uuid[]) from public, anon;
revoke all on function tag_stock(uuid[])             from public, anon;
grant execute on function list_tags(text, uuid, uuid[]) to authenticated;
grant execute on function tag_stock(uuid[])            to authenticated;

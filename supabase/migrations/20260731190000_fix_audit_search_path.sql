-- ============================================================================
-- CITE Assets — 0018 Fix audit_row()'s search_path
--
-- THE BUG
-- -------
-- Deleting an auth user failed with:
--
--   supabase_auth_admin@postgres ERROR: type "audit_action" does not exist
--   STATEMENT: DELETE FROM "users" AS users WHERE users.id = $1
--
-- accounts.auth_user_id is `references auth.users(id) on delete set null`, so
-- removing a sign-in updates the accounts row, which fires accounts_audit,
-- which runs audit_row(). audit_row() is SECURITY DEFINER but was declared
-- WITHOUT `set search_path`, so it inherits the caller's — and the caller here
-- is GoTrue, whose search_path does not include `public`. The unqualified
-- `::audit_action` cast then resolves against nothing.
--
-- WHY IT WAS INVISIBLE UNTIL NOW
-- ------------------------------
-- Every other write to an audited table arrives through PostgREST, whose
-- search_path does include public. Nothing before this reached an audited table
-- from a session that did not already have it, so the missing setting never
-- mattered. Revoking a login is the first path that does, and it fails at the
-- database rather than in the app — which is why it surfaced as a flat
-- "Database error deleting user" from the Auth API with nothing else to go on.
--
-- The same hole would have swallowed any future write from a background job,
-- an extension, or a webhook. Fixing the function rather than working around it
-- at the call site is the difference between this being over and it coming back
-- somewhere harder to see.
--
-- The body is unchanged apart from the search_path and schema-qualifying the
-- type; the triggers that use it are untouched and keep working.
-- ============================================================================

create or replace function audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare me uuid; lbl text; act audit_action;
begin
  select id, coalesce(role::text,'system') || ' · ' || full_name into me, lbl from v_me limit 1;
  act := case
    when tg_op = 'INSERT' then (tg_argv[0])::public.audit_action
    else (tg_argv[1])::public.audit_action end;
  insert into audit_log(action, table_name, record_id, old_value, new_value, actor_id, actor_label,
                        device, ip_address)
  values (act, tg_table_name,
          coalesce(new.id, old.id),
          case when tg_op = 'INSERT' then null else to_jsonb(old) end,
          case when tg_op = 'DELETE' then null else to_jsonb(new) end,
          me, lbl,
          current_setting('request.headers', true)::json->>'x-client-info',
          nullif(current_setting('request.headers', true)::json->>'x-forwarded-for','')::inet);
  return coalesce(new, old);
end $$;

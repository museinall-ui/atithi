-- ----------------------------------------------------------------------------
-- 20260703_team_member_emails.sql
-- Settings → Team members showed each staff member as a raw user_id code
-- ("Member · a1b2c3d4…") the moment they signed in, because auth.users isn't
-- readable under normal RLS. This security-definer RPC returns each membership
-- row for a property PLUS the member's email — gated so only a MEMBER of that
-- property can call it (has_property_access uses the caller's auth.uid()).
--
-- The app (src/cloud/team.js loadMembers) tries this RPC first and falls back to
-- the plain membership query when it isn't pasted yet — so the team screen keeps
-- working either way, just showing the id until this runs.
--
-- Owner-side: paste into the Supabase SQL Editor + Run before adding staff.
-- Safe to re-run.
-- ----------------------------------------------------------------------------

create or replace function public.property_members(p_property_id uuid)
returns table (
  id uuid,
  user_id uuid,
  role text,
  permissions jsonb,
  accepted_at timestamptz,
  invited_by uuid,
  created_at timestamptz,
  email text
)
language sql
security definer
set search_path = public
as $$
  select
    m.id, m.user_id, m.role, m.permissions,
    m.accepted_at, m.invited_by, m.created_at,
    (select u.email::text from auth.users u where u.id = m.user_id) as email
  from memberships m
  where m.property_id = p_property_id
    and has_property_access(p_property_id)   -- caller must belong to the property
  order by m.created_at asc;
$$;

grant execute on function public.property_members(uuid) to authenticated;

-- Test (as a signed-in member): select id, email, role from
-- property_members('<your-property-id>'::uuid);  -- should list every member + email.

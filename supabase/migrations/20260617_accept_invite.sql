-- ----------------------------------------------------------------------------
-- 20260617_accept_invite.sql
-- SECURITY (audit #50): bind invite role/permissions server-side.
--
-- 20260608 closed the big hole (a STRANGER joining any property) but left a
-- smaller one open, documented in its own footer: the self-insert policy only
-- checks that an invite EXISTS for the caller — not that the role/permissions
-- they insert MATCH the invite. So a user invited as 'reception' could
-- directly insert themselves as role 'owner' and (via has_perm(owner)=all)
-- gain full control of that property, including managing the team.
--
-- Fix: move invite acceptance into a SECURITY DEFINER accept_invite() RPC that
-- creates the membership with role + permissions FORCED from the invite row
-- (never client-supplied), then tighten the self-insert policy so it permits
-- ONLY the first-owner bootstrap. Invite acceptance can no longer happen via a
-- raw client INSERT, so the role can't be forged.
--
-- DEPENDS ON 20260608 (property_has_members). Paste that first if you haven't.
--
-- Rollout order: the client (cloud/team.js) auto-deploys to call this RPC and
-- falls back to the legacy insert when the RPC is missing — so paste this
-- AFTER the site has redeployed (≈1 min after the push). Idempotent.
-- ----------------------------------------------------------------------------

-- Accept all pending invites for the calling user. Returns the property ids
-- joined. role + permissions come from the invite row, not the caller.
create or replace function public.accept_invite()
returns uuid[]
language plpgsql security definer
set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_email text;
  v_props uuid[] := '{}';
  inv     record;
begin
  if v_uid is null then return v_props; end if;
  select lower(email) into v_email from auth.users where id = v_uid;
  if v_email is null then return v_props; end if;

  for inv in
    select id, property_id, role, permissions
    from pending_invites
    where lower(email) = v_email
  loop
    -- role + permissions FORCED from the invite — never trust client input.
    insert into memberships (user_id, property_id, role, permissions, accepted_at)
    values (
      v_uid,
      inv.property_id,
      coalesce(inv.role, 'reception'),
      coalesce(inv.permissions, '[]'::jsonb),
      now()
    )
    on conflict (user_id, property_id) do nothing;  -- already a member → skip
    delete from pending_invites where id = inv.id;
    v_props := array_append(v_props, inv.property_id);
  end loop;

  return v_props;
end;
$$;
grant execute on function public.accept_invite() to authenticated;

-- Tighten self-insert: ONLY the first-owner bootstrap (property has no members
-- yet). Invite acceptance now flows through accept_invite() above, which is
-- SECURITY DEFINER and bypasses this policy — so a raw INSERT with a forged
-- role is rejected.
drop policy if exists "memberships self-insert" on memberships;
create policy "memberships self-insert" on memberships for insert to authenticated
  with check (
    user_id = auth.uid()
    and not public.property_has_members(property_id)   -- first-owner bootstrap only
  );

-- Test:
--   1. Owner invites staff@x.com as 'reception'. As that user, after sign-in:
--        select accept_invite();   -- returns the property id; membership has role 'reception'
--   2. As that same invited user, a forged direct insert must now FAIL:
--        insert into memberships(user_id, property_id, role)
--        values (auth.uid(), '<that property uuid>', 'owner');
--      → "new row violates row-level security policy" (property already has members).
--   3. Brand-new user bootstrapping their first property still succeeds.

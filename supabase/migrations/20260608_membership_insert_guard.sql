-- SECURITY FIX (round-9 R9-1): close the membership self-insert hole.
--
-- The original policy (20260518_initial_schema.sql) was:
--   create policy "memberships self-insert" on memberships for insert
--     to authenticated with check (user_id = auth.uid());
-- It only checked that the row's user_id is the caller — NOT that the caller
-- was invited or that this is a first-owner bootstrap, and NOT what role they
-- claim. So ANY signed-in user could insert (their uid, <any property_id>,
-- 'owner') and instantly gain full read/write on that property (every table's
-- RLS is just has_property_access(property_id)). The victim property_id is
-- trivially obtained — property_by_short_code() hands it to anon for any
-- public booking-widget slug. This is a full multi-tenant isolation break and
-- it is LIVE once DEMO_MODE is off.
--
-- This migration restricts the self-insert to two legitimate cases:
--   (a) first-owner bootstrap — the property has no members yet, OR
--   (b) the caller has a matching pending_invite for their own email.
--
-- CRITICAL DESIGN POINT: the "does this property already have members?" and
-- "do I have an invite?" checks MUST run with elevated privileges. If we
-- inlined `not exists (select 1 from memberships ...)` in the policy, that
-- subquery would itself be filtered by the attacker's RLS — they can't SEE the
-- victim's existing memberships, so the subquery returns 0 rows and the
-- "no members yet" branch would WRONGLY pass, defeating the fix. So we wrap
-- both checks in SECURITY DEFINER functions that bypass RLS.
--
-- Both legitimate client flows keep working:
--   * bootstrapProperty() (cloud/property.js): inserts the property, then the
--     owner membership — at that moment the property has no members yet, so
--     branch (a) allows it.
--   * acceptPendingInvitesForUser() (App.jsx on sign-in): the inviting owner
--     is already a member (branch (a) false), but the user has a pending
--     invite for their email, so branch (b) allows it.
--
-- Owner-side action: paste this whole file into the Supabase SQL Editor and
-- click Run. Idempotent (create or replace + drop policy if exists). SECURITY
-- CRITICAL — paste this as soon as possible (the live site already requires
-- real sign-in, so the hole is currently exploitable).

-- Does the property already have at least one membership? Runs as definer so
-- it sees ALL memberships regardless of the caller's RLS visibility.
create or replace function public.property_has_members(p_property_id uuid)
returns boolean
language sql security definer stable
set search_path = public as $$
  select exists (select 1 from memberships where property_id = p_property_id);
$$;

-- Does the calling user have a pending invite (matched by their auth email)
-- for this property? Definer so it can read pending_invites + auth.users.
create or replace function public.caller_has_invite(p_property_id uuid)
returns boolean
language sql security definer stable
set search_path = public as $$
  select exists (
    select 1 from pending_invites pi
    where pi.property_id = p_property_id
      and lower(pi.email) = lower((select email from auth.users where id = auth.uid()))
  );
$$;

grant execute on function public.property_has_members(uuid) to authenticated;
grant execute on function public.caller_has_invite(uuid)   to authenticated;

-- Replace the permissive policy with the gated one.
drop policy if exists "memberships self-insert" on memberships;
create policy "memberships self-insert" on memberships for insert to authenticated
  with check (
    user_id = auth.uid()
    and (
      not public.property_has_members(property_id)   -- (a) first-owner bootstrap
      or public.caller_has_invite(property_id)       -- (b) accepted invite
    )
  );

-- NOTE: this does NOT enforce that `role`/`permissions` match the invite — a
-- determined invitee could still self-assign 'owner'. That's a smaller,
-- separate hardening (move membership creation into a SECURITY DEFINER
-- accept_invite() RPC that forces role from the invite). The critical hole —
-- a *stranger* joining an arbitrary property — is closed here.

-- Test (run as two different users):
--   1. As a brand-new signed-in user, try:
--        insert into memberships(user_id, property_id, role)
--        values (auth.uid(), '<some OTHER hotel''s property uuid>', 'owner');
--      → should now FAIL ("new row violates row-level security policy"),
--        whereas before it succeeded.
--   2. Your own bootstrap (first property) and accepting a real invite should
--      both still succeed.

-- ⚠️ SECURITY (RBAC): enforce the `manage_team` permission on pending_invites.
--
-- BUG (found in the 2026-06-24 deep audit): the original 20260603
-- "members manage" policy was `for all` gated ONLY by
-- has_property_access(property_id) — so ANY member of a property (including a
-- low-privilege reception user, via the Supabase REST API) could INSERT an
-- invite row with role='owner', then have an accomplice accept it and become a
-- full owner of the tenant. `manage_team` existed in the app's permission list
-- but was enforced NOWHERE (neither client nor DB). The 20260611 RBAC pass
-- added has_perm() write policies for the business tables but never covered
-- pending_invites or the team-management surface.
--
-- FIX: drop the blanket "members manage" policy and split it into granular
-- permissive policies. READS stay open to any property member (so a manager /
-- reception can still SEE the team), but INSERT / UPDATE / DELETE now require
-- has_perm(property_id, 'manage_team'). has_perm() returns TRUE for the owner
-- role unconditionally, so the owner keeps full control and can never lock
-- themselves out.
--
-- The accept-on-sign-in flow is preserved untouched: the "self read by email"
-- + "self delete by email" policies from 20260603 remain, so an invited user
-- can still find and clean up their OWN invite by email without needing
-- manage_team. (accept_invite() — 20260617 — is SECURITY DEFINER and bypasses
-- RLS regardless.)
--
-- Idempotent — safe to re-run. Paste AFTER 20260603 + 20260611 + 20260617.

drop policy if exists "members manage" on pending_invites;

do $$ begin
  -- Any property member may READ their property's invites (view the team).
  if not exists (select 1 from pg_policies where tablename = 'pending_invites' and policyname = 'members read invites') then
    create policy "members read invites" on pending_invites
      for select to authenticated
      using (has_property_access(property_id));
  end if;

  -- Only members with the manage_team permission (owners always) may create,
  -- modify, or revoke invites. This closes the privilege-escalation path where
  -- a non-owner could invite a fresh accomplice email as role='owner'.
  if not exists (select 1 from pg_policies where tablename = 'pending_invites' and policyname = 'team manage invites insert') then
    create policy "team manage invites insert" on pending_invites
      for insert to authenticated
      with check (has_perm(property_id, 'manage_team'));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'pending_invites' and policyname = 'team manage invites update') then
    create policy "team manage invites update" on pending_invites
      for update to authenticated
      using (has_perm(property_id, 'manage_team'))
      with check (has_perm(property_id, 'manage_team'));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'pending_invites' and policyname = 'team manage invites delete') then
    create policy "team manage invites delete" on pending_invites
      for delete to authenticated
      using (has_perm(property_id, 'manage_team'));
  end if;
end $$;

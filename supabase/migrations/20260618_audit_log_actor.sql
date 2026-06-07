-- ----------------------------------------------------------------------------
-- 20260618_audit_log_actor.sql
-- LOW-severity hardening (audit #54): stop a member forging the actor on an
-- activity-log row.
--
-- The audit_log write policy only checked has_property_access(property_id), so
-- a member could insert a row attributing an action to ANOTHER user. This adds
-- actor_id = auth.uid() to the WITH CHECK (null still allowed for unattributed
-- system rows), so a member can only stamp themselves as the actor. Read access
-- is unchanged. Audit-integrity only — not an access-control bypass — so this
-- is genuinely low priority; paste whenever convenient.
--
-- Idempotent. Safe to re-run.
-- ----------------------------------------------------------------------------

drop policy if exists "audit write" on audit_log;
create policy "audit write" on audit_log for insert to authenticated
  with check (
    has_property_access(property_id)
    and (actor_id is null or actor_id = auth.uid())
  );

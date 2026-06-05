-- Enforce staff permissions at the database level (round-9 R9-6).
--
-- Until now, RLS only checked MEMBERSHIP ("members all" / has_property_access),
-- so any member could do anything via direct API calls — the per-permission
-- limits (can()) were UI-only. A technical reception user could cancel
-- bookings or void invoices from the browser console.
--
-- SAFETY-FIRST DESIGN (so this can NEVER lock the owner out of their own hotel):
--   1. has_perm() returns TRUE for the OWNER role unconditionally — the
--      account holder is always allowed, regardless of any permission config.
--   2. We only gate WRITES (insert/update/delete). SELECT stays fully open, so
--      worst case a mis-permissioned staffer can still SEE everything and the
--      owner fixes their permissions in Settings → Team.
--   3. These are RESTRICTIVE policies that AND with the existing permissive
--      ones — we ADD on top, we don't replace. Kill-switch = drop these
--      policies (see the end of this file) and you're back to the old behaviour.
--   4. has_perm() mirrors the app's effectivePermissions() exactly (owner=all,
--      manager=all-but-team, reception=create/edit/payments/expenses, legacy
--      manage_bookings → the 3 split perms) so DB and UI never disagree.
--   5. All restrictive policies are scoped `to authenticated` so the anonymous
--      booking-widget path (anon role / SECURITY DEFINER RPCs) is untouched.
--
-- Owner-side action: paste this whole file into the Supabase SQL Editor and
-- click Run. Idempotent. Recommended: after running, test with a SECOND
-- account invited as 'reception' that it can take a booking + payment but
-- can't void an invoice — while YOUR owner account can still do everything.

-- ---------------------------------------------------------------------------
-- has_perm(property_id, permission) — the single source of truth, matching
-- src/components/TeamSection.jsx effectivePermissions().
-- ---------------------------------------------------------------------------
create or replace function public.has_perm(p_property_id uuid, p_perm text)
returns boolean
language sql security definer stable
set search_path = public as $$
  with me as (
    select role, coalesce(permissions, '[]'::jsonb) as perms
    from memberships
    where property_id = p_property_id and user_id = auth.uid()
    limit 1
  )
  select case
    when not exists (select 1 from me) then false               -- not a member
    when (select role from me) = 'owner' then true              -- owner: ALWAYS
    when jsonb_array_length((select perms from me)) > 0 then (   -- explicit perms
      (select perms from me) ? p_perm
      or ((select perms from me) ? 'manage_bookings'            -- legacy expand
          and p_perm in ('create_bookings', 'edit_bookings', 'cancel_bookings'))
    )
    else (                                                      -- role defaults
      case (select role from me)
        when 'manager'   then p_perm <> 'manage_team'
        when 'reception' then p_perm in ('create_bookings', 'edit_bookings', 'manage_payments', 'manage_expenses')
        else false
      end
    )
  end;
$$;
grant execute on function public.has_perm(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- bookings — operation-level: create / edit / cancel are separate perms.
--   INSERT  → create_bookings
--   UPDATE  → edit OR cancel (USING), and any update RESULTING in
--             status='cancelled' additionally needs cancel_bookings (CHECK)
--   DELETE  → cancel_bookings (the app never hard-deletes, but gate it anyway)
-- ---------------------------------------------------------------------------
drop policy if exists "perm bookings insert" on bookings;
create policy "perm bookings insert" on bookings as restrictive for insert to authenticated
  with check (has_perm(property_id, 'create_bookings'));

drop policy if exists "perm bookings update" on bookings;
create policy "perm bookings update" on bookings as restrictive for update to authenticated
  using (has_perm(property_id, 'edit_bookings') or has_perm(property_id, 'cancel_bookings'))
  with check (status <> 'cancelled' or has_perm(property_id, 'cancel_bookings'));

drop policy if exists "perm bookings delete" on bookings;
create policy "perm bookings delete" on bookings as restrictive for delete to authenticated
  using (has_perm(property_id, 'cancel_bookings'));

-- ---------------------------------------------------------------------------
-- Table-level write gates (writing the row IS the permission). Each gets
-- insert + update + delete restrictive policies. SELECT left open.
-- ---------------------------------------------------------------------------
-- payments → manage_payments
drop policy if exists "perm payments write i" on payments;
create policy "perm payments write i" on payments as restrictive for insert to authenticated with check (has_perm(property_id, 'manage_payments'));
drop policy if exists "perm payments write u" on payments;
create policy "perm payments write u" on payments as restrictive for update to authenticated using (has_perm(property_id, 'manage_payments')) with check (has_perm(property_id, 'manage_payments'));
drop policy if exists "perm payments write d" on payments;
create policy "perm payments write d" on payments as restrictive for delete to authenticated using (has_perm(property_id, 'manage_payments'));

-- invoices → manage_invoices
drop policy if exists "perm invoices write i" on invoices;
create policy "perm invoices write i" on invoices as restrictive for insert to authenticated with check (has_perm(property_id, 'manage_invoices'));
drop policy if exists "perm invoices write u" on invoices;
create policy "perm invoices write u" on invoices as restrictive for update to authenticated using (has_perm(property_id, 'manage_invoices')) with check (has_perm(property_id, 'manage_invoices'));
drop policy if exists "perm invoices write d" on invoices;
create policy "perm invoices write d" on invoices as restrictive for delete to authenticated using (has_perm(property_id, 'manage_invoices'));

-- expenses → manage_expenses
drop policy if exists "perm expenses write i" on expenses;
create policy "perm expenses write i" on expenses as restrictive for insert to authenticated with check (has_perm(property_id, 'manage_expenses'));
drop policy if exists "perm expenses write u" on expenses;
create policy "perm expenses write u" on expenses as restrictive for update to authenticated using (has_perm(property_id, 'manage_expenses')) with check (has_perm(property_id, 'manage_expenses'));
drop policy if exists "perm expenses write d" on expenses;
create policy "perm expenses write d" on expenses as restrictive for delete to authenticated using (has_perm(property_id, 'manage_expenses'));

-- rate_overrides → manage_rates
drop policy if exists "perm rates write i" on rate_overrides;
create policy "perm rates write i" on rate_overrides as restrictive for insert to authenticated with check (has_perm(property_id, 'manage_rates'));
drop policy if exists "perm rates write u" on rate_overrides;
create policy "perm rates write u" on rate_overrides as restrictive for update to authenticated using (has_perm(property_id, 'manage_rates')) with check (has_perm(property_id, 'manage_rates'));
drop policy if exists "perm rates write d" on rate_overrides;
create policy "perm rates write d" on rate_overrides as restrictive for delete to authenticated using (has_perm(property_id, 'manage_rates'));

-- saved_custom_extras → manage_settings (configured in Settings)
drop policy if exists "perm extras write i" on saved_custom_extras;
create policy "perm extras write i" on saved_custom_extras as restrictive for insert to authenticated with check (has_perm(property_id, 'manage_settings'));
drop policy if exists "perm extras write u" on saved_custom_extras;
create policy "perm extras write u" on saved_custom_extras as restrictive for update to authenticated using (has_perm(property_id, 'manage_settings')) with check (has_perm(property_id, 'manage_settings'));
drop policy if exists "perm extras write d" on saved_custom_extras;
create policy "perm extras write d" on saved_custom_extras as restrictive for delete to authenticated using (has_perm(property_id, 'manage_settings'));

-- cash_closes → manage_payments (day-close is a cash action; reception has it)
drop policy if exists "perm cashcloses write i" on cash_closes;
create policy "perm cashcloses write i" on cash_closes as restrictive for insert to authenticated with check (has_perm(property_id, 'manage_payments'));
drop policy if exists "perm cashcloses write u" on cash_closes;
create policy "perm cashcloses write u" on cash_closes as restrictive for update to authenticated using (has_perm(property_id, 'manage_payments')) with check (has_perm(property_id, 'manage_payments'));
drop policy if exists "perm cashcloses write d" on cash_closes;
create policy "perm cashcloses write d" on cash_closes as restrictive for delete to authenticated using (has_perm(property_id, 'manage_payments'));

-- room_categories → manage_settings
drop policy if exists "perm rooms write i" on room_categories;
create policy "perm rooms write i" on room_categories as restrictive for insert to authenticated with check (has_perm(property_id, 'manage_settings'));
drop policy if exists "perm rooms write u" on room_categories;
create policy "perm rooms write u" on room_categories as restrictive for update to authenticated using (has_perm(property_id, 'manage_settings')) with check (has_perm(property_id, 'manage_settings'));
drop policy if exists "perm rooms write d" on room_categories;
create policy "perm rooms write d" on room_categories as restrictive for delete to authenticated using (has_perm(property_id, 'manage_settings'));

-- properties → UPDATE gated by manage_settings (id IS the property_id).
-- (No insert/delete gate: insert is the first-owner bootstrap, delete is a
-- cascade only the owner can trigger.)
drop policy if exists "perm properties update" on properties;
create policy "perm properties update" on properties as restrictive for update to authenticated
  using (has_perm(id, 'manage_settings')) with check (has_perm(id, 'manage_settings'));

-- ---------------------------------------------------------------------------
-- KILL-SWITCH (run this block if anything misbehaves — reverts to the prior
-- "any member can write" behaviour without touching reads or the owner):
--   drop policy if exists "perm bookings insert" on bookings;
--   drop policy if exists "perm bookings update" on bookings;
--   drop policy if exists "perm bookings delete" on bookings;
--   drop policy if exists "perm payments write i" on payments; ... (etc, all "perm %" policies)
--   drop policy if exists "perm properties update" on properties;
-- ---------------------------------------------------------------------------

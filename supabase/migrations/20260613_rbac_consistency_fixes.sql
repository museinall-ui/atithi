-- RBAC consistency fixes (round-10 R10-4) — corrects three mismatches in the
-- permission enforcement added by 20260611_enforce_permissions.sql.
--
-- DEPENDS ON 20260611 (defines has_perm). Paste 20260611 first. Idempotent.
--
-- Why each change:
--
-- F-1 (Critical · money): recording a payment writes BOTH a payments row AND a
--   bookings UPDATE (paid + status), because paying off a hold auto-confirms it
--   and clears the release timer (src/cloud/bookings.js addPaymentCloud). The
--   20260611 bookings-UPDATE policy required edit_bookings/cancel_bookings, so a
--   member with manage_payments but NOT edit (the deliberate "new staff: takes
--   phone bookings + payments, can't edit/cancel" role) had the payments row
--   insert but the bookings UPDATE rejected — a half-applied payment, with the
--   folio balance silently wrong. Fix: the bookings UPDATE policy also accepts
--   manage_payments. Minor, bounded over-grant (a payments-only member could
--   touch other booking columns via the raw API — never via the UI, which still
--   hides edit) — and the WITH CHECK still blocks cancelling without
--   cancel_bookings. Correctness of money beats the theoretical over-grant.
--
-- F-3 (High · phantom day-close): the Dashboard gates the day-close card on
--   manage_expenses (and the permission label literally reads "Log expenses +
--   day close · cash accounts"), but 20260611 gated cash_closes writes on
--   manage_payments. So a bookkeeper-style member with manage_expenses but not
--   manage_payments saw the close card, filled it in, and the write was
--   rejected. Fix: cash_closes writes → manage_expenses, matching the UI + label.
--
-- F-7 (Medium · security): issue_invoice() is SECURITY DEFINER, so its INSERT
--   into invoices runs with the definer's rights and BYPASSES the restrictive
--   "perm invoices write" policy. A technical member could rpc('issue_invoice')
--   from the browser console regardless of manage_invoices. Fix: check
--   has_perm(..., 'manage_invoices') inside the function body (raised as 42501
--   so the client treats it as a permission error). Owner always passes.

-- ---------------------------------------------------------------------------
-- F-1: bookings UPDATE also allowed for manage_payments
-- ---------------------------------------------------------------------------
drop policy if exists "perm bookings update" on bookings;
create policy "perm bookings update" on bookings as restrictive for update to authenticated
  using (
    has_perm(property_id, 'edit_bookings')
    or has_perm(property_id, 'cancel_bookings')
    or has_perm(property_id, 'manage_payments')
  )
  with check (status <> 'cancelled' or has_perm(property_id, 'cancel_bookings'));

-- ---------------------------------------------------------------------------
-- F-3: cash_closes writes gated on manage_expenses (not manage_payments)
-- ---------------------------------------------------------------------------
drop policy if exists "perm cashcloses write i" on cash_closes;
create policy "perm cashcloses write i" on cash_closes as restrictive for insert to authenticated with check (has_perm(property_id, 'manage_expenses'));
drop policy if exists "perm cashcloses write u" on cash_closes;
create policy "perm cashcloses write u" on cash_closes as restrictive for update to authenticated using (has_perm(property_id, 'manage_expenses')) with check (has_perm(property_id, 'manage_expenses'));
drop policy if exists "perm cashcloses write d" on cash_closes;
create policy "perm cashcloses write d" on cash_closes as restrictive for delete to authenticated using (has_perm(property_id, 'manage_expenses'));

-- ---------------------------------------------------------------------------
-- F-7: issue_invoice() enforces manage_invoices inside the SECURITY DEFINER body
-- (re-creates the function from 20260519 verbatim + one extra permission check)
-- ---------------------------------------------------------------------------
create or replace function issue_invoice(
  p_booking_id text,
  p_fy text,
  p_amount integer,
  p_recipient jsonb,
  p_prefix text default 'INV',
  p_items jsonb default null,
  p_note text default ''
) returns invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  v_property_id uuid;
  v_seq integer;
  v_number text;
  v_row invoices;
  v_prefix text;
begin
  select property_id into v_property_id
    from bookings where id = p_booking_id;

  if v_property_id is null then
    raise exception 'Booking % not found', p_booking_id;
  end if;

  if not has_property_access(v_property_id) then
    raise exception 'Not authorised for this booking';
  end if;

  -- R10-4 F-7: SECURITY DEFINER bypasses the restrictive invoices policy, so
  -- enforce the invoicing permission here. Owner always passes (has_perm).
  if not has_perm(v_property_id, 'manage_invoices') then
    raise exception 'Not authorised to issue invoices' using errcode = '42501';
  end if;

  update properties
     set invoice_counters = jsonb_set(
           invoice_counters,
           array[p_fy],
           to_jsonb(coalesce((invoice_counters->>p_fy)::int, 0) + 1),
           true
         )
   where id = v_property_id
   returning (invoice_counters->>p_fy)::int into v_seq;

  v_prefix := nullif(trim(p_prefix), '');
  if v_prefix is null then v_prefix := 'INV'; end if;
  v_number := v_prefix || '-' || p_fy || '-' || lpad(v_seq::text, 3, '0');

  insert into invoices (
    booking_id, property_id, number, fy, seq,
    amount, recipient, items, note
  ) values (
    p_booking_id, v_property_id, v_number, p_fy, v_seq,
    p_amount, p_recipient, p_items, p_note
  ) returning * into v_row;

  return v_row;
end
$$;

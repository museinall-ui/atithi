-- ============================================================
-- Phase 1 follow-up: 3rd plan tier + customisable invoice prefix
-- ============================================================

-- The original schema had a strict check constraint allowing only
-- ('engine','channels'). We're reintroducing a third tier ("invoicing")
-- and may add more in future, so drop the rigid check entirely. Plan
-- governance happens in the app for now.
alter table properties drop constraint if exists properties_plan_check;

-- Extend issue_invoice() with a p_prefix argument so the hotelier can
-- pick their own invoice prefix (default 'INV') in Property Profile.
-- The prefix is plugged into the existing number format:
--   {PREFIX}-{FY}-{SEQ}  e.g. ABC-2627-001
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

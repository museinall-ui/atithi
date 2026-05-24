-- Coupon code system for the public booking widget.
--
-- Hotelier-side: Settings → Coupons accordion lets them create/edit
-- codes with a percentage or flat-rupee discount, optional expiry,
-- optional minimum nights, optional max-uses cap. Stored on
-- properties.coupons (jsonb array; one row holds the full coupon book).
--
-- Guest-side: Step 3 of the widget asks for an optional coupon code.
-- Valid codes apply the discount in the booking summary and ride
-- through to the booking as coupon_code + discount_amount so the
-- hotelier sees what was used.
--
-- Race-condition note: under DEMO_MODE the used-count increment is
-- local-only; once DEMO_MODE flips, a future migration will replace
-- this with an atomic redeem_coupon() RPC. For now the cap is
-- approximate and the hotelier can revoke / disable an over-used
-- coupon manually.
--
-- Idempotent — safe to re-run.

alter table properties
  add column if not exists coupons jsonb not null default '[]'::jsonb;

alter table bookings
  add column if not exists coupon_code text default '';

alter table bookings
  add column if not exists discount_amount integer not null default 0;

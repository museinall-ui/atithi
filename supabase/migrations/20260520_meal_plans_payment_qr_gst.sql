-- ============================================================
-- Atithi — meal plans, payment QR, per-category GST override
--
-- Three property-shape fields that landed in the local code but
-- weren't being persisted to Supabase, so a cloud round-trip
-- silently dropped them:
--
--   1. property.mealPlans  — EP/CP/MAP/AP + any custom plans
--   2. property.profile.paymentQrDataUrl + paymentQrLabel
--   3. category.gstRate    — per-category GST override (null = auto)
--
-- Today DEMO_MODE = true so nothing is touching the cloud, but as
-- soon as that flag flips off these fields would have been wiped
-- on the first save. This migration adds the columns and the JS
-- read/write paths land in the same commit.
-- ============================================================

-- Meal plans array — default seeds the four hotel-industry plans so
-- existing properties bootstrapped before this migration still have
-- a sane fallback on first cloud load.
alter table properties
  add column if not exists meal_plans jsonb not null default
    '[
      {"id":"ep",  "code":"EP",  "label":"Room only",                      "price":0,    "enabled":true},
      {"id":"cp",  "code":"CP",  "label":"Breakfast included",             "price":500,  "enabled":true},
      {"id":"map", "code":"MAP", "label":"Breakfast + 1 main meal",        "price":1200, "enabled":true},
      {"id":"ap",  "code":"AP",  "label":"All meals (breakfast + 2 main)", "price":2000, "enabled":false}
    ]'::jsonb;

-- Hotelier-uploaded UPI/payment QR image. Stored as a base64 data
-- URL on the property row (cap at ~700KB at the UI layer so the row
-- stays small). The voucher renders this under "Scan to pay" so the
-- guest can pay directly without us integrating a payment gateway.
alter table properties
  add column if not exists payment_qr_data_url text default '';

alter table properties
  add column if not exists payment_qr_label text default '';

-- Property logo — same base64 data-URL approach as the payment QR so we
-- don't need Supabase Storage just to ship logos. 200KB cap at the UI
-- layer keeps the row small. Renders on the Settings hero and on the
-- voucher header.
alter table properties
  add column if not exists logo_data_url text default '';

-- Per-room-category GST override. NULL means "auto-pick from the
-- current CBIC slab based on base rate" (≤₹1k exempt / ₹1-7.5k 5% /
-- ≥₹7.5k 18%). An explicit number wins over the slab — used when a
-- hotelier's CA tells them a specific rate applies to a specific
-- room type.
alter table room_categories
  add column if not exists gst_rate smallint
    check (gst_rate is null or gst_rate between 0 and 28);

-- Weekend rules: which days of the week count as weekend (0=Sun ...
-- 6=Sat, JS getDay convention) and the % uplift applied on those
-- days when computing the default per-day rate in Rates & inventory.
-- Per-day overrides always win; this is just the auto-default.
alter table properties
  add column if not exists weekend_rules jsonb not null default
    '{"weekendDays":[0,6],"upliftPct":20}'::jsonb;

-- Named seasons (Winter peak, Monsoon discount, etc). Each entry:
-- { id, name, startIso, endIso, multiplierPct }. Multiplier stacks
-- with the weekend uplift; explicit per-day overrides still win.
-- Empty array by default.
alter table properties
  add column if not exists seasons jsonb not null default '[]'::jsonb;

-- Per-channel rate markups (%). Direct is the reference (0); each OTA
-- gets a markup applied when rates push out via the Channel Manager.
-- Most OTAs require rate parity contractually, so non-zero values
-- trigger a Settings warning before save. Default keeps everything at 0.
alter table properties
  add column if not exists channel_markups jsonb not null default
    '{"direct":0,"mmt":0,"goibibo":0,"booking":0,"agoda":0,"airbnb":0}'::jsonb;

-- Rate plans (Standard / Flexible / Non-refundable etc). Each plan
-- multiplies the per-day rate at booking time and carries cancellation
-- terms surfaced on the booking flow + voucher. Standard plan is
-- always present and always enabled at 0%.
alter table properties
  add column if not exists rate_plans jsonb not null default
    '[{"id":"standard","label":"Standard","multiplierPct":0,"cancellation":"flexible","refundHours":48,"enabled":true}]'::jsonb;

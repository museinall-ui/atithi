# DEMO_MODE → Production flip checklist

When you're ready to switch Atithi from "runs entirely off localStorage" to "real Supabase backed product that real hoteliers can sign in to", work through this list top to bottom. It's deliberately small — the heavy lifting is paste-and-run SQL and a single one-line code change.

Last updated: Jun 4, 2026 (round-9 security: added membership-insert guard migration 20260608).

---

## Part 1 — Supabase SQL (you do this, ~5 minutes)

Open https://supabase.com/dashboard → project `vaerzwmglfwslvqqcyhx` → **SQL Editor**. For each of these files, open the file from the repo, copy the entire contents, paste into the SQL Editor, click **Run**. Order doesn't matter; **all migrations are idempotent** so re-running is safe.

```
supabase/migrations/20260518_initial_schema.sql                    ← already done if your DB existed before
supabase/migrations/20260519_plan_and_invoice_prefix.sql           ← already done if your DB existed before
supabase/migrations/20260520_meal_plans_payment_qr_gst.sql
supabase/migrations/20260524_default_meal_plan_and_commissions.sql
supabase/migrations/20260525_extra_guest_pricing.sql
supabase/migrations/20260526_booking_meal_rate_email_events.sql
supabase/migrations/20260527_room_and_property_photos.sql
supabase/migrations/20260528_coupons.sql
supabase/migrations/20260529_voice_notes.sql
supabase/migrations/20260530_widget_fields_and_closed_units.sql
supabase/migrations/20260601_expenses.sql
supabase/migrations/20260602_multi_account_close.sql
supabase/migrations/20260603_team_invites.sql
supabase/migrations/20260604_membership_permissions.sql            ← per-member permission picker
supabase/migrations/20260605_widget_anon_access.sql                ← public booking widget (guest bookings reach the cloud)
supabase/migrations/20260606_redeem_coupon.sql                     ← coupon maxUses actually counts down
supabase/migrations/20260607_widget_capacity_check.sql             ← atomic capacity check — stops the widget double-book race
supabase/migrations/20260608_membership_insert_guard.sql           ← ⚠️ SECURITY: stops a stranger joining any hotel as owner — paste ASAP
supabase/migrations/20260609_payment_collected_on.sql              ← payments.collected_on (correct P&L day across IST midnight / reloads)
```

> ⚠️ **`20260608_membership_insert_guard.sql` is security-critical.** Until it's run, any signed-in user can add themselves as owner of any property (the old membership-insert policy only checked `user_id = auth.uid()`, not invite/bootstrap). Because the live site already requires real sign-in, this hole is exploitable right now — paste this migration before anything else. After running, the round-9 R9-1 test in the file header should fail (good).

After each `Run`, expect a green **Success. No rows returned** message. If you get a red error, copy it back to me — but `add column if not exists` should never error on an existing column.

### Smoke-test query

After pasting all of the above, run this in the SQL Editor to confirm every column the app expects exists:

```sql
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name in ('properties', 'room_categories', 'bookings', 'rate_overrides')
order by table_name, column_name;
```

You should see (among others):
- `properties`: `short_code`, `embed_button`, `arrivals_recipients`, `tagline`, `photo_gallery`, `coupons`, `meal_plans`, `default_meal_plan_id`, `channel_commissions`, `base_capacity_adults`, `rate_plans`, `seasons`, `weekend_rules`, `channel_markups`, `payment_qr_data_url`, `logo_data_url`, `cash_accounts`
- `room_categories`: `extra_adult`, `extra_child`, `gst_rate`, `photo_data_url`
- `bookings`: `meal_plan_id`, `rate_plan_id`, `email`, `events`, `coupon_code`, `discount_amount`, `voice_notes`
- `rate_overrides`: `closed_units`
- `memberships`: `permissions`
- `pending_invites`: `permissions`

If any are missing, the migration for that table didn't run — re-paste that file.

To confirm the widget RPCs (anon access + capacity guard) are installed:

```sql
select proname from pg_proc
where proname in ('property_by_short_code', 'redeem_coupon', 'book_widget_slot',
                 'property_has_members', 'caller_has_invite');
```

All five should be listed. `book_widget_slot` is the atomic capacity check that prevents two simultaneous website bookings from double-booking the same unit; `property_has_members` / `caller_has_invite` back the membership-insert security guard (R9-1).

---

## Part 2 — Code flip (I do this when you say go, ~10 seconds)

In `src/App.jsx`, line ~42:

```js
const HARDCODED_DEMO_MODE = true;   // ← change to false
```

I commit + push. Vercel auto-deploys in ~60s. The next time the live site loads:
- The SignIn screen appears (instead of going straight to the Dashboard).
- The first sign-in for your existing Supabase user creates the cloud property from your localStorage data (the bootstrap flow we tested).
- From then on, every booking / payment / setting writes to Supabase.

**One-time onboarding for you on flip day:**
1. Open `atithi-seven.vercel.app` on whichever browser you want to test with.
2. SignIn screen → enter your email.
3. Check inbox → click the magic-link → app opens signed in.
4. The onboarding wizard fires (because your Supabase account is fresh). Fill in property basics → first room category → payment QR. ~2 minutes.
5. From this point your real data lives in Supabase. Every other browser / device you sign in on from now pulls the same data.

**Your existing DEMO localStorage data stays in your browser** but won't appear in the cloud app — that's expected and was the plan all along.

---

## Part 3 — Optional: public booking widget production deploy

The widget (`/book/<slug>`) works perfectly when **you** open it (signed-in hotelier on their own device). To accept bookings from **strangers on your hotel's website**, you need one Supabase RLS policy that lets the anonymous role insert a booking with `status='tentative'` and `channel='website'` — and a way for the anon-mode widget to find your property from its URL slug.

This is the only piece NOT yet wired. Three SQL steps when you want to enable it:

```sql
-- 1. Anonymous role can read just the property by slug (for the widget header)
create or replace function public.property_by_short_code(p_short_code text)
returns table(id uuid, name text, type text, city text, state text, theme jsonb,
              logo_data_url text, payment_qr_data_url text, payment_qr_label text,
              tagline text, photo_gallery jsonb, rules jsonb, meal_plans jsonb,
              default_meal_plan_id text, base_capacity_adults integer,
              rate_plans jsonb, weekend_rules jsonb, seasons jsonb,
              channel_markups jsonb, coupons jsonb, embed_button jsonb,
              short_code text)
language sql security definer set search_path = public as $$
  select id, name, type, city, state, theme,
         logo_data_url, payment_qr_data_url, payment_qr_label,
         tagline, photo_gallery, rules, meal_plans,
         default_meal_plan_id, base_capacity_adults,
         rate_plans, weekend_rules, seasons,
         channel_markups, coupons, embed_button,
         short_code
  from properties where short_code = p_short_code limit 1;
$$;
grant execute on function public.property_by_short_code(text) to anon;

-- 2. Anonymous role can read room_categories of a property (room tiles)
create or replace function public.room_categories_by_property(p_property_id uuid)
returns setof room_categories
language sql security definer set search_path = public as $$
  select * from room_categories where property_id = p_property_id order by sort_order;
$$;
grant execute on function public.room_categories_by_property(uuid) to anon;

-- 3. Anonymous role can insert ONLY website-channel tentative bookings
create policy "anon insert widget bookings" on bookings
  for insert to anon
  with check (channel = 'website' and status = 'tentative');
```

Until you run these, the widget URL will load the property data only if a signed-in hotelier opens it. After Phase 5 we'd add rate-limiting (Edge Function token bucket) to prevent abuse; the policy above is the bare minimum to make the widget functional.

---

## What I just verified before writing this

✅ Every field on the booking object round-trips through `cloudBookingToLocal` ↔ `localBookingToCloud` ↔ `patchLocalToCloud` and has a matching Postgres column.

✅ Every field on the property object round-trips through `cloudToLocalProperty` ↔ `localToCloudProperty` and has a matching Postgres column.

✅ Every field on the room_category object round-trips and is in the columns the converters reference.

✅ `saved_custom_extras`, `rate_overrides` (with the new `closed_units`), `cash_closes` all round-trip correctly.

✅ `bootstrapProperty` and `saveCloudProperty` both pass the full property object through `localToCloudProperty` so the new fields persist on both first-write and subsequent edits.

✅ All 10 migration files build the schema the converters need.

The flip is safe whenever you're ready.

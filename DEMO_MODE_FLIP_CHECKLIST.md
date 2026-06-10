# DEMO_MODE → Production flip checklist

When you're ready to switch Atithi from "runs entirely off localStorage" to "real Supabase backed product that real hoteliers can sign in to", work through this list top to bottom. It's deliberately small — the heavy lifting is paste-and-run SQL and a single one-line code change.

Last updated: Jun 5, 2026 (final launch audit — corrected paste-order note + smoke tests; DEMO_MODE is already flipped to false and live, see Part 2).

> **Status: the code flip is already DONE.** `HARDCODED_DEMO_MODE = false` is live — the site already requires real sign-in. So the only remaining go-live work is the Supabase setup below (Part 1) + the dashboard config (Part 2). Part 3 (public widget) and the CAPTCHA are optional/when-ready.

---

## Part 1 — Supabase SQL (you do this, ~5 minutes)

Open https://supabase.com/dashboard → project `vaerzwmglfwslvqqcyhx` → **SQL Editor**. For each of these files, open the file from the repo, copy the entire contents, paste into the SQL Editor, click **Run**. **Paste them top-to-bottom in the order listed.** Each file is idempotent (safe to re-run), but a few depend on earlier ones — `20260611` must come before `20260613`, and `20260605` before `20260610` — so top-to-bottom is the safe order. (`20260518` is the one exception that errors if re-run on an existing DB — skip it if your DB already exists.)

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
supabase/migrations/20260610_coupon_privacy.sql                    ← coupon codes no longer leak to the public; secure server-side coupon check
supabase/migrations/20260611_enforce_permissions.sql               ← ⚠️ RBAC: staff permissions enforced in the DB (owner always safe — can't be locked out)
supabase/migrations/20260612_widget_rate_limit.sql                 ← OPTIONAL: per-property flood cap on the public booking link (see file header for the trade-off)
supabase/migrations/20260613_rbac_consistency_fixes.sql            ← ⚠️ RBAC follow-up: fixes payment/day-close/invoice permission mismatches (paste AFTER 20260611)
supabase/migrations/20260614_rate_override_notes.sql               ← per-date notes on the Rates calendar (team-only; works locally without it)
supabase/migrations/20260615_widget_rate_overrides.sql            ← public booking widget quotes your calendar rates + honours close-outs
supabase/migrations/20260616_widget_hardening.sql                 ← ⚠️ before sharing the public link: date floor + close-out enforcement + unit allocation + paid=0 (supersedes 20260607/20260612)
supabase/migrations/20260617_accept_invite.sql                    ← ⚠️ SECURITY: invited staff can't self-assign 'owner' (accept_invite RPC forces role; paste AFTER 20260608)
supabase/migrations/20260618_audit_log_actor.sql                  ← OPTIONAL low-priority: a member can't forge the actor on an activity-log row
supabase/migrations/20260619_widget_advanced_pricing.sql         ← public widget enforces min-nights + single-occupancy + the "Multiple rate plans" master toggle (RE-PASTE this one — updated Jun 9 to add ratePlansEnabled; idempotent, safe to re-run)
supabase/migrations/20260620_push_subscriptions.sql              ← phone notifications: stores which devices opted into booking alerts (needed for Web Push; see Part 2 for the 2 env vars)
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
- `rate_overrides`: `closed_units`, `note`
- `memberships`: `permissions`
- `pending_invites`: `permissions`

If any are missing, the migration for that table didn't run — re-paste that file.

To confirm the widget RPCs (anon access + capacity guard) are installed:

```sql
select proname from pg_proc
where proname in ('property_by_short_code', 'room_categories_by_property',
                 'bookings_by_property_public', 'redeem_coupon', 'book_widget_slot',
                 'property_has_members', 'caller_has_invite',
                 'validate_coupon', 'has_perm', 'rate_overrides_by_property',
                 'accept_invite');
```

All ten should be listed (`room_categories_by_property` + `bookings_by_property_public` are what the public widget reads to show room tiles + availability). `book_widget_slot` is the atomic capacity check that prevents two simultaneous website bookings from double-booking the same unit; `property_has_members` / `caller_has_invite` back the membership-insert security guard (R9-1); `validate_coupon` is the secure server-side coupon check (R9-4); `has_perm` is the database-level permission check that powers the RBAC enforcement in 20260611 (R9-6); `rate_overrides_by_property` feeds the public widget your per-date calendar prices + close-outs (note: it deliberately does NOT expose per-date notes, which stay private).

### Test the permission enforcement (R9-6) without risk

`has_perm` returns TRUE for the **owner** role on every permission, so your owner account can never be locked out. To verify the gate actually restricts staff: invite a second email as **reception**, sign in as that user, and confirm it can take a booking + payment but the "Void invoice" / settings-save calls are blocked at the DB. If anything misbehaves, the kill-switch (drop the `perm %` policies) is documented at the bottom of `20260611_enforce_permissions.sql` and reverts to the prior behaviour without touching reads or your owner access.

---

## Part 2 — Code flip (DONE) + Supabase dashboard config (you confirm)

**The code flip is already done.** `src/App.jsx` has `const HARDCODED_DEMO_MODE = false;` — committed and live. The site already shows the SignIn screen and requires a real magic-link sign-in. There is no code change left to make.

**But the live sign-in only works if the Supabase dashboard is configured. Confirm these two settings** (Supabase → Authentication → URL Configuration):
1. **Site URL** = `https://atithi-seven.vercel.app`
2. **Redirect URLs** includes `https://atithi-seven.vercel.app/` (and the GitHub Pages mirror `https://museinall-ui.github.io/atithi/` if you use it).

If these aren't set, the magic-link email's link won't land you signed in — sign-in will silently fail. **This is the single most common go-live gotcha.**

**Then test sign-in end to end:**
1. Open `atithi-seven.vercel.app` (logged out).
2. Enter your email → check inbox → click the magic-link → confirm the app opens signed in.
3. First sign-in fires the onboarding wizard (fresh Supabase account): property basics → first room category → payment QR. ~2 minutes.
4. From this point your data lives in Supabase and syncs across every device you sign in on.

**Optional auth + email setup (each degrades gracefully if skipped):**
- **Google sign-in:** create a Google Cloud OAuth client + enable Google in Supabase → Authentication → Providers. Until then the "Continue with Google" button shows a friendly "not set up yet" hint; magic-link works regardless.
- **"Send to CA" email (Resend):** add `RESEND_API_KEY` (+ optional `RESEND_FROM`) in Vercel → Settings → Environment Variables, then redeploy. Until then "Send to CA" falls back to opening your mail app + a printable register.
- **Phone notifications on new bookings (Web Push):** (1) run `20260620_push_subscriptions.sql` (in the Part 1 list); (2) in Vercel → Settings → Environment Variables add `VAPID_PRIVATE_KEY` = the private key from Claude, and `SUPABASE_SERVICE_ROLE_KEY` = the `service_role` secret from Supabase → Project Settings → API (optional: `VAPID_SUBJECT` = `mailto:you@yourhotel.com`); (3) redeploy. Then in the app: **Settings → Notifications → Turn on alerts** on each device that should buzz. Until the env vars are set, the toggle shows a "setup not finished" hint and no alerts fire — nothing else changes. (The matching VAPID *public* key is already baked into the app + the serverless function.)

---

## Part 3 — Optional: take the public booking widget live

The widget (`/book/<slug>`) lets **strangers on your hotel's website** book directly. The anon access it needs is **already in the migrations in Part 1** — `20260605_widget_anon_access.sql` (read property by slug + room categories + public bookings, insert tentative website bookings), `20260607` (atomic capacity check), `20260610` (coupon privacy — keeps your codes off the public lookup). Once those are pasted, the widget works against the cloud.

> ⚠️ Do NOT paste any hand-written `property_by_short_code` SQL — an earlier version of this checklist had inline SQL here that would *re-leak* coupon codes to the public. The migration files (`20260605` + `20260610`) are the correct, current versions. Just paste the migrations.

**Test it before sharing the link:** open `atithi-seven.vercel.app/book/<your-short-code>` in a **private/logged-out** window, complete a booking, and confirm it lands in your diary as a tentative `website` booking.

**Before sharing the link publicly to untrusted traffic, do the anti-abuse step:**
- **CAPTCHA (recommended):** Cloudflare Turnstile on the booking form, verified inside `book_widget_slot`. Free + invisible to real guests. **Owner action: create a free Turnstile account when ready, then I wire it.** (Tracked as an open to-do.)
- Or the crude interim cap: paste the optional `20260612_widget_rate_limit.sql` (read its header for the trade-off).
- Also when the widget goes public: the capacity RPC doesn't yet subtract maintenance close-outs, and `redeem_coupon` can be scripted — both are queued for the public-launch hardening pass.

---

## What I just verified before writing this

✅ Every field on the booking object round-trips through `cloudBookingToLocal` ↔ `localBookingToCloud` ↔ `patchLocalToCloud` and has a matching Postgres column.

✅ Every field on the property object round-trips through `cloudToLocalProperty` ↔ `localToCloudProperty` and has a matching Postgres column.

✅ Every field on the room_category object round-trips and is in the columns the converters reference.

✅ `saved_custom_extras`, `rate_overrides` (with the new `closed_units`), `cash_closes` all round-trip correctly.

✅ `bootstrapProperty` and `saveCloudProperty` both pass the full property object through `localToCloudProperty` so the new fields persist on both first-write and subsequent edits.

✅ All 10 migration files build the schema the converters need.

The flip is safe whenever you're ready.

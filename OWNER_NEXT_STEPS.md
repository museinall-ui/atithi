# Owner next steps — your action list

Plain-language, do-it-yourself checklist. The app code is done and live; these
are the **external setup steps only you can do** (accounts, dashboard settings,
env vars), plus the one prerequisite for the CAPTCHA so I can build it.

Work top to bottom. Nothing here needs a terminal. Last updated: 2026-06-29.

---

## 1. CAPTCHA on the public booking link

**Why:** your booking link (`atithibook.com/book/<your-hotel>`) talks straight
to the database, so a normal website rate-limit can't protect it. A CAPTCHA
(Cloudflare Turnstile) stops bots while staying invisible to real guests. This
is the one thing standing between you and safely sharing the link publicly.

**✅ Done:** Turnstile widget created; Site Key baked into the app; the booking
form now shows the "I'm human" check and a serverless verifier
(`api/widget-book.js`) was built. Until you do the step below, the verifier
returns "not configured" and the widget books exactly as before — nothing is
broken in the meantime.

**Your remaining action (~3 min):**
1. Open Vercel → your project → **Settings → Environment Variables**:
   👉 https://vercel.com/dashboard
2. Add a variable:
   - **Name:** `TURNSTILE_SECRET_KEY`
   - **Value:** the **Secret Key** from Cloudflare Turnstile
   - Environments: tick **Production** (and Preview if you want).
3. **Redeploy** so it takes effect: Vercel → **Deployments** → top one → ⋯ →
   **Redeploy**. (Or tell me and I'll push a tiny commit to trigger it.)
4. **Test:** open `www.atithibook.com/book/<your-short-code>` in a private
   window, make a test booking — the "I'm human" check should appear and the
   booking should land in your diary.
5. **Then lock it down** (closes the last bypass): Supabase → SQL Editor → paste
   `supabase/migrations/20260702_widget_captcha_lockdown.sql` → Run. ⚠️ Only
   after step 4 succeeds — pasting it earlier stops the form from booking.

(The Secret Key lives only in Vercel — never in the code or the repo.)

---

## 2. Check your database is fully up to date (~3 min)

You've pasted most migrations already. Since the old checklist only covered up
to `20260620`, here's a quick way to confirm the newer ones landed **without
re-pasting 40 files**. (Re-running any migration is safe — it just says
"Success" and changes nothing — so when in doubt, paste it.)

Open https://supabase.com/dashboard → project `vaerzwmglfwslvqqcyhx` →
**SQL Editor** → paste this → **Run**:

```sql
-- newer tables (expect: leads, push_subscriptions, expenses, pending_invites)
select table_name from information_schema.tables
 where table_schema='public'
   and table_name in ('leads','push_subscriptions','expenses','pending_invites');

-- newer booking columns (expect all 4)
select column_name from information_schema.columns
 where table_name='bookings'
   and column_name in ('ext_ota_id','ext_channel','notified_at','hold_reminder_sent_at');

-- key server functions (expect 7)
select proname from pg_proc where proname in
 ('book_widget_slot','property_by_short_code','validate_coupon','has_perm',
  'accept_invite','rate_overrides_by_property','redeem_coupon');

-- storage buckets for photos + voice notes (expect: property-media, property-audio)
select id from storage.buckets where id in ('property-media','property-audio');
```

**If anything in the expected list is missing**, open just that file from
`supabase/migrations/` and paste it:

| Missing | Paste this file |
|---|---|
| `leads` table | `20260621_leads.sql` |
| `ext_ota_id` / `ext_channel` | `20260622_aiosell_reservation_ids.sql` |
| `notified_at` | `20260627_booking_notify_once.sql` |
| `hold_reminder_sent_at` | `20260629_hold_reminder.sql` |
| `book_widget_slot` (or widget mis-quotes) | `20260626_widget_pricing_hardening.sql` then `20260628_widget_unit_allocation.sql` |
| `property-media` / `property-audio` buckets | `20260630_storage_buckets.sql` then `20260701_storage_rls_permissions.sql` |
| pending-invite errors when managing team | `20260625_invite_manage_team_rls.sql` |

(If everything came back present, you're done with this step — nothing to paste.)

---

## 3. Confirm sign-in is configured (~2 min)

The single most common go-live gotcha. In Supabase →
**Authentication → URL Configuration**, confirm:
- **Site URL** = `https://www.atithibook.com`
- **Redirect URLs** includes `https://www.atithibook.com/**` and
  `https://atithibook.com/**`

Then test: open `www.atithibook.com` logged out → enter your email → click the
magic link → you should land signed in. If the link doesn't sign you in, this
setting is the cause.

---

## 4. Google sign-in — currently NOT working (~10 min)

**Why:** the "Continue with Google" button is in the app but tapping it just
shows a "not set up yet" hint. To make it real you create a Google OAuth client
and plug it into Supabase. (Magic-link sign-in keeps working regardless — this
is purely an extra convenience.)

**Part A — Google Cloud (get a Client ID + Secret):**
1. Go to https://console.cloud.google.com → create a project named `AtithiBook`.
2. Left menu → **APIs & Services → OAuth consent screen**:
   - User type **External** → Create.
   - App name `AtithiBook`, your support email, your developer email → Save.
   - When done, click **Publish app** (so any guest can sign in, not just test
     users). The basic email/profile scopes need no Google review.
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**:
   - Application type: **Web application**, name `AtithiBook web`.
   - Under **Authorized redirect URIs**, add exactly:
     `https://vaerzwmglfwslvqqcyhx.supabase.co/auth/v1/callback`
   - Click **Create**. Copy the **Client ID** and **Client Secret**.

**Part B — Supabase (turn the provider on):**
4. Supabase → **Authentication → Providers → Google** → toggle **Enabled**.
5. Paste the **Client ID** and **Client Secret** from step 3 → **Save**.

That's it — the "Continue with Google" button now signs people in. (You can do
this yourself; or paste the Client ID + Secret to me and I'll confirm the
redirect/settings line up. The Secret is sensitive — but it lives only in
Supabase, never in the code.)

**Test:** open `www.atithibook.com` logged out → "Continue with Google" → pick
your Google account → you should land signed in.

---

## 5. WhatsApp enquiry number (optional, ~2 min)

Your landing page's "Try Demo" button wants a WhatsApp number to message you.
When you have one for sales/demo enquiries:
- Vercel → your project → **Settings → Environment Variables** → add
  `VITE_CONTACT_WA` = your number in full international form, digits only
  (e.g. `919812345678`).
- Then **redeploy** (Vercel → Deployments → ⋯ → Redeploy), or tell me and I'll
  push a tiny commit to trigger it.

---

## 6. AIOSELL (OTA sync) — waiting on a pilot property

Everything is built and all 5 env vars are set. The only blocker is that there's
no live hotel to connect yet (Yatra Desert Camp is closed as a business). **The
day you have a first real property**, tell me — it's a ~20-minute pass:
1. I push a tiny commit so Vercel picks up the env vars (they need a fresh deploy).
2. You fill AIOSELL's onboarding form with the real property.
3. AIOSELL gives you the hotel + room codes; you map them in the Operator Console.
4. We send a test push + a test reservation to confirm both directions work.

Nothing to do until a property lands.

---

## What's already done (no action needed)

- Magic-link sign-in is live (`DEMO_MODE` already flipped off).
- Photos + voice notes moved to Supabase Storage; migrations pasted + verified.
- Phone push alerts (`VAPID` + service-role key) set + verified live.
- AIOSELL env vars all set.
- Resend "Send to CA" email — optional; falls back to your mail app if unset.
- (Google sign-in is built but not yet switched on — see step 4 to enable it.)

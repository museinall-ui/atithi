# Atithi — audit fixes gist (rounds 7–9)

Plain-language summary of everything fixed, what you still need to paste into
Supabase, and what to sanity-check. Generated for the owner's review.

---

## 1. What you need to paste into Supabase

You already pasted `20260607`–`20260610`. **One new required file** + **one
optional file** since then — open each from the repo, copy all, paste into
**Supabase → SQL Editor → Run** (expect a green "Success"):

1. **`supabase/migrations/20260611_enforce_permissions.sql`** ← required
   Enforces staff permissions in the database (see §3 — this is R9-6, the
   "what reception can/can't do is now real, not just hidden in the screen"
   fix). **Designed so it can never lock you out** — your owner account always
   has full access. Safe to re-run; has a one-line kill-switch in the file.
2. **`supabase/migrations/20260612_widget_rate_limit.sql`** ← optional
   A crude flood cap on the public booking link (see §3 — R9-5). Optional;
   read the trade-off in the file header before deciding. Skip it if you'd
   rather wait for the CAPTCHA approach I recommend below.

Both are safe to re-run, and the app works fine even before you paste them
(it falls back gracefully) — but paste `20260611` to get the permission fix.

---

## 2. What got fixed (all live on the site now)

**Money / billing correctness**
- Reception and the website now quote the **same price** for the same dates
  (one shared rate calculator: weekend + season + per-day overrides).
- The extra-adult / extra-child surcharge now actually applies **everywhere**
  (it had been silently ₹0 — a field was being dropped app-wide).
- The website now charges that surcharge too (was undercharging).
- The CA invoice register splits GST at the real 5% / 18% rate (not the old
  retired 12%).
- "Earned this month" on the Dashboard now shows money **actually received
  this month** (was showing all-time billed).
- Coupon discounts show as their own line on the voucher + booking page.
- Editing a booking no longer wipes the balance, and now keeps date + child
  count changes.

**Booking integrity**
- The website can no longer double-book the same room two ways (multi-room
  bookings + an atomic capacity check on submit).
- Dragging a booking to a different room type sticks instead of snapping back.
- Zero-price holds now auto-release like any other.

**Security**
- A stranger with a free account can no longer add themselves to your hotel
  (DB rule — the `20260608` you pasted).
- Coupon codes no longer leak to the public (`20260610` above).
- Guest "special request" text can no longer run code in your browser when
  you open a voucher (XSS).

**Crashes / robustness**
- Deleting a room type that still has bookings no longer blank-screens the app.
- Several "₹NaN", stale-data, and silent-failure paths fixed.

**Hindi (Hinglish)**
- Expenses, Activity, Reports, and the main Settings screen now read in
  natural Hinglish. (The deep property-setup form was left in English by your
  call — it's rarely seen.)

**Plus** the original round-7 list (check-in date on edit, widget URL slug,
PWA install icons + an always-present "install app" button, cross-device sync
gaps, etc.).

---

## 3. The two items I'd flagged as "needs a decision" — now resolved

**Staff permissions enforced in the database (R9-6) — DONE, lockout-safe.**
Previously the limits on what reception/manager staff could do lived only in
the screen, so a technical person could bypass them from the browser. Now
`20260611_enforce_permissions.sql` enforces them in the database too. The
design is built so it **cannot lock you out**:
- Your **owner** account always has full access — the permission check returns
  "yes" for the owner on everything, no matter how anything is configured.
- Only *writing* is restricted; *reading* stays fully open, so a
  mis-permissioned staffer can still see everything and you fix it in
  Settings → Team.
- It's *added on top of* the existing rules, so the kill-switch is just
  "drop the new rules" (documented at the bottom of the file).
- The database rules mirror the app's permission logic exactly, so screen and
  database always agree.
- **How to test safely:** invite a second email as *reception*, sign in as
  them, confirm they can take a booking + payment but can't void an invoice or
  change settings — while your owner account still does everything.

**Rate-limiting the public booking link (R9-5) — my recommendation + an
optional stopgap.** The booking widget talks **straight to Supabase**, not
through your website host, so a Vercel/website-level limit can't see those
calls — that rules out the "edge function" approach. The two real options:
- **My recommendation: a CAPTCHA on the booking form** (Cloudflare Turnstile —
  free, invisible for most users), verified inside the booking RPC. This stops
  bots *without ever blocking a real guest*. It needs ~half a day of wiring +
  a free Turnstile account. I'd do this when the public link goes live to real
  traffic. **Tell me when you want it and I'll build it.**
- **Optional stopgap now:** `20260612_widget_rate_limit.sql` caps website
  holds at 40/property/hour. It's crude — because the RPC can't see the
  visitor's IP, a flood that fills the cap would also briefly block real
  guests. The cap is set high enough that normal traffic never trips it. Paste
  it only if you want *some* ceiling before the CAPTCHA lands; otherwise skip.

Neither is urgent for normal use; both matter more as the public booking link
gets heavy traffic.

---

## 4. Sanity-check pointers (on the live site)

Open **atithi-seven.vercel.app/?demo=1** (the `?demo=1` lets you poke around
without signing in), and spot-check:
- **Reports** → "Earned this month" looks like real collections; the Daily
  P&L + take-home cards read sensibly. Flip language to हिंदी (Settings →
  Language) to see the Hinglish.
- **New booking** → make a 2-night weekend stay and confirm the price matches
  what the **website widget** (`?book=1`) quotes for the same dates.
- **Settings** → the install-app card shows a button; the screen reads in
  Hinglish when language = हिंदी.
- **A booking** → open one, check the folio adds up; if you use coupons, the
  discount shows as its own line.

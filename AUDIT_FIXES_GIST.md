# Atithi — audit fixes gist (rounds 7–9)

Plain-language summary of everything fixed, what you still need to paste into
Supabase, and what to sanity-check. Generated for the owner's review.

---

## 1. What you need to paste into Supabase (do these 2)

You already pasted `20260607` (widget double-book guard) and `20260608`
(security: stranger-can't-join-your-hotel). Two more are new since then —
open each file from the repo, copy all, paste into **Supabase → SQL Editor →
Run** (expect a green "Success"):

1. **`supabase/migrations/20260609_payment_collected_on.sql`**
   Stores the real date a payment was collected, so the Reports money-by-day
   numbers stay correct after a refresh (they could drift by a day for
   late-night payments otherwise).
2. **`supabase/migrations/20260610_coupon_privacy.sql`**
   Stops your coupon codes from being readable by anyone who opens your
   booking link, and switches coupon checks to a secure server lookup.

Both are safe to re-run, and the app works fine even before you paste them
(it falls back gracefully) — but paste them to get the full fix.

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

## 3. Two items I deliberately did NOT rush (need a real decision/testing)

- **Staff permissions enforced in the database (R9-6).** Today the limits on
  what reception/manager staff can do are enforced in the screen only — a
  technical person could bypass them. Enforcing this in the database is the
  right fix, but doing it carelessly could lock *you* out of your own data, so
  it needs careful design + testing of every role. Recommend a dedicated pass.
- **Rate-limiting the public booking link (R9-5).** Stops a script from
  flooding your diary with fake holds. The widget talks straight to Supabase
  (not via the website host), so the fix is either a Supabase-level limit or a
  CAPTCHA on the booking form — your call on which.

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

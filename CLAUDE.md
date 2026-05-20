# Atithi — Hotel Booking Engine

Mobile-first hotel PMS / booking engine for small Indian hoteliers. Demo property: **Yatra Desert Camp, Jaisalmer, Rajasthan**.

**Live (primary):** https://atithi-seven.vercel.app/ — auto-deploys from `main` on every push (~60s)
**Live (mirror):** https://museinall-ui.github.io/atithi/ — manual deploys only
**Repo:** https://github.com/museinall-ui/atithi
**Supabase project:** `vaerzwmglfwslvqqcyhx.supabase.co` — Mumbai region, free tier

## About the user
The owner is **non-technical** (runs the hotel business, not a developer). Explain things in plain language. Avoid jargon unless you also define it. Step-by-step instructions should assume zero terminal/coding experience. When suggesting tools, prefer cloud-based options (StackBlitz, Vercel, Codespaces, Supabase dashboard) over local installs.

The user prefers **small reviewable chunks**: code → preview check → commit + push → 1-click merge PR → Vercel auto-deploys. Two clicks max to ship a change. The user gets frustrated when things take too long or when I miss obvious bugs they have to flag; do a self-audit before declaring something done.

## Stack
- Vite + React 18 (ES modules, no TypeScript)
- No routing library — state-based `go(routeName, arg)` pattern in `src/App.jsx`
- Inline styles throughout (no CSS files, no Tailwind)
- Design tokens in `src/tokens.js` → exported as `T` object (oklch color system)
- Google Fonts: Geist, Noto Sans Devanagari, JetBrains Mono
- **Supabase** (cloud Postgres + auth) for data persistence — see `src/cloud/` + `src/supabase.js`
- **localStorage** as a mirror / offline fallback (some keys are still local-only — see below)

## Running locally
```bash
npm install        # one-time
npm run dev        # start dev server → http://localhost:5173/atithi/
```
Requires Node.js (use the official installer from nodejs.org — LTS or Current both work). Vite reads `PORT` env var, so the Claude Preview tooling can assign any free port.

## Cloud / browser-only options (preferred for non-technical use)
- **Vercel:** wired. Push to `main` on GitHub → auto-build → live at atithi-seven.vercel.app in ~60s
- **StackBlitz:** `https://stackblitz.com/github/museinall-ui/atithi` — runs the app in a browser tab, zero install
- **GitHub Codespaces:** full cloud dev env, 60 free hours/month
- **Supabase dashboard:** all schema / table edits happen here. `supabase/migrations/` is for reference + reproducibility — files there have to be pasted into the SQL Editor manually (no CLI wired up).

## Deploy
- **Vercel (auto):** every push to `main` triggers a build. `vercel.json` adds the SPA rewrite. `vite.config.js` detects `VERCEL`/`NETLIFY` env vars and switches the base path to `/` (vs `/atithi/` for GitHub Pages / localhost).
- **GitHub Pages (manual):** `npm run build` → upload `dist/` to the `gh-pages` branch.

---

## Architecture

### Phase 1 status: cloud migration largely done
Bookings, payments, invoices, properties, room categories and memberships all flow through Supabase end-to-end. Three localStorage keys still need cutover (see below). The app reads from cloud on sign-in and writes through per-action with optimistic local updates; localStorage stays as a mirror so the app keeps working if a sync errors transiently.

### Auth
- Email magic-link only (Supabase Auth → email provider). No password.
- Google OAuth: configured to add later — not wired yet.
- Sign-in screen at `src/screens/SignIn.jsx`; app gated behind it in `src/App.jsx`. Sign-out lives in Settings → Account.

### Multi-tenant model
- One **property** = one hotel (tenant).
- One or more **users** linked via `memberships(user_id, property_id, role)` where role is `owner`/`manager`/`reception`. Phase 6 will surface role-based UI; right now everyone signs up as their own owner via the bootstrap flow.
- Every business table carries `property_id`. RLS policy uses the `has_property_access(property_id)` helper (security definer) to scope reads + writes to the user's properties.

### Routing — `src/App.jsx`
```
go('home')                      → Dashboard
go('diary')                     → Diary (Gantt calendar)
go('new')                       → NewBooking (4-step flow)
go('new', { prefill: {date, roomTypeId} })  → NewBooking with prefill (from Diary cell click)
go('new', 'BK-XXXX')            → NewBooking in edit mode
go('booking', 'BK-XXXX')        → BookingDetail
go('booking-confirmed')         → BookingConfirmed
go('rates')                     → Rates
go('channels')                  → Channels
go('reports')                   → Reports
go('guests')                    → Guests
go('settings')                  → Settings
go('more')                      → MoreMenu
```

The `'new'` route's `arg` is either a string (booking id → edit) or an object (prefill payload). App.jsx discriminates by `typeof`.

### Date anchor — `src/data.js`
All day-index math is anchored to **today** (local midnight), computed once at module load.

```js
export const ANCHOR = (() => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
})();
```

Helpers (all from `data.js`):
- `ymd(date)` — local YYYY-MM-DD (avoids toISOString's UTC drift)
- `idxToDate(idx)` → 'YYYY-MM-DD'
- `dateToIdx(dateStr)` → integer offset from ANCHOR (negative = past)
- `DAYS` — 14-day window starting from ANCHOR (idx 0 = today)

The cloud schema stores actual `DATE` values on bookings; the day-idx model is a UI convenience. Conversion happens at the cloud boundary via `idxToDate` / `dateToIdx`.

**Past dates:** the Diary's `generateDays(pastN, futureN)` extends backward by default (`pastDays = 7`) so recent past bookings are visible. The jump-to-date picker auto-extends `pastDays` further when an older date is picked.

### State (lifted to App.jsx)
Loaded on sign-in from Supabase, mirrored to localStorage:
- `bookings` — booking objects, includes embedded `payments[]` and `invoices[]` reassembled on load
- `property` — full property profile (profile, categories, rules, amenityIds, customAmenities, accountant, gstin, theme, invoiceCounters)

Local-only (Phase 1 cutover pending — see "What still needs work"):
- `savedCustomExtras` — reusable add-on pool
- `rateOverrides` — per-day rate / close-out by category
- (`cashCloses` lives in its own `localStorage` ledger, also local-only)

Per-user / per-browser preference (local only):
- `plan` — `'engine' | 'channels' | 'invoicing'`
- `lang` — `'en' | 'hi'`

Auth + sync state:
- `session` — Supabase session (null when signed out)
- `authReady` — has the initial getSession() resolved
- `propertyId` — uuid of the user's primary property
- `cloudReady` — has the property + bookings load completed

UI state (not persisted):
- `route`, `editing`

### localStorage keys (under `atithi.*.v1` prefix)
| Key | Holds | Sync state |
|---|---|---|
| `atithi.bookings.v1` | All booking objects | Cloud (Chunk 4) ✓ |
| `atithi.property.v1` | Full property profile | Cloud (Chunk 3) ✓ |
| `atithi.customExtras.v1` | Saved custom extras | **Local-only — Chunk 5 TBD** |
| `atithi.rateOverrides.v1` | Per-day rate / close-out | **Local-only — Chunk 5 TBD** |
| `atithi.cashCloses.v1` | Daily cash-close snapshots, keyed by ISO date (today's real date) | **Local-only — Chunk 5 TBD** |
| `atithi.plan.v1` | Current plan tier | Local-only (per-user preference) |
| `atithi.lang.v1` | Language preference | Local-only (per-user preference) |
| `atithi.bookings.seeded.v1` | One-time migration flag | Local-only |

To wipe state for a fresh start: clear the bookings + payments + invoices tables in Supabase (Table Editor), then in browser console: `localStorage.removeItem('atithi.bookings.seeded.v1')` and hard-refresh.

### Cloud module structure
- `src/supabase.js` — singleton client + auth helpers (signInWithEmail, signOut)
- `src/cloud/property.js` — load / bootstrap / save property + room_categories + membership
- `src/cloud/bookings.js` — load, seed, and per-action CRUD; date-conversion helpers (re-exported from data.js); issueInvoiceCloud (uses `issue_invoice()` RPC)

### Supabase schema — `supabase/migrations/`
- `20260518_initial_schema.sql` — initial 10 tables + RLS + has_property_access() + issue_invoice() stored proc
- `20260519_plan_and_invoice_prefix.sql` — drops the strict plan check constraint (3rd tier added) + extends issue_invoice() with `p_prefix` arg

Tables: `properties`, `memberships`, `room_categories`, `bookings`, `payments`, `invoices`, `rate_overrides`, `saved_custom_extras`, `cash_closes`, `audit_log`. RLS on every table scoped via `has_property_access(property_id)`. Booking IDs auto-generated by `bookings_global_seq` trigger (BK-XXXX format starting at 2854).

`issue_invoice(p_booking_id, p_fy, p_amount, p_recipient, p_prefix, p_items, p_note)` is the only safe way to mint an invoice — atomically bumps the per-FY counter on the property row and inserts the invoice in one transaction. The prefix defaults to 'INV' but is customisable per property.

### Plan tiers (3) — `src/screens/Settings.jsx`
- **engine** — booking + diary + reports
- **channels** — engine + OTA sync (currently a "Coming soon" placeholder; channel-manager partnership TBD)
- **invoicing** — channels + GST toggle on bookings + Issue invoice + invoice prefix/counter settings + monthly CA export

Plan stored in localStorage only (per-user, not synced to cloud). Old 'gst' values auto-migrate to 'invoicing'. Plan-gated UI: BookingDetail's Invoice section, the GST toggle, the folio CGST/SGST rows, the Property Profile invoice prefix + last-invoice-number fields.

### Action functions in App.jsx
All passed down as props. Local state updates synchronously (optimistic); cloud sync is fire-and-forget per action with `console.error` on failure.

- `addPayment(bookingId, entry)` — append to payments[], compute new paid + status, sync via `addPaymentCloud`
- `setStatus(bookingId, status)` — sync via `updateBookingCloud`; auto-clears releaseTs/releaseAt when leaving tentative
- `extendHold(bookingId, hours)` — push releaseTs further out, sync to cloud
- `moveBooking(bookingId, patch)` — used by Diary drag-drop, sync to cloud
- `setBookingGst(bookingId, value)` — toggle gst_applies, sync to cloud
- `issueInvoice(bookingId, partOrParts)` — **async**. Single-recipient. Uses `issue_invoice()` RPC for atomic numbering with prefix from `invoicePrefixOf(property)`. Offline fallback uses local counter.
- `voidInvoice(bookingId, invoiceId)` — mark voided, sync to cloud
- `addSavedCustomExtra` / `removeSavedCustomExtra` — local only (Chunk 5)
- `onCreate(data, total)` — **async**. New: cloud assigns BK-XXXX via DB trigger, no client-side id generation. Edit: cloud update via `updateBookingCloud`.
- Auto-release ticker (every 30s) — also syncs cancellations to cloud (uses refs so the interval doesn't capture stale cloudReady/propertyId)

### Theme injector (App.jsx, useEffect)
Unchanged: writes `--atithi-primary*` CSS vars onto `:root` and syncs `<meta name="theme-color">` to the brand colour.

### Auth + cloud-load useEffects (App.jsx)
1. Mount — `supabase.auth.getSession()` + subscribe to `onAuthStateChange`. Sets `session` and `authReady`.
2. On `session.user.id` change — load property + bookings from cloud. First-time bootstrap if no membership yet: creates property + owner membership + seeds room categories from current localStorage data. Bookings re-seed gated by `atithi.bookings.seeded.v1` flag.
3. Property edits — debounced (600 ms) `saveCloudProperty` push.

---

## Data shapes

### Booking object (multi-room capable)
```js
{
  id: 'BK-2854',                // server-assigned by DB trigger
  roomTypeId: 'dlx',            // primary type (mirrors roomItems[0].roomTypeId for legacy callers)
  unitIdx: 0,                   // primary unit (Diary positions the pill against this)
  startIdx: 5,                  // day idx from ANCHOR (today); can be negative for past bookings
  nights: 3,
  guest: 'Aanya Sharma',
  phone, country, formC,
  status,                       // confirmed | checkedin | checkout | tentative | cancelled
  channel,                      // direct | mmt | goibibo | booking | agoda | airbnb
  total, paid,
  guests, vip, notes,
  gstApplies,                   // explicit per-booking flag (null = use channel default)
  state,                        // deprecated; kept for back-compat with existing rows

  // Multi-room support. Each item can have its own roomTypeId.
  roomItems: [
    { roomTypeId: 'dlx', adults: 2, children: 0, rate: 4500, perNight: false, nightRates: undefined, unitIdx?: 0 },
    { roomTypeId: 'lux', adults: 2, children: 0, rate: 7200 }
  ],
  extras: { breakfast: 2 },
  customExtras: [],
  extraPrices: {},

  // GST / invoicing (only surfaced when plan === 'invoicing')
  invoices: [{ id, number, fy, date, amount, recipient, items, note, voided }],
  payments: [{ id, kind, method, amount, note, date }],

  releaseTs,                    // epoch ms; null when not on hold
  releaseAt,                    // display string '18:00'
  holdHours, autoReleased,
}
```

**Multi-room Phase 1 limitation:** the Diary only renders one pill per booking (positioned against `roomTypeId` + `unitIdx`). Additional rooms in `roomItems` show in BookingDetail but don't yet block inventory visually. Per-room unit allocation + multi-pill rendering is queued for the next chunk.

### Property object
```js
{
  profile: {
    name, type, address, city, state, pincode,
    landmark, mapUrl,
    checkIn, checkOut, phone, email, website,
  },
  categories: [
    { id, name, units, base, amenityIds: ['ac', 'heater', ...] }
  ],
  rules: ['…'],
  amenityIds: ['wifi', 'parking', ...],
  customAmenities: [{ id, label }],
  invoiceCounters: { '2627': 12 },        // last-used seq per Indian FY
  accountant: {                            // CA contact + a few misc property flags piggybacking on this jsonb to avoid schema migrations
    name, email, firm,
    invoicePrefix,                         // default 'INV'; format is {PREFIX}-{FY}-{SEQ}
    childAgeBelow,                         // default 12; informational, shown on New Booking children stepper
  },
  gstin,
  theme: { hue: 38 } | { color: '#hex' },
}
```

Legacy shapes migrated forward via `migrateProperty()` in App.jsx (covers old `{amenities: {wifi: true}}` → `{amenityIds: [...]}` and ensures all newer fields default sanely).

### Room types — `src/data.js` → `ROOM_TYPES`
Same 4 categories (Deluxe Tent, Luxury Tent, Bathtub Tent, Private Pool Cottage). `effectiveRoomTypes(property)` reads from `property.categories` (Settings-editable) with `ROOM_TYPES` colour tags layered in for known ids.

### Helpers in `src/data.js`
- **Date math:** `ANCHOR`, `ymd(date)`, `idxToDate(idx)`, `dateToIdx(dateStr)`, `DAYS`
- **GST / tax:** `bookingGstApplies(b)`, `bookingInvoiceInclude(b)`, `getTaxBreakdown(booking)` (always CGST 6% + SGST 6% now; IGST inter-state branch retired)
- **Invoices:** `currentFinancialYear(now?)` (e.g. '2627'), `formatInvoiceNumber(fy, seq, prefix='INV')`, `invoicePrefixOf(property)`, `listIssuedInvoices(bookings)`
- **Guests:** `normPhone(s)`, `repeatGuestKeys(bookings)`, `isRepeatGuest(b, repeats)`
- **`INDIAN_STATES`** export retained (used by old data) but the state picker UI was removed when IGST was retired

### Countries — `src/data.js` → `COUNTRIES`
28 countries. Non-IN codes auto-set `formC: true` on booking creation.

### Status (same as before)
checkedin / checkout are optional ("Log check-in / Log check-out" buttons in BookingDetail, soft-styled).

---

## Screens & Components

### Screens (`src/screens/`)
- **SignIn.jsx** — Email magic-link entry. Bilingual (EN/HI toggle). Brand-themed.
- **Dashboard.jsx** — Greeting (real current date), hero carousel (Occupancy / Daily income / Earned this month — all live values), Setup nudge, Today's nudges (smart suggestions), Pending payments (Cash + UPI one-tap), Auto-release timers with inline Extend Hold, Arrivals list, Channel donut chart, Daily cash-close card (keyed by real today's ISO date).
- **Diary.jsx** —
  - **Prominent jump-to-date bar at top** of the screen. Whole bar is the click target (`<input type="date">` sits invisible across it). Picking a past/future date auto-extends `pastDays` / `horizon` and scrolls to that column.
  - **Past dates visible** — default view shows 7 days of past context + 14 days future. `generateDays(pastN, futureN)` returns days with idx ranging negative to positive; `viewDaysStart` is the leftmost idx.
  - **isToday** compares `d.iso === ymd(ANCHOR)` (no more `i === 1` hardcode).
  - **Click empty cell → New Booking with prefill** — calls `go('new', { prefill: { date, roomTypeId } })`. Occupied cells stay non-clickable (booking pill handles those).
  - Drag-drop with tap-vs-drag detection via end-state check (slotChanged || dx !== 0). Touch-jitter no longer triggers the move dialog.
  - Status-coloured pills (saturated tint + bold border + filled badge), responsive name rendering (full → first → initials), horizon picker (14/30/60/90), filters (All / Confirmed / On-hold / Form C / OTA).
- **NewBooking.jsx** — 4-step flow.
  - **Step 1 (dates):** HTML5 `<input type="date">` for check-in (no default). Nights default 1. Children stepper label suffixed with the property's `childAgeBelow` (e.g. "Children <12y").
  - **Step 2 (rooms):** **Per-room type picker.** Each `roomItem` has its own type-chip selector (Deluxe / Luxury / Bathtub / Pool). Booking-level `roomTypeId` mirrors `roomItems[0].roomTypeId` for legacy callers. Per-room rate editor with optional per-night rates.
  - **Step 3 (guest):** name, country, mobile (with dial-code prefix), email, extras, special note. No state picker (retired with IGST).
  - **Step 4 (payment):** payment method, advance/full/custom, GST toggle (only on Invoicing plan), hold/release with auto-cancel timer.
  - Accepts `prefill` prop: `{ date, roomTypeId }` from Diary cell clicks. Edit mode loads existing booking via `editing` prop.
- **BookingDetail.jsx** —
  - Check-in / check-out shown via `fmtStayDay(startIdx)` — real `ANCHOR + startIdx` date (was previously the hardcoded `'{4 + startIdx} May'` string template).
  - Multi-room folio: "Rooms" row lists all `roomItems` with their types when there's more than one.
  - **Plan-gated Invoice section** (Invoicing tier only):
    - GST toggle ("Include in invoice register")
    - CGST/SGST 6% rows in the folio
    - Invoices list with View PDF + Void
    - **Issue Invoice button + sheet**
  - **IssueInvoiceSheet:**
    - Single recipient (split flow retired)
    - **"Amount includes GST" checkbox**, default ticked. Toggling switches between extracted-from-amount (inclusive) and added-on-top (exclusive). Live breakdown panel below shows pre-tax / CGST / SGST / total.
    - **Smart default amount + contextual chip:** ADVANCE (partial payment, no invoices yet), BALANCE (more paid since last invoice), FULL (paid in full, no invoices yet). The defaultAmount + kind props come from BookingDetail's payment-state computation. Hotelier can override the amount before issuing.
- **BookingConfirmed.jsx** — Celebration screen after booking creation.
- **Rates.jsx** — 30-day calendar grid anchored to today. Drag-select, overrides lifted to App.jsx and consumed by NewBooking.
- **Channels.jsx** — "Coming soon" placeholder. Real OTA sync needs a channel-manager partnership (Phase 5).
- **Reports.jsx** — Live KPIs from real bookings + ROOM_TYPES + DAYS. Subtitle shows current month/year. Month-end "Send to CA" card. Plain-English labels (Money earned, Rooms full, Per room/night, Per room/day).
- **Guests.jsx** — Search + filters (All / VIP / Repeat / Foreign / In-house). **Clicking a guest row opens their most-recent non-cancelled booking detail.** Chevron icon shown only when an openable booking exists.
- **Settings.jsx** —
  - **3-plan list** (Engine / Channels / Invoicing) as a stacked card with radio-style selection.
  - Language toggle (EN/HI).
  - Integrations (Razorpay / WhatsApp / Channel manager / Form C placeholders).
  - **Account section** with signed-in email + Sign-out button (Phase 1 auth).
  - **PropertyProfile sheet:**
    - Logo (mocked), Brand colour (7 presets + native colour picker)
    - Basics (name, type, check-in/out times)
    - Address (landmark + Google Maps link)
    - Contact
    - **Accountant section:** CA email/name/firm, GSTIN, **Invoice number prefix** (gated to Invoicing plan), **Last invoice number issued (FY YY-YY)** (gated to Invoicing plan), all stored on the `accountant` jsonb on the property
    - Room categories with collapsible amenity picker per category
    - Property-wide amenities
    - **House Rules:** new **"Children counted as below this age"** field (default 12) above the rules list — stored on `accountant.childAgeBelow`
- **MoreMenu.jsx** — 2×2 grid linking to Rates/Channels/Reports/Settings. Tab labelled "Manage" / "प्रबंधन".

### Components (`src/components/`)
Same as before: Icon (~40 SVGs), Btn, ExtendOptions, Chip, Field, Card, Avatar, Row, SectionHead, ScreenHeader, TabBar, Toggle.

### Pattern: "presets + Custom"
Hold duration, theme colour, plan tier, etc. Always include a Custom escape hatch alongside presets.

### Utilities (`src/utils/`) + top-level helpers
- **voucher.js** — `generateVoucher(b, rt, property, invoice?)`. Opens a print-ready A4 HTML page. Uses **shared ANCHOR import** from data.js (no longer computes its own anchor). Renders as TAX INVOICE when `invoice` is passed (with HSN 996311, place of supply, both GSTINs), else as booking voucher. Theme-aware.
- **invoiceExport.js** — `exportInvoiceList(bookings, property)` opens a printable A4-landscape invoice register; `emailToAccountant(invoices, property)` triggers a `mailto:` to the CA.
- **`src/i18n.js`** — `useT(lang)` hook, `STRINGS` with `en` + `hi` keys. Auth, plan tiers, sign-in flow strings added in Phase 1.
- **`src/tokens.js`** — `T` tokens + `injectBaseStyles()` + theme helpers (`THEME_PRESETS`, `themeColors(theme)`, `themeColorsFromHue(hue)`, `applyTheme(theme)`).

---

## India-specific features

### Invoicing (CA-handoff workflow) — **plan-gated to Invoicing tier**
Atithi keeps clean books; the CA decides what gets filed with GSTN. We do NOT make GST filing decisions inside the app.

- Hotelier opens a paid booking → taps **"Issue invoice (₹X)"**
- Sheet shows recipient + amount + **"Amount includes GST" toggle** + live breakdown + ADVANCE/BALANCE/FULL chip based on payment state
- On submit, the `issue_invoice()` stored procedure atomically bumps the property's per-FY counter and inserts the invoice. Number format: `{PREFIX}-{FY}-{SEQ}` (e.g. `INV-2627-001` or `ABC-2627-001` if the hotelier customised the prefix in Property Profile → Accountant).
- Gap-free numbering per GST law; voided invoices keep their slot reserved (just flagged `voided: true`).
- PDF available via "View invoice PDF" — opens the same `generateVoucher()` template in tax-invoice mode.
- At month-end: Reports → "Open invoice list + email to CA" → printable A4-landscape register + mailto.

**Advance payments:** the IssueInvoiceSheet's smart-default flow handles this — issue an ADVANCE invoice when the guest pays a deposit, then a BALANCE invoice when the rest comes in at check-out. Both linked to the same booking with sequential numbers.

### Other India-specific bits
- UPI QR code on payment step (mock SVG; needs real Razorpay — Phase 2)
- Razorpay payment link generation (mocked)
- WhatsApp Business API notifications (mocked toasts)
- Form C / FRRO for foreign nationals (auto-detected from country; e-FRRO API not wired)
- GST: always **CGST 6% + SGST 6% = 12%**, treated as inclusive in the total. IGST inter-state branch was retired (owners didn't want to track guest-state on every booking).
- OTA channels: MMT, Goibibo, Booking.com, Agoda, Airbnb (display only)
- ₹ currency formatting with `toLocaleString('en-IN')`

---

## What was added in Phase 1 (cloud migration)

### Chunks 1 + 2 — Schema + email magic-link auth
- Supabase project created (Mumbai region, free tier).
- 10-table initial schema with multi-tenant RLS via `property_id` + `memberships`. `has_property_access()` helper. `issue_invoice()` stored proc for atomic invoice numbering.
- `src/supabase.js` client + helpers; `SignIn` screen; auth gate in App.jsx; Account section in Settings with sign-out.

### Chunk 3 — Property + memberships sync
- First sign-in bootstraps a cloud property + owner membership from the user's localStorage data. Subsequent sign-ins load from cloud.
- Settings → Property Profile reads/writes Supabase. Debounced (600ms) save.
- Required the bootstrap RLS chicken-and-egg fix: property INSERT no longer uses `.select()` (which would hit the read policy before the membership exists); we mint the UUID client-side instead.

### Chunk 4 — Bookings + payments + invoices sync
- `src/cloud/bookings.js` with load + seed + per-action helpers.
- Date conversion (idxToDate / dateToIdx) lives in `data.js` and is re-exported here.
- All App.jsx action functions sync to cloud (per-action, optimistic local update + fire-and-forget cloud).
- Auto-release ticker also syncs cancellations (uses refs to avoid stale closure).
- New bookings: cloud-first, server-assigned BK-XXXX via DB trigger.
- Invoices use the atomic `issue_invoice()` RPC.

### Phase 1 UX work (multiple chunks)
- **3rd plan tier (Invoicing)** restored. Invoice features plan-gated to it.
- **Invoice prefix customisation** (Property Profile → Accountant → "Invoice number prefix"). Stored on `accountant.invoicePrefix`, default 'INV', flows through to `issue_invoice()` via `p_prefix` arg.
- **Last invoice number setter** for hoteliers continuing a sequence from another system. Stored on `property.invoiceCounters[fy]`.
- **Smart advance / balance / full invoice default** in IssueInvoiceSheet.
- **Tax-inclusive checkbox** in IssueInvoiceSheet, default ticked.
- **Multi-room booking with mixed types** — each `roomItem` carries its own `roomTypeId`.
- **Anchor → today** model. Real-time date awareness across Diary, Dashboard, BookingDetail, Reports, NewBooking, voucher.
- **Past dates in Diary** (default 7 days back, auto-extends).
- **Prominent jump-to-date bar** at the top of the Diary. Whole bar clickable.
- **Click empty Diary cell → New Booking with date + room type prefilled.**
- **Children age threshold** in property settings.
- **Guest row click → open their most-recent booking.**
- **Voucher checkIn/checkOut** uses shared ANCHOR; `BookingDetail`'s "X May" string-template bug fixed.

### Phase 1 audit-fix pass
A late audit found a cluster of "today = May 5, 2026" hardcodes that survived the anchor migration:
- Dashboard `todayKey()` was a static `'2026-05-05'`, so cash-closes never persisted under the actual date.
- Dashboard "today" filters compared `startIdx === 1` instead of `=== 0`, making Arriving / In-house / Departing / Pending all off-by-one.
- Dashboard greeting was a hardcoded "Tue, 5 May 2026".
- BookingDetail's check-in / check-out template was literally `{4 + b.startIdx} May` — always "May" regardless of the actual month.
- Reports subtitle hardcoded "May 2026".
- `dayName()` always rendered "May" / "मई".

All fixed in the audit-pass commit.

---

## What still needs work

**See [NOT_WIRED.md](./NOT_WIRED.md) for the full inventory of mock/placeholder/removed features and what each needs to be wired.** Keep that file in sync when you stub or remove a feature.

### Phase 1 remaining (small)
- **Migrate remaining localStorage keys to cloud:** `customExtras`, `rateOverrides`, `cashCloses`. Schema tables already exist (`saved_custom_extras`, `rate_overrides`, `cash_closes`); just need the load + seed + per-action helpers (mirror of what Chunk 4 did for bookings) and the one-time migration on first sign-in.
- Better error toasts for cloud sync failures — currently silent console.error only.

### Deferred features (queued, none of this is "lost")
- **Per-night different room type** within a single booking ("guest stays in Deluxe night 1, moves to Luxury night 2"). Data-model rework: `roomItems` needs a `nightTypes` array, and the Diary needs to render a single booking spanning multiple unit rows. Most stays don't change room type mid-stay, but the owner explicitly asked for this — pick it up when other priorities clear.
- **Per-room unit allocation + multi-pill Diary rendering** for multi-room bookings. Currently a booking with two rooms only shows in the Diary against the *first* room's slot; the second room is visible in BookingDetail but doesn't block inventory in the calendar.

### Functional gaps (UI-only, waiting on external services — see Production roadmap)
- **Channels** — UI is a "Coming soon" panel. Real two-way sync needs a channel-manager partnership (Phase 5).
- **Form C filing** — UI works, no e-FRRO API integration.
- **WhatsApp confirmations** — UI works, no real Business API hookup (Phase 3).
- **Razorpay UPI QR** — fake SVG, needs real Razorpay or raw UPI deeplink (Phase 2).
- **OTA channel sync** — bookings from MMT/Goibibo/etc. don't flow in (Phase 5).
- **Email-to-CA "send"** — currently opens `mailto:` and a printable register tab. No SMTP yet (Phase 3 — Resend).

### Polish opportunities (frontend, no backend dependency)
- Hindi translations for newer UI strings (invoices, accountant, plan tiers — partial today).
- Editable saved-custom-extra prices (currently can only delete).
- Undo for cancellations / auto-releases.
- Voice notes on bookings (browser MediaRecorder API).
- Global search bar (across all bookings/guests).
- Bulk actions (block dates, WhatsApp arrivals, etc.).
- Guest direct edit (currently only via their booking).
- Side-by-side panels on tablet+ (currently always a phone-frame on desktop).

---

## Production roadmap — external services

### Phase 1 — Foundation (cloud DB + auth) — ✅ Mostly done
- Supabase project + schema migrations ✓
- Email magic-link auth ✓
- Cloud sync for properties, bookings, payments, invoices ✓
- PWA wrapper (install-to-home-screen) — **TBD**
- Remaining localStorage cutover (3 keys) — **TBD**

### Phase 2 — Money flow (Razorpay / UPI) — TBD
### Phase 3 — Communication (WhatsApp Cloud API + Resend email) — TBD
### Phase 4 — Storage (Supabase Storage for logos) — TBD
### Phase 5 — Deferred (paid OTA channel manager, e-FRRO via GSP, GSTN — out of scope per product principle)
### Phase 6 — Multi-user roles — schema ready, UI/policies TBD

### Cost summary (free-tier path)
Phase 1: ₹0/month (Supabase + Vercel free).
Phase 2: pay-as-you-go on Razorpay (~2% per transaction).
Phase 3: ₹0/month within Meta WA Cloud + Resend free tiers.
Estimated free-tier ceiling per hotel: ~50 bookings/day before any phase outgrows quotas.

---

## Cleanup / housekeeping

`/project/` folder has the original Claude Design HTML/JSX handoff bundle — kept for reference, not used at runtime. `/chats/` has the original design-iteration transcripts. The live app is entirely in `/src/`. `/supabase/migrations/` has the SQL files that have been pasted into the Supabase SQL Editor.

## Important product principle

**Atithi is a books-keeper that hands off to a CA. It is NOT a GST-filing tool.** The legal responsibility for what gets filed sits with the licensed accountant, not the hotelier or the software. The hotelier issues invoices, the CA decides which appear in GSTR-1. Any future feature work should preserve this boundary.

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

### DEMO_MODE — sign-in is currently bypassed
`const DEMO_MODE = true` at the top of `src/App.jsx` skips the magic-link auth gate and renders the main app directly off localStorage. This was the owner's call so they could iterate on basics without the email round-trip. **Flip it back to `false` to re-enable Supabase auth** — no other code changes needed; the SignIn screen, auth listeners, and cloud-load effects are all still wired.

### Auth (gated by DEMO_MODE)
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
| `atithi.customExtras.v1` | Saved custom extras | Cloud (Chunk 5) ✓ |
| `atithi.rateOverrides.v1` | Per-day rate / close-out | Cloud (Chunk 5) ✓ |
| `atithi.cashCloses.v1` | Daily cash-close snapshots, keyed by ISO date (today's real date) | Cloud (Chunk 5) ✓ |
| `atithi.plan.v1` | Current plan tier | Local-only (per-user preference) |
| `atithi.lang.v1` | Language preference | Local-only (per-user preference) |
| `atithi.bookings.seeded.v1` | One-time migration flag | Local-only |
| `atithi.extras.seeded.v1` | One-time migration flag for the 3 extras tables | Local-only |

To wipe state for a fresh start: clear the bookings + payments + invoices tables in Supabase (Table Editor), then in browser console: `localStorage.removeItem('atithi.bookings.seeded.v1')` and hard-refresh.

### Cloud module structure
- `src/supabase.js` — singleton client + auth helpers (signInWithEmail, signOut)
- `src/cloud/property.js` — load / bootstrap / save property + room_categories + membership
- `src/cloud/bookings.js` — load, seed, and per-action CRUD; date-conversion helpers (re-exported from data.js); issueInvoiceCloud (uses `issue_invoice()` RPC)
- `src/cloud/extras.js` — saved custom extras, rate overrides, cash closes. Load/seed on sign-in; per-cell diff sync in App.jsx propagates UI mutations to the cloud.

### Supabase schema — `supabase/migrations/`
- `20260518_initial_schema.sql` — initial 10 tables + RLS + has_property_access() + issue_invoice() stored proc
- `20260519_plan_and_invoice_prefix.sql` — drops the strict plan check constraint (3rd tier added) + extends issue_invoice() with `p_prefix` arg
- `20260520_meal_plans_payment_qr_gst.sql` — adds `properties.meal_plans` (jsonb), `properties.payment_qr_data_url`/`payment_qr_label` (text), `properties.logo_data_url` (text), and `room_categories.gst_rate` (smallint). Every column is `add column if not exists`, so re-running the migration after later additions only applies the missing ones. **Paste into Supabase SQL Editor before flipping DEMO_MODE off.**

Tables: `properties`, `memberships`, `room_categories`, `bookings`, `payments`, `invoices`, `rate_overrides`, `saved_custom_extras`, `cash_closes`, `audit_log`. RLS on every table scoped via `has_property_access(property_id)`. Booking IDs auto-generated by `bookings_global_seq` trigger (BK-XXXX format starting at 2854).

`issue_invoice(p_booking_id, p_fy, p_amount, p_recipient, p_prefix, p_items, p_note)` is the only safe way to mint an invoice — atomically bumps the per-FY counter on the property row and inserts the invoice in one transaction. The prefix defaults to 'INV' but is customisable per property.

### Plan tiers (3) — `src/screens/Settings.jsx`
- **engine** — booking + diary + reports
- **channels** — engine + OTA sync (currently a "Coming soon" placeholder; channel-manager partnership TBD)
- **invoicing** — channels + GST toggle on bookings + Issue invoice + invoice prefix/counter settings + monthly CA export

Plan stored in localStorage only (per-user, not synced to cloud). Old 'gst' values auto-migrate to 'invoicing'. Plan-gated UI: BookingDetail's Invoice section, the GST toggle, the folio CGST/SGST rows, the Property Profile invoice prefix + last-invoice-number fields.

### Action functions in App.jsx
All passed down as props. Local state updates synchronously (optimistic); cloud sync is wrapped in `syncCloud()` from `src/cloud/sync.js` so failures surface via the SyncOverlay toast (instead of the previous silent `console.error`).

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
    logoDataUrl,                     // base64 data URL, ≤200 KB
    paymentQrDataUrl, paymentQrLabel, // base64 data URL, ≤700 KB
  },
  categories: [
    { id, name, units, base, amenityIds: ['ac', 'heater', ...],
      gstRate: 5 | 18 | null,            // null = auto-pick from slab based on base; explicit number = override
    }
  ],
  rules: ['…'],
  amenityIds: ['wifi', 'parking', ...],
  customAmenities: [{ id, label }],
  mealPlans: [                            // standard hotel-industry meal plans
    { id: 'ep',  code: 'EP',  label: 'Room only',               price: 0,    enabled: true  },
    { id: 'cp',  code: 'CP',  label: 'Breakfast included',      price: 500,  enabled: true  },
    { id: 'map', code: 'MAP', label: 'Breakfast + 1 main meal', price: 1200, enabled: true  },
    { id: 'ap',  code: 'AP',  label: 'All meals',               price: 2000, enabled: false },
  ],
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

Booking objects carry `mealPlanId` (default `'ep'`) and `email`. Both are persisted through `onCreate()` in App.jsx and surfaced on BookingDetail.

Legacy shapes migrated forward via `migrateProperty()` in App.jsx (covers old `{amenities: {wifi: true}}` → `{amenityIds: [...]}` and ensures all newer fields default sanely).

### Room types — `src/data.js` → `ROOM_TYPES`
Same 4 categories (Deluxe Tent, Luxury Tent, Bathtub Tent, Private Pool Cottage). `effectiveRoomTypes(property)` reads from `property.categories` (Settings-editable) with `ROOM_TYPES` colour tags layered in for known ids.

### Helpers in `src/data.js`
- **Date math:** `ANCHOR`, `ymd(date)`, `idxToDate(idx)`, `dateToIdx(dateStr)`, `DAYS`
- **GST / tax:** `bookingGstApplies(b)`, `bookingInvoiceInclude(b)`, `GST_SLABS`, `gstSlabFor(rate)`, `gstRateForCategory(cat)`, `blendedGstRate(booking, property)`, `getTaxBreakdown(booking, property)`. Slabs are the **post-22-Sep-2025 CBIC rates** for hotel accommodation: ≤₹1,000 exempt / ₹1,001–₹7,499 = 5% (no ITC) / ≥₹7,500 = 18% (with ITC). Per-category override on `category.gstRate` wins; otherwise auto-pick from slab based on `category.base`.
- **Meal plans:** `effectiveMealPlans(property)`, `mealPlanById(property, id)`, `mealCostFor(booking, property)`. Per-guest per-night × total guests × nights. Default plan `'ep'` is zero-cost.
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
- **Dashboard.jsx** — Greeting ("Namaste", current date), hero carousel (Occupancy / Daily income / Earned this month — all live values), Setup nudge, Today's nudges (smart suggestions), Pending payments (Cash + UPI one-tap), Auto-release timers with inline Extend Hold, Arrivals list, Channel donut chart, Daily cash-close card. The Daily Income card's % change indicator computes today-vs-yesterday from the real ledger; the trailing mini-chart shows the last 12 days of collected revenue (replacing a hardcoded sample array).
- **Diary.jsx** —
  - **Prominent jump-to-date bar at top** of the screen. Real `<input type="date">` styled to fill the bar with transparent text + native icon hidden via global CSS in `tokens.js`; a custom Icon + formatted label overlay on top with `pointer-events: none`. Tap anywhere → native picker opens reliably on all browsers.
  - **Past dates visible** — default view shows 7 days of past context + 30 days future (was 14, bumped because hoteliers were hitting the right edge too quickly).
  - **Auto-extends horizon on scroll** — when the user scrolls within ~1 column of the rightmost edge, the horizon bumps to the next step (30 → 60 → 90 → 180). Was previously a hard wall.
  - **Click empty cell → New Booking with prefill** — calls `go('new', { prefill: { date, roomTypeId } })`.
  - Drag-drop with tap-vs-drag detection via end-state check (slotChanged || dx !== 0).
  - Status-coloured pills (saturated tint + bold border + filled badge), responsive name rendering, horizon picker (14/30/60/90/180), filters (All / Confirmed / On-hold / Form C / OTA).
- **NewBooking.jsx** — 4-step flow.
  - **Step 1 (dates):** Same overlay-input date picker pattern as Diary. Nights default 1. Children stepper label suffixed with the property's `childAgeBelow` (e.g. "Children <12y").
  - **Step 2 (rooms + meals):** Per-room type picker (each `roomItem` carries its own `roomTypeId`). Per-room rate editor with optional per-night rates. **Meal plan picker** at the bottom — shows enabled plans from `property.mealPlans` with live cost preview (price × guests × nights). Booking-level `mealPlanId` defaults to `'ep'`.
  - **Step 3 (guest):** name, country, mobile (with dial-code prefix), email, extras, special note. **Repeat-guest auto-suggest:** as the hotelier types a name or phone, an indigo banner appears if a past non-cancelled booking matches by last-5-digit phone or name-prefix. "Use these details" prefills the form. Removed: cosmetic WhatsApp confirmation toggle, ID Proof picker, Business GSTIN field — all were unwired.
  - **Step 4 (payment):** payment method, advance/full/custom, GST toggle (only on Invoicing plan), hold/release with auto-cancel timer. Summary shows tariff + meal plan + extras + CGST/SGST (rate computed via `blendedGstRate`).
- **BookingDetail.jsx** —
  - Check-in / check-out via `fmtStayDay(startIdx)`.
  - Guest header shows `2A · Indian guest` or `2A · Foreign · Form C pending` (no false Aadhaar-verified claim).
  - **WhatsApp / Call / Email buttons** open `wa.me/${digits}`, `tel:+${digits}`, and a templated `mailto:`. Disabled when contact field is missing.
  - **Send ₹X reminder** button (visible when balance > 0) opens WhatsApp with a templated balance-due message.
  - Multi-room folio: "Rooms" row lists all `roomItems` with their types.
  - Folio shows: Tariff line (room rate × nights) + Meal plan line (when paid plan in effect) + CGST/SGST rows (with real rate from blended slab) + Total.
  - **Activity feed** is now derived from real booking data — payments ledger, issued invoices, status transitions. Previously hardcoded "Razorpay · ₹0 captured · 03 May 18:25" mocks.
  - **Plan-gated Invoice section** (Invoicing tier only): "Include in invoice register" toggle, Invoices list, Issue Invoice button + sheet.
  - **IssueInvoiceSheet:** single recipient, **Tax inclusive/exclusive segmented control** (was a subtle checkbox), live breakdown, smart default kind (ADVANCE / BALANCE / FULL).
- **BookingConfirmed.jsx** — Celebration screen after booking creation.
- **Rates.jsx** — 30-day calendar grid anchored to today. Drag-select, overrides lifted to App.jsx and consumed by NewBooking.
- **Channels.jsx** — "Coming soon" placeholder. Real OTA sync needs a channel-manager partnership (Phase 5).
- **Reports.jsx** — Live KPIs from real bookings + ROOM_TYPES + DAYS. Subtitle shows current month/year. Month-end "Send to CA" card. Plain-English labels (Money earned, Rooms full, Per room/night, Per room/day).
- **Guests.jsx** — Search + filters (All / VIP / Repeat / Foreign / In-house). **List derives purely from the bookings store** (the old hardcoded `ALL_GUESTS` fake-customer list was removed). "Last stay" labels computed from booking dates relative to today. Tags auto-applied: Foreign / Repeat (≥2 stays) / Whale (VIP). Stay-date filter uses the same overlay-input date picker pattern as Diary. Top-right "+" opens New Booking.
- **Settings.jsx** —
  - **3-plan list** (Engine / Channels / Invoicing). Engine is the default and the core product (booking + voucher); Channels and Invoicing are paid add-ons. Default plan stored in localStorage.
  - Language toggle (EN/HI).
  - Integrations (Razorpay / WhatsApp / Channel manager / Form C placeholders).
  - **Account section** with signed-in email + Sign-out button (hidden in DEMO_MODE).
  - **PropertyProfile sheet:**
    - Logo (upload not yet wired), Brand colour (7 presets + native colour picker)
    - Basics (name, type, check-in/out times)
    - Address (landmark + Google Maps link)
    - Contact
    - **Accountant section:** CA email/name/firm, GSTIN, **Invoice number prefix** (Invoicing tier), **Last invoice number issued** (Invoicing tier)
    - **GST slabs card** (Invoicing tier) — shows the post-22-Sep-2025 CBIC rules: ≤₹1,000 exempt / ₹1,001–₹7,499 5% / ≥₹7,500 18%.
    - **Room categories** — name, units, base rate, **per-category GST rate** (auto-picks from slab; override per category if CA differs), collapsible amenity picker.
    - **Meal plans** — editable label + per-guest per-night price + on/off toggle for each of EP/CP/MAP/AP. EP is always on.
    - Property-wide amenities
    - **House Rules:** "Children counted as below this age" (default 12) + house-rule list
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

### Payments — hotelier-uploaded QR (shipped May 2026)
Owner picked the simplest possible model: each hotelier uploads their own UPI / payment QR image once in **Settings → Property profile → Payment QR**. The image is stored as a base64 data URL on `property.profile.paymentQrDataUrl` (with an optional `paymentQrLabel` caption like a VPA). The reservation voucher renders a "Scan to pay" block showing the QR + the booking's outstanding balance / total.

- Zero external dependencies. No Razorpay account, no server, no API keys.
- Hotelier's existing printed QR (the one at their reception) becomes the booking-confirmation QR.
- Guest scans with any UPI app and pays. Hotelier records the payment manually via the existing Cash / UPI buttons.
- 700 KB file size cap to keep the property row small. Most QR PNGs are 5–30 KB.

**Future upgrade path (NOT yet decided):** BYOK Razorpay — paste your own Razorpay Key ID + Secret to unlock auto-reconciled payment links via WhatsApp. Would require a Supabase Edge Function (secret key must never reach the browser). Hold until owner asks; the QR-on-voucher flow may be enough.

**Do NOT pursue Razorpay Route / Marketplace** — turns Atithi into a Money Service Business under RBI rules.

### Phase 1 remaining (small)
- **DEMO_MODE flip** — `src/App.jsx` line ~33. Set to `false` to re-enable magic-link sign-in. No other code changes required.

### Deferred features (queued, none of this is "lost")
- **Per-night different room type** within a single booking. Data-model rework: `roomItems` needs a `nightTypes` array, Diary needs to render a pill spanning multiple unit rows.
- **Per-room unit allocation + multi-pill Diary rendering** for multi-room bookings. Currently a booking with two rooms only shows in the Diary against the *first* room's slot.
- **Owner-flagged future work:** day close-out (expand existing), daily expense tracker (new schema), team profiles with RBAC (memberships table exists), public booking widget for hotelier's own website.

### Functional gaps (UI-only, waiting on external services — see [NOT_WIRED.md](./NOT_WIRED.md))
- **Channels** — UI is a "Coming soon" panel. Real two-way sync needs a channel-manager partnership (Phase 5).
- **Form C filing** — UI shows "Form C filing required" pill for foreign guests; no e-FRRO API integration (no public API exists).
- **WhatsApp confirmations** — Send-booking-summary / send-balance-reminder buttons open WhatsApp with templated text but the hotelier still taps Send themselves. Auto-send needs Meta WhatsApp Business Cloud API.
- **Email-to-CA "send"** — opens `mailto:` and a printable register tab. No SMTP yet (Phase 3 — Resend).
- **GSTIN auto-validation** — the header chip shows the entered GSTIN as-is (or a "GSTIN not set" warning). A real check would call `https://services.gst.gov.in/services/searchtp` before showing a "Verified" chip.

### Polish opportunities (frontend, no backend dependency)
- Undo for cancellations / auto-releases.
- Voice notes on bookings (browser MediaRecorder API).
- Global search bar (across all bookings/guests).
- Bulk actions (block dates, WhatsApp arrivals, etc.).
- Side-by-side panels on tablet+ (currently always a phone-frame on desktop).
- Drag-and-drop for multi-room bookings on the Diary (currently tap-only; the multi-slot drop UX needs design).

---

## Production roadmap — external services

### Phase 1 — Foundation (cloud DB + auth) — ✅ Mostly done
- Supabase project + schema migrations ✓
- Email magic-link auth ✓
- Cloud sync for properties, bookings, payments, invoices ✓
- PWA wrapper (install-to-home-screen) — **TBD**
- Final DEMO_MODE flip — **TBD**

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

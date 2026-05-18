# Atithi — Hotel Booking Engine

Mobile-first hotel PMS / booking engine for small Indian hoteliers. Demo property: **Yatra Desert Camp, Jaisalmer, Rajasthan**.

**Live (primary):** https://atithi-seven.vercel.app/ — auto-deploys from `main` on every push (~60s)
**Live (mirror):** https://museinall-ui.github.io/atithi/ — manual deploys only
**Repo:** https://github.com/museinall-ui/atithi

## About the user
The owner is **non-technical** (runs the hotel business, not a developer). Explain things in plain language. Avoid jargon unless you also define it. Step-by-step instructions should assume zero terminal/coding experience. When suggesting tools, prefer cloud-based options (StackBlitz, Vercel, Codespaces) over local installs.

## Stack
- Vite + React 18 (ES modules, no TypeScript)
- No routing library — state-based `go(routeName, arg)` pattern in `src/App.jsx`
- Inline styles throughout (no CSS files, no Tailwind)
- Design tokens in `src/tokens.js` → exported as `T` object (oklch color system)
- Google Fonts: Geist, Noto Sans Devanagari, JetBrains Mono
- **localStorage** for client-side persistence (no backend yet)

## Running locally
```bash
npm install        # one-time
npm run dev        # start dev server → http://localhost:5173/atithi/
```
Requires Node.js (use the official installer from nodejs.org — LTS or Current both work).

## Cloud / browser-only options (preferred for non-technical use)
- **Vercel:** Already wired. Push to `main` on GitHub → auto-build → live at atithi-seven.vercel.app in ~60s
- **StackBlitz:** `https://stackblitz.com/github/museinall-ui/atithi` — runs the app in a browser tab, zero install
- **GitHub Codespaces:** Full cloud dev env, 60 free hours/month per personal account

## Deploy
- **Vercel (auto):** every push to `main` triggers a build. `vercel.json` adds SPA rewrite. `vite.config.js` detects `VERCEL`/`NETLIFY` env vars and switches the base path to `/` (vs `/atithi/` for GitHub Pages).
- **GitHub Pages (manual):** `npm run build` → upload `dist/` to the `gh-pages` branch.

---

## Architecture

### Routing — `src/App.jsx`
```
go('home')              → Dashboard
go('diary')             → Diary (Gantt calendar)
go('new')               → NewBooking (4-step flow)
go('booking', id)       → BookingDetail
go('booking-confirmed') → BookingConfirmed
go('rates')             → Rates
go('channels')          → Channels
go('reports')           → Reports
go('guests')            → Guests
go('settings')          → Settings
go('more')              → MoreMenu
```

### State (lifted to App.jsx, persisted to localStorage)
- `bookings` — array of booking objects, seeded from `BOOKINGS_SEED` in `src/data.js`
- `savedCustomExtras` — globally-saved custom extras (carry across bookings)
- `rateOverrides` — per-day rate overrides keyed `${roomTypeId}:${dayIdx}` (shared between Rates and NewBooking)
- `property` — full property profile (name, address, landmark, mapUrl, accountant, GSTIN, room categories, rules, amenities, invoice counters)
- `plan` — `'engine' | 'channels' | 'gst'` (subscription tier)
- `lang` — `'en' | 'hi'` (bilingual)
- `route`, `editing` — UI state, not persisted

### localStorage keys (under `atithi.*.v1` prefix)
| Key | Holds |
|---|---|
| `atithi.bookings.v1` | All booking objects |
| `atithi.customExtras.v1` | Saved custom extras for reuse |
| `atithi.rateOverrides.v1` | Per-day rate / close-out overrides from Rates screen |
| `atithi.property.v1` | Full property profile incl. invoice counters + accountant + amenities |
| `atithi.plan.v1` | Current plan tier |
| `atithi.lang.v1` | Language preference |
| `atithi.cashCloses.v1` | Daily cash-close snapshots keyed by ISO date (cash + digital + note + closedAt) |

A `migrateProperty()` helper in App.jsx upgrades older property shapes (e.g. converts old `{amenities: {wifi: true}}` to `{amenityIds: ['wifi']}`) so saved data keeps working without a wipe.

To wipe state (back to seed), open DevTools → Application → Local Storage → delete the entries.

### Action functions in App.jsx (passed down as props)
- `addPayment(bookingId, entry)` — append to payments ledger; auto-confirms a tentative booking if balance hits zero
- `setStatus(bookingId, status)` — update status; clears `releaseTs/releaseAt` when leaving tentative
- `extendHold(bookingId, hours)` — push a tentative booking's `releaseTs` further out by N hours; resyncs `releaseAt` and bumps `holdHours`. No-op for non-tentative bookings.
- `setBookingGst(bookingId, value)` — toggle the per-booking GST/invoice-include flag
- `issueInvoice(bookingId, parts)` — issue one or more sequential tax invoices against a booking. `parts` is `[{ amount, recipient: { name, gstin?, address? } }]`; omitted = single invoice for full booking total
- `voidInvoice(bookingId, invoiceId)` — mark an invoice voided (number stays reserved per GST law)
- `moveBooking(bookingId, patch)` — update startIdx, roomTypeId, unitIdx (used by Diary drag-drop)
- `addSavedCustomExtra(extra)` / `removeSavedCustomExtra(id)` — global extras pool
- `onCreate(data, total)` — creates or edits a booking. For new bookings: parses `data.checkIn` via `parseCheckInIdx()` to derive `startIdx`, then `findFirstFreeUnit()` picks the lowest free unit of the chosen room type for the requested dates. Sets `gstApplies` from data, `releaseTs` from holdHours, promotes new custom extras to the saved pool

### Theme injector (App.jsx, useEffect)
On mount and whenever `property.theme` changes, `applyTheme(theme)` writes `--atithi-primary`, `--atithi-primary-dk`, and `--atithi-primary-lt` onto `:root`. All `T.primary*` references in the app are CSS vars pointing at these, so the chosen brand colour propagates instantly without rerendering components.

### Auto-release ticker (App.jsx, useEffect)
Every 30s, scans bookings. Any tentative booking whose `releaseTs <= now` and `paid < total` gets `status: 'cancelled'` with `autoReleased: true`. Seed bookings have `releaseAt` (string clock time) but no `releaseTs` — they don't auto-release in the demo.

---

## Data shapes

### Booking object
```js
{
  id: 'BK-2841',
  roomTypeId: 'dlx',          // matches ROOM_TYPES[].id
  unitIdx: 0,                 // which physical room (0-indexed)
  startIdx: 0,                // day index into DAYS array (0 = May 4 2026)
  nights: 3,
  guest: 'Aanya Sharma',
  phone: '+91 98100 21000',
  country: 'IN',
  formC: false,
  status: 'confirmed',        // confirmed | checkedin | checkout | tentative | cancelled
  channel: 'direct',          // direct | mmt | goibibo | booking | agoda
  total: 18000,
  paid: 18000,
  guests: '2A 1C',
  vip: false,
  notes: '',
  payments: [],
  extras: { breakfast: 2 },
  customExtras: [],
  extraPrices: {},
  roomItems: [{ adults, children, rate, perNight, nightRates }],

  // GST / invoice inclusion (channel-based default, per-booking override)
  gstApplies: true,           // OTA bookings default true, direct default false; can be flipped

  // Invoices issued against this booking (0 or many)
  invoices: [
    {
      id: 'inv_...',
      number: 'INV-2627-001',  // sequential per FY, gap-free
      fy: '2627',
      date: '2026-05-16T...',
      amount: 18000,
      recipient: { name: 'Aanya Sharma', gstin: '', address: '' },
      items: null,
      note: '',
      voided: false,
    }
  ],

  // Hold/release (only when status === 'tentative')
  releaseTs: 1715762400000,
  releaseAt: '18:00',
  holdHours: 4,
  autoReleased: false,
}
```

### Property object (persisted at `atithi.property.v1`)
```js
{
  profile: {
    name, type, address, city, state, pincode,
    landmark,       // free-text location description, shown on voucher
    mapUrl,         // Google Maps link, shown as "View on map" on voucher
    checkIn, checkOut, phone, email, website,
  },
  categories: [
    { id, name, units, base, amenityIds: ['ac', 'heater', ...] }
  ],
  rules: ['…', '…'],
  amenityIds: ['wifi', 'parking', ...],   // property-wide selections
  customAmenities: [{ id, label }],       // user-added, available everywhere
  invoiceCounters: { '2627': 12 },        // last-used sequence per Indian FY
  accountant: { name, email, firm },      // CA contact for monthly export
  gstin: '08AABCY1234M1Z5',               // optional, appears on tax invoices
  // Brand colour. Two shapes — pick one:
  theme: { hue: 38 },                      // one of THEME_PRESETS (38 = default sunset orange)
  // theme: { color: '#7B3F99' },          // OR custom hex from native colour picker
}
```

### Room types — `src/data.js` → `ROOM_TYPES`
| id | name | units | base rate |
|----|------|-------|-----------|
| dlx | Deluxe Tent | 8 | ₹4,500 |
| lux | Luxury Tent (AC) | 6 | ₹7,200 |
| btub | Bathtub Tent | 4 | ₹9,500 |
| pool | Private Pool Cottage | 3 | ₹14,500 |

These are the static catalog used by Diary/Booking; per-category amenities + display tweaks live in `property.categories` and persist independently.

### Master amenity list — `src/data.js` → `AMENITIES`
~40 amenities grouped into 6 sections: Comfort & Connectivity, In-room, Outdoor & View, Property facilities, Services, Policies. Used by both the property-wide picker and each room category's picker. Custom amenities added by the user join the same list everywhere.

### Helpers in `src/data.js`
- `bookingGstApplies(b)` / `bookingInvoiceInclude(b)` — same logic. Explicit `b.gstApplies` wins, else default by channel (OTA = true, direct = false)
- `currentFinancialYear(now?)` — returns `'2627'` for FY 2026-27 (April 1–March 31)
- `formatInvoiceNumber(fy, seq)` — `INV-2627-001` (12 chars, GST-compliant)
- `listIssuedInvoices(bookings)` — flat array of all non-voided invoices, in number order

### Countries — `src/data.js` → `COUNTRIES`
28 countries. Non-IN codes auto-set `formC: true` on booking creation.

### Status — `src/data.js` → `STATUS`
| key | label | when |
|---|---|---|
| confirmed | Confirmed | Normal active booking |
| checkedin | Checked-in | Guest is currently on property (**optional**, see below) |
| checkout | Checked-out | Stay complete (**optional**) |
| tentative | On hold | Block-and-auto-release, waiting on payment |
| cancelled | Cancelled | Cancelled by user OR auto-released |

**Check-in / Check-out are optional.** Campsites and small hotels often don't formally check guests in/out. Atithi's inventory + reports + invoicing all work without these status changes:
- Inventory frees up by **date**, not status (a booking past its end date no longer occupies inventory)
- Pending Payments card includes confirmed bookings whose start date has passed
- BookingDetail bottom bar is soft-styled with an "Optional · inventory + invoicing work without these" hint
- Buttons are labeled "Log check-in" / "Log check-out" to signal they're records, not gates

---

## Screens & Components

### Screens (`src/screens/`)
- **Dashboard.jsx** — Hero stats (with property name pulled live), OTA toast notifications, **Pending payments card** (bookings where guest has arrived/left but balance is unpaid; two one-tap buttons — **Cash** (orange) and **UPI** (green) — instantly record the full balance with the right method), **Auto-release timers card** with inline Extend Hold buttons (+2h / +1d / +2d / Custom), arrivals list, channel donut chart.
  - **"Earned this month" card** (third card in the hero carousel) — header is **"EARNED THIS MONTH"**, big number is **live** rupees summed from real bookings, subtitle "Total received so far". Stats row shows plain-English `bookings / rooms full / per room/night` (was the jargon ADR / RevPAR).
- **Diary.jsx** — Gantt calendar.
  - **Drag-drop** works for both date and room/unit. Navigation handled inside `pointerup` (not a separate `onClick`) so a drag never accidentally opens the booking detail. Movement >4px = drag → confirmation modal; no movement = tap → open booking.
  - **Today marker** — the today column is a single brand-coloured vertical band (header + occupancy row + every room row), with a TODAY pill inside the header cell. No floating overlay line.
  - **Status-coloured pills** — saturated 18%-mix tinted background, bold 2px coloured border, and a filled white-on-colour badge on the right edge: 🛏 **IN** (checkedin/indigo), ✓ **OUT** (checkout/green), ⏱ time (hold/yellow). Confirmed = white card, cancelled = struck-through grey.
  - **Responsive pill rendering** — full name when wide, first name when medium, initials ("AS") when very tight; status badge degrades from full label → icon-only → hidden. Full name always available via `title` (hover) or tap-to-open.
  - **Conflict detection:** warns if another non-cancelled booking already overlaps the target slot/dates.
  - **Filters:** All / Confirmed / On-hold / Form C / OTA with live counts.
- **NewBooking.jsx** — 4-step flow: Dates → Room → Guest → Payment.
  - Per-night rate editor (toggle when nights > 1).
  - 28-country picker with auto Form C detection and dial-code phone prefix.
  - Saved custom extras carry across bookings.
  - **GST toggle** on Step 4 (only when plan='gst'). Adds CGST/SGST; default off, channel-based future-proofing.
  - Hold/release with auto-cancel timer.
- **BookingDetail.jsx** — Folio, payments ledger, **Invoices section**, payment sheet (payment/refund/credit note), WhatsApp activity feed.
  - **Auto-release banner** (tentative bookings only) has inline **Extend by** buttons: + 2 hours / + 1 day / + 2 days / Custom… (number + hours/days toggle).
  - **Invoices section** lists every issued invoice with number/date/recipient/GSTIN/amount. Each row has "View invoice PDF" and "Void" actions. The **IssueInvoiceSheet** modal supports single or split invoicing (multiple recipients/amounts in one go).
  - **GST toggle row** (only on plan=gst) flips `gstApplies` and shows the rupee impact.
  - **Action buttons (wired):** Log check-in / Log check-out / Cancel / Confirm / Re-open. Soft-styled with "Optional" hint.
- **BookingConfirmed.jsx** — Celebration screen after booking creation.
- **Rates.jsx** — 30-day calendar grid with drag-select. Overrides lifted to App.jsx and consumed by NewBooking.
- **Channels.jsx** — OTA sync hero, per-channel markup/independent rate, live OTA event stream (still fake).
- **Reports.jsx** — **Lives data** (no hardcoded numbers).
  - KPI grid (Revenue, Avg occupancy, ADR, RevPAR) computed from bookings + DAYS + ROOM_TYPES. _Still uses jargon labels — same plain-English treatment as Dashboard is pending._
  - **Month-end · Send to CA card** at top: counts of invoices issued, bookings ready, payment gaps. Disabled when gaps exist, when no invoices issued, or no CA email configured. Active → opens printable A4-landscape invoice register in new tab + prefills mailto to CA.
  - **GST Applicability card** (plan=gst only): Reported vs Not Reported split.
  - Daily occupancy bar chart, top room types, compliance section.
- **Guests.jsx** — Functional search + filters (All / VIP / Repeat / Foreign / In-house) with live counts.
- **Settings.jsx** — Plan picker, language toggle, integrations, **PropertyProfile sheet**, GSTN OTP flow.
  - **PropertyProfile** sections: Logo, **Brand colour** (7 presets — Sunset, Heritage, Saffron, Forest, Lagoon, Royal, Plum — plus a Custom chip with native OS colour picker; live preview, revert-on-cancel), Basics, Address (Landmark + Google Maps link), Contact, **Accountant (CA email/name/firm + GSTIN)**, Room categories (each with collapsible amenity picker), Property-wide amenities, House rules.
  - **AmenityPicker** is a reusable grouped-chip component: master list grouped into 6 sections, custom-add input ("Add your own"), reuses custom amenities across property + every category.
- **MoreMenu.jsx** — 2×2 grid linking to Rates/Channels/Reports/Settings. Renamed to **"Manage"** / **"प्रबंधन"** (tab + screen header) per owner feedback.

### Components (`src/components/`)
- **Icon.jsx** — 40+ SVG icons
- **Btn.jsx** — variants: primary/dark/ghost/soft/indigo/danger/wa; sizes: sm/md/lg
- **ExtendOptions.jsx** — preset buttons (+2h / +1d / +2d) + Custom inline expander (number input + hours/days toggle + Add). Shared between BookingDetail banner and Dashboard auto-release card. Bilingual.
- **Chip.jsx**, **Field.jsx**, **Card.jsx**, **Avatar.jsx**, **Row.jsx**, **SectionHead.jsx**, **ScreenHeader.jsx**, **TabBar.jsx**, **Toggle.jsx**

### Pattern: "presets + Custom"
Anywhere the UI offers preset choices (hold duration, theme colour, etc.), always include a "Custom" option alongside. Presets cover the common cases for speed; the Custom escape hatch handles everything else. Apply consistently going forward.

### Utilities (`src/utils/`) + top-level helpers
- **voucher.js** — `generateVoucher(b, rt, property, invoice?)`. Opens a print-ready A4 HTML page. When `invoice` is passed, renders as **TAX INVOICE** with the sequential number, HSN 996311, place of supply, property GSTIN, and recipient details (incl. recipient GSTIN if B2B). Without `invoice`, renders as the booking voucher with the auto-release notice for tentative holds. Pulls property name/address/landmark/mapUrl/phone live (no hardcoded "Yatra Desert Camp" anywhere). **Theme-aware:** reads `property.theme` via `themeColors()` and inline-injects the brand colour into the printable HTML.
- **invoiceExport.js** — `exportInvoiceList(bookings, property)` opens a printable A4-landscape **invoice register** in a new tab: summary cards (count / pre-tax / GST / grand total), full table of every issued non-voided invoice (number, date, recipient, GSTIN, taxable, GST, total, booking ID). `emailToAccountant(invoices, property)` triggers a `mailto:` to the CA email with a pre-filled subject/body referencing the period.
- **`src/i18n.js`** (NOT under `utils/`) — `useT(lang)` hook, `STRINGS` with `en` and `hi` keys. Newly bilingual: extend-hold options, pending-payments helper text, Cash/UPI buttons, Manage label. Many older strings still English-only.
- **`src/tokens.js`** — `T` design tokens + `injectBaseStyles()` + theme helpers (`THEME_PRESETS`, `themeColors(theme)`, `themeColorsFromHue(hue)`, `applyTheme(theme)`). Brand-colour tokens (`primary`, `primaryDk`, `primaryLt`) read CSS variables (`--atithi-primary*`) so the hotelier's picked colour propagates everywhere with no per-screen rewrites.

---

## India-specific features

### Invoicing (the core CA-handoff workflow)
The product positioning is: **Atithi keeps clean books; the CA decides what gets filed with GSTN.** We do NOT make GST filing decisions inside the app. Hoteliers issue invoices, the system numbers them sequentially per Indian financial year (April–March), and the monthly register goes to the CA by email.

**Workflow:**
1. Hotelier opens a booking
2. Taps "Issue invoice (₹X)" → modal lets them split across recipients if needed (e.g. corporate + personal share)
3. Each split gets the next sequential invoice number (`INV-2627-001`, `INV-2627-002`, …)
4. Numbers are gap-free per GST law; voided invoices keep their slot reserved
5. PDF available via "View invoice PDF" — opens an A4 tax invoice with HSN 996311, place of supply, both GSTINs
6. At month-end, hotelier opens Reports → "Open invoice list + email to CA" → printable A4-landscape register opens, mailto fires to the configured CA address
7. Hotelier saves the page as PDF (browser print) and replies-with-attachment

### Other India-specific bits
- UPI QR code on payment step (mock SVG; needs real Razorpay integration)
- Razorpay payment link generation (mocked)
- WhatsApp Business API notifications (mocked toasts)
- Form C / FRRO for foreign nationals (auto-detected from country; actual filing API not wired)
- GST handling: per-booking flag with channel-based default. **App does not file with GSTN itself** — the CA does, based on the invoice register
- OTA channels: MMT, Goibibo, Booking.com, Agoda
- ₹ currency formatting with `toLocaleString('en-IN')`

---

## What was added in recent sessions (2026-05)

### Deployment + infra
- Vercel auto-deployment from `main` (Hobby plan, ~60s builds)
- `vite.config.js` detects Vercel/Netlify env and switches base path to `/`
- `vercel.json` for SPA rewrite

### Inventory + booking flow
- New bookings parse the check-in date and auto-pick the first free unit in the chosen room type (no more always-startIdx=0, unitIdx=7)
- Diary drag-drop bug fixed: a real drag no longer accidentally opens the booking detail
- Check-in / Check-out clearly optional in UI; inventory and invoicing already work without them (date-based)

### Property profile
- Full property persistence in `atithi.property.v1`
- Landmark + Google Maps link fields, both flow into voucher
- ~40 grouped amenities (was 6), custom amenity add, per-category amenity selection
- Accountant section (CA name / email / firm)
- Optional GSTIN

### Voucher → Invoice
- Voucher uses property data (no hardcoded property text)
- Same generator renders TAX INVOICE when an `invoice` object is passed: invoice number, HSN code, GSTIN, place of supply, recipient details

### Invoicing system
- `invoiceCounters` on property (per-FY, gap-free)
- `invoices[]` on booking, supports multiple invoices per booking
- "Issue invoice" UI with split-into-multiple-recipients flow
- Void action (keeps number reserved)
- `invoiceExport.js`: printable A4-landscape register + `mailto:` to CA

### Reports
- All KPIs (Revenue, Occupancy, ADR, RevPAR) computed live from bookings + ROOM_TYPES + DAYS
- Daily occupancy bar chart computed per-day
- Top room types ranked by real revenue
- "Month-end · Send to CA" card: invoices issued, bookings ready, payment gaps. Disabled until gaps resolved and CA email configured

### Dashboard
- Dashboard greeting pulls property name from profile
- **Pending payments card**: bookings where guest is on property / departed / overdue arrival with balance > 0. One-tap "Mark paid · cash" instantly records the balance as a cash payment; tap row to open booking for non-cash/split payments

### Per-booking GST (still present but de-emphasized)
- `gstApplies` field per booking with channel-based default (OTA = true, direct = false)
- Toggle on NewBooking Step 4 and BookingDetail
- Reports GST Applicability card (Reported vs Not Reported)
- **Direction:** the user has shifted away from app-managed GST toward CA-managed via invoice handoff. The GST flag is effectively a "include in monthly invoice export" flag

### Branding + theming (2026-05-18)
- Hotelier picks a brand colour. Two shapes: `theme: { hue: 38 }` (one of 7 named presets — Sunset, Heritage, Saffron, Forest, Lagoon, Royal, Plum) OR `theme: { color: '#hex' }` (custom from native colour picker).
- Picker lives in Settings → Property profile, below Logo. Live preview as you select; revert on cancel; persist on save.
- Implementation: `tokens.js` exposes `themeColors(theme)`, `themeColorsFromHue(hue)`, `applyTheme(theme)`, and `THEME_PRESETS`. App.jsx `useEffect` writes `--atithi-primary*` CSS variables; all `T.primary*` references read those variables.
- Voucher / tax invoice template (`voucher.js`) reads the same theme and inline-injects the colour into the printable HTML (CSS vars don't propagate to new windows).

### Diary polish (2026-05-18)
- Removed the floating orange "today line" overlay. Replaced with a clean brand-coloured vertical band spanning the entire today column + a **TODAY** pill in the header cell.
- Status-coloured pills: saturated bg tint (`color-mix 18%`), bold 2px matching border, filled white-on-colour badge on the right edge (🛏 IN, ✓ OUT, ⏱ time).
- Distinct visuals for checkedin (indigo), checkout (green), tentative (yellow dashed), confirmed (white), cancelled (struck-through grey).
- Responsive pill rendering — full name → first name → initials based on actual pill width; badge degrades full → icon-only → hidden; `title` attribute always carries the full guest name.

### Extend Hold (2026-05-18)
- New `extendHold(bookingId, hours)` action.
- Surfaced inline on **BookingDetail's auto-release banner** and on **each row of Dashboard's auto-release card**.
- Shared `<ExtendOptions>` component: presets +2h / +1d / +2d plus a Custom expander (number input + hours/days toggle + Add).
- Bilingual (Hindi labels).

### UX polish (2026-05-18)
- Bottom tab "More" renamed → **"Manage"** (en) / **"प्रबंधन"** (hi).
- Pending Payments card: single "Mark paid · cash" button replaced with **Cash + UPI** side-by-side. Each records the full balance instantly with the correct method. Bilingual.
- **Earned This Month** card on Dashboard:
  - Header: "MONTH SO FAR" → "EARNED THIS MONTH" / "इस महीने कमाई"
  - Added subtitle: "Total received so far" / "अब तक कुल आय"
  - Big number is now **live** — sums real booking totals (was a hardcoded ₹11L which was actually a 12-month sum mislabelled).
  - Number formatted with "lakh" written out, not just "L".
  - Stats line replaced jargon (78% avg occ / ₹6,420 ADR / 14 days) with plain English: **N bookings · X% rooms full · ₹Y /room/night** — all computed live.

### Batch A (2026-05-18) — pre-Phase-1 cleanup pass

- **GST portal cleanup.** Removed the GSTN OTP / auto-file-GSTR-1 mock (`GstnSheet`) and the "GSTN portal" section in Settings. Dropped the third "GST Pro" plan tier — plan picker is now 2 tiers (Engine, Channels). Invoice features (per-booking toggle, monthly CA export, Reports invoicing summary) are now universal, not plan-gated. Existing `plan === 'gst'` users auto-migrate to `'engine'` on load. The per-booking GST toggle is reworded to "Include in invoice register" on both NewBooking and BookingDetail. Stale i18n keys + Hindi mirrors removed.
- **Property ↔ Diary disconnect bug fixed.** New `effectiveRoomTypes(property)` helper in `data.js` reads from `property.categories` (with `ROOM_TYPES` colour tags layered in for known ids). Diary / Dashboard / Reports / NewBooking / BookingDetail / Rates all use this — so renaming a room type in Settings, changing its unit count, or its base rate flows through to the calendar immediately. ROOM_TYPES is now just the seed/default.
- **Channels = "Coming soon"** state. Replaced the fake event stream + dead "Push now" button with an honest panel explaining what 2-way OTA sync will do once a channel-manager partnership lands.
- **Discounts UI removed** from Rates — was a coupon/early-bird/last-minute form that wasn't wired to anything. `DiscountForm` deleted; related i18n keys removed.
- **Multi-state GST** — new `INDIAN_STATES` list and `getTaxBreakdown(booking, property)` helper. Voucher / invoice templates and the BookingDetail folio + NewBooking summary all split tax as **CGST 6% + SGST 6%** (intra-state) or **IGST 12%** (inter-state — guest from different state OR foreign). NewBooking Step 3 gains an optional "State (for tax)" picker for Indian guests.
- **Diary horizon picker** (14d / 30d / 60d / 90d chips at the top of the filter row). `generateDays()` extends the seed window when the chosen horizon exceeds DAYS.length. `RoomTypeBlock` now takes a `days` prop.
- **Reports plain-English KPIs.** "Revenue / Avg occupancy / ADR / RevPAR" → "Money earned / Rooms full / Per room/night / Per room/day", with sub-labels explaining each one. "GST Applicability" card → "Invoicing summary" ("Goes to CA" / "Skipped"). "GSTR-1 next due" compliance line removed (CA handles filings).
- **Desktop frame.** `index.html` already centres the app inside a max-width 430px phone frame on viewports ≥ 500px (rounded corners + shadow). `applyTheme()` now also syncs `<meta name="theme-color">` so mobile browser chrome matches the picked brand colour.

### Batch B (2026-05-18) — onboarding + intelligence

- **Repeat-guest auto-detect.** `normPhone()` + `repeatGuestKeys()` helpers in `data.js`. Guests with 2+ non-cancelled bookings (matched by normalised phone) get a green "Repeat" badge on Dashboard arrivals and a `Nth stay` chip on BookingDetail.
- **Today's nudges** card on Dashboard. Action-oriented suggestions computed from booking state: WhatsApp directions to guests arriving tomorrow, Form C readiness for foreign guests on-property, "X holds expire in 4h" warning. Card hides when nothing's urgent.
- **Daily cash close** (the deferred end-of-day feature). End-of-day card on Dashboard with an inline form: cash counted + digital + optional note. Saves a per-day snapshot to `localStorage['atithi.cashCloses.v1']` keyed by ISO date. After closing, shows "Closed at HH:MM" with the gap vs billed total. Reopen button restores the form. Today's date currently hardcoded to `'2026-05-05'` for the demo — Phase 1 will use `new Date()`.
- **Setup checklist nudge** on Dashboard. Shows while any of five essentials is missing (property name, phone, address, CA email, room categories). Progress bar + tappable items → opens Settings. Auto-hides at 5/5. Default seed has CA email empty, so the card surfaces immediately on first launch and walks the hotelier into Settings to fill it in.

---

## What still needs work

### Renames still pending (low priority — cosmetic only)
- `gstApplies` field could be renamed to `includeInvoice` to match the new CA-handoff framing (UI already says "Include in invoice"-style copy)

### Functional gaps (UI-only, waiting on external services — see Production roadmap below)
- **Channels** — UI now an honest "Coming soon" panel. Real two-way sync needs channel manager partnership (Phase 5)
- **Form C filing** — UI works, no e-FRRO API integration
- **WhatsApp confirmations** — UI works, no real Business API hookup (Phase 3)
- **Razorpay UPI QR** — fake SVG, needs real Razorpay or raw UPI deeplink (Phase 2)
- **OTA channel sync** — bookings from MMT/Goibibo/etc. don't flow in (Phase 5)
- **Email-to-CA "send"** — currently opens `mailto:` and a printable register tab. No actual SMTP — the hotelier saves the PDF themselves and replies-with-attachment (Phase 3 — Resend)
- **localStorage-only persistence** — data lives in the browser. Lost on browser wipe; no cross-device sync (Phase 1 — Supabase)

### Polish opportunities (frontend, no backend dependency)
- Hindi translations for older UI strings (invoice section, accountant section, Reports labels still English-only)
- Editable saved-custom-extra prices (currently can only delete)
- Undo for cancellations / auto-releases
- Voice notes on bookings (browser MediaRecorder API)
- Global search bar (across all bookings/guests)
- Bulk actions (block dates, WhatsApp arrivals, etc.)
- Guest direct edit (currently only via their booking)
- Side-by-side panels on tablet+ (currently always a phone-frame on desktop)

---

## Production roadmap — external services (prototype → real business)

**Constraint:** owner wants only free-tier services for now. The list below is sequenced by dependency — each phase unlocks the next. Pick the recommended option unless you have a strong reason to switch (free tiers can change; verify before commit).

### Phase 1 — Foundation (data, auth, install) — START HERE
**Why first:** without this, every other phase is duct-tape. The app loses everything on browser wipe and can't be used from a second device.

1. **Cloud database + auth** — replace localStorage so data persists across devices and users
   - **Recommendation: Supabase** (free tier: 500MB Postgres, 50k MAU auth, 5GB bandwidth, real-time subscriptions, no credit card to start, generous quotas)
   - Alternatives: Firebase (Google, NoSQL, more vendor lock-in), PocketBase (single-binary self-host, ~$5/mo VPS needed), Convex (newer, generous free tier but smaller community)
   - Schema port: each localStorage key (`atithi.bookings.v1`, `atithi.property.v1`, etc.) → corresponding Postgres table with the hotelier as `owner_id` foreign key
   - Auth strategy: email magic-link + Google OAuth (both included in Supabase free)

2. **PWA wrapper** — installable on phones with "Add to Home Screen"
   - **No service needed** — just code: `manifest.json`, service worker for offline shell, app icons
   - Vite has good PWA support via `vite-plugin-pwa`

### Phase 2 — Money flow (India-specific)
**Why second:** core to the business. The booking engine is useless if you can't actually collect payment.

3. **Payment links + UPI** — real UPI QR codes and shareable payment links replace the mock SVG
   - **Recommendation: Razorpay** (no fixed monthly fee — pay-as-you-go ~2% per transaction. Counts as "free" since there's no fixed cost until money flows.) Has prebuilt UPI QR, payment links via API, dashboard, webhooks.
   - Free fallback (truly zero cost): generate raw **UPI deep links** (`upi://pay?pa=<vpa>&pn=<name>&am=<amount>...`) — works for any UPI app, less polished UX, no automatic reconciliation.
   - Alternatives: PayU, Cashfree, PhonePe ForBusiness — all similar fee structure.
   - Generate QR codes locally with `qrcode` npm package (no service needed).

### Phase 3 — Communication (high-value for India)
4. **WhatsApp Business API** — send booking confirmations, vouchers, payment reminders
   - **Recommendation: Meta Cloud API direct** (free: 1000 user-initiated conversations/month, ~$0.005 each beyond. Skips the BSP/reseller markup.) Requires WhatsApp Business account verification, takes ~1-2 days.
   - Alternatives (paid BSPs): Wati (₹2999/mo), Gupshup (₹999/mo + per-msg), 360Dialog. Easier dashboards but recurring cost.
   - Templates need pre-approval from Meta — plan for "booking_confirmation", "payment_reminder", "voucher_link".

5. **Transactional email** — booking confirmation emails, monthly CA exports (replace `mailto:`), password resets
   - **Recommendation: Resend** (free: 3000 emails/month, 100/day, clean modern API). Generous for a small hotel.
   - Alternatives: Brevo/Sendinblue (300/day free), SendGrid (100/day free), Mailgun (5k/3-month trial then paid).

### Phase 4 — Storage + polish (when needed)
6. **Image/file storage** — property logos, future amenity photos, ID proofs uploaded for Form C
   - **Recommendation:** **Supabase Storage** (1GB free, bundled with Phase 1) — keep everything in one provider
   - Alternative: **Cloudinary** (25GB free + on-the-fly transformations) if you need image resizing/optimization for guest-facing galleries

7. **Booking widget for hotel's own website** — `<script>`-embeddable mini app on the hotelier's site
   - **No service needed** — build a `widget.js` that injects a styled booking form, posts to the Supabase API
   - Free hosting: same Vercel deploy (`/widget.js` route)

8. **Usage analytics** (optional, when there are real users)
   - **Recommendation: PostHog** (1M events/month free) or **Plausible** (paid only, GDPR-friendly)
   - Alternative: Vercel Analytics (2.5k events/mo free, basic)

### Phase 5 — Deferred (paid, gov, or partner-only)
9. **OTA channel sync** (MMT, Goibibo, Booking.com, Agoda) — **no viable free option**. Channel managers (STAAH, RateGain, Cloudbeds) start ~₹1000-5000/mo. Skip until paid tier.
10. **e-FRRO Form C filing** — government portal only. Manual filing in the UI; no API available without GSP partnership.
11. **GSTN / GSTR-1 auto-filing** — only via paid GSPs. **Out of scope by product principle** — the CA decides what's filed (see Important product principle below).

### Phase 6 — Multi-user
12. **Owner / reception / manager roles** with permissions — built on Phase 1's Supabase auth + RLS (row-level security) policies. Free with Supabase.

### Cost summary (free-tier path)
At small-hotel scale (≤30 rooms, ≤500 bookings/month):
- Phase 1-2: ₹0/month (Supabase + Vercel free, Razorpay only on transactions)
- Phase 3: ₹0/month (Meta WA Cloud free tier, Resend free tier)
- Phase 4: ₹0/month
- Per-transaction: ~2% Razorpay fee if used

**Estimated free-tier ceiling per hotel:** ~50 bookings/day before any phase outgrows its free quota.

---

## Cleanup / housekeeping

The `/project/` folder contains the original Claude Design HTML/JSX handoff bundle — kept for reference but not used at runtime. The `/chats/` folder has the original design-iteration transcripts. The live app is entirely in `/src/`.

## Important product principle

**Atithi is a books-keeper that hands off to a CA. It is NOT a GST-filing tool.** This is deliberate — the legal responsibility for what gets filed sits with the licensed accountant, not the hotelier or the software. Any future feature work should preserve this boundary. The hotelier issues invoices, the CA decides which ones appear in GSTR-1.

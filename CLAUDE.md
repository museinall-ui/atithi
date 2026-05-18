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

A `migrateProperty()` helper in App.jsx upgrades older property shapes (e.g. converts old `{amenities: {wifi: true}}` to `{amenityIds: ['wifi']}`) so saved data keeps working without a wipe.

To wipe state (back to seed), open DevTools → Application → Local Storage → delete the entries.

### Action functions in App.jsx (passed down as props)
- `addPayment(bookingId, entry)` — append to payments ledger; auto-confirms a tentative booking if balance hits zero
- `setStatus(bookingId, status)` — update status; clears `releaseTs/releaseAt` when leaving tentative
- `setBookingGst(bookingId, value)` — toggle the per-booking GST/invoice-include flag
- `issueInvoice(bookingId, parts)` — issue one or more sequential tax invoices against a booking. `parts` is `[{ amount, recipient: { name, gstin?, address? } }]`; omitted = single invoice for full booking total
- `voidInvoice(bookingId, invoiceId)` — mark an invoice voided (number stays reserved per GST law)
- `moveBooking(bookingId, patch)` — update startIdx, roomTypeId, unitIdx (used by Diary drag-drop)
- `addSavedCustomExtra(extra)` / `removeSavedCustomExtra(id)` — global extras pool
- `onCreate(data, total)` — creates or edits a booking. For new bookings: parses `data.checkIn` via `parseCheckInIdx()` to derive `startIdx`, then `findFirstFreeUnit()` picks the lowest free unit of the chosen room type for the requested dates. Sets `gstApplies` from data, `releaseTs` from holdHours, promotes new custom extras to the saved pool

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
- **Dashboard.jsx** — Hero stats (with property name pulled live), OTA toast notifications, **Pending payments card** (bookings where guest has arrived/left but balance is unpaid; one-tap "Mark paid · cash" instantly records balance as cash payment), auto-release alerts, arrivals list, channel donut chart.
- **Diary.jsx** — Gantt calendar.
  - **Drag-drop** works for both date and room/unit. Navigation handled inside `pointerup` (not a separate `onClick`) so a drag never accidentally opens the booking detail. Movement >4px = drag → confirmation modal; no movement = tap → open booking.
  - **Conflict detection:** warns if another non-cancelled booking already overlaps the target slot/dates.
  - **Filters:** All / Confirmed / On-hold / Form C / OTA with live counts.
  - Cancelled bookings rendered struck-through and excluded from occupancy.
- **NewBooking.jsx** — 4-step flow: Dates → Room → Guest → Payment.
  - Per-night rate editor (toggle when nights > 1).
  - 28-country picker with auto Form C detection and dial-code phone prefix.
  - Saved custom extras carry across bookings.
  - **GST toggle** on Step 4 (only when plan='gst'). Adds CGST/SGST; default off, channel-based future-proofing.
  - Hold/release with auto-cancel timer.
- **BookingDetail.jsx** — Folio, payments ledger, **Invoices section**, payment sheet (payment/refund/credit note), WhatsApp activity feed.
  - **Invoices section** lists every issued invoice with number/date/recipient/GSTIN/amount. Each row has "View invoice PDF" and "Void" actions. The **IssueInvoiceSheet** modal supports single or split invoicing (multiple recipients/amounts in one go).
  - **GST toggle row** (only on plan=gst) flips `gstApplies` and shows the rupee impact.
  - **Action buttons (wired):** Log check-in / Log check-out / Cancel / Confirm / Re-open. Soft-styled with "Optional" hint.
- **BookingConfirmed.jsx** — Celebration screen after booking creation.
- **Rates.jsx** — 30-day calendar grid with drag-select. Overrides lifted to App.jsx and consumed by NewBooking.
- **Channels.jsx** — OTA sync hero, per-channel markup/independent rate, live OTA event stream (still fake).
- **Reports.jsx** — **Lives data** (no hardcoded numbers).
  - KPI grid (Revenue, Avg occupancy, ADR, RevPAR) computed from bookings + DAYS + ROOM_TYPES.
  - **Month-end · Send to CA card** at top: counts of invoices issued, bookings ready, payment gaps. Disabled when gaps exist, when no invoices issued, or no CA email configured. Active → opens printable A4-landscape invoice register in new tab + prefills mailto to CA.
  - **GST Applicability card** (plan=gst only): Reported vs Not Reported split.
  - Daily occupancy bar chart, top room types, compliance section.
- **Guests.jsx** — Functional search + filters (All / VIP / Repeat / Foreign / In-house) with live counts.
- **Settings.jsx** — Plan picker, language toggle, integrations, **PropertyProfile sheet**, GSTN OTP flow.
  - **PropertyProfile** sections: Logo, Basics, Address (now with Landmark + Google Maps link), Contact, **Accountant (CA email/name/firm + GSTIN)**, Room categories (each with collapsible amenity picker), Property-wide amenities, House rules.
  - **AmenityPicker** is a reusable grouped-chip component: master list grouped into 6 sections, custom-add input ("Add your own"), reuses custom amenities across property + every category.
- **MoreMenu.jsx** — 2×2 grid linking to Rates/Channels/Reports/Settings. **User flagged this for refinement — make it more intuitive/practical/functional. Not yet started.**

### Components (`src/components/`)
- **Icon.jsx** — 40+ SVG icons
- **Btn.jsx** — variants: primary/dark/ghost/soft/indigo/danger/wa; sizes: sm/md/lg
- **Chip.jsx**, **Field.jsx**, **Card.jsx**, **Avatar.jsx**, **Row.jsx**, **SectionHead.jsx**, **ScreenHeader.jsx**, **TabBar.jsx**, **Toggle.jsx**

### Utilities (`src/utils/`)
- **voucher.js** — `generateVoucher(b, rt, property, invoice?)`. Opens a print-ready A4 HTML page. When `invoice` is passed, renders as **TAX INVOICE** with the sequential number, HSN 996311, place of supply, property GSTIN, and recipient details (incl. recipient GSTIN if B2B). Without `invoice`, renders as the booking voucher with the auto-release notice for tentative holds. Pulls property name/address/landmark/mapUrl/phone live (no hardcoded "Yatra Desert Camp" anywhere).
- **invoiceExport.js** — `exportInvoiceList(bookings, property)` opens a printable A4-landscape **invoice register** in a new tab: summary cards (count / pre-tax / GST / grand total), full table of every issued non-voided invoice (number, date, recipient, GSTIN, taxable, GST, total, booking ID). `emailToAccountant(invoices, property)` triggers a `mailto:` to the CA email with a pre-filled subject/body referencing the period.
- **i18n.js** — `useT(lang)` hook, `STRINGS` with `en` and `hi` keys. Note: many new strings added in 2026-05 session are English-only.
- **tokens.js** — `T` design tokens + `injectBaseStyles()`.

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

---

## What still needs work

### Deferred features (per user, in order)
1. **"More" section refinement** — user said: "we shall work on the 'more' section by making it more intuitive, practical and functional." Not yet started. Currently just a 2×2 grid linking to Rates/Channels/Reports/Settings.
2. **End-of-day cash reconciliation section** — owner asked to add after the pending-payments card has been used a bit. Day-end: enter total cash collected, system suggests allocation to bookings. (See `~/.claude/projects/C--atithi/memory/atithi_followups.md`.)

### Renames still pending (low priority — cosmetic only)
- `gstApplies` field could be renamed to `includeInvoice` to match the new CA-handoff framing (UI already says "Include in invoice"-style copy)
- Reports "GST Applicability" card could be rebranded as "Invoicing summary"

### Functional gaps (still UI-only)
- **Channels** — OTA event stream is fake; "Push now" has no effect (needs channel manager partnership)
- **Settings property profile categories** persist, but they don't influence `ROOM_TYPES` (which is the source of truth for Diary/Booking). Editing categories is currently form-only.
- **Form C filing** — UI works, no e-FRRO API integration
- **GSTR-1 filing** — not in scope; we hand to the CA instead
- **WhatsApp confirmations** — UI works, no real Business API hookup
- **Razorpay UPI QR** — fake SVG, needs real Razorpay
- **OTA channel sync** — bookings from MMT/Goibibo/etc. don't flow in (channel manager partnership)
- **Email-to-CA "send"** — currently opens `mailto:` and a printable register tab. No actual SMTP — the hotelier saves the PDF themselves and replies-with-attachment.

### Polish opportunities
- Hindi translations for new UI strings added in 2026-05 (invoice section, pending payments, accountant section, etc.)
- Editable saved-custom-extra prices (currently can only delete)
- Undo for cancellations / auto-releases
- Configurable Diary horizon (currently hardcoded 14 days)

---

## Production roadmap (prototype → real business)

8 stages to a real product:

1. **Real database + auth** (Supabase / Firebase / custom backend) — replace localStorage with cloud DB
2. **PWA wrapper** — manifest + service worker for "Add to Home Screen"
3. **Razorpay integration** — real UPI QR + payment links + WhatsApp pay button
4. **WhatsApp Business API** via Gupshup / Wati / Twilio
5. **Channel manager partnership** (RateGain / Cloudbeds / STAAH) for OTA sync
6. **Real email/SMTP** for monthly CA exports (currently `mailto:` only)
7. **e-FRRO Form C filing** — government API for foreign-guest reporting
8. **Multi-user + permissions** — owner vs reception vs manager logins

Operating cost estimate per hotel: ~₹1,500–4,000/month. Suggested SaaS pricing: ₹5,000–8,000/month per hotel.

---

## Cleanup / housekeeping

The `/project/` folder contains the original Claude Design HTML/JSX handoff bundle — kept for reference but not used at runtime. The `/chats/` folder has the original design-iteration transcripts. The live app is entirely in `/src/`.

## Important product principle

**Atithi is a books-keeper that hands off to a CA. It is NOT a GST-filing tool.** This is deliberate — the legal responsibility for what gets filed sits with the licensed accountant, not the hotelier or the software. Any future feature work should preserve this boundary. The hotelier issues invoices, the CA decides which ones appear in GSTR-1.

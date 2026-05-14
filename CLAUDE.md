# Atithi — Hotel Booking Engine

Mobile-first hotel PMS / booking engine for small Indian hoteliers. Demo property: **Yatra Desert Camp, Jaisalmer, Rajasthan**.

**Live:** https://museinall-ui.github.io/atithi/
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
- **StackBlitz:** `https://stackblitz.com/github/museinall-ui/atithi` — runs the app in a browser tab, zero install
- **Vercel:** Auto-deploys from GitHub on push, free tier. The hosted URL becomes the "production app"
- **GitHub Codespaces:** Full cloud dev env, 60 free hours/month per personal account

## Deploy
```bash
npm run build
# Then upload dist/ files to gh-pages branch
```
Base path is `/atithi/` (set in `vite.config.js`) for GitHub Pages. For Vercel/Netlify, the base path may need to be `/` instead.

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
- `plan` — `'engine' | 'channels' | 'gst'` (subscription tier)
- `lang` — `'en' | 'hi'` (bilingual)
- `route`, `editing` — UI state, not persisted

### localStorage keys (under `atithi.*.v1` prefix)
| Key | Holds |
|---|---|
| `atithi.bookings.v1` | All booking objects |
| `atithi.customExtras.v1` | Saved custom extras for reuse |
| `atithi.rateOverrides.v1` | Per-day rate / close-out overrides from Rates screen |
| `atithi.plan.v1` | Current plan tier |
| `atithi.lang.v1` | Language preference |

To wipe state (back to seed), open DevTools → Application → Local Storage → delete the entries.

### Action functions in App.jsx (passed down as props)
- `addPayment(bookingId, entry)` — append to payments ledger; auto-confirms a tentative booking if balance hits zero
- `setStatus(bookingId, status)` — update status; clears `releaseTs/releaseAt` when leaving tentative
- `moveBooking(bookingId, patch)` — update startIdx, roomTypeId, unitIdx (used by Diary drag-drop)
- `addSavedCustomExtra(extra)` / `removeSavedCustomExtra(id)` — global extras pool
- `onCreate(data, total)` — creates or edits a booking; sets formC from country, computes releaseTs from holdHours, promotes new custom extras to the saved pool

### Auto-release ticker (App.jsx, useEffect)
Every 30s, scans bookings. Any tentative booking whose `releaseTs <= now` and `paid < total` gets `status: 'cancelled'` with `autoReleased: true`. Seed bookings have `releaseAt` (string clock time) but no `releaseTs` — they don't auto-release in the demo. New bookings created via NewBooking with hold enabled get real `releaseTs` timestamps.

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
  country: 'IN',              // ISO code from COUNTRIES list
  formC: false,               // auto-set to true when country !== 'IN'
  status: 'confirmed',        // confirmed | checkedin | checkout | tentative | cancelled
  channel: 'direct',          // direct | mmt | goibibo | booking | agoda
  total: 18000,
  paid: 18000,
  guests: '2A 1C',
  vip: false,
  notes: '',
  payments: [],               // payment ledger entries
  extras: { breakfast: 2 },   // qty per extra-id
  customExtras: [],           // custom extras attached to this booking
  extraPrices: {},            // per-booking price overrides keyed by extra-id
  roomItems: [{ adults, children, rate, perNight, nightRates }],

  // Hold/release (only when status === 'tentative')
  releaseTs: 1715762400000,   // ms timestamp; if <= now and unpaid → auto-cancel
  releaseAt: '18:00',         // human-readable display time
  holdHours: 4,               // original hold duration chosen by user
  autoReleased: false,        // set true by the ticker when auto-cancelled
}
```

### roomItems entry (inside a booking)
```js
{
  adults: 2,
  children: 0,
  rate: 4500,                 // single uniform rate (used when perNight === false)
  perNight: false,            // when true, use nightRates[]
  nightRates: [4500, 5400],   // length === nights; required when perNight is true
}
```

### Room types — `src/data.js` → `ROOM_TYPES`
| id | name | units | base rate |
|----|------|-------|-----------|
| dlx | Deluxe Tent | 8 | ₹4,500 |
| lux | Luxury Tent (AC) | 6 | ₹7,200 |
| btub | Bathtub Tent | 4 | ₹9,500 |
| pool | Private Pool Cottage | 3 | ₹14,500 |

### Countries — `src/data.js` → `COUNTRIES`
28 countries. Each entry: `{ code, name, flag, dial }`. Non-IN codes auto-set `formC: true` on booking creation. The phone field's prefix updates based on selected country.

### Status — `src/data.js` → `STATUS`
| key | label | when |
|---|---|---|
| confirmed | Confirmed | Normal active booking |
| checkedin | Checked-in | Guest is currently on property |
| checkout | Checked-out | Stay complete |
| tentative | On hold | Block-and-auto-release, waiting on payment |
| cancelled | Cancelled | Cancelled by user OR auto-released |

---

## Screens & Components

### Screens (`src/screens/`)
- **Dashboard.jsx** — Hero stats, OTA toast notifications, auto-release alerts, arrivals list, channel donut chart. Uses live `bookings`.
- **Diary.jsx** — Gantt calendar.
  - **Drag-drop:** Bookings can be dragged horizontally (date) AND vertically (room/unit). Each unit row has `data-slot data-roomtype data-unit` attributes; `document.elementFromPoint` detects the target slot on pointermove. Drop target row is highlighted.
  - **Conflict detection:** The confirm modal warns if another non-cancelled booking already overlaps the target slot/dates and disables the confirm button.
  - **Filters:** Functional chips (All / Confirmed / On-hold / Form C / OTA) with live counts. Single-select; clicking another chip switches; clicking "All" resets.
  - **Cancelled bookings:** Rendered struck-through and faded; occupancy bar excludes them.
- **NewBooking.jsx** — 4-step flow: StepDates → StepRoom → StepGuest → StepPayment.
  - **Per-night rates:** When `nights > 1`, each room item shows a "Different rate each night" toggle. When on, rate input expands to a per-night grid labeled "NIGHT N · DD MMM" with a "Reset to default" option. Default per-night rates come from `rateForNight(roomTypeId, nightIdx)` which respects `rateOverrides` from the Rates screen and applies a weekend +20% factor.
  - **Country picker:** Native `<select>` with 28 countries (flag + dial code). Non-IN auto-shows the indigo banner *"Foreign national · Form C will be auto-filed with FRRO"*. Phone field's prefix updates to the country's dial code.
  - **Saved custom extras:** When user adds a custom extra here, it gets promoted to the global `savedCustomExtras` pool on booking confirmation. Saved extras show a "SAVED" badge in subsequent bookings with a trash icon to forget them.
  - **Hold flow:** When `hold` toggle is on and pay is partial, `onCreate` sets `releaseTs = now + holdHours*3600*1000`, status = `tentative`.
- **BookingDetail.jsx** — Folio, payments ledger, PaymentSheet (payment/refund/credit note), WhatsApp activity feed.
  - **Auto-release banner:** Tentative bookings with a balance show a yellow alert: *"₹X due before {release time}, otherwise the booking will be released automatically."*
  - **Action buttons (wired):** Check-in → status='checkedin'. Check-out → status='checkout' (terminal). Cancel/Confirm for tentative. Re-open for cancelled. `onSetStatus` is the App-level callback.
- **BookingConfirmed.jsx** — Celebration screen after booking creation.
- **Rates.jsx** — 30-day calendar grid with drag-select. **Overrides are now lifted to App.jsx** via props (`overrides`, `setOverrides`) and used by NewBooking for default rates.
- **Channels.jsx** — OTA sync hero, per-channel markup/independent rate, live OTA event stream (still fake/static).
- **Reports.jsx** — KPI grid, occupancy bar chart, room type breakdown, compliance section (still hardcoded; receives `bookings` prop but doesn't use it yet).
- **Guests.jsx** — Functional search + filters (All / VIP / Repeat / Foreign / In-house) with live counts. Merges seed `ALL_GUESTS` with guests derived from current `bookings` (in-house is computed from `status === 'checkedin'`).
- **Settings.jsx** — Plan picker, language toggle, integrations, property profile, GSTN OTP flow. (Property profile edits don't persist yet.)
- **MoreMenu.jsx** — 2×2 grid linking to Rates/Channels/Reports/Settings.

### Components (`src/components/`)
- **Icon.jsx** — 40+ SVG icons, `<Icon name="check" size={16} stroke={2} color={T.ok} />`
- **Btn.jsx** — variants: primary/dark/ghost/soft/indigo/danger/wa; sizes: sm/md/lg; supports `disabled`, `full` props
- **Chip.jsx** — badge: colors soft/primary/indigo/teal/ok/warn/danger
- **Field.jsx** — labeled input with prefix/suffix/hint/error
- **Card.jsx** — white card with border, accepts `padding` and `style`
- **Avatar.jsx** — initials avatar, hue derived from name
- **Row.jsx** — label+value row for folios (`bold` prop for totals)
- **SectionHead.jsx** — section title + optional right action
- **ScreenHeader.jsx** — sticky top bar, back button, title, subtitle, right slot
- **TabBar.jsx** — bottom nav with FAB (home/diary/new/guests/more)
- **Toggle.jsx** — animated on/off toggle

### Utilities
- **src/utils/voucher.js** — `generateVoucher(b, rt)` opens a print-ready A4 HTML voucher in a new window. **For tentative bookings with a balance, the voucher now displays a yellow "Provisional hold" notice with the auto-release time** and changes the stamp from "BALANCE DUE" / "PAID IN FULL" to "TENTATIVE · ON HOLD".
- **src/i18n.js** — `useT(lang)` hook, `STRINGS` with `en` and `hi` keys
- **src/tokens.js** — `T` design tokens + `injectBaseStyles()` (Google Fonts + CSS animations)

---

## India-specific features
- UPI QR code display on payment step (currently a drawing — needs real Razorpay integration)
- Razorpay payment link generation (mocked)
- WhatsApp Business API notifications (mocked)
- Form C / FRRO for foreign nationals — **auto-detected from country picker**, but actual filing API not yet wired
- GST (CGST+SGST 12%) on bookings, GSTR-1 auto-filing (mocked)
- OTA channels: MakeMyTrip, Goibibo, Booking.com, Agoda
- ₹ currency formatting with `toLocaleString('en-IN')`

---

## What was added in the most recent session

1. **Diary drag-drop changes rooms + units** (not just dates) via `data-slot` attributes + `elementFromPoint`. Conflict detection if target unit/dates already booked.
2. **Functional Diary filters** with live counts (All / Confirmed / On-hold / Form C / OTA).
3. **Auto-release UI** in both the voucher (hold notice section) and BookingDetail (inline alert banner). A real `setInterval` in App.jsx (30s) auto-cancels expired holds.
4. **Per-night rate editor** in NewBooking (toggle expands to per-night inputs when nights > 1).
5. **Saved custom extras** — promoted to global state on booking confirm, persisted to localStorage, with "SAVED" badge + remove option.
6. **Functional Guests search + filters** with live counts; in-house derived from `bookings`.
7. **Country picker** (28 countries) with auto Form C detection and dial-code phone prefix.
8. **Wired action buttons:** check-in, check-out, tentative confirm/cancel, cancelled re-open. Payments that cover the balance auto-confirm a tentative booking.
9. **Lifted Rates `overrides`** to App.jsx so they flow into NewBooking's default per-night rates.
10. **localStorage persistence** for bookings, custom extras, rate overrides, plan, language.
11. **Added `checkout` status** to STATUS dictionary.
12. **Cancelled bookings** rendered struck-through in Diary; excluded from occupancy.

---

## What still needs improvement (prioritized)

### Functional gaps (still UI-only)
- **Channels screen** — OTA event stream is fake; "Push now" button has no real effect (needs channel manager API)
- **Reports** — KPIs are hardcoded; receives `bookings` prop but doesn't compute from it
- **Settings property profile** — edits don't persist
- **Form C filing** — UI is wired (auto-detection works); needs e-FRRO API integration to actually file
- **GSTR-1 auto-filing** — UI present, no real GSTN API integration
- **WhatsApp confirmations** — UI/toasts work, no real WhatsApp Business API hookup
- **Razorpay UPI QR** — currently a fake SVG, needs real Razorpay payment integration
- **PDF voucher** — uses hardcoded check-in dates derived from `startIdx`; works for the demo, fine as-is
- **OTA channel sync** — bookings from MMT/Goibibo/etc don't flow in (requires channel manager partnership)

### Polish opportunities
- Diary drag pill could translate vertically during drag for stronger visual feedback (currently only target row is highlighted)
- New bookings always default to `startIdx: 0` and `unitIdx: 7` — should auto-pick the first available slot based on chosen check-in date
- Saved custom extras can't be edited globally (only deleted) — would be nice to edit the saved price
- No "undo" for cancellations / auto-releases
- The 14-day Diary horizon should be configurable (currently hardcoded in DAYS)

---

## Production roadmap (for going from prototype → real business)

The app is a working UI prototype that needs **8 stages** to become a real product hoteliers pay for:

1. **Real database + auth** (Supabase / Firebase / custom backend) — replace localStorage with cloud DB so data is permanent and multi-device.
2. **PWA wrapper** — add manifest + service worker so hoteliers can "Add to Home Screen" on their phones (Atithi is already 80% PWA-ready).
3. **Razorpay integration** — real UPI QR + payment links + WhatsApp pay button. Hoteliers connect their own Razorpay account via API keys in Settings.
4. **WhatsApp Business API** via a BSP (Gupshup / Wati / Twilio) — real booking confirmations and payment links.
5. **Channel manager partnership** (RateGain / Cloudbeds / STAAH) — to sync inventory and bookings with MMT, Goibibo, Booking.com, Agoda. Direct OTA integrations are months of work each.
6. **GST filing** via ClearTax or direct GSTN API — real GSTR-1 monthly auto-filing.
7. **e-FRRO Form C filing** — government API for foreign-guest immigration reporting.
8. **Multi-user + permissions** — owner vs reception vs manager logins.

Operating cost estimate per hotel: ~₹1,500–4,000/month. Suggested SaaS pricing: ₹5,000–8,000/month per hotel.

---

## Cleanup / housekeeping

The `/project/` folder contains the **original Claude Design HTML/JSX handoff bundle** — kept for reference but not used at runtime. The `/chats/` folder has the original design-iteration transcripts (chat1.md is rich context on user intent, chat2.md is minimal). The live app is entirely in `/src/`.

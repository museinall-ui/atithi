# Atithi — Hotel Booking Engine

Mobile-first hotel PMS/booking engine for small Indian hoteliers. Demo property: **Yatra Desert Camp, Jaisalmer, Rajasthan**.

**Live:** https://museinall-ui.github.io/atithi/
**Repo:** https://github.com/museinall-ui/atithi

## Stack
- Vite + React 18 (ES modules, no TypeScript)
- No routing library — state-based `go(routeName, arg)` pattern in `src/App.jsx`
- Inline styles throughout (no CSS files, no Tailwind)
- Design tokens in `src/tokens.js` → exported as `T` object (oklch color system)
- Google Fonts: Geist, Noto Sans Devanagari, JetBrains Mono

## Deploy
```bash
npm run build
# Then upload dist/ files to gh-pages branch via GitHub API (see deploy history)
# OR: push dist/ manually and update gh-pages branch
```
Base path is `/atithi/` (set in `vite.config.js`) for GitHub Pages.

## Architecture

### Routing — `src/App.jsx`
```
go('home')            → Dashboard
go('diary')           → Diary (Gantt calendar)
go('new')             → NewBooking (4-step flow)
go('booking', id)     → BookingDetail
go('booking-confirmed') → BookingConfirmed
go('rates')           → Rates
go('channels')        → Channels
go('reports')         → Reports
go('guests')          → Guests
go('settings')        → Settings
go('more')            → MoreMenu
```

### State (all in App.jsx)
- `bookings` — array of booking objects, seeded from `BOOKINGS_SEED` in `src/data.js`
- `plan` — `'engine' | 'channels' | 'gst'` (subscription tier)
- `lang` — `'en' | 'hi'` (bilingual, strings in `src/i18n.js`)

### Key data shape (booking object)
```js
{
  id: 'BK-2841',
  roomTypeId: 'dlx',        // matches ROOM_TYPES[].id
  unitIdx: 0,               // which physical room (0-indexed)
  startIdx: 0,              // day index into DAYS array (0 = May 4 2026)
  nights: 3,
  guest: 'Aanya Sharma',
  phone: '+91 98100 21000',
  status: 'confirmed',      // confirmed | checkedin | checkout | tentative | cancelled
  channel: 'direct',        // direct | mmt | goibibo | booking | agoda
  total: 18000,
  paid: 18000,
  guests: '2A 1C',
  vip: false,
  formC: false,             // foreign national requiring Form C/FRRO
  notes: '',
  payments: [],             // payment ledger entries
  extras: [],               // extra services booked
}
```

### Room types — `src/data.js` → `ROOM_TYPES`
| id | name | units | base rate |
|----|------|-------|-----------|
| dlx | Deluxe Tent | 8 | ₹4,500 |
| lux | Luxury Tent (AC) | 6 | ₹7,200 |
| btub | Bathtub Tent | 4 | ₹9,500 |
| pool | Private Pool Cottage | 3 | ₹14,500 |

## Screens & Components

### Screens (`src/screens/`)
- **Dashboard.jsx** — Hero stats, OTA toast notifications, auto-release alerts, arrivals list, channel donut chart
- **Diary.jsx** — Gantt calendar with drag-drop rescheduling, zoom, BookingPill, RoomTypeBlock, confirm modal
- **NewBooking.jsx** — 4 steps: StepDates → StepRoom → StepGuest → StepPayment. Block/hold mechanic, UPI QR, extras
- **BookingDetail.jsx** — Folio, payments ledger, PaymentSheet (payment/refund/credit note), WhatsApp activity feed, check-in/out actions
- **BookingConfirmed.jsx** — Celebration screen after booking creation
- **Rates.jsx** — 30-day calendar grid with drag-select, bulk rate/close-out, discounts list + DiscountForm
- **Channels.jsx** — OTA sync hero, per-channel markup/independent rate, live OTA event stream
- **Reports.jsx** — KPI grid (revenue/occ/ADR/RevPAR), occupancy bar chart, room type breakdown, compliance section
- **Guests.jsx** — CRM list with search, filter chips, lifetime spend
- **Settings.jsx** — Plan picker (engine/channels/gst), language toggle, integrations list, PropertyProfile (fullscreen), GstnSheet (OTP flow)
- **MoreMenu.jsx** — 2×2 grid linking to Rates/Channels/Reports/Settings

### Components (`src/components/`)
- **Icon.jsx** — 40+ SVG icons, `<Icon name="check" size={16} stroke={2} color={T.ok} />`
- **Btn.jsx** — variants: primary/dark/ghost/soft/indigo/danger/wa; sizes: sm/md/lg; `full` prop
- **Chip.jsx** — badge: colors soft/primary/indigo/teal/ok/warn/danger
- **Field.jsx** — labeled input with prefix/suffix/hint/error
- **Card.jsx** — white card with border, accepts `padding` and `style` props
- **Avatar.jsx** — initials avatar, hue derived from name
- **Row.jsx** — label+value row for folios (`bold` prop for totals)
- **SectionHead.jsx** — section title + optional right action
- **ScreenHeader.jsx** — sticky top bar, back button, title, subtitle, right slot
- **TabBar.jsx** — bottom nav with FAB (home/diary/new/guests/more)
- **Toggle.jsx** — animated on/off toggle
- **Row.jsx** — key/value display row

### Utilities
- **src/utils/voucher.js** — `generateVoucher(b, rt)` opens print-ready A4 HTML in new window
- **src/i18n.js** — `useT(lang)` hook, `STRINGS` with `en` and `hi` keys
- **src/tokens.js** — `T` design tokens + `injectBaseStyles()` (Google Fonts + CSS animations)

## India-specific features
- UPI QR code display on payment step
- Razorpay payment link generation
- WhatsApp Business API notifications
- Form C / FRRO for foreign nationals
- GST (CGST+SGST 12%) on bookings, GSTR-1 auto-filing
- OTA channels: MakeMyTrip, Goibibo, Booking.com, Agoda
- ₹ currency formatting with `toLocaleString('en-IN')`

## What needs improvement
The app is currently a **UI prototype with seed data**. To make it fully functional:

1. **Real data persistence** — bookings reset on refresh; needs localStorage or a backend
2. **Diary drag-drop** — visual feedback during drag is minimal; drop zones not highlighted
3. **NewBooking validation** — phone/name validation is basic; no duplicate detection
4. **Rates screen** — overrides are in-memory only; not reflected in NewBooking pricing
5. **Channels screen** — OTA stream is fake/static; push button has no real effect
6. **Reports** — all data is hardcoded; should compute from actual bookings state
7. **Guests screen** — list is hardcoded; should derive from bookings
8. **Check-in/Check-out** — buttons exist in BookingDetail but don't change booking status
9. **Auto-release** — hold timer UI exists but no actual timeout mechanism
10. **PDF voucher** — works but uses hardcoded dates; should use real booking dates
11. **Form C / FRRO** — UI toggle exists, no actual filing logic
12. **Settings** — plan/language changes work; property profile edits don't persist

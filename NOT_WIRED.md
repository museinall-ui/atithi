# Features awaiting wiring

Inventory of every mock, placeholder, or hidden-for-now feature in Atithi. This is the work-list for when we connect Atithi to external services. Each entry has:

- **Where it lives** — file and rough location
- **Current state** — fake, hidden, or removed
- **What it needs** — the external service or integration to make it real
- **Phase** — when we plan to revisit (per the production roadmap in `CLAUDE.md`)

Keep this list in sync with the code when you remove or stub a feature so we don't lose track of what was promised in the UI.

---

## Communications

### WhatsApp send confirmation toggle (REMOVED from UI)
- **Was at:** `src/screens/NewBooking.jsx` Step 3, a green card with "Send WhatsApp confirmation · Auto-template + payment link" and a Toggle locked to `on={true}`.
- **State:** Removed in commit `2d76f08` — was misleading because the toggle did nothing.
- **Needs:** Meta WhatsApp Business Cloud API + an approved message template ("booking_confirmation"). Send on booking create.
- **Phase:** 3

### WhatsApp "Send ₹X link" button (FAKE)
- **At:** `src/screens/BookingDetail.jsx` folio section — green "Send ₹X link" button below the payments ledger when balance > 0.
- **State:** Visible, does nothing on click. No onClick handler.
- **Needs:** Razorpay payment link API to mint a short URL + WhatsApp Cloud API to send it. Compose a templated message with `${guest_name}`, `${amount}`, `${booking_id}`.
- **Phase:** 2 (Razorpay) + 3 (WhatsApp delivery)

### WhatsApp activity feed entry (HIDDEN)
- **Was at:** `src/screens/BookingDetail.jsx` Activity section.
- **State:** Hardcoded "WhatsApp · read ✓✓ by guest" with fake `waStatus` state. Replaced with real activity from booking data in commit `a9663ce`.
- **Needs:** Real read-receipts from WhatsApp Cloud API webhook → store status on the payment/booking row → render in feed.
- **Phase:** 3

### WhatsApp / Call / Email buttons on BookingDetail (FAKE)
- **At:** `src/screens/BookingDetail.jsx` guest card — three buttons under the guest avatar.
- **State:** Visible, no onClick handlers.
- **Needs:** WhatsApp/Call/Email should open `wa.me/${phone}`, `tel:${phone}`, `mailto:${email}` respectively. Free fix, just a wire-up — no external service required. **Do this in the basics pass.**
- **Phase:** Engine (basics)

### Razorpay UPI QR code on the NEW BOOKING payment step (FAKE)
- **At:** `src/screens/NewBooking.jsx` Step 4 → "UPI / QR" payment method → renders `<FakeQR />` SVG.
- **State:** Visible, decorative only. Says "yatradesert@razorpay" but no real UPI handshake.
- **Replacement option:** the property's uploaded payment QR (Settings → Property Profile → Payment QR, shipped May 2026) is what the voucher uses. The fake QR on Step 4 can be replaced with the same `property.profile.paymentQrDataUrl` so the hotelier can show their own real QR to walk-in guests at the desk too.
- **Phase:** quick fix (no external service needed — just swap the source to `property.profile.paymentQrDataUrl`).

### Razorpay activity feed entry (HIDDEN)
- **Was at:** `src/screens/BookingDetail.jsx` Activity — hardcoded "Razorpay · ₹X captured" line with a fake "03 May · 18:25" timestamp.
- **State:** Removed in commit `a9663ce`; real payments now appear from `booking.payments[]`.
- **Needs:** Razorpay webhook → mint a payment ledger entry with the real txn ID + timestamp.
- **Phase:** 2

### Email-to-CA (mailto only)
- **At:** `src/utils/invoiceExport.js` → `emailToAccountant()` opens a `mailto:` link with subject/body prefilled.
- **State:** Works but requires the hotelier to manually attach the printed PDF in their email client.
- **Needs:** Resend (or similar) SMTP API to send the invoice register as an attachment directly, no user action required after tapping "Send".
- **Phase:** 3

---

## Compliance / government

### Form C / FRRO filing for foreign guests (FAKE)
- **At:** `src/screens/NewBooking.jsx` Step 3 — the "Foreign national · Form C filing required" pill that shows when country !== IN.
- **State:** Hint only. Was previously "Form C will be auto-filed with FRRO" until commit `2d76f08` — corrected to honest copy because no API is connected.
- **Needs:** e-FRRO portal access. As of 2026, there's **no public API** — submission is via the government web portal (https://indianfrro.gov.in/frro). Most likely path: hotelier still files manually; Atithi pre-fills the data and prompts on check-in. A true API needs partnership with a GSP that has FRRO access.
- **Phase:** 5 (deferred / partner-only)

### ID Proof picker (REMOVED from UI)
- **Was at:** `src/screens/NewBooking.jsx` Step 3 — three options: Aadhaar (OCR + e-KYC), Passport (Form C auto), Other (DL/Voter).
- **State:** Removed in commit `2d76f08` — was decorative; selected ID type was never persisted on the booking.
- **Needs:**
  - Aadhaar: requires partnership with an e-KYC provider (Karza, IDfy, Digio, etc.) — KYC user agent licence required.
  - Passport: just photo capture + OCR. Could ship with `tesseract.js` for client-side OCR.
  - Manual: just a file/photo upload to Supabase Storage (Phase 4).
- **Phase:** 4 (manual upload) / paid integration for Aadhaar

### Business GSTIN per booking (REMOVED from form)
- **Was at:** `src/screens/NewBooking.jsx` Step 3 — "BUSINESS GSTIN (OPTIONAL)" toggle + GSTIN input. `data.gstin` was set but never flowed onto the booking object.
- **State:** Removed in commit `2d76f08`. The GSTIN field still exists on the **IssueInvoice sheet** (BookingDetail → Issue invoice) which is the correct place — it lands on the tax invoice.
- **Needs:** Nothing. The Issue Invoice path covers the B2B case. If we re-add a guest-level GSTIN we'd need to mirror it onto the booking + default the IssueInvoice form from it.

### "Aadhaar verified" claim on guest header (REMOVED)
- **Was at:** `src/screens/BookingDetail.jsx` guest card — "Indian · Aadhaar verified" subtitle.
- **State:** Removed in commit `a9663ce`. Was a false claim — Atithi has no Aadhaar verification.
- **Needs:** A real Aadhaar e-KYC integration (see ID Proof above) before we can claim "verified".

---

## Channels (OTA sync)

### OTA channel manager (PLACEHOLDER screen)
- **At:** `src/screens/Channels.jsx` — entire screen is a "Coming soon" panel.
- **State:** Honest placeholder. No live event stream, no rate push, no inbound bookings.
- **Needs:** Channel manager partnership (STAAH / RateGain / Cloudbeds / SiteMinder). Costs ₹1,000–5,000/month and the integration is heavy — bookings come in via a webhook, rate updates push out via XML/REST.
- **Phase:** 5 / Channels tier

### Fake "New booking · MakeMyTrip" toast (REMOVED)
- **Was at:** `src/screens/Dashboard.jsx` — popped a fake OTA notification every 12 seconds.
- **State:** Removed in commit `a9663ce` because it claimed bookings that never happened + overlapped the greeting.
- **Needs:** Real channel manager event stream feeds the toast.
- **Phase:** 5

### Channel mix donut on Dashboard (REAL but unverified)
- **At:** `src/screens/Dashboard.jsx` bottom — shows OTA share %.
- **State:** Computes from real `bookings[].channel` field, **but** new bookings created in the app default to `channel: 'direct'`. The OTA breakdown is only meaningful if OTA bookings are flowing in via channel sync.
- **Needs:** Same as above — real OTA bookings.

---

## Payments

### Razorpay payment link generation (DEFERRED, may not be needed)
- **At:** `src/screens/NewBooking.jsx` Step 4 — "WhatsApp link" / "Pay later" options.
- **State:** Records the booking but no real payment link is minted.
- **Owner direction (May 2026):** the hotelier-uploaded payment QR (rendered on every voucher) is the chosen UPI flow. Razorpay payment links would only be needed if the owner wants auto-reconciled payments + tracked delivery — both deferred.
- **If revisited:** would be a BYOK setup (each hotelier pastes Key ID + Secret in Settings → Integrations), with secret key stored encrypted and used only from a Supabase Edge Function. Never via the browser. Funds settle direct to the hotelier's bank (not Atithi's).
- **Phase:** TBD — only when owner asks.

### "Find existing" guest search button (REMOVED from header)
- **Was at:** `src/screens/NewBooking.jsx` Step 3 — small "Find existing" button next to "LEAD GUEST" header.
- **State:** Removed in commit `c2b723d`. Did nothing; replaced by automatic repeat-guest banner that triggers on typing.
- **Needs:** Nothing if the auto-suggest covers it. If we add explicit search, opens a sheet that searches past bookings by partial name/phone/email.

---

## Persistence

### Cloud sync for `customExtras`, `rateOverrides`, `cashCloses`
- **At:** These still live in localStorage only (`src/App.jsx`).
- **State:** Schema tables `saved_custom_extras`, `rate_overrides`, `cash_closes` exist in Supabase but the load/seed/per-action helpers haven't been written.
- **Needs:** Mirror what `src/cloud/bookings.js` does for bookings: load on sign-in, seed on first-time, per-action helpers wrapped in `syncCloud()`.
- **Phase:** 1 remainder

### Magic-link sign-in (DISABLED via DEMO_MODE)
- **At:** `src/App.jsx` — `const DEMO_MODE = true` at the top of the file.
- **State:** The Supabase auth + SignIn screen still exist; just bypassed.
- **Needs:** Flip `DEMO_MODE` back to `false` once basics are signed off. No further code work — just the flag.
- **Phase:** 1 close-out

---

## Reservation / inventory

### Per-room unit allocation + multi-pill Diary rendering
- **At:** `src/screens/Diary.jsx`. Multi-room bookings carry `roomItems[]` with mixed types but only the first room shows as a pill in the Diary.
- **State:** Data model supports multi-room; rendering only shows one pill positioned against `roomTypeId` + `unitIdx`.
- **Needs:** Iterate every `roomItem`, derive per-room `unitIdx` via the same first-free-unit logic used at create time, render N pills (one per room, with a visual link/colour tying them to the same booking).

### Per-night different room type within a booking
- **At:** Booking data model only has one type per `roomItem`.
- **State:** Owner-requested but deferred — most stays don't change room type mid-stay.
- **Needs:** Add `nightTypes: ['dlx', 'lux', 'lux']` array to `roomItem`. Diary needs to render a pill that spans different unit rows over a single booking.

---

## Settings / property

### Property logo upload (FAKE)
- **At:** `src/screens/Settings.jsx` → Property Profile → Logo card.
- **State:** Shows a "Change" button but doesn't actually accept an upload.
- **Needs:** Supabase Storage (free 1GB tier) for the file + URL stored on `property.profile.logoUrl`. Voucher PDF already reads property branding, just needs the image URL.
- **Phase:** 4

### "GSTIN verified" badge in Settings (FAKE)
- **At:** `src/screens/Settings.jsx` — the GSTIN chip on the property header card.
- **State:** Cosmetic — shows green "GSTIN verified" whenever a GSTIN is set, no actual verification.
- **Needs:** A GSTIN-validation API call to confirm the GSTIN is real before showing the badge. Free services exist (e.g. `https://services.gst.gov.in/services/searchtp`).
- **Phase:** 2 (cheap to add)

### "FRRO registered" badge in Settings (FAKE)
- **At:** `src/screens/Settings.jsx` — chip next to GSTIN.
- **State:** Cosmetic. No FRRO check.
- **Needs:** Same as Form C above — no public API. Could be a manual toggle the hotelier sets after they've registered with FRRO.

---

## Future features (owner-flagged, not yet started)

Per the owner's note: "for new features, remember [these]... we will explore these later."

1. **Day close-out** — expand the existing daily cash close into a real reconciliation snapshot (cash + digital + expenses).
2. **Daily expense tracker** — log property running costs (groceries, salaries, utilities). New schema needed.
3. **Team member profiles with role-based access** — owner / reception / manager logins with varied permissions. `memberships(user_id, property_id, role)` table already exists; UI + RLS enforcement is the work.
4. **Public booking engine widget for the hotel's own website** — a `<script>`-embeddable booking form that pulls live rates (read-only — guests can't edit), accepts a reservation, posts to the property's Supabase via a special anon endpoint.

Don't build these until basics are stable.

---

## How to use this file

- When you remove a mock, add an entry here pointing at where it lived.
- When a feature is wired, move the entry to a "Done" section (or delete it) and mention the integration in `CLAUDE.md`.
- This file lives in the repo root so it's visible alongside `CLAUDE.md` — both feed Claude on every new chat.

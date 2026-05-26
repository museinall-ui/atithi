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

### WhatsApp "Send booking summary" / "Send ₹X reminder" buttons (DONE for the manual loop)
- **At:** `src/screens/BookingDetail.jsx` folio + `src/screens/BookingConfirmed.jsx`. Composes a wa.me link via `src/utils/share.js` (`bookingShareWaUrl`) with full booking summary + balance + a pointer to the property's uploaded UPI QR. EN/HI based on the app's current language.
- **State:** Opens WhatsApp Web/app with a pre-filled message the hotelier sends manually. Closes the post-booking share loop.
- **Still needs (for auto-send):** Meta WhatsApp Business Cloud API + approved booking_confirmation template. Phase 3.

### WhatsApp activity feed entry (HIDDEN)
- **Was at:** `src/screens/BookingDetail.jsx` Activity section.
- **State:** Hardcoded "WhatsApp · read ✓✓ by guest" with fake `waStatus` state. Replaced with real activity from booking data in commit `a9663ce`.
- **Needs:** Real read-receipts from WhatsApp Cloud API webhook → store status on the payment/booking row → render in feed.
- **Phase:** 3

### WhatsApp / Call / Email buttons on BookingDetail (DONE)
- **At:** `src/screens/BookingDetail.jsx` guest card.
- **State:** All three open `wa.me/${phone}`, `tel:${phone}`, `mailto:${email}` respectively. Disabled when the field is empty.

### Razorpay UPI QR code on the NEW BOOKING payment step (DONE)
- **Was at:** `src/screens/NewBooking.jsx` Step 4 → "UPI / QR" payment method → rendered a `<FakeQR />` SVG with "yatradesert@razorpay".
- **State:** Swapped to render `property.profile.paymentQrDataUrl` (the hotelier's uploaded UPI QR). Falls back to an empty-state placeholder pointing to Settings → Property profile → Payment QR when no QR is uploaded. `FakeQR` component deleted.

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

### Cloud sync for `customExtras`, `rateOverrides`, `cashCloses` (DONE)
- **State:** Wired in `src/cloud/extras.js`. App.jsx loads + seeds on sign-in and diff-syncs per-cell changes (saved-extras add/remove, rate-override upsert/delete, cash-close upsert/delete) through `syncFire`/`syncCloud`. Dormant under DEMO_MODE but exercises real schema once flipped.

### Magic-link sign-in (DISABLED via DEMO_MODE)
- **At:** `src/App.jsx` — `const DEMO_MODE = true` at the top of the file.
- **State:** The Supabase auth + SignIn screen still exist; just bypassed.
- **Needs:** Flip `DEMO_MODE` back to `false` once basics are signed off. No further code work — just the flag.
- **Phase:** 1 close-out

---

## Reservation / inventory

### Per-room unit allocation + multi-pill Diary rendering (DONE)
- **At:** `src/screens/Diary.jsx` `expandToPillInstances`. Multi-room bookings now render one pill per `roomItem`, with auto-assigned `unitIdx` and a "1/2 · 2/2" badge tying them visually. Drag is gated for multi-room bookings (tap-only) until the multi-slot drop UX lands.

### Per-night different room type within a booking
- **At:** Booking data model only has one type per `roomItem`.
- **State:** Owner-requested but deferred — most stays don't change room type mid-stay.
- **Needs:** Add `nightTypes: ['dlx', 'lux', 'lux']` array to `roomItem`. Diary needs to render a pill that spans different unit rows over a single booking.

---

## Settings / property

### Property logo upload (DONE)
- **At:** `src/screens/Settings.jsx` → Property Profile → Logo card.
- **State:** Inline base64 data URL on `property.profile.logoDataUrl` (same pattern as the Payment QR), 200 KB cap. Renders on the Settings hero and on the voucher header. No Supabase Storage needed.

### "GSTIN verified" / "FRRO registered" badges in Settings (REWORKED)
- **At:** `src/screens/Settings.jsx` — chips on the property header card.
- **State:** Replaced. The header now shows the actual GSTIN (or a "GSTIN not set" warn chip if empty) and a "X rooms live" chip pulled from real category data. No more cosmetic "verified" claims.
- **Future:** A real GSTIN validation API call (e.g. `https://services.gst.gov.in/services/searchtp`) could re-introduce a "Verified" chip later. Phase 2.

### Saved custom extras — edit + reprice (DONE)
- **At:** Property Profile → Saved extras (new section, next to Meal plans).
- **State:** Add / rename / reprice / change unit (per stay/night/guest/guest-per-night) / delete. Diff-syncs to cloud via the existing savedExtras path in `App.jsx` (plus a new `updateSavedExtraCloud` in `src/cloud/extras.js`).

### Settings → Integrations status pills (REWORKED)
- **At:** `src/screens/Settings.jsx` — each integration row had a fake green "Active" pill.
- **State:** Replaced with honest "Manual" / "Coming soon" pills, plus sub-copy that says what the hotelier does today (Record payments by hand, Buttons open wa.me, Submit foreign-guest details manually).

### Public booking engine widget (SHIPPED, partial)
- **At:** `src/screens/PublicBookingWidget.jsx`. Customer-facing 3-step booking flow rendered when URL is `/book/<short-code>` or `?book=1`. Logo + brand colour + payment QR pulled from property. Mini calendar preview + voucher download + "Email a copy" mailto on confirmation.
- **State:** Works fully against the property's localStorage in DEMO_MODE. Bookings land with `channel:'website'` + `status:'tentative'` + 24h auto-release.
- **Needs (for production):**
  - Supabase anon RLS policy allowing INSERT into bookings where `status='tentative'` AND `channel='website'` AND `property_id` matches the URL slug.
  - `properties.short_code` column + a `loadPropertyBySlug` Supabase RPC so the widget can render against the right property in cloud mode.
  - Rate-limiting on the anon insert (token bucket or trivial sliding window in an Edge Function) to spam-protect.
- **Phase:** 1 close-out, after DEMO_MODE flips.

---

## Future features (owner-flagged, not yet started)

Per the owner's note: "for new features, remember [these]... we will explore these later."

1. **Day close-out expansion** — open balance + custom payment accounts (one person's UPI, another's UPI, cash, card, bank). End-of-day shows how much went into each account. New schema needed.
2. **Daily expense tracker** — log property running costs (groceries, salaries, utilities). New schema needed.
3. **Team member profiles with role-based access** — owner / reception / manager logins with varied permissions. `memberships(user_id, property_id, role)` table already exists; UI + RLS enforcement is the work.

Don't build these until basics are stable.

---

## Won't pursue (revised June 2026)

After a Phase 3 scope review the owner pruned two candidates that don't justify the integration work:

### GSTIN auto-validation — DROPPED
- **Why proposed:** Live lookup against `services.gst.gov.in/searchtp` to power a "Verified ✓" chip on the property header + auto-fill company name on B2B invoices.
- **Why dropped:** We already removed the misleading "Verified" chip in the May 2026 audit pass. The remaining value (auto-fill company name on B2B invoices) is a 30-second time-save per invoice. Hotelier types the GSTIN, we trust them. If wrong, they edit the invoice.

### e-FRRO / Form C filing on behalf — DROPPED
- **Why proposed:** Auto-file Form C with the FRRO portal when a foreign guest checks in.
- **Why dropped:** Atithi is not the legal filer; the hotelier is. Filing on someone else's behalf creates regulatory liability for Atithi as a service provider. The current "Form C required" pill + manual filing at indianfrro.gov.in is the legally correct stance. Don't try to file on behalf.

---

## Hotelier audit findings (May 25, 2026)

Walking through every screen as a real hotelier surfaced these gaps. Items still open are flagged ⏳; resolved ones get ✅ when shipped.

### Functionally missing (no UI)
- ⏳ **Multi-month / date-range Reports** — Reports show only the 14-day diary window. Needs a From→To picker.
- ⏳ **PWA install-to-home-screen** — no `public/manifest.json`, no service worker. Phase 1 close-out task.
- ⏳ **Booking edit history / audit trail** — `booking.events[]` log exists internally; not surfaced as a readable changelog.
- ⏳ **Voice notes on bookings** — browser MediaRecorder API.
- ⏳ **Undo for cancellations / auto-releases** — currently terminal.
- ⏳ **Today's check-outs / housekeeping prep card** — explicitly deprioritized by owner.

### Subtly misleading (looks functional, isn't)
- ⏳ **Reports → Compliance → "Form C filed: N of N"** — implies Form C has been filed. Nothing is actually filed (no e-FRRO API). Fix: rename to "Form C required" + add manual-filing note.
- ⏳ **Dashboard → Channel mix donut** — uses hardcoded `[55, 20, 15, 10]` percentages even when Channels/Invoicing tier is active. Should compute from real `bookings[].channel`.
- ⏳ **Public widget hold-time policy is invisible to the hotelier** — widget auto-applies 12h hold (when check-in > 48h away) or 4h hold (when check-in ≤ 48h). Settings → Booking link doesn't explain this. Hoteliers will be surprised when their guests' bookings auto-release. Fix: surface in Settings → Booking link "How it works" line.

### Owner-added next-up (May 25, 2026)
1. ⏳ **Configurable "free child age" threshold** — currently defaults to `<5y free`, `<12y half-rate`. Some properties allow up to 10y free. Hotelier should be able to set both thresholds in Settings. The inputs already exist (`accountant.childFreeBelowAge` + `accountant.childAgeBelow`); verify they're prominently visible + properly flow through to booking math.
2. ⏳ **In-app notifications** —
   - Notify the hotelier when a booking lands via the public widget (channel:'website')
   - Notify 10 minutes before any auto-release timer expires
   - For now: in-app dashboard banners. True push (when app is closed) waits on PWA + push backend.

### Pre-flip readiness checklist (DEMO_MODE → real auth)
The Phase-1 close-out section above (under "Public booking engine widget") and the existing CLAUDE.md "DEMO_MODE flip" notes cover the migration paste-in steps + anon RLS policy. Confirm that list is complete before flipping.

---

## How to use this file

- When you remove a mock, add an entry here pointing at where it lived.
- When a feature is wired, move the entry to a "Done" section (or delete it) and mention the integration in `CLAUDE.md`.
- This file lives in the repo root so it's visible alongside `CLAUDE.md` — both feed Claude on every new chat.

# AtithiBook — Hotelier-Perspective Audit (living tracker)

> **Started:** 2026-06-26 · **Resume code word:** `PADHARO`
> Say **PADHARO** in a fresh chat → the assistant reads this file and continues the fixes from the first unchecked item, in small reviewable batches, verifying behavioural fixes in the browser preview before claiming done.

## Why this audit exists
Prior multi-agent audits optimised for **code correctness** and missed **product common-sense** ("does this behave sensibly for a non-technical hotelier on a fresh account"). The owner found 13 obvious defects in ~5 minutes of real use. This audit walked the real user journeys as a first-time hotelier with zero data. **Result: 50 distinct issues (2 blockers, 11 high, 16 medium, 21 low)** from 148 raw findings across 11 journeys.

## Status
- [x] Audit complete (2026-06-26) — 23 agents, all 11 journeys + critique + synthesis.
- [x] Batch 1 — Trust-breaking blockers (setup gate #1 + advance-vs-paid #6 + demo-phone #13 + extras-delete #2 + pinch-zoom #7)
- [ ] Batch 2 — Booking & money correctness
- [ ] Batch 3 — Phone & guest data
- [ ] Batch 4 — Past-date & inventory integrity
- [ ] Batch 5 — Accessibility & share reliability
- [ ] Batch 6 — Voucher copy & i18n polish

---

## Owner's 13 — root-caused

| # | Owner report | Confirmed root cause | Severity |
|---|---|---|---|
| 1 | Setup not mandatory; booking shows default rates with no setup | `data.js:14-16` `effectiveRoomTypes()` returns hardcoded demo `ROOM_TYPES` when `categories` empty. New accounts bootstrap `categories:[]` (`App.jsx:1121`). Onboarding skippable (`Onboarding.jsx:284-291`); no route gate. Adults default to `2` (`NewBooking.jsx:1209`). | **Blocker** |
| 2 | Trash on saved/custom extras does nothing | (a) In-booking trash → `App.jsx:1932` only filters `savedCustomExtras`, never `data.customExtras`/`data.extras` (`NewBooking.jsx:981-985`). (b) Settings saved-extras trash not wired to `removeSavedCustomExtra` (`Settings.jsx ~2031-2094`). | High |
| 3 | Voice types each phrase 2-3× | `useSpeech.js:48` `continuous=true` + onend auto-restart (`:77-87`) + `onresult` emits every `isFinal` from `resultIndex` with no last-emitted-index tracking; `VoiceBookingSheet.jsx:45` blindly appends. Restart replays trailing final. Recognizer hardcoded `en-IN` even in Hindi (`VoiceBookingSheet.jsx:43`). | High |
| 4 | Rates & inventory editable for PAST dates | `Rates.jsx` cell handlers (`:295-344`) + all bulk `apply*` (`:453-625`) have no `idx>=0` guard. Same in Diary `openDateEditor` (`Diary.jsx:514`) + empty-cell create. | High |
| 5 | Extras hardcoded for all properties | `data.js:931-937` `EXTRAS_DEFAULT` (desert-camp) always prepended (`NewBooking.jsx:1338-1340`); presets get no trash. No per-property preset-extras concept. | High |
| 6 | "Collect payment" records as PAID not DUE | `App.jsx:1949-1953` `onCreate()` sets `paid` directly from `data.payAmount`. Step-4 "Collect now" (`NewBooking.jsx:1070-1112`) has no due-vs-received split. | **Blocker** |
| 7 | Pinch-zoom doesn't work | `Rates.jsx:768` grid `touchAction:'none'`; `Diary.jsx:219` same. Viewport meta allows zoom (`index.html:5`) — CSS is the sole cause. | High |
| 8 | No block-rooms from Diary date-header w/ override prompt | Editor exists (`Diary.jsx:514-558`, header tap `:892`) but `saveDateEditor` silently floors to booked count (`:542`), no override-confirm on discrepancy. | Medium |
| 9 | Voucher missing cancellation policy | Implemented (`voucher.js:254-261`) BUT when `ratePlans` empty it asserts a fabricated `cancelFlexible(48)` default (`:535-538`) the owner never set. | Medium |
| 10 | Phone accepts more digits than country allows | `NewBooking.jsx:927` no `maxLength`/per-country cap; only `length>=6` (`:929`). `COUNTRIES` carries only `dial`. Letters pass too. | Med/High |
| 11 | QR prompted at share time, not Settings | QR plumbing confirmed (`voucher.js:520-524` reads `paymentQrDataUrl`) but the share-time re-prompt UX wasn't isolated to a line — **needs a live check**. | Medium |
| 12 | iPhone share opens generic WhatsApp, not guest chat | `BookingConfirmed.jsx:70-79` & `BookingDetail.jsx:882-904` call `shareBookingWithVoucher()` (`share.js:113-137`, `navigator.share`) FIRST — on iOS that's the OS sheet with no recipient. `wa.me` is only the fallback. Contact button (`BookingDetail.jsx:647`) uses `wa.me` directly and works. | High |
| 13 | Hotelier contact number in guest message is wrong | `share.js:92`/`:66` `Reach us: ${propPhone || propName}` falls back to **hotel name** when phone blank; `DEFAULT_PROPERTY.profile.phone='+91 90099 12345'` (`App.jsx:167`) can leak via `migrateProperty`. Dashboard says "Reach us on this number" but prints none (`Dashboard.jsx:707,732`). | Med/High |

All 13 reproduced & root-caused except **#11** (needs live reproduction).

---

## All findings by area

### Onboarding / setup gate
- [x] **[BLOCKER]** No setup gate. ✓ FIXED + verified live. `effectiveRoomTypes()` now returns `[]` (not the demo Yatra tents) for an unconfigured property (`data.js`), killing the demo-room/rate leak at the source across Diary/Rates/Dashboard/NewBooking/Voice/widget. New `isPropertyConfigured(property)` (name + ≥1 room) drives a `setupGate` in `App.jsx` that routes `new`/`rates`/`diary` to a friendly **SetupGate** "Finish setting up your hotel → Go to Settings" screen until setup is done. Dashboard occupancy shows an "Add your rooms" empty-state instead of "/21 rooms". Demo mode is exempt (seeds the full property). _Verified: gate fires on all 3 routes; Dashboard empty-state; "Go to Settings" works; demo + all non-gated screens render with no crash; build passes._
- [~] **[PARTIAL]** Onboarding "Skip" still leaves an empty property — but it now lands on safely-gated screens (no demo rooms, SetupGate on the action screens) instead of a fake-data app. Making Skip itself create a first room is a smaller follow-up. `Onboarding.jsx:284-291`.
- [ ] **[HIGH]** Saving against a demo room type writes a phantom `roomTypeId` that won't match real rooms later. `App.jsx:2154`. (validate `roomTypeId ∈ categories` on save.)
- [ ] **[MEDIUM]** No mandatory-field enforcement in Settings Property Profile; Save accepts a blank hotel. `Settings.jsx:641-676`.
- [ ] **[LOW]** New Booking always seeds 2 adults, ignoring `property.baseCapacityAdults`. `NewBooking.jsx:1209`.

### Booking / money correctness
- [x] **[BLOCKER]** "Collect now" recorded the advance as PAID, not DUE. ✓ FIXED + verified live. New bookings already defaulted to `'none'` (paid=0); the trust-breaker was the ambiguous "COLLECT NOW" picker reading as "amount due to confirm" while it actually set `paid`. The picker is relabelled **"PAYMENT RECEIVED NOW"** with a hint ("Only record money you've actually received now. The rest stays as balance due — add it later from the booking page.") and the default option renamed **"Not yet · Full amount due"**. So the default takes nothing as paid and the legit "guest paid an advance now" flow stays. _Verified live: creating a booking with the default writes `paid:0`, full balance due, no synthetic payment row._ No migration. `App.jsx onCreate`, `NewBooking.jsx StepPayment`, `i18n.js`.
- [x] **[HIGH]** New-booking edit-seed defaulted `payAmount:'full'` (latent footgun). ✓ FIXED — edit-seed now `'none'`. `NewBooking.jsx`.
- [ ] **[HIGH]** GST slab lookup uses `ROOM_TYPES` not `effectiveRoomTypes` → a renamed/custom ≥₹7,500 room taxed at 5% not 18%. `NewBooking.jsx:1394-1396`.
- [ ] **[MEDIUM]** Step 4 confirms with payment method missing and ₹0 "Custom" advance. → require `payCustom>0` + method. `NewBooking.jsx:1595`.
- [ ] **[MEDIUM]** Meal-plan downgrade can drive subtotal below room tariff (no floor). `NewBooking.jsx:1372-1387`.
- [ ] **[MEDIUM]** Meal-plan prices seeded from demo (CP +₹500, MAP +₹1,200, AP +₹2,000) on every fresh property. `App.jsx:267-269`.
- [ ] **[LOW]** "Half" advance is `Math.round(total/2)`; ₹1 mismatch on odd totals. `App.jsx:1951`.
- [ ] **[LOW]** Custom extra priced ₹0 cannot be added (silent no-op). `NewBooking.jsx:851-852`.
- [ ] **[LOW]** Custom-extra price accepts non-numeric → stores `NaN`. `NewBooking.jsx:851-854`.
- [ ] **[LOW]** Default preset extras say "Per person/Per evening" but charge per-stay (no `unit`). `data.js:931-937`, `NewBooking.jsx:1356`.

### Extras (trash / preset model)
- [ ] **[HIGH]** Extras are hardcoded desert-camp presets shown to every property; defaults un-removable. → per-property saved extras + custom escape hatch; delete for all rows. `data.js:931-937`, `NewBooking.jsx:1338-1340,:981`.
- [x] **[HIGH]** Trash on a just-added custom extra no-ops. ✓ FIXED + verified live — trash now clears the extra from `data.customExtras`/`extras`/`extraPrices`, not just the saved pool. `NewBooking.jsx:981`.
- [ ] **[LOW]** Removing a saved extra leaves its qty in `data.extras` (still billed). `NewBooking.jsx:1352`.
- [ ] **[LOW]** Reset/clear affordance missing for custom extras. `NewBooking.jsx:992-994`.

### Phone / guest validation
- [ ] **[HIGH]** Phone accepts unlimited digits AND non-numeric (`abcdef` passes `length>=6`); breaks wa.me/tel:. → strip non-digits; per-country length cap (IN=10). `NewBooking.jsx:927,:929,:1508`; `Settings.jsx:1040`.
- [ ] **[LOW]** Repeat-guest auto-suggest matches last 5 digits and overwrites typed identity. `NewBooking.jsx:824,:839-849`.
- [ ] **[LOW]** Repeat-guest "Use these details" never restores saved email (comment lies). `NewBooking.jsx:839-849`.
- [ ] **[LOW]** Switching country keeps previously-typed digits with new dial prefix. `NewBooking.jsx:909-918`.
- [ ] **[LOW]** Legacy "2A 1C" recovered children always land in half-rate band on edit. `NewBooking.jsx:1158-1165`.

### Rates & inventory
- [ ] **[HIGH]** Rates calendar editable for PAST dates (cells + all bulk apply). `Rates.jsx:295-344,:453-625`.
- [ ] **[HIGH]** Diary day-header per-date editor opens & saves overrides for PAST dates. `Diary.jsx:514,:530,:892`.
- [x] **[HIGH]** Diary grid BODY rendered demo `ROOM_TYPES`. ✓ FIXED by the setup-gate change — `effectiveRoomTypes()` returns real categories when configured and `[]` (gated) when not, so the demo tents never reach the grid. `Diary.jsx:930`.
- [x] **[HIGH]** Pinch-to-zoom dead on Rates grid. ✓ FIXED — Rates grid `touchAction` → `'pan-y pinch-zoom'` (custom month-swipe preserved; Diary grid already zooms — only the pill keeps `touchAction:none` for drag). `Rates.jsx:768`.
- [ ] **[MEDIUM]** Diary close-out silently floors rooms-open to booked, no "override the set inventory?" prompt; can silently re-open maintenance close-outs. `Diary.jsx:530-558`.
- [ ] **[LOW]** Set-rate "extra zero" confirm gated on `base>0`, so when base 0 any value applies; no absolute cap. `Rates.jsx:458-460`.
- [ ] **[LOW]** Diary "Rooms open" input accepts impossible values while typing; live "free" label lies until save. `Diary.jsx:965,:970-973`.
- [ ] **[LOW]** Past-date bulk confirm/undo labels count past dates in the selection. `Rates.jsx:478,:553`.
- [ ] **[LOW]** Past-date Diary headers still show pointer cursor + tap target. `Diary.jsx:892-894`.

### Diary (other)
- [ ] **[MEDIUM]** Drag-drop can move a booking's check-in into the PAST (clamp floors at `viewDaysStart`, not today). `Diary.jsx:743-745`.
- [ ] **[MEDIUM]** Empty-cell tap on a PAST date opens New Booking for a gone-by day. `Diary.jsx:328,:388`.
- [ ] **[MEDIUM]** Move-booking confirm copy promises "re-issue the voucher to the guest" but nothing is sent. `i18n.js:10,:469`; `Diary.jsx:1037-1054`.
- [ ] **[LOW]** Occupancy header can read >100% on overbook with no cap. `Diary.jsx:919-920`.
- [ ] **[LOW]** Zoom/filter/collapsed Diary view state resets on every navigation. `Diary.jsx:488,:494,:497`.
- [ ] **[LOW]** No empty-state copy on a zero-booking Diary. `Diary.jsx:881-952`.

### Voucher
- [ ] **[MEDIUM]** Voucher asserts a cancellation policy never configured (default 48h flexible). `voucher.js:254-261,:535-538`.
- [ ] **[MEDIUM]** Voucher fabricates "2 Adults" when guests string can't be parsed; multi-room parse only reads FIRST token. `voucher.js:399-401,:405`.
- [ ] **[MEDIUM]** Voucher "Reach us" prints "WhatsApp <blank>" / hotel name when no phone set. `voucher.js:88`.
- [ ] **[LOW]** Voucher QR lightbox closes on backdrop tap AND on tapping the QR; no close affordance. `voucher.js:523`.

### Sharing / comms
- [ ] **[HIGH]** Share-to-guest opens generic OS share sheet (iOS & Android) instead of guest's WhatsApp chat. → prefer `bookingShareWaUrl`; file-share secondary. `BookingConfirmed.jsx:70-79`, `BookingDetail.jsx:882-904`, `share.js:113-137`.
- [ ] **[MEDIUM]** Cancelling the share sheet returns `true` (AbortError = success) → wa.me fallback never fires → guest gets nothing. `share.js:132-136`.
- [ ] **[MEDIUM]** BookingConfirmed fires two `window.open`; the deferred WhatsApp popup is blocked on mobile. `BookingConfirmed.jsx:77-78`.
- [~] **[MEDIUM]** Dashboard arrival/reminder WhatsApp messages: ✓ number-accuracy FIXED (prints the real saved phone or omits the clause). STILL hardcoded English in Hindi mode → Batch 6 i18n. `Dashboard.jsx:707,:732`.
- [ ] **[MEDIUM]** BookingConfirmed shows no send button AND no "add a phone" hint when phone is junk-but-not-empty. `BookingConfirmed.jsx:65,:84`.
- [ ] **[LOW]** Per-booking "WhatsApp" contact button opens an empty chat (no `?text`). `BookingDetail.jsx:647`.
- [ ] **[LOW]** Share/voucher language inferred from `t('home')==='होम'` string-equality (fragile). `BookingDetail.jsx:883`.
- [ ] **[LOW]** Saved-extras editor strings English-only in Hindi mode. `Settings.jsx:2032-2034`.

### Voice
- [ ] **[HIGH]** Dictation appends each phrase 2–3× (continuous + auto-restart + no final-index dedupe). → track last-emitted final index per recognizer instance. `useSpeech.js:48-87`, `VoiceBookingSheet.jsx:45`.
- [ ] **[MEDIUM]** Recognizer hardcoded `en-IN` even in Hindi mode. `VoiceBookingSheet.jsx:43`.
- [ ] **[MEDIUM]** Voice prefills demo rooms/rates before setup. `parseBookingCommand.js:30,:107-115,:164`.
- [ ] **[MEDIUM]** Voice "2000 advance" → `payAmount:'custom'` → recorded as paid even with no spoken total. `parseBookingCommand.js:204-208`.
- [ ] **[LOW]** Stale interim transcript lingers across auto-restart. `useSpeech.js:77-87`.
- [ ] **[LOW]** Mic button has no double-tap/in-flight guard. `VoiceBookingSheet.jsx:62-67`.
- [ ] **[LOW]** "Review booking" busy state leaks `true` on success path. `VoiceBookingSheet.jsx:75-92`.
- [ ] **[LOW]** Stale comment says 503 code is `no_anthropic`; server returns `no_ai`. `parseBookingCommand.js:10,:56`.

### Cross-cutting / leaked defaults
- [x] **[HIGH]** Fabricated default contact `+91 90099 12345` leaking via `migrateProperty`. ✓ FIXED — profile now merges over a BLANK shape, not `DEFAULT_PROPERTY.profile`; share.js omits "Reach us" when no phone (never the hotel name). `App.jsx migrateProperty`, `share.js`.

### Suspected — needs a live check (not dropped)
- [ ] **[NEEDS LIVE CHECK]** Owner #11 — Payment QR re-prompted at share time vs relying on Settings value. `voucher.js:520-524`.
- [ ] **[SUSPECTED]** Shareable voucher HTML references CDN-URL images (post-Phase-4) that won't load offline/detached — inline as base64. `voucher.js:520-524,:587`.
- [ ] **[SUSPECTED]** Desktop browsers with `navigator.share` also swallow the wa.me fallback. `share.js:114`.
- [ ] **[SUSPECTED]** Dragging a pill toward a collapsed room-type block is a dead drop zone. `Diary.jsx:364,:670-678`.
- [ ] **[SUSPECTED]** Voice "Review" may lose a late final on slow Android. `VoiceBookingSheet.jsx:75-92`.
- [ ] **[SUSPECTED]** Diary text too small with no in-app font scaling. `Diary.jsx:787-788,:904`.

---

## Recommended fix order (small reviewable batches)

**Batch 1 — Trust-breaking blockers (ship first)**
1. Setup gate: `effectiveRoomTypes()` → `[]` for unconfigured property; empty-states + route-gating for `new`/`rates`/`diary`; Diary grid uses `effectiveRoomTypes`; Dashboard occupancy off real categories. *(Owner #1; fixes the demo-room leak across Diary/Rates/Voice/NewBooking in one change.)*
2. Advance-vs-paid split: default `paid=0`; "Collect now" → "Amount due to confirm"; separate "Log payment received". *(Owner #6; also fixes voice-advance-as-paid.)*
3. Remove leaked demo phone (`App.jsx:167`) from real-property merge; omit "Reach us"/voucher contact when phone empty. *(Owner #13.)*

**Batch 2 — Booking & money correctness**
4. Per-property preset extras + working trash on all rows, clearing `data.extras`/`extraPrices`. *(Owner #2, #5.)*
5. GST slab lookup via `effectiveRoomTypes`; meal-plan downgrade floor; seed only EP ₹0 on fresh property.
6. Step-4 confirm guard (amount>0 + method); ₹0/NaN custom-extra parse; half-split display.

**Batch 3 — Phone & guest data**
7. Per-country phone length in `COUNTRIES`, digit-only filter, max-length + validation on guest mobile + Settings contact. *(Owner #10.)*
8. Repeat-guest: require strong match before overwrite; carry email; country-change reconciliation.

**Batch 4 — Past-date & inventory integrity**
9. `idx>=0` guard across Rates cells + all `apply*` + range-select; Diary editor/empty-cell/drag clamp. *(Owner #4.)*
10. Diary close-out "override the set inventory?" confirm; input clamping; maintenance re-open warning. *(Owner #8.)*

**Batch 5 — Accessibility & share reliability**
11. `touchAction:'pan-x pan-y pinch-zoom'` on Rates/Diary; bump calendar fonts. *(Owner #7.)*
12. Prefer `wa.me` guest deeplink primary on iOS/desktop; AbortError → false; synchronous WhatsApp open. *(Owner #12.)*
13. Voice dedupe (per-instance final index) + Hindi locale. *(Owner #3.)*

**Batch 6 — Voucher copy & i18n polish**
14. Cancellation block only when a rate plan defines it; "2 Adults"/multi-room parse fix; QR lightbox close. *(Owner #9.)*
15. i18n Dashboard reminders (+ phone), saved-extras editor strings; move-booking copy; thread `lang` prop.
16. Live-check Owner #11 (QR set-once vs re-prompt) + the suspected list.

---

## Fix log
- **2026-06-27 — Batch 1 (partial): 3 trust-breakers shipped + verified.**
  - `#13` leaked demo phone — `migrateProperty` merges profile over a BLANK shape (not Yatra `DEFAULT_PROPERTY.profile`); `share.js` omits "Reach us" when no phone (en+hi); Dashboard messages print the real phone or drop the clause. _Verified: build + clean boot._
  - `#7` pinch-zoom on Rates grid (`touchAction` → `pan-y pinch-zoom`). _Verified: build; viewport already allows zoom._
  - `#2` dead extras-delete — trash clears the extra from the current booking. _Verified LIVE in preview: added "Sleeping under the sky", tapped trash, row removed, no console errors._
- **2026-06-27 — Batch 1 COMPLETE: the two remaining blockers shipped + verified live.**
  - `#1` setup gate — `effectiveRoomTypes()` → `[]` for an unconfigured property (was the demo Yatra rooms); new `isPropertyConfigured()` + a `setupGate` in `App.jsx` route `new`/`rates`/`diary` to a **SetupGate** "Finish setting up your hotel" screen; Dashboard occupancy shows an "Add your rooms" empty-state; Rates has a fail-safe empty-state; demo mode exempt. _Verified live in preview: gate fires on all 3 routes, Dashboard empty-state, "Go to Settings" nav, demo + every non-gated screen render with zero crashes, build passes._ No migration.
  - `#6` advance-vs-paid — picker relabelled "PAYMENT RECEIVED NOW" + hint; default "Not yet · Full amount due"; edit-seed default `'full'`→`'none'`. _Verified live: a booking created with the default writes `paid:0` / full balance / no payment row._ No migration.
  - Files: `src/data.js`, `src/App.jsx`, `src/screens/Dashboard.jsx`, `src/screens/Rates.jsx`, `src/screens/NewBooking.jsx`, `src/i18n.js`.
- **NEXT (resume here):** Batch 2 — per-property preset extras + working trash on ALL rows (#5, remaining half of #2 presets); GST slab via `effectiveRoomTypes` not `ROOM_TYPES` (renamed ≥₹7,500 room taxed at 5% not 18%); meal-plan downgrade floor; seed only EP ₹0 on a fresh property; Step-4 confirm guard (amount>0 + method); ₹0/NaN custom-extra parse. Then Batch 3 (phone/guest), Batch 4 (past-date), Batch 5 (a11y/share), Batch 6 (voucher/i18n).

_Append shipped batches here (commit hash + what it fixed + how verified)._

# AtithiBook — Hotelier-Perspective Audit (living tracker)

> **Started:** 2026-06-26 · **Resume code word:** `PADHARO`
> Say **PADHARO** in a fresh chat → the assistant reads this file and continues the fixes from the first unchecked item, in small reviewable batches, verifying behavioural fixes in the browser preview before claiming done.

## Why this audit exists
Prior multi-agent audits optimised for **code correctness** and missed **product common-sense** ("does this behave sensibly for a non-technical hotelier on a fresh account"). The owner found 13 obvious defects in ~5 minutes of real use. This audit walked the real user journeys as a first-time hotelier with zero data. **Result: 50 distinct issues (2 blockers, 11 high, 16 medium, 21 low)** from 148 raw findings across 11 journeys.

## Status
- [x] Audit complete (2026-06-26) — 23 agents, all 11 journeys + critique + synthesis.
- [x] Batch 1 — Trust-breaking blockers (setup gate #1 + advance-vs-paid #6 + demo-phone #13 + extras-delete #2 + pinch-zoom #7)
- [x] Batch 2 — Booking & money correctness (extras model #5, ₹0/NaN custom-extra, qty-0 cleanup, meal-plan floor, fresh-property EP-only meal seed, Step-4 confirm guard; GST-slab + half-split were verified NOT bugs)
- [x] Batch 3 — Phone & guest data (per-country phone length+digit-only #10, repeat-guest stronger match + carry email, country-switch re-clamp; legacy children-band = won't-fix/ambiguous)
- [x] Batch 4 — Past-date & inventory integrity (Rates + Diary past dates read-only #4; Diary close-out override confirm + input clamp #8; extra-zero cap)
- [x] Batch 5 — Accessibility & share reliability (wa.me guest-chat primary #12; voice dictation dedupe + Hindi recognizer locale #3)
- [x] Batch 6 — Voucher copy & i18n polish (cancellation policy only when rate plans on #9; guests parse; terms "Reach us" when no phone; QR lightbox close; Dashboard WhatsApp msgs + move-booking copy bilingual; Settings i18n deferred)

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
- [x] **[NOT A BUG]** GST slab lookup. ✓ VERIFIED current code is correct: NewBooking does NOT import `ROOM_TYPES`; line 1182 defines a local `const ROOM_TYPES = effectiveRoomTypes(property)`, so the GST loop (line ~1413) already uses the property's real categories. A renamed/custom ≥₹7,500 room IS taxed at 18%. (The audit's original line ref pre-dated a fix.)
- [x] **[MEDIUM]** Step 4 could confirm with no payment method / ₹0 "Custom" advance. ✓ FIXED + verified live — `paymentValid` gates the Confirm button: 'Not yet' needs nothing; 'Custom' needs `payCustom>0` AND a method; Full/50% need a method. `NewBooking.jsx`.
- [x] **[MEDIUM]** Meal-plan downgrade could drive subtotal below the room tariff. ✓ FIXED — `mealCost` floored at `-roomsSubtotal`. `NewBooking.jsx`.
- [x] **[MEDIUM]** Meal-plan prices seeded from demo on every fresh property. ✓ FIXED + verified live — `migrateProperty` now tests the SAVED `p.mealPlans` (not `out`, which is always demo-seeded via `{...DEFAULT_PROPERTY, ...p}`) and seeds a clean EP-only ₹0 set for a fresh property; demo keeps its rich prices. `App.jsx`.
- [x] **[NOT A BUG]** "Half" advance ₹1 mismatch. ✓ VERIFIED both the StepPayment "50%" sub-label and onCreate's `paid` use the same `Math.round(total/2)` — they always match. No change.
- [x] **[LOW]** Custom extra priced ₹0 couldn't be added. ✓ FIXED — addCustom allows an explicit ₹0 (free add-on), rejects a blank price. `NewBooking.jsx`.
- [x] **[LOW]** Custom-extra price could store `NaN`. ✓ FIXED — `Number.isFinite` guard (and the `type=number` input already blocks non-numeric entry). `NewBooking.jsx`.
- [x] **[LOW]** Default preset extras claimed "Per person/Per evening" but billed per-stay. ✓ MOOT — the desert-camp presets are no longer shown to non-demo properties (see Extras section); the demo seeds them as per-stay saved extras.

### Extras (trash / preset model)
- [x] **[HIGH]** Extras were hardcoded desert-camp presets shown to every property + un-removable. ✓ FIXED + verified live — the booking extras picker now lists ONLY the property's own saved/added extras (the `...EXTRAS_DEFAULT` prepend is gone), with the "+ Add custom" escape hatch; every row is removable. A fresh property starts with an empty list; the DEMO seeds its pool with the camp extras so the preview still looks complete. `extrasBreakdownFor` keeps EXTRAS_DEFAULT in its catalog so OLD bookings still itemise. `data.js`, `NewBooking.jsx`, `App.jsx`.
- [x] **[HIGH]** Trash on a just-added custom extra no-ops. ✓ FIXED + verified live — trash now clears the extra from `data.customExtras`/`extras`/`extraPrices`, not just the saved pool. `NewBooking.jsx:981`.
- [x] **[LOW]** Removing/zeroing an extra left a stray qty in `data.extras`. ✓ FIXED — the "−" stepper now deletes the key when qty hits 0 (the trash already cleared qty + price). `NewBooking.jsx`.
- [ ] **[LOW]** Reset/clear affordance missing for custom extras. `NewBooking.jsx:992-994`.

### Phone / guest validation
- [x] **[HIGH]** Phone accepted unlimited digits + letters. ✓ FIXED + verified live — `COUNTRIES` gained a per-country `len`; the mobile field strips non-digits + caps at `len` (maxLength), shows a "{n}-digit" hint, and `guestValid` requires exactly `len` digits. _Verified: "abc98765four43210999" → "9876543210"; 8 digits disables Continue + shows the hint; 10 enables._ Settings contact phone strips letters (keeps + / spaces) + 18-char cap. `data.js`, `components/Field.jsx`, `NewBooking.jsx`, `Settings.jsx`.
- [x] **[LOW]** Repeat-guest matched on the last 5 digits + ignored email. ✓ FIXED — phone match now needs ≥7 typed digits as a FULL suffix of the saved number; "Use these details" now actually carries the saved email. (Prefill stays tap-only, so it never auto-overwrites.) _Verified live: name match still surfaces the banner._ `NewBooking.jsx`.
- [x] **[LOW]** Switching country kept the old digits over the new (shorter) cap. ✓ FIXED — country change re-clamps the digits to the new `len`. _Verified live: 10-digit IN → Singapore (len 8) clamped to 8._ `NewBooking.jsx`.
- [~] **[WON'T FIX]** Legacy "2A 1C" recovered children land in the half-rate band on edit. Inherent: a stored "1C" carries no age, so it can't be mapped to free/half/full — half-rate is the sane default. Not worth a guess that could mis-price. `NewBooking.jsx parseGuestsLabel`.

### Rates & inventory
- [x] **[HIGH]** Rates calendar was editable for PAST dates. ✓ FIXED + verified live — past cells (idx<0) are faded + `cursor:not-allowed`, selection is blocked at `onCellDown`/`onCellEnter`, and the From→To range + Copy-from clamp their low end to today. So past dates never enter `selected` and every bulk-apply + undo count is past-safe. _Verified: clicking June 1 (past) doesn't select; June 28 (future) does._ `Rates.jsx`.
- [x] **[HIGH]** Diary day-header editor opened for PAST dates. ✓ FIXED — `openDateEditor` returns early for idx<0; past headers are faded + non-tappable. `Diary.jsx`.
- [x] **[HIGH]** Diary grid BODY rendered demo `ROOM_TYPES`. ✓ FIXED by the setup-gate change — `effectiveRoomTypes()` returns real categories when configured and `[]` (gated) when not, so the demo tents never reach the grid. `Diary.jsx:930`.
- [x] **[HIGH]** Pinch-to-zoom dead on Rates grid. ✓ FIXED — Rates grid `touchAction` → `'pan-y pinch-zoom'` (custom month-swipe preserved; Diary grid already zooms — only the pill keeps `touchAction:none` for drag). `Rates.jsx:768`.
- [x] **[MEDIUM]** Diary close-out silently floored rooms-open + no override prompt. ✓ FIXED + verified live — `saveDateEditor` now confirms ("This changes how many rooms are available… Apply anyway?") whenever the available-room count changes (close-out or re-open); rate-only / untouched saves don't prompt. _Verified: changing Deluxe 8→5 fired the confirm._ `Diary.jsx`, `i18n.js`.
- [x] **[LOW]** Set-rate "extra zero" confirm only worked when base>0. ✓ FIXED — falls back to an absolute ₹50,000/night ceiling when base is 0. `Rates.jsx`.
- [x] **[LOW]** Diary "Rooms open" input accepted impossible values. ✓ FIXED — onChange clamps to 0..units, so the live "free" label can't lie. `Diary.jsx`.
- [x] **[LOW]** Past-date bulk confirm/undo labels counted past dates. ✓ FIXED — past dates never enter the selection now, so `selected.size` (and Copy-from's clamped `indexes.length`) only count today+future. `Rates.jsx`.
- [x] **[LOW]** Past-date Diary headers showed pointer cursor + tap target. ✓ FIXED — past headers are `cursor:default`, faded, non-tappable. `Diary.jsx`.

### Diary (other)
- [x] **[MEDIUM]** Drag-drop could move a booking's check-in into the PAST. ✓ FIXED — the drop clamp floors at `Math.max(0, viewDaysStart)` (today), not the visible-window start. `Diary.jsx`.
- [x] **[MEDIUM]** Empty-cell tap on a PAST date opened New Booking. ✓ FIXED — `openQuickCreate` returns early for idx<0; past empty cells are faded + non-tappable. `Diary.jsx`.
- [x] **[MEDIUM]** Move-booking confirm copy promised an auto re-issued voucher that's never sent. ✓ FIXED — `moveDesc` (en+hi) now says it updates the dates, the guest isn't notified automatically, and to re-send the voucher from the booking page if needed. `i18n.js`.
- [ ] **[LOW]** Occupancy header can read >100% on overbook with no cap. `Diary.jsx:919-920`.
- [ ] **[LOW]** Zoom/filter/collapsed Diary view state resets on every navigation. `Diary.jsx:488,:494,:497`.
- [ ] **[LOW]** No empty-state copy on a zero-booking Diary. `Diary.jsx:881-952`.

### Voucher
- [x] **[MEDIUM]** Voucher asserted a cancellation policy never configured. ✓ FIXED + verified live — the cancellation block only renders when `ratePlansActive(property)` AND the booking's plan defines a cancellation; a default property prints none (was a fabricated "free cancellation up to 48h"). _Verified: the demo voucher has no cancellation block._ `voucher.js`.
- [x] **[MEDIUM]** Voucher fabricated "2 Adults" + read only the first guests token. ✓ FIXED — `parseGuests` sums every `<n>A`/`<n>C` token and falls back to the guaranteed minimum of 1 adult (only the legacy no-roomItems path uses it). _Verified: demo voucher shows the real "2 Adults"._ `voucher.js`.
- [x] **[MEDIUM]** Voucher terms printed "WhatsApp &lt;blank&gt;" with no phone. ✓ FIXED — the "WhatsApp {phone} quoting {id}" clause is conditional on a phone being set; otherwise it just says "quote {id}". (en+hi) _Verified: with a phone set it includes it._ `voucher.js`.
- [x] **[LOW]** Voucher QR lightbox had no close affordance + closed on tapping the QR. ✓ FIXED — added an ✕ close button + the enlarged QR `stopPropagation`s so tapping it (to scan) doesn't dismiss; the backdrop + ✕ close it. (Build-verified; the demo has no uploaded QR so the block wasn't exercised live.) `voucher.js`.

### Sharing / comms
- [x] **[HIGH]** Share-to-guest opened a generic OS share sheet, not the guest's chat. ✓ FIXED + verified live — both the "Send to guest" (BookingConfirmed) and "Share booking" (BookingDetail) buttons now open `wa.me/<guest>?text=<summary>` synchronously, landing in the guest's WhatsApp chat. `navigator.share` can't target a recipient on any platform, so it's gone; the voucher file stays available via "Download voucher". _Verified: clicking both buttons opened `https://wa.me/919810021?text=Hi Aanya Sharma…`._ `share.js`, `BookingConfirmed.jsx`, `BookingDetail.jsx`.
- [x] **[MEDIUM]** Cancelling the share sheet returned `true`. ✓ MOOT — the `shareBookingWithVoucher` Web-Share path was removed entirely (wa.me is primary), so there's no AbortError-as-success path left.
- [x] **[MEDIUM]** BookingConfirmed fired a deferred second `window.open` (popup-blocked on mobile). ✓ FIXED — single synchronous `window.open(waUrl)` on tap.
- [x] **[MEDIUM]** Dashboard arrival/reminder WhatsApp messages. ✓ FIXED — number-accuracy (Batch 1) + now fully bilingual (Batch 6): the pre-arrival directions message + custom-reminder message + "our property" fallback all switch to Hindi in Hindi mode. `Dashboard.jsx`.
- [x] **[MEDIUM]** BookingConfirmed showed no send button AND no hint when the phone was junk-but-not-empty. ✓ FIXED — the "add a phone" hint now shows whenever there's no sendable number (`!waUrl`), not only when the phone is exactly empty. `BookingConfirmed.jsx`.
- [x] **[LOW]** Per-booking "WhatsApp" contact button opened an empty chat. ✓ FIXED + verified live — it now opens with the booking summary pre-filled (`bookingShareWaUrl`). `BookingDetail.jsx`.
- [x] **[LOW]** Share/voucher language used fragile `t('home')==='होम'`. ✓ FIXED — BookingDetail already receives a `lang` prop; the hack is gone. `BookingDetail.jsx`.
- [~] **[DEFERRED]** Saved-extras editor strings English-only in Hindi mode. Part of a larger gap: the Settings property-config sheet is pervasively English (per CLAUDE.md M-10 the per-field config i18n was deliberately deferred). Translating only the saved-extras sub-section would be inconsistent with its accordion + the rest of Settings → deferred to a dedicated Settings i18n pass (flag for the fresh audit). `Settings.jsx`.

### Voice
- [x] **[HIGH]** Dictation appended each phrase 2–3×. ✓ FIXED — `useSpeech` now tracks the highest final-result index already emitted PER recognizer instance, so a browser re-reporting finalized results (resultIndex stuck at 0) emits each phrase exactly once. (Logic + build verified; the preview has no mic for a live speech test.) `useSpeech.js`.
- [x] **[MEDIUM]** Recognizer hardcoded `en-IN`. ✓ FIXED — `VoiceBookingSheet` passes `hi-IN` when the app is in Hindi. `VoiceBookingSheet.jsx`.
- [x] **[MEDIUM]** Voice prefilled demo rooms/rates before setup. ✓ FIXED via Batch 1 — `effectiveRoomTypes()` returns `[]` for an unconfigured property + the voice flow routes through `go('new')` → the setup gate, so no demo rooms leak. `parseBookingCommand.js`.
- [~] **[MEDIUM]** Voice "2000 advance" → `payAmount:'custom'`. ✓ MITIGATED by Batch 1+2 — voice produces a *prefill* the hotelier confirms on Step 4, where the default is "Not yet" and any recorded payment now requires an amount + method (the Step-4 guard). The spoken advance pre-selects Custom for review, not silent paid.
- [x] **[LOW]** Stale interim lingered across auto-restart. ✓ FIXED — `onend` clears interim before relaunch. `useSpeech.js`.
- [~] **[LOW]** Mic double-tap/in-flight + "Review" busy leak. Largely covered: the mic button is `disabled` while busy and toggles stop while listening; the busy flag only "leaks" on the success path where the sheet unmounts + resets on reopen. Low value; left as-is.
- [x] **[LOW]** Stale `no_anthropic` comment. ✓ FIXED → `no_ai` (matches the server). `parseBookingCommand.js`.

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
- **2026-06-27 — Batch 2 COMPLETE: booking & money correctness shipped + verified live.**
  - Extras model (#5): removed the universal `EXTRAS_DEFAULT` prepend — the picker shows only the property's own saved/added extras + "+ Add custom"; demo seeds its pool with the camp extras; `extrasBreakdownFor` keeps EXTRAS_DEFAULT in its catalog for old bookings. _Verified live: demo shows seeded deletable extras; a real fresh property shows an empty list._
  - Custom-extra parse: allow explicit ₹0, reject blank/NaN. _Verified live: empty price no-ops, ₹0 adds, `type=number` blocks junk._
  - qty→0 removes the key (no stray `{id:0}`). Meal-plan delta floored at `-roomsSubtotal`.
  - Fresh-property meal seed: `migrateProperty` now tests the SAVED `p.mealPlans` (not `out`, which is always demo-seeded via the `{...DEFAULT_PROPERTY, ...p}` spread — the original check was dead) → seeds clean EP-only ₹0; demo keeps its prices. _Verified live: injected fresh property → only EP shown, no demo CP/MAP prices._ (Caught via live verify — first attempt checked the wrong variable.)
  - Step-4 confirm guard: `paymentValid` requires `payCustom>0` + a method when recording a payment. _Verified live: Custom ₹0 / amount-without-method disable Confirm; method enables it._
  - **Verified NOT bugs (no change):** GST slab (NewBooking's `ROOM_TYPES` is a LOCAL `effectiveRoomTypes(property)`, taxes correctly); half-split (display + onCreate both `Math.round(total/2)`).
  - Files: `src/data.js` (none — EXTRAS_DEFAULT kept), `src/screens/NewBooking.jsx`, `src/App.jsx`, plus tracker.
- **2026-06-27 — Batch 3 COMPLETE: phone & guest data shipped + verified live.**
  - Per-country phone `len` on COUNTRIES; mobile field digit-only + maxLength cap + "{n}-digit" hint; `guestValid` requires exact length; Settings contact phone strips letters. _Verified: letters stripped + capped at 10; 8 digits disables Continue; country-switch re-clamps 10→8._
  - Repeat-guest: phone match needs ≥7 full-suffix digits (was last-5); "Use these details" now carries email. _Verified: name-match banner still appears._
  - Legacy "2A 1C" children-band = won't-fix (ambiguous — no age stored).
  - Files: `src/data.js`, `src/components/Field.jsx`, `src/screens/NewBooking.jsx`, `src/screens/Settings.jsx`, `src/i18n.js`.
- **2026-06-27 — Batch 4 COMPLETE: past-date & inventory integrity shipped + verified live.**
  - Rates: past cells faded + `not-allowed`, selection blocked at `onCellDown`/`onCellEnter`, From→To range + Copy-from clamped to today, extra-zero typo guard gets an absolute ₹50k ceiling when base 0. _Verified: past cell won't select, future does._
  - Diary: `openDateEditor` + `openQuickCreate` guard idx<0; drag clamp floors at today; rooms-open input clamps 0..units; past headers + empty cells faded/non-tappable; **close-out override confirm** on any available-room change. _Verified: editor confirm fired on Deluxe 8→5._
  - Files: `src/screens/Rates.jsx`, `src/screens/Diary.jsx`, `src/i18n.js`.
- **2026-06-27 — Batch 5 COMPLETE: share reliability + voice shipped + verified.**
  - Share: removed the `navigator.share` voucher-file path; "Send to guest" / "Share booking" / the contact WhatsApp button all open `wa.me/<guest>?text=<summary>` synchronously (guest's chat, no popup block); the no-phone hint shows whenever there's no sendable number; BookingDetail uses its `lang` prop (dropped the `t('home')==='होम'` hack); removed the now-dead share-hint snackbar. _Verified live: both share buttons opened `wa.me/919810021?text=Hi Aanya Sharma…`._
  - Voice: per-instance final-index dedupe in `useSpeech` (stops 2–3× phrase repeat); Hindi recognizer locale (`hi-IN`) when the app is Hindi; clear stale interim on auto-restart; `no_anthropic`→`no_ai` comment. (Build + logic verified; no mic in preview.)
  - Files: `src/utils/share.js`, `src/screens/BookingConfirmed.jsx`, `src/screens/BookingDetail.jsx`, `src/voice/useSpeech.js`, `src/components/VoiceBookingSheet.jsx`, `src/voice/parseBookingCommand.js`.
- **2026-06-27 — Batch 6 COMPLETE: voucher copy & i18n polish shipped + verified.**
  - Voucher: cancellation block only when `ratePlansActive(property)` + a defined cancellation (no more fabricated 48h default); `parseGuests` sums all tokens + min-1-adult; terms WhatsApp clause conditional on a phone; QR lightbox gains an ✕ + the enlarged QR stops self-closing. _Verified live via captured voucher HTML: no cancellation block, real "2 Adults", terms phone present._
  - i18n: Dashboard pre-arrival + reminder WhatsApp messages bilingual; move-booking `moveDesc` honest (no auto-voucher promise), en+hi.
  - Deferred: a full Settings property-sheet i18n pass (saved-extras editor + siblings) — too inconsistent to do piecemeal; flagged for the fresh audit.
  - Files: `src/utils/voucher.js`, `src/screens/Dashboard.jsx`, `src/i18n.js`.
- **🎉 ALL 6 FIX BATCHES COMPLETE.** Branch `fix/audit-batch1-blockers` (6 commits) — one PR, pending owner merge. Owner queued "if done, start a FRESH complete hotelier audit to find what the previous audits missed." → NEXT: run a brand-new end-to-end hotelier journey audit (fresh eyes, the new post-fix surfaces incl. the setup gate / wa.me share / past-date locks themselves), plus the deferred Settings i18n. Capture findings + a new fix-order, then continue fixing.

- **2026-06-27 — Owner request: require each child's age on every booking path.** The New Booking form already forces children into explicit age bands (Free <5y / 5–11y / 12+), so a reception booking always records the age. The public website widget showed a single "Children (total)" stepper when the property didn't charge differently by age — letting a guest book children with no age. Now the widget ALWAYS collects the three age bands (age-only labels when no age-based charge applies; rate labels when it does). _Verified live: widget guest step shows "Children under 5 / 5–11 / 12+" + no single total stepper._ `PublicBookingWidget.jsx`.

- **2026-06-27 — Owner corrections to Batch 4 + 5.**
  - Voice: REVERTED the recognizer-locale tie to app language (Batch 5 broke spoken English in Hindi mode). It's back to `en-IN` always — the tolerant choice for the mixed English+Hindi/Hinglish Indian hoteliers speak (the AI parser is hardened for both). The per-instance dedupe fix stays. `VoiceBookingSheet.jsx`.
  - Past-date bookings: reception CAN now create a back-dated booking from the Diary again (Batch 4 had blocked it). Tapping a past empty cell asks "This date has already passed. Create a back-dated booking anyway?" then opens New Booking with the past date prefilled; future/today cells skip the confirm. Past-date RATE/INVENTORY editing stays locked. _Verified live: tapped a past cell → confirm → New Booking seeded with 2026-06-22._ `Diary.jsx`, `i18n.js`.

_Append shipped batches here (commit hash + what it fixed + how verified)._

---

## ROUND 2 — fresh hotelier audit (2026-06-27)

11 parallel auditors + adversarial verify pass. 48 raw → 20 verified non-low + 22 lows. The lows were almost all the verifiers CONFIRMING Batches 1–6 hold up (setup gate, advance-vs-paid, extras, phone, past-dates, share, voucher, child-bands all verified correct). Verified NEW findings below, grouped + proposed fix order. None shipped yet.

### Money / cross-surface math (fix first)
- [x] **[HIGH]** `totalGuests` excluded `childrenFree` + `childrenFull` → meals/extras undercounted. ✓ FIXED + verified live (as part of the child-bands Stage 1) — guest counts now sum ALL child bands via `childTotalForItem`/`bookingGuestCount`. _Verified: 2A + 2 full-rate children now reads "2A 2C" (was "0C")._ `data.js`, `NewBooking.jsx`.
- [ ] **[HIGH]** Meal-plan floor (`Math.max(-roomsSubtotal, …)`, my Batch-2 change) is applied in NewBooking ONLY; `mealCostFor()` (folio + voucher + widget) is un-floored → the SAME booking totals differ across surfaces on a big meal downgrade. `data.js:765-777` vs `NewBooking.jsx:1441`. Fix: add optional `roomsSubtotal` param to `mealCostFor` + floor; pass it from folio/voucher/widget. (Regression I introduced.)
- [x] **[HIGH]** Dashboard "Daily income" card conflated average tariff with cash collected. ✓ FIXED + verified live (owner's design) — split into TWO cards: **"Today's income"** (accrual = per-night value of tonight's stays) + **"Collected today"** (cash basis, split by method Cash/UPI/Card…). They now show distinct numbers (demo: ₹4,500 income vs ₹9,000 collected). `Dashboard.jsx`.
- [x] **[HIGH]** Credit notes handled 3 ways in Dashboard. ✓ FIXED — credit = 0 for collected + monthRevenue (it reduces what's owed, not cash), matching collectedOn + the day-close skip. `Dashboard.jsx`.
- [ ] **[MED/HIGH]** Occupancy CSV export lacks `startIdx`/`nights` `|| 0`/`|| 1` guards that the KPI cards have → CSV silently drops bookings the cards count. `Reports.jsx:888` vs `:586`.

### Date / logic
- [ ] **[HIGH]** Diary sticky header shows `ANCHOR.getFullYear()` → wrong year when scrolled to a different year (e.g. "JAN 2026" while viewing Jan 2025). `Diary.jsx:910`. Fix: year from `viewDays[0].iso`.
- [ ] **[MED]** Rates "Copy from another type" day-count label uses unclamped range but the copy clamps past dates to today → label over-counts. `Rates.jsx:1304-1305`. (Regression from my Batch-4 clamp.) Fix: clamp the label count too.

### Settings / validation
- [ ] **[HIGH]** Disabling ALL meal plans → default falls to 'ep' but if EP is also disabled the booking price baseline is `undefined`→0, breaking the booking flow. `Settings.jsx:1980-1989` + `App.jsx:288`. Fix: block disabling the last enabled plan.
- [ ] **[HIGH]** Public widget phone input has NO per-country validation (digit-only / maxLength / exact-len) — Batch-3 fixed reception but not the widget; `guestValid` accepts ≥7 digits. `PublicBookingWidget.jsx:1024,391`. Fix: mirror the NewBooking phone handling (IN = 10).
- [ ] **[MED]** GST per-category manual override silently reverts to auto when the entered value equals the current slab (`gstRate: n === slab.rate ? null : n`); later base-rate changes then mis-tax. `Settings.jsx:1176`. Fix: store the override; only null on explicit Reset.
- [ ] **[MED]** Empty room-category name saves with no validation → voucher + Diary show "—". `Settings.jsx:1140`. Fix: require a name on save (or auto-fill).
- [ ] **[MED]** Child free-age can be set ≥ half-age (no cross-field validation) → impossible "12–11y" band in the preview. `Settings.jsx:2826,2839`. Fix: enforce free < half.
- [ ] **[MED]** Team-alert (arrivalsRecipients) phone field has no validation → malformed numbers break the WhatsApp alert. `Settings.jsx:2774`. Fix: light digit/+ filter.

### Cross-cutting
- [ ] **[HIGH]** Settings is pervasively English in Hindi mode + the "per night/per stay/per guest" unit strings are hardcoded (and flow into the widget + voucher). `Settings.jsx` (many) + `PublicBookingWidget.jsx:832,1056`. → the deferred Settings/units i18n pass.
- [ ] **[MED]** Client action handlers (`addPayment`/`setStatus`/`setBookingGst`/`issueInvoice`/`voidInvoice`) lack defense-in-depth `can()` checks (UI buttons are gated; DB RLS enforces server-side, so low real risk). `App.jsx`. Fix: add guard lines.

### Minor (lows worth a sweep later)
Invoice range filter keeps unparseable dates in range CSV (`Reports.jsx:449`); duplicate saved-extra names allowed; custom meal-plan label saved but never shown to guests; QR "Uploaded" hint optimistic before async save; season-overlap warning only after both dates; extra-guest ₹0 vs "not set" ambiguity.

**Proposed fix order:** R2-1 money/cross-surface (the 5 HIGH money items) → R2-2 date/logic + quick validation (Diary year, copy count, empty name, team phone, all-meal-plans-disabled) → R2-3 widget phone + GST override + child-age bounds → R2-4 the Settings/units i18n pass. RBAC handler guards + lows folded in where they fit.

---

## ROUND 2 — FIXES SHIPPED (2026-06-27)

Re-pinned every open finding in current code via a 12-agent workflow (line numbers
had drifted across the child-bands work), then fixed in 5 reviewable batches on
`fix/audit-batch1-blockers`. All builds pass; behavioural fixes verified live.

- **Batch A `ab4fa53`** — R2-meal-floor (mealCostFor gains an optional roomsSubtotal
  floor + new roomsSubtotalFor helper; folio + voucher + widget now floor a meal
  downgrade the same way NewBooking does) · R2-occ-csv (occupancy CSV startIdx/nights
  guard). _Verified: demo folio renders clean, no NaN._
- **Batch B `217d9d1`** — R2-diary-year (header year from viewDays[0].iso, not ANCHOR)
  · R2-copy-count (copy-from label matches the clamped count) · SearchOverlay rows
  keyed by id+index (demo seed has a duplicate BK-2854). _Verified: header reads the
  visible column's year; dup-key warning gone._
- **Batch C `5210ea3`** — R2-all-meals-off (block disabling the last enabled meal
  plan) · R2-gst-override (typed value = slab no longer reverts to auto; only Reset
  clears) · R2-empty-catname (block blank category name on save) · R2-child-age-bounds
  (band names + ascending ages required on save; legacy free<half clamp) · R2-team-phone
  (recipient phone filter). _Verified live: cleared a category name → save BLOCKED
  (nothing persisted)._
- **Batch D `592dc65`** — R2-widget-phone (digit-only + maxLength 10 + exact-10
  validation + hint, India-only widget). _Verified live: junk → "9876543210"; Confirm
  enabled at 10, disabled at 9._
- **Batch E `3683cdf`** — R2-rbac-guards (defense-in-depth can() guards on 14 action
  handlers; onCreate left to its route gate; auto-release ticker unaffected).
  _Verified live: extendHold ran in demo (can() wildcard) — hold extended, no errors._

**Lows — verified, no code change:**
- Invoice range CSV "keeps unparseable dates" is INTENTIONAL (documented at
  Reports.jsx:446 — the CA register must stay gap-free), NOT a bug.
- Custom meal-plan label "not shown to guest" is already handled — the widget
  (effectiveMealPlans → mp.code/mp.label) AND the voucher both display it.
- Remaining (duplicate saved-extra names, optimistic QR "Uploaded" hint, season-overlap
  warning timing, extra-guest ₹0-vs-not-set) are cosmetic; left as-is to avoid churn.

**Still DEFERRED (owner's call):** the full Settings/units i18n pass (R2 cross-cutting)
— pervasive English in Hindi mode + hardcoded "per night/stay/guest" unit strings.
Too large + inconsistent to do piecemeal; per CLAUDE.md M-10 it's deliberately deferred.

---

## ROUND 3 — inconsistency audit (2026-06-27)

11-dimension multi-agent sweep focused on CROSS-SURFACE INCONSISTENCIES (the same
concept computed/shown/validated differently in two places) + adversarial verify.
49 raw → 27 "confirmed", 5 intentional, 17 not-real. I then RE-GRADED the confirmed
list myself — the Haiku verifiers overstated two clusters (see "Downgraded" below).

### Worth fixing — real + safe (deduped)
- **[HIGH] Diary weekend tint highlights the WRONG days.** Diary `generateDays`
  (Diary.jsx:477) + `DAYS` (data.js:115) hardcode Fri+Sat (`getDay()===5||6`), but
  `ratePerNight` (data.js:480) uses `property.weekendRules.weekendDays` (default
  **[0,6] = Sun+Sat**). So even at defaults the Diary tints Fri/Sat while the uplift
  applies Sun/Sat. Rates.jsx already reads weekendRules correctly. _Verified the
  default mismatch in code._ Fix: Diary should derive its weekend set from
  property.weekendRules.
- **[HIGH] holdHours default mismatch.** NewBooking seeds holdHours: 4 (NewBooking.jsx
  ~1266/1300) while the widget + Settings use `accountant.holdHours ?? 12`
  (PublicBookingWidget.jsx ~417, Settings ~2660). A hotelier who sets a 12h policy
  still gets 4h holds on staff-created bookings. Fix: NewBooking seed `?? 4` from the
  property setting.
- **[HIGH] Dashboard occupancy counts BOOKINGS, not rooms.** Dashboard.jsx ~452
  uses `.filter().length`; Diary (pills) + Reports (roomsHeld) count per room. A
  2-room booking shows as 1 occupied on the Dashboard card but 2 in Diary/Reports.
  Fix: `.reduce((s,b)=>s+roomsHeld(b),0)`.
- **[MED] Reports revenue-by-type weights legacy bookings by b.total.** Reports.jsx
  ~616 fallback for a booking with no roomItems uses `rate: b.total` (room + meals +
  extras + GST), inflating that room type's share. Fix: weight by
  `roomsSubtotalFor(b, property)`.
- **[MED] Diary is the one primary screen still leaking English in Hindi mode.**
  "units" (Diary.jsx:362), "k due"/"paid" pill text (273-274), "IN"/"OUT"/"cancelled"
  badges (121/125/278) — all hardcoded; BookingPill never receives `t`. Plus Rates.jsx
  ~703 hardcodes the Sun..Sat day abbreviations. (Distinct from the deferred SETTINGS
  i18n — the Diary is otherwise bilingual, so this reads as broken.)
- **[LOW, trivial cleanups]** Diary tentative pill colour 60% vs STATUS 58% lightness
  (Diary.jsx:104); `defaultMealPlanId` inline `||'ep'` duplicated at 4 call sites
  instead of the helper; `baseCapacityAdults(property) || 2` dead `||2` in
  cloud/aiosell.js:252; unused childAge params on StepDates (NewBooking.jsx:105/1651);
  widget meal delta `Math.round` before floor (PublicBookingWidget.jsx:281) vs un-rounded
  mealCostFor (±1 only on fractional meal prices); Dashboard greeting uses live clock
  vs Diary's ANCHOR (diverges only if the app is left open past midnight).

### Downgraded — verifiers overstated (NOT the high they claimed)
- **roomsSubtotalFor is "best-effort" (falls back to category.base, ignores
  weekend/season/single-occ).** Reported as "folio/voucher show a different room
  RATE." FALSE — the folio (BookingDetail.jsx:753) + voucher (voucher.js:267) derive
  the tariff line by SUBTRACTION from the stored total, so the displayed rate is always
  correct. roomsSubtotalFor only feeds the meal-downgrade FLOOR → impact is limited to
  the rare big-downgrade meal-split decomposition (total still correct). Real but MED,
  and the clean fix (recompute weekend/season/solo in roomsSubtotalFor) must NOT store
  the rate on roomItems (that re-introduces the edit double-apply bug CLAUDE.md warns of).
- **GST CGST/SGST % label "uses a decimal."** NOT real — `(tx.rate/2).toFixed(tx.rate%2?1:0)`
  correctly renders 2.5% / 9%. False positive.

### Needs an owner decision (judgment calls, not auto-fixed)
- **Guests "in-house" excludes `checkout` status.** A verifier called this a bug, but
  `checkout` = "Logged check-out" = the guest has DEPARTED, so excluding it from
  in-house is arguably CORRECT (Dashboard includes it only for payment-collection). Left
  as-is.
- **Guests repeat-guest groups by NAME; Dashboard repeat-chip groups by PHONE
  (repeatGuestKeys).** They can disagree (same name/diff phone, or vice-versa). Aligning
  to phone is cleaner but changes the Guests list bucketing — wants an explicit call.
- **extraGuestCostFor silently skips a roomItem whose category was DELETED** → folio/
  voucher drop that surcharge (total was stored with it). Real edge; the clean fix
  (store the surcharge as a booking field, or soft-delete categories) is a data-shape
  change — defer to a dedicated pass.
- **Public widget shows a blank Step 2 when no rooms are configured** (Rates + Dashboard
  show a prompt). Minor; the widget is only shared after setup.

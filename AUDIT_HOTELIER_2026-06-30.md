# AtithiBook — Final hotelier-end (UX) audit (2026-06-30)

Multi-agent journey audit from a **non-technical owner's** perspective: 12
journeys walked in parallel → skeptical verifier per finding (real AND not
already fixed in prior rounds) → synthesis. 66 agents, Opus 4.8, ~5.7M tokens.
53 candidates → **40 confirmed** → deduped to the list below (5 high, ~17
medium, ~13 low). None are code bugs (audited separately) or blockers. The
already-known Settings/units Hindi gap is respected as deferred — only flagged
where it newly lands on a daily screen or a paying guest.

Status legend: [ ] open · [x] fixed · [~] deferred/won't-fix

---

## HIGH — shows a guest or owner genuinely wrong/misleading info

- [ ] **H1 · WhatsApp payment message points to a QR that was never sent.** The ready-made "Send booking summary / reminder" text ends with *"scan the UPI QR we shared to pay"* — but a wa.me text can't attach an image, and the QR only lives inside the downloadable voucher. Fires even when no QR is set up. Guest scrolls, finds nothing, may not pay → lost hold. *Fix:* reword to "Reply here and we'll send you a UPI QR to pay ₹X"; when a QR exists, guide the owner to send the image/voucher first. (`src/utils/share.js`)
- [ ] **H2 · Public link says "pay the advance," then the QR demands the full amount.** Summary step: *"send the advance to lock the room."* After Confirm: *"Scan to pay ₹15,000"* (the whole total). No stated minimum advance. Guest over-pays or abandons — on the direct channel you most want to win. *Fix:* make the two agree; reword to "pay any advance to lock your room (or pay in full)" and/or an owner-set deposit. (`src/screens/PublicBookingWidget.jsx`)
- [ ] **H3 · Two different "earnings" totals on the Reports screen silently disagree.** Top card "Money earned" (by stay date) vs P&L "Income" (by collection date) — same month, two rupee totals, both read as "what I made." In Hindi both are labelled कमाई. Owner concludes "money is missing / app is buggy" and distrusts every number. *Fix:* relabel clearly ("Received for stays this month" vs "Cash collected this month") + a one-line hint each + distinct Hindi words. (`src/screens/Reports.jsx`, `src/i18n.js`)
- [ ] **H4 · A staff member shows as a raw database code, not their name/email.** Pending invite correctly shows the email; the moment they sign in the row becomes "Member · a1b2c3d4…". Can't tell which reception person is which — risky when assigning permissions or removing someone. *Fix:* stamp the invited email onto the member on join and display it (the widget already uses secure lookups like this). (`src/screens/Settings.jsx`, `src/cloud/team.js`)
- [ ] **H5 · "Send invite" sends nothing, and a slightly-wrong email fails silently.** Button implies a message is sent; it isn't (owner must share the link by hand). Staffer must sign in with the exact email typed — a typo → they get no access, no error, invite sits "pending" forever. *Fix:* rename to "Create invite"; on success show one-tap "Share on WhatsApp" pre-filling the link + the exact email; show "waiting for <email> to sign in" on the pending row. (`src/screens/Settings.jsx`)

---

## MEDIUM — confuses rather than misleads

- [ ] **M1 · "Default meal plan" silently decides add-vs-included** — a camp quoting all-inclusive ₹4,500 but leaving the room-only default has meal cost ADDED to every such bill. Buried in a collapsed section, no worked example. *Fix:* ask in plain terms ("When you quote ₹4,500, is that room-only or already includes meals?") with a live example; surface in first-run for camps. (`Settings.jsx`)
- [ ] **M2 · A credit note looks exactly like recording a payment** but quietly lowers the bill. Same amount box + method grid + green button, no explainer. *Fix:* mode explainer ("A credit note lowers what this guest owes by ₹X. No money is collected."), drop the method grid, live "New total ₹old → ₹new" preview. (`BookingDetail.jsx`)
- [ ] **M3 · "Refund" vs "Credit" are look-alike buttons** with nothing saying which touches real cash. *Fix:* one-line hint under each (Refund = "money returned"; Credit = "lower the bill, no cash"). (`BookingDetail.jsx`)
- [ ] **M4 · A 100%-full day is coloured RED** (occ>80 → danger). Best day reads as an alarm; erodes trust in the app's colour signals. *Fix:* higher occupancy = greener; reserve red for genuine overbooking (>100%). (`Diary.jsx`)
- [ ] **M5 · The Rates calendar shows a final rate but never explains why it differs from base.** No breakdown on a phone (no hover). Owner can't tell an intended weekend/season bump from an accidental override. *Fix:* on tapping a cell, spell it out ("Base ₹4,500 · Weekend +20% · Diwali +30% = ₹7,020"; "Custom price"). (`Rates.jsx`)
- [ ] **M6 · Weekend + season bumps quietly stack**, and a new season defaults to +20% on top of the +20% weekend (→ ~+56%). *Fix:* default a new season's multiplier to 0%; show a worked combined example in the Seasons card. (`Settings.jsx`)
- [ ] **M7 · Rates bulk power-tools + their "are you sure?" confirms stay English in Hindi mode** (Select-by-pattern, Block, Close-out, Undo). High-stakes actions in an all-English warning for a Hindi owner. *Fix:* translate these sheets + the destructive confirms. (`Rates.jsx`, `i18n.js`)
- [ ] **M8 · Check-in/out dates show in English on New Booking + Booking page** while the Dashboard + voucher show Hindi dates — date flips language within one journey. *Fix:* use the existing Hindi date helper on those labels. (`NewBooking.jsx`, `BookingDetail.jsx`)
- [ ] **M9 · The Dashboard "holds" card shows the full total as unpaid** even when a deposit was taken (Pending-payments card right above shows the real balance). *Fix:* show total − paid; label "paid — awaiting confirm" when nothing's left. (`Dashboard.jsx`)
- [ ] **M10 · Every hold reads "releases today"** regardless of the real release day (can be tomorrow+ or already lapsed). Scariest morning card, wrongly urgent. *Fix:* compute the real day ("releases tomorrow · 18:00", "expired — decide now"). (`Dashboard.jsx`)
- [ ] **M11 · "Channel mix this week" actually counts every booking ever** (no date filter). Misleads OTA-spend decisions. *Fix:* limit to the week, or drop the time claim ("Booking sources"). (`Dashboard.jsx`)
- [ ] **M12 · The voucher's "Scan to pay" QR shows the full amount even when PAID IN FULL** (same voucher already has a "PAID" stamp). Guest may pay twice. *Fix:* when nothing's owed, hide the QR / show "Paid in full — no payment due". (`voucher.js`)
- [ ] **M13 · The public link never tells the guest the hold can be released** if they don't act. They believe they're secured. *Fix:* one honest line ("If we don't hear from you, this hold may be released after 12h — message us to keep it"). (`PublicBookingWidget.jsx`)
- [ ] **M14 · Changing a staff Role sometimes changes access, sometimes does nothing** (no effect if permissions were hand-picked), with no feedback. Owner may leave a demoted staffer with more access than they think. *Fix:* on role change with custom perms, offer "reset to role defaults" or show "custom permissions in effect — role is just a label". (`Settings.jsx`)
- [ ] **M15 · Diary says "tap a cell to book" but tapping does nothing for restricted staff** — cells still look tappable → reads as a frozen calendar. *Fix:* remove the clickable look for restricted staff + honest subtitle ("View only — ask your owner to enable bookings"). (`Diary.jsx`)
- [ ] **M16 · New Booking Step 2 extra-guest breakdown omits custom child age bands** — a child in a custom band is billed in the total but has no line, so the itemised lines sum to less than Step 4's total (reads as a hidden charge). *Fix:* build the rows from the configured bands. (`NewBooking.jsx`)
- [ ] **M17 · Reports "billed" counts a booking's whole total even if one day falls in the range** (occupancy/rate beside it prorate correctly). On "Today"/short ranges "billed" balloons → looks like double-counting. *Fix:* use the in-range portion for "billed" too. (`Reports.jsx`)

---

## LOW — polish / edge

- [ ] **L1 · First-run Dashboard shows an empty "Arriving today" header + no "take your first booking" nudge.** Reads as broken. *Fix:* friendly empty-state card + a clear New Booking button (EN+HI), retire once a booking exists. (`Dashboard.jsx`)
- [ ] **L2 · The first-run setup guide is gone forever after one stray tap outside it**, with no reopen. *Fix:* soft-close on backdrop tap (only "done" on Skip/Finish) + a "Reopen setup guide" entry. (`Onboarding.jsx`)
- [ ] **L3 · GST/tax-invoice fields are locked to a paid plan the owner can't buy in-app** (the ₹1499 row opens a dead "contact support" popup). Owner enters GSTIN, assumes invoices are taxed, is wrong. *Fix:* note "Tax invoices are part of the Invoicing add-on" at the GST fields + a real support contact. (`Settings.jsx`)
- [ ] **L4 · Step 2 shows a meal-plan card even when the only option is free "Room only".** *Fix:* only show when 2+ plans exist (like the rate-plan card). (`NewBooking.jsx`)
- [ ] **L5 · The Diary occupancy strip shows only a % , not free-room count** (owners think in rooms). *Fix:* show "5 free" / "7/12" as the main figure. (`Diary.jsx`)
- [ ] **L6 · Rate plans (Flexible/Non-refundable) never appear on the Rates calendar** (Standard only). *Fix:* one-line note when rate plans are active. (`Rates.jsx`)
- [ ] **L7 · "Close-out" / "Set inventory" / "Block N units" overlap** — unclear which stops bookings; the soft "re-open" sits under red destructive buttons. *Fix:* consolidate or add "use this when…" lines + separate re-open. (`Rates.jsx`)
- [ ] **L8 · A booking's "Total" drops after a credit note with no label** distinguishing original vs adjusted. *Fix:* two labelled lines ("Original bill" / "Total after adjustment"). (`BookingDetail.jsx`)
- [ ] **L9 · "After expenses" shows ₹0 instead of a real loss** in a bad month (rows above then don't sum). *Fix:* allow negative in red (as the daily P&L card already does). (`Reports.jsx`)
- [ ] **L10 · BookingConfirmed says "send the summary now" even when there's no phone** (the send button is hidden). Self-contradicting. *Fix:* drop/reword the line when no phone. (`BookingConfirmed.jsx`)
- [ ] **L11 · Public link promises "We'll WhatsApp you" even when the property has no phone/email set.** *Fix:* match the promise to what's configured. (`PublicBookingWidget.jsx`)
- [ ] **L12 · Scattered English words on otherwise-Hindi daily screens** — Diary "OCCUPANCY" + month banner, "due" in Pending rows, "Direct"/"Website" channel names, expense-delete confirm. *Fix:* route through i18n (a Hindi word usually sits right beside them). (`Diary.jsx`, `Dashboard.jsx`, `Expenses.jsx`, `i18n.js`)
- [ ] **L13 · The public booking link is English-only** even for Hindi-first guests. Falls under the deferred Hindi/units work, but prioritise it since it lands on a paying guest. (`PublicBookingWidget.jsx`)

---

## Themes
1. **Money wording that misleads** (H1, H2, H3, M2, M3, M9, M10, M12, M17, L8, L9) — the biggest trust risk. Mostly copy/label/display fixes.
2. **Team/RBAC rough edges** (H4, H5, M14, M15) — matters once real staff exist.
3. **Rates/pricing legibility** (M1, M5, M6, L6, L7) — owners can't see how a price is built.
4. **Hindi leaks on daily/guest screens** (M7, M8, L12, L13) — distinct from the deferred Settings-sheet gap.
5. **First-run polish** (L1, L2, L4).

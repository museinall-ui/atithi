# AtithiBook — Hotelier-Perspective Audit (living tracker)

> **Started:** 2026-06-26 · **Resume code word:** `PADHARO`
> Say **PADHARO** in a fresh chat → the assistant reads this file and continues the audit/fixes from the first unchecked item, in small reviewable batches, verifying behavioural fixes in the browser preview before claiming done.

## Why this audit exists
Our prior multi-agent audits optimised for **code correctness** ("does the function do what it says") and missed **product common-sense** ("does this behave sensibly for a non-technical hotelier on a fresh account"). The owner found 13 obvious defects in ~5 minutes of real use. This audit is reframed: **walk the real user journeys as a first-time hotelier with zero data and judge what a real user would feel.**

## Methodology
Fresh account, no data, imaginary 12-room hotel "Lake Vista, Udaipur" (Standard / Deluxe / Suite). Trace the actual code path for each journey; report every user-facing defect (broken controls, missing validation, fabricated defaults before setup, wrong data sources, copy that lies, missing empty/error states, iOS-vs-Android, blocked zoom, impossible inputs). Verify behavioural items live in the preview before declaring fixed.

## Owner's 13 reported issues (CONFIRMED seeds)
1. Property setup (rooms/prices) not mandatory before using other features; booking shows default adult/child rates with no setup.
2. Delete (trash) button on saved/custom extras does nothing. *(screenshot: "Sleeping under the sky" custom extra — trash icon dead)*
3. Voice dictation types each phrase 2-3× and barely understands (regression after the continuous + auto-restart + onFinal-append change).
4. Rates & inventory still editable for PAST dates.
5. Extras are hardcoded presets for all properties — each hotel must set their OWN preset extras in Settings, shown at booking, plus a custom option.
6. "Collect payment" at booking time records it as already-PAID; instead the advance should show as amount DUE to confirm, with a SEPARATE option to log money already received.
7. Pinch-to-zoom does not work (rates/inventory text too small).
8. No way to block/close rooms from the Diary by tapping the date in the day-header row, with an "override the set inventory?" prompt on discrepancy.
9. Voucher does not reflect the cancellation policy.
10. Phone field accepts more digits than the selected country allows (India should cap at 10).
11. Payment QR is prompted right before sharing the voucher instead of being set once in Settings.
12. On iPhone, sharing the voucher after booking opens generic WhatsApp (manual contact pick) instead of the guest chat with the template — but the per-booking "contact guest" button works.
13. The hotelier contact number shown in the guest message ("reach us on…") is wrong.

## Journeys audited (11)
| # | Journey | Status |
|---|---|---|
| 1 | First-run & setup gating | ⏳ running |
| 2 | Settings (fields, QR, contact number) | ⏳ running |
| 3 | Extras (preset / custom / delete) | ⏳ running |
| 4 | New Booking 4-step (phone, payment, extras) | ⏳ running |
| 5 | Pricing math on a fresh property | ⏳ running |
| 6 | Rates & inventory (past dates, zoom) | ⏳ running |
| 7 | Diary (block from header, empty state) | ⏳ running |
| 8 | Voucher content (policy, QR, number) | ⏳ running |
| 9 | Sharing & comms (iOS WhatsApp, accuracy) | ⏳ running |
| 10 | Voice dictation (duplication) | ⏳ running |
| 11 | Cross-cutting (zoom meta, inputs, i18n, states) | ⏳ running |

## Findings
_Populated when the audit workflow returns. Each will be a checkbox with severity, file:line, what-the-hotelier-sees, expected, and a fix direction. Fixes happen in small reviewable batches; check off as shipped + verified._

## Fix log
_Append shipped batches here (commit hash + what it fixed + how verified)._

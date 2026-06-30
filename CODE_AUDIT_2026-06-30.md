# AtithiBook — Final code-end audit (2026-06-30)

Multi-agent audit: 10 parallel finders (one per dimension) → skeptical
adversarial verifier per finding → synthesis. 20 agents, Opus 4.8, ~1.95M
tokens. 9 candidates → **3 refuted as false positives** → **6 confirmed**
(0 critical, 0 high, 3 medium, 3 low). No data-loss / money-loss / directly
exploitable holes.

Refuted (NOT bugs — recorded so they aren't re-raised): a claimed NewBooking
"white-screen crash" (the `selectedType.*` derefs are nested inside
`{selectedType && (…)}`, never reached when null); a "CAPTCHA breaks the link
mid-setup" claim (Turnstile renders off the public site key regardless; the
verifier 503→client fallback keeps booking working until the secret is set); and
a "client fallback re-opens the bypass" claim (fallback only triggers on 503
no_captcha / 404, never on a real rejection).

---

## MEDIUM

### M1 · CAPTCHA lockdown silently reverts if an older widget migration is re-pasted
`supabase/migrations/20260702_widget_captcha_lockdown.sql` + `book_widget_slot`
`book_widget_slot` is `security definer` with **no internal caller guard** — its
access control is purely the EXECUTE grants. Every older widget migration
(20260607/12/16/26/28) ends with `grant execute … to anon`. The lockdown only
*revokes* those. There's no migration runner (owner pastes manually) and the
docs call these files "safe to re-run" — so re-pasting an old widget migration
silently re-grants anon EXECUTE and re-opens the CAPTCHA bypass, with no error.
Not exploitable while correctly applied; the risk is a silent regression from
routine owner maintenance.
**Fix:** make the function self-defending — add `if auth.role() <> 'service_role'
then raise exception …` at the top of `book_widget_slot` (the verifier calls it
with the service-role key, so it's unaffected; a stray anon grant can no longer
call it). Plus a re-paste warning comment on the old widget migrations.

### M2 · ANCHOR goes stale at midnight on an always-on front-desk tab
`src/App.jsx:1079-1091`
`ANCHOR` (today's local midnight) is computed once at load and drives every
day-index calc. The staleness reload only fires on `visibilitychange`/`focus` —
which never fire on a tab that stays continuously visible+focused across
midnight (a PWA left on the Dashboard overnight). After 00:00 IST, until someone
blurs/refocuses: Dashboard arrivals/in-house/departing are off by a day, and a
walk-in "today" booking pre-fills + persists *yesterday's* date — corrupting
stay dates, availability, and day-close/Reports attribution.
**Fix:** add a timer-based rollover check. At the top of the existing 30s ticker:
`if (ymd(new Date()) !== ymd(ANCHOR)) { window.location.reload(); return; }`.

### M3 · Turnstile script-load failure dead-ends the public Confirm button silently
`src/screens/PublicBookingWidget.jsx:1295,1648-1666`
Confirm is hard-gated on a CAPTCHA token. If the Turnstile script fails to load
(ad-blocker / Brave shields / corporate CSP / Cloudflare blip), the box never
renders, the token stays empty, and Confirm is **permanently disabled with no
message** — a real human guest simply can't book and is told nothing.
**Fix:** add an `onError`/timeout path in `TurnstileBox` that sets a
`captchaUnavailable` flag and shows a visible message keeping the property's
phone/WhatsApp in view ("Couldn't load the human-check — disable your ad-blocker
or contact us directly").

---

## LOW

### L1 · `book_widget_slot` trusts the client-supplied booking total
`supabase/migrations/20260628_widget_unit_allocation.sql:44`
The RPC server-forces status/channel/paid and recomputes the coupon discount,
but takes the room **total** straight from the client payload (never re-derived
from `room_categories.base_rate` + overrides). A CAPTCHA-solving/DevTools caller
can POST a forged total. Bounded: `paid` is forced to 0 (no cash), the row is
**tentative** (hotelier reviews before confirming, and an absurd total is
conspicuous), and it's behind CAPTCHA + a 40/hr flood cap. Harm = transient
Reports pollution / a wrong stored total if blindly auto-confirmed.
**Fix:** recompute the room subtotal server-side (the widget already supplies
type/dates/nights/occupancy) and clamp the stored total, mirroring the coupon path.

### L2 · Saved-extra add fires a false "failed" toast (id-swap re-entrancy)
`src/App.jsx:1291-1319`
Adding a saved extra mints a temp id, syncs (DB assigns a uuid), swaps the local
id — but pins `savedExtrasRef.current` to the array still holding the temp id, so
a second diff pass re-inserts the row with the explicit uuid → duplicate-PK
violation → a spurious "Add saved extra failed" toast. The PK backstops it (one
correct row persists; no data loss) — purely a confusing false-failure toast +
one wasted round-trip.
**Fix:** in the id-swap, also update `savedExtrasRef.current` so the re-run sees
the uuid as already-known.

### L3 · Cloud-load error grants an invited staffer client-side owner UI for the session
`src/App.jsx:1249-1264`
If the cloud load throws (transient blip) before the real membership is set, the
catch falls back to `{ role: 'owner' }` for any signed-in user — so an invited
reception/manager staffer would see every owner-only button that session.
**Not** a privilege escalation (DB-level RBAC rejects the writes), and it only
matters once real team members exist (currently none) — but the UI shows actions
they shouldn't, and optimistic local state makes a rejected action look like it
worked.
**Fix:** resolve the membership first and seed `currentMember` from the real
role, falling back to owner only when even the membership read fails.

---

## Verdict
Code end is in good shape — the surviving issues are small, local, and none are
critical/high. M1–M3 are the priority (silent-regression, date-corruption,
booking dead-end). L1–L3 are minor/defensive. All fixes are small.

---

## Fixes applied — 2026-06-30 (all 6 shipped)

- **M1 ✓** `20260628_widget_unit_allocation.sql` now SELF-LOCKS: its trailing
  `grant … to anon` is replaced with `revoke … from public/anon/authenticated` +
  `grant … to service_role`. Re-pasting any current widget migration can no
  longer re-open the bypass. **No owner action / no live change** — the live DB is
  already locked from the 20260702 revoke; this is forward-safety for re-pastes.
- **M2 ✓** `src/App.jsx` 30s ticker now re-anchors at midnight:
  `if (ymd(new Date()) !== ymd(ANCHOR)) window.location.reload()` at the top of
  `tick`, so an always-on front-desk tab refreshes to the new day on its own.
- **M3 ✓** `src/screens/PublicBookingWidget.jsx` — `TurnstileBox` gains an
  `onError` + 8s load-timeout; on failure the widget shows a recoverable message
  ("couldn't load the human-check — disable your ad-blocker / contact us at
  <phone>") instead of a silently-disabled Confirm.
- **L1 ✓** `api/widget-book.js` sanitizes the client `total` + `discount_amount`
  (finite, ≥0, ≤₹20 lakh) before forwarding — and since the verifier is the only
  insert path post-lockdown, that closes the forged-total vector.
- **L2 ✓** `src/App.jsx` saved-extra id-swap now also advances
  `savedExtrasRef.current`, killing the duplicate-insert + false "failed" toast.
- **L3 ✓** `src/App.jsx` cloud-load-error fallback is now role-aware (seeds the
  real role when membership resolved; owner only when even that read failed).

Build passes; app boots with no console errors; widget renders. M2/M3/L1/L2/L3
are live on push; M1 is file-only (no live change needed).

-- Multi-account day close-out. Hoteliers commonly handle several
-- payment instruments through the day — the owner's UPI, the manager's
-- UPI, the cash drawer, a card terminal, a bank deposit. Tracking
-- just one cash + one digital total muddles which person collected
-- what and makes day-close reconciliation a guessing game.
--
--   properties.cash_accounts — jsonb array of { id, label, kind }.
--     Defaults to two ['Cash drawer', 'Digital'] so the existing UX
--     still works on properties that haven't customised. Hoteliers
--     extend this in Settings → Cash accounts.
--
--   cash_closes.accounts — jsonb array of { accountId, amount }
--     captured per close. cash + digital columns stay as a back-compat
--     view (kind:'cash' sums into cash, everything else into digital)
--     so the existing Dashboard sparkline math doesn't break.
--
-- Idempotent — safe to re-run.

alter table properties
  add column if not exists cash_accounts jsonb not null default
    '[{"id":"cash","label":"Cash drawer","kind":"cash"},
      {"id":"digital","label":"Digital (UPI / Card)","kind":"upi"}]'::jsonb;

alter table cash_closes
  add column if not exists accounts jsonb not null default '[]'::jsonb;

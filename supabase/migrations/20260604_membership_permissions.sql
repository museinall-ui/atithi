-- Per-member permissions. Each membership (and each pending invite) carries
-- an explicit array of permission strings — so the hotelier can hand-pick
-- exactly what a team member can do, instead of inheriting a hardcoded
-- preset from the role. Role still exists (it's the quick-prefill template
-- + the hook RLS uses) but `permissions` is the source of truth the app UI
-- reads.
--
-- Empty array = "use the role's default permissions" (the app resolves
-- this client-side so existing rows behave as before).
--
-- Idempotent — safe to re-run.

alter table public.memberships
  add column if not exists permissions jsonb not null default '[]'::jsonb;

alter table public.pending_invites
  add column if not exists permissions jsonb not null default '[]'::jsonb;

-- Permission strings the app currently recognises (for reference; not
-- enforced at the DB level since the set will grow):
--   manage_bookings   — create / edit / cancel bookings
--   manage_payments   — record payments / refunds
--   manage_rates      — edit rate calendar + close-outs
--   manage_invoices   — issue / void invoices (Invoicing tier)
--   manage_expenses   — log expenses + close day
--   view_reports      — see revenue / occupancy / P&L
--   manage_settings   — edit property profile + integrations
--   manage_team       — invite / remove team members

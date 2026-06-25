-- Hold-expiry reminder de-dupe.
--
-- The api/hold-watch cron (triggered by the free GitHub Actions scheduler, or
-- a Vercel Cron) sends a phone push when an unpaid website / staff hold is
-- about to expire — or, in auto-release mode, when it has expired and the cron
-- releases it server-side (so inventory frees even with the app closed). This
-- column makes the reminder fire AT MOST ONCE per booking: the cron atomically
-- flips it from NULL to now() and only the winning call sends the push.
--
-- No RLS change: hold-watch runs with the service-role key (bypasses RLS) and
-- the column is never read by the browser.
--
-- Idempotent — safe to re-run.

alter table public.bookings
  add column if not exists hold_reminder_sent_at timestamptz;

-- Store the date a payment was actually collected (round-8 R8-14).
--
-- Reports' Daily P&L attributes income by the day the payment was COLLECTED
-- (payment.dateIso, set client-side from the hotelier's local date). But the
-- payments table only had created_at — the server insert timestamp, in UTC.
-- For IST (UTC+5:30) a payment recorded between 00:00 and 05:29 local has a
-- created_at *calendar date* of the previous day, so after any reload (which
-- rebuilds dateIso from created_at) that payment hopped to the wrong day in the
-- P&L + the Dashboard today/yesterday figures.
--
-- This adds a real collected_on DATE that the client fills from the local
-- collection date, so income stays on the correct day across reloads/devices.
--
-- Owner-side action: paste this whole file into the Supabase SQL Editor and
-- click Run. Idempotent (add column if not exists) — safe to re-run. Until it
-- runs, the app keeps working exactly as before (the client just can't persist
-- collected_on yet, so it falls back to created_at as today).

alter table payments add column if not exists collected_on date;

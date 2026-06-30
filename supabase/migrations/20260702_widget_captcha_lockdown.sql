-- ----------------------------------------------------------------------------
-- 20260702_widget_captcha_lockdown.sql
-- Close the direct-insert bypass so the Turnstile CAPTCHA can't be skipped.
--
-- The public booking widget talks straight to Supabase. With the CAPTCHA, the
-- normal flow is: guest solves Turnstile -> token -> api/widget-book.js verifies
-- it -> inserts with the SERVICE-ROLE key. But until this migration runs, a bot
-- could ignore the form entirely and call book_widget_slot (or INSERT into
-- bookings) directly with the public anon key, never touching the CAPTCHA.
--
-- This migration removes the anon role's ability to do that, leaving the
-- service-role verifier as the ONLY way to create a website booking.
--
-- ⚠️ PASTE THIS LAST — only AFTER both are true:
--    1. TURNSTILE_SECRET_KEY is set in Vercel and the site has been redeployed.
--    2. You have made a real test booking through the live public link and it
--       landed in your diary.
-- If you paste it before the verifier works, the public booking form will stop
-- creating bookings (the app's fallback direct-insert is exactly what this
-- revokes). The hotelier app + signed-in users are unaffected either way.
--
-- Idempotent. Revert block at the bottom re-opens the direct anon path.
-- ----------------------------------------------------------------------------

-- The verifier calls book_widget_slot with the service-role key — make sure that
-- role keeps execute even after we revoke it from everyone else.
grant execute on function public.book_widget_slot(jsonb) to service_role;

-- (1) Remove the ability to call the booking RPC directly from every role except
-- service_role. NOTE: Postgres grants EXECUTE to PUBLIC by default when a function
-- is (re)created, so revoking from `anon` alone is NOT enough — PUBLIC silently
-- lets anon back in. We must revoke from PUBLIC (and the explicit anon/authenticated
-- grants added in 20260628) so service_role is the only role left.
revoke execute on function public.book_widget_slot(jsonb) from public;
revoke execute on function public.book_widget_slot(jsonb) from anon;
revoke execute on function public.book_widget_slot(jsonb) from authenticated;

-- (2) Remove the anon INSERT policy on bookings (the pre-RPC fallback path the
-- widget used before book_widget_slot existed). Created in
-- 20260605_widget_anon_access.sql as "anon insert widget bookings".
drop policy if exists "anon insert widget bookings" on bookings;

-- Sanity check (optional): these should now return NO 'anon' row / NO policy.
--   select grantee, privilege_type from information_schema.routine_privileges
--     where routine_name = 'book_widget_slot';
--   select policyname from pg_policies
--     where tablename = 'bookings' and policyname = 'anon insert widget bookings';

-- ---- REVERT (paste this block to undo the lockdown) -------------------------
-- grant execute on function public.book_widget_slot(jsonb) to anon;
-- grant execute on function public.book_widget_slot(jsonb) to authenticated;
-- create policy "anon insert widget bookings" on bookings
--   for insert to anon
--   with check (status = 'tentative' and channel = 'website');
-- ----------------------------------------------------------------------------

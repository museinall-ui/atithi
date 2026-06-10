-- ----------------------------------------------------------------------------
-- 20260620_push_subscriptions.sql
-- Web Push notifications — store one row per device/browser that opted into
-- booking alerts. A Web Push "subscription" is an endpoint URL + two keys
-- (p256dh + auth) the browser hands us; the server signs a payload to that
-- endpoint with the VAPID private key and the user's phone buzzes.
--
-- Powers the "Booking alerts on this phone" toggle (Settings) + the
-- api/notify-booking serverless function that fires when a website booking
-- lands. Degrades gracefully: if this table isn't created, the toggle's save
-- fails quietly and the app behaves exactly as before (no alerts).
--
-- Idempotent. Paste into the Supabase SQL Editor.
-- ----------------------------------------------------------------------------

create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  endpoint    text not null,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now(),
  unique (endpoint)
);

alter table public.push_subscriptions enable row level security;

-- A signed-in user manages only their OWN subscriptions, and only for a
-- property they belong to. The server-side sender (api/notify-booking) uses the
-- Supabase SERVICE ROLE key, which bypasses RLS, to read a property's full
-- subscriber list when a booking arrives — so no broad read policy is exposed
-- to clients (push endpoints stay private + un-enumerable).
drop policy if exists push_sub_select on public.push_subscriptions;
create policy push_sub_select on public.push_subscriptions
  for select using (user_id = auth.uid() and has_property_access(property_id));

drop policy if exists push_sub_insert on public.push_subscriptions;
create policy push_sub_insert on public.push_subscriptions
  for insert with check (user_id = auth.uid() and has_property_access(property_id));

-- Update needed so re-subscribing on the same device (same endpoint) can
-- refresh the keys / re-point user_id via upsert. Still locked to the owner.
drop policy if exists push_sub_update on public.push_subscriptions;
create policy push_sub_update on public.push_subscriptions
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists push_sub_delete on public.push_subscriptions;
create policy push_sub_delete on public.push_subscriptions
  for delete using (user_id = auth.uid());

create index if not exists push_sub_property_idx on public.push_subscriptions(property_id);

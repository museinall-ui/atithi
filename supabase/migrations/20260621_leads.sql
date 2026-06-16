-- Demo lead capture: stores emails submitted via the landing page demo gate.
-- Anon INSERT so unauthenticated visitors can submit; auth-only SELECT so
-- only the signed-in owner can read the list.
create table if not exists leads (
  id         uuid        primary key default gen_random_uuid(),
  email      text        not null,
  source     text        not null default 'demo_gate',
  created_at timestamptz not null default now()
);

alter table leads enable row level security;

create policy "leads_insert_anon" on leads
  for insert to anon, authenticated
  with check (true);

create policy "leads_select_auth" on leads
  for select to authenticated
  using (true);

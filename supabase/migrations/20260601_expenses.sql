-- Daily expense tracker. Hoteliers asked for a ledger of property
-- running costs (groceries, salaries, utilities, maintenance, etc.)
-- alongside the existing income side. Combined with the Reports
-- screen this gives a true net-profit picture.
--
--   expenses
--     id            uuid primary key
--     property_id   uuid (RLS scope)
--     date          date  (the expense day — not necessarily when it
--                    was recorded; the hotelier might enter Friday's
--                    expense on Saturday morning)
--     amount        integer (rupees)
--     category      text  (groceries / salaries / utilities /
--                    maintenance / supplies / transport / marketing /
--                    other / custom-string)
--     note          text  (free-form, e.g. "vegetables for kitchen")
--     paid_via      text  (cash / upi / card / bank / unspecified)
--                    — optional, helps the day close-out tie out
--                    actual cash vs digital
--     created_by    uuid (auth user)
--     created_at    timestamptz default now()
--     updated_at    timestamptz default now()
--
-- RLS via has_property_access(property_id) — same pattern as every
-- other property-scoped table.

create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete cascade,
  date date not null,
  amount integer not null default 0,
  category text not null default 'other',
  note text default '',
  paid_via text default '',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists expenses_property_date_idx on expenses(property_id, date desc);

-- Reuse the existing set_updated_at trigger function from the initial
-- schema. Wrapped in DO so re-running on a partially-migrated DB is safe.
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'expenses_updated_at') then
    create trigger expenses_updated_at
      before update on expenses
      for each row execute function set_updated_at();
  end if;
end $$;

alter table expenses enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'expenses' and policyname = 'members all') then
    create policy "members all" on expenses
      for all
      using (has_property_access(property_id))
      with check (has_property_access(property_id));
  end if;
end $$;

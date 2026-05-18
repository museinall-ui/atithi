-- ============================================================
-- Atithi — initial schema
-- Phase 1: cloud DB + auth, multi-tenant from day one.
--
-- Tenant unit = `properties` (a hotel). Users are linked to
-- properties through `memberships` with a role. Every business
-- table carries `property_id`; Row Level Security uses the
-- `has_property_access()` helper to scope reads and writes.
-- ============================================================

-- ------------------------------------------------------------
-- Shared helpers
-- ------------------------------------------------------------
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end
$$;

-- ------------------------------------------------------------
-- properties  (one row per hotel)
-- ------------------------------------------------------------
create table properties (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- profile
  name text not null default '',
  type text default '',
  address text default '',
  city text default '',
  state text default '',
  pincode text default '',
  landmark text default '',
  map_url text default '',
  check_in text default '14:00',
  check_out text default '11:00',
  phone text default '',
  email text default '',
  website text default '',
  gstin text default '',

  -- accountant ({name, email, firm})
  accountant jsonb not null default '{"name":"","email":"","firm":""}'::jsonb,

  -- brand theme: either {hue:38} (preset) or {color:'#hex'} (custom)
  theme jsonb not null default '{"hue":38}'::jsonb,

  -- preferences
  plan text not null default 'engine' check (plan in ('engine','channels')),
  lang text not null default 'en' check (lang in ('en','hi')),

  -- amenities (property-wide)
  amenity_ids text[] not null default '{}',
  custom_amenities jsonb not null default '[]'::jsonb,
  rules text[] not null default '{}',

  -- invoice sequence counters, keyed by Indian FY string e.g. {"2627": 12}
  invoice_counters jsonb not null default '{}'::jsonb
);

create trigger properties_updated_at
  before update on properties
  for each row execute function set_updated_at();

-- ------------------------------------------------------------
-- memberships  (user <-> property, with role for Phase 6)
-- ------------------------------------------------------------
create type membership_role as enum ('owner','manager','reception');

create table memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  property_id uuid not null references properties(id) on delete cascade,
  role membership_role not null default 'owner',
  invited_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  unique (user_id, property_id)
);

create index memberships_user_idx on memberships(user_id);
create index memberships_property_idx on memberships(property_id);

-- The RLS workhorse: is the calling user a member of this property?
-- security definer so it can read memberships even with RLS on the table.
create or replace function has_property_access(p_property_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from memberships
    where property_id = p_property_id
      and user_id = auth.uid()
  );
$$;

-- ------------------------------------------------------------
-- room_categories  (replaces property.categories[])
-- ------------------------------------------------------------
create table room_categories (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete cascade,
  code text not null,                              -- 'dlx', 'lux', etc — stable id
  name text not null,
  units integer not null default 1 check (units > 0),
  base_rate integer not null default 0 check (base_rate >= 0),
  amenity_ids text[] not null default '{}',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (property_id, code)
);

create trigger room_categories_updated_at
  before update on room_categories
  for each row execute function set_updated_at();

create index room_categories_property_idx on room_categories(property_id);

-- ------------------------------------------------------------
-- bookings
--   * id is human-readable text (BK-2841) so it can appear on vouchers
--   * start_date is a real DATE; the day-index in UI code is a render concern
-- ------------------------------------------------------------
create type booking_status as enum
  ('confirmed','checkedin','checkout','tentative','cancelled');

create table bookings (
  id text primary key,                             -- 'BK-2841' (server-generated)
  property_id uuid not null references properties(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),

  -- room
  room_category_code text not null,
  unit_idx integer not null default 0 check (unit_idx >= 0),

  -- dates
  start_date date not null,
  nights integer not null default 1 check (nights > 0),

  -- guest
  guest_name text not null default '',
  phone text default '',
  country text default 'IN',
  form_c boolean not null default false,
  guests text default '',                          -- '2A 1C'
  vip boolean not null default false,
  notes text default '',

  -- lifecycle
  status booking_status not null default 'confirmed',
  channel text not null default 'direct',

  -- money
  total integer not null default 0,
  paid integer not null default 0,

  -- tax
  gst_applies boolean,                             -- null = use channel-based default
  guest_state text default '',                     -- for CGST/SGST vs IGST

  -- extras
  extras jsonb not null default '{}'::jsonb,
  custom_extras jsonb not null default '[]'::jsonb,
  extra_prices jsonb not null default '{}'::jsonb,
  room_items jsonb not null default '[]'::jsonb,

  -- hold/release
  release_ts bigint,                               -- epoch ms; null when not on hold
  release_at text,                                 -- display string e.g. '18:00'
  hold_hours integer,
  auto_released boolean not null default false,

  -- composite FK to room_categories so renaming a category cascades
  foreign key (property_id, room_category_code)
    references room_categories(property_id, code)
    on update cascade
);

create trigger bookings_updated_at
  before update on bookings
  for each row execute function set_updated_at();

create index bookings_property_idx on bookings(property_id);
create index bookings_start_date_idx on bookings(property_id, start_date);
create index bookings_status_idx on bookings(property_id, status);

-- Booking ID generator. Global sequence starting where the demo left off
-- (BK-2854). IDs only need to be unique + human-readable; per-property
-- counters add DDL complexity without much benefit.
create sequence if not exists bookings_global_seq start 2854;

create or replace function generate_booking_id()
returns trigger language plpgsql as $$
begin
  if new.id is null or new.id = '' then
    new.id := 'BK-' || nextval('bookings_global_seq');
  end if;
  return new;
end
$$;

create trigger bookings_generate_id
  before insert on bookings
  for each row execute function generate_booking_id();

-- ------------------------------------------------------------
-- payments  (ledger pulled out of bookings)
-- ------------------------------------------------------------
create type payment_kind as enum ('payment','refund','credit_note');

create table payments (
  id uuid primary key default gen_random_uuid(),
  booking_id text not null references bookings(id) on delete cascade,
  property_id uuid not null references properties(id) on delete cascade,
  kind payment_kind not null default 'payment',
  method text default '',                          -- 'cash' | 'upi' | 'card' | 'bank' | 'ota'
  amount integer not null,
  note text default '',
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create index payments_booking_idx on payments(booking_id);
create index payments_property_idx on payments(property_id, created_at);

-- ------------------------------------------------------------
-- invoices  (one row per issued tax invoice)
--   Unique (property_id, fy, seq) enforces gap-free numbering per FY.
--   `issue_invoice()` below is the only safe way to insert (atomic).
-- ------------------------------------------------------------
create table invoices (
  id uuid primary key default gen_random_uuid(),
  booking_id text not null references bookings(id) on delete cascade,
  property_id uuid not null references properties(id) on delete cascade,
  number text not null,                            -- 'INV-2627-001'
  fy text not null,                                -- '2627'
  seq integer not null,                            -- numeric within FY (for sort + uniqueness)
  amount integer not null,
  recipient jsonb not null default '{"name":"","gstin":"","address":""}'::jsonb,
  items jsonb,
  note text default '',
  voided boolean not null default false,
  issued_at timestamptz not null default now(),
  unique (property_id, fy, seq)
);

create index invoices_property_idx on invoices(property_id, issued_at);
create index invoices_booking_idx on invoices(booking_id);

-- Atomic, gap-free invoice issuance. Locks the property row while
-- bumping its per-FY counter, so two simultaneous "Issue invoice"
-- taps can never produce the same number or skip one.
create or replace function issue_invoice(
  p_booking_id text,
  p_fy text,
  p_amount integer,
  p_recipient jsonb,
  p_items jsonb default null,
  p_note text default ''
) returns invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  v_property_id uuid;
  v_seq integer;
  v_number text;
  v_row invoices;
begin
  select property_id into v_property_id
    from bookings where id = p_booking_id;

  if v_property_id is null then
    raise exception 'Booking % not found', p_booking_id;
  end if;

  if not has_property_access(v_property_id) then
    raise exception 'Not authorised for this booking';
  end if;

  update properties
     set invoice_counters = jsonb_set(
           invoice_counters,
           array[p_fy],
           to_jsonb(coalesce((invoice_counters->>p_fy)::int, 0) + 1),
           true
         )
   where id = v_property_id
   returning (invoice_counters->>p_fy)::int into v_seq;

  v_number := 'INV-' || p_fy || '-' || lpad(v_seq::text, 3, '0');

  insert into invoices (
    booking_id, property_id, number, fy, seq,
    amount, recipient, items, note
  ) values (
    p_booking_id, v_property_id, v_number, p_fy, v_seq,
    p_amount, p_recipient, p_items, p_note
  ) returning * into v_row;

  return v_row;
end
$$;

-- ------------------------------------------------------------
-- rate_overrides  (per-day rate / close-out per category)
-- ------------------------------------------------------------
create table rate_overrides (
  property_id uuid not null references properties(id) on delete cascade,
  room_category_code text not null,
  date date not null,
  rate integer,                                    -- null = no rate override
  closed_out boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (property_id, room_category_code, date),
  foreign key (property_id, room_category_code)
    references room_categories(property_id, code)
    on update cascade on delete cascade
);

create trigger rate_overrides_updated_at
  before update on rate_overrides
  for each row execute function set_updated_at();

-- ------------------------------------------------------------
-- saved_custom_extras  (reusable add-on pool)
-- ------------------------------------------------------------
create table saved_custom_extras (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete cascade,
  name text not null,
  price integer not null default 0,
  unit text default 'per stay',
  created_at timestamptz not null default now()
);

create index saved_custom_extras_property_idx on saved_custom_extras(property_id);

-- ------------------------------------------------------------
-- cash_closes  (end-of-day reconciliation)
-- ------------------------------------------------------------
create table cash_closes (
  property_id uuid not null references properties(id) on delete cascade,
  date date not null,
  cash integer not null default 0,
  digital integer not null default 0,
  note text default '',
  closed_at timestamptz not null default now(),
  closed_by uuid references auth.users(id),
  primary key (property_id, date)
);

-- ------------------------------------------------------------
-- audit_log  (who did what — useful once staff are added)
-- ------------------------------------------------------------
create table audit_log (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete cascade,
  actor_id uuid references auth.users(id),
  action text not null,                            -- 'booking.create', 'payment.add', etc.
  target_type text,                                -- 'booking', 'invoice', 'payment'
  target_id text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_property_idx on audit_log(property_id, created_at desc);

-- ============================================================
-- Row Level Security
-- Every table is locked down by default; policies open up access
-- only to authenticated members of the row's property.
-- ============================================================
alter table properties           enable row level security;
alter table memberships          enable row level security;
alter table room_categories      enable row level security;
alter table bookings             enable row level security;
alter table payments             enable row level security;
alter table invoices             enable row level security;
alter table rate_overrides       enable row level security;
alter table saved_custom_extras  enable row level security;
alter table cash_closes          enable row level security;
alter table audit_log            enable row level security;

-- properties: members read + update; any authenticated user may
-- create one (and immediately claim it via a membership insert).
create policy "properties read"   on properties for select using (has_property_access(id));
create policy "properties update" on properties for update using (has_property_access(id));
create policy "properties insert" on properties for insert to authenticated with check (true);

-- memberships:
--   * users see their own memberships (so the app can list "my hotels")
--   * users see fellow members of their properties
--   * users may insert a membership for themselves (initial owner claim)
--   * only owners may update or delete memberships (Phase 6)
create policy "memberships read self or peer" on memberships for select
  using (user_id = auth.uid() or has_property_access(property_id));

create policy "memberships self-insert" on memberships for insert to authenticated
  with check (user_id = auth.uid());

create policy "memberships owner update" on memberships for update
  using (
    exists (
      select 1 from memberships m
      where m.property_id = memberships.property_id
        and m.user_id = auth.uid()
        and m.role = 'owner'
    )
  );

create policy "memberships owner delete" on memberships for delete
  using (
    exists (
      select 1 from memberships m
      where m.property_id = memberships.property_id
        and m.user_id = auth.uid()
        and m.role = 'owner'
    )
  );

-- everything else: members of the property can do anything.
-- Role-based restrictions (e.g. reception can't void invoices)
-- come in Phase 6 by tightening these policies.
create policy "members all" on room_categories      for all using (has_property_access(property_id)) with check (has_property_access(property_id));
create policy "members all" on bookings             for all using (has_property_access(property_id)) with check (has_property_access(property_id));
create policy "members all" on payments             for all using (has_property_access(property_id)) with check (has_property_access(property_id));
create policy "members all" on invoices             for all using (has_property_access(property_id)) with check (has_property_access(property_id));
create policy "members all" on rate_overrides       for all using (has_property_access(property_id)) with check (has_property_access(property_id));
create policy "members all" on saved_custom_extras  for all using (has_property_access(property_id)) with check (has_property_access(property_id));
create policy "members all" on cash_closes          for all using (has_property_access(property_id)) with check (has_property_access(property_id));

create policy "audit read"  on audit_log for select using (has_property_access(property_id));
create policy "audit write" on audit_log for insert to authenticated with check (has_property_access(property_id));

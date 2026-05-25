-- Team profiles + invites. The memberships table from the initial
-- schema already supports owner / manager / reception roles + an
-- accepted_at timestamp. What's been missing is the invite flow:
-- the owner enters a teammate's email + role; the teammate signs
-- in via magic-link; their first sign-in auto-creates a membership
-- on the right property.
--
-- We use a separate `pending_invites` table rather than allowing
-- null user_id on memberships, because:
--   1. memberships.user_id is NOT NULL in the initial schema and
--      RLS is keyed off it
--   2. an invite has a lifecycle (created → accepted → deleted) that
--      doesn't map cleanly onto memberships
--   3. revoking an unused invite shouldn't leave a tombstone row
--
--   pending_invites
--     id            uuid primary key
--     email         citext  (case-insensitive match on sign-in)
--     property_id   uuid
--     role          membership_role
--     invited_by    uuid (the existing owner)
--     invited_at    timestamptz
--     token         text   (random; included in the invite link the
--                    owner can copy + paste into a WhatsApp message)
--     expires_at    timestamptz (default 14 days)
--
-- The "accept on next sign-in" logic lives in App.jsx — it queries
-- pending_invites by the signed-in user's email, creates memberships
-- for each match, then deletes the invite rows. Standard atomic flow.

create extension if not exists citext;

create table if not exists pending_invites (
  id uuid primary key default gen_random_uuid(),
  email citext not null,
  property_id uuid not null references properties(id) on delete cascade,
  role membership_role not null default 'reception',
  invited_by uuid references auth.users(id),
  invited_at timestamptz not null default now(),
  token text not null default encode(gen_random_bytes(12), 'hex'),
  expires_at timestamptz not null default (now() + interval '14 days'),
  unique (email, property_id)
);

create index if not exists pending_invites_email_idx on pending_invites(email);
create index if not exists pending_invites_property_idx on pending_invites(property_id);

alter table pending_invites enable row level security;

-- Property members can read / create / delete invites for their own
-- property. The accept-on-sign-in flow runs as the authenticated user
-- and reads their own email's invites across all properties.
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'pending_invites' and policyname = 'members manage') then
    create policy "members manage" on pending_invites
      for all to authenticated
      using (has_property_access(property_id))
      with check (has_property_access(property_id));
  end if;
  -- Auth users can read invites addressed to their email (so the
  -- accept-on-sign-in flow can find theirs). This is the only path
  -- by which a non-member can see an invite row, and they can only
  -- see their own.
  if not exists (select 1 from pg_policies where tablename = 'pending_invites' and policyname = 'self read by email') then
    create policy "self read by email" on pending_invites
      for select to authenticated
      using (email = (select email from auth.users where id = auth.uid())::citext);
  end if;
  -- And delete their own invites once accepted (the App.jsx flow
  -- creates the membership then removes the invite).
  if not exists (select 1 from pg_policies where tablename = 'pending_invites' and policyname = 'self delete by email') then
    create policy "self delete by email" on pending_invites
      for delete to authenticated
      using (email = (select email from auth.users where id = auth.uid())::citext);
  end if;
end $$;

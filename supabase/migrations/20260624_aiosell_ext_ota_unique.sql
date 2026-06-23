-- AIOSELL OTA reservations: make (property_id, ext_ota_id) UNIQUE for OTA
-- bookings so a concurrent duplicate webhook delivery can't double-book (the
-- previous 20260622 index was non-unique, leaving a read-then-insert race). The
-- webhook catches the unique violation (Postgres 23505) and UPDATEs the existing
-- row instead of inserting a second one.
--
-- Partial (WHERE ext_ota_id IS NOT NULL) so the many non-OTA bookings — which
-- leave ext_ota_id NULL — are unaffected and can coexist freely. The partial
-- unique index also serves the webhook's (property_id, ext_ota_id) lookup, so the
-- old plain index is replaced. Idempotent — safe to re-run.
--
-- NOTE: if duplicate (property_id, ext_ota_id) rows already exist this errors —
-- de-dupe first. (None exist before the reservation webhook goes live.)

drop index if exists bookings_ext_ota_id_idx;
create unique index if not exists bookings_ext_ota_id_uniq
  on bookings (property_id, ext_ota_id) where ext_ota_id is not null;

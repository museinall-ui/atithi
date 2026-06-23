-- AIOSELL OTA reservations (Phase 5, Chunk 4): store the channel manager's
-- booking id on each booking so inbound modify/cancel webhooks reconcile to the
-- SAME row, plus the OTA name. The reservation webhook (api/aiosell-reservation.js)
-- looks a booking up by (property_id, ext_ota_id) to apply a later modify/cancel,
-- and to ignore duplicate deliveries (idempotency). Idempotent — safe to re-run.

alter table bookings add column if not exists ext_ota_id text;
alter table bookings add column if not exists ext_channel text;

-- Lookup index used by the webhook (find existing booking by property + OTA id).
create index if not exists bookings_ext_ota_id_idx on bookings (property_id, ext_ota_id);

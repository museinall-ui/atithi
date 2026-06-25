// Server-side AIOSELL push helpers — shared by every server path that needs to
// keep OTA inventory correct WITHOUT depending on a browser being open:
//   • api/ota-inventory-sync.js  — periodic reconciliation (the safety net)
//   • api/hold-watch.js          — push freed inventory right after a server auto-release
//   • api/notify-booking.js      — close the unit on OTAs the moment a website/staff booking lands
//   • api/aiosell-push.js        — the original user-triggered push (now shares the wire helper)
//
// ── Why this is correct, not jugaad ──────────────────────────────────────────
// ZERO DRIFT: availability is computed with the EXACT SAME functions the browser
// uses (computeInventoryUpdates → computeUnitUsage, in src/data.js). The server
// and client therefore push the SAME number for a given date + DB state, so the
// OTA never oscillates between two values depending on who pushed last.
//
// AIOSELL is the channel manager: when an OTA itself sells a room it decrements
// its own pool and closes the other OTAs. So we only ever push OUR-side changes
// (direct + website bookings, holds, auto-releases, maintenance close-outs).
//
// Reads use the Supabase service-role key (server-only secret; bypasses RLS).
// Pushes use AIOSELL Basic-Auth creds (server-only). Both come from env vars, so
// every function here is a safe no-op until the owner sets them.

import { computeInventoryUpdates, buildInventoryPush } from '../src/cloud/aiosell.js';
import { aiosellMappingFromProperty, isAiosellConfigured, dynamicHorizonDays } from '../src/cloud/aiosellSync.js';
import { effectiveRoomTypes, dateToIdx } from '../src/data.js';

const SUPABASE_URL = 'https://vaerzwmglfwslvqqcyhx.supabase.co';

// kind → AIOSELL endpoint. KEEP IN SYNC with api/aiosell-push.js + aiosell.js.
const KIND_PATH = {
  inventory:             (base, slug) => `${base}/update/${slug}`,
  inventoryRestrictions: (base, slug) => `${base}/update/${slug}`,
  rates:                 (base, slug) => `${base}/update-rates/${slug}`,
  rateRestrictions:      (base, slug) => `${base}/update-rates/${slug}`,
  noshow:                (base) => `${base}/noshow`,
};

export function aiosellEnv() {
  return {
    username: process.env.AIOSELL_USERNAME,
    password: process.env.AIOSELL_PASSWORD,
    slug: process.env.AIOSELL_PMS_SLUG,
    base: process.env.AIOSELL_BASE_URL || 'https://live.aiosell.com/api/v2/cm',
  };
}
export function aiosellConfigured() {
  const e = aiosellEnv();
  return !!(e.username && e.password && e.slug);
}

// Forward a built payload to AIOSELL with Basic auth + a hard timeout so no
// single call can hang a serverless function. Returns {dormant:true} when the
// AIOSELL env isn't set (safe no-op before partner onboarding), else
// {ok, status, body} / {ok:false, error}.
export async function forwardToAiosell({ kind, payload }, timeoutMs = 8000) {
  const { username, password, slug, base } = aiosellEnv();
  if (!username || !password || !slug) return { dormant: true };
  const make = KIND_PATH[kind];
  if (!make) return { ok: false, error: 'unknown kind: ' + kind };
  const url = make(base, slug);
  const basic = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
  const ac = new AbortController();
  const tid = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { Authorization: basic, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ac.signal,
    });
    const raw = await resp.text();
    let body; try { body = JSON.parse(raw); } catch { body = { raw }; }
    return { ok: resp.ok && body.success !== false, status: resp.status, body };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  } finally {
    clearTimeout(tid);
  }
}

function sbHeaders() {
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return { apikey: k, Authorization: 'Bearer ' + k, Accept: 'application/json' };
}

// DB bookings row → the minimal shape computeUnitUsage needs. start_date is
// converted to a day-index against the server's anchor; idxToDate inside
// computeInventoryUpdates round-trips it back to the same absolute date, so the
// availability per calendar date is identical to the client's.
function bookingRowToInv(row) {
  return {
    id: row.id,
    status: row.status,
    roomTypeId: row.room_category_code,
    unitIdx: row.unit_idx || 0,
    startIdx: dateToIdx(row.start_date),
    nights: row.nights || 1,
    roomItems: Array.isArray(row.room_items) ? row.room_items : [],
  };
}

// Build the {hotelCode, payload} inventory push for a property, or null when the
// property isn't AIOSELL-mapped. The window is padded one day on each side: the
// server clock is UTC but Indian hotels sell on IST, so this guarantees the IST
// "today → horizon" range is always fully covered (the extra past day is
// harmless — OTAs don't sell yesterday).
export function buildInventoryPayload({ property, bookings, rateOverrides }) {
  const roomTypes = effectiveRoomTypes(property);
  const mapping = aiosellMappingFromProperty(property, roomTypes);
  if (!isAiosellConfigured(mapping)) return null;
  const horizon = dynamicHorizonDays(bookings, rateOverrides);
  const updates = computeInventoryUpdates({ property, bookings, mapping, fromIdx: -1, days: horizon + 2, rateOverrides });
  return { hotelCode: mapping.hotelCode, payload: buildInventoryPush(mapping.hotelCode, updates) };
}

// Read a property's inventory inputs (categories + AIOSELL mapping + live
// bookings + maintenance close-outs) via the service role and push the CURRENT
// availability to AIOSELL. Idempotent — pushing the same availability twice is
// harmless, which is exactly why we always push rather than guessing from a
// cached hash (a missed push would be an oversell; an extra push costs nothing).
// Returns {skipped} (not mapped), {dormant} (AIOSELL env unset), or {ok,...}.
export async function pushInventoryForProperty(propertyId) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return { error: 'no service key' };
  const H = sbHeaders();
  const [pRes, cRes] = await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/properties?id=eq.${encodeURIComponent(propertyId)}&select=id,accountant`, { headers: H }),
    fetch(`${SUPABASE_URL}/rest/v1/room_categories?property_id=eq.${encodeURIComponent(propertyId)}&select=code,units,base_rate`, { headers: H }),
  ]);
  if (!pRes.ok || !cRes.ok) return { error: 'property/categories read failed' };
  const pRow = (await pRes.json())[0];
  if (!pRow) return { error: 'property not found' };
  const cats = (await cRes.json()).map(c => ({ id: c.code, units: c.units, base: c.base_rate }));
  const property = { categories: cats, accountant: pRow.accountant || {} };
  // Cheap exit before the bigger reads: not mapped → nothing to push.
  if (!isAiosellConfigured(aiosellMappingFromProperty(property, effectiveRoomTypes(property)))) {
    return { skipped: true };
  }
  const [bRes, oRes] = await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/bookings?property_id=eq.${encodeURIComponent(propertyId)}&status=neq.cancelled&select=id,status,start_date,nights,room_category_code,unit_idx,room_items&limit=5000`, { headers: H }),
    fetch(`${SUPABASE_URL}/rest/v1/rate_overrides?property_id=eq.${encodeURIComponent(propertyId)}&select=date,room_category_code,closed_out,closed_units&limit=5000`, { headers: H }),
  ]);
  if (!bRes.ok || !oRes.ok) return { error: 'bookings/overrides read failed' };
  const bookings = (await bRes.json()).map(bookingRowToInv);
  const rateOverrides = {};
  for (const r of (await oRes.json())) {
    rateOverrides[`${r.room_category_code}:${dateToIdx(r.date)}`] = {
      closed: !!r.closed_out,
      closedUnits: Array.isArray(r.closed_units) ? r.closed_units : [],
    };
  }
  const built = buildInventoryPayload({ property, bookings, rateOverrides });
  if (!built) return { skipped: true };
  const r = await forwardToAiosell({ kind: 'inventory', payload: built.payload });
  return { ...r, hotelCode: built.hotelCode, days: built.payload.updates.length };
}

// Property ids that have an AIOSELL hotel code + at least one mapped room.
export async function listConfiguredPropertyIds() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return [];
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/properties?select=id,accountant&limit=2000`, { headers: sbHeaders() });
  if (!resp.ok) return [];
  const rows = await resp.json();
  return rows
    .filter(p => {
      const a = p.accountant && p.accountant.aiosell;
      // Trim to match the client mapping builder (aiosellSync.js), which drops a
      // whitespace-only roomCode — otherwise such a property is listed as
      // configured then wastefully read + skipped every cron run.
      return a && (a.hotelCode || '').trim() && a.rooms &&
        Object.keys(a.rooms).some(k => a.rooms[k] && (a.rooms[k].roomCode || '').trim());
    })
    .map(p => p.id);
}

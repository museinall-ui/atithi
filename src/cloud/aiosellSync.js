// Client-side helper: push a property's current inventory + rates to AIOSELL
// through the secure server function (api/aiosell-push). Used by the automatic
// background sync in App.jsx (and available to the Channels "Sync now" button) so
// the wire logic lives in one place. Pure-ish: the only side effect is the fetch.
//
// Nothing here is OTA-specific beyond the translator in aiosell.js — the operator
// sets a property's mapping (accountant.aiosell); this turns it into payloads and
// posts them. Dormant by nature: if the property isn't mapped it returns
// { skipped:true }, and if the server isn't connected the push just 503s.

import {
  computeInventoryUpdates, computeRateUpdates,
  buildInventoryPush, buildRatePush,
  buildInventoryRestrictionsPush, computeInventoryRestrictionUpdates,
  RESTRICTION_OTAS, channelRulesFor, hasRestrictions, internalChannelToAiosell,
} from './aiosell.js';

// Build the translator mapping from the operator-set config on the property.
// `roomTypes` is effectiveRoomTypes(property) (passed in to avoid re-importing
// the whole data layer's render concerns here).
export function aiosellMappingFromProperty(property, roomTypes) {
  const aio = (property && property.accountant && property.accountant.aiosell) || {};
  const rooms = aio.rooms || {};
  const list = (roomTypes || [])
    .filter(rt => rooms[rt.id] && (rooms[rt.id].roomCode || '').trim())
    .map(rt => {
      const cfg = rooms[rt.id];
      // New shape: an explicit list of rate plans, each { code, mealPlanId,
      // occupancy }. Back-compat: a single legacy `rateplanCode` becomes one
      // double-occupancy, default-meal-plan rate plan.
      let ratePlans = Array.isArray(cfg.ratePlans)
        ? cfg.ratePlans
            .filter(p => p && (p.code || '').trim())
            .map(p => ({ code: (p.code || '').trim(), mealPlanId: p.mealPlanId || null, occupancy: p.occupancy === 'single' ? 'single' : 'double' }))
        : [];
      if (!ratePlans.length && (cfg.rateplanCode || '').trim()) {
        ratePlans = [{ code: (cfg.rateplanCode || '').trim(), mealPlanId: null, occupancy: 'double' }];
      }
      return { roomTypeId: rt.id, roomCode: (cfg.roomCode || '').trim(), ratePlans };
    });
  return { hotelCode: (aio.hotelCode || '').trim(), rooms: list };
}

export function isAiosellConfigured(mapping) {
  return !!(mapping && mapping.hotelCode && Array.isArray(mapping.rooms) && mapping.rooms.length > 0);
}

// How far ahead to push. We do NOT hard-wire a year — we sync from today out to
// the furthest date the hotelier actually has data for (a booking that ends
// later, or a rate / close-out set further out), plus a small pad, with a
// near-term floor so the OTAs always have upcoming availability. A hotel that
// loads rates two years out syncs two years; one that only manages next month
// syncs ~the floor. No upper cap — it's exactly "as much or as little as they
// update".
const HORIZON_FLOOR = 90;
const HORIZON_PAD = 14;
export function dynamicHorizonDays(bookings, overrides) {
  let maxIdx = 0;
  (bookings || []).forEach(b => {
    if (b && b.status !== 'cancelled') maxIdx = Math.max(maxIdx, (b.startIdx || 0) + (b.nights || 1));
  });
  Object.keys(overrides || {}).forEach(k => {
    const idx = parseInt(String(k).split(':')[1], 10);
    if (Number.isFinite(idx)) maxIdx = Math.max(maxIdx, idx + 1);
  });
  return Math.max(HORIZON_FLOOR, maxIdx + HORIZON_PAD);
}

async function postPush({ kind, payload, session, propertyId, timeoutMs = 20000 }) {
  const ac = new AbortController();
  const tid = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const resp = await fetch('/api/aiosell-push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ((session && session.access_token) || '') },
      body: JSON.stringify({ propertyId, kind, payload }),
      signal: ac.signal,
    });
    const data = await resp.json().catch(() => ({}));
    return { status: resp.status, data };
  } catch (e) {
    return { status: 0, data: { error: String(e?.message || e) } };
  } finally {
    clearTimeout(tid);
  }
}

// Push inventory + rates (+ restrictions). The horizon is dynamic by default
// (dynamicHorizonDays — as far as the hotelier actually has data) but a caller
// can pin a specific `days`. Returns { skipped } when the property isn't mapped,
// else { inventory, rates, restrictions, days } with each push's {status, data}.
export async function syncPropertyToAiosell({ property, bookings, overrides, roomTypes, session, propertyId, days = null, clearRestrictions = false }) {
  const mapping = aiosellMappingFromProperty(property, roomTypes);
  if (!isAiosellConfigured(mapping)) return { skipped: true };

  const horizon = (days != null) ? days : dynamicHorizonDays(bookings, overrides);

  const invPayload = buildInventoryPush(
    mapping.hotelCode,
    computeInventoryUpdates({ property, bookings, mapping, fromIdx: 0, days: horizon, rateOverrides: overrides }),
  );
  const inventory = await postPush({ kind: 'inventory', payload: invPayload, session, propertyId });

  let rates = null;
  if (mapping.rooms.some(r => Array.isArray(r.ratePlans) && r.ratePlans.length)) {
    const ratePayload = buildRatePush(
      mapping.hotelCode,
      computeRateUpdates({ property, rateOverrides: overrides, mapping, fromIdx: 0, days: horizon }),
    );
    rates = await postPush({ kind: 'rates', payload: ratePayload, session, propertyId });
  }

  // Stay restrictions. Push ALL mapped OTAs (each gets its effective rules; an
  // un-restricted OTA gets the normalised clearing shape, stopSell:false /
  // minimumStay:null) whenever the property has ANY restriction OR the caller
  // asks to clear — so un-pausing an OTA / removing the last min-stay actually
  // un-does the stale state on AIOSELL (restriction pushes are upserts). Skip
  // entirely only when nothing is restricted and no clear is requested.
  const anyRestr = hasRestrictions(property, overrides, mapping, 0, horizon);
  let restrictions = null;
  if (anyRestr || clearRestrictions) {
    const restrResults = [];
    for (const ota of RESTRICTION_OTAS) {
      const chan = internalChannelToAiosell(ota);
      if (!chan) continue;
      const rules = channelRulesFor(property, ota);
      const updates = computeInventoryRestrictionUpdates({ property, rateOverrides: overrides, mapping, fromIdx: 0, days: horizon, minNightsCfg: rules.minNights, paused: rules.paused });
      const r = await postPush({ kind: 'inventoryRestrictions', payload: buildInventoryRestrictionsPush(mapping.hotelCode, [chan], updates), session, propertyId });
      restrResults.push(r);
    }
    restrictions = restrResults.length ? (restrResults.find(r => !(r.status === 200 && r.data && r.data.ok)) || restrResults[0]) : null;
  }

  return { inventory, rates, restrictions, days: horizon, hadRestrictions: anyRestr };
}

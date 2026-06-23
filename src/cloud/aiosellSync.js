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
  buildInventoryRestrictionsPush, computeInventoryRestrictionUpdates, hasRestrictions,
} from './aiosell.js';

// OTA channels we push stay-restrictions to by default. AtithiBook doesn't yet
// have per-property channel selection, so restrictions apply across the OTAs we
// know about. (Restriction pushes require an explicit toChannels list per spec.)
export const DEFAULT_RESTRICTION_CHANNELS = ['booking.com', 'makemytrip', 'goibibo', 'agoda', 'airbnb'];

// Build the translator mapping from the operator-set config on the property.
// `roomTypes` is effectiveRoomTypes(property) (passed in to avoid re-importing
// the whole data layer's render concerns here).
export function aiosellMappingFromProperty(property, roomTypes) {
  const aio = (property && property.accountant && property.accountant.aiosell) || {};
  const rooms = aio.rooms || {};
  const list = (roomTypes || [])
    .filter(rt => rooms[rt.id] && (rooms[rt.id].roomCode || '').trim())
    .map(rt => ({
      roomTypeId: rt.id,
      roomCode: (rooms[rt.id].roomCode || '').trim(),
      rateplanCode: (rooms[rt.id].rateplanCode || '').trim(),
    }));
  return { hotelCode: (aio.hotelCode || '').trim(), rooms: list };
}

export function isAiosellConfigured(mapping) {
  return !!(mapping && mapping.hotelCode && Array.isArray(mapping.rooms) && mapping.rooms.length > 0);
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

// Push inventory + rates for `days` ahead. Returns { skipped } when the property
// isn't mapped, else { inventory, rates } with each push's {status, data}. Rates
// are only pushed for rooms that have a rate-plan code mapped.
export async function syncPropertyToAiosell({ property, bookings, overrides, roomTypes, session, propertyId, days = 365 }) {
  const mapping = aiosellMappingFromProperty(property, roomTypes);
  if (!isAiosellConfigured(mapping)) return { skipped: true };

  const invPayload = buildInventoryPush(
    mapping.hotelCode,
    computeInventoryUpdates({ property, bookings, mapping, fromIdx: 0, days, rateOverrides: overrides }),
  );
  const inventory = await postPush({ kind: 'inventory', payload: invPayload, session, propertyId });

  let rates = null;
  if (mapping.rooms.some(r => r.rateplanCode)) {
    const ratePayload = buildRatePush(
      mapping.hotelCode,
      computeRateUpdates({ property, rateOverrides: overrides, mapping, fromIdx: 0, days }),
    );
    rates = await postPush({ kind: 'rates', payload: ratePayload, session, propertyId });
  }

  // Stay restrictions (stop-sell from close-outs + min-stay from Advanced
  // Settings). Skipped entirely when the property uses no restrictions, so we
  // don't push a horizon of all-null rows.
  let restrictions = null;
  if (hasRestrictions(property, overrides, mapping, 0, days)) {
    const restrPayload = buildInventoryRestrictionsPush(
      mapping.hotelCode,
      DEFAULT_RESTRICTION_CHANNELS,
      computeInventoryRestrictionUpdates({ property, rateOverrides: overrides, mapping, fromIdx: 0, days }),
    );
    restrictions = await postPush({ kind: 'inventoryRestrictions', payload: restrPayload, session, propertyId });
  }

  return { inventory, rates, restrictions };
}

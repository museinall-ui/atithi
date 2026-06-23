// AIOSELL channel-manager translation layer (Phase 5, Chunk 1).
//
// PURE data conversion between AtithiBook's internal shapes and AIOSELL's REST
// API JSON, in BOTH directions. No network, no credentials, no Supabase — those
// arrive in later chunks (a server-side `api/aiosell-push.js` for outbound, and
// an `api/aiosell-reservation.js` webhook for inbound). Keeping every wire-shape
// in one place means the format is auditable and can be unit-run in Node against
// real seed data before anything touches the network.
//
// Spec source: AIOSELL's own "AI-ready" context file (apidocs.aiosell.com).
// The rules it pins down, baked in below so we never drift from them:
//   - JSON keys are camelCase; dates are 'YYYY-MM-DD', INCLUSIVE on both ends.
//   - Inventory / rate / restriction pushes are UPSERTS over the date range.
//   - Restriction fields: an unset field is sent as explicit `null`, never omitted.
//   - The reservation webhook carries book / modify / cancel in ONE shape, keyed
//     by `action`; a `modify` is a full-state replace, not a diff.
//   - OTA channel keys are lowercase.
//
// The CODE MAPPING (our room/rate-plan ids <-> AIOSELL's room/rateplan codes,
// plus the AIOSELL hotelCode) is supplied by the CALLER, never guessed here.
// AIOSELL issues those codes per property at onboarding; a later chunk
// (Settings → Channels) lets the hotelier edit them. Until then callers pass an
// explicit mapping object of this shape:
//
//   {
//     hotelCode: 'sandbox-pms',
//     rooms: [
//       { roomTypeId: 'dlx', roomCode: 'executive', rateplanCode: 'executive-s-ep' },
//       { roomTypeId: 'lux', roomCode: 'suite',     rateplanCode: 'suite-s-ep' },
//       ...
//     ],
//   }

import {
  ANCHOR,
  idxToDate,
  dateToIdx,
  ratePerNight,
  computeUnitUsage,
  effectiveRoomTypes,
  mealPlanById,
  defaultMealPlanId,
  baseCapacityAdults,
  singleOccActive,
  singleOccRateFor,
} from '../data.js';

// ----------------------------------------------------------------------------
// Channels
// ----------------------------------------------------------------------------

// The OTA channel keys AIOSELL recognises (lowercase, per the spec). Used as the
// allowed values for a restriction push's `toChannels`.
export const AIOSELL_CHANNELS = [
  'booking.com', 'expedia', 'agoda', 'makemytrip', 'goibibo', 'airbnb', 'cleartrip', 'ctrip',
];

// AIOSELL channel name -> AtithiBook internal channel id (inbound bookings).
// The webhook's `channel` can arrive human-cased ("Goibibo", "Booking.com",
// "MakeMyTrip"), so we strip to lowercase alphanumerics before matching.
const CHANNEL_IN = {
  bookingcom: 'booking',
  booking:    'booking',
  makemytrip: 'mmt',
  mmt:        'mmt',
  goibibo:    'goibibo',
  agoda:      'agoda',
  airbnb:     'airbnb',
  expedia:    'expedia',
  cleartrip:  'cleartrip',
  ctrip:      'ctrip',
};

// AtithiBook internal channel id -> AIOSELL channel key (for restriction
// targeting). Only the OTAs AIOSELL distributes to; 'direct' / 'website' have
// no OTA counterpart and map to null.
const CHANNEL_OUT = {
  mmt:     'makemytrip',
  goibibo: 'goibibo',
  booking: 'booking.com',
  agoda:   'agoda',
  airbnb:  'airbnb',
};

// Normalise an inbound AIOSELL channel name to our internal id. Unknown OTAs
// fall through to their cleaned lowercase name (so the booking still records
// its source — Reports just shows it as its own bucket — rather than silently
// becoming "direct").
export function aiosellChannelToInternal(name) {
  const key = String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return CHANNEL_IN[key] || key || 'direct';
}

// Map an internal channel id to its AIOSELL key, or null if it isn't an OTA.
export function internalChannelToAiosell(id) {
  return CHANNEL_OUT[id] || null;
}

// ----------------------------------------------------------------------------
// Endpoints
// ----------------------------------------------------------------------------

const BASE_URL = 'https://live.aiosell.com/api/v2/cm';

// Resolve the four push URLs for a given PMS partner slug. The slug is a
// placeholder ('sample-pms' in the sandbox) until AIOSELL assigns the real
// partner id at onboarding — the server-side push function passes it in from a
// secret env var, never hard-coded here. Inventory + inventory-restrictions
// share `/update/{slug}`; rates + rate-restrictions share `/update-rates/{slug}`.
export function aiosellEndpoints(pmsSlug) {
  const slug = pmsSlug || 'sample-pms';
  return {
    inventory:             `${BASE_URL}/update/${slug}`,
    rates:                 `${BASE_URL}/update-rates/${slug}`,
    inventoryRestrictions: `${BASE_URL}/update/${slug}`,
    rateRestrictions:      `${BASE_URL}/update-rates/${slug}`,
    noshow:                `${BASE_URL}/noshow`,
  };
}

// ----------------------------------------------------------------------------
// Outbound envelope builders (spec-exact)
// ----------------------------------------------------------------------------
// These take already-resolved data and wrap it in the precise JSON envelope
// AIOSELL expects. Kept dead-simple and separate from the data computation so
// the wire shape is trivially checkable against the spec.

export function buildInventoryPush(hotelCode, updates) {
  return { hotelCode, updates: updates || [] };
}

export function buildRatePush(hotelCode, updates) {
  return { hotelCode, updates: updates || [] };
}

export function buildInventoryRestrictionsPush(hotelCode, toChannels, updates) {
  return { hotelCode, toChannels: toChannels || [], updates: updates || [] };
}

export function buildRateRestrictionsPush(hotelCode, toChannels, updates) {
  return { hotelCode, toChannels: toChannels || [], updates: updates || [] };
}

// No-Show currently supports `booking.com` only (per spec); the caller passes
// the real partner string.
export function buildNoShowPush(hotelId, bookingId, partner) {
  return { hotelId, bookingId, partner: partner || 'booking.com' };
}

// The complete restriction field set. AIOSELL wants every field present, with
// an unset field sent as explicit null (never omitted). Pass a partial object
// (e.g. { minimumStay: 2 }) and this returns the full shape with the rest null.
const RESTRICTION_FIELDS = [
  'stopSell',
  'minimumStay',
  'maximumStay',
  'closeOnArrival',
  'closeOnDeparture',
  'minimumStayArrival',
  'maximumStayArrival',
  'exactStayArrival',
  'minimumAdvanceReservation',
  'maximumAdvanceReservation',
];

export function normaliseRestrictions(partial) {
  const p = partial || {};
  const out = {};
  for (const f of RESTRICTION_FIELDS) {
    out[f] = (f in p && p[f] != null) ? p[f] : null;
  }
  return out;
}

// ----------------------------------------------------------------------------
// Outbound data computation (from live AtithiBook data, mapping-driven)
// ----------------------------------------------------------------------------

// How many physical units of a room type are free on a single day, mirroring
// the Diary's occupancy model (computeUnitUsage) so what we push to the OTAs
// equals exactly what the hotelier sees on the Diary. A booking occupies a
// unit on day `idx` when idx ∈ [startIdx, endIdx).
function freeUnitsOn(usageForType, totalUnits, idx) {
  let free = 0;
  for (let u = 0; u < totalUnits; u++) {
    const ranges = usageForType[u] || [];
    const occupied = ranges.some(r => idx >= r.startIdx && idx < r.endIdx);
    if (!occupied) free++;
  }
  return free;
}

// Build AIOSELL inventory `updates[]` (one block per day) from live occupancy.
// Per-date close-outs from rateOverrides are honoured: a whole-type `closed`
// zeroes availability; `closedUnits` removes specific still-free units. Feed the
// result to buildInventoryPush(hotelCode, updates).
export function computeInventoryUpdates({ property, bookings, mapping, fromIdx = 0, days = 30, rateOverrides = null }) {
  const roomTypes = effectiveRoomTypes(property);
  const used = computeUnitUsage(bookings || [], roomTypes);
  const roomMap = (mapping && mapping.rooms) || [];
  const updates = [];

  for (let i = 0; i < days; i++) {
    const idx = fromIdx + i;
    const rooms = [];
    for (const rm of roomMap) {
      const rt = roomTypes.find(r => r.id === rm.roomTypeId);
      if (!rt) continue; // mapping points at a room we don't have — skip
      const usage = used[rm.roomTypeId] || {};
      const totalUnits = rt.units || 0;
      let free = freeUnitsOn(usage, totalUnits, idx);

      const ov = rateOverrides ? rateOverrides[`${rm.roomTypeId}:${idx}`] : null;
      if (ov) {
        if (ov.closed) {
          free = 0;
        } else if (Array.isArray(ov.closedUnits) && ov.closedUnits.length) {
          // Subtract only the closed units that were otherwise still free, so
          // we don't double-count a unit that's already occupied by a booking.
          const stillFreeClosed = ov.closedUnits.filter(u => {
            const ranges = usage[u] || [];
            return !ranges.some(r => idx >= r.startIdx && idx < r.endIdx);
          }).length;
          free = Math.max(0, free - stillFreeClosed);
        }
      }

      rooms.push({ available: free, roomCode: rm.roomCode });
    }
    const date = idxToDate(idx);
    updates.push({ startDate: date, endDate: date, rooms });
  }
  return updates;
}

// Build AIOSELL rate `updates[]` (one block per day) from AtithiBook's calendar
// rate. Each mapped room can carry SEVERAL AIOSELL rate plans, one per
// (occupancy × meal-plan) combination the hotelier sells on the OTAs — e.g.
// executive-s-ep (single, room-only) vs executive-d-cp (double, breakfast).
//
// The per-night price for a (room, occupancy, meal-plan) is composed from the
// same pieces the hotelier's own booking flow uses:
//   - room portion: the calendar rate ratePerNight() for double occupancy; the
//     flat single-occupancy rate (singleOccRateFor) for single, when enabled +
//     set, else the calendar rate.
//   - meal portion: AtithiBook treats the calendar rate as already INCLUDING the
//     property's default meal plan, so we add the per-guest-per-night delta
//     between the plan's price and the default plan's price, × the occupancy's
//     guest count. (Default-plan rate plans therefore add nothing.)
export function ratePlanRateForDay(property, rateOverrides, roomTypeId, dayIdx, planSpec) {
  const occupancy = (planSpec && planSpec.occupancy) === 'single' ? 'single' : 'double';
  const guests = occupancy === 'single' ? 1 : (baseCapacityAdults(property) || 2);

  let roomRate;
  if (occupancy === 'single' && singleOccActive(property)) {
    const category = effectiveRoomTypes(property).find(r => r.id === roomTypeId) || null;
    const solo = singleOccRateFor({ adults: 1 }, category, property);
    roomRate = (solo != null) ? solo : ratePerNight(property, rateOverrides, roomTypeId, dayIdx);
  } else {
    roomRate = ratePerNight(property, rateOverrides, roomTypeId, dayIdx);
  }

  const mealId = (planSpec && planSpec.mealPlanId) || defaultMealPlanId(property);
  const selPlan = mealPlanById(property, mealId);
  const defPlan = mealPlanById(property, defaultMealPlanId(property));
  const mealDelta = ((selPlan && selPlan.price) || 0) - ((defPlan && defPlan.price) || 0);
  return Math.round(roomRate + mealDelta * guests);
}

// Build AIOSELL rate `updates[]` (one block per day). For each mapped room we
// emit one rate entry per mapped rate plan. Back-compat: a room with the legacy
// single `rateplanCode` (and no `ratePlans`) is treated as one double-occupancy
// default-meal-plan rate plan, so it prices identically to before.
export function computeRateUpdates({ property, rateOverrides = null, mapping, fromIdx = 0, days = 30 }) {
  const roomMap = (mapping && mapping.rooms) || [];
  const plansFor = (rm) => {
    if (Array.isArray(rm.ratePlans) && rm.ratePlans.length) return rm.ratePlans.filter(p => p && p.code);
    if (rm.rateplanCode) return [{ code: rm.rateplanCode, mealPlanId: null, occupancy: 'double' }];
    return [];
  };
  const updates = [];

  for (let i = 0; i < days; i++) {
    const idx = fromIdx + i;
    const rates = [];
    for (const rm of roomMap) {
      for (const pl of plansFor(rm)) {
        const rate = ratePlanRateForDay(property, rateOverrides, rm.roomTypeId, idx, pl);
        rates.push({ roomCode: rm.roomCode, rate, rateplanCode: pl.code });
      }
    }
    const date = idxToDate(idx);
    updates.push({ startDate: date, endDate: date, rates });
  }
  return updates;
}

// Min length-of-stay for a single day from a minNights config
// ({ enabled, weekend, allDays }). Weekend days (per weekendDays) get the weekend
// minimum; others the all-days minimum. Null when off or the trivial 1.
function minLosFromCfg(ml, weekendDays, dayIdx) {
  if (!ml || !ml.enabled) return null;
  const d = new Date(ANCHOR);
  d.setDate(d.getDate() + dayIdx);
  const v = (weekendDays || [0, 6]).includes(d.getDay()) ? (ml.weekend || 0) : (ml.allDays || 0);
  return v > 1 ? v : null;
}

// The OTA channels (internal ids) that restrictions are pushed to / varied across.
export const RESTRICTION_OTAS = ['mmt', 'goibibo', 'booking', 'agoda', 'airbnb'];

// Effective restriction rules for one OTA: its per-channel min-stay override
// (accountant.channelRules[ota].minNights) or the property default, plus whether
// the hotelier has paused selling on that OTA entirely.
export function channelRulesFor(property, otaKey) {
  const all = (property && property.accountant && property.accountant.channelRules) || {};
  const ov = all[otaKey] || {};
  const def = (property && property.accountant && property.accountant.minNights) || null;
  // Use the per-OTA override only when it's an ENABLED object; a disabled
  // override (the hotelier toggled custom min-stay off) falls back to the
  // property default, matching the UI's "leave untouched to use your default".
  const useOverride = ov.minNights && typeof ov.minNights === 'object' && ov.minNights.enabled;
  const minNights = useOverride ? ov.minNights : def;
  return { minNights: minNights || { enabled: false }, paused: !!ov.paused };
}

// Whether a given OTA has any restriction to push — paused, a real min-stay (>1),
// or any whole-type close-out in range (close-outs are uniform across OTAs).
export function otaHasRestrictions(property, rateOverrides, mapping, fromIdx, days, rules) {
  if (rules && rules.paused) return true;
  const ml = rules && rules.minNights;
  if (ml && ml.enabled && ((ml.weekend || 0) > 1 || (ml.allDays || 0) > 1)) return true;
  const rooms = (mapping && mapping.rooms) || [];
  if (rateOverrides) {
    for (let i = 0; i < days; i++) {
      const idx = fromIdx + i;
      for (const rm of rooms) {
        const ov = rateOverrides[`${rm.roomTypeId}:${idx}`];
        if (ov && ov.closed) return true;
      }
    }
  }
  return false;
}

// Property-wide check (any OTA has restrictions). Gate before the per-OTA loop.
export function hasRestrictions(property, rateOverrides, mapping, fromIdx = 0, days = 365) {
  return RESTRICTION_OTAS.some(ota => otaHasRestrictions(property, rateOverrides, mapping, fromIdx, days, channelRulesFor(property, ota)));
}

// Build AIOSELL inventory-restriction `updates[]` (room-level). stop-sell comes
// from close-outs OR a channel pause; min-stay from the passed minNightsCfg (a
// per-OTA override or the default). Full normalised shape per day so re-opening /
// clearing propagates. Feed to buildInventoryRestrictionsPush(hotelCode, [ota], …).
export function computeInventoryRestrictionUpdates({ property, rateOverrides = null, mapping, fromIdx = 0, days = 365, minNightsCfg = null, paused = false }) {
  const roomMap = (mapping && mapping.rooms) || [];
  const weekendDays = (property && property.weekendRules && property.weekendRules.weekendDays) || [0, 6];
  const ml = minNightsCfg || (property && property.accountant && property.accountant.minNights) || null;
  const updates = [];
  for (let i = 0; i < days; i++) {
    const idx = fromIdx + i;
    const minLos = minLosFromCfg(ml, weekendDays, idx);
    const rooms = [];
    for (const rm of roomMap) {
      const ov = rateOverrides ? rateOverrides[`${rm.roomTypeId}:${idx}`] : null;
      rooms.push({
        roomCode: rm.roomCode,
        restrictions: normaliseRestrictions({ stopSell: paused || !!(ov && ov.closed), minimumStay: minLos }),
      });
    }
    updates.push({ startDate: idxToDate(idx), endDate: idxToDate(idx), rooms });
  }
  return updates;
}

// ----------------------------------------------------------------------------
// Inbound translation (AIOSELL reservation webhook -> AtithiBook action)
// ----------------------------------------------------------------------------

// AIOSELL sends a guest's country as a full name ("India"). Our booking stores
// a country code ('IN'). Map the common case; leave anything else as-is for the
// webhook handler (a later chunk) to refine against the COUNTRIES table and set
// form_c for non-IN guests.
function mapCountry(name) {
  const n = String(name || '').trim().toLowerCase();
  if (!n || n === 'india' || n === 'in') return 'IN';
  return name;
}

// Convert an inbound AIOSELL reservation webhook payload into a normalised
// AtithiBook action. Returns one of:
//   { action: 'book'  | 'modify', externalId, channel, booking }  -> upsert
//   { action: 'cancel',           externalId, channel }           -> cancel
//
// `externalId` is AIOSELL's `bookingId`; the webhook handler stores it on the
// booking row so a later modify/cancel for the same reservation finds the same
// row. `booking` is in AtithiBook's local booking shape (the same shape
// onCreate / the cloud layer already understand), minus a real `unitIdx` — the
// handler assigns a free unit. A `modify` carries the full new state (replace,
// not merge), exactly as AIOSELL sends it.
export function reservationToBooking(payload, { mapping = {}, property = null } = {}) {
  const p = payload || {};
  const action = String(p.action || 'book').toLowerCase();
  const externalId = p.bookingId != null ? String(p.bookingId) : '';
  const channel = aiosellChannelToInternal(p.channel);

  // Cancel is a minimal payload — no guest/room data to translate.
  if (action === 'cancel') {
    return { action: 'cancel', externalId, channel };
  }

  const roomMap = (mapping && mapping.rooms) || [];
  const reverseRoom = (code) => {
    const hit = roomMap.find(r => r.roomCode === code);
    return hit ? hit.roomTypeId : code; // unmapped code → keep raw so it's visible
  };

  const startIdx = dateToIdx(p.checkin);
  // checkout is exclusive of the last night; nights = day span (>=1).
  const nights = Math.max(1, dateToIdx(p.checkout) - dateToIdx(p.checkin));

  const amount = p.amount || {};
  const total = Math.round(amount.amountAfterTax || 0);
  // pah (pay-at-hotel): true => guest pays us on arrival, nothing collected yet;
  // false => already prepaid via the OTA, treat as paid in full. Do NOT infer
  // from amount (spec guardrail).
  const paid = p.pah ? 0 : total;

  const apiRooms = Array.isArray(p.rooms) ? p.rooms : [];
  const roomItems = apiRooms.map(r => {
    const occ = r.occupancy || {};
    const nightRates = Array.isArray(r.prices) ? r.prices.map(x => Math.round(x.sellRate || 0)) : [];
    const perNightAvg = nightRates.length
      ? Math.round(nightRates.reduce((s, n) => s + n, 0) / nightRates.length)
      : 0;
    return {
      roomTypeId: reverseRoom(r.roomCode),
      adults: occ.adults || 1,
      children: occ.children || 0,
      rate: perNightAvg,
      // Only carry per-night rates when they actually vary across the stay.
      perNight: nightRates.length > 1 && nightRates.some(n => n !== nightRates[0]),
      nightRates: (nightRates.length > 1 && nightRates.some(n => n !== nightRates[0])) ? nightRates : undefined,
    };
  });

  const primaryType = roomItems.length
    ? roomItems[0].roomTypeId
    : reverseRoom((apiRooms[0] || {}).roomCode);

  const guest = p.guest || {};
  const guestName = [guest.firstName, guest.lastName].filter(Boolean).join(' ').trim() || 'OTA Guest';
  const addr = guest.address || {};
  const totalAdults = roomItems.reduce((s, r) => s + (r.adults || 0), 0) || 1;
  const totalChildren = roomItems.reduce((s, r) => s + (r.children || 0), 0);

  const booking = {
    roomTypeId: primaryType,
    unitIdx: 0,                 // placeholder — the webhook handler assigns a free unit
    startIdx,
    nights,
    guest: guestName,
    phone: guest.phone || '',
    email: guest.email || '',
    country: mapCountry(addr.country),
    guests: `${totalAdults}A${totalChildren ? ' ' + totalChildren + 'C' : ''}`,
    status: 'confirmed',        // an OTA reservation is a confirmed booking, not a hold
    channel,
    total,
    paid,
    roomItems,
    notes: p.specialRequests || '',
    // OTA / channel-manager references so the handler can persist + reconcile a
    // later modify / cancel back to this same booking.
    extOtaId: externalId,
    extCmId: p.cmBookingId != null ? String(p.cmBookingId) : '',
  };

  return { action: action === 'modify' ? 'modify' : 'book', externalId, channel, booking };
}

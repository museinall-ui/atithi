export const ROOM_TYPES = [
  { id: 'dlx',  name: 'Deluxe Tent',          tag: 'tagSaffron', units: 8, base: 4500 },
  { id: 'lux',  name: 'Luxury Tent (AC)',     tag: 'tagOlive',   units: 6, base: 7200 },
  { id: 'btub', name: 'Bathtub Tent',         tag: 'tagSky',     units: 4, base: 9500 },
  { id: 'pool', name: 'Private Pool Cottage', tag: 'tagPlum',    units: 3, base: 14500 },
];

// Single source of truth for the room-type catalog throughout the app. Reads
// from the editable `property.categories` (Settings) so renaming a category
// or changing its unit count actually flows through to Diary / Booking / etc.
// Each entry is merged with a stable colour tag (looked up from ROOM_TYPES by
// id, or assigned from the palette if it's a user-added category).
const TAG_PALETTE = ['tagSaffron', 'tagOlive', 'tagSky', 'tagPlum'];
export function effectiveRoomTypes(property) {
  const cats = property && Array.isArray(property.categories) ? property.categories : null;
  // A property with no room categories is UNCONFIGURED — return an empty list,
  // never the demo Yatra rooms (Deluxe ₹4,500 … Pool ₹14,500). Falling back to
  // ROOM_TYPES here was the root cause of the "demo rooms leak into a fresh
  // hotelier's account" trust-breaker (audit #1): the phantom rooms surfaced
  // across the Diary, Rates, Dashboard occupancy, New Booking and the public
  // widget before the hotelier had set anything up. The action screens that
  // consume this are route-gated until setup is done (see isPropertyConfigured
  // + the setup gate in App.jsx); the rest now render honest empty-states.
  // Demo mode is unaffected — it seeds the full DEFAULT_PROPERTY (categories
  // populated), so it never hits this branch.
  if (!cats || cats.length === 0) return [];
  return cats.map((c, i) => {
    const seed = ROOM_TYPES.find(r => r.id === c.id);
    // Spread the raw category FIRST so per-category fields the rest of the app
    // reads off the effective room type survive — extraAdult / extraChild
    // (extra-guest surcharge), gstRate (per-category GST override),
    // photoDataUrl (widget hero + voucher), etc. Previously this returned only
    // a fixed subset, so extraGuestCostFor() (which looks the category up via
    // effectiveRoomTypes) always saw no extraAdult/extraChild → the
    // extra-guest charge was silently ₹0 across NewBooking, the folio, the
    // voucher and the widget.
    return {
      ...c,
      id: c.id,
      name: c.name || (seed && seed.name) || 'Room',
      units: typeof c.units === 'number' && c.units > 0 ? c.units : (seed?.units || 1),
      base: typeof c.base === 'number' && c.base >= 0 ? c.base : (seed?.base || 0),
      tag: (seed && seed.tag) || TAG_PALETTE[i % TAG_PALETTE.length],
      amenityIds: Array.isArray(c.amenityIds) ? c.amenityIds : [],
    };
  });
}

// A property is "configured" once the hotelier has named their hotel AND added
// at least one room category. Until then the booking / diary / rates screens
// would only show the empty room list from effectiveRoomTypes() above, so they
// are route-gated behind a "finish setup" screen (App.jsx). Kept deliberately
// in lock-step with effectiveRoomTypes()'s empty-check (categories.length) and
// with the onboarding-needed test in App.jsx so the gate and the onboarding
// wizard never disagree.
export function isPropertyConfigured(property) {
  const hasName = !!(property && property.profile && String(property.profile.name || '').trim());
  const hasRoom = !!(property && Array.isArray(property.categories) && property.categories.length > 0);
  return hasName && hasRoom;
}

// Anchor date for day-index math throughout the app. Pinned to local
// midnight of "today" so the diary always centres on the current date
// rather than the demo seed (May 4 2026). Recomputed once at module load
// (= page load) — refresh after midnight to advance the anchor.
export const ANCHOR = (() => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
})();

// Local YYYY-MM-DD formatter. Avoids toISOString() which converts to UTC
// and shifts the day in non-UTC timezones (IST etc.).
export function ymd(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// Day-index <-> date helpers, anchored to ANCHOR. idx 0 == today.
export function idxToDate(idx) {
  const d = new Date(ANCHOR);
  d.setDate(d.getDate() + (idx || 0));
  return ymd(d);
}

export function dateToIdx(dateStr) {
  if (!dateStr) return 0;
  let target;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [y, m, d] = dateStr.split('-').map(Number);
    target = new Date(y, m - 1, d);
  } else {
    target = new Date(dateStr);
  }
  if (isNaN(target.getTime())) return 0;
  return Math.round((target - ANCHOR) / (24 * 3600 * 1000));
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DOWS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

// Build a 14-day starting window for the Diary, anchored at today.
export const DAYS = (() => {
  const out = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(ANCHOR);
    d.setDate(d.getDate() + i);
    out.push({
      iso: ymd(d),
      dow: DOWS[(d.getDay() + 6) % 7],
      dom: d.getDate(),
      month: MONTHS[d.getMonth()],
      isWknd: d.getDay() === 5 || d.getDay() === 6,
      idx: i,
    });
  }
  return out;
})();

export const BOOKINGS_SEED = [
  { id: 'BK-2841', roomTypeId: 'dlx',  unitIdx: 0, startIdx: 1, nights: 3, guest: 'Aanya Sharma',     status: 'confirmed', channel: 'direct',  total: 13500, paid: 13500, guests: '2A',     phone: '+91 98100 ··· 21' },
  { id: 'BK-2842', roomTypeId: 'dlx',  unitIdx: 1, startIdx: 0, nights: 2, guest: 'Rohan Mehta',      status: 'checkedin', channel: 'mmt',     total: 9000,  paid: 9000,  guests: '2A 1C',  phone: '+91 99003 ··· 88' },
  { id: 'BK-2843', roomTypeId: 'dlx',  unitIdx: 2, startIdx: 4, nights: 2, guest: 'Karthik Iyer',     status: 'confirmed', channel: 'goibibo', total: 9000,  paid: 4500,  guests: '2A',     phone: '+91 88000 ··· 12' },
  { id: 'BK-2844', roomTypeId: 'dlx',  unitIdx: 4, startIdx: 7, nights: 4, guest: 'Priya Nair',       status: 'tentative', channel: 'direct',  total: 18000, paid: 0,     guests: '2A',     phone: '+91 90220 ··· 33', releaseAt: '18:00' },
  { id: 'BK-2845', roomTypeId: 'lux',  unitIdx: 0, startIdx: 1, nights: 5, guest: 'James Whitman',    status: 'confirmed', channel: 'booking', total: 36000, paid: 18000, guests: '2A',     phone: '+44 7700 ··· 19',  formC: true },
  { id: 'BK-2846', roomTypeId: 'lux',  unitIdx: 1, startIdx: 3, nights: 2, guest: 'Vikram Sethi',     status: 'confirmed', channel: 'direct',  total: 14400, paid: 14400, guests: '2A 1C',  phone: '+91 98300 ··· 45' },
  { id: 'BK-2847', roomTypeId: 'lux',  unitIdx: 3, startIdx: 5, nights: 3, guest: 'Ananya & Vihaan',  status: 'confirmed', channel: 'direct',  total: 21600, paid: 21600, guests: '2A',     phone: '+91 91100 ··· 02' },
  { id: 'BK-2848', roomTypeId: 'btub', unitIdx: 0, startIdx: 2, nights: 4, guest: 'Sonia Banerjee',   status: 'confirmed', channel: 'mmt',     total: 38000, paid: 19000, guests: '2A',     phone: '+91 90909 ··· 17' },
  { id: 'BK-2849', roomTypeId: 'btub', unitIdx: 2, startIdx: 6, nights: 3, guest: "Maeve O'Connor",   status: 'confirmed', channel: 'booking', total: 28500, paid: 28500, guests: '2A',     phone: '+353 87 ··· 41', formC: true },
  { id: 'BK-2850', roomTypeId: 'pool', unitIdx: 0, startIdx: 1, nights: 4, guest: 'Aditya Birla',     status: 'confirmed', channel: 'direct',  total: 58000, paid: 58000, guests: '2A',     phone: '+91 90099 ··· 50', vip: true },
  { id: 'BK-2851', roomTypeId: 'pool', unitIdx: 1, startIdx: 5, nights: 2, guest: 'Tanvi Kapoor',     status: 'tentative', channel: 'direct',  total: 29000, paid: 0,     guests: '2A',     phone: '+91 90101 ··· 99', releaseAt: '20:00' },
  { id: 'BK-2852', roomTypeId: 'dlx',  unitIdx: 5, startIdx: 9, nights: 3, guest: 'Rajiv Malhotra',   status: 'confirmed', channel: 'direct',  total: 13500, paid: 6750,  guests: '2A',     phone: '+91 99999 ··· 33' },
  { id: 'BK-2853', roomTypeId: 'lux',  unitIdx: 4, startIdx: 10, nights: 2, guest: 'Hiroshi Tanaka',  status: 'confirmed', channel: 'booking', total: 14400, paid: 14400, guests: '2A',     phone: '+81 90 ··· 28', formC: true },
];

export const STATUS = {
  confirmed:  { label: 'Confirmed',   labelHi: 'कन्फर्म्ड', color: 'oklch(58% 0.13 155)', bg: 'oklch(94% 0.05 155)' },
  checkedin:  { label: 'Checked-in',  labelHi: 'चेक-इन',    color: 'oklch(48% 0.14 265)', bg: 'oklch(94% 0.04 265)' },
  checkout:   { label: 'Checked-out', labelHi: 'चेक-आउट',   color: 'oklch(55% 0.04 60)',  bg: 'oklch(95% 0.012 60)' },
  tentative:  { label: 'On hold',     labelHi: 'होल्ड पर',  color: 'oklch(58% 0.14 75)',  bg: 'oklch(95% 0.05 75)' },
  cancelled:  { label: 'Cancelled',   labelHi: 'रद्द',      color: 'oklch(60% 0.04 60)',  bg: 'oklch(94% 0.01 60)' },
};

// Localised status label — STATUS holds the colours/bg used everywhere; this
// returns the right-language text. Hinglish (कन्फर्म्ड / होल्ड पर / चेक-इन …).
export function statusLabel(status, lang) {
  const s = STATUS[status] || STATUS.confirmed;
  return lang === 'hi' ? (s.labelHi || s.label) : s.label;
}

export const CHANNELS = {
  direct:  { label: 'Direct',      color: 'oklch(60% 0.16 38)', short: 'D' },
  // 'website' = booking arrived through the embeddable booking widget on
  // the property's own website. Customer-direct but visually distinct
  // from manually-created direct bookings so the hotelier can spot what
  // came in autonomously vs what they typed in.
  website: { label: 'Website',     color: 'oklch(58% 0.16 200)', short: 'W' },
  mmt:     { label: 'MakeMyTrip',  color: '#EB2026',  short: 'M' },
  goibibo: { label: 'Goibibo',     color: '#F0728F',  short: 'G' },
  booking: { label: 'Booking.com', color: '#003580',  short: 'B' },
  agoda:   { label: 'Agoda',       color: '#5392F9',  short: 'A' },
  airbnb:  { label: 'Airbnb',      color: '#FF5A5F',  short: 'B&B' },
};

// Whether GST should be treated as applicable for this booking.
// - Explicit per-booking override (`gstApplies` true/false) wins.
// - Otherwise default by channel: OTA bookings include GST, direct/cash do not.
export function bookingGstApplies(b) {
  if (b == null) return false;
  if (typeof b.gstApplies === 'boolean') return b.gstApplies;
  return !!b.channel && b.channel !== 'direct';
}

// Normalise a phone string to digits-only for matching across formats
// ("+91 98100 ··· 21" → "9198100·21"-ish, but cleaned of all non-digits).
export function normPhone(s) {
  return String(s || '').replace(/\D+/g, '');
}

// Identify repeat guests by phone match across bookings. Returns a Set of
// normalised phone strings that appear on 2+ non-cancelled bookings. Cheap
// O(n) — recompute per render is fine for a small hotel's booking set.
export function repeatGuestKeys(bookings) {
  const counts = new Map();
  (bookings || []).forEach(b => {
    if (b.status === 'cancelled') return;
    const key = normPhone(b.phone);
    if (!key) return;
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  const out = new Set();
  counts.forEach((n, k) => { if (n >= 2) out.add(k); });
  return out;
}

export function isRepeatGuest(booking, repeats) {
  if (!booking || !repeats) return false;
  return repeats.has(normPhone(booking.phone));
}

// Indian hotel-industry GST slabs, keyed on declared room tariff per night.
// Source: CBIC notifications on hotel accommodation services (HSN 996311),
// as revised effective 22 September 2025 (56th GST Council). The earlier
// 12% slab for mid-tier rooms was retired — that band now sits at 5%
// without ITC.
//   ≤ ₹1,000          — exempt (0%)
//   ₹1,001 – ₹7,499   — 5% (no ITC, CGST 2.5% + SGST 2.5%)
//   ≥ ₹7,500          — 18% (with ITC, CGST 9% + SGST 9%)
// The slab is determined by the published per-night tariff for the room
// category, NOT the discounted price the guest actually paid.
export const GST_SLABS = [
  { upTo: 1000,     rate: 0,  label: '≤ ₹1,000 / night',          note: 'Exempt' },
  { upTo: 7499,     rate: 5,  label: '₹1,001 – ₹7,499 / night',   note: '5% (no ITC)' },
  { upTo: Infinity, rate: 18, label: '≥ ₹7,500 / night',          note: '18% (with ITC)' },
];

// Pick the GST slab that applies to a per-night tariff. Always returns a
// slab — falls back to the highest one for any rate.
export function gstSlabFor(perNightRate) {
  return GST_SLABS.find(s => (perNightRate || 0) <= s.upTo) || GST_SLABS[GST_SLABS.length - 1];
}

// The GST rate (%) a hotelier has configured for a specific room category.
// Resolution order:
//   1. Explicit override on the category (category.gstRate, set in Settings)
//   2. Auto-pick from the slab based on category.base
//   3. 5% fallback (the current mid slab, ₹1,001–₹7,499, where most
//      small-hotel rooms sit). The old 12% default was retired with the
//      22-Sep-2025 slab change, so we must never hand it back.
export function gstRateForCategory(category) {
  if (!category) return 5;
  if (typeof category.gstRate === 'number' && category.gstRate >= 0) return category.gstRate;
  return gstSlabFor(category.base || 0).rate;
}

// Blended GST rate across all rooms in a booking, weighted by tariff.
// Used when the booking spans multiple room categories with different
// slabs (e.g. one Deluxe at 5% + one Pool Cottage at 18%).
export function blendedGstRate(booking, property) {
  if (!booking) return 5;
  const cats = effectiveRoomTypes(property);
  const items = Array.isArray(booking.roomItems) && booking.roomItems.length > 0
    ? booking.roomItems
    : [{ roomTypeId: booking.roomTypeId }];
  let weightedSum = 0;
  let totalWeight = 0;
  for (const it of items) {
    const cat = cats.find(c => c.id === (it.roomTypeId || booking.roomTypeId));
    if (!cat) continue;
    const rate = gstRateForCategory(cat);
    const weight = (it.rate != null ? it.rate : (cat.base || 0)) || 1;
    weightedSum += rate * weight;
    totalWeight += weight;
  }
  if (totalWeight === 0) return 5;
  return weightedSum / totalWeight;
}

// GST breakdown for a booking, treating the price as GST-inclusive (rate
// inside the total). The rate comes from the rooms' assigned slabs (or
// explicit per-category override). Splits as CGST/SGST equally. The
// `interState` field is kept on the return for backward compatibility;
// it's always false — IGST inter-state path was retired.
export function getTaxBreakdown(booking, property) {
  if (!bookingGstApplies(booking)) {
    return { applies: false, rate: 0, gst: 0, cgst: 0, sgst: 0, igst: 0, interState: false };
  }
  const total = booking?.total || 0;
  const rate = blendedGstRate(booking, property);
  const gst = Math.round(total * rate / (100 + rate));
  const half = Math.round(gst / 2);
  return { applies: true, rate, gst, cgst: half, sgst: gst - half, igst: 0, interState: false };
}

// Whether this booking should be included in the monthly invoice export to the
// CA. Same logic and field as bookingGstApplies for now — flipping one flips
// the other. Separate function so the call sites read clearly.
export function bookingInvoiceInclude(b) {
  return bookingGstApplies(b);
}

// Industry-standard OTA commission rates as of May 2026. Each hotelier
// can override these via Settings → Property profile → Channel commissions.
// Stored on property.channelCommissions, with the same channel ids used
// for channel markups + bookings.
//
// Sources (broad approximation — actual rates vary by contract):
//   - MakeMyTrip / Goibibo: 15–22% (taking 18 / 15 as midpoint)
//   - Booking.com: 15% standard, often 18–20% with visibility boost
//   - Agoda: 17–20%
//   - Airbnb: 3% (host service fee) + 14% guest fee (not the hotelier's cost)
//   - direct / website: 0% (no intermediary)
export const DEFAULT_CHANNEL_COMMISSIONS = {
  direct: 0,
  website: 0,
  mmt: 18,
  goibibo: 15,
  booking: 15,
  agoda: 18,
  airbnb: 3,
};

// Effective commission rate (%) for a booking, honouring per-property
// overrides on property.channelCommissions before falling back to the
// industry default. Returns 0 for unknown channels / direct bookings.
export function bookingCommissionRate(booking, property) {
  const ch = booking?.channel || 'direct';
  const overrides = (property && property.channelCommissions) || {};
  if (typeof overrides[ch] === 'number') return Math.max(0, overrides[ch]);
  if (typeof DEFAULT_CHANNEL_COMMISSIONS[ch] === 'number') return DEFAULT_CHANNEL_COMMISSIONS[ch];
  return 0;
}

// What the hotelier actually keeps from a booking after the government
// takes GST and the OTA takes its commission. The math:
//   tax        = GST portion of the booking total (treats total as inclusive)
//   preTaxBase = total − tax   (what's left after the government cut)
//   commission = preTaxBase × commissionRate / 100
//   net        = total − tax − commission
//
// Commission is applied to the pre-tax base because that's the industry
// norm for Indian OTAs (MMT, Goibibo); some channels charge on the gross
// instead but the difference is small and the hotelier can adjust their
// configured commission % up if their contract works on gross.
export function bookingNetAmount(booking, property) {
  if (!booking) return 0;
  const total = booking.total || 0;
  const tax = bookingGstApplies(booking) ? getTaxBreakdown(booking, property).gst : 0;
  const commissionRate = bookingCommissionRate(booking, property);
  const preTaxBase = Math.max(0, total - tax);
  const commission = Math.round(preTaxBase * commissionRate / 100);
  return {
    gross: total,
    tax,
    commission,
    commissionRate,
    net: Math.max(0, total - tax - commission),
  };
}

// Indian financial year for the current calendar date. April 1 to March 31.
// Returned as a two-digit-pair string like "2627" for FY 2026-27. Used as the
// stable bucket key for invoice number counters per FY.
export function currentFinancialYear(now = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth(); // 0 = Jan
  const startYear = m >= 3 ? y : y - 1;
  // Pad EACH half to 2 digits (not the concatenation) so years whose %100 < 10
  // don't lose a leading zero — e.g. 2005 → "0506", not "0056". Irrelevant
  // before 2100 (2026 → "2627") but correct regardless.
  const pad2 = (n) => String(n % 100).padStart(2, '0');
  return `${pad2(startYear)}${pad2(startYear + 1)}`;
}

// Only allow safe link schemes for user-entered URLs rendered as anchors
// (property website / Google-Maps link). Blocks javascript: / data: etc. —
// an owner-self-XSS vector on the printed voucher + the public widget.
// Returns '' for anything that isn't http(s) / mailto / tel.
export function safeUrl(u) {
  if (!u || typeof u !== 'string') return '';
  const s = u.trim();
  return /^(https?:|mailto:|tel:)/i.test(s) ? s : '';
}

// Format a sequential number as a GST-compliant invoice ID. The prefix is
// hotelier-configurable in Property Profile (defaults to "INV") so owners
// migrating from another system can keep using their existing format.
// Final shape: {PREFIX}-{FY}-{SEQ} — e.g. "INV-2627-001", "ABC-2627-001".
// Max length 16 chars per GST rules; with a 3-char prefix this stays under.
export function formatInvoiceNumber(fy, seq, prefix = 'INV') {
  const p = String(prefix || 'INV').trim() || 'INV';
  return `${p}-${fy}-${String(seq).padStart(3, '0')}`;
}

// Convenience accessor: read the hotelier's chosen invoice prefix off the
// property, with the safe default. Lives next to the formatter so callers
// stay in one mental model.
export function invoicePrefixOf(property) {
  const a = property && property.accountant;
  const p = a && typeof a.invoicePrefix === 'string' ? a.invoicePrefix.trim() : '';
  return p || 'INV';
}

// ─── Meal plans ───────────────────────────────────────────────────────────
// Standard hotel-industry plans (EP / CP / MAP / AP) live on `property.mealPlans`.
// Each booking carries a `mealPlanId` that points at one of them. Cost is
// per guest per night, added on top of the room tariff.

export function effectiveMealPlans(property) {
  return Array.isArray(property && property.mealPlans) ? property.mealPlans : [];
}

export function mealPlanById(property, id) {
  return effectiveMealPlans(property).find(p => p.id === id) || null;
}

// Slugify a property name to a URL-safe short code. Lowercase, dashes
// only, no punctuation, max 40 chars. Used as the public-booking
// widget URL — atithi.app/book/yatra-desert-camp.
export function slugify(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')   // strip diacritics
    .replace(/[^a-z0-9]+/g, '-')        // collapse non-alphanum to dashes
    .replace(/^-+|-+$/g, '')            // trim leading/trailing dashes
    .slice(0, 40);
}

// Effective short-code for the property's booking widget URL. Falls back
// to a slug of the property name when shortCode isn't explicitly set so
// every property has a useful default.
export function propertyShortCode(property) {
  const explicit = property?.profile?.shortCode || property?.shortCode;
  if (explicit) return slugify(explicit);
  return slugify(property?.profile?.name) || 'book';
}

// Rate plans — different price tiers (Standard / Flexible / Non-refundable)
// per property. Each plan carries a multiplier that's applied to the
// underlying day rate at booking time. The Standard plan is always
// enabled at 0%. Returns enabled plans only.
export function effectiveRatePlans(property) {
  const all = Array.isArray(property && property.ratePlans) ? property.ratePlans : [];
  return all.filter(p => p.enabled);
}
// Whether the multi-rate-plan picker should appear (NewBooking + widget).
// Defaults to ON when the property has more than the Standard plan, so
// existing setups are unchanged. The Advanced settings master toggle
// (accountant.ratePlansEnabled) can force it on or off explicitly.
export function ratePlansActive(property) {
  const plans = effectiveRatePlans(property);
  if (plans.length <= 1) return false;
  const flag = property && property.accountant ? property.accountant.ratePlansEnabled : undefined;
  return flag === undefined ? true : !!flag;
}
export function ratePlanById(property, id) {
  const all = Array.isArray(property && property.ratePlans) ? property.ratePlans : [];
  return all.find(p => p.id === id) || null;
}
// Default plan: the one a fresh booking gets. Standard plan, always there.
export function defaultRatePlanId() {
  return 'standard';
}

// Rate-plan price multiplier (Standard = 1.0; Flexible / Non-refundable
// per their configured multiplierPct). Shared so the hotelier's NewBooking
// flow and the public widget apply the same tier adjustment.
export function ratePlanMultiplier(property, ratePlanId) {
  const rp = ratePlanById(property, ratePlanId);
  return 1 + ((rp && rp.multiplierPct ? rp.multiplierPct : 0) / 100);
}

// SINGLE SOURCE OF TRUTH for the per-night room rate on a given day index
// (0 = today / ANCHOR; negative = past). Used by BOTH NewBooking (hotelier)
// and PublicBookingWidget (guest) so the same dates always price the same
// way — previously the two had drifted (the widget applied seasons +
// weekendRules but not per-day overrides, while NewBooking applied overrides
// + a hardcoded Fri/Sat 1.2x but neither seasons nor the real weekendRules,
// and pulled day-0's rate for every night). Precedence:
//   1. An explicit per-day rate set in the Rates calendar (override.rate)
//      wins outright — it's the hotelier's hand-set price for that day.
//   2. Otherwise: category base × weekend uplift × season multiplier, where
//      weekend days + uplift come from property.weekendRules and seasons
//      from property.seasons.
// The rate-plan tier is NOT folded in here — callers apply
// ratePlanMultiplier() so each keeps its own per-night-vs-per-stay rounding.
// `closed` / `closedUnits` are availability concerns handled elsewhere; this
// helper is purely about price.
export function ratePerNight(property, rateOverrides, roomTypeId, dayIdx) {
  const room = effectiveRoomTypes(property).find(r => r.id === roomTypeId);
  if (!room) return 0;
  const override = rateOverrides ? rateOverrides[`${roomTypeId}:${dayIdx}`] : null;
  if (override && override.rate != null) return Math.round(override.rate);
  const d = new Date(ANCHOR);
  d.setDate(d.getDate() + dayIdx);
  const iso = ymd(d);
  const weekendDays = (property && property.weekendRules && property.weekendRules.weekendDays) || [0, 6];
  const upliftPct = (property && property.weekendRules && property.weekendRules.upliftPct != null)
    ? property.weekendRules.upliftPct : 20;
  const seasons = Array.isArray(property && property.seasons) ? property.seasons : [];
  const isWknd = weekendDays.includes(d.getDay());
  const matchingSeason = seasons.find(s => iso >= s.startIso && iso <= s.endIso);
  const wkMult = isWknd ? (1 + upliftPct / 100) : 1;
  const seasonMult = matchingSeason ? (1 + ((matchingSeason.multiplierPct || 0) / 100)) : 1;
  return Math.round(room.base * wkMult * seasonMult);
}

// Shared per-unit occupancy map (R8-1). Greedily assigns every ROOM of every
// non-cancelled booking to a physical unit — including the extra rooms of a
// multi-room booking, which live in roomItems[] with no stored unitIdx. The
// Diary's expandToPillInstances() renders pills with this exact same greedy
// logic + sort order, so any availability check that uses THIS function agrees
// with what the Diary shows. Previously findFirstFreeUnit only looked at a
// booking's top-level unitIdx, so it was blind to multi-room occupancy and
// would hand out a unit that was already taken → silent double-booking.
// Returns used[roomTypeId][unitIdx] = [{ startIdx, endIdx, id }].
// KEEP THE SORT + GREEDY IN SYNC WITH src/screens/Diary.jsx expandToPillInstances.
export function computeUnitUsage(bookings, roomTypes) {
  const list = Array.isArray(roomTypes) && roomTypes.length ? roomTypes : ROOM_TYPES;
  const used = {};
  for (const rt of list) {
    used[rt.id] = {};
    for (let u = 0; u < rt.units; u++) used[rt.id][u] = [];
  }
  const sorted = [...(bookings || [])].sort((a, b) => {
    const da = a.startIdx ?? 0, db = b.startIdx ?? 0;
    if (da !== db) return da - db;
    return (a.id || '').localeCompare(b.id || '');
  });
  for (const b of sorted) {
    if (b.status === 'cancelled') continue;
    const items = (Array.isArray(b.roomItems) && b.roomItems.length)
      ? b.roomItems
      : [{ roomTypeId: b.roomTypeId, unitIdx: b.unitIdx }];
    const startIdx = b.startIdx ?? 0;
    const endIdx = startIdx + (b.nights || 1);
    items.forEach((item, itemIndex) => {
      // Per-night room-type switching (item.nightTypes[]): the guest occupies a
      // unit of a possibly-DIFFERENT type each night, so attribute each night to
      // its own type's first-free unit instead of blocking ONE type for the whole
      // stay. Without this, availability + the OTA inventory push miscount —
      // oversell on the night(s) the guest switched INTO another type, and a
      // false close on the primary type for those nights.
      if (Array.isArray(item.nightTypes) && item.nightTypes.length) {
        for (let n = 0; n < (b.nights || 1); n++) {
          const nStart = startIdx + n;
          const nEnd = nStart + 1;
          const nRt = item.nightTypes[n] || item.roomTypeId || b.roomTypeId;
          if (!used[nRt]) continue;
          let nUnit = null;
          const cnt = Object.keys(used[nRt]).length;
          for (let u = 0; u < cnt; u++) {
            if (!used[nRt][u].some(r => !(nEnd <= r.startIdx || nStart >= r.endIdx))) { nUnit = u; break; }
          }
          if (nUnit == null) nUnit = 0;
          if (used[nRt][nUnit] == null) used[nRt][nUnit] = [];
          used[nRt][nUnit].push({ startIdx: nStart, endIdx: nEnd, id: b.id });
        }
        return;
      }
      const rtId = item.roomTypeId || b.roomTypeId;
      if (!used[rtId]) return; // unknown room type — skip
      let unitIdx = item.unitIdx;
      if (unitIdx == null && itemIndex === 0 && b.unitIdx != null && rtId === b.roomTypeId) {
        unitIdx = b.unitIdx;
      }
      if (unitIdx == null) {
        const cnt = Object.keys(used[rtId]).length;
        for (let u = 0; u < cnt; u++) {
          if (!used[rtId][u].some(r => !(endIdx <= r.startIdx || startIdx >= r.endIdx))) { unitIdx = u; break; }
        }
        if (unitIdx == null) unitIdx = 0; // overflow fallback
      }
      if (used[rtId][unitIdx] == null) used[rtId][unitIdx] = [];
      used[rtId][unitIdx].push({ startIdx, endIdx, id: b.id });
    });
  }
  return used;
}

// Lowest free unit of a room type for [startIdx, startIdx+nights), accounting
// for multi-room occupancy via computeUnitUsage. Returns null when every unit
// is taken (caller surfaces an overbooking confirm instead of silently
// stacking). `excludeId` skips a booking (used by drag-move so a booking
// doesn't conflict with itself).
export function firstFreeUnit(bookings, roomTypeId, startIdx, nights, roomTypes, excludeId) {
  const list = Array.isArray(roomTypes) && roomTypes.length ? roomTypes : ROOM_TYPES;
  const room = list.find(r => r.id === roomTypeId);
  if (!room) return null;
  const used = computeUnitUsage(excludeId ? (bookings || []).filter(b => b.id !== excludeId) : bookings, list);
  const endIdx = startIdx + nights;
  for (let u = 0; u < room.units; u++) {
    const ranges = (used[roomTypeId] && used[roomTypeId][u]) || [];
    if (!ranges.some(r => !(endIdx <= r.startIdx || startIdx >= r.endIdx))) return u;
  }
  return null;
}

// Is a SPECIFIC unit free for [startIdx, startIdx+nights)? Used by the Diary's
// drag-move conflict check so dropping onto a unit occupied by ANY room
// (including a multi-room booking's extra room) is correctly blocked.
export function isUnitFree(bookings, roomTypeId, unitIdx, startIdx, nights, roomTypes, excludeId) {
  const list = Array.isArray(roomTypes) && roomTypes.length ? roomTypes : ROOM_TYPES;
  const used = computeUnitUsage(excludeId ? (bookings || []).filter(b => b.id !== excludeId) : bookings, list);
  const ranges = (used[roomTypeId] && used[roomTypeId][unitIdx]) || [];
  const endIdx = startIdx + nights;
  return !ranges.some(r => !(endIdx <= r.startIdx || startIdx >= r.endIdx));
}

// Total guest-count for cost math. Children count toward meals too by default
// — most Indian hotels charge full meal rate for kids above ~5. The owner can
// adjust price points per plan, so we keep the math simple here.
function bookingGuestCount(b) {
  if (Array.isArray(b.roomItems) && b.roomItems.length > 0) {
    return b.roomItems.reduce((s, r) => s + (r.adults || 0) + (r.children || 0), 0);
  }
  // Fall back to parsing the guests string ("2A 1C" -> 3) for legacy bookings.
  const m = String(b.guests || '').match(/(\d+)A.*?(\d+)?C?/);
  return m ? (+m[1] || 0) + (+m[2] || 0) : 1;
}

// The property-wide *default* meal plan. The calendar rate is treated as
// already including this plan — so a booking on the default plan pays no
// extra meal cost. Picking a different plan adds (or subtracts) the delta
// per guest per night.
//
// This unlocks the "all-inclusive package rate" model — a camp that quotes
// ₹4,500/night MAP-inclusive sets MAP as the default, and switching the
// same booking to EP yields a negative delta (the cost of meals refunded).
// For city hotels selling "room + optional breakfast" the default stays at
// 'ep' (price 0), so the math collapses to the previous "add on top" rule.
export function defaultMealPlanId(property) {
  return property?.defaultMealPlanId || 'ep';
}

// ─── Extra adult / extra child pricing ──────────────────────────────────
// Two-tier model agreed with the owner:
//   - property.baseCapacityAdults = how many adults are included in the
//     room rate by default (typically 2).
//   - property.childFreeBelowAge   = free below this age (e.g. < 5).
//   - property.childHalfBelowAge   = half rate between Free and this age
//     (e.g. 5–11). At and above this age, charged at the full extra-child
//     rate (effectively "counted as an adult" for billing).
//   - per category: extraAdult and extraChild each have { mode: 'flat'|'pct',
//     value: number }. 'flat' = ₹ per guest per night. 'pct' = % of the
//     category's base rate, applied per guest per night.
//
// Booking roomItems carry:
//   - adults
//   - children       (half-rate count by default for back-compat)
//   - childrenFree   (optional; free, no charge)
//   - childrenFull   (optional; full extra-child rate, no half discount)

export function baseCapacityAdults(property) {
  return Math.max(1, property?.baseCapacityAdults ?? 2);
}

// ─── Single-occupancy (solo-guest) pricing ──────────────────────────────
// Opt-in via Advanced settings. Config lives on the accountant blob (no
// schema migration): accountant.singleOccEnabled (master toggle) +
// accountant.singleRates = { [categoryId]: flatPerNightRate }.
export function singleOccActive(property) {
  return !!(property && property.accountant && property.accountant.singleOccEnabled);
}
// Resolved single-occupancy per-night rate for a room item, or null when it
// doesn't apply (feature off, not exactly 1 adult, or no rate set for the
// category). Manual per-room rate overrides are honoured by the caller and
// win over this. A flat figure — weekend / season multipliers are not
// stacked on the single rate (the hotelier sets the final solo price).
export function singleOccRateFor(item, category, property) {
  if (!singleOccActive(property)) return null;
  if ((+(item && item.adults) || 0) !== 1) return null;
  const rates = (property.accountant && property.accountant.singleRates) || {};
  const id = category && category.id;
  const r = id != null ? rates[id] : null;
  return (r != null && +r > 0) ? +r : null;
}

function resolveExtraRate(rule, baseRate) {
  if (!rule || typeof rule !== 'object') return 0;
  const v = +rule.value || 0;
  if (v <= 0) return 0;
  if (rule.mode === 'pct') return Math.max(0, Math.round((baseRate || 0) * v / 100));
  return Math.round(v);
}

// Find a season that fully or partially covers a date range. Returns
// the first matching season with a non-null extraAdult OR extraChild
// override (those are the ones we apply). When multiple seasons
// overlap, the one defined earlier in property.seasons wins —
// hoteliers can reorder if they want a different priority.
function seasonOverrideFor(property, booking) {
  if (!property || !booking || !Array.isArray(property.seasons)) return null;
  const startDate = booking.startIdx != null ? new Date(ANCHOR) : null;
  if (!startDate) return null;
  startDate.setDate(startDate.getDate() + (booking.startIdx || 0));
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + ((booking.nights || 1) - 1));
  const startIso = ymd(startDate);
  const endIso = ymd(endDate);
  for (const s of property.seasons) {
    if (!s || !s.startIso || !s.endIso) continue;
    // Overlap test on ISO strings (lexical sort works for YYYY-MM-DD).
    if (s.startIso > endIso || s.endIso < startIso) continue;
    // Only return seasons that ACTUALLY override (skip seasons that
    // exist purely for the multiplier). A season can specify just
    // one of the two; the other falls back to the category default.
    if (s.extraAdult || s.extraChild) return s;
  }
  return null;
}

export function extraGuestCostForItem(item, property, category, nights, booking) {
  if (!item || !category) return 0;
  const cap = baseCapacityAdults(property);
  const adults = +item.adults || 0;
  const childrenHalf = +item.children || 0;
  const childrenFree = +item.childrenFree || 0;
  const childrenFull = +item.childrenFull || 0;
  // Extra-guest pct surcharge is "% of the category BASE rate" everywhere
  // (engine, OTA, reception) per the owner's decision — so the widget (which
  // passes the uplifted nightly rate as item.rate) and reception agree, and the
  // figure matches the "% of base" preview in Settings. A manually-typed per-room
  // rate no longer drags the pct up. (Flat mode ignores baseRate; the per-booking
  // ₹ overrides below still win.)
  const baseRate = (category.base || 0);
  // Resolution chain for the per-guest rate:
  //   1. item.extraAdultRate / extraChildRate — per-booking override
  //      the hotelier explicitly set in NewBooking (a plain ₹ number)
  //   2. matching season's extraAdult / extraChild rule object
  //   3. category default extraAdult / extraChild rule object
  // Per-booking overrides win because they were entered intentionally
  // for THIS guest; seasons + categories are defaults.
  const season = booking ? seasonOverrideFor(property, booking) : null;
  const adultRule = (season && season.extraAdult) ? season.extraAdult : category.extraAdult;
  const childRule = (season && season.extraChild) ? season.extraChild : category.extraChild;
  const autoAdultPer = resolveExtraRate(adultRule, baseRate);
  const autoChildPer = resolveExtraRate(childRule, baseRate);
  const adultPer = (typeof item.extraAdultRate === 'number') ? Math.max(0, item.extraAdultRate) : autoAdultPer;
  const childPer = (typeof item.extraChildRate === 'number') ? Math.max(0, item.extraChildRate) : autoChildPer;
  const extraAdults = Math.max(0, adults - cap);
  const adultCost = extraAdults * adultPer * (nights || 1);
  const halfCost = Math.round(childrenHalf * childPer * 0.5 * (nights || 1));
  const fullCost = childrenFull * childPer * (nights || 1);
  void childrenFree;
  return adultCost + halfCost + fullCost;
}

export function extraGuestCostFor(booking, property) {
  if (!booking) return 0;
  const cats = effectiveRoomTypes(property);
  // Fallback when a booking has no roomItems[] (legacy rows, some
  // widget paths): parse the `guests` string ("2A" / "2A 1C") for the
  // real party size instead of hardcoding adults:2 — the hardcode
  // silently zeroed out the extra-adult surcharge for any larger
  // party, costing the hotelier money on every such booking.
  const parseGuests = (g) => {
    const s = String(g || '');
    const a = s.match(/(\d+)\s*A/i);
    const c = s.match(/(\d+)\s*C/i);
    return { adults: a ? parseInt(a[1], 10) : 2, children: c ? parseInt(c[1], 10) : 0 };
  };
  const items = Array.isArray(booking.roomItems) && booking.roomItems.length > 0
    ? booking.roomItems
    : [{ roomTypeId: booking.roomTypeId, ...parseGuests(booking.guests), rate: null }];
  const nights = booking.nights || 1;
  let total = 0;
  for (const it of items) {
    const cat = cats.find(c => c.id === (it.roomTypeId || booking.roomTypeId));
    if (cat) total += extraGuestCostForItem(it, property, cat, nights, booking);
  }
  return total;
}

// Cost of the meal plan add-on for this booking. Returns the delta from
// the property's default plan × guests × nights. Returns 0 when:
//   - booking has no mealPlanId
//   - the picked plan doesn't exist on the property anymore
//   - the picked plan IS the default (already in the room rate)
// Negative deltas (e.g. EP on a property whose default is MAP) flow
// through unchanged — the booking summary shows them as a discount.
export function mealCostFor(booking, property) {
  if (!booking || !booking.mealPlanId) return 0;
  const selected = mealPlanById(property, booking.mealPlanId);
  if (!selected) return 0;
  const defaultId = defaultMealPlanId(property);
  const defaultPlan = mealPlanById(property, defaultId);
  const defaultPrice = (defaultPlan && defaultPlan.price) || 0;
  const delta = (selected.price || 0) - defaultPrice;
  if (delta === 0) return 0;
  const guests = bookingGuestCount(booking);
  const nights = booking.nights || 1;
  return delta * guests * nights;
}

// Add-on extras cost for a booking, honouring each extra's UNIT — the same
// rule NewBooking + the public widget use to build the stored total:
//   per stay (×1) / per night (×nights) / per guest (×guests) /
//   per guest per night (×guests×nights). Default extras (EXTRAS_DEFAULT)
//   carry no unit → per-stay. extraPrices[id] overrides the catalog price.
// Returns a per-extra breakdown + the summed total so the BookingDetail
// folio and the voucher itemise extras IDENTICALLY. Previously the folio
// folded extras into the room tariff (no row at all) and the voucher
// ignored the unit multiplier — two different wrong line-item numbers for
// the same booking (R10-10). The grand total was always correct; only the
// itemisation diverged. (R10-10)
export function extrasBreakdownFor(booking, property) {
  if (!booking || !booking.extras) return { items: [], total: 0 };
  const catalog = [...EXTRAS_DEFAULT, ...(Array.isArray(booking.customExtras) ? booking.customExtras : [])];
  const nights = booking.nights || 1;
  const guests = bookingGuestCount(booking);
  const items = [];
  for (const [id, qty] of Object.entries(booking.extras)) {
    if (!qty) continue;
    const ex = catalog.find(x => x.id === id);
    if (!ex) continue;
    const price = (booking.extraPrices && booking.extraPrices[id] != null) ? booking.extraPrices[id] : (ex.price || 0);
    let mult = 1;
    switch (ex.unit) {
      case 'per night': mult = nights; break;
      case 'per guest': mult = guests; break;
      case 'per guest per night': mult = guests * nights; break;
      default: mult = 1; // 'per stay' + all default extras
    }
    items.push({ id, label: ex.label, qty, unit: ex.unit || 'per stay', price: price || 0, total: (price || 0) * qty * mult });
  }
  return { items, total: items.reduce((s, it) => s + it.total, 0) };
}

export function extrasCostFor(booking, property) {
  return extrasBreakdownFor(booking, property).total;
}

// All issued (non-voided) invoices across the given bookings, in the order they
// were issued. Used by the month-end CA export.
export function listIssuedInvoices(bookings, property) {
  const all = [];
  for (const b of bookings) {
    // Attach the booking's blended GST rate (5% / 18% post-22-Sep-2025) so
    // downstream consumers (the CA register export) can split each invoice's
    // pre-tax vs GST correctly instead of assuming the retired flat 12%.
    const gstRate = property ? blendedGstRate(b, property) : null;
    for (const inv of (b.invoices || [])) {
      if (inv.voided) continue;
      all.push({ ...inv, bookingId: b.id, guest: b.guest, gstRate });
    }
  }
  return all.sort((a, b) => a.number.localeCompare(b.number));
}

// Credit notes for the CA register. Only for bookings that have a LIVE invoice
// (a credit note reduces invoiced / taxable value, so it relates to an issued
// invoice). Sourced from the payment ledger's 'credit' entries and emitted as
// NEGATIVE-amount rows so the register nets correctly. Atithi records these for
// the CA's visibility; the CA applies formal credit-note numbering + GSTR-1
// treatment (Atithi is a books-keeper, not a filing tool).
export function listCreditNotes(bookings, property) {
  const out = [];
  for (const b of (bookings || [])) {
    const liveInvoices = (b.invoices || []).filter(inv => !inv.voided);
    if (!liveInvoices.length) continue;
    const gstRate = property ? blendedGstRate(b, property) : null;
    const ref = liveInvoices[0];
    for (const p of (b.payments || [])) {
      if (p.kind !== 'credit' && p.kind !== 'credit_note') continue;
      out.push({
        number: `CN · ${ref.number}`,
        againstInvoice: ref.number,
        fy: ref.fy,
        date: p.dateIso || (p.date && p.date !== 'now' ? p.date : ref.date),
        recipient: ref.recipient || { name: b.guest, gstin: '' },
        amount: -(Math.abs(+p.amount || 0)),
        note: p.note || '',
        bookingId: b.id, guest: b.guest, gstRate,
        isCreditNote: true,
      });
    }
  }
  return out;
}

export const COUNTRIES = [
  { code: 'IN', name: 'India',         flag: '🇮🇳', dial: '+91' },
  { code: 'US', name: 'United States', flag: '🇺🇸', dial: '+1'  },
  { code: 'GB', name: 'United Kingdom',flag: '🇬🇧', dial: '+44' },
  { code: 'AU', name: 'Australia',     flag: '🇦🇺', dial: '+61' },
  { code: 'CA', name: 'Canada',        flag: '🇨🇦', dial: '+1'  },
  { code: 'DE', name: 'Germany',       flag: '🇩🇪', dial: '+49' },
  { code: 'FR', name: 'France',        flag: '🇫🇷', dial: '+33' },
  { code: 'IT', name: 'Italy',         flag: '🇮🇹', dial: '+39' },
  { code: 'ES', name: 'Spain',         flag: '🇪🇸', dial: '+34' },
  { code: 'NL', name: 'Netherlands',   flag: '🇳🇱', dial: '+31' },
  { code: 'IE', name: 'Ireland',       flag: '🇮🇪', dial: '+353'},
  { code: 'CH', name: 'Switzerland',   flag: '🇨🇭', dial: '+41' },
  { code: 'SE', name: 'Sweden',        flag: '🇸🇪', dial: '+46' },
  { code: 'NO', name: 'Norway',        flag: '🇳🇴', dial: '+47' },
  { code: 'JP', name: 'Japan',         flag: '🇯🇵', dial: '+81' },
  { code: 'KR', name: 'South Korea',   flag: '🇰🇷', dial: '+82' },
  { code: 'SG', name: 'Singapore',     flag: '🇸🇬', dial: '+65' },
  { code: 'AE', name: 'UAE',           flag: '🇦🇪', dial: '+971'},
  { code: 'IL', name: 'Israel',        flag: '🇮🇱', dial: '+972'},
  { code: 'RU', name: 'Russia',        flag: '🇷🇺', dial: '+7'  },
  { code: 'CN', name: 'China',         flag: '🇨🇳', dial: '+86' },
  { code: 'TH', name: 'Thailand',      flag: '🇹🇭', dial: '+66' },
  { code: 'NZ', name: 'New Zealand',   flag: '🇳🇿', dial: '+64' },
  { code: 'BR', name: 'Brazil',        flag: '🇧🇷', dial: '+55' },
  { code: 'ZA', name: 'South Africa',  flag: '🇿🇦', dial: '+27' },
  { code: 'NP', name: 'Nepal',         flag: '🇳🇵', dial: '+977'},
  { code: 'BT', name: 'Bhutan',        flag: '🇧🇹', dial: '+975'},
  { code: 'LK', name: 'Sri Lanka',     flag: '🇱🇰', dial: '+94' },
];

// Master list of amenities, grouped for browsability. Used by both the
// property-wide amenity picker and each room category's amenity picker.
export const AMENITIES = [
  // Comfort & Connectivity
  { id: 'wifi',         label: 'Free WiFi',          group: 'Comfort & Connectivity' },
  { id: 'ac',           label: 'Air conditioning',   group: 'Comfort & Connectivity' },
  { id: 'heater',       label: 'Room heater',        group: 'Comfort & Connectivity' },
  { id: 'fan',          label: 'Ceiling fan',        group: 'Comfort & Connectivity' },
  { id: 'tv',           label: 'TV',                 group: 'Comfort & Connectivity' },
  { id: 'ethernet',     label: 'Wired internet',     group: 'Comfort & Connectivity' },

  // In-room
  { id: 'minibar',      label: 'Mini bar / fridge',  group: 'In-room' },
  { id: 'kettle',       label: 'Tea / coffee maker', group: 'In-room' },
  { id: 'safe',         label: 'In-room safe',       group: 'In-room' },
  { id: 'workdesk',     label: 'Work desk',          group: 'In-room' },
  { id: 'iron',         label: 'Iron',               group: 'In-room' },
  { id: 'hairdryer',    label: 'Hair dryer',         group: 'In-room' },
  { id: 'balcony',      label: 'Balcony / patio',    group: 'In-room' },
  { id: 'bathtub',      label: 'Bathtub',            group: 'In-room' },
  { id: 'hotwater',     label: '24h hot water',      group: 'In-room' },
  { id: 'toiletries',   label: 'Toiletries',         group: 'In-room' },

  // Outdoor & View
  { id: 'desertview',   label: 'Desert view',        group: 'Outdoor & View' },
  { id: 'poolview',     label: 'Pool view',          group: 'Outdoor & View' },
  { id: 'gardenview',   label: 'Garden view',        group: 'Outdoor & View' },
  { id: 'mountainview', label: 'Mountain view',      group: 'Outdoor & View' },
  { id: 'privatepool',  label: 'Private pool',       group: 'Outdoor & View' },
  { id: 'bonfire',      label: 'Bonfire area',       group: 'Outdoor & View' },
  { id: 'bbq',          label: 'BBQ',                group: 'Outdoor & View' },
  { id: 'garden',       label: 'Garden',             group: 'Outdoor & View' },
  { id: 'terrace',      label: 'Terrace',            group: 'Outdoor & View' },

  // Property facilities
  { id: 'pool',         label: 'Swimming pool',      group: 'Property facilities' },
  { id: 'gym',          label: 'Gym',                group: 'Property facilities' },
  { id: 'spa',          label: 'Spa / wellness',     group: 'Property facilities' },
  { id: 'restaurant',   label: 'Restaurant',         group: 'Property facilities' },
  { id: 'bar',          label: 'Bar / lounge',       group: 'Property facilities' },
  { id: 'roomservice',  label: 'Room service',       group: 'Property facilities' },
  { id: 'breakfast',    label: 'Breakfast included', group: 'Property facilities' },
  { id: 'kitchenette',  label: 'Kitchenette',        group: 'Property facilities' },

  // Services
  { id: 'parking',      label: 'Free parking',       group: 'Services' },
  { id: 'valet',        label: 'Valet parking',      group: 'Services' },
  { id: 'laundry',      label: 'Laundry',            group: 'Services' },
  { id: 'reception24',  label: '24h reception',      group: 'Services' },
  { id: 'airportshuttle', label: 'Airport pickup',   group: 'Services' },
  { id: 'safari',       label: 'Safari arrangement', group: 'Services' },

  // Policies
  { id: 'petfriendly',  label: 'Pet-friendly',       group: 'Policies' },
  { id: 'wheelchair',   label: 'Wheelchair access',  group: 'Policies' },
  { id: 'smoking',      label: 'Smoking allowed',    group: 'Policies' },
];

export const EXTRAS_DEFAULT = [
  { id: 'breakfast', label: 'Breakfast',       sub: 'Veg buffet',   price: 350,  icon: 'veg' },
  { id: 'safari',    label: 'Desert safari',   sub: 'Per person',   price: 1500, icon: 'sun' },
  { id: 'pickup',    label: 'Station pickup',  sub: 'One-way',      price: 800,  icon: 'arrow' },
  { id: 'bonfire',   label: 'Bonfire & music', sub: 'Per evening',  price: 2500, icon: 'star' },
  { id: 'cake',      label: 'Celebration cake',sub: '1kg',          price: 1200, icon: 'tag' },
];

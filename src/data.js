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
  if (!cats || cats.length === 0) return ROOM_TYPES;
  return cats.map((c, i) => {
    const seed = ROOM_TYPES.find(r => r.id === c.id);
    return {
      id: c.id,
      name: c.name || (seed && seed.name) || 'Room',
      units: typeof c.units === 'number' && c.units > 0 ? c.units : (seed?.units || 1),
      base: typeof c.base === 'number' && c.base >= 0 ? c.base : (seed?.base || 0),
      tag: (seed && seed.tag) || TAG_PALETTE[i % TAG_PALETTE.length],
      amenityIds: Array.isArray(c.amenityIds) ? c.amenityIds : [],
    };
  });
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
  confirmed:  { label: 'Confirmed',   color: 'oklch(58% 0.13 155)', bg: 'oklch(94% 0.05 155)' },
  checkedin:  { label: 'Checked-in',  color: 'oklch(48% 0.14 265)', bg: 'oklch(94% 0.04 265)' },
  checkout:   { label: 'Checked-out', color: 'oklch(55% 0.04 60)',  bg: 'oklch(95% 0.012 60)' },
  tentative:  { label: 'On hold',     color: 'oklch(58% 0.14 75)',  bg: 'oklch(95% 0.05 75)' },
  cancelled:  { label: 'Cancelled',   color: 'oklch(60% 0.04 60)',  bg: 'oklch(94% 0.01 60)' },
};

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
//   3. 12% fallback (matches the historical default).
export function gstRateForCategory(category) {
  if (!category) return 12;
  if (typeof category.gstRate === 'number' && category.gstRate >= 0) return category.gstRate;
  return gstSlabFor(category.base || 0).rate;
}

// Blended GST rate across all rooms in a booking, weighted by tariff.
// Used when the booking spans multiple room categories with different
// slabs (e.g. one Deluxe at 12% + one Pool Cottage at 18%).
export function blendedGstRate(booking, property) {
  if (!booking) return 12;
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
  if (totalWeight === 0) return 12;
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
  return `${startYear % 100}${(startYear + 1) % 100}`.padStart(4, '0');
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
export function ratePlanById(property, id) {
  const all = Array.isArray(property && property.ratePlans) ? property.ratePlans : [];
  return all.find(p => p.id === id) || null;
}
// Default plan: the one a fresh booking gets. Standard plan, always there.
export function defaultRatePlanId() {
  return 'standard';
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

// All issued (non-voided) invoices across the given bookings, in the order they
// were issued. Used by the month-end CA export.
export function listIssuedInvoices(bookings) {
  const all = [];
  for (const b of bookings) {
    for (const inv of (b.invoices || [])) {
      if (inv.voided) continue;
      all.push({ ...inv, bookingId: b.id, guest: b.guest });
    }
  }
  return all.sort((a, b) => a.number.localeCompare(b.number));
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

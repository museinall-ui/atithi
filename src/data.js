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
  mmt:     { label: 'MakeMyTrip',  color: '#EB2026',  short: 'M' },
  goibibo: { label: 'Goibibo',     color: '#F0728F',  short: 'G' },
  booking: { label: 'Booking.com', color: '#003580',  short: 'B' },
  airbnb:  { label: 'Airbnb',      color: '#FF5A5F',  short: 'A' },
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

// GST breakdown for a booking, treating the price as GST-inclusive (12%
// inside the total). Always splits as CGST 6% + SGST 6% — the IGST
// inter-state branch was retired because owners found tracking guest-state
// noise; the CA handles inter-state reporting from the invoice register if
// it's ever relevant. The `interState` field is kept on the return for
// backward compatibility with older callers; it's always false now.
export function getTaxBreakdown(booking, _property) {
  if (!bookingGstApplies(booking)) {
    return { applies: false, gst: 0, cgst: 0, sgst: 0, igst: 0, interState: false };
  }
  const total = booking?.total || 0;
  const gst = Math.round(total * 12 / 112);
  const half = Math.round(gst / 2);
  return { applies: true, gst, cgst: half, sgst: gst - half, igst: 0, interState: false };
}

// Whether this booking should be included in the monthly invoice export to the
// CA. Same logic and field as bookingGstApplies for now — flipping one flips
// the other. Separate function so the call sites read clearly.
export function bookingInvoiceInclude(b) {
  return bookingGstApplies(b);
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

// Compute the meal-plan cost for a booking. Returns 0 when no plan, plan
// is the default "Room only" (price 0), or the plan no longer exists.
export function mealCostFor(booking, property) {
  if (!booking || !booking.mealPlanId) return 0;
  const plan = mealPlanById(property, booking.mealPlanId);
  if (!plan || !plan.price) return 0;
  const guests = bookingGuestCount(booking);
  const nights = booking.nights || 1;
  return plan.price * guests * nights;
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

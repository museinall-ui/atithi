import { supabase } from '../supabase.js';
import { idxToDate } from '../data.js';

// One-shot check: has the owner pasted the anon-RLS migration
// (supabase/migrations/20260605_widget_anon_access.sql) into their
// Supabase project? Runs `property_by_short_code` with a deliberately
// non-matching slug and inspects the result. Three outcomes:
//   - function exists + returned 0 rows → migration is live ✓
//   - function exists + returned N rows → migration is live ✓
//   - function does not exist (Postgres errcode 42883) → not live ✗
//   - any other error (network, timeout) → unknown; we conservatively
//     treat as not-live so the warning banner stays up
//
// Cached at module scope so the Settings screen doesn't re-hit
// Supabase on every render. Invalidate by reloading the page.
let _widgetRlsCheck = null; // null = not yet checked, 'live' / 'missing' once resolved
export async function isWidgetRlsLive() {
  if (_widgetRlsCheck) return _widgetRlsCheck === 'live';
  try {
    const { error } = await supabase.rpc('property_by_short_code', { p_short_code: '__atithi_runtime_check__' });
    if (!error) {
      _widgetRlsCheck = 'live';
      return true;
    }
    // 42883 = undefined_function. Anything else (network, RLS denial,
    // etc.) → we don't know, default to "missing" so the warning
    // stays visible. False negative is safe; false positive isn't.
    if (error.code === '42883' || /does not exist|undefined.*function/i.test(error.message || '')) {
      _widgetRlsCheck = 'missing';
      return false;
    }
    _widgetRlsCheck = 'missing';
    return false;
  } catch {
    _widgetRlsCheck = 'missing';
    return false;
  }
}

// Public booking widget cloud helpers. Both functions are designed
// to work against the anon role — the visitor isn't signed in yet
// (they're a prospective guest landing on hotel.com/book).
//
// The supabase JS client at module scope uses the anon publishable
// key, which is the right role for these calls. The Supabase RLS
// + the `property_by_short_code()` security-definer RPC handle the
// authorization.

// Find a property by its short code (the slug at the end of the
// /book/<slug> URL). Returns null when no property matches — the
// widget renders a "Property not found" state in that case.
export async function loadPropertyBySlug(slug) {
  if (!slug) return null;
  const { data, error } = await supabase.rpc('property_by_short_code', { p_short_code: slug });
  if (error) {
    console.warn('[atithi widget] loadPropertyBySlug failed', error);
    return null;
  }
  if (!Array.isArray(data) || data.length === 0) return null;
  const row = data[0];
  return {
    id: row.id,
    profile: {
      name: row.name || '',
      type: row.type || '',
      city: row.city || '',
      state: row.state || '',
      checkIn: row.check_in || '14:00',
      checkOut: row.check_out || '11:00',
      phone: row.phone || '',
      logoDataUrl: row.logo_data_url || null,
      paymentQrDataUrl: row.payment_qr_data_url || null,
      paymentQrLabel: row.payment_qr_label || '',
      tagline: row.tagline || '',
      photoGallery: Array.isArray(row.photo_gallery) ? row.photo_gallery : [],
      shortCode: row.short_code || '',
      embedButton: row.embed_button || null,
    },
    theme: row.theme || { hue: 38 },
    rules: Array.isArray(row.rules) ? row.rules : [],
    mealPlans: Array.isArray(row.meal_plans) ? row.meal_plans : [],
    defaultMealPlanId: row.default_meal_plan_id || 'ep',
    baseCapacityAdults: row.base_capacity_adults || 2,
    ratePlans: Array.isArray(row.rate_plans) ? row.rate_plans : [],
    weekendRules: row.weekend_rules || { weekendDays: [0, 6], upliftPct: 20 },
    seasons: Array.isArray(row.seasons) ? row.seasons : [],
    channelMarkups: row.channel_markups || {},
    coupons: Array.isArray(row.coupons) ? row.coupons : [],
  };
}

// Load room categories + active bookings for a property by id. Used
// for the widget's availability check on the room-picker step.
export async function loadWidgetInventory(propertyId) {
  if (!propertyId) return { categories: [], bookings: [] };
  const [catsRes, booksRes] = await Promise.all([
    supabase.rpc('room_categories_by_property', { p_property_id: propertyId }),
    supabase.rpc('bookings_by_property_public', { p_property_id: propertyId }),
  ]);
  const categories = (catsRes.data || []).map(r => ({
    id: r.code,
    name: r.name,
    units: r.units,
    base: r.base_rate,
    amenityIds: r.amenity_ids || [],
    extraAdult: r.extra_adult || null,
    extraChild: r.extra_child || null,
    photoDataUrl: r.photo_data_url || null,
  }));
  const bookings = (booksRes.data || []).map(r => {
    // Minimal shape — widget only needs startIdx + nights + room
    // ids for the overlap calculation. Skip the rest.
    const startDateStr = String(r.start_date || '');
    let startIdx = 0;
    if (startDateStr) {
      // Compute idx from the anchor (today). Negative for past dates.
      const d = new Date(startDateStr + 'T00:00:00');
      const today = new Date(); today.setHours(0, 0, 0, 0);
      startIdx = Math.round((d - today) / (24 * 3600 * 1000));
    }
    return {
      id: r.id,
      roomTypeId: r.room_category_code,
      unitIdx: r.unit_idx || 0,
      startIdx,
      nights: r.nights || 1,
      status: r.status,
      roomItems: Array.isArray(r.room_items) ? r.room_items : [],
    };
  });
  return { categories, bookings };
}

// Insert a widget booking via the anon INSERT policy. The RLS check
// requires status='tentative' AND channel='website' so we hardcode
// both. Returns the inserted booking id (from the DB trigger) on
// success, throws on failure (the widget catches + shows an error).
export async function insertWidgetBooking(propertyId, booking) {
  if (!propertyId) throw new Error('No propertyId');
  const startIdx = booking.startIdx || 0;
  const startDate = idxToDate(startIdx);
  const payload = {
    property_id: propertyId,
    room_category_code: booking.roomTypeId,
    unit_idx: booking.unitIdx || 0,
    start_date: startDate,
    nights: booking.nights || 1,
    guest_name: booking.guest || '',
    phone: booking.phone || '',
    email: booking.email || '',
    country: booking.country || 'IN',
    form_c: !!booking.formC,
    guests: booking.guests || '',
    vip: false,
    notes: booking.notes || '',
    status: 'tentative',                  // RLS-required
    channel: 'website',                    // RLS-required
    total: booking.total || 0,
    paid: 0,                               // widget never collects payment up front
    extras: booking.extras || {},
    custom_extras: booking.customExtras || [],
    extra_prices: booking.extraPrices || {},
    room_items: booking.roomItems || [],
    meal_plan_id: booking.mealPlanId || 'ep',
    rate_plan_id: booking.ratePlanId || 'standard',
    events: [{ kind: 'create', text: 'Booked via website widget', time: new Date().toISOString() }],
    coupon_code: booking.couponCode || '',
    discount_amount: booking.discountAmount || 0,
    release_ts: booking.releaseTs || null,
    release_at: booking.releaseAt || null,
    hold_hours: booking.holdHours || null,
    gst_applies: false,
  };
  // Don't chain .select('id').single() — the anon role has INSERT
  // but no SELECT on the bookings table, so the read-after-insert
  // fails RLS even though the insert itself succeeded. We accept
  // that we can't see the DB-trigger-assigned BK-XXXX from the
  // anonymous side; the hotelier sees the real id when the
  // booking lands in their diary a moment later.
  const { error } = await supabase.from('bookings').insert(payload);
  if (error) {
    console.warn('[atithi widget] insertWidgetBooking failed', error);
    throw error;
  }
  // Return null — caller (App.jsx PublicWidgetEntry) generates a
  // friendly "your booking is being created" placeholder for the
  // guest's confirmation screen.
  return null;
}

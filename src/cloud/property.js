import { supabase } from '../supabase.js';

// Cloud <-> local shape conversion.
//
// Cloud schema spreads the property across two tables (properties + a row
// per room_category), and uses snake_case + flat fields. Local code expects
// the legacy nested shape { profile, categories[], rules, amenityIds,
// accountant, customAmenities, invoiceCounters, gstin, theme }. The
// converters keep all the existing screens working unchanged.

// Default meal plans — kept in sync with DEFAULT_PROPERTY.mealPlans in
// App.jsx. Used as a fallback when a cloud row predates the meal_plans
// migration (column missing → undefined → seed defaults so the meal plan
// editor in Settings doesn't render an empty list).
const DEFAULT_MEAL_PLANS = [
  { id: 'ep',  code: 'EP',  label: 'Room only',                       price: 0,    enabled: true },
  { id: 'cp',  code: 'CP',  label: 'Breakfast included',              price: 500,  enabled: true },
  { id: 'map', code: 'MAP', label: 'Breakfast + 1 main meal',         price: 1200, enabled: true },
  { id: 'ap',  code: 'AP',  label: 'All meals (breakfast + 2 main)',  price: 2000, enabled: false },
];

function localToCloudProperty(local) {
  const p = (local && local.profile) || {};
  return {
    name: p.name || '',
    type: p.type || '',
    address: p.address || '',
    city: p.city || '',
    state: p.state || '',
    pincode: p.pincode || '',
    landmark: p.landmark || '',
    map_url: p.mapUrl || '',
    check_in: p.checkIn || '14:00',
    check_out: p.checkOut || '11:00',
    phone: p.phone || '',
    email: p.email || '',
    website: p.website || '',
    payment_qr_data_url: p.paymentQrDataUrl || '',
    payment_qr_label: p.paymentQrLabel || '',
    logo_data_url: p.logoDataUrl || '',
    photo_gallery: Array.isArray(p.photoGallery) ? p.photoGallery : [],
    tagline: p.tagline || '',
    coupons: Array.isArray(local && local.coupons) ? local.coupons : [],
    gstin: (local && local.gstin) || '',
    accountant: (local && local.accountant) || { name: '', email: '', firm: '' },
    theme: (local && local.theme) || { hue: 38 },
    amenity_ids: (local && local.amenityIds) || [],
    custom_amenities: (local && local.customAmenities) || [],
    rules: (local && local.rules) || [],
    invoice_counters: (local && local.invoiceCounters) || {},
    meal_plans: Array.isArray(local && local.mealPlans) && local.mealPlans.length
      ? local.mealPlans
      : DEFAULT_MEAL_PLANS,
    weekend_rules: (local && local.weekendRules) || { weekendDays: [0, 6], upliftPct: 20 },
    seasons: Array.isArray(local && local.seasons) ? local.seasons : [],
    channel_markups: (local && local.channelMarkups) || { direct: 0, mmt: 0, goibibo: 0, booking: 0, agoda: 0, airbnb: 0 },
    // Per-OTA commission % the hotelier loses on each booking. Used in
    // Reports → Take-home card. Defaults mirror DEFAULT_CHANNEL_COMMISSIONS
    // in data.js (kept in sync to avoid drift).
    channel_commissions: (local && local.channelCommissions) || { direct: 0, mmt: 18, goibibo: 15, booking: 15, agoda: 18, airbnb: 3 },
    // Meal plan the calendar rate is treated as already including. Default
    // 'ep' keeps math equivalent to the older "always add on top" model.
    default_meal_plan_id: (local && local.defaultMealPlanId) || 'ep',
    // Adults included in every room rate (typical: 2). Extra adults are
    // charged the per-category extraAdult rate.
    base_capacity_adults: (local && local.baseCapacityAdults) || 2,
    rate_plans: Array.isArray(local && local.ratePlans) ? local.ratePlans : [
      { id: 'standard', label: 'Standard', multiplierPct: 0, cancellation: 'flexible', refundHours: 48, enabled: true },
    ],
  };
}

function cloudToLocalProperty(row, categories) {
  return {
    profile: {
      name: row.name || '',
      type: row.type || '',
      address: row.address || '',
      city: row.city || '',
      state: row.state || '',
      pincode: row.pincode || '',
      landmark: row.landmark || '',
      mapUrl: row.map_url || '',
      checkIn: row.check_in || '14:00',
      checkOut: row.check_out || '11:00',
      phone: row.phone || '',
      email: row.email || '',
      website: row.website || '',
      paymentQrDataUrl: row.payment_qr_data_url || '',
      paymentQrLabel: row.payment_qr_label || '',
      logoDataUrl: row.logo_data_url || '',
      tagline: row.tagline || '',
      photoGallery: Array.isArray(row.photo_gallery) ? row.photo_gallery : [],
    },
    categories: (categories || []).map(c => ({
      id: c.code,
      name: c.name,
      units: c.units,
      base: c.base_rate,
      amenityIds: c.amenity_ids || [],
      // null = auto-pick from CBIC slab; explicit number = override
      gstRate: (c.gst_rate == null) ? null : c.gst_rate,
      // Extra-adult / extra-child surcharge rules: { mode: 'flat'|'pct', value }
      extraAdult: c.extra_adult || null,
      extraChild: c.extra_child || null,
      // Hero image (base64 data URL) shown on the widget room tile +
      // booking voucher. Null when the hotelier hasn't uploaded one.
      photoDataUrl: c.photo_data_url || null,
    })),
    rules: row.rules || [],
    amenityIds: row.amenity_ids || [],
    customAmenities: row.custom_amenities || [],
    invoiceCounters: row.invoice_counters || {},
    accountant: row.accountant || { name: '', email: '', firm: '' },
    gstin: row.gstin || '',
    theme: row.theme || { hue: 38 },
    // Cloud rows predating the meal_plans column come back with undefined;
    // seed defaults so the Settings meal-plan editor isn't empty.
    mealPlans: Array.isArray(row.meal_plans) && row.meal_plans.length
      ? row.meal_plans
      : DEFAULT_MEAL_PLANS.map(p => ({ ...p })),
    weekendRules: row.weekend_rules || { weekendDays: [0, 6], upliftPct: 20 },
    seasons: Array.isArray(row.seasons) ? row.seasons : [],
    channelMarkups: row.channel_markups || { direct: 0, mmt: 0, goibibo: 0, booking: 0, agoda: 0, airbnb: 0 },
    channelCommissions: row.channel_commissions || { direct: 0, mmt: 18, goibibo: 15, booking: 15, agoda: 18, airbnb: 3 },
    defaultMealPlanId: row.default_meal_plan_id || 'ep',
    baseCapacityAdults: row.base_capacity_adults || 2,
    ratePlans: Array.isArray(row.rate_plans) && row.rate_plans.length ? row.rate_plans : [
      { id: 'standard', label: 'Standard', multiplierPct: 0, cancellation: 'flexible', refundHours: 48, enabled: true },
    ],
    coupons: Array.isArray(row.coupons) ? row.coupons : [],
  };
}

// ----------------------------------------------------------------------------
// Public API
// ----------------------------------------------------------------------------

// Returns { id, role, property } for this user's current property, or null
// if they don't have a membership yet (in which case the caller should
// bootstrap one).
export async function loadCurrentProperty(userId) {
  const { data: mems, error: memErr } = await supabase
    .from('memberships')
    .select('property_id, role')
    .eq('user_id', userId)
    .limit(1);
  if (memErr) throw memErr;
  if (!mems || mems.length === 0) return null;

  const propertyId = mems[0].property_id;
  const [propRes, catRes] = await Promise.all([
    supabase.from('properties').select('*').eq('id', propertyId).single(),
    supabase.from('room_categories').select('*').eq('property_id', propertyId).order('sort_order'),
  ]);
  if (propRes.error) throw propRes.error;
  if (catRes.error) throw catRes.error;

  return {
    id: propertyId,
    role: mems[0].role,
    property: cloudToLocalProperty(propRes.data, catRes.data || []),
  };
}

// First-time setup: creates a property + owner membership for the signed-in
// user, seeded from `seedLocalProperty` (typically their existing
// localStorage data so they don't lose customisations on first cloud login).
// Re-uses loadCurrentProperty() at the end so the caller gets the canonical
// post-insert shape (with server-generated timestamps, etc.).
//
// Why we generate the property id client-side: the natural ".insert(...).select()"
// pattern doesn't work for the very first property a user creates. INSERT
// RLS accepts the row (with check (true) for authenticated users), but the
// SELECT-after-INSERT runs against the read policy, which requires the user
// to already be a member of the property. They aren't yet — that's literally
// the next step. So we mint a UUID locally, skip the SELECT, then create the
// membership; from that point on the row is fully accessible.
export async function bootstrapProperty(user, seedLocalProperty) {
  const propertyId = crypto.randomUUID();

  // 1. Insert the property row. No .select() back — see comment above.
  const propData = { id: propertyId, ...localToCloudProperty(seedLocalProperty) };
  const { error: pErr } = await supabase.from('properties').insert(propData);
  if (pErr) throw pErr;

  // 2. Claim ownership via a membership. RLS allows a user to insert their
  //    own membership row (the bootstrapping case). Phase 6 will add an
  //    invitation flow for staff added by the owner.
  const { error: mErr } = await supabase
    .from('memberships')
    .insert({
      user_id: user.id,
      property_id: propertyId,
      role: 'owner',
      accepted_at: new Date().toISOString(),
    });
  if (mErr) throw mErr;

  // 3. Seed room categories. Order is preserved via sort_order.
  const cats = Array.isArray(seedLocalProperty && seedLocalProperty.categories)
    ? seedLocalProperty.categories
    : [];
  if (cats.length) {
    const { error: cErr } = await supabase
      .from('room_categories')
      .insert(cats.map((c, i) => ({
        property_id: propertyId,
        code: c.id,
        name: c.name,
        units: c.units || 1,
        base_rate: c.base || 0,
        amenity_ids: c.amenityIds || [],
        gst_rate: (c.gstRate == null) ? null : c.gstRate,
        extra_adult: c.extraAdult || null,
        extra_child: c.extraChild || null,
        photo_data_url: c.photoDataUrl || null,
        sort_order: i,
      })));
    if (cErr) throw cErr;
  }

  // Now that the membership exists, the SELECT policy passes and the full
  // round-trip works.
  return loadCurrentProperty(user.id);
}

// Persist a property edit. Updates the properties row and reconciles the
// room_categories table: upserts new/changed categories, deletes removed
// ones (matched by `code`).
export async function saveCloudProperty(propertyId, localProperty) {
  const propData = localToCloudProperty(localProperty);
  const { error: pErr } = await supabase
    .from('properties')
    .update(propData)
    .eq('id', propertyId);
  if (pErr) throw pErr;

  const newList = Array.isArray(localProperty && localProperty.categories)
    ? localProperty.categories
    : [];
  const newCodes = new Set(newList.map(c => c.id));

  const { data: existing, error: eErr } = await supabase
    .from('room_categories')
    .select('code')
    .eq('property_id', propertyId);
  if (eErr) throw eErr;

  const toDelete = (existing || []).map(r => r.code).filter(c => !newCodes.has(c));
  if (toDelete.length) {
    const { error: dErr } = await supabase
      .from('room_categories')
      .delete()
      .eq('property_id', propertyId)
      .in('code', toDelete);
    if (dErr) throw dErr;
  }

  if (newList.length) {
    const { error: uErr } = await supabase
      .from('room_categories')
      .upsert(newList.map((c, i) => ({
        property_id: propertyId,
        code: c.id,
        name: c.name,
        units: c.units || 1,
        base_rate: c.base || 0,
        amenity_ids: c.amenityIds || [],
        gst_rate: (c.gstRate == null) ? null : c.gstRate,
        extra_adult: c.extraAdult || null,
        extra_child: c.extraChild || null,
        photo_data_url: c.photoDataUrl || null,
        sort_order: i,
      })), { onConflict: 'property_id,code' });
    if (uErr) throw uErr;
  }
}

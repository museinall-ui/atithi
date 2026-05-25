import { supabase } from '../supabase.js';
import { idxToDate, dateToIdx } from '../data.js';

// Cloud-sync helpers for the three "extra" property-scoped collections that
// were left in localStorage during Chunk 4. Schema tables already exist in
// the initial migration; this module mirrors what cloud/bookings.js does:
// load on sign-in, seed on first-time, per-action upsert/delete wrapped in
// syncCloud() at the call site.
//
//   1. saved_custom_extras  — reusable add-on pool (e.g. "Bonfire dinner")
//   2. rate_overrides       — per-day rate / close-out by room type
//   3. cash_closes          — daily end-of-day cash snapshot
//
// Local shapes (preserved across the boundary so screens don't change):
//   savedCustomExtras: [{id, name, price, unit?}]
//   rateOverrides:     { 'roomTypeId:dayIdx': {rate, closed} }
//   cashCloses:        { 'YYYY-MM-DD': {cash, digital, total, expected, note, closedAt} }

// ----------------------------------------------------------------------------
// saved_custom_extras
// ----------------------------------------------------------------------------

export async function loadSavedExtras(propertyId) {
  const { data, error } = await supabase
    .from('saved_custom_extras')
    .select('*')
    .eq('property_id', propertyId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []).map(r => ({
    id: r.id,
    name: r.name || '',
    price: r.price || 0,
    unit: r.unit || 'per stay',
  }));
}

export async function seedSavedExtras(propertyId, localExtras) {
  if (!localExtras || !localExtras.length) return;
  const rows = localExtras.map(e => ({
    // Honour the local-side id if it's a uuid; otherwise let the DB mint one.
    ...(isUuid(e.id) ? { id: e.id } : {}),
    property_id: propertyId,
    name: e.name || '',
    price: e.price || 0,
    unit: e.unit || 'per stay',
  }));
  const { error } = await supabase.from('saved_custom_extras').insert(rows);
  if (error) throw error;
}

export async function addSavedExtraCloud(propertyId, extra) {
  const row = {
    ...(isUuid(extra.id) ? { id: extra.id } : {}),
    property_id: propertyId,
    name: extra.name || '',
    price: extra.price || 0,
    unit: extra.unit || 'per stay',
  };
  const { data, error } = await supabase
    .from('saved_custom_extras')
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  // Return server-assigned id so the local store can adopt it.
  return { id: data.id, name: data.name, price: data.price || 0, unit: data.unit || 'per stay' };
}

export async function removeSavedExtraCloud(extraId) {
  if (!isUuid(extraId)) return; // local-only id, never made it to cloud
  const { error } = await supabase
    .from('saved_custom_extras')
    .delete()
    .eq('id', extraId);
  if (error) throw error;
}

// Patch an existing saved extra. Pass a local-shape partial — only the
// fields you include are touched on the server.
export async function updateSavedExtraCloud(extraId, patch) {
  if (!isUuid(extraId)) return; // local-only row hasn't been synced yet; the
                                 // diff-sync will pick it up on the next add path
  const row = {};
  if ('name' in patch)  row.name = patch.name || '';
  if ('price' in patch) row.price = patch.price || 0;
  if ('unit' in patch)  row.unit = patch.unit || 'per stay';
  if (Object.keys(row).length === 0) return;
  const { error } = await supabase
    .from('saved_custom_extras')
    .update(row)
    .eq('id', extraId);
  if (error) throw error;
}

// ----------------------------------------------------------------------------
// rate_overrides
// ----------------------------------------------------------------------------

export async function loadRateOverrides(propertyId) {
  const { data, error } = await supabase
    .from('rate_overrides')
    .select('*')
    .eq('property_id', propertyId);
  if (error) throw error;
  const map = {};
  (data || []).forEach(r => {
    const idx = dateToIdx(r.date);
    map[`${r.room_category_code}:${idx}`] = {
      rate: r.rate == null ? null : r.rate,
      closed: !!r.closed_out,
      // Per-unit close-outs (Rates F3): which specific unit indices are
      // out on this date. Empty array = no per-unit close-outs (the
      // whole-type closed flag above is the bigger hammer).
      closedUnits: Array.isArray(r.closed_units) ? r.closed_units : [],
    };
  });
  return map;
}

export async function seedRateOverrides(propertyId, localMap) {
  if (!localMap || typeof localMap !== 'object') return;
  const rows = [];
  for (const key of Object.keys(localMap)) {
    const [roomTypeId, idxStr] = key.split(':');
    const idx = parseInt(idxStr, 10);
    if (!roomTypeId || !isFinite(idx)) continue;
    const v = localMap[key] || {};
    rows.push({
      property_id: propertyId,
      room_category_code: roomTypeId,
      date: idxToDate(idx),
      rate: v.rate == null ? null : v.rate,
      closed_out: !!v.closed,
      closed_units: Array.isArray(v.closedUnits) ? v.closedUnits : [],
    });
  }
  if (!rows.length) return;
  const { error } = await supabase
    .from('rate_overrides')
    .upsert(rows, { onConflict: 'property_id,room_category_code,date' });
  if (error) throw error;
}

// Upsert a single cell. Pass `value=null` to delete the override (open day at
// the base rate). Otherwise pass `{rate, closed, closedUnits}`.
export async function setRateOverrideCloud(propertyId, roomTypeId, dayIdx, value) {
  const date = idxToDate(dayIdx);
  if (value == null) {
    const { error } = await supabase
      .from('rate_overrides')
      .delete()
      .eq('property_id', propertyId)
      .eq('room_category_code', roomTypeId)
      .eq('date', date);
    if (error) throw error;
    return;
  }
  const row = {
    property_id: propertyId,
    room_category_code: roomTypeId,
    date,
    rate: value.rate == null ? null : value.rate,
    closed_out: !!value.closed,
    closed_units: Array.isArray(value.closedUnits) ? value.closedUnits : [],
  };
  const { error } = await supabase
    .from('rate_overrides')
    .upsert(row, { onConflict: 'property_id,room_category_code,date' });
  if (error) throw error;
}

// ----------------------------------------------------------------------------
// cash_closes
// ----------------------------------------------------------------------------

// Sum a per-account accounts array into the legacy cash + digital
// columns for backward-compat. kind === 'cash' adds to cash; anything
// else adds to digital.
function sumAccountsToLegacy(accounts) {
  let cash = 0, digital = 0;
  (accounts || []).forEach(a => {
    const amt = +a.amount || 0;
    if (a.kind === 'cash') cash += amt;
    else digital += amt;
  });
  return { cash, digital };
}

export async function loadCashCloses(propertyId) {
  const { data, error } = await supabase
    .from('cash_closes')
    .select('*')
    .eq('property_id', propertyId);
  if (error) throw error;
  const map = {};
  (data || []).forEach(r => {
    // Prefer the new accounts[] when present; fall back to cash + digital
    // for legacy rows so older closes still render correctly.
    const accounts = Array.isArray(r.accounts) && r.accounts.length ? r.accounts : null;
    const legacyCash = r.cash || 0;
    const legacyDigital = r.digital || 0;
    map[r.date] = {
      // Keep cash + digital top-level for callers that still read them
      // (Dashboard sparkline math, expenses-vs-revenue tie-out, etc).
      cash: accounts ? sumAccountsToLegacy(accounts).cash : legacyCash,
      digital: accounts ? sumAccountsToLegacy(accounts).digital : legacyDigital,
      total: accounts
        ? accounts.reduce((s, a) => s + (+a.amount || 0), 0)
        : (legacyCash + legacyDigital),
      accounts: accounts || [],
      // The local shape used to carry expected + closedAt computed at close
      // time. We don't persist those server-side (expected is re-derivable
      // and closedAt = closed_at). Re-derive on load.
      expected: undefined,
      note: r.note || '',
      closedAt: r.closed_at
        ? new Date(r.closed_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })
        : '',
    };
  });
  return map;
}

export async function seedCashCloses(propertyId, userId, localMap) {
  if (!localMap || typeof localMap !== 'object') return;
  const rows = [];
  for (const date of Object.keys(localMap)) {
    const v = localMap[date] || {};
    const accounts = Array.isArray(v.accounts) ? v.accounts : [];
    const legacy = accounts.length ? sumAccountsToLegacy(accounts) : { cash: v.cash || 0, digital: v.digital || 0 };
    rows.push({
      property_id: propertyId,
      date,
      cash: legacy.cash,
      digital: legacy.digital,
      accounts,
      note: v.note || '',
      closed_by: userId || null,
    });
  }
  if (!rows.length) return;
  const { error } = await supabase
    .from('cash_closes')
    .upsert(rows, { onConflict: 'property_id,date' });
  if (error) throw error;
}

export async function setCashCloseCloud(propertyId, userId, date, value) {
  if (value == null) {
    const { error } = await supabase
      .from('cash_closes')
      .delete()
      .eq('property_id', propertyId)
      .eq('date', date);
    if (error) throw error;
    return;
  }
  const accounts = Array.isArray(value.accounts) ? value.accounts : [];
  const legacy = accounts.length ? sumAccountsToLegacy(accounts) : { cash: value.cash || 0, digital: value.digital || 0 };
  const row = {
    property_id: propertyId,
    date,
    cash: legacy.cash,
    digital: legacy.digital,
    accounts,
    note: value.note || '',
    closed_by: userId || null,
  };
  const { error } = await supabase
    .from('cash_closes')
    .upsert(row, { onConflict: 'property_id,date' });
  if (error) throw error;
}

// ----------------------------------------------------------------------------
// helpers
// ----------------------------------------------------------------------------

function isUuid(s) {
  return typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

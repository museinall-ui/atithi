import { supabase } from '../supabase.js';

// ----------------------------------------------------------------------------
// Date <-> day-index conversion
//
// The UI thinks in day indexes (0 = May 4 2026 — the seed anchor inside
// DAYS in data.js). The cloud stores real DATE values. Keep the anchor
// stable so existing screens stay untouched; later phases can switch the
// anchor to "today" once we're confident.
// ----------------------------------------------------------------------------

const DEMO_ANCHOR = new Date(2026, 4, 4);

export function idxToDate(idx) {
  const d = new Date(DEMO_ANCHOR);
  d.setDate(d.getDate() + (idx || 0));
  return d.toISOString().slice(0, 10);
}

export function dateToIdx(dateStr) {
  if (!dateStr) return 0;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 0;
  return Math.round((d - DEMO_ANCHOR) / (24 * 3600 * 1000));
}

// ----------------------------------------------------------------------------
// Shape converters
// ----------------------------------------------------------------------------

function cloudBookingToLocal(row, payments, invoices) {
  return {
    id: row.id,
    roomTypeId: row.room_category_code,
    unitIdx: row.unit_idx,
    startIdx: dateToIdx(row.start_date),
    nights: row.nights,
    guest: row.guest_name || '',
    phone: row.phone || '',
    country: row.country || 'IN',
    formC: row.form_c,
    guests: row.guests || '',
    vip: !!row.vip,
    notes: row.notes || '',
    status: row.status,
    channel: row.channel || 'direct',
    total: row.total || 0,
    paid: row.paid || 0,
    gstApplies: row.gst_applies,                   // boolean or null (null = channel default)
    state: row.guest_state || '',
    extras: row.extras || {},
    customExtras: row.custom_extras || [],
    extraPrices: row.extra_prices || {},
    roomItems: row.room_items || [],
    releaseTs: row.release_ts ? Number(row.release_ts) : undefined,
    releaseAt: row.release_at || undefined,
    holdHours: row.hold_hours || undefined,
    autoReleased: !!row.auto_released,
    payments: (payments || []).map(p => ({
      id: p.id,
      kind: p.kind,
      method: p.method || '',
      amount: p.amount || 0,
      note: p.note || '',
      date: p.created_at,
    })),
    invoices: (invoices || []).map(i => ({
      id: i.id,
      number: i.number,
      fy: i.fy,
      date: i.issued_at,
      amount: i.amount || 0,
      recipient: i.recipient || { name: '', gstin: '', address: '' },
      items: i.items,
      note: i.note || '',
      voided: !!i.voided,
    })),
  };
}

function localBookingToCloud(b, propertyId, userId) {
  return {
    id: b.id,
    property_id: propertyId,
    room_category_code: b.roomTypeId,
    unit_idx: b.unitIdx || 0,
    start_date: idxToDate(b.startIdx),
    nights: b.nights || 1,
    guest_name: b.guest || '',
    phone: b.phone || '',
    country: b.country || 'IN',
    form_c: !!b.formC,
    guests: b.guests || '',
    vip: !!b.vip,
    notes: b.notes || '',
    status: b.status || 'confirmed',
    channel: b.channel || 'direct',
    total: b.total || 0,
    paid: b.paid || 0,
    gst_applies: typeof b.gstApplies === 'boolean' ? b.gstApplies : null,
    guest_state: b.state || '',
    extras: b.extras || {},
    custom_extras: b.customExtras || [],
    extra_prices: b.extraPrices || {},
    room_items: b.roomItems || [],
    release_ts: b.releaseTs || null,
    release_at: b.releaseAt || null,
    hold_hours: b.holdHours || null,
    auto_released: !!b.autoReleased,
    created_by: userId || null,
  };
}

// Translate a local-shape partial booking patch into the cloud column names.
// Only columns present in `patch` are included so we don't accidentally null
// out fields the caller didn't touch.
function patchLocalToCloud(patch) {
  const out = {};
  const set = (key, val) => { out[key] = val; };
  if ('roomTypeId' in patch)   set('room_category_code', patch.roomTypeId);
  if ('unitIdx' in patch)      set('unit_idx', patch.unitIdx || 0);
  if ('startIdx' in patch)     set('start_date', idxToDate(patch.startIdx));
  if ('nights' in patch)       set('nights', patch.nights || 1);
  if ('guest' in patch)        set('guest_name', patch.guest || '');
  if ('phone' in patch)        set('phone', patch.phone || '');
  if ('country' in patch)      set('country', patch.country || 'IN');
  if ('formC' in patch)        set('form_c', !!patch.formC);
  if ('guests' in patch)       set('guests', patch.guests || '');
  if ('vip' in patch)          set('vip', !!patch.vip);
  if ('notes' in patch)        set('notes', patch.notes || '');
  if ('status' in patch)       set('status', patch.status);
  if ('channel' in patch)      set('channel', patch.channel || 'direct');
  if ('total' in patch)        set('total', patch.total || 0);
  if ('paid' in patch)         set('paid', patch.paid || 0);
  if ('gstApplies' in patch)   set('gst_applies', typeof patch.gstApplies === 'boolean' ? patch.gstApplies : null);
  if ('state' in patch)        set('guest_state', patch.state || '');
  if ('extras' in patch)       set('extras', patch.extras || {});
  if ('customExtras' in patch) set('custom_extras', patch.customExtras || []);
  if ('extraPrices' in patch)  set('extra_prices', patch.extraPrices || {});
  if ('roomItems' in patch)    set('room_items', patch.roomItems || []);
  if ('releaseTs' in patch)    set('release_ts', patch.releaseTs || null);
  if ('releaseAt' in patch)    set('release_at', patch.releaseAt || null);
  if ('holdHours' in patch)    set('hold_hours', patch.holdHours || null);
  if ('autoReleased' in patch) set('auto_released', !!patch.autoReleased);
  return out;
}

// ----------------------------------------------------------------------------
// Public API — reads
// ----------------------------------------------------------------------------

// Fetch all bookings for a property plus their payments and invoices.
// Returns an array in local shape, sorted by start_date.
export async function loadBookings(propertyId) {
  const { data: bookings, error: bErr } = await supabase
    .from('bookings')
    .select('*')
    .eq('property_id', propertyId)
    .order('start_date', { ascending: true });
  if (bErr) throw bErr;
  if (!bookings || !bookings.length) return [];

  const ids = bookings.map(b => b.id);
  const [paysRes, invsRes] = await Promise.all([
    supabase.from('payments').select('*').in('booking_id', ids).order('created_at'),
    supabase.from('invoices').select('*').in('booking_id', ids).order('seq'),
  ]);
  if (paysRes.error) throw paysRes.error;
  if (invsRes.error) throw invsRes.error;

  const paysByBk = {};
  (paysRes.data || []).forEach(p => {
    (paysByBk[p.booking_id] = paysByBk[p.booking_id] || []).push(p);
  });
  const invsByBk = {};
  (invsRes.data || []).forEach(i => {
    (invsByBk[i.booking_id] = invsByBk[i.booking_id] || []).push(i);
  });

  return bookings.map(b => cloudBookingToLocal(b, paysByBk[b.id] || [], invsByBk[b.id] || []));
}

// ----------------------------------------------------------------------------
// Public API — first-time seed (migration helper)
// ----------------------------------------------------------------------------

// Bulk-insert an array of local-shape bookings + their embedded payments and
// invoices into the cloud. Use only when cloud bookings are empty (first
// sign-in after Chunk 4 lands, or fresh account bootstrap).
//
// Invoice numbers are preserved verbatim — we bypass issue_invoice() here
// because the seed already has the gap-free numbering baked in. Property's
// invoice_counters carries the next available seq.
export async function seedBookings(propertyId, userId, localBookings) {
  if (!localBookings || !localBookings.length) return;

  const bookingRows = localBookings.map(b => localBookingToCloud(b, propertyId, userId));
  const { error: bErr } = await supabase.from('bookings').insert(bookingRows);
  if (bErr) throw bErr;

  const paymentRows = [];
  const invoiceRows = [];
  localBookings.forEach(b => {
    (b.payments || []).forEach(p => {
      paymentRows.push({
        booking_id: b.id,
        property_id: propertyId,
        kind: p.kind === 'refund' || p.kind === 'credit' || p.kind === 'credit_note' ? p.kind : 'payment',
        method: p.method || '',
        amount: p.amount || 0,
        note: p.note || '',
        created_by: userId || null,
      });
    });
    (b.invoices || []).forEach(i => {
      const seqFromNumber = parseInt(String(i.number || '').split('-').pop(), 10);
      invoiceRows.push({
        booking_id: b.id,
        property_id: propertyId,
        number: i.number,
        fy: i.fy,
        seq: isFinite(seqFromNumber) ? seqFromNumber : 1,
        amount: i.amount || 0,
        recipient: i.recipient || { name: '', gstin: '', address: '' },
        items: i.items || null,
        note: i.note || '',
        voided: !!i.voided,
      });
    });
  });

  if (paymentRows.length) {
    const { error: pErr } = await supabase.from('payments').insert(paymentRows);
    if (pErr) throw pErr;
  }
  if (invoiceRows.length) {
    const { error: iErr } = await supabase.from('invoices').insert(invoiceRows);
    if (iErr) throw iErr;
  }
}

// ----------------------------------------------------------------------------
// Public API — per-action writes
// ----------------------------------------------------------------------------

// Insert a new booking. The DB trigger fills in the id (BK-XXXX) if we
// don't supply one. We .select() the inserted row back to return the
// server-assigned id and any defaulted fields. RLS allows the SELECT because
// the user is already a member of this property by booking-create time.
export async function createBookingCloud(propertyId, userId, booking) {
  const row = localBookingToCloud(booking, propertyId, userId);
  if (!row.id) delete row.id;  // let the trigger pick a fresh sequence value
  const { data, error } = await supabase
    .from('bookings')
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  return cloudBookingToLocal(data, [], []);
}

// Patch an existing booking. Pass a local-shape partial object; only the
// fields you include are touched on the server.
export async function updateBookingCloud(bookingId, patch) {
  const cloudPatch = patchLocalToCloud(patch);
  if (Object.keys(cloudPatch).length === 0) return;
  const { error } = await supabase
    .from('bookings')
    .update(cloudPatch)
    .eq('id', bookingId);
  if (error) throw error;
}

// Append a payment row and resync the booking's paid total + status in the
// same call. The caller computes the new values locally (matching the
// existing UI logic) and passes them in.
export async function addPaymentCloud({ bookingId, propertyId, userId, entry, newPaid, newStatus, clearReleaseFields }) {
  const { error: pErr } = await supabase.from('payments').insert({
    booking_id: bookingId,
    property_id: propertyId,
    kind: entry.kind === 'refund' || entry.kind === 'credit' || entry.kind === 'credit_note' ? entry.kind : 'payment',
    method: entry.method || '',
    amount: entry.amount || 0,
    note: entry.note || '',
    created_by: userId || null,
  });
  if (pErr) throw pErr;

  const updates = { paid: newPaid };
  if (newStatus) updates.status = newStatus;
  if (clearReleaseFields) {
    updates.release_ts = null;
    updates.release_at = null;
  }
  const { error: bErr } = await supabase
    .from('bookings')
    .update(updates)
    .eq('id', bookingId);
  if (bErr) throw bErr;
}

// Issue one tax invoice atomically via the stored procedure. Returns the
// new invoice row in local shape (the caller appends it to the booking's
// local invoices array).
export async function issueInvoiceCloud({ bookingId, fy, amount, recipient, items, note }) {
  const { data, error } = await supabase.rpc('issue_invoice', {
    p_booking_id: bookingId,
    p_fy: fy,
    p_amount: amount,
    p_recipient: recipient,
    p_items: items || null,
    p_note: note || '',
  });
  if (error) throw error;
  // The stored proc returns one invoices row.
  return {
    id: data.id,
    number: data.number,
    fy: data.fy,
    date: data.issued_at,
    amount: data.amount || 0,
    recipient: data.recipient || { name: '', gstin: '', address: '' },
    items: data.items,
    note: data.note || '',
    voided: !!data.voided,
  };
}

// Mark an invoice voided. GST law: the number stays reserved (we never
// delete invoice rows).
export async function voidInvoiceCloud(invoiceId) {
  const { error } = await supabase
    .from('invoices')
    .update({ voided: true })
    .eq('id', invoiceId);
  if (error) throw error;
}

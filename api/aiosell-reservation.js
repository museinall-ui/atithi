// Vercel serverless function — INBOUND reservation webhook from AIOSELL.
//
// AIOSELL POSTs here whenever an OTA booking is made / modified / cancelled (one
// shape, keyed by `action`). We validate it's really AIOSELL (HTTP Basic Auth,
// per their spec), find the right hotel by its AIOSELL `hotelCode`, translate the
// reservation into an AtithiBook booking, and write it so it lands on that
// hotelier's Diary automatically. We host this URL and share it with AIOSELL:
//
//     https://atithi-seven.vercel.app/api/aiosell-reservation
//
// Security: AIOSELL sends Basic Auth credentials WE define (a shared secret).
// We compare them in constant time and reject (401) on mismatch. Cross-tenant
// reads/writes use the Supabase SERVICE ROLE key (a booking can belong to any
// hotel, so per-user RLS would hide it). Both are server-only secrets.
//
// Owner setup (one-time, before sharing the webhook URL with AIOSELL):
//   1. Pick a username + a long random password for the webhook.
//   2. Vercel → Settings → Environment Variables, add:
//        AIOSELL_WEBHOOK_USER = (your chosen username)
//        AIOSELL_WEBHOOK_PASS = (your chosen long random password)
//      (SUPABASE_SERVICE_ROLE_KEY is already set for push notifications.)
//   3. Redeploy, then give AIOSELL the URL above + those two values so their
//      system authenticates to us.
//   4. Run 20260622_aiosell_reservation_ids.sql in Supabase so modify/cancel can
//      reconcile to the original booking (a plain `book` lands even without it).
//
// Until the webhook credentials are set this returns 503 and processes nothing,
// so an unconfigured deployment can't have bookings injected into it.

import crypto from 'crypto';

const SUPABASE_URL = 'https://vaerzwmglfwslvqqcyhx.supabase.co';

// AIOSELL OTA name -> AtithiBook internal channel id (mirrors src/cloud/aiosell.js).
const CHANNEL_IN = {
  bookingcom: 'booking', booking: 'booking',
  makemytrip: 'mmt', mmt: 'mmt',
  goibibo: 'goibibo', agoda: 'agoda', airbnb: 'airbnb',
  expedia: 'expedia', cleartrip: 'cleartrip', ctrip: 'ctrip',
};
function mapChannel(name) {
  const k = String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return CHANNEL_IN[k] || k || 'direct';
}

function safeEqual(a, b) {
  const ba = Buffer.from(String(a)), bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

// Returns { configured, ok }. configured=false => creds not set (caller 503s).
function checkWebhookAuth(req) {
  const user = process.env.AIOSELL_WEBHOOK_USER, pass = process.env.AIOSELL_WEBHOOK_PASS;
  if (!user || !pass) return { configured: false, ok: false };
  const m = /^Basic\s+(.+)$/i.exec(req.headers.authorization || '');
  if (!m) return { configured: true, ok: false };
  let decoded = '';
  try { decoded = Buffer.from(m[1], 'base64').toString('utf8'); } catch { return { configured: true, ok: false }; }
  const i = decoded.indexOf(':');
  if (i < 0) return { configured: true, ok: false };
  const ok = safeEqual(decoded.slice(0, i), user) && safeEqual(decoded.slice(i + 1), pass);
  return { configured: true, ok };
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + (n || 0));
  return d.toISOString().slice(0, 10);
}
function nightsBetween(checkin, checkout) {
  const a = new Date(checkin + 'T00:00:00Z'), b = new Date(checkout + 'T00:00:00Z');
  const n = Math.round((b - a) / 86400000);
  return n > 0 ? n : 1;
}

// Build an AtithiBook cloud booking row from an AIOSELL reservation payload +
// the hotel's stored mapping ({ hotelCode, rooms: { [ourRoomTypeId]:{roomCode} } }).
function buildRow(payload, propertyId, mapping) {
  const roomsCfg = (mapping && mapping.rooms) || {};
  const reverse = {};               // aiosell roomCode -> our roomTypeId
  Object.keys(roomsCfg).forEach(rtId => {
    const rc = roomsCfg[rtId] && roomsCfg[rtId].roomCode;
    if (rc) reverse[rc] = rtId;
  });

  const apiRooms = Array.isArray(payload.rooms) ? payload.rooms : [];
  const roomItems = apiRooms.map(r => {
    const occ = r.occupancy || {};
    const nightRates = Array.isArray(r.prices) ? r.prices.map(x => Math.round(x.sellRate || 0)) : [];
    const vary = nightRates.length > 1 && nightRates.some(n => n !== nightRates[0]);
    return {
      roomTypeId: reverse[r.roomCode] || r.roomCode,
      adults: occ.adults || 1,
      children: occ.children || 0,
      rate: nightRates.length ? Math.round(nightRates.reduce((s, n) => s + n, 0) / nightRates.length) : 0,
      perNight: vary,
      nightRates: vary ? nightRates : undefined,
    };
  });
  const primaryType = roomItems.length
    ? roomItems[0].roomTypeId
    : (reverse[(apiRooms[0] || {}).roomCode] || (apiRooms[0] || {}).roomCode || '');

  const amount = payload.amount || {};
  const total = Math.round(amount.amountAfterTax || 0);
  const paid = payload.pah ? 0 : total;   // pah=true => collect at hotel; false => prepaid

  const guest = payload.guest || {};
  const guestName = [guest.firstName, guest.lastName].filter(Boolean).join(' ').trim() || 'OTA Guest';
  const addr = guest.address || {};
  const adults = roomItems.reduce((s, r) => s + (r.adults || 0), 0) || 1;
  const children = roomItems.reduce((s, r) => s + (r.children || 0), 0);
  const cc = String(addr.country || '').trim().toLowerCase();
  const country = (!cc || cc === 'india' || cc === 'in') ? 'IN' : String(addr.country).trim();
  const channel = mapChannel(payload.channel);

  return {
    property_id: propertyId,
    room_category_code: primaryType,
    unit_idx: 0,                          // overwritten by the free-unit pick
    start_date: payload.checkin,
    nights: nightsBetween(payload.checkin, payload.checkout),
    guest_name: guestName,
    phone: guest.phone || '',
    email: guest.email || '',
    country,
    form_c: country !== 'IN',
    guests: `${adults}A${children ? ' ' + children + 'C' : ''}`,
    status: 'confirmed',                  // an OTA reservation is a confirmed booking
    channel,
    total,
    paid,
    notes: payload.specialRequests || '',
    room_items: roomItems,
    ext_ota_id: String(payload.bookingId || ''),
    ext_channel: channel,
  };
}

// Lowest free physical unit of a room type over [startDate, startDate+nights),
// so an OTA booking doesn't blindly stack on unit 0. Best-effort; falls back to 0.
async function pickUnit(sb, propertyId, roomCode, startDate, nights, excludeId, knownUnits) {
  let units = (knownUnits != null && knownUnits > 0) ? knownUnits : 1;
  if (knownUnits == null) {
    try {
      const cr = await fetch(`${SUPABASE_URL}/rest/v1/room_categories?property_id=eq.${encodeURIComponent(propertyId)}&code=eq.${encodeURIComponent(roomCode)}&select=units&limit=1`, { headers: sb });
      if (cr.ok) { const a = await cr.json(); if (a && a[0] && a[0].units) units = a[0].units; }
    } catch { /* default 1 */ }
  }
  const end = addDays(startDate, nights);
  const used = new Set();
  try {
    const br = await fetch(`${SUPABASE_URL}/rest/v1/bookings?property_id=eq.${encodeURIComponent(propertyId)}&room_category_code=eq.${encodeURIComponent(roomCode)}&status=neq.cancelled&select=id,unit_idx,start_date,nights`, { headers: sb });
    if (br.ok) {
      const arr = await br.json();
      (arr || []).forEach(b => {
        if (excludeId && b.id === excludeId) return;
        const bEnd = addDays(b.start_date, b.nights || 1);
        if (startDate < bEnd && end > b.start_date) used.add(b.unit_idx || 0);   // ranges overlap
      });
    }
  } catch { /* ignore */ }
  for (let u = 0; u < units; u++) if (!used.has(u)) return u;
  return 0;
}

const isMissingExtCol = (txt) => /ext_ota_id|ext_channel/.test(txt || '') && /(column|schema cache|does not exist)/i.test(txt || '');

// After a new OTA booking lands: (1) write a payments-ledger row for the prepaid
// amount so Reports' collection-date P&L counts it (booking.paid alone isn't in
// the ledger), and (2) fire the same best-effort push alert website bookings get.
// Both are best-effort — they never fail the webhook.
async function recordOtaPaymentAndNotify(sb, req, propertyId, bookingId, row) {
  if (bookingId && (row.paid || 0) > 0) {
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/payments`, {
        method: 'POST', headers: { ...sb, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ booking_id: bookingId, property_id: propertyId, kind: 'payment', method: 'ota', amount: row.paid, note: 'OTA prepaid (' + (row.ext_channel || row.channel || 'ota') + ')' }),
      });
    } catch { /* best-effort */ }
  }
  try {
    const host = req.headers.host;
    if (host) {
      const proto = req.headers['x-forwarded-proto'] || 'https';
      await fetch(`${proto}://${host}/api/notify-booking`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ propertyId }),
      });
    }
  } catch { /* best-effort */ }
}

// On a modify, reconcile the prepaid OTA ledger row to the NEW amount so Reports'
// cash-basis P&L (which sums payments[], not booking.paid) stays in step: drop any
// prior 'ota' row for this booking, then write the current prepaid amount if any.
async function reconcileOtaPayment(sb, propertyId, bookingId, paid) {
  if (!bookingId) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/payments?booking_id=eq.${encodeURIComponent(bookingId)}&method=eq.ota`, {
      method: 'DELETE', headers: { ...sb, Prefer: 'return=minimal' },
    });
  } catch { /* best-effort */ }
  if ((paid || 0) > 0) {
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/payments`, {
        method: 'POST', headers: { ...sb, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ booking_id: bookingId, property_id: propertyId, kind: 'payment', method: 'ota', amount: paid, note: 'OTA prepaid (updated)' }),
      });
    } catch { /* best-effort */ }
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, message: 'POST only' });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return res.status(503).json({ success: false, message: 'Webhook not configured (service-role key missing).', code: 'no_service_role' });
  }

  const body = req.body || {};
  const action = String(body.action || 'book').toLowerCase();
  const hotelCode = body.hotelCode;
  const bookingId = body.bookingId != null ? String(body.bookingId) : '';
  if (!hotelCode || !bookingId) {
    return res.status(400).json({ success: false, message: 'Missing hotelCode or bookingId' });
  }

  // Auth. AIOSELL's PRODUCTION webhook sends Basic Auth — a shared secret we set
  // via AIOSELL_WEBHOOK_USER / AIOSELL_WEBHOOK_PASS. But AIOSELL's PRE-ONBOARDING
  // "Webhook Tester" on their docs site sends NO Authorization header at all
  // (verified live: the only marker is user-agent AiosellDocsWebhookTester/1.0),
  // because the webhook credentials don't exist until onboarding. So we let the
  // RESERVED test hotelCode 'sandbox-pms' through WITHOUT auth — but ONLY while no
  // production credentials are configured. As soon as real creds are set (at
  // onboarding) every request must authenticate (sandbox included), and a real
  // hotelCode ALWAYS requires it. This sandbox path self-disables once you go live.
  const isSandbox = hotelCode === 'sandbox-pms';
  const auth = checkWebhookAuth(req);
  if (auth.configured) {
    if (!auth.ok) return res.status(401).json({ success: false, message: 'Unauthorized' });
  } else if (!isSandbox) {
    return res.status(503).json({ success: false, message: 'Webhook not configured. Set AIOSELL_WEBHOOK_USER / AIOSELL_WEBHOOK_PASS in Vercel.', code: 'no_webhook_auth' });
  }

  const sb = { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey, Accept: 'application/json' };

  try {
    // 1) Find the property whose stored AIOSELL hotelCode matches. Try an indexed
    //    nested-jsonb filter first (scales to many hotels); fall back to a full
    //    scan + JS match if that query shape isn't supported / returns nothing.
    let match = null;
    try {
      const fr = await fetch(`${SUPABASE_URL}/rest/v1/properties?select=id,accountant&accountant->aiosell->>hotelCode=eq.${encodeURIComponent(hotelCode)}&limit=1`, { headers: sb });
      if (fr.ok) { const rows = await fr.json(); if (Array.isArray(rows) && rows[0]) match = rows[0]; }
    } catch { /* fall through to scan */ }
    if (!match) {
      const pr = await fetch(`${SUPABASE_URL}/rest/v1/properties?select=id,accountant`, { headers: sb });
      if (!pr.ok) return res.status(502).json({ success: false, message: 'Property lookup failed' });
      const props = await pr.json();
      match = (props || []).find(p => p.accountant && p.accountant.aiosell && p.accountant.aiosell.hotelCode === hotelCode) || null;
    }
    if (!match) return res.status(200).json({ success: false, message: `Unknown hotelCode: ${hotelCode}` });
    const propertyId = match.id;
    const mapping = match.accountant.aiosell;

    // 2) Look up an existing booking for this OTA id (idempotency + modify/cancel).
    let existing = null, extColMissing = false;
    {
      const er = await fetch(`${SUPABASE_URL}/rest/v1/bookings?property_id=eq.${encodeURIComponent(propertyId)}&ext_ota_id=eq.${encodeURIComponent(bookingId)}&select=id,status&limit=1`, { headers: sb });
      if (er.ok) { const arr = await er.json(); existing = (arr && arr[0]) || null; }
      else { extColMissing = isMissingExtCol(await er.text()); }
    }

    // 3) Cancel — flip the matched booking to cancelled.
    if (action === 'cancel') {
      if (!existing) return res.status(200).json({ success: true, message: 'Cancel: no matching booking (nothing to do).' });
      const ur = await fetch(`${SUPABASE_URL}/rest/v1/bookings?id=eq.${encodeURIComponent(existing.id)}`, {
        method: 'PATCH', headers: { ...sb, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ status: 'cancelled' }),
      });
      if (!ur.ok) return res.status(502).json({ success: false, message: 'Cancel update failed' });
      return res.status(200).json({ success: true, message: 'Reservation Cancelled Successfully' });
    }

    // 4) Book or modify. modify = full-state replace (spec), so we build a fresh
    //    row either way and either UPDATE the existing booking or INSERT a new one.
    const row = buildRow(body, propertyId, mapping);
    if (extColMissing) { delete row.ext_ota_id; delete row.ext_channel; }

    // Validate the room against the hotel's real categories. If AIOSELL sent a
    // room code we haven't mapped, don't orphan the booking (it'd be invisible on
    // the Diary) — drop it into the first category and flag the original code in
    // the notes so the hotelier + we can fix the mapping.
    let categories = [];
    for (let attempt = 0; attempt < 2 && categories.length === 0; attempt++) {
      try {
        const cr = await fetch(`${SUPABASE_URL}/rest/v1/room_categories?property_id=eq.${encodeURIComponent(propertyId)}&select=code,units&order=sort_order`, { headers: sb });
        if (cr.ok) categories = await cr.json();
      } catch { /* retry once — a transient blip must not reject the booking */ }
    }
    // If we genuinely couldn't load the hotel's categories (transient DB / RLS
    // blip), do NOT proceed — an unmapped/raw OTA room code would otherwise be
    // inserted verbatim and violate the room_category_code foreign key (a dirty
    // 500). Return a clean RETRYABLE error so AIOSELL re-delivers; once the blip
    // clears the booking lands normally. During certification the cert property's
    // categories always load, so this never fires there.
    if (!Array.isArray(categories) || categories.length === 0) {
      return res.status(503).json({ success: false, message: 'Room validation temporarily unavailable — please retry.' });
    }
    const validCodes = new Set((categories || []).map(c => c.code));
    if (categories.length && !validCodes.has(row.room_category_code)) {
      const original = row.room_category_code;
      row.room_category_code = categories[0].code;
      if (Array.isArray(row.room_items) && row.room_items[0]) row.room_items[0].roomTypeId = categories[0].code;
      row.notes = `[OTA room "${original}" not mapped — please check] ${row.notes || ''}`.trim();
    }
    const unitsForRoom = ((categories.find(c => c.code === row.room_category_code) || {}).units) || 1;

    if (existing) {
      const { property_id, ...patch } = row;                 // never reassign the property
      patch.unit_idx = await pickUnit(sb, propertyId, row.room_category_code, row.start_date, row.nights, existing.id, unitsForRoom);
      const ur = await fetch(`${SUPABASE_URL}/rest/v1/bookings?id=eq.${encodeURIComponent(existing.id)}`, {
        method: 'PATCH', headers: { ...sb, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify(patch),
      });
      if (!ur.ok) return res.status(502).json({ success: false, message: 'Update failed', detail: (await ur.text()).slice(0, 200) });
      await reconcileOtaPayment(sb, propertyId, existing.id, row.paid);
      return res.status(200).json({ success: true, message: 'Reservation Updated Successfully' });
    }

    // Insert new — the DB trigger assigns the BK-XXXX id.
    row.unit_idx = await pickUnit(sb, propertyId, row.room_category_code, row.start_date, row.nights, null, unitsForRoom);
    const doInsert = (r) => fetch(`${SUPABASE_URL}/rest/v1/bookings`, {
      method: 'POST', headers: { ...sb, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify(r),
    });
    let ir = await doInsert(row);
    let note;
    if (!ir.ok) {
      const txt = await ir.text();
      if (isMissingExtCol(txt)) {       // migration not pasted yet — land it without the ext id
        const { ext_ota_id, ext_channel, ...stripped } = row;
        ir = await doInsert(stripped);
        if (!ir.ok) return res.status(502).json({ success: false, message: 'Insert failed', detail: (await ir.text()).slice(0, 200) });
        note = 'stored without OTA id — run migration 20260622 to enable modify/cancel';
      } else if (/duplicate key|23505|unique constraint/i.test(txt)) {
        // A concurrent delivery of the same reservation inserted first (the
        // partial unique index won the race). Re-find that row and UPDATE it,
        // instead of creating a second booking. Idempotent recovery.
        const er2 = await fetch(`${SUPABASE_URL}/rest/v1/bookings?property_id=eq.${encodeURIComponent(propertyId)}&ext_ota_id=eq.${encodeURIComponent(bookingId)}&select=id&limit=1`, { headers: sb });
        const arr2 = er2.ok ? await er2.json() : [];
        const dupId = arr2 && arr2[0] && arr2[0].id;
        if (dupId) {
          const { property_id, ...patch } = row;
          patch.unit_idx = await pickUnit(sb, propertyId, row.room_category_code, row.start_date, row.nights, dupId, unitsForRoom);
          await fetch(`${SUPABASE_URL}/rest/v1/bookings?id=eq.${encodeURIComponent(dupId)}`, { method: 'PATCH', headers: { ...sb, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(patch) });
          await reconcileOtaPayment(sb, propertyId, dupId, row.paid);
          return res.status(200).json({ success: true, message: 'Reservation Updated Successfully', id: dupId });
        }
        return res.status(200).json({ success: true, message: 'Duplicate ignored (already recorded)' });
      } else {
        return res.status(502).json({ success: false, message: 'Insert failed', detail: txt.slice(0, 200) });
      }
    }
    const ins = await ir.json();
    const newId = (ins && ins[0] && ins[0].id) || null;
    await recordOtaPaymentAndNotify(sb, req, propertyId, newId, row);
    return res.status(200).json({ success: true, message: 'Reservation Created Successfully', id: newId, ...(note ? { note } : {}) });
  } catch (e) {
    return res.status(500).json({ success: false, message: 'Server error', detail: String(e?.message || e) });
  }
}

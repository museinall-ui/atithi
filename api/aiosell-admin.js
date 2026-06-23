// Vercel serverless — OPERATOR (AtithiBook staff) admin endpoint for the AIOSELL
// channel manager. AtithiBook is the SERVICE PROVIDER: we set up each hotel's OTA
// connection, so WE need a cross-hotel view of what's mapped, what isn't, and the
// platform connection status — none of which a hotelier ever sees.
//
// This endpoint is NOT a hotelier endpoint. It is gated to an admin email
// allowlist and uses the Supabase SERVICE ROLE key to read/write across all
// properties (bypassing per-tenant RLS, which would otherwise hide other hotels).
//
// Auth chain: Supabase access token (Bearer) -> resolve the caller's email ->
// the email must be in ADMIN_EMAILS (env, comma-separated; falls back to the
// owner). Anyone else gets 403 and sees nothing.
//
// Actions (POST body { action, ... }):
//   - 'list'        -> { ok, platformConnected, hotels: [{ id, name, hotelCode,
//                        rooms:[{roomTypeId,name,roomCode,rateplanCode}],
//                        mappedCount, totalRooms, status }] }
//   - 'setMapping'  -> body { propertyId, hotelCode, rooms } writes
//                        accountant.aiosell (merged, preserving other accountant
//                        fields). Returns { ok }.
//
// Owner setup: needs SUPABASE_SERVICE_ROLE_KEY (already used by notify-booking.js).
// Optionally set ADMIN_EMAILS = "you@x.com,teammate@y.com" in Vercel.

const SUPABASE_URL = 'https://vaerzwmglfwslvqqcyhx.supabase.co';
const SUPABASE_ANON = 'sb_publishable_q-vI9SlNncTWlCr3rhuS8A_umNHfj1V';
const DEFAULT_ADMINS = ['museinall@gmail.com'];

function adminEmails() {
  const env = (process.env.ADMIN_EMAILS || '')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  return env.length ? env : DEFAULT_ADMINS;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'POST only' });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return res.status(503).json({ error: 'Operator console not configured (missing service-role key).', code: 'no_service_role' });
  }

  const accessToken = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!accessToken) return res.status(401).json({ error: 'Sign-in required' });

  // Resolve + authorise the caller.
  let email = '';
  try {
    const ur = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: 'Bearer ' + accessToken, apikey: SUPABASE_ANON },
    });
    if (!ur.ok) return res.status(401).json({ error: 'Session expired — please sign in again' });
    const u = await ur.json();
    if (!u || !u.id) return res.status(401).json({ error: 'Invalid session' });
    email = String(u.email || '').toLowerCase();
  } catch (e) {
    return res.status(500).json({ error: 'Auth check failed', detail: String(e?.message || e) });
  }
  if (!adminEmails().includes(email)) {
    return res.status(403).json({ error: 'Not authorized', code: 'not_admin' });
  }

  const sb = { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey, Accept: 'application/json' };
  const platformConnected = !!(process.env.AIOSELL_USERNAME && process.env.AIOSELL_PASSWORD && process.env.AIOSELL_PMS_SLUG);
  const { action } = req.body || {};

  try {
    if (action === 'list') {
      const [pRes, cRes] = await Promise.all([
        fetch(`${SUPABASE_URL}/rest/v1/properties?select=id,name,accountant`, { headers: sb }),
        fetch(`${SUPABASE_URL}/rest/v1/room_categories?select=property_id,code,name,sort_order&order=sort_order`, { headers: sb }),
      ]);
      if (!pRes.ok) return res.status(502).json({ error: 'Properties read failed', status: pRes.status });
      if (!cRes.ok) return res.status(502).json({ error: 'Room categories read failed', status: cRes.status });
      const props = await pRes.json();
      const cats = await cRes.json();

      const catsBy = {};
      (cats || []).forEach(c => { (catsBy[c.property_id] = catsBy[c.property_id] || []).push(c); });

      const hotels = (props || []).map(p => {
        const aio = (p.accountant && p.accountant.aiosell) || {};
        const roomsCfg = aio.rooms || {};
        const rows = (catsBy[p.id] || []).map(c => ({
          roomTypeId: c.code,
          name: c.name || c.code,
          roomCode: (roomsCfg[c.code] && roomsCfg[c.code].roomCode) || '',
          rateplanCode: (roomsCfg[c.code] && roomsCfg[c.code].rateplanCode) || '',
        }));
        const mappedCount = rows.filter(r => r.roomCode).length;
        const hotelCode = aio.hotelCode || '';
        const configured = !!(hotelCode && mappedCount > 0);
        const status = configured ? (platformConnected ? 'active' : 'mapped_offline') : 'unmapped';
        return { id: p.id, name: p.name || '(unnamed property)', hotelCode, rooms: rows, mappedCount, totalRooms: rows.length, status };
      });
      hotels.sort((a, b) => a.name.localeCompare(b.name));
      return res.status(200).json({ ok: true, platformConnected, hotels });
    }

    if (action === 'setMapping') {
      const { propertyId, hotelCode, rooms } = req.body || {};
      if (!propertyId) return res.status(400).json({ error: 'Missing propertyId' });

      // Read current accountant so we merge aiosell in without dropping the CA
      // contact / expense categories / other fields that share this jsonb.
      const gr = await fetch(`${SUPABASE_URL}/rest/v1/properties?id=eq.${encodeURIComponent(propertyId)}&select=accountant`, { headers: sb });
      if (!gr.ok) return res.status(502).json({ error: 'Property read failed', status: gr.status });
      const arr = await gr.json();
      if (!Array.isArray(arr) || arr.length === 0) return res.status(404).json({ error: 'Property not found' });
      const accountant = (arr[0] && arr[0].accountant && typeof arr[0].accountant === 'object') ? arr[0].accountant : {};
      accountant.aiosell = { hotelCode: hotelCode || '', rooms: (rooms && typeof rooms === 'object') ? rooms : {} };

      const upd = await fetch(`${SUPABASE_URL}/rest/v1/properties?id=eq.${encodeURIComponent(propertyId)}`, {
        method: 'PATCH',
        headers: { ...sb, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ accountant }),
      });
      if (!upd.ok) {
        const detail = await upd.text();
        return res.status(502).json({ error: 'Update failed', status: upd.status, detail });
      }
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Unknown action. Use list | setMapping.' });
  } catch (e) {
    return res.status(500).json({ error: 'Server error', detail: String(e?.message || e) });
  }
}

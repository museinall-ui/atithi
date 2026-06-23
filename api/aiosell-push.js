// Vercel serverless function — securely pushes rate / inventory / restriction
// updates from AtithiBook to AIOSELL's channel-manager API.
//
// Why server-side: AIOSELL authenticates every push with HTTP Basic Auth, and
// those credentials (issued to the PMS partner at onboarding) are a SECRET. The
// owner sets them once in Vercel env vars and this function holds them; the
// browser never sees them. The function authenticates the CALLER via their
// Supabase access token + an RLS-scoped membership check (same pattern as
// send-to-ca.js), so only a signed-in member of the property can trigger a push.
//
// The client (Settings → Channels, a later chunk) builds the exact payload with
// src/cloud/aiosell.js and POSTs { propertyId, kind, payload } here. The client
// NEVER sees the partner slug or the full AIOSELL URL — this function resolves
// the endpoint from `kind` + the secret slug, so a compromised/older client
// can't aim a push at an arbitrary URL. (Finer per-permission gating — only
// staff with `manage_rates` — is enforced client-side at the button; membership
// is the server-side security boundary.)
//
// Owner-side setup (one-time, AFTER AIOSELL partner onboarding):
//   1. Vercel → Settings → Environment Variables, add:
//        AIOSELL_USERNAME  = (your AIOSELL Basic Auth username)
//        AIOSELL_PASSWORD  = (your AIOSELL Basic Auth password)
//        AIOSELL_PMS_SLUG  = (the partner id AIOSELL assigns; `sample-pms` in sandbox)
//        AIOSELL_BASE_URL  = https://live.aiosell.com/api/v2/cm   (optional; this is the default)
//   2. Redeploy (push any commit) so the env vars are picked up.
//
// Until those are set this returns 503 {code:'no_aiosell'} and the Channels
// screen simply shows "not connected" — nothing else changes; the live site is
// completely safe to deploy this onto.

const SUPABASE_URL = 'https://vaerzwmglfwslvqqcyhx.supabase.co';
const SUPABASE_ANON = 'sb_publishable_q-vI9SlNncTWlCr3rhuS8A_umNHfj1V';

// kind -> AIOSELL endpoint URL. Inventory + inventory-restrictions share
// `/update/{slug}`; rates + rate-restrictions share `/update-rates/{slug}`;
// no-show is a fixed path. KEEP IN SYNC with aiosellEndpoints() in
// src/cloud/aiosell.js (same URL shapes, defined there for the client side).
const KIND_PATH = {
  inventory:             (base, slug) => `${base}/update/${slug}`,
  inventoryRestrictions: (base, slug) => `${base}/update/${slug}`,
  rates:                 (base, slug) => `${base}/update-rates/${slug}`,
  rateRestrictions:      (base, slug) => `${base}/update-rates/${slug}`,
  noshow:                (base) => `${base}/noshow`,
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'POST only' });
  }

  const username = process.env.AIOSELL_USERNAME;
  const password = process.env.AIOSELL_PASSWORD;
  const slug = process.env.AIOSELL_PMS_SLUG;
  const base = process.env.AIOSELL_BASE_URL || 'https://live.aiosell.com/api/v2/cm';
  if (!username || !password || !slug) {
    return res.status(503).json({
      error: 'AIOSELL is not connected on this deployment yet. After partner onboarding, add AIOSELL_USERNAME / AIOSELL_PASSWORD / AIOSELL_PMS_SLUG in Vercel env vars, then redeploy.',
      code: 'no_aiosell',
    });
  }

  const { propertyId, kind, payload } = req.body || {};
  if (!propertyId) return res.status(400).json({ error: 'Missing propertyId in body' });
  if (!kind || !KIND_PATH[kind]) {
    return res.status(400).json({ error: `Missing or unknown kind. Allowed: ${Object.keys(KIND_PATH).join(', ')}` });
  }
  if (!payload || typeof payload !== 'object') {
    return res.status(400).json({ error: 'Missing payload object in body' });
  }

  // Strip "Bearer " prefix if present.
  const authHeader = req.headers.authorization || '';
  const accessToken = authHeader.replace(/^Bearer\s+/i, '');
  if (!accessToken) {
    return res.status(401).json({ error: 'Sign-in required (no Authorization header)' });
  }

  try {
    // 1) Verify the caller's access token.
    const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: 'Bearer ' + accessToken, apikey: SUPABASE_ANON },
    });
    if (!userResp.ok) {
      return res.status(401).json({ error: 'Session expired — please sign in again' });
    }
    const user = await userResp.json();
    if (!user || !user.id) {
      return res.status(401).json({ error: 'Invalid session' });
    }

    // 2) Confirm membership. The query runs under the user's own JWT, so RLS
    //    returns only rows they can see; a non-member gets an empty array.
    const memUrl = `${SUPABASE_URL}/rest/v1/memberships?user_id=eq.${encodeURIComponent(user.id)}&property_id=eq.${encodeURIComponent(propertyId)}&select=id&limit=1`;
    const memResp = await fetch(memUrl, {
      headers: { Authorization: 'Bearer ' + accessToken, apikey: SUPABASE_ANON, Accept: 'application/json' },
    });
    if (!memResp.ok) {
      return res.status(403).json({ error: 'Membership check failed' });
    }
    const mems = await memResp.json();
    if (!Array.isArray(mems) || mems.length === 0) {
      return res.status(403).json({ error: 'You are not a member of this property' });
    }

    // 3) Forward to AIOSELL with Basic Auth. The endpoint is resolved from the
    //    secret slug here — the browser never picks the URL.
    const url = KIND_PATH[kind](base, slug);
    const basic = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
    const aioResp = await fetch(url, {
      method: 'POST',
      headers: { Authorization: basic, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const raw = await aioResp.text();
    let body;
    try { body = JSON.parse(raw); } catch { body = { raw }; }

    // Surface AIOSELL's response verbatim — never suppress an error (their
    // shape is { success, message }; a transport failure has no success field).
    if (!aioResp.ok) {
      return res.status(502).json({ ok: false, error: 'AIOSELL rejected the request', status: aioResp.status, aiosell: body, kind });
    }
    return res.status(200).json({ ok: body.success !== false, aiosell: body, kind });
  } catch (e) {
    return res.status(500).json({ error: 'Server error', detail: String(e?.message || e) });
  }
}

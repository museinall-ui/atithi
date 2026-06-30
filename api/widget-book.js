// Vercel serverless function — verifies a Cloudflare Turnstile (CAPTCHA) token,
// then creates a public website booking via the book_widget_slot RPC.
//
// Why server-side: the public booking widget talks straight to Supabase, so a
// rate-limit on the website host can't see those calls. The defence is a CAPTCHA
// verified at the point of insert. The secret key + the service-role key are
// server-only, so this function is the trusted place to (1) confirm the guest is
// human with Cloudflare and (2) perform the insert. The browser only ever holds
// the public site key + the one-time token.
//
// Owner-side setup (one-time, ~3 min):
//   1. Cloudflare → Turnstile → Add widget for atithibook.com (gives a Site Key
//      + a Secret Key). The Site Key is already baked into the app.
//   2. Vercel → Settings → Environment Variables, add:
//        TURNSTILE_SECRET_KEY       = (the Secret Key from Cloudflare)
//        SUPABASE_SERVICE_ROLE_KEY  = (already set if push alerts work)
//   3. Redeploy (push any commit) so the env vars are picked up.
//
// Until TURNSTILE_SECRET_KEY is set, this returns 503 {code:'no_captcha'} and the
// widget falls back to its existing direct insert — so the booking link keeps
// working exactly as before, just without the CAPTCHA enforced yet.
//
// AFTER you confirm a test booking works through the live link, paste
// supabase/migrations/20260702_widget_captcha_lockdown.sql to close the direct
// anon insert path so this verifier becomes the ONLY way to create a website
// booking (otherwise a bot could skip the form and call Supabase directly).

const SUPABASE_URL = 'https://vaerzwmglfwslvqqcyhx.supabase.co';
const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

// Business exceptions raised by book_widget_slot (errcode P0001). We forward
// these so the widget can show the right message instead of a generic error.
const KNOWN_RPC_ERRORS = ['no_capacity', 'rate_limited', 'min_stay', 'past_date', 'unknown_room_type', 'bad_request'];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'POST only' });
  }

  const secret = process.env.TURNSTILE_SECRET_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  // Not configured yet → tell the client to fall back to its direct insert
  // (unchanged pre-CAPTCHA behaviour) so the public link never breaks mid-setup.
  if (!secret || !serviceKey) {
    return res.status(503).json({ code: 'no_captcha', error: 'CAPTCHA not configured on this deployment.' });
  }

  const { payload, token } = req.body || {};
  if (!payload || typeof payload !== 'object') {
    return res.status(400).json({ code: 'bad_request', error: 'Missing booking payload' });
  }
  if (!token || typeof token !== 'string') {
    return res.status(403).json({ code: 'captcha_failed', error: 'Missing verification token' });
  }

  // L1: the widget prices the booking client-side, so distrust the total the
  // browser sends — a tampered/scripted caller could forge it. This verifier is
  // the ONLY path that can create a website booking (anon EXECUTE on
  // book_widget_slot is revoked by 20260702), so sanitizing here is sufficient.
  // We don't run the full pricing engine server-side, but we reject non-finite /
  // negative / absurd values so a forged total can't land as ₹crore or pollute
  // Reports. book_widget_slot still recomputes the coupon discount from the
  // server-validated code, and forces paid=0 / status=tentative for review.
  const MAX_BOOKING_TOTAL = 2000000; // ₹20 lakh — far above any real single website booking
  const cleanInt = (v, cap) => {
    const n = Math.floor(Number(v));
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.min(n, cap);
  };
  payload.total = cleanInt(payload.total, MAX_BOOKING_TOTAL);
  payload.discount_amount = cleanInt(payload.discount_amount, MAX_BOOKING_TOTAL);

  // (1) Verify the Turnstile token with Cloudflare.
  try {
    const ip = (req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || '')
      .toString().split(',')[0].trim();
    const form = new URLSearchParams();
    form.append('secret', secret);
    form.append('response', token);
    if (ip) form.append('remoteip', ip);
    const vResp = await fetch(SITEVERIFY, { method: 'POST', body: form });
    const verdict = await vResp.json().catch(() => ({}));
    if (!verdict || verdict.success !== true) {
      return res.status(403).json({
        code: 'captcha_failed',
        error: 'Verification failed',
        detail: (verdict && verdict['error-codes']) || [],
      });
    }
  } catch (e) {
    return res.status(502).json({ code: 'verify_error', error: 'Could not reach the verification service' });
  }

  // (2) Token good → insert via the atomic capacity-checked RPC using the
  // service role (the only insert path once the anon bypass is locked down).
  try {
    const rpcResp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/book_widget_slot`, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: 'Bearer ' + serviceKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ p_booking: payload }),
    });
    if (!rpcResp.ok) {
      const errBody = await rpcResp.json().catch(() => ({}));
      const msg = (errBody && (errBody.message || errBody.hint || errBody.details || '')).toString();
      const hit = KNOWN_RPC_ERRORS.find(k => new RegExp(k, 'i').test(msg));
      // 409 for "expected" rejections (sold out / rate limited / etc), 502 otherwise.
      return res.status(hit ? 409 : 502).json({ code: hit || 'insert_error', error: msg || 'Insert failed' });
    }
    const id = await rpcResp.json().catch(() => null); // RPC returns the text booking id
    return res.status(200).json({ ok: true, id: typeof id === 'string' ? id : null });
  } catch (e) {
    return res.status(502).json({ code: 'insert_error', error: String((e && e.message) || e) });
  }
}

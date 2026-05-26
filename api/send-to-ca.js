// Vercel serverless function — sends the monthly invoice register
// directly to the property's CA via Resend.
//
// Why server-side: the Resend API key is a secret. The hotelier
// configures it once in Vercel's env vars and the function holds
// it; the browser never sees it. The function authenticates the
// caller via their Supabase access token (Bearer header) and
// verifies they're an active member of the property they're
// sending on behalf of.
//
// Owner-side setup (one-time, ~5 min):
//   1. Sign up at resend.com (free tier = 100 emails/day, 3k/month)
//   2. Add + verify a sending domain — typically your own
//      property's domain, or use the free `onboarding@resend.dev`
//      while testing
//   3. Create an API key in resend.com/api-keys
//   4. In Vercel → Settings → Environment Variables, add:
//        RESEND_API_KEY = re_xxxxxxxxxxxxxx
//        RESEND_FROM    = Atithi <hello@yourdomain.com>  (optional;
//                         defaults to onboarding@resend.dev)
//   5. Redeploy (push any commit) so the env vars are picked up
//
// Until those are set, this function returns 503 and the client
// falls back to the existing mailto + print flow.

const SUPABASE_URL = 'https://vaerzwmglfwslvqqcyhx.supabase.co';
const SUPABASE_ANON = 'sb_publishable_q-vI9SlNncTWlCr3rhuS8A_umNHfj1V';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'POST only' });
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    return res.status(503).json({
      error: 'Email sending is not configured on this deployment yet. Add a RESEND_API_KEY env var in Vercel → Settings → Environment Variables, then redeploy.',
      code: 'no_resend',
    });
  }

  const { to, subject, html, replyTo, propertyId } = req.body || {};
  if (!to || !subject || !html) {
    return res.status(400).json({ error: 'Missing to / subject / html in body' });
  }
  if (!propertyId) {
    return res.status(400).json({ error: 'Missing propertyId in body' });
  }

  // Strip "Bearer " prefix if present.
  const authHeader = req.headers.authorization || '';
  const accessToken = authHeader.replace(/^Bearer\s+/i, '');
  if (!accessToken) {
    return res.status(401).json({ error: 'Sign-in required (no Authorization header)' });
  }

  try {
    // 1) Verify the access token. Supabase /auth/v1/user returns
    //    the user record if the token is valid; 401 otherwise.
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

    // 2) Confirm membership. The query goes through the user's
    //    own JWT, so Supabase RLS returns only rows they can see.
    //    A non-member would get an empty array (not an error).
    const memUrl = `${SUPABASE_URL}/rest/v1/memberships?user_id=eq.${encodeURIComponent(user.id)}&property_id=eq.${encodeURIComponent(propertyId)}&select=id,role&limit=1`;
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

    // 3) Send via Resend. The HTML body IS the email body; we
    //    don't currently attach a PDF (the html renders well on
    //    its own and the CA can print-to-PDF if they want).
    const fromAddress = process.env.RESEND_FROM || 'Atithi <onboarding@resend.dev>';
    const toList = Array.isArray(to) ? to : [to];
    const resendResp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + resendKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromAddress,
        to: toList,
        subject,
        html,
        reply_to: replyTo || undefined,
      }),
    });
    if (!resendResp.ok) {
      const detail = await resendResp.text();
      // Common cases: 401 (bad key) / 422 (domain not verified) / 429 (rate limit)
      return res.status(502).json({
        error: 'Resend rejected the email',
        status: resendResp.status,
        detail,
      });
    }
    const result = await resendResp.json();
    return res.status(200).json({ ok: true, id: result.id, to: toList });
  } catch (e) {
    return res.status(500).json({ error: 'Server error', detail: String(e?.message || e) });
  }
}

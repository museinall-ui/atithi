// Vercel serverless function — sends a Web Push notification to a property's
// subscribed devices when a booking arrives, from EITHER the public booking
// widget or a staff member in the app. Staff bookings pass excludeUserId so the
// creator's own device isn't buzzed for their own action.
//
// Why server-side: a Web Push must be signed with the VAPID *private* key,
// which is a secret. The hotelier sets it once in Vercel env vars and this
// function holds it; the browser only ever sees the public key. Reading the
// property's subscriber list spans multiple users, so the function uses the
// Supabase SERVICE ROLE key (also a server-only secret) — push endpoints are
// never exposed to the browser.
//
// The notification TEXT is built here from the latest website booking in the
// DB (not from the caller), so the guest's browser can't spoof what your alert
// says. (Volume abuse — hitting this endpoint repeatedly — is bounded by the
// same public-link hardening tracked for the booking widget: a CAPTCHA / rate
// limit. Fine until the link is shared widely.)
//
// Owner-side setup (one-time, ~5 min):
//   1. Supabase → SQL Editor → run 20260620_push_subscriptions.sql
//   2. Supabase → Project Settings → API → copy the `service_role` secret
//   3. Vercel → Settings → Environment Variables, add:
//        VAPID_PRIVATE_KEY          = (the private key Claude generated)
//        SUPABASE_SERVICE_ROLE_KEY  = (the service_role secret from step 2)
//        VAPID_SUBJECT              = mailto:you@yourhotel.com   (optional)
//   4. Redeploy (push any commit) so the env vars are picked up
//
// Until those are set, this returns 503 and the booking link simply doesn't
// fire alerts — nothing else changes.

import webpush from 'web-push';
import { pushInventoryForProperty } from '../lib/aiosellServer.js';

const SUPABASE_URL = 'https://vaerzwmglfwslvqqcyhx.supabase.co';
// VAPID PUBLIC key — safe to ship. Must match the one in src/push.js and the
// VAPID_PRIVATE_KEY env var (same keypair).
const VAPID_PUBLIC = 'BKPsbkWiDf1wiRH5BIRygGGVtvBZCANfzCVdBawwD_dZP2TRhyISHDnBwKTmNe1L1vIKBWttxWYxYI4T3z4y4bY';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'POST only' });
  }

  const privKey = process.env.VAPID_PRIVATE_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!privKey || !serviceKey) {
    return res.status(503).json({
      error: 'Push notifications are not configured on this deployment yet.',
      code: 'no_push',
    });
  }

  const { propertyId, origin, excludeUserId } = req.body || {};
  if (!propertyId) return res.status(400).json({ error: 'Missing propertyId' });

  const subject = process.env.VAPID_SUBJECT || 'mailto:hello@atithi.app';
  try {
    webpush.setVapidDetails(subject, VAPID_PUBLIC, privKey);
  } catch (e) {
    return res.status(500).json({ error: 'Bad VAPID config', detail: String(e?.message || e) });
  }

  const sbHeaders = {
    apikey: serviceKey,
    Authorization: 'Bearer ' + serviceKey,
    Accept: 'application/json',
  };

  // Build the message from the most recent booking for this property
  // (server-verified — the caller cannot spoof the guest's name / dates into
  // your alert). Works for both website bookings and staff-entered ones; the
  // wording adapts to the channel.
  //
  // ANTI-FLOOD: this endpoint is unauthenticated (the public widget pings it),
  // so to stop it being used to spam a hotelier's devices we (a) only act on a
  // booking created in the last few minutes, and (b) notify AT MOST ONCE per
  // booking via an atomic claim on bookings.notified_at. Repeated / forged /
  // concurrent calls lose the race and send nothing.
  let title = '📩 New booking';
  let body = 'Tap to open your diary.';
  const FRESH_MS = 5 * 60 * 1000;
  let latest = null;
  try {
    const bUrl = `${SUPABASE_URL}/rest/v1/bookings?property_id=eq.${encodeURIComponent(propertyId)}&order=created_at.desc&limit=1&select=id,guest_name,nights,start_date,channel,created_at`;
    const bResp = await fetch(bUrl, { headers: sbHeaders });
    if (bResp.ok) {
      const rows = await bResp.json();
      latest = (Array.isArray(rows) && rows[0]) || null;
    }
  } catch (e) { /* fall through to the no-booking guard */ }

  if (!latest) {
    return res.status(200).json({ ok: true, sent: 0, note: 'no booking to notify' });
  }
  const createdMs = latest.created_at ? Date.parse(latest.created_at) : 0;
  if (!createdMs || (Date.now() - createdMs) > FRESH_MS) {
    // Latest booking isn't a just-made one — ignore. Neutralises replayed /
    // forged calls that aren't tied to a real, recent booking.
    return res.status(200).json({ ok: true, sent: 0, note: 'no fresh booking' });
  }
  // Notify at most once per booking: atomically flip notified_at from NULL.
  // Only the first caller wins; duplicates get an empty result and stop. If the
  // column isn't installed yet (pre-20260627), claimResp is not ok and we
  // degrade to "notify anyway" — the freshness gate above still bounds abuse.
  try {
    const claimResp = await fetch(
      `${SUPABASE_URL}/rest/v1/bookings?id=eq.${encodeURIComponent(latest.id)}&notified_at=is.null`,
      { method: 'PATCH',
        headers: { ...sbHeaders, 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify({ notified_at: new Date().toISOString() }) }
    );
    if (claimResp.ok) {
      const claimed = await claimResp.json();
      if (!Array.isArray(claimed) || claimed.length === 0) {
        return res.status(200).json({ ok: true, sent: 0, note: 'already notified' });
      }
    }
    // claimResp not ok → column likely absent (pre-migration); fall through.
  } catch (e) { /* network error on claim → degrade to notify (freshness-gated) */ }

  // A new booking (website or staff-entered) just consumed a unit — close it on
  // the OTAs immediately via the channel manager, so a guest browsing an OTA
  // can't book the same room in the gap before the hotelier's app next syncs.
  // Idempotent + no-op until AIOSELL is connected; never blocks the alert below.
  try { await pushInventoryForProperty(propertyId); } catch (e) { /* periodic reconciliation will catch it */ }

  {
    const who = (latest.guest_name || 'A guest').toString().slice(0, 40);
    const n = latest.nights || 1;
    title = latest.channel === 'website' ? '📩 New website booking' : '📅 New booking';
    body = `${who} · ${n} night${n === 1 ? '' : 's'}${latest.start_date ? ' from ' + latest.start_date : ''}. Tap to view.`;
  }

  // Read the property's subscribers (service role bypasses RLS).
  let subs = [];
  try {
    const sUrl = `${SUPABASE_URL}/rest/v1/push_subscriptions?property_id=eq.${encodeURIComponent(propertyId)}&select=id,endpoint,p256dh,auth,user_id`;
    const sResp = await fetch(sUrl, { headers: sbHeaders });
    if (!sResp.ok) {
      return res.status(502).json({ error: 'Could not read subscriptions', status: sResp.status });
    }
    subs = await sResp.json();
  } catch (e) {
    return res.status(500).json({ error: 'Subscription read failed', detail: String(e?.message || e) });
  }

  // Skip the device(s) of whoever just created the booking — no point buzzing
  // the staff member's own phone for an action they just took. (Website
  // bookings pass no excludeUserId, so every subscriber is notified.)
  if (excludeUserId && Array.isArray(subs)) {
    subs = subs.filter(s => s.user_id !== excludeUserId);
  }

  if (!Array.isArray(subs) || subs.length === 0) {
    return res.status(200).json({ ok: true, sent: 0, note: 'no subscribers' });
  }

  // SECURITY: never reflect the caller-supplied `origin` into the click URL — the
  // notificationclick handler opens it, so a forged origin would be an open
  // redirect / phishing vector on an unauthenticated endpoint. Derive the app URL
  // from the deployment host instead (the legitimate callers all send their own
  // same-origin URL anyway).
  const host = req.headers.host;
  const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const appUrl = host ? `${proto}://${host}/` : './';
  const payload = JSON.stringify({ title, body, url: appUrl, tag: 'atithi-website-booking' });

  let sent = 0, pruned = 0;
  await Promise.all(subs.map(async (s) => {
    const subscription = { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } };
    try {
      await webpush.sendNotification(subscription, payload);
      sent++;
    } catch (err) {
      const code = err && err.statusCode;
      // 404 / 410 = subscription is dead (app uninstalled, permission revoked).
      // Prune it so the list stays clean.
      if (code === 404 || code === 410) {
        pruned++;
        try {
          await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(s.endpoint)}`, {
            method: 'DELETE', headers: { ...sbHeaders, Prefer: 'return=minimal' },
          });
        } catch (e) { /* ignore prune failure */ }
      }
    }
  }));

  return res.status(200).json({ ok: true, sent, pruned });
}

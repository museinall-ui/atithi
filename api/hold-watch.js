// Vercel serverless function — the "hold watcher". Runs on a schedule (the free
// GitHub Actions cron in .github/workflows/hold-watch.yml, or a Vercel Cron)
// and does the two things the in-app timer CAN'T do while the app is closed:
//
//   1. Buzz the hotelier's phone (Web Push) when an unpaid hold is about to
//      expire — "extend or release?" — so they can act before they lose the
//      booking or keep tying up a unit.
//   2. In AUTO-release mode, actually release a hold that has already expired
//      (status → cancelled), so the unit + the OTAs free up even if nobody has
//      the app open. (In REMINDER mode it only nudges; the hotelier decides.)
//
// Why server-side: a Web Push must be signed with the VAPID *private* key, and
// reading every property's holds + subscribers spans many users — both need
// server-only secrets (VAPID private key + the Supabase service-role key, which
// bypasses RLS). Same shape as api/notify-booking.js.
//
// Owner setup (one-time, ~5 min) — until done this endpoint is dormant (503):
//   1. Supabase → SQL Editor → run 20260629_hold_reminder.sql
//   2. Vercel → Settings → Environment Variables, add:
//        CRON_SECRET                = (any long random string you make up)
//        VAPID_PRIVATE_KEY          = (already set if push alerts work)
//        SUPABASE_SERVICE_ROLE_KEY  = (already set if push alerts work)
//   3. GitHub → repo Settings → Secrets and variables → Actions → New secret:
//        CRON_SECRET = (the SAME value as step 2)
//   4. Redeploy (push any commit). The GitHub Actions workflow then pings this
//      every ~15 min. (Vercel Cron on the free Hobby plan only runs once/day,
//      so the GitHub schedule is the real driver.)
//
// Auth: both Vercel Cron and the GitHub workflow send
// `Authorization: Bearer <CRON_SECRET>`. No secret set → 503; wrong secret → 401.

import webpush from 'web-push';
import crypto from 'crypto';
import { pushInventoryForProperty } from '../lib/aiosellServer.js';

// Constant-time bearer-token compare (matches the safeEqual pattern in
// api/aiosell-reservation.js) so the secret can't be recovered byte-by-byte via
// response-timing. Length mismatch short-circuits (acceptable).
function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

const SUPABASE_URL = 'https://vaerzwmglfwslvqqcyhx.supabase.co';
// VAPID PUBLIC key — safe to ship. Must match src/push.js + the private key.
const VAPID_PUBLIC = 'BKPsbkWiDf1wiRH5BIRygGGVtvBZCANfzCVdBawwD_dZP2TRhyISHDnBwKTmNe1L1vIKBWttxWYxYI4T3z4y4bY';

// Send the heads-up when a hold is within this long of releasing.
const REMIND_WINDOW_MS = 30 * 60 * 1000;          // 30 min
// Ignore holds that expired more than this long ago — stale (the in-app ticker
// or an earlier run handled them). Stops a first-run push storm.
const STALE_MS = 24 * 60 * 60 * 1000;             // 24 h

export default async function handler(req, res) {
  const privKey = process.env.VAPID_PRIVATE_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const cronSecret = process.env.CRON_SECRET;
  if (!privKey || !serviceKey || !cronSecret) {
    return res.status(503).json({ error: 'hold-watch is not configured on this deployment yet.', code: 'no_cron' });
  }
  if (!safeEqual(req.headers.authorization || '', `Bearer ${cronSecret}`)) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const subject = process.env.VAPID_SUBJECT || 'mailto:hello@atithi.app';
  try { webpush.setVapidDetails(subject, VAPID_PUBLIC, privKey); }
  catch (e) { return res.status(500).json({ error: 'Bad VAPID config', detail: String(e?.message || e) }); }

  const sbHeaders = { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey, Accept: 'application/json' };
  const now = Date.now();
  const floor = now - STALE_MS;
  const ceil = now + REMIND_WINDOW_MS;

  // Candidate holds across every property (service role bypasses RLS). Bounded
  // to a sane window so the query stays small.
  let holds = [];
  try {
    const url = `${SUPABASE_URL}/rest/v1/bookings`
      + `?status=eq.tentative`
      + `&release_ts=not.is.null`
      + `&release_ts=gte.${floor}`
      + `&release_ts=lte.${ceil}`
      + `&select=id,property_id,guest_name,nights,total,paid,release_ts,events,hold_reminder_sent_at,channel`
      + `&limit=500`;
    const r = await fetch(url, { headers: sbHeaders });
    if (r.status === 400) {
      // hold_reminder_sent_at column likely absent (pre-20260629). Degrade to a
      // no-op so the endpoint never errors before the owner pastes the migration.
      return res.status(200).json({ ok: true, sent: 0, cancelled: 0, note: 'migration pending (run 20260629_hold_reminder.sql)' });
    }
    if (!r.ok) return res.status(502).json({ error: 'Could not read holds', status: r.status });
    holds = await r.json();
  } catch (e) {
    return res.status(500).json({ error: 'Hold read failed', detail: String(e?.message || e) });
  }
  if (!Array.isArray(holds) || holds.length === 0) {
    return res.status(200).json({ ok: true, sent: 0, cancelled: 0, note: 'no holds in window' });
  }

  // Resolve each property's auto-release vs reminder choice.
  const propIds = [...new Set(holds.map(h => h.property_id).filter(Boolean))];
  const holdModeByProp = {};
  if (propIds.length) {
    try {
      const inList = propIds.map(encodeURIComponent).join(',');
      const r = await fetch(`${SUPABASE_URL}/rest/v1/properties?id=in.(${inList})&select=id,accountant`, { headers: sbHeaders });
      if (r.ok) {
        for (const p of (await r.json()) || []) {
          const m = p && p.accountant && p.accountant.holdMode;
          holdModeByProp[p.id] = (m === 'reminder') ? 'reminder' : 'auto';
        }
      }
    } catch (e) { /* fall back to 'auto' per booking below */ }
  }

  // Atomic "I'll send the one reminder for this booking" claim. NULL → now;
  // only the winning call gets a non-empty result.
  const claimReminder = async (id) => {
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/bookings?id=eq.${encodeURIComponent(id)}&hold_reminder_sent_at=is.null`,
        { method: 'PATCH',
          headers: { ...sbHeaders, 'Content-Type': 'application/json', Prefer: 'return=representation' },
          body: JSON.stringify({ hold_reminder_sent_at: new Date().toISOString() }) });
      if (!r.ok) return false;
      const rows = await r.json();
      return Array.isArray(rows) && rows.length > 0;
    } catch { return false; }
  };
  // Release a hold server-side (auto mode). Conditional on status still being
  // tentative so we never clobber one that got confirmed/paid in the meantime.
  // Appends the same activity event the in-app ticker would, so the booking's
  // feed reads identically whether the app was open or not.
  const releaseHold = async (b) => {
    const evt = { kind: 'status', text: 'Auto-released — hold expired before payment', time: new Date(now).toISOString() };
    const events = [...(Array.isArray(b.events) ? b.events : []), evt];
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/bookings?id=eq.${encodeURIComponent(b.id)}&status=eq.tentative`,
        { method: 'PATCH',
          // return=representation so we know a row ACTUALLY transitioned: a
          // return=minimal PATCH responds 204 even when 0 rows matched (the hold
          // was already confirmed/cancelled in the gap), which would falsely count
          // a release + fire a "room reopened" push for a unit still held.
          headers: { ...sbHeaders, 'Content-Type': 'application/json', Prefer: 'return=representation' },
          body: JSON.stringify({ status: 'cancelled', auto_released: true, events }) });
      if (!r.ok) return false;
      const rows = await r.json();
      return Array.isArray(rows) && rows.length > 0;
    } catch { return false; }
  };

  const jobs = [];   // { propertyId, title, body, tag }
  const releasedProps = new Set();   // properties whose OTA inventory must be re-pushed
  let cancelled = 0;
  for (const b of holds) {
    const total = Number(b.total) || 0;
    const paid = Number(b.paid) || 0;
    const notFullyPaid = paid < total || total <= 0;
    if (!notFullyPaid) continue;                 // a fully-paid hold gets confirmed, not released
    const releaseTs = Number(b.release_ts);
    if (!releaseTs) continue;
    const mode = holdModeByProp[b.property_id] || 'auto';
    const expired = releaseTs <= now;
    const who = (b.guest_name || 'A guest').toString().slice(0, 40);
    const n = b.nights || 1;

    if (expired && mode === 'auto') {
      const released = await releaseHold(b);
      if (released) { cancelled++; releasedProps.add(b.property_id); }
      // Notify once — but only claim the "room reopened" message if it ACTUALLY
      // reopened. If the release PATCH blipped (transient), send the honest
      // "expired, open the app" nudge instead of a message that would mislead the
      // hotelier into reselling a still-held unit.
      if (!b.hold_reminder_sent_at && await claimReminder(b.id)) {
        jobs.push(released
          ? { propertyId: b.property_id, tag: 'atithi-hold-' + b.id, title: '⏱️ Hold released', body: `${who}'s unpaid hold expired and was released — the room is open again.` }
          : { propertyId: b.property_id, tag: 'atithi-hold-' + b.id, title: '⏳ Hold expired', body: `${who} · ${n} night${n === 1 ? '' : 's'} hold has expired. Open the app to release it.` });
      }
      continue;
    }
    // Expiring soon (both modes) OR already expired in reminder mode → one nudge.
    if (!b.hold_reminder_sent_at && await claimReminder(b.id)) {
      jobs.push({ propertyId: b.property_id, tag: 'atithi-hold-' + b.id,
        title: expired ? '⏳ Hold expired' : '⏳ Hold expiring',
        body: `${who} · ${n} night${n === 1 ? '' : 's'} hold ${expired ? 'has expired' : 'expires soon'}. Open the app to extend or release.` });
    }
  }

  // A server-side auto-release frees a unit — push that property's fresh
  // availability to the OTAs right away (don't wait for the periodic
  // reconciliation). No-op until AIOSELL is connected.
  for (const pid of releasedProps) {
    try { await pushInventoryForProperty(pid); } catch (e) { /* reconciliation will catch it */ }
  }

  if (jobs.length === 0) {
    return res.status(200).json({ ok: true, sent: 0, cancelled, note: 'nothing to notify' });
  }

  // Canonical app origin (a server constant), never derived from the request
  // Host header — the notification click URL must not be influenceable by a
  // forged Host on these push paths.
  const appUrl = 'https://www.atithibook.com/';

  // Send pushes, caching each property's subscriber list.
  const subsByProp = {};
  let sent = 0, pruned = 0;
  for (const job of jobs) {
    if (!(job.propertyId in subsByProp)) {
      try {
        const r = await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?property_id=eq.${encodeURIComponent(job.propertyId)}&select=endpoint,p256dh,auth`, { headers: sbHeaders });
        subsByProp[job.propertyId] = r.ok ? await r.json() : [];
      } catch { subsByProp[job.propertyId] = []; }
    }
    const subs = subsByProp[job.propertyId] || [];
    const payload = JSON.stringify({ title: job.title, body: job.body, url: appUrl, tag: job.tag });
    await Promise.all(subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
        sent++;
      } catch (err) {
        const code = err && err.statusCode;
        if (code === 404 || code === 410) {
          pruned++;
          try { await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(s.endpoint)}`, { method: 'DELETE', headers: { ...sbHeaders, Prefer: 'return=minimal' } }); } catch {}
        }
      }
    }));
  }

  return res.status(200).json({ ok: true, sent, pruned, cancelled, jobs: jobs.length });
}

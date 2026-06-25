// Vercel serverless function — the OTA inventory SAFETY NET.
//
// Every run, it pushes each AIOSELL-mapped property's CURRENT availability to
// AIOSELL. This is the belt-and-suspenders guarantee that OTA inventory is never
// more than one cron-interval stale, no matter what changed it or whether anyone
// had the app open: a website booking taken while the hotelier slept, a hold
// that auto-released server-side, a maintenance close-out, or simply a push that
// failed earlier — all get reconciled here.
//
// Triggered by the same free GitHub Actions schedule as hold-watch (see
// .github/workflows/hold-watch.yml), right AFTER hold-watch so any just-released
// holds are already reflected. Auth: `Authorization: Bearer <CRON_SECRET>`.
//
// We ALWAYS push (idempotent) rather than skipping on a cached hash: a missed
// push is an oversell — the one outcome a hotel cannot tolerate — whereas an
// extra identical push costs nothing. At larger scale the per-run property count
// is bounded by a wall-clock budget (the rest roll to the next run, logged — no
// silent truncation); the next step beyond that is a proper work queue.
//
// Dormant until BOTH CRON_SECRET and the AIOSELL_* creds are set (it's a no-op
// while AIOSELL partner onboarding is still in progress).

import { listConfiguredPropertyIds, pushInventoryForProperty, aiosellConfigured } from '../lib/aiosellServer.js';

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  const cronSecret = process.env.CRON_SECRET;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!cronSecret || !serviceKey) {
    return res.status(503).json({ error: 'ota-inventory-sync is not configured yet.', code: 'no_cron' });
  }
  if ((req.headers.authorization || '') !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  if (!aiosellConfigured()) {
    return res.status(200).json({ ok: true, note: 'AIOSELL not connected — nothing to sync', code: 'no_aiosell' });
  }

  let ids = [];
  try { ids = await listConfiguredPropertyIds(); }
  catch (e) { return res.status(502).json({ error: 'property list failed', detail: String(e?.message || e) }); }

  const start = Date.now();
  // Leave ~15s headroom under the 60s function cap: the budget is checked only
  // between properties, and a single property can still run one ~8s AIOSELL call
  // (+ reads) after passing the gate, so a 50s budget could overrun.
  const BUDGET_MS = 45000;
  let processed = 0, pushed = 0, skipped = 0, failed = 0, deferred = 0;
  const errors = [];
  for (const id of ids) {
    if (Date.now() - start > BUDGET_MS) { deferred = ids.length - processed; break; }
    try {
      const r = await pushInventoryForProperty(id);
      processed++;
      if (r.dormant) { /* AIOSELL env vanished mid-run */ }
      else if (r.skipped) skipped++;
      else if (r.ok) pushed++;
      else { failed++; if (errors.length < 10) errors.push({ id, error: r.error || r.status }); }
    } catch (e) {
      processed++; failed++;
      if (errors.length < 10) errors.push({ id, error: String(e?.message || e) });
    }
  }

  return res.status(200).json({ ok: true, configured: ids.length, processed, pushed, skipped, failed, deferred, errors });
}

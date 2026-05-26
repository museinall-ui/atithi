import { supabase } from '../supabase.js';

// Property-wide activity tracker. Backed by the audit_log table from
// the initial schema — no migration needed; the table has been there
// since day one waiting for a writer.
//
// Action strings are dot-namespaced ("booking.create", "payment.add",
// "settings.update") so the UI can group / filter by area. The meta
// jsonb is a free-form bag for whatever extra context helps a hotelier
// understand the change later — guest name, amount, before / after
// values, target booking id, etc.
//
// Reads are scoped by property_id via the existing RLS policy; writes
// require an authenticated user (the policy uses with check
// has_property_access). In DEMO mode (no session) every call no-ops
// gracefully.

// Insert one activity row. Always fire-and-forget — a log failure
// must never block the actual action that triggered it.
export async function logActivity(propertyId, userId, action, targetType, targetId, meta) {
  if (!propertyId || !userId) return; // DEMO / pre-auth — no log
  try {
    await supabase.from('audit_log').insert({
      property_id: propertyId,
      actor_id: userId,
      action,
      target_type: targetType || null,
      target_id: targetId == null ? null : String(targetId),
      meta: meta || {},
    });
  } catch (e) {
    // Surface but don't propagate — the calling action has already
    // succeeded (locally + cloud) and the user is past it.
    console.warn('[atithi] activity log write failed', e);
  }
}

// Load activity entries for a property, newest first. Optional filters
// for date range (iso strings) and action prefix ("booking.", "payment.")
// for the filter chips on the Activity screen.
export async function loadActivity(propertyId, opts = {}) {
  if (!propertyId) return [];
  let q = supabase
    .from('audit_log')
    .select('id, actor_id, action, target_type, target_id, meta, created_at')
    .eq('property_id', propertyId)
    .order('created_at', { ascending: false })
    .limit(opts.limit || 500);
  if (opts.sinceIso) q = q.gte('created_at', opts.sinceIso);
  if (opts.untilIso) q = q.lte('created_at', opts.untilIso);
  if (opts.actionPrefix) q = q.like('action', opts.actionPrefix + '%');
  if (opts.actorId) q = q.eq('actor_id', opts.actorId);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

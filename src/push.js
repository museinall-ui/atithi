// Web Push client helpers — opt a device into booking alerts.
//
// Flow: ask permission → subscribe via the service worker's pushManager using
// our VAPID PUBLIC key → store the subscription (endpoint + keys) in Supabase
// so api/notify-booking can send to it when a booking lands.
//
// Everything degrades gracefully: unsupported browsers, denied permission, or
// a missing service worker all return a friendly state instead of throwing.

import { supabase } from './supabase.js';

// VAPID PUBLIC key — safe to ship. MUST match VAPID_PRIVATE_KEY in Vercel +
// VAPID_PUBLIC in api/notify-booking.js (same keypair).
const VAPID_PUBLIC = 'BKPsbkWiDf1wiRH5BIRygGGVtvBZCANfzCVdBawwD_dZP2TRhyISHDnBwKTmNe1L1vIKBWttxWYxYI4T3z4y4bY';

// Convert the base64url VAPID key to the Uint8Array the Push API wants.
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function isPushSupported() {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window;
}

// The active service-worker registration, or null if none becomes ready within
// the timeout. (On localhost dev the SW isn't registered — index.html skips it
// — so navigator.serviceWorker.ready would hang forever without this guard.)
async function readyRegistration(timeoutMs = 3500) {
  if (!('serviceWorker' in navigator)) return null;
  const existing = await navigator.serviceWorker.getRegistration();
  if (!existing) return null;
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise((resolve) => setTimeout(() => resolve(existing || null), timeoutMs)),
  ]);
}

// Current state for the Settings toggle:
//   'unsupported' | 'denied' | 'on' | 'off' | 'needs-install'
export async function pushState() {
  if (!isPushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await readyRegistration();
  if (!reg) return 'off'; // no SW yet (e.g. first load / localhost) — treat as off
  try {
    const sub = await reg.pushManager.getSubscription();
    return sub ? 'on' : 'off';
  } catch (e) {
    return 'off';
  }
}

// Turn ON alerts for this device. Returns { ok, reason }.
export async function enablePush(propertyId, userId) {
  if (!isPushSupported()) return { ok: false, reason: 'unsupported' };
  if (!propertyId || !userId) return { ok: false, reason: 'not_signed_in' };

  let permission = Notification.permission;
  if (permission === 'default') {
    try { permission = await Notification.requestPermission(); }
    catch (e) { return { ok: false, reason: 'denied' }; }
  }
  if (permission !== 'granted') return { ok: false, reason: 'denied' };

  const reg = await readyRegistration();
  if (!reg) return { ok: false, reason: 'no_sw' };

  let sub;
  try {
    sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
      });
    }
  } catch (e) {
    return { ok: false, reason: 'subscribe_failed', detail: String(e && e.message || e) };
  }

  const json = sub.toJSON();
  const row = {
    property_id: propertyId,
    user_id: userId,
    endpoint: sub.endpoint,
    p256dh: json.keys && json.keys.p256dh,
    auth: json.keys && json.keys.auth,
    user_agent: (navigator.userAgent || '').slice(0, 300),
  };
  const { error } = await supabase
    .from('push_subscriptions')
    .upsert(row, { onConflict: 'endpoint' });
  if (error) {
    // Table missing (migration not pasted) or RLS — surface so the UI can hint.
    return { ok: false, reason: 'save_failed', detail: error.message };
  }
  return { ok: true };
}

// Turn OFF alerts for this device. Unsubscribes locally + removes the row.
export async function disablePush() {
  if (!isPushSupported()) return { ok: true };
  const reg = await readyRegistration();
  if (!reg) return { ok: true };
  try {
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      const endpoint = sub.endpoint;
      await sub.unsubscribe();
      await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
    }
  } catch (e) { /* best-effort */ }
  return { ok: true };
}

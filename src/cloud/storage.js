// Image (and later audio) uploads to Supabase Storage, replacing the old
// "stuff the base64 blob into a database row" approach. Storing bytes as files
// keeps the database tiny (rows hold a short URL, not a megabyte of base64) and
// serves images from Supabase's CDN — so they load FASTER for guests, not
// slower.
//
// Compatibility is the whole trick: an <img>/<audio> renders a CDN URL exactly
// the same as a base64 data URL, so the display side needs no changes and old
// (base64) + new (URL) images coexist. The cloud-save path also needs no change
// — it stores whatever string is in the field, blob or URL alike.
//
// Demo / signed-out (no Supabase session) keeps the inline base64 behaviour, and
// ANY upload failure falls back to base64 too, so an upload can never just break
// for a hotelier. Requires the `property-media` bucket + its RLS policies
// (migration 20260630_storage_buckets.sql).

import { supabase } from '../supabase.js';

const MEDIA_BUCKET = 'property-media';
const AUDIO_BUCKET = 'property-audio';

// File/Blob → base64 data URL (the legacy inline format). The universal fallback.
export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ''));
    r.onerror = () => reject(new Error('read failed'));
    r.readAsDataURL(file);
  });
}

function extOf(file) {
  const fromName = (file && file.name && file.name.includes('.')) ? file.name.split('.').pop() : '';
  const fromType = (file && file.type && file.type.includes('/')) ? file.type.split('/')[1] : '';
  const ext = String(fromName || fromType || 'png').toLowerCase().replace(/[^a-z0-9]/g, '');
  return ext || 'png';
}

// Upload a guest-visible image to the PUBLIC property-media bucket at
// "<propertyId>/<name>.<ext>" and return its public CDN URL. `name` is a stable
// slug for singletons (logo / payment-qr / room-<code>) so a re-upload overwrites
// in place; pass { unique: true } for gallery images so each keeps its own object.
//
// Returns a base64 data URL instead when there's no session (demo) or on any
// error — callers store the returned string verbatim and <img src> renders both.
export async function uploadPropertyMedia(propertyId, file, name, { unique = false } = {}) {
  if (!file) return '';
  // Demo / signed-out → no auth.uid(), so the member-gated RLS would deny the
  // write. Keep the inline base64 the app already supports.
  let session = null;
  try { session = (await supabase.auth.getSession()).data.session; } catch { /* treat as no session */ }
  if (!session || !propertyId) return fileToDataUrl(file);

  const ext = extOf(file);
  const slug = unique ? `${name}-${Date.now()}-${Math.floor(Math.random() * 1e6)}` : name;
  const path = `${propertyId}/${slug}.${ext}`;
  try {
    const { data, error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, file, {
      upsert: true,
      contentType: file.type || 'image/png',
      cacheControl: '3600',
    });
    if (error) throw error;
    const { data: pub } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(data.path);
    // Overwriting a singleton keeps the SAME URL, which the CDN/browser would
    // otherwise serve stale — bust it with a version query so the new image
    // shows immediately. Unique (gallery) names don't need it.
    return unique ? pub.publicUrl : `${pub.publicUrl}?v=${Date.now()}`;
  } catch (e) {
    // Never fail an upload — fall back to inline base64.
    try { return await fileToDataUrl(file); } catch { return ''; }
  }
}

// True for a value the app stored as a Storage URL (vs a legacy base64 blob).
// Handy for the backfill + for deciding whether a value still bloats the DB.
export function isStorageUrl(v) {
  return typeof v === 'string' && /^https?:\/\//.test(v);
}

// Extract the in-bucket object path ("<propertyId>/logo.png") from a public
// property-media URL (strips the host, the /object/public/<bucket>/ prefix, and
// any ?v= cache-bust query). Returns '' for a base64/blank value.
export function mediaPathOf(url) {
  if (!isStorageUrl(url)) return '';
  const marker = `/object/public/${MEDIA_BUCKET}/`;
  const i = url.indexOf(marker);
  if (i < 0) return '';
  let path = url.slice(i + marker.length);
  const q = path.indexOf('?');
  if (q >= 0) path = path.slice(0, q);
  try { return decodeURIComponent(path); } catch { return path; }
}

// Best-effort delete of a property-media object when its image is removed (or
// replaced with a different file extension, which lands at a new path). Stops
// orphaned, publicly-readable images accumulating in the bucket. Never throws.
// Accepts either a stored URL or an in-bucket path; a base64 value is ignored.
export async function deletePropertyMedia(urlOrPath) {
  const path = isStorageUrl(urlOrPath) ? mediaPathOf(urlOrPath) : (urlOrPath || '');
  if (!path || path.startsWith('data:')) return;
  try { await supabase.storage.from(MEDIA_BUCKET).remove([path]); } catch { /* ignore */ }
}

// ── Voice notes — PRIVATE bucket (internal notes, never guest-facing) ────────
// Audio is stored under "<propertyId>/<name>.<ext>" and played via a short-lived
// SIGNED URL (the bucket has no public URL). The note row keeps the PATH, not a
// URL, so it never expires; we sign on demand at playback time.

// Upload a voice-note Blob. Returns the storage PATH on success, or null with no
// session (demo) / on error — the caller then falls back to base64 inline.
export async function uploadPropertyAudio(propertyId, blob, name) {
  if (!blob || !propertyId) return null;
  let session = null;
  try { session = (await supabase.auth.getSession()).data.session; } catch { /* no session */ }
  if (!session) return null;
  // Strip the codec parameter: Chrome's MediaRecorder yields 'audio/webm;codecs=opus'
  // (Safari 'audio/mp4;codecs=...'), but the bucket's allowed_mime_types match the
  // bare essence literally — so the FULL string is rejected as an unsupported mime
  // and every note would silently fall back to base64, defeating the migration.
  const baseMime = (blob.type || 'audio/webm').split(';')[0].trim() || 'audio/webm';
  const ext = (baseMime.includes('/') ? baseMime.split('/')[1] : 'webm').replace(/[^a-z0-9]/gi, '') || 'webm';
  const path = `${propertyId}/${name}.${ext}`;
  try {
    const { data, error } = await supabase.storage.from(AUDIO_BUCKET).upload(path, blob, {
      upsert: true,
      contentType: baseMime,
      cacheControl: '3600',
    });
    if (error) throw error;
    return data.path;
  } catch { return null; }
}

// Sign a private audio object for <audio src> playback. Short-lived (2h);
// regenerated each time a player mounts. Returns null on error.
export async function signedAudioUrl(path, expiresInSec = 7200) {
  if (!path) return null;
  try {
    const { data, error } = await supabase.storage.from(AUDIO_BUCKET).createSignedUrl(path, expiresInSec);
    if (error) throw error;
    return data.signedUrl;
  } catch { return null; }
}

// Best-effort delete of a private audio object when its note is removed (so we
// don't leave orphan files). Never throws.
export async function deletePropertyAudio(path) {
  if (!path) return;
  try { await supabase.storage.from(AUDIO_BUCKET).remove([path]); } catch { /* ignore */ }
}

const isB64 = (v) => typeof v === 'string' && v.startsWith('data:');

// Decode a base64 (or url-encoded) data URL back into a Blob, for the backfill.
export function dataUrlToBlob(dataUrl) {
  const m = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/.exec(dataUrl || '');
  if (!m) return null;
  const mime = m[1] || 'application/octet-stream';
  const b64 = !!m[2];
  const data = m[3] || '';
  try {
    if (b64) {
      const bin = atob(data);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new Blob([bytes], { type: mime });
    }
    return new Blob([decodeURIComponent(data)], { type: mime });
  } catch { return null; }
}

async function uploadDataUrl(propertyId, dataUrl, name, opts) {
  const blob = dataUrlToBlob(dataUrl);
  if (!blob) return null;
  // Pass the Blob straight to uploadPropertyMedia (it reads .type for ext +
  // contentType) — no `new File()` wrapper, which is unnecessary and throws on a
  // few legacy browsers, aborting the whole backfill.
  const url = await uploadPropertyMedia(propertyId, blob, name, opts);
  return isStorageUrl(url) ? url : null;   // only count a real Storage URL (not a base64 fallback)
}

// One-time, idempotent backfill: convert any base64 image fields still on a
// property to Storage URLs. Returns { property, migrated }. A field is only
// replaced AFTER a successful upload — a failure leaves the base64 in place to
// retry on the next load, so nothing is ever lost. Race-free: the caller applies
// the returned property through the normal save path (no separate DB write).
export async function migratePropertyImages(propertyId, property) {
  if (!propertyId || !property) return { property, migrated: 0 };
  let session = null;
  try { session = (await supabase.auth.getSession()).data.session; } catch { /* no session */ }
  if (!session) return { property, migrated: 0 };

  const hasWork =
    isB64(property?.profile?.logoDataUrl) ||
    isB64(property?.profile?.paymentQrDataUrl) ||
    (Array.isArray(property?.profile?.photoGallery) && property.profile.photoGallery.some(isB64)) ||
    (Array.isArray(property?.categories) && property.categories.some(c => isB64(c?.photoDataUrl)));
  if (!hasWork) return { property, migrated: 0 };

  let migrated = 0;
  const next = {
    ...property,
    profile: { ...(property.profile || {}) },
    categories: (property.categories || []).map(c => ({ ...c })),
  };

  if (isB64(next.profile.logoDataUrl)) {
    const u = await uploadDataUrl(propertyId, next.profile.logoDataUrl, 'logo');
    if (u) { next.profile.logoDataUrl = u; migrated++; }
  }
  if (isB64(next.profile.paymentQrDataUrl)) {
    const u = await uploadDataUrl(propertyId, next.profile.paymentQrDataUrl, 'payment-qr');
    if (u) { next.profile.paymentQrDataUrl = u; migrated++; }
  }
  if (Array.isArray(next.profile.photoGallery) && next.profile.photoGallery.some(isB64)) {
    const out = [];
    for (const item of next.profile.photoGallery) {
      if (isB64(item)) { const u = await uploadDataUrl(propertyId, item, 'gallery', { unique: true }); out.push(u || item); if (u) migrated++; }
      else out.push(item);
    }
    next.profile.photoGallery = out;
  }
  for (const c of next.categories) {
    if (isB64(c.photoDataUrl)) {
      const u = await uploadDataUrl(propertyId, c.photoDataUrl, 'room-' + c.id);
      if (u) { c.photoDataUrl = u; migrated++; }
    }
  }
  return { property: next, migrated };
}

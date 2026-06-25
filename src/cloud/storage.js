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

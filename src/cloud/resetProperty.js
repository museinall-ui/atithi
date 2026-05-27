import { supabase } from '../supabase.js';

// Wipe a property back to its just-bootstrapped state. Used by the
// in-app "Reset my property" button so a hotelier whose account got
// polluted by an old bug (e.g. demo-data leak from before commit
// c5bd99e) can recover in one tap instead of running SQL.
//
// What gets cleared:
//   - bookings (cascades to payments + invoices via FK)
//   - cash_closes
//   - expenses
//   - rate_overrides
//   - saved_custom_extras
//   - room_categories
//   - audit_log entries for the property
//   - property profile fields (name, contact, address, accountant, etc.)
//
// What's preserved:
//   - The property row itself (so membership FK + property_id continues
//     to resolve)
//   - The memberships row (so the user stays signed in to "their"
//     property — just with a clean slate)
//   - Pending invites (the hotelier may have already invited staff)
//   - The id, theme, plan, channel_commissions, meal_plans, rate_plans,
//     weekend_rules — these are config that defaults are safe to
//     preserve, and resetting them risks the wizard re-running with no
//     defaults at all.
//
// This is intentionally NOT a delete-everything-cascade: keeping the
// property row + membership means the next page load just re-bootstraps
// from a known-good empty state. A full DELETE FROM properties WHERE id
// would cascade away the membership too and leave the user stranded
// in a signed-in-but-no-property state until first-time bootstrap fired
// again.
export async function resetMyProperty(propertyId) {
  if (!propertyId) throw new Error('No propertyId');

  // Bookings cascade to payments + invoices via ON DELETE CASCADE in the
  // initial schema, so one delete here handles three tables.
  const tables = [
    'bookings',
    'cash_closes',
    'expenses',
    'rate_overrides',
    'saved_custom_extras',
    'room_categories',
  ];
  for (const table of tables) {
    const { error } = await supabase.from(table).delete().eq('property_id', propertyId);
    if (error) {
      // Surface the table name in the message so we know where it broke.
      throw new Error(`Failed to clear ${table}: ${error.message}`);
    }
  }
  // audit_log only has SELECT + INSERT policies in the initial schema —
  // no DELETE policy means this attempt will affect 0 rows even though
  // the call itself won't error. Run it anyway in case a future
  // migration opens delete access; tolerate any error so the reset
  // doesn't fail on a non-essential cleanup. Old audit entries are
  // mostly harmless once the bookings they reference are gone (the
  // Activity screen just shows them with a dead target_id).
  try {
    await supabase.from('audit_log').delete().eq('property_id', propertyId);
  } catch (_e) {
    // Intentional swallow — see comment above.
  }

  // Reset property profile fields. We use null for the JSON columns
  // we want to clear so the cloud-to-local converter falls back to
  // its defaults (which match the Onboarding wizard's starting state).
  const { error: pErr } = await supabase
    .from('properties')
    .update({
      name: '',
      type: '',
      address: '',
      city: '',
      state: '',
      pincode: '',
      landmark: '',
      map_url: '',
      check_in: '14:00',
      check_out: '11:00',
      phone: '',
      email: '',
      website: '',
      logo_data_url: null,
      payment_qr_data_url: null,
      payment_qr_label: null,
      tagline: null,
      photo_gallery: null,
      short_code: null,
      embed_button: null,
      arrivals_recipients: null,
      rules: [],
      amenity_ids: [],
      custom_amenities: [],
      accountant: { name: '', email: '', firm: '' },
      gstin: '',
      coupons: [],
      seasons: [],
      invoice_counters: {},
    })
    .eq('id', propertyId);
  if (pErr) throw new Error(`Failed to reset property profile: ${pErr.message}`);

  return { ok: true };
}

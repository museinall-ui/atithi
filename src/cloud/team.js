import { supabase } from '../supabase.js';

// Team-management cloud calls. Memberships table already exists from
// the initial schema; this module wraps the invite flow (pending_invites
// table from 20260603_team_invites.sql) and the membership reads/writes
// the Settings → Team accordion needs.

// List all confirmed members of a property (role + accepted_at + user_id).
// Names / emails come from auth.users which we can't read directly under
// RLS — but the User who created the invite has us, and at sign-in time
// the user's own email is on the session. Settings just shows role +
// 'Me' badge for the current user; future work could expose emails via
// a security-definer RPC.
export async function loadMembers(propertyId) {
  const { data, error } = await supabase
    .from('memberships')
    .select('id, user_id, role, permissions, accepted_at, invited_by, created_at')
    .eq('property_id', propertyId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

// List pending invites this property has issued.
export async function loadInvites(propertyId) {
  const { data, error } = await supabase
    .from('pending_invites')
    .select('id, email, role, permissions, invited_at, expires_at, token')
    .eq('property_id', propertyId)
    .order('invited_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

// Create an invite. Email lookups are case-insensitive (citext).
// `permissions` is an explicit array of permission strings the invitee
// will land with. Empty array means "use the role's defaults" (the app
// resolves that client-side). Saved on the invite so the hotelier's
// pick survives until the invitee actually signs in.
export async function inviteToTeam(propertyId, userId, email, role, permissions) {
  const cleanEmail = (email || '').trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) throw new Error('Invalid email');
  const { data, error } = await supabase
    .from('pending_invites')
    .insert({
      email: cleanEmail,
      property_id: propertyId,
      role,
      permissions: Array.isArray(permissions) ? permissions : [],
      invited_by: userId || null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Revoke a pending invite.
export async function revokeInvite(inviteId) {
  const { error } = await supabase.from('pending_invites').delete().eq('id', inviteId);
  if (error) throw error;
}

// R10-D1: re-fetch just THIS user's role + permissions for a property. Used to
// refresh the running session's RBAC when the user re-focuses the tab, so an
// owner changing a staffer's permissions takes effect without a full sign-out.
// Returns { role, permissions } or null if the membership is gone (removed).
export async function loadMyMembership(userId, propertyId) {
  if (!userId || !propertyId) return null;
  const { data, error } = await supabase
    .from('memberships')
    .select('role, permissions')
    .eq('user_id', userId)
    .eq('property_id', propertyId)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

// Change an existing member's role.
export async function setMemberRole(membershipId, role) {
  const { error } = await supabase
    .from('memberships')
    .update({ role })
    .eq('id', membershipId);
  if (error) throw error;
}

// Replace an existing member's permissions array. Saves the full
// override (empty array → app falls back to role defaults).
export async function setMemberPermissions(membershipId, permissions) {
  const { error } = await supabase
    .from('memberships')
    .update({ permissions: Array.isArray(permissions) ? permissions : [] })
    .eq('id', membershipId);
  if (error) throw error;
}

// Remove a member.
export async function removeMember(membershipId) {
  const { error } = await supabase.from('memberships').delete().eq('id', membershipId);
  if (error) throw error;
}

// Accept-on-sign-in: scan pending invites for the user's email and
// create memberships for each match, then delete the invite. Called
// from App.jsx in the post-sign-in flow. Returns the list of property
// ids the user was just added to.
export async function acceptPendingInvitesForUser(user) {
  if (!user || !user.email) return [];
  // Preferred path: the accept_invite() RPC (migration 20260617) creates the
  // membership with role + permissions FORCED from the invite row, so an
  // invitee can't self-assign a higher role. Falls back to the legacy
  // client-side insert when the RPC isn't pasted yet (the older policy still
  // permits that path).
  const rpc = await supabase.rpc('accept_invite');
  if (!rpc.error) {
    return Array.isArray(rpc.data) ? rpc.data : [];
  }
  const rpcMissing = rpc.error.code === '42883'
    || /does not exist|undefined.*function/i.test(rpc.error.message || '');
  if (!rpcMissing) throw rpc.error;

  // ---- Legacy fallback (pre-20260617) ----
  const { data: invites, error } = await supabase
    .from('pending_invites')
    .select('id, property_id, role, permissions')
    .eq('email', user.email.toLowerCase());
  if (error) throw error;
  if (!invites || !invites.length) return [];
  const acceptedProperties = [];
  for (const inv of invites) {
    // Create membership. Unique constraint on (user_id, property_id)
    // means a duplicate (e.g. user was somehow already added) errors
    // and we just skip the invite. Permissions copied straight from
    // the invite so what the hotelier picked is what the invitee gets.
    const { error: mErr } = await supabase.from('memberships').insert({
      user_id: user.id,
      property_id: inv.property_id,
      role: inv.role,
      permissions: Array.isArray(inv.permissions) ? inv.permissions : [],
      accepted_at: new Date().toISOString(),
    });
    if (mErr && mErr.code !== '23505') {
      // 23505 = unique_violation — already a member, harmless. Anything
      // else we surface.
      throw mErr;
    }
    // Delete the invite either way (whether the membership was created
    // fresh or already existed).
    await supabase.from('pending_invites').delete().eq('id', inv.id);
    acceptedProperties.push(inv.property_id);
  }
  return acceptedProperties;
}

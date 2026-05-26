import { useState, useEffect, useMemo } from 'react';
import { T } from '../tokens.js';
import { loadMembers, loadInvites, inviteToTeam, revokeInvite, setMemberRole, setMemberPermissions, removeMember } from '../cloud/team.js';
import Icon from './Icon.jsx';

// Team-management UI used inside the Property Profile sheet. Renders
// inline cloud-loaded data: current members + pending invites + invite
// form. Gracefully degrades when DEMO_MODE is on (no session) — shows
// a "sign in to manage your team" explainer instead.

// The role still exists as a quick-prefill template + the hook RLS uses
// (no per-role DB checks today, but they'll attach to this field when
// they land). The hotelier picks permissions hand-by-hand; the role is
// just what the "Apply defaults" button maps to.
const ROLES = [
  { id: 'owner',     label: 'Owner',     desc: 'Full access — every permission' },
  { id: 'manager',   label: 'Manager',   desc: 'Full access except removing team members' },
  { id: 'reception', label: 'Reception', desc: 'Bookings + payments + day close' },
];

// Every permission Atithi recognises. Adding one here surfaces a new
// row in the checklist; the wiring (gating actual UI by permission) is
// done where each feature lives. Keep the order grouped by the area
// the hotelier thinks in: front-desk → money → reporting → admin.
const PERMISSIONS = [
  { id: 'manage_bookings', label: 'Manage bookings',           desc: 'Create, edit, cancel — also drag on the diary' },
  { id: 'manage_payments', label: 'Record payments + refunds', desc: 'Settle balances · refund · credit notes' },
  { id: 'manage_expenses', label: 'Log expenses + day close',  desc: 'Add expenses · close the day · cash accounts' },
  { id: 'manage_rates',    label: 'Edit rate calendar',        desc: 'Daily rates · weekend uplift · close-outs · seasons' },
  { id: 'manage_invoices', label: 'Issue / void invoices',     desc: 'Mint tax invoices · GST toggle (Invoicing tier)' },
  { id: 'view_reports',    label: 'See reports',               desc: 'Revenue, occupancy, profit & loss, CSV exports' },
  { id: 'manage_settings', label: 'Edit property settings',    desc: 'Profile · rooms · meal plans · QR · integrations' },
  { id: 'manage_team',     label: 'Manage team',               desc: 'Invite or remove team members' },
];

// Role → default permissions. Used as a quick prefill when the
// hotelier picks a role on the invite form, or when they tap
// "Apply role defaults" on an existing member. Owner = all, manager
// = all except managing team, reception = front-desk + money tasks.
const ROLE_DEFAULT_PERMS = {
  owner:     PERMISSIONS.map(p => p.id),
  manager:   PERMISSIONS.filter(p => p.id !== 'manage_team').map(p => p.id),
  reception: ['manage_bookings', 'manage_payments', 'manage_expenses'],
};

function roleLabel(id) {
  return (ROLES.find(r => r.id === id) || { label: id }).label;
}

// Resolve a member's effective permissions: the stored array if any,
// otherwise the defaults for their role. Used everywhere downstream
// in the app that wants to ask "can this user do X?".
function effectivePermissions(role, stored) {
  if (Array.isArray(stored) && stored.length > 0) return stored;
  return ROLE_DEFAULT_PERMS[role] || [];
}

// Permission checklist used by both the member-row editor and the
// invite form. Pure presentation — parent owns the perms array.
function PermissionChecklist({ perms, onChange, disabled, role, onApplyRoleDefaults }) {
  const set = new Set(perms);
  const toggle = (id) => {
    if (disabled) return;
    const next = new Set(set);
    if (next.has(id)) next.delete(id); else next.add(id);
    onChange(Array.from(next));
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 9, fontWeight: 800, color: T.ink3, letterSpacing: 0.4, textTransform: 'uppercase' }}>
          Permissions · {set.size} of {PERMISSIONS.length} on
        </span>
        {onApplyRoleDefaults && role && (
          <button
            type="button"
            onClick={onApplyRoleDefaults}
            disabled={disabled}
            style={{ background: 'none', border: 'none', cursor: disabled ? 'not-allowed' : 'pointer', color: T.primary, fontSize: 10, fontWeight: 700 }}
            title={`Reset to ${roleLabel(role)} defaults`}
          >
            ↻ {roleLabel(role)} defaults
          </button>
        )}
      </div>
      {PERMISSIONS.map(p => {
        const on = set.has(p.id);
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => toggle(p.id)}
            disabled={disabled}
            style={{
              display: 'flex', alignItems: 'flex-start', gap: 8,
              padding: '7px 9px', borderRadius: 6,
              border: `1px solid ${on ? T.primary : T.border}`,
              background: on ? T.primaryLt : T.card,
              cursor: disabled ? 'not-allowed' : 'pointer',
              textAlign: 'left', opacity: disabled ? 0.55 : 1,
            }}
          >
            <span style={{
              width: 16, height: 16, borderRadius: 4, flexShrink: 0,
              background: on ? T.primary : T.card,
              border: `1.5px solid ${on ? T.primary : T.border}`,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              marginTop: 1,
            }}>
              {on && <Icon name="check" size={10} color="#fff" stroke={3} />}
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: on ? T.primaryDk : T.ink, display: 'block' }}>{p.label}</span>
              <span style={{ fontSize: 10, fontWeight: 600, color: on ? T.primaryDk : T.ink3, opacity: 0.85, marginTop: 1, display: 'block', lineHeight: 1.35 }}>{p.desc}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default function TeamSection({ session, propertyId }) {
  const signedIn = !!session && !!propertyId;

  const [members, setMembers] = useState([]);
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('reception');
  const [invitePerms, setInvitePerms] = useState(ROLE_DEFAULT_PERMS.reception);
  const [busy, setBusy] = useState(false);

  // Which member row is showing the expanded permissions editor.
  // null = none open. Only one open at a time to keep the sheet tidy.
  const [openMemberId, setOpenMemberId] = useState(null);

  const refresh = async () => {
    if (!signedIn) return;
    setLoading(true);
    setError('');
    try {
      const [m, i] = await Promise.all([
        loadMembers(propertyId),
        loadInvites(propertyId),
      ]);
      setMembers(m);
      setInvites(i);
    } catch (e) {
      setError(e?.message || 'Could not load team');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [propertyId, signedIn]);

  const handleInvite = async () => {
    const email = inviteEmail.trim().toLowerCase();
    if (!email || !email.includes('@')) {
      setError('Enter a valid email address');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await inviteToTeam(propertyId, session.user.id, email, inviteRole, invitePerms);
      setInviteEmail('');
      setInviteRole('reception');
      setInvitePerms(ROLE_DEFAULT_PERMS.reception);
      await refresh();
    } catch (e) {
      setError(e?.message || 'Could not invite');
    } finally {
      setBusy(false);
    }
  };

  const handleRevoke = async (inviteId) => {
    setBusy(true);
    try { await revokeInvite(inviteId); await refresh(); } catch (e) { setError(e?.message || 'Could not revoke'); } finally { setBusy(false); }
  };

  const handleRoleChange = async (memberId, role) => {
    setBusy(true);
    try { await setMemberRole(memberId, role); await refresh(); } catch (e) { setError(e?.message || 'Could not update role'); } finally { setBusy(false); }
  };

  // Persist the member's permissions array. Empty array sent when
  // every box is unchecked — the app reads that back as "no perms"
  // (deliberately denying everything; not the same as "use role
  // defaults" which is the explicit "Apply role defaults" button).
  const handlePermsChange = async (memberId, perms) => {
    // Optimistic local update so the toggle feels instant; cloud
    // round-trip lands a moment later.
    setMembers(prev => prev.map(m => m.id === memberId ? { ...m, permissions: perms } : m));
    try { await setMemberPermissions(memberId, perms); }
    catch (e) { setError(e?.message || 'Could not update permissions'); await refresh(); }
  };

  const handleRemove = async (memberId) => {
    if (!confirm('Remove this team member?')) return;
    setBusy(true);
    try { await removeMember(memberId); await refresh(); } catch (e) { setError(e?.message || 'Could not remove'); } finally { setBusy(false); }
  };

  // DEMO_MODE / unsigned-in fallback. Shows the permission picker
  // surface (read-only preview) so the hotelier can SEE what they
  // get once they flip DEMO_MODE — without us pretending the saves
  // would work.
  if (!signedIn) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ padding: '10px 12px', background: T.bgSoft, border: `1px solid ${T.borderSoft}`, borderRadius: 7, fontSize: 11, color: T.ink3, lineHeight: 1.5 }}>
          <strong>Sign in to manage your team.</strong> Live invites + saves work once you switch from DEMO to your Supabase account. The preview below shows what the picker looks like.
        </div>
        <div style={{ opacity: 0.7, pointerEvents: 'none' }}>
          <div style={{ fontSize: 9, fontWeight: 800, color: T.ink3, letterSpacing: 0.4, marginBottom: 6, textTransform: 'uppercase' }}>Preview · permission picker</div>
          <PermissionChecklist
            perms={ROLE_DEFAULT_PERMS.reception}
            onChange={() => {}}
            disabled={true}
            role="reception"
          />
        </div>
      </div>
    );
  }

  const myUserId = session && session.user && session.user.id;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {error && (
        <div style={{ padding: '8px 10px', background: 'oklch(95% 0.06 30)', border: `1px solid ${T.danger}`, borderRadius: 7, fontSize: 11, color: T.danger, fontWeight: 600 }}>
          {error}
        </div>
      )}

      {/* Current members */}
      <div>
        <div style={{ fontSize: 9, fontWeight: 800, color: T.ink3, letterSpacing: 0.5, marginBottom: 6, textTransform: 'uppercase' }}>Members</div>
        {loading && members.length === 0 ? (
          <div style={{ fontSize: 11, color: T.ink3, fontStyle: 'italic', padding: '6px 2px' }}>Loading…</div>
        ) : members.length === 0 ? (
          <div style={{ fontSize: 11, color: T.ink3, fontStyle: 'italic', padding: '6px 2px' }}>No members yet (this shouldn't be — you're a member).</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {members.map(m => {
              const isMe = m.user_id === myUserId;
              const effPerms = effectivePermissions(m.role, m.permissions);
              const usingDefaults = !Array.isArray(m.permissions) || m.permissions.length === 0;
              const isOpen = openMemberId === m.id;
              return (
                <div key={m.id} style={{
                  background: T.bgSoft, border: `1px solid ${T.borderSoft}`, borderRadius: 7,
                }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: 8,
                  }}>
                    <div style={{
                      width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                      background: isMe ? T.primaryLt : T.card, color: isMe ? T.primaryDk : T.ink3,
                      border: `1px solid ${isMe ? T.primary : T.borderSoft}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 800,
                    }}>
                      {isMe ? 'ME' : '?'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: T.ink }}>
                        {isMe ? 'You' : `Member · ${String(m.user_id || '').slice(0, 8)}…`}
                      </div>
                      <div style={{ fontSize: 10, color: T.ink3, fontWeight: 600, marginTop: 1 }}>
                        {effPerms.length}/{PERMISSIONS.length} permissions {usingDefaults ? '· role defaults' : '· custom'} · joined {m.accepted_at ? new Date(m.accepted_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'pending'}
                      </div>
                    </div>
                    <select
                      value={m.role}
                      onChange={(e) => handleRoleChange(m.id, e.target.value)}
                      disabled={busy || isMe}
                      title={isMe ? "Can't change your own role" : 'Change role'}
                      style={{ fontSize: 11, fontWeight: 700, color: T.ink2, padding: '4px 6px', border: `1px solid ${T.border}`, borderRadius: 5, background: isMe ? T.bgSunk : T.card, opacity: isMe ? 0.6 : 1 }}
                    >
                      {ROLES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                    </select>
                    {!isMe && (
                      <button
                        onClick={() => handleRemove(m.id)}
                        disabled={busy}
                        title="Remove member"
                        style={{ background: 'none', border: 'none', color: T.danger, cursor: 'pointer', padding: 4 }}
                      ><Icon name="x" size={13} /></button>
                    )}
                  </div>
                  {/* Per-member permission editor — collapsed by default
                      to keep the member list compact. Tap the row to
                      expand and toggle individual permissions. */}
                  <button
                    type="button"
                    onClick={() => setOpenMemberId(isOpen ? null : m.id)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '6px 10px', background: 'transparent', border: 'none',
                      borderTop: `1px solid ${T.borderSoft}`, cursor: 'pointer',
                      color: T.ink2, fontSize: 11, fontWeight: 700,
                    }}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      <Icon name={isOpen ? 'chevU' : 'chevD'} size={11} color={T.ink3} />
                      {isOpen ? 'Hide permissions' : 'Edit permissions'}
                    </span>
                    {!isOpen && (
                      <span style={{ fontSize: 10, fontWeight: 600, color: T.ink3 }}>{effPerms.length} on</span>
                    )}
                  </button>
                  {isOpen && (
                    <div style={{ padding: '8px 10px 10px', borderTop: `1px solid ${T.borderSoft}` }}>
                      <PermissionChecklist
                        perms={effPerms}
                        onChange={(next) => handlePermsChange(m.id, next)}
                        disabled={busy}
                        role={m.role}
                        onApplyRoleDefaults={() => handlePermsChange(m.id, ROLE_DEFAULT_PERMS[m.role] || [])}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Pending invites */}
      {invites.length > 0 && (
        <div>
          <div style={{ fontSize: 9, fontWeight: 800, color: T.ink3, letterSpacing: 0.5, marginBottom: 6, textTransform: 'uppercase' }}>Pending invites</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {invites.map(inv => {
              const invPerms = effectivePermissions(inv.role, inv.permissions);
              return (
                <div key={inv.id} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: 8, background: 'oklch(96% 0.04 75)', border: `1px solid oklch(72% 0.12 75)`, borderRadius: 7,
                }}>
                  <Icon name="mail" size={14} color="oklch(40% 0.10 75)" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'oklch(40% 0.10 75)' }}>{inv.email}</div>
                    <div style={{ fontSize: 10, color: 'oklch(40% 0.10 75)', fontWeight: 600, marginTop: 1 }}>
                      {roleLabel(inv.role)} · {invPerms.length} perm{invPerms.length === 1 ? '' : 's'} · invited {new Date(inv.invited_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                    </div>
                  </div>
                  <button
                    onClick={() => handleRevoke(inv.id)}
                    disabled={busy}
                    title="Revoke invite"
                    style={{ background: 'none', border: 'none', color: 'oklch(40% 0.10 75)', cursor: 'pointer', padding: 4, fontSize: 11, fontWeight: 700 }}
                  >Revoke</button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Invite form */}
      <div style={{ paddingTop: 8, borderTop: `1px dashed ${T.borderSoft}` }}>
        <div style={{ fontSize: 9, fontWeight: 800, color: T.ink3, letterSpacing: 0.5, marginBottom: 6, textTransform: 'uppercase' }}>Invite someone</div>
        <input
          value={inviteEmail}
          onChange={(e) => setInviteEmail(e.target.value)}
          placeholder="teammate@email.com"
          type="email"
          style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', border: `1px solid ${T.border}`, borderRadius: 7, fontSize: 12, color: T.ink, background: T.card, outline: 'none', marginBottom: 8 }}
        />
        <div style={{ fontSize: 9, fontWeight: 700, color: T.ink3, letterSpacing: 0.3, marginBottom: 4 }}>ROLE · also prefills permissions below</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
          {ROLES.map(r => {
            const sel = inviteRole === r.id;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => {
                  setInviteRole(r.id);
                  // Reset permissions to the new role's defaults.
                  // Hotelier can still toggle individual ones afterward.
                  setInvitePerms(ROLE_DEFAULT_PERMS[r.id] || []);
                }}
                style={{
                  textAlign: 'left', padding: '8px 10px', borderRadius: 7,
                  border: `1.5px solid ${sel ? T.primary : T.border}`,
                  background: sel ? T.primaryLt : T.card,
                  color: sel ? T.primaryDk : T.ink2,
                  fontSize: 12, fontWeight: 700, cursor: 'pointer',
                }}
              >
                <div>{r.label}</div>
                <div style={{ fontSize: 10, fontWeight: 600, color: sel ? T.primaryDk : T.ink3, marginTop: 1, opacity: 0.85 }}>{r.desc}</div>
              </button>
            );
          })}
        </div>
        {/* Per-permission picker for the invite. Pre-filled from the
            role's defaults; hotelier can tick / untick to customize
            before sending. This is the "not automatic" piece. */}
        <PermissionChecklist
          perms={invitePerms}
          onChange={setInvitePerms}
          disabled={busy}
          role={inviteRole}
          onApplyRoleDefaults={() => setInvitePerms(ROLE_DEFAULT_PERMS[inviteRole] || [])}
        />
        <button
          onClick={handleInvite}
          disabled={busy || !inviteEmail.trim()}
          style={{
            marginTop: 10,
            width: '100%', padding: '9px 12px', borderRadius: 8,
            border: 'none',
            background: (busy || !inviteEmail.trim()) ? T.bgSoft : T.primary,
            color: (busy || !inviteEmail.trim()) ? T.ink3 : '#fff',
            fontSize: 12, fontWeight: 700, cursor: (busy || !inviteEmail.trim()) ? 'not-allowed' : 'pointer',
          }}
        >{busy ? 'Sending…' : `Send invite · ${invitePerms.length} permission${invitePerms.length === 1 ? '' : 's'}`}</button>
        <div style={{ marginTop: 8, padding: '6px 8px', background: T.bgSoft, border: `1px solid ${T.borderSoft}`, borderRadius: 6, fontSize: 10, color: T.ink3, lineHeight: 1.5 }}>
          The invitee gets added to your property the next time they sign in to Atithi with this email (magic-link). No separate invite email is sent yet — share the app URL via WhatsApp.
        </div>
      </div>
    </div>
  );
}

// Exported so the rest of the app can ask "does this user have
// permission X?" once role-based UI gating starts landing. Not used
// by anything yet (Phase 6 RBAC work will wire it in) — exported now
// so the contract is fixed before downstream code starts importing it.
export { PERMISSIONS, ROLE_DEFAULT_PERMS, effectivePermissions };

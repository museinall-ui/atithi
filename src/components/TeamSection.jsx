import { useState, useEffect } from 'react';
import { T } from '../tokens.js';
import { loadMembers, loadInvites, inviteToTeam, revokeInvite, setMemberRole, removeMember } from '../cloud/team.js';
import Icon from './Icon.jsx';

// Team-management UI used inside the Property Profile sheet. Renders
// inline cloud-loaded data: current members + pending invites + invite
// form. Gracefully degrades when DEMO_MODE is on (no session) — shows
// a "sign in to manage your team" explainer instead.
//
// Role gating, the second half of RBAC, is intentionally minimal here:
// any member can edit any team data via the underlying RLS policies.
// A finer-grained gate (reception can't add members, etc.) will land
// once the first multi-member property exists to test against.

const ROLES = [
  { id: 'owner',     label: 'Owner',     desc: 'Full access — bookings, settings, invoicing, team' },
  { id: 'manager',   label: 'Manager',   desc: 'Full access except removing owners' },
  { id: 'reception', label: 'Reception', desc: 'Bookings + payments + day close' },
];

function roleLabel(id) {
  return (ROLES.find(r => r.id === id) || { label: id }).label;
}

export default function TeamSection({ session, propertyId }) {
  const signedIn = !!session && !!propertyId;

  const [members, setMembers] = useState([]);
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('reception');
  const [busy, setBusy] = useState(false);

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
      await inviteToTeam(propertyId, session.user.id, email, inviteRole);
      setInviteEmail('');
      setInviteRole('reception');
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

  const handleRemove = async (memberId) => {
    if (!confirm('Remove this team member?')) return;
    setBusy(true);
    try { await removeMember(memberId); await refresh(); } catch (e) { setError(e?.message || 'Could not remove'); } finally { setBusy(false); }
  };

  // DEMO_MODE / unsigned-in fallback. The hotelier needs to be in
  // cloud mode to manage real team members; offering anything else
  // would be misleading.
  if (!signedIn) {
    return (
      <div style={{ padding: '10px 12px', background: T.bgSoft, border: `1px solid ${T.borderSoft}`, borderRadius: 7, fontSize: 11, color: T.ink3, lineHeight: 1.5 }}>
        <strong>Sign in to manage your team.</strong> Team members + role-based access become available once you switch from DEMO mode to your live Supabase account. The schema is ready; you just need to be signed in to invite anyone.
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
              return (
                <div key={m.id} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: 8, background: T.bgSoft, border: `1px solid ${T.borderSoft}`, borderRadius: 7,
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
                      Joined {m.accepted_at ? new Date(m.accepted_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'pending'}
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
            {invites.map(inv => (
              <div key={inv.id} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: 8, background: 'oklch(96% 0.04 75)', border: `1px solid oklch(72% 0.12 75)`, borderRadius: 7,
              }}>
                <Icon name="mail" size={14} color="oklch(40% 0.10 75)" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'oklch(40% 0.10 75)' }}>{inv.email}</div>
                  <div style={{ fontSize: 10, color: 'oklch(40% 0.10 75)', fontWeight: 600, marginTop: 1 }}>
                    {roleLabel(inv.role)} · invited {new Date(inv.invited_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                  </div>
                </div>
                <button
                  onClick={() => handleRevoke(inv.id)}
                  disabled={busy}
                  title="Revoke invite"
                  style={{ background: 'none', border: 'none', color: 'oklch(40% 0.10 75)', cursor: 'pointer', padding: 4, fontSize: 11, fontWeight: 700 }}
                >Revoke</button>
              </div>
            ))}
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
        <div style={{ fontSize: 9, fontWeight: 700, color: T.ink3, letterSpacing: 0.3, marginBottom: 4 }}>ROLE</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
          {ROLES.map(r => {
            const sel = inviteRole === r.id;
            return (
              <button
                key={r.id}
                onClick={() => setInviteRole(r.id)}
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
        <button
          onClick={handleInvite}
          disabled={busy || !inviteEmail.trim()}
          style={{
            width: '100%', padding: '9px 12px', borderRadius: 8,
            border: 'none',
            background: (busy || !inviteEmail.trim()) ? T.bgSoft : T.primary,
            color: (busy || !inviteEmail.trim()) ? T.ink3 : '#fff',
            fontSize: 12, fontWeight: 700, cursor: (busy || !inviteEmail.trim()) ? 'not-allowed' : 'pointer',
          }}
        >{busy ? 'Sending…' : 'Send invite'}</button>
        <div style={{ marginTop: 8, padding: '6px 8px', background: T.bgSoft, border: `1px solid ${T.borderSoft}`, borderRadius: 6, fontSize: 10, color: T.ink3, lineHeight: 1.5 }}>
          The invitee gets added to your property the next time they sign in to Atithi with this email (magic-link). No separate invite email is sent yet — share the app URL via WhatsApp.
        </div>
      </div>
    </div>
  );
}

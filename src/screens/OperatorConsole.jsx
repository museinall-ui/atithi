import { useState, useEffect } from 'react';
import { T } from '../tokens.js';
import Card from '../components/Card.jsx';
import Field from '../components/Field.jsx';
import Btn from '../components/Btn.jsx';
import ScreenHeader from '../components/ScreenHeader.jsx';

// Phase 5 — OPERATOR CONSOLE (AtithiBook staff only).
//
// AtithiBook is the service provider: WE set up each hotel's AIOSELL channel
// connection. This private screen — gated to our admin logins (server-enforced in
// api/aiosell-admin.js) — is where we see, across EVERY hotel, what's mapped,
// what isn't, and the platform connection status, and where we fill in a hotel's
// AIOSELL hotel code + room/rate-plan codes. Hoteliers never see this.

function Pill({ tone, children }) {
  const tones = {
    ok:    { bg: '#dcfce7', fg: '#166534' },
    info:  { bg: '#dbeafe', fg: '#1e40af' },
    warn:  { bg: '#fef3c7', fg: '#92400e' },
    muted: { bg: T.bgSoft, fg: T.ink3 },
  }[tone] || { bg: T.bgSoft, fg: T.ink3 };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 999, background: tones.bg, color: tones.fg, fontSize: 11, fontWeight: 700 }}>{children}</span>
  );
}

const STATUS = {
  active:         { tone: 'ok',   label: 'Active' },
  mapped_offline: { tone: 'info', label: 'Mapped (platform offline)' },
  unmapped:       { tone: 'warn', label: 'Not set up' },
};

function relTime(iso) {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (isNaN(then)) return '';
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + 'm ago';
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return hrs + 'h ago';
  return Math.round(hrs / 24) + 'd ago';
}

export default function OperatorConsole({ go, session }) {
  const [view, setView] = useState({ loading: true });
  const [editing, setEditing] = useState(null);   // propertyId being edited
  const [draft, setDraft] = useState({ hotelCode: '', rooms: {} });
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState(null);

  async function call(body) {
    const ac = new AbortController();
    const tid = setTimeout(() => ac.abort(), 20000);
    try {
      const resp = await fetch('/api/aiosell-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ((session && session.access_token) || '') },
        body: JSON.stringify(body),
        signal: ac.signal,
      });
      const data = await resp.json().catch(() => ({}));
      return { status: resp.status, data };
    } catch (e) {
      return { status: 0, data: { error: String(e?.message || e) } };
    } finally {
      clearTimeout(tid);
    }
  }

  async function load() {
    setView({ loading: true });
    const r = await call({ action: 'list' });
    if (r.status === 403) return setView({ loading: false, denied: true });
    if (r.status === 404) return setView({ loading: false, local: true });
    if (r.status === 503) return setView({ loading: false, error: 'The operator console needs the service-role key set in Vercel.' });
    if (r.status !== 200 || !r.data || !r.data.ok) return setView({ loading: false, error: (r.data && r.data.error) || ('HTTP ' + r.status) });
    setView({ loading: false, platformConnected: r.data.platformConnected, hotels: r.data.hotels || [] });
  }

  useEffect(() => {
    if (session && session.access_token) load();
    else setView({ loading: false, denied: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session && session.access_token]);

  function startEdit(h) {
    const rooms = {};
    h.rooms.forEach(r => { rooms[r.roomTypeId] = { roomCode: r.roomCode || '', rateplanCode: r.rateplanCode || '' }; });
    setDraft({ hotelCode: h.hotelCode || '', rooms });
    setSaveMsg(null);
    setEditing(h.id);
  }
  function setRoom(id, field, val) {
    setDraft(d => ({ ...d, rooms: { ...d.rooms, [id]: { ...(d.rooms[id] || {}), [field]: val } } }));
  }
  async function save(h) {
    setSaving(true);
    setSaveMsg(null);
    const r = await call({ action: 'setMapping', propertyId: h.id, hotelCode: (draft.hotelCode || '').trim(), rooms: draft.rooms });
    setSaving(false);
    if (r.status === 200 && r.data && r.data.ok) {
      setEditing(null);
      await load();
    } else {
      setSaveMsg((r.data && r.data.error) || ('Save failed (HTTP ' + r.status + ')'));
    }
  }

  const wrap = (children) => (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: T.bg }}>
      <ScreenHeader title="Operator console" subtitle="Channel manager · all hotels" onBack={() => go('__back')} />
      <div style={{ flex: 1, overflow: 'auto', padding: 16, paddingBottom: 100 }}>{children}</div>
    </div>
  );

  const note = (title, body) => wrap(
    <Card padding={20} style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: T.ink, marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 12.5, color: T.ink3, fontWeight: 600, lineHeight: 1.55 }}>{body}</div>
    </Card>
  );

  if (view.loading) return note('Loading…', 'Fetching every hotel and its channel-manager status.');
  if (view.denied) return note('Operators only', 'This area is for the AtithiBook team. Your account isn’t on the operator list.');
  if (view.local) return note('Live site only', 'The operator console talks to a server function that only runs on the deployed site (atithi-seven.vercel.app), not local preview.');
  if (view.error) return note('Couldn’t load', view.error);

  const hotels = view.hotels || [];
  const setUp = hotels.filter(h => h.status !== 'unmapped').length;

  return wrap(
    <>
      {/* Platform status */}
      <Card padding={14} style={{ marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: T.ink }}>AIOSELL platform</div>
          <div style={{ fontSize: 11, color: T.ink3, fontWeight: 600, marginTop: 2 }}>
            {view.platformConnected ? 'Credentials set in this deployment' : 'Login not set yet (add env vars at onboarding)'}
          </div>
        </div>
        <Pill tone={view.platformConnected ? 'ok' : 'warn'}>{view.platformConnected ? 'Connected' : 'Not connected'}</Pill>
      </Card>

      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '0 4px', marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: T.ink2, letterSpacing: 0.3 }}>HOTELS ({hotels.length})</div>
        <div style={{ fontSize: 11, color: T.ink3, fontWeight: 700 }}>{setUp} set up · {hotels.length - setUp} to do</div>
      </div>

      {hotels.length === 0 && (
        <Card padding={18} style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 12.5, color: T.ink3, fontWeight: 600 }}>No properties yet.</div>
        </Card>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {hotels.map(h => {
          const st = STATUS[h.status] || STATUS.unmapped;
          const isOpen = editing === h.id;
          return (
            <Card key={h.id} padding={14}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.name}</div>
                  <div style={{ fontSize: 11, color: T.ink3, fontWeight: 600, marginTop: 3 }}>
                    {h.mappedCount}/{h.totalRooms} rooms mapped{h.hotelCode ? ` · code: ${h.hotelCode}` : ' · no hotel code'}
                  </div>
                  {h.syncHealth && (
                    <div style={{ fontSize: 10.5, fontWeight: 700, marginTop: 3, color: h.syncHealth.ok ? '#166534' : T.danger }}>
                      {h.syncHealth.ok ? '● Sync OK' : '● Sync failing'} · {relTime(h.syncHealth.at)}
                    </div>
                  )}
                </div>
                <Pill tone={st.tone}>{st.label}</Pill>
              </div>

              {!isOpen && (
                <div style={{ marginTop: 12 }}>
                  <Btn variant="soft" size="sm" onClick={() => startEdit(h)}>
                    {h.status === 'unmapped' ? 'Set up' : 'Edit mapping'}
                  </Btn>
                </div>
              )}

              {isOpen && (
                <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${T.borderSoft}` }}>
                  <Field
                    label="AIOSELL hotel code"
                    value={draft.hotelCode}
                    onChange={(e) => setDraft(d => ({ ...d, hotelCode: e.target.value }))}
                    placeholder="e.g. sandbox-pms"
                  />
                  <div style={{ height: 12 }} />
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: T.ink2, marginBottom: 8 }}>Room → AIOSELL codes</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {h.rooms.map(r => (
                      <div key={r.roomTypeId} style={{ border: `1px solid ${T.borderSoft}`, borderRadius: 10, padding: 10 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 700, color: T.ink, marginBottom: 8 }}>{r.name}</div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <Field label="Room code" value={(draft.rooms[r.roomTypeId] || {}).roomCode || ''} onChange={(e) => setRoom(r.roomTypeId, 'roomCode', e.target.value)} placeholder="executive" style={{ flex: 1 }} />
                          <Field label="Rate plan code" value={(draft.rooms[r.roomTypeId] || {}).rateplanCode || ''} onChange={(e) => setRoom(r.roomTypeId, 'rateplanCode', e.target.value)} placeholder="executive-s-ep" style={{ flex: 1 }} />
                        </div>
                      </div>
                    ))}
                  </div>
                  {saveMsg && <div style={{ marginTop: 10, fontSize: 11.5, color: T.danger, fontWeight: 600 }}>{saveMsg}</div>}
                  <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                    <Btn variant="primary" size="sm" onClick={() => save(h)} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Btn>
                    <Btn variant="ghost" size="sm" onClick={() => { setEditing(null); setSaveMsg(null); }} disabled={saving}>Cancel</Btn>
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </>
  );
}

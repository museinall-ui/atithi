import { useState, useEffect, useMemo, useRef } from 'react';
import { T } from '../tokens.js';
import { ANCHOR, ymd } from '../data.js';
import { loadActivity } from '../cloud/activity.js';
import Icon from '../components/Icon.jsx';
import Card from '../components/Card.jsx';
import ScreenHeader from '../components/ScreenHeader.jsx';

// Property-wide activity log. Reads from the cloud audit_log table via
// loadActivity(). Shows who-did-what with timestamps so the property
// owner can see "Reception cancelled BK-2851 at 3:14 PM" without
// having to dig into individual booking activity feeds.
//
// In DEMO mode there's no session → no audit_log writes have happened →
// the screen shows a "sign in to start tracking" explainer.

// Action → display metadata. Adding a new action elsewhere (App.jsx
// logEvent calls) just shows up as the raw action string until you
// teach this map about it.
// `key` maps to an i18n string (see src/i18n.js); `label` is the English
// fallback used when no translation exists.
const ACTION_META = {
  'booking.create':            { key: 'actBookingCreate',  label: 'Created booking',     icon: 'plus',  color: T.ok,      group: 'booking' },
  'booking.edit':              { key: 'actBookingEdit',    label: 'Edited booking',      icon: 'edit',  color: T.indigo,  group: 'booking' },
  'booking.cancel':            { key: 'actBookingCancel',  label: 'Cancelled booking',   icon: 'x',     color: T.danger,  group: 'booking' },
  'booking.status':            { key: 'actBookingStatus',  label: 'Changed status',      icon: 'sync',  color: T.indigo,  group: 'booking' },
  'booking.move':              { key: 'actBookingMove',    label: 'Moved booking',       icon: 'arrow', color: T.indigo,  group: 'booking' },
  'booking.hold_extended':     { key: 'actHoldExtended',   label: 'Extended hold',       icon: 'clock', color: 'oklch(50% 0.14 75)', group: 'booking' },
  'booking.gst_toggle':        { key: 'actGstToggle',      label: 'Changed GST flag',    icon: 'tag',   color: T.ink2,    group: 'booking' },
  'booking.vip_toggle':        { key: 'actVipToggle',      label: 'Changed VIP flag',    icon: 'check', color: 'oklch(60% 0.16 60)', group: 'booking' },
  'booking.voice_note_add':    { key: 'actVoiceAdd',       label: 'Added voice note',    icon: 'plus',  color: T.ink2,    group: 'booking' },
  'booking.voice_note_remove': { key: 'actVoiceRemove',    label: 'Deleted voice note',  icon: 'x',     color: T.ink3,    group: 'booking' },
  'payment.add':               { key: 'actPaymentAdd',     label: 'Recorded payment',    icon: 'inr',   color: T.ok,      group: 'payment' },
  'payment.refund':            { key: 'actPaymentRefund',  label: 'Recorded refund',     icon: 'arrow', color: T.danger,  group: 'payment' },
  'payment.credit':            { key: 'actPaymentCredit',  label: 'Issued credit note',  icon: 'tag',   color: T.indigo,  group: 'payment' },
  'invoice.issue':             { key: 'actInvoiceIssue',   label: 'Issued invoice',      icon: 'check', color: T.teal,    group: 'invoice' },
  'invoice.void':              { key: 'actInvoiceVoid',    label: 'Voided invoice',      icon: 'x',     color: T.danger,  group: 'invoice' },
  'expense.add':               { key: 'actExpenseAdd',     label: 'Logged expense',      icon: 'inr',   color: 'oklch(55% 0.15 30)', group: 'expense' },
  'expense.remove':            { key: 'actExpenseRemove',  label: 'Deleted expense',     icon: 'x',     color: T.ink3,    group: 'expense' },
  'expense.update':            { key: 'actExpenseUpdate',  label: 'Updated expense',     icon: 'edit',  color: T.ink3,    group: 'expense' },
};

const GROUP_FILTERS = [
  { id: 'all',      key: 'filterAll',      label: 'All',      prefix: '' },
  { id: 'booking',  key: 'filterBookings', label: 'Bookings', prefix: 'booking.' },
  { id: 'payment',  key: 'filterPayments', label: 'Payments', prefix: 'payment.' },
  { id: 'invoice',  key: 'filterInvoices', label: 'Invoices', prefix: 'invoice.' },
  { id: 'expense',  key: 'filterExpenses', label: 'Expenses', prefix: 'expense.' },
];

function metaFor(action) {
  return ACTION_META[action] || { label: action, icon: 'edit', color: T.ink3, group: 'other' };
}

// Render a one-line summary of an entry's meta jsonb. Each action type
// pulls slightly different fields out of meta so the line reads
// naturally: "Aanya · ₹4,500 · UPI" for a payment, "₹250 · groceries"
// for an expense, etc.
function metaSummary(action, meta, t) {
  if (!meta) return '';
  const fmt = (n) => '₹' + Math.round(n || 0).toLocaleString('en-IN');
  switch (action) {
    case 'booking.create':
    case 'booking.edit':
      return [meta.guest, meta.total ? fmt(meta.total) : null, meta.nights ? `${meta.nights}n` : null, meta.diff?.length ? meta.diff.join(', ') : null].filter(Boolean).join(' · ');
    case 'booking.cancel':
    case 'booking.status':
      return [meta.guest, meta.fromStatus && meta.toStatus ? `${meta.fromStatus} → ${meta.toStatus}` : null].filter(Boolean).join(' · ');
    case 'booking.move':
      return [meta.guest, meta.patch?.startIdx != null ? `→ idx ${meta.patch.startIdx}` : null].filter(Boolean).join(' · ');
    case 'booking.hold_extended':
      return [meta.guest, meta.hours ? `+${meta.hours}h` : null, meta.newReleaseAt ? `releases ${meta.newReleaseAt}` : null].filter(Boolean).join(' · ');
    case 'booking.gst_toggle':
      return `GST ${meta.gstApplies ? t('statusOn') : t('statusOff')}`;
    case 'booking.vip_toggle':
      return `VIP ${meta.vip ? t('statusOn') : t('statusOff')}`;
    case 'booking.voice_note_add':
      return meta.durationSec ? `${Math.round(meta.durationSec)}s ${t('clip')}` : t('audioClip');
    case 'payment.add':
    case 'payment.refund':
    case 'payment.credit':
      return [meta.guest, meta.amount ? fmt(meta.amount) : null, meta.method ? meta.method.toUpperCase() : null].filter(Boolean).join(' · ');
    case 'invoice.issue':
    case 'invoice.void':
      return [meta.guest || meta.recipient, meta.amount ? fmt(meta.amount) : null].filter(Boolean).join(' · ');
    case 'expense.add':
    case 'expense.update':
    case 'expense.remove':
      return [meta.amount ? fmt(meta.amount) : null, meta.category, meta.paidVia ? meta.paidVia.toUpperCase() : null, meta.note].filter(Boolean).join(' · ');
    default:
      return '';
  }
}

// Compact relative-time stamp. < 60s → "just now", < 60m → "Nm ago",
// < 24h → "Nh ago", else absolute "26 May · 14:32".
function relativeTime(iso, t) {
  const d = new Date(iso);
  const delta = (Date.now() - d.getTime()) / 1000;
  if (delta < 60) return t('justNow');
  if (delta < 3600) return Math.round(delta / 60) + t('minAgo');
  if (delta < 86400) return Math.round(delta / 3600) + t('hourAgo');
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) + ' · ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function DatePill({ value, onChange, label }) {
  const ref = useRef(null);
  const open = () => {
    const el = ref.current;
    if (el && typeof el.showPicker === 'function') {
      try { el.showPicker(); } catch {}
    }
  };
  const filled = !!value;
  const display = filled
    ? new Date(value + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : label;
  return (
    <div onClick={open} style={{ flex: 1, position: 'relative', height: 38, background: filled ? T.primaryLt : T.bgSoft, border: `1px solid ${filled ? T.primary : T.border}`, borderRadius: 8, cursor: 'pointer', minWidth: 0 }}>
      <input ref={ref} type="date" value={value} onChange={(e) => onChange(e.target.value)} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer', border: 'none' }} />
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px', pointerEvents: 'none', fontSize: 12, fontWeight: 700, color: filled ? T.primaryDk : T.ink2, whiteSpace: 'nowrap', overflow: 'hidden' }}>
        <Icon name="cal" size={12} color={filled ? T.primaryDk : T.ink2} />
        {display}
      </div>
    </div>
  );
}

export default function Activity({ go, t, propertyId, session }) {
  // Default range: last 7 days. Most hoteliers check "what happened
  // this week"; the date picker is one tap away if they want more.
  const today = new Date(ANCHOR);
  const weekAgo = new Date(today); weekAgo.setDate(weekAgo.getDate() - 6);
  const [rangeStart, setRangeStart] = useState(() => ymd(weekAgo));
  const [rangeEnd, setRangeEnd] = useState(() => ymd(today));
  const [filter, setFilter] = useState('all');
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const signedIn = !!session && !!propertyId;
  const myUserId = session && session.user && session.user.id;

  // (Re-)fetch whenever the property, range, or filter changes. The
  // server-side filter prefix narrows the result set; client-side we
  // additionally sort and group for display.
  useEffect(() => {
    if (!signedIn) { setEntries([]); return; }
    setLoading(true);
    setError('');
    const sinceIso = rangeStart + 'T00:00:00';
    const untilIso = rangeEnd + 'T23:59:59';
    const f = GROUP_FILTERS.find(g => g.id === filter) || GROUP_FILTERS[0];
    loadActivity(propertyId, { sinceIso, untilIso, actionPrefix: f.prefix || null })
      .then(rows => { setEntries(rows); setLoading(false); })
      .catch(e => { setError(e?.message || t('couldNotLoadActivity')); setLoading(false); });
  }, [signedIn, propertyId, rangeStart, rangeEnd, filter]);

  // Group entries by calendar day for the visual sectioning.
  const grouped = useMemo(() => {
    const groups = {};
    for (const e of entries) {
      const day = ymd(new Date(e.created_at));
      if (!groups[day]) groups[day] = [];
      groups[day].push(e);
    }
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
  }, [entries]);

  if (!signedIn) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: T.bg }}>
        <ScreenHeader title={t('activityLog')} subtitle={t('activitySub')} onBack={() => go('more')} />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ textAlign: 'center', maxWidth: 320 }}>
            <div style={{ width: 56, height: 56, borderRadius: 14, background: T.bgSoft, color: T.ink3, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
              <Icon name="clock" size={24} />
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.ink, marginBottom: 6 }}>{t('activitySignedOutTitle')}</div>
            <div style={{ fontSize: 12, color: T.ink3, fontWeight: 600, lineHeight: 1.5 }}>
              {t('activitySignedOutBody')}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: T.bg }}>
      <ScreenHeader title={t('activityLog')} subtitle={`${entries.length} ${t('expEntries')} · ${rangeStart} → ${rangeEnd}`} onBack={() => go('more')} />
      <div style={{ flex: 1, overflow: 'auto', padding: 16, paddingBottom: 100 }}>
        {/* Date range */}
        <Card padding={12} style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 10, color: T.ink3, fontWeight: 700, letterSpacing: 0.4, marginBottom: 8 }}>{t('activityRange')}</div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <DatePill value={rangeStart} onChange={setRangeStart} label={t('rangeFrom')} />
            <span style={{ color: T.ink3, fontSize: 13, fontWeight: 700, alignSelf: 'center' }}>→</span>
            <DatePill value={rangeEnd} onChange={setRangeEnd} label={t('rangeTo')} />
          </div>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {[
              { id: 'today',  label: t('today'),         days: 0 },
              { id: '7d',     label: t('presetLast7'),   days: 6 },
              { id: '30d',    label: t('presetLast30'),  days: 29 },
              { id: '90d',    label: t('presetLast90'),  days: 89 },
            ].map(p => (
              <button
                key={p.id}
                onClick={() => {
                  const start = new Date(today);
                  start.setDate(start.getDate() - p.days);
                  setRangeStart(ymd(start));
                  setRangeEnd(ymd(today));
                }}
                style={{ padding: '4px 9px', borderRadius: 999, border: `1px solid ${T.border}`, background: T.card, color: T.ink2, fontSize: 10.5, fontWeight: 700, cursor: 'pointer' }}
              >{p.label}</button>
            ))}
          </div>
        </Card>

        {/* Group filter chips */}
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 14 }}>
          {GROUP_FILTERS.map(g => {
            const sel = filter === g.id;
            return (
              <button
                key={g.id}
                onClick={() => setFilter(g.id)}
                style={{
                  padding: '5px 10px', borderRadius: 999,
                  border: `1.5px solid ${sel ? T.primary : T.border}`,
                  background: sel ? T.primaryLt : T.card,
                  color: sel ? T.primaryDk : T.ink2,
                  fontSize: 11, fontWeight: 700, cursor: 'pointer',
                }}
              >{t(g.key)}</button>
            );
          })}
        </div>

        {error && (
          <div style={{ padding: '8px 10px', background: 'oklch(95% 0.06 30)', border: `1px solid ${T.danger}`, borderRadius: 7, fontSize: 11, color: T.danger, fontWeight: 600, marginBottom: 10 }}>
            {error}
          </div>
        )}

        {loading && entries.length === 0 ? (
          <div style={{ fontSize: 12, color: T.ink3, fontStyle: 'italic', padding: '20px 0', textAlign: 'center' }}>{t('loadingActivity')}</div>
        ) : grouped.length === 0 ? (
          <Card padding={20} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 12, color: T.ink3, fontWeight: 600, lineHeight: 1.5 }}>
              {t('noActivityRange')}
            </div>
          </Card>
        ) : (
          grouped.map(([day, rows]) => {
            const dateObj = new Date(day + 'T00:00:00');
            const isToday = day === ymd(new Date(ANCHOR));
            const heading = isToday ? t('today') : dateObj.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' });
            return (
              <div key={day} style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10, color: T.ink3, fontWeight: 800, letterSpacing: 0.5, marginBottom: 6, textTransform: 'uppercase' }}>{heading}</div>
                <Card padding={0}>
                  {rows.map((e, i) => {
                    const m = metaFor(e.action);
                    const summary = metaSummary(e.action, e.meta, t);
                    const isMe = myUserId && e.actor_id === myUserId;
                    const actor = isMe ? t('actorYou') : `${t('actorMember')} · ${String(e.actor_id || '').slice(0, 8)}…`;
                    return (
                      <div
                        key={e.id}
                        onClick={() => { if (e.target_type === 'booking' && e.target_id) go('booking', e.target_id); }}
                        style={{
                          padding: '10px 12px', display: 'flex', alignItems: 'flex-start', gap: 10,
                          borderTop: i > 0 ? `1px solid ${T.borderSoft}` : 'none',
                          cursor: (e.target_type === 'booking' && e.target_id) ? 'pointer' : 'default',
                        }}
                      >
                        <div style={{
                          width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                          background: `color-mix(in oklch, ${m.color} 14%, white)`, color: m.color,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <Icon name={m.icon} size={13} stroke={2} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: T.ink }}>{m.key ? t(m.key) : m.label}</span>
                            <span style={{ fontSize: 10, color: T.ink3, fontWeight: 600, whiteSpace: 'nowrap' }} className="tnum">{relativeTime(e.created_at, t)}</span>
                          </div>
                          {summary && (
                            <div style={{ fontSize: 11, color: T.ink2, fontWeight: 600, marginTop: 2, lineHeight: 1.4 }}>
                              {summary}
                            </div>
                          )}
                          <div style={{ fontSize: 10, color: T.ink3, fontWeight: 600, marginTop: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ color: isMe ? T.primaryDk : T.ink3, fontWeight: 700 }}>{actor}</span>
                            {e.target_id && <span>· {e.target_id}</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </Card>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

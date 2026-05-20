import { useState, useEffect } from 'react';
import { T } from '../tokens.js';
import { CHANNELS, DAYS, ANCHOR, ymd, effectiveRoomTypes, repeatGuestKeys, normPhone } from '../data.js';
import Icon from '../components/Icon.jsx';
import Card from '../components/Card.jsx';
import Chip from '../components/Chip.jsx';
import Avatar from '../components/Avatar.jsx';
import SectionHead from '../components/SectionHead.jsx';
import ExtendOptions from '../components/ExtendOptions.jsx';

const D_MONTH_HI = ['जन','फ़र','मार्च','अप्रैल','मई','जून','जुल','अग','सित','अक्ट','नव','दिस'];
const D_DOW_HI   = ['सोम','मंगल','बुध','गुरु','शुक्र','शनि','रवि'];

function StatTile({ label, value, icon, color }) {
  return (
    <Card padding={12} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{
          width: 28, height: 28, borderRadius: 8, background: `color-mix(in oklch, ${color} 12%, white)`,
          color, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}><Icon name={icon} size={14} stroke={2} /></div>
      </div>
      <div>
        <div className="tnum" style={{ fontSize: 22, fontWeight: 700, color: T.ink, letterSpacing: -0.6, lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: 11, color: T.ink3, marginTop: 2, fontWeight: 600 }}>{label}</div>
      </div>
    </Card>
  );
}

// Daily cash-close card. Keeps a per-day snapshot of what the hotelier
// physically counted at end-of-day (cash + digital + free-text note). Stored
// in localStorage so it survives reloads; future Phase 1 Supabase will push
// these into a real ledger table for cross-device sync.
const CASH_CLOSES_KEY = 'atithi.cashCloses.v1';
function todayKey() {
  // Local YYYY-MM-DD for today. Was previously hardwired to '2026-05-05'
  // (the demo's fake "today"), which meant every close the hotelier
  // recorded actually saved against May 5 and disappeared from the
  // dashboard on next reload. Now keyed by the real calendar date.
  return ymd(ANCHOR);
}
function loadCloses() {
  try { return JSON.parse(localStorage.getItem(CASH_CLOSES_KEY) || '{}'); } catch { return {}; }
}
function saveCloses(map) {
  try { localStorage.setItem(CASH_CLOSES_KEY, JSON.stringify(map)); } catch {}
}

function DailyCloseCard({ todayBookings, isHi }) {
  const dateKey = todayKey();
  const [closes, setCloses] = useState(loadCloses);
  const closed = closes[dateKey];
  const [open, setOpen] = useState(false);
  const [cash, setCash] = useState('');
  const [digital, setDigital] = useState('');
  const [note, setNote] = useState('');

  const expected = todayBookings.reduce((s, b) => s + (b.total || 0), 0);

  const submit = () => {
    const c = Math.max(0, +cash || 0);
    const d = Math.max(0, +digital || 0);
    if (c + d <= 0 && !note.trim()) return;
    const now = new Date();
    const closedAt = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
    const next = { ...closes, [dateKey]: { cash: c, digital: d, total: c + d, expected, note: note.trim(), closedAt } };
    setCloses(next);
    saveCloses(next);
    setOpen(false);
    setCash(''); setDigital(''); setNote('');
  };

  const reopen = () => {
    const next = { ...closes };
    delete next[dateKey];
    setCloses(next);
    saveCloses(next);
  };

  if (closed) {
    const gap = closed.total - closed.expected;
    return (
      <div style={{ padding: '0 16px 14px' }}>
        <SectionHead title={isHi ? 'दिन का हिसाब' : 'End of day'} action={
          <button onClick={reopen} style={{ background: 'none', border: 'none', color: T.ink3, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Reopen</button>
        } />
        <Card padding={14}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: T.okLt, color: T.ok, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="check" size={16} stroke={2.4} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.ink }}>Closed at <span className="tnum">{closed.closedAt}</span></div>
              <div className="tnum" style={{ fontSize: 11, color: T.ink3, marginTop: 1 }}>
                ₹{closed.cash.toLocaleString('en-IN')} cash · ₹{closed.digital.toLocaleString('en-IN')} digital
                {Math.abs(gap) > 0 && expected > 0 && (
                  <span style={{ color: gap < 0 ? T.danger : T.indigo, marginLeft: 4 }}>
                    · {gap > 0 ? `+₹${gap.toLocaleString('en-IN')}` : `−₹${Math.abs(gap).toLocaleString('en-IN')}`} vs billed
                  </span>
                )}
              </div>
              {closed.note && <div style={{ fontSize: 11, color: T.ink2, marginTop: 4, fontStyle: 'italic' }}>"{closed.note}"</div>}
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div style={{ padding: '0 16px 14px' }}>
      <SectionHead title={isHi ? 'दिन का हिसाब' : 'End of day'} />
      <Card padding={0} style={{ overflow: 'hidden' }}>
        <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: T.primaryLt, color: T.primaryDk, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon name="inr" size={16} stroke={2.2} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>{isHi ? 'आज का हिसाब बंद करें' : "Close today's cash"}</div>
            <div style={{ fontSize: 11, color: T.ink3, marginTop: 1 }} className="tnum">
              {expected > 0 ? `${todayBookings.length} booking${todayBookings.length > 1 ? 's' : ''} · ₹${expected.toLocaleString('en-IN')} billed today` : 'No bookings today'}
            </div>
          </div>
          {!open && (
            <button
              onClick={() => setOpen(true)}
              className="atithi-tap"
              style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: T.primary, color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
            >Close day</button>
          )}
        </div>
        {open && (
          <div style={{ padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: T.ink3, letterSpacing: 0.3, marginBottom: 4 }}>CASH IN HAND</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '8px 10px', background: T.bgSoft, border: `1.5px solid ${T.primary}`, borderRadius: 8 }}>
                  <span style={{ fontSize: 14, color: T.ink3, fontWeight: 700 }}>₹</span>
                  <input type="number" autoFocus value={cash} onChange={(e) => setCash(e.target.value)} placeholder="0" className="tnum" style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 16, fontWeight: 700, color: T.ink, minWidth: 0 }} />
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: T.ink3, letterSpacing: 0.3, marginBottom: 4 }}>DIGITAL (UPI / CARD)</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '8px 10px', background: T.bgSoft, border: `1.5px solid ${T.border}`, borderRadius: 8 }}>
                  <span style={{ fontSize: 14, color: T.ink3, fontWeight: 700 }}>₹</span>
                  <input type="number" value={digital} onChange={(e) => setDigital(e.target.value)} placeholder="0" className="tnum" style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 16, fontWeight: 700, color: T.ink, minWidth: 0 }} />
                </div>
              </div>
            </div>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional) — e.g. ₹500 advance from walk-in" style={{ width: '100%', boxSizing: 'border-box', border: `1px solid ${T.border}`, background: T.card, borderRadius: 8, padding: '8px 10px', fontSize: 12, color: T.ink, outline: 'none' }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { setOpen(false); setCash(''); setDigital(''); setNote(''); }} className="atithi-tap" style={{ flex: 1, padding: '10px', borderRadius: 8, border: `1px solid ${T.border}`, background: T.card, color: T.ink2, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
              <button onClick={submit} className="atithi-tap" style={{ flex: 2, padding: '10px', borderRadius: 8, border: 'none', background: T.primary, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Close day</button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

// Setup checklist surfaced on the Dashboard. Counts how many essential
// property-profile fields are filled and nudges the hotelier to finish setup.
// Hides itself completely once everything's filled. The most useful nudge —
// CA email — unlocks the monthly invoice export to the accountant.
function SetupNudge({ property, go }) {
  const items = [
    { id: 'name',    label: 'Property name',        done: !!(property?.profile?.name?.trim()) },
    { id: 'phone',   label: 'Property phone',       done: !!(property?.profile?.phone?.trim()) },
    { id: 'address', label: 'Address',              done: !!(property?.profile?.address?.trim()) },
    { id: 'ca',      label: "CA's email (for monthly export)", done: !!(property?.accountant?.email?.trim()) },
    { id: 'rooms',   label: 'At least one room category',      done: Array.isArray(property?.categories) && property.categories.length > 0 },
  ];
  const done = items.filter(i => i.done).length;
  const total = items.length;
  if (done === total) return null;
  const pct = Math.round((done / total) * 100);
  return (
    <div style={{ padding: '0 16px 14px' }}>
      <SectionHead title="Finish setting up" action={
        <span className="tnum" style={{ fontSize: 11, fontWeight: 700, color: T.ink3 }}>{done}/{total}</span>
      } />
      <Card padding={14}>
        <div style={{ height: 6, background: T.bgSoft, borderRadius: 3, overflow: 'hidden', marginBottom: 12 }}>
          <div style={{ width: `${pct}%`, height: '100%', background: T.primary, borderRadius: 3, transition: 'width .25s' }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
          {items.map(it => (
            <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 18, height: 18, borderRadius: 9, flexShrink: 0,
                background: it.done ? T.ok : T.bgSoft,
                color: it.done ? '#fff' : T.ink4,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: it.done ? 'none' : `1px solid ${T.border}`,
              }}>
                {it.done && <Icon name="check" size={10} stroke={2.6} />}
              </div>
              <span style={{ fontSize: 12, color: it.done ? T.ink3 : T.ink2, fontWeight: 600, textDecoration: it.done ? 'line-through' : 'none' }}>
                {it.label}
              </span>
            </div>
          ))}
        </div>
        <button
          onClick={() => go('settings')}
          className="atithi-tap"
          style={{ width: '100%', padding: '10px', borderRadius: 8, border: 'none', background: T.primary, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
        >Finish setup in Settings →</button>
      </Card>
    </div>
  );
}

function ArrivalRow({ b, go, dayName, t, roomTypes, isRepeat }) {
  const rt = roomTypes.find(r => r.id === b.roomTypeId);
  const ch = CHANNELS[b.channel];
  return (
    <Card padding={12} onClick={() => go('booking', b.id)} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}>
      <Avatar name={b.guest} size={40} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.guest}</span>
          {b.vip && <Chip color="warn" style={{ padding: '1px 6px', fontSize: 9 }}>VIP</Chip>}
          {b.formC && <Chip color="indigo" style={{ padding: '1px 6px', fontSize: 9 }}>Form C</Chip>}
          {isRepeat && <Chip color="ok" icon="sync" style={{ padding: '1px 6px', fontSize: 9 }}>Repeat</Chip>}
        </div>
        <div style={{ fontSize: 11, color: T.ink2, marginTop: 3, display: 'flex', alignItems: 'center', gap: 5, fontWeight: 600 }} className="tnum">
          <Icon name="cal" size={10} color={T.ink3} stroke={2} />
          <span>{dayName(b.startIdx)}</span>
          <Icon name="arrow" size={9} color={T.ink4} stroke={2.5} />
          <span>{dayName(b.startIdx + b.nights)}</span>
          <span style={{ color: T.ink3, fontWeight: 500 }}>· {b.nights}N</span>
        </div>
        <div style={{ fontSize: 11, color: T.ink3, marginTop: 2, display: 'flex', alignItems: 'center', gap: 5 }}>
          <span>{rt.name}</span><span>·</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: ch.color, fontWeight: 600 }}>
            <span style={{ width: 6, height: 6, borderRadius: 3, background: ch.color }} /> {ch.label}
          </span>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
        <span className="tnum" style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>₹{(b.total/1000).toFixed(1)}k</span>
        {b.paid < b.total && <Chip color="warn" style={{ fontSize: 9 }}>Bal ₹{((b.total-b.paid)/1000).toFixed(1)}k</Chip>}
        {b.paid >= b.total && <Chip color="ok" style={{ fontSize: 9 }} icon="check">Paid</Chip>}
      </div>
    </Card>
  );
}

export default function Dashboard({ go, bookings, property, t, lang, onAddPayment, onExtendHold }) {
  const isHi = lang === 'hi';
  const ROOM_TYPES = effectiveRoomTypes(property);
  const repeats = repeatGuestKeys(bookings);
  // Fake "New booking · MakeMyTrip" toast was removed: it claimed bookings
  // that never happened (channel sync isn't wired) and visually overlapped
  // the greeting on every Dashboard mount. When real OTA sync lands the
  // toast can come back, driven by the actual event stream.

  // ANCHOR is local midnight of today, so idx 0 is today in the new model.
  // Everything that used to compare against `1` (the demo's hardcoded
  // "today = idx 1") needs to use 0 instead.
  const TODAY_IDX = 0;
  const today = bookings.filter(b => b.startIdx === TODAY_IDX);
  const arriving = today.length;
  const departing = bookings.filter(b => b.startIdx + b.nights === TODAY_IDX).length;
  const inhouse = bookings.filter(b => b.startIdx <= TODAY_IDX && b.startIdx + b.nights > TODAY_IDX).length;
  const totalRooms = ROOM_TYPES.reduce((a, r) => a + r.units, 0);

  const catOcc = ROOM_TYPES.map(rt => {
    const occ = bookings.filter(b => b.roomTypeId === rt.id && b.startIdx <= TODAY_IDX && b.startIdx + b.nights > TODAY_IDX).length;
    return { rt, occ, total: rt.units };
  });
  const occRooms = catOcc.reduce((a, c) => a + c.occ, 0);

  const dailyIncome = bookings
    .filter(b => b.startIdx <= TODAY_IDX && b.startIdx + b.nights > TODAY_IDX)
    .reduce((a, b) => a + Math.round(b.total / b.nights), 0);
  const collectedToday = bookings
    .filter(b => b.startIdx === TODAY_IDX)
    .reduce((a, b) => a + b.paid, 0);
  // Yesterday's collection — used as the comparison point for the Daily
  // Income card's % change badge. Real number, replacing the old hardcoded
  // "+24%" placeholder.
  const collectedYesterday = bookings
    .filter(b => b.startIdx === TODAY_IDX - 1)
    .reduce((a, b) => a + b.paid, 0);
  const dailyChangePct = collectedYesterday > 0
    ? Math.round(((collectedToday - collectedYesterday) / collectedYesterday) * 100)
    : null;

  // Live "month so far" numbers, computed from real bookings so labels and values agree.
  const activeBookings = bookings.filter(b => b.status !== 'cancelled');
  const monthBookings = activeBookings.length;
  const monthRevenue = activeBookings.reduce((s, b) => s + (b.total || 0), 0);
  const monthRoomNights = activeBookings.reduce((s, b) => s + (b.nights || 0), 0);
  const availableRoomNights = totalRooms * DAYS.length;
  const monthOccPct = availableRoomNights > 0 ? Math.round((monthRoomNights / availableRoomNights) * 100) : 0;
  const monthAvgPerRoom = monthRoomNights > 0 ? Math.round(monthRevenue / monthRoomNights) : 0;

  // 12-bar trailing mini-chart for the Daily Income card. Builds the last
  // 12 days of paid amounts straight from the bookings ledger — was
  // previously a hardcoded sample array [62, 70, ...] that didn't reflect
  // anything real.
  const dailyTrail = Array.from({ length: 12 }, (_, i) => {
    const dayIdx = TODAY_IDX - 11 + i;
    return bookings.filter(b => b.startIdx === dayIdx).reduce((s, b) => s + (b.paid || 0), 0);
  });
  const trailPeak = Math.max(1, ...dailyTrail);

  const onHold = bookings.filter(b => b.status === 'tentative');

  // Pending payments: guest has arrived (or should have) but balance is still due.
  // These are the bookings most likely to be missing payment data needed for invoicing.
  const pendingPayments = bookings.filter(b => {
    if (b.status === 'cancelled' || b.status === 'tentative') return false;
    const balance = (b.total || 0) - (b.paid || 0);
    if (balance <= 0) return false;
    if (b.status === 'checkedin' || b.status === 'checkout') return true;
    if (b.status === 'confirmed' && b.startIdx <= TODAY_IDX) return true;
    return false;
  });
  const pendingTotal = pendingPayments.reduce((s, b) => s + (b.total - b.paid), 0);

  // Smart nudges — action-oriented suggestions surfaced as a small "Today's
  // nudges" card. Each one is a heuristic over the bookings array; the card
  // hides entirely when no nudges apply, keeping the dashboard calm.
  const tomorrowIdx = TODAY_IDX + 1;
  const arrivingTomorrow = bookings.filter(b => b.startIdx === tomorrowIdx && b.status !== 'cancelled');
  const foreignOnProperty = bookings.filter(b => b.formC && b.status !== 'cancelled' && b.startIdx <= TODAY_IDX && b.startIdx + b.nights > TODAY_IDX);
  const nowMs = Date.now();
  const holdsExpiringSoon = bookings.filter(b => b.status === 'tentative' && b.releaseTs && b.releaseTs > nowMs && b.releaseTs - nowMs < 4 * 3600 * 1000);
  const nudges = [];
  if (arrivingTomorrow.length > 0) {
    nudges.push({
      icon: 'wa', tone: '#25D366',
      text: `${arrivingTomorrow.length} guest${arrivingTomorrow.length > 1 ? 's' : ''} arrive tomorrow — send directions?`,
      cta: 'WhatsApp',
      onClick: () => go('diary'),
    });
  }
  if (foreignOnProperty.length > 0) {
    nudges.push({
      icon: 'flag', tone: T.indigo,
      text: `${foreignOnProperty.length} foreign guest${foreignOnProperty.length > 1 ? 's' : ''} on property — Form C ready`,
      cta: 'Review',
      onClick: () => go('guests'),
    });
  }
  if (holdsExpiringSoon.length > 0) {
    nudges.push({
      icon: 'clock', tone: 'oklch(60% 0.14 75)',
      text: `${holdsExpiringSoon.length} hold${holdsExpiringSoon.length > 1 ? 's' : ''} expire in next 4h — chase payment`,
      cta: 'View',
      onClick: () => go('diary'),
    });
  }
  const markSettled = (b, method = 'cash') => {
    if (!onAddPayment) return;
    const balance = b.total - b.paid;
    const noteByMethod = { cash: 'Settled at property · cash', upi: 'Settled at property · UPI' };
    onAddPayment(b.id, {
      id: 'p_' + Date.now(),
      kind: 'payment',
      method,
      amount: balance,
      note: noteByMethod[method] || `Settled at property · ${method}`,
      date: 'now',
    });
  };

  // Format a day index as a short date label, e.g. "23 May" or "बुध · 23 मई".
  // Computes the actual date from ANCHOR + idx so the month and day-of-week
  // are correct regardless of how far ahead/behind the booking is.
  const dayName = (idx, withDow = false) => {
    const d = new Date(ANCHOR);
    d.setDate(d.getDate() + idx);
    const monIdx = d.getMonth();
    const mon = isHi ? D_MONTH_HI[monIdx] : ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][monIdx];
    const dowIdx = (d.getDay() + 6) % 7;
    const dow = isHi ? D_DOW_HI[dowIdx] : ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][dowIdx];
    return withDow ? `${dow} · ${d.getDate()} ${mon}` : `${d.getDate()} ${mon}`;
  };

  return (
    <div style={{ flex: 1, overflow: 'auto', paddingBottom: 100, position: 'relative' }}>
      <div style={{
        background: `linear-gradient(160deg, ${T.primary} 0%, ${T.primaryDk} 100%)`,
        padding: '56px 20px 18px', color: '#fff', position: 'relative', overflow: 'hidden',
      }}>
        <svg style={{ position: 'absolute', right: -20, top: -10, opacity: 0.1 }} width="180" height="180" viewBox="0 0 180 180">
          <circle cx="90" cy="90" r="60" stroke="#fff" strokeWidth="1" fill="none"/>
          <circle cx="90" cy="90" r="40" stroke="#fff" strokeWidth="1" fill="none"/>
          <circle cx="90" cy="90" r="20" stroke="#fff" strokeWidth="1" fill="none"/>
        </svg>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 11, opacity: 0.8, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' }} className={isHi ? 'hi' : ''}>{(() => {
              const opts = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' };
              const locale = isHi ? 'hi-IN' : 'en-IN';
              return new Date().toLocaleDateString(locale, opts);
            })()}</div>
            <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.4, marginTop: 2 }} className="hi">
              {t('namaste')}
            </div>
            <div style={{ fontSize: 13, opacity: 0.85, marginTop: 1 }}>{property?.profile?.name || 'Yatra Desert Camp'} · {property?.profile?.city || 'Jaisalmer'}</div>
          </div>
          {/* Notifications bell removed — it didn't open anything. Will return
              when there's a real notifications inbox (Phase 3 — WhatsApp /
              email alerts have a destination). */}
        </div>

        <div style={{ display: 'flex', gap: 10, overflowX: 'auto', margin: '0 -20px', padding: '0 20px 4px', scrollSnapType: 'x mandatory' }}>
          {/* Card 1 — Occupancy */}
          <div style={{ background: 'rgba(255,255,255,0.14)', backdropFilter: 'blur(10px)', borderRadius: 14, padding: '12px 14px', border: '1px solid rgba(255,255,255,0.22)', minWidth: 'calc(100% - 26px)', scrollSnapAlign: 'start', flexShrink: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
              <span style={{ fontSize: 10, opacity: 0.85, fontWeight: 700, letterSpacing: 0.4 }} className={isHi ? 'hi' : ''}>{t('occupancyToday')}</span>
              <span className="tnum" style={{ fontSize: 11, opacity: 0.85, fontWeight: 600 }}>{occRooms}/{totalRooms} {t('rooms')}</span>
            </div>
            <div className="tnum" style={{ fontSize: 28, fontWeight: 700, letterSpacing: -0.6, lineHeight: 1 }}>
              {occRooms}<span style={{ fontSize: 13, opacity: 0.75, fontWeight: 600 }}> {t('booked')}</span>
            </div>
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 5 }}>
              {catOcc.map(c => (
                <div key={c.rt.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: T[c.rt.tag], flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 11, opacity: 0.9, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.rt.name}</span>
                  <div style={{ flex: 1.2, display: 'flex', gap: 2 }}>
                    {Array.from({ length: c.total }).map((_, i) => (
                      <span key={i} style={{ flex: 1, height: 5, borderRadius: 1, background: i < c.occ ? '#fff' : 'rgba(255,255,255,0.25)' }} />
                    ))}
                  </div>
                  <span className="tnum" style={{ fontSize: 11, fontWeight: 700, minWidth: 26, textAlign: 'right' }}>{c.occ}/{c.total}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Card 2 — Daily income */}
          <div style={{ background: 'rgba(255,255,255,0.14)', backdropFilter: 'blur(10px)', borderRadius: 14, padding: '12px 14px', border: '1px solid rgba(255,255,255,0.22)', minWidth: 'calc(100% - 26px)', scrollSnapAlign: 'start', flexShrink: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
              <span style={{ fontSize: 10, opacity: 0.85, fontWeight: 700, letterSpacing: 0.4 }} className={isHi ? 'hi' : ''}>{t('dailyIncome')}</span>
              {dailyChangePct !== null && (
                <span style={{ fontSize: 10, opacity: 0.85, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: 'rgba(255,255,255,0.18)' }}>
                  {dailyChangePct > 0 ? '+' : ''}{dailyChangePct}%
                </span>
              )}
            </div>
            <div className="tnum" style={{ fontSize: 28, fontWeight: 700, letterSpacing: -0.6, lineHeight: 1 }}>
              ₹{(dailyIncome/1000).toFixed(1)}<span style={{ fontSize: 14, opacity: 0.8 }}>k</span>
            </div>
            <div style={{ fontSize: 10, opacity: 0.8, marginTop: 4, fontWeight: 600 }} className="tnum">
              {isHi ? 'आज वसूली' : 'Collected today'} ₹{collectedToday.toLocaleString('en-IN')}
            </div>
            <div style={{ marginTop: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 10, opacity: 0.85, fontWeight: 700, letterSpacing: 0.4 }} className={isHi ? 'hi' : ''}>{isHi ? 'पिछले 12 दिन' : 'LAST 12 DAYS'}</span>
                <span className="tnum" style={{ fontSize: 11, fontWeight: 700 }}>
                  ₹{(dailyTrail.reduce((a, v) => a + v, 0) / 1000).toFixed(1)}k
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 30 }}>
                {dailyTrail.map((v, i) => (
                  <div key={i} style={{ flex: 1, height: `${Math.max(4, (v/trailPeak)*100)}%`, background: i === dailyTrail.length - 1 ? '#fff' : 'rgba(255,255,255,0.55)', borderRadius: '2px 2px 0 0' }} />
                ))}
              </div>
            </div>
          </div>

          {/* Card 3 — Month summary */}
          <div style={{ background: 'rgba(255,255,255,0.14)', backdropFilter: 'blur(10px)', borderRadius: 14, padding: '12px 14px', border: '1px solid rgba(255,255,255,0.22)', minWidth: 'calc(100% - 26px)', scrollSnapAlign: 'start', flexShrink: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
              <span style={{ fontSize: 10, opacity: 0.85, fontWeight: 700, letterSpacing: 0.4 }} className={isHi ? 'hi' : ''}>{isHi ? 'इस महीने कमाई' : 'EARNED THIS MONTH'}</span>
              <span style={{ fontSize: 10, opacity: 0.85, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: 'rgba(255,255,255,0.18)' }}>
                {new Date().toLocaleDateString(isHi ? 'hi-IN' : 'en-IN', { month: 'short', year: 'numeric' })}
              </span>
            </div>
            <div className="tnum" style={{ fontSize: 28, fontWeight: 700, letterSpacing: -0.6, lineHeight: 1 }}>
              ₹{monthRevenue >= 100000
                ? (monthRevenue/100000).toFixed(1)
                : monthRevenue.toLocaleString('en-IN')}
              {monthRevenue >= 100000 && (
                <span style={{ fontSize: 13, opacity: 0.75, fontWeight: 600 }} className={isHi ? 'hi' : ''}>
                  {isHi ? ' लाख' : ' lakh'}
                </span>
              )}
            </div>
            <div style={{ fontSize: 10, opacity: 0.8, marginTop: 4, fontWeight: 600 }}>
              {isHi ? 'अब तक कुल आय' : 'Total received so far'}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 10, opacity: 0.85, fontWeight: 600 }}>
              <div>
                <div className="tnum" style={{ fontSize: 14, fontWeight: 700 }}>{monthBookings}</div>
                {isHi ? 'बुकिंग' : 'bookings'}
              </div>
              <div>
                <div className="tnum" style={{ fontSize: 14, fontWeight: 700 }}>{monthOccPct}%</div>
                {isHi ? 'कमरे भरे' : 'rooms full'}
              </div>
              <div>
                <div className="tnum" style={{ fontSize: 14, fontWeight: 700 }}>₹{monthAvgPerRoom.toLocaleString('en-IN')}</div>
                {isHi ? '/कमरा/रात' : '/room/night'}
              </div>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 5, marginTop: 8 }}>
          {[0,1,2].map(i => <span key={i} style={{ width: i === 0 ? 14 : 5, height: 5, borderRadius: 3, background: i === 0 ? '#fff' : 'rgba(255,255,255,0.5)', transition: 'width .2s' }} />)}
        </div>
      </div>

      <div style={{ padding: '14px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        <StatTile label={t('arriving')} value={arriving} icon="arrow" color={T.primary} />
        <StatTile label={t('inhouse')} value={inhouse} icon="bed" color={T.indigo} />
        <StatTile label={t('departing')} value={departing} icon="door" color={T.teal} />
      </div>

      <SetupNudge property={property} go={go} />

      {nudges.length > 0 && (
        <div style={{ padding: '0 16px 14px' }}>
          <SectionHead title={isHi ? 'आज के सुझाव' : "Today's nudges"} />
          <Card padding={0} style={{ overflow: 'hidden' }}>
            {nudges.map((n, i) => (
              <div key={i} style={{
                padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10,
                borderBottom: i < nudges.length - 1 ? `1px solid ${T.borderSoft}` : 'none',
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 9,
                  background: `color-mix(in oklch, ${n.tone} 14%, white)`, color: n.tone,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <Icon name={n.icon} size={14} stroke={2} />
                </div>
                <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: T.ink, fontWeight: 600, lineHeight: 1.4 }}>{n.text}</div>
                <button
                  onClick={n.onClick}
                  className="atithi-tap"
                  style={{
                    padding: '6px 10px', borderRadius: 7, border: 'none',
                    background: n.tone, color: '#fff',
                    fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                  }}
                >{n.cta}</button>
              </div>
            ))}
          </Card>
        </div>
      )}

      {pendingPayments.length > 0 && (
        <div style={{ padding: '0 16px 14px' }}>
          <SectionHead title="Pending payments" action={
            <span className="tnum" style={{ fontSize: 11, fontWeight: 700, color: T.danger }}>
              ₹{pendingTotal.toLocaleString('en-IN')} due
            </span>
          } />
          <Card padding={0} style={{ overflow: 'hidden' }}>
            {pendingPayments.map((b, i) => {
              const balance = b.total - b.paid;
              const statusLabel = b.status === 'checkedin' ? 'In-house' : b.status === 'checkout' ? 'Departed' : 'Arrived today';
              return (
                <div key={b.id} style={{
                  padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10,
                  borderBottom: i < pendingPayments.length - 1 ? `1px solid ${T.borderSoft}` : 'none',
                }}>
                  <div onClick={() => go('booking', b.id)} style={{ flex: 1, minWidth: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: T.dangerLt, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.danger, flexShrink: 0 }}>
                      <Icon name="inr" size={16} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.guest}</div>
                      <div style={{ fontSize: 11, color: T.ink3 }} className="tnum">
                        {b.id} · {statusLabel} · ₹{balance.toLocaleString('en-IN')} due
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button
                      onClick={() => markSettled(b, 'cash')}
                      className="atithi-tap"
                      aria-label={isHi ? 'कैश से चुकाया' : 'Mark paid by cash'}
                      style={{
                        padding: '7px 12px', borderRadius: 8, border: 'none',
                        background: T.primary, color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {isHi ? 'कैश' : 'Cash'}
                    </button>
                    <button
                      onClick={() => markSettled(b, 'upi')}
                      className="atithi-tap"
                      aria-label={isHi ? 'UPI से चुकाया' : 'Mark paid by UPI'}
                      style={{
                        padding: '7px 12px', borderRadius: 8, border: 'none',
                        background: T.ok, color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      UPI
                    </button>
                  </div>
                </div>
              );
            })}
            <div style={{ padding: '8px 14px', background: T.bgSoft, fontSize: 10.5, color: T.ink3, fontWeight: 600, lineHeight: 1.35 }}>
              {isHi
                ? 'पूरी बकाया रकम तुरंत दर्ज करने के लिए कैश या UPI दबाएँ। कार्ड या आधी-आधी रकम के लिए, बुकिंग खोलें।'
                : 'Tap Cash or UPI to instantly record the full balance. For card or split payments, tap the row to open the booking.'}
            </div>
          </Card>
        </div>
      )}

      {onHold.length > 0 && (
        <div style={{ padding: '0 16px 14px' }}>
          <SectionHead title={t('autoRelease')} />
          <Card padding={0} style={{ overflow: 'hidden' }}>
            {onHold.map((b, i) => (
              <div key={b.id} style={{
                padding: '12px 14px',
                borderBottom: i < onHold.length - 1 ? `1px solid ${T.borderSoft}` : 'none',
              }}>
                <div onClick={() => go('booking', b.id)} style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: T.warnLt, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'oklch(48% 0.14 75)' }}>
                    <Icon name="clock" size={16} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: T.ink }}>{b.guest}</div>
                    <div style={{ fontSize: 11, color: T.ink3 }} className="tnum">
                      {dayName(b.startIdx)} → {dayName(b.startIdx + b.nights)} · ₹{b.total.toLocaleString('en-IN')} {t('unpaid')}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="tnum" style={{ fontSize: 13, fontWeight: 700, color: 'oklch(48% 0.14 75)' }}>{b.releaseAt}</div>
                    <div style={{ fontSize: 10, color: T.ink3, fontWeight: 600 }}>{t('releasesToday')}</div>
                  </div>
                </div>
                {onExtendHold && (
                  <div style={{ paddingLeft: 48 }}>
                    <ExtendOptions
                      onExtend={(hours) => onExtendHold(b.id, hours)}
                      colors={{ border: 'oklch(75% 0.10 75)', text: 'oklch(40% 0.14 75)' }}
                      hi={isHi}
                    />
                  </div>
                )}
              </div>
            ))}
          </Card>
        </div>
      )}

      <div style={{ padding: '0 16px 14px' }}>
        <SectionHead title={t('arrivingToday')} action={
          <button onClick={() => go('diary')} style={{ background: 'none', border: 'none', color: T.primary, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            {t('seeAll')} <Icon name="chev" size={11} stroke={2.5} />
          </button>
        } />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {today.slice(0, 4).map(b => <ArrivalRow key={b.id} b={b} go={go} dayName={dayName} t={t} roomTypes={ROOM_TYPES} isRepeat={repeats.has(normPhone(b.phone))} />)}
        </div>
      </div>

      <div style={{ padding: '0 16px 16px' }}>
        <SectionHead title={t('channelMix')} />
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ position: 'relative', width: 70, height: 70 }}>
              <svg width="70" height="70" viewBox="0 0 70 70">
                <circle cx="35" cy="35" r="28" fill="none" stroke={T.bgSoft} strokeWidth="10"/>
                <circle cx="35" cy="35" r="28" fill="none" stroke={T.primary} strokeWidth="10" strokeDasharray={`${0.55 * 175.9} 175.9`} transform="rotate(-90 35 35)" strokeLinecap="round"/>
                <circle cx="35" cy="35" r="28" fill="none" stroke="#EB2026" strokeWidth="10" strokeDasharray={`${0.20 * 175.9} 175.9`} strokeDashoffset={`${-0.55 * 175.9}`} transform="rotate(-90 35 35)" strokeLinecap="round"/>
                <circle cx="35" cy="35" r="28" fill="none" stroke="#003580" strokeWidth="10" strokeDasharray={`${0.15 * 175.9} 175.9`} strokeDashoffset={`${-0.75 * 175.9}`} transform="rotate(-90 35 35)" strokeLinecap="round"/>
                <circle cx="35" cy="35" r="28" fill="none" stroke="#F0728F" strokeWidth="10" strokeDasharray={`${0.10 * 175.9} 175.9`} strokeDashoffset={`${-0.90 * 175.9}`} transform="rotate(-90 35 35)" strokeLinecap="round"/>
              </svg>
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[
                [isHi ? 'डायरेक्ट' : 'Direct', 55, T.primary],
                ['MakeMyTrip', 20, '#EB2026'],
                ['Booking.com', 15, '#003580'],
                ['Goibibo', 10, '#F0728F'],
              ].map(([n, p, c]) => (
                <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: c }} />
                  <span style={{ flex: 1, color: T.ink2 }}>{n}</span>
                  <span className="tnum" style={{ fontWeight: 700, color: T.ink }}>{p}%</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      <DailyCloseCard todayBookings={today} isHi={isHi} />
    </div>
  );
}

import { useState, useMemo, useRef } from 'react';
import { T } from '../tokens.js';
import { DAYS, dateToIdx } from '../data.js';
import Icon from '../components/Icon.jsx';
import Chip from '../components/Chip.jsx';
import Field from '../components/Field.jsx';
import Avatar from '../components/Avatar.jsx';
import ScreenHeader from '../components/ScreenHeader.jsx';

// Map a YYYY-MM-DD string (from <input type="date">) to a day index
// relative to DAYS[0] (today). Returns null if empty/unparseable.
function dateToDayIdx(yyyymmdd) {
  if (!yyyymmdd) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(yyyymmdd)) return null;
  return dateToIdx(yyyymmdd);
}

const iconBtn2 = {
  width: 36, height: 36, borderRadius: 10, border: 'none', background: T.primary,
  color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
};

const ALL_GUESTS = [
  { name: 'Aditya Birla',     phone: '+91 90099 ··· 50', stays: 7, lastStay: '2 days ago',  spent: 412000, vip: true,  tag: 'Whale' },
  { name: 'Priya Nair',       phone: '+91 90220 ··· 33', stays: 4, lastStay: 'In-house',    spent: 84000,              tag: 'Repeat', inhouse: true },
  { name: 'Aanya Sharma',     phone: '+91 98100 ··· 21', stays: 2, lastStay: 'Today',       spent: 26000 },
  { name: 'James Whitman',    phone: '+44 7700 ··· 19',  stays: 1, lastStay: 'Today',       spent: 36000, formC: true, tag: 'Foreign' },
  { name: 'Sonia Banerjee',   phone: '+91 90909 ··· 17', stays: 3, lastStay: '5 weeks ago', spent: 92000 },
  { name: "Maeve O'Connor",   phone: '+353 87 ··· 41',   stays: 1, lastStay: 'Tomorrow',    spent: 28500, formC: true },
  { name: 'Hiroshi Tanaka',   phone: '+81 90 ··· 28',    stays: 2, lastStay: '14 May',      spent: 28800, formC: true, tag: 'Foreign' },
  { name: 'Vikram Sethi',     phone: '+91 98300 ··· 45', stays: 5, lastStay: 'Today',       spent: 58000,              tag: 'Repeat' },
  { name: 'Karthik Iyer',     phone: '+91 88000 ··· 12', stays: 1, lastStay: '08 May',      spent: 9000 },
];

const FILTERS = [
  { id: 'all',     label: 'All' },
  { id: 'vip',     label: '★ VIP' },
  { id: 'repeat',  label: 'Repeat' },
  { id: 'foreign', label: 'Foreign' },
  { id: 'inhouse', label: 'In-house' },
];

export default function Guests({ go, bookings = [], t }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [stayDate, setStayDate] = useState('');
  const stayDateRef = useRef(null);

  // Augment guest list with current in-house markers from live bookings.
  // `ranges` tracks each booking's [startIdx, nights] so we can filter by stay date.
  const liveGuests = useMemo(() => {
    const bookingGuests = new Map();
    bookings.forEach(b => {
      const key = b.guest;
      const prev = bookingGuests.get(key);
      bookingGuests.set(key, {
        name: b.guest,
        phone: b.phone || '',
        stays: (prev?.stays || 0) + 1,
        spent: (prev?.spent || 0) + (b.total || 0),
        vip: prev?.vip || b.vip || false,
        formC: prev?.formC || b.formC || false,
        inhouse: prev?.inhouse || b.status === 'checkedin',
        lastStatus: b.status,
        ranges: [...(prev?.ranges || []), { startIdx: b.startIdx, nights: b.nights, cancelled: b.status === 'cancelled' }],
      });
    });
    // Merge: prefer the booking-derived row when names match, else fall back to seed.
    const merged = [];
    const seen = new Set();
    bookingGuests.forEach((g, name) => {
      const seed = ALL_GUESTS.find(s => s.name === name);
      merged.push({
        ...(seed || {}),
        ...g,
        tag: seed?.tag || (g.formC ? 'Foreign' : g.stays > 2 ? 'Repeat' : g.vip ? 'Whale' : undefined),
        lastStay: g.inhouse ? 'In-house' : (seed?.lastStay || 'Recent'),
      });
      seen.add(name);
    });
    ALL_GUESTS.forEach(s => { if (!seen.has(s.name)) merged.push(s); });
    return merged;
  }, [bookings]);

  const counts = useMemo(() => ({
    all:     liveGuests.length,
    vip:     liveGuests.filter(g => g.vip).length,
    repeat:  liveGuests.filter(g => g.stays >= 2 && !g.formC).length,
    foreign: liveGuests.filter(g => g.formC).length,
    inhouse: liveGuests.filter(g => g.inhouse).length,
  }), [liveGuests]);

  const targetDayIdx = useMemo(() => dateToDayIdx(stayDate), [stayDate]);
  const dateOutOfRange = stayDate && (targetDayIdx === null || targetDayIdx < 0 || targetDayIdx >= DAYS.length);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return liveGuests.filter(g => {
      if (filter === 'vip' && !g.vip) return false;
      if (filter === 'repeat' && (g.stays < 2 || g.formC)) return false;
      if (filter === 'foreign' && !g.formC) return false;
      if (filter === 'inhouse' && !g.inhouse) return false;
      if (q && !(`${g.name} ${g.phone}`.toLowerCase().includes(q))) return false;
      if (targetDayIdx !== null) {
        const stayed = (g.ranges || []).some(r => !r.cancelled && r.startIdx <= targetDayIdx && targetDayIdx < r.startIdx + r.nights);
        if (!stayed) return false;
      }
      return true;
    });
  }, [liveGuests, filter, search, targetDayIdx]);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: T.bg }}>
      <ScreenHeader title={t('guests')} subtitle={`${counts.all} contacts · ${counts.inhouse} in-house`}
        right={<button style={iconBtn2}><Icon name="plus" size={18} /></button>}
      />
      <div style={{ padding: '12px 16px', background: T.card, borderBottom: `1px solid ${T.borderSoft}` }}>
        <Field
          placeholder="Search by name, phone, email…"
          prefix={<Icon name="search" size={14} color={T.ink3} />}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          suffix={search ? (
            <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: T.ink3, display: 'flex' }}>
              <Icon name="x" size={12} />
            </button>
          ) : null}
        />
        <div style={{ display: 'flex', gap: 6, marginTop: 10, overflowX: 'auto' }}>
          {FILTERS.map(f => {
            const active = filter === f.id;
            const tone = active ? { bg: T.primaryLt, fg: T.primaryDk, br: T.primary } : { bg: T.bgSoft, fg: T.ink2, br: T.borderSoft };
            const count = counts[f.id];
            return (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className="atithi-tap"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '4px 10px', borderRadius: 999,
                  background: tone.bg, color: tone.fg,
                  border: `1px solid ${tone.br}`,
                  fontSize: 11, fontWeight: 600, letterSpacing: 0.1, lineHeight: 1.4,
                  whiteSpace: 'nowrap', cursor: 'pointer',
                }}
              >
                <span>{f.label}</span>
                {count > 0 && <span className="tnum" style={{ fontSize: 10, fontWeight: 700, opacity: 0.7 }}>({count})</span>}
              </button>
            );
          })}
        </div>
        <div style={{
          position: 'relative', marginTop: 10,
          background: stayDate ? T.primaryLt : T.bgSoft,
          border: `1px solid ${stayDate ? T.primary : T.borderSoft}`,
          borderRadius: 8, overflow: 'hidden',
        }}>
          <input
            ref={stayDateRef}
            type="date"
            value={stayDate}
            min={DAYS[0].iso}
            max={DAYS[DAYS.length - 1].iso}
            onChange={(e) => setStayDate(e.target.value)}
            onClick={() => {
              const el = stayDateRef.current;
              if (el && typeof el.showPicker === 'function') { try { el.showPicker(); } catch {} }
            }}
            aria-label="Filter by stay date"
            style={{
              width: '100%', height: '100%',
              padding: '6px 10px', minHeight: 32,
              border: 'none', outline: 'none', background: 'transparent',
              cursor: 'pointer', font: 'inherit',
            }}
          />
          <div style={{
            position: 'absolute', inset: 0, padding: '6px 10px',
            display: 'flex', alignItems: 'center', gap: 8,
            pointerEvents: 'none',
          }}>
            <Icon name="cal" size={13} color={stayDate ? T.primaryDk : T.ink3} />
            <span style={{ fontSize: 11, fontWeight: 700, color: stayDate ? T.primaryDk : T.ink2, letterSpacing: 0.1 }}>Stay date</span>
            <span className="tnum" style={{ flex: 1, fontSize: 12, fontWeight: 600, color: stayDate ? T.ink : T.ink3, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {stayDate
                ? new Date(stayDate + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                : 'Tap to pick'}
            </span>
          </div>
          {stayDate && (
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setStayDate(''); }}
              style={{
                position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)',
                zIndex: 2, background: 'rgba(255,255,255,0.85)', border: 'none', borderRadius: 4,
                cursor: 'pointer', padding: 2, color: T.ink3, display: 'flex',
              }}
              aria-label="Clear stay date"
            >
              <Icon name="x" size={12} />
            </button>
          )}
        </div>
        {dateOutOfRange && (
          <div style={{ marginTop: 6, fontSize: 10, color: T.ink3, fontWeight: 600 }}>
            Outside the 14-day diary window — pick a date between {DAYS[0].dom} {DAYS[0].month} and {DAYS[DAYS.length-1].dom} {DAYS[DAYS.length-1].month}.
          </div>
        )}
      </div>
      <div style={{ flex: 1, overflow: 'auto', paddingBottom: 100 }}>
        {filtered.length === 0 && (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: T.ink3 }}>
            <Icon name="search" size={28} color={T.ink4} />
            <div style={{ fontSize: 13, fontWeight: 600, marginTop: 10, color: T.ink2 }}>No guests match this filter</div>
            <div style={{ fontSize: 11, marginTop: 4 }}>Try clearing the search or pick a different chip.</div>
          </div>
        )}
        {filtered.map((g, i) => {
          // Pick the guest's most-recent non-cancelled booking; fall back
          // to any booking for them; null if seed-only with no real
          // booking. Clicking the row opens that booking's detail page.
          const guestBookings = (bookings || []).filter(b => b.guest === g.name);
          const openable = guestBookings.find(b => b.status !== 'cancelled')
            || guestBookings.sort((a, b) => (b.startIdx || 0) - (a.startIdx || 0))[0]
            || null;
          const onOpen = () => {
            if (openable && go) go('booking', openable.id);
          };
          return (
          <div
            key={`${g.name}-${i}`}
            onClick={onOpen}
            className="atithi-tap"
            style={{
              padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12,
              borderBottom: `1px solid ${T.borderSoft}`, background: T.card,
              cursor: openable ? 'pointer' : 'default',
            }}
          >
            <Avatar name={g.name} size={44} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: T.ink }}>{g.name}</span>
                {g.vip && <span style={{ color: 'oklch(60% 0.16 60)', fontSize: 12 }}>★</span>}
                {g.tag && <Chip color={g.formC ? 'indigo' : g.vip ? 'warn' : 'soft'} style={{ fontSize: 9, padding: '1px 6px' }}>{g.tag}</Chip>}
                {g.inhouse && <Chip color="ok" style={{ fontSize: 9, padding: '1px 6px' }}>In-house</Chip>}
              </div>
              <div className="tnum" style={{ fontSize: 12, color: T.ink3, marginTop: 2 }}>
                {g.phone} · {g.stays} stay{g.stays > 1 ? 's' : ''} · {g.lastStay}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="tnum" style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>₹{(g.spent/1000).toFixed(0)}k</div>
              <div style={{ fontSize: 9, color: T.ink3, fontWeight: 600 }}>lifetime</div>
            </div>
            {openable && <Icon name="chev" size={14} color={T.ink3} />}
          </div>
          );
        })}
      </div>
    </div>
  );
}

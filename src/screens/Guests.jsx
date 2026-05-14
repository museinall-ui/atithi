import { useState, useMemo } from 'react';
import { T } from '../tokens.js';
import Icon from '../components/Icon.jsx';
import Chip from '../components/Chip.jsx';
import Field from '../components/Field.jsx';
import Avatar from '../components/Avatar.jsx';
import ScreenHeader from '../components/ScreenHeader.jsx';

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

  // Augment guest list with current in-house markers from live bookings.
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return liveGuests.filter(g => {
      if (filter === 'vip' && !g.vip) return false;
      if (filter === 'repeat' && (g.stays < 2 || g.formC)) return false;
      if (filter === 'foreign' && !g.formC) return false;
      if (filter === 'inhouse' && !g.inhouse) return false;
      if (q && !(`${g.name} ${g.phone}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [liveGuests, filter, search]);

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
      </div>
      <div style={{ flex: 1, overflow: 'auto', paddingBottom: 100 }}>
        {filtered.length === 0 && (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: T.ink3 }}>
            <Icon name="search" size={28} color={T.ink4} />
            <div style={{ fontSize: 13, fontWeight: 600, marginTop: 10, color: T.ink2 }}>No guests match this filter</div>
            <div style={{ fontSize: 11, marginTop: 4 }}>Try clearing the search or pick a different chip.</div>
          </div>
        )}
        {filtered.map((g, i) => (
          <div key={`${g.name}-${i}`} style={{
            padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12,
            borderBottom: `1px solid ${T.borderSoft}`, background: T.card, cursor: 'pointer',
          }}>
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
          </div>
        ))}
      </div>
    </div>
  );
}

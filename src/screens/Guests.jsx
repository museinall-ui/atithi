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
  { name: 'Priya Nair',       phone: '+91 90220 ··· 33', stays: 4, lastStay: 'In-house',    spent: 84000,              tag: 'Repeat' },
  { name: 'Aanya Sharma',     phone: '+91 98100 ··· 21', stays: 2, lastStay: 'Today',       spent: 26000 },
  { name: 'James Whitman',    phone: '+44 7700 ··· 19',  stays: 1, lastStay: 'Today',       spent: 36000, formC: true, tag: 'Foreign' },
  { name: 'Sonia Banerjee',   phone: '+91 90909 ··· 17', stays: 3, lastStay: '5 weeks ago', spent: 92000 },
  { name: "Maeve O'Connor",   phone: '+353 87 ··· 41',   stays: 1, lastStay: 'Tomorrow',    spent: 28500, formC: true },
  { name: 'Hiroshi Tanaka',   phone: '+81 90 ··· 28',    stays: 2, lastStay: '14 May',      spent: 28800, formC: true, tag: 'Foreign' },
  { name: 'Vikram Sethi',     phone: '+91 98300 ··· 45', stays: 5, lastStay: 'Today',       spent: 58000,              tag: 'Repeat' },
  { name: 'Karthik Iyer',     phone: '+91 88000 ··· 12', stays: 1, lastStay: '08 May',      spent: 9000 },
];

export default function Guests({ go, bookings, t }) {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: T.bg }}>
      <ScreenHeader title={t('guests')} subtitle="1,248 contacts · 73 this month"
        right={<button style={iconBtn2}><Icon name="plus" size={18} /></button>}
      />
      <div style={{ padding: '12px 16px', background: T.card, borderBottom: `1px solid ${T.borderSoft}` }}>
        <Field placeholder="Search by name, phone, email…" prefix={<Icon name="search" size={14} color={T.ink3} />} value="" onChange={() => {}} />
        <div style={{ display: 'flex', gap: 6, marginTop: 10, overflowX: 'auto' }}>
          <Chip color="primary">All</Chip>
          <Chip>★ VIP (12)</Chip>
          <Chip>Repeat (134)</Chip>
          <Chip>Foreign (89)</Chip>
          <Chip>In-house (8)</Chip>
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'auto', paddingBottom: 100 }}>
        {ALL_GUESTS.map((g, i) => (
          <div key={i} style={{
            padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12,
            borderBottom: `1px solid ${T.borderSoft}`, background: T.card, cursor: 'pointer',
          }}>
            <Avatar name={g.name} size={44} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: T.ink }}>{g.name}</span>
                {g.vip && <span style={{ color: 'oklch(60% 0.16 60)', fontSize: 12 }}>★</span>}
                {g.tag && <Chip color={g.formC ? 'indigo' : g.vip ? 'warn' : 'soft'} style={{ fontSize: 9, padding: '1px 6px' }}>{g.tag}</Chip>}
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

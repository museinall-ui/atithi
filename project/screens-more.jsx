// screens-more.jsx — Guests, Reports, BookingConfirmed (Rates/Channels/Settings live in their own files)

// ─────────────────────────────────────────────────────────────
// GUEST CRM
// ─────────────────────────────────────────────────────────────
function Guests({ go, bookings, t }) {
  const all = [
    { name: 'Aditya Birla',     phone: '+91 90099 ··· 50', stays: 7, lastStay: '2 days ago',  spent: 412000, vip: true,  tag: 'Whale' },
    { name: 'Priya Nair',       phone: '+91 90220 ··· 33', stays: 4, lastStay: 'In-house',    spent: 84000,                tag: 'Repeat' },
    { name: 'Aanya Sharma',     phone: '+91 98100 ··· 21', stays: 2, lastStay: 'Today',       spent: 26000 },
    { name: 'James Whitman',    phone: '+44 7700 ··· 19',  stays: 1, lastStay: 'Today',       spent: 36000, formC: true,   tag: 'Foreign' },
    { name: 'Sonia Banerjee',   phone: '+91 90909 ··· 17', stays: 3, lastStay: '5 weeks ago', spent: 92000 },
    { name: 'Maeve O\'Connor',  phone: '+353 87 ··· 41',   stays: 1, lastStay: 'Tomorrow',    spent: 28500, formC: true },
    { name: 'Hiroshi Tanaka',   phone: '+81 90 ··· 28',    stays: 2, lastStay: '14 May',      spent: 28800, formC: true,   tag: 'Foreign' },
    { name: 'Vikram Sethi',     phone: '+91 98300 ··· 45', stays: 5, lastStay: 'Today',       spent: 58000,                tag: 'Repeat' },
    { name: 'Karthik Iyer',     phone: '+91 88000 ··· 12', stays: 1, lastStay: '08 May',      spent: 9000 },
  ];
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
        {all.map((g, i) => (
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

const iconBtn2 = {
  width: 36, height: 36, borderRadius: 10, border: 'none', background: T.primary,
  color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
};

// ─────────────────────────────────────────────────────────────
// REPORTS
// ─────────────────────────────────────────────────────────────
function Reports({ go, t }) {
  const monthData = [62, 70, 75, 68, 78, 88, 95, 90, 72, 80, 85, 92, 88, 78];
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: T.bg }}>
      <ScreenHeader title={t('reportsTitle')} subtitle="May 2026" onBack={() => go('home')}
        right={<Btn size="sm" variant="ghost" icon="download">Export</Btn>}
      />
      <div style={{ flex: 1, overflow: 'auto', padding: 16, paddingBottom: 100 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
          <KPI label={t('revenue')} value="₹4.8L" delta="+18%" icon="inr" color={T.primary} />
          <KPI label={t('avgOccupancy')} value="78%" delta="+6%" icon="bed" color={T.indigo} />
          <KPI label="ADR" value="₹6,420" delta="+4%" icon="tag" color={T.teal} />
          <KPI label="RevPAR" value="₹5,008" delta="+12%" icon="chart" color="oklch(60% 0.14 320)" />
        </div>

        <Card style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14, alignItems: 'baseline' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>Daily occupancy</div>
              <div style={{ fontSize: 11, color: T.ink3 }}>Last 14 days</div>
            </div>
            <Chip color="ok">+12% vs Apr</Chip>
          </div>
          <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 80 }}>
            {monthData.map((v, i) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{
                  width: '100%', height: `${v}%`, borderRadius: '3px 3px 0 0',
                  background: i === 1 ? T.primary : `oklch(${50 + v/3}% ${0.04 + v/1500} 38)`,
                }} />
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
            {monthData.map((_, i) => (
              <span key={i} style={{ flex: 1, fontSize: 8, color: T.ink3, textAlign: 'center', fontWeight: 600 }} className="tnum">
                {i % 3 === 0 ? 4 + i : ''}
              </span>
            ))}
          </div>
        </Card>

        <SectionHead title="Top room types" />
        <Card padding={0}>
          {ROOM_TYPES.map((r, i) => {
            const pct = [42, 28, 18, 12][i];
            return (
              <div key={r.id} style={{
                padding: '12px 14px',
                borderBottom: i < ROOM_TYPES.length - 1 ? `1px solid ${T.borderSoft}` : 'none',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: T.ink }}>{r.name}</span>
                  <span className="tnum" style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>₹{((r.base * pct * 0.30)/1000).toFixed(0)}k</span>
                </div>
                <div style={{ height: 4, background: T.bgSoft, borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ width: `${pct * 2}%`, height: '100%', background: T[r.tag], borderRadius: 2 }} />
                </div>
              </div>
            );
          })}
        </Card>

        <SectionHead title="Compliance" style={{ marginTop: 18 }} />
        <Card>
          <Row label="GST collected" value="₹52,140" />
          <Row label="Form C filed" value="3 of 3" />
          <Row label="GSTR-1 next due" value="11 Jun" />
        </Card>
      </div>
    </div>
  );
}

const KPI = ({ label, value, delta, icon, color }) => (
  <Card padding={14}>
    <div style={{
      width: 28, height: 28, borderRadius: 8,
      background: `color-mix(in oklch, ${color} 14%, white)`, color,
      display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10,
    }}>
      <Icon name={icon} size={14} stroke={2} />
    </div>
    <div className="tnum" style={{ fontSize: 18, fontWeight: 700, color: T.ink, letterSpacing: -0.4 }}>{value}</div>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
      <span style={{ fontSize: 11, color: T.ink3, fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 10, color: T.ok, fontWeight: 700 }}>{delta}</span>
    </div>
  </Card>
);

// ─────────────────────────────────────────────────────────────
// CONFIRMED — celebration screen
// ─────────────────────────────────────────────────────────────
function BookingConfirmed({ go, t }) {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: T.bg }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, textAlign: 'center' }}>
        <div style={{
          width: 88, height: 88, borderRadius: '50%',
          background: T.okLt, color: T.ok,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 20,
        }}>
          <Icon name="check" size={44} stroke={2.5} />
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, color: T.ink, letterSpacing: -0.4 }}>Booking confirmed</div>
        <div style={{ fontSize: 13, color: T.ink3, marginTop: 6, lineHeight: 1.5, maxWidth: 280 }}>
          BK-2854 · WhatsApp confirmation sent. Razorpay link delivered. Folio open.
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 24 }}>
          <Btn variant="ghost" onClick={() => go('home')}>{t('home')}</Btn>
          <Btn icon="cal" onClick={() => go('diary')}>{t('diary')}</Btn>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Guests, Reports, BookingConfirmed });

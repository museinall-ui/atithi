// screens-diary.jsx — Diary (calendar) + Dashboard

const D_MONTH_HI = ['जन','फ़र','मार्च','अप्रैल','मई','जून','जुल','अग','सित','अक्ट','नव','दिस'];
const D_DOW_HI   = ['सोम','मंगल','बुध','गुरु','शुक्र','शनि','रवि'];

// ─────────────────────────────────────────────────────────────
// DASHBOARD
// ─────────────────────────────────────────────────────────────
function Dashboard({ go, bookings, t, lang }) {
  const isHi = lang === 'hi';
  const [toast, setToast] = React.useState(null);
  React.useEffect(() => {
    const events = [
      { ch: 'MakeMyTrip', color: '#EB2026', who: 'Neha Agarwal', room: 'Deluxe Tent', total: 9000 },
      { ch: 'Booking.com', color: '#003580', who: 'Daniel Brunner', room: 'Luxury Tent', total: 14400 },
    ];
    let i = 0;
    const showOne = () => { setToast(events[i % events.length]); i++; setTimeout(() => setToast(null), 4500); };
    const t1 = setTimeout(showOne, 1800);
    const t2 = setInterval(showOne, 12000);
    return () => { clearTimeout(t1); clearInterval(t2); };
  }, []);

  const today = bookings.filter(b => b.startIdx === 1);
  const arriving = today.length;
  const departing = bookings.filter(b => b.startIdx + b.nights === 1).length;
  const inhouse = bookings.filter(b => b.startIdx <= 1 && b.startIdx + b.nights > 1).length;
  const totalRooms = ROOM_TYPES.reduce((a, r) => a + r.units, 0);

  // Per-category occupancy today
  const catOcc = ROOM_TYPES.map(rt => {
    const occ = bookings.filter(b => b.roomTypeId === rt.id && b.startIdx <= 1 && b.startIdx + b.nights > 1).length;
    return { rt, occ, total: rt.units };
  });
  const occRooms = catOcc.reduce((a, c) => a + c.occ, 0);

  // Daily income — sum of (per-night rate × in-house bookings today)
  const dailyIncome = bookings
    .filter(b => b.startIdx <= 1 && b.startIdx + b.nights > 1)
    .reduce((a, b) => a + Math.round(b.total / b.nights), 0);
  const collectedToday = bookings
    .filter(b => b.startIdx === 1)
    .reduce((a, b) => a + b.paid, 0) || 18500;

  // Monthly sales — last 12 days
  const monthlySales = [62, 70, 75, 68, 78, 88, 95, 90, 72, 80, 85, 92];
  const totalMonth = monthlySales.reduce((a, v) => a + v * 1100, 0);
  const peak = Math.max(...monthlySales);

  const onHold = bookings.filter(b => b.status === 'tentative');

  // Dates helpers
  const dayName = (idx, withDow=false) => {
    const d = DAYS[idx]; if (!d) return '';
    const mon = isHi ? D_MONTH_HI[4] : d.month;
    const dow = isHi ? D_DOW_HI[(idx + 0) % 7] : d.dow;
    return withDow ? `${dow} · ${d.dom} ${mon}` : `${d.dom} ${mon}`;
  };

  return (
    <div style={{ paddingBottom: 100, position: 'relative' }}>
      {/* Inbound OTA toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 14, left: 12, right: 12, zIndex: 100,
          background: T.card, borderRadius: 14, padding: '10px 12px',
          boxShadow: '0 12px 32px rgba(20,15,10,.18), 0 0 0 1px rgba(20,15,10,.06)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: toast.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 13, fontWeight: 700 }}>{toast.ch[0]}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.ink, display: 'flex', alignItems: 'center', gap: 4 }}>
              {isHi ? 'नई बुकिंग · ' : 'New booking · '}{toast.ch}
              <span style={{ width: 5, height: 5, borderRadius: 3, background: T.ok }} className="pulse" />
            </div>
            <div style={{ fontSize: 11, color: T.ink3, marginTop: 1 }} className="tnum">{toast.who} · {toast.room} · ₹{toast.total.toLocaleString('en-IN')}</div>
          </div>
          <button style={{ background: 'none', border: 'none', color: T.ink3, cursor: 'pointer', padding: 4 }} onClick={() => setToast(null)}>
            <Icon name="x" size={14} />
          </button>
        </div>
      )}

      {/* Hero header */}
      <div style={{
        background: `linear-gradient(160deg, ${T.primary} 0%, oklch(52% 0.16 28) 100%)`,
        padding: '56px 20px 18px', color: '#fff', position: 'relative', overflow: 'hidden',
      }}>
        <svg style={{ position: 'absolute', right: -20, top: -10, opacity: 0.1 }} width="180" height="180" viewBox="0 0 180 180">
          <circle cx="90" cy="90" r="60" stroke="#fff" strokeWidth="1" fill="none"/>
          <circle cx="90" cy="90" r="40" stroke="#fff" strokeWidth="1" fill="none"/>
          <circle cx="90" cy="90" r="20" stroke="#fff" strokeWidth="1" fill="none"/>
        </svg>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 11, opacity: 0.8, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' }} className={isHi ? 'hi' : ''}>{isHi ? 'मंगल · 5 मई 2026' : 'Tue, 5 May 2026'}</div>
            <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.4, marginTop: 2 }} className="hi">
              {t('namaste')}, Vikram
            </div>
            <div style={{ fontSize: 13, opacity: 0.85, marginTop: 1 }}>Yatra Desert Camp · Jaisalmer</div>
          </div>
          <button style={{
            width: 40, height: 40, borderRadius: '50%', border: 'none',
            background: 'rgba(255,255,255,0.18)', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
          }}>
            <Icon name="bell" size={18} />
            <span style={{ position: 'absolute', width: 8, height: 8, borderRadius: 4, background: 'oklch(70% 0.18 60)', transform: 'translate(10px, -10px)' }} />
          </button>
        </div>

        {/* Horizontal carousel — Occupancy + Daily income */}
        <div style={{ display: 'flex', gap: 10, overflowX: 'auto', margin: '0 -20px', padding: '0 20px 4px', scrollSnapType: 'x mandatory' }}>
          {/* Card 1 — Occupancy by category */}
          <div style={{
            background: 'rgba(255,255,255,0.14)', backdropFilter: 'blur(10px)',
            borderRadius: 14, padding: '12px 14px', border: '1px solid rgba(255,255,255,0.22)',
            minWidth: 'calc(100% - 26px)', scrollSnapAlign: 'start', flexShrink: 0,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
              <span style={{ fontSize: 10, opacity: 0.85, fontWeight: 700, letterSpacing: 0.4 }} className={isHi ? 'hi' : ''}>{t('occupancyToday')}</span>
              <span className="tnum" style={{ fontSize: 11, opacity: 0.85, fontWeight: 600 }}>{occRooms}/{totalRooms} {t('rooms')}</span>
            </div>
            <div className="tnum" style={{ fontSize: 28, fontWeight: 700, letterSpacing: -0.6, lineHeight: 1 }}>
              {occRooms}<span style={{ fontSize: 13, opacity: 0.75, fontWeight: 600 }}> {t('booked')}</span>
            </div>
            {/* Category bifurcation */}
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
          <div style={{
            background: 'rgba(255,255,255,0.14)', backdropFilter: 'blur(10px)',
            borderRadius: 14, padding: '12px 14px', border: '1px solid rgba(255,255,255,0.22)',
            minWidth: 'calc(100% - 26px)', scrollSnapAlign: 'start', flexShrink: 0,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
              <span style={{ fontSize: 10, opacity: 0.85, fontWeight: 700, letterSpacing: 0.4 }} className={isHi ? 'hi' : ''}>{t('dailyIncome')}</span>
              <span style={{ fontSize: 10, opacity: 0.85, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: 'rgba(255,255,255,0.18)' }}>+24%</span>
            </div>
            <div className="tnum" style={{ fontSize: 28, fontWeight: 700, letterSpacing: -0.6, lineHeight: 1 }}>
              ₹{(dailyIncome/1000).toFixed(1)}<span style={{ fontSize: 14, opacity: 0.8 }}>k</span>
            </div>
            <div style={{ fontSize: 10, opacity: 0.8, marginTop: 4, fontWeight: 600 }} className="tnum">
              {isHi ? 'आज वसूली' : 'Collected today'} ₹{collectedToday.toLocaleString('en-IN')}
            </div>
            <div style={{ marginTop: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 10, opacity: 0.85, fontWeight: 700, letterSpacing: 0.4 }} className={isHi ? 'hi' : ''}>{t('monthlySales')}</span>
                <span className="tnum" style={{ fontSize: 11, fontWeight: 700 }}>₹{Math.round(totalMonth/100000)}L</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 30 }}>
                {monthlySales.map((v, i) => (
                  <div key={i} style={{
                    flex: 1, height: `${(v/peak)*100}%`,
                    background: i === monthlySales.length - 1 ? '#fff' : 'rgba(255,255,255,0.55)',
                    borderRadius: '2px 2px 0 0',
                  }} />
                ))}
              </div>
            </div>
          </div>

          {/* Card 3 — Monthly slider detail */}
          <div style={{
            background: 'rgba(255,255,255,0.14)', backdropFilter: 'blur(10px)',
            borderRadius: 14, padding: '12px 14px', border: '1px solid rgba(255,255,255,0.22)',
            minWidth: 'calc(100% - 26px)', scrollSnapAlign: 'start', flexShrink: 0,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
              <span style={{ fontSize: 10, opacity: 0.85, fontWeight: 700, letterSpacing: 0.4 }} className={isHi ? 'hi' : ''}>{isHi ? 'महीने का सार' : 'MONTH SO FAR'}</span>
              <span style={{ fontSize: 10, opacity: 0.85, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: 'rgba(255,255,255,0.18)' }}>May 2026</span>
            </div>
            <div className="tnum" style={{ fontSize: 28, fontWeight: 700, letterSpacing: -0.6, lineHeight: 1 }}>
              ₹{Math.round(totalMonth/100000)}.{Math.round((totalMonth%100000)/10000)}<span style={{ fontSize: 13, opacity: 0.75, fontWeight: 600 }}>L</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 10, opacity: 0.85, fontWeight: 600 }}>
              <div><div className="tnum" style={{ fontSize: 14, fontWeight: 700 }}>78%</div>avg occ</div>
              <div><div className="tnum" style={{ fontSize: 14, fontWeight: 700 }}>₹6,420</div>ADR</div>
              <div><div className="tnum" style={{ fontSize: 14, fontWeight: 700 }}>14</div>days</div>
            </div>
          </div>
        </div>
        {/* dots */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 5, marginTop: 8 }}>
          {[0,1,2].map(i => <span key={i} style={{ width: i === 0 ? 14 : 5, height: 5, borderRadius: 3, background: i === 0 ? '#fff' : 'rgba(255,255,255,0.5)', transition: 'width .2s' }} />)}
        </div>
      </div>

      {/* Quick stats */}
      <div style={{ padding: '14px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        <StatTile label={t('arriving')} value={arriving} icon="arrow" color={T.primary} />
        <StatTile label={t('inhouse')} value={inhouse} icon="bed" color={T.indigo} />
        <StatTile label={t('departing')} value={departing} icon="door" color={T.teal} />
      </div>

      {/* On-hold alerts */}
      {onHold.length > 0 && (
        <div style={{ padding: '0 16px 14px' }}>
          <SectionHead title={t('autoRelease')} />
          <Card padding={0} style={{ overflow: 'hidden' }}>
            {onHold.map((b, i) => (
              <div key={b.id} onClick={() => go('booking', b.id)} style={{
                padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12,
                borderBottom: i < onHold.length - 1 ? `1px solid ${T.borderSoft}` : 'none', cursor: 'pointer',
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: T.warnLt, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'oklch(48% 0.14 75)',
                }}>
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
            ))}
          </Card>
        </div>
      )}

      {/* Arrivals — WITH DATES */}
      <div style={{ padding: '0 16px 14px' }}>
        <SectionHead title={t('arrivingToday')} action={
          <button onClick={() => go('diary')} style={{ background: 'none', border: 'none', color: T.primary, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            {t('seeAll')} <Icon name="chev" size={11} stroke={2.5} />
          </button>
        } />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {today.slice(0, 4).map(b => <ArrivalRow key={b.id} b={b} go={go} dayName={dayName} t={t} />)}
        </div>
      </div>

      {/* Channel snapshot */}
      <div style={{ padding: '0 16px 16px' }}>
        <SectionHead title={t('channelMix')} />
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ position: 'relative', width: 70, height: 70 }}>
              <svg width="70" height="70" viewBox="0 0 70 70">
                <circle cx="35" cy="35" r="28" fill="none" stroke={T.bgSoft} strokeWidth="10"/>
                <circle cx="35" cy="35" r="28" fill="none" stroke={T.primary} strokeWidth="10"
                  strokeDasharray={`${0.55 * 175.9} 175.9`} transform="rotate(-90 35 35)" strokeLinecap="round"/>
                <circle cx="35" cy="35" r="28" fill="none" stroke="#EB2026" strokeWidth="10"
                  strokeDasharray={`${0.20 * 175.9} 175.9`} strokeDashoffset={`${-0.55 * 175.9}`} transform="rotate(-90 35 35)" strokeLinecap="round"/>
                <circle cx="35" cy="35" r="28" fill="none" stroke="#003580" strokeWidth="10"
                  strokeDasharray={`${0.15 * 175.9} 175.9`} strokeDashoffset={`${-0.75 * 175.9}`} transform="rotate(-90 35 35)" strokeLinecap="round"/>
                <circle cx="35" cy="35" r="28" fill="none" stroke="#F0728F" strokeWidth="10"
                  strokeDasharray={`${0.10 * 175.9} 175.9`} strokeDashoffset={`${-0.90 * 175.9}`} transform="rotate(-90 35 35)" strokeLinecap="round"/>
              </svg>
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[
                [isHi?'डायरेक्ट':'Direct',       55, T.primary],
                ['MakeMyTrip',   20, '#EB2026'],
                ['Booking.com',  15, '#003580'],
                ['Goibibo',      10, '#F0728F'],
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
    </div>
  );
}

const StatTile = ({ label, value, icon, color }) => (
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

const ArrivalRow = ({ b, go, dayName, t }) => {
  const rt = ROOM_TYPES.find(r => r.id === b.roomTypeId);
  const ch = CHANNELS[b.channel];
  return (
    <Card padding={12} onClick={() => go('booking', b.id)} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}>
      <Avatar name={b.guest} size={40} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.guest}</span>
          {b.vip && <Chip color="warn" style={{ padding: '1px 6px', fontSize: 9 }}>VIP</Chip>}
          {b.formC && <Chip color="indigo" style={{ padding: '1px 6px', fontSize: 9 }}>Form C</Chip>}
        </div>
        {/* DATES ROW */}
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
};

// ─────────────────────────────────────────────────────────────
// DIARY — with drag-confirm modal
// ─────────────────────────────────────────────────────────────
function Diary({ go, bookings, setBookings, t }) {
  const [zoom, setZoom] = React.useState(58);
  const [collapsed, setCollapsed] = React.useState({});
  const [drag, setDrag] = React.useState(null);
  const [confirmDrop, setConfirmDrop] = React.useState(null); // { id, origStart, newStart, b }
  const colW = zoom;
  const rowH = 36;
  const labelW = 110;

  const onPointerDown = (e, b) => {
    e.preventDefault();
    const startX = e.clientX;
    const origStart = b.startIdx;
    const move = (ev) => {
      const dx = Math.round((ev.clientX - startX) / colW);
      setDrag({ id: b.id, dx });
    };
    const up = (ev) => {
      const dx = Math.round((ev.clientX - startX) / colW);
      setDrag(null);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (dx !== 0) {
        const newStart = Math.max(0, Math.min(DAYS.length - b.nights, origStart + dx));
        if (newStart !== origStart) setConfirmDrop({ id: b.id, origStart, newStart, b });
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const fmtDate = (idx) => { const d = DAYS[idx]; return d ? `${d.dow} ${d.dom} ${d.month}` : ''; };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: T.bg, position: 'relative' }}>
      <ScreenHeader title={t('diaryTitle')} subtitle={t('diarySub')}
        right={<div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => setZoom(z => Math.max(40, z - 10))} style={iconBtn}><span style={{ fontSize: 18, lineHeight: 1, color: T.ink2 }}>−</span></button>
          <button onClick={() => setZoom(z => Math.min(90, z + 10))} style={iconBtn}><span style={{ fontSize: 16, lineHeight: 1, color: T.ink2 }}>+</span></button>
        </div>}
      />
      <div style={{ padding: '10px 16px', display: 'flex', gap: 8, overflowX: 'auto', borderBottom: `1px solid ${T.borderSoft}`, background: T.card }}>
        <Chip color="primary" icon="filter">All rooms</Chip>
        <Chip>Confirmed</Chip>
        <Chip>On-hold (2)</Chip>
        <Chip>Form C (3)</Chip>
        <Chip>OTA</Chip>
      </div>

      <div style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
        <div style={{ minWidth: labelW + colW * DAYS.length + 16, position: 'relative' }}>
          <div style={{ position: 'sticky', top: 0, zIndex: 5, display: 'flex', background: T.card, borderBottom: `1px solid ${T.border}` }}>
            <div style={{ width: labelW, flexShrink: 0, borderRight: `1px solid ${T.borderSoft}`, padding: '8px 10px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: T.ink3, letterSpacing: 0.4 }}>MAY 2026</div>
              <div style={{ fontSize: 11, color: T.ink3 }}>13 stays</div>
            </div>
            {DAYS.map((d, i) => {
              const isToday = i === 1;
              return (
                <div key={d.iso} style={{
                  width: colW, flexShrink: 0, padding: '8px 0', textAlign: 'center',
                  background: isToday ? T.primaryLt : 'transparent',
                  borderRight: `1px solid ${T.borderSoft}`,
                }}>
                  <div style={{ fontSize: 9, fontWeight: 600, color: d.isWknd ? T.primary : T.ink3, letterSpacing: 0.4 }}>{d.dow.toUpperCase()}</div>
                  <div className="tnum" style={{ fontSize: 16, fontWeight: 700, color: isToday ? T.primary : T.ink, letterSpacing: -0.3, marginTop: 1 }}>{d.dom}</div>
                </div>
              );
            })}
          </div>

          <div style={{ display: 'flex', borderBottom: `1px solid ${T.border}`, background: T.bgSoft }}>
            <div style={{ width: labelW, flexShrink: 0, padding: '6px 10px', borderRight: `1px solid ${T.borderSoft}` }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: T.ink3, letterSpacing: 0.4 }}>OCCUPANCY</div>
            </div>
            {DAYS.map((d, i) => {
              const occRooms = bookings.filter(b => b.startIdx <= i && b.startIdx + b.nights > i).length;
              const totalRooms = ROOM_TYPES.reduce((a, r) => a + r.units, 0);
              const occ = Math.round((occRooms / totalRooms) * 100);
              return (
                <div key={d.iso} style={{
                  width: colW, flexShrink: 0, padding: '6px 4px', textAlign: 'center',
                  borderRight: `1px solid ${T.borderSoft}`,
                }}>
                  <div className="tnum" style={{
                    fontSize: 11, fontWeight: 700,
                    color: occ > 80 ? T.danger : occ > 50 ? 'oklch(48% 0.14 75)' : T.ok,
                  }}>{occ}%</div>
                </div>
              );
            })}
          </div>

          {ROOM_TYPES.map(rt => (
            <RoomTypeBlock
              key={rt.id} rt={rt}
              collapsed={collapsed[rt.id]}
              onToggle={() => setCollapsed(c => ({ ...c, [rt.id]: !c[rt.id] }))}
              bookings={bookings.filter(b => b.roomTypeId === rt.id)}
              colW={colW} rowH={rowH} labelW={labelW}
              drag={drag}
              onPointerDown={onPointerDown}
              go={go}
            />
          ))}
        </div>

        <div style={{
          position: 'absolute', top: 60, bottom: 0,
          left: labelW + colW + colW / 2, width: 2,
          background: T.primary, opacity: 0.5, pointerEvents: 'none',
        }} />
      </div>

      {/* Drag-drop confirmation modal */}
      {confirmDrop && (
        <div style={{
          position: 'absolute', inset: 0, background: 'rgba(20,15,10,0.4)',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          zIndex: 100, padding: 0,
        }} onClick={() => setConfirmDrop(null)}>
          <div onClick={(e) => e.stopPropagation()} style={{
            background: T.card, width: '100%', borderRadius: '20px 20px 0 0',
            padding: '22px 20px 32px', boxShadow: '0 -8px 32px rgba(0,0,0,.2)',
          }}>
            <div style={{ width: 40, height: 4, borderRadius: 2, background: T.border, margin: '0 auto 18px' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12, background: T.warnLt,
                color: 'oklch(48% 0.14 75)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <Icon name="info" size={22} stroke={2} />
              </div>
              <div>
                <div style={{ fontSize: 17, fontWeight: 700, color: T.ink }}>{t('moveBooking')}</div>
                <div style={{ fontSize: 12, color: T.ink3 }}>{confirmDrop.b.guest} · {confirmDrop.b.id}</div>
              </div>
            </div>
            <div style={{
              background: T.bgSoft, borderRadius: 12, padding: 12, marginBottom: 14,
              display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 10,
            }}>
              <div>
                <div style={{ fontSize: 10, color: T.ink3, fontWeight: 700, letterSpacing: 0.4 }}>{t('from').toUpperCase()}</div>
                <div className="tnum" style={{ fontSize: 13, fontWeight: 700, color: T.ink, marginTop: 2 }}>{fmtDate(confirmDrop.origStart)}</div>
                <div style={{ fontSize: 10, color: T.ink3, marginTop: 1 }}>{confirmDrop.b.nights} nights</div>
              </div>
              <Icon name="arrow" size={16} color={T.primary} stroke={2.5} />
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 10, color: T.primary, fontWeight: 700, letterSpacing: 0.4 }}>{t('to').toUpperCase()}</div>
                <div className="tnum" style={{ fontSize: 13, fontWeight: 700, color: T.primary, marginTop: 2 }}>{fmtDate(confirmDrop.newStart)}</div>
                <div style={{ fontSize: 10, color: T.ink3, marginTop: 1 }}>{confirmDrop.b.nights} nights</div>
              </div>
            </div>
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: 8,
              padding: '10px 12px', background: T.indigoLt, borderRadius: 10, marginBottom: 16,
            }}>
              <Icon name="wa" size={14} color={T.indigo} stroke={2} />
              <div style={{ fontSize: 11, color: T.ink2, lineHeight: 1.4 }}>{t('moveDesc')}</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: 8 }}>
              <Btn variant="ghost" onClick={() => setConfirmDrop(null)}>{t('cancel')}</Btn>
              <Btn icon="check" onClick={() => {
                setBookings(arr => arr.map(x => x.id === confirmDrop.id ? { ...x, startIdx: confirmDrop.newStart } : x));
                setConfirmDrop(null);
              }}>{t('confirmMove')}</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const iconBtn = {
  width: 36, height: 36, borderRadius: 10, border: 'none', background: T.bgSoft,
  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: T.ink2,
};

function RoomTypeBlock({ rt, bookings, collapsed, onToggle, colW, rowH, labelW, drag, onPointerDown, go }) {
  const tagColor = T[rt.tag];
  return (
    <div>
      <div onClick={onToggle} style={{
        display: 'flex', borderBottom: `1px solid ${T.borderSoft}`,
        background: T.card, cursor: 'pointer',
      }}>
        <div style={{
          width: labelW, flexShrink: 0, padding: '8px 10px',
          borderRight: `1px solid ${T.borderSoft}`,
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <Icon name={collapsed ? 'chev' : 'chevD'} size={12} color={T.ink3} />
          <span style={{ width: 4, height: 14, borderRadius: 2, background: tagColor }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.ink, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rt.name}</div>
            <div style={{ fontSize: 9, color: T.ink3, fontWeight: 600 }} className="tnum">{rt.units} units · ₹{rt.base.toLocaleString('en-IN')}</div>
          </div>
        </div>
        {DAYS.map((d, i) => (
          <div key={d.iso} style={{
            width: colW, flexShrink: 0, borderRight: `1px solid ${T.borderSoft}`,
            background: d.isWknd ? 'oklch(98% 0.012 65)' : 'transparent',
          }} />
        ))}
      </div>

      {!collapsed && Array.from({ length: rt.units }).map((_, ui) => (
        <div key={ui} style={{
          display: 'flex', position: 'relative', height: rowH,
          borderBottom: `1px solid ${T.borderSoft}`,
        }}>
          <div style={{
            width: labelW, flexShrink: 0, padding: '0 10px',
            borderRight: `1px solid ${T.borderSoft}`, background: T.card,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: T.ink3, letterSpacing: 0.4 }}>#{ui + 1}</span>
          </div>
          {DAYS.map((d, i) => (
            <div key={d.iso} style={{
              width: colW, flexShrink: 0,
              borderRight: `1px solid ${T.borderSoft}`,
              background: d.isWknd ? 'oklch(98% 0.012 65)' : i === 1 ? 'oklch(98% 0.025 38)' : 'transparent',
            }} />
          ))}
          {bookings.filter(b => b.unitIdx === ui).map(b => {
            const dx = drag && drag.id === b.id ? drag.dx : 0;
            return (
              <BookingPill
                key={b.id} b={b} colW={colW} labelW={labelW} dx={dx}
                onPointerDown={(e) => onPointerDown(e, b)}
                onClick={() => !drag && go('booking', b.id)}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

function BookingPill({ b, colW, labelW, dx, onPointerDown, onClick }) {
  const ch = CHANNELS[b.channel];
  const isHold = b.status === 'tentative';
  const isCheckedin = b.status === 'checkedin';
  return (
    <div
      onPointerDown={onPointerDown}
      onClick={(e) => { if (Math.abs(dx) < 0.1) onClick(); }}
      style={{
        position: 'absolute',
        left: labelW + (b.startIdx + dx) * colW + 3,
        width: b.nights * colW - 6,
        top: 4, bottom: 4,
        background: isHold ? T.warnLt : isCheckedin ? T.indigoLt : T.card,
        border: isHold ? `1.5px dashed oklch(60% 0.14 75)` : isCheckedin ? `1.5px solid ${T.indigo}` : `1px solid ${T.border}`,
        borderRadius: 8,
        boxShadow: isHold ? 'none' : '0 1px 2px rgba(20,15,10,.06)',
        padding: '0 6px 0 4px',
        display: 'flex', alignItems: 'center', gap: 6,
        cursor: 'grab', userSelect: 'none', overflow: 'hidden',
        zIndex: dx !== 0 ? 5 : 2,
        transform: dx !== 0 ? 'scale(1.02)' : 'none',
        transition: dx === 0 ? 'transform .12s' : 'none',
      }}
    >
      <span style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, flexShrink: 0, background: ch.color, marginTop: 4, marginBottom: 4 }} />
      <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.2 }}>
          {b.vip && '★ '}{b.guest}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 1 }}>
          {isHold && <span className="tnum" style={{ fontSize: 9, fontWeight: 700, color: 'oklch(48% 0.14 75)' }}>⏱ {b.releaseAt}</span>}
          {!isHold && b.paid < b.total && <span className="tnum" style={{ fontSize: 9, fontWeight: 700, color: T.ink3 }}>₹{((b.total - b.paid)/1000).toFixed(1)}k due</span>}
          {!isHold && b.paid >= b.total && <span style={{ fontSize: 9, fontWeight: 700, color: T.ok, display: 'flex', alignItems: 'center', gap: 2 }}><Icon name="check" size={9} stroke={2.5} /> paid</span>}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Dashboard, Diary });

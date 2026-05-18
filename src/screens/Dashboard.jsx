import { useState, useEffect } from 'react';
import { T } from '../tokens.js';
import { ROOM_TYPES, CHANNELS, DAYS } from '../data.js';
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

function ArrivalRow({ b, go, dayName, t }) {
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
  const [toast, setToast] = useState(null);

  useEffect(() => {
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

  const catOcc = ROOM_TYPES.map(rt => {
    const occ = bookings.filter(b => b.roomTypeId === rt.id && b.startIdx <= 1 && b.startIdx + b.nights > 1).length;
    return { rt, occ, total: rt.units };
  });
  const occRooms = catOcc.reduce((a, c) => a + c.occ, 0);

  const dailyIncome = bookings
    .filter(b => b.startIdx <= 1 && b.startIdx + b.nights > 1)
    .reduce((a, b) => a + Math.round(b.total / b.nights), 0);
  const collectedToday = bookings
    .filter(b => b.startIdx === 1)
    .reduce((a, b) => a + b.paid, 0) || 18500;

  const monthlySales = [62, 70, 75, 68, 78, 88, 95, 90, 72, 80, 85, 92];
  const totalMonth = monthlySales.reduce((a, v) => a + v * 1100, 0);
  const peak = Math.max(...monthlySales);

  // Live "month so far" numbers, computed from real bookings so labels and values agree.
  const activeBookings = bookings.filter(b => b.status !== 'cancelled');
  const monthBookings = activeBookings.length;
  const monthRevenue = activeBookings.reduce((s, b) => s + (b.total || 0), 0);
  const monthRoomNights = activeBookings.reduce((s, b) => s + (b.nights || 0), 0);
  const availableRoomNights = totalRooms * DAYS.length;
  const monthOccPct = availableRoomNights > 0 ? Math.round((monthRoomNights / availableRoomNights) * 100) : 0;
  const monthAvgPerRoom = monthRoomNights > 0 ? Math.round(monthRevenue / monthRoomNights) : 0;

  const onHold = bookings.filter(b => b.status === 'tentative');

  // Pending payments: guest has arrived (or should have) but balance is still due.
  // These are the bookings most likely to be missing payment data needed for invoicing.
  const TODAY_IDX = 1;
  const pendingPayments = bookings.filter(b => {
    if (b.status === 'cancelled' || b.status === 'tentative') return false;
    const balance = (b.total || 0) - (b.paid || 0);
    if (balance <= 0) return false;
    if (b.status === 'checkedin' || b.status === 'checkout') return true;
    if (b.status === 'confirmed' && b.startIdx <= TODAY_IDX) return true;
    return false;
  });
  const pendingTotal = pendingPayments.reduce((s, b) => s + (b.total - b.paid), 0);
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

  const dayName = (idx, withDow = false) => {
    const d = DAYS[idx]; if (!d) return '';
    const mon = isHi ? D_MONTH_HI[4] : d.month;
    const dow = isHi ? D_DOW_HI[(idx + 0) % 7] : d.dow;
    return withDow ? `${dow} · ${d.dom} ${mon}` : `${d.dom} ${mon}`;
  };

  return (
    <div style={{ flex: 1, overflow: 'auto', paddingBottom: 100, position: 'relative' }}>
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
            <div style={{ fontSize: 11, opacity: 0.8, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' }} className={isHi ? 'hi' : ''}>{isHi ? 'मंगल · 5 मई 2026' : 'Tue, 5 May 2026'}</div>
            <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.4, marginTop: 2 }} className="hi">
              {t('namaste')}, Vikram
            </div>
            <div style={{ fontSize: 13, opacity: 0.85, marginTop: 1 }}>{property?.profile?.name || 'Yatra Desert Camp'} · {property?.profile?.city || 'Jaisalmer'}</div>
          </div>
          <button style={{
            width: 40, height: 40, borderRadius: '50%', border: 'none',
            background: 'rgba(255,255,255,0.18)', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', position: 'relative',
          }}>
            <Icon name="bell" size={18} />
            <span style={{ position: 'absolute', width: 8, height: 8, borderRadius: 4, background: 'oklch(70% 0.18 60)', top: 6, right: 6 }} />
          </button>
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
                  <div key={i} style={{ flex: 1, height: `${(v/peak)*100}%`, background: i === monthlySales.length - 1 ? '#fff' : 'rgba(255,255,255,0.55)', borderRadius: '2px 2px 0 0' }} />
                ))}
              </div>
            </div>
          </div>

          {/* Card 3 — Month summary */}
          <div style={{ background: 'rgba(255,255,255,0.14)', backdropFilter: 'blur(10px)', borderRadius: 14, padding: '12px 14px', border: '1px solid rgba(255,255,255,0.22)', minWidth: 'calc(100% - 26px)', scrollSnapAlign: 'start', flexShrink: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
              <span style={{ fontSize: 10, opacity: 0.85, fontWeight: 700, letterSpacing: 0.4 }} className={isHi ? 'hi' : ''}>{isHi ? 'इस महीने कमाई' : 'EARNED THIS MONTH'}</span>
              <span style={{ fontSize: 10, opacity: 0.85, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: 'rgba(255,255,255,0.18)' }}>{isHi ? 'मई 2026' : 'May 2026'}</span>
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
          {today.slice(0, 4).map(b => <ArrivalRow key={b.id} b={b} go={go} dayName={dayName} t={t} />)}
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
    </div>
  );
}

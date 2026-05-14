import { useState } from 'react';
import { T } from '../tokens.js';
import { ROOM_TYPES, DAYS, CHANNELS } from '../data.js';
import Icon from '../components/Icon.jsx';
import Chip from '../components/Chip.jsx';
import Btn from '../components/Btn.jsx';
import ScreenHeader from '../components/ScreenHeader.jsx';

const iconBtn = {
  width: 36, height: 36, borderRadius: 10, border: 'none', background: T.bgSoft,
  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: T.ink2,
};

function BookingPill({ b, colW, labelW, dx, onPointerDown, onClick }) {
  const ch = CHANNELS[b.channel];
  const isHold = b.status === 'tentative';
  const isCheckedin = b.status === 'checkedin';
  return (
    <div
      onPointerDown={onPointerDown}
      onClick={() => { if (Math.abs(dx) < 0.1) onClick(); }}
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

function RoomTypeBlock({ rt, bookings, collapsed, onToggle, colW, rowH, labelW, drag, onPointerDown, go }) {
  const tagColor = T[rt.tag];
  return (
    <div>
      <div onClick={onToggle} style={{ display: 'flex', borderBottom: `1px solid ${T.borderSoft}`, background: T.card, cursor: 'pointer' }}>
        <div style={{ width: labelW, flexShrink: 0, padding: '8px 10px', borderRight: `1px solid ${T.borderSoft}`, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon name={collapsed ? 'chev' : 'chevD'} size={12} color={T.ink3} />
          <span style={{ width: 4, height: 14, borderRadius: 2, background: tagColor }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.ink, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rt.name}</div>
            <div style={{ fontSize: 9, color: T.ink3, fontWeight: 600 }} className="tnum">{rt.units} units · ₹{rt.base.toLocaleString('en-IN')}</div>
          </div>
        </div>
        {DAYS.map((d) => (
          <div key={d.iso} style={{ width: colW, flexShrink: 0, borderRight: `1px solid ${T.borderSoft}`, background: d.isWknd ? 'oklch(98% 0.012 65)' : 'transparent' }} />
        ))}
      </div>
      {!collapsed && Array.from({ length: rt.units }).map((_, ui) => (
        <div key={ui} style={{ display: 'flex', position: 'relative', height: rowH, borderBottom: `1px solid ${T.borderSoft}` }}>
          <div style={{ width: labelW, flexShrink: 0, padding: '0 10px', borderRight: `1px solid ${T.borderSoft}`, background: T.card, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: T.ink3, letterSpacing: 0.4 }}>#{ui + 1}</span>
          </div>
          {DAYS.map((d, i) => (
            <div key={d.iso} style={{ width: colW, flexShrink: 0, borderRight: `1px solid ${T.borderSoft}`, background: d.isWknd ? 'oklch(98% 0.012 65)' : i === 1 ? 'oklch(98% 0.025 38)' : 'transparent' }} />
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

export default function Diary({ go, bookings, setBookings, t }) {
  const [zoom, setZoom] = useState(58);
  const [collapsed, setCollapsed] = useState({});
  const [drag, setDrag] = useState(null);
  const [confirmDrop, setConfirmDrop] = useState(null);
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
                <div key={d.iso} style={{ width: colW, flexShrink: 0, padding: '8px 0', textAlign: 'center', background: isToday ? T.primaryLt : 'transparent', borderRight: `1px solid ${T.borderSoft}` }}>
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
                <div key={d.iso} style={{ width: colW, flexShrink: 0, padding: '6px 4px', textAlign: 'center', borderRight: `1px solid ${T.borderSoft}` }}>
                  <div className="tnum" style={{ fontSize: 11, fontWeight: 700, color: occ > 80 ? T.danger : occ > 50 ? 'oklch(48% 0.14 75)' : T.ok }}>{occ}%</div>
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

        <div style={{ position: 'absolute', top: 60, bottom: 0, left: labelW + colW + colW / 2, width: 2, background: T.primary, opacity: 0.5, pointerEvents: 'none' }} />
      </div>

      {confirmDrop && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(20,15,10,0.4)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 100 }} onClick={() => setConfirmDrop(null)}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: T.card, width: '100%', borderRadius: '20px 20px 0 0', padding: '22px 20px 32px', boxShadow: '0 -8px 32px rgba(0,0,0,.2)' }}>
            <div style={{ width: 40, height: 4, borderRadius: 2, background: T.border, margin: '0 auto 18px' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: T.warnLt, color: 'oklch(48% 0.14 75)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name="info" size={22} stroke={2} />
              </div>
              <div>
                <div style={{ fontSize: 17, fontWeight: 700, color: T.ink }}>{t('moveBooking')}</div>
                <div style={{ fontSize: 12, color: T.ink3 }}>{confirmDrop.b.guest} · {confirmDrop.b.id}</div>
              </div>
            </div>
            <div style={{ background: T.bgSoft, borderRadius: 12, padding: 12, marginBottom: 14, display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 10 }}>
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
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px', background: T.indigoLt, borderRadius: 10, marginBottom: 16 }}>
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

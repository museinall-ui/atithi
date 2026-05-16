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

function BookingPill({ b, colW, labelW, dx, onPointerDown }) {
  const ch = CHANNELS[b.channel];
  const isHold = b.status === 'tentative';
  const isCheckedin = b.status === 'checkedin';
  const isCancelled = b.status === 'cancelled';
  return (
    <div
      onPointerDown={onPointerDown}
      style={{
        position: 'absolute',
        left: labelW + (b.startIdx + dx) * colW + 3,
        width: b.nights * colW - 6,
        top: 4, bottom: 4,
        background: isCancelled ? T.bgSunk : isHold ? T.warnLt : isCheckedin ? T.indigoLt : T.card,
        border: isHold ? `1.5px dashed oklch(60% 0.14 75)` : isCheckedin ? `1.5px solid ${T.indigo}` : isCancelled ? `1px dashed ${T.border}` : `1px solid ${T.border}`,
        borderRadius: 8,
        boxShadow: isHold ? 'none' : '0 1px 2px rgba(20,15,10,.06)',
        padding: '0 6px 0 4px',
        display: 'flex', alignItems: 'center', gap: 6,
        cursor: 'grab', userSelect: 'none', overflow: 'hidden',
        touchAction: 'none',
        zIndex: dx !== 0 ? 5 : 2,
        transform: dx !== 0 ? 'scale(1.02)' : 'none',
        transition: dx === 0 ? 'transform .12s' : 'none',
        opacity: isCancelled ? 0.55 : 1,
        textDecoration: isCancelled ? 'line-through' : 'none',
      }}
    >
      <span style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, flexShrink: 0, background: ch.color, marginTop: 4, marginBottom: 4 }} />
      <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.2 }}>
          {b.vip && '★ '}{b.guest}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 1 }}>
          {isHold && <span className="tnum" style={{ fontSize: 9, fontWeight: 700, color: 'oklch(48% 0.14 75)' }}>⏱ {b.releaseAt}</span>}
          {!isHold && !isCancelled && b.paid < b.total && <span className="tnum" style={{ fontSize: 9, fontWeight: 700, color: T.ink3 }}>₹{((b.total - b.paid)/1000).toFixed(1)}k due</span>}
          {!isHold && !isCancelled && b.paid >= b.total && <span style={{ fontSize: 9, fontWeight: 700, color: T.ok, display: 'flex', alignItems: 'center', gap: 2 }}><Icon name="check" size={9} stroke={2.5} /> paid</span>}
          {isCancelled && <span style={{ fontSize: 9, fontWeight: 700, color: T.ink3 }}>cancelled</span>}
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
      {!collapsed && Array.from({ length: rt.units }).map((_, ui) => {
        const isDropTarget = drag && drag.target && drag.target.roomTypeId === rt.id && drag.target.unitIdx === ui;
        return (
          <div
            key={ui}
            data-slot
            data-roomtype={rt.id}
            data-unit={ui}
            style={{
              display: 'flex', position: 'relative', height: rowH,
              borderBottom: `1px solid ${T.borderSoft}`,
              background: isDropTarget ? T.primaryLt : 'transparent',
              transition: 'background .12s',
            }}
          >
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
                />
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

const FILTERS = [
  { id: 'all',       label: 'All bookings', icon: 'filter' },
  { id: 'confirmed', label: 'Confirmed' },
  { id: 'hold',      label: 'On-hold' },
  { id: 'formC',     label: 'Form C' },
  { id: 'ota',       label: 'OTA' },
];

const matchesFilter = (b, filter) => {
  if (filter === 'all') return true;
  if (filter === 'confirmed') return b.status === 'confirmed';
  if (filter === 'hold') return b.status === 'tentative';
  if (filter === 'formC') return !!b.formC;
  if (filter === 'ota') return b.channel && b.channel !== 'direct';
  return true;
};

export default function Diary({ go, bookings, setBookings, moveBooking, t }) {
  const [zoom, setZoom] = useState(58);
  const [collapsed, setCollapsed] = useState({});
  const [drag, setDrag] = useState(null);
  const [confirmDrop, setConfirmDrop] = useState(null);
  const [filter, setFilter] = useState('all');
  const colW = zoom;
  const rowH = 36;
  const labelW = 110;

  const visibleBookings = bookings.filter(b => matchesFilter(b, filter));
  const counts = {
    confirmed: bookings.filter(b => b.status === 'confirmed').length,
    hold:      bookings.filter(b => b.status === 'tentative').length,
    formC:     bookings.filter(b => b.formC).length,
    ota:       bookings.filter(b => b.channel && b.channel !== 'direct').length,
  };

  const slotFromPoint = (x, y) => {
    const el = document.elementFromPoint(x, y);
    const slotEl = el && el.closest && el.closest('[data-slot]');
    if (!slotEl) return null;
    return {
      roomTypeId: slotEl.getAttribute('data-roomtype'),
      unitIdx: +slotEl.getAttribute('data-unit'),
    };
  };

  const onPointerDown = (e, b) => {
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const origStart = b.startIdx;
    let moved = false; // becomes true once the pointer travels far enough to count as a drag
    const move = (ev) => {
      const dx = Math.round((ev.clientX - startX) / colW);
      const target = slotFromPoint(ev.clientX, ev.clientY);
      if (Math.abs(ev.clientX - startX) > 4 || Math.abs(ev.clientY - startY) > 4) moved = true;
      setDrag({ id: b.id, dx, target });
    };
    const up = (ev) => {
      const dx = Math.round((ev.clientX - startX) / colW);
      const target = slotFromPoint(ev.clientX, ev.clientY);
      setDrag(null);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      const newStart = Math.max(0, Math.min(DAYS.length - b.nights, origStart + dx));
      const slotChanged = target && (target.roomTypeId !== b.roomTypeId || target.unitIdx !== b.unitIdx);
      const dateChanged = newStart !== origStart;
      if (slotChanged || dateChanged) {
        // Pointer travelled to a different slot/date → ask for confirmation, do not navigate.
        setConfirmDrop({ id: b.id, origStart, newStart, b, newSlot: slotChanged ? target : null });
      } else if (!moved) {
        // Treat as a tap → open the booking. Done here so the synthetic click that follows
        // pointerup can't race ahead and navigate after a real drag was attempted.
        go('booking', b.id);
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const fmtDate = (idx) => { const d = DAYS[idx]; return d ? `${d.dow} ${d.dom} ${d.month}` : ''; };

  const newRt = confirmDrop && confirmDrop.newSlot ? ROOM_TYPES.find(r => r.id === confirmDrop.newSlot.roomTypeId) : null;
  const origRt = confirmDrop ? ROOM_TYPES.find(r => r.id === confirmDrop.b.roomTypeId) : null;

  // Detect conflict: another booking already overlaps the target slot/dates.
  const targetConflict = (() => {
    if (!confirmDrop) return null;
    const newRoomType = confirmDrop.newSlot ? confirmDrop.newSlot.roomTypeId : confirmDrop.b.roomTypeId;
    const newUnit = confirmDrop.newSlot ? confirmDrop.newSlot.unitIdx : confirmDrop.b.unitIdx;
    const start = confirmDrop.newStart;
    const end = start + confirmDrop.b.nights;
    return bookings.find(x =>
      x.id !== confirmDrop.id &&
      x.roomTypeId === newRoomType &&
      x.unitIdx === newUnit &&
      x.status !== 'cancelled' &&
      x.startIdx < end &&
      (x.startIdx + x.nights) > start
    );
  })();

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: T.bg, position: 'relative' }}>
      <ScreenHeader title={t('diaryTitle')} subtitle={t('diarySub')}
        right={<div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => setZoom(z => Math.max(40, z - 10))} style={iconBtn}><span style={{ fontSize: 18, lineHeight: 1, color: T.ink2 }}>−</span></button>
          <button onClick={() => setZoom(z => Math.min(90, z + 10))} style={iconBtn}><span style={{ fontSize: 16, lineHeight: 1, color: T.ink2 }}>+</span></button>
        </div>}
      />
      <div style={{ padding: '10px 16px', display: 'flex', gap: 8, overflowX: 'auto', borderBottom: `1px solid ${T.borderSoft}`, background: T.card }}>
        {FILTERS.map(f => {
          const active = filter === f.id;
          const count = f.id === 'all' ? bookings.length : counts[f.id];
          const tone = active ? { bg: T.primaryLt, fg: T.primaryDk, br: T.primary } : { bg: T.bgSoft, fg: T.ink2, br: T.borderSoft };
          return (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className="atithi-tap"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '5px 11px', borderRadius: 999,
                background: tone.bg, color: tone.fg,
                border: `1px solid ${tone.br}`,
                fontSize: 11, fontWeight: 600, letterSpacing: 0.1, lineHeight: 1.4,
                whiteSpace: 'nowrap', cursor: 'pointer',
              }}
            >
              {f.icon && <Icon name={f.icon} size={11} stroke={2} />}
              <span>{f.label}</span>
              {count > 0 && f.id !== 'all' && (
                <span className="tnum" style={{ fontSize: 10, fontWeight: 700, opacity: 0.7 }}>· {count}</span>
              )}
            </button>
          );
        })}
      </div>

      <div style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
        <div style={{ minWidth: labelW + colW * DAYS.length + 16, position: 'relative' }}>
          <div style={{ position: 'sticky', top: 0, zIndex: 5, display: 'flex', background: T.card, borderBottom: `1px solid ${T.border}` }}>
            <div style={{ width: labelW, flexShrink: 0, borderRight: `1px solid ${T.borderSoft}`, padding: '8px 10px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: T.ink3, letterSpacing: 0.4 }}>MAY 2026</div>
              <div style={{ fontSize: 11, color: T.ink3 }}>{visibleBookings.length} stays</div>
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
              const activeBookings = bookings.filter(b => b.status !== 'cancelled');
              const occRooms = activeBookings.filter(b => b.startIdx <= i && b.startIdx + b.nights > i).length;
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
              bookings={visibleBookings.filter(b => b.roomTypeId === rt.id)}
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
                <div style={{ fontSize: 10, color: T.ink3, marginTop: 1 }}>{origRt ? `${origRt.name} #${confirmDrop.b.unitIdx + 1}` : ''} · {confirmDrop.b.nights}N</div>
              </div>
              <Icon name="arrow" size={16} color={T.primary} stroke={2.5} />
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 10, color: T.primary, fontWeight: 700, letterSpacing: 0.4 }}>{t('to').toUpperCase()}</div>
                <div className="tnum" style={{ fontSize: 13, fontWeight: 700, color: T.primary, marginTop: 2 }}>{fmtDate(confirmDrop.newStart)}</div>
                <div style={{ fontSize: 10, color: T.ink3, marginTop: 1 }}>
                  {confirmDrop.newSlot && newRt ? `${newRt.name} #${confirmDrop.newSlot.unitIdx + 1}` : `${origRt ? origRt.name : ''} #${confirmDrop.b.unitIdx + 1}`} · {confirmDrop.b.nights}N
                </div>
              </div>
            </div>
            {targetConflict ? (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px', background: T.dangerLt, borderRadius: 10, marginBottom: 16 }}>
                <Icon name="info" size={14} color={T.danger} stroke={2} />
                <div style={{ fontSize: 11, color: T.danger, lineHeight: 1.4, fontWeight: 600 }}>
                  Conflict: {targetConflict.guest} ({targetConflict.id}) already booked these dates. Pick a different unit or date.
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px', background: T.indigoLt, borderRadius: 10, marginBottom: 16 }}>
                <Icon name="wa" size={14} color={T.indigo} stroke={2} />
                <div style={{ fontSize: 11, color: T.ink2, lineHeight: 1.4 }}>{t('moveDesc')}</div>
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: 8 }}>
              <Btn variant="ghost" onClick={() => setConfirmDrop(null)}>{t('cancel')}</Btn>
              <Btn icon="check" disabled={!!targetConflict} onClick={() => {
                const patch = { startIdx: confirmDrop.newStart };
                if (confirmDrop.newSlot) {
                  patch.roomTypeId = confirmDrop.newSlot.roomTypeId;
                  patch.unitIdx = confirmDrop.newSlot.unitIdx;
                }
                if (moveBooking) moveBooking(confirmDrop.id, patch);
                else setBookings(arr => arr.map(x => x.id === confirmDrop.id ? { ...x, ...patch } : x));
                setConfirmDrop(null);
              }}>{t('confirmMove')}</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

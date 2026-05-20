import { useState, useMemo, useRef, useEffect } from 'react';
import { T } from '../tokens.js';
import { DAYS, CHANNELS, effectiveRoomTypes, ANCHOR, ymd, dateToIdx } from '../data.js';
import Icon from '../components/Icon.jsx';
import Chip from '../components/Chip.jsx';
import Btn from '../components/Btn.jsx';
import ScreenHeader from '../components/ScreenHeader.jsx';

const iconBtn = {
  width: 36, height: 36, borderRadius: 10, border: 'none', background: T.bgSoft,
  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: T.ink2,
};

// Compact initials from a name. "Aanya Sharma" → "AS"; "Rohan" → "R".
function initialsOf(name) {
  return (name || '').trim().split(/\s+/).map(s => s[0] || '').join('').slice(0, 2).toUpperCase();
}

function BookingPill({ b, colW, labelW, viewDaysStart, dx, onPointerDown }) {
  const ch = CHANNELS[b.channel];
  const isHold = b.status === 'tentative';
  const isCheckedin = b.status === 'checkedin';
  const isCheckedout = b.status === 'checkout';
  const isCancelled = b.status === 'cancelled';

  // Per-status visual recipe: a saturated tint (~18%) for the background so
  // it's instantly readable across the calendar, a bold matching border,
  // and a small filled badge on the right edge that flags the status with
  // white-on-colour for maximum contrast.
  const HOLD = 'oklch(60% 0.14 75)';
  let bg = T.card;
  let border = `1px solid ${T.border}`;
  let badge = null;
  if (isCancelled) {
    bg = T.bgSunk;
    border = `1px dashed ${T.border}`;
  } else if (isHold) {
    bg = `color-mix(in oklch, ${HOLD} 18%, white)`;
    border = `2px dashed ${HOLD}`;
    badge = { color: HOLD, icon: 'clock', label: b.releaseAt || '' };
  } else if (isCheckedin) {
    bg = `color-mix(in oklch, ${T.indigo} 18%, white)`;
    border = `2px solid ${T.indigo}`;
    badge = { color: T.indigo, icon: 'bed', label: 'IN' };
  } else if (isCheckedout) {
    bg = `color-mix(in oklch, ${T.ok} 18%, white)`;
    border = `2px solid ${T.ok}`;
    badge = { color: T.ok, icon: 'check', label: 'OUT' };
  }

  // Responsive name + badge rendering. A 1-night pill at default zoom is only
  // ~52px wide. With a status badge competing for space, the name can
  // disappear entirely. So we step both the name (full → first → initials)
  // and the badge (full label → icon-only → hidden) down based on actual
  // available width — the bg tint + matching border still convey the status
  // even when the badge is hidden on the very tightest pills. The full name
  // stays in the `title` attribute for desktop hover; mobile users tap to
  // open the booking detail where everything is shown in full.
  const totalW = b.nights * colW - 6;
  const fullBadgeW = isHold ? 56 : 36;
  const iconBadgeW = 22;
  const fixedChrome = 4 /*channel stripe*/ + 6 /*paddings + gaps*/;
  let usedBadgeW = 0;
  let badgeMode = 'hidden'; // 'full' | 'icon' | 'hidden'
  if (badge) {
    if (totalW - fixedChrome - fullBadgeW >= 42) {
      badgeMode = 'full';
      usedBadgeW = fullBadgeW;
    } else if (totalW - fixedChrome - iconBadgeW >= 28) {
      badgeMode = 'icon';
      usedBadgeW = iconBadgeW;
    } else {
      badgeMode = 'hidden';
    }
  }
  const innerW = totalW - fixedChrome - usedBadgeW;
  // Width thresholds tuned to fontSize 11: ~6px per char + ellipsis budget.
  // Fall back to initials before truncation eats the name into "Kart…".
  const firstName = (b.guest || '').split(/\s+/)[0] || '';
  const firstNameW = firstName.length * 6 + 4;
  const showInitials = innerW < Math.min(firstNameW + 4, 48);
  const showFirstNameOnly = !showInitials && innerW < 80;
  const showVipStar = innerW >= 50;
  const displayName = showInitials
    ? initialsOf(b.guest)
    : showFirstNameOnly
      ? firstName
      : b.guest;

  return (
    <div
      onPointerDown={onPointerDown}
      title={`${b.guest}${b.vip ? ' · VIP' : ''}`}
      style={{
        position: 'absolute',
        // viewDaysStart is the idx of viewDays[0] — usually negative now
        // because the Diary shows past days too. Subtract it so a booking
        // at startIdx 0 (today) lands in today's column rather than at the
        // far-left edge.
        left: labelW + (b.startIdx + dx - viewDaysStart) * colW + 3,
        width: totalW,
        top: 4, bottom: 4,
        background: bg,
        border,
        borderRadius: 8,
        boxShadow: isHold ? 'none' : '0 1px 2px rgba(20,15,10,.06)',
        padding: '0 4px 0 4px',
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
        <div
          className={showInitials ? 'tnum' : ''}
          style={{
            fontSize: showInitials ? 12 : 11,
            fontWeight: showInitials ? 800 : 600,
            color: T.ink,
            letterSpacing: showInitials ? 0.4 : 0,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.2,
          }}
        >
          {showVipStar && b.vip && '★ '}{displayName}
        </div>
        {/* Inner line stays only for confirmed bookings to show payment state,
            and only when there's enough room to read it. */}
        {!isHold && !isCheckedin && !isCheckedout && !isCancelled && !showInitials && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 1 }}>
            {b.paid < b.total
              ? <span className="tnum" style={{ fontSize: 9, fontWeight: 700, color: T.ink3 }}>₹{((b.total - b.paid)/1000).toFixed(1)}k due</span>
              : <span style={{ fontSize: 9, fontWeight: 700, color: T.ok, display: 'flex', alignItems: 'center', gap: 2 }}><Icon name="check" size={9} stroke={2.5} /> paid</span>}
          </div>
        )}
        {isCancelled && !showInitials && (
          <div style={{ fontSize: 9, fontWeight: 700, color: T.ink3, marginTop: 1 }}>cancelled</div>
        )}
      </div>
      {badge && badgeMode !== 'hidden' && (
        <span
          className={isHold && badgeMode === 'full' ? 'tnum' : ''}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: badgeMode === 'full' ? 3 : 0,
            background: badge.color, color: '#fff',
            padding: badgeMode === 'full' ? '2px 6px' : '2px 4px',
            borderRadius: 5,
            fontSize: 9, fontWeight: 800, letterSpacing: 0.3,
            flexShrink: 0,
            boxShadow: '0 1px 2px rgba(20,15,10,.12)',
          }}
        >
          <Icon name={badge.icon} size={9} stroke={2.5} />
          {badgeMode === 'full' && badge.label}
        </span>
      )}
    </div>
  );
}

function RoomTypeBlock({ rt, bookings, collapsed, onToggle, colW, rowH, labelW, drag, onPointerDown, go, days, todayIso, viewDaysStart }) {
  const tagColor = T[rt.tag];
  // Map of (unitIdx, dayIdx) -> whether that cell is already occupied by a
  // booking. Used to decide whether to make the cell clickable for quick-
  // create.
  const isOccupied = (ui, dayIdx) => bookings.some(b =>
    b.unitIdx === ui && b.status !== 'cancelled' &&
    b.startIdx <= dayIdx && dayIdx < (b.startIdx + (b.nights || 1))
  );
  const openQuickCreate = (date) => {
    if (go) go('new', { prefill: { date, roomTypeId: rt.id } });
  };
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
        {days.map(d => (
          <div key={d.iso} style={{ width: colW, flexShrink: 0, borderRight: `1px solid ${T.borderSoft}`, background: d.iso === todayIso ? T.primaryLt : d.isWknd ? 'oklch(98% 0.012 65)' : 'transparent' }} />
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
            {days.map(d => {
              const occupied = isOccupied(ui, d.idx);
              const isToday = d.iso === todayIso;
              return (
                <div
                  key={d.iso}
                  onClick={occupied ? undefined : () => openQuickCreate(d.iso)}
                  title={occupied ? undefined : `New booking · ${rt.name} #${ui + 1} · ${d.dow} ${d.dom} ${d.month}`}
                  style={{
                    width: colW, flexShrink: 0,
                    borderRight: `1px solid ${T.borderSoft}`,
                    background: isToday ? T.primaryLt : d.isWknd ? 'oklch(98% 0.012 65)' : 'transparent',
                    cursor: occupied ? 'default' : 'pointer',
                    transition: 'background .15s',
                  }}
                  onMouseEnter={occupied ? undefined : (e) => { e.currentTarget.style.background = `color-mix(in oklch, ${T.primary} 8%, white)`; }}
                  onMouseLeave={occupied ? undefined : (e) => { e.currentTarget.style.background = isToday ? T.primaryLt : d.isWknd ? 'oklch(98% 0.012 65)' : 'transparent'; }}
                />
              );
            })}
            {bookings.filter(b => b.unitIdx === ui).map(b => {
              const dx = drag && drag.id === b.id ? drag.dx : 0;
              return (
                <BookingPill
                  key={b.id} b={b} colW={colW} labelW={labelW} viewDaysStart={viewDaysStart} dx={dx}
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

const HORIZONS = [14, 30, 60, 90, 180];

// Generate a contiguous day-meta array running from `-pastN` to `futureN - 1`
// relative to ANCHOR (today). Negative idx values represent past dates,
// 0 is today, positive is the future. This lets the Diary show recent
// past bookings instead of jumping straight to today.
function generateDays(pastN, futureN) {
  const out = [];
  for (let i = -pastN; i < futureN; i++) {
    const d = new Date(ANCHOR);
    d.setDate(d.getDate() + i);
    out.push({
      iso: ymd(d),
      dow: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][(d.getDay() + 6) % 7],
      dom: d.getDate(),
      month: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()],
      isWknd: d.getDay() === 5 || d.getDay() === 6,
      idx: i,
    });
  }
  return out;
}

// Convert an ISO YYYY-MM-DD to a day index relative to today (ANCHOR).
// Returns null for empty/invalid input. Used by the jump-to-date picker.
function isoToDayIdx(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  return dateToIdx(iso);
}

export default function Diary({ go, bookings, setBookings, moveBooking, t, property }) {
  const [zoom, setZoom] = useState(58);
  // Default to a 30-day forward window. The 14-day default was too short
  // — hoteliers scrolled to the right edge of the grid and the calendar
  // appeared to "stop" because there were no more columns. 30 days gives
  // a month of forward visibility; the auto-extend below bumps higher
  // when the user keeps scrolling past the rightmost column.
  const [horizon, setHorizon] = useState(30);
  const [collapsed, setCollapsed] = useState({});
  const [drag, setDrag] = useState(null);
  const [confirmDrop, setConfirmDrop] = useState(null);
  const [filter, setFilter] = useState('all');
  // Jump-to-date: picking a date scrolls the diary to that column and
  // auto-extends the horizon (forward) or pastDays (backward) so the
  // picked date is in view.
  const [jumpDate, setJumpDate] = useState('');
  const jumpDateRef = useRef(null);
  // Show 7 days of recent history by default. Bumps automatically when
  // the hotelier jumps to an older date via the date picker.
  const [pastDays, setPastDays] = useState(7);
  const scrollRef = useRef(null);
  const colW = zoom;
  const rowH = 36;
  const labelW = 110;
  const ROOM_TYPES = effectiveRoomTypes(property);
  const viewDays = useMemo(() => generateDays(pastDays, horizon), [pastDays, horizon]);
  const viewDaysStart = viewDays.length > 0 ? viewDays[0].idx : 0;
  const todayIso = ymd(ANCHOR);

  // When the owner picks a date, auto-extend past/horizon if the date is
  // outside the current window, then scroll horizontally so the column is
  // visible. Runs after viewDays updates so the column exists by the time
  // we set scrollLeft.
  useEffect(() => {
    const idx = isoToDayIdx(jumpDate);
    if (idx == null) return;
    if (idx < 0 && Math.abs(idx) > pastDays) {
      // Picked a date further into the past than we currently show.
      setPastDays(Math.min(60, Math.abs(idx) + 3));
    } else if (idx >= horizon) {
      const next = HORIZONS.find(h => h > idx) || HORIZONS[HORIZONS.length - 1];
      if (next !== horizon) setHorizon(next);
    }
    // Scroll on the next frame so the grid has re-rendered.
    const tid = setTimeout(() => {
      if (scrollRef.current) {
        const colFromStart = idx - viewDaysStart;
        const target = labelW + colFromStart * colW - 40;
        scrollRef.current.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
      }
    }, 80);
    return () => clearTimeout(tid);
  }, [jumpDate, horizon, pastDays, colW, labelW, viewDaysStart]);

  // Auto-extend the horizon when the user scrolls within ~1 column of the
  // right edge. Previously the grid would just stop at the chosen horizon
  // and the owner would see a hard "wall" — feels like the calendar
  // disappears. Now we bump to the next horizon step transparently.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const distanceToEnd = el.scrollWidth - (el.scrollLeft + el.clientWidth);
      if (distanceToEnd <= colW * 1.5) {
        const next = HORIZONS.find(h => h > horizon);
        if (next) setHorizon(next);
      }
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [horizon, colW]);

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
    const move = (ev) => {
      const dx = Math.round((ev.clientX - startX) / colW);
      const target = slotFromPoint(ev.clientX, ev.clientY);
      setDrag({ id: b.id, dx, target });
    };
    const up = (ev) => {
      const dx = Math.round((ev.clientX - startX) / colW);
      const target = slotFromPoint(ev.clientX, ev.clientY);
      setDrag(null);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      // Tap vs drag: did the pointer cross a column boundary, or land on a
      // different slot? We check dx directly (the raw column delta from the
      // pointer move) rather than comparing a clamped `newStart` against
      // `origStart`. The previous version's clamp meant past bookings
      // (negative origStart that gets pinned to 0) were always flagged as
      // "date changed" even on a perfect stationary tap.
      const slotChanged = target && (target.roomTypeId !== b.roomTypeId || target.unitIdx !== b.unitIdx);
      const dateChanged = dx !== 0;
      if (!slotChanged && !dateChanged) {
        go('booking', b.id);
        return;
      }
      // Clamp newStart to within the visible window. viewDaysStart is
      // typically negative (we show past context), so the lower bound has
      // to be `viewDaysStart`, not 0.
      const minIdx = viewDaysStart;
      const maxIdx = viewDaysStart + viewDays.length - b.nights;
      const newStart = Math.max(minIdx, Math.min(maxIdx, origStart + dx));
      setConfirmDrop({ id: b.id, origStart, newStart, b, newSlot: slotChanged ? target : null });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  // Find a viewDays entry by its absolute idx (not array position). Falls
  // back to computing the date fresh when idx is outside the visible range.
  const fmtDate = (idx) => {
    const d = viewDays.find(x => x.idx === idx);
    if (d) return `${d.dow} ${d.dom} ${d.month}`;
    const dt = new Date(ANCHOR);
    dt.setDate(dt.getDate() + idx);
    return dt.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  };

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
      {/* Jump-to-date bar — full-width, prominent. The real <input type="date">
          takes the whole bar so tapping anywhere opens the native picker.
          Text + native icon are hidden via global CSS (see tokens.js);
          our custom icon + formatted label overlay on top. */}
      <div style={{ padding: '10px 16px', background: T.card, borderBottom: `1px solid ${T.borderSoft}` }}>
        <div style={{
          position: 'relative',
          background: jumpDate ? T.primaryLt : T.bgSoft,
          border: `1.5px solid ${jumpDate ? T.primary : T.borderSoft}`,
          borderRadius: 12,
          overflow: 'hidden',
        }}>
          <input
            ref={jumpDateRef}
            type="date"
            value={jumpDate}
            onChange={(e) => setJumpDate(e.target.value)}
            onClick={() => {
              const el = jumpDateRef.current;
              if (el && typeof el.showPicker === 'function') { try { el.showPicker(); } catch {} }
            }}
            aria-label="Jump to date"
            style={{
              width: '100%', height: '100%',
              padding: '11px 14px', minHeight: 46,
              border: 'none', outline: 'none', background: 'transparent',
              cursor: 'pointer', font: 'inherit',
            }}
          />
          <div style={{
            position: 'absolute', inset: 0, padding: '11px 14px',
            display: 'flex', alignItems: 'center', gap: 10,
            pointerEvents: 'none',
          }}>
            <Icon name="cal" size={16} color={jumpDate ? T.primaryDk : T.ink2} stroke={2} />
            <span style={{ fontSize: 13, fontWeight: 700, color: jumpDate ? T.primaryDk : T.ink2 }}>
              {jumpDate
                ? new Date(jumpDate + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
                : 'Jump to date — tap to pick a day'}
            </span>
            <div style={{ flex: 1 }} />
          </div>
          {jumpDate && (
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setJumpDate(''); }}
              style={{
                position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                zIndex: 2, background: 'rgba(255,255,255,0.85)', border: `1px solid ${T.primary}`,
                borderRadius: 6, cursor: 'pointer', padding: 4, color: T.primaryDk, display: 'flex',
              }}
              aria-label="Clear date"
            >
              <Icon name="x" size={14} stroke={2.2} />
            </button>
          )}
        </div>
      </div>

      <div style={{ padding: '10px 16px', display: 'flex', gap: 8, overflowX: 'auto', borderBottom: `1px solid ${T.borderSoft}`, background: T.card, alignItems: 'center' }}>
        {/* Horizon picker — how many days forward the Diary shows. The
            preceding date bar handles past dates via auto-extension. */}
        {HORIZONS.map(h => {
          const active = horizon === h;
          return (
            <button
              key={h}
              onClick={() => setHorizon(h)}
              className="atithi-tap"
              style={{
                padding: '5px 11px', borderRadius: 999,
                background: active ? T.indigoLt : T.bgSoft,
                color: active ? T.indigo : T.ink2,
                border: `1px solid ${active ? T.indigo : T.borderSoft}`,
                fontSize: 11, fontWeight: 700, letterSpacing: 0.1,
                whiteSpace: 'nowrap', cursor: 'pointer',
              }}
            >{h}d</button>
          );
        })}
        <span style={{ width: 1, alignSelf: 'stretch', background: T.borderSoft, margin: '2px 2px' }} />
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

      <div ref={scrollRef} style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
        <div style={{ minWidth: labelW + colW * viewDays.length + 16, position: 'relative' }}>
          <div style={{ position: 'sticky', top: 0, zIndex: 5, display: 'flex', background: T.card, borderBottom: `1px solid ${T.border}` }}>
            <div style={{ width: labelW, flexShrink: 0, borderRight: `1px solid ${T.borderSoft}`, padding: '8px 10px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: T.ink3, letterSpacing: 0.4 }}>{viewDays[0] ? `${viewDays[0].month.toUpperCase()} ${new Date(ANCHOR).getFullYear()}` : ''}</div>
              <div style={{ fontSize: 11, color: T.ink3 }}>{visibleBookings.length} stays</div>
            </div>
            {viewDays.map((d) => {
              const isToday = d.iso === todayIso;
              return (
                <div key={d.iso} style={{ width: colW, flexShrink: 0, padding: '8px 0', textAlign: 'center', background: isToday ? T.primaryLt : 'transparent', borderRight: `1px solid ${T.borderSoft}` }}>
                  {isToday ? (
                    <div style={{
                      display: 'inline-block',
                      background: T.primary, color: '#fff',
                      fontSize: 8, fontWeight: 700, letterSpacing: 0.6,
                      padding: '1px 6px', borderRadius: 999,
                      lineHeight: 1.3,
                    }}>{t('today').toUpperCase()}</div>
                  ) : (
                    <div style={{ fontSize: 9, fontWeight: 600, color: d.isWknd ? T.primary : T.ink3, letterSpacing: 0.4 }}>{d.dow.toUpperCase()}</div>
                  )}
                  <div className="tnum" style={{ fontSize: 16, fontWeight: 700, color: isToday ? T.primary : T.ink, letterSpacing: -0.3, marginTop: 1 }}>{d.dom}</div>
                </div>
              );
            })}
          </div>

          <div style={{ display: 'flex', borderBottom: `1px solid ${T.border}`, background: T.bgSoft }}>
            <div style={{ width: labelW, flexShrink: 0, padding: '6px 10px', borderRight: `1px solid ${T.borderSoft}` }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: T.ink3, letterSpacing: 0.4 }}>OCCUPANCY</div>
            </div>
            {viewDays.map((d) => {
              const activeBookings = bookings.filter(b => b.status !== 'cancelled');
              // Compare against this day's actual idx (which may be negative
              // for past-context columns), not its position in the array.
              const occRooms = activeBookings.filter(b => b.startIdx <= d.idx && b.startIdx + b.nights > d.idx).length;
              const totalRooms = ROOM_TYPES.reduce((a, r) => a + r.units, 0);
              const occ = totalRooms > 0 ? Math.round((occRooms / totalRooms) * 100) : 0;
              const isToday = d.iso === todayIso;
              return (
                <div key={d.iso} style={{ width: colW, flexShrink: 0, padding: '6px 4px', textAlign: 'center', borderRight: `1px solid ${T.borderSoft}`, background: isToday ? T.primaryLt : 'transparent' }}>
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
              days={viewDays}
              todayIso={todayIso}
              viewDaysStart={viewDaysStart}
            />
          ))}
        </div>

        {/* "Today" is now marked as a soft brand-coloured vertical band running
            through the day column, with a TODAY pill sitting inside the header
            cell. No floating overlay — scrolls naturally with the grid. */}
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

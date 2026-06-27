import { useState, useMemo, useRef, useEffect } from 'react';
import { T } from '../tokens.js';
import { DAYS, CHANNELS, effectiveRoomTypes, ANCHOR, ymd, idxToDate, dateToIdx, ratePerNight, computeUnitUsage } from '../data.js';
import Icon from '../components/Icon.jsx';
import Chip from '../components/Chip.jsx';
import Btn from '../components/Btn.jsx';
import ScreenHeader from '../components/ScreenHeader.jsx';

const iconBtn = {
  width: 36, height: 36, borderRadius: 10, border: 'none', background: T.bgSoft,
  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: T.ink2,
};
const dayEdInput = {
  width: '100%', boxSizing: 'border-box', border: `1px solid ${T.border}`,
  borderRadius: 8, padding: '8px 10px', height: 36, fontSize: 14, fontWeight: 700,
  color: T.ink, background: T.card, outline: 'none',
};

// Compact initials from a name. "Aanya Sharma" → "AS"; "Rohan" → "R".
function initialsOf(name) {
  return (name || '').trim().split(/\s+/).map(s => s[0] || '').join('').slice(0, 2).toUpperCase();
}

// Expand each booking into one "pill instance" per roomItem. A multi-room
// booking returns N instances, each with its own roomTypeId + unitIdx so the
// Diary can render one pill per room (rather than just the primary one).
//
// roomItems that don't carry an explicit unitIdx get auto-assigned to the
// first free unit in their roomTypeId during the booking's date range.
// Cancelled bookings still produce instances (so the strike-through pill
// renders) but don't reserve units against other bookings.
// Stable empty array so RoomTypeBlocks for an empty room type get a constant
// reference across renders (lets their useMemos cache).
const EMPTY_INSTANCES = [];

function expandToPillInstances(bookings, ROOM_TYPES) {
  // used[roomTypeId][unitIdx] = [{startIdx, endIdx}, ...]
  const used = {};
  for (const rt of ROOM_TYPES) {
    used[rt.id] = {};
    for (let u = 0; u < rt.units; u++) used[rt.id][u] = [];
  }
  // Stable processing order so auto-assignment doesn't shuffle on re-render.
  const sorted = [...bookings].sort((a, b) => {
    const da = a.startIdx ?? 0, db = b.startIdx ?? 0;
    if (da !== db) return da - db;
    return (a.id || '').localeCompare(b.id || '');
  });
  const instances = [];
  for (const b of sorted) {
    const items = Array.isArray(b.roomItems) && b.roomItems.length
      ? b.roomItems
      : [{ roomTypeId: b.roomTypeId, unitIdx: b.unitIdx }];
    const startIdx = b.startIdx ?? 0;
    const endIdx = startIdx + (b.nights || 1);
    items.forEach((item, itemIndex) => {
      const rtId = item.roomTypeId || b.roomTypeId;
      if (!used[rtId]) return; // unknown room type — skip
      let unitIdx = item.unitIdx;
      // Legacy: the primary item (whose roomTypeId matches the booking-level
      // one) inherits the booking-level unitIdx if its own is missing.
      if (unitIdx == null && itemIndex === 0 && b.unitIdx != null && rtId === b.roomTypeId) {
        unitIdx = b.unitIdx;
      }
      if (unitIdx == null) {
        const rt = ROOM_TYPES.find(r => r.id === rtId);
        const unitCount = rt ? rt.units : 0;
        for (let u = 0; u < unitCount; u++) {
          const conflict = used[rtId][u].some(r => !(endIdx <= r.startIdx || startIdx >= r.endIdx));
          if (!conflict) { unitIdx = u; break; }
        }
        if (unitIdx == null) unitIdx = 0; // overflow fallback
      }
      if (b.status !== 'cancelled') {
        used[rtId][unitIdx] = used[rtId][unitIdx] || [];
        used[rtId][unitIdx].push({ startIdx, endIdx });
      }
      instances.push({
        b,
        roomTypeId: rtId,
        unitIdx,
        itemIndex,
        roomCount: items.length,
        isPrimary: itemIndex === 0,
      });
    });
  }
  return instances;
}

function BookingPill({ b, colW, labelW, viewDaysStart, dx, onPointerDown, multi }) {
  // Defensive default (R9-3): an unexpected channel value must not crash
  // the pill (and with it the whole Diary) on ch.color below.
  const ch = CHANNELS[b.channel] || { label: b.channel || 'Direct', color: T.ink3, short: '?' };
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
    // Stronger fill (was 18%) so checked-in reads as clearly indigo at a
    // glance — the faint tint looked almost identical to a plain confirmed
    // pill on the calendar.
    bg = `color-mix(in oklch, ${T.indigo} 34%, white)`;
    border = `2px solid ${T.indigo}`;
    badge = { color: T.indigo, icon: 'bed', label: 'IN' };
  } else if (isCheckedout) {
    bg = `color-mix(in oklch, ${T.ok} 34%, white)`;
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
  // Clip the leading edge when the stay started before viewDaysStart:
  // pill anchors at column 0 and shrinks so it doesn't render at a
  // negative `left` (which would visually bleed past the room-label).
  const startCol = (b.startIdx || 0) + dx - viewDaysStart;
  const isPastStart = startCol < 0;
  const visibleNights = isPastStart ? Math.max(0, (b.nights || 1) + startCol) : (b.nights || 1);
  const totalW = Math.max(0, visibleNights * colW - 6);
  const pillLeft = isPastStart ? (labelW + 3) : (labelW + startCol * colW + 3);
  // Compact mode for short pills (1-night at default zoom is ~54px).
  // We tighten padding + drop the gap so the name has real room to render,
  // and trim the channel-stripe width too. The status info is still
  // conveyed by the pill border/bg tint when the badge is hidden.
  const isCompact = totalW < 78;
  const stripeW = isCompact ? 3 : 4;
  const padX = isCompact ? 3 : 4;
  const gap = isCompact ? 3 : 6;
  const fixedChrome = stripeW + padX * 2 + gap; // stripe + padding + one inter-flex gap
  const fullBadgeW = isHold ? 56 : 36;
  const iconBadgeW = 22;
  let usedBadgeW = 0;
  let badgeMode = 'hidden'; // 'full' | 'icon' | 'hidden'
  if (badge) {
    // Very narrow pills (1-night at default zoom is ~52px): hide the
    // badge entirely so the guest's initials get the full pill width.
    // The pill's bg tint + matching border still convey status (green
    // = confirmed, indigo = checked-in, etc) without the explicit
    // badge competing for space.
    if (totalW < 62) {
      badgeMode = 'hidden';
    } else if (totalW - fixedChrome - fullBadgeW >= 42) {
      badgeMode = 'full';
      usedBadgeW = fullBadgeW;
    } else if (totalW - fixedChrome - iconBadgeW >= 36) {
      badgeMode = 'icon';
      usedBadgeW = iconBadgeW;
    } else {
      badgeMode = 'hidden';
    }
  }
  const innerW = totalW - fixedChrome - usedBadgeW - (usedBadgeW > 0 ? gap : 0);
  // Width thresholds tuned for fontSize 11 at ~6px per char + a little
  // ellipsis budget. Fall back to initials before truncation eats the
  // name into "Kart…" — initials always render whole even at 22px innerW.
  const firstName = (b.guest || '').split(/\s+/)[0] || '';
  const firstNameW = firstName.length * 6 + 4;
  // 1-night pills are ~52px wide at default zoom. Even "Aanya"
  // (5×6=30px) technically fits but the actual font glyph widths vary
  // and the result looks cramped + uneven across pills. Force initials
  // mode for single-night stays — "AS" in bold 12px is always
  // legible, the full name still lives in the title= tooltip and on
  // the booking detail.
  const isSingleNight = (b.nights || 1) === 1;
  const showInitials = isSingleNight || innerW < Math.min(firstNameW + 4, 44);
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
        // Pill horizontal position is computed above with past-start
        // clipping so it never bleeds into the room-label column.
        left: pillLeft,
        width: totalW,
        top: 4, bottom: 4,
        background: bg,
        border,
        borderRadius: 8,
        // Stronger default shadow + a hover lift so the pill clearly
        // reads as a draggable object, not a static block. While
        // dragging, scale up + lift further so the cursor target
        // stays clear over the destination slot.
        boxShadow: isHold ? 'none' : '0 1px 2px rgba(20,15,10,.06)',
        padding: `0 ${padX}px 0 ${padX}px`,
        display: 'flex', alignItems: 'center', gap,
        cursor: 'grab', userSelect: 'none', overflow: 'hidden',
        touchAction: 'none',
        zIndex: dx !== 0 ? 5 : 2,
        transform: dx !== 0 ? 'scale(1.04) translateY(-2px)' : 'none',
        transition: dx === 0 ? 'transform .12s, box-shadow .12s' : 'none',
        opacity: isCancelled ? 0.55 : 1,
        textDecoration: isCancelled ? 'line-through' : 'none',
      }}
      onMouseEnter={(e) => {
        // Subtle lift on hover so the hotelier sees the pill is
        // interactive — desktop users especially can otherwise miss
        // that it's draggable.
        if (dx === 0) {
          e.currentTarget.style.transform = 'translateY(-1px)';
          e.currentTarget.style.boxShadow = '0 3px 8px rgba(20,15,10,.14)';
        }
      }}
      onMouseLeave={(e) => {
        if (dx === 0) {
          e.currentTarget.style.transform = 'none';
          e.currentTarget.style.boxShadow = isHold ? 'none' : '0 1px 2px rgba(20,15,10,.06)';
        }
      }}
    >
      <span style={{ width: stripeW, alignSelf: 'stretch', borderRadius: 2, flexShrink: 0, background: ch.color, marginTop: 4, marginBottom: 4 }} />
      <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div
          className={showInitials ? 'tnum' : ''}
          style={{
            fontSize: showInitials ? 12 : 11,
            fontWeight: showInitials ? 800 : 600,
            color: T.ink,
            letterSpacing: showInitials ? 0.4 : 0,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.2,
            display: 'flex', alignItems: 'center', gap: 4,
          }}
        >
          {showVipStar && b.vip && <span>★</span>}
          {multi && !showInitials && (
            <span
              className="tnum"
              title={`Room ${multi.current} of ${multi.total}`}
              style={{
                fontSize: 9, fontWeight: 800, padding: '1px 4px', borderRadius: 4,
                background: T.bgSunk, color: T.ink3, flexShrink: 0,
              }}
            >{multi.current}/{multi.total}</span>
          )}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName}</span>
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

function RoomTypeBlock({ rt, instances, collapsed, onToggle, colW, rowH, labelW, drag, onPointerDown, go, days, todayIso, viewDaysStart, canCreate = true, canEdit = true, t = (k) => k }) {
  const tagColor = T[rt.tag];
  // Map of (unitIdx, dayIdx) -> whether that cell is already occupied by a
  // pill instance. Used to decide whether to make the cell clickable for
  // quick-create.
  // P2 (perf): precompute occupied (unit:day) keys + per-unit pill lists ONCE
  // per render instead of scanning all instances per (unit × day) cell and per
  // unit row. Was O(units × days × instances) on every render incl. each drag move.
  const occupiedSet = useMemo(() => {
    const s = new Set();
    for (const inst of instances) {
      if (inst.b.status === 'cancelled') continue;
      const start = inst.b.startIdx, end = inst.b.startIdx + (inst.b.nights || 1);
      for (let d = start; d < end; d++) s.add(inst.unitIdx + ':' + d);
    }
    return s;
  }, [instances]);
  const instancesByUnit = useMemo(() => {
    const m = new Map();
    for (const inst of instances) {
      const a = m.get(inst.unitIdx);
      if (a) a.push(inst); else m.set(inst.unitIdx, [inst]);
    }
    return m;
  }, [instances]);
  const isOccupied = (ui, dayIdx) => occupiedSet.has(ui + ':' + dayIdx);
  const openQuickCreate = (date) => {
    // Gate on create_bookings so a Reception-only staffer (without
    // the perm) doesn't tap an empty cell, bounce to PermissionDenied,
    // and have to back out. Silent no-op is the right behaviour —
    // the cell is rendered without a hover affordance for the same
    // reason (see cellOnClick below).
    if (!canCreate) return;
    // Past dates ARE allowed for back-dated bookings — reception sometimes
    // records a stay that already happened. Confirm first so a mis-tap on an old
    // column doesn't silently start a gone-by booking. (Rates / inventory for a
    // past day stay locked — there's no reason to re-price a day that's gone.)
    if (dateToIdx(date) < 0 && typeof window !== 'undefined' && !window.confirm(t('pastDateBookingConfirm'))) return;
    if (go) go('new', { prefill: { date, roomTypeId: rt.id } });
  };
  // Gate drag-move on edit_bookings — same reason. A reception
  // staffer can still TAP a pill to view it (handled in
  // onPointerDown's tap-vs-drag detection, which routes a stationary
  // tap to go('booking', id) — that's just navigation, no edit). But
  // any actual drag-to-move must require the perm.
  const gatedOnPointerDown = canEdit ? onPointerDown : (e, b) => {
    // Treat as tap-only — open the booking detail, never drag.
    // Suppress the underlying onPointerDown's drag listener entirely
    // by intercepting before it fires.
    e.preventDefault();
    if (go) go('booking', b.id);
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
          <div key={d.iso} style={{ width: colW, flexShrink: 0, borderRight: `1px solid ${T.borderSoft}`, background: d.iso === todayIso ? T.primaryLt : d.isWknd ? 'oklch(95% 0.030 65)' : 'transparent' }} />
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
              // Past empty cells stay tappable (faded as a cue) so reception can
              // make a back-dated booking; openQuickCreate confirms first. Only
              // occupied cells are inactive.
              const inactive = occupied;
              return (
                <div
                  key={d.iso}
                  onClick={inactive ? undefined : () => openQuickCreate(d.iso)}
                  title={inactive ? undefined : `New booking · ${rt.name} #${ui + 1} · ${d.dow} ${d.dom} ${d.month}`}
                  style={{
                    width: colW, flexShrink: 0,
                    borderRight: `1px solid ${T.borderSoft}`,
                    background: isToday ? T.primaryLt : d.isWknd ? 'oklch(95% 0.030 65)' : 'transparent',
                    cursor: inactive ? 'default' : 'pointer',
                    opacity: d.idx < 0 ? 0.5 : 1,
                    transition: 'background .15s',
                  }}
                  onMouseEnter={inactive ? undefined : (e) => { e.currentTarget.style.background = `color-mix(in oklch, ${T.primary} 8%, white)`; }}
                  onMouseLeave={inactive ? undefined : (e) => { e.currentTarget.style.background = isToday ? T.primaryLt : d.isWknd ? 'oklch(95% 0.030 65)' : 'transparent'; }}
                />
              );
            })}
            {(instancesByUnit.get(ui) || EMPTY_INSTANCES)
              // Hide pills whose stay ends before the first visible column
              // (their last night is before viewDaysStart). A past booking
              // that ended yesterday would otherwise render at a negative
              // `left` and bleed into the room-label area on the left edge.
              .filter(inst => {
                const stayEnd = (inst.b.startIdx || 0) + (inst.b.nights || 1);
                return stayEnd > viewDaysStart;
              })
              .map(inst => {
                const dx = drag && drag.id === inst.b.id ? drag.dx : 0;
                return (
                  <BookingPill
                    key={inst.b.id + ':' + inst.itemIndex}
                    b={inst.b}
                    colW={colW} labelW={labelW} viewDaysStart={viewDaysStart} dx={dx}
                    onPointerDown={(e) => gatedOnPointerDown(e, inst.b, { isPrimary: inst.isPrimary })}
                    multi={inst.roomCount > 1 ? { current: inst.itemIndex + 1, total: inst.roomCount } : null}
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
  { id: 'all',       en: 'All bookings', hi: 'सभी बुकिंग', icon: 'filter' },
  { id: 'confirmed', en: 'Confirmed',    hi: 'पुष्टि' },
  { id: 'hold',      en: 'On-hold',      hi: 'होल्ड पर' },
  { id: 'formC',     en: 'Form C',       hi: 'फ़ॉर्म C' },
  { id: 'ota',       en: 'OTA',          hi: 'OTA' },
];

const matchesFilter = (b, filter) => {
  if (filter === 'all') return true;
  if (filter === 'confirmed') return b.status === 'confirmed';
  if (filter === 'hold') return b.status === 'tentative';
  if (filter === 'formC') return !!b.formC;
  if (filter === 'ota') return b.channel && b.channel !== 'direct';
  return true;
};

// Fixed 180-day forward window. The earlier 14/30/60/90/180 picker was
// retired — too many options + most hoteliers never touched it. To see
// further out, the hotelier uses the date picker at the top which jumps
// the view (and extends the horizon further if needed).
const DEFAULT_HORIZON = 180;

// Generate a contiguous day-meta array running from `-pastN` to `futureN - 1`
// relative to ANCHOR (today). Negative idx values represent past dates,
// 0 is today, positive is the future. This lets the Diary show recent
// past bookings instead of jumping straight to today.
function generateDays(pastN, futureN, weekendDays) {
  // Weekend tint must follow the property's configured weekend days (same source
  // ratePerNight uses — default Sun+Sat [0,6]); hardcoding Fri/Sat tinted the
  // wrong columns vs where the uplift actually applied (audit R3).
  const wknd = (Array.isArray(weekendDays) && weekendDays.length) ? weekendDays : [0, 6];
  const out = [];
  for (let i = -pastN; i < futureN; i++) {
    const d = new Date(ANCHOR);
    d.setDate(d.getDate() + i);
    out.push({
      iso: ymd(d),
      dow: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][(d.getDay() + 6) % 7],
      dom: d.getDate(),
      month: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()],
      isWknd: wknd.includes(d.getDay()),
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

export default function Diary({ go, bookings, setBookings, moveBooking, t, lang = 'en', property, rateOverrides = {}, setRateOverrides, can = () => true }) {
  // RBAC. Empty-cell tap → New Booking screen needs create_bookings.
  // Drag-and-drop a pill to another date / room needs edit_bookings.
  // We gate the *initiation* of the action here so the user gets quick
  // feedback; App.jsx also gates the new-booking route as a backstop.
  const canCreate = can('create_bookings');
  const canEdit   = can('edit_bookings');
  const [zoom, setZoom] = useState(58);
  // Default to a 30-day forward window. The 14-day default was too short
  // Fixed 180-day forward window — see DEFAULT_HORIZON. Jumping to a date
  // beyond 180 days extends horizon to fit (handled in the jump effect
  // below); otherwise the hotelier scrolls within the six-month grid.
  const [horizon, setHorizon] = useState(DEFAULT_HORIZON);
  const [collapsed, setCollapsed] = useState({});
  const [drag, setDrag] = useState(null);
  const [confirmDrop, setConfirmDrop] = useState(null);
  const [filter, setFilter] = useState('all');
  // Per-date inventory + rate editor, opened by tapping a date in the header.
  // Holds the day idx + a per-category draft. Gated by manage_rates.
  const canManageRates = can('manage_rates');
  const [dateEditor, setDateEditor] = useState(null);
  const fmtDayLabel = (idx) => {
    const d = new Date(idxToDate(idx) + 'T00:00:00');
    return isNaN(d.getTime()) ? '' : d.toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', { weekday: 'short', day: '2-digit', month: 'short' });
  };
  // Rooms of a category occupied on a given day idx (non-cancelled bookings).
  const bookedForDate = (catId, idx) => (bookings || []).reduce((n, b) => {
    if (b.status === 'cancelled') return n;
    const s = b.startIdx || 0, e = s + (b.nights || 1);
    if (idx < s || idx >= e) return n;
    const items = (b.roomItems && b.roomItems.length) ? b.roomItems : [{ roomTypeId: b.roomTypeId }];
    return n + items.filter(it => (it.roomTypeId || b.roomTypeId) === catId).length;
  }, 0);
  const openDateEditor = (idx) => {
    if (!canManageRates) return;
    if (idx < 0) return;  // past dates are read-only (audit #4)
    const rows = effectiveRoomTypes(property).map(rt => {
      const ov = rateOverrides[`${rt.id}:${idx}`] || {};
      const units = rt.units || 0;
      const closed = ov.closed ? units : (Array.isArray(ov.closedUnits) ? ov.closedUnits.length : 0);
      return {
        catId: rt.id, name: rt.name, units,
        booked: bookedForDate(rt.id, idx),
        open: Math.max(0, units - closed),
        rate: Math.round(ratePerNight(property, rateOverrides, rt.id, idx)),
      };
    });
    setDateEditor({ idx, rows });
  };
  const setEditorRow = (catId, patch) => setDateEditor(de => de && ({ ...de, rows: de.rows.map(r => r.catId === catId ? { ...r, ...patch } : r) }));
  const saveDateEditor = () => {
    if (!dateEditor || !setRateOverrides) { setDateEditor(null); return; }
    const idx = dateEditor.idx;
    // Close-out override confirm (audit #8): if the hotelier changed how many
    // rooms are AVAILABLE for this date (closing units for maintenance, or
    // re-opening a previous close-out), confirm once before overwriting the set
    // inventory — instead of silently flooring/changing it. Rate-only edits and
    // untouched rows don't prompt.
    const invChanged = dateEditor.rows.some(r => {
      const ov = rateOverrides[`${r.catId}:${idx}`] || {};
      const curClosed = ov.closed ? r.units : (Array.isArray(ov.closedUnits) ? ov.closedUnits.length : 0);
      const curOpen = Math.max(0, r.units - curClosed);
      const newOpen = Math.min(r.units, Math.max(r.booked || 0, Math.round(+r.open || 0)));
      return newOpen !== curOpen;
    });
    if (invChanged && typeof window !== 'undefined' && !window.confirm(t('overrideInventoryConfirm'))) return;
    setRateOverrides(o => {
      const next = { ...o };
      dateEditor.rows.forEach(r => {
        const key = `${r.catId}:${idx}`;
        const prev = next[key] || {};
        // Floor at the already-booked count so the hotelier can never close a
        // unit out from under an existing guest (which would make the date claim
        // fewer sellable rooms than are physically occupied + double-count in
        // the widget's availability math). Cap at the category's unit count.
        const open = Math.min(r.units, Math.max(r.booked || 0, Math.round(+r.open || 0)));
        // Close the highest-indexed units (same convention as the Rates screen).
        const closedUnits = Array.from({ length: r.units - open }, (_, k) => open + k);
        const rateNum = Math.max(0, Math.round(+r.rate || 0));
        const baseRate = Math.round(ratePerNight(property, {}, r.catId, idx)); // rate with NO override
        const upd = { ...prev, closed: false };
        // Only store a rate override when it differs from the computed base —
        // avoids littering no-op overrides when the hotelier leaves it as-is.
        if (rateNum > 0 && rateNum !== baseRate) upd.rate = rateNum; else delete upd.rate;
        if (closedUnits.length) upd.closedUnits = closedUnits; else delete upd.closedUnits;
        // Nothing custom left (no rate, no close-out, no note) → drop the key.
        if (upd.rate == null && !(upd.closedUnits && upd.closedUnits.length) && !upd.note) delete next[key];
        else next[key] = upd;
      });
      return next;
    });
    setDateEditor(null);
  };
  // Jump-to-date: picking a date scrolls the diary to that column and
  // auto-extends the horizon (forward) or pastDays (backward) so the
  // picked date is in view.
  const [jumpDate, setJumpDate] = useState('');
  const jumpDateRef = useRef(null);
  // Show 7 days of recent history by default. Bumps automatically when
  // the hotelier jumps to an older date via the date picker.
  // Default to no past-context columns — TODAY is the first column. The
  // jump-to-date picker still auto-extends pastDays backwards when the
  // hotelier picks an older date, so past bookings remain reachable.
  const [pastDays, setPastDays] = useState(0);
  const scrollRef = useRef(null);
  const colW = zoom;
  const rowH = 36;
  const labelW = 110;
  // R9-10: memoize so the pillInstances useMemo below actually caches (its
  // deps are ROOM_TYPES + visibleBookings). effectiveRoomTypes() and
  // bookings.filter() each return a fresh array every render, so without this
  // the (expensive) expandToPillInstances ran on every render — including every
  // drag pointermove.
  const ROOM_TYPES = useMemo(() => effectiveRoomTypes(property), [property]);
  const weekendDays = (property && property.weekendRules && Array.isArray(property.weekendRules.weekendDays)) ? property.weekendRules.weekendDays : [0, 6];
  const weekendKey = weekendDays.join(',');
  const viewDays = useMemo(() => generateDays(pastDays, horizon, weekendDays), [pastDays, horizon, weekendKey]);
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
      // Jumping past the visible 180-day window — extend horizon to a
      // round month past the picked date so it lands with breathing room.
      setHorizon(idx + 30);
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
  // right edge so the grid never feels like it ends abruptly. Adds an
  // extra month each time the scroll edge gets close.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const distanceToEnd = el.scrollWidth - (el.scrollLeft + el.clientWidth);
      if (distanceToEnd <= colW * 1.5) {
        setHorizon(h => h + 30);
      }
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [colW]);

  const visibleBookings = useMemo(() => bookings.filter(b => matchesFilter(b, filter)), [bookings, filter]);
  // Expand once per render; downstream RoomTypeBlocks just slice this list.
  const pillInstances = useMemo(
    () => expandToPillInstances(visibleBookings, ROOM_TYPES),
    [visibleBookings, ROOM_TYPES]
  );
  // Occupancy is a property-wide metric and must NOT change with the pill
  // filter, so it's computed from the UNFILTERED bookings (pillInstances above
  // stays filter-driven, for pill rendering only).
  const allPillInstances = useMemo(
    () => expandToPillInstances(bookings, ROOM_TYPES),
    [bookings, ROOM_TYPES]
  );
  // P1/P2 (perf): precompute occupancy + per-type grouping ONCE per render. The
  // old code re-scanned pillInstances per day-column (occupancy header) and per
  // (unit × day) cell (RoomTypeBlock.isOccupied) — O(days × units × instances),
  // and it ran on every drag pointermove. These are single O(instances) passes
  // the header + blocks then index into in O(1).
  const occByDay = useMemo(() => {
    const m = new Map();
    for (const inst of allPillInstances) {
      if (inst.b.status === 'cancelled') continue;
      const s = inst.b.startIdx, e = inst.b.startIdx + (inst.b.nights || 1);
      for (let d = s; d < e; d++) m.set(d, (m.get(d) || 0) + 1);
    }
    return m;
  }, [allPillInstances]);
  const totalRooms = useMemo(() => ROOM_TYPES.reduce((a, r) => a + r.units, 0), [ROOM_TYPES]);
  const instancesByType = useMemo(() => {
    const m = new Map();
    for (const inst of pillInstances) {
      const a = m.get(inst.roomTypeId);
      if (a) a.push(inst); else m.set(inst.roomTypeId, [inst]);
    }
    return m;
  }, [pillInstances]);
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

  const onPointerDown = (e, b, opts = {}) => {
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const origStart = b.startIdx;
    // Multi-room bookings can't be drag-moved yet — we'd need to slot every
    // roomItem simultaneously. Still allow the tap-to-open behaviour, but
    // route any attempted drag through to a navigation instead.
    const isMulti = Array.isArray(b.roomItems) && b.roomItems.length > 1;

    // Auto-scroll: when the pointer hovers near an edge of the diary's
    // scrollable container, scroll the container so the user can drop
    // on a room category / date that was off-screen at drag start.
    // Held-still-near-edge scrolling needs a periodic tick (pointermove
    // alone only fires when the pointer actually moves), so we run a
    // small interval that reads the latest position from a ref.
    let lastPos = { x: startX, y: startY };
    const EDGE = 70;     // px from the edge that triggers auto-scroll
    const SPEED = 14;    // px per tick
    const autoScrollId = setInterval(() => {
      const el = scrollRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (lastPos.y < rect.top + EDGE)         el.scrollBy({ top: -SPEED });
      else if (lastPos.y > rect.bottom - EDGE) el.scrollBy({ top: SPEED });
      if (lastPos.x < rect.left + EDGE)        el.scrollBy({ left: -SPEED });
      else if (lastPos.x > rect.right - EDGE)  el.scrollBy({ left: SPEED });
    }, 40);

    const move = (ev) => {
      lastPos = { x: ev.clientX, y: ev.clientY };
      const dx = Math.round((ev.clientX - startX) / colW);
      const target = slotFromPoint(ev.clientX, ev.clientY);
      setDrag({ id: b.id, dx, target });
    };
    const up = (ev) => {
      const dx = Math.round((ev.clientX - startX) / colW);
      const target = slotFromPoint(ev.clientX, ev.clientY);
      setDrag(null);
      clearInterval(autoScrollId);
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
      // Multi-room bookings: ignore the drop entirely and treat as a tap.
      // Moving them needs us to re-slot every roomItem — TBD chunk.
      if (isMulti) {
        go('booking', b.id);
        return;
      }
      // Clamp newStart to within the visible window, but never earlier than
      // today (idx 0): a booking's check-in can't be dragged into the past
      // (audit #4). viewDaysStart can be negative when past context is shown,
      // so floor the lower bound at 0.
      const minIdx = Math.max(0, viewDaysStart);
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

  // Detect conflict: another booking already occupies the target slot/dates.
  // Occupancy-aware (R8-1): the old check only matched a booking's top-level
  // unitIdx, so dropping onto a unit held by a multi-room booking's EXTRA room
  // (stored in roomItems[] with no unitIdx) wasn't flagged. We build the shared
  // per-unit usage map (excluding the dragged booking) and find who's there.
  const targetConflict = (() => {
    if (!confirmDrop) return null;
    const newRoomType = confirmDrop.newSlot ? confirmDrop.newSlot.roomTypeId : confirmDrop.b.roomTypeId;
    const newUnit = confirmDrop.newSlot ? confirmDrop.newSlot.unitIdx : confirmDrop.b.unitIdx;
    const start = confirmDrop.newStart;
    const end = start + confirmDrop.b.nights;
    const used = computeUnitUsage(bookings.filter(x => x.id !== confirmDrop.id), ROOM_TYPES);
    const ranges = (used[newRoomType] && used[newRoomType][newUnit]) || [];
    const hit = ranges.find(r => r.startIdx < end && r.endIdx > start);
    return hit ? bookings.find(x => x.id === hit.id) : null;
  })();

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: T.bg, position: 'relative' }}>
      <ScreenHeader title={t('diaryTitle')} subtitle={t('diarySub')}
        onBack={() => go('__back')}
        right={<div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => setZoom(z => Math.max(40, z - 10))} aria-label="Zoom out" style={iconBtn}><span style={{ fontSize: 18, lineHeight: 1, color: T.ink2 }}>−</span></button>
          <button onClick={() => setZoom(z => Math.min(90, z + 10))} aria-label="Zoom in" style={iconBtn}><span style={{ fontSize: 16, lineHeight: 1, color: T.ink2 }}>+</span></button>
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
            className="atithi-date-overlay"
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
                ? new Date(jumpDate + 'T00:00:00').toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
                : (lang === 'hi' ? 'तारीख़ पर जाएँ — टैप करके चुनें' : 'Jump to date — tap to pick a day')}
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

      {/* Filter chips on their own row so they're discoverable without
          horizontal scroll. Counts surface how many bookings match. */}
      <div style={{ padding: '6px 16px 10px', display: 'flex', gap: 6, borderBottom: `1px solid ${T.borderSoft}`, background: T.card, alignItems: 'center', overflowX: 'auto' }}>
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
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '5px 10px', borderRadius: 999,
                background: tone.bg, color: tone.fg,
                border: `1px solid ${tone.br}`,
                fontSize: 11, fontWeight: 600, letterSpacing: 0.1, lineHeight: 1.4,
                whiteSpace: 'nowrap', cursor: 'pointer',
              }}
            >
              {f.icon && <Icon name={f.icon} size={11} stroke={2} />}
              <span>{lang === 'hi' ? f.hi : f.en}</span>
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
              <div style={{ fontSize: 10, fontWeight: 700, color: T.ink3, letterSpacing: 0.4 }}>{viewDays[0] ? `${viewDays[0].month.toUpperCase()} ${viewDays[0].iso.slice(0, 4)}` : ''}</div>
              <div style={{ fontSize: 11, color: T.ink3 }}>{visibleBookings.length} {lang === 'hi' ? (visibleBookings.length === 1 ? 'ठहराव' : 'ठहराव') : (visibleBookings.length === 1 ? 'stay' : 'stays')}</div>
            </div>
            {viewDays.map((d) => {
              const isToday = d.iso === todayIso;
              const past = d.idx < 0;  // past day headers are read-only (audit #4)
              const headerTappable = canManageRates && !past;
              return (
                <div key={d.iso}
                  onClick={headerTappable ? () => openDateEditor(d.idx) : undefined}
                  title={headerTappable ? t('editDayRates') : undefined}
                  style={{ width: colW, flexShrink: 0, padding: '8px 0', textAlign: 'center', background: isToday ? T.primaryLt : 'transparent', borderRight: `1px solid ${T.borderSoft}`, cursor: headerTappable ? 'pointer' : 'default', opacity: past ? 0.5 : 1 }}>
                  {isToday ? (
                    <div style={{
                      display: 'inline-block',
                      background: T.primary, color: '#fff',
                      fontSize: 8, fontWeight: 700, letterSpacing: 0.6,
                      padding: '1px 6px', borderRadius: 999,
                      lineHeight: 1.3,
                    }}>{t('today').toUpperCase()}</div>
                  ) : (
                    <div style={{ fontSize: 9, fontWeight: 600, color: d.isWknd ? T.primary : T.ink3, letterSpacing: 0.4 }}>{lang === 'hi' ? ({'Sun':'रवि','Mon':'सोम','Tue':'मंगल','Wed':'बुध','Thu':'गुरु','Fri':'शुक्र','Sat':'शनि'}[d.dow] || d.dow.toUpperCase()) : d.dow.toUpperCase()}</div>
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
              // P1: O(1) lookup from the precomputed per-day occupancy map
              // (was an O(instances) filter per column).
              const occRooms = occByDay.get(d.idx) || 0;
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
              instances={instancesByType.get(rt.id) || EMPTY_INSTANCES}
              colW={colW} rowH={rowH} labelW={labelW}
              drag={drag}
              onPointerDown={onPointerDown}
              go={go}
              days={viewDays}
              todayIso={todayIso}
              viewDaysStart={viewDaysStart}
              canCreate={canCreate}
              canEdit={canEdit}
              t={t}
            />
          ))}
        </div>

        {/* "Today" is now marked as a soft brand-coloured vertical band running
            through the day column, with a TODAY pill sitting inside the header
            cell. No floating overlay — scrolls naturally with the grid. */}
      </div>

      {dateEditor && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(20,15,10,0.4)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 100 }} onClick={() => setDateEditor(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background: T.card, width: '100%', maxWidth: 460, borderRadius: '20px 20px 0 0', padding: '20px 18px 28px', maxHeight: '82%', overflow: 'auto', boxShadow: '0 -8px 32px rgba(0,0,0,.2)' }}>
            <div style={{ width: 40, height: 4, borderRadius: 2, background: T.border, margin: '0 auto 16px' }} />
            <div style={{ fontSize: 16, fontWeight: 700, color: T.ink }}>{t('editDayRates')}</div>
            <div style={{ fontSize: 12, color: T.ink3, marginTop: 2, marginBottom: 14 }}>{fmtDayLabel(dateEditor.idx)} · {t('appliesThisDateOnly')}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {dateEditor.rows.map(r => (
                <div key={r.catId} style={{ padding: 12, background: T.bgSoft, borderRadius: 10, border: `1px solid ${T.borderSoft}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>{r.name}</div>
                    <div className="tnum" style={{ fontSize: 10, color: T.ink3, fontWeight: 600 }}>{r.booked} {t('bookedWord')} · {Math.max(0, Math.round(+r.open || 0) - r.booked)} {t('freeWord')}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <label style={{ flex: 1 }}>
                      <div style={{ fontSize: 10, color: T.ink3, fontWeight: 600, marginBottom: 3 }}>{t('roomsOpen')} / {r.units}</div>
                      <input type="number" inputMode="numeric" min={r.booked} max={r.units} value={r.open}
                        onFocus={e => e.target.select()}
                        // Clamp to 0..units as you type so the live "free" label
                        // can't show negative/impossible counts; the booked-floor
                        // + override confirm are applied on save.
                        onChange={e => setEditorRow(r.catId, { open: Math.max(0, Math.min(r.units, Math.round(+e.target.value || 0))) })}
                        className="tnum" style={dayEdInput} />
                    </label>
                    <label style={{ flex: 1 }}>
                      <div style={{ fontSize: 10, color: T.ink3, fontWeight: 600, marginBottom: 3 }}>{t('ratePerNightShort')} (₹)</div>
                      <input type="number" inputMode="numeric" min={0} value={r.rate}
                        onFocus={e => e.target.select()}
                        onChange={e => setEditorRow(r.catId, { rate: e.target.value })}
                        className="tnum" style={dayEdInput} />
                    </label>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <Btn variant="ghost" full onClick={() => setDateEditor(null)}>{t('cancel')}</Btn>
              <Btn full onClick={saveDateEditor}>{t('save')}</Btn>
            </div>
          </div>
        </div>
      )}

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
                  {t('conflictBanner').replace('{guest}', targetConflict.guest).replace('{id}', targetConflict.id)}
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
                  // R8-6: a single-room booking renders its pill from
                  // roomItems[0], so a cross-type move must rewrite that item's
                  // type/unit too — otherwise the pill snaps back to the old
                  // room type. Also makes the unit authoritative (R8-1).
                  const moved = confirmDrop.b;
                  if (Array.isArray(moved.roomItems) && moved.roomItems.length === 1) {
                    patch.roomItems = [{ ...moved.roomItems[0], roomTypeId: confirmDrop.newSlot.roomTypeId, unitIdx: confirmDrop.newSlot.unitIdx }];
                  }
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

import { useState, useMemo, useRef, useEffect } from 'react';
import { T } from '../tokens.js';
import { effectiveRoomTypes, ANCHOR, ymd } from '../data.js';
import { holidayFor } from '../holidays.js';
import Icon from '../components/Icon.jsx';
import Btn from '../components/Btn.jsx';
import Chip from '../components/Chip.jsx';
import Card from '../components/Card.jsx';
import SectionHead from '../components/SectionHead.jsx';
import ScreenHeader from '../components/ScreenHeader.jsx';

const bulkBtn = (bg) => ({
  background: bg, color: '#fff', border: 'none', borderRadius: 8,
  padding: '7px 11px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 4,
});

// Index of a YYYY-MM-DD string relative to the live ANCHOR (today).
function isoToIdx(iso) {
  if (!iso) return null;
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d.getTime())) return null;
  const ms = d.setHours(0, 0, 0, 0) - new Date(ANCHOR).setHours(0, 0, 0, 0);
  return Math.round(ms / (24 * 60 * 60 * 1000));
}

// Small native-date input styled as a tappable pill. The whole pill is
// clickable; the real input lives at opacity 0 covering the surface so
// the OS date picker pops on tap. Same overlay-input pattern used in
// Diary and NewBooking.
function DatePill({ value, onChange, placeholder, flex = 1 }) {
  const inputRef = useRef(null);
  const open = () => {
    if (inputRef.current && typeof inputRef.current.showPicker === 'function') {
      try { inputRef.current.showPicker(); } catch {}
    }
  };
  const filled = !!value;
  return (
    <div
      onClick={open}
      style={{ flex, position: 'relative', height: 38, background: filled ? T.primaryLt : T.bgSoft, border: `1px solid ${filled ? T.primary : T.border}`, borderRadius: 8, cursor: 'pointer', minWidth: 0 }}
    >
      <input
        ref={inputRef}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer', border: 'none', padding: 0 }}
      />
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, pointerEvents: 'none', fontSize: 11, fontWeight: 700, color: filled ? T.primaryDk : T.ink2, padding: '0 8px', whiteSpace: 'nowrap', overflow: 'hidden' }}>
        <Icon name="cal" size={12} color={filled ? T.primaryDk : T.ink2} />
        {filled
          ? new Date(value + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
          : placeholder}
      </div>
    </div>
  );
}

// From → To bar with prev/next month chevrons and a Today reset. Picking
// From alone jumps the visible window; picking both From and To adds the
// inclusive day range to the rate-editor's selection set.
function RangeBar({ rangeStart, rangeEnd, onRangeStartChange, onRangeEndChange, viewStartIdx, goPrevMonth, goNextMonth, goToday, t }) {
  const chevBtn = { width: 36, height: 38, borderRadius: 8, border: `1px solid ${T.border}`, background: T.card, color: T.ink2, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 };
  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 12, alignItems: 'center' }}>
      <button onClick={goPrevMonth} title="Previous 4 weeks" style={chevBtn}>
        <Icon name="arrowL" size={14} stroke={2.2} color={T.ink2} />
      </button>
      <DatePill value={rangeStart} onChange={onRangeStartChange} placeholder={t('rangeFrom')} />
      <span style={{ color: T.ink3, fontSize: 13, fontWeight: 700, flexShrink: 0 }}>→</span>
      <DatePill value={rangeEnd} onChange={onRangeEndChange} placeholder={t('rangeTo')} />
      {viewStartIdx !== 0 && (
        <button
          onClick={goToday}
          style={{ padding: '0 10px', height: 38, borderRadius: 8, border: `1px solid ${T.primary}`, background: T.primaryLt, color: T.primaryDk, fontSize: 11, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}
        >{t('today')}</button>
      )}
      <button onClick={goNextMonth} title="Next 4 weeks" style={chevBtn}>
        <Icon name="chev" size={14} stroke={2.2} color={T.ink2} />
      </button>
    </div>
  );
}

export default function Rates({ go, t, lang, overrides: overridesProp, setOverrides: setOverridesProp, property, plan = 'engine', bookings = [] }) {
  const ROOM_TYPES = effectiveRoomTypes(property);
  const [selectedType, setSelectedType] = useState(() => ROOM_TYPES[0]?.id || 'dlx');
  const [selected, setSelected] = useState(new Set());
  const [dragStart, setDragStart] = useState(null);
  const [dragEnd, setDragEnd] = useState(null);
  const [dragMoved, setDragMoved] = useState(false);
  const [localOverrides, setLocalOverrides] = useState({});
  const overrides = overridesProp !== undefined ? overridesProp : localOverrides;
  const setOverrides = setOverridesProp || setLocalOverrides;
  const [showBulkSheet, setShowBulkSheet] = useState(null);
  const [bulkVal, setBulkVal] = useState('');
  // "Set inventory" stepper value — the target number of rooms the
  // hotelier wants sellable on each selected date. Compared against
  // the category's total units (rt.units) to derive how many should
  // be blocked (= total - target).
  const [bulkInv, setBulkInv] = useState(null);
  // Undo snackbar. After any bulk apply we snapshot the overrides map
  // and surface a "X applied · Undo" pill at the bottom. 10s lifetime.
  // null = no undo available. The snapshot is the FULL overrides map
  // (cheap to copy at scale of hundreds of overrides per property).
  const [undoSnapshot, setUndoSnapshot] = useState(null);
  const captureUndo = (label) => setUndoSnapshot({ prev: overrides, label, at: Date.now() });
  const undoBulk = () => {
    if (!undoSnapshot) return;
    setOverrides(undoSnapshot.prev);
    setUndoSnapshot(null);
  };
  // Auto-dismiss the snackbar after 10 seconds.
  useEffect(() => {
    if (!undoSnapshot) return;
    const id = setTimeout(() => setUndoSnapshot(null), 10000);
    return () => clearTimeout(id);
  }, [undoSnapshot]);
  // Anchor for the visible window. 0 = today; jumping forward via the
  // date picker shifts the start of the calendar grid.
  const [viewStartIdx, setViewStartIdx] = useState(0);
  // Range picker — replaces the single jump-to-date input. When "From"
  // is set we jump the view; when both "From" and "To" are set we add
  // the day range to selection so the hotelier can immediately apply a
  // rate or close-out from the bottom bar. Empty strings = "not picked".
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');
  const [rangeToast, setRangeToast] = useState('');

  const rt = ROOM_TYPES.find(r => r.id === selectedType);

  // Weekend rules come from property settings. Defaults: Sat + Sun, +20%.
  const weekendDays = (property?.weekendRules?.weekendDays) || [0, 6];
  const upliftPct = property?.weekendRules?.upliftPct ?? 20;
  const upliftMultiplier = 1 + (upliftPct / 100);
  const weekendDaySet = useMemo(() => new Set(weekendDays), [weekendDays.join(',')]);

  // Seasons: each one multiplies the rate for any date inside its range.
  // Overlapping seasons multiply together (rare in practice, but defined).
  const seasons = Array.isArray(property?.seasons) ? property.seasons : [];
  const seasonsFor = (iso) => seasons.filter(s => iso >= s.startIso && iso <= s.endIso);
  const seasonMultiplier = (iso) => seasonsFor(iso).reduce((m, s) => m * (1 + ((s.multiplierPct || 0) / 100)), 1);

  // 42-cell grid (6 weeks × 7 days) starting from viewStartIdx. We render
  // the calendar exactly as it appears on a wall calendar — first cell
  // sits in the column of its weekday, with blank cells before it. Lets
  // the hotelier eyeball "all Fridays in October" without counting.
  const days = useMemo(() => {
    const out = [];
    for (let i = 0; i < 42; i++) {
      const idx = viewStartIdx + i;
      const d = new Date(ANCHOR);
      d.setDate(d.getDate() + idx);
      const iso = ymd(d);
      out.push({
        idx, dom: d.getDate(),
        // Mon=0 ... Sun=6 so the grid aligns to the Mon-first header below.
        dowMonFirst: (d.getDay() + 6) % 7,
        dow: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()],
        dowIdx: d.getDay(),
        // Weekend = days in the property's configured weekendDays set.
        isWknd: weekendDaySet.has(d.getDay()),
        iso,
        // Real "today" detection vs the strict idx===0 check we used to
        // do — the user could jump-pick today on the date picker.
        isToday: idx === 0,
        // Month / monthShort for the month label on the 1st of each month.
        monthShort: d.toLocaleDateString('en-IN', { month: 'short' }),
        // Holiday metadata from src/holidays.js. Null for ordinary days.
        holiday: holidayFor(iso),
      });
    }
    return out;
  }, [viewStartIdx, weekendDaySet]);

  // Leading blank cells so the first real date appears under its real
  // weekday column (Mon-first header). The whole 42-cell grid is then
  // sliced so we don't render trailing empties past 30 real days.
  const leadingBlanks = days.length ? days[0].dowMonFirst : 0;
  const visibleDays = days.slice(0, 35 - leadingBlanks);

  const cellKey = (i, typeId = selectedType) => `${typeId}:${i}`;
  // Effective rate for a specific room type on a specific day idx.
  // Honors that type's overrides and falls back to its base × the
  // property's weekend uplift. Used both for the live cell render
  // and for the F2 "copy rates from another type" computation.
  const rateFor = (typeId, i) => {
    const o = overrides[cellKey(i, typeId)];
    if (o && o.closed) return null;
    if (o && o.rate != null) return o.rate;
    const cat = ROOM_TYPES.find(r => r.id === typeId);
    if (!cat) return null;
    const day = days.find(d => d.idx === i);
    const wknd = day && day.isWknd ? upliftMultiplier : 1;
    const seasonMult = day ? seasonMultiplier(day.iso) : 1;
    return Math.round(cat.base * wknd * seasonMult);
  };
  const getRate = (i) => rateFor(selectedType, i);
  const isClosed = (i) => !!overrides[cellKey(i)]?.closed;
  // Per-unit close-out: { closedUnits: [3, 5] } means units #4 and #6 are
  // out for the day even though the type-wide rate is still live.
  const closedUnitsFor = (i) => {
    const o = overrides[cellKey(i)];
    return (o && Array.isArray(o.closedUnits)) ? o.closedUnits : [];
  };

  // Occupancy forecast: per-day count of bookings consuming this type's
  // inventory, divided by units available (total minus closedUnits).
  // Multi-room bookings count once per matching roomItem.
  const bookingsForType = useMemo(() => {
    return bookings.filter(b => {
      if (b.status === 'cancelled') return false;
      if (b.roomTypeId === selectedType) return true;
      if (Array.isArray(b.roomItems) && b.roomItems.some(r => r.roomTypeId === selectedType)) return true;
      return false;
    });
  }, [bookings, selectedType]);
  const occupiedCountFor = (i) => {
    let count = 0;
    for (const b of bookingsForType) {
      const startIdx = b.startIdx || 0;
      const endIdx = startIdx + (b.nights || 1);
      if (i < startIdx || i >= endIdx) continue;
      const items = Array.isArray(b.roomItems) && b.roomItems.length
        ? b.roomItems
        : [{ roomTypeId: b.roomTypeId }];
      count += items.filter(r => (r.roomTypeId || b.roomTypeId) === selectedType).length;
    }
    return count;
  };
  const availableUnitsFor = (i) => {
    if (!rt) return 0;
    return Math.max(0, rt.units - closedUnitsFor(i).length);
  };
  // Rooms genuinely free to sell on a given day = total − maintenance
  // close-outs − bookings already taking that room. This is what we
  // surface on each calendar cell so the hotelier can scan inventory
  // at a glance without doing arithmetic.
  const freeUnitsFor = (i) => {
    if (!rt) return 0;
    return Math.max(0, availableUnitsFor(i) - occupiedCountFor(i));
  };
  // Three-tier classification of how tight inventory is for a given
  // day, based on free rooms vs total. Replaces the older percentage
  // heatmap — hoteliers think in absolute counts ("2 left"), not %.
  //   open    → plenty (>50% free), gray bed icon
  //   tight   → ≤50% free OR ≤2 rooms left, orange
  //   soldOut → 0 free, red
  const availabilityTier = (i) => {
    if (!rt) return 'open';
    const free = freeUnitsFor(i);
    if (free === 0) return 'soldOut';
    const total = rt.units || 1;
    const ratio = free / total;
    if (free <= 2 || ratio <= 0.5) return 'tight';
    return 'open';
  };
  const tierColor = (tier) => tier === 'soldOut' ? T.danger : tier === 'tight' ? 'oklch(60% 0.16 65)' : T.ink3;

  const onCellDown = (i) => { setDragStart(i); setDragEnd(i); setDragMoved(false); };

  // Mobile swipe across the calendar to flip months. Tracks one-finger
  // horizontal travel; if dx > 60px and travel is mostly horizontal we
  // navigate and cancel any in-progress cell selection so the swipe
  // doesn't accidentally mark a date as well.
  const swipeRef = useRef(null);
  const onCalSwipeStart = (e) => {
    const t = e.touches && e.touches[0];
    if (!t) return;
    swipeRef.current = { x: t.clientX, y: t.clientY };
  };
  const onCalSwipeEnd = (e) => {
    const start = swipeRef.current;
    swipeRef.current = null;
    if (!start) return;
    const t = e.changedTouches && e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx)) return;
    if (dx > 0) goPrevMonth(); else goNextMonth();
    setDragStart(null); setDragEnd(null); setDragMoved(false);
  };
  const onCellEnter = (i) => {
    if (dragStart != null) {
      if (i !== dragStart) setDragMoved(true);
      setDragEnd(i);
    }
  };
  // Tap vs drag is decided here on mouseup/touchend. Single-tap toggles
  // the cell; a drag adds the whole range. Earlier code separated these
  // into onClick + onMouseUp which double-fired and net-cancelled single
  // taps to "no change" — the bug the hotelier hit.
  const onCellUp = () => {
    if (dragStart == null) return;
    const a = Math.min(dragStart, dragEnd ?? dragStart);
    const b = Math.max(dragStart, dragEnd ?? dragStart);
    setSelected(prev => {
      const next = new Set(prev);
      if (!dragMoved && a === b) {
        // Single cell: toggle membership.
        if (next.has(a)) next.delete(a); else next.add(a);
      } else {
        // Drag: add the swept range.
        for (let i = a; i <= b; i++) next.add(i);
      }
      return next;
    });
    setDragStart(null); setDragEnd(null); setDragMoved(false);
  };
  const inDragRange = (i) => {
    if (dragStart == null || dragEnd == null) return false;
    const a = Math.min(dragStart, dragEnd), b = Math.max(dragStart, dragEnd);
    return i >= a && i <= b;
  };

  // Date picker — jump the visible window so the picked date is the
  // first row's start-of-week. Works for past or future dates: the
  // calendar handles negative idx values fine since getRate just uses
  // the day's modifier and overrides are keyed by idx.
  // Jump the visible window so a picked date appears in the grid. Same
  // anchoring rule used everywhere: align to the start of the date's
  // week (Monday) so dates fall under their real weekday column.
  const jumpViewTo = (iso) => {
    const idx = isoToIdx(iso);
    if (idx == null) return;
    const d = new Date(iso + 'T00:00:00');
    const dowMonFirst = (d.getDay() + 6) % 7;
    setViewStartIdx(idx - dowMonFirst);
  };
  // Bulk-add every day from startIso to endIso into the selection set.
  // Inclusive on both ends; tolerates From > To by swapping. Surfaces
  // a brief toast so the hotelier sees confirmation that "12 dates were
  // added" even when the range straddles months that aren't on screen.
  const applyRangeSelect = (startIso, endIso) => {
    const a = isoToIdx(startIso);
    const b = isoToIdx(endIso);
    if (a == null || b == null) return;
    const lo = Math.min(a, b), hi = Math.max(a, b);
    const count = hi - lo + 1;
    setSelected(prev => {
      const next = new Set(prev);
      for (let i = lo; i <= hi; i++) next.add(i);
      return next;
    });
    setRangeToast(t('rangeAddedNDates').replace('{n}', String(count)));
    setTimeout(() => setRangeToast(''), 2500);
  };
  const onRangeStartChange = (iso) => {
    setRangeStart(iso);
    if (iso) jumpViewTo(iso);
    if (iso && rangeEnd) applyRangeSelect(iso, rangeEnd);
  };
  const onRangeEndChange = (iso) => {
    setRangeEnd(iso);
    if (iso && rangeStart) applyRangeSelect(rangeStart, iso);
  };
  const goPrevMonth = () => setViewStartIdx(i => i - 28);
  const goNextMonth = () => setViewStartIdx(i => i + 28);
  const goToday = () => {
    setViewStartIdx(0);
    setRangeStart('');
    setRangeEnd('');
    // Also drop any in-flight selection so the bottom action bar resets.
    // Today is the hotelier's "fresh start" — keeping a stale selection
    // visible after it surprised testers in the audit.
    setSelected(new Set());
    setRangeToast('');
  };

  // Bulk-select pattern picker. The "Select…" button opens a sheet with
  // one-tap presets: all of a given weekday, all weekend days, or all
  // holidays falling inside a 180-day forward window. "All Mondays"
  // earlier only covered the visible 5-week window, which surprised
  // hoteliers who wanted to set rates for "all Mondays this season".
  const [showSelectPattern, setShowSelectPattern] = useState(false);
  const PATTERN_HORIZON_DAYS = 180;
  // Pre-compute all days in the 180-day window so the patterns operate
  // on the full horizon (today → +180). Each entry mirrors the shape of
  // `visibleDays` so the predicates downstream can stay unchanged.
  const horizonDays = useMemo(() => {
    const out = [];
    for (let i = 0; i < PATTERN_HORIZON_DAYS; i++) {
      const d = new Date(ANCHOR);
      d.setDate(d.getDate() + i);
      out.push({
        idx: i,
        dom: d.getDate(),
        dow: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()],
        dowIdx: d.getDay(),
        isWknd: weekendDaySet.has(d.getDay()),
        iso: ymd(d),
        holiday: holidayFor(ymd(d)),
      });
    }
    return out;
  }, [weekendDaySet]);
  const selectByPredicate = (pred) => {
    const ids = horizonDays.filter(pred).map(d => d.idx);
    setSelected(new Set(ids));
    setShowSelectPattern(false);
  };

  const applyBulkRate = () => {
    const v = +bulkVal;
    if (!v) return;
    captureUndo(`Set rate ₹${v.toLocaleString('en-IN')} on ${selected.size} ${selected.size === 1 ? 'date' : 'dates'}`);
    setOverrides(o => {
      const next = { ...o };
      selected.forEach(i => {
        const key = `${selectedType}:${i}`;
        // Spread the prior override so partial close-outs (closedUnits)
        // survive a rate change — earlier we replaced the whole object
        // and silently wiped maintenance blocks.
        const prev = next[key] || {};
        next[key] = { ...prev, rate: v, closed: false };
      });
      return next;
    });
    setBulkVal(''); setShowBulkSheet(null);
  };
  const applyBlock = () => {
    captureUndo(`Closed ${selected.size} ${selected.size === 1 ? 'date' : 'dates'} for ${rt.name}`);
    setOverrides(o => {
      const next = { ...o };
      selected.forEach(i => {
        const prev = next[`${selectedType}:${i}`] || {};
        // Whole-type close-out clears any partial closedUnits since the
        // type is now blanket-closed.
        const { closedUnits: _drop, ...rest } = prev;
        next[`${selectedType}:${i}`] = { ...rest, closed: true };
      });
      return next;
    });
    setShowBulkSheet(null);
  };
  // Close specific units (not the whole type). Each picked unit gets its
  // own row in the override's closedUnits list. The type's rate stays
  // live for the remaining units.
  const [blockUnits, setBlockUnits] = useState([]);
  const applyBlockUnits = () => {
    if (blockUnits.length === 0) return;
    captureUndo(`Blocked ${blockUnits.length} unit${blockUnits.length === 1 ? '' : 's'} on ${selected.size} ${selected.size === 1 ? 'date' : 'dates'}`);
    setOverrides(o => {
      const next = { ...o };
      selected.forEach(i => {
        const prev = next[`${selectedType}:${i}`] || {};
        // Merge with any pre-existing closedUnits and dedupe.
        const merged = Array.from(new Set([...(prev.closedUnits || []), ...blockUnits])).sort((a, b) => a - b);
        next[`${selectedType}:${i}`] = { ...prev, closed: false, closedUnits: merged };
      });
      return next;
    });
    setBlockUnits([]);
    setShowBulkSheet(null);
  };
  const applyOpen = () => {
    captureUndo(`Cleared custom settings on ${selected.size} ${selected.size === 1 ? 'date' : 'dates'}`);
    setOverrides(o => {
      const next = { ...o };
      selected.forEach(i => { delete next[`${selectedType}:${i}`]; });
      return next;
    });
    setShowBulkSheet(null);
  };

  // "Set inventory to N" — the aggregate counterpart to per-unit close-out.
  // Translates a target count of sellable rooms into closedUnits indices by
  // blocking the highest-indexed units first (an arbitrary but stable
  // convention so re-applying the same N is idempotent). If target == total
  // the override is cleared (back to fully open); if target == 0 we close
  // the whole type so the cell renders the "Closed" state and the booking
  // flow can short-circuit before checking units.
  const applyBulkInventory = () => {
    if (!rt || bulkInv == null) return;
    const total = rt.units;
    const target = Math.max(0, Math.min(total, bulkInv));
    const toBlock = total - target;
    captureUndo(`Set inventory to ${target}/${total} on ${selected.size} ${selected.size === 1 ? 'date' : 'dates'}`);
    setOverrides(o => {
      const next = { ...o };
      selected.forEach(i => {
        const key = `${selectedType}:${i}`;
        const prev = next[key] || {};
        if (target === total) {
          // Fully open: drop closedUnits + closed but keep any rate override
          // so the hotelier's prior custom price survives a "reopen all".
          const { closedUnits: _drop, closed: _drop2, ...rest } = prev;
          if (Object.keys(rest).length === 0) {
            delete next[key];
          } else {
            next[key] = rest;
          }
        } else if (target === 0) {
          const { closedUnits: _drop, ...rest } = prev;
          next[key] = { ...rest, closed: true };
        } else {
          // Convention: block the last `toBlock` units (units numbered
          // (target+1) ... total in 1-indexed display, indices target..total-1).
          const closedUnits = Array.from({ length: toBlock }, (_, k) => total - 1 - k).reverse();
          next[key] = { ...prev, closed: false, closedUnits };
        }
      });
      return next;
    });
    setBulkInv(null);
    setShowBulkSheet(null);
  };

  // F2: copy rates from a source room type to the current type with a
  // multiplier (e.g. "Luxury = Deluxe × 1.6"). Operates on the explicit
  // range below — defaults to "today → 90 days" so a copy is deterministic
  // (the older "whatever's visible" behaviour depended on scroll position
  // and tripped up hoteliers who'd scrolled to a different month). The
  // selection set is also honoured when present, so picking dates first
  // and then opening Copy applies only to those.
  const [copyState, setCopyState] = useState({ sourceId: null, multiplier: 1.0, fromIso: '', toIso: '' });
  const applyCopyFromSource = () => {
    if (!copyState.sourceId || copyState.sourceId === selectedType) return;
    const m = Number(copyState.multiplier) || 1;
    if (m <= 0) return;
    // Resolve the day-idx list to copy onto. Priority:
    //   1) explicit From/To dates on the copyState
    //   2) current selection set
    //   3) fallback: today (idx 0) through +90
    let indexes = [];
    const a = isoToIdx(copyState.fromIso);
    const b = isoToIdx(copyState.toIso);
    if (a != null && b != null) {
      const lo = Math.min(a, b), hi = Math.max(a, b);
      for (let i = lo; i <= hi; i++) indexes.push(i);
    } else if (selected.size > 0) {
      indexes = Array.from(selected);
    } else {
      for (let i = 0; i <= 90; i++) indexes.push(i);
    }
    captureUndo(`Copied ${indexes.length} ${indexes.length === 1 ? 'day' : 'days'} of rates from ${ROOM_TYPES.find(r => r.id === copyState.sourceId)?.name || 'source'}`);
    setOverrides(o => {
      const next = { ...o };
      for (const i of indexes) {
        const sourceOverride = o[cellKey(i, copyState.sourceId)];
        if (sourceOverride && sourceOverride.closed) {
          next[cellKey(i)] = { closed: true };
          continue;
        }
        const sourceRate = rateFor(copyState.sourceId, i);
        if (sourceRate == null) continue;
        // Spread the prior target override so closedUnits + any meal-plan
        // overrides survive a rate copy (same fix as applyBulkRate).
        const prev = next[cellKey(i)] || {};
        next[cellKey(i)] = { ...prev, rate: Math.round(sourceRate * m), closed: false };
      }
      return next;
    });
    setShowBulkSheet(null);
  };

  const selCount = selected.size;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: T.bg }} onMouseUp={onCellUp} onTouchEnd={onCellUp}>
      <ScreenHeader title={t('ratesTitle')} subtitle={t('ratesSub')} onBack={() => go('home')} />

      <div style={{ display: 'flex', gap: 6, padding: '10px 14px', background: T.card, borderBottom: `1px solid ${T.borderSoft}`, overflowX: 'auto' }}>
        {ROOM_TYPES.map(r => (
          <button key={r.id} onClick={() => setSelectedType(r.id)} style={{
            padding: '7px 12px', borderRadius: 999, whiteSpace: 'nowrap',
            border: selectedType === r.id ? `1.5px solid ${T.primary}` : `1px solid ${T.border}`,
            background: selectedType === r.id ? T.primaryLt : T.card,
            color: selectedType === r.id ? T.primaryDk : T.ink2,
            fontSize: 11, fontWeight: 600, cursor: 'pointer',
          }}>{r.name}</button>
        ))}
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '14px', paddingBottom: 130 }}>
        <Card padding={14} style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 10, color: T.ink3, fontWeight: 700, letterSpacing: 0.4 }}>{t('baseRate')}</div>
              <div className="tnum" style={{ fontSize: 24, fontWeight: 700, color: T.ink, letterSpacing: -0.6 }}>₹{rt.base.toLocaleString('en-IN')}</div>
              <div style={{ fontSize: 11, color: T.ink3, marginTop: 2 }}>{rt.units} {t('units')} · {(() => {
                const dows = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
                const names = weekendDays.map(d => dows[d]).join('/');
                return upliftPct > 0 ? `${names} +${upliftPct}%` : 'No weekend uplift';
              })()}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
              {/* Synced chip used to claim OTA sync regardless of plan.
                  Engine tier has no channel manager — show local-only. */}
              {plan === 'engine' ? (
                <Chip color="indigo" icon="home" style={{ fontSize: 9 }}>Direct only</Chip>
              ) : (
                <Chip color="ok" icon="sync" style={{ fontSize: 9 }}>{t('synced')}</Chip>
              )}
            </div>
          </div>
        </Card>

        {/* Range bar — two date pickers (From → To). Setting From jumps
            the visible window. Setting both adds the day range to the
            selection so the bottom action bar lights up with Set rate /
            Close-out. Replaces the older single jump-to-date input. */}
        <RangeBar
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          onRangeStartChange={onRangeStartChange}
          onRangeEndChange={onRangeEndChange}
          viewStartIdx={viewStartIdx}
          goPrevMonth={goPrevMonth}
          goNextMonth={goNextMonth}
          goToday={goToday}
          t={t}
        />
        {rangeToast && (
          <div style={{
            marginBottom: 10, padding: '8px 12px', borderRadius: 8,
            background: T.primaryLt, border: `1px solid ${T.primary}`,
            color: T.primaryDk, fontSize: 11, fontWeight: 700,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <Icon name="check" size={12} color={T.primaryDk} stroke={2.4} />
            {rangeToast}
          </div>
        )}

        {/* Month label — derives the dominant month of the visible 5-week
            window so the hotelier always knows which month they're
            looking at. When the window straddles two months we show
            both (e.g. "May → Jun 2026"). */}
        {(() => {
          if (!visibleDays.length) return null;
          const first = visibleDays[0];
          const last = visibleDays[visibleDays.length - 1];
          const fd = new Date(ANCHOR);
          fd.setDate(fd.getDate() + first.idx);
          const ld = new Date(ANCHOR);
          ld.setDate(ld.getDate() + last.idx);
          const sameMonth = fd.getMonth() === ld.getMonth() && fd.getFullYear() === ld.getFullYear();
          const monthFmt = (d) => d.toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', { month: 'long', year: 'numeric' });
          const label = sameMonth
            ? monthFmt(fd)
            : `${fd.toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', { month: 'short' })} → ${monthFmt(ld)}`;
          return (
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '0 4px', marginBottom: 6 }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: T.ink, letterSpacing: -0.3 }}>{label}</h3>
              <span style={{ fontSize: 9, color: T.ink3, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase' }}>{t('dailyRate')}</span>
            </div>
          );
        })()}
        <SectionHead title="" style={{ marginBottom: 8, padding: 0 }} action={
          <div style={{ display: 'inline-flex', gap: 12 }}>
            <button
              onClick={() => setShowSelectPattern(true)}
              style={{ background: 'none', border: 'none', color: T.indigo, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
            >Select…</button>
            {ROOM_TYPES.length > 1 && (
              <button
                onClick={() => { setCopyState({ sourceId: ROOM_TYPES.find(r => r.id !== selectedType)?.id, multiplier: 1.0, fromIso: '', toIso: '' }); setShowBulkSheet('copy'); }}
                style={{ background: 'none', border: 'none', color: T.indigo, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
              >Copy from…</button>
            )}
            {selCount > 0 && (
              <button onClick={() => setSelected(new Set())} style={{ background: 'none', border: 'none', color: T.primary, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>{t('clearSelection')}</button>
            )}
          </div>
        } />
        <div onTouchStart={onCalSwipeStart} onTouchEnd={onCalSwipeEnd}>
        <Card padding={10}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 6 }}>
            {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((d, ix) => (
              <div key={d} style={{ textAlign: 'center', fontSize: 9, fontWeight: 700, color: ix >= 5 ? T.primary : T.ink3, letterSpacing: 0.3 }}>{d}</div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
            {/* Leading blank cells so the first real date sits under its
                weekday column. Without these the calendar always started
                at Monday and the dates lied about their day-of-week. */}
            {Array.from({ length: leadingBlanks }).map((_, i) => (
              <div key={'blank-' + i} style={{ aspectRatio: '1 / 1.1' }} />
            ))}
            {visibleDays.map(d => {
              const i = d.idx;
              const rate = getRate(i);
              const closed = isClosed(i);
              const partialClosed = closedUnitsFor(i);
              const isSel = selected.has(i);
              const inDrag = inDragRange(i);
              const isOverride = !!overrides[cellKey(i)];
              const isFirstOfMonth = d.dom === 1;
              const free = freeUnitsFor(i);
              const tier = availabilityTier(i);
              const showSurge = !closed && !isSel && !inDrag && !isOverride && tier === 'tight' && i >= 0 && free > 0;
              const titleParts = [];
              if (!closed) titleParts.push(`${free} of ${rt.units} rooms free`);
              if (partialClosed.length > 0) titleParts.push(`Units #${partialClosed.map(u => u + 1).join(', #')} blocked`);
              if (occupiedCountFor(i) > 0) titleParts.push(`${occupiedCountFor(i)} booked`);
              return (
                <div
                  key={i}
                  onMouseDown={(e) => { e.preventDefault(); onCellDown(i); }}
                  onMouseEnter={() => onCellEnter(i)}
                  onTouchStart={() => onCellDown(i)}
                  title={titleParts.length ? titleParts.join(' · ') : undefined}
                  style={{
                    aspectRatio: '1 / 1.1', borderRadius: 7, padding: 3,
                    background: closed ? 'oklch(94% 0.04 25)' : (isSel || inDrag) ? T.primaryLt : d.isToday ? `color-mix(in oklch, ${T.primary} 7%, white)` : T.card,
                    border: `1.5px solid ${(isSel || inDrag) ? T.primary : closed ? T.danger : isOverride ? T.indigo : d.isToday ? T.primary : T.borderSoft}`,
                    cursor: 'pointer', position: 'relative', userSelect: 'none',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between',
                  }}
                >
                  {/* TODAY pill: small filled badge on the cell with idx=0
                      so the hotelier can spot today even when the view is
                      scrolled to a future month. */}
                  {d.isToday && (
                    <div style={{ position: 'absolute', top: -7, left: '50%', transform: 'translateX(-50%)', background: T.primary, color: '#fff', fontSize: 7, fontWeight: 800, letterSpacing: 0.4, padding: '1px 5px', borderRadius: 4, lineHeight: 1.3, whiteSpace: 'nowrap' }}>TODAY</div>
                  )}
                  <div className="tnum" style={{ fontSize: 13, fontWeight: 700, color: d.isWknd ? T.primary : T.ink, lineHeight: 1 }}>
                    {d.dom}
                    {isFirstOfMonth && <span style={{ fontSize: 7, fontWeight: 700, color: T.ink3, marginLeft: 2 }}>{d.monthShort}</span>}
                  </div>
                  {/* Rooms-free middle row: bed icon + count, color-tinted
                      by tier. Sits between day (top) and rate (bottom) so
                      hoteliers don't confuse the free count with the day
                      number. Hidden when the whole type is closed. */}
                  {!closed && (
                    <div
                      className="tnum"
                      title={`${free} of ${rt.units} rooms free`}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: tierColor(tier), lineHeight: 1 }}
                    >
                      <Icon name="bed" size={12} color={tierColor(tier)} stroke={2.2} />
                      <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.1 }}>{free}</span>
                    </div>
                  )}
                  {closed ? (
                    <div style={{ fontSize: 8, fontWeight: 800, color: T.danger, letterSpacing: 0.3, lineHeight: 1, textTransform: 'uppercase' }}>{t('closed')}</div>
                  ) : (
                    <div className="tnum" style={{ fontSize: 9, fontWeight: 700, color: isOverride ? T.indigo : T.ink2, lineHeight: 1 }}>
                      ₹{Math.round(rate/100)/10}k
                    </div>
                  )}
                  {/* Partial close-out: bottom-left badge "−N" tells the
                      hotelier some specific units are closed even though
                      the type is otherwise live for this date. */}
                  {!closed && partialClosed.length > 0 && (
                    <div className="tnum" title={`Units #${partialClosed.map(u => u + 1).join(', #')} closed`} style={{
                      position: 'absolute', bottom: 2, left: 2,
                      fontSize: 7, fontWeight: 800, color: T.danger,
                      background: '#fff', border: `1px solid ${T.danger}`,
                      borderRadius: 4, padding: '0 3px', lineHeight: 1.3, letterSpacing: 0.2,
                    }}>−{partialClosed.length}</div>
                  )}
                  {/* Auto-surge suggestion — small ↑ icon top-right when
                      occupancy is tight and the rate hasn't been bumped. */}
                  {showSurge && (
                    <div title="High demand — consider raising the rate" style={{
                      position: 'absolute', top: 2, right: 2,
                      fontSize: 7, fontWeight: 800, color: '#fff',
                      background: T.primary, borderRadius: 4, padding: '0 3px',
                      lineHeight: 1.3, letterSpacing: 0.2,
                    }}>↑</div>
                  )}
                  {/* Holiday badge — bottom-right dot tinted by intensity.
                      Tooltip names the holiday. High-intensity (Diwali /
                      Holi / Christmas / NY) gets a stronger orange dot. */}
                  {d.holiday && (
                    <div title={d.holiday.label + (d.holiday.intensity === 'high' ? ' · high demand' : '')} style={{
                      position: 'absolute', bottom: 2, right: 2,
                      width: 6, height: 6, borderRadius: 3,
                      background: d.holiday.intensity === 'high' ? T.primary : d.holiday.intensity === 'mid' ? 'oklch(72% 0.12 75)' : 'oklch(80% 0.06 230)',
                      border: `1px solid #fff`, boxShadow: '0 0 0 1px rgba(0,0,0,0.06)',
                    }} />
                  )}
                  {/* Season stripe — thin top band when this date is
                      inside any named season. Tooltip names the season(s)
                      and shows the cumulative multiplier. */}
                  {(() => {
                    const ss = seasonsFor(d.iso);
                    if (ss.length === 0) return null;
                    const label = ss.map(s => `${s.name || '(unnamed)'} ${s.multiplierPct >= 0 ? '+' : ''}${s.multiplierPct}%`).join(' · ');
                    return (
                      <div title={label} style={{
                        position: 'absolute', top: 0, left: 0, right: 0,
                        height: 3, background: T.indigo,
                        borderTopLeftRadius: 5, borderTopRightRadius: 5,
                      }} />
                    );
                  })()}
                  {isSel && <div style={{ position: 'absolute', top: 2, right: 2, width: 5, height: 5, borderRadius: 3, background: T.primary }} />}
                </div>
              );
            })}
          </div>
          {/* Legend grouped into 3 visual categories — STATE (border styles
              you'll see on cells), ROOMS AVAILABLE (the bed-icon counts
              shown in the top-left of each cell), HINTS (extra markers).
              The old flat legend ran 8 near-identical coloured squares
              that hoteliers couldn't tell apart at a glance. */}
          <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${T.borderSoft}` }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14, rowGap: 12 }}>
              <div>
                <div style={{ fontSize: 9, fontWeight: 700, color: T.ink3, letterSpacing: 0.5, marginBottom: 8, textTransform: 'uppercase' }}>{t('cellState')}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 18, height: 18, border: `1.5px solid ${T.indigo}`, borderRadius: 4, background: T.card, flexShrink: 0 }} />
                    <span style={{ fontSize: 10.5, color: T.ink2, fontWeight: 600 }}>{t('customPrice')}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 18, height: 18, border: `1.5px solid ${T.danger}`, borderRadius: 4, background: 'oklch(94% 0.04 25)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 9, fontWeight: 800, color: T.danger }}>X</span>
                    <span style={{ fontSize: 10.5, color: T.ink2, fontWeight: 600 }}>{t('closed')}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 18, height: 18, border: `1.5px solid ${T.primary}`, borderRadius: 4, background: `color-mix(in oklch, ${T.primary} 7%, white)`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 7, fontWeight: 800, color: T.primary, letterSpacing: 0.2 }}>NOW</span>
                    <span style={{ fontSize: 10.5, color: T.ink2, fontWeight: 600 }}>{t('today')}</span>
                  </div>
                </div>
              </div>
              <div>
                <div style={{ fontSize: 9, fontWeight: 700, color: T.ink3, letterSpacing: 0.5, marginBottom: 8, textTransform: 'uppercase' }}>{t('roomsFree')}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, color: T.ink3, width: 22, justifyContent: 'flex-start' }}>
                      <Icon name="bed" size={11} color={T.ink3} stroke={2.2} />
                      <span className="tnum" style={{ fontSize: 9, fontWeight: 800 }}>4</span>
                    </span>
                    <span style={{ fontSize: 10.5, color: T.ink2, fontWeight: 600 }}>{t('roomsFreeMany')}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, color: 'oklch(60% 0.16 65)', width: 22, justifyContent: 'flex-start' }}>
                      <Icon name="bed" size={11} color="oklch(60% 0.16 65)" stroke={2.2} />
                      <span className="tnum" style={{ fontSize: 9, fontWeight: 800 }}>1</span>
                    </span>
                    <span style={{ fontSize: 10.5, color: T.ink2, fontWeight: 600 }}>{t('roomsFreeTight')}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, color: T.danger, width: 22, justifyContent: 'flex-start' }}>
                      <Icon name="bed" size={11} color={T.danger} stroke={2.2} />
                      <span className="tnum" style={{ fontSize: 9, fontWeight: 800 }}>0</span>
                    </span>
                    <span style={{ fontSize: 10.5, color: T.ink2, fontWeight: 600 }}>{t('roomsFreeNone')}</span>
                  </div>
                </div>
              </div>
              <div>
                <div style={{ fontSize: 9, fontWeight: 700, color: T.ink3, letterSpacing: 0.5, marginBottom: 8, textTransform: 'uppercase' }}>{t('extraMarkers')}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 22, display: 'inline-flex', justifyContent: 'flex-start' }}>
                      <span style={{ background: T.primary, color: '#fff', fontWeight: 800, fontSize: 10, padding: '1px 4px', borderRadius: 3, lineHeight: 1 }}>↑</span>
                    </span>
                    <span style={{ fontSize: 10.5, color: T.ink2, fontWeight: 600 }}>{t('considerRaising')}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 22, display: 'inline-flex', justifyContent: 'flex-start' }}>
                      <span style={{ width: 9, height: 9, background: T.primary, borderRadius: 5, border: '1.5px solid #fff', boxShadow: '0 0 0 1px rgba(0,0,0,0.06)' }} />
                    </span>
                    <span style={{ fontSize: 10.5, color: T.ink2, fontWeight: 600 }}>{t('indianHoliday')}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 22, display: 'inline-flex', justifyContent: 'flex-start' }}>
                      <span style={{ width: 14, height: 3, background: T.indigo, borderRadius: 1 }} />
                    </span>
                    <span style={{ fontSize: 10.5, color: T.ink2, fontWeight: 600 }}>{t('season')}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Card>
        </div>

      </div>

      {selCount > 0 && !undoSnapshot && (
        <div style={{
          position: 'absolute', bottom: 78, left: 0, right: 0, zIndex: 20,
          background: T.ink, color: '#fff', padding: '10px 14px',
          display: 'flex', alignItems: 'center', gap: 8,
          boxShadow: '0 -4px 14px rgba(0,0,0,0.15)',
        }}>
          <div style={{ flex: 1 }}>
            <div className="tnum" style={{ fontSize: 13, fontWeight: 700 }}>{selCount} dates {t('selected')}</div>
            <div style={{ fontSize: 10, opacity: 0.7 }}>{rt.name}</div>
          </div>
          <button onClick={() => setShowBulkSheet('rate')} style={bulkBtn(T.primary)}><Icon name="inr" size={12} stroke={2.4}/> {t('setRate')}</button>
          <button onClick={() => { setBulkInv(rt.units); setShowBulkSheet('inventory'); }} style={bulkBtn(T.indigo)}><Icon name="bed" size={12} stroke={2.4}/> {t('setInventory')}</button>
          <button onClick={() => setShowBulkSheet('block')} style={bulkBtn(T.danger)}><Icon name="x" size={12} stroke={2.4}/> {t('closeOut')}</button>
        </div>
      )}

      {/* Undo snackbar — sits in the same slot as the action bar so the
          two never compete for attention. 10-second lifetime managed
          via the useEffect above; tap Undo to restore the overrides
          snapshot. Useful after a mistyped bulk rate ("₹100 instead of
          ₹4100" — easy to do on a small keyboard). */}
      {undoSnapshot && (
        <div style={{
          position: 'absolute', bottom: 78, left: 0, right: 0, zIndex: 22,
          background: T.ink, color: '#fff', padding: '12px 14px',
          display: 'flex', alignItems: 'center', gap: 12,
          boxShadow: '0 -4px 14px rgba(0,0,0,0.15)',
        }}>
          <Icon name="check" size={14} color="oklch(85% 0.14 145)" stroke={2.4} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, lineHeight: 1.3 }}>{undoSnapshot.label}</div>
            <div style={{ fontSize: 10, opacity: 0.6, marginTop: 2 }}>Tap Undo to revert · auto-dismisses in 10s</div>
          </div>
          <button
            onClick={undoBulk}
            style={{
              background: 'transparent', color: '#fff',
              border: '1px solid rgba(255,255,255,0.4)', borderRadius: 7,
              padding: '7px 14px', fontSize: 12, fontWeight: 800, cursor: 'pointer', letterSpacing: 0.4,
            }}
          >UNDO</button>
          <button
            onClick={() => setUndoSnapshot(null)}
            aria-label="Dismiss"
            style={{
              background: 'transparent', color: 'rgba(255,255,255,0.6)',
              border: 'none', cursor: 'pointer', padding: 4, fontSize: 14, fontWeight: 700,
            }}
          ><Icon name="x" size={12} color="rgba(255,255,255,0.6)" stroke={2.2} /></button>
        </div>
      )}

      {showSelectPattern && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 30, display: 'flex', alignItems: 'flex-end' }} onClick={() => setShowSelectPattern(false)}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', background: T.card, borderRadius: '16px 16px 0 0', padding: 18, paddingBottom: 32 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: T.ink, marginBottom: 4 }}>Select dates by pattern</div>
            <div style={{ fontSize: 11, color: T.ink3, marginBottom: 14, lineHeight: 1.4 }}>Bulk-select all matching dates in the next {PATTERN_HORIZON_DAYS} days. Then tap Set rate, Set inventory, or Close-out.</div>
            <div style={{ fontSize: 10, color: T.ink3, fontWeight: 700, letterSpacing: 0.4, marginBottom: 6 }}>BY WEEKDAY</div>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 14 }}>
              {[
                { idx: 1, label: 'All Mondays' },
                { idx: 2, label: 'All Tuesdays' },
                { idx: 3, label: 'All Wednesdays' },
                { idx: 4, label: 'All Thursdays' },
                { idx: 5, label: 'All Fridays' },
                { idx: 6, label: 'All Saturdays' },
                { idx: 0, label: 'All Sundays' },
              ].map(opt => {
                const count = horizonDays.filter(d => d.dowIdx === opt.idx).length;
                return (
                  <button
                    key={opt.idx}
                    onClick={() => selectByPredicate(d => d.dowIdx === opt.idx)}
                    style={{
                      padding: '6px 11px', borderRadius: 999, cursor: 'pointer',
                      border: `1.5px solid ${T.border}`, background: T.card, color: T.ink2,
                      fontSize: 11, fontWeight: 700,
                    }}
                  >{opt.label} <span className="tnum" style={{ opacity: 0.6 }}>· {count}</span></button>
                );
              })}
            </div>
            <div style={{ fontSize: 10, color: T.ink3, fontWeight: 700, letterSpacing: 0.4, marginBottom: 6 }}>SHORTCUTS</div>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 14 }}>
              <button
                onClick={() => selectByPredicate(d => d.isWknd)}
                style={{ padding: '6px 11px', borderRadius: 999, cursor: 'pointer', border: `1.5px solid ${T.primary}`, background: T.primaryLt, color: T.primaryDk, fontSize: 11, fontWeight: 700 }}
              >Every weekend · {horizonDays.filter(d => d.isWknd).length}</button>
              <button
                onClick={() => selectByPredicate(d => !!d.holiday)}
                style={{ padding: '6px 11px', borderRadius: 999, cursor: 'pointer', border: `1.5px solid oklch(72% 0.12 75)`, background: 'oklch(96% 0.04 75)', color: 'oklch(48% 0.14 75)', fontSize: 11, fontWeight: 700 }}
              >Indian holidays · {horizonDays.filter(d => !!d.holiday).length}</button>
              <button
                onClick={() => selectByPredicate(d => d.holiday && d.holiday.intensity === 'high')}
                style={{ padding: '6px 11px', borderRadius: 999, cursor: 'pointer', border: `1.5px solid ${T.primary}`, background: T.primaryLt, color: T.primaryDk, fontSize: 11, fontWeight: 700 }}
              >Peak holidays (Diwali / Holi / NY) · {horizonDays.filter(d => d.holiday && d.holiday.intensity === 'high').length}</button>
              <button
                onClick={() => selectByPredicate(() => true)}
                style={{ padding: '6px 11px', borderRadius: 999, cursor: 'pointer', border: `1.5px solid ${T.border}`, background: T.card, color: T.ink2, fontSize: 11, fontWeight: 700 }}
              >Next {PATTERN_HORIZON_DAYS} days</button>
            </div>
            <Btn variant="ghost" full onClick={() => setShowSelectPattern(false)}>{t('cancel')}</Btn>
          </div>
        </div>
      )}

      {showBulkSheet && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 30, display: 'flex', alignItems: 'flex-end' }} onClick={() => setShowBulkSheet(null)}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', background: T.card, borderRadius: '16px 16px 0 0', padding: 18, paddingBottom: 32 }}>
            {showBulkSheet === 'rate' && (
              <>
                <div style={{ fontSize: 15, fontWeight: 700, color: T.ink, marginBottom: 4 }}>{t('setRate')}</div>
                <div style={{ fontSize: 11, color: T.ink3, marginBottom: 14 }}>{selCount} dates · {rt.name}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, background: T.bgSoft, border: `1.5px solid ${T.primary}`, borderRadius: 10, padding: '0 12px', height: 48 }}>
                  <span style={{ fontSize: 18, color: T.ink2, fontWeight: 700 }}>₹</span>
                  <input autoFocus type="number" value={bulkVal} onChange={e => setBulkVal(e.target.value)} placeholder={rt.base.toString()} className="tnum" style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 18, fontWeight: 700, color: T.ink }} />
                  <span style={{ fontSize: 11, color: T.ink3 }}>{t('perNight')}</span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Btn variant="ghost" full onClick={() => setShowBulkSheet(null)}>{t('cancel')}</Btn>
                  <Btn full onClick={applyBulkRate}>{t('applyToSelection')}</Btn>
                </div>
              </>
            )}
            {showBulkSheet === 'inventory' && (() => {
              const total = rt.units;
              const N = bulkInv == null ? total : Math.max(0, Math.min(total, bulkInv));
              const blocked = total - N;
              const stepBtn = (disabled) => ({
                width: 48, height: 48, borderRadius: 24,
                border: `1.5px solid ${disabled ? T.borderSoft : T.indigo}`,
                background: disabled ? T.bgSunk : T.indigoLt,
                color: disabled ? T.ink3 : T.indigo,
                fontSize: 22, fontWeight: 800, cursor: disabled ? 'not-allowed' : 'pointer',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              });
              const dPlural = selCount === 1 ? '' : 's';
              const hintTpl = N === total ? t('inventoryAllOpen')
                : N === 0 ? t('inventoryAllClosed')
                : t('inventoryHint');
              const hint = hintTpl
                .replaceAll('{n}', String(N))
                .replaceAll('{total}', String(total))
                .replaceAll('{name}', rt.name)
                .replaceAll('{dCount}', String(selCount))
                .replaceAll('{dPlural}', dPlural)
                .replaceAll('{blocked}', String(blocked));
              return (
                <>
                  <div style={{ fontSize: 15, fontWeight: 700, color: T.ink, marginBottom: 4 }}>{t('setInventory')}</div>
                  <div style={{ fontSize: 11, color: T.ink3, marginBottom: 14 }}>{selCount} {selCount === 1 ? t('date') : t('dates')} · {rt.name}</div>
                  <div style={{ fontSize: 10, color: T.ink3, fontWeight: 700, letterSpacing: 0.4, marginBottom: 8 }}>{t('roomsAvailable').toUpperCase()}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12, padding: '14px 12px', background: T.bgSoft, border: `1.5px solid ${T.indigo}`, borderRadius: 10 }}>
                    <button
                      onClick={() => setBulkInv(v => Math.max(0, (v == null ? total : v) - 1))}
                      disabled={N === 0}
                      style={stepBtn(N === 0)}
                    >−</button>
                    <div className="tnum" style={{ flex: 1, textAlign: 'center', minWidth: 0 }}>
                      <input
                        type="number"
                        min={0}
                        max={total}
                        value={N}
                        onChange={(e) => {
                          const raw = e.target.value;
                          if (raw === '') { setBulkInv(0); return; }
                          const v = parseInt(raw, 10);
                          if (Number.isNaN(v)) return;
                          setBulkInv(Math.max(0, Math.min(total, v)));
                        }}
                        onFocus={(e) => e.target.select()}
                        className="tnum"
                        style={{
                          width: '100%', textAlign: 'center',
                          fontSize: 34, fontWeight: 800, color: T.ink,
                          lineHeight: 1.05, letterSpacing: -0.5,
                          background: 'transparent', border: 'none',
                          // Explicit visible caret so the hotelier
                          // knows the number is editable. The dashed
                          // underline below the digit doubles down on
                          // the "this is a text input" signal.
                          caretColor: T.indigo,
                          cursor: 'text',
                          outline: 'none', padding: '0 0 2px',
                          borderBottom: `1px dashed ${T.borderSoft}`,
                        }}
                        onMouseOver={(e) => { e.currentTarget.style.borderBottom = `1px dashed ${T.indigo}`; }}
                        onMouseOut={(e) => { e.currentTarget.style.borderBottom = `1px dashed ${T.borderSoft}`; }}
                      />
                      <div style={{ fontSize: 9, color: T.ink3, fontWeight: 600, marginTop: 2, fontStyle: 'italic', letterSpacing: 0.2 }}>
                        ↑ tap to type, or use − + buttons
                      </div>
                      <div style={{ fontSize: 11, color: T.ink3, fontWeight: 600, marginTop: 2 }}>of {total} {rt.name}</div>
                    </div>
                    <button
                      onClick={() => setBulkInv(v => Math.min(total, (v == null ? total : v) + 1))}
                      disabled={N === total}
                      style={stepBtn(N === total)}
                    >+</button>
                  </div>
                  <div style={{ padding: '8px 10px', background: T.bgSoft, border: `1px solid ${T.borderSoft}`, borderRadius: 7, fontSize: 11, color: T.ink2, lineHeight: 1.4, marginBottom: 14 }}>
                    {hint}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Btn variant="ghost" full onClick={() => setShowBulkSheet(null)}>{t('cancel')}</Btn>
                    <Btn full onClick={applyBulkInventory}>{t('apply')}</Btn>
                  </div>
                </>
              );
            })()}
            {showBulkSheet === 'block' && (
              <>
                <div style={{ fontSize: 15, fontWeight: 700, color: T.ink, marginBottom: 4 }}>{t('closeOut')}</div>
                <div style={{ fontSize: 12, color: T.ink2, marginBottom: 14, lineHeight: 1.4 }}>
                  Close {selCount} date{selCount > 1 ? 's' : ''} for <strong>{rt.name}</strong>. Choose to close the whole room type or just specific units (for maintenance, deep cleaning, etc).
                </div>
                <div style={{ fontSize: 10, color: T.ink3, fontWeight: 700, letterSpacing: 0.4, marginBottom: 6 }}>SPECIFIC UNITS</div>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 14 }}>
                  {Array.from({ length: rt.units }).map((_, ui) => {
                    const on = blockUnits.includes(ui);
                    return (
                      <button
                        key={ui}
                        onClick={() => setBlockUnits(arr => arr.includes(ui) ? arr.filter(x => x !== ui) : [...arr, ui])}
                        style={{
                          width: 40, height: 36, borderRadius: 7, cursor: 'pointer',
                          border: `1.5px solid ${on ? T.danger : T.border}`,
                          background: on ? `color-mix(in oklch, ${T.danger} 14%, white)` : T.card,
                          color: on ? T.danger : T.ink2,
                          fontSize: 11, fontWeight: 800, letterSpacing: 0.2,
                        }}
                      >#{ui + 1}</button>
                    );
                  })}
                </div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <Btn
                    full
                    style={{ background: T.danger, borderColor: T.danger, opacity: blockUnits.length === 0 ? 0.5 : 1 }}
                    onClick={applyBlockUnits}
                    disabled={blockUnits.length === 0}
                  >Close {blockUnits.length || '—'} unit{blockUnits.length === 1 ? '' : 's'}</Btn>
                  <Btn full style={{ background: T.danger, borderColor: T.danger }} onClick={applyBlock}>Close whole type</Btn>
                </div>
                <Btn variant="ghost" full onClick={applyOpen}>{t('openDates')} (clear close-out)</Btn>
              </>
            )}
            {showBulkSheet === 'copy' && (() => {
              const sourceRT = ROOM_TYPES.find(r => r.id === copyState.sourceId);
              const m = Number(copyState.multiplier) || 1;
              const sampleSource = sourceRT ? rateFor(sourceRT.id, 0) : null;
              const samplePreview = sampleSource != null ? Math.round(sampleSource * m) : null;
              // Compute the day count for the button label + safety. Three
              // possible sources, in priority order: explicit From/To range,
              // current selection, or fallback today→+90 days.
              const a = isoToIdx(copyState.fromIso);
              const b = isoToIdx(copyState.toIso);
              const daysCount = a != null && b != null
                ? Math.abs(b - a) + 1
                : selected.size > 0
                  ? selected.size
                  : 91;
              const rangeSourceLabel = a != null && b != null
                ? `the picked range`
                : selected.size > 0
                  ? `your ${selected.size} selected ${selected.size === 1 ? 'date' : 'dates'}`
                  : `the next 90 days`;
              return (
                <>
                  <div style={{ fontSize: 15, fontWeight: 700, color: T.ink, marginBottom: 4 }}>Copy rates from another type</div>
                  <div style={{ fontSize: 11, color: T.ink3, marginBottom: 14, lineHeight: 1.4 }}>
                    Copies rates from the source to <strong>{rt.name}</strong> with a multiplier, across <strong>{rangeSourceLabel}</strong>. Closed days propagate as closed. Existing custom prices on the target are replaced.
                  </div>
                  <div style={{ fontSize: 10, color: T.ink3, fontWeight: 700, letterSpacing: 0.4, marginBottom: 6 }}>SOURCE ROOM TYPE</div>
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 14 }}>
                    {ROOM_TYPES.filter(r => r.id !== selectedType).map(r => {
                      const sel = copyState.sourceId === r.id;
                      return (
                        <button
                          key={r.id}
                          onClick={() => setCopyState(s => ({ ...s, sourceId: r.id }))}
                          style={{
                            padding: '6px 11px', borderRadius: 999,
                            border: `1.5px solid ${sel ? T.primary : T.border}`,
                            background: sel ? T.primaryLt : T.card,
                            color: sel ? T.primaryDk : T.ink2,
                            fontSize: 11, fontWeight: 700, cursor: 'pointer',
                          }}
                        >{r.name}</button>
                      );
                    })}
                  </div>
                  <div style={{ fontSize: 10, color: T.ink3, fontWeight: 700, letterSpacing: 0.4, marginBottom: 6 }}>MULTIPLIER</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    {[0.7, 0.85, 1.0, 1.2, 1.5, 1.8, 2.0].map(p => {
                      const sel = Math.abs(m - p) < 0.001;
                      return (
                        <button
                          key={p}
                          onClick={() => setCopyState(s => ({ ...s, multiplier: p }))}
                          style={{
                            padding: '5px 9px', borderRadius: 8,
                            border: `1.5px solid ${sel ? T.indigo : T.border}`,
                            background: sel ? T.indigoLt : T.card,
                            color: sel ? T.indigo : T.ink2,
                            fontSize: 11, fontWeight: 700, cursor: 'pointer',
                          }}
                        >×{p}</button>
                      );
                    })}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                    <span style={{ fontSize: 11, color: T.ink3, fontWeight: 600 }}>Or custom:</span>
                    <input
                      type="number"
                      step="0.05"
                      value={copyState.multiplier}
                      onChange={(e) => setCopyState(s => ({ ...s, multiplier: parseFloat(e.target.value) || 0 }))}
                      className="tnum"
                      style={{ width: 80, fontSize: 13, fontWeight: 700, color: T.ink, border: `1px solid ${T.border}`, outline: 'none', borderRadius: 6, padding: '5px 8px', background: T.card }}
                    />
                    <span style={{ fontSize: 11, color: T.ink3 }}>×</span>
                  </div>
                  <div style={{ fontSize: 10, color: T.ink3, fontWeight: 700, letterSpacing: 0.4, marginBottom: 6 }}>DATE RANGE <span style={{ fontWeight: 600, letterSpacing: 0 }}>· optional</span></div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                    <DatePill value={copyState.fromIso} onChange={(v) => setCopyState(s => ({ ...s, fromIso: v }))} placeholder={t('rangeFrom')} />
                    <span style={{ color: T.ink3, fontSize: 13, fontWeight: 700, flexShrink: 0 }}>→</span>
                    <DatePill value={copyState.toIso} onChange={(v) => setCopyState(s => ({ ...s, toIso: v }))} placeholder={t('rangeTo')} />
                  </div>
                  <div style={{ fontSize: 10, color: T.ink3, fontStyle: 'italic', marginBottom: 14, lineHeight: 1.4 }}>
                    Leave both empty to default to the next 90 days{selected.size > 0 ? `, or honour your ${selected.size} selected ${selected.size === 1 ? 'date' : 'dates'}` : ''}.
                  </div>
                  {sampleSource != null && samplePreview != null && (
                    <div style={{ padding: '8px 10px', background: T.bgSoft, border: `1px solid ${T.borderSoft}`, borderRadius: 7, fontSize: 11, color: T.ink2, marginBottom: 14, lineHeight: 1.4 }}>
                      <strong>Preview:</strong> {sourceRT?.name} ₹{sampleSource.toLocaleString('en-IN')} × {m} = <strong style={{ color: T.primaryDk }}>₹{samplePreview.toLocaleString('en-IN')}</strong> on a typical day
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Btn variant="ghost" full onClick={() => setShowBulkSheet(null)}>{t('cancel')}</Btn>
                    <Btn full onClick={applyCopyFromSource} disabled={!copyState.sourceId}>Copy {daysCount} {daysCount === 1 ? 'day' : 'days'}</Btn>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}

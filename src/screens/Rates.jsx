import { useState, useMemo, useRef } from 'react';
import { T } from '../tokens.js';
import { effectiveRoomTypes, ANCHOR, ymd } from '../data.js';
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

export default function Rates({ go, t, lang, overrides: overridesProp, setOverrides: setOverridesProp, property, plan = 'engine' }) {
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
  // Anchor for the visible window. 0 = today; jumping forward via the
  // date picker shifts the start of the calendar grid.
  const [viewStartIdx, setViewStartIdx] = useState(0);
  const [jumpDate, setJumpDate] = useState('');
  const dateRef = useRef(null);

  const rt = ROOM_TYPES.find(r => r.id === selectedType);

  // Weekend rules come from property settings. Defaults: Sat + Sun, +20%.
  const weekendDays = (property?.weekendRules?.weekendDays) || [0, 6];
  const upliftPct = property?.weekendRules?.upliftPct ?? 20;
  const upliftMultiplier = 1 + (upliftPct / 100);
  const weekendDaySet = useMemo(() => new Set(weekendDays), [weekendDays.join(',')]);

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
      out.push({
        idx, dom: d.getDate(),
        // Mon=0 ... Sun=6 so the grid aligns to the Mon-first header below.
        dowMonFirst: (d.getDay() + 6) % 7,
        dow: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()],
        dowIdx: d.getDay(),
        // Weekend = days in the property's configured weekendDays set.
        isWknd: weekendDaySet.has(d.getDay()),
        iso: ymd(d),
        // Real "today" detection vs the strict idx===0 check we used to
        // do — the user could jump-pick today on the date picker.
        isToday: idx === 0,
        // Month / monthShort for the month label on the 1st of each month.
        monthShort: d.toLocaleDateString('en-IN', { month: 'short' }),
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
    return Math.round(cat.base * (day && day.isWknd ? upliftMultiplier : 1));
  };
  const getRate = (i) => rateFor(selectedType, i);
  const isClosed = (i) => !!overrides[cellKey(i)]?.closed;

  const onCellDown = (i) => { setDragStart(i); setDragEnd(i); setDragMoved(false); };
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
  const handleJumpDate = (iso) => {
    setJumpDate(iso);
    const idx = isoToIdx(iso);
    if (idx == null) return;
    // Anchor the picked date to the start of its week (Monday) so it
    // appears under its weekday column without leading blanks. Equivalent
    // to: subtract dowMonFirst days from the picked date.
    const d = new Date(iso + 'T00:00:00');
    const dowMonFirst = (d.getDay() + 6) % 7;
    setViewStartIdx(idx - dowMonFirst);
  };
  const openDatePicker = () => {
    if (dateRef.current && typeof dateRef.current.showPicker === 'function') {
      try { dateRef.current.showPicker(); } catch {}
    }
  };
  const goPrevMonth = () => setViewStartIdx(i => i - 28);
  const goNextMonth = () => setViewStartIdx(i => i + 28);
  const goToday = () => { setViewStartIdx(0); setJumpDate(''); };

  const applyBulkRate = () => {
    const v = +bulkVal;
    if (!v) return;
    setOverrides(o => {
      const next = { ...o };
      selected.forEach(i => { next[`${selectedType}:${i}`] = { rate: v, closed: false }; });
      return next;
    });
    setBulkVal(''); setShowBulkSheet(null);
  };
  const applyBlock = () => {
    setOverrides(o => {
      const next = { ...o };
      selected.forEach(i => { next[`${selectedType}:${i}`] = { ...(next[`${selectedType}:${i}`] || {}), closed: true }; });
      return next;
    });
    setShowBulkSheet(null);
  };
  const applyOpen = () => {
    setOverrides(o => {
      const next = { ...o };
      selected.forEach(i => { delete next[`${selectedType}:${i}`]; });
      return next;
    });
    setShowBulkSheet(null);
  };

  // F2: copy rates from a source room type to the current type with a
  // multiplier (e.g. "Luxury = Deluxe × 1.6"). Snapshot — runs over the
  // currently-visible window so the hotelier can preview before deciding
  // to extend. Only days where the source has a real effective rate get
  // written; closed source days propagate as closed on the target too.
  const [copyState, setCopyState] = useState({ sourceId: null, multiplier: 1.0 });
  const applyCopyFromSource = () => {
    if (!copyState.sourceId || copyState.sourceId === selectedType) return;
    const m = Number(copyState.multiplier) || 1;
    if (m <= 0) return;
    setOverrides(o => {
      const next = { ...o };
      visibleDays.forEach(d => {
        const i = d.idx;
        const sourceOverride = overrides[cellKey(i, copyState.sourceId)];
        if (sourceOverride && sourceOverride.closed) {
          next[cellKey(i)] = { closed: true };
          return;
        }
        const sourceRate = rateFor(copyState.sourceId, i);
        if (sourceRate == null) return;
        next[cellKey(i)] = { rate: Math.round(sourceRate * m), closed: false };
      });
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
              <span className="tnum" style={{ fontSize: 10, color: T.ink3, fontWeight: 600 }}>{Object.keys(overrides).filter(k => k.startsWith(selectedType)).length} overrides</span>
            </div>
          </div>
        </Card>

        {/* Jump to date / month nav. Whole bar is clickable; the native
            input fills it with opacity 0 so the OS date picker pops on
            tap. Same overlay-input pattern as the Diary jump bar. */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 12, alignItems: 'center' }}>
          <button
            onClick={goPrevMonth}
            title="Previous 4 weeks"
            style={{ width: 36, height: 38, borderRadius: 8, border: `1px solid ${T.border}`, background: T.card, color: T.ink2, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
          ><Icon name="arrowL" size={14} stroke={2.2} color={T.ink2} /></button>
          <div
            onClick={openDatePicker}
            style={{ flex: 1, position: 'relative', height: 38, background: jumpDate ? T.primaryLt : T.bgSoft, border: `1px solid ${jumpDate ? T.primary : T.border}`, borderRadius: 8, cursor: 'pointer' }}
          >
            <input
              ref={dateRef}
              type="date"
              value={jumpDate}
              onChange={(e) => handleJumpDate(e.target.value)}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer', border: 'none', padding: 0 }}
            />
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, pointerEvents: 'none', fontSize: 12, fontWeight: 700, color: jumpDate ? T.primaryDk : T.ink2 }}>
              <Icon name="cal" size={13} color={jumpDate ? T.primaryDk : T.ink2} />
              {jumpDate
                ? new Date(jumpDate + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                : 'Jump to date — tap to pick'}
            </div>
          </div>
          {viewStartIdx !== 0 && (
            <button
              onClick={goToday}
              style={{ padding: '0 10px', height: 38, borderRadius: 8, border: `1px solid ${T.primary}`, background: T.primaryLt, color: T.primaryDk, fontSize: 11, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}
            >Today</button>
          )}
          <button
            onClick={goNextMonth}
            title="Next 4 weeks"
            style={{ width: 36, height: 38, borderRadius: 8, border: `1px solid ${T.border}`, background: T.card, color: T.ink2, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
          ><Icon name="chev" size={14} stroke={2.2} color={T.ink2} /></button>
        </div>

        <SectionHead title={t('dailyRate')} action={
          <div style={{ display: 'inline-flex', gap: 12 }}>
            {ROOM_TYPES.length > 1 && (
              <button
                onClick={() => { setCopyState({ sourceId: ROOM_TYPES.find(r => r.id !== selectedType)?.id, multiplier: 1.0 }); setShowBulkSheet('copy'); }}
                style={{ background: 'none', border: 'none', color: T.indigo, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
              >Copy from…</button>
            )}
            {selCount > 0
              ? <button onClick={() => setSelected(new Set())} style={{ background: 'none', border: 'none', color: T.primary, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>{t('clearSelection')}</button>
              : <button onClick={() => setSelected(new Set(visibleDays.map(d => d.idx)))} style={{ background: 'none', border: 'none', color: T.primary, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>{t('selectAll')}</button>
            }
          </div>
        } />
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
              const isSel = selected.has(i);
              const inDrag = inDragRange(i);
              const isOverride = !!overrides[cellKey(i)];
              const isFirstOfMonth = d.dom === 1;
              return (
                <div
                  key={i}
                  onMouseDown={(e) => { e.preventDefault(); onCellDown(i); }}
                  onMouseEnter={() => onCellEnter(i)}
                  onTouchStart={() => onCellDown(i)}
                  style={{
                    aspectRatio: '1 / 1.1', borderRadius: 7, padding: 3,
                    background: closed ? 'oklch(94% 0.04 25)' : (isSel || inDrag) ? T.primaryLt : (d.isToday ? `color-mix(in oklch, ${T.primary} 7%, white)` : T.card),
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
                  <div className="tnum" style={{ fontSize: 11, fontWeight: 700, color: d.isWknd ? T.primary : T.ink, lineHeight: 1 }}>
                    {d.dom}
                    {isFirstOfMonth && <span style={{ fontSize: 7, fontWeight: 700, color: T.ink3, marginLeft: 2 }}>{d.monthShort}</span>}
                  </div>
                  {closed ? (
                    <div style={{ fontSize: 8, fontWeight: 800, color: T.danger, letterSpacing: 0.3, lineHeight: 1 }}>X</div>
                  ) : (
                    <div className="tnum" style={{ fontSize: 8, fontWeight: 700, color: isOverride ? T.indigo : T.ink2, lineHeight: 1 }}>
                      ₹{Math.round(rate/100)/10}k
                    </div>
                  )}
                  {isSel && <div style={{ position: 'absolute', top: 2, right: 2, width: 5, height: 5, borderRadius: 3, background: T.primary }} />}
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${T.borderSoft}`, fontSize: 9, color: T.ink3, fontWeight: 600, flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><span style={{ width: 7, height: 7, border: `1.5px solid ${T.indigo}`, borderRadius: 2 }} /> {t('overrideRate')}</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><span style={{ width: 7, height: 7, border: `1.5px solid ${T.danger}`, borderRadius: 2 }} /> {t('closed')}</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><span style={{ width: 7, height: 7, background: T.primary, borderRadius: 2 }} /> Sat/Sun</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><span style={{ width: 7, height: 7, border: `1.5px solid ${T.primary}`, borderRadius: 2, background: `color-mix(in oklch, ${T.primary} 7%, white)` }} /> Today</span>
          </div>
        </Card>

      </div>

      {selCount > 0 && (
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
          <button onClick={() => setShowBulkSheet('block')} style={bulkBtn(T.danger)}><Icon name="x" size={12} stroke={2.4}/> {t('closeOut')}</button>
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
            {showBulkSheet === 'block' && (
              <>
                <div style={{ fontSize: 15, fontWeight: 700, color: T.ink, marginBottom: 4 }}>{t('closeOut')}</div>
                <div style={{ fontSize: 12, color: T.ink2, marginBottom: 14, lineHeight: 1.4 }}>Close {selCount} dates for {rt.name}. No new bookings (direct or OTA) will be accepted.</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Btn variant="ghost" full onClick={applyOpen}>{t('openDates')}</Btn>
                  <Btn full style={{ background: T.danger, borderColor: T.danger }} onClick={applyBlock}>{t('closeOut')}</Btn>
                </div>
              </>
            )}
            {showBulkSheet === 'copy' && (() => {
              const sourceRT = ROOM_TYPES.find(r => r.id === copyState.sourceId);
              const m = Number(copyState.multiplier) || 1;
              const sampleSource = sourceRT ? rateFor(sourceRT.id, viewStartIdx) : null;
              const samplePreview = sampleSource != null ? Math.round(sampleSource * m) : null;
              return (
                <>
                  <div style={{ fontSize: 15, fontWeight: 700, color: T.ink, marginBottom: 4 }}>Copy rates from another type</div>
                  <div style={{ fontSize: 11, color: T.ink3, marginBottom: 14, lineHeight: 1.4 }}>
                    Copies {visibleDays.length} days of rates from the source to <strong>{rt.name}</strong> with a multiplier. Closed days propagate as closed. Per-day overrides on the target are replaced.
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
                  {sampleSource != null && samplePreview != null && (
                    <div style={{ padding: '8px 10px', background: T.bgSoft, border: `1px solid ${T.borderSoft}`, borderRadius: 7, fontSize: 11, color: T.ink2, marginBottom: 14, lineHeight: 1.4 }}>
                      <strong>Preview:</strong> {sourceRT?.name} ₹{sampleSource.toLocaleString('en-IN')} × {m} = <strong style={{ color: T.primaryDk }}>₹{samplePreview.toLocaleString('en-IN')}</strong> on {visibleDays[0]?.dom} {visibleDays[0]?.monthShort}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Btn variant="ghost" full onClick={() => setShowBulkSheet(null)}>{t('cancel')}</Btn>
                    <Btn full onClick={applyCopyFromSource} disabled={!copyState.sourceId}>Copy {visibleDays.length} days</Btn>
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

import { useState, useMemo } from 'react';
import { T } from '../tokens.js';
import { effectiveRoomTypes, ANCHOR } from '../data.js';
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

export default function Rates({ go, t, lang, overrides: overridesProp, setOverrides: setOverridesProp, property }) {
  const ROOM_TYPES = effectiveRoomTypes(property);
  const [selectedType, setSelectedType] = useState(() => ROOM_TYPES[0]?.id || 'dlx');
  const [selected, setSelected] = useState(new Set([2, 3]));
  const [dragStart, setDragStart] = useState(null);
  const [dragEnd, setDragEnd] = useState(null);
  const [localOverrides, setLocalOverrides] = useState({});
  const overrides = overridesProp !== undefined ? overridesProp : localOverrides;
  const setOverrides = setOverridesProp || setLocalOverrides;
  const [showBulkSheet, setShowBulkSheet] = useState(null);
  const [bulkVal, setBulkVal] = useState('');

  const rt = ROOM_TYPES.find(r => r.id === selectedType);

  const days = useMemo(() => {
    const out = [];
    for (let i = 0; i < 30; i++) {
      const d = new Date(ANCHOR);
      d.setDate(d.getDate() + i);
      out.push({
        idx: i, dom: d.getDate(),
        dow: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()],
        isWknd: d.getDay() === 5 || d.getDay() === 6,
      });
    }
    return out;
  }, []);

  const cellKey = (i) => `${selectedType}:${i}`;
  const getRate = (i) => {
    const o = overrides[cellKey(i)];
    if (o && o.closed) return null;
    if (o && o.rate != null) return o.rate;
    return Math.round(rt.base * (days[i].isWknd ? 1.2 : 1));
  };
  const isClosed = (i) => !!overrides[cellKey(i)]?.closed;

  const onCellDown = (i) => { setDragStart(i); setDragEnd(i); };
  const onCellEnter = (i) => { if (dragStart != null) setDragEnd(i); };
  const onCellUp = () => {
    if (dragStart != null && dragEnd != null) {
      const a = Math.min(dragStart, dragEnd), b = Math.max(dragStart, dragEnd);
      const next = new Set(selected);
      for (let i = a; i <= b; i++) next.add(i);
      setSelected(next);
    }
    setDragStart(null); setDragEnd(null);
  };
  const toggleCell = (i) => {
    const next = new Set(selected);
    if (next.has(i)) next.delete(i); else next.add(i);
    setSelected(next);
  };
  const inDragRange = (i) => {
    if (dragStart == null || dragEnd == null) return false;
    const a = Math.min(dragStart, dragEnd), b = Math.max(dragStart, dragEnd);
    return i >= a && i <= b;
  };

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
              <div style={{ fontSize: 11, color: T.ink3, marginTop: 2 }}>{rt.units} {t('units')} · weekend +20%</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
              <Chip color="ok" icon="sync" style={{ fontSize: 9 }}>{t('synced')}</Chip>
              <span className="tnum" style={{ fontSize: 10, color: T.ink3, fontWeight: 600 }}>{Object.keys(overrides).filter(k => k.startsWith(selectedType)).length} overrides</span>
            </div>
          </div>
        </Card>

        <SectionHead title={t('dailyRate')} action={
          selCount > 0
            ? <button onClick={() => setSelected(new Set())} style={{ background: 'none', border: 'none', color: T.primary, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>{t('clearSelection')}</button>
            : <button onClick={() => setSelected(new Set(days.map(d => d.idx)))} style={{ background: 'none', border: 'none', color: T.primary, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>{t('selectAll')}</button>
        } />
        <Card padding={10}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 6 }}>
            {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => (
              <div key={d} style={{ textAlign: 'center', fontSize: 9, fontWeight: 700, color: T.ink3, letterSpacing: 0.3 }}>{d}</div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
            {days.map(d => {
              const i = d.idx;
              const rate = getRate(i);
              const closed = isClosed(i);
              const isSel = selected.has(i);
              const inDrag = inDragRange(i);
              const isOverride = !!overrides[cellKey(i)];
              return (
                <div
                  key={i}
                  onMouseDown={(e) => { e.preventDefault(); onCellDown(i); }}
                  onMouseEnter={() => onCellEnter(i)}
                  onTouchStart={() => onCellDown(i)}
                  onClick={() => { if (dragStart == null || dragStart === dragEnd) toggleCell(i); }}
                  style={{
                    aspectRatio: '1 / 1.1', borderRadius: 7, padding: 3,
                    background: closed ? 'oklch(94% 0.04 25)' : (isSel || inDrag) ? T.primaryLt : T.card,
                    border: `1.5px solid ${(isSel || inDrag) ? T.primary : closed ? T.danger : isOverride ? T.indigo : T.borderSoft}`,
                    cursor: 'pointer', position: 'relative', userSelect: 'none',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between',
                  }}
                >
                  <div className="tnum" style={{ fontSize: 11, fontWeight: 700, color: d.isWknd ? T.primary : T.ink, lineHeight: 1 }}>{d.dom}</div>
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
          <div style={{ display: 'flex', gap: 10, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${T.borderSoft}`, fontSize: 9, color: T.ink3, fontWeight: 600 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><span style={{ width: 7, height: 7, border: `1.5px solid ${T.indigo}`, borderRadius: 2 }} /> {t('overrideRate')}</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><span style={{ width: 7, height: 7, border: `1.5px solid ${T.danger}`, borderRadius: 2 }} /> {t('closed')}</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><span style={{ width: 7, height: 7, background: T.primary, borderRadius: 2 }} /> Weekend</span>
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
          </div>
        </div>
      )}
    </div>
  );
}

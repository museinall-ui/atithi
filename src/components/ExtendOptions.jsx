import { useState } from 'react';
import { T } from '../tokens.js';

// Compact extend-hold UI: 3 preset buttons + a "Custom" toggle that reveals
// a number-plus-unit input. Used inside the BookingDetail tentative banner
// and inside each row of the Dashboard auto-release card. `colors` lets the
// host adapt the chip colours to the surrounding warning palette.
export default function ExtendOptions({ onExtend, colors, hi = false }) {
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState('');
  const [unit, setUnit] = useState('h'); // 'h' or 'd'
  const c = colors || { border: 'oklch(75% 0.10 75)', text: 'oklch(40% 0.14 75)' };
  const submit = () => {
    const n = Math.max(0, +val || 0);
    if (n <= 0) return;
    onExtend(unit === 'h' ? n : n * 24);
    setVal(''); setOpen(false);
  };
  const stop = (e) => e.stopPropagation();
  const btnStyle = {
    padding: '5px 10px', borderRadius: 7,
    border: `1px solid ${c.border}`,
    background: T.card, color: c.text,
    fontSize: 11, fontWeight: 700, cursor: 'pointer',
    whiteSpace: 'nowrap',
  };
  const presets = [
    { label: hi ? '+ 2 घंटे'  : '+ 2 hours', hours: 2 },
    { label: hi ? '+ 1 दिन'   : '+ 1 day',   hours: 24 },
    { label: hi ? '+ 2 दिन'   : '+ 2 days',  hours: 48 },
  ];
  return (
    <>
      <div onClick={stop} style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: c.text, letterSpacing: 0.3 }}>
          {hi ? 'और समय दें' : 'EXTEND BY'}
        </span>
        {presets.map(opt => (
          <button
            key={opt.hours}
            onClick={(e) => { stop(e); onExtend(opt.hours); }}
            className="atithi-tap"
            style={btnStyle}
          >{opt.label}</button>
        ))}
        <button
          onClick={(e) => { stop(e); setOpen(o => !o); }}
          className="atithi-tap"
          style={{ ...btnStyle, borderStyle: open ? 'solid' : 'dashed' }}
        >
          {open ? (hi ? 'रद्द' : 'Cancel') : (hi ? 'अपना समय…' : 'Custom…')}
        </button>
      </div>
      {open && (
        <div onClick={stop} style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="number" min="1" autoFocus
            value={val}
            onChange={e => setVal(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') submit(); }}
            placeholder={hi ? 'जैसे 6' : 'e.g. 6'}
            className="tnum"
            style={{
              width: 70, padding: '6px 8px', borderRadius: 7,
              border: `1px solid ${c.border}`, background: T.card, color: T.ink,
              fontSize: 13, fontWeight: 700, outline: 'none',
            }}
          />
          <div style={{ display: 'inline-flex', borderRadius: 7, border: `1px solid ${c.border}`, overflow: 'hidden' }}>
            {[
              { id: 'h', label: hi ? 'घंटे' : 'hours' },
              { id: 'd', label: hi ? 'दिन'  : 'days' },
            ].map(u => (
              <button
                key={u.id}
                onClick={(e) => { stop(e); setUnit(u.id); }}
                style={{
                  padding: '5px 10px', border: 'none', cursor: 'pointer',
                  background: unit === u.id ? c.text : T.card,
                  color: unit === u.id ? '#fff' : c.text,
                  fontSize: 11, fontWeight: 700,
                }}
              >{u.label}</button>
            ))}
          </div>
          <button
            onClick={(e) => { stop(e); submit(); }}
            className="atithi-tap"
            style={{
              padding: '6px 12px', borderRadius: 7, border: 'none',
              background: c.text, color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer',
            }}
          >{hi ? 'जोड़ें' : 'Add'}</button>
        </div>
      )}
    </>
  );
}

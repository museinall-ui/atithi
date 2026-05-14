import { useState, useMemo } from 'react';
import { T } from '../tokens.js';
import { ROOM_TYPES, EXTRAS_DEFAULT, COUNTRIES } from '../data.js';
import Icon from '../components/Icon.jsx';
import Btn from '../components/Btn.jsx';
import Chip from '../components/Chip.jsx';
import Field from '../components/Field.jsx';
import Card from '../components/Card.jsx';
import Toggle from '../components/Toggle.jsx';
import ScreenHeader from '../components/ScreenHeader.jsx';
import Row from '../components/Row.jsx';

const stepBtn = {
  width: 32, height: 32, borderRadius: 16, border: `1px solid ${T.border}`,
  background: T.card, color: T.ink, fontSize: 18, fontWeight: 600, cursor: 'pointer', lineHeight: 1,
};

const miniStepBtn = {
  width: 28, height: 28, borderRadius: 14, border: `1px solid ${T.border}`,
  background: T.card, color: T.ink, fontSize: 15, fontWeight: 700, cursor: 'pointer', lineHeight: 1,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
};

function MiniStep({ label, value, onChange }) {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, background: T.card, border: `1px solid ${T.borderSoft}`, borderRadius: 8, padding: '4px 6px 4px 10px' }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: T.ink2 }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <button onClick={() => onChange(value - 1)} style={{ width: 24, height: 24, borderRadius: 12, border: `1px solid ${T.border}`, background: T.bgSoft, color: T.ink, fontSize: 14, fontWeight: 700, cursor: 'pointer', lineHeight: 1 }}>−</button>
        <span className="tnum" style={{ fontSize: 13, fontWeight: 700, minWidth: 14, textAlign: 'center', color: T.ink }}>{value}</span>
        <button onClick={() => onChange(value + 1)} style={{ width: 24, height: 24, borderRadius: 12, border: `1px solid ${T.border}`, background: T.bgSoft, color: T.ink, fontSize: 14, fontWeight: 700, cursor: 'pointer', lineHeight: 1 }}>+</button>
      </div>
    </div>
  );
}

function IDOption({ icon, label, sub, selected }) {
  return (
    <button style={{
      flex: 1, padding: '12px 8px', borderRadius: 10,
      border: selected ? `1.5px solid ${T.primary}` : `1px solid ${T.border}`,
      background: selected ? T.primaryLt : T.card,
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, cursor: 'pointer',
    }}>
      <Icon name={icon} size={20} color={selected ? T.primaryDk : T.ink2} />
      <span style={{ fontSize: 12, fontWeight: 700, color: selected ? T.primaryDk : T.ink }}>{label}</span>
      <span style={{ fontSize: 9, color: T.ink3, fontWeight: 500 }}>{sub}</span>
    </button>
  );
}

function FakeQR() {
  const cells = [];
  for (let y = 0; y < 13; y++) for (let x = 0; x < 13; x++) {
    if ((x < 3 && y < 3) || (x > 9 && y < 3) || (x < 3 && y > 9)) continue;
    const cell = ((x * 7 + y * 13) ^ 73) % 3 < 2 ? <rect key={`${x}-${y}`} x={x*8} y={y*8} width="7" height="7" fill="#1a1a1a"/> : null;
    cells.push(cell);
  }
  return (
    <svg width="110" height="110" viewBox="0 0 104 104">
      {[[0,0],[80,0],[0,80]].map(([x,y]) => (
        <g key={`${x}-${y}`}>
          <rect x={x} y={y} width="22" height="22" fill="#1a1a1a"/>
          <rect x={x+3} y={y+3} width="16" height="16" fill="#fff"/>
          <rect x={x+6} y={y+6} width="10" height="10" fill="#1a1a1a"/>
        </g>
      ))}
      {cells}
    </svg>
  );
}

function PayMethod({ icon, label, sub, selected, onClick }) {
  return (
    <button onClick={onClick} className="atithi-tap" style={{
      padding: '12px', borderRadius: 10,
      border: selected ? `1.5px solid ${T.primary}` : `1px solid ${T.border}`,
      background: selected ? T.primaryLt : T.card,
      display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', textAlign: 'left',
    }}>
      <Icon name={icon} size={18} color={selected ? T.primaryDk : T.ink2} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: selected ? T.primaryDk : T.ink }}>{label}</div>
        <div style={{ fontSize: 9, color: T.ink3, fontWeight: 500 }}>{sub}</div>
      </div>
    </button>
  );
}

function StepDates({ data, set, t }) {
  const data_rooms = data.roomItems.length;
  const data_adults = data.roomItems.reduce((s, r) => s + r.adults, 0);
  const data_children = data.roomItems.reduce((s, r) => s + r.children, 0);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <Card padding={16}>
        <div style={{ fontSize: 12, fontWeight: 700, color: T.ink2, marginBottom: 12, letterSpacing: 0.2 }}>{t('when')}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 88px', gap: 10 }}>
          <Field label={t('checkIn')} value={data.checkIn} onChange={(e) => set('checkIn', e.target.value)} suffix={<Icon name="cal" size={16} color={T.ink3} />} />
          <Field label={t('nights')} value={data.nights} onChange={(e) => set('nights', +e.target.value || 1)} type="number" />
        </div>
        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: T.ink3 }}>
          <Icon name="info" size={13} />
          {t('checkOut')} · {String(4 + data.nights).padStart(2, '0')} May, 11:00 AM
        </div>
      </Card>

      <Card padding={16}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.ink2, letterSpacing: 0.2 }}>{t('roomsGuests')}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button onClick={() => data_rooms > 1 && set('roomItems', data.roomItems.slice(0, -1))} disabled={data_rooms <= 1} style={{ ...stepBtn, opacity: data_rooms <= 1 ? 0.4 : 1 }}>−</button>
            <span className="tnum" style={{ fontSize: 13, fontWeight: 700, minWidth: 56, textAlign: 'center', color: T.ink }}>{data_rooms} room{data_rooms > 1 ? 's' : ''}</span>
            <button onClick={() => set('roomItems', [...data.roomItems, { adults: 2, children: 0, rate: null }])} style={stepBtn}>+</button>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {data.roomItems.map((r, idx) => (
            <div key={idx} style={{ padding: 10, background: T.bgSoft, borderRadius: 10, border: `1px solid ${T.borderSoft}` }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.ink }}>Room {idx + 1}</div>
                {data_rooms > 1 && (
                  <button onClick={() => set('roomItems', data.roomItems.filter((_, i) => i !== idx))} style={{ background: 'none', border: 'none', color: T.ink3, cursor: 'pointer', padding: 2 }}>
                    <Icon name="x" size={12} />
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <MiniStep label={t('adults')} value={r.adults} onChange={(v) => set('roomItems', data.roomItems.map((x, i) => i === idx ? { ...x, adults: Math.max(1, v) } : x))} />
                <MiniStep label={t('children')} value={r.children} onChange={(v) => set('roomItems', data.roomItems.map((x, i) => i === idx ? { ...x, children: Math.max(0, v) } : x))} />
              </div>
            </div>
          ))}
        </div>
        {data_rooms > 1 && (
          <div style={{ marginTop: 10, padding: '8px 10px', background: T.primaryLt, borderRadius: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="info" size={12} color={T.primaryDk} />
            <span style={{ fontSize: 11, color: T.primaryDk, fontWeight: 600 }} className="tnum">{data_rooms} units · {data_adults}A {data_children > 0 ? `${data_children}C · ` : ''}same folio</span>
          </div>
        )}
      </Card>

      <Card padding={16} style={{ borderColor: T.warnLt, background: 'oklch(98% 0.018 75)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: T.warnLt, flexShrink: 0, color: 'oklch(48% 0.14 75)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="clock" size={18} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.ink, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>{t('blockRelease')}</span>
              <Toggle on={data.hold} onChange={(v) => set('hold', v)} />
            </div>
            <div style={{ fontSize: 12, color: T.ink3, marginTop: 4, lineHeight: 1.45 }}>
              Hold for {data.holdHours}h. Auto-frees inventory if guest doesn't pay or reply.
            </div>
            {data.hold && (
              <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                {[2, 4, 12, 24].map(h => (
                  <button key={h} onClick={() => set('holdHours', h)} className="atithi-tap" style={{
                    flex: 1, padding: '8px 0', borderRadius: 8,
                    border: data.holdHours === h ? `1.5px solid ${T.primary}` : `1px solid ${T.border}`,
                    background: data.holdHours === h ? T.primaryLt : T.card,
                    color: data.holdHours === h ? T.primaryDk : T.ink2,
                    fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  }}>{h}h</button>
                ))}
              </div>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

function nightDateLabel(nightIdx) {
  const d = new Date(2026, 4, 4 + nightIdx);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

function StepRoom({ data, set, t, baseRate, rateForNight }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 12, color: T.ink3, marginBottom: 4 }}>
        For {data.roomItems.reduce((s,r)=>s+r.adults,0)}A{data.roomItems.reduce((s,r)=>s+r.children,0) > 0 && ` ${data.roomItems.reduce((s,r)=>s+r.children,0)}C`} · {data.roomItems.length} room{data.roomItems.length > 1 ? 's' : ''} · {data.nights} night{data.nights > 1 ? 's' : ''}
      </div>
      {ROOM_TYPES.map(rt => {
        const selected = data.roomTypeId === rt.id;
        const tagColor = T[rt.tag];
        return (
          <Card key={rt.id} padding={0} style={{
            cursor: 'pointer', overflow: 'hidden',
            borderColor: selected ? T.primary : T.borderSoft,
            borderWidth: selected ? 2 : 1,
            boxShadow: selected ? `0 0 0 4px ${T.primaryLt}` : 'none',
          }}>
            <div onClick={() => { if (!selected) { set('roomTypeId', rt.id); set('roomItems', data.roomItems.map(r => ({ ...r, rate: null }))); } }} style={{ display: 'flex', gap: 0 }}>
              <div style={{
                width: 88, alignSelf: 'stretch', flexShrink: 0,
                background: `repeating-linear-gradient(135deg, ${tagColor} 0 8px, color-mix(in oklch, ${tagColor} 70%, white) 8px 16px)`,
                position: 'relative',
              }}>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: T.mono, fontSize: 9, color: 'rgba(0,0,0,0.4)', fontWeight: 600, textAlign: 'center', padding: 8 }}>
                  {rt.id}.jpg
                </div>
              </div>
              <div style={{ flex: 1, padding: 14, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>{rt.name}</div>
                    <div style={{ fontSize: 11, color: T.ink3, marginTop: 2 }} className="tnum">{rt.units - 2} of {rt.units} available</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="tnum" style={{ fontSize: 15, fontWeight: 700, color: T.ink }}>₹{rt.base.toLocaleString('en-IN')}</div>
                    <div style={{ fontSize: 10, color: T.ink3, fontWeight: 600 }}>{t('perNight')}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 5, marginTop: 8, flexWrap: 'wrap' }}>
                  {(rt.id === 'pool' ? ['Pvt pool', 'AC', 'Kitchenette'] :
                    rt.id === 'btub' ? ['Bathtub', 'AC', 'Balcony'] :
                    rt.id === 'lux' ? ['AC', 'Heater'] :
                    ['Fan', 'Bonfire']).map(a => (
                    <span key={a} style={{ fontSize: 10, color: T.ink3, padding: '2px 7px', borderRadius: 4, background: T.bgSoft, fontWeight: 600 }}>{a}</span>
                  ))}
                </div>
              </div>
              {selected && (
                <div style={{ width: 36, alignSelf: 'stretch', display: 'flex', alignItems: 'center', justifyContent: 'center', background: T.primary, color: '#fff' }}>
                  <Icon name="check" size={18} stroke={2.5} />
                </div>
              )}
            </div>
            {selected && (
              <div style={{ padding: '10px 14px 12px', borderTop: `1px dashed ${T.border}`, background: T.bgSoft, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {data.roomItems.map((r, idx) => {
                  const defaultNightRates = Array.from({ length: data.nights }, (_, n) => rateForNight(rt.id, n));
                  const uniformDefault = r.rate != null ? r.rate : defaultNightRates[0] || rt.base;
                  const perNight = !!r.perNight && data.nights > 1;
                  const nightRates = (r.nightRates && r.nightRates.length === data.nights)
                    ? r.nightRates
                    : Array.from({ length: data.nights }, () => uniformDefault);
                  const overridden = r.rate != null && r.rate !== rt.base;
                  const itemTotal = perNight
                    ? nightRates.reduce((s, v) => s + (+v || 0), 0)
                    : uniformDefault * data.nights;
                  const togglePerNight = () => {
                    if (perNight) {
                      set('roomItems', data.roomItems.map((x, i) => i === idx ? { ...x, perNight: false, nightRates: undefined } : x));
                    } else {
                      set('roomItems', data.roomItems.map((x, i) => i === idx ? { ...x, perNight: true, nightRates: Array.from({ length: data.nights }, (_, n) => x.nightRates?.[n] != null ? x.nightRates[n] : (x.rate != null ? x.rate : defaultNightRates[n] || rt.base)) } : x));
                    }
                  };
                  return (
                    <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: T.ink2, minWidth: 52 }}>R{idx+1} · {r.adults}A{r.children>0?` ${r.children}C`:''}</div>
                        {!perNight && (
                          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 4, background: T.card, border: `1px solid ${overridden ? T.primary : T.border}`, borderRadius: 7, padding: '0 8px', height: 32 }}>
                            <span style={{ fontSize: 12, color: T.ink3, fontWeight: 600 }}>₹</span>
                            <input type="number" value={uniformDefault} onChange={(e) => set('roomItems', data.roomItems.map((x, i) => i === idx ? { ...x, rate: +e.target.value || 0 } : x))} className="tnum" style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 13, fontWeight: 700, color: overridden ? T.primary : T.ink, minWidth: 0 }} />
                            <span style={{ fontSize: 9, color: T.ink3 }}>/night</span>
                          </div>
                        )}
                        {perNight && (
                          <div style={{ flex: 1, fontSize: 11, color: T.ink3, fontWeight: 600 }}>Per-night rates below</div>
                        )}
                        <span className="tnum" style={{ fontSize: 11, fontWeight: 700, color: T.ink, minWidth: 64, textAlign: 'right' }}>₹{itemTotal.toLocaleString('en-IN')}</span>
                      </div>

                      {data.nights > 1 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <button onClick={togglePerNight} className="atithi-tap" style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                            padding: '4px 9px', borderRadius: 999, cursor: 'pointer',
                            background: perNight ? T.primaryLt : T.card,
                            color: perNight ? T.primaryDk : T.ink3,
                            border: `1px solid ${perNight ? T.primary : T.border}`,
                            fontSize: 10, fontWeight: 700, letterSpacing: 0.1,
                          }}>
                            <Icon name={perNight ? 'check' : 'plus'} size={9} stroke={2.4} />
                            Different rate each night
                          </button>
                          {perNight && (
                            <button onClick={() => {
                              set('roomItems', data.roomItems.map((x, i) => i === idx ? { ...x, nightRates: Array.from({ length: data.nights }, (_, n) => defaultNightRates[n] || rt.base) } : x));
                            }} style={{ background: 'none', border: 'none', color: T.ink3, fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>Reset to default</button>
                          )}
                        </div>
                      )}

                      {perNight && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6, padding: 8, background: T.card, borderRadius: 8, border: `1px dashed ${T.border}` }}>
                          {nightRates.map((rate, ni) => (
                            <div key={ni} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                              <span style={{ fontSize: 9, fontWeight: 700, color: T.ink3, letterSpacing: 0.3 }}>NIGHT {ni + 1} · {nightDateLabel(ni)}</span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: T.bgSoft, border: `1px solid ${T.border}`, borderRadius: 6, padding: '0 8px', height: 30 }}>
                                <span style={{ fontSize: 11, color: T.ink3, fontWeight: 600 }}>₹</span>
                                <input
                                  type="number"
                                  value={rate}
                                  onChange={(e) => {
                                    const v = +e.target.value || 0;
                                    set('roomItems', data.roomItems.map((x, i) => i === idx ? { ...x, nightRates: nightRates.map((nr, k) => k === ni ? v : nr) } : x));
                                  }}
                                  className="tnum"
                                  style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 12, fontWeight: 700, color: T.ink, minWidth: 0 }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2, paddingTop: 8, borderTop: `1px dashed ${T.border}` }}>
                  <span style={{ fontSize: 11, color: T.ink2, fontWeight: 600 }}>Rooms subtotal</span>
                  <span className="tnum" style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>
                    ₹{data.roomItems.reduce((sum, x) => {
                      if (x.perNight && x.nightRates && x.nightRates.length === data.nights) {
                        return sum + x.nightRates.reduce((s, v) => s + (+v || 0), 0);
                      }
                      const fallback = x.rate != null ? x.rate : (rateForNight(rt.id, 0) || rt.base);
                      return sum + fallback * data.nights;
                    }, 0).toLocaleString('en-IN')}
                  </span>
                </div>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

function StepGuest({ data, set, t, plan, allExtras, onRemoveSavedExtra }) {
  const isForeign = data.country !== 'IN';
  const supportsGst = plan === 'gst';
  const [showAdd, setShowAdd] = useState(false);
  const [newEx, setNewEx] = useState({ label: '', price: '' });
  const [editingPriceId, setEditingPriceId] = useState(null);
  const country = COUNTRIES.find(c => c.code === data.country) || COUNTRIES[0];

  const addCustom = () => {
    if (!newEx.label.trim() || !newEx.price) return;
    const id = 'cx_' + Date.now();
    const ex = { id, label: newEx.label.trim(), sub: 'Custom', price: +newEx.price, icon: 'plus', custom: true };
    set('customExtras', [...(data.customExtras || []), ex]);
    set('extras', { ...data.extras, [id]: 1 });
    setNewEx({ label: '', price: '' }); setShowAdd(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Card padding={16}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.ink2, letterSpacing: 0.2 }}>LEAD GUEST</div>
          <button style={{ background: 'none', border: 'none', color: T.primary, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            <Icon name="search" size={11} /> Find existing
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Field label="Full name" value={data.name} onChange={(e) => set('name', e.target.value)} placeholder="As on ID (required)" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: T.ink2, letterSpacing: 0.1 }}>Country</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: T.bgSunk, border: `1px solid ${T.borderSoft}`, borderRadius: 10, padding: '0 12px', height: 44 }}>
              <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0 }}>{country.flag}</span>
              <select
                value={data.country}
                onChange={(e) => set('country', e.target.value)}
                style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 15, fontWeight: 500, color: T.ink, appearance: 'none', cursor: 'pointer' }}
              >
                {COUNTRIES.map(c => (
                  <option key={c.code} value={c.code}>{c.name} ({c.dial})</option>
                ))}
              </select>
              <Icon name="chevD" size={14} color={T.ink3} />
            </div>
            {isForeign && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', background: T.indigoLt, borderRadius: 8 }}>
                <Icon name="flag" size={11} color={T.indigo} />
                <span style={{ fontSize: 11, color: T.indigo, fontWeight: 700 }}>Foreign national · Form C will be auto-filed with FRRO</span>
              </div>
            )}
          </div>
          <Field label="Mobile" value={data.phone} onChange={(e) => set('phone', e.target.value)} prefix={country.dial} placeholder="98100 00000 (required)" />
          <Field label="Email (optional)" value={data.email} onChange={(e) => set('email', e.target.value)} placeholder="guest@email.com" />
          {(!data.name.trim() || data.phone.trim().length < 6) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: T.warnLt, borderRadius: 8 }}>
              <Icon name="info" size={11} color="oklch(48% 0.14 75)" />
              <span style={{ fontSize: 11, color: 'oklch(40% 0.14 75)', fontWeight: 600 }}>Name and mobile are required to confirm a booking.</span>
            </div>
          )}
        </div>
      </Card>

      <Card padding={16}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.ink2, letterSpacing: 0.2 }}>{t('extras')}</div>
          <button onClick={() => setShowAdd(s => !s)} style={{ background: 'none', border: 'none', color: T.primary, fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Icon name={showAdd ? 'x' : 'plus'} size={11} stroke={2.2} /> {showAdd ? 'Cancel' : 'Add custom'}
          </button>
        </div>
        {showAdd && (
          <div style={{ marginBottom: 10, padding: 8, background: T.primaryLt, borderRadius: 8 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              <input autoFocus placeholder="e.g. Bonfire dinner" value={newEx.label} onChange={e => setNewEx({ ...newEx, label: e.target.value })} style={{ flex: 1, border: `1px solid ${T.border}`, outline: 'none', borderRadius: 6, padding: '6px 8px', fontSize: 12, fontWeight: 600, background: T.card }} />
              <input type="number" placeholder="₹" value={newEx.price} onChange={e => setNewEx({ ...newEx, price: e.target.value })} className="tnum" style={{ width: 64, border: `1px solid ${T.border}`, outline: 'none', borderRadius: 6, padding: '6px 8px', fontSize: 12, fontWeight: 700, background: T.card }} />
              <button onClick={addCustom} style={{ border: 'none', background: T.primary, color: '#fff', borderRadius: 6, padding: '0 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Add</button>
            </div>
            <div style={{ marginTop: 6, fontSize: 10, color: T.primaryDk, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
              <Icon name="info" size={10} stroke={2.2} /> Saved for future bookings so you don't have to retype it.
            </div>
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {allExtras.map(ex => {
            const qty = data.extras[ex.id] || 0;
            const isEditingPrice = editingPriceId === ex.id;
            return (
              <div key={ex.id} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: 10, borderRadius: 10,
                background: qty > 0 ? T.primaryLt : T.bgSoft,
                border: `1px solid ${qty > 0 ? T.primary : 'transparent'}`,
              }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: qty > 0 ? T.card : T.bgSunk, color: qty > 0 ? T.primary : T.ink3, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon name={ex.icon} size={15} stroke={2} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.ink, display: 'flex', alignItems: 'center', gap: 5 }}>
                    {ex.label}
                    {ex.custom && <span style={{ fontSize: 9, fontWeight: 700, color: T.indigo, background: T.indigoLt, padding: '1px 5px', borderRadius: 4, letterSpacing: 0.2 }}>SAVED</span>}
                  </div>
                  {!isEditingPrice ? (
                    <div className="tnum" style={{ fontSize: 11, color: T.ink3, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>{ex.sub} · ₹{ex.price.toLocaleString('en-IN')}</span>
                      <button onClick={() => setEditingPriceId(ex.id)} style={{ background: 'none', border: 'none', color: T.primary, cursor: 'pointer', padding: 0, display: 'inline-flex' }}>
                        <Icon name="edit" size={10} stroke={2.2} />
                      </button>
                      {ex.custom && onRemoveSavedExtra && (
                        <button onClick={() => onRemoveSavedExtra(ex.id)} title="Forget this saved extra" style={{ background: 'none', border: 'none', color: T.ink3, cursor: 'pointer', padding: 0, display: 'inline-flex' }}>
                          <Icon name="trash" size={10} stroke={2.2} />
                        </button>
                      )}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                      <span style={{ fontSize: 11, color: T.ink3, fontWeight: 600 }}>₹</span>
                      <input type="number" autoFocus value={ex.price} onChange={e => set('extraPrices', { ...data.extraPrices, [ex.id]: +e.target.value || 0 })} className="tnum" style={{ width: 60, border: `1px solid ${T.primary}`, outline: 'none', borderRadius: 5, padding: '2px 6px', fontSize: 11, fontWeight: 700, background: T.card, color: T.primary }} />
                      <button onClick={() => setEditingPriceId(null)} style={{ border: 'none', background: T.primary, color: '#fff', borderRadius: 5, padding: '3px 8px', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>OK</button>
                      {!ex.custom && data.extraPrices[ex.id] != null && (
                        <button onClick={() => { const { [ex.id]: _, ...rest } = data.extraPrices; set('extraPrices', rest); setEditingPriceId(null); }} style={{ border: 'none', background: 'none', color: T.ink3, fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>Reset</button>
                      )}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {qty > 0 && <button onClick={() => set('extras', { ...data.extras, [ex.id]: Math.max(0, qty - 1) })} style={miniStepBtn}>−</button>}
                  {qty > 0 && <span className="tnum" style={{ fontSize: 13, fontWeight: 700, minWidth: 16, textAlign: 'center', color: T.ink }}>{qty}</span>}
                  <button onClick={() => set('extras', { ...data.extras, [ex.id]: qty + 1 })} style={qty > 0 ? miniStepBtn : { ...miniStepBtn, background: T.primary, color: '#fff' }}>+</button>
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 14 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: T.ink2, letterSpacing: 0.1, display: 'block', marginBottom: 6 }}>{t('specialNote')}</label>
          <textarea value={data.notes} onChange={(e) => set('notes', e.target.value)} placeholder={t('notePlaceholder')} style={{ width: '100%', minHeight: 64, padding: 12, background: T.bgSunk, border: `1px solid ${T.borderSoft}`, borderRadius: 10, fontSize: 14, fontWeight: 500, color: T.ink, resize: 'vertical', outline: 'none', fontFamily: 'inherit' }} />
        </div>
      </Card>

      <Card padding={14} style={{ background: '#F0FDF4', borderColor: '#BBF7D0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: '#25D366', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon name="wa" size={18} stroke={2} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>Send WhatsApp confirmation</div>
            <div style={{ fontSize: 11, color: T.ink3, marginTop: 2 }}>Auto-template + payment link</div>
          </div>
          <Toggle on={true} onChange={() => {}} />
        </div>
      </Card>

      <Card padding={16}>
        <div style={{ fontSize: 12, fontWeight: 700, color: T.ink2, letterSpacing: 0.2, marginBottom: 12 }}>
          ID PROOF {isForeign && <Chip color="indigo" style={{ marginLeft: 6 }}>Form C required</Chip>}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <IDOption icon="qr" label="Aadhaar" sub="OCR + e-KYC" selected />
          <IDOption icon="flag" label="Passport" sub="Form C auto" />
          <IDOption icon="info" label="Other" sub="DL / Voter" />
        </div>
      </Card>

      {supportsGst && (
        <Card padding={16}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.ink2, letterSpacing: 0.2 }}>BUSINESS GSTIN (OPTIONAL)</div>
            <Toggle on={!!data.gstin} onChange={(v) => set('gstin', v ? '27AABCU' : '')} />
          </div>
          {data.gstin && <Field label="" value={data.gstin} onChange={(e) => set('gstin', e.target.value)} placeholder="29ABCDE1234F1Z5" />}
        </Card>
      )}
    </div>
  );
}

function StepPayment({ data, set, subtotal, gst, total, withTax, roomsSubtotal, extrasTotal, t }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Card padding={16}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.ink2, letterSpacing: 0.2 }}>SUMMARY</div>
          <Chip color={withTax ? 'indigo' : 'soft'} style={{ fontSize: 9 }}>{withTax ? 'GST Pro' : 'No GST'}</Chip>
        </div>
        <Row label={`Tariff · ${data.nights}N × ${data.roomItems.length} room${data.roomItems.length>1?'s':''}`} value={`₹${roomsSubtotal.toLocaleString('en-IN')}`} />
        {extrasTotal > 0 && <Row label={`Extras · ${Object.values(data.extras).reduce((a,b)=>a+b,0)} item(s)`} value={`₹${extrasTotal.toLocaleString('en-IN')}`} />}
        {withTax && <Row label="CGST 6%" value={`₹${(gst/2).toLocaleString('en-IN')}`} />}
        {withTax && <Row label="SGST 6%" value={`₹${(gst/2).toLocaleString('en-IN')}`} />}
        <div style={{ height: 1, background: T.borderSoft, margin: '8px 0' }} />
        <Row label={t('total')} value={`₹${total.toLocaleString('en-IN')}`} bold />
      </Card>

      <Card padding={16}>
        <div style={{ fontSize: 12, fontWeight: 700, color: T.ink2, letterSpacing: 0.2, marginBottom: 12 }}>COLLECT NOW</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 6, marginBottom: 12 }}>
          {[
            { id: 'full',   label: 'Full',   sub: `₹${total.toLocaleString('en-IN')}` },
            { id: 'half',   label: '50%',    sub: `₹${Math.round(total/2).toLocaleString('en-IN')}` },
            { id: 'custom', label: 'Custom', sub: data.payCustom > 0 ? `₹${(+data.payCustom).toLocaleString('en-IN')}` : 'Enter ₹' },
            { id: 'none',   label: 'None',   sub: 'Pay later' },
          ].map(o => (
            <button key={o.id} onClick={() => set('payAmount', o.id)} style={{
              padding: '10px 4px', borderRadius: 10,
              border: data.payAmount === o.id ? `1.5px solid ${T.primary}` : `1px solid ${T.border}`,
              background: data.payAmount === o.id ? T.primaryLt : T.card,
              cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 2,
            }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: data.payAmount === o.id ? T.primaryDk : T.ink }}>{o.label}</span>
              <span className="tnum" style={{ fontSize: 9, color: T.ink3, fontWeight: 600 }}>{o.sub}</span>
            </button>
          ))}
        </div>
        {data.payAmount === 'custom' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, padding: 10, background: T.primaryLt, borderRadius: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: T.primaryDk }}>Custom amount</span>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 4, background: T.card, border: `1.5px solid ${T.primary}`, borderRadius: 7, padding: '0 10px', height: 36 }}>
              <span style={{ fontSize: 13, color: T.ink3, fontWeight: 600 }}>₹</span>
              <input type="number" autoFocus value={data.payCustom || ''} onChange={e => set('payCustom', +e.target.value || 0)} placeholder="0" className="tnum" style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 15, fontWeight: 700, color: T.ink }} />
              <span style={{ fontSize: 10, color: T.ink3 }}>of ₹{total.toLocaleString('en-IN')}</span>
            </div>
          </div>
        )}
        {data.payAmount && data.payAmount !== 'none' && (
          <>
            <div style={{ fontSize: 11, color: T.ink3, fontWeight: 600, marginBottom: 8 }}>METHOD</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <PayMethod icon="qr" label="UPI / QR" sub="Razorpay" selected={data.payMethod === 'upi'} onClick={() => set('payMethod', 'upi')} />
              <PayMethod icon="wa" label="WhatsApp link" sub="Send to guest" selected={data.payMethod === 'wa'} onClick={() => set('payMethod', 'wa')} />
              <PayMethod icon="inr" label="Cash" sub="At reception" selected={data.payMethod === 'cash'} onClick={() => set('payMethod', 'cash')} />
              <PayMethod icon="tag" label="Card" sub="Razorpay POS" selected={data.payMethod === 'card'} onClick={() => set('payMethod', 'card')} />
            </div>
          </>
        )}
      </Card>

      {data.payMethod === 'upi' && (
        <Card padding={20} style={{ background: T.indigoLt, borderColor: T.indigo, alignItems: 'center', textAlign: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 140, height: 140, background: '#fff', borderRadius: 14, padding: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <FakeQR />
            </div>
            <div className="tnum" style={{ fontSize: 11, color: T.ink2, fontWeight: 600 }}>yatradesert@razorpay</div>
            <div style={{ fontSize: 11, color: T.ink3 }}>Show QR to guest · auto-detects payment</div>
          </div>
        </Card>
      )}
    </div>
  );
}

export default function NewBooking({ go, onCreate, plan = 'engine', t, editing, savedCustomExtras = [], onRemoveSavedExtra, rateOverrides = {} }) {
  const isEdit = !!editing;
  const [step, setStep] = useState(1);
  const [data, setData] = useState(() => {
    if (editing) {
      return {
        checkIn: '04 May 2026', nights: editing.nights,
        roomTypeId: editing.roomTypeId,
        roomItems: editing.roomItems || [{ adults: 2, children: 0, rate: null }],
        name: editing.guest, phone: (editing.phone || '').replace(/^\+\d+\s*/, ''), email: '', country: editing.country || 'IN', gstin: '',
        notes: editing.notes || '', source: 'walk-in', hold: false, holdHours: 4,
        payMethod: null, payAmount: 'full', payCustom: 0,
        extras: editing.extras || {}, customExtras: editing.customExtras || [], extraPrices: editing.extraPrices || {},
      };
    }
    return {
      checkIn: '04 May 2026', nights: 2,
      roomTypeId: null,
      roomItems: [{ adults: 2, children: 0, rate: null }],
      name: '', phone: '', email: '', country: 'IN', gstin: '',
      notes: '', source: 'walk-in', hold: false, holdHours: 4,
      payMethod: null, payAmount: 0, payCustom: 0,
      extras: {}, customExtras: [], extraPrices: {},
    };
  });

  const set = (k, v) => setData(d => ({ ...d, [k]: v }));
  const rt = ROOM_TYPES.find(r => r.id === data.roomTypeId);
  const withTax = plan === 'gst';
  const baseRate = rt ? rt.base : 0;

  // Rate per night: respects overrides set in Rates screen + weekend factor.
  const rateForNight = useMemo(() => (roomTypeId, nightIdx) => {
    const room = ROOM_TYPES.find(r => r.id === roomTypeId);
    if (!room) return 0;
    const dayIdx = nightIdx; // bookings start at day 0 in this prototype
    const override = rateOverrides[`${roomTypeId}:${dayIdx}`];
    if (override && override.closed) return room.base; // closed → still show base as fallback
    if (override && override.rate != null) return override.rate;
    const d = new Date(2026, 4, 4 + dayIdx);
    const isWknd = d.getDay() === 5 || d.getDay() === 6;
    return Math.round(room.base * (isWknd ? 1.2 : 1));
  }, [rateOverrides]);

  const roomsSubtotal = rt
    ? data.roomItems.reduce((sum, r) => {
        if (r.perNight && r.nightRates && r.nightRates.length === data.nights) {
          return sum + r.nightRates.reduce((s, v) => s + (+v || 0), 0);
        }
        const rate = r.rate != null ? r.rate : rateForNight(rt.id, 0);
        return sum + rate * data.nights;
      }, 0)
    : 0;

  // Merge: defaults + globally-saved customs + locally-added (not yet saved) customs.
  const mergedCustoms = [
    ...savedCustomExtras,
    ...(data.customExtras || []).filter(x => !savedCustomExtras.some(s => s.id === x.id)),
  ];
  const allExtras = [...EXTRAS_DEFAULT, ...mergedCustoms].map(ex => ({
    ...ex,
    price: data.extraPrices[ex.id] != null ? data.extraPrices[ex.id] : ex.price,
  }));
  const extrasTotal = Object.entries(data.extras).reduce((sum, [id, qty]) => {
    const ex = allExtras.find(x => x.id === id);
    return ex ? sum + ex.price * qty : sum;
  }, 0);
  const subtotal = roomsSubtotal + extrasTotal;
  const gst = withTax ? Math.round(subtotal * 0.12) : 0;
  const total = subtotal + gst;

  const titles = [t('stayDetails'), t('pickRoom'), t('guest'), t('payment')];
  const guestValid = data.name.trim().length > 0 && data.phone.trim().length >= 6;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: T.bg }}>
      <ScreenHeader
        title={isEdit ? t('editReservation') : titles[step - 1]}
        subtitle={isEdit ? `${editing.id} · ${titles[step - 1]}` : `${t('step')} ${step} ${t('of2')} 4`}
        onBack={() => step > 1 ? setStep(step - 1) : (isEdit ? go('booking', editing.id) : go('home'))}
      />
      <div style={{ display: 'flex', gap: 4, padding: '8px 16px 12px', background: T.card, borderBottom: `1px solid ${T.borderSoft}` }}>
        {[1, 2, 3, 4].map(s => (
          <div key={s} style={{ flex: 1, height: 3, borderRadius: 2, background: s <= step ? T.primary : T.bgSoft, transition: 'background .2s' }} />
        ))}
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '20px 16px 100px' }}>
        {step === 1 && <StepDates data={data} set={set} t={t} />}
        {step === 2 && <StepRoom data={data} set={set} t={t} baseRate={baseRate} rateForNight={rateForNight} />}
        {step === 3 && <StepGuest data={data} set={set} t={t} plan={plan} allExtras={allExtras} onRemoveSavedExtra={onRemoveSavedExtra} />}
        {step === 4 && <StepPayment data={data} set={set} subtotal={subtotal} gst={gst} total={total} withTax={withTax} t={t} roomsSubtotal={roomsSubtotal} extrasTotal={extrasTotal} allExtras={allExtras} />}
      </div>

      <div style={{ background: T.card, borderTop: `1px solid ${T.borderSoft}`, padding: '12px 16px 28px', display: 'flex', alignItems: 'center', gap: 10 }}>
        {rt && (
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, color: T.ink3, fontWeight: 600, letterSpacing: 0.3, textTransform: 'uppercase' }}>{t('total')} {withTax ? '· incl. GST' : ''}</div>
            <div className="tnum" style={{ fontSize: 18, fontWeight: 700, color: T.ink, letterSpacing: -0.3 }}>₹{total.toLocaleString('en-IN')}</div>
          </div>
        )}
        {step < 4 ? (
          <Btn icon="arrow" onClick={() => {
            if (step === 2 && !data.roomTypeId) return;
            if (step === 3 && !guestValid) return;
            setStep(step + 1);
          }} disabled={(step === 2 && !data.roomTypeId) || (step === 3 && !guestValid)} style={{ flex: rt ? 'unset' : 1 }}>{t('continue')}</Btn>
        ) : (
          <Btn icon="check" onClick={() => { if (!guestValid) return; onCreate(data, total); }} disabled={!guestValid} style={{ flex: rt ? 'unset' : 1 }}>
            {isEdit ? t('confirmMove') : t('confirmBooking')}
          </Btn>
        )}
      </div>
    </div>
  );
}

import { useState, useMemo, useRef } from 'react';
import { T } from '../tokens.js';
import { COUNTRIES, effectiveRoomTypes, ANCHOR, idxToDate, dateToIdx, gstRateForCategory, effectiveMealPlans, effectiveRatePlans, ratePlansActive, ratePerNight, ratePlanMultiplier, defaultRatePlanId, defaultMealPlanId, extraGuestCostFor, singleOccRateFor, childTotalForItem, effectiveChildBands, childCountsForItem } from '../data.js';

// Default mealPlanId for a fresh booking. Priority order:
//   1) property.defaultMealPlanId (if set & still enabled) — the camp's
//      "rates quoted INCLUDING this plan" anchor.
//   2) First enabled plan on the property — covers properties that
//      disabled EP without picking a new default.
//   3) 'ep' as a final fallback so the booking object is never left
//      without a mealPlanId; downstream cost code treats unknown ids
//      as zero-cost.
function startingMealPlanId(property) {
  const enabled = effectiveMealPlans(property).filter(p => p.enabled);
  const desired = defaultMealPlanId(property);
  if (enabled.some(p => p.id === desired)) return desired;
  if (enabled.length > 0) return enabled[0].id;
  return 'ep';
}
import Icon from '../components/Icon.jsx';
import Btn from '../components/Btn.jsx';
import Chip from '../components/Chip.jsx';
import Field from '../components/Field.jsx';
import NumberInput from '../components/NumberInput.jsx';
import Card from '../components/Card.jsx';
import Toggle from '../components/Toggle.jsx';
import ScreenHeader from '../components/ScreenHeader.jsx';
import Row from '../components/Row.jsx';

const stepBtn = {
  width: 36, height: 36, borderRadius: 18, border: `1px solid ${T.border}`,
  background: T.card, color: T.ink, fontSize: 18, fontWeight: 600, cursor: 'pointer', lineHeight: 1,
};

const miniStepBtn = {
  width: 34, height: 34, borderRadius: 17, border: `1px solid ${T.border}`,
  background: T.card, color: T.ink, fontSize: 15, fontWeight: 700, cursor: 'pointer', lineHeight: 1,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
};

function MiniStep({ label, value, onChange }) {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, background: T.card, border: `1px solid ${T.borderSoft}`, borderRadius: 8, padding: '4px 6px 4px 10px' }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: T.ink2 }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <button onClick={() => onChange(value - 1)} style={{ width: 32, height: 32, borderRadius: 16, border: `1px solid ${T.border}`, background: T.bgSoft, color: T.ink, fontSize: 14, fontWeight: 700, cursor: 'pointer', lineHeight: 1 }}>−</button>
        <span className="tnum" style={{ fontSize: 13, fontWeight: 700, minWidth: 14, textAlign: 'center', color: T.ink }}>{value}</span>
        <button onClick={() => onChange(value + 1)} style={{ width: 32, height: 32, borderRadius: 16, border: `1px solid ${T.border}`, background: T.bgSoft, color: T.ink, fontSize: 14, fontWeight: 700, cursor: 'pointer', lineHeight: 1 }}>+</button>
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

// Display label for a child age band. Until the hotelier defines custom bands,
// keep the translated free/half/full labels so Hindi stays clean; once they've
// set their own bands, trust their label (with an age-range fallback).
function childBandLabel(band, bands, property, t) {
  const customized = Array.isArray(property?.accountant?.childBands) && property.accountant.childBands.length;
  if (!customized) {
    const free = bands.find(b => b.id === 'free');
    const half = bands.find(b => b.id === 'half');
    if (band.id === 'free') return t('freeUnder').replace('{age}', band.maxAge);
    if (band.id === 'half') return t('childrenBand').replace('{a}', free ? free.maxAge : '').replace('{b}', (band.maxAge || 1) - 1);
    if (band.id === 'full') return t('fullAgeOver').replace('{age}', half ? half.maxAge : '');
  }
  if (band.label) return band.label;
  const idx = bands.findIndex(b => b.id === band.id);
  const lo = idx > 0 ? bands[idx - 1].maxAge : 0;
  if (band.maxAge == null) return `${lo}+`;
  return lo > 0 ? `${lo}–${band.maxAge - 1}` : `<${band.maxAge}`;
}

function StepDates({ data, set, t, property, childAgeBelow, childFreeAge = 5, childHalfAge = 12 }) {
  const childBands = effectiveChildBands(property);
  const dateRef = useRef(null);
  // Minimum-night reminder (Advanced settings → Minimum-night stays).
  // Non-blocking: the hotelier can always take the booking — this is a
  // reminder so reception doesn't accidentally undercut a weekend policy.
  const ml = property && property.accountant && property.accountant.minNights;
  let minWarn = null;
  if (ml && ml.enabled && data.checkIn && data.nights) {
    const inDate = new Date(data.checkIn + 'T00:00:00');
    if (!isNaN(inDate.getTime())) {
      const weekendDays = (property.weekendRules && property.weekendRules.weekendDays) || [0, 6];
      let includesWeekend = false;
      for (let k = 0; k < data.nights; k++) {
        const d = new Date(inDate);
        d.setDate(d.getDate() + k);
        if (weekendDays.includes(d.getDay())) { includesWeekend = true; break; }
      }
      const need = includesWeekend ? (ml.weekend || 1) : (ml.allDays || 1);
      if (data.nights < need) minWarn = need;
    }
  }
  // The native date picker needs to anchor to the input's rendered box, so
  // we keep the input full-size inside the bar with opacity:0 (same pattern
  // the Diary's jump-to-date bar uses). Tapping anywhere on the bar hits
  // the input directly, which triggers the picker. The explicit onClick is
  // a belt-and-suspenders fallback for browsers that don't auto-open the
  // picker on click (some Safari builds).
  const openPicker = () => {
    const el = dateRef.current;
    if (!el) return;
    if (typeof el.showPicker === 'function') {
      try { el.showPicker(); } catch {}
    }
  };
  const data_rooms = data.roomItems.length;
  const data_adults = data.roomItems.reduce((s, r) => s + r.adults, 0);
  const data_children = data.roomItems.reduce((s, r) => s + r.children, 0);
  // Format the check-out preview from the picked check-in date so the
  // hotelier sees the date math. Falls back to a hint when no date picked.
  let checkOutLabel = '—';
  let checkInLabel = '';
  if (data.checkIn) {
    const inDate = new Date(data.checkIn + 'T00:00:00');
    if (!isNaN(inDate.getTime())) {
      checkInLabel = inDate.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
      const outDate = new Date(inDate);
      outDate.setDate(outDate.getDate() + (data.nights || 1));
      checkOutLabel = outDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    }
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <Card padding={16}>
        <div style={{ fontSize: 12, fontWeight: 700, color: T.ink2, marginBottom: 12, letterSpacing: 0.2 }}>{t('when')}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 88px', gap: 10 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: T.ink2, letterSpacing: 0.1 }}>{t('checkIn')}</label>
            {/* Real, visible <input type="date"> takes the full bar so
                tapping anywhere hits the real input → native picker opens
                reliably on every browser. Text + native calendar icon are
                hidden via global CSS (see tokens.js). Our custom label +
                icon overlay on top with pointer-events:none so taps pass
                through to the input below. */}
            <div style={{
              position: 'relative',
              background: data.checkIn ? T.primaryLt : T.bgSunk,
              border: `1px solid ${data.checkIn ? T.primary : T.borderSoft}`,
              borderRadius: 10, height: 44, overflow: 'hidden',
            }}>
              <input
                ref={dateRef}
                type="date"
                value={data.checkIn || ''}
                onChange={(e) => set('checkIn', e.target.value)}
                onClick={openPicker}
                aria-label="Check-in date"
                className="atithi-date-overlay"
                style={{
                  width: '100%', height: '100%',
                  border: 'none', outline: 'none', background: 'transparent',
                  padding: '0 12px', cursor: 'pointer', font: 'inherit',
                }}
              />
              <div style={{
                position: 'absolute', inset: 0, padding: '0 12px',
                display: 'flex', alignItems: 'center', gap: 8,
                pointerEvents: 'none',
              }}>
                <Icon name="cal" size={16} color={data.checkIn ? T.primaryDk : T.ink3} />
                <span style={{
                  flex: 1, fontSize: 14, fontWeight: 600,
                  color: data.checkIn ? T.ink : T.ink3,
                  minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {checkInLabel || t('pickCheckInDate')}
                </span>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: T.ink2 }}>{t('nights')}</label>
            <div style={{ background: T.bgSunk, border: `1px solid ${T.borderSoft}`, borderRadius: 10, padding: '0 12px', height: 44, display: 'flex', alignItems: 'center' }}>
              <NumberInput value={data.nights} min={1} fallback={1} onChange={(n) => set('nights', n)} style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 15, fontWeight: 500, color: T.ink, minWidth: 0 }} />
            </div>
          </div>
        </div>
        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: T.ink3 }}>
          <Icon name="info" size={13} />
          {t('checkOut')} · {checkOutLabel}
        </div>
      </Card>

      {minWarn && (
        <Card padding={14} style={{ borderColor: T.warnLt, background: 'oklch(98% 0.018 75)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <Icon name="info" size={16} color="oklch(48% 0.14 75)" />
            <div style={{ fontSize: 12, color: T.ink2, lineHeight: 1.45 }}>
              {t('mlWarn').replace('{need}', minWarn)}
            </div>
          </div>
        </Card>
      )}

      <Card padding={16}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.ink2, letterSpacing: 0.2 }}>{t('roomsGuests')}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button onClick={() => data_rooms > 1 && set('roomItems', data.roomItems.slice(0, -1))} disabled={data_rooms <= 1} style={{ ...stepBtn, opacity: data_rooms <= 1 ? 0.4 : 1 }}>−</button>
            <span className="tnum" style={{ fontSize: 13, fontWeight: 700, minWidth: 56, textAlign: 'center', color: T.ink }}>{data_rooms} {data_rooms > 1 ? t('rooms') : t('room')}</span>
            <button onClick={() => set('roomItems', [...data.roomItems, { adults: 2, children: 0, rate: null }])} style={stepBtn}>+</button>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {data.roomItems.map((r, idx) => (
            <div key={idx} style={{ padding: 10, background: T.bgSoft, borderRadius: 10, border: `1px solid ${T.borderSoft}` }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.ink }}>{t('roomN').replace('{n}', idx + 1)}</div>
                {data_rooms > 1 && (
                  <button onClick={() => set('roomItems', data.roomItems.filter((_, i) => i !== idx))} aria-label="Remove room" style={{ background: 'none', border: 'none', color: T.ink3, cursor: 'pointer', padding: 2 }}>
                    <Icon name="x" size={12} />
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <MiniStep label={t('adults')} value={r.adults} onChange={(v) => set('roomItems', data.roomItems.map((x, i) => i === idx ? { ...x, adults: Math.max(1, v) } : x))} />
                {/* One stepper per hotelier-defined child age band (Settings →
                    Child rate bands). Until they customise, these are the
                    default Free / Half / Full bands. Counts are stored in
                    childBands; the legacy childrenFree/children/childrenFull
                    fields are kept in sync for the default ids so the per-room
                    charge breakdown + voucher keep working during the rollout. */}
                {childBands.map(b => {
                  const legacyKey = ({ free: 'childrenFree', half: 'children', full: 'childrenFull' })[b.id];
                  const cur = (r.childBands && r.childBands[b.id] != null) ? r.childBands[b.id] : (legacyKey ? (r[legacyKey] || 0) : 0);
                  return (
                    <MiniStep key={b.id} label={childBandLabel(b, childBands, property, t)} value={cur} onChange={(v) => set('roomItems', data.roomItems.map((x, i) => {
                      if (i !== idx) return x;
                      const nv = Math.max(0, v);
                      const patch = { childBands: { ...(x.childBands || {}), [b.id]: nv } };
                      if (legacyKey) patch[legacyKey] = nv;
                      return { ...x, ...patch };
                    }))} />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        {data_rooms > 1 && (
          <div style={{ marginTop: 10, padding: '8px 10px', background: T.primaryLt, borderRadius: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="info" size={12} color={T.primaryDk} />
            <span style={{ fontSize: 11, color: T.primaryDk, fontWeight: 600 }} className="tnum">{data_rooms} {t('units')} · {data_adults}A {data_children > 0 ? `${data_children}C · ` : ''}{t('sameFolio')}</span>
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
              {t('holdForHours').replace('{h}', data.holdHours)}
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
  const d = new Date(ANCHOR);
  d.setDate(d.getDate() + nightIdx);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

// Compute the per-night rate options for a single room item, given its
// chosen room type and the nights of stay. Pulls weekend uplift / overrides
// via the shared rateForNight() helper.
function nightRatesForItem(item, type, nights, rateForNight, singleRate = null) {
  const base = type ? (type.base || 0) : 0;
  // Single-occupancy: a flat solo rate replaces the computed nightly rate
  // (weekend / season are not stacked on it). A manual per-room rate the
  // hotelier typed still wins — see `uniform` + itemSubtotal below.
  const defaults = singleRate != null
    ? Array.from({ length: nights }, () => singleRate)
    : (type ? Array.from({ length: nights }, (_, n) => rateForNight(type.id, n)) : Array.from({ length: nights }, () => base));
  const uniform = item.rate != null ? item.rate : (singleRate != null ? singleRate : (defaults[0] || base));
  const perNight = !!item.perNight && nights > 1;
  const nightRates = (item.nightRates && item.nightRates.length === nights)
    ? item.nightRates
    : Array.from({ length: nights }, () => uniform);
  return { defaults, uniform, perNight, nightRates };
}

// Sum the cost of one room item across all nights of stay.
function itemSubtotal(item, type, nights, rateForNight, singleRate = null) {
  const { defaults, perNight, nightRates } = nightRatesForItem(item, type, nights, rateForNight, singleRate);
  // Per-night custom rates → sum them. An explicit uniform rate the hotelier
  // typed → that rate × nights. Otherwise sum each night's computed rate —
  // `defaults` already vary by weekend / season / per-day override, so a
  // stay spanning a weekend isn't mispriced as (first night × nights).
  if (perNight) return nightRates.reduce((s, v) => s + (+v || 0), 0);
  if (item.rate != null) return item.rate * nights;
  return defaults.reduce((s, v) => s + (+v || 0), 0);
}

function RoomItemCard({ item, idx, total, roomTypes, nights, rateForNight, onChange, property, t }) {
  const selectedType = item.roomTypeId ? roomTypes.find(rt => rt.id === item.roomTypeId) : null;
  const tagColor = selectedType ? T[selectedType.tag] : null;
  const singleRate = singleOccRateFor(item, selectedType, property);
  const { defaults: defaultNightRates, uniform: uniformDefault, perNight, nightRates } = nightRatesForItem(item, selectedType, nights, rateForNight, singleRate);
  const overridden = item.rate != null && selectedType && item.rate !== selectedType.base;
  const sub = selectedType ? itemSubtotal(item, selectedType, nights, rateForNight, singleRate) : 0;
  // Show a small chip when the solo rate is auto-applied (1 adult) and the
  // hotelier hasn't manually overridden it — explains why the rate dropped.
  const singleApplied = singleRate != null && item.rate == null;
  const togglePerNight = () => {
    if (perNight) {
      onChange({ perNight: false, nightRates: undefined });
    } else {
      onChange({ perNight: true, nightRates: Array.from({ length: nights }, (_, n) => item.nightRates?.[n] != null ? item.nightRates[n] : (item.rate != null ? item.rate : defaultNightRates[n] || (selectedType ? selectedType.base : 0))) });
    }
  };
  return (
    <Card padding={0} style={{ overflow: 'hidden' }}>
      <div style={{ padding: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.ink, display: 'flex', alignItems: 'center', gap: 6 }}>
            {tagColor && <span style={{ width: 4, height: 14, borderRadius: 2, background: tagColor }} />}
            {total > 1 ? t('roomN').replace('{n}', idx + 1) : t('room')}
          </div>
          <div style={{ fontSize: 11, color: T.ink3, fontWeight: 600 }}>{item.adults}A{item.children > 0 ? ` · ${item.children}C` : ''}</div>
        </div>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {roomTypes.map(rt => {
            const sel = item.roomTypeId === rt.id;
            // Show the actual computed rate (calendar override + weekend
            // uplift) for THIS booking's first night, not the bare category
            // base. Previously the chip said '₹4,500' while the rate input
            // below showed '₹14,400' (override) — visually contradictory.
            // Now they match. If no override / no uplift, the chip equals
            // the base anyway.
            const chipRate = rateForNight(rt.id, 0);
            return (
              <button
                key={rt.id}
                onClick={() => onChange({ roomTypeId: rt.id, rate: null, perNight: false, nightRates: undefined })}
                className="atithi-tap"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '6px 10px', borderRadius: 999,
                  border: sel ? `1.5px solid ${T.primary}` : `1px solid ${T.border}`,
                  background: sel ? T.primaryLt : T.card,
                  color: sel ? T.primaryDk : T.ink2,
                  fontSize: 11, fontWeight: 700, cursor: 'pointer',
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: 3, background: T[rt.tag] }} />
                {rt.name}
                <span className="tnum" style={{ fontSize: 10, color: sel ? T.primaryDk : T.ink3, fontWeight: 700 }}>₹{chipRate.toLocaleString('en-IN')}</span>
              </button>
            );
          })}
        </div>
      </div>
      {selectedType && (
        <div style={{ padding: '10px 14px 12px', borderTop: `1px dashed ${T.border}`, background: T.bgSoft }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {!perNight && (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 4, background: T.card, border: `1px solid ${overridden ? T.primary : T.border}`, borderRadius: 7, padding: '0 8px', height: 32 }}>
                <span style={{ fontSize: 12, color: T.ink3, fontWeight: 600 }}>₹</span>
                <NumberInput value={uniformDefault} min={0} onChange={(n) => onChange({ rate: n })} className="tnum" style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 13, fontWeight: 700, color: overridden ? T.primary : T.ink, minWidth: 0 }} />
                <span style={{ fontSize: 9, color: T.ink3 }}>{t('perNight')}</span>
              </div>
            )}
            {perNight && <div style={{ flex: 1, fontSize: 11, color: T.ink3, fontWeight: 600 }}>{t('perNightRatesBelow')}</div>}
            <span className="tnum" style={{ fontSize: 12, fontWeight: 700, color: T.ink, minWidth: 70, textAlign: 'right' }}>₹{sub.toLocaleString('en-IN')}</span>
          </div>
          {singleApplied && (
            <div style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 999, background: T.primaryLt, color: T.primaryDk, fontSize: 10, fontWeight: 700 }}>
              <Icon name="info" size={10} stroke={2.4} />
              {t('singleOccApplied')}
            </div>
          )}
          {nights > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
              <button
                onClick={togglePerNight}
                className="atithi-tap"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '4px 9px', borderRadius: 999, cursor: 'pointer',
                  background: perNight ? T.primaryLt : T.card,
                  color: perNight ? T.primaryDk : T.ink3,
                  border: `1px solid ${perNight ? T.primary : T.border}`,
                  fontSize: 10, fontWeight: 700,
                }}
              >
                <Icon name={perNight ? 'check' : 'plus'} size={9} stroke={2.4} />
                {t('differentRateEachNight')}
              </button>
              {perNight && (
                <button onClick={() => onChange({ nightRates: Array.from({ length: nights }, (_, n) => defaultNightRates[n] || selectedType.base) })} style={{ background: 'none', border: 'none', color: T.ink3, fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>{t('resetToDefault')}</button>
              )}
            </div>
          )}
          {perNight && (() => {
            // nightTypes is an optional parallel array — if absent we
            // treat every night as using the room item's main type.
            // Hotelier can toggle "Vary room type by night" to switch a
            // night to a different category mid-stay (e.g. Dlx-Dlx-Lux
            // for a guest who upgrades for their anniversary night).
            const nightTypes = Array.isArray(item.nightTypes) && item.nightTypes.length === nights
              ? item.nightTypes
              : Array.from({ length: nights }, () => item.roomTypeId);
            const variesByNight = nightTypes.some(tid => tid !== item.roomTypeId);
            const toggleVaryByNight = () => {
              if (variesByNight) {
                // Reset to all-same; clear the array so the booking
                // shape is clean.
                onChange({ nightTypes: undefined });
              } else {
                // Initialize all nights to the item's current type so
                // the picker shows up; hotelier then picks a different
                // type for the night(s) they want to vary.
                onChange({ nightTypes: Array.from({ length: nights }, () => item.roomTypeId) });
              }
            };
            return (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
                  <button
                    onClick={toggleVaryByNight}
                    className="atithi-tap"
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      padding: '4px 9px', borderRadius: 999, cursor: 'pointer',
                      background: variesByNight ? T.indigoLt : T.card,
                      color: variesByNight ? T.indigo : T.ink3,
                      border: `1px solid ${variesByNight ? T.indigo : T.border}`,
                      fontSize: 10, fontWeight: 700,
                    }}
                  >
                    <Icon name={variesByNight ? 'check' : 'plus'} size={9} stroke={2.4} />
                    {t('varyRoomTypeByNight')}
                  </button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: variesByNight ? '1fr' : 'repeat(2, 1fr)', gap: 6, padding: 8, background: T.card, borderRadius: 8, border: `1px dashed ${T.border}`, marginTop: 8 }}>
                  {nightRates.map((rate, ni) => {
                    const nightType = nightTypes[ni];
                    const nightTypeObj = roomTypes.find(rt => rt.id === nightType) || selectedType;
                    return (
                      <div key={ni} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <span style={{ fontSize: 9, fontWeight: 700, color: T.ink3, letterSpacing: 0.3 }}>{t('night').toUpperCase()} {ni + 1} · {nightDateLabel(ni)}</span>
                        {variesByNight && (
                          <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginBottom: 4 }}>
                            {roomTypes.map(rt => {
                              const sel = nightType === rt.id;
                              return (
                                <button
                                  key={rt.id}
                                  onClick={() => onChange({ nightTypes: nightTypes.map((tid, k) => k === ni ? rt.id : tid) })}
                                  style={{
                                    padding: '3px 7px', borderRadius: 5, fontSize: 9, fontWeight: 700,
                                    border: `1px solid ${sel ? T.indigo : T.border}`,
                                    background: sel ? T.indigoLt : T.card,
                                    color: sel ? T.indigo : T.ink3, cursor: 'pointer',
                                    display: 'inline-flex', alignItems: 'center', gap: 3,
                                  }}
                                >
                                  <span style={{ width: 5, height: 5, borderRadius: 3, background: T[rt.tag] }} />
                                  {rt.name}
                                </button>
                              );
                            })}
                          </div>
                        )}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: T.bgSoft, border: `1px solid ${T.border}`, borderRadius: 6, padding: '0 8px', height: 30 }}>
                          <span style={{ fontSize: 11, color: T.ink3, fontWeight: 600 }}>₹</span>
                          <NumberInput
                            value={rate}
                            min={0}
                            onChange={(n) => onChange({ nightRates: nightRates.map((nr, k) => k === ni ? n : nr) })}
                            className="tnum"
                            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 12, fontWeight: 700, color: T.ink, minWidth: 0 }}
                          />
                          {variesByNight && nightTypeObj && nightTypeObj.id !== item.roomTypeId && (
                            <span style={{ fontSize: 9, color: T.indigo, fontWeight: 700, letterSpacing: 0.3 }}>· {(nightTypeObj.name || '').slice(0, 8)}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            );
          })()}

          {/* Extra-guest charges editor. Shows the per-night charge for
              any adults above baseCapacityAdults + any children, and lets
              the hotelier override the rate for THIS specific booking
              (e.g. give a regular guest a discount on their extra-bed
              charge). Default is auto-computed from category extraAdult /
              extraChild rules — kept in sync with the season override if
              the booking falls inside one. */}
          {(() => {
            const cap = Math.max(1, property?.baseCapacityAdults ?? 2);
            const extraAdults = Math.max(0, (item.adults || 0) - cap);
            const halfChildren = item.children || 0;
            const fullChildren = item.childrenFull || 0;
            const hasAnyExtra = extraAdults + halfChildren + fullChildren > 0;
            if (!hasAnyExtra) return null;
            // Compute auto rates from category (mode flat = ₹ value;
            // mode pct = % of category base).
            const baseRate = (item.rate != null ? item.rate : (selectedType.base || 0)) || 0;
            const resolveRate = (rule) => {
              if (!rule || typeof rule !== 'object') return 0;
              const v = +rule.value || 0;
              if (v <= 0) return 0;
              if (rule.mode === 'pct') return Math.max(0, Math.round((baseRate || 0) * v / 100));
              return Math.round(v);
            };
            const autoAdult = resolveRate(selectedType.extraAdult);
            const autoChild = resolveRate(selectedType.extraChild);
            const adultRate = (typeof item.extraAdultRate === 'number') ? item.extraAdultRate : autoAdult;
            const childRate = (typeof item.extraChildRate === 'number') ? item.extraChildRate : autoChild;
            const adultLine = extraAdults * adultRate * nights;
            const halfChildLine = Math.round(halfChildren * childRate * 0.5 * nights);
            const fullChildLine = fullChildren * childRate * nights;
            const isAdultOverride = typeof item.extraAdultRate === 'number';
            const isChildOverride = typeof item.extraChildRate === 'number';
            const fmt = (n) => '₹' + (n || 0).toLocaleString('en-IN');
            return (
              <div style={{ marginTop: 8, padding: '8px 10px', background: T.card, border: `1px solid ${T.borderSoft}`, borderRadius: 7 }}>
                <div style={{ fontSize: 9, fontWeight: 800, color: T.ink3, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 6 }}>
                  {t('extraGuestCharges')}
                </div>
                {extraAdults > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, padding: '3px 0', flexWrap: 'wrap' }}>
                    <span style={{ color: T.ink2, fontWeight: 600, minWidth: 84 }}>{extraAdults > 1 ? t('extraAdults') : t('extraAdult')}</span>
                    <span style={{ color: T.ink3, fontSize: 10, fontWeight: 600 }}>{extraAdults} ×</span>
                    <span style={{ fontSize: 11, color: T.ink3, fontWeight: 600 }}>₹</span>
                    <NumberInput
                      min={0}
                      value={adultRate}
                      onChange={(n) => onChange({ extraAdultRate: n })}
                      className="tnum"
                      style={{ width: 70, border: `1px solid ${isAdultOverride ? T.primary : T.border}`, outline: 'none', borderRadius: 5, padding: '3px 6px', fontSize: 11, fontWeight: 700, color: isAdultOverride ? T.primary : T.ink, background: T.card }}
                    />
                    <span style={{ fontSize: 9, color: T.ink3, fontWeight: 600 }}>{t('perNightTimesN').replace('{n}', nights)}</span>
                    {isAdultOverride && (
                      <button
                        onClick={() => onChange({ extraAdultRate: undefined })}
                        title={t('resetToDefault')}
                        style={{ background: 'none', border: 'none', color: T.ink3, fontSize: 9, fontWeight: 700, cursor: 'pointer', padding: 0 }}
                      >{t('reset')}</button>
                    )}
                    <span className="tnum" style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: T.ink }}>{fmt(adultLine)}</span>
                  </div>
                )}
                {halfChildren > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, padding: '3px 0', flexWrap: 'wrap' }}>
                    <span style={{ color: T.ink2, fontWeight: 600, minWidth: 84 }}>{halfChildren > 1 ? t('childrenHalf') : t('childHalf')}</span>
                    <span style={{ color: T.ink3, fontSize: 10, fontWeight: 600 }}>{halfChildren} ×</span>
                    <span style={{ fontSize: 11, color: T.ink3, fontWeight: 600 }}>₹</span>
                    <NumberInput
                      min={0}
                      value={childRate}
                      onChange={(n) => onChange({ extraChildRate: n })}
                      className="tnum"
                      style={{ width: 70, border: `1px solid ${isChildOverride ? T.primary : T.border}`, outline: 'none', borderRadius: 5, padding: '3px 6px', fontSize: 11, fontWeight: 700, color: isChildOverride ? T.primary : T.ink, background: T.card }}
                    />
                    <span style={{ fontSize: 9, color: T.ink3, fontWeight: 600 }}>{t('halfTimesN').replace('{n}', nights)}</span>
                    {isChildOverride && (
                      <button
                        onClick={() => onChange({ extraChildRate: undefined })}
                        title={t('resetToDefault')}
                        style={{ background: 'none', border: 'none', color: T.ink3, fontSize: 9, fontWeight: 700, cursor: 'pointer', padding: 0 }}
                      >{t('reset')}</button>
                    )}
                    <span className="tnum" style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: T.ink }}>{fmt(halfChildLine)}</span>
                  </div>
                )}
                {fullChildren > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, padding: '3px 0', flexWrap: 'wrap' }}>
                    <span style={{ color: T.ink2, fontWeight: 600, minWidth: 84 }}>{fullChildren > 1 ? t('childrenFull') : t('childFull')}</span>
                    <span style={{ color: T.ink3, fontSize: 10, fontWeight: 600 }}>{fullChildren} ×</span>
                    <span style={{ fontSize: 11, color: T.ink3, fontWeight: 600 }}>₹</span>
                    <NumberInput
                      min={0}
                      value={childRate}
                      onChange={(n) => onChange({ extraChildRate: n })}
                      className="tnum"
                      style={{ width: 70, border: `1px solid ${isChildOverride ? T.primary : T.border}`, outline: 'none', borderRadius: 5, padding: '3px 6px', fontSize: 11, fontWeight: 700, color: isChildOverride ? T.primary : T.ink, background: T.card }}
                    />
                    <span style={{ fontSize: 9, color: T.ink3, fontWeight: 600 }}>{t('perNightTimesN').replace('{n}', nights)}</span>
                    {isChildOverride && (
                      <button
                        onClick={() => onChange({ extraChildRate: undefined })}
                        title={t('resetToDefault')}
                        style={{ background: 'none', border: 'none', color: T.ink3, fontSize: 9, fontWeight: 700, cursor: 'pointer', padding: 0 }}
                      >{t('reset')}</button>
                    )}
                    <span className="tnum" style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: T.ink }}>{fmt(fullChildLine)}</span>
                  </div>
                )}
                <div style={{ fontSize: 9, color: T.ink3, fontWeight: 600, fontStyle: 'italic', marginTop: 4, lineHeight: 1.4 }}>
                  {t('overrideRateHint')}
                </div>
              </div>
            );
          })()}
        </div>
      )}
      {!selectedType && (
        <div style={{ padding: '10px 14px 12px', borderTop: `1px dashed ${T.border}`, background: T.bgSoft, fontSize: 11, color: T.ink3, fontWeight: 600 }}>
          {t('pickRoomTypeToRate')}
        </div>
      )}
    </Card>
  );
}

// Step 2 — Pick rooms. Each entry in data.roomItems can have its own
// roomTypeId, so a single booking can mix Deluxe + Luxury + Pool etc.
// The booking-level `roomTypeId` (kept for backward-compat with screens
// that still read it) is auto-derived from the first room.
function StepRoom({ data, set, t, rateForNight, roomTypes, mealPlans, ratePlans = [], property }) {
  const totalAdults = data.roomItems.reduce((s, r) => s + r.adults, 0);
  const totalChildren = data.roomItems.reduce((s, r) => s + childTotalForItem(r), 0);
  const totalGuests = totalAdults + totalChildren;
  const roomsLabel = `${data.roomItems.length} ${data.roomItems.length > 1 ? t('rooms') : t('room')}`;
  const nightsLabel = `${data.nights} ${data.nights > 1 ? t('nights') : t('nights')}`;
  const guestsLabel = `${totalAdults}A${totalChildren > 0 ? ` ${totalChildren}C` : ''}`;
  const setItem = (idx, patch) => {
    const next = data.roomItems.map((x, i) => i === idx ? { ...x, ...patch } : x);
    set('roomItems', next);
    if ('roomTypeId' in patch && idx === 0) set('roomTypeId', patch.roomTypeId);
  };
  const enabledMealPlans = (mealPlans || []).filter(p => p.enabled);
  const selectedMealPlanId = data.mealPlanId || 'ep';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 12, color: T.ink3, marginBottom: 2 }}>
        {t('forGuestsRoomsNights').replace('{guests}', guestsLabel).replace('{rooms}', roomsLabel).replace('{nights}', nightsLabel)}{data.roomItems.length > 1 ? ` · ${t('pickTypeEachRoom')}` : ''}
      </div>
      {data.roomItems.map((item, idx) => (
        <RoomItemCard
          key={idx}
          item={item}
          idx={idx}
          total={data.roomItems.length}
          roomTypes={roomTypes}
          nights={data.nights}
          rateForNight={rateForNight}
          onChange={(patch) => setItem(idx, patch)}
          property={property}
          t={t}
        />
      ))}
      {/* Rate plan picker — only when more than one is enabled. The
          Standard plan is the calendar rate; other plans apply their
          multiplier on top so the picker shows what the guest pays. */}
      {ratePlansActive(property) && ratePlans.length > 1 && (() => {
        const selectedRpId = data.ratePlanId || 'standard';
        // Sample rate for preview: first room's per-night rate, or its
        // type's base if no rate yet, or 0.
        const sampleRoom = data.roomItems[0];
        const sampleRate = sampleRoom && sampleRoom.rate != null
          ? sampleRoom.rate
          : (roomTypes.find(r => r.id === (sampleRoom && sampleRoom.roomTypeId))?.base || 0);
        return (
          <Card padding={14}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.ink2, letterSpacing: 0.2 }}>{t('ratePlanHeader')}</div>
              <span style={{ fontSize: 10, color: T.ink3, fontWeight: 600 }}>{t('cancellationTermsVary')}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {ratePlans.map(rp => {
                const sel = rp.id === selectedRpId;
                const m = 1 + ((rp.multiplierPct || 0) / 100);
                const adjusted = Math.round(sampleRate * m);
                const diff = adjusted - sampleRate;
                return (
                  <button
                    key={rp.id}
                    onClick={() => set('ratePlanId', rp.id)}
                    className="atithi-tap"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 12px', borderRadius: 10,
                      border: sel ? `1.5px solid ${T.primary}` : `1px solid ${T.border}`,
                      background: sel ? T.primaryLt : T.card,
                      cursor: 'pointer', textAlign: 'left',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: sel ? T.primaryDk : T.ink }}>{rp.label}</div>
                      <div style={{ fontSize: 10, color: T.ink3, marginTop: 2 }}>
                        {rp.cancellation === 'non-refundable'
                          ? t('noRefundsOnCancel')
                          : t('freeCancelBefore').replace('{h}', rp.refundHours)}
                      </div>
                    </div>
                    {sampleRate > 0 && (
                      <span className="tnum" style={{ fontSize: 12, fontWeight: 700, color: sel ? T.primaryDk : T.ink2, whiteSpace: 'nowrap' }}>
                        {diff === 0 ? `₹${adjusted.toLocaleString('en-IN')}` : `${diff > 0 ? '+' : ''}₹${Math.abs(diff).toLocaleString('en-IN')}`}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </Card>
        );
      })()}
      {enabledMealPlans.length > 0 && (() => {
        // Calendar rate is treated as already including the property's
        // default meal plan; other plans charge the per-guest-per-night
        // delta on top (can be negative — that's the discount when a
        // guest on a MAP-default property picks EP).
        const defaultId = property?.defaultMealPlanId || 'ep';
        const defaultPlan = enabledMealPlans.find(p => p.id === defaultId);
        const defaultPrice = (defaultPlan && defaultPlan.price) || 0;
        return (
          <Card padding={14}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.ink2, letterSpacing: 0.2 }}>{t('mealPlanHeader')}</div>
              <span style={{ fontSize: 10, color: T.ink3, fontWeight: 600 }}>{t('guestsTimesNights').replace('{guests}', `${totalGuests} ${totalGuests > 1 ? t('guests').toLowerCase() : t('guest').toLowerCase()}`).replace('{nights}', `${data.nights} ${data.nights > 1 ? t('nights').toLowerCase() : t('nights').toLowerCase()}`)}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {enabledMealPlans.map(plan => {
                const sel = plan.id === selectedMealPlanId;
                const isDefault = plan.id === defaultId;
                const delta = (plan.price || 0) - defaultPrice;
                const planCost = delta * totalGuests * data.nights;
                return (
                  <button
                    key={plan.id}
                    onClick={() => set('mealPlanId', plan.id)}
                    className="atithi-tap"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 12px', borderRadius: 10,
                      border: sel ? `1.5px solid ${T.primary}` : `1px solid ${T.border}`,
                      background: sel ? T.primaryLt : T.card,
                      cursor: 'pointer', textAlign: 'left',
                    }}
                  >
                    <span style={{
                      width: 38, fontSize: 10, fontWeight: 800,
                      color: sel ? T.primaryDk : T.ink2, letterSpacing: 0.5,
                      flexShrink: 0,
                    }}>{plan.code}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: sel ? T.primaryDk : T.ink }}>
                        {plan.label}
                        {isDefault && (
                          <span style={{ marginLeft: 6, fontSize: 9, color: T.ink3, fontWeight: 700, letterSpacing: 0.3, textTransform: 'uppercase' }}>· {t('included')}</span>
                        )}
                      </div>
                      <div className="tnum" style={{ fontSize: 10, color: T.ink3, marginTop: 2 }}>
                        {isDefault
                          ? t('mealPlanInRate') || 'In room rate'
                          : delta > 0
                            ? `+ ₹${delta.toLocaleString('en-IN')} ${t('perGuestPerNight')}`
                            : `− ₹${Math.abs(delta).toLocaleString('en-IN')} ${t('perGuestPerNight')}`}
                      </div>
                    </div>
                    <span className="tnum" style={{ fontSize: 12, fontWeight: 700, color: planCost < 0 ? T.ok : sel ? T.primaryDk : T.ink2 }}>
                      {planCost === 0 ? '—' : planCost > 0 ? `+₹${planCost.toLocaleString('en-IN')}` : `−₹${Math.abs(planCost).toLocaleString('en-IN')}`}
                    </span>
                  </button>
                );
              })}
            </div>
          </Card>
        );
      })()}
    </div>
  );
}

function StepGuest({ data, set, t, allExtras, onRemoveSavedExtra, bookings = [], editingId }) {
  const isForeign = data.country !== 'IN';
  const [showAdd, setShowAdd] = useState(false);
  const [newEx, setNewEx] = useState({ label: '', price: '' });
  const [editingPriceId, setEditingPriceId] = useState(null);
  const [dismissedMatchKey, setDismissedMatchKey] = useState(null);
  const country = COUNTRIES.find(c => c.code === data.country) || COUNTRIES[0];

  // Repeat-guest detection. As soon as the typed phone or name resembles
  // an existing guest, surface a banner with their saved details. Tapping
  // "Use these details" prefills name, country and email from the most
  // recent non-cancelled stay so the hotelier doesn't have to retype.
  const repeatMatch = (() => {
    const typedPhone = (data.phone || '').replace(/\D/g, '');
    const typedName = (data.name || '').trim().toLowerCase();
    if (typedPhone.length < 7 && typedName.length < 3) return null;
    // Search non-cancelled past stays. Exclude the current booking when editing.
    const candidates = bookings
      .filter(b => b.id !== editingId && b.status !== 'cancelled')
      .filter(b => {
        const pPhone = String(b.phone || '').replace(/\D/g, '');
        const pName = String(b.guest || '').trim().toLowerCase();
        // Phone match needs the FULL typed number (>=7 digits) as a suffix of
        // the saved one — not just the last 5, which false-matched unrelated
        // guests and then offered to overwrite the typed identity (audit).
        if (typedPhone.length >= 7 && pPhone && pPhone.endsWith(typedPhone)) return true;
        if (typedName.length >= 3 && pName.startsWith(typedName)) return true;
        return false;
      });
    if (candidates.length === 0) return null;
    // Pick the most recent stay (highest startIdx).
    const best = candidates.reduce((m, b) => (!m || (b.startIdx || 0) > (m.startIdx || 0) ? b : m), null);
    const sameGuestCount = candidates.filter(c =>
      String(c.phone || '').replace(/\D/g, '') === String(best.phone || '').replace(/\D/g, '')
    ).length;
    return { best, count: sameGuestCount };
  })();
  const matchKey = repeatMatch ? `${repeatMatch.best.id}` : null;
  const showRepeatBanner = repeatMatch && matchKey !== dismissedMatchKey;

  const applyRepeatPrefill = () => {
    const b = repeatMatch.best;
    set('name', b.guest || '');
    // Strip the dial-code prefix from the saved phone so the form's phone
    // field (which sits next to a separate dial-code prefix) doesn't end
    // up with two prefixes.
    const phoneLocal = String(b.phone || '').replace(/^\+\d+\s*/, '').replace(/\D/g, '');
    if (phoneLocal) set('phone', phoneLocal);
    if (b.country) set('country', b.country);
    // Actually carry the saved email across (the previous comment claimed it
    // did, but it never set it). Only overwrite when the past stay has one.
    if (b.email) set('email', b.email);
    setDismissedMatchKey(matchKey);
  };

  const addCustom = () => {
    const label = newEx.label.trim();
    const raw = String(newEx.price).trim();
    // Require a name + an explicitly-entered price. ₹0 IS allowed (a
    // complimentary / free add-on you still want itemised), but a blank
    // price or junk like "abc" is rejected — the old check used `!newEx.price`
    // which both blocked a legit ₹0 extra AND let a non-numeric value through
    // as NaN, corrupting the folio's cost math.
    if (!label || raw === '') return;
    const price = Number(raw);
    if (!Number.isFinite(price) || price < 0) return;
    const id = 'cx_' + Date.now();
    const ex = { id, label, sub: 'Custom', price, icon: 'plus', custom: true };
    set('customExtras', [...(data.customExtras || []), ex]);
    set('extras', { ...data.extras, [id]: 1 });
    setNewEx({ label: '', price: '' }); setShowAdd(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Card padding={16}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.ink2, letterSpacing: 0.2 }}>{t('leadGuest')}</div>
        </div>
        {showRepeatBanner && (
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 10,
            padding: '10px 12px', marginBottom: 10,
            background: T.indigoLt, borderRadius: 10,
            border: `1px solid ${T.indigo}`,
          }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: T.card, color: T.indigo, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon name="sync" size={14} stroke={2} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.indigo }}>
                {t('repeatGuestQ')} · {repeatMatch.count > 1 ? `${repeatMatch.count} ${t('previousStays')}` : t('previousStayFound')}
              </div>
              <div style={{ fontSize: 11, color: T.ink2, marginTop: 2, lineHeight: 1.35 }}>
                <strong style={{ color: T.ink }}>{repeatMatch.best.guest}</strong>
                {repeatMatch.best.phone ? <> · <span className="tnum">{repeatMatch.best.phone}</span></> : null}
                {repeatMatch.best.country ? ` · ${repeatMatch.best.country}` : ''}
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <button
                  onClick={applyRepeatPrefill}
                  className="atithi-tap"
                  style={{ border: 'none', background: T.indigo, color: '#fff', borderRadius: 7, padding: '6px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                >
                  {t('useTheseDetails')}
                </button>
                <button
                  onClick={() => setDismissedMatchKey(matchKey)}
                  style={{ border: `1px solid ${T.borderSoft}`, background: T.card, color: T.ink3, borderRadius: 7, padding: '6px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                >
                  {t('notTheSame')}
                </button>
              </div>
            </div>
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Field label={t('fullName')} value={data.name} onChange={(e) => set('name', e.target.value)} placeholder={t('asOnIdRequired')} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: T.ink2, letterSpacing: 0.1 }}>{t('country')}</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: T.bgSunk, border: `1px solid ${T.borderSoft}`, borderRadius: 10, padding: '0 12px', height: 44 }}>
              <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0 }}>{country.flag}</span>
              <select
                value={data.country}
                onChange={(e) => {
                  // Re-clamp the typed digits to the NEW country's length so a
                  // 10-digit number left over from a longer-cap country can't
                  // sit there over the new (shorter) limit.
                  const code = e.target.value;
                  const nc = COUNTRIES.find(c => c.code === code) || COUNTRIES[0];
                  set('country', code);
                  set('phone', (data.phone || '').replace(/\D/g, '').slice(0, nc.len));
                }}
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
                <span style={{ fontSize: 11, color: T.indigo, fontWeight: 700 }}>{t('foreignFormCRequired')}</span>
              </div>
            )}
          </div>
          <Field
            label={t('mobile')} type="tel" inputMode="numeric" autoComplete="tel"
            maxLength={country.len}
            value={data.phone}
            // Digit-only + capped at the country's national length: blocks the
            // "letters / 20 digits" input that broke wa.me / tel: links (audit #10).
            onChange={(e) => set('phone', e.target.value.replace(/\D/g, '').slice(0, country.len))}
            prefix={country.dial}
            placeholder={t('mobilePlaceholder')}
            hint={data.phone && data.phone.replace(/\D/g, '').length !== country.len ? t('phoneLenHint').replace('{n}', country.len) : undefined}
          />
          <Field label={t('emailOptional')} type="email" inputMode="email" autoComplete="email" value={data.email} onChange={(e) => set('email', e.target.value)} placeholder={t('emailPlaceholder')} />
          {(!data.name.trim() || (data.phone || '').replace(/\D/g, '').length !== country.len) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: T.warnLt, borderRadius: 8 }}>
              <Icon name="info" size={11} color="oklch(48% 0.14 75)" />
              <span style={{ fontSize: 11, color: 'oklch(40% 0.14 75)', fontWeight: 600 }}>{t('nameMobileRequired')}</span>
            </div>
          )}
        </div>
      </Card>

      <Card padding={16}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.ink2, letterSpacing: 0.2 }}>{t('extras')}</div>
          <button onClick={() => setShowAdd(s => !s)} style={{ background: 'none', border: 'none', color: T.primary, fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Icon name={showAdd ? 'x' : 'plus'} size={11} stroke={2.2} /> {showAdd ? t('cancel') : t('addCustom')}
          </button>
        </div>
        {showAdd && (
          <div style={{ marginBottom: 10, padding: 8, background: T.primaryLt, borderRadius: 8 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              <input autoFocus placeholder={t('addCustomExtraPlaceholder')} value={newEx.label} onChange={e => setNewEx({ ...newEx, label: e.target.value })} style={{ flex: 1, border: `1px solid ${T.border}`, outline: 'none', borderRadius: 6, padding: '6px 8px', fontSize: 12, fontWeight: 600, background: T.card }} />
              <input onFocus={(e) => e.target.select()} type="number" placeholder="₹" value={newEx.price} onChange={e => setNewEx({ ...newEx, price: e.target.value })} className="tnum" style={{ width: 64, border: `1px solid ${T.border}`, outline: 'none', borderRadius: 6, padding: '6px 8px', fontSize: 12, fontWeight: 700, background: T.card }} />
              <button onClick={addCustom} style={{ border: 'none', background: T.primary, color: '#fff', borderRadius: 6, padding: '0 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{t('add')}</button>
            </div>
            <div style={{ marginTop: 6, fontSize: 10, color: T.primaryDk, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
              <Icon name="info" size={10} stroke={2.2} /> {t('savedForFuture')}
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
                    {ex.custom && <span style={{ fontSize: 9, fontWeight: 700, color: T.indigo, background: T.indigoLt, padding: '1px 5px', borderRadius: 4, letterSpacing: 0.2 }}>{t('badgeSaved')}</span>}
                  </div>
                  {!isEditingPrice ? (
                    <div className="tnum" style={{ fontSize: 11, color: T.ink3, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>{ex.sub || ex.unit || t('perStay')} · ₹{(ex.price || 0).toLocaleString('en-IN')}</span>
                      <button onClick={() => setEditingPriceId(ex.id)} style={{ background: 'none', border: 'none', color: T.primary, cursor: 'pointer', padding: 0, display: 'inline-flex' }}>
                        <Icon name="edit" size={10} stroke={2.2} />
                      </button>
                      {ex.custom && (
                        <button onClick={() => {
                          // Remove from the CURRENT booking — qty, any price
                          // override, and the locally-added custom entry — not
                          // just the global saved pool. Previously the trash
                          // only called onRemoveSavedExtra (which filters the
                          // saved pool), so a custom extra that also lived in
                          // data.customExtras stayed on the row and kept being
                          // billed: the button looked completely dead.
                          set('customExtras', (data.customExtras || []).filter(x => x.id !== ex.id));
                          const { [ex.id]: _q, ...restE } = data.extras; set('extras', restE);
                          const { [ex.id]: _p, ...restP } = data.extraPrices; set('extraPrices', restP);
                          if (onRemoveSavedExtra) onRemoveSavedExtra(ex.id);
                        }} title={t('forgetSavedExtra')} style={{ background: 'none', border: 'none', color: T.ink3, cursor: 'pointer', padding: 0, display: 'inline-flex' }}>
                          <Icon name="trash" size={10} stroke={2.2} />
                        </button>
                      )}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                      <span style={{ fontSize: 11, color: T.ink3, fontWeight: 600 }}>₹</span>
                      <NumberInput autoFocus value={ex.price} min={0} onChange={(n) => set('extraPrices', { ...data.extraPrices, [ex.id]: n })} className="tnum" style={{ width: 60, border: `1px solid ${T.primary}`, outline: 'none', borderRadius: 5, padding: '2px 6px', fontSize: 11, fontWeight: 700, background: T.card, color: T.primary }} />
                      <button onClick={() => setEditingPriceId(null)} style={{ border: 'none', background: T.primary, color: '#fff', borderRadius: 5, padding: '3px 8px', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>OK</button>
                      {!ex.custom && data.extraPrices[ex.id] != null && (
                        <button onClick={() => { const { [ex.id]: _, ...rest } = data.extraPrices; set('extraPrices', rest); setEditingPriceId(null); }} style={{ border: 'none', background: 'none', color: T.ink3, fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>{t('reset')}</button>
                      )}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {qty > 0 && <button onClick={() => {
                    // Drop to 0 → remove the key entirely instead of leaving a
                    // `{ [id]: 0 }` entry that lingers in the saved booking JSON.
                    if (qty - 1 <= 0) { const { [ex.id]: _q, ...rest } = data.extras; set('extras', rest); }
                    else set('extras', { ...data.extras, [ex.id]: qty - 1 });
                  }} style={miniStepBtn}>−</button>}
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

      {/* Removed: cosmetic "Send WhatsApp confirmation" toggle, "ID proof"
          picker, and "Business GSTIN" card. None of those were wired —
          WhatsApp Business API isn't connected, the ID options weren't
          persisted, and the form-level GSTIN never made it onto the
          booking. They'll come back when the integrations land. The B2B
          GSTIN flows through the Issue Invoice sheet (Invoicing tier),
          where it actually appears on the tax invoice. */}
    </div>
  );
}

function StepPayment({ data, set, subtotal, gst, total, withTax, roomsSubtotal, extrasTotal, mealCost, extraGuestCost = 0, mealPlan, blendedRate = 5, t, plan, property, isEdit = false }) {
  const isInvoicingPlan = plan === 'invoicing';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Card padding={16}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.ink2, letterSpacing: 0.2 }}>{t('summary')}</div>
          {isInvoicingPlan && (
            <Chip color={withTax ? 'indigo' : 'soft'} style={{ fontSize: 9 }}>{withTax ? t('inCaExport') : t('skipCaExport')}</Chip>
          )}
        </div>
        {isInvoicingPlan && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: T.bgSoft, border: `1px solid ${T.borderSoft}`, borderRadius: 10, marginBottom: 12 }}>
            <Icon name="tag" size={14} color={withTax ? T.indigo : T.ink3} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.ink }}>{t('includeInInvoiceRegister')}</div>
              <div style={{ fontSize: 10.5, color: T.ink3, fontWeight: 600, lineHeight: 1.35, marginTop: 2 }}>
                {withTax ? t('invInclYes') : t('invInclNo')}
              </div>
            </div>
            <Toggle on={withTax} onChange={(v) => set('gstApplies', v)} />
          </div>
        )}
        <Row label={t('tariffLine').replace('{n}', data.nights).replace('{rooms}', `${data.roomItems.length} ${data.roomItems.length>1?t('rooms'):t('room')}`)} value={`₹${roomsSubtotal.toLocaleString('en-IN')}`} />
        {mealPlan && mealCost !== 0 && (
          <Row label={t('mealPlanLine').replace('{code}', mealPlan.code).replace('{label}', mealPlan.label)} value={mealCost < 0 ? `− ₹${Math.abs(mealCost).toLocaleString('en-IN')}` : `₹${mealCost.toLocaleString('en-IN')}`} />
        )}
        {extrasTotal > 0 && <Row label={t('extrasLine').replace('{n}', Object.values(data.extras).reduce((a,b)=>a+b,0))} value={`₹${extrasTotal.toLocaleString('en-IN')}`} />}
        {extraGuestCost > 0 && <Row label={t('extraGuestCharges')} value={`₹${extraGuestCost.toLocaleString('en-IN')}`} />}
        {withTax && <Row label={`CGST ${(blendedRate / 2).toFixed(blendedRate % 2 ? 1 : 0)}% · ${t('incl')}`} value={`₹${Math.round(gst/2).toLocaleString('en-IN')}`} />}
        {withTax && <Row label={`SGST ${(blendedRate / 2).toFixed(blendedRate % 2 ? 1 : 0)}% · ${t('incl')}`} value={`₹${(gst - Math.round(gst/2)).toLocaleString('en-IN')}`} />}
        <div style={{ height: 1, background: T.borderSoft, margin: '8px 0' }} />
        <Row label={t('total')} value={`₹${total.toLocaleString('en-IN')}`} bold />
        {withTax && <div style={{ fontSize: 10, color: T.ink3, fontWeight: 600, marginTop: 4 }}>{t('taxInTotalNote')}</div>}
      </Card>

      {isEdit ? (
        <Card padding={16} style={{ background: T.bgSoft, borderColor: T.borderSoft }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <Icon name="info" size={15} color={T.ink3} />
            <div style={{ fontSize: 11.5, color: T.ink2, fontWeight: 600, lineHeight: 1.5 }}>
              {t('paymentsNotChangedHere')}
              <strong> {t('addPaymentBold')}</strong> {t('onBookingPageAfterSave')}
            </div>
          </div>
        </Card>
      ) : (
      <Card padding={16}>
        <div style={{ fontSize: 12, fontWeight: 700, color: T.ink2, letterSpacing: 0.2, marginBottom: 6 }}>{t('collectNow')}</div>
        <div style={{ fontSize: 10.5, color: T.ink3, fontWeight: 600, lineHeight: 1.4, marginBottom: 12 }}>{t('collectNowHint')}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 6, marginBottom: 12 }}>
          {[
            { id: 'full',   label: t('payFull'),   sub: `₹${total.toLocaleString('en-IN')}` },
            { id: 'half',   label: t('payHalf'),    sub: `₹${Math.round(total/2).toLocaleString('en-IN')}` },
            { id: 'custom', label: t('payCustom'), sub: data.payCustom > 0 ? `₹${(+data.payCustom).toLocaleString('en-IN')}` : t('enterAmt') },
            { id: 'none',   label: t('payNone'),   sub: t('payLater') },
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
            <span style={{ fontSize: 11, fontWeight: 700, color: T.primaryDk }}>{t('customAmount')}</span>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 4, background: T.card, border: `1.5px solid ${T.primary}`, borderRadius: 7, padding: '0 10px', height: 36 }}>
              <span style={{ fontSize: 13, color: T.ink3, fontWeight: 600 }}>₹</span>
              <NumberInput autoFocus value={data.payCustom || 0} min={0} max={total} onChange={(n) => set('payCustom', n)} placeholder="0" className="tnum" style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 15, fontWeight: 700, color: T.ink }} />
              <span style={{ fontSize: 10, color: T.ink3 }}>{t('ofAmount').replace('{amt}', total.toLocaleString('en-IN'))}</span>
            </div>
          </div>
        )}
        {data.payAmount && data.payAmount !== 'none' && (
          <>
            <div style={{ fontSize: 11, color: T.ink3, fontWeight: 600, marginBottom: 8 }}>{t('methodLabel')}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <PayMethod icon="qr" label={t('payUpiQr')} sub={t('payUpiQrSub')} selected={data.payMethod === 'upi'} onClick={() => set('payMethod', 'upi')} />
              <PayMethod icon="wa" label={t('payWhatsapp')} sub={t('payWhatsappSub')} selected={data.payMethod === 'wa'} onClick={() => set('payMethod', 'wa')} />
              <PayMethod icon="inr" label={t('payCash')} sub={t('payCashAtReception')} selected={data.payMethod === 'cash'} onClick={() => set('payMethod', 'cash')} />
              <PayMethod icon="tag" label={t('payCard')} sub={t('payCardManual')} selected={data.payMethod === 'card'} onClick={() => set('payMethod', 'card')} />
            </div>
          </>
        )}
      </Card>
      )}

      {!isEdit && data.payMethod === 'upi' && (() => {
        const qrUrl = property?.profile?.paymentQrDataUrl || '';
        const qrLabel = property?.profile?.paymentQrLabel || '';
        return (
          <Card padding={20} style={{ background: T.indigoLt, borderColor: T.indigo, alignItems: 'center', textAlign: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              {qrUrl ? (
                <>
                  <div style={{ width: 160, height: 160, background: '#fff', borderRadius: 14, padding: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <img src={qrUrl} alt="Payment QR" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  </div>
                  {qrLabel && <div style={{ fontSize: 11, color: T.ink2, fontWeight: 600 }}>{qrLabel}</div>}
                  <div style={{ fontSize: 11, color: T.ink3 }}>{t('qrShowToGuest')}</div>
                </>
              ) : (
                <>
                  <div style={{ width: 160, height: 160, background: '#fff', borderRadius: 14, padding: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px dashed ${T.border}` }}>
                    <Icon name="qr" size={48} color={T.ink3} />
                  </div>
                  <div style={{ fontSize: 12, color: T.ink2, fontWeight: 700 }}>{t('noQrUploaded')}</div>
                  <div style={{ fontSize: 11, color: T.ink3, lineHeight: 1.5, maxWidth: 240 }}>
                    {(() => {
                      const parts = t('uploadQrHint').split('{path}');
                      return <>{parts[0]}<strong>{t('qrSettingsPath')}</strong>{parts[1] || ''}</>;
                    })()}
                  </div>
                </>
              )}
            </div>
          </Card>
        );
      })()}
    </div>
  );
}

// Recover adults / children from a booking's `guests` label (e.g. "2A 1C")
// for legacy bookings that have no roomItems[] to seed the edit form from.
// Without this the edit form fell back to a hardcoded 2 adults / 0 children,
// so editing an old "2A 1C" booking silently dropped the real adult count
// and every child. The free/half/full band isn't encoded in the label, so
// recovered children land in the half-rate band (`children`) — a sensible
// default the hotelier can re-bucket; the point is to not lose the count.
function parseGuestsLabel(label) {
  const s = String(label || '');
  const a = s.match(/(\d+)\s*A/i);
  const c = s.match(/(\d+)\s*C/i);
  return {
    adults: a ? parseInt(a[1], 10) : 2,
    children: c ? parseInt(c[1], 10) : 0,
  };
}

export default function NewBooking({ go, onCreate, plan = 'engine', t, editing, prefill, savedCustomExtras = [], onRemoveSavedExtra, rateOverrides = {}, property, bookings = [], onVoiceBooking }) {
  const ROOM_TYPES = effectiveRoomTypes(property);
  const isEdit = !!editing;
  const [step, setStep] = useState(1);
  const [data, setData] = useState(() => {
    if (editing) {
      // Seed roomItems with per-room roomTypeId. Legacy single-type
      // bookings have a booking-level roomTypeId but no per-item one;
      // copy it onto each item for the edit form.
      const seedGuests = parseGuestsLabel(editing.guests);
      const seedItems = (editing.roomItems && editing.roomItems.length > 0)
        ? editing.roomItems.map(r => ({ ...r, roomTypeId: r.roomTypeId || editing.roomTypeId, childBands: childCountsForItem(r) }))
        : [{ roomTypeId: editing.roomTypeId, adults: seedGuests.adults, children: seedGuests.children, rate: null, childBands: childCountsForItem({ children: seedGuests.children }) }];
      return {
        // Editing path: seed check-in from the existing booking's startIdx.
        checkIn: idxToDate(editing.startIdx || 0),
        nights: editing.nights,
        roomTypeId: editing.roomTypeId,
        roomItems: seedItems,
        name: editing.guest, phone: (editing.phone || '').replace(/^\+\d+\s*/, ''), email: editing.email || '', country: editing.country || 'IN', state: editing.state || '', gstin: '',
        notes: editing.notes || '', source: 'walk-in', hold: false, holdHours: property?.accountant?.holdHours ?? 4,
        // Edit path: seed 'none' (not 'full'). Editing never recomputes what's
        // been paid (onCreate preserves existing.paid and StepPayment shows the
        // "payments aren't changed here" card instead of the picker), so this is
        // inert today — but a 'full' default here is a footgun if that ever
        // changes: it would silently mark an edited booking paid-in-full.
        payMethod: null, payAmount: 'none', payCustom: 0,
        extras: editing.extras || {}, customExtras: editing.customExtras || [], extraPrices: editing.extraPrices || {},
        gstApplies: typeof editing.gstApplies === 'boolean' ? editing.gstApplies : (!!editing.channel && editing.channel !== 'direct'),
        mealPlanId: editing.mealPlanId || startingMealPlanId(property),
        ratePlanId: editing.ratePlanId || defaultRatePlanId(),
      };
    }
    // New booking. A prefill payload may seed the date + room type (Diary
    // cell-click sends just those two) — or, when it comes from the voice
    // flow, also nights, occupancy, per-night rate, payment, and guest.
    // Anything the payload doesn't carry falls back to the blank-wizard
    // defaults, so the existing Diary path is unchanged.
    const pf = prefill || {};
    const numOr = (v, d) => (Number.isFinite(v) ? v : d);
    const seedRoomType = pf.roomTypeId || null;
    return {
      checkIn: pf.date || '', nights: numOr(pf.nights, 1) > 0 ? numOr(pf.nights, 1) : 1,
      roomTypeId: seedRoomType,
      roomItems: [{
        roomTypeId: seedRoomType,
        adults: numOr(pf.adults, 2),
        children: numOr(pf.children, 0),
        childrenFree: numOr(pf.childrenFree, 0),
        childrenFull: numOr(pf.childrenFull, 0),
        childBands: childCountsForItem({ childrenFree: numOr(pf.childrenFree, 0), children: numOr(pf.children, 0), childrenFull: numOr(pf.childrenFull, 0) }),
        rate: Number.isFinite(pf.rate) ? pf.rate : null,
      }],
      name: pf.name || '', phone: pf.phone || '', email: pf.email || '', country: pf.country || 'IN', state: '', gstin: '',
      notes: pf.notes || '', source: 'walk-in', hold: false, holdHours: property?.accountant?.holdHours ?? 4,
      payMethod: pf.payMethod || null, payAmount: pf.payAmount || 'none', payCustom: numOr(pf.payCustom, 0),
      extras: {}, customExtras: [], extraPrices: {},
      // New bookings created here are channel='direct', so GST defaults to off.
      // Hotelier toggles it on via the GST switch on Step 4 if needed.
      gstApplies: false,
      // Default to the first enabled plan. Used to always be 'ep' but the
      // hotelier can now disable EP (e.g. an all-MAP camp), so we look up
      // the active default at booking-create time. A voice prefill may
      // override it with a spoken plan.
      mealPlanId: pf.mealPlanId || startingMealPlanId(property),
      // Rate plan defaults to "Standard". Hotelier picks a different one
      // on Step 2 if multiple plans are enabled.
      ratePlanId: defaultRatePlanId(),
    };
  });

  // Dirty flag for "discard unsaved edit?" confirm. Initial state of
  // `data` is the seed (either the editing booking or the new-booking
  // defaults). First call to set() flips dirty=true. On back / cancel
  // we surface a confirm if dirty + edit mode.
  const [dirty, setDirty] = useState(false);
  const set = (k, v) => { setDirty(true); setData(d => ({ ...d, [k]: v })); };
  // Submitting flag to disable Confirm Booking after the first tap.
  // Without this, a flaky-network double-tap creates two booking
  // rows for the same guest (BK-XXXX then BK-XXXY) since the cloud
  // round-trip takes ~500ms and the button stays enabled the whole
  // time. The flag stays true until App.jsx navigates away (to
  // booking-confirmed), so we don't need to manually reset it.
  const [submitting, setSubmitting] = useState(false);
  const doConfirm = async () => {
    if (submitting) return;
    if (!guestValid) return;
    setSubmitting(true);
    try {
      await onCreate(data, total);
    } catch {
      // onCreate handles its own toasts; re-enable the button so
      // the hotelier can retry instead of being stuck.
      setSubmitting(false);
    }
  };
  const safeBack = () => {
    // No confirm needed if nothing's changed.
    if (!dirty) {
      isEdit ? go('booking', editing.id) : go('home');
      return;
    }
    if (window.confirm(isEdit
      ? t('discardEditConfirm').replace('{id}', editing.id)
      : t('discardDraftConfirm'))) {
      isEdit ? go('booking', editing.id) : go('home');
    }
  };
  // Tax applies only when the hotelier is on the Invoicing add-on AND has
  // toggled "include in invoice register" on for this booking. Engine and
  // Channels tiers always treat the price as a flat tariff (no CGST/SGST
  // rows in the folio).
  const withTax = plan === 'invoicing' && !!data.gstApplies;

  // The booking's first night as a day index from ANCHOR (today). Past
  // dates are allowed (a walk-in recorded late), so this can be negative.
  const startIdx = data.checkIn ? dateToIdx(data.checkIn) : 0;
  // Per-night rate: delegates to the shared ratePerNight() helper so the
  // hotelier sees the EXACT same price the public widget would quote for the
  // same date — honouring per-day overrides, property.weekendRules, and
  // seasons. nightIdx is the offset within the stay (0 = first night), so the
  // real calendar day is startIdx + nightIdx. (Previously this used
  // dayIdx = nightIdx, pricing every booking as if it started today, plus a
  // hardcoded Fri/Sat 1.2x and no seasons.) The rate-plan tier is applied
  // separately on the room subtotal below so it isn't double-counted.
  const rateForNight = useMemo(() => (roomTypeId, nightIdx) =>
    ratePerNight(property, rateOverrides, roomTypeId, startIdx + nightIdx),
  [property, rateOverrides, startIdx]);

  // Per-room subtotal: each item uses its own roomTypeId (with the booking-
  // level data.roomTypeId as a fallback for legacy single-type bookings).
  // The rate-plan multiplier (Standard / Flexible / Non-refundable) is
  // applied to the room subtotal — extras / meal plans / GST land on top.
  const ratePlanMult = ratePlanMultiplier(property, data.ratePlanId);
  // Two buckets: solo-rate rooms are a FINAL price the hotelier set (the
  // rate-plan tier does NOT stack on them — same contract as singleOccRateFor's
  // "weekend / season are not stacked" rule, and matching what the public
  // widget quotes). Every other room takes the rate-plan multiplier. Rounding
  // once at the very end keeps the common single-room booking identical to the
  // widget's quote (no per-night-vs-per-stay drift).
  let soloSubtotalRaw = 0;   // single-occupancy auto-rate rooms — final, no uplift
  let planSubtotalRaw = 0;   // normal / manually-rated rooms — get ratePlanMult
  data.roomItems.forEach(r => {
    const typeId = r.roomTypeId || data.roomTypeId;
    const type = typeId ? ROOM_TYPES.find(rt => rt.id === typeId) : null;
    if (!type) return;
    const sr = singleOccRateFor(r, type, property);
    // itemSubtotal sums each night's real rate (startIdx + n) via rateForNight,
    // so a stay spanning a weekend / season / per-day override is priced
    // night-by-night. Same function the RoomItemCard uses, so per-room display
    // and the booking total never disagree.
    const sub = itemSubtotal(r, type, data.nights, rateForNight, sr);
    // Only the AUTO solo rate is final; a manually-typed per-room rate still
    // takes the rate plan (the hotelier opted into that number as a base).
    if (sr != null && r.rate == null) soloSubtotalRaw += sub;
    else planSubtotalRaw += sub;
  });
  const roomsSubtotalRaw = soloSubtotalRaw + planSubtotalRaw;  // pre-multiplier (unused downstream beyond the total)
  const roomsSubtotal = Math.round(planSubtotalRaw * ratePlanMult + soloSubtotalRaw);

  // All rooms must have a type chosen before Step 2 can be completed.
  const roomsValid = data.roomItems.length > 0 && data.roomItems.every(r => !!(r.roomTypeId || data.roomTypeId));
  // For the bottom-bar total summary — show only when at least one room
  // has a type picked.
  const anyRoomTyped = data.roomItems.some(r => !!(r.roomTypeId || data.roomTypeId));

  // Merge: defaults + globally-saved customs + locally-added (not yet saved) customs.
  const mergedCustoms = [
    ...savedCustomExtras,
    ...(data.customExtras || []).filter(x => !savedCustomExtras.some(s => s.id === x.id)),
  ];
  // Custom (saved) extras carry { name, unit } but the picker UI was written
  // for the default shape { label, sub, icon, custom }. Normalise so a saved
  // extra shows its name (instead of a blank row), gets the SAVED badge, and
  // exposes its remove button — previously all three silently no-op'd because
  // savedCustomExtras have no `label` / `custom` fields.
  // The extras picker shows ONLY this property's own add-ons (its saved pool +
  // anything added inline this booking) — NOT the hardcoded desert-camp
  // EXTRAS_DEFAULT (camel safari / bonfire …), which used to be prepended for
  // EVERY property and couldn't be removed (audit #5). A fresh hotelier starts
  // with an empty list + the "+ Add extra" escape hatch; the demo seeds its
  // pool with the camp extras so it still looks complete. (extrasBreakdownFor
  // in data.js keeps EXTRAS_DEFAULT in its lookup catalog so any OLD booking
  // that referenced those ids still itemises correctly on the folio/voucher.)
  const allExtras = [
    ...mergedCustoms.map(ex => ({ ...ex, label: ex.label || ex.name, custom: true })),
  ].map(ex => ({
    ...ex,
    price: data.extraPrices[ex.id] != null ? data.extraPrices[ex.id] : ex.price,
  }));
  const totalGuests = data.roomItems.reduce((s, r) => s + (r.adults || 0) + childTotalForItem(r), 0);
  // Extras honour their unit, matching the public widget: per stay (×1) /
  // per night (×nights) / per guest (×guests) / per guest per night
  // (×guests×nights). Default extras carry no unit → per-stay (price × qty,
  // unchanged). Saved custom extras with a unit were previously undercounted
  // here as a flat price × qty — a "₹500 per night" add-on showed ₹500 for a
  // 3-night stay on this screen but ₹1,500 on the widget for the same stay.
  const extrasTotal = Object.entries(data.extras).reduce((sum, [id, qty]) => {
    const ex = allExtras.find(x => x.id === id);
    if (!ex || !qty) return sum;
    let mult = 1;
    switch (ex.unit) {
      case 'per night': mult = data.nights || 1; break;
      case 'per guest': mult = totalGuests; break;
      case 'per guest per night': mult = totalGuests * (data.nights || 1); break;
      default: mult = 1; // 'per stay' + all default extras
    }
    return sum + (ex.price || 0) * qty * mult;
  }, 0);
  // Meal plan cost: delta from the property's default plan × guests ×
  // nights. The calendar rate is treated as already including the
  // default plan, so picking the same plan costs 0; cheaper plans yield
  // a negative delta (discount); pricier plans add to the total.
  const mealPlans = Array.isArray(property?.mealPlans) ? property.mealPlans.filter(p => p.enabled) : [];
  const selectedMealPlan = mealPlans.find(p => p.id === data.mealPlanId);
  const defaultMpId = property?.defaultMealPlanId || 'ep';
  const defaultMealPlan = mealPlans.find(p => p.id === defaultMpId);
  const mealDeltaPrice = (selectedMealPlan?.price || 0) - (defaultMealPlan?.price || 0);
  // Floor the meal delta at -roomsSubtotal: a cheaper-than-default plan gives a
  // negative delta (a refund of the bundled meal cost), but it must never drag
  // the subtotal below the room tariff — otherwise a big MAP→EP downgrade on a
  // multi-guest, multi-night stay could make the folio show a sub-tariff (even
  // negative) total. (audit Batch-2 meal-plan floor)
  const mealCost = selectedMealPlan ? Math.max(-roomsSubtotal, mealDeltaPrice * totalGuests * data.nights) : 0;
  // Extra-adult / extra-child surcharge based on per-category rules. The
  // booking object is shaped like a saved booking so extraGuestCostFor()
  // can compute against it the same way the cloud-side / voucher does.
  const extraGuestCost = extraGuestCostFor({
    roomItems: data.roomItems,
    nights: data.nights,
    roomTypeId: data.roomTypeId,
    // R8-12: pass startIdx so seasonOverrideFor() can apply a season's
    // extra-guest override. Without it the live total used category-default
    // rates while the saved booking's folio (which has startIdx) used the
    // season rate — the two diverged.
    startIdx: data.checkIn ? dateToIdx(data.checkIn) : 0,
  }, property);
  const subtotal = roomsSubtotal + extrasTotal + mealCost + extraGuestCost;
  // Blended GST rate across rooms — different categories sit in different
  // Indian GST slabs (≤₹1k exempt, ₹1,001–₹7,499 = 5%, ≥₹7,500 = 18%;
  // the old 12% mid-slab was retired on 22 Sep 2025).
  let blendedRate = 5;
  if (withTax) {
    let ws = 0, tw = 0;
    for (const it of data.roomItems) {
      const cat = ROOM_TYPES.find(c => c.id === (it.roomTypeId || data.roomTypeId));
      if (!cat) continue;
      const r = gstRateForCategory(cat);
      const w = (it.rate != null ? it.rate : (cat.base || 0)) || 1;
      ws += r * w; tw += w;
    }
    if (tw > 0) blendedRate = ws / tw;
  }
  // GST is treated as INCLUSIVE — the subtotal (room + meals + extras +
  // extra-guest) IS what the guest pays; the tax is extracted from
  // within it, never added on top. This matches every other surface
  // (BookingDetail folio, getTaxBreakdown, the voucher, the IssueInvoice
  // sheet, and the "shown inside the price" UI copy). The old code did
  // `total = subtotal + gst` (tax-exclusive), which overcharged the
  // guest on every taxed booking — e.g. a ₹4,500 5%-slab room billed
  // ₹4,725 while the hotelier believed "₹4,500 inclusive".
  const gst = withTax ? Math.round(subtotal * blendedRate / (100 + blendedRate)) : 0;
  const total = subtotal;

  // Warnings for the hotelier on Step 4: per-unit close-outs that
  // overlap this booking, whole-type close-outs, and overbooking.
  // These DON'T block the confirm button — the hotelier may have a
  // good reason to override (off-channel walk-in, friend-of-the-
  // family stay, etc). They're heads-up notes, not gates.
  const bookingWarnings = useMemo(() => {
    if (!data.checkIn || !data.nights) return [];
    const startIdx = dateToIdx(data.checkIn);
    if (startIdx == null) return [];
    const out = [];
    const items = data.roomItems || [];
    const startDate = new Date(ANCHOR);
    startDate.setDate(startDate.getDate() + startIdx);
    const fmtDay = (idx) => {
      const d = new Date(ANCHOR);
      d.setDate(d.getDate() + idx);
      return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
    };
    // Group room items by type so we report per-type warnings cleanly.
    const byType = items.reduce((acc, r) => {
      const tid = r.roomTypeId || data.roomTypeId;
      if (!tid) return acc;
      acc[tid] = (acc[tid] || 0) + 1;
      return acc;
    }, {});
    for (const [typeId, count] of Object.entries(byType)) {
      const rt = ROOM_TYPES.find(r => r.id === typeId);
      if (!rt) continue;
      // Per-night closures + competing bookings for this type.
      let maxBookedHere = 0;
      let maxBlockedHere = 0;
      const closedDays = [];
      const partialDays = [];
      for (let d = startIdx; d < startIdx + data.nights; d++) {
        const o = rateOverrides[`${typeId}:${d}`];
        if (o && o.closed) closedDays.push(fmtDay(d));
        if (o && Array.isArray(o.closedUnits) && o.closedUnits.length > 0) {
          partialDays.push({ day: fmtDay(d), n: o.closedUnits.length });
        }
        // Existing bookings (excluding this one) overlapping this day for this type.
        const overlapping = (bookings || []).filter(b => {
          if (b.id === editing?.id) return false;
          if (b.status === 'cancelled') return false;
          const bStart = b.startIdx || 0;
          const bEnd = bStart + (b.nights || 1);
          if (d < bStart || d >= bEnd) return false;
          const bItems = Array.isArray(b.roomItems) && b.roomItems.length
            ? b.roomItems
            : [{ roomTypeId: b.roomTypeId }];
          return bItems.some(it => (it.roomTypeId || b.roomTypeId) === typeId);
        });
        const booked = overlapping.reduce((s, b) => {
          const bItems = Array.isArray(b.roomItems) && b.roomItems.length
            ? b.roomItems
            : [{ roomTypeId: b.roomTypeId }];
          return s + bItems.filter(it => (it.roomTypeId || b.roomTypeId) === typeId).length;
        }, 0);
        if (booked > maxBookedHere) maxBookedHere = booked;
        const closedCount = (o && Array.isArray(o.closedUnits)) ? o.closedUnits.length : 0;
        if (booked + closedCount > maxBlockedHere) maxBlockedHere = booked + closedCount;
      }
      if (closedDays.length > 0) {
        out.push({
          severity: 'block',
          icon: 'x',
          text: t('warnClosedOn').replace('{name}', rt.name).replace('{days}', closedDays.join(', ')),
        });
      }
      if (partialDays.length > 0) {
        const summary = partialDays.map(p => `${p.day} (${p.n})`).join(', ');
        out.push({
          severity: 'note',
          icon: 'bed',
          text: t('warnBlockedUnits').replace('{name}', rt.name).replace('{summary}', summary),
        });
      }
      // Overbooking check: this booking adds `count` rooms of this type.
      // If maxBookedHere + count > total units, we're overbooking.
      const total = rt.units || 0;
      if (maxBookedHere + count > total) {
        const over = (maxBookedHere + count) - total;
        const overLabel = `${over} ${over === 1 ? t('room') : t('rooms')}`;
        out.push({
          severity: 'warn',
          icon: 'info',
          text: t('warnOverbook').replace('{name}', rt.name).replace('{over}', overLabel).replace('{total}', total),
        });
      }
    }
    return out;
  }, [data.checkIn, data.nights, data.roomItems, data.roomTypeId, rateOverrides, bookings, editing?.id, ROOM_TYPES]);

  const titles = [t('stayDetails'), t('pickRoom'), t('guest'), t('payment')];
  const datesValid = !!data.checkIn && data.nights > 0;
  // Phone must be exactly the selected country's national length (digits only).
  // The input already strips non-digits + caps at this length, so a valid new
  // booking naturally reaches it; editing a legacy odd-length number prompts a
  // quick correction (the field shows a "{n}-digit" hint).
  const guestCountry = COUNTRIES.find(c => c.code === data.country) || COUNTRIES[0];
  const guestPhoneLen = (data.phone || '').replace(/\D/g, '').length;
  const guestValid = data.name.trim().length > 0 && guestPhoneLen === guestCountry.len;
  // Step-4 payment sanity (new bookings only — editing never touches payment):
  // a "Custom" advance must be > ₹0, and any recorded payment must name a
  // method. "Not yet" (nothing received) needs neither. Without this the
  // booking could confirm with a ₹0 custom advance or a payment with no method.
  const paymentValid = isEdit || data.payAmount === 'none' || !data.payAmount
    ? true
    : (data.payAmount === 'custom' ? (+data.payCustom > 0 && !!data.payMethod) : !!data.payMethod);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: T.bg }}>
      <ScreenHeader
        title={isEdit ? t('editReservation') : titles[step - 1]}
        subtitle={isEdit ? `${editing.id} · ${titles[step - 1]}` : `${t('step')} ${step} ${t('of2')} 4`}
        onBack={() => step > 1 ? setStep(step - 1) : safeBack()}
      />
      <div style={{ display: 'flex', gap: 4, padding: '8px 16px 12px', background: T.card, borderBottom: `1px solid ${T.borderSoft}` }}>
        {[1, 2, 3, 4].map(s => (
          <div key={s} style={{ flex: 1, height: 3, borderRadius: 2, background: s <= step ? T.primary : T.bgSoft, transition: 'background .2s' }} />
        ))}
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '20px 16px 100px' }}>
        {step === 1 && (
          <>
            {!isEdit && onVoiceBooking && (
              <button onClick={onVoiceBooking} className="atithi-tap" style={{
                width: '100%', border: `1px solid ${T.border}`, cursor: 'pointer', borderRadius: 12,
                padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 11, marginBottom: 16,
                background: T.card, color: T.ink,
              }}>
                <span style={{ width: 32, height: 32, borderRadius: '50%', background: `color-mix(in oklch, ${T.primary} 12%, white)`, color: T.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3"/></svg>
                </span>
                <span style={{ textAlign: 'left', flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700 }}>{t('voiceFillTitle')}</span>
                  <span style={{ display: 'block', fontSize: 11, color: T.ink3, fontWeight: 500 }}>{t('voiceFillSub')}</span>
                </span>
                <Icon name="chev" size={14} color={T.ink3} />
              </button>
            )}
            <StepDates data={data} set={set} t={t} property={property} childAgeBelow={property?.accountant?.childAgeBelow ?? 12} childFreeAge={property?.accountant?.childFreeBelowAge ?? 5} childHalfAge={property?.accountant?.childAgeBelow ?? 12} />
          </>
        )}
        {step === 2 && <StepRoom data={data} set={set} t={t} rateForNight={rateForNight} roomTypes={ROOM_TYPES} mealPlans={property?.mealPlans || []} ratePlans={effectiveRatePlans(property)} property={property} />}
        {step === 3 && <StepGuest data={data} set={set} t={t} allExtras={allExtras} onRemoveSavedExtra={onRemoveSavedExtra} bookings={bookings} editingId={editing?.id} />}
        {step === 4 && (
          <>
            {bookingWarnings.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
                {bookingWarnings.map((w, i) => {
                  const tone = w.severity === 'block'
                    ? { bg: 'oklch(96% 0.04 25)', border: 'oklch(72% 0.14 25)', ink: 'oklch(40% 0.16 25)' }
                    : w.severity === 'warn'
                      ? { bg: 'oklch(96% 0.04 75)', border: 'oklch(72% 0.12 75)', ink: 'oklch(40% 0.14 75)' }
                      : { bg: T.indigoLt, border: T.indigo, ink: T.indigo };
                  return (
                    <div
                      key={i}
                      style={{
                        display: 'flex', gap: 10, alignItems: 'flex-start',
                        padding: '10px 12px', borderRadius: 8,
                        background: tone.bg, border: `1px solid ${tone.border}`,
                      }}
                    >
                      <Icon name={w.icon} size={14} color={tone.ink} stroke={2.2} />
                      <div style={{ fontSize: 11.5, color: tone.ink, lineHeight: 1.5, fontWeight: 600 }}>
                        {w.text}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <StepPayment data={data} set={set} subtotal={subtotal} gst={gst} total={total} withTax={withTax} t={t} roomsSubtotal={roomsSubtotal} extrasTotal={extrasTotal} mealCost={mealCost} extraGuestCost={extraGuestCost} mealPlan={selectedMealPlan} blendedRate={blendedRate} allExtras={allExtras} plan={plan} property={property} isEdit={isEdit} />
          </>
        )}
      </div>

      <div style={{ background: T.card, borderTop: `1px solid ${T.borderSoft}`, padding: '12px 16px 28px', display: 'flex', alignItems: 'center', gap: 10 }}>
        {anyRoomTyped && (
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, color: T.ink3, fontWeight: 600, letterSpacing: 0.3, textTransform: 'uppercase' }}>{t('total')} {withTax ? `· ${t('inclGst')}` : ''}</div>
            <div className="tnum" style={{ fontSize: 18, fontWeight: 700, color: T.ink, letterSpacing: -0.3 }}>₹{total.toLocaleString('en-IN')}</div>
          </div>
        )}
        {step < 4 ? (
          <Btn icon="arrow" onClick={() => {
            if (step === 1 && !datesValid) return;
            if (step === 2 && !roomsValid) return;
            if (step === 3 && !guestValid) return;
            setStep(step + 1);
          }} disabled={(step === 1 && !datesValid) || (step === 2 && !roomsValid) || (step === 3 && !guestValid)} style={{ flex: anyRoomTyped ? 'unset' : 1 }}>{t('continue')}</Btn>
        ) : (
          <Btn icon={submitting ? 'sync' : 'check'} onClick={doConfirm} disabled={!guestValid || !paymentValid || submitting} style={{ flex: anyRoomTyped ? 'unset' : 1 }}>
            {submitting ? (isEdit ? t('savingShort') : t('creatingBooking')) : (isEdit ? t('confirmMove') : t('confirmBooking'))}
          </Btn>
        )}
      </div>
    </div>
  );
}

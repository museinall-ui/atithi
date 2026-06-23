import { T } from '../tokens.js';
import { effectiveRatePlans, singleOccActive } from '../data.js';
import Card from '../components/Card.jsx';
import Toggle from '../components/Toggle.jsx';
import ScreenHeader from '../components/ScreenHeader.jsx';

// Compact +/- stepper used for the night counts.
const stepBtn = (dis) => ({
  width: 40, height: 38, border: 'none', background: 'transparent',
  color: dis ? T.ink4 : T.primary, fontSize: 20, fontWeight: 700,
  cursor: dis ? 'not-allowed' : 'pointer', lineHeight: 1,
});
function Stepper({ value, onChange, min = 1, max = 14, disabled }) {
  const v = Number(value) || min;
  const set = (n) => { if (!disabled) onChange(Math.max(min, Math.min(max, n))); };
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', border: `1px solid ${T.border}`, borderRadius: 9, overflow: 'hidden', opacity: disabled ? 0.5 : 1 }}>
      <button onClick={() => set(v - 1)} disabled={disabled || v <= min} style={stepBtn(disabled || v <= min)}>–</button>
      <span className="tnum" style={{ minWidth: 32, textAlign: 'center', fontSize: 15, fontWeight: 800, color: T.ink }}>{v}</span>
      <button onClick={() => set(v + 1)} disabled={disabled || v >= max} style={stepBtn(disabled || v >= max)}>+</button>
    </div>
  );
}

// Advanced settings — an opt-in home for power features. Each is OFF by
// default so the everyday screens stay simple; flip one on and it starts
// applying. Reached from Settings → Advanced settings.
export default function AdvancedSettings({ go, t, property, onChangeProperty, can = () => true }) {
  const canEdit = can('manage_settings');
  const ml = (property.accountant && property.accountant.minNights) || { enabled: false, weekend: 2, allDays: 1 };

  const setMinNights = (patch) => {
    if (!canEdit) return;
    onChangeProperty(p => ({
      ...p,
      accountant: {
        ...(p.accountant || {}),
        minNights: { enabled: false, weekend: 2, allDays: 1, ...(p.accountant && p.accountant.minNights), ...patch },
      },
    }));
  };

  const weekendDays = (property && property.weekendRules && property.weekendRules.weekendDays) || [0, 6];
  const dows = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const weekendLabel = weekendDays.map(d => dows[d]).join(', ');

  // Multiple rate plans — master toggle. Default ON when the property
  // already has more than the Standard plan (so existing setups aren't
  // changed); explicit flag wins once the hotelier touches the toggle.
  const enabledPlans = effectiveRatePlans(property);
  const rpFlag = property.accountant && property.accountant.ratePlansEnabled;
  const rpOn = rpFlag === undefined ? enabledPlans.length > 1 : !!rpFlag;
  const setRatePlans = (v) => {
    if (!canEdit) return;
    onChangeProperty(p => ({ ...p, accountant: { ...(p.accountant || {}), ratePlansEnabled: v } }));
  };

  // Single-occupancy (per-room solo rate) — master toggle + per-category
  // flat rate. Stored on accountant (no schema migration).
  const soOn = singleOccActive(property);
  const cats = Array.isArray(property.categories) ? property.categories : [];
  const singleRates = (property.accountant && property.accountant.singleRates) || {};
  const setSingleOcc = (v) => {
    if (!canEdit) return;
    onChangeProperty(p => ({ ...p, accountant: { ...(p.accountant || {}), singleOccEnabled: v } }));
  };
  const setSingleRate = (catId, val) => {
    if (!canEdit) return;
    onChangeProperty(p => {
      const acc = p.accountant || {};
      const rates = { ...(acc.singleRates || {}) };
      if (val === '' || val == null) delete rates[catId];
      else rates[catId] = Math.max(0, Math.round(+val || 0));
      return { ...p, accountant: { ...acc, singleRates: rates } };
    });
  };

  // Per-OTA rules (min-stay override + pause). Stored on accountant.channelRules
  // (no migration); the channel manager reads them per OTA when pushing.
  const channelRules = (property.accountant && property.accountant.channelRules) || {};
  const OTA_LIST = [
    { id: 'mmt', name: 'MakeMyTrip' },
    { id: 'goibibo', name: 'Goibibo' },
    { id: 'booking', name: 'Booking.com' },
    { id: 'agoda', name: 'Agoda' },
    { id: 'airbnb', name: 'Airbnb' },
  ];
  const setChannelRule = (ota, patch) => {
    if (!canEdit) return;
    onChangeProperty(p => {
      const acc = p.accountant || {};
      const all = { ...(acc.channelRules || {}) };
      all[ota] = { ...(all[ota] || {}), ...patch };
      return { ...p, accountant: { ...acc, channelRules: all } };
    });
  };
  const setChannelMinNights = (ota, patch) => {
    if (!canEdit) return;
    onChangeProperty(p => {
      const acc = p.accountant || {};
      const all = { ...(acc.channelRules || {}) };
      const cur = all[ota] || {};
      const curMin = cur.minNights || { enabled: false, weekend: 2, allDays: 1 };
      all[ota] = { ...cur, minNights: { ...curMin, ...patch } };
      return { ...p, accountant: { ...acc, channelRules: all } };
    });
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: T.bg }}>
      <ScreenHeader title={t('advancedTitle')} subtitle={t('advancedSub')} onBack={() => go('__back')} />
      <div style={{ flex: 1, overflow: 'auto', padding: 14, paddingBottom: 40 }}>

        <div style={{ fontSize: 12, color: T.ink2, lineHeight: 1.5, marginBottom: 14 }}>
          {t('advancedIntro')}
        </div>

        {/* ── Minimum-night stays ───────────────────────────────── */}
        <Card padding={14} style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>{t('mlTitle')}</div>
              <div style={{ fontSize: 11.5, color: T.ink3, marginTop: 3, lineHeight: 1.45 }}>{t('mlDesc')}</div>
            </div>
            <Toggle on={!!ml.enabled} onChange={(v) => setMinNights({ enabled: v })} />
          </div>
          {ml.enabled && (
            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: T.ink }}>{t('mlWeekend')}</div>
                  <div style={{ fontSize: 10.5, color: T.ink3, marginTop: 1, lineHeight: 1.4 }}>{t('mlWeekendSub').replace('{days}', weekendLabel)}</div>
                </div>
                <Stepper value={ml.weekend} onChange={(n) => setMinNights({ weekend: n })} disabled={!canEdit} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: T.ink }}>{t('mlOther')}</div>
                  <div style={{ fontSize: 10.5, color: T.ink3, marginTop: 1, lineHeight: 1.4 }}>{t('mlOtherSub')}</div>
                </div>
                <Stepper value={ml.allDays} onChange={(n) => setMinNights({ allDays: n })} disabled={!canEdit} />
              </div>
              <div style={{ fontSize: 10.5, color: T.ink3, lineHeight: 1.45, background: T.bgSoft, border: `1px solid ${T.borderSoft}`, borderRadius: 7, padding: '8px 10px' }}>
                {t('mlNote')}
              </div>
            </div>
          )}
        </Card>

        {/* ── Per-channel (OTA) rules ───────────────────────────── */}
        <Card padding={14} style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>Per-channel rules</div>
          <div style={{ fontSize: 11.5, color: T.ink3, marginTop: 3, lineHeight: 1.45 }}>
            Pause an OTA, or give it a different minimum-stay. Leave a channel untouched to use your default rules above.
          </div>
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {OTA_LIST.map(o => {
              const cr = channelRules[o.id] || {};
              const cm = cr.minNights || { enabled: false, weekend: 2, allDays: 1 };
              return (
                <div key={o.id} style={{ border: `1px solid ${T.borderSoft}`, borderRadius: 10, padding: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>{o.name}</div>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: T.ink3, fontWeight: 600 }}>
                      Pause<Toggle on={!!cr.paused} onChange={(v) => setChannelRule(o.id, { paused: v })} />
                    </label>
                  </div>
                  {cr.paused ? (
                    <div style={{ marginTop: 8, fontSize: 10.5, color: '#b45309', fontWeight: 600 }}>Paused — not selling on this OTA.</div>
                  ) : (
                    <div style={{ marginTop: 10 }}>
                      <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <span style={{ fontSize: 12, color: T.ink2, fontWeight: 600 }}>Custom minimum-stay</span>
                        <Toggle on={!!cm.enabled} onChange={(v) => setChannelMinNights(o.id, { enabled: v })} />
                      </label>
                      {cm.enabled && (
                        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: 12, color: T.ink }}>Weekend nights</span>
                            <Stepper value={cm.weekend} onChange={(n) => setChannelMinNights(o.id, { weekend: n })} disabled={!canEdit} />
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: 12, color: T.ink }}>Other days</span>
                            <Stepper value={cm.allDays} onChange={(n) => setChannelMinNights(o.id, { allDays: n })} disabled={!canEdit} />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>

        {/* ── Multiple rate plans (master toggle) ───────────────── */}
        <Card padding={14} style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>{t('rpTitle')}</div>
              <div style={{ fontSize: 11.5, color: T.ink3, marginTop: 3, lineHeight: 1.45 }}>{t('rpDesc')}</div>
            </div>
            <Toggle on={rpOn} onChange={setRatePlans} />
          </div>
          {rpOn && (
            <div style={{ marginTop: 14 }}>
              {enabledPlans.length > 1 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 12 }}>
                  {enabledPlans.map(rp => {
                    const pct = rp.multiplierPct || 0;
                    return (
                      <div key={rp.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12.5 }}>
                        <span style={{ color: T.ink, fontWeight: 600 }}>{rp.label || rp.id}</span>
                        <span className="tnum" style={{ fontWeight: 700, color: pct === 0 ? T.ink3 : (pct > 0 ? T.primary : T.teal) }}>
                          {pct === 0 ? t('rpBaseRate') : `${pct > 0 ? '+' : ''}${pct}%`}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ fontSize: 11.5, color: T.ink2, lineHeight: 1.45, background: T.bgSoft, border: `1px solid ${T.borderSoft}`, borderRadius: 7, padding: '8px 10px', marginBottom: 12 }}>
                  {t('rpNoneHint')}
                </div>
              )}
              <button onClick={() => go('settings')} style={{ background: 'none', border: 'none', color: T.primary, fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: 0 }}>{t('rpManageLink')} →</button>
            </div>
          )}
        </Card>

        {/* ── Single-occupancy (per-room solo rate) ─────────────── */}
        <Card padding={14} style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>{t('occTitle')}</div>
              <div style={{ fontSize: 11.5, color: T.ink3, marginTop: 3, lineHeight: 1.45 }}>{t('occDesc')}</div>
            </div>
            <Toggle on={soOn} onChange={setSingleOcc} />
          </div>
          {soOn && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 11, color: T.ink3, marginBottom: 10, lineHeight: 1.45 }}>{t('occHint')}</div>
              {cats.length === 0 ? (
                <div style={{ fontSize: 11.5, color: T.ink2, background: T.bgSoft, border: `1px solid ${T.borderSoft}`, borderRadius: 7, padding: '8px 10px' }}>{t('occNoCats')}</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {cats.map(c => (
                    <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 600, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name || c.id}</div>
                        <div style={{ fontSize: 10, color: T.ink3 }}>{t('occNormal').replace('{rate}', '₹' + (c.base || 0).toLocaleString('en-IN'))}</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, padding: '0 8px', height: 36, width: 124, flexShrink: 0 }}>
                        <span style={{ fontSize: 12, color: T.ink3, fontWeight: 600 }}>₹</span>
                        <input
                          type="number"
                          inputMode="numeric"
                          value={singleRates[c.id] != null ? singleRates[c.id] : ''}
                          placeholder={t('occOff')}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => setSingleRate(c.id, e.target.value)}
                          disabled={!canEdit}
                          className="tnum"
                          style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 13, fontWeight: 700, color: T.ink, minWidth: 0 }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </Card>

        {!canEdit && (
          <div style={{ fontSize: 11, color: T.ink3, textAlign: 'center', marginTop: 8 }}>{t('viewOnly')}</div>
        )}
      </div>
    </div>
  );
}

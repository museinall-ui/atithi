import { T } from '../tokens.js';
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

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: T.bg }}>
      <ScreenHeader title={t('advancedTitle')} subtitle={t('advancedSub')} onBack={() => go('settings')} />
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

        {/* ── Coming soon: rate plans + occupancy ───────────────── */}
        {[
          { title: t('rpTitle'), desc: t('rpDesc') },
          { title: t('occTitle'), desc: t('occDesc') },
        ].map((f, i) => (
          <Card key={i} padding={14} style={{ marginBottom: 12, opacity: 0.65 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>{f.title}</div>
                <div style={{ fontSize: 11.5, color: T.ink3, marginTop: 3, lineHeight: 1.45 }}>{f.desc}</div>
              </div>
              <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: 0.4, color: T.ink3, background: T.bgSoft, border: `1px solid ${T.borderSoft}`, borderRadius: 6, padding: '3px 7px', whiteSpace: 'nowrap', flexShrink: 0 }}>{t('comingSoon')}</span>
            </div>
          </Card>
        ))}

        {!canEdit && (
          <div style={{ fontSize: 11, color: T.ink3, textAlign: 'center', marginTop: 8 }}>{t('viewOnly')}</div>
        )}
      </div>
    </div>
  );
}

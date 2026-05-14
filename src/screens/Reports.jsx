import { T } from '../tokens.js';
import { ROOM_TYPES } from '../data.js';
import Icon from '../components/Icon.jsx';
import Btn from '../components/Btn.jsx';
import Chip from '../components/Chip.jsx';
import Card from '../components/Card.jsx';
import Row from '../components/Row.jsx';
import SectionHead from '../components/SectionHead.jsx';
import ScreenHeader from '../components/ScreenHeader.jsx';

function KPI({ label, value, delta, icon, color }) {
  return (
    <Card padding={14}>
      <div style={{
        width: 28, height: 28, borderRadius: 8,
        background: `color-mix(in oklch, ${color} 14%, white)`, color,
        display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10,
      }}>
        <Icon name={icon} size={14} stroke={2} />
      </div>
      <div className="tnum" style={{ fontSize: 18, fontWeight: 700, color: T.ink, letterSpacing: -0.4 }}>{value}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: 11, color: T.ink3, fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: 10, color: T.ok, fontWeight: 700 }}>{delta}</span>
      </div>
    </Card>
  );
}

export default function Reports({ go, t }) {
  const monthData = [62, 70, 75, 68, 78, 88, 95, 90, 72, 80, 85, 92, 88, 78];
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: T.bg }}>
      <ScreenHeader title={t('reportsTitle')} subtitle="May 2026" onBack={() => go('home')}
        right={<Btn size="sm" variant="ghost" icon="download">Export</Btn>}
      />
      <div style={{ flex: 1, overflow: 'auto', padding: 16, paddingBottom: 100 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
          <KPI label={t('revenue')} value="₹4.8L" delta="+18%" icon="inr" color={T.primary} />
          <KPI label={t('avgOccupancy')} value="78%" delta="+6%" icon="bed" color={T.indigo} />
          <KPI label="ADR" value="₹6,420" delta="+4%" icon="tag" color={T.teal} />
          <KPI label="RevPAR" value="₹5,008" delta="+12%" icon="chart" color="oklch(60% 0.14 320)" />
        </div>

        <Card style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14, alignItems: 'baseline' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>Daily occupancy</div>
              <div style={{ fontSize: 11, color: T.ink3 }}>Last 14 days</div>
            </div>
            <Chip color="ok">+12% vs Apr</Chip>
          </div>
          <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 80 }}>
            {monthData.map((v, i) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{
                  width: '100%', height: `${v}%`, borderRadius: '3px 3px 0 0',
                  background: i === 1 ? T.primary : `oklch(${50 + v/3}% ${0.04 + v/1500} 38)`,
                }} />
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
            {monthData.map((_, i) => (
              <span key={i} style={{ flex: 1, fontSize: 8, color: T.ink3, textAlign: 'center', fontWeight: 600 }} className="tnum">
                {i % 3 === 0 ? 4 + i : ''}
              </span>
            ))}
          </div>
        </Card>

        <SectionHead title="Top room types" />
        <Card padding={0}>
          {ROOM_TYPES.map((r, i) => {
            const pct = [42, 28, 18, 12][i];
            return (
              <div key={r.id} style={{
                padding: '12px 14px',
                borderBottom: i < ROOM_TYPES.length - 1 ? `1px solid ${T.borderSoft}` : 'none',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: T.ink }}>{r.name}</span>
                  <span className="tnum" style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>₹{((r.base * pct * 0.30)/1000).toFixed(0)}k</span>
                </div>
                <div style={{ height: 4, background: T.bgSoft, borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ width: `${pct * 2}%`, height: '100%', background: T[r.tag], borderRadius: 2 }} />
                </div>
              </div>
            );
          })}
        </Card>

        <SectionHead title="Compliance" style={{ marginTop: 18 }} />
        <Card>
          <Row label="GST collected" value="₹52,140" />
          <Row label="Form C filed" value="3 of 3" />
          <Row label="GSTR-1 next due" value="11 Jun" />
        </Card>
      </div>
    </div>
  );
}

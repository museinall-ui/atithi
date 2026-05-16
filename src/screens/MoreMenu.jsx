import { T } from '../tokens.js';
import Icon from '../components/Icon.jsx';
import Card from '../components/Card.jsx';
import ScreenHeader from '../components/ScreenHeader.jsx';

export default function MoreMenu({ go, t }) {
  const items = [
    { id: 'rates',    icon: 'tag',   color: T.primary, title: t('ratesTitle'),    sub: 'Pricing · close-outs · discounts' },
    { id: 'channels', icon: 'plug',  color: T.indigo,  title: t('channelsTitle'), sub: 'MMT · Goibibo · Booking.com' },
    { id: 'reports',  icon: 'chart', color: T.teal,    title: t('reportsTitle'),  sub: t('revenue') + ' · ADR · ' + t('avgOccupancy') },
    { id: 'settings', icon: 'cog',   color: T.ink2,    title: t('settings'),      sub: t('property') + ' · ' + t('language') + ' · ' + t('integrations') + ' · ' + t('yourPlan') },
  ];
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: T.bg }}>
      <ScreenHeader title={t('more')} subtitle="All tools" />
      <div style={{ flex: 1, padding: 16, paddingBottom: 100 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {items.map(it => (
            <Card key={it.id} onClick={() => go(it.id)} padding={16} style={{ cursor: 'pointer' }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10, marginBottom: 10,
                background: `color-mix(in oklch, ${it.color} 14%, white)`, color: it.color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Icon name={it.icon} size={20} stroke={2} />
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>{it.title}</div>
              <div style={{ fontSize: 11, color: T.ink3, marginTop: 2 }}>{it.sub}</div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

import { T } from '../tokens.js';
import Icon from '../components/Icon.jsx';
import Card from '../components/Card.jsx';
import ScreenHeader from '../components/ScreenHeader.jsx';

export default function MoreMenu({ go, t, can = () => true }) {
  // Hide tiles for screens this user can't open. Settings stays visible
  // for everyone (the EDIT pill inside is what's gated by manage_settings
  // — language / plan / sign-out remain accessible to all team members).
  // Channels is also always visible because it's just a "coming soon"
  // placeholder; no point hiding it from anyone.
  const items = [
    can('manage_rates')    && { id: 'rates',    icon: 'tag',   color: T.primary, title: t('ratesTitle'),    sub: 'Daily rates · close-outs' },
    { id: 'channels', icon: 'plug',  color: T.indigo,  title: t('channelsTitle'), sub: 'OTAs · coming soon' },
    can('view_reports')    && { id: 'reports',  icon: 'chart', color: T.teal,    title: t('reportsTitle'),  sub: 'Money earned · rooms full · invoicing' },
    can('manage_expenses') && { id: 'expenses', icon: 'inr',   color: 'oklch(55% 0.15 30)', title: 'Expenses', sub: 'Daily costs · ledger · by category' },
    can('view_reports')    && { id: 'activity', icon: 'clock', color: 'oklch(50% 0.14 265)', title: 'Activity log', sub: 'Who did what · when · timestamped' },
    { id: 'settings', icon: 'cog',   color: T.ink2,    title: t('settings'),      sub: 'Property · plan · accountant · language' },
  ].filter(Boolean);
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: T.bg }}>
      <ScreenHeader title={t('more')} subtitle="All tools" onBack={() => go('home')} />
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

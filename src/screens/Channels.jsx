import { T } from '../tokens.js';
import Icon from '../components/Icon.jsx';
import Chip from '../components/Chip.jsx';
import Card from '../components/Card.jsx';
import ScreenHeader from '../components/ScreenHeader.jsx';

// OTA sync needs a channel manager partnership (STAAH / RateGain / Cloudbeds
// etc.) to push rates + receive bookings. None of that is wired up yet, so
// this screen used to display fake event streams and a "Push now" button that
// did nothing. That was misleading. For now we show an honest "Coming soon"
// state so the hotelier knows it's a real feature, just not live yet.
const OTAS = [
  { id: 'mmt',     name: 'MakeMyTrip',  color: '#EB2026' },
  { id: 'goibibo', name: 'Goibibo',     color: '#F0728F' },
  { id: 'booking', name: 'Booking.com', color: '#003580' },
  { id: 'agoda',   name: 'Agoda',       color: '#5392FF' },
  { id: 'airbnb',  name: 'Airbnb',      color: '#FF5A5F' },
];

export default function Channels({ go, t }) {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: T.bg }}>
      <ScreenHeader title={t('channelsTitle')} subtitle="OTA sync · coming soon" onBack={() => go('home')} />
      <div style={{ flex: 1, overflow: 'auto', padding: 16, paddingBottom: 100 }}>
        <Card padding={20} style={{ marginBottom: 14, textAlign: 'center', background: `linear-gradient(160deg, ${T.primary} 0%, ${T.primaryDk} 100%)`, color: '#fff', borderColor: T.primary, overflow: 'hidden' }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16,
            background: 'rgba(255,255,255,0.18)', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 12px',
          }}>
            <Icon name="plug" size={28} stroke={2} />
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.3, marginBottom: 6 }}>
            Channel manager — coming soon
          </div>
          <div style={{ fontSize: 12, opacity: 0.9, lineHeight: 1.55, maxWidth: 320, margin: '0 auto' }}>
            Two-way sync with MakeMyTrip, Goibibo, Booking.com, Agoda and more. Bookings flow in here; rate + availability changes push out to every OTA in one tap.
          </div>
        </Card>

        <Card padding={16} style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.ink2, letterSpacing: 0.3, marginBottom: 12 }}>WHAT THIS WILL DO</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { icon: 'arrow',  title: 'Bookings flow in automatically', sub: 'Every OTA reservation appears on your Diary and Pending Payments without you doing anything.' },
              { icon: 'tag',    title: 'One-tap rate updates',           sub: 'Change a price in Rates → pushes to every connected OTA in seconds.' },
              { icon: 'bed',    title: 'No more double-bookings',        sub: 'Inventory is synced live, so a sold room on one OTA closes on every other.' },
              { icon: 'chart',  title: 'Per-channel performance',        sub: 'See which OTA is bringing you the most revenue and the best margins.' },
            ].map((it, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: T.primaryLt, color: T.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon name={it.icon} size={13} stroke={2.2} />
                </div>
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: T.ink }}>{it.title}</div>
                  <div style={{ fontSize: 10.5, color: T.ink3, fontWeight: 600, marginTop: 2, lineHeight: 1.45 }}>{it.sub}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card padding={16}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.ink2, letterSpacing: 0.3, marginBottom: 10 }}>OTAS WE'LL SUPPORT</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {OTAS.map(o => (
              <span key={o.id} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '5px 10px', borderRadius: 999,
                border: `1px solid ${T.border}`, background: T.card,
                fontSize: 11, fontWeight: 700, color: T.ink2,
              }}>
                <span style={{ width: 8, height: 8, borderRadius: 4, background: o.color }} />
                {o.name}
              </span>
            ))}
          </div>
          <div style={{ marginTop: 12, padding: '10px 12px', background: T.bgSoft, borderRadius: 8, fontSize: 10.5, color: T.ink3, fontWeight: 600, lineHeight: 1.45 }}>
            Built on a channel manager partnership (we're evaluating STAAH, RateGain and Cloudbeds). Until then, OTA bookings can be added manually via the <strong>+ New</strong> button on the home screen.
          </div>
        </Card>

        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 18 }}>
          <Chip color="warn" style={{ fontSize: 10 }}>Coming soon</Chip>
        </div>
      </div>
    </div>
  );
}

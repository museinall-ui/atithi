import { T } from '../tokens.js';
import Icon from '../components/Icon.jsx';
import Card from '../components/Card.jsx';
import Btn from '../components/Btn.jsx';
import ScreenHeader from '../components/ScreenHeader.jsx';
import { effectiveRoomTypes } from '../data.js';

// Phase 5, Chunk 3 — hotelier-facing Channel Manager screen.
//
// PRODUCT PRINCIPLE: AtithiBook is the SERVICE PROVIDER. WE set up the AIOSELL
// connection FOR each hotelier during onboarding — the per-property mapping
// (AIOSELL hotel code + room / rate-plan codes) is operator config stored on
// `property.accountant.aiosell`, which our team fills in (via Supabase / an
// internal tool). The hotelier NEVER does this: their rooms, rates, availability
// and restrictions already live in AtithiBook, and the channel manager simply
// reflects them out to the OTAs automatically.
//
// So this screen is STATUS ONLY — no codes, no mapping, no DIY setup:
//   • Channels plan + set up by us   -> "Active", what's syncing, OTAs connected
//   • Channels plan + not yet set up -> "We're setting this up — contact support"
//   • Not on the Channels plan        -> a short value pitch + "Talk to us"
//
// The actual rate/inventory/restriction push runs server-side (api/aiosell-push
// + a later auto-sync); inbound OTA bookings arrive via the Chunk 4 webhook.

const OTAS = [
  { id: 'mmt',     name: 'MakeMyTrip',  color: '#EB2026' },
  { id: 'goibibo', name: 'Goibibo',     color: '#F0728F' },
  { id: 'booking', name: 'Booking.com', color: '#003580' },
  { id: 'agoda',   name: 'Agoda',       color: '#5392FF' },
  { id: 'airbnb',  name: 'Airbnb',      color: '#FF5A5F' },
];

// Support reaches AtithiBook (us), not the property. WhatsApp if the contact
// number env var is set (same one the Landing demo gate uses), else email.
const SUPPORT_WA = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_CONTACT_WA) || '';
const SUPPORT_EMAIL = 'support@atithibook.com';

function contactSupport(subject, body) {
  if (SUPPORT_WA) {
    const digits = SUPPORT_WA.replace(/[^0-9]/g, '');
    const msg = body ? `${subject}\n\n${body}` : subject;
    window.open(`https://wa.me/${digits}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
  } else {
    window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body || '')}`;
  }
}

function Check() {
  return (
    <span style={{
      width: 18, height: 18, borderRadius: 9, background: '#dcfce7', color: '#166534',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 11, fontWeight: 900, flexShrink: 0,
    }}>✓</span>
  );
}

function OTARow() {
  return (
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
  );
}

const SYNCS = [
  'Rooms & availability',
  'Daily rates',
  'Restrictions (min-stay, stop-sell)',
  'OTA bookings → your diary',
];

export default function Channels({ go, t, property, plan }) {
  const onPlan = plan === 'channels' || plan === 'invoicing';
  // Operator-set mapping. Its presence is our signal that we've completed setup
  // for this property — the hotelier never edits it.
  const aio = (property && property.accountant && property.accountant.aiosell) || {};
  const rooms = aio.rooms || {};
  const roomTypes = effectiveRoomTypes(property);
  const mappedCount = roomTypes.filter(rt => rooms[rt.id] && (rooms[rt.id].roomCode || '').trim()).length;
  const configured = !!((aio.hotelCode || '').trim() && mappedCount > 0);
  const active = onPlan && configured;

  const propName = (property && property.profile && property.profile.name) || 'your property';

  const hero = active
    ? { dot: '#86efac', label: 'Active · syncing automatically' }
    : onPlan
      ? { dot: '#fde68a', label: 'Setting up — our team is on it' }
      : { dot: '#ffffff', label: 'Part of the Channels plan' };

  const heroText = active
    ? `Your rooms, rates, availability and restrictions for ${propName} sync automatically to your OTAs. We manage the connection — there's nothing for you to set up.`
    : onPlan
      ? `Your channel manager is included in your plan. Our team connects your OTAs and wires up ${propName}'s rooms, rates and availability for you — you don't need to do anything.`
      : `Push your rates & availability to MakeMyTrip, Booking.com, Goibibo, Agoda and more — and get OTA bookings straight in your diary. It's part of the Channels plan.`;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: T.bg }}>
      <ScreenHeader title={t('channelsTitle')} subtitle="OTA sync via AIOSELL" onBack={() => go('__back')} />
      <div style={{ flex: 1, overflow: 'auto', padding: 16, paddingBottom: 100 }}>

        {/* Hero */}
        <Card padding={18} style={{ marginBottom: 14, background: `linear-gradient(160deg, ${T.primary} 0%, ${T.primaryDk} 100%)`, color: '#fff', borderColor: T.primary }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(255,255,255,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon name="plug" size={22} stroke={2} />
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: -0.2 }}>Channel manager</div>
              <div style={{ fontSize: 11.5, opacity: 0.9 }}>One connection · every OTA</div>
            </div>
          </div>
          <div style={{ fontSize: 12, opacity: 0.92, lineHeight: 1.55 }}>{heroText}</div>
          <div style={{ marginTop: 12 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 11px', borderRadius: 999, background: 'rgba(255,255,255,0.18)', fontSize: 11.5, fontWeight: 700 }}>
              <span style={{ width: 8, height: 8, borderRadius: 4, background: hero.dot }} />
              {hero.label}
            </span>
          </div>
        </Card>

        {/* ACTIVE — set up by us, syncing */}
        {active && (
          <>
            <Card padding={16} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.ink2, letterSpacing: 0.3, marginBottom: 12 }}>SYNCING AUTOMATICALLY</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {SYNCS.map((s, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Check />
                    <span style={{ fontSize: 13, fontWeight: 600, color: T.ink }}>{s}</span>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 12, padding: '10px 12px', background: T.bgSoft, borderRadius: 8, fontSize: 10.5, color: T.ink3, fontWeight: 600, lineHeight: 1.5 }}>
                Set up and managed by AtithiBook. Whenever you change a rate, open or close rooms, or take a booking, your OTAs update automatically.
              </div>
            </Card>
            <Card padding={16} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.ink2, letterSpacing: 0.3, marginBottom: 10 }}>CONNECTED TO</div>
              <OTARow />
            </Card>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <Btn variant="soft" size="sm" onClick={() => contactSupport(`Channel manager — ${propName}`, 'Hi, I have a question about my OTA channel sync.')}>
                Need a change? Contact support
              </Btn>
            </div>
          </>
        )}

        {/* ON PLAN, NOT YET SET UP — we're doing it; contact support */}
        {onPlan && !configured && (
          <>
            <Card padding={16} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: T.ink, marginBottom: 6 }}>We're getting you connected</div>
              <div style={{ fontSize: 12, color: T.ink2, fontWeight: 600, lineHeight: 1.55 }}>
                Connecting your OTAs (MakeMyTrip, Booking.com and the rest) to your rooms is something our team sets up for you — usually within a couple of business days of joining the Channels plan. We'll let you know the moment it's live. Nothing to configure on your side.
              </div>
              <div style={{ marginTop: 14 }}>
                <Btn variant="primary" full onClick={() => contactSupport(`Channel setup — ${propName}`, "Hi, I'd like an update on my OTA channel-manager setup.")}>
                  Contact support
                </Btn>
              </div>
            </Card>
            <Card padding={16}>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.ink2, letterSpacing: 0.3, marginBottom: 10 }}>WHAT YOU'LL GET</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
                {SYNCS.map((s, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Check />
                    <span style={{ fontSize: 13, fontWeight: 600, color: T.ink }}>{s}</span>
                  </div>
                ))}
              </div>
              <OTARow />
            </Card>
          </>
        )}

        {/* NOT ON PLAN — value pitch + talk to us */}
        {!onPlan && (
          <>
            <Card padding={16} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.ink2, letterSpacing: 0.3, marginBottom: 12 }}>WITH CHANNEL SYNC</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 14 }}>
                {[
                  { ttl: 'Bookings flow in automatically', sub: 'Every OTA reservation lands on your diary — no copy-pasting from portals.' },
                  { ttl: 'One place for rates & availability', sub: 'Change it once in AtithiBook; we push it to every OTA for you.' },
                  { ttl: 'No more double-bookings', sub: 'Sell a room on one OTA and it closes on all the others, live.' },
                ].map((it, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <Check />
                    <div>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: T.ink }}>{it.ttl}</div>
                      <div style={{ fontSize: 10.5, color: T.ink3, fontWeight: 600, marginTop: 2, lineHeight: 1.45 }}>{it.sub}</div>
                    </div>
                  </div>
                ))}
              </div>
              <Btn variant="primary" full onClick={() => contactSupport(`Add OTA channel sync — ${propName}`, "Hi, I'd like to add OTA channel sync to my account.")}>
                Talk to us about adding this
              </Btn>
            </Card>
            <Card padding={16}>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.ink2, letterSpacing: 0.3, marginBottom: 10 }}>WORKS WITH</div>
              <OTARow />
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

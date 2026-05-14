import { T } from '../tokens.js';
import Icon from '../components/Icon.jsx';
import Btn from '../components/Btn.jsx';

export default function BookingConfirmed({ go, t }) {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: T.bg }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, textAlign: 'center' }}>
        <div style={{
          width: 88, height: 88, borderRadius: '50%',
          background: T.okLt, color: T.ok,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 20,
        }}>
          <Icon name="check" size={44} stroke={2.5} />
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, color: T.ink, letterSpacing: -0.4 }}>Booking confirmed</div>
        <div style={{ fontSize: 13, color: T.ink3, marginTop: 6, lineHeight: 1.5, maxWidth: 280 }}>
          WhatsApp confirmation sent. Razorpay link delivered. Folio open.
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 24 }}>
          <Btn variant="ghost" onClick={() => go('home')}>{t('home')}</Btn>
          <Btn icon="cal" onClick={() => go('diary')}>{t('diary')}</Btn>
        </div>
      </div>
    </div>
  );
}

import { T } from '../tokens.js';
import Icon from '../components/Icon.jsx';
import Btn from '../components/Btn.jsx';
import { bookingShareWaUrl } from '../utils/share.js';

export default function BookingConfirmed({ go, t, bookingId, bookings = [], property, lang = 'en' }) {
  const b = bookingId ? bookings.find(x => x.id === bookingId) : null;
  const propName = (property && property.profile && property.profile.name) || '';
  const waUrl = b ? bookingShareWaUrl(b, property, lang) : null;
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
        {b ? (
          <div style={{ fontSize: 13, color: T.ink3, marginTop: 6, lineHeight: 1.5, maxWidth: 320 }}>
            <strong style={{ color: T.ink2 }}>{b.id}</strong> · {b.guest}{b.phone ? ` · ${b.phone}` : ''}
            <br />
            Saved in {propName || 'your diary'}. Send the booking summary to the guest now, or jump back to the calendar.
          </div>
        ) : (
          <div style={{ fontSize: 13, color: T.ink3, marginTop: 6, lineHeight: 1.5, maxWidth: 280 }}>
            Saved in your diary. Open it from Home or the calendar.
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginTop: 24, width: '100%', maxWidth: 320 }}>
          {b && waUrl && (
            <Btn
              variant="wa"
              icon="wa"
              style={{ width: '100%' }}
              onClick={() => window.open(waUrl, '_blank', 'noopener')}
            >
              Send booking to guest on WhatsApp
            </Btn>
          )}
          {b && !waUrl && b.phone === '' && (
            <div style={{ fontSize: 11, color: T.ink3, fontStyle: 'italic' }}>
              No phone on file — add one to send the confirmation.
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, width: '100%' }}>
            {b && (
              <Btn variant="ghost" icon="eye" style={{ flex: 1 }} onClick={() => go('booking', b.id)}>Open booking</Btn>
            )}
            <Btn variant="ghost" icon="cal" style={{ flex: 1 }} onClick={() => go('diary')}>{t('diary')}</Btn>
          </div>
          <button
            onClick={() => go('home')}
            style={{ background: 'none', border: 'none', color: T.ink3, fontSize: 12, fontWeight: 600, cursor: 'pointer', marginTop: 4 }}
          >{t('home')}</button>
        </div>
      </div>
    </div>
  );
}

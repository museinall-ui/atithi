import { useState } from 'react';
import { T } from '../tokens.js';
import Icon from '../components/Icon.jsx';
import Btn from '../components/Btn.jsx';
import { bookingShareWaUrl } from '../utils/share.js';
import { generateVoucher } from '../utils/voucher.js';
import { effectiveRoomTypes } from '../data.js';

export default function BookingConfirmed({ go, t, bookingId, bookings = [], property, lang = 'en' }) {
  const b = bookingId ? bookings.find(x => x.id === bookingId) : null;
  const propName = (property && property.profile && property.profile.name) || '';
  const waUrl = b ? bookingShareWaUrl(b, property, lang) : null;
  const ROOM_TYPES = b ? effectiveRoomTypes(property) : [];
  const rt = b ? ROOM_TYPES.find(r => r.id === b.roomTypeId) : null;
  // Voucher language picker — same pattern as BookingDetail. Hotelier
  // tends to land here right after creating a booking, so make the
  // voucher download trivially accessible without forcing a detour
  // through Open booking → header download icon.
  const [voucherSheet, setVoucherSheet] = useState(false);
  const downloadIn = (voucherLang) => {
    if (b) generateVoucher(b, rt, property, undefined, voucherLang);
    setVoucherSheet(false);
  };
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: T.bg, position: 'relative' }}>
      {/* Compact back arrow — celebration screen has its own big CTAs
          below, but a consistent top-left back keeps navigation
          predictable across every screen. Goes to the diary because
          that's the natural place to see the new booking sitting in
          context (going to 'new' would just relaunch the form). */}
      <button
        onClick={() => go('diary')}
        aria-label={t('backToDiary')}
        style={{
          position: 'absolute', top: 14, left: 14, zIndex: 5,
          width: 36, height: 36, borderRadius: 10, border: 'none',
          background: T.bgSoft, display: 'flex', alignItems: 'center',
          justifyContent: 'center', cursor: 'pointer', color: T.ink,
        }}
      >
        <Icon name="arrowL" size={18} />
      </button>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, textAlign: 'center' }}>
        <div style={{
          width: 88, height: 88, borderRadius: '50%',
          background: T.okLt, color: T.ok,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 20,
        }}>
          <Icon name="check" size={44} stroke={2.5} />
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, color: T.ink, letterSpacing: -0.4 }}>{t('bookingConfirmed')}</div>
        {b ? (
          <div style={{ fontSize: 13, color: T.ink3, marginTop: 6, lineHeight: 1.5, maxWidth: 320 }}>
            <strong style={{ color: T.ink2 }}>{b.id}</strong> · {b.guest}{b.phone ? ` · ${b.phone}` : ''}
            <br />
            {t(waUrl ? 'savedInSummary' : 'savedInSummaryNoPhone').replace('{name}', propName || (lang === 'hi' ? 'आपकी डायरी' : 'your diary'))}
          </div>
        ) : (
          <div style={{ fontSize: 13, color: T.ink3, marginTop: 6, lineHeight: 1.5, maxWidth: 280 }}>
            {t('savedInDiary')}
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginTop: 24, width: '100%', maxWidth: 320 }}>
          {b && waUrl && (
            <Btn
              variant="wa"
              icon="wa"
              style={{ width: '100%' }}
              // Open the guest's WhatsApp chat directly with the summary
              // pre-filled (synchronous so mobile never blocks it as a popup).
              // The voucher file is a tap away via "Download voucher" below.
              onClick={() => { if (waUrl) window.open(waUrl, '_blank', 'noopener'); }}
            >
              {t('sendToGuestWa')}
            </Btn>
          )}
          {b && !waUrl && (
            <div style={{ fontSize: 11, color: T.ink3, fontStyle: 'italic' }}>
              {t('noPhoneAddOne')}
            </div>
          )}
          {b && (
            <Btn variant="ghost" icon="download" style={{ width: '100%' }} onClick={() => setVoucherSheet(true)}>
              {t('downloadVoucher')}
            </Btn>
          )}
          <div style={{ display: 'flex', gap: 8, width: '100%' }}>
            {b && (
              <Btn variant="ghost" icon="eye" style={{ flex: 1 }} onClick={() => go('booking', b.id)}>{t('openBooking')}</Btn>
            )}
            <Btn variant="ghost" icon="cal" style={{ flex: 1 }} onClick={() => go('diary')}>{t('diary')}</Btn>
          </div>
          <button
            onClick={() => go('home')}
            style={{ background: 'none', border: 'none', color: T.ink3, fontSize: 12, fontWeight: 600, cursor: 'pointer', marginTop: 4 }}
          >{t('home')}</button>
        </div>
      </div>
      {voucherSheet && (
        <div
          onClick={() => setVoucherSheet(false)}
          style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 60, display: 'flex', alignItems: 'flex-end' }}
        >
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', background: T.card, borderRadius: '16px 16px 0 0', padding: 18, paddingBottom: 32 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: T.ink, marginBottom: 4 }}>{t('downloadVoucherIn')}</div>
            <div style={{ fontSize: 11, color: T.ink3, marginBottom: 14, lineHeight: 1.4 }}>{t('pickPdfLang')}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button onClick={() => downloadIn('en')} className="atithi-tap" style={{ width: '100%', padding: 14, borderRadius: 10, cursor: 'pointer', border: `1.5px solid ${T.primary}`, background: T.card, color: T.ink, fontSize: 13, fontWeight: 700, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 18, color: T.primary, fontWeight: 800, width: 32, textAlign: 'center' }}>EN</span>
                <span style={{ flex: 1 }}>English</span>
                <Icon name="download" size={14} color={T.primary} stroke={2.2} />
              </button>
              <button onClick={() => downloadIn('hi')} className="atithi-tap" style={{ width: '100%', padding: 14, borderRadius: 10, cursor: 'pointer', border: `1.5px solid ${T.primary}`, background: T.card, color: T.ink, fontSize: 13, fontWeight: 700, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 16, color: T.primary, fontWeight: 800, width: 32, textAlign: 'center' }}>हि</span>
                <span style={{ flex: 1 }}>हिन्दी</span>
                <Icon name="download" size={14} color={T.primary} stroke={2.2} />
              </button>
              <button onClick={() => setVoucherSheet(false)} className="atithi-tap" style={{ width: '100%', padding: 10, borderRadius: 10, cursor: 'pointer', border: 'none', background: 'transparent', color: T.ink3, fontSize: 12, fontWeight: 700 }}>{t('cancel')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

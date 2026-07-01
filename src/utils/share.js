// WhatsApp share helpers for sending the booking voucher details to the
// guest. Composes a plain-text message that lands in the guest's WhatsApp,
// pre-filled with check-in / check-out / room / total / outstanding amount.
//
// We can't attach the voucher PDF over wa.me (the protocol only accepts a
// text body, no files). So the message reads like the voucher summary, and
// if the property has uploaded a payment QR, we point the guest at it with
// a "scan the QR your hotel sent you" line. The hotelier can edit the
// message before tapping Send on WhatsApp.

import { idxToDate } from '../data.js';

function fmtIN(amount) {
  return '₹' + Number(amount || 0).toLocaleString('en-IN');
}

function fmtDate(idx, lang = 'en') {
  try {
    const d = new Date(idxToDate(idx) + 'T00:00:00');
    const locale = lang === 'hi' ? 'hi-IN' : 'en-IN';
    return d.toLocaleDateString(locale, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return '—';
  }
}

// Compose the WhatsApp message body for a booking. Returns plain text.
// `lang` is 'en' or 'hi' — the hotelier's app preference, used as a hint
// for which language the guest most likely reads (most guests at a small
// Indian hotel speak Hindi or English).
export function bookingShareMessage(booking, property, lang = 'en') {
  if (!booking) return '';
  const propName = (property && property.profile && property.profile.name) || 'Your hotel';
  const propPhone = (property && property.profile && property.profile.phone) || '';
  const checkIn = fmtDate(booking.startIdx, lang);
  const checkOut = fmtDate(booking.startIdx + (booking.nights || 1), lang);
  const nights = booking.nights || 1;
  const total = booking.total || 0;
  const paid = booking.paid || 0;
  const balance = Math.max(0, total - paid);
  const qrLabel = (property && property.profile && property.profile.paymentQrLabel) || '';

  if (lang === 'hi') {
    const lines = [
      `नमस्ते ${booking.guest || ''},`,
      ``,
      `आपकी ${propName} में बुकिंग पक्की हो गई है।`,
      ``,
      `बुकिंग ID: ${booking.id}`,
      `चेक-इन: ${checkIn}`,
      `चेक-आउट: ${checkOut}  (${nights} रात)`,
      `कुल: ${fmtIN(total)}`,
    ];
    if (paid > 0) lines.push(`चुकाया: ${fmtIN(paid)}`);
    if (balance > 0) {
      lines.push(`बकाया: ${fmtIN(balance)}`);
      lines.push('');
      lines.push(qrLabel
        ? `भुगतान के लिए हमें यहाँ रिप्लाई करें — हम UPI QR (${qrLabel}) भेज देंगे।`
        : `भुगतान के लिए हमें यहाँ रिप्लाई करें — हम UPI QR भेज देंगे।`);
    } else {
      lines.push('');
      lines.push(`भुगतान प्राप्त हो गया है। धन्यवाद!`);
    }
    if (propPhone) {
      lines.push('');
      lines.push(`संपर्क: ${propPhone}`);
    }
    return lines.join('\n');
  }

  const lines = [
    `Hi ${booking.guest || ''},`,
    ``,
    `Your booking at ${propName} is confirmed.`,
    ``,
    `Booking ID: ${booking.id}`,
    `Check-in:  ${checkIn}`,
    `Check-out: ${checkOut}  (${nights} night${nights > 1 ? 's' : ''})`,
    `Total:     ${fmtIN(total)}`,
  ];
  if (paid > 0) lines.push(`Paid:      ${fmtIN(paid)}`);
  if (balance > 0) {
    lines.push(`Balance:   ${fmtIN(balance)}`);
    lines.push('');
    lines.push(qrLabel
      ? `To pay the balance, reply here and we'll send you our UPI QR (${qrLabel}).`
      : `To pay the balance, reply here and we'll send you our UPI QR.`);
  } else {
    lines.push('');
    lines.push(`Payment received in full. Thank you!`);
  }
  if (propPhone) {
    lines.push('');
    lines.push(`Reach us: ${propPhone}`);
  }
  return lines.join('\n');
}

// Build a wa.me URL with the booking-summary message pre-filled. Returns
// null when there's no phone to send to.
//
// wa.me is the ONLY share path that lands directly in THIS guest's WhatsApp
// chat with the message ready to send. The Web Share API (navigator.share) was
// tried earlier but on every platform it just opens a generic app-picker with
// no recipient — on iPhone it read as "opens WhatsApp but not the guest"
// (audit #12). So the booking-send buttons open this URL synchronously and the
// voucher file is offered separately via the "Download voucher" button.
export function bookingShareWaUrl(booking, property, lang = 'en') {
  if (!booking) return null;
  const digits = String(booking.phone || '').replace(/\D/g, '');
  if (!digits) return null;
  const msg = bookingShareMessage(booking, property, lang);
  return `https://wa.me/${digits}?text=${encodeURIComponent(msg)}`;
}

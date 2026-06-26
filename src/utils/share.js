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
        ? `भुगतान के लिए UPI QR स्कैन करें (${qrLabel})।`
        : `भुगतान के लिए UPI QR स्कैन करें।`);
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
      ? `Please scan the UPI QR we shared to pay (${qrLabel}).`
      : `Please scan the UPI QR we shared to pay.`);
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
export function bookingShareWaUrl(booking, property, lang = 'en') {
  if (!booking) return null;
  const digits = String(booking.phone || '').replace(/\D/g, '');
  if (!digits) return null;
  const msg = bookingShareMessage(booking, property, lang);
  return `https://wa.me/${digits}?text=${encodeURIComponent(msg)}`;
}

// Share booking text + the voucher as a file in one go using the Web
// Share API. Works on mobile Chrome / Android / iOS Safari 15+; the
// caller falls back to opening the voucher print window + wa.me side
// by side when this returns false.
//
// voucherHtml: full HTML string of the voucher (from voucherHtmlString())
// Returns true if the share dialog opened, false otherwise.
export async function shareBookingWithVoucher(booking, property, lang, voucherHtml) {
  if (typeof navigator === 'undefined' || !navigator.share || !navigator.canShare) return false;
  const msg = bookingShareMessage(booking, property, lang);
  const propName = (property && property.profile && property.profile.name) || 'Property';
  const file = new File(
    [voucherHtml],
    `voucher-${booking.id || 'booking'}.html`,
    { type: 'text/html' }
  );
  // canShare with files isn't supported on all platforms — fall back
  // when the OS doesn't accept HTML files via the share sheet.
  if (!navigator.canShare({ files: [file] })) return false;
  try {
    await navigator.share({
      title: `Booking at ${propName}`,
      text: msg,
      files: [file],
    });
    return true;
  } catch (e) {
    // User cancelled the share sheet. Treat as a no-op (don't fall
    // back to wa.me, since they explicitly dismissed).
    return e && e.name === 'AbortError' ? true : false;
  }
}

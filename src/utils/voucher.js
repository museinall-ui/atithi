import { extrasBreakdownFor, bookingGstApplies, getTaxBreakdown, ANCHOR, mealCostFor, mealPlanById, extraGuestCostFor, safeUrl, ratePlansActive, childTotalForItem, effectiveChildBands } from '../data.js';
import { themeColors } from '../tokens.js';

// Empty fallback used when the caller passes no property at all. We
// used to fall back to Yatra Desert Camp's profile here — which meant
// a real hotelier's voucher would be branded with someone else's hotel
// if the property hadn't loaded yet at the time generateVoucher() ran.
// Genuinely awful for production. Now the fallback is empty + the
// generateVoucher entry-point refuses to render a partial property.
const FALLBACK_PROPERTY = {
  profile: {
    name: '',
    address: '',
    city: '', state: '', pincode: '',
    landmark: '',
    mapUrl: '',
    checkIn: '14:00', checkOut: '11:00',
    phone: '',
  },
};

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Voucher string table. The PDF opens in a fresh window so it can't share
// the app's i18n hook; we duplicate the relevant strings here keyed by
// language. English remains the fallback for any missing Hindi key.
const VSTR = {
  en: {
    voucher: 'Booking voucher',
    invoice: 'Tax invoice',
    invoiceDate: 'Invoice date',
    issued: 'Issued',
    booking: 'Booking',
    stampInvoice: 'TAX INVOICE',
    stampHold: 'TENTATIVE · ON HOLD',
    stampDue: 'BALANCE DUE',
    stampPaid: 'PAID IN FULL',
    billedTo: 'Billed to',
    guest: 'Guest',
    accommodation: 'Accommodation',
    hsnHint: 'HSN: 996311 (Hotel accommodation)',
    unitSingular: 'unit',
    unitPlural: 'units',
    checkIn: 'Check-in',
    checkOut: 'Check-out',
    fromTime: 'From',
    byTime: 'By',
    night: 'Night',
    nights: 'Nights',
    holdTitle: '⏱ Provisional hold — payment required',
    holdMsg1: 'This room is being held for you until',
    holdMsg2: "If we don't receive",
    holdMsg3: 'by then, the booking will be',
    holdMsg4: 'automatically released',
    holdMsg5: 'and the inventory re-opened for other guests.',
    folio: 'Folio',
    invoiceLines: 'Invoice line items',
    colDescription: 'Description',
    colQty: 'Qty',
    colRate: 'Rate',
    colAmount: 'Amount',
    tariff: 'tariff',
    exclGst: 'excl. GST',
    mealPlan: 'Meal plan',
    included: 'Included',
    invoiceTotal: 'Invoice total',
    total: 'Total',
    paid: 'Paid',
    balanceDue: 'Balance due at check-in',
    balanceDueBefore: 'Balance due before',
    placeOfSupply: 'Place of supply',
    invoiceNo: 'Invoice no',
    fy: 'FY',
    note: 'Note',
    specialRequest: 'Special request',
    scanToPay: 'Scan to pay',
    scanBalance: 'Balance due — scan this QR with any UPI app to pay.',
    scanFull: "Pay using any UPI app — scan with PhonePe, GPay, Paytm, or your bank's app.",
    roomsHeader: 'Rooms reserved',
    adultsLabel: 'Adults', adultLabel: 'Adult',
    childrenLabel: 'Children', childLabel: 'Child',
    guestsTotal: 'Total guests',
    childAgeNote: (age) => `Children under ${age} stay free; ${age}+ count as adults.`,
    houseRulesHeader: 'House rules',
    termsLabel: 'Terms:',
    termsBody: (p, id, withTax) =>
      `Check-in from ${esc(p.checkIn || '14:00')}, check-out by ${esc(p.checkOut || '11:00')}. Valid photo ID required at check-in.${withTax ? ' GST will be charged as applicable.' : ''} ${p.phone ? `For any change, WhatsApp ${esc(p.phone)} quoting <strong>${esc(id)}</strong>.` : `For any change, quote <strong>${esc(id)}</strong>.`}`,
    cancelLabel: 'Cancellation policy',
    cancelFlexible: (h) => `Free cancellation up to ${h}h before check-in. Cancellations after that may be charged; no-show forfeits the advance.`,
    cancelModerate: (h) => `Free cancellation up to ${h}h before check-in. After that, 50% of the booking is charged; no-show forfeits the advance.`,
    cancelStrict: (h) => `Free cancellation up to ${h}h before check-in. After that, no refund applies; no-show forfeits the advance.`,
    cancelNonRefundable: 'Non-refundable rate — no refund applies if you cancel or no-show.',
    thanksLine: (name, city) => `Thank you for choosing ${esc(name)}.${city ? ' We look forward to hosting you in ' + esc(city) + '.' : ' We look forward to hosting you.'}`,
    printBtn: 'Save as PDF / Print',
    closeBtn: 'Close',
    dateLocale: 'en-IN',
  },
  hi: {
    voucher: 'बुकिंग वाउचर',
    invoice: 'टैक्स इनवॉइस',
    invoiceDate: 'इनवॉइस तारीख़',
    issued: 'जारी',
    booking: 'बुकिंग',
    stampInvoice: 'टैक्स इनवॉइस',
    stampHold: 'अस्थायी · होल्ड पर',
    stampDue: 'बकाया',
    stampPaid: 'पूरा भुगतान',
    billedTo: 'बिल पाने वाले',
    guest: 'मेहमान',
    accommodation: 'आवास',
    hsnHint: 'HSN: 996311 (होटल आवास)',
    unitSingular: 'यूनिट',
    unitPlural: 'यूनिट',
    checkIn: 'चेक-इन',
    checkOut: 'चेक-आउट',
    fromTime: 'से',
    byTime: 'तक',
    night: 'रात',
    nights: 'रातें',
    holdTitle: '⏱ अस्थायी होल्ड — भुगतान आवश्यक',
    holdMsg1: 'यह कमरा आपके लिए रिज़र्व है',
    holdMsg2: 'अगर हमें',
    holdMsg3: 'तक नहीं मिला, तो बुकिंग',
    holdMsg4: 'अपने आप रिलीज़ हो जाएगी',
    holdMsg5: 'और कमरा अन्य मेहमानों के लिए खोल दिया जाएगा।',
    folio: 'फ़ोलियो',
    invoiceLines: 'इनवॉइस विवरण',
    colDescription: 'विवरण',
    colQty: 'मात्रा',
    colRate: 'दर',
    colAmount: 'राशि',
    tariff: 'टैरिफ़',
    exclGst: 'GST अलग',
    mealPlan: 'भोजन योजना',
    included: 'शामिल',
    invoiceTotal: 'इनवॉइस कुल',
    total: 'कुल',
    paid: 'चुकाया',
    balanceDue: 'चेक-इन पर बकाया',
    balanceDueBefore: 'बकाया भुगतान की अंतिम तिथि',
    placeOfSupply: 'आपूर्ति का स्थान',
    invoiceNo: 'इनवॉइस क्रमांक',
    fy: 'वित्त वर्ष',
    note: 'नोट',
    specialRequest: 'विशेष अनुरोध',
    scanToPay: 'भुगतान हेतु स्कैन करें',
    scanBalance: 'बकाया भुगतान — इस QR को किसी भी UPI ऐप से स्कैन करें।',
    scanFull: 'किसी भी UPI ऐप से भुगतान — PhonePe, GPay, Paytm या अपने बैंक की ऐप से स्कैन करें।',
    roomsHeader: 'आरक्षित कमरे',
    adultsLabel: 'वयस्क', adultLabel: 'वयस्क',
    childrenLabel: 'बच्चे', childLabel: 'बच्चा',
    guestsTotal: 'कुल मेहमान',
    childAgeNote: (age) => `${age} साल से कम उम्र के बच्चे मुफ्त; ${age}+ वयस्क के रूप में गिने जाते हैं।`,
    houseRulesHeader: 'घर के नियम',
    termsLabel: 'शर्तें:',
    termsBody: (p, id, withTax) =>
      `चेक-इन ${esc(p.checkIn || '14:00')} से, चेक-आउट ${esc(p.checkOut || '11:00')} तक। चेक-इन पर वैध फोटो आईडी ज़रूरी।${withTax ? ' GST लागू होने पर लिया जाएगा।' : ''} ${p.phone ? `किसी भी बदलाव के लिए WhatsApp ${esc(p.phone)} पर <strong>${esc(id)}</strong> का उल्लेख करें।` : `किसी भी बदलाव के लिए <strong>${esc(id)}</strong> का उल्लेख करें।`}`,
    cancelLabel: 'कैंसलेशन पॉलिसी',
    cancelFlexible: (h) => `चेक-इन से ${h} घंटे पहले तक फ्री कैंसलेशन। उसके बाद कैंसल करने पर चार्ज लग सकता है; नो-शो पर एडवांस ज़ब्त।`,
    cancelModerate: (h) => `चेक-इन से ${h} घंटे पहले तक फ्री कैंसलेशन। उसके बाद बुकिंग का 50% चार्ज होगा; नो-शो पर एडवांस ज़ब्त।`,
    cancelStrict: (h) => `चेक-इन से ${h} घंटे पहले तक फ्री कैंसलेशन। उसके बाद कोई रिफंड नहीं; नो-शो पर एडवांस ज़ब्त।`,
    cancelNonRefundable: 'नॉन-रिफंडेबल रेट — कैंसल या नो-शो पर रिफंड नहीं।',
    thanksLine: (name, city) => `${esc(name)} चुनने के लिए धन्यवाद।${city ? ' हम ' + esc(city) + ' में आपकी मेज़बानी का इंतज़ार कर रहे हैं।' : ' हम आपकी मेज़बानी का इंतज़ार कर रहे हैं।'}`,
    printBtn: 'PDF सहेजें / प्रिंट करें',
    closeBtn: 'बंद करें',
    dateLocale: 'hi-IN',
  },
};

export function generateVoucher(b, rt, property, invoice, lang = 'en') {
  // Refuse to render a voucher when the property has no name. Without
  // this guard we'd silently use FALLBACK_PROPERTY (now empty, used to
  // be Yatra's profile) and ship a guest a voucher with no — or worse,
  // someone else's — hotel name. Better to surface the gap to the
  // hotelier so they finish the Property Profile first.
  const hasProp = property && property.profile && (property.profile.name || '').trim().length > 0;
  if (!hasProp) {
    const w = window.open('', '_blank', 'width=700,height=500');
    if (w) {
      const msg = lang === 'hi'
        ? 'पहले Settings में अपनी होटल की जानकारी भरें — नाम, पता और चेक-इन समय — फिर वाउचर तैयार होगा।'
        : "Add your hotel's name and address in Settings → Property profile first, then the voucher can be generated.";
      w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Property not set up</title></head><body style="font-family: sans-serif; padding: 40px; max-width: 480px; margin: 0 auto; color: #1a1a1a;"><h2 style="color: #C8553D;">Property profile is empty</h2><p style="line-height: 1.5;">${msg}</p><button onclick="window.close()" style="margin-top: 20px; padding: 10px 18px; border-radius: 8px; border: none; background: #C8553D; color: #fff; font-weight: 700; cursor: pointer;">Close</button></body></html>`);
      w.document.close();
    }
    return;
  }
  const prop = property;
  const p = prop.profile;
  // Inject the hotelier's brand colour into the printable HTML. The voucher
  // opens in a new window so it doesn't inherit the app's CSS variables —
  // values must be computed and template-injected directly. Handles both
  // preset hues and custom hex colours.
  const theme = themeColors(prop.theme);
  const BRAND      = theme.primaryDk;  // strong accent — borders, headings, totals
  const BRAND_LITE = theme.primary;    // softer accent — gradient end, note border
  const L = VSTR[lang] || VSTR.en;
  const isInvoice = !!invoice && !!invoice.number;
  const invoiceAmount = isInvoice ? (invoice.amount || b.total || 0) : (b.total || 0);
  const docTitle = isInvoice ? L.invoice : L.voucher;
  const recipientName = isInvoice ? (invoice.recipient?.name || b.guest) : b.guest;
  const recipientGstin = isInvoice ? (invoice.recipient?.gstin || '') : '';
  const invoiceDate = isInvoice && invoice.date ? new Date(invoice.date) : new Date();
  const addressLine = [p.address, p.city, p.state, p.pincode].filter(Boolean).join(', ');
  // Shared ANCHOR from data.js (local midnight of today) — same source the
  // rest of the app uses, so a booking that's 11 days out renders here as
  // the same date the Diary and BookingDetail show.
  const checkIn = new Date(ANCHOR);
  checkIn.setDate(checkIn.getDate() + (b.startIdx || 0));
  const checkOut = new Date(ANCHOR);
  checkOut.setDate(checkOut.getDate() + (b.startIdx || 0) + b.nights);
  const fmtDate = (d) => d.toLocaleDateString(L.dateLocale, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
  const fmtINR = (n) => '₹' + (n || 0).toLocaleString('en-IN');
  const balance = (b.total || 0) - (b.paid || 0);
  const isHold = b.status === 'tentative' && balance > 0 && (b.releaseAt || b.releaseTs);
  const releaseLabel = b.releaseTs
    ? new Date(b.releaseTs).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
    : (b.releaseAt || '');
  // R10-10: extras honour their unit (per night / per guest / etc.) via the
  // shared helper — matching NewBooking + the BookingDetail folio. This used
  // to be price × qty only, under-showing per-night extras and overstating
  // the tariff line by the difference (grand total stayed correct).
  const extrasList = extrasBreakdownFor(b, prop).items;
  const logoLetter = (p.name || 'A').trim().charAt(0).toUpperCase();
  // Tax invoices always show the GST breakdown; vouchers show it only when the
  // booking is GST-applicable per its channel/override flag. Always CGST 6% +
  // SGST 6% — the IGST inter-state branch was retired (owners didn't want to
  // track guest-state on every booking; CA handles any inter-state nuances).
  const withTax = isInvoice || bookingGstApplies(b);
  const baseAmount = isInvoice ? invoiceAmount : (b.total || 0);
  const tx = withTax
    ? getTaxBreakdown({ ...b, total: baseAmount, gstApplies: true }, prop)
    : { gst: 0, cgst: 0, sgst: 0, igst: 0, interState: false };
  const gstAmt = tx.gst;
  const preTax = baseAmount - gstAmt;
  const extrasSum = isInvoice ? 0 : extrasList.reduce((s, e) => s + e.total, 0);
  const mealPlan = mealPlanById(prop, b.mealPlanId);
  const mealCost = isInvoice ? 0 : mealCostFor(b, prop);
  // Extra-adult / extra-child surcharge — surfaced as a separate folio
  // row so the guest sees why their bill exceeded the published rate.
  const extraGuests = isInvoice ? 0 : extraGuestCostFor(b, prop);
  // R8-11: a coupon discount reduced the stored total, silently shrinking the
  // tariff line with no explanation. Add it back so the room rate shows in
  // full and render an explicit Discount row below — the two cancel, so the
  // rows still sum to the exact total.
  const discountAmount = isInvoice ? 0 : Math.max(0, +b.discountAmount || 0);
  // A credit note also reduced the stored total (addPayment subtracts it). Add it
  // back so the room rate prints in full + render an explicit Credit note row
  // below — same treatment as the discount row, so the rows still sum to the total.
  const credits = isInvoice ? 0 : (Array.isArray(b.payments) ? b.payments : []).reduce((s, p) => s + ((p.kind === 'credit' || p.kind === 'credit_note') ? (+p.amount || 0) : 0), 0);
  // Cancellation policy from the booking's rate plan. ONLY shown when the
  // hotelier has actually turned on rate plans (ratePlansActive) AND the
  // booking's plan defines a cancellation — otherwise we'd assert a "free
  // cancellation up to 48h" policy the hotelier never set (audit #9). The
  // seeded Standard plan carries a flexible/48h default, but that's a seed, not
  // a deliberate choice, so a default property prints no cancellation block.
  const _rpList = Array.isArray(prop.ratePlans) ? prop.ratePlans : [];
  const _bookingRp = _rpList.find(x => x.id === (b.ratePlanId || 'standard'));
  const _cxn = _bookingRp && _bookingRp.cancellation;
  const _refH = _bookingRp && _bookingRp.refundHours ? _bookingRp.refundHours : 48;
  const showCancelPolicy = ratePlansActive(prop) && !!_cxn;
  const cancelText = _cxn === 'non-refundable' ? L.cancelNonRefundable
    : _cxn === 'moderate' ? L.cancelModerate(_refH)
    : _cxn === 'strict' ? L.cancelStrict(_refH)
    : L.cancelFlexible(_refH);
  const tariffLine = preTax - extrasSum - mealCost - extraGuests + discountAmount + credits;
  const docNumber = isInvoice ? invoice.number : b.id;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Voucher · ${esc(b.id)} · ${esc(b.guest)}</title>
<style>
  @page { size: A4; margin: 18mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1a1a1a; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { padding: 24px; max-width: 720px; margin: 0 auto; font-size: 12pt; line-height: 1.45; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 18px; border-bottom: 2px solid ${BRAND}; margin-bottom: 24px; }
  .brand { display: flex; align-items: center; gap: 12px; }
  .logo { width: 44px; height: 44px; border-radius: 10px; background: linear-gradient(135deg, ${BRAND}, ${BRAND_LITE}); color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 20px; font-family: Georgia, serif; }
  .brand-name { font-size: 17pt; font-weight: 800; color: #1a1a1a; letter-spacing: -0.3px; }
  .brand-sub { font-size: 9pt; color: #777; margin-top: 2px; }
  .voucher-meta { text-align: right; font-size: 9pt; color: #777; }
  .voucher-meta .id { font-size: 13pt; font-weight: 700; color: ${BRAND}; letter-spacing: 0.5px; margin-bottom: 4px; }
  h2 { font-size: 9pt; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #999; margin-bottom: 8px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 22px; }
  .card { border: 1px solid #E8E0D8; border-radius: 10px; padding: 14px 16px; background: #FBF7F3; }
  .stay { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 18px; padding: 18px 20px; background: #FBF7F3; border-radius: 12px; margin-bottom: 22px; border: 1px solid #E8E0D8; }
  .stay .date-label { font-size: 8pt; font-weight: 700; letter-spacing: 1.2px; color: #999; text-transform: uppercase; }
  .stay .date-value { font-size: 16pt; font-weight: 700; margin-top: 2px; }
  .stay .date-sub { font-size: 9pt; color: #888; }
  .stay .nights { text-align: center; }
  .stay .nights-num { font-size: 22pt; font-weight: 800; color: ${BRAND}; line-height: 1; }
  .stay .nights-lbl { font-size: 8pt; color: #999; letter-spacing: 1px; margin-top: 2px; text-transform: uppercase; }
  .rooms-card { padding: 14px 16px; background: #fff; border: 1px solid #E8E0D8; border-radius: 12px; margin-bottom: 18px; }
  .rooms-card-head { font-size: 8pt; font-weight: 700; letter-spacing: 1.2px; color: #888; text-transform: uppercase; margin-bottom: 8px; }
  .rooms-table { width: 100%; border-collapse: collapse; font-size: 11pt; }
  .rooms-table td { padding: 6px 0; border-bottom: 1px dashed #F0E8E0; }
  .rooms-table td.r { text-align: right; }
  .rooms-table tfoot td { border-bottom: none; padding-top: 10px; font-weight: 700; color: #1a1a1a; }
  .rooms-pill { display: inline-block; padding: 3px 9px; border-radius: 999px; background: #FBF7F3; color: #5a4a3a; font-size: 10pt; font-weight: 700; margin-left: 6px; border: 1px solid #E8E0D8; }
  .rooms-pill.rooms-pill-c { background: ${BRAND_LITE}; color: ${BRAND}; border-color: ${BRAND_LITE}; }
  .rooms-pill.rooms-pill-total { background: ${BRAND}; color: #fff; border-color: ${BRAND}; }
  .rooms-pill.rooms-pill-total.rooms-pill-c { background: ${BRAND_LITE}; color: ${BRAND}; border-color: ${BRAND}; }
  .rooms-note { margin-top: 8px; font-size: 9pt; color: #888; font-style: italic; }
  .meal-chip { display: flex; align-items: center; gap: 14px; padding: 12px 16px; background: ${BRAND_LITE}; border-radius: 10px; margin-bottom: 22px; border: 1px solid ${BRAND}; }
  .meal-chip .meal-code { font-size: 18pt; font-weight: 800; color: ${BRAND}; letter-spacing: 1px; min-width: 56px; text-align: center; padding: 4px 10px; background: #fff; border-radius: 6px; }
  .meal-chip .meal-body { flex: 1; }
  .meal-chip .meal-label { font-size: 8pt; font-weight: 700; letter-spacing: 1.2px; color: ${BRAND}; text-transform: uppercase; }
  .meal-chip .meal-name { font-size: 12pt; font-weight: 700; color: #1a1a1a; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 22px; font-size: 11pt; }
  th { text-align: left; padding: 8px 6px; border-bottom: 1.5px solid #E8E0D8; font-size: 8pt; font-weight: 700; letter-spacing: 1px; color: #999; text-transform: uppercase; }
  th.r, td.r { text-align: right; }
  td { padding: 8px 6px; border-bottom: 1px solid #F0E8E0; }
  tfoot td { border-bottom: none; font-weight: 700; padding-top: 12px; font-size: 12pt; }
  tfoot td.total { color: ${BRAND}; font-size: 14pt; }
  .note { padding: 12px 14px; background: #FFF8F0; border-left: 3px solid ${BRAND_LITE}; border-radius: 0 8px 8px 0; font-size: 10pt; color: #555; margin-bottom: 22px; }
  .note .lbl { font-size: 8pt; font-weight: 700; color: ${BRAND}; letter-spacing: 1px; margin-bottom: 4px; text-transform: uppercase; }
  .terms { font-size: 8pt; color: #888; line-height: 1.5; padding-top: 18px; border-top: 1px solid #E8E0D8; }
  .terms strong { color: #1a1a1a; }
  .stamp { display: inline-block; padding: 6px 14px; border: 2px solid ${isHold ? '#B45309' : balance > 0 ? BRAND : '#0E8A5F'}; color: ${isHold ? '#B45309' : balance > 0 ? BRAND : '#0E8A5F'}; font-size: 10pt; font-weight: 800; letter-spacing: 1.5px; border-radius: 6px; transform: rotate(-3deg); }
  .hold { padding: 14px 16px; background: #FFFBEB; border: 1.5px solid #FDE68A; border-left: 4px solid #B45309; border-radius: 8px; margin-bottom: 22px; }
  .hold .lbl { font-size: 9pt; font-weight: 800; color: #B45309; letter-spacing: 1.2px; margin-bottom: 4px; text-transform: uppercase; }
  .hold .msg { font-size: 11pt; color: #1a1a1a; line-height: 1.5; }
  .hold .when { font-weight: 700; color: #B45309; }
  .actions { margin-top: 24px; display: flex; gap: 10px; justify-content: center; }
  .actions button { padding: 10px 22px; border-radius: 8px; border: 1px solid ${BRAND}; background: ${BRAND}; color: #fff; font-size: 11pt; font-weight: 700; cursor: pointer; }
  .actions button.ghost { background: #fff; color: ${BRAND}; }
  @media print { .actions { display: none; } }
</style>
</head>
<body>
  <div class="head">
    <div class="brand">
      <div class="logo">${p.logoDataUrl
        ? `<img src="${esc(p.logoDataUrl)}" alt="Logo" style="width:100%; height:100%; border-radius:10px; object-fit:contain; background:#fff;" />`
        : esc(logoLetter)}</div>
      <div>
        <div class="brand-name">${esc(p.name)}</div>
        <div class="brand-sub">${esc(addressLine)}${p.phone ? ' · ' + esc(p.phone) : ''}</div>
        ${p.email || p.website ? `<div class="brand-sub" style="margin-top:1px;">${p.email ? esc(p.email) : ''}${p.email && p.website ? ' · ' : ''}${safeUrl(p.website) ? `<a href="${esc(safeUrl(p.website))}" style="color:${BRAND}; text-decoration:none; font-weight:600;">${esc(p.website.replace(/^https?:\/\//, ''))}</a>` : (p.website ? esc(p.website.replace(/^https?:\/\//, '')) : '')}</div>` : ''}
        ${p.landmark ? `<div class="brand-sub" style="margin-top:1px;">📍 ${esc(p.landmark)}</div>` : ''}
        ${safeUrl(p.mapUrl) ? `<div class="brand-sub" style="margin-top:2px;"><a href="${esc(safeUrl(p.mapUrl))}" style="color:${BRAND}; text-decoration:none; font-weight:600;">View on map →</a></div>` : ''}
        ${prop.gstin ? `<div class="brand-sub" style="margin-top:2px;"><strong>GSTIN:</strong> ${esc(prop.gstin)}</div>` : ''}
      </div>
    </div>
    <div class="voucher-meta">
      <div class="id">${esc(docNumber)}</div>
      <div>${isInvoice ? L.invoiceDate : L.issued} ${invoiceDate.toLocaleDateString(L.dateLocale, { day: '2-digit', month: 'short', year: 'numeric' })}</div>
      ${isInvoice ? `<div style="font-size:8pt; color:#888; margin-top:2px;">${L.booking} ${esc(b.id)}</div>` : ''}
      <div style="margin-top: 8px;"><span class="stamp">${isInvoice ? L.stampInvoice : isHold ? L.stampHold : balance > 0 ? L.stampDue : L.stampPaid}</span></div>
    </div>
  </div>

  <h2>${esc(docTitle)}</h2>
  <div class="grid">
    <div class="card">
      <h2 style="margin-bottom: 10px;">${isInvoice ? L.billedTo : L.guest}</h2>
      <div style="font-size: 13pt; font-weight: 700;">${esc(recipientName)}</div>
      ${isInvoice ? '' : `<div style="font-size: 10pt; color: #666; margin-top: 4px;">${esc(b.phone || '')}</div>`}
      ${recipientGstin ? `<div style="font-size: 10pt; color: #666; margin-top: 4px;"><strong>GSTIN:</strong> ${esc(recipientGstin)}</div>` : ''}
      ${isInvoice && invoice.recipient?.address ? `<div style="font-size: 10pt; color: #666; margin-top: 4px;">${esc(invoice.recipient.address)}</div>` : ''}
      ${!isInvoice ? `<div style="font-size: 10pt; color: #666;">${esc(b.guests || '')}</div>` : ''}
    </div>
    <div class="card">
      <h2 style="margin-bottom: 10px;">${L.accommodation}</h2>
      <div style="font-size: 13pt; font-weight: 700;">${rt ? esc(rt.name) : 'Room'}</div>
      <div style="font-size: 10pt; color: #666; margin-top: 4px;">${(b.roomItems && b.roomItems.length) || 1} ${((b.roomItems && b.roomItems.length) || 1) === 1 ? L.unitSingular : L.unitPlural} · ${esc(b.guests || '')}</div>
      ${isInvoice ? `<div style="font-size: 9pt; color: #888; margin-top: 6px;">${L.hsnHint}</div>` : ''}
    </div>
  </div>

  <div class="stay">
    <div>
      <div class="date-label">${L.checkIn}</div>
      <div class="date-value">${fmtDate(checkIn)}</div>
      <div class="date-sub">${L.fromTime} ${esc(p.checkIn || '14:00')}</div>
    </div>
    <div class="nights">
      <div class="nights-num">${b.nights}</div>
      <div class="nights-lbl">${b.nights === 1 ? L.night : L.nights}</div>
    </div>
    <div style="text-align: right;">
      <div class="date-label">${L.checkOut}</div>
      <div class="date-value">${fmtDate(checkOut)}</div>
      <div class="date-sub">${L.byTime} ${esc(p.checkOut || '11:00')}</div>
    </div>
  </div>

  ${isHold ? `<div class="hold">
    <div class="lbl">${L.holdTitle}</div>
    <div class="msg">${L.holdMsg1} <span class="when">${releaseLabel}</span>. ${L.holdMsg2} ${fmtINR(balance)} ${L.holdMsg3} <strong>${L.holdMsg4}</strong> ${L.holdMsg5}</div>
  </div>` : ''}

  ${(() => {
    // Rooms reserved card — one row per roomItem with explicit
    // adults + children. The folio sometimes muddles this (e.g. when
    // the booking has two rooms of different types). This card makes
    // it unambiguous + sums totals for the front-desk pre-check.
    const parseGuests = (g) => {
      // Sum EVERY "<n>A" / "<n>C" token (not just the first), and never
      // fabricate "2 Adults" when nothing parses — fall back to the guaranteed
      // minimum of 1 adult (audit). Only the legacy no-roomItems path uses this.
      const s = String(g || '');
      let adults = 0, children = 0;
      for (const m of s.matchAll(/(\d+)\s*A/gi)) adults += parseInt(m[1], 10) || 0;
      for (const m of s.matchAll(/(\d+)\s*C/gi)) children += parseInt(m[1], 10) || 0;
      return { adults: adults || 1, children };
    };
    const items = Array.isArray(b.roomItems) && b.roomItems.length > 0
      ? b.roomItems
      : [{ roomTypeId: b.roomTypeId, ...parseGuests(b.guests) }];
    let totalA = 0, totalC = 0;
    const cats = Array.isArray(prop?.categories) ? prop.categories : [];
    const findCat = (id) => cats.find(c => c.id === id);
    // Booked-room photo — use the first roomItem's category photo as
    // the hero. Only one image even with multi-category bookings to
    // keep the voucher tight; the per-row text still calls out each
    // type by name.
    const heroCat = findCat((items[0] && items[0].roomTypeId) || b.roomTypeId);
    const heroPhoto = heroCat && heroCat.photoDataUrl ? heroCat.photoDataUrl : null;
    const voucherBands = effectiveChildBands(prop);
    const rows = items.map((it, i) => {
      const cat = findCat(it.roomTypeId || b.roomTypeId);
      const name = (cat && cat.name) || (rt && rt.name) || '—';
      const a = it.adults || 0;
      // Count EVERY child band (free/half/full/custom), not just the half field.
      const c = childTotalForItem(it);
      totalA += a; totalC += c;
      const aLabel = a === 1 ? L.adultLabel : L.adultsLabel;
      // Itemise children by band when the booking carries the band map;
      // legacy bookings (only a total) show one combined children pill.
      let childPills = '';
      if (c > 0) {
        if (it.childBands && Object.keys(it.childBands).length) {
          childPills = voucherBands
            .filter(bd => (it.childBands[bd.id] || 0) > 0)
            .map(bd => `<span class="rooms-pill rooms-pill-c">${it.childBands[bd.id]} · ${esc(bd.label || L.childLabel)}</span>`)
            .join('');
        } else {
          const cLabel = c === 1 ? L.childLabel : L.childrenLabel;
          childPills = `<span class="rooms-pill rooms-pill-c">${c} ${cLabel}</span>`;
        }
      }
      return `<tr>
        <td><strong>${esc(name)}</strong></td>
        <td class="r"><span class="rooms-pill">${a} ${aLabel}</span>${childPills}</td>
      </tr>`;
    }).join('');
    const totalALabel = totalA === 1 ? L.adultLabel : L.adultsLabel;
    const totalCLabel = totalC === 1 ? L.childLabel : L.childrenLabel;
    const childAge = (prop?.accountant?.childAgeBelow != null) ? prop.accountant.childAgeBelow : 12;
    return `<div class="rooms-card">
      <div class="rooms-card-head">${L.roomsHeader}</div>
      ${heroPhoto ? `<img src="${esc(heroPhoto)}" alt="${esc((heroCat && heroCat.name) || 'Room')}" style="width: 100%; height: 180px; object-fit: cover; border-radius: 8px; margin-bottom: 12px; display: block;" />` : ''}
      <table class="rooms-table">
        <tbody>${rows}</tbody>
        <tfoot>
          <tr>
            <td>${L.guestsTotal}</td>
            <td class="r"><span class="rooms-pill rooms-pill-total">${totalA} ${totalALabel}</span>${totalC > 0 ? `<span class="rooms-pill rooms-pill-total rooms-pill-c">${totalC} ${totalCLabel}</span>` : ''}</td>
          </tr>
        </tfoot>
      </table>
      ${totalC > 0 ? `<div class="rooms-note">${L.childAgeNote(childAge)}</div>` : ''}
    </div>`;
  })()}

  ${mealPlan && !isInvoice ? `<div class="meal-chip">
    <div class="meal-code">${esc(mealPlan.code)}</div>
    <div class="meal-body">
      <div class="meal-label">${L.mealPlan}</div>
      <div class="meal-name">${esc(mealPlan.label)}</div>
    </div>
  </div>` : ''}

  <h2>${isInvoice ? L.invoiceLines : L.folio}</h2>
  <table>
    <thead>
      <tr><th>${L.colDescription}</th><th class="r">${L.colQty}</th><th class="r">${L.colRate}</th><th class="r">${L.colAmount}</th></tr>
    </thead>
    <tbody>
      <tr>
        <td>${rt ? esc(rt.name) : 'Room'} · ${L.tariff}${withTax ? ' (' + L.exclGst + ')' : ''}</td>
        <td class="r">${(b.roomItems && b.roomItems.length) || 1} × ${b.nights}${lang === 'hi' ? '' : 'N'}</td>
        <td class="r">—</td>
        <td class="r">${fmtINR(tariffLine)}</td>
      </tr>
      ${extraGuests > 0 ? `
      <tr><td>${lang === 'hi' ? 'अतिरिक्त मेहमान शुल्क' : 'Extra-guest charges'}</td><td class="r">—</td><td class="r">—</td><td class="r">${fmtINR(extraGuests)}</td></tr>` : ''}
      ${(() => {
        if (!mealPlan) return '';
        const defaultId = prop?.defaultMealPlanId || 'ep';
        const isDefault = mealPlan.id === defaultId;
        // Default plan row → "included" amount column, no delta.
        if (isDefault) {
          return `<tr><td>${L.mealPlan} · <strong>${esc(mealPlan.code)}</strong> · ${esc(mealPlan.label)}</td><td class="r">—</td><td class="r">${L.included}</td><td class="r">—</td></tr>`;
        }
        // Different plan, positive delta → charge.
        if (mealCost > 0) {
          return `<tr><td>${L.mealPlan} · <strong>${esc(mealPlan.code)}</strong> · ${esc(mealPlan.label)}</td><td class="r">—</td><td class="r">—</td><td class="r">${fmtINR(mealCost)}</td></tr>`;
        }
        // Different plan, negative delta → discount (cheaper than default).
        if (mealCost < 0) {
          return `<tr><td>${L.mealPlan} · <strong>${esc(mealPlan.code)}</strong> · ${esc(mealPlan.label)}</td><td class="r">—</td><td class="r">—</td><td class="r">− ${fmtINR(Math.abs(mealCost))}</td></tr>`;
        }
        // Same price, different plan → just label it.
        return `<tr><td>${L.mealPlan} · <strong>${esc(mealPlan.code)}</strong> · ${esc(mealPlan.label)}</td><td class="r">—</td><td class="r">—</td><td class="r">—</td></tr>`;
      })()}
      ${extrasList.map(e => `<tr><td>${esc(e.label)}</td><td class="r">${e.qty}</td><td class="r">${fmtINR(e.price)}</td><td class="r">${fmtINR(e.total)}</td></tr>`).join('')}
      ${discountAmount > 0 ? `<tr><td>${lang === 'hi' ? 'छूट' : 'Discount'}${b.couponCode ? ` · <strong>${esc(b.couponCode)}</strong>` : ''}</td><td class="r">—</td><td class="r">—</td><td class="r" style="color:#0a7a3a;">− ${fmtINR(discountAmount)}</td></tr>` : ''}
      ${credits > 0 ? `<tr><td>${lang === 'hi' ? 'क्रेडिट नोट' : 'Credit note'}</td><td class="r">—</td><td class="r">—</td><td class="r" style="color:#0a7a3a;">− ${fmtINR(credits)}</td></tr>` : ''}
      ${withTax ? (() => {
        const halfRate = (tx.rate / 2).toFixed(tx.rate % 2 ? 1 : 0);
        return `
      <tr><td style="color:#666;">CGST @ ${halfRate}%</td><td class="r" style="color:#666;">—</td><td class="r" style="color:#666;">—</td><td class="r" style="color:#666;">${fmtINR(tx.cgst)}</td></tr>
      <tr><td style="color:#666;">SGST @ ${halfRate}%</td><td class="r" style="color:#666;">—</td><td class="r" style="color:#666;">—</td><td class="r" style="color:#666;">${fmtINR(tx.sgst)}</td></tr>`;
      })() : ''}
    </tbody>
    <tfoot>
      <tr><td colspan="3">${isInvoice ? L.invoiceTotal : L.total}</td><td class="r total">${fmtINR(baseAmount)}</td></tr>
      ${!isInvoice ? `<tr><td colspan="3" style="font-size: 11pt; color: #666;">${L.paid}</td><td class="r" style="font-size: 11pt; color: #0E8A5F;">${fmtINR(b.paid)}</td></tr>` : ''}
      ${!isInvoice && balance > 0 ? `<tr><td colspan="3" style="font-size: 11pt;">${isHold ? `${L.balanceDueBefore} ${esc(releaseLabel)}` : L.balanceDue}</td><td class="r" style="color: ${BRAND};">${fmtINR(balance)}</td></tr>` : ''}
    </tfoot>
  </table>
  ${isInvoice ? `
  <div style="margin-bottom: 18px; padding: 12px 14px; background: #FBF7F3; border: 1px solid #E8E0D8; border-radius: 8px; font-size: 9pt; line-height: 1.5;">
    <strong>${L.placeOfSupply}:</strong> ${esc(p.state || '—')} · <strong>${L.invoiceNo}:</strong> ${esc(invoice.number)} · <strong>${L.fy}:</strong> ${esc(invoice.fy || '')}
    ${invoice.note ? `<br/><strong>${L.note}:</strong> ${esc(invoice.note)}` : ''}
  </div>` : ''}

  ${b.notes ? `<div class="note"><div class="lbl">${L.specialRequest}</div>${esc(b.notes).replace(/\n/g, '<br/>')}</div>` : ''}

  ${!isInvoice && Array.isArray(prop?.rules) && prop.rules.length > 0 ? `
  <div style="margin-bottom: 22px; padding: 14px 16px; background: #fff; border: 1px solid #E8E0D8; border-radius: 10px;">
    <div style="font-size: 8pt; font-weight: 700; letter-spacing: 1.2px; color: #888; text-transform: uppercase; margin-bottom: 8px;">${L.houseRulesHeader}</div>
    <ul style="margin: 0 0 0 16px; padding: 0; font-size: 9.5pt; color: #4a4a4a; line-height: 1.55;">
      ${prop.rules.map(r => `<li style="margin-bottom: 3px;">${esc(r)}</li>`).join('')}
    </ul>
  </div>` : ''}

  ${!isInvoice && p.paymentQrDataUrl ? `
  <div style="margin: 20px 0 22px; padding: 16px 18px; background: #FBF7F3; border: 1px solid #E8E0D8; border-radius: 12px; display: flex; gap: 18px; align-items: center;">
    <img src="${esc(p.paymentQrDataUrl)}" alt="Payment QR" title="Tap to enlarge"
      onclick="(function(img){var o=document.createElement('div');o.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;z-index:99999;cursor:zoom-out';o.onclick=function(){o.remove()};var b=new Image();b.src=img.src;b.style.cssText='max-width:92vw;max-height:92vh;background:#fff;padding:18px;border-radius:14px;cursor:default';b.onclick=function(e){e.stopPropagation()};var x=document.createElement('div');x.textContent='✕';x.setAttribute('aria-label','Close');x.style.cssText='position:fixed;top:14px;right:20px;color:#fff;font-size:32px;font-weight:700;line-height:1;cursor:pointer';o.appendChild(b);o.appendChild(x);document.body.appendChild(o);})(this)"
      style="width: 200px; height: 200px; border-radius: 8px; background: #fff; padding: 8px; object-fit: contain; flex-shrink: 0; cursor: zoom-in;" />
    <div style="flex: 1; min-width: 0;">
      <div style="font-size: 9pt; font-weight: 700; color: ${BRAND}; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 4px;">${L.scanToPay}</div>
      <div style="font-size: 13pt; font-weight: 700; color: #1a1a1a; margin-bottom: 4px;">${fmtINR(balance > 0 ? balance : baseAmount)}</div>
      <div style="font-size: 10pt; color: #555; line-height: 1.5;">
        ${balance > 0 ? L.scanBalance : L.scanFull}
        ${p.paymentQrLabel ? `<br/><strong style="color: ${BRAND};">${esc(p.paymentQrLabel)}</strong>` : ''}
      </div>
    </div>
  </div>` : ''}

  ${(!isInvoice && showCancelPolicy) ? `<div style="margin: 6px 0 14px; padding: 11px 14px; background: #FBF7F3; border: 1px solid #E8E0D8; border-radius: 10px;">
    <div style="font-size: 8.5pt; font-weight: 700; color: ${BRAND}; letter-spacing: 0.8px; text-transform: uppercase;">${L.cancelLabel}</div>
    <div style="font-size: 10pt; color: #333; line-height: 1.5; margin-top: 3px;">${cancelText}</div>
  </div>` : ''}

  <div class="terms">
    <strong>${L.termsLabel}</strong> ${L.termsBody(p, b.id, withTax)}
    <br/><br/>
    <strong>${L.thanksLine(p.name, p.city)}</strong>
  </div>

  <div style="margin-top: 14px; padding: 10px 12px; background: #FBF7F3; border: 1px solid #E8E0D8; border-radius: 7px; font-size: 7.5pt; color: #888; line-height: 1.45; text-align: center;">
    ${lang === 'hi'
      ? 'Atithi बुकिंग सॉफ़्टवेयर है, प्रॉपर्टी नहीं। प्रॉपर्टी अपनी सेवाओं, आचरण और किसी भी विवाद के लिए स्वतंत्र रूप से ज़िम्मेदार है।'
      : 'Atithi is the booking software, not the property. The property is independently responsible for its services, conduct, and any disputes.'}
  </div>

  <div class="actions">
    <button onclick="window.print()">${L.printBtn}</button>
    <button class="ghost" onclick="window.close()">${L.closeBtn}</button>
  </div>
  <script>
    // Wait for every image to finish loading before auto-printing, so the PDF
    // never misses the logo / room photo / payment QR. This matters now that
    // images can be CDN URLs (fetched at print time) rather than embedded
    // base64 — a base64 image is already "complete", a URL one needs a moment.
    // Hard 3s fallback guarantees the print always fires even if an image 404s.
    (function(){
      function doPrint(){ try { window.print(); } catch(e){} }
      var imgs = Array.prototype.slice.call(document.images || []);
      var pending = imgs.filter(function(i){ return !i.complete; });
      if (pending.length === 0) { setTimeout(doPrint, 250); return; }
      var left = pending.length, fired = false;
      function go(){ if (fired) return; fired = true; setTimeout(doPrint, 150); }
      function tick(){ if (--left <= 0) go(); }
      pending.forEach(function(i){ i.addEventListener('load', tick); i.addEventListener('error', tick); });
      setTimeout(go, 3000);
    })();
  <\/script>
</body>
</html>`;

  const w = window.open('', '_blank', 'width=820,height=900');
  if (w) { w.document.write(html); w.document.close(); }
  return html;
}

// Return the voucher HTML as a string without opening a window. Used by
// the Share booking flow to attach the voucher as a file via the Web
// Share API (mobile Chrome / iOS Safari support sharing files
// natively). For desktop fall-back we still call generateVoucher()
// which opens the print window.
export function voucherHtmlString(b, rt, property, invoice, lang = 'en') {
  // Re-uses generateVoucher's HTML build but swallows the window.open
  // side-effect. We monkey-patch window.open briefly so the existing
  // function doesn't pop a window when we just want the string.
  const realOpen = typeof window !== 'undefined' ? window.open : null;
  if (typeof window !== 'undefined') {
    window.open = () => ({
      document: { write: () => {}, close: () => {} },
      print: () => {},
      close: () => {},
    });
  }
  try {
    const html = generateVoucher(b, rt, property, invoice, lang);
    return html;
  } finally {
    if (realOpen && typeof window !== 'undefined') window.open = realOpen;
  }
}

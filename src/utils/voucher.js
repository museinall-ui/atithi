import { EXTRAS_DEFAULT } from '../data.js';

export function generateVoucher(b, rt) {
  const checkIn = new Date(2026, 4, 4 + (b.startIdx || 0));
  const checkOut = new Date(2026, 4, 4 + (b.startIdx || 0) + b.nights);
  const fmtDate = (d) => d.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
  const fmtINR = (n) => '₹' + (n || 0).toLocaleString('en-IN');
  const balance = (b.total || 0) - (b.paid || 0);
  const extrasList = Object.entries(b.extras || {}).map(([id, qty]) => {
    const all = [...EXTRAS_DEFAULT, ...(b.customExtras || [])];
    const ex = all.find(x => x.id === id);
    if (!ex) return null;
    const price = (b.extraPrices && b.extraPrices[id] != null) ? b.extraPrices[id] : ex.price;
    return { label: ex.label, qty, price, total: price * qty };
  }).filter(Boolean);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Voucher · ${b.id} · ${b.guest}</title>
<style>
  @page { size: A4; margin: 18mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1a1a1a; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { padding: 24px; max-width: 720px; margin: 0 auto; font-size: 12pt; line-height: 1.45; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 18px; border-bottom: 2px solid #C8553D; margin-bottom: 24px; }
  .brand { display: flex; align-items: center; gap: 12px; }
  .logo { width: 44px; height: 44px; border-radius: 10px; background: linear-gradient(135deg, #C8553D, #E07A5F); color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 20px; font-family: Georgia, serif; }
  .brand-name { font-size: 17pt; font-weight: 800; color: #1a1a1a; letter-spacing: -0.3px; }
  .brand-sub { font-size: 9pt; color: #777; margin-top: 2px; }
  .voucher-meta { text-align: right; font-size: 9pt; color: #777; }
  .voucher-meta .id { font-size: 13pt; font-weight: 700; color: #C8553D; letter-spacing: 0.5px; margin-bottom: 4px; }
  h2 { font-size: 9pt; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #999; margin-bottom: 8px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 22px; }
  .card { border: 1px solid #E8E0D8; border-radius: 10px; padding: 14px 16px; background: #FBF7F3; }
  .stay { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 18px; padding: 18px 20px; background: #FBF7F3; border-radius: 12px; margin-bottom: 22px; border: 1px solid #E8E0D8; }
  .stay .date-label { font-size: 8pt; font-weight: 700; letter-spacing: 1.2px; color: #999; text-transform: uppercase; }
  .stay .date-value { font-size: 16pt; font-weight: 700; margin-top: 2px; }
  .stay .date-sub { font-size: 9pt; color: #888; }
  .stay .nights { text-align: center; }
  .stay .nights-num { font-size: 22pt; font-weight: 800; color: #C8553D; line-height: 1; }
  .stay .nights-lbl { font-size: 8pt; color: #999; letter-spacing: 1px; margin-top: 2px; text-transform: uppercase; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 22px; font-size: 11pt; }
  th { text-align: left; padding: 8px 6px; border-bottom: 1.5px solid #E8E0D8; font-size: 8pt; font-weight: 700; letter-spacing: 1px; color: #999; text-transform: uppercase; }
  th.r, td.r { text-align: right; }
  td { padding: 8px 6px; border-bottom: 1px solid #F0E8E0; }
  tfoot td { border-bottom: none; font-weight: 700; padding-top: 12px; font-size: 12pt; }
  tfoot td.total { color: #C8553D; font-size: 14pt; }
  .note { padding: 12px 14px; background: #FFF8F0; border-left: 3px solid #E07A5F; border-radius: 0 8px 8px 0; font-size: 10pt; color: #555; margin-bottom: 22px; }
  .note .lbl { font-size: 8pt; font-weight: 700; color: #C8553D; letter-spacing: 1px; margin-bottom: 4px; text-transform: uppercase; }
  .terms { font-size: 8pt; color: #888; line-height: 1.5; padding-top: 18px; border-top: 1px solid #E8E0D8; }
  .terms strong { color: #1a1a1a; }
  .stamp { display: inline-block; padding: 6px 14px; border: 2px solid ${balance > 0 ? '#C8553D' : '#0E8A5F'}; color: ${balance > 0 ? '#C8553D' : '#0E8A5F'}; font-size: 10pt; font-weight: 800; letter-spacing: 1.5px; border-radius: 6px; transform: rotate(-3deg); }
  .actions { margin-top: 24px; display: flex; gap: 10px; justify-content: center; }
  .actions button { padding: 10px 22px; border-radius: 8px; border: 1px solid #C8553D; background: #C8553D; color: #fff; font-size: 11pt; font-weight: 700; cursor: pointer; }
  .actions button.ghost { background: #fff; color: #C8553D; }
  @media print { .actions { display: none; } }
</style>
</head>
<body>
  <div class="head">
    <div class="brand">
      <div class="logo">A</div>
      <div>
        <div class="brand-name">Yatra Desert Camp</div>
        <div class="brand-sub">Sam Sand Dunes Road, Jaisalmer, Rajasthan 345001 · +91 98290 12345</div>
      </div>
    </div>
    <div class="voucher-meta">
      <div class="id">${b.id}</div>
      <div>Issued ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
      <div style="margin-top: 8px;"><span class="stamp">${balance > 0 ? 'BALANCE DUE' : 'PAID IN FULL'}</span></div>
    </div>
  </div>

  <h2>Booking voucher</h2>
  <div class="grid">
    <div class="card">
      <h2 style="margin-bottom: 10px;">Guest</h2>
      <div style="font-size: 13pt; font-weight: 700;">${b.guest}</div>
      <div style="font-size: 10pt; color: #666; margin-top: 4px;">${b.phone || ''}</div>
      <div style="font-size: 10pt; color: #666;">${b.guests || ''}</div>
    </div>
    <div class="card">
      <h2 style="margin-bottom: 10px;">Accommodation</h2>
      <div style="font-size: 13pt; font-weight: 700;">${rt ? rt.name : 'Room'}</div>
      <div style="font-size: 10pt; color: #666; margin-top: 4px;">${(b.roomItems && b.roomItems.length) || 1} unit(s) · ${b.guests || ''}</div>
    </div>
  </div>

  <div class="stay">
    <div>
      <div class="date-label">Check-in</div>
      <div class="date-value">${fmtDate(checkIn)}</div>
      <div class="date-sub">From 14:00</div>
    </div>
    <div class="nights">
      <div class="nights-num">${b.nights}</div>
      <div class="nights-lbl">${b.nights === 1 ? 'Night' : 'Nights'}</div>
    </div>
    <div style="text-align: right;">
      <div class="date-label">Check-out</div>
      <div class="date-value">${fmtDate(checkOut)}</div>
      <div class="date-sub">By 11:00</div>
    </div>
  </div>

  <h2>Folio</h2>
  <table>
    <thead>
      <tr><th>Description</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">Amount</th></tr>
    </thead>
    <tbody>
      <tr>
        <td>${rt ? rt.name : 'Room'} · tariff</td>
        <td class="r">${(b.roomItems && b.roomItems.length) || 1} × ${b.nights}N</td>
        <td class="r">—</td>
        <td class="r">${fmtINR(b.total - extrasList.reduce((s, e) => s + e.total, 0))}</td>
      </tr>
      ${extrasList.map(e => `<tr><td>${e.label}</td><td class="r">${e.qty}</td><td class="r">${fmtINR(e.price)}</td><td class="r">${fmtINR(e.total)}</td></tr>`).join('')}
    </tbody>
    <tfoot>
      <tr><td colspan="3">Total</td><td class="r total">${fmtINR(b.total)}</td></tr>
      <tr><td colspan="3" style="font-size: 11pt; color: #666;">Paid</td><td class="r" style="font-size: 11pt; color: #0E8A5F;">${fmtINR(b.paid)}</td></tr>
      ${balance > 0 ? `<tr><td colspan="3" style="font-size: 11pt;">Balance due at check-in</td><td class="r" style="color: #C8553D;">${fmtINR(balance)}</td></tr>` : ''}
    </tfoot>
  </table>

  ${b.notes ? `<div class="note"><div class="lbl">Special request</div>${b.notes}</div>` : ''}

  <div class="terms">
    <strong>Terms:</strong> Check-in from 14:00, check-out by 11:00. Valid photo ID required at check-in. Cancellation: free up to 48h before arrival; 50% charge thereafter; no-show forfeits full advance. GST will be charged as applicable. For any change, WhatsApp +91 98290 12345 quoting <strong>${b.id}</strong>.
    <br/><br/>
    <strong>Thank you for choosing Yatra Desert Camp.</strong> We look forward to hosting you in Jaisalmer.
  </div>

  <div class="actions">
    <button onclick="window.print()">Save as PDF / Print</button>
    <button class="ghost" onclick="window.close()">Close</button>
  </div>
  <script>setTimeout(function(){ window.print(); }, 400);<\/script>
</body>
</html>`;

  const w = window.open('', '_blank', 'width=820,height=900');
  if (w) { w.document.write(html); w.document.close(); }
}

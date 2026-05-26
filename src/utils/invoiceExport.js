// Renders a printable HTML page listing every issued (non-voided) invoice in
// the given list, in invoice-number order. Designed for the CA to attach to
// their monthly GSTR-1 filing. Opens in a new tab so the hotelier can save it
// as a PDF and email it.

import { listIssuedInvoices } from '../data.js';

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const fmtINR = (n) => '₹' + (n || 0).toLocaleString('en-IN');

const fmtDate = (iso) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

function buildHtml(invoices, property, period) {
  const p = property?.profile || {};
  const total = invoices.reduce((s, i) => s + (i.amount || 0), 0);
  const gstTotal = Math.round(total * 12 / 112);
  const preTax = total - gstTotal;

  const rows = invoices.map((inv, i) => {
    const invGst = Math.round((inv.amount || 0) * 12 / 112);
    const invPre = (inv.amount || 0) - invGst;
    return `
    <tr>
      <td>${i + 1}</td>
      <td class="mono"><strong>${esc(inv.number)}</strong></td>
      <td>${esc(fmtDate(inv.date))}</td>
      <td>${esc(inv.recipient?.name || '')}</td>
      <td class="mono">${esc(inv.recipient?.gstin || '—')}</td>
      <td class="r">${fmtINR(invPre)}</td>
      <td class="r">${fmtINR(invGst)}</td>
      <td class="r"><strong>${fmtINR(inv.amount)}</strong></td>
      <td class="mono small">${esc(inv.bookingId)}</td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Invoice list · ${esc(p.name || 'Property')} · ${esc(period)}</title>
<style>
  @page { size: A4 landscape; margin: 14mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1a1a1a; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { padding: 20px 24px; font-size: 10pt; line-height: 1.4; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 14px; border-bottom: 2px solid #C8553D; margin-bottom: 18px; }
  .brand-name { font-size: 16pt; font-weight: 800; }
  .brand-sub { font-size: 9pt; color: #777; margin-top: 2px; }
  .meta { text-align: right; font-size: 9pt; color: #777; }
  .meta strong { color: #C8553D; font-size: 11pt; }
  h2 { font-size: 9pt; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #999; margin-bottom: 8px; margin-top: 14px; }
  table { width: 100%; border-collapse: collapse; font-size: 9pt; }
  thead { background: #FBF7F3; }
  th { text-align: left; padding: 8px 6px; border-bottom: 1.5px solid #E8E0D8; font-size: 8pt; font-weight: 700; letter-spacing: 0.5px; color: #555; text-transform: uppercase; }
  th.r, td.r { text-align: right; }
  td { padding: 7px 6px; border-bottom: 1px solid #F0E8E0; }
  td.mono, .mono { font-family: 'JetBrains Mono', 'Courier New', monospace; }
  .small { font-size: 8pt; color: #888; }
  tfoot td { padding-top: 12px; font-weight: 700; font-size: 11pt; border-bottom: none; }
  tfoot td.total { color: #C8553D; font-size: 13pt; }
  .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 18px; }
  .summary .box { background: #FBF7F3; border: 1px solid #E8E0D8; border-radius: 8px; padding: 10px 12px; }
  .summary .label { font-size: 8pt; font-weight: 700; text-transform: uppercase; color: #999; letter-spacing: 0.5px; }
  .summary .value { font-size: 14pt; font-weight: 700; margin-top: 4px; }
  .summary .sub { font-size: 9pt; color: #888; margin-top: 2px; }
  .note { margin-top: 18px; padding: 12px 14px; background: #FFF8F0; border-left: 3px solid #E07A5F; border-radius: 0 8px 8px 0; font-size: 9pt; color: #555; line-height: 1.5; }
  .note strong { color: #1a1a1a; }
  .actions { margin-top: 24px; display: flex; gap: 10px; justify-content: center; }
  .actions button { padding: 9px 18px; border-radius: 8px; border: 1px solid #C8553D; background: #C8553D; color: #fff; font-size: 10pt; font-weight: 700; cursor: pointer; }
  .actions button.ghost { background: #fff; color: #C8553D; }
  @media print { .actions { display: none; } }
</style>
</head>
<body>
  <div class="head">
    <div>
      <div class="brand-name">${esc(p.name || 'Property')}</div>
      <div class="brand-sub">${esc([p.address, p.city, p.state, p.pincode].filter(Boolean).join(', '))}</div>
      ${property.gstin ? `<div class="brand-sub"><strong>GSTIN:</strong> <span class="mono">${esc(property.gstin)}</span></div>` : '<div class="brand-sub" style="color:#999;">No GSTIN on file</div>'}
    </div>
    <div class="meta">
      <div><strong>Monthly invoice list</strong></div>
      <div>${esc(period)}</div>
      <div style="margin-top: 4px;">Generated ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
    </div>
  </div>

  <div class="summary">
    <div class="box">
      <div class="label">Invoices</div>
      <div class="value mono">${invoices.length}</div>
      <div class="sub">issued · non-voided</div>
    </div>
    <div class="box">
      <div class="label">Pre-tax total</div>
      <div class="value mono">${fmtINR(preTax)}</div>
      <div class="sub">net of GST</div>
    </div>
    <div class="box">
      <div class="label">GST (12% incl.)</div>
      <div class="value mono">${fmtINR(gstTotal)}</div>
      <div class="sub">CGST 6% + SGST 6%</div>
    </div>
    <div class="box">
      <div class="label">Grand total</div>
      <div class="value mono" style="color:#C8553D;">${fmtINR(total)}</div>
      <div class="sub">amount billed</div>
    </div>
  </div>

  <h2>Invoice register</h2>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Invoice no</th>
        <th>Date</th>
        <th>Recipient</th>
        <th>Recipient GSTIN</th>
        <th class="r">Taxable</th>
        <th class="r">GST</th>
        <th class="r">Total</th>
        <th>Booking</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
    <tfoot>
      <tr>
        <td colspan="5" class="r">Totals</td>
        <td class="r">${fmtINR(preTax)}</td>
        <td class="r">${fmtINR(gstTotal)}</td>
        <td class="r total">${fmtINR(total)}</td>
        <td></td>
      </tr>
    </tfoot>
  </table>

  <div class="note">
    <strong>For the accountant:</strong> These are all tax invoices issued in this period. Numbering is sequential and gap-free within the financial year. Voided invoices (if any) are excluded — their numbers remain reserved as required by GST law. Filing decisions and B2B/B2C classification are at your discretion.
  </div>

  <div class="actions">
    <button onclick="window.print()">Save as PDF / Print</button>
    <button class="ghost" onclick="window.close()">Close</button>
  </div>
  <script>setTimeout(function(){ window.print(); }, 400);<\/script>
</body>
</html>`;
}

export function exportInvoiceList(bookings, property) {
  const all = listIssuedInvoices(bookings);
  const period = new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  const html = buildHtml(all, property || {}, period);
  const w = window.open('', '_blank', 'width=1100,height=900');
  if (w) { w.document.write(html); w.document.close(); }
  return all;
}

// Same HTML as the printable register, returned as a string so it can
// be sent inline as the email body (instead of as an attachment) by
// the Resend send path. The CA gets a fully-formatted register that
// renders inside Gmail / Outlook with the same layout the print view
// uses; they can print-to-PDF from their inbox if they want a file.
export function buildInvoiceListHtml(invoices, property, period) {
  return buildHtml(invoices || [], property || {}, period || new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }));
}

// Send the invoice register straight to the CA's inbox via the
// Vercel serverless function (api/send-to-ca.js). Resolves to
// { ok: true } on success, or { ok: false, code, error } on failure
// — including `code: 'no_resend'` when the deployment hasn't been
// configured yet. The caller decides whether to fall back to the
// mailto flow.
//
// `session` is the Supabase session object from useSession / App.jsx;
// we only need its access_token.
export async function sendInvoiceListViaResend({ invoices, property, propertyId, session }) {
  if (!session || !session.access_token) {
    return { ok: false, code: 'no_session', error: 'Sign in required' };
  }
  if (!propertyId) {
    return { ok: false, code: 'no_property', error: 'Property not loaded' };
  }
  const acc = property?.accountant || {};
  const email = acc.email;
  if (!email) {
    return { ok: false, code: 'no_ca_email', error: "Add your CA's email in Property profile → Accountant first" };
  }
  const list = Array.isArray(invoices) ? invoices : [];
  const period = new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  const html = buildInvoiceListHtml(list, property, period);
  const subject = `Monthly invoice list · ${property?.profile?.name || 'Property'} · ${period}`;
  // Plain-text greeting prepended to the HTML so the CA sees a
  // personal note above the table. Renders in any email client.
  const greeting = acc.name
    ? (acc.firm ? `Hi ${acc.name} (${acc.firm}),` : `Hi ${acc.name},`)
    : (acc.firm ? `Hi (${acc.firm} team),` : 'Hi,');
  const total = list.reduce((s, i) => s + (i.amount || 0), 0);
  const intro = `<div style="font-family: Helvetica, Arial, sans-serif; padding: 20px 24px; font-size: 11pt; color: #1a1a1a; max-width: 900px; margin: 0 auto;">
    <p>${greeting}</p>
    <p>Attached is the list of invoices issued for <strong>${period}</strong> from <strong>${property?.profile?.name || 'our property'}</strong>.</p>
    <p>${list.length} invoice${list.length === 1 ? '' : 's'} · ₹${total.toLocaleString('en-IN')} total billed.</p>
    <p>Full breakdown below. Reply with any questions.</p>
    <p>Regards,<br/>${property?.profile?.name || ''}</p>
    <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
  </div>`;
  // Inline the table after the greeting. We keep the full
  // print-style page (including the header / summary boxes) so the
  // CA can save the whole email as PDF and get the same artifact.
  const body = intro + html;

  try {
    const resp = await fetch('/api/send-to-ca', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + session.access_token,
      },
      body: JSON.stringify({
        to: email,
        subject,
        html: body,
        replyTo: property?.profile?.email || undefined,
        propertyId,
      }),
    });
    if (resp.ok) {
      const data = await resp.json();
      return { ok: true, id: data?.id };
    }
    let detail = '';
    try { const j = await resp.json(); detail = j.error || j.detail || ''; } catch { detail = await resp.text(); }
    return { ok: false, code: resp.status === 503 ? 'no_resend' : ('http_' + resp.status), error: detail || 'Send failed' };
  } catch (e) {
    // Network error, no server reachable (e.g. local dev where the
    // /api function doesn't exist), CORS, etc. Treat as unavailable
    // so the caller falls back to mailto.
    return { ok: false, code: 'unreachable', error: String(e?.message || e) };
  }
}

export function emailToAccountant(invoices, property) {
  const acc = property?.accountant || {};
  const email = acc.email;
  if (!email) return false;
  const period = new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  const total = invoices.reduce((s, i) => s + (i.amount || 0), 0);
  const subject = `Monthly invoice list · ${property?.profile?.name || 'Property'} · ${period}`;
  // Greet by CA name + firm when both available. Falls back gracefully
  // when the hotelier only filled one (or neither).
  const greeting = acc.name
    ? (acc.firm ? `Hi ${acc.name} (${acc.firm}),` : `Hi ${acc.name},`)
    : (acc.firm ? `Hi (${acc.firm} team),` : 'Hi,');
  const body = [
    greeting,
    '',
    `Attached is the list of invoices issued for ${period} from ${property?.profile?.name || 'our property'}.`,
    `${invoices.length} invoice${invoices.length === 1 ? '' : 's'} · ₹${total.toLocaleString('en-IN')} total billed.`,
    '',
    'The printable list just opened in a new tab — please save it as a PDF and attach it to your reply.',
    '',
    'Regards,',
    property?.profile?.name || '',
  ].join('\n');
  window.location.href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  return true;
}

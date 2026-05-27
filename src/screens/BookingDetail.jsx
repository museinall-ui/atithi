import { useState, useEffect } from 'react';
import { T } from '../tokens.js';
import { CHANNELS, STATUS, ANCHOR, bookingGstApplies, getTaxBreakdown, effectiveRoomTypes, repeatGuestKeys, normPhone, mealCostFor, mealPlanById, extraGuestCostFor } from '../data.js';
import { bookingShareWaUrl, shareBookingWithVoucher } from '../utils/share.js';

// Format a startIdx-relative day as a real calendar date — e.g. "23 May"
// or "23 May 2026". Was previously hardcoded as `{4 + b.startIdx} May`
// which always rendered the month as "May" regardless of when the
// booking actually fell.
function fmtStayDay(startIdx, withYear) {
  const d = new Date(ANCHOR);
  d.setDate(d.getDate() + (startIdx || 0));
  const opts = withYear
    ? { day: 'numeric', month: 'short', year: 'numeric' }
    : { day: 'numeric', month: 'short' };
  return d.toLocaleDateString('en-IN', opts);
}
import { generateVoucher, voucherHtmlString } from '../utils/voucher.js';
import Toggle from '../components/Toggle.jsx';
import Icon from '../components/Icon.jsx';
import Btn from '../components/Btn.jsx';
import Chip from '../components/Chip.jsx';
import Card from '../components/Card.jsx';
import Avatar from '../components/Avatar.jsx';
import Row from '../components/Row.jsx';
import SectionHead from '../components/SectionHead.jsx';
import ScreenHeader from '../components/ScreenHeader.jsx';
import ExtendOptions from '../components/ExtendOptions.jsx';
import VoiceRecorder from '../components/VoiceRecorder.jsx';

const METHOD_LABELS = { cash: 'Cash', card: 'Card', upi: 'UPI', account: 'Bank a/c', other: 'Other' };
const METHOD_OPTIONS = [
  { id: 'cash',    label: 'Cash',     icon: 'inr',  hint: 'Counter / hand-collected' },
  { id: 'card',    label: 'Card',     icon: 'card', hint: 'POS / swipe / online' },
  { id: 'upi',     label: 'UPI',      icon: 'qr',   hint: 'GPay / PhonePe / Paytm' },
  { id: 'account', label: 'Bank a/c', icon: 'bank', hint: 'NEFT / IMPS / cheque' },
  { id: 'other',   label: 'Other',    icon: 'plus', hint: 'Voucher / barter / agent' },
];

function PaymentSheet({ kind, balance, total, onClose, onSave, property, onChangeProperty }) {
  const isRefund = kind === 'refund';
  const isCredit = kind === 'credit';
  const defaultAmt = isRefund || isCredit ? (balance < 0 ? Math.abs(balance) : '') : (balance > 0 ? balance : '');
  const [amount, setAmount] = useState(defaultAmt);
  const [method, setMethod] = useState(isCredit ? 'account' : 'cash');
  const [note, setNote] = useState('');
  const [ref, setRef] = useState('');

  // Hotelier-defined payment methods, stored on accountant jsonb so no
  // migration is needed. Each: { id, label, icon, hint }. Saved
  // methods render alongside the 5 defaults; the hotelier picks them
  // the same way and saves the booking like any other payment.
  const customMethods = (property?.accountant?.customPaymentMethods || []);
  const ALL_METHODS = [...METHOD_OPTIONS, ...customMethods];
  const [addingMethod, setAddingMethod] = useState(false);
  const [newMethodLabel, setNewMethodLabel] = useState('');
  const saveNewMethod = () => {
    const label = newMethodLabel.trim();
    if (!label) return;
    const id = 'pm_' + Date.now().toString(36);
    const next = [...customMethods, { id, label, icon: 'tag', hint: 'Custom · ref / txn id' }];
    if (onChangeProperty) {
      onChangeProperty(prev => ({
        ...prev,
        accountant: { ...(prev.accountant || {}), customPaymentMethods: next },
      }));
    }
    setMethod(id);
    setNewMethodLabel('');
    setAddingMethod(false);
  };
  const removeCustomMethod = (id) => {
    const next = customMethods.filter(m => m.id !== id);
    if (onChangeProperty) {
      onChangeProperty(prev => ({
        ...prev,
        accountant: { ...(prev.accountant || {}), customPaymentMethods: next },
      }));
    }
    if (method === id) setMethod('cash');
  };

  const title = isRefund ? 'Record refund' : isCredit ? 'Issue credit note' : 'Record payment';
  const cta = isRefund ? 'Save refund' : isCredit ? 'Issue credit' : 'Save payment';
  const tone = isRefund ? T.danger : isCredit ? T.indigo : T.primary;

  const placeholderForMethod = {
    cash: 'Where collected · who took it · receipt #',
    card: 'Last 4 / terminal / approval code',
    upi: 'UPI app · txn ID / UTR',
    account: 'Bank · UTR / cheque #',
    other: 'Source / agent / voucher #',
  };
  const placeholderFor = (m) => placeholderForMethod[m] || 'Reference / txn id (optional)';

  const save = () => {
    const amt = +amount;
    if (!amt || amt <= 0) return;
    const today = new Date();
    const dateStr = today.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) + ' · ' + today.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
    // dateIso is the machine-readable YYYY-MM-DD used by the Reports
    // P&L + payments-by-date filter. `date` stays human-readable for the
    // activity feed / folio display, but the iso field is what daily
    // income aggregation reads.
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const dateIso = `${yyyy}-${mm}-${dd}`;
    onSave({ id: 'p_' + Date.now(), kind, method, amount: amt, note: [note, ref].filter(Boolean).join(' · '), date: dateStr, dateIso });
  };

  return (
    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 40, display: 'flex', alignItems: 'flex-end' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', background: T.card, borderRadius: '16px 16px 0 0', padding: 18, paddingBottom: 32, maxHeight: '90%', overflow: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: `color-mix(in oklch, ${tone} 14%, white)`, color: tone, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={isRefund ? 'arrow' : isCredit ? 'tag' : 'plus'} size={16} stroke={2.2} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: T.ink }}>{title}</div>
            <div className="tnum" style={{ fontSize: 11, color: T.ink3, marginTop: 1 }}>
              Total ₹{total.toLocaleString('en-IN')} · Balance {balance < 0 ? `−₹${Math.abs(balance).toLocaleString('en-IN')}` : `₹${balance.toLocaleString('en-IN')}`}
            </div>
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: T.ink3, letterSpacing: 0.4, marginBottom: 6 }}>AMOUNT</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px', background: T.bgSoft, border: `1.5px solid ${tone}`, borderRadius: 10 }}>
            <span style={{ fontSize: 18, color: T.ink3, fontWeight: 700 }}>₹</span>
            <input onFocus={(e) => e.target.select()} type="number" min={0} step="1" autoFocus value={amount} onChange={e => {
              // Strip leading minus + drop decimals — amounts are integer
              // rupees; negative payments break the ledger math
              // (paid += amount would subtract).
              const v = e.target.value.replace(/^-+/, '');
              setAmount(v);
            }} placeholder="0" className="tnum" style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 24, fontWeight: 700, color: T.ink, minWidth: 0 }} />
            {balance > 0 && !isRefund && !isCredit && (
              <button onClick={() => setAmount(balance)} style={{ background: T.card, border: `1px solid ${T.border}`, color: T.primary, fontSize: 11, fontWeight: 700, borderRadius: 6, padding: '4px 8px', cursor: 'pointer' }}>Balance</button>
            )}
          </div>
          {!isRefund && !isCredit && +amount > balance && balance > 0 && (
            <div style={{ marginTop: 6, fontSize: 11, color: T.indigo, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
              <Icon name="info" size={11} /> ₹{(+amount - balance).toLocaleString('en-IN')} extra · will show as overpayment
            </div>
          )}
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: T.ink3, letterSpacing: 0.4, marginBottom: 6 }}>
            {isCredit ? 'CREDIT TYPE' : isRefund ? 'REFUND VIA' : 'COLLECTED VIA'}
          </div>
          {/* Method grid: defaults first, then any saved custom
              methods, then an 'Add' tile for creating a new one.
              5 across at default zoom; wraps automatically if the
              hotelier adds more. */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
            {ALL_METHODS.map(m => {
              const isCustom = customMethods.some(x => x.id === m.id);
              return (
                <button key={m.id} onClick={() => setMethod(m.id)} style={{
                  border: `1.5px solid ${method === m.id ? tone : T.borderSoft}`,
                  background: method === m.id ? `color-mix(in oklch, ${tone} 10%, white)` : T.card,
                  borderRadius: 9, padding: '8px 4px', cursor: 'pointer',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                  position: 'relative',
                }}>
                  <Icon name={m.icon} size={14} color={method === m.id ? tone : T.ink3} stroke={2} />
                  <span style={{ fontSize: 10, fontWeight: 700, color: method === m.id ? tone : T.ink2, textAlign: 'center', lineHeight: 1.2 }}>{m.label}</span>
                  {isCustom && (
                    <span
                      onClick={(e) => { e.stopPropagation(); removeCustomMethod(m.id); }}
                      title={`Remove "${m.label}"`}
                      style={{ position: 'absolute', top: 2, right: 4, fontSize: 12, color: T.ink3, opacity: 0.6, cursor: 'pointer', lineHeight: 1 }}
                    >×</span>
                  )}
                </button>
              );
            })}
            <button
              onClick={() => setAddingMethod(true)}
              style={{
                border: `1.5px dashed ${T.border}`,
                background: T.card,
                borderRadius: 9, padding: '8px 4px', cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                color: T.ink3,
              }}
            >
              <Icon name="plus" size={14} color={T.ink3} stroke={2} />
              <span style={{ fontSize: 10, fontWeight: 700, color: T.ink3 }}>Add</span>
            </button>
          </div>
          {addingMethod && (
            <div style={{ display: 'flex', gap: 4, marginTop: 8, alignItems: 'center' }}>
              <input
                autoFocus
                value={newMethodLabel}
                onChange={(e) => setNewMethodLabel(e.target.value.slice(0, 18))}
                onKeyDown={(e) => { if (e.key === 'Enter') saveNewMethod(); if (e.key === 'Escape') { setAddingMethod(false); setNewMethodLabel(''); } }}
                placeholder="Method name (e.g. Paytm wallet, Cheque, Razorpay link)"
                style={{ flex: 1, padding: '7px 10px', border: `1px solid ${tone}`, borderRadius: 7, fontSize: 12, color: T.ink, background: T.card, outline: 'none' }}
              />
              <button
                onClick={saveNewMethod}
                disabled={!newMethodLabel.trim()}
                style={{ padding: '7px 12px', borderRadius: 7, border: 'none', background: newMethodLabel.trim() ? tone : T.bgSoft, color: newMethodLabel.trim() ? '#fff' : T.ink3, fontSize: 11, fontWeight: 700, cursor: newMethodLabel.trim() ? 'pointer' : 'not-allowed' }}
              >Save</button>
              <button
                onClick={() => { setAddingMethod(false); setNewMethodLabel(''); }}
                style={{ padding: '7px 10px', borderRadius: 7, border: `1px solid ${T.border}`, background: T.card, color: T.ink3, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
              >Cancel</button>
            </div>
          )}
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: T.ink3, letterSpacing: 0.4, marginBottom: 6 }}>DETAILS</div>
          <input value={ref} onChange={e => setRef(e.target.value)} placeholder={placeholderFor(method)} style={{ width: '100%', boxSizing: 'border-box', border: `1px solid ${T.border}`, background: T.card, borderRadius: 8, padding: '10px 12px', fontSize: 13, color: T.ink, outline: 'none', marginBottom: 6 }} />
          <textarea value={note} onChange={e => setNote(e.target.value)} placeholder={isCredit ? 'Reason · which future booking this credit is for' : isRefund ? 'Reason for refund' : 'Notes (optional)'} rows={2} style={{ width: '100%', boxSizing: 'border-box', border: `1px solid ${T.border}`, background: T.card, borderRadius: 8, padding: '10px 12px', fontSize: 13, color: T.ink, outline: 'none', resize: 'none', fontFamily: 'inherit' }} />
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <Btn variant="ghost" full onClick={onClose}>Cancel</Btn>
          <Btn full onClick={save} style={{ background: tone, borderColor: tone }}>{cta}</Btn>
        </div>
      </div>
    </div>
  );
}

function fmtRelease(b) {
  if (b.releaseTs) {
    const d = new Date(b.releaseTs);
    return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
  }
  return b.releaseAt || '';
}

function fmtIssued(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Sheet for issuing one tax invoice against a booking. Single recipient and
// single amount — split-across-recipients was retired (added complexity
// most hoteliers didn't need; can be reintroduced later if needed).
//
// `amountIncludesTax` toggles the tax math:
//   * inclusive (default): the entered amount IS the invoice total, GST is
//     extracted from it (12 / 112). Matches the common case where the
//     hotelier already quoted a tax-inclusive figure to the guest.
//   * exclusive: the entered amount is pre-tax; CGST 6% + SGST 6% are added
//     on top to compute the invoice total.
function IssueInvoiceSheet({ booking, defaultAmount, kind, onClose, onIssue }) {
  const [name, setName] = useState(booking.guest || '');
  const [gstin, setGstin] = useState('');
  const [amount, setAmount] = useState(defaultAmount != null ? defaultAmount : (booking.total || 0));
  const [amountIncludesTax, setAmountIncludesTax] = useState(true);
  const kindLabel = kind === 'advance' ? 'Advance invoice'
    : kind === 'balance' ? 'Balance invoice'
    : kind === 'full' ? 'Full invoice'
    : 'Tax invoice';
  const kindHint = kind === 'advance' ? `Guest has paid an advance of ₹${(defaultAmount || 0).toLocaleString('en-IN')}. Issue an invoice for that amount now; balance invoice goes out at check-out.`
    : kind === 'balance' ? `An earlier advance invoice exists. This one covers the remaining ₹${(defaultAmount || 0).toLocaleString('en-IN')}.`
    : kind === 'full' ? `Issue one invoice for the full booking amount.`
    : null;

  const baseAmount = +amount || 0;
  const gst = amountIncludesTax
    ? Math.round(baseAmount * 12 / 112)
    : Math.round(baseAmount * 0.12);
  const preTax = amountIncludesTax ? baseAmount - gst : baseAmount;
  const invoiceTotal = amountIncludesTax ? baseAmount : baseAmount + gst;
  const half = Math.round(gst / 2);
  const cgst = half;
  const sgst = gst - half;

  const valid = name.trim().length > 0 && baseAmount > 0;

  const submit = () => {
    if (!valid) return;
    onIssue({
      amount: invoiceTotal,
      recipient: { name: name.trim(), gstin: gstin.trim(), address: '' },
    });
    onClose();
  };

  return (
    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 40, display: 'flex', alignItems: 'flex-end' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', background: T.card, borderRadius: '16px 16px 0 0', padding: 18, paddingBottom: 32, maxHeight: '90%', overflow: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: `color-mix(in oklch, ${T.teal} 14%, white)`, color: T.teal, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="download" size={16} stroke={2.2} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: T.ink, display: 'flex', alignItems: 'center', gap: 6 }}>
              {kindLabel}
              {kind && kind !== 'full' && (
                <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: 0.6, padding: '2px 6px', borderRadius: 4, background: kind === 'advance' ? T.warnLt : T.indigoLt, color: kind === 'advance' ? 'oklch(40% 0.14 75)' : T.indigo, textTransform: 'uppercase' }}>{kind}</span>
              )}
            </div>
            <div style={{ fontSize: 11, color: T.ink3, marginTop: 1 }}>Once issued, the invoice number is locked (GST requirement).</div>
          </div>
        </div>

        {kindHint && (
          <div style={{ padding: '8px 10px', background: kind === 'advance' ? T.warnLt : T.indigoLt, borderRadius: 8, marginBottom: 10, fontSize: 11, color: kind === 'advance' ? 'oklch(35% 0.14 75)' : T.indigo, fontWeight: 600, lineHeight: 1.4 }}>
            {kindHint}
          </div>
        )}

        <div style={{ background: T.bgSoft, borderRadius: 10, padding: 12, marginBottom: 12, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: T.ink2, letterSpacing: 0.2 }}>BOOKING TOTAL</span>
          <span className="tnum" style={{ fontSize: 18, fontWeight: 700, color: T.ink }}>₹{(booking.total || 0).toLocaleString('en-IN')}</span>
        </div>

        <div style={{ padding: 12, background: T.bgSoft, borderRadius: 10, border: `1px solid ${T.borderSoft}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Recipient name"
            style={{ width: '100%', boxSizing: 'border-box', border: `1px solid ${T.border}`, background: T.card, borderRadius: 7, padding: '8px 10px', fontSize: 13, fontWeight: 600, color: T.ink, outline: 'none' }}
          />
          <input
            value={gstin}
            onChange={e => setGstin(e.target.value.toUpperCase())}
            placeholder="GSTIN (optional · for B2B)"
            style={{ width: '100%', boxSizing: 'border-box', border: `1px solid ${T.border}`, background: T.card, borderRadius: 7, padding: '8px 10px', fontSize: 12, fontWeight: 600, color: T.ink, outline: 'none', fontFamily: T.mono || 'monospace' }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: T.card, border: `1px solid ${T.border}`, borderRadius: 7 }}>
            <span style={{ fontSize: 12, color: T.ink3, fontWeight: 700 }}>₹</span>
            <input onFocus={(e) => e.target.select()}
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className="tnum"
              style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 14, fontWeight: 700, color: T.ink, minWidth: 0 }}
            />
          </div>

          {/* Tax inclusive/exclusive picker as a 2-button segmented control.
              Most owners quote tax-inclusive prices, so "Inclusive" is the
              default. Was previously a subtle checkbox the hotelier missed. */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: T.ink3, letterSpacing: 0.4, marginBottom: 6 }}>HOW IS GST HANDLED?</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              <button
                type="button"
                onClick={() => setAmountIncludesTax(true)}
                className="atithi-tap"
                style={{
                  padding: '8px 10px', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
                  border: `1.5px solid ${amountIncludesTax ? T.teal : T.border}`,
                  background: amountIncludesTax ? `color-mix(in oklch, ${T.teal} 10%, white)` : T.card,
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700, color: amountIncludesTax ? T.teal : T.ink }}>
                  Tax inclusive
                </div>
                <div style={{ fontSize: 10, color: T.ink3, fontWeight: 500, marginTop: 2, lineHeight: 1.3 }}>
                  GST is inside the amount
                </div>
              </button>
              <button
                type="button"
                onClick={() => setAmountIncludesTax(false)}
                className="atithi-tap"
                style={{
                  padding: '8px 10px', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
                  border: `1.5px solid ${!amountIncludesTax ? T.teal : T.border}`,
                  background: !amountIncludesTax ? `color-mix(in oklch, ${T.teal} 10%, white)` : T.card,
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700, color: !amountIncludesTax ? T.teal : T.ink }}>
                  Tax exclusive
                </div>
                <div style={{ fontSize: 10, color: T.ink3, fontWeight: 500, marginTop: 2, lineHeight: 1.3 }}>
                  Add 12% GST on top
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Live breakdown. Shows the hotelier exactly what numbers go onto
            the invoice before they tap Issue, in either tax mode. */}
        {baseAmount > 0 && (
          <div style={{ marginTop: 12, padding: 12, background: T.card, border: `1px solid ${T.borderSoft}`, borderRadius: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: T.ink3, letterSpacing: 0.4, marginBottom: 8 }}>INVOICE BREAKDOWN</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }} className="tnum">
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: T.ink2 }}>
                <span>Pre-tax</span>
                <span style={{ fontWeight: 600 }}>₹{preTax.toLocaleString('en-IN')}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: T.ink2 }}>
                <span>CGST 6%</span>
                <span style={{ fontWeight: 600 }}>₹{cgst.toLocaleString('en-IN')}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: T.ink2 }}>
                <span>SGST 6%</span>
                <span style={{ fontWeight: 600 }}>₹{sgst.toLocaleString('en-IN')}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 700, color: T.ink, paddingTop: 6, borderTop: `1px solid ${T.borderSoft}` }}>
                <span>Invoice total</span>
                <span>₹{invoiceTotal.toLocaleString('en-IN')}</span>
              </div>
            </div>
          </div>
        )}

        <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
          <Btn variant="ghost" full onClick={onClose}>Cancel</Btn>
          <Btn full disabled={!valid} onClick={submit} style={{ background: T.teal, borderColor: T.teal }}>
            Issue invoice
          </Btn>
        </div>
      </div>
    </div>
  );
}

export default function BookingDetail({ go, bookingId, bookings, plan = 'engine', t, lang = 'en', property, onChangeProperty, onEdit, onPayment, onSetStatus, onExtendHold, onSetGst, onSetVip, onAddVoiceNote, onRemoveVoiceNote, onIssueInvoice, onVoidInvoice, can = () => true }) {
  // RBAC gates. New-staff role typically has create_bookings only —
  // they can take phone reservations but can't edit, cancel, or change
  // status on anyone's booking. Manage_payments + manage_invoices are
  // independent of edit_bookings: a receptionist can take a payment on
  // a stay they otherwise can't edit.
  const canEdit    = can('edit_bookings');
  const canCancel  = can('cancel_bookings');
  const canPay     = can('manage_payments');
  const canInvoice = can('manage_invoices');
  const b = bookings.find(x => x.id === bookingId) || bookings[0];
  const ROOM_TYPES = effectiveRoomTypes(property);
  const rt = ROOM_TYPES.find(r => r.id === b.roomTypeId);
  const ch = CHANNELS[b.channel];
  // Fallback synthetic payment row for legacy bookings with `paid > 0` but
  // no actual payments[] ledger. Real bookings created through the app
  // populate b.payments properly. The hardcoded "Razorpay UPI · auto-
  // captured · 03 May · 18:25" copy was a false claim; this is honestly
  // labelled as a pre-payment that landed when the booking was created.
  // Synthetic payment row for legacy bookings (paid > 0 but no proper
  // payments[] ledger). Uses the booking's check-in date as the
  // fallback date so the ledger row doesn't render with a blank
  // timestamp. Display-only — this isn't written to the cloud.
  const payments = b.payments || (b.paid > 0 ? [{
    id: 'p1', kind: 'payment',
    method: b.channel === 'direct' ? 'upi' : 'card',
    amount: b.paid,
    note: b.channel === 'direct' ? 'Initial payment · recorded' : `${ch.label} pre-payment`,
    date: b.startIdx != null ? new Date(new Date(ANCHOR).setDate(new Date(ANCHOR).getDate() + b.startIdx)).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '',
  }] : []);
  const totalPaid = payments.reduce((s, p) => s + (p.kind === 'refund' || p.kind === 'credit' ? -p.amount : p.amount), 0);
  const balance = b.total - totalPaid;
  const statusInfo = STATUS[b.status];
  // Invoicing is a paid add-on tier. Engine (core) and Channels do
  // bookings + vouchers but not tax invoices. The voucher PDF (download
  // icon in the header) stays core and works on every plan; only the
  // Invoice section + GST toggle + CGST/SGST folio rows are gated.
  const isInvoicingPlan = plan === 'invoicing';
  const withTax = isInvoicingPlan && bookingGstApplies(b);
  const tx = withTax ? getTaxBreakdown({ ...b, gstApplies: true }, property) : null;
  const repeats = repeatGuestKeys(bookings);
  const isRepeat = repeats.has(normPhone(b.phone));
  // Count this guest's previous non-cancelled stays before today's booking
  // so we can surface "3rd stay" context on the header.
  const prevStays = bookings.filter(x =>
    x.id !== b.id && x.status !== 'cancelled' && normPhone(x.phone) === normPhone(b.phone)
  ).length;
  const [payOpen, setPayOpen] = useState(false);
  const [payKind, setPayKind] = useState('payment');
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  // Voucher download — the hotelier may use the app in one language but
  // hand the voucher to a guest who reads the other (e.g. Hindi UI, EN
  // voucher for an OTA guest). On tap we open a small sheet so the
  // hotelier picks per download. null = closed; { invoice } = open with
  // an optional invoice to render in tax-invoice mode.
  const [voucherLangSheet, setVoucherLangSheet] = useState(null);
  const openVoucherSheet = (invoice = null) => setVoucherLangSheet({ invoice });
  // Share-booking flow snackbar. Set to true on the fallback path
  // (Web Share API unsupported / no files); auto-dismisses after 5s.
  const [shareHint, setShareHint] = useState(false);
  useEffect(() => {
    if (!shareHint) return;
    const tid = setTimeout(() => setShareHint(false), 5000);
    return () => clearTimeout(tid);
  }, [shareHint]);
  const downloadVoucherIn = (voucherLang) => {
    if (!voucherLangSheet) return;
    generateVoucher(b, rt, property, voucherLangSheet.invoice || undefined, voucherLang);
    setVoucherLangSheet(null);
  };
  const invoices = b.invoices || [];
  const activeInvoices = invoices.filter(inv => !inv.voided);
  const invoicedAmount = activeInvoices.reduce((s, inv) => s + (inv.amount || 0), 0);
  const remainingToInvoice = (b.total || 0) - invoicedAmount;

  // Smart "next invoice" default. Atithi splits an advance receipt and a
  // final balance into two invoices automatically:
  //   * No invoices yet + booking partially paid -> 'advance' for the paid bit.
  //   * No invoices yet + fully paid -> 'full' for the whole booking.
  //   * Some invoices issued + more paid since -> 'balance' for the new bit.
  // The hotelier can still override the amount manually before issuing.
  const paidNotInvoiced = Math.max(0, (b.paid || 0) - invoicedAmount);
  const invoiceKind = activeInvoices.length > 0
    ? 'balance'
    : (b.paid || 0) < (b.total || 0) && paidNotInvoiced > 0
      ? 'advance'
      : 'full';
  const invoiceDefaultAmount = invoiceKind === 'full'
    ? remainingToInvoice
    : Math.min(paidNotInvoiced || remainingToInvoice, remainingToInvoice);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: T.bg }}>
      <ScreenHeader title={b.id} subtitle={rt.name} onBack={() => go('diary')}
        right={
          <div style={{ display: 'inline-flex', gap: 6 }}>
            <button onClick={() => openVoucherSheet()} className="atithi-tap" title="Download voucher PDF" style={{
              height: 36, width: 36, borderRadius: 10, border: `1px solid ${T.border}`,
              background: T.card, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: T.ink2,
            }}>
              <Icon name="download" size={14} stroke={2} />
            </button>
            {canEdit && (
              <button onClick={() => onEdit(b.id)} className="atithi-tap" style={{
                height: 36, padding: '0 12px', borderRadius: 10, border: `1px solid ${T.border}`,
                background: T.card, display: 'inline-flex', alignItems: 'center', gap: 5,
                cursor: 'pointer', color: T.primary, fontSize: 12, fontWeight: 700,
              }}>
                <Icon name="edit" size={13} stroke={2} /> {t('edit')}
              </button>
            )}
          </div>
        }
      />
      <div style={{ flex: 1, overflow: 'auto', paddingBottom: 100 }}>
        <div style={{ padding: '14px 16px', background: statusInfo.bg, borderBottom: `1px solid ${T.borderSoft}`, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 8, height: 8, borderRadius: 4, background: statusInfo.color }} className={b.status === 'tentative' ? 'pulse' : ''} />
          <span style={{ fontSize: 13, fontWeight: 700, color: statusInfo.color }}>{statusInfo.label}{b.autoReleased ? ' · auto-released' : ''}</span>
          {b.status === 'tentative' && (b.releaseAt || b.releaseTs) && (
            <span className="tnum" style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: 'oklch(48% 0.14 75)' }}>releases {fmtRelease(b)}</span>
          )}
        </div>
        {b.status === 'tentative' && balance > 0 && (b.releaseAt || b.releaseTs) && (
          <div style={{ margin: '12px 16px 0', padding: '12px 14px', background: T.warnLt, border: `1px solid oklch(85% 0.10 75)`, borderLeft: `4px solid oklch(60% 0.14 75)`, borderRadius: 10, display: 'flex', gap: 10 }}>
            <Icon name="clock" size={18} color="oklch(48% 0.14 75)" stroke={2} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'oklch(40% 0.14 75)' }}>Auto-release if unpaid</div>
              <div style={{ fontSize: 12, color: T.ink2, marginTop: 2, lineHeight: 1.4 }}>
                ₹{balance.toLocaleString('en-IN')} due before <span className="tnum" style={{ fontWeight: 700, color: 'oklch(40% 0.14 75)' }}>{fmtRelease(b)}</span>, otherwise the booking will be released automatically and the inventory re-opened.
              </div>
              {onExtendHold && canEdit && (
                <ExtendOptions
                  onExtend={(hours) => onExtendHold(b.id, hours)}
                  colors={{ border: 'oklch(75% 0.10 75)', text: 'oklch(40% 0.14 75)' }}
                />
              )}
            </div>
          </div>
        )}

        <div style={{ padding: 16 }}>
          <Card padding={16}>
            <div style={{ display: 'flex', gap: 12 }}>
              <Avatar name={b.guest} size={52} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: T.ink }}>{b.guest}</span>
                  {/* VIP toggle — tap the chip to mark / unmark.
                      Filled when VIP, outlined when not. This is the
                      ONLY way a guest becomes VIP — no auto-derivation
                      (auto tags like 'Repeat' / 'Whale' are derived
                      separately in Guests). */}
                  <button
                    onClick={() => canEdit && onSetVip && onSetVip(b.id, !b.vip)}
                    disabled={!canEdit}
                    title={!canEdit ? "You don't have permission to edit bookings" : (b.vip ? 'Marked VIP — tap to unmark' : 'Tap to mark this booking VIP')}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      padding: '3px 9px', borderRadius: 999,
                      border: `1.5px solid ${b.vip ? T.warn : T.border}`,
                      background: b.vip ? T.warnLt : 'transparent',
                      color: b.vip ? 'oklch(40% 0.14 75)' : T.ink3,
                      fontSize: 10.5, fontWeight: 800, letterSpacing: 0.4,
                      cursor: 'pointer',
                    }}
                  >
                    <span style={{ fontSize: 12 }}>{b.vip ? '★' : '☆'}</span> VIP
                  </button>
                  {isRepeat && prevStays > 0 && (
                    <Chip color="ok" icon="sync" style={{ fontSize: 10 }}>{prevStays === 1 ? '2nd stay' : `${prevStays + 1}th stay`}</Chip>
                  )}
                </div>
                <div className="tnum" style={{ fontSize: 13, color: T.ink2, marginTop: 4 }}>{b.phone}</div>
                <div style={{ fontSize: 12, color: T.ink3, marginTop: 2 }}>
                  {b.guests}
                  {b.formC ? ' · Foreign · Form C pending' : b.country === 'IN' ? ' · Indian guest' : ''}
                </div>
              </div>
            </div>
            {(() => {
              // Contact action buttons — wired with native protocol links so
              // they actually open WhatsApp / dialer / email client. Phone
              // is stripped to digits for wa.me + tel: URIs.
              const digits = String(b.phone || '').replace(/\D/g, '');
              const waUrl = digits ? `https://wa.me/${digits}` : null;
              const telUrl = digits ? `tel:+${digits}` : null;
              const mailUrl = b.email ? `mailto:${b.email}?subject=${encodeURIComponent('Your booking at ' + (property?.profile?.name || ''))}&body=${encodeURIComponent('Hi ' + (b.guest || '') + ',\n\n')}` : null;
              const open = (url) => { if (url) window.open(url, '_blank', 'noopener'); };
              return (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 14 }}>
                  <Btn variant="wa" icon="wa" size="sm" disabled={!waUrl} onClick={() => open(waUrl)}>WhatsApp</Btn>
                  <Btn variant="soft" icon="phone" size="sm" disabled={!telUrl} onClick={() => open(telUrl)}>Call</Btn>
                  <Btn variant="soft" icon="mail" size="sm" disabled={!mailUrl} onClick={() => open(mailUrl)}>Email</Btn>
                </div>
              );
            })()}
          </Card>
        </div>

        <div style={{ padding: '0 16px 16px' }}>
          <SectionHead title={t('stay')} />
          <Card>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 12 }}>
              <div>
                <div style={{ fontSize: 10, color: T.ink3, fontWeight: 700, letterSpacing: 0.4 }}>{t('checkIn').toUpperCase()}</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: T.ink }}>{fmtStayDay(b.startIdx)}</div>
                <div style={{ fontSize: 11, color: T.ink3 }}>14:00</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 24, height: 1, background: T.border }} />
                <span className="tnum" style={{ fontSize: 11, fontWeight: 700, color: T.ink2 }}>{b.nights}N</span>
                <div style={{ width: 24, height: 1, background: T.border }} />
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 10, color: T.ink3, fontWeight: 700, letterSpacing: 0.4 }}>{t('checkOut').toUpperCase()}</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: T.ink }}>{fmtStayDay(b.startIdx + b.nights)}</div>
                <div style={{ fontSize: 11, color: T.ink3 }}>11:00</div>
              </div>
            </div>
            <div style={{ height: 1, background: T.borderSoft, margin: '14px 0' }} />
            {/* Multi-room bookings can mix types now. Show one line per
                room. Falls back to the single-room legacy display when
                roomItems is missing or has only one entry. */}
            {(() => {
              const items = b.roomItems && b.roomItems.length > 0 ? b.roomItems : [{ roomTypeId: b.roomTypeId }];
              if (items.length === 1) {
                const item = items[0];
                const itemRt = ROOM_TYPES.find(r => r.id === (item.roomTypeId || b.roomTypeId));
                return <Row label="Room" value={`${itemRt ? itemRt.name : '—'} · #${(item.unitIdx ?? b.unitIdx ?? 0) + 1}`} />;
              }
              return (
                <Row label="Rooms" value={
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-end' }}>
                    {items.map((item, i) => {
                      const itemRt = ROOM_TYPES.find(r => r.id === (item.roomTypeId || b.roomTypeId));
                      const unit = item.unitIdx != null ? `#${item.unitIdx + 1}` : (i === 0 && b.unitIdx != null ? `#${b.unitIdx + 1}` : '');
                      return <span key={i}>{itemRt ? itemRt.name : '—'}{unit ? ` · ${unit}` : ''}</span>;
                    })}
                  </div>
                } />
              );
            })()}
            <Row label="Channel" value={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><span style={{ width: 6, height: 6, borderRadius: 3, background: ch.color }} /> {ch.label}</span>} />
            {isInvoicingPlan && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0 4px', borderTop: `1px dashed ${T.borderSoft}`, marginTop: 8 }}>
                <Icon name="tag" size={14} color={withTax ? T.indigo : T.ink3} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: T.ink }}>Include in invoice register</div>
                  <div style={{ fontSize: 10.5, color: T.ink3, fontWeight: 600, lineHeight: 1.35, marginTop: 1 }}>
                    {withTax
                      ? `Yes — appears in the monthly CA export. ~₹${Math.round(b.total - b.total / 1.12).toLocaleString('en-IN')} treated as GST inside ₹${b.total.toLocaleString('en-IN')}.`
                      : `No — direct/cash booking, kept out of the CA export.`}
                  </div>
                </div>
                {onSetGst && canEdit && <Toggle on={withTax} onChange={(v) => onSetGst(b.id, v)} />}
              </div>
            )}
            {b.notes && (
              <>
                <div style={{ height: 1, background: T.borderSoft, margin: '10px 0' }} />
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <Icon name="info" size={14} color={T.primary} />
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: T.ink2, letterSpacing: 0.2, marginBottom: 2 }}>SPECIAL NOTE</div>
                    <div style={{ fontSize: 12, color: T.ink, lineHeight: 1.4 }}>{b.notes}</div>
                  </div>
                </div>
              </>
            )}
          </Card>
        </div>

        <div style={{ padding: '0 16px 16px' }}>
          <SectionHead title={t('folio')} action={
            <span className="tnum" style={{ fontSize: 11, fontWeight: 700, color: balance > 0 ? T.danger : balance < 0 ? T.indigo : T.ok }}>
              {balance > 0 ? `Balance ₹${balance.toLocaleString('en-IN')}` : balance < 0 ? `Overpaid ₹${Math.abs(balance).toLocaleString('en-IN')}` : 'Settled'}
            </span>
          } />
          <Card>
            {(() => {
              const mealCost = mealCostFor(b, property);
              const meal = mealPlanById(property, b.mealPlanId);
              const defaultId = property?.defaultMealPlanId || 'ep';
              const extraGuests = extraGuestCostFor(b, property);
              const preTax = withTax ? b.total - tx.gst : b.total;
              const tariff = preTax - mealCost - extraGuests;
              // Rate plan row — surfaced when the booking used something
              // other than the default Standard plan, so the hotelier can
              // see the cancellation terms at a glance.
              const ratePlans = Array.isArray(property?.ratePlans) ? property.ratePlans : [];
              const rp = ratePlans.find(p => p.id === b.ratePlanId);
              // Build the meal-plan folio row. Three cases:
              //   - selected IS the default → just label it "in rate"
              //   - delta > 0 → charge as positive add-on
              //   - delta < 0 → show as discount (negative)
              const mealRow = (() => {
                if (!meal) return null;
                if (meal.id === defaultId) {
                  return <Row label={`Meal plan · ${meal.code} (${meal.label})`} value="In room rate" />;
                }
                if (mealCost > 0) {
                  return <Row label={`Meal plan · ${meal.code} (${meal.label})`} value={`+ ₹${mealCost.toLocaleString('en-IN')}`} />;
                }
                if (mealCost < 0) {
                  return <Row label={`Meal plan · ${meal.code} (${meal.label})`} value={`− ₹${Math.abs(mealCost).toLocaleString('en-IN')}`} />;
                }
                return <Row label={`Meal plan · ${meal.code} (${meal.label})`} value="—" />;
              })();
              return (
                <>
                  <Row label={`Tariff · ${b.nights} night${b.nights > 1 ? 's' : ''}`} value={`₹${tariff.toLocaleString('en-IN')}`} />
                  {rp && rp.id !== 'standard' && (
                    <Row
                      label="Rate plan"
                      value={`${rp.label} · ${rp.cancellation === 'non-refundable' ? 'No refunds' : `free cancel ${rp.refundHours}h`}`}
                    />
                  )}
                  {extraGuests > 0 && (
                    <Row label="Extra-guest charges" value={`₹${extraGuests.toLocaleString('en-IN')}`} />
                  )}
                  {mealRow}
                </>
              );
            })()}
            {withTax && <Row label={`CGST ${(tx.rate / 2).toFixed(tx.rate % 2 ? 1 : 0)}%`} value={`₹${tx.cgst.toLocaleString('en-IN')}`} />}
            {withTax && <Row label={`SGST ${(tx.rate / 2).toFixed(tx.rate % 2 ? 1 : 0)}%`} value={`₹${tx.sgst.toLocaleString('en-IN')}`} />}
            <div style={{ height: 1, background: T.borderSoft, margin: '8px 0' }} />
            <Row label="Total" value={`₹${b.total.toLocaleString('en-IN')}`} bold />
            <div style={{ height: 1, background: T.borderSoft, margin: '8px 0' }} />

            <div style={{ fontSize: 10, fontWeight: 700, color: T.ink3, letterSpacing: 0.4, marginBottom: 6 }}>PAYMENTS LEDGER</div>
            {payments.length === 0 && <div style={{ fontSize: 12, color: T.ink3, padding: '6px 0' }}>No payments yet.</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {payments.map(p => {
                const isOut = p.kind === 'refund' || p.kind === 'credit';
                const tone = p.kind === 'refund' ? T.danger : p.kind === 'credit' ? T.indigo : T.ok;
                // Resolve method label: defaults from METHOD_LABELS, then
                // custom methods from property.accountant.customPaymentMethods,
                // then fall back to the raw id (e.g. 'pm_xyz') if neither
                // matches (custom method was deleted after the payment).
                const customMethod = (property?.accountant?.customPaymentMethods || []).find(m => m.id === p.method);
                const methodLabel = METHOD_LABELS[p.method] || (customMethod && customMethod.label) || p.method;
                return (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 8px', background: T.bgSoft, borderRadius: 7, borderLeft: `3px solid ${tone}` }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: tone, textTransform: 'uppercase', letterSpacing: 0.2 }}>
                          {p.kind === 'refund' ? 'Refund' : p.kind === 'credit' ? 'Credit note' : methodLabel}
                        </span>
                        {p.kind !== 'payment' && <span style={{ fontSize: 10, color: T.ink3 }}>· {methodLabel}</span>}
                      </div>
                      {p.note && <div style={{ fontSize: 11, color: T.ink2, marginTop: 2, lineHeight: 1.35 }}>{p.note}</div>}
                      <div className="tnum" style={{ fontSize: 10, color: T.ink3, marginTop: 2 }}>{p.date}</div>
                    </div>
                    <span className="tnum" style={{ fontSize: 13, fontWeight: 700, color: tone }}>
                      {isOut ? '−' : '+'}₹{p.amount.toLocaleString('en-IN')}
                    </span>
                  </div>
                );
              })}
            </div>

            <div style={{ height: 1, background: T.borderSoft, margin: '10px 0 8px' }} />
            <Row label="Total paid" value={`₹${totalPaid.toLocaleString('en-IN')}`} />
            <Row label={balance < 0 ? 'Overpayment / due to guest' : 'Balance due'} value={
              <span style={{ color: balance > 0 ? T.danger : balance < 0 ? T.indigo : T.ok, fontWeight: 700 }} className="tnum">
                {balance < 0 ? `−₹${Math.abs(balance).toLocaleString('en-IN')}` : `₹${balance.toLocaleString('en-IN')}`}
              </span>
            } bold />

            {/* Primary action: Add payment / Refund payment whenever there's
                a balance to settle (or an overpayment to refund). The
                three-column grid earlier crammed Payment/Refund/Credit-note
                side-by-side on every booking; most of the time the hotelier
                just wants to record a payment, so make THAT the big button. */}
            {balance !== 0 && canPay && (
              <div style={{ marginTop: 12 }}>
                {balance > 0 ? (
                  <Btn variant="primary" icon="plus" full onClick={() => { setPayKind('payment'); setPayOpen(true); }}>Add payment · ₹{balance.toLocaleString('en-IN')}</Btn>
                ) : (
                  <Btn variant="ghost" icon="arrow" full onClick={() => { setPayKind('refund'); setPayOpen(true); }}>Refund overpayment · ₹{Math.abs(balance).toLocaleString('en-IN')}</Btn>
                )}
              </div>
            )}
            {/* Secondary actions — compact icon row. Send-via-WhatsApp lives
                here too rather than as full-width buttons; it kept stealing
                attention from the primary payment action. */}
            <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {balance === 0 && canPay && (
                <Btn variant="ghost" icon="plus" size="sm" onClick={() => { setPayKind('payment'); setPayOpen(true); }}>Payment</Btn>
              )}
              {canPay && <Btn variant="ghost" icon="arrow" size="sm" onClick={() => { setPayKind('refund'); setPayOpen(true); }}>Refund</Btn>}
              {canPay && <Btn variant="ghost" icon="tag" size="sm" onClick={() => { setPayKind('credit'); setPayOpen(true); }}>Credit</Btn>}
              <Btn
                variant="wa"
                icon="wa"
                size="sm"
                disabled={!b.phone}
                onClick={async () => {
                  const lang = t('home') === 'होम' ? 'hi' : 'en';
                  const rt = ROOM_TYPES.find(r => r.id === b.roomTypeId);
                  // Try the Web Share API first (mobile Chrome / Safari)
                  // — that path attaches the voucher HTML as a file in
                  // one tap. If unsupported or it fails, fall back to
                  // opening the voucher in a new window + wa.me with
                  // a small toast telling the hotelier to attach the
                  // saved voucher manually.
                  const html = voucherHtmlString(b, rt, property, undefined, lang);
                  const shared = await shareBookingWithVoucher(b, property, lang, html);
                  if (shared) return;
                  // Fallback path. Open the voucher (which auto-prompts
                  // print/save-as-PDF), then open WhatsApp with the
                  // pre-filled message.
                  generateVoucher(b, rt, property, undefined, lang);
                  const url = bookingShareWaUrl(b, property, lang);
                  setTimeout(() => {
                    if (url) window.open(url, '_blank', 'noopener');
                    setShareHint(true);
                  }, 600);
                }}
              >Share booking</Btn>
              {balance > 0 && (
                <Btn
                  variant="ghost"
                  icon="wa"
                  size="sm"
                  disabled={!b.phone}
                  onClick={() => {
                    const digits = String(b.phone || '').replace(/\D/g, '');
                    if (!digits) return;
                    const msg = `Hi ${b.guest || ''},\n\nBalance of ₹${balance.toLocaleString('en-IN')} is due for your booking ${b.id} at ${property?.profile?.name || 'our property'}.\n\nPlease confirm payment so we can finalise your reservation.`;
                    window.open(`https://wa.me/${digits}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
                  }}
                >
                  Remind ₹{balance.toLocaleString('en-IN')}
                </Btn>
              )}
            </div>
            {balance < 0 && (
              <div style={{ marginTop: 8, padding: '8px 10px', background: T.indigoLt, borderRadius: 7, fontSize: 11, color: T.indigo, fontWeight: 600, lineHeight: 1.4 }}>
                <Icon name="info" size={11} /> Guest has ₹{Math.abs(balance).toLocaleString('en-IN')} excess. Issue refund or convert to credit note for future bookings.
              </div>
            )}
          </Card>
        </div>

        {shareHint && (
          <div style={{
            position: 'absolute', bottom: 90, left: 12, right: 12, zIndex: 60,
            display: 'flex', justifyContent: 'center',
            pointerEvents: 'none',
          }}>
            <div style={{
              maxWidth: 360,
              padding: '10px 14px', borderRadius: 10,
              background: T.ink, color: '#fff',
              fontSize: 12, fontWeight: 600, lineHeight: 1.4,
              boxShadow: '0 6px 24px rgba(0,0,0,0.28)',
              display: 'flex', alignItems: 'flex-start', gap: 8,
            }}>
              <Icon name="info" size={14} color="#fff" stroke={2.2} />
              <span>Voucher opened — <strong>save as PDF</strong> from the print dialog, then <strong>attach it</strong> in WhatsApp before sending.</span>
            </div>
          </div>
        )}

        {payOpen && (
          <PaymentSheet
            kind={payKind}
            balance={balance}
            total={b.total}
            property={property}
            onChangeProperty={onChangeProperty}
            onClose={() => setPayOpen(false)}
            onSave={(entry) => { onPayment && onPayment(b.id, entry); setPayOpen(false); }}
          />
        )}

        {voucherLangSheet && (
          <div
            style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 50, display: 'flex', alignItems: 'flex-end' }}
            onClick={() => setVoucherLangSheet(null)}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{ width: '100%', background: T.card, borderRadius: '16px 16px 0 0', padding: 18, paddingBottom: 32 }}
            >
              <div style={{ fontSize: 15, fontWeight: 700, color: T.ink, marginBottom: 4 }}>
                {voucherLangSheet.invoice ? 'Download invoice in…' : 'Download voucher in…'}
              </div>
              <div style={{ fontSize: 11, color: T.ink3, marginBottom: 14, lineHeight: 1.4 }}>
                Pick the language for this PDF. Your app language stays unchanged.
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button
                  onClick={() => downloadVoucherIn('en')}
                  className="atithi-tap"
                  style={{
                    width: '100%', padding: '14px', borderRadius: 10, cursor: 'pointer',
                    border: `1.5px solid ${T.primary}`, background: T.card, color: T.ink,
                    fontSize: 13, fontWeight: 700, textAlign: 'left',
                    display: 'flex', alignItems: 'center', gap: 10,
                  }}
                >
                  <span style={{ fontSize: 18, color: T.primary, fontWeight: 800, width: 32, textAlign: 'center' }}>EN</span>
                  <span style={{ flex: 1 }}>English</span>
                  <Icon name="download" size={14} color={T.primary} stroke={2.2} />
                </button>
                <button
                  onClick={() => downloadVoucherIn('hi')}
                  className="atithi-tap"
                  style={{
                    width: '100%', padding: '14px', borderRadius: 10, cursor: 'pointer',
                    border: `1.5px solid ${T.primary}`, background: T.card, color: T.ink,
                    fontSize: 13, fontWeight: 700, textAlign: 'left',
                    display: 'flex', alignItems: 'center', gap: 10,
                  }}
                >
                  <span style={{ fontSize: 16, color: T.primary, fontWeight: 800, width: 32, textAlign: 'center' }}>हि</span>
                  <span style={{ flex: 1 }}>हिन्दी</span>
                  <Icon name="download" size={14} color={T.primary} stroke={2.2} />
                </button>
                <button
                  onClick={() => setVoucherLangSheet(null)}
                  className="atithi-tap"
                  style={{
                    width: '100%', padding: '10px', borderRadius: 10, cursor: 'pointer',
                    border: 'none', background: 'transparent', color: T.ink3,
                    fontSize: 12, fontWeight: 700,
                  }}
                >{t('cancel')}</button>
              </div>
            </div>
          </div>
        )}

        {isInvoicingPlan && (
        <div style={{ padding: '0 16px 16px' }}>
          <SectionHead title="Invoices" action={
            activeInvoices.length > 0 && remainingToInvoice <= 0
              ? <Chip color="ok" icon="check" style={{ fontSize: 9 }}>Fully invoiced</Chip>
              : null
          } />
          <Card padding={0}>
            {invoices.length === 0 ? (
              <div style={{ padding: '16px 14px', fontSize: 12, color: T.ink3, lineHeight: 1.45 }}>
                No tax invoice issued yet. Issue one for the full booking total when the guest checks out.
              </div>
            ) : (
              invoices.map((inv, i, arr) => (
                <div key={inv.id} style={{ padding: '12px 14px', borderBottom: i < arr.length - 1 ? `1px solid ${T.borderSoft}` : 'none', opacity: inv.voided ? 0.55 : 1 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: `color-mix(in oklch, ${T.teal} 12%, white)`, color: T.teal, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Icon name="tag" size={14} stroke={2} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
                        <span className="tnum" style={{ fontSize: 13, fontWeight: 700, color: T.ink, textDecoration: inv.voided ? 'line-through' : 'none' }}>{inv.number}</span>
                        {inv.voided && <Chip color="danger" style={{ fontSize: 9 }}>VOIDED</Chip>}
                      </div>
                      <div style={{ fontSize: 11, color: T.ink3, marginTop: 2 }}>
                        {fmtIssued(inv.date)} · {inv.recipient?.name || '—'}{inv.recipient?.gstin ? ` · ${inv.recipient.gstin}` : ''}
                      </div>
                    </div>
                    <span className="tnum" style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>₹{(inv.amount || 0).toLocaleString('en-IN')}</span>
                  </div>
                  {!inv.voided && (
                    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                      <button
                        onClick={() => openVoucherSheet(inv)}
                        className="atithi-tap"
                        style={{ padding: '5px 10px', borderRadius: 7, border: `1px solid ${T.border}`, background: T.card, color: T.ink2, fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                      >
                        <Icon name="download" size={11} stroke={2} /> View invoice PDF
                      </button>
                      <button
                        onClick={() => { if (confirm(`Void invoice ${inv.number}? The number stays reserved (cannot be reused) per GST rules.`)) onVoidInvoice && onVoidInvoice(b.id, inv.id); }}
                        className="atithi-tap"
                        style={{ padding: '5px 10px', borderRadius: 7, border: `1px solid ${T.border}`, background: T.card, color: T.danger, fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                      >
                        <Icon name="x" size={11} stroke={2} /> Void
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
            {b.status === 'tentative' ? (
              <div style={{ padding: '10px 14px', background: T.bgSoft, fontSize: 11, color: T.ink3, fontWeight: 600, lineHeight: 1.4 }}>
                Confirm this tentative booking before issuing an invoice.
              </div>
            ) : remainingToInvoice > 0 && canInvoice ? (
              <div style={{ padding: 12, background: T.bgSoft, display: 'flex', alignItems: 'center', gap: 10 }}>
                <button
                  onClick={() => setInvoiceOpen(true)}
                  className="atithi-tap"
                  style={{ flex: 1, padding: '10px 12px', borderRadius: 8, border: 'none', background: T.teal, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                >
                  <Icon name="plus" size={12} stroke={2.2} />
                  {invoices.length === 0 ? `Issue invoice (₹${remainingToInvoice.toLocaleString('en-IN')})` : `Issue another invoice (₹${remainingToInvoice.toLocaleString('en-IN')} left)`}
                </button>
              </div>
            ) : null}
          </Card>
          {invoiceOpen && (
            <IssueInvoiceSheet
              booking={{ ...b, total: remainingToInvoice }}
              defaultAmount={invoiceDefaultAmount}
              kind={invoiceKind}
              onClose={() => setInvoiceOpen(false)}
              onIssue={(parts) => onIssueInvoice && onIssueInvoice(b.id, parts)}
            />
          )}
        </div>
        )}

        {/* Voice notes — quick spoken memos attached to the booking.
            Hotelier records up to 3 × 60s clips; the activity feed
            below logs each add / delete so the audit trail stays
            complete. Capped sizes keep localStorage + the row's
            voice_notes jsonb bounded. */}
        {/* Voice notes are an "edit" to the booking record, so we gate
            them by edit_bookings. View-only members still see the
            existing notes from the activity feed below if needed. */}
        {canEdit && (
          <div style={{ padding: '0 16px 16px' }}>
            <SectionHead title="Voice notes" />
            <Card padding={12}>
              <VoiceRecorder
                notes={b.voiceNotes || []}
                onAdd={(note) => onAddVoiceNote && onAddVoiceNote(b.id, note)}
                onRemove={(id) => onRemoveVoiceNote && onRemoveVoiceNote(b.id, id)}
              />
            </Card>
          </div>
        )}

        <div style={{ padding: '0 16px 16px' }}>
          <SectionHead title={t('activity')} />
          <Card padding={0}>
            {(() => {
              // Build the activity feed from real booking data only —
              // payments ledger, issued invoices, and status transitions
              // we can infer. The earlier "Razorpay · ₹0 captured /
              // WhatsApp read ✓✓ / 03 May 18:24" entries were hardcoded
              // mocks that fired for every booking, including newly-
              // created ones where none of it had happened.
              const items = [];
              items.push({ icon: 'tag', tone: T.primary, text: `Booking via ${ch.label}` });
              payments.forEach(p => {
                const tone = p.kind === 'refund' ? T.danger : p.kind === 'credit' ? T.indigo : T.ok;
                // Same custom-method resolution as the payments-ledger
                // row above — defaults → custom-methods → raw id fallback.
                const customMethod = (property?.accountant?.customPaymentMethods || []).find(m => m.id === p.method);
                const methodLabel = METHOD_LABELS[p.method] || (customMethod && customMethod.label) || p.method;
                const label = p.kind === 'refund' ? `Refund · ₹${p.amount.toLocaleString('en-IN')}`
                  : p.kind === 'credit' ? `Credit note · ₹${p.amount.toLocaleString('en-IN')}`
                  : `Payment received · ₹${p.amount.toLocaleString('en-IN')}${p.method ? ` · ${methodLabel}` : ''}`;
                items.push({ icon: p.kind === 'refund' ? 'arrow' : 'inr', tone, text: label, time: p.date });
              });
              (b.invoices || []).filter(inv => !inv.voided).forEach(inv => {
                items.push({ icon: 'download', tone: T.teal, text: `Invoice ${inv.number} issued · ₹${(inv.amount || 0).toLocaleString('en-IN')}`, time: fmtIssued(inv.date) });
              });
              if (b.status === 'tentative' && (b.releaseAt || b.releaseTs)) {
                items.push({ icon: 'clock', tone: 'oklch(48% 0.14 75)', text: `On hold · auto-releases ${fmtRelease(b)}` });
              }
              if (b.vip) items.push({ icon: 'star', tone: T.primary, text: 'Marked VIP' });
              if (b.formC) items.push({ icon: 'flag', tone: 'oklch(48% 0.14 75)', text: 'Foreign guest · Form C filing required' });
              // Replay the structured event log (hold extensions, status
              // transitions, moves). The boolean status branches below
              // still cover the final-state case so freshly-imported
              // bookings without an events[] still render correctly.
              (b.events || []).forEach(ev => {
                const iconMap = { hold: 'clock', status: 'sync', move: 'arrow', edit: 'edit', vip: 'star', voice: 'bell' };
                const toneMap = { hold: 'oklch(48% 0.14 75)', status: T.indigo, move: T.teal, edit: 'oklch(50% 0.10 280)', vip: T.warn, voice: T.primary };
                items.push({
                  icon: iconMap[ev.kind] || 'info',
                  tone: toneMap[ev.kind] || T.ink3,
                  text: ev.text,
                  time: ev.time ? new Date(ev.time).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : undefined,
                });
              });
              if (!b.events && b.status === 'checkedin') items.push({ icon: 'door', tone: T.indigo, text: 'Checked in' });
              if (!b.events && b.status === 'checkout') items.push({ icon: 'check', tone: T.ok, text: 'Checked out · stay complete' });
              if (b.status === 'cancelled' && !(b.events || []).some(e => /cancelled/i.test(e.text))) items.push({ icon: 'x', tone: T.danger, text: b.autoReleased ? 'Auto-released (hold expired)' : 'Booking cancelled' });
              return items.length === 0
                ? (
                  <div style={{ padding: '14px', fontSize: 12, color: T.ink3, lineHeight: 1.45 }}>
                    No activity yet.
                  </div>
                )
                : items.map((a, i, arr) => (
                  <div key={i} style={{ padding: '12px 14px', display: 'flex', gap: 10, borderBottom: i < arr.length - 1 ? `1px solid ${T.borderSoft}` : 'none' }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: `color-mix(in oklch, ${a.tone} 14%, white)`, color: a.tone, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Icon name={a.icon} size={14} stroke={2} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: T.ink, fontWeight: 500 }}>{a.text}</div>
                      {a.time && <div className="tnum" style={{ fontSize: 11, color: T.ink3, marginTop: 1 }}>{a.time}</div>}
                    </div>
                  </div>
                ));
            })()}
          </Card>
        </div>
      </div>

      <div style={{ background: T.card, borderTop: `1px solid ${T.borderSoft}`, padding: '10px 16px 24px' }}>
        {(b.status === 'confirmed' || b.status === 'checkedin') && (
          <div style={{ fontSize: 10, color: T.ink3, fontWeight: 600, marginBottom: 6, textAlign: 'center', letterSpacing: 0.2 }}>
            Optional · inventory + invoicing work without these
          </div>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          {b.status === 'confirmed' && canEdit && (
            <Btn variant="soft" icon="door" style={{ flex: 1 }} onClick={() => onSetStatus && onSetStatus(b.id, 'checkedin')}>Log check-in</Btn>
          )}
          {b.status === 'checkedin' && canEdit && (
            <Btn variant="soft" icon="check" style={{ flex: 1 }} onClick={() => onSetStatus && onSetStatus(b.id, 'checkout')}>Log check-out</Btn>
          )}
          {b.status === 'tentative' && (
            <>
              {canCancel && <Btn variant="ghost" icon="x" style={{ flex: 1 }} onClick={() => { if (window.confirm('Cancel this booking? You can undo for 10 seconds after.')) onSetStatus && onSetStatus(b.id, 'cancelled'); }}>Cancel</Btn>}
              {canEdit && <Btn icon="check" style={{ flex: 1 }} onClick={() => onSetStatus && onSetStatus(b.id, 'confirmed')}>Confirm</Btn>}
            </>
          )}
          {b.status === 'cancelled' && canCancel && (
            <Btn variant="ghost" icon="sync" full onClick={() => onSetStatus && onSetStatus(b.id, 'confirmed')}>Re-open booking</Btn>
          )}
          {b.status === 'checkout' && (
            <Btn variant="soft" icon="check" style={{ flex: 1 }} disabled>Stay complete</Btn>
          )}
          {/* Cancel a confirmed / checked-in / checked-out booking.
              Real day-one need (no-show, walk-in cancel, duplicate entry,
              fraud booking) — used to be impossible from the UI because
              the Cancel button only rendered for status === 'tentative'.
              Confirm dialog protects against misclick + ledger
              cancellation has an undo snackbar. */}
          {(b.status === 'confirmed' || b.status === 'checkedin' || b.status === 'checkout') && canCancel && (
            <Btn
              variant="ghost"
              icon="x"
              style={{ flex: 1 }}
              onClick={() => {
                if (window.confirm(`Cancel booking ${b.id}? This marks ${b.guest} as cancelled. You can undo for 10 seconds after, or Re-open the booking later.`)) {
                  onSetStatus && onSetStatus(b.id, 'cancelled');
                }
              }}
            >Cancel booking</Btn>
          )}
        </div>
      </div>
    </div>
  );
}

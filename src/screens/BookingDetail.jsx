import { useState, useEffect } from 'react';
import { T } from '../tokens.js';
import { CHANNELS, STATUS, statusLabel, ANCHOR, bookingGstApplies, getTaxBreakdown, blendedGstRate, effectiveRoomTypes, repeatGuestKeys, normPhone, mealCostFor, mealPlanById, extraGuestCostFor, extrasCostFor } from '../data.js';
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
import { useSheetDismiss } from '../components/useSheetDismiss.js';

// Method labels resolved via t() at render. The ids are stable; only the
// displayed text is localised. methodLabelFor / methodOptionsFor are the
// translated accessors used everywhere a payment method is shown.
const METHOD_LABEL_KEYS = { cash: 'payCash', card: 'payCard', upi: 'payUpi', account: 'pmBankAc', other: 'pmOther' };
const methodLabelFor = (t, id) => (METHOD_LABEL_KEYS[id] ? t(METHOD_LABEL_KEYS[id]) : null);
const methodOptionsFor = (t) => [
  { id: 'cash',    label: t('payCash'),  icon: 'inr',  hint: t('pmCashHint') },
  { id: 'card',    label: t('payCard'),  icon: 'card', hint: t('pmCardHint') },
  { id: 'upi',     label: t('payUpi'),   icon: 'qr',   hint: t('pmUpiHint') },
  { id: 'account', label: t('pmBankAc'), icon: 'bank', hint: t('pmBankHint') },
  { id: 'other',   label: t('pmOther'),  icon: 'plus', hint: t('pmOtherHint') },
];

function PaymentSheet({ kind, balance, total, onClose, onSave, property, onChangeProperty, canManageSettings, t }) {
  useSheetDismiss(true, onClose); // Q3: Android Back / Esc closes it; locks bg scroll
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
  const ALL_METHODS = [...methodOptionsFor(t), ...customMethods];
  const [addingMethod, setAddingMethod] = useState(false);
  const [newMethodLabel, setNewMethodLabel] = useState('');
  const saveNewMethod = () => {
    const label = newMethodLabel.trim();
    if (!label) return;
    const id = 'pm_' + Date.now().toString(36);
    const next = [...customMethods, { id, label, icon: 'tag', hint: t('pmCustomHint') }];
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
    // R11-5: the × sits in the corner of a selectable payment tile, so a mis-tap
    // while picking the method could delete it. Confirm so it's never destructive.
    const target = customMethods.find(x => x.id === id);
    if (!window.confirm(t('removeMethodConfirm').replace('{label}', (target && target.label) || 'custom'))) return;
    const next = customMethods.filter(m => m.id !== id);
    if (onChangeProperty) {
      onChangeProperty(prev => ({
        ...prev,
        accountant: { ...(prev.accountant || {}), customPaymentMethods: next },
      }));
    }
    if (method === id) setMethod('cash');
  };

  const title = isRefund ? t('recordRefund') : isCredit ? t('issueCreditNote') : t('recordPayment');
  const cta = isRefund ? t('saveRefund') : isCredit ? t('issueCredit') : t('savePayment');
  const tone = isRefund ? T.danger : isCredit ? T.indigo : T.primary;

  const placeholderForMethod = {
    cash: t('phCash'),
    card: t('phCard'),
    upi: t('phUpi'),
    account: t('phAccount'),
    other: t('phOther'),
  };
  const placeholderFor = (m) => placeholderForMethod[m] || t('phRefDefault');

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
              {t('totalBalanceLine').replace('{total}', total.toLocaleString('en-IN')).replace('{bal}', balance < 0 ? `−₹${Math.abs(balance).toLocaleString('en-IN')}` : `₹${balance.toLocaleString('en-IN')}`)}
            </div>
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: T.ink3, letterSpacing: 0.4, marginBottom: 6 }}>{t('amountCap')}</div>
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
              <button onClick={() => setAmount(balance)} style={{ background: T.card, border: `1px solid ${T.border}`, color: T.primary, fontSize: 11, fontWeight: 700, borderRadius: 6, padding: '4px 8px', cursor: 'pointer' }}>{t('balanceWord')}</button>
            )}
          </div>
          {!isRefund && !isCredit && +amount > balance && balance > 0 && (
            <div style={{ marginTop: 6, fontSize: 11, color: T.indigo, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
              <Icon name="info" size={11} /> {t('overpaymentExtra').replace('{amt}', (+amount - balance).toLocaleString('en-IN'))}
            </div>
          )}
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: T.ink3, letterSpacing: 0.4, marginBottom: 6 }}>
            {isCredit ? t('creditType') : isRefund ? t('refundVia') : t('collectedVia')}
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
                  {isCustom && canManageSettings && (
                    <span
                      onClick={(e) => { e.stopPropagation(); removeCustomMethod(m.id); }}
                      title={`Remove "${m.label}"`}
                      style={{ position: 'absolute', top: 2, right: 4, fontSize: 12, color: T.ink3, opacity: 0.6, cursor: 'pointer', lineHeight: 1 }}
                    >×</span>
                  )}
                </button>
              );
            })}
            {/* R10-5 (F-2): adding a custom method writes property.accountant
                (a properties UPDATE), which the DB now gates on manage_settings.
                Hide the affordance for members without it (e.g. reception) so
                they don't add a method that silently fails to persist. */}
            {canManageSettings && (
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
              <span style={{ fontSize: 10, fontWeight: 700, color: T.ink3 }}>{t('add')}</span>
            </button>
            )}
          </div>
          {addingMethod && (
            <div style={{ display: 'flex', gap: 4, marginTop: 8, alignItems: 'center' }}>
              <input
                autoFocus
                value={newMethodLabel}
                onChange={(e) => setNewMethodLabel(e.target.value.slice(0, 18))}
                onKeyDown={(e) => { if (e.key === 'Enter') saveNewMethod(); if (e.key === 'Escape') { setAddingMethod(false); setNewMethodLabel(''); } }}
                placeholder={t('methodNamePlaceholder')}
                style={{ flex: 1, padding: '7px 10px', border: `1px solid ${tone}`, borderRadius: 7, fontSize: 12, color: T.ink, background: T.card, outline: 'none' }}
              />
              <button
                onClick={saveNewMethod}
                disabled={!newMethodLabel.trim()}
                style={{ padding: '7px 12px', borderRadius: 7, border: 'none', background: newMethodLabel.trim() ? tone : T.bgSoft, color: newMethodLabel.trim() ? '#fff' : T.ink3, fontSize: 11, fontWeight: 700, cursor: newMethodLabel.trim() ? 'pointer' : 'not-allowed' }}
              >{t('saveShort')}</button>
              <button
                onClick={() => { setAddingMethod(false); setNewMethodLabel(''); }}
                style={{ padding: '7px 10px', borderRadius: 7, border: `1px solid ${T.border}`, background: T.card, color: T.ink3, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
              >{t('cancel')}</button>
            </div>
          )}
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: T.ink3, letterSpacing: 0.4, marginBottom: 6 }}>{t('detailsCap')}</div>
          <input value={ref} onChange={e => setRef(e.target.value)} placeholder={placeholderFor(method)} style={{ width: '100%', boxSizing: 'border-box', border: `1px solid ${T.border}`, background: T.card, borderRadius: 8, padding: '10px 12px', fontSize: 13, color: T.ink, outline: 'none', marginBottom: 6 }} />
          <textarea value={note} onChange={e => setNote(e.target.value)} placeholder={isCredit ? t('creditNoteReason') : isRefund ? t('refundReason') : t('notesOptional')} rows={2} style={{ width: '100%', boxSizing: 'border-box', border: `1px solid ${T.border}`, background: T.card, borderRadius: 8, padding: '10px 12px', fontSize: 13, color: T.ink, outline: 'none', resize: 'none', fontFamily: 'inherit' }} />
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <Btn variant="ghost" full onClick={onClose}>{t('cancel')}</Btn>
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
// `amountIncludesTax` toggles the tax math (rate = the booking's blended
// GST rate: 5% mid-tier / 18% luxury per the post-22-Sep-2025 slabs):
//   * inclusive (default): the entered amount IS the invoice total, GST is
//     extracted from within it (amount × rate / (100 + rate)). Matches the
//     common case where the hotelier already quoted a tax-inclusive figure.
//   * exclusive: the entered amount is pre-tax; CGST + SGST (half the rate
//     each) are added on top to compute the invoice total.
function IssueInvoiceSheet({ booking, property, defaultAmount, kind, onClose, onIssue, t }) {
  useSheetDismiss(true, onClose); // Q3: Android Back / Esc closes it; locks bg scroll
  const [name, setName] = useState(booking.guest || '');
  const [gstin, setGstin] = useState('');
  const [amount, setAmount] = useState(defaultAmount != null ? defaultAmount : (booking.total || 0));
  const [amountIncludesTax, setAmountIncludesTax] = useState(true);
  const kindLabel = kind === 'advance' ? t('advanceInvoice')
    : kind === 'balance' ? t('balanceInvoice')
    : kind === 'full' ? t('fullInvoice')
    : t('taxInvoice');
  const kindHint = kind === 'advance' ? t('advanceInvoiceHint').replace('{amt}', (defaultAmount || 0).toLocaleString('en-IN'))
    : kind === 'balance' ? t('balanceInvoiceHint').replace('{amt}', (defaultAmount || 0).toLocaleString('en-IN'))
    : kind === 'full' ? t('fullInvoiceHint')
    : null;

  const baseAmount = +amount || 0;
  // Use the booking's real blended GST rate (5% mid-tier / 18% luxury
  // per the post-22-Sep-2025 CBIC slabs), NOT a hardcoded 12% — that
  // slab was retired and would put a wrong rate on a legal tax
  // invoice (over-taxing a ₹4,500 room, under-taxing a ₹9,500 one).
  const invRate = blendedGstRate(booking, property) || 5;
  const gst = amountIncludesTax
    ? Math.round(baseAmount * invRate / (100 + invRate))
    : Math.round(baseAmount * invRate / 100);
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
            <div style={{ fontSize: 11, color: T.ink3, marginTop: 1 }}>{t('invoiceNumberLocked')}</div>
          </div>
        </div>

        {kindHint && (
          <div style={{ padding: '8px 10px', background: kind === 'advance' ? T.warnLt : T.indigoLt, borderRadius: 8, marginBottom: 10, fontSize: 11, color: kind === 'advance' ? 'oklch(35% 0.14 75)' : T.indigo, fontWeight: 600, lineHeight: 1.4 }}>
            {kindHint}
          </div>
        )}

        <div style={{ background: T.bgSoft, borderRadius: 10, padding: 12, marginBottom: 12, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: T.ink2, letterSpacing: 0.2 }}>{t('bookingTotalCap')}</span>
          <span className="tnum" style={{ fontSize: 18, fontWeight: 700, color: T.ink }}>₹{(booking.total || 0).toLocaleString('en-IN')}</span>
        </div>

        <div style={{ padding: 12, background: T.bgSoft, borderRadius: 10, border: `1px solid ${T.borderSoft}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder={t('recipientName')}
            style={{ width: '100%', boxSizing: 'border-box', border: `1px solid ${T.border}`, background: T.card, borderRadius: 7, padding: '8px 10px', fontSize: 13, fontWeight: 600, color: T.ink, outline: 'none' }}
          />
          <input
            value={gstin}
            onChange={e => setGstin(e.target.value.toUpperCase())}
            placeholder={t('gstinB2b')}
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
            <div style={{ fontSize: 10, fontWeight: 700, color: T.ink3, letterSpacing: 0.4, marginBottom: 6 }}>{t('howIsGstHandled')}</div>
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
                  {t('taxInclusive')}
                </div>
                <div style={{ fontSize: 10, color: T.ink3, fontWeight: 500, marginTop: 2, lineHeight: 1.3 }}>
                  {t('gstInsideAmount')}
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
                  {t('taxExclusive')}
                </div>
                <div style={{ fontSize: 10, color: T.ink3, fontWeight: 500, marginTop: 2, lineHeight: 1.3 }}>
                  {t('addGstOnTop').replace('{rate}', invRate % 1 ? invRate.toFixed(1) : invRate)}
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Live breakdown. Shows the hotelier exactly what numbers go onto
            the invoice before they tap Issue, in either tax mode. */}
        {baseAmount > 0 && (
          <div style={{ marginTop: 12, padding: 12, background: T.card, border: `1px solid ${T.borderSoft}`, borderRadius: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: T.ink3, letterSpacing: 0.4, marginBottom: 8 }}>{t('invoiceBreakdown')}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }} className="tnum">
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: T.ink2 }}>
                <span>{t('preTax')}</span>
                <span style={{ fontWeight: 600 }}>₹{preTax.toLocaleString('en-IN')}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: T.ink2 }}>
                <span>CGST {(invRate / 2).toFixed(invRate % 2 ? 1 : 0)}%</span>
                <span style={{ fontWeight: 600 }}>₹{cgst.toLocaleString('en-IN')}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: T.ink2 }}>
                <span>SGST {(invRate / 2).toFixed(invRate % 2 ? 1 : 0)}%</span>
                <span style={{ fontWeight: 600 }}>₹{sgst.toLocaleString('en-IN')}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 700, color: T.ink, paddingTop: 6, borderTop: `1px solid ${T.borderSoft}` }}>
                <span>{t('invoiceTotalRow')}</span>
                <span>₹{invoiceTotal.toLocaleString('en-IN')}</span>
              </div>
            </div>
          </div>
        )}

        <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
          <Btn variant="ghost" full onClick={onClose}>{t('cancel')}</Btn>
          <Btn full disabled={!valid} onClick={submit} style={{ background: T.teal, borderColor: T.teal }}>
            {t('issueInvoiceBtn')}
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
  // Defensive defaults (R9-3): a booking can reference a deleted room
  // category (orphaned roomTypeId) or carry an unexpected channel/status
  // (legacy row, OTA import, manual DB edit). Without these fallbacks,
  // rt/ch/statusInfo would be undefined and the first dereference
  // (rt.name, ch.label, statusInfo.bg) white-screens the whole page.
  // `|| {}` on b guards the rare "opened a booking id with none in the
  // store" case without crashing (and avoids a conditional early-return
  // that would break the rules of hooks).
  const b = bookings.find(x => x.id === bookingId) || bookings[0] || {};
  const ROOM_TYPES = effectiveRoomTypes(property);
  const rt = ROOM_TYPES.find(r => r.id === b.roomTypeId) || { name: '—', tag: 'tagSaffron' };
  const ch = CHANNELS[b.channel] || { label: b.channel || 'Direct', color: T.ink3, short: '?' };
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
  // Cash collected = payments − refunds. A credit note reduces the bill
  // (b.total), not cash, so it's excluded here; balance = bill − cash.
  const totalPaid = payments.reduce((s, p) => s + (p.kind === 'refund' ? -(p.amount || 0) : (p.kind === 'credit' || p.kind === 'credit_note') ? 0 : (p.amount || 0)), 0);
  const balance = (b.total || 0) - totalPaid;
  const statusInfo = STATUS[b.status] || STATUS.confirmed;
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
          <span style={{ fontSize: 13, fontWeight: 700, color: statusInfo.color }}>{statusLabel(b.status, lang)}{b.autoReleased ? ` · ${t('autoReleased')}` : ''}</span>
          {b.status === 'tentative' && (b.releaseAt || b.releaseTs) && (
            <span className="tnum" style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: 'oklch(48% 0.14 75)' }}>{t('releasesAt').replace('{when}', fmtRelease(b))}</span>
          )}
        </div>
        {b.status === 'tentative' && balance > 0 && (b.releaseAt || b.releaseTs) && (
          <div style={{ margin: '12px 16px 0', padding: '12px 14px', background: T.warnLt, border: `1px solid oklch(85% 0.10 75)`, borderLeft: `4px solid oklch(60% 0.14 75)`, borderRadius: 10, display: 'flex', gap: 10 }}>
            <Icon name="clock" size={18} color="oklch(48% 0.14 75)" stroke={2} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'oklch(40% 0.14 75)' }}>{t('autoReleaseIfUnpaid')}</div>
              <div style={{ fontSize: 12, color: T.ink2, marginTop: 2, lineHeight: 1.4 }}>
                {(() => {
                  const parts = t('autoReleaseDueBody').replace('{bal}', balance.toLocaleString('en-IN')).split('{when}');
                  return <>{parts[0]}<span className="tnum" style={{ fontWeight: 700, color: 'oklch(40% 0.14 75)' }}>{fmtRelease(b)}</span>{parts[1] || ''}</>;
                })()}
              </div>
              {onExtendHold && canEdit && (
                <ExtendOptions
                  onExtend={(hours) => onExtendHold(b.id, hours)}
                  colors={{ border: 'oklch(75% 0.10 75)', text: 'oklch(40% 0.14 75)' }}
                  hi={lang === 'hi'}
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
                    title={!canEdit ? t('noPermissionEditBookings') : (b.vip ? t('markedVipTapUnmark') : t('tapMarkVip'))}
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
                    <Chip color="ok" icon="sync" style={{ fontSize: 10 }}>{prevStays === 1 ? t('secondStay') : t('nthStay').replace('{n}', prevStays + 1)}</Chip>
                  )}
                </div>
                <div className="tnum" style={{ fontSize: 13, color: T.ink2, marginTop: 4 }}>{b.phone}</div>
                <div style={{ fontSize: 12, color: T.ink3, marginTop: 2 }}>
                  {b.guests}
                  {b.formC ? ` · ${t('foreignFormCPending')}` : b.country === 'IN' ? ` · ${t('indianGuest')}` : ''}
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
                  <Btn variant="wa" icon="wa" size="sm" disabled={!waUrl} onClick={() => open(waUrl)}>{t('payWhatsapp')}</Btn>
                  <Btn variant="soft" icon="phone" size="sm" disabled={!telUrl} onClick={() => open(telUrl)}>{t('callBtn')}</Btn>
                  <Btn variant="soft" icon="mail" size="sm" disabled={!mailUrl} onClick={() => open(mailUrl)}>{t('emailBtn')}</Btn>
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
                return <Row label={t('room')} value={`${itemRt ? itemRt.name : '—'} · #${(item.unitIdx ?? b.unitIdx ?? 0) + 1}`} />;
              }
              return (
                <Row label={t('roomsRow')} value={
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
            <Row label={t('channelRow')} value={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><span style={{ width: 6, height: 6, borderRadius: 3, background: ch.color }} /> {ch.label}</span>} />
            {isInvoicingPlan && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0 4px', borderTop: `1px dashed ${T.borderSoft}`, marginTop: 8 }}>
                <Icon name="tag" size={14} color={withTax ? T.indigo : T.ink3} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: T.ink }}>{t('includeInInvoiceRegister')}</div>
                  <div style={{ fontSize: 10.5, color: T.ink3, fontWeight: 600, lineHeight: 1.35, marginTop: 1 }}>
                    {withTax
                      ? t('invInclYesDetail').replace('{gst}', (tx?.gst || 0).toLocaleString('en-IN')).replace('{total}', (b.total || 0).toLocaleString('en-IN'))
                      : t('invInclNo')}
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
                    <div style={{ fontSize: 11, fontWeight: 700, color: T.ink2, letterSpacing: 0.2, marginBottom: 2 }}>{t('specialNoteCap')}</div>
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
              {balance > 0 ? t('balanceAmt').replace('{amt}', balance.toLocaleString('en-IN')) : balance < 0 ? t('overpaidAmt').replace('{amt}', Math.abs(balance).toLocaleString('en-IN')) : t('settled')}
            </span>
          } />
          <Card>
            {(() => {
              const mealCost = mealCostFor(b, property);
              const meal = mealPlanById(property, b.mealPlanId);
              const defaultId = property?.defaultMealPlanId || 'ep';
              const extraGuests = extraGuestCostFor(b, property);
              const extras = extrasCostFor(b, property);
              const preTax = withTax ? (b.total || 0) - tx.gst : (b.total || 0);
              // R8-11: add any coupon discount back into the displayed tariff
              // and show an explicit Discount row below — they cancel, so the
              // rows still sum to the exact total, but the room rate no longer
              // looks mysteriously low with no explanation.
              const discountAmount = Math.max(0, +b.discountAmount || 0);
              // Credit notes reduce the bill (b.total is already net of them).
              // Add them back into the displayed tariff + show a "Credit note"
              // row so the breakdown still reconciles to the net total — same
              // approach as the coupon discount above.
              const credits = payments.reduce((s, p) => s + ((p.kind === 'credit' || p.kind === 'credit_note') ? (p.amount || 0) : 0), 0);
              const tariff = preTax - extras - mealCost - extraGuests + discountAmount + credits;
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
                const mealLabel = t('mealPlanLine').replace('{code}', meal.code).replace('{label}', meal.label);
                if (meal.id === defaultId) {
                  return <Row label={mealLabel} value={t('inRoomRate')} />;
                }
                if (mealCost > 0) {
                  return <Row label={mealLabel} value={`+ ₹${mealCost.toLocaleString('en-IN')}`} />;
                }
                if (mealCost < 0) {
                  return <Row label={mealLabel} value={`− ₹${Math.abs(mealCost).toLocaleString('en-IN')}`} />;
                }
                return <Row label={mealLabel} value="—" />;
              })();
              return (
                <>
                  <Row label={t('tariffNights').replace('{n}', `${b.nights} ${b.nights > 1 ? t('nights') : t('nights')}`)} value={`₹${tariff.toLocaleString('en-IN')}`} />
                  {rp && rp.id !== 'standard' && (
                    <Row
                      label={t('ratePlanRow')}
                      value={`${rp.label} · ${rp.cancellation === 'non-refundable' ? t('noRefunds') : t('freeCancelH').replace('{h}', rp.refundHours)}`}
                    />
                  )}
                  {extraGuests > 0 && (
                    <Row label={t('extraGuestChargesRow')} value={`₹${extraGuests.toLocaleString('en-IN')}`} />
                  )}
                  {extras > 0 && (
                    <Row label={t('addOnsExtras')} value={`₹${extras.toLocaleString('en-IN')}`} />
                  )}
                  {mealRow}
                  {discountAmount > 0 && (
                    <Row label={b.couponCode ? t('discountCoupon').replace('{code}', b.couponCode) : t('discountRow')} value={`− ₹${discountAmount.toLocaleString('en-IN')}`} />
                  )}
                  {credits > 0 && (
                    <Row label={t('creditNoteWord')} value={`− ₹${credits.toLocaleString('en-IN')}`} />
                  )}
                </>
              );
            })()}
            {withTax && <Row label={`CGST ${(tx.rate / 2).toFixed(tx.rate % 2 ? 1 : 0)}%`} value={`₹${tx.cgst.toLocaleString('en-IN')}`} />}
            {withTax && <Row label={`SGST ${(tx.rate / 2).toFixed(tx.rate % 2 ? 1 : 0)}%`} value={`₹${tx.sgst.toLocaleString('en-IN')}`} />}
            <div style={{ height: 1, background: T.borderSoft, margin: '8px 0' }} />
            <Row label={t('total')} value={`₹${(b.total || 0).toLocaleString('en-IN')}`} bold />
            <div style={{ height: 1, background: T.borderSoft, margin: '8px 0' }} />

            <div style={{ fontSize: 10, fontWeight: 700, color: T.ink3, letterSpacing: 0.4, marginBottom: 6 }}>{t('paymentsLedger')}</div>
            {payments.length === 0 && <div style={{ fontSize: 12, color: T.ink3, padding: '6px 0' }}>{t('noPaymentsYet')}</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {payments.map(p => {
                const isOut = p.kind === 'refund' || p.kind === 'credit';
                const tone = p.kind === 'refund' ? T.danger : p.kind === 'credit' ? T.indigo : T.ok;
                // Resolve method label: defaults from METHOD_LABELS, then
                // custom methods from property.accountant.customPaymentMethods,
                // then fall back to the raw id (e.g. 'pm_xyz') if neither
                // matches (custom method was deleted after the payment).
                const customMethod = (property?.accountant?.customPaymentMethods || []).find(m => m.id === p.method);
                const methodLabel = methodLabelFor(t, p.method) || (customMethod && customMethod.label) || p.method;
                return (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 8px', background: T.bgSoft, borderRadius: 7, borderLeft: `3px solid ${tone}` }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: tone, textTransform: 'uppercase', letterSpacing: 0.2 }}>
                          {p.kind === 'refund' ? t('refundWord') : p.kind === 'credit' ? t('creditNoteWord') : methodLabel}
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
            <Row label={t('totalPaid')} value={`₹${totalPaid.toLocaleString('en-IN')}`} />
            <Row label={balance < 0 ? t('overpaymentDue') : t('balanceDue')} value={
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
                  <Btn variant="primary" icon="plus" full onClick={() => { setPayKind('payment'); setPayOpen(true); }}>{t('addPaymentAmt').replace('{amt}', balance.toLocaleString('en-IN'))}</Btn>
                ) : (
                  <Btn variant="ghost" icon="arrow" full onClick={() => { setPayKind('refund'); setPayOpen(true); }}>{t('refundOverpaymentAmt').replace('{amt}', Math.abs(balance).toLocaleString('en-IN'))}</Btn>
                )}
              </div>
            )}
            {/* Secondary actions — compact icon row. Send-via-WhatsApp lives
                here too rather than as full-width buttons; it kept stealing
                attention from the primary payment action. */}
            <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {balance === 0 && canPay && (
                <Btn variant="ghost" icon="plus" size="sm" onClick={() => { setPayKind('payment'); setPayOpen(true); }}>{t('payment')}</Btn>
              )}
              {canPay && <Btn variant="ghost" icon="arrow" size="sm" onClick={() => { setPayKind('refund'); setPayOpen(true); }}>{t('refundShort')}</Btn>}
              {canPay && <Btn variant="ghost" icon="tag" size="sm" onClick={() => { setPayKind('credit'); setPayOpen(true); }}>{t('creditShort')}</Btn>}
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
              >{t('shareBookingShort')}</Btn>
              {balance > 0 && (
                <Btn
                  variant="ghost"
                  icon="wa"
                  size="sm"
                  disabled={!b.phone}
                  onClick={() => {
                    const digits = String(b.phone || '').replace(/\D/g, '');
                    if (!digits) return;
                    const msg = t('waBalanceDue')
                      .replace('{guest}', b.guest || '')
                      .replace('{bal}', balance.toLocaleString('en-IN'))
                      .replace('{id}', b.id)
                      .replace('{prop}', property?.profile?.name || t('ourProperty'));
                    window.open(`https://wa.me/${digits}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
                  }}
                >
                  {t('remindAmt').replace('{amt}', balance.toLocaleString('en-IN'))}
                </Btn>
              )}
            </div>
            {balance < 0 && (
              <div style={{ marginTop: 8, padding: '8px 10px', background: T.indigoLt, borderRadius: 7, fontSize: 11, color: T.indigo, fontWeight: 600, lineHeight: 1.4 }}>
                <Icon name="info" size={11} /> {t('guestExcessHint').replace('{amt}', Math.abs(balance).toLocaleString('en-IN'))}
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
              <span>{t('voucherOpenedHint')}</span>
            </div>
          </div>
        )}

        {payOpen && (
          <PaymentSheet
            kind={payKind}
            balance={balance}
            total={b.total || 0}
            property={property}
            onChangeProperty={onChangeProperty}
            canManageSettings={can('manage_settings')}
            t={t}
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
                {voucherLangSheet.invoice ? t('downloadInvoiceIn') : t('downloadVoucherIn')}
              </div>
              <div style={{ fontSize: 11, color: T.ink3, marginBottom: 14, lineHeight: 1.4 }}>
                {t('pickPdfLang')}
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
          <SectionHead title={t('invoicesSection')} action={
            activeInvoices.length > 0 && remainingToInvoice <= 0
              ? <Chip color="ok" icon="check" style={{ fontSize: 9 }}>{t('fullyInvoiced')}</Chip>
              : null
          } />
          <Card padding={0}>
            {invoices.length === 0 ? (
              <div style={{ padding: '16px 14px', fontSize: 12, color: T.ink3, lineHeight: 1.45 }}>
                {t('noInvoiceYetBody')}
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
                        {inv.voided && <Chip color="danger" style={{ fontSize: 9 }}>{t('voided')}</Chip>}
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
                        <Icon name="download" size={11} stroke={2} /> {t('viewInvoicePdf')}
                      </button>
                      <button
                        onClick={() => { if (confirm(t('voidInvoiceConfirm').replace('{number}', inv.number))) onVoidInvoice && onVoidInvoice(b.id, inv.id); }}
                        className="atithi-tap"
                        style={{ padding: '5px 10px', borderRadius: 7, border: `1px solid ${T.border}`, background: T.card, color: T.danger, fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                      >
                        <Icon name="x" size={11} stroke={2} /> {t('voidWord')}
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
            {b.status === 'tentative' ? (
              <div style={{ padding: '10px 14px', background: T.bgSoft, fontSize: 11, color: T.ink3, fontWeight: 600, lineHeight: 1.4 }}>
                {t('confirmBeforeInvoice')}
              </div>
            ) : remainingToInvoice > 0 && canInvoice ? (
              <div style={{ padding: 12, background: T.bgSoft, display: 'flex', alignItems: 'center', gap: 10 }}>
                <button
                  onClick={() => setInvoiceOpen(true)}
                  className="atithi-tap"
                  style={{ flex: 1, padding: '10px 12px', borderRadius: 8, border: 'none', background: T.teal, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                >
                  <Icon name="plus" size={12} stroke={2.2} />
                  {invoices.length === 0 ? t('issueInvoiceAmt').replace('{amt}', remainingToInvoice.toLocaleString('en-IN')) : t('issueAnotherInvoice').replace('{amt}', remainingToInvoice.toLocaleString('en-IN'))}
                </button>
              </div>
            ) : null}
          </Card>
          {invoiceOpen && (
            <IssueInvoiceSheet
              booking={{ ...b, total: remainingToInvoice }}
              property={property}
              defaultAmount={invoiceDefaultAmount}
              kind={invoiceKind}
              t={t}
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
            <SectionHead title={t('voiceNotesSection')} />
            <Card padding={12}>
              <VoiceRecorder
                t={t}
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
              items.push({ icon: 'tag', tone: T.primary, text: t('bookingVia').replace('{ch}', ch.label) });
              payments.forEach(p => {
                const tone = p.kind === 'refund' ? T.danger : p.kind === 'credit' ? T.indigo : T.ok;
                // Same custom-method resolution as the payments-ledger
                // row above — defaults → custom-methods → raw id fallback.
                const customMethod = (property?.accountant?.customPaymentMethods || []).find(m => m.id === p.method);
                const methodLabel = methodLabelFor(t, p.method) || (customMethod && customMethod.label) || p.method;
                const label = p.kind === 'refund' ? t('refundAmt').replace('{amt}', p.amount.toLocaleString('en-IN'))
                  : p.kind === 'credit' ? t('creditNoteAmt').replace('{amt}', p.amount.toLocaleString('en-IN'))
                  : t('paymentReceivedAmt').replace('{amt}', p.amount.toLocaleString('en-IN')) + (p.method ? ` · ${methodLabel}` : '');
                items.push({ icon: p.kind === 'refund' ? 'arrow' : 'inr', tone, text: label, time: p.date });
              });
              (b.invoices || []).filter(inv => !inv.voided).forEach(inv => {
                items.push({ icon: 'download', tone: T.teal, text: t('invoiceIssuedAmt').replace('{number}', inv.number).replace('{amt}', (inv.amount || 0).toLocaleString('en-IN')), time: fmtIssued(inv.date) });
              });
              if (b.status === 'tentative' && (b.releaseAt || b.releaseTs)) {
                items.push({ icon: 'clock', tone: 'oklch(48% 0.14 75)', text: t('onHoldReleases').replace('{when}', fmtRelease(b)) });
              }
              if (b.vip) items.push({ icon: 'star', tone: T.primary, text: t('markedVip') });
              if (b.formC) items.push({ icon: 'flag', tone: 'oklch(48% 0.14 75)', text: t('foreignFormCFiling') });
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
              if (!b.events && b.status === 'checkedin') items.push({ icon: 'door', tone: T.indigo, text: t('checkedIn') });
              if (!b.events && b.status === 'checkout') items.push({ icon: 'check', tone: T.ok, text: t('checkedOutComplete') });
              if (b.status === 'cancelled' && !(b.events || []).some(e => /cancelled/i.test(e.text))) items.push({ icon: 'x', tone: T.danger, text: b.autoReleased ? t('autoReleasedExpired') : t('bookingCancelled') });
              return items.length === 0
                ? (
                  <div style={{ padding: '14px', fontSize: 12, color: T.ink3, lineHeight: 1.45 }}>
                    {t('noActivityYet')}
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
            {t('optionalInventoryWorks')}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          {b.status === 'confirmed' && canEdit && (
            <Btn variant="soft" icon="door" style={{ flex: 1 }} onClick={() => onSetStatus && onSetStatus(b.id, 'checkedin')}>{t('logCheckIn')}</Btn>
          )}
          {b.status === 'checkedin' && canEdit && (
            <Btn variant="soft" icon="check" style={{ flex: 1 }} onClick={() => onSetStatus && onSetStatus(b.id, 'checkout')}>{t('logCheckOut')}</Btn>
          )}
          {b.status === 'tentative' && (
            <>
              {canCancel && <Btn variant="ghost" icon="x" style={{ flex: 1 }} onClick={() => { if (window.confirm(t('cancelBookingShortConfirm'))) onSetStatus && onSetStatus(b.id, 'cancelled'); }}>{t('cancel')}</Btn>}
              {canEdit && <Btn icon="check" style={{ flex: 1 }} onClick={() => onSetStatus && onSetStatus(b.id, 'confirmed')}>{t('confirmWord')}</Btn>}
            </>
          )}
          {b.status === 'cancelled' && canCancel && (
            <Btn variant="ghost" icon="sync" full onClick={() => onSetStatus && onSetStatus(b.id, 'confirmed')}>{t('reopenBooking')}</Btn>
          )}
          {b.status === 'checkout' && (
            <Btn variant="soft" icon="check" style={{ flex: 1 }} disabled>{t('stayComplete')}</Btn>
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
                if (window.confirm(t('cancelBookingConfirm').replace('{id}', b.id).replace('{guest}', b.guest))) {
                  onSetStatus && onSetStatus(b.id, 'cancelled');
                }
              }}
            >{t('cancelBookingBtn')}</Btn>
          )}
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { T } from '../tokens.js';
import { CHANNELS, STATUS, bookingGstApplies, getTaxBreakdown, effectiveRoomTypes } from '../data.js';
import { generateVoucher } from '../utils/voucher.js';
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

const METHOD_LABELS = { cash: 'Cash', card: 'Card', upi: 'UPI', account: 'Bank a/c', other: 'Other' };
const METHOD_OPTIONS = [
  { id: 'cash',    label: 'Cash',     icon: 'inr',  hint: 'Counter / hand-collected' },
  { id: 'card',    label: 'Card',     icon: 'card', hint: 'POS / swipe / online' },
  { id: 'upi',     label: 'UPI',      icon: 'qr',   hint: 'GPay / PhonePe / Paytm' },
  { id: 'account', label: 'Bank a/c', icon: 'bank', hint: 'NEFT / IMPS / cheque' },
  { id: 'other',   label: 'Other',    icon: 'plus', hint: 'Voucher / barter / agent' },
];

function PaymentSheet({ kind, balance, total, onClose, onSave }) {
  const isRefund = kind === 'refund';
  const isCredit = kind === 'credit';
  const defaultAmt = isRefund || isCredit ? (balance < 0 ? Math.abs(balance) : '') : (balance > 0 ? balance : '');
  const [amount, setAmount] = useState(defaultAmt);
  const [method, setMethod] = useState(isCredit ? 'account' : 'cash');
  const [note, setNote] = useState('');
  const [ref, setRef] = useState('');

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

  const save = () => {
    const amt = +amount;
    if (!amt || amt <= 0) return;
    const today = new Date();
    const dateStr = today.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) + ' · ' + today.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
    onSave({ id: 'p_' + Date.now(), kind, method, amount: amt, note: [note, ref].filter(Boolean).join(' · '), date: dateStr });
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
            <input type="number" autoFocus value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" className="tnum" style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 24, fontWeight: 700, color: T.ink, minWidth: 0 }} />
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
            {METHOD_OPTIONS.map(m => (
              <button key={m.id} onClick={() => setMethod(m.id)} style={{
                border: `1.5px solid ${method === m.id ? tone : T.borderSoft}`,
                background: method === m.id ? `color-mix(in oklch, ${tone} 10%, white)` : T.card,
                borderRadius: 9, padding: '8px 4px', cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              }}>
                <Icon name={m.icon} size={14} color={method === m.id ? tone : T.ink3} stroke={2} />
                <span style={{ fontSize: 10, fontWeight: 700, color: method === m.id ? tone : T.ink2 }}>{m.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: T.ink3, letterSpacing: 0.4, marginBottom: 6 }}>DETAILS</div>
          <input value={ref} onChange={e => setRef(e.target.value)} placeholder={placeholderForMethod[method]} style={{ width: '100%', boxSizing: 'border-box', border: `1px solid ${T.border}`, background: T.card, borderRadius: 8, padding: '10px 12px', fontSize: 13, color: T.ink, outline: 'none', marginBottom: 6 }} />
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

// Sheet for issuing one or more tax invoices against a booking. Defaults to a
// single-recipient invoice for the full booking amount; the hotelier can split
// into multiple parts before issuing.
function IssueInvoiceSheet({ booking, onClose, onIssue }) {
  const [parts, setParts] = useState([
    { name: booking.guest || '', gstin: '', amount: booking.total || 0 },
  ]);
  const totalAllocated = parts.reduce((s, p) => s + (+p.amount || 0), 0);
  const remaining = (booking.total || 0) - totalAllocated;
  const valid = parts.length > 0 && Math.abs(remaining) < 0.5 && parts.every(p => p.name.trim() && +p.amount > 0);

  const updatePart = (i, patch) => setParts(arr => arr.map((p, idx) => idx === i ? { ...p, ...patch } : p));
  const addPart = () => setParts(arr => [...arr, { name: booking.guest || '', gstin: '', amount: remaining > 0 ? remaining : 0 }]);
  const removePart = (i) => setParts(arr => arr.filter((_, idx) => idx !== i));

  const submit = () => {
    if (!valid) return;
    onIssue(parts.map(p => ({
      amount: +p.amount,
      recipient: { name: p.name.trim(), gstin: p.gstin.trim(), address: '' },
    })));
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
            <div style={{ fontSize: 15, fontWeight: 700, color: T.ink }}>Issue tax invoice{parts.length > 1 ? 's' : ''}</div>
            <div style={{ fontSize: 11, color: T.ink3, marginTop: 1 }}>Once issued, the invoice number is locked (GST requirement).</div>
          </div>
        </div>

        <div style={{ background: T.bgSoft, borderRadius: 10, padding: 12, marginBottom: 12, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: T.ink2, letterSpacing: 0.2 }}>BOOKING TOTAL</span>
          <span className="tnum" style={{ fontSize: 18, fontWeight: 700, color: T.ink }}>₹{(booking.total || 0).toLocaleString('en-IN')}</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {parts.map((p, i) => (
            <div key={i} style={{ padding: 12, background: T.bgSoft, borderRadius: 10, border: `1px solid ${T.borderSoft}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: T.ink3, letterSpacing: 0.4 }}>INVOICE {i + 1}</span>
                {parts.length > 1 && (
                  <button onClick={() => removePart(i)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: T.ink3, cursor: 'pointer', padding: 2 }}>
                    <Icon name="x" size={11} />
                  </button>
                )}
              </div>
              <input
                value={p.name}
                onChange={e => updatePart(i, { name: e.target.value })}
                placeholder="Recipient name"
                style={{ width: '100%', boxSizing: 'border-box', border: `1px solid ${T.border}`, background: T.card, borderRadius: 7, padding: '8px 10px', fontSize: 13, fontWeight: 600, color: T.ink, outline: 'none', marginBottom: 6 }}
              />
              <input
                value={p.gstin}
                onChange={e => updatePart(i, { gstin: e.target.value.toUpperCase() })}
                placeholder="GSTIN (optional · for B2B)"
                style={{ width: '100%', boxSizing: 'border-box', border: `1px solid ${T.border}`, background: T.card, borderRadius: 7, padding: '8px 10px', fontSize: 12, fontWeight: 600, color: T.ink, outline: 'none', marginBottom: 6, fontFamily: T.mono || 'monospace' }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: T.card, border: `1px solid ${T.border}`, borderRadius: 7 }}>
                <span style={{ fontSize: 12, color: T.ink3, fontWeight: 700 }}>₹</span>
                <input
                  type="number"
                  value={p.amount}
                  onChange={e => updatePart(i, { amount: e.target.value })}
                  className="tnum"
                  style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 14, fontWeight: 700, color: T.ink, minWidth: 0 }}
                />
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={addPart}
          style={{ marginTop: 10, width: '100%', padding: '10px', borderRadius: 8, border: `1.5px dashed ${T.border}`, background: 'transparent', color: T.primary, fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}
        >
          <Icon name="plus" size={11} stroke={2.4} /> Split into another invoice
        </button>

        <div style={{
          marginTop: 12, padding: '10px 12px', borderRadius: 8,
          background: valid ? 'oklch(95% 0.04 155)' : 'oklch(95% 0.05 75)',
          color: valid ? T.ok : 'oklch(40% 0.14 75)',
          fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <Icon name={valid ? 'check' : 'info'} size={11} stroke={2.2} />
          <span className="tnum">
            ₹{totalAllocated.toLocaleString('en-IN')} of ₹{(booking.total || 0).toLocaleString('en-IN')}
            {remaining > 0 ? ` · ₹${remaining.toLocaleString('en-IN')} unallocated` : remaining < 0 ? ` · ₹${Math.abs(remaining).toLocaleString('en-IN')} over` : ' · matches'}
          </span>
        </div>

        <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
          <Btn variant="ghost" full onClick={onClose}>Cancel</Btn>
          <Btn full disabled={!valid} onClick={submit} style={{ background: T.teal, borderColor: T.teal }}>
            Issue {parts.length} invoice{parts.length > 1 ? 's' : ''}
          </Btn>
        </div>
      </div>
    </div>
  );
}

export default function BookingDetail({ go, bookingId, bookings, plan = 'engine', t, property, onEdit, onPayment, onSetStatus, onExtendHold, onSetGst, onIssueInvoice, onVoidInvoice }) {
  const b = bookings.find(x => x.id === bookingId) || bookings[0];
  const ROOM_TYPES = effectiveRoomTypes(property);
  const rt = ROOM_TYPES.find(r => r.id === b.roomTypeId);
  const ch = CHANNELS[b.channel];
  const payments = b.payments || (b.paid > 0 ? [{ id: 'p1', kind: 'payment', method: b.channel === 'direct' ? 'upi' : 'card', amount: b.paid, note: b.channel === 'direct' ? 'Razorpay UPI · auto-captured' : `${ch.label} pre-payment`, date: '03 May · 18:25' }] : []);
  const totalPaid = payments.reduce((s, p) => s + (p.kind === 'refund' || p.kind === 'credit' ? -p.amount : p.amount), 0);
  const balance = b.total - totalPaid;
  const statusInfo = STATUS[b.status];
  const withTax = bookingGstApplies(b);
  const tx = withTax ? getTaxBreakdown({ ...b, gstApplies: true }, property) : null;
  const [payOpen, setPayOpen] = useState(false);
  const [payKind, setPayKind] = useState('payment');
  const [waStatus, setWaStatus] = useState('sent');
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const invoices = b.invoices || [];
  const activeInvoices = invoices.filter(inv => !inv.voided);
  const invoicedAmount = activeInvoices.reduce((s, inv) => s + (inv.amount || 0), 0);
  const remainingToInvoice = (b.total || 0) - invoicedAmount;

  useEffect(() => {
    setWaStatus('sent');
    const t1 = setTimeout(() => setWaStatus('delivered'), 1400);
    const t2 = setTimeout(() => setWaStatus('read'), 3200);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [bookingId]);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: T.bg }}>
      <ScreenHeader title={b.id} subtitle={rt.name} onBack={() => go('diary')}
        right={
          <div style={{ display: 'inline-flex', gap: 6 }}>
            <button onClick={() => generateVoucher(b, rt, property)} className="atithi-tap" title="Download voucher PDF" style={{
              height: 36, width: 36, borderRadius: 10, border: `1px solid ${T.border}`,
              background: T.card, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: T.ink2,
            }}>
              <Icon name="download" size={14} stroke={2} />
            </button>
            <button onClick={() => onEdit(b.id)} className="atithi-tap" style={{
              height: 36, padding: '0 12px', borderRadius: 10, border: `1px solid ${T.border}`,
              background: T.card, display: 'inline-flex', alignItems: 'center', gap: 5,
              cursor: 'pointer', color: T.primary, fontSize: 12, fontWeight: 700,
            }}>
              <Icon name="edit" size={13} stroke={2} /> {t('edit')}
            </button>
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
              {onExtendHold && (
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
                  {b.vip && <Chip color="warn" icon="star">VIP</Chip>}
                </div>
                <div className="tnum" style={{ fontSize: 13, color: T.ink2, marginTop: 4 }}>{b.phone}</div>
                <div style={{ fontSize: 12, color: T.ink3, marginTop: 2 }}>{b.guests} · {b.formC ? 'Foreign · Form C filed' : 'Indian · Aadhaar verified'}</div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 14 }}>
              <Btn variant="wa" icon="wa" size="sm">WhatsApp</Btn>
              <Btn variant="soft" icon="phone" size="sm">Call</Btn>
              <Btn variant="soft" icon="mail" size="sm">Email</Btn>
            </div>
          </Card>
        </div>

        <div style={{ padding: '0 16px 16px' }}>
          <SectionHead title={t('stay')} />
          <Card>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 12 }}>
              <div>
                <div style={{ fontSize: 10, color: T.ink3, fontWeight: 700, letterSpacing: 0.4 }}>{t('checkIn').toUpperCase()}</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: T.ink }}>{4 + b.startIdx} May</div>
                <div style={{ fontSize: 11, color: T.ink3 }}>14:00</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 24, height: 1, background: T.border }} />
                <span className="tnum" style={{ fontSize: 11, fontWeight: 700, color: T.ink2 }}>{b.nights}N</span>
                <div style={{ width: 24, height: 1, background: T.border }} />
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 10, color: T.ink3, fontWeight: 700, letterSpacing: 0.4 }}>{t('checkOut').toUpperCase()}</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: T.ink }}>{4 + b.startIdx + b.nights} May</div>
                <div style={{ fontSize: 11, color: T.ink3 }}>11:00</div>
              </div>
            </div>
            <div style={{ height: 1, background: T.borderSoft, margin: '14px 0' }} />
            <Row label="Room" value={`${rt.name} · #${b.unitIdx + 1}`} />
            <Row label="Channel" value={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><span style={{ width: 6, height: 6, borderRadius: 3, background: ch.color }} /> {ch.label}</span>} />
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
              {onSetGst && <Toggle on={withTax} onChange={(v) => onSetGst(b.id, v)} />}
            </div>
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
            <Row label={`Tariff · ${b.nights} nights`} value={`₹${(withTax ? b.total - tx.gst : b.total).toLocaleString('en-IN')}`} />
            {withTax && tx.interState && <Row label="IGST 12%" value={`₹${tx.igst.toLocaleString('en-IN')}`} />}
            {withTax && !tx.interState && <Row label="CGST 6%" value={`₹${tx.cgst.toLocaleString('en-IN')}`} />}
            {withTax && !tx.interState && <Row label="SGST 6%" value={`₹${tx.sgst.toLocaleString('en-IN')}`} />}
            <div style={{ height: 1, background: T.borderSoft, margin: '8px 0' }} />
            <Row label="Total" value={`₹${b.total.toLocaleString('en-IN')}`} bold />
            <div style={{ height: 1, background: T.borderSoft, margin: '8px 0' }} />

            <div style={{ fontSize: 10, fontWeight: 700, color: T.ink3, letterSpacing: 0.4, marginBottom: 6 }}>PAYMENTS LEDGER</div>
            {payments.length === 0 && <div style={{ fontSize: 12, color: T.ink3, padding: '6px 0' }}>No payments yet.</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {payments.map(p => {
                const isOut = p.kind === 'refund' || p.kind === 'credit';
                const tone = p.kind === 'refund' ? T.danger : p.kind === 'credit' ? T.indigo : T.ok;
                const methodLabel = METHOD_LABELS[p.method] || p.method;
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

            <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
              <Btn variant="primary" icon="plus" size="sm" onClick={() => { setPayKind('payment'); setPayOpen(true); }}>Payment</Btn>
              <Btn variant="ghost" icon="arrow" size="sm" onClick={() => { setPayKind('refund'); setPayOpen(true); }}>Refund</Btn>
              <Btn variant="ghost" icon="tag" size="sm" onClick={() => { setPayKind('credit'); setPayOpen(true); }}>Credit note</Btn>
            </div>
            {balance > 0 && (
              <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                <Btn variant="wa" icon="wa" size="sm" style={{ flex: 1 }}>Send ₹{balance.toLocaleString('en-IN')} link</Btn>
              </div>
            )}
            {balance < 0 && (
              <div style={{ marginTop: 8, padding: '8px 10px', background: T.indigoLt, borderRadius: 7, fontSize: 11, color: T.indigo, fontWeight: 600, lineHeight: 1.4 }}>
                <Icon name="info" size={11} /> Guest has ₹{Math.abs(balance).toLocaleString('en-IN')} excess. Issue refund or convert to credit note for future bookings.
              </div>
            )}
          </Card>
        </div>

        {payOpen && (
          <PaymentSheet
            kind={payKind}
            balance={balance}
            total={b.total}
            onClose={() => setPayOpen(false)}
            onSave={(entry) => { onPayment && onPayment(b.id, entry); setPayOpen(false); }}
          />
        )}

        <div style={{ padding: '0 16px 16px' }}>
          <SectionHead title="Invoices" action={
            activeInvoices.length > 0 && remainingToInvoice <= 0
              ? <Chip color="ok" icon="check" style={{ fontSize: 9 }}>Fully invoiced</Chip>
              : null
          } />
          <Card padding={0}>
            {invoices.length === 0 ? (
              <div style={{ padding: '16px 14px', fontSize: 12, color: T.ink3, lineHeight: 1.45 }}>
                No tax invoice issued yet. Issue one for the full booking total or split into multiple invoices (e.g. company + personal share).
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
                        onClick={() => generateVoucher(b, rt, property, inv)}
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
            ) : remainingToInvoice > 0 ? (
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
        </div>

        {invoiceOpen && (
          <IssueInvoiceSheet
            booking={{ ...b, total: remainingToInvoice }}
            onClose={() => setInvoiceOpen(false)}
            onIssue={(parts) => onIssueInvoice && onIssueInvoice(b.id, parts)}
          />
        )}

        <div style={{ padding: '0 16px 16px' }}>
          <SectionHead title={t('activity')} />
          <Card padding={0}>
            {[
              { icon: 'wa', tone: '#25D366', text: waStatus === 'sent' ? 'WhatsApp confirmation · sending…' : waStatus === 'delivered' ? 'WhatsApp · delivered ✓✓' : 'WhatsApp · read ✓✓ by guest', time: 'just now', live: true },
              { icon: 'tag', tone: T.primary, text: `Booking received via ${ch.label}`, time: '03 May · 18:24' },
              { icon: 'inr', tone: T.indigo, text: `Razorpay · ₹${b.paid.toLocaleString('en-IN')} captured`, time: '03 May · 18:25' },
            ].map((a, i, arr) => (
              <div key={i} style={{ padding: '12px 14px', display: 'flex', gap: 10, borderBottom: i < arr.length - 1 ? `1px solid ${T.borderSoft}` : 'none' }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: `color-mix(in oklch, ${a.tone} 14%, white)`, color: a.tone, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon name={a.icon} size={14} stroke={2} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: T.ink, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {a.text}
                    {a.live && <span style={{ width: 6, height: 6, borderRadius: 3, background: '#25D366' }} className="pulse" />}
                  </div>
                  <div className="tnum" style={{ fontSize: 11, color: T.ink3, marginTop: 1 }}>{a.time}</div>
                </div>
              </div>
            ))}
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
          {b.status === 'confirmed' && (
            <Btn variant="soft" icon="door" full onClick={() => onSetStatus && onSetStatus(b.id, 'checkedin')}>Log check-in</Btn>
          )}
          {b.status === 'checkedin' && (
            <Btn variant="soft" icon="check" full onClick={() => onSetStatus && onSetStatus(b.id, 'checkout')}>Log check-out</Btn>
          )}
          {b.status === 'tentative' && (
            <>
              <Btn variant="ghost" icon="x" style={{ flex: 1 }} onClick={() => onSetStatus && onSetStatus(b.id, 'cancelled')}>Cancel</Btn>
              <Btn icon="check" style={{ flex: 1 }} onClick={() => onSetStatus && onSetStatus(b.id, 'confirmed')}>Confirm</Btn>
            </>
          )}
          {b.status === 'cancelled' && (
            <Btn variant="ghost" icon="sync" full onClick={() => onSetStatus && onSetStatus(b.id, 'confirmed')}>Re-open booking</Btn>
          )}
          {b.status === 'checkout' && (
            <Btn variant="soft" icon="check" full disabled>Stay complete</Btn>
          )}
        </div>
      </div>
    </div>
  );
}

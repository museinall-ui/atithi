import { useMemo, useState, useRef } from 'react';
import { T } from '../tokens.js';
import { dateLoc } from '../i18n.js';
import { DAYS, ANCHOR, ymd, idxToDate, dateToIdx, bookingGstApplies, listIssuedInvoices, effectiveRoomTypes, blendedGstRate, bookingNetAmount, CHANNELS } from '../data.js';
import { exportInvoiceList, emailToAccountant, sendInvoiceListViaResend } from '../utils/invoiceExport.js';
import { buildCsv, downloadCsv } from '../utils/csv.js';
import Icon from '../components/Icon.jsx';
import Btn from '../components/Btn.jsx';
import Chip from '../components/Chip.jsx';
import Card from '../components/Card.jsx';
import Row from '../components/Row.jsx';
import SectionHead from '../components/SectionHead.jsx';
import ScreenHeader from '../components/ScreenHeader.jsx';

// Income payment methods — default 5 (cash / card / upi / account /
// other) merged with hotelier-defined custom methods stored on
// property.accountant.customPaymentMethods. Same vocabulary the
// BookingDetail PaymentSheet uses. Expense paid_via is a separate
// vocabulary (cash / upi / card / bank) — they show in two separate
// breakdown blocks so the hotelier can compare "cash I took in" vs
// "cash I paid out" without conflating the two.
const INCOME_METHOD_DEFAULTS = [
  { id: 'cash',    label: 'Cash' },
  { id: 'card',    label: 'Card' },
  { id: 'upi',     label: 'UPI' },
  { id: 'account', label: 'Bank a/c' },
  { id: 'other',   label: 'Other' },
];
const EXPENSE_METHOD_DEFAULTS = [
  { id: 'cash', label: 'Cash' },
  { id: 'upi',  label: 'UPI' },
  { id: 'card', label: 'Card' },
  { id: 'bank', label: 'Bank' },
];

// Resolve the YYYY-MM-DD a payment was actually collected on. Prefers
// payment.dateIso (added in mid-2026 — every new payment carries it),
// falls back to parsing payment.date (only works for the rare legacy
// payment where date happens to be an iso/iso-ish string), and finally
// to the booking's check-in date so undated payments still appear in
// the day-of-stay column instead of vanishing from the P&L.
function payIsoFor(p, b) {
  if (p && p.dateIso) return p.dateIso;
  if (p && p.date && p.date !== 'now') {
    const pd = new Date(p.date);
    if (!isNaN(pd.getTime())) return ymd(pd);
  }
  if (b && b.startIdx != null) return idxToDate(b.startIdx);
  return '';
}

// Helpers for the date-range picker. Default range = current calendar
// month so opening Reports always lands on something meaningful, and
// the user picks a different month via the date inputs.
function firstOfMonth(d) {
  const x = new Date(d); x.setDate(1); x.setHours(0,0,0,0); return x;
}
function lastOfMonth(d) {
  const x = new Date(d.getFullYear(), d.getMonth() + 1, 0); x.setHours(0,0,0,0); return x;
}
// Tap-to-open date pill, same pattern Diary / NewBooking use. Wraps a
// native date input with our brand-styled chrome so taps reliably
// trigger the OS picker on every browser.
function DatePill({ value, onChange, label, loc = 'en-IN' }) {
  const ref = useRef(null);
  const open = () => {
    const el = ref.current;
    if (el && typeof el.showPicker === 'function') {
      try { el.showPicker(); } catch {}
    }
  };
  const filled = !!value;
  const display = filled
    ? new Date(value + 'T00:00:00').toLocaleDateString(loc, { day: '2-digit', month: 'short', year: 'numeric' })
    : label;
  return (
    <div
      onClick={open}
      style={{
        flex: 1, position: 'relative', height: 38,
        background: filled ? T.primaryLt : T.bgSoft,
        border: `1px solid ${filled ? T.primary : T.border}`,
        borderRadius: 8, cursor: 'pointer', minWidth: 0,
      }}
    >
      <input
        ref={ref}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer', border: 'none', padding: 0 }}
      />
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px', pointerEvents: 'none', fontSize: 12, fontWeight: 700, color: filled ? T.primaryDk : T.ink2, whiteSpace: 'nowrap', overflow: 'hidden' }}>
        <Icon name="cal" size={12} color={filled ? T.primaryDk : T.ink2} />
        {display}
      </div>
    </div>
  );
}

// Two-column label / value row used inside the Take-home breakdown card.
// Lets us colour the subtractive lines (tax + commission) muted and the
// "Net to you" line in the brand colour for emphasis — Row.jsx is fixed.
function BreakdownRow({ label, value, color, bold }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
      <span style={{ fontSize: bold ? 13 : 11.5, color, fontWeight: bold ? 700 : 600 }}>{label}</span>
      <span className="tnum" style={{ fontSize: bold ? 16 : 12, color, fontWeight: bold ? 800 : 700, letterSpacing: bold ? -0.3 : 0 }}>{value}</span>
    </div>
  );
}

function KPI({ label, value, sub, icon, color }) {
  return (
    <Card padding={14}>
      <div style={{
        width: 28, height: 28, borderRadius: 8,
        background: `color-mix(in oklch, ${color} 14%, white)`, color,
        display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10,
      }}>
        <Icon name={icon} size={14} stroke={2} />
      </div>
      <div className="tnum" style={{ fontSize: 18, fontWeight: 700, color: T.ink, letterSpacing: -0.4 }}>{value}</div>
      <div style={{ fontSize: 11, color: T.ink3, fontWeight: 600, marginTop: 2 }}>{label}</div>
      {sub && (
        <div className="tnum" style={{ fontSize: 10, color: T.ink3, fontWeight: 600, marginTop: 2 }}>{sub}</div>
      )}
    </Card>
  );
}

// Format a rupee figure compactly: ₹1.2L for lakhs, ₹52k for thousands, raw otherwise.
function fmtINR(n) {
  if (!n || n < 0) return '₹0';
  if (n >= 100000) return '₹' + (n / 100000).toFixed(n >= 1000000 ? 0 : 1) + 'L';
  if (n >= 1000) return '₹' + Math.round(n / 1000) + 'k';
  return '₹' + Math.round(n).toLocaleString('en-IN');
}

// Default expense categories — keep in sync with src/screens/Expenses.jsx
// DEFAULT_CATEGORIES. Duplicated here (rather than imported) because
// Reports only needs the label lookup, not the full category metadata.
const EXPENSE_CATEGORY_LABELS = {
  groceries: 'Groceries', salaries: 'Salaries', utilities: 'Utilities',
  maintenance: 'Maintenance', supplies: 'Supplies', transport: 'Transport',
  marketing: 'Marketing', other: 'Other',
};

// Two-column row used inside every PnLCard breakdown block. Used for
// channel/method/category lists where every row is "label · amount".
function PnLRow({ label, value, color, faint, dim, strong }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, padding: '3px 0' }}>
      <span style={{ fontSize: 11.5, color: color || (faint ? T.ink3 : T.ink2), fontWeight: strong ? 700 : 600 }}>{label}</span>
      <span className="tnum" style={{ fontSize: strong ? 13 : 12, color: dim ? T.ink3 : (color || T.ink), fontWeight: strong ? 800 : 700 }}>{value}</span>
    </div>
  );
}

function PnLBreakdownBlock({ title, accent, rows, total, totalLabel, totalNegative, t }) {
  if (!rows || rows.length === 0) {
    return (
      <div style={{ padding: '10px 12px', background: T.bgSoft, borderRadius: 8 }}>
        <div style={{ fontSize: 10, color: T.ink3, fontWeight: 700, letterSpacing: 0.4, marginBottom: 6 }}>{title}</div>
        <div style={{ fontSize: 11, color: T.ink3, fontStyle: 'italic' }}>{t('pnlNoActivity')}</div>
      </div>
    );
  }
  return (
    <div style={{ padding: '10px 12px', background: T.bgSoft, borderRadius: 8 }}>
      <div style={{ fontSize: 10, color: accent || T.ink3, fontWeight: 700, letterSpacing: 0.4, marginBottom: 6 }}>{title}</div>
      {rows.map((r) => (
        <PnLRow key={r.id} label={r.label} value={r.value} />
      ))}
      {total !== undefined && (
        <div style={{ borderTop: `1px solid ${T.borderSoft}`, paddingTop: 5, marginTop: 4 }}>
          <PnLRow
            label={totalLabel || t('total')}
            value={(totalNegative ? '− ' : '') + (typeof total === 'string' ? total : ('₹' + Math.round(Math.abs(total)).toLocaleString('en-IN')))}
            color={totalNegative ? T.danger : T.primaryDk}
            strong
          />
        </div>
      )}
    </div>
  );
}

// The full P&L card. Slots between the KPI tiles and the existing
// Take-home breakdown on the Reports screen.
function PnLCard({ pnl, rangeLabel, rangeStart, rangeEnd, property, expenseCategories, t }) {
  const [showAllDays, setShowAllDays] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(true);
  const customCatLabels = useMemo(() => {
    const o = {};
    (expenseCategories || []).forEach(c => { o[c.id] = c.label; });
    return o;
  }, [expenseCategories]);
  const labelForCategory = (id) => EXPENSE_CATEGORY_LABELS[id] || customCatLabels[id] || id;

  const incomeRows = pnl.incomeMethods
    .map(m => ({ id: m.id, label: m.label, raw: pnl.incomeByMethod[m.id] || 0 }))
    .filter(r => r.raw !== 0)
    .map(r => ({ ...r, value: (r.raw < 0 ? '− ' : '') + '₹' + Math.abs(Math.round(r.raw)).toLocaleString('en-IN') }));
  const expenseMethodRows = pnl.expenseMethods
    .map(m => ({ id: m.id, label: m.label, raw: pnl.expenseByMethod[m.id] || 0 }))
    .filter(r => r.raw !== 0)
    .map(r => ({ ...r, value: '₹' + Math.round(r.raw).toLocaleString('en-IN') }));
  // Income by channel — pull labels from CHANNELS so OTAs show with
  // their real names (MakeMyTrip / Booking.com / etc). Unknown channels
  // fall through to their raw id.
  const channelRows = Object.entries(pnl.incomeByChannel)
    .filter(([, v]) => v !== 0)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .map(([id, v]) => ({
      id,
      label: (CHANNELS[id] && CHANNELS[id].label) || id,
      raw: v,
      value: (v < 0 ? '− ' : '') + '₹' + Math.abs(Math.round(v)).toLocaleString('en-IN'),
    }));
  const expenseCatRows = Object.entries(pnl.expenseByCategory)
    .filter(([, v]) => v !== 0)
    .sort((a, b) => b[1] - a[1])
    .map(([id, v]) => ({ id, label: labelForCategory(id), raw: v, value: '₹' + Math.round(v).toLocaleString('en-IN') }));

  // Per-day rows — full list (every day in the range) or just days
  // with activity, depending on the toggle. Default to "with activity"
  // because most months have a handful of payment / expense days.
  const allDayRows = pnl.days;
  const visibleDays = showAllDays ? allDayRows : allDayRows.filter(d => d.income !== 0 || d.expense !== 0);
  const noActivity = visibleDays.length === 0;

  const dlCsv = () => {
    // Per-day rows first, then the four breakdown blocks as labelled
    // summary sections. Single file because hoteliers asked for "one
    // clear report".
    const rows = [];
    for (const d of allDayRows) {
      rows.push([d.iso, d.income, d.expense, d.profit]);
    }
    rows.push([]);
    rows.push([`Period: ${rangeStart} → ${rangeEnd}`]);
    rows.push(['Total income',   '', '', pnl.totalIncome]);
    rows.push(['Total expense',  '', '', pnl.totalExpense]);
    rows.push(['Net profit',     '', '', pnl.totalProfit]);

    rows.push([]);
    rows.push(['INCOME BY SOURCE / CHANNEL']);
    rows.push(['Channel', 'Amount (₹)']);
    channelRows.forEach(r => rows.push([r.label, r.raw]));

    rows.push([]);
    rows.push(['INCOME BY PAYMENT METHOD']);
    rows.push(['Method', 'Amount (₹)']);
    incomeRows.forEach(r => rows.push([r.label, r.raw]));

    rows.push([]);
    rows.push(['EXPENSE BY CATEGORY']);
    rows.push(['Category', 'Amount (₹)']);
    expenseCatRows.forEach(r => rows.push([r.label, r.raw]));

    rows.push([]);
    rows.push(['EXPENSE BY PAYMENT METHOD']);
    rows.push(['Method', 'Amount (₹)']);
    expenseMethodRows.forEach(r => rows.push([r.label, r.raw]));

    const header = ['Date', 'Income (₹)', 'Expense (₹)', 'Profit (₹)'];
    downloadCsv(`atithi-profit-loss-${rangeStart}-to-${rangeEnd}`, buildCsv(header, rows));
  };

  const profitColor = pnl.totalProfit >= 0 ? T.ok : T.danger;
  return (
    <Card padding={14} style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: `color-mix(in oklch, ${T.primary} 14%, white)`, color: T.primaryDk, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="chart" size={14} stroke={2} />
        </div>
        <span style={{ fontSize: 12, fontWeight: 700, color: T.primaryDk, letterSpacing: 0.2 }}>{t('pnlTitle')}</span>
      </div>

      {/* Headline number — net profit for the period. Avg / day is a
          useful second-glance number when the range is multi-day. */}
      <div className="tnum" style={{ fontSize: 28, fontWeight: 800, color: profitColor, letterSpacing: -0.5, marginBottom: 2 }}>
        {pnl.totalProfit < 0 ? '−' : ''}₹{Math.abs(Math.round(pnl.totalProfit)).toLocaleString('en-IN')}
      </div>
      <div style={{ fontSize: 11, color: T.ink3, fontWeight: 600, marginBottom: 12 }}>
        {t('pnlNetProfit')} · {pnl.daysWithActivity} {t('pnlActiveDays')} · {t('average')} {pnl.avgDaily < 0 ? '−' : ''}₹{Math.abs(Math.round(pnl.avgDaily)).toLocaleString('en-IN')}{t('pnlPerDay')}
      </div>

      {/* Three-stat strip: total income, total expense, net profit.
          Big enough to read at a glance, small enough not to dominate
          the card the way the headline number does. */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
        <div style={{ padding: '8px 10px', background: 'color-mix(in oklch, oklch(58% 0.13 155) 9%, white)', borderRadius: 7 }}>
          <div className="tnum" style={{ fontSize: 16, fontWeight: 800, color: 'oklch(35% 0.14 155)', letterSpacing: -0.3 }}>₹{Math.round(pnl.totalIncome).toLocaleString('en-IN')}</div>
          <div style={{ fontSize: 9.5, color: 'oklch(40% 0.10 155)', fontWeight: 700, letterSpacing: 0.3, marginTop: 1 }}>{t('pnlIncome')}</div>
        </div>
        <div style={{ padding: '8px 10px', background: 'color-mix(in oklch, oklch(60% 0.14 30) 9%, white)', borderRadius: 7 }}>
          <div className="tnum" style={{ fontSize: 16, fontWeight: 800, color: 'oklch(40% 0.14 30)', letterSpacing: -0.3 }}>−₹{Math.round(pnl.totalExpense).toLocaleString('en-IN')}</div>
          <div style={{ fontSize: 9.5, color: 'oklch(40% 0.14 30)', fontWeight: 700, letterSpacing: 0.3, marginTop: 1 }}>{t('pnlExpense')}</div>
        </div>
        <div style={{ padding: '8px 10px', background: `color-mix(in oklch, ${profitColor} 11%, white)`, borderRadius: 7 }}>
          <div className="tnum" style={{ fontSize: 16, fontWeight: 800, color: profitColor, letterSpacing: -0.3 }}>{pnl.totalProfit < 0 ? '−' : ''}₹{Math.abs(Math.round(pnl.totalProfit)).toLocaleString('en-IN')}</div>
          <div style={{ fontSize: 9.5, color: profitColor, fontWeight: 700, letterSpacing: 0.3, marginTop: 1 }}>{t('pnlNetProfitCap')}</div>
        </div>
      </div>

      {/* Toggle to hide the breakdowns for a compact view. Default
          open because the breakdowns are the whole point of this card. */}
      <button
        onClick={() => setShowBreakdown(s => !s)}
        style={{ width: '100%', padding: '6px 0', background: 'none', border: 'none', cursor: 'pointer', color: T.ink3, fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginBottom: 8 }}
      >
        <Icon name={showBreakdown ? 'chevU' : 'chevD'} size={11} color={T.ink3} />
        {showBreakdown ? t('pnlHideBreakdown') : t('pnlShowBreakdown')}
      </button>

      {showBreakdown && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
          <PnLBreakdownBlock t={t} title={t('pnlIncomeBySource')} accent="oklch(40% 0.10 155)" rows={channelRows} total={pnl.totalIncome} totalLabel={t('pnlTotalIncome')} />
          <PnLBreakdownBlock t={t} title={t('pnlIncomeByMethod')} accent="oklch(40% 0.10 155)" rows={incomeRows}  total={pnl.totalIncome} totalLabel={t('pnlTotalIncome')} />
          <PnLBreakdownBlock t={t} title={t('pnlExpenseByCategory')} accent="oklch(40% 0.14 30)" rows={expenseCatRows}    total={pnl.totalExpense} totalLabel={t('pnlTotalExpense')} totalNegative />
          <PnLBreakdownBlock t={t} title={t('pnlExpenseByMethod')}   accent="oklch(40% 0.14 30)" rows={expenseMethodRows} total={pnl.totalExpense} totalLabel={t('pnlTotalExpense')} totalNegative />
        </div>
      )}

      {/* Per-day table — "profit for each day when available". Defaults
          to days with any activity to keep the list short on a quiet
          month; toggle to show every date in the range. */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, marginBottom: 6 }}>
        <span style={{ fontSize: 10, color: T.ink3, fontWeight: 700, letterSpacing: 0.4 }}>{t('pnlPerDayBreakdown')}</span>
        <button
          onClick={() => setShowAllDays(s => !s)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.primary, fontSize: 10.5, fontWeight: 700 }}
        >
          {showAllDays ? t('pnlActiveDaysOnly') : `${t('pnlShowAll')} ${allDayRows.length} ${t('repDays')}`}
        </button>
      </div>
      {noActivity ? (
        <div style={{ padding: '14px 12px', background: T.bgSoft, borderRadius: 8, fontSize: 11.5, color: T.ink3, fontStyle: 'italic', textAlign: 'center' }}>
          {t('pnlNoneRecorded')}
        </div>
      ) : (
        <div style={{ background: T.bgSoft, borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 1fr', gap: 0, padding: '6px 10px', background: 'color-mix(in oklch, ' + T.primaryDk + ' 7%, white)', fontSize: 9, fontWeight: 800, color: T.ink3, letterSpacing: 0.4 }}>
            <span>{t('colDate')}</span>
            <span style={{ textAlign: 'right' }}>{t('colIncome')}</span>
            <span style={{ textAlign: 'right' }}>{t('colExpense')}</span>
            <span style={{ textAlign: 'right' }}>{t('colProfit')}</span>
          </div>
          <div style={{ maxHeight: 220, overflowY: 'auto' }}>
            {visibleDays.map(d => {
              const dateObj = new Date(d.iso + 'T00:00:00');
              const isToday = d.iso === ymd(new Date(ANCHOR));
              const dayLabel = dateObj.toLocaleDateString(dateLoc(t), { day: '2-digit', month: 'short' });
              const dowLabel = dateObj.toLocaleDateString(dateLoc(t), { weekday: 'short' });
              const pColor = d.profit > 0 ? T.ok : d.profit < 0 ? T.danger : T.ink3;
              return (
                <div
                  key={d.iso}
                  style={{
                    display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 1fr', gap: 0,
                    padding: '7px 10px',
                    borderTop: `1px solid ${T.borderSoft}`,
                    background: isToday ? T.primaryLt : 'transparent',
                  }}
                >
                  <span style={{ fontSize: 11, color: T.ink, fontWeight: isToday ? 700 : 600 }}>
                    {dayLabel} <span style={{ color: T.ink3, fontWeight: 600 }}>· {dowLabel}</span>
                    {isToday && <span style={{ marginLeft: 4, color: T.primaryDk, fontSize: 9, fontWeight: 800, letterSpacing: 0.3 }}>{t('today')}</span>}
                  </span>
                  <span className="tnum" style={{ fontSize: 11, color: d.income > 0 ? T.ink : T.ink3, fontWeight: 700, textAlign: 'right' }}>
                    {d.income === 0 ? '—' : (d.income < 0 ? '−' : '') + '₹' + Math.abs(Math.round(d.income)).toLocaleString('en-IN')}
                  </span>
                  <span className="tnum" style={{ fontSize: 11, color: d.expense > 0 ? T.ink : T.ink3, fontWeight: 700, textAlign: 'right' }}>
                    {d.expense === 0 ? '—' : '−₹' + Math.round(d.expense).toLocaleString('en-IN')}
                  </span>
                  <span className="tnum" style={{ fontSize: 11.5, color: pColor, fontWeight: 800, textAlign: 'right' }}>
                    {d.profit === 0 ? '—' : (d.profit < 0 ? '−' : '+') + '₹' + Math.abs(Math.round(d.profit)).toLocaleString('en-IN')}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <button
        onClick={dlCsv}
        style={{
          marginTop: 10, width: '100%', padding: '8px 10px', borderRadius: 8,
          border: `1px solid ${T.border}`, background: T.card, color: T.primary,
          fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}
      >
        <Icon name="download" size={12} stroke={2} color={T.primary} />
        {t('pnlDownloadCsv')}
      </button>
    </Card>
  );
}

export default function Reports({ go, t, bookings = [], plan = 'engine', property, expenses = [], session, propertyId }) {
  // Snackbar state for the "Sent to CA" / "Send failed" toast. Auto-
  // dismisses after 5s. Kept local since it only fires from one place.
  const [sendStatus, setSendStatus] = useState(null);
  // { kind: 'ok' | 'err' | 'fallback', message }
  // Ref to the Downloadable-reports card so the header Export button
  // scrolls to it reliably (was matching on hardcoded heading text,
  // which would silently break if the heading was ever translated).
  const downloadsRef = useRef(null);
  const ROOM_TYPES = useMemo(() => effectiveRoomTypes(property), [property]);
  const issuedInvoices = useMemo(() => listIssuedInvoices(bookings, property), [bookings, property]);
  const caEmail = property?.accountant?.email || '';

  // Date-range state — defaults to the current calendar month so the
  // first thing a hotelier sees is "this month". They can pick any
  // arbitrary range; all KPIs + CSV downloads honor it. Stored as ISO
  // strings (yyyy-mm-dd) for the native date inputs.
  const today = new Date(ANCHOR);
  const [rangeStart, setRangeStart] = useState(() => ymd(firstOfMonth(today)));
  const [rangeEnd, setRangeEnd] = useState(() => ymd(lastOfMonth(today)));
  // Convert the ISO range to day-idx [start, end] (end inclusive).
  const rangeStartIdx = dateToIdx(rangeStart);
  const rangeEndIdx = dateToIdx(rangeEnd);
  // Number of days in the inclusive range. Used for available-room-night
  // math + the CSV row count.
  const rangeDays = Math.max(1, (rangeEndIdx - rangeStartIdx) + 1);
  // Pretty label for the picker subtitle ("May 2026" / "Apr 1 – Jun 30 2026")
  const rangeLabel = (() => {
    const s = new Date(rangeStart + 'T00:00:00');
    const e = new Date(rangeEnd + 'T00:00:00');
    const sameMonth = s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth();
    if (sameMonth) return s.toLocaleDateString(dateLoc(t), { month: 'long', year: 'numeric' });
    const sameYear = s.getFullYear() === e.getFullYear();
    if (sameYear) return `${s.toLocaleDateString(dateLoc(t), { day: '2-digit', month: 'short' })} – ${e.toLocaleDateString(dateLoc(t), { day: '2-digit', month: 'short', year: 'numeric' })}`;
    return `${s.toLocaleDateString(dateLoc(t), { day: '2-digit', month: 'short', year: 'numeric' })} – ${e.toLocaleDateString(dateLoc(t), { day: '2-digit', month: 'short', year: 'numeric' })}`;
  })();
  // Shortcut buttons jump the range to a common preset.
  const setRangeToMonth = (delta = 0) => {
    const ref = new Date(today.getFullYear(), today.getMonth() + delta, 1);
    setRangeStart(ymd(firstOfMonth(ref)));
    setRangeEnd(ymd(lastOfMonth(ref)));
  };
  const setRangeToFinancialYear = () => {
    // Indian FY runs Apr 1 → Mar 31. If we're in Jan / Feb / Mar, the
    // "current" FY started last calendar year.
    const fyStartYear = today.getMonth() < 3 ? today.getFullYear() - 1 : today.getFullYear();
    setRangeStart(ymd(new Date(fyStartYear, 3, 1)));
    setRangeEnd(ymd(new Date(fyStartYear + 1, 2, 31)));
  };

  // True when the booking's stay overlaps the picked range. Used to
  // scope every stat below. A booking that starts on rangeEndIdx + 1
  // (after the range) doesn't count; one that started before but
  // overlaps the first day of the range DOES count for that day's
  // occupancy + revenue.
  const overlapsRange = (b) => {
    const bStart = b.startIdx || 0;
    const bEnd = bStart + (b.nights || 1);
    return bStart <= rangeEndIdx && bEnd > rangeStartIdx;
  };

  // Send the invoice register to the CA. Prefers the Resend-backed
  // serverless function (api/send-to-ca.js) so the CA gets a fully
  // formatted email with the register inline — no manual attach
  // step. Falls back to the legacy mailto + print workflow when the
  // backend isn't configured yet (RESEND_API_KEY missing) or the
  // call fails for any reason.
  const handleSendToCA = async () => {
    // Inline snackbar (not native alert) — matches the rest of the
    // app and doesn't show the scary "atithi-seven.vercel.app says:"
    // browser chrome to a non-technical hotelier.
    if (issuedInvoices.length === 0) {
      setSendStatus({ kind: 'err', message: t('snackNoInvoices') });
      setTimeout(() => setSendStatus(null), 6000);
      return;
    }
    if (!caEmail) {
      setSendStatus({ kind: 'err', message: t('snackAddCaEmail') });
      setTimeout(() => setSendStatus(null), 6000);
      return;
    }
    // Try Resend first (requires signed-in user + configured backend).
    if (session && propertyId) {
      setSendStatus({ kind: 'sending', message: `${t('snackSending')} ${issuedInvoices.length} ${t('snackInvoicesTo')} ${caEmail}…` });
      const result = await sendInvoiceListViaResend({
        invoices: issuedInvoices,
        property,
        propertyId,
        session,
      });
      if (result.ok) {
        setSendStatus({ kind: 'ok', message: `${t('snackSentTo')} ${caEmail}. ${t('snackSentOk')}` });
        setTimeout(() => setSendStatus(null), 6000);
        return;
      }
      // Specific helpful messages for the common fail modes.
      if (result.code === 'no_resend') {
        setSendStatus({ kind: 'fallback', message: t('snackNoResend') });
      } else if (result.code === 'no_session') {
        setSendStatus({ kind: 'fallback', message: t('snackNoSession') });
      } else {
        setSendStatus({ kind: 'fallback', message: t('snackSendFailed') + ' ' + (result.error || '') });
      }
      setTimeout(() => setSendStatus(null), 8000);
    }
    // Fallback path (always runs when direct send is unavailable).
    exportInvoiceList(bookings, property);
    setTimeout(() => emailToAccountant(issuedInvoices, property), 600);
  };
  const stats = useMemo(() => {
    const active = bookings.filter(b => b.status !== 'cancelled' && overlapsRange(b));
    const totalUnits = ROOM_TYPES.reduce((s, r) => s + r.units, 0);

    // Revenue = sum of paid (cash collected). Total billed is shown as a sub-label.
    // All money figures are over the picked range only.
    const revenue = active.reduce((s, b) => s + (b.paid || 0), 0);
    const billed = active.reduce((s, b) => s + (b.total || 0), 0);

    // GST-applicable subset (channel-based default, per-booking override).
    const gstBookings = active.filter(bookingGstApplies);
    const reportedRevenue = gstBookings.reduce((s, b) => s + (b.paid || 0), 0);
    const reportedBilled = gstBookings.reduce((s, b) => s + (b.total || 0), 0);
    // Sum GST per booking using its blended slab rate (5% mid-tier / 18%
    // luxury post 22 Sep 2025), treating each booking's total as
    // GST-inclusive. Previously hardcoded as flat 12%.
    const gstCollected = gstBookings.reduce((s, b) => {
      const rate = blendedGstRate(b, property);
      return s + Math.round((b.total || 0) * rate / (100 + rate));
    }, 0);
    const unreported = revenue - reportedRevenue;

    // Net to the hotelier after tax + commission removed from every active
    // booking. This is the cash the property actually keeps — the number
    // the owner asked to see alongside gross so they can judge real profit.
    // Surfaced only on Channels / Invoicing tiers (Engine has no OTA
    // commissions to subtract — direct rate IS the take-home).
    let totalTax = 0;
    let totalCommission = 0;
    for (const b of active) {
      const { tax, commission } = bookingNetAmount(b, property);
      totalTax += tax;
      totalCommission += commission;
    }
    const netRevenue = Math.max(0, billed - totalTax - totalCommission);

    // Occupancy across the picked range. For each day in the range,
    // count every ROOM occupied that day — a multi-room booking holds
    // roomItems.length rooms, not 1. Counting bookings (.length) instead
    // of rooms under-counted occupancy %, and skewed ADR (denominator
    // too small → inflated) + RevPAR for any multi-room or widget
    // booking. This now matches the occupancy CSV export's room-level
    // count.
    const roomsHeld = (b) => (Array.isArray(b.roomItems) && b.roomItems.length) ? b.roomItems.length : 1;
    const dailyOccupied = [];
    for (let i = 0; i < rangeDays; i++) {
      const dayIdx = rangeStartIdx + i;
      const n = active
        .filter(b => (b.startIdx || 0) <= dayIdx && dayIdx < (b.startIdx || 0) + (b.nights || 1))
        .reduce((s, b) => s + roomsHeld(b), 0);
      dailyOccupied.push(n);
    }
    const occupiedRoomNights = dailyOccupied.reduce((s, v) => s + v, 0);
    const availableRoomNights = totalUnits * rangeDays;
    const avgOccPct = availableRoomNights ? Math.round((occupiedRoomNights / availableRoomNights) * 100) : 0;

    // ADR / RevPAR use revenue CLIPPED to the range: a booking that only
    // partially overlaps contributes only its in-range nights' share of the
    // total (total × inRangeNights / nights), so a long stay bisected by a
    // short range no longer inflates the average against the already
    // range-clipped room-night denominators.
    const clippedNights = (b) => {
      const s = Math.max(rangeStartIdx, b.startIdx || 0);
      const e = Math.min(rangeStartIdx + rangeDays, (b.startIdx || 0) + (b.nights || 1));
      return Math.max(0, e - s);
    };
    const billedInRange = active.reduce((s, b) => s + (b.total || 0) * (clippedNights(b) / (b.nights || 1)), 0);
    const adr = occupiedRoomNights ? Math.round(billedInRange / occupiedRoomNights) : 0;
    const revpar = availableRoomNights ? Math.round(billedInRange / availableRoomNights) : 0;

    const dailyOccPct = dailyOccupied.map(n => totalUnits ? Math.round((n / totalUnits) * 100) : 0);

    // Per-room-type revenue share, sorted high → low.
    const byType = ROOM_TYPES.map(rt => {
      const rev = active.filter(b => b.roomTypeId === rt.id).reduce((s, b) => s + (b.total || 0), 0);
      return { ...rt, rev };
    }).sort((a, b) => b.rev - a.rev);
    const topRevenue = byType[0]?.rev || 1;

    const formC = active.filter(b => b.formC).length;

    // Bookings that would go into a month-end invoice export to the CA.
    // Excludes tentative holds. Bookings with payment gaps need to be reconciled
    // before invoices can be finalised.
    const invoiceable = active.filter(b => b.status !== 'tentative');
    const reconciliationGaps = invoiceable.filter(b =>
      (b.status === 'checkedin' || b.status === 'checkout') && (b.paid || 0) < (b.total || 0)
    );
    // idx 0 is today in the new anchor model; an overdue arrival is any
    // confirmed booking whose start date is on/before today with balance
    // still due.
    const overdueArrivals = invoiceable.filter(b =>
      b.status === 'confirmed' && b.startIdx <= 0 && (b.paid || 0) < (b.total || 0)
    );
    const gapCount = reconciliationGaps.length + overdueArrivals.length;
    const gapAmount = [...reconciliationGaps, ...overdueArrivals].reduce((s, b) => s + (b.total - b.paid), 0);

    // Expenses inside the picked range. Range-filter by expense date
    // (YYYY-MM-DD); a stay-overlap check makes no sense here because
    // expenses are point-in-time, not stays.
    const expensesInRange = (expenses || []).filter(e => e.date >= rangeStart && e.date <= rangeEnd);
    const totalExpenses = expensesInRange.reduce((s, e) => s + (e.amount || 0), 0);
    const netAfterExpenses = Math.max(0, netRevenue - totalExpenses);

    return { revenue, billed, reportedRevenue, reportedBilled, unreported, gstCount: gstBookings.length, avgOccPct, adr, revpar, dailyOccPct, byType, topRevenue, formC, gstCollected, totalUnits, invoiceableCount: invoiceable.length, gapCount, gapAmount, netRevenue, totalTax, totalCommission, rangeDays, totalExpenses, netAfterExpenses, expensesCount: expensesInRange.length };
  }, [bookings, ROOM_TYPES, rangeStartIdx, rangeEndIdx, rangeDays, property, expenses, rangeStart, rangeEnd]);

  // Daily Profit & Loss. Separate from `stats` to keep the mental model
  // clean: stats is the existing KPI bag (occupancy, ADR, etc) that the
  // owner already knows; pnl is the new cash-in / cash-out / profit
  // breakdown that maps to how a small hotelier actually tracks money.
  //
  // Date-attribution rules:
  //   - Income → the day the payment was collected (payment.dateIso),
  //     not the day the booking was made or the day of stay. So a
  //     guest who paid ₹5,000 advance on 1 May for a 10-15 May stay
  //     shows that ₹5k on 1 May's income row.
  //   - Expense → the day the expense was logged (expense.date).
  //   - Refunds + credit notes subtract from income.
  //
  // Cancelled bookings are excluded — their payments would have been
  // refunded already (and those refund rows are still counted via the
  // refund-as-negative-income rule above).
  const pnl = useMemo(() => {
    const customMethods = (property?.accountant?.customPaymentMethods || []).map(m => ({ id: m.id, label: m.label }));
    const incomeMethods = [...INCOME_METHOD_DEFAULTS, ...customMethods];
    const incomeMethodIds = new Set(incomeMethods.map(m => m.id));
    const expenseMethods = [...EXPENSE_METHOD_DEFAULTS];
    const expenseMethodIds = new Set(expenseMethods.map(m => m.id));

    // Per-day buckets keyed by iso date for fast lookup. Pre-seed every
    // day in the range so the per-day table renders even days with no
    // activity (which is itself useful — "we made nothing on 12 May").
    const dayLookup = {};
    const days = [];
    for (let i = 0; i < rangeDays; i++) {
      const iso = idxToDate(rangeStartIdx + i);
      const row = { iso, income: 0, expense: 0, profit: 0 };
      days.push(row);
      dayLookup[iso] = row;
    }

    const incomeByChannel = {}; // { direct: ₹, mmt: ₹, ... }
    const incomeByMethod = {};  // { cash: ₹, upi: ₹, ... + custom }
    let totalIncome = 0;
    for (const b of bookings) {
      if (b.status === 'cancelled') continue;
      const channel = b.channel || 'direct';
      for (const p of (b.payments || [])) {
        const payIso = payIsoFor(p, b);
        if (!payIso) continue;
        if (payIso < rangeStart || payIso > rangeEnd) continue;
        const signed = (p.kind === 'refund' || p.kind === 'credit' || p.kind === 'credit_note')
          ? -(p.amount || 0)
          : (p.amount || 0);
        if (dayLookup[payIso]) dayLookup[payIso].income += signed;
        incomeByChannel[channel] = (incomeByChannel[channel] || 0) + signed;
        const m = incomeMethodIds.has(p.method) ? p.method : (p.method || 'other');
        incomeByMethod[m] = (incomeByMethod[m] || 0) + signed;
        totalIncome += signed;
      }
    }

    const expenseByCategory = {};
    const expenseByMethod = {};
    let totalExpense = 0;
    for (const e of (expenses || [])) {
      if (!e.date) continue;
      if (e.date < rangeStart || e.date > rangeEnd) continue;
      const amt = e.amount || 0;
      if (dayLookup[e.date]) dayLookup[e.date].expense += amt;
      const cat = e.category || 'other';
      expenseByCategory[cat] = (expenseByCategory[cat] || 0) + amt;
      const m = expenseMethodIds.has(e.paidVia) ? e.paidVia : (e.paidVia || 'cash');
      expenseByMethod[m] = (expenseByMethod[m] || 0) + amt;
      totalExpense += amt;
    }
    for (const d of days) d.profit = d.income - d.expense;
    const totalProfit = totalIncome - totalExpense;
    const avgDaily = rangeDays ? totalProfit / rangeDays : 0;
    const daysWithActivity = days.filter(d => d.income !== 0 || d.expense !== 0).length;

    return {
      days, totalIncome, totalExpense, totalProfit, avgDaily, daysWithActivity,
      incomeByChannel, incomeByMethod, expenseByCategory, expenseByMethod,
      incomeMethods, expenseMethods,
    };
  }, [bookings, expenses, rangeStart, rangeEnd, rangeStartIdx, rangeDays, property]);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: T.bg }}>
      <ScreenHeader title={t('reportsTitle')} subtitle={`${rangeLabel} · ${stats.totalUnits} ${t('repUnits')} · ${stats.rangeDays} ${t('repDays')}`} onBack={() => go('home')}
        right={<Btn size="sm" variant="ghost" icon="download" onClick={() => {
          // Scroll to the Downloadable-reports card via ref (robust
          // to heading translation, unlike the old DOM-text match).
          if (downloadsRef.current) downloadsRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }}>{t('exportLabel')}</Btn>}
      />
      <div style={{ flex: 1, overflow: 'auto', padding: 16, paddingBottom: 100 }}>
        {/* Date-range picker — defaults to current calendar month. All
            KPIs + CSV exports below honor whatever is picked here. */}
        <Card padding={12} style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, color: T.ink3, fontWeight: 700, letterSpacing: 0.4, marginBottom: 8 }}>{t('reportPeriod')}</div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <DatePill value={rangeStart} onChange={setRangeStart} label={t('rangeFrom')} loc={dateLoc(t)} />
            <span style={{ color: T.ink3, fontSize: 13, fontWeight: 700, alignSelf: 'center' }}>→</span>
            <DatePill value={rangeEnd} onChange={setRangeEnd} label={t('rangeTo')} loc={dateLoc(t)} />
          </div>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {[
              {
                id: 'today', label: t('today'),
                onClick: () => {
                  const iso = ymd(new Date(ANCHOR));
                  setRangeStart(iso); setRangeEnd(iso);
                },
              },
              { id: 'thismonth', label: t('presetThisMonth'), onClick: () => setRangeToMonth(0) },
              { id: 'lastmonth', label: t('presetLastMonth'), onClick: () => setRangeToMonth(-1) },
              { id: 'fy',        label: t('presetThisFY'),    onClick: setRangeToFinancialYear },
              {
                id: 'next14',    label: t('presetNext14'),
                onClick: () => {
                  setRangeStart(ymd(new Date(ANCHOR)));
                  const e = new Date(ANCHOR);
                  e.setDate(e.getDate() + 13);
                  setRangeEnd(ymd(e));
                },
              },
            ].map(p => (
              <button
                key={p.id}
                onClick={p.onClick}
                style={{
                  padding: '4px 9px', borderRadius: 999,
                  border: `1px solid ${T.border}`, background: T.card, color: T.ink2,
                  fontSize: 10.5, fontWeight: 700, cursor: 'pointer',
                }}
              >{p.label}</button>
            ))}
          </div>
          {rangeEndIdx < rangeStartIdx && (
            <div style={{ marginTop: 8, fontSize: 11, color: T.danger, fontWeight: 700 }}>
              {t('rangeInvalidEnd')}
            </div>
          )}
        </Card>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
          <KPI label={t('kpiMoneyEarned')} value={fmtINR(stats.revenue)} sub={`${fmtINR(stats.billed)} ${t('kpiBilledSuffix')}`} icon="inr" color={T.primary} />
          <KPI label={t('kpiRoomsFull')} value={`${stats.avgOccPct}%`} sub={`${stats.rangeDays} ${t('repDays')} ${t('average')}`} icon="bed" color={T.indigo} />
          <KPI label={t('kpiPerRoomNight')} value={fmtINR(stats.adr)} sub={t('kpiWhenBooked')} icon="tag" color={T.teal} />
          <KPI label={t('kpiPerRoomDay')} value={fmtINR(stats.revpar)} sub={t('kpiAcrossRooms')} icon="chart" color="oklch(60% 0.14 320)" />
        </div>

        {/* Daily Profit & Loss — the headline cash-in / cash-out card.
            Pure cash basis (payments minus expenses on the dates they
            were collected / paid), unlike the Take-home card below
            which works off billed amount minus tax / OTA commissions /
            expenses. Both are useful: this one answers "how much did
            we actually make this month?", the other answers "what's
            net of every deduction on what we billed?". */}
        <PnLCard t={t} pnl={pnl} rangeLabel={rangeLabel} rangeStart={rangeStart} rangeEnd={rangeEnd} property={property} expenseCategories={(property?.accountant?.expenseCategories) || []} />

        {/* Take-home breakdown (Channels / Invoicing tiers only). Engine
            properties only sell direct, so gross == net minus tax; no need
            to surface OTA commissions. */}
        {plan !== 'engine' && (
          <Card padding={14} style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: 'color-mix(in oklch, oklch(60% 0.14 175) 14%, white)', color: 'oklch(45% 0.14 175)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="inr" size={14} stroke={2} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'oklch(45% 0.14 175)', letterSpacing: 0.2 }}>{t('thTitle')}</span>
            </div>
            <div className="tnum" style={{ fontSize: 26, fontWeight: 700, color: T.ink, letterSpacing: -0.5, marginBottom: 2 }}>{fmtINR(stats.netRevenue)}</div>
            <div style={{ fontSize: 11, color: T.ink3, fontWeight: 600, marginBottom: 12 }}>{t('thKept')}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '10px 12px', background: T.bgSoft, borderRadius: 7 }}>
              <BreakdownRow label={t('thTotalBilled')} value={fmtINR(stats.billed)} color={T.ink2} />
              <BreakdownRow label={t('thGstGov')} value={`− ${fmtINR(stats.totalTax)}`} color={T.ink3} />
              <BreakdownRow label={t('thOtaComm')} value={`− ${fmtINR(stats.totalCommission)}`} color={T.ink3} />
              <div style={{ borderTop: `1px solid ${T.borderSoft}`, paddingTop: 6, marginTop: 4 }}>
                <BreakdownRow label={t('thNetToYou')} value={fmtINR(stats.netRevenue)} color={T.primaryDk} bold />
              </div>
              {stats.totalExpenses > 0 && (
                <>
                  <BreakdownRow label={`${t('thOpExpenses')} (${stats.expensesCount} ${t('expEntries')})`} value={`− ${fmtINR(stats.totalExpenses)}`} color={T.ink3} />
                  <div style={{ borderTop: `1px solid ${T.borderSoft}`, paddingTop: 6, marginTop: 4 }}>
                    <BreakdownRow label={t('thAfterExpenses')} value={fmtINR(stats.netAfterExpenses)} color={T.ok} bold />
                  </div>
                </>
              )}
            </div>
            {stats.totalCommission === 0 && (
              <div style={{ marginTop: 10, fontSize: 10.5, color: T.ink3, lineHeight: 1.4 }}>
                {t('thNoOtaHint')}
              </div>
            )}
          </Card>
        )}

        {/* Downloadable Excel/CSV reports — opens directly in Excel /
            Google Sheets / Numbers. Available to every plan; the
            invoice-register CSV is plan-gated below since it's a
            tax-filing artefact. */}
        <div ref={downloadsRef}>
        <SectionHead title={t('downloadableReports')} />
        <Card padding={0} style={{ marginBottom: 16 }}>
          {(() => {
            const reports = [
              {
                id: 'occupancy',
                icon: 'bed',
                color: T.indigo,
                title: t('rptOccTitle'),
                sub: `${t('rptOccSub')} · ${stats.rangeDays} ${t('repDays')} (${rangeLabel}) ${t('rptOccSubTail')}`,
                onClick: () => {
                  const rows = [];
                  const active = bookings.filter(b => b.status !== 'cancelled');
                  const dowNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                  for (let i = 0; i < stats.rangeDays; i++) {
                    const dayIdx = rangeStartIdx + i;
                    const iso = idxToDate(dayIdx);
                    const dateObj = new Date(iso + 'T00:00:00');
                    const dow = dowNames[dateObj.getDay()];
                    let occupied = 0;
                    const perType = {};
                    for (const rt of ROOM_TYPES) perType[rt.id] = 0;
                    for (const b of active) {
                      if (b.startIdx <= dayIdx && dayIdx < b.startIdx + b.nights) {
                        const items = Array.isArray(b.roomItems) && b.roomItems.length ? b.roomItems : [{ roomTypeId: b.roomTypeId }];
                        for (const it of items) {
                          const tid = it.roomTypeId || b.roomTypeId;
                          if (tid in perType) perType[tid] += 1;
                          occupied += 1;
                        }
                      }
                    }
                    const totalUnits = ROOM_TYPES.reduce((s, r) => s + r.units, 0);
                    const pct = totalUnits ? Math.round((occupied / totalUnits) * 100) : 0;
                    rows.push([iso, dow, occupied, totalUnits, pct + '%', ...ROOM_TYPES.map(rt => perType[rt.id])]);
                  }
                  // Summary footer
                  rows.push([]);
                  rows.push([`Period: ${rangeStart} → ${rangeEnd}`]);
                  rows.push(['Average occupancy', '', '', '', stats.avgOccPct + '%']);
                  rows.push(['ADR (avg daily rate)', '', '', '', '', stats.adr]);
                  rows.push(['RevPAR (revenue per available room)', '', '', '', '', stats.revpar]);
                  const header = ['Date', 'Day', 'Occupied', 'Available', 'Occupancy %', ...ROOM_TYPES.map(rt => rt.name)];
                  downloadCsv(`atithi-occupancy-${rangeStart}-to-${rangeEnd}`, buildCsv(header, rows));
                },
              },
              {
                id: 'payments',
                icon: 'inr',
                color: 'oklch(58% 0.13 155)',
                title: t('rptPayTitle'),
                sub: `${t('rptPaySub')} · ${rangeLabel}`,
                onClick: () => {
                  const rows = [];
                  const methodTotals = {};
                  bookings.forEach(b => {
                    (b.payments || []).forEach(p => {
                      // Range-filter on payment date. Payments without
                      // a date (legacy / synthesized) fall back to the
                      // booking's start date so they're still visible.
                      let payIso = '';
                      if (p.date && p.date !== 'now') {
                        const pd = new Date(p.date);
                        if (!isNaN(pd.getTime())) payIso = ymd(pd);
                      }
                      const fallbackIso = (b.startIdx != null) ? idxToDate(b.startIdx) : '';
                      const effectiveIso = payIso || fallbackIso;
                      if (effectiveIso && (effectiveIso < rangeStart || effectiveIso > rangeEnd)) return;
                      const method = p.method || 'unspecified';
                      const amt = (p.kind === 'refund' || p.kind === 'credit' || p.kind === 'credit_note') ? -(p.amount || 0) : (p.amount || 0);
                      rows.push([
                        effectiveIso || '',
                        b.id, b.guest || '', b.phone || '',
                        method, p.kind || 'payment', amt, p.note || '',
                      ]);
                      methodTotals[method] = (methodTotals[method] || 0) + amt;
                    });
                  });
                  // Sort by date
                  rows.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
                  // Summary footer per method
                  if (Object.keys(methodTotals).length) {
                    rows.push([]);
                    rows.push([`Period: ${rangeStart} → ${rangeEnd}`]);
                    rows.push(['SUMMARY BY METHOD']);
                    Object.entries(methodTotals).forEach(([m, total]) => {
                      rows.push(['', '', '', '', m, '', total]);
                    });
                  }
                  const header = ['Date', 'Booking ID', 'Guest', 'Phone', 'Method', 'Kind', 'Amount (₹)', 'Note'];
                  downloadCsv(`atithi-payments-${rangeStart}-to-${rangeEnd}`, buildCsv(header, rows));
                },
              },
              {
                id: 'ota',
                icon: 'sync',
                color: 'oklch(60% 0.16 38)',
                title: t('rptOtaTitle'),
                sub: `${t('rptOtaSub')} · ${rangeLabel}`,
                onClick: () => {
                  const rows = [];
                  const channelTotals = {};
                  bookings.filter(b => b.status !== 'cancelled' && overlapsRange(b)).forEach(b => {
                    const ch = b.channel || 'direct';
                    const label = (CHANNELS[ch] && CHANNELS[ch].label) || ch;
                    rows.push([
                      b.id, b.guest || '', label,
                      b.startIdx != null ? idxToDate(b.startIdx) : '',
                      b.nights || 1,
                      b.total || 0, b.paid || 0, (b.total || 0) - (b.paid || 0),
                      b.status, b.formC ? 'yes' : 'no',
                    ]);
                    channelTotals[label] = channelTotals[label] || { count: 0, total: 0, paid: 0 };
                    channelTotals[label].count += 1;
                    channelTotals[label].total += b.total || 0;
                    channelTotals[label].paid += b.paid || 0;
                  });
                  // Sort by check-in date
                  rows.sort((a, b) => String(a[3]).localeCompare(String(b[3])));
                  // Per-channel summary
                  rows.push([]);
                  rows.push([`Period: ${rangeStart} → ${rangeEnd}`]);
                  rows.push(['SUMMARY BY CHANNEL']);
                  rows.push(['Channel', 'Bookings', 'Total billed (₹)', 'Total paid (₹)']);
                  Object.entries(channelTotals).forEach(([ch, v]) => {
                    rows.push([ch, v.count, v.total, v.paid]);
                  });
                  const header = ['Booking ID', 'Guest', 'Channel', 'Check-in', 'Nights', 'Total (₹)', 'Paid (₹)', 'Balance (₹)', 'Status', 'Form C'];
                  downloadCsv(`atithi-ota-bookings-${rangeStart}-to-${rangeEnd}`, buildCsv(header, rows));
                },
              },
              ...(plan === 'invoicing' ? [{
                id: 'invoices',
                icon: 'tag',
                color: T.indigo,
                title: t('rptInvTitle'),
                sub: `${issuedInvoices.length} ${t('rptInvSubTail')}`,
                onClick: () => {
                  const rows = issuedInvoices.map(inv => [
                    inv.number, inv.fy, inv.date ? new Date(inv.date).toLocaleDateString('en-IN') : '',
                    inv.bookingId || '', inv.guest || '',
                    inv.recipient?.name || '', inv.recipient?.gstin || '',
                    inv.amount || 0, inv.voided ? 'VOIDED' : 'active', inv.note || '',
                  ]);
                  const header = ['Invoice #', 'FY', 'Issue date', 'Booking ID', 'Guest', 'Bill recipient', 'Recipient GSTIN', 'Amount (₹)', 'Status', 'Note'];
                  downloadCsv(`atithi-invoices-${ymd(new Date(ANCHOR))}`, buildCsv(header, rows));
                },
                disabled: issuedInvoices.length === 0,
              }] : []),
            ];
            return reports.map((r, i) => (
              <button
                key={r.id}
                onClick={r.disabled ? undefined : r.onClick}
                disabled={r.disabled}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                  padding: '14px 14px', background: T.card,
                  border: 'none',
                  borderBottom: i < reports.length - 1 ? `1px solid ${T.borderSoft}` : 'none',
                  cursor: r.disabled ? 'not-allowed' : 'pointer',
                  textAlign: 'left', opacity: r.disabled ? 0.55 : 1,
                }}
              >
                <div style={{
                  width: 36, height: 36, borderRadius: 9,
                  background: `color-mix(in oklch, ${r.color} 14%, white)`, color: r.color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <Icon name={r.icon} size={17} stroke={2} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>{r.title}</div>
                  <div style={{ fontSize: 10.5, color: T.ink3, fontWeight: 600, marginTop: 2, lineHeight: 1.4 }}>{r.sub}</div>
                </div>
                <Icon name="download" size={14} color={T.ink3} />
              </button>
            ));
          })()}
        </Card>
        </div>

        {/* Invoicing-tier-only: month-end CA email + invoice register +
            invoicing summary. Engine / Channels properties don't issue
            invoices in-app, so these sections are hidden for them
            (preventing confusion and an empty 'Send to CA' button). */}
        {plan === 'invoicing' && (
        <>
        <Card padding={14} style={{ marginBottom: 16, borderColor: stats.gapCount > 0 ? 'oklch(85% 0.10 75)' : 'oklch(85% 0.06 175)', background: stats.gapCount > 0 ? 'oklch(98% 0.018 75)' : 'oklch(98% 0.014 175)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Icon name="download" size={14} color={T.teal} stroke={2} />
            <span style={{ fontSize: 12, fontWeight: 700, color: T.teal, letterSpacing: 0.2 }}>{t('monthEndCA')}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginBottom: 10, flexWrap: 'wrap' }}>
            <div>
              <div className="tnum" style={{ fontSize: 22, fontWeight: 700, color: T.ink, letterSpacing: -0.3 }}>{issuedInvoices.length}</div>
              <div style={{ fontSize: 10, color: T.ink3, fontWeight: 700, letterSpacing: 0.3 }}>{t('invoicesIssued')}</div>
            </div>
            <div>
              <div className="tnum" style={{ fontSize: 22, fontWeight: 700, color: T.ink, letterSpacing: -0.3 }}>{stats.invoiceableCount}</div>
              <div style={{ fontSize: 10, color: T.ink3, fontWeight: 700, letterSpacing: 0.3 }}>{t('bookingsReady')}</div>
            </div>
            {stats.gapCount > 0 && (
              <div>
                <div className="tnum" style={{ fontSize: 22, fontWeight: 700, color: 'oklch(48% 0.14 75)', letterSpacing: -0.3 }}>{stats.gapCount}</div>
                <div style={{ fontSize: 10, color: 'oklch(48% 0.14 75)', fontWeight: 700, letterSpacing: 0.3 }}>{t('withGaps')}</div>
              </div>
            )}
          </div>
          {stats.gapCount > 0 ? (
            <div style={{ padding: '10px 12px', background: 'oklch(95% 0.05 75)', borderRadius: 8, marginBottom: 10, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <Icon name="info" size={14} color="oklch(48% 0.14 75)" stroke={2} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'oklch(40% 0.14 75)' }}>
                  {stats.gapCount} {stats.gapCount === 1 ? t('booking1') : t('bookingN')} {t('needReconcile')}
                </div>
                <div className="tnum" style={{ fontSize: 11, color: T.ink2, fontWeight: 600, marginTop: 2, lineHeight: 1.4 }}>
                  ₹{stats.gapAmount.toLocaleString('en-IN')} {t('unaccountedHint')}
                </div>
              </div>
            </div>
          ) : issuedInvoices.length === 0 ? (
            <div style={{ padding: '10px 12px', background: T.bgSoft, borderRadius: 8, marginBottom: 10, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <Icon name="info" size={13} color={T.ink3} stroke={2} />
              <div style={{ fontSize: 11, color: T.ink2, fontWeight: 600, lineHeight: 1.4 }}>
                {t('noInvoicesYet')} <strong>{t('issueInvoiceWord')}</strong> {t('toStart')}
              </div>
            </div>
          ) : !caEmail ? (
            <div style={{ padding: '10px 12px', background: 'oklch(95% 0.05 75)', borderRadius: 8, marginBottom: 10, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <Icon name="info" size={13} color="oklch(48% 0.14 75)" stroke={2} />
              <div style={{ fontSize: 11, color: 'oklch(40% 0.14 75)', fontWeight: 600, lineHeight: 1.4 }}>
                {t('addCaEmailHint')} <strong>{t('settingsAccountantPath')}</strong> {t('beforeSending')}
              </div>
            </div>
          ) : (
            <div style={{ padding: '10px 12px', background: 'oklch(95% 0.04 155)', borderRadius: 8, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="check" size={13} color={T.ok} stroke={2.4} />
              <div style={{ fontSize: 12, fontWeight: 700, color: T.ok }}>{t('readyToSend')} {caEmail}</div>
            </div>
          )}
          <button
            disabled={stats.gapCount > 0 || issuedInvoices.length === 0}
            onClick={handleSendToCA}
            style={{
              width: '100%', padding: '10px 12px', borderRadius: 10,
              border: 'none',
              background: (stats.gapCount > 0 || issuedInvoices.length === 0) ? T.bgSoft : T.teal,
              color: (stats.gapCount > 0 || issuedInvoices.length === 0) ? T.ink3 : '#fff',
              fontSize: 12, fontWeight: 700, cursor: (stats.gapCount > 0 || issuedInvoices.length === 0) ? 'not-allowed' : 'pointer',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            <Icon name="download" size={13} stroke={2} />
            {stats.gapCount > 0
              ? t('gapsToEnable').replace('{n}', stats.gapCount)
              : issuedInvoices.length === 0
                ? t('issueOneFirst')
                : `${t('openInvoiceList')} (${issuedInvoices.length}) ${t('emailToCA')}`}
          </button>
        </Card>

        <Card padding={14} style={{ marginBottom: 16, borderColor: T.indigoLt, background: 'oklch(98% 0.012 265)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <Icon name="tag" size={14} color={T.indigo} stroke={2} />
            <span style={{ fontSize: 12, fontWeight: 700, color: T.indigo, letterSpacing: 0.2 }}>{t('invoicingSummary')}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 8 }}>
            <div>
              <div style={{ fontSize: 10, color: T.ink3, fontWeight: 700, letterSpacing: 0.3 }}>{t('goesToCA')}</div>
              <div className="tnum" style={{ fontSize: 17, fontWeight: 700, color: T.ink, marginTop: 2 }}>{fmtINR(stats.reportedRevenue)}</div>
              <div style={{ fontSize: 10, color: T.ink3, fontWeight: 600, marginTop: 1 }}>{stats.gstCount} {stats.gstCount === 1 ? t('booking1') : t('bookingN')} · {t('inMonthlyExport')}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: T.ink3, fontWeight: 700, letterSpacing: 0.3 }}>{t('skipped')}</div>
              <div className="tnum" style={{ fontSize: 17, fontWeight: 700, color: T.ink, marginTop: 2 }}>{fmtINR(stats.unreported)}</div>
              <div style={{ fontSize: 10, color: T.ink3, fontWeight: 600, marginTop: 1 }}>{t('notInExport')}</div>
            </div>
          </div>
          <div style={{ height: 1, background: T.borderSoft, margin: '8px 0' }} />
          <div style={{ fontSize: 10.5, color: T.ink3, fontWeight: 600, lineHeight: 1.4 }}>
            {t('invoicingSummaryHint')}
          </div>
        </Card>
        </>
        )}

        <Card style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14, alignItems: 'baseline' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>{t('dailyOccupancy')}</div>
              <div style={{ fontSize: 11, color: T.ink3 }}>{rangeLabel}</div>
            </div>
            <Chip color="ok">{stats.avgOccPct}% {t('avgSuffix')}</Chip>
          </div>
          <div style={{ display: 'flex', gap: stats.rangeDays > 60 ? 1 : 4, alignItems: 'flex-end', height: 80 }}>
            {stats.dailyOccPct.map((v, i) => {
              const dayIdx = rangeStartIdx + i;
              const dateObj = new Date(idxToDate(dayIdx) + 'T00:00:00');
              const isToday = dayIdx === 0;
              const label = `${dateObj.getDate()} ${dateObj.toLocaleDateString(dateLoc(t), { month: 'short' })} · ${v}%`;
              return (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div style={{
                    width: '100%', height: `${Math.max(v, 4)}%`, borderRadius: '3px 3px 0 0',
                    background: isToday ? T.primary : `oklch(${50 + v/3}% ${0.04 + v/1500} 38)`,
                  }} title={label} />
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: stats.rangeDays > 60 ? 1 : 4, marginTop: 6 }}>
            {stats.dailyOccPct.map((_, i) => {
              const dayIdx = rangeStartIdx + i;
              const dateObj = new Date(idxToDate(dayIdx) + 'T00:00:00');
              // Tick density adapts to range size — every day for ≤14
              // days, every 3rd for ≤60, every 7th otherwise.
              const interval = stats.rangeDays > 60 ? 7 : stats.rangeDays > 14 ? 3 : 1;
              const show = i % interval === 0;
              return (
                <span key={i} style={{ flex: 1, fontSize: 8, color: T.ink3, textAlign: 'center', fontWeight: 600 }} className="tnum">
                  {show ? dateObj.getDate() : ''}
                </span>
              );
            })}
          </div>
        </Card>

        <SectionHead title={t('topRoomTypes')} />
        <Card padding={0}>
          {stats.byType.map((r, i) => {
            const pct = stats.topRevenue ? Math.round((r.rev / stats.topRevenue) * 100) : 0;
            return (
              <div key={r.id} style={{
                padding: '12px 14px',
                borderBottom: i < stats.byType.length - 1 ? `1px solid ${T.borderSoft}` : 'none',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: T.ink }}>{r.name}</span>
                  <span className="tnum" style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>{fmtINR(r.rev)}</span>
                </div>
                <div style={{ height: 4, background: T.bgSoft, borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: T[r.tag], borderRadius: 2 }} />
                </div>
              </div>
            );
          })}
        </Card>

        <SectionHead title={t('compliance')} style={{ marginTop: 18 }} />
        <Card>
          <Row label={t('taxInsideInvoices')} value={fmtINR(stats.gstCollected)} />
          <Row label={t('formCRequired')} value={`${stats.formC} ${stats.formC === 1 ? t('booking1') : t('bookingN')}`} />
          {stats.formC > 0 && (
            <div style={{ padding: '6px 12px 0', fontSize: 10.5, color: T.ink3, fontWeight: 600, lineHeight: 1.5, fontStyle: 'italic' }}>
              {t('formCHint')}
            </div>
          )}
        </Card>
      </div>
      {/* Send-to-CA snackbar. Sits above the bottom tab bar so it
          doesn't get obscured. Auto-dismisses on a timer set in
          handleSendToCA, or stays for the "sending..." phase. */}
      {sendStatus && (
        <div style={{
          position: 'absolute', bottom: 24, left: 12, right: 12, zIndex: 50,
          padding: '12px 14px', borderRadius: 10,
          background:
            sendStatus.kind === 'ok' ? 'oklch(95% 0.06 155)' :
            sendStatus.kind === 'err' ? 'oklch(95% 0.06 30)' :
            sendStatus.kind === 'fallback' ? 'oklch(95% 0.06 75)' :
            'oklch(95% 0.012 70)',
          border: `1px solid ${
            sendStatus.kind === 'ok' ? T.ok :
            sendStatus.kind === 'err' ? T.danger :
            sendStatus.kind === 'fallback' ? 'oklch(70% 0.14 75)' :
            T.border
          }`,
          color:
            sendStatus.kind === 'ok' ? 'oklch(30% 0.13 155)' :
            sendStatus.kind === 'err' ? T.danger :
            sendStatus.kind === 'fallback' ? 'oklch(35% 0.14 75)' :
            T.ink2,
          fontSize: 12, fontWeight: 600, lineHeight: 1.5,
          display: 'flex', alignItems: 'flex-start', gap: 10,
          boxShadow: '0 6px 18px rgba(0,0,0,0.10)',
        }}>
          <Icon
            name={sendStatus.kind === 'ok' ? 'check' : sendStatus.kind === 'sending' ? 'sync' : 'info'}
            size={14}
            stroke={2}
            color={sendStatus.kind === 'ok' ? T.ok : sendStatus.kind === 'err' ? T.danger : 'oklch(45% 0.14 75)'}
          />
          <span style={{ flex: 1 }}>{sendStatus.message}</span>
          {/* Always show the dismiss button — even during 'sending'.
              The fetch has a 12s AbortController timeout (in
              sendInvoiceListViaResend) so the snackbar can't hang
              forever on a stalled request, but we also let the
              hotelier dismiss it manually if they don't want to wait. */}
          <button
            onClick={() => setSendStatus(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'inherit', opacity: 0.6, fontSize: 16, lineHeight: 1 }}
            aria-label="Dismiss"
          >×</button>
        </div>
      )}
    </div>
  );
}

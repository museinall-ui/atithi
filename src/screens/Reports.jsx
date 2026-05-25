import { useMemo, useState, useRef } from 'react';
import { T } from '../tokens.js';
import { DAYS, ANCHOR, ymd, idxToDate, dateToIdx, bookingGstApplies, listIssuedInvoices, effectiveRoomTypes, blendedGstRate, bookingNetAmount, CHANNELS } from '../data.js';
import { exportInvoiceList, emailToAccountant } from '../utils/invoiceExport.js';
import { buildCsv, downloadCsv } from '../utils/csv.js';
import Icon from '../components/Icon.jsx';
import Btn from '../components/Btn.jsx';
import Chip from '../components/Chip.jsx';
import Card from '../components/Card.jsx';
import Row from '../components/Row.jsx';
import SectionHead from '../components/SectionHead.jsx';
import ScreenHeader from '../components/ScreenHeader.jsx';

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
function DatePill({ value, onChange, label }) {
  const ref = useRef(null);
  const open = () => {
    const el = ref.current;
    if (el && typeof el.showPicker === 'function') {
      try { el.showPicker(); } catch {}
    }
  };
  const filled = !!value;
  const display = filled
    ? new Date(value + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
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

export default function Reports({ go, t, bookings = [], plan = 'engine', property, expenses = [] }) {
  const ROOM_TYPES = useMemo(() => effectiveRoomTypes(property), [property]);
  const issuedInvoices = useMemo(() => listIssuedInvoices(bookings), [bookings]);
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
    if (sameMonth) return s.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    const sameYear = s.getFullYear() === e.getFullYear();
    if (sameYear) return `${s.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} – ${e.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`;
    return `${s.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} – ${e.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`;
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

  const handleSendToCA = () => {
    if (issuedInvoices.length === 0) {
      alert('No invoices to send yet. Open any booking and tap "Issue invoice" first.');
      return;
    }
    if (!caEmail) {
      alert('Add your CA\'s email in Settings → Property profile → Accountant before sending.');
      return;
    }
    exportInvoiceList(bookings, property);
    // Give the printable window a moment to open before triggering mailto.
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
    // count every booking whose stay covers that day.
    const dailyOccupied = [];
    for (let i = 0; i < rangeDays; i++) {
      const dayIdx = rangeStartIdx + i;
      const n = active.filter(b => (b.startIdx || 0) <= dayIdx && dayIdx < (b.startIdx || 0) + (b.nights || 1)).length;
      dailyOccupied.push(n);
    }
    const occupiedRoomNights = dailyOccupied.reduce((s, v) => s + v, 0);
    const availableRoomNights = totalUnits * rangeDays;
    const avgOccPct = availableRoomNights ? Math.round((occupiedRoomNights / availableRoomNights) * 100) : 0;

    // ADR = revenue / occupied room nights; RevPAR = revenue / available room nights.
    const adr = occupiedRoomNights ? Math.round(billed / occupiedRoomNights) : 0;
    const revpar = availableRoomNights ? Math.round(billed / availableRoomNights) : 0;

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

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: T.bg }}>
      <ScreenHeader title={t('reportsTitle')} subtitle={`${rangeLabel} · ${stats.totalUnits} units · ${stats.rangeDays} day${stats.rangeDays === 1 ? '' : 's'}`} onBack={() => go('home')}
        right={<Btn size="sm" variant="ghost" icon="download">Export</Btn>}
      />
      <div style={{ flex: 1, overflow: 'auto', padding: 16, paddingBottom: 100 }}>
        {/* Date-range picker — defaults to current calendar month. All
            KPIs + CSV exports below honor whatever is picked here. */}
        <Card padding={12} style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, color: T.ink3, fontWeight: 700, letterSpacing: 0.4, marginBottom: 8 }}>REPORT PERIOD</div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <DatePill value={rangeStart} onChange={setRangeStart} label="From" />
            <span style={{ color: T.ink3, fontSize: 13, fontWeight: 700, alignSelf: 'center' }}>→</span>
            <DatePill value={rangeEnd} onChange={setRangeEnd} label="To" />
          </div>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {[
              { id: 'thismonth', label: 'This month', onClick: () => setRangeToMonth(0) },
              { id: 'lastmonth', label: 'Last month', onClick: () => setRangeToMonth(-1) },
              { id: 'fy',        label: 'This FY',    onClick: setRangeToFinancialYear },
              {
                id: 'next14',    label: 'Next 14 days',
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
              End date is before start — please pick a valid range.
            </div>
          )}
        </Card>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
          <KPI label="Money earned" value={fmtINR(stats.revenue)} sub={`of ${fmtINR(stats.billed)} billed`} icon="inr" color={T.primary} />
          <KPI label="Rooms full" value={`${stats.avgOccPct}%`} sub={`avg over ${stats.rangeDays} day${stats.rangeDays === 1 ? '' : 's'}`} icon="bed" color={T.indigo} />
          <KPI label="Per room / night" value={fmtINR(stats.adr)} sub="when room is booked" icon="tag" color={T.teal} />
          <KPI label="Per room / day" value={fmtINR(stats.revpar)} sub="across all rooms" icon="chart" color="oklch(60% 0.14 320)" />
        </div>

        {/* Take-home breakdown (Channels / Invoicing tiers only). Engine
            properties only sell direct, so gross == net minus tax; no need
            to surface OTA commissions. */}
        {plan !== 'engine' && (
          <Card padding={14} style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: 'color-mix(in oklch, oklch(60% 0.14 175) 14%, white)', color: 'oklch(45% 0.14 175)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="inr" size={14} stroke={2} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'oklch(45% 0.14 175)', letterSpacing: 0.2 }}>TAKE-HOME · AFTER TAX + OTA</span>
            </div>
            <div className="tnum" style={{ fontSize: 26, fontWeight: 700, color: T.ink, letterSpacing: -0.5, marginBottom: 2 }}>{fmtINR(stats.netRevenue)}</div>
            <div style={{ fontSize: 11, color: T.ink3, fontWeight: 600, marginBottom: 12 }}>actually kept by your property</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '10px 12px', background: T.bgSoft, borderRadius: 7 }}>
              <BreakdownRow label="Total billed" value={fmtINR(stats.billed)} color={T.ink2} />
              <BreakdownRow label="GST collected (to government)" value={`− ${fmtINR(stats.totalTax)}`} color={T.ink3} />
              <BreakdownRow label="OTA commissions" value={`− ${fmtINR(stats.totalCommission)}`} color={T.ink3} />
              <div style={{ borderTop: `1px solid ${T.borderSoft}`, paddingTop: 6, marginTop: 4 }}>
                <BreakdownRow label="Net to you" value={fmtINR(stats.netRevenue)} color={T.primaryDk} bold />
              </div>
              {stats.totalExpenses > 0 && (
                <>
                  <BreakdownRow label={`Operating expenses (${stats.expensesCount} entr${stats.expensesCount === 1 ? 'y' : 'ies'})`} value={`− ${fmtINR(stats.totalExpenses)}`} color={T.ink3} />
                  <div style={{ borderTop: `1px solid ${T.borderSoft}`, paddingTop: 6, marginTop: 4 }}>
                    <BreakdownRow label="After expenses" value={fmtINR(stats.netAfterExpenses)} color={T.ok} bold />
                  </div>
                </>
              )}
            </div>
            {stats.totalCommission === 0 && (
              <div style={{ marginTop: 10, fontSize: 10.5, color: T.ink3, lineHeight: 1.4 }}>
                No OTA bookings in this window — commissions are zero. Defaults are 18% MMT, 15% Booking.com, etc. Edit in Settings → Property profile → Channel commissions if your contract differs.
              </div>
            )}
          </Card>
        )}

        {/* Downloadable Excel/CSV reports — opens directly in Excel /
            Google Sheets / Numbers. Available to every plan; the
            invoice-register CSV is plan-gated below since it's a
            tax-filing artefact. */}
        <SectionHead title="Downloadable reports" />
        <Card padding={0} style={{ marginBottom: 16 }}>
          {(() => {
            const reports = [
              {
                id: 'occupancy',
                icon: 'bed',
                color: T.indigo,
                title: 'Occupancy report',
                sub: `Daily occupancy across ${stats.rangeDays} day${stats.rangeDays === 1 ? '' : 's'} (${rangeLabel}) + ADR + RevPAR`,
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
                title: 'Payment reconciliation',
                sub: `Payments within ${rangeLabel}, grouped by method (cash / UPI / card / bank)`,
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
                title: 'OTA booking report',
                sub: `Bookings overlapping ${rangeLabel}, grouped by channel (MMT / Booking / Goibibo / Agoda / Airbnb / Direct / Website)`,
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
                title: 'Invoice register (Invoicing tier)',
                sub: `${issuedInvoices.length} invoice${issuedInvoices.length === 1 ? '' : 's'} issued — CSV for your CA's records`,
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

        {/* Invoicing-tier-only: month-end CA email + invoice register +
            invoicing summary. Engine / Channels properties don't issue
            invoices in-app, so these sections are hidden for them
            (preventing confusion and an empty 'Send to CA' button). */}
        {plan === 'invoicing' && (
        <>
        <Card padding={14} style={{ marginBottom: 16, borderColor: stats.gapCount > 0 ? 'oklch(85% 0.10 75)' : 'oklch(85% 0.06 175)', background: stats.gapCount > 0 ? 'oklch(98% 0.018 75)' : 'oklch(98% 0.014 175)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Icon name="download" size={14} color={T.teal} stroke={2} />
            <span style={{ fontSize: 12, fontWeight: 700, color: T.teal, letterSpacing: 0.2 }}>MONTH-END · SEND TO CA</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginBottom: 10, flexWrap: 'wrap' }}>
            <div>
              <div className="tnum" style={{ fontSize: 22, fontWeight: 700, color: T.ink, letterSpacing: -0.3 }}>{issuedInvoices.length}</div>
              <div style={{ fontSize: 10, color: T.ink3, fontWeight: 700, letterSpacing: 0.3 }}>INVOICES ISSUED</div>
            </div>
            <div>
              <div className="tnum" style={{ fontSize: 22, fontWeight: 700, color: T.ink, letterSpacing: -0.3 }}>{stats.invoiceableCount}</div>
              <div style={{ fontSize: 10, color: T.ink3, fontWeight: 700, letterSpacing: 0.3 }}>BOOKINGS READY</div>
            </div>
            {stats.gapCount > 0 && (
              <div>
                <div className="tnum" style={{ fontSize: 22, fontWeight: 700, color: 'oklch(48% 0.14 75)', letterSpacing: -0.3 }}>{stats.gapCount}</div>
                <div style={{ fontSize: 10, color: 'oklch(48% 0.14 75)', fontWeight: 700, letterSpacing: 0.3 }}>WITH GAPS</div>
              </div>
            )}
          </div>
          {stats.gapCount > 0 ? (
            <div style={{ padding: '10px 12px', background: 'oklch(95% 0.05 75)', borderRadius: 8, marginBottom: 10, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <Icon name="info" size={14} color="oklch(48% 0.14 75)" stroke={2} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'oklch(40% 0.14 75)' }}>
                  {stats.gapCount} booking{stats.gapCount > 1 ? 's' : ''} need payment reconciliation
                </div>
                <div className="tnum" style={{ fontSize: 11, color: T.ink2, fontWeight: 600, marginTop: 2, lineHeight: 1.4 }}>
                  ₹{stats.gapAmount.toLocaleString('en-IN')} unaccounted. Resolve via the "Pending payments" card on the Dashboard before sending invoices to your CA.
                </div>
              </div>
            </div>
          ) : issuedInvoices.length === 0 ? (
            <div style={{ padding: '10px 12px', background: T.bgSoft, borderRadius: 8, marginBottom: 10, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <Icon name="info" size={13} color={T.ink3} stroke={2} />
              <div style={{ fontSize: 11, color: T.ink2, fontWeight: 600, lineHeight: 1.4 }}>
                No invoices issued yet. Open a booking and tap <strong>Issue invoice</strong> to start.
              </div>
            </div>
          ) : !caEmail ? (
            <div style={{ padding: '10px 12px', background: 'oklch(95% 0.05 75)', borderRadius: 8, marginBottom: 10, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <Icon name="info" size={13} color="oklch(48% 0.14 75)" stroke={2} />
              <div style={{ fontSize: 11, color: 'oklch(40% 0.14 75)', fontWeight: 600, lineHeight: 1.4 }}>
                Add your CA's email in <strong>Settings → Property profile → Accountant</strong> before sending.
              </div>
            </div>
          ) : (
            <div style={{ padding: '10px 12px', background: 'oklch(95% 0.04 155)', borderRadius: 8, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="check" size={13} color={T.ok} stroke={2.4} />
              <div style={{ fontSize: 12, fontWeight: 700, color: T.ok }}>Ready to send to {caEmail}</div>
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
              ? `Resolve ${stats.gapCount} gap${stats.gapCount > 1 ? 's' : ''} to enable export`
              : issuedInvoices.length === 0
                ? 'Issue at least one invoice first'
                : `Open invoice list (${issuedInvoices.length}) + email to CA`}
          </button>
        </Card>

        <Card padding={14} style={{ marginBottom: 16, borderColor: T.indigoLt, background: 'oklch(98% 0.012 265)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <Icon name="tag" size={14} color={T.indigo} stroke={2} />
            <span style={{ fontSize: 12, fontWeight: 700, color: T.indigo, letterSpacing: 0.2 }}>INVOICING SUMMARY</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 8 }}>
            <div>
              <div style={{ fontSize: 10, color: T.ink3, fontWeight: 700, letterSpacing: 0.3 }}>GOES TO CA</div>
              <div className="tnum" style={{ fontSize: 17, fontWeight: 700, color: T.ink, marginTop: 2 }}>{fmtINR(stats.reportedRevenue)}</div>
              <div style={{ fontSize: 10, color: T.ink3, fontWeight: 600, marginTop: 1 }}>{stats.gstCount} booking{stats.gstCount === 1 ? '' : 's'} · in monthly export</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: T.ink3, fontWeight: 700, letterSpacing: 0.3 }}>SKIPPED</div>
              <div className="tnum" style={{ fontSize: 17, fontWeight: 700, color: T.ink, marginTop: 2 }}>{fmtINR(stats.unreported)}</div>
              <div style={{ fontSize: 10, color: T.ink3, fontWeight: 600, marginTop: 1 }}>direct / cash · not in export</div>
            </div>
          </div>
          <div style={{ height: 1, background: T.borderSoft, margin: '8px 0' }} />
          <div style={{ fontSize: 10.5, color: T.ink3, fontWeight: 600, lineHeight: 1.4 }}>
            Bookings included in your monthly export to the CA. Default is OTA-yes / direct-no — flip per booking via "Include in invoice" on its detail page.
          </div>
        </Card>
        </>
        )}

        <Card style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14, alignItems: 'baseline' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>Daily occupancy</div>
              <div style={{ fontSize: 11, color: T.ink3 }}>{rangeLabel}</div>
            </div>
            <Chip color="ok">{stats.avgOccPct}% avg</Chip>
          </div>
          <div style={{ display: 'flex', gap: stats.rangeDays > 60 ? 1 : 4, alignItems: 'flex-end', height: 80 }}>
            {stats.dailyOccPct.map((v, i) => {
              const dayIdx = rangeStartIdx + i;
              const dateObj = new Date(idxToDate(dayIdx) + 'T00:00:00');
              const isToday = dayIdx === 0;
              const label = `${dateObj.getDate()} ${dateObj.toLocaleDateString('en-IN', { month: 'short' })} · ${v}%`;
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

        <SectionHead title="Top room types" />
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

        <SectionHead title="Compliance" style={{ marginTop: 18 }} />
        <Card>
          <Row label="Tax inside invoices" value={fmtINR(stats.gstCollected)} />
          <Row label="Form C required" value={`${stats.formC} booking${stats.formC === 1 ? '' : 's'}`} />
          {stats.formC > 0 && (
            <div style={{ padding: '6px 12px 0', fontSize: 10.5, color: T.ink3, fontWeight: 600, lineHeight: 1.5, fontStyle: 'italic' }}>
              Atithi flags foreign-passport guests as needing Form C. Actual e-FRRO filing is still manual — submit at <strong>indianfrro.gov.in/frro</strong> per stay.
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

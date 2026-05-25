import { useMemo } from 'react';
import { T } from '../tokens.js';
import { DAYS, ANCHOR, ymd, idxToDate, bookingGstApplies, listIssuedInvoices, effectiveRoomTypes, blendedGstRate, bookingNetAmount, CHANNELS } from '../data.js';
import { exportInvoiceList, emailToAccountant } from '../utils/invoiceExport.js';
import { buildCsv, downloadCsv } from '../utils/csv.js';
import Icon from '../components/Icon.jsx';
import Btn from '../components/Btn.jsx';
import Chip from '../components/Chip.jsx';
import Card from '../components/Card.jsx';
import Row from '../components/Row.jsx';
import SectionHead from '../components/SectionHead.jsx';
import ScreenHeader from '../components/ScreenHeader.jsx';

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

export default function Reports({ go, t, bookings = [], plan = 'engine', property }) {
  const ROOM_TYPES = useMemo(() => effectiveRoomTypes(property), [property]);
  const issuedInvoices = useMemo(() => listIssuedInvoices(bookings), [bookings]);
  const caEmail = property?.accountant?.email || '';

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
    const active = bookings.filter(b => b.status !== 'cancelled');
    const totalUnits = ROOM_TYPES.reduce((s, r) => s + r.units, 0);

    // Revenue = sum of paid (cash collected). Total billed is shown as a sub-label.
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

    // Occupancy is computed across the 14-day diary window. For each day, count
    // every booking whose [startIdx, startIdx+nights) range covers that day.
    const dailyOccupied = DAYS.map((_, dayIdx) =>
      active.filter(b => b.startIdx <= dayIdx && dayIdx < b.startIdx + b.nights).length
    );
    const occupiedRoomNights = dailyOccupied.reduce((s, v) => s + v, 0);
    const availableRoomNights = totalUnits * DAYS.length;
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

    return { revenue, billed, reportedRevenue, reportedBilled, unreported, gstCount: gstBookings.length, avgOccPct, adr, revpar, dailyOccPct, byType, topRevenue, formC, gstCollected, totalUnits, invoiceableCount: invoiceable.length, gapCount, gapAmount, netRevenue, totalTax, totalCommission };
  }, [bookings, ROOM_TYPES]);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: T.bg }}>
      <ScreenHeader title={t('reportsTitle')} subtitle={`${new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })} · ${stats.totalUnits} units · live`} onBack={() => go('home')}
        right={<Btn size="sm" variant="ghost" icon="download">Export</Btn>}
      />
      <div style={{ flex: 1, overflow: 'auto', padding: 16, paddingBottom: 100 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
          <KPI label="Money earned" value={fmtINR(stats.revenue)} sub={`of ${fmtINR(stats.billed)} billed`} icon="inr" color={T.primary} />
          <KPI label="Rooms full" value={`${stats.avgOccPct}%`} sub={`avg over ${DAYS.length} days`} icon="bed" color={T.indigo} />
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
                sub: `Daily occupancy across the next ${DAYS.length} days + ADR + RevPAR`,
                onClick: () => {
                  const rows = [];
                  const active = bookings.filter(b => b.status !== 'cancelled');
                  for (let i = 0; i < DAYS.length; i++) {
                    const d = DAYS[i];
                    const iso = idxToDate(i);
                    let occupied = 0;
                    const perType = {};
                    for (const rt of ROOM_TYPES) perType[rt.id] = 0;
                    for (const b of active) {
                      if (b.startIdx <= i && i < b.startIdx + b.nights) {
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
                    rows.push([iso, d.dow, occupied, totalUnits, pct + '%', ...ROOM_TYPES.map(rt => perType[rt.id])]);
                  }
                  // Summary footer
                  rows.push([]);
                  rows.push(['Average occupancy', '', '', '', stats.avgOccPct + '%']);
                  rows.push(['ADR (avg daily rate)', '', '', '', '', stats.adr]);
                  rows.push(['RevPAR (revenue per available room)', '', '', '', '', stats.revpar]);
                  const header = ['Date', 'Day', 'Occupied', 'Available', 'Occupancy %', ...ROOM_TYPES.map(rt => rt.name)];
                  downloadCsv(`atithi-occupancy-${ymd(new Date(ANCHOR))}`, buildCsv(header, rows));
                },
              },
              {
                id: 'payments',
                icon: 'inr',
                color: 'oklch(58% 0.13 155)',
                title: 'Payment reconciliation',
                sub: 'Every payment recorded, grouped by method (cash / UPI / card / bank)',
                onClick: () => {
                  const rows = [];
                  const methodTotals = {};
                  bookings.forEach(b => {
                    (b.payments || []).forEach(p => {
                      const method = p.method || 'unspecified';
                      const amt = (p.kind === 'refund' || p.kind === 'credit' || p.kind === 'credit_note') ? -(p.amount || 0) : (p.amount || 0);
                      rows.push([
                        p.date ? new Date(p.date).toLocaleDateString('en-IN') : '',
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
                    rows.push(['SUMMARY BY METHOD']);
                    Object.entries(methodTotals).forEach(([m, total]) => {
                      rows.push(['', '', '', '', m, '', total]);
                    });
                  }
                  const header = ['Date', 'Booking ID', 'Guest', 'Phone', 'Method', 'Kind', 'Amount (₹)', 'Note'];
                  downloadCsv(`atithi-payments-${ymd(new Date(ANCHOR))}`, buildCsv(header, rows));
                },
              },
              {
                id: 'ota',
                icon: 'sync',
                color: 'oklch(60% 0.16 38)',
                title: 'OTA booking report',
                sub: 'Bookings grouped by channel (MMT / Booking / Goibibo / Agoda / Airbnb / Direct / Website)',
                onClick: () => {
                  const rows = [];
                  const channelTotals = {};
                  bookings.filter(b => b.status !== 'cancelled').forEach(b => {
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
                  rows.push(['SUMMARY BY CHANNEL']);
                  rows.push(['Channel', 'Bookings', 'Total billed (₹)', 'Total paid (₹)']);
                  Object.entries(channelTotals).forEach(([ch, v]) => {
                    rows.push([ch, v.count, v.total, v.paid]);
                  });
                  const header = ['Booking ID', 'Guest', 'Channel', 'Check-in', 'Nights', 'Total (₹)', 'Paid (₹)', 'Balance (₹)', 'Status', 'Form C'];
                  downloadCsv(`atithi-ota-bookings-${ymd(new Date(ANCHOR))}`, buildCsv(header, rows));
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
              <div style={{ fontSize: 11, color: T.ink3 }}>Next 14 days</div>
            </div>
            <Chip color="ok">{stats.avgOccPct}% avg</Chip>
          </div>
          <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 80 }}>
            {stats.dailyOccPct.map((v, i) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{
                  width: '100%', height: `${Math.max(v, 4)}%`, borderRadius: '3px 3px 0 0',
                  background: i === 0 ? T.primary : `oklch(${50 + v/3}% ${0.04 + v/1500} 38)`,
                }} title={`${DAYS[i].dom} ${DAYS[i].month} · ${v}%`} />
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
            {DAYS.map((d, i) => (
              <span key={i} style={{ flex: 1, fontSize: 8, color: T.ink3, textAlign: 'center', fontWeight: 600 }} className="tnum">
                {i % 3 === 0 ? d.dom : ''}
              </span>
            ))}
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
          <Row label="Form C filed" value={`${stats.formC} of ${stats.formC}`} />
        </Card>
      </div>
    </div>
  );
}

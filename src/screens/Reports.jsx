import { useMemo } from 'react';
import { T } from '../tokens.js';
import { ROOM_TYPES, DAYS, bookingGstApplies } from '../data.js';
import Icon from '../components/Icon.jsx';
import Btn from '../components/Btn.jsx';
import Chip from '../components/Chip.jsx';
import Card from '../components/Card.jsx';
import Row from '../components/Row.jsx';
import SectionHead from '../components/SectionHead.jsx';
import ScreenHeader from '../components/ScreenHeader.jsx';

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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: 11, color: T.ink3, fontWeight: 600 }}>{label}</span>
        {sub && <span className="tnum" style={{ fontSize: 10, color: T.ink3, fontWeight: 600 }}>{sub}</span>}
      </div>
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

export default function Reports({ go, t, bookings = [], plan = 'engine' }) {
  const gstEnabled = plan === 'gst';
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
    // Treat reported totals as GST-inclusive: 12% / 112% lives inside the price.
    const gstCollected = Math.round(reportedBilled * 12 / 112);
    const unreported = revenue - reportedRevenue;

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
    const overdueArrivals = invoiceable.filter(b =>
      b.status === 'confirmed' && b.startIdx <= 1 && (b.paid || 0) < (b.total || 0)
    );
    const gapCount = reconciliationGaps.length + overdueArrivals.length;
    const gapAmount = [...reconciliationGaps, ...overdueArrivals].reduce((s, b) => s + (b.total - b.paid), 0);

    return { revenue, billed, reportedRevenue, reportedBilled, unreported, gstCount: gstBookings.length, avgOccPct, adr, revpar, dailyOccPct, byType, topRevenue, formC, gstCollected, totalUnits, invoiceableCount: invoiceable.length, gapCount, gapAmount };
  }, [bookings]);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: T.bg }}>
      <ScreenHeader title={t('reportsTitle')} subtitle={`May 2026 · ${stats.totalUnits} units · live`} onBack={() => go('home')}
        right={<Btn size="sm" variant="ghost" icon="download">Export</Btn>}
      />
      <div style={{ flex: 1, overflow: 'auto', padding: 16, paddingBottom: 100 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
          <KPI label={t('revenue')} value={fmtINR(stats.revenue)} sub={`of ${fmtINR(stats.billed)}`} icon="inr" color={T.primary} />
          <KPI label={t('avgOccupancy')} value={`${stats.avgOccPct}%`} sub={`${DAYS.length}-day avg`} icon="bed" color={T.indigo} />
          <KPI label="ADR" value={fmtINR(stats.adr)} sub="per night" icon="tag" color={T.teal} />
          <KPI label="RevPAR" value={fmtINR(stats.revpar)} sub="per available" icon="chart" color="oklch(60% 0.14 320)" />
        </div>

        <Card padding={14} style={{ marginBottom: 16, borderColor: stats.gapCount > 0 ? 'oklch(85% 0.10 75)' : 'oklch(85% 0.06 175)', background: stats.gapCount > 0 ? 'oklch(98% 0.018 75)' : 'oklch(98% 0.014 175)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Icon name="download" size={14} color={T.teal} stroke={2} />
            <span style={{ fontSize: 12, fontWeight: 700, color: T.teal, letterSpacing: 0.2 }}>MONTH-END · SEND TO CA</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
            <div className="tnum" style={{ fontSize: 24, fontWeight: 700, color: T.ink, letterSpacing: -0.3 }}>{stats.invoiceableCount}</div>
            <span style={{ fontSize: 12, color: T.ink3, fontWeight: 600 }}>bookings ready for invoice export</span>
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
          ) : (
            <div style={{ padding: '10px 12px', background: 'oklch(95% 0.04 155)', borderRadius: 8, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="check" size={13} color={T.ok} stroke={2.4} />
              <div style={{ fontSize: 12, fontWeight: 700, color: T.ok }}>No payment gaps · invoices ready</div>
            </div>
          )}
          <button
            disabled={stats.gapCount > 0}
            onClick={() => alert('Monthly invoice export to CA is coming soon. The system will email a sequenced list of invoices (PDF + Excel) to your accountant.')}
            style={{
              width: '100%', padding: '10px 12px', borderRadius: 10,
              border: 'none',
              background: stats.gapCount > 0 ? T.bgSoft : T.teal,
              color: stats.gapCount > 0 ? T.ink3 : '#fff',
              fontSize: 12, fontWeight: 700, cursor: stats.gapCount > 0 ? 'not-allowed' : 'pointer',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            <Icon name="wa" size={13} stroke={2} />
            {stats.gapCount > 0 ? `Resolve ${stats.gapCount} gap${stats.gapCount > 1 ? 's' : ''} to enable export` : 'Email invoice list to CA'}
          </button>
        </Card>

        {gstEnabled && (
          <Card padding={14} style={{ marginBottom: 16, borderColor: T.indigoLt, background: 'oklch(98% 0.012 265)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <Icon name="tag" size={14} color={T.indigo} stroke={2} />
              <span style={{ fontSize: 12, fontWeight: 700, color: T.indigo, letterSpacing: 0.2 }}>GST APPLICABILITY</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 10, color: T.ink3, fontWeight: 700, letterSpacing: 0.3 }}>REPORTED (GSTR-1)</div>
                <div className="tnum" style={{ fontSize: 17, fontWeight: 700, color: T.ink, marginTop: 2 }}>{fmtINR(stats.reportedRevenue)}</div>
                <div style={{ fontSize: 10, color: T.ink3, fontWeight: 600, marginTop: 1 }}>{stats.gstCount} booking{stats.gstCount === 1 ? '' : 's'} · GST included</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: T.ink3, fontWeight: 700, letterSpacing: 0.3 }}>NOT REPORTED</div>
                <div className="tnum" style={{ fontSize: 17, fontWeight: 700, color: T.ink, marginTop: 2 }}>{fmtINR(stats.unreported)}</div>
                <div style={{ fontSize: 10, color: T.ink3, fontWeight: 600, marginTop: 1 }}>direct / cash bookings</div>
              </div>
            </div>
            <div style={{ height: 1, background: T.borderSoft, margin: '8px 0' }} />
            <div style={{ fontSize: 10.5, color: T.ink3, fontWeight: 600, lineHeight: 1.4 }}>
              Default is channel-based: OTA bookings include GST, direct/cash bookings don't. You can flip the toggle on any individual booking in its detail page.
            </div>
          </Card>
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
          <Row label="GST collected (reported)" value={fmtINR(stats.gstCollected)} />
          <Row label="Form C filed" value={`${stats.formC} of ${stats.formC}`} />
          <Row label="GSTR-1 next due" value="11 Jun" />
        </Card>
      </div>
    </div>
  );
}

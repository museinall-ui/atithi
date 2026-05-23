import { useState, useMemo } from 'react';
import { T } from '../tokens.js';
import { ANCHOR, ymd, dateToIdx, effectiveRoomTypes, effectiveRatePlans, ratePlanById, defaultRatePlanId } from '../data.js';
import { holidayFor } from '../holidays.js';
import Icon from '../components/Icon.jsx';
import { generateVoucher } from '../utils/voucher.js';

// Public booking widget. Customer-facing — the URL is meant for the
// hotelier to drop on their own website. Looks visually distinct from
// the hotelier dashboard so customers know they're booking, not
// administering.
//
// Flow (3 steps):
//   1. Dates + guest count
//   2. Pick room type (live rate using weekend + season multipliers)
//   3. Guest details + payment QR + Confirm
//
// On Confirm a booking is added to the property's diary with:
//   channel:'website'  status:'tentative'  paid:0
// The hotelier reviews + confirms once payment hits their QR.
//
// DEMO_MODE limitation: in this build the widget writes to localStorage
// on the same browser. In production (DEMO_MODE off), this would post
// through a Supabase anon RLS policy that allows status='tentative'
// inserts but rejects everything else — that policy work is queued.

export default function PublicBookingWidget({ property, bookings, onSubmit }) {
  const ROOM_TYPES = effectiveRoomTypes(property);
  const ratePlans = effectiveRatePlans(property);

  const [step, setStep] = useState(1);
  const [data, setData] = useState({
    checkIn: '',
    nights: 1,
    adults: 2,
    children: 0,
    roomTypeId: null,
    ratePlanId: defaultRatePlanId(),
    name: '',
    phone: '',
    email: '',
    notes: '',
  });
  const [createdBookingId, setCreatedBookingId] = useState(null);
  const [createdBooking, setCreatedBooking] = useState(null);

  const set = (k, v) => setData(d => ({ ...d, [k]: v }));

  const checkOutIso = useMemo(() => {
    if (!data.checkIn) return '';
    const d = new Date(data.checkIn + 'T00:00:00');
    if (isNaN(d.getTime())) return '';
    d.setDate(d.getDate() + (data.nights || 1));
    return ymd(d);
  }, [data.checkIn, data.nights]);

  // Compute the per-night rate for a room type on a specific start date,
  // applying weekend uplift, seasons, and the chosen rate plan. Matches
  // what Rates & Inventory shows in its calendar.
  const weekendDays = property?.weekendRules?.weekendDays || [0, 6];
  const upliftPct = property?.weekendRules?.upliftPct ?? 20;
  const seasons = Array.isArray(property?.seasons) ? property.seasons : [];

  const computePerNightRate = (typeId) => {
    if (!data.checkIn) return null;
    const rt = ROOM_TYPES.find(r => r.id === typeId);
    if (!rt) return null;
    // Average rate across the stay: sum each night's rate, divide by nights.
    let totalSum = 0;
    for (let i = 0; i < (data.nights || 1); i++) {
      const d = new Date(data.checkIn + 'T00:00:00');
      d.setDate(d.getDate() + i);
      const iso = ymd(d);
      const isWknd = weekendDays.includes(d.getDay());
      const seasonMult = seasons
        .filter(s => iso >= s.startIso && iso <= s.endIso)
        .reduce((m, s) => m * (1 + ((s.multiplierPct || 0) / 100)), 1);
      const wkMult = isWknd ? (1 + upliftPct / 100) : 1;
      totalSum += rt.base * wkMult * seasonMult;
    }
    const avg = totalSum / (data.nights || 1);
    const rpObj = ratePlanById(property, data.ratePlanId) || { multiplierPct: 0 };
    const rpMult = 1 + ((rpObj.multiplierPct || 0) / 100);
    return Math.round(avg * rpMult);
  };

  // Availability check — counts bookings that overlap the requested
  // window for a given room type. A type is available if at least one
  // unit is free for every night.
  const availUnitsFor = (typeId) => {
    const rt = ROOM_TYPES.find(r => r.id === typeId);
    if (!rt || !data.checkIn) return rt ? rt.units : 0;
    const start = dateToIdx(data.checkIn);
    const end = start + (data.nights || 1);
    let maxBooked = 0;
    for (let day = start; day < end; day++) {
      const overlapping = (bookings || []).filter(b => {
        if (b.status === 'cancelled') return false;
        const bStart = b.startIdx || 0;
        const bEnd = bStart + (b.nights || 1);
        if (day < bStart || day >= bEnd) return false;
        const items = Array.isArray(b.roomItems) && b.roomItems.length
          ? b.roomItems
          : [{ roomTypeId: b.roomTypeId }];
        return items.some(it => (it.roomTypeId || b.roomTypeId) === typeId);
      });
      // Sum roomItems of this type per overlapping booking
      const booked = overlapping.reduce((sum, b) => {
        const items = Array.isArray(b.roomItems) && b.roomItems.length
          ? b.roomItems
          : [{ roomTypeId: b.roomTypeId }];
        return sum + items.filter(it => (it.roomTypeId || b.roomTypeId) === typeId).length;
      }, 0);
      if (booked > maxBooked) maxBooked = booked;
    }
    return Math.max(0, rt.units - maxBooked);
  };

  const selectedRT = ROOM_TYPES.find(r => r.id === data.roomTypeId);
  const perNight = data.roomTypeId ? computePerNightRate(data.roomTypeId) : null;
  const total = perNight ? perNight * (data.nights || 1) : 0;
  const guestsStr = `${data.adults}A${data.children > 0 ? ` ${data.children}C` : ''}`;

  // Step 1 → 2 gate.
  const datesValid = !!data.checkIn && (data.nights || 0) > 0 && (data.adults || 0) > 0;
  // Step 2 → 3 gate.
  const roomValid = !!data.roomTypeId && availUnitsFor(data.roomTypeId) > 0;
  // Submit gate.
  const guestValid = data.name.trim().length > 0 && data.phone.replace(/\D/g, '').length >= 7;

  const handleSubmit = () => {
    if (!guestValid || !roomValid) return;
    const startIdx = dateToIdx(data.checkIn);
    const newBooking = {
      // Server (or local fallback) assigns the actual id.
      guest: data.name.trim(),
      phone: '+91 ' + data.phone.replace(/\D/g, ''),
      email: data.email.trim() || undefined,
      country: 'IN',
      startIdx, nights: data.nights || 1,
      roomTypeId: data.roomTypeId,
      roomItems: [{ roomTypeId: data.roomTypeId, adults: data.adults, children: data.children, rate: perNight }],
      total, paid: 0,
      guests: guestsStr,
      notes: data.notes.trim() || `Booked via website widget`,
      status: 'tentative',
      channel: 'website',
      mealPlanId: 'ep',
      ratePlanId: data.ratePlanId,
      // Hold for 24h so the hotelier has a window to confirm + chase
      // payment without auto-cancelling on the customer.
      releaseTs: Date.now() + 24 * 60 * 60 * 1000,
      releaseAt: 'within 24h',
      holdHours: 24,
    };
    const id = onSubmit(newBooking);
    const finalId = id || ('BK-' + Date.now().toString(36));
    setCreatedBookingId(finalId);
    setCreatedBooking({ ...newBooking, id: finalId });
    setStep(4);
  };

  const propName = property?.profile?.name || 'Our property';
  const propAddr = [property?.profile?.city, property?.profile?.state].filter(Boolean).join(', ');
  const brandHue = property?.theme?.hue ?? 38;
  const brandColor = property?.theme?.color || `oklch(70% 0.15 ${brandHue})`;

  return (
    <div style={{
      height: '100%', background: T.bg, display: 'flex', flexDirection: 'column',
      fontFamily: 'inherit',
    }}>
      {/* Brand header — customer sees the hotel's identity, not Atithi's. */}
      <div style={{
        background: `linear-gradient(135deg, ${T.primary}, ${T.primaryDk})`,
        color: '#fff', padding: '20px 18px', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: '#fff', padding: 4, flexShrink: 0 }}>
            {property?.profile?.logoDataUrl ? (
              <img src={property.profile.logoDataUrl} alt="Logo" style={{ width: '100%', height: '100%', borderRadius: 8, objectFit: 'contain' }} />
            ) : (
              <div style={{ width: '100%', height: '100%', borderRadius: 8, background: brandColor, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 800, fontFamily: 'Georgia, serif' }}>
                {(propName || 'A').trim().charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{propName}</div>
            {propAddr && <div style={{ fontSize: 12, opacity: 0.85, marginTop: 2 }}>{propAddr}</div>}
            <div style={{ fontSize: 10, opacity: 0.7, marginTop: 4, letterSpacing: 0.4, textTransform: 'uppercase' }}>
              {step === 4 ? 'Booking confirmed' : `Book direct · Step ${step} of 3`}
            </div>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        {/* ---------- STEP 1: dates + guests ---------- */}
        {step === 1 && (
          <>
            <SectionTitle>When are you staying?</SectionTitle>
            <Card>
              <Field label="Check-in date">
                <input
                  type="date"
                  value={data.checkIn}
                  min={ymd(new Date(ANCHOR))}
                  onChange={(e) => set('checkIn', e.target.value)}
                  style={inputStyle}
                />
                {data.checkIn && (() => {
                  const h = holidayFor(data.checkIn);
                  return h && (
                    <div style={{ marginTop: 6, padding: '6px 8px', background: 'oklch(96% 0.04 75)', border: '1px solid oklch(72% 0.12 75)', borderRadius: 6, fontSize: 11, color: 'oklch(40% 0.10 75)', fontWeight: 600 }}>
                      📅 {h.label}{h.intensity === 'high' ? ' — high demand' : ''}
                    </div>
                  );
                })()}
              </Field>
              <Field label="Nights">
                <Stepper value={data.nights} onChange={(v) => set('nights', Math.max(1, Math.min(60, v)))} />
              </Field>
              {checkOutIso && (
                <div style={{ fontSize: 11, color: T.ink3, marginTop: -2 }}>
                  Check-out: <strong style={{ color: T.ink2 }}>{new Date(checkOutIso + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}</strong>
                </div>
              )}
              {/* Mini calendar preview — gives the customer a visual sense
                  of which nights they're booking (handy if their stay
                  spans a weekend or month boundary). */}
              {data.checkIn && <MiniCalendar checkInIso={data.checkIn} nights={data.nights} />}
            </Card>

            <SectionTitle style={{ marginTop: 18 }}>How many guests?</SectionTitle>
            <Card>
              <Field label="Adults">
                <Stepper value={data.adults} onChange={(v) => set('adults', Math.max(1, Math.min(12, v)))} />
              </Field>
              <Field label={`Children${(property?.accountant?.childAgeBelow ?? 12) ? ` (under ${property?.accountant?.childAgeBelow ?? 12}y)` : ''}`}>
                <Stepper value={data.children} onChange={(v) => set('children', Math.max(0, Math.min(8, v)))} />
              </Field>
            </Card>

            <PrimaryBtn disabled={!datesValid} onClick={() => setStep(2)}>
              See available rooms →
            </PrimaryBtn>
          </>
        )}

        {/* ---------- STEP 2: room picker ---------- */}
        {step === 2 && (
          <>
            <SectionTitle>Pick a room</SectionTitle>
            <div style={{ fontSize: 12, color: T.ink3, marginBottom: 12, lineHeight: 1.5 }}>
              {data.nights} night{data.nights > 1 ? 's' : ''} · {guestsStr} · {new Date(data.checkIn + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} → {new Date(checkOutIso + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {ROOM_TYPES.map(rt => {
                const avail = availUnitsFor(rt.id);
                const soldOut = avail === 0;
                const rate = computePerNightRate(rt.id);
                const sel = data.roomTypeId === rt.id;
                return (
                  <button
                    key={rt.id}
                    onClick={() => !soldOut && set('roomTypeId', rt.id)}
                    disabled={soldOut}
                    style={{
                      textAlign: 'left',
                      padding: 14, borderRadius: 12,
                      background: sel ? T.primaryLt : T.card,
                      border: `2px solid ${sel ? T.primary : T.borderSoft}`,
                      cursor: soldOut ? 'not-allowed' : 'pointer',
                      opacity: soldOut ? 0.55 : 1,
                      display: 'flex', alignItems: 'center', gap: 12,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: sel ? T.primaryDk : T.ink }}>{rt.name}</div>
                      <div style={{ fontSize: 11, color: T.ink3, marginTop: 3 }}>
                        {soldOut ? 'Sold out for these dates' : `${avail} of ${rt.units} available`}
                      </div>
                    </div>
                    {!soldOut && rate != null && (
                      <div style={{ textAlign: 'right' }}>
                        <div className="tnum" style={{ fontSize: 16, fontWeight: 800, color: sel ? T.primaryDk : T.ink, letterSpacing: -0.3 }}>
                          ₹{rate.toLocaleString('en-IN')}
                        </div>
                        <div style={{ fontSize: 9, color: T.ink3, fontWeight: 600, marginTop: 2 }}>per night</div>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Rate plan picker — only when multiple are enabled. */}
            {ratePlans.length > 1 && data.roomTypeId && (
              <>
                <SectionTitle style={{ marginTop: 18 }}>Choose a rate plan</SectionTitle>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {ratePlans.map(rp => {
                    const sel = rp.id === data.ratePlanId;
                    return (
                      <button
                        key={rp.id}
                        onClick={() => set('ratePlanId', rp.id)}
                        style={{
                          textAlign: 'left',
                          padding: '10px 12px', borderRadius: 10,
                          background: sel ? T.primaryLt : T.card,
                          border: `1.5px solid ${sel ? T.primary : T.border}`,
                          cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: 10,
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: sel ? T.primaryDk : T.ink }}>{rp.label}</div>
                          <div style={{ fontSize: 10, color: T.ink3, marginTop: 2 }}>
                            {rp.cancellation === 'non-refundable' ? 'No refunds on cancellation' : `Free cancel ${rp.refundHours}h before arrival`}
                          </div>
                        </div>
                        {rp.multiplierPct !== 0 && (
                          <span className="tnum" style={{ fontSize: 12, fontWeight: 700, color: rp.multiplierPct > 0 ? T.ink2 : T.ok }}>
                            {rp.multiplierPct > 0 ? '+' : ''}{rp.multiplierPct}%
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
              <SecondaryBtn onClick={() => setStep(1)}>← Back</SecondaryBtn>
              <PrimaryBtn disabled={!roomValid} onClick={() => setStep(3)}>
                Continue · ₹{total.toLocaleString('en-IN')}
              </PrimaryBtn>
            </div>
          </>
        )}

        {/* ---------- STEP 3: guest info ---------- */}
        {step === 3 && (
          <>
            <SectionTitle>Your details</SectionTitle>
            <Card>
              <Field label="Full name">
                <input value={data.name} onChange={(e) => set('name', e.target.value)} placeholder="As on your ID" style={inputStyle} />
              </Field>
              <Field label="Mobile number (WhatsApp)">
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 13, color: T.ink2, fontWeight: 700, flexShrink: 0 }}>+91</span>
                  <input value={data.phone} onChange={(e) => set('phone', e.target.value)} placeholder="98100 00000" inputMode="numeric" style={{ ...inputStyle, flex: 1 }} />
                </div>
              </Field>
              <Field label="Email (optional)">
                <input type="email" value={data.email} onChange={(e) => set('email', e.target.value)} placeholder="you@email.com" style={inputStyle} />
              </Field>
              <Field label="Anything we should know? (optional)">
                <textarea value={data.notes} onChange={(e) => set('notes', e.target.value)} placeholder="e.g. anniversary, arriving late, dietary preferences" rows={2} style={{ ...inputStyle, resize: 'vertical', minHeight: 60, fontFamily: 'inherit' }} />
              </Field>
            </Card>

            <SectionTitle style={{ marginTop: 18 }}>Booking summary</SectionTitle>
            <Card>
              <SummaryRow label="Stay" value={`${data.nights} night${data.nights > 1 ? 's' : ''}, ${guestsStr}`} />
              <SummaryRow label="Check-in" value={new Date(data.checkIn + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })} />
              <SummaryRow label="Check-out" value={new Date(checkOutIso + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })} />
              <SummaryRow label="Room" value={selectedRT?.name || ''} />
              <SummaryRow label="Rate" value={`₹${perNight?.toLocaleString('en-IN')} × ${data.nights} night${data.nights > 1 ? 's' : ''}`} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0 4px', borderTop: `1px solid ${T.borderSoft}`, marginTop: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>Total</span>
                <span className="tnum" style={{ fontSize: 18, fontWeight: 800, color: T.primaryDk, letterSpacing: -0.4 }}>₹{total.toLocaleString('en-IN')}</span>
              </div>
              <div style={{ fontSize: 10, color: T.ink3, fontStyle: 'italic', marginTop: 4 }}>
                Taxes (CGST/SGST as applicable) will be added on your final bill at check-in.
              </div>
              {/* Stay calendar — same mini-calendar from step 1, repeated
                  here so the customer can visually confirm the nights
                  they're committing to before tapping Confirm. */}
              <MiniCalendar checkInIso={data.checkIn} nights={data.nights} />
            </Card>

            <div style={{ padding: '10px 12px', background: T.indigoLt, border: `1px solid ${T.indigo}`, borderRadius: 8, marginTop: 12, fontSize: 11, color: T.indigo, lineHeight: 1.5, fontWeight: 600 }}>
              <Icon name="info" size={11} /> Your booking will be held for 24h while we confirm via WhatsApp / phone. No payment needed right now.
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
              <SecondaryBtn onClick={() => setStep(2)}>← Back</SecondaryBtn>
              <PrimaryBtn disabled={!guestValid} onClick={handleSubmit}>
                Confirm booking
              </PrimaryBtn>
            </div>
          </>
        )}

        {/* ---------- STEP 4: confirmation ---------- */}
        {step === 4 && (
          <div style={{ paddingTop: 16, textAlign: 'center' }}>
            <div style={{ width: 78, height: 78, borderRadius: '50%', background: T.okLt, color: T.ok, margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="check" size={42} stroke={2.5} />
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: T.ink, letterSpacing: -0.3 }}>Thank you, {data.name.split(' ')[0]}!</div>
            <div style={{ fontSize: 13, color: T.ink3, marginTop: 6, lineHeight: 1.5, maxWidth: 320, margin: '6px auto 0' }}>
              Your booking is in our diary. We'll WhatsApp you shortly to confirm and share check-in details.
            </div>
            {createdBookingId && (
              <div style={{ fontSize: 11, color: T.ink3, marginTop: 8 }}>
                Reference: <strong className="tnum" style={{ color: T.primaryDk }}>{createdBookingId}</strong>
              </div>
            )}

            {/* Voucher actions — customer can save / print the voucher
                themselves, and (if they gave us an email) compose a
                mailto with the summary pre-filled. Auto-send via Resend
                is queued for Phase 3 once the property owner connects
                an SMTP API key in Settings → Integrations. */}
            {createdBooking && (
              <div style={{ marginTop: 18, display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                <button
                  onClick={() => {
                    const rt = ROOM_TYPES.find(r => r.id === createdBooking.roomTypeId);
                    generateVoucher(createdBooking, rt, property, undefined, 'en');
                  }}
                  style={{
                    padding: '10px 16px', borderRadius: 8,
                    border: `1.5px solid ${T.primary}`, background: T.primaryLt, color: T.primaryDk,
                    fontSize: 13, fontWeight: 700, cursor: 'pointer',
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                  }}
                >
                  <Icon name="download" size={13} stroke={2.2} color={T.primaryDk} /> Download voucher
                </button>
                {data.email && (() => {
                  const checkInLabel = new Date(data.checkIn + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
                  const checkOutLabel = new Date(checkOutIso + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
                  const body = [
                    `Hi ${data.name},`,
                    ``,
                    `Your booking at ${propName} is in our diary.`,
                    ``,
                    `Reference: ${createdBookingId}`,
                    `Check-in:  ${checkInLabel}`,
                    `Check-out: ${checkOutLabel} (${data.nights} night${data.nights > 1 ? 's' : ''})`,
                    `Room:      ${selectedRT?.name || ''}`,
                    `Total:     ₹${total.toLocaleString('en-IN')}`,
                    ``,
                    `We'll WhatsApp you shortly to confirm.`,
                    ``,
                    `— ${propName}${property?.profile?.phone ? `\n${property.profile.phone}` : ''}`,
                  ].join('\n');
                  const mailto = `mailto:${data.email}?subject=${encodeURIComponent(`Booking ${createdBookingId} at ${propName}`)}&body=${encodeURIComponent(body)}`;
                  return (
                    <a
                      href={mailto}
                      style={{
                        padding: '10px 16px', borderRadius: 8,
                        border: `1.5px solid ${T.border}`, background: T.card, color: T.ink2,
                        fontSize: 13, fontWeight: 700, cursor: 'pointer', textDecoration: 'none',
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                      }}
                    >
                      <Icon name="mail" size={13} stroke={2.2} color={T.ink2} /> Email a copy
                    </a>
                  );
                })()}
              </div>
            )}

            {/* Payment QR — voluntary; the hotelier confirms by phone first
                so customers aren't pressured to pay before they hear back. */}
            {property?.profile?.paymentQrDataUrl && (
              <div style={{ marginTop: 22, padding: 16, background: T.bgSoft, border: `1px solid ${T.borderSoft}`, borderRadius: 12, maxWidth: 320, margin: '22px auto 0' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: T.ink3, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>
                  Want to lock it in? Scan to pay ₹{total.toLocaleString('en-IN')}
                </div>
                <img src={property.profile.paymentQrDataUrl} alt="Pay" style={{ width: 160, height: 160, borderRadius: 10, background: '#fff', padding: 6 }} />
                {property?.profile?.paymentQrLabel && (
                  <div style={{ fontSize: 11, color: T.ink2, marginTop: 6, fontWeight: 600 }}>{property.profile.paymentQrLabel}</div>
                )}
                <div style={{ fontSize: 10, color: T.ink3, marginTop: 6, lineHeight: 1.5 }}>
                  Pay via any UPI app. WhatsApp us a screenshot of the payment so we can confirm faster.
                </div>
              </div>
            )}

            {property?.profile?.phone && (
              <div style={{ marginTop: 20, fontSize: 12, color: T.ink2 }}>
                Questions? Call or WhatsApp <strong className="tnum">{property.profile.phone}</strong>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer — small, honest Atithi credit. Helps trust ("real product, not a scam"). */}
      <div style={{ padding: '10px 16px', borderTop: `1px solid ${T.borderSoft}`, background: T.card, fontSize: 10, color: T.ink3, textAlign: 'center', flexShrink: 0 }}>
        Booking powered by <strong>Atithi</strong>
      </div>
    </div>
  );
}

// ============================================================================
// Mini calendar — read-only 5-week grid anchored on the month containing
// the check-in date. Highlights every night of the stay so the customer
// can see at a glance how many nights they're booking and whether they
// cross into a different month / weekend.
// ============================================================================

function MiniCalendar({ checkInIso, nights }) {
  if (!checkInIso) return null;
  const checkIn = new Date(checkInIso + 'T00:00:00');
  if (isNaN(checkIn.getTime())) return null;
  const checkOutMs = new Date(checkIn).setDate(checkIn.getDate() + (nights || 1));

  // Anchor the grid at the first Monday on/before the 1st of the
  // check-in month. 5 weeks usually covers the month + a day or two
  // either side; if the stay spills into the next month and we'd miss
  // the check-out, extend to 6 weeks.
  const monthStart = new Date(checkIn);
  monthStart.setDate(1);
  const monthStartDow = (monthStart.getDay() + 6) % 7; // Mon=0..Sun=6
  const gridStart = new Date(monthStart);
  gridStart.setDate(1 - monthStartDow);
  // Pick 5 or 6 rows depending on whether the check-out is still in the
  // 5-row window.
  const fiveRowEnd = new Date(gridStart);
  fiveRowEnd.setDate(gridStart.getDate() + 35);
  const rows = fiveRowEnd.getTime() <= checkOutMs ? 6 : 5;

  const cells = [];
  for (let i = 0; i < rows * 7; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    const inStay = d.getTime() >= checkIn.getTime() && d.getTime() < checkOutMs;
    const isCheckIn = d.toDateString() === checkIn.toDateString();
    const isCheckOut = d.getTime() === checkOutMs;
    const inMonth = d.getMonth() === checkIn.getMonth();
    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
    const today = new Date(ANCHOR);
    today.setHours(0, 0, 0, 0);
    const isToday = d.getTime() === today.getTime();
    cells.push({ d, inStay, isCheckIn, isCheckOut, inMonth, isWeekend, isToday });
  }

  return (
    <div style={{ background: T.bgSoft, border: `1px solid ${T.borderSoft}`, borderRadius: 10, padding: 12, marginTop: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: T.ink2, letterSpacing: 0.6, marginBottom: 8, textAlign: 'center', textTransform: 'uppercase' }}>
        {checkIn.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3, marginBottom: 4 }}>
        {['Mo','Tu','We','Th','Fr','Sa','Su'].map((d, i) => (
          <div key={d} style={{ textAlign: 'center', fontSize: 9, fontWeight: 700, color: i >= 5 ? T.primary : T.ink3, letterSpacing: 0.3 }}>{d}</div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
        {cells.map((c, i) => (
          <div
            key={i}
            style={{
              aspectRatio: '1 / 1', borderRadius: 6,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: c.inStay ? 800 : 600,
              color: c.inStay ? '#fff' : c.inMonth ? (c.isWeekend ? T.primary : T.ink) : T.ink3,
              opacity: c.inMonth || c.inStay ? 1 : 0.4,
              background: c.inStay ? T.primary : c.isToday ? T.primaryLt : 'transparent',
              border: c.isToday && !c.inStay ? `1.5px solid ${T.primary}` : 'none',
              position: 'relative',
            }}
            title={c.d.toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'short' })}
            className="tnum"
          >
            {c.d.getDate()}
            {c.isCheckIn && (
              <span style={{ position: 'absolute', top: 1, right: 2, fontSize: 6, fontWeight: 800, color: '#fff', letterSpacing: 0.2 }}>IN</span>
            )}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, fontSize: 10, color: T.ink3, fontWeight: 600 }}>
        <span><strong style={{ color: T.ink2 }}>{checkIn.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</strong> → <strong style={{ color: T.ink2 }}>{new Date(checkOutMs).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</strong></span>
        <span style={{ color: T.primaryDk, fontWeight: 700 }}>{nights} night{nights > 1 ? 's' : ''}</span>
      </div>
    </div>
  );
}

// ============================================================================
// Small layout helpers, kept local so the widget stays self-contained.
// ============================================================================

const inputStyle = {
  width: '100%', boxSizing: 'border-box',
  border: `1px solid ${T.border}`, outline: 'none', borderRadius: 8,
  padding: '10px 12px', fontSize: 14, fontWeight: 600, color: T.ink,
  background: T.card,
};

function SectionTitle({ children, style }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 800, color: T.ink2, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8, ...style }}>
      {children}
    </div>
  );
}

function Card({ children }) {
  return (
    <div style={{ background: T.card, border: `1px solid ${T.borderSoft}`, borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {children}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, color: T.ink3, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 5 }}>{label}</div>
      {children}
    </div>
  );
}

function Stepper({ value, onChange }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <button onClick={() => onChange(value - 1)} style={stepBtn}>−</button>
      <span className="tnum" style={{ fontSize: 16, fontWeight: 700, color: T.ink, minWidth: 22, textAlign: 'center' }}>{value}</span>
      <button onClick={() => onChange(value + 1)} style={stepBtn}>+</button>
    </div>
  );
}

const stepBtn = {
  width: 30, height: 30, borderRadius: '50%',
  border: `1px solid ${T.border}`, background: T.card, color: T.ink2,
  fontSize: 17, fontWeight: 700, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
};

function SummaryRow({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, padding: '4px 0' }}>
      <span style={{ fontSize: 12, color: T.ink3, fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 12, color: T.ink, fontWeight: 700, textAlign: 'right' }}>{value}</span>
    </div>
  );
}

function PrimaryBtn({ children, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: '100%', marginTop: 14,
        padding: '13px 16px', borderRadius: 10, border: 'none',
        background: disabled ? `color-mix(in oklch, ${T.primary} 40%, white)` : T.primary,
        color: '#fff', fontSize: 15, fontWeight: 700, letterSpacing: 0.2,
        cursor: disabled ? 'not-allowed' : 'pointer',
        boxShadow: disabled ? 'none' : `0 2px 8px color-mix(in oklch, ${T.primary} 35%, transparent)`,
      }}
    >{children}</button>
  );
}

function SecondaryBtn({ children, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: '0 0 auto', padding: '13px 16px', borderRadius: 10,
        border: `1px solid ${T.border}`, background: T.card, color: T.ink2,
        fontSize: 14, fontWeight: 700, cursor: 'pointer',
      }}
    >{children}</button>
  );
}

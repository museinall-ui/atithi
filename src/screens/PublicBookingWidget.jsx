import { useState, useMemo, useRef } from 'react';
import { T } from '../tokens.js';
import { ANCHOR, ymd, dateToIdx, effectiveRoomTypes, effectiveRatePlans, ratePlanById, defaultRatePlanId, effectiveMealPlans, mealPlanById, AMENITIES } from '../data.js';
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

export default function PublicBookingWidget({ property, bookings, rateOverrides = {}, savedCustomExtras = [], onSubmit }) {
  const ROOM_TYPES = effectiveRoomTypes(property);
  const ratePlans = effectiveRatePlans(property);
  const mealPlans = effectiveMealPlans(property).filter(mp => mp.enabled);
  const defaultMealPlanId = property?.defaultMealPlanId || 'ep';

  const [step, setStep] = useState(1);
  const [data, setData] = useState({
    checkIn: '',
    nights: 1,
    // Total rooms the guest wants — drives the multi-room booking
    // path. Defaults to 1; if the guest bumps it up, the same room
    // category is booked N times and the guest count below is
    // distributed evenly across rooms.
    rooms: 1,
    adults: 2,
    children: 0,
    roomTypeId: null,
    ratePlanId: defaultRatePlanId(),
    // Default to the property's default meal plan so the displayed
    // room rate matches what the guest will be charged. If they pick
    // a different plan we add (or subtract) the per-guest-per-night
    // delta — same model the hotelier-side uses.
    mealPlanId: defaultMealPlanId,
    // {extraId: quantity} — multi-select with per-extra qty.
    extras: {},
    name: '',
    phone: '',
    email: '',
    notes: '',
  });
  const [createdBookingId, setCreatedBookingId] = useState(null);
  const [createdBooking, setCreatedBooking] = useState(null);

  const set = (k, v) => setData(d => ({ ...d, [k]: v }));

  // Native date input ref — used to programmatically open the picker on
  // tap. The .atithi global CSS makes the input's own text transparent
  // (so the custom overlay below renders the formatted label cleanly),
  // so we MUST overlay a label or the cell looks empty after picking.
  const checkInDateRef = useRef(null);
  const openCheckInPicker = () => {
    const el = checkInDateRef.current;
    if (!el) return;
    if (typeof el.showPicker === 'function') {
      try { el.showPicker(); } catch {}
    }
  };
  const checkInLabel = (() => {
    if (!data.checkIn) return '';
    const d = new Date(data.checkIn + 'T00:00:00');
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
  })();

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

  // Per-night rates for a stay, room-type pair. Returns an array of
  // {iso, rate, isWknd, seasonName?} so the summary can show a
  // breakdown when nights differ.
  const computePerNightRates = (typeId) => {
    if (!data.checkIn) return [];
    const rt = ROOM_TYPES.find(r => r.id === typeId);
    if (!rt) return [];
    const rpObj = ratePlanById(property, data.ratePlanId) || { multiplierPct: 0 };
    const rpMult = 1 + ((rpObj.multiplierPct || 0) / 100);
    const out = [];
    for (let i = 0; i < (data.nights || 1); i++) {
      const d = new Date(data.checkIn + 'T00:00:00');
      d.setDate(d.getDate() + i);
      const iso = ymd(d);
      const isWknd = weekendDays.includes(d.getDay());
      const matchingSeason = seasons.find(s => iso >= s.startIso && iso <= s.endIso);
      const seasonMult = matchingSeason ? (1 + ((matchingSeason.multiplierPct || 0) / 100)) : 1;
      const wkMult = isWknd ? (1 + upliftPct / 100) : 1;
      const rate = Math.round(rt.base * wkMult * seasonMult * rpMult);
      out.push({ iso, rate, isWknd, seasonName: matchingSeason ? matchingSeason.name : null });
    }
    return out;
  };

  const computePerNightRate = (typeId) => {
    const nights = computePerNightRates(typeId);
    if (!nights.length) return null;
    // Average across the stay — used for the room-tile rate label
    // ("₹4,500 per night"). Step 3 shows the per-night breakdown if
    // the rates actually differ from night to night.
    const sum = nights.reduce((s, n) => s + n.rate, 0);
    return Math.round(sum / nights.length);
  };

  // Availability check — counts bookings that overlap the requested
  // window for a given room type, plus subtracts any hotelier-blocked
  // units / whole-type close-outs from rateOverrides. A type is
  // available if at least one unit is free for every night.
  //
  // Two kinds of close-out:
  //   - overrides[type:day].closed === true  → whole type unavailable
  //     that day; the type is hidden from the guest-facing widget.
  //   - overrides[type:day].closedUnits = [..] → N specific units
  //     blocked that day; subtract their count from the unit pool.
  //
  // The hotelier can still book on closed units from the in-app
  // NewBooking flow (with a warning); this guest-facing widget
  // honours close-outs strictly because the public can't override.
  const availUnitsFor = (typeId) => {
    const rt = ROOM_TYPES.find(r => r.id === typeId);
    if (!rt || !data.checkIn) return rt ? rt.units : 0;
    const start = dateToIdx(data.checkIn);
    const end = start + (data.nights || 1);
    let maxBlocked = 0;
    for (let day = start; day < end; day++) {
      const o = rateOverrides[`${typeId}:${day}`];
      // Whole-type close-out on any night in the range → 0 available.
      if (o && o.closed) return 0;
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
      // Sum roomItems of this type per overlapping booking.
      const booked = overlapping.reduce((sum, b) => {
        const items = Array.isArray(b.roomItems) && b.roomItems.length
          ? b.roomItems
          : [{ roomTypeId: b.roomTypeId }];
        return sum + items.filter(it => (it.roomTypeId || b.roomTypeId) === typeId).length;
      }, 0);
      const closedCount = (o && Array.isArray(o.closedUnits)) ? o.closedUnits.length : 0;
      const blocked = booked + closedCount;
      if (blocked > maxBlocked) maxBlocked = blocked;
    }
    return Math.max(0, rt.units - maxBlocked);
  };

  const selectedRT = ROOM_TYPES.find(r => r.id === data.roomTypeId);
  const perNightArray = data.roomTypeId ? computePerNightRates(data.roomTypeId) : [];
  const perNight = perNightArray.length ? Math.round(perNightArray.reduce((s, n) => s + n.rate, 0) / perNightArray.length) : null;
  const ratesVary = perNightArray.length > 1 && perNightArray.some(n => n.rate !== perNightArray[0].rate);
  // Multi-room: rate × rooms × nights. Each room is the same category
  // (simpler UX than mixed-type which adds a per-room picker; a guest
  // wanting mixed types can just make two bookings).
  const rooms = Math.max(1, data.rooms || 1);
  // Use the actual per-night array sum (not the average × nights) so
  // the displayed total exactly matches the breakdown numbers.
  const roomCost = perNightArray.length ? perNightArray.reduce((s, n) => s + n.rate, 0) * rooms : 0;

  // Distribute guests evenly across N rooms. Remainder goes to the
  // earlier rooms (so 7 adults across 3 rooms = [3, 2, 2]). Used to
  // build the booking's roomItems[] on submit + the guests label.
  const distributeAcross = (count, n) => {
    const base = Math.floor(count / n);
    const rem = count - base * n;
    return Array.from({ length: n }, (_, i) => base + (i < rem ? 1 : 0));
  };
  const adultsPerRoom = distributeAcross(data.adults || 0, rooms);
  const childrenPerRoom = distributeAcross(data.children || 0, rooms);

  // Meal plan delta vs the property's default plan. Default plan = the
  // one the calendar rate is treated as already including. Switching
  // adds the per-guest-per-night price difference × guests × nights.
  // Negative deltas (cheaper plan than default) reduce the total.
  const mealDelta = (() => {
    if (!data.mealPlanId || !mealPlans.length) return 0;
    const picked = mealPlanById(property, data.mealPlanId);
    const def = mealPlanById(property, defaultMealPlanId);
    if (!picked || !def) return 0;
    if (picked.id === def.id) return 0;
    const totalGuests = (data.adults || 0) + (data.children || 0);
    return Math.round(((picked.price || 0) - (def.price || 0)) * totalGuests * (data.nights || 1));
  })();

  // Sum of selected extras. Each extra has a unit that determines the
  // multiplier: per stay (×1) / per night (×nights) / per guest
  // (×guests) / per guest per night (×guests×nights).
  const extrasLines = Object.entries(data.extras || {})
    .map(([id, qty]) => {
      const ex = savedCustomExtras.find(x => x.id === id);
      if (!ex || !qty) return null;
      const totalGuests = (data.adults || 0) + (data.children || 0);
      let mult = 1;
      switch (ex.unit) {
        case 'per night': mult = data.nights || 1; break;
        case 'per guest': mult = totalGuests; break;
        case 'per guest per night': mult = totalGuests * (data.nights || 1); break;
        default: mult = 1; // 'per stay'
      }
      const line = (ex.price || 0) * qty * mult;
      return { id, name: ex.name, qty, price: ex.price, unit: ex.unit, line };
    })
    .filter(Boolean);
  const extrasCost = extrasLines.reduce((s, e) => s + e.line, 0);

  const total = roomCost + mealDelta + extrasCost;
  const guestsStr = `${data.adults}A${data.children > 0 ? ` ${data.children}C` : ''}`;

  // Step 1 → 2 gate.
  const datesValid = !!data.checkIn && (data.nights || 0) > 0 && (data.adults || 0) > 0 && (data.rooms || 0) > 0;
  // Step 2 → 3 gate — must have enough units of the picked type to
  // cover the requested room count for every night.
  const roomValid = !!data.roomTypeId && availUnitsFor(data.roomTypeId) >= rooms;
  // Submit gate.
  const guestValid = data.name.trim().length > 0 && data.phone.replace(/\D/g, '').length >= 7;

  // Dynamic hold window: how many hours the booking stays tentative
  // before auto-release. Tighter when the check-in is close so we don't
  // tie up inventory the hotelier can still sell.
  //   >48h to check-in →  hold 12h (gives the hotelier a comfortable
  //                       window to verify + chase payment by WhatsApp)
  //   ≤48h to check-in → hold  4h (every hour matters; release fast
  //                       if the guest doesn't lock it in)
  const computeHoldHours = () => {
    if (!data.checkIn) return 12;
    const checkInTime = (property?.profile?.checkIn || '14:00');
    const checkInTs = new Date(data.checkIn + 'T' + checkInTime + ':00').getTime();
    const hoursAway = (checkInTs - Date.now()) / (60 * 60 * 1000);
    return hoursAway > 48 ? 12 : 4;
  };

  const handleSubmit = () => {
    if (!guestValid || !roomValid) return;
    const startIdx = dateToIdx(data.checkIn);
    const holdHours = computeHoldHours();
    const releaseTs = Date.now() + holdHours * 60 * 60 * 1000;
    const releaseDate = new Date(releaseTs);
    const releaseAt = releaseDate.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
    const newBooking = {
      // Server (or local fallback) assigns the actual id.
      guest: data.name.trim(),
      phone: '+91 ' + data.phone.replace(/\D/g, ''),
      email: data.email.trim() || undefined,
      country: 'IN',
      startIdx, nights: data.nights || 1,
      roomTypeId: data.roomTypeId,
      // One roomItems entry per requested room with the per-room
      // adult/child split. Hotelier-side multi-room rendering uses
      // exactly this shape, so the Diary pills + voucher rooms-card
      // light up correctly without any extra translation.
      roomItems: Array.from({ length: rooms }, (_, i) => ({
        roomTypeId: data.roomTypeId,
        adults: adultsPerRoom[i] || 0,
        children: childrenPerRoom[i] || 0,
        rate: perNight,
      })),
      total, paid: 0,
      guests: guestsStr,
      notes: data.notes.trim() || `Booked via website widget`,
      status: 'tentative',
      channel: 'website',
      mealPlanId: data.mealPlanId || defaultMealPlanId,
      ratePlanId: data.ratePlanId,
      // Selected saved extras → booking extras map + price overrides.
      // Use the price the guest saw at booking time even if the hotelier
      // later edits the saved-extra catalog (price honesty principle).
      customExtras: Object.keys(data.extras).filter(id => (data.extras[id] || 0) > 0).map(id => {
        const ex = savedCustomExtras.find(x => x.id === id);
        return ex ? { id: ex.id, label: ex.name || 'Extra', price: ex.price || 0 } : null;
      }).filter(Boolean),
      extras: Object.fromEntries(Object.entries(data.extras).filter(([, q]) => (q || 0) > 0)),
      extraPrices: Object.fromEntries(
        Object.keys(data.extras)
          .filter(id => (data.extras[id] || 0) > 0)
          .map(id => {
            const ex = savedCustomExtras.find(x => x.id === id);
            return ex ? [id, ex.price || 0] : null;
          })
          .filter(Boolean)
      ),
      // GST is not auto-applied for widget bookings — the hotelier
      // decides at folio time whether this booking goes on the GST
      // invoice register (some don't run their bookings through GST,
      // and the customer-facing voucher must not claim taxes apply).
      gstApplies: false,
      releaseTs,
      releaseAt,
      holdHours,
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
            {property?.profile?.tagline && (
              <div style={{ fontSize: 11.5, opacity: 0.9, marginTop: 4, fontStyle: 'italic', lineHeight: 1.4 }}>
                {property.profile.tagline}
              </div>
            )}
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
            {/* Property photo gallery — first thing the guest sees,
                anchors the "is this place worth my money" decision.
                Horizontal scroller; each photo is a fixed-height tile
                that maintains aspect ratio. Hidden when no photos
                uploaded so the layout doesn't show an empty band. */}
            {Array.isArray(property?.profile?.photoGallery) && property.profile.photoGallery.length > 0 && (
              <div style={{
                display: 'flex', gap: 8, overflowX: 'auto',
                marginBottom: 16, paddingBottom: 4,
                scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch',
              }}>
                {property.profile.photoGallery.map((url, i) => (
                  <img
                    key={i}
                    src={url}
                    alt={`${propName} ${i + 1}`}
                    style={{
                      height: 160, width: 'auto', borderRadius: 10,
                      objectFit: 'cover', flexShrink: 0,
                      border: `1px solid ${T.borderSoft}`,
                    }}
                  />
                ))}
              </div>
            )}

            <SectionTitle>When are you staying?</SectionTitle>
            <Card>
              <Field label="Check-in date">
                {/* Overlay-input pattern — see Diary.jsx / NewBooking.jsx.
                    The real native date input is full-size with its text
                    hidden by global CSS (.atithi rules in tokens.js).
                    A custom label + icon overlays on top via
                    pointer-events:none so taps pass through to the
                    input, opening the native picker reliably on every
                    browser. Without this overlay the cell looked empty
                    after picking — that's the bug we're closing. */}
                <div style={{
                  position: 'relative',
                  background: data.checkIn ? T.primaryLt : T.card,
                  border: `1px solid ${data.checkIn ? T.primary : T.border}`,
                  borderRadius: 8, height: 42, overflow: 'hidden',
                }}>
                  <input
                    ref={checkInDateRef}
                    type="date"
                    value={data.checkIn}
                    min={ymd(new Date(ANCHOR))}
                    onChange={(e) => set('checkIn', e.target.value)}
                    onClick={openCheckInPicker}
                    aria-label="Check-in date"
                    style={{
                      width: '100%', height: '100%',
                      border: 'none', outline: 'none', background: 'transparent',
                      padding: '0 12px', cursor: 'pointer', font: 'inherit',
                    }}
                  />
                  <div style={{
                    position: 'absolute', inset: 0, padding: '0 12px',
                    display: 'flex', alignItems: 'center', gap: 8,
                    pointerEvents: 'none',
                  }}>
                    <Icon name="cal" size={16} color={data.checkIn ? T.primaryDk : T.ink3} />
                    <span style={{
                      flex: 1, fontSize: 14, fontWeight: 600,
                      color: data.checkIn ? T.ink : T.ink3,
                      minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {checkInLabel || 'Tap to choose date'}
                    </span>
                  </div>
                </div>
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
              <Field label="Rooms">
                <Stepper value={data.rooms} onChange={(v) => set('rooms', Math.max(1, Math.min(5, v)))} />
              </Field>
              <Field label="Adults (total)">
                <Stepper value={data.adults} onChange={(v) => set('adults', Math.max(1, Math.min(20, v)))} />
              </Field>
              <Field label={`Children${(property?.accountant?.childAgeBelow ?? 12) ? ` (under ${property?.accountant?.childAgeBelow ?? 12}y, total)` : ' (total)'}`}>
                <Stepper value={data.children} onChange={(v) => set('children', Math.max(0, Math.min(15, v)))} />
              </Field>
              {data.rooms > 1 && (
                <div style={{ fontSize: 10.5, color: T.ink3, fontWeight: 600, lineHeight: 1.5, fontStyle: 'italic' }}>
                  Guests will be split across {data.rooms} rooms: {adultsPerRoom.map((a, i) => `${a}A${childrenPerRoom[i] > 0 ? ` ${childrenPerRoom[i]}C` : ''}`).join(' · ')}
                </div>
              )}
            </Card>

            <PrimaryBtn disabled={!datesValid} onClick={() => setStep(2)}>
              See available rooms →
            </PrimaryBtn>
          </>
        )}

        {/* ---------- STEP 2: room picker ---------- */}
        {step === 2 && (
          <>
            <SectionTitle>Pick a room{rooms > 1 ? ` (×${rooms})` : ''}</SectionTitle>
            <div style={{ fontSize: 12, color: T.ink3, marginBottom: 12, lineHeight: 1.5 }}>
              {data.nights} night{data.nights > 1 ? 's' : ''} · {guestsStr} · {rooms} room{rooms > 1 ? 's' : ''} · {new Date(data.checkIn + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} → {new Date(checkOutIso + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {ROOM_TYPES.map(rt => {
                const avail = availUnitsFor(rt.id);
                // Sold-out logic now respects the requested room count —
                // a type with only 1 unit free is "sold out" for a guest
                // who wants 2 rooms.
                const soldOut = avail < rooms;
                const rate = computePerNightRate(rt.id);
                const sel = data.roomTypeId === rt.id;
                // Resolve amenity chip labels — combine per-category +
                // property-wide ids, drop duplicates, look up the label
                // (custom amenities are stored on property.customAmenities
                // with { id, label } shape). Cap at 8 chips so the room
                // tile doesn't grow taller than the screen.
                const catIds = Array.isArray(rt.amenityIds) ? rt.amenityIds : [];
                const propIds = Array.isArray(property?.amenityIds) ? property.amenityIds : [];
                const all = Array.from(new Set([...catIds, ...propIds]));
                const customMap = new Map((property?.customAmenities || []).map(a => [a.id, a.label]));
                const amenityChips = all.map(id => {
                  const std = AMENITIES.find(a => a.id === id);
                  if (std) return { id, label: std.label };
                  if (customMap.has(id)) return { id, label: customMap.get(id) };
                  return null;
                }).filter(Boolean).slice(0, 8);
                return (
                  <button
                    key={rt.id}
                    onClick={() => !soldOut && set('roomTypeId', rt.id)}
                    disabled={soldOut}
                    style={{
                      textAlign: 'left',
                      padding: rt.photoDataUrl ? 0 : 14,
                      borderRadius: 12,
                      background: sel ? T.primaryLt : T.card,
                      border: `2px solid ${sel ? T.primary : T.borderSoft}`,
                      cursor: soldOut ? 'not-allowed' : 'pointer',
                      opacity: soldOut ? 0.55 : 1,
                      display: 'flex', flexDirection: 'column', gap: rt.photoDataUrl ? 0 : 10,
                      overflow: 'hidden',
                    }}
                  >
                    {/* Hero photo — the buy decision often happens here
                        before the guest reads anything else. Full-width
                        on top of the tile, fixed 180px height so all
                        tiles stay the same height. */}
                    {rt.photoDataUrl && (
                      <img
                        src={rt.photoDataUrl}
                        alt={rt.name}
                        style={{
                          width: '100%', height: 180, objectFit: 'cover',
                          display: 'block', flexShrink: 0,
                        }}
                      />
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: rt.photoDataUrl ? 14 : 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: sel ? T.primaryDk : T.ink }}>{rt.name}</div>
                        <div style={{ fontSize: 11, color: T.ink3, marginTop: 3 }}>
                          {soldOut
                            ? (avail === 0 ? 'Sold out for these dates' : `Only ${avail} of ${rooms} rooms available`)
                            : `${avail} of ${rt.units} available`}
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
                    </div>
                    {/* Inclusions hint — surfaces the default meal plan
                        so the guest knows what's bundled in the rate
                        before picking. Mirrors the model the hotelier
                        sets in Settings → Meal plans (defaultMealPlanId). */}
                    {(() => {
                      const defaultMP = mealPlanById(property, property?.defaultMealPlanId || 'ep');
                      if (!defaultMP) return null;
                      return (
                        <div style={{
                          fontSize: 10.5, fontWeight: 600,
                          color: sel ? T.primaryDk : T.ink2,
                          background: sel ? 'rgba(255,255,255,0.7)' : T.bgSoft,
                          border: `1px solid ${sel ? T.primaryDk : T.borderSoft}`,
                          borderRadius: 6, padding: '5px 8px',
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          alignSelf: 'flex-start',
                        }}>
                          <Icon name="check" size={10} color={sel ? T.primaryDk : T.ok} stroke={2.4} />
                          Includes: <strong>{defaultMP.code}</strong> · {defaultMP.label}
                        </div>
                      );
                    })()}
                    {amenityChips.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, width: '100%' }}>
                        {amenityChips.map(a => (
                          <span
                            key={a.id}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 3,
                              padding: '3px 8px', borderRadius: 999,
                              background: sel ? 'rgba(255,255,255,0.7)' : T.bgSoft,
                              color: sel ? T.primaryDk : T.ink2,
                              border: `1px solid ${sel ? T.primaryDk : T.borderSoft}`,
                              fontSize: 10, fontWeight: 600, letterSpacing: 0.1,
                            }}
                          >
                            <span style={{ width: 3, height: 3, borderRadius: 2, background: sel ? T.primaryDk : T.ink3 }} />
                            {a.label}
                          </span>
                        ))}
                      </div>
                    )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Cancellation chip — visible even when only one rate plan
                is enabled, so the guest always knows the policy. When
                multiple plans exist, the chip below shows the policy of
                the currently-picked plan and the picker (below) lets the
                guest switch. */}
            {data.roomTypeId && (() => {
              const rp = ratePlans.find(p => p.id === data.ratePlanId) || ratePlans[0];
              if (!rp) return null;
              const isNonRef = rp.cancellation === 'non-refundable';
              return (
                <div style={{
                  marginTop: 12, padding: '8px 10px',
                  background: isNonRef ? 'oklch(96% 0.04 30)' : T.okLt,
                  border: `1px solid ${isNonRef ? 'oklch(75% 0.12 30)' : T.ok}`,
                  borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8,
                  fontSize: 11, color: isNonRef ? 'oklch(40% 0.12 30)' : T.ok, fontWeight: 600,
                }}>
                  <Icon name={isNonRef ? 'lock' : 'check'} size={12} stroke={2.2} />
                  <span>
                    <strong>{isNonRef ? 'Non-refundable' : `Free cancel ${rp.refundHours || 48}h before arrival`}</strong>
                    {!isNonRef && rp.cancellation === 'moderate' && ' · 50% after that'}
                    {!isNonRef && rp.cancellation === 'strict' && ' · no refund after that'}
                  </span>
                </div>
              );
            })()}

            {/* Meal plan picker — shown when the hotelier has more than
                one enabled plan. Each option shows the per-guest-per-
                night delta vs the default plan (which is "Included" in
                the rate). Picking a different plan adjusts the total
                shown on the Continue button immediately. */}
            {data.roomTypeId && mealPlans.length > 1 && (
              <>
                <SectionTitle style={{ marginTop: 18 }}>Choose a meal plan</SectionTitle>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {mealPlans.map(mp => {
                    const sel = mp.id === data.mealPlanId;
                    const def = mealPlanById(property, defaultMealPlanId);
                    const isDefault = mp.id === defaultMealPlanId;
                    const totalGuests = (data.adults || 0) + (data.children || 0);
                    const deltaPerNight = isDefault ? 0 : ((mp.price || 0) - (def?.price || 0)) * totalGuests;
                    return (
                      <button
                        key={mp.id}
                        onClick={() => set('mealPlanId', mp.id)}
                        style={{
                          textAlign: 'left',
                          padding: '10px 12px', borderRadius: 10,
                          background: sel ? T.primaryLt : T.card,
                          border: `1.5px solid ${sel ? T.primary : T.border}`,
                          cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: 10,
                        }}
                      >
                        <span style={{
                          minWidth: 38, padding: '4px 6px',
                          fontSize: 11, fontWeight: 800, letterSpacing: 0.4,
                          color: sel ? T.primaryDk : T.ink2,
                          background: sel ? T.card : T.bgSoft,
                          border: `1px solid ${sel ? T.primary : T.borderSoft}`,
                          borderRadius: 5, textAlign: 'center',
                        }}>{mp.code}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: sel ? T.primaryDk : T.ink }}>{mp.label}</div>
                          <div style={{ fontSize: 10, color: T.ink3, marginTop: 2 }}>
                            {isDefault ? 'Included in rate' : (deltaPerNight === 0 ? 'Same price' : `${deltaPerNight > 0 ? '+' : '−'}₹${Math.abs(deltaPerNight).toLocaleString('en-IN')} / night for ${totalGuests} guest${totalGuests > 1 ? 's' : ''}`)}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </>
            )}

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

            {/* Optional add-ons — saved extras configured by the
                hotelier in Settings → Meal plans + saved extras. Each
                extra has a unit (per stay / night / guest / guest-per-
                night) that determines the multiplier on the qty. */}
            {savedCustomExtras.length > 0 && (
              <>
                <SectionTitle style={{ marginTop: 18 }}>Add extras (optional)</SectionTitle>
                <Card>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {savedCustomExtras.map(ex => {
                      const qty = data.extras[ex.id] || 0;
                      return (
                        <div key={ex.id} style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: 10, background: qty > 0 ? T.primaryLt : T.bgSoft,
                          border: `1px solid ${qty > 0 ? T.primary : T.borderSoft}`,
                          borderRadius: 8,
                        }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: qty > 0 ? T.primaryDk : T.ink }}>{ex.name || 'Extra'}</div>
                            <div className="tnum" style={{ fontSize: 10, color: T.ink3, marginTop: 2 }}>
                              ₹{(ex.price || 0).toLocaleString('en-IN')} · {ex.unit || 'per stay'}
                            </div>
                          </div>
                          <Stepper value={qty} onChange={(v) => setData(d => ({ ...d, extras: { ...d.extras, [ex.id]: Math.max(0, Math.min(9, v)) } }))} />
                        </div>
                      );
                    })}
                  </div>
                </Card>
              </>
            )}

            <SectionTitle style={{ marginTop: 18 }}>Booking summary</SectionTitle>
            <Card>
              <SummaryRow label="Stay" value={`${data.nights} night${data.nights > 1 ? 's' : ''}, ${guestsStr}`} />
              <SummaryRow label="Check-in" value={new Date(data.checkIn + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })} />
              <SummaryRow label="Check-out" value={new Date(checkOutIso + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })} />
              <SummaryRow label="Room" value={`${rooms} × ${selectedRT?.name || ''}`} />
              <SummaryRow label="Rate" value={ratesVary ? `Varies by night (see below)` : `₹${perNight?.toLocaleString('en-IN')} × ${data.nights} night${data.nights > 1 ? 's' : ''}${rooms > 1 ? ` × ${rooms} rooms` : ''}`} />
              {/* Per-night breakdown — only shown when rates differ
                  across nights (weekend uplift / season multiplier
                  kicks in mid-stay). Keeps the simple-stay case clean
                  while making the surprise-pricing case explicit. */}
              {ratesVary && (
                <div style={{
                  marginTop: 4, padding: '8px 10px',
                  background: T.bgSoft, border: `1px solid ${T.borderSoft}`,
                  borderRadius: 8,
                }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: T.ink3, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 6 }}>
                    Per-night breakdown
                  </div>
                  {perNightArray.map((n, i) => {
                    const d = new Date(n.iso + 'T00:00:00');
                    const dayLabel = d.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' });
                    return (
                      <div key={n.iso} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0', fontSize: 11 }}>
                        <span style={{ color: T.ink2, fontWeight: 600 }}>
                          {dayLabel}
                          {n.isWknd && <span style={{ marginLeft: 4, fontSize: 9, color: T.primaryDk, fontWeight: 700 }}>· weekend</span>}
                          {n.seasonName && <span style={{ marginLeft: 4, fontSize: 9, color: T.indigo, fontWeight: 700 }}>· {n.seasonName}</span>}
                        </span>
                        <span className="tnum" style={{ color: T.ink, fontWeight: 700 }}>₹{n.rate.toLocaleString('en-IN')}{rooms > 1 ? ` × ${rooms}` : ''}</span>
                      </div>
                    );
                  })}
                </div>
              )}
              {/* Meal plan line — show whenever a non-default plan is
                  picked OR when the property has more than one enabled
                  plan (so the guest sees which one is in effect). */}
              {(() => {
                const picked = mealPlanById(property, data.mealPlanId);
                if (!picked) return null;
                if (mealDelta === 0) {
                  return <SummaryRow label="Meal plan" value={`${picked.code} · ${picked.label}`} />;
                }
                return (
                  <>
                    <SummaryRow label="Meal plan" value={`${picked.code} · ${picked.label}`} />
                    <SummaryRow label={mealDelta > 0 ? 'Meal plan extra' : 'Meal plan discount'} value={`${mealDelta > 0 ? '+' : '−'}₹${Math.abs(mealDelta).toLocaleString('en-IN')}`} />
                  </>
                );
              })()}
              {extrasLines.map(e => (
                <SummaryRow key={e.id} label={`${e.name} × ${e.qty}`} value={`+₹${e.line.toLocaleString('en-IN')}`} />
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0 4px', borderTop: `1px solid ${T.borderSoft}`, marginTop: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>Total</span>
                <span className="tnum" style={{ fontSize: 18, fontWeight: 800, color: T.primaryDk, letterSpacing: -0.4 }}>₹{total.toLocaleString('en-IN')}</span>
              </div>
              {/* No tax / GST mention here — some hoteliers don't run
                  their bookings through GST, and the guest-facing total
                  must be what the guest actually pays. The hotelier
                  decides at folio time whether to issue a tax invoice. */}
              {/* Stay calendar — same mini-calendar from step 1, repeated
                  here so the customer can visually confirm the nights
                  they're committing to before tapping Confirm. */}
              <MiniCalendar checkInIso={data.checkIn} nights={data.nights} />
            </Card>

            {/* House rules — surfaced from property.rules[] so the guest
                sees what they're agreeing to BEFORE confirming. Collapsed
                by default to keep the summary view tight; tapping the
                header expands the list. */}
            {Array.isArray(property?.rules) && property.rules.length > 0 && (
              <details style={{
                marginTop: 12, padding: '10px 12px',
                background: T.bgSoft, border: `1px solid ${T.borderSoft}`,
                borderRadius: 8,
              }}>
                <summary style={{
                  fontSize: 12, fontWeight: 700, color: T.ink2,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                  listStyle: 'none', userSelect: 'none',
                }}>
                  <Icon name="info" size={13} color={T.ink2} />
                  House rules ({property.rules.length})
                  <span style={{ marginLeft: 'auto', fontSize: 10, color: T.ink3, fontWeight: 600 }}>tap to view</span>
                </summary>
                <ul style={{ margin: '10px 0 0 18px', padding: 0, fontSize: 11.5, color: T.ink2, lineHeight: 1.6 }}>
                  {property.rules.map((r, i) => (
                    <li key={i} style={{ marginBottom: 4 }}>{r}</li>
                  ))}
                </ul>
              </details>
            )}

            {(() => {
              const h = computeHoldHours();
              return (
                <div style={{ padding: '10px 12px', background: T.indigoLt, border: `1px solid ${T.indigo}`, borderRadius: 8, marginTop: 12, fontSize: 11, color: T.indigo, lineHeight: 1.5, fontWeight: 600 }}>
                  <Icon name="info" size={11} /> Your booking will be held for {h}h while we confirm via WhatsApp / phone. No payment needed right now.
                </div>
              );
            })()}

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

import { useState, useMemo, useRef, useEffect } from 'react';
import { T } from '../tokens.js';
import { ANCHOR, ymd, dateToIdx, effectiveRoomTypes, effectiveRatePlans, ratePlansActive, ratePerNight, ratePlanMultiplier, defaultRatePlanId, effectiveMealPlans, mealPlanById, extraGuestCostFor, stampExtraGuestAmounts, singleOccRateFor, safeUrl, AMENITIES, effectiveChildBands } from '../data.js';
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

export default function PublicBookingWidget({ property, bookings, rateOverrides = {}, savedCustomExtras = [], onSubmit, validateCoupon }) {
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
    // Children split into the same three age bands reception uses, so the
    // online quote matches exactly what the hotelier would charge: free band
    // (under the property's free age), half-rate band (the middle), and full
    // band (at/above the half age, billed like an adult). Thresholds come from
    // the hotelier's House-rules settings (childFreeBelowAge / childAgeBelow).
    // The 3-band picker only appears when the property actually charges for
    // extra children — otherwise a single "Children (total)" stepper shows and
    // everything lands in `children` (the bands wouldn't change the price).
    // Per-age-band child counts, keyed by the hotelier's band ids
    // (accountant.childBands). { [bandId]: count }. Replaces the old fixed
    // free/half/full trio so a property with custom bands collects the right
    // ages online. childCountsForItem maps legacy bookings forward.
    childBands: {},
    roomTypeId: null,
    ratePlanId: defaultRatePlanId(),
    // Default to the property's default meal plan so the displayed
    // room rate matches what the guest will be charged. If they pick
    // a different plan we add (or subtract) the per-guest-per-night
    // delta — same model the hotelier-side uses.
    mealPlanId: defaultMealPlanId,
    // {extraId: quantity} — multi-select with per-extra qty.
    extras: {},
    // Coupon code the guest entered, normalised to uppercase. Empty
    // until they apply one on Step 3.
    couponCode: '',
    couponError: '',
    name: '',
    phone: '',
    email: '',
    notes: '',
  });
  const [createdBookingId, setCreatedBookingId] = useState(null);
  const [createdBooking, setCreatedBooking] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

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
    const startIdx = dateToIdx(data.checkIn);
    const rpMult = ratePlanMultiplier(property, data.ratePlanId);
    const out = [];
    for (let i = 0; i < (data.nights || 1); i++) {
      const d = new Date(data.checkIn + 'T00:00:00');
      d.setDate(d.getDate() + i);
      const iso = ymd(d);
      const isWknd = weekendDays.includes(d.getDay());
      const matchingSeason = seasons.find(s => iso >= s.startIso && iso <= s.endIso);
      // Rate via the shared ratePerNight() helper so the guest sees the SAME
      // price the hotelier's NewBooking flow computes for the same date —
      // including per-day overrides set in the Rates calendar, which this
      // widget previously ignored (causing widget vs reception price drift).
      const raw = ratePerNight(property, rateOverrides, typeId, startIdx + i);
      const rate = Math.round(raw * rpMult);
      out.push({ iso, rate, rawRate: raw, isWknd, seasonName: matchingSeason ? matchingSeason.name : null });
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
  // Multi-room: each room is the same category (a guest wanting mixed types
  // makes two bookings).
  const rooms = Math.max(1, data.rooms || 1);
  // Distribute guests evenly across N rooms. Remainder goes to the earlier
  // rooms (7 adults across 3 rooms = [3, 2, 2]). Used for roomItems[] + the
  // guests label + per-room single-occupancy pricing below.
  const distributeAcross = (count, n) => {
    const base = Math.floor(count / n);
    const rem = count - base * n;
    return Array.from({ length: n }, (_, i) => base + (i < rem ? 1 : 0));
  };
  const adultsPerRoom = distributeAcross(data.adults || 0, rooms);
  // Children are collected per custom age band (effectiveChildBands). Distribute
  // each band's count across rooms so roomItems[].childBands mirrors exactly what
  // the cost engine + voucher read. Headcount (totalChildren) counts EVERY band
  // (a free-band toddler still eats a meal); the extra-guest surcharge weights
  // bands differently — pricing weight ≠ headcount.
  const ageBands = effectiveChildBands(property);
  const childBandsPerRoom = Array.from({ length: rooms }, () => ({}));
  let totalChildren = 0;
  for (const band of ageBands) {
    const cnt = (data.childBands && data.childBands[band.id]) || 0;
    if (!cnt) continue;
    totalChildren += cnt;
    distributeAcross(cnt, rooms).forEach((n, i) => { if (n) childBandsPerRoom[i][band.id] = n; });
  }
  // Per-room child fields. childBands is canonical; the legacy free/half/full
  // mirrors keep any surface still reading the old fields correct for the 3
  // default band ids (custom bands rely on childBands).
  const roomChildFields = (i) => {
    const cb = childBandsPerRoom[i] || {};
    return { childBands: cb, childrenFree: cb.free || 0, children: cb.half || 0, childrenFull: cb.full || 0 };
  };
  // The 3-band child picker only matters when the property charges for extra
  // children (a per-category extraChild rule, or a season override). Otherwise
  // the bands are price-identical, so we keep a single "Children" stepper.
  const chRatesAcc = property?.accountant || {};
  const anyChildRule = (m) => m && Object.values(m).some(r => r && r.mode && r.mode !== 'free' && (+r.value || 0) > 0);
  const chargesForChildren =
    (chRatesAcc.childRatesByCategory && Object.values(chRatesAcc.childRatesByCategory).some(anyChildRule)) ||
    (chRatesAcc.childRatesBySeason && Object.values(chRatesAcc.childRatesBySeason).some(node => anyChildRule(node?.byBand) || (node?.byCategory && Object.values(node.byCategory).some(anyChildRule)))) ||
    (Array.isArray(property?.categories) && property.categories.some(c => c?.extraChild && (+c.extraChild.value || 0) > 0)) ||
    (Array.isArray(property?.seasons) && property.seasons.some(s => s?.extraChild && (+s.extraChild.value || 0) > 0));
  // Room cost = per-night sum, per room. A room with exactly 1 adult uses the
  // single-occupancy rate (flat × nights) when the property has one set + the
  // feature on; other rooms use the full computed nightly sum. Matches the
  // hotelier-side single-occ pricing, so widget vs reception agree.
  // Apply the rate-plan multiplier ONCE over the stay (not per night) so a
  // single-room widget booking matches the hotelier's NewBooking quote exactly
  // on fractional rate plans (e.g. a +15% Flexible tier) — no per-night rounding
  // drift. The solo (single-occupancy) rate stays a flat final price: the rate
  // plan does NOT stack on it, same as the hotelier side.
  const fullRoomCost = perNightArray.length
    ? Math.round(perNightArray.reduce((s, n) => s + (n.rawRate != null ? n.rawRate : n.rate), 0) * ratePlanMultiplier(property, data.ratePlanId))
    : 0;
  const roomCost = perNightArray.length
    ? adultsPerRoom.reduce((sum, ad) => {
        const sr = singleOccRateFor({ adults: ad }, selectedRT, property);
        return sum + (sr != null ? sr * (data.nights || 1) : fullRoomCost);
      }, 0)
    : 0;

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
    // Meals + per-guest extras count adults + EVERY child band (a free-band
    // toddler still eats) — matching reception (NewBooking) + the saved-booking
    // folio recompute (bookingGuestCount in data.js, which sums all bands). Keeps
    // the widget total equal to what the folio + voucher recompute (price parity).
    const totalGuests = (data.adults || 0) + totalChildren;
    // No Math.round on the delta — NewBooking + mealCostFor leave it un-rounded,
    // so rounding here diverged the widget quote from the folio recompute on
    // fractional meal prices (R3 parity; a no-op on whole-rupee prices).
    const raw = ((picked.price || 0) - (def.price || 0)) * totalGuests * (data.nights || 1);
    // Floor a downgrade at -roomCost (same floor NewBooking + the folio apply)
    // so a big meal discount can't push rooms+meal below zero.
    return Math.max(-roomCost, raw);
  })();

  // Sum of selected extras. Each extra has a unit that determines the
  // multiplier: per stay (×1) / per night (×nights) / per guest
  // (×guests) / per guest per night (×guests×nights).
  const extrasLines = Object.entries(data.extras || {})
    .map(([id, qty]) => {
      const ex = savedCustomExtras.find(x => x.id === id);
      if (!ex || !qty) return null;
      // Meals + per-guest extras count adults + EVERY child band (a free-band
    // toddler still eats) — matching reception (NewBooking) + the saved-booking
    // folio recompute (bookingGuestCount in data.js, which sums all bands). Keeps
    // the widget total equal to what the folio + voucher recompute (price parity).
    const totalGuests = (data.adults || 0) + totalChildren;
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

  // Coupon resolution — find the active coupon by code, then check
  // expiry / min-nights / max-uses. Anything failing returns null so
  // the discount silently goes to ₹0 (with an error shown next to the
  // input). Case-insensitive match against property.coupons[].code.
  // R9-4: cloud coupon validation. The public property lookup no longer ships
  // the coupon book to the browser, so when a validateCoupon callback is
  // provided (cloud mode) we validate the entered code server-side, debounced.
  // Demo / local still validates synchronously against property.coupons.
  const [serverCoupon, setServerCoupon] = useState(null); // { ok, code, discount, reason, forCode }
  useEffect(() => {
    if (!validateCoupon) return;
    const code = (data.couponCode || '').trim();
    if (!code) { setServerCoupon(null); return; }
    let cancelled = false;
    const id = setTimeout(async () => {
      const res = await validateCoupon(code, data.nights);
      if (!cancelled) setServerCoupon({ ...(res || { ok: false }), forCode: code });
    }, 450);
    return () => { cancelled = true; clearTimeout(id); };
  }, [validateCoupon, data.couponCode, data.nights]);

  const activeCoupon = (() => {
    const code = (data.couponCode || '').trim().toUpperCase();
    if (!code) return null;
    const coupons = Array.isArray(property?.coupons) ? property.coupons : [];
    if (coupons.length) {
      // Local / demo: validate against the in-memory coupon list.
      const c = coupons.find(x => (x.code || '').toUpperCase() === code && x.enabled !== false);
      if (!c) return null;
      if (c.expiryIso) {
        const todayIso = ymd(new Date(ANCHOR));
        if (todayIso > c.expiryIso) return null;
      }
      if (c.minNights && (data.nights || 0) < c.minNights) return null;
      if (c.maxUses && (c.usedCount || 0) >= c.maxUses) return null;
      return c;
    }
    // Cloud: use the validate_coupon RPC result for the current code.
    if (validateCoupon && serverCoupon && serverCoupon.ok && (serverCoupon.forCode || '').toUpperCase() === code) {
      return { code: serverCoupon.code || code, discount: serverCoupon.discount };
    }
    return null;
  })();
  // R8-5: extra-adult / extra-child surcharge (per-category rules) — the
  // widget previously omitted this entirely, so a guest booking over base
  // capacity was undercharged vs the same booking taken at reception, and the
  // saved booking's folio/voucher then back-calculated a wrong tariff. Build
  // the exact roomItems shape handleSubmit saves (children → half-rate band)
  // so the live total matches what the hotelier's folio recomputes.
  const extraGuestCost = data.roomTypeId ? extraGuestCostFor({
    roomTypeId: data.roomTypeId,
    nights: data.nights,
    startIdx: data.checkIn ? dateToIdx(data.checkIn) : 0,
    roomItems: Array.from({ length: rooms }, (_, i) => ({
      roomTypeId: data.roomTypeId,
      adults: adultsPerRoom[i] || 0,
      ...roomChildFields(i),
      // Include the per-night rate the booking is SAVED with, so a percentage-
      // mode extra-guest surcharge (rate × pct%) computes the same here as the
      // folio/voucher recompute it later. Without it the live calc fell back to
      // category.base and under/over-charged pct-mode properties.
      rate: perNight,
    })),
  }, property) : 0;
  const subtotal = roomCost + mealDelta + extrasCost + extraGuestCost;
  const discountAmount = (() => {
    if (!activeCoupon) return 0;
    const d = activeCoupon.discount || {};
    if (d.mode === 'flat') return Math.min(+d.value || 0, subtotal);
    if (d.mode === 'pct') return Math.round(subtotal * (+d.value || 0) / 100);
    return 0;
  })();
  const total = Math.max(0, subtotal - discountAmount);
  const guestsStr = `${data.adults}A${totalChildren > 0 ? ` ${totalChildren}C` : ''}`;

  // Minimum-night stays (Advanced settings → Minimum-night stays). Block a
  // too-short online booking; the applicable minimum is the weekend one when
  // any night falls on a weekend, else the other-days minimum.
  const minNightsCfg = property?.accountant?.minNights;
  let minNightsNeeded = 0;
  if (minNightsCfg && minNightsCfg.enabled && data.checkIn && (data.nights || 0) > 0) {
    const inD = new Date(data.checkIn + 'T00:00:00');
    if (!isNaN(inD.getTime())) {
      const wd = (property?.weekendRules?.weekendDays) || [0, 6];
      let incWknd = false;
      for (let k = 0; k < data.nights; k++) { const d = new Date(inD); d.setDate(d.getDate() + k); if (wd.includes(d.getDay())) { incWknd = true; break; } }
      const need = incWknd ? (minNightsCfg.weekend || 1) : (minNightsCfg.allDays || 1);
      if ((data.nights || 0) < need) minNightsNeeded = need;
    }
  }
  // Step 1 → 2 gate.
  const datesValid = !!data.checkIn && (data.nights || 0) > 0 && (data.adults || 0) > 0 && (data.rooms || 0) > 0 && !minNightsNeeded;
  // Step 2 → 3 gate — must have enough units of the picked type to
  // cover the requested room count for every night.
  const roomValid = !!data.roomTypeId && availUnitsFor(data.roomTypeId) >= rooms;
  // Submit gate.
  const guestValid = data.name.trim().length > 0 && data.phone.replace(/\D/g, '').length === 10;

  // Hold window: how many hours an unpaid website booking stays tentative
  // before it's eligible for release. The hotelier sets the length in
  // Settings → Booking link → Hold & auto-release (default 12h). The only
  // automatic adjustment is a safety cap: we never tie a unit up past the
  // moment the guest is due to arrive, so a last-minute booking holds only
  // until check-in.
  const computeHoldHours = () => {
    const base = Math.max(1, property?.accountant?.holdHours ?? 12);
    if (!data.checkIn) return base;
    const checkInTime = (property?.profile?.checkIn || '14:00');
    const checkInTs = new Date(data.checkIn + 'T' + checkInTime + ':00').getTime();
    const hoursAway = (checkInTs - Date.now()) / (60 * 60 * 1000);
    if (hoursAway <= 1) return 1;
    return Math.max(1, Math.min(base, Math.round(hoursAway)));
  };

  const handleSubmit = async () => {
    if (!guestValid || !roomValid || submitting) return;
    setSubmitError('');
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
        ...roomChildFields(i),
        // Store rate=null (NOT the multiplier-baked, averaged perNight) so a later
        // edit in NewBooking re-derives the price from the calendar + ratePlanId +
        // single-occupancy exactly ONCE — same as a hotelier-created booking.
        // Storing perNight (= round(avg of rawRate × ratePlanMult)) caused the
        // rate-plan multiplier to be applied a SECOND time on edit, dropped the
        // single-occ rate, and flattened weekend/season night-to-night variation —
        // inflating the total (and Reports revenue) on a no-op re-save. The booking
        // still carries ratePlanId + startIdx, which drive the recompute.
        rate: null,
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
        // R10-10: persist the extra's unit so the folio / voucher can later
        // re-itemise per-night / per-guest extras correctly (the live total
        // already used it; without it stored, recompute fell back to per-stay).
        return ex ? { id: ex.id, label: ex.name || 'Extra', price: ex.price || 0, unit: ex.unit || 'per stay' } : null;
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
      // Coupon: store both the code (for the hotelier's records) and
      // the resolved discount amount (so the folio total stays accurate
      // even if the hotelier later edits / deletes the coupon).
      couponCode: activeCoupon ? activeCoupon.code : '',
      discountAmount: activeCoupon ? discountAmount : 0,
      // GST is not auto-applied for widget bookings — the hotelier
      // decides at folio time whether this booking goes on the GST
      // invoice register (some don't run their bookings through GST,
      // and the customer-facing voucher must not claim taxes apply).
      gstApplies: false,
      releaseTs,
      releaseAt,
      holdHours,
    };
    // Stamp each room's extra-guest surcharge so it survives a later category
    // deletion (audit R3 — same as the hotelier create path).
    newBooking.roomItems = stampExtraGuestAmounts(newBooking.roomItems, property, newBooking.nights, newBooking.startIdx, newBooking.roomTypeId);
    setSubmitting(true);
    let res;
    try {
      res = await onSubmit(newBooking);
    } catch (e) {
      res = { ok: false, reason: 'error' };
    }
    setSubmitting(false);
    // onSubmit returns { ok, ref, reason } (cloud) — tolerate a legacy plain
    // id too. Only show the confirmation screen when the hold was ACTUALLY
    // created; otherwise surface a real error so the guest can retry instead
    // of believing they have a booking that never reached the diary.
    const ok = (res && typeof res === 'object') ? res.ok : !!res;
    if (!ok) {
      const reason = (res && res.reason) || 'error';
      setSubmitError(
        reason === 'no_capacity' ? 'Sorry — those dates just sold out for this room. Please pick different dates or another room.'
          : reason === 'rate_limited' ? "We're getting a lot of requests right now. Please try again in a few minutes."
          : "Something went wrong and your booking wasn't saved. Please try again, or contact the property directly."
      );
      return;
    }
    const finalId = ((res && typeof res === 'object') ? res.ref : res) || ('BK-' + Date.now().toString(36));
    setCreatedBookingId(finalId);
    setCreatedBooking({ ...newBooking, id: finalId });
    setStep(4);
  };

  const propName = property?.profile?.name || 'Our property';
  // Property type label used in the header subtitle so guests see
  // 'Resort · Jaisalmer' instead of just 'Jaisalmer'. The picker on
  // Settings → Basics writes profile.type as a slug ('resort' etc).
  const propTypeLabel = (() => {
    const t = (property?.profile?.type || '').toLowerCase();
    const map = { resort: 'Resort', hotel: 'Hotel', homestay: 'Homestay', villa: 'Villa', guesthouse: 'Guest house', camp: 'Camp' };
    return map[t] || '';
  })();
  const propAddr = [propTypeLabel, property?.profile?.city, property?.profile?.state].filter(Boolean).join(' · ');
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
                    className="atithi-date-overlay"
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
              {/* ALWAYS collect children by age band — a booking must never be
                  created without each child's age (the rate depends on it, and
                  reception needs it for capacity/meals either way). When the
                  property charges differently by age, the label calls out the
                  rate; otherwise the labels are age-only so they don't imply a
                  charge that isn't applied. */}
              {(() => {
                const setChildBand = (bandId, v) => set('childBands', { ...(data.childBands || {}), [bandId]: Math.max(0, Math.min(15, v)) });
                return (
                  <>
                    {ageBands.map(band => (
                      <Field key={band.id} label={`Children · ${band.label || 'age band'}`}>
                        <Stepper value={(data.childBands && data.childBands[band.id]) || 0} onChange={(v) => setChildBand(band.id, v)} />
                      </Field>
                    ))}
                  </>
                );
              })()}
              {data.rooms > 1 && (
                <div style={{ fontSize: 10.5, color: T.ink3, fontWeight: 600, lineHeight: 1.5, fontStyle: 'italic' }}>
                  Guests will be split across {data.rooms} rooms: {adultsPerRoom.map((a, i) => {
                    const c = Object.values(childBandsPerRoom[i] || {}).reduce((s, n) => s + n, 0);
                    return `${a}A${c > 0 ? ` ${c}C` : ''}`;
                  }).join(' · ')}
                </div>
              )}
            </Card>

            {/* Group inquiry — when the guest hits the 5-room cap or
                requests more than 12 total guests, the widget isn't the
                right tool; their best path is a direct WhatsApp ping to
                the hotelier. We open a templated message via wa.me. */}
            {((data.rooms >= 5) || ((data.adults || 0) + totalChildren > 12)) && property?.profile?.phone && (() => {
              const phoneDigits = String(property.profile.phone).replace(/\D/g, '');
              const msg = [
                `Hi ${propName},`,
                `I'd like to enquire about a group booking — ${data.rooms} room${data.rooms > 1 ? 's' : ''} for ${data.adults} adults${totalChildren > 0 ? ` + ${totalChildren} children` : ''}${data.checkIn ? ` arriving ${data.checkIn}` : ''}. Please share your group rates.`,
                ``,
                `Thanks!`,
              ].join('\n');
              const waUrl = `https://wa.me/${phoneDigits}?text=${encodeURIComponent(msg)}`;
              return (
                <div style={{
                  marginTop: 14, padding: '14px 16px',
                  background: 'oklch(96% 0.04 145)', border: `1.5px solid oklch(72% 0.15 145)`,
                  borderRadius: 10,
                }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: 'oklch(35% 0.13 145)', marginBottom: 4 }}>
                    Group inquiry?
                  </div>
                  <div style={{ fontSize: 11, color: 'oklch(35% 0.13 145)', fontWeight: 600, lineHeight: 1.5, marginBottom: 10 }}>
                    For bigger groups (5+ rooms or 12+ guests) it's faster to message us directly — we'll quote a group rate and check availability for you.
                  </div>
                  <a
                    href={waUrl}
                    target="_blank"
                    rel="noopener"
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '8px 14px', borderRadius: 8,
                      background: '#25D366', color: '#fff',
                      fontSize: 12, fontWeight: 700, textDecoration: 'none',
                    }}
                  >
                    <Icon name="wa" size={14} color="#fff" stroke={2} /> Get a quote on WhatsApp
                  </a>
                </div>
              );
            })()}

            {minNightsNeeded > 0 && (
              <div style={{ padding: '10px 12px', background: 'oklch(96% 0.05 25)', border: `1px solid ${T.danger}`, borderRadius: 8, marginBottom: 10, fontSize: 12, color: T.danger, lineHeight: 1.5, fontWeight: 600 }}>
                This property has a minimum stay of {minNightsNeeded} nights for these dates. Please choose {minNightsNeeded} or more nights.
              </div>
            )}
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
              {ROOM_TYPES.length === 0 && (
                <div style={{ padding: '24px 16px', textAlign: 'center', color: T.ink3, fontSize: 13, lineHeight: 1.6, background: T.bgSoft, borderRadius: 12, border: `1px solid ${T.borderSoft}` }}>
                  This property hasn't published any rooms yet. Please check back soon, or contact the property directly to book.
                </div>
              )}
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
                    // Meals + per-guest extras count adults + EVERY child band (a free-band
    // toddler still eats) — matching reception (NewBooking) + the saved-booking
    // folio recompute (bookingGuestCount in data.js, which sums all bands). Keeps
    // the widget total equal to what the folio + voucher recompute (price parity).
    const totalGuests = (data.adults || 0) + totalChildren;
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

            {/* Rate plan picker — only when multiple are enabled AND the
                Advanced "Multiple rate plans" master toggle is on. */}
            {ratePlansActive(property) && data.roomTypeId && (
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
                  <input value={data.phone} onChange={(e) => set('phone', e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="98100 00000" inputMode="numeric" maxLength={10} style={{ ...inputStyle, flex: 1 }} />
                </div>
                {data.phone.replace(/\D/g, '').length > 0 && data.phone.replace(/\D/g, '').length !== 10 && (
                  <div style={{ fontSize: 10.5, color: T.ink3, fontWeight: 600, marginTop: 4 }}>Enter a 10-digit mobile number</div>
                )}
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

            {/* Coupon code — optional. Apply button is implicit: any
                change to the input re-validates. If valid, summary
                shows the discount line; if not (and the input is
                non-empty), a small red error appears. */}
            {((Array.isArray(property?.coupons) && property.coupons.length > 0) || !!validateCoupon) && (
              <>
                <SectionTitle style={{ marginTop: 18 }}>Have a coupon code?</SectionTitle>
                <Card>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      value={data.couponCode}
                      placeholder="Enter code"
                      onChange={(e) => set('couponCode', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16))}
                      style={{
                        flex: 1, padding: '10px 12px',
                        border: `1px solid ${activeCoupon ? T.ok : (data.couponCode ? T.danger : T.border)}`,
                        outline: 'none', borderRadius: 8,
                        background: activeCoupon ? T.okLt : T.card,
                        fontSize: 14, fontWeight: 700, letterSpacing: 1,
                        color: activeCoupon ? T.ok : T.ink,
                        fontFamily: 'JetBrains Mono, monospace',
                      }}
                    />
                    {activeCoupon && (
                      <div style={{ fontSize: 11, fontWeight: 700, color: T.ok }}>
                        <Icon name="check" size={12} color={T.ok} stroke={2.4} /> Applied
                      </div>
                    )}
                  </div>
                  {data.couponCode && !activeCoupon && (() => {
                    const code = data.couponCode.toUpperCase();
                    const localCoupons = Array.isArray(property?.coupons) ? property.coupons : [];
                    let reason = 'Code not recognised';
                    if (localCoupons.length) {
                      const c = localCoupons.find(x => (x.code || '').toUpperCase() === code);
                      if (c) {
                        if (c.enabled === false) reason = 'This code is disabled';
                        else if (c.expiryIso && ymd(new Date(ANCHOR)) > c.expiryIso) reason = `This code expired on ${c.expiryIso}`;
                        else if (c.minNights && (data.nights || 0) < c.minNights) reason = `Minimum stay for this code is ${c.minNights} nights`;
                        else if (c.maxUses && (c.usedCount || 0) >= c.maxUses) reason = 'This code has reached its usage limit';
                      }
                    } else if (validateCoupon) {
                      // Cloud: wait for the server result for THIS code before
                      // showing anything (avoids flashing an error mid-typing).
                      if (!serverCoupon || (serverCoupon.forCode || '').toUpperCase() !== code) return null;
                      const r = serverCoupon.reason;
                      if (r === 'unavailable') return null; // couldn't reach validator — don't scare the guest
                      else if (r === 'expired') reason = 'This code has expired';
                      else if (r === 'minNights') reason = `Minimum stay for this code is ${serverCoupon.minNights || ''} nights`;
                      else if (r === 'maxUses') reason = 'This code has reached its usage limit';
                    }
                    return <div style={{ marginTop: 6, fontSize: 11, color: T.danger, fontWeight: 600 }}>{reason}</div>;
                  })()}
                </Card>
              </>
            )}

            <SectionTitle style={{ marginTop: 18 }}>Booking summary</SectionTitle>
            <Card>
              <SummaryRow label="Stay" value={`${data.nights} night${data.nights > 1 ? 's' : ''}, ${guestsStr}`} />
              <SummaryRow label="Check-in" value={new Date(data.checkIn + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })} />
              <SummaryRow label="Check-out" value={new Date(checkOutIso + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })} />
              <SummaryRow label="Room" value={`${rooms} × ${selectedRT?.name || ''}`} />
              <SummaryRow label="Rate" value={ratesVary ? `Varies by night (see below)` : `₹${(perNight || 0).toLocaleString('en-IN')} × ${data.nights} night${data.nights > 1 ? 's' : ''}${rooms > 1 ? ` × ${rooms} rooms` : ''}`} />
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
              {activeCoupon && discountAmount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, padding: '4px 0' }}>
                  <span style={{ fontSize: 12, color: T.ok, fontWeight: 700 }}>Discount · {activeCoupon.code}</span>
                  <span className="tnum" style={{ fontSize: 12, color: T.ok, fontWeight: 800 }}>− ₹{discountAmount.toLocaleString('en-IN')}</span>
                </div>
              )}
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
              // Cancellation policy from the chosen rate plan — shown clearly
              // BEFORE the guest confirms.
              const rp = ratePlans.find(p => p.id === data.ratePlanId) || ratePlans[0];
              const txt = rp && rp.cancellation === 'non-refundable'
                ? 'Non-refundable — no refund if you cancel or don’t show up.'
                : `Free cancellation up to ${(rp && rp.refundHours) || 48}h before check-in. After that, a charge may apply.`;
              return (
                <div style={{ padding: '10px 12px', background: T.bgSoft, border: `1px solid ${T.borderSoft}`, borderRadius: 8, marginTop: 12, fontSize: 11, color: T.ink2, lineHeight: 1.5, fontWeight: 600 }}>
                  <strong style={{ color: T.ink }}>Cancellation policy:</strong> {txt}
                </div>
              );
            })()}
            {(() => {
              const h = computeHoldHours();
              return (
                <div style={{ padding: '10px 12px', background: T.indigoLt, border: `1px solid ${T.indigo}`, borderRadius: 8, marginTop: 12, fontSize: 11, color: T.indigo, lineHeight: 1.5, fontWeight: 600 }}>
                  <Icon name="info" size={11} /> Your booking is held for <strong>{h}h</strong> pending confirmation. After you tap <strong>Confirm</strong>, the payment QR appears — please send the advance to lock the room. We reach out on WhatsApp / phone to coordinate.
                </div>
              );
            })()}

            {submitError && (
              <div style={{ padding: '10px 12px', background: 'oklch(96% 0.05 25)', border: `1px solid ${T.danger}`, borderRadius: 8, marginTop: 12, fontSize: 12, color: T.danger, lineHeight: 1.5, fontWeight: 600 }}>
                {submitError}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
              <SecondaryBtn onClick={() => setStep(2)}>← Back</SecondaryBtn>
              <PrimaryBtn disabled={!guestValid || submitting} onClick={handleSubmit}>
                {submitting ? 'Confirming…' : 'Confirm booking'}
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
                {/* .ics calendar file — Google/Apple/Outlook all accept
                    this. All-day event using VALUE=DATE so timezone
                    nuances don't shift the dates. */}
                <button
                  onClick={() => {
                    const startIso = data.checkIn.replace(/-/g, '');
                    const endIso = checkOutIso.replace(/-/g, '');
                    const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
                    const loc = [property?.profile?.city, property?.profile?.state].filter(Boolean).join(', ');
                    // R10-D4: escape user-controlled fields per RFC 5545 so a
                    // comma / semicolon / backslash / newline in a property or
                    // room name can't break the .ics structure. Backslash first.
                    const icalEsc = (s) => String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
                    const ics = [
                      'BEGIN:VCALENDAR',
                      'VERSION:2.0',
                      'PRODID:-//Atithi//Booking//EN',
                      'CALSCALE:GREGORIAN',
                      'METHOD:PUBLISH',
                      'BEGIN:VEVENT',
                      `UID:${createdBookingId}@atithi.local`,
                      `DTSTAMP:${stamp}`,
                      `DTSTART;VALUE=DATE:${startIso}`,
                      `DTEND;VALUE=DATE:${endIso}`,
                      `SUMMARY:${icalEsc(propName)} · Stay (${createdBookingId})`,
                      loc ? `LOCATION:${icalEsc(loc)}` : '',
                      `DESCRIPTION:Booking reference ${createdBookingId}\\n${data.nights} night${data.nights > 1 ? 's' : ''} · ${icalEsc(guestsStr)}\\nRoom: ${icalEsc(selectedRT?.name || '')}\\nTotal: ₹${total.toLocaleString('en-IN')}`,
                      'END:VEVENT',
                      'END:VCALENDAR',
                    ].filter(Boolean).join('\r\n');
                    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `booking-${createdBookingId}.ics`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                  }}
                  style={{
                    padding: '10px 16px', borderRadius: 8,
                    border: `1.5px solid ${T.border}`, background: T.card, color: T.ink2,
                    fontSize: 13, fontWeight: 700, cursor: 'pointer',
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                  }}
                >
                  <Icon name="cal" size={13} stroke={2.2} color={T.ink2} /> Add to calendar
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

            {(property?.profile?.phone || property?.profile?.email || property?.profile?.website) && (
              <div style={{ marginTop: 20, fontSize: 12, color: T.ink2, lineHeight: 1.6 }}>
                {property?.profile?.phone && (
                  <div>Questions? Call or WhatsApp <strong className="tnum">{property.profile.phone}</strong></div>
                )}
                {property?.profile?.email && (
                  <div>Email <a href={`mailto:${property.profile.email}`} style={{ color: T.primaryDk, fontWeight: 700 }}>{property.profile.email}</a></div>
                )}
                {property?.profile?.website && (
                  <div>Web {safeUrl(property.profile.website)
                    ? <a href={safeUrl(property.profile.website)} target="_blank" rel="noopener" style={{ color: T.primaryDk, fontWeight: 700 }}>{property.profile.website.replace(/^https?:\/\//, '')}</a>
                    : <span style={{ color: T.primaryDk, fontWeight: 700 }}>{property.profile.website.replace(/^https?:\/\//, '')}</span>}</div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer — small, honest Atithi credit + a one-line liability
          disclaimer. Atithi is the booking software the property uses
          to take reservations; we're not the property and don't
          deliver the stay. Anything about the stay itself (rooms,
          food, service, refunds) is between the guest and the
          property directly. */}
      <div style={{ padding: '10px 16px', borderTop: `1px solid ${T.borderSoft}`, background: T.card, fontSize: 10, color: T.ink3, textAlign: 'center', flexShrink: 0, lineHeight: 1.5 }}>
        Booking powered by <strong>Atithi</strong>
        <div style={{ marginTop: 3, fontSize: 9, color: T.ink3, opacity: 0.85 }}>
          Atithi is the booking software, not the property. The property is independently responsible for its services, conduct, and any disputes.
        </div>
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
  width: 36, height: 36, borderRadius: '50%',
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

import { useState, useEffect } from 'react';
import { useT } from './i18n.js';
import { BOOKINGS_SEED, COUNTRIES, ROOM_TYPES, DAYS, currentFinancialYear, formatInvoiceNumber } from './data.js';
import TabBar from './components/TabBar.jsx';
import Dashboard from './screens/Dashboard.jsx';
import Diary from './screens/Diary.jsx';
import NewBooking from './screens/NewBooking.jsx';
import BookingDetail from './screens/BookingDetail.jsx';
import BookingConfirmed from './screens/BookingConfirmed.jsx';
import Rates from './screens/Rates.jsx';
import Channels from './screens/Channels.jsx';
import Reports from './screens/Reports.jsx';
import Guests from './screens/Guests.jsx';
import Settings from './screens/Settings.jsx';
import MoreMenu from './screens/MoreMenu.jsx';

const LS_KEYS = {
  bookings: 'atithi.bookings.v1',
  customExtras: 'atithi.customExtras.v1',
  overrides: 'atithi.rateOverrides.v1',
  plan: 'atithi.plan.v1',
  lang: 'atithi.lang.v1',
  property: 'atithi.property.v1',
};

const DEFAULT_PROPERTY = {
  profile: {
    name: 'Yatra Desert Camp',
    type: 'resort',
    address: 'Sam Sand Dunes Road, near Khuri',
    city: 'Jaisalmer', state: 'Rajasthan', pincode: '345001',
    landmark: 'Near Sam Sand Dunes, 45km west of Jaisalmer Fort',
    mapUrl: 'https://maps.google.com/?q=Sam+Sand+Dunes,+Jaisalmer',
    checkIn: '14:00', checkOut: '11:00',
    phone: '+91 90099 12345', email: 'stay@yatracamp.in', website: 'yatracamp.in',
  },
  categories: [
    { id: 'dlx',  name: 'Deluxe Tent',          units: 8, base: 4500,  amenityIds: ['fan', 'bonfire', 'desertview', 'hotwater'] },
    { id: 'lux',  name: 'Luxury Tent (AC)',     units: 6, base: 7200,  amenityIds: ['ac', 'heater', 'desertview', 'hotwater', 'minibar', 'kettle'] },
    { id: 'btub', name: 'Bathtub Tent',         units: 4, base: 9500,  amenityIds: ['ac', 'heater', 'bathtub', 'balcony', 'minibar', 'kettle', 'toiletries'] },
    { id: 'pool', name: 'Private Pool Cottage', units: 3, base: 14500, amenityIds: ['ac', 'heater', 'privatepool', 'kitchenette', 'minibar', 'kettle', 'safe', 'toiletries'] },
  ],
  rules: [
    'Check-in from 2 PM · check-out by 11 AM',
    'No outside food in tents',
    'Bonfire from 7 PM to 10 PM only',
    'Pets allowed in Deluxe & Luxury tents',
  ],
  amenityIds: ['wifi', 'parking', 'pool', 'restaurant', 'bonfire', 'safari', 'reception24', 'airportshuttle'],
  customAmenities: [],
  // Per-financial-year sequential invoice counter. Bumped each time an invoice
  // is issued, so the next number is predictable and gap-free (a GST requirement).
  invoiceCounters: {},
  // CA / accountant contact used for the monthly invoice export.
  accountant: { name: '', email: '', firm: '' },
  // Optional GSTIN — shown on tax invoices when present.
  gstin: '',
};

// Older saved property objects used { amenities: { wifi: true, ... } }; convert that to
// the new { amenityIds: [...] } shape so saved data keeps working without a wipe.
function migrateProperty(p) {
  if (!p || typeof p !== 'object') return DEFAULT_PROPERTY;
  const out = { ...DEFAULT_PROPERTY, ...p };
  out.profile = { ...DEFAULT_PROPERTY.profile, ...(p.profile || {}) };
  if (!Array.isArray(out.amenityIds)) {
    out.amenityIds = p.amenities && typeof p.amenities === 'object'
      ? Object.keys(p.amenities).filter(k => p.amenities[k])
      : [...DEFAULT_PROPERTY.amenityIds];
  }
  if (!Array.isArray(out.customAmenities)) out.customAmenities = [];
  out.categories = (Array.isArray(p.categories) ? p.categories : DEFAULT_PROPERTY.categories).map((c, i) => ({
    ...c,
    amenityIds: Array.isArray(c.amenityIds) ? c.amenityIds : (DEFAULT_PROPERTY.categories[i]?.amenityIds || []),
  }));
  if (!out.invoiceCounters || typeof out.invoiceCounters !== 'object') out.invoiceCounters = {};
  if (!out.accountant || typeof out.accountant !== 'object') out.accountant = { ...DEFAULT_PROPERTY.accountant };
  else out.accountant = { ...DEFAULT_PROPERTY.accountant, ...out.accountant };
  if (typeof out.gstin !== 'string') out.gstin = '';
  return out;
}

const loadLS = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
};
const saveLS = (key, val) => {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
};

// Map a "DD MMM YYYY"-ish string to an index in the 14-day DAYS window.
// Falls back to 0 (today, May 4 2026) if the string can't be parsed or is out of range.
function parseCheckInIdx(checkInStr) {
  if (!checkInStr) return 0;
  const parsed = new Date(checkInStr);
  if (isNaN(parsed.getTime())) return 0;
  const baseDay = new Date(2026, 4, 4);
  const diffDays = Math.round((parsed - baseDay) / (24 * 3600 * 1000));
  if (diffDays < 0 || diffDays >= DAYS.length) return 0;
  return diffDays;
}

// Pick the lowest-numbered unit of the chosen room type that is free for the requested
// date range. Returns 0 as a last-resort fallback if every unit is taken — the Diary's
// conflict UI will then surface the clash to the user.
function findFirstFreeUnit(bookings, roomTypeId, startIdx, nights) {
  const room = ROOM_TYPES.find(r => r.id === roomTypeId);
  if (!room) return 0;
  const endIdx = startIdx + nights;
  for (let u = 0; u < room.units; u++) {
    const conflict = bookings.some(b =>
      b.status !== 'cancelled' &&
      b.roomTypeId === roomTypeId &&
      b.unitIdx === u &&
      !(b.startIdx + b.nights <= startIdx || endIdx <= b.startIdx)
    );
    if (!conflict) return u;
  }
  return 0;
}

export default function App() {
  const [plan, setPlan] = useState(() => loadLS(LS_KEYS.plan, 'engine'));
  const [lang, setLang] = useState(() => loadLS(LS_KEYS.lang, 'en'));
  const [route, setRoute] = useState({ name: 'home', arg: null });
  const [bookings, setBookings] = useState(() => loadLS(LS_KEYS.bookings, BOOKINGS_SEED.map(b => ({ ...b }))));
  const [savedCustomExtras, setSavedCustomExtras] = useState(() => loadLS(LS_KEYS.customExtras, []));
  const [rateOverrides, setRateOverrides] = useState(() => loadLS(LS_KEYS.overrides, {}));
  const [property, setProperty] = useState(() => migrateProperty(loadLS(LS_KEYS.property, DEFAULT_PROPERTY)));
  const [editing, setEditing] = useState(null);
  const t = useT(lang);

  useEffect(() => { saveLS(LS_KEYS.bookings, bookings); }, [bookings]);
  useEffect(() => { saveLS(LS_KEYS.customExtras, savedCustomExtras); }, [savedCustomExtras]);
  useEffect(() => { saveLS(LS_KEYS.overrides, rateOverrides); }, [rateOverrides]);
  useEffect(() => { saveLS(LS_KEYS.plan, plan); }, [plan]);
  useEffect(() => { saveLS(LS_KEYS.lang, lang); }, [lang]);
  useEffect(() => { saveLS(LS_KEYS.property, property); }, [property]);

  // Auto-release: every 30s, scan tentative bookings; if releaseTs has passed, cancel.
  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      setBookings(arr => {
        let changed = false;
        const next = arr.map(b => {
          if (b.status === 'tentative' && b.releaseTs && b.releaseTs <= now && (b.paid || 0) < (b.total || 0)) {
            changed = true;
            return { ...b, status: 'cancelled', autoReleased: true };
          }
          return b;
        });
        return changed ? next : arr;
      });
    };
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, []);

  const go = (name, arg = null) => {
    if (name !== 'new') setEditing(null);
    setRoute({ name, arg });
  };

  const startEdit = (bookingId) => {
    setEditing(bookingId);
    setRoute({ name: 'new', arg: bookingId });
  };

  const addPayment = (bookingId, entry) => {
    setBookings(arr => arr.map(b => {
      if (b.id !== bookingId) return b;
      const existing = b.payments || (b.paid > 0 ? [{ id: 'p1', kind: 'payment', method: b.channel === 'direct' ? 'upi' : 'card', amount: b.paid, note: 'Initial payment', date: '03 May · 18:25' }] : []);
      const next = [...existing, entry];
      const paid = next.reduce((s, p) => s + (p.kind === 'refund' || p.kind === 'credit' ? -p.amount : p.amount), 0);
      // If a hold gets paid in full, auto-confirm.
      const status = (b.status === 'tentative' && paid >= b.total) ? 'confirmed' : b.status;
      const update = { ...b, payments: next, paid, status };
      if (status === 'confirmed' && b.status === 'tentative') {
        delete update.releaseTs; delete update.releaseAt;
      }
      return update;
    }));
  };

  const setStatus = (bookingId, status) => {
    setBookings(arr => arr.map(b => {
      if (b.id !== bookingId) return b;
      const next = { ...b, status };
      if (status === 'confirmed' || status === 'cancelled' || status === 'checkedin') {
        delete next.releaseTs; delete next.releaseAt;
      }
      return next;
    }));
  };

  const moveBooking = (bookingId, patch) => {
    setBookings(arr => arr.map(b => b.id === bookingId ? { ...b, ...patch } : b));
  };

  const setBookingGst = (bookingId, value) => {
    setBookings(arr => arr.map(b => b.id === bookingId ? { ...b, gstApplies: !!value } : b));
  };

  // Issue a sequential tax invoice. `parts` is an optional array describing how
  // to split the booking total across multiple recipients/invoices. When omitted,
  // one invoice is issued for the full booking amount with the guest as recipient.
  // Each part: { amount, recipient: { name, gstin?, address? }, items?: [...], note? }
  //
  // Counter and booking are updated from the same baseSeq snapshot so the invoice
  // numbers stored on the booking always match the property's counter.
  const issueInvoice = (bookingId, parts) => {
    const booking = bookings.find(b => b.id === bookingId);
    if (!booking || booking.status === 'tentative') return null;
    const splits = (Array.isArray(parts) && parts.length > 0) ? parts : [{
      amount: booking.total || 0,
      recipient: { name: booking.guest, gstin: '', address: '' },
    }];
    const fy = currentFinancialYear();
    const baseSeq = (property.invoiceCounters && property.invoiceCounters[fy]) || 0;
    const nowIso = new Date().toISOString();
    const newInvoices = splits.map((part, i) => ({
      id: 'inv_' + Date.now() + '_' + i,
      number: formatInvoiceNumber(fy, baseSeq + i + 1),
      fy,
      date: nowIso,
      amount: +part.amount || 0,
      recipient: part.recipient || { name: booking.guest, gstin: '', address: '' },
      items: part.items || null,
      note: part.note || '',
      voided: false,
    }));
    setProperty(p => ({ ...p, invoiceCounters: { ...(p.invoiceCounters || {}), [fy]: baseSeq + splits.length } }));
    setBookings(arr => arr.map(b => b.id === bookingId
      ? { ...b, invoices: [...(b.invoices || []), ...newInvoices] }
      : b));
    return newInvoices;
  };

  const voidInvoice = (bookingId, invoiceId) => {
    setBookings(arr => arr.map(b => b.id === bookingId
      ? { ...b, invoices: (b.invoices || []).map(inv => inv.id === invoiceId ? { ...inv, voided: true } : inv) }
      : b));
  };

  const addSavedCustomExtra = (extra) => {
    setSavedCustomExtras(arr => {
      if (arr.some(x => x.id === extra.id)) return arr;
      return [...arr, extra];
    });
  };
  const removeSavedCustomExtra = (id) => {
    setSavedCustomExtras(arr => arr.filter(x => x.id !== id));
  };

  const onCreate = (data, total) => {
    const paid = data.payAmount === 'full' ? total
      : data.payAmount === 'half' ? Math.round(total / 2)
      : data.payAmount === 'custom' ? Math.min(+data.payCustom || 0, total)
      : 0;

    const country = data.country || 'IN';
    const formC = country !== 'IN';
    const countryInfo = COUNTRIES.find(c => c.code === country);
    const dial = countryInfo ? countryInfo.dial : '+91';

    // Hold/release info — used for tentative bookings.
    const isHold = !!data.hold && paid < total;
    const status = isHold ? 'tentative' : 'confirmed';
    let releaseTs = null, releaseAt = null;
    if (isHold) {
      releaseTs = Date.now() + (data.holdHours || 4) * 3600 * 1000;
      const d = new Date(releaseTs);
      releaseAt = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    }

    // Persist any newly-added custom extras (saved across bookings)
    (data.customExtras || []).forEach(addSavedCustomExtra);

    if (editing) {
      setBookings(arr => arr.map(b => b.id === editing ? {
        ...b, roomTypeId: data.roomTypeId, nights: data.nights, guest: data.name || b.guest,
        total, paid, phone: dial + ' ' + (data.phone || b.phone.replace(/^\+\d+\s*/, '')),
        notes: data.notes, extras: data.extras,
        roomItems: data.roomItems, customExtras: data.customExtras, extraPrices: data.extraPrices,
        country, formC,
        gstApplies: !!data.gstApplies,
        status: isHold ? 'tentative' : b.status,
        releaseTs: isHold ? releaseTs : undefined,
        releaseAt: isHold ? releaseAt : undefined,
        guests: `${data.roomItems.reduce((s, r) => s + r.adults, 0)}A${data.roomItems.reduce((s, r) => s + r.children, 0) > 0 ? ` ${data.roomItems.reduce((s, r) => s + r.children, 0)}C` : ''}`,
      } : b));
      setEditing(null);
      setRoute({ name: 'booking', arg: editing });
    } else {
      const startIdx = parseCheckInIdx(data.checkIn);
      const unitIdx = findFirstFreeUnit(bookings, data.roomTypeId, startIdx, data.nights);
      const newBk = {
        id: 'BK-' + (2854 + bookings.length),
        roomTypeId: data.roomTypeId,
        unitIdx,
        startIdx,
        nights: data.nights,
        guest: data.name || 'New Guest',
        status,
        channel: 'direct',
        total,
        paid,
        guests: `${data.roomItems.reduce((s, r) => s + r.adults, 0)}A${data.roomItems.reduce((s, r) => s + r.children, 0) > 0 ? ` ${data.roomItems.reduce((s, r) => s + r.children, 0)}C` : ''}`,
        phone: dial + ' ' + data.phone,
        country, formC,
        notes: data.notes,
        extras: data.extras,
        roomItems: data.roomItems,
        customExtras: data.customExtras,
        extraPrices: data.extraPrices,
        gstApplies: !!data.gstApplies,
        releaseTs: releaseTs || undefined,
        releaseAt: releaseAt || undefined,
        holdHours: isHold ? data.holdHours : undefined,
      };
      setBookings(arr => [...arr, newBk]);
      go('booking-confirmed');
    }
  };

  const showTabs = ['home', 'diary', 'guests', 'more'].includes(route.name);
  const editingBooking = editing ? bookings.find(b => b.id === editing) : null;

  let screen;
  switch (route.name) {
    case 'home':              screen = <Dashboard go={go} bookings={bookings} property={property} t={t} lang={lang} onAddPayment={addPayment} />; break;
    case 'diary':             screen = <Diary go={go} bookings={bookings} setBookings={setBookings} moveBooking={moveBooking} t={t} />; break;
    case 'new':               screen = <NewBooking go={go} onCreate={onCreate} plan={plan} t={t} editing={editingBooking} savedCustomExtras={savedCustomExtras} onRemoveSavedExtra={removeSavedCustomExtra} rateOverrides={rateOverrides} />; break;
    case 'booking':           screen = <BookingDetail go={go} bookingId={route.arg} bookings={bookings} plan={plan} t={t} property={property} onEdit={startEdit} onPayment={addPayment} onSetStatus={setStatus} onSetGst={setBookingGst} onIssueInvoice={issueInvoice} onVoidInvoice={voidInvoice} />; break;
    case 'booking-confirmed': screen = <BookingConfirmed go={go} t={t} />; break;
    case 'rates':             screen = <Rates go={go} t={t} lang={lang} overrides={rateOverrides} setOverrides={setRateOverrides} />; break;
    case 'guests':            screen = <Guests go={go} bookings={bookings} t={t} />; break;
    case 'channels':          screen = <Channels go={go} t={t} />; break;
    case 'reports':           screen = <Reports go={go} t={t} bookings={bookings} plan={plan} property={property} />; break;
    case 'settings':          screen = <Settings go={go} plan={plan} onChangePlan={setPlan} lang={lang} onChangeLang={setLang} property={property} onChangeProperty={setProperty} t={t} />; break;
    case 'more':              screen = <MoreMenu go={go} t={t} />; break;
    default:                  screen = <Dashboard go={go} bookings={bookings} property={property} t={t} lang={lang} onAddPayment={addPayment} />;
  }

  return (
    <div className={'atithi' + (lang === 'hi' ? ' hi-mode' : '')} style={{ height: '100%', position: 'relative', background: 'transparent', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, paddingBottom: showTabs ? 78 : 0, display: 'flex', flexDirection: 'column' }}>
        {screen}
      </div>
      {showTabs && (
        <TabBar active={route.name} onChange={(id) => {
          if (id === 'new') go('new');
          else go(id);
        }} t={t} />
      )}
    </div>
  );
}

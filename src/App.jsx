import { useState, useEffect, useRef } from 'react';
import { useT } from './i18n.js';
import { T, applyTheme } from './tokens.js';
import { BOOKINGS_SEED, COUNTRIES, ROOM_TYPES, DAYS, currentFinancialYear, formatInvoiceNumber, invoicePrefixOf, effectiveRoomTypes, dateToIdx } from './data.js';
import { supabase, signOut as supaSignOut } from './supabase.js';
import { loadCurrentProperty, bootstrapProperty, saveCloudProperty } from './cloud/property.js';
import {
  loadBookings, seedBookings,
  createBookingCloud, updateBookingCloud,
  addPaymentCloud, issueInvoiceCloud, voidInvoiceCloud,
} from './cloud/bookings.js';
import {
  loadSavedExtras, seedSavedExtras, addSavedExtraCloud, removeSavedExtraCloud, updateSavedExtraCloud,
  loadRateOverrides, seedRateOverrides, setRateOverrideCloud,
  loadCashCloses, seedCashCloses, setCashCloseCloud,
} from './cloud/extras.js';
import { syncCloud, syncFire, notifySyncFailure } from './cloud/sync.js';
import SyncOverlay from './components/SyncOverlay.jsx';
import SearchOverlay from './components/SearchOverlay.jsx';
import Icon from './components/Icon.jsx';
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
import SignIn from './screens/SignIn.jsx';

// DEMO_MODE: skip the Supabase magic-link sign-in gate and run entirely off
// localStorage so the app is immediately usable (no email round-trip, no
// cloud dependency). The cloud-sync code paths stay intact; they're just
// not exercised while DEMO_MODE is true. Flip this back to false once
// auth is being added back into the productionised flow.
const DEMO_MODE = true;

const LS_KEYS = {
  bookings: 'atithi.bookings.v1',
  customExtras: 'atithi.customExtras.v1',
  overrides: 'atithi.rateOverrides.v1',
  cashCloses: 'atithi.cashCloses.v1',
  plan: 'atithi.plan.v1',
  lang: 'atithi.lang.v1',
  property: 'atithi.property.v1',
  bookingsSeeded: 'atithi.bookings.seeded.v1',  // set once cloud bookings have been seeded for this browser
  extrasSeeded: 'atithi.extras.seeded.v1',      // set once cloud saved_extras/rate_overrides/cash_closes have been seeded
};

const DEFAULT_PROPERTY = {
  profile: {
    name: 'Yatra Desert Camp',
    type: 'resort',
    address: 'Sam Sand Dunes Road, near Khuri',
    // Hotelier-uploaded payment QR (data URL, base64-encoded). Shown on
    // the reservation voucher under "Scan to pay" so guests can pay
    // directly without us having to integrate a payment gateway. Most
    // small Indian hoteliers already have a printed UPI QR they use at
    // reception — this just digitises it onto the voucher.
    paymentQrDataUrl: '',
    paymentQrLabel: '',  // optional helper text (e.g. "Scan via any UPI app")
    // Property logo — same inline base64 pattern as the payment QR (small
    // enough to live on the row, no Supabase Storage needed). Renders on
    // the Settings card hero, and on the voucher header in a follow-up.
    logoDataUrl: '',
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
  // Hotelier-picked brand colour. Stored as an oklch hue angle so the picker
  // is just a hue choice; saturation/lightness are derived to stay coherent.
  // 38 = default Atithi sunset orange.
  theme: { hue: 38 },
  // Standard hotel meal plans. EP/CP/MAP/AP are the industry shorthand;
  // price is per guest per night, added on top of the room tariff.
  // `enabled` controls whether the plan shows up in the booking flow.
  // The default plan (EP, no meal) is always enabled so every booking has
  // a valid fallback.
  mealPlans: [
    { id: 'ep',  code: 'EP',  label: 'Room only',                       price: 0,    enabled: true },
    { id: 'cp',  code: 'CP',  label: 'Breakfast included',              price: 500,  enabled: true },
    { id: 'map', code: 'MAP', label: 'Breakfast + 1 main meal',         price: 1200, enabled: true },
    { id: 'ap',  code: 'AP',  label: 'All meals (breakfast + 2 main)',  price: 2000, enabled: false },
  ],
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
  // Theme: accept either a preset hue or a custom hex colour. Fall back to
  // the default sunset orange if neither field is valid.
  const validHue = out.theme && typeof out.theme === 'object' && typeof out.theme.hue === 'number';
  const validColor = out.theme && typeof out.theme === 'object' && typeof out.theme.color === 'string' && /^#[0-9a-f]{3,8}$/i.test(out.theme.color);
  if (!validHue && !validColor) {
    out.theme = { ...DEFAULT_PROPERTY.theme };
  }
  // Meal plans: seed from defaults if missing. Existing properties created
  // before this field was added don't have it.
  if (!Array.isArray(out.mealPlans) || out.mealPlans.length === 0) {
    out.mealPlans = DEFAULT_PROPERTY.mealPlans.map(p => ({ ...p }));
  }
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

// Map a check-in date string to a day index relative to today (data.js
// ANCHOR). Accepts ISO "YYYY-MM-DD" or any string JS Date can parse.
// idx 0 = today, positive = future days. Negative results are clamped to
// 0 — the owner shouldn't be creating new bookings in the past.
function parseCheckInIdx(checkInStr) {
  if (!checkInStr) return 0;
  return Math.max(0, dateToIdx(checkInStr));
}

// Pick the lowest-numbered unit of the chosen room type that is free for the requested
// date range. Returns 0 as a last-resort fallback if every unit is taken — the Diary's
// conflict UI will then surface the clash to the user. Reads unit count from
// `property.categories` so changing units in Settings flows through immediately.
function findFirstFreeUnit(bookings, roomTypeId, startIdx, nights, roomTypes) {
  const list = Array.isArray(roomTypes) && roomTypes.length ? roomTypes : ROOM_TYPES;
  const room = list.find(r => r.id === roomTypeId);
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
  const [plan, setPlan] = useState(() => {
    // Default tier is 'engine' — the core booking package: create / store /
    // manage bookings + reservation voucher PDF. Invoicing and channel
    // manager are paid add-ons (revenue path). 'gst' is the legacy name
    // for what we now call 'invoicing'; map forward so existing saved
    // state keeps working.
    const saved = loadLS(LS_KEYS.plan, 'engine');
    if (saved === 'gst') return 'invoicing';
    return saved;
  });
  const [lang, setLang] = useState(() => loadLS(LS_KEYS.lang, 'en'));
  const [route, setRoute] = useState({ name: 'home', arg: null });
  const [bookings, setBookings] = useState(() => loadLS(LS_KEYS.bookings, BOOKINGS_SEED.map(b => ({ ...b }))));
  const [savedCustomExtras, setSavedCustomExtras] = useState(() => loadLS(LS_KEYS.customExtras, []));
  const [rateOverrides, setRateOverrides] = useState(() => loadLS(LS_KEYS.overrides, {}));
  const [cashCloses, setCashCloses] = useState(() => loadLS(LS_KEYS.cashCloses, {}));
  const [property, setProperty] = useState(() => migrateProperty(loadLS(LS_KEYS.property, DEFAULT_PROPERTY)));
  const [editing, setEditing] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);
  // Auth: session is null until Supabase tells us whether the user is signed
  // in. authReady gates the initial render so we don't briefly flash SignIn
  // for a user who's already logged in (the magic-link flow puts the access
  // token in the URL hash, which the Supabase client reads on init).
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  // Cloud property: once signed in, we load (or bootstrap) the user's
  // property + membership from Supabase. cloudReady gates the app so we
  // don't render bookings/diary against potentially-stale localStorage data
  // before the cloud has answered.
  const [propertyId, setPropertyId] = useState(null);
  const [cloudReady, setCloudReady] = useState(false);
  // Refs mirror state for use inside callbacks that close over older renders
  // (the 30s auto-release ticker, in particular, is registered once on mount
  // and can't depend on cloudReady/propertyId/session changing).
  const propertyIdRef = useRef(null);
  const cloudReadyRef = useRef(false);
  const sessionRef = useRef(null);
  useEffect(() => { propertyIdRef.current = propertyId; }, [propertyId]);
  useEffect(() => { cloudReadyRef.current = cloudReady; }, [cloudReady]);
  useEffect(() => { sessionRef.current = session; }, [session]);
  const t = useT(lang);

  useEffect(() => { saveLS(LS_KEYS.bookings, bookings); }, [bookings]);
  useEffect(() => { saveLS(LS_KEYS.customExtras, savedCustomExtras); }, [savedCustomExtras]);
  useEffect(() => { saveLS(LS_KEYS.overrides, rateOverrides); }, [rateOverrides]);
  useEffect(() => { saveLS(LS_KEYS.cashCloses, cashCloses); }, [cashCloses]);
  useEffect(() => { saveLS(LS_KEYS.plan, plan); }, [plan]);
  useEffect(() => { saveLS(LS_KEYS.lang, lang); }, [lang]);
  useEffect(() => { saveLS(LS_KEYS.property, property); }, [property]);

  // Push the hotelier's chosen brand colour into CSS variables that all
  // T.primary references read from. Runs on mount and whenever the theme
  // changes — including a fresh DEFAULT_PROPERTY install on first boot.
  useEffect(() => {
    applyTheme(property?.theme);
  }, [property?.theme?.hue, property?.theme?.color]);

  // Load Supabase session on mount + subscribe to auth state changes (sign-in,
  // sign-out, token refresh). detectSessionInUrl picks up the magic-link
  // token from the URL hash automatically when the user lands back.
  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data?.session || null);
      setAuthReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      if (!mounted) return;
      setSession(sess);
      setAuthReady(true);
    });
    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, []);

  // Cloud load / bootstrap. Runs whenever the signed-in user changes. On
  // first sign-in we seed the cloud property + bookings from the current
  // localStorage data so customisations and existing reservations carry
  // over. Subsequent sign-ins read from the cloud as the source of truth.
  useEffect(() => {
    if (!session) {
      setPropertyId(null);
      setCloudReady(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        let result = await loadCurrentProperty(session.user.id);
        const isFirstTime = !result;
        if (isFirstTime) {
          result = await bootstrapProperty(session.user, property);
        }
        if (cancelled || !result) return;

        // Bookings: load from cloud, seed if empty AND we have local data
        // AND we haven't seeded already (handles the one-time migration for
        // existing users whose property was created in Chunk 3 before this
        // chunk landed).
        let cloudBookings = await loadBookings(result.id);
        const seededBefore = !!loadLS(LS_KEYS.bookingsSeeded, false);
        const shouldSeed = cloudBookings.length === 0
          && bookings && bookings.length > 0
          && (isFirstTime || !seededBefore);
        if (shouldSeed) {
          await seedBookings(result.id, session.user.id, bookings);
          saveLS(LS_KEYS.bookingsSeeded, true);
          cloudBookings = await loadBookings(result.id);
        } else if (cloudBookings.length > 0 && !seededBefore) {
          // Cloud already has bookings — mark the flag so we don't ever
          // re-seed (e.g. after the user intentionally cancels everything).
          saveLS(LS_KEYS.bookingsSeeded, true);
        }

        // Saved extras / rate overrides / cash closes — same load+seed pattern.
        // One shared seeded flag because these three move together.
        let [cloudExtras, cloudOverrides, cloudCloses] = await Promise.all([
          loadSavedExtras(result.id),
          loadRateOverrides(result.id),
          loadCashCloses(result.id),
        ]);
        const extrasSeededBefore = !!loadLS(LS_KEYS.extrasSeeded, false);
        const cloudExtrasEmpty = cloudExtras.length === 0
          && Object.keys(cloudOverrides).length === 0
          && Object.keys(cloudCloses).length === 0;
        const localExtrasHaveData = (savedCustomExtras && savedCustomExtras.length)
          || (rateOverrides && Object.keys(rateOverrides).length)
          || (cashCloses && Object.keys(cashCloses).length);
        if (cloudExtrasEmpty && localExtrasHaveData && (isFirstTime || !extrasSeededBefore)) {
          await Promise.all([
            seedSavedExtras(result.id, savedCustomExtras),
            seedRateOverrides(result.id, rateOverrides),
            seedCashCloses(result.id, session.user.id, cashCloses),
          ]);
          saveLS(LS_KEYS.extrasSeeded, true);
          [cloudExtras, cloudOverrides, cloudCloses] = await Promise.all([
            loadSavedExtras(result.id),
            loadRateOverrides(result.id),
            loadCashCloses(result.id),
          ]);
        } else if (!cloudExtrasEmpty && !extrasSeededBefore) {
          saveLS(LS_KEYS.extrasSeeded, true);
        }

        if (cancelled) return;
        setPropertyId(result.id);
        setProperty(result.property);
        setBookings(cloudBookings);
        setSavedCustomExtras(cloudExtras);
        setRateOverrides(cloudOverrides);
        setCashCloses(cloudCloses);
        setCloudReady(true);
      } catch (err) {
        notifySyncFailure('Load from cloud', err);
        // Don't block the app — fall back to localStorage data so the
        // hotelier can still work. We retry on next sign-in.
        if (!cancelled) setCloudReady(true);
      }
    })();
    return () => { cancelled = true; };
    // session.user.id is the cheapest stable identity check; ignore object
    // identity churn from token refreshes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id]);

  // Push property edits up to Supabase. Debounced so typing in Settings
  // doesn't fire one round-trip per keystroke. localStorage continues to
  // mirror the state (via the existing effect above) so the user has a
  // working app even if the cloud save errors transiently.
  useEffect(() => {
    if (!cloudReady || !propertyId) return;
    const tid = setTimeout(() => {
      syncFire('Save property', saveCloudProperty(propertyId, property));
    }, 600);
    return () => clearTimeout(tid);
  }, [property, cloudReady, propertyId]);

  // Diff-sync for the three extras collections. We compare the live state
  // against a ref of the last-synced snapshot; whatever differs gets fired
  // at the cloud as add/remove/upsert. This keeps the screens unaware of
  // cloud sync — they just call setSavedCustomExtras/setRateOverrides/etc.
  // as before, and the diff effect propagates per-cell changes upstream.
  const savedExtrasRef = useRef(savedCustomExtras);
  useEffect(() => {
    if (!cloudReady || !propertyId) { savedExtrasRef.current = savedCustomExtras; return; }
    const prev = savedExtrasRef.current;
    const next = savedCustomExtras;
    const nextById = new Map(next.map(e => [e.id, e]));
    const prevById = new Map(prev.map(e => [e.id, e]));
    // Removals
    prev.filter(e => !nextById.has(e.id)).forEach(e => {
      syncFire('Remove saved extra', removeSavedExtraCloud(e.id));
    });
    // Updates — same id, changed name/price/unit
    next.forEach(e => {
      const old = prevById.get(e.id);
      if (!old) return;
      if (old.name !== e.name || old.price !== e.price || old.unit !== e.unit) {
        syncFire('Update saved extra', updateSavedExtraCloud(e.id, e));
      }
    });
    // Additions — server may rewrite the id; if so, swap the local row.
    const added = next.filter(e => !prevById.has(e.id));
    added.forEach(async e => {
      try {
        const cloudExtra = await syncCloud('Add saved extra', addSavedExtraCloud(propertyId, e));
        if (cloudExtra && cloudExtra.id && cloudExtra.id !== e.id) {
          setSavedCustomExtras(arr => arr.map(x => x.id === e.id ? { ...x, id: cloudExtra.id } : x));
        }
      } catch { /* syncCloud already toasted */ }
    });
    savedExtrasRef.current = next;
  }, [savedCustomExtras, cloudReady, propertyId]);

  const rateOverridesRef = useRef(rateOverrides);
  useEffect(() => {
    if (!cloudReady || !propertyId) { rateOverridesRef.current = rateOverrides; return; }
    const prev = rateOverridesRef.current;
    const next = rateOverrides;
    const allKeys = new Set([...Object.keys(prev), ...Object.keys(next)]);
    for (const key of allKeys) {
      const pv = prev[key], nv = next[key];
      const pvRate = pv && pv.rate, pvClosed = !!(pv && pv.closed);
      const nvRate = nv && nv.rate, nvClosed = !!(nv && nv.closed);
      if (!!pv === !!nv && pvRate === nvRate && pvClosed === nvClosed) continue;
      const [roomTypeId, idxStr] = key.split(':');
      const idx = parseInt(idxStr, 10);
      if (!roomTypeId || !isFinite(idx)) continue;
      if (!nv) {
        syncFire('Clear rate override', setRateOverrideCloud(propertyId, roomTypeId, idx, null));
      } else {
        syncFire('Update rate override', setRateOverrideCloud(propertyId, roomTypeId, idx, nv));
      }
    }
    rateOverridesRef.current = next;
  }, [rateOverrides, cloudReady, propertyId]);

  const cashClosesRef = useRef(cashCloses);
  useEffect(() => {
    if (!cloudReady || !propertyId) { cashClosesRef.current = cashCloses; return; }
    const prev = cashClosesRef.current;
    const next = cashCloses;
    const userId = session && session.user && session.user.id;
    const allDates = new Set([...Object.keys(prev), ...Object.keys(next)]);
    for (const date of allDates) {
      const pv = prev[date], nv = next[date];
      if (pv === nv) continue;
      if (!nv) {
        syncFire('Clear cash close', setCashCloseCloud(propertyId, userId, date, null));
      } else if (!pv || pv.cash !== nv.cash || pv.digital !== nv.digital || pv.note !== nv.note) {
        syncFire('Save cash close', setCashCloseCloud(propertyId, userId, date, nv));
      }
    }
    cashClosesRef.current = next;
  }, [cashCloses, cloudReady, propertyId, session]);

  // Auto-release: every 30s, scan tentative bookings; if releaseTs has passed, cancel.
  // Cancellations also sync to the cloud so cross-device state stays consistent.
  // We use refs (not state values from this closure) because the interval is
  // set up once on mount and would otherwise hold a stale cloudReady/propertyId.
  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      const changedIds = [];
      setBookings(arr => {
        const next = arr.map(b => {
          if (b.status === 'tentative' && b.releaseTs && b.releaseTs <= now && (b.paid || 0) < (b.total || 0)) {
            changedIds.push(b.id);
            return { ...b, status: 'cancelled', autoReleased: true };
          }
          return b;
        });
        return changedIds.length ? next : arr;
      });
      if (cloudReadyRef.current && propertyIdRef.current && changedIds.length) {
        changedIds.forEach(id => {
          syncFire('Auto-release booking', updateBookingCloud(id, { status: 'cancelled', autoReleased: true }));
        });
      }
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
    const booking = bookings.find(b => b.id === bookingId);
    if (!booking) return;
    const existing = booking.payments || (booking.paid > 0
      ? [{ id: 'p1', kind: 'payment', method: booking.channel === 'direct' ? 'upi' : 'card', amount: booking.paid, note: 'Initial payment', date: '03 May · 18:25' }]
      : []);
    const nextPayments = [...existing, entry];
    const newPaid = nextPayments.reduce((s, p) => s + (p.kind === 'refund' || p.kind === 'credit' ? -p.amount : p.amount), 0);
    // If a hold gets paid in full, auto-confirm.
    const newStatus = (booking.status === 'tentative' && newPaid >= booking.total) ? 'confirmed' : booking.status;
    const clearReleaseFields = newStatus === 'confirmed' && booking.status === 'tentative';

    setBookings(arr => arr.map(b => {
      if (b.id !== bookingId) return b;
      const update = { ...b, payments: nextPayments, paid: newPaid, status: newStatus };
      if (clearReleaseFields) {
        delete update.releaseTs; delete update.releaseAt;
      }
      return update;
    }));

    if (cloudReady && propertyId) {
      syncFire('Save payment', addPaymentCloud({
        bookingId, propertyId,
        userId: session && session.user && session.user.id,
        entry, newPaid, newStatus, clearReleaseFields,
      }));
    }
  };

  const setStatus = (bookingId, status) => {
    const clearRelease = status === 'confirmed' || status === 'cancelled' || status === 'checkedin';
    setBookings(arr => arr.map(b => {
      if (b.id !== bookingId) return b;
      const next = { ...b, status };
      if (clearRelease) {
        delete next.releaseTs; delete next.releaseAt;
      }
      return next;
    }));

    if (cloudReady && propertyId) {
      const patch = { status };
      if (clearRelease) {
        patch.releaseTs = null;
        patch.releaseAt = null;
      }
      syncFire('Update booking status', updateBookingCloud(bookingId, patch));
    }
  };

  // Push a tentative booking's auto-release deadline further out. Adds `hours`
  // to the current releaseTs (or to now, if the timer has somehow gone stale)
  // and resyncs releaseAt + holdHours so the UI stays in sync.
  const extendHold = (bookingId, hours) => {
    if (!hours || hours <= 0) return;
    const booking = bookings.find(b => b.id === bookingId);
    if (!booking || booking.status !== 'tentative') return;
    const fromTs = (booking.releaseTs && booking.releaseTs > Date.now()) ? booking.releaseTs : Date.now();
    const releaseTs = fromTs + hours * 3600 * 1000;
    const d = new Date(releaseTs);
    const releaseAt = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    const holdHours = (booking.holdHours || 0) + hours;

    setBookings(arr => arr.map(b => {
      if (b.id !== bookingId || b.status !== 'tentative') return b;
      return { ...b, releaseTs, releaseAt, holdHours, autoReleased: false };
    }));

    if (cloudReady && propertyId) {
      syncFire('Extend hold', updateBookingCloud(bookingId, { releaseTs, releaseAt, holdHours, autoReleased: false }));
    }
  };

  const moveBooking = (bookingId, patch) => {
    setBookings(arr => arr.map(b => b.id === bookingId ? { ...b, ...patch } : b));
    if (cloudReady && propertyId) {
      syncFire('Move booking', updateBookingCloud(bookingId, patch));
    }
  };

  const setBookingGst = (bookingId, value) => {
    setBookings(arr => arr.map(b => b.id === bookingId ? { ...b, gstApplies: !!value } : b));
    if (cloudReady && propertyId) {
      syncFire('Update invoice flag', updateBookingCloud(bookingId, { gstApplies: !!value }));
    }
  };

  // Issue one sequential tax invoice against a booking. The argument is a
  // single { amount, recipient, items?, note? } object; legacy callers that
  // passed an array of "parts" (split invoicing, removed) get the first
  // entry honoured for back-compat.
  //
  // Online path: the issue_invoice() stored procedure atomically bumps the
  // property's per-FY counter and inserts the invoice row in one
  // transaction. This is the only safe way to guarantee gap-free numbering
  // under concurrent edits.
  //
  // Offline path: fall back to the local counter so the hotelier isn't
  // blocked when the network is down. We reconcile on the next sync.
  const issueInvoice = async (bookingId, partOrParts) => {
    const booking = bookings.find(b => b.id === bookingId);
    if (!booking || booking.status === 'tentative') return null;
    const part = (Array.isArray(partOrParts) ? partOrParts[0] : partOrParts) || {
      amount: booking.total || 0,
      recipient: { name: booking.guest, gstin: '', address: '' },
    };
    const fy = currentFinancialYear();

    if (cloudReady && propertyId) {
      try {
        const inv = await syncCloud('Issue invoice', issueInvoiceCloud({
          bookingId,
          fy,
          amount: +part.amount || 0,
          recipient: part.recipient || { name: booking.guest, gstin: '', address: '' },
          prefix: invoicePrefixOf(property),
          items: part.items || null,
          note: part.note || '',
        }));
        setBookings(arr => arr.map(b => b.id === bookingId
          ? { ...b, invoices: [...(b.invoices || []), inv] }
          : b));
        setProperty(p => {
          const counters = { ...(p.invoiceCounters || {}) };
          const seq = parseInt(String(inv.number).split('-').pop(), 10);
          if (isFinite(seq)) counters[fy] = Math.max(counters[fy] || 0, seq);
          return { ...p, invoiceCounters: counters };
        });
        return [inv];
      } catch {
        // syncCloud already notified the user via the error toast; fall
        // through to the local-only path below so the hotelier still gets
        // a usable invoice number on screen.
      }
    }

    // Local-only fallback (offline or cloud error).
    const baseSeq = (property.invoiceCounters && property.invoiceCounters[fy]) || 0;
    const nowIso = new Date().toISOString();
    const newInvoice = {
      id: 'inv_' + Date.now(),
      number: formatInvoiceNumber(fy, baseSeq + 1, invoicePrefixOf(property)),
      fy,
      date: nowIso,
      amount: +part.amount || 0,
      recipient: part.recipient || { name: booking.guest, gstin: '', address: '' },
      items: part.items || null,
      note: part.note || '',
      voided: false,
    };
    setProperty(p => ({ ...p, invoiceCounters: { ...(p.invoiceCounters || {}), [fy]: baseSeq + 1 } }));
    setBookings(arr => arr.map(b => b.id === bookingId
      ? { ...b, invoices: [...(b.invoices || []), newInvoice] }
      : b));
    return [newInvoice];
  };

  const voidInvoice = (bookingId, invoiceId) => {
    setBookings(arr => arr.map(b => b.id === bookingId
      ? { ...b, invoices: (b.invoices || []).map(inv => inv.id === invoiceId ? { ...inv, voided: true } : inv) }
      : b));
    if (cloudReady && propertyId) {
      syncFire('Void invoice', voidInvoiceCloud(invoiceId));
    }
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

  // Cash close setter: null value = delete (reopen the day). Local state
  // update is optimistic; the cashCloses diff-sync effect propagates the
  // change up to Supabase.
  const setCashClose = (date, value) => {
    setCashCloses(prev => {
      if (value == null) {
        const { [date]: _drop, ...rest } = prev;
        return rest;
      }
      return { ...prev, [date]: value };
    });
  };

  const onCreate = async (data, total) => {
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
      const existing = bookings.find(b => b.id === editing);
      const guestsStr = `${data.roomItems.reduce((s, r) => s + r.adults, 0)}A${data.roomItems.reduce((s, r) => s + r.children, 0) > 0 ? ` ${data.roomItems.reduce((s, r) => s + r.children, 0)}C` : ''}`;
      const phone = dial + ' ' + (data.phone || (existing && existing.phone ? existing.phone.replace(/^\+\d+\s*/, '') : ''));
      const patch = {
        roomTypeId: data.roomTypeId, nights: data.nights,
        guest: data.name || (existing && existing.guest) || '',
        total, paid, phone, email: data.email || '',
        notes: data.notes, extras: data.extras,
        roomItems: data.roomItems, customExtras: data.customExtras, extraPrices: data.extraPrices,
        country, formC, state: data.state || '',
        gstApplies: !!data.gstApplies,
        mealPlanId: data.mealPlanId || 'ep',
        guests: guestsStr,
      };
      if (isHold) {
        patch.status = 'tentative';
        patch.releaseTs = releaseTs;
        patch.releaseAt = releaseAt;
      }
      setBookings(arr => arr.map(b => b.id === editing ? { ...b, ...patch } : b));
      setEditing(null);
      setRoute({ name: 'booking', arg: editing });

      if (cloudReady && propertyId) {
        syncFire('Update booking', updateBookingCloud(editing, patch));
      }
    } else {
      const startIdx = parseCheckInIdx(data.checkIn);
      const unitIdx = findFirstFreeUnit(bookings, data.roomTypeId, startIdx, data.nights, effectiveRoomTypes(property));
      const guestsStr = `${data.roomItems.reduce((s, r) => s + r.adults, 0)}A${data.roomItems.reduce((s, r) => s + r.children, 0) > 0 ? ` ${data.roomItems.reduce((s, r) => s + r.children, 0)}C` : ''}`;
      const newBk = {
        roomTypeId: data.roomTypeId,
        unitIdx,
        startIdx,
        nights: data.nights,
        guest: data.name || 'New Guest',
        status,
        channel: 'direct',
        total,
        paid,
        guests: guestsStr,
        phone: dial + ' ' + data.phone,
        email: data.email || '',
        country, formC,
        notes: data.notes,
        extras: data.extras,
        roomItems: data.roomItems,
        customExtras: data.customExtras,
        extraPrices: data.extraPrices,
        gstApplies: !!data.gstApplies,
        mealPlanId: data.mealPlanId || 'ep',
        state: data.state || '',
        releaseTs: releaseTs || undefined,
        releaseAt: releaseAt || undefined,
        holdHours: isHold ? data.holdHours : undefined,
      };

      if (cloudReady && propertyId) {
        // Cloud-first: the DB trigger assigns the next BK-XXXX so the id we
        // store matches the one the voucher/invoices will reference. ~500ms
        // round-trip; the "Confirm booking" tap shows a quick spinner via
        // the existing UI state in NewBooking before navigation.
        try {
          const created = await syncCloud('Create booking',
            createBookingCloud(propertyId, session && session.user && session.user.id, newBk));
          setBookings(arr => [...arr, created]);
          go('booking-confirmed', created.id);
          return;
        } catch {
          // syncCloud already toasted the failure; fall through to the
          // local-only path below so the booking still lands on screen.
        }
      }

      // Offline or cloud-error fallback — assign an id locally.
      newBk.id = 'BK-' + (2854 + bookings.length);
      setBookings(arr => [...arr, newBk]);
      go('booking-confirmed', newBk.id);
    }
  };

  const showTabs = ['home', 'diary', 'guests', 'more'].includes(route.name);
  const editingBooking = editing ? bookings.find(b => b.id === editing) : null;

  let screen;
  switch (route.name) {
    case 'home':              screen = <Dashboard go={go} bookings={bookings} property={property} t={t} lang={lang} onAddPayment={addPayment} onExtendHold={extendHold} cashCloses={cashCloses} onSetCashClose={setCashClose} />; break;
    case 'diary':             screen = <Diary go={go} bookings={bookings} setBookings={setBookings} moveBooking={moveBooking} t={t} property={property} />; break;
    case 'new': {
      // route.arg is either a booking id string (edit path) or an object
      // { prefill: { date, roomTypeId } } from a Diary cell quick-create.
      const argIsPrefill = route.arg && typeof route.arg === 'object';
      const prefill = argIsPrefill ? (route.arg.prefill || route.arg) : null;
      screen = <NewBooking go={go} onCreate={onCreate} plan={plan} t={t} editing={editingBooking} prefill={prefill} savedCustomExtras={savedCustomExtras} onRemoveSavedExtra={removeSavedCustomExtra} rateOverrides={rateOverrides} property={property} bookings={bookings} />;
      break;
    }
    case 'booking':           screen = <BookingDetail go={go} bookingId={route.arg} bookings={bookings} plan={plan} t={t} lang={lang} property={property} onEdit={startEdit} onPayment={addPayment} onSetStatus={setStatus} onExtendHold={extendHold} onSetGst={setBookingGst} onIssueInvoice={issueInvoice} onVoidInvoice={voidInvoice} />; break;
    case 'booking-confirmed': screen = <BookingConfirmed go={go} t={t} bookingId={route.arg} bookings={bookings} property={property} lang={lang} />; break;
    case 'rates':             screen = <Rates go={go} t={t} lang={lang} overrides={rateOverrides} setOverrides={setRateOverrides} property={property} />; break;
    case 'guests':            screen = <Guests go={go} bookings={bookings} t={t} />; break;
    case 'channels':          screen = <Channels go={go} t={t} />; break;
    case 'reports':           screen = <Reports go={go} t={t} bookings={bookings} plan={plan} property={property} />; break;
    case 'settings':          screen = <Settings go={go} plan={plan} onChangePlan={setPlan} lang={lang} onChangeLang={setLang} property={property} onChangeProperty={setProperty} savedExtras={savedCustomExtras} onChangeSavedExtras={setSavedCustomExtras} t={t} session={session} onSignOut={supaSignOut} />; break;
    case 'more':              screen = <MoreMenu go={go} t={t} />; break;
    default:                  screen = <Dashboard go={go} bookings={bookings} property={property} t={t} lang={lang} onAddPayment={addPayment} onExtendHold={extendHold} cashCloses={cashCloses} onSetCashClose={setCashClose} />;
  }

  // Splash while Supabase tells us whether the user is signed in, and again
  // (after sign-in) while the cloud property is loading/bootstrapping. Both
  // are normally sub-second; the splash just prevents the app from rendering
  // against stale localStorage data before the cloud answers.
  // DEMO_MODE bypasses both gates so the app boots straight into the home
  // screen using whatever's in localStorage.
  if (!DEMO_MODE && (!authReady || (session && !cloudReady))) {
    return (
      <div className={'atithi' + (lang === 'hi' ? ' hi-mode' : '')} style={{
        height: '100%', background: T.bg, color: T.ink3,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 12, fontWeight: 600,
      }}>{t('loading')}</div>
    );
  }

  // No session → sign-in screen. localStorage data is preserved underneath
  // and will be picked up on the same browser after sign-in. Bypassed in
  // DEMO_MODE — the app trusts localStorage and never asks for credentials.
  if (!DEMO_MODE && !session) {
    return <SignIn t={t} lang={lang} onChangeLang={setLang} />;
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
      {/* Floating search trigger — visible on the four tab-bar screens
          (home / diary / guests / more). Hidden on inner screens like
          BookingDetail / NewBooking where the back arrow occupies the
          same top-left zone visually. */}
      {showTabs && (
        <button
          onClick={() => setSearchOpen(true)}
          aria-label="Search bookings"
          style={{
            position: 'absolute', top: 14, right: 14, zIndex: 30,
            width: 36, height: 36, borderRadius: 10,
            border: `1px solid ${T.border}`, background: T.card, color: T.ink2,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
          }}
        >
          <Icon name="search" size={15} stroke={2.2} />
        </button>
      )}
      <SearchOverlay
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        bookings={bookings}
        property={property}
        go={go}
      />
      <SyncOverlay t={t} />
    </div>
  );
}

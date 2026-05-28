import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useT } from './i18n.js';
import { T, applyTheme } from './tokens.js';
import { BOOKINGS_SEED, COUNTRIES, ROOM_TYPES, DAYS, currentFinancialYear, formatInvoiceNumber, invoicePrefixOf, effectiveRoomTypes, dateToIdx } from './data.js';
import { supabase, signOut as supaSignOut } from './supabase.js';
import { loadCurrentProperty, bootstrapProperty, saveCloudProperty } from './cloud/property.js';
import {
  loadBookings,
  createBookingCloud, updateBookingCloud,
  addPaymentCloud, issueInvoiceCloud, voidInvoiceCloud,
} from './cloud/bookings.js';
import {
  loadSavedExtras, addSavedExtraCloud, removeSavedExtraCloud, updateSavedExtraCloud,
  loadRateOverrides, setRateOverrideCloud,
  loadCashCloses, setCashCloseCloud,
} from './cloud/extras.js';
import {
  loadExpenses, addExpenseCloud, removeExpenseCloud, updateExpenseCloud,
} from './cloud/expenses.js';
import { acceptPendingInvitesForUser } from './cloud/team.js';
import { logActivity } from './cloud/activity.js';
import { effectivePermissions } from './components/TeamSection.jsx';
import { syncCloud, syncFire, notifySyncFailure } from './cloud/sync.js';
import SyncOverlay from './components/SyncOverlay.jsx';
import SearchOverlay from './components/SearchOverlay.jsx';
import InstallPrompt from './components/InstallPrompt.jsx';
import Icon from './components/Icon.jsx';
import PublicBookingWidget from './screens/PublicBookingWidget.jsx';
import { loadPropertyBySlug, loadWidgetInventory, insertWidgetBooking } from './cloud/widget.js';
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
import Onboarding from './screens/Onboarding.jsx';
import Expenses from './screens/Expenses.jsx';
import Activity from './screens/Activity.jsx';

// HARDCODED_DEMO_MODE: when true, skips the Supabase magic-link sign-in
// gate and runs entirely off localStorage so prospects can poke the app
// with no email round-trip. Flipped to false on 2026-05-26 — the live
// site now requires a real sign-in. Per-browser demo opt-in (?demo=1
// URL + "Try the demo" SignIn button) still lets a curious visitor
// preview the app without an account.
const HARDCODED_DEMO_MODE = false;

// Per-browser demo opt-in. When the hotelier (or a prospect) lands on
// `?demo=1` or taps "Try the demo" on SignIn, we set this flag. It lets
// the demo experience persist across reloads without touching the
// hardcoded constant above — useful for showing prospective hoteliers
// the app without making them create an account.
function isSessionDemo() {
  if (typeof window === 'undefined') return false;
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get('demo') === '1') {
      // First-time arrival via ?demo=1. Wipe any leftover real-account
      // state so the demo starts from a clean Yatra dataset, then set
      // the opt-in flag. Same pattern as the "Try the demo" button in
      // SignIn — see the comment there.
      const keysToReset = [
        'atithi.bookings.v1', 'atithi.property.v1',
        'atithi.customExtras.v1', 'atithi.rateOverrides.v1',
        'atithi.cashCloses.v1', 'atithi.expenses.v1',
        'atithi.onboarded.v1', 'atithi.bookingsSeeded.v1',
        'atithi.extrasSeeded.v1', 'atithi.expensesSeeded.v1',
      ];
      try {
        if (window.localStorage.getItem('atithi.demo.v1') !== 'true') {
          keysToReset.forEach(k => window.localStorage.removeItem(k));
        }
        window.localStorage.setItem('atithi.demo.v1', 'true');
      } catch {}
      return true;
    }
    return window.localStorage.getItem('atithi.demo.v1') === 'true';
  } catch {
    return false;
  }
}

// Effective demo mode: hardcoded constant OR session-opted-in flag.
// Either disables the sign-in gate.
const DEMO_MODE = HARDCODED_DEMO_MODE || isSessionDemo();

// Public-widget mode: when the URL has /book/<slug> (pretty URL) or
// the legacy ?book=1 query param the app renders the customer-facing
// booking widget instead of the hotelier dashboard. Detected at
// module load so the hotelier UI never even mounts on public URLs —
// keeps the widget honest (no leaked admin controls).
//
// `widgetSlug` is the part after /book/ if present. We use it to
// match the property by shortCode (or just trust it in DEMO_MODE
// where there's only one property anyway).
let IS_PUBLIC_WIDGET = false;
let WIDGET_SLUG = null;
if (typeof window !== 'undefined') {
  const path = window.location.pathname;
  const query = new URLSearchParams(window.location.search);
  // Path-based: /atithi/book/yatra OR /book/yatra
  const m = path.match(/\/book(?:\/([^\/]+))?\/?$/);
  if (m) {
    IS_PUBLIC_WIDGET = true;
    WIDGET_SLUG = m[1] || null;
  } else if (query.get('book') === '1') {
    IS_PUBLIC_WIDGET = true;
    WIDGET_SLUG = query.get('p') || null; // optional ?p=<slug> for legacy URLs
  }
}

const LS_KEYS = {
  bookings: 'atithi.bookings.v1',
  customExtras: 'atithi.customExtras.v1',
  overrides: 'atithi.rateOverrides.v1',
  cashCloses: 'atithi.cashCloses.v1',
  expenses: 'atithi.expenses.v1',               // daily expense ledger
  plan: 'atithi.plan.v1',
  lang: 'atithi.lang.v1',
  property: 'atithi.property.v1',
  bookingsSeeded: 'atithi.bookings.seeded.v1',  // set once cloud bookings have been seeded for this browser
  extrasSeeded: 'atithi.extras.seeded.v1',      // set once cloud saved_extras/rate_overrides/cash_closes have been seeded
  expensesSeeded: 'atithi.expenses.seeded.v1',  // set once cloud expenses have been seeded
  onboarded: 'atithi.onboarded.v1',             // first-run wizard dismissed (one-way flag)
  demoSession: 'atithi.demo.v1',                // per-browser demo opt-in flag
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
    // Pretty-URL slug for the public booking widget. atithi.app/book/<slug>.
    // Defaults to slugify(name) at first load; hotelier can edit it in
    // Settings → Property profile → Booking link.
    shortCode: '',
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
  // Weekend rules. Some Indian properties treat Friday as weekend (Goa,
  // Jaisalmer); others stick to Sat+Sun. Multiplier applies to the base
  // rate on weekend days unless an explicit per-day override is set.
  // weekendDays uses 0=Sun ... 6=Sat (JS getDay convention).
  weekendRules: { weekendDays: [0, 6], upliftPct: 20 },
  // Named seasons / periods. Each season multiplies the per-day rate
  // for any date inside [startIso, endIso] (both inclusive). Stacks
  // multiplicatively with the weekend uplift; explicit per-day
  // overrides still win over both. Color is just for the calendar
  // stripe so the hotelier can eyeball where seasons land.
  seasons: [],
  // Channel-specific rate markups, in %. Direct stays at 0 (you set
  // direct rates in Rates & inventory; each OTA gets a markup applied
  // before pushing). Most OTAs require rate parity, so any non-zero
  // value triggers a parity warning in Settings — they're allowed to
  // be set but the hotelier sees the contractual risk first.
  // Surface only relevant on Channels / Invoicing plans (Engine has
  // no channel sync at all). Sync to OTAs themselves waits on the
  // Phase 5 channel-manager integration.
  channelMarkups: { direct: 0, mmt: 0, goibibo: 0, booking: 0, agoda: 0, airbnb: 0 },
  // Rate plans — different price tiers for the same room (e.g. Flexible
  // refundable, Non-refundable discount, Long-stay 10% off). Each plan
  // multiplies the per-day rate by multiplierPct. The "standard" plan
  // is always 0% and always enabled — it's the rate the calendar shows.
  // When only "standard" is enabled, the booking flow hides the picker
  // (no choice to make). Adding any second enabled plan surfaces it.
  ratePlans: [
    { id: 'standard',       label: 'Standard',       multiplierPct: 0,  cancellation: 'flexible',      refundHours: 48, enabled: true  },
    { id: 'flexible',       label: 'Flexible',       multiplierPct: 15, cancellation: 'flexible',      refundHours: 24, enabled: false },
    { id: 'nonrefundable',  label: 'Non-refundable', multiplierPct: -10, cancellation: 'non-refundable', refundHours: 0,  enabled: false },
  ],
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
  // Weekend rules — seed defaults; clamp/migrate from any partial saved state.
  if (!out.weekendRules || typeof out.weekendRules !== 'object') {
    out.weekendRules = { ...DEFAULT_PROPERTY.weekendRules };
  } else {
    out.weekendRules = {
      weekendDays: Array.isArray(out.weekendRules.weekendDays) ? out.weekendRules.weekendDays.filter(n => Number.isInteger(n) && n >= 0 && n <= 6) : [0, 6],
      upliftPct: Number.isFinite(out.weekendRules.upliftPct) ? Math.max(0, Math.min(200, out.weekendRules.upliftPct)) : 20,
    };
  }
  if (!Array.isArray(out.seasons)) out.seasons = [];
  if (!out.channelMarkups || typeof out.channelMarkups !== 'object') {
    out.channelMarkups = { ...DEFAULT_PROPERTY.channelMarkups };
  } else {
    out.channelMarkups = { ...DEFAULT_PROPERTY.channelMarkups, ...out.channelMarkups };
  }
  // Rate plans: seed defaults if missing. Older property objects never had
  // this; they still produce a usable Standard plan via the default seed.
  if (!Array.isArray(out.ratePlans) || out.ratePlans.length === 0) {
    out.ratePlans = DEFAULT_PROPERTY.ratePlans.map(p => ({ ...p }));
  } else {
    // Ensure the standard plan is present and always enabled at 0%, in
    // case the hotelier renamed it but kept the id.
    const hasStandard = out.ratePlans.some(p => p.id === 'standard');
    if (!hasStandard) {
      out.ratePlans = [{ ...DEFAULT_PROPERTY.ratePlans[0] }, ...out.ratePlans];
    } else {
      out.ratePlans = out.ratePlans.map(p => p.id === 'standard' ? { ...p, multiplierPct: 0, enabled: true } : p);
    }
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
  // Allow negative idx (past dates) — a hotelier recording a walk-in
  // from yesterday after they forgot needs to land the booking on the
  // actual date, not silently bumped to today. The diary already
  // supports past dates via `pastDays`, so a past startIdx renders
  // correctly. Only invalid date strings still default to today.
  const idx = dateToIdx(checkInStr);
  return isFinite(idx) ? idx : 0;
}

// Pick the lowest-numbered unit of the chosen room type that is free for the requested
// date range. Returns null when every unit is taken so the caller can surface a clear
// "this room type is fully booked — pick another" message instead of silently double-
// booking unit 0 (which would just stack two pills on top of each other in the Diary).
function findFirstFreeUnit(bookings, roomTypeId, startIdx, nights, roomTypes) {
  const list = Array.isArray(roomTypes) && roomTypes.length ? roomTypes : ROOM_TYPES;
  const room = list.find(r => r.id === roomTypeId);
  if (!room) return null;
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
  return null;
}

// Public booking widget — wraps PublicBookingWidget with its own
// cloud loader so an anonymous visitor (no Supabase session) gets the
// right hotel's data based on the URL slug, not whatever's in
// localStorage from a previous demo session. Submits go straight to
// Supabase via the anon RLS path; falls back to the fallback* props
// (local state) only when the cloud calls fail (typically: anon RLS
// SQL not yet pasted into Supabase, dev mode, or a slug that doesn't
// match any property).
function PublicWidgetEntry({ slug, fallbackProperty, fallbackBookings, fallbackOverrides, fallbackExtras, lang }) {
  const [cloudProperty, setCloudProperty] = useState(null);
  const [cloudBookings, setCloudBookings] = useState(null);
  const [cloudCategories, setCloudCategories] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(!!slug);

  useEffect(() => {
    let cancelled = false;
    if (!slug) {
      // No slug → fall back to local property (preview path when the
      // hotelier opens the widget themselves while signed in).
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const prop = await loadPropertyBySlug(slug);
        if (cancelled) return;
        if (!prop) {
          setLoadError('property_not_found');
          setLoading(false);
          return;
        }
        const inv = await loadWidgetInventory(prop.id);
        if (cancelled) return;
        // Merge categories into property so the widget renders rooms.
        setCloudProperty({ ...prop, categories: inv.categories });
        setCloudBookings(inv.bookings);
        setCloudCategories(inv.categories);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        console.warn('[atithi widget] cloud load failed, falling back to local', err);
        setLoadError('cloud_unavailable');
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [slug]);

  // Loading splash while we fetch from cloud.
  if (loading) {
    return (
      <div style={{ height: '100%', background: T.bg, color: T.ink3, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600 }}>
        Loading…
      </div>
    );
  }
  // Hard-fail when the slug doesn't match a property. Don't fall
  // back to fallbackProperty (which would be Yatra's demo data) —
  // that's how guest bookings used to silently land on the wrong
  // hotel's diary.
  if (loadError === 'property_not_found') {
    return (
      <div style={{ height: '100%', background: T.bg, padding: 32, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: T.ink }}>Hotel not found</div>
        <div style={{ fontSize: 13, color: T.ink3, maxWidth: 320, lineHeight: 1.5 }}>
          The booking link <code style={{ background: T.bgSoft, padding: '2px 6px', borderRadius: 4 }}>/book/{slug}</code> doesn't match any property. The link may have been mistyped or the property's URL may have changed.
        </div>
      </div>
    );
  }

  // Use cloud data when available; fall back to local (demo /
  // hotelier-preview-while-signed-in) otherwise.
  const widgetProperty = cloudProperty || fallbackProperty;
  const widgetBookings = cloudBookings || fallbackBookings;
  // No rate overrides via anon path for now — widget uses base rates
  // + property-level multipliers. Hotelier-side rate-override
  // calendar still works on the diary as before.
  const widgetOverrides = cloudCategories ? {} : fallbackOverrides;

  const handleSubmit = (newBk) => {
    if (cloudProperty && cloudProperty.id) {
      // Anonymous insert — fire and forget. The cloud-side trigger
      // assigns the real BK-XXXX id, but anon doesn't have SELECT
      // permission to read it back (RLS), so the widget never sees
      // the real id. We return a friendly reference code instead
      // (WEB-XXXX) for the guest's confirmation screen; the hotelier
      // sees the real BK-#### when it lands in their diary.
      insertWidgetBooking(cloudProperty.id, newBk)
        .catch(err => {
          // Cloud insert failed — most likely the anon RLS SQL
          // hasn't been pasted yet. We can't synchronously
          // surface this to the widget (the confirmation screen
          // already rendered), but we log it loudly so the
          // hotelier can see why their widget bookings aren't
          // appearing on their diary.
          console.error('[atithi widget] insert failed — anon RLS may not be set up. Run supabase/migrations/20260605_widget_anon_access.sql.', err);
        });
      // 4-char reference. Recognizable as "this is a temporary code,
      // not your final booking number" because of the WEB- prefix.
      const ref = 'WEB-' + Date.now().toString(36).slice(-4).toUpperCase();
      return ref;
    }
    // Fallback for demo / preview — local state only.
    const id = 'BK-' + (2854 + (fallbackBookings || []).length);
    return id;
  };

  return (
    <div className={'atithi' + (lang === 'hi' ? ' hi-mode' : '')} style={{ height: '100%', background: T.bg, overflow: 'hidden' }}>
      <PublicBookingWidget
        property={widgetProperty}
        bookings={widgetBookings || []}
        rateOverrides={widgetOverrides || {}}
        savedCustomExtras={fallbackExtras || []}
        onSubmit={handleSubmit}
      />
    </div>
  );
}

// Rendered in place of any screen the current user doesn't have permission
// to open. Reachable via deep-link / refresh / browser-back rather than a
// tap (we hide the entry-point buttons elsewhere), but the gate stays here
// in case the route was reached anyway.
function PermissionDenied({ go, action }) {
  return (
    <div style={{ height: '100%', background: T.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 }}>
      <div style={{ width: 56, height: 56, borderRadius: 14, background: T.bgSoft, color: T.ink3, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="lock" size={24} />
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, color: T.ink, textAlign: 'center' }}>
        You don't have permission to {action}
      </div>
      <div style={{ fontSize: 12, color: T.ink3, fontWeight: 600, textAlign: 'center', lineHeight: 1.5, maxWidth: 280 }}>
        Ask your property owner to grant this permission in Settings → Property profile → Team members.
      </div>
      <button
        onClick={() => go('home')}
        style={{ marginTop: 6, padding: '9px 18px', borderRadius: 8, border: 'none', background: T.primary, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
      >Back to home</button>
    </div>
  );
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
  // Initial state defaults — branch on DEMO mode so a fresh real-user
  // sign-up never sees Yatra Desert Camp's seed data flashed at them
  // before cloud-load completes. Only the demo path (HARDCODED_DEMO_MODE
  // or per-browser ?demo=1 opt-in) gets the prebuilt sample property +
  // bookings; live cloud users start from a true blank slate that the
  // bootstrap path then replaces with their actual cloud data.
  const EMPTY_PROPERTY = {
    profile: { name: '', phone: '', city: '', checkIn: '14:00', checkOut: '11:00' },
    categories: [],
    rules: [],
    amenityIds: [],
    customAmenities: [],
    accountant: { name: '', email: '', firm: '' },
    theme: { hue: 38 },
  };
  const [bookings, setBookings] = useState(() => loadLS(LS_KEYS.bookings, DEMO_MODE ? BOOKINGS_SEED.map(b => ({ ...b })) : []));
  const [savedCustomExtras, setSavedCustomExtras] = useState(() => loadLS(LS_KEYS.customExtras, []));
  const [rateOverrides, setRateOverrides] = useState(() => loadLS(LS_KEYS.overrides, {}));
  const [cashCloses, setCashCloses] = useState(() => loadLS(LS_KEYS.cashCloses, {}));
  const [expenses, setExpenses] = useState(() => loadLS(LS_KEYS.expenses, []));
  const [property, setProperty] = useState(() => migrateProperty(loadLS(LS_KEYS.property, DEMO_MODE ? DEFAULT_PROPERTY : EMPTY_PROPERTY)));
  // First-run onboarding state. Auto-shows on first launch when the
  // property is empty (no name OR no room categories) and the dismissed
  // flag isn't set. The Dashboard's "Finish setting up" nudge remains as
  // the ongoing reminder after the wizard is closed.
  const [onboardingDismissed, setOnboardingDismissed] = useState(() => !!loadLS(LS_KEYS.onboarded, false));
  const needsOnboarding = !onboardingDismissed
    && (!property?.profile?.name?.trim() || !(Array.isArray(property?.categories) && property.categories.length > 0));
  const [editing, setEditing] = useState(null);

  // Undo snackbar — set when a destructive action just fired
  // (cancellation, auto-release). Shape: { kind, bookingId, guest,
  // previousStatus, previousReleaseTs, previousReleaseAt,
  // previousAutoReleased, expiresAt }. Snackbar component below the
  // tab bar consumes this; tapping "Undo" calls undoLast().
  const [undoState, setUndoState] = useState(null);
  // Auto-dismiss the snackbar at expiresAt. Updates whenever a new
  // undo is queued or the current one expires.
  useEffect(() => {
    if (!undoState) return;
    const ms = undoState.expiresAt - Date.now();
    if (ms <= 0) { setUndoState(null); return; }
    const id = setTimeout(() => setUndoState(null), ms);
    return () => clearTimeout(id);
  }, [undoState]);
  const undoLast = () => {
    if (!undoState) return;
    const { bookingId, previousStatus, previousReleaseTs, previousReleaseAt, previousAutoReleased } = undoState;
    let nextEvents = null;
    setBookings(arr => arr.map(b => {
      if (b.id !== bookingId) return b;
      const evt = { kind: 'status', text: `Restored from cancellation (was ${previousStatus})`, time: new Date().toISOString() };
      nextEvents = [...(Array.isArray(b.events) ? b.events : []), evt];
      return {
        ...b,
        status: previousStatus,
        releaseTs: previousReleaseTs,
        releaseAt: previousReleaseAt,
        autoReleased: previousAutoReleased,
        events: nextEvents,
      };
    }));
    if (cloudReady && propertyId) {
      const patch = {
        status: previousStatus,
        releaseTs: previousReleaseTs || null,
        releaseAt: previousReleaseAt || null,
        autoReleased: previousAutoReleased,
      };
      if (nextEvents) patch.events = nextEvents;
      syncFire('Undo cancellation', updateBookingCloud(bookingId, patch));
    }
    setUndoState(null);
  };
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
  // The signed-in user's membership for the active property: { role,
  // permissions }. Drives the `can(permission)` helper for RBAC gating.
  // null while loading or in DEMO mode — `can()` treats that as full
  // access so a single-user owner / demo session sees everything.
  const [currentMember, setCurrentMember] = useState(null);
  // Refs mirror state for use inside callbacks that close over older renders
  // (the 30s auto-release ticker, in particular, is registered once on mount
  // and can't depend on cloudReady/propertyId/session changing).
  const propertyIdRef = useRef(null);
  const cloudReadyRef = useRef(false);
  const sessionRef = useRef(null);
  useEffect(() => { propertyIdRef.current = propertyId; }, [propertyId]);
  useEffect(() => { cloudReadyRef.current = cloudReady; }, [cloudReady]);
  useEffect(() => { sessionRef.current = session; }, [session]);
  // Diff-sync refs hoisted above the cloud-load useEffect so the cloud
  // load can snapshot them with the freshly-loaded cloud values BEFORE
  // the diff-sync effects fire. Without that snapshot, the very first
  // diff would compare stale localStorage state to fresh cloud data
  // and produce spurious delete-this-from-cloud / write-stale-to-cloud
  // calls — silent data corruption on every sign-in.
  const savedExtrasRef = useRef(savedCustomExtras);
  const rateOverridesRef = useRef(rateOverrides);
  const cashClosesRef = useRef(cashCloses);
  const t = useT(lang);

  // RBAC. `can(permission)` is the single helper every screen calls to
  // decide whether to show a button / open an action sheet. Resolves
  // against the current member's stored permissions array, falling
  // back to the role's defaults via effectivePermissions(). Three
  // ways the helper resolves:
  //   1. DEMO mode (no session at all) → can() returns true. Single
  //      hotelier poking the app needs to see everything.
  //   2. Signed-in, currentMember loaded → check against the perm set.
  //   3. Signed-in, currentMember NOT yet loaded (cloud fetch in
  //      flight) → can() returns FALSE. We previously returned true
  //      here "to avoid a flash" — but that left a 500ms window
  //      where a Reception staffer could deep-link to BookingDetail,
  //      tap Cancel before currentMember loaded, and the optimistic
  //      local update would land + the cloud write succeed (RLS only
  //      checks membership, not role). Closing that hole is more
  //      important than the brief loading flash.
  const myPerms = useMemo(() => {
    if (!session) return null;           // null = DEMO / unauthenticated
    if (!currentMember) return new Set(); // empty = signed-in but member not yet loaded → deny
    return new Set(effectivePermissions(currentMember.role, currentMember.permissions));
  }, [session, currentMember]);
  const can = useCallback((perm) => {
    if (myPerms === null) return true;  // DEMO mode wildcard
    return myPerms.has(perm);
  }, [myPerms]);

  // Central activity-log shim. Every action that mutates property data
  // calls this so the Activity screen has a unified who-did-what feed.
  // No-ops cleanly in DEMO mode (no propertyId / no session) — the
  // audit_log RLS policy requires auth anyway.
  const logEvent = useCallback((action, targetType, targetId, meta) => {
    const uid = session && session.user && session.user.id;
    if (!propertyId || !uid) return;
    logActivity(propertyId, uid, action, targetType, targetId, meta);
  }, [propertyId, session]);

  useEffect(() => { saveLS(LS_KEYS.bookings, bookings); }, [bookings]);
  useEffect(() => { saveLS(LS_KEYS.customExtras, savedCustomExtras); }, [savedCustomExtras]);
  useEffect(() => { saveLS(LS_KEYS.overrides, rateOverrides); }, [rateOverrides]);
  useEffect(() => { saveLS(LS_KEYS.cashCloses, cashCloses); }, [cashCloses]);
  useEffect(() => { saveLS(LS_KEYS.expenses, expenses); }, [expenses]);
  useEffect(() => { saveLS(LS_KEYS.plan, plan); }, [plan]);
  useEffect(() => { saveLS(LS_KEYS.lang, lang); }, [lang]);
  useEffect(() => { saveLS(LS_KEYS.property, property); }, [property]);
  useEffect(() => { saveLS(LS_KEYS.onboarded, onboardingDismissed); }, [onboardingDismissed]);

  // Push the hotelier's chosen brand colour into CSS variables that all
  // T.primary references read from. Runs on mount and whenever the theme
  // changes — including a fresh DEFAULT_PROPERTY install on first boot.
  useEffect(() => {
    applyTheme(property?.theme);
  }, [property?.theme?.hue, property?.theme?.color]);

  // Desktop width toggle. The Diary + Rates calendar benefit from the
  // full laptop width (more day columns visible); every other screen
  // is phone-shaped and reads best in a narrow centered column. We
  // toggle a body class that index.html's @media (min-width:1024px)
  // rule keys off — no-op below 1024px where the app is already
  // narrow / phone-framed.
  useEffect(() => {
    const wide = route.name === 'diary' || route.name === 'rates';
    if (typeof document !== 'undefined') {
      document.body.classList.toggle('atithi-wide', wide);
    }
  }, [route.name]);

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
      // Full local-state reset on sign-out — otherwise the previous
      // user's bookings / property / expenses / etc linger in memory
      // (and in localStorage via the save-LS effects) and the next
      // user who signs in on the same browser sees that data flash
      // before their own cloud data loads. Worse: the diff-sync
      // effects could write the stale data into the new user's
      // cloud account before being overwritten.
      //
      // CRITICAL: only clear state when we had a session before AND
      // this is a transition. Without this guard, the effect also
      // fires on initial mount under DEMO mode (where session is
      // null by design) — and wipes out the just-loaded demo
      // bookings / property before they ever render.
      setPropertyId(null);
      setCloudReady(false);
      setCurrentMember(null);
      if (DEMO_MODE) return; // DEMO has no session by design — don't wipe demo data
      setBookings([]);
      setProperty(EMPTY_PROPERTY);
      setExpenses([]);
      setCashCloses({});
      setRateOverrides({});
      setSavedCustomExtras([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        // Accept any pending invites for this email FIRST. Each match
        // turns into a membership row, so the immediately-following
        // loadCurrentProperty() call finds it. Silent-fail: invite
        // problems shouldn't block sign-in.
        try {
          await acceptPendingInvitesForUser(session.user);
        } catch (e) {
          // Surface to console but don't block — the existing
          // owner / bootstrap path still works.
          console.warn('[atithi] could not accept pending invites', e);
        }
        let result = await loadCurrentProperty(session.user.id);
        const isFirstTime = !result;
        if (isFirstTime) {
          // Brand-new cloud user — ALWAYS bootstrap with an empty
          // skeleton, regardless of what's in localStorage. The earlier
          // logic used localStorage `property` as the seed when the
          // onboarded flag was set, which leaked Yatra demo data into
          // every account that had touched the demo (the demo data is
          // baked into localStorage by default). Empty skeleton →
          // Onboarding wizard fires → hotelier sets up their own property.
          const seed = {
            profile: { name: '', phone: '', city: '', checkIn: '14:00', checkOut: '11:00' },
            categories: [],
            rules: [],
            amenityIds: [],
            customAmenities: [],
            accountant: { name: '', email: '', firm: '' },
            theme: { hue: 38 },
          };
          result = await bootstrapProperty(session.user, seed);
          // Reset the onboarding-dismissed flag so the wizard fires
          // for the freshly-bootstrapped property even if the user
          // had dismissed it during a previous DEMO session. State
          // update drives the useEffect that writes to localStorage,
          // so both representations stay in sync.
          setOnboardingDismissed(false);
        }
        if (cancelled || !result) return;

        // Load whatever's in the cloud. NO MORE SEEDING FROM
        // LOCALSTORAGE — the migration path from a pre-cloud era
        // is dead; every fresh install today has demo data in
        // localStorage, so seeding from it = polluting new accounts
        // with the Yatra demo. The bookingsSeeded / extrasSeeded /
        // expensesSeeded flags are kept around so we don't ever
        // re-seed an existing user even by mistake, but the seed
        // calls themselves are gone.
        const cloudBookings = await loadBookings(result.id);
        saveLS(LS_KEYS.bookingsSeeded, true);

        const [cloudExtras, cloudOverrides, cloudCloses] = await Promise.all([
          loadSavedExtras(result.id),
          loadRateOverrides(result.id),
          loadCashCloses(result.id),
        ]);
        saveLS(LS_KEYS.extrasSeeded, true);

        const cloudExpensesData = await loadExpenses(result.id);
        saveLS(LS_KEYS.expensesSeeded, true);

        if (cancelled) return;
        setPropertyId(result.id);
        setProperty(result.property);
        setBookings(cloudBookings);
        setSavedCustomExtras(cloudExtras);
        setRateOverrides(cloudOverrides);
        setCashCloses(cloudCloses);
        setExpenses(cloudExpensesData);
        setCurrentMember({ role: result.role, permissions: result.permissions || [] });
        // Snapshot the diff-sync refs to the just-loaded cloud values so the
        // first diff-sync effect after cloudReady=true sees cloud-vs-cloud
        // (no diff, no spurious writes) instead of stale-local-vs-cloud
        // (which would fire wrong deletes / wrong inserts at the cloud).
        savedExtrasRef.current = cloudExtras;
        rateOverridesRef.current = cloudOverrides;
        cashClosesRef.current = cloudCloses;
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
  // (Refs are declared above the cloud-load useEffect — see comment there.)
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
  //
  // Gated on cloudReadyRef.current AND a session — without that, on startup
  // the first tick would scan stale localStorage bookings (potentially from
  // a previous user's session if same browser) and fire cancellations + cloud
  // syncs against booking ids that don't belong to the current user's property.
  useEffect(() => {
    const tick = () => {
      // Don't touch tentative bookings until the cloud has caught up —
      // otherwise we'd cancel-and-sync stale local-only data the cloud
      // doesn't know about, against booking IDs that may not exist in
      // the current user's property at all.
      if (!cloudReadyRef.current || !sessionRef.current) return;
      const now = Date.now();
      const changed = [];
      setBookings(arr => {
        const next = arr.map(b => {
          if (b.status === 'tentative' && b.releaseTs && b.releaseTs <= now && (b.paid || 0) < (b.total || 0)) {
            // Snapshot the previous state so the hotelier can undo if
            // they catch the auto-release in time. We give it a longer
            // 30-second window than manual cancels because the user
            // may not have been on the screen when it fired.
            changed.push({
              id: b.id,
              guest: b.guest,
              previousStatus: b.status,
              previousReleaseTs: b.releaseTs,
              previousReleaseAt: b.releaseAt,
            });
            return { ...b, status: 'cancelled', autoReleased: true };
          }
          return b;
        });
        return changed.length ? next : arr;
      });
      if (cloudReadyRef.current && propertyIdRef.current && changed.length) {
        changed.forEach(c => {
          syncFire('Auto-release booking', updateBookingCloud(c.id, { status: 'cancelled', autoReleased: true }));
        });
      }
      // Surface an undo snackbar for the FIRST one (if multiple fired
      // in the same tick — rare). The hotelier seeing the snackbar
      // is the trigger to open the diary and review the rest.
      if (changed.length > 0) {
        const c = changed[0];
        setUndoState({
          kind: 'autoRelease',
          bookingId: c.id,
          guest: c.guest,
          previousStatus: c.previousStatus,
          previousReleaseTs: c.previousReleaseTs,
          previousReleaseAt: c.previousReleaseAt,
          previousAutoReleased: false,
          // 30s window — twice the manual cancel because the auto-
          // release surprised them.
          expiresAt: Date.now() + 30 * 1000,
          extraCount: changed.length - 1,
        });
      }
    };
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // Synthetic payment row for legacy bookings that have `paid > 0` but
    // no proper payments[] ledger. Used so the balance math stays
    // consistent when a new payment lands. The date used to be the
    // hardcoded literal '03 May · 18:25' — which then got written to
    // the cloud as part of payments[] and corrupted real ledgers
    // forever. Now we use empty (rendered as "—") so it's clearly a
    // pre-history marker, not a fabricated timestamp.
    const existing = booking.payments || (booking.paid > 0
      ? [{ id: 'p1', kind: 'payment', method: booking.channel === 'direct' ? 'upi' : 'card', amount: booking.paid, note: 'Pre-existing balance · date not recorded', date: '' }]
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
    logEvent(
      entry.kind === 'refund' ? 'payment.refund'
        : entry.kind === 'credit' || entry.kind === 'credit_note' ? 'payment.credit'
        : 'payment.add',
      'booking', bookingId,
      { guest: booking.guest, amount: entry.amount, method: entry.method, newPaid, newStatus }
    );
  };

  // Lightweight event-log helper. Each booking carries an optional
  // events[] (kind, text, time iso) that the BookingDetail activity feed
  // surfaces. Avoids the audit_log RPC for now — these read/write through
  // the same booking row so cloud sync rides along on the bookings.events
  // jsonb column added in migration 20260526.
  const pushBookingEvent = (bookingId, kind, text) => {
    const time = new Date().toISOString();
    const event = { kind, text, time };
    let nextEvents = null;
    setBookings(arr => arr.map(b => {
      if (b.id !== bookingId) return b;
      nextEvents = [...(Array.isArray(b.events) ? b.events : []), event];
      return { ...b, events: nextEvents };
    }));
    if (cloudReady && propertyId && nextEvents) {
      syncFire('Append booking event', updateBookingCloud(bookingId, { events: nextEvents }));
    }
  };

  const setStatus = (bookingId, status) => {
    const clearRelease = status === 'confirmed' || status === 'cancelled' || status === 'checkedin';
    let nextEvents = null;
    // Snapshot what we're overwriting — used by the undo snackbar so
    // the hotelier has 10 seconds to reverse a cancellation (or any
    // status change) without losing the previous release timer.
    const existing = bookings.find(b => b.id === bookingId);
    setBookings(arr => arr.map(b => {
      if (b.id !== bookingId) return b;
      const next = { ...b, status };
      if (clearRelease) {
        delete next.releaseTs; delete next.releaseAt;
      }
      const eventText = status === 'confirmed' ? 'Booking confirmed'
        : status === 'checkedin' ? 'Checked in'
        : status === 'checkout' ? 'Checked out'
        : status === 'cancelled' ? 'Booking cancelled'
        : status === 'tentative' ? 'Reverted to tentative hold'
        : `Status set to ${status}`;
      const evt = { kind: 'status', text: eventText, time: new Date().toISOString() };
      nextEvents = [...(Array.isArray(b.events) ? b.events : []), evt];
      next.events = nextEvents;
      return next;
    }));

    if (cloudReady && propertyId) {
      const patch = { status };
      if (clearRelease) {
        patch.releaseTs = null;
        patch.releaseAt = null;
      }
      if (nextEvents) patch.events = nextEvents;
      syncFire('Update booking status', updateBookingCloud(bookingId, patch));
    }
    logEvent(
      status === 'cancelled' ? 'booking.cancel' : 'booking.status',
      'booking', bookingId,
      { guest: existing?.guest, fromStatus: existing?.status, toStatus: status }
    );

    // Surface a snackbar with Undo when we're cancelling. Other
    // status changes don't need undo (check-in / check-out / hold-
    // reverts are non-destructive and easily redone by tapping the
    // status pill again).
    if (status === 'cancelled' && existing && existing.status !== 'cancelled') {
      setUndoState({
        kind: 'cancel',
        bookingId,
        guest: existing.guest,
        previousStatus: existing.status,
        previousReleaseTs: existing.releaseTs,
        previousReleaseAt: existing.releaseAt,
        previousAutoReleased: existing.autoReleased || false,
        // 10s window — long enough for an "oh wait I clicked the wrong
        // button" recovery, short enough not to interrupt anything else.
        expiresAt: Date.now() + 10 * 1000,
      });
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

    let nextEvents = null;
    setBookings(arr => arr.map(b => {
      if (b.id !== bookingId || b.status !== 'tentative') return b;
      const evt = { kind: 'hold', text: `Hold extended by ${hours}h · new release ${releaseAt}`, time: new Date().toISOString() };
      nextEvents = [...(Array.isArray(b.events) ? b.events : []), evt];
      return { ...b, releaseTs, releaseAt, holdHours, autoReleased: false, events: nextEvents };
    }));

    if (cloudReady && propertyId) {
      const patch = { releaseTs, releaseAt, holdHours, autoReleased: false };
      if (nextEvents) patch.events = nextEvents;
      syncFire('Extend hold', updateBookingCloud(bookingId, patch));
    }
    logEvent('booking.hold_extended', 'booking', bookingId, { guest: booking.guest, hours, newReleaseAt: releaseAt });
  };

  const moveBooking = (bookingId, patch) => {
    let nextEvents = null;
    setBookings(arr => arr.map(b => {
      if (b.id !== bookingId) return b;
      const evt = { kind: 'move', text: 'Booking moved (date or room)', time: new Date().toISOString() };
      nextEvents = [...(Array.isArray(b.events) ? b.events : []), evt];
      return { ...b, ...patch, events: nextEvents };
    }));
    if (cloudReady && propertyId) {
      const cloudPatch = { ...patch };
      if (nextEvents) cloudPatch.events = nextEvents;
      syncFire('Move booking', updateBookingCloud(bookingId, cloudPatch));
    }
    const moved = bookings.find(b => b.id === bookingId);
    logEvent('booking.move', 'booking', bookingId, { guest: moved?.guest, patch });
  };

  const setBookingGst = (bookingId, value) => {
    let nextEvents = null;
    setBookings(arr => arr.map(b => {
      if (b.id !== bookingId) return b;
      const evt = { kind: 'edit', text: value ? 'GST flag: ON (include in invoice register)' : 'GST flag: OFF (skip invoice register)', time: new Date().toISOString() };
      nextEvents = [...(Array.isArray(b.events) ? b.events : []), evt];
      return { ...b, gstApplies: !!value, events: nextEvents };
    }));
    if (cloudReady && propertyId) {
      const patch = { gstApplies: !!value };
      if (nextEvents) patch.events = nextEvents;
      syncFire('Update invoice flag', updateBookingCloud(bookingId, patch));
    }
    logEvent('booking.gst_toggle', 'booking', bookingId, { gstApplies: !!value });
  };

  // Expense ledger actions. Each fires the local state update
  // optimistically + the cloud add/remove/update through syncCloud
  // so transient failures surface via the SyncOverlay toast.
  const addExpense = async (expense) => {
    // Local: prepend to the list (newest first). Cloud assigns the
    // canonical uuid; if cloud succeeds we swap the local id for the
    // cloud one. If cloud fails the local entry stays.
    setExpenses(arr => [expense, ...arr]);
    if (cloudReady && propertyId) {
      try {
        const created = await syncCloud('Add expense', addExpenseCloud(propertyId, session && session.user && session.user.id, expense));
        if (created && created.id !== expense.id) {
          setExpenses(arr => arr.map(e => e.id === expense.id ? created : e));
        }
      } catch {}
    }
    logEvent('expense.add', 'expense', expense.id, { amount: expense.amount, category: expense.category, paidVia: expense.paidVia, note: expense.note });
  };
  const removeExpense = (expenseId) => {
    const removed = expenses.find(e => e.id === expenseId);
    setExpenses(arr => arr.filter(e => e.id !== expenseId));
    if (cloudReady && propertyId) {
      syncFire('Remove expense', removeExpenseCloud(expenseId));
    }
    logEvent('expense.remove', 'expense', expenseId, removed ? { amount: removed.amount, category: removed.category } : {});
  };
  const updateExpense = (expenseId, patch) => {
    setExpenses(arr => arr.map(e => e.id === expenseId ? { ...e, ...patch } : e));
    if (cloudReady && propertyId) {
      syncFire('Update expense', updateExpenseCloud(expenseId, patch));
    }
    logEvent('expense.update', 'expense', expenseId, { patch });
  };

  // Append a voice note to a booking. The note is an object
  // { id, dataUrl, durationSec, createdAt } — recorded by the
  // VoiceRecorder component on BookingDetail. We cap at 3 notes per
  // booking (enforced in the UI too) so localStorage stays bounded.
  const addVoiceNote = (bookingId, note) => {
    let nextNotes = null;
    let nextEvents = null;
    setBookings(arr => arr.map(b => {
      if (b.id !== bookingId) return b;
      const existing = Array.isArray(b.voiceNotes) ? b.voiceNotes : [];
      if (existing.length >= 3) return b;
      nextNotes = [...existing, note];
      const evt = { kind: 'voice', text: `Voice note added (${Math.round(note.durationSec || 0)}s)`, time: new Date().toISOString() };
      nextEvents = [...(Array.isArray(b.events) ? b.events : []), evt];
      return { ...b, voiceNotes: nextNotes, events: nextEvents };
    }));
    if (cloudReady && propertyId && nextNotes) {
      syncFire('Add voice note', updateBookingCloud(bookingId, { voiceNotes: nextNotes, events: nextEvents }));
    }
    logEvent('booking.voice_note_add', 'booking', bookingId, { durationSec: note.durationSec });
  };
  const removeVoiceNote = (bookingId, noteId) => {
    let nextNotes = null;
    let nextEvents = null;
    setBookings(arr => arr.map(b => {
      if (b.id !== bookingId) return b;
      const existing = Array.isArray(b.voiceNotes) ? b.voiceNotes : [];
      nextNotes = existing.filter(n => n.id !== noteId);
      const evt = { kind: 'voice', text: 'Voice note deleted', time: new Date().toISOString() };
      nextEvents = [...(Array.isArray(b.events) ? b.events : []), evt];
      return { ...b, voiceNotes: nextNotes, events: nextEvents };
    }));
    if (cloudReady && propertyId && nextNotes) {
      syncFire('Remove voice note', updateBookingCloud(bookingId, { voiceNotes: nextNotes, events: nextEvents }));
    }
    logEvent('booking.voice_note_remove', 'booking', bookingId, { noteId });
  };

  // Mark / unmark a booking as VIP. Drives the ★ chip on BookingDetail
  // and Dashboard, the 'Whale' / 'Repeat VIP' derivations in Guests,
  // and the VIP filter. Manual flag — no auto-derivation here.
  const setBookingVip = (bookingId, value) => {
    let nextEvents = null;
    setBookings(arr => arr.map(b => {
      if (b.id !== bookingId) return b;
      const evt = { kind: 'vip', text: value ? 'Marked VIP ★' : 'VIP flag removed', time: new Date().toISOString() };
      nextEvents = [...(Array.isArray(b.events) ? b.events : []), evt];
      return { ...b, vip: !!value, events: nextEvents };
    }));
    if (cloudReady && propertyId) {
      const patch = { vip: !!value };
      if (nextEvents) patch.events = nextEvents;
      syncFire('Update VIP flag', updateBookingCloud(bookingId, patch));
    }
    logEvent('booking.vip_toggle', 'booking', bookingId, { vip: !!value });
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
        logEvent('invoice.issue', 'invoice', inv.number, { bookingId, guest: booking.guest, amount: inv.amount, recipient: inv.recipient?.name });
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
    const booking = bookings.find(b => b.id === bookingId);
    const inv = booking?.invoices?.find(i => i.id === invoiceId);
    setBookings(arr => arr.map(b => b.id === bookingId
      ? { ...b, invoices: (b.invoices || []).map(inv => inv.id === invoiceId ? { ...inv, voided: true } : inv) }
      : b));
    if (cloudReady && propertyId) {
      syncFire('Void invoice', voidInvoiceCloud(invoiceId));
    }
    logEvent('invoice.void', 'invoice', inv?.number || invoiceId, { bookingId, guest: booking?.guest, amount: inv?.amount });
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
      // Build a brief diff summary for the activity feed — only the
      // fields that actually changed. Keeps the changelog auditable
      // without pushing noise events for re-saves with no changes.
      const diff = [];
      if (existing) {
        if (existing.guest !== (data.name || existing.guest)) diff.push(`guest: ${existing.guest} → ${data.name}`);
        if ((existing.nights || 0) !== (data.nights || 0)) diff.push(`nights: ${existing.nights} → ${data.nights}`);
        if ((existing.total || 0) !== total) diff.push(`total: ₹${(existing.total || 0).toLocaleString('en-IN')} → ₹${total.toLocaleString('en-IN')}`);
        if (existing.roomTypeId !== data.roomTypeId) diff.push(`room type: ${existing.roomTypeId} → ${data.roomTypeId}`);
        if ((existing.mealPlanId || 'ep') !== (data.mealPlanId || 'ep')) diff.push(`meal plan: ${existing.mealPlanId || 'ep'} → ${data.mealPlanId || 'ep'}`);
        if ((existing.ratePlanId || 'standard') !== (data.ratePlanId || 'standard')) diff.push(`rate plan: ${existing.ratePlanId || 'standard'} → ${data.ratePlanId || 'standard'}`);
        if ((existing.guests || '') !== guestsStr) diff.push(`guests: ${existing.guests || '—'} → ${guestsStr}`);
        if ((existing.email || '') !== (data.email || '')) diff.push('email updated');
        if ((existing.phone || '') !== phone) diff.push('phone updated');
        if ((existing.notes || '') !== (data.notes || '')) diff.push('note updated');
      }
      const patch = {
        roomTypeId: data.roomTypeId, nights: data.nights,
        guest: data.name || (existing && existing.guest) || '',
        total, paid, phone, email: data.email || '',
        notes: data.notes, extras: data.extras,
        roomItems: data.roomItems, customExtras: data.customExtras, extraPrices: data.extraPrices,
        country, formC, state: data.state || '',
        gstApplies: !!data.gstApplies,
        mealPlanId: data.mealPlanId || 'ep',
        ratePlanId: data.ratePlanId || 'standard',
        guests: guestsStr,
      };
      if (isHold) {
        patch.status = 'tentative';
        patch.releaseTs = releaseTs;
        patch.releaseAt = releaseAt;
      }
      // Append an edit event with the diff so the activity feed
      // shows what changed and when. Empty diff → no event (saving
      // without changes shouldn't pollute the log).
      let nextEvents = null;
      setBookings(arr => arr.map(b => {
        if (b.id !== editing) return b;
        const merged = { ...b, ...patch };
        if (diff.length > 0) {
          const evt = { kind: 'edit', text: 'Edited: ' + diff.join(' · '), time: new Date().toISOString() };
          nextEvents = [...(Array.isArray(b.events) ? b.events : []), evt];
          merged.events = nextEvents;
        }
        return merged;
      }));
      setEditing(null);
      setRoute({ name: 'booking', arg: editing });

      if (cloudReady && propertyId) {
        const cloudPatch = { ...patch };
        if (nextEvents) cloudPatch.events = nextEvents;
        syncFire('Update booking', updateBookingCloud(editing, cloudPatch));
      }
      logEvent('booking.edit', 'booking', editing, { guest: data.name, diff });
    } else {
      const startIdx = parseCheckInIdx(data.checkIn);
      let unitIdx = findFirstFreeUnit(bookings, data.roomTypeId, startIdx, data.nights, effectiveRoomTypes(property));
      if (unitIdx === null) {
        // Every unit of this room type is booked for the requested dates.
        // We confirm with the hotelier rather than silently dropping the
        // booking on unit 0 (which stacked two pills in the Diary with no
        // warning). They can still proceed (overbookings happen with OTA
        // bookings) — but they go in eyes-open.
        const roomType = effectiveRoomTypes(property).find(r => r.id === data.roomTypeId);
        const proceed = window.confirm(
          `All ${roomType?.units || ''} unit${(roomType?.units || 0) === 1 ? '' : 's'} of ${roomType?.name || 'this room type'} are already booked for these dates.\n\nDo you want to create this booking anyway? (It will appear stacked on unit 1 and you'll need to move it once a unit frees up.)`
        );
        if (!proceed) return;
        unitIdx = 0;
      }
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
        ratePlanId: data.ratePlanId || 'standard',
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
          logEvent('booking.create', 'booking', created.id, { guest: created.guest, total: created.total, nights: created.nights, channel: created.channel });
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
      logEvent('booking.create', 'booking', newBk.id, { guest: newBk.guest, total: newBk.total, nights: newBk.nights, channel: newBk.channel, offline: true });
      go('booking-confirmed', newBk.id);
    }
  };

  const showTabs = ['home', 'diary', 'guests', 'more'].includes(route.name);
  const editingBooking = editing ? bookings.find(b => b.id === editing) : null;

  let screen;
  switch (route.name) {
    case 'home':              screen = <Dashboard go={go} bookings={bookings} property={property} plan={plan} t={t} lang={lang} onAddPayment={addPayment} onExtendHold={extendHold} cashCloses={cashCloses} onSetCashClose={setCashClose} can={can} />; break;
    case 'diary':             screen = <Diary go={go} bookings={bookings} setBookings={setBookings} moveBooking={moveBooking} t={t} lang={lang} property={property} can={can} />; break;
    case 'new': {
      // route.arg is either a booking id string (edit path) or an object
      // { prefill: { date, roomTypeId } } from a Diary cell quick-create.
      const argIsPrefill = route.arg && typeof route.arg === 'object';
      const prefill = argIsPrefill ? (route.arg.prefill || route.arg) : null;
      // Permission gate at the route level — guards against deep links
      // (URL hack, prefill object) bypassing the UI buttons we hide.
      // Edit path needs edit_bookings; create path needs create_bookings.
      const isEditPath = !!editingBooking;
      const allowed = isEditPath ? can('edit_bookings') : can('create_bookings');
      if (!allowed) {
        screen = <PermissionDenied go={go} t={t} action={isEditPath ? 'edit bookings' : 'create new bookings'} />;
      } else {
        screen = <NewBooking go={go} onCreate={onCreate} plan={plan} t={t} editing={editingBooking} prefill={prefill} savedCustomExtras={savedCustomExtras} onRemoveSavedExtra={removeSavedCustomExtra} rateOverrides={rateOverrides} property={property} bookings={bookings} />;
      }
      break;
    }
    case 'booking':           screen = <BookingDetail go={go} bookingId={route.arg} bookings={bookings} plan={plan} t={t} lang={lang} property={property} onChangeProperty={setProperty} onEdit={startEdit} onPayment={addPayment} onSetStatus={setStatus} onExtendHold={extendHold} onSetGst={setBookingGst} onSetVip={setBookingVip} onAddVoiceNote={addVoiceNote} onRemoveVoiceNote={removeVoiceNote} onIssueInvoice={issueInvoice} onVoidInvoice={voidInvoice} can={can} />; break;
    case 'booking-confirmed': screen = <BookingConfirmed go={go} t={t} bookingId={route.arg} bookings={bookings} property={property} lang={lang} />; break;
    case 'rates':             screen = can('manage_rates')    ? <Rates go={go} t={t} lang={lang} overrides={rateOverrides} setOverrides={setRateOverrides} property={property} plan={plan} bookings={bookings} /> : <PermissionDenied go={go} t={t} action="edit the rate calendar" />; break;
    case 'guests':            screen = <Guests go={go} bookings={bookings} t={t} can={can} />; break;
    case 'channels':          screen = <Channels go={go} t={t} />; break;
    case 'reports':           screen = can('view_reports')    ? <Reports go={go} t={t} bookings={bookings} plan={plan} property={property} expenses={expenses} session={session} propertyId={propertyId} /> : <PermissionDenied go={go} t={t} action="see reports" />; break;
    case 'settings':          screen = <Settings go={go} plan={plan} onChangePlan={setPlan} lang={lang} onChangeLang={setLang} property={property} onChangeProperty={setProperty} savedExtras={savedCustomExtras} onChangeSavedExtras={setSavedCustomExtras} t={t} session={session} propertyId={propertyId} onSignOut={supaSignOut} can={can} />; break;
    case 'expenses':          screen = can('manage_expenses') ? <Expenses go={go} t={t} expenses={expenses} onAdd={addExpense} onRemove={removeExpense} onUpdate={updateExpense} property={property} onChangeProperty={setProperty} /> : <PermissionDenied go={go} t={t} action="log expenses" />; break;
    case 'activity':          screen = can('view_reports') ? <Activity go={go} propertyId={propertyId} session={session} /> : <PermissionDenied go={go} t={t} action="see the activity log" />; break;
    case 'more':              screen = <MoreMenu go={go} t={t} can={can} />; break;
    default:                  screen = <Dashboard go={go} bookings={bookings} property={property} plan={plan} t={t} lang={lang} onAddPayment={addPayment} onExtendHold={extendHold} cashCloses={cashCloses} onSetCashClose={setCashClose} can={can} />;
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

  // Public booking widget — customer-facing UI. URL has ?book=1 or /book.
  // Doesn't render the hotelier dashboard at all. Submit creates a booking
  // in the same property's diary with channel='website' + status='tentative'
  // so the hotelier can review before confirming.
  if (IS_PUBLIC_WIDGET) {
    return <PublicWidgetEntry slug={WIDGET_SLUG} fallbackProperty={property} fallbackBookings={bookings} fallbackOverrides={rateOverrides} fallbackExtras={savedCustomExtras} lang={lang} />;
  }

  // Session-demo banner — visible only when the visitor opted into demo
  // via the "Try the demo" SignIn button or the `?demo=1` URL. Hidden when
  // demo is active because of the hardcoded constant (current dev state)
  // since everyone would be in demo, banner noise. Tapping Exit demo
  // clears the flag and reloads.
  const sessionDemoActive = !HARDCODED_DEMO_MODE && isSessionDemo();
  const exitDemo = () => {
    try { window.localStorage.removeItem('atithi.demo.v1'); } catch {}
    window.location.reload();
  };

  return (
    <div className={'atithi' + (lang === 'hi' ? ' hi-mode' : '')} style={{ height: '100%', position: 'relative', background: 'transparent', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, paddingBottom: showTabs ? 78 : 0, paddingTop: sessionDemoActive ? 26 : 0, display: 'flex', flexDirection: 'column' }}>
        {screen}
      </div>
      {sessionDemoActive && (
        <div
          style={{
            position: 'absolute', top: 0, left: 0, right: 0, zIndex: 35,
            height: 26, background: T.ink, color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
            fontSize: 10.5, fontWeight: 800, letterSpacing: 0.6,
          }}
        >
          <Icon name="eye" size={11} color="#fff" stroke={2.4} />
          {lang === 'hi' ? 'डेमो मोड · कोई बदलाव नहीं सहेजा जाएगा' : 'DEMO MODE · NOTHING SAVES TO YOUR ACCOUNT'}
          <button
            onClick={exitDemo}
            style={{
              background: 'rgba(255,255,255,0.18)', color: '#fff',
              border: 'none', borderRadius: 5, padding: '2px 10px',
              fontSize: 10, fontWeight: 800, cursor: 'pointer', letterSpacing: 0.4,
            }}
          >{lang === 'hi' ? 'बाहर निकलें' : 'EXIT'}</button>
        </div>
      )}
      {needsOnboarding && (
        <Onboarding
          property={property}
          isHi={lang === 'hi'}
          onApply={(patch) => setProperty(prev => ({
            ...prev,
            profile: { ...(prev.profile || {}), ...(patch.profile || {}) },
            categories: patch.categories || prev.categories,
          }))}
          onDismiss={() => setOnboardingDismissed(true)}
        />
      )}
      {showTabs && (
        <TabBar active={route.name} onChange={(id) => {
          if (id === 'new') go('new');
          else go(id);
        }} t={t} can={can} />
      )}
      {/* Floating header actions (bell + search) — visible on the four
          tab-bar screens. The bell jumps the dashboard scroll to the
          "Today's nudges" card; the search opens the global overlay. */}
      {showTabs && (
        <div style={{
          position: 'absolute', top: 14, right: 14, zIndex: 30,
          display: 'inline-flex', gap: 6,
        }}>
          <button
            onClick={() => {
              if (route.name !== 'home') { go('home'); return; }
              // Best-effort scroll — find the Today's nudges card by heading.
              const headings = [...document.querySelectorAll('div')];
              const target = headings.find(d => {
                const t = (d.textContent || '').trim();
                return t === "TODAY'S NUDGES" || t === 'आज की सूचनाएँ';
              });
              if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
              } else {
                // No nudges card today (calm dashboard). Scroll to top
                // so the tap still does something useful instead of
                // looking broken.
                const scroll = document.querySelector('[data-dashboard-scroll]')
                  || (document.scrollingElement || document.documentElement);
                if (scroll && scroll.scrollTo) scroll.scrollTo({ top: 0, behavior: 'smooth' });
              }
            }}
            aria-label="Today's nudges"
            style={{
              width: 36, height: 36, borderRadius: 10,
              border: `1px solid ${T.border}`, background: T.card, color: T.ink2,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
            }}
          >
            <Icon name="bell" size={15} stroke={2.2} />
          </button>
          <button
            onClick={() => setSearchOpen(true)}
            aria-label="Search bookings"
            style={{
              width: 36, height: 36, borderRadius: 10,
              border: `1px solid ${T.border}`, background: T.card, color: T.ink2,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
            }}
          >
            <Icon name="search" size={15} stroke={2.2} />
          </button>
        </div>
      )}
      <SearchOverlay
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        bookings={bookings}
        property={property}
        go={go}
      />
      {/* Undo snackbar — surfaces after a cancellation / auto-release.
          Floats above the tab bar (which is 78px tall). Tapping Undo
          reverts the change; otherwise it auto-dismisses at the
          expiresAt deadline. */}
      {undoState && (() => {
        const isAuto = undoState.kind === 'autoRelease';
        const guestLabel = undoState.guest || 'Booking';
        const extra = undoState.extraCount ? ` (+${undoState.extraCount} more)` : '';
        return (
          <div
            style={{
              position: 'absolute', left: 12, right: 12,
              bottom: (route.name === 'booking' || route.name === 'new' || route.name === 'booking-confirmed') ? 12 : 90,
              zIndex: 60,
              background: T.ink, color: '#fff',
              borderRadius: 10, padding: '10px 12px',
              boxShadow: '0 6px 24px rgba(0,0,0,0.28)',
              display: 'flex', alignItems: 'center', gap: 10,
            }}
          >
            <Icon name={isAuto ? 'clock' : 'x'} size={15} color="#fff" stroke={2.2} />
            <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600 }}>
              {isAuto ? `Auto-released · ${guestLabel}${extra}` : `Cancelled · ${guestLabel}`}
            </div>
            <button
              onClick={undoLast}
              style={{
                padding: '6px 14px', borderRadius: 7,
                border: 'none', background: T.primary, color: '#fff',
                fontSize: 12, fontWeight: 800, cursor: 'pointer', letterSpacing: 0.3,
              }}
            >Undo</button>
            <button
              onClick={() => setUndoState(null)}
              title="Dismiss"
              style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', padding: 4 }}
            ><Icon name="x" size={13} color="rgba(255,255,255,0.6)" /></button>
          </div>
        );
      })()}
      <SyncOverlay t={t} />
      <InstallPrompt />
    </div>
  );
}

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useT } from './i18n.js';
import { T, applyTheme } from './tokens.js';
import { BOOKINGS_SEED, COUNTRIES, ROOM_TYPES, DAYS, ANCHOR, ymd, currentFinancialYear, formatInvoiceNumber, invoicePrefixOf, effectiveRoomTypes, dateToIdx, idxToDate, firstFreeUnit, isUnitFree } from './data.js';
import { supabase, signOut as supaSignOut } from './supabase.js';
import { loadCurrentProperty, bootstrapProperty, saveCloudProperty } from './cloud/property.js';
import { migratePropertyImages } from './cloud/storage.js';
import {
  loadBookings,
  createBookingCloud, updateBookingCloud, clearHoldReminderFlag, releaseHoldCloud,
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
import { acceptPendingInvitesForUser, loadMyMembership } from './cloud/team.js';
import { logActivity } from './cloud/activity.js';
import { effectivePermissions } from './components/TeamSection.jsx';
import { syncCloud, syncFire, notifySyncFailure } from './cloud/sync.js';
import { syncPropertyToAiosell } from './cloud/aiosellSync.js';
import SyncOverlay from './components/SyncOverlay.jsx';
import SearchOverlay from './components/SearchOverlay.jsx';
import InstallPrompt from './components/InstallPrompt.jsx';
import VoiceBookingSheet from './components/VoiceBookingSheet.jsx';
import Icon from './components/Icon.jsx';
import PublicBookingWidget from './screens/PublicBookingWidget.jsx';
import { loadPropertyBySlug, loadWidgetInventory, insertWidgetBooking, validateCouponCloud } from './cloud/widget.js';
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
import AdvancedSettings from './screens/AdvancedSettings.jsx';
import MoreMenu from './screens/MoreMenu.jsx';
import OperatorConsole from './screens/OperatorConsole.jsx';
import { isOperator } from './operator.js';
import SignIn from './screens/SignIn.jsx';
import Landing from './screens/Landing.jsx';
import Legal from './screens/Legal.jsx';
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
  // Default meal plan must point at an ENABLED plan; if it dangles (e.g. the
  // referenced plan was later disabled in Settings), reset it so the picker and
  // the meal-cost baseline stay valid.
  {
    const enabledMealIds = (out.mealPlans || []).filter(p => p && p.enabled).map(p => p.id);
    if (!out.defaultMealPlanId || !enabledMealIds.includes(out.defaultMealPlanId)) {
      out.defaultMealPlanId = enabledMealIds.includes('ep') ? 'ep' : (enabledMealIds[0] || 'ep');
    }
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
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch (e) {
    // R9-9: don't swallow this completely. A QuotaExceededError means the
    // offline mirror for this key is now STALE — the large base64 logo /
    // payment-QR / room-photo / voice-note blobs can blow the ~5MB origin
    // quota. When signed in the cloud copy is unaffected (it's the source of
    // truth), so we don't block the action; but we log it loudly and dispatch
    // an event so it's diagnosable / a listener can warn the hotelier instead
    // of the offline copy silently drifting out of date.
    const quota = e && (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014 || e.name === 'NS_ERROR_DOM_QUOTA_REACHED');
    console.warn('[atithi] localStorage save failed' + (quota ? ` (quota exceeded — offline copy of "${key}" is stale)` : '') + ':', e && e.message);
    if (quota && typeof window !== 'undefined' && window.dispatchEvent) {
      try { window.dispatchEvent(new CustomEvent('atithi:storage-full', { detail: { key } })); } catch {}
    }
  }
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
// R8-1: delegate to the shared occupancy-aware helper in data.js. The old
// implementation here only checked each booking's top-level unitIdx, so it was
// blind to the extra rooms of multi-room bookings (stored in roomItems[] with
// no unitIdx) and would hand out a unit that was already occupied → silent
// double-booking. firstFreeUnit() uses computeUnitUsage(), the same greedy
// allocation the Diary renders with.
function findFirstFreeUnit(bookings, roomTypeId, startIdx, nights, roomTypes) {
  return firstFreeUnit(bookings, roomTypeId, startIdx, nights, roomTypes);
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
  const [cloudOverrides, setCloudOverrides] = useState(null);
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
        setCloudOverrides(inv.overrides || {});
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
  // Rate overrides + close-outs from the Rates calendar. Cloud path uses
  // the anon rate_overrides_by_property RPC (migration 20260615); if that
  // RPC isn't pasted yet, inv.overrides is {} and the widget quotes base
  // + weekend/season rates (its prior behaviour). Local/preview path uses
  // the hotelier's in-memory overrides directly.
  const widgetOverrides = cloudCategories ? (cloudOverrides || {}) : fallbackOverrides;

  // Async so the widget can gate its "Booking confirmed" screen on the
  // ACTUAL insert result instead of optimistically showing success. Returns
  // { ok:true, ref } on success or { ok:false, reason } so the guest sees a
  // real error (and can retry) when the hold wasn't created.
  const handleSubmit = async (newBk) => {
    if (cloudProperty && cloudProperty.id) {
      try {
        // Anonymous insert. The cloud-side trigger assigns the real BK-XXXX,
        // but anon has no SELECT (RLS) to read it back, so we return a
        // friendly WEB-XXXX reference for the guest; the hotelier sees the
        // real BK-#### when it lands in their diary.
        await insertWidgetBooking(cloudProperty.id, newBk);
      } catch (err) {
        const msg = (err && err.message) || '';
        if (/no_capacity/i.test(msg)) {
          // Room type filled up between opening the widget and Confirm (or two
          // guests raced for the last unit). The atomic book_widget_slot guard
          // rejected this insert — working as intended; no booking created.
          console.warn('[atithi widget] not created — room type just sold out (capacity guard).', err);
          return { ok: false, reason: 'no_capacity' };
        }
        if (/rate_limited/i.test(msg)) {
          console.warn('[atithi widget] not created — property hit the hourly website-booking cap.', err);
          return { ok: false, reason: 'rate_limited' };
        }
        // Most likely the anon RLS SQL isn't pasted yet. Log loudly + tell the
        // guest it didn't go through (instead of a false confirmation).
        console.error('[atithi widget] insert failed — anon RLS may not be set up. Run supabase/migrations/20260605_widget_anon_access.sql.', err);
        return { ok: false, reason: 'error' };
      }
      const ref = 'WEB-' + Date.now().toString(36).slice(-4).toUpperCase();
      return { ok: true, ref };
    }
    // Fallback for demo / preview — local state only, always succeeds.
    const id = 'BK-' + (2854 + (fallbackBookings || []).length);
    return { ok: true, ref: id };
  };

  return (
    <div className={'atithi' + (lang === 'hi' ? ' hi-mode' : '')} style={{ height: '100%', background: T.bg, overflow: 'hidden' }}>
      <PublicBookingWidget
        property={widgetProperty}
        bookings={widgetBookings || []}
        rateOverrides={widgetOverrides || {}}
        savedCustomExtras={fallbackExtras || []}
        onSubmit={handleSubmit}
        validateCoupon={cloudProperty ? (code, nights) => validateCouponCloud(cloudProperty.id, code, nights) : undefined}
      />
    </div>
  );
}

// Rendered in place of any screen the current user doesn't have permission
// to open. Reachable via deep-link / refresh / browser-back rather than a
// tap (we hide the entry-point buttons elsewhere), but the gate stays here
// in case the route was reached anyway.
function PermissionDenied({ go, t = (k) => k, action }) {
  return (
    <div style={{ height: '100%', background: T.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 }}>
      <div style={{ width: 56, height: 56, borderRadius: 14, background: T.bgSoft, color: T.ink3, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="lock" size={24} />
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, color: T.ink, textAlign: 'center' }}>
        {t('permTitle')}
      </div>
      <div style={{ fontSize: 12, color: T.ink3, fontWeight: 600, textAlign: 'center', lineHeight: 1.5, maxWidth: 280 }}>
        {t('permBody')}
      </div>
      <button
        onClick={() => go('home')}
        style={{ marginTop: 6, padding: '9px 18px', borderRadius: 8, border: 'none', background: T.primary, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
      >{t('permBack')}</button>
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
  // Seed the route from browser history if present. We mirror every route
  // into history.state (see the history-sync effects below), and the browser
  // preserves that state across a reload — so on refresh we land back where
  // the user was instead of bouncing to home.
  const [route, setRoute] = useState(() => {
    try {
      const r = (typeof window !== 'undefined' && window.history && window.history.state && window.history.state.atithiRoute) || null;
      if (r && r.name) return { name: r.name, arg: r.arg != null ? r.arg : null };
    } catch { /* fall through to home */ }
    return { name: 'home', arg: null };
  });
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
  // Restore edit-mode in step with a refresh-restored route (string arg on
  // the 'new' route = a booking id being edited).
  const [editing, setEditing] = useState(() => (route.name === 'new' && typeof route.arg === 'string') ? route.arg : null);

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
    // R10-D5: a batch auto-release carries items[]; a single cancel carries the
    // flat fields. Normalise to a list so Undo restores every affected booking.
    const list = Array.isArray(undoState.items) && undoState.items.length
      ? undoState.items
      : [{
          bookingId: undoState.bookingId,
          previousStatus: undoState.previousStatus,
          previousReleaseTs: undoState.previousReleaseTs,
          previousReleaseAt: undoState.previousReleaseAt,
          previousAutoReleased: undoState.previousAutoReleased,
        }];
    const byId = new Map(list.map(it => [it.bookingId, it]));
    // Restoring an AUTO-RELEASED hold restores its ORIGINAL releaseTs, which is
    // already in the past — so the 30s ticker would re-cancel it on the very next
    // tick (in the default auto mode), making Undo futile. Give any restored
    // expired hold a fresh window instead. Pre-compute from the live bookings ref
    // so the value is consistent in both the local update and the cloud patch.
    const now = Date.now();
    const live = bookingsRef.current || [];
    const releaseById = {};
    for (const it of list) {
      let releaseTs = it.previousReleaseTs;
      let releaseAt = it.previousReleaseAt;
      if (it.previousStatus === 'tentative' && releaseTs && releaseTs <= now) {
        const b = live.find(x => x.id === it.bookingId);
        const hrs = (b && b.holdHours) || 4;
        releaseTs = now + hrs * 3600 * 1000;
        const d = new Date(releaseTs);
        releaseAt = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
      }
      releaseById[it.bookingId] = { releaseTs, releaseAt };
    }
    const eventsById = {};
    setBookings(arr => arr.map(b => {
      const it = byId.get(b.id);
      if (!it) return b;
      const evt = { kind: 'status', text: `Restored from cancellation (was ${it.previousStatus})`, time: new Date().toISOString() };
      const events = [...(Array.isArray(b.events) ? b.events : []), evt];
      eventsById[b.id] = events;
      const r = releaseById[b.id] || { releaseTs: it.previousReleaseTs, releaseAt: it.previousReleaseAt };
      return {
        ...b,
        status: it.previousStatus,
        releaseTs: r.releaseTs,
        releaseAt: r.releaseAt,
        autoReleased: it.previousAutoReleased,
        events,
      };
    }));
    if (cloudReady && propertyId) {
      list.forEach(it => {
        const r = releaseById[it.bookingId] || { releaseTs: it.previousReleaseTs, releaseAt: it.previousReleaseAt };
        const patch = {
          status: it.previousStatus,
          releaseTs: r.releaseTs || null,
          releaseAt: r.releaseAt || null,
          autoReleased: it.previousAutoReleased,
        };
        if (eventsById[it.bookingId]) patch.events = eventsById[it.bookingId];
        syncFire('Undo cancellation', updateBookingCloud(it.bookingId, patch));
      });
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
  // R10-5 (F-6): the auto-release ticker cancels expired holds, which the new
  // DB policy (20260611) only allows for members with cancel_bookings. Mirror
  // that here so a reception device (no cancel) doesn't optimistically cancel
  // locally and then loop a 403 on every sync — a cancel-permitted device
  // (owner/manager) handles releases instead. Defaults true (DEMO / owner).
  const canCancelRef = useRef(true);
  useEffect(() => { propertyIdRef.current = propertyId; }, [propertyId]);
  useEffect(() => { cloudReadyRef.current = cloudReady; }, [cloudReady]);
  useEffect(() => { sessionRef.current = session; }, [session]);
  // Mirrors for the mount-once auto-release ticker (Q3 + audit #8): it must
  // read the LIVE property (for the hotelier's auto-release vs reminder choice)
  // and the LIVE bookings (so the released-set is computed from current state
  // BEFORE setBookings, not inside the updater — the old code populated an
  // outer array from within the setState callback, which is fragile under
  // double-invoked updaters).
  const propertyRef = useRef(property);
  const bookingsRef = useRef(bookings);
  useEffect(() => { propertyRef.current = property; }, [property]);
  useEffect(() => { bookingsRef.current = bookings; }, [bookings]);

  // One-time photo backfill: once signed in + loaded, move any leftover base64
  // images on the property to Supabase Storage (logo / payment QR / gallery /
  // room photos) and replace them with CDN URLs. Idempotent (no-ops once the
  // fields are URLs), race-free (the result is applied through the normal
  // debounced save), and lossless (a field is only replaced after its upload
  // succeeds). Runs at most once per session via the ref guard.
  const mediaBackfillRef = useRef(false);
  useEffect(() => {
    if (mediaBackfillRef.current) return;
    if (DEMO_MODE || !session || !cloudReady || !propertyId || !property) return;
    mediaBackfillRef.current = true;
    (async () => {
      try {
        const { property: migrated, migrated: n } = await migratePropertyImages(propertyId, property);
        if (n > 0) {
          // Merge ONLY the migrated image fields onto the LIVE property via the
          // functional setter — so any field the hotelier edited during the
          // multi-second upload window isn't clobbered by the pre-upload snapshot
          // (the overwrite would otherwise be persisted by the debounced save).
          setProperty(prev => ({
            ...prev,
            profile: {
              ...(prev.profile || {}),
              logoDataUrl: migrated.profile.logoDataUrl,
              paymentQrDataUrl: migrated.profile.paymentQrDataUrl,
              photoGallery: migrated.profile.photoGallery,
            },
            categories: (prev.categories || []).map(c => {
              const m = (migrated.categories || []).find(x => x.id === c.id);
              return m ? { ...c, photoDataUrl: m.photoDataUrl } : c;
            }),
          }));
        }
      } catch { /* leave base64 in place; retried next load */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, cloudReady, propertyId, property]);
  // Diff-sync refs hoisted above the cloud-load useEffect so the cloud
  // load can snapshot them with the freshly-loaded cloud values BEFORE
  // the diff-sync effects fire. Without that snapshot, the very first
  // diff would compare stale localStorage state to fresh cloud data
  // and produce spurious delete-this-from-cloud / write-stale-to-cloud
  // calls — silent data corruption on every sign-in.
  const savedExtrasRef = useRef(savedCustomExtras);
  const rateOverridesRef = useRef(rateOverrides);
  const cashClosesRef = useRef(cashCloses);
  // AIOSELL auto-sync: debounce timer + a signature of the last-synced state.
  const aioSyncTimer = useRef(null);
  const aioSyncSig = useRef(null);
  const aioInFlightRef = useRef(false);
  const aioHealthRef = useRef(null);
  const aioPendingRef = useRef(false);   // a change landed while a push was in flight
  const aioRestrRef = useRef(false);     // did the last sync push restrictions (for clear-on-remove)
  const [aioTick, setAioTick] = useState(0); // bump to re-arm the sync after an in-flight push
  const t = useT(lang);

  // Automatic channel-manager sync. AtithiBook is the service provider: once WE
  // have set up a hotel's AIOSELL mapping (accountant.aiosell) and they're on a
  // channels plan, their rates + availability push to the OTAs on their own a few
  // seconds after any change — so "Sync now" on the Channels screen is just a
  // manual backup. Guards keep it dormant otherwise (demo, signed-out, no cloud,
  // not on plan, not mapped), and the push itself 503s harmlessly until the
  // AIOSELL login is set, so this is safe to ship before go-live. We only fire
  // when the sync-relevant slice of state actually changed, and debounce so a
  // burst of edits collapses into a single push.
  useEffect(() => {
    if (DEMO_MODE || !session || !propertyId || !cloudReady) return;
    // Entitlement is the operator-set mapping (server-enforced in
    // api/aiosell-push), NOT the client-side plan — a hotel we've set up syncs
    // regardless of what its local plan preference says.
    const aio = property && property.accountant && property.accountant.aiosell;
    const configured = !!(aio && aio.hotelCode && aio.rooms &&
      Object.keys(aio.rooms).some(k => aio.rooms[k] && aio.rooms[k].roomCode));
    if (!configured) return;

    const sig = JSON.stringify({
      bk: (bookings || []).map(b => [b.id, b.startIdx, b.nights, b.roomTypeId, b.status, b.unitIdx, b.roomItems]),
      ov: rateOverrides,
      cat: (property.categories || []).map(c => [c.id, c.base, c.units]),
      wk: property.weekendRules, se: property.seasons,
      ml: property.accountant && property.accountant.minNights,
      cr: property.accountant && property.accountant.channelRules,   // per-OTA pause / min-stay must wake the sync
      // Meal-plan prices, the default plan, base capacity, and single-occupancy
      // all feed the pushed OTA rate (ratePlanRateForDay) — editing any of them
      // must wake the auto-sync so OTAs don't keep a stale rate.
      mp: property.mealPlans, dmp: property.defaultMealPlanId, bca: property.baseCapacityAdults,
      so: property.accountant && property.accountant.singleOccEnabled,
      sr: property.accountant && property.accountant.singleRates,
      aio,
    });
    if (aioSyncSig.current === sig) return;   // already synced / syncing this state

    if (aioSyncTimer.current) clearTimeout(aioSyncTimer.current);
    const snap = { property, bookings, overrides: rateOverrides, session, propertyId };
    aioSyncTimer.current = setTimeout(async () => {
      aioSyncTimer.current = null;
      // If a push is already running, remember to re-run with the latest state
      // once it finishes (instead of silently dropping this edit).
      if (aioInFlightRef.current) { aioPendingRef.current = true; return; }
      aioInFlightRef.current = true;
      // Persist sync health only on a status transition (ok<->fail), so the
      // Operator Console can show it without churning the property row.
      const persistHealth = (okVal) => {
        if (aioHealthRef.current === okVal) return;
        aioHealthRef.current = okVal;
        setProperty(prev => ({ ...prev, accountant: { ...(prev.accountant || {}), aiosellSync: { at: new Date().toISOString(), ok: okVal } } }));
      };
      try {
        // clearRestrictions: if the last sync pushed restrictions, ask this one to
        // push the (possibly all-clear) restriction range too, so removing the
        // last restriction un-does the stale stop-sell/min-stay on AIOSELL.
        const r = await syncPropertyToAiosell({ ...snap, roomTypes: effectiveRoomTypes(snap.property), clearRestrictions: aioRestrRef.current });
        const parts = [r.inventory, r.rates, r.restrictions].filter(Boolean);
        const dormant = parts.some(p => p && p.status === 503);
        const ok = !!r.skipped || dormant || (parts.length > 0 && parts.every(p => p && p.status === 200 && p.data && p.data.ok));
        // Commit the signature only on success/dormant — a real failure leaves it
        // uncommitted so the next change retries it.
        if (ok) aioSyncSig.current = sig;
        aioRestrRef.current = !!r.hadRestrictions;
        persistHealth(ok);
      } catch {
        persistHealth(false);
      } finally {
        aioInFlightRef.current = false;
        // Re-arm for any edit that arrived mid-flight (its sync was deferred).
        if (aioPendingRef.current) { aioPendingRef.current = false; setAioTick(x => x + 1); }
      }
    }, 4500);
    // No cleanup-clear on purpose: this is the root App component (never unmounts
    // in practice), and clearing on every unrelated re-render would cancel a
    // legitimately-scheduled push. The timer is reset above only when a genuinely
    // new change arrives — the correct debounce.
  }, [bookings, rateOverrides, property, plan, session, propertyId, cloudReady, aioTick]);

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
  // Keep the mount-once auto-release ticker's permission view current.
  useEffect(() => { canCancelRef.current = can('cancel_bookings'); }, [can]);

  // Central activity-log shim. Every action that mutates property data
  // calls this so the Activity screen has a unified who-did-what feed.
  // No-ops cleanly in DEMO mode (no propertyId / no session) — the
  // audit_log RLS policy requires auth anyway.
  const logEvent = useCallback((action, targetType, targetId, meta) => {
    const uid = session && session.user && session.user.id;
    if (!propertyId || !uid) return;
    logActivity(propertyId, uid, action, targetType, targetId, meta);
  }, [propertyId, session]);

  // P3 (perf): the bookings array is the heaviest localStorage payload, and the
  // old immediate write re-serialised the WHOLE array on every mutation (each
  // payment, 30s ticker tick, edit) — a visible main-thread jank on a mid-range
  // phone. Debounce it (700 ms) so a burst of mutations serialises once.
  // NOTE: we deliberately do NOT strip voice-note blobs from the mirror. An
  // earlier version stripped them when signed in (cloud being the source of
  // truth), but that removed the ONLY offline copy of an un-recreatable
  // recording — if its cloud write failed, the note was lost. Voice notes are
  // rare (most bookings have none), capped (3×60s ≈ 450 KB), and the
  // QuotaExceeded path (R9-9) handles the worst case gracefully, so keeping
  // them in the mirror is the safer trade-off. (Phase 4 moves audio to
  // Supabase Storage and removes it from the row entirely.)
  useEffect(() => {
    const id = setTimeout(() => saveLS(LS_KEYS.bookings, bookings), 700);
    return () => clearTimeout(id);
  }, [bookings]);
  useEffect(() => { saveLS(LS_KEYS.customExtras, savedCustomExtras); }, [savedCustomExtras]);
  useEffect(() => { saveLS(LS_KEYS.overrides, rateOverrides); }, [rateOverrides]);
  useEffect(() => { saveLS(LS_KEYS.cashCloses, cashCloses); }, [cashCloses]);
  useEffect(() => { saveLS(LS_KEYS.expenses, expenses); }, [expenses]);
  useEffect(() => { saveLS(LS_KEYS.plan, plan); }, [plan]);
  useEffect(() => { saveLS(LS_KEYS.lang, lang); }, [lang]);
  // P3 (perf): property carries base64 logo / payment-QR / room photos; the
  // immediate write re-serialised all of it on every keystroke while editing
  // Settings. Debounce it (cloud save is already debounced separately).
  useEffect(() => {
    const id = setTimeout(() => saveLS(LS_KEYS.property, property), 700);
    return () => clearTimeout(id);
  }, [property]);
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
    // Only widen for the actual in-app Diary / Rates screens. Gate on
    // an effective session (DEMO counts) so the class doesn't linger
    // on the SignIn / loading splash after sign-out — without the
    // session check, signing out while on the Diary left <body> wide
    // and rendered SignIn at 1100px+ on a laptop.
    const inApp = DEMO_MODE || !!session;
    const wide = inApp && (route.name === 'diary' || route.name === 'rates');
    if (typeof document !== 'undefined') {
      document.body.classList.toggle('atithi-wide', wide);
    }
  }, [route.name, session]);

  // Load Supabase session on mount + subscribe to auth state changes (sign-in,
  // sign-out, token refresh). detectSessionInUrl picks up the magic-link
  // token from the URL hash automatically when the user lands back.
  useEffect(() => {
    let mounted = true;
    // R10-8: once Supabase has consumed the magic-link / OAuth token from the
    // URL, strip it so the access/refresh token (or PKCE ?code) doesn't sit in
    // the address bar / browser history / a bookmarked-or-shared link. App
    // params (?book=1, ?demo=1) and the path (/book/<slug>) are preserved.
    const stripAuthFromUrl = () => {
      try {
        const hash = window.location.hash || '';
        const hasHashToken = /access_token=|refresh_token=|[#&](type|error)=/.test(hash);
        const params = new URLSearchParams(window.location.search);
        const hadAuthQuery = params.has('code') || params.has('error') || params.has('error_description');
        if (!hasHashToken && !hadAuthQuery) return;
        params.delete('code'); params.delete('error'); params.delete('error_description');
        const qs = params.toString();
        const newUrl = window.location.pathname + (qs ? '?' + qs : '') + (hasHashToken ? '' : hash);
        // Preserve the current history state (carries our route) — only the
        // URL is being cleaned, not the navigation entry.
        window.history.replaceState(window.history.state, document.title, newUrl);
      } catch { /* history API unavailable — leave URL as-is */ }
    };
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data?.session || null);
      setAuthReady(true);
      stripAuthFromUrl();
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      if (!mounted) return;
      setSession(sess);
      setAuthReady(true);
      stripAuthFromUrl();
    });
    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, []);

  // Operator entrance. AtithiBook is the service provider: operator/team tooling
  // lives OUTSIDE the hotelier app. The discreet "Operator" link on the landing
  // page sets a one-shot flag (atithi.ops.v1) then routes to sign-in; once the
  // user is authenticated we send them straight to the cross-hotel Operator
  // Console — but only if their account is on the operator list (server still
  // enforces). The flag is consumed once, so an ordinary later sign-in lands on
  // the hotelier home as usual, and a non-operator who set it is simply ignored.
  useEffect(() => {
    if (!session) return;
    let flagged = false;
    try {
      flagged = localStorage.getItem('atithi.ops.v1') === '1';
      if (flagged) localStorage.removeItem('atithi.ops.v1');
    } catch { /* localStorage unavailable */ }
    if (flagged && isOperator(session)) {
      setRoute({ name: 'ops', arg: null });
    }
  }, [session]);

  // R10-9: ANCHOR (today at midnight) is frozen at module load and drives every
  // day-index calc (Diary "today", Dashboard arrivals/in-house/departing, cash-
  // close date key, Reports). A PWA that hoteliers install and leave open for
  // days would, after midnight, silently show yesterday's "today". Detect a
  // day rollover when the user RETURNS to the tab (visibility/focus) and reload
  // so ANCHOR recomputes. Only fires on re-focus — never mid-interaction — and
  // everything is cloud-synced, so nothing is lost. No-loop: after reload the
  // module re-anchors to the new day, so the dates match again.
  useEffect(() => {
    const anchorDay = ymd(ANCHOR);
    const checkStale = () => {
      if (document.visibilityState !== 'visible') return;
      if (ymd(new Date()) !== anchorDay) window.location.reload();
    };
    document.addEventListener('visibilitychange', checkStale);
    window.addEventListener('focus', checkStale);
    return () => {
      document.removeEventListener('visibilitychange', checkStale);
      window.removeEventListener('focus', checkStale);
    };
  }, []);

  // R10-D1: refresh THIS user's role + permissions when they return to the tab.
  // currentMember otherwise only loads on user.id change, so an owner changing a
  // staffer's permissions wouldn't take effect on the staffer's open session
  // until they fully signed out. Re-fetching on focus closes that gap (and so
  // the UI gates match the DB rules promptly). No-op in DEMO (no session).
  useEffect(() => {
    const uid = session?.user?.id;
    if (!uid || !propertyId) return;
    let cancelled = false;
    let lastAt = 0;
    const refresh = async () => {
      if (document.visibilityState !== 'visible') return;
      // R11-3: throttle — focus/visibility fires rapidly (alt-tab, Android
      // keyboard show/hide); don't hit Supabase more than once per ~45s.
      const nowMs = Date.now();
      if (nowMs - lastAt < 45000) return;
      lastAt = nowMs;
      try {
        const m = await loadMyMembership(uid, propertyId);
        if (cancelled || !m) return;
        setCurrentMember(prev => {
          const same = prev && prev.role === m.role
            && JSON.stringify(prev.permissions || []) === JSON.stringify(Array.isArray(m.permissions) ? m.permissions : []);
          return same ? prev : { role: m.role, permissions: Array.isArray(m.permissions) ? m.permissions : [] };
        });
      } catch { /* keep current perms on a transient failure */ }
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [session?.user?.id, propertyId]);

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
      // Re-arm the one-time photo backfill so the NEXT user who signs in on this
      // same tab (no page reload between accounts) gets their own base64 images
      // migrated, instead of being short-circuited by the first user's run.
      mediaBackfillRef.current = false;
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
        // Run the cloud-loaded property through the same migrateProperty()
        // normalization the localStorage path gets, so a legacy / hand-edited
        // cloud row is self-healed too (ensures Standard rate plan present,
        // weekendRules sane, new fields defaulted). No-op on well-formed data.
        setProperty(migrateProperty(result.property));
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
        //
        // CRITICAL: also seed currentMember with a full-access owner
        // fallback. Without this, the cloud-load error path leaves
        // currentMember null while cloudReady flips true → myPerms
        // resolves to an empty Set → can() denies EVERY action and
        // the signed-in owner is locked out of new booking, payments,
        // rates, reports, diary drag, etc. A transient load blip must
        // degrade to full access, never to zero access.
        if (!cancelled) {
          setCurrentMember(prev => prev || { role: 'owner', permissions: [] });
          setCloudReady(true);
        }
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
      // M-9: also compare closedUnits (per-unit maintenance close-outs,
      // Rates F3). Without this, toggling a single unit closed/open without
      // touching the rate or the whole-type close flag left the predicate
      // unchanged, so the change never reached the cloud.
      const pvUnits = JSON.stringify((pv && pv.closedUnits) || []);
      const nvUnits = JSON.stringify((nv && nv.closedUnits) || []);
      // Per-date notes: a note-only change must also sync, else editing
      // just the note on a cell never reaches the cloud.
      const pvNote = (pv && pv.note) || '';
      const nvNote = (nv && nv.note) || '';
      if (!!pv === !!nv && pvRate === nvRate && pvClosed === nvClosed && pvUnits === nvUnits && pvNote === nvNote) continue;
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
      } else if (!pv || pv.cash !== nv.cash || pv.digital !== nv.digital || pv.note !== nv.note
        || JSON.stringify(pv.accounts || null) !== JSON.stringify(nv.accounts || null)) {
        // H-8: also compare the multi-account accounts[] jsonb. Moving money
        // between accounts (e.g. Owner UPI -> Manager UPI) can leave the
        // legacy cash + digital sums unchanged, so without this the
        // per-account breakdown never synced and went stale across devices.
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
      // Q3 — auto-release vs reminder. The hotelier chooses (Settings → Booking
      // link → Hold & auto-release) whether an expired unpaid hold is cancelled
      // automatically or kept until they decide. In REMINDER mode this ticker
      // does nothing destructive: the Dashboard surfaces an "expired hold" nudge
      // and the server cron (api/hold-watch) buzzes their phone — the hotelier
      // then extends or releases by hand. Auto mode is the default + the
      // historical behaviour.
      const prop = propertyRef.current;
      const holdMode = (prop && prop.accountant && prop.accountant.holdMode) || 'auto';
      if (holdMode === 'reminder') return;
      // Auto-release is a destructive action gated on cancel_bookings (the DB
      // policy 20260611 enforces it too) — a reception device without that
      // permission leaves releases to an owner/manager device.
      if (!canCancelRef.current) return;
      // #8: compute the released-set from the LIVE bookings ref BEFORE touching
      // state (the old code populated `changed` from inside the setBookings
      // updater, which double-invoked updaters would corrupt).
      const arr = bookingsRef.current || [];
      const changed = [];
      for (const b of arr) {
        // R8-9: also release a zero-total hold. The `paid < total` guard means
        // total=0 gives 0 < 0 = false, so a free/comp hold (or a widget booking
        // whose computed rate rounded to 0) would tie up a unit forever past its
        // releaseTs. A hold with nothing to pay should still expire on schedule.
        const notFullyPaid = (b.paid || 0) < (b.total || 0) || (b.total || 0) <= 0;
        if (b.status === 'tentative' && b.releaseTs && b.releaseTs <= now && notFullyPaid) {
          // M-11: log the auto-release as a status event so BookingDetail's
          // activity feed shows the cancellation with a timestamp.
          const evt = { kind: 'status', text: 'Auto-released — hold expired before payment', time: new Date(now).toISOString() };
          const events = [...(Array.isArray(b.events) ? b.events : []), evt];
          changed.push({
            id: b.id,
            guest: b.guest,
            previousStatus: b.status,
            previousReleaseTs: b.releaseTs,
            previousReleaseAt: b.releaseAt,
            events,
          });
        }
      }
      if (!changed.length) return;
      const eventsById = Object.fromEntries(changed.map(c => [c.id, c.events]));
      const changedIds = new Set(changed.map(c => c.id));
      // Apply locally, re-guarding status==='tentative' against the freshest state
      // so a hold paid-in-full in the bookingsRef-lag gap is left untouched. (Note:
      // do NOT read a value pushed from inside this updater on the next line — a
      // React functional updater is not guaranteed to run synchronously. `changed`
      // is computed from the live bookingsRef above, which is what we use below.)
      setBookings(a => a.map(b => (changedIds.has(b.id) && b.status === 'tentative')
        ? { ...b, status: 'cancelled', autoReleased: true, events: eventsById[b.id] }
        : b));
      if (cloudReadyRef.current && propertyIdRef.current) {
        const uid = sessionRef.current && sessionRef.current.user && sessionRef.current.user.id;
        changed.forEach(c => {
          // CONDITIONAL cloud cancel (releaseHoldCloud): only flips the row if it is
          // STILL a tentative hold past its release time in the CLOUD — so a payment
          // or hold-extension made on another device (status→confirmed, or release_ts
          // pushed out) is never clobbered into 'cancelled'. Mirrors hold-watch.js.
          syncFire('Auto-release booking', releaseHoldCloud(c.id, { status: 'cancelled', autoReleased: true, events: c.events }, now));
          // Record on the property-wide Activity log too. This mount-once ticker's
          // captured logEvent closes over the initial null session/propertyId, so
          // call logActivity directly via refs. Reuses the booking.cancel key.
          logActivity(propertyIdRef.current, uid, 'booking.cancel', 'booking', c.id, { guest: c.guest, fromStatus: c.previousStatus, toStatus: 'cancelled', autoReleased: true });
        });
      }
      // Surface an undo snackbar for the FIRST one (if multiple fired
      // in the same tick — rare). The hotelier seeing the snackbar
      // is the trigger to open the diary and review the rest.
      {
        const c = changed[0];
        setUndoState({
          kind: 'autoRelease',
          bookingId: c.id,
          guest: c.guest,
          previousStatus: c.previousStatus,
          previousReleaseTs: c.previousReleaseTs,
          previousReleaseAt: c.previousReleaseAt,
          previousAutoReleased: false,
          // R10-D5: carry EVERY hold released this tick so Undo restores all of
          // them, not just the first. A phone waking from sleep can expire
          // several holds at once; previously only changed[0] was recoverable.
          items: changed.map(x => ({
            bookingId: x.id,
            previousStatus: x.previousStatus,
            previousReleaseTs: x.previousReleaseTs,
            previousReleaseAt: x.previousReleaseAt,
            previousAutoReleased: false,
          })),
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

  // Voice-to-booking sheet open state. The sheet lives here (not in
  // Dashboard) so it has the session/property/go it needs to parse + route.
  const [voiceOpen, setVoiceOpen] = useState(false);

  // Bumped on every navigation. Used as a remount key on the New Booking
  // screen so a screen that re-targets its OWN route — e.g. the voice flow
  // firing go('new', { prefill }) while already on New Booking — still gets
  // a fresh form seeded from the new prefill (React won't remount on a
  // same-route navigation otherwise, so the prefill would be ignored).
  const navSeqRef = useRef(0);
  // How many in-app history entries we've pushed. goBack() only calls
  // window.history.back() when there's an in-app entry to return to;
  // otherwise it falls back to home (so we never reverse out of the app).
  const histDepthRef = useRef(0);
  const go = (name, arg = null) => {
    // Screens' back arrows call go('__back') so "back" returns to the actual
    // previous screen (via browser history) instead of a hardcoded home.
    if (name === '__back') { goBack(); return; }
    if (name !== 'new') setEditing(null);
    navSeqRef.current += 1;
    setRoute({ name, arg, seq: navSeqRef.current });
  };

  const goBack = () => {
    if (histDepthRef.current > 0 && typeof window !== 'undefined' && window.history) {
      window.history.back();
    } else {
      go('home');
    }
  };

  const startEdit = (bookingId) => {
    setEditing(bookingId);
    navSeqRef.current += 1;
    setRoute({ name: 'new', arg: bookingId, seq: navSeqRef.current });
  };

  // ─── Browser history ↔ route sync ─────────────────────────────────────────
  // Routing is plain `go()` state; on its own it never touched browser history,
  // so the browser Back/Forward buttons and a phone's back gesture did nothing —
  // a visitor who opened Sign in / Terms had no way back. We mirror every route
  // change into history: the first change replaces the initial entry, later ones
  // push a new entry, and Back/Forward (popstate) restores the route without
  // pushing again. The URL is left unchanged (no SPA-rewrite / base-path risk);
  // only history entries are added.
  const histPopRef = useRef(false);
  const histInitRef = useRef(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.history) return;
    if (histPopRef.current) { histPopRef.current = false; return; }
    const cur = window.history.state;
    const sameAsCurrent = cur && cur.atithiRoute
      && cur.atithiRoute.name === route.name && cur.atithiRoute.arg === route.arg;
    // Already the current entry (StrictMode re-run / just-popped / a route
    // restored from history on refresh). Mark initialised so the NEXT real
    // navigation pushes a back entry instead of replacing this one.
    if (sameAsCurrent) { histInitRef.current = true; return; }
    const st = { atithiRoute: { name: route.name, arg: route.arg } };
    if (!histInitRef.current) {
      histInitRef.current = true;
      window.history.replaceState(st, '');
    } else {
      window.history.pushState(st, '');
      histDepthRef.current += 1;
    }
  }, [route]);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.history) return;
    const onPop = (e) => {
      histPopRef.current = true;
      histDepthRef.current = Math.max(0, histDepthRef.current - 1);
      const r = (e.state && e.state.atithiRoute) ? e.state.atithiRoute : { name: 'home', arg: null };
      // Restore edit-mode flag in step with the route (string arg = booking id
      // to edit; object/null = create or a non-booking screen).
      setEditing(r.name === 'new' && typeof r.arg === 'string' ? r.arg : null);
      setRoute({ name: r.name, arg: r.arg });
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const addPayment = (bookingId, entry) => {
    const booking = bookings.find(b => b.id === bookingId);
    if (!booking) return;
    // Synthetic "pre-existing balance" row for a legacy booking that has
    // paid>0 but no payments ledger — undefined OR an empty [] (cloud-loaded
    // legacy rows come back as []). Without it the new payment would reset
    // paid to just its own amount (dropping the prior balance), AND the cloud
    // payments table wouldn't sum to bookings.paid — so the folio (which sums
    // payments[]) would disagree with the diary/dashboard balance after a
    // reload. seedRow is persisted to the cloud alongside the new entry so
    // the table reconciles. date '' renders as "—" (a pre-history marker,
    // never a fabricated timestamp).
    const hadLedger = Array.isArray(booking.payments) && booking.payments.length > 0;
    const seedRow = (!hadLedger && booking.paid > 0)
      ? { id: 'p1', kind: 'payment', method: booking.channel === 'direct' ? 'upi' : 'card', amount: booking.paid, note: 'Pre-existing balance · date not recorded', date: '', dateIso: booking.startIdx != null ? idxToDate(booking.startIdx) : undefined }
      : null;
    const existing = hadLedger ? booking.payments : (seedRow ? [seedRow] : []);
    const nextPayments = [...existing, entry];
    // Cash paid = payments − refunds. A credit note is NOT cash; it reduces
    // what the guest owes (the bill), handled via newTotal below.
    const newPaid = nextPayments.reduce((s, p) =>
      s + (p.kind === 'refund' ? -(p.amount || 0)
        : (p.kind === 'credit' || p.kind === 'credit_note') ? 0
        : (p.amount || 0)), 0);
    // A credit note lowers the bill. Reduce booking.total by this entry's
    // amount (the folio adds it back as a "Credit note" row so the breakdown
    // still reconciles). Payments / refunds leave the total unchanged.
    const isCreditEntry = entry.kind === 'credit' || entry.kind === 'credit_note';
    const newTotal = isCreditEntry ? Math.max(0, (booking.total || 0) - (entry.amount || 0)) : (booking.total || 0);
    // If a hold gets paid in full, auto-confirm — measured against the
    // (possibly reduced) bill.
    const newStatus = (booking.status === 'tentative' && newPaid >= newTotal) ? 'confirmed' : booking.status;
    const clearReleaseFields = newStatus === 'confirmed' && booking.status === 'tentative';

    setBookings(arr => arr.map(b => {
      if (b.id !== bookingId) return b;
      const update = { ...b, payments: nextPayments, paid: newPaid, total: newTotal, status: newStatus };
      if (clearReleaseFields) {
        delete update.releaseTs; delete update.releaseAt;
      }
      return update;
    }));

    if (cloudReady && propertyId) {
      syncFire('Save payment', addPaymentCloud({
        bookingId, propertyId,
        userId: session && session.user && session.user.id,
        entry, seedRow, newPaid, newTotal, newStatus, clearReleaseFields,
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

  // Report an OTA no-show to AIOSELL (Booking.com's no-show-fee workflow). Best-
  // effort + only for a Booking.com reservation that carries its OTA id; for any
  // other booking the local "no-show" mark still stands, we just don't push.
  const pushAiosellNoShow = async (booking) => {
    try {
      if (DEMO_MODE || !session || !propertyId || !booking) return;
      const hotelCode = property && property.accountant && property.accountant.aiosell && property.accountant.aiosell.hotelCode;
      const otaId = booking.extOtaId;
      const isBookingCom = booking.channel === 'booking' || booking.extChannel === 'booking';
      if (!hotelCode || !otaId || !isBookingCom) return;
      await fetch('/api/aiosell-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (session.access_token || '') },
        body: JSON.stringify({ propertyId, kind: 'noshow', payload: { hotelId: hotelCode, bookingId: String(otaId), partner: 'booking.com' } }),
      });
    } catch { /* best-effort */ }
  };

  // Mark a booking as a no-show. We reuse the 'cancelled' status (so the room
  // frees + every screen already handles it) and record a 'noshow' event for the
  // history; the no-show flag is derived from that event on reload. Then report
  // it to the OTA.
  const markNoShow = (bookingId) => {
    const existing = bookings.find(b => b.id === bookingId);
    if (!existing) return;
    let nextEvents = null;
    setBookings(arr => arr.map(b => {
      if (b.id !== bookingId) return b;
      const evts = Array.isArray(b.events) ? b.events : [];
      nextEvents = [
        ...evts,
        { kind: 'noshow', text: 'Marked as no-show', time: new Date().toISOString() },
        { kind: 'status', text: 'Booking cancelled (no-show)', time: new Date().toISOString() },
      ];
      const next = { ...b, status: 'cancelled', noShow: true, events: nextEvents };
      delete next.releaseTs; delete next.releaseAt;
      return next;
    }));
    if (cloudReady && propertyId) {
      syncFire('Mark no-show', updateBookingCloud(bookingId, { status: 'cancelled', releaseTs: null, releaseAt: null, events: nextEvents }));
    }
    logEvent('booking.noshow', 'booking', bookingId, { guest: existing.guest, channel: existing.channel });
    pushAiosellNoShow(existing);
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
      // Clear the cron's once-per-booking reminder flag so the EXTENDED hold's
      // new deadline can earn a fresh "expiring" push (and, in reminder mode, an
      // expiry notice at all). Best-effort + SEPARATE from the patch above so a
      // pre-20260629 deployment (column absent) can't fail the extend itself.
      clearHoldReminderFlag(bookingId);
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
  // Resolve an expense-category id to a human label for the Activity log
  // (custom categories carry a meaningless cx_* id; defaults stay legible).
  const expCatLabel = (id) => {
    const list = (property && property.accountant && Array.isArray(property.accountant.expenseCategories)) ? property.accountant.expenseCategories : [];
    const hit = list.find(c => c && c.id === id);
    return (hit && (hit.label || hit.name)) || id;
  };
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
    logEvent('expense.add', 'expense', expense.id, { amount: expense.amount, category: expense.category, categoryLabel: expCatLabel(expense.category), paidVia: expense.paidVia, note: expense.note });
  };
  const removeExpense = (expenseId) => {
    const removed = expenses.find(e => e.id === expenseId);
    setExpenses(arr => arr.filter(e => e.id !== expenseId));
    if (cloudReady && propertyId) {
      syncFire('Remove expense', removeExpenseCloud(expenseId));
    }
    logEvent('expense.remove', 'expense', expenseId, removed ? { amount: removed.amount, category: removed.category, categoryLabel: expCatLabel(removed.category) } : {});
  };
  const updateExpense = (expenseId, patch) => {
    setExpenses(arr => arr.map(e => e.id === expenseId ? { ...e, ...patch } : e));
    if (cloudReady && propertyId) {
      syncFire('Update expense', updateExpenseCloud(expenseId, patch));
    }
    logEvent('expense.update', 'expense', expenseId, { patch, categoryLabel: patch && patch.category ? expCatLabel(patch.category) : undefined });
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
        // R10-6: the cloud rejected the invoice (permission, or transient).
        // syncCloud already surfaced the error toast. Do NOT fall through to
        // the local fake-number path: invoice numbering must be gap-free per
        // GST law and the authoritative counter lives in the DB (issue_invoice
        // RPC). A locally-minted number would collide with / skip the server
        // sequence the moment any cloud invoice issues. Abort and let the
        // hotelier retry instead of corrupting the register.
        return null;
      }
    }

    // Local-only fallback — reached ONLY when offline / not cloud-backed
    // (no session, or cloud not ready). Here the local counter IS the
    // source of truth, so minting a number is correct.
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

    // Fold any selected SAVED custom extras (sx_*) into customExtras so the
    // folio + voucher can itemise them. The +/- picker only writes
    // data.extras[id]; the extra's {label,price,unit} definition lives in
    // savedCustomExtras and would otherwise be lost on save — dropping the
    // add-on line and inflating the room-tariff line. (The public booking
    // widget already does this — R10-10; the hotelier path was missed.)
    const mergedCustomExtras = (() => {
      const cx = Array.isArray(data.customExtras) ? [...data.customExtras] : [];
      const have = new Set(cx.map(c => c.id));
      for (const [id, qty] of Object.entries(data.extras || {})) {
        if (!qty || have.has(id)) continue;
        const ex = (savedCustomExtras || []).find(x => x.id === id);
        if (!ex) continue;
        cx.push({
          id: ex.id,
          label: ex.label || ex.name || 'Extra',
          price: (data.extraPrices && data.extraPrices[id] != null ? data.extraPrices[id] : ex.price) || 0,
          unit: ex.unit || 'per stay',
        });
      }
      return cx;
    })();

    if (editing) {
      const existing = bookings.find(b => b.id === editing);
      // Editing must NOT recompute what's been paid. The payment step's
      // Full / 50% / Custom picker defaults to "Full", which only makes
      // sense when first taking a booking — re-running it on an edit would
      // silently mark the booking paid-in-full and wipe a genuine
      // outstanding balance. Keep whatever's already collected; payments
      // are added/refunded on the booking page.
      const keepPaid = existing ? (existing.paid || 0) : paid;
      // Coupon discounts are applied in the public widget; the hotelier
      // edit form has no coupon field, so the fresh rate recompute would
      // drop the discount. Re-apply the originally granted rupee discount
      // on top of the recomputed subtotal and carry the coupon fields.
      const keepDiscount = existing ? (existing.discountAmount || 0) : 0;
      // Credit notes reduce the bill. On edit the total is recomputed fresh
      // from rooms, so subtract the cumulative credit notes (from the ledger)
      // to preserve the reduced bill — same idea as keepDiscount.
      const keepCredits = (existing && Array.isArray(existing.payments))
        ? existing.payments.reduce((s, p) => s + ((p.kind === 'credit' || p.kind === 'credit_note') ? (p.amount || 0) : 0), 0)
        : 0;
      const adjTotal = Math.max(0, total - keepDiscount - keepCredits);
      // C-2 fix: the check-in date input is editable in edit mode (seeded
      // from the existing booking's startIdx), but the patch never carried
      // startIdx — so a changed date was silently dropped on save. Recompute
      // it from data.checkIn; fall back to the existing idx if the field is
      // somehow blank so we never accidentally bump a booking to "today".
      const newStartIdx = data.checkIn
        ? parseCheckInIdx(data.checkIn)
        : (existing ? (existing.startIdx || 0) : 0);
      const guestsStr = `${data.roomItems.reduce((s, r) => s + r.adults, 0)}A${data.roomItems.reduce((s, r) => s + r.children, 0) > 0 ? ` ${data.roomItems.reduce((s, r) => s + r.children, 0)}C` : ''}`;
      const phone = dial + ' ' + (data.phone || (existing && existing.phone ? existing.phone.replace(/^\+\d+\s*/, '') : ''));
      // Build a brief diff summary for the activity feed — only the
      // fields that actually changed. Keeps the changelog auditable
      // without pushing noise events for re-saves with no changes.
      const diff = [];
      if (existing) {
        if (existing.guest !== (data.name || existing.guest)) diff.push(`guest: ${existing.guest} → ${data.name}`);
        if ((existing.startIdx || 0) !== newStartIdx) diff.push(`check-in: ${idxToDate(existing.startIdx || 0)} → ${idxToDate(newStartIdx)}`);
        if ((existing.nights || 0) !== (data.nights || 0)) diff.push(`nights: ${existing.nights} → ${data.nights}`);
        if ((existing.total || 0) !== adjTotal) diff.push(`total: ₹${(existing.total || 0).toLocaleString('en-IN')} → ₹${adjTotal.toLocaleString('en-IN')}`);
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
        startIdx: newStartIdx,
        guest: data.name || (existing && existing.guest) || '',
        total: adjTotal, paid: keepPaid, phone, email: data.email || '',
        couponCode: existing ? (existing.couponCode || '') : '',
        discountAmount: keepDiscount,
        notes: data.notes, extras: data.extras,
        roomItems: data.roomItems, customExtras: mergedCustomExtras, extraPrices: data.extraPrices,
        country, formC, state: data.state || '',
        gstApplies: !!data.gstApplies,
        mealPlanId: data.mealPlanId || 'ep',
        ratePlanId: data.ratePlanId || 'standard',
        guests: guestsStr,
      };
      // R11-2 + audit fix: re-validate the unit whenever the room type, the
      // check-in date, OR the length of stay changed. The old code only
      // re-allocated on a TYPE change — so a date-only or nights-only edit kept
      // the booking's original stored unitIdx, which could now collide with
      // another booking on that exact unit and silently double-book it (the
      // Diary renders single-room pills on the stored unit with no conflict
      // check). Keep the current unit when it's still free; otherwise move to
      // the first free unit, confirming an overbooking if none is free — the
      // same eyes-open guard the create + drag-move paths use.
      if (existing) {
        const typeChanged = data.roomTypeId !== existing.roomTypeId;
        const dateChanged = newStartIdx !== (existing.startIdx || 0);
        const nightsChanged = (data.nights || 0) !== (existing.nights || 0);
        if (typeChanged || dateChanged || nightsChanged) {
          const others = bookings.filter(x => x.id !== editing);
          const rts = effectiveRoomTypes(property);
          const curUnit = existing.unitIdx || 0;
          let nextUnit = (!typeChanged && isUnitFree(others, data.roomTypeId, curUnit, newStartIdx, data.nights, rts))
            ? curUnit
            : findFirstFreeUnit(others, data.roomTypeId, newStartIdx, data.nights, rts);
          if (nextUnit === null || nextUnit === undefined) {
            const roomType = rts.find(r => r.id === data.roomTypeId);
            const proceed = window.confirm(
              `All ${roomType?.units || ''} unit${(roomType?.units || 0) === 1 ? '' : 's'} of ${roomType?.name || 'this room type'} are already booked for these dates.\n\nSave this change anyway? (It will stack on unit 1 and you'll need to move it once a unit frees up.)`
            );
            if (!proceed) return;
            nextUnit = 0;
          }
          patch.unitIdx = nextUnit;
          // Keep the primary roomItem in lockstep with the type + re-allocated
          // unit. The edit form seeds roomItems from the original booking
          // (carrying the OLD unitIdx) and the Diary pill renders from
          // roomItems[0], so without this the pill points at a stale unit.
          if (Array.isArray(patch.roomItems) && patch.roomItems.length > 0) {
            patch.roomItems = patch.roomItems.map((it, i) =>
              i === 0 ? { ...it, roomTypeId: data.roomTypeId, unitIdx: nextUnit } : it
            );
          }
        }
      }
      if (isHold) {
        patch.status = 'tentative';
        patch.releaseTs = releaseTs;
        patch.releaseAt = releaseAt;
        patch.holdHours = data.holdHours || 4;   // persist hold length (cloud + extendHold tally)
      } else if (existing && existing.status === 'tentative' && adjTotal > 0 && keepPaid >= adjTotal) {
        // Editing a tentative hold down to fully-paid (e.g. fewer nights / lower
        // rate) should confirm it + clear the release timer, mirroring addPayment
        // — otherwise it sits in tentative limbo that the auto-release ticker
        // also skips (notFullyPaid is false once paid >= total).
        patch.status = 'confirmed';
        patch.releaseTs = null;
        patch.releaseAt = null;
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
        // Seed the advance collected at creation as a real ledger entry so it
        // carries its method + collection date. The Daily P&L attributes income
        // by collection date — without a real payment row the advance would
        // fall back to the check-in date (wrong day) and show a guessed method.
        payments: paid > 0 ? [{
          id: 'pay_' + Date.now().toString(36),
          kind: 'payment',
          method: data.payMethod || 'cash',
          amount: paid,
          // A real human-readable stamp (matches PaymentSheet / Dashboard quick-
          // settle). Was the literal 'now', which rendered the word "now" in the
          // folio on the offline/cloud-error fallback (online, cloudBookingToLocal
          // overwrites it with created_at).
          date: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) + ' · ' + new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }),
          dateIso: ymd(new Date()),
        }] : [],
        guests: guestsStr,
        phone: dial + ' ' + data.phone,
        email: data.email || '',
        country, formC,
        notes: data.notes,
        extras: data.extras,
        roomItems: data.roomItems,
        customExtras: mergedCustomExtras,
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
          // Buzz the rest of the team's subscribed devices via Web Push (skips
          // the creator's own device). Fire-and-forget; no-ops until the owner
          // sets the push env vars + a teammate turned alerts on.
          try {
            const uid = session && session.user && session.user.id;
            const origin = (typeof window !== 'undefined' && window.location) ? window.location.origin : '';
            fetch('/api/notify-booking', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ propertyId, origin, excludeUserId: uid || null }),
              keepalive: true,
            }).catch(() => {});
          } catch (e) { /* never block booking creation on a notify failure */ }
          go('booking-confirmed', created.id);
          return;
        } catch {
          // syncCloud already toasted the failure; fall through to the
          // local-only path below so the booking still lands on screen.
        }
      }

      // Offline or cloud-error fallback — assign a LOCALLY-unique id. Don't use
      // bookings.length: real ids come from a global, monotonic DB sequence, so
      // "2854 + count" can collide with a loaded/cancelled booking and shadow it
      // (id lookups + React keys would then resolve to the wrong record).
      const maxBk = bookings.reduce((m, b) => {
        const n = /^BK-(\d+)$/.exec(b.id || '');
        return n ? Math.max(m, +n[1]) : m;
      }, 2853);
      newBk.id = 'BK-' + (maxBk + 1);
      setBookings(arr => [...arr, newBk]);
      logEvent('booking.create', 'booking', newBk.id, { guest: newBk.guest, total: newBk.total, nights: newBk.nights, channel: newBk.channel, offline: true });
      go('booking-confirmed', newBk.id);
    }
  };

  const showTabs = ['home', 'diary', 'guests', 'more'].includes(route.name);
  const editingBooking = editing ? bookings.find(b => b.id === editing) : null;

  let screen;
  switch (route.name) {
    case 'home':              screen = <Dashboard go={go} bookings={bookings} property={property} plan={plan} t={t} lang={lang} onAddPayment={addPayment} onExtendHold={extendHold} cashCloses={cashCloses} onSetCashClose={setCashClose} expenses={expenses} can={can} onVoiceBooking={() => setVoiceOpen(true)} />; break;
    case 'diary':             screen = <Diary go={go} bookings={bookings} setBookings={setBookings} moveBooking={moveBooking} t={t} lang={lang} property={property} rateOverrides={rateOverrides} setRateOverrides={setRateOverrides} can={can} />; break;
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
        screen = <NewBooking key={'nb-' + (route.seq || 0)} go={go} onCreate={onCreate} plan={plan} t={t} editing={editingBooking} prefill={prefill} savedCustomExtras={savedCustomExtras} onRemoveSavedExtra={removeSavedCustomExtra} rateOverrides={rateOverrides} property={property} bookings={bookings} onVoiceBooking={() => setVoiceOpen(true)} />;
      }
      break;
    }
    case 'booking':           screen = <BookingDetail go={go} bookingId={route.arg} bookings={bookings} plan={plan} t={t} lang={lang} property={property} propertyId={propertyId} onChangeProperty={setProperty} onEdit={startEdit} onPayment={addPayment} onSetStatus={setStatus} onMarkNoShow={markNoShow} onExtendHold={extendHold} onSetGst={setBookingGst} onSetVip={setBookingVip} onAddVoiceNote={addVoiceNote} onRemoveVoiceNote={removeVoiceNote} onIssueInvoice={issueInvoice} onVoidInvoice={voidInvoice} can={can} />; break;
    case 'booking-confirmed': screen = <BookingConfirmed go={go} t={t} bookingId={route.arg} bookings={bookings} property={property} lang={lang} />; break;
    case 'rates':             screen = can('manage_rates')    ? <Rates go={go} t={t} lang={lang} overrides={rateOverrides} setOverrides={setRateOverrides} property={property} plan={plan} bookings={bookings} /> : <PermissionDenied go={go} t={t} action="edit the rate calendar" />; break;
    case 'guests':            screen = <Guests go={go} bookings={bookings} t={t} can={can} />; break;
    case 'channels':          screen = <Channels go={go} t={t} property={property} plan={plan} session={session} propertyId={propertyId} can={can} bookings={bookings} overrides={rateOverrides} />; break;
    case 'reports':           screen = can('view_reports')    ? <Reports go={go} t={t} bookings={bookings} plan={plan} property={property} expenses={expenses} session={session} propertyId={propertyId} /> : <PermissionDenied go={go} t={t} action="see reports" />; break;
    case 'settings':          screen = <Settings go={go} plan={plan} onChangePlan={setPlan} lang={lang} onChangeLang={setLang} property={property} onChangeProperty={setProperty} savedExtras={savedCustomExtras} onChangeSavedExtras={setSavedCustomExtras} bookings={bookings} t={t} session={session} propertyId={propertyId} onSignOut={supaSignOut} can={can} />; break;
    case 'advanced':          screen = can('manage_settings') ? <AdvancedSettings go={go} t={t} property={property} onChangeProperty={setProperty} can={can} /> : <PermissionDenied go={go} t={t} action="change advanced settings" />; break;
    case 'expenses':          screen = can('manage_expenses') ? <Expenses go={go} t={t} expenses={expenses} onAdd={addExpense} onRemove={removeExpense} onUpdate={updateExpense} property={property} onChangeProperty={setProperty} can={can} /> : <PermissionDenied go={go} t={t} action="log expenses" />; break;
    case 'activity':          screen = can('view_reports') ? <Activity go={go} t={t} propertyId={propertyId} session={session} /> : <PermissionDenied go={go} t={t} action="see the activity log" />; break;
    case 'more':              screen = <MoreMenu go={go} t={t} can={can} />; break;
    case 'ops':               screen = <OperatorConsole go={go} session={session} />; break;
    case 'terms':             screen = <Legal tab="terms"   go={go} />; break;
    case 'privacy':           screen = <Legal tab="privacy" go={go} />; break;
    default:                  screen = <Dashboard go={go} bookings={bookings} property={property} plan={plan} t={t} lang={lang} onAddPayment={addPayment} onExtendHold={extendHold} cashCloses={cashCloses} onSetCashClose={setCashClose} expenses={expenses} can={can} onVoiceBooking={() => setVoiceOpen(true)} />;
  }

  // Public booking widget — customer-facing UI. URL has ?book=1 or /book/<slug>.
  // MUST render BEFORE the splash + no-session gates below: a real customer
  // hitting the link is NOT signed in (session === null), and with DEMO_MODE
  // off the no-session gate would otherwise shadow the widget with the Landing
  // marketing page. The widget is self-contained — it loads the property by
  // slug over anon RLS — so it needs neither authReady/cloudReady nor a
  // hotelier session. (Regression guard: this used to sit after the no-session
  // gate and broke for every logged-out guest once DEMO_MODE was flipped off.)
  if (IS_PUBLIC_WIDGET) {
    return <PublicWidgetEntry slug={WIDGET_SLUG} fallbackProperty={property} fallbackBookings={bookings} fallbackOverrides={rateOverrides} fallbackExtras={savedCustomExtras} lang={lang} />;
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

  // No session → landing page (or sign-in / legal if the user navigated there).
  // Bypassed in DEMO_MODE — the app trusts localStorage and never asks for credentials.
  if (!DEMO_MODE && !session) {
    if (route.name === 'signin')  return <SignIn t={t} lang={lang} onChangeLang={setLang} go={go} />;
    if (route.name === 'terms' || route.name === 'privacy') return <Legal tab={route.name} go={go} />;
    return <Landing go={go} lang={lang} onChangeLang={setLang} />;
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
              // R8-10: scroll to the nudges card via a stable id (the old
              // text-match failed — the heading renders uppercase via CSS so
              // textContent never equalled "TODAY'S NUDGES", the Hindi string
              // was wrong, and the [data-dashboard-scroll] fallback selector
              // didn't exist). Fall back to scrolling the dashboard container
              // to the top when there's no nudges card today.
              const target = document.getElementById('atithi-nudges');
              if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
              } else {
                const scroll = document.getElementById('atithi-dash-scroll');
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
      <VoiceBookingSheet
        open={voiceOpen}
        onClose={() => setVoiceOpen(false)}
        property={property}
        propertyId={propertyId}
        session={session}
        go={go}
        lang={lang}
      />
    </div>
  );
}

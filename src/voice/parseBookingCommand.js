import { effectiveRoomTypes, effectiveMealPlans, ymd } from '../data.js';

// Turns a spoken booking command into a New Booking *prefill payload*.
//
// Two parsing paths, same output shape:
//   • AI (preferred): POST /api/parse-booking → Claude Haiku 4.5 (server
//     holds the key). Only works on the deployed Vercel site.
//   • Rule-based fallback: a small regex parser that runs in the browser.
//     Used when the AI endpoint is unreachable — local `npm run dev` (no
//     /api/* functions), the key isn't set yet (503 no_ai), or any
//     network error. Keeps the whole flow demoable offline and acts as a
//     safety net in production.
//
// The result is fed to go('new', { prefill }) so the existing 4-step New
// Booking form opens pre-filled and the hotelier confirms — its per-step
// validation IS the "ask for any missing info" behaviour.

const MONTHS = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
  may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8,
  september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
};

// Context the AI needs (and the rule parser reuses): today's date, the
// property's room types + meal plans, and the child-age thresholds.
export function buildContext(property) {
  const acc = (property && property.accountant) || {};
  return {
    todayIso: ymd(new Date()),
    roomTypes: effectiveRoomTypes(property).map(r => ({ id: r.id, name: r.name })),
    mealPlans: effectiveMealPlans(property)
      .filter(m => m.enabled !== false)
      .map(m => ({ id: m.id, label: m.label || m.code })),
    childFreeBelowAge: acc.childFreeBelowAge != null ? acc.childFreeBelowAge : 5,
    childAgeBelow: acc.childAgeBelow != null ? acc.childAgeBelow : 12,
    currency: 'INR',
  };
}

// Main entry: returns { draft, source: 'ai' | 'rule' }.
export async function parseBookingCommand(transcript, property, propertyId, session) {
  const context = buildContext(property);
  const token = session && session.access_token;

  if (token && propertyId) {
    try {
      const resp = await fetch('/api/parse-booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ transcript, propertyId, context }),
      });
      if (resp.ok) {
        const json = await resp.json();
        if (json && json.draft) return { draft: json.draft, source: 'ai' };
      }
      // 404 (local dev) / 503 (no_ai) / other → fall through to rules.
    } catch {
      // network / unreachable → fall through to rules.
    }
  }

  return { draft: ruleParse(transcript, context), source: 'rule' };
}

// ---- Rule-based fallback parser -------------------------------------------

export function ruleParse(transcript, context) {
  const text = String(transcript || '').toLowerCase();
  const draft = {
    checkInDate: null, nights: null, roomTypeId: null, roomTypeHeard: null,
    adults: null, childrenAges: [], total: null, advanceAmount: null,
    paymentMethod: null, guestName: null, phone: null, mealPlanId: null, notes: null,
  };

  const num = (s) => parseInt(String(s).replace(/[,\s]/g, ''), 10);

  const adultsM = text.match(/(\d+)\s*adult/);
  if (adultsM) draft.adults = num(adultsM[1]);

  // "1 child under 6" / "2 children" / "1 kid"
  const childM = text.match(/(\d+)\s*(?:children|child|kids|kid)(?:\s*under\s*(\d+))?/);
  if (childM) {
    const n = num(childM[1]);
    const age = childM[2] ? num(childM[2]) - 1 : (context.childFreeBelowAge - 1);
    draft.childrenAges = Array.from({ length: Math.max(0, n) }, () => Math.max(0, age));
  }

  // total: "total price 5000" / "tariff 5000" / "5000 total"
  const totalM = text.match(/(?:total|price|tariff|amount)\s*(?:price)?\s*(?:rs\.?|₹|rupees?)?\s*(\d[\d,]*)/)
    || text.match(/(\d[\d,]*)\s*(?:rs\.?|₹|rupees?)?\s*(?:total|tariff)/);
  if (totalM) draft.total = num(totalM[1]);

  // advance: "2000 received as advance" / "advance of 2000" / "2000 advance"
  const advM = text.match(/(?:advance|deposit|token)\s*(?:of|amount)?\s*(?:rs\.?|₹|rupees?)?\s*(\d[\d,]*)/)
    || text.match(/(\d[\d,]*)\s*(?:rs\.?|₹|rupees?)?\s*(?:received\s*)?(?:as\s*)?(?:advance|deposit|token)/);
  if (advM) draft.advanceAmount = num(advM[1]);

  if (/\bupi\b|google\s*pay|gpay|phonepe|paytm/.test(text)) draft.paymentMethod = 'upi';
  else if (/\bcash\b/.test(text)) draft.paymentMethod = 'cash';
  else if (/\bcard\b/.test(text)) draft.paymentMethod = 'card';
  else if (/\bbank\b|transfer|neft|imps/.test(text)) draft.paymentMethod = 'bank';

  const nightsM = text.match(/(\d+)\s*night/);
  if (nightsM) draft.nights = num(nightsM[1]);

  // Room type — match against the property's actual types (name or first word).
  for (const rt of context.roomTypes || []) {
    const name = String(rt.name || '').toLowerCase();
    const firstWord = name.split(/\s+/)[0] || '';
    if (name && (text.includes(name) || (firstWord.length >= 3 && text.includes(firstWord)))) {
      draft.roomTypeId = rt.id;
      draft.roomTypeHeard = firstWord;
      break;
    }
  }

  draft.checkInDate = parseSpokenDate(text, context.todayIso);
  return draft;
}

function parseSpokenDate(text, todayIso) {
  const iso = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const today = new Date(todayIso + 'T00:00:00');
  if (/\bday after tomorrow\b/.test(text)) return ymd(addDays(today, 2));
  if (/\btomorrow\b/.test(text)) return ymd(addDays(today, 1));
  if (/\btoday\b/.test(text)) return ymd(today);

  const names = Object.keys(MONTHS).join('|');
  // "15th january 2027" / "15 jan"
  let m = text.match(new RegExp(`(\\d{1,2})\\s*(?:st|nd|rd|th)?\\s*(?:of\\s*)?(${names})\\.?\\s*(\\d{4})?`));
  let day, mon, yr;
  if (m) {
    day = parseInt(m[1], 10); mon = MONTHS[m[2]]; yr = m[3] ? parseInt(m[3], 10) : null;
  } else {
    // "january 15 2027" / "jan 15"
    m = text.match(new RegExp(`(${names})\\.?\\s*(\\d{1,2})\\s*(?:st|nd|rd|th)?,?\\s*(\\d{4})?`));
    if (m) { mon = MONTHS[m[1]]; day = parseInt(m[2], 10); yr = m[3] ? parseInt(m[3], 10) : null; }
  }
  if (mon == null || !day) return null;
  if (yr == null) {
    yr = today.getFullYear();
    if (new Date(yr, mon, day) < today) yr += 1; // assume the next future occurrence
  }
  return ymd(new Date(yr, mon, day));
}

function addDays(base, n) {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return d;
}

// ---- Draft → New Booking prefill ------------------------------------------

export function draftToPrefill(draft, property) {
  const d = draft || {};
  const acc = (property && property.accountant) || {};
  const freeBelow = acc.childFreeBelowAge != null ? acc.childFreeBelowAge : 5;
  const halfBelow = acc.childAgeBelow != null ? acc.childAgeBelow : 12;

  // Only trust a roomTypeId the property actually has.
  const types = effectiveRoomTypes(property);
  const roomTypeId = d.roomTypeId && types.some(t => t.id === d.roomTypeId) ? d.roomTypeId : null;

  // Bucket children by age into the form's three tiers.
  let childrenFree = 0, children = 0, childrenFull = 0;
  (Array.isArray(d.childrenAges) ? d.childrenAges : []).forEach(age => {
    const a = Number(age);
    if (!Number.isFinite(a)) { children += 1; return; }
    if (a < freeBelow) childrenFree += 1;
    else if (a < halfBelow) children += 1;
    else childrenFull += 1;
  });

  const nights = Number.isFinite(d.nights) && d.nights > 0 ? d.nights : 1;
  const adults = Number.isFinite(d.adults) && d.adults > 0 ? d.adults : 2;

  // An explicit spoken total becomes a per-night room rate so the form's
  // computed total matches what the manager said (extras / meals, if any,
  // still add on top — same as the manual form; the hotelier sees the
  // final number on the confirm step).
  let rate = null;
  if (Number.isFinite(d.total) && d.total > 0) rate = Math.round(d.total / nights);

  // Only trust a mealPlanId the property actually has.
  const meals = effectiveMealPlans(property);
  const mealPlanId = d.mealPlanId && meals.some(m => m.id === d.mealPlanId) ? d.mealPlanId : undefined;

  const prefill = {
    date: d.checkInDate || '',
    nights,
    roomTypeId,
    adults,
    children, childrenFree, childrenFull,
    rate,
    mealPlanId,
    name: d.guestName || '',
    phone: d.phone || '',
    notes: d.notes || '',
  };

  if (Number.isFinite(d.advanceAmount) && d.advanceAmount > 0) {
    prefill.payAmount = 'custom';
    prefill.payCustom = Math.round(d.advanceAmount);
    prefill.payMethod = d.paymentMethod || 'cash';
  }

  return prefill;
}

import { useState, useMemo, useEffect, useRef } from 'react';
import { T, THEME_PRESETS, applyTheme } from '../tokens.js';
import { AMENITIES, currentFinancialYear, GST_SLABS, gstSlabFor, gstRateForCategory, slugify, propertyShortCode, effectiveChildBands } from '../data.js';
import TeamSection from '../components/TeamSection.jsx';
import NumberInput from '../components/NumberInput.jsx';
import { useInstallPrompt } from '../components/InstallPrompt.jsx';
import { resetMyProperty } from '../cloud/resetProperty.js';
import { uploadPropertyMedia, deletePropertyMedia, mediaPathOf } from '../cloud/storage.js';
import { useSyncState } from '../cloud/sync.js';
import { isWidgetRlsLive } from '../cloud/widget.js';
import { logActivity } from '../cloud/activity.js';

// Install-app card shown in Settings → Account. Always visible (no
// dismissal sticky) so the hotelier can come back and install at any
// time. Adapts to platform: native Install button on Chrome/Edge/
// Android, step-by-step Share-sheet instructions on iOS, generic
// browser-menu nudge everywhere else. Hides itself completely when
// the app is already running standalone.
function InstallAppCard({ t }) {
  const { canInstall, isIosSafari, isStandalone, install } = useInstallPrompt();
  const [iosOpen, setIosOpen] = useState(false);
  const [howOpen, setHowOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  if (isStandalone) {
    return (
      <Card padding={14} style={{ background: 'oklch(96% 0.05 155)', border: `1px solid ${T.ok}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Icon name="check" size={18} color={T.ok} stroke={2.2} />
          <div style={{ fontSize: 13, fontWeight: 700, color: 'oklch(35% 0.13 155)' }}>
            {t('appInstalled')}
          </div>
        </div>
      </Card>
    );
  }
  const handleInstall = async () => {
    setBusy(true);
    await install();
    setBusy(false);
  };
  return (
    <>
      <Card padding={14}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: T.primaryLt, color: T.primaryDk, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon name="plus" size={18} stroke={2.4} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>{t('installTitle')}</div>
            <div style={{ fontSize: 11, color: T.ink3, fontWeight: 600, marginTop: 2, lineHeight: 1.4 }}>
              {t('installSub')}
            </div>
          </div>
        </div>
        {canInstall ? (
          <button
            onClick={handleInstall}
            disabled={busy}
            style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: 'none', background: T.primary, color: '#fff', fontSize: 12, fontWeight: 700, cursor: busy ? 'wait' : 'pointer' }}
          >{busy ? t('installOpening') : t('installBtn')}</button>
        ) : isIosSafari ? (
          <button
            onClick={() => setIosOpen(true)}
            style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: 'none', background: T.primary, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
          >{t('installIosBtn')}</button>
        ) : (
          <button
            onClick={() => setHowOpen(true)}
            style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: 'none', background: T.primary, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
          >{t('installHowBtn')}</button>
        )}
      </Card>
      {iosOpen && (
        <div
          onClick={() => setIosOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 220, display: 'flex', alignItems: 'flex-end' }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', background: T.card, borderRadius: '16px 16px 0 0', padding: 24 }}>
            <div style={{ width: 32, height: 4, background: T.border, borderRadius: 2, margin: '0 auto 18px' }} />
            <div style={{ fontSize: 17, fontWeight: 800, color: T.ink, marginBottom: 14, textAlign: 'center' }}>
              {t('installSheetTitle')}
            </div>
            <ol style={{ paddingLeft: 24, color: T.ink2, fontSize: 13, lineHeight: 1.7, marginBottom: 18 }}>
              <li>{t('installIosStep1')}
                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 6, background: T.bgSoft, marginLeft: 6, verticalAlign: 'middle' }}>
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                    <path d="M10 3v10M10 3l-3 3M10 3l3 3" stroke={T.primary} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M5 10v6a1 1 0 001 1h8a1 1 0 001-1v-6" stroke={T.primary} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </span>
              </li>
              <li>{t('installIosStep2')}</li>
              <li>{t('installIosStep3')}</li>
            </ol>
            <button
              onClick={() => setIosOpen(false)}
              style={{ width: '100%', padding: '11px 14px', borderRadius: 10, border: 'none', background: T.primary, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
            >{t('gotIt')}</button>
          </div>
        </div>
      )}
      {/* Generic install instructions for browsers that don't fire the
          native install event and aren't iOS Safari (e.g. desktop
          Firefox, or Chrome before the event arrives). Ensures the card
          always has an actionable button, not just a wall of text. */}
      {howOpen && (
        <div
          onClick={() => setHowOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 220, display: 'flex', alignItems: 'flex-end' }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', background: T.card, borderRadius: '16px 16px 0 0', padding: 24 }}>
            <div style={{ width: 32, height: 4, background: T.border, borderRadius: 2, margin: '0 auto 18px' }} />
            <div style={{ fontSize: 17, fontWeight: 800, color: T.ink, marginBottom: 14, textAlign: 'center' }}>
              {t('installSheetTitle')}
            </div>
            <ol style={{ paddingLeft: 24, color: T.ink2, fontSize: 13, lineHeight: 1.7, marginBottom: 18 }}>
              <li>{t('installGenStep1')}</li>
              <li>{t('installGenStep2')}</li>
              <li>{t('installGenStep3')}</li>
            </ol>
            <button
              onClick={() => setHowOpen(false)}
              style={{ width: '100%', padding: '11px 14px', borderRadius: 10, border: 'none', background: T.primary, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
            >{t('gotIt')}</button>
          </div>
        </div>
      )}
    </>
  );
}

// Booking-alerts card — opt THIS device into Web Push so the hotelier's phone
// buzzes on a new website booking. Only meaningful signed in (subscriptions are
// tied to a user + property). Mirrors InstallAppCard's look. Degrades to a
// friendly line on unsupported browsers / blocked permission / unfinished
// server setup, so it never looks broken.
function PushAlertsCard({ t, propertyId, userId }) {
  const [state, setState] = useState('loading'); // loading | unsupported | denied | on | off
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const isIos = typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent || '');
  const isStandalone = typeof window !== 'undefined'
    && ((window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true);
  const iosNeedsInstall = isIos && !isStandalone; // iOS only pushes for installed PWAs

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!isPushSupported()) { if (alive) setState('unsupported'); return; }
      const s = await pushState();
      if (alive) setState(s === 'on' ? 'on' : (s === 'denied' ? 'denied' : (s === 'unsupported' ? 'unsupported' : 'off')));
    })();
    return () => { alive = false; };
  }, []);

  const turnOn = async () => {
    setBusy(true); setErr('');
    const res = await enablePush(propertyId, userId);
    setBusy(false);
    if (res.ok) { setState('on'); return; }
    if (res.reason === 'denied') setState('denied');
    else if (res.reason === 'unsupported') setState('unsupported');
    else setErr(t('pushSetupHint'));
  };
  const turnOff = async () => {
    setBusy(true); setErr('');
    await disablePush();
    setBusy(false);
    setState('off');
  };

  return (
    <Card padding={14}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: state === 'loading' ? 0 : 12 }}>
        <div style={{ width: 38, height: 38, borderRadius: 10, background: T.primaryLt, color: T.primaryDk, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon name="bell" size={18} stroke={2.2} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>{t('pushTitle')}</div>
          <div style={{ fontSize: 11, color: T.ink3, fontWeight: 600, marginTop: 2, lineHeight: 1.4 }}>{t('pushSub')}</div>
        </div>
        {state === 'on' && <Icon name="check" size={18} color={T.ok} stroke={2.4} />}
      </div>

      {state === 'unsupported' && (
        <div style={{ fontSize: 11, color: T.ink3, fontWeight: 600, lineHeight: 1.4 }}>{t('pushUnsupported')}</div>
      )}
      {state === 'denied' && (
        <div style={{ fontSize: 11, color: T.danger, fontWeight: 600, lineHeight: 1.4 }}>{t('pushDenied')}</div>
      )}
      {state === 'off' && (
        <>
          {iosNeedsInstall && (
            <div style={{ fontSize: 11, color: 'oklch(48% 0.14 75)', fontWeight: 600, lineHeight: 1.4, marginBottom: 8 }}>{t('pushIosHint')}</div>
          )}
          <button onClick={turnOn} disabled={busy}
            style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: 'none', background: T.primary, color: '#fff', fontSize: 12, fontWeight: 700, cursor: busy ? 'wait' : 'pointer' }}>
            {busy ? t('pushEnabling') : t('pushTurnOn')}
          </button>
        </>
      )}
      {state === 'on' && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ fontSize: 11, color: T.ok, fontWeight: 700 }}>{t('pushOnNote')}</div>
          <Btn variant="ghost" size="sm" onClick={turnOff} disabled={busy}>{busy ? '…' : t('pushTurnOff')}</Btn>
        </div>
      )}
      {err && <div style={{ fontSize: 11, color: T.danger, fontWeight: 600, marginTop: 8, lineHeight: 1.4 }}>{err}</div>}
    </Card>
  );
}

// Click-anywhere date cell for the Seasons editor. Wraps a hidden
// (opacity:0) date input under a labelled overlay so tapping anywhere
// in the cell opens the native picker. Picked date renders in the
// cell formatted; doesn't depend on the global .atithi-date-overlay
// rule (uses opacity:0 directly).
function SeasonDateCell({ label, value, onChange }) {
  const ref = useRef(null);
  const open = () => {
    const el = ref.current;
    if (el && typeof el.showPicker === 'function') {
      try { el.showPicker(); } catch {}
    }
  };
  const filled = !!value;
  const display = filled
    ? new Date(value + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : 'Tap to pick';
  return (
    <div>
      <div style={{ fontSize: 9, color: T.ink3, fontWeight: 700, letterSpacing: 0.3, marginBottom: 2 }}>{label}</div>
      <div
        onClick={open}
        style={{
          position: 'relative', height: 30,
          border: `1px solid ${filled ? T.primary : T.border}`,
          background: filled ? T.primaryLt : T.card,
          borderRadius: 5, cursor: 'pointer',
        }}
      >
        <input
          ref={ref}
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer', border: 'none', padding: 0, margin: 0 }}
        />
        <div style={{ position: 'absolute', inset: 0, padding: '0 8px', display: 'flex', alignItems: 'center', gap: 5, pointerEvents: 'none', fontSize: 11, fontWeight: 700, color: filled ? T.primaryDk : T.ink3, whiteSpace: 'nowrap', overflow: 'hidden' }}>
          <Icon name="cal" size={10} color={filled ? T.primaryDk : T.ink3} />
          {display}
        </div>
      </div>
    </div>
  );
}

// Format the FY code stored in invoiceCounters ('2627') as a human-readable
// label ('2026-27') for use on labels and hints.
function fmtFy(fy) {
  if (!fy || fy.length !== 4) return fy || '';
  return `20${fy.slice(0, 2)}-${fy.slice(2)}`;
}
import Icon from '../components/Icon.jsx';
import Btn from '../components/Btn.jsx';
import Chip from '../components/Chip.jsx';
import Card from '../components/Card.jsx';
import Field from '../components/Field.jsx';
import SectionHead from '../components/SectionHead.jsx';
import ScreenHeader from '../components/ScreenHeader.jsx';
import Toggle from '../components/Toggle.jsx';
import { isPushSupported, pushState, enablePush, disablePush } from '../push.js';

// Reusable amenity picker: works for property-wide and per-category lists.
// `selected` is an array of amenity ids; calls `onChange` with the new array.
function AmenityPicker({ selected = [], onChange, customAmenities = [], onAddCustom, onRemoveCustom, compact = false }) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const sel = new Set(selected);
  const toggle = (id) => {
    const next = sel.has(id) ? selected.filter(x => x !== id) : [...selected, id];
    onChange(next);
  };
  const groups = useMemo(() => {
    const map = new Map();
    AMENITIES.forEach(a => {
      if (!map.has(a.group)) map.set(a.group, []);
      map.get(a.group).push(a);
    });
    return [...map.entries()];
  }, []);
  const submit = () => {
    const label = draft.trim();
    if (!label) return;
    if (onAddCustom) {
      const id = 'cx_amen_' + Date.now();
      onAddCustom({ id, label });
      onChange([...selected, id]);
    }
    setDraft(''); setAdding(false);
  };
  const chip = (active, dim) => ({
    display: 'inline-flex', alignItems: 'center', gap: 4,
    padding: compact ? '3px 8px' : '5px 10px', borderRadius: 999,
    border: `1.5px solid ${active ? T.primary : T.border}`,
    background: active ? T.primaryLt : T.card,
    color: active ? T.primaryDk : (dim ? T.ink3 : T.ink2),
    fontSize: compact ? 10 : 11, fontWeight: 700, cursor: 'pointer',
  });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {groups.map(([groupName, items]) => (
        <div key={groupName}>
          <div style={{ fontSize: 9, fontWeight: 700, color: T.ink3, letterSpacing: 0.4, marginBottom: 5, textTransform: 'uppercase' }}>{groupName}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {items.map(a => {
              const active = sel.has(a.id);
              return (
                <button key={a.id} onClick={() => toggle(a.id)} style={chip(active)}>
                  {active && <Icon name="check" size={9} stroke={2.4} />}
                  {a.label}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {(customAmenities.length > 0 || onAddCustom) && (
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, color: T.ink3, letterSpacing: 0.4, marginBottom: 5, textTransform: 'uppercase' }}>Custom</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center' }}>
            {customAmenities.map(a => {
              const active = sel.has(a.id);
              return (
                <button key={a.id} onClick={() => toggle(a.id)} style={chip(active)}>
                  {active && <Icon name="check" size={9} stroke={2.4} />}
                  {a.label}
                  {onRemoveCustom && (
                    <span
                      onClick={(e) => { e.stopPropagation(); onRemoveCustom(a.id); }}
                      style={{ marginLeft: 3, color: T.ink3, display: 'inline-flex' }}
                      title="Remove from list"
                    >
                      <Icon name="x" size={9} stroke={2} />
                    </span>
                  )}
                </button>
              );
            })}
            {onAddCustom && !adding && (
              <button onClick={() => setAdding(true)} style={{ ...chip(false, true), borderStyle: 'dashed' }}>
                <Icon name="plus" size={9} stroke={2.4} /> Add your own
              </button>
            )}
            {onAddCustom && adding && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 4px', borderRadius: 999, border: `1.5px solid ${T.primary}`, background: T.primaryLt }}>
                <input
                  autoFocus
                  value={draft}
                  placeholder="e.g. Sky lounge"
                  onChange={e => setDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') { setAdding(false); setDraft(''); } }}
                  style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 11, fontWeight: 700, color: T.primaryDk, width: 120, padding: '2px 6px' }}
                />
                <button onClick={submit} style={{ border: 'none', background: T.primary, color: '#fff', borderRadius: 999, fontSize: 10, fontWeight: 700, padding: '3px 9px', cursor: 'pointer' }}>Add</button>
                <button onClick={() => { setAdding(false); setDraft(''); }} style={{ border: 'none', background: 'none', color: T.ink3, fontSize: 10, cursor: 'pointer', padding: '0 6px' }}>×</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Collapsible group for the Property Profile sheet. Each group bundles a
// few related SectionHead+Card blocks behind a single tap, so the sheet
// fits onto roughly 1 phone screen on first open instead of ~9.
function AccordionGroup({ title, hint, open, onToggle, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <button
        onClick={onToggle}
        className="atithi-tap"
        aria-expanded={open}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
          padding: '12px 14px', background: open ? T.card : T.bgSoft,
          border: `1px solid ${open ? T.border : T.borderSoft}`,
          borderRadius: T.radius, cursor: 'pointer', textAlign: 'left',
          fontFamily: 'inherit',
        }}
      >
        <Icon name={open ? 'chevD' : 'chev'} size={14} stroke={2.4} color={open ? T.primary : T.ink2} />
        <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: T.ink, letterSpacing: 0.4, textTransform: 'uppercase' }}>{title}</span>
        {hint && (
          <span style={{ fontSize: 10.5, color: T.ink3, fontWeight: 600, textAlign: 'right' }}>{hint}</span>
        )}
      </button>
      {open && <div style={{ marginTop: 12 }}>{children}</div>}
    </div>
  );
}

function PropertyProfile({ t, onClose, property, plan, onSave, savedExtras = [], onChangeSavedExtras, bookings = [], session, propertyId, canManageTeam = true }) {
  const [profile, setProfile] = useState(property.profile);
  const [categories, setCategories] = useState(property.categories);
  const [rules, setRules] = useState(property.rules);
  const [newRule, setNewRule] = useState('');
  // Custom pre-arrival reminders. Each {id, text} appears in the
  // Dashboard's Today's Nudges card once per guest arriving tomorrow,
  // with a one-tap WhatsApp button that opens the chat with the
  // reminder text prefilled. Useful for property-specific reminders
  // like "Ask if airport pickup needed" or "Confirm any dietary
  // requirements" that the hotelier wants to ask the day before.
  //
  // Stored inside `accountant` jsonb so it round-trips to Supabase via
  // the existing properties.accountant column — no new column / no
  // migration. Same hack as childAgeBelow / customPaymentMethods /
  // expenseCategories that already live there.
  const [customReminders, setCustomReminders] = useState(Array.isArray(property?.accountant?.customReminders) ? property.accountant.customReminders : []);
  const [newReminder, setNewReminder] = useState('');
  const [amenityIds, setAmenityIds] = useState(property.amenityIds || []);
  const [customAmenities, setCustomAmenities] = useState(property.customAmenities || []);
  const [mealPlans, setMealPlans] = useState(property.mealPlans || []);
  // Property-wide default meal plan. The Rates calendar rate is treated
  // as INCLUDING this plan, so a guest who picks a different plan pays
  // the per-guest-per-night delta on top. Defaults to 'ep' so existing
  // properties keep their old "add on top" behaviour (EP price = 0).
  const [defaultMealPlan, setDefaultMealPlan] = useState(property.defaultMealPlanId || 'ep');
  // Weekend rules (advanced setting). Hotelier toggles which days count
  // as weekend and the uplift % applied on those days in Rates &
  // inventory. Defaults: Sat + Sun, +20%.
  const [weekendRules, setWeekendRules] = useState(
    property.weekendRules || { weekendDays: [0, 6], upliftPct: 20 }
  );
  // Named seasons. Each: { id, name, startIso, endIso, multiplierPct }.
  // Multiplier stacks with weekend uplift; per-day overrides still win.
  const [seasons, setSeasons] = useState(Array.isArray(property.seasons) ? property.seasons : []);
  // Per-channel markup % applied over the direct rate. Visible only on
  // Channels / Invoicing tiers. Non-zero values trigger a parity warning.
  const [channelMarkups, setChannelMarkups] = useState(
    property.channelMarkups || { direct: 0, mmt: 0, goibibo: 0, booking: 0, agoda: 0, airbnb: 0 }
  );
  // Per-OTA commission % the hotelier loses to each channel. Defaults
  // mirror DEFAULT_CHANNEL_COMMISSIONS from data.js; hoteliers override
  // to match their actual contract. Powers the Take-home card in Reports.
  const [channelCommissions, setChannelCommissions] = useState(
    property.channelCommissions || { direct: 0, mmt: 18, goibibo: 15, booking: 15, agoda: 18, airbnb: 3 }
  );
  // Rate plans: Standard / Flexible / Non-refundable etc. Each plan has
  // a multiplier and a cancellation tier that the booking flow surfaces
  // when more than one plan is enabled.
  const [ratePlans, setRatePlans] = useState(
    Array.isArray(property.ratePlans) ? property.ratePlans : [
      { id: 'standard', label: 'Standard', multiplierPct: 0, cancellation: 'flexible', refundHours: 48, enabled: true },
    ]
  );
  // Hotelier-configured discount codes. The public booking widget
  // accepts a code on Step 3 and applies the discount line in the
  // summary. Empty array by default; hotelier adds codes in the
  // dedicated accordion below.
  const [coupons, setCoupons] = useState(Array.isArray(property.coupons) ? property.coupons : []);
  // Hotelier-defined payment accounts for the daily close-out. Default
  // is the two legacy buckets (Cash + Digital) so an existing property
  // doesn't see any behaviour change until they customise.
  const [cashAccounts, setCashAccounts] = useState(
    Array.isArray(property.cashAccounts) && property.cashAccounts.length
      ? property.cashAccounts
      : [
          { id: 'cash',    label: 'Cash drawer',         kind: 'cash' },
          { id: 'digital', label: 'Digital (UPI / Card)', kind: 'upi' },
        ]
  );
  // Saved extras live at the App level (not on property), but the PropertyProfile
  // sheet edits them in-line and commits on Save. Local-state pattern mirrors
  // the other in-sheet collections so cancel-without-save discards changes.
  const [extras, setExtras] = useState(savedExtras);
  const [openCatAmenities, setOpenCatAmenities] = useState({});
  const [gstin, setGstin] = useState(property.gstin || '');
  const [accountant, setAccountant] = useState(property.accountant || { name: '', email: '', firm: '' });
  // Base adult capacity included in every room rate (typical: 2). Extra
  // adults above this count are charged at the per-category extraAdult
  // rate. Stored on property root for easy access in booking math.
  const [baseCapacityAdults, setBaseCapacityAdults] = useState(property.baseCapacityAdults ?? 2);
  // Per-FY invoice counter. We surface the current FY's counter as
  // "last invoice number issued" so a hotelier migrating from another
  // system can seed Atithi to continue from their existing sequence.
  const fy = currentFinancialYear();
  const [invoiceCounters, setInvoiceCounters] = useState(property.invoiceCounters || {});
  const currentSeq = invoiceCounters[fy] || 0;
  // Effective invoice prefix — recomputed from live accountant state so the
  // hint text updates as the hotelier types in the prefix field.
  const effectivePrefix = (accountant.invoicePrefix || '').trim().toUpperCase() || 'INV';
  // Theme is either a preset hue or a custom hex; only one is "active" at a
  // time. Mirror the saved shape so live-preview works exactly like save.
  const [theme, setThemeState] = useState(() => {
    if (property.theme?.color) return { color: property.theme.color };
    return { hue: property.theme?.hue ?? 38 };
  });
  // Accordion open/closed state for the 9 grouped sections of this sheet.
  // Branding + Basics start expanded (most-edited on first setup); the
  // rest stay collapsed so the sheet fits on roughly 1 phone screen.
  // All accordions start CLOSED. Earlier we opened Branding + Basics by
  // default to nudge first-run setup, but hoteliers reported that
  // having two big open sections + 9 closed ones created visual
  // confusion (asymmetric, hard to scan). Calm closed list is the
  // right default; the hotelier opens what they want to edit.
  const [openGroups, setOpenGroups] = useState({
    branding: false,
    basics: false,
    paymentQr: false,
    rooms: false,
    pricing: false,
    meals: false,
    accountant: false,
    bookingLink: false,
    coupons: false,
    teamMembers: false,
    teamAlerts: false,
    houseRules: false,
  });
  const toggleGroup = (key) => setOpenGroups(s => ({ ...s, [key]: !s[key] }));

  // Live-preview the picked theme colour so the hotelier sees how it'll look,
  // then revert to the saved theme if the sheet is closed without saving.
  useEffect(() => { applyTheme(theme); }, [theme]);
  useEffect(() => () => applyTheme(property.theme), [property.theme?.hue, property.theme?.color]);

  const addCustomAmenity = (a) => setCustomAmenities(arr => arr.some(x => x.id === a.id) ? arr : [...arr, a]);
  const removeCustomAmenity = (id) => {
    setCustomAmenities(arr => arr.filter(x => x.id !== id));
    setAmenityIds(arr => arr.filter(x => x !== id));
    setCategories(arr => arr.map(c => ({ ...c, amenityIds: (c.amenityIds || []).filter(x => x !== id) })));
  };


  // Inline upload error chip. Logo / QR / room photo / gallery photo
  // upload handlers all used native alert() before — which froze the
  // app, said "atithi-seven.vercel.app says:" in the browser chrome,
  // and looked like a security warning to a non-technical hotelier.
  // Now: write to uploadError state from each handler and the toast
  // surfaces at the top of the sheet for 4s.
  const [uploadError, setUploadError] = useState('');
  useEffect(() => {
    if (!uploadError) return;
    const id = setTimeout(() => setUploadError(''), 4000);
    return () => clearTimeout(id);
  }, [uploadError]);

  // Dirty-flag tracking for the unsaved-changes confirm. Every editor
  // surface in PropertyProfile (~25 distinct setters) writes through
  // its own local state; tracking changes manually for each would be
  // a nightmare. Easier: snapshot the initial property on mount, then
  // diff against current state on close. If anything differs and the
  // hotelier hits back without saving, confirm before navigating away.
  const initialSnapshotRef = useRef(null);
  useEffect(() => {
    initialSnapshotRef.current = JSON.stringify({
      profile, categories, rules, amenityIds, customAmenities,
      gstin: gstin.trim(), accountant, theme, invoiceCounters,
      mealPlans, defaultMealPlan, weekendRules, seasons, channelMarkups, channelCommissions, ratePlans, baseCapacityAdults,
      coupons, cashAccounts, customReminders, extras,
    });
    // Empty deps — capture the FIRST render's state as the baseline.
    // Subsequent renders compare against this snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const isDirty = () => {
    if (!initialSnapshotRef.current) return false;
    const current = JSON.stringify({
      profile, categories, rules, amenityIds, customAmenities,
      gstin: gstin.trim(), accountant, theme, invoiceCounters,
      mealPlans, defaultMealPlan, weekendRules, seasons, channelMarkups, channelCommissions, ratePlans, baseCapacityAdults,
      coupons, cashAccounts, customReminders, extras,
    });
    return current !== initialSnapshotRef.current;
  };
  const safeClose = () => {
    if (!isDirty()) { onClose(); return; }
    if (window.confirm("You have unsaved changes. Save before leaving?\n\nOK to save now and close, or Cancel to keep editing.")) {
      handleSave();
      // Give the save a moment to settle before closing. The sync
      // chip will flash, then we close.
      setTimeout(() => onClose(), 200);
    }
  };

  // Does the public widget anon-RLS migration exist in Supabase yet?
  // Drives whether we show the "Before sharing this link" amber
  // warning in the Booking link accordion. Three states:
  //   null     — check not yet completed (we assume not-live so the
  //              warning shows; flips quickly once Supabase answers)
  //   true     — migration is live, widget bookings reach cloud
  //   false    — migration not pasted yet, warning stays visible
  const [widgetRlsLive, setWidgetRlsLive] = useState(null);
  useEffect(() => {
    let cancelled = false;
    isWidgetRlsLive().then(live => { if (!cancelled) setWidgetRlsLive(live); });
    return () => { cancelled = true; };
  }, []);

  // Track the most-recently-added item id across the Seasons / Rate
  // plans / Coupons / Meal plans / Cash accounts editors. When set,
  // we scroll the matching row into view + focus its first input +
  // flash a brief green outline so the hotelier sees the Add button
  // actually did something (the add button sits at the bottom of
  // each list and the new row appears at the very end — easy to
  // miss without the scroll). Auto-clears after 2.5s.
  const [justAddedId, setJustAddedId] = useState(null);
  useEffect(() => {
    if (!justAddedId) return;
    // Defer one tick so the new row is in the DOM before we query.
    const tid = setTimeout(() => {
      const row = document.querySelector(`[data-added-id="${justAddedId}"]`);
      if (row) {
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const input = row.querySelector('input, select, textarea');
        if (input) {
          try { input.focus(); } catch {}
        }
      }
    }, 50);
    const clearId = setTimeout(() => setJustAddedId(null), 2500);
    return () => { clearTimeout(tid); clearTimeout(clearId); };
  }, [justAddedId]);
  // Helper: returns the highlight style for a row when it matches the
  // just-added id. Used as an inline ...spread on the row container.
  const justAddedStyle = (id) => id === justAddedId ? { outline: `2px solid ${T.ok}`, outlineOffset: 2, transition: 'outline 0.3s' } : {};
  // Saved-chip state: 'idle' (hidden), 'saving' (waiting for cloud
  // round-trip), 'ok' (3s green flash), 'err' (red persists till
  // dismiss or next save). Driven by the real sync state, not by an
  // immediate timer — the old version flashed "Saved · live" the
  // instant the local state changed, even if the cloud write later
  // failed. The hotelier would walk away thinking their change was
  // persisted; it wasn't.
  const sync = useSyncState();
  const [savePending, setSavePending] = useState(false);
  const [chip, setChip] = useState(null); // null | 'saving' | 'ok' | 'err'

  const handleSave = () => {
    // A room category with a blank name renders as "—" on the voucher + Diary.
    // Block the save and flag it rather than persist an unnamed room.
    if (categories.some(c => !String(c.name || '').trim())) {
      setChip('needName');
      setTimeout(() => setChip(c => (c === 'needName' ? null : c)), 3200);
      return;
    }
    // Custom child age bands must each have a name and ascending "under" ages
    // (only the last may be open-ended) — otherwise the steppers + voucher show
    // blank/impossible ranges like "12–11y".
    const cb = accountant.childBands;
    if (Array.isArray(cb) && cb.length) {
      let prevAge = 0, bandsOk = true;
      for (let k = 0; k < cb.length; k++) {
        if (!String(cb[k].label || '').trim()) { bandsOk = false; break; }
        const a = cb[k].maxAge;
        if (a == null) { if (k !== cb.length - 1) { bandsOk = false; break; } continue; }
        if (a <= prevAge) { bandsOk = false; break; }
        prevAge = a;
      }
      if (!bandsOk) {
        setChip('needBands');
        setTimeout(() => setChip(c => (c === 'needBands' ? null : c)), 3600);
        return;
      }
    }
    // Functional update so we don't accidentally clobber any property fields
    // we don't know about (the partial here only enumerates the editable ones).
    onSave(prev => ({
      ...prev,
      profile, categories, rules, amenityIds, customAmenities,
      gstin: gstin.trim(),
      // Merge customReminders into accountant jsonb (round-trips to
      // properties.accountant column without a migration).
      // Merge the LATEST accountant (prev.accountant) UNDER the local edits, so
      // subfields written after this sheet opened — e.g. AIOSELL aiosellSync that
      // the auto-sync stamps, or AdvancedSettings' minNights/singleRates — aren't
      // clobbered by the sign-in-time snapshot.
      accountant: { ...(prev.accountant || {}), ...accountant, customReminders },
      theme, invoiceCounters,
      mealPlans, defaultMealPlanId: defaultMealPlan, weekendRules, seasons, channelMarkups, channelCommissions, ratePlans, baseCapacityAdults,
      coupons,
      cashAccounts,
    }));
    // Saved extras live outside `property` so they go through their own setter.
    if (onChangeSavedExtras) onChangeSavedExtras(extras);
    // DEMO / local-only (no signed-in cloud session): the save is
    // synchronous localStorage — there's no cloud round-trip to wait
    // for, so the sync-driven state machine below would never resolve
    // and the chip would hang on "Saving…" forever. Show "Saved"
    // immediately instead.
    if (!session || !propertyId) {
      setChip('ok');
      setSavePending(false);
      setTimeout(() => setChip(null), 2500);
      return;
    }
    // Cloud mode — hand off to the sync-driven state machine.
    setSavePending(true);
    setChip('saving');
  };
  // Watch the global sync state. The App.jsx debounced property-save
  // (600ms after the state change) flips sync.status to 'syncing' →
  // 'ok' or 'error'. We mirror that into our local chip so the
  // hotelier sees "Saving…" then either "Saved" or "Couldn't save".
  // Safety net: if savePending is set but no sync transition arrives
  // within 4s (e.g. the property diff was a no-op so App.jsx's
  // debounced effect fired but the value was identical), fall back to
  // showing "Saved" so the chip never hangs.
  useEffect(() => {
    if (!savePending) return;
    if (sync.status === 'syncing') { setChip('saving'); return; }
    if (sync.status === 'ok') {
      setChip('ok');
      setSavePending(false);
      const id = setTimeout(() => setChip(null), 3000);
      return () => clearTimeout(id);
    }
    if (sync.status === 'error' && sync.lastError) {
      setChip('err');
      setSavePending(false);
      return;
    }
    // Idle / unchanged — fall back after 4s so the chip never sticks.
    const fallback = setTimeout(() => {
      setChip('ok');
      setSavePending(false);
      setTimeout(() => setChip(null), 2000);
    }, 4000);
    return () => clearTimeout(fallback);
  }, [sync.status, sync.lastError, savePending]);
  const propTypes = [
    { id: 'resort',     label: t('ptResort') },
    { id: 'hotel',      label: t('ptHotel') },
    { id: 'homestay',   label: t('ptHomestay') },
    { id: 'villa',      label: t('ptVilla') },
    { id: 'guesthouse', label: t('ptGuesthouse') },
  ];
  return (
    <div style={{ position: 'absolute', inset: 0, background: T.bg, zIndex: 40, display: 'flex', flexDirection: 'column' }}>
      <ScreenHeader title={t('propertyProfile')} onBack={safeClose} right={<Btn size="sm" icon="check" onClick={handleSave}>{t('save')}</Btn>} />
      {uploadError && (
        <div style={{
          position: 'absolute', top: 60, left: 12, right: 12,
          display: 'flex', justifyContent: 'center', zIndex: 51,
        }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '9px 14px', borderRadius: 10,
            background: T.danger, color: '#fff',
            fontSize: 12, fontWeight: 700, lineHeight: 1.4,
            boxShadow: '0 6px 18px rgba(20,15,10,.18)', maxWidth: 480,
          }}>
            <Icon name="info" size={13} color="#fff" stroke={2.4} />
            <span style={{ flex: 1 }}>{uploadError}</span>
            <button onClick={() => setUploadError('')} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>×</button>
          </div>
        </div>
      )}
      {chip && (
        <div style={{
          position: 'absolute', top: 60, left: 0, right: 0,
          display: 'flex', justifyContent: 'center', zIndex: 50,
          pointerEvents: chip === 'err' ? 'auto' : 'none',
        }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '7px 14px', borderRadius: 999,
            background: chip === 'ok' ? T.ok : chip === 'err' ? T.danger : T.ink2,
            color: '#fff',
            fontSize: 12, fontWeight: 700, letterSpacing: 0.2,
            boxShadow: '0 4px 14px rgba(20, 15, 10, 0.2)',
          }}>
            {chip === 'saving' && <><Icon name="sync" size={12} color="#fff" className="spin" /> Saving to cloud…</>}
            {chip === 'ok' && <><Icon name="check" size={13} color="#fff" stroke={2.4} /> Saved · live across your devices</>}
            {chip === 'needMeal' && <><Icon name="info" size={13} color="#fff" stroke={2.4} /> Keep at least one meal plan enabled</>}
            {chip === 'needName' && <><Icon name="info" size={13} color="#fff" stroke={2.4} /> Give every room category a name first</>}
            {chip === 'needBands' && <><Icon name="info" size={13} color="#fff" stroke={2.4} /> Name each age band; ages must go youngest → oldest</>}
            {chip === 'err' && (
              <>
                <Icon name="info" size={13} color="#fff" stroke={2.4} />
                Couldn't save — check your internet, then Save again
                <button onClick={() => setChip(null)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', borderRadius: 4, padding: '2px 8px', marginLeft: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>×</button>
              </>
            )}
          </div>
        </div>
      )}
      <div style={{ flex: 1, overflow: 'auto', padding: 14, paddingBottom: 80 }}>

        <AccordionGroup title="Branding" open={openGroups.branding} onToggle={() => toggleGroup('branding')}>
        <SectionHead title={t('logo')} style={{ marginTop: 0 }} />
        <Card padding={14}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 72, height: 72, borderRadius: 14, background: T.card, padding: 4, boxShadow: '0 2px 8px rgba(0,0,0,.08)', border: `1px dashed ${T.border}`, flexShrink: 0 }}>
              {profile.logoDataUrl ? (
                <img
                  src={profile.logoDataUrl}
                  alt="Property logo"
                  style={{ width: '100%', height: '100%', borderRadius: 10, objectFit: 'contain', background: '#fff' }}
                />
              ) : (
                <div style={{ width: '100%', height: '100%', borderRadius: 10, background: `repeating-linear-gradient(45deg, ${T.tagSaffron} 0 6px, oklch(80% 0.10 65) 6px 12px)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, color: 'rgba(0,0,0,0.4)', fontWeight: 800 }}>{(profile.name || 'Y').trim().charAt(0).toUpperCase()}</div>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.ink }}>
                {profile.logoDataUrl ? 'Logo uploaded' : 'Default logo'}
              </div>
              <div style={{ fontSize: 10.5, color: T.ink3, marginTop: 2, lineHeight: 1.4 }}>
                PNG, JPEG or SVG · square works best · under 200 KB
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                {/* Inline base64 upload — same pattern as the Payment QR
                    field. Stored on property.profile.logoDataUrl. Will
                    render on the voucher header in a follow-up. */}
                <label
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', border: `1px solid ${T.border}`, borderRadius: 7, background: T.card, color: T.ink2, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                >
                  <Icon name={profile.logoDataUrl ? 'edit' : 'upload'} size={11} stroke={2.2} /> {profile.logoDataUrl ? 'Replace' : t('changeLogo')}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const file = e.target.files && e.target.files[0];
                      if (!file) return;
                      if (file.size > 200 * 1024) {
                        setUploadError('Logo is too large. Please use an image under 200 KB.');
                        return;
                      }
                      // Upload to Storage (CDN URL) when signed in; base64 fallback in demo.
                      const old = profile.logoDataUrl;
                      uploadPropertyMedia(propertyId, file, 'logo').then(url => {
                        // Delete the previous object if the replacement landed at a different path (ext change).
                        if (url && mediaPathOf(old) && mediaPathOf(old) !== mediaPathOf(url)) deletePropertyMedia(old);
                        setProfile(p => ({ ...p, logoDataUrl: url }));
                      });
                    }}
                  />
                </label>
                {profile.logoDataUrl && (
                  <button
                    onClick={() => { deletePropertyMedia(profile.logoDataUrl); setProfile({ ...profile, logoDataUrl: '' }); }}
                    style={{ padding: '5px 10px', border: `1px solid ${T.border}`, borderRadius: 7, background: T.card, color: T.danger, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          </div>
        </Card>

        <SectionHead title="Brand colour" style={{ marginTop: 16 }} />
        <Card padding={14}>
          <div style={{ fontSize: 10.5, color: T.ink3, fontWeight: 600, lineHeight: 1.4, marginBottom: 10 }}>
            Sets the accent colour used across the app and on the vouchers / invoices you send guests. Tap a preset or pick any colour you like — preview is live.
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {THEME_PRESETS.map(preset => {
              const active = theme.hue === preset.hue && !theme.color;
              return (
                <button
                  key={preset.id}
                  onClick={() => setThemeState({ hue: preset.hue })}
                  className="atithi-tap"
                  aria-label={`Brand colour ${preset.label}`}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 7,
                    padding: '6px 10px 6px 6px', borderRadius: 999,
                    border: `1.5px solid ${active ? preset.swatch : T.border}`,
                    background: active ? `color-mix(in oklch, ${preset.swatch} 10%, white)` : T.card,
                    color: active ? preset.swatch : T.ink2,
                    fontSize: 11, fontWeight: 700, cursor: 'pointer',
                  }}
                >
                  <span style={{
                    width: 20, height: 20, borderRadius: '50%', background: preset.swatch,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    border: '1.5px solid white',
                    boxShadow: '0 0 0 1px rgba(0,0,0,0.08)',
                  }}>
                    {active && <Icon name="check" size={11} color="#fff" stroke={3} />}
                  </span>
                  {preset.label}
                </button>
              );
            })}

            {/* Custom colour — opens the OS-native colour picker. Live-updates
                theme.color as the user moves through the picker. */}
            <label
              className="atithi-tap"
              aria-label="Pick any custom colour"
              style={{
                position: 'relative',
                display: 'inline-flex', alignItems: 'center', gap: 7,
                padding: '6px 10px 6px 6px', borderRadius: 999,
                border: `1.5px solid ${theme.color ? theme.color : T.border}`,
                background: theme.color ? `color-mix(in oklch, ${theme.color} 10%, white)` : T.card,
                color: theme.color ? theme.color : T.ink2,
                fontSize: 11, fontWeight: 700, cursor: 'pointer',
              }}
            >
              <input
                type="color"
                value={theme.color || '#c8553d'}
                onChange={(e) => setThemeState({ color: e.target.value })}
                style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%', cursor: 'pointer', border: 'none', padding: 0 }}
              />
              <span style={{
                width: 20, height: 20, borderRadius: '50%',
                background: theme.color || 'conic-gradient(from 0deg, #ff5e62, #ffd93d, #6bcf7f, #4ecdc4, #5f7adb, #c44edb, #ff5e62)',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                border: '1.5px solid white',
                boxShadow: '0 0 0 1px rgba(0,0,0,0.08)',
              }}>
                {theme.color && <Icon name="check" size={11} color="#fff" stroke={3} />}
              </span>
              {theme.color ? `Custom ${theme.color.toUpperCase()}` : 'Custom colour'}
            </label>
          </div>
        </Card>

        <SectionHead title="Property tagline" style={{ marginTop: 16 }} />
        <Card padding={14}>
          <div style={{ fontSize: 10.5, color: T.ink3, fontWeight: 600, lineHeight: 1.4, marginBottom: 8 }}>
            One short sentence shown on the booking widget header. Keep it under ~120 characters — e.g. "Luxury desert tents 40 km from Jaisalmer fort" or "Family-run beach resort on Goa's north coast".
          </div>
          <input
            value={profile.tagline || ''}
            onChange={(e) => setProfile({ ...profile, tagline: e.target.value.slice(0, 140) })}
            placeholder="One-line property pitch"
            maxLength={140}
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: '9px 12px', fontSize: 13, fontWeight: 600, color: T.ink,
              border: `1px solid ${T.border}`, borderRadius: 8, background: T.card,
              outline: 'none',
            }}
          />
          {profile.tagline && (
            <div style={{ fontSize: 9.5, color: T.ink3, fontWeight: 600, marginTop: 4, textAlign: 'right' }}>
              {profile.tagline.length}/140
            </div>
          )}
        </Card>

        <SectionHead title="Property photo gallery" style={{ marginTop: 16 }} />
        <Card padding={14}>
          <div style={{ fontSize: 10.5, color: T.ink3, fontWeight: 600, lineHeight: 1.4, marginBottom: 10 }}>
            Up to 5 photos of your property — grounds, common areas, sunset views. Shown on the widget's first screen so guests get a feel before picking a room. JPG / PNG, up to 2 MB each.
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {(profile.photoGallery || []).map((url, i) => (
              <div key={i} style={{
                position: 'relative', width: 88, height: 88, borderRadius: 8,
                background: T.card, border: `1px solid ${T.borderSoft}`,
                overflow: 'hidden', flexShrink: 0,
              }}>
                <img src={url} alt="Property" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                <button
                  onClick={() => { deletePropertyMedia(url); setProfile({ ...profile, photoGallery: (profile.photoGallery || []).filter((_, j) => j !== i) }); }}
                  title="Remove this photo"
                  style={{
                    position: 'absolute', top: 4, right: 4,
                    width: 22, height: 22, borderRadius: '50%',
                    border: 'none', background: 'rgba(0,0,0,0.6)', color: '#fff',
                    fontSize: 14, fontWeight: 700, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >×</button>
              </div>
            ))}
            {(profile.photoGallery || []).length < 5 && (
              <label style={{
                width: 88, height: 88, borderRadius: 8,
                border: `1.5px dashed ${T.border}`, background: T.bgSoft,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: T.ink3,
                flexDirection: 'column', gap: 4, fontSize: 10, fontWeight: 700,
              }}>
                <Icon name="plus" size={18} color={T.ink3} />
                Add photo
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const file = e.target.files && e.target.files[0];
                    if (!file) return;
                    // 2 MB cap — gives room for a high-quality JPEG
                    // (~4000×3000 at quality 0.85) while keeping the
                    // property row + localStorage within sane bounds.
                    if (file.size > 2 * 1024 * 1024) {
                      setUploadError('Photo is too large. Please use an image under 2 MB.');
                      return;
                    }
                    // Gallery images each keep their own object (unique name).
                    uploadPropertyMedia(propertyId, file, 'gallery', { unique: true }).then(url => {
                      if (url) setProfile(p => ({ ...p, photoGallery: [...(p.photoGallery || []), url] }));
                    });
                  }}
                />
              </label>
            )}
          </div>
        </Card>
        </AccordionGroup>

        <AccordionGroup title="Basics" open={openGroups.basics} onToggle={() => toggleGroup('basics')}>
        <SectionHead title="Basics" style={{ marginTop: 0 }} />
        <Card padding={14}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Field label={t('propertyName')} value={profile.name} onChange={e => setProfile({ ...profile, name: e.target.value })} />
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: T.ink2, marginBottom: 6, display: 'block' }}>{t('propertyType')}</label>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                {propTypes.map(pt => (
                  <button key={pt.id} onClick={() => setProfile({ ...profile, type: pt.id })} style={{
                    padding: '6px 11px', borderRadius: 999,
                    border: `1.5px solid ${profile.type === pt.id ? T.primary : T.border}`,
                    background: profile.type === pt.id ? T.primaryLt : T.card,
                    color: profile.type === pt.id ? T.primaryDk : T.ink2,
                    fontSize: 11, fontWeight: 700, cursor: 'pointer',
                  }}>{pt.label}</button>
                ))}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <Field label={t('checkInTime')} value={profile.checkIn} onChange={e => setProfile({ ...profile, checkIn: e.target.value })} />
              <Field label={t('checkOutTime')} value={profile.checkOut} onChange={e => setProfile({ ...profile, checkOut: e.target.value })} />
            </div>
          </div>
        </Card>

        <SectionHead title={t('address')} style={{ marginTop: 16 }} />
        <Card padding={14}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Field label={t('address')} value={profile.address} onChange={e => setProfile({ ...profile, address: e.target.value })} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <Field label={t('city')} value={profile.city} onChange={e => setProfile({ ...profile, city: e.target.value })} />
              <Field label={t('pincode')} value={profile.pincode} onChange={e => setProfile({ ...profile, pincode: e.target.value })} />
            </div>
            <Field label={t('state')} value={profile.state} onChange={e => setProfile({ ...profile, state: e.target.value })} />
            <Field
              label="Landmark / area"
              value={profile.landmark || ''}
              onChange={e => setProfile({ ...profile, landmark: e.target.value })}
              placeholder="e.g. 200m from Sam Sand Dunes"
              hint="Shown on the booking voucher to help guests find you."
            />
            <Field
              label="Google Maps link"
              value={profile.mapUrl || ''}
              onChange={e => setProfile({ ...profile, mapUrl: e.target.value })}
              placeholder="https://maps.google.com/?q=…"
              prefix={<Icon name="flag" size={12} color={T.ink3} />}
              hint="Paste a Google Maps share link. Appears as 'View on map' on the voucher."
            />
          </div>
        </Card>

        <SectionHead title="Contact" style={{ marginTop: 16 }} />
        <Card padding={14}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Field label={t('contactPhone')} type="tel" inputMode="tel" maxLength={18} value={profile.phone} onChange={e => setProfile({ ...profile, phone: e.target.value.replace(/[^\d+\-() ]/g, '').slice(0, 18) })} />
            <Field label={t('contactEmail')} value={profile.email} onChange={e => setProfile({ ...profile, email: e.target.value })} />
            <Field label={t('website')} value={profile.website} onChange={e => setProfile({ ...profile, website: e.target.value })} prefix="https://" />
          </div>
        </Card>
        </AccordionGroup>

        <AccordionGroup title="Payment QR" open={openGroups.paymentQr} onToggle={() => toggleGroup('paymentQr')} hint={profile.paymentQrDataUrl ? 'Uploaded' : 'Not uploaded'}>
        <SectionHead title="Payment QR" style={{ marginTop: 0 }} />
        <Card padding={14}>
          <div style={{ fontSize: 11, color: T.ink3, fontWeight: 600, lineHeight: 1.5, marginBottom: 10 }}>
            Upload your UPI / payment QR. It'll appear on the reservation voucher under "Scan to pay" so guests can pay directly. PNG or JPEG, square works best.
          </div>
          {profile.paymentQrDataUrl ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <img
                src={profile.paymentQrDataUrl}
                alt="Payment QR"
                style={{ width: 96, height: 96, borderRadius: 10, border: `1px solid ${T.borderSoft}`, objectFit: 'contain', background: '#fff' }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.ok, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Icon name="check" size={12} color={T.ok} /> QR uploaded
                </div>
                <input
                  value={profile.paymentQrLabel || ''}
                  onChange={e => setProfile({ ...profile, paymentQrLabel: e.target.value })}
                  placeholder="Caption (optional) — e.g. yatra@upi"
                  style={{ width: '100%', boxSizing: 'border-box', marginTop: 8, border: `1px solid ${T.border}`, outline: 'none', borderRadius: 7, padding: '6px 8px', fontSize: 12, color: T.ink, background: T.card }}
                />
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  <label
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', border: `1px solid ${T.border}`, borderRadius: 7, background: T.card, color: T.ink2, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                  >
                    <Icon name="edit" size={11} stroke={2.2} /> Replace
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      style={{ display: 'none' }}
                      onChange={e => {
                        const file = e.target.files && e.target.files[0];
                        if (!file) return;
                        if (file.size > 700 * 1024) {
                          setUploadError('Image is too large. Please use a QR under 700 KB.');
                          return;
                        }
                        const old = profile.paymentQrDataUrl;
                        uploadPropertyMedia(propertyId, file, 'payment-qr').then(url => {
                          if (url && mediaPathOf(old) && mediaPathOf(old) !== mediaPathOf(url)) deletePropertyMedia(old);
                          setProfile(p => ({ ...p, paymentQrDataUrl: url }));
                        });
                      }}
                    />
                  </label>
                  <button
                    onClick={() => { deletePropertyMedia(profile.paymentQrDataUrl); setProfile({ ...profile, paymentQrDataUrl: '', paymentQrLabel: '' }); }}
                    style={{ padding: '5px 10px', border: `1px solid ${T.border}`, borderRadius: 7, background: T.card, color: T.danger, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <label
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '20px 14px', border: `1.5px dashed ${T.border}`, borderRadius: 10, background: T.bgSoft, color: T.ink3, cursor: 'pointer' }}
            >
              <Icon name="plus" size={14} color={T.primary} stroke={2.2} />
              <span style={{ fontSize: 12, fontWeight: 700, color: T.primary }}>Upload payment QR</span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                style={{ display: 'none' }}
                onChange={e => {
                  const file = e.target.files && e.target.files[0];
                  if (!file) return;
                  if (file.size > 700 * 1024) {
                    setUploadError('Image is too large. Please use a QR under 700 KB.');
                    return;
                  }
                  uploadPropertyMedia(propertyId, file, 'payment-qr').then(url => setProfile(p => ({ ...p, paymentQrDataUrl: url })));
                }}
              />
            </label>
          )}
        </Card>
        </AccordionGroup>

        <AccordionGroup title="Rooms + amenities" open={openGroups.rooms} onToggle={() => toggleGroup('rooms')} hint={`${categories.length} ${categories.length === 1 ? 'category' : 'categories'}`}>
        <SectionHead title={t('roomCategories')} style={{ marginTop: 0 }} action={
          <button onClick={() => setCategories(c => [...c, { id: 'new-' + Date.now(), name: 'New category', units: 1, base: 3000, amenityIds: [] }])} style={{ background: 'none', border: 'none', color: T.primary, fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Icon name="plus" size={11} stroke={2.2} /> {t('addCategory')}
          </button>
        } />
        <Card padding={0}>
          {categories.map((c, i, arr) => {
            const catAmen = c.amenityIds || [];
            const open = !!openCatAmenities[c.id];
            return (
              <div key={c.id} style={{ padding: 12, borderBottom: i < arr.length - 1 ? `1px solid ${T.borderSoft}` : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input value={c.name} onChange={e => setCategories(arr => arr.map(x => x.id === c.id ? { ...x, name: e.target.value } : x))} style={{ flex: 1, border: `1px solid ${T.borderSoft}`, outline: 'none', borderRadius: 7, padding: '6px 8px', fontSize: 13, fontWeight: 700, color: T.ink, background: T.card }} />
                  <button onClick={() => {
                    // R10-D2: deleting a category that still has live bookings
                    // orphans them (they lose their room type → show "—" and
                    // fall out of availability/occupancy). Warn with the count.
                    const inUse = (bookings || []).filter(b => b.status !== 'cancelled' && (b.roomTypeId === c.id || (Array.isArray(b.roomItems) && b.roomItems.some(ri => ri.roomTypeId === c.id)))).length;
                    const msg = inUse > 0
                      ? `${inUse} active booking${inUse > 1 ? 's' : ''} still use "${c.name || 'this room type'}". Deleting it leaves them without a room type (they'll show "—" and drop out of availability). Delete anyway?`
                      : `Delete room category "${c.name || 'this room type'}"?`;
                    if (window.confirm(msg)) { deletePropertyMedia(c.photoDataUrl); setCategories(arr => arr.filter(x => x.id !== c.id)); }
                  }} style={{ background: 'none', border: 'none', color: T.ink3, cursor: 'pointer' }}><Icon name="x" size={13} /></button>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, background: T.bgSoft, border: `1px solid ${T.borderSoft}`, borderRadius: 7, padding: '6px 8px' }}>
                    <span style={{ fontSize: 10, color: T.ink3, fontWeight: 600 }}>{t('units')}:</span>
                    <NumberInput value={c.units} min={1} onChange={(n) => setCategories(arr => arr.map(x => x.id === c.id ? { ...x, units: n } : x))} className="tnum" style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 13, fontWeight: 700, color: T.ink, minWidth: 0 }} />
                  </div>
                  <div style={{ flex: 1.4, display: 'flex', alignItems: 'center', gap: 4, background: T.bgSoft, border: `1px solid ${T.borderSoft}`, borderRadius: 7, padding: '6px 8px' }}>
                    <span style={{ fontSize: 10, color: T.ink3, fontWeight: 600 }}>{t('baseRateLabel')}: ₹</span>
                    <NumberInput value={c.base} min={0} onChange={(n) => setCategories(arr => arr.map(x => x.id === c.id ? { ...x, base: n } : x))} className="tnum" style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 13, fontWeight: 700, color: T.ink, minWidth: 0 }} />
                  </div>
                </div>
                {/* GST rate for this category. Auto-picked from the slab
                    based on the base rate; hotelier can override if their
                    CA has advised otherwise. */}
                {(() => {
                  const slab = gstSlabFor(c.base || 0);
                  const isOverridden = typeof c.gstRate === 'number';
                  const effective = isOverridden ? c.gstRate : slab.rate;
                  return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, padding: '6px 8px', background: T.indigoLt, borderRadius: 7 }}>
                      <span style={{ fontSize: 10, color: T.indigo, fontWeight: 700 }}>GST:</span>
                      <NumberInput
                        value={effective}
                        min={0} max={28}
                        onChange={(n) => setCategories(arr => arr.map(x => x.id === c.id ? { ...x, gstRate: n } : x))}
                        className="tnum"
                        style={{ width: 50, border: `1px solid ${T.indigo}`, outline: 'none', background: T.card, borderRadius: 5, padding: '3px 6px', fontSize: 12, fontWeight: 700, color: T.indigo }}
                      />
                      <span style={{ fontSize: 10, color: T.indigo, fontWeight: 600 }}>%</span>
                      <span style={{ flex: 1, fontSize: 10, color: T.ink3, fontWeight: 600, marginLeft: 4 }}>
                        {isOverridden ? 'manual override' : `auto · slab ${slab.note}`}
                      </span>
                      {isOverridden && (
                        <button
                          onClick={() => setCategories(arr => arr.map(x => x.id === c.id ? { ...x, gstRate: null } : x))}
                          style={{ background: 'none', border: 'none', color: T.ink3, fontSize: 10, fontWeight: 600, cursor: 'pointer' }}
                        >
                          Reset
                        </button>
                      )}
                    </div>
                  );
                })()}
                {/* Per-category extra-adult / extra-child rates. The owner
                    chose a "per category, ₹ flat or % of base" model so
                    different room types can have different surcharges
                    (e.g. luxury tents charge more for an extra adult). */}
                {(() => {
                  const ea = c.extraAdult || { mode: 'flat', value: 0 };
                  const updateRule = (key, patch) => setCategories(arr => arr.map(x => x.id === c.id ? { ...x, [key]: { ...(x[key] || { mode: 'flat', value: 0 }), ...patch } } : x));
                  const modeBtn = (rule, mode, label) => {
                    const sel = (c[rule]?.mode || 'flat') === mode;
                    return (
                      <button
                        onClick={() => updateRule(rule, { mode })}
                        style={{
                          // Sliding-segmented-control feel: selected gets
                          // bold indigo background + check icon + shadow.
                          // Unselected stays muted with no fill so the
                          // contrast between "this is active" and "this
                          // is the alternative" reads at a glance.
                          padding: '5px 10px', borderRadius: 6, cursor: 'pointer',
                          border: `1.5px solid ${sel ? T.indigo : T.border}`,
                          background: sel ? T.indigo : T.card,
                          color: sel ? '#fff' : T.ink3,
                          fontSize: 10.5, fontWeight: 800, letterSpacing: 0.2,
                          boxShadow: sel ? '0 1px 3px rgba(70,80,180,0.25)' : 'none',
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                        }}
                      >
                        {sel && <Icon name="check" size={10} color="#fff" stroke={3} />}
                        {label}
                      </button>
                    );
                  };
                  const previewFor = (rule) => {
                    const r = c[rule];
                    if (!r || !r.value) return null;
                    if (r.mode === 'pct') return `₹${Math.round((c.base || 0) * (+r.value) / 100).toLocaleString('en-IN')}`;
                    return `₹${(+r.value).toLocaleString('en-IN')}`;
                  };
                  const bands = effectiveChildBands({ accountant });
                  const catChildRates = (accountant.childRatesByCategory && accountant.childRatesByCategory[c.id]) || {};
                  const setChildRate = (bandId, patch) => setAccountant(a => {
                    const all = a.childRatesByCategory || {};
                    const forCat = all[c.id] || {};
                    const cur = forCat[bandId] || { mode: 'free', value: 0 };
                    return { ...a, childRatesByCategory: { ...all, [c.id]: { ...forCat, [bandId]: { ...cur, ...patch } } } };
                  });
                  const childModeBtn = (bandId, cur, mode, label) => {
                    const sel = (cur.mode || 'free') === mode;
                    return (
                      <button onClick={() => setChildRate(bandId, { mode })} style={{ padding: '4px 8px', borderRadius: 6, cursor: 'pointer', border: `1.5px solid ${sel ? T.indigo : T.border}`, background: sel ? T.indigo : T.card, color: sel ? '#fff' : T.ink3, fontSize: 10, fontWeight: 800, letterSpacing: 0.2, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                        {sel && <Icon name="check" size={9} color="#fff" stroke={3} />}{label}
                      </button>
                    );
                  };
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8, padding: '8px 10px', background: T.bgSoft, borderRadius: 7, border: `1px solid ${T.borderSoft}` }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: T.ink3, letterSpacing: 0.3, textTransform: 'uppercase' }}>Extra-guest pricing</div>
                      {/* Extra adult */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 10.5, color: T.ink2, fontWeight: 600, minWidth: 76 }}>Extra adult</span>
                        <div style={{ display: 'inline-flex', gap: 3 }}>
                          {modeBtn('extraAdult', 'flat', '₹')}
                          {modeBtn('extraAdult', 'pct', '% of base')}
                        </div>
                        <NumberInput min={0} value={ea.value || 0} onChange={(n) => updateRule('extraAdult', { value: n })} className="tnum" style={{ width: 70, border: `1px solid ${T.border}`, outline: 'none', borderRadius: 5, padding: '3px 6px', fontSize: 11, fontWeight: 700, color: T.ink, background: T.card }} />
                        <span style={{ fontSize: 9, color: T.ink3, fontWeight: 600 }}>per night</span>
                        {previewFor('extraAdult') && (<span style={{ marginLeft: 'auto', fontSize: 9, color: T.indigo, fontWeight: 700 }}>≈ {previewFor('extraAdult')}/night</span>)}
                      </div>
                      {/* Extra child — one price per age band */}
                      <div style={{ fontSize: 9, fontWeight: 700, color: T.ink3, letterSpacing: 0.3, textTransform: 'uppercase', marginTop: 2 }}>Extra child · per age band</div>
                      {bands.map(band => {
                        const cur = catChildRates[band.id] || { mode: 'free', value: 0 };
                        const prev = cur.mode === 'pct' ? `₹${Math.round((c.base || 0) * (+cur.value || 0) / 100).toLocaleString('en-IN')}` : `₹${(+cur.value || 0).toLocaleString('en-IN')}`;
                        return (
                          <div key={band.id} style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 10.5, color: T.ink2, fontWeight: 600, minWidth: 76, maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{band.label || '—'}</span>
                            <div style={{ display: 'inline-flex', gap: 3 }}>
                              {childModeBtn(band.id, cur, 'free', 'Free')}
                              {childModeBtn(band.id, cur, 'flat', '₹')}
                              {childModeBtn(band.id, cur, 'pct', '% of base')}
                            </div>
                            {cur.mode !== 'free' && (
                              <NumberInput min={0} value={cur.value || 0} onChange={(n) => setChildRate(band.id, { value: n })} className="tnum" style={{ width: 70, border: `1px solid ${T.border}`, outline: 'none', borderRadius: 5, padding: '3px 6px', fontSize: 11, fontWeight: 700, color: T.ink, background: T.card }} />
                            )}
                            {cur.mode !== 'free' && <span style={{ fontSize: 9, color: T.ink3, fontWeight: 600 }}>per night</span>}
                            <span style={{ marginLeft: 'auto', fontSize: 9, color: cur.mode === 'free' ? T.ok : T.indigo, fontWeight: 700 }}>{cur.mode === 'free' ? 'Free' : `≈ ${prev}/night`}</span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
                {/* Room hero image — single high-quality photo per
                    category shown on the public widget room tile and
                    on the booking voucher. 2 MB cap to leave headroom
                    for a quality JPEG without blowing past localStorage
                    when DEMO_MODE is on. */}
                <div style={{ marginTop: 8, padding: '8px 10px', background: T.bgSoft, borderRadius: 7, border: `1px solid ${T.borderSoft}` }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: T.ink3, letterSpacing: 0.3, textTransform: 'uppercase', marginBottom: 6 }}>Room photo</div>
                  {c.photoDataUrl ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <img src={c.photoDataUrl} alt={c.name} style={{ width: 90, height: 64, borderRadius: 6, objectFit: 'cover', background: T.card, border: `1px solid ${T.borderSoft}`, flexShrink: 0 }} />
                      <div style={{ display: 'flex', gap: 6 }}>
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', border: `1px solid ${T.border}`, borderRadius: 6, background: T.card, color: T.ink2, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                          <Icon name="edit" size={11} stroke={2.2} /> Replace
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            style={{ display: 'none' }}
                            onChange={(e) => {
                              const file = e.target.files && e.target.files[0];
                              if (!file) return;
                              if (file.size > 2 * 1024 * 1024) {
                                setUploadError('Photo is too large. Please use an image under 2 MB.');
                                return;
                              }
                              const old = c.photoDataUrl;
                              uploadPropertyMedia(propertyId, file, 'room-' + c.id).then(url => {
                                if (url && mediaPathOf(old) && mediaPathOf(old) !== mediaPathOf(url)) deletePropertyMedia(old);
                                setCategories(arr => arr.map(x => x.id === c.id ? { ...x, photoDataUrl: url } : x));
                              });
                            }}
                          />
                        </label>
                        <button
                          onClick={() => { deletePropertyMedia(c.photoDataUrl); setCategories(arr => arr.map(x => x.id === c.id ? { ...x, photoDataUrl: null } : x)); }}
                          style={{ padding: '5px 10px', border: `1px solid ${T.border}`, borderRadius: 6, background: T.card, color: T.danger, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                        >Remove</button>
                      </div>
                    </div>
                  ) : (
                    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 12px', border: `1.5px dashed ${T.border}`, borderRadius: 7, background: T.card, color: T.primary, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                      <Icon name="plus" size={12} color={T.primary} stroke={2.2} />
                      Upload room photo · up to 2 MB
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        style={{ display: 'none' }}
                        onChange={(e) => {
                          const file = e.target.files && e.target.files[0];
                          if (!file) return;
                          if (file.size > 2 * 1024 * 1024) {
                            setUploadError('Photo is too large. Please use an image under 2 MB.');
                            return;
                          }
                          uploadPropertyMedia(propertyId, file, 'room-' + c.id).then(url => setCategories(arr => arr.map(x => x.id === c.id ? { ...x, photoDataUrl: url } : x)));
                        }}
                      />
                    </label>
                  )}
                </div>
                <button
                  onClick={() => setOpenCatAmenities(s => ({ ...s, [c.id]: !s[c.id] }))}
                  style={{ marginTop: 8, background: 'none', border: 'none', color: T.primary, fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, padding: 0 }}
                >
                  <Icon name={open ? 'chevD' : 'chev'} size={11} stroke={2} />
                  Room amenities {catAmen.length > 0 && <span style={{ fontWeight: 600, color: T.ink3 }}>· {catAmen.length} picked</span>}
                </button>
                {open && (
                  <div style={{ marginTop: 8, padding: 10, background: T.bgSoft, borderRadius: 8, border: `1px solid ${T.borderSoft}` }}>
                    <AmenityPicker
                      selected={catAmen}
                      onChange={(ids) => setCategories(arr => arr.map(x => x.id === c.id ? { ...x, amenityIds: ids } : x))}
                      customAmenities={customAmenities}
                      compact
                    />
                    <div style={{ marginTop: 6, fontSize: 10, color: T.ink3, fontWeight: 600 }}>
                      Tip: add custom amenities from the property-wide list below so they're available here too.
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </Card>

        <SectionHead title={`Property-wide ${t('amenities').toLowerCase()}`} style={{ marginTop: 16 }} />
        <Card padding={12}>
          <div style={{ fontSize: 10.5, color: T.ink3, fontWeight: 600, lineHeight: 1.4, marginBottom: 10 }}>
            Pick what your property as a whole offers. Each room type's amenities live inside that category above.
          </div>
          <AmenityPicker
            selected={amenityIds}
            onChange={setAmenityIds}
            customAmenities={customAmenities}
            onAddCustom={addCustomAmenity}
            onRemoveCustom={removeCustomAmenity}
          />
        </Card>
        </AccordionGroup>

        <AccordionGroup title="Pricing rules" open={openGroups.pricing} onToggle={() => toggleGroup('pricing')}>
        <SectionHead title="Weekend rules" style={{ marginTop: 0 }} />
        <Card padding={12}>
          <div style={{ fontSize: 11, color: T.ink3, fontWeight: 600, lineHeight: 1.5, marginBottom: 10 }}>
            Pick which days count as weekend and how much extra you charge on them. Used in Rates & inventory to compute the default per-day rate. Per-day overrides always win.
          </div>
          <div style={{ fontSize: 10, color: T.ink3, fontWeight: 700, letterSpacing: 0.4, marginBottom: 6 }}>WEEKEND DAYS</div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 14 }}>
            {[
              { idx: 1, label: 'Mon' },
              { idx: 2, label: 'Tue' },
              { idx: 3, label: 'Wed' },
              { idx: 4, label: 'Thu' },
              { idx: 5, label: 'Fri' },
              { idx: 6, label: 'Sat' },
              { idx: 0, label: 'Sun' },
            ].map(d => {
              const on = (weekendRules.weekendDays || []).includes(d.idx);
              return (
                <button
                  key={d.idx}
                  onClick={() => setWeekendRules(prev => {
                    const set = new Set(prev.weekendDays || []);
                    if (set.has(d.idx)) set.delete(d.idx); else set.add(d.idx);
                    return { ...prev, weekendDays: [...set].sort() };
                  })}
                  className="atithi-tap"
                  style={{
                    padding: '6px 12px', borderRadius: 999, cursor: 'pointer',
                    border: `1.5px solid ${on ? T.primary : T.border}`,
                    background: on ? T.primaryLt : T.card,
                    color: on ? T.primaryDk : T.ink2,
                    fontSize: 11, fontWeight: 700, letterSpacing: 0.2,
                  }}
                >{d.label}</button>
              );
            })}
          </div>
          <div style={{ fontSize: 10, color: T.ink3, fontWeight: 700, letterSpacing: 0.4, marginBottom: 6 }}>WEEKEND UPLIFT</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <NumberInput
              value={weekendRules.upliftPct ?? 20}
              min={0} max={200}
              onChange={(n) => setWeekendRules(prev => ({ ...prev, upliftPct: n }))}
              className="tnum"
              style={{
                width: 80, fontSize: 14, fontWeight: 700, color: T.ink,
                border: `1px solid ${T.border}`, outline: 'none',
                borderRadius: 7, padding: '7px 10px', background: T.card,
              }}
            />
            <span style={{ fontSize: 13, color: T.ink2, fontWeight: 700 }}>%</span>
            <span style={{ fontSize: 11, color: T.ink3, fontWeight: 600 }}>
              extra on weekend days
            </span>
          </div>
          <div style={{ marginTop: 8, fontSize: 10, color: T.ink3, fontStyle: 'italic' }}>
            E.g. a ₹4,500 base with a 20% uplift becomes ₹5,400 on a weekend day. Set to 0 if you don't want a weekend uplift.
          </div>
        </Card>

        <SectionHead title="Seasons" style={{ marginTop: 16 }} />
        <Card padding={12}>
          <div style={{ fontSize: 11, color: T.ink3, fontWeight: 600, lineHeight: 1.5, marginBottom: 10 }}>
            Name your peak / off-peak periods (e.g. "Winter peak Oct 15 – Jan 31, +30%" or "Monsoon discount Jul – Sep, −15%"). The Rates calendar applies the multiplier on top of your weekend uplift. Per-day overrides still win.
          </div>
          {seasons.length === 0 && (
            <div style={{ fontSize: 11, color: T.ink3, fontStyle: 'italic', padding: '6px 2px' }}>
              No seasons yet. Add one below to start.
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {seasons.map((s, i) => (
              <div key={s.id} data-added-id={s.id} style={{
                display: 'flex', flexDirection: 'column', gap: 8, padding: 10,
                background: T.bgSoft, border: `1px solid ${T.borderSoft}`, borderRadius: 8,
                ...justAddedStyle(s.id),
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    value={s.name}
                    placeholder="Season name (e.g. Winter peak)"
                    onChange={(ev) => setSeasons(arr => arr.map((x, j) => j === i ? { ...x, name: ev.target.value } : x))}
                    style={{
                      flex: 1, minWidth: 0,
                      border: 'none', borderBottom: `1px dashed ${T.border}`, outline: 'none', background: 'transparent',
                      fontSize: 12, fontWeight: 700, color: T.ink, padding: '2px 0',
                    }}
                  />
                  <button
                    onClick={() => setSeasons(arr => arr.filter((_, j) => j !== i))}
                    title="Remove this season"
                    style={{ background: 'none', border: 'none', color: T.ink3, cursor: 'pointer', padding: 0, flexShrink: 0 }}
                  ><Icon name="x" size={12} /></button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  <SeasonDateCell
                    label="FROM"
                    value={s.startIso || ''}
                    onChange={(v) => setSeasons(arr => arr.map((x, j) => j === i ? { ...x, startIso: v } : x))}
                  />
                  <SeasonDateCell
                    label="TO"
                    value={s.endIso || ''}
                    onChange={(v) => setSeasons(arr => arr.map((x, j) => j === i ? { ...x, endIso: v } : x))}
                  />
                </div>
                {(() => {
                  // Prevent overlapping seasons: a booking only applies the FIRST
                  // matching season, while the Rates calendar multiplies all
                  // overlapping ones — so an overlap makes the charged price differ
                  // from the calendar. Warn clearly so the hotelier keeps seasons
                  // non-overlapping (ISO YYYY-MM-DD strings compare correctly).
                  const overlaps = s.startIso && s.endIso && seasons.some((o, j) =>
                    j !== i && o.startIso && o.endIso && s.startIso <= o.endIso && o.startIso <= s.endIso);
                  return overlaps ? (
                    <div style={{ padding: '6px 9px', background: 'oklch(96% 0.05 70)', border: '1px solid oklch(74% 0.13 70)', borderRadius: 6, fontSize: 10.5, color: 'oklch(42% 0.13 70)', fontWeight: 600, lineHeight: 1.45 }}>
                      ⚠ These dates overlap another season. A booking applies only the FIRST matching season, so the price charged can differ from what the calendar shows — please adjust the dates so your seasons don't overlap.
                    </div>
                  ) : null;
                })()}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 10, color: T.ink3, fontWeight: 700 }}>MULTIPLIER</span>
                  <NumberInput
                    value={s.multiplierPct ?? 0}
                    min={-90} max={500}
                    onChange={(n) => setSeasons(arr => arr.map((x, j) => j === i ? { ...x, multiplierPct: n } : x))}
                    className="tnum"
                    style={{ width: 80, border: `1px solid ${T.border}`, outline: 'none', borderRadius: 5, padding: '4px 8px', fontSize: 12, fontWeight: 700, background: T.card, color: T.ink }}
                  />
                  <span style={{ fontSize: 11, color: T.ink3, fontWeight: 600 }}>% on base rate</span>
                </div>

                {/* Per-season extra-adult / extra-child overrides.
                    Each is optional (off = use the category default).
                    Useful for peak seasons where the property charges
                    a higher surcharge per extra guest. */}
                {(() => {
                  const ea = s.extraAdult;
                  const ec = s.extraChild;
                  const updateRule = (key, patch) => setSeasons(arr => arr.map((x, j) => j === i ? { ...x, [key]: patch === null ? null : { ...(x[key] || { mode: 'flat', value: 0 }), ...patch } } : x));
                  const modeBtn = (rule, mode, label) => {
                    const cur = s[rule];
                    return (
                      <button
                        onClick={() => updateRule(rule, { mode })}
                        style={{
                          padding: '3px 8px', borderRadius: 5, cursor: 'pointer',
                          border: `1px solid ${(cur?.mode || 'flat') === mode ? T.indigo : T.border}`,
                          background: (cur?.mode || 'flat') === mode ? T.indigoLt : T.card,
                          color: (cur?.mode || 'flat') === mode ? T.indigo : T.ink3,
                          fontSize: 10, fontWeight: 700,
                        }}
                      >{label}</button>
                    );
                  };
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4, padding: '8px 10px', background: T.card, borderRadius: 7, border: `1px dashed ${T.borderSoft}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 9, fontWeight: 800, color: T.ink3, letterSpacing: 0.5, textTransform: 'uppercase' }}>Per-season override (optional)</span>
                        <span style={{ fontSize: 9, color: T.ink3, fontWeight: 600, fontStyle: 'italic' }}>blank = use category default</span>
                      </div>
                      {[
                        { rule: 'extraAdult', label: 'Extra adult', val: ea },
                      ].map(({ rule, label, val }) => (
                        <div key={rule} style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 10.5, color: T.ink2, fontWeight: 600, minWidth: 76 }}>{label}</span>
                          {val ? (
                            <>
                              <div style={{ display: 'inline-flex', gap: 3 }}>
                                {modeBtn(rule, 'flat', '₹')}
                                {modeBtn(rule, 'pct', '% of base')}
                              </div>
                              <NumberInput
                                min={0}
                                value={val.value || 0}
                                onChange={(n) => updateRule(rule, { value: n })}
                                className="tnum"
                                style={{ width: 70, border: `1px solid ${T.border}`, outline: 'none', borderRadius: 5, padding: '3px 6px', fontSize: 11, fontWeight: 700, color: T.ink, background: T.card }}
                              />
                              <span style={{ fontSize: 9, color: T.ink3, fontWeight: 600 }}>per night</span>
                              <button
                                onClick={() => updateRule(rule, null)}
                                title={`Remove ${label} override`}
                                style={{ marginLeft: 'auto', background: 'none', border: 'none', color: T.ink3, fontSize: 10, fontWeight: 700, cursor: 'pointer' }}
                              >Clear</button>
                            </>
                          ) : (
                            <button
                              onClick={() => updateRule(rule, { mode: 'flat', value: 0 })}
                              style={{ padding: '3px 8px', borderRadius: 5, border: `1px dashed ${T.border}`, background: T.card, color: T.ink3, fontSize: 10, fontWeight: 700, cursor: 'pointer' }}
                            >+ Add override</button>
                          )}
                        </div>
                      ))}
                      {/* Extra child override — per age band, this season (applies to
                          all room types; "% of base" scales per room). "Default" on a
                          band = use that room type's normal child rate. */}
                      {(() => {
                        const bands = effectiveChildBands({ accountant });
                        const sNode = (accountant.childRatesBySeason && accountant.childRatesBySeason[s.id]) || {};
                        const byBand = sNode.byBand || {};
                        const setSeasonChild = (bandId, ruleOrNull) => setAccountant(a => {
                          const all = a.childRatesBySeason || {};
                          const node = all[s.id] || {};
                          const bb = { ...(node.byBand || {}) };
                          if (ruleOrNull === null) delete bb[bandId];
                          else bb[bandId] = { ...(bb[bandId] || { mode: 'flat', value: 0 }), ...ruleOrNull };
                          return { ...a, childRatesBySeason: { ...all, [s.id]: { ...node, byBand: bb } } };
                        });
                        const seg = (bandId, cur, m, lbl) => {
                          const active = cur ? cur.mode === m : m === 'default';
                          return (
                            <button key={m} onClick={() => setSeasonChild(bandId, m === 'default' ? null : { mode: m })} style={{ padding: '3px 7px', borderRadius: 5, cursor: 'pointer', border: `1px solid ${active ? T.indigo : T.border}`, background: active ? T.indigoLt : T.card, color: active ? T.indigo : T.ink3, fontSize: 9.5, fontWeight: 700 }}>{lbl}</button>
                          );
                        };
                        return (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 2 }}>
                            <span style={{ fontSize: 10.5, color: T.ink2, fontWeight: 600 }}>Extra child · per age band</span>
                            {bands.map(band => {
                              const cur = byBand[band.id];
                              const prev = !cur ? 'category rate' : cur.mode === 'pct' ? `${cur.value || 0}% of base` : cur.mode === 'free' ? 'Free' : `₹${(cur.value || 0).toLocaleString('en-IN')}/night`;
                              return (
                                <div key={band.id} style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                                  <span style={{ fontSize: 10, color: T.ink3, fontWeight: 600, minWidth: 70, maxWidth: 96, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{band.label || '—'}</span>
                                  {seg(band.id, cur, 'default', 'Default')}
                                  {seg(band.id, cur, 'free', 'Free')}
                                  {seg(band.id, cur, 'flat', '₹')}
                                  {seg(band.id, cur, 'pct', '%')}
                                  {cur && cur.mode !== 'free' && (
                                    <NumberInput min={0} value={cur.value || 0} onChange={(n) => setSeasonChild(band.id, { value: n })} className="tnum" style={{ width: 60, border: `1px solid ${T.border}`, outline: 'none', borderRadius: 5, padding: '2px 5px', fontSize: 10.5, fontWeight: 700, color: T.ink, background: T.card }} />
                                  )}
                                  <span style={{ marginLeft: 'auto', fontSize: 9, color: cur ? T.indigo : T.ink3, fontWeight: 600, fontStyle: cur ? 'normal' : 'italic' }}>{prev}</span>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </div>
                  );
                })()}
              </div>
            ))}
          </div>
          <button
            onClick={() => {
              const id = 'season_' + Date.now().toString(36);
              setSeasons(arr => [...arr, { id, name: '', startIso: '', endIso: '', multiplierPct: 20 }]);
              setJustAddedId(id);
            }}
            style={{
              marginTop: 10, width: '100%',
              padding: '9px 12px', borderRadius: 8,
              border: `1.5px dashed ${T.border}`, background: T.card,
              color: T.ink2, fontSize: 12, fontWeight: 700,
              cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            <Icon name="plus" size={12} color={T.ink2} />
            Add season
          </button>
        </Card>

        {plan !== 'engine' && (() => {
          const channels = [
            { id: 'mmt',     label: 'MakeMyTrip',   color: '#EB2026' },
            { id: 'goibibo', label: 'Goibibo',      color: '#F0728F' },
            { id: 'booking', label: 'Booking.com',  color: '#003580' },
            { id: 'agoda',   label: 'Agoda',        color: '#5392F9' },
            { id: 'airbnb',  label: 'Airbnb',       color: '#FF5A5F' },
          ];
          const anyNonZero = channels.some(c => (channelMarkups[c.id] || 0) !== 0);
          return (
            <>
              <SectionHead title="Channel pricing" style={{ marginTop: 16 }} />
              <Card padding={12}>
                <div style={{ fontSize: 11, color: T.ink3, fontWeight: 600, lineHeight: 1.5, marginBottom: 10 }}>
                  Markup applied to your direct rate before pushing to each OTA. 0% = parity (same as direct). Negative = discount (most OTAs disallow). Sync to the channels themselves waits on the Channel Manager integration.
                </div>
                {anyNonZero && (
                  <div style={{ padding: '8px 10px', background: 'oklch(96% 0.04 75)', border: `1px solid oklch(72% 0.12 75)`, borderRadius: 7, marginBottom: 12, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <Icon name="info" size={14} color="oklch(48% 0.14 75)" stroke={2} />
                    <div style={{ fontSize: 11, color: 'oklch(40% 0.10 75)', lineHeight: 1.4 }}>
                      <strong>Rate parity warning.</strong> MakeMyTrip, Booking.com and most OTAs contractually require rate parity (same rate across all sales channels). Different rates per channel will trigger contract penalties and OTA delisting. Most properties leave all markups at 0%. Only set markup for channels where parity isn't contracted.
                    </div>
                  </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {/* Direct row — always at 0 and read-only, just so the
                      hotelier sees the relative anchor. */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, background: T.bgSoft, border: `1px solid ${T.borderSoft}`, borderRadius: 8 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 5, background: T.primary, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: T.ink }}>Direct</div>
                      <div style={{ fontSize: 10, color: T.ink3, fontWeight: 600, marginTop: 1 }}>Your reference rate (Rates &amp; inventory)</div>
                    </div>
                    <span className="tnum" style={{ fontSize: 13, fontWeight: 700, color: T.ink2 }}>0%</span>
                  </div>
                  {channels.map(c => {
                    const v = channelMarkups[c.id] ?? 0;
                    return (
                      <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, background: T.card, border: `1px solid ${T.borderSoft}`, borderRadius: 8 }}>
                        <span style={{ width: 10, height: 10, borderRadius: 5, background: c.color, flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: T.ink }}>{c.label}</div>
                          {v !== 0 && (
                            <div className="tnum" style={{ fontSize: 10, color: v > 0 ? T.ink3 : T.danger, fontWeight: 600, marginTop: 1 }}>
                              {(() => {
                                // Example math anchored to the hotelier's
                                // first category's base rate so the
                                // illustration tracks THEIR pricing, not
                                // a hardcoded ₹4,500 that meant nothing
                                // to a homestay charging ₹1.5k or a
                                // luxury resort charging ₹25k.
                                const example = (categories[0]?.base) || 4500;
                                return <>Direct ₹{example.toLocaleString('en-IN')} → {c.label} ₹{Math.round(example * (1 + v/100)).toLocaleString('en-IN')}</>;
                              })()}
                            </div>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <NumberInput
                            value={v}
                            min={-50} max={100}
                            onChange={(n) => setChannelMarkups(prev => ({ ...prev, [c.id]: n }))}
                            className="tnum"
                            style={{ width: 60, fontSize: 13, fontWeight: 700, color: T.ink, border: `1px solid ${T.border}`, outline: 'none', borderRadius: 5, padding: '4px 6px', background: T.card, textAlign: 'right' }}
                          />
                          <span style={{ fontSize: 12, color: T.ink3, fontWeight: 700 }}>%</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ marginTop: 12, padding: '8px 10px', background: T.bgSoft, border: `1px solid ${T.borderSoft}`, borderRadius: 7, fontSize: 10, color: T.ink3, lineHeight: 1.5 }}>
                  <strong>Sync status:</strong> not connected to any channel yet. Once the channel manager partnership lands, rates push automatically with the markup applied. Today, rates are direct-only — these values are saved for later.
                </div>
              </Card>

              {/* Channel commissions — what each OTA takes off your top
                  line. Powers the "Take-home" card in Reports. Independent
                  of channel markups above; defaults to industry standard
                  rates but the hotelier should match to their contract. */}
              <SectionHead title="Channel commissions" style={{ marginTop: 16 }} />
              <Card padding={12}>
                <div style={{ fontSize: 11, color: T.ink3, fontWeight: 600, lineHeight: 1.5, marginBottom: 10 }}>
                  What each OTA deducts before paying you out. Used in Reports → Take-home to show your real take-home after tax + commissions. Set to 0% if the channel charges the guest a separate fee instead of you.
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {channels.map(c => {
                    const v = channelCommissions[c.id] ?? 0;
                    // Direct + Website bookings have no OTA fee by
                    // definition — render read-only so the hotelier
                    // can't accidentally set 8% on Direct and break
                    // their take-home math.
                    const isDirect = c.id === 'direct' || c.id === 'website';
                    return (
                      <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, background: T.card, border: `1px solid ${T.borderSoft}`, borderRadius: 8 }}>
                        <span style={{ width: 10, height: 10, borderRadius: 5, background: c.color, flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: T.ink }}>{c.label}</div>
                          {isDirect ? (
                            <div style={{ fontSize: 10, color: T.ink3, fontWeight: 600, marginTop: 1 }}>
                              No OTA commission — you keep 100% (before GST)
                            </div>
                          ) : v > 0 && (
                            <div className="tnum" style={{ fontSize: 10, color: T.ink3, fontWeight: 600, marginTop: 1 }}>
                              {(() => {
                                const example = (categories[0]?.base) || 4500;
                                return <>Bill ₹{example.toLocaleString('en-IN')} → you keep ₹{Math.round(example * (1 - v/100)).toLocaleString('en-IN')} (before GST)</>;
                              })()}
                            </div>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          {isDirect ? (
                            <span style={{ width: 60, textAlign: 'right', fontSize: 13, fontWeight: 700, color: T.ink3, padding: '4px 6px' }}>0%</span>
                          ) : (
                            <>
                              <NumberInput
                                value={v}
                                min={0} max={50}
                                onChange={(n) => setChannelCommissions(prev => ({ ...prev, [c.id]: n }))}
                                className="tnum"
                                style={{ width: 60, fontSize: 13, fontWeight: 700, color: T.ink, border: `1px solid ${T.border}`, outline: 'none', borderRadius: 5, padding: '4px 6px', background: T.card, textAlign: 'right' }}
                              />
                              <span style={{ fontSize: 12, color: T.ink3, fontWeight: 700 }}>%</span>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            </>
          );
        })()}

        <SectionHead title="Rate plans" style={{ marginTop: 16 }} />
        <Card padding={12}>
          <div style={{ fontSize: 11, color: T.ink3, fontWeight: 600, lineHeight: 1.5, marginBottom: 10 }}>
            Offer different price tiers for the same room — e.g. Standard (flexible cancel), Non-refundable (-10% off), Long-stay discount.
          </div>
          <div style={{ fontSize: 10.5, color: T.indigo, fontWeight: 600, lineHeight: 1.5, marginBottom: 10, padding: '8px 10px', background: T.indigoLt, borderRadius: 7 }}>
            <strong>Standard plan</strong> is your baseline — always 0%, always on. To offer cheaper or pricier alternatives, tap <strong>Add rate plan</strong> below and set THAT plan's %.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {ratePlans.map((p, i) => {
              const isStd = p.id === 'standard';
              return (
                <div key={p.id} data-added-id={p.id} style={{
                  display: 'flex', flexDirection: 'column', gap: 6, padding: 10,
                  background: p.enabled ? T.bgSoft : T.card,
                  border: `1px solid ${p.enabled ? T.borderSoft : T.border}`,
                  borderRadius: 8,
                  ...justAddedStyle(p.id),
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      value={p.label}
                      placeholder="Plan name"
                      onChange={(ev) => setRatePlans(arr => arr.map((x, j) => j === i ? { ...x, label: ev.target.value } : x))}
                      style={{
                        flex: 1, minWidth: 0,
                        border: 'none', borderBottom: `1px dashed ${T.border}`, outline: 'none', background: 'transparent',
                        fontSize: 12, fontWeight: 700, color: T.ink, padding: '2px 0',
                      }}
                    />
                    <Toggle
                      on={p.enabled}
                      onChange={(v) => {
                        if (isStd) return; // Standard always on
                        setRatePlans(arr => arr.map((x, j) => j === i ? { ...x, enabled: v } : x));
                      }}
                    />
                    {!isStd && (
                      <button
                        onClick={() => setRatePlans(arr => arr.filter((_, j) => j !== i))}
                        title="Remove this plan"
                        style={{ background: 'none', border: 'none', color: T.ink3, cursor: 'pointer', padding: 0, flexShrink: 0 }}
                      ><Icon name="x" size={12} /></button>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 10, color: T.ink3, fontWeight: 700 }}>RATE</span>
                    <NumberInput
                      value={p.multiplierPct ?? 0}
                      min={-90} max={200}
                      onChange={(n) => setRatePlans(arr => arr.map((x, j) => j === i ? { ...x, multiplierPct: n } : x))}
                      disabled={isStd}
                      className="tnum"
                      style={{ width: 64, border: `1px solid ${T.border}`, outline: 'none', borderRadius: 5, padding: '4px 6px', fontSize: 12, fontWeight: 700, background: isStd ? T.bgSunk : T.card, color: T.ink, opacity: isStd ? 0.6 : 1 }}
                    />
                    <span style={{ fontSize: 10, color: T.ink3, fontWeight: 600 }}>% on base</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 10, color: T.ink3, fontWeight: 700 }}>CANCEL</span>
                    {[
                      { id: 'flexible',       label: 'Flexible' },
                      { id: 'moderate',       label: 'Moderate' },
                      { id: 'strict',         label: 'Strict' },
                      { id: 'non-refundable', label: 'Non-refundable' },
                    ].map(opt => {
                      const sel = (p.cancellation || 'flexible') === opt.id;
                      return (
                        <button
                          key={opt.id}
                          onClick={() => setRatePlans(arr => arr.map((x, j) => j === i ? { ...x, cancellation: opt.id } : x))}
                          style={{
                            padding: '3px 8px', borderRadius: 999,
                            border: `1px solid ${sel ? T.indigo : T.border}`,
                            background: sel ? T.indigoLt : T.card,
                            color: sel ? T.indigo : T.ink2,
                            fontSize: 10, fontWeight: 700, cursor: 'pointer',
                          }}
                        >{opt.label}</button>
                      );
                    })}
                  </div>
                  {(p.cancellation || 'flexible') !== 'non-refundable' && (() => {
                    // Persist refundUnit on the plan so the picker remembers
                    // hours-vs-days choice across save/reload. Default unit
                    // is 'hours' for back-compat with plans created before
                    // this UI shipped. refundHours stays the canonical
                    // value the booking-cancellation math reads (multiply
                    // by 24 when the user picked days).
                    const unit = p.refundUnit || 'hours';
                    const totalHrs = p.refundHours ?? 48;
                    const displayedValue = unit === 'days' ? Math.round(totalHrs / 24) : totalHrs;
                    const setValue = (v) => {
                      const num = Math.max(0, parseInt(v, 10) || 0);
                      const asHours = unit === 'days' ? num * 24 : Math.min(720, num);
                      setRatePlans(arr => arr.map((x, j) => j === i ? { ...x, refundHours: asHours, refundUnit: unit } : x));
                    };
                    const setUnit = (newUnit) => {
                      setRatePlans(arr => arr.map((x, j) => j === i ? { ...x, refundUnit: newUnit } : x));
                    };
                    return (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 10, color: T.ink3, fontWeight: 700 }}>FREE CANCEL UPTO</span>
                        <input onFocus={(e) => e.target.select()}
                          type="number"
                          value={displayedValue}
                          onChange={(ev) => setValue(ev.target.value)}
                          className="tnum"
                          style={{ width: 60, border: `1px solid ${T.border}`, outline: 'none', borderRadius: 5, padding: '4px 6px', fontSize: 11, fontWeight: 700, background: T.card, color: T.ink }}
                        />
                        <div style={{ display: 'inline-flex', gap: 3 }}>
                          {['hours', 'days'].map(u => {
                            const sel = unit === u;
                            return (
                              <button
                                key={u}
                                onClick={() => setUnit(u)}
                                style={{
                                  padding: '4px 9px', borderRadius: 5,
                                  border: `1px solid ${sel ? T.indigo : T.border}`,
                                  background: sel ? T.indigoLt : T.card,
                                  color: sel ? T.indigo : T.ink3,
                                  fontSize: 10, fontWeight: 700, cursor: 'pointer',
                                }}
                              >{u}</button>
                            );
                          })}
                        </div>
                        <span style={{ fontSize: 10, color: T.ink3, fontWeight: 600 }}>before arrival</span>
                      </div>
                    );
                  })()}
                </div>
              );
            })}
          </div>
          <button
            onClick={() => {
              const id = 'rp_' + Date.now().toString(36);
              setRatePlans(arr => [...arr, { id, label: '', multiplierPct: 0, cancellation: 'flexible', refundHours: 48, refundUnit: 'hours', enabled: true }]);
              setJustAddedId(id);
            }}
            style={{
              marginTop: 10, width: '100%',
              padding: '9px 12px', borderRadius: 8,
              border: `1.5px dashed ${T.border}`, background: T.card,
              color: T.ink2, fontSize: 12, fontWeight: 700,
              cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            <Icon name="plus" size={12} color={T.ink2} />
            Add rate plan
          </button>
        </Card>
        </AccordionGroup>

        <AccordionGroup title="Meal plans + saved extras" open={openGroups.meals} onToggle={() => toggleGroup('meals')}>
        <SectionHead title={t('mealPlansTitle')} style={{ marginTop: 0 }} />
        <Card padding={12}>
          <div style={{ fontSize: 11, color: T.ink3, fontWeight: 600, lineHeight: 1.5, marginBottom: 10 }}>
            {t('mealPlansHint')}
          </div>
          {/* Default meal plan: the one the calendar rate is treated as
              already including. Picking a different plan on a booking
              adds (or subtracts) the per-guest-per-night delta. Set to
              EP for hotels that quote room-only and sell breakfast on
              top; set to MAP/AP for camps that quote all-inclusive. */}
          <div style={{ padding: '10px 12px', background: T.primaryLt, border: `1px solid ${T.primary}`, borderRadius: 8, marginBottom: 12 }}>
            <div style={{ fontSize: 10, color: T.primaryDk, fontWeight: 700, letterSpacing: 0.3, marginBottom: 6, textTransform: 'uppercase' }}>Default meal plan</div>
            <div style={{ fontSize: 10.5, color: T.primaryDk, fontWeight: 600, lineHeight: 1.4, marginBottom: 8 }}>
              Your calendar rate is treated as already including this plan. Other plans add (or subtract) the per-guest-per-night difference.
            </div>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {mealPlans.filter(mp => mp.enabled).map(mp => {
                const sel = defaultMealPlan === mp.id;
                return (
                  <button
                    key={mp.id}
                    onClick={() => setDefaultMealPlan(mp.id)}
                    style={{
                      padding: '6px 11px', borderRadius: 999, cursor: 'pointer',
                      border: `1.5px solid ${sel ? T.primary : T.border}`,
                      background: sel ? T.card : 'transparent',
                      color: sel ? T.primaryDk : T.ink2,
                      fontSize: 11, fontWeight: 700,
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                    }}
                  >
                    {sel && <Icon name="check" size={11} stroke={2.4} color={T.primary} />}
                    <strong>{mp.code}</strong> · {mp.label || ''}
                  </button>
                );
              })}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {mealPlans.map((mp, i) => {
              const isEP = mp.id === 'ep';
              const isStandard = ['ep', 'cp', 'map', 'ap'].includes(mp.id);
              return (
                <div key={mp.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: 10,
                  background: mp.enabled ? T.bgSoft : T.card,
                  border: `1px solid ${mp.enabled ? T.borderSoft : T.border}`,
                  borderRadius: 8,
                }}>
                  {isStandard ? (
                    <span style={{
                      width: 42, fontSize: 11, fontWeight: 800, letterSpacing: 0.5,
                      color: mp.enabled ? T.primaryDk : T.ink3,
                      flexShrink: 0,
                    }}>{mp.code}</span>
                  ) : (
                    <input
                      value={mp.code}
                      onChange={e => {
                        const code = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
                        setMealPlans(arr => arr.map((p, j) => j === i ? { ...p, code } : p));
                      }}
                      maxLength={4}
                      title="Short code (max 4 letters)"
                      style={{
                        width: 50, flexShrink: 0,
                        fontSize: 11, fontWeight: 800, letterSpacing: 0.5,
                        color: mp.enabled ? T.primaryDk : T.ink3,
                        textAlign: 'center',
                        border: `1px solid ${T.border}`, borderRadius: 5,
                        background: T.card, outline: 'none', padding: '3px 4px',
                      }}
                    />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <input
                      value={mp.label}
                      placeholder={t('mealPlanNamePlaceholder')}
                      onChange={e => setMealPlans(arr => arr.map((p, j) => j === i ? { ...p, label: e.target.value } : p))}
                      style={{
                        width: '100%', boxSizing: 'border-box',
                        border: 'none', borderBottom: `1px dashed ${T.border}`,
                        outline: 'none', background: 'transparent',
                        fontSize: 12, fontWeight: 700, color: T.ink,
                        padding: '2px 0',
                      }}
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                      <span style={{ fontSize: 11, color: T.ink3, fontWeight: 600 }}>₹</span>
                      <NumberInput
                        value={mp.price}
                        min={0}
                        onChange={(n) => setMealPlans(arr => arr.map((p, j) => j === i ? { ...p, price: n } : p))}
                        className="tnum"
                        style={{ width: 80, border: `1px solid ${T.border}`, outline: 'none', borderRadius: 5, padding: '2px 6px', fontSize: 11, fontWeight: 700, background: T.card, color: T.ink }}
                      />
                      <span style={{ fontSize: 10, color: T.ink3, fontWeight: 500 }}>{t('perGuestPerNight')}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <Toggle
                      on={mp.enabled}
                      onChange={(v) => {
                        // Never let the LAST enabled plan be turned off — with zero
                        // enabled plans the default dangles, mealPlanById returns
                        // undefined, and the booking price baseline breaks. Keep >=1.
                        if (!v && mealPlans.filter(p => p.enabled).length <= 1) {
                          setChip('needMeal');
                          setTimeout(() => setChip(c => (c === 'needMeal' ? null : c)), 2800);
                          return;
                        }
                        setMealPlans(arr => {
                          const next = arr.map((p, j) => j === i ? { ...p, enabled: v } : p);
                          // If we just disabled the current default plan, move the
                          // default to a still-enabled plan so it never dangles
                          // (a disabled default is unselectable + breaks the price
                          // baseline between the create screen and the folio).
                          if (!v && mp.id === defaultMealPlan) {
                            const fallback = next.find(p => p.enabled);
                            setDefaultMealPlan(fallback ? fallback.id : 'ep');
                          }
                          return next;
                        });
                      }}
                    />
                    {!isStandard && (
                      <button
                        onClick={() => setMealPlans(arr => arr.filter((_, j) => j !== i))}
                        title={t('removeMealPlan')}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: T.ink3, padding: 0, fontSize: 10,
                        }}
                      ><Icon name="x" size={11} /></button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <button
            onClick={() => {
              const id = 'mp_' + Date.now().toString(36);
              setMealPlans(arr => [...arr, { id, code: 'NEW', label: '', price: 0, enabled: true }]);
            }}
            style={{
              marginTop: 10, width: '100%',
              padding: '9px 12px', borderRadius: 8,
              border: `1.5px dashed ${T.border}`, background: T.card,
              color: T.ink2, fontSize: 12, fontWeight: 700,
              cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            <Icon name="plus" size={12} color={T.ink2} />
            {t('addCustomMealPlan')}
          </button>
        </Card>

        <SectionHead title="Saved extras" style={{ marginTop: 16 }} />
        <Card padding={12}>
          <div style={{ fontSize: 11, color: T.ink3, fontWeight: 600, lineHeight: 1.5, marginBottom: 10 }}>
            Reusable add-ons that show up in the New Booking extras list (e.g. Bonfire dinner, Airport pickup, Late check-out). Rename and reprice freely; old bookings that used the previous values aren't changed.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {extras.length === 0 && (
              <div style={{ fontSize: 11, color: T.ink3, fontStyle: 'italic', padding: '6px 2px' }}>
                None yet. Add one below, or save extras from inside a New Booking — they'll appear here.
              </div>
            )}
            {extras.map((e, i) => (
              <div key={e.id} style={{
                display: 'flex', flexDirection: 'column', gap: 8, padding: 10,
                background: T.bgSoft, border: `1px solid ${T.borderSoft}`, borderRadius: 8,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    value={e.name}
                    placeholder="Extra name (e.g. Bonfire dinner)"
                    onChange={(ev) => setExtras(arr => arr.map((x, j) => j === i ? { ...x, name: ev.target.value } : x))}
                    style={{
                      flex: 1, minWidth: 0, boxSizing: 'border-box',
                      border: 'none', borderBottom: `1px dashed ${T.border}`, outline: 'none', background: 'transparent',
                      fontSize: 12, fontWeight: 700, color: T.ink, padding: '2px 0',
                    }}
                  />
                  <button
                    onClick={() => setExtras(arr => arr.filter((_, j) => j !== i))}
                    title="Remove this extra"
                    style={{ background: 'none', border: 'none', color: T.ink3, cursor: 'pointer', padding: 0, flexShrink: 0 }}
                  >
                    <Icon name="x" size={12} />
                  </button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 11, color: T.ink3, fontWeight: 600 }}>₹</span>
                  <NumberInput
                    value={e.price}
                    min={0}
                    onChange={(n) => setExtras(arr => arr.map((x, j) => j === i ? { ...x, price: n } : x))}
                    className="tnum"
                    style={{
                      width: 90, border: `1px solid ${T.border}`, outline: 'none',
                      borderRadius: 5, padding: '3px 6px',
                      fontSize: 11, fontWeight: 700, background: T.card, color: T.ink,
                    }}
                  />
                  <select
                    value={e.unit || 'per stay'}
                    onChange={(ev) => setExtras(arr => arr.map((x, j) => j === i ? { ...x, unit: ev.target.value } : x))}
                    style={{
                      flex: 1, fontSize: 11, fontWeight: 700, color: T.ink2, background: T.card,
                      border: `1px solid ${T.border}`, borderRadius: 5, padding: '3px 6px',
                      cursor: 'pointer',
                    }}
                  >
                    <option value="per stay">per stay</option>
                    <option value="per night">per night</option>
                    <option value="per guest">per guest</option>
                    <option value="per guest per night">per guest / night</option>
                  </select>
                </div>
              </div>
            ))}
          </div>
          <button
            onClick={() => {
              const id = 'sx_' + Date.now().toString(36);
              setExtras(arr => [...arr, { id, name: '', price: 0, unit: 'per stay' }]);
            }}
            style={{
              marginTop: 10, width: '100%',
              padding: '9px 12px', borderRadius: 8,
              border: `1.5px dashed ${T.border}`, background: T.card,
              color: T.ink2, fontSize: 12, fontWeight: 700,
              cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            <Icon name="plus" size={12} color={T.ink2} />
            Add saved extra
          </button>
        </Card>
        </AccordionGroup>

        <AccordionGroup title="Accountant + GST" open={openGroups.accountant} onToggle={() => toggleGroup('accountant')}>
        <SectionHead title="Accountant (CA)" style={{ marginTop: 0 }} />
        <Card padding={14}>
          <div style={{ fontSize: 10.5, color: T.ink3, fontWeight: 600, lineHeight: 1.4, marginBottom: 10 }}>
            We email a sequenced list of issued invoices to your CA each month. They decide what gets filed with GSTN.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Field
              label="CA email"
              value={accountant.email}
              onChange={e => setAccountant({ ...accountant, email: e.target.value })}
              placeholder="ca@firm.in (required for export)"
              prefix={<Icon name="mail" size={12} color={T.ink3} />}
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <Field
                label="CA name (optional)"
                value={accountant.name}
                onChange={e => setAccountant({ ...accountant, name: e.target.value })}
                placeholder="CA Sharma"
              />
              <Field
                label="Firm (optional)"
                value={accountant.firm}
                onChange={e => setAccountant({ ...accountant, firm: e.target.value })}
                placeholder="Sharma & Associates"
              />
            </div>
            <Field
              label="Your GSTIN (optional)"
              value={gstin}
              onChange={e => setGstin(e.target.value.toUpperCase())}
              placeholder="08AABCY1234M1Z5"
              hint="If you're GST-registered, this appears on every tax invoice."
              prefix={<Icon name="tag" size={12} color={T.ink3} />}
            />
            {/* Invoice-specific settings: prefix + per-FY counter. Both
                only relevant on the Invoicing plan, so we gate them. */}
            {plan === 'invoicing' && (
              <>
                <Field
                  label="Invoice number prefix"
                  value={accountant.invoicePrefix || ''}
                  onChange={e => setAccountant({ ...accountant, invoicePrefix: e.target.value.toUpperCase() })}
                  placeholder="INV"
                  hint={`Default is INV. The prefix combines with the FY and a running number — e.g. ${effectivePrefix}-${fy}-001.`}
                  prefix={<Icon name="tag" size={12} color={T.ink3} />}
                />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: T.ink2 }}>Last invoice number issued (FY {fmtFy(fy)})</label>
                  <div style={{ background: T.bgSunk, border: `1px solid ${T.borderSoft}`, borderRadius: 10, padding: '0 12px', height: 44, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Icon name="tag" size={12} color={T.ink3} />
                    <NumberInput
                      value={currentSeq}
                      min={0} fallback={0}
                      onChange={(n) => setInvoiceCounters({ ...invoiceCounters, [fy]: n })}
                      placeholder="0"
                      style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 15, fontWeight: 500, color: T.ink, minWidth: 0 }}
                    />
                  </div>
                  <span style={{ fontSize: 11, color: T.ink3 }}>{currentSeq > 0
                    ? `Next invoice will be ${effectivePrefix}-${fy}-${String(currentSeq + 1).padStart(3, '0')}.`
                    : `Leave at 0 to start fresh from ${effectivePrefix}-${fy}-001. Set this if you were already issuing invoices in another system this financial year — Atithi will continue from the next number.`}</span>
                </div>
              </>
            )}
          </div>
        </Card>

        {/* Cash accounts — drives the Dashboard 'Close today's cash' UI.
            Hotelier defines N accounts (owner UPI, manager UPI, cash
            drawer, bank deposit, card terminal) and the close-day card
            asks for amounts per-account. Useful when the front desk
            has multiple people / instruments collecting payments through
            the day and you need to reconcile by whom + how. */}
        <SectionHead title="Cash accounts" style={{ marginTop: 16 }} />
        <Card padding={12}>
          <div style={{ fontSize: 11, color: T.ink3, fontWeight: 600, lineHeight: 1.5, marginBottom: 10 }}>
            Payment instruments your front desk handles through the day. Each appears as its own input on the Dashboard's "Close today's cash" card so you can reconcile by person + method. Default is one cash + one digital bucket; add more if your property has multiple UPI handles, a card terminal, or separate cash drawers.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {cashAccounts.map((a, i) => (
              <div key={a.id || i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 8, background: T.bgSoft, border: `1px solid ${T.borderSoft}`, borderRadius: 7 }}>
                <input
                  value={a.label || ''}
                  placeholder="Label (e.g. Manager UPI)"
                  onChange={e => setCashAccounts(arr => arr.map((x, j) => j === i ? { ...x, label: e.target.value } : x))}
                  style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 700, color: T.ink, padding: '6px 8px', border: `1px solid ${T.border}`, borderRadius: 5, background: T.card }}
                />
                <select
                  value={a.kind || 'upi'}
                  onChange={e => setCashAccounts(arr => arr.map((x, j) => j === i ? { ...x, kind: e.target.value } : x))}
                  style={{ fontSize: 11, fontWeight: 700, color: T.ink2, padding: '6px 8px', border: `1px solid ${T.border}`, borderRadius: 5, background: T.card }}
                >
                  <option value="cash">Cash</option>
                  <option value="upi">UPI</option>
                  <option value="card">Card</option>
                  <option value="bank">Bank</option>
                </select>
                <button
                  onClick={() => setCashAccounts(arr => arr.length > 1 ? arr.filter((_, j) => j !== i) : arr)}
                  disabled={cashAccounts.length <= 1}
                  title={cashAccounts.length <= 1 ? "Keep at least one account" : "Remove"}
                  style={{ background: 'none', border: 'none', color: cashAccounts.length <= 1 ? T.ink4 : T.ink3, cursor: cashAccounts.length <= 1 ? 'not-allowed' : 'pointer', padding: 2 }}
                ><Icon name="x" size={12} /></button>
              </div>
            ))}
          </div>
          <button
            onClick={() => setCashAccounts(arr => [...arr, { id: 'acct_' + Date.now().toString(36), label: '', kind: 'upi' }])}
            disabled={cashAccounts.length >= 8}
            style={{
              marginTop: 10, width: '100%',
              padding: '8px 12px', borderRadius: 8,
              border: `1.5px dashed ${T.border}`, background: T.card,
              color: cashAccounts.length >= 8 ? T.ink3 : T.ink2, fontSize: 12, fontWeight: 700,
              cursor: cashAccounts.length >= 8 ? 'not-allowed' : 'pointer',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            <Icon name="plus" size={12} color={cashAccounts.length >= 8 ? T.ink3 : T.ink2} />
            {cashAccounts.length >= 8 ? '8-account limit reached' : 'Add account'}
          </button>
        </Card>

        {plan === 'invoicing' && (
          <>
            <SectionHead title={t('gstSlabsTitle')} style={{ marginTop: 16 }} />
            <Card padding={12}>
              <div style={{ fontSize: 11, color: T.ink3, fontWeight: 600, lineHeight: 1.5, marginBottom: 10 }}>
                {t('gstSlabsHint')}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {GST_SLABS.map((s, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: T.bgSoft, borderRadius: 7 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: T.ink, minWidth: 150 }}>{s.label}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: s.rate === 0 ? T.ok : s.rate === 12 ? T.indigo : T.danger }}>{s.note}</span>
                  </div>
                ))}
              </div>
            </Card>
          </>
        )}
        </AccordionGroup>

        <AccordionGroup title="Booking link" open={openGroups.bookingLink} onToggle={() => toggleGroup('bookingLink')}>
        <SectionHead title="Booking link for your website" style={{ marginTop: 0 }} />
        <Card padding={12}>
          {(() => {
            // Build the widget URL off the current origin so the link works
            // whether the user opens it on Vercel, GitHub Pages, or local
            // dev. The widget renders on the same app via the ?book=1
            // query param (App.jsx branches on IS_PUBLIC_WIDGET).
            const origin = typeof window !== 'undefined' ? window.location.origin : 'https://www.atithibook.com';
            const basePath = typeof window !== 'undefined' && window.location.pathname.startsWith('/atithi/') ? '/atithi/' : '/';
            const slug = propertyShortCode({ profile });
            // Pretty URL with the property's slug — atithi.app/book/yatra-desert-camp.
            // Falls back to ?book=1 query if the hotelier prefers a flat URL.
            const widgetUrl = `${origin}${basePath}book/${slug}`;
            const iframeSnippet = `<iframe src="${widgetUrl}" style="width:100%; max-width:480px; height:780px; border:0; border-radius:14px; box-shadow:0 4px 18px rgba(0,0,0,0.08);"></iframe>`;
            // Embed button config — stored on property.profile.embedButton.
            // Defaults give a sensible-looking button that anyone can drop
            // on their site without thinking about styling.
            const eb = profile.embedButton || {};
            const btnText = eb.text || 'Book your stay';
            const btnStyle = eb.style || 'pill';      // pill | rounded | square
            const btnSize = eb.size || 'md';          // sm | md | lg
            const btnColor = eb.useCustomColour && eb.color ? eb.color : (theme.color || `oklch(60% 0.16 ${theme.hue ?? 38})`);
            const sizePadding = btnSize === 'sm' ? '8px 14px' : btnSize === 'lg' ? '16px 32px' : '12px 22px';
            const sizeFont = btnSize === 'sm' ? 13 : btnSize === 'lg' ? 18 : 15;
            const borderRadius = btnStyle === 'pill' ? 999 : btnStyle === 'rounded' ? 10 : 4;
            // Inline-styled HTML so it works on any website without
            // depending on the hotelier having CSS files. No external
            // fonts so it inherits the site's font.
            const btnInlineStyle = `display:inline-block;padding:${sizePadding};border-radius:${borderRadius}px;background:${btnColor};color:#fff;font-size:${sizeFont}px;font-weight:700;text-decoration:none;box-shadow:0 2px 8px rgba(0,0,0,0.12);letter-spacing:0.2px;`;
            const linkSnippet = `<a href="${widgetUrl}" target="_blank" rel="noopener" style="${btnInlineStyle}">${btnText} →</a>`;
            // Block copying the embed code / URL while there are
            // unsaved changes. The URL is built from the LOCAL slug;
            // if the hotelier edited their name/slug but hasn't saved,
            // copying would hand them a URL whose slug doesn't exist
            // in the cloud yet → guests get "Hotel not found". When
            // dirty, the copy is a no-op + the button reads "Save
            // first".
            const unsaved = isDirty();
            const copyToClipboard = (text) => {
              if (unsaved) return;
              if (typeof navigator !== 'undefined' && navigator.clipboard) {
                navigator.clipboard.writeText(text).catch(() => {});
              }
            };
            return (
              <>
                {unsaved && (
                  <div style={{ padding: '8px 10px', background: T.bgSoft, border: `1px solid ${T.borderSoft}`, borderRadius: 7, fontSize: 11, color: T.ink2, fontWeight: 600, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Icon name="info" size={12} color={T.ink3} stroke={2.2} />
                    Tap <strong>Save</strong> (top-right) before copying — your link reflects unsaved edits.
                  </div>
                )}
                {/* HONEST status: surfaces only when the runtime check
                    detects that the anon-RLS migration hasn't been
                    pasted into Supabase yet. Auto-hides once the
                    check resolves to "live". Flip to "live" on a green
                    chip instead if you want the hotelier to see
                    confirmation; today we just hide it silently to
                    keep the screen calm. */}
                {widgetRlsLive === false && (
                  <div style={{
                    padding: '10px 12px', background: 'oklch(96% 0.06 75)',
                    border: '1.5px solid oklch(72% 0.14 75)', borderRadius: 8,
                    marginBottom: 12, display: 'flex', gap: 8, alignItems: 'flex-start',
                  }}>
                    <Icon name="info" size={14} color="oklch(40% 0.14 75)" stroke={2.2} />
                    <div style={{ fontSize: 11, color: 'oklch(35% 0.14 75)', fontWeight: 600, lineHeight: 1.5 }}>
                      <strong>Before sharing this link with guests:</strong> paste{' '}
                      <code style={{ background: 'oklch(98% 0.02 75)', padding: '1px 4px', borderRadius: 3, fontFamily: 'JetBrains Mono, monospace', fontSize: 10.5 }}>supabase/migrations/20260605_widget_anon_access.sql</code>{' '}
                      into your Supabase SQL Editor (one-time, ~30 seconds). Until then guest bookings stay in the guest's browser and never reach your diary.
                    </div>
                  </div>
                )}
                {widgetRlsLive === true && (
                  <div style={{
                    padding: '8px 12px', background: 'oklch(96% 0.05 155)',
                    border: '1px solid oklch(72% 0.10 155)', borderRadius: 8,
                    marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center',
                  }}>
                    <Icon name="check" size={13} color="oklch(35% 0.13 155)" stroke={2.4} />
                    <div style={{ fontSize: 11, color: 'oklch(30% 0.13 155)', fontWeight: 700 }}>
                      Guest bookings via this link will land in your diary.
                    </div>
                  </div>
                )}
                <div style={{ fontSize: 11, color: T.ink3, fontWeight: 600, lineHeight: 1.5, marginBottom: 10 }}>
                  Share this link, or paste the embed code into your hotel website. Customers fill in dates and contact details; the booking lands in your Diary marked <strong>tentative</strong> via the Website channel for you to review before confirming.
                </div>
                <div style={{ fontSize: 10, color: T.ink3, fontWeight: 700, letterSpacing: 0.4, marginBottom: 6 }}>SHORT CODE (PRETTY URL ENDING)</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                  <span style={{ fontSize: 11, color: T.ink3, fontWeight: 600, whiteSpace: 'nowrap' }}>{origin}{basePath}book/</span>
                  <input
                    value={profile.shortCode || ''}
                    onChange={(e) => setProfile({ ...profile, shortCode: slugify(e.target.value) })}
                    placeholder={slugify(profile.name)}
                    style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 700, color: T.ink, padding: '7px 10px', border: `1px solid ${T.border}`, borderRadius: 7, background: T.card, fontFamily: 'JetBrains Mono, monospace' }}
                  />
                </div>
                <div style={{ fontSize: 10, color: T.ink3, fontStyle: 'italic', marginBottom: 12, lineHeight: 1.4 }}>
                  Leave empty to use your property name. Letters / numbers / dashes only; we'll clean up anything else.
                </div>
                <div style={{ fontSize: 10, color: T.ink3, fontWeight: 700, letterSpacing: 0.4, marginBottom: 6 }}>BOOKING LINK</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                  <input
                    readOnly
                    value={widgetUrl}
                    onFocus={(e) => e.target.select()}
                    style={{ flex: 1, minWidth: 0, fontSize: 11, color: T.ink, padding: '7px 10px', border: `1px solid ${T.border}`, borderRadius: 7, background: T.bgSoft, fontFamily: 'JetBrains Mono, monospace' }}
                  />
                  <Btn
                    size="sm"
                    variant="ghost"
                    disabled={unsaved}
                    onClick={() => copyToClipboard(widgetUrl)}
                  >{unsaved ? 'Save first' : 'Copy'}</Btn>
                  <Btn
                    size="sm"
                    variant="ghost"
                    onClick={() => window.open(widgetUrl, '_blank', 'noopener')}
                  >Open</Btn>
                </div>

                <div style={{ fontSize: 10, color: T.ink3, fontWeight: 700, letterSpacing: 0.4, marginBottom: 6 }}>
                  EMBED ON YOUR WEBSITE
                </div>
                <div style={{ position: 'relative', marginBottom: 10 }}>
                  <textarea
                    readOnly
                    value={iframeSnippet}
                    onFocus={(e) => e.target.select()}
                    rows={3}
                    style={{ width: '100%', boxSizing: 'border-box', fontSize: 10.5, color: T.ink, padding: '8px 10px', border: `1px solid ${T.border}`, borderRadius: 7, background: T.bgSoft, fontFamily: 'JetBrains Mono, monospace', resize: 'vertical' }}
                  />
                  <Btn
                    size="sm"
                    variant="ghost"
                    disabled={unsaved}
                    onClick={() => copyToClipboard(iframeSnippet)}
                    style={{ position: 'absolute', top: 6, right: 6 }}
                  >{unsaved ? 'Save first' : 'Copy'}</Btn>
                </div>

                <div style={{ fontSize: 10, color: T.ink3, fontWeight: 700, letterSpacing: 0.4, marginBottom: 6 }}>
                  STYLED BUTTON FOR YOUR WEBSITE
                </div>
                {/* Live preview of the button using the current config.
                    The preview renders the exact same inline-styled
                    anchor that the snippet box outputs, so what the
                    hotelier sees here is exactly what their site
                    visitor will see. */}
                <div style={{
                  padding: '18px 12px', marginBottom: 10,
                  background: 'repeating-linear-gradient(45deg, #fafafa 0 12px, #f4f4f4 12px 24px)',
                  border: `1px dashed ${T.border}`, borderRadius: 8,
                  display: 'flex', justifyContent: 'center', alignItems: 'center',
                }}>
                  <a
                    href="#"
                    onClick={(e) => e.preventDefault()}
                    style={{
                      display: 'inline-block', padding: sizePadding,
                      borderRadius: borderRadius, background: btnColor, color: '#fff',
                      fontSize: sizeFont, fontWeight: 700, textDecoration: 'none',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.12)', letterSpacing: 0.2,
                      cursor: 'default',
                    }}
                  >{btnText} →</a>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 9, fontWeight: 700, color: T.ink3, letterSpacing: 0.3, textTransform: 'uppercase', marginBottom: 3 }}>Button text</div>
                    <input
                      value={btnText}
                      placeholder="Book your stay"
                      maxLength={28}
                      onChange={(e) => setProfile({ ...profile, embedButton: { ...eb, text: e.target.value } })}
                      style={{ width: '100%', boxSizing: 'border-box', fontSize: 12, fontWeight: 700, color: T.ink, padding: '6px 9px', border: `1px solid ${T.border}`, borderRadius: 6, background: T.card }}
                    />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div>
                      <div style={{ fontSize: 9, fontWeight: 700, color: T.ink3, letterSpacing: 0.3, textTransform: 'uppercase', marginBottom: 3 }}>Shape</div>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {[
                          { id: 'pill', label: 'Pill' },
                          { id: 'rounded', label: 'Rounded' },
                          { id: 'square', label: 'Square' },
                        ].map(opt => {
                          const sel = btnStyle === opt.id;
                          return (
                            <button
                              key={opt.id}
                              onClick={() => setProfile({ ...profile, embedButton: { ...eb, style: opt.id } })}
                              style={{
                                flex: 1, padding: '5px 0', borderRadius: 5,
                                border: `1px solid ${sel ? T.primary : T.border}`,
                                background: sel ? T.primaryLt : T.card,
                                color: sel ? T.primaryDk : T.ink3,
                                fontSize: 10.5, fontWeight: 700, cursor: 'pointer',
                              }}
                            >{opt.label}</button>
                          );
                        })}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 9, fontWeight: 700, color: T.ink3, letterSpacing: 0.3, textTransform: 'uppercase', marginBottom: 3 }}>Size</div>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {[
                          { id: 'sm', label: 'S' },
                          { id: 'md', label: 'M' },
                          { id: 'lg', label: 'L' },
                        ].map(opt => {
                          const sel = btnSize === opt.id;
                          return (
                            <button
                              key={opt.id}
                              onClick={() => setProfile({ ...profile, embedButton: { ...eb, size: opt.id } })}
                              style={{
                                flex: 1, padding: '5px 0', borderRadius: 5,
                                border: `1px solid ${sel ? T.primary : T.border}`,
                                background: sel ? T.primaryLt : T.card,
                                color: sel ? T.primaryDk : T.ink3,
                                fontSize: 10.5, fontWeight: 700, cursor: 'pointer',
                              }}
                            >{opt.label}</button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 9, fontWeight: 700, color: T.ink3, letterSpacing: 0.3, textTransform: 'uppercase', marginBottom: 3 }}>Colour</div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <button
                        onClick={() => setProfile({ ...profile, embedButton: { ...eb, useCustomColour: false } })}
                        style={{
                          padding: '5px 10px', borderRadius: 5,
                          border: `1px solid ${!eb.useCustomColour ? T.primary : T.border}`,
                          background: !eb.useCustomColour ? T.primaryLt : T.card,
                          color: !eb.useCustomColour ? T.primaryDk : T.ink3,
                          fontSize: 10.5, fontWeight: 700, cursor: 'pointer',
                        }}
                      >Match brand</button>
                      <label style={{
                        position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '5px 10px', borderRadius: 5,
                        border: `1px solid ${eb.useCustomColour ? T.primary : T.border}`,
                        background: eb.useCustomColour ? T.primaryLt : T.card,
                        color: eb.useCustomColour ? T.primaryDk : T.ink3,
                        fontSize: 10.5, fontWeight: 700, cursor: 'pointer',
                      }}>
                        <input
                          type="color"
                          value={eb.color || '#c8553d'}
                          onChange={(e) => setProfile({ ...profile, embedButton: { ...eb, useCustomColour: true, color: e.target.value } })}
                          style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', border: 'none', padding: 0 }}
                        />
                        <span style={{ width: 14, height: 14, borderRadius: 3, background: eb.color || '#c8553d', border: '1px solid rgba(0,0,0,0.15)' }} />
                        Custom {eb.useCustomColour && eb.color ? eb.color.toUpperCase() : ''}
                      </label>
                    </div>
                  </div>
                </div>

                <div style={{ position: 'relative', marginBottom: 10 }}>
                  <textarea
                    readOnly
                    value={linkSnippet}
                    onFocus={(e) => e.target.select()}
                    rows={3}
                    style={{ width: '100%', boxSizing: 'border-box', fontSize: 10.5, color: T.ink, padding: '8px 10px', border: `1px solid ${T.border}`, borderRadius: 7, background: T.bgSoft, fontFamily: 'JetBrains Mono, monospace', resize: 'vertical' }}
                  />
                  <Btn
                    size="sm"
                    variant="ghost"
                    disabled={unsaved}
                    onClick={() => copyToClipboard(linkSnippet)}
                    style={{ position: 'absolute', top: 6, right: 6 }}
                  >{unsaved ? 'Save first' : 'Copy'}</Btn>
                </div>

                <div style={{ padding: '8px 10px', background: T.bgSoft, border: `1px solid ${T.borderSoft}`, borderRadius: 7, fontSize: 10, color: T.ink3, lineHeight: 1.5 }}>
                  <strong>How it works:</strong> Customer picks dates + room, fills in name + WhatsApp, taps Confirm. Booking lands in your Diary marked <strong>tentative</strong>. You confirm (or release) in the booking detail. Marking it <strong>paid</strong> confirms it automatically.
                </div>

                {/* Hold & auto-release (Q3) — configurable hold window + what
                    happens when the timer runs out. Stored on the accountant
                    jsonb (holdHours / holdMode), so no migration needed. */}
                <div style={{ marginTop: 4 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: T.ink2, letterSpacing: 0.3, marginBottom: 8 }}>HOLD &amp; AUTO-RELEASE</div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: T.ink2 }}>Hold an unpaid booking for</div>
                      <div style={{ fontSize: 10.5, color: T.ink3, lineHeight: 1.4, marginTop: 2 }}>From when it's made. Never runs past the guest's check-in time.</div>
                    </div>
                    <div style={{ background: T.bgSunk, border: `1px solid ${T.borderSoft}`, borderRadius: 10, padding: '0 10px', height: 40, display: 'flex', alignItems: 'center', gap: 4, width: 92, flexShrink: 0 }}>
                      <NumberInput
                        value={accountant.holdHours ?? 12}
                        min={1} fallback={12}
                        onChange={(n) => setAccountant({ ...accountant, holdHours: n })}
                        placeholder="12"
                        style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 15, fontWeight: 600, color: T.ink, minWidth: 0, textAlign: 'right' }}
                      />
                      <span style={{ fontSize: 11, color: T.ink3, fontWeight: 700 }}>hrs</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {[
                      { id: 'auto', title: 'Release automatically', sub: 'When the hold runs out unpaid, the unit frees itself and your OTAs are updated. Hands-off.' },
                      { id: 'reminder', title: "Remind me — don't release", sub: 'The unit stays held past the timer. You get a reminder to extend or release it yourself.' },
                    ].map(opt => {
                      const sel = (accountant.holdMode || 'auto') === opt.id;
                      return (
                        <button key={opt.id} type="button" onClick={() => setAccountant({ ...accountant, holdMode: opt.id })}
                          style={{ textAlign: 'left', display: 'flex', gap: 9, padding: '9px 11px', borderRadius: 9, cursor: 'pointer',
                            background: sel ? T.primaryLt : T.card, border: `1.5px solid ${sel ? T.primary : T.border}` }}>
                          <div style={{ width: 16, height: 16, borderRadius: 999, flexShrink: 0, marginTop: 1, border: `2px solid ${sel ? T.primary : T.border}`, background: sel ? T.primary : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {sel && <div style={{ width: 6, height: 6, borderRadius: 999, background: '#fff' }} />}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: sel ? T.primaryDk : T.ink }}>{opt.title}</div>
                            <div style={{ fontSize: 10.5, color: T.ink3, lineHeight: 1.4, marginTop: 1 }}>{opt.sub}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <div style={{ marginTop: 8, padding: '8px 10px', background: T.bgSoft, border: `1px solid ${T.borderSoft}`, borderRadius: 7, fontSize: 10, color: T.ink3, lineHeight: 1.5 }}>
                    A reminder on your phone (even when the app is closed) needs the free alerts switched on in <strong>Settings → Notifications</strong>. You can also tap an on-hold booking on the Diary to extend by 2h / 1 day / 2 days / custom.
                  </div>
                </div>
              </>
            );
          })()}
        </Card>
        </AccordionGroup>

        <AccordionGroup title="Coupons" open={openGroups.coupons} onToggle={() => toggleGroup('coupons')} hint={coupons.length > 0 ? `${coupons.filter(c => c.enabled !== false).length} active` : 'None yet'}>
          <SectionHead title="Discount codes for your booking link" style={{ marginTop: 0 }} />
          <Card padding={12}>
            <div style={{ fontSize: 10.5, color: T.ink3, fontWeight: 600, lineHeight: 1.5, marginBottom: 10 }}>
              Create codes you can hand to guests. They enter the code on the booking widget's summary screen; if valid, the discount applies to their total. Use percentage for "10% off" or flat ₹ for "₹500 off your first stay".
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {coupons.length === 0 && (
                <div style={{ fontSize: 11, color: T.ink3, fontStyle: 'italic', padding: '4px 2px' }}>
                  No coupons yet. Add one below to start.
                </div>
              )}
              {coupons.map((c, i) => (
                <div key={c.id || i} data-added-id={c.id} style={{
                  display: 'flex', flexDirection: 'column', gap: 8,
                  padding: 10, background: c.enabled === false ? T.card : T.bgSoft,
                  border: `1px solid ${c.enabled === false ? T.border : T.borderSoft}`,
                  borderRadius: 8, opacity: c.enabled === false ? 0.65 : 1,
                  ...justAddedStyle(c.id),
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      value={c.code || ''}
                      placeholder="CODE"
                      onChange={(ev) => setCoupons(arr => arr.map((x, j) => j === i ? { ...x, code: ev.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16) } : x))}
                      style={{ flex: 1, fontSize: 13, fontWeight: 800, letterSpacing: 1, color: T.ink, padding: '6px 10px', border: `1px solid ${T.border}`, borderRadius: 6, background: T.card, fontFamily: 'JetBrains Mono, monospace' }}
                    />
                    <Toggle
                      on={c.enabled !== false}
                      onChange={(v) => setCoupons(arr => arr.map((x, j) => j === i ? { ...x, enabled: v } : x))}
                    />
                    <button
                      onClick={() => setCoupons(arr => arr.filter((_, j) => j !== i))}
                      title="Delete this coupon"
                      style={{ background: 'none', border: 'none', color: T.ink3, cursor: 'pointer', padding: 0, flexShrink: 0 }}
                    ><Icon name="x" size={13} /></button>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 10, color: T.ink3, fontWeight: 700, letterSpacing: 0.3 }}>DISCOUNT</span>
                    <div style={{ display: 'inline-flex', gap: 3 }}>
                      {['flat', 'pct'].map(mode => {
                        const sel = (c.discount?.mode || 'pct') === mode;
                        return (
                          <button
                            key={mode}
                            onClick={() => setCoupons(arr => arr.map((x, j) => j === i ? { ...x, discount: { ...(x.discount || {}), mode, value: x.discount?.value || 0 } } : x))}
                            style={{
                              padding: '4px 9px', borderRadius: 5,
                              border: `1px solid ${sel ? T.primary : T.border}`,
                              background: sel ? T.primaryLt : T.card,
                              color: sel ? T.primaryDk : T.ink3,
                              fontSize: 10.5, fontWeight: 700, cursor: 'pointer',
                            }}
                          >{mode === 'flat' ? '₹ flat' : '% off'}</button>
                        );
                      })}
                    </div>
                    <NumberInput
                      min={0}
                      value={c.discount?.value || 0}
                      onChange={(n) => setCoupons(arr => arr.map((x, j) => j === i ? { ...x, discount: { ...(x.discount || { mode: 'pct' }), value: n } } : x))}
                      className="tnum"
                      style={{ width: 72, fontSize: 12, fontWeight: 700, color: T.ink, border: `1px solid ${T.border}`, outline: 'none', borderRadius: 5, padding: '4px 6px', background: T.card }}
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 10, color: T.ink3, fontWeight: 700, letterSpacing: 0.3 }}>EXPIRES</span>
                    <input
                      type="date"
                      value={c.expiryIso || ''}
                      onChange={(ev) => setCoupons(arr => arr.map((x, j) => j === i ? { ...x, expiryIso: ev.target.value || null } : x))}
                      style={{ fontSize: 11, color: T.ink2, padding: '4px 6px', border: `1px solid ${T.border}`, borderRadius: 5, background: T.card }}
                    />
                    {(() => {
                      // Red chip when the expiry is in the past — the
                      // coupon is silently invalid (widget rejects the
                      // code) but stayed `enabled: true` in the list
                      // with no warning. Now there's a visible flag so
                      // the hotelier knows to update or disable it.
                      if (!c.expiryIso) {
                        return <span style={{ fontSize: 9.5, color: T.ink3, fontWeight: 600, fontStyle: 'italic' }}>blank = no expiry</span>;
                      }
                      const today = new Date(); today.setHours(0,0,0,0);
                      const exp = new Date(c.expiryIso + 'T00:00:00');
                      if (!isNaN(exp.getTime()) && exp < today) {
                        return <span style={{ fontSize: 9.5, color: T.danger, fontWeight: 800, padding: '2px 6px', background: 'oklch(95% 0.06 30)', borderRadius: 4 }}>Already expired</span>;
                      }
                      return null;
                    })()}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 10, color: T.ink3, fontWeight: 700, letterSpacing: 0.3 }}>MIN NIGHTS</span>
                    <NumberInput
                      min={0}
                      value={c.minNights || 0}
                      onChange={(n) => setCoupons(arr => arr.map((x, j) => j === i ? { ...x, minNights: n } : x))}
                      className="tnum"
                      style={{ width: 56, fontSize: 11, fontWeight: 700, color: T.ink, border: `1px solid ${T.border}`, outline: 'none', borderRadius: 5, padding: '4px 6px', background: T.card }}
                    />
                    <span style={{ fontSize: 10, color: T.ink3, fontWeight: 700, letterSpacing: 0.3, marginLeft: 6 }}>MAX USES</span>
                    <NumberInput
                      min={0}
                      value={c.maxUses || 0}
                      onChange={(n) => setCoupons(arr => arr.map((x, j) => j === i ? { ...x, maxUses: n } : x))}
                      className="tnum"
                      style={{ width: 56, fontSize: 11, fontWeight: 700, color: T.ink, border: `1px solid ${T.border}`, outline: 'none', borderRadius: 5, padding: '4px 6px', background: T.card }}
                    />
                    <span style={{ fontSize: 9.5, color: T.ink3, fontWeight: 600, fontStyle: 'italic' }}>0 = no cap</span>
                  </div>
                  {(c.usedCount || 0) > 0 && (
                    <div style={{ fontSize: 10, color: T.ink3, fontWeight: 600, padding: '4px 8px', background: T.card, border: `1px dashed ${T.borderSoft}`, borderRadius: 5 }}>
                      Used <strong style={{ color: T.primaryDk }}>{c.usedCount}</strong> time{c.usedCount === 1 ? '' : 's'} so far
                    </div>
                  )}
                </div>
              ))}
            </div>
            <button
              onClick={() => {
                const id = 'cp_' + Date.now().toString(36);
                setCoupons(arr => [...arr, {
                  id,
                  code: '',
                  discount: { mode: 'pct', value: 10 },
                  expiryIso: null,
                  minNights: 0,
                  maxUses: 0,
                  usedCount: 0,
                  enabled: true,
                }]);
                setJustAddedId(id);
              }}
              style={{
                marginTop: 10, width: '100%',
                padding: '9px 12px', borderRadius: 8,
                border: `1.5px dashed ${T.border}`, background: T.card,
                color: T.ink2, fontSize: 12, fontWeight: 700,
                cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              <Icon name="plus" size={12} color={T.ink2} />
              Add coupon
            </button>
          </Card>
        </AccordionGroup>

        <AccordionGroup title="Team members" open={openGroups.teamMembers} onToggle={() => toggleGroup('teamMembers')} hint={session ? 'Live' : 'Sign-in required'}>
          <SectionHead title="People with access to this property" style={{ marginTop: 0 }} />
          <Card padding={12}>
            <TeamSection session={session} propertyId={propertyId} canManageTeam={canManageTeam} />
          </Card>
        </AccordionGroup>

        <AccordionGroup title="Team alerts" open={openGroups.teamAlerts} onToggle={() => toggleGroup('teamAlerts')} hint={Array.isArray(profile.arrivalsRecipients) && profile.arrivalsRecipients.length > 0 ? `${profile.arrivalsRecipients.length} recipient${profile.arrivalsRecipients.length === 1 ? '' : 's'}` : 'None yet'}>
          <SectionHead title="Send tomorrow's arrivals on WhatsApp" style={{ marginTop: 0 }} />
          <Card padding={12}>
            <div style={{ fontSize: 10.5, color: T.ink3, fontWeight: 600, lineHeight: 1.5, marginBottom: 10 }}>
              Phone numbers that get tomorrow's arrival list when you tap <strong>Send arrivals</strong> on the Dashboard. Each tap opens a pre-filled WhatsApp message per recipient (guest name, dates, room, balance, special requests). The Dashboard surfaces a one-tap card when there are check-ins ahead. <em>Auto-send each morning is on the roadmap, not live yet.</em>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {(profile.arrivalsRecipients || []).length === 0 && (
                <div style={{ fontSize: 11, color: T.ink3, fontStyle: 'italic', padding: '4px 2px' }}>
                  No recipients yet. Add yourself, your reception manager, or the housekeeper.
                </div>
              )}
              {(profile.arrivalsRecipients || []).map((r, i) => (
                <div key={r.id || i} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: 10, background: T.bgSoft, border: `1px solid ${T.borderSoft}`, borderRadius: 8,
                }}>
                  <input
                    value={r.label || ''}
                    placeholder="Label (e.g. Manager)"
                    onChange={(e) => setProfile({ ...profile, arrivalsRecipients: (profile.arrivalsRecipients || []).map((x, j) => j === i ? { ...x, label: e.target.value } : x) })}
                    style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 700, color: T.ink, padding: '6px 9px', border: `1px solid ${T.border}`, borderRadius: 6, background: T.card }}
                  />
                  <input
                    value={r.phone || ''}
                    placeholder="+91 98100 12345"
                    inputMode="tel"
                    maxLength={18}
                    onChange={(e) => setProfile({ ...profile, arrivalsRecipients: (profile.arrivalsRecipients || []).map((x, j) => j === i ? { ...x, phone: e.target.value.replace(/[^\d+\-() ]/g, '').slice(0, 18) } : x) })}
                    style={{ flex: 1.4, minWidth: 0, fontSize: 12, fontWeight: 700, color: T.ink, padding: '6px 9px', border: `1px solid ${T.border}`, borderRadius: 6, background: T.card, fontFamily: 'JetBrains Mono, monospace' }}
                  />
                  <button
                    onClick={() => setProfile({ ...profile, arrivalsRecipients: (profile.arrivalsRecipients || []).filter((_, j) => j !== i) })}
                    title="Remove"
                    style={{ background: 'none', border: 'none', color: T.ink3, cursor: 'pointer', padding: 2, flexShrink: 0 }}
                  ><Icon name="x" size={13} /></button>
                </div>
              ))}
            </div>
            <button
              onClick={() => {
                const id = 'rec_' + Date.now().toString(36);
                setProfile({ ...profile, arrivalsRecipients: [...(profile.arrivalsRecipients || []), { id, label: '', phone: '' }] });
              }}
              style={{
                marginTop: 10, width: '100%',
                padding: '9px 12px', borderRadius: 8,
                border: `1.5px dashed ${T.border}`, background: T.card,
                color: T.ink2, fontSize: 12, fontWeight: 700,
                cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              <Icon name="plus" size={12} color={T.ink2} />
              Add recipient
            </button>
            <div style={{ marginTop: 10, padding: '8px 10px', background: T.bgSoft, border: `1px solid ${T.borderSoft}`, borderRadius: 7, fontSize: 10, color: T.ink3, lineHeight: 1.5 }}>
              <strong>Note:</strong> WhatsApp opens with the pre-filled message — you tap Send. Truly automatic sending without your tap needs the WhatsApp Business Cloud API (Phase 3).
            </div>
          </Card>
        </AccordionGroup>

        <AccordionGroup title="House rules" open={openGroups.houseRules} onToggle={() => toggleGroup('houseRules')} hint={`${effectiveChildBands({ accountant }).length} child bands`}>
        {/* Capacity + child-age tiers that drive extra-guest pricing.
            The category-level "Extra adult" + "Extra child" rates
            (inside Rooms + amenities) reference these. */}
        <SectionHead title="Child age bands" style={{ marginTop: 0 }} />
        <Card padding={12}>
          <div style={{ fontSize: 10.5, color: T.ink3, fontWeight: 600, lineHeight: 1.5, marginBottom: 12 }}>
            Define your child age groups. You set the ₹ price for each group per room type (Rooms + amenities) and can override it per season (Pricing rules). Make the youngest band free by setting its price to ₹0. Used in New Booking, the website widget and the voucher.
          </div>
          {(() => {
            const bands = effectiveChildBands({ accountant });
            const setBands = (next) => setAccountant(a => ({ ...a, childBands: next }));
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {bands.map((b, i) => (
                  <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input
                      value={b.label || ''}
                      placeholder="Band name (e.g. 5–10 yrs)"
                      onChange={(e) => setBands(bands.map((x, j) => j === i ? { ...x, label: e.target.value } : x))}
                      style={{ flex: 1, minWidth: 0, border: `1px solid ${T.border}`, outline: 'none', borderRadius: 6, padding: '6px 8px', fontSize: 12, fontWeight: 600, color: T.ink, background: T.card }}
                    />
                    <span style={{ fontSize: 10, color: T.ink3, fontWeight: 600 }}>under</span>
                    <input
                      type="number" inputMode="numeric" min={1}
                      value={b.maxAge ?? ''}
                      placeholder="& up"
                      onChange={(e) => { const v = e.target.value; const n = v === '' ? null : Math.max(1, Math.round(+v || 0)); setBands(bands.map((x, j) => j === i ? { ...x, maxAge: n } : x)); }}
                      className="tnum"
                      style={{ width: 58, border: `1px solid ${T.border}`, outline: 'none', borderRadius: 6, padding: '6px 6px', fontSize: 12, fontWeight: 700, color: T.ink, background: T.card, textAlign: 'center' }}
                    />
                    <span style={{ fontSize: 10, color: T.ink3, fontWeight: 600 }}>y</span>
                    {bands.length > 1 && (
                      <button onClick={() => setBands(bands.filter((_, j) => j !== i))} title="Remove band" style={{ background: 'none', border: 'none', color: T.ink3, cursor: 'pointer', padding: 2, flexShrink: 0 }}>
                        <Icon name="x" size={12} />
                      </button>
                    )}
                  </div>
                ))}
                <button
                  onClick={() => setBands([...bands, { id: 'cb_' + Date.now().toString(36), label: '', maxAge: null }])}
                  style={{ marginTop: 2, alignSelf: 'flex-start', padding: '6px 10px', borderRadius: 8, border: `1.5px dashed ${T.border}`, background: T.card, color: T.ink2, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <Icon name="plus" size={11} color={T.ink2} /> Add band
                </button>
                <div style={{ fontSize: 9.5, color: T.ink3, fontWeight: 600, fontStyle: 'italic', lineHeight: 1.4, marginTop: 2 }}>
                  "Under {'{age}'}" = children below that age fall in this band. Leave the top band's age blank for "and up". List youngest to oldest.
                </div>
              </div>
            );
          })()}
        </Card>

        <SectionHead title="Adults included in the base rate" style={{ marginTop: 16 }} />
        <Card padding={12}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: T.ink2 }}>Standard occupancy</label>
            <div style={{ background: T.bgSunk, border: `1px solid ${T.borderSoft}`, borderRadius: 10, padding: '0 12px', height: 44, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="users" size={12} color={T.ink3} />
              <NumberInput
                value={baseCapacityAdults}
                min={1} fallback={2}
                onChange={(n) => setBaseCapacityAdults(n)}
                placeholder="2"
                style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 15, fontWeight: 500, color: T.ink, minWidth: 0 }}
              />
            </div>
            <span style={{ fontSize: 11, color: T.ink3 }}>Adults above this count are charged the per-category extra-adult rate.</span>
          </div>
        </Card>

        <SectionHead title={t('houseRules')} style={{ marginTop: 16 }} />
        <Card padding={12}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {rules.map((r, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: T.bgSoft, borderRadius: 8 }}>
                <span style={{ width: 4, height: 4, borderRadius: 2, background: T.primary }} />
                <span style={{ flex: 1, fontSize: 12, color: T.ink2, fontWeight: 600 }}>{r}</span>
                <button onClick={() => setRules(arr => arr.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', color: T.ink3, cursor: 'pointer' }}><Icon name="x" size={11} /></button>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <input value={newRule} onChange={e => setNewRule(e.target.value)} placeholder={t('rulesPlaceholder')} style={{ flex: 1, border: `1px solid ${T.border}`, outline: 'none', borderRadius: 7, padding: '7px 10px', fontSize: 12, color: T.ink, background: T.card }} />
            <button onClick={() => { if (newRule.trim()) { setRules(r => [...r, newRule.trim()]); setNewRule(''); } }} style={{ border: 'none', background: T.primary, color: '#fff', borderRadius: 7, padding: '0 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{t('addRule')}</button>
          </div>
        </Card>

        {/* Pre-arrival reminders — surface in Dashboard's Today's
            Nudges card the day before each arrival. One nudge per
            reminder × per tomorrow-arriving guest. Tap → opens
            WhatsApp pre-filled with the reminder text + guest's
            name. Useful for property-specific asks: cab booking,
            dietary needs, ID upload, late check-in confirmation. */}
        <SectionHead title="Pre-arrival reminders" style={{ marginTop: 16 }} />
        <Card padding={12}>
          <div style={{ fontSize: 11, color: T.ink3, fontWeight: 600, lineHeight: 1.5, marginBottom: 10 }}>
            Each reminder appears in the Dashboard's <strong>Today's Nudges</strong> card the day before every arrival, with a one-tap WhatsApp button to send it to the guest.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {customReminders.length === 0 && (
              <div style={{ fontSize: 11, color: T.ink3, fontStyle: 'italic', padding: '6px 2px' }}>No custom reminders yet. Examples below.</div>
            )}
            {customReminders.map((r) => (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: T.bgSoft, borderRadius: 8 }}>
                <Icon name="wa" size={12} color="#25D366" />
                <span style={{ flex: 1, fontSize: 12, color: T.ink2, fontWeight: 600 }}>{r.text}</span>
                <button onClick={() => setCustomReminders(arr => arr.filter(x => x.id !== r.id))} style={{ background: 'none', border: 'none', color: T.ink3, cursor: 'pointer' }} title="Remove"><Icon name="x" size={11} /></button>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <input
              value={newReminder}
              onChange={(e) => setNewReminder(e.target.value)}
              placeholder="e.g. Confirm airport pickup time"
              maxLength={140}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newReminder.trim()) {
                  setCustomReminders(arr => [...arr, { id: 'rem_' + Date.now().toString(36), text: newReminder.trim() }]);
                  setNewReminder('');
                }
              }}
              style={{ flex: 1, border: `1px solid ${T.border}`, outline: 'none', borderRadius: 7, padding: '7px 10px', fontSize: 12, color: T.ink, background: T.card }}
            />
            <button
              onClick={() => {
                if (newReminder.trim()) {
                  setCustomReminders(arr => [...arr, { id: 'rem_' + Date.now().toString(36), text: newReminder.trim() }]);
                  setNewReminder('');
                }
              }}
              disabled={!newReminder.trim()}
              style={{ border: 'none', background: newReminder.trim() ? T.primary : T.bgSoft, color: newReminder.trim() ? '#fff' : T.ink3, borderRadius: 7, padding: '0 14px', fontSize: 12, fontWeight: 700, cursor: newReminder.trim() ? 'pointer' : 'not-allowed' }}
            >Add</button>
          </div>
          {/* Quick-add suggestions a hotelier can tap to skip typing */}
          {customReminders.length === 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
              {[
                'Confirm airport pickup / cab',
                'Ask for ID / Aadhaar in advance',
                'Confirm dietary requirements',
                'Late check-in time confirmation',
                'Share parking / arrival instructions',
              ].map((example) => (
                <button
                  key={example}
                  onClick={() => setCustomReminders(arr => [...arr, { id: 'rem_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 4), text: example }])}
                  style={{ padding: '4px 10px', borderRadius: 999, border: `1px dashed ${T.border}`, background: T.card, color: T.ink3, fontSize: 10.5, fontWeight: 700, cursor: 'pointer' }}
                >+ {example}</button>
              ))}
            </div>
          )}
        </Card>
        </AccordionGroup>
      </div>
    </div>
  );
}

export default function Settings({ go, plan = 'engine', onChangePlan, lang, onChangeLang, property, onChangeProperty, savedExtras = [], onChangeSavedExtras, bookings = [], t, session, propertyId, onSignOut, can = () => true }) {
  // RBAC. manage_settings gates the property-profile EDIT sheet; the
  // card itself stays visible so non-settings members still see basic
  // property info (name, GSTIN status, room count). Plan picker stays
  // unrestricted — that's an Atithi-tier decision the property owner
  // makes, not a per-staff permission. Account section (sign out)
  // stays unrestricted too.
  const canEditSettings = can('manage_settings');
  const [showProfile, setShowProfile] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  // Upgrade-tier popup. Tier 1 (Engine) is free + active for every
  // hotelier. Tier 2 (Channels) + Tier 3 (Invoicing) are paid add-ons
  // that aren't wired to a real billing flow yet — tapping them opens
  // this sheet asking the hotelier to contact support. Each tap is
  // logged via logActivity so the owner can see which hoteliers are
  // asking about which tier via the Activity log.
  const [upgradeFor, setUpgradeFor] = useState(null); // null | 'channels' | 'invoicing'
  const totalUnits = property.categories.reduce((s, c) => s + (c.units || 0), 0);
  const locationLabel = [property.profile.city, property.profile.state].filter(Boolean).join(', ');

  const handleSignOut = async () => {
    if (signingOut || !onSignOut) return;
    setSigningOut(true);
    await onSignOut();
    // App.jsx swaps to <SignIn /> on the SIGNED_OUT event, so we don't need
    // to reset signingOut here — this component will unmount.
  };

  // Reset-my-property flow. Two-step confirm: tap once to arm, tap
  // again within 5 seconds to actually wipe. Prevents accidental
  // taps from nuking real data, without putting a clunky modal in
  // the way for the hotelier who genuinely needs to reset.
  const [resetArmed, setResetArmed] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState('');
  const handleReset = async () => {
    if (resetting) return;
    if (!resetArmed) {
      setResetArmed(true);
      setTimeout(() => setResetArmed(false), 5000);
      return;
    }
    setResetting(true);
    setResetError('');
    try {
      await resetMyProperty(propertyId);
      // Wipe localStorage demo data so the cloud-empty state isn't
      // overwritten by stale local state on the next render. We
      // remove every atithi.*.v1 key — they'll be re-seeded from
      // the cloud (which is now empty) when the page reloads.
      try {
        const keys = Object.keys(localStorage).filter(k => k.startsWith('atithi.'));
        keys.forEach(k => localStorage.removeItem(k));
      } catch {}
      // Hard reload — easiest way to guarantee the cloud-load path
      // re-runs against the freshly-cleared property, the
      // Onboarding wizard fires, and no stale React state lingers.
      window.location.reload();
    } catch (e) {
      setResetting(false);
      setResetArmed(false);
      setResetError(e?.message || t('resetFailedFallback'));
    }
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: T.bg }}>
      <ScreenHeader title={t('settings')} subtitle={property.profile.name} onBack={() => go('__back')} />
      <div style={{ flex: 1, overflow: 'auto', padding: 14, paddingBottom: 100 }}>

        <Card padding={0} style={{ overflow: 'hidden', marginBottom: 14, cursor: canEditSettings ? 'pointer' : 'default' }} onClick={canEditSettings ? () => setShowProfile(true) : undefined}>
          <div style={{ height: 80, background: `linear-gradient(135deg, ${T.primary}, ${T.primaryDk})`, position: 'relative' }}>
            <svg style={{ position: 'absolute', right: -10, bottom: -20, opacity: 0.18 }} width="180" height="120" viewBox="0 0 180 120">
              <path d="M0 100 L30 60 L60 90 L90 40 L120 80 L150 50 L180 100" stroke="#fff" strokeWidth="2" fill="none"/>
            </svg>
          </div>
          <div style={{ padding: 14, marginTop: -30, position: 'relative' }}>
            <div style={{ width: 56, height: 56, borderRadius: 14, background: T.card, padding: 3, boxShadow: '0 4px 12px rgba(0,0,0,.1)' }}>
              {property.profile.logoDataUrl ? (
                <img
                  src={property.profile.logoDataUrl}
                  alt="Property logo"
                  style={{ width: '100%', height: '100%', borderRadius: 11, objectFit: 'contain', background: '#fff' }}
                />
              ) : (
                <div style={{ width: '100%', height: '100%', borderRadius: 11, background: `repeating-linear-gradient(45deg, ${T.tagSaffron} 0 6px, oklch(80% 0.10 65) 6px 12px)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, color: 'rgba(0,0,0,0.4)', fontWeight: 800 }}>{(property.profile.name || 'Y').trim().charAt(0).toUpperCase()}</div>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 8, gap: 8 }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{property.profile.name}</div>
                <div style={{ fontSize: 11, color: T.ink3 }}>{locationLabel} · {totalUnits} {t('repUnits')}</div>
              </div>
              {/* Unambiguous Edit affordance. The bare > chevron was so
                  subtle that hoteliers didn't realise the card was
                  tappable. Solid pill with an edit-pencil icon + the
                  word EDIT reads as a real button. */}
              {canEditSettings ? (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '6px 12px', borderRadius: 999,
                  background: T.primary, color: '#fff',
                  fontSize: 11, fontWeight: 800, letterSpacing: 0.4,
                  boxShadow: '0 2px 6px rgba(0,0,0,0.12)', flexShrink: 0,
                }}>
                  <Icon name="edit" size={12} color="#fff" stroke={2.4} />
                  {t('editPill')}
                </span>
              ) : (
                <span style={{ fontSize: 10, color: T.ink3, fontWeight: 700, padding: '4px 8px', background: T.bgSoft, borderRadius: 6, flexShrink: 0 }}>
                  {t('viewOnly')}
                </span>
              )}
            </div>
            {/* Honest status chips — show the GSTIN only when the hotelier
                has actually entered one in Property Profile. The earlier
                "verified" wording falsely implied we'd validated it. The
                old "FRRO registered" chip was a cosmetic claim with no
                real signal behind it; dropped until we have an actual
                hook. */}
            <div style={{ display: 'flex', gap: 5, marginTop: 8 }}>
              {property.gstin
                ? <Chip color="ok" icon="check" style={{ fontSize: 9 }}>GSTIN · {property.gstin}</Chip>
                : <Chip color="warn" style={{ fontSize: 9 }}>{t('gstinNotSet')}</Chip>}
              {totalUnits > 0 && <Chip color="indigo" style={{ fontSize: 9 }}>{totalUnits} {t('roomsLive')}</Chip>}
            </div>
          </div>
        </Card>

        <SectionHead title={t('language')} />
        <Card padding={5}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>
            {[
              { id: 'en', label: 'English', sub: 'A · B · C' },
              { id: 'hi', label: 'हिन्दी',  sub: 'क · ख · ग' },
            ].map(l => (
              <button key={l.id} onClick={() => onChangeLang && onChangeLang(l.id)} style={{
                padding: '12px 8px', borderRadius: 8, border: 'none',
                background: lang === l.id ? T.primaryLt : 'transparent',
                color: lang === l.id ? T.primaryDk : T.ink2,
                cursor: 'pointer', textAlign: 'left',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 14, fontWeight: 700 }}>{l.label}</span>
                  {lang === l.id && <Icon name="check" size={13} color={T.primary} stroke={2.4} />}
                </div>
                <div style={{ fontSize: 10, color: T.ink3, marginTop: 2, fontWeight: 600 }}>{l.sub}</div>
              </button>
            ))}
          </div>
        </Card>

        <SectionHead title={t('advancedSettings')} style={{ marginTop: 16 }} />
        <Card padding={0} style={{ marginBottom: 14 }}>
          <button onClick={() => go('advanced')} style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 12,
            padding: 14, background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left',
          }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: T.primaryLt, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon name="cog" size={18} color={T.primary} stroke={2} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>{t('advancedSettings')}</div>
              <div style={{ fontSize: 11, color: T.ink3, marginTop: 1 }}>{t('advancedSettingsSub')}</div>
            </div>
            <Icon name="chev" size={16} color={T.ink3} stroke={2.2} />
          </button>
        </Card>

        <SectionHead title={t('yourPlan')} style={{ marginTop: 16 }} />
        <Card padding={0} style={{ marginBottom: 14 }}>
          {[
            { id: 'engine',    name: t('planEngine'),    price: '₹499',  tagline: t('planEngineDesc'),    color: T.primary },
            { id: 'channels',  name: t('planChannels'),  price: '₹999',  tagline: t('planChannelsDesc'),  color: T.indigo },
            { id: 'invoicing', name: t('planInvoicing'), price: '₹1499', tagline: t('planInvoicingDesc'), color: T.teal },
          ].map((p, i, arr) => {
            const sel = plan === p.id;
            return (
              <div
                key={p.id}
                onClick={() => {
                  if (p.id === 'engine') {
                    // Tier 1 — free for everyone, just switch.
                    onChangePlan && onChangePlan(p.id);
                    return;
                  }
                  // Tier 2 / 3 are paid add-ons. Open the upgrade
                  // popup + log the click so the owner can see
                  // upgrade interest in the Activity log.
                  setUpgradeFor(p.id);
                  if (propertyId && session && session.user && session.user.id) {
                    logActivity(
                      propertyId,
                      session.user.id,
                      'tier.upgrade_clicked',
                      'tier',
                      p.id,
                      { from: plan, askedFor: p.id, tierName: p.name }
                    );
                  }
                }}
                className="atithi-tap"
                style={{
                  padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12,
                  borderBottom: i < arr.length - 1 ? `1px solid ${T.borderSoft}` : 'none',
                  cursor: 'pointer',
                  background: sel ? `color-mix(in oklch, ${p.color} 6%, white)` : 'transparent',
                }}
              >
                <div style={{
                  width: 22, height: 22, borderRadius: '50%',
                  border: `2px solid ${sel ? p.color : T.border}`,
                  background: sel ? p.color : 'transparent',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  {sel && <Icon name="check" size={12} color="#fff" stroke={3} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: sel ? p.color : T.ink }}>{p.name}</div>
                  <div style={{ fontSize: 10.5, color: T.ink3, marginTop: 1, fontWeight: 600 }}>{p.tagline}</div>
                </div>
                <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                  <div className="tnum" style={{ fontSize: 13, fontWeight: 700, color: T.ink, letterSpacing: -0.3 }}>{p.price}<span style={{ fontSize: 9, color: T.ink3, fontWeight: 600 }}>/mo</span></div>
                  {p.id !== 'engine' && !sel && (
                    <span style={{ fontSize: 8.5, fontWeight: 800, color: p.color, letterSpacing: 0.5, padding: '2px 6px', background: `color-mix(in oklch, ${p.color} 12%, white)`, borderRadius: 4 }}>{t('upgradeWord')}</span>
                  )}
                </div>
              </div>
            );
          })}
        </Card>

        {/* Integrations card removed June 2026 per owner. The list felt
            apologetic ("we don't have X yet") even with honest status
            chips. Status of each integration is tracked in
            CLAUDE.md + NOT_WIRED.md for our records. The actually
            useful, hotelier-facing surface for each:
              - Razorpay / payments → Settings → Property profile →
                Payment QR (the chosen UPI flow)
              - WhatsApp → wa.me buttons on BookingDetail + Dashboard
                nudges + Public widget. Phase 3 will auto-send.
              - Channel manager → Channels screen (Coming soon).
                Phase 5 — STAAH partnership in progress.
              - Form C / FRRO → "Form C required" pills on the diary
                + Reports. Hotelier files manually at indianfrro.gov.in.
        */}

        {/* Install Atithi card. Visible to everyone (signed-in or DEMO)
            because anyone might want to add the app to their home
            screen. Hides itself when already running standalone. */}
        <SectionHead title={t('appSection')} style={{ marginTop: 16 }} />
        <InstallAppCard t={t} />

        {session && propertyId && (
          <>
            <SectionHead title={t('pushSection')} style={{ marginTop: 16 }} />
            <PushAlertsCard t={t} propertyId={propertyId} userId={session.user?.id} />
          </>
        )}

        {session && (
          <>
            <SectionHead title={t('account')} style={{ marginTop: 16 }} />
            <Card padding={14}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 9, color: T.ink3, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase' }}>
                    {t('signedInAs')}
                  </div>
                  <div style={{
                    fontSize: 13, fontWeight: 700, color: T.ink, marginTop: 3,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {session.user?.email}
                  </div>
                </div>
                <Btn variant="ghost" size="sm" icon="door" onClick={handleSignOut} disabled={signingOut}>
                  {signingOut ? t('signingOut') : t('signOut')}
                </Btn>
              </div>
            </Card>

            {/* Danger zone — full property reset. Two-tap confirm so
                accidental taps don't wipe real data. Only visible to
                members with manage_settings; reception staff don't
                need this lever and definitely shouldn't have it. */}
            {canEditSettings && (
              <>
                <SectionHead title={t('dangerZone')} style={{ marginTop: 16 }} />
                <Card padding={14} style={{ border: `1.5px solid ${T.danger}`, background: 'oklch(99% 0.012 30)' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: T.danger, marginBottom: 4 }}>
                    {t('resetTitle')}
                  </div>
                  <div style={{ fontSize: 11, color: T.ink3, fontWeight: 600, lineHeight: 1.5, marginBottom: 10 }}>
                    {t('resetBody')}
                  </div>
                  {resetError && (
                    <div style={{ padding: '8px 10px', background: 'oklch(95% 0.06 30)', borderRadius: 7, fontSize: 11, color: T.danger, fontWeight: 600, marginBottom: 10 }}>
                      {resetError}
                    </div>
                  )}
                  <button
                    onClick={handleReset}
                    disabled={resetting}
                    style={{
                      width: '100%', padding: '10px 12px', borderRadius: 8,
                      border: `1.5px solid ${T.danger}`,
                      background: resetArmed ? T.danger : 'transparent',
                      color: resetArmed ? '#fff' : T.danger,
                      fontSize: 12, fontWeight: 700, cursor: resetting ? 'wait' : 'pointer',
                      letterSpacing: resetArmed ? 0.4 : 0,
                    }}
                  >
                    {resetting
                      ? t('resetWord')
                      : resetArmed
                        ? t('resetConfirm')
                        : t('resetBtn')}
                  </button>
                </Card>
              </>
            )}
          </>
        )}
      </div>

      {showProfile && <PropertyProfile t={t} property={property} plan={plan} onSave={onChangeProperty} savedExtras={savedExtras} onChangeSavedExtras={onChangeSavedExtras} bookings={bookings} session={session} propertyId={propertyId} canManageTeam={can('manage_team')} onClose={() => setShowProfile(false)} />}

      {/* Upgrade-tier popup. Shown when the hotelier taps a paid tier
          (Channels or Invoicing) in the plan selector. We don't have
          billing infrastructure yet so this is a friendly "contact
          support" sheet with a WhatsApp + email shortcut. The click
          has already been logged to audit_log before this opens. */}
      {upgradeFor && (
        <div
          onClick={() => setUpgradeFor(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 220, display: 'flex', alignItems: 'flex-end' }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 480, margin: '0 auto', background: T.card, borderRadius: '16px 16px 0 0', padding: 24 }}
          >
            <div style={{ width: 32, height: 4, background: T.border, borderRadius: 2, margin: '0 auto 18px' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <div style={{
                width: 42, height: 42, borderRadius: 11,
                background: upgradeFor === 'channels' ? T.indigoLt : 'oklch(94% 0.05 195)',
                color: upgradeFor === 'channels' ? T.indigo : T.teal,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Icon name="lock" size={20} stroke={2} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: T.ink }}>
                  {upgradeFor === 'channels' ? t('upgradeChannelsTitle') : t('upgradeInvoicingTitle')}
                </div>
                <div style={{ fontSize: 11, color: T.ink3, fontWeight: 600, marginTop: 1 }}>
                  {upgradeFor === 'channels' ? t('upgradeChannelsTag') : t('upgradeInvoicingTag')}
                </div>
              </div>
            </div>
            <div style={{ padding: '12px 14px', background: T.bgSoft, borderRadius: 10, fontSize: 12, color: T.ink2, lineHeight: 1.6, fontWeight: 600, marginBottom: 16 }}>
              {upgradeFor === 'channels'
                ? t('upgradeChannelsDesc')
                : t('upgradeInvoicingDesc')}
            </div>
            {/* No contact details baked in — the owner shares their
                own support number / email out-of-band when they hand
                the app to a hotelier. We just tell the hotelier to
                reach out to support. */}
            <div style={{ padding: '12px 14px', background: T.primaryLt, borderRadius: 10, fontSize: 12.5, color: T.primaryDk, lineHeight: 1.5, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
              <Icon name="info" size={16} color={T.primaryDk} stroke={2.2} />
              <span>{t('upgradeContactSupport')}</span>
            </div>
            <button
              onClick={() => setUpgradeFor(null)}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 9, border: `1px solid ${T.border}`, background: T.card, color: T.ink2, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
            >{t('stayOnEngine')}</button>
          </div>
        </div>
      )}

      {/* Full-screen overlay while a Reset is in flight. Without this,
          the rest of the Settings card stays interactive and the user
          can tap into anything — but any edit they make is about to be
          wiped by the impending page reload. Block all interaction so
          they wait for it to finish. */}
      {resetting && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 300,
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 14,
          color: '#fff', padding: 24, textAlign: 'center',
        }}>
          <div style={{ width: 48, height: 48 }}>
            <Icon name="sync" size={48} color="#fff" className="spin" />
          </div>
          <div style={{ fontSize: 16, fontWeight: 800 }}>{t('resettingTitle')}</div>
          <div style={{ fontSize: 12, fontWeight: 600, opacity: 0.8, maxWidth: 320, lineHeight: 1.5 }}>
            {t('resettingBody')}
          </div>
        </div>
      )}
    </div>
  );
}

import { useState, useMemo, useEffect } from 'react';
import { T, THEME_PRESETS, applyTheme } from '../tokens.js';
import { AMENITIES, currentFinancialYear, GST_SLABS, gstSlabFor, gstRateForCategory, slugify, propertyShortCode } from '../data.js';

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

function PropertyProfile({ t, onClose, property, plan, onSave, savedExtras = [], onChangeSavedExtras }) {
  const [profile, setProfile] = useState(property.profile);
  const [categories, setCategories] = useState(property.categories);
  const [rules, setRules] = useState(property.rules);
  const [newRule, setNewRule] = useState('');
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
  const [openGroups, setOpenGroups] = useState({
    branding: true,
    basics: true,
    paymentQr: false,
    rooms: false,
    pricing: false,
    meals: false,
    accountant: false,
    bookingLink: false,
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

  const handleSave = () => {
    // Functional update so we don't accidentally clobber any property fields
    // we don't know about (the partial here only enumerates the editable ones).
    onSave(prev => ({
      ...prev,
      profile, categories, rules, amenityIds, customAmenities,
      gstin: gstin.trim(), accountant, theme, invoiceCounters,
      mealPlans, defaultMealPlanId: defaultMealPlan, weekendRules, seasons, channelMarkups, channelCommissions, ratePlans, baseCapacityAdults,
    }));
    // Saved extras live outside `property` so they go through their own setter.
    if (onChangeSavedExtras) onChangeSavedExtras(extras);
    onClose();
  };
  const propTypes = [
    { id: 'resort',     label: t('ptResort') },
    { id: 'hotel',      label: t('ptHotel') },
    { id: 'homestay',   label: t('ptHomestay') },
    { id: 'villa',      label: t('ptVilla') },
    { id: 'guesthouse', label: t('ptGuesthouse') },
  ];
  return (
    <div style={{ position: 'absolute', inset: 0, background: T.bg, zIndex: 40, display: 'flex', flexDirection: 'column' }}>
      <ScreenHeader title={t('propertyProfile')} onBack={onClose} right={<Btn size="sm" icon="check" onClick={handleSave}>{t('save')}</Btn>} />
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
                        alert('Logo is too large. Please use an image under 200 KB.');
                        return;
                      }
                      const r = new FileReader();
                      r.onload = () => setProfile({ ...profile, logoDataUrl: String(r.result || '') });
                      r.readAsDataURL(file);
                    }}
                  />
                </label>
                {profile.logoDataUrl && (
                  <button
                    onClick={() => setProfile({ ...profile, logoDataUrl: '' })}
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
            <Field label={t('contactPhone')} value={profile.phone} onChange={e => setProfile({ ...profile, phone: e.target.value })} />
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
                          alert('Image is too large. Please use a QR under 700 KB.');
                          return;
                        }
                        const r = new FileReader();
                        r.onload = () => setProfile({ ...profile, paymentQrDataUrl: String(r.result || '') });
                        r.readAsDataURL(file);
                      }}
                    />
                  </label>
                  <button
                    onClick={() => setProfile({ ...profile, paymentQrDataUrl: '', paymentQrLabel: '' })}
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
                    alert('Image is too large. Please use a QR under 700 KB.');
                    return;
                  }
                  const r = new FileReader();
                  r.onload = () => setProfile({ ...profile, paymentQrDataUrl: String(r.result || '') });
                  r.readAsDataURL(file);
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
                  <button onClick={() => setCategories(arr => arr.filter(x => x.id !== c.id))} style={{ background: 'none', border: 'none', color: T.ink3, cursor: 'pointer' }}><Icon name="x" size={13} /></button>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, background: T.bgSoft, border: `1px solid ${T.borderSoft}`, borderRadius: 7, padding: '6px 8px' }}>
                    <span style={{ fontSize: 10, color: T.ink3, fontWeight: 600 }}>{t('units')}:</span>
                    <input type="number" value={c.units} onChange={e => setCategories(arr => arr.map(x => x.id === c.id ? { ...x, units: +e.target.value || 1 } : x))} className="tnum" style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 13, fontWeight: 700, color: T.ink, minWidth: 0 }} />
                  </div>
                  <div style={{ flex: 1.4, display: 'flex', alignItems: 'center', gap: 4, background: T.bgSoft, border: `1px solid ${T.borderSoft}`, borderRadius: 7, padding: '6px 8px' }}>
                    <span style={{ fontSize: 10, color: T.ink3, fontWeight: 600 }}>{t('baseRateLabel')}: ₹</span>
                    <input type="number" value={c.base} onChange={e => setCategories(arr => arr.map(x => x.id === c.id ? { ...x, base: +e.target.value || 0 } : x))} className="tnum" style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 13, fontWeight: 700, color: T.ink, minWidth: 0 }} />
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
                      <input
                        type="number"
                        value={effective}
                        onChange={e => {
                          const v = e.target.value === '' ? null : Math.max(0, Math.min(28, +e.target.value));
                          setCategories(arr => arr.map(x => x.id === c.id ? { ...x, gstRate: v } : x));
                        }}
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
                  const ec = c.extraChild || { mode: 'flat', value: 0 };
                  const updateRule = (key, patch) => setCategories(arr => arr.map(x => x.id === c.id ? { ...x, [key]: { ...(x[key] || { mode: 'flat', value: 0 }), ...patch } } : x));
                  const modeBtn = (rule, mode, label) => (
                    <button
                      onClick={() => updateRule(rule, { mode })}
                      style={{
                        padding: '3px 8px', borderRadius: 5, cursor: 'pointer',
                        border: `1px solid ${(c[rule]?.mode || 'flat') === mode ? T.indigo : T.border}`,
                        background: (c[rule]?.mode || 'flat') === mode ? T.indigoLt : T.card,
                        color: (c[rule]?.mode || 'flat') === mode ? T.indigo : T.ink3,
                        fontSize: 10, fontWeight: 700,
                      }}
                    >{label}</button>
                  );
                  const previewFor = (rule) => {
                    const r = c[rule];
                    if (!r || !r.value) return null;
                    if (r.mode === 'pct') return `₹${Math.round((c.base || 0) * (+r.value) / 100).toLocaleString('en-IN')}`;
                    return `₹${(+r.value).toLocaleString('en-IN')}`;
                  };
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8, padding: '8px 10px', background: T.bgSoft, borderRadius: 7, border: `1px solid ${T.borderSoft}` }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: T.ink3, letterSpacing: 0.3, textTransform: 'uppercase' }}>Extra-guest pricing</div>
                      {[
                        { rule: 'extraAdult', label: 'Extra adult', val: ea },
                        { rule: 'extraChild', label: 'Extra child', val: ec },
                      ].map(({ rule, label, val }) => (
                        <div key={rule} style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 10.5, color: T.ink2, fontWeight: 600, minWidth: 76 }}>{label}</span>
                          <div style={{ display: 'inline-flex', gap: 3 }}>
                            {modeBtn(rule, 'flat', '₹')}
                            {modeBtn(rule, 'pct', '% of base')}
                          </div>
                          <input
                            type="number"
                            min={0}
                            value={val.value || 0}
                            onChange={(e) => updateRule(rule, { value: Math.max(0, +e.target.value || 0) })}
                            className="tnum"
                            style={{ width: 70, border: `1px solid ${T.border}`, outline: 'none', borderRadius: 5, padding: '3px 6px', fontSize: 11, fontWeight: 700, color: T.ink, background: T.card }}
                          />
                          <span style={{ fontSize: 9, color: T.ink3, fontWeight: 600 }}>per night</span>
                          {previewFor(rule) && (
                            <span style={{ marginLeft: 'auto', fontSize: 9, color: T.indigo, fontWeight: 700 }}>≈ {previewFor(rule)}/night</span>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })()}
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
            <input
              type="number"
              value={weekendRules.upliftPct ?? 20}
              onChange={(e) => setWeekendRules(prev => ({ ...prev, upliftPct: Math.max(0, Math.min(200, parseInt(e.target.value, 10) || 0)) }))}
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
              <div key={s.id} style={{
                display: 'flex', flexDirection: 'column', gap: 8, padding: 10,
                background: T.bgSoft, border: `1px solid ${T.borderSoft}`, borderRadius: 8,
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
                  <div>
                    <div style={{ fontSize: 9, color: T.ink3, fontWeight: 700, letterSpacing: 0.3, marginBottom: 2 }}>FROM</div>
                    <input
                      type="date"
                      value={s.startIso || ''}
                      onChange={(ev) => setSeasons(arr => arr.map((x, j) => j === i ? { ...x, startIso: ev.target.value } : x))}
                      style={{ width: '100%', boxSizing: 'border-box', border: `1px solid ${T.border}`, outline: 'none', borderRadius: 5, padding: '4px 6px', fontSize: 11, color: T.ink, background: T.card }}
                    />
                  </div>
                  <div>
                    <div style={{ fontSize: 9, color: T.ink3, fontWeight: 700, letterSpacing: 0.3, marginBottom: 2 }}>TO</div>
                    <input
                      type="date"
                      value={s.endIso || ''}
                      onChange={(ev) => setSeasons(arr => arr.map((x, j) => j === i ? { ...x, endIso: ev.target.value } : x))}
                      style={{ width: '100%', boxSizing: 'border-box', border: `1px solid ${T.border}`, outline: 'none', borderRadius: 5, padding: '4px 6px', fontSize: 11, color: T.ink, background: T.card }}
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 10, color: T.ink3, fontWeight: 700 }}>MULTIPLIER</span>
                  <input
                    type="number"
                    value={s.multiplierPct ?? 0}
                    onChange={(ev) => setSeasons(arr => arr.map((x, j) => j === i ? { ...x, multiplierPct: Math.max(-90, Math.min(500, parseInt(ev.target.value, 10) || 0)) } : x))}
                    className="tnum"
                    style={{ width: 80, border: `1px solid ${T.border}`, outline: 'none', borderRadius: 5, padding: '4px 8px', fontSize: 12, fontWeight: 700, background: T.card, color: T.ink }}
                  />
                  <span style={{ fontSize: 11, color: T.ink3, fontWeight: 600 }}>% on base rate</span>
                </div>
              </div>
            ))}
          </div>
          <button
            onClick={() => {
              const id = 'season_' + Date.now().toString(36);
              setSeasons(arr => [...arr, { id, name: '', startIso: '', endIso: '', multiplierPct: 20 }]);
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
                              Direct ₹4,500 → {c.label} ₹{Math.round(4500 * (1 + v/100)).toLocaleString('en-IN')}
                            </div>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <input
                            type="number"
                            value={v}
                            onChange={(e) => setChannelMarkups(prev => ({ ...prev, [c.id]: Math.max(-50, Math.min(100, parseInt(e.target.value, 10) || 0)) }))}
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
                    return (
                      <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, background: T.card, border: `1px solid ${T.borderSoft}`, borderRadius: 8 }}>
                        <span style={{ width: 10, height: 10, borderRadius: 5, background: c.color, flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: T.ink }}>{c.label}</div>
                          {v > 0 && (
                            <div className="tnum" style={{ fontSize: 10, color: T.ink3, fontWeight: 600, marginTop: 1 }}>
                              Bill ₹4,500 → you keep ₹{Math.round(4500 * (1 - v/100)).toLocaleString('en-IN')} (before GST)
                            </div>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <input
                            type="number"
                            value={v}
                            onChange={(e) => setChannelCommissions(prev => ({ ...prev, [c.id]: Math.max(0, Math.min(50, parseInt(e.target.value, 10) || 0)) }))}
                            className="tnum"
                            style={{ width: 60, fontSize: 13, fontWeight: 700, color: T.ink, border: `1px solid ${T.border}`, outline: 'none', borderRadius: 5, padding: '4px 6px', background: T.card, textAlign: 'right' }}
                          />
                          <span style={{ fontSize: 12, color: T.ink3, fontWeight: 700 }}>%</span>
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
            Offer different price tiers for the same room — e.g. Standard (flexible cancel), Non-refundable (-10% off), Long-stay discount. Standard is always on at 0% and is the calendar rate. Turn extra plans on to show a plan picker at booking time.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {ratePlans.map((p, i) => {
              const isStd = p.id === 'standard';
              return (
                <div key={p.id} style={{
                  display: 'flex', flexDirection: 'column', gap: 6, padding: 10,
                  background: p.enabled ? T.bgSoft : T.card,
                  border: `1px solid ${p.enabled ? T.borderSoft : T.border}`,
                  borderRadius: 8,
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
                    <input
                      type="number"
                      value={p.multiplierPct ?? 0}
                      onChange={(ev) => setRatePlans(arr => arr.map((x, j) => j === i ? { ...x, multiplierPct: Math.max(-90, Math.min(200, parseInt(ev.target.value, 10) || 0)) } : x))}
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
                  {(p.cancellation || 'flexible') !== 'non-refundable' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 10, color: T.ink3, fontWeight: 700 }}>FREE CANCEL UPTO</span>
                      <input
                        type="number"
                        value={p.refundHours ?? 48}
                        onChange={(ev) => setRatePlans(arr => arr.map((x, j) => j === i ? { ...x, refundHours: Math.max(0, Math.min(720, parseInt(ev.target.value, 10) || 0)) } : x))}
                        className="tnum"
                        style={{ width: 60, border: `1px solid ${T.border}`, outline: 'none', borderRadius: 5, padding: '4px 6px', fontSize: 11, fontWeight: 700, background: T.card, color: T.ink }}
                      />
                      <span style={{ fontSize: 10, color: T.ink3, fontWeight: 600 }}>hours before arrival</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <button
            onClick={() => {
              const id = 'rp_' + Date.now().toString(36);
              setRatePlans(arr => [...arr, { id, label: '', multiplierPct: 0, cancellation: 'flexible', refundHours: 48, enabled: true }]);
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
                      <input
                        type="number"
                        value={mp.price}
                        onChange={e => setMealPlans(arr => arr.map((p, j) => j === i ? { ...p, price: Math.max(0, +e.target.value || 0) } : p))}
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
                        setMealPlans(arr => arr.map((p, j) => j === i ? { ...p, enabled: v } : p));
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
                  <input
                    type="number"
                    value={e.price}
                    onChange={(ev) => setExtras(arr => arr.map((x, j) => j === i ? { ...x, price: Math.max(0, +ev.target.value || 0) } : x))}
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
                <Field
                  label={`Last invoice number issued (FY ${fmtFy(fy)})`}
                  type="number"
                  value={currentSeq}
                  onChange={e => {
                    const v = Math.max(0, parseInt(e.target.value, 10) || 0);
                    setInvoiceCounters({ ...invoiceCounters, [fy]: v });
                  }}
                  placeholder="0"
                  hint={currentSeq > 0
                    ? `Next invoice will be ${effectivePrefix}-${fy}-${String(currentSeq + 1).padStart(3, '0')}.`
                    : `Leave at 0 to start fresh from ${effectivePrefix}-${fy}-001. Set this if you were already issuing invoices in another system this financial year — Atithi will continue from the next number.`}
                  prefix={<Icon name="tag" size={12} color={T.ink3} />}
                />
              </>
            )}
          </div>
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
            const origin = typeof window !== 'undefined' ? window.location.origin : 'https://atithi-seven.vercel.app';
            const basePath = typeof window !== 'undefined' && window.location.pathname.startsWith('/atithi/') ? '/atithi/' : '/';
            const slug = propertyShortCode({ profile });
            // Pretty URL with the property's slug — atithi.app/book/yatra-desert-camp.
            // Falls back to ?book=1 query if the hotelier prefers a flat URL.
            const widgetUrl = `${origin}${basePath}book/${slug}`;
            const iframeSnippet = `<iframe src="${widgetUrl}" style="width:100%; max-width:480px; height:780px; border:0; border-radius:14px; box-shadow:0 4px 18px rgba(0,0,0,0.08);"></iframe>`;
            const linkSnippet = `<a href="${widgetUrl}" target="_blank" rel="noopener">Book your stay →</a>`;
            const copyToClipboard = (text) => {
              if (typeof navigator !== 'undefined' && navigator.clipboard) {
                navigator.clipboard.writeText(text).catch(() => {});
              }
            };
            return (
              <>
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
                    onClick={() => copyToClipboard(widgetUrl)}
                  >Copy</Btn>
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
                    onClick={() => copyToClipboard(iframeSnippet)}
                    style={{ position: 'absolute', top: 6, right: 6 }}
                  >Copy</Btn>
                </div>

                <div style={{ fontSize: 10, color: T.ink3, fontWeight: 700, letterSpacing: 0.4, marginBottom: 6 }}>
                  OR JUST A LINK (NO IFRAME)
                </div>
                <div style={{ position: 'relative', marginBottom: 10 }}>
                  <textarea
                    readOnly
                    value={linkSnippet}
                    onFocus={(e) => e.target.select()}
                    rows={2}
                    style={{ width: '100%', boxSizing: 'border-box', fontSize: 10.5, color: T.ink, padding: '8px 10px', border: `1px solid ${T.border}`, borderRadius: 7, background: T.bgSoft, fontFamily: 'JetBrains Mono, monospace', resize: 'vertical' }}
                  />
                  <Btn
                    size="sm"
                    variant="ghost"
                    onClick={() => copyToClipboard(linkSnippet)}
                    style={{ position: 'absolute', top: 6, right: 6 }}
                  >Copy</Btn>
                </div>

                <div style={{ padding: '8px 10px', background: T.bgSoft, border: `1px solid ${T.borderSoft}`, borderRadius: 7, fontSize: 10, color: T.ink3, lineHeight: 1.5 }}>
                  <strong>How it works:</strong> Customer picks dates + room, fills in name + WhatsApp, taps Confirm. Booking saves to your Diary as <strong>tentative</strong> with a 24-hour hold so you can verify by phone. You then confirm or release in the booking detail.
                </div>
              </>
            );
          })()}
        </Card>
        </AccordionGroup>

        <AccordionGroup title="House rules" open={openGroups.houseRules} onToggle={() => toggleGroup('houseRules')}>
        <SectionHead title={t('houseRules')} style={{ marginTop: 0 }} />
        <Card padding={12}>
          {/* Capacity + child-age tiers that drive extra-guest pricing.
              The category-level "Extra adult" + "Extra child" rates
              (inside Rooms + amenities) reference these. */}
          <div style={{ marginBottom: 12, paddingBottom: 12, borderBottom: `1px solid ${T.borderSoft}`, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Field
              label="Adults included in the base rate"
              type="number"
              value={baseCapacityAdults}
              onChange={e => setBaseCapacityAdults(Math.max(1, parseInt(e.target.value, 10) || 1))}
              placeholder="2"
              hint="Standard occupancy. Extra adults above this count are charged the per-category extra-adult rate."
              prefix={<Icon name="users" size={12} color={T.ink3} />}
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <Field
                label="Children FREE below age"
                type="number"
                value={accountant.childFreeBelowAge ?? 5}
                onChange={e => setAccountant({ ...accountant, childFreeBelowAge: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                placeholder="5"
              />
              <Field
                label="Half rate up to age"
                type="number"
                value={accountant.childAgeBelow ?? 12}
                onChange={e => setAccountant({ ...accountant, childAgeBelow: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                placeholder="12"
              />
            </div>
            <div style={{ fontSize: 10.5, color: T.ink3, fontWeight: 600, lineHeight: 1.4 }}>
              Under {accountant.childFreeBelowAge ?? 5}: free. {accountant.childFreeBelowAge ?? 5}–{(accountant.childAgeBelow ?? 12) - 1}: half the extra-child rate. {accountant.childAgeBelow ?? 12}+: full extra-child rate.
            </div>
          </div>
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
        </AccordionGroup>
      </div>
    </div>
  );
}

export default function Settings({ go, plan = 'engine', onChangePlan, lang, onChangeLang, property, onChangeProperty, savedExtras = [], onChangeSavedExtras, t, session, onSignOut }) {
  const [showProfile, setShowProfile] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const totalUnits = property.categories.reduce((s, c) => s + (c.units || 0), 0);
  const locationLabel = [property.profile.city, property.profile.state].filter(Boolean).join(', ');

  const handleSignOut = async () => {
    if (signingOut || !onSignOut) return;
    setSigningOut(true);
    await onSignOut();
    // App.jsx swaps to <SignIn /> on the SIGNED_OUT event, so we don't need
    // to reset signingOut here — this component will unmount.
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: T.bg }}>
      <ScreenHeader title={t('settings')} subtitle={property.profile.name} onBack={() => go('home')} />
      <div style={{ flex: 1, overflow: 'auto', padding: 14, paddingBottom: 100 }}>

        <Card padding={0} style={{ overflow: 'hidden', marginBottom: 14, cursor: 'pointer' }} onClick={() => setShowProfile(true)}>
          <div style={{ height: 80, background: `linear-gradient(135deg, ${T.primary}, ${T.primaryDk})`, position: 'relative' }}>
            <svg style={{ position: 'absolute', right: -10, bottom: -20, opacity: 0.18 }} width="180" height="120" viewBox="0 0 180 120">
              <path d="M0 100 L30 60 L60 90 L90 40 L120 80 L150 50 L180 100" stroke="#fff" strokeWidth="2" fill="none"/>
            </svg>
          </div>
          <div style={{ padding: 14, marginTop: -30, position: 'relative' }}>
            <div style={{ width: 56, height: 56, borderRadius: 14, background: T.card, padding: 3, boxShadow: '0 4px 12px rgba(0,0,0,.1)' }}>
              <div style={{ width: '100%', height: '100%', borderRadius: 11, background: `repeating-linear-gradient(45deg, ${T.tagSaffron} 0 6px, oklch(80% 0.10 65) 6px 12px)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, color: 'rgba(0,0,0,0.4)', fontWeight: 800 }}>{(property.profile.name || 'Y').trim().charAt(0).toUpperCase()}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 8 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: T.ink }}>{property.profile.name}</div>
                <div style={{ fontSize: 11, color: T.ink3 }}>{locationLabel} · {totalUnits} units</div>
              </div>
              <Icon name="chev" size={14} color={T.ink3} />
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
                : <Chip color="warn" style={{ fontSize: 9 }}>GSTIN not set</Chip>}
              {totalUnits > 0 && <Chip color="indigo" style={{ fontSize: 9 }}>{totalUnits} rooms live</Chip>}
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
                onClick={() => onChangePlan && onChangePlan(p.id)}
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
                <div style={{ textAlign: 'right' }}>
                  <div className="tnum" style={{ fontSize: 13, fontWeight: 700, color: T.ink, letterSpacing: -0.3 }}>{p.price}<span style={{ fontSize: 9, color: T.ink3, fontWeight: 600 }}>/mo</span></div>
                </div>
              </div>
            );
          })}
        </Card>

        <SectionHead title={t('integrations')} />
        <Card padding={0}>
          {/* Honest status: each row carries a real `status` chip rather than
              a blanket green "Active" lie. Right now none of these are wired
              to external services — Razorpay/WhatsApp/Channel-manager/FRRO
              are all on the production roadmap. The "Manual" pill flags that
              the hotelier does the work themselves today (record payments
              by hand, send WhatsApp from their phone, file Form C manually).
              Switches to "Connected" when each integration goes live. */}
          {[
            { icon: 'inr',  tone: T.indigo,              title: 'Razorpay payments',     sub: 'Record payments by hand for now',           status: 'Manual' },
            { icon: 'wa',   tone: '#25D366',             title: 'WhatsApp messaging',    sub: 'Buttons open wa.me — no auto-send yet',     status: 'Manual' },
            { icon: 'plug', tone: T.primary,             title: 'Channel manager',       sub: 'OTAs (MMT, Booking, Goibibo, Agoda)',       status: 'Coming soon' },
            { icon: 'flag', tone: 'oklch(48% 0.13 230)', title: 'Form C / FRRO',         sub: 'Submit foreign-guest details manually',     status: 'Manual' },
          ].map((it, i, arr) => (
            <div key={i} style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 10, borderBottom: i < arr.length - 1 ? `1px solid ${T.borderSoft}` : 'none' }}>
              <div style={{ width: 32, height: 32, borderRadius: 9, background: `color-mix(in oklch, ${it.tone} 14%, white)`, color: it.tone, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name={it.icon} size={15} stroke={2} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: T.ink }}>{it.title}</div>
                <div style={{ fontSize: 10.5, color: T.ink3, marginTop: 1 }}>{it.sub}</div>
              </div>
              <Chip color={it.status === 'Coming soon' ? 'indigo' : 'warn'} style={{ fontSize: 9 }}>{it.status}</Chip>
            </div>
          ))}
        </Card>

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
          </>
        )}
      </div>

      {showProfile && <PropertyProfile t={t} property={property} plan={plan} onSave={onChangeProperty} savedExtras={savedExtras} onChangeSavedExtras={onChangeSavedExtras} onClose={() => setShowProfile(false)} />}
    </div>
  );
}

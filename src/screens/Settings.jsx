import { useState, useMemo, useEffect } from 'react';
import { T, THEME_PRESETS, applyTheme } from '../tokens.js';
import { AMENITIES, currentFinancialYear } from '../data.js';

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

function PropertyProfile({ t, onClose, property, plan, onSave }) {
  const [profile, setProfile] = useState(property.profile);
  const [categories, setCategories] = useState(property.categories);
  const [rules, setRules] = useState(property.rules);
  const [newRule, setNewRule] = useState('');
  const [amenityIds, setAmenityIds] = useState(property.amenityIds || []);
  const [customAmenities, setCustomAmenities] = useState(property.customAmenities || []);
  const [openCatAmenities, setOpenCatAmenities] = useState({});
  const [gstin, setGstin] = useState(property.gstin || '');
  const [accountant, setAccountant] = useState(property.accountant || { name: '', email: '', firm: '' });
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
    }));
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

        <SectionHead title={t('logo')} />
        <Card padding={14}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 72, height: 72, borderRadius: 14, background: T.card, padding: 4, boxShadow: '0 2px 8px rgba(0,0,0,.08)', border: `1px dashed ${T.border}` }}>
              <div style={{ width: '100%', height: '100%', borderRadius: 10, background: `repeating-linear-gradient(45deg, ${T.tagSaffron} 0 6px, oklch(80% 0.10 65) 6px 12px)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, color: 'rgba(0,0,0,0.4)', fontWeight: 800 }}>{(profile.name || 'Y').trim().charAt(0).toUpperCase()}</div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.ink }}>Current logo</div>
              <div style={{ fontSize: 10.5, color: T.ink3, marginTop: 2, lineHeight: 1.4 }}>PNG or SVG · square · min 512px · transparent background</div>
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <Btn size="sm" variant="ghost" icon="upload">{t('changeLogo')}</Btn>
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

        <SectionHead title="Basics" style={{ marginTop: 16 }} />
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

        <SectionHead title="Accountant (CA)" style={{ marginTop: 16 }} />
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

        <SectionHead title={t('roomCategories')} style={{ marginTop: 16 }} action={
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
      </div>
    </div>
  );
}

export default function Settings({ go, plan = 'engine', onChangePlan, lang, onChangeLang, property, onChangeProperty, t, session, onSignOut }) {
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
            <div style={{ display: 'flex', gap: 5, marginTop: 8 }}>
              <Chip color="ok" icon="check" style={{ fontSize: 9 }}>GSTIN verified</Chip>
              <Chip color="indigo" style={{ fontSize: 9 }}>FRRO registered</Chip>
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
          {[
            { icon: 'inr',  tone: T.indigo,              title: 'Razorpay',               sub: 'KYC verified · payouts T+1' },
            { icon: 'wa',   tone: '#25D366',              title: 'WhatsApp Business API',  sub: 'Templates approved · 3 active' },
            { icon: 'plug', tone: T.primary,              title: 'Channel manager',        sub: '4 OTAs · ₹999/mo' },
            { icon: 'flag', tone: 'oklch(48% 0.13 230)', title: 'Form C / FRRO',          sub: 'Auto-submit on check-in' },
          ].map((it, i, arr) => (
            <div key={i} style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 10, borderBottom: i < arr.length - 1 ? `1px solid ${T.borderSoft}` : 'none' }}>
              <div style={{ width: 32, height: 32, borderRadius: 9, background: `color-mix(in oklch, ${it.tone} 14%, white)`, color: it.tone, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name={it.icon} size={15} stroke={2} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: T.ink }}>{it.title}</div>
                <div style={{ fontSize: 10.5, color: T.ink3, marginTop: 1 }}>{it.sub}</div>
              </div>
              <Chip color="ok" style={{ fontSize: 9 }}>Active</Chip>
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

      {showProfile && <PropertyProfile t={t} property={property} plan={plan} onSave={onChangeProperty} onClose={() => setShowProfile(false)} />}
    </div>
  );
}

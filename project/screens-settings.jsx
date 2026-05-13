// screens-settings.jsx — Settings: property profile, GST portal, plan, integrations

function Settings({ go, plan = 'engine', onChangePlan, lang, onChangeLang, t }) {
  const [showProfile, setShowProfile] = React.useState(false);
  const [showGstn, setShowGstn] = React.useState(false);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: T.bg }}>
      <ScreenHeader title={t('settings')} subtitle="Yatra Desert Camp" onBack={() => go('home')} />
      <div style={{ flex: 1, overflow: 'auto', padding: 14, paddingBottom: 100 }}>

        {/* Property card */}
        <Card padding={0} style={{ overflow: 'hidden', marginBottom: 14, cursor: 'pointer' }} onClick={() => setShowProfile(true)}>
          <div style={{ height: 80, background: `linear-gradient(135deg, ${T.primary}, oklch(50% 0.16 28))`, position: 'relative' }}>
            <svg style={{ position: 'absolute', right: -10, bottom: -20, opacity: 0.18 }} width="180" height="120" viewBox="0 0 180 120">
              <path d="M0 100 L30 60 L60 90 L90 40 L120 80 L150 50 L180 100" stroke="#fff" strokeWidth="2" fill="none"/>
            </svg>
          </div>
          <div style={{ padding: 14, marginTop: -30, position: 'relative' }}>
            <div style={{ width: 56, height: 56, borderRadius: 14, background: T.card, padding: 3, boxShadow: '0 4px 12px rgba(0,0,0,.1)' }}>
              <div style={{ width: '100%', height: '100%', borderRadius: 11, background: `repeating-linear-gradient(45deg, ${T.tagSaffron} 0 6px, oklch(80% 0.10 65) 6px 12px)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, color: 'rgba(0,0,0,0.4)', fontWeight: 800 }}>Y</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 8 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: T.ink }}>Yatra Desert Camp</div>
                <div style={{ fontSize: 11, color: T.ink3 }}>Sam Sand Dunes, Jaisalmer · 21 units</div>
              </div>
              <Icon name="chev" size={14} color={T.ink3} />
            </div>
            <div style={{ display: 'flex', gap: 5, marginTop: 8 }}>
              <Chip color="ok" icon="check" style={{ fontSize: 9 }}>GSTIN verified</Chip>
              <Chip color="indigo" style={{ fontSize: 9 }}>FRRO registered</Chip>
            </div>
          </div>
        </Card>

        {/* Language */}
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

        {/* Plan */}
        <SectionHead title={t('yourPlan')} style={{ marginTop: 16 }} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 14 }}>
          {[
            { id: 'engine',   name: t('planEngine'),   price: '₹499',  tagline: t('planEngineDesc'),   color: T.primary },
            { id: 'channels', name: t('planChannels'), price: '₹999',  tagline: t('planChannelsDesc'), color: T.indigo },
            { id: 'gst',      name: t('planGst'),      price: '₹1499', tagline: t('planGstDesc'),      color: T.teal },
          ].map(p => {
            const sel = plan === p.id;
            return (
              <Card key={p.id} onClick={() => onChangePlan && onChangePlan(p.id)} padding={11} style={{
                cursor: 'pointer',
                borderColor: sel ? p.color : T.borderSoft, borderWidth: sel ? 2 : 1,
                background: sel ? `color-mix(in oklch, ${p.color} 6%, white)` : T.card,
              }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: sel ? p.color : T.ink }}>{p.name}</span>
                  {sel && <Icon name="check" size={12} color={p.color} stroke={2.5} />}
                </div>
                <div className="tnum" style={{ fontSize: 14, fontWeight: 700, color: T.ink, letterSpacing: -0.3, marginTop: 3 }}>{p.price}<span style={{ fontSize: 9, color: T.ink3, fontWeight: 600 }}>/mo</span></div>
                <div style={{ fontSize: 9, color: T.ink3, marginTop: 2, fontWeight: 600, lineHeight: 1.3 }}>{p.tagline}</div>
              </Card>
            );
          })}
        </div>

        {/* GST portal — only when on gst plan */}
        {plan === 'gst' && (
          <>
            <SectionHead title={t('gstPortal')} style={{ marginTop: 4 }} />
            <Card padding={0} style={{ overflow: 'hidden', marginBottom: 14, borderColor: T.teal, borderWidth: 1.5 }}>
              <div style={{ padding: 14, background: `color-mix(in oklch, ${T.teal} 6%, white)` }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: T.teal, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon name="check" size={18} stroke={2.4} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>{t('gstPortal')}</div>
                    <div style={{ fontSize: 10.5, color: T.ink3, marginTop: 2, lineHeight: 1.35 }}>{t('gstPortalSub')}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, fontSize: 11, marginBottom: 10 }}>
                  <Chip color="ok" icon="check" style={{ fontSize: 9 }}>Connected</Chip>
                  <Chip color="indigo" style={{ fontSize: 9 }}>{t('autoFile')}</Chip>
                </div>
                <Btn variant="ghost" size="sm" full onClick={() => setShowGstn(true)}>Manage GSTN connection</Btn>
              </div>
              {/* Filing history */}
              <div style={{ borderTop: `1px solid ${T.borderSoft}` }}>
                <div style={{ padding: '8px 14px', fontSize: 10, fontWeight: 700, color: T.ink3, letterSpacing: 0.4, background: T.bgSoft }}>{t('filingHistory')}</div>
                {[
                  { period: 'GSTR-1 · Apr 2026', amt: 52140, arn: 'AA040426012345X', status: 'filed', when: '11 May' },
                  { period: 'GSTR-1 · Mar 2026', amt: 48200, arn: 'AA030326019876Y', status: 'filed', when: '11 Apr' },
                  { period: 'GSTR-1 · May 2026', amt: 24650, arn: null, status: 'pending', when: '11 Jun' },
                ].map((f, i, arr) => (
                  <div key={i} style={{
                    padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10,
                    borderTop: i > 0 ? `1px solid ${T.borderSoft}` : 'none', background: T.card,
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: T.ink }}>{f.period}</div>
                      <div className="tnum" style={{ fontSize: 10, color: T.ink3, marginTop: 1 }}>
                        ₹{f.amt.toLocaleString('en-IN')} GST · {f.arn ? `${t('ack')} ${f.arn}` : `${t('nextFiling')}: ${f.when}`}
                      </div>
                    </div>
                    <Chip color={f.status === 'filed' ? 'ok' : 'warn'} style={{ fontSize: 9 }}>{f.status === 'filed' ? t('filed') : t('pending')}</Chip>
                  </div>
                ))}
              </div>
            </Card>
          </>
        )}

        {/* Integrations */}
        <SectionHead title={t('integrations')} />
        <Card padding={0}>
          {[
            { icon: 'inr', tone: T.indigo, title: 'Razorpay', sub: 'KYC verified · payouts T+1' },
            { icon: 'wa', tone: '#25D366', title: 'WhatsApp Business API', sub: 'Templates approved · 3 active' },
            { icon: 'plug', tone: T.primary, title: 'Channel manager', sub: '4 OTAs · ₹999/mo' },
            { icon: 'flag', tone: 'oklch(48% 0.13 230)', title: 'Form C / FRRO', sub: 'Auto-submit on check-in' },
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
      </div>

      {showProfile && <PropertyProfile t={t} onClose={() => setShowProfile(false)} />}
      {showGstn && <GstnSheet t={t} onClose={() => setShowGstn(false)} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// PROPERTY PROFILE — fullscreen edit
// ─────────────────────────────────────────────────────────────
function PropertyProfile({ t, onClose }) {
  const [profile, setProfile] = React.useState({
    name: 'Yatra Desert Camp',
    type: 'resort',
    address: 'Sam Sand Dunes Road, near Khuri',
    city: 'Jaisalmer', state: 'Rajasthan', pincode: '345001',
    checkIn: '14:00', checkOut: '11:00',
    phone: '+91 90099 12345', email: 'stay@yatracamp.in', website: 'yatracamp.in',
  });
  const [categories, setCategories] = React.useState([
    { id: 'dlx', name: 'Deluxe Tent', units: 8, base: 4500 },
    { id: 'lux', name: 'Luxury Tent (AC)', units: 6, base: 7200 },
    { id: 'btub', name: 'Bathtub Tent', units: 4, base: 9500 },
    { id: 'pool', name: 'Private Pool Cottage', units: 3, base: 14500 },
  ]);
  const [rules, setRules] = React.useState([
    'Check-in from 2 PM · check-out by 11 AM',
    'No outside food in tents',
    'Bonfire from 7 PM to 10 PM only',
    'Pets allowed in Deluxe & Luxury tents',
  ]);
  const [newRule, setNewRule] = React.useState('');
  const [amenities, setAmenities] = React.useState({ wifi: true, parking: true, pool: true, restaurant: true, ac: true, bonfire: true });
  const propTypes = [
    { id: 'resort', label: t('ptResort') },
    { id: 'hotel', label: t('ptHotel') },
    { id: 'homestay', label: t('ptHomestay') },
    { id: 'villa', label: t('ptVilla') },
    { id: 'guesthouse', label: t('ptGuesthouse') },
  ];
  const amenityList = [
    { id: 'wifi', label: t('wifi'), icon: 'plug' },
    { id: 'parking', label: t('parking'), icon: 'plug' },
    { id: 'pool', label: t('pool'), icon: 'plug' },
    { id: 'restaurant', label: t('restaurant'), icon: 'veg' },
    { id: 'ac', label: 'AC', icon: 'plug' },
    { id: 'bonfire', label: 'Bonfire', icon: 'sun' },
  ];

  return (
    <div style={{ position: 'absolute', inset: 0, background: T.bg, zIndex: 40, display: 'flex', flexDirection: 'column' }}>
      <ScreenHeader title={t('propertyProfile')} onBack={onClose} right={<Btn size="sm" icon="check" onClick={onClose}>{t('save')}</Btn>} />
      <div style={{ flex: 1, overflow: 'auto', padding: 14, paddingBottom: 80 }}>

        {/* Logo */}
        <SectionHead title={t('logo')} />
        <Card padding={14}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 72, height: 72, borderRadius: 14, background: T.card, padding: 4, boxShadow: '0 2px 8px rgba(0,0,0,.08)', border: `1px dashed ${T.border}` }}>
              <div style={{ width: '100%', height: '100%', borderRadius: 10, background: `repeating-linear-gradient(45deg, ${T.tagSaffron} 0 6px, oklch(80% 0.10 65) 6px 12px)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, color: 'rgba(0,0,0,0.4)', fontWeight: 800 }}>Y</div>
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

        {/* Basics */}
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

        {/* Address */}
        <SectionHead title={t('address')} style={{ marginTop: 16 }} />
        <Card padding={14}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Field label={t('address')} value={profile.address} onChange={e => setProfile({ ...profile, address: e.target.value })} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <Field label={t('city')} value={profile.city} onChange={e => setProfile({ ...profile, city: e.target.value })} />
              <Field label={t('pincode')} value={profile.pincode} onChange={e => setProfile({ ...profile, pincode: e.target.value })} />
            </div>
            <Field label={t('state')} value={profile.state} onChange={e => setProfile({ ...profile, state: e.target.value })} />
          </div>
        </Card>

        {/* Contact */}
        <SectionHead title="Contact" style={{ marginTop: 16 }} />
        <Card padding={14}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Field label={t('contactPhone')} value={profile.phone} onChange={e => setProfile({ ...profile, phone: e.target.value })} />
            <Field label={t('contactEmail')} value={profile.email} onChange={e => setProfile({ ...profile, email: e.target.value })} />
            <Field label={t('website')} value={profile.website} onChange={e => setProfile({ ...profile, website: e.target.value })} prefix="https://" />
          </div>
        </Card>

        {/* Room categories */}
        <SectionHead title={t('roomCategories')} style={{ marginTop: 16 }} action={
          <button onClick={() => setCategories(c => [...c, { id: 'new-' + Date.now(), name: 'New category', units: 1, base: 3000 }])} style={{ background: 'none', border: 'none', color: T.primary, fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Icon name="plus" size={11} stroke={2.2} /> {t('addCategory')}
          </button>
        } />
        <Card padding={0}>
          {categories.map((c, i, arr) => (
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
            </div>
          ))}
        </Card>

        {/* Amenities */}
        <SectionHead title={t('amenities')} style={{ marginTop: 16 }} />
        <Card padding={10}>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {amenityList.map(a => {
              const on = amenities[a.id];
              return (
                <button key={a.id} onClick={() => setAmenities(m => ({ ...m, [a.id]: !m[a.id] }))} style={{
                  padding: '6px 10px', borderRadius: 999,
                  border: `1.5px solid ${on ? T.primary : T.border}`,
                  background: on ? T.primaryLt : T.card,
                  color: on ? T.primaryDk : T.ink2,
                  fontSize: 11, fontWeight: 700, cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                }}>
                  {on && <Icon name="check" size={10} stroke={2.4} />} {a.label}
                </button>
              );
            })}
          </div>
        </Card>

        {/* House rules */}
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

// ─────────────────────────────────────────────────────────────
// GSTN CONNECTION FLOW
// ─────────────────────────────────────────────────────────────
function GstnSheet({ t, onClose }) {
  const [step, setStep] = React.useState(1); // 1=GSTIN, 2=OTP, 3=success
  const [gstin, setGstin] = React.useState('08AABCY1234M1Z5');
  const [otp, setOtp] = React.useState(['','','','','','']);
  const refs = React.useRef([]);

  const setOtpDigit = (i, v) => {
    const cleaned = (v || '').slice(-1);
    const next = [...otp]; next[i] = cleaned; setOtp(next);
    if (cleaned && i < 5) refs.current[i+1]?.focus();
  };

  return (
    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'flex-end' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', background: T.card, borderRadius: '18px 18px 0 0', padding: 20, paddingBottom: 30 }}>
        <div style={{ width: 40, height: 4, background: T.border, borderRadius: 2, margin: '0 auto 16px' }} />

        {step === 1 && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: T.teal, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="check" size={20} stroke={2.2} />
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: T.ink }}>{t('connectGstn')}</div>
                <div style={{ fontSize: 11, color: T.ink3 }}>{t('gstPortalSub')}</div>
              </div>
            </div>
            <div style={{ background: T.bgSoft, borderRadius: 10, padding: 12, marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.ink3, marginBottom: 8, letterSpacing: 0.3 }}>WHAT YOU GET</div>
              {[
                'Auto-prepare GSTR-1 from invoices',
                'File directly on gst.gov.in · no accountant',
                'GSTR-3B reconciliation',
                'TCS by OTAs auto-credited',
              ].map(x => (
                <div key={x} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 12, color: T.ink2 }}>
                  <Icon name="check" size={12} color={T.ok} stroke={2.4} /> <span>{x}</span>
                </div>
              ))}
            </div>
            <Field label={t('gstinLabel')} value={gstin} onChange={e => setGstin(e.target.value.toUpperCase())} prefix={<Icon name="tag" size={12} color={T.ink3} />} hint="15-character GSTIN from your registration certificate" />
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <Btn variant="ghost" full onClick={onClose}>{t('cancel')}</Btn>
              <Btn full onClick={() => setStep(2)}>{t('connect')}</Btn>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: T.ink, marginBottom: 4 }}>{t('enterOtp')}</div>
              <div style={{ fontSize: 11, color: T.ink3 }}>{t('otpSent')} +91 90099 ··· 50</div>
            </div>
            <div style={{ display: 'flex', gap: 7, justifyContent: 'space-between', marginBottom: 12 }}>
              {otp.map((d, i) => (
                <input
                  key={i}
                  ref={el => refs.current[i] = el}
                  value={d}
                  onChange={e => setOtpDigit(i, e.target.value)}
                  inputMode="numeric"
                  maxLength={1}
                  className="tnum"
                  style={{
                    width: 44, height: 52, borderRadius: 10,
                    border: `1.5px solid ${d ? T.teal : T.border}`,
                    background: d ? `color-mix(in oklch, ${T.teal} 6%, white)` : T.card,
                    outline: 'none', textAlign: 'center', fontSize: 22, fontWeight: 700, color: T.ink,
                  }}
                />
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, fontSize: 11 }}>
              <button style={{ background: 'none', border: 'none', color: T.primary, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Resend in 28s</button>
              <span style={{ color: T.ink3 }} className="tnum">Try secure code</span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn variant="ghost" full onClick={() => setStep(1)}>Back</Btn>
              <Btn full onClick={() => setStep(3)} style={{ background: T.teal, borderColor: T.teal }}>{t('verify')}</Btn>
            </div>
          </>
        )}

        {step === 3 && (
          <div style={{ textAlign: 'center', padding: '10px 0' }}>
            <div style={{ width: 72, height: 72, borderRadius: '50%', background: T.okLt, color: T.ok, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
              <Icon name="check" size={36} stroke={2.5} />
            </div>
            <div style={{ fontSize: 17, fontWeight: 700, color: T.ink }}>Connected to GSTN</div>
            <div style={{ fontSize: 12, color: T.ink3, marginTop: 6, lineHeight: 1.5, maxWidth: 280, margin: '6px auto 0' }}>
              Your GSTR-1 will be auto-prepared and filed on the 11th of every month. Acknowledgement (ARN) will arrive in WhatsApp.
            </div>
            <div style={{ marginTop: 18 }}>
              <Btn full onClick={onClose}>Done</Btn>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

Object.assign(window, { Settings });

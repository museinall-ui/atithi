// app.jsx — Atithi router + tweaks + canvas wiring

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "plan": "engine",
  "language": "en"
}/*EDITMODE-END*/;

function Atithi({ initial = 'home', plan, lang, onChangePlan, onChangeLang }) {
  const [route, setRoute] = React.useState({ name: initial, arg: null });
  const [bookings, setBookings] = React.useState(() => BOOKINGS_SEED.map(b => ({ ...b })));
  const [editing, setEditing] = React.useState(null); // bookingId being edited
  const t = useT(lang || 'en');

  const go = (name, arg = null) => {
    if (name !== 'new') setEditing(null);
    setRoute({ name, arg });
  };
  const startEdit = (bookingId) => { setEditing(bookingId); setRoute({ name: 'new', arg: bookingId }); };

  const onCreate = (data, total) => {
    const paid = data.payAmount === 'full' ? total
      : data.payAmount === 'half' ? Math.round(total/2)
      : data.payAmount === 'custom' ? Math.min(+data.payCustom || 0, total)
      : 0;
    if (editing) {
      setBookings(arr => arr.map(b => b.id === editing ? {
        ...b, roomTypeId: data.roomTypeId, nights: data.nights, guest: data.name || b.guest,
        total, paid, phone: '+91 ' + (data.phone || b.phone.replace('+91 ','')),
        notes: data.notes, extras: data.extras,
        roomItems: data.roomItems, customExtras: data.customExtras, extraPrices: data.extraPrices,
        guests: `${data.roomItems.reduce((s,r)=>s+r.adults,0)}A${data.roomItems.reduce((s,r)=>s+r.children,0)>0?` ${data.roomItems.reduce((s,r)=>s+r.children,0)}C`:''}`,
      } : b));
      setEditing(null);
      setRoute({ name: 'booking', arg: editing });
    } else {
      const newBk = {
        id: 'BK-' + (2854 + bookings.length), roomTypeId: data.roomTypeId, unitIdx: 7, startIdx: 0, nights: data.nights,
        guest: data.name || 'New Guest', status: 'confirmed', channel: 'direct',
        total, paid,
        guests: `${data.roomItems.reduce((s,r)=>s+r.adults,0)}A${data.roomItems.reduce((s,r)=>s+r.children,0)>0?` ${data.roomItems.reduce((s,r)=>s+r.children,0)}C`:''}`, phone: '+91 ' + data.phone,
        notes: data.notes, extras: data.extras,
        roomItems: data.roomItems, customExtras: data.customExtras, extraPrices: data.extraPrices,
      };
      setBookings(arr => [...arr, newBk]);
      go('booking-confirmed');
    }
  };

  const showTabs = ['home', 'diary', 'guests', 'more'].includes(route.name);
  const editingBooking = editing ? bookings.find(b => b.id === editing) : null;

  let screen;
  switch (route.name) {
    case 'home':              screen = <Dashboard go={go} bookings={bookings} t={t} lang={lang} />; break;
    case 'diary':             screen = <Diary go={go} bookings={bookings} setBookings={setBookings} t={t} />; break;
    case 'new':               screen = <NewBooking go={go} onCreate={onCreate} plan={plan} t={t} editing={editingBooking} />; break;
  const addPayment = (bookingId, entry) => {
    setBookings(arr => arr.map(b => {
      if (b.id !== bookingId) return b;
      const existing = b.payments || (b.paid > 0 ? [{ id: 'p1', kind: 'payment', method: b.channel === 'direct' ? 'upi' : 'card', amount: b.paid, note: 'Initial payment', date: '03 May · 18:25' }] : []);
      const next = [...existing, entry];
      const paid = next.reduce((s, p) => s + (p.kind === 'refund' || p.kind === 'credit' ? -p.amount : p.amount), 0);
      return { ...b, payments: next, paid };
    }));
  };

    case 'booking':           screen = <BookingDetail go={go} bookingId={route.arg} bookings={bookings} plan={plan} t={t} onEdit={startEdit} onPayment={addPayment} />; break;
    case 'booking-confirmed': screen = <BookingConfirmed go={go} t={t} />; break;
    case 'rates':             screen = <Rates go={go} t={t} lang={lang} />; break;
    case 'guests':            screen = <Guests go={go} bookings={bookings} t={t} />; break;
    case 'channels':          screen = <Channels go={go} t={t} />; break;
    case 'reports':           screen = <Reports go={go} t={t} />; break;
    case 'settings':          screen = <Settings go={go} plan={plan} onChangePlan={onChangePlan} lang={lang} onChangeLang={onChangeLang} t={t} />; break;
    case 'more':              screen = <MoreMenu go={go} t={t} />; break;
    default:                  screen = <Dashboard go={go} bookings={bookings} t={t} lang={lang} />;
  }

  return (
    <IOSDevice width={390} height={844}>
      <div className={"atithi " + (lang === 'hi' ? 'hi-mode' : '')} style={{ height: '100%', position: 'relative', background: T.bg, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, paddingBottom: showTabs ? 78 : 0, display: 'flex', flexDirection: 'column' }}>
          {screen}
        </div>
        {showTabs && (
          <TabBar active={route.name} onChange={(id) => {
            if (id === 'more') go('more');
            else if (id === 'new') go('new');
            else go(id);
          }} t={t} />
        )}
      </div>
    </IOSDevice>
  );
}

function MoreMenu({ go, t }) {
  const items = [
    { id: 'rates', icon: 'tag', color: T.primary, title: t('ratesTitle'), sub: 'Pricing · close-outs · discounts' },
    { id: 'channels', icon: 'plug', color: T.indigo, title: t('channelsTitle'), sub: 'MMT · Goibibo · Booking.com' },
    { id: 'reports', icon: 'chart', color: T.teal, title: t('reportsTitle'), sub: t('revenue') + ' · ADR · ' + t('avgOccupancy') },
    { id: 'settings', icon: 'cog', color: T.ink2, title: t('settings'), sub: t('property') + ' · ' + t('integrations') + ' · ' + t('yourPlan') },
  ];
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: T.bg }}>
      <ScreenHeader title={t('more')} subtitle="All tools" />
      <div style={{ flex: 1, padding: 16, paddingBottom: 100 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {items.map(it => (
            <Card key={it.id} onClick={() => go(it.id)} padding={16} style={{ cursor: 'pointer' }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10, marginBottom: 10,
                background: `color-mix(in oklch, ${it.color} 14%, white)`, color: it.color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Icon name={it.icon} size={20} stroke={2} />
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>{it.title}</div>
              <div style={{ fontSize: 11, color: T.ink3, marginTop: 2 }}>{it.sub}</div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Atithi });

const App = () => {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  return (
    <>
      <DesignCanvas>
        <DCSection id="primary" title="Atithi · Booking engine for small Indian hoteliers" subtitle="Mobile-first · हिन्दी toggle · live OTA + WhatsApp · drag-confirm">
          <DCArtboard id="dashboard" label="Home · daily income + monthly slider" width={390} height={844}>
            <Atithi initial="home" plan={t.plan} lang={t.language} onChangePlan={(p) => setTweak('plan', p)} onChangeLang={(l) => setTweak('language', l)} />
          </DCArtboard>
          <DCArtboard id="diary" label="Diary · drag-drop confirm" width={390} height={844}>
            <Atithi initial="diary" plan={t.plan} lang={t.language} onChangePlan={(p) => setTweak('plan', p)} onChangeLang={(l) => setTweak('language', l)} />
          </DCArtboard>
          <DCArtboard id="new-1" label="New · per-room rates + custom extras" width={390} height={844}>
            <Atithi initial="new" plan={t.plan} lang={t.language} onChangePlan={(p) => setTweak('plan', p)} onChangeLang={(l) => setTweak('language', l)} />
          </DCArtboard>
          <DCArtboard id="booking" label="Booking · edit reservation" width={390} height={844}>
            <Atithi initial="booking" plan={t.plan} lang={t.language} onChangePlan={(p) => setTweak('plan', p)} onChangeLang={(l) => setTweak('language', l)} />
          </DCArtboard>
        </DCSection>

        <DCSection id="ops" title="Operations" subtitle="Rates calendar · channel copy-rates · reports">
          <DCArtboard id="rates" label="Rates · calendar + bulk + discounts" width={390} height={844}>
            <Atithi initial="rates" plan={t.plan} lang={t.language} onChangePlan={(p) => setTweak('plan', p)} onChangeLang={(l) => setTweak('language', l)} />
          </DCArtboard>
          <DCArtboard id="channels" label="Channels · copy from engine" width={390} height={844}>
            <Atithi initial="channels" plan={t.plan} lang={t.language} onChangePlan={(p) => setTweak('plan', p)} onChangeLang={(l) => setTweak('language', l)} />
          </DCArtboard>
          <DCArtboard id="reports" label="Reports" width={390} height={844}>
            <Atithi initial="reports" plan={t.plan} lang={t.language} onChangePlan={(p) => setTweak('plan', p)} onChangeLang={(l) => setTweak('language', l)} />
          </DCArtboard>
        </DCSection>

        <DCSection id="people" title="Settings & profile" subtitle="Property profile · GSTN connect · plan">
          <DCArtboard id="guests" label="Guest CRM" width={390} height={844}>
            <Atithi initial="guests" plan={t.plan} lang={t.language} onChangePlan={(p) => setTweak('plan', p)} onChangeLang={(l) => setTweak('language', l)} />
          </DCArtboard>
          <DCArtboard id="settings" label="Settings · plan + language + GST portal" width={390} height={844}>
            <Atithi initial="settings" plan={t.plan} lang={t.language} onChangePlan={(p) => setTweak('plan', p)} onChangeLang={(l) => setTweak('language', l)} />
          </DCArtboard>
          <DCArtboard id="more" label="More menu" width={390} height={844}>
            <Atithi initial="more" plan={t.plan} lang={t.language} onChangePlan={(p) => setTweak('plan', p)} onChangeLang={(l) => setTweak('language', l)} />
          </DCArtboard>
        </DCSection>
      </DesignCanvas>

      <TweaksPanel title="Atithi tweaks">
        <TweakSection label="Language" />
        <TweakRadio value={t.language}
          options={[{ value: 'en', label: 'English' }, { value: 'hi', label: 'हिन्दी' }]}
          onChange={(v) => setTweak('language', v)} />
        <TweakSection label="Subscription plan" />
        <TweakSelect value={t.plan}
          options={[
            { value: 'engine', label: 'Engine — direct bookings only' },
            { value: 'channels', label: 'Engine + Channels (OTA sync)' },
            { value: 'gst', label: 'Channels + GST (Pro)' },
          ]}
          onChange={(v) => setTweak('plan', v)} />
      </TweaksPanel>
    </>
  );
};

ReactDOM.createRoot(document.getElementById('root')).render(<App />);

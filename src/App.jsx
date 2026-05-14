import { useState } from 'react';
import { useT } from './i18n.js';
import { BOOKINGS_SEED } from './data.js';
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

export default function App() {
  const [plan, setPlan] = useState('engine');
  const [lang, setLang] = useState('en');
  const [route, setRoute] = useState({ name: 'home', arg: null });
  const [bookings, setBookings] = useState(() => BOOKINGS_SEED.map(b => ({ ...b })));
  const [editing, setEditing] = useState(null);
  const t = useT(lang);

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
      return { ...b, payments: next, paid };
    }));
  };

  const onCreate = (data, total) => {
    const paid = data.payAmount === 'full' ? total
      : data.payAmount === 'half' ? Math.round(total / 2)
      : data.payAmount === 'custom' ? Math.min(+data.payCustom || 0, total)
      : 0;
    if (editing) {
      setBookings(arr => arr.map(b => b.id === editing ? {
        ...b, roomTypeId: data.roomTypeId, nights: data.nights, guest: data.name || b.guest,
        total, paid, phone: '+91 ' + (data.phone || b.phone.replace('+91 ', '')),
        notes: data.notes, extras: data.extras,
        roomItems: data.roomItems, customExtras: data.customExtras, extraPrices: data.extraPrices,
        guests: `${data.roomItems.reduce((s, r) => s + r.adults, 0)}A${data.roomItems.reduce((s, r) => s + r.children, 0) > 0 ? ` ${data.roomItems.reduce((s, r) => s + r.children, 0)}C` : ''}`,
      } : b));
      setEditing(null);
      setRoute({ name: 'booking', arg: editing });
    } else {
      const newBk = {
        id: 'BK-' + (2854 + bookings.length),
        roomTypeId: data.roomTypeId,
        unitIdx: 7,
        startIdx: 0,
        nights: data.nights,
        guest: data.name || 'New Guest',
        status: 'confirmed',
        channel: 'direct',
        total,
        paid,
        guests: `${data.roomItems.reduce((s, r) => s + r.adults, 0)}A${data.roomItems.reduce((s, r) => s + r.children, 0) > 0 ? ` ${data.roomItems.reduce((s, r) => s + r.children, 0)}C` : ''}`,
        phone: '+91 ' + data.phone,
        notes: data.notes,
        extras: data.extras,
        roomItems: data.roomItems,
        customExtras: data.customExtras,
        extraPrices: data.extraPrices,
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
    case 'booking':           screen = <BookingDetail go={go} bookingId={route.arg} bookings={bookings} plan={plan} t={t} onEdit={startEdit} onPayment={addPayment} />; break;
    case 'booking-confirmed': screen = <BookingConfirmed go={go} t={t} />; break;
    case 'rates':             screen = <Rates go={go} t={t} lang={lang} />; break;
    case 'guests':            screen = <Guests go={go} bookings={bookings} t={t} />; break;
    case 'channels':          screen = <Channels go={go} t={t} />; break;
    case 'reports':           screen = <Reports go={go} t={t} />; break;
    case 'settings':          screen = <Settings go={go} plan={plan} onChangePlan={setPlan} lang={lang} onChangeLang={setLang} t={t} />; break;
    case 'more':              screen = <MoreMenu go={go} t={t} />; break;
    default:                  screen = <Dashboard go={go} bookings={bookings} t={t} lang={lang} />;
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

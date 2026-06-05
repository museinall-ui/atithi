import { useState, useEffect, useRef } from 'react';
import { T } from '../tokens.js';
import { CHANNELS, DAYS, ANCHOR, ymd, idxToDate, dateToIdx, effectiveRoomTypes, repeatGuestKeys, normPhone } from '../data.js';
import Icon from '../components/Icon.jsx';
import Card from '../components/Card.jsx';
import Chip from '../components/Chip.jsx';
import Avatar from '../components/Avatar.jsx';
import SectionHead from '../components/SectionHead.jsx';
import ExtendOptions from '../components/ExtendOptions.jsx';

const D_MONTH_HI = ['जन','फ़र','मार्च','अप्रैल','मई','जून','जुल','अग','सित','अक्ट','नव','दिस'];
const D_DOW_HI   = ['सोम','मंगल','बुध','गुरु','शुक्र','शनि','रवि'];

function StatTile({ label, value, icon, color, onClick, disabled }) {
  // Tappable when there are bookings to show. We disable the press affordance
  // when value === 0 to avoid opening an empty sheet — saves the hotelier
  // a confusing tap on "0 Arriving".
  const isInteractive = !!onClick && !disabled;
  return (
    <Card
      padding={12}
      style={{
        display: 'flex', flexDirection: 'column', gap: 8,
        cursor: isInteractive ? 'pointer' : 'default',
        opacity: disabled ? 0.55 : 1,
        transition: 'transform .15s, box-shadow .15s',
      }}
      onClick={isInteractive ? onClick : undefined}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{
          width: 28, height: 28, borderRadius: 8, background: `color-mix(in oklch, ${color} 12%, white)`,
          color, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}><Icon name={icon} size={14} stroke={2} /></div>
        {isInteractive && <Icon name="chev" size={12} color={T.ink3} stroke={2} />}
      </div>
      <div>
        <div className="tnum" style={{ fontSize: 22, fontWeight: 700, color: T.ink, letterSpacing: -0.6, lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: 11, color: T.ink3, marginTop: 2, fontWeight: 600 }}>{label}</div>
      </div>
    </Card>
  );
}

// Daily cash-close card. Keeps a per-day snapshot of what the hotelier
// physically counted at end-of-day (cash + digital + free-text note). State
// is lifted to App.jsx so it can flow through the cloud sync path; we just
// read/write through `cashCloses` + `onSetCashClose(date, value | null)`.
function todayKey() {
  // Local YYYY-MM-DD for today. Was previously hardwired to '2026-05-05'
  // (the demo's fake "today"), which meant every close the hotelier
  // recorded actually saved against May 5 and disappeared from the
  // dashboard on next reload. Now keyed by the real calendar date.
  return ymd(ANCHOR);
}

function DailyCloseCard({ todayBookings, isHi, cashCloses, onSetCashClose, cashAccounts, t }) {
  const dateKey = todayKey();
  const closes = cashCloses || {};
  const closed = closes[dateKey];
  // Use the hotelier-configured account list. Fallback to the two
  // legacy buckets so properties that haven't customised still get
  // the familiar Cash + Digital UI.
  const accounts = (Array.isArray(cashAccounts) && cashAccounts.length)
    ? cashAccounts
    : [
        { id: 'cash',    label: t('cashDrawer'),     kind: 'cash' },
        { id: 'digital', label: t('digitalUpiCard'), kind: 'upi' },
      ];
  const [open, setOpen] = useState(false);
  // Per-account amount inputs, keyed by account id. Reset on submit
  // or cancel.
  const [amounts, setAmounts] = useState({});
  const [note, setNote] = useState('');

  const expected = todayBookings.reduce((s, b) => s + (b.total || 0), 0);

  const submit = () => {
    const collected = accounts.map(a => ({
      accountId: a.id,
      label: a.label,
      kind: a.kind,
      amount: Math.max(0, +(amounts[a.id] || 0)),
    }));
    const total = collected.reduce((s, a) => s + a.amount, 0);
    if (total <= 0 && !note.trim()) return;
    const now = new Date();
    const closedAt = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
    const cash = collected.filter(a => a.kind === 'cash').reduce((s, a) => s + a.amount, 0);
    const digital = total - cash;
    onSetCashClose(dateKey, { accounts: collected, cash, digital, total, expected, note: note.trim(), closedAt });
    setOpen(false);
    setAmounts({});
    setNote('');
  };

  const reopen = () => {
    onSetCashClose(dateKey, null);
  };

  if (closed) {
    const gap = (closed.total || 0) - (closed.expected || 0);
    const closedAccounts = Array.isArray(closed.accounts) && closed.accounts.length
      ? closed.accounts
      : [
          { label: t('payCash'), amount: closed.cash || 0 },
          { label: t('digitalShort'), amount: closed.digital || 0 },
        ];
    return (
      <div style={{ padding: '0 16px 14px' }}>
        <SectionHead title={t('endOfDay')} action={
          <button onClick={reopen} style={{ background: 'none', border: 'none', color: T.ink3, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>{t('reopen')}</button>
        } />
        <Card padding={14}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: closedAccounts.length > 0 ? 10 : 0 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: T.okLt, color: T.ok, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="check" size={16} stroke={2.4} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.ink }}>{t('closedAt')} <span className="tnum">{closed.closedAt}</span></div>
              <div className="tnum" style={{ fontSize: 11, color: T.ink3, marginTop: 1 }}>
                {t('totalVsBilled').replace('{total}', (closed.total || 0).toLocaleString('en-IN'))}
                {Math.abs(gap) > 0 && (closed.expected || 0) > 0 && (
                  <span style={{ color: gap < 0 ? T.danger : T.indigo, marginLeft: 4 }}>
                    · {gap > 0 ? t('vsBilledPlus').replace('{amt}', gap.toLocaleString('en-IN')) : t('vsBilledMinus').replace('{amt}', Math.abs(gap).toLocaleString('en-IN'))}
                  </span>
                )}
              </div>
            </div>
          </div>
          {/* Per-account breakdown rendered as a compact stack. Only
              accounts with non-zero amounts show up so the card stays
              tight when only one or two were used today. */}
          {closedAccounts.filter(a => (a.amount || 0) > 0).length > 0 && (
            <div style={{ padding: '8px 10px', background: T.bgSoft, borderRadius: 7, marginTop: 4 }}>
              {closedAccounts.filter(a => (a.amount || 0) > 0).map((a, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', fontSize: 11 }}>
                  <span style={{ color: T.ink3, fontWeight: 600 }}>{a.label}</span>
                  <span className="tnum" style={{ color: T.ink, fontWeight: 700 }}>₹{(a.amount || 0).toLocaleString('en-IN')}</span>
                </div>
              ))}
            </div>
          )}
          {closed.note && <div style={{ fontSize: 11, color: T.ink2, marginTop: 8, fontStyle: 'italic' }}>"{closed.note}"</div>}
        </Card>
      </div>
    );
  }

  return (
    <div style={{ padding: '0 16px 14px' }}>
      <SectionHead title={t('endOfDay')} />
      <Card padding={0} style={{ overflow: 'hidden' }}>
        <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: T.primaryLt, color: T.primaryDk, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon name="inr" size={16} stroke={2.2} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>{t('closeTodaysCash')}</div>
            <div style={{ fontSize: 11, color: T.ink3, marginTop: 1 }} className="tnum">
              {expected > 0 ? t('nBookingsBilled').replace('{n}', `${todayBookings.length} ${todayBookings.length > 1 ? t('bookingN') : t('booking1')}`).replace('{amt}', expected.toLocaleString('en-IN')) : t('noBookingsToday')}
            </div>
          </div>
          {!open && (
            <button
              onClick={() => setOpen(true)}
              className="atithi-tap"
              style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: T.primary, color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
            >{t('closeDay')}</button>
          )}
        </div>
        {open && (
          <div style={{ padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* One input row per hotelier-configured account. Caps at
                whatever the property's cashAccounts list holds; the
                bigger the list the more vertical space the card eats.
                Most properties keep it to 2-4 accounts. */}
            {accounts.map((a, i) => (
              <div key={a.id}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: T.ink3, letterSpacing: 0.3, textTransform: 'uppercase' }}>{a.label}</span>
                  <span style={{ fontSize: 9, color: T.ink3, fontWeight: 700, letterSpacing: 0.2 }}>{(a.kind || '').toUpperCase()}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '8px 10px', background: T.bgSoft, border: `1.5px solid ${i === 0 ? T.primary : T.border}`, borderRadius: 8 }}>
                  <span style={{ fontSize: 14, color: T.ink3, fontWeight: 700 }}>₹</span>
                  <input onFocus={(e) => e.target.select()}
                    type="number"
                    autoFocus={i === 0}
                    value={amounts[a.id] || ''}
                    onChange={(e) => setAmounts(x => ({ ...x, [a.id]: e.target.value }))}
                    placeholder="0"
                    className="tnum"
                    style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 16, fontWeight: 700, color: T.ink, minWidth: 0 }}
                  />
                </div>
              </div>
            ))}
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('dayCloseNotePlaceholder')} style={{ width: '100%', boxSizing: 'border-box', border: `1px solid ${T.border}`, background: T.card, borderRadius: 8, padding: '8px 10px', fontSize: 12, color: T.ink, outline: 'none' }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { setOpen(false); setAmounts({}); setNote(''); }} className="atithi-tap" style={{ flex: 1, padding: '10px', borderRadius: 8, border: `1px solid ${T.border}`, background: T.card, color: T.ink2, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{t('cancel')}</button>
              <button onClick={submit} className="atithi-tap" style={{ flex: 2, padding: '10px', borderRadius: 8, border: 'none', background: T.primary, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{t('closeDay')}</button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

// Setup checklist surfaced on the Dashboard. Counts how many essential
// property-profile fields are filled and nudges the hotelier to finish setup.
// Hides itself completely once everything's filled. The most useful nudge —
// CA email — unlocks the monthly invoice export to the accountant.
function SetupNudge({ property, plan = 'engine', go, isHi }) {
  // English + Hindi label pairs. Non-technical hoteliers may set their app
  // to Hindi from day one — this is the first screen they see, so leaving
  // it English-only would be off-putting.
  // CA email is only required on the Invoicing plan (the plan that enables
  // the monthly invoice export). For Engine + Channels, listing it pushes a
  // task they don't actually need and made the nudge feel stuck at 4/5.
  const items = [
    { id: 'name',    en: 'Property name',                       hi: 'प्रॉपर्टी का नाम',            done: !!(property?.profile?.name?.trim()) },
    { id: 'phone',   en: 'Property phone',                      hi: 'फ़ोन नंबर',                  done: !!(property?.profile?.phone?.trim()) },
    { id: 'address', en: 'Address',                             hi: 'पता',                          done: !!(property?.profile?.address?.trim()) },
    ...(plan === 'invoicing' ? [
      { id: 'ca',    en: "CA's email (for monthly export)",     hi: 'CA का ईमेल (मासिक एक्सपोर्ट)', done: !!(property?.accountant?.email?.trim()) },
    ] : []),
    { id: 'rooms',   en: 'At least one room category',          hi: 'कम-से-कम एक कमरा श्रेणी',     done: Array.isArray(property?.categories) && property.categories.length > 0 },
  ];
  const done = items.filter(i => i.done).length;
  const total = items.length;
  if (done === total) return null;
  const pct = Math.round((done / total) * 100);
  const title = isHi ? 'सेटअप पूरा करें' : 'Finish setting up';
  const cta   = isHi ? 'सेटिंग्स में सेटअप पूरा करें →' : 'Finish setup in Settings →';
  return (
    <div style={{ padding: '0 16px 14px' }}>
      <SectionHead title={title} action={
        <span className="tnum" style={{ fontSize: 11, fontWeight: 700, color: T.ink3 }}>{done}/{total}</span>
      } />
      <Card padding={14}>
        <div style={{ height: 6, background: T.bgSoft, borderRadius: 3, overflow: 'hidden', marginBottom: 12 }}>
          <div style={{ width: `${pct}%`, height: '100%', background: T.primary, borderRadius: 3, transition: 'width .25s' }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
          {items.map(it => (
            <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 18, height: 18, borderRadius: 9, flexShrink: 0,
                background: it.done ? T.ok : T.bgSoft,
                color: it.done ? '#fff' : T.ink4,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: it.done ? 'none' : `1px solid ${T.border}`,
              }}>
                {it.done && <Icon name="check" size={10} stroke={2.6} />}
              </div>
              <span style={{ fontSize: 12, color: it.done ? T.ink3 : T.ink2, fontWeight: 600, textDecoration: it.done ? 'line-through' : 'none' }}>
                {isHi ? it.hi : it.en}
              </span>
            </div>
          ))}
        </div>
        <button
          onClick={() => go('settings')}
          className="atithi-tap"
          style={{ width: '100%', padding: '10px', borderRadius: 8, border: 'none', background: T.primary, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
        >{cta}</button>
      </Card>
    </div>
  );
}

function ArrivalRow({ b, go, dayName, t, roomTypes, isRepeat }) {
  // Defensive defaults (R9-3): a deleted room category or unexpected
  // channel must not white-screen the whole Dashboard when an affected
  // booking arrives today.
  const rt = roomTypes.find(r => r.id === b.roomTypeId) || { name: '—' };
  const ch = CHANNELS[b.channel] || { label: b.channel || 'Direct', color: T.ink3, short: '?' };
  return (
    <Card padding={12} onClick={() => go('booking', b.id)} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}>
      <Avatar name={b.guest} size={40} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.guest}</span>
          {b.vip && <Chip color="warn" style={{ padding: '1px 6px', fontSize: 9 }}>{t('vipChip')}</Chip>}
          {b.formC && <Chip color="indigo" style={{ padding: '1px 6px', fontSize: 9 }}>{t('formCChip')}</Chip>}
          {isRepeat && <Chip color="ok" icon="sync" style={{ padding: '1px 6px', fontSize: 9 }}>{t('repeatChip')}</Chip>}
        </div>
        <div style={{ fontSize: 11, color: T.ink2, marginTop: 3, display: 'flex', alignItems: 'center', gap: 5, fontWeight: 600 }} className="tnum">
          <Icon name="cal" size={10} color={T.ink3} stroke={2} />
          <span>{dayName(b.startIdx)}</span>
          <Icon name="arrow" size={9} color={T.ink4} stroke={2.5} />
          <span>{dayName(b.startIdx + b.nights)}</span>
          <span style={{ color: T.ink3, fontWeight: 500 }}>· {b.nights}N</span>
        </div>
        <div style={{ fontSize: 11, color: T.ink3, marginTop: 2, display: 'flex', alignItems: 'center', gap: 5 }}>
          <span>{rt.name}</span><span>·</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: ch.color, fontWeight: 600 }}>
            <span style={{ width: 6, height: 6, borderRadius: 3, background: ch.color }} /> {ch.label}
          </span>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
        <span className="tnum" style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>₹{(b.total/1000).toFixed(1)}k</span>
        {b.paid < b.total && <Chip color="warn" style={{ fontSize: 9 }}>{t('balChip').replace('{amt}', ((b.total-b.paid)/1000).toFixed(1))}</Chip>}
        {b.paid >= b.total && <Chip color="ok" style={{ fontSize: 9 }} icon="check">{t('paidChip')}</Chip>}
      </div>
    </Card>
  );
}

export default function Dashboard({ go, bookings, property, plan = 'engine', t, lang, onAddPayment, onExtendHold, cashCloses, onSetCashClose, can = () => true }) {
  // RBAC. Pending payment quick-settle buttons need manage_payments;
  // the day-close card needs manage_expenses (because the close-out
  // captures money in/out of the property and rolls into the daily
  // ledger). New-staff members typically have neither and see the
  // dashboard purely as a read-only overview.
  const canPay     = can('manage_payments');
  const canDayClose = can('manage_expenses');
  const canExtend  = can('edit_bookings');
  const isHi = lang === 'hi';
  // Carousel pagination state — tracks which of the 3 occupancy /
  // income / earned-this-month cards is currently centered. Dots
  // were static (always first-dot-wide) until this was wired up.
  const carouselRef = useRef(null);
  const [carouselIdx, setCarouselIdx] = useState(0);
  const onCarouselScroll = () => {
    const el = carouselRef.current;
    if (!el) return;
    // Each card is 100% of container width minus the side gap, so
    // active index is just round(scrollLeft / scrollWidth-per-card).
    // We use clientWidth as the per-card width approximation since
    // each card's minWidth is 'calc(100% - 26px)'.
    const cardWidth = el.clientWidth - 26;
    if (cardWidth <= 0) return;
    const next = Math.min(2, Math.max(0, Math.round(el.scrollLeft / cardWidth)));
    if (next !== carouselIdx) setCarouselIdx(next);
  };
  const ROOM_TYPES = effectiveRoomTypes(property);
  const repeats = repeatGuestKeys(bookings);
  // Fake "New booking · MakeMyTrip" toast was removed: it claimed bookings
  // that never happened (channel sync isn't wired) and visually overlapped
  // the greeting on every Dashboard mount. When real OTA sync lands the
  // toast can come back, driven by the actual event stream.

  // ANCHOR is local midnight of today, so idx 0 is today in the new model.
  // Everything that used to compare against `1` (the demo's hardcoded
  // "today = idx 1") needs to use 0 instead.
  const TODAY_IDX = 0;
  // Exclude cancellations from every tile / list — they shouldn't inflate
  // "arriving today" counts. The old code counted them.
  const liveBookings = bookings.filter(b => b.status !== 'cancelled');
  const arrivingList = liveBookings.filter(b => b.startIdx === TODAY_IDX);
  const departingList = liveBookings.filter(b => b.startIdx + b.nights === TODAY_IDX);
  const inhouseList = liveBookings.filter(b => b.startIdx <= TODAY_IDX && b.startIdx + b.nights > TODAY_IDX);
  const today = arrivingList; // kept for downstream consumers that still read `today`
  const arriving = arrivingList.length;
  const departing = departingList.length;
  const inhouse = inhouseList.length;
  // Stat-tile sheet: which group of bookings to surface, or null when
  // closed. The list itself is computed inline from the three arrays
  // above so the sheet stays in sync if a booking is created / updated
  // while the sheet is open.
  const [statSheet, setStatSheet] = useState(null);
  const totalRooms = ROOM_TYPES.reduce((a, r) => a + r.units, 0);

  // R8-3: occupancy + daily income must exclude cancelled bookings (use
  // liveBookings), matching the In-house/Arriving tiles below — otherwise a
  // cancelled in-house stay inflated both and contradicted those tiles.
  const catOcc = ROOM_TYPES.map(rt => {
    const occ = liveBookings.filter(b => b.roomTypeId === rt.id && b.startIdx <= TODAY_IDX && b.startIdx + b.nights > TODAY_IDX).length;
    return { rt, occ, total: rt.units };
  });
  const occRooms = catOcc.reduce((a, c) => a + c.occ, 0);

  const dailyIncome = liveBookings
    .filter(b => b.startIdx <= TODAY_IDX && b.startIdx + b.nights > TODAY_IDX)
    .reduce((a, b) => a + Math.round((b.total || 0) / (b.nights || 1)), 0); // R9-8: guard /0
  const collectedToday = bookings
    .filter(b => b.startIdx === TODAY_IDX)
    .reduce((a, b) => a + b.paid, 0);
  // Yesterday's collection — used as the comparison point for the Daily
  // Income card's % change badge. Real number, replacing the old hardcoded
  // "+24%" placeholder.
  const collectedYesterday = bookings
    .filter(b => b.startIdx === TODAY_IDX - 1)
    .reduce((a, b) => a + b.paid, 0);
  const dailyChangePct = collectedYesterday > 0
    ? Math.round(((collectedToday - collectedYesterday) / collectedYesterday) * 100)
    : null;

  // "Month so far" — honest figures (R8-2). The card is labelled "EARNED THIS
  // MONTH · Total received so far", but the old code summed all-time BILLED
  // (b.total across every non-cancelled booking, any date) and divided
  // room-nights by a fixed 14-day window — so it could read "₹2.8 lakh
  // received" when only ₹50k was collected this month. Now: revenue actually
  // RECEIVED this calendar month (payments collected within it, net of
  // refunds) + occupancy over the month's real days.
  const _now = new Date(ANCHOR);
  const monthStartIso = ymd(new Date(_now.getFullYear(), _now.getMonth(), 1));
  const monthEndIso = ymd(new Date(_now.getFullYear(), _now.getMonth() + 1, 0));
  const daysInMonth = new Date(_now.getFullYear(), _now.getMonth() + 1, 0).getDate();
  const monthStartIdx = dateToIdx(monthStartIso), monthEndIdx = dateToIdx(monthEndIso);
  // Collection date of a payment (matches Reports' P&L): dateIso → parsed date
  // → booking check-in as a last resort (so legacy paid-but-no-ledger bookings
  // still attribute to a day instead of vanishing).
  const payIsoDash = (p, b) => {
    if (p && p.dateIso) return p.dateIso;
    if (p && p.date && p.date !== 'now') { const d = new Date(p.date); if (!isNaN(d.getTime())) return ymd(d); }
    return (b && b.startIdx != null) ? idxToDate(b.startIdx) : '';
  };
  const roomsHeldDash = (b) => (Array.isArray(b.roomItems) && b.roomItems.length) ? b.roomItems.length : 1;
  let monthRevenue = 0;
  for (const b of liveBookings) {
    const pays = (b.payments && b.payments.length)
      ? b.payments
      : (b.paid > 0 ? [{ amount: b.paid, kind: 'payment', dateIso: idxToDate(b.startIdx || 0) }] : []);
    for (const p of pays) {
      const iso = payIsoDash(p, b);
      if (!iso || iso < monthStartIso || iso > monthEndIso) continue;
      monthRevenue += (p.kind === 'refund' || p.kind === 'credit' || p.kind === 'credit_note') ? -(p.amount || 0) : (p.amount || 0);
    }
  }
  monthRevenue = Math.max(0, monthRevenue);
  // P5 (perf): single O(bookings) pass instead of O(daysInMonth × bookings) —
  // for each booking add (nights overlapping this month) × rooms held, which
  // equals the old per-day sum (Fubini) without the nested day loop.
  let monthOccNights = 0;
  for (const b of liveBookings) {
    const s = Math.max(monthStartIdx, b.startIdx || 0);
    const e = Math.min(monthEndIdx + 1, (b.startIdx || 0) + (b.nights || 1));
    if (e > s) monthOccNights += (e - s) * roomsHeldDash(b);
  }
  const availableRoomNights = totalRooms * daysInMonth;
  const monthOccPct = availableRoomNights > 0 ? Math.round((monthOccNights / availableRoomNights) * 100) : 0;
  const monthBookings = liveBookings.filter(b => (b.startIdx || 0) <= monthEndIdx && (b.startIdx || 0) + (b.nights || 1) > monthStartIdx).length;
  const monthAvgPerRoom = monthOccNights > 0 ? Math.round(monthRevenue / monthOccNights) : 0;

  // 12-bar trailing mini-chart for the Daily Income card. Builds the last
  // 12 days of paid amounts straight from the bookings ledger — was
  // previously a hardcoded sample array [62, 70, ...] that didn't reflect
  // anything real.
  const dailyTrail = Array.from({ length: 12 }, (_, i) => {
    const dayIdx = TODAY_IDX - 11 + i;
    return bookings.filter(b => b.startIdx === dayIdx).reduce((s, b) => s + (b.paid || 0), 0);
  });
  const trailPeak = Math.max(1, ...dailyTrail);

  const onHold = bookings.filter(b => b.status === 'tentative');

  // Pending payments: guest has arrived (or should have) but balance is still due.
  // These are the bookings most likely to be missing payment data needed for invoicing.
  const pendingPayments = bookings.filter(b => {
    if (b.status === 'cancelled' || b.status === 'tentative') return false;
    const balance = (b.total || 0) - (b.paid || 0);
    if (balance <= 0) return false;
    if (b.status === 'checkedin' || b.status === 'checkout') return true;
    if (b.status === 'confirmed' && b.startIdx <= TODAY_IDX) return true;
    return false;
  });
  const pendingTotal = pendingPayments.reduce((s, b) => s + (b.total - b.paid), 0);

  // Smart nudges — action-oriented suggestions surfaced as a small "Today's
  // nudges" card. Each one is a heuristic over the bookings array; the card
  // hides entirely when no nudges apply, keeping the dashboard calm.
  const tomorrowIdx = TODAY_IDX + 1;
  const arrivingTomorrow = bookings.filter(b => b.startIdx === tomorrowIdx && b.status !== 'cancelled');
  const foreignOnProperty = bookings.filter(b => b.formC && b.status !== 'cancelled' && b.startIdx <= TODAY_IDX && b.startIdx + b.nights > TODAY_IDX);
  // Tick every 30 seconds so time-sensitive nudges (10-min hold
  // warning, 4h hold-expiring) refresh while the hotelier has the
  // dashboard open. Cheap — just bumps an integer counter.
  const [, setTickN] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTickN(n => n + 1), 30 * 1000);
    return () => clearInterval(id);
  }, []);

  const nowMs = Date.now();
  // Two urgency tiers for tentative holds:
  //   - imminent: ≤10 minutes — RED, "urgent — call now"
  //   - soon:     >10 min and ≤4h — amber, "chase payment"
  const holdsImminent     = bookings.filter(b => b.status === 'tentative' && b.releaseTs && b.releaseTs > nowMs && b.releaseTs - nowMs <= 10 * 60 * 1000);
  const holdsExpiringSoon = bookings.filter(b => b.status === 'tentative' && b.releaseTs && b.releaseTs > nowMs && b.releaseTs - nowMs > 10 * 60 * 1000 && b.releaseTs - nowMs < 4 * 3600 * 1000);

  // Unseen website-channel bookings. The hotelier acknowledges by
  // tapping the nudge, which opens the booking AND clears the flag.
  // Acknowledged IDs are kept in localStorage so refresh / re-open
  // doesn't re-pop the nudge.
  const seenWebsite = (() => {
    try {
      const raw = window.localStorage.getItem('atithi.seenWebsite.v1');
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch { return new Set(); }
  })();
  const newWebsiteBookings = bookings.filter(b =>
    b.channel === 'website' && b.status !== 'cancelled' && !seenWebsite.has(b.id)
  );
  const ackWebsite = (id) => {
    try {
      const raw = window.localStorage.getItem('atithi.seenWebsite.v1');
      const arr = raw ? JSON.parse(raw) : [];
      if (!arr.includes(id)) arr.push(id);
      window.localStorage.setItem('atithi.seenWebsite.v1', JSON.stringify(arr));
    } catch {}
  };

  const nudges = [];
  // Imminent holds get top priority — render first so the urgency
  // colour catches the eye before the calmer nudges below.
  if (holdsImminent.length > 0) {
    const first = holdsImminent[0];
    const mins = Math.max(1, Math.round((first.releaseTs - nowMs) / 60000));
    nudges.push({
      icon: 'clock', tone: T.danger,
      text: t('nudgeHoldsImminent').replace('{who}', holdsImminent.length === 1 ? first.guest : `${holdsImminent.length} ${t('nudgeHoldsWord')}`).replace('{mins}', mins),
      cta: holdsImminent.length === 1 ? t('nudgeOpen') : t('nudgeView'),
      onClick: () => {
        if (holdsImminent.length === 1) go('booking', first.id);
        else go('diary');
      },
    });
  }
  if (newWebsiteBookings.length > 0) {
    const first = newWebsiteBookings[0];
    nudges.push({
      icon: 'bell', tone: 'oklch(58% 0.16 200)',
      text: `${newWebsiteBookings.length === 1 ? t('nudgeNewWebsite1') : t('nudgeNewWebsiteN').replace('{n}', newWebsiteBookings.length)} · ${first.guest}`,
      cta: newWebsiteBookings.length === 1 ? t('nudgeReview') : t('nudgeViewAll'),
      onClick: () => {
        if (newWebsiteBookings.length === 1) {
          ackWebsite(first.id);
          go('booking', first.id);
        } else {
          newWebsiteBookings.forEach(b => ackWebsite(b.id));
          go('diary');
        }
      },
    });
  }
  if (arrivingTomorrow.length > 0) {
    // The green WhatsApp button promises WhatsApp, so it should open
    // WhatsApp — not just navigate. Compose a directions message for the
    // first arriving guest. If there are multiple, the hotelier sees the
    // first one's chat, sends, then can tap again (the nudge re-renders
    // with the next guest first if they've been contacted; otherwise the
    // hotelier opens the rest from Diary).
    const first = arrivingTomorrow[0];
    const firstDigits = (first && first.phone || '').replace(/\D/g, '');
    nudges.push({
      icon: 'wa', tone: '#25D366',
      text: t('nudgeArriveTomorrow').replace('{n}', `${arrivingTomorrow.length} ${arrivingTomorrow.length > 1 ? t('guests').toLowerCase() : t('guest').toLowerCase()}`),
      cta: arrivingTomorrow.length > 1 ? `${t('payWhatsapp')} ${first.guest.split(' ')[0]}` : t('payWhatsapp'),
      onClick: () => {
        if (!firstDigits) { go('diary'); return; }
        const propName = property?.profile?.name || 'our property';
        const mapUrl = property?.profile?.mapUrl || '';
        const checkInTime = property?.profile?.checkIn || '14:00';
        const msg = `Hi ${first.guest},\n\nLooking forward to hosting you at ${propName} tomorrow.\n\n${mapUrl ? `📍 Directions: ${mapUrl}\n\n` : ''}Check-in opens at ${checkInTime}. Your booking ID is ${first.id}.\n\nReach us anytime on this number.`;
        window.open(`https://wa.me/${firstDigits}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
      },
    });

    // Custom pre-arrival reminders (Settings → Pre-arrival reminders).
    // For each reminder × each tomorrow-arriving guest with a phone,
    // surface a nudge with a WhatsApp button that opens the chat with
    // the reminder text prefilled. Caps at 6 nudges total so the
    // dashboard doesn't drown in reminders for a busy property — the
    // hotelier can still see the rest by tapping into individual
    // bookings.
    const customReminders = Array.isArray(property?.accountant?.customReminders) ? property.accountant.customReminders : [];
    const propName = property?.profile?.name || 'our property';
    let added = 0;
    outer: for (const reminder of customReminders) {
      for (const guest of arrivingTomorrow) {
        if (added >= 6) break outer;
        const digits = (guest.phone || '').replace(/\D/g, '');
        if (!digits) continue;
        nudges.push({
          icon: 'wa', tone: '#25D366',
          text: t('nudgeReminderArrive').replace('{text}', reminder.text).replace('{guest}', guest.guest),
          cta: t('nudgeSend'),
          onClick: () => {
            const msg = `Hi ${guest.guest},\n\n${reminder.text}\n\nReach us anytime on this number — ${propName}.`;
            window.open(`https://wa.me/${digits}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
          },
        });
        added += 1;
      }
    }
  }
  if (foreignOnProperty.length > 0) {
    nudges.push({
      icon: 'flag', tone: T.indigo,
      text: t('nudgeForeignFormC').replace('{n}', `${foreignOnProperty.length} ${foreignOnProperty.length > 1 ? t('nudgeForeignGuests') : t('nudgeForeignGuest')}`),
      cta: t('nudgeReview'),
      onClick: () => go('guests'),
    });
  }
  if (holdsExpiringSoon.length > 0) {
    nudges.push({
      icon: 'clock', tone: 'oklch(60% 0.14 75)',
      text: t('nudgeHoldsSoon').replace('{n}', `${holdsExpiringSoon.length} ${holdsExpiringSoon.length > 1 ? t('nudgeHoldsWord') : t('nudgeHoldWord')}`),
      cta: t('nudgeView'),
      onClick: () => go('diary'),
    });
  }
  const markSettled = (b, method = 'cash') => {
    if (!onAddPayment) return;
    const balance = b.total - b.paid;
    const noteByMethod = { cash: 'Settled at property · cash', upi: 'Settled at property · UPI' };
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const dateIso = `${yyyy}-${mm}-${dd}`;
    // Human-readable timestamp for the BookingDetail folio ledger.
    // Used to be the literal string 'now' — which then rendered as
    // the word "now" in the payments list. Use the same DD MMM · HH:MM
    // format PaymentSheet uses so both code paths produce identical
    // ledger entries.
    const dateStr = now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) + ' · ' + now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
    onAddPayment(b.id, {
      id: 'p_' + Date.now(),
      kind: 'payment',
      method,
      amount: balance,
      note: noteByMethod[method] || `Settled at property · ${method}`,
      date: dateStr,
      dateIso,
    });
  };

  // Format a day index as a short date label, e.g. "23 May" or "बुध · 23 मई".
  // Computes the actual date from ANCHOR + idx so the month and day-of-week
  // are correct regardless of how far ahead/behind the booking is.
  const dayName = (idx, withDow = false) => {
    const d = new Date(ANCHOR);
    d.setDate(d.getDate() + idx);
    const monIdx = d.getMonth();
    const mon = isHi ? D_MONTH_HI[monIdx] : ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][monIdx];
    const dowIdx = (d.getDay() + 6) % 7;
    const dow = isHi ? D_DOW_HI[dowIdx] : ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][dowIdx];
    return withDow ? `${dow} · ${d.getDate()} ${mon}` : `${d.getDate()} ${mon}`;
  };

  return (
    <div id="atithi-dash-scroll" style={{ flex: 1, overflow: 'auto', paddingBottom: 100, position: 'relative' }}>
      <div style={{
        background: `linear-gradient(160deg, ${T.primary} 0%, ${T.primaryDk} 100%)`,
        padding: '56px 20px 18px', color: '#fff', position: 'relative', overflow: 'hidden',
      }}>
        <svg style={{ position: 'absolute', right: -20, top: -10, opacity: 0.1 }} width="180" height="180" viewBox="0 0 180 180">
          <circle cx="90" cy="90" r="60" stroke="#fff" strokeWidth="1" fill="none"/>
          <circle cx="90" cy="90" r="40" stroke="#fff" strokeWidth="1" fill="none"/>
          <circle cx="90" cy="90" r="20" stroke="#fff" strokeWidth="1" fill="none"/>
        </svg>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 11, opacity: 0.8, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' }} className={isHi ? 'hi' : ''}>{(() => {
              const opts = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' };
              const locale = isHi ? 'hi-IN' : 'en-IN';
              return new Date().toLocaleDateString(locale, opts);
            })()}</div>
            <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.4, marginTop: 2 }} className="hi">
              {t('namaste')}
            </div>
            {/* Property name + city. Until the hotelier has set up
                their profile (first visit, Onboarding wizard not yet
                completed), this prompts them with a soft nudge —
                instead of falsely labelling their app with a demo
                property's name (the old fallback was "Yatra Desert
                Camp · Jaisalmer" which read as "this app pretends to
                be someone else's hotel" to a fresh user). */}
            <div style={{ fontSize: 13, opacity: 0.85, marginTop: 1 }}>
              {(() => {
                const name = (property?.profile?.name || '').trim();
                const city = (property?.profile?.city || '').trim();
                if (name && city) return `${name} · ${city}`;
                if (name) return name;
                return isHi ? 'Settings में अपनी होटल जोड़ें' : 'Add your hotel in Settings →';
              })()}
            </div>
          </div>
          {/* Notifications bell removed — it didn't open anything. Will return
              when there's a real notifications inbox (Phase 3 — WhatsApp /
              email alerts have a destination). */}
        </div>

        <div ref={carouselRef} onScroll={onCarouselScroll} style={{ display: 'flex', gap: 10, overflowX: 'auto', margin: '0 -20px', padding: '0 20px 4px', scrollSnapType: 'x mandatory' }}>
          {/* Card 1 — Occupancy */}
          <div style={{ background: 'rgba(255,255,255,0.14)', backdropFilter: 'blur(10px)', borderRadius: 14, padding: '12px 14px', border: '1px solid rgba(255,255,255,0.22)', minWidth: 'calc(100% - 26px)', scrollSnapAlign: 'start', flexShrink: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
              <span style={{ fontSize: 10, opacity: 0.85, fontWeight: 700, letterSpacing: 0.4 }} className={isHi ? 'hi' : ''}>{t('occupancyToday')}</span>
              <span className="tnum" style={{ fontSize: 11, opacity: 0.85, fontWeight: 600 }}>{occRooms}/{totalRooms} {t('rooms')}</span>
            </div>
            <div className="tnum" style={{ fontSize: 28, fontWeight: 700, letterSpacing: -0.6, lineHeight: 1 }}>
              {occRooms}<span style={{ fontSize: 13, opacity: 0.75, fontWeight: 600 }}> {t('booked')}</span>
            </div>
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 5 }}>
              {catOcc.map(c => (
                <div key={c.rt.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: T[c.rt.tag], flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 11, opacity: 0.9, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.rt.name}</span>
                  <div style={{ flex: 1.2, display: 'flex', gap: 2 }}>
                    {Array.from({ length: c.total }).map((_, i) => (
                      <span key={i} style={{ flex: 1, height: 5, borderRadius: 1, background: i < c.occ ? '#fff' : 'rgba(255,255,255,0.25)' }} />
                    ))}
                  </div>
                  <span className="tnum" style={{ fontSize: 11, fontWeight: 700, minWidth: 26, textAlign: 'right' }}>{c.occ}/{c.total}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Card 2 — Daily income */}
          <div style={{ background: 'rgba(255,255,255,0.14)', backdropFilter: 'blur(10px)', borderRadius: 14, padding: '12px 14px', border: '1px solid rgba(255,255,255,0.22)', minWidth: 'calc(100% - 26px)', scrollSnapAlign: 'start', flexShrink: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
              <span style={{ fontSize: 10, opacity: 0.85, fontWeight: 700, letterSpacing: 0.4 }} className={isHi ? 'hi' : ''}>{t('dailyIncome')}</span>
              {dailyChangePct !== null && (
                <span style={{ fontSize: 10, opacity: 0.85, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: 'rgba(255,255,255,0.18)' }}>
                  {dailyChangePct > 0 ? '+' : ''}{dailyChangePct}%
                </span>
              )}
            </div>
            <div className="tnum" style={{ fontSize: 28, fontWeight: 700, letterSpacing: -0.6, lineHeight: 1 }}>
              ₹{(dailyIncome/1000).toFixed(1)}<span style={{ fontSize: 14, opacity: 0.8 }}>k</span>
            </div>
            <div style={{ fontSize: 10, opacity: 0.8, marginTop: 4, fontWeight: 600 }} className="tnum">
              {isHi ? 'आज वसूली' : 'Collected today'} ₹{collectedToday.toLocaleString('en-IN')}
            </div>
            <div style={{ marginTop: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 10, opacity: 0.85, fontWeight: 700, letterSpacing: 0.4 }} className={isHi ? 'hi' : ''}>{isHi ? 'पिछले 12 दिन' : 'LAST 12 DAYS'}</span>
                <span className="tnum" style={{ fontSize: 11, fontWeight: 700 }}>
                  ₹{(dailyTrail.reduce((a, v) => a + v, 0) / 1000).toFixed(1)}k
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 30 }}>
                {dailyTrail.map((v, i) => (
                  <div key={i} style={{ flex: 1, height: `${Math.max(4, (v/trailPeak)*100)}%`, background: i === dailyTrail.length - 1 ? '#fff' : 'rgba(255,255,255,0.55)', borderRadius: '2px 2px 0 0' }} />
                ))}
              </div>
            </div>
          </div>

          {/* Card 3 — Month summary */}
          <div style={{ background: 'rgba(255,255,255,0.14)', backdropFilter: 'blur(10px)', borderRadius: 14, padding: '12px 14px', border: '1px solid rgba(255,255,255,0.22)', minWidth: 'calc(100% - 26px)', scrollSnapAlign: 'start', flexShrink: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
              <span style={{ fontSize: 10, opacity: 0.85, fontWeight: 700, letterSpacing: 0.4 }} className={isHi ? 'hi' : ''}>{isHi ? 'इस महीने कमाई' : 'EARNED THIS MONTH'}</span>
              <span style={{ fontSize: 10, opacity: 0.85, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: 'rgba(255,255,255,0.18)' }}>
                {new Date().toLocaleDateString(isHi ? 'hi-IN' : 'en-IN', { month: 'short', year: 'numeric' })}
              </span>
            </div>
            <div className="tnum" style={{ fontSize: 28, fontWeight: 700, letterSpacing: -0.6, lineHeight: 1 }}>
              ₹{monthRevenue >= 100000
                ? (monthRevenue/100000).toFixed(1)
                : monthRevenue.toLocaleString('en-IN')}
              {monthRevenue >= 100000 && (
                <span style={{ fontSize: 13, opacity: 0.75, fontWeight: 600 }} className={isHi ? 'hi' : ''}>
                  {isHi ? ' लाख' : ' lakh'}
                </span>
              )}
            </div>
            <div style={{ fontSize: 10, opacity: 0.8, marginTop: 4, fontWeight: 600 }}>
              {isHi ? 'अब तक कुल आय' : 'Total received so far'}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 10, opacity: 0.85, fontWeight: 600 }}>
              <div>
                <div className="tnum" style={{ fontSize: 14, fontWeight: 700 }}>{monthBookings}</div>
                {isHi ? 'बुकिंग' : 'bookings'}
              </div>
              <div>
                <div className="tnum" style={{ fontSize: 14, fontWeight: 700 }}>{monthOccPct}%</div>
                {isHi ? 'कमरे भरे' : 'rooms full'}
              </div>
              <div>
                <div className="tnum" style={{ fontSize: 14, fontWeight: 700 }}>₹{monthAvgPerRoom.toLocaleString('en-IN')}</div>
                {isHi ? '/कमरा/रात' : '/room/night'}
              </div>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 5, marginTop: 8 }}>
          {[0,1,2].map(i => <span key={i} style={{ width: i === carouselIdx ? 14 : 5, height: 5, borderRadius: 3, background: i === carouselIdx ? '#fff' : 'rgba(255,255,255,0.5)', transition: 'width .2s' }} />)}
        </div>
      </div>

      <div style={{ padding: '14px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        <StatTile label={t('arriving')} value={arriving} icon="arrow" color={T.primary} onClick={() => setStatSheet('arriving')} disabled={arriving === 0} />
        <StatTile label={t('inhouse')} value={inhouse} icon="bed" color={T.indigo} onClick={() => setStatSheet('inhouse')} disabled={inhouse === 0} />
        <StatTile label={t('departing')} value={departing} icon="door" color={T.teal} onClick={() => setStatSheet('departing')} disabled={departing === 0} />
      </div>

      <SetupNudge property={property} plan={plan} go={go} isHi={isHi} />

      {nudges.length > 0 && (
        <div id="atithi-nudges" style={{ padding: '0 16px 14px' }}>
          <SectionHead title={isHi ? 'आज के सुझाव' : "Today's nudges"} />
          <Card padding={0} style={{ overflow: 'hidden' }}>
            {nudges.map((n, i) => (
              <div key={i} style={{
                padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10,
                borderBottom: i < nudges.length - 1 ? `1px solid ${T.borderSoft}` : 'none',
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 9,
                  background: `color-mix(in oklch, ${n.tone} 14%, white)`, color: n.tone,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <Icon name={n.icon} size={14} stroke={2} />
                </div>
                <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: T.ink, fontWeight: 600, lineHeight: 1.4 }}>{n.text}</div>
                <button
                  onClick={n.onClick}
                  className="atithi-tap"
                  style={{
                    padding: '6px 10px', borderRadius: 7, border: 'none',
                    background: n.tone, color: '#fff',
                    fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                  }}
                >{n.cta}</button>
              </div>
            ))}
          </Card>
        </div>
      )}

      {pendingPayments.length > 0 && (
        <div style={{ padding: '0 16px 14px' }}>
          <SectionHead title={isHi ? 'बकाया भुगतान' : 'Pending payments'} action={
            <span className="tnum" style={{ fontSize: 11, fontWeight: 700, color: T.danger }}>
              ₹{pendingTotal.toLocaleString('en-IN')} {isHi ? 'बाकी' : 'due'}
            </span>
          } />
          <Card padding={0} style={{ overflow: 'hidden' }}>
            {pendingPayments.map((b, i) => {
              const balance = b.total - b.paid;
              const statusLabel = b.status === 'checkedin'
                ? (isHi ? 'ठहरे हुए' : 'In-house')
                : b.status === 'checkout'
                  ? (isHi ? 'जा चुके' : 'Departed')
                  : (isHi ? 'आज आए' : 'Arrived today');
              return (
                <div key={b.id} style={{
                  padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10,
                  borderBottom: i < pendingPayments.length - 1 ? `1px solid ${T.borderSoft}` : 'none',
                }}>
                  <div onClick={() => go('booking', b.id)} style={{ flex: 1, minWidth: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: T.dangerLt, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.danger, flexShrink: 0 }}>
                      <Icon name="inr" size={16} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.guest}</div>
                      <div style={{ fontSize: 11, color: T.ink3 }} className="tnum">
                        {b.id} · {statusLabel} · ₹{balance.toLocaleString('en-IN')} due
                      </div>
                    </div>
                  </div>
                  {canPay && (
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      <button
                        onClick={() => markSettled(b, 'cash')}
                        className="atithi-tap"
                        aria-label={isHi ? 'कैश से चुकाया' : 'Mark paid by cash'}
                        style={{
                          padding: '7px 12px', borderRadius: 8, border: 'none',
                          background: T.primary, color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {isHi ? 'कैश' : 'Cash'}
                      </button>
                      <button
                        onClick={() => markSettled(b, 'upi')}
                        className="atithi-tap"
                        aria-label={isHi ? 'UPI से चुकाया' : 'Mark paid by UPI'}
                        style={{
                          padding: '7px 12px', borderRadius: 8, border: 'none',
                          background: T.ok, color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        UPI
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
            <div style={{ padding: '8px 14px', background: T.bgSoft, fontSize: 10.5, color: T.ink3, fontWeight: 600, lineHeight: 1.35 }}>
              {isHi
                ? 'पूरी बकाया रकम तुरंत दर्ज करने के लिए कैश या UPI दबाएँ। कार्ड या आधी-आधी रकम के लिए, बुकिंग खोलें।'
                : 'Tap Cash or UPI to instantly record the full balance. For card or split payments, tap the row to open the booking.'}
            </div>
          </Card>
        </div>
      )}

      {onHold.length > 0 && (
        <div style={{ padding: '0 16px 14px' }}>
          <SectionHead title={t('autoRelease')} />
          <Card padding={0} style={{ overflow: 'hidden' }}>
            {onHold.map((b, i) => (
              <div key={b.id} style={{
                padding: '12px 14px',
                borderBottom: i < onHold.length - 1 ? `1px solid ${T.borderSoft}` : 'none',
              }}>
                <div onClick={() => go('booking', b.id)} style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: T.warnLt, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'oklch(48% 0.14 75)' }}>
                    <Icon name="clock" size={16} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: T.ink }}>{b.guest}</div>
                    <div style={{ fontSize: 11, color: T.ink3 }} className="tnum">
                      {dayName(b.startIdx)} → {dayName(b.startIdx + b.nights)} · ₹{b.total.toLocaleString('en-IN')} {t('unpaid')}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="tnum" style={{ fontSize: 13, fontWeight: 700, color: 'oklch(48% 0.14 75)' }}>{b.releaseAt}</div>
                    <div style={{ fontSize: 10, color: T.ink3, fontWeight: 600 }}>{t('releasesToday')}</div>
                  </div>
                </div>
                {onExtendHold && canExtend && (
                  <div style={{ paddingLeft: 48 }}>
                    <ExtendOptions
                      onExtend={(hours) => onExtendHold(b.id, hours)}
                      colors={{ border: 'oklch(75% 0.10 75)', text: 'oklch(40% 0.14 75)' }}
                      hi={isHi}
                    />
                  </div>
                )}
              </div>
            ))}
          </Card>
        </div>
      )}

      <div style={{ padding: '0 16px 14px' }}>
        <SectionHead title={t('arrivingToday')} action={
          <button onClick={() => go('diary')} style={{ background: 'none', border: 'none', color: T.primary, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            {t('seeAll')} <Icon name="chev" size={11} stroke={2.5} />
          </button>
        } />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {today.slice(0, 4).map(b => <ArrivalRow key={b.id} b={b} go={go} dayName={dayName} t={t} roomTypes={ROOM_TYPES} isRepeat={repeats.has(normPhone(b.phone))} />)}
        </div>
      </div>

      {/* Tomorrow's arrivals — share to the team via WhatsApp. Only
          rendered when:
            1. There ARE arrivals tomorrow (otherwise nothing to share)
            2. The hotelier has configured at least one recipient
               (Settings → Team alerts)
          One tap opens WhatsApp pre-filled with the arrivals digest for
          each recipient in sequence. True auto-send awaits Phase 3
          WhatsApp Cloud API. */}
      {arrivingTomorrow.length > 0 && Array.isArray(property?.profile?.arrivalsRecipients) && property.profile.arrivalsRecipients.filter(r => (r.phone || '').replace(/\D/g, '').length >= 7).length > 0 && (
        <div style={{ padding: '0 16px 14px' }}>
          <SectionHead title={t('tomorrowArrivalsShare')} />
          <Card padding={0}>
            <div style={{ padding: '14px 14px 10px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: `1px solid ${T.borderSoft}` }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: 'oklch(96% 0.04 145)', color: 'oklch(35% 0.13 145)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name="wa" size={18} stroke={2} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>
                  {t('guestsArrivingTomorrow').replace('{n}', `${arrivingTomorrow.length} ${arrivingTomorrow.length > 1 ? t('guests').toLowerCase() : t('guest').toLowerCase()}`)}
                </div>
                <div className="tnum" style={{ fontSize: 11, color: T.ink3, fontWeight: 600, marginTop: 1 }}>
                  {(() => { const rc = property.profile.arrivalsRecipients.filter(r => (r.phone || '').replace(/\D/g, '').length >= 7).length; return t('goesToNRecipients').replace('{n}', `${rc} ${rc === 1 ? t('recipient') : t('recipients')}`); })()}
                </div>
              </div>
            </div>
            {(() => {
              // Build the digest message (shared text for every recipient).
              const propName = property?.profile?.name || 'Property';
              const lines = [
                `*Tomorrow's arrivals · ${propName}*`,
                '',
                ...arrivingTomorrow.map(b => {
                  const rt = ROOM_TYPES.find(r => r.id === b.roomTypeId) || { name: '—' };
                  const checkIn = new Date(ANCHOR);
                  checkIn.setDate(checkIn.getDate() + b.startIdx);
                  const checkInLbl = checkIn.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' });
                  const balance = (b.total || 0) - (b.paid || 0);
                  return [
                    `*${b.guest}* (${b.id})`,
                    `📅 ${checkInLbl} · ${b.nights}N · ${rt?.name || 'Room'}`,
                    `👥 ${b.guests || ''} · 📞 ${b.phone || ''}`,
                    balance > 0 ? `💰 Balance ₹${balance.toLocaleString('en-IN')}` : `✅ Paid in full · ₹${(b.total || 0).toLocaleString('en-IN')}`,
                    b.notes ? `📝 ${b.notes}` : '',
                  ].filter(Boolean).join('\n');
                }),
              ].join('\n\n');
              const recipients = property.profile.arrivalsRecipients.filter(r => (r.phone || '').replace(/\D/g, '').length >= 7);
              // Build a wa.me URL per recipient. Used to call
              // window.open() in a loop with setTimeouts — the
              // 300ms gap doesn't fool popup blockers, so the 2nd
              // and 3rd recipients were silently dropped and the
              // hotelier thought everyone got the message.
              //
              // Real fix: never loop window.open(). For 1 recipient
              // open inline (single user gesture). For 2+ render a
              // per-recipient row with its own button — each tap is
              // a user gesture → no popup-blocker.
              const waUrlFor = (phone) => {
                const digits = (phone || '').replace(/\D/g, '');
                return `https://wa.me/${digits}?text=${encodeURIComponent(lines)}`;
              };
              const openSingleWa = () => {
                if (recipients.length === 0) return;
                window.open(waUrlFor(recipients[0].phone), '_blank', 'noopener');
              };
              const downloadHtml = () => {
                // Printable HTML summary the hotelier can save as PDF
                // or forward manually. Matches the voucher styling so
                // it feels like part of the same product.
                // esc(): guest name / notes / phone come from the public
                // booking widget (untrusted), and this string is written
                // into a new window via document.write — escape every
                // interpolated field to prevent stored XSS (round-10 R10-1).
                const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
                const html = `<!DOCTYPE html><html><head><meta charset="UTF-8" /><title>Tomorrow's arrivals · ${esc(propName)}</title>
<style>
  body { font-family: 'Helvetica Neue', Arial, sans-serif; padding: 32px; max-width: 760px; margin: 0 auto; color: #1a1a1a; }
  h1 { font-size: 22pt; margin-bottom: 4px; }
  .sub { color: #777; font-size: 10pt; margin-bottom: 22px; }
  .arrival { padding: 14px 16px; border: 1px solid #E8E0D8; border-radius: 10px; margin-bottom: 12px; background: #FBF7F3; }
  .name { font-size: 14pt; font-weight: 700; }
  .meta { font-size: 11pt; color: #555; margin-top: 6px; line-height: 1.6; }
  .balance { color: #c8553d; font-weight: 700; }
  .paid { color: #0E8A5F; font-weight: 700; }
  .actions { margin-top: 20px; text-align: center; }
  .actions button { padding: 10px 20px; border-radius: 8px; border: 1px solid #c8553d; background: #c8553d; color: #fff; font-weight: 700; cursor: pointer; }
  @media print { .actions { display: none; } }
</style></head><body>
<h1>Tomorrow's arrivals</h1>
<div class="sub">${esc(propName)} · ${arrivingTomorrow.length} guest${arrivingTomorrow.length > 1 ? 's' : ''} expected</div>
${arrivingTomorrow.map(b => {
  const rt = ROOM_TYPES.find(r => r.id === b.roomTypeId) || { name: '—' };
  const checkIn = new Date(ANCHOR);
  checkIn.setDate(checkIn.getDate() + b.startIdx);
  const checkInLbl = checkIn.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' });
  const balance = (b.total || 0) - (b.paid || 0);
  return `<div class="arrival">
  <div class="name">${esc(b.guest)} · ${esc(b.id)}</div>
  <div class="meta">
    <strong>Check-in:</strong> ${checkInLbl} · ${b.nights} night${b.nights > 1 ? 's' : ''}<br/>
    <strong>Room:</strong> ${esc(rt?.name || 'Room')} · ${esc(b.guests)}<br/>
    <strong>Phone:</strong> ${esc(b.phone)}<br/>
    <strong>Status:</strong> ${balance > 0 ? `<span class="balance">Balance ₹${balance.toLocaleString('en-IN')}</span>` : `<span class="paid">Paid in full · ₹${(b.total || 0).toLocaleString('en-IN')}</span>`}
    ${b.notes ? `<br/><strong>Note:</strong> ${esc(b.notes)}` : ''}
  </div>
</div>`;
}).join('')}
<div class="actions"><button onclick="window.print()">Save as PDF / Print</button></div>
</body></html>`;
                const w = window.open('', '_blank', 'width=820,height=900');
                if (w) { w.document.write(html); w.document.close(); }
              };
              return (
                <div style={{ padding: '10px 14px 14px' }}>
                  {/* Single recipient → one big button. Multiple → a list
                      with per-recipient send buttons so each tap is its
                      own user gesture (popup blockers don't fire). */}
                  {recipients.length <= 1 ? (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={openSingleWa}
                        disabled={recipients.length === 0}
                        style={{
                          flex: 1, padding: '10px 12px', borderRadius: 8,
                          border: 'none', background: recipients.length === 0 ? T.bgSoft : '#25D366', color: recipients.length === 0 ? T.ink3 : '#fff',
                          fontSize: 12, fontWeight: 700, cursor: recipients.length === 0 ? 'not-allowed' : 'pointer',
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        }}
                      >
                        <Icon name="wa" size={13} color={recipients.length === 0 ? T.ink3 : '#fff'} stroke={2} />
                        {recipients.length === 0
                          ? t('addPhoneInSettings')
                          : t('sendOnWhatsapp')}
                      </button>
                      <button
                        onClick={downloadHtml}
                        style={{
                          padding: '10px 12px', borderRadius: 8,
                          border: `1px solid ${T.border}`, background: T.card, color: T.ink2,
                          fontSize: 12, fontWeight: 700, cursor: 'pointer',
                          display: 'inline-flex', alignItems: 'center', gap: 6,
                        }}
                      >
                        <Icon name="download" size={12} stroke={2} color={T.ink2} /> PDF
                      </button>
                    </div>
                  ) : (
                    <>
                      <div style={{ fontSize: 11, color: T.ink3, fontWeight: 600, marginBottom: 8, lineHeight: 1.5 }}>
                        {t('nRecipientsTapEach').replace('{n}', recipients.length)}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
                        {recipients.map((r, i) => (
                          <button
                            key={i}
                            onClick={() => window.open(waUrlFor(r.phone), '_blank', 'noopener')}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 8,
                              padding: '8px 12px', borderRadius: 7,
                              border: `1px solid #25D366`,
                              background: 'oklch(95% 0.05 145)', color: 'oklch(35% 0.13 145)',
                              fontSize: 12, fontWeight: 700, cursor: 'pointer', textAlign: 'left',
                            }}
                          >
                            <Icon name="wa" size={13} color="oklch(35% 0.13 145)" stroke={2} />
                            <span style={{ flex: 1, minWidth: 0 }}>{r.label || r.phone}</span>
                            <span className="tnum" style={{ fontSize: 10, opacity: 0.7 }}>{r.phone}</span>
                          </button>
                        ))}
                      </div>
                      <button
                        onClick={downloadHtml}
                        style={{
                          width: '100%', padding: '8px 12px', borderRadius: 7,
                          border: `1px solid ${T.border}`, background: T.card, color: T.ink2,
                          fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        }}
                      >
                        <Icon name="download" size={12} stroke={2} color={T.ink2} /> {t('downloadAsPdfInstead')}
                      </button>
                    </>
                  )}
                </div>
              );
            })()}
          </Card>
        </div>
      )}

      {/* Channel mix donut — computed from real bookings[].channel.
          Surfaces only on Channels / Invoicing tiers because Engine
          properties don't sync OTAs so the donut would always be 100%
          direct. Wedges + legend rows are derived live: ring is drawn
          from the largest slice clockwise, legend is sorted same way. */}
      {plan !== 'engine' && (() => {
        const liveActive = (bookings || []).filter(b => b.status !== 'cancelled');
        if (liveActive.length === 0) return null;
        const tally = new Map();
        for (const b of liveActive) {
          const ch = b.channel || 'direct';
          tally.set(ch, (tally.get(ch) || 0) + 1);
        }
        const palette = {
          direct:  { color: T.primary, label: isHi ? 'डायरेक्ट' : 'Direct' },
          website: { color: 'oklch(58% 0.16 200)', label: isHi ? 'वेबसाइट' : 'Website' },
          mmt:     { color: '#EB2026', label: 'MakeMyTrip' },
          booking: { color: '#003580', label: 'Booking.com' },
          goibibo: { color: '#F0728F', label: 'Goibibo' },
          agoda:   { color: '#5392F9', label: 'Agoda' },
          airbnb:  { color: '#FF5A5F', label: 'Airbnb' },
        };
        const total = liveActive.length;
        const slices = Array.from(tally.entries())
          .map(([ch, count]) => ({
            id: ch,
            count,
            pct: Math.round((count / total) * 100),
            color: (palette[ch] && palette[ch].color) || T.ink3,
            label: (palette[ch] && palette[ch].label) || ch,
          }))
          .sort((a, b) => b.count - a.count);
        // SVG ring math — circumference of r=28 ≈ 175.9. We walk clockwise
        // from 12 o'clock, each slice occupying (count / total) of the
        // ring. Use unrounded ratios for the dash math so the wedges
        // sum exactly to the full ring even when displayed percentages
        // are rounded.
        const C = 175.9;
        let offsetRatio = 0;
        const wedges = slices.map(s => {
          const ratio = s.count / total;
          const w = { color: s.color, dash: ratio * C, offset: -offsetRatio * C };
          offsetRatio += ratio;
          return w;
        });
        return (
          <div style={{ padding: '0 16px 16px' }}>
            <SectionHead title={t('channelMix')} />
            <Card>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ position: 'relative', width: 70, height: 70 }}>
                  <svg width="70" height="70" viewBox="0 0 70 70">
                    <circle cx="35" cy="35" r="28" fill="none" stroke={T.bgSoft} strokeWidth="10"/>
                    {wedges.map((w, i) => (
                      <circle
                        key={i}
                        cx="35" cy="35" r="28" fill="none"
                        stroke={w.color} strokeWidth="10"
                        strokeDasharray={`${w.dash} ${C}`}
                        strokeDashoffset={w.offset}
                        transform="rotate(-90 35 35)"
                        strokeLinecap="butt"
                      />
                    ))}
                  </svg>
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {slices.map(s => (
                    <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color }} />
                      <span style={{ flex: 1, color: T.ink2 }}>{s.label}</span>
                      <span className="tnum" style={{ fontWeight: 700, color: T.ink }}>{s.pct}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </div>
        );
      })()}

      {canDayClose && <DailyCloseCard todayBookings={today} isHi={isHi} t={t} cashCloses={cashCloses} onSetCashClose={onSetCashClose} cashAccounts={property?.cashAccounts} />}

      {statSheet && (() => {
        const map = {
          arriving: { title: isHi ? 'आज आ रहे हैं' : 'Arriving today', list: arrivingList, color: T.primary, icon: 'arrow' },
          inhouse:  { title: isHi ? 'अभी ठहरे हुए' : 'In-house right now', list: inhouseList, color: T.indigo, icon: 'bed' },
          departing:{ title: isHi ? 'आज जा रहे हैं' : 'Departing today', list: departingList, color: T.teal, icon: 'door' },
        };
        const cfg = map[statSheet];
        return (
          <div
            onClick={() => setStatSheet(null)}
            style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 50, display: 'flex', alignItems: 'flex-end' }}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{ width: '100%', background: T.card, borderRadius: '16px 16px 0 0', padding: '18px 16px 28px', maxHeight: '78%', overflow: 'auto' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <div style={{ width: 32, height: 32, borderRadius: 10, background: `color-mix(in oklch, ${cfg.color} 14%, white)`, color: cfg.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={cfg.icon} size={16} stroke={2} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: T.ink, letterSpacing: -0.2 }}>{cfg.title}</div>
                  <div className="tnum" style={{ fontSize: 11, color: T.ink3, marginTop: 1 }}>{cfg.list.length} {cfg.list.length === 1 ? (isHi ? 'बुकिंग' : 'booking') : (isHi ? 'बुकिंग' : 'bookings')}</div>
                </div>
                <button
                  onClick={() => setStatSheet(null)}
                  style={{ background: 'transparent', border: 'none', color: T.ink3, cursor: 'pointer', padding: 6 }}
                  aria-label="Close"
                ><Icon name="x" size={14} stroke={2.2} /></button>
              </div>
              {cfg.list.length === 0 ? (
                <div style={{ padding: '24px 8px', textAlign: 'center', fontSize: 12, color: T.ink3, fontStyle: 'italic' }}>
                  {isHi ? 'इस श्रेणी में अभी कोई बुकिंग नहीं है।' : 'No bookings in this group right now.'}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {cfg.list.map(b => {
                    const rt = ROOM_TYPES.find(r => r.id === b.roomTypeId) || { name: '—' };
                    const initials = (b.guest || '?').split(/\s+/).map(s => s[0]).slice(0, 2).join('').toUpperCase();
                    const stay = b.startIdx + b.nights;
                    const waDigits = (b.phone || '').replace(/\D/g, '');
                    return (
                      <div
                        key={b.id}
                        onClick={() => { setStatSheet(null); go('booking', b.id); }}
                        className="atithi-tap"
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '10px 12px', background: T.bgSoft,
                          border: `1px solid ${T.borderSoft}`, borderRadius: 10,
                          cursor: 'pointer',
                        }}
                      >
                        <div style={{ width: 32, height: 32, borderRadius: 16, background: cfg.color, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, letterSpacing: 0.4, flexShrink: 0 }}>
                          {initials || '?'}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.guest || '—'}</div>
                          <div className="tnum" style={{ fontSize: 10.5, color: T.ink3, fontWeight: 600, marginTop: 1, display: 'flex', alignItems: 'center', gap: 5 }}>
                            <span>{rt?.name || b.roomTypeId}</span><span>·</span>
                            <span>{statSheet === 'departing' ? (isHi ? 'चेक-आउट' : 'check-out') : `${b.nights}N`}</span>
                            {statSheet !== 'departing' && (b.startIdx + b.nights) === TODAY_IDX + 1 && (
                              <><span>·</span><span style={{ color: T.primary }}>{isHi ? 'कल जाएंगे' : 'leaves tmrw'}</span></>
                            )}
                          </div>
                        </div>
                        {waDigits && (
                          <a
                            href={`https://wa.me/${waDigits}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            className="atithi-tap"
                            style={{ width: 32, height: 32, borderRadius: 16, background: 'oklch(94% 0.08 150)', color: 'oklch(40% 0.15 145)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', flexShrink: 0 }}
                            aria-label="WhatsApp"
                          >
                            <Icon name="wa" size={14} stroke={2.2} />
                          </a>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

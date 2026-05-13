// screens-booking.jsx — New Booking flow + Booking detail/folio + Confirmed

// ─────────────────────────────────────────────────────────────
// VOUCHER PDF — opens a new window with a print-styled voucher
// ─────────────────────────────────────────────────────────────
function generateVoucher(b, rt) {
  const checkIn = new Date(2026, 4, 4 + (b.startIdx || 0));
  const checkOut = new Date(2026, 4, 4 + (b.startIdx || 0) + b.nights);
  const fmtDate = (d) => d.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
  const fmtINR = (n) => '₹' + (n || 0).toLocaleString('en-IN');
  const balance = (b.total || 0) - (b.paid || 0);
  const extrasList = Object.entries(b.extras || {}).map(([id, qty]) => {
    const all = [...EXTRAS_DEFAULT, ...(b.customExtras || [])];
    const ex = all.find(x => x.id === id);
    if (!ex) return null;
    const price = (b.extraPrices && b.extraPrices[id] != null) ? b.extraPrices[id] : ex.price;
    return { label: ex.label, qty, price, total: price * qty };
  }).filter(Boolean);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Voucher · ${b.id} · ${b.guest}</title>
<style>
  @page { size: A4; margin: 18mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1a1a1a; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { padding: 24px; max-width: 720px; margin: 0 auto; font-size: 12pt; line-height: 1.45; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 18px; border-bottom: 2px solid #C8553D; margin-bottom: 24px; }
  .brand { display: flex; align-items: center; gap: 12px; }
  .logo { width: 44px; height: 44px; border-radius: 10px; background: linear-gradient(135deg, #C8553D, #E07A5F); color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 20px; font-family: Georgia, serif; }
  .brand-name { font-size: 17pt; font-weight: 800; color: #1a1a1a; letter-spacing: -0.3px; }
  .brand-sub { font-size: 9pt; color: #777; margin-top: 2px; }
  .voucher-meta { text-align: right; font-size: 9pt; color: #777; }
  .voucher-meta .id { font-size: 13pt; font-weight: 700; color: #C8553D; letter-spacing: 0.5px; margin-bottom: 4px; }
  h2 { font-size: 9pt; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #999; margin-bottom: 8px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 22px; }
  .card { border: 1px solid #E8E0D8; border-radius: 10px; padding: 14px 16px; background: #FBF7F3; }
  .stay { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 18px; padding: 18px 20px; background: #FBF7F3; border-radius: 12px; margin-bottom: 22px; border: 1px solid #E8E0D8; }
  .stay .date-label { font-size: 8pt; font-weight: 700; letter-spacing: 1.2px; color: #999; text-transform: uppercase; }
  .stay .date-value { font-size: 16pt; font-weight: 700; margin-top: 2px; }
  .stay .date-sub { font-size: 9pt; color: #888; }
  .stay .nights { text-align: center; }
  .stay .nights-num { font-size: 22pt; font-weight: 800; color: #C8553D; line-height: 1; }
  .stay .nights-lbl { font-size: 8pt; color: #999; letter-spacing: 1px; margin-top: 2px; text-transform: uppercase; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 22px; font-size: 11pt; }
  th { text-align: left; padding: 8px 6px; border-bottom: 1.5px solid #E8E0D8; font-size: 8pt; font-weight: 700; letter-spacing: 1px; color: #999; text-transform: uppercase; }
  th.r, td.r { text-align: right; }
  td { padding: 8px 6px; border-bottom: 1px solid #F0E8E0; }
  tfoot td { border-bottom: none; font-weight: 700; padding-top: 12px; font-size: 12pt; }
  tfoot td.total { color: #C8553D; font-size: 14pt; }
  .note { padding: 12px 14px; background: #FFF8F0; border-left: 3px solid #E07A5F; border-radius: 0 8px 8px 0; font-size: 10pt; color: #555; margin-bottom: 22px; }
  .note .lbl { font-size: 8pt; font-weight: 700; color: #C8553D; letter-spacing: 1px; margin-bottom: 4px; text-transform: uppercase; }
  .terms { font-size: 8pt; color: #888; line-height: 1.5; padding-top: 18px; border-top: 1px solid #E8E0D8; }
  .terms strong { color: #1a1a1a; }
  .stamp { display: inline-block; padding: 6px 14px; border: 2px solid ${balance > 0 ? '#C8553D' : '#0E8A5F'}; color: ${balance > 0 ? '#C8553D' : '#0E8A5F'}; font-size: 10pt; font-weight: 800; letter-spacing: 1.5px; border-radius: 6px; transform: rotate(-3deg); }
  .actions { margin-top: 24px; display: flex; gap: 10px; justify-content: center; }
  .actions button { padding: 10px 22px; border-radius: 8px; border: 1px solid #C8553D; background: #C8553D; color: #fff; font-size: 11pt; font-weight: 700; cursor: pointer; }
  .actions button.ghost { background: #fff; color: #C8553D; }
  @media print { .actions { display: none; } }
</style>
</head>
<body>
  <div class="head">
    <div class="brand">
      <div class="logo">A</div>
      <div>
        <div class="brand-name">Yatra Desert Camp</div>
        <div class="brand-sub">Sam Sand Dunes Road, Jaisalmer, Rajasthan 345001 · +91 98290 12345</div>
      </div>
    </div>
    <div class="voucher-meta">
      <div class="id">${b.id}</div>
      <div>Issued ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
      <div style="margin-top: 8px;"><span class="stamp">${balance > 0 ? 'BALANCE DUE' : 'PAID IN FULL'}</span></div>
    </div>
  </div>

  <h2>Booking voucher</h2>
  <div class="grid">
    <div class="card">
      <h2 style="margin-bottom: 10px;">Guest</h2>
      <div style="font-size: 13pt; font-weight: 700;">${b.guest}</div>
      <div style="font-size: 10pt; color: #666; margin-top: 4px;">${b.phone || ''}</div>
      <div style="font-size: 10pt; color: #666;">${b.guests || ''}</div>
    </div>
    <div class="card">
      <h2 style="margin-bottom: 10px;">Accommodation</h2>
      <div style="font-size: 13pt; font-weight: 700;">${rt ? rt.name : 'Room'}</div>
      <div style="font-size: 10pt; color: #666; margin-top: 4px;">${(b.roomItems && b.roomItems.length) || 1} unit(s) · ${b.guests || ''}</div>
      <div style="font-size: 10pt; color: #666;">Channel: Direct</div>
    </div>
  </div>

  <div class="stay">
    <div>
      <div class="date-label">Check-in</div>
      <div class="date-value">${fmtDate(checkIn)}</div>
      <div class="date-sub">From 14:00</div>
    </div>
    <div class="nights">
      <div class="nights-num">${b.nights}</div>
      <div class="nights-lbl">${b.nights === 1 ? 'Night' : 'Nights'}</div>
    </div>
    <div style="text-align: right;">
      <div class="date-label">Check-out</div>
      <div class="date-value">${fmtDate(checkOut)}</div>
      <div class="date-sub">By 11:00</div>
    </div>
  </div>

  <h2>Folio</h2>
  <table>
    <thead>
      <tr><th>Description</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">Amount</th></tr>
    </thead>
    <tbody>
      <tr>
        <td>${rt ? rt.name : 'Room'} · tariff</td>
        <td class="r">${(b.roomItems && b.roomItems.length) || 1} × ${b.nights}N</td>
        <td class="r">—</td>
        <td class="r">${fmtINR(b.total - extrasList.reduce((s, e) => s + e.total, 0))}</td>
      </tr>
      ${extrasList.map(e => `<tr><td>${e.label}</td><td class="r">${e.qty}</td><td class="r">${fmtINR(e.price)}</td><td class="r">${fmtINR(e.total)}</td></tr>`).join('')}
    </tbody>
    <tfoot>
      <tr><td colspan="3">Total</td><td class="r total">${fmtINR(b.total)}</td></tr>
      <tr><td colspan="3" style="font-size: 11pt; color: #666;">Paid</td><td class="r" style="font-size: 11pt; color: #0E8A5F;">${fmtINR(b.paid)}</td></tr>
      ${balance > 0 ? `<tr><td colspan="3" style="font-size: 11pt;">Balance due at check-in</td><td class="r" style="color: #C8553D;">${fmtINR(balance)}</td></tr>` : ''}
    </tfoot>
  </table>

  ${b.notes ? `<div class="note"><div class="lbl">Special request</div>${b.notes}</div>` : ''}

  <div class="terms">
    <strong>Terms:</strong> Check-in from 14:00, check-out by 11:00. Valid photo ID required at check-in. Cancellation: free up to 48h before arrival; 50% charge thereafter; no-show forfeits full advance. GST will be charged as applicable. For any change, WhatsApp +91 98290 12345 quoting <strong>${b.id}</strong>.
    <br/><br/>
    <strong>Thank you for choosing Yatra Desert Camp.</strong> We look forward to hosting you in Jaisalmer.
  </div>

  <div class="actions">
    <button onclick="window.print()">Save as PDF / Print</button>
    <button class="ghost" onclick="window.close()">Close</button>
  </div>
  <script>setTimeout(function(){ window.print(); }, 400);<\/script>
</body>
</html>`;

  const w = window.open('', '_blank', 'width=820,height=900');
  if (w) { w.document.write(html); w.document.close(); }
}

const EXTRAS_DEFAULT = [
  { id: 'breakfast', label: 'Breakfast', sub: 'Veg buffet', price: 350, icon: 'veg' },
  { id: 'safari',    label: 'Desert safari', sub: 'Per person', price: 1500, icon: 'sun' },
  { id: 'pickup',    label: 'Station pickup', sub: 'One-way', price: 800, icon: 'arrow' },
  { id: 'bonfire',   label: 'Bonfire & music', sub: 'Per evening', price: 2500, icon: 'star' },
  { id: 'cake',      label: 'Celebration cake', sub: '1kg', price: 1200, icon: 'tag' },
];

// ─────────────────────────────────────────────────────────────
// NEW BOOKING — multi-step (Stay → Room → Guest → Payment)
// ─────────────────────────────────────────────────────────────
function NewBooking({ go, onCreate, plan = 'engine', t, editing }) {
  const isEdit = !!editing;
  const [step, setStep] = React.useState(1);
  const [data, setData] = React.useState(() => {
    if (editing) {
      return {
        checkIn: '04 May 2026', nights: editing.nights,
        roomTypeId: editing.roomTypeId,
        roomItems: editing.roomItems || [{ adults: 2, children: 0, rate: null }],
        name: editing.guest, phone: (editing.phone || '').replace(/^\+\d+\s*/, ''), email: '', country: 'IN', gstin: '',
        notes: editing.notes || '', source: 'walk-in', hold: false, holdHours: 4,
        payMethod: null, payAmount: 'full', payCustom: 0,
        extras: editing.extras || {}, customExtras: editing.customExtras || [], extraPrices: editing.extraPrices || {},
      };
    }
    return {
      checkIn: '04 May 2026', nights: 2,
      roomTypeId: null,
      roomItems: [{ adults: 2, children: 0, rate: null }],
      name: '', phone: '', email: '', country: 'IN', gstin: '',
      notes: '', source: 'walk-in', hold: false, holdHours: 4,
      payMethod: null, payAmount: 0, payCustom: 0,
      extras: {}, customExtras: [], extraPrices: {},
    };
  });
  const data_rooms = data.roomItems.length;
  const data_adults = data.roomItems.reduce((s, r) => s + r.adults, 0);
  const data_children = data.roomItems.reduce((s, r) => s + r.children, 0);
  const set = (k, v) => setData(d => ({ ...d, [k]: v }));

  const rt = ROOM_TYPES.find(r => r.id === data.roomTypeId);
  const withTax = plan === 'gst';
  const baseRate = rt ? rt.base : 0;
  const roomsSubtotal = rt
    ? data.roomItems.reduce((s, r) => s + (r.rate != null ? r.rate : baseRate), 0) * data.nights
    : 0;
  const allExtras = [...EXTRAS_DEFAULT, ...data.customExtras].map(ex => ({
    ...ex,
    price: data.extraPrices[ex.id] != null ? data.extraPrices[ex.id] : ex.price,
  }));
  const extrasTotal = Object.entries(data.extras).reduce((sum, [id, qty]) => {
    const ex = allExtras.find(x => x.id === id);
    return ex ? sum + ex.price * qty : sum;
  }, 0);
  const subtotal = roomsSubtotal + extrasTotal;
  const gst = withTax ? Math.round(subtotal * 0.12) : 0;
  const total = subtotal + gst;

  const titles = [t('stayDetails'), t('pickRoom'), t('guest'), t('payment')];
  const guestValid = data.name.trim().length > 0 && data.phone.trim().length >= 6;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: T.bg }}>
      <ScreenHeader
        title={isEdit ? t('editReservation') : titles[step - 1]}
        subtitle={isEdit ? `${editing.id} · ${titles[step - 1]}` : `${t('step')} ${step} ${t('of2')} 4`}
        onBack={() => step > 1 ? setStep(step - 1) : (isEdit ? go('booking', editing.id) : go('home'))}
      />
      <div style={{ display: 'flex', gap: 4, padding: '8px 16px 12px', background: T.card, borderBottom: `1px solid ${T.borderSoft}` }}>
        {[1, 2, 3, 4].map(s => (
          <div key={s} style={{ flex: 1, height: 3, borderRadius: 2, background: s <= step ? T.primary : T.bgSoft, transition: 'background .2s' }} />
        ))}
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '20px 16px 100px' }}>
        {step === 1 && <StepDates data={data} set={set} t={t} />}
        {step === 2 && <StepRoom data={data} set={set} t={t} baseRate={baseRate} />}
        {step === 3 && <StepGuest data={data} set={set} t={t} plan={plan} allExtras={allExtras} />}
        {step === 4 && <StepPayment data={data} set={set} subtotal={subtotal} gst={gst} total={total} withTax={withTax} t={t} roomsSubtotal={roomsSubtotal} extrasTotal={extrasTotal} allExtras={allExtras} />}
      </div>

      <div style={{
        background: T.card, borderTop: `1px solid ${T.borderSoft}`,
        padding: '12px 16px 28px', display: 'flex', alignItems: 'center', gap: 10,
      }}>
        {rt && (
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, color: T.ink3, fontWeight: 600, letterSpacing: 0.3, textTransform: 'uppercase' }}>{t('total')} {withTax ? '· incl. GST' : ''}</div>
            <div className="tnum" style={{ fontSize: 18, fontWeight: 700, color: T.ink, letterSpacing: -0.3 }}>₹{total.toLocaleString('en-IN')}</div>
          </div>
        )}
        {step < 4 ? (
          <Btn icon="arrow" onClick={() => {
            if (step === 2 && !data.roomTypeId) return;
            if (step === 3 && !guestValid) return;
            setStep(step + 1);
          }} disabled={(step === 2 && !data.roomTypeId) || (step === 3 && !guestValid)} style={{ flex: rt ? 'unset' : 1, opacity: ((step === 2 && !data.roomTypeId) || (step === 3 && !guestValid)) ? 0.4 : 1 }}>{t('continue')}</Btn>
        ) : (
          <Btn icon="check" onClick={() => { if (!guestValid) return; onCreate(data, total); }} disabled={!guestValid} style={{ flex: rt ? 'unset' : 1, opacity: guestValid ? 1 : 0.4 }}>
            {isEdit ? t('confirmMove') : t('confirmBooking')}
          </Btn>
        )}
      </div>
    </div>
  );
}

function StepDates({ data, set, t }) {
  const data_rooms = data.roomItems.length;
  const data_adults = data.roomItems.reduce((s, r) => s + r.adults, 0);
  const data_children = data.roomItems.reduce((s, r) => s + r.children, 0);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <Card padding={16}>
        <div style={{ fontSize: 12, fontWeight: 700, color: T.ink2, marginBottom: 12, letterSpacing: 0.2 }}>{t('when')}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 88px', gap: 10 }}>
          <Field label={t('checkIn')} value={data.checkIn} onChange={(e) => set('checkIn', e.target.value)} suffix={<Icon name="cal" size={16} color={T.ink3} />} />
          <Field label={t('nights')} value={data.nights} onChange={(e) => set('nights', +e.target.value || 1)} type="number" />
        </div>
        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: T.ink3 }}>
          <Icon name="info" size={13} />
          {t('checkOut')} · {String(4 + data.nights).padStart(2, '0')} May, 11:00 AM
        </div>
      </Card>

      <Card padding={16}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.ink2, letterSpacing: 0.2 }}>{t('roomsGuests')}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button onClick={() => data_rooms > 1 && set('roomItems', data.roomItems.slice(0, -1))} disabled={data_rooms <= 1} style={{ ...stepBtn, opacity: data_rooms <= 1 ? 0.4 : 1 }}>−</button>
            <span className="tnum" style={{ fontSize: 13, fontWeight: 700, minWidth: 56, textAlign: 'center', color: T.ink }}>{data_rooms} room{data_rooms > 1 ? 's' : ''}</span>
            <button onClick={() => set('roomItems', [...data.roomItems, { adults: 2, children: 0, rate: null }])} style={stepBtn}>+</button>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {data.roomItems.map((r, idx) => (
            <div key={idx} style={{ padding: 10, background: T.bgSoft, borderRadius: 10, border: `1px solid ${T.borderSoft}` }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.ink, letterSpacing: 0.1 }}>Room {idx + 1}</div>
                {data_rooms > 1 && (
                  <button onClick={() => set('roomItems', data.roomItems.filter((_, i) => i !== idx))} style={{ background: 'none', border: 'none', color: T.ink3, fontSize: 11, fontWeight: 600, cursor: 'pointer', padding: 2 }}>
                    <Icon name="x" size={12} />
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <MiniStep label={t('adults')} value={r.adults} onChange={(v) => set('roomItems', data.roomItems.map((x, i) => i === idx ? { ...x, adults: Math.max(1, v) } : x))} />
                <MiniStep label={t('children')} value={r.children} onChange={(v) => set('roomItems', data.roomItems.map((x, i) => i === idx ? { ...x, children: Math.max(0, v) } : x))} />
              </div>
            </div>
          ))}
        </div>
        {data_rooms > 1 && (
          <div style={{ marginTop: 10, padding: '8px 10px', background: T.primaryLt, borderRadius: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="info" size={12} color={T.primaryDk} />
            <span style={{ fontSize: 11, color: T.primaryDk, fontWeight: 600 }} className="tnum">{data_rooms} units · {data_adults}A {data_children > 0 ? `${data_children}C · ` : ''}same folio</span>
          </div>
        )}
      </Card>

      <Card padding={16} style={{ borderColor: T.warnLt, background: 'oklch(98% 0.018 75)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: T.warnLt, flexShrink: 0, color: 'oklch(48% 0.14 75)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="clock" size={18} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.ink, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>{t('blockRelease')}</span>
              <Toggle on={data.hold} onChange={(v) => set('hold', v)} />
            </div>
            <div style={{ fontSize: 12, color: T.ink3, marginTop: 4, lineHeight: 1.45 }}>
              Hold for {data.holdHours}h. Auto-frees inventory if guest doesn't pay or reply.
            </div>
            {data.hold && (
              <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                {[2, 4, 12, 24].map(h => (
                  <button key={h} onClick={() => set('holdHours', h)} className="atithi-tap" style={{
                    flex: 1, padding: '8px 0', borderRadius: 8,
                    border: data.holdHours === h ? `1.5px solid ${T.primary}` : `1px solid ${T.border}`,
                    background: data.holdHours === h ? T.primaryLt : T.card,
                    color: data.holdHours === h ? T.primaryDk : T.ink2,
                    fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  }}>{h}h</button>
                ))}
              </div>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

const Stepper = ({ label, sub, value, onChange }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: T.ink }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: T.ink3 }}>{sub}</div>}
    </div>
    <button onClick={() => onChange(Math.max(0, value - 1))} style={stepBtn}>−</button>
    <span className="tnum" style={{ fontSize: 16, fontWeight: 700, minWidth: 18, textAlign: 'center', color: T.ink }}>{value}</span>
    <button onClick={() => onChange(value + 1)} style={stepBtn}>+</button>
  </div>
);
const stepBtn = {
  width: 32, height: 32, borderRadius: 16, border: `1px solid ${T.border}`,
  background: T.card, color: T.ink, fontSize: 18, fontWeight: 600, cursor: 'pointer', lineHeight: 1,
};

const MiniStep = ({ label, value, onChange }) => (
  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, background: T.card, border: `1px solid ${T.borderSoft}`, borderRadius: 8, padding: '4px 6px 4px 10px' }}>
    <span style={{ fontSize: 11, fontWeight: 600, color: T.ink2 }}>{label}</span>
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <button onClick={() => onChange(value - 1)} style={{ width: 24, height: 24, borderRadius: 12, border: `1px solid ${T.border}`, background: T.bgSoft, color: T.ink, fontSize: 14, fontWeight: 700, cursor: 'pointer', lineHeight: 1 }}>−</button>
      <span className="tnum" style={{ fontSize: 13, fontWeight: 700, minWidth: 14, textAlign: 'center', color: T.ink }}>{value}</span>
      <button onClick={() => onChange(value + 1)} style={{ width: 24, height: 24, borderRadius: 12, border: `1px solid ${T.border}`, background: T.bgSoft, color: T.ink, fontSize: 14, fontWeight: 700, cursor: 'pointer', lineHeight: 1 }}>+</button>
    </div>
  </div>
);

const Toggle = ({ on, onChange }) => (
  <button onClick={() => onChange(!on)} style={{
    width: 38, height: 22, borderRadius: 11, border: 'none',
    background: on ? T.primary : T.bgSunk, position: 'relative',
    transition: 'background .2s', cursor: 'pointer', flexShrink: 0,
  }}>
    <span style={{
      position: 'absolute', top: 2, left: on ? 18 : 2, width: 18, height: 18,
      borderRadius: 9, background: '#fff', transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,.2)',
    }} />
  </button>
);

function StepRoom({ data, set, t, baseRate }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 12, color: T.ink3, marginBottom: 4 }}>
        For {data.roomItems.reduce((s,r)=>s+r.adults,0)}A{data.roomItems.reduce((s,r)=>s+r.children,0) > 0 && ` ${data.roomItems.reduce((s,r)=>s+r.children,0)}C`} · {data.roomItems.length} room{data.roomItems.length > 1 ? 's' : ''} · {data.nights} night{data.nights > 1 ? 's' : ''}
      </div>
      {ROOM_TYPES.map(rt => {
        const selected = data.roomTypeId === rt.id;
        const tagColor = T[rt.tag];
        return (
          <Card key={rt.id} padding={0} style={{
            cursor: 'pointer', overflow: 'hidden',
            borderColor: selected ? T.primary : T.borderSoft,
            borderWidth: selected ? 2 : 1, padding: 0,
            boxShadow: selected ? '0 0 0 4px ' + T.primaryLt : 'none',
          }}>
            <div onClick={() => { if (!selected) { set('roomTypeId', rt.id); set('roomItems', data.roomItems.map(r => ({ ...r, rate: null }))); } }} style={{ display: 'flex', gap: 0 }}>
              <div style={{
                width: 88, alignSelf: 'stretch', flexShrink: 0,
                background: `repeating-linear-gradient(135deg, ${tagColor} 0 8px, color-mix(in oklch, ${tagColor} 70%, white) 8px 16px)`,
                position: 'relative',
              }}>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: T.mono, fontSize: 9, color: 'rgba(0,0,0,0.4)', fontWeight: 600, textAlign: 'center', padding: 8 }}>
                  {rt.id}.jpg
                </div>
              </div>
              <div style={{ flex: 1, padding: 14, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>{rt.name}</div>
                    <div style={{ fontSize: 11, color: T.ink3, marginTop: 2 }} className="tnum">{rt.units - 2} of {rt.units} available</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="tnum" style={{ fontSize: 15, fontWeight: 700, color: T.ink, letterSpacing: -0.2 }}>
                      ₹{rt.base.toLocaleString('en-IN')}
                    </div>
                    <div style={{ fontSize: 10, color: T.ink3, fontWeight: 600 }}>{t('perNight')}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 5, marginTop: 8, flexWrap: 'wrap' }}>
                  {(rt.id === 'pool' ? ['Pvt pool', 'AC', 'Kitchenette'] :
                    rt.id === 'btub' ? ['Bathtub', 'AC', 'Balcony'] :
                    rt.id === 'lux' ? ['AC', 'Heater'] :
                    ['Fan', 'Bonfire']).map(a => (
                    <span key={a} style={{ fontSize: 10, color: T.ink3, padding: '2px 7px', borderRadius: 4, background: T.bgSoft, fontWeight: 600 }}>{a}</span>
                  ))}
                </div>
              </div>
              {selected && (
                <div style={{ width: 36, alignSelf: 'stretch', display: 'flex', alignItems: 'center', justifyContent: 'center', background: T.primary, color: '#fff' }}>
                  <Icon name="check" size={18} stroke={2.5} />
                </div>
              )}
            </div>
            {/* Per-room rate editor */}
            {selected && (
              <div style={{ padding: '10px 14px 12px', borderTop: `1px dashed ${T.border}`, background: T.bgSoft, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {data.roomItems.map((r, idx) => {
                  const rate = r.rate != null ? r.rate : rt.base;
                  const overridden = r.rate != null && r.rate !== rt.base;
                  return (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: T.ink2, minWidth: 52 }}>R{idx+1} · {r.adults}A{r.children>0?` ${r.children}C`:''}</div>
                      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 4, background: T.card, border: `1px solid ${overridden ? T.primary : T.border}`, borderRadius: 7, padding: '0 8px', height: 32 }}>
                        <span style={{ fontSize: 12, color: T.ink3, fontWeight: 600 }}>₹</span>
                        <input type="number" value={rate} onChange={(e) => set('roomItems', data.roomItems.map((x, i) => i === idx ? { ...x, rate: +e.target.value || 0 } : x))} className="tnum" style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 13, fontWeight: 700, color: overridden ? T.primary : T.ink, minWidth: 0 }} />
                        <span style={{ fontSize: 9, color: T.ink3 }}>/night</span>
                      </div>
                      <span className="tnum" style={{ fontSize: 11, fontWeight: 700, color: T.ink, minWidth: 64, textAlign: 'right' }}>₹{(rate * data.nights).toLocaleString('en-IN')}</span>
                    </div>
                  );
                })}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2, paddingTop: 8, borderTop: `1px dashed ${T.border}` }}>
                  <span style={{ fontSize: 11, color: T.ink2, fontWeight: 600 }}>Rooms subtotal</span>
                  <span className="tnum" style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>₹{(data.roomItems.reduce((s,x)=>s+(x.rate!=null?x.rate:rt.base),0) * data.nights).toLocaleString('en-IN')}</span>
                </div>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

function StepGuest({ data, set, t, plan, allExtras }) {
  const isForeign = data.country !== 'IN';
  const supportsGst = plan === 'gst';
  const [showAdd, setShowAdd] = React.useState(false);
  const [newEx, setNewEx] = React.useState({ label: '', price: '' });
  const [editingPriceId, setEditingPriceId] = React.useState(null);
  const addCustom = () => {
    if (!newEx.label.trim() || !newEx.price) return;
    const id = 'cx_' + Date.now();
    set('customExtras', [...data.customExtras, { id, label: newEx.label.trim(), sub: 'Custom', price: +newEx.price, icon: 'plus', custom: true }]);
    set('extras', { ...data.extras, [id]: 1 });
    setNewEx({ label: '', price: '' }); setShowAdd(false);
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Card padding={16}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.ink2, letterSpacing: 0.2 }}>LEAD GUEST</div>
          <button style={{ background: 'none', border: 'none', color: T.primary, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            <Icon name="search" size={11} /> Find existing
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Field label="Full name" value={data.name} onChange={(e) => set('name', e.target.value)} placeholder="As on ID (required)" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Field label="Country" value={data.country} onChange={(e) => set('country', e.target.value)} prefix="🇮🇳" />
            <Field label="Mobile" value={data.phone} onChange={(e) => set('phone', e.target.value)} prefix="+91" placeholder="98100 00000 (required)" />
          </div>
          <Field label="Email (optional)" value={data.email} onChange={(e) => set('email', e.target.value)} placeholder="guest@email.com" />
          {(!data.name.trim() || data.phone.trim().length < 6) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: T.warnLt, borderRadius: 8 }}>
              <Icon name="info" size={11} color="oklch(48% 0.14 75)" />
              <span style={{ fontSize: 11, color: 'oklch(40% 0.14 75)', fontWeight: 600 }}>Name and mobile are required to confirm a booking.</span>
            </div>
          )}
        </div>
      </Card>

      {/* Extras & Notes */}
      <Card padding={16}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.ink2, letterSpacing: 0.2 }}>{t('extras')}</div>
          <button onClick={() => setShowAdd(s => !s)} style={{ background: 'none', border: 'none', color: T.primary, fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Icon name={showAdd ? 'x' : 'plus'} size={11} stroke={2.2} /> {showAdd ? 'Cancel' : 'Add custom'}
          </button>
        </div>
        {showAdd && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 10, padding: 8, background: T.primaryLt, borderRadius: 8 }}>
            <input autoFocus placeholder="e.g. Bonfire dinner" value={newEx.label} onChange={e => setNewEx({ ...newEx, label: e.target.value })} style={{ flex: 1, border: `1px solid ${T.border}`, outline: 'none', borderRadius: 6, padding: '6px 8px', fontSize: 12, fontWeight: 600, background: T.card }} />
            <input type="number" placeholder="₹" value={newEx.price} onChange={e => setNewEx({ ...newEx, price: e.target.value })} className="tnum" style={{ width: 64, border: `1px solid ${T.border}`, outline: 'none', borderRadius: 6, padding: '6px 8px', fontSize: 12, fontWeight: 700, background: T.card }} />
            <button onClick={addCustom} style={{ border: 'none', background: T.primary, color: '#fff', borderRadius: 6, padding: '0 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Add</button>
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {allExtras.map(ex => {
            const qty = data.extras[ex.id] || 0;
            const isEditingPrice = editingPriceId === ex.id;
            return (
              <div key={ex.id} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: 10, borderRadius: 10,
                background: qty > 0 ? T.primaryLt : T.bgSoft,
                border: `1px solid ${qty > 0 ? T.primary : 'transparent'}`,
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: qty > 0 ? T.card : T.bgSunk, color: qty > 0 ? T.primary : T.ink3,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <Icon name={ex.icon} size={15} stroke={2} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>{ex.label}</div>
                  {!isEditingPrice ? (
                    <div className="tnum" style={{ fontSize: 11, color: T.ink3, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>{ex.sub} · ₹{ex.price.toLocaleString('en-IN')}</span>
                      <button onClick={() => setEditingPriceId(ex.id)} style={{ background: 'none', border: 'none', color: T.primary, cursor: 'pointer', padding: 0, display: 'inline-flex', alignItems: 'center' }}>
                        <Icon name="edit" size={10} stroke={2.2} />
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                      <span style={{ fontSize: 11, color: T.ink3, fontWeight: 600 }}>₹</span>
                      <input type="number" autoFocus value={ex.price} onChange={e => set('extraPrices', { ...data.extraPrices, [ex.id]: +e.target.value || 0 })} className="tnum" style={{ width: 60, border: `1px solid ${T.primary}`, outline: 'none', borderRadius: 5, padding: '2px 6px', fontSize: 11, fontWeight: 700, background: T.card, color: T.primary }} />
                      <button onClick={() => setEditingPriceId(null)} style={{ border: 'none', background: T.primary, color: '#fff', borderRadius: 5, padding: '3px 8px', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>OK</button>
                      {!ex.custom && data.extraPrices[ex.id] != null && (
                        <button onClick={() => { const { [ex.id]: _, ...rest } = data.extraPrices; set('extraPrices', rest); setEditingPriceId(null); }} style={{ border: 'none', background: 'none', color: T.ink3, fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>Reset</button>
                      )}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {qty > 0 && <button onClick={() => set('extras', { ...data.extras, [ex.id]: Math.max(0, qty - 1) })} style={miniStepBtn}>−</button>}
                  {qty > 0 && <span className="tnum" style={{ fontSize: 13, fontWeight: 700, minWidth: 16, textAlign: 'center', color: T.ink }}>{qty}</span>}
                  <button onClick={() => set('extras', { ...data.extras, [ex.id]: qty + 1 })} style={qty > 0 ? miniStepBtn : { ...miniStepBtn, background: T.primary, color: '#fff' }}>+</button>
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 14 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: T.ink2, letterSpacing: 0.1, display: 'block', marginBottom: 6 }}>{t('specialNote')}</label>
          <textarea
            value={data.notes}
            onChange={(e) => set('notes', e.target.value)}
            placeholder={t('notePlaceholder')}
            style={{
              width: '100%', minHeight: 64, padding: 12,
              background: T.bgSunk, border: `1px solid ${T.borderSoft}`, borderRadius: 10,
              fontSize: 14, fontWeight: 500, color: T.ink, resize: 'vertical', outline: 'none',
              fontFamily: 'inherit',
            }}
          />
          {data.notes && (
            <div style={{ marginTop: 6, padding: '6px 10px', background: '#F0FDF4', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon name="wa" size={11} color="#25D366" />
              <span style={{ fontSize: 10, color: T.ink2, fontWeight: 600 }}>This note will appear on the booking voucher and folio.</span>
            </div>
          )}
        </div>
      </Card>

      {/* WhatsApp */}
      <Card padding={14} style={{ background: '#F0FDF4', borderColor: '#BBF7D0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: '#25D366', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon name="wa" size={18} stroke={2} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>Send WhatsApp confirmation</div>
            <div style={{ fontSize: 11, color: T.ink3, marginTop: 2 }}>Auto-template + payment link</div>
          </div>
          <Toggle on={true} onChange={() => {}} />
        </div>
      </Card>

      {/* ID */}
      <Card padding={16}>
        <div style={{ fontSize: 12, fontWeight: 700, color: T.ink2, letterSpacing: 0.2, marginBottom: 12 }}>
          ID PROOF {isForeign && <Chip color="indigo" style={{ marginLeft: 6 }}>Form C required</Chip>}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <IDOption icon="qr" label="Aadhaar" sub="OCR + e-KYC" selected />
          <IDOption icon="flag" label="Passport" sub="Form C auto" />
          <IDOption icon="info" label="Other" sub="DL / Voter" />
        </div>
      </Card>

      {/* GST */}
      {supportsGst && (
        <Card padding={16}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.ink2, letterSpacing: 0.2 }}>BUSINESS GSTIN (OPTIONAL)</div>
            <Toggle on={!!data.gstin} onChange={(v) => set('gstin', v ? '27AABCU' : '')} />
          </div>
          {data.gstin && <Field label="" value={data.gstin} onChange={(e) => set('gstin', e.target.value)} placeholder="29ABCDE1234F1Z5" />}
        </Card>
      )}
    </div>
  );
}

const miniStepBtn = {
  width: 28, height: 28, borderRadius: 14, border: `1px solid ${T.border}`,
  background: T.card, color: T.ink, fontSize: 15, fontWeight: 700, cursor: 'pointer', lineHeight: 1,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
};

const IDOption = ({ icon, label, sub, selected }) => (
  <button style={{
    flex: 1, padding: '12px 8px', borderRadius: 10,
    border: selected ? `1.5px solid ${T.primary}` : `1px solid ${T.border}`,
    background: selected ? T.primaryLt : T.card,
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, cursor: 'pointer',
  }}>
    <Icon name={icon} size={20} color={selected ? T.primaryDk : T.ink2} />
    <span style={{ fontSize: 12, fontWeight: 700, color: selected ? T.primaryDk : T.ink }}>{label}</span>
    <span style={{ fontSize: 9, color: T.ink3, fontWeight: 500 }}>{sub}</span>
  </button>
);

function StepPayment({ data, set, subtotal, gst, total, withTax, roomsSubtotal, extrasTotal, t }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Card padding={16}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.ink2, letterSpacing: 0.2 }}>SUMMARY</div>
          <Chip color={withTax ? 'indigo' : 'soft'} style={{ fontSize: 9 }}>{withTax ? 'GST Pro' : 'No GST'}</Chip>
        </div>
        <Row label={`Tariff · ${data.nights}N × ${data.roomItems.length} room${data.roomItems.length>1?'s':''}`} value={`₹${roomsSubtotal.toLocaleString('en-IN')}`} />
        {extrasTotal > 0 && <Row label={`Extras · ${Object.values(data.extras).reduce((a,b)=>a+b,0)} item(s)`} value={`₹${extrasTotal.toLocaleString('en-IN')}`} />}
        {withTax && <Row label="CGST 6%" value={`₹${(gst/2).toLocaleString('en-IN')}`} />}
        {withTax && <Row label="SGST 6%" value={`₹${(gst/2).toLocaleString('en-IN')}`} />}
        <div style={{ height: 1, background: T.borderSoft, margin: '8px 0' }} />
        <Row label={t('total')} value={`₹${total.toLocaleString('en-IN')}`} bold />
      </Card>

      <Card padding={16}>
        <div style={{ fontSize: 12, fontWeight: 700, color: T.ink2, letterSpacing: 0.2, marginBottom: 12 }}>COLLECT NOW</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 6, marginBottom: 12 }}>
          {[
            { id: 'full',   label: 'Full',   sub: `₹${total.toLocaleString('en-IN')}` },
            { id: 'half',   label: '50%',    sub: `₹${Math.round(total/2).toLocaleString('en-IN')}` },
            { id: 'custom', label: 'Custom', sub: data.payCustom > 0 ? `₹${(+data.payCustom).toLocaleString('en-IN')}` : 'Enter ₹' },
            { id: 'none',   label: 'None',   sub: 'Pay later' },
          ].map(o => (
            <button key={o.id} onClick={() => set('payAmount', o.id)} style={{
              padding: '10px 4px', borderRadius: 10,
              border: data.payAmount === o.id ? `1.5px solid ${T.primary}` : `1px solid ${T.border}`,
              background: data.payAmount === o.id ? T.primaryLt : T.card,
              cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 2,
            }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: data.payAmount === o.id ? T.primaryDk : T.ink }}>{o.label}</span>
              <span className="tnum" style={{ fontSize: 9, color: T.ink3, fontWeight: 600 }}>{o.sub}</span>
            </button>
          ))}
        </div>
        {data.payAmount === 'custom' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, padding: 10, background: T.primaryLt, borderRadius: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: T.primaryDk }}>Custom amount</span>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 4, background: T.card, border: `1.5px solid ${T.primary}`, borderRadius: 7, padding: '0 10px', height: 36 }}>
              <span style={{ fontSize: 13, color: T.ink3, fontWeight: 600 }}>₹</span>
              <input type="number" autoFocus value={data.payCustom || ''} onChange={e => set('payCustom', +e.target.value || 0)} placeholder="0" className="tnum" style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 15, fontWeight: 700, color: T.ink }} />
              <span style={{ fontSize: 10, color: T.ink3 }}>of ₹{total.toLocaleString('en-IN')}</span>
            </div>
          </div>
        )}

        {data.payAmount && data.payAmount !== 'none' && (
          <>
            <div style={{ fontSize: 11, color: T.ink3, fontWeight: 600, marginBottom: 8 }}>METHOD</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <PayMethod icon="qr" label="UPI / QR" sub="Razorpay" selected={data.payMethod === 'upi'} onClick={() => set('payMethod', 'upi')} />
              <PayMethod icon="wa" label="WhatsApp link" sub="Send to guest" selected={data.payMethod === 'wa'} onClick={() => set('payMethod', 'wa')} />
              <PayMethod icon="inr" label="Cash" sub="At reception" selected={data.payMethod === 'cash'} onClick={() => set('payMethod', 'cash')} />
              <PayMethod icon="tag" label="Card" sub="Razorpay POS" selected={data.payMethod === 'card'} onClick={() => set('payMethod', 'card')} />
            </div>
          </>
        )}
      </Card>

      {data.payMethod === 'upi' && (
        <Card padding={20} style={{ background: T.indigoLt, borderColor: T.indigo, alignItems: 'center', textAlign: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 140, height: 140, background: '#fff', borderRadius: 14, padding: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <FakeQR />
            </div>
            <div className="tnum" style={{ fontSize: 11, color: T.ink2, fontWeight: 600 }}>yatradesert@razorpay</div>
            <div style={{ fontSize: 11, color: T.ink3 }}>Show QR to guest · auto-detects payment</div>
          </div>
        </Card>
      )}
    </div>
  );
}

const Row = ({ label, value, bold }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
    <span style={{ fontSize: bold ? 14 : 13, color: bold ? T.ink : T.ink2, fontWeight: bold ? 700 : 500 }}>{label}</span>
    <span className="tnum" style={{ fontSize: bold ? 16 : 13, color: T.ink, fontWeight: bold ? 700 : 600, letterSpacing: bold ? -0.2 : 0 }}>{value}</span>
  </div>
);

const PayMethod = ({ icon, label, sub, selected, onClick }) => (
  <button onClick={onClick} className="atithi-tap" style={{
    padding: '12px', borderRadius: 10,
    border: selected ? `1.5px solid ${T.primary}` : `1px solid ${T.border}`,
    background: selected ? T.primaryLt : T.card,
    display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', textAlign: 'left',
  }}>
    <Icon name={icon} size={18} color={selected ? T.primaryDk : T.ink2} />
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: selected ? T.primaryDk : T.ink }}>{label}</div>
      <div style={{ fontSize: 9, color: T.ink3, fontWeight: 500 }}>{sub}</div>
    </div>
  </button>
);

const FakeQR = () => {
  const cells = [];
  for (let y = 0; y < 13; y++) for (let x = 0; x < 13; x++) {
    if ((x < 3 && y < 3) || (x > 9 && y < 3) || (x < 3 && y > 9)) continue;
    cells.push(((x * 7 + y * 13) ^ 73) % 3 < 2 ? <rect key={`${x}-${y}`} x={x*8} y={y*8} width="7" height="7" fill="#1a1a1a"/> : null);
  }
  return (
    <svg width="110" height="110" viewBox="0 0 104 104">
      {[[0,0],[80,0],[0,80]].map(([x,y]) => (
        <g key={`${x}-${y}`}>
          <rect x={x} y={y} width="22" height="22" fill="#1a1a1a"/>
          <rect x={x+3} y={y+3} width="16" height="16" fill="#fff"/>
          <rect x={x+6} y={y+6} width="10" height="10" fill="#1a1a1a"/>
        </g>
      ))}
      {cells}
    </svg>
  );
};

// ─────────────────────────────────────────────────────────────
// BOOKING CONFIRMED
// ─────────────────────────────────────────────────────────────
function BookingConfirmed({ go, t }) {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: T.bg, alignItems: 'center', justifyContent: 'center', padding: 20, textAlign: 'center' }}>
      <div style={{ width: 80, height: 80, borderRadius: '50%', background: T.okLt, color: T.ok, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
        <Icon name="check" size={48} stroke={3} />
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: T.ink }}>Booking confirmed</div>
      <div style={{ fontSize: 14, color: T.ink3, marginTop: 6, maxWidth: 280 }}>WhatsApp voucher sent to guest. Razorpay link is active.</div>
      <Btn icon="home" onClick={() => go('home')} style={{ marginTop: 24 }}>Back to home</Btn>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// PAYMENT SHEET — add payment / refund / credit note
// ─────────────────────────────────────────────────────────────
const METHOD_LABELS = { cash: 'Cash', card: 'Card', upi: 'UPI', account: 'Bank a/c', other: 'Other' };
const METHOD_OPTIONS = [
  { id: 'cash',    label: 'Cash',     icon: 'inr',   hint: 'Counter / hand-collected' },
  { id: 'card',    label: 'Card',     icon: 'card',  hint: 'POS / swipe / online' },
  { id: 'upi',     label: 'UPI',      icon: 'qr',    hint: 'GPay / PhonePe / Paytm' },
  { id: 'account', label: 'Bank a/c', icon: 'bank',  hint: 'NEFT / IMPS / cheque' },
  { id: 'other',   label: 'Other',    icon: 'plus',  hint: 'Voucher / barter / agent' },
];

function PaymentSheet({ kind, balance, total, onClose, onSave }) {
  const isRefund = kind === 'refund';
  const isCredit = kind === 'credit';
  const defaultAmt = isRefund || isCredit ? (balance < 0 ? Math.abs(balance) : '') : (balance > 0 ? balance : '');
  const [amount, setAmount] = React.useState(defaultAmt);
  const [method, setMethod] = React.useState(isCredit ? 'account' : 'cash');
  const [note, setNote] = React.useState('');
  const [ref, setRef] = React.useState('');

  const title = isRefund ? 'Record refund' : isCredit ? 'Issue credit note' : 'Record payment';
  const cta = isRefund ? 'Save refund' : isCredit ? 'Issue credit' : 'Save payment';
  const tone = isRefund ? T.danger : isCredit ? T.indigo : T.primary;

  const placeholderForMethod = {
    cash: 'Where collected · who took it · receipt #',
    card: 'Last 4 / terminal / approval code',
    upi: 'UPI app · txn ID / UTR',
    account: 'Bank · UTR / cheque #',
    other: 'Source / agent / voucher #',
  };

  const save = () => {
    const amt = +amount;
    if (!amt || amt <= 0) return;
    const today = new Date();
    const dateStr = today.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) + ' · ' + today.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
    onSave({
      id: 'p_' + Date.now(),
      kind, method, amount: amt,
      note: [note, ref].filter(Boolean).join(' · '),
      date: dateStr,
    });
  };

  return (
    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 40, display: 'flex', alignItems: 'flex-end' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', background: T.card, borderRadius: '16px 16px 0 0', padding: 18, paddingBottom: 32, maxHeight: '90%', overflow: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: `color-mix(in oklch, ${tone} 14%, white)`, color: tone, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={isRefund ? 'arrow' : isCredit ? 'tag' : 'plus'} size={16} stroke={2.2} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: T.ink }}>{title}</div>
            <div className="tnum" style={{ fontSize: 11, color: T.ink3, marginTop: 1 }}>
              Total ₹{total.toLocaleString('en-IN')} · Balance {balance < 0 ? `−₹${Math.abs(balance).toLocaleString('en-IN')}` : `₹${balance.toLocaleString('en-IN')}`}
            </div>
          </div>
        </div>

        {/* Amount */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: T.ink3, letterSpacing: 0.4, marginBottom: 6 }}>AMOUNT</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px', background: T.bgSoft, border: `1.5px solid ${tone}`, borderRadius: 10 }}>
            <span style={{ fontSize: 18, color: T.ink3, fontWeight: 700 }}>₹</span>
            <input type="number" autoFocus value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" className="tnum" style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 24, fontWeight: 700, color: T.ink, minWidth: 0 }} />
            {balance > 0 && !isRefund && !isCredit && (
              <button onClick={() => setAmount(balance)} style={{ background: T.card, border: `1px solid ${T.border}`, color: T.primary, fontSize: 11, fontWeight: 700, borderRadius: 6, padding: '4px 8px', cursor: 'pointer' }}>Balance</button>
            )}
          </div>
          {!isRefund && !isCredit && +amount > balance && balance > 0 && (
            <div style={{ marginTop: 6, fontSize: 11, color: T.indigo, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
              <Icon name="info" size={11} /> ₹{(+amount - balance).toLocaleString('en-IN')} extra · will show as overpayment
            </div>
          )}
        </div>

        {/* Method */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: T.ink3, letterSpacing: 0.4, marginBottom: 6 }}>
            {isCredit ? 'CREDIT TYPE' : isRefund ? 'REFUND VIA' : 'COLLECTED VIA'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
            {METHOD_OPTIONS.map(m => (
              <button key={m.id} onClick={() => setMethod(m.id)} style={{
                border: `1.5px solid ${method === m.id ? tone : T.borderSoft}`,
                background: method === m.id ? `color-mix(in oklch, ${tone} 10%, white)` : T.card,
                borderRadius: 9, padding: '8px 4px', cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              }}>
                <Icon name={m.icon} size={14} color={method === m.id ? tone : T.ink3} stroke={2} />
                <span style={{ fontSize: 10, fontWeight: 700, color: method === m.id ? tone : T.ink2 }}>{m.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Detail / ref */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: T.ink3, letterSpacing: 0.4, marginBottom: 6 }}>DETAILS</div>
          <input value={ref} onChange={e => setRef(e.target.value)} placeholder={placeholderForMethod[method]} style={{ width: '100%', boxSizing: 'border-box', border: `1px solid ${T.border}`, background: T.card, borderRadius: 8, padding: '10px 12px', fontSize: 13, color: T.ink, outline: 'none', marginBottom: 6 }} />
          <textarea value={note} onChange={e => setNote(e.target.value)} placeholder={isCredit ? 'Reason · which future booking this credit is for' : isRefund ? 'Reason for refund' : 'Notes (optional)'} rows={2} style={{ width: '100%', boxSizing: 'border-box', border: `1px solid ${T.border}`, background: T.card, borderRadius: 8, padding: '10px 12px', fontSize: 13, color: T.ink, outline: 'none', resize: 'none', fontFamily: 'inherit' }} />
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <Btn variant="ghost" full onClick={onClose}>Cancel</Btn>
          <Btn full onClick={save} style={{ background: tone, borderColor: tone }}>{cta}</Btn>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// BOOKING DETAIL
// ─────────────────────────────────────────────────────────────
function BookingDetail({ go, bookingId, bookings, plan = 'engine', t, onEdit, onPayment }) {
  const b = bookings.find(x => x.id === bookingId) || bookings[0];
  const rt = ROOM_TYPES.find(r => r.id === b.roomTypeId);
  const ch = CHANNELS[b.channel];
  // Seed payments list from `paid` if not yet present
  const payments = b.payments || (b.paid > 0 ? [{ id: 'p1', kind: 'payment', method: b.channel === 'direct' ? 'upi' : 'card', amount: b.paid, note: b.channel === 'direct' ? 'Razorpay UPI · auto-captured' : `${ch.label} pre-payment`, date: '03 May · 18:25' }] : []);
  const totalPaid = payments.reduce((s, p) => s + (p.kind === 'refund' || p.kind === 'credit' ? -p.amount : p.amount), 0);
  const balance = b.total - totalPaid;
  const statusInfo = STATUS[b.status];
  const withTax = plan === 'gst';
  const [payOpen, setPayOpen] = React.useState(false);
  const [payKind, setPayKind] = React.useState('payment'); // payment | refund | credit
  const [waStatus, setWaStatus] = React.useState('sent');
  React.useEffect(() => {
    setWaStatus('sent');
    const t1 = setTimeout(() => setWaStatus('delivered'), 1400);
    const t2 = setTimeout(() => setWaStatus('read'), 3200);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [bookingId]);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: T.bg }}>
      <ScreenHeader title={b.id} subtitle={rt.name} onBack={() => go('diary')}
        right={
          <div style={{ display: 'inline-flex', gap: 6 }}>
            <button onClick={() => generateVoucher(b, rt)} className="atithi-tap" title="Download voucher PDF" style={{
              height: 36, width: 36, borderRadius: 10, border: `1px solid ${T.border}`,
              background: T.card, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: T.ink2,
            }}>
              <Icon name="download" size={14} stroke={2} />
            </button>
            <button onClick={() => onEdit(b.id)} className="atithi-tap" style={{
              height: 36, padding: '0 12px', borderRadius: 10, border: `1px solid ${T.border}`,
              background: T.card, display: 'inline-flex', alignItems: 'center', gap: 5,
              cursor: 'pointer', color: T.primary, fontSize: 12, fontWeight: 700,
            }}>
              <Icon name="edit" size={13} stroke={2} /> {t('edit')}
            </button>
          </div>
        }
      />
      <div style={{ flex: 1, overflow: 'auto', paddingBottom: 100 }}>
        <div style={{ padding: '14px 16px', background: statusInfo.bg, borderBottom: `1px solid ${T.borderSoft}`, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 8, height: 8, borderRadius: 4, background: statusInfo.color }} className={b.status === 'tentative' ? 'pulse' : ''} />
          <span style={{ fontSize: 13, fontWeight: 700, color: statusInfo.color }}>{statusInfo.label}</span>
          {b.status === 'tentative' && (
            <span className="tnum" style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: 'oklch(48% 0.14 75)' }}>releases at {b.releaseAt}</span>
          )}
        </div>

        <div style={{ padding: 16 }}>
          <Card padding={16}>
            <div style={{ display: 'flex', gap: 12 }}>
              <Avatar name={b.guest} size={52} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: T.ink }}>{b.guest}</span>
                  {b.vip && <Chip color="warn" icon="star">VIP</Chip>}
                </div>
                <div className="tnum" style={{ fontSize: 13, color: T.ink2, marginTop: 4 }}>{b.phone}</div>
                <div style={{ fontSize: 12, color: T.ink3, marginTop: 2 }}>{b.guests} · {b.formC ? 'Foreign · Form C filed' : 'Indian · Aadhaar verified'}</div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 14 }}>
              <Btn variant="wa" icon="wa" size="sm">WhatsApp</Btn>
              <Btn variant="soft" icon="phone" size="sm">Call</Btn>
              <Btn variant="soft" icon="mail" size="sm">Email</Btn>
            </div>
          </Card>
        </div>

        <div style={{ padding: '0 16px 16px' }}>
          <SectionHead title={t('stay')} />
          <Card>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 12 }}>
              <div>
                <div style={{ fontSize: 10, color: T.ink3, fontWeight: 700, letterSpacing: 0.4 }}>{t('checkIn').toUpperCase()}</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: T.ink }}>{4 + b.startIdx} May</div>
                <div style={{ fontSize: 11, color: T.ink3 }}>14:00</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 24, height: 1, background: T.border }} />
                <span className="tnum" style={{ fontSize: 11, fontWeight: 700, color: T.ink2 }}>{b.nights}N</span>
                <div style={{ width: 24, height: 1, background: T.border }} />
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 10, color: T.ink3, fontWeight: 700, letterSpacing: 0.4 }}>{t('checkOut').toUpperCase()}</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: T.ink }}>{4 + b.startIdx + b.nights} May</div>
                <div style={{ fontSize: 11, color: T.ink3 }}>11:00</div>
              </div>
            </div>
            <div style={{ height: 1, background: T.borderSoft, margin: '14px 0' }} />
            <Row label="Room" value={`${rt.name} · #${b.unitIdx + 1}`} />
            <Row label="Channel" value={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><span style={{ width: 6, height: 6, borderRadius: 3, background: ch.color }} /> {ch.label}</span>} />
            {b.notes && (
              <>
                <div style={{ height: 1, background: T.borderSoft, margin: '10px 0' }} />
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <Icon name="info" size={14} color={T.primary} />
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: T.ink2, letterSpacing: 0.2, marginBottom: 2 }}>SPECIAL NOTE</div>
                    <div style={{ fontSize: 12, color: T.ink, lineHeight: 1.4 }}>{b.notes}</div>
                  </div>
                </div>
              </>
            )}
          </Card>
        </div>

        <div style={{ padding: '0 16px 16px' }}>
          <SectionHead title={t('folio')} action={
            <span className="tnum" style={{ fontSize: 11, fontWeight: 700, color: balance > 0 ? T.danger : balance < 0 ? T.indigo : T.ok }}>
              {balance > 0 ? `Balance ₹${balance.toLocaleString('en-IN')}` : balance < 0 ? `Overpaid ₹${Math.abs(balance).toLocaleString('en-IN')}` : 'Settled'}
            </span>
          } />
          <Card>
            <Row label={`Tariff · ${b.nights} nights`} value={`₹${(withTax ? Math.round(b.total/1.12) : b.total).toLocaleString('en-IN')}`} />
            {withTax && <Row label="CGST 6%" value={`₹${Math.round((b.total - b.total/1.12)/2).toLocaleString('en-IN')}`} />}
            {withTax && <Row label="SGST 6%" value={`₹${Math.round((b.total - b.total/1.12)/2).toLocaleString('en-IN')}`} />}
            <div style={{ height: 1, background: T.borderSoft, margin: '8px 0' }} />
            <Row label="Total" value={`₹${b.total.toLocaleString('en-IN')}`} bold />
            <div style={{ height: 1, background: T.borderSoft, margin: '8px 0' }} />

            {/* Payments ledger */}
            <div style={{ fontSize: 10, fontWeight: 700, color: T.ink3, letterSpacing: 0.4, marginBottom: 6 }}>PAYMENTS LEDGER</div>
            {payments.length === 0 && <div style={{ fontSize: 12, color: T.ink3, padding: '6px 0' }}>No payments yet.</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {payments.map(p => {
                const isOut = p.kind === 'refund' || p.kind === 'credit';
                const tone = p.kind === 'refund' ? T.danger : p.kind === 'credit' ? T.indigo : T.ok;
                const methodLabel = METHOD_LABELS[p.method] || p.method;
                return (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 8px', background: T.bgSoft, borderRadius: 7, borderLeft: `3px solid ${tone}` }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: tone, textTransform: 'uppercase', letterSpacing: 0.2 }}>
                          {p.kind === 'refund' ? 'Refund' : p.kind === 'credit' ? 'Credit note' : methodLabel}
                        </span>
                        {p.kind !== 'payment' && <span style={{ fontSize: 10, color: T.ink3 }}>· {methodLabel}</span>}
                      </div>
                      {p.note && <div style={{ fontSize: 11, color: T.ink2, marginTop: 2, lineHeight: 1.35 }}>{p.note}</div>}
                      <div className="tnum" style={{ fontSize: 10, color: T.ink3, marginTop: 2 }}>{p.date}</div>
                    </div>
                    <span className="tnum" style={{ fontSize: 13, fontWeight: 700, color: tone }}>
                      {isOut ? '−' : '+'}₹{p.amount.toLocaleString('en-IN')}
                    </span>
                  </div>
                );
              })}
            </div>

            <div style={{ height: 1, background: T.borderSoft, margin: '10px 0 8px' }} />
            <Row label="Total paid" value={`₹${totalPaid.toLocaleString('en-IN')}`} />
            <Row label={balance < 0 ? 'Overpayment / due to guest' : 'Balance due'} value={
              <span style={{ color: balance > 0 ? T.danger : balance < 0 ? T.indigo : T.ok, fontWeight: 700 }} className="tnum">
                {balance < 0 ? `−₹${Math.abs(balance).toLocaleString('en-IN')}` : `₹${balance.toLocaleString('en-IN')}`}
              </span>
            } bold />

            <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
              <Btn variant="primary" icon="plus" size="sm" onClick={() => { setPayKind('payment'); setPayOpen(true); }}>Payment</Btn>
              <Btn variant="ghost" icon="arrow" size="sm" onClick={() => { setPayKind('refund'); setPayOpen(true); }}>Refund</Btn>
              <Btn variant="ghost" icon="tag" size="sm" onClick={() => { setPayKind('credit'); setPayOpen(true); }}>Credit note</Btn>
            </div>
            {balance > 0 && (
              <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                <Btn variant="wa" icon="wa" size="sm" style={{ flex: 1 }}>Send ₹{balance.toLocaleString('en-IN')} link</Btn>
              </div>
            )}
            {balance < 0 && (
              <div style={{ marginTop: 8, padding: '8px 10px', background: T.indigoLt || T.primaryLt, borderRadius: 7, fontSize: 11, color: T.indigo, fontWeight: 600, lineHeight: 1.4 }}>
                <Icon name="info" size={11} /> Guest has ₹{Math.abs(balance).toLocaleString('en-IN')} excess. Issue refund or convert to credit note for future bookings.
              </div>
            )}
          </Card>
        </div>

        {payOpen && (
          <PaymentSheet
            kind={payKind}
            balance={balance}
            total={b.total}
            onClose={() => setPayOpen(false)}
            onSave={(entry) => { onPayment && onPayment(b.id, entry); setPayOpen(false); }}
          />
        )}

        <div style={{ padding: '0 16px 16px' }}>
          <SectionHead title={t('activity')} />
          <Card padding={0}>
            {[
              { icon: 'wa', tone: '#25D366', text: waStatus === 'sent' ? 'WhatsApp confirmation · sending…' : waStatus === 'delivered' ? 'WhatsApp · delivered ✓✓' : 'WhatsApp · read ✓✓ by guest', time: 'just now', live: true },
              { icon: 'tag', tone: T.primary, text: `Booking received via ${ch.label}`, time: '03 May · 18:24' },
              { icon: 'inr', tone: T.indigo, text: `Razorpay · ₹${b.paid.toLocaleString('en-IN')} captured`, time: '03 May · 18:25' },
            ].map((a, i, arr) => (
              <div key={i} style={{ padding: '12px 14px', display: 'flex', gap: 10, borderBottom: i < arr.length - 1 ? `1px solid ${T.borderSoft}` : 'none' }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: `color-mix(in oklch, ${a.tone} 14%, white)`, color: a.tone, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon name={a.icon} size={14} stroke={2} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: T.ink, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {a.text}
                    {a.live && <span style={{ width: 6, height: 6, borderRadius: 3, background: '#25D366' }} className="pulse" />}
                  </div>
                  <div className="tnum" style={{ fontSize: 11, color: T.ink3, marginTop: 1 }}>{a.time}</div>
                </div>
              </div>
            ))}
          </Card>
        </div>
      </div>

      <div style={{ background: T.card, borderTop: `1px solid ${T.borderSoft}`, padding: '12px 16px 28px', display: 'flex', gap: 8 }}>
        {b.status === 'confirmed' && <Btn icon="door" full>Check in</Btn>}
        {b.status === 'checkedin' && <Btn icon="check" full>Check out</Btn>}
        {b.status === 'tentative' && (
          <>
            <Btn variant="ghost" icon="x" style={{ flex: 1 }}>Cancel</Btn>
            <Btn icon="check" style={{ flex: 1 }}>Confirm</Btn>
          </>
        )}
      </div>
    </div>
  );
}

Object.assign(window, { NewBooking, BookingDetail, BookingConfirmed, generateVoucher });

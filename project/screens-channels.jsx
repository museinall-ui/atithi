// screens-channels.jsx — Channel manager with date-range copy + per-OTA rate override

function Channels({ go, t }) {
  const [tick, setTick] = React.useState(0);
  const [copyOpen, setCopyOpen] = React.useState(false);
  const [copyTargets, setCopyTargets] = React.useState({ mmt: true, goibibo: true, booking: true, agoda: false });
  // mode: 'markup' (copy with markup) OR 'manual' (independent rate)
  const [otaConfig, setOtaConfig] = React.useState({
    mmt:     { mode: 'markup', markup: 12, manual: 5040 },
    goibibo: { mode: 'markup', markup: 12, manual: 5040 },
    booking: { mode: 'manual', markup: 18, manual: 5500 },
    agoda:   { mode: 'markup', markup: 15, manual: 5175 },
  });
  // date range presets
  const [rangePreset, setRangePreset] = React.useState('next30');
  const [customRange, setCustomRange] = React.useState({ from: '04 May', to: '03 Jun' });
  const [pushed, setPushed] = React.useState(null);

  React.useEffect(() => { const t = setInterval(() => setTick(x => x + 1), 1000); return () => clearInterval(t); }, []);

  const channels = [
    { id: 'mmt',     name: 'MakeMyTrip',  status: 'live',    baseSec: 4,  bookings: 23, fee: 18, color: '#EB2026' },
    { id: 'goibibo', name: 'Goibibo',     status: 'live',    baseSec: 11, bookings: 11, fee: 18, color: '#F0728F' },
    { id: 'booking', name: 'Booking.com', status: 'live',    baseSec: 2,  bookings: 17, fee: 15, color: '#003580' },
    { id: 'agoda',   name: 'Agoda',       status: 'paused',  baseSec: null, bookings: 0, fee: 17, color: '#5392FF' },
    { id: 'airbnb',  name: 'Airbnb',      status: 'connect', baseSec: null, bookings: 0, fee: 14, color: '#FF5A5F' },
    { id: 'expedia', name: 'Expedia',     status: 'connect', baseSec: null, bookings: 0, fee: 18, color: '#00355F' },
  ];
  const fmtAgo = (s) => s < 60 ? `${s}s ago` : `${Math.floor(s/60)}m ago`;

  const websiteRate = ROOM_TYPES[0].base;

  const RANGE_PRESETS = [
    { id: 'today',   label: 'Today',       days: 1 },
    { id: 'wknd',    label: 'This weekend', days: 3 },
    { id: 'next7',   label: 'Next 7 days', days: 7 },
    { id: 'next30',  label: 'Next 30 days',days: 30 },
    { id: 'next90',  label: 'Next 90 days',days: 90 },
    { id: 'custom',  label: 'Custom…',     days: null },
  ];
  const rangeDays = RANGE_PRESETS.find(r => r.id === rangePreset)?.days || 30;
  const rangeLabel = rangePreset === 'custom'
    ? `${customRange.from} → ${customRange.to}`
    : RANGE_PRESETS.find(r => r.id === rangePreset)?.label;

  const rateFor = (id) => {
    const cfg = otaConfig[id] || { mode: 'markup', markup: 0, manual: websiteRate };
    return cfg.mode === 'manual' ? cfg.manual : Math.round(websiteRate * (1 + cfg.markup/100));
  };
  const setCfg = (id, patch) => setOtaConfig(c => ({ ...c, [id]: { ...c[id], ...patch } }));

  const doPush = () => {
    const targets = Object.entries(copyTargets).filter(([_,v]) => v).map(([k]) => k);
    setPushed({ ts: Date.now(), channels: targets, range: rangeLabel, days: rangeDays });
    setCopyOpen(false);
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: T.bg }}>
      <ScreenHeader title={t('channelsTitle')} subtitle="6 channels · 51 OTA bookings this month" onBack={() => go('home')} />
      <div style={{ flex: 1, overflow: 'auto', padding: 14, paddingBottom: 100 }}>

        {/* Rate sync hero */}
        <Card padding={0} style={{ marginBottom: 14, overflow: 'hidden', borderColor: T.primary, borderWidth: 1.5 }}>
          <div style={{ padding: 14, background: `linear-gradient(135deg, ${T.primaryLt}, ${T.card})` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: T.primary, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name="sync" size={18} stroke={2.2} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>Sync rates to OTAs</div>
                <div style={{ fontSize: 10.5, color: T.ink3, marginTop: 1, lineHeight: 1.35 }}>Copy website rates with a markup, or set independent prices per channel.</div>
              </div>
            </div>

            {/* Date range selector */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: T.ink3, letterSpacing: 0.4, marginBottom: 6 }}>DATES TO PUSH</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {RANGE_PRESETS.map(rp => (
                  <button key={rp.id} onClick={() => setRangePreset(rp.id)} style={{
                    border: `1.5px solid ${rangePreset === rp.id ? T.primary : T.borderSoft}`,
                    background: rangePreset === rp.id ? T.primary : T.card,
                    color: rangePreset === rp.id ? '#fff' : T.ink2,
                    fontSize: 11, fontWeight: 700, padding: '5px 10px', borderRadius: 14, cursor: 'pointer',
                  }}>{rp.label}</button>
                ))}
              </div>
              {rangePreset === 'custom' && (
                <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 6 }}>
                  <input value={customRange.from} onChange={e => setCustomRange(r => ({ ...r, from: e.target.value }))} placeholder="From" style={{ border: `1px solid ${T.border}`, background: T.card, borderRadius: 7, padding: '6px 8px', fontSize: 12, fontWeight: 600, color: T.ink, outline: 'none' }} />
                  <span style={{ fontSize: 11, color: T.ink3 }}>→</span>
                  <input value={customRange.to} onChange={e => setCustomRange(r => ({ ...r, to: e.target.value }))} placeholder="To" style={{ border: `1px solid ${T.border}`, background: T.card, borderRadius: 7, padding: '6px 8px', fontSize: 12, fontWeight: 600, color: T.ink, outline: 'none' }} />
                </div>
              )}
              <div className="tnum" style={{ marginTop: 6, fontSize: 10.5, color: T.ink3, fontWeight: 600 }}>
                {rangeDays} night{rangeDays > 1 ? 's' : ''} · {rangeLabel}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 10, padding: '8px 10px', background: T.card, borderRadius: 8, border: `1px solid ${T.borderSoft}` }}>
              <span style={{ fontSize: 10, color: T.ink3, fontWeight: 600 }}>{t('websitePrice')}:</span>
              <span className="tnum" style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>₹{websiteRate.toLocaleString('en-IN')}</span>
              <span style={{ fontSize: 10, color: T.ink3 }}>{t('perNight')}</span>
              <span style={{ flex: 1 }} />
              <Icon name="arrow" size={12} color={T.ink3} />
            </div>
            <Btn full icon="sync" onClick={() => setCopyOpen(true)}>Push rates to OTAs</Btn>
            {pushed && (
              <div style={{ marginTop: 8, padding: '6px 10px', background: T.okLt, borderRadius: 6, fontSize: 10.5, color: T.ok, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon name="check" size={11} stroke={2.4} /> Pushed to {pushed.channels.length} channel(s) · {pushed.range} · just now
              </div>
            )}
          </div>

          {/* Per-OTA rate matrix with mode switch */}
          <div style={{ borderTop: `1px solid ${T.borderSoft}`, background: T.bgSoft }}>
            <div style={{ padding: '8px 14px', fontSize: 10, fontWeight: 700, color: T.ink3, letterSpacing: 0.4 }}>RATE PER CHANNEL · DELUXE TENT</div>
            {channels.filter(c => c.status !== 'connect').map((c, i) => {
              const cfg = otaConfig[c.id];
              const rate = rateFor(c.id);
              return (
                <div key={c.id} style={{
                  padding: '10px 14px',
                  borderTop: i > 0 ? `1px solid ${T.borderSoft}` : 'none',
                  background: T.card,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 22, height: 22, borderRadius: 6, background: c.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, flexShrink: 0 }}>{c.name[0]}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: T.ink }}>{c.name}</div>
                      <div style={{ fontSize: 10, color: T.ink3, fontWeight: 600, marginTop: 1 }}>
                        {cfg.mode === 'markup' ? `Website + ${cfg.markup}%` : 'Independent rate'}
                      </div>
                    </div>
                    <span className="tnum" style={{ fontSize: 13, fontWeight: 700, color: cfg.mode === 'manual' ? T.indigo : T.ink, minWidth: 56, textAlign: 'right' }}>₹{rate.toLocaleString('en-IN')}</span>
                  </div>
                  {/* Mode toggle */}
                  <div style={{ marginTop: 8, display: 'flex', gap: 4, padding: 2, background: T.bgSunk, borderRadius: 7 }}>
                    <button onClick={() => setCfg(c.id, { mode: 'markup' })} style={{
                      flex: 1, border: 'none', background: cfg.mode === 'markup' ? T.card : 'transparent',
                      boxShadow: cfg.mode === 'markup' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                      color: cfg.mode === 'markup' ? T.ink : T.ink3,
                      borderRadius: 5, padding: '5px 8px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                    }}>Copy + markup</button>
                    <button onClick={() => setCfg(c.id, { mode: 'manual' })} style={{
                      flex: 1, border: 'none', background: cfg.mode === 'manual' ? T.card : 'transparent',
                      boxShadow: cfg.mode === 'manual' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                      color: cfg.mode === 'manual' ? T.ink : T.ink3,
                      borderRadius: 5, padding: '5px 8px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                    }}>Set independent</button>
                  </div>
                  {cfg.mode === 'markup' ? (
                    <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 11, color: T.ink3, fontWeight: 600 }}>Markup</span>
                      <input type="range" min="0" max="40" step="2" value={cfg.markup} onChange={e => setCfg(c.id, { markup: +e.target.value })} style={{ flex: 1, accentColor: T.primary }} />
                      <span className="tnum" style={{ fontSize: 11, fontWeight: 700, color: T.ink2, minWidth: 36, textAlign: 'right' }}>+{cfg.markup}%</span>
                    </div>
                  ) : (
                    <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 11, color: T.ink3, fontWeight: 600 }}>Rate</span>
                      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 4, background: T.bgSoft, border: `1px solid ${T.border}`, borderRadius: 7, padding: '0 8px', height: 30 }}>
                        <span style={{ fontSize: 11, color: T.ink3 }}>₹</span>
                        <input type="number" value={cfg.manual} onChange={e => setCfg(c.id, { manual: +e.target.value || 0 })} className="tnum" style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 12, fontWeight: 700, color: T.indigo, minWidth: 0 }} />
                        <span style={{ fontSize: 9, color: T.ink3 }}>/night</span>
                      </div>
                      <span className="tnum" style={{ fontSize: 10, fontWeight: 600, color: cfg.manual > websiteRate ? T.ok : T.danger }}>
                        {cfg.manual > websiteRate ? '↑' : '↓'} ₹{Math.abs(cfg.manual - websiteRate).toLocaleString('en-IN')}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>

        <SectionHead title="Connected" />
        {channels.filter(c => c.status !== 'connect').map(c => (
          <Card key={c.id} style={{ marginBottom: 8 }} padding={12}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 9, background: c.color, color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                fontSize: 13, fontWeight: 700,
              }}>{c.name[0]}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>{c.name}</span>
                  {c.status === 'live' ? (
                    <Chip color="ok" style={{ fontSize: 9 }}>
                      <span style={{ width: 5, height: 5, borderRadius: 3, background: T.ok, marginRight: 3 }} className="pulse" /> {t('live')}
                    </Chip>
                  ) : (
                    <Chip color="warn" style={{ fontSize: 9 }}>{t('paused')}</Chip>
                  )}
                </div>
                <div className="tnum" style={{ fontSize: 10.5, color: T.ink3, marginTop: 2 }}>
                  {c.status === 'live' ? `${t('synced')} ${fmtAgo(c.baseSec + tick)}` : t('paused')} · {c.bookings} bookings · {c.fee}% {t('commission').toLowerCase()}
                </div>
              </div>
              <span className={c.status === 'live' ? 'spin' : ''} style={{ display: 'inline-flex', animationDuration: '4s' }}>
                <Icon name="sync" size={15} color={c.status === 'live' ? T.ok : T.ink3} />
              </span>
            </div>
          </Card>
        ))}

        <Card padding={0} style={{ marginTop: 14, overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', borderBottom: `1px solid ${T.borderSoft}`, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 7, height: 7, borderRadius: 4, background: T.ok }} className="pulse" />
            <span style={{ fontSize: 11, fontWeight: 700, color: T.ink, letterSpacing: 0.2 }}>LIVE · OTA stream</span>
            <span className="tnum" style={{ marginLeft: 'auto', fontSize: 10, color: T.ink3, fontWeight: 600 }}>{(60 + tick).toString().padStart(2,'0')} events today</span>
          </div>
          {[
            { ch: '#003580', txt: 'Booking.com · new reservation · BK-2855', sec: tick + 2 },
            { ch: '#EB2026', txt: 'MakeMyTrip · rate sync · +20% weekend pushed', sec: tick + 24 },
            { ch: '#F0728F', txt: 'Goibibo · cancellation · BK-2812 refunded', sec: tick + 87 },
          ].map((ev, i, arr) => (
            <div key={i} style={{
              padding: '9px 14px', display: 'flex', alignItems: 'center', gap: 10,
              borderBottom: i < arr.length - 1 ? `1px solid ${T.borderSoft}` : 'none',
            }}>
              <span style={{ width: 6, height: 6, borderRadius: 3, background: ev.ch, flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 11.5, color: T.ink2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.txt}</span>
              <span className="tnum" style={{ fontSize: 10, color: T.ink3, fontWeight: 600 }}>{fmtAgo(ev.sec)}</span>
            </div>
          ))}
        </Card>

        <SectionHead title="Connect more" style={{ marginTop: 16 }} />
        {channels.filter(c => c.status === 'connect').map(c => (
          <Card key={c.id} style={{ marginBottom: 8 }} padding={12}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 9, background: c.color, color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                fontSize: 13, fontWeight: 700,
              }}>{c.name[0]}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>{c.name}</div>
                <div className="tnum" style={{ fontSize: 10.5, color: T.ink3 }}>{c.fee}% {t('commission').toLowerCase()}</div>
              </div>
              <Btn size="sm" variant="ghost" icon="plug">{t('connect')}</Btn>
            </div>
          </Card>
        ))}
      </div>

      {/* Push confirm modal */}
      {copyOpen && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 30, display: 'flex', alignItems: 'flex-end' }} onClick={() => setCopyOpen(false)}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', background: T.card, borderRadius: '16px 16px 0 0', padding: 18, paddingBottom: 32, maxHeight: '85%', overflow: 'auto' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: T.ink, marginBottom: 4 }}>Push rates</div>
            <div style={{ fontSize: 11, color: T.ink3, marginBottom: 14 }}>{rangeLabel} · {rangeDays} night{rangeDays > 1 ? 's' : ''}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
              {channels.filter(c => c.status !== 'connect').map(c => {
                const cfg = otaConfig[c.id];
                return (
                  <label key={c.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                    border: `1.5px solid ${copyTargets[c.id] ? T.primary : T.borderSoft}`,
                    background: copyTargets[c.id] ? T.primaryLt : T.card,
                    borderRadius: 10, cursor: 'pointer',
                  }}>
                    <input type="checkbox" checked={!!copyTargets[c.id]} onChange={e => setCopyTargets(m => ({ ...m, [c.id]: e.target.checked }))} style={{ accentColor: T.primary, width: 16, height: 16 }} />
                    <div style={{ width: 22, height: 22, borderRadius: 5, background: c.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800 }}>{c.name[0]}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: T.ink }}>{c.name}</div>
                      <div style={{ fontSize: 10, color: T.ink3, fontWeight: 600 }}>{cfg.mode === 'manual' ? 'Independent' : `+${cfg.markup}% markup`}</div>
                    </div>
                    <span className="tnum" style={{ fontSize: 12, fontWeight: 700, color: T.ink2 }}>₹{rateFor(c.id).toLocaleString('en-IN')}</span>
                  </label>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn variant="ghost" full onClick={() => setCopyOpen(false)}>{t('cancel')}</Btn>
              <Btn full icon="sync" onClick={doPush}>Push now</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

Object.assign(window, { Channels });

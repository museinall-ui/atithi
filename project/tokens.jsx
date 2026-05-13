// tokens.jsx — Atithi design tokens, primitives, icons
// Warm, modern, India-flavored palette. All colors via oklch to keep harmony.

const T = {
  // surfaces
  bg:        'oklch(98% 0.008 75)',     // sandstone white
  bgSoft:    'oklch(96% 0.012 70)',     // panel
  bgSunk:    'oklch(94% 0.014 70)',     // input bg
  card:      '#ffffff',
  border:    'oklch(89% 0.012 70)',
  borderSoft:'oklch(93% 0.010 70)',

  // ink
  ink:       'oklch(22% 0.020 60)',
  ink2:      'oklch(38% 0.020 60)',
  ink3:      'oklch(55% 0.018 60)',
  ink4:      'oklch(70% 0.014 60)',

  // brand: terracotta (Rajasthani sandstone-pink)
  primary:   'oklch(60% 0.16 38)',
  primaryDk: 'oklch(50% 0.16 38)',
  primaryLt: 'oklch(94% 0.04 38)',

  // accents (same chroma+L family, different hue)
  indigo:    'oklch(48% 0.14 265)',
  indigoLt:  'oklch(94% 0.03 265)',
  teal:      'oklch(58% 0.10 195)',
  tealLt:    'oklch(94% 0.03 195)',

  // semantic
  ok:        'oklch(58% 0.13 155)',
  okLt:      'oklch(94% 0.04 155)',
  warn:      'oklch(72% 0.14 75)',
  warnLt:    'oklch(95% 0.04 75)',
  danger:    'oklch(58% 0.18 25)',
  dangerLt:  'oklch(95% 0.04 25)',

  // brand color tags for room types (calendar)
  tagSaffron:'oklch(75% 0.13 65)',
  tagOlive:  'oklch(70% 0.10 130)',
  tagSky:    'oklch(72% 0.09 230)',
  tagPlum:   'oklch(60% 0.11 320)',

  // type
  font: '"Geist", "Inter", -apple-system, system-ui, sans-serif',
  fontHi: '"Noto Sans Devanagari", "Geist", system-ui, sans-serif',
  mono: '"JetBrains Mono", "SF Mono", ui-monospace, monospace',

  // misc
  radius: 12,
  shadow: '0 1px 2px rgba(20,15,10,.04), 0 4px 16px rgba(20,15,10,.05)',
  shadowLg: '0 8px 28px rgba(20,15,10,.10), 0 2px 6px rgba(20,15,10,.05)',
};

// Inject base styles
if (typeof document !== 'undefined' && !document.getElementById('atithi-base')) {
  const s = document.createElement('style');
  s.id = 'atithi-base';
  s.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Noto+Sans+Devanagari:wght@500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
    .atithi *, .atithi *::before, .atithi *::after { box-sizing: border-box; }
    .atithi { font-family: ${T.font}; color: ${T.ink}; -webkit-font-smoothing: antialiased; }
    .atithi button { font-family: inherit; }
    .atithi input, .atithi textarea, .atithi select { font-family: inherit; color: inherit; }
    .atithi ::-webkit-scrollbar { width: 0; height: 0; }
    .hi { font-family: ${T.fontHi}; }
    .mono { font-family: ${T.mono}; font-feature-settings: 'tnum' 1; }
    .tnum { font-feature-settings: 'tnum' 1, 'cv11' 1; }
    @keyframes atithi-pulse { 0%,100% { opacity: 1 } 50% { opacity: .45 } }
    .pulse { animation: atithi-pulse 2s ease-in-out infinite; }
    @keyframes atithi-spin { to { transform: rotate(360deg) } }
    .spin { animation: atithi-spin 1s linear infinite; }
    .atithi-tap:active { transform: scale(.97); transition: transform .1s; }
  `;
  document.head.appendChild(s);
}

// ─────────────────────────────────────────────────────────────
// Icons — minimal stroke set (16px viewbox, currentColor)
// ─────────────────────────────────────────────────────────────
const Icon = ({ name, size = 18, color = 'currentColor', stroke = 1.6 }) => {
  const p = { fill: 'none', stroke: color, strokeWidth: stroke, strokeLinecap: 'round', strokeLinejoin: 'round' };
  const paths = {
    home:    <><path {...p} d="M3 8.5L10 3l7 5.5V17a1 1 0 01-1 1h-3v-5h-6v5H4a1 1 0 01-1-1V8.5z"/></>,
    cal:     <><rect {...p} x="3" y="4.5" width="14" height="13" rx="2"/><path {...p} d="M3 8h14M7 2v3M13 2v3"/></>,
    plus:    <><path {...p} d="M10 4v12M4 10h12"/></>,
    users:   <><circle {...p} cx="7" cy="7" r="3"/><path {...p} d="M2 17c.5-3 2.5-5 5-5s4.5 2 5 5"/><circle {...p} cx="14" cy="6" r="2.5"/><path {...p} d="M13 12c2 0 4 1.5 4.5 4"/></>,
    chart:   <><path {...p} d="M3 17h14M5 13l3-4 3 3 4-6"/></>,
    cog:     <><circle {...p} cx="10" cy="10" r="2.5"/><path {...p} d="M10 2v2M10 16v2M2 10h2M16 10h2M4.3 4.3l1.4 1.4M14.3 14.3l1.4 1.4M4.3 15.7l1.4-1.4M14.3 5.7l1.4-1.4"/></>,
    bed:     <><path {...p} d="M2 14V6M2 14h16M18 14v-3a2 2 0 00-2-2H8v5M2 9h2"/><circle {...p} cx="6" cy="9" r="1.5"/></>,
    tag:     <><path {...p} d="M2.5 2.5h6L17 11l-6 6L2.5 8.5v-6z"/><circle cx="6" cy="6" r="1.2" fill={color}/></>,
    plug:    <><path {...p} d="M14 6l3-3M6 14l-3 3M9 5l6 6-2.5 2.5a3 3 0 01-4.2 0L5 10.7a3 3 0 010-4.2L7.5 4z"/></>,
    arrow:   <><path {...p} d="M4 10h12M11 5l5 5-5 5"/></>,
    arrowL:  <><path {...p} d="M16 10H4M9 5l-5 5 5 5"/></>,
    chev:    <><path {...p} d="M7 5l5 5-5 5"/></>,
    chevD:   <><path {...p} d="M5 7l5 5 5-5"/></>,
    chevU:   <><path {...p} d="M5 13l5-5 5 5"/></>,
    search:  <><circle {...p} cx="9" cy="9" r="5"/><path {...p} d="M13 13l4 4"/></>,
    bell:    <><path {...p} d="M5 14V9a5 5 0 0110 0v5l1.5 2h-13L5 14zM8 17a2 2 0 004 0"/></>,
    check:   <><path {...p} d="M4 10l4 4 8-8"/></>,
    x:       <><path {...p} d="M5 5l10 10M15 5L5 15"/></>,
    phone:   <><path {...p} d="M5 3h2l2 5-2 1c1 2 3 4 5 5l1-2 5 2v2a2 2 0 01-2 2C9 18 2 11 2 5a2 2 0 012-2z"/></>,
    mail:    <><rect {...p} x="2" y="4" width="16" height="12" rx="2"/><path {...p} d="M2 6l8 5 8-5"/></>,
    wa:      <><path {...p} d="M3 17l1.2-3.8A7 7 0 1110 17a7 7 0 01-3.4-.9L3 17z"/><path {...p} d="M7.5 7.5c0 0 .5-.5 1-.5s1.2 1.5 1.2 2-.7 1-.7 1 .8 2 2.5 2.5c0 0 .5-.7 1-.7s2 .7 2 1.2-.5 1-.5 1c-2.5.5-5.5-2.5-6-5z" strokeWidth="1.2"/></>,
    upi:     <><path {...p} d="M7 3l-3 7h4l-2 7 8-10h-5l3-4z"/></>,
    qr:      <><rect {...p} x="3" y="3" width="6" height="6"/><rect {...p} x="11" y="3" width="6" height="6"/><rect {...p} x="3" y="11" width="6" height="6"/><path {...p} d="M11 11h2v2M15 11v2M11 15h2v2M15 15v2"/></>,
    inr:     <><path {...p} d="M5 4h10M5 8h10M5 4c4 0 7 .5 7 4s-3 4-7 4l5 6"/></>,
    card:    <><rect {...p} x="2.5" y="5" width="15" height="10" rx="1.5"/><path {...p} d="M2.5 8.5h15M5.5 12.5h3"/></>,
    bank:    <><path {...p} d="M3 8l7-4 7 4M4 8v6M10 8v6M16 8v6M3 15h14M3 17h14"/></>,
    clock:   <><circle {...p} cx="10" cy="10" r="7"/><path {...p} d="M10 6v4l3 2"/></>,
    lock:    <><rect {...p} x="4" y="9" width="12" height="9" rx="2"/><path {...p} d="M7 9V6a3 3 0 016 0v3"/></>,
    door:    <><path {...p} d="M5 17V4h7v13M5 17h10M5 4l7-2v15M11 11h.5"/></>,
    moon:    <><path {...p} d="M14 11A6 6 0 016 3a7 7 0 108 8z"/></>,
    sun:     <><circle {...p} cx="10" cy="10" r="3.5"/><path {...p} d="M10 3v1.5M10 15.5V17M3 10h1.5M15.5 10H17M5 5l1 1M14 14l1 1M5 15l1-1M14 6l1-1"/></>,
    star:    <><path {...p} d="M10 3l2.2 4.5 5 .7-3.6 3.5.85 5L10 14.3l-4.45 2.4.85-5L2.8 8.2l5-.7L10 3z"/></>,
    filter:  <><path {...p} d="M3 5h14M6 10h8M9 15h2"/></>,
    more:    <><circle cx="5" cy="10" r="1.4" fill={color}/><circle cx="10" cy="10" r="1.4" fill={color}/><circle cx="15" cy="10" r="1.4" fill={color}/></>,
    sync:    <><path {...p} d="M4 10a6 6 0 0110-4M16 10a6 6 0 01-10 4M14 3v3.5h-3.5M6 17v-3.5h3.5"/></>,
    download:<><path {...p} d="M10 3v10M5 9l5 5 5-5M3 17h14"/></>,
    eye:     <><path {...p} d="M2 10s3-6 8-6 8 6 8 6-3 6-8 6-8-6-8-6z"/><circle {...p} cx="10" cy="10" r="2.5"/></>,
    edit:    <><path {...p} d="M14 3l3 3-9 9-4 1 1-4 9-9z"/></>,
    trash:   <><path {...p} d="M4 6h12M8 6V4h4v2M6 6v11a1 1 0 001 1h6a1 1 0 001-1V6"/></>,
    flag:    <><path {...p} d="M4 17V3M4 4h11l-2 4 2 4H4"/></>,
    map:     <><path {...p} d="M2 5l5-2 6 2 5-2v12l-5 2-6-2-5 2V5zM7 3v12M13 5v12"/></>,
    block:   <><circle {...p} cx="10" cy="10" r="7"/><path {...p} d="M5 5l10 10"/></>,
    info:    <><circle {...p} cx="10" cy="10" r="7"/><path {...p} d="M10 9v5M10 6.5v.5"/></>,
    veg:     <><rect {...p} x="3" y="3" width="14" height="14" rx="1.5"/><circle cx="10" cy="10" r="3" fill={color}/></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" style={{ display: 'block', flexShrink: 0 }}>
      {paths[name] || null}
    </svg>
  );
};

// ─────────────────────────────────────────────────────────────
// Primitives
// ─────────────────────────────────────────────────────────────
const Btn = ({ children, variant = 'primary', size = 'md', icon, onClick, full, style }) => {
  const sizes = {
    sm: { h: 32, px: 12, fs: 13, gap: 6 },
    md: { h: 42, px: 16, fs: 14, gap: 8 },
    lg: { h: 50, px: 20, fs: 15, gap: 10 },
  }[size];
  const variants = {
    primary: { bg: T.primary, color: '#fff', border: 'transparent' },
    dark:    { bg: T.ink, color: '#fff', border: 'transparent' },
    ghost:   { bg: 'transparent', color: T.ink, border: T.border },
    soft:    { bg: T.bgSoft, color: T.ink, border: T.borderSoft },
    indigo:  { bg: T.indigo, color: '#fff', border: 'transparent' },
    danger:  { bg: T.danger, color: '#fff', border: 'transparent' },
    wa:      { bg: '#25D366', color: '#fff', border: 'transparent' },
  }[variant];
  return (
    <button onClick={onClick} className="atithi-tap" style={{
      height: sizes.h, padding: `0 ${sizes.px}px`, fontSize: sizes.fs, gap: sizes.gap,
      background: variants.bg, color: variants.color,
      border: `1px solid ${variants.border}`, borderRadius: 10,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 600, cursor: 'pointer', letterSpacing: -0.1,
      width: full ? '100%' : 'auto', ...style,
    }}>
      {icon && <Icon name={icon} size={sizes.fs + 2} />}
      {children}
    </button>
  );
};

const Chip = ({ children, color = 'soft', icon, style }) => {
  const map = {
    soft:    { bg: T.bgSoft, fg: T.ink2, br: T.borderSoft },
    primary: { bg: T.primaryLt, fg: T.primaryDk, br: 'transparent' },
    indigo:  { bg: T.indigoLt, fg: T.indigo, br: 'transparent' },
    teal:    { bg: T.tealLt, fg: T.teal, br: 'transparent' },
    ok:      { bg: T.okLt, fg: T.ok, br: 'transparent' },
    warn:    { bg: T.warnLt, fg: 'oklch(48% 0.14 75)', br: 'transparent' },
    danger:  { bg: T.dangerLt, fg: T.danger, br: 'transparent' },
  }[color];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 8px', borderRadius: 999, background: map.bg, color: map.fg,
      border: `1px solid ${map.br}`, fontSize: 11, fontWeight: 600,
      letterSpacing: 0.1, lineHeight: 1.4, whiteSpace: 'nowrap', ...style,
    }}>
      {icon && <Icon name={icon} size={11} stroke={2} />}
      {children}
    </span>
  );
};

const Field = ({ label, value, onChange, placeholder, type = 'text', suffix, prefix, style, hint, error }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, ...style }}>
    {label && <label style={{ fontSize: 12, fontWeight: 600, color: T.ink2, letterSpacing: 0.1 }}>{label}</label>}
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      background: T.bgSunk, border: `1px solid ${error ? T.danger : T.borderSoft}`,
      borderRadius: 10, padding: '0 12px', height: 44,
    }}>
      {prefix && <span style={{ fontSize: 13, color: T.ink3, fontWeight: 500 }}>{prefix}</span>}
      <input type={type} value={value} onChange={onChange} placeholder={placeholder} style={{
        flex: 1, border: 'none', outline: 'none', background: 'transparent',
        fontSize: 15, fontWeight: 500, color: T.ink, minWidth: 0,
      }} />
      {suffix && <span style={{ fontSize: 13, color: T.ink3, fontWeight: 500 }}>{suffix}</span>}
    </div>
    {hint && !error && <span style={{ fontSize: 11, color: T.ink3 }}>{hint}</span>}
    {error && <span style={{ fontSize: 11, color: T.danger, fontWeight: 500 }}>{error}</span>}
  </div>
);

const Avatar = ({ name, size = 32, color }) => {
  const initials = (name || '?').split(' ').slice(0, 2).map(s => s[0]).join('').toUpperCase();
  const hues = [38, 195, 265, 130, 320, 65, 230];
  const hue = color ? null : hues[(name || '').charCodeAt(0) % hues.length];
  const bg = color || `oklch(85% 0.06 ${hue})`;
  const fg = color || `oklch(35% 0.10 ${hue})`;
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: bg, color: fg, fontWeight: 700, fontSize: size * 0.38,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0, letterSpacing: -0.3,
    }}>{initials}</div>
  );
};

// Section header inside scrollable screens
const SectionHead = ({ title, action, style }) => (
  <div style={{
    display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
    padding: '0 4px', marginBottom: 10, ...style,
  }}>
    <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: T.ink2, letterSpacing: 0.4, textTransform: 'uppercase' }}>{title}</h3>
    {action}
  </div>
);

// Generic card
const Card = ({ children, style, padding = 16, onClick }) => (
  <div onClick={onClick} style={{
    background: T.card, border: `1px solid ${T.borderSoft}`,
    borderRadius: T.radius, padding, ...style,
  }}>{children}</div>
);

// Tab bar (bottom nav for iPhone)
const TabBar = ({ active, onChange }) => {
  const tabs = [
    { id: 'home', icon: 'home', label: 'Home' },
    { id: 'diary', icon: 'cal', label: 'Diary' },
    { id: 'new', icon: 'plus', label: '' },     // FAB
    { id: 'guests', icon: 'users', label: 'Guests' },
    { id: 'more', icon: 'cog', label: 'More' },
  ];
  return (
    <div style={{
      position: 'absolute', bottom: 0, left: 0, right: 0,
      background: 'rgba(255,255,255,0.92)',
      backdropFilter: 'blur(20px) saturate(180%)',
      WebkitBackdropFilter: 'blur(20px) saturate(180%)',
      borderTop: `1px solid ${T.borderSoft}`,
      paddingBottom: 24, paddingTop: 8,
      display: 'flex', justifyContent: 'space-around', alignItems: 'center',
      zIndex: 30,
    }}>
      {tabs.map(t => {
        const isFab = t.id === 'new';
        const isActive = active === t.id;
        if (isFab) {
          return (
            <button key={t.id} onClick={() => onChange(t.id)} style={{
              width: 52, height: 52, borderRadius: '50%',
              background: T.primary, color: '#fff', border: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 6px 16px rgba(196, 95, 50, .35)', cursor: 'pointer',
              marginTop: -16,
            }}>
              <Icon name="plus" size={24} stroke={2.5} />
            </button>
          );
        }
        return (
          <button key={t.id} onClick={() => onChange(t.id)} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
            color: isActive ? T.primary : T.ink3, padding: '4px 12px',
          }}>
            <Icon name={t.icon} size={22} stroke={isActive ? 2 : 1.6} />
            <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.1 }}>{t.label}</span>
          </button>
        );
      })}
    </div>
  );
};

// Screen header for sub-screens
const ScreenHeader = ({ title, subtitle, onBack, right, sticky = true }) => (
  <div style={{
    position: sticky ? 'sticky' : 'static', top: 0, zIndex: 10,
    background: 'rgba(252, 250, 247, 0.92)',
    backdropFilter: 'blur(20px) saturate(180%)',
    WebkitBackdropFilter: 'blur(20px) saturate(180%)',
    borderBottom: `1px solid ${T.borderSoft}`,
    padding: '14px 16px 12px',
    display: 'flex', alignItems: 'center', gap: 10,
  }}>
    {onBack && (
      <button onClick={onBack} style={{
        width: 36, height: 36, borderRadius: 10, border: 'none',
        background: T.bgSoft, display: 'flex', alignItems: 'center',
        justifyContent: 'center', cursor: 'pointer', color: T.ink,
      }}>
        <Icon name="arrowL" size={18} />
      </button>
    )}
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 17, fontWeight: 700, color: T.ink, letterSpacing: -0.2, lineHeight: 1.15 }}>{title}</div>
      {subtitle && <div style={{ fontSize: 12, color: T.ink3, marginTop: 1 }}>{subtitle}</div>}
    </div>
    {right}
  </div>
);

Object.assign(window, { T, Icon, Btn, Chip, Field, Avatar, SectionHead, Card, TabBar, ScreenHeader });

export const T = {
  bg:        'oklch(98% 0.008 75)',
  bgSoft:    'oklch(96% 0.012 70)',
  bgSunk:    'oklch(94% 0.014 70)',
  card:      '#ffffff',
  border:    'oklch(89% 0.012 70)',
  borderSoft:'oklch(93% 0.010 70)',

  ink:       'oklch(22% 0.020 60)',
  ink2:      'oklch(38% 0.020 60)',
  ink3:      'oklch(55% 0.018 60)',
  ink4:      'oklch(70% 0.014 60)',

  // Brand colours read CSS variables so a hotelier can pick their own theme
  // in Settings (see applyTheme below). Fallbacks are the default Atithi orange.
  primary:   'var(--atithi-primary, oklch(60% 0.16 38))',
  primaryDk: 'var(--atithi-primary-dk, oklch(50% 0.16 38))',
  primaryLt: 'var(--atithi-primary-lt, oklch(94% 0.04 38))',

  indigo:    'oklch(48% 0.14 265)',
  indigoLt:  'oklch(94% 0.03 265)',
  teal:      'oklch(58% 0.10 195)',
  tealLt:    'oklch(94% 0.03 195)',

  ok:        'oklch(58% 0.13 155)',
  okLt:      'oklch(94% 0.04 155)',
  warn:      'oklch(72% 0.14 75)',
  warnLt:    'oklch(95% 0.04 75)',
  danger:    'oklch(58% 0.18 25)',
  dangerLt:  'oklch(95% 0.04 25)',

  tagSaffron:'oklch(75% 0.13 65)',
  tagOlive:  'oklch(70% 0.10 130)',
  tagSky:    'oklch(72% 0.09 230)',
  tagPlum:   'oklch(60% 0.11 320)',

  font: '"Geist", "Inter", -apple-system, system-ui, sans-serif',
  fontHi: '"Noto Sans Devanagari", "Geist", system-ui, sans-serif',
  mono: '"JetBrains Mono", "SF Mono", ui-monospace, monospace',

  radius: 12,
  shadow: '0 1px 2px rgba(20,15,10,.04), 0 4px 16px rgba(20,15,10,.05)',
  shadowLg: '0 8px 28px rgba(20,15,10,.10), 0 2px 6px rgba(20,15,10,.05)',
};

// Hotelier-pickable brand palette. Each entry is a hue angle (oklch) plus a
// human-friendly name and a representative swatch for the picker. Saturation
// and lightness are derived in `themeColorsFromHue` so every theme stays
// coherent with the rest of the UI tokens.
export const THEME_PRESETS = [
  { id: 'orange',   hue: 38,  label: 'Sunset',    swatch: 'oklch(60% 0.16 38)'  }, // default Atithi
  { id: 'red',      hue: 25,  label: 'Heritage',  swatch: 'oklch(55% 0.18 25)'  },
  { id: 'saffron',  hue: 75,  label: 'Saffron',   swatch: 'oklch(65% 0.14 75)'  },
  { id: 'green',    hue: 155, label: 'Forest',    swatch: 'oklch(52% 0.13 155)' },
  { id: 'teal',     hue: 195, label: 'Lagoon',    swatch: 'oklch(58% 0.12 195)' },
  { id: 'blue',     hue: 260, label: 'Royal',     swatch: 'oklch(50% 0.16 260)' },
  { id: 'plum',     hue: 320, label: 'Plum',      swatch: 'oklch(52% 0.16 320)' },
];

export function themeColorsFromHue(hue) {
  const h = (hue == null || isNaN(hue)) ? 38 : hue;
  return {
    primary:   `oklch(60% 0.16 ${h})`,
    primaryDk: `oklch(50% 0.16 ${h})`,
    primaryLt: `oklch(94% 0.04 ${h})`,
    hue: h,
  };
}

// Derive the three brand-colour tokens (primary, dark, light) from a theme
// object. Theme can be either a preset (`{ hue: number }`) or a custom hex
// colour (`{ color: '#aabbcc' }`). When a custom hex is provided, dark/light
// shades are derived via CSS color-mix so they stay coherent with whatever
// the hotelier picked.
export function themeColors(theme) {
  if (theme && typeof theme.color === 'string' && /^#[0-9a-f]{3,8}$/i.test(theme.color)) {
    const hex = theme.color;
    return {
      primary:   hex,
      primaryDk: `color-mix(in oklch, ${hex} 80%, black)`,
      primaryLt: `color-mix(in oklch, ${hex} 14%, white)`,
      color: hex,
    };
  }
  return themeColorsFromHue(theme?.hue);
}

export function applyTheme(theme) {
  if (typeof document === 'undefined') return;
  // Back-compat: accept a raw hue number too, so older callers keep working.
  const t = (typeof theme === 'number') ? { hue: theme } : theme;
  const c = themeColors(t);
  const root = document.documentElement;
  root.style.setProperty('--atithi-primary', c.primary);
  root.style.setProperty('--atithi-primary-dk', c.primaryDk);
  root.style.setProperty('--atithi-primary-lt', c.primaryLt);
  // Sync the browser chrome (mobile URL bar / status bar tint) to the brand
  // colour so the app feels native edge-to-edge on phones.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', c.primary);
}

export function injectBaseStyles() {
  if (document.getElementById('atithi-base')) return;
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
    /* Date pickers — the actual <input type="date"> is what opens the
       native picker reliably on every browser (transparent / opacity:0
       inputs don't work on some mobile browsers). We render the input
       full-size, hide its text + native icon, and overlay a custom
       label + icon on top via pointer-events:none. */
    .atithi input[type="date"] {
      -webkit-appearance: none;
      -moz-appearance: none;
      appearance: none;
      color: transparent;
      caret-color: transparent;
    }
    .atithi input[type="date"]::-webkit-calendar-picker-indicator {
      opacity: 0;
      cursor: pointer;
      width: 100%;
      height: 100%;
      position: absolute;
      left: 0; top: 0;
      padding: 0;
    }
    .atithi input[type="date"]::-webkit-inner-spin-button,
    .atithi input[type="date"]::-webkit-clear-button { display: none; }
    .atithi input[type="date"]::-webkit-datetime-edit { color: transparent; }
  `;
  document.head.appendChild(s);
}

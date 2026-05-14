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

  primary:   'oklch(60% 0.16 38)',
  primaryDk: 'oklch(50% 0.16 38)',
  primaryLt: 'oklch(94% 0.04 38)',

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
  `;
  document.head.appendChild(s);
}

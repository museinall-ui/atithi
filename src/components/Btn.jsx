import { T } from '../tokens.js';
import Icon from './Icon.jsx';

export default function Btn({ children, variant = 'primary', size = 'md', icon, onClick, full, style, disabled }) {
  const sizes = {
    sm: { h: 32, px: 12, fs: 13, gap: 6 },
    md: { h: 42, px: 16, fs: 14, gap: 8 },
    lg: { h: 50, px: 20, fs: 15, gap: 10 },
  }[size];
  const variants = {
    primary: { bg: T.primary, color: '#fff', border: 'transparent' },
    dark:    { bg: T.ink,     color: '#fff', border: 'transparent' },
    ghost:   { bg: 'transparent', color: T.ink, border: T.border },
    soft:    { bg: T.bgSoft,  color: T.ink, border: T.borderSoft },
    indigo:  { bg: T.indigo,  color: '#fff', border: 'transparent' },
    danger:  { bg: T.danger,  color: '#fff', border: 'transparent' },
    wa:      { bg: '#25D366', color: '#fff', border: 'transparent' },
  }[variant];
  return (
    <button onClick={onClick} disabled={disabled} className="atithi-tap" style={{
      height: sizes.h, padding: `0 ${sizes.px}px`, fontSize: sizes.fs, gap: sizes.gap,
      background: variants.bg, color: variants.color,
      border: `1px solid ${variants.border}`, borderRadius: 10,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 600, cursor: disabled ? 'default' : 'pointer', letterSpacing: -0.1,
      width: full ? '100%' : 'auto', opacity: disabled ? 0.4 : 1, ...style,
    }}>
      {icon && <Icon name={icon} size={sizes.fs + 2} />}
      {children}
    </button>
  );
}

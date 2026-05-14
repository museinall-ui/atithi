import { T } from '../tokens.js';
import Icon from './Icon.jsx';

export default function Chip({ children, color = 'soft', icon, style }) {
  const map = {
    soft:    { bg: T.bgSoft, fg: T.ink2, br: T.borderSoft },
    primary: { bg: T.primaryLt, fg: T.primaryDk, br: 'transparent' },
    indigo:  { bg: T.indigoLt, fg: T.indigo, br: 'transparent' },
    teal:    { bg: T.tealLt, fg: T.teal, br: 'transparent' },
    ok:      { bg: T.okLt, fg: T.ok, br: 'transparent' },
    warn:    { bg: T.warnLt, fg: 'oklch(48% 0.14 75)', br: 'transparent' },
    danger:  { bg: T.dangerLt, fg: T.danger, br: 'transparent' },
  }[color] || { bg: T.bgSoft, fg: T.ink2, br: T.borderSoft };
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
}

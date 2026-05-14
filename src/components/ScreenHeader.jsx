import { T } from '../tokens.js';
import Icon from './Icon.jsx';

export default function ScreenHeader({ title, subtitle, onBack, right, sticky = true }) {
  return (
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
}

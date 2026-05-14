import { T } from '../tokens.js';

export default function Field({ label, value, onChange, placeholder, type = 'text', suffix, prefix, style, hint, error }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, ...style }}>
      {label && <label style={{ fontSize: 12, fontWeight: 600, color: T.ink2, letterSpacing: 0.1 }}>{label}</label>}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        background: T.bgSunk, border: `1px solid ${error ? T.danger : T.borderSoft}`,
        borderRadius: 10, padding: '0 12px', height: 44,
      }}>
        {prefix && <span style={{ fontSize: 13, color: T.ink3, fontWeight: 500, flexShrink: 0 }}>{prefix}</span>}
        <input type={type} value={value} onChange={onChange} placeholder={placeholder} style={{
          flex: 1, border: 'none', outline: 'none', background: 'transparent',
          fontSize: 15, fontWeight: 500, color: T.ink, minWidth: 0,
        }} />
        {suffix && <span style={{ fontSize: 13, color: T.ink3, fontWeight: 500, flexShrink: 0 }}>{suffix}</span>}
      </div>
      {hint && !error && <span style={{ fontSize: 11, color: T.ink3 }}>{hint}</span>}
      {error && <span style={{ fontSize: 11, color: T.danger, fontWeight: 500 }}>{error}</span>}
    </div>
  );
}

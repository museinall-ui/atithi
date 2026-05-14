import { T } from '../tokens.js';

export default function Row({ label, value, bold }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
      <span style={{ fontSize: bold ? 14 : 13, color: bold ? T.ink : T.ink2, fontWeight: bold ? 700 : 500 }}>{label}</span>
      <span className="tnum" style={{ fontSize: bold ? 16 : 13, color: T.ink, fontWeight: bold ? 700 : 600, letterSpacing: bold ? -0.2 : 0 }}>{value}</span>
    </div>
  );
}

import { T } from '../tokens.js';

export default function SectionHead({ title, action, style }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
      padding: '0 4px', marginBottom: 10, ...style,
    }}>
      <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: T.ink2, letterSpacing: 0.4, textTransform: 'uppercase' }}>{title}</h3>
      {action}
    </div>
  );
}

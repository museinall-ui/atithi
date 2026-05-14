import { T } from '../tokens.js';

export default function Toggle({ on, onChange }) {
  return (
    <button onClick={() => onChange(!on)} style={{
      width: 38, height: 22, borderRadius: 11, border: 'none',
      background: on ? T.primary : T.bgSunk, position: 'relative',
      transition: 'background .2s', cursor: 'pointer', flexShrink: 0,
    }}>
      <span style={{
        position: 'absolute', top: 2, left: on ? 18 : 2, width: 18, height: 18,
        borderRadius: 9, background: '#fff', transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,.2)',
      }} />
    </button>
  );
}

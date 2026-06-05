import { T } from '../tokens.js';

export default function Toggle({ on, onChange }) {
  // Q3 (a11y): the visible track stays 38×22, but padding gives a ~50×38 tap
  // target (the bare 22px-tall switch was a precise hit on a phone). aria-pressed
  // exposes the on/off state to screen readers.
  return (
    <button onClick={() => onChange(!on)} aria-pressed={on} style={{
      border: 'none', background: 'transparent', cursor: 'pointer', flexShrink: 0,
      padding: '8px 6px', display: 'inline-flex', alignItems: 'center',
    }}>
      <span style={{
        width: 38, height: 22, borderRadius: 11, background: on ? T.primary : T.bgSunk,
        position: 'relative', transition: 'background .2s', display: 'block',
      }}>
        <span style={{
          position: 'absolute', top: 2, left: on ? 18 : 2, width: 18, height: 18,
          borderRadius: 9, background: '#fff', transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,.2)',
        }} />
      </span>
    </button>
  );
}

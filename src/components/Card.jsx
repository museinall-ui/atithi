import { T } from '../tokens.js';

export default function Card({ children, style, padding = 16, onClick }) {
  return (
    <div onClick={onClick} style={{
      background: T.card, border: `1px solid ${T.borderSoft}`,
      borderRadius: T.radius, padding, ...style,
    }}>{children}</div>
  );
}

export default function Avatar({ name, size = 32, color }) {
  const initials = (name || '?').split(' ').slice(0, 2).map(s => s[0]).join('').toUpperCase();
  const hues = [38, 195, 265, 130, 320, 65, 230];
  const hue = color ? null : hues[(name || '').charCodeAt(0) % hues.length];
  const bg = color || `oklch(85% 0.06 ${hue})`;
  const fg = color || `oklch(35% 0.10 ${hue})`;
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: bg, color: fg, fontWeight: 700, fontSize: size * 0.38,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0, letterSpacing: -0.3,
    }}>{initials}</div>
  );
}

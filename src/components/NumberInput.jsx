import { useState, useEffect, useRef } from 'react';

// Drop-in <input type="number"> that lets the user actually clear the
// field. The naive pattern
//
//   <input type="number" value={n} onChange={e => set(parseInt(e.target.value) || N)} />
//
// silently restores the default N on every keystroke that produces an
// invalid intermediate (empty string, "0", "-", etc), making it
// impossible to backspace the existing value to type a new one — every
// hotelier hits this within minutes of opening Settings.
//
// This component keeps a local STRING shadow of the value while the
// field is focused, so the user can clear, edit, paste freely. On
// blur (or when typing produces a valid number) it commits via the
// onChange callback as a real number. On blur with an invalid /
// out-of-range value, it snaps back to `min` (or `fallback` if
// provided).
export default function NumberInput({
  value,
  onChange,
  min = 0,
  max,
  step,
  fallback,            // value used on blur when input is empty/invalid (defaults to min)
  selectOnFocus = true,
  className,
  style,
  placeholder,
  disabled,
  onFocus,
  onBlur,
  ...rest
}) {
  const [text, setText] = useState(value == null ? '' : String(value));
  const focusedRef = useRef(false);

  // Sync from outside when not focused (so parent state updates flow in).
  // While focused, we ignore parent updates so the user's in-progress
  // typing doesn't get clobbered.
  useEffect(() => {
    if (!focusedRef.current) {
      setText(value == null ? '' : String(value));
    }
  }, [value]);

  const handleChange = (e) => {
    const v = e.target.value;
    setText(v);
    // Only commit upstream when the current text parses to a valid
    // number within range. Empty / partial / out-of-range stays
    // local until blur.
    if (v === '') return; // wait for blur
    const n = Number(v);
    if (!isFinite(n)) return;
    if (n < min) return;
    if (max != null && n > max) return;
    onChange && onChange(n);
  };

  const handleBlur = (e) => {
    focusedRef.current = false;
    const v = e.target.value.trim();
    let next;
    if (v === '') {
      next = fallback != null ? fallback : min;
    } else {
      const n = Number(v);
      if (!isFinite(n)) {
        next = fallback != null ? fallback : min;
      } else if (n < min) {
        next = min;
      } else if (max != null && n > max) {
        next = max;
      } else {
        next = n;
      }
    }
    setText(String(next));
    onChange && onChange(next);
    onBlur && onBlur(e);
  };

  const handleFocus = (e) => {
    focusedRef.current = true;
    if (selectOnFocus) e.target.select();
    onFocus && onFocus(e);
  };

  return (
    <input
      type="number"
      inputMode="numeric"
      value={text}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      min={min}
      max={max}
      step={step}
      className={className}
      style={style}
      placeholder={placeholder}
      disabled={disabled}
      {...rest}
    />
  );
}

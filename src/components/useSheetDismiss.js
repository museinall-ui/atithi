import { useEffect, useRef } from 'react';

// Q3 (a11y): small niceties for a bottom-sheet / modal —
//   • Escape closes it (keyboard / desktop),
//   • the page behind it stops scrolling while it's open (a real mobile win —
//     previously you could scroll the dashboard behind an open sheet).
//
// NOTE on Android "Back closes the sheet": we intentionally do NOT implement
// that here by pushing/popping browser history. With React StrictMode (and in
// several real edge cases) a history.back() in the cleanup fires an async
// popstate that races the listener and can slam the sheet shut — fragile, and
// risky next to navigation. Doing Back-to-dismiss properly belongs at a single
// app-level back-intent handler / router, which Atithi doesn't have yet (routing
// is plain state via go()). Until then, sheets close via their Cancel button or
// a backdrop tap, plus Escape below. (Tracked as a follow-up.)
//
// Usage — two shapes via the `isOpen` arg:
//   1. Sheet is a SEPARATE component, conditionally mounted
//      ({open && <PaymentSheet onClose=.../>}) → call inside it with a constant:
//        useSheetDismiss(true, onClose);
//   2. Sheet is an INLINE block in the parent ({showX && <div>…}) → call at the
//      parent level with the state: useSheetDismiss(showX, () => setShowX(false));
//
// onClose may be a fresh inline function each render — read through a ref so the
// effect only re-runs when `isOpen` flips.
export function useSheetDismiss(isOpen, onClose) {
  const cbRef = useRef(onClose);
  cbRef.current = onClose;
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape' && cbRef.current) cbRef.current(); };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen]);
}

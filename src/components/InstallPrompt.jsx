import { useState, useEffect } from 'react';
import { T } from '../tokens.js';
import Icon from './Icon.jsx';

// Shared install-detection state. Exposed via useInstallPrompt() so
// both the floating banner (this file) and the Settings → Install
// app entry can read the same beforeinstallprompt event without
// fighting over who consumes it. Module-scope state survives across
// renders + components.
let _deferredPromptEvent = null;
const _subscribers = new Set();
function _notify() { _subscribers.forEach(fn => { try { fn(_deferredPromptEvent); } catch {} }); }
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    _deferredPromptEvent = e;
    _notify();
  });
  window.addEventListener('appinstalled', () => {
    _deferredPromptEvent = null;
    _notify();
  });
}

export function useInstallPrompt() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const fn = () => setTick(t => t + 1);
    _subscribers.add(fn);
    return () => _subscribers.delete(fn);
  }, []);
  return {
    canInstall: !!_deferredPromptEvent,
    isIosSafari: isIosSafari(),
    isStandalone: isStandalone(),
    install: async () => {
      const e = _deferredPromptEvent;
      if (!e) return { outcome: 'unavailable' };
      _deferredPromptEvent = null;
      _notify();
      try {
        e.prompt();
        const c = await e.userChoice;
        return c;
      } catch {
        return { outcome: 'failed' };
      }
    },
  };
}

// One-time "install Atithi as an app" nudge. Two paths:
//
//   1. Chrome / Android Chrome / Edge — captures the native
//      `beforeinstallprompt` event the browser fires when the PWA
//      manifest + service worker are detected. Tapping our CTA
//      triggers the OS-native install dialog.
//
//   2. iOS Safari — no API for this. We show a friendly
//      "Tap Share → Add to Home Screen" line with the share-icon
//      glyph so the hotelier can do it manually.
//
// The banner only appears when:
//   - The app isn't already running standalone (display-mode check
//     + iOS `navigator.standalone`)
//   - The hotelier hasn't dismissed it before
//   - At least one of the two paths is available (deferred prompt
//     event OR iOS Safari)
//
// Dismissal is sticky (localStorage). Re-show by clearing
// `atithi.installPromptDismissed.v1`.

const DISMISS_KEY = 'atithi.installPromptDismissed.v1';

function isStandalone() {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true;
  // iOS-only flag (non-standard).
  if (window.navigator && window.navigator.standalone === true) return true;
  return false;
}

function isIosSafari() {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent || '';
  const isIos = /iPad|iPhone|iPod/.test(ua);
  // Exclude in-app browsers (Chrome on iOS still uses WebKit but
  // identifies as CriOS — we want true Safari for the share-sheet
  // instructions to be accurate).
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
  return isIos && isSafari;
}

export default function InstallPrompt() {
  const { canInstall, isIosSafari: ios, isStandalone: standalone, install } = useInstallPrompt();
  const [showIosHint, setShowIosHint] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    try { return !!JSON.parse(localStorage.getItem(DISMISS_KEY) || 'false'); }
    catch { return false; }
  });
  const [iosSheetOpen, setIosSheetOpen] = useState(false);

  useEffect(() => {
    if (standalone) return; // already installed
    if (dismissed) return;
    if (ios) {
      // Small delay so the hotelier sees the dashboard first before
      // we ask them to install.
      const id = setTimeout(() => setShowIosHint(true), 4000);
      return () => clearTimeout(id);
    }
  }, [dismissed, ios, standalone]);

  const dismiss = () => {
    setDismissed(true);
    try { localStorage.setItem(DISMISS_KEY, 'true'); } catch {}
  };

  const handleNativeInstall = async () => {
    const choice = await install();
    if (choice && choice.outcome === 'dismissed') dismiss();
  };

  if (dismissed) return null;
  if (standalone) return null;
  if (!canInstall && !showIosHint) return null;

  return (
    <>
      <div
        style={{
          // position:absolute so the banner anchors inside the app
          // root, not the viewport. Otherwise on desktop the banner
          // would span the full viewport width (1440px+) while the
          // app sits at 760-900px centered — making it look like a
          // browser-injected toast rather than part of the app.
          position: 'absolute', left: 12, right: 12, bottom: 90, zIndex: 180,
          background: T.card, borderRadius: 14, padding: '12px 14px',
          boxShadow: '0 12px 32px rgba(20,15,10,.18), 0 0 0 1px rgba(20,15,10,.06)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}
      >
        <div style={{
          width: 38, height: 38, borderRadius: 10,
          background: T.primaryLt, color: T.primaryDk,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Icon name="plus" size={18} stroke={2.4} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>
            Install Atithi on your phone
          </div>
          <div style={{ fontSize: 11, color: T.ink3, fontWeight: 600, marginTop: 2, lineHeight: 1.4 }}>
            One tap to open · works offline · feels like a real app
          </div>
        </div>
        {canInstall ? (
          <button
            onClick={handleNativeInstall}
            style={{
              padding: '8px 14px', borderRadius: 8, border: 'none',
              background: T.primary, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              flexShrink: 0,
            }}
          >Install</button>
        ) : (
          <button
            onClick={() => setIosSheetOpen(true)}
            style={{
              padding: '8px 14px', borderRadius: 8, border: 'none',
              background: T.primary, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              flexShrink: 0,
            }}
          >How</button>
        )}
        <button
          onClick={dismiss}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.ink3, padding: 4, flexShrink: 0 }}
          aria-label="Dismiss"
        >
          <Icon name="x" size={14} />
        </button>
      </div>

      {/* iOS share-sheet instructions — shown when the hotelier taps
          "How" on the iOS variant of the banner. */}
      {iosSheetOpen && (
        <div
          onClick={() => setIosSheetOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 220, display: 'flex', alignItems: 'flex-end' }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: '100%', background: T.card, borderRadius: '16px 16px 0 0', padding: 24 }}
          >
            <div style={{ width: 32, height: 4, background: T.border, borderRadius: 2, margin: '0 auto 18px' }} />
            <div style={{ fontSize: 17, fontWeight: 800, color: T.ink, marginBottom: 14, textAlign: 'center' }}>
              Add Atithi to your home screen
            </div>
            <ol style={{ paddingLeft: 24, color: T.ink2, fontSize: 13, lineHeight: 1.7, marginBottom: 18 }}>
              <li>Tap the <strong>Share</strong> icon at the bottom of Safari
                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 6, background: T.bgSoft, marginLeft: 6, verticalAlign: 'middle' }}>
                  {/* Apple share icon — square with up-arrow */}
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                    <path d="M10 3v10M10 3l-3 3M10 3l3 3" stroke={T.primary} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M5 10v6a1 1 0 001 1h8a1 1 0 001-1v-6" stroke={T.primary} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </span>
              </li>
              <li>Scroll down → tap <strong>Add to Home Screen</strong></li>
              <li>Tap <strong>Add</strong> in the top-right corner</li>
            </ol>
            <div style={{ padding: '10px 12px', background: T.bgSoft, borderRadius: 8, fontSize: 11, color: T.ink3, fontWeight: 600, lineHeight: 1.5, marginBottom: 14 }}>
              Atithi will appear on your home screen like any other app. Tap the icon to launch — no browser bar.
            </div>
            <button
              onClick={() => { setIosSheetOpen(false); dismiss(); }}
              style={{
                width: '100%', padding: '11px 14px', borderRadius: 10, border: 'none',
                background: T.primary, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
              }}
            >Got it</button>
          </div>
        </div>
      )}
    </>
  );
}

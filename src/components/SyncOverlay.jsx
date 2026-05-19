import { useEffect, useState, useRef } from 'react';
import { T } from '../tokens.js';
import Icon from './Icon.jsx';
import { useSyncState, dismissSyncError } from '../cloud/sync.js';

// Two pieces of ambient sync UI:
//
// 1. A tiny dot pill in the top-right of the phone frame. Shows the live
//    sync status — gray (idle), pulsing orange (syncing), solid green (ok),
//    solid red (error). On the *very first* successful sync after sign-in,
//    it briefly expands into "Saved to cloud ✓" before collapsing back —
//    so the hotelier sees, once, that their data is being persisted.
//
// 2. A bottom-of-screen error toast (above the tab bar) that surfaces
//    cloud sync failures. Auto-dismisses after 6s; tap × to close sooner.
//    Failures used to be silent console.error only — this is the user-
//    visible half of that fix.

const DOT = 8;

function dotColor(status) {
  if (status === 'error') return T.danger;
  if (status === 'syncing') return T.warn;
  if (status === 'ok') return T.ok;
  return T.ink4;
}

export default function SyncOverlay({ t }) {
  const sync = useSyncState();
  const [showFirstOk, setShowFirstOk] = useState(false);
  const firstOkSeenRef = useRef(false);
  const [errorVisible, setErrorVisible] = useState(false);
  const lastErrorAtRef = useRef(0);

  // Expand the pill to "Saved to cloud" exactly once, the first time a sync
  // OK arrives after sign-in. The 3s timer runs to completion regardless of
  // subsequent status changes — we don't want this to re-flash on every
  // later sync (subtle but real bug: cleanup-driven cancel would leave the
  // pill stuck open or re-trigger on later ok states within the window).
  useEffect(() => {
    if (sync.status === 'ok' && sync.firstOk && !firstOkSeenRef.current) {
      firstOkSeenRef.current = true;
      setShowFirstOk(true);
      setTimeout(() => setShowFirstOk(false), 3000);
    }
  }, [sync.status, sync.firstOk]);

  // Surface a toast whenever a fresh error arrives. A subsequent successful
  // sync clears the error in the store, which hides the toast automatically.
  useEffect(() => {
    if (!sync.lastError) {
      setErrorVisible(false);
      return;
    }
    if (sync.lastError.at !== lastErrorAtRef.current) {
      lastErrorAtRef.current = sync.lastError.at;
      setErrorVisible(true);
      const id = setTimeout(() => setErrorVisible(false), 6000);
      return () => clearTimeout(id);
    }
  }, [sync.lastError]);

  const color = dotColor(sync.status);
  const pulsing = sync.status === 'syncing';
  // Hide the "Saved" text if a fresh error has arrived during the 3s window —
  // otherwise the green-toned chip text next to a red dot would contradict
  // itself. Otherwise show for the full 3s.
  const showPillText = showFirstOk && sync.status !== 'error';

  return (
    <>
      {/* Status dot (always rendered once signed in) */}
      <div
        style={{
          position: 'fixed', top: 10, right: 12, zIndex: 200,
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'rgba(255,255,255,0.92)',
          borderRadius: 999,
          padding: showPillText ? '4px 10px 4px 8px' : '4px',
          boxShadow: '0 1px 3px rgba(20,15,10,.10), 0 0 0 1px rgba(20,15,10,.06)',
          transition: 'padding .2s ease',
          pointerEvents: 'auto',
        }}
        title={statusTitle(t, sync)}
      >
        <span
          className={pulsing ? 'pulse' : ''}
          style={{
            width: DOT, height: DOT, borderRadius: DOT / 2,
            background: color, flexShrink: 0,
          }}
        />
        {showPillText && (
          <span style={{ fontSize: 11, fontWeight: 700, color: T.ink, whiteSpace: 'nowrap' }}>
            {t('syncSaved')}
          </span>
        )}
      </div>

      {/* Error toast (bottom, above the tab bar) */}
      {errorVisible && sync.lastError && (
        <div
          style={{
            position: 'fixed', left: 12, right: 12, bottom: 90, zIndex: 200,
            background: T.card, borderRadius: 14, padding: '10px 12px',
            boxShadow: '0 12px 32px rgba(20,15,10,.18), 0 0 0 1px rgba(20,15,10,.06)',
            display: 'flex', alignItems: 'flex-start', gap: 10,
          }}
        >
          <div
            style={{
              width: 32, height: 32, borderRadius: 8, background: T.dangerLt,
              color: T.danger, display: 'flex', alignItems: 'center',
              justifyContent: 'center', flexShrink: 0,
            }}
          >
            <Icon name="bell" size={16} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.ink }}>
              {t('syncErrorTitle')}
            </div>
            <div style={{ fontSize: 11, color: T.ink3, marginTop: 2, lineHeight: 1.35 }}>
              {t('syncErrorHint')} <span style={{ color: T.ink2 }}>· {sync.lastError.label}</span>
            </div>
          </div>
          <button
            style={{
              background: 'none', border: 'none', color: T.ink3, cursor: 'pointer',
              padding: 4, alignSelf: 'flex-start',
            }}
            onClick={() => { setErrorVisible(false); dismissSyncError(); }}
            aria-label="Dismiss"
          >
            <Icon name="x" size={14} />
          </button>
        </div>
      )}
    </>
  );
}

function statusTitle(t, s) {
  if (s.status === 'error') return t('syncErrorTitle');
  if (s.status === 'syncing') return t('syncSaving');
  if (s.status === 'ok') return t('syncSaved');
  return '';
}

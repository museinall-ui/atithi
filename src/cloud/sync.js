import { useEffect, useState } from 'react';

// ---------------------------------------------------------------------------
// Sync state pub/sub.
//
// Every cloud write (booking move, payment add, invoice issue, etc.) flows
// through `syncCloud()` so the UI can show a single source of truth for
// "is my data safely in the cloud?". One state, many subscribers.
//
// State machine:
//   idle    — nothing has happened yet (first paint after sign-in)
//   syncing — at least one cloud op is in flight
//   ok      — last op succeeded and nothing in flight
//   error   — last op failed (stays sticky until the next ok)
// ---------------------------------------------------------------------------

let listeners = [];
let state = {
  status: 'idle',
  pending: 0,
  lastError: null,    // { label, message, at }
  lastOkAt: null,     // ms timestamp
  firstOk: false,     // flipped true after the very first successful sync
};

function emit() {
  const snap = state;
  listeners.forEach(fn => { try { fn(snap); } catch {} });
}

export function getSyncState() { return state; }

export function subscribeSync(fn) {
  listeners.push(fn);
  fn(state);
  return () => { listeners = listeners.filter(l => l !== fn); };
}

// Wrap any cloud promise. Re-throws so callers with their own try/catch
// fallback (issueInvoice, createBookingCloud) still see the error and can
// fall back to localStorage. `label` is the short human-readable action
// name used in the error toast ("Save payment", "Update booking").
export function syncCloud(label, promise) {
  state = { ...state, status: 'syncing', pending: state.pending + 1 };
  emit();
  return promise.then(
    (val) => {
      const pending = Math.max(0, state.pending - 1);
      state = {
        ...state,
        status: pending > 0 ? 'syncing' : 'ok',
        pending,
        lastError: null,
        lastOkAt: Date.now(),
        firstOk: true,
      };
      emit();
      return val;
    },
    (err) => {
      const pending = Math.max(0, state.pending - 1);
      state = {
        ...state,
        status: 'error',
        pending,
        lastError: {
          label,
          message: (err && (err.message || String(err))) || 'Unknown error',
          at: Date.now(),
        },
      };
      console.error('[atithi] ' + label + ' failed:', err);
      emit();
      throw err;
    },
  );
}

// Fire-and-forget. Notifies the UI, swallows the error so the caller
// doesn't need a .catch(). Use for sync calls where the toast IS the
// only failure side-effect the hotelier needs.
export function syncFire(label, promise) {
  return syncCloud(label, promise).catch(() => null);
}

// Manual error notification — for failures that don't flow through a
// promise wrapper (e.g. the initial cloud load inside its own try/catch).
export function notifySyncFailure(label, err) {
  state = {
    ...state,
    status: 'error',
    lastError: {
      label,
      message: (err && (err.message || String(err))) || 'Unknown error',
      at: Date.now(),
    },
  };
  console.error('[atithi] ' + label + ' failed:', err);
  emit();
}

// User-facing dismissal of the current error (resets to ok if nothing
// is in flight; otherwise the next sync resolution will update it).
export function dismissSyncError() {
  state = {
    ...state,
    status: state.pending > 0 ? 'syncing' : (state.lastOkAt ? 'ok' : 'idle'),
    lastError: null,
  };
  emit();
}

// React hook — subscribe + auto-unsubscribe.
export function useSyncState() {
  const [s, setS] = useState(() => getSyncState());
  useEffect(() => subscribeSync(setS), []);
  return s;
}

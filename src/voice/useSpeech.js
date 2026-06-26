import { useState, useRef, useCallback, useEffect } from 'react';

// Thin wrapper over the browser's built-in Web Speech API
// (SpeechRecognition). Free, no key, no signup. Works great on Android
// Chrome / Edge, is flaky on iOS Safari, and absent on Firefox — so the
// `supported` flag lets the UI fall back to a "type the command" box and
// the flow always works.
//
// KEY BEHAVIOUR — continuous, breath-friendly listening:
//   The browser's recognizer ends a segment the moment you pause (and on
//   mobile it also times out after a while). On its own that means it
//   "cuts you off" mid-thought. We set continuous mode AND auto-restart
//   the recognizer whenever it ends while the user still intends to be
//   listening — so a pause, a breath, or a few seconds of "let me think"
//   never stops the session. Only an explicit stop() (tap) ends it.
//
//   Finalized phrases are delivered via the onFinal(text) callback, so the
//   caller owns the accumulated text. That means re-tapping the mic
//   APPENDS to what's already there instead of wiping it, and manual edits
//   to the text box stick.

export function getSpeechRecognition() {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export function useSpeech({ lang = 'en-IN', onFinal } = {}) {
  const SR = getSpeechRecognition();
  const supported = !!SR;
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState('');

  const recRef = useRef(null);
  const wantRef = useRef(false);     // does the user still want to be listening?
  const onFinalRef = useRef(onFinal); // read through a ref so restarts don't need fresh closures
  onFinalRef.current = onFinal;

  // (Re)create a recognizer and start it. Held in a ref so the recognizer's
  // own onend handler can relaunch it without a stale closure.
  const beginRef = useRef(null);
  beginRef.current = () => {
    if (!SR) return;
    let rec;
    try { rec = new SR(); } catch { setError('init'); return; }
    rec.lang = lang;
    rec.interimResults = true;
    rec.continuous = true;     // keep a single segment open through short pauses
    rec.maxAlternatives = 1;

    // Highest final-result index already emitted to onFinal (+1), scoped to
    // THIS recognizer instance. In continuous mode several browsers re-report
    // already-finalized results (e.resultIndex stuck at 0), so iterating from
    // resultIndex and emitting every isFinal each time appended each spoken
    // phrase 2-3× into the command box (audit #3). Tracking the index emits
    // every phrase exactly once. A new instance (auto-restart) starts fresh at
    // 0 — correct, since its results array is new.
    let lastFinalIndex = 0;
    rec.onresult = (e) => {
      let finalT = '';
      let interimT = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) {
          if (i >= lastFinalIndex) { finalT += r[0].transcript; lastFinalIndex = i + 1; }
        } else {
          interimT += r[0].transcript;
        }
      }
      if (finalT && onFinalRef.current) onFinalRef.current(finalT.trim());
      setInterim(interimT);
    };

    rec.onerror = (e) => {
      const err = (e && e.error) || 'error';
      // Permission denials are fatal — stop trying.
      if (err === 'not-allowed' || err === 'service-not-allowed') {
        wantRef.current = false;
        setError(err);
        setListening(false);
        return;
      }
      // 'no-speech' / 'aborted' are normal during a pause in continuous mode;
      // onend will relaunch. Surface anything else so the UI can hint.
      if (err !== 'no-speech' && err !== 'aborted') setError(err);
    };

    rec.onend = () => {
      if (wantRef.current) {
        // The browser ended the segment (pause / timeout) but the user hasn't
        // tapped stop. Clear the dying instance's interim (the next instance
        // re-emits it) then relaunch after a short gap so the previous instance
        // has fully released — keeps it feeling like one continuous session.
        setInterim('');
        setTimeout(() => { if (wantRef.current && beginRef.current) beginRef.current(); }, 150);
      } else {
        setListening(false);
        setInterim('');
      }
    };

    recRef.current = rec;
    try { rec.start(); }
    catch { /* a prior instance may still be ending; its onend will retry */ }
  };

  const start = useCallback(() => {
    if (!SR) { setError('unsupported'); return; }
    setError('');
    setInterim('');
    wantRef.current = true;
    setListening(true);
    beginRef.current();
  }, [SR]);

  const stop = useCallback(() => {
    wantRef.current = false;
    const rec = recRef.current;
    if (rec) { try { rec.stop(); } catch { /* already stopped */ } }
    setListening(false);
    setInterim('');
  }, []);

  const reset = useCallback(() => { setInterim(''); setError(''); }, []);

  // Stop the recognizer if the component unmounts mid-capture.
  useEffect(() => () => {
    wantRef.current = false;
    const rec = recRef.current;
    if (rec) { try { rec.stop(); } catch { /* noop */ } }
  }, []);

  return { supported, listening, interim, error, start, stop, reset };
}

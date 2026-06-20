import { useState, useRef, useCallback, useEffect } from 'react';

// Thin wrapper over the browser's built-in Web Speech API
// (SpeechRecognition). Free, no key, no signup. Works great on Android
// Chrome / Edge, is flaky on iOS Safari, and absent on Firefox — so the
// `supported` flag lets the UI fall back to a "type the command" box and
// the flow always works.
//
// Returns:
//   supported   — is SpeechRecognition available in this browser
//   listening   — currently capturing
//   transcript  — accumulated FINAL text
//   interim     — the in-progress (not yet final) words
//   error       — last error code ('not-allowed', 'no-speech', ...)
//   start/stop  — control capture
//   reset       — clear transcript + interim + error
//   setTranscript — let the UI seed/edit the text (e.g. the typed fallback)

export function getSpeechRecognition() {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export function useSpeech({ lang = 'en-IN' } = {}) {
  const SR = getSpeechRecognition();
  const supported = !!SR;
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interim, setInterim] = useState('');
  const [error, setError] = useState('');
  const recRef = useRef(null);

  const stop = useCallback(() => {
    const rec = recRef.current;
    if (rec) { try { rec.stop(); } catch { /* already stopped */ } }
    setListening(false);
  }, []);

  const start = useCallback(() => {
    if (!SR) { setError('unsupported'); return; }
    setError('');
    setInterim('');
    let rec;
    try { rec = new SR(); } catch { setError('init'); return; }
    rec.lang = lang;
    rec.interimResults = true;
    // Single utterance — the manager speaks the booking, then it ends.
    rec.continuous = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      let finalT = '';
      let interimT = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalT += r[0].transcript;
        else interimT += r[0].transcript;
      }
      if (finalT) {
        setTranscript(prev => (prev ? prev + ' ' : '') + finalT.trim());
      }
      setInterim(interimT);
    };
    rec.onerror = (e) => {
      setError((e && e.error) || 'error');
      setListening(false);
    };
    rec.onend = () => {
      setListening(false);
      setInterim('');
    };
    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      // start() throws if called while already running — treat as a no-op.
      setError('start');
    }
  }, [SR, lang]);

  const reset = useCallback(() => {
    setTranscript('');
    setInterim('');
    setError('');
  }, []);

  // Stop the recognizer if the component unmounts mid-capture.
  useEffect(() => () => {
    const rec = recRef.current;
    if (rec) { try { rec.stop(); } catch { /* noop */ } }
  }, []);

  return { supported, listening, transcript, interim, error, start, stop, reset, setTranscript };
}

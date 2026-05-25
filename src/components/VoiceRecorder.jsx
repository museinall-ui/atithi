import { useState, useRef, useEffect } from 'react';
import { T } from '../tokens.js';
import Icon from './Icon.jsx';

// Voice-note recorder + playback list. Lives inside BookingDetail as
// a 'Voice notes' card. The hotelier taps Record, the browser asks
// for mic permission (once per session), they speak up to 60s, tap
// Stop, and the note is saved to the booking. Existing notes render
// as native <audio> elements they can play back.
//
// Storage: each note is a base64 data URL. Capped at 60s + 3 notes
// per booking (enforced here in the UI; the App.jsx action also
// double-checks the count). A 60s opus webm clip is ~80-150 KB so
// 3 notes is ~450 KB worst case — fine for localStorage in DEMO_MODE
// and for the booking row's voice_notes jsonb column.
//
// Permission UX: if the user has previously denied mic access, the
// getUserMedia call rejects and we surface a clear "enable mic
// access in browser settings" message instead of failing silently.

const MAX_DURATION_SEC = 60;
const MAX_NOTES = 3;

function fmtDuration(sec) {
  const total = Math.round(sec || 0);
  const m = Math.floor(total / 60);
  const s = total - m * 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function VoiceRecorder({ notes = [], onAdd, onRemove }) {
  const [recording, setRecording] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [error, setError] = useState('');
  const mediaRef = useRef(null);   // MediaRecorder
  const streamRef = useRef(null);  // MediaStream
  const chunksRef = useRef([]);
  const startTsRef = useRef(0);
  const tickIdRef = useRef(null);
  const limitIdRef = useRef(null);

  const cleanupStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (tickIdRef.current) { clearInterval(tickIdRef.current); tickIdRef.current = null; }
    if (limitIdRef.current) { clearTimeout(limitIdRef.current); limitIdRef.current = null; }
  };
  // Stop cleanly on unmount so the mic indicator goes away even if
  // the hotelier navigates mid-recording.
  useEffect(() => () => cleanupStream(), []);

  const start = async () => {
    setError('');
    if (notes.length >= MAX_NOTES) {
      setError(`Up to ${MAX_NOTES} voice notes per booking. Delete one to add another.`);
      return;
    }
    if (!navigator.mediaDevices || !window.MediaRecorder) {
      setError('Voice recording needs a modern browser with microphone support.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      // Let MediaRecorder pick its preferred MIME — Chrome picks
      // audio/webm;codecs=opus, Safari picks audio/mp4. Both play back
      // via <audio> on the same browser, which is what we need.
      const rec = new MediaRecorder(stream);
      mediaRef.current = rec;
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: chunksRef.current[0]?.type || 'audio/webm' });
        const durationSec = Math.min(MAX_DURATION_SEC, (Date.now() - startTsRef.current) / 1000);
        const reader = new FileReader();
        reader.onloadend = () => {
          const dataUrl = String(reader.result || '');
          if (!dataUrl) return;
          onAdd && onAdd({
            id: 'vn_' + Date.now().toString(36),
            dataUrl,
            durationSec,
            createdAt: new Date().toISOString(),
          });
        };
        reader.readAsDataURL(blob);
        cleanupStream();
        setRecording(false);
        setElapsedSec(0);
      };
      startTsRef.current = Date.now();
      rec.start();
      setRecording(true);
      // Tick the elapsed counter every 200ms for a smooth-feeling
      // timer; cap at MAX_DURATION_SEC and auto-stop.
      tickIdRef.current = setInterval(() => {
        setElapsedSec((Date.now() - startTsRef.current) / 1000);
      }, 200);
      limitIdRef.current = setTimeout(() => {
        try { rec.stop(); } catch {}
      }, MAX_DURATION_SEC * 1000);
    } catch (e) {
      cleanupStream();
      setRecording(false);
      setElapsedSec(0);
      if (e && e.name === 'NotAllowedError') {
        setError('Mic access blocked. Enable it in your browser settings and try again.');
      } else if (e && e.name === 'NotFoundError') {
        setError('No microphone found. Plug one in or use a device with a mic.');
      } else {
        setError('Could not start recording: ' + (e?.message || 'unknown error'));
      }
    }
  };

  const stop = () => {
    if (mediaRef.current && mediaRef.current.state === 'recording') {
      try { mediaRef.current.stop(); } catch {}
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Existing notes — listed top-down, oldest first. Each renders
          a native <audio> with controls so the hotelier can scrub,
          play, pause without us reinventing the wheel. */}
      {notes.map((n) => (
        <div key={n.id} style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: 8, background: T.bgSoft, border: `1px solid ${T.borderSoft}`,
          borderRadius: 8,
        }}>
          <Icon name="bell" size={14} color={T.primaryDk} stroke={2} />
          <audio src={n.dataUrl} controls preload="metadata" style={{ flex: 1, minWidth: 0, height: 32 }} />
          <span className="tnum" style={{ fontSize: 10, color: T.ink3, fontWeight: 700, flexShrink: 0 }}>
            {fmtDuration(n.durationSec)}
          </span>
          <button
            onClick={() => onRemove && onRemove(n.id)}
            title="Delete this voice note"
            style={{ background: 'none', border: 'none', color: T.danger, cursor: 'pointer', padding: 4 }}
          ><Icon name="x" size={13} /></button>
        </div>
      ))}

      {recording ? (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 12px', background: 'oklch(95% 0.06 30)',
          border: `1.5px solid ${T.danger}`, borderRadius: 8,
        }}>
          <span style={{
            width: 10, height: 10, borderRadius: '50%', background: T.danger,
            animation: 'atithi-pulse 1.2s infinite',
          }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: T.danger }}>
            Recording · {fmtDuration(elapsedSec)} / {fmtDuration(MAX_DURATION_SEC)}
          </span>
          <button
            onClick={stop}
            style={{
              marginLeft: 'auto',
              padding: '6px 14px', borderRadius: 7,
              border: 'none', background: T.danger, color: '#fff',
              fontSize: 11, fontWeight: 700, cursor: 'pointer',
            }}
          >Stop</button>
        </div>
      ) : (
        <button
          onClick={start}
          disabled={notes.length >= MAX_NOTES}
          style={{
            padding: '10px 12px', borderRadius: 8,
            border: `1.5px solid ${notes.length >= MAX_NOTES ? T.border : T.primary}`,
            background: notes.length >= MAX_NOTES ? T.bgSoft : T.primaryLt,
            color: notes.length >= MAX_NOTES ? T.ink3 : T.primaryDk,
            fontSize: 12, fontWeight: 700,
            cursor: notes.length >= MAX_NOTES ? 'not-allowed' : 'pointer',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}
        >
          <Icon name="bell" size={13} color={notes.length >= MAX_NOTES ? T.ink3 : T.primaryDk} stroke={2.2} />
          {notes.length === 0 ? 'Record voice note' : notes.length >= MAX_NOTES ? `${MAX_NOTES}-note limit reached` : 'Record another voice note'}
        </button>
      )}

      {error && (
        <div style={{ fontSize: 11, color: T.danger, fontWeight: 600, lineHeight: 1.4 }}>
          {error}
        </div>
      )}

      {notes.length === 0 && !recording && !error && (
        <div style={{ fontSize: 10.5, color: T.ink3, fontStyle: 'italic', lineHeight: 1.5 }}>
          Quick voice memo — e.g. "Guest mentioned a nut allergy", "Asked for late check-out", "Pickup at 6 PM tomorrow". Up to {MAX_DURATION_SEC}s, up to {MAX_NOTES} notes per booking.
        </div>
      )}
    </div>
  );
}

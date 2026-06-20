import { useState, useEffect } from 'react';
import { T } from '../tokens.js';
import Icon from './Icon.jsx';
import Btn from './Btn.jsx';
import { useSheetDismiss } from './useSheetDismiss.js';
import { useSpeech } from '../voice/useSpeech.js';
import { parseBookingCommand, draftToPrefill } from '../voice/parseBookingCommand.js';

// "Speak a booking" sheet. The hotelier taps the mic, says the booking
// in plain language, and we turn it into a pre-filled New Booking form
// they confirm. Voice (Web Speech API) is free + browser-native; a
// "type instead" box guarantees the flow works even where voice isn't
// supported (Firefox / locked-down iOS).
//
// The understanding step runs through /api/parse-booking (Claude Haiku
// 4.5) on the live site, with a built-in rule-based fallback for local
// preview — both handled inside parseBookingCommand().

function MicGlyph({ size = 30, color = '#fff' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v3" />
    </svg>
  );
}

export default function VoiceBookingSheet({ open, onClose, property, propertyId, session, go, lang = 'en' }) {
  const isHi = lang === 'hi';
  const tx = (en, hi) => (isHi ? hi : en);
  const sp = useSpeech({ lang: 'en-IN' });
  const [command, setCommand] = useState('');
  const [busy, setBusy] = useState(false);

  useSheetDismiss(open, onClose);

  // Mirror finalized speech into the editable command box.
  useEffect(() => {
    if (sp.transcript) setCommand(sp.transcript);
  }, [sp.transcript]);

  // Reset everything when the sheet (re)opens.
  useEffect(() => {
    if (open) {
      setCommand('');
      setBusy(false);
      sp.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const toggleMic = () => {
    if (sp.listening) { sp.stop(); return; }
    setCommand('');
    sp.reset();
    sp.start();
  };

  const proceed = async () => {
    const text = (command || sp.transcript || '').trim();
    if (!text || busy) return;
    setBusy(true);
    sp.stop();
    try {
      const { draft } = await parseBookingCommand(text, property, propertyId, session);
      const prefill = draftToPrefill(draft, property);
      onClose();
      go('new', { prefill });
    } catch {
      // parseBookingCommand never throws (it falls back to rules), but
      // guard anyway so the button re-enables on any unexpected error.
      setBusy(false);
    }
  };

  const micError = sp.error && sp.error !== 'start';
  const errMsg = sp.error === 'not-allowed' || sp.error === 'service-not-allowed'
    ? tx('Microphone blocked — allow mic access, or type the command below.',
         'माइक ब्लॉक है — माइक की अनुमति दें, या नीचे कमांड टाइप करें।')
    : sp.error === 'no-speech'
      ? tx("Didn't catch that — tap the mic and try again, or type below.",
           'सुनाई नहीं दिया — फिर से माइक दबाएँ, या नीचे टाइप करें।')
      : tx('Voice had a hiccup — type the command below instead.',
           'वॉइस में दिक्कत — नीचे कमांड टाइप करें।');

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 60,
        background: 'rgba(15,15,18,0.45)', backdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={isHi ? 'hi-mode' : ''}
        style={{
          width: '100%', maxWidth: 440, background: T.bg,
          borderRadius: '18px 18px 0 0', padding: '14px 18px 22px',
          boxShadow: '0 -10px 40px rgba(0,0,0,0.18)',
          maxHeight: '92vh', overflowY: 'auto',
        }}
      >
        {/* Grabber + header */}
        <div style={{ width: 38, height: 4, borderRadius: 3, background: T.borderSoft, margin: '0 auto 12px' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: T.ink }}>
            {tx('Speak a booking', 'बोलकर बुकिंग करें')}
          </div>
          <button onClick={onClose} className="atithi-tap" style={{
            width: 30, height: 30, borderRadius: 8, border: `1px solid ${T.border}`,
            background: T.bgSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
          }}><Icon name="x" size={14} color={T.ink2} /></button>
        </div>
        <div style={{ fontSize: 12.5, color: T.ink3, marginBottom: 16, lineHeight: 1.45 }}>
          {tx('Tap the mic and say the booking. We’ll fill in the form for you to check.',
              'माइक दबाएँ और बुकिंग बोलें। हम फ़ॉर्म भर देंगे, आप जाँच लें।')}
        </div>

        {/* Mic */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <button
            onClick={toggleMic}
            disabled={busy || !sp.supported}
            className="atithi-tap"
            aria-label={sp.listening ? 'Stop' : 'Start voice'}
            style={{
              width: 76, height: 76, borderRadius: '50%', border: 'none',
              background: sp.listening ? T.danger : (sp.supported ? T.primary : T.ink3),
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: (busy || !sp.supported) ? 'default' : 'pointer',
              boxShadow: sp.listening
                ? `0 0 0 8px color-mix(in oklch, ${T.danger} 18%, transparent)`
                : '0 6px 18px rgba(0,0,0,0.16)',
              transition: 'background .15s, box-shadow .2s',
              opacity: (!sp.supported || busy) ? 0.7 : 1,
            }}
          >
            <MicGlyph />
          </button>
          <div style={{ fontSize: 12, fontWeight: 600, color: sp.listening ? T.danger : T.ink3, minHeight: 16 }}>
            {!sp.supported
              ? tx('Voice not supported here', 'इस ब्राउज़र में वॉइस नहीं')
              : sp.listening
                ? tx('Listening… tap to stop', 'सुन रहे हैं… रोकने के लिए दबाएँ')
                : tx('Tap to speak', 'बोलने के लिए दबाएँ')}
          </div>
          {sp.listening && sp.interim ? (
            <div style={{ fontSize: 12.5, color: T.ink2, fontStyle: 'italic', textAlign: 'center' }}>{sp.interim}</div>
          ) : null}
        </div>

        {micError && (
          <div style={{
            fontSize: 12, color: T.danger, background: `color-mix(in oklch, ${T.danger} 8%, white)`,
            border: `1px solid color-mix(in oklch, ${T.danger} 25%, white)`, borderRadius: 10,
            padding: '8px 10px', marginBottom: 12,
          }}>{errMsg}</div>
        )}

        {/* Type-instead box (always available) */}
        <div style={{ fontSize: 11, fontWeight: 700, color: T.ink3, letterSpacing: 0.3, marginBottom: 6, textTransform: 'uppercase' }}>
          {sp.supported ? tx('Or type the command', 'या कमांड टाइप करें') : tx('Type the command', 'कमांड टाइप करें')}
        </div>
        <textarea
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          rows={3}
          placeholder={tx(
            'e.g. Booking for 15 January for a deluxe room, 2 adults 1 child under 6, total 5000, 2000 advance',
            'जैसे 15 जनवरी के लिए डीलक्स रूम, 2 वयस्क 1 बच्चा 6 साल से कम, कुल 5000, 2000 एडवांस'
          )}
          style={{
            width: '100%', boxSizing: 'border-box', resize: 'vertical',
            border: `1px solid ${T.border}`, borderRadius: 12, padding: '10px 12px',
            fontSize: 13.5, color: T.ink, background: '#fff', lineHeight: 1.5,
            fontFamily: 'inherit', outline: 'none',
          }}
        />

        {/* Footer */}
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <Btn variant="soft" onClick={onClose} style={{ flex: 1 }}>{tx('Cancel', 'रद्द')}</Btn>
          <Btn
            variant="primary"
            icon={busy ? undefined : 'arrow'}
            onClick={proceed}
            disabled={busy || !command.trim()}
            style={{ flex: 2 }}
          >
            {busy ? tx('Reading…', 'पढ़ रहे हैं…') : tx('Review booking', 'बुकिंग देखें')}
          </Btn>
        </div>
      </div>
    </div>
  );
}

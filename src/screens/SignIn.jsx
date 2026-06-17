import { useState } from 'react';
import { T } from '../tokens.js';
import Btn from '../components/Btn.jsx';
import Field from '../components/Field.jsx';
import Icon from '../components/Icon.jsx';
import { signInWithEmail, signInWithGoogle } from '../supabase.js';

// Email-magic-link sign-in + Google OAuth. Phase 1 of the cloud
// migration: the app is gated behind this screen, but data still flows
// to/from localStorage underneath. Cloud reads/writes arrive in later
// chunks.
export default function SignIn({ t, lang, onChangeLang, go }) {
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  // Separate "Google in progress" + "Google hint" state so the email
  // flow's error / spinner are never tangled with the OAuth flow.
  const [googleBusy, setGoogleBusy] = useState(false);
  const [googleHint, setGoogleHint] = useState('');

  const submitGoogle = async () => {
    setGoogleHint('');
    setError('');
    setGoogleBusy(true);
    const { error: err } = await signInWithGoogle();
    // On success we never reach here — the browser redirects away. So
    // any code below this point means the call failed locally. The most
    // common failure is "provider_not_enabled" when the owner hasn't
    // turned on Google in Supabase yet — show the setup hint then.
    setGoogleBusy(false);
    if (err) {
      const msg = (err.message || '').toLowerCase();
      if (msg.includes('provider') || msg.includes('not enabled') || msg.includes('disabled')) {
        setGoogleHint(t('googleNotEnabled'));
      } else {
        setGoogleHint(t('googleSignInError'));
      }
    }
  };

  const submit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    const clean = email.trim().toLowerCase();
    if (!clean || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) {
      setError(t('signInBadEmail'));
      return;
    }
    setError('');
    setSending(true);
    const { error: err } = await signInWithEmail(clean);
    setSending(false);
    if (err) {
      setError(err.message || t('signInError'));
      return;
    }
    setSent(true);
  };

  return (
    <div
      className={'atithi' + (lang === 'hi' ? ' hi-mode' : '')}
      style={{
        height: '100%', background: T.bg, color: T.ink,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20, position: 'relative',
      }}
    >
      {/* Back to the landing page — without this a visitor who taps
          "Sign in" from the landing has no way back. go('home') resolves
          to the Landing page while signed out (App.jsx pre-auth gate). */}
      {go && (
        <button
          type="button"
          onClick={() => {
            // Prefer real browser history so this matches the browser/phone
            // Back button; fall back to the landing if there's no prior entry.
            if (typeof window !== 'undefined' && window.history.length > 1) window.history.back();
            else go('home');
          }}
          className="atithi-tap"
          style={{
            position: 'absolute', top: 14, left: 14,
            display: 'inline-flex', alignItems: 'center', gap: 4,
            background: 'none', border: 'none', color: T.ink3,
            fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: '6px 8px',
          }}
        >
          <Icon name="chevL" size={18} color={T.ink3} />
          {lang === 'hi' ? 'वापस' : 'Back'}
        </button>
      )}
      <div style={{ width: '100%', maxWidth: 360 }}>
        {/* Brand */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 64, height: 64, margin: '0 auto',
            borderRadius: 18,
            background: `linear-gradient(135deg, ${T.primary}, ${T.primaryDk})`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 30, fontWeight: 700, color: '#fff',
            boxShadow: '0 6px 18px rgba(20,15,10,.10)',
            fontFamily: T.fontHi,
          }}>अ</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: T.ink, marginTop: 14, letterSpacing: -0.5 }}>
            {t('appName')}
          </div>
          <div style={{ fontSize: 12.5, color: T.ink3, marginTop: 4, fontWeight: 500 }}>
            {t('signInTagline')}
          </div>
        </div>

        {!sent ? (
          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Google OAuth. Sits at the top because it's a one-tap
                flow (no email inbox detour) — most users will prefer it
                if they have a Google account. Falls back to email below
                when Google isn't enabled in the Supabase project or the
                user opts out. */}
            <button
              type="button"
              onClick={submitGoogle}
              disabled={googleBusy || sending}
              className="atithi-tap"
              style={{
                background: '#fff', color: '#3c4043',
                border: `1px solid ${T.border}`,
                borderRadius: 10, padding: '12px 14px',
                fontSize: 14, fontWeight: 600,
                cursor: googleBusy ? 'wait' : 'pointer',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                boxShadow: '0 1px 2px rgba(0,0,0,.05)',
                opacity: googleBusy ? 0.7 : 1,
                fontFamily: 'inherit',
              }}
            >
              {/* Inline Google "G" — the official 4-colour mark drawn
                  in SVG so we don't need to ship a logo asset. */}
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#4285F4" d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"/>
                <path fill="#34A853" d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"/>
                <path fill="#FBBC04" d="M11.69 28.18c-.44-1.32-.69-2.73-.69-4.18s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z"/>
                <path fill="#EA4335" d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7C13.42 14.62 18.27 10.75 24 10.75z"/>
              </svg>
              {googleBusy ? t('signInSending') : t('continueWithGoogle')}
            </button>
            {googleHint && (
              <div style={{
                fontSize: 11.5, color: T.ink2, fontWeight: 600,
                lineHeight: 1.5, padding: '8px 10px',
                background: T.bgSoft, border: `1px solid ${T.borderSoft}`,
                borderRadius: 8,
              }}>
                {googleHint}
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0' }}>
              <div style={{ flex: 1, height: 1, background: T.borderSoft }} />
              <span style={{ fontSize: 10, color: T.ink3, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase' }}>{lang === 'hi' ? 'या' : 'or'}</span>
              <div style={{ flex: 1, height: 1, background: T.borderSoft }} />
            </div>
            <Field
              label={t('emailAddress')}
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); if (error) setError(''); }}
              placeholder="you@example.com"
              error={error || ''}
            />
            <Btn variant="primary" full size="lg" disabled={sending || googleBusy} onClick={submit}>
              {sending ? t('signInSending') : t('sendMagicLink')}
            </Btn>
            <div style={{ fontSize: 11, color: T.ink3, textAlign: 'center', lineHeight: 1.5, marginTop: 2 }}>
              {t('signInDesc')}
            </div>
            {/* Demo opt-in — sets the per-browser demo flag so the
                visitor can try the app without creating an account.
                Useful both for prospective hoteliers and for showing
                features without touching anyone's real data. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '8px 0 4px' }}>
              <div style={{ flex: 1, height: 1, background: T.borderSoft }} />
              <span style={{ fontSize: 10, color: T.ink3, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase' }}>{lang === 'hi' ? 'या' : 'or'}</span>
              <div style={{ flex: 1, height: 1, background: T.borderSoft }} />
            </div>
            <button
              type="button"
              onClick={() => {
                // Enter the per-browser demo. Seed localStorage with the
                // demo property + bookings so the post-reload state init
                // has something to load (the init checks LS first; if it
                // finds an empty array there, it does NOT fall back to
                // BOOKINGS_SEED). Wipe any leftover account state from a
                // previous real-user session in the same browser so the
                // demo always starts from a clean Yatra dataset.
                try {
                  window.localStorage.setItem('atithi.demo.v1', 'true');
                  // Remove the gating flags + any user-customised state.
                  // The state-init defaults will re-seed from data.js's
                  // BOOKINGS_SEED + DEFAULT_PROPERTY on next mount.
                  const keysToReset = [
                    'atithi.bookings.v1', 'atithi.property.v1',
                    'atithi.customExtras.v1', 'atithi.rateOverrides.v1',
                    'atithi.cashCloses.v1', 'atithi.expenses.v1',
                    'atithi.onboarded.v1', 'atithi.bookingsSeeded.v1',
                    'atithi.extrasSeeded.v1', 'atithi.expensesSeeded.v1',
                  ];
                  keysToReset.forEach(k => window.localStorage.removeItem(k));
                } catch {}
                window.location.reload();
              }}
              className="atithi-tap"
              style={{
                background: T.card, color: T.primaryDk, border: `1.5px solid ${T.primary}`,
                borderRadius: 10, padding: '11px 14px', fontSize: 13, fontWeight: 700,
                cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              <Icon name="eye" size={14} color={T.primary} stroke={2.2} />
              {lang === 'hi' ? 'डेमो आज़माएं' : 'Try the demo'}
              <span style={{ fontSize: 11, opacity: 0.7 }}>→</span>
            </button>
            <div style={{ fontSize: 10.5, color: T.ink3, textAlign: 'center', lineHeight: 1.5 }}>
              {lang === 'hi'
                ? 'खाते के बिना सभी फीचर्स देखें। आपका डेटा सिर्फ़ इस ब्राउज़र में रहेगा।'
                : 'See every feature without creating an account. Data stays in this browser only.'}
            </div>
          </form>
        ) : (
          <div style={{
            background: T.card, border: `1px solid ${T.borderSoft}`, borderRadius: 14,
            padding: 22, textAlign: 'center',
            boxShadow: T.shadow,
          }}>
            <div style={{
              width: 48, height: 48, borderRadius: '50%',
              background: T.primaryLt, color: T.primaryDk,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: 12,
            }}>
              <Icon name="mail" size={22} stroke={2} />
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: T.ink, marginBottom: 6 }}>
              {t('checkInbox')}
            </div>
            <div style={{ fontSize: 12, color: T.ink2, lineHeight: 1.5 }}>
              {t('checkInboxDesc')}{' '}
              <strong style={{ color: T.ink, fontWeight: 700 }}>{email}</strong>.
            </div>
            <div style={{ fontSize: 11, color: T.ink3, marginTop: 12, lineHeight: 1.5 }}>
              {t('checkInboxTip')}
            </div>
            <button
              type="button"
              onClick={() => { setSent(false); setEmail(''); setError(''); }}
              style={{
                background: 'none', border: 'none', color: T.primary,
                fontSize: 12, fontWeight: 700, cursor: 'pointer',
                marginTop: 14, padding: 6,
              }}
            >{t('useDifferentEmail')}</button>
          </div>
        )}

        {/* Language switch — lets a Hindi-speaking owner sign in in their language */}
        {onChangeLang && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 22 }}>
            {[
              { id: 'en', label: 'English' },
              { id: 'hi', label: 'हिन्दी' },
            ].map(l => (
              <button
                key={l.id}
                type="button"
                onClick={() => onChangeLang(l.id)}
                style={{
                  border: 'none', background: 'none',
                  color: lang === l.id ? T.primary : T.ink3,
                  fontSize: 11, fontWeight: 700, cursor: 'pointer', padding: '4px 8px',
                  textDecoration: lang === l.id ? 'underline' : 'none',
                  textUnderlineOffset: 4,
                }}
              >{l.label}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

import { useState } from 'react';
import { T } from '../tokens.js';
import Btn from '../components/Btn.jsx';
import Field from '../components/Field.jsx';
import Icon from '../components/Icon.jsx';
import { signInWithEmail } from '../supabase.js';

// Email-magic-link sign-in. Phase 1 of the cloud migration: the app is
// gated behind this screen, but data still flows to/from localStorage
// underneath. Cloud reads/writes arrive in later chunks.
export default function SignIn({ t, lang, onChangeLang }) {
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

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
        padding: 20,
      }}
    >
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
            <Field
              label={t('emailAddress')}
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); if (error) setError(''); }}
              placeholder="you@example.com"
              error={error || ''}
            />
            <Btn variant="primary" full size="lg" disabled={sending} onClick={submit}>
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
                try { window.localStorage.setItem('atithi.demo.v1', 'true'); } catch {}
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

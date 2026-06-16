import { useState } from 'react';
import { supabase } from '../supabase.js';

const DEMO_CODE = (import.meta.env.VITE_DEMO_CODE || 'pahuna9').toLowerCase();
const WA_NUMBER = import.meta.env.VITE_CONTACT_WA || '';

function activateDemo() {
  window.location.href = window.location.pathname + '?demo=1';
}

// ─── Phone mockup ────────────────────────────────────────────────────────────
function PhoneMockup() {
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      {/* Glow behind phone */}
      <div style={{
        position: 'absolute', inset: '-20px',
        background: 'radial-gradient(ellipse 70% 50% at 50% 55%, rgba(217,119,6,0.35) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />
      <svg viewBox="0 0 220 430" fill="none" xmlns="http://www.w3.org/2000/svg"
        style={{ width: 200, height: 'auto', position: 'relative', filter: 'drop-shadow(0 24px 48px rgba(0,0,0,0.5))' }}>
        {/* Phone body */}
        <rect x="2" y="2" width="216" height="426" rx="34" fill="#111" stroke="#2a2a2a" strokeWidth="2"/>
        {/* Screen bg */}
        <rect x="10" y="12" width="200" height="406" rx="26" fill="#f8f8f8"/>
        {/* Pill notch */}
        <rect x="80" y="20" width="60" height="13" rx="6.5" fill="#111"/>

        {/* App top bar */}
        <rect x="10" y="12" width="200" height="54" rx="26" fill="#fff"/>
        <rect x="10" y="40" width="200" height="26" fill="#fff"/>
        <text x="26" y="55" fontSize="11" fontWeight="800" fill="#1a1a1a" fontFamily="sans-serif">AtithiBook</text>
        <rect x="162" y="43" width="36" height="16" rx="8" fill="#d97706"/>
        <text x="171" y="54" fontSize="7" fontWeight="700" fill="#fff" fontFamily="sans-serif">LIVE</text>

        {/* Divider */}
        <line x1="10" y1="67" x2="210" y2="67" stroke="#f0f0f0" strokeWidth="1"/>

        {/* Dashboard greeting */}
        <text x="26" y="88" fontSize="11" fontWeight="800" fill="#1a1a1a" fontFamily="sans-serif">Good morning 👋</text>
        <text x="26" y="101" fontSize="8" fill="#999" fontFamily="sans-serif">Tuesday, 16 June 2026</text>

        {/* KPI cards */}
        <rect x="20" y="110" width="84" height="46" rx="10" fill="#fff8ed"/>
        <text x="30" y="126" fontSize="7" fill="#a05000" fontFamily="sans-serif">Occupancy</text>
        <text x="30" y="146" fontSize="16" fontWeight="800" fill="#d97706" fontFamily="sans-serif">78%</text>

        <rect x="114" y="110" width="76" height="46" rx="10" fill="#f0fdf4"/>
        <text x="124" y="126" fontSize="7" fill="#166534" fontFamily="sans-serif">Income today</text>
        <text x="124" y="146" fontSize="13" fontWeight="800" fill="#16a34a" fontFamily="sans-serif">₹18,400</text>

        {/* Section label */}
        <text x="26" y="174" fontSize="9" fontWeight="700" fill="#1a1a1a" fontFamily="sans-serif">Booking Diary</text>

        {/* Day columns */}
        {['15','16','17','18','19','20'].map((d, i) => (
          <text key={d} x={68 + i * 24} y="188" fontSize="7" fill="#bbb" textAnchor="middle" fontFamily="sans-serif">{d}</text>
        ))}

        {/* Room row 1 */}
        <text x="20" y="205" fontSize="7" fill="#666" fontFamily="sans-serif">Deluxe</text>
        <rect x="56" y="196" width="72" height="14" rx="4" fill="#16a34a"/>
        <text x="63" y="206" fontSize="6" fill="#fff" fontWeight="600" fontFamily="sans-serif">Sharma · 3N</text>
        <rect x="132" y="196" width="46" height="14" rx="4" fill="#f59e0b"/>
        <text x="140" y="206" fontSize="6" fill="#fff" fontWeight="600" fontFamily="sans-serif">Hold</text>

        {/* Room row 2 */}
        <text x="20" y="223" fontSize="7" fill="#666" fontFamily="sans-serif">Luxury</text>
        <rect x="68" y="214" width="96" height="14" rx="4" fill="#3b82f6"/>
        <text x="75" y="224" fontSize="6" fill="#fff" fontWeight="600" fontFamily="sans-serif">Patel Family · 5N</text>

        {/* Room row 3 */}
        <text x="20" y="241" fontSize="7" fill="#666" fontFamily="sans-serif">Pool</text>
        <rect x="80" y="232" width="54" height="14" rx="4" fill="#8b5cf6"/>
        <text x="87" y="242" fontSize="6" fill="#fff" fontWeight="600" fontFamily="sans-serif">Gupta · 2N</text>

        {/* Room row 4 */}
        <text x="20" y="259" fontSize="7" fill="#666" fontFamily="sans-serif">Bathtub</text>
        <rect x="56" y="250" width="42" height="14" rx="4" fill="#ec4899"/>
        <text x="62" y="260" fontSize="6" fill="#fff" fontWeight="600" fontFamily="sans-serif">Singh</text>

        {/* Divider */}
        <line x1="10" y1="274" x2="210" y2="274" stroke="#f0f0f0" strokeWidth="1"/>

        {/* Pending payment */}
        <text x="26" y="290" fontSize="9" fontWeight="700" fill="#1a1a1a" fontFamily="sans-serif">Pending payments</text>
        <rect x="20" y="298" width="180" height="38" rx="9" fill="#fff" stroke="#f0f0f0" strokeWidth="1"/>
        <text x="32" y="313" fontSize="8" fontWeight="700" fill="#1a1a1a" fontFamily="sans-serif">Sharma, A.</text>
        <text x="32" y="326" fontSize="7" fill="#999" fontFamily="sans-serif">Balance due · Check-out 19 Jun</text>
        <text x="192" y="321" fontSize="11" fontWeight="800" fill="#d97706" textAnchor="end" fontFamily="sans-serif">₹4,500</text>

        {/* Tab bar */}
        <rect x="10" y="376" width="200" height="42" fill="#fff" stroke="#f0f0f0" strokeWidth="1"/>
        <rect x="10" y="376" width="200" height="8" fill="#fff"/>
        <rect x="10" y="404" width="200" height="14" rx="0" fill="#fff"/>
        <rect x="10" y="404" width="200" height="14" rx="16" fill="#fff"/>

        {/* Tab icons */}
        <circle cx="46" cy="392" r="8" fill="#fff3e0"/>
        <circle cx="46" cy="392" r="4" fill="#d97706"/>
        <circle cx="94" cy="392" r="5" fill="#f0f0f0"/>
        <circle cx="126" cy="392" r="5" fill="#f0f0f0"/>
        <circle cx="158" cy="392" r="5" fill="#f0f0f0"/>
        <circle cx="182" cy="392" r="5" fill="#f0f0f0"/>

        {/* Home indicator */}
        <rect x="80" y="412" width="60" height="4" rx="2" fill="#1a1a1a" opacity="0.2"/>
      </svg>
    </div>
  );
}

// ─── How it works ─────────────────────────────────────────────────────────────
const STEPS = [
  {
    n: '01',
    title: 'Set up your property',
    desc: 'Add your rooms, rates, and a payment QR. Your direct booking link goes live immediately — no technical setup needed.',
  },
  {
    n: '02',
    title: 'Bookings come to you',
    desc: 'Direct from guests or via OTAs. Every reservation lands in one calendar. No copy-pasting, no double-bookings.',
  },
  {
    n: '03',
    title: 'Run it from anywhere',
    desc: 'Update rates, add payments, issue invoices, and manage your team — all from your phone, wherever you are.',
  },
];

// ─── Features ─────────────────────────────────────────────────────────────────
const FEATURES = [
  { icon: '📅', title: 'Booking Diary',        desc: 'A live Gantt calendar for every room. Drag to move bookings, tap to create new ones.' },
  { icon: '📡', title: 'OTA Sync',             desc: 'Live two-way sync with MakeMyTrip, Booking.com, Agoda, Goibibo, and Airbnb.' },
  { icon: '🔗', title: 'Direct Booking Link',  desc: 'Your own booking page. Guests book straight from your website — zero OTA commission.' },
  { icon: '📊', title: 'Rates & Seasons',      desc: 'Set weekend rules, named seasons, rate plans, and per-day overrides in seconds.' },
  { icon: '🧾', title: 'GST Invoicing',        desc: 'Issue tax invoices, export a clean register to your CA. Books-keeper built in.' },
  { icon: '👥', title: 'Team Management',      desc: 'Invite staff, assign roles, and control exactly what each person can see or do.' },
];

// ─── Pricing ──────────────────────────────────────────────────────────────────
const PLANS = [
  {
    name: 'Engine',
    tag: 'Core',
    desc: 'Everything you need to run your property day-to-day.',
    color: '#d97706',
    features: ['Booking diary & calendar', 'Room & rate management', 'Direct booking link', 'Guest profiles & history', 'Reports & analytics', 'Team management', '24/7 cloud sync'],
  },
  {
    name: 'Channels',
    tag: 'Most popular',
    desc: 'Engine, plus live two-way sync with every major OTA.',
    color: '#2563eb',
    features: ['Everything in Engine', 'OTA integration (MMT, Booking.com, Agoda, Goibibo, Airbnb)', 'Live inventory sync', 'Automated rate push', 'Booking ingestion from OTAs', 'Cancellation sync'],
    highlight: true,
  },
  {
    name: 'Invoicing',
    tag: 'Full suite',
    desc: 'Channels, plus complete invoicing and CA handoff tools.',
    color: '#7c3aed',
    features: ['Everything in Channels', 'GST-ready tax invoices', 'Invoice register', 'One-tap CA email export', 'Expense tracking', 'Multi-account day close-out'],
  },
];

// ─── Demo gate sheet ──────────────────────────────────────────────────────────
function DemoSheet({ onClose }) {
  const [step, setStep]           = useState('email');
  const [email, setEmail]         = useState('');
  const [codeEmail, setCodeEmail] = useState('');
  const [code, setCode]           = useState('');
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');

  async function handleEmailSubmit(e) {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;
    setSaving(true);
    try { await supabase.from('leads').insert({ email: trimmed, source: 'demo_gate' }); } catch (_) {}
    setSaving(false);
    setCodeEmail(trimmed);
    setStep('whatsapp');
  }

  function handleCodeSubmit(e) {
    e.preventDefault();
    if (code.trim().toLowerCase() === DEMO_CODE) {
      activateDemo();
    } else {
      setError('Incorrect code. WhatsApp us to get the right one.');
    }
  }

  const waMsg  = encodeURIComponent(`Hi! I'd like to try AtithiBook. My email is ${codeEmail || email}.`);
  const waHref = WA_NUMBER
    ? `https://wa.me/${WA_NUMBER.replace(/\D/g, '')}?text=${waMsg}`
    : `https://wa.me/?text=${waMsg}`;

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 300,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'flex-end',
      }}
    >
      <div style={{
        background: '#fff', borderRadius: '22px 22px 0 0',
        padding: '32px 24px 44px',
        width: '100%', maxWidth: 480, margin: '0 auto',
        position: 'relative', boxSizing: 'border-box',
      }}>
        <button onClick={onClose} style={{
          position: 'absolute', top: 14, right: 18,
          background: 'none', border: 'none', fontSize: 20, color: '#ccc', cursor: 'pointer',
        }}>✕</button>

        {step === 'email' && (
          <form onSubmit={handleEmailSubmit}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>👋</div>
            <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 6, color: '#1a1a1a' }}>Get demo access</h2>
            <p style={{ color: '#666', fontSize: 14, marginBottom: 22, lineHeight: 1.6 }}>
              Enter your email to get started. We'll tell you how to get your access code.
            </p>
            <input
              type="email" required autoFocus
              placeholder="your@email.com"
              value={email} onChange={e => setEmail(e.target.value)}
              style={{
                width: '100%', padding: '12px 14px',
                border: '1px solid #e5e7eb', borderRadius: 10,
                fontSize: 15, marginBottom: 14, boxSizing: 'border-box', outline: 'none',
              }}
            />
            <button type="submit" disabled={saving} style={{
              background: '#d97706', color: '#fff', border: 'none',
              borderRadius: 10, padding: '13px', fontSize: 15, fontWeight: 700,
              cursor: saving ? 'not-allowed' : 'pointer', width: '100%', opacity: saving ? 0.7 : 1,
            }}>
              {saving ? 'Saving…' : 'Continue →'}
            </button>
          </form>
        )}

        {step === 'whatsapp' && (
          <form onSubmit={handleCodeSubmit}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>✅</div>
            <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 6, color: '#1a1a1a' }}>One more step</h2>
            <p style={{ color: '#555', fontSize: 14, lineHeight: 1.6, marginBottom: 20 }}>
              WhatsApp us to get your demo access code. We'll get back to you shortly.
            </p>
            <a href={waHref} target="_blank" rel="noopener noreferrer" style={{
              display: 'block', background: '#25D366', color: '#fff',
              borderRadius: 10, padding: '13px', fontSize: 15, fontWeight: 700,
              textAlign: 'center', textDecoration: 'none', marginBottom: 28,
            }}>WhatsApp us →</a>

            <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 22 }}>
              <p style={{ color: '#999', fontSize: 13, marginBottom: 12 }}>Already have your code? Enter it below.</p>
              <input
                type="email" required placeholder="Your email"
                value={codeEmail} onChange={e => setCodeEmail(e.target.value)}
                style={{
                  width: '100%', padding: '11px 14px',
                  border: '1px solid #e5e7eb', borderRadius: 10,
                  fontSize: 14, marginBottom: 10, boxSizing: 'border-box', outline: 'none',
                }}
              />
              <input
                type="text" required placeholder="Access code"
                value={code} onChange={e => { setCode(e.target.value); setError(''); }}
                autoCapitalize="none"
                style={{
                  width: '100%', padding: '11px 14px',
                  border: `1px solid ${error ? '#ef4444' : '#e5e7eb'}`,
                  borderRadius: 10, fontSize: 14,
                  marginBottom: error ? 6 : 12, boxSizing: 'border-box', outline: 'none',
                }}
              />
              {error && <p style={{ color: '#ef4444', fontSize: 12, marginBottom: 12 }}>{error}</p>}
              <button type="submit" style={{
                background: '#1a1a1a', color: '#fff', border: 'none',
                borderRadius: 10, padding: '13px', fontSize: 14, fontWeight: 700,
                cursor: 'pointer', width: '100%',
              }}>Start Demo →</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function Landing({ go }) {
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <div style={{ fontFamily: "'Geist', sans-serif", color: '#1a1a1a', background: '#fff' }}>

      {/* ══ HERO ══ */}
      <div style={{
        background: 'linear-gradient(150deg, #1c0e06 0%, #2a1308 55%, #161210 100%)',
        color: '#fff',
        paddingBottom: 64,
      }}>
        {/* Nav */}
        <nav style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 22px', height: 58, maxWidth: 1100, margin: '0 auto',
        }}>
          <span style={{ fontWeight: 800, fontSize: 17, letterSpacing: -0.5, color: '#fff' }}>AtithiBook</span>
          <button onClick={() => go('signin')} style={{
            background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: 8, padding: '7px 18px',
            fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#fff',
          }}>Sign In</button>
        </nav>

        {/* Hero content */}
        <div style={{ padding: '48px 24px 0', textAlign: 'center', maxWidth: 560, margin: '0 auto' }}>
          <div style={{
            display: 'inline-block',
            background: 'rgba(217,119,6,0.2)', color: '#fbbf24',
            border: '1px solid rgba(217,119,6,0.3)',
            borderRadius: 100, padding: '4px 14px',
            fontSize: 12, fontWeight: 600, marginBottom: 24, letterSpacing: 0.3,
          }}>
            The complete hotel management platform
          </div>

          <h1 style={{
            fontSize: 40, fontWeight: 800, lineHeight: 1.1,
            letterSpacing: -1.5, marginBottom: 18, color: '#fff',
          }}>
            Your hotel, fully managed.<br />
            <span style={{ color: '#f59e0b' }}>From one screen.</span>
          </h1>

          <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.65)', lineHeight: 1.7, marginBottom: 36 }}>
            Bookings, rates, OTA sync, and invoicing —
            the complete platform for modern hospitality.
          </p>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 56 }}>
            <button onClick={() => setSheetOpen(true)} style={{
              background: '#d97706', color: '#fff', border: 'none',
              borderRadius: 12, padding: '14px 32px',
              fontSize: 15, fontWeight: 700, cursor: 'pointer',
            }}>Try Demo</button>
            <button onClick={() => go('signin')} style={{
              background: 'rgba(255,255,255,0.1)', color: '#fff',
              border: '1px solid rgba(255,255,255,0.25)',
              borderRadius: 12, padding: '14px 28px',
              fontSize: 15, fontWeight: 600, cursor: 'pointer',
            }}>Sign In →</button>
          </div>

          {/* Phone mockup */}
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <PhoneMockup />
          </div>
        </div>
      </div>

      {/* ══ HOW IT WORKS ══ */}
      <div style={{ background: '#fafaf8', padding: '72px 24px' }}>
        <div style={{ maxWidth: 560, margin: '0 auto' }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: '#d97706', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10, textAlign: 'center' }}>
            How it works
          </p>
          <h2 style={{ fontSize: 30, fontWeight: 800, letterSpacing: -0.8, marginBottom: 48, textAlign: 'center', lineHeight: 1.2 }}>
            Up and running<br />in under an hour.
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
            {STEPS.map(s => (
              <div key={s.n} style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 12,
                  background: '#fff', border: '1px solid #e5e7eb',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 800, fontSize: 12, color: '#d97706',
                  flexShrink: 0, letterSpacing: 0.5,
                }}>{s.n}</div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>{s.title}</div>
                  <div style={{ color: '#666', fontSize: 14, lineHeight: 1.65 }}>{s.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ══ FEATURES ══ */}
      <div style={{ background: '#fff', padding: '72px 24px' }}>
        <div style={{ maxWidth: 560, margin: '0 auto' }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: '#d97706', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10, textAlign: 'center' }}>
            Features
          </p>
          <h2 style={{ fontSize: 30, fontWeight: 800, letterSpacing: -0.8, marginBottom: 40, textAlign: 'center', lineHeight: 1.2 }}>
            Everything your<br />property needs.
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {FEATURES.map(f => (
              <div key={f.title} style={{
                background: '#fafaf8', borderRadius: 14,
                padding: '18px 16px', border: '1px solid #f0f0f0',
              }}>
                <div style={{ fontSize: 24, marginBottom: 8 }}>{f.icon}</div>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 5 }}>{f.title}</div>
                <div style={{ color: '#777', fontSize: 12, lineHeight: 1.55 }}>{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ══ PRICING ══ */}
      <div style={{ background: '#0f0f0f', padding: '72px 24px', color: '#fff' }}>
        <div style={{ maxWidth: 560, margin: '0 auto' }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: '#f59e0b', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10, textAlign: 'center' }}>
            Plans
          </p>
          <h2 style={{ fontSize: 30, fontWeight: 800, letterSpacing: -0.8, marginBottom: 10, textAlign: 'center', lineHeight: 1.2, color: '#fff' }}>
            Start simple.<br />Scale as you grow.
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, textAlign: 'center', marginBottom: 44 }}>
            Every plan includes 24/7 cloud sync and full mobile access.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {PLANS.map(p => (
              <div key={p.name} style={{
                borderRadius: 16,
                border: p.highlight ? `1.5px solid ${p.color}` : '1px solid rgba(255,255,255,0.1)',
                padding: '24px 22px',
                background: p.highlight ? 'rgba(37,99,235,0.08)' : 'rgba(255,255,255,0.04)',
                position: 'relative',
              }}>
                {p.highlight && (
                  <div style={{
                    position: 'absolute', top: -11, left: 22,
                    background: p.color, color: '#fff',
                    fontSize: 10, fontWeight: 700, letterSpacing: 0.8,
                    padding: '3px 10px', borderRadius: 100,
                    textTransform: 'uppercase',
                  }}>{p.tag}</div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <span style={{ fontWeight: 800, fontSize: 18, color: '#fff' }}>{p.name}</span>
                  {!p.highlight && (
                    <span style={{
                      fontSize: 10, fontWeight: 700, color: p.color,
                      border: `1px solid ${p.color}33`, borderRadius: 100,
                      padding: '2px 8px', letterSpacing: 0.5,
                    }}>{p.tag}</span>
                  )}
                </div>
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', marginBottom: 18, lineHeight: 1.5 }}>{p.desc}</p>
                <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 22px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {p.features.map(f => (
                    <li key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: 'rgba(255,255,255,0.8)' }}>
                      <span style={{ color: p.color, fontWeight: 700, flexShrink: 0 }}>✓</span>
                      {f}
                    </li>
                  ))}
                </ul>
                <button onClick={() => setSheetOpen(true)} style={{
                  width: '100%', padding: '12px',
                  background: p.highlight ? p.color : 'rgba(255,255,255,0.08)',
                  color: '#fff', border: p.highlight ? 'none' : '1px solid rgba(255,255,255,0.15)',
                  borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer',
                }}>
                  Get started →
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ══ FOOTER ══ */}
      <footer style={{ background: '#0a0a0a', padding: '28px 24px', textAlign: 'center', borderTop: '1px solid #1f1f1f' }}>
        <div style={{ marginBottom: 12 }}>
          <button onClick={() => go('terms')} style={{ background: 'none', border: 'none', color: '#555', fontSize: 12, cursor: 'pointer', marginRight: 24 }}>Terms of Service</button>
          <button onClick={() => go('privacy')} style={{ background: 'none', border: 'none', color: '#555', fontSize: 12, cursor: 'pointer' }}>Privacy Policy</button>
        </div>
        <div style={{ color: '#333', fontSize: 11, lineHeight: 1.7 }}>
          © 2026 AtithiBook. All rights reserved.<br />
          AtithiBook is booking management software. Properties are independently responsible for their services and guests.
        </div>
      </footer>

      {/* ══ DEMO GATE ══ */}
      {sheetOpen && <DemoSheet onClose={() => setSheetOpen(false)} />}
    </div>
  );
}

import { useState, useEffect } from 'react';
import { supabase } from '../supabase.js';

// The app normally lives inside a phone frame (#root is capped at 430px on
// phones / tablets, 820px on desktop). A marketing landing page should break
// out of that frame and go full-bleed like a real website. We add a body class
// while mounted — the CSS override lives in LP_CSS so it's scoped to Landing
// and torn down automatically on unmount — and also lift #root's inline
// height/overflow so the page scrolls naturally. Everything is restored on
// unmount so the rest of the app keeps its phone frame.
function useFullBleed() {
  useEffect(() => {
    const root = document.getElementById('root');
    const prev = root ? { overflow: root.style.overflow, height: root.style.height } : null;
    if (root) {
      root.style.overflow = 'auto';
      root.style.height = 'auto';
    }
    document.body.classList.add('atithi-landing');
    return () => {
      if (root && prev) {
        root.style.overflow = prev.overflow;
        root.style.height = prev.height;
      }
      document.body.classList.remove('atithi-landing');
    };
  }, []);
}

const DEMO_CODE = (import.meta.env.VITE_DEMO_CODE || 'pahuna9').toLowerCase();
const WA_NUMBER = import.meta.env.VITE_CONTACT_WA || '';

function activateDemo() {
  window.location.href = window.location.pathname + '?demo=1';
}

// ─── Palette (warm, light) ────────────────────────────────────────────────────
const C = {
  ink:    '#1c1612',   // headlines — warm near-black
  body:   '#5f574e',   // paragraph text
  muted:  '#9a9088',   // captions
  amber:  '#d97706',   // brand
  amberD: '#b45309',
  amberT: '#fff4e6',   // soft orange tile bg
  line:   '#efe8df',   // hairline borders
  cream:  '#faf6f0',   // alternating section bg
  card:   '#ffffff',
};

// ─── Gradients (kept very subtle — warmth & depth, never loud) ────────────────
// Each section gets a faint warm wash + a soft amber "glow" so the page reads
// as crafted rather than flat, while staying light and calm.
const G = {
  page:   'linear-gradient(180deg, #fdfbf8 0%, #fbf6ef 100%)',
  hero:   'radial-gradient(100% 72% at 50% -8%, #fff1db 0%, rgba(255,241,219,0) 56%), radial-gradient(78% 60% at 88% 6%, #fdeadd 0%, rgba(253,234,221,0) 52%), #fdfbf8',
  white:  'radial-gradient(72% 52% at 50% 0%, #fdf3e6 0%, rgba(253,243,230,0) 60%), linear-gradient(180deg, #ffffff 0%, #fdf9f2 100%)',
  cream:  'radial-gradient(64% 46% at 50% 4%, #fdf0df 0%, rgba(253,240,223,0) 58%), linear-gradient(180deg, #faf6f0 0%, #f6eee4 100%)',
  priceW: 'radial-gradient(78% 62% at 50% 108%, #fdf2e4 0%, rgba(253,242,228,0) 60%), linear-gradient(180deg, #fffdfb 0%, #fbf6ee 100%)',
  footer: 'linear-gradient(180deg, #f7f1ea 0%, #f3ece2 100%)',
  tile:   'linear-gradient(135deg, #fff3e2 0%, #ffe6cb 100%)',
  cardSurf: 'linear-gradient(180deg, #ffffff 0%, #fdfaf4 100%)',
  planHi: 'linear-gradient(180deg, #fffaf2 0%, #fff3e3 100%)',
  btn:    'linear-gradient(135deg, #ea8a0c 0%, #d27406 100%)',
  cta:    'radial-gradient(90% 130% at 18% -10%, rgba(255,255,255,0.24) 0%, rgba(255,255,255,0) 52%), linear-gradient(135deg, #d97706 0%, #ea8a0c 55%, #f59e0b 100%)',
};

// ─── Inline icons (stroke, inherit colour) ────────────────────────────────────
const Svg = (props) => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none"
    stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...props} />
);
const IcCalendar = () => <Svg><rect x="3" y="4.5" width="18" height="16" rx="2.6" /><path d="M3 9.2h18M8 2.6v3.6M16 2.6v3.6" /><path d="M7.2 13h2M11 13h2M14.8 13h2M7.2 16.4h2M11 16.4h2" /></Svg>;
const IcSync     = () => <Svg><path d="M4 9.5a8 8 0 0 1 13.4-3.6L20 8.2" /><path d="M20 3.6v4.6h-4.6" /><path d="M20 14.5a8 8 0 0 1-13.4 3.6L4 15.8" /><path d="M4 20.4v-4.6h4.6" /></Svg>;
const IcLink     = () => <Svg><path d="M9.2 14.8 14.8 9.2" /><path d="M11.4 6.6 12.7 5.3a4 4 0 0 1 5.7 5.7l-1.9 1.9" /><path d="M12.6 17.4l-1.3 1.3a4 4 0 0 1-5.7-5.7l1.9-1.9" /></Svg>;
const IcMoney    = () => <Svg><rect x="2.5" y="6" width="19" height="12" rx="2.6" /><circle cx="12" cy="12" r="2.7" /><path d="M5.8 12h.01M18.2 12h.01" /></Svg>;
const IcTag      = () => <Svg><path d="M20.6 13.4 13.4 20.6a1.7 1.7 0 0 1-2.4 0l-7-7A1.7 1.7 0 0 1 3.5 12.4V5.2A1.7 1.7 0 0 1 5.2 3.5h7.2c.45 0 .88.18 1.2.5l7 7a1.7 1.7 0 0 1 0 2.4Z" /><circle cx="8" cy="8" r="1.5" fill="currentColor" stroke="none" /></Svg>;
const IcDoc      = () => <Svg><path d="M6.5 3h7l4.5 4.5v12A1.5 1.5 0 0 1 16.5 21h-9A1.5 1.5 0 0 1 6 19.5v-15A1.5 1.5 0 0 1 6.5 3Z" /><path d="M13 3v5h5" /><path d="M9 13h6M9 16.4h4" /></Svg>;

// Icons + plan identity are language-independent; the words live in TXT below,
// matched up by position.
const FEATURE_ICONS = [IcCalendar, IcSync, IcLink, IcMoney, IcTag, IcDoc];
const PLAN_META = [
  { name: 'Engine',    highlight: false },
  { name: 'Channels',  highlight: true  },
  { name: 'Invoicing', highlight: false },
];

// ─── Copy (EN + Hinglish) ─────────────────────────────────────────────────────
// Hindi follows the app's house style: common English loanwords written in
// Devanagari (बुकिंग, पेमेंट, कैलेंडर), not formal/pure Hindi. Plan names
// (Engine / Channels / Invoicing) stay in English to match the app UI.
const TXT = {
  en: {
    navSignIn: 'Sign in',
    navTry: 'Try free',
    badge: 'Made for Indian hotels, homestays & camps',
    h1a: 'Run your hotel', h1b: 'from your ', h1c: 'phone.',
    heroSub: 'Every booking, payment and guest in one simple place — so you can spend less time on paperwork and more time looking after your guests.',
    ctaDemo: 'Try the demo',
    ctaSignIn: 'Sign in →',
    reassure: ['Free to try', 'No setup fees', 'Works on any phone'],
    howEyebrow: 'How it works',
    howTitle: 'Up and running in an afternoon.',
    howSub: 'No installation, no manuals, no waiting on anyone. Three simple steps and you’re live.',
    steps: [
      { title: 'Add your property', desc: 'Enter your rooms, rates and a payment QR. It takes a few minutes — no tech skills, no training.' },
      { title: 'Share your link',   desc: 'Put your booking link on WhatsApp, Instagram or your website. Guests start booking you directly.' },
      { title: 'Run it from anywhere', desc: 'Track bookings, collect payments and send invoices — all from your phone, wherever you are.' },
    ],
    featEyebrow: 'What you get',
    featTitle: 'Everything your front desk does — only easier.',
    features: [
      { title: 'One calendar for every room', desc: 'See who’s arriving, who’s staying, and which rooms are free — all on one screen. Tap any open day to add a booking.' },
      { title: 'Bookings from every site', desc: 'Reservations from MakeMyTrip, Booking.com, Agoda and more land in your calendar on their own. No more double-bookings.' },
      { title: 'Your own booking page', desc: 'Share one link and let guests book you directly — with zero commission to anyone in between.' },
      { title: 'Get paid on time', desc: 'Track every balance, send a friendly WhatsApp reminder, and let guests pay in seconds with your own UPI QR.' },
      { title: 'Pricing on autopilot', desc: 'Set your weekend rates, festival seasons and offers once. AtithiBook applies them for you, every single day.' },
      { title: 'GST invoices, sorted', desc: 'Create proper tax invoices and hand a clean, ready-to-file summary to your accountant in a single tap.' },
    ],
    planEyebrow: 'Simple plans',
    planTitle: 'Start simple. Grow when you’re ready.',
    planSub: 'Every plan keeps your data safe in the cloud and works on any phone. Pick what fits today — upgrade anytime.',
    plans: [
      { tag: 'The essentials', desc: 'Everything you need to run your property day to day.', features: ['Booking calendar for every room', 'Rooms, rates & guest history', 'Your own direct booking page', 'Payments & balance tracking', 'Reports you can actually read', 'Add your team, set what they see'] },
      { tag: 'Most popular', desc: 'Everything in Engine, plus automatic sync with the big travel sites.', features: ['Everything in Engine', 'Connect MakeMyTrip, Booking.com, Agoda, Goibibo & Airbnb', 'Your rooms & rates update everywhere at once', 'OTA bookings arrive on their own', 'No more manual copy-pasting'] },
      { tag: 'For the books', desc: 'Everything in Channels, plus GST invoicing and accountant handoff.', features: ['Everything in Channels', 'GST-ready tax invoices', 'A tidy invoice register', 'One-tap send to your accountant', 'Daily expenses & cash close'] },
    ],
    getStarted: 'Get started →',
    ctaTitle: 'Ready to get organised?',
    ctaSub: 'Try AtithiBook with a sample property and see how easy running your hotel can be.',
    terms: 'Terms of Service',
    privacy: 'Privacy Policy',
    footerTagline: '© 2026 AtithiBook · Booking software for independent hotels.',
    footerDisclaimer: 'AtithiBook provides the software. Properties remain independently responsible for their services and guests.',
    demo: {
      emailTitle: 'See it with your own eyes',
      emailDesc: 'Pop in your email and we’ll send you a demo access code so you can explore the whole app — no commitment.',
      emailPh: 'your@email.com',
      cont: 'Continue →', saving: 'Saving…',
      waTitle: 'One quick step',
      waDesc: 'Message us on WhatsApp and we’ll send your access code straight back.',
      waBtn: 'Message us on WhatsApp →',
      haveCode: 'Already have your code? Enter it below.',
      yourEmail: 'Your email', codePh: 'Access code',
      startDemo: 'Start the demo →',
      badCode: 'Incorrect code. WhatsApp us to get the right one.',
    },
  },
  hi: {
    navSignIn: 'साइन इन',
    navTry: 'फ्री आज़माएं',
    badge: 'भारतीय होटल, होमस्टे और कैंप के लिए',
    h1a: 'अपना होटल', h1b: 'फ़ोन से ', h1c: 'चलाएं।',
    heroSub: 'हर बुकिंग, पेमेंट और गेस्ट एक ही आसान जगह पर — ताकि आप पेपरवर्क में कम और मेहमानों की सेवा में ज़्यादा समय दें।',
    ctaDemo: 'डेमो आज़माएं',
    ctaSignIn: 'साइन इन →',
    reassure: ['फ्री में आज़माएं', 'कोई सेटअप फीस नहीं', 'किसी भी फ़ोन पर'],
    howEyebrow: 'कैसे काम करता है',
    howTitle: 'कुछ ही घंटों में शुरू।',
    howSub: 'न कोई इंस्टॉलेशन, न मैनुअल, न किसी का इंतज़ार। तीन आसान स्टेप और आप लाइव।',
    steps: [
      { title: 'अपनी प्रॉपर्टी जोड़ें', desc: 'अपने रूम, रेट और एक पेमेंट QR डालें। बस कुछ मिनट — न टेक्निकल स्किल, न ट्रेनिंग।' },
      { title: 'अपना लिंक शेयर करें',   desc: 'अपना बुकिंग लिंक WhatsApp, Instagram या वेबसाइट पर डालें। गेस्ट सीधे आपसे बुकिंग करें।' },
      { title: 'कहीं से भी चलाएं', desc: 'बुकिंग ट्रैक करें, पेमेंट लें और इनवॉइस भेजें — सब अपने फ़ोन से, चाहे आप कहीं भी हों।' },
    ],
    featEyebrow: 'आपको क्या मिलता है',
    featTitle: 'जो आपका फ्रंट डेस्क करता है — बस और आसान।',
    features: [
      { title: 'हर रूम के लिए एक कैलेंडर', desc: 'देखें कौन आ रहा है, कौन रुका है और कौन से रूम खाली हैं — सब एक स्क्रीन पर। खाली दिन पर टैप करके बुकिंग जोड़ें।' },
      { title: 'हर साइट से बुकिंग', desc: 'MakeMyTrip, Booking.com, Agoda और बाकी साइट्स की बुकिंग खुद-ब-खुद आपके कैलेंडर में आएं। अब कोई डबल-बुकिंग नहीं।' },
      { title: 'अपना खुद का बुकिंग पेज', desc: 'एक लिंक शेयर करें और गेस्ट सीधे आपसे बुकिंग करें — बीच में किसी को कोई कमीशन नहीं।' },
      { title: 'समय पर पेमेंट पाएं', desc: 'हर बैलेंस ट्रैक करें, WhatsApp पर रिमाइंडर भेजें, और गेस्ट आपके UPI QR से सेकंडों में पेमेंट करें।' },
      { title: 'प्राइसिंग ऑटोपायलट पर', desc: 'वीकेंड रेट, फेस्टिवल सीज़न और ऑफर एक बार सेट करें। AtithiBook उन्हें रोज़ अपने आप लगा देगा।' },
      { title: 'GST इनवॉइस, सब सेट', desc: 'सही टैक्स इनवॉइस बनाएं और अपने अकाउंटेंट को एक टैप में फाइल-रेडी समरी भेजें।' },
    ],
    planEyebrow: 'आसान प्लान',
    planTitle: 'आसान शुरुआत करें। तैयार हों तो बढ़ें।',
    planSub: 'हर प्लान आपका डेटा क्लाउड में सुरक्षित रखे और किसी भी फ़ोन पर चले। आज जो ठीक लगे चुनें — कभी भी अपग्रेड करें।',
    plans: [
      { tag: 'ज़रूरी चीज़ें', desc: 'रोज़मर्रा प्रॉपर्टी चलाने के लिए ज़रूरी सब कुछ।', features: ['हर रूम के लिए बुकिंग कैलेंडर', 'रूम, रेट और गेस्ट हिस्ट्री', 'अपना डायरेक्ट बुकिंग पेज', 'पेमेंट और बैलेंस ट्रैकिंग', 'ऐसी रिपोर्ट जो आसानी से समझ आएं', 'अपनी टीम जोड़ें, तय करें वो क्या देखें'] },
      { tag: 'सबसे लोकप्रिय', desc: 'Engine का सब कुछ, साथ में बड़ी ट्रैवल साइट्स से ऑटोमैटिक सिंक।', features: ['Engine का सब कुछ', 'MakeMyTrip, Booking.com, Agoda, Goibibo और Airbnb जोड़ें', 'आपके रूम और रेट एक साथ हर जगह अपडेट हों', 'OTA बुकिंग खुद-ब-खुद आ जाएं', 'अब मैनुअल कॉपी-पेस्ट नहीं'] },
      { tag: 'हिसाब-किताब के लिए', desc: 'Channels का सब कुछ, साथ में GST इनवॉइसिंग और अकाउंटेंट हैंडऑफ।', features: ['Channels का सब कुछ', 'GST-रेडी टैक्स इनवॉइस', 'साफ-सुथरा इनवॉइस रजिस्टर', 'एक टैप में अकाउंटेंट को भेजें', 'रोज़ का खर्च और कैश क्लोज़'] },
    ],
    getStarted: 'शुरू करें →',
    ctaTitle: 'अपना काम आसान बनाने के लिए तैयार?',
    ctaSub: 'AtithiBook को एक सैंपल प्रॉपर्टी के साथ आज़माएं और देखें होटल चलाना कितना आसान हो सकता है।',
    terms: 'टर्म्स ऑफ सर्विस',
    privacy: 'प्राइवेसी पॉलिसी',
    footerTagline: '© 2026 AtithiBook · स्वतंत्र होटलों के लिए बुकिंग सॉफ्टवेयर।',
    footerDisclaimer: 'AtithiBook सिर्फ सॉफ्टवेयर देता है। हर प्रॉपर्टी अपनी सेवाओं और मेहमानों के लिए खुद ज़िम्मेदार है।',
    demo: {
      emailTitle: 'अपनी आंखों से देखें',
      emailDesc: 'अपना ईमेल डालें और हम आपको डेमो एक्सेस कोड भेजेंगे ताकि आप पूरा ऐप देख सकें — कोई बंधन नहीं।',
      emailPh: 'your@email.com',
      cont: 'आगे बढ़ें →', saving: 'सेव हो रहा है…',
      waTitle: 'एक छोटा सा स्टेप',
      waDesc: 'हमें WhatsApp पर मैसेज करें और हम आपका एक्सेस कोड तुरंत भेज देंगे।',
      waBtn: 'WhatsApp पर मैसेज करें →',
      haveCode: 'कोड पहले से है? नीचे डालें।',
      yourEmail: 'आपका ईमेल', codePh: 'एक्सेस कोड',
      startDemo: 'डेमो शुरू करें →',
      badCode: 'गलत कोड। सही कोड के लिए हमें WhatsApp करें।',
    },
  },
};

// ─── Phone mockup ─────────────────────────────────────────────────────────────
function PhoneMockup() {
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      {/* soft warm halo for the light background */}
      <div style={{
        position: 'absolute', inset: '-12% -16%',
        background: 'radial-gradient(ellipse 60% 55% at 50% 48%, rgba(217,119,6,0.14) 0%, transparent 72%)',
        pointerEvents: 'none',
      }} />
      <svg viewBox="0 0 220 430" fill="none" xmlns="http://www.w3.org/2000/svg"
        style={{ width: 210, height: 'auto', position: 'relative', filter: 'drop-shadow(0 26px 50px rgba(90,55,20,0.22))' }}>
        <rect x="2" y="2" width="216" height="426" rx="34" fill="#15110e" stroke="#2a241f" strokeWidth="2" />
        <rect x="10" y="12" width="200" height="406" rx="26" fill="#faf9f7" />
        <rect x="80" y="20" width="60" height="13" rx="6.5" fill="#15110e" />

        {/* top bar */}
        <rect x="10" y="12" width="200" height="54" rx="26" fill="#fff" />
        <rect x="10" y="40" width="200" height="26" fill="#fff" />
        <text x="26" y="55" fontSize="11" fontWeight="800" fill="#1a1a1a" fontFamily="sans-serif">AtithiBook</text>
        <rect x="162" y="43" width="36" height="16" rx="8" fill="#d97706" />
        <text x="171" y="54" fontSize="7" fontWeight="700" fill="#fff" fontFamily="sans-serif">LIVE</text>
        <line x1="10" y1="67" x2="210" y2="67" stroke="#f0ece6" strokeWidth="1" />

        {/* greeting */}
        <text x="26" y="88" fontSize="11" fontWeight="800" fill="#1a1a1a" fontFamily="sans-serif">Good morning 👋</text>
        <text x="26" y="101" fontSize="8" fill="#9a9088" fontFamily="sans-serif">Tuesday, 16 June</text>

        {/* KPI cards */}
        <rect x="20" y="110" width="84" height="46" rx="10" fill="#fff4e6" />
        <text x="30" y="126" fontSize="7" fill="#a05000" fontFamily="sans-serif">Occupancy</text>
        <text x="30" y="146" fontSize="16" fontWeight="800" fill="#d97706" fontFamily="sans-serif">78%</text>
        <rect x="114" y="110" width="76" height="46" rx="10" fill="#eafaf0" />
        <text x="124" y="126" fontSize="7" fill="#166534" fontFamily="sans-serif">Income today</text>
        <text x="124" y="146" fontSize="13" fontWeight="800" fill="#16a34a" fontFamily="sans-serif">₹18,400</text>

        {/* calendar */}
        <text x="26" y="174" fontSize="9" fontWeight="700" fill="#1a1a1a" fontFamily="sans-serif">Today’s calendar</text>
        {['15', '16', '17', '18', '19', '20'].map((d, i) => (
          <text key={d} x={68 + i * 24} y="188" fontSize="7" fill="#c2b8ad" textAnchor="middle" fontFamily="sans-serif">{d}</text>
        ))}
        <text x="20" y="205" fontSize="7" fill="#666" fontFamily="sans-serif">Deluxe</text>
        <rect x="56" y="196" width="72" height="14" rx="4" fill="#16a34a" />
        <text x="63" y="206" fontSize="6" fill="#fff" fontWeight="600" fontFamily="sans-serif">Sharma · 3N</text>
        <rect x="132" y="196" width="46" height="14" rx="4" fill="#f59e0b" />
        <text x="140" y="206" fontSize="6" fill="#fff" fontWeight="600" fontFamily="sans-serif">Hold</text>
        <text x="20" y="223" fontSize="7" fill="#666" fontFamily="sans-serif">Luxury</text>
        <rect x="68" y="214" width="96" height="14" rx="4" fill="#3b82f6" />
        <text x="75" y="224" fontSize="6" fill="#fff" fontWeight="600" fontFamily="sans-serif">Patel Family · 5N</text>
        <text x="20" y="241" fontSize="7" fill="#666" fontFamily="sans-serif">Pool</text>
        <rect x="80" y="232" width="54" height="14" rx="4" fill="#8b5cf6" />
        <text x="87" y="242" fontSize="6" fill="#fff" fontWeight="600" fontFamily="sans-serif">Gupta · 2N</text>
        <text x="20" y="259" fontSize="7" fill="#666" fontFamily="sans-serif">Bathtub</text>
        <rect x="56" y="250" width="42" height="14" rx="4" fill="#ec4899" />
        <text x="62" y="260" fontSize="6" fill="#fff" fontWeight="600" fontFamily="sans-serif">Singh</text>
        <line x1="10" y1="274" x2="210" y2="274" stroke="#f0ece6" strokeWidth="1" />

        {/* pending */}
        <text x="26" y="290" fontSize="9" fontWeight="700" fill="#1a1a1a" fontFamily="sans-serif">Pending payments</text>
        <rect x="20" y="298" width="180" height="38" rx="9" fill="#fff" stroke="#f0ece6" strokeWidth="1" />
        <text x="32" y="313" fontSize="8" fontWeight="700" fill="#1a1a1a" fontFamily="sans-serif">Sharma, A.</text>
        <text x="32" y="326" fontSize="7" fill="#9a9088" fontFamily="sans-serif">Balance due · Check-out 19 Jun</text>
        <text x="192" y="321" fontSize="11" fontWeight="800" fill="#d97706" textAnchor="end" fontFamily="sans-serif">₹4,500</text>

        {/* tab bar */}
        <rect x="10" y="376" width="200" height="42" fill="#fff" stroke="#f0ece6" strokeWidth="1" />
        <circle cx="46" cy="392" r="8" fill="#fff4e6" />
        <circle cx="46" cy="392" r="4" fill="#d97706" />
        <circle cx="94" cy="392" r="5" fill="#efebe5" />
        <circle cx="126" cy="392" r="5" fill="#efebe5" />
        <circle cx="158" cy="392" r="5" fill="#efebe5" />
        <circle cx="182" cy="392" r="5" fill="#efebe5" />
        <rect x="80" y="412" width="60" height="4" rx="2" fill="#1a1a1a" opacity="0.18" />
      </svg>
    </div>
  );
}

// ─── Brand mark ───────────────────────────────────────────────────────────────
function Logo({ dark }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}>
      <span style={{
        width: 30, height: 30, borderRadius: 9, background: G.btn,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 2px 8px rgba(217,119,6,0.32)',
      }}>
        {/* अ (Atithi = guest) — the brand mark, consistent with the
            Sign In screen and the app. */}
        <span style={{ fontFamily: "'Noto Sans Devanagari', sans-serif", color: '#fff', fontWeight: 700, fontSize: 18, lineHeight: 1, marginTop: 1 }}>अ</span>
      </span>
      <span style={{ fontWeight: 800, fontSize: 17, letterSpacing: -0.4, color: dark ? '#fff' : C.ink }}>AtithiBook</span>
    </span>
  );
}

// ─── Language toggle (EN / हिं) ────────────────────────────────────────────────
function LangToggle({ lang, onChangeLang }) {
  if (!onChangeLang) return null;
  return (
    <div style={{ display: 'inline-flex', border: `1px solid ${C.line}`, borderRadius: 8, overflow: 'hidden', background: '#fff', flexShrink: 0 }}>
      {[['en', 'EN'], ['hi', 'हिं']].map(([code, label]) => (
        <button key={code} onClick={() => onChangeLang(code)} className="atithi-tap" style={{
          border: 'none', cursor: 'pointer', padding: '6px 8px', fontSize: 11.5, fontWeight: 700, lineHeight: 1,
          background: lang === code ? C.amberT : 'transparent',
          color: lang === code ? C.amberD : C.muted,
        }}>{label}</button>
      ))}
    </div>
  );
}

// ─── Demo gate sheet (logic unchanged; copy is localised) ─────────────────────
function DemoSheet({ onClose, lang }) {
  const d = (TXT[lang] || TXT.en).demo;
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
      setError(d.badCode);
    }
  }

  const waMsg  = encodeURIComponent(`Hi! I'd like to try AtithiBook. My email is ${codeEmail || email}.`);
  const waHref = WA_NUMBER
    ? `https://wa.me/${WA_NUMBER.replace(/\D/g, '')}?text=${waMsg}`
    : `https://wa.me/?text=${waMsg}`;

  const inputStyle = {
    width: '100%', padding: '12px 14px',
    border: `1px solid ${C.line}`, borderRadius: 11,
    fontSize: 15, boxSizing: 'border-box', outline: 'none', background: '#fdfbf9',
  };

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(28,22,18,0.5)', display: 'flex', alignItems: 'flex-end' }}
    >
      <div style={{
        background: '#fff', borderRadius: '24px 24px 0 0', padding: '32px 24px 44px',
        width: '100%', maxWidth: 480, margin: '0 auto', position: 'relative', boxSizing: 'border-box',
        boxShadow: '0 -20px 60px rgba(0,0,0,0.2)',
      }}>
        <button onClick={onClose} style={{ position: 'absolute', top: 14, right: 18, background: 'none', border: 'none', fontSize: 20, color: '#cbc3ba', cursor: 'pointer' }}>✕</button>

        {step === 'email' && (
          <form onSubmit={handleEmailSubmit}>
            <div style={{ fontSize: 30, marginBottom: 10 }}>👋</div>
            <h2 style={{ fontSize: 21, fontWeight: 800, marginBottom: 6, color: C.ink }}>{d.emailTitle}</h2>
            <p style={{ color: C.body, fontSize: 14, marginBottom: 22, lineHeight: 1.6 }}>{d.emailDesc}</p>
            <input type="email" required autoFocus placeholder={d.emailPh} value={email} onChange={e => setEmail(e.target.value)} style={{ ...inputStyle, marginBottom: 14 }} />
            <button type="submit" disabled={saving} style={{
              background: C.amber, color: '#fff', border: 'none', borderRadius: 11, padding: '13px',
              fontSize: 15, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', width: '100%', opacity: saving ? 0.7 : 1,
            }}>
              {saving ? d.saving : d.cont}
            </button>
          </form>
        )}

        {step === 'whatsapp' && (
          <form onSubmit={handleCodeSubmit}>
            <div style={{ fontSize: 30, marginBottom: 10 }}>✅</div>
            <h2 style={{ fontSize: 21, fontWeight: 800, marginBottom: 6, color: C.ink }}>{d.waTitle}</h2>
            <p style={{ color: C.body, fontSize: 14, lineHeight: 1.6, marginBottom: 20 }}>{d.waDesc}</p>
            <a href={waHref} target="_blank" rel="noopener noreferrer" style={{
              display: 'block', background: '#25D366', color: '#fff', borderRadius: 11, padding: '13px',
              fontSize: 15, fontWeight: 700, textAlign: 'center', textDecoration: 'none', marginBottom: 28,
            }}>{d.waBtn}</a>

            <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 22 }}>
              <p style={{ color: C.muted, fontSize: 13, marginBottom: 12 }}>{d.haveCode}</p>
              <input type="email" required placeholder={d.yourEmail} value={codeEmail} onChange={e => setCodeEmail(e.target.value)} style={{ ...inputStyle, fontSize: 14, marginBottom: 10 }} />
              <input type="text" required placeholder={d.codePh} value={code} onChange={e => { setCode(e.target.value); setError(''); }} autoCapitalize="none"
                style={{ ...inputStyle, fontSize: 14, border: `1px solid ${error ? '#ef4444' : C.line}`, marginBottom: error ? 6 : 12 }} />
              {error && <p style={{ color: '#ef4444', fontSize: 12, marginBottom: 12 }}>{error}</p>}
              <button type="submit" style={{ background: C.ink, color: '#fff', border: 'none', borderRadius: 11, padding: '13px', fontSize: 14, fontWeight: 700, cursor: 'pointer', width: '100%' }}>
                {d.startDemo}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ─── Reusable bits ────────────────────────────────────────────────────────────
function Eyebrow({ children, hi }) {
  return (
    <p style={{ fontSize: 12, fontWeight: 700, color: C.amber, letterSpacing: hi ? 0.4 : 1.6, textTransform: hi ? 'none' : 'uppercase', marginBottom: 12 }}>{children}</p>
  );
}

const LP_CSS = `
/* Break the landing out of the app's phone frame → full-bleed website.
   Scoped to body.atithi-landing (added by useFullBleed) so it only applies
   while Landing is mounted, and reverts cleanly for the rest of the app. */
body.atithi-landing { display: block !important; align-items: initial !important; justify-content: initial !important; padding: 0 !important; background: #fdfbf8 !important; }
body.atithi-landing #root { max-width: none !important; width: 100% !important; height: auto !important; min-height: 100dvh; border: none !important; border-radius: 0 !important; box-shadow: none !important; overflow: auto !important; margin: 0 !important; }
/* Geist for Latin; Noto Sans Devanagari picks up Hindi glyphs Geist lacks. */
.lp { font-family: 'Geist', 'Noto Sans Devanagari', sans-serif; }
.lp-wrap { max-width: 1060px; margin: 0 auto; }
.lp-section { padding: 68px 22px; }
.lp-hero-inner { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 44px; }
.lp-hero-text { max-width: 600px; width: 100%; }
.lp-h1 { font-size: 38px; }
.lp-h2 { font-size: 29px; }
.lp-cta-row { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
.lp-reassure { display: flex; gap: 18px; justify-content: center; flex-wrap: wrap; margin-top: 22px; }
.lp-steps { display: flex; flex-direction: column; gap: 26px; }
.lp-features { display: grid; grid-template-columns: 1fr; gap: 16px; }
.lp-plans { display: flex; flex-direction: column; gap: 16px; }
.lp-card { transition: transform .18s ease, box-shadow .18s ease; }
.lp-card:hover { transform: translateY(-3px); box-shadow: 0 14px 32px rgba(90,55,20,.10); }
.lp-btn { transition: transform .14s ease, box-shadow .14s ease, background .14s ease; }
.lp-btn-primary:hover { transform: translateY(-1px); box-shadow: 0 12px 26px rgba(217,119,6,.34); }
.lp-btn-ghost:hover { background: #f4eee5; }
.lp-link:hover { color: #b45309; }
/* Narrow phones: drop the redundant nav "Sign in" link (sign-in is still in
   the hero + final CTA) so the nav never overflows, especially in Hindi. */
@media (max-width: 479px) {
  .lp-nav-signin { display: none; }
}
@media (min-width: 600px) {
  .lp-features { grid-template-columns: 1fr 1fr; }
}
@media (min-width: 900px) {
  .lp-section { padding: 92px 40px; }
  .lp-hero-inner { flex-direction: row; text-align: left; justify-content: space-between; align-items: center; gap: 40px; }
  .lp-cta-row { justify-content: flex-start; }
  .lp-reassure { justify-content: flex-start; }
  .lp-h1 { font-size: 54px; }
  .lp-h2 { font-size: 34px; }
  .lp-steps { flex-direction: row; gap: 28px; }
  .lp-step { flex: 1; }
  .lp-features { grid-template-columns: 1fr 1fr 1fr; }
  .lp-plans { flex-direction: row; align-items: stretch; }
  .lp-plan { flex: 1; display: flex; flex-direction: column; }
}
`;

// ─── Main component ───────────────────────────────────────────────────────────
export default function Landing({ go, lang = 'en', onChangeLang }) {
  useFullBleed();
  const [sheetOpen, setSheetOpen] = useState(false);
  const openDemo = () => setSheetOpen(true);

  const s = TXT[lang] || TXT.en;
  const hi = lang === 'hi';
  // Devanagari doesn't take the tight Latin tracking well — relax it for Hindi.
  const h1Track = hi ? '-0.3px' : '-1.4px';
  const h2Track = hi ? '-0.2px' : '-0.8px';

  const primaryBtn = {
    background: G.btn, color: '#fff', border: 'none', borderRadius: 12,
    padding: '14px 30px', fontSize: 15, fontWeight: 700, cursor: 'pointer',
    boxShadow: '0 6px 18px rgba(217,119,6,.22)',
  };
  const ghostBtn = {
    background: '#fff', color: C.ink, border: `1px solid ${C.line}`, borderRadius: 12,
    padding: '14px 26px', fontSize: 15, fontWeight: 600, cursor: 'pointer',
  };

  return (
    <div className="lp" style={{ color: C.ink, background: G.page }}>
      <style>{LP_CSS}</style>

      {/* ══ HERO ══ */}
      <div style={{ background: G.hero }}>
        {/* Nav */}
        <nav style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', height: 64, maxWidth: 1060, margin: '0 auto', gap: 8 }}>
          <Logo />
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <LangToggle lang={lang} onChangeLang={onChangeLang} />
            <button onClick={() => go('signin')} className="lp-btn lp-btn-ghost lp-nav-signin" style={{ background: 'transparent', border: 'none', color: C.body, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', padding: '8px 10px', borderRadius: 9, whiteSpace: 'nowrap' }}>{s.navSignIn}</button>
            <button onClick={openDemo} className="lp-btn lp-btn-primary" style={{ background: G.btn, color: '#fff', border: 'none', borderRadius: 10, padding: '9px 15px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 12px rgba(217,119,6,.20)', whiteSpace: 'nowrap' }}>{s.navTry}</button>
          </div>
        </nav>

        {/* Hero content */}
        <div className="lp-section lp-wrap" style={{ paddingTop: 36, paddingBottom: 28 }}>
          <div className="lp-hero-inner">
            <div className="lp-hero-text">
              <div style={{ display: 'inline-block', background: C.amberT, color: C.amberD, border: `1px solid ${C.line}`, borderRadius: 100, padding: '5px 14px', fontSize: 12.5, fontWeight: 600, marginBottom: 22 }}>
                {s.badge}
              </div>
              <h1 className="lp-h1" style={{ fontWeight: 800, lineHeight: 1.08, letterSpacing: h1Track, marginBottom: 18, color: C.ink }}>
                {s.h1a}<br />{s.h1b}<span style={{ color: C.amber }}>{s.h1c}</span>
              </h1>
              <p style={{ fontSize: 16.5, color: C.body, lineHeight: 1.65, marginBottom: 30, maxWidth: 480 }}>
                {s.heroSub}
              </p>
              <div className="lp-cta-row">
                <button onClick={openDemo} className="lp-btn lp-btn-primary" style={primaryBtn}>{s.ctaDemo}</button>
                <button onClick={() => go('signin')} className="lp-btn lp-btn-ghost" style={ghostBtn}>{s.ctaSignIn}</button>
              </div>
              <div className="lp-reassure">
                {s.reassure.map(t => (
                  <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: C.muted, fontWeight: 500 }}>
                    <span style={{ color: C.amber, fontWeight: 800 }}>✓</span>{t}
                  </span>
                ))}
              </div>
            </div>
            <div style={{ flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
              <PhoneMockup />
            </div>
          </div>
        </div>
      </div>

      {/* ══ HOW IT WORKS ══ */}
      <div style={{ background: G.white, borderTop: `1px solid ${C.line}` }}>
        <div className="lp-section lp-wrap">
          <div style={{ textAlign: 'center', maxWidth: 620, margin: '0 auto 52px' }}>
            <Eyebrow hi={hi}>{s.howEyebrow}</Eyebrow>
            <h2 className="lp-h2" style={{ fontWeight: 800, letterSpacing: h2Track, lineHeight: 1.15, color: C.ink }}>
              {s.howTitle}
            </h2>
            <p style={{ fontSize: 15.5, color: C.body, lineHeight: 1.6, marginTop: 14 }}>
              {s.howSub}
            </p>
          </div>

          <div className="lp-steps">
            {s.steps.map((st, i) => (
              <div key={i} className="lp-step" style={{ textAlign: 'left' }}>
                <div style={{
                  width: 46, height: 46, borderRadius: 14, background: G.tile, color: C.amberD,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 19, marginBottom: 16,
                  boxShadow: '0 2px 8px rgba(217,119,6,.12)',
                }}>{i + 1}</div>
                <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 7, color: C.ink }}>{st.title}</div>
                <div style={{ color: C.body, fontSize: 14.5, lineHeight: 1.62 }}>{st.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ══ FEATURES ══ */}
      <div style={{ background: G.cream, borderTop: `1px solid ${C.line}` }}>
        <div className="lp-section lp-wrap">
          <div style={{ textAlign: 'center', maxWidth: 620, margin: '0 auto 48px' }}>
            <Eyebrow hi={hi}>{s.featEyebrow}</Eyebrow>
            <h2 className="lp-h2" style={{ fontWeight: 800, letterSpacing: h2Track, lineHeight: 1.15, color: C.ink }}>
              {s.featTitle}
            </h2>
          </div>

          <div className="lp-features">
            {FEATURE_ICONS.map((Icon, i) => {
              const f = s.features[i];
              return (
                <div key={i} className="lp-card" style={{ background: G.cardSurf, borderRadius: 18, padding: '26px 24px', border: `1px solid ${C.line}`, boxShadow: '0 1px 2px rgba(90,55,20,.04), 0 6px 18px rgba(90,55,20,.03)' }}>
                  <div style={{ width: 46, height: 46, borderRadius: 13, background: G.tile, color: C.amberD, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16, boxShadow: '0 2px 8px rgba(217,119,6,.12)' }}>
                    <Icon />
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8, color: C.ink }}>{f.title}</div>
                  <div style={{ color: C.body, fontSize: 14, lineHeight: 1.6 }}>{f.desc}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ══ PRICING ══ */}
      <div style={{ background: G.priceW, borderTop: `1px solid ${C.line}` }}>
        <div className="lp-section lp-wrap">
          <div style={{ textAlign: 'center', maxWidth: 620, margin: '0 auto 46px' }}>
            <Eyebrow hi={hi}>{s.planEyebrow}</Eyebrow>
            <h2 className="lp-h2" style={{ fontWeight: 800, letterSpacing: h2Track, lineHeight: 1.15, color: C.ink }}>
              {s.planTitle}
            </h2>
            <p style={{ fontSize: 15.5, color: C.body, lineHeight: 1.6, marginTop: 14 }}>
              {s.planSub}
            </p>
          </div>

          <div className="lp-plans">
            {PLAN_META.map((p, i) => {
              const pc = s.plans[i];
              return (
                <div key={p.name} className={`lp-plan lp-card`} style={{
                  borderRadius: 18, padding: '28px 24px', position: 'relative', background: p.highlight ? G.planHi : G.cardSurf,
                  border: p.highlight ? `2px solid ${C.amber}` : `1px solid ${C.line}`,
                  boxShadow: p.highlight ? '0 18px 40px rgba(217,119,6,.14)' : '0 1px 2px rgba(90,55,20,.03)',
                }}>
                  {p.highlight && (
                    <div style={{ position: 'absolute', top: -12, left: 24, background: C.amber, color: '#fff', fontSize: 10.5, fontWeight: 700, letterSpacing: hi ? 0.3 : 0.8, padding: '4px 12px', borderRadius: 100, textTransform: hi ? 'none' : 'uppercase' }}>{pc.tag}</div>
                  )}
                  <div style={{ fontWeight: 800, fontSize: 20, color: C.ink, marginBottom: 4 }}>{p.name}</div>
                  {!p.highlight && (
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: C.amber, letterSpacing: hi ? 0.2 : 0.4, textTransform: hi ? 'none' : 'uppercase', marginBottom: 10 }}>{pc.tag}</div>
                  )}
                  <p style={{ fontSize: 14, color: C.body, marginBottom: 20, lineHeight: 1.55, marginTop: p.highlight ? 8 : 0 }}>{pc.desc}</p>
                  <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px', display: 'flex', flexDirection: 'column', gap: 11, flex: 1 }}>
                    {pc.features.map(f => (
                      <li key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 14, color: C.ink }}>
                        <span style={{ color: C.amber, fontWeight: 800, flexShrink: 0, marginTop: 1 }}>✓</span>{f}
                      </li>
                    ))}
                  </ul>
                  <button onClick={openDemo} className="lp-btn lp-btn-primary lp-btn-ghost" style={{
                    width: '100%', padding: '13px', borderRadius: 11, fontSize: 14.5, fontWeight: 700, cursor: 'pointer',
                    background: p.highlight ? G.btn : '#fff',
                    color: p.highlight ? '#fff' : C.ink,
                    boxShadow: p.highlight ? '0 6px 16px rgba(217,119,6,.22)' : 'none',
                    border: p.highlight ? 'none' : `1px solid ${C.line}`,
                  }}>
                    {s.getStarted}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ══ FINAL CTA ══ */}
      <div style={{ background: G.cta }}>
        <div className="lp-section lp-wrap" style={{ textAlign: 'center', maxWidth: 640 }}>
          <h2 className="lp-h2" style={{ fontWeight: 800, letterSpacing: h2Track, lineHeight: 1.15, color: '#fff', marginBottom: 14 }}>
            {s.ctaTitle}
          </h2>
          <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.92)', lineHeight: 1.6, marginBottom: 28 }}>
            {s.ctaSub}
          </p>
          <div className="lp-cta-row" style={{ justifyContent: 'center' }}>
            <button onClick={openDemo} className="lp-btn" style={{ background: '#fff', color: C.amberD, border: 'none', borderRadius: 12, padding: '14px 32px', fontSize: 15, fontWeight: 800, cursor: 'pointer', boxShadow: '0 8px 24px rgba(0,0,0,0.16)' }}>{s.ctaDemo}</button>
            <button onClick={() => go('signin')} className="lp-btn" style={{ background: 'rgba(255,255,255,0.16)', color: '#fff', border: '1px solid rgba(255,255,255,0.5)', borderRadius: 12, padding: '14px 28px', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>{s.ctaSignIn}</button>
          </div>
        </div>
      </div>

      {/* ══ FOOTER ══ */}
      <footer style={{ background: G.footer, padding: '40px 24px 32px', borderTop: `1px solid ${C.line}` }}>
        <div style={{ maxWidth: 1060, margin: '0 auto', textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}><Logo /></div>
          <div style={{ marginBottom: 16 }}>
            <button onClick={() => go('terms')} className="lp-link" style={{ background: 'none', border: 'none', color: C.body, fontSize: 13, cursor: 'pointer', marginRight: 24, fontWeight: 500 }}>{s.terms}</button>
            <button onClick={() => go('privacy')} className="lp-link" style={{ background: 'none', border: 'none', color: C.body, fontSize: 13, cursor: 'pointer', fontWeight: 500 }}>{s.privacy}</button>
          </div>
          <div style={{ color: C.muted, fontSize: 12, lineHeight: 1.7, maxWidth: 520, margin: '0 auto' }}>
            {s.footerTagline}<br />
            {s.footerDisclaimer}
          </div>
        </div>
      </footer>

      {/* ══ DEMO GATE ══ */}
      {sheetOpen && <DemoSheet onClose={() => setSheetOpen(false)} lang={lang} />}
    </div>
  );
}

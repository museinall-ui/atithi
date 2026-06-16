import { useState } from 'react';
import Icon from '../components/Icon.jsx';
import { T } from '../tokens.js';

const UPDATED = 'June 2026';

const TERMS = `
**1. The Service**
AtithiBook ("we", "us", "our") provides cloud-based hotel property management software. By creating an account or using AtithiBook you agree to these Terms of Service.

**2. Your Account**
You are responsible for keeping your login credentials secure and for all activity that occurs under your account. You must provide accurate information when registering and keep it up to date.

**3. Acceptable Use**
You may use AtithiBook only for lawful purposes. You must not:
— submit false or fraudulent bookings
— use the service to store personal data about guests without a lawful basis
— attempt to gain unauthorised access to the platform or other accounts
— reverse-engineer, scrape, or resell the service

**4. Our Role**
AtithiBook is a booking management tool. We are not a hotel, travel agent, or OTA. We are not responsible for the quality of services, conduct, or any disputes involving any property that uses our software. Each property is independently operated and solely responsible to its guests.

**5. Your Data**
You own the booking and guest data you enter into AtithiBook. By using the service you grant us a limited licence to store and process that data solely to provide the service to you. We do not sell your data.

**6. Availability**
We aim for high uptime but cannot guarantee uninterrupted or error-free access. The service is provided "as is" and "as available" without warranty of any kind.

**7. Limitation of Liability**
To the maximum extent permitted by applicable law, AtithiBook and its team shall not be liable for indirect, incidental, special, or consequential damages arising from your use of or inability to use the service, even if we have been advised of the possibility of such damages.

**8. Termination**
We may suspend or terminate accounts that violate these terms, with or without notice.

**9. Changes to These Terms**
We may update these Terms from time to time. We will notify you of material changes via email or an in-app notice. Continued use of the service after changes take effect constitutes acceptance of the revised Terms.

**10. Governing Law**
These Terms are governed by the laws of India. Any disputes shall be subject to the exclusive jurisdiction of the courts of India.

**11. Contact**
For questions about these Terms: hello@atithibook.com
`;

const PRIVACY = `
**What we collect**
— Account information: your email address when you sign up
— Property information: hotel name, address, contact details you enter
— Guest and booking data: names, phone numbers, email addresses, and stay details of your guests, as entered by you or submitted through your property's booking link
— Demo enquiries: email addresses submitted via the demo access form on our website

**Why we collect it**
— To provide and operate the booking management service
— To enable direct bookings from your guests via your property link
— To send essential service communications (booking notifications, security alerts)
— To improve the service

**How it is stored**
All data is stored on Supabase infrastructure hosted in Mumbai, India. Data is encrypted in transit (TLS) and at rest.

**Who we share it with**
We do not sell personal data to third parties. We share data only:
— With Supabase (our cloud database provider) to store and serve it
— With OTA channel manager partners (when you enable OTA sync) solely to push room availability and receive incoming booking notifications
— As required by applicable law or a valid legal process

**How long we keep it**
We retain your data for as long as your account is active. You may request deletion at any time by contacting us (see below). Guest booking records may be retained for the period required under Indian tax law (typically 8 years).

**Your rights under the DPDP Act 2023**
Under India's Digital Personal Data Protection Act 2023 you have the right to:
— Access the personal data we hold about you
— Correct inaccurate or incomplete data
— Request erasure of your data (subject to legal retention obligations)
— Nominate a person to exercise these rights on your behalf
— Raise a grievance with us or with the Data Protection Board of India

To exercise any of these rights, contact: privacy@atithibook.com

**Your guests' data**
You, as the hotelier, are the Data Fiduciary for the personal data of your guests. You are responsible for obtaining any necessary consent from your guests for the data you collect and process through AtithiBook. AtithiBook acts as a Data Processor and processes guest data only on your instruction.

**Cookies**
AtithiBook uses only essential session cookies required for authentication. We do not use advertising or third-party tracking cookies.

**Changes to this Policy**
We may update this Privacy Policy from time to time. We will notify you of material changes via email or an in-app notice. The "Last updated" date at the top of this page reflects the most recent revision.

**Contact**
For privacy matters or data requests: privacy@atithibook.com
For general enquiries: hello@atithibook.com
`;

function RichText({ src }) {
  const paragraphs = src.trim().split('\n\n');
  return (
    <div>
      {paragraphs.map((para, i) => {
        if (para.startsWith('**') && para.split('**').length === 3 && para.endsWith('**')) {
          return (
            <h3 key={i} style={{ fontWeight: 700, fontSize: 14, marginBottom: 6, marginTop: i === 0 ? 0 : 20, color: '#1a1a1a' }}>
              {para.replace(/\*\*/g, '')}
            </h3>
          );
        }
        const parts = para.split(/(\*\*[^*]+\*\*)/g);
        return (
          <p key={i} style={{ fontSize: 13, lineHeight: 1.7, color: '#444', marginBottom: 12 }}>
            {parts.map((part, j) =>
              part.startsWith('**') && part.endsWith('**')
                ? <strong key={j} style={{ color: '#1a1a1a' }}>{part.slice(2, -2)}</strong>
                : part
            )}
          </p>
        );
      })}
    </div>
  );
}

export default function Legal({ tab = 'terms', go }) {
  const [active, setActive] = useState(tab);

  const TAB_STYLE = (name) => ({
    flex: 1, padding: '10px 0', fontSize: 14, fontWeight: 600,
    border: 'none', cursor: 'pointer',
    background: active === name ? '#fff' : 'transparent',
    color: active === name ? '#1a1a1a' : '#888',
    borderBottom: active === name ? `2px solid var(--atithi-primary, #d97706)` : '2px solid transparent',
    transition: 'color 0.15s',
  });

  return (
    <div style={{ minHeight: '100vh', background: T.bg || '#fff', display: 'flex', flexDirection: 'column' }}>

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '0 16px', height: 52,
        borderBottom: `1px solid ${T.separator || '#f0f0f0'}`,
        background: T.bg || '#fff',
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        <button
          onClick={() => go('home')}
          style={{ background: 'none', border: 'none', padding: 4, cursor: 'pointer', display: 'flex', alignItems: 'center' }}
        >
          <Icon name="chevL" size={20} color={T.ink2 || '#555'} />
        </button>
        <span style={{ fontWeight: 700, fontSize: 16 }}>
          {active === 'terms' ? 'Terms of Service' : 'Privacy Policy'}
        </span>
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex',
        borderBottom: `1px solid ${T.separator || '#f0f0f0'}`,
        background: T.bg || '#fff',
        position: 'sticky', top: 52, zIndex: 9,
      }}>
        <button style={TAB_STYLE('terms')}   onClick={() => setActive('terms')}>Terms</button>
        <button style={TAB_STYLE('privacy')} onClick={() => setActive('privacy')}>Privacy</button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, padding: '24px 20px 48px', maxWidth: 640, width: '100%', boxSizing: 'border-box' }}>
        <p style={{ fontSize: 11, color: '#bbb', marginBottom: 24 }}>Last updated: {UPDATED}</p>
        <RichText src={active === 'terms' ? TERMS : PRIVACY} />
      </div>
    </div>
  );
}

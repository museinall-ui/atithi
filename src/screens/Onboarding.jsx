import { useState } from 'react';
import { T } from '../tokens.js';
import Icon from '../components/Icon.jsx';
import Btn from '../components/Btn.jsx';
import Field from '../components/Field.jsx';
import NumberInput from '../components/NumberInput.jsx';

// First-run 3-step wizard. Shows as a modal overlay on the Dashboard the
// first time a hotelier opens Atithi (cloud + DEMO_MODE flows alike). The
// caller decides when to render — typically when property.profile.name is
// empty OR categories.length === 0 AND the dismissed flag isn't set.
//
// Three steps, each minimal so the hotelier can start booking in under a
// minute:
//   1. Property name + phone + city (the "who are you" essentials)
//   2. One room category (the "what do you sell" essentials)
//   3. Payment QR upload (optional but a major UX unlock — vouchers carry
//      the QR so guests can pay without ever speaking to the property)
//
// The Skip button at any step closes the wizard without finishing; the
// Dashboard's "Finish setting up" nudge keeps pushing until everything is
// configured.
export default function Onboarding({ property, onApply, onDismiss, isHi }) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState(property?.profile?.name || '');
  const [phone, setPhone] = useState(property?.profile?.phone || '');
  const [city, setCity] = useState(property?.profile?.city || '');
  const [catName, setCatName] = useState((property?.categories?.[0]?.name) || '');
  const [catUnits, setCatUnits] = useState((property?.categories?.[0]?.units) || 1);
  const [catRate, setCatRate] = useState((property?.categories?.[0]?.base) || 3000);
  const [qrDataUrl, setQrDataUrl] = useState(property?.profile?.paymentQrDataUrl || '');

  const L = isHi ? {
    welcome: 'अतिथि में आपका स्वागत है',
    intro: 'चलिए आपकी प्रॉपर्टी को मिनटों में तैयार करते हैं।',
    step: 'चरण', of: 'का',
    propertyTitle: 'आपकी प्रॉपर्टी',
    propertySub: 'मेहमानों के साथ शेयर किए जाने वाले वाउचर पर यह जानकारी दिखेगी।',
    nameLabel: 'प्रॉपर्टी का नाम',
    namePh: 'उदा. यात्रा डेज़र्ट कैम्प',
    phoneLabel: 'फ़ोन',
    phonePh: '+91-9876543210',
    cityLabel: 'शहर',
    cityPh: 'जैसलमेर',
    roomsTitle: 'पहला कमरा प्रकार',
    roomsSub: 'एक कमरा श्रेणी जोड़ें — आप बाद में और जोड़ सकते हैं।',
    catNameLabel: 'श्रेणी का नाम',
    catNamePh: 'उदा. डीलक्स कमरा',
    catUnitsLabel: 'कुल कमरे',
    catRateLabel: 'प्रति रात बेस दर (₹)',
    qrTitle: 'पेमेंट QR',
    qrSub: 'अपना UPI / पेमेंट QR अपलोड करें। हर वाउचर के नीचे “Scan to pay” के तौर पर दिखेगा।',
    qrUploaded: 'QR अपलोड हो गया',
    qrUploadCta: 'पेमेंट QR अपलोड करें',
    qrSkip: 'अभी छोड़ें — बाद में सेटिंग्स में जोड़ें',
    skip: 'छोड़ें',
    next: 'अगला',
    back: 'पीछे',
    finish: 'सेटअप पूरा करें',
  } : {
    welcome: 'Welcome to Atithi',
    intro: "Let's get your property set up in a minute.",
    step: 'Step', of: 'of',
    propertyTitle: 'Your property',
    propertySub: 'This appears on every voucher you send guests.',
    nameLabel: 'Property name',
    namePh: 'e.g. Yatra Desert Camp',
    phoneLabel: 'Phone',
    phonePh: '+91-9876543210',
    cityLabel: 'City',
    cityPh: 'Jaisalmer',
    roomsTitle: 'First room type',
    roomsSub: 'Add one room category to start. You can add more later.',
    catNameLabel: 'Category name',
    catNamePh: 'e.g. Deluxe Tent',
    catUnitsLabel: 'How many rooms',
    catRateLabel: 'Base rate per night (₹)',
    qrTitle: 'Payment QR',
    qrSub: "Upload your UPI / payment QR. It'll appear on every voucher as 'Scan to pay'.",
    qrUploaded: 'QR uploaded',
    qrUploadCta: 'Upload payment QR',
    qrSkip: "Skip for now — add it later in Settings",
    skip: 'Skip',
    next: 'Next',
    back: 'Back',
    finish: 'Finish setup',
  };

  const step1Valid = name.trim().length > 0;
  const step2Valid = catName.trim().length > 0 && +catUnits > 0 && +catRate > 0;

  const onUploadQr = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (file.size > 700 * 1024) {
      alert('Image is too large. Please use a QR under 700 KB.');
      return;
    }
    const r = new FileReader();
    r.onload = () => setQrDataUrl(String(r.result || ''));
    r.readAsDataURL(file);
  };

  const finish = () => {
    const patch = {
      profile: {
        ...(property?.profile || {}),
        name: name.trim(),
        phone: phone.trim(),
        city: city.trim(),
        paymentQrDataUrl: qrDataUrl,
      },
      categories: (() => {
        // Keep existing categories if any. If none, seed with the just-entered one.
        const existing = Array.isArray(property?.categories) ? property.categories : [];
        if (existing.length > 0) {
          // Hotelier had a category already; treat the wizard category as an
          // edit of the first. Less surprise than dropping a duplicate row.
          return existing.map((c, i) => i === 0
            ? { ...c, name: catName.trim() || c.name, units: +catUnits || c.units, base: +catRate || c.base }
            : c);
        }
        return [{
          id: 'rt_' + Date.now().toString(36),
          name: catName.trim(),
          units: +catUnits || 1,
          base: +catRate || 3000,
          amenityIds: [],
        }];
      })(),
    };
    onApply(patch);
    onDismiss();
  };

  const stepHeader = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
      <div style={{ display: 'flex', gap: 4, flex: 1 }}>
        {[1, 2, 3].map(s => (
          <div
            key={s}
            style={{
              flex: 1, height: 4, borderRadius: 2,
              background: s <= step ? T.primary : T.bgSoft,
              transition: 'background .2s',
            }}
          />
        ))}
      </div>
      <span className="tnum" style={{ fontSize: 10, color: T.ink3, fontWeight: 700, letterSpacing: 0.3 }}>
        {L.step} {step} {L.of} 3
      </span>
    </div>
  );

  return (
    <div
      onClick={onDismiss}
      style={{
        position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)',
        zIndex: 60, display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{
        width: '100%', maxWidth: 480, background: T.card,
        borderRadius: '20px 20px 0 0', padding: '20px 18px 28px',
        display: 'flex', flexDirection: 'column', gap: 14, maxHeight: '92%', overflow: 'auto',
      }}>
        {stepHeader}

        {step === 1 && (
          <>
            <div style={{ marginBottom: 4 }}>
              <div style={{ fontSize: 19, fontWeight: 800, color: T.ink, letterSpacing: -0.3 }}>{L.welcome}</div>
              <div style={{ fontSize: 12, color: T.ink3, marginTop: 4, lineHeight: 1.5 }}>{L.intro}</div>
            </div>
            <div style={{ marginTop: 4 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.ink, marginBottom: 4 }}>{L.propertyTitle}</div>
              <div style={{ fontSize: 11, color: T.ink3, fontWeight: 600, marginBottom: 10, lineHeight: 1.4 }}>{L.propertySub}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Field label={L.nameLabel} value={name} onChange={e => setName(e.target.value)} placeholder={L.namePh} />
                <Field label={L.phoneLabel} value={phone} onChange={e => setPhone(e.target.value)} placeholder={L.phonePh} />
                <Field label={L.cityLabel} value={city} onChange={e => setCity(e.target.value)} placeholder={L.cityPh} />
              </div>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div style={{ marginBottom: 4 }}>
              <div style={{ fontSize: 17, fontWeight: 800, color: T.ink, letterSpacing: -0.2 }}>{L.roomsTitle}</div>
              <div style={{ fontSize: 12, color: T.ink3, marginTop: 4, lineHeight: 1.5 }}>{L.roomsSub}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Field label={L.catNameLabel} value={catName} onChange={e => setCatName(e.target.value)} placeholder={L.catNamePh} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: T.ink2 }}>{L.catUnitsLabel}</label>
                  <div style={{ background: T.bgSunk, border: `1px solid ${T.borderSoft}`, borderRadius: 10, padding: '0 12px', height: 44, display: 'flex', alignItems: 'center' }}>
                    <NumberInput value={catUnits} min={1} fallback={1} onChange={(n) => setCatUnits(n)} style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 15, fontWeight: 500, color: T.ink, minWidth: 0 }} />
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: T.ink2 }}>{L.catRateLabel}</label>
                  <div style={{ background: T.bgSunk, border: `1px solid ${T.borderSoft}`, borderRadius: 10, padding: '0 12px', height: 44, display: 'flex', alignItems: 'center' }}>
                    <NumberInput value={catRate} min={0} fallback={0} onChange={(n) => setCatRate(n)} style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 15, fontWeight: 500, color: T.ink, minWidth: 0 }} />
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div style={{ marginBottom: 4 }}>
              <div style={{ fontSize: 17, fontWeight: 800, color: T.ink, letterSpacing: -0.2 }}>{L.qrTitle}</div>
              <div style={{ fontSize: 12, color: T.ink3, marginTop: 4, lineHeight: 1.5 }}>{L.qrSub}</div>
            </div>
            {qrDataUrl ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <img
                  src={qrDataUrl}
                  alt="Payment QR"
                  style={{ width: 110, height: 110, borderRadius: 12, border: `1px solid ${T.borderSoft}`, objectFit: 'contain', background: '#fff' }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.ok, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Icon name="check" size={13} color={T.ok} stroke={2.4} /> {L.qrUploaded}
                  </div>
                  <label
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 8, padding: '6px 12px', border: `1px solid ${T.border}`, borderRadius: 7, background: T.card, color: T.ink2, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                  >
                    <Icon name="edit" size={11} stroke={2.2} /> Replace
                    <input type="file" accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }} onChange={onUploadQr} />
                  </label>
                </div>
              </div>
            ) : (
              <label
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '26px 14px', border: `1.5px dashed ${T.border}`, borderRadius: 12, background: T.bgSoft, color: T.ink3, cursor: 'pointer' }}
              >
                <Icon name="plus" size={16} color={T.primary} stroke={2.2} />
                <span style={{ fontSize: 13, fontWeight: 700, color: T.primary }}>{L.qrUploadCta}</span>
                <input type="file" accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }} onChange={onUploadQr} />
              </label>
            )}
            <div style={{ fontSize: 11, color: T.ink3, fontStyle: 'italic', lineHeight: 1.5 }}>
              {L.qrSkip}
            </div>
          </>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
          <button
            onClick={onDismiss}
            className="atithi-tap"
            style={{
              background: 'transparent', border: 'none', color: T.ink3,
              fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: '8px 4px',
            }}
          >{L.skip}</button>
          <div style={{ flex: 1 }} />
          {step > 1 && (
            <Btn variant="ghost" icon="arrowL" onClick={() => setStep(step - 1)}>{L.back}</Btn>
          )}
          {step < 3 ? (
            <Btn
              icon="arrow"
              onClick={() => setStep(step + 1)}
              disabled={(step === 1 && !step1Valid) || (step === 2 && !step2Valid)}
            >{L.next}</Btn>
          ) : (
            <Btn icon="check" onClick={finish}>{L.finish}</Btn>
          )}
        </div>
      </div>
    </div>
  );
}

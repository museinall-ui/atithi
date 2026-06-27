import { useState, useEffect, useMemo, useRef } from 'react';
import { T } from '../tokens.js';
import Icon from '../components/Icon.jsx';
import { ANCHOR, effectiveRoomTypes } from '../data.js';

// Global search overlay. Slides over the current screen and filters every
// booking (including past + cancelled) by booking id, guest name, phone, or
// email. Tap a result to open the booking detail. Esc / back arrow closes.
//
// Why a fresh overlay vs. extending Guests search: Guests is grouped by
// distinct guest, so a hotelier looking for a specific booking ("BK-2867"
// the guest just texted me") had to find the guest first, then find the
// booking. This goes straight to the booking.
export default function SearchOverlay({ open, onClose, bookings = [], property, go }) {
  const [q, setQ] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setQ('');
      // Autofocus after mount; small delay so iOS keyboards don't flicker
      setTimeout(() => inputRef.current && inputRef.current.focus(), 60);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const ROOM_TYPES = useMemo(() => effectiveRoomTypes(property), [property]);
  const rtById = useMemo(() => {
    const m = {};
    ROOM_TYPES.forEach(rt => { m[rt.id] = rt; });
    return m;
  }, [ROOM_TYPES]);

  const fmtStayDay = (startIdx) => {
    const d = new Date(ANCHOR);
    d.setDate(d.getDate() + (startIdx || 0));
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  };

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return [];
    const digits = needle.replace(/\D/g, '');
    return bookings.filter(b => {
      if ((b.id || '').toLowerCase().includes(needle)) return true;
      if ((b.guest || '').toLowerCase().includes(needle)) return true;
      if ((b.email || '').toLowerCase().includes(needle)) return true;
      // Notes / special-request field — covers ad-hoc detail the
      // hotelier remembers about a stay ("anniversary", "early
      // check-in", "nut allergy") that doesn't fit any structured
      // field. Worth indexing because hoteliers often search for
      // these snippets.
      if ((b.notes || '').toLowerCase().includes(needle)) return true;
      // Phone match: strip non-digits from both sides so spaces / + / · don't
      // throw off comparison. Skip if needle has no digits at all.
      if (digits.length >= 3) {
        const bookingDigits = (b.phone || '').replace(/\D/g, '');
        if (bookingDigits.includes(digits)) return true;
      }
      return false;
    })
    // Most recent first
    .sort((a, b) => (b.startIdx || 0) - (a.startIdx || 0))
    .slice(0, 30);
  }, [bookings, q]);

  if (!open) return null;

  return (
    <div
      style={{
        position: 'absolute', inset: 0, background: T.bg, zIndex: 50,
        display: 'flex', flexDirection: 'column',
      }}
    >
      {/* Header — search input + close */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '12px 14px', borderBottom: `1px solid ${T.borderSoft}`, background: T.card,
      }}>
        <button
          onClick={onClose}
          style={{ width: 36, height: 36, borderRadius: 10, border: 'none', background: T.bgSoft, color: T.ink2, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
          aria-label="Close search"
        >
          <Icon name="arrowL" size={16} />
        </button>
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', gap: 8,
          background: T.bgSoft, border: `1px solid ${T.borderSoft}`, borderRadius: 10, padding: '0 12px',
        }}>
          <Icon name="search" size={14} color={T.ink3} />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search ID, name, phone, email or notes…"
            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 14, fontWeight: 600, color: T.ink, padding: '10px 0', minWidth: 0 }}
          />
          {q && (
            <button
              onClick={() => setQ('')}
              style={{ background: 'none', border: 'none', color: T.ink3, cursor: 'pointer', padding: 0, display: 'flex' }}
              aria-label="Clear"
            >
              <Icon name="x" size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Results */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {!q.trim() && (
          <div style={{ padding: '40px 24px', textAlign: 'center', color: T.ink3 }}>
            <Icon name="search" size={32} color={T.ink4} />
            <div style={{ fontSize: 13, fontWeight: 600, marginTop: 12, color: T.ink2 }}>Find any booking</div>
            <div style={{ fontSize: 11, marginTop: 6, lineHeight: 1.5, maxWidth: 280, margin: '6px auto 0' }}>
              Type a booking ID (e.g. <strong>BK-2841</strong>), guest name, phone, email, or any word from the special-request notes. Past, future, cancelled — everything in your diary is searchable.
            </div>
          </div>
        )}
        {q.trim() && results.length === 0 && (
          <div style={{ padding: '40px 24px', textAlign: 'center', color: T.ink3 }}>
            <Icon name="search" size={28} color={T.ink4} />
            <div style={{ fontSize: 13, fontWeight: 600, marginTop: 10, color: T.ink2 }}>No matches</div>
            <div style={{ fontSize: 11, marginTop: 4 }}>Try a different spelling, or fewer characters.</div>
          </div>
        )}
        {results.map((b, i) => {
          const rt = rtById[b.roomTypeId];
          const checkOutIdx = (b.startIdx || 0) + (b.nights || 1);
          const isCancelled = b.status === 'cancelled';
          const isCheckedin = b.status === 'checkedin';
          const balance = (b.total || 0) - (b.paid || 0);
          return (
            <button
              key={`${b.id}-${i}`}
              onClick={() => { onClose(); go && go('booking', b.id); }}
              style={{
                width: '100%', textAlign: 'left',
                padding: '12px 14px', borderBottom: `1px solid ${T.borderSoft}`,
                background: 'transparent', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 12,
                opacity: isCancelled ? 0.55 : 1,
              }}
              className="atithi-tap"
            >
              <div style={{
                width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                background: T[rt && rt.tag] || T.bgSunk, color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 800, letterSpacing: 0.3,
              }}>
                {(b.guest || '?').trim().split(/\s+/).map(s => s[0] || '').join('').slice(0, 2).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
                  <span className="tnum" style={{ fontSize: 11, fontWeight: 800, color: T.primary, letterSpacing: 0.4 }}>{b.id}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }}>{b.guest}</span>
                  {isCheckedin && <span style={{ fontSize: 9, fontWeight: 800, color: T.indigo, letterSpacing: 0.4 }}>· IN-HOUSE</span>}
                  {isCancelled && <span style={{ fontSize: 9, fontWeight: 800, color: T.ink3, letterSpacing: 0.4, textDecoration: 'line-through' }}>· CANCELLED</span>}
                </div>
                <div style={{ fontSize: 11, color: T.ink3, marginTop: 2, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span>{fmtStayDay(b.startIdx)} → {fmtStayDay(checkOutIdx)}</span>
                  {rt && <span>· {rt.name}</span>}
                  {b.phone && <span className="tnum">· {b.phone}</span>}
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div className="tnum" style={{ fontSize: 12, fontWeight: 700, color: T.ink }}>₹{((b.total || 0) / 1000).toFixed(1)}k</div>
                <div className="tnum" style={{ fontSize: 9, fontWeight: 700, marginTop: 1, color: balance > 0 ? T.danger : T.ok }}>
                  {balance > 0 ? `₹${balance.toLocaleString('en-IN')} due` : 'Paid'}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

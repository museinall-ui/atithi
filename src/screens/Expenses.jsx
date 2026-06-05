import { useState, useMemo, useRef } from 'react';
import { T } from '../tokens.js';
import { ANCHOR, ymd } from '../data.js';
import { buildCsv, downloadCsv } from '../utils/csv.js';
import Icon from '../components/Icon.jsx';
import Card from '../components/Card.jsx';
import SectionHead from '../components/SectionHead.jsx';
import ScreenHeader from '../components/ScreenHeader.jsx';

// Default expense categories shown in the picker. Hoteliers commonly
// track groceries (kitchen / linen), salaries (staff), utilities
// (power / water / gas), maintenance (repairs / cleaning supplies),
// supplies (toiletries / paper goods), transport (cab / fuel),
// marketing (ads / commissions), other (everything else).
// Hoteliers can extend this list with their own custom categories
// — those are stored on property.accountant.expenseCategories.
const DEFAULT_CATEGORIES = [
  { id: 'groceries',   label: 'Groceries',   icon: 'inr' },
  { id: 'salaries',    label: 'Salaries',    icon: 'users' },
  { id: 'utilities',   label: 'Utilities',   icon: 'plug' },
  { id: 'maintenance', label: 'Maintenance', icon: 'cog' },
  { id: 'supplies',    label: 'Supplies',    icon: 'tag' },
  { id: 'transport',   label: 'Transport',   icon: 'arrow' },
  { id: 'marketing',   label: 'Marketing',   icon: 'chart' },
  { id: 'other',       label: 'Other',       icon: 'edit' },
];
const PAID_VIA = ['cash', 'upi', 'card', 'bank'];

function fmtINR(n) {
  if (!n) return '₹0';
  return '₹' + Math.round(n).toLocaleString('en-IN');
}

function firstOfMonth(d) {
  const x = new Date(d); x.setDate(1); x.setHours(0,0,0,0); return x;
}
function lastOfMonth(d) {
  const x = new Date(d.getFullYear(), d.getMonth() + 1, 0); x.setHours(0,0,0,0); return x;
}

// Native-date pill — same pattern Reports and Diary use so a tap
// anywhere on the bar opens the OS date picker reliably.
function DatePill({ value, onChange, label }) {
  const ref = useRef(null);
  const open = () => {
    const el = ref.current;
    if (el && typeof el.showPicker === 'function') {
      try { el.showPicker(); } catch {}
    }
  };
  const filled = !!value;
  const display = filled
    ? new Date(value + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : label;
  return (
    <div
      onClick={open}
      style={{ flex: 1, position: 'relative', height: 38, background: filled ? T.primaryLt : T.bgSoft, border: `1px solid ${filled ? T.primary : T.border}`, borderRadius: 8, cursor: 'pointer', minWidth: 0 }}
    >
      <input ref={ref} type="date" value={value} onChange={(e) => onChange(e.target.value)} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer', border: 'none' }} />
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px', pointerEvents: 'none', fontSize: 12, fontWeight: 700, color: filled ? T.primaryDk : T.ink2, whiteSpace: 'nowrap', overflow: 'hidden' }}>
        <Icon name="cal" size={12} color={filled ? T.primaryDk : T.ink2} />
        {display}
      </div>
    </div>
  );
}

export default function Expenses({ go, t, expenses = [], onAdd, onRemove, onUpdate, property, onChangeProperty }) {
  // Merged category list: built-in defaults + property-defined custom
  // categories. Stored on accountant.expenseCategories — that field
  // is already a jsonb that round-trips cleanly, so no migration is
  // needed for custom categories.
  const customCategories = useMemo(() => {
    const arr = property?.accountant?.expenseCategories;
    return Array.isArray(arr) ? arr : [];
  }, [property]);
  const CATEGORIES = useMemo(() => [...DEFAULT_CATEGORIES, ...customCategories], [customCategories]);

  // Translated display labels. Default categories + payment methods map to
  // i18n keys; custom categories keep their user-entered name. The CSV export
  // deliberately stays in English (raw .label) for clean accountant handoff.
  const CAT_KEY = { groceries: 'catGroceries', salaries: 'catSalaries', utilities: 'catUtilities', maintenance: 'catMaintenance', supplies: 'catSupplies', transport: 'catTransport', marketing: 'catMarketing', other: 'catOther' };
  const catLabelById = (id) => {
    if (CAT_KEY[id]) return t(CAT_KEY[id]);
    const c = CATEGORIES.find(x => x.id === id);
    return c ? c.label : id;
  };
  const PAY_KEY = { cash: 'payCash', upi: 'payUpi', card: 'payCard', bank: 'payBank' };
  const payLabel = (p) => (PAY_KEY[p] ? t(PAY_KEY[p]) : p);

  // Add-expense form state. Reset after each successful add.
  const today = ymd(new Date(ANCHOR));
  const [date, setDate] = useState(today);
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('groceries');
  const [paidVia, setPaidVia] = useState('cash');
  const [note, setNote] = useState('');

  // Add-new-category inline form. Tapping "+ Add custom" expands the
  // category picker into a small inline editor.
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCatLabel, setNewCatLabel] = useState('');
  const saveNewCategory = () => {
    const label = newCatLabel.trim();
    if (!label) return;
    const id = 'cx_' + Date.now().toString(36);
    const next = [...customCategories, { id, label, icon: 'tag' }];
    if (onChangeProperty) {
      onChangeProperty(prev => ({
        ...prev,
        accountant: { ...(prev.accountant || {}), expenseCategories: next },
      }));
    }
    setCategory(id);  // auto-select the just-added category
    setNewCatLabel('');
    setAddingCategory(false);
  };
  const removeCustomCategory = (id) => {
    const next = customCategories.filter(c => c.id !== id);
    if (onChangeProperty) {
      onChangeProperty(prev => ({
        ...prev,
        accountant: { ...(prev.accountant || {}), expenseCategories: next },
      }));
    }
    if (category === id) setCategory('groceries');
  };

  // Range-filter the ledger. Defaults to current calendar month
  // (same convention as Reports).
  const todayDate = new Date(ANCHOR);
  const [rangeStart, setRangeStart] = useState(() => ymd(firstOfMonth(todayDate)));
  const [rangeEnd, setRangeEnd] = useState(() => ymd(lastOfMonth(todayDate)));

  const filtered = useMemo(() => {
    return expenses.filter(e => e.date >= rangeStart && e.date <= rangeEnd);
  }, [expenses, rangeStart, rangeEnd]);

  // Per-category totals + grand total for the period header.
  const summary = useMemo(() => {
    const byCat = {};
    let total = 0;
    for (const e of filtered) {
      byCat[e.category] = (byCat[e.category] || 0) + (e.amount || 0);
      total += e.amount || 0;
    }
    return { byCat, total };
  }, [filtered]);

  const add = () => {
    const amt = Math.round(parseFloat(amount));
    if (!isFinite(amt) || amt <= 0) return;
    const expense = {
      id: 'ex_' + Date.now().toString(36),
      date,
      amount: amt,
      category,
      note: note.trim(),
      paidVia,
    };
    onAdd && onAdd(expense);
    // Keep the date / category / paidVia so consecutive entries on the
    // same day stay quick. Reset just amount + note.
    setAmount('');
    setNote('');
  };

  const exportCsv = () => {
    const rows = filtered.map(e => [
      e.date, e.category,
      (CATEGORIES.find(c => c.id === e.category) || { label: e.category }).label,
      e.amount, e.paidVia || '', e.note || '',
    ]);
    // Per-category summary footer
    rows.push([]);
    rows.push([`Period: ${rangeStart} → ${rangeEnd}`]);
    rows.push(['SUMMARY BY CATEGORY']);
    rows.push(['Category', 'Total (₹)']);
    Object.entries(summary.byCat).forEach(([cat, amt]) => {
      const label = (CATEGORIES.find(c => c.id === cat) || { label: cat }).label;
      rows.push([label, amt]);
    });
    rows.push([]);
    rows.push(['GRAND TOTAL', summary.total]);
    const header = ['Date', 'Category code', 'Category', 'Amount (₹)', 'Paid via', 'Note'];
    downloadCsv(`atithi-expenses-${rangeStart}-to-${rangeEnd}`, buildCsv(header, rows));
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: T.bg }}>
      <ScreenHeader
        title={t('expensesTitle')}
        subtitle={`${filtered.length} ${t('expEntries')} · ${fmtINR(summary.total)} ${t('expThisPeriod')}`}
        onBack={() => go('more')}
        right={<button onClick={exportCsv} style={{ background: 'none', border: 'none', color: T.primary, fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="download" size={13} stroke={2} color={T.primary} /> {t('exportLabel')}</button>}
      />

      <div style={{ flex: 1, overflow: 'auto', padding: 16, paddingBottom: 100 }}>
        {/* Add new expense */}
        <SectionHead title={t('addExpenseSection')} style={{ marginTop: 0 }} />
        <Card padding={14} style={{ marginBottom: 16 }}>
          {/* Big amount input — the focal point. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', background: T.bgSoft, border: `1.5px solid ${T.primary}`, borderRadius: 10, marginBottom: 12 }}>
            <span style={{ fontSize: 20, color: T.ink3, fontWeight: 700 }}>₹</span>
            <input onFocus={(e) => e.target.select()}
              type="number"
              inputMode="numeric"
              autoFocus
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              className="tnum"
              style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 26, fontWeight: 800, color: T.ink, minWidth: 0, letterSpacing: -0.4 }}
            />
          </div>

          {/* Date + paid-via row */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <DatePill value={date} onChange={setDate} label={t('expDate')} />
          </div>

          {/* Category picker — defaults + custom (with × delete on custom)
              + an 'Add custom' pill at the end. Tapping the add pill
              expands an inline input to name the new category. */}
          <div style={{ fontSize: 10, color: T.ink3, fontWeight: 700, letterSpacing: 0.4, marginBottom: 6 }}>{t('expCategory')}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 12 }}>
            {CATEGORIES.map(c => {
              const sel = category === c.id;
              const isCustom = customCategories.some(x => x.id === c.id);
              return (
                <button
                  key={c.id}
                  onClick={() => setCategory(c.id)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '5px 10px', borderRadius: 999,
                    border: `1.5px solid ${sel ? T.primary : T.border}`,
                    background: sel ? T.primaryLt : T.card,
                    color: sel ? T.primaryDk : T.ink2,
                    fontSize: 10.5, fontWeight: 700, cursor: 'pointer',
                  }}
                >
                  <Icon name={c.icon} size={10} color={sel ? T.primaryDk : T.ink3} />
                  {catLabelById(c.id)}
                  {isCustom && (
                    <span
                      onClick={(e) => { e.stopPropagation(); removeCustomCategory(c.id); }}
                      title={t('removeCatTip').replace('{label}', c.label)}
                      style={{ marginLeft: 2, color: sel ? T.primaryDk : T.ink3, opacity: 0.7, fontSize: 13, lineHeight: 1, cursor: 'pointer', padding: '0 2px' }}
                    >×</span>
                  )}
                </button>
              );
            })}
            {!addingCategory && (
              <button
                onClick={() => setAddingCategory(true)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '5px 10px', borderRadius: 999,
                  border: `1.5px dashed ${T.border}`,
                  background: T.card, color: T.ink3,
                  fontSize: 10.5, fontWeight: 700, cursor: 'pointer',
                }}
              >
                <Icon name="plus" size={10} color={T.ink3} stroke={2.2} />
                {t('addCustomCat')}
              </button>
            )}
          </div>
          {addingCategory && (
            <div style={{ display: 'flex', gap: 4, marginBottom: 12, alignItems: 'center' }}>
              <input
                autoFocus
                value={newCatLabel}
                onChange={(e) => setNewCatLabel(e.target.value.slice(0, 24))}
                onKeyDown={(e) => { if (e.key === 'Enter') saveNewCategory(); if (e.key === 'Escape') { setAddingCategory(false); setNewCatLabel(''); } }}
                placeholder={t('newCatPlaceholder')}
                style={{ flex: 1, padding: '7px 10px', border: `1px solid ${T.primary}`, borderRadius: 7, fontSize: 12, color: T.ink, background: T.card, outline: 'none' }}
              />
              <button
                onClick={saveNewCategory}
                disabled={!newCatLabel.trim()}
                style={{ padding: '7px 12px', borderRadius: 7, border: 'none', background: newCatLabel.trim() ? T.primary : T.bgSoft, color: newCatLabel.trim() ? '#fff' : T.ink3, fontSize: 11, fontWeight: 700, cursor: newCatLabel.trim() ? 'pointer' : 'not-allowed' }}
              >{t('saveShort')}</button>
              <button
                onClick={() => { setAddingCategory(false); setNewCatLabel(''); }}
                style={{ padding: '7px 10px', borderRadius: 7, border: `1px solid ${T.border}`, background: T.card, color: T.ink3, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
              >{t('cancel')}</button>
            </div>
          )}

          {/* Paid via */}
          <div style={{ fontSize: 10, color: T.ink3, fontWeight: 700, letterSpacing: 0.4, marginBottom: 6 }}>{t('paidViaLabel')}</div>
          <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
            {PAID_VIA.map(p => {
              const sel = paidVia === p;
              return (
                <button
                  key={p}
                  onClick={() => setPaidVia(p)}
                  style={{
                    flex: 1, padding: '6px 0', borderRadius: 6,
                    border: `1px solid ${sel ? T.primary : T.border}`,
                    background: sel ? T.primaryLt : T.card,
                    color: sel ? T.primaryDk : T.ink3,
                    fontSize: 10.5, fontWeight: 700, cursor: 'pointer', textTransform: 'uppercase',
                  }}
                >{payLabel(p)}</button>
              );
            })}
          </div>

          {/* Note */}
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('expNotePlaceholder')}
            style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', border: `1px solid ${T.border}`, borderRadius: 7, fontSize: 12, color: T.ink, background: T.card, outline: 'none', marginBottom: 12 }}
          />

          <button
            onClick={add}
            disabled={!amount || +amount <= 0}
            style={{
              width: '100%', padding: '10px 12px', borderRadius: 8,
              border: 'none',
              background: (!amount || +amount <= 0) ? T.bgSoft : T.primary,
              color: (!amount || +amount <= 0) ? T.ink3 : '#fff',
              fontSize: 13, fontWeight: 700, cursor: (!amount || +amount <= 0) ? 'not-allowed' : 'pointer',
            }}
          >{t('addExpenseBtn')}</button>
        </Card>

        {/* Period picker + summary */}
        <SectionHead title={t('ledger')} />
        <Card padding={12} style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            <DatePill value={rangeStart} onChange={setRangeStart} label={t('rangeFrom')} />
            <span style={{ color: T.ink3, fontSize: 13, fontWeight: 700, alignSelf: 'center' }}>→</span>
            <DatePill value={rangeEnd} onChange={setRangeEnd} label={t('rangeTo')} />
          </div>
          {summary.total > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {Object.entries(summary.byCat).sort((a, b) => b[1] - a[1]).map(([cat, amt]) => {
                const label = catLabelById(cat);
                const pct = summary.total ? Math.round((amt / summary.total) * 100) : 0;
                return (
                  <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, padding: '3px 0' }}>
                    <span style={{ width: 70, color: T.ink2, fontWeight: 600 }}>{label}</span>
                    <div style={{ flex: 1, height: 5, background: T.bgSoft, borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: T.primary }} />
                    </div>
                    <span className="tnum" style={{ width: 75, textAlign: 'right', color: T.ink, fontWeight: 700 }}>{fmtINR(amt)}</span>
                  </div>
                );
              })}
              <div style={{ borderTop: `1px solid ${T.borderSoft}`, paddingTop: 6, marginTop: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: T.ink }}>{t('total')}</span>
                <span className="tnum" style={{ fontSize: 16, fontWeight: 800, color: T.primaryDk, letterSpacing: -0.3 }}>{fmtINR(summary.total)}</span>
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 11, color: T.ink3, fontStyle: 'italic', padding: '6px 2px' }}>
              {t('noExpensesPeriod')}
            </div>
          )}
        </Card>

        {/* Entries list */}
        {filtered.length > 0 && (
          <Card padding={0}>
            {filtered.map((e, i, arr) => {
              const c = CATEGORIES.find(c => c.id === e.category) || { label: e.category, icon: 'tag' };
              const dateLabel = new Date(e.date + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
              return (
                <div key={e.id} style={{
                  padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10,
                  borderBottom: i < arr.length - 1 ? `1px solid ${T.borderSoft}` : 'none',
                }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: T.bgSoft, color: T.ink2, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon name={c.icon} size={14} stroke={2} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>{catLabelById(e.category)}{e.paidVia ? <span style={{ marginLeft: 6, fontSize: 9, color: T.ink3, fontWeight: 700, letterSpacing: 0.3 }}>· {payLabel(e.paidVia).toUpperCase()}</span> : ''}</div>
                    {e.note && <div style={{ fontSize: 11, color: T.ink3, fontWeight: 600, marginTop: 2, lineHeight: 1.4 }}>{e.note}</div>}
                    <div style={{ fontSize: 10, color: T.ink3, fontWeight: 600, marginTop: 2 }} className="tnum">{dateLabel}</div>
                  </div>
                  <span className="tnum" style={{ fontSize: 14, fontWeight: 700, color: T.ink, flexShrink: 0 }}>{fmtINR(e.amount)}</span>
                  <button
                    onClick={() => onRemove && onRemove(e.id)}
                    title={t('deleteExpense')}
                    style={{ background: 'none', border: 'none', color: T.ink3, cursor: 'pointer', padding: 4 }}
                  ><Icon name="x" size={13} /></button>
                </div>
              );
            })}
          </Card>
        )}
      </div>
    </div>
  );
}

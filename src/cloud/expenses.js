import { supabase } from '../supabase.js';

// Cloud sync for the daily expense tracker. Mirrors the saved-extras /
// cash-closes pattern: load on sign-in, diff-sync per-action.
//
// Local shape (preserved across the boundary so screens don't change):
//   expenses: [{ id, date, amount, category, note, paidVia, createdAt }]
//
// `date` is a plain YYYY-MM-DD string — not a day-idx. Expenses are
// tracked against real calendar dates so the ledger is meaningful
// across months / years independent of the ANCHOR.

export async function loadExpenses(propertyId) {
  const { data, error } = await supabase
    .from('expenses')
    .select('*')
    .eq('property_id', propertyId)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(r => ({
    id: r.id,
    date: r.date,
    amount: r.amount || 0,
    category: r.category || 'other',
    note: r.note || '',
    paidVia: r.paid_via || '',
    createdAt: r.created_at,
  }));
}

export async function seedExpenses(propertyId, userId, localExpenses) {
  if (!localExpenses || !localExpenses.length) return;
  const rows = localExpenses.map(e => ({
    ...(isUuid(e.id) ? { id: e.id } : {}),
    property_id: propertyId,
    date: e.date,
    amount: e.amount || 0,
    category: e.category || 'other',
    note: e.note || '',
    paid_via: e.paidVia || '',
    created_by: userId || null,
  }));
  const { error } = await supabase.from('expenses').insert(rows);
  if (error) throw error;
}

export async function addExpenseCloud(propertyId, userId, expense) {
  const row = {
    ...(isUuid(expense.id) ? { id: expense.id } : {}),
    property_id: propertyId,
    date: expense.date,
    amount: expense.amount || 0,
    category: expense.category || 'other',
    note: expense.note || '',
    paid_via: expense.paidVia || '',
    created_by: userId || null,
  };
  const { data, error } = await supabase
    .from('expenses')
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  return {
    id: data.id,
    date: data.date,
    amount: data.amount || 0,
    category: data.category || 'other',
    note: data.note || '',
    paidVia: data.paid_via || '',
    createdAt: data.created_at,
  };
}

export async function removeExpenseCloud(expenseId) {
  if (!isUuid(expenseId)) return;
  const { error } = await supabase.from('expenses').delete().eq('id', expenseId);
  if (error) throw error;
}

export async function updateExpenseCloud(expenseId, patch) {
  if (!isUuid(expenseId)) return;
  const row = {};
  if ('date' in patch)     row.date = patch.date;
  if ('amount' in patch)   row.amount = patch.amount || 0;
  if ('category' in patch) row.category = patch.category || 'other';
  if ('note' in patch)     row.note = patch.note || '';
  if ('paidVia' in patch)  row.paid_via = patch.paidVia || '';
  if (Object.keys(row).length === 0) return;
  const { error } = await supabase.from('expenses').update(row).eq('id', expenseId);
  if (error) throw error;
}

function isUuid(s) {
  return typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

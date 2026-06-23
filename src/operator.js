// Client-side helper that decides whether to SHOW operator-only UI (the Operator
// Console entry in the Manage menu, and the console screen itself). This is a
// cosmetic gate only — the REAL enforcement lives server-side in
// api/aiosell-admin.js (Supabase access token -> caller's email -> must be in the
// ADMIN_EMAILS allowlist). So even if a non-operator reaches the screen, the
// server returns 403 and no cross-hotel data is exposed.
//
// The owner's email is already public in the git history, so listing it here
// leaks nothing. On the live deployment, set ADMIN_EMAILS (comma-separated) in
// Vercel to control who counts as an operator; keep this list in sync if you want
// the menu entry to appear for them too.
export const OPERATOR_EMAILS = ['museinall@gmail.com'];

export function isOperator(session) {
  const email = ((session && session.user && session.user.email) || '').toLowerCase();
  return !!email && OPERATOR_EMAILS.includes(email);
}

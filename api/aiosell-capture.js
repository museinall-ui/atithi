// TEMPORARY diagnostic endpoint.
//
// Purpose: see EXACTLY what AIOSELL's pre-onboarding sandbox "Webhook Tester"
// sends to a PMS URL — most importantly, whether/how it authenticates (the
// tester UI has no credentials field, so we can't know without looking). This
// endpoint just echoes the incoming request (method + headers + parsed body)
// back in its response, so it shows up in the tester's "Response" tab.
//
// It requires NO auth, touches NO database, and exposes NO secrets — it only
// reflects what the caller already sent. Safe to deploy; will be removed once
// we've captured what we need.
export default async function handler(req, res) {
  res.status(200).json({
    ok: true,
    note: 'Atithi capture endpoint — echoes what you sent so we can inspect it.',
    method: req.method,
    headers: req.headers || {},
    body: (req.body !== undefined ? req.body : null),
  });
}

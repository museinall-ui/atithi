// Vercel serverless function — turns a spoken booking command into
// structured booking fields using Claude Haiku 4.5.
//
// Why server-side: the Anthropic API key is a secret. The hotelier
// configures it once in Vercel's env vars and the function holds it;
// the browser never sees it. The function authenticates the caller via
// their Supabase access token (Bearer header) and verifies they're an
// active member of the property they're booking for — same pattern as
// api/send-to-ca.js.
//
// We use forced tool use (tool_choice) to get a guaranteed-shape JSON
// object back ("structured output via tool use") — no fragile parsing
// of free-form model text.
//
// Owner-side setup (one-time, ~2 min):
//   1. Create an API key at console.anthropic.com → API Keys
//   2. In Vercel → Settings → Environment Variables, add:
//        ANTHROPIC_API_KEY = sk-ant-xxxxxxxx
//   3. Redeploy (push any commit) so the env var is picked up
//
// Until that's set, this function returns 503 {code:'no_anthropic'} and
// the client falls back to its built-in rule-based parser. Note: like
// all /api/* functions, this only runs on the deployed Vercel site — a
// local `npm run dev` (Vite) returns 404, which the client also treats
// as "fall back to rules".

import Anthropic from '@anthropic-ai/sdk';

const SUPABASE_URL = 'https://vaerzwmglfwslvqqcyhx.supabase.co';
const SUPABASE_ANON = 'sb_publishable_q-vI9SlNncTWlCr3rhuS8A_umNHfj1V';

// Fast + cheap; this is a constrained extraction task. One-line swap to
// 'claude-opus-4-8' if the messiest real-world commands need it.
const MODEL = 'claude-haiku-4-5';

const SYSTEM = `You extract a single hotel-room booking from a manager's spoken command and call the create_booking tool with the structured fields.

Rules:
- Resolve relative dates ("tomorrow", "next Friday", "15th January") against the given today's date, and always output checkInDate as YYYY-MM-DD.
- Match the spoken room to exactly ONE of the provided room-type ids (closest match). If nothing matches, set roomTypeId to null but still fill roomTypeHeard with what was said.
- For "child under N", put age N-1 into childrenAges. Each child gets one entry.
- All money is in Indian rupees (plain integers, no symbols).
- Only fill a field if the command actually states or clearly implies it. Otherwise leave it null (or an empty array for childrenAges). Never invent a guest name, phone number, date, or price.`;

// Tool schema. All fields optional / nullable — the manager rarely says
// everything, and the client fills the gaps via the New Booking form.
const TOOL = {
  name: 'create_booking',
  description: 'Record the structured booking extracted from the spoken command.',
  input_schema: {
    type: 'object',
    properties: {
      checkInDate:   { type: ['string', 'null'], description: 'Check-in date as YYYY-MM-DD, resolved against today. null if not stated.' },
      nights:        { type: ['integer', 'null'], description: 'Number of nights. null if not stated.' },
      roomTypeId:    { type: ['string', 'null'], description: 'One of the provided room-type ids that best matches the spoken room, else null.' },
      roomTypeHeard: { type: ['string', 'null'], description: 'The room words as heard, e.g. "deluxe".' },
      adults:        { type: ['integer', 'null'], description: 'Number of adults. null if not stated.' },
      childrenAges:  { type: 'array', items: { type: 'integer' }, description: 'Ages of children in years. For "under N" use N-1. Empty array if no children.' },
      total:         { type: ['number', 'null'], description: 'Total tariff in rupees if stated, else null.' },
      advanceAmount: { type: ['number', 'null'], description: 'Advance / deposit / token received in rupees if stated, else null.' },
      paymentMethod: { type: ['string', 'null'], description: 'One of cash, upi, card, bank if a payment method is stated, else null.' },
      guestName:     { type: ['string', 'null'], description: 'Guest name if stated, else null.' },
      phone:         { type: ['string', 'null'], description: 'Guest phone digits if stated, else null.' },
      mealPlanId:    { type: ['string', 'null'], description: 'One of the provided meal-plan ids if a meal plan is stated, else null.' },
      notes:         { type: ['string', 'null'], description: 'Any special request mentioned, else null.' },
    },
    required: ['childrenAges'],
  },
};

function buildUserText(transcript, ctx) {
  const rooms = Array.isArray(ctx.roomTypes) && ctx.roomTypes.length
    ? ctx.roomTypes.map(r => `- ${r.id} — ${r.name}`).join('\n')
    : '(none configured)';
  const meals = Array.isArray(ctx.mealPlans) && ctx.mealPlans.length
    ? ctx.mealPlans.map(m => `${m.id} — ${m.label}`).join(', ')
    : '(none)';
  return [
    `Today is ${ctx.todayIso}.`,
    '',
    'Room types (id — name):',
    rooms,
    '',
    `Meal plans (id — name): ${meals}`,
    `Children pricing: free under age ${ctx.childFreeBelowAge}, half-rate under age ${ctx.childAgeBelow}.`,
    '',
    'Booking command (transcribed speech):',
    `"${transcript}"`,
  ].join('\n');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'POST only' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(503).json({
      error: 'Voice AI is not configured on this deployment yet. Add an ANTHROPIC_API_KEY env var in Vercel → Settings → Environment Variables, then redeploy.',
      code: 'no_anthropic',
    });
  }

  const { transcript, propertyId, context } = req.body || {};
  if (!transcript || typeof transcript !== 'string') {
    return res.status(400).json({ error: 'Missing transcript in body' });
  }
  if (!propertyId) {
    return res.status(400).json({ error: 'Missing propertyId in body' });
  }
  const ctx = context && typeof context === 'object' ? context : {};

  const authHeader = req.headers.authorization || '';
  const accessToken = authHeader.replace(/^Bearer\s+/i, '');
  if (!accessToken) {
    return res.status(401).json({ error: 'Sign-in required (no Authorization header)' });
  }

  try {
    // 1) Verify the access token via Supabase.
    const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: 'Bearer ' + accessToken, apikey: SUPABASE_ANON },
    });
    if (!userResp.ok) {
      return res.status(401).json({ error: 'Session expired — please sign in again' });
    }
    const user = await userResp.json();
    if (!user || !user.id) {
      return res.status(401).json({ error: 'Invalid session' });
    }

    // 2) Confirm membership (RLS-scoped through the user's own JWT).
    const memUrl = `${SUPABASE_URL}/rest/v1/memberships?user_id=eq.${encodeURIComponent(user.id)}&property_id=eq.${encodeURIComponent(propertyId)}&select=id,role&limit=1`;
    const memResp = await fetch(memUrl, {
      headers: { Authorization: 'Bearer ' + accessToken, apikey: SUPABASE_ANON, Accept: 'application/json' },
    });
    if (!memResp.ok) {
      return res.status(403).json({ error: 'Membership check failed' });
    }
    const mems = await memResp.json();
    if (!Array.isArray(mems) || mems.length === 0) {
      return res.status(403).json({ error: 'You are not a member of this property' });
    }

    // 3) Ask Claude to extract the booking via a forced tool call.
    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM,
      tools: [TOOL],
      tool_choice: { type: 'tool', name: 'create_booking' },
      messages: [{ role: 'user', content: buildUserText(transcript, ctx) }],
    });

    const toolUse = (msg.content || []).find(b => b.type === 'tool_use' && b.name === 'create_booking');
    if (!toolUse || !toolUse.input) {
      return res.status(502).json({ error: 'Model did not return a booking', stopReason: msg.stop_reason });
    }
    return res.status(200).json({ ok: true, draft: toolUse.input });
  } catch (e) {
    return res.status(502).json({ error: 'AI parse failed', detail: String(e?.message || e) });
  }
}

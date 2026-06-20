// Vercel serverless function — turns a spoken booking command into
// structured booking fields using an LLM.
//
// Provider-flexible: uses OpenAI if OPENAI_API_KEY is set, otherwise
// Anthropic (Claude) if ANTHROPIC_API_KEY is set. Same input, same output
// shape either way — so you can test on whichever account has credit and
// switch later by just changing the env var (no code change).
//
// Why server-side: the API key is a secret. The hotelier configures it
// once in Vercel's env vars and the function holds it; the browser never
// sees it. The function authenticates the caller via their Supabase
// access token (Bearer header) and verifies they're an active member of
// the property — same pattern as api/send-to-ca.js.
//
// We use forced tool / function calling to get a guaranteed-shape JSON
// object back ("structured output via tool use") — no fragile parsing of
// free-form model text.
//
// Owner-side setup (one-time, ~2 min) — pick ONE:
//   OpenAI:    create a key at platform.openai.com → API keys, then in
//              Vercel → Settings → Environment Variables add
//                OPENAI_API_KEY = sk-...
//   Anthropic: create a key at console.anthropic.com → API Keys, then add
//                ANTHROPIC_API_KEY = sk-ant-...
//   Then redeploy so the env var is picked up.
//
// Until a key is set, this returns 503 {code:'no_ai'} and the client
// falls back to its built-in rule-based parser. Note: like all /api/*
// functions, this only runs on the deployed Vercel site — a local
// `npm run dev` (Vite) returns 404, which the client also treats as
// "fall back to rules".

import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

const SUPABASE_URL = 'https://vaerzwmglfwslvqqcyhx.supabase.co';
const SUPABASE_ANON = 'sb_publishable_q-vI9SlNncTWlCr3rhuS8A_umNHfj1V';

// Fast + cheap models — this is a constrained extraction task. Both are
// easily swapped for a stronger model if the messiest real-world commands
// need it (e.g. 'gpt-4o' / 'claude-opus-4-8').
const OPENAI_MODEL = 'gpt-4o-mini';
const ANTHROPIC_MODEL = 'claude-haiku-4-5';

const TOOL_NAME = 'create_booking';
const TOOL_DESC = 'Record the structured booking extracted from the spoken command.';

const SYSTEM = `You extract a single hotel-room booking from a hotel manager's spoken command and call the create_booking tool with the structured fields.

The text comes from speech-to-text and MAY contain recognition errors, run-on words, or mixed Hindi/English (Hinglish). Infer the manager's intent rather than reading literally, and correct obvious mishearings.

Language & numbers:
- Understand common Hindi/Hinglish terms: aaj = today, kal = tomorrow, parso = day after tomorrow, raat/din = nights, aadmi/log/vyakti = adults, bachche/bachcha = children, kamra = room, advance/bayana/peshgi = advance/deposit, kul/total = total.
- Understand spoken numbers in Hindi or English (ek/one=1, do/two=2, teen/three=3, char/four=4, paanch/five=5, chhe/six=6). "do hazaar" = 2000, "paanch hazaar" = 5000, "ek lakh" = 100000.
- Money is Indian rupees — output plain integers (5000, never "5,000" or "₹5000"). "rupees", "rs", "/-" all mean rupees.

Rules:
- Resolve relative dates ("tomorrow", "next Friday", "15th January", "kal", "agle hafte") against the given today's date; always output checkInDate as YYYY-MM-DD. If a stated date would be in the past, assume the next future occurrence.
- Match the spoken room to exactly ONE of the provided room-type ids (closest match, tolerant of mishearings like "deluxe"/"dilux"/"delux"). If nothing matches, set roomTypeId to null but still fill roomTypeHeard with what was said.
- For "child under N", put age N-1 into childrenAges. Each child gets one entry.
- Distinguish the TOTAL tariff from the ADVANCE/deposit ("total 5000, 2000 advance" → total 5000, advanceAmount 2000).
- Only fill a field if the command actually states or clearly implies it. Otherwise leave it null (or an empty array for childrenAges). Never invent a guest name, phone number, date, or price.`;

// JSON Schema for the booking. All fields optional / nullable — the
// manager rarely says everything; the client fills the gaps via the New
// Booking form.
const PARAMS = {
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

async function parseWithOpenAI(apiKey, transcript, ctx) {
  const client = new OpenAI({ apiKey });
  const completion = await client.chat.completions.create({
    model: OPENAI_MODEL,
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: buildUserText(transcript, ctx) },
    ],
    tools: [{ type: 'function', function: { name: TOOL_NAME, description: TOOL_DESC, parameters: PARAMS } }],
    tool_choice: { type: 'function', function: { name: TOOL_NAME } },
  });
  const call = completion.choices && completion.choices[0]
    && completion.choices[0].message
    && completion.choices[0].message.tool_calls
    && completion.choices[0].message.tool_calls[0];
  if (!call || !call.function || !call.function.arguments) return null;
  try { return JSON.parse(call.function.arguments); } catch { return null; }
}

async function parseWithClaude(apiKey, transcript, ctx) {
  const client = new Anthropic({ apiKey });
  const msg = await client.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 1024,
    system: SYSTEM,
    tools: [{ name: TOOL_NAME, description: TOOL_DESC, input_schema: PARAMS }],
    tool_choice: { type: 'tool', name: TOOL_NAME },
    messages: [{ role: 'user', content: buildUserText(transcript, ctx) }],
  });
  const tu = (msg.content || []).find(b => b.type === 'tool_use' && b.name === TOOL_NAME);
  return tu ? tu.input : null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'POST only' });
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!openaiKey && !anthropicKey) {
    return res.status(503).json({
      error: 'Voice AI is not configured on this deployment yet. Add an OPENAI_API_KEY (or ANTHROPIC_API_KEY) env var in Vercel → Settings → Environment Variables, then redeploy.',
      code: 'no_ai',
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

    // 3) Extract the booking via the configured provider (OpenAI preferred).
    const provider = openaiKey ? 'openai' : 'anthropic';
    const draft = openaiKey
      ? await parseWithOpenAI(openaiKey, transcript, ctx)
      : await parseWithClaude(anthropicKey, transcript, ctx);

    if (!draft) {
      return res.status(502).json({ error: 'Model did not return a booking', provider });
    }
    return res.status(200).json({ ok: true, draft, provider });
  } catch (e) {
    return res.status(502).json({ error: 'AI parse failed', detail: String(e?.message || e) });
  }
}

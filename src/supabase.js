import { createClient } from '@supabase/supabase-js';

// Atithi cloud database + auth.
//
// Both values come from your Supabase project (Project Settings → API).
// The publishable / anon key is SAFE in client code — it's designed to be
// public. The real security sits in Row Level Security policies on the
// database (see supabase/migrations/20260518_initial_schema.sql), which
// guarantee a user can only ever read or write rows belonging to a
// property they're a member of.
const SUPABASE_URL = 'https://vaerzwmglfwslvqqcyhx.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_q-vI9SlNncTWlCr3rhuS8A_umNHfj1V';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

// Where Supabase should send the user after they tap a magic link.
// Combines current origin with Vite's BASE_URL so the same code works on
// Vercel (base = '/'), GitHub Pages (base = '/atithi/') and localhost
// (base = '/atithi/') without any per-environment config.
export function authRedirectUrl() {
  if (typeof window === 'undefined') return undefined;
  return window.location.origin + (import.meta.env.BASE_URL || '/');
}

export function signInWithEmail(email) {
  return supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: authRedirectUrl() },
  });
}

// Google OAuth sign-in. Redirects the browser to Google's consent screen
// and Supabase brings them back via authRedirectUrl() with a session.
//
// Owner-side prerequisite (one-time, ~10 min):
//   1. Google Cloud Console → APIs & Services → Credentials → create an
//      OAuth 2.0 Client ID (type: Web application). Add the Supabase
//      callback URL (Supabase will show it to you) to "Authorized
//      redirect URIs".
//   2. Supabase dashboard → Authentication → Providers → Google → toggle
//      ON, paste the Client ID + Client Secret from step 1, click Save.
// Until this is done the call fails with provider_not_enabled — the UI
// surfaces a friendly hint instead of a raw error.
export function signInWithGoogle() {
  return supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: authRedirectUrl() },
  });
}

export function signOut() {
  return supabase.auth.signOut();
}

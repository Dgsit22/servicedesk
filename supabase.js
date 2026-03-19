// ─────────────────────────────────────────────────────────────
//  supabase.js  –  Shared client  (include on every page)
//  STEP 1: Replace the two values below with your own from:
//          Supabase Dashboard → Project Settings → API
// ─────────────────────────────────────────────────────────────

const SUPABASE_URL  = 'https://YOUR_PROJECT_ID.supabase.co';
const SUPABASE_ANON = 'YOUR_ANON_PUBLIC_KEY';

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON);

// ── Shared helpers ────────────────────────────────────────────

async function getSession() {
  const { data: { session } } = await db.auth.getSession();
  return session;
}

async function getProfile(uid) {
  const { data } = await db.from('profiles')
    .select('id, full_name, email, role, department')
    .eq('id', uid).single();
  return data;
}

async function signOut() {
  await db.auth.signOut();
  location.href = 'index.html';
}

// Base URL for redirects – change to your GitHub Pages URL
const BASE_URL = 'https://YOUR_USERNAME.github.io/servicedesk/';

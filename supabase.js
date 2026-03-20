// ─────────────────────────────────────────────────────────────
//  supabase.js  –  Shared client
//  NO service role key here — Edge Function handles user creation
// ─────────────────────────────────────────────────────────────

const SUPABASE_URL  = 'https://rxuofhrgrwefslbnuaka.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ4dW9maHJncndlZnNsYm51YWthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4MjU5NjcsImV4cCI6MjA4OTQwMTk2N30.iokvau5uyqGukV7kVmeZC6UeYqRnqz-WJ2eRSNhJmxw';

// ── GitHub Pages URL ──────────────────────────────────────────
const BASE_URL = 'https://dgsit22.github.io/servicedesk/';

// ─────────────────────────────────────────────────────────────
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON);

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

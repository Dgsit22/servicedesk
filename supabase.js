// ─────────────────────────────────────────────────────────────
//  supabase.js  –  Shared client  (include on every page)
// ─────────────────────────────────────────────────────────────

const SUPABASE_URL  = 'https://rxuofhrgrwefslbnuaka.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ4dW9maHJncndlZnNsYm51YWthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4MjU5NjcsImV4cCI6MjA4OTQwMTk2N30.iokvau5uyqGukV7kVmeZC6UeYqRnqz-WJ2eRSNhJmxw';

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON);

// ── Shared helpers ─────────────────────────────────────────────

async function getSession() {
  const { data: { session } } = await db.auth.getSession();
  return session;
}

async function getProfile(uid) {
  const { data } = await db.from('profiles')
    .select('id, full_name, email, role, roles, department, employee_id')
    .eq('id', uid).single();
  return data;
}

// Helper — check if user has a role in their roles[] array
function hasRole(profile, role) {
  if (!profile) return false;
  if (profile.role === role) return true;
  return Array.isArray(profile.roles) && profile.roles.includes(role);
}

// Helper — user can approve (is approver, manager, or TL)
function canApprove(profile) {
  if (!profile) return false;
  return hasRole(profile,'approver') || hasRole(profile,'manager') || hasRole(profile,'tl')
    || profile.role === 'admin';
}

async function signOut() {
  await db.auth.signOut();
  location.href = 'index.html';
}

// Base URL for redirects
const BASE_URL = 'https://dgsit22.github.io/servicedesk/';

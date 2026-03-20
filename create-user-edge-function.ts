// ─────────────────────────────────────────────────────────────
//  supabase/functions/create-user/index.ts
//
//  Creates a new user securely — service_role key never
//  leaves Supabase servers. Called from admin.html.
//
//  HOW TO DEPLOY (step by step below)
// ─────────────────────────────────────────────────────────────

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY      = Deno.env.get('SUPABASE_ANON_KEY')!

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  // ── 1. Verify the caller is a logged-in admin ────────────────
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return new Response(
      JSON.stringify({ error: 'Not authenticated' }),
      { status: 401, headers: cors }
    )
  }

  const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } }
  })

  const { data: { user: caller } } = await callerClient.auth.getUser()
  if (!caller) {
    return new Response(
      JSON.stringify({ error: 'Invalid session' }),
      { status: 401, headers: cors }
    )
  }

  const { data: callerProfile } = await callerClient
    .from('profiles')
    .select('role')
    .eq('id', caller.id)
    .single()

  if (!callerProfile || callerProfile.role !== 'admin') {
    return new Response(
      JSON.stringify({ error: 'Admin access required' }),
      { status: 403, headers: cors }
    )
  }

  // ── 2. Validate input ────────────────────────────────────────
  const body = await req.json()
  const { email, password, full_name, role, department } = body

  if (!email || !password || !full_name) {
    return new Response(
      JSON.stringify({ error: 'email, password and full_name are required' }),
      { status: 400, headers: cors }
    )
  }

  if (password.length < 8) {
    return new Response(
      JSON.stringify({ error: 'Password must be at least 8 characters' }),
      { status: 400, headers: cors }
    )
  }

  const validRoles = ['employee', 'technician', 'admin']
  if (role && !validRoles.includes(role)) {
    return new Response(
      JSON.stringify({ error: 'Invalid role' }),
      { status: 400, headers: cors }
    )
  }

  // ── 3. Create user with admin client ─────────────────────────
  const adminClient = createClient(SUPABASE_URL, SERVICE_KEY)

  const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,          // user can log in immediately, no email confirmation needed
    user_metadata: { full_name, department: department || '' }
  })

  if (createError) {
    return new Response(
      JSON.stringify({ error: createError.message }),
      { status: 400, headers: cors }
    )
  }

  // ── 4. Update profile row (trigger creates it, we set role) ──
  await new Promise(r => setTimeout(r, 600))   // wait for DB trigger

  const { error: profileError } = await adminClient
    .from('profiles')
    .update({
      full_name,
      role:       role || 'employee',
      department: department || ''
    })
    .eq('id', newUser.user.id)

  if (profileError) {
    // User created but profile update failed — not critical
    console.error('Profile update failed:', profileError.message)
  }

  // ── 5. Return success ────────────────────────────────────────
  return new Response(
    JSON.stringify({ ok: true, user_id: newUser.user.id }),
    { headers: { ...cors, 'Content-Type': 'application/json' } }
  )
})

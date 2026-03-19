// supabase/functions/create-user/index.ts
//
// Creates a new user in auth.users + sets their profile with role
// Called from Admin Panel — requires admin to be logged in
//
// DEPLOY:
//   supabase functions new create-user
//   paste this file into supabase/functions/create-user/index.ts
//   supabase functions deploy create-user --project-ref YOUR_PROJECT_ID
//
// No extra secrets needed — SUPABASE_SERVICE_ROLE_KEY is auto-available.

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

  // ── Verify caller is an admin ────────────────────────────────
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: cors })
  }

  const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } }
  })

  const { data: { user: caller } } = await callerClient.auth.getUser()
  if (!caller) {
    return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401, headers: cors })
  }

  const { data: callerProfile } = await callerClient
    .from('profiles')
    .select('role')
    .eq('id', caller.id)
    .single()

  if (!callerProfile || callerProfile.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Admin access required' }), { status: 403, headers: cors })
  }

  // ── Parse request ────────────────────────────────────────────
  const { email, password, full_name, role, department } = await req.json()

  if (!email || !password || !full_name) {
    return new Response(
      JSON.stringify({ error: 'email, password and full_name are required' }),
      { status: 400, headers: cors }
    )
  }

  if (!['employee', 'technician', 'admin'].includes(role)) {
    return new Response(
      JSON.stringify({ error: 'role must be employee, technician or admin' }),
      { status: 400, headers: cors }
    )
  }

  // ── Create user with service role client ─────────────────────
  const adminClient = createClient(SUPABASE_URL, SERVICE_KEY)

  // Create the auth user — email_confirm: true skips confirmation email
  // so the user can log in immediately with the temp password
  const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,   // ← skips the confirmation step
    user_metadata: { full_name, department: department || '' }
  })

  if (createError) {
    console.error('Create user error:', createError)
    return new Response(
      JSON.stringify({ error: createError.message }),
      { status: 400, headers: cors }
    )
  }

  // ── Set role in profiles table ───────────────────────────────
  // The trigger creates the profile row automatically,
  // but we need to update the role (default is 'employee')
  if (role !== 'employee') {
    const { error: roleError } = await adminClient
      .from('profiles')
      .update({ role, department: department || '', full_name })
      .eq('id', newUser.user.id)

    if (roleError) {
      console.error('Role update error:', roleError)
      // User was created — just log the role error, don't fail
    }
  } else {
    // Still update full_name and department even for employees
    await adminClient
      .from('profiles')
      .update({ full_name, department: department || '' })
      .eq('id', newUser.user.id)
  }

  return new Response(
    JSON.stringify({
      ok: true,
      user_id: newUser.user.id,
      email: newUser.user.email
    }),
    { headers: { ...cors, 'Content-Type': 'application/json' } }
  )
})

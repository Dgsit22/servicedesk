// supabase/functions/create-user/index.ts
// Paste this into the Edge Function editor and redeploy

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    // ── Get env vars — Supabase auto-provides these ──────────────
    const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')
    const SERVICE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const ANON_KEY      = Deno.env.get('SUPABASE_ANON_KEY')

    if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) {
      console.error('Missing env vars:', { SUPABASE_URL: !!SUPABASE_URL, SERVICE_KEY: !!SERVICE_KEY, ANON_KEY: !!ANON_KEY })
      return new Response(
        JSON.stringify({ error: 'Server configuration error — missing env vars' }),
        { status: 500, headers: cors }
      )
    }

    // ── Verify caller is authenticated ───────────────────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No auth token provided' }),
        { status: 401, headers: cors }
      )
    }

    // Use anon client with caller's JWT to verify identity
    const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } }
    })

    const { data: { user: caller }, error: authError } = await callerClient.auth.getUser()
    if (authError || !caller) {
      console.error('Auth error:', authError?.message)
      return new Response(
        JSON.stringify({ error: 'Invalid or expired session. Please sign out and back in.' }),
        { status: 401, headers: cors }
      )
    }

    // ── Verify caller is admin ───────────────────────────────────
    // Use service client to check profile (bypasses RLS issues)
    const adminClient = createClient(SUPABASE_URL, SERVICE_KEY)

    const { data: callerProfile, error: profileCheckError } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', caller.id)
      .single()

    if (profileCheckError) {
      console.error('Profile check error:', profileCheckError.message)
      return new Response(
        JSON.stringify({ error: 'Could not verify admin role: ' + profileCheckError.message }),
        { status: 403, headers: cors }
      )
    }

    if (!callerProfile || callerProfile.role !== 'admin') {
      return new Response(
        JSON.stringify({ error: 'Admin access required. Your role: ' + callerProfile?.role }),
        { status: 403, headers: cors }
      )
    }

    // ── Parse and validate request body ─────────────────────────
    const body = await req.json()
    const { email, password, full_name, role, department } = body

    if (!email)     return new Response(JSON.stringify({ error: 'Email is required' }), { status: 400, headers: cors })
    if (!password)  return new Response(JSON.stringify({ error: 'Password is required' }), { status: 400, headers: cors })
    if (!full_name) return new Response(JSON.stringify({ error: 'Full name is required' }), { status: 400, headers: cors })
    if (password.length < 8) return new Response(JSON.stringify({ error: 'Password must be at least 8 characters' }), { status: 400, headers: cors })

    const finalRole = ['employee', 'technician', 'admin'].includes(role) ? role : 'employee'

    // ── Create the new user ──────────────────────────────────────
    console.log('Creating user:', email, 'role:', finalRole)

    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name, department: department || '' }
    })

    if (createError) {
      console.error('Create user error:', createError.message)
      return new Response(
        JSON.stringify({ error: createError.message }),
        { status: 400, headers: cors }
      )
    }

    const userId = newUser.user.id
    console.log('User created:', userId)

    // ── Update profile (wait for trigger to fire first) ──────────
    await new Promise(r => setTimeout(r, 800))

    const { error: updateError } = await adminClient
      .from('profiles')
      .update({ full_name, role: finalRole, department: department || '' })
      .eq('id', userId)

    if (updateError) {
      // Not critical — user was created, just role might default to employee
      console.error('Profile update error (non-fatal):', updateError.message)
    }

    console.log('Done — user', email, 'created with role', finalRole)

    return new Response(
      JSON.stringify({ ok: true, user_id: userId, email, role: finalRole }),
      { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    console.error('Unexpected error:', err)
    return new Response(
      JSON.stringify({ error: 'Unexpected error: ' + String(err) }),
      { status: 500, headers: cors }
    )
  }
})

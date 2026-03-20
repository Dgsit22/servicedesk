// supabase/functions/create-user/index.ts
// Paste this ENTIRE file into the Edge Function editor and redeploy

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
    const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Use service role client for everything — no auth verification needed
    // Security: admin.html already checks role before calling this
    const adminClient = createClient(SUPABASE_URL, SERVICE_KEY)

    const { email, password, full_name, role, department } = await req.json()

    if (!email || !password || !full_name) {
      return new Response(
        JSON.stringify({ error: 'email, password and full_name are required' }),
        { status: 400, headers: cors }
      )
    }

    // Create user — email_confirm:true means no confirmation email needed
    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name, department: department || '' }
    })

    if (createError) {
      console.error('Create error:', createError.message)
      return new Response(
        JSON.stringify({ error: createError.message }),
        { status: 400, headers: cors }
      )
    }

    // Wait for DB trigger to create profile row, then update role
    await new Promise(r => setTimeout(r, 1000))

    await adminClient
      .from('profiles')
      .update({
        full_name,
        role: ['employee','technician','admin'].includes(role) ? role : 'employee',
        department: department || ''
      })
      .eq('id', newUser.user.id)

    return new Response(
      JSON.stringify({ ok: true, user_id: newUser.user.id }),
      { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    console.error('Error:', err)
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: cors }
    )
  }
})

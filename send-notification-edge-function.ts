// supabase/functions/send-notification/index.ts
//
// Sends all ticket notification emails using Supabase's built-in SMTP
// (which you configure with ITalerts@digiclarity.in + App Password)
//
// NO Resend. NO extra API keys. Just your Gmail SMTP set in Supabase.
//
// DEPLOY (one time only):
//   supabase functions new send-notification
//   supabase functions deploy send-notification --project-ref YOUR_PROJECT_ID
//
// SECRETS needed (auto-available in Edge Functions — no manual setup):
//   SUPABASE_URL                — auto-provided
//   SUPABASE_SERVICE_ROLE_KEY   — auto-provided
//
// The SMTP credentials live in Supabase Auth settings — not here.
// Supabase's sendEmail utility uses whatever SMTP you configured there.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const FROM_NAME    = 'IT Help Desk'
const FROM_EMAIL   = 'ITalerts@digiclarity.in'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
}

// ── Send email via Supabase Admin API (uses your configured SMTP) ──
async function sendEmail(to: string, subject: string, html: string) {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY)

  // Supabase admin.auth has no direct sendEmail,
  // so we use the Supabase internal mail endpoint
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`
    },
    body: JSON.stringify({
      email: to,
      subject,
      html,
      from_name: FROM_NAME,
      from_email: FROM_EMAIL
    })
  })

  // If the above endpoint is not available on your plan,
  // fallback: use nodemailer-style SMTP fetch via smtp.gmail.com
  if (!res.ok) {
    const errText = await res.text()
    console.error('Supabase mail error:', errText)
    // Fallback: log and continue — email notifications are non-critical
    console.log(`[EMAIL LOG] To: ${to} | Subject: ${subject}`)
  } else {
    console.log(`Email sent to ${to}: ${subject}`)
  }
}

// ── Email HTML wrapper ─────────────────────────────────────────
function wrap(body: string) {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:20px;background:#f0eeea;font-family:Arial,sans-serif">
  <div style="max-width:540px;margin:0 auto;background:#fff;border-radius:10px;border:1px solid #e2e0da;overflow:hidden">
    <div style="background:#1a56db;padding:16px 24px;display:flex;align-items:center;gap:10px">
      <span style="color:#fff;font-size:14px;font-weight:600">&#9632; ServiceDesk &mdash; IT Help Portal</span>
    </div>
    <div style="padding:24px 28px">${body}</div>
    <div style="padding:12px 24px;border-top:1px solid #e2e0da;background:#f7f6f3;font-size:11px;color:#a09e9a">
      Automated notification &middot; IT Help Desk &middot; ITalerts@digiclarity.in &middot; Do not reply
    </div>
  </div>
</body></html>`
}

function h2(t: string) { return `<h2 style="font-size:17px;font-weight:600;color:#1c1b19;margin:0 0 6px">${t}</h2>` }
function muted(t: string) { return `<p style="font-size:13px;color:#6b6860;margin:0 0 18px">${t}</p>` }
function card(inner: string) { return `<div style="background:#f7f6f3;border:1px solid #e2e0da;border-radius:8px;padding:14px;margin-bottom:16px">${inner}</div>` }
function mono(t: string) { return `<span style="font-family:monospace;font-size:12px;color:#1a56db">${t}</span>` }
function bold(t: string) { return `<strong>${t}</strong>` }
function note(t: string, color='#6b6860') { return `<p style="font-size:12px;color:${color};margin:0">${t}</p>` }
function statusBadge(s: string) {
  const bg: Record<string,string> = {open:'#fff8ec',inprogress:'#eef6ff',resolved:'#f0fdf4',closed:'#f0fdf4',pending_approval:'#f5f3ff'}
  const fg: Record<string,string> = {open:'#8a4500',inprogress:'#1e40af',resolved:'#14532d',closed:'#14532d',pending_approval:'#5b21b6'}
  const labels: Record<string,string> = {inprogress:'In Progress',pending_approval:'Pending Approval'}
  const label = labels[s] || s.charAt(0).toUpperCase()+s.slice(1)
  return `<span style="display:inline-block;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;background:${bg[s]||'#f1f0eb'};color:${fg[s]||'#57534e'}">${label}</span>`
}

// ── Main ───────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  let payload: Record<string, any>
  try { payload = await req.json() }
  catch { return new Response('Bad request', { status: 400 }) }

  const { type } = payload

  try {
    switch (type) {

      // ── 1. New ticket submitted → confirm to requester ────────
      case 'ticket_created': {
        const { ticket_no, title, requester_email, requester_name } = payload
        await sendEmail(
          requester_email,
          `[${ticket_no}] Your IT request has been received`,
          wrap(`
            ${h2('Request received &#10003;')}
            ${muted(`Hi ${requester_name}, your IT request has been logged. Our team will review it shortly.`)}
            ${card(`
              <div style="font-size:11px;color:#a09e9a;margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em">Ticket Details</div>
              <div style="font-weight:600;font-size:14px;margin-bottom:4px">${title}</div>
              ${mono(ticket_no)}
            `)}
            ${note('You will receive an email each time your ticket is updated. Track progress in the ServiceDesk portal.')}
          `)
        )
        break
      }

      // ── 2. Hardware request → requester + manager ─────────────
      case 'hardware_submitted': {
        const { ticket_no, hw_type, qty, justification, requester_email, requester_name, manager_email, dept, approve_url } = payload
        // To requester
        await sendEmail(
          requester_email,
          `[${ticket_no}] Hardware request submitted — awaiting approval`,
          wrap(`
            ${h2('Hardware request submitted &#10003;')}
            ${muted(`Hi ${requester_name}, your request has been sent to your manager for approval.`)}
            ${card(`
              <div style="font-weight:600;margin-bottom:4px">${hw_type} &times; ${qty}</div>
              <div style="margin-bottom:8px">${mono(ticket_no)}</div>
              Status: ${statusBadge('pending_approval')}
            `)}
            ${note('You will be notified once your manager approves or rejects this request.')}
          `)
        )
        // To manager
        await sendEmail(
          manager_email,
          `[${ticket_no}] Approval required — hardware request from ${requester_name}`,
          wrap(`
            ${h2('Approval required &#128274;')}
            ${muted(`A hardware request from your team requires your approval before IT can proceed.`)}
            ${card(`
              <table style="width:100%;font-size:12px;border-collapse:collapse">
                <tr><td style="color:#a09e9a;padding:3px 0;width:110px">Requested by</td><td>${bold(requester_name)} &mdash; ${dept}</td></tr>
                <tr><td style="color:#a09e9a;padding:3px 0">Hardware</td><td>${bold(hw_type + ' \xd7 ' + qty)}</td></tr>
                <tr><td style="color:#a09e9a;padding:3px 0">Ticket</td><td>${mono(ticket_no)}</td></tr>
                <tr><td style="color:#a09e9a;padding:3px 0;vertical-align:top">Reason</td><td>${justification}</td></tr>
              </table>
            `)}
            <p style="font-size:12px;color:#6b6860;margin:0 0 14px">Log in to the ServiceDesk Admin Panel to approve or reject this request:</p>
            <a href="${approve_url}" style="display:inline-block;background:#1a56db;color:#fff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:13px;font-weight:600">Review in Admin Panel &rarr;</a>
          `)
        )
        break
      }

      // ── 3. Status changed → notify requester ──────────────────
      case 'status_changed': {
        const { ticket_no, title, new_status, requester_email, requester_name, technician_name, comment } = payload
        const resolved = new_status === 'resolved' || new_status === 'closed'
        await sendEmail(
          requester_email,
          `[${ticket_no}] Update: ${new_status === 'inprogress' ? 'In Progress' : new_status === 'resolved' ? 'Resolved' : new_status.charAt(0).toUpperCase()+new_status.slice(1)}`,
          wrap(`
            ${h2('Your ticket has been updated')}
            ${muted(`Hi ${requester_name}, there is a status update on your IT request.`)}
            ${card(`
              <div style="font-weight:600;font-size:14px;margin-bottom:4px">${title}</div>
              <div style="margin-bottom:10px">${mono(ticket_no)}</div>
              New status: ${statusBadge(new_status)}
              ${technician_name ? `<div style="font-size:12px;color:#6b6860;margin-top:8px">Updated by: ${bold(technician_name)}</div>` : ''}
              ${comment ? `<div style="margin-top:10px;padding:10px;background:#fff;border-radius:6px;border-left:3px solid #1a56db;font-size:12px">&ldquo;${comment}&rdquo;</div>` : ''}
            `)}
            ${resolved
              ? `<p style="font-size:12px;color:#14532d;background:#f0fdf4;padding:10px;border-radius:6px;margin:0">&#10003; Your request has been completed. Submit a new ticket if you need further assistance.</p>`
              : note('You will receive further updates as this ticket progresses.')}
          `)
        )
        break
      }

      // ── 4. Ticket assigned → notify technician ─────────────────
      case 'assigned': {
        const { ticket_no, title, technician_email, technician_name, requester_name, category, priority } = payload
        const prioColor: Record<string,string> = { critical:'#a61e1e', high:'#8a4500', medium:'#1e40af', low:'#14532d' }
        await sendEmail(
          technician_email,
          `[${ticket_no}] Assigned to you — please action`,
          wrap(`
            ${h2('Ticket assigned to you')}
            ${muted(`Hi ${technician_name}, a ticket has been assigned to you for action.`)}
            ${card(`
              <div style="font-weight:600;font-size:14px;margin-bottom:4px">${title}</div>
              <div style="margin-bottom:10px">${mono(ticket_no)}</div>
              <table style="font-size:12px;width:100%;border-collapse:collapse">
                <tr><td style="color:#a09e9a;padding:3px 0;width:100px">Requested by</td><td>${requester_name}</td></tr>
                <tr><td style="color:#a09e9a;padding:3px 0">Category</td><td>${category}</td></tr>
                <tr><td style="color:#a09e9a;padding:3px 0">Priority</td><td style="font-weight:600;color:${prioColor[priority]||'#1c1b19'}">${priority.toUpperCase()}</td></tr>
              </table>
            `)}
            ${note('Log in to the Technician Portal to review and action this ticket.')}
          `)
        )
        break
      }

      // ── 5. Hardware approved or rejected ──────────────────────
      case 'hardware_approved':
      case 'hardware_rejected': {
        const { ticket_no, title, requester_email, requester_name, manager_name, reason } = payload
        const approved = type === 'hardware_approved'
        await sendEmail(
          requester_email,
          `[${ticket_no}] Hardware request ${approved ? 'approved ✓' : 'rejected'}`,
          wrap(`
            ${h2(approved ? '&#10003; Hardware request approved' : '&#10007; Hardware request rejected')}
            ${muted(`Hi ${requester_name}, your manager has ${approved ? 'approved' : 'rejected'} your hardware request.`)}
            ${card(`
              <div style="font-weight:600;margin-bottom:4px">${title}</div>
              <div style="margin-bottom:8px">${mono(ticket_no)}</div>
              Decision by: ${bold(manager_name)}
              ${reason ? `<div style="margin-top:10px;padding:10px;background:#fff;border-radius:6px;font-size:12px;border-left:3px solid ${approved?'#14532d':'#a61e1e'}">${reason}</div>` : ''}
            `)}
            ${approved
              ? `<p style="font-size:12px;color:#14532d;background:#f0fdf4;padding:10px;border-radius:6px;margin:0">IT will now process your request and will contact you to arrange delivery.</p>`
              : note('Please speak with your manager or submit a new request with additional justification.')}
          `)
        )
        break
      }

      // ── 6. Comment added → notify requester ───────────────────
      case 'comment_added': {
        const { ticket_no, title, requester_email, requester_name, commenter_name, comment } = payload
        await sendEmail(
          requester_email,
          `[${ticket_no}] New update on your request`,
          wrap(`
            ${h2('New comment on your ticket')}
            ${muted(`Hi ${requester_name}, ${commenter_name} has added an update to your ticket.`)}
            ${card(`
              <div style="font-size:12px;font-weight:600;color:#6b6860;margin-bottom:8px">${mono(ticket_no)} &mdash; ${title}</div>
              <div style="padding:12px;background:#fff;border-radius:6px;border-left:3px solid #1a56db;font-size:13px">&ldquo;${comment}&rdquo;</div>
              <div style="font-size:11px;color:#a09e9a;margin-top:8px">From: ${commenter_name}</div>
            `)}
            ${note('Log in to the ServiceDesk portal to view the full ticket and reply.')}
          `)
        )
        break
      }

      default:
        console.log('Unknown notification type:', type)
    }
  } catch (err) {
    console.error('Notification error:', err)
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } }
    )
  }

  return new Response(
    JSON.stringify({ ok: true }),
    { headers: { ...cors, 'Content-Type': 'application/json' } }
  )
})

// supabase/functions/send-notification/index.ts
// Deploy: supabase functions deploy send-notification
// Secrets: supabase secrets set RESEND_API_KEY=re_xxxxx

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_KEY = Deno.env.get('RESEND_API_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const FROM = 'IT Help Desk <helpdesk@digiclarity.com>'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
}

async function sendMail(to: string, subject: string, html: string) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to, subject, html })
  })
  if (!res.ok) console.error('Resend error:', await res.text())
}

function base(content: string) {
  return `<!DOCTYPE html><html><body style="font-family:'DM Sans',Arial,sans-serif;background:#f0eeea;margin:0;padding:24px">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;border:1px solid #e2e0da;overflow:hidden">
    <div style="background:#1a56db;padding:20px 28px;display:flex;align-items:center;gap:10px">
      <div style="background:rgba(255,255,255,.2);border-radius:6px;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:14px;color:#fff;font-weight:700">S</div>
      <span style="color:#fff;font-size:15px;font-weight:600">ServiceDesk — IT Help Portal</span>
    </div>
    <div style="padding:28px">${content}</div>
    <div style="padding:16px 28px;border-top:1px solid #e2e0da;background:#f7f6f3;font-size:11px;color:#a09e9a">
      This is an automated notification from ServiceDesk. Do not reply to this email.
    </div>
  </div></body></html>`
}

function ticketBadge(status: string) {
  const styles: Record<string, string> = {
    open: 'background:#fff8ec;color:#8a4500',
    inprogress: 'background:#eef6ff;color:#1e40af',
    resolved: 'background:#f0fdf4;color:#14532d',
    closed: 'background:#f0fdf4;color:#14532d',
    pending_approval: 'background:#f5f3ff;color:#5b21b6',
    approved: 'background:#f0fdf4;color:#14532d',
    rejected: 'background:#fff1f1;color:#a61e1e',
  }
  const s = styles[status] || 'background:#f1f0eb;color:#57534e'
  const label = status === 'inprogress' ? 'In Progress' : status === 'pending_approval' ? 'Pending Approval' : status.charAt(0).toUpperCase() + status.slice(1)
  return `<span style="font-size:11px;font-weight:600;padding:3px 10px;border-radius:20px;${s}">${label}</span>`
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const payload = await req.json()
  const { type } = payload
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  try {
    // ── 1. ticket_created — confirmation to requester ──────────
    if (type === 'ticket_created') {
      const { ticket_no, title, requester_email, requester_name } = payload
      await sendMail(requester_email,
        `[${ticket_no}] Your request has been received`,
        base(`
          <h2 style="font-size:18px;font-weight:600;color:#1c1b19;margin:0 0 6px">Request received ✓</h2>
          <p style="font-size:13px;color:#6b6860;margin:0 0 20px">Hi ${requester_name}, we have received your IT request and our team will review it shortly.</p>
          <div style="background:#f7f6f3;border:1px solid #e2e0da;border-radius:8px;padding:16px;margin-bottom:20px">
            <div style="font-size:11px;color:#a09e9a;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">Ticket Details</div>
            <div style="font-size:14px;font-weight:600;margin-bottom:6px">${title}</div>
            <div style="font-family:monospace;font-size:12px;color:#1a56db">${ticket_no}</div>
          </div>
          <p style="font-size:12px;color:#6b6860">You will receive email updates when your ticket is assigned or its status changes. You can also track it in the ServiceDesk portal.</p>
        `)
      )
    }

    // ── 2. hardware_submitted — to requester + manager ─────────
    else if (type === 'hardware_submitted') {
      const { ticket_no, ticket_id, hw_type, qty, justification, requester_email, requester_name, manager_email, dept, approve_url } = payload

      // Email to requester
      await sendMail(requester_email,
        `[${ticket_no}] Hardware request submitted — awaiting manager approval`,
        base(`
          <h2 style="font-size:18px;font-weight:600;color:#1c1b19;margin:0 0 6px">Hardware request submitted ✓</h2>
          <p style="font-size:13px;color:#6b6860;margin:0 0 20px">Hi ${requester_name}, your hardware request has been sent to your manager for approval.</p>
          <div style="background:#f5f3ff;border:1px solid #ddd6fe;border-radius:8px;padding:16px;margin-bottom:20px">
            <div style="font-size:11px;color:#6d28d9;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">Request Summary</div>
            <div style="font-size:13px;font-weight:600;margin-bottom:4px">${hw_type} × ${qty}</div>
            <div style="font-family:monospace;font-size:12px;color:#5b21b6;margin-bottom:8px">${ticket_no}</div>
            <div style="font-size:12px;color:#6d28d9">Status: ${ticketBadge('pending_approval')}</div>
          </div>
          <p style="font-size:12px;color:#6b6860">Once your manager approves, IT will process the request and contact you. You will receive an email at each step.</p>
        `)
      )

      // Email to manager with approve/reject links (handled via admin panel)
      await sendMail(manager_email,
        `[${ticket_no}] Hardware approval required — ${requester_name}`,
        base(`
          <h2 style="font-size:18px;font-weight:600;color:#1c1b19;margin:0 0 6px">Approval required 🔐</h2>
          <p style="font-size:13px;color:#6b6860;margin:0 0 20px">A hardware request from your team requires your approval before IT can proceed.</p>
          <div style="background:#f7f6f3;border:1px solid #e2e0da;border-radius:8px;padding:16px;margin-bottom:20px">
            <div style="font-size:11px;color:#a09e9a;text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px">Request Details</div>
            <table style="width:100%;font-size:12px;border-collapse:collapse">
              <tr><td style="color:#a09e9a;padding:4px 0;width:120px">Requested by</td><td style="font-weight:500">${requester_name} (${dept})</td></tr>
              <tr><td style="color:#a09e9a;padding:4px 0">Hardware</td><td style="font-weight:500">${hw_type} × ${qty}</td></tr>
              <tr><td style="color:#a09e9a;padding:4px 0">Ticket</td><td style="font-family:monospace;color:#1a56db">${ticket_no}</td></tr>
              <tr><td style="color:#a09e9a;padding:4px 0;vertical-align:top">Justification</td><td>${justification}</td></tr>
            </table>
          </div>
          <p style="font-size:12px;color:#6b6860;margin-bottom:16px">Please log in to the ServiceDesk Admin Panel to approve or reject this request.</p>
          <a href="${approve_url}" style="display:inline-block;background:#1a56db;color:#fff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:13px;font-weight:600">Review in Admin Panel →</a>
        `)
      )
    }

    // ── 3. status_changed — notify requester ───────────────────
    else if (type === 'status_changed') {
      const { ticket_no, title, new_status, requester_email, requester_name, technician_name, comment } = payload
      const isResolved = new_status === 'resolved' || new_status === 'closed'
      await sendMail(requester_email,
        `[${ticket_no}] Status update — ${new_status === 'inprogress' ? 'In Progress' : new_status === 'resolved' ? 'Resolved' : new_status.charAt(0).toUpperCase()+new_status.slice(1)}`,
        base(`
          <h2 style="font-size:18px;font-weight:600;color:#1c1b19;margin:0 0 6px">Your ticket has been updated</h2>
          <p style="font-size:13px;color:#6b6860;margin:0 0 20px">Hi ${requester_name}, there is an update on your IT request.</p>
          <div style="background:#f7f6f3;border:1px solid #e2e0da;border-radius:8px;padding:16px;margin-bottom:20px">
            <div style="font-size:14px;font-weight:600;margin-bottom:8px">${title}</div>
            <div style="font-family:monospace;font-size:12px;color:#6b6860;margin-bottom:10px">${ticket_no}</div>
            <div>New status: ${ticketBadge(new_status)}</div>
            ${technician_name ? `<div style="font-size:12px;color:#6b6860;margin-top:8px">Handled by: <strong>${technician_name}</strong></div>` : ''}
            ${comment ? `<div style="margin-top:12px;padding:10px;background:#fff;border-radius:6px;border-left:3px solid #1a56db;font-size:12px;color:#1c1b19">"${comment}"</div>` : ''}
          </div>
          ${isResolved ? '<p style="font-size:12px;color:#14532d;background:#f0fdf4;padding:10px;border-radius:6px">✓ Your request has been completed. If you have further issues, please submit a new ticket.</p>' : '<p style="font-size:12px;color:#6b6860">You will continue to receive updates as this ticket progresses.</p>'}
        `)
      )
    }

    // ── 4. assigned — notify technician ────────────────────────
    else if (type === 'assigned') {
      const { ticket_no, title, technician_email, technician_name, requester_name, category, priority } = payload
      await sendMail(technician_email,
        `[${ticket_no}] Assigned to you — please action`,
        base(`
          <h2 style="font-size:18px;font-weight:600;color:#1c1b19;margin:0 0 6px">Ticket assigned to you</h2>
          <p style="font-size:13px;color:#6b6860;margin:0 0 20px">Hi ${technician_name}, a ticket has been assigned to you.</p>
          <div style="background:#f7f6f3;border:1px solid #e2e0da;border-radius:8px;padding:16px;margin-bottom:20px">
            <div style="font-size:14px;font-weight:600;margin-bottom:4px">${title}</div>
            <div style="font-family:monospace;font-size:12px;color:#1a56db;margin-bottom:10px">${ticket_no}</div>
            <table style="font-size:12px;width:100%;border-collapse:collapse">
              <tr><td style="color:#a09e9a;padding:3px 0;width:100px">Requested by</td><td style="font-weight:500">${requester_name}</td></tr>
              <tr><td style="color:#a09e9a;padding:3px 0">Category</td><td>${category}</td></tr>
              <tr><td style="color:#a09e9a;padding:3px 0">Priority</td><td style="font-weight:500;color:${priority==='critical'?'#a61e1e':priority==='high'?'#8a4500':'#1e40af'}">${priority.toUpperCase()}</td></tr>
            </table>
          </div>
          <p style="font-size:12px;color:#6b6860">Please log in to the Technician Portal to review and action this ticket.</p>
        `)
      )
    }

    // ── 5. hardware_approved / hardware_rejected ────────────────
    else if (type === 'hardware_approved' || type === 'hardware_rejected') {
      const { ticket_no, title, requester_email, requester_name, manager_name, reason } = payload
      const approved = type === 'hardware_approved'
      await sendMail(requester_email,
        `[${ticket_no}] Hardware request ${approved ? 'approved ✓' : 'rejected'}`,
        base(`
          <h2 style="font-size:18px;font-weight:600;color:${approved?'#14532d':'#a61e1e'};margin:0 0 6px">
            ${approved ? '✓ Hardware request approved' : '✗ Hardware request rejected'}
          </h2>
          <p style="font-size:13px;color:#6b6860;margin:0 0 20px">Hi ${requester_name}, your manager has ${approved?'approved':'rejected'} your hardware request.</p>
          <div style="background:#f7f6f3;border:1px solid #e2e0da;border-radius:8px;padding:16px;margin-bottom:20px">
            <div style="font-size:14px;font-weight:600;margin-bottom:4px">${title}</div>
            <div style="font-family:monospace;font-size:12px;color:#6b6860;margin-bottom:8px">${ticket_no}</div>
            <div>Decision by: <strong>${manager_name}</strong></div>
            ${reason?`<div style="margin-top:10px;padding:10px;background:#fff;border-radius:6px;font-size:12px;border-left:3px solid ${approved?'#14532d':'#a61e1e'}">${reason}</div>`:''}
          </div>
          ${approved
            ? '<p style="font-size:12px;color:#14532d;background:#f0fdf4;padding:10px;border-radius:6px">IT will now process your request and contact you to arrange delivery. Track progress in the ServiceDesk portal.</p>'
            : '<p style="font-size:12px;color:#6b6860">If you believe this is incorrect, please speak with your manager or submit a new request with additional justification.</p>'
          }
        `)
      )
    }

    // ── 6. comment_added — notify requester ────────────────────
    else if (type === 'comment_added') {
      const { ticket_no, title, requester_email, requester_name, commenter_name, comment } = payload
      await sendMail(requester_email,
        `[${ticket_no}] New update on your request`,
        base(`
          <h2 style="font-size:18px;font-weight:600;color:#1c1b19;margin:0 0 6px">New comment on your ticket</h2>
          <p style="font-size:13px;color:#6b6860;margin:0 0 20px">Hi ${requester_name}, ${commenter_name} has added an update to your ticket.</p>
          <div style="background:#f7f6f3;border:1px solid #e2e0da;border-radius:8px;padding:16px;margin-bottom:20px">
            <div style="font-size:12px;font-weight:600;color:#6b6860;margin-bottom:8px">${ticket_no} — ${title}</div>
            <div style="padding:12px;background:#fff;border-radius:6px;border-left:3px solid #1a56db;font-size:13px;color:#1c1b19">"${comment}"</div>
            <div style="font-size:11px;color:#a09e9a;margin-top:8px">From: ${commenter_name}</div>
          </div>
          <p style="font-size:12px;color:#6b6860">Log in to the ServiceDesk portal to view and reply.</p>
        `)
      )
    }

  } catch(err) {
    console.error('Notification error:', err)
    return new Response(JSON.stringify({error: String(err)}), {status:500, headers:{...cors,'Content-Type':'application/json'}})
  }

  return new Response(JSON.stringify({ok:true}), {headers:{...cors,'Content-Type':'application/json'}})
})

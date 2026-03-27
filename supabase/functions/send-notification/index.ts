// supabase/functions/send-notification/index.ts

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const FROM_EMAIL = Deno.env.get("FROM_EMAIL") || "ITalerts@digiclarity.in";
const APP_URL    = Deno.env.get("APP_URL")    || "https://dgsit22.github.io/servicedesk/";
const RESEND_KEY = Deno.env.get("RESEND_API_KEY") || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Send via Resend ──────────────────────────────────────────────
async function sendEmail(to: string, subject: string, html: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `ServiceDesk <${FROM_EMAIL}>`,
      to,
      subject,
      html,
    }),
  });
  if (!res.ok) throw new Error(await res.text());
}

// ── Helpers ──────────────────────────────────────────────────────
function baseTemplate(title: string, body: string) {
  return `<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f4f0;padding:32px 16px;margin:0">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">
  <div style="background:#1a56db;padding:20px 28px">
    <div style="color:#fff;font-size:18px;font-weight:700">&#9632; ServiceDesk</div>
    <div style="color:#93c5fd;font-size:12px;margin-top:2px">IT Help Portal · Digiclarity</div>
  </div>
  <div style="padding:28px">
    <div style="font-size:16px;font-weight:600;color:#1c1b19;margin-bottom:16px">${title}</div>
    ${body}
    <div style="margin-top:24px">
      <a href="${APP_URL}" style="display:inline-block;background:#1a56db;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600">Open ServiceDesk →</a>
    </div>
  </div>
  <div style="padding:16px 28px;background:#f7f6f3;border-top:1px solid #e2e0da;font-size:11px;color:#a09e9a">
    This is an automated message from ServiceDesk. Do not reply to this email.
  </div>
</div></body></html>`;
}

function row(label: string, value: string) {
  return `<div style="display:flex;gap:12px;padding:8px 0;border-bottom:1px solid #f0ede6;font-size:13px">
    <span style="color:#6b6860;min-width:110px;flex-shrink:0">${label}</span>
    <span style="font-weight:500;color:#1c1b19">${value}</span>
  </div>`;
}

function priorityColor(p: string) {
  const map: Record<string, string> = {
    critical: "#a61e1e", high: "#8a4500", medium: "#1e40af", low: "#14532d"
  };
  return map[p] || "#333";
}

function statusLabel(s: string) {
  const map: Record<string, string> = {
    inprogress: "In Progress", pending_approval: "Pending Approval",
    waiting_for_info: "Waiting for Info", resolved: "Resolved",
    closed: "Closed", open: "Open"
  };
  return map[s] || (s.charAt(0).toUpperCase() + s.slice(1));
}

// ── Main handler ─────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const payload = await req.json();
    const { type } = payload;
    let emailsSent = 0;

    // ── Test ──────────────────────────────────────────────────────
    if (type === "test") {
      const to = payload.test_email;
      if (to) {
        await sendEmail(
          to,
          "✅ ServiceDesk — Email Test Successful",
          baseTemplate("Email Configuration Working!", `
            <p style="font-size:13px;color:#6b6860;margin-bottom:16px">
              Your ServiceDesk email notifications are working correctly.
            </p>
            <div style="background:#f0fdf4;border-radius:10px;padding:16px;border-left:4px solid #16a34a">
              <div style="font-size:14px;font-weight:700;color:#14532d">✅ Resend verified</div>
              <div style="font-size:13px;color:#166534;margin-top:4px">All notification types are ready to send.</div>
            </div>
          `)
        );
        emailsSent++;
      }
    }

    // ── Ticket raised ─────────────────────────────────────────────
    if (type === "ticket_raised") {
      const { ticket_no, title, category, priority, description, requester_email, requester_name } = payload;
      if (requester_email) {
        await sendEmail(
          requester_email,
          `[${ticket_no}] Your IT request has been received`,
          baseTemplate(`✅ Request Received — ${ticket_no}`, `
            <p style="font-size:13px;color:#6b6860;margin-bottom:16px">Hi ${requester_name || "there"},</p>
            <p style="font-size:13px;color:#6b6860;margin-bottom:16px">Your IT request has been submitted successfully.</p>
            <div style="background:#f0f4ff;border-radius:10px;padding:16px;margin-bottom:16px;border-left:4px solid #1a56db">
              ${row("Ticket ID", `<strong style="font-family:monospace;color:#1a56db">${ticket_no}</strong>`)}
              ${row("Subject", title)}
              ${row("Category", category || "—")}
              ${row("Priority", `<span style="color:${priorityColor(priority)};font-weight:700">${(priority || "medium").toUpperCase()}</span>`)}
            </div>
            ${description ? `<div style="padding:12px;background:#f7f6f3;border-radius:8px;font-size:13px;color:#6b6860;border-left:3px solid #e2e0da;margin-bottom:16px">${description.slice(0, 400)}${description.length > 400 ? "…" : ""}</div>` : ""}
            <p style="font-size:12px;color:#a09e9a">Use your Ticket ID to track progress in ServiceDesk.</p>
          `)
        );
        emailsSent++;
      }
    }

    // ── Assigned ──────────────────────────────────────────────────
    if (type === "assigned") {
      const { ticket_no, title, category, priority, technician_email, technician_name, requester_name, description } = payload;
      if (technician_email) {
        await sendEmail(
          technician_email,
          `[${ticket_no}] Ticket assigned to you`,
          baseTemplate("📋 New Ticket Assigned to You", `
            <p style="font-size:13px;color:#6b6860;margin-bottom:16px">Hi ${technician_name},</p>
            <div style="background:#f0f4ff;border-radius:10px;padding:16px;margin-bottom:16px;border-left:4px solid #1a56db">
              ${row("Ticket", `<strong style="font-family:monospace;color:#1a56db">${ticket_no}</strong>`)}
              ${row("Subject", title)}
              ${row("Category", category || "—")}
              ${row("Priority", `<span style="color:${priorityColor(priority)};font-weight:700">${(priority || "medium").toUpperCase()}</span>`)}
              ${row("Requested by", requester_name || "—")}
            </div>
            ${description ? `<div style="padding:12px;background:#f7f6f3;border-radius:8px;font-size:13px;color:#6b6860;border-left:3px solid #e2e0da"><strong style="display:block;margin-bottom:4px;color:#1c1b19">Description:</strong>${description.slice(0, 400)}${description.length > 400 ? "…" : ""}</div>` : ""}
          `)
        );
        emailsSent++;
      }
    }

    // ── Transferred ───────────────────────────────────────────────
    if (type === "transferred") {
      const { ticket_no, title, category, priority, technician_email, technician_name, from_name, requester_name, handover_note, description } = payload;
      if (technician_email) {
        await sendEmail(
          technician_email,
          `[${ticket_no}] Ticket transferred to you`,
          baseTemplate("🔀 Ticket Transferred to You", `
            <p style="font-size:13px;color:#6b6860;margin-bottom:16px">Hi ${technician_name},</p>
            <p style="font-size:13px;color:#6b6860;margin-bottom:16px"><strong>${from_name || "A colleague"}</strong> has transferred a ticket to you.</p>
            <div style="background:#f5f3ff;border-radius:10px;padding:16px;margin-bottom:16px;border-left:4px solid #5b21b6">
              ${row("Ticket", `<strong style="font-family:monospace;color:#5b21b6">${ticket_no}</strong>`)}
              ${row("Subject", title)}
              ${row("Priority", `<span style="color:${priorityColor(priority)};font-weight:700">${(priority || "medium").toUpperCase()}</span>`)}
              ${row("Requested by", requester_name || "—")}
              ${row("Transferred from", from_name || "—")}
            </div>
            ${handover_note ? `<div style="padding:14px;background:#fefce8;border-radius:8px;border-left:3px solid #f59e0b;font-size:13px;margin-bottom:16px"><strong style="display:block;margin-bottom:6px;color:#92400e">Handover note:</strong>${handover_note}</div>` : ""}
            ${description ? `<div style="padding:12px;background:#f7f6f3;border-radius:8px;font-size:13px;color:#6b6860;border-left:3px solid #e2e0da"><strong style="display:block;margin-bottom:4px;color:#1c1b19">Description:</strong>${description.slice(0, 400)}${description.length > 400 ? "…" : ""}</div>` : ""}
          `)
        );
        emailsSent++;
      }
    }

    // ── Status changed ────────────────────────────────────────────
    if (type === "status_changed") {
      const { ticket_no, title, new_status, old_status, requester_email, requester_name, technician_name, note } = payload;
      if (requester_email && new_status) {
        let emoji = "•";
        let label = statusLabel(new_status);
        let color = "#1e40af";
        let bg    = "#eef6ff";
        let message = "Your ticket status has been updated.";

        if (new_status === "inprogress") {
          emoji = "🔵"; color = "#1e40af"; bg = "#eef6ff";
          message = "Your request is now being worked on by our IT team.";
        } else if (new_status === "waiting_for_info") {
          emoji = "⏳"; color = "#8a4500"; bg = "#fff8ec";
          message = "IT needs more information. Please open the ticket and add a comment.";
        } else if (new_status === "resolved") {
          emoji = "✅"; color = "#14532d"; bg = "#f0fdf4";
          message = "Your issue has been resolved. If the problem persists, please reopen the ticket.";
        } else if (new_status === "closed") {
          emoji = "🔒"; color = "#374151"; bg = "#f3f4f6";
          message = "This ticket has been closed. Thank you for using ServiceDesk.";
        } else if (new_status === "open" && (old_status === "closed" || old_status === "resolved")) {
          emoji = "🔄"; label = "Reopened"; color = "#8a4500"; bg = "#fff8ec";
          message = "Your ticket has been reopened. Our team will pick it up shortly.";
        } else if (new_status === "pending_approval") {
          emoji = "🔐"; color = "#5b21b6"; bg = "#f5f3ff";
          message = "Your hardware request is awaiting manager approval.";
        }

        await sendEmail(
          requester_email,
          `[${ticket_no}] ${emoji} Status updated: ${label}`,
          baseTemplate(`Ticket Update — ${label}`, `
            <p style="font-size:13px;color:#6b6860;margin-bottom:16px">Hi ${requester_name || "there"},</p>
            <div style="background:${bg};border-radius:10px;padding:14px 16px;margin-bottom:16px;border-left:4px solid ${color}">
              <div style="font-size:15px;font-weight:700;color:${color};margin-bottom:6px">${emoji} ${label}</div>
              <p style="font-size:13px;color:${color};margin:0">${message}</p>
            </div>
            ${row("Ticket", `<strong style="font-family:monospace;color:#1a56db">${ticket_no}</strong>`)}
            ${row("Subject", title)}
            ${row("Updated by", technician_name || "IT Team")}
            ${note ? `<div style="margin-top:14px;padding:12px;background:#f7f6f3;border-radius:8px;font-size:13px;border-left:3px solid #e2e0da"><strong style="display:block;margin-bottom:4px">Note from IT:</strong>${note}</div>` : ""}
          `)
        );
        emailsSent++;
      }
    }

    // ── Comment added ─────────────────────────────────────────────
    if (type === "comment_added") {
      const { ticket_no, title, requester_email, requester_name, commenter_name, comment } = payload;
      if (requester_email) {
        await sendEmail(
          requester_email,
          `[${ticket_no}] New update from IT`,
          baseTemplate("💬 New Comment on Your Ticket", `
            <p style="font-size:13px;color:#6b6860;margin-bottom:16px">Hi ${requester_name || "there"},</p>
            ${row("Ticket", `<strong style="font-family:monospace;color:#1a56db">${ticket_no}</strong>`)}
            ${row("Subject", title)}
            ${row("From", commenter_name || "IT Team")}
            <div style="margin-top:16px;padding:14px;background:#f7f6f3;border-radius:8px;font-size:13px;color:#1c1b19;border-left:3px solid #1a56db;line-height:1.6">${comment}</div>
          `)
        );
        emailsSent++;
      }
    }

    // ── Hardware approved / rejected ──────────────────────────────
    if (type === "hardware_approved" || type === "hardware_rejected") {
      const { ticket_no, title, requester_email, requester_name, manager_name, reason, serial_number } = payload;
      const approved = type === "hardware_approved";
      if (requester_email) {
        await sendEmail(
          requester_email,
          `[${ticket_no}] Hardware request ${approved ? "approved ✅" : "rejected ❌"}`,
          baseTemplate(`Hardware Request ${approved ? "Approved ✅" : "Rejected ❌"}`, `
            <p style="font-size:13px;color:#6b6860;margin-bottom:16px">Hi ${requester_name || "there"},</p>
            <p style="font-size:13px;color:#6b6860;margin-bottom:16px">Your hardware request has been <strong>${approved ? "approved" : "rejected"}</strong>.</p>
            <div style="background:${approved ? "#f0fdf4" : "#fff1f1"};border-radius:10px;padding:16px;margin-bottom:16px;border-left:4px solid ${approved ? "#16a34a" : "#a61e1e"}">
              ${row("Ticket", `<strong style="font-family:monospace">${ticket_no}</strong>`)}
              ${row("Request", title)}
              ${row("Decision by", manager_name || "Manager")}
              ${serial_number && approved ? row("Asset Serial No.", `<strong style="font-family:monospace;color:#1a56db">${serial_number}</strong>`) : ""}
              ${reason ? row("Note", reason) : ""}
            </div>
          `)
        );
        emailsSent++;
      }
    }

    // ── SLA breach ────────────────────────────────────────────────
    if (type === "sla_breach") {
      const { ticket_no, title, priority, requester_name, admin_email, hours_open } = payload;
      if (admin_email) {
        await sendEmail(
          admin_email,
          `🚨 SLA Breach: [${ticket_no}] ${title}`,
          baseTemplate("SLA Breach Alert", `
            <div style="padding:12px;background:#fff1f1;border-radius:8px;margin-bottom:16px;font-size:13px;color:#a61e1e;font-weight:600">
              🚨 This ticket has exceeded its SLA target
            </div>
            ${row("Ticket", ticket_no)}
            ${row("Title", title)}
            ${row("Priority", `<span style="color:${priorityColor(priority)};font-weight:700">${(priority || "").toUpperCase()}</span>`)}
            ${row("Requester", requester_name || "—")}
            ${row("Hours Open", String(hours_open) + "h")}
          `)
        );
        emailsSent++;
      }
    }

    return new Response(JSON.stringify({ ok: true, emailsSent }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("send-notification error:", err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

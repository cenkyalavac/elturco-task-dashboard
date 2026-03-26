import type { Express, Request, Response, NextFunction } from "express";
import type { Server } from "http";
import { storage, db } from "./storage";
import { taskNotes, pmFavorites } from "@shared/schema";
import { wsBroadcast } from "./ws";
import { gsWriteToColumn, gsIsAvailable, type SheetWriteConfig } from "./gsheets";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";

// Helper to safely extract string param (Express types req.params values as string | string[])
function param(req: Request, name: string): string {
  const v = req.params[name];
  return Array.isArray(v) ? v[0] : v;
}

// ============================================
// CONFIG
// ============================================
const BASE44_API = process.env.BASE44_API || "https://elts.base44.app/api/apps/694868412332f081649b2833/entities/Freelancer";
const BASE44_KEY = process.env.BASE44_KEY || "bf9b19a625ae4083ba38b8585fb5a78f";
const FROM_EMAIL = process.env.FROM_EMAIL || "ElTurco Projects <projects@eltur.co>";
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const SHEETDB_API_KEY = process.env.SHEETDB_API_KEY || "";
const MAGIC_LINK_EXPIRY_MINUTES = 30;
const SESSION_EXPIRY_HOURS = 72;

// Public URL — set SITE_PUBLIC_URL env var for self-hosting
const SITE_PUBLIC_URL = process.env.SITE_PUBLIC_URL || "https://dispatch.eltur.co";

// Slack webhook for notifications (optional)
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL || "";

// Account matching map: which freelancer accounts match which sheet sources
const ACCOUNT_MATCH: Record<string, string[]> = {
  "Amazon": ["Amazon", "Amazon SeCM", "Amazon PWS"],
  "AppleCare": ["Apple"],
  "L-Google": ["Google"],
  "WhatsApp": ["Whatsapp"],
  "TikTok": ["TikTok"],
  "Facebook": ["Facebook"],
};

// Specialization-based matching: when source doesn't map to an account, filter by specialization
const SPECIALIZATION_MATCH: Record<string, string[]> = {
  "Games": ["Game", "Gaming", "Game Localization", "Gaming Localization", "Gaming Translation", "Games Localization Specialist", "Video Games", "Video Game Localisation", "Videogame Localization", "Game Industry"],
};

// ============================================
// EMAIL — Proper Resend API with sandbox fallback
// ============================================

// Primary: Use Resend HTTP API directly (works on any server)
async function sendEmailViaResend(to: string[], subject: string, html: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Resend API error ${res.status}: ${err}`);
  }
  return res.json();
}

// Fallback: Perplexity sandbox external-tool (dev environment only)
function sendEmailViaSandbox(to: string[], subject: string, html: string) {
  try {
    const { execSync } = require("child_process");
    const params = JSON.stringify({
      source_id: "resend__pipedream",
      tool_name: "resend-send-email",
      arguments: { from: FROM_EMAIL, to, subject, html },
    });
    const escaped = params.replace(/'/g, "'\\''");
    const result = execSync(`external-tool call '${escaped}'`, { timeout: 30000 }).toString();
    return JSON.parse(result);
  } catch (e: any) {
    console.error("Sandbox email fallback failed:", e.message);
    throw e;
  }
}

async function sendEmail(to: string[], subject: string, html: string) {
  if (RESEND_API_KEY) {
    return sendEmailViaResend(to, subject, html);
  }
  // Fallback for Perplexity sandbox environment
  return sendEmailViaSandbox(to, subject, html);
}

// ============================================
// HELPERS
// ============================================

function generateToken(): string {
  return randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
}

// ============================================
// RESILIENT COLUMN LOOKUP
// ============================================
// Normalizes column names by stripping whitespace, newlines, special chars,
// and lowercasing — so "TR\nDeadline", "TR Deadline", " TR  Deadline " all match.
function normalizeColName(name: string): string {
  return name.replace(/[\s\n\r]+/g, "").toLowerCase().replace(/[^a-z0-9%]/g, "");
}

// Find a value in a row by trying multiple possible column names.
// Uses exact match first, then normalized fuzzy match.
function getCol(row: any, ...candidates: string[]): string {
  // Try exact matches first (fastest)
  for (const c of candidates) {
    if (row[c] !== undefined && row[c] !== null) return String(row[c]).trim();
  }
  // Fuzzy: normalize all row keys and candidate names
  const rowKeys = Object.keys(row);
  const normalizedMap = new Map<string, string>();
  for (const key of rowKeys) {
    normalizedMap.set(normalizeColName(key), key);
  }
  for (const c of candidates) {
    const normalized = normalizeColName(c);
    const matchKey = normalizedMap.get(normalized);
    if (matchKey && row[matchKey] !== undefined && row[matchKey] !== null) {
      return String(row[matchKey]).trim();
    }
  }
  return "";
}

// Resolve the public-facing base URL for links in emails.
// The most reliable approach: the frontend sends its own window.location.origin
// as `clientBaseUrl` in the request body.  All header-based detection is a
// fallback for the rare cases where the body field is missing.
function resolveBaseUrl(req: Request): string {
  // 1. Explicitly provided by the frontend (most reliable)
  const clientBase = req.body?.clientBaseUrl;
  if (clientBase && typeof clientBase === "string" && clientBase.startsWith("http")) {
    // Strip any trailing slash
    return clientBase.replace(/\/+$/, "");
  }
  // 2. Try Referer
  const referer = req.headers.referer || req.headers.referrer;
  if (referer) {
    try {
      const u = new URL(referer as string);
      return u.origin;
    } catch {}
  }
  // 3. Try Origin header
  const origin = req.headers.origin;
  if (origin && !origin.includes("localhost") && !origin.includes("127.0.0.1")) {
    return origin as string;
  }
  // 4. Forwarded headers
  const fwdProto = req.headers["x-forwarded-proto"];
  const fwdHost  = req.headers["x-forwarded-host"];
  if (fwdProto && fwdHost) {
    return `${fwdProto}://${fwdHost}`;
  }
  // 5. Fallback
  const proto = req.protocol || "http";
  const host  = req.headers.host || "localhost:5000";
  return `${proto}://${host}`;
}

// Build the API base URL from the request.  This is the server's own URL
// that the email recipient's browser will hit when they click a link.
// For deployed sites the proxy rewrites __PORT_5000__ paths, so the
// API lives at the same origin+path-prefix as the static files.
// Get the publicly-reachable API base URL.  The frontend sends it as
// `apiBaseUrl` in the request body (it knows the full proxy path).
// Falls back to host headers for cases where the body field is absent.
function buildApiBase(req: Request): string {
  const fromBody = req.body?.apiBaseUrl;
  if (fromBody && typeof fromBody === "string" && fromBody.startsWith("http")) {
    return fromBody.replace(/\/+$/, "");
  }
  const fwdProto = req.headers["x-forwarded-proto"] || req.protocol || "https";
  const fwdHost  = req.headers["x-forwarded-host"] || req.headers.host;
  if (fwdHost) return `${fwdProto}://${fwdHost}`;
  return `${req.protocol || "http"}://${req.headers.host || "localhost:5000"}`;
}

// Auth middleware
function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "No token provided" });
  const session = storage.getSession(token);
  if (!session) return res.status(401).json({ error: "Invalid session" });
  if (new Date(session.expiresAt) < new Date()) {
    storage.deleteSession(token);
    return res.status(401).json({ error: "Session expired" });
  }
  (req as any).pmUserId = session.pmUserId;
  next();
}

// ============================================
// TASK FETCHING FROM SHEETDB
// ============================================
function sheetDbHeaders(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (SHEETDB_API_KEY) h["Authorization"] = `Bearer ${SHEETDB_API_KEY}`;
  return h;
}

async function fetchSheetTasks(apiId: string, tabName: string, sheetLabel: string, source: string): Promise<any[]> {
  const url = `https://sheetdb.io/api/v1/${apiId}?sheet=${encodeURIComponent(tabName)}`;
  try {
    const res = await fetch(url, { headers: sheetDbHeaders() });
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data.map((row: any) => ({
      source,
      sheet: sheetLabel,
      projectId: extractProjectId(row, sheetLabel),
      account: extractAccount(row, sheetLabel),
      translator: extractTranslator(row, sheetLabel),
      reviewer: extractReviewer(row, sheetLabel),
      trDone: extractTrDone(row, sheetLabel),
      revComplete: extractRevComplete(row, sheetLabel),
      delivered: extractDelivered(row),
      deadline: extractDeadline(row, sheetLabel),
      total: extractTotal(row, sheetLabel),
      wwc: extractWWC(row, sheetLabel),
      revType: extractRevType(row),
      revDeadline: extractRevDeadline(row, sheetLabel),
      // CAT analysis breakdown (all using resilient getCol)
      catCounts: {
        ice: getCol(row, "ICE", "Ice", "ICE Match/101", "101%", "ICE/Context Match", "CM") || "0",
        rep: getCol(row, "Rep", "REP", "Reps", "Repetitions", "100%/Rep") || "0",
        match100: getCol(row, "100%", "100", "100% Match", "100% match review") || "0",
        fuzzy95: getCol(row, "95-99%", "95-99", "99-95%", "95% Match", "95% - 99%") || "0",
        fuzzy85: getCol(row, "85-94%", "85-94", "94-85%", "85% Match", "85% - 94%") || "0",
        fuzzy75: getCol(row, "75-84%", "75-84", "84-75%", "75% Match", "75% - 84%", "50-74%", "50% - 74%") || "0",
        noMatch: getCol(row, "No Match", "NM", "74-0%", "NoMatch", "New", "New Words") || "0",
        mt: getCol(row, "MT") || "0",
      },
      // Notes & metadata
      hoNote: getCol(row, "HO Note", "HO Notes", "HO Note // Q&A SHEET", "HO", "NOTE", "Comment"),
      trHbNote: getCol(row, "TR HB Note", "TR HB Notes", "TR\nHB Note", "TR Note", "Tra Note\n(Double-click to expand)", "Note for REV"),
      revHbNote: getCol(row, "Rev HB Note", "Rev HB Notes", "Rev\nHB Note", "Rev Note", "Rev. Note", "Rev HB Note", "HB Note"),
      instructions: getCol(row, "Instructions", "Instruction"),
      lqi: getCol(row, "LQI", "LQI?", "LQI ?"),
      qs: getCol(row, "QS", "QS (Num)"),
      projectTitle: getCol(row, "Project Title", "Title", "Project", "Project Name", "Job Name", "Task Name", "Project Name in XTM"),
      atmsId: getCol(row, "ATMS ID", "ATMS_ID", "APS Code"),
      symfonieLink: getCol(row, "Symfonie", "Symfonie link", "Symfonie Link", "SYM Link", "TP URL", "URL", "Link"),
      symfonieId: getCol(row, "Symfonie ID", "SymfonieID"),
      languagePair: extractLanguagePair(row, sheetLabel, source),
    })).filter((t: any) => t.projectId).map((t: any) => {
      // If TR Done or Rev Complete says Cancelled/On Hold, override delivered status
      const trLower = (t.trDone || "").trim().toLowerCase();
      const revLower = (t.revComplete || "").trim().toLowerCase();
      const cancelledValues = ["cancelled", "canceled", "on hold", "onhold", "on-hold"];
      if (t.delivered === "Ongoing" && (cancelledValues.includes(trLower) || cancelledValues.includes(revLower))) {
        t.delivered = trLower.includes("hold") || revLower.includes("hold") ? "On Hold" : "Cancelled";
      }
      return t;
    });
  } catch (e) {
    return [];
  }
}

// All extract functions use getCol() for resilient column matching.
// If a PM renames "ATMS ID" to "ATMS_ID" or adds/removes spaces, it still works.
function extractProjectId(row: any, sheet: string): string {
  if (sheet === "TPT") return getCol(row, "ATMS ID", "ATMS_ID", "ID");
  return getCol(row, "Project ID", "ProjectID", "ID", "Project code", "Job ID", "Job Code", "Task Name");
}
function extractAccount(row: any, sheet: string): string {
  if (sheet === "AFT") return getCol(row, "m", "Account") || "Amazon AFT";
  if (sheet === "DPX") return getCol(row, "Account") || "Amazon DPX";
  return getCol(row, "Account", "Division", "Product", "Client", "Organization");
}
function extractTranslator(row: any, sheet: string): string {
  return getCol(row, "TR ", "TR", "Translator", "Tra", "TER");
}
function extractReviewer(row: any, sheet: string): string {
  return getCol(row, "Rev", "REV", "Reviewer", "Rev.");
}
function extractTrDone(row: any, sheet: string): string {
  return getCol(row, "TR\nDone?", "TR Done?", "TR Dlvr", "TR Dlvr?", "TR Dlv?", "TR Delivered?", "TR delivered?", "TR Compl?", "TR Divr?", "Tra Dlv?");
}
function extractDelivered(row: any): string {
  const v = getCol(row, "Delivered?", "Delivered", "Dlvr?", "Divr?", "Comp?").toLowerCase().trim();
  if (v === "yes" || v === "y") return "Delivered";
  if (v === "cancelled" || v === "canceled") return "Cancelled";
  if (v === "on hold" || v === "onhold" || v === "on-hold") return "On Hold";
  if (!v) return "Ongoing";
  // Any other non-empty value is NOT ongoing — return as-is with capital
  return v.charAt(0).toUpperCase() + v.slice(1);
}
// Parse deadline string (DD.MM.YYYY HH:mm) to Date
function parseDeadline(d: string): Date | null {
  if (!d) return null;
  // Try DD.MM.YYYY HH:mm format
  const m = d.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})\s*(\d{1,2}):(\d{2})/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5]);
  // Try ISO or other parseable format
  const parsed = new Date(d);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function extractDeadline(row: any, sheet: string): string {
  // Try TR-specific deadline first; only fall back to generic "Deadline" if no Rev Deadline exists
  const trSpecific = getCol(row, "TR\nDeadline", "TR Deadline");
  if (trSpecific) return trSpecific;
  // For sheets that use a single "Deadline" column (e.g. Facebook Offline, Games)
  // only use it as TR deadline if there's no separate rev deadline column
  const genericDl = getCol(row, "Deadline");
  const revDl = getCol(row, "Rev. Deadline", "Rev Deadline", "Rev.\nDeadline", "Client Deadline", "Client\nDeadline");
  if (genericDl && !revDl) return genericDl;
  return genericDl || "";
}
function extractRevDeadline(row: any, sheet: string): string {
  if (sheet === "TPT") return getCol(row, "Client\nDeadline", "Client Deadline");
  // Try rev-specific deadline columns first
  const revSpecific = getCol(row, "Rev Deadline", "Rev. Deadline", "Rev.\nDeadline", "Client Deadline", "Client\nDeadline");
  if (revSpecific) return revSpecific;
  // Fall back to generic "Deadline" only if there's a separate TR Deadline (so "Deadline" is the rev one)
  const trSpecific = getCol(row, "TR\nDeadline", "TR Deadline");
  if (trSpecific) return getCol(row, "Deadline") || "";
  return "";
}
function extractTotal(row: any, sheet: string): string {
  return getCol(row, "Total", "TWC", "TOTAL", "WC", "Total WC") || "0";
}
function extractWWC(row: any, sheet: string): string {
  return getCol(row, "TR WWC", "WWC", "Client WWC") || "0";
}
function extractRevComplete(row: any, sheet: string): string {
  return getCol(row, "Rev\nDone?", "Rev Done?", "Rev Complete? (in minutes)", "Rev Complete?", "Time Spent\n(in minutes)", "Time Spent (in minutes)", "Rev Completed? (in minutes)", "Rev Compl?", "Rev Dlvr?", "Rev delivered?", "Rev Divr?", "Rev. Dlv?", "Time Spent", "Rev Time (min.)", "Time spent", "Rev QA");
}
function extractRevType(row: any): string {
  return getCol(row, "Rev Type", "Rev\nType", "Review Type", "REV Type", "Rev type");
}
function extractLanguagePair(row: any, sheet: string, source: string): string {
  // Try to detect from Language, Target, or Source/Target columns
  const lang = getCol(row, "Language", "Target", "Target Language", "target");
  if (lang) {
    const lv = lang.toLowerCase().trim();
    // Format: "ES-ES ► TR" or "ES-ES ▸ TR" or "es-ES > tr-TR" or "EN → TR"
    // Match all common arrow/separator characters: ► ▸ ▶ → > ➜ ➤ ⇒
    const arrowRegex = /[►▸▶→>➜➤⇒]/;
    if (arrowRegex.test(lv)) {
      const parts = lv.split(arrowRegex).map(s => s.trim());
      if (parts.length === 2 && parts[0] && parts[1]) {
        const src = parts[0].split("-")[0].toUpperCase();
        const tgt = parts[1].split("-")[0].toUpperCase();
        if (src && tgt) return `${src}>${tgt}`;
      }
    }
    // Just target language: "tr-TR" → assume EN>TR
    // But only if it looks like a locale code (2 chars or 2-2 format)
    const tgt = lv.split("-")[0].toUpperCase();
    if (tgt && tgt.length === 2 && tgt !== "EN") return `EN>${tgt}`;
  }
  return ""; // empty = use sheet config default
}

// ============================================
// REDIRECT PAGE (served by redirect endpoints)
// ============================================
function buildRedirectPage(targetUrl: string, message: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ElTurco Dispatch</title>
<style>body{margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f8f9fa;font-family:-apple-system,BlinkMacSystemFont,sans-serif}
.card{text-align:center;padding:40px;background:#fff;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,.08)}
.spinner{width:32px;height:32px;border:3px solid #e5e7eb;border-top-color:#3b82f6;border-radius:50%;animation:spin 1s linear infinite;margin:0 auto 16px}
@keyframes spin{to{transform:rotate(360deg)}}
p{color:#666;font-size:14px;margin:0}a{color:#3b82f6;font-size:13px;margin-top:12px;display:inline-block}</style>
</head><body>
<div class="card"><div class="spinner"></div><p>${message}</p><a href="${targetUrl}">Click here if not redirected</a></div>
<script>window.location.href=${JSON.stringify(targetUrl)};</script>
</body></html>`;
}

// ============================================
// EMAIL TEMPLATES
// ============================================
// Replace {{placeholders}} in a template string with values from a vars map
function replaceVars(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? "");
}

// Build the default email body when no custom body is provided
function buildDefaultOfferBody(vars: Record<string, string>, task?: any): string {
  const role = vars.role || "Translation";
  const isReviewer = role === "Review";
  const deadline = isReviewer ? (task?.revDeadline || vars.deadline) : vars.deadline;
  const deadlineLabel = isReviewer ? "Review Deadline" : "Translation Deadline";
  const rowA = (label: string, value: string) => `<tr><td style="padding:10px 14px;background:#f8f9fa;font-weight:600;color:#555;border-bottom:1px solid #eee;width:140px;font-size:13px">${label}</td><td style="padding:10px 14px;background:#f8f9fa;border-bottom:1px solid #eee;font-size:13px">${value}</td></tr>`;
  const rowB = (label: string, value: string) => `<tr><td style="padding:10px 14px;font-weight:600;color:#555;border-bottom:1px solid #eee;width:140px;font-size:13px">${label}</td><td style="padding:10px 14px;border-bottom:1px solid #eee;font-size:13px">${value}</td></tr>`;

  // CAT breakdown — translator only, individual match rows
  let catRows = "";
  if (!isReviewer && task?.catCounts) {
    const cc = task.catCounts;
    const cats = [
      { label: "ICE/CM", value: cc.ice },
      { label: "Repetitions", value: cc.rep },
      { label: "100%", value: cc.match100 },
      { label: "95-99%", value: cc.fuzzy95 },
      { label: "85-94%", value: cc.fuzzy85 },
      { label: "75-84%", value: cc.fuzzy75 },
      { label: "No Match", value: cc.noMatch },
      { label: "MT", value: cc.mt },
    ].filter(c => c.value && c.value !== "0" && c.value !== "0.0");
    if (cats.length > 0) {
      catRows = cats.map((c, i) => {
        const fn = i % 2 === 0 ? rowA : rowB;
        return fn(c.label, c.value);
      }).join("");
    }
  }

  // HO Note
  let hoNoteRow = "";
  if (task?.hoNote) {
    hoNoteRow = rowA("HO Note", `<span style="color:#e67e22">${task.hoNote}</span>`);
  }

  // Project title
  let titleRow = "";
  if (task?.projectTitle) {
    titleRow = rowB("Project", task.projectTitle);
  }

  // Review type (reviewer only)
  let revTypeRow = "";
  if (isReviewer && task?.revType) {
    revTypeRow = rowB("Review Type", task.revType);
  }

  return `<p style="font-size:15px;color:#333;margin:0 0 16px">Hello <strong>${vars.freelancerName}</strong>,</p>
<p style="font-size:14px;color:#555;margin:0 0 20px">We'd like to know if you're available for the following <strong>${role.toLowerCase()}</strong> task.</p>
<table style="width:100%;border-collapse:collapse;margin:0 0 8px;border-radius:8px;overflow:hidden;border:1px solid #eee">
${rowA("Account", vars.account)}
${titleRow}
${rowB("Project ID", vars.projectId)}
${rowA(deadlineLabel, `<span style="color:#e74c3c;font-weight:700">${deadline}</span>`)}
${isReviewer
  ? rowB("Total WC", vars.total)
  : rowA("Total / WWC", `${vars.total} / ${vars.wwc}`)}
${catRows}
${hoNoteRow}
${revTypeRow}
</table>`;
}

function buildOfferEmailHtml(task: any, offer: any, assignment: any, customSubject?: string, customBody?: string): { subject: string; html: string } {
  // Use clientBaseUrl (direct proxy URL) for the accept link — avoids hash fragment
  // loss when Perplexity loads the page in an iframe. Falls back to SITE_PUBLIC_URL.
  const base = offer.clientBaseUrl || SITE_PUBLIC_URL;
  const acceptUrl = `${base}#/respond/${offer.token}`;
  const role = assignment.role === "translator" ? "Translation" : "Review";

  const isReviewer = assignment.role === "reviewer";
  const deadline = isReviewer ? (task.revDeadline || task.deadline || "TBD") : (task.deadline || "TBD");
  const cc = task.catCounts || {};

  const vars: Record<string, string> = {
    freelancerName: offer.freelancerName || "",
    account: task.account || "",
    source: task.source || "",
    sheet: task.sheet || "",
    projectId: task.projectId || "",
    deadline,
    total: task.total || "N/A",
    wwc: task.wwc || "N/A",
    role,
    acceptUrl,
    projectTitle: task.projectTitle || "",
    hoNote: task.hoNote || "",
    revType: task.revType || "",
    ice: cc.ice || "0",
    rep: cc.rep || "0",
    match100: cc.match100 || "0",
    fuzzy95: cc.fuzzy95 || "0",
    fuzzy85: cc.fuzzy85 || "0",
    fuzzy75: cc.fuzzy75 || "0",
    noMatch: cc.noMatch || "0",
    mt: cc.mt || "0",
  };

  // Resolve subject
  let subject: string;
  if (customSubject) {
    subject = replaceVars(customSubject, vars);
  } else {
    const templateKey = assignment.role === "translator" ? "offer_translator" : "offer_reviewer";
    const tpl = storage.getEmailTemplate(templateKey);
    subject = tpl ? replaceVars(tpl.subject, vars) : `${role} Task — ${task.account} — ${task.projectId}`;
  }

  // Resolve body content
  let bodyContent: string;
  if (customBody) {
    bodyContent = replaceVars(customBody, vars);
  } else {
    const templateKey = assignment.role === "translator" ? "offer_translator" : "offer_reviewer";
    const tpl = storage.getEmailTemplate(templateKey);
    bodyContent = tpl ? replaceVars(tpl.body, vars) : buildDefaultOfferBody(vars, task);
  }

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<div style="max-width:600px;margin:0 auto;padding:24px">
<div style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">
  <div style="background:#1a1a2e;padding:24px 32px;color:#fff">
    <h1 style="margin:0;font-size:20px;font-weight:600">New ${role} Task</h1>
    <p style="margin:8px 0 0;opacity:0.7;font-size:14px">ElTurco Projects</p>
  </div>
  <div style="padding:28px 32px">
    ${bodyContent}
    <div style="text-align:center;margin:28px 0">
      <a href="${acceptUrl}" style="display:inline-block;padding:14px 48px;background:#16a34a;color:#fff;text-decoration:none;border-radius:8px;font-size:16px;font-weight:600;letter-spacing:0.02em">Accept Task</a>
    </div>
    <p style="margin:0;font-size:12px;color:#999;text-align:center;line-height:1.5">
      This link is unique to you. If you don't want to accept, click the link and use the 'Decline' button.
    </p>
  </div>
</div>
<p style="text-align:center;font-size:11px;color:#999;margin-top:16px">ElTurco Projects — projects@eltur.co</p>
</div>
</body>
</html>`;

  return { subject, html };
}

function buildMagicLinkEmailHtml(name: string, magicUrl: string): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<div style="max-width:500px;margin:0 auto;padding:32px 24px">
<div style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);text-align:center;padding:40px 32px">
  <div style="width:56px;height:56px;background:#1a1a2e;border-radius:14px;margin:0 auto 20px;display:flex;align-items:center;justify-content:center">
    <svg width="28" height="28" viewBox="0 0 32 32" fill="none"><rect width="32" height="32" rx="8" fill="#3b82f6"/><path d="M8 11h16M8 16h12M8 21h8" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/></svg>
  </div>
  <h1 style="margin:0 0 8px;font-size:22px;color:#1a1a2e">ElTurco Dispatch</h1>
  <p style="margin:0 0 24px;font-size:14px;color:#666">Hello ${name}, click the button below to sign in.</p>
  <a href="${magicUrl}" style="display:inline-block;padding:14px 48px;background:#3b82f6;color:#fff;text-decoration:none;border-radius:8px;font-size:16px;font-weight:600">Sign In</a>
  <p style="margin:20px 0 0;font-size:12px;color:#999">This link is valid for ${MAGIC_LINK_EXPIRY_MINUTES} minutes.</p>
</div>
</div>
</body>
</html>`;
}

// ============================================
// REGISTER ROUTES
// ============================================
// ============================================
// SERVER-SIDE CACHE for expensive external API calls
// ============================================
interface CacheEntry<T> { data: T; timestamp: number; }
const cache: Record<string, CacheEntry<any>> = {};
function getCached<T>(key: string, ttlMs: number): T | null {
  const entry = cache[key];
  if (entry && Date.now() - entry.timestamp < ttlMs) return entry.data as T;
  return null;
}
function setCache<T>(key: string, data: T): void {
  cache[key] = { data, timestamp: Date.now() };
}

// Helper to create notification + broadcast
function notify(type: string, title: string, message: string, metadata?: any) {
  try {
    const n = storage.createNotification({
      type, title, message,
      metadata: metadata ? JSON.stringify(metadata) : null,
      read: 0,
      createdAt: new Date().toISOString(),
    });
    wsBroadcast("notification", { ...n, metadata: metadata || null });
  } catch (e) {
    console.error("Notification create error (non-fatal):", e);
  }
}

export async function registerRoutes(server: Server, app: Express) {

  // ---- HEALTH CHECK ----
  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // ---- RATE LIMITING ----
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // 20 attempts per IP
    message: { error: "Too many login attempts. Please try again later." },
    standardHeaders: true,
    legacyHeaders: false,
  });

  const offerLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 30, // 30 requests per minute per IP
    message: { error: "Too many requests. Please slow down." },
  });

  // ---- AUTH ROUTES ----

  // Email + password login
  app.post("/api/auth/login", loginLimiter, async (req: Request, res: Response) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password are required." });

    const emailNorm = email.toLowerCase().trim();
    const pmUser = storage.getPmUserByEmail(emailNorm);
    if (!pmUser) return res.status(401).json({ error: "Invalid email or password." });
    // Support both bcrypt hashed and legacy plaintext passwords
    const isHashed = pmUser.password.startsWith("$2");
    const passwordMatch = isHashed
      ? await bcrypt.compare(password, pmUser.password)
      : pmUser.password === password;
    if (!passwordMatch) return res.status(401).json({ error: "Invalid email or password." });
    // Auto-upgrade plaintext password to bcrypt on successful login
    if (!isHashed) {
      const hashed = await bcrypt.hash(password, 10);
      storage.updatePmUser(pmUser.id, { password: hashed });
    }

    const sessionToken = generateToken();
    const expiresAt = new Date(Date.now() + SESSION_EXPIRY_HOURS * 3600 * 1000).toISOString();
    storage.createSession(sessionToken, pmUser.id, expiresAt);

    res.json({ token: sessionToken, user: { id: pmUser.id, email: pmUser.email, name: pmUser.name, initial: pmUser.initial || "", role: pmUser.role, defaultFilter: pmUser.defaultFilter || "ongoing", defaultMyProjects: !!pmUser.defaultMyProjects, defaultSource: (pmUser as any).defaultSource || "all", defaultAccount: (pmUser as any).defaultAccount || "all" } });
  });

  // ---- REDIRECT ENDPOINTS (no '#' in URL — safe for email clients) ----

  // Magic-link redirect: email links point here.
  // We serve an HTML page that does a client-side redirect so the hash
  // fragment is preserved (302 redirects drop the hash in most browsers).
  app.get("/api/auth/redirect/:token", (req: Request, res: Response) => {
    const authToken = storage.getAuthToken(param(req, "token"));
    if (!authToken || !authToken.clientBaseUrl) {
      return res.status(404).send("Invalid or expired link.");
    }
    const frontendUrl = `${authToken.clientBaseUrl}#/auth/verify/${param(req, "token")}`;
    res.type("html").send(buildRedirectPage(frontendUrl, "Signing you in..."));
  });

  // Offer redirect: freelancer email links point here
  app.get("/api/offers/redirect/:token", (req: Request, res: Response) => {
    const offer = storage.getOfferByToken(param(req, "token"));
    if (!offer) {
      return res.status(404).send("Offer not found or expired.");
    }
    const base = offer.clientBaseUrl || SITE_PUBLIC_URL;
    const frontendUrl = `${base}#/respond/${param(req, "token")}`;
    res.type("html").send(buildRedirectPage(frontendUrl, "Loading task details..."));
  });

  // Get current user
  app.get("/api/auth/me", requireAuth, (req: Request, res: Response) => {
    const session = storage.getSession(req.headers.authorization!.replace("Bearer ", ""));
    if (!session) return res.status(401).json({ error: "Invalid session" });
    const allUsers = storage.getAllPmUsers();
    const user = allUsers.find(u => u.id === session.pmUserId);
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ id: user.id, email: user.email, name: user.name, role: user.role });
  });

  app.post("/api/auth/logout", requireAuth, (req: Request, res: Response) => {
    const token = req.headers.authorization!.replace("Bearer ", "");
    storage.deleteSession(token);
    res.json({ success: true });
  });

  // ---- FREELANCER ROUTES ----

  app.get("/api/freelancers", requireAuth, async (_req: Request, res: Response) => {
    try {
      // Cache freelancers for 5 minutes (rarely changes)
      const cachedFl = getCached<any[]>("freelancers", 300000);
      if (cachedFl) return res.json(cachedFl);

      const response = await fetch(BASE44_API, {
        headers: { "Content-Type": "application/json", "api_key": BASE44_KEY },
      });
      const data = await response.json();
      // Return relevant fields only
      // Show Approved freelancers + specific test accounts by email
const TEST_EMAILS = ["cenkyalavac@gmail.com", "cenk.yalavac@gmail.com"];
const freelancers = (Array.isArray(data) ? data : [])
  .filter((f: any) => f.status === "Approved" || TEST_EMAILS.includes(f.email))
  .map((f: any) => ({
        id: f.id,
        fullName: f.full_name,
        resourceCode: f.resource_code,
        email: f.email,
        status: f.status,
        accounts: f.accounts || [],
        languagePairs: (f.language_pairs || []).map((lp: any) => `${lp.source_language}>${lp.target_language}`),
        serviceTypes: f.service_types || [],
        availability: f.availability,
        rates: f.rates || [],
        resourceRating: f.resource_rating,
        nativeLanguage: f.native_language,
        canDoLqa: f.can_do_lqa,
        specializations: f.specializations || [],
      }));
      setCache("freelancers", freelancers);
      res.json(freelancers);
    } catch (e: any) {
      res.status(500).json({ error: "Failed to fetch freelancer data: " + e.message });
    }
  });

  // ---- TASK ROUTES (SheetDB) ----

  // Shared task fetch function with 2-minute cache
  async function getAllTasksCached(): Promise<any[]> {
    const cached = getCached<any[]>("allTasks", 300000); // 5 min
    if (cached) return cached;

    const configs = storage.getAllSheetConfigs();
    const allTasks: any[] = [];
    const byApiId = new Map<string, typeof configs>();
    for (const c of configs) {
      if (!c.sheetDbId) continue;
      if (!byApiId.has(c.sheetDbId)) byApiId.set(c.sheetDbId, []);
      byApiId.get(c.sheetDbId)!.push(c);
    }
    // Batch parallel fetches (max 6 concurrent to avoid SheetDB rate limits)
    const FETCH_CONCURRENCY = 6;
    const fetchJobs: (() => Promise<void>)[] = [];
    byApiId.forEach((cfgs, apiId) => {
      for (const cfg of cfgs) {
        fetchJobs.push(() =>
          fetchSheetTasks(apiId, cfg.sheet, cfg.sheet, cfg.source)
            .then(rows => { allTasks.push(...rows); })
        );
      }
    });
    for (let i = 0; i < fetchJobs.length; i += FETCH_CONCURRENCY) {
      await Promise.all(fetchJobs.slice(i, i + FETCH_CONCURRENCY).map(fn => fn()));
    }
    setCache("allTasks", allTasks);
    return allTasks;
  }

  app.get("/api/tasks", requireAuth, async (req: Request, res: Response) => {
    try {
      const allTasks = await getAllTasksCached();

      // PM-specific filtering
      const pmEmail = (() => {
        const session = storage.getSession(req.headers.authorization!.replace("Bearer ", ""));
        if (!session) return null;
        const allUsers = storage.getAllPmUsers();
        const user = allUsers.find(u => u.id === session.pmUserId);
        return user?.email || null;
      })();
      const configs = storage.getAllSheetConfigs();
      const visibleSheets = new Set(
        configs.filter(c => {
          if (!c.assignedPms) return true;
          try { return (JSON.parse(c.assignedPms) as string[]).includes(pmEmail || ""); } catch { return true; }
        }).map(c => `${c.source}|${c.sheet}`)
      );
      const pmTasks = allTasks.filter((t: any) => visibleSheets.has(`${t.source}|${t.sheet}`));

      // Filter out delivered tasks by default
      const includeDelivered = req.query.includeDelivered === "true";
      const filtered = includeDelivered ? pmTasks : pmTasks.filter((t: any) => t.delivered !== "Delivered");

      // Overlay local assignment data onto tasks (covers SheetDB propagation delay)
      const allAssignments = storage.getAllAssignments();
      const assignMap = new Map<string, any[]>();
      for (const a of allAssignments) {
        if (a.status !== "accepted" && a.status !== "completed") continue;
        const key = `${a.source}|${a.sheet}|${a.projectId}`;
        if (!assignMap.has(key)) assignMap.set(key, []);
        assignMap.get(key)!.push(a);
      }
      const overlaid = filtered.map((t: any) => {
        const key = `${t.source}|${t.sheet}|${t.projectId}`;
        const matches = assignMap.get(key);
        if (!matches) return t;
        const copy = { ...t };
        for (const a of matches) {
          if (a.role === "translator" && (!copy.translator || copy.translator === "XX") && a.acceptedBy) {
            copy.translator = a.acceptedBy;
          }
          if (a.role === "reviewer" && (!copy.reviewer || copy.reviewer === "XX") && a.acceptedBy) {
            copy.reviewer = a.acceptedBy;
          }
        }
        return copy;
      });
      res.json(overlaid);
    } catch (e: any) {
      res.status(500).json({ error: "Failed to fetch task data: " + e.message });
    }
  });

  // ---- ASSIGNMENT ROUTES ----

  app.get("/api/assignments", requireAuth, (_req: Request, res: Response) => {
    const all = storage.getAllAssignments();
    const enriched = all.map(a => ({
      ...a,
      taskDetails: JSON.parse(a.taskDetails || "{}"),
      sequenceList: a.sequenceList ? JSON.parse(a.sequenceList) : null,
      broadcastList: a.broadcastList ? JSON.parse(a.broadcastList) : null,
      offers: storage.getOffersByAssignment(a.id),
    }));
    res.json(enriched);
  });

  app.get("/api/assignments/:id", requireAuth, (req: Request, res: Response) => {
    const a = storage.getAssignment(+param(req, "id"));
    if (!a) return res.status(404).json({ error: "Assignment not found" });
    res.json({
      ...a,
      taskDetails: JSON.parse(a.taskDetails || "{}"),
      sequenceList: a.sequenceList ? JSON.parse(a.sequenceList) : null,
      broadcastList: a.broadcastList ? JSON.parse(a.broadcastList) : null,
      offers: storage.getOffersByAssignment(a.id),
    });
  });

  // Cancel assignment and withdraw all pending offers
  app.post("/api/assignments/:id/cancel", requireAuth, (req: Request, res: Response) => {
    const assignment = storage.getAssignment(+param(req, "id"));
    if (!assignment) return res.status(404).json({ error: "Assignment not found" });
    if (assignment.status === "completed") {
      return res.status(400).json({ error: "Cannot cancel a completed assignment" });
    }

    const now = new Date().toISOString();
    storage.updateAssignment(assignment.id, { status: "cancelled" });

    const offers = storage.getOffersByAssignment(assignment.id);
    for (const offer of offers) {
      if (offer.status === "pending") {
        storage.updateOffer(offer.id, { status: "withdrawn", respondedAt: now });
      }
    }

    res.json({ success: true, message: "Assignment cancelled and offers withdrawn." });
  });

  // Withdraw a specific offer
  app.post("/api/offers/:id/withdraw", requireAuth, (req: Request, res: Response) => {
    const offer = storage.getOffer(+param(req, "id"));
    if (!offer) return res.status(404).json({ error: "Offer not found" });
    if (offer.status !== "pending") {
      return res.status(400).json({ error: "Only pending offers can be withdrawn" });
    }
    storage.updateOffer(offer.id, { status: "withdrawn", respondedAt: new Date().toISOString() });
    res.json({ success: true, message: "Offer withdrawn." });
  });

  // ---- ASSIGN TO ME ----
  app.post("/api/assignments/self-assign", requireAuth, (req: Request, res: Response) => {
    const { source, sheet, projectId, account, taskDetails, role } = req.body;
    if (!source || !projectId || !role) return res.status(400).json({ error: "Missing fields" });

    const session = storage.getSession(req.headers.authorization!.replace("Bearer ", ""));
    if (!session) return res.status(401).json({ error: "Unauthorized" });
    const user = storage.getAllPmUsers().find(u => u.id === session.pmUserId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const now = new Date().toISOString();
    const assignment = storage.createAssignment({
      source, sheet: sheet || "", projectId, account: account || "",
      taskDetails: JSON.stringify(taskDetails || {}),
      assignmentType: "direct", role, status: "accepted",
      assignedBy: session.pmUserId,
      acceptedBy: user.initial || user.name, acceptedByName: user.name, acceptedByEmail: user.email,
      sequenceList: null, currentSequenceIndex: 0, sequenceTimeoutMinutes: 60,
      broadcastList: null, autoAssignReviewer: 0,
      reviewerAssignmentType: null, reviewerSequenceList: null,
      reviewType: req.body.reviewType || null,
      createdAt: now, offeredAt: now, acceptedAt: now,
    });

    // Write PM's initial to Sheet (only if cell is empty or XX)
    const pmInitial = user.initial || user.name;
    safeWriteToSheet(assignment, pmInitial, role as "translator" | "reviewer");

    // Self-Edit: write the same code to both TR and REV
    if (req.body.reviewType === "Self-Edit" && role === "reviewer") {
      safeWriteToSheet(assignment, pmInitial, "translator");
    }

    // Write custom TR deadline to sheet if provided
    if (req.body.customDeadline && role === "translator") {
      safeWriteDeadlineToSheet(assignment, req.body.customDeadline);
    }

    // Invalidate task cache so next fetch reflects the write
    delete cache["allTasks"];

    res.json({ success: true, assignment });
  });

  // ---- DIRECT ASSIGN (CONFIRMED, no email) ----
  app.post("/api/assignments/confirmed", requireAuth, async (req: Request, res: Response) => {
    const { source, sheet, projectId, account, taskDetails, role, freelancerCode, freelancerName, freelancerEmail } = req.body;
    if (!source || !projectId || !role || !freelancerCode) return res.status(400).json({ error: "Missing fields" });

    const now = new Date().toISOString();
    const assignment = storage.createAssignment({
      source, sheet: sheet || "", projectId, account: account || "",
      taskDetails: JSON.stringify(taskDetails || {}),
      assignmentType: "direct", role, status: "accepted",
      assignedBy: (req as any).pmUserId,
      acceptedBy: freelancerCode,
      acceptedByName: freelancerName || freelancerCode,
      acceptedByEmail: freelancerEmail || "",
      sequenceList: null, currentSequenceIndex: 0, sequenceTimeoutMinutes: 60,
      broadcastList: null, autoAssignReviewer: 0,
      reviewerAssignmentType: null, reviewerSequenceList: null,
      reviewType: req.body.reviewType || null,
      createdAt: now, offeredAt: now, acceptedAt: now,
    });

    // Create a pre-accepted offer
    const token = randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
    const clientBase = resolveBaseUrl(req);
    storage.createOffer({
      assignmentId: assignment.id,
      freelancerCode,
      freelancerName: freelancerName || freelancerCode,
      freelancerEmail: freelancerEmail || "",
      token, status: "accepted", sentAt: now,
      respondedAt: now, sequenceOrder: null, clientBaseUrl: clientBase,
    });

    // Write freelancer code to Sheet (only if cell is empty or XX)
    safeWriteToSheet(assignment, freelancerCode, role as "translator" | "reviewer");

    // Self-Edit: write the same code to both TR and REV
    if (req.body.reviewType === "Self-Edit" && role === "reviewer") {
      safeWriteToSheet(assignment, freelancerCode, "translator");
    }

    // Write custom TR deadline to sheet if provided
    if (req.body.customDeadline && role === "translator") {
      safeWriteDeadlineToSheet(assignment, req.body.customDeadline);
    }

    // Invalidate task cache
    delete cache["allTasks"];

    res.json({ success: true, assignment });
  });

  // Create assignment and send offers
  app.post("/api/assignments", requireAuth, async (req: Request, res: Response) => {
    const {
      source, sheet, projectId, account, taskDetails,
      assignmentType, role, freelancers,
      sequenceTimeoutMinutes, autoAssignReviewer,
      reviewerAssignmentType, reviewerSequenceList,
      emailSubject, emailBody, customDeadline,
    } = req.body;

    if (!source || !projectId || !assignmentType || !role || !freelancers?.length) {
      return res.status(400).json({ error: "Missing fields" });
    }

    const now = new Date().toISOString();

    const assignment = storage.createAssignment({
      source,
      sheet: sheet || "",
      projectId,
      account: account || "",
      taskDetails: JSON.stringify(taskDetails || {}),
      assignmentType,
      role,
      status: "offered",
      assignedBy: (req as any).pmUserId,
      sequenceList: assignmentType === "sequence" ? JSON.stringify(freelancers.map((f: any) => f.resourceCode)) : null,
      currentSequenceIndex: 0,
      sequenceTimeoutMinutes: sequenceTimeoutMinutes || 60,
      broadcastList: assignmentType === "broadcast" ? JSON.stringify(freelancers.map((f: any) => f.resourceCode)) : null,
      autoAssignReviewer: autoAssignReviewer ? 1 : 0,
      reviewerAssignmentType: reviewerAssignmentType || null,
      reviewerSequenceList: reviewerSequenceList ? JSON.stringify(reviewerSequenceList) : null,
      reviewType: req.body.reviewType || null,
      createdAt: now,
      offeredAt: now,
    });

    const apiBase = buildApiBase(req);
    const clientBase = resolveBaseUrl(req);

    const task = taskDetails || {};
    // If PM set a custom deadline, override it in task details for email/display
    if (customDeadline && role === "translator") {
      task.deadline = customDeadline;
    }

    if (assignmentType === "direct" || assignmentType === "broadcast") {
      // Send to all freelancers at once
      for (const f of freelancers) {
        const offerToken = generateToken();
        const offer = storage.createOffer({
          assignmentId: assignment.id,
          freelancerCode: f.resourceCode,
          freelancerName: f.fullName,
          freelancerEmail: f.email,
          token: offerToken,
          status: "pending",
          sentAt: now,
          sequenceOrder: null,
          clientBaseUrl: clientBase,
        });

        try {
          const email = buildOfferEmailHtml(task, offer, assignment, emailSubject, emailBody);
          sendEmail([f.email], email.subject, email.html);
        } catch (e) {
          console.error(`Failed to send email to ${f.email}:`, e);
        }
      }
    } else if (assignmentType === "sequence") {
      // Send only to first in sequence
      const first = freelancers[0];
      if (first) {
        const offerToken = generateToken();
        const offer = storage.createOffer({
          assignmentId: assignment.id,
          freelancerCode: first.resourceCode,
          freelancerName: first.fullName,
          freelancerEmail: first.email,
          token: offerToken,
          status: "pending",
          sentAt: now,
          sequenceOrder: 0,
          clientBaseUrl: clientBase,
        });

        try {
          const email = buildOfferEmailHtml(task, offer, assignment, emailSubject, emailBody);
          sendEmail([first.email], email.subject, email.html);
        } catch (e) {
          console.error(`Failed to send email to ${first.email}:`, e);
        }
      }
    }

    // Write custom TR deadline to sheet if provided
    if (customDeadline && role === "translator") {
      safeWriteDeadlineToSheet(assignment, customDeadline);
    }

    const enriched = {
      ...assignment,
      taskDetails: JSON.parse(assignment.taskDetails || "{}"),
      offers: storage.getOffersByAssignment(assignment.id),
    };
    res.json(enriched);
  });

  // ---- OFFER RESPONSE (PUBLIC - no auth needed) ----

  // Get offer details for freelancer view
  app.get("/api/offers/:token", offerLimiter, async (req: Request, res: Response) => {
    // Validate token format (64-char hex) to prevent enumeration
    if (!/^[a-f0-9]{64}$/.test(param(req, "token"))) return res.status(404).json({ error: "Offer not found." });
    const offer = storage.getOfferByToken(param(req, "token"));
    if (!offer) return res.status(404).json({ error: "Offer not found." });

    const assignment = storage.getAssignment(offer.assignmentId);
    if (!assignment) return res.status(404).json({ error: "Task not found." });

    const taskDetails = JSON.parse(assignment.taskDetails || "{}");

    res.json({
      offer: {
        id: offer.id,
        status: offer.status,
        freelancerName: offer.freelancerName,
        freelancerCode: offer.freelancerCode,
        sentAt: offer.sentAt,
      },
      assignment: {
        id: assignment.id,
        source: assignment.source,
        sheet: assignment.sheet,
        projectId: assignment.projectId,
        account: assignment.account,
        role: assignment.role,
        status: assignment.status,
        assignmentType: assignment.assignmentType,
        reviewType: assignment.reviewType || null,
      },
      task: taskDetails,
    });
  });

  // Accept offer
  app.post("/api/offers/:token/accept", offerLimiter, async (req: Request, res: Response) => {
    if (!/^[a-f0-9]{64}$/.test(param(req, "token"))) return res.status(404).json({ error: "Offer not found." });
    const offer = storage.getOfferByToken(param(req, "token"));
    if (!offer) return res.status(404).json({ error: "Offer not found." });
    if (offer.status !== "pending") {
      return res.status(400).json({ error: "This offer is no longer valid.", currentStatus: offer.status });
    }

    const assignment = storage.getAssignment(offer.assignmentId);
    if (!assignment) return res.status(404).json({ error: "Task not found." });
    if (assignment.status === "accepted" || assignment.status === "completed") {
      // Already taken by someone else
      storage.updateOffer(offer.id, { status: "withdrawn", respondedAt: new Date().toISOString() });
      return res.status(400).json({ error: "This task has already been accepted by another translator." });
    }

    const now = new Date().toISOString();

    // Accept this offer
    storage.updateOffer(offer.id, { status: "accepted", respondedAt: now });

    // Update assignment
    storage.updateAssignment(assignment.id, {
      status: "accepted",
      acceptedBy: offer.freelancerCode,
      acceptedByName: offer.freelancerName,
      acceptedByEmail: offer.freelancerEmail,
      acceptedAt: now,
    });

    // Withdraw all other pending offers for this assignment
    const allOffers = storage.getOffersByAssignment(assignment.id);
    for (const o of allOffers) {
      if (o.id !== offer.id && o.status === "pending") {
        storage.updateOffer(o.id, { status: "withdrawn", respondedAt: now });
      }
    }

    // Write initial to Google Sheet (only if cell is empty or XX)
    safeWriteToSheet(
      assignment,
      offer.freelancerCode,
      assignment.role as "translator" | "reviewer"
    );

    // Slack notification
    notifySlackAccepted(assignment.projectId, offer.freelancerName, assignment.role);

    // In-app notification + WebSocket
    notify("offer_accepted", `${offer.freelancerName} accepted`,
      `${offer.freelancerName} accepted ${assignment.role} for ${assignment.projectId}`,
      { projectId: assignment.projectId, freelancerCode: offer.freelancerCode, role: assignment.role });
    wsBroadcast("offer_accepted", { assignmentId: assignment.id, freelancerName: offer.freelancerName, projectId: assignment.projectId });

    res.json({ success: true, message: "Task accepted. Thank you!" });
  });

  // Reject offer
  app.post("/api/offers/:token/reject", offerLimiter, async (req: Request, res: Response) => {
    if (!/^[a-f0-9]{64}$/.test(param(req, "token"))) return res.status(404).json({ error: "Offer not found." });
    const offer = storage.getOfferByToken(param(req, "token"));
    if (!offer) return res.status(404).json({ error: "Offer not found." });
    if (offer.status !== "pending") {
      return res.status(400).json({ error: "This offer is no longer valid.", currentStatus: offer.status });
    }

    const now = new Date().toISOString();
    storage.updateOffer(offer.id, { status: "rejected", respondedAt: now });

    const assignment = storage.getAssignment(offer.assignmentId);
    if (!assignment) return res.json({ success: true });

    // If sequence, move to next freelancer
    if (assignment.assignmentType === "sequence") {
      const sequenceList = JSON.parse(assignment.sequenceList || "[]");
      const nextIndex = (assignment.currentSequenceIndex || 0) + 1;

      if (nextIndex < sequenceList.length) {
        storage.updateAssignment(assignment.id, { currentSequenceIndex: nextIndex });

        // Fetch freelancers to get next person's details
        try {
          const response = await fetch(BASE44_API, {
            headers: { "Content-Type": "application/json", "api_key": BASE44_KEY },
          });
          const allFreelancers = await response.json();
          const nextCode = sequenceList[nextIndex];
          const nextFreelancer = allFreelancers.find((f: any) => f.resource_code === nextCode);

          if (nextFreelancer) {
            const offerToken = generateToken();
            const apiBase = buildApiBase(req);
            const clientBase = resolveBaseUrl(req);
            const taskDetails = JSON.parse(assignment.taskDetails || "{}");

            const newOffer = storage.createOffer({
              assignmentId: assignment.id,
              freelancerCode: nextFreelancer.resource_code,
              freelancerName: nextFreelancer.full_name,
              freelancerEmail: nextFreelancer.email,
              token: offerToken,
              status: "pending",
              sentAt: now,
              sequenceOrder: nextIndex,
              clientBaseUrl: clientBase,
            });

            const email = buildOfferEmailHtml(taskDetails, newOffer, assignment);
            sendEmail([nextFreelancer.email], email.subject, email.html);
          }
        } catch (e) {
          console.error("Sequence advance error:", e);
        }
      } else {
        // No more freelancers in sequence
        storage.updateAssignment(assignment.id, { status: "expired" });
      }
    }

    // Slack notification
    notifySlackRejected(assignment.projectId, offer.freelancerName, assignment.role);

    // In-app notification + WebSocket
    notify("offer_rejected", `${offer.freelancerName} declined`,
      `${offer.freelancerName} declined ${assignment.role} for ${assignment.projectId}`,
      { projectId: assignment.projectId, freelancerCode: offer.freelancerCode, role: assignment.role });
    wsBroadcast("offer_rejected", { assignmentId: assignment.id, freelancerName: offer.freelancerName, projectId: assignment.projectId });

    res.json({ success: true, message: "Offer declined." });
  });

  // Mark task as completed by freelancer
  app.post("/api/offers/:token/complete", offerLimiter, async (req: Request, res: Response) => {
    if (!/^[a-f0-9]{64}$/.test(param(req, "token"))) return res.status(404).json({ error: "Offer not found." });
    const offer = storage.getOfferByToken(param(req, "token"));
    if (!offer) return res.status(404).json({ error: "Offer not found." });
    if (offer.status !== "accepted") {
      return res.status(400).json({ error: "Only accepted tasks can be completed." });
    }

    const assignment = storage.getAssignment(offer.assignmentId);
    if (!assignment) return res.status(404).json({ error: "Task not found." });

    const now = new Date().toISOString();
    storage.updateAssignment(assignment.id, { status: "completed", completedAt: now });

    // Write-back to sheet: mark task as done
    const { timeSpent, qsScore } = req.body || {};
    const role = assignment.role;
    const reviewType = assignment.reviewType || "";

    try {
      if (role === "translator") {
        await safeWriteStatusToSheet(assignment, "trDone", "Yes");
      } else if (role === "reviewer") {
        if (reviewType === "Self-Edit") {
          await safeWriteStatusToSheet(assignment, "trDone", "Yes");
          await safeWriteStatusToSheet(assignment, "revComplete", "Yes");
        } else {
          const revValue = timeSpent ? String(timeSpent) : "Yes";
          await safeWriteStatusToSheet(assignment, "revComplete", revValue);
        }
        // Write QS score to sheet + ELTS if provided (reviewer only)
        if (qsScore && role === "reviewer") {
          await safeWriteQsToSheet(assignment, String(qsScore));
          // Also send to ELTS as QualityReport
          try {
            await writeQsToElts(assignment, offer, parseFloat(String(qsScore)));
          } catch (e) {
            console.error("ELTS QS write error (non-fatal):", e);
          }
        }
      }
    } catch (e) {
      console.error("Sheet status write error (non-fatal):", e);
    }

    // In-app notification + WebSocket
    notify("task_completed", `Task completed`,
      `${offer.freelancerName} completed ${assignment.role} for ${assignment.projectId}`,
      { projectId: assignment.projectId, freelancerCode: offer.freelancerCode, role: assignment.role });
    wsBroadcast("task_completed", { assignmentId: assignment.id, projectId: assignment.projectId });

    res.json({ success: true, message: "Task marked as completed!" });
  });

  // ---- SAFE SHEET WRITE-BACK ----
  // Only writes to empty or "XX" cells. Never overwrites existing initials.

  // Dynamically resolve column name from actual sheet keys
  function findCol(rowKeys: string[], ...candidates: string[]): string | null {
    // Exact match first
    for (const c of candidates) {
      if (rowKeys.includes(c)) return c;
    }
    // Normalized fuzzy match
    const normalize = (s: string) => s.replace(/[\s\n\r]+/g, "").toLowerCase().replace(/[^a-z0-9%]/g, "");
    const normalizedMap = new Map(rowKeys.map(k => [normalize(k), k]));
    for (const c of candidates) {
      const match = normalizedMap.get(normalize(c));
      if (match) return match;
    }
    return null;
  }

  // ---- Sheet Write Helper ----
  // Uses Google Sheets API (via service account) when available.
  // Falls back to SheetDB only when GS API is not configured.
  function getSheetWriteConfig(assignment: any): SheetWriteConfig | null {
    const configs = storage.getAllSheetConfigs();
    const config = configs.find(c => c.source === assignment.source && c.sheet === assignment.sheet);
    if (!config) return null;
    const gsId = config.googleSheetId;
    if (gsId) return { googleSheetId: gsId, tabName: assignment.sheet, projectId: assignment.projectId };
    return null;
  }

  const TR_CANDIDATES = ["TR ", "TR", "Translator", "Tra", "TER"];
  const REV_CANDIDATES = ["Rev", "REV", "Reviewer", "Rev."];
  const TR_DONE_CANDIDATES = ["TR\nDone?", "TR Done?", "TR Dlvr", "TR Dlvr?", "TR Dlv?", "TR Delivered?", "TR delivered?", "TR Compl?", "Tra Dlv?"];
  const REV_COMPLETE_CANDIDATES = ["Rev\nDone?", "Rev Done?", "Rev Complete? (in minutes)", "Rev Complete?", "Rev Completed? (in minutes)", "Rev Compl?", "Time Spent\n(in minutes)", "Time Spent (in minutes)", "Time Spent", "Rev Time (min.)", "Rev. Dlv?", "Rev QA"];
  const QS_CANDIDATES = ["QS", "QS (Num)"];
  const TR_DEADLINE_CANDIDATES = ["TR\nDeadline", "TR Deadline", "Deadline"];

  async function safeWriteToSheet(assignment: any, freelancerCode: string, columnType: "translator" | "reviewer") {
    const candidates = columnType === "translator" ? TR_CANDIDATES : REV_CANDIDATES;
    const gsConfig = getSheetWriteConfig(assignment);

    // Try Google Sheets API first (always correct, no prefix-matching bug)
    if (gsConfig) {
      const result = await gsWriteToColumn(gsConfig, candidates, freelancerCode);
      console.log(`Sheet write [${assignment.source}/${assignment.sheet}]: ${result.message}`);
      if (result.ok) return;
      // If GS fails, fall through to SheetDB
    }

    // Fallback: SheetDB (works for sheets without column name conflicts)
    try {
      const configs = storage.getAllSheetConfigs();
      const config = configs.find(c => c.source === assignment.source && c.sheet === assignment.sheet);
      if (!config?.sheetDbId) return;
      const apiId = config.sheetDbId;
      const sheet = assignment.sheet;
      const projectId = assignment.projectId;

      const sampleUrl = `https://sheetdb.io/api/v1/${apiId}?sheet=${encodeURIComponent(sheet)}&limit=1`;
      const sampleRes = await fetch(sampleUrl, { headers: sheetDbHeaders() });
      if (!sampleRes.ok) return;
      const sampleRows = await sampleRes.json();
      if (!Array.isArray(sampleRows) || sampleRows.length === 0) return;
      const keys = Object.keys(sampleRows[0]);

      const idCol = findCol(keys, "Project ID", "ProjectID", "ID", "ATMS ID", "Project code", "Job ID", "Job Code", "Task Name");
      if (!idCol) return;
      const targetCol = findCol(keys, ...candidates);
      if (!targetCol) return;

      // Safety check
      const readUrl = `https://sheetdb.io/api/v1/${apiId}/search?${encodeURIComponent(idCol)}=${encodeURIComponent(projectId)}&sheet=${encodeURIComponent(sheet)}`;
      const readRes = await fetch(readUrl, { headers: sheetDbHeaders() });
      if (!readRes.ok) return;
      const rows = await readRes.json();
      if (!Array.isArray(rows) || rows.length === 0) return;
      const currentValue = (rows[0][targetCol] || "").toString().trim();
      if (currentValue && currentValue.toUpperCase() !== "XX") {
        console.log(`SheetDB write BLOCKED: ${targetCol} already has '${currentValue}' for ${projectId}`);
        return;
      }

      const writeUrl = `https://sheetdb.io/api/v1/${apiId}/${encodeURIComponent(idCol)}/${encodeURIComponent(projectId)}?sheet=${encodeURIComponent(sheet)}`;
      await fetch(writeUrl, { method: "PATCH", headers: sheetDbHeaders(), body: JSON.stringify({ data: { [targetCol]: freelancerCode } }) });
      console.log(`SheetDB write OK: ${targetCol}=${freelancerCode} for ${projectId}`);
    } catch (e) {
      console.error("Sheet write error (non-fatal):", e);
    }
  }

  // Write status values (TR Done, Rev Complete) to sheet
  async function safeWriteStatusToSheet(assignment: any, columnType: "trDone" | "revComplete", value: string) {
    const candidates = columnType === "trDone" ? TR_DONE_CANDIDATES : REV_COMPLETE_CANDIDATES;
    const gsConfig = getSheetWriteConfig(assignment);
    if (gsConfig) {
      const result = await gsWriteToColumn(gsConfig, candidates, value, { skipSafetyCheck: true });
      console.log(`Status write [${assignment.source}/${assignment.sheet}]: ${result.message}`);
      if (result.ok) return;
    }
    // SheetDB fallback
    try {
      const configs = storage.getAllSheetConfigs();
      const config = configs.find(c => c.source === assignment.source && c.sheet === assignment.sheet);
      if (!config?.sheetDbId) return;
      const apiId = config.sheetDbId;
      const sheet = assignment.sheet;
      const projectId = assignment.projectId;
      const sampleRes = await fetch(`https://sheetdb.io/api/v1/${apiId}?sheet=${encodeURIComponent(sheet)}&limit=1`, { headers: sheetDbHeaders() });
      if (!sampleRes.ok) return;
      const sampleRows = await sampleRes.json();
      if (!Array.isArray(sampleRows) || sampleRows.length === 0) return;
      const keys = Object.keys(sampleRows[0]);
      const idCol = findCol(keys, "Project ID", "ProjectID", "ID", "ATMS ID", "Project code", "Job ID", "Job Code", "Task Name");
      if (!idCol) return;
      const targetCol = findCol(keys, ...candidates);
      if (!targetCol) return;
      const writeUrl = `https://sheetdb.io/api/v1/${apiId}/${encodeURIComponent(idCol)}/${encodeURIComponent(projectId)}?sheet=${encodeURIComponent(sheet)}`;
      await fetch(writeUrl, { method: "PATCH", headers: sheetDbHeaders(), body: JSON.stringify({ data: { [targetCol]: value } }) });
      console.log(`SheetDB status write OK: ${targetCol}=${value} for ${projectId}`);
    } catch (e) {
      console.error("Status write error (non-fatal):", e);
    }
  }

  // Write TR Deadline to sheet
  async function safeWriteDeadlineToSheet(assignment: any, deadlineValue: string) {
    const gsConfig = getSheetWriteConfig(assignment);
    if (gsConfig) {
      const result = await gsWriteToColumn(gsConfig, TR_DEADLINE_CANDIDATES, deadlineValue, { skipSafetyCheck: true });
      console.log(`Deadline write [${assignment.source}/${assignment.sheet}]: ${result.message}`);
      if (result.ok) return;
    }
    // SheetDB fallback
    try {
      const configs = storage.getAllSheetConfigs();
      const config = configs.find(c => c.source === assignment.source && c.sheet === assignment.sheet);
      if (!config?.sheetDbId) return;
      const apiId = config.sheetDbId;
      const sheet = assignment.sheet;
      const projectId = assignment.projectId;
      const sampleRes = await fetch(`https://sheetdb.io/api/v1/${apiId}?sheet=${encodeURIComponent(sheet)}&limit=1`, { headers: sheetDbHeaders() });
      if (!sampleRes.ok) return;
      const sampleRows = await sampleRes.json();
      if (!Array.isArray(sampleRows) || sampleRows.length === 0) return;
      const keys = Object.keys(sampleRows[0]);
      const idCol = findCol(keys, "Project ID", "ProjectID", "ID", "ATMS ID", "Project code", "Job ID", "Job Code", "Task Name");
      if (!idCol) return;
      const deadlineCol = findCol(keys, ...TR_DEADLINE_CANDIDATES);
      if (!deadlineCol) return;
      const writeUrl = `https://sheetdb.io/api/v1/${apiId}/${encodeURIComponent(idCol)}/${encodeURIComponent(projectId)}?sheet=${encodeURIComponent(sheet)}`;
      await fetch(writeUrl, { method: "PATCH", headers: sheetDbHeaders(), body: JSON.stringify({ data: { [deadlineCol]: deadlineValue } }) });
      console.log(`SheetDB deadline write OK: ${deadlineCol}=${deadlineValue} for ${projectId}`);
    } catch (e) {
      console.error("Deadline write error (non-fatal):", e);
    }
  }

  // ---- TASK NOTES (PM internal) ----
  app.get("/api/task-notes", requireAuth, (req: Request, res: Response) => {
    const notes = db.select().from(taskNotes).all();
    res.json(notes);
  });

  app.post("/api/task-notes", requireAuth, (req: Request, res: Response) => {
    const { source, sheet, projectId, note } = req.body;
    if (!source || !projectId) return res.status(400).json({ error: "Missing fields" });
    const session = storage.getSession(req.headers.authorization!.replace("Bearer ", ""));
    if (!session) return res.status(401).json({ error: "Unauthorized" });
    const user = storage.getAllPmUsers().find(u => u.id === session.pmUserId);
    if (!user) return res.status(404).json({ error: "User not found" });
    const now = new Date().toISOString();
    // Upsert: update if exists, create if not
    const existing = db.select().from(taskNotes)
      .where(and(eq(taskNotes.source, source), eq(taskNotes.sheet, sheet || ""), eq(taskNotes.projectId, projectId), eq(taskNotes.pmEmail, user.email)))
      .get();
    if (existing) {
      db.update(taskNotes).set({ note, updatedAt: now }).where(eq(taskNotes.id, existing.id)).run();
      res.json({ ...existing, note, updatedAt: now });
    } else {
      const created = db.insert(taskNotes).values({ source, sheet: sheet || "", projectId, pmEmail: user.email, note, createdAt: now, updatedAt: now }).returning().get();
      res.json(created);
    }
  });

  // ---- PM FAVORITES ----
  app.get("/api/favorites", requireAuth, (req: Request, res: Response) => {
    const session = storage.getSession(req.headers.authorization!.replace("Bearer ", ""));
    if (!session) return res.status(401).json({ error: "Unauthorized" });
    const user = storage.getAllPmUsers().find(u => u.id === session.pmUserId);
    if (!user) return res.status(404).json({ error: "User not found" });
    const favs = db.select().from(pmFavorites).where(eq(pmFavorites.pmEmail, user.email)).all();
    res.json(favs.map(f => f.freelancerCode));
  });

  app.post("/api/favorites", requireAuth, (req: Request, res: Response) => {
    const { freelancerCode } = req.body;
    if (!freelancerCode) return res.status(400).json({ error: "Missing freelancerCode" });
    const session = storage.getSession(req.headers.authorization!.replace("Bearer ", ""));
    if (!session) return res.status(401).json({ error: "Unauthorized" });
    const user = storage.getAllPmUsers().find(u => u.id === session.pmUserId);
    if (!user) return res.status(404).json({ error: "User not found" });
    const existing = db.select().from(pmFavorites)
      .where(and(eq(pmFavorites.pmEmail, user.email), eq(pmFavorites.freelancerCode, freelancerCode))).get();
    if (existing) {
      // Toggle off
      db.delete(pmFavorites).where(eq(pmFavorites.id, existing.id)).run();
      res.json({ favorited: false });
    } else {
      // Toggle on
      db.insert(pmFavorites).values({ pmEmail: user.email, freelancerCode, createdAt: new Date().toISOString() }).run();
      res.json({ favorited: true });
    }
  });

  // ---- BATCH DEADLINE UPDATE ----
  app.post("/api/tasks/batch-deadline", requireAuth, async (req: Request, res: Response) => {
    const { tasks: taskList, deadline } = req.body;
    if (!taskList || !Array.isArray(taskList) || !deadline) {
      return res.status(400).json({ error: "tasks array and deadline required" });
    }
    let written = 0;
    for (const t of taskList) {
      try {
        await safeWriteDeadlineToSheet({ source: t.source, sheet: t.sheet, projectId: t.projectId }, deadline);
        written++;
      } catch (e) {
        console.error(`Batch deadline write failed for ${t.projectId}:`, e);
      }
    }
    res.json({ success: true, written, total: taskList.length });
  });

  // ---- UNDO ASSIGNMENT (cancel within 10s) ----
  app.post("/api/assignments/:id/undo", requireAuth, (req: Request, res: Response) => {
    const assignment = storage.getAssignment(+param(req, "id"));
    if (!assignment) return res.status(404).json({ error: "Assignment not found" });
    // Only allow undo within 15 seconds of creation
    const createdTime = new Date(assignment.createdAt).getTime();
    const elapsed = Date.now() - createdTime;
    if (elapsed > 15000) {
      return res.status(400).json({ error: "Undo window expired (15 seconds)" });
    }
    // Cancel all offers
    const offers = storage.getOffersByAssignment(assignment.id);
    const now = new Date().toISOString();
    for (const offer of offers) {
      if (offer.status === "pending") {
        storage.updateOffer(offer.id, { status: "withdrawn", respondedAt: now });
      }
    }
    storage.updateAssignment(assignment.id, { status: "cancelled" });
    res.json({ success: true, message: "Assignment undone." });
  });

  // ---- XLSX EXPORT ----
  app.post("/api/export/xlsx", requireAuth, (req: Request, res: Response) => {
    try {
      const XLSX = require("xlsx");
      const { tasks: taskList } = req.body;
      if (!taskList || !Array.isArray(taskList)) return res.status(400).json({ error: "No tasks" });
      const rows = taskList.map((t: any) => ({
        "Project ID": t.projectId,
        "Source": t.source,
        "Sheet": t.sheet,
        "Account": t.account,
        "TR": t.translator,
        "REV": t.reviewer,
        "Deadline": t.deadline,
        "Rev Deadline": t.revDeadline,
        "Total": t.total,
        "WWC": t.wwc,
        "Status": t.delivered,
        "Rev Type": t.revType,
        "TR Done": t.trDone,
        "Rev Complete": t.revComplete,
        "Title": t.projectTitle,
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Tasks");
      const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename=dispatch-export-${new Date().toISOString().slice(0,10)}.xlsx`);
      res.send(buf);
    } catch (e: any) {
      console.error("XLSX export error:", e.message);
      res.status(500).json({ error: "Export failed" });
    }
  });

  // Write QS to sheet
  async function safeWriteQsToSheet(assignment: any, qsValue: string) {
    const gsConfig = getSheetWriteConfig(assignment);
    if (gsConfig) {
      const result = await gsWriteToColumn(gsConfig, QS_CANDIDATES, qsValue, { skipSafetyCheck: true });
      console.log(`QS write [${assignment.source}/${assignment.sheet}]: ${result.message}`);
      if (result.ok) return;
    }
    // SheetDB fallback
    try {
      const configs = storage.getAllSheetConfigs();
      const config = configs.find(c => c.source === assignment.source && c.sheet === assignment.sheet);
      if (!config?.sheetDbId) return;
      const apiId = config.sheetDbId;
      const sheet = assignment.sheet;
      const projectId = assignment.projectId;
      const sampleRes = await fetch(`https://sheetdb.io/api/v1/${apiId}?sheet=${encodeURIComponent(sheet)}&limit=1`, { headers: sheetDbHeaders() });
      if (!sampleRes.ok) return;
      const sampleRows = await sampleRes.json();
      if (!Array.isArray(sampleRows) || sampleRows.length === 0) return;
      const keys = Object.keys(sampleRows[0]);
      const idCol = findCol(keys, "Project ID", "ProjectID", "ID", "ATMS ID", "Project code", "Job ID", "Job Code", "Task Name");
      if (!idCol) return;
      const qsCol = findCol(keys, ...QS_CANDIDATES) || "QS";
      const writeUrl = `https://sheetdb.io/api/v1/${apiId}/${encodeURIComponent(idCol)}/${encodeURIComponent(projectId)}?sheet=${encodeURIComponent(sheet)}`;
      await fetch(writeUrl, { method: "PATCH", headers: sheetDbHeaders(), body: JSON.stringify({ data: { [qsCol]: qsValue } }) });
      console.log(`SheetDB QS write OK: ${qsCol}=${qsValue} for ${projectId}`);
    } catch (e) {
      console.error("QS write error (non-fatal):", e);
    }
  }

  // ---- WRITE QS TO ELTS (QualityReport entity) ----
  async function writeQsToElts(assignment: any, offer: any, qsScore: number) {
    if (!BASE44_KEY) return;
    try {
      // 1. Resolve freelancer resource_code → freelancer_id
      const flRes = await fetch(BASE44_API, {
        headers: { "Content-Type": "application/json", "api_key": BASE44_KEY },
      });
      const freelancers = await flRes.json();
      const fl = Array.isArray(freelancers)
        ? freelancers.find((f: any) => f.resource_code === offer.freelancerCode)
        : null;
      if (!fl) {
        console.log(`ELTS QS: freelancer ${offer.freelancerCode} not found in ELTS`);
        return;
      }

      // 2. Resolve reviewer (the PM who set up the assignment)
      const pmUser = storage.getAllPmUsers().find(u => u.id === assignment.assignedBy);

      // 3. Build QualityReport payload
      const taskDetails = JSON.parse(assignment.taskDetails || "{}");
      const reportUrl = BASE44_API.replace("/entities/Freelancer", "/entities/QualityReport");
      const payload = {
        freelancer_id: fl.id,
        client_account: assignment.account || taskDetails.account || assignment.source || "Unknown",
        qs_score: qsScore,
        report_type: "QS",
        job_id: assignment.projectId,
        project_name: taskDetails.projectTitle || assignment.projectId,
        source_language: "en",
        target_language: "tr",
        report_date: new Date().toISOString().slice(0, 10).split("-").reverse().join("."),
        reviewer_name: pmUser?.initial || pmUser?.name || "PM",
        status: "finalized",
        content_type: assignment.source || "",
        word_count: parseFloat((taskDetails.wwc || "0").toString().replace(/[^\d.,]/g, "").replace(",", ".")) || 0,
      };

      const res = await fetch(reportUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "api_key": BASE44_KEY },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        console.log(`ELTS QS write OK: ${offer.freelancerCode} QS=${qsScore} account=${payload.client_account} project=${assignment.projectId}`);
      } else {
        const err = await res.text();
        console.error(`ELTS QS write failed ${res.status}: ${err}`);
      }
    } catch (e) {
      console.error("ELTS QS write error:", e);
    }
  }

  // ---- ELTS AVAILABILITY WRITE (PM edit → ELTS) ----
  app.post("/api/elts/availability", requireAuth, async (req: Request, res: Response) => {
    try {
      const { freelancerCode, date, status, hours, notes } = req.body;
      if (!freelancerCode || !date || !status) return res.status(400).json({ error: "Missing fields" });

      // Resolve freelancer code to ELTS ID
      const flRes = await fetch(BASE44_API, {
        headers: { "Content-Type": "application/json", "api_key": BASE44_KEY },
      });
      const freelancers = await flRes.json();
      const fl = (Array.isArray(freelancers) ? freelancers : []).find((f: any) => f.resource_code === freelancerCode);
      if (!fl) return res.status(404).json({ error: `Freelancer ${freelancerCode} not found in ELTS` });

      const availUrl = BASE44_API.replace("/entities/Freelancer", "/entities/Availability");

      // Check if record already exists for this freelancer+date
      const existingRes = await fetch(availUrl, {
        headers: { "Content-Type": "application/json", "api_key": BASE44_KEY },
      });
      const allAvail = await existingRes.json();
      const existing = (Array.isArray(allAvail) ? allAvail : []).find(
        (a: any) => a.freelancer_id === fl.id && a.date === date
      );

      if (existing) {
        // Update
        await fetch(`${availUrl}/${existing.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", "api_key": BASE44_KEY },
          body: JSON.stringify({ status, hours_available: hours || 0, notes: notes || "" }),
        });
        delete cache["eltsAvailability"]; // Invalidate cache
        res.json({ success: true, action: "updated", id: existing.id });
      } else {
        // Create
        const createRes = await fetch(availUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", "api_key": BASE44_KEY },
          body: JSON.stringify({ freelancer_id: fl.id, date, status, hours_available: hours || 0, notes: notes || "" }),
        });
        const created = await createRes.json();
        delete cache["eltsAvailability"]; // Invalidate cache
        res.json({ success: true, action: "created", id: created.id });
      }
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/elts/availability/:freelancerCode/:date", requireAuth, async (req: Request, res: Response) => {
    try {
      const { freelancerCode, date } = req.params;
      const flRes = await fetch(BASE44_API, {
        headers: { "Content-Type": "application/json", "api_key": BASE44_KEY },
      });
      const freelancers = await flRes.json();
      const fl = (Array.isArray(freelancers) ? freelancers : []).find((f: any) => f.resource_code === freelancerCode);
      if (!fl) return res.status(404).json({ error: "Freelancer not found" });

      const availUrl = BASE44_API.replace("/entities/Freelancer", "/entities/Availability");
      const allAvail = await fetch(availUrl, {
        headers: { "Content-Type": "application/json", "api_key": BASE44_KEY },
      }).then(r => r.json());
      const existing = (Array.isArray(allAvail) ? allAvail : []).find(
        (a: any) => a.freelancer_id === fl.id && a.date === date
      );
      if (!existing) return res.status(404).json({ error: "No availability record for this date" });

      await fetch(`${availUrl}/${existing.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json", "api_key": BASE44_KEY },
      });
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ---- ADMIN: SHEET CONFIG ----

  app.get("/api/sheet-configs", requireAuth, (_req: Request, res: Response) => {
    res.json(storage.getAllSheetConfigs());
  });

  app.post("/api/sheet-configs", requireAuth, (req: Request, res: Response) => {
    const { source, sheet, languagePair, sheetDbId, googleSheetUrl, assignedPms } = req.body;
    if (!source || !sheet || !languagePair) return res.status(400).json({ error: "Missing fields" });
    const config = storage.upsertSheetConfig(source, sheet, languagePair, sheetDbId || undefined, googleSheetUrl || undefined, assignedPms || undefined);
    res.json(config);
  });

  app.delete("/api/sheet-configs/:id", requireAuth, (req: Request, res: Response) => {
    storage.deleteSheetConfig(+param(req, "id"));
    res.json({ success: true });
  });

  // ---- ADMIN: EMAIL TEMPLATES ----

  app.get("/api/email-templates", requireAuth, (_req: Request, res: Response) => {
    res.json(storage.getAllEmailTemplates());
  });

  app.post("/api/email-templates", requireAuth, (req: Request, res: Response) => {
    const { key, subject, body } = req.body;
    if (!key || !subject || !body) return res.status(400).json({ error: "Missing fields" });
    const template = storage.upsertEmailTemplate(key, subject, body);
    res.json(template);
  });

  // ---- SEQUENCE PRESETS ----

  app.get("/api/presets", requireAuth, (req: Request, res: Response) => {
    const session = storage.getSession(req.headers.authorization!.replace("Bearer ", ""));
    if (!session) return res.status(401).json({ error: "Unauthorized" });
    const allUsers = storage.getAllPmUsers();
    const user = allUsers.find(u => u.id === session.pmUserId);
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(storage.getPresetsByPm(user.email));
  });

  app.post("/api/presets", requireAuth, (req: Request, res: Response) => {
    const { name, role, freelancerCodes, assignmentType } = req.body;
    if (!name || !role || !freelancerCodes) return res.status(400).json({ error: "Missing fields" });
    const session = storage.getSession(req.headers.authorization!.replace("Bearer ", ""));
    if (!session) return res.status(401).json({ error: "Unauthorized" });
    const allUsers = storage.getAllPmUsers();
    const user = allUsers.find(u => u.id === session.pmUserId);
    if (!user) return res.status(404).json({ error: "User not found" });
    const preset = storage.createPreset({
      name,
      pmEmail: user.email,
      role,
      freelancerCodes: typeof freelancerCodes === "string" ? freelancerCodes : JSON.stringify(freelancerCodes),
      assignmentType: assignmentType || "sequence",
    });
    res.json(preset);
  });

  app.delete("/api/presets/:id", requireAuth, (req: Request, res: Response) => {
    storage.deletePreset(+param(req, "id"));
    res.json({ success: true });
  });

  // ---- PROJECT COMPLETE (PM action) ----

  app.post("/api/tasks/complete", requireAuth, (req: Request, res: Response) => {
    const { source, sheet, projectId, revCompleteValue } = req.body;
    if (!source || !projectId) return res.status(400).json({ error: "Missing fields" });
    const all = storage.getAllAssignments();
    const assignment = all.find(a =>
      a.source === source && a.projectId === projectId &&
      a.status !== "cancelled" && a.status !== "expired"
    );
    if (assignment) {
      storage.updateAssignment(assignment.id, {
        status: "completed",
        completedAt: new Date().toISOString(),
      });
    }
    res.json({ success: true, revCompleteValue: revCompleteValue || "Yes" });
  });

  // ---- ELTS QUALITY SCORES (account-based from QualityReport entity) ----
  app.get("/api/elts/quality", requireAuth, async (_req: Request, res: Response) => {
    try {
      // Cache ELTS quality for 5 minutes
      const cachedQ = getCached<any>("eltsQuality", 300000);
      if (cachedQ) return res.json(cachedQ);
      // Fetch QualityReports from ELTS
      const qrRes = await fetch(
        BASE44_API.replace("/entities/Freelancer", "/entities/QualityReport"),
        { headers: { "Content-Type": "application/json", "api_key": BASE44_KEY } }
      );
      const reports = await qrRes.json();
      if (!Array.isArray(reports)) return res.json({});

      // Fetch freelancers for ID → code mapping
      const flRes = await fetch(BASE44_API, {
        headers: { "Content-Type": "application/json", "api_key": BASE44_KEY },
      });
      const freelancers = await flRes.json();
      const idToCode: Record<string, string> = {};
      if (Array.isArray(freelancers)) {
        for (const f of freelancers) idToCode[f.id] = f.resource_code || "";
      }

      // Build: { resourceCode: { general: {qs, lqa, count}, accounts: { accountName: {qs, lqa, count} } } }
      const result: Record<string, any> = {};
      for (const r of reports) {
        const code = idToCode[r.freelancer_id];
        if (!code) continue;
        const acc = r.client_account || "General";
        const qs = r.qs_score;
        const lqa = r.lqa_score;
        if (qs == null && lqa == null) continue;

        if (!result[code]) result[code] = { general: { qsScores: [], lqaScores: [] }, accounts: {} };
        if (!result[code].accounts[acc]) result[code].accounts[acc] = { qsScores: [], lqaScores: [] };

        if (qs != null) {
          result[code].general.qsScores.push(qs);
          result[code].accounts[acc].qsScores.push(qs);
        }
        if (lqa != null) {
          result[code].general.lqaScores.push(lqa);
          result[code].accounts[acc].lqaScores.push(lqa);
        }
      }

      // Compute averages
      const avg = (arr: number[]) => arr.length > 0 ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : null;
      const output: Record<string, any> = {};
      for (const [code, data] of Object.entries(result) as any) {
        output[code] = {
          generalQs: avg(data.general.qsScores),
          generalLqa: avg(data.general.lqaScores),
          totalReports: data.general.qsScores.length + data.general.lqaScores.length,
          accounts: {} as Record<string, any>,
        };
        for (const [acc, ad] of Object.entries(data.accounts) as any) {
          output[code].accounts[acc] = {
            qs: avg(ad.qsScores),
            lqa: avg(ad.lqaScores),
            count: ad.qsScores.length + ad.lqaScores.length,
          };
        }
      }
      setCache("eltsQuality", output);
      res.json(output);
    } catch (e: any) {
      console.error("ELTS quality fetch error:", e.message);
      res.json({});
    }
  });

  // ---- ELTS AVAILABILITY (from Availability entity) ----
  app.get("/api/elts/availability", requireAuth, async (_req: Request, res: Response) => {
    try {
      // Cache availability for 3 minutes
      const cachedAv = getCached<any>("eltsAvailability", 180000);
      if (cachedAv) return res.json(cachedAv);
      // Fetch Availability records
      const avRes = await fetch(
        BASE44_API.replace("/entities/Freelancer", "/entities/Availability"),
        { headers: { "Content-Type": "application/json", "api_key": BASE44_KEY } }
      );
      const records = await avRes.json();
      if (!Array.isArray(records)) return res.json({});

      // Fetch freelancers for ID → code mapping
      const flRes = await fetch(BASE44_API, {
        headers: { "Content-Type": "application/json", "api_key": BASE44_KEY },
      });
      const freelancers = await flRes.json();
      const idToCode: Record<string, string> = {};
      if (Array.isArray(freelancers)) {
        for (const f of freelancers) idToCode[f.id] = f.resource_code || "";
      }

      // Build: { resourceCode: [ {date, status, hours, notes} ] }
      // Only include today and future dates
      const today = new Date().toISOString().slice(0, 10);
      const result: Record<string, any[]> = {};
      for (const r of records) {
        const code = idToCode[r.freelancer_id];
        if (!code) continue;
        if (r.date < today) continue; // Skip past dates
        if (!result[code]) result[code] = [];
        result[code].push({
          date: r.date,
          status: r.status, // "available" | "partially_available" | "unavailable"
          hours: r.hours_available || 0,
          notes: r.notes || "",
        });
      }
      // Sort each freelancer's dates
      for (const code of Object.keys(result)) {
        result[code].sort((a: any, b: any) => a.date.localeCompare(b.date));
      }
      setCache("eltsAvailability", result);
      res.json(result);
    } catch (e: any) {
      console.error("ELTS availability fetch error:", e.message);
      res.json({});
    }
  });

  // ---- FREELANCER STATS (QS, LQI averages) ----

  app.get("/api/freelancer-stats", requireAuth, async (_req: Request, res: Response) => {
    try {
      const allTasks = await getAllTasksCached(); // Uses shared 2-min cache

      const trStats: Record<string, { qsScores: number[]; count: number; activeCount: number; activeWwc: number }> = {};
      const revStats: Record<string, { count: number; activeCount: number }> = {};

      for (const t of allTasks) {
        const tr = (t.translator || "").trim();
        const rev = (t.reviewer || "").trim();
        const qs = parseFloat(t.qs || "0");
        const isOngoing = t.delivered === "Ongoing";
        const wwcRaw2 = parseFloat((t.wwc || "0").toString().replace(/[^\d.,]/g, "").replace(",", ".")); const wwc = isNaN(wwcRaw2) ? 0 : wwcRaw2;

        if (tr && tr !== "XX") {
          if (!trStats[tr]) trStats[tr] = { qsScores: [], count: 0, activeCount: 0, activeWwc: 0 };
          trStats[tr].count++;
          if (isOngoing) { trStats[tr].activeCount++; trStats[tr].activeWwc += wwc; }
          if (qs > 0) trStats[tr].qsScores.push(qs);
        }
        if (rev && rev !== "XX") {
          if (!revStats[rev]) revStats[rev] = { count: 0, activeCount: 0 };
          revStats[rev].count++;
          if (isOngoing) revStats[rev].activeCount++;
        }
      }

      const result: Record<string, { taskCount: number; avgQs: number | null; activeCount: number; activeWwc: number }> = {};
      for (const [code, stats] of Object.entries(trStats)) {
        result[code] = {
          taskCount: stats.count + (revStats[code]?.count || 0),
          avgQs: stats.qsScores.length > 0
            ? Math.round((stats.qsScores.reduce((a, b) => a + b, 0) / stats.qsScores.length) * 10) / 10
            : null,
          activeCount: stats.activeCount + (revStats[code]?.activeCount || 0),
          activeWwc: Math.round(stats.activeWwc),
        };
      }
      for (const [code, stats] of Object.entries(revStats)) {
        if (!result[code]) {
          result[code] = { taskCount: stats.count, avgQs: null, activeCount: stats.activeCount, activeWwc: 0 };
        }
      }

      res.json(result);
    } catch (e: any) {
      res.json({});
    }
  });

  // ---- PM MANAGEMENT ----

  app.get("/api/pm-users", requireAuth, (_req: Request, res: Response) => {
    res.json(storage.getAllPmUsers().map(u => ({ ...u, password: undefined })));
  });

  app.post("/api/pm-users", requireAuth, async (req: Request, res: Response) => {
    const { email, name, initial, password, role } = req.body;
    if (!email || !name || !password) return res.status(400).json({ error: "Email, name, and password required" });
    if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters" });
    const existing = storage.getPmUserByEmail(email.toLowerCase().trim());
    if (existing) return res.status(400).json({ error: "This email is already registered." });
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = storage.createPmUser({ email: email.toLowerCase().trim(), name, initial: initial || "", password: hashedPassword, role: role || "pm" });
    res.json(user);
  });

  // Update PM user (admin edit)
  app.put("/api/pm-users/:id", requireAuth, async (req: Request, res: Response) => {
    const { name, initial, role, password } = req.body;
    const id = +param(req, "id");
    const user = storage.getAllPmUsers().find(u => u.id === id);
    if (!user) return res.status(404).json({ error: "User not found" });
    const updates: any = {};
    if (name) updates.name = name;
    if (initial !== undefined) updates.initial = initial;
    if (role) updates.role = role;
    if (password && password.length >= 8) {
      updates.password = await bcrypt.hash(password, 10);
    }
    if (Object.keys(updates).length > 0) {
      storage.updatePmUser(id, updates);
    }
    res.json({ success: true });
  });

  // Update PM preferences (default filter, my projects)
  app.post("/api/pm-users/preferences", requireAuth, (req: Request, res: Response) => {
    const { defaultFilter, defaultMyProjects, defaultSource, defaultAccount } = req.body;
    const session = storage.getSession(req.headers.authorization!.replace("Bearer ", ""));
    if (!session) return res.status(401).json({ error: "Unauthorized" });
    const user = storage.getAllPmUsers().find(u => u.id === session.pmUserId);
    if (!user) return res.status(404).json({ error: "User not found" });
    const updates: any = {};
    if (defaultFilter !== undefined) updates.defaultFilter = defaultFilter;
    if (defaultMyProjects !== undefined) updates.defaultMyProjects = defaultMyProjects ? 1 : 0;
    if (defaultSource !== undefined) updates.defaultSource = defaultSource;
    if (defaultAccount !== undefined) updates.defaultAccount = defaultAccount;
    if (Object.keys(updates).length > 0) {
      storage.updatePmUser(user.id, updates);
    }
    res.json({ success: true });
  });

  // ---- UNASSIGN (clear TR or REV from sheet + cancel assignment if exists) ----
  app.post("/api/tasks/unassign", requireAuth, async (req: Request, res: Response) => {
    const { source, sheet, projectId, role } = req.body;
    if (!source || !projectId || !role) return res.status(400).json({ error: "Missing fields" });

    try {
      // 1. Write XX to the sheet column via Google Sheets API
      const candidates = role === "translator" ? TR_CANDIDATES : REV_CANDIDATES;
      const gsConfig = getSheetWriteConfig({ source, sheet: sheet || "" });
      if (gsConfig) {
        gsConfig.projectId = projectId;
        const result = await gsWriteToColumn(gsConfig, candidates, "XX", { skipSafetyCheck: true });
        console.log(`Unassign [${source}/${sheet}]: ${result.message}`);
      } else {
        // SheetDB fallback for unassign
        const configs = storage.getAllSheetConfigs();
        const config = configs.find(c => c.source === source && c.sheet === (sheet || ""));
        if (config?.sheetDbId) {
          const apiId = config.sheetDbId;
          const sheetName = sheet || "";
          const sampleRes = await fetch(`https://sheetdb.io/api/v1/${apiId}?sheet=${encodeURIComponent(sheetName)}&limit=1`, { headers: sheetDbHeaders() });
          if (sampleRes.ok) {
            const sampleRows = await sampleRes.json();
            if (Array.isArray(sampleRows) && sampleRows.length > 0) {
              const keys = Object.keys(sampleRows[0]);
              const idCol = findCol(keys, "Project ID", "ProjectID", "ID", "ATMS ID", "Project code", "Job ID", "Job Code", "Task Name");
              const targetCol = findCol(keys, ...candidates);
              if (idCol && targetCol) {
                const writeUrl = `https://sheetdb.io/api/v1/${apiId}/${encodeURIComponent(idCol)}/${encodeURIComponent(projectId)}?sheet=${encodeURIComponent(sheetName)}`;
                await fetch(writeUrl, { method: "PATCH", headers: sheetDbHeaders(), body: JSON.stringify({ data: { [targetCol]: "XX" } }) });
                console.log(`SheetDB unassign OK: ${targetCol}=XX for ${projectId}`);
              }
            }
          }
        }
      }

      // 2. Cancel any matching dispatch assignment
      const allAssignments = storage.getAllAssignments();
      const matching = allAssignments.filter(a =>
        a.source === source && a.projectId === projectId &&
        a.role === role &&
        a.status !== "cancelled" && a.status !== "completed"
      );
      for (const a of matching) {
        storage.updateAssignment(a.id, { status: "cancelled" });
        const offers = storage.getOffersByAssignment(a.id);
        for (const o of offers) {
          if (o.status === "pending") {
            storage.updateOffer(o.id, { status: "withdrawn", respondedAt: new Date().toISOString() });
          }
        }
      }

      // 3. Invalidate task cache
      setCache("allTasks", null as any);

      res.json({ success: true, message: `${role} unassigned from ${projectId}` });
    } catch (e: any) {
      console.error("Unassign error:", e);
      res.status(500).json({ error: "Unassign failed" });
    }
  });

  // ---- BULK COMPLETE ----
  app.post("/api/tasks/bulk-complete", requireAuth, (req: Request, res: Response) => {
    const { tasks: taskList, revCompleteValue, distributeTime } = req.body;
    if (!taskList || !Array.isArray(taskList) || taskList.length === 0) {
      return res.status(400).json({ error: "No tasks provided" });
    }

    let perTaskValue = revCompleteValue || "Yes";
    if (distributeTime && typeof revCompleteValue === "number" && taskList.length > 0) {
      perTaskValue = Math.round(revCompleteValue / taskList.length).toString();
    }

    const now = new Date().toISOString();
    const allAssignments = storage.getAllAssignments();

    for (const t of taskList) {
      const assignment = allAssignments.find((a: any) =>
        a.source === t.source && a.projectId === t.projectId &&
        a.status !== "cancelled" && a.status !== "expired"
      );
      if (assignment) {
        storage.updateAssignment(assignment.id, { status: "completed", completedAt: now });
      }
    }

    res.json({ success: true, count: taskList.length, valuePerTask: perTaskValue });
  });

  // ---- AUTO-ASSIGN RULES ----
  app.get("/api/auto-assign-rules", requireAuth, (_req: Request, res: Response) => {
    res.json(storage.getAllAutoAssignRules());
  });

  app.post("/api/auto-assign-rules", requireAuth, (req: Request, res: Response) => {
    const { name, source, account, languagePair, role, freelancerCodes, assignmentType } = req.body;
    if (!name || !role || !freelancerCodes) return res.status(400).json({ error: "Missing fields" });
    const session = storage.getSession(req.headers.authorization!.replace("Bearer ", ""));
    if (!session) return res.status(401).json({ error: "Unauthorized" });
    const user = storage.getAllPmUsers().find(u => u.id === session.pmUserId);
    const rule = storage.createAutoAssignRule({
      name, source: source || null, account: account || null,
      languagePair: languagePair || null, role,
      freelancerCodes: typeof freelancerCodes === "string" ? freelancerCodes : JSON.stringify(freelancerCodes),
      assignmentType: assignmentType || "sequence",
      enabled: 1, createdBy: user?.email || "",
    });
    res.json(rule);
  });

  app.put("/api/auto-assign-rules/:id", requireAuth, (req: Request, res: Response) => {
    const { name, source, account, languagePair, role, freelancerCodes, assignmentType, maxWwc, enabled } = req.body;
    const updates: any = {};
    if (name !== undefined) updates.name = name;
    if (source !== undefined) updates.source = source || null;
    if (account !== undefined) updates.account = account || null;
    if (languagePair !== undefined) updates.languagePair = languagePair || null;
    if (role !== undefined) updates.role = role;
    if (freelancerCodes !== undefined) updates.freelancerCodes = typeof freelancerCodes === "string" ? freelancerCodes : JSON.stringify(freelancerCodes);
    if (assignmentType !== undefined) updates.assignmentType = assignmentType;
    if (maxWwc !== undefined) updates.maxWwc = maxWwc || null;
    if (enabled !== undefined) updates.enabled = enabled ? 1 : 0;
    storage.updateAutoAssignRule(+param(req, "id"), updates);
    res.json({ success: true });
  });

  app.delete("/api/auto-assign-rules/:id", requireAuth, (req: Request, res: Response) => {
    storage.deleteAutoAssignRule(+param(req, "id"));
    res.json({ success: true });
  });

  // ---- SLACK NOTIFICATIONS ----
  async function sendSlackNotification(text: string) {
    if (!SLACK_WEBHOOK_URL) return;
    try {
      await fetch(SLACK_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
    } catch (e) {
      console.error("Slack notification failed (non-fatal):", e);
    }
  }

  // ---- AUTO-DISPATCH ENGINE ----
  // POST /api/auto-dispatch — checks rules against unassigned tasks and auto-assigns
  app.post("/api/auto-dispatch", requireAuth, async (req: Request, res: Response) => {
    try {
      const rules = storage.getAllAutoAssignRules().filter(r => r.enabled);
      if (rules.length === 0) return res.json({ dispatched: 0, message: "No enabled rules" });

      const allAssignments = storage.getAllAssignments();
      const assignedKeys = new Set(
        allAssignments.filter(a => a.status !== "cancelled" && a.status !== "expired")
          .map(a => `${a.source}|${a.sheet}|${a.projectId}|${a.role}`)
      );

      // Get current tasks
      const allConfigs = storage.getAllSheetConfigs();
      let dispatched = 0;
      const results: any[] = [];

      // For each rule, find matching unassigned tasks
      for (const rule of rules) {
        const freelancerCodes = JSON.parse(rule.freelancerCodes || "[]") as string[];
        if (freelancerCodes.length === 0) continue;

        // This is a simplified check — in production, you'd cross-reference with fetched tasks
        results.push({ rule: rule.name, freelancers: freelancerCodes.length, status: "ready" });
      }

      // Send Slack notification about auto-dispatch
      if (dispatched > 0) {
        sendSlackNotification(`\u26a1 Auto-dispatch: ${dispatched} tasks assigned automatically.`);
      }

      res.json({ dispatched, rules: results });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ---- SEQUENCE TIMEOUT / AUTO-WITHDRAW ----
  // POST /api/sequence-advance — checks pending sequential offers and advances expired ones
  app.post("/api/sequence-advance", requireAuth, async (req: Request, res: Response) => {
    try {
      const assignments = storage.getAllAssignments().filter(a => 
        a.status === "offered" && a.assignmentType === "sequence"
      );
      let advanced = 0;
      const now = Date.now();

      for (const assignment of assignments) {
        const offers = storage.getOffersByAssignment(assignment.id);
        const pendingOffer = offers.find(o => o.status === "pending");
        if (!pendingOffer || !pendingOffer.sentAt) continue;

        const sentTime = new Date(pendingOffer.sentAt).getTime();
        const timeoutMs = (assignment.sequenceTimeoutMinutes || 60) * 60 * 1000;

        if (now - sentTime > timeoutMs) {
          // Withdraw the expired offer
          storage.updateOffer(pendingOffer.id, { status: "expired", respondedAt: new Date().toISOString() });

          // Advance to next in sequence
          const seqList = JSON.parse(assignment.sequenceList || "[]") as string[];
          const nextIdx = (assignment.currentSequenceIndex || 0) + 1;

          if (nextIdx < seqList.length) {
            // Find the freelancer for next in sequence from existing offers
            const nextCode = seqList[nextIdx];
            const nextOffer = offers.find(o => o.freelancerCode === nextCode);

            if (nextOffer) {
              // Send the offer
              storage.updateOffer(nextOffer.id, { status: "pending", sentAt: new Date().toISOString() });
              storage.updateAssignment(assignment.id, { currentSequenceIndex: nextIdx });

              // Send email
              const taskDetails = JSON.parse(assignment.taskDetails || "{}");
              const email = buildOfferEmailHtml(taskDetails, nextOffer, assignment);
              try {
                await sendEmail([nextOffer.freelancerEmail], email.subject, email.html);
                sendSlackNotification(`\u23f0 Sequence timeout: ${pendingOffer.freelancerName} didn't respond. Offered to ${nextOffer.freelancerName} for ${assignment.projectId}.`);
              } catch (e) {
                console.error("Failed to send sequence advance email:", e);
              }
              advanced++;
            }
          } else {
            // No more freelancers in sequence — expire the assignment
            storage.updateAssignment(assignment.id, { status: "expired" });
            sendSlackNotification(`\u274c Sequence exhausted for ${assignment.projectId} (${assignment.role}). No freelancer accepted.`);
          }
        }
      }

      res.json({ advanced, checked: assignments.length });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ---- FREELANCER STATS (for predictive deadline) ----
  app.get("/api/freelancer-delivery-stats", requireAuth, (_req: Request, res: Response) => {
    // Calculate average delivery speed per freelancer based on historical data
    const allAssignments = storage.getAllAssignments();
    const stats: Record<string, { avgHoursToComplete: number; taskCount: number; avgWwcPerHour: number }> = {};

    for (const a of allAssignments) {
      if (a.status !== "completed" || !a.acceptedAt || !a.completedAt || !a.acceptedBy) continue;
      const acceptedTime = new Date(a.acceptedAt).getTime();
      const completedTime = new Date(a.completedAt).getTime();
      const hours = (completedTime - acceptedTime) / 3600000;
      if (hours <= 0 || hours > 720) continue; // skip invalid

      const task = JSON.parse(a.taskDetails || "{}");
      const wwcParsed = parseFloat((task.wwc || "0").toString().replace(/[^\d.,]/g, "").replace(",", "."));
      const wwc = isNaN(wwcParsed) ? 0 : wwcParsed;

      const code = a.acceptedBy;
      if (!stats[code]) stats[code] = { avgHoursToComplete: 0, taskCount: 0, avgWwcPerHour: 0 };
      const s = stats[code];
      s.avgHoursToComplete = (s.avgHoursToComplete * s.taskCount + hours) / (s.taskCount + 1);
      if (wwc > 0 && hours > 0) {
        s.avgWwcPerHour = (s.avgWwcPerHour * s.taskCount + (wwc / hours)) / (s.taskCount + 1);
      }
      s.taskCount++;
    }

    res.json(stats);
  });

  // Notify Slack on assignment events (hook into existing flows)
  // This is called after assignment creation
  function notifySlackAssignment(projectId: string, role: string, freelancerName: string, type: string) {
    sendSlackNotification(`\ud83d\udce8 Task ${projectId}: ${freelancerName} offered ${role} role (${type}).`);
  }

  function notifySlackAccepted(projectId: string, freelancerName: string, role: string) {
    sendSlackNotification(`\u2705 ${freelancerName} accepted ${role} for ${projectId}.`);
  }

  function notifySlackRejected(projectId: string, freelancerName: string, role: string) {
    sendSlackNotification(`\u274c ${freelancerName} declined ${role} for ${projectId}.`);
  }

  // ---- ANALYTICS (uses shared task cache) ----
  // ── Analytics filter options ──
  app.get("/api/analytics/filters", requireAuth, async (_req: Request, res: Response) => {
    try {
      const allSheetTasks = await getAllTasksCached();
      const sources = new Set<string>();
      const accounts = new Set<string>();
      for (const t of allSheetTasks) {
        if (t.source) sources.add(t.source);
        if (t.account) accounts.add(t.account);
      }
      res.json({
        sources: [...sources].sort(),
        accounts: [...accounts].sort(),
      });
    } catch (e: any) {
      console.error("Analytics filters error:", e.message);
      res.status(500).json({ error: "Failed to fetch filter options" });
    }
  });

  app.get("/api/analytics", requireAuth, async (req: Request, res: Response) => {
    try {
      // Cache analytics response for 5 min (keyed by query params)
      const cacheKey = `analytics_${req.url}`;
      const cachedAnalytics = getCached<any>(cacheKey, 300000);
      if (cachedAnalytics) return res.json(cachedAnalytics);

      const allSheetTasksRaw = await getAllTasksCached();

      // ── Apply filters ──
      const fSource = req.query.source ? String(req.query.source).split(",") : null;
      const fAccount = req.query.account ? String(req.query.account).split(",") : null;
      const fDateFrom = req.query.dateFrom ? new Date(String(req.query.dateFrom)) : null;
      const fDateTo = req.query.dateTo ? new Date(String(req.query.dateTo) + "T23:59:59") : null;

      const allSheetTasks = allSheetTasksRaw.filter((t: any) => {
        if (fSource && !fSource.includes(t.source)) return false;
        if (fAccount && !fAccount.includes(t.account)) return false;
        if (fDateFrom || fDateTo) {
          const d = t.deadline ? parseDeadline(t.deadline) : null;
          if (!d) return false;
          if (fDateFrom && d < fDateFrom) return false;
          if (fDateTo && d > fDateTo) return false;
        }
        return true;
      });

      // Sheet-based analytics
      const byAccount: Record<string, { count: number; totalWwc: number }> = {};
      const bySource: Record<string, number> = {};
      const bySourceSummary: Record<string, { count: number; totalWwc: number; ongoing: number }> = {};
      const byStatus: Record<string, number> = {};
      let totalWwcSum = 0;
      const byMonth: Record<string, { count: number; wwc: number }> = {};
      const freelancerWwc: Record<string, { name: string; wwc: number; tasks: number; qsScores: number[] }> = {};

      for (const t of allSheetTasks) {
        // By account
        const acc = t.account || "Unknown";
        if (!byAccount[acc]) byAccount[acc] = { count: 0, totalWwc: 0 };
        byAccount[acc].count++;
        const wwcRaw = parseFloat((t.wwc || "0").toString().replace(/[^\d.,]/g, "").replace(",", "."));
        const wwc = isNaN(wwcRaw) ? 0 : wwcRaw;
        byAccount[acc].totalWwc += wwc;
        totalWwcSum += wwc;

        // By source (top-level)
        if (!bySourceSummary[t.source]) bySourceSummary[t.source] = { count: 0, totalWwc: 0, ongoing: 0 };
        bySourceSummary[t.source].count++;
        bySourceSummary[t.source].totalWwc += wwc;
        if (t.delivered === "Ongoing") bySourceSummary[t.source].ongoing++;

        // By source
        const src = `${t.source}/${t.sheet}`;
        bySource[src] = (bySource[src] || 0) + 1;

        // By delivered status
        byStatus[t.delivered || "Unknown"] = (byStatus[t.delivered || "Unknown"] || 0) + 1;

        // By month (from deadline) — skip unreasonable dates
        if (t.deadline) {
          const d = parseDeadline(t.deadline);
          if (d && d.getFullYear() >= 2020 && d.getFullYear() <= 2027) {
            const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
            if (!byMonth[month]) byMonth[month] = { count: 0, wwc: 0 };
            byMonth[month].count++;
            byMonth[month].wwc += wwc;
          }
        }

        // Freelancer performance
        const tr = (t.translator || "").trim();
        if (tr && tr !== "XX") {
          if (!freelancerWwc[tr]) freelancerWwc[tr] = { name: tr, wwc: 0, tasks: 0, qsScores: [] };
          freelancerWwc[tr].wwc += wwc;
          freelancerWwc[tr].tasks++;
          const qs = parseFloat(t.qs || "0");
          if (qs > 0) freelancerWwc[tr].qsScores.push(qs);
        }
      }

      // Dispatch assignment analytics
      const allAssignmentsRaw = storage.getAllAssignments();
      const allAssignments = allAssignmentsRaw.filter((a: any) => {
        if (fSource && !fSource.includes(a.source)) return false;
        if (fAccount && !fAccount.includes(a.account)) return false;
        return true;
      });

      // Assignments by day
      const byDay: Record<string, { created: number; accepted: number; completed: number }> = {};
      for (const a of allAssignments) {
        const day = a.createdAt?.slice(0, 10) || "unknown";
        if (!byDay[day]) byDay[day] = { created: 0, accepted: 0, completed: 0 };
        byDay[day].created++;
        if (a.status === "accepted" || a.status === "completed") byDay[day].accepted++;
        if (a.status === "completed") byDay[day].completed++;
      }

      // By role
      const byRole = { translator: 0, reviewer: 0 };
      for (const a of allAssignments) {
        if (a.role === "translator") byRole.translator++;
        else byRole.reviewer++;
      }

      // By type
      const byType: Record<string, number> = {};
      for (const a of allAssignments) {
        byType[a.assignmentType] = (byType[a.assignmentType] || 0) + 1;
      }

      // By assignment status (dispatch)
      const byAssignmentStatus: Record<string, number> = {};
      for (const a of allAssignments) {
        byAssignmentStatus[a.status] = (byAssignmentStatus[a.status] || 0) + 1;
      }

      // Top freelancers by accepted tasks
      const topFreelancers: Record<string, { name: string; accepted: number; completed: number }> = {};
      for (const a of allAssignments) {
        if (a.acceptedBy && a.acceptedByName) {
          if (!topFreelancers[a.acceptedBy]) topFreelancers[a.acceptedBy] = { name: a.acceptedByName, accepted: 0, completed: 0 };
          topFreelancers[a.acceptedBy].accepted++;
          if (a.status === "completed") topFreelancers[a.acceptedBy].completed++;
        }
      }

      // Average response time (from offer sent to accept/reject)
      const allOffers: any[] = [];
      for (const a of allAssignments) {
        const assignmentOffers = storage.getOffersByAssignment(a.id);
        allOffers.push(...assignmentOffers);
      }

      const responseTimes: number[] = [];
      for (const o of allOffers) {
        if (o.respondedAt && o.sentAt) {
          const diff = new Date(o.respondedAt).getTime() - new Date(o.sentAt).getTime();
          if (diff > 0) responseTimes.push(diff / 60000); // in minutes
        }
      }
      const avgResponseTime = responseTimes.length > 0
        ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
        : null;

      // Freelancer performance top 15
      const topFreelancersByWwc = Object.entries(freelancerWwc)
        .map(([code, d]) => ({
          code, name: d.name, wwc: Math.round(d.wwc), tasks: d.tasks,
          avgQs: d.qsScores.length > 0 ? Math.round(d.qsScores.reduce((a,b) => a+b, 0) / d.qsScores.length * 10) / 10 : null,
        }))
        .sort((a, b) => b.wwc - a.wwc)
        .slice(0, 15);

      const result = {
        // Dispatch data
        byDay: Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b)),
        byRole, byType,
        dispatchTopFreelancers: Object.entries(topFreelancers)
          .sort(([, a], [, b]) => b.accepted - a.accepted)
          .slice(0, 10),
        totalAssignments: allAssignments.length,
        totalOffers: allOffers.length,
        avgResponseTimeMinutes: avgResponseTime,
        // Sheet data
        totalSheetTasks: allSheetTasks.length,
        totalWwc: Math.round(totalWwcSum),
        byAccount: Object.entries(byAccount).sort(([,a], [,b]) => b.count - a.count),
        bySource: Object.entries(bySource).sort(([,a], [,b]) => b - a),
        bySourceSummary: Object.entries(bySourceSummary).sort(([,a], [,b]) => b.count - a.count),
        byStatus,
        byMonth: Object.entries(byMonth).sort(([a], [b]) => a.localeCompare(b)),
        topFreelancersByWwc,
      };
      setCache(cacheKey, result);
      res.json(result);
    } catch (e: any) {
      console.error("Analytics error:", e.message);
      res.status(500).json({ error: "Failed to compute analytics" });
    }
  });

  // ============================================
  // NOTIFICATION CENTER
  // ============================================

  app.get("/api/notifications", requireAuth, (_req: Request, res: Response) => {
    const recent = storage.getRecentNotifications(50);
    // Only return last 24h
    const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const filtered = recent.filter(n => n.createdAt >= cutoff);
    res.json({ notifications: filtered, unreadCount: storage.getUnreadCount() });
  });

  app.post("/api/notifications/:id/read", requireAuth, (req: Request, res: Response) => {
    storage.markNotificationRead(+param(req, "id"));
    res.json({ success: true });
  });

  app.post("/api/notifications/read-all", requireAuth, (_req: Request, res: Response) => {
    storage.markAllNotificationsRead();
    res.json({ success: true });
  });

  // ============================================
  // FREELANCER PORTAL
  // ============================================

  // Magic link request — freelancer enters their email
  app.post("/api/freelancer/magic-link", async (req: Request, res: Response) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required" });

    try {
      // Check if this email belongs to an approved freelancer
      const flRes = await fetch(BASE44_API, {
        headers: { "Content-Type": "application/json", "api_key": BASE44_KEY },
      });
      const freelancers = await flRes.json();
      const fl = (Array.isArray(freelancers) ? freelancers : []).find(
        (f: any) => f.email?.toLowerCase() === email.toLowerCase().trim()
      );
      if (!fl) return res.status(404).json({ error: "Email not found in our records." });

      const token = generateToken();
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      storage.createFreelancerSession({
        token,
        freelancerCode: fl.resource_code,
        freelancerName: fl.full_name,
        freelancerEmail: fl.email,
        expiresAt,
      });

      const clientBase = req.body.clientBaseUrl || SITE_PUBLIC_URL;
      const magicUrl = `${clientBase}#/freelancer/verify/${token}`;
      const html = buildMagicLinkEmailHtml(fl.full_name, magicUrl);

      await sendEmail([fl.email], "ElTurco Dispatch — Sign In", html);
      res.json({ success: true, message: "Magic link sent to your email." });
    } catch (e: any) {
      console.error("Freelancer magic link error:", e);
      res.status(500).json({ error: "Failed to send magic link" });
    }
  });

  // Verify magic link and create session
  app.post("/api/freelancer/verify/:token", (req: Request, res: Response) => {
    const session = storage.getFreelancerSession(param(req, "token"));
    if (!session) return res.status(404).json({ error: "Invalid or expired link" });
    if (new Date(session.expiresAt) < new Date()) {
      storage.deleteFreelancerSession(param(req, "token"));
      return res.status(400).json({ error: "Link has expired" });
    }
    // Extend session to 72 hours
    const newToken = generateToken();
    const expiresAt = new Date(Date.now() + 72 * 3600 * 1000).toISOString();
    storage.createFreelancerSession({
      token: newToken,
      freelancerCode: session.freelancerCode,
      freelancerName: session.freelancerName,
      freelancerEmail: session.freelancerEmail,
      expiresAt,
    });
    // Clean up the one-time token
    storage.deleteFreelancerSession(param(req, "token"));
    res.json({
      token: newToken,
      freelancer: {
        code: session.freelancerCode,
        name: session.freelancerName,
        email: session.freelancerEmail,
      },
    });
  });

  // Get freelancer tasks (active + completed)
  app.get("/api/freelancer/tasks", async (req: Request, res: Response) => {
    const flToken = req.headers.authorization?.replace("Bearer ", "");
    if (!flToken) return res.status(401).json({ error: "No token" });
    const session = storage.getFreelancerSession(flToken);
    if (!session) return res.status(401).json({ error: "Invalid session" });
    if (new Date(session.expiresAt) < new Date()) {
      storage.deleteFreelancerSession(flToken);
      return res.status(401).json({ error: "Session expired" });
    }

    try {
      const code = session.freelancerCode;
      const allTasks = await getAllTasksCached();

      // Find tasks where this freelancer is assigned as TR or REV
      const myTasks = allTasks.filter((t: any) =>
        (t.translator || "").trim() === code || (t.reviewer || "").trim() === code
      ).map((t: any) => {
        const isTranslator = (t.translator || "").trim() === code;
        const isReviewer = (t.reviewer || "").trim() === code;
        const roles: string[] = [];
        if (isTranslator) roles.push("translator");
        if (isReviewer) roles.push("reviewer");
        return { ...t, myRoles: roles };
      });

      // Split into active vs completed
      const active = myTasks.filter((t: any) => t.delivered === "Ongoing" && !isEffectivelyCancelledTask(t));
      const completed = myTasks.filter((t: any) => t.delivered !== "Ongoing" || isEffectivelyCancelledTask(t));

      // Get pending offers for this freelancer
      const allAssignments = storage.getAllAssignments();
      const pendingOffers: any[] = [];
      for (const a of allAssignments) {
        if (a.status === "offered" || a.status === "pending") {
          const offers = storage.getOffersByAssignment(a.id);
          for (const o of offers) {
            if (o.freelancerCode === code && o.status === "pending") {
              const taskDetails = JSON.parse(a.taskDetails || "{}");
              pendingOffers.push({
                offerId: o.id,
                token: o.token,
                assignment: { id: a.id, source: a.source, sheet: a.sheet, projectId: a.projectId, account: a.account, role: a.role, reviewType: a.reviewType },
                task: taskDetails,
                sentAt: o.sentAt,
              });
            }
          }
        }
      }

      res.json({
        freelancer: { code: session.freelancerCode, name: session.freelancerName, email: session.freelancerEmail },
        active, completed: completed.slice(0, 50),
        pendingOffers,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Helper for freelancer portal
  function isEffectivelyCancelledTask(t: any): boolean {
    const trLower = (t.trDone || "").trim().toLowerCase();
    const revLower = (t.revComplete || "").trim().toLowerCase();
    const cancelledValues = ["cancelled", "canceled", "on hold", "onhold", "on-hold"];
    return cancelledValues.includes(trLower) || cancelledValues.includes(revLower);
  }
}

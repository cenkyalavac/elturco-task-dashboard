/**
 * Integration Router — task fetching, freelancers, assignments, offers,
 * sheet operations, ELTS integration, auto-assign, auto-dispatch, sequences.
 *
 * This is the largest domain router — contains all the task/assignment/offer/sheet
 * integration logic extracted from the monolithic routes.ts.
 *
 * Routes:
 *   GET    /freelancers
 *   GET    /tasks
 *   GET    /assignments
 *   GET    /assignments/:id
 *   POST   /assignments
 *   POST   /assignments/self-assign
 *   POST   /assignments/confirmed
 *   POST   /assignments/:id/cancel
 *   POST   /assignments/:id/undo
 *   POST   /offers/:id/withdraw
 *   GET    /offers/:token
 *   POST   /offers/:token/accept
 *   POST   /offers/:token/reject
 *   POST   /offers/:token/complete
 *   GET    /task-notes
 *   POST   /task-notes
 *   GET    /favorites
 *   POST   /favorites
 *   POST   /tasks/batch-deadline
 *   POST   /export/xlsx
 *   POST   /elts/availability
 *   DELETE /elts/availability/:freelancerCode/:date
 *   GET    /sheet-configs
 *   POST   /sheet-configs
 *   DELETE /sheet-configs/:id
 *   GET    /email-templates
 *   POST   /email-templates
 *   GET    /presets
 *   POST   /presets
 *   DELETE /presets/:id
 *   POST   /tasks/complete
 *   GET    /elts/quality
 *   GET    /elts/availability
 *   GET    /freelancer-stats
 *   GET    /pm-users
 *   POST   /pm-users
 *   PUT    /pm-users/:id
 *   POST   /pm-users/preferences
 *   POST   /tasks/unassign
 *   POST   /tasks/bulk-complete
 *   GET    /auto-assign-rules
 *   POST   /auto-assign-rules
 *   PUT    /auto-assign-rules/:id
 *   DELETE /auto-assign-rules/:id
 *   POST   /auto-dispatch
 *   POST   /sequence-advance
 *   GET    /freelancer-delivery-stats
 */
import { Router, Request, Response } from "express";
import { storage, db } from "../storage";
import { wsBroadcast } from "../ws";
import { gsWriteToColumn, gsIsAvailable, gsReadSheet, type SheetWriteConfig } from "../gsheets";
import { taskNotes, pmFavorites, qualityReports, vendors } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { z } from "zod";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import {
  requireAuth,
  validate,
  param,
  safeError,
  resolveBaseUrl,
  buildApiBase,
  generateToken,
  sendEmail,
  sendSlackNotification,
  notify,
  logAudit,
  getClientIp,
  getCached,
  setCache,
  invalidateCache,
  acquireLock,
  releaseLock,
  BASE44_API,
  BASE44_KEY,
  SHEETDB_API_KEY,
  SITE_PUBLIC_URL,
  buildRedirectPage,
  buildMagicLinkEmailHtml,
  replaceVars,
  offerLimiter,
  MAGIC_LINK_EXPIRY_MINUTES,
} from "./shared";

const router = Router();

// ============================================
// ZOD VALIDATION SCHEMAS
// ============================================
const assignmentSchema = z.object({
  source: z.string().min(1).max(100),
  sheet: z.string().max(100).optional(),
  projectId: z.string().min(1).max(200),
  account: z.string().max(200).optional(),
  taskDetails: z.record(z.any()).optional(),
  assignmentType: z.enum(["direct", "sequence", "broadcast"]),
  role: z.enum(["translator", "reviewer"]),
  freelancers: z.array(z.object({
    resourceCode: z.string(),
    full_name: z.string().optional(),
    email: z.string().optional(),
  })).min(1),
  emailSubject: z.string().max(500).optional(),
  emailBody: z.string().max(10000).optional(),
  customDeadline: z.string().max(100).optional(),
  reviewType: z.string().max(100).optional().nullable(),
  autoAssignReviewer: z.number().optional(),
  reviewerAssignmentType: z.string().optional().nullable(),
  reviewerSequenceList: z.string().optional().nullable(),
});

const selfAssignSchema = z.object({
  source: z.string().min(1).max(100),
  sheet: z.string().max(100).optional(),
  projectId: z.string().min(1).max(200),
  account: z.string().max(200).optional(),
  taskDetails: z.record(z.any()).optional(),
  role: z.enum(["translator", "reviewer"]),
  reviewType: z.string().max(100).optional().nullable(),
  customDeadline: z.string().max(100).optional(),
});

// ============================================
// CONSTANTS
// ============================================

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

// Normalize language pair to standard 2-letter ISO format: "EN>TR"
const LANG_NAME_MAP: Record<string, string> = {
  english: "EN", turkish: "TR", arabic: "AR", spanish: "ES", russian: "RU",
  french: "FR", german: "DE", italian: "IT", portuguese: "PT", dutch: "NL",
  polish: "PL", czech: "CS", hungarian: "HU", romanian: "RO", bulgarian: "BG",
  greek: "EL", croatian: "HR", serbian: "SR", slovenian: "SL", slovak: "SK",
  lithuanian: "LT", latvian: "LV", estonian: "ET", ukrainian: "UK", hebrew: "HE",
  persian: "FA", korean: "KO", japanese: "JP", chinese: "ZH", thai: "TH",
  vietnamese: "VI", indonesian: "ID", malay: "MS", filipino: "FI",
  indonesia: "ID", brazilian: "PT",
};

// ============================================
// HELPERS
// ============================================

function normalizeLangPair(pair: string): string {
  if (!pair) return "";
  const gtIdx = pair.indexOf(">");
  if (gtIdx === -1) return pair;
  let srcRaw = pair.slice(0, gtIdx).trim();
  let tgtRaw = pair.slice(gtIdx + 1).trim();

  function normLang(code: string): string {
    const c = code.trim();
    if (!c || c.toLowerCase() === "null") return "";
    const lower = c.toLowerCase();
    if (LANG_NAME_MAP[lower]) return LANG_NAME_MAP[lower];
    const words = lower.split(/\s+/);
    for (const w of words) {
      if (LANG_NAME_MAP[w]) return LANG_NAME_MAP[w];
    }
    const base = c.split("-")[0].split(" ")[0].toUpperCase();
    if (base.length > 4 || base.length < 2) return "";
    return base;
  }

  if (srcRaw.includes(" ")) {
    const lastWord = srcRaw.split(/\s+/).pop() || "";
    if (/^[A-Z]{2,3}$/i.test(lastWord)) srcRaw = lastWord;
    else srcRaw = normLang(srcRaw) ? srcRaw : "";
  }

  const src = normLang(srcRaw);
  const tgt = normLang(tgtRaw);
  if (!src || !tgt) return "";
  return `${src}>${tgt}`;
}

// Normalizes column names by stripping whitespace, newlines, special chars
function normalizeColName(name: string): string {
  return name.replace(/[\s\n\r]+/g, "").toLowerCase().replace(/[^a-z0-9%]/g, "");
}

// Find a value in a row by trying multiple possible column names
function getCol(row: any, ...candidates: string[]): string {
  for (const c of candidates) {
    if (row[c] !== undefined && row[c] !== null) return String(row[c]).trim();
  }
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

// Dynamically resolve column name from actual sheet keys
function findCol(rowKeys: string[], ...candidates: string[]): string | null {
  for (const c of candidates) {
    if (rowKeys.includes(c)) return c;
  }
  const normalize = (s: string) => s.replace(/[\s\n\r]+/g, "").toLowerCase().replace(/[^a-z0-9%]/g, "");
  const normalizedMap = new Map(rowKeys.map(k => [normalize(k), k]));
  for (const c of candidates) {
    const match = normalizedMap.get(normalize(c));
    if (match) return match;
  }
  return null;
}

// Parse deadline string — supports DD.MM.YYYY HH:mm, DD/MM/YYYY, DD-MM-YYYY, ISO
export function parseDeadline(d: string): Date | null {
  if (!d) return null;
  const m1 = d.match(/(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})\s+(\d{1,2}):(\d{2})/);
  if (m1) return new Date(+m1[3], +m1[2] - 1, +m1[1], +m1[4], +m1[5]);
  const m2 = d.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/);
  if (m2) return new Date(+m2[3], +m2[2] - 1, +m2[1]);
  const parsed = new Date(d);
  return isNaN(parsed.getTime()) ? null : parsed;
}

// ============================================
// SHEET TASK FETCHING
// ============================================

function sheetDbHeaders(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (SHEETDB_API_KEY) h["Authorization"] = `Bearer ${SHEETDB_API_KEY}`;
  return h;
}

// Map config sheet names to actual Google Sheets tab names (where they differ)
const TAB_NAME_MAP: Record<string, string> = {
  "Non-EN": "Non-EN Tasks",
  "DPX": "Amazon DPX",
};

async function fetchSheetTasks(apiId: string, tabName: string, sheetLabel: string, source: string, googleSheetId?: string | null): Promise<any[]> {
  let data: any[] | null = null;

  // 1. Try Google Sheets API first (faster, no rate limits)
  if (googleSheetId) {
    const actualTab = TAB_NAME_MAP[tabName] || tabName;
    data = await gsReadSheet(googleSheetId, actualTab);
    if (data !== null) {
      // gsReadSheet returns same format as SheetDB — proceed to mapping
    }
  }

  // 2. Fallback: SheetDB (for tabs without Google Sheet ID)
  if (data === null && apiId) {
    try {
      const url = `https://sheetdb.io/api/v1/${apiId}?sheet=${encodeURIComponent(tabName)}`;
      const res = await fetch(url, { headers: sheetDbHeaders() });
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json)) data = json;
      }
    } catch (e: any) {
      console.error(`SheetDB fallback read failed for ${tabName}:`, e.message?.slice(0, 80));
    }
  }

  if (!data || !Array.isArray(data)) return [];
  try {
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
      languagePair: normalizeLangPair(extractLanguagePair(row, sheetLabel, source)),
    })).filter((t: any) => t.projectId).map((t: any) => {
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

// ============================================
// EXTRACT FUNCTIONS
// ============================================

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
  return v.charAt(0).toUpperCase() + v.slice(1);
}

function extractDeadline(row: any, sheet: string): string {
  const trSpecific = getCol(row, "TR\nDeadline", "TR Deadline");
  if (trSpecific) return trSpecific;
  const genericDl = getCol(row, "Deadline");
  const revDl = getCol(row, "Rev. Deadline", "Rev Deadline", "Rev.\nDeadline", "Client Deadline", "Client\nDeadline");
  if (genericDl && !revDl) return genericDl;
  return genericDl || "";
}
function extractRevDeadline(row: any, sheet: string): string {
  if (sheet === "TPT") return getCol(row, "Client\nDeadline", "Client Deadline");
  const revSpecific = getCol(row, "Rev Deadline", "Rev. Deadline", "Rev.\nDeadline", "Client Deadline", "Client\nDeadline");
  if (revSpecific) return revSpecific;
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
  const lang = getCol(row, "Language", "Target", "Target Language", "target");
  if (lang) {
    const lv = lang.toLowerCase().trim();
    const arrowRegex = /[►▸▶→>➜➤⇒]/;
    if (arrowRegex.test(lv)) {
      const parts = lv.split(arrowRegex).map(s => s.trim());
      if (parts.length === 2 && parts[0] && parts[1]) {
        const src = parts[0].split("-")[0].toUpperCase();
        const tgt = parts[1].split("-")[0].toUpperCase();
        if (src && tgt) return `${src}>${tgt}`;
      }
    }
    const tgt = lv.split("-")[0].toUpperCase();
    if (tgt && tgt.length === 2 && tgt !== "EN") return `EN>${tgt}`;
  }
  return "";
}

// ============================================
// EMAIL TEMPLATES
// ============================================

function buildDefaultOfferBody(vars: Record<string, string>, task?: any): string {
  const role = vars.role || "Translation";
  const isReviewer = role === "Review";
  const deadline = isReviewer ? (task?.revDeadline || vars.deadline) : vars.deadline;
  const deadlineLabel = isReviewer ? "Review Deadline" : "Translation Deadline";
  const rowA = (label: string, value: string) => `<tr><td style="padding:10px 14px;background:#f8f9fa;font-weight:600;color:#555;border-bottom:1px solid #eee;width:140px;font-size:13px">${label}</td><td style="padding:10px 14px;background:#f8f9fa;border-bottom:1px solid #eee;font-size:13px">${value}</td></tr>`;
  const rowB = (label: string, value: string) => `<tr><td style="padding:10px 14px;font-weight:600;color:#555;border-bottom:1px solid #eee;width:140px;font-size:13px">${label}</td><td style="padding:10px 14px;border-bottom:1px solid #eee;font-size:13px">${value}</td></tr>`;

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

  let hoNoteRow = "";
  if (task?.hoNote) {
    hoNoteRow = rowA("HO Note", `<span style="color:#e67e22">${task.hoNote}</span>`);
  }

  let titleRow = "";
  if (task?.projectTitle) {
    titleRow = rowB("Project", task.projectTitle);
  }

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

async function buildOfferEmailHtml(task: any, offer: any, assignment: any, customSubject?: string, customBody?: string): Promise<{ subject: string; html: string }> {
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

  let subject: string;
  if (customSubject) {
    subject = replaceVars(customSubject, vars);
  } else {
    const templateKey = assignment.role === "translator" ? "offer_translator" : "offer_reviewer";
    const tpl = await storage.getEmailTemplate(templateKey);
    subject = tpl ? replaceVars(tpl.subject, vars) : `${role} Task — ${task.account} — ${task.projectId}`;
  }

  let bodyContent: string;
  if (customBody) {
    bodyContent = replaceVars(customBody, vars);
  } else {
    const templateKey = assignment.role === "translator" ? "offer_translator" : "offer_reviewer";
    const tpl = await storage.getEmailTemplate(templateKey);
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

// ============================================
// SHEET WRITE HELPERS
// ============================================

const TR_CANDIDATES = ["TR ", "TR", "Translator", "Tra", "TER"];
const REV_CANDIDATES = ["Rev", "REV", "Reviewer", "Rev."];
const TR_DONE_CANDIDATES = ["TR\nDone?", "TR Done?", "TR Dlvr", "TR Dlvr?", "TR Dlv?", "TR Delivered?", "TR delivered?", "TR Delivered", "TR Compl?", "Tra Dlv?", "TR\nDlvr?"];
const REV_COMPLETE_CANDIDATES = ["Rev\nDone?", "Rev Done?", "Rev Complete? (in minutes)", "Rev Complete?", "Rev Completed? (in minutes)", "Rev Compl?", "Time Spent\n(in minutes)", "Time Spent (in minutes)", "Time Spent", "Rev Time (min.)", "Rev. Dlv?", "Rev QA", "Rev Dlvr?", "Rev\nDlvr?"];
const QS_CANDIDATES = ["QS", "QS (Num)"];
const TR_DEADLINE_CANDIDATES = ["TR\nDeadline", "TR Deadline", "Deadline"];

async function getSheetWriteConfig(assignment: any): Promise<SheetWriteConfig | null> {
  const configs = await storage.getAllSheetConfigs();
  const config = configs.find(c => c.source === assignment.source && c.sheet === assignment.sheet);
  if (!config) return null;
  const gsId = config.googleSheetId;
  if (gsId) return { googleSheetId: gsId, tabName: assignment.sheet, projectId: assignment.projectId };
  return null;
}

async function safeWriteToSheet(assignment: any, freelancerCode: string, columnType: "translator" | "reviewer") {
  const candidates = columnType === "translator" ? TR_CANDIDATES : REV_CANDIDATES;
  const gsConfig = await getSheetWriteConfig(assignment);

  if (!gsConfig) {
    console.error(`Sheet write SKIPPED [${assignment.source}/${assignment.sheet}]: No Google Sheet config. SheetDB fallback disabled to prevent prefix-matching bug.`);
    return;
  }

  const result = await gsWriteToColumn(gsConfig, candidates, freelancerCode);
  console.log(`Sheet write [${assignment.source}/${assignment.sheet}]: ${result.message}`);
}

async function safeWriteStatusToSheet(assignment: any, columnType: "trDone" | "revComplete", value: string) {
  const candidates = columnType === "trDone" ? TR_DONE_CANDIDATES : REV_COMPLETE_CANDIDATES;
  const gsConfig = await getSheetWriteConfig(assignment);

  if (!gsConfig) {
    console.error(`Status write SKIPPED [${assignment.source}/${assignment.sheet}]: No Google Sheet config. SheetDB fallback disabled.`);
    return;
  }

  const result = await gsWriteToColumn(gsConfig, candidates, value, { skipSafetyCheck: true });
  console.log(`Status write [${assignment.source}/${assignment.sheet}]: ${result.message}`);
}

async function safeWriteDeadlineToSheet(assignment: any, deadlineValue: string) {
  const gsConfig = await getSheetWriteConfig(assignment);

  if (!gsConfig) {
    console.error(`Deadline write SKIPPED [${assignment.source}/${assignment.sheet}]: No Google Sheet config. SheetDB fallback disabled.`);
    return;
  }

  const result = await gsWriteToColumn(gsConfig, TR_DEADLINE_CANDIDATES, deadlineValue, { skipSafetyCheck: true });
  console.log(`Deadline write [${assignment.source}/${assignment.sheet}]: ${result.message}`);
}

async function safeWriteQsToSheet(assignment: any, qsValue: string) {
  const gsConfig = await getSheetWriteConfig(assignment);

  if (!gsConfig) {
    console.error(`QS write SKIPPED [${assignment.source}/${assignment.sheet}]: No Google Sheet config. SheetDB fallback disabled.`);
    return;
  }

  const result = await gsWriteToColumn(gsConfig, QS_CANDIDATES, qsValue, { skipSafetyCheck: true });
  console.log(`QS write [${assignment.source}/${assignment.sheet}]: ${result.message}`);
}

// ============================================
// WRITE QS TO ELTS (QualityReport entity)
// ============================================

async function writeQsToElts(assignment: any, offer: any, qsScore: number) {
  if (!BASE44_KEY) return;
  try {
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

    const pmUser = (await storage.getAllPmUsers()).find(u => u.id === assignment.assignedBy);

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

// ============================================
// SLACK NOTIFICATION HELPERS
// ============================================

function notifySlackAssignment(projectId: string, role: string, freelancerName: string, type: string) {
  sendSlackNotification(`\ud83d\udce8 Task ${projectId}: ${freelancerName} offered ${role} role (${type}).`);
}

function notifySlackAccepted(projectId: string, freelancerName: string, role: string) {
  sendSlackNotification(`\u2705 ${freelancerName} accepted ${role} for ${projectId}.`);
}

function notifySlackRejected(projectId: string, freelancerName: string, role: string) {
  sendSlackNotification(`\u274c ${freelancerName} declined ${role} for ${projectId}.`);
}

// ============================================
// TASK CACHE HELPER
// ============================================

function isEffectivelyCancelledTask(t: any): boolean {
  const trLower = (t.trDone || "").trim().toLowerCase();
  const revLower = (t.revComplete || "").trim().toLowerCase();
  const cancelledValues = ["cancelled", "canceled", "on hold", "onhold", "on-hold"];
  return cancelledValues.includes(trLower) || cancelledValues.includes(revLower);
}

// Shared task fetch function with 5-minute cache
export async function getAllTasksCached(): Promise<any[]> {
  const cached = getCached<any[]>("allTasks", 300000); // 5 min
  if (cached) return cached;

  const configs = await storage.getAllSheetConfigs();
  const allTasks: any[] = [];

  const fetchJobs = configs
    .filter(c => c.googleSheetId || c.sheetDbId)
    .map(cfg => () =>
      fetchSheetTasks(cfg.sheetDbId || "", cfg.sheet, cfg.sheet, cfg.source, cfg.googleSheetId)
        .then(rows => { allTasks.push(...rows); })
    );

  const gsAvail = await gsIsAvailable();
  const CONCURRENCY = gsAvail ? 18 : 6;
  for (let i = 0; i < fetchJobs.length; i += CONCURRENCY) {
    await Promise.all(fetchJobs.slice(i, i + CONCURRENCY).map(fn => fn()));
  }
  setCache("allTasks", allTasks);
  return allTasks;
}

// ============================================
// ROUTES
// ============================================

// ---- FREELANCER ROUTES ----

router.get("/freelancers", requireAuth, async (_req: Request, res: Response) => {
  try {
    const cachedFl = getCached<any[]>("freelancers", 300000);
    if (cachedFl) return res.json(cachedFl);

    const response = await fetch(BASE44_API, {
      headers: { "Content-Type": "application/json", "api_key": BASE44_KEY },
    });
    const data = await response.json();
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
        languagePairs: [...new Set((f.language_pairs || []).map((lp: any) => normalizeLangPair(`${lp.source_language}>${lp.target_language}`)).filter(Boolean))],
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
    console.error("Freelancer fetch error:", e);
    res.status(500).json({ error: "Failed to fetch freelancer data" });
  }
});

// ---- TASK ROUTES ----

router.get("/tasks", requireAuth, async (req: Request, res: Response) => {
  try {
    const allTasks = await getAllTasksCached();

    const pmEmail = await (async () => {
      const pmUserId = (req as any).pmUserId;
      if (!pmUserId) return null;
      const allUsers = await storage.getAllPmUsers();
      const user = allUsers.find(u => u.id === pmUserId);
      return user?.email || null;
    })();
    const configs = await storage.getAllSheetConfigs();
    const visibleSheets = new Set(
      configs.filter(c => {
        if (!c.assignedPms) return true;
        try { return (JSON.parse(c.assignedPms) as string[]).includes(pmEmail || ""); } catch { return true; }
      }).map(c => `${c.source}|${c.sheet}`)
    );
    const pmTasks = allTasks.filter((t: any) => visibleSheets.has(`${t.source}|${t.sheet}`));

    const includeDelivered = req.query.includeDelivered === "true";
    const filtered = includeDelivered ? pmTasks : pmTasks.filter((t: any) => t.delivered !== "Delivered");

    const allAssignments = await storage.getAllAssignments();
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
    console.error("Task fetch error:", e);
    res.status(500).json({ error: "Failed to fetch task data" });
  }
});

// ---- ASSIGNMENT ROUTES ----

router.get("/assignments", requireAuth, async (_req: Request, res: Response) => {
  const all = await storage.getAllAssignments();
  const enriched = await Promise.all(all.map(async a => ({
    ...a,
    taskDetails: JSON.parse(a.taskDetails || "{}"),
    sequenceList: a.sequenceList ? JSON.parse(a.sequenceList) : null,
    broadcastList: a.broadcastList ? JSON.parse(a.broadcastList) : null,
    offers: await storage.getOffersByAssignment(a.id),
  })));
  res.json(enriched);
});

router.get("/assignments/:id", requireAuth, async (req: Request, res: Response) => {
  const a = await storage.getAssignment(+param(req, "id"));
  if (!a) return res.status(404).json({ error: "Assignment not found" });
  res.json({
    ...a,
    taskDetails: JSON.parse(a.taskDetails || "{}"),
    sequenceList: a.sequenceList ? JSON.parse(a.sequenceList) : null,
    broadcastList: a.broadcastList ? JSON.parse(a.broadcastList) : null,
    offers: await storage.getOffersByAssignment(a.id),
  });
});

// Cancel assignment and withdraw all pending offers
router.post("/assignments/:id/cancel", requireAuth, async (req: Request, res: Response) => {
  const assignment = await storage.getAssignment(+param(req, "id"));
  if (!assignment) return res.status(404).json({ error: "Assignment not found" });
  if (assignment.status === "completed") {
    return res.status(400).json({ error: "Cannot cancel a completed assignment" });
  }

  const now = new Date().toISOString();
  await storage.updateAssignment(assignment.id, { status: "cancelled" });

  const offers = await storage.getOffersByAssignment(assignment.id);
  for (const offer of offers) {
    if (offer.status === "pending") {
      await storage.updateOffer(offer.id, { status: "withdrawn", respondedAt: now });
    }
  }

  res.json({ success: true, message: "Assignment cancelled and offers withdrawn." });
});

// Withdraw a specific offer
router.post("/offers/:id/withdraw", requireAuth, async (req: Request, res: Response) => {
  const offer = await storage.getOffer(+param(req, "id"));
  if (!offer) return res.status(404).json({ error: "Offer not found" });
  if (offer.status !== "pending") {
    return res.status(400).json({ error: "Only pending offers can be withdrawn" });
  }
  await storage.updateOffer(offer.id, { status: "withdrawn", respondedAt: new Date().toISOString() });
  res.json({ success: true, message: "Offer withdrawn." });
});

// ---- ASSIGN TO ME ----
router.post("/assignments/self-assign", requireAuth, async (req: Request, res: Response) => {
  const body = validate(selfAssignSchema, req.body, res);
  if (!body) return;
  const { source, sheet, projectId, account, taskDetails, role } = body;

  const pmUserId = (req as any).pmUserId;
  const user = (await storage.getAllPmUsers()).find(u => u.id === pmUserId);
  if (!user) return res.status(404).json({ error: "User not found" });

  const now = new Date().toISOString();
  const assignment = await storage.createAssignment({
    source, sheet: sheet || "", projectId, account: account || "",
    taskDetails: JSON.stringify(taskDetails || {}),
    assignmentType: "direct", role, status: "accepted",
    assignedBy: pmUserId,
    acceptedBy: user.initial || user.name, acceptedByName: user.name, acceptedByEmail: user.email,
    sequenceList: null, currentSequenceIndex: 0, sequenceTimeoutMinutes: 60,
    broadcastList: null, autoAssignReviewer: 0,
    reviewerAssignmentType: null, reviewerSequenceList: null,
    reviewType: body.reviewType || null,
    createdAt: now, offeredAt: now, acceptedAt: now,
  });

  const pmInitial = user.initial || user.name;
  safeWriteToSheet(assignment, pmInitial, role as "translator" | "reviewer");

  if (body.reviewType === "Self-Edit" && role === "reviewer") {
    safeWriteToSheet(assignment, pmInitial, "translator");
  }

  if (body.customDeadline && role === "translator") {
    safeWriteDeadlineToSheet(assignment, body.customDeadline);
  }

  invalidateCache("allTasks");

  res.json({ success: true, assignment });
});

// ---- DIRECT ASSIGN (CONFIRMED, no email) ----
router.post("/assignments/confirmed", requireAuth, async (req: Request, res: Response) => {
  const { source, sheet, projectId, account, taskDetails, role, freelancerCode, freelancerName, freelancerEmail } = req.body;
  if (!source || !projectId || !role || !freelancerCode) return res.status(400).json({ error: "Missing fields" });

  const now = new Date().toISOString();
  const assignment = await storage.createAssignment({
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

  const token = randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
  const clientBase = resolveBaseUrl(req);
  await storage.createOffer({
    assignmentId: assignment.id,
    freelancerCode,
    freelancerName: freelancerName || freelancerCode,
    freelancerEmail: freelancerEmail || "",
    token, status: "accepted", sentAt: now,
    respondedAt: now, sequenceOrder: null, clientBaseUrl: clientBase,
  });

  safeWriteToSheet(assignment, freelancerCode, role as "translator" | "reviewer");

  if (req.body.reviewType === "Self-Edit" && role === "reviewer") {
    safeWriteToSheet(assignment, freelancerCode, "translator");
  }

  if (req.body.customDeadline && role === "translator") {
    safeWriteDeadlineToSheet(assignment, req.body.customDeadline);
  }

  invalidateCache("allTasks");

  res.json({ success: true, assignment });
});

// Create assignment and send offers
router.post("/assignments", requireAuth, async (req: Request, res: Response) => {
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

  const assignment = await storage.createAssignment({
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
  if (customDeadline && role === "translator") {
    task.deadline = customDeadline;
  }

  if (assignmentType === "direct" || assignmentType === "broadcast") {
    for (const f of freelancers) {
      const offerToken = generateToken();
      const offer = await storage.createOffer({
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
        const email = await buildOfferEmailHtml(task, offer, assignment, emailSubject, emailBody);
        sendEmail([f.email], email.subject, email.html);
      } catch (e) {
        console.error(`Failed to send email to ${f.email}:`, e);
      }
    }
  } else if (assignmentType === "sequence") {
    const first = freelancers[0];
    if (first) {
      const offerToken = generateToken();
      const offer = await storage.createOffer({
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
        const email = await buildOfferEmailHtml(task, offer, assignment, emailSubject, emailBody);
        sendEmail([first.email], email.subject, email.html);
      } catch (e) {
        console.error(`Failed to send email to ${first.email}:`, e);
      }
    }
  }

  if (customDeadline && role === "translator") {
    safeWriteDeadlineToSheet(assignment, customDeadline);
  }

  const enriched = {
    ...assignment,
    taskDetails: JSON.parse(assignment.taskDetails || "{}"),
    offers: await storage.getOffersByAssignment(assignment.id),
  };
  res.json(enriched);
});

// ---- OFFER RESPONSE (PUBLIC - no auth needed) ----

// Get offer details for freelancer view
router.get("/offers/:token", offerLimiter, async (req: Request, res: Response) => {
  if (!/^[a-f0-9]{64}$/.test(param(req, "token"))) return res.status(404).json({ error: "Offer not found." });
  const offer = await storage.getOfferByToken(param(req, "token"));
  if (!offer) return res.status(404).json({ error: "Offer not found." });

  const assignment = await storage.getAssignment(offer.assignmentId);
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
router.post("/offers/:token/accept", offerLimiter, async (req: Request, res: Response) => {
  if (!/^[a-f0-9]{64}$/.test(param(req, "token"))) return res.status(404).json({ error: "Offer not found." });
  const offer = await storage.getOfferByToken(param(req, "token"));
  if (!offer) return res.status(404).json({ error: "Offer not found." });
  if (offer.status !== "pending") {
    return res.status(400).json({ error: "This offer is no longer valid.", currentStatus: offer.status });
  }

  const assignment = await storage.getAssignment(offer.assignmentId);
  if (!assignment) return res.status(404).json({ error: "Task not found." });
  if (assignment.status === "accepted" || assignment.status === "completed") {
    await storage.updateOffer(offer.id, { status: "withdrawn", respondedAt: new Date().toISOString() });
    return res.status(400).json({ error: "This task has already been accepted by another translator." });
  }

  const now = new Date().toISOString();

  await storage.updateOffer(offer.id, { status: "accepted", respondedAt: now });

  await storage.updateAssignment(assignment.id, {
    status: "accepted",
    acceptedBy: offer.freelancerCode,
    acceptedByName: offer.freelancerName,
    acceptedByEmail: offer.freelancerEmail,
    acceptedAt: now,
  });

  const allOffers = await storage.getOffersByAssignment(assignment.id);
  for (const o of allOffers) {
    if (o.id !== offer.id && o.status === "pending") {
      await storage.updateOffer(o.id, { status: "withdrawn", respondedAt: now });
    }
  }

  safeWriteToSheet(
    assignment,
    offer.freelancerCode,
    assignment.role as "translator" | "reviewer"
  );

  notifySlackAccepted(assignment.projectId, offer.freelancerName, assignment.role);

  await notify("offer_accepted", `${offer.freelancerName} accepted`,
    `${offer.freelancerName} accepted ${assignment.role} for ${assignment.projectId}`,
    { projectId: assignment.projectId, freelancerCode: offer.freelancerCode, role: assignment.role });
  wsBroadcast("offer_accepted", { assignmentId: assignment.id, freelancerName: offer.freelancerName, projectId: assignment.projectId });

  res.json({ success: true, message: "Task accepted. Thank you!" });
});

// Reject offer
router.post("/offers/:token/reject", offerLimiter, async (req: Request, res: Response) => {
  if (!/^[a-f0-9]{64}$/.test(param(req, "token"))) return res.status(404).json({ error: "Offer not found." });
  const offer = await storage.getOfferByToken(param(req, "token"));
  if (!offer) return res.status(404).json({ error: "Offer not found." });
  if (offer.status !== "pending") {
    return res.status(400).json({ error: "This offer is no longer valid.", currentStatus: offer.status });
  }

  const now = new Date().toISOString();
  await storage.updateOffer(offer.id, { status: "rejected", respondedAt: now });

  const assignment = await storage.getAssignment(offer.assignmentId);
  if (!assignment) return res.json({ success: true });

  if (assignment.assignmentType === "sequence") {
    const sequenceList = JSON.parse(assignment.sequenceList || "[]");
    const nextIndex = (assignment.currentSequenceIndex || 0) + 1;

    if (nextIndex < sequenceList.length) {
      await storage.updateAssignment(assignment.id, { currentSequenceIndex: nextIndex });

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

          const newOffer = await storage.createOffer({
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

          const email = await buildOfferEmailHtml(taskDetails, newOffer, assignment);
          sendEmail([nextFreelancer.email], email.subject, email.html);
        }
      } catch (e) {
        console.error("Sequence advance error:", e);
      }
    } else {
      await storage.updateAssignment(assignment.id, { status: "expired" });
    }
  }

  notifySlackRejected(assignment.projectId, offer.freelancerName, assignment.role);

  await notify("offer_rejected", `${offer.freelancerName} declined`,
    `${offer.freelancerName} declined ${assignment.role} for ${assignment.projectId}`,
    { projectId: assignment.projectId, freelancerCode: offer.freelancerCode, role: assignment.role });
  wsBroadcast("offer_rejected", { assignmentId: assignment.id, freelancerName: offer.freelancerName, projectId: assignment.projectId });

  res.json({ success: true, message: "Offer declined." });
});

// Mark task as completed by freelancer
router.post("/offers/:token/complete", offerLimiter, async (req: Request, res: Response) => {
  if (!/^[a-f0-9]{64}$/.test(param(req, "token"))) return res.status(404).json({ error: "Offer not found." });
  const offer = await storage.getOfferByToken(param(req, "token"));
  if (!offer) return res.status(404).json({ error: "Offer not found." });
  if (offer.status !== "accepted") {
    return res.status(400).json({ error: "Only accepted tasks can be completed." });
  }

  const assignment = await storage.getAssignment(offer.assignmentId);
  if (!assignment) return res.status(404).json({ error: "Task not found." });

  const now = new Date().toISOString();
  await storage.updateAssignment(assignment.id, { status: "completed", completedAt: now });

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
      if (qsScore && role === "reviewer") {
        await safeWriteQsToSheet(assignment, String(qsScore));
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

  await notify("task_completed", `Task completed`,
    `${offer.freelancerName} completed ${assignment.role} for ${assignment.projectId}`,
    { projectId: assignment.projectId, freelancerCode: offer.freelancerCode, role: assignment.role });
  wsBroadcast("task_completed", { assignmentId: assignment.id, projectId: assignment.projectId });

  res.json({ success: true, message: "Task marked as completed!" });
});

// ---- TASK NOTES (PM internal) ----
router.get("/task-notes", requireAuth, async (req: Request, res: Response) => {
  const notes = await db.select().from(taskNotes);
  res.json(notes);
});

router.post("/task-notes", requireAuth, async (req: Request, res: Response) => {
  const { source, sheet, projectId, note } = req.body;
  if (!source || !projectId) return res.status(400).json({ error: "Missing fields" });
  const user = (await storage.getAllPmUsers()).find(u => u.id === (req as any).pmUserId);
  if (!user) return res.status(404).json({ error: "User not found" });
  const now = new Date().toISOString();
  const [existing] = await db.select().from(taskNotes)
    .where(and(eq(taskNotes.source, source), eq(taskNotes.sheet, sheet || ""), eq(taskNotes.projectId, projectId), eq(taskNotes.pmEmail, user.email)));
  if (existing) {
    await db.update(taskNotes).set({ note, updatedAt: now }).where(eq(taskNotes.id, existing.id));
    res.json({ ...existing, note, updatedAt: now });
  } else {
    const [created] = await db.insert(taskNotes).values({ source, sheet: sheet || "", projectId, pmEmail: user.email, note, createdAt: now, updatedAt: now }).returning();
    res.json(created);
  }
});

// ---- PM FAVORITES ----
router.get("/favorites", requireAuth, async (req: Request, res: Response) => {
  const user = (await storage.getAllPmUsers()).find(u => u.id === (req as any).pmUserId);
  if (!user) return res.status(404).json({ error: "User not found" });
  const favs = await db.select().from(pmFavorites).where(eq(pmFavorites.pmEmail, user.email));
  res.json(favs.map(f => f.freelancerCode));
});

router.post("/favorites", requireAuth, async (req: Request, res: Response) => {
  const { freelancerCode } = req.body;
  if (!freelancerCode) return res.status(400).json({ error: "Missing freelancerCode" });
  const user = (await storage.getAllPmUsers()).find(u => u.id === (req as any).pmUserId);
  if (!user) return res.status(404).json({ error: "User not found" });
  const [existing] = await db.select().from(pmFavorites)
    .where(and(eq(pmFavorites.pmEmail, user.email), eq(pmFavorites.freelancerCode, freelancerCode)));
  if (existing) {
    await db.delete(pmFavorites).where(eq(pmFavorites.id, existing.id));
    res.json({ favorited: false });
  } else {
    await db.insert(pmFavorites).values({ pmEmail: user.email, freelancerCode, createdAt: new Date().toISOString() });
    res.json({ favorited: true });
  }
});

// ---- BATCH DEADLINE UPDATE ----
router.post("/tasks/batch-deadline", requireAuth, async (req: Request, res: Response) => {
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

// ---- UNDO ASSIGNMENT (cancel within 15s) ----
router.post("/assignments/:id/undo", requireAuth, async (req: Request, res: Response) => {
  const assignment = await storage.getAssignment(+param(req, "id"));
  if (!assignment) return res.status(404).json({ error: "Assignment not found" });
  const createdTime = new Date(assignment.createdAt).getTime();
  const elapsed = Date.now() - createdTime;
  if (elapsed > 15000) {
    return res.status(400).json({ error: "Undo window expired (15 seconds)" });
  }
  const offers = await storage.getOffersByAssignment(assignment.id);
  const now = new Date().toISOString();
  for (const offer of offers) {
    if (offer.status === "pending") {
      await storage.updateOffer(offer.id, { status: "withdrawn", respondedAt: now });
    }
  }
  await storage.updateAssignment(assignment.id, { status: "cancelled" });
  res.json({ success: true, message: "Assignment undone." });
});

// ---- XLSX EXPORT ----
router.post("/export/xlsx", requireAuth, async (req: Request, res: Response) => {
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

// ---- ELTS AVAILABILITY WRITE (PM edit -> ELTS) ----
router.post("/elts/availability", requireAuth, async (req: Request, res: Response) => {
  try {
    const { freelancerCode, date, status, hours, notes } = req.body;
    if (!freelancerCode || !date || !status) return res.status(400).json({ error: "Missing fields" });

    const flRes = await fetch(BASE44_API, {
      headers: { "Content-Type": "application/json", "api_key": BASE44_KEY },
    });
    const freelancers = await flRes.json();
    const fl = (Array.isArray(freelancers) ? freelancers : []).find((f: any) => f.resource_code === freelancerCode);
    if (!fl) return res.status(404).json({ error: `Freelancer ${freelancerCode} not found in ELTS` });

    const availUrl = BASE44_API.replace("/entities/Freelancer", "/entities/Availability");

    const existingRes = await fetch(availUrl, {
      headers: { "Content-Type": "application/json", "api_key": BASE44_KEY },
    });
    const allAvail = await existingRes.json();
    const existing = (Array.isArray(allAvail) ? allAvail : []).find(
      (a: any) => a.freelancer_id === fl.id && a.date === date
    );

    if (existing) {
      await fetch(`${availUrl}/${existing.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "api_key": BASE44_KEY },
        body: JSON.stringify({ status, hours_available: hours || 0, notes: notes || "" }),
      });
      invalidateCache("eltsAvailability");
      res.json({ success: true, action: "updated", id: existing.id });
    } else {
      const createRes = await fetch(availUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "api_key": BASE44_KEY },
        body: JSON.stringify({ freelancer_id: fl.id, date, status, hours_available: hours || 0, notes: notes || "" }),
      });
      const created = await createRes.json();
      invalidateCache("eltsAvailability");
      res.json({ success: true, action: "created", id: created.id });
    }
  } catch (e: any) {
    res.status(500).json({ error: safeError("Internal server error", e) });
  }
});

router.delete("/elts/availability/:freelancerCode/:date", requireAuth, async (req: Request, res: Response) => {
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
    res.status(500).json({ error: safeError("Internal server error", e) });
  }
});

// ---- ADMIN: SHEET CONFIG ----

router.get("/sheet-configs", requireAuth, async (_req: Request, res: Response) => {
  res.json(await storage.getAllSheetConfigs());
});

router.post("/sheet-configs", requireAuth, async (req: Request, res: Response) => {
  const { source, sheet, languagePair, sheetDbId, googleSheetUrl, assignedPms } = req.body;
  if (!source || !sheet || !languagePair) return res.status(400).json({ error: "Missing fields" });
  const config = await storage.upsertSheetConfig(source, sheet, languagePair, sheetDbId || undefined, googleSheetUrl || undefined, assignedPms || undefined);
  res.json(config);
});

router.delete("/sheet-configs/:id", requireAuth, async (req: Request, res: Response) => {
  await storage.deleteSheetConfig(+param(req, "id"));
  res.json({ success: true });
});

// ---- ADMIN: EMAIL TEMPLATES ----

router.get("/email-templates", requireAuth, async (_req: Request, res: Response) => {
  res.json(await storage.getAllEmailTemplates());
});

router.post("/email-templates", requireAuth, async (req: Request, res: Response) => {
  const { key, subject, body } = req.body;
  if (!key || !subject || !body) return res.status(400).json({ error: "Missing fields" });
  const template = await storage.upsertEmailTemplate(key, subject, body);
  res.json(template);
});

// ---- SEQUENCE PRESETS ----

router.get("/presets", requireAuth, async (req: Request, res: Response) => {
  const allUsers = await storage.getAllPmUsers();
  const user = allUsers.find(u => u.id === (req as any).pmUserId);
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json(await storage.getPresetsByPm(user.email));
});

router.post("/presets", requireAuth, async (req: Request, res: Response) => {
  const { name, role, freelancerCodes, assignmentType } = req.body;
  if (!name || !role || !freelancerCodes) return res.status(400).json({ error: "Missing fields" });
  const allUsers = await storage.getAllPmUsers();
  const user = allUsers.find(u => u.id === (req as any).pmUserId);
  if (!user) return res.status(404).json({ error: "User not found" });
  const preset = await storage.createPreset({
    name,
    pmEmail: user.email,
    role,
    freelancerCodes: typeof freelancerCodes === "string" ? freelancerCodes : JSON.stringify(freelancerCodes),
    assignmentType: assignmentType || "sequence",
  });
  res.json(preset);
});

router.delete("/presets/:id", requireAuth, async (req: Request, res: Response) => {
  await storage.deletePreset(+param(req, "id"));
  res.json({ success: true });
});

// ---- PROJECT COMPLETE (PM action) ----

router.post("/tasks/complete", requireAuth, async (req: Request, res: Response) => {
  const { source, sheet, projectId, revCompleteValue } = req.body;
  if (!source || !projectId) return res.status(400).json({ error: "Missing fields" });
  const valueToWrite = revCompleteValue || "Yes";

  const all = await storage.getAllAssignments();
  const assignment = all.find(a =>
    a.source === source && a.projectId === projectId &&
    a.status !== "cancelled" && a.status !== "expired"
  );
  if (assignment) {
    await storage.updateAssignment(assignment.id, {
      status: "completed",
      completedAt: new Date().toISOString(),
    });
  }

  try {
    const configs = await storage.getAllSheetConfigs();
    const config = configs.find(c => c.source === source && c.sheet === (sheet || ""));
    if (config && config.googleSheetId) {
      const gsConfig: SheetWriteConfig = {
        googleSheetId: config.googleSheetId,
        tabName: sheet || config.sheet,
        projectId,
      };
      const result = await gsWriteToColumn(gsConfig, REV_COMPLETE_CANDIDATES, valueToWrite, { skipSafetyCheck: true });
      console.log(`Mark complete [${source}/${sheet}/${projectId}]: ${result.message}`);
    } else {
      console.error(`Mark complete SKIPPED [${source}/${sheet}/${projectId}]: No Google Sheet config`);
    }
  } catch (e) {
    console.error(`Mark complete sheet write error (non-fatal):`, e);
  }

  res.json({ success: true, revCompleteValue: valueToWrite });
});

// ---- ELTS QUALITY SCORES (account-based from QualityReport entity) ----
router.get("/elts/quality", requireAuth, async (_req: Request, res: Response) => {
  try {
    const cachedQ = getCached<any>("eltsQuality", 300000);
    if (cachedQ) return res.json(cachedQ);
    const qrRes = await fetch(
      BASE44_API.replace("/entities/Freelancer", "/entities/QualityReport"),
      { headers: { "Content-Type": "application/json", "api_key": BASE44_KEY } }
    );
    const reports = await qrRes.json();
    if (!Array.isArray(reports)) return res.json({});

    const flRes = await fetch(BASE44_API, {
      headers: { "Content-Type": "application/json", "api_key": BASE44_KEY },
    });
    const freelancers = await flRes.json();
    const idToCode: Record<string, string> = {};
    if (Array.isArray(freelancers)) {
      for (const f of freelancers) idToCode[f.id] = f.resource_code || "";
    }

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
router.get("/elts/availability", requireAuth, async (_req: Request, res: Response) => {
  try {
    const cachedAv = getCached<any>("eltsAvailability", 180000);
    if (cachedAv) return res.json(cachedAv);
    const avRes = await fetch(
      BASE44_API.replace("/entities/Freelancer", "/entities/Availability"),
      { headers: { "Content-Type": "application/json", "api_key": BASE44_KEY } }
    );
    const records = await avRes.json();
    if (!Array.isArray(records)) return res.json({});

    const flRes = await fetch(BASE44_API, {
      headers: { "Content-Type": "application/json", "api_key": BASE44_KEY },
    });
    const freelancers = await flRes.json();
    const idToCode: Record<string, string> = {};
    if (Array.isArray(freelancers)) {
      for (const f of freelancers) idToCode[f.id] = f.resource_code || "";
    }

    const today = new Date().toISOString().slice(0, 10);
    const result: Record<string, any[]> = {};
    for (const r of records) {
      const code = idToCode[r.freelancer_id];
      if (!code) continue;
      if (r.date < today) continue;
      if (!result[code]) result[code] = [];
      result[code].push({
        date: r.date,
        status: r.status,
        hours: r.hours_available || 0,
        notes: r.notes || "",
      });
    }
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

router.get("/freelancer-stats", requireAuth, async (_req: Request, res: Response) => {
  try {
    const allTasks = await getAllTasksCached();

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

router.get("/pm-users", requireAuth, async (_req: Request, res: Response) => {
  res.json((await storage.getAllPmUsers()).map(u => ({ ...u, password: undefined })));
});

router.post("/pm-users", requireAuth, async (req: Request, res: Response) => {
  const { email, name, initial, password, role } = req.body;
  if (!email || !name || !password) return res.status(400).json({ error: "Email, name, and password required" });
  if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters" });
  const existing = await storage.getPmUserByEmail(email.toLowerCase().trim());
  if (existing) return res.status(400).json({ error: "This email is already registered." });
  const hashedPassword = await bcrypt.hash(password, 10);
  const user = await storage.createPmUser({ email: email.toLowerCase().trim(), name, initial: initial || "", password: hashedPassword, role: role || "pm" });
  res.json(user);
});

router.put("/pm-users/:id", requireAuth, async (req: Request, res: Response) => {
  const { name, initial, role, password } = req.body;
  const id = +param(req, "id");
  const user = (await storage.getAllPmUsers()).find(u => u.id === id);
  if (!user) return res.status(404).json({ error: "User not found" });
  const updates: any = {};
  if (name) updates.name = name;
  if (initial !== undefined) updates.initial = initial;
  if (role) updates.role = role;
  if (password && password.length >= 8) {
    updates.password = await bcrypt.hash(password, 10);
  }
  if (Object.keys(updates).length > 0) {
    await storage.updatePmUser(id, updates);
  }
  res.json({ success: true });
});

router.post("/pm-users/preferences", requireAuth, async (req: Request, res: Response) => {
  const { defaultFilter, defaultMyProjects, defaultSource, defaultAccount } = req.body;
  const user = (await storage.getAllPmUsers()).find(u => u.id === (req as any).pmUserId);
  if (!user) return res.status(404).json({ error: "User not found" });
  const updates: any = {};
  if (defaultFilter !== undefined) updates.defaultFilter = defaultFilter;
  if (defaultMyProjects !== undefined) updates.defaultMyProjects = defaultMyProjects ? 1 : 0;
  if (defaultSource !== undefined) updates.defaultSource = defaultSource;
  if (defaultAccount !== undefined) updates.defaultAccount = defaultAccount;
  if (Object.keys(updates).length > 0) {
    await storage.updatePmUser(user.id, updates);
  }
  res.json({ success: true });
});

// ---- UNASSIGN (clear TR or REV from sheet + cancel assignment if exists) ----
router.post("/tasks/unassign", requireAuth, async (req: Request, res: Response) => {
  const { source, sheet, projectId, role } = req.body;
  if (!source || !projectId || !role) return res.status(400).json({ error: "Missing fields" });

  try {
    const candidates = role === "translator" ? TR_CANDIDATES : REV_CANDIDATES;
    const gsConfig = await getSheetWriteConfig({ source, sheet: sheet || "" });
    if (gsConfig) {
      gsConfig.projectId = projectId;
      const result = await gsWriteToColumn(gsConfig, candidates, "XX", { skipSafetyCheck: true });
      console.log(`Unassign [${source}/${sheet}]: ${result.message}`);
    } else {
      console.error(`Unassign SKIPPED [${source}/${sheet}]: No Google Sheet config.`);
    }

    const allAssignments = await storage.getAllAssignments();
    const matching = allAssignments.filter(a =>
      a.source === source && a.projectId === projectId &&
      a.role === role &&
      a.status !== "cancelled" && a.status !== "completed"
    );
    for (const a of matching) {
      await storage.updateAssignment(a.id, { status: "cancelled" });
      const offers = await storage.getOffersByAssignment(a.id);
      for (const o of offers) {
        if (o.status === "pending") {
          await storage.updateOffer(o.id, { status: "withdrawn", respondedAt: new Date().toISOString() });
        }
      }
    }

    setCache("allTasks", null as any);

    res.json({ success: true, message: `${role} unassigned from ${projectId}` });
  } catch (e: any) {
    console.error("Unassign error:", e);
    res.status(500).json({ error: "Unassign failed" });
  }
});

// ---- BULK COMPLETE ----
router.post("/tasks/bulk-complete", requireAuth, async (req: Request, res: Response) => {
  const { tasks: taskList, revCompleteValue, distributeTime } = req.body;
  if (!taskList || !Array.isArray(taskList) || taskList.length === 0) {
    return res.status(400).json({ error: "No tasks provided" });
  }

  let perTaskValue = revCompleteValue || "Yes";
  if (distributeTime && typeof revCompleteValue === "number" && taskList.length > 0) {
    perTaskValue = Math.round(revCompleteValue / taskList.length).toString();
  }

  const now = new Date().toISOString();
  const allAssignments = await storage.getAllAssignments();

  for (const t of taskList) {
    const assignment = allAssignments.find((a: any) =>
      a.source === t.source && a.projectId === t.projectId &&
      a.status !== "cancelled" && a.status !== "expired"
    );
    if (assignment) {
      await storage.updateAssignment(assignment.id, { status: "completed", completedAt: now });
    }
  }

  res.json({ success: true, count: taskList.length, valuePerTask: perTaskValue });
});

// ---- AUTO-ASSIGN RULES ----
router.get("/auto-assign-rules", requireAuth, async (_req: Request, res: Response) => {
  res.json(await storage.getAllAutoAssignRules());
});

router.post("/auto-assign-rules", requireAuth, async (req: Request, res: Response) => {
  const { name, source, account, languagePair, role, freelancerCodes, assignmentType } = req.body;
  if (!name || !role || !freelancerCodes) return res.status(400).json({ error: "Missing fields" });
  const user = (await storage.getAllPmUsers()).find(u => u.id === (req as any).pmUserId);
  const rule = await storage.createAutoAssignRule({
    name, source: source || null, account: account || null,
    languagePair: languagePair || null, role,
    freelancerCodes: typeof freelancerCodes === "string" ? freelancerCodes : JSON.stringify(freelancerCodes),
    assignmentType: assignmentType || "sequence",
    enabled: 1, createdBy: user?.email || "",
  });
  res.json(rule);
});

router.put("/auto-assign-rules/:id", requireAuth, async (req: Request, res: Response) => {
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
  await storage.updateAutoAssignRule(+param(req, "id"), updates);
  res.json({ success: true });
});

router.delete("/auto-assign-rules/:id", requireAuth, async (req: Request, res: Response) => {
  await storage.deleteAutoAssignRule(+param(req, "id"));
  res.json({ success: true });
});

// ---- AUTO-DISPATCH ENGINE ----
router.post("/auto-dispatch", requireAuth, async (req: Request, res: Response) => {
  if (!acquireLock("auto-dispatch")) {
    return res.status(409).json({ error: "Auto-dispatch is already running. Please wait." });
  }
  try {
    const rules = (await storage.getAllAutoAssignRules()).filter(r => r.enabled);
    if (rules.length === 0) { releaseLock("auto-dispatch"); return res.json({ dispatched: 0, message: "No enabled rules" }); }

    const allAssignments = await storage.getAllAssignments();
    const assignedKeys = new Set(
      allAssignments.filter(a => a.status !== "cancelled" && a.status !== "expired")
        .map(a => `${a.source}|${a.sheet}|${a.projectId}|${a.role}`)
    );

    const allConfigs = await storage.getAllSheetConfigs();
    let dispatched = 0;
    const results: any[] = [];

    for (const rule of rules) {
      const freelancerCodes = JSON.parse(rule.freelancerCodes || "[]") as string[];
      if (freelancerCodes.length === 0) continue;

      results.push({ rule: rule.name, freelancers: freelancerCodes.length, status: "ready" });
    }

    if (dispatched > 0) {
      sendSlackNotification(`\u26a1 Auto-dispatch: ${dispatched} tasks assigned automatically.`);
    }

    res.json({ dispatched, rules: results });
  } catch (e: any) {
    res.status(500).json({ error: safeError("Internal server error", e) });
  } finally {
    releaseLock("auto-dispatch");
  }
});

// ---- SEQUENCE TIMEOUT / AUTO-WITHDRAW ----
router.post("/sequence-advance", requireAuth, async (req: Request, res: Response) => {
  if (!acquireLock("sequence-advance")) {
    return res.status(409).json({ error: "Sequence advance is already running. Please wait." });
  }
  try {
    const assignments = (await storage.getAllAssignments()).filter(a =>
      a.status === "offered" && a.assignmentType === "sequence"
    );
    let advanced = 0;
    const now = Date.now();

    for (const assignment of assignments) {
      const offers = await storage.getOffersByAssignment(assignment.id);
      const pendingOffer = offers.find(o => o.status === "pending");
      if (!pendingOffer || !pendingOffer.sentAt) continue;

      const sentTime = new Date(pendingOffer.sentAt).getTime();
      const timeoutMs = (assignment.sequenceTimeoutMinutes || 60) * 60 * 1000;

      if (now - sentTime > timeoutMs) {
        await storage.updateOffer(pendingOffer.id, { status: "expired", respondedAt: new Date().toISOString() });

        const seqList = JSON.parse(assignment.sequenceList || "[]") as string[];
        const nextIdx = (assignment.currentSequenceIndex || 0) + 1;

        if (nextIdx < seqList.length) {
          const nextCode = seqList[nextIdx];
          const nextOffer = offers.find(o => o.freelancerCode === nextCode);

          if (nextOffer) {
            await storage.updateOffer(nextOffer.id, { status: "pending", sentAt: new Date().toISOString() });
            await storage.updateAssignment(assignment.id, { currentSequenceIndex: nextIdx });

            const taskDetails = JSON.parse(assignment.taskDetails || "{}");
            const email = await buildOfferEmailHtml(taskDetails, nextOffer, assignment);
            try {
              await sendEmail([nextOffer.freelancerEmail], email.subject, email.html);
              sendSlackNotification(`\u23f0 Sequence timeout: ${pendingOffer.freelancerName} didn't respond. Offered to ${nextOffer.freelancerName} for ${assignment.projectId}.`);
            } catch (e) {
              console.error("Failed to send sequence advance email:", e);
            }
            advanced++;
          }
        } else {
          await storage.updateAssignment(assignment.id, { status: "expired" });
          sendSlackNotification(`\u274c Sequence exhausted for ${assignment.projectId} (${assignment.role}). No freelancer accepted.`);
        }
      }
    }

    res.json({ advanced, checked: assignments.length });
  } catch (e: any) {
    res.status(500).json({ error: safeError("Internal server error", e) });
  } finally {
    releaseLock("sequence-advance");
  }
});

// ---- FREELANCER STATS (for predictive deadline) ----
router.get("/freelancer-delivery-stats", requireAuth, async (_req: Request, res: Response) => {
  const allAssignments = await storage.getAllAssignments();
  const stats: Record<string, { avgHoursToComplete: number; taskCount: number; avgWwcPerHour: number }> = {};

  for (const a of allAssignments) {
    if (a.status !== "completed" || !a.acceptedAt || !a.completedAt || !a.acceptedBy) continue;
    const acceptedTime = new Date(a.acceptedAt).getTime();
    const completedTime = new Date(a.completedAt).getTime();
    const hours = (completedTime - acceptedTime) / 3600000;
    if (hours <= 0 || hours > 720) continue;

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

export default router;

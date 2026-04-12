import type { Express, Request, Response, NextFunction } from "express";
import type { Server } from "http";
import { storage, db } from "./storage";
import { taskNotes, pmFavorites, customerRateCards, projects, qualityReports, jobs, vendors,
  autoAcceptRules as autoAcceptRulesTable, autoAcceptLog as autoAcceptLogTable,
  portalCredentials as portalCredentialsTable, portalTasks as portalTasksTable,
  vendorRateCards, vendorFiles, clientInvoices, clientInvoiceLines, poLineItems, purchaseOrders, payments, entities, customers, auditLog, users,
  notificationsV2, pmUsers, customerSubAccounts, pmCustomerAssignments, customerContacts,
} from "@shared/schema";
import { validateProjectTransition, validateJobTransition, getValidProjectActions, getValidJobActions } from "@shared/state-machines";
import { wsBroadcast } from "./ws";
import { gsWriteToColumn, gsIsAvailable, gsReadSheet, type SheetWriteConfig } from "./gsheets";
import { createToken, verifyToken } from "./jwt";
import { eq, and, sql, asc, desc, count } from "drizzle-orm";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import multer from "multer";
import { evaluateTask, processTask, getConditionFieldConfig } from "./auto-accept-engine";
import { testConnection as apsTestConnection, fetchOpenTasks as apsFetchOpenTasks, mapToAutoAcceptFormat as apsMapToAutoAcceptFormat } from "./integrations/aps-client";

// ============================================
// ZOD VALIDATION SCHEMAS
// ============================================
const loginSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(1).max(200),
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

// ---- Dispatch 2.0 Zod Schemas ----
const createVendorSchema = z.object({
  fullName: z.string().min(1).max(200),
  email: z.string().email().max(255),
  resourceCode: z.string().max(50).optional(),
  phone: z.string().max(50).optional(),
  status: z.string().max(50).optional(),
  resourceType: z.string().max(50).optional(),
  nativeLanguage: z.string().max(50).optional(),
  currency: z.string().max(3).optional(),
}).passthrough(); // Allow additional vendor fields

const createCustomerSchema = z.object({
  name: z.string().min(1).max(200),
  code: z.string().max(50).optional(),
  email: z.string().email().max(255).optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  currency: z.string().max(3).optional(),
  status: z.string().max(50).optional(),
  clientType: z.string().max(50).optional(),
}).passthrough();

const createProjectSchema = z.object({
  projectName: z.string().min(1).max(500),
  customerId: z.number().int().positive(),
  source: z.string().max(100).optional(),
  status: z.string().max(50).optional(),
  currency: z.string().max(3).optional(),
}).passthrough();

const createInvoiceSchema = z.object({
  customerId: z.number().int().positive(),
  invoiceDate: z.string().min(1),
  lines: z.array(z.object({
    description: z.string().optional(),
    quantity: z.any().optional(),
    unitPrice: z.any().optional(),
    amount: z.any().optional(),
  })).optional(),
}).passthrough();

const createPurchaseOrderSchema = z.object({
  vendorId: z.number().int().positive(),
  amount: z.any(),
}).passthrough();

const createQualityReportSchema = z.object({
  vendorId: z.number().int().positive(),
  reportType: z.enum(["LQA", "QS", "Random_QA"]),
}).passthrough();

const createUserSchema = z.object({
  email: z.string().email().max(255),
  name: z.string().min(1).max(200),
  role: z.string().min(1).max(50),
  password: z.string().min(8).max(200).optional(),
  initial: z.string().max(10).optional().nullable(),
  entityId: z.number().int().positive().optional().nullable(),
});

const createVendorNoteSchema = z.object({
  content: z.string().min(1).max(10000),
  noteType: z.enum(["info", "warning", "note"]).optional(),
  visibility: z.enum(["team", "private"]).optional(),
});

const createCustomerContactSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().max(255).optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  role: z.string().max(100).optional().nullable(),
  isPrimary: z.boolean().optional(),
});

const createSubAccountSchema = z.object({
  name: z.string().min(1).max(200),
  code: z.string().max(100).optional().nullable(),
  assignedPmId: z.number().int().positive().optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
});

const createJobSchema = z.object({
  jobName: z.string().max(500).optional(),
  sourceLanguage: z.string().max(10).optional(),
  targetLanguage: z.string().max(10).optional(),
  serviceType: z.string().max(100).optional(),
  unitType: z.string().max(50).optional(),
}).passthrough();

const createRateCardSchema = z.object({
  rateValue: z.any(),
  sourceLanguage: z.string().max(10).optional().nullable(),
  targetLanguage: z.string().max(10).optional().nullable(),
  serviceType: z.string().max(100).optional().nullable(),
  rateType: z.string().max(50).optional().nullable(),
  currency: z.string().max(3).optional(),
});

const createPaymentSchema = z.object({
  type: z.enum(["receivable", "payable"]),
  amount: z.any(),
  paymentDate: z.string().min(1),
}).passthrough();
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

// Validation helper — returns parsed data or sends 400
function validate<T>(schema: z.ZodType<T>, data: unknown, res: Response): T | null {
  const result = schema.safeParse(data);
  if (!result.success) {
    res.status(400).json({ error: "Validation error", details: result.error.issues.map(i => i.message).join(", ") });
    return null;
  }
  return result.data;
}

// Mask sensitive credential fields for API responses
function maskCredentials(creds: Record<string, any>): Record<string, any> {
  const masked = { ...creds };
  for (const key of Object.keys(masked)) {
    const lower = key.toLowerCase();
    if (lower.includes("token") || lower.includes("secret") || lower.includes("password") || lower.includes("apikey")) {
      if (typeof masked[key] === "string" && masked[key].length > 0) {
        masked[key] = masked[key].slice(0, 4) + "****";
      }
    }
  }
  return masked;
}

// Safe error message — never leak internal DB details to the client
function safeError(fallback: string, e: any): string {
  // In production, always return a generic message
  if (process.env.NODE_ENV === "production") return fallback;
  // In dev, return the actual error for debugging
  return e?.message || fallback;
}

// ============================================
// AUDIT LOGGING HELPER
// ============================================
async function logAudit(
  userId: number | null,
  action: string,
  entityType: string,
  entityId: number | null,
  oldData: any,
  newData: any,
  ipAddress: string | null,
): Promise<void> {
  try {
    await storage.createAuditEntry({
      userId,
      action,
      entityType,
      entityId,
      oldData: oldData ? JSON.parse(JSON.stringify(oldData)) : null,
      newData: newData ? JSON.parse(JSON.stringify(newData)) : null,
      ipAddress,
    });
  } catch (e) {
    // Never let audit logging failures break the main operation
    console.error("Audit log error:", e);
  }
}

function getClientIp(req: Request): string {
  return (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || "unknown";
}

// ============================================
// MUTEX — prevents concurrent dispatch/sequence-advance on same task
// ============================================
const activeLocks = new Set<string>();
function acquireLock(key: string): boolean {
  if (activeLocks.has(key)) return false;
  activeLocks.add(key);
  return true;
}
function releaseLock(key: string) {
  activeLocks.delete(key);
}

// Helper to safely extract string param (Express types req.params values as string | string[])
function param(req: Request, name: string): string {
  const v = req.params[name];
  return Array.isArray(v) ? v[0] : v;
}

// ============================================
// CONFIG
// ============================================
const BASE44_API = process.env.BASE44_API || "https://elts.base44.app/api/apps/694868412332f081649b2833/entities/Freelancer";
const BASE44_KEY = process.env.BASE44_KEY || "";
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
// EMAIL — Resend API
// ============================================

async function sendEmail(to: string[], subject: string, html: string) {
  if (!RESEND_API_KEY) {
    console.error("Email send failed: RESEND_API_KEY not configured");
    throw new Error("Email service not configured. Set RESEND_API_KEY.");
  }
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

// ============================================
// HELPERS
// ============================================

// Normalize language pair to standard 2-letter ISO format: "EN>TR"
// Handles: "English>Arabic" → "EN>AR", "EN>AR-SA" → "EN>AR", "EN>AR-INCL. CODING" → "EN>AR"
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

function normalizeLangPair(pair: string): string {
  if (!pair) return "";
  // If pair contains ">", split on it
  const gtIdx = pair.indexOf(">");
  if (gtIdx === -1) return pair;
  let srcRaw = pair.slice(0, gtIdx).trim();
  let tgtRaw = pair.slice(gtIdx + 1).trim();
  
  function normLang(code: string): string {
    const c = code.trim();
    if (!c || c.toLowerCase() === "null") return "";
    // Full language name → ISO code
    const lower = c.toLowerCase();
    if (LANG_NAME_MAP[lower]) return LANG_NAME_MAP[lower];
    // Multi-word: try last word ("Brazilian Portuguese" → "Portuguese")
    const words = lower.split(/\s+/);
    for (const w of words) {
      if (LANG_NAME_MAP[w]) return LANG_NAME_MAP[w];
    }
    // Strip dialect/variant suffixes: "AR-SA" → "AR", "AR-INCL. CODING" → "AR"
    const base = c.split("-")[0].split(" ")[0].toUpperCase();
    // Skip non-language codes (DTP, General Support, etc.)
    if (base.length > 4 || base.length < 2) return "";
    return base;
  }
  
  // Handle prefix patterns like "Amazon SeCM EN" → extract just the lang code
  // If source has spaces and ends with a 2-3 letter code, use that code
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

// Auth middleware — supports JWT tokens (survive deploys) and legacy DB sessions
async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "No token provided" });

  // 1. Try JWT verification first (stateless, survives deploys)
  const jwtPayload = verifyToken(token);
  if (jwtPayload) {
    (req as any).pmUserId = jwtPayload.pmUserId;
    return next();
  }

  // 2. Fallback: legacy DB session (for tokens issued before JWT migration)
  const session = await storage.getSession(token);
  if (!session) return res.status(401).json({ error: "Invalid session" });
  if (new Date(session.expiresAt) < new Date()) {
    await storage.deleteSession(token);
    return res.status(401).json({ error: "Session expired" });
  }
  (req as any).pmUserId = session.pmUserId;
  next();
}

// ============================================
// TASK FETCHING — Google Sheets API (primary) with SheetDB fallback
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
      languagePair: normalizeLangPair(extractLanguagePair(row, sheetLabel, source)),
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
// Parse deadline string — supports DD.MM.YYYY HH:mm, DD/MM/YYYY, DD-MM-YYYY, ISO
function parseDeadline(d: string): Date | null {
  if (!d) return null;
  // Try DD.MM.YYYY HH:mm or DD/MM/YYYY HH:mm (European with time)
  const m1 = d.match(/(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})\s+(\d{1,2}):(\d{2})/);
  if (m1) return new Date(+m1[3], +m1[2] - 1, +m1[1], +m1[4], +m1[5]);
  // Try DD.MM.YYYY or DD/MM/YYYY or DD-MM-YYYY (date only)
  const m2 = d.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/);
  if (m2) return new Date(+m2[3], +m2[2] - 1, +m2[1]);
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

async function buildOfferEmailHtml(task: any, offer: any, assignment: any, customSubject?: string, customBody?: string): Promise<{ subject: string; html: string }> {
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
    const tpl = await storage.getEmailTemplate(templateKey);
    subject = tpl ? replaceVars(tpl.subject, vars) : `${role} Task — ${task.account} — ${task.projectId}`;
  }

  // Resolve body content
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
async function notify(type: string, title: string, message: string, metadata?: any) {
  try {
    const n = await storage.createNotification({
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

// Recalculate vendor quality scores after a report is created/finalized
async function recalculateVendorQualityScores(vendorId: number) {
  try {
    const reports = await db.select().from(qualityReports).where(eq(qualityReports.vendorId, vendorId));
    const qsReports = reports.filter(r => r.reportType === "QS" && r.qsScore != null);
    const lqaReports = reports.filter(r => r.reportType === "LQA" && r.lqaScore != null);

    const avgQs = qsReports.length > 0
      ? qsReports.reduce((sum, r) => sum + Number(r.qsScore), 0) / qsReports.length
      : null;
    const avgLqa = lqaReports.length > 0
      ? lqaReports.reduce((sum, r) => sum + Number(r.lqaScore), 0) / lqaReports.length
      : null;

    // Combined score: if both exist, weighted average; otherwise use what's available
    let combined: number | null = null;
    if (avgQs != null && avgLqa != null) {
      // QS is 1-5 scale, LQA is 0-100; normalize LQA to 5-point scale
      const lqaNormalized = avgLqa / 20;
      combined = (avgQs + lqaNormalized) / 2;
    } else if (avgQs != null) {
      combined = avgQs;
    } else if (avgLqa != null) {
      combined = avgLqa / 20;
    }

    await db.update(vendors).set({
      averageQsScore: avgQs != null ? String(avgQs) : null,
      averageLqaScore: avgLqa != null ? String(avgLqa) : null,
      combinedQualityScore: combined != null ? String(combined) : null,
      totalReviewsCount: reports.length,
      updatedAt: new Date(),
    }).where(eq(vendors.id, vendorId));
  } catch (e) {
    console.error("Quality score recalculation error (non-fatal):", e);
  }
}

export async function registerRoutes(server: Server, app: Express) {

  // Initialize storage (seed data, run migrations)
  await storage.init();


  // ---- HEALTH CHECK ----
  app.get("/api/health", (_req: Request, res: Response) => {
    // Respond immediately — don't block on async GSheets init during startup
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

  const magicLinkLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 magic link requests per 15 min per IP
    message: { error: "Too many magic link requests. Please try again later." },
    standardHeaders: true,
    legacyHeaders: false,
  });

  // ---- AUTH ROUTES ----

  // Email + password login
  app.post("/api/auth/login", loginLimiter, async (req: Request, res: Response) => {
    const body = validate(loginSchema, req.body, res);
    if (!body) return;

    const emailNorm = body.email.toLowerCase().trim();
    const pmUser = await storage.getPmUserByEmail(emailNorm);
    if (!pmUser) return res.status(401).json({ error: "Invalid email or password." });
    // Support both bcrypt hashed and legacy plaintext passwords
    const isHashed = pmUser.password.startsWith("$2");
    const passwordMatch = isHashed
      ? await bcrypt.compare(body.password, pmUser.password)
      : pmUser.password === body.password;
    if (!passwordMatch) return res.status(401).json({ error: "Invalid email or password." });
    // Auto-upgrade plaintext password to bcrypt on successful login
    if (!isHashed) {
      const hashed = await bcrypt.hash(body.password, 10);
      await storage.updatePmUser(pmUser.id, { password: hashed });
    }

    // Issue a JWT — survives server restarts and deploys (no DB lookup needed)
    const jwtToken = createToken(pmUser.id, pmUser.email, SESSION_EXPIRY_HOURS);

    res.json({ token: jwtToken, user: { id: pmUser.id, email: pmUser.email, name: pmUser.name, initial: pmUser.initial || "", role: pmUser.role, defaultFilter: pmUser.defaultFilter || "ongoing", defaultMyProjects: !!pmUser.defaultMyProjects, defaultSource: (pmUser as any).defaultSource || "all", defaultAccount: (pmUser as any).defaultAccount || "all" } });
  });

  // ---- REDIRECT ENDPOINTS (no '#' in URL — safe for email clients) ----

  // Magic-link redirect: email links point here.
  // We serve an HTML page that does a client-side redirect so the hash
  // fragment is preserved (302 redirects drop the hash in most browsers).
  app.get("/api/auth/redirect/:token", async (req: Request, res: Response) => {
    const authToken = await storage.getAuthToken(param(req, "token"));
    if (!authToken || !authToken.clientBaseUrl) {
      return res.status(404).send("Invalid or expired link.");
    }
    const frontendUrl = `${authToken.clientBaseUrl}#/auth/verify/${param(req, "token")}`;
    res.type("html").send(buildRedirectPage(frontendUrl, "Signing you in..."));
  });

  // Offer redirect: freelancer email links point here
  app.get("/api/offers/redirect/:token", async (req: Request, res: Response) => {
    const offer = await storage.getOfferByToken(param(req, "token"));
    if (!offer) {
      return res.status(404).send("Offer not found or expired.");
    }
    const base = offer.clientBaseUrl || SITE_PUBLIC_URL;
    const frontendUrl = `${base}#/respond/${param(req, "token")}`;
    res.type("html").send(buildRedirectPage(frontendUrl, "Loading task details..."));
  });

  // Get current user
  app.get("/api/auth/me", requireAuth, async (req: Request, res: Response) => {
    const pmUserId = (req as any).pmUserId;
    const allUsers = await storage.getAllPmUsers();
    const user = allUsers.find(u => u.id === pmUserId);
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ id: user.id, email: user.email, name: user.name, role: user.role });
  });

  app.post("/api/auth/logout", async (req: Request, res: Response) => {
    // JWT is stateless — logout just acknowledges. Client clears its stored token.
    // Also delete legacy DB session if it exists.
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (token) {
      try { await storage.deleteSession(token); } catch {}
    }
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

  // Shared task fetch function with 5-minute cache
  async function getAllTasksCached(): Promise<any[]> {
    const cached = getCached<any[]>("allTasks", 300000); // 5 min
    if (cached) return cached;

    const configs = await storage.getAllSheetConfigs();
    const allTasks: any[] = [];

    // Fetch all sheets in parallel (Google Sheets API has generous rate limits)
    const fetchJobs = configs
      .filter(c => c.googleSheetId || c.sheetDbId) // need at least one data source
      .map(cfg => () =>
        fetchSheetTasks(cfg.sheetDbId || "", cfg.sheet, cfg.sheet, cfg.source, cfg.googleSheetId)
          .then(rows => { allTasks.push(...rows); })
      );

    // Google Sheets API: 300 read req/min quota — 18 tabs is fine in parallel
    // SheetDB fallback: throttle to 6 concurrent if needed
    const gsAvail = await gsIsAvailable();
    const CONCURRENCY = gsAvail ? 18 : 6;
    for (let i = 0; i < fetchJobs.length; i += CONCURRENCY) {
      await Promise.all(fetchJobs.slice(i, i + CONCURRENCY).map(fn => fn()));
    }
    setCache("allTasks", allTasks);
    return allTasks;
  }

  app.get("/api/tasks", requireAuth, async (req: Request, res: Response) => {
    try {
      const allTasks = await getAllTasksCached();

      // PM-specific filtering
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

      // Filter out delivered tasks by default
      const includeDelivered = req.query.includeDelivered === "true";
      const filtered = includeDelivered ? pmTasks : pmTasks.filter((t: any) => t.delivered !== "Delivered");

      // Overlay local assignment data onto tasks (covers SheetDB propagation delay)
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

  app.get("/api/assignments", requireAuth, async (_req: Request, res: Response) => {
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

  app.get("/api/assignments/:id", requireAuth, async (req: Request, res: Response) => {
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
  app.post("/api/assignments/:id/cancel", requireAuth, async (req: Request, res: Response) => {
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
  app.post("/api/offers/:id/withdraw", requireAuth, async (req: Request, res: Response) => {
    const offer = await storage.getOffer(+param(req, "id"));
    if (!offer) return res.status(404).json({ error: "Offer not found" });
    if (offer.status !== "pending") {
      return res.status(400).json({ error: "Only pending offers can be withdrawn" });
    }
    await storage.updateOffer(offer.id, { status: "withdrawn", respondedAt: new Date().toISOString() });
    res.json({ success: true, message: "Offer withdrawn." });
  });

  // ---- ASSIGN TO ME ----
  app.post("/api/assignments/self-assign", requireAuth, async (req: Request, res: Response) => {
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

    // Write PM's initial to Sheet (only if cell is empty or XX)
    const pmInitial = user.initial || user.name;
    safeWriteToSheet(assignment, pmInitial, role as "translator" | "reviewer");

    // Self-Edit: write the same code to both TR and REV
    if (body.reviewType === "Self-Edit" && role === "reviewer") {
      safeWriteToSheet(assignment, pmInitial, "translator");
    }

    // Write custom TR deadline to sheet if provided
    if (body.customDeadline && role === "translator") {
      safeWriteDeadlineToSheet(assignment, body.customDeadline);
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

    // Create a pre-accepted offer
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
    // If PM set a custom deadline, override it in task details for email/display
    if (customDeadline && role === "translator") {
      task.deadline = customDeadline;
    }

    if (assignmentType === "direct" || assignmentType === "broadcast") {
      // Send to all freelancers at once
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
      // Send only to first in sequence
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

    // Write custom TR deadline to sheet if provided
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
  app.get("/api/offers/:token", offerLimiter, async (req: Request, res: Response) => {
    // Validate token format (64-char hex) to prevent enumeration
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
  app.post("/api/offers/:token/accept", offerLimiter, async (req: Request, res: Response) => {
    if (!/^[a-f0-9]{64}$/.test(param(req, "token"))) return res.status(404).json({ error: "Offer not found." });
    const offer = await storage.getOfferByToken(param(req, "token"));
    if (!offer) return res.status(404).json({ error: "Offer not found." });
    if (offer.status !== "pending") {
      return res.status(400).json({ error: "This offer is no longer valid.", currentStatus: offer.status });
    }

    const assignment = await storage.getAssignment(offer.assignmentId);
    if (!assignment) return res.status(404).json({ error: "Task not found." });
    if (assignment.status === "accepted" || assignment.status === "completed") {
      // Already taken by someone else
      await storage.updateOffer(offer.id, { status: "withdrawn", respondedAt: new Date().toISOString() });
      return res.status(400).json({ error: "This task has already been accepted by another translator." });
    }

    const now = new Date().toISOString();

    // Accept this offer
    await storage.updateOffer(offer.id, { status: "accepted", respondedAt: now });

    // Update assignment
    await storage.updateAssignment(assignment.id, {
      status: "accepted",
      acceptedBy: offer.freelancerCode,
      acceptedByName: offer.freelancerName,
      acceptedByEmail: offer.freelancerEmail,
      acceptedAt: now,
    });

    // Withdraw all other pending offers for this assignment
    const allOffers = await storage.getOffersByAssignment(assignment.id);
    for (const o of allOffers) {
      if (o.id !== offer.id && o.status === "pending") {
        await storage.updateOffer(o.id, { status: "withdrawn", respondedAt: now });
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
    await notify("offer_accepted", `${offer.freelancerName} accepted`,
      `${offer.freelancerName} accepted ${assignment.role} for ${assignment.projectId}`,
      { projectId: assignment.projectId, freelancerCode: offer.freelancerCode, role: assignment.role });
    wsBroadcast("offer_accepted", { assignmentId: assignment.id, freelancerName: offer.freelancerName, projectId: assignment.projectId });

    res.json({ success: true, message: "Task accepted. Thank you!" });
  });

  // Reject offer
  app.post("/api/offers/:token/reject", offerLimiter, async (req: Request, res: Response) => {
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

    // If sequence, move to next freelancer
    if (assignment.assignmentType === "sequence") {
      const sequenceList = JSON.parse(assignment.sequenceList || "[]");
      const nextIndex = (assignment.currentSequenceIndex || 0) + 1;

      if (nextIndex < sequenceList.length) {
        await storage.updateAssignment(assignment.id, { currentSequenceIndex: nextIndex });

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
        // No more freelancers in sequence
        await storage.updateAssignment(assignment.id, { status: "expired" });
      }
    }

    // Slack notification
    notifySlackRejected(assignment.projectId, offer.freelancerName, assignment.role);

    // In-app notification + WebSocket
    await notify("offer_rejected", `${offer.freelancerName} declined`,
      `${offer.freelancerName} declined ${assignment.role} for ${assignment.projectId}`,
      { projectId: assignment.projectId, freelancerCode: offer.freelancerCode, role: assignment.role });
    wsBroadcast("offer_rejected", { assignmentId: assignment.id, freelancerName: offer.freelancerName, projectId: assignment.projectId });

    res.json({ success: true, message: "Offer declined." });
  });

  // Mark task as completed by freelancer
  app.post("/api/offers/:token/complete", offerLimiter, async (req: Request, res: Response) => {
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
    await notify("task_completed", `Task completed`,
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
  async function getSheetWriteConfig(assignment: any): Promise<SheetWriteConfig | null> {
    const configs = await storage.getAllSheetConfigs();
    const config = configs.find(c => c.source === assignment.source && c.sheet === assignment.sheet);
    if (!config) return null;
    const gsId = config.googleSheetId;
    if (gsId) return { googleSheetId: gsId, tabName: assignment.sheet, projectId: assignment.projectId };
    return null;
  }

  const TR_CANDIDATES = ["TR ", "TR", "Translator", "Tra", "TER"];
  const REV_CANDIDATES = ["Rev", "REV", "Reviewer", "Rev."];
  const TR_DONE_CANDIDATES = ["TR\nDone?", "TR Done?", "TR Dlvr", "TR Dlvr?", "TR Dlv?", "TR Delivered?", "TR delivered?", "TR Delivered", "TR Compl?", "Tra Dlv?", "TR\nDlvr?"];
  const REV_COMPLETE_CANDIDATES = ["Rev\nDone?", "Rev Done?", "Rev Complete? (in minutes)", "Rev Complete?", "Rev Completed? (in minutes)", "Rev Compl?", "Time Spent\n(in minutes)", "Time Spent (in minutes)", "Time Spent", "Rev Time (min.)", "Rev. Dlv?", "Rev QA", "Rev Dlvr?", "Rev\nDlvr?"];
  const QS_CANDIDATES = ["QS", "QS (Num)"];
  const TR_DEADLINE_CANDIDATES = ["TR\nDeadline", "TR Deadline", "Deadline"];

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

  // Write status values (TR Done, Rev Complete) to sheet
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

  // Write TR Deadline to sheet
  async function safeWriteDeadlineToSheet(assignment: any, deadlineValue: string) {
    const gsConfig = await getSheetWriteConfig(assignment);

    if (!gsConfig) {
      console.error(`Deadline write SKIPPED [${assignment.source}/${assignment.sheet}]: No Google Sheet config. SheetDB fallback disabled.`);
      return;
    }

    const result = await gsWriteToColumn(gsConfig, TR_DEADLINE_CANDIDATES, deadlineValue, { skipSafetyCheck: true });
    console.log(`Deadline write [${assignment.source}/${assignment.sheet}]: ${result.message}`);
  }

  // ---- TASK NOTES (PM internal) ----
  app.get("/api/task-notes", requireAuth, async (req: Request, res: Response) => {
    const notes = await db.select().from(taskNotes);
    res.json(notes);
  });

  app.post("/api/task-notes", requireAuth, async (req: Request, res: Response) => {
    const { source, sheet, projectId, note } = req.body;
    if (!source || !projectId) return res.status(400).json({ error: "Missing fields" });
    const user = (await storage.getAllPmUsers()).find(u => u.id === (req as any).pmUserId);
    if (!user) return res.status(404).json({ error: "User not found" });
    const now = new Date().toISOString();
    // Upsert: update if exists, create if not
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
  app.get("/api/favorites", requireAuth, async (req: Request, res: Response) => {
    const user = (await storage.getAllPmUsers()).find(u => u.id === (req as any).pmUserId);
    if (!user) return res.status(404).json({ error: "User not found" });
    const favs = await db.select().from(pmFavorites).where(eq(pmFavorites.pmEmail, user.email));
    res.json(favs.map(f => f.freelancerCode));
  });

  app.post("/api/favorites", requireAuth, async (req: Request, res: Response) => {
    const { freelancerCode } = req.body;
    if (!freelancerCode) return res.status(400).json({ error: "Missing freelancerCode" });
    const user = (await storage.getAllPmUsers()).find(u => u.id === (req as any).pmUserId);
    if (!user) return res.status(404).json({ error: "User not found" });
    const [existing] = await db.select().from(pmFavorites)
      .where(and(eq(pmFavorites.pmEmail, user.email), eq(pmFavorites.freelancerCode, freelancerCode)));
    if (existing) {
      // Toggle off
      await db.delete(pmFavorites).where(eq(pmFavorites.id, existing.id));
      res.json({ favorited: false });
    } else {
      // Toggle on
      await db.insert(pmFavorites).values({ pmEmail: user.email, freelancerCode, createdAt: new Date().toISOString() });
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
  app.post("/api/assignments/:id/undo", requireAuth, async (req: Request, res: Response) => {
    const assignment = await storage.getAssignment(+param(req, "id"));
    if (!assignment) return res.status(404).json({ error: "Assignment not found" });
    // Only allow undo within 15 seconds of creation
    const createdTime = new Date(assignment.createdAt).getTime();
    const elapsed = Date.now() - createdTime;
    if (elapsed > 15000) {
      return res.status(400).json({ error: "Undo window expired (15 seconds)" });
    }
    // Cancel all offers
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
  app.post("/api/export/xlsx", requireAuth, async (req: Request, res: Response) => {
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
    const gsConfig = await getSheetWriteConfig(assignment);

    if (!gsConfig) {
      console.error(`QS write SKIPPED [${assignment.source}/${assignment.sheet}]: No Google Sheet config. SheetDB fallback disabled.`);
      return;
    }

    const result = await gsWriteToColumn(gsConfig, QS_CANDIDATES, qsValue, { skipSafetyCheck: true });
    console.log(`QS write [${assignment.source}/${assignment.sheet}]: ${result.message}`);
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
      const pmUser = (await storage.getAllPmUsers()).find(u => u.id === assignment.assignedBy);

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
      res.status(500).json({ error: safeError("Internal server error", e) });
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
      res.status(500).json({ error: safeError("Internal server error", e) });
    }
  });

  // ---- ADMIN: SHEET CONFIG ----

  app.get("/api/sheet-configs", requireAuth, async (_req: Request, res: Response) => {
    res.json(await storage.getAllSheetConfigs());
  });

  app.post("/api/sheet-configs", requireAuth, async (req: Request, res: Response) => {
    const { source, sheet, languagePair, sheetDbId, googleSheetUrl, assignedPms } = req.body;
    if (!source || !sheet || !languagePair) return res.status(400).json({ error: "Missing fields" });
    const config = await storage.upsertSheetConfig(source, sheet, languagePair, sheetDbId || undefined, googleSheetUrl || undefined, assignedPms || undefined);
    res.json(config);
  });

  app.delete("/api/sheet-configs/:id", requireAuth, async (req: Request, res: Response) => {
    await storage.deleteSheetConfig(+param(req, "id"));
    res.json({ success: true });
  });

  // ---- ADMIN: EMAIL TEMPLATES ----

  app.get("/api/email-templates", requireAuth, async (_req: Request, res: Response) => {
    res.json(await storage.getAllEmailTemplates());
  });

  app.post("/api/email-templates", requireAuth, async (req: Request, res: Response) => {
    const { key, subject, body } = req.body;
    if (!key || !subject || !body) return res.status(400).json({ error: "Missing fields" });
    const template = await storage.upsertEmailTemplate(key, subject, body);
    res.json(template);
  });

  // ---- SEQUENCE PRESETS ----

  app.get("/api/presets", requireAuth, async (req: Request, res: Response) => {
    const allUsers = await storage.getAllPmUsers();
    const user = allUsers.find(u => u.id === (req as any).pmUserId);
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(await storage.getPresetsByPm(user.email));
  });

  app.post("/api/presets", requireAuth, async (req: Request, res: Response) => {
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

  app.delete("/api/presets/:id", requireAuth, async (req: Request, res: Response) => {
    await storage.deletePreset(+param(req, "id"));
    res.json({ success: true });
  });

  // ---- PROJECT COMPLETE (PM action) ----

  app.post("/api/tasks/complete", requireAuth, async (req: Request, res: Response) => {
    const { source, sheet, projectId, revCompleteValue } = req.body;
    if (!source || !projectId) return res.status(400).json({ error: "Missing fields" });
    const valueToWrite = revCompleteValue || "Yes";

    // Update local assignment if exists
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

    // Write Rev Complete value to Google Sheet
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

  app.get("/api/pm-users", requireAuth, async (_req: Request, res: Response) => {
    res.json((await storage.getAllPmUsers()).map(u => ({ ...u, password: undefined })));
  });

  app.post("/api/pm-users", requireAuth, async (req: Request, res: Response) => {
    const { email, name, initial, password, role } = req.body;
    if (!email || !name || !password) return res.status(400).json({ error: "Email, name, and password required" });
    if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters" });
    const existing = await storage.getPmUserByEmail(email.toLowerCase().trim());
    if (existing) return res.status(400).json({ error: "This email is already registered." });
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await storage.createPmUser({ email: email.toLowerCase().trim(), name, initial: initial || "", password: hashedPassword, role: role || "pm" });
    res.json(user);
  });

  // Update PM user (admin edit)
  app.put("/api/pm-users/:id", requireAuth, async (req: Request, res: Response) => {
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

  // Update PM preferences (default filter, my projects)
  app.post("/api/pm-users/preferences", requireAuth, async (req: Request, res: Response) => {
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
  app.post("/api/tasks/unassign", requireAuth, async (req: Request, res: Response) => {
    const { source, sheet, projectId, role } = req.body;
    if (!source || !projectId || !role) return res.status(400).json({ error: "Missing fields" });

    try {
      // 1. Write XX to the sheet column via Google Sheets API
      const candidates = role === "translator" ? TR_CANDIDATES : REV_CANDIDATES;
      const gsConfig = await getSheetWriteConfig({ source, sheet: sheet || "" });
      if (gsConfig) {
        gsConfig.projectId = projectId;
        const result = await gsWriteToColumn(gsConfig, candidates, "XX", { skipSafetyCheck: true });
        console.log(`Unassign [${source}/${sheet}]: ${result.message}`);
      } else {
        console.error(`Unassign SKIPPED [${source}/${sheet}]: No Google Sheet config.`);
      }

      // 2. Cancel any matching dispatch assignment
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

      // 3. Invalidate task cache
      setCache("allTasks", null as any);

      res.json({ success: true, message: `${role} unassigned from ${projectId}` });
    } catch (e: any) {
      console.error("Unassign error:", e);
      res.status(500).json({ error: "Unassign failed" });
    }
  });

  // ---- BULK COMPLETE ----
  app.post("/api/tasks/bulk-complete", requireAuth, async (req: Request, res: Response) => {
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
  app.get("/api/auto-assign-rules", requireAuth, async (_req: Request, res: Response) => {
    res.json(await storage.getAllAutoAssignRules());
  });

  app.post("/api/auto-assign-rules", requireAuth, async (req: Request, res: Response) => {
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

  app.put("/api/auto-assign-rules/:id", requireAuth, async (req: Request, res: Response) => {
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

  app.delete("/api/auto-assign-rules/:id", requireAuth, async (req: Request, res: Response) => {
    await storage.deleteAutoAssignRule(+param(req, "id"));
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

      // Get current tasks
      const allConfigs = await storage.getAllSheetConfigs();
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
      res.status(500).json({ error: safeError("Internal server error", e) });
    } finally {
      releaseLock("auto-dispatch");
    }
  });

  // ---- SEQUENCE TIMEOUT / AUTO-WITHDRAW ----
  // POST /api/sequence-advance — checks pending sequential offers and advances expired ones
  app.post("/api/sequence-advance", requireAuth, async (req: Request, res: Response) => {
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
          // Withdraw the expired offer
          await storage.updateOffer(pendingOffer.id, { status: "expired", respondedAt: new Date().toISOString() });

          // Advance to next in sequence
          const seqList = JSON.parse(assignment.sequenceList || "[]") as string[];
          const nextIdx = (assignment.currentSequenceIndex || 0) + 1;

          if (nextIdx < seqList.length) {
            // Find the freelancer for next in sequence from existing offers
            const nextCode = seqList[nextIdx];
            const nextOffer = offers.find(o => o.freelancerCode === nextCode);

            if (nextOffer) {
              // Send the offer
              await storage.updateOffer(nextOffer.id, { status: "pending", sentAt: new Date().toISOString() });
              await storage.updateAssignment(assignment.id, { currentSequenceIndex: nextIdx });

              // Send email
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
            // No more freelancers in sequence — expire the assignment
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
  app.get("/api/freelancer-delivery-stats", requireAuth, async (_req: Request, res: Response) => {
    // Calculate average delivery speed per freelancer based on historical data
    const allAssignments = await storage.getAllAssignments();
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
      const fStatus = req.query.status ? String(req.query.status) : null;
      const fDateFrom = req.query.dateFrom ? new Date(String(req.query.dateFrom)) : null;
      const fDateTo = req.query.dateTo ? new Date(String(req.query.dateTo) + "T23:59:59") : null;

      const allSheetTasks = allSheetTasksRaw.filter((t: any) => {
        if (fSource && !fSource.includes(t.source)) return false;
        if (fAccount && !fAccount.includes(t.account)) return false;
        if (fStatus && t.delivered !== fStatus) return false;
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
      const allAssignmentsRaw = await storage.getAllAssignments();
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
        const assignmentOffers = await storage.getOffersByAssignment(a.id);
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

      // Translator workload balance — ongoing tasks per translator
      const workloadBalance: Record<string, { ongoing: number; total: number }> = {};
      for (const t of allSheetTasks) {
        const tr = (t.translator || "").trim();
        if (tr && tr !== "XX") {
          if (!workloadBalance[tr]) workloadBalance[tr] = { ongoing: 0, total: 0 };
          workloadBalance[tr].total++;
          if (t.delivered === "Ongoing") workloadBalance[tr].ongoing++;
        }
      }
      const avgOngoing = Object.values(workloadBalance).length > 0
        ? Object.values(workloadBalance).reduce((s, v) => s + v.ongoing, 0) / Object.values(workloadBalance).length
        : 0;
      const workloadData = Object.entries(workloadBalance)
        .filter(([, v]) => v.ongoing > 0)
        .map(([code, v]) => ({
          code,
          ongoing: v.ongoing,
          total: v.total,
          overloaded: v.ongoing > avgOngoing * 2,
          heavy: v.ongoing > avgOngoing * 1.5,
        }))
        .sort((a, b) => b.ongoing - a.ongoing)
        .slice(0, 20);

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
        workloadData,
        avgOngoingPerTranslator: Math.round(avgOngoing * 10) / 10,
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

  app.get("/api/notifications", requireAuth, async (_req: Request, res: Response) => {
    const recent = await storage.getRecentNotifications(50);
    // Only return last 24h
    const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const filtered = recent.filter(n => n.createdAt >= cutoff);
    res.json({ notifications: filtered, unreadCount: await storage.getUnreadCount() });
  });

  app.post("/api/notifications/:id/read", requireAuth, async (req: Request, res: Response) => {
    await storage.markNotificationRead(+param(req, "id"));
    res.json({ success: true });
  });

  app.post("/api/notifications/read-all", requireAuth, async (_req: Request, res: Response) => {
    await storage.markAllNotificationsRead();
    res.json({ success: true });
  });

  // ============================================
  // FREELANCER PORTAL
  // ============================================

  // Magic link request — freelancer enters their email
  app.post("/api/freelancer/magic-link", magicLinkLimiter, async (req: Request, res: Response) => {
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
      await storage.createFreelancerSession({
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
  app.post("/api/freelancer/verify/:token", async (req: Request, res: Response) => {
    const session = await storage.getFreelancerSession(param(req, "token"));
    if (!session) return res.status(404).json({ error: "Invalid or expired link" });
    if (new Date(session.expiresAt) < new Date()) {
      await storage.deleteFreelancerSession(param(req, "token"));
      return res.status(400).json({ error: "Link has expired" });
    }
    // Extend session to 72 hours
    const newToken = generateToken();
    const expiresAt = new Date(Date.now() + 72 * 3600 * 1000).toISOString();
    await storage.createFreelancerSession({
      token: newToken,
      freelancerCode: session.freelancerCode,
      freelancerName: session.freelancerName,
      freelancerEmail: session.freelancerEmail,
      expiresAt,
    });
    // Clean up the one-time token
    await storage.deleteFreelancerSession(param(req, "token"));
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
    const session = await storage.getFreelancerSession(flToken);
    if (!session) return res.status(401).json({ error: "Invalid session" });
    if (new Date(session.expiresAt) < new Date()) {
      await storage.deleteFreelancerSession(flToken);
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
      const allAssignments = await storage.getAllAssignments();
      const pendingOffers: any[] = [];
      for (const a of allAssignments) {
        if (a.status === "offered" || a.status === "pending") {
          const offers = await storage.getOffersByAssignment(a.id);
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
      res.status(500).json({ error: safeError("Internal server error", e) });
    }
  });

  // Helper for freelancer portal
  function isEffectivelyCancelledTask(t: any): boolean {
    const trLower = (t.trDone || "").trim().toLowerCase();
    const revLower = (t.revComplete || "").trim().toLowerCase();
    const cancelledValues = ["cancelled", "canceled", "on hold", "onhold", "on-hold"];
    return cancelledValues.includes(trLower) || cancelledValues.includes(revLower);
  }

  // ============================================
  // ROLE-BASED AUTH MIDDLEWARE
  // ============================================
  const ROLE_HIERARCHY: Record<string, number> = {
    vendor: 0, pc: 1, pm: 2, vm: 3, pm_team_lead: 4,
    operations_manager: 5, admin: 6, gm: 7,
  };

  function requireRole(...allowedRoles: string[]) {
    return async (req: Request, res: Response, next: NextFunction) => {
      const pmUserId = (req as any).pmUserId;
      if (!pmUserId) return res.status(401).json({ error: "Not authenticated" });
      // Try new users table first, fall back to pmUsers
      const user = await storage.getUserById(pmUserId) || (await storage.getAllPmUsers()).find(u => u.id === pmUserId);
      if (!user) return res.status(404).json({ error: "User not found" });
      const userRole = (user as any).role || "pm";
      // GM and admin have access to everything
      if (userRole === "gm" || userRole === "admin") {
        (req as any).userRole = userRole;
        (req as any).currentUser = user;
        return next();
      }
      if (!allowedRoles.includes(userRole)) {
        return res.status(403).json({ error: "Insufficient permissions" });
      }
      (req as any).userRole = userRole;
      (req as any).currentUser = user;
      next();
    };
  }

  // ============================================
  // NEW DISPATCH 2.0 API ROUTES
  // ============================================

  // ---- USERS CRUD (admin/gm only) ----
  app.get("/api/users", requireAuth, requireRole("admin", "gm", "operations_manager"), async (req: Request, res: Response) => {
    const allUsers = await storage.getAllUsers();
    res.json(allUsers.map((u: any) => ({ ...u, passwordHash: undefined })));
  });

  app.post("/api/users", requireAuth, requireRole("admin", "gm"), async (req: Request, res: Response) => {
    try {
      const body = validate(createUserSchema, req.body, res);
      if (!body) return;
      const passwordHash = body.password ? await bcrypt.hash(body.password, 10) : null;
      const user = await storage.createUser({ email: body.email.toLowerCase().trim(), name: body.name, initial: body.initial, passwordHash, role: body.role, entityId: body.entityId });
      await logAudit((req as any).pmUserId, "create", "user", user.id, null, { ...user, passwordHash: undefined }, getClientIp(req));
      res.json({ ...user, passwordHash: undefined });
    } catch (e: any) {
      console.error("Create user error:", e);
      res.status(500).json({ error: "Failed to create user" });
    }
  });

  app.patch("/api/users/:id", requireAuth, requireRole("admin", "gm"), async (req: Request, res: Response) => {
    try {
      const id = +param(req, "id");
      const oldUser = await storage.getUserById(id);
      const updates: any = {};
      if (req.body.name) updates.name = req.body.name;
      if (req.body.initial) updates.initial = req.body.initial;
      if (req.body.role) updates.role = req.body.role;
      if (req.body.entityId !== undefined) updates.entityId = req.body.entityId;
      if (req.body.isActive !== undefined) updates.isActive = req.body.isActive;
      if (req.body.password) updates.passwordHash = await bcrypt.hash(req.body.password, 10);
      const user = await storage.updateUser(id, updates);
      await logAudit((req as any).pmUserId, "update", "user", id, oldUser ? { ...oldUser, passwordHash: undefined } : null, { ...user, passwordHash: undefined }, getClientIp(req));
      res.json({ ...user, passwordHash: undefined });
    } catch (e: any) {
      console.error("Update user error:", e);
      res.status(500).json({ error: "Failed to update user" });
    }
  });

  app.delete("/api/users/:id", requireAuth, requireRole("admin", "gm"), async (req: Request, res: Response) => {
    try {
      const id = +param(req, "id");
      const oldUser = await storage.getUserById(id);
      await storage.deleteUser(id);
      await logAudit((req as any).pmUserId, "delete", "user", id, oldUser ? { ...oldUser, passwordHash: undefined } : null, null, getClientIp(req));
      res.json({ success: true });
    } catch (e: any) {
      console.error("Delete user error:", e);
      res.status(500).json({ error: "Failed to delete user" });
    }
  });

  // ---- ENTITIES ----
  app.get("/api/entities", requireAuth, async (_req: Request, res: Response) => {
    const allEntities = await storage.getAllEntities();
    res.json(allEntities);
  });

  app.post("/api/entities", requireAuth, async (req: Request, res: Response) => {
    try {
      const entity = await storage.createEntity(req.body);
      res.json(entity);
    } catch (e: any) {
      res.status(500).json({ error: safeError("Failed to create entity", e) });
    }
  });

  app.patch("/api/entities/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const entity = await storage.updateEntity(+param(req, "id"), req.body);
      res.json(entity);
    } catch (e: any) {
      res.status(500).json({ error: safeError("Failed to update entity", e) });
    }
  });

  // ---- VENDORS CRUD ----
  app.get("/api/vendors", requireAuth, async (req: Request, res: Response) => {
    try {
      const { status, search, page, limit } = req.query;
      // Look up user role for PM-scoped filtering
      const pmUserId = (req as any).pmUserId;
      const user = await storage.getUserById(pmUserId) || (await storage.getAllPmUsers()).find(u => u.id === pmUserId);
      const userRole = (user as any)?.role || "pm";
      // PM and PC users only see approved vendors
      let effectiveStatus = status as string;
      if (userRole === "pm" || userRole === "pc") {
        effectiveStatus = "Approved";
      }
      const filters = {
        status: effectiveStatus,
        search: search as string,
        page: page ? +page : 1,
        limit: limit ? +limit : 50,
      };
      const [vendorList, total] = await Promise.all([
        storage.getVendors(filters),
        storage.getVendorCount(filters),
      ]);
      res.json({ data: vendorList, total, page: filters.page, limit: filters.limit });
    } catch (e: any) {
      res.status(500).json({ error: safeError("Internal server error", e) });
    }
  });

  app.get("/api/vendors/pipeline", requireAuth, async (_req: Request, res: Response) => {
    try {
      const pipeline = await storage.getVendorsPipeline();
      res.json(pipeline);
    } catch (e: any) {
      res.status(500).json({ error: safeError("Internal server error", e) });
    }
  });

  app.get("/api/vendors/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const vendor = await storage.getVendor(+param(req, "id"));
      if (!vendor) return res.status(404).json({ error: "Vendor not found" });
      res.json(vendor);
    } catch (e: any) {
      res.status(500).json({ error: safeError("Internal server error", e) });
    }
  });

  app.post("/api/vendors", requireAuth, async (req: Request, res: Response) => {
    try {
      const body = validate(createVendorSchema, req.body, res);
      if (!body) return;
      // Auto-generate resource code if not provided
      if (!body.resourceCode) {
        const nameParts = (body.fullName || "").trim().split(/\s+/);
        const initials = nameParts.map((p: string) => p.charAt(0).toUpperCase()).join("").slice(0, 3);
        const allVendors = await storage.getVendors();
        const existingCodes = (allVendors as any[]).map((v: any) => v.resourceCode).filter(Boolean);
        let seq = 1;
        let code = `${initials}${String(seq).padStart(3, "0")}`;
        while (existingCodes.includes(code)) {
          seq++;
          code = `${initials}${String(seq).padStart(3, "0")}`;
        }
        body.resourceCode = code;
      }
      const vendor = await storage.createVendor(body);
      await logAudit((req as any).pmUserId, "create", "vendor", vendor.id, null, vendor, getClientIp(req));
      res.json(vendor);
    } catch (e: any) {
      console.error("Create vendor error:", e);
      res.status(500).json({ error: "Failed to create vendor" });
    }
  });

  app.patch("/api/vendors/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const id = +param(req, "id");
      const oldVendor = await storage.getVendor(id);
      const vendor = await storage.updateVendor(id, req.body);
      await logAudit((req as any).pmUserId, "update", "vendor", id, oldVendor, vendor, getClientIp(req));
      res.json(vendor);
    } catch (e: any) {
      console.error("Update vendor error:", e);
      res.status(500).json({ error: "Failed to update vendor" });
    }
  });

  app.delete("/api/vendors/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const id = +param(req, "id");
      const oldVendor = await storage.getVendor(id);
      await storage.deleteVendor(id);
      await logAudit((req as any).pmUserId, "delete", "vendor", id, oldVendor, null, getClientIp(req));
      res.json({ success: true });
    } catch (e: any) {
      console.error("Delete vendor error:", e);
      res.status(500).json({ error: "Failed to delete vendor" });
    }
  });

  // ---- VENDOR IMPORT ----
  // CSV parsing helper
  function parseCSV(text: string): Record<string, string>[] {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return [];
    const headers = lines[0].split(",").map(h => h.trim().replace(/^"(.*)"$/, "$1"));
    const rows: Record<string, string>[] = [];
    for (let i = 1; i < lines.length; i++) {
      const values: string[] = [];
      let current = "";
      let inQuotes = false;
      for (const ch of lines[i]) {
        if (ch === '"') { inQuotes = !inQuotes; }
        else if (ch === "," && !inQuotes) { values.push(current.trim()); current = ""; }
        else { current += ch; }
      }
      values.push(current.trim());
      const row: Record<string, string> = {};
      headers.forEach((h, idx) => { if (values[idx] !== undefined) row[h] = values[idx]; });
      rows.push(row);
    }
    return rows;
  }

  function generateResourceCode(name: string, index: number): string {
    const prefix = name.replace(/[^a-zA-Z]/g, "").substring(0, 3).toUpperCase();
    return `${prefix || "VND"}${String(index).padStart(4, "0")}`;
  }

  const csvUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

  // Vendor import — accepts CSV file upload OR JSON array
  app.post("/api/vendors/import", requireAuth, requireRole("vm", "gm", "admin"), csvUpload.single("file"), async (req: Request, res: Response) => {
    try {
      let vendorRows: Record<string, any>[];

      // Check if it's a file upload (CSV)
      const file = (req as any).file as Express.Multer.File | undefined;
      if (file) {
        const csvText = file.buffer.toString("utf-8");
        const parsed = parseCSV(csvText);
        if (parsed.length === 0) {
          return res.status(400).json({ error: "CSV file is empty or has no data rows" });
        }
        // Map CSV columns to vendor fields
        const fieldMap: Record<string, string> = {
          name: "fullName", full_name: "fullName", fullname: "fullName",
          email: "email", contact_person: "contactPerson", contactperson: "contactPerson",
          phone: "phone", country: "location", location: "location",
          source_languages: "sourceLanguages", sourcelanguages: "sourceLanguages",
          target_languages: "targetLanguages", targetlanguages: "targetLanguages",
          service_types: "serviceTypes", servicetypes: "serviceTypes",
          specializations: "specializations", status: "status", notes: "notes",
          resource_code: "resourceCode", resourcecode: "resourceCode",
          native_language: "nativeLanguage", nativelanguage: "nativeLanguage",
          currency: "currency", resource_type: "resourceType", resourcetype: "resourceType",
        };
        vendorRows = parsed.map((row) => {
          const mapped: Record<string, any> = {};
          for (const [csvKey, value] of Object.entries(row)) {
            const normalizedKey = csvKey.toLowerCase().replace(/[\s-]/g, "_");
            const mappedKey = fieldMap[normalizedKey] || normalizedKey;
            if (value) mapped[mappedKey] = value;
          }
          // Convert comma-separated arrays
          for (const arrField of ["sourceLanguages", "targetLanguages", "serviceTypes", "specializations"]) {
            if (typeof mapped[arrField] === "string") {
              mapped[arrField] = mapped[arrField].split(";").map((s: string) => s.trim()).filter(Boolean);
            }
          }
          return mapped;
        });
      } else if (Array.isArray(req.body)) {
        vendorRows = req.body;
      } else {
        return res.status(400).json({ error: "Provide a CSV file upload or a JSON array of vendor objects" });
      }

      // Get existing vendor count for resource code generation
      const existingCount = await storage.getVendorCount();
      const imported: number[] = [];
      const errors: { index: number; error: string }[] = [];

      for (let i = 0; i < vendorRows.length; i++) {
        const row = vendorRows[i];
        // Ensure required fields
        if (!row.fullName && !row.full_name && !row.name) {
          errors.push({ index: i, error: "Missing required field: name/fullName" });
          continue;
        }
        if (!row.email) {
          errors.push({ index: i, error: "Missing required field: email" });
          continue;
        }
        // Map alternate names
        if (!row.fullName && row.full_name) row.fullName = row.full_name;
        if (!row.fullName && row.name) row.fullName = row.name;

        // Auto-generate resource code if missing
        if (!row.resourceCode) {
          row.resourceCode = generateResourceCode(row.fullName, existingCount + imported.length + 1);
        }

        const result = createVendorSchema.safeParse(row);
        if (!result.success) {
          errors.push({ index: i, error: result.error.errors.map(e => e.message).join(", ") });
          continue;
        }
        try {
          const vendor = await storage.createVendor(result.data);
          imported.push(vendor.id);
          await logAudit((req as any).pmUserId, "import", "vendor", vendor.id, null, vendor, getClientIp(req));
        } catch (e: any) {
          errors.push({ index: i, error: e?.message || "Failed to insert vendor" });
        }
      }
      res.json({ imported: imported.length, skipped: errors.length, errors });
    } catch (e: any) {
      console.error("Vendor import error:", e);
      res.status(500).json({ error: "Failed to import vendors" });
    }
  });

  // Vendor sub-resources
  app.get("/api/vendors/:id/quality-reports", requireAuth, async (req: Request, res: Response) => {
    const reports = await storage.getQualityReports(+param(req, "id"));
    res.json(reports);
  });

  app.get("/api/vendors/:id/activities", requireAuth, async (req: Request, res: Response) => {
    const activities = await storage.getVendorActivities(+param(req, "id"));
    res.json(activities);
  });

  app.get("/api/vendors/:id/notes", requireAuth, async (req: Request, res: Response) => {
    const notes = await storage.getVendorNotes(+param(req, "id"));
    res.json(notes);
  });

  app.post("/api/vendors/:id/notes", requireAuth, async (req: Request, res: Response) => {
    try {
      const body = validate(createVendorNoteSchema, req.body, res);
      if (!body) return;
      const pmUserId = (req as any).pmUserId;
      const note = await storage.createVendorNote({
        vendorId: +param(req, "id"),
        content: body.content,
        noteType: body.noteType || "note",
        visibility: body.visibility || "team",
        createdBy: pmUserId,
      });
      res.json(note);
    } catch (e: any) {
      console.error("Create vendor note error:", e);
      res.status(500).json({ error: "Failed to create vendor note" });
    }
  });

  app.delete("/api/vendors/:vendorId/notes/:noteId", requireAuth, async (req: Request, res: Response) => {
    try {
      await storage.deleteVendorNote(+param(req, "noteId"));
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: "Failed to delete vendor note" });
    }
  });

  app.get("/api/vendors/:id/language-pairs", requireAuth, async (req: Request, res: Response) => {
    const pairs = await storage.getVendorLanguagePairs(+param(req, "id"));
    res.json(pairs);
  });

  app.post("/api/vendors/:id/language-pairs", requireAuth, async (req: Request, res: Response) => {
    try {
      const vendorId = +param(req, "id");
      const pair = await storage.addVendorLanguagePair({ vendorId, ...req.body });
      res.status(201).json(pair);
    } catch (e: any) {
      res.status(500).json({ error: safeError("Failed to add language pair", e) });
    }
  });

  app.delete("/api/vendors/:id/language-pairs/:pairId", requireAuth, async (req: Request, res: Response) => {
    try {
      await storage.deleteVendorLanguagePair(+param(req, "pairId"));
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: safeError("Failed to delete language pair", e) });
    }
  });

  app.get("/api/vendors/:id/rate-cards", requireAuth, async (req: Request, res: Response) => {
    const cards = await storage.getVendorRateCards(+param(req, "id"));
    res.json(cards);
  });

  app.get("/api/vendors/:id/documents", requireAuth, async (req: Request, res: Response) => {
    try {
      const docs = await storage.getVendorFileUploads(+param(req, "id"));
      res.json(docs);
    } catch (e: any) {
      console.error("Get vendor documents error:", e);
      res.status(500).json({ error: "Failed to get vendor documents" });
    }
  });

  const docUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

  app.post("/api/vendors/:id/documents", requireAuth, docUpload.single("file"), async (req: Request, res: Response) => {
    try {
      const vendorId = +param(req, "id");
      const file = (req as any).file;
      if (!file) {
        return res.status(400).json({ error: "No file uploaded" });
      }
      const docType = req.body.docType || "Other";
      // In production, upload to S3/GCS. Here we store a data URL.
      const fileUrl = `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;
      const doc = await storage.createVendorFileUpload({
        vendorId,
        fileName: file.originalname,
        fileUrl,
        docType,
        fileSize: file.size,
        mimeType: file.mimetype,
      });
      res.json(doc);
    } catch (e: any) {
      console.error("Upload vendor document error:", e);
      res.status(500).json({ error: "Failed to upload document" });
    }
  });

  app.delete("/api/vendors/:id/documents/:docId", requireAuth, async (req: Request, res: Response) => {
    try {
      await storage.deleteVendorFileUpload(+param(req, "docId"));
      res.json({ success: true });
    } catch (e: any) {
      console.error("Delete vendor document error:", e);
      res.status(500).json({ error: "Failed to delete document" });
    }
  });

  app.get("/api/vendors/:id/performance", requireAuth, async (req: Request, res: Response) => {
    try {
      const vendorId = +param(req, "id");
      const reports = await storage.getQualityReports(vendorId);

      const qsTrend: { date: string; score: number }[] = [];
      const lqaTrend: { date: string; score: number }[] = [];
      let totalJobs = 0;
      let onTimeCount = 0;
      let totalDeliveries = 0;

      for (const r of reports) {
        const date = r.reportDate ? new Date(r.reportDate).toISOString().split("T")[0] : null;
        if (r.qsScore != null && date) {
          qsTrend.push({ date, score: Number(r.qsScore) });
        }
        if (r.lqaScore != null && date) {
          lqaTrend.push({ date, score: Number(r.lqaScore) });
        }
        const st = (r.status || "").toLowerCase();
        if (st === "completed" || st === "finalized" || st === "late") {
          totalDeliveries++;
          if (st !== "late") onTimeCount++;
        }
        totalJobs++;
      }

      const onTimeRate = totalDeliveries > 0 ? Math.round((onTimeCount / totalDeliveries) * 100) : null;

      res.json({
        qsTrend: qsTrend.sort((a, b) => a.date.localeCompare(b.date)),
        lqaTrend: lqaTrend.sort((a, b) => a.date.localeCompare(b.date)),
        onTimeRate,
        totalWordCount: 0,
        totalJobs,
        totalEarnings: 0,
      });
    } catch (e: any) {
      console.error("Get vendor performance error:", e);
      res.status(500).json({ error: "Failed to get vendor performance" });
    }
  });

  // ---- CUSTOMERS CRUD ----
  app.get("/api/customers", requireAuth, async (req: Request, res: Response) => {
    try {
      const { search, page, limit } = req.query;
      const filters = {
        search: search as string,
        page: page ? +page : 1,
        limit: limit ? +limit : 50,
      };
      const [customerList, total] = await Promise.all([
        storage.getCustomers(filters),
        storage.getCustomerCount(filters),
      ]);
      res.json({ data: customerList, total, page: filters.page, limit: filters.limit });
    } catch (e: any) {
      res.status(500).json({ error: safeError("Internal server error", e) });
    }
  });

  app.get("/api/customers/:id", requireAuth, async (req: Request, res: Response) => {
    const customer = await storage.getCustomer(+param(req, "id"));
    if (!customer) return res.status(404).json({ error: "Customer not found" });
    res.json(customer);
  });

  app.post("/api/customers", requireAuth, async (req: Request, res: Response) => {
    try {
      const body = validate(createCustomerSchema, req.body, res);
      if (!body) return;
      const customer = await storage.createCustomer(body);
      await logAudit((req as any).pmUserId, "create", "customer", customer.id, null, customer, getClientIp(req));
      res.json(customer);
    } catch (e: any) {
      console.error("Create customer error:", e);
      res.status(500).json({ error: "Failed to create customer" });
    }
  });

  app.patch("/api/customers/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const id = +param(req, "id");
      const oldCustomer = await storage.getCustomer(id);
      const customer = await storage.updateCustomer(id, req.body);
      await logAudit((req as any).pmUserId, "update", "customer", id, oldCustomer, customer, getClientIp(req));
      res.json(customer);
    } catch (e: any) {
      console.error("Update customer error:", e);
      res.status(500).json({ error: "Failed to update customer" });
    }
  });

  app.get("/api/customers/:id/contacts", requireAuth, async (req: Request, res: Response) => {
    const contacts = await storage.getCustomerContacts(+param(req, "id"));
    res.json(contacts);
  });

  app.post("/api/customers/:id/contacts", requireAuth, async (req: Request, res: Response) => {
    try {
      const body = validate(createCustomerContactSchema, req.body, res);
      if (!body) return;
      const contact = await storage.createCustomerContact({ customerId: +param(req, "id"), ...body });
      res.json(contact);
    } catch (e: any) {
      console.error("Create customer contact error:", e);
      res.status(500).json({ error: "Failed to create customer contact" });
    }
  });

  app.get("/api/customers/:id/sub-accounts", requireAuth, async (req: Request, res: Response) => {
    const subAccounts = await storage.getCustomerSubAccounts(+param(req, "id"));
    res.json(subAccounts);
  });

  app.post("/api/customers/:id/sub-accounts", requireAuth, async (req: Request, res: Response) => {
    try {
      const body = validate(createSubAccountSchema, req.body, res);
      if (!body) return;
      const subAccount = await storage.createCustomerSubAccount({ customerId: +param(req, "id"), ...body });
      res.json(subAccount);
    } catch (e: any) {
      console.error("Create sub-account error:", e);
      res.status(500).json({ error: "Failed to create sub-account" });
    }
  });

  app.delete("/api/customers/:id/contacts/:contactId", requireAuth, async (req: Request, res: Response) => {
    try {
      await storage.deleteCustomerContact(+param(req, "contactId"));
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: safeError("Internal server error", e) });
    }
  });

  app.delete("/api/customers/:id/sub-accounts/:subId", requireAuth, async (req: Request, res: Response) => {
    try {
      await storage.deleteCustomerSubAccount(+param(req, "subId"));
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: safeError("Internal server error", e) });
    }
  });

  app.get("/api/customers/:id/pm-assignments", requireAuth, async (req: Request, res: Response) => {
    const assignments = await storage.getPmCustomerAssignments(undefined, +param(req, "id"));
    res.json(assignments);
  });

  app.post("/api/customers/:id/pm-assignments", requireAuth, async (req: Request, res: Response) => {
    try {
      const assignment = await storage.createPmCustomerAssignment({ customerId: +param(req, "id"), ...req.body });
      res.json(assignment);
    } catch (e: any) {
      res.status(500).json({ error: safeError("Internal server error", e) });
    }
  });

  app.delete("/api/customers/:id/pm-assignments/:assignId", requireAuth, async (req: Request, res: Response) => {
    try {
      await storage.deletePmCustomerAssignment(+param(req, "assignId"));
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: safeError("Internal server error", e) });
    }
  });

  // ---- CUSTOMER RATE CARDS ----
  app.get("/api/customers/:id/rate-card", requireAuth, async (req: Request, res: Response) => {
    try {
      const rows = await db.select().from(customerRateCards).where(eq(customerRateCards.customerId, +param(req, "id")));
      res.json(rows);
    } catch (e: any) {
      res.status(500).json({ error: safeError("Internal server error", e) });
    }
  });

  app.post("/api/customers/:id/rate-card", requireAuth, async (req: Request, res: Response) => {
    try {
      const body = validate(createRateCardSchema, req.body, res);
      if (!body) return;
      const [row] = await db.insert(customerRateCards).values({
        customerId: +param(req, "id"),
        sourceLanguage: body.sourceLanguage || null,
        targetLanguage: body.targetLanguage || null,
        serviceType: body.serviceType || null,
        rateType: body.rateType || null,
        rateValue: body.rateValue,
        currency: body.currency || "EUR",
      }).returning();
      res.json(row);
    } catch (e: any) {
      console.error("Create rate card error:", e);
      res.status(500).json({ error: "Failed to create rate card" });
    }
  });

  app.delete("/api/customers/:id/rate-card/:rateId", requireAuth, async (req: Request, res: Response) => {
    try {
      await db.delete(customerRateCards).where(eq(customerRateCards.id, +param(req, "rateId")));
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: safeError("Internal server error", e) });
    }
  });

  // ---- PROJECTS CRUD ----
  app.get("/api/projects", requireAuth, async (req: Request, res: Response) => {
    try {
      const { pmId, customerId, status, page, limit } = req.query;
      // Look up user role for PM-scoped filtering
      const pmUserId = (req as any).pmUserId;
      const user = await storage.getUserById(pmUserId) || (await storage.getAllPmUsers()).find(u => u.id === pmUserId);
      const userRole = (user as any)?.role || "pm";
      // PM and PC users only see their own projects
      let effectivePmId = pmId ? +pmId : undefined;
      if (userRole === "pm" || userRole === "pc") {
        effectivePmId = pmUserId;
      }
      const filters = {
        pmId: effectivePmId,
        customerId: customerId ? +customerId : undefined,
        status: status as string,
        page: page ? +page : 1,
        limit: limit ? +limit : 50,
      };
      const [projectList, total] = await Promise.all([
        storage.getProjects(filters),
        storage.getProjectCount(filters),
      ]);
      res.json({ data: projectList, total, page: filters.page, limit: filters.limit });
    } catch (e: any) {
      res.status(500).json({ error: safeError("Internal server error", e) });
    }
  });

  app.get("/api/projects/:id", requireAuth, async (req: Request, res: Response) => {
    const project = await storage.getProject(+param(req, "id"));
    if (!project) return res.status(404).json({ error: "Project not found" });
    res.json(project);
  });

  app.post("/api/projects", requireAuth, async (req: Request, res: Response) => {
    try {
      const body = validate(createProjectSchema, req.body, res);
      if (!body) return;
      // Auto-generate project_code if not provided
      if (!body.projectCode) {
        const year = new Date().getFullYear();
        const customer = await storage.getCustomer(body.customerId);
        const prefix = customer?.code || "PRJ";
        const [countResult] = await db.select({ cnt: sql<number>`count(*)::int` }).from(projects).where(sql`extract(year from ${projects.createdAt}) = ${year}`);
        const seq = (countResult?.cnt || 0) + 1;
        (body as any).projectCode = `${prefix}-${year}-${String(seq).padStart(4, "0")}`;
      }
      const project = await storage.createProject(body);
      await logAudit((req as any).pmUserId, "create", "project", project.id, null, project, getClientIp(req));
      res.json(project);
    } catch (e: any) {
      console.error("Create project error:", e);
      res.status(500).json({ error: "Failed to create project" });
    }
  });

  app.patch("/api/projects/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const id = +param(req, "id");
      const oldProject = await storage.getProject(id);
      const project = await storage.updateProject(id, req.body);
      await logAudit((req as any).pmUserId, "update", "project", id, oldProject, project, getClientIp(req));
      res.json(project);
    } catch (e: any) {
      console.error("Update project error:", e);
      res.status(500).json({ error: "Failed to update project" });
    }
  });

  app.get("/api/projects/:id/jobs", requireAuth, async (req: Request, res: Response) => {
    const jobList = await storage.getJobs(+param(req, "id"));
    res.json(jobList);
  });

  app.post("/api/projects/:id/jobs", requireAuth, async (req: Request, res: Response) => {
    try {
      const body = validate(createJobSchema, req.body, res);
      if (!body) return;
      const job = await storage.createJob({ projectId: +param(req, "id"), ...body });
      res.json(job);
    } catch (e: any) {
      console.error("Create job error:", e);
      res.status(500).json({ error: "Failed to create job" });
    }
  });

  app.patch("/api/projects/:id/jobs/:jobId", requireAuth, async (req: Request, res: Response) => {
    try {
      const job = await storage.updateJob(+param(req, "jobId"), req.body);
      res.json(job);
    } catch (e: any) {
      res.status(500).json({ error: safeError("Internal server error", e) });
    }
  });

  app.delete("/api/projects/:id/jobs/:jobId", requireAuth, async (req: Request, res: Response) => {
    try {
      await storage.deleteJob(+param(req, "jobId"));
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: safeError("Internal server error", e) });
    }
  });

  // ---- STATE MACHINE TRANSITIONS (Phase D) ----
  app.post("/api/projects/:id/transition", requireAuth, async (req: Request, res: Response) => {
    try {
      const id = +param(req, "id");
      const { action } = req.body;
      if (!action) return res.status(400).json({ error: "Action is required" });
      const project = await storage.getProject(id);
      if (!project) return res.status(404).json({ error: "Project not found" });
      const newStatus = validateProjectTransition(project.status || "draft", action);
      if (!newStatus) return res.status(400).json({ error: `Invalid transition: cannot '${action}' from '${project.status}'`, validActions: getValidProjectActions(project.status || "draft") });
      const updates: any = { status: newStatus };
      if (newStatus === "completed") updates.completedAt = new Date().toISOString();
      const updated = await storage.updateProject(id, updates);
      await logAudit((req as any).pmUserId, "transition", "project", id, { status: project.status }, { status: newStatus, action }, getClientIp(req));
      // Create notification for state change
      await createNotificationV2((req as any).pmUserId, "project_status_change", `Project ${project.projectName} → ${newStatus}`, `Status changed from ${project.status} to ${newStatus}`, `/projects/${id}`);
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ error: safeError("Failed to transition project", e) });
    }
  });

  app.get("/api/projects/:id/valid-actions", requireAuth, async (req: Request, res: Response) => {
    const project = await storage.getProject(+param(req, "id"));
    if (!project) return res.status(404).json({ error: "Project not found" });
    res.json({ actions: getValidProjectActions(project.status || "draft") });
  });

  app.post("/api/projects/:projectId/jobs/:jobId/transition", requireAuth, async (req: Request, res: Response) => {
    try {
      const jobId = +param(req, "jobId");
      const { action } = req.body;
      if (!action) return res.status(400).json({ error: "Action is required" });
      const jobList = await storage.getJobs(+param(req, "projectId"));
      const job = jobList.find((j: any) => j.id === jobId);
      if (!job) return res.status(404).json({ error: "Job not found" });
      const currentStatus = job.status || "unassigned";
      const newStatus = validateJobTransition(currentStatus, action);
      if (!newStatus) return res.status(400).json({ error: `Invalid transition: cannot '${action}' from '${currentStatus}'`, validActions: getValidJobActions(currentStatus) });
      const updates: any = { status: newStatus };
      if (newStatus === "delivered") updates.deliveredAt = new Date().toISOString();
      if (newStatus === "approved") updates.approvedAt = new Date().toISOString();
      const updated = await storage.updateJob(jobId, updates);
      await logAudit((req as any).pmUserId, "transition", "job", jobId, { status: currentStatus }, { status: newStatus, action }, getClientIp(req));
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ error: safeError("Failed to transition job", e) });
    }
  });

  // ---- PORTAL TASKS (Phase A) ----
  app.get("/api/portal-tasks", requireAuth, async (req: Request, res: Response) => {
    try {
      const { status, portal, page, limit } = req.query;
      const pageNum = page ? +page : 1;
      const limitNum = limit ? +limit : 50;
      const offset = (pageNum - 1) * limitNum;
      let query = db.select().from(portalTasksTable).orderBy(desc(portalTasksTable.createdAt));
      const conditions: any[] = [];
      if (status) conditions.push(eq(portalTasksTable.status, status as string));
      if (portal) conditions.push(eq(portalTasksTable.portalSource, portal as string));
      if (conditions.length > 0) query = query.where(and(...conditions)) as any;
      const tasks = await (query as any).limit(limitNum).offset(offset);
      const [countResult] = await db.select({ cnt: sql<number>`count(*)::int` }).from(portalTasksTable).where(conditions.length > 0 ? and(...conditions) : undefined);
      res.json({ data: tasks, total: countResult?.cnt || 0, page: pageNum, limit: limitNum });
    } catch (e: any) {
      res.status(500).json({ error: safeError("Failed to list portal tasks", e) });
    }
  });

  app.get("/api/portal-tasks/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const [task] = await db.select().from(portalTasksTable).where(eq(portalTasksTable.id, +param(req, "id")));
      if (!task) return res.status(404).json({ error: "Portal task not found" });
      res.json(task);
    } catch (e: any) {
      res.status(500).json({ error: safeError("Failed to get portal task", e) });
    }
  });

  app.post("/api/portal-tasks/:id/accept", requireAuth, async (req: Request, res: Response) => {
    try {
      const taskId = +param(req, "id");
      const pmUserId = (req as any).pmUserId;

      // Atomic status guard: only one request can claim a pending task
      const [claimed] = await db.update(portalTasksTable)
        .set({ status: "processing", acceptedBy: pmUserId, processedAt: new Date() })
        .where(and(eq(portalTasksTable.id, taskId), eq(portalTasksTable.status, "pending")))
        .returning();
      if (!claimed) {
        // Either not found or already processed
        const [task] = await db.select().from(portalTasksTable).where(eq(portalTasksTable.id, taskId));
        if (!task) return res.status(404).json({ error: "Portal task not found" });
        return res.status(400).json({ error: `Task already processed (status: ${task.status})` });
      }

      const task = claimed;
      const taskData = task.taskData as any;

      try {
        // Find or match customer
        let customerId = req.body.customerId;
        if (!customerId) {
          const portalName = task.portalSource;
          const [cust] = await db.select().from(customers).where(sql`LOWER(${customers.name}) = LOWER(${portalName})`);
          if (cust) customerId = cust.id;
          else {
            const newCust = await storage.createCustomer({ name: portalName, code: portalName.toUpperCase().slice(0, 10), status: "ACTIVE" } as any);
            customerId = newCust.id;
          }
        }
        // Create project with MAX-based sequence
        const year = new Date().getFullYear();
        const prefix = task.portalSource.toUpperCase().slice(0, 3);
        const projectCode = await getNextSequenceNumber(projects, prefix, year, projects.projectCode);
        const project = await storage.createProject({
          projectName: taskData.projectName || taskData.name || `${task.portalSource} - ${task.externalId}`,
          customerId,
          source: task.portalSource,
          externalId: task.externalId,
          externalUrl: task.externalUrl || undefined,
          status: "confirmed",
          projectCode,
          metadata: task.taskData,
          deadline: taskData.deadline || undefined,
          notes: taskData.instructions || undefined,
        } as any);
        // Create jobs from target languages
        const targetLanguages = taskData.targetLanguages || taskData.target_languages || [];
        const sourceLanguage = taskData.sourceLanguage || taskData.source_language || "";
        if (Array.isArray(targetLanguages) && targetLanguages.length > 0) {
          for (let i = 0; i < targetLanguages.length; i++) {
            await storage.createJob({
              projectId: project.id,
              jobCode: `J${String(i + 1).padStart(3, "0")}`,
              jobName: `${sourceLanguage} → ${targetLanguages[i]}`,
              sourceLanguage,
              targetLanguage: targetLanguages[i],
              serviceType: taskData.serviceType || taskData.service_type || "translation",
              wordCount: taskData.wordCount || taskData.word_count || null,
              unitType: "words",
              unitCount: String(taskData.wordCount || taskData.word_count || 0),
              status: "unassigned",
              deadline: taskData.deadline || undefined,
            } as any);
          }
        } else {
          await storage.createJob({
            projectId: project.id,
            jobCode: "J001",
            jobName: taskData.projectName || taskData.name || `Job for ${task.externalId}`,
            sourceLanguage,
            targetLanguage: taskData.targetLanguage || taskData.target_language || "",
            serviceType: taskData.serviceType || taskData.service_type || "translation",
            wordCount: taskData.wordCount || taskData.word_count || null,
            unitType: "words",
            unitCount: String(taskData.wordCount || taskData.word_count || 0),
            status: "unassigned",
          } as any);
        }
        // Finalize portal task status
        await db.update(portalTasksTable).set({
          status: "manually_accepted",
          projectId: project.id,
          acceptedAt: new Date(),
        }).where(eq(portalTasksTable.id, taskId));
        await logAudit(pmUserId, "accept_portal_task", "portal_task", taskId, { status: "pending" }, { status: "manually_accepted", projectId: project.id }, getClientIp(req));
        await createNotificationV2(pmUserId, "task_accepted", `Portal task accepted`, `${task.portalSource} task ${task.externalId} accepted and project created`, `/projects/${project.id}`);
        res.json({ success: true, project });
      } catch (innerErr) {
        // Rollback portal task status to pending on failure
        await db.update(portalTasksTable).set({ status: "pending", acceptedBy: null, processedAt: null }).where(eq(portalTasksTable.id, taskId));
        throw innerErr;
      }
    } catch (e: any) {
      console.error("Accept portal task error:", e);
      res.status(500).json({ error: safeError("Failed to accept portal task", e) });
    }
  });

  app.post("/api/portal-tasks/:id/reject", requireAuth, async (req: Request, res: Response) => {
    try {
      const taskId = +param(req, "id");
      const { reason } = req.body;
      const [task] = await db.select().from(portalTasksTable).where(eq(portalTasksTable.id, taskId));
      if (!task) return res.status(404).json({ error: "Portal task not found" });
      if (task.status !== "pending") return res.status(400).json({ error: `Task already processed (status: ${task.status})` });
      await db.update(portalTasksTable).set({
        status: "rejected",
        rejectionReason: reason || null,
        processedAt: new Date(),
      }).where(eq(portalTasksTable.id, taskId));
      await logAudit((req as any).pmUserId, "reject_portal_task", "portal_task", taskId, { status: "pending" }, { status: "rejected", reason }, getClientIp(req));
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: safeError("Failed to reject portal task", e) });
    }
  });

  // ---- JOB ASSIGNMENT + VENDOR (Phase B) ----
  app.post("/api/projects/:projectId/jobs/:jobId/assign", requireAuth, async (req: Request, res: Response) => {
    try {
      const jobId = +param(req, "jobId");
      const { vendorId } = req.body;
      if (!vendorId) return res.status(400).json({ error: "vendorId is required" });
      const pmUserId = (req as any).pmUserId;
      // Look up vendor rate card
      let vendorRate = null;
      const jobList = await storage.getJobs(+param(req, "projectId"));
      const job = jobList.find((j: any) => j.id === jobId);
      if (job) {
        const rateCards = await db.select().from(vendorRateCards).where(
          and(eq(vendorRateCards.vendorId, vendorId),
            job.sourceLanguage ? eq(vendorRateCards.sourceLanguage, job.sourceLanguage) : undefined,
            job.targetLanguage ? eq(vendorRateCards.targetLanguage, job.targetLanguage) : undefined,
          )
        );
        if (rateCards.length > 0) vendorRate = rateCards[0].rateValue;
      }
      const updates: any = {
        vendorId,
        status: "assigned",
        assignedAt: new Date().toISOString(),
        assignedBy: pmUserId,
      };
      if (vendorRate) updates.vendorRate = vendorRate;
      const updated = await storage.updateJob(jobId, updates);
      await logAudit(pmUserId, "assign_vendor", "job", jobId, null, { vendorId }, getClientIp(req));
      // Auto-generate PO if settings allow (Phase C)
      try { await autoGeneratePO(jobId, +param(req, "projectId"), vendorId); } catch (e) { console.error("Auto PO error:", e); }
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ error: safeError("Failed to assign vendor", e) });
    }
  });

  app.post("/api/projects/:projectId/jobs/:jobId/unassign", requireAuth, async (req: Request, res: Response) => {
    try {
      const jobId = +param(req, "jobId");
      const updated = await storage.updateJob(jobId, { vendorId: null, status: "unassigned", assignedAt: null, assignedBy: null, vendorRate: null } as any);
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ error: safeError("Failed to unassign vendor", e) });
    }
  });

  app.post("/api/projects/:projectId/jobs/batch", requireAuth, async (req: Request, res: Response) => {
    try {
      const projectId = +param(req, "projectId");
      const { jobs: jobsData } = req.body;
      if (!Array.isArray(jobsData) || jobsData.length === 0) return res.status(400).json({ error: "jobs array is required" });
      const created = [];
      for (let i = 0; i < jobsData.length; i++) {
        const job = await storage.createJob({
          projectId,
          jobCode: `J${String(i + 1).padStart(3, "0")}`,
          status: "unassigned",
          ...jobsData[i],
        } as any);
        created.push(job);
      }
      res.json(created);
    } catch (e: any) {
      res.status(500).json({ error: safeError("Failed to batch create jobs", e) });
    }
  });

  // ---- AUTO-PO / AUTO-INVOICE (Phase C) ----

  // Atomic sequence number generation using MAX to avoid count-based race conditions
  async function getNextSequenceNumber(table: typeof purchaseOrders | typeof clientInvoices, prefix: string, year: number, numberCol: any): Promise<string> {
    const pattern = `${prefix}-${year}-%`;
    const [result] = await db.select({
      maxNum: sql<string>`MAX(${numberCol})`,
    }).from(table).where(sql`${numberCol} LIKE ${pattern}`);
    let seq = 1;
    if (result?.maxNum) {
      // Extract the trailing sequence number after the last dash
      const parts = result.maxNum.split("-");
      const lastPart = parts[parts.length - 1];
      const parsed = parseInt(lastPart, 10);
      if (!isNaN(parsed)) seq = parsed + 1;
    }
    return `${prefix}-${year}-${String(seq).padStart(4, "0")}`;
  }

  async function autoGeneratePO(jobId: number, projectId: number, vendorId: number) {
    const jobList = await storage.getJobs(projectId);
    const job = jobList.find((j: any) => j.id === jobId);
    if (!job) return;
    // Skip if job already has a PO
    if (job.poId) return;
    const project = await storage.getProject(projectId);
    if (!project) return;
    // Look up rate — prefer most specific match (with both source + target language)
    const rateCards = await db.select().from(vendorRateCards).where(
      and(eq(vendorRateCards.vendorId, vendorId),
        job.sourceLanguage ? eq(vendorRateCards.sourceLanguage, job.sourceLanguage) : undefined,
        job.targetLanguage ? eq(vendorRateCards.targetLanguage, job.targetLanguage) : undefined,
      )
    ).orderBy(desc(vendorRateCards.createdAt));
    const rate = rateCards.length > 0 ? parseFloat(rateCards[0].rateValue) : 0;
    const units = parseFloat(job.unitCount || "0") || parseInt(String(job.wordCount || 0)) || 0;
    // Round financial amount to 2 decimal places
    const amount = Math.round(rate * units * 100) / 100;
    if (amount <= 0) return;
    // Generate PO number using MAX-based sequence
    const year = new Date().getFullYear();
    const entityCode = project.entityId ? (await db.select().from(entities).where(eq(entities.id, project.entityId)))?.[0]?.code?.toUpperCase() || "VRB" : "VRB";
    const poNumber = await getNextSequenceNumber(purchaseOrders, `${entityCode}-PO`, year, purchaseOrders.poNumber);
    const po = await storage.createPurchaseOrder({
      vendorId,
      entityId: project.entityId || undefined,
      projectId,
      jobId,
      poNumber,
      amount: String(amount),
      currency: project.currency || "EUR",
      status: "draft",
    } as any);
    // Link PO to job
    await storage.updateJob(jobId, { poId: po.id, vendorRate: String(rate), vendorTotal: String(amount) } as any);
    // Create PO line item
    await db.insert(poLineItems).values({
      purchaseOrderId: po.id,
      description: `${job.sourceLanguage} → ${job.targetLanguage} ${job.serviceType || "translation"}`,
      quantity: String(units),
      unit: job.unitType || "words",
      unitPrice: String(rate),
      amount: String(amount),
    });
    return po;
  }

  app.post("/api/jobs/:jobId/generate-po", requireAuth, async (req: Request, res: Response) => {
    try {
      const jobId = +param(req, "jobId");
      // Find the job's project and vendor
      const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId));
      if (!job) return res.status(404).json({ error: "Job not found" });
      if (!job.vendorId) return res.status(400).json({ error: "Job has no vendor assigned" });
      const po = await autoGeneratePO(jobId, job.projectId, job.vendorId);
      res.json({ success: true, po });
    } catch (e: any) {
      res.status(500).json({ error: safeError("Failed to generate PO", e) });
    }
  });

  app.post("/api/projects/:projectId/generate-invoice", requireAuth, async (req: Request, res: Response) => {
    try {
      const projectId = +param(req, "projectId");
      const project = await storage.getProject(projectId);
      if (!project) return res.status(404).json({ error: "Project not found" });
      const jobList = await storage.getJobs(projectId);
      // Calculate totals from jobs
      let subtotal = 0;
      const lines: any[] = [];
      for (const job of jobList) {
        // Look up client rate
        const clientRateCards = await db.select().from(customerRateCards).where(
          and(eq(customerRateCards.customerId, project.customerId),
            job.sourceLanguage ? eq(customerRateCards.sourceLanguage, job.sourceLanguage) : undefined,
            job.targetLanguage ? eq(customerRateCards.targetLanguage, job.targetLanguage) : undefined,
          )
        );
        const rate = clientRateCards.length > 0 ? parseFloat(clientRateCards[0].rateValue) : parseFloat(job.clientRate || job.unitRate || "0") || 0;
        const units = parseFloat(job.unitCount || "0") || parseInt(String(job.wordCount || 0)) || 0;
        // Round financial amount to 2 decimal places
        const amount = Math.round(rate * units * 100) / 100;
        subtotal += amount;
        lines.push({
          projectId,
          jobId: job.id,
          description: `${job.sourceLanguage} → ${job.targetLanguage} ${job.serviceType || "translation"}`,
          quantity: String(units),
          unit: job.unitType || "words",
          unitPrice: String(rate),
          amount: String(amount),
        });
        // Update job with client rate
        await storage.updateJob(job.id, { clientRate: String(rate), clientTotal: String(amount) } as any);
      }
      // Round subtotal to 2 decimal places
      subtotal = Math.round(subtotal * 100) / 100;
      // Generate invoice number using MAX-based sequence
      const year = new Date().getFullYear();
      const entityCode = project.entityId ? (await db.select().from(entities).where(eq(entities.id, project.entityId)))?.[0]?.code?.toUpperCase() || "VRB" : "VRB";
      const invoiceNumber = await getNextSequenceNumber(clientInvoices, `${entityCode}-INV`, year, clientInvoices.invoiceNumber);
      const invoice = await storage.createInvoice({
        customerId: project.customerId,
        entityId: project.entityId || undefined,
        invoiceNumber,
        invoiceDate: new Date().toISOString().split("T")[0],
        subtotal: String(subtotal),
        total: String(subtotal),
        currency: project.currency || "EUR",
        status: "draft",
      } as any);
      // Create line items
      for (const line of lines) {
        await db.insert(clientInvoiceLines).values({ invoiceId: invoice.id, ...line });
      }
      // Update jobs with invoice reference
      for (const job of jobList) {
        await storage.updateJob(job.id, { invoiceId: invoice.id } as any);
      }
      await logAudit((req as any).pmUserId, "auto_generate_invoice", "invoice", invoice.id, null, { projectId, subtotal }, getClientIp(req));
      await createNotificationV2((req as any).pmUserId, "invoice_generated", `Invoice ${invoiceNumber} generated`, `Auto-generated invoice for project`, `/invoices`);
      res.json({ success: true, invoice });
    } catch (e: any) {
      res.status(500).json({ error: safeError("Failed to generate invoice", e) });
    }
  });

  // ---- NOTIFICATIONS V2 (Phase F) ----
  async function createNotificationV2(pmUserId: number, type: string, title: string, message: string, link?: string) {
    try {
      await db.insert(notificationsV2).values({ pmUserId, type, title, message, link });
      wsBroadcast({ event: "notification", type, title, message });
    } catch (e) { console.error("Notification create error:", e); }
  }

  app.get("/api/notifications-v2", requireAuth, async (req: Request, res: Response) => {
    try {
      const pmUserId = (req as any).pmUserId;
      const nots = await db.select().from(notificationsV2).where(eq(notificationsV2.pmUserId, pmUserId)).orderBy(desc(notificationsV2.createdAt)).limit(50);
      const [unreadResult] = await db.select({ cnt: sql<number>`count(*)::int` }).from(notificationsV2).where(and(eq(notificationsV2.pmUserId, pmUserId), eq(notificationsV2.read, false)));
      res.json({ notifications: nots, unreadCount: unreadResult?.cnt || 0 });
    } catch (e: any) {
      res.status(500).json({ error: safeError("Failed to get notifications", e) });
    }
  });

  app.patch("/api/notifications-v2/:id/read", requireAuth, async (req: Request, res: Response) => {
    try {
      await db.update(notificationsV2).set({ read: true }).where(eq(notificationsV2.id, +param(req, "id")));
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: safeError("Failed to mark notification read", e) });
    }
  });

  app.post("/api/notifications-v2/read-all", requireAuth, async (req: Request, res: Response) => {
    try {
      const pmUserId = (req as any).pmUserId;
      await db.update(notificationsV2).set({ read: true }).where(and(eq(notificationsV2.pmUserId, pmUserId), eq(notificationsV2.read, false)));
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: safeError("Failed to mark all read", e) });
    }
  });

  app.delete("/api/notifications-v2/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      await db.update(notificationsV2).set({ read: true }).where(eq(notificationsV2.id, +param(req, "id")));
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: safeError("Failed to dismiss notification", e) });
    }
  });

  // ---- PM ASSIGNMENTS (Phase E) ----
  app.get("/api/pm-assignments", requireAuth, async (req: Request, res: Response) => {
    try {
      const rows = await db.select().from(pmCustomerAssignments).orderBy(desc(pmCustomerAssignments.createdAt));
      res.json(rows);
    } catch (e: any) {
      res.status(500).json({ error: safeError("Failed to get PM assignments", e) });
    }
  });

  app.post("/api/pm-assignments", requireAuth, async (req: Request, res: Response) => {
    try {
      const { userId, customerId, subAccountId, isPrimary, assignmentType } = req.body;
      if (!userId || !customerId) return res.status(400).json({ error: "userId and customerId are required" });
      const [existing] = await db.select().from(pmCustomerAssignments).where(
        and(eq(pmCustomerAssignments.userId, userId), eq(pmCustomerAssignments.customerId, customerId))
      );
      if (existing) {
        const updated = await db.update(pmCustomerAssignments).set({ isPrimary, assignmentType }).where(eq(pmCustomerAssignments.id, existing.id)).returning();
        return res.json(updated[0]);
      }
      const [created] = await db.insert(pmCustomerAssignments).values({ userId, customerId, subAccountId, isPrimary: isPrimary ?? true, assignmentType: assignmentType || "primary" }).returning();
      res.json(created);
    } catch (e: any) {
      res.status(500).json({ error: safeError("Failed to create PM assignment", e) });
    }
  });

  app.delete("/api/pm-assignments/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      await db.delete(pmCustomerAssignments).where(eq(pmCustomerAssignments.id, +param(req, "id")));
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: safeError("Failed to delete PM assignment", e) });
    }
  });

  // ---- QUALITY REPORTS ----
  app.get("/api/quality-reports", requireAuth, async (req: Request, res: Response) => {
    const vendorId = req.query.vendorId ? +req.query.vendorId : undefined;
    const reports = await storage.getQualityReports(vendorId);
    res.json(reports);
  });

  app.post("/api/quality-reports", requireAuth, async (req: Request, res: Response) => {
    try {
      const body = validate(createQualityReportSchema, req.body, res);
      if (!body) return;
      const report = await storage.createQualityReport(body);
      await logAudit((req as any).pmUserId, "create", "quality_report", report.id, null, report, getClientIp(req));
      if (report.vendorId && (report.qsScore != null || report.lqaScore != null)) {
        await recalculateVendorQualityScores(report.vendorId);
      }
      res.json(report);
    } catch (e: any) {
      console.error("Create quality report error:", e);
      res.status(500).json({ error: "Failed to create quality report" });
    }
  });

  app.patch("/api/quality-reports/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const id = +param(req, "id");
      const oldReport = await storage.getQualityReport(id);
      const report = await storage.updateQualityReport(id, req.body);
      await logAudit((req as any).pmUserId, "update", "quality_report", id, oldReport, report, getClientIp(req));
      if (report.vendorId && (req.body.qsScore !== undefined || req.body.lqaScore !== undefined)) {
        await recalculateVendorQualityScores(report.vendorId);
      }
      res.json(report);
    } catch (e: any) {
      console.error("Update quality report error:", e);
      res.status(500).json({ error: "Failed to update quality report" });
    }
  });

  // Submit quality report for translator review
  app.post("/api/quality-reports/:id/submit", requireAuth, async (req: Request, res: Response) => {
    try {
      const id = +param(req, "id");
      const [existing] = await db.select().from(qualityReports).where(eq(qualityReports.id, id));
      if (!existing) return res.status(404).json({ error: "Quality report not found" });
      if (existing.status !== "draft") {
        return res.status(400).json({ error: `Cannot submit a report with status '${existing.status}'. Only draft reports can be submitted.` });
      }
      const report = await storage.updateQualityReport(id, {
        status: "submitted",
        submissionDate: new Date(),
        reviewDeadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      });
      await logAudit((req as any).pmUserId, "submit", "quality_report", id, existing, report, getClientIp(req));
      if (existing.vendorId) {
        await recalculateVendorQualityScores(existing.vendorId);
      }
      res.json(report);
    } catch (e: any) {
      console.error("Submit quality report error:", e);
      res.status(500).json({ error: "Failed to submit quality report" });
    }
  });

  // Dispute quality report (vendor/translator action)
  app.post("/api/quality-reports/:id/dispute", requireAuth, async (req: Request, res: Response) => {
    try {
      const id = +param(req, "id");
      const [existing] = await db.select().from(qualityReports).where(eq(qualityReports.id, id));
      if (!existing) return res.status(404).json({ error: "Quality report not found" });
      if (existing.status !== "submitted" && existing.status !== "pending_translator_review") {
        return res.status(400).json({ error: `Cannot dispute a report with status '${existing.status}'.` });
      }
      const { translatorComments } = req.body;
      const report = await storage.updateQualityReport(id, {
        status: "translator_disputed",
        translatorComments: translatorComments || null,
      });
      await logAudit((req as any).pmUserId, "dispute", "quality_report", id, existing, report, getClientIp(req));
      res.json(report);
    } catch (e: any) {
      console.error("Dispute quality report error:", e);
      res.status(500).json({ error: "Failed to dispute quality report" });
    }
  });

  // ---- PURCHASE ORDERS ----
  app.get("/api/purchase-orders", requireAuth, async (req: Request, res: Response) => {
    try {
      const filters: any = {};
      if (req.query.vendorId) filters.vendorId = +req.query.vendorId;
      if (req.query.entityId) filters.entityId = +req.query.entityId;
      if (req.query.status) filters.status = req.query.status;
      if (req.query.page) filters.page = +req.query.page;
      if (req.query.limit) filters.limit = +req.query.limit;
      const [data, total] = await Promise.all([
        storage.getPurchaseOrders(filters),
        storage.getPurchaseOrderCount(filters),
      ]);
      res.json({ data, total, page: filters.page || 1, limit: filters.limit || 50 });
    } catch (e: any) {
      res.status(500).json({ error: safeError("Internal server error", e) });
    }
  });

  app.post("/api/purchase-orders", requireAuth, async (req: Request, res: Response) => {
    try {
      const body = validate(createPurchaseOrderSchema, req.body, res);
      if (!body) return;
      const data: any = { ...body };
      // Auto-generate PO number if not provided
      if (!data.poNumber && data.entityId) {
        const entity = await storage.getEntity(data.entityId);
        if (entity) {
          const year = new Date().getFullYear();
          data.poNumber = await storage.getNextPoNumber(entity.code, year);
        }
      }
      const order = await storage.createPurchaseOrder(data);
      await logAudit((req as any).pmUserId, "create", "purchase_order", order.id, null, order, getClientIp(req));
      res.status(201).json(order);
    } catch (e: any) {
      console.error("Create purchase order error:", e);
      res.status(500).json({ error: "Failed to create purchase order" });
    }
  });

  app.patch("/api/purchase-orders/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const id = +param(req, "id");
      const oldOrder = await storage.getPurchaseOrder(id);
      const order = await storage.updatePurchaseOrder(id, req.body);
      await logAudit((req as any).pmUserId, "update", "purchase_order", id, oldOrder, order, getClientIp(req));
      res.json(order);
    } catch (e: any) {
      res.status(500).json({ error: safeError("Internal server error", e) });
    }
  });

  // ---- CLIENT INVOICES ----
  app.get("/api/invoices", requireAuth, async (req: Request, res: Response) => {
    try {
      const filters: any = {};
      if (req.query.customerId) filters.customerId = +req.query.customerId;
      if (req.query.entityId) filters.entityId = +req.query.entityId;
      if (req.query.status) filters.status = req.query.status;
      if (req.query.page) filters.page = +req.query.page;
      if (req.query.limit) filters.limit = +req.query.limit;
      const [data, total] = await Promise.all([
        storage.getInvoices(filters),
        storage.getInvoiceCount(filters),
      ]);
      res.json({ data, total, page: filters.page || 1, limit: filters.limit || 50 });
    } catch (e: any) {
      res.status(500).json({ error: safeError("Internal server error", e) });
    }
  });

  // IMPORTANT: specific sub-routes must be registered BEFORE the parametric /:id route
  app.get("/api/invoices/uninvoiced-jobs", requireAuth, async (req: Request, res: Response) => {
    try {
      const customerId = req.query.customerId ? +req.query.customerId : undefined;
      const data = await storage.getUninvoicedJobs(customerId);
      res.json(data);
    } catch (e: any) {
      res.status(500).json({ error: safeError("Internal server error", e) });
    }
  });

  app.get("/api/invoices/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const invoice = await storage.getInvoice(+param(req, "id"));
      if (!invoice) return res.status(404).json({ error: "Invoice not found" });
      const lines = await storage.getInvoiceLines(invoice.id);
      const customer = invoice.customerId ? await storage.getCustomer(invoice.customerId) : null;
      const entity = invoice.entityId ? await storage.getEntity(invoice.entityId) : null;
      res.json({ ...invoice, lines, customer, entity });
    } catch (e: any) {
      res.status(500).json({ error: safeError("Internal server error", e) });
    }
  });

  app.post("/api/invoices", requireAuth, async (req: Request, res: Response) => {
    try {
      const body = validate(createInvoiceSchema, req.body, res);
      if (!body) return;
      const { lines, ...invoiceData } = body as any;
      // Auto-generate invoice number if not provided
      if (!invoiceData.invoiceNumber && invoiceData.entityId) {
        const entity = await storage.getEntity(invoiceData.entityId);
        if (entity) {
          const year = new Date().getFullYear();
          invoiceData.invoiceNumber = await storage.getNextInvoiceNumber(entity.code, year);
        }
      }
      // Calculate totals from lines
      if (lines && lines.length > 0) {
        const subtotal = lines.reduce((sum: number, l: any) => sum + (parseFloat(l.amount) || 0), 0);
        invoiceData.subtotal = String(subtotal);
        invoiceData.taxAmount = invoiceData.taxAmount || "0";
        invoiceData.total = String(subtotal + parseFloat(invoiceData.taxAmount || "0"));
      }
      const invoice = await storage.createInvoice(invoiceData);
      // Create line items
      if (lines && lines.length > 0) {
        for (const line of lines) {
          await storage.createInvoiceLine({ ...line, invoiceId: invoice.id });
        }
      }
      const createdLines = await storage.getInvoiceLines(invoice.id);
      await logAudit((req as any).pmUserId, "create", "invoice", invoice.id, null, { ...invoice, lines: createdLines }, getClientIp(req));
      res.status(201).json({ ...invoice, lines: createdLines });
    } catch (e: any) {
      console.error("Create invoice error:", e);
      res.status(500).json({ error: "Failed to create invoice" });
    }
  });

  app.patch("/api/invoices/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const id = +param(req, "id");
      const oldInvoice = await storage.getInvoice(id);
      const { lines, ...updateData } = req.body;
      const invoice = await storage.updateInvoice(id, updateData);
      if (lines) {
        await storage.deleteInvoiceLines(invoice!.id);
        for (const line of lines) {
          await storage.createInvoiceLine({ ...line, invoiceId: invoice!.id });
        }
      }
      await logAudit((req as any).pmUserId, "update", "invoice", id, oldInvoice, invoice, getClientIp(req));
      res.json(invoice);
    } catch (e: any) {
      res.status(500).json({ error: safeError("Internal server error", e) });
    }
  });

  app.post("/api/invoices/:id/send", requireAuth, async (req: Request, res: Response) => {
    try {
      const invoice = await storage.updateInvoice(+param(req, "id"), { status: "sent" });
      res.json(invoice);
    } catch (e: any) {
      res.status(500).json({ error: safeError("Internal server error", e) });
    }
  });

  app.post("/api/invoices/:id/mark-paid", requireAuth, async (req: Request, res: Response) => {
    try {
      const { paymentDate, paymentMethod, reference } = req.body;
      const invoice = await storage.updateInvoice(+param(req, "id"), {
        status: "paid",
        paymentReceivedDate: paymentDate || new Date().toISOString().split("T")[0],
      });
      // Record payment
      if (invoice) {
        await storage.createPayment({
          type: "receivable",
          invoiceId: invoice.id,
          amount: invoice.total,
          currency: invoice.currency,
          paymentDate: paymentDate || new Date().toISOString().split("T")[0],
          paymentMethod: paymentMethod || null,
          reference: reference || null,
        });
      }
      res.json(invoice);
    } catch (e: any) {
      res.status(500).json({ error: safeError("Internal server error", e) });
    }
  });

  // ---- ENHANCED PURCHASE ORDERS ----
  app.get("/api/purchase-orders/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const po = await storage.getPurchaseOrder(+param(req, "id"));
      if (!po) return res.status(404).json({ error: "PO not found" });
      const vendor = po.vendorId ? await storage.getVendor(po.vendorId) : null;
      const entity = po.entityId ? await storage.getEntity(po.entityId) : null;
      res.json({ ...po, vendor, entity });
    } catch (e: any) {
      res.status(500).json({ error: safeError("Internal server error", e) });
    }
  });

  app.post("/api/purchase-orders/:id/send", requireAuth, async (req: Request, res: Response) => {
    try {
      const po = await storage.updatePurchaseOrder(+param(req, "id"), { status: "sent" });
      await logAudit((req as any).pmUserId, "update", "purchase_order", +param(req, "id"), null, po, getClientIp(req));
      res.json(po);
    } catch (e: any) {
      res.status(500).json({ error: safeError("Internal server error", e) });
    }
  });

  app.post("/api/purchase-orders/:id/accept", requireAuth, async (req: Request, res: Response) => {
    try {
      const po = await storage.updatePurchaseOrder(+param(req, "id"), { status: "accepted" });
      await logAudit((req as any).pmUserId, "update", "purchase_order", +param(req, "id"), null, po, getClientIp(req));
      res.json(po);
    } catch (e: any) {
      res.status(500).json({ error: safeError("Internal server error", e) });
    }
  });

  app.post("/api/purchase-orders/:id/mark-paid", requireAuth, async (req: Request, res: Response) => {
    try {
      const { paymentDate, paymentMethod, reference } = req.body;
      const po = await storage.updatePurchaseOrder(+param(req, "id"), {
        status: "paid",
        paymentDate: paymentDate || new Date().toISOString().split("T")[0],
        paymentMethod: paymentMethod || null,
      });
      // Record payment
      if (po) {
        await storage.createPayment({
          type: "payable",
          purchaseOrderId: po.id,
          amount: po.amount,
          currency: po.currency,
          paymentDate: paymentDate || new Date().toISOString().split("T")[0],
          paymentMethod: paymentMethod || null,
          reference: reference || null,
        });
      }
      res.json(po);
    } catch (e: any) {
      res.status(500).json({ error: safeError("Internal server error", e) });
    }
  });

  // ---- PAYMENTS ----
  app.get("/api/payments", requireAuth, async (req: Request, res: Response) => {
    try {
      const filters: any = {};
      if (req.query.invoiceId) filters.invoiceId = +req.query.invoiceId;
      if (req.query.purchaseOrderId) filters.purchaseOrderId = +req.query.purchaseOrderId;
      if (req.query.type) filters.type = req.query.type;
      const data = await storage.getPayments(filters);
      res.json(data);
    } catch (e: any) {
      res.status(500).json({ error: safeError("Internal server error", e) });
    }
  });

  app.post("/api/payments", requireAuth, async (req: Request, res: Response) => {
    try {
      const body = validate(createPaymentSchema, req.body, res);
      if (!body) return;
      const payment = await storage.createPayment(body);
      res.status(201).json(payment);
    } catch (e: any) {
      console.error("Create payment error:", e);
      res.status(500).json({ error: "Failed to create payment" });
    }
  });

  // ---- FINANCIAL DASHBOARD ----
  const requireFinanceRole = requireRole("gm", "operations_manager", "pm_team_lead", "admin");
  app.get("/api/financial/summary", requireAuth, requireFinanceRole, async (req: Request, res: Response) => {
    try {
      const filters: any = {};
      if (req.query.entityId) filters.entityId = +req.query.entityId;
      if (req.query.startDate) filters.startDate = req.query.startDate;
      if (req.query.endDate) filters.endDate = req.query.endDate;
      const summary = await storage.getFinancialSummary(filters);
      res.json(summary);
    } catch (e: any) {
      res.status(500).json({ error: safeError("Internal server error", e) });
    }
  });

  app.get("/api/financial/ar-aging", requireAuth, requireFinanceRole, async (req: Request, res: Response) => {
    try {
      const entityId = req.query.entityId ? +req.query.entityId : undefined;
      const aging = await storage.getARAgingReport(entityId);
      res.json(aging);
    } catch (e: any) {
      res.status(500).json({ error: safeError("Internal server error", e) });
    }
  });

  app.get("/api/financial/revenue-by-customer", requireAuth, requireFinanceRole, async (req: Request, res: Response) => {
    try {
      const entityId = req.query.entityId ? +req.query.entityId : undefined;
      const limit = req.query.limit ? +req.query.limit : 10;
      const data = await storage.getRevenueByCustomer(limit, entityId);
      res.json(data);
    } catch (e: any) {
      res.status(500).json({ error: safeError("Internal server error", e) });
    }
  });

  app.get("/api/financial/cost-by-vendor", requireAuth, requireFinanceRole, async (req: Request, res: Response) => {
    try {
      const entityId = req.query.entityId ? +req.query.entityId : undefined;
      const limit = req.query.limit ? +req.query.limit : 10;
      const data = await storage.getCostByVendor(limit, entityId);
      res.json(data);
    } catch (e: any) {
      res.status(500).json({ error: safeError("Internal server error", e) });
    }
  });

  app.get("/api/financial/monthly-trend", requireAuth, requireFinanceRole, async (req: Request, res: Response) => {
    try {
      const entityId = req.query.entityId ? +req.query.entityId : undefined;
      const months = req.query.months ? +req.query.months : 12;
      const data = await storage.getMonthlyTrend(months, entityId);
      res.json(data);
    } catch (e: any) {
      res.status(500).json({ error: safeError("Internal server error", e) });
    }
  });

  app.get("/api/financial/revenue-by-entity", requireAuth, requireFinanceRole, async (_req: Request, res: Response) => {
    try {
      const data = await storage.getRevenueByEntity();
      res.json(data);
    } catch (e: any) {
      res.status(500).json({ error: safeError("Internal server error", e) });
    }
  });

  app.get("/api/financial/ap-aging", requireAuth, requireFinanceRole, async (req: Request, res: Response) => {
    try {
      const entityId = req.query.entityId ? +req.query.entityId : undefined;
      const aging = await storage.getAPAgingReport(entityId);
      res.json(aging);
    } catch (e: any) {
      res.status(500).json({ error: safeError("Internal server error", e) });
    }
  });

  app.get("/api/payments/cash-flow", requireAuth, requireFinanceRole, async (req: Request, res: Response) => {
    try {
      const months = req.query.months ? +req.query.months : 12;
      const entityId = req.query.entityId ? +req.query.entityId : undefined;
      const data = await storage.getCashFlow(months, entityId);
      res.json(data);
    } catch (e: any) {
      res.status(500).json({ error: safeError("Internal server error", e) });
    }
  });

  app.get("/api/financial/pnl", requireAuth, requireFinanceRole, async (req: Request, res: Response) => {
    try {
      const filters: any = {};
      if (req.query.entityId) filters.entityId = +req.query.entityId;
      if (req.query.startDate) filters.startDate = req.query.startDate;
      if (req.query.endDate) filters.endDate = req.query.endDate;
      const data = await storage.getPnlReport(filters);
      res.json(data);
    } catch (e: any) {
      res.status(500).json({ error: safeError("Internal server error", e) });
    }
  });

  app.get("/api/financial/entity-comparison", requireAuth, requireFinanceRole, async (req: Request, res: Response) => {
    try {
      const startDate = req.query.startDate as string | undefined;
      const endDate = req.query.endDate as string | undefined;
      const data = await storage.getEntityComparison(startDate, endDate);
      res.json(data);
    } catch (e: any) {
      res.status(500).json({ error: safeError("Internal server error", e) });
    }
  });

  app.get("/api/projects/:id/financials", requireAuth, async (req: Request, res: Response) => {
    try {
      const financials = await storage.getProjectFinancials(+param(req, "id"));
      res.json(financials);
    } catch (e: any) {
      res.status(500).json({ error: safeError("Internal server error", e) });
    }
  });

  // NOTE: GET /api/invoices/uninvoiced-jobs is registered before /api/invoices/:id above to prevent route shadowing.

  // ============================================
  // PHASE 6: NEW API ENDPOINTS
  // ============================================

  // ---- ENHANCED PAYMENTS ----
  // Note: /summary and /cash-flow MUST be registered before /:id
  app.get("/api/payments/summary", requireAuth, async (req: Request, res: Response) => {
    try {
      const filters: any = {};
      if (req.query.type) filters.type = req.query.type;
      if (req.query.entityId) filters.entityId = +req.query.entityId;
      if (req.query.startDate) filters.startDate = req.query.startDate;
      if (req.query.endDate) filters.endDate = req.query.endDate;
      const summary = await storage.getPaymentsSummary(filters);
      res.json(summary);
    } catch (e: any) {
      res.status(500).json({ error: safeError("Internal server error", e) });
    }
  });

  app.get("/api/payments/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const payment = await storage.getPayment(+param(req, "id"));
      if (!payment) return res.status(404).json({ error: "Payment not found" });
      res.json(payment);
    } catch (e: any) {
      res.status(500).json({ error: safeError("Internal server error", e) });
    }
  });

  app.delete("/api/payments/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const id = +param(req, "id");
      const payment = await storage.getPayment(id);
      if (!payment) return res.status(404).json({ error: "Payment not found" });
      await storage.deletePayment(id);
      await logAudit((req as any).pmUserId, "delete", "payment", id, payment, null, getClientIp(req));
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: safeError("Internal server error", e) });
    }
  });

  // ---- VENDOR RATE CARDS CRUD ----
  app.post("/api/vendors/:id/rate-cards", requireAuth, async (req: Request, res: Response) => {
    try {
      const vendorId = +param(req, "id");
      const body = validate(createRateCardSchema, req.body, res);
      if (!body) return;
      const rc = await storage.createVendorRateCard({ ...body, vendorId });
      await logAudit((req as any).pmUserId, "create", "vendor_rate_card", rc.id, null, rc, getClientIp(req));
      res.status(201).json(rc);
    } catch (e: any) {
      res.status(500).json({ error: safeError("Failed to create rate card", e) });
    }
  });

  app.patch("/api/vendors/:id/rate-cards/:rcId", requireAuth, async (req: Request, res: Response) => {
    try {
      const rcId = +param(req, "rcId");
      const rc = await storage.updateVendorRateCard(rcId, req.body);
      res.json(rc);
    } catch (e: any) {
      res.status(500).json({ error: safeError("Failed to update rate card", e) });
    }
  });

  app.delete("/api/vendors/:id/rate-cards/:rcId", requireAuth, async (req: Request, res: Response) => {
    try {
      const rcId = +param(req, "rcId");
      await storage.deleteVendorRateCard(rcId);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: safeError("Failed to delete rate card", e) });
    }
  });


  // ---- INVOICE LINE ITEMS CRUD ----
  app.get("/api/invoices/:id/line-items", requireAuth, async (req: Request, res: Response) => {
    try {
      const lines = await storage.getInvoiceLines(+param(req, "id"));
      res.json(lines);
    } catch (e: any) {
      res.status(500).json({ error: safeError("Internal server error", e) });
    }
  });

  app.post("/api/invoices/:id/line-items", requireAuth, async (req: Request, res: Response) => {
    try {
      const invoiceId = +param(req, "id");
      const line = await storage.createInvoiceLine({ ...req.body, invoiceId });
      res.status(201).json(line);
    } catch (e: any) {
      res.status(500).json({ error: safeError("Failed to create line item", e) });
    }
  });

  app.patch("/api/invoices/:id/line-items/:liId", requireAuth, async (req: Request, res: Response) => {
    try {
      const liId = +param(req, "liId");
      const line = await storage.updateInvoiceLine(liId, req.body);
      res.json(line);
    } catch (e: any) {
      res.status(500).json({ error: safeError("Failed to update line item", e) });
    }
  });

  app.delete("/api/invoices/:id/line-items/:liId", requireAuth, async (req: Request, res: Response) => {
    try {
      const liId = +param(req, "liId");
      await storage.deleteInvoiceLine(liId);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: safeError("Failed to delete line item", e) });
    }
  });

  // Invoice recalculate totals from line items
  app.post("/api/invoices/:id/recalculate", requireAuth, async (req: Request, res: Response) => {
    try {
      const id = +param(req, "id");
      const invoice = await storage.getInvoice(id);
      if (!invoice) return res.status(404).json({ error: "Invoice not found" });
      const lines = await storage.getInvoiceLines(id);
      const subtotal = lines.reduce((sum, l) => sum + parseFloat(String(l.amount) || "0"), 0);
      const taxRate = parseFloat(String(invoice.taxRate) || "0");
      const taxAmount = subtotal * (taxRate / 100);
      const total = subtotal + taxAmount;
      const updated = await storage.updateInvoice(id, {
        subtotal: String(subtotal),
        taxAmount: String(taxAmount),
        total: String(total),
      });
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ error: safeError("Failed to recalculate invoice", e) });
    }
  });

  // ---- PO LINE ITEMS CRUD ----
  app.get("/api/purchase-orders/:id/line-items", requireAuth, async (req: Request, res: Response) => {
    try {
      const lines = await storage.getPoLineItems(+param(req, "id"));
      res.json(lines);
    } catch (e: any) {
      res.status(500).json({ error: safeError("Internal server error", e) });
    }
  });

  app.post("/api/purchase-orders/:id/line-items", requireAuth, async (req: Request, res: Response) => {
    try {
      const purchaseOrderId = +param(req, "id");
      const line = await storage.createPoLineItem({ ...req.body, purchaseOrderId });
      res.status(201).json(line);
    } catch (e: any) {
      res.status(500).json({ error: safeError("Failed to create PO line item", e) });
    }
  });

  app.patch("/api/purchase-orders/:id/line-items/:liId", requireAuth, async (req: Request, res: Response) => {
    try {
      const liId = +param(req, "liId");
      const line = await storage.updatePoLineItem(liId, req.body);
      res.json(line);
    } catch (e: any) {
      res.status(500).json({ error: safeError("Failed to update PO line item", e) });
    }
  });

  app.delete("/api/purchase-orders/:id/line-items/:liId", requireAuth, async (req: Request, res: Response) => {
    try {
      const liId = +param(req, "liId");
      await storage.deletePoLineItem(liId);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: safeError("Failed to delete PO line item", e) });
    }
  });

  // PO recalculate totals from line items
  app.post("/api/purchase-orders/:id/recalculate", requireAuth, async (req: Request, res: Response) => {
    try {
      const id = +param(req, "id");
      const po = await storage.getPurchaseOrder(id);
      if (!po) return res.status(404).json({ error: "PO not found" });
      const lines = await storage.getPoLineItems(id);
      const total = lines.reduce((sum, l) => sum + parseFloat(String(l.amount) || "0"), 0);
      const updated = await storage.updatePurchaseOrder(id, { amount: String(total) });
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ error: safeError("Failed to recalculate PO", e) });
    }
  });

  // ---- CUSTOMER RATE CARDS CRUD (enhanced) ----
  app.patch("/api/customers/:id/rate-card/:rcId", requireAuth, async (req: Request, res: Response) => {
    try {
      const rcId = +param(req, "rcId");
      const rc = await storage.updateCustomerRateCard(rcId, req.body);
      res.json(rc);
    } catch (e: any) {
      res.status(500).json({ error: safeError("Failed to update customer rate card", e) });
    }
  });

  // ---- RATE CARD LOOKUP ----
  app.get("/api/rate-cards/lookup", requireAuth, async (req: Request, res: Response) => {
    try {
      const { customerId, vendorId, sourceLang, targetLang, serviceType } = req.query;
      const result = await storage.lookupRateCards({
        customerId: customerId ? +customerId : undefined,
        vendorId: vendorId ? +vendorId : undefined,
        sourceLang: sourceLang as string,
        targetLang: targetLang as string,
        serviceType: serviceType as string,
      });
      const customerRate = result.customerRate ? parseFloat(String(result.customerRate.rateValue)) : null;
      const vendorRate = result.vendorRate ? parseFloat(String(result.vendorRate.rateValue)) : null;
      const margin = customerRate && vendorRate ? ((customerRate - vendorRate) / customerRate) * 100 : null;
      res.json({ customerRate: result.customerRate, vendorRate: result.vendorRate, margin });
    } catch (e: any) {
      res.status(500).json({ error: safeError("Internal server error", e) });
    }
  });

  // ---- DASHBOARD KPIs ----
  app.get("/api/dashboard/kpis", requireAuth, async (_req: Request, res: Response) => {
    try {
      const kpis = await storage.getDashboardKpis();
      res.json(kpis);
    } catch (e: any) {
      res.status(500).json({ error: safeError("Internal server error", e) });
    }
  });

  app.get("/api/dashboard/activity", requireAuth, async (req: Request, res: Response) => {
    try {
      const limit = req.query.limit ? +req.query.limit : 20;
      const activity = await storage.getDashboardActivity(limit);
      res.json(activity);
    } catch (e: any) {
      res.status(500).json({ error: safeError("Internal server error", e) });
    }
  });

  app.get("/api/dashboard/deadlines", requireAuth, async (_req: Request, res: Response) => {
    try {
      const deadlines = await storage.getDashboardDeadlines();
      res.json(deadlines);
    } catch (e: any) {
      res.status(500).json({ error: safeError("Internal server error", e) });
    }
  });

  app.get("/api/dashboard/project-pipeline", requireAuth, async (_req: Request, res: Response) => {
    try {
      const pipeline = await storage.getProjectPipeline();
      res.json(pipeline);
    } catch (e: any) {
      res.status(500).json({ error: safeError("Internal server error", e) });
    }
  });

  // ---- CSV EXPORTS ----
  app.get("/api/export/invoices", requireAuth, async (req: Request, res: Response) => {
    try {
      const entityId = req.query.entityId ? +req.query.entityId : undefined;
      const data = await storage.getAllInvoicesForExport(entityId);
      const rows = data.map((r: any) => ({
        invoice_number: r.invoice.invoiceNumber || "",
        date: r.invoice.invoiceDate || "",
        due_date: r.invoice.dueDate || "",
        customer: r.customerName || "",
        entity: r.entityName || "",
        subtotal: r.invoice.subtotal || "",
        tax: r.invoice.taxAmount || "",
        total: r.invoice.total || "",
        currency: r.invoice.currency || "",
        status: r.invoice.status || "",
        payment_terms: r.invoice.paymentTerms || "",
      }));
      const headers = Object.keys(rows[0] || {});
      const csv = [headers.join(","), ...rows.map((r: any) => headers.map(h => `"${String(r[h] || "").replace(/"/g, '""')}"`).join(","))].join("\n");
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=invoices.csv");
      res.send(csv);
    } catch (e: any) {
      res.status(500).json({ error: safeError("Export failed", e) });
    }
  });

  app.get("/api/export/purchase-orders", requireAuth, async (req: Request, res: Response) => {
    try {
      const entityId = req.query.entityId ? +req.query.entityId : undefined;
      const data = await storage.getAllPurchaseOrdersForExport(entityId);
      const rows = data.map((r: any) => ({
        po_number: r.po.poNumber || "",
        vendor: r.vendorName || "",
        entity: r.entityName || "",
        amount: r.po.amount || "",
        currency: r.po.currency || "",
        status: r.po.status || "",
        payment_method: r.po.paymentMethod || "",
        payment_date: r.po.paymentDate || "",
        payment_terms: r.po.paymentTerms || "",
        created: r.po.createdAt || "",
      }));
      const headers = Object.keys(rows[0] || {});
      const csv = [headers.join(","), ...rows.map((r: any) => headers.map(h => `"${String(r[h] || "").replace(/"/g, '""')}"`).join(","))].join("\n");
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=purchase-orders.csv");
      res.send(csv);
    } catch (e: any) {
      res.status(500).json({ error: safeError("Export failed", e) });
    }
  });

  app.get("/api/export/payments", requireAuth, async (req: Request, res: Response) => {
    try {
      const entityId = req.query.entityId ? +req.query.entityId : undefined;
      const data = await storage.getAllPaymentsForExport(entityId);
      const rows = data.map((p: any) => ({
        type: p.type || "",
        amount: p.amount || "",
        currency: p.currency || "",
        payment_date: p.paymentDate || "",
        payment_method: p.paymentMethod || "",
        reference: p.reference || "",
        notes: p.notes || "",
        created: p.createdAt || "",
      }));
      const headers = Object.keys(rows[0] || {});
      const csv = [headers.join(","), ...rows.map((r: any) => headers.map(h => `"${String(r[h] || "").replace(/"/g, '""')}"`).join(","))].join("\n");
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=payments.csv");
      res.send(csv);
    } catch (e: any) {
      res.status(500).json({ error: safeError("Export failed", e) });
    }
  });

  app.get("/api/export/vendors", requireAuth, async (_req: Request, res: Response) => {
    try {
      const data = await storage.getAllVendorsForExport();
      const rows = data.map((v: any) => ({
        resource_code: v.resourceCode || "",
        full_name: v.fullName || "",
        email: v.email || "",
        phone: v.phone || "",
        status: v.status || "",
        tier: v.tier || "",
        native_language: v.nativeLanguage || "",
        location: v.location || "",
        resource_type: v.resourceType || "",
        currency: v.currency || "",
        availability: v.availability || "",
        combined_quality_score: v.combinedQualityScore || "",
        average_lqa_score: v.averageLqaScore || "",
        average_qs_score: v.averageQsScore || "",
        nda_signed: v.ndaSigned ? "Yes" : "No",
        tested: v.tested ? "Yes" : "No",
        certified: v.certified ? "Yes" : "No",
        service_types: (v.serviceTypes || []).join("; "),
        specializations: (v.specializations || []).join("; "),
        tags: (v.tags || []).join("; "),
      }));
      const headers = Object.keys(rows[0] || {});
      const csv = [headers.join(","), ...rows.map((r: any) => headers.map(h => `"${String(r[h] || "").replace(/"/g, '""')}"`).join(","))].join("\n");
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=vendors.csv");
      res.send(csv);
    } catch (e: any) {
      res.status(500).json({ error: safeError("Export failed", e) });
    }
  });

  // ---- SETTINGS ----
  app.get("/api/settings", requireAuth, async (_req: Request, res: Response) => {
    const allSettings = await storage.getAllSettings();
    res.json(allSettings);
  });

  app.patch("/api/settings/:key", requireAuth, async (req: Request, res: Response) => {
    try {
      const setting = await storage.upsertSetting(param(req, "key"), req.body.value, req.body.category, req.body.description);
      res.json(setting);
    } catch (e: any) {
      res.status(500).json({ error: safeError("Internal server error", e) });
    }
  });

  app.post("/api/settings", requireAuth, async (req: Request, res: Response) => {
    try {
      const { key, value, category, description } = req.body;
      if (!key) return res.status(400).json({ error: "key is required" });
      const setting = await storage.upsertSetting(key, value ?? {}, category, description);
      res.json(setting);
    } catch (e: any) {
      res.status(500).json({ error: safeError("Failed to create setting", e) });
    }
  });

  // ---- VENDOR PORTAL ROUTES ----
  // These use vendor session tokens (magic link based)
  async function requireVendorAuth(req: Request, res: Response, next: NextFunction) {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) return res.status(401).json({ error: "No vendor token provided" });
    const session = await storage.getVendorSession(token);
    if (!session) return res.status(401).json({ error: "Invalid vendor session" });
    if (new Date(session.expiresAt) < new Date()) {
      await storage.deleteVendorSession(token);
      return res.status(401).json({ error: "Vendor session expired" });
    }
    (req as any).vendorId = session.vendorId;
    next();
  }

  app.get("/api/portal/profile", requireVendorAuth, async (req: Request, res: Response) => {
    const vendor = await storage.getVendor((req as any).vendorId);
    if (!vendor) return res.status(404).json({ error: "Vendor not found" });
    res.json(vendor);
  });

  app.patch("/api/portal/profile", requireVendorAuth, async (req: Request, res: Response) => {
    try {
      // Vendors can only update certain fields
      const allowedFields = ["phone", "phone2", "address", "website", "availability", "availableOn", "paymentInfo"];
      const updates: any = {};
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) updates[field] = req.body[field];
      }
      const vendor = await storage.updateVendor((req as any).vendorId, updates);
      res.json(vendor);
    } catch (e: any) {
      res.status(500).json({ error: safeError("Internal server error", e) });
    }
  });

  app.get("/api/portal/jobs", requireVendorAuth, async (req: Request, res: Response) => {
    try {
      const vendorJobs = await storage.getVendorJobs((req as any).vendorId);
      res.json(vendorJobs);
    } catch (e: any) {
      console.error("Portal jobs error:", e);
      res.json([]);
    }
  });

  app.get("/api/portal/payments", requireVendorAuth, async (req: Request, res: Response) => {
    const orders = await storage.getPurchaseOrders({ vendorId: (req as any).vendorId });
    res.json(orders);
  });

  app.get("/api/portal/quality-scores", requireVendorAuth, async (req: Request, res: Response) => {
    const reports = await storage.getQualityReports((req as any).vendorId);
    res.json(reports);
  });

  app.get("/api/portal/documents", requireVendorAuth, async (req: Request, res: Response) => {
    const docs = await storage.getVendorDocuments();
    res.json(docs);
  });

  // ============================================
  // PHASE 2: AUTO-ACCEPT RULES ENGINE
  // ============================================

  const autoAcceptRoleGuard = requireRole("gm", "admin", "operations_manager");

  // GET /api/auto-accept-rules — list all rules
  app.get("/api/auto-accept-rules", requireAuth, autoAcceptRoleGuard, async (_req: Request, res: Response) => {
    try {
      const rules = await db.select().from(autoAcceptRulesTable).orderBy(asc(autoAcceptRulesTable.priority));
      res.json(rules);
    } catch (e: any) {
      res.status(500).json({ error: safeError("Failed to fetch rules", e) });
    }
  });

  // POST /api/auto-accept-rules — create a rule
  app.post("/api/auto-accept-rules", requireAuth, autoAcceptRoleGuard, async (req: Request, res: Response) => {
    try {
      const { name, portalSource, conditions, action, priority, enabled } = req.body;
      if (!name || !portalSource || !conditions) return res.status(400).json({ error: "name, portalSource, and conditions are required" });
      const currentUser = (req as any).currentUser;
      const [rule] = await db.insert(autoAcceptRulesTable).values({
        name,
        portalSource,
        conditions,
        action: action || "approve",
        priority: priority ?? 100,
        enabled: enabled !== false,
        createdBy: currentUser?.email || currentUser?.name || null,
        lastModifiedBy: currentUser?.email || currentUser?.name || null,
        lastModifiedAt: new Date(),
      }).returning();
      await logAudit((req as any).pmUserId, "create", "auto_accept_rule", rule.id, null, rule, req.ip || null);
      res.json(rule);
    } catch (e: any) {
      res.status(500).json({ error: safeError("Failed to create rule", e) });
    }
  });

  // GET /api/auto-accept-rules/:id — get single rule
  app.get("/api/auto-accept-rules/:id", requireAuth, autoAcceptRoleGuard, async (req: Request, res: Response) => {
    try {
      const [rule] = await db.select().from(autoAcceptRulesTable).where(eq(autoAcceptRulesTable.id, +param(req, "id")));
      if (!rule) return res.status(404).json({ error: "Rule not found" });
      res.json(rule);
    } catch (e: any) {
      res.status(500).json({ error: safeError("Failed to fetch rule", e) });
    }
  });

  // PATCH /api/auto-accept-rules/:id — update a rule
  app.patch("/api/auto-accept-rules/:id", requireAuth, autoAcceptRoleGuard, async (req: Request, res: Response) => {
    try {
      const id = +param(req, "id");
      const [existing] = await db.select().from(autoAcceptRulesTable).where(eq(autoAcceptRulesTable.id, id));
      if (!existing) return res.status(404).json({ error: "Rule not found" });
      const currentUser = (req as any).currentUser;
      const updates: any = {};
      for (const key of ["name", "portalSource", "conditions", "action", "priority", "enabled"]) {
        if (req.body[key] !== undefined) updates[key] = req.body[key];
      }
      updates.lastModifiedBy = currentUser?.email || currentUser?.name || null;
      updates.lastModifiedAt = new Date();
      const [updated] = await db.update(autoAcceptRulesTable).set(updates).where(eq(autoAcceptRulesTable.id, id)).returning();
      await logAudit((req as any).pmUserId, "update", "auto_accept_rule", id, existing, updated, req.ip || null);
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ error: safeError("Failed to update rule", e) });
    }
  });

  // DELETE /api/auto-accept-rules/:id — delete a rule
  app.delete("/api/auto-accept-rules/:id", requireAuth, autoAcceptRoleGuard, async (req: Request, res: Response) => {
    try {
      const id = +param(req, "id");
      const [existing] = await db.select().from(autoAcceptRulesTable).where(eq(autoAcceptRulesTable.id, id));
      if (!existing) return res.status(404).json({ error: "Rule not found" });
      await db.delete(autoAcceptRulesTable).where(eq(autoAcceptRulesTable.id, id));
      await logAudit((req as any).pmUserId, "delete", "auto_accept_rule", id, existing, null, req.ip || null);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: safeError("Failed to delete rule", e) });
    }
  });

  // POST /api/auto-accept-rules/:id/toggle — enable/disable
  app.post("/api/auto-accept-rules/:id/toggle", requireAuth, autoAcceptRoleGuard, async (req: Request, res: Response) => {
    try {
      const id = +param(req, "id");
      const [existing] = await db.select().from(autoAcceptRulesTable).where(eq(autoAcceptRulesTable.id, id));
      if (!existing) return res.status(404).json({ error: "Rule not found" });
      const [updated] = await db.update(autoAcceptRulesTable).set({ enabled: !existing.enabled, lastModifiedAt: new Date() }).where(eq(autoAcceptRulesTable.id, id)).returning();
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ error: safeError("Failed to toggle rule", e) });
    }
  });

  // GET /api/auto-accept-log — view match history
  app.get("/api/auto-accept-log", requireAuth, autoAcceptRoleGuard, async (req: Request, res: Response) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
      const offset = parseInt(req.query.offset as string) || 0;
      const logs = await db.select().from(autoAcceptLogTable).orderBy(desc(autoAcceptLogTable.matchedAt)).limit(limit).offset(offset);
      const [{ total }] = await db.select({ total: count() }).from(autoAcceptLogTable);
      res.json({ logs, total });
    } catch (e: any) {
      res.status(500).json({ error: safeError("Failed to fetch log", e) });
    }
  });

  // POST /api/auto-accept/evaluate — dry run test
  app.post("/api/auto-accept/evaluate", requireAuth, autoAcceptRoleGuard, async (req: Request, res: Response) => {
    try {
      const { portalSource, taskData } = req.body;
      if (!portalSource || !taskData) return res.status(400).json({ error: "portalSource and taskData are required" });
      const result = await evaluateTask(portalSource, taskData, { dryRun: true });
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: safeError("Failed to evaluate", e) });
    }
  });

  // GET /api/auto-accept/field-config — get available condition fields
  app.get("/api/auto-accept/field-config", requireAuth, autoAcceptRoleGuard, async (_req: Request, res: Response) => {
    res.json(getConditionFieldConfig());
  });

  // ============================================
  // PHASE 2: PORTAL CREDENTIALS (APS, etc.)
  // ============================================

  // GET /api/portal-credentials — list all portal connections
  app.get("/api/portal-credentials", requireAuth, autoAcceptRoleGuard, async (_req: Request, res: Response) => {
    try {
      const creds = await db.select().from(portalCredentialsTable).orderBy(portalCredentialsTable.portalSource);
      // Don't return actual tokens/passwords to the client
      const safe = creds.map(c => ({
        ...c,
        credentials: maskCredentials(c.credentials as Record<string, any>),
      }));
      res.json(safe);
    } catch (e: any) {
      res.status(500).json({ error: safeError("Failed to fetch credentials", e) });
    }
  });

  // POST /api/portal-credentials — create/update portal credentials
  app.post("/api/portal-credentials", requireAuth, autoAcceptRoleGuard, async (req: Request, res: Response) => {
    try {
      const { portalSource, credentials, entityId } = req.body;
      if (!portalSource || !credentials) return res.status(400).json({ error: "portalSource and credentials are required" });
      // Check if credentials already exist for this portal
      const [existing] = await db.select().from(portalCredentialsTable).where(eq(portalCredentialsTable.portalSource, portalSource));
      if (existing) {
        // Update
        const [updated] = await db.update(portalCredentialsTable).set({
          credentials,
          entityId: entityId || null,
          updatedAt: new Date(),
        }).where(eq(portalCredentialsTable.id, existing.id)).returning();
        res.json({ ...updated, credentials: maskCredentials(updated.credentials as Record<string, any>) });
      } else {
        // Create
        const [created] = await db.insert(portalCredentialsTable).values({
          portalSource,
          credentials,
          entityId: entityId || null,
          status: "disconnected",
        }).returning();
        res.json({ ...created, credentials: maskCredentials(created.credentials as Record<string, any>) });
      }
    } catch (e: any) {
      res.status(500).json({ error: safeError("Failed to save credentials", e) });
    }
  });

  // POST /api/portal-credentials/test — test a portal connection
  app.post("/api/portal-credentials/test", requireAuth, autoAcceptRoleGuard, async (req: Request, res: Response) => {
    try {
      const { portalSource, credentials } = req.body;
      if (!portalSource || !credentials) return res.status(400).json({ error: "portalSource and credentials are required" });

      if (portalSource === "aps") {
        const result = await apsTestConnection(credentials);
        // Update status in DB if credentials exist
        const [existing] = await db.select().from(portalCredentialsTable).where(eq(portalCredentialsTable.portalSource, "aps"));
        if (existing) {
          await db.update(portalCredentialsTable).set({
            status: result.success ? "connected" : "error",
            lastSyncAt: result.success ? new Date() : existing.lastSyncAt,
            updatedAt: new Date(),
          }).where(eq(portalCredentialsTable.id, existing.id));
        }
        return res.json(result);
      }

      res.json({ success: false, message: `Portal '${portalSource}' test not implemented yet` });
    } catch (e: any) {
      res.status(500).json({ error: safeError("Connection test failed", e) });
    }
  });

  // POST /api/portal-credentials/aps/sync — trigger APS task sync
  app.post("/api/portal-credentials/aps/sync", requireAuth, autoAcceptRoleGuard, async (_req: Request, res: Response) => {
    try {
      const [cred] = await db.select().from(portalCredentialsTable).where(eq(portalCredentialsTable.portalSource, "aps"));
      if (!cred) return res.status(404).json({ error: "APS credentials not configured" });
      const credentials = cred.credentials as any;
      const tasks = await apsFetchOpenTasks(credentials);
      // Store new tasks
      let newCount = 0;
      for (const task of tasks) {
        const [existing] = await db.select().from(portalTasksTable).where(
          and(eq(portalTasksTable.portalSource, "aps"), eq(portalTasksTable.externalId, task.key)),
        );
        if (!existing) {
          const taskDataForEngine = apsMapToAutoAcceptFormat(task);
          const result = await processTask("aps", task.key, taskDataForEngine);
          await db.insert(portalTasksTable).values({
            portalSource: "aps",
            externalId: task.key,
            externalUrl: task.url,
            taskData: task as any,
            status: result.action === "approve" ? "approved" : result.action === "ignore" ? "ignored" : "pending",
            autoAcceptRuleId: result.ruleId,
            processedAt: new Date(),
          });
          newCount++;
        }
      }
      // Update sync timestamp
      await db.update(portalCredentialsTable).set({ lastSyncAt: new Date(), status: "connected" }).where(eq(portalCredentialsTable.id, cred.id));
      res.json({ success: true, total: tasks.length, new: newCount });
    } catch (e: any) {
      res.status(500).json({ error: safeError("Sync failed", e) });
    }
  });

  // NOTE: GET /api/portal-tasks is registered in the Portal Tasks (Phase A) section above (line ~3830).
  // The duplicate registration that was here has been removed to prevent dead code.

  // ---- VENDOR MAGIC LINK AUTH ----
  app.post("/api/auth/vendor-magic-link", magicLinkLimiter, async (req: Request, res: Response) => {
    try {
      const { email } = req.body;
      if (!email) return res.status(400).json({ error: "Email required" });
      // Find vendor by email
      const vendorList = await storage.getVendors({ search: email, limit: 1 });
      const vendor = vendorList.find((v: any) => v.email.toLowerCase() === email.toLowerCase());
      if (!vendor) return res.status(404).json({ error: "Vendor not found" });
      // Create session token
      const token = generateToken();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
      await storage.createVendorSession({ token, vendorId: vendor.id, expiresAt });
      // Send magic link email
      const magicUrl = `${SITE_PUBLIC_URL}#/portal/verify/${token}`;
      await sendEmail([vendor.email], "Sign in to ElTurco Portal", buildMagicLinkEmailHtml(vendor.fullName, magicUrl));
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: safeError("Internal server error", e) });
    }
  });

  app.get("/api/auth/vendor-verify/:token", async (req: Request, res: Response) => {
    const session = await storage.getVendorSession(param(req, "token"));
    if (!session) return res.status(404).json({ error: "Invalid or expired link" });
    if (new Date(session.expiresAt) < new Date()) {
      await storage.deleteVendorSession(param(req, "token"));
      return res.status(401).json({ error: "Link expired" });
    }
    const vendor = await storage.getVendor(session.vendorId);
    res.json({ token: param(req, "token"), vendor: vendor ? { id: vendor.id, fullName: vendor.fullName, email: vendor.email } : null });
  });

  // ── QA Seed endpoint (POST /api/seed-qa) — dev/staging only, admin role required ──
  app.post("/api/seed-qa", requireAuth, requireRole("admin", "gm"), async (req: Request, res: Response) => {
    if (process.env.NODE_ENV === "production") {
      return res.status(403).json({ error: "Seed endpoint is disabled in production" });
    }
    try {
      const now = new Date();
      const in1day = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000);
      const in2days = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
      const in5days = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);

      // Ensure customer exists
      let customerId: number;
      const [existingCustomer] = await db.select({ id: customers.id }).from(customers).limit(1);
      if (existingCustomer) {
        customerId = existingCustomer.id;
      } else {
        const [newCust] = await db.insert(customers).values({ name: "Test Client Corp", code: "TEST-001", status: "ACTIVE", currency: "EUR" }).returning({ id: customers.id });
        customerId = newCust.id;
      }

      // Ensure entity exists
      let entityId: number;
      const [existingEntity] = await db.select({ id: entities.id }).from(entities).limit(1);
      if (existingEntity) {
        entityId = existingEntity.id;
      } else {
        const [newEnt] = await db.insert(entities).values({ name: "Verbato Ltd", code: "VB", currency: "EUR" }).returning({ id: entities.id });
        entityId = newEnt.id;
      }

      // Find a vendor
      let vendorId: number | null = null;
      const [existingVendor] = await db.select({ id: vendors.id }).from(vendors).limit(1);
      if (existingVendor) vendorId = existingVendor.id;

      // Clean up previous seed data
      await db.delete(portalTasksTable).where(
        sql`${portalTasksTable.externalId} IN ('SYM-2026-0412', 'SYM-2026-0413', 'APS-LB-4521')`
      );

      // Seed portal tasks
      await db.insert(portalTasksTable).values([
        {
          portalSource: "symfonie", externalId: "SYM-2026-0412", status: "pending",
          taskData: { projectName: "Amazon Product Listings EN>DE", name: "Amazon Product Listings EN>DE", sourceLanguage: "English", targetLanguages: ["German"], wordCount: 2500, deadline: in2days.toISOString(), client_name: "Amazon/Centific" },
        },
        {
          portalSource: "symfonie", externalId: "SYM-2026-0413", status: "pending",
          taskData: { projectName: "Microsoft Azure Docs EN>TR,FR", name: "Microsoft Azure Docs EN>TR,FR", sourceLanguage: "English", targetLanguages: ["Turkish", "French"], wordCount: 8000, deadline: in5days.toISOString(), client_name: "Microsoft/RWS" },
        },
        {
          portalSource: "aps", externalId: "APS-LB-4521", status: "pending",
          taskData: { projectName: "Lionbridge Legal Review DE>EN", name: "Lionbridge Legal Review DE>EN", sourceLanguage: "German", targetLanguages: ["English"], wordCount: 1200, deadline: in1day.toISOString(), client_name: "Lionbridge (LCX)" },
        },
      ]);

      // Clean previous seed projects
      await db.delete(projects).where(
        sql`${projects.projectName} IN ('Samsung Mobile App Localization', 'Netflix Subtitle Translation')`
      );

      // Project 1
      const [p1] = await db.insert(projects).values({
        entityId, customerId, projectName: "Samsung Mobile App Localization", projectCode: "MAN-2026-0050",
        source: "manual", status: "in_progress", deadline: in5days,
      }).returning({ id: projects.id });

      await db.insert(jobs).values([
        { projectId: p1.id, jobCode: "MAN-2026-0050-TR", jobName: "EN>TR Translation", sourceLanguage: "EN", targetLanguage: "TR", serviceType: "Translation", status: "assigned", wordCount: 3500, vendorId, assignedAt: now, deadline: in5days },
        { projectId: p1.id, jobCode: "MAN-2026-0050-DE", jobName: "EN>DE Translation", sourceLanguage: "EN", targetLanguage: "DE", serviceType: "Translation", status: "unassigned", wordCount: 3500, deadline: in5days },
        { projectId: p1.id, jobCode: "MAN-2026-0050-FR", jobName: "EN>FR Translation", sourceLanguage: "EN", targetLanguage: "FR", serviceType: "Translation", status: "unassigned", wordCount: 3500, deadline: in5days },
      ]);

      // Project 2
      const [p2] = await db.insert(projects).values({
        entityId, customerId, projectName: "Netflix Subtitle Translation", projectCode: "SYM-2026-0399",
        source: "symfonie", externalId: "SYM-2026-0399", status: "confirmed", deadline: in5days,
      }).returning({ id: projects.id });

      await db.insert(jobs).values([
        { projectId: p2.id, jobCode: "SYM-2026-0399-ES", jobName: "EN>ES Translation", sourceLanguage: "EN", targetLanguage: "ES", serviceType: "Translation", status: "unassigned", wordCount: 5000, deadline: in5days },
        { projectId: p2.id, jobCode: "SYM-2026-0399-PT", jobName: "EN>PT Translation", sourceLanguage: "EN", targetLanguage: "PT", serviceType: "Translation", status: "unassigned", wordCount: 5000, deadline: in5days },
      ]);

      // Seed notifications
      await db.delete(notificationsV2).where(
        sql`${notificationsV2.title} LIKE 'New Symfonie task: Amazon%' OR ${notificationsV2.title} LIKE 'Deadline approaching: Lionbridge%'`
      );

      await db.insert(notificationsV2).values([
        { pmUserId: 5, type: "task_incoming", title: "New Symfonie task: Amazon Product Listings", message: "A new task from Symfonie portal is awaiting your review.", read: false },
        { pmUserId: 5, type: "deadline_warning", title: "Deadline approaching: Lionbridge Legal Review (tomorrow)", message: "The Lionbridge Legal Review DE>EN task deadline is tomorrow.", read: false },
      ]);

      res.json({
        success: true,
        seeded: {
          portalTasks: 3,
          projects: [{ id: p1.id, name: "Samsung Mobile App Localization", jobs: 3 }, { id: p2.id, name: "Netflix Subtitle Translation", jobs: 2 }],
          notifications: 2,
        },
      });
    } catch (e: any) {
      res.status(500).json({ error: safeError("Seed failed", e) });
    }
  });
}

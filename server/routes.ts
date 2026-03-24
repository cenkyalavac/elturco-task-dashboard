import type { Express, Request, Response, NextFunction } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { randomUUID } from "crypto";
import { execSync } from "child_process";

// ============================================
// CONFIG
// ============================================
const BASE44_API = "https://elts.base44.app/api/apps/694868412332f081649b2833/entities/Freelancer";
const BASE44_KEY = "bf9b19a625ae4083ba38b8585fb5a78f";
const FROM_EMAIL = process.env.FROM_EMAIL || "ElTurco Projects <projects@eltur.co>";
const MAGIC_LINK_EXPIRY_MINUTES = 30;
const SESSION_EXPIRY_HOURS = 72;

// Public URL — set SITE_PUBLIC_URL env var for self-hosting
const SITE_PUBLIC_URL = process.env.SITE_PUBLIC_URL || "https://www.perplexity.ai/computer/a/elturco-dispatch-xq.ImUQkRZ2T_RNbjgAXhg";

// Account matching map: which freelancer accounts match which sheet sources
const ACCOUNT_MATCH: Record<string, string[]> = {
  "Amazon": ["Amazon", "Amazon SeCM", "Amazon PWS"],
  "AppleCare": ["Apple"],
};

// ============================================
// HELPERS
// ============================================
function callExternalTool(sourceId: string, toolName: string, args: any): any {
  const params = JSON.stringify({ source_id: sourceId, tool_name: toolName, arguments: args });
  const escaped = params.replace(/'/g, "'\\''");
  const result = execSync(`external-tool call '${escaped}'`, { timeout: 30000 }).toString();
  return JSON.parse(result);
}

function sendEmail(to: string[], subject: string, html: string) {
  return callExternalTool("resend__pipedream", "resend-send-email", {
    from: FROM_EMAIL,
    to,
    subject,
    html,
  });
}

function generateToken(): string {
  return randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
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
async function fetchSheetTasks(apiId: string, tabName: string, sheetLabel: string, source: string): Promise<any[]> {
  const url = `https://sheetdb.io/api/v1/${apiId}?sheet=${encodeURIComponent(tabName)}`;
  try {
    const res = await fetch(url);
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
      // CAT analysis breakdown
      catCounts: {
        ice: (row["ICE"] || row["Ice"] || row["ICE Match/101"] || row["101%"] || "0").toString().trim(),
        rep: (row["Rep"] || row["REP"] || row["Reps"] || "0").toString().trim(),
        match100: (row["100%"] || row["100"] || "0").toString().trim(),
        fuzzy95: (row["95-99%"] || row["95-99"] || row["99-95%"] || "0").toString().trim(),
        fuzzy85: (row["85-94%"] || row["85-94"] || row["94-85%"] || "0").toString().trim(),
        fuzzy75: (row["75-84%"] || row["75-84"] || row["84-75%"] || "0").toString().trim(),
        noMatch: (row["No Match"] || row["NM"] || row["74-0%"] || "0").toString().trim(),
        mt: (row["MT"] || "0").toString().trim(),
      },
      // Notes & metadata
      hoNote: (row["HO Note"] || row["HO Notes"] || row["HO Note // Q&A SHEET"] || "").trim(),
      trHbNote: (row["TR HB Note"] || row["TR HB Notes"] || row["TR\nHB Note"] || "").trim(),
      revHbNote: (row["Rev HB Note"] || row["Rev HB Notes"] || row["Rev\nHB Note"] || "").trim(),
      instructions: (row["Instructions"] || row["Instruction"] || "").trim(),
      lqi: (row["LQI"] || row["LQI?"] || row["LQI ?"] || "").trim(),
      qs: (row["QS"] || "").toString().trim(),
      projectTitle: (row["Project Title"] || row["Title"] || row["Project"] || "").trim(),
      atmsId: (row["ATMS ID"] || row[" ATMS ID"] || "").toString().trim(),
      symfonieLink: (row["Symfonie"] || row["Symfonie link"] || "").trim(),
      symfonieId: (row["Symfonie ID"] || "").trim(),
    })).filter((t: any) => t.projectId);
  } catch (e) {
    return [];
  }
}

function extractProjectId(row: any, sheet: string): string {
  if (sheet === "TPT") return (row["ATMS ID"] || row["ID"] || "").trim();
  return (row["Project ID"] || row["ID"] || "").trim();
}
function extractAccount(row: any, sheet: string): string {
  if (sheet === "AFT") return (row["m"] || "").trim();
  if (sheet === "DPX") return (row[" Account"] || row["Account"] || "Amazon DPX").trim();
  if (sheet === "TPT") return (row["Account"] || row["Division"] || "").trim();
  return (row["Account"] || "").trim();
}
function extractTranslator(row: any, sheet: string): string {
  if (sheet === "TPT") return (row["TR"] || "").trim();
  return (row["TR "] || row["TR"] || "").trim();
}
function extractReviewer(row: any, sheet: string): string {
  if (sheet === "TPT") return (row["REV"] || "").trim();
  return (row["Rev"] || "").trim();
}
function extractTrDone(row: any, sheet: string): string {
  if (sheet === "TPT") return (row["TR\nDone?"] || row["TR Done?"] || "").trim();
  return (row["TR Dlvr"] || row["TR Dlvr?"] || row["TR Dlv?"] || "").trim();
}
function extractDelivered(row: any): string {
  const v = (row["Delivered?"] || "").trim().toLowerCase();
  if (v === "yes" || v === "y") return "Delivered";
  if (v === "cancelled" || v === "canceled") return "Cancelled";
  if (!v) return "Ongoing";
  return v.charAt(0).toUpperCase() + v.slice(1);
}
function extractDeadline(row: any, sheet: string): string {
  if (sheet === "TPT") return (row["TR\nDeadline"] || row["TR Deadline"] || "").trim();
  return (row["TR Deadline"] || "").trim();
}
function extractRevDeadline(row: any, sheet: string): string {
  if (sheet === "TPT") return (row["Client\nDeadline"] || row["Client Deadline"] || "").trim();
  return (row["Deadline"] || "").trim();
}
function extractTotal(row: any, sheet: string): string {
  return (row["Total"] || row["TWC"] || "0").toString().trim();
}
function extractWWC(row: any, sheet: string): string {
  return (row["TR WWC"] || row["WWC"] || "0").toString().trim();
}
function extractRevComplete(row: any, sheet: string): string {
  if (sheet === "TPT") return (row["Rev\nDone?"] || row["Rev Done?"] || "").trim();
  return (row["Rev Complete? (in minutes)"] || row["Rev Complete?"] || "").trim();
}
function extractRevType(row: any): string {
  return (row["Rev Type"] || row["Rev\nType"] || "").trim();
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
function buildDefaultOfferBody(vars: Record<string, string>): string {
  const role = vars.role || "Translation";
  return `<p>Hello <strong>${vars.freelancerName}</strong>,</p>
<p>We'd like to know if you're available for the following ${role.toLowerCase()} task.</p>
<table style="width:100%;border-collapse:collapse;margin:16px 0">
<tr><td style="padding:10px 12px;background:#f8f9fa;font-weight:600;color:#666;border-bottom:1px solid #eee;width:140px">Account</td><td style="padding:10px 12px;background:#f8f9fa;border-bottom:1px solid #eee">${vars.account}</td></tr>
<tr><td style="padding:10px 12px;font-weight:600;color:#666;border-bottom:1px solid #eee">Source / Tab</td><td style="padding:10px 12px;border-bottom:1px solid #eee">${vars.source} / ${vars.sheet}</td></tr>
<tr><td style="padding:10px 12px;background:#f8f9fa;font-weight:600;color:#666;border-bottom:1px solid #eee">Project ID</td><td style="padding:10px 12px;background:#f8f9fa;border-bottom:1px solid #eee">${vars.projectId}</td></tr>
<tr><td style="padding:10px 12px;font-weight:600;color:#666;border-bottom:1px solid #eee">Deadline</td><td style="padding:10px 12px;color:#e74c3c;font-weight:600;border-bottom:1px solid #eee">${vars.deadline}</td></tr>
<tr><td style="padding:10px 12px;background:#f8f9fa;font-weight:600;color:#666;border-bottom:1px solid #eee">Total / WWC</td><td style="padding:10px 12px;background:#f8f9fa;border-bottom:1px solid #eee">${vars.total} / ${vars.wwc}</td></tr>
<tr><td style="padding:10px 12px;font-weight:600;color:#666;border-bottom:1px solid #eee">Task Type</td><td style="padding:10px 12px;border-bottom:1px solid #eee">${role}</td></tr>
</table>`;
}

function buildOfferEmailHtml(task: any, offer: any, assignment: any, customSubject?: string, customBody?: string): { subject: string; html: string } {
  // Use clientBaseUrl (direct proxy URL) for the accept link — avoids hash fragment
  // loss when Perplexity loads the page in an iframe. Falls back to SITE_PUBLIC_URL.
  const base = offer.clientBaseUrl || SITE_PUBLIC_URL;
  const acceptUrl = `${base}#/respond/${offer.token}`;
  const role = assignment.role === "translator" ? "Translation" : "Review";

  const vars: Record<string, string> = {
    freelancerName: offer.freelancerName || "",
    account: task.account || "",
    source: task.source || "",
    sheet: task.sheet || "",
    projectId: task.projectId || "",
    deadline: task.deadline || "TBD",
    total: task.total || "N/A",
    wwc: task.wwc || "N/A",
    role,
    acceptUrl,
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
    bodyContent = tpl ? replaceVars(tpl.body, vars) : buildDefaultOfferBody(vars);
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
export async function registerRoutes(server: Server, app: Express) {

  // ---- AUTH ROUTES ----

  // Email + password login
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password are required." });

    const emailNorm = email.toLowerCase().trim();
    const pmUser = storage.getPmUserByEmail(emailNorm);
    if (!pmUser) return res.status(401).json({ error: "Invalid email or password." });
    if (pmUser.password !== password) return res.status(401).json({ error: "Invalid email or password." });

    const sessionToken = generateToken();
    const expiresAt = new Date(Date.now() + SESSION_EXPIRY_HOURS * 3600 * 1000).toISOString();
    storage.createSession(sessionToken, pmUser.id, expiresAt);

    res.json({ token: sessionToken, user: { id: pmUser.id, email: pmUser.email, name: pmUser.name, role: pmUser.role, defaultFilter: pmUser.defaultFilter || "ongoing", defaultMyProjects: !!pmUser.defaultMyProjects } });
  });

  // ---- REDIRECT ENDPOINTS (no '#' in URL — safe for email clients) ----

  // Magic-link redirect: email links point here.
  // We serve an HTML page that does a client-side redirect so the hash
  // fragment is preserved (302 redirects drop the hash in most browsers).
  app.get("/api/auth/redirect/:token", (req: Request, res: Response) => {
    const authToken = storage.getAuthToken(req.params.token);
    if (!authToken || !authToken.clientBaseUrl) {
      return res.status(404).send("Invalid or expired link.");
    }
    const frontendUrl = `${authToken.clientBaseUrl}#/auth/verify/${req.params.token}`;
    res.type("html").send(buildRedirectPage(frontendUrl, "Signing you in..."));
  });

  // Offer redirect: freelancer email links point here
  app.get("/api/offers/redirect/:token", (req: Request, res: Response) => {
    const offer = storage.getOfferByToken(req.params.token);
    if (!offer) {
      return res.status(404).send("Offer not found or expired.");
    }
    const base = offer.clientBaseUrl || SITE_PUBLIC_URL;
    const frontendUrl = `${base}#/respond/${req.params.token}`;
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
      res.json(freelancers);
    } catch (e: any) {
      res.status(500).json({ error: "Failed to fetch freelancer data: " + e.message });
    }
  });

  // ---- TASK ROUTES (SheetDB) ----

  app.get("/api/tasks", requireAuth, async (req: Request, res: Response) => {
    try {
      const configs = storage.getAllSheetConfigs();
      const pmEmail = (() => {
        const session = storage.getSession(req.headers.authorization!.replace("Bearer ", ""));
        if (!session) return null;
        const allUsers = storage.getAllPmUsers();
        const user = allUsers.find(u => u.id === session.pmUserId);
        return user?.email || null;
      })();

      // Filter configs by PM assignment (null assignedPms = visible to all)
      const visibleConfigs = configs.filter(c => {
        if (!c.assignedPms) return true;
        try {
          const pms = JSON.parse(c.assignedPms) as string[];
          return pms.includes(pmEmail || "");
        } catch { return true; }
      });

      const allTasks: any[] = [];
      // Group configs by sheetDbId to minimize API calls
      const byApiId = new Map<string, typeof visibleConfigs>();
      for (const c of visibleConfigs) {
        if (!c.sheetDbId) continue;
        if (!byApiId.has(c.sheetDbId)) byApiId.set(c.sheetDbId, []);
        byApiId.get(c.sheetDbId)!.push(c);
      }

      const promises: Promise<void>[] = [];
      byApiId.forEach((cfgs, apiId) => {
        for (const cfg of cfgs) {
          promises.push(
            fetchSheetTasks(apiId, cfg.sheet, cfg.sheet, cfg.source)
              .then(rows => { allTasks.push(...rows); })
          );
        }
      });
      await Promise.all(promises);

      res.json(allTasks);
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
    const a = storage.getAssignment(+req.params.id);
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
    const assignment = storage.getAssignment(+req.params.id);
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
    const offer = storage.getOffer(+req.params.id);
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
      acceptedBy: user.name, acceptedByName: user.name, acceptedByEmail: user.email,
      sequenceList: null, currentSequenceIndex: 0, sequenceTimeoutMinutes: 60,
      broadcastList: null, autoAssignReviewer: 0,
      reviewerAssignmentType: null, reviewerSequenceList: null,
      reviewType: req.body.reviewType || null,
      createdAt: now, offeredAt: now, acceptedAt: now,
    });

    // Write PM's name/initial to Sheet (only if cell is empty or XX)
    const pmInitial = req.body.resourceCode || user.name;
    safeWriteToSheet(assignment, pmInitial, role as "translator" | "reviewer");

    // Self-Edit: write the same code to both TR and REV
    if (req.body.reviewType === "Self-Edit" && role === "reviewer") {
      safeWriteToSheet(assignment, pmInitial, "translator");
    }

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

    res.json({ success: true, assignment });
  });

  // Create assignment and send offers
  app.post("/api/assignments", requireAuth, async (req: Request, res: Response) => {
    const {
      source, sheet, projectId, account, taskDetails,
      assignmentType, role, freelancers,
      sequenceTimeoutMinutes, autoAssignReviewer,
      reviewerAssignmentType, reviewerSequenceList,
      emailSubject, emailBody,
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

    const enriched = {
      ...assignment,
      taskDetails: JSON.parse(assignment.taskDetails || "{}"),
      offers: storage.getOffersByAssignment(assignment.id),
    };
    res.json(enriched);
  });

  // ---- OFFER RESPONSE (PUBLIC - no auth needed) ----

  // Get offer details for freelancer view
  app.get("/api/offers/:token", async (req: Request, res: Response) => {
    const offer = storage.getOfferByToken(req.params.token);
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
  app.post("/api/offers/:token/accept", async (req: Request, res: Response) => {
    const offer = storage.getOfferByToken(req.params.token);
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

    res.json({ success: true, message: "Task accepted. Thank you!" });
  });

  // Reject offer
  app.post("/api/offers/:token/reject", async (req: Request, res: Response) => {
    const offer = storage.getOfferByToken(req.params.token);
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

    res.json({ success: true, message: "Offer declined." });
  });

  // Mark task as completed by freelancer
  app.post("/api/offers/:token/complete", async (req: Request, res: Response) => {
    const offer = storage.getOfferByToken(req.params.token);
    if (!offer) return res.status(404).json({ error: "Offer not found." });
    if (offer.status !== "accepted") {
      return res.status(400).json({ error: "Only accepted tasks can be completed." });
    }

    const assignment = storage.getAssignment(offer.assignmentId);
    if (!assignment) return res.status(404).json({ error: "Task not found." });

    const now = new Date().toISOString();
    storage.updateAssignment(assignment.id, { status: "completed", completedAt: now });

    // Write-back to sheet: mark task as done
    const { timeSpent } = req.body || {};
    const role = assignment.role;
    const reviewType = assignment.reviewType || "";

    try {
      if (role === "translator") {
        // Translator completed: write "Yes" to TR Done column
        await safeWriteStatusToSheet(assignment, "trDone", "Yes");
      } else if (role === "reviewer") {
        if (reviewType === "Self-Edit") {
          // Self-Edit: write "Yes" to both TR Done and Rev Complete
          await safeWriteStatusToSheet(assignment, "trDone", "Yes");
          await safeWriteStatusToSheet(assignment, "revComplete", "Yes");
        } else {
          // Normal reviewer: write time spent (or "Yes") to Rev Complete
          const revValue = timeSpent ? String(timeSpent) : "Yes";
          await safeWriteStatusToSheet(assignment, "revComplete", revValue);
        }
      }
    } catch (e) {
      console.error("Sheet status write error (non-fatal):", e);
    }

    res.json({ success: true, message: "Task marked as completed!" });
  });

  // ---- SAFE SHEET WRITE-BACK ----
  // Only writes to empty or "XX" cells. Never overwrites existing initials.

  async function safeWriteToSheet(assignment: any, freelancerCode: string, columnType: "translator" | "reviewer") {
    try {
      // Find the SheetDB API ID from config
      const configs = storage.getAllSheetConfigs();
      const config = configs.find(c => c.source === assignment.source && c.sheet === assignment.sheet);
      if (!config?.sheetDbId) return;

      const apiId = config.sheetDbId;
      const sheet = assignment.sheet;
      const projectId = assignment.projectId;

      // Determine column names based on sheet type
      const idCol = sheet === "TPT" ? "ATMS ID" 
        : (sheet === "Assignments" || sheet === "RU Assignments" || sheet === "AR Assignments") ? "ID" 
        : "Project ID";
      
      const trCol = sheet === "TPT" ? "TR" : "TR ";
      const revCol = sheet === "TPT" ? "REV" : "Rev";
      const targetCol = columnType === "translator" ? trCol : revCol;

      // First, READ the current value to check if it's empty or XX
      const readUrl = `https://sheetdb.io/api/v1/${apiId}/search?${encodeURIComponent(idCol)}=${encodeURIComponent(projectId)}&sheet=${encodeURIComponent(sheet)}`;
      const readRes = await fetch(readUrl);
      if (!readRes.ok) return;
      const rows = await readRes.json();
      if (!Array.isArray(rows) || rows.length === 0) return;

      const currentValue = (rows[0][targetCol] || "").toString().trim();
      
      // SAFETY CHECK: Only write if cell is empty or XX
      if (currentValue && currentValue.toUpperCase() !== "XX") {
        console.log(`Sheet write BLOCKED: ${targetCol} already has '${currentValue}' for project ${projectId}`);
        return;
      }

      // Safe to write
      const writeUrl = `https://sheetdb.io/api/v1/${apiId}/${encodeURIComponent(idCol)}/${encodeURIComponent(projectId)}?sheet=${encodeURIComponent(sheet)}`;
      await fetch(writeUrl, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: { [targetCol]: freelancerCode } }),
      });
      console.log(`Sheet write OK: ${targetCol}=${freelancerCode} for project ${projectId}`);
    } catch (e) {
      console.error("Sheet write error (non-fatal):", e);
    }
  }

  // Write status values (TR Done, Rev Complete) to sheet
  async function safeWriteStatusToSheet(assignment: any, columnType: "trDone" | "revComplete", value: string) {
    try {
      const configs = storage.getAllSheetConfigs();
      const config = configs.find(c => c.source === assignment.source && c.sheet === assignment.sheet);
      if (!config?.sheetDbId) return;

      const apiId = config.sheetDbId;
      const sheet = assignment.sheet;
      const projectId = assignment.projectId;

      // Determine ID column
      const idCol = sheet === "TPT" ? "ATMS ID" 
        : (sheet === "Assignments" || sheet === "RU Assignments" || sheet === "AR Assignments") ? "ID" 
        : "Project ID";

      // Determine target column based on sheet type
      let targetCol: string;
      if (columnType === "trDone") {
        if (sheet === "TPT") targetCol = "TR\nDone?";
        else if (sheet === "Assignments" || sheet === "RU Assignments" || sheet === "AR Assignments") targetCol = "TR Dlvr?";
        else targetCol = "TR Dlvr";
      } else {
        // revComplete
        if (sheet === "TPT") targetCol = "Time Spent\n(in minutes)";
        else if (sheet === "Assignments" || sheet === "RU Assignments" || sheet === "AR Assignments") targetCol = "Rev Complete?";
        else targetCol = "Rev Complete? (in minutes)";
      }

      // Write the value
      const writeUrl = `https://sheetdb.io/api/v1/${apiId}/${encodeURIComponent(idCol)}/${encodeURIComponent(projectId)}?sheet=${encodeURIComponent(sheet)}`;
      await fetch(writeUrl, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: { [targetCol]: value } }),
      });
      console.log(`Sheet status write OK: ${targetCol}=${value} for project ${projectId}`);
    } catch (e) {
      console.error("Sheet status write error (non-fatal):", e);
    }
  }

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
    storage.deleteSheetConfig(+req.params.id);
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
    storage.deletePreset(+req.params.id);
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

  // ---- FREELANCER STATS (QS, LQI averages) ----

  app.get("/api/freelancer-stats", requireAuth, async (_req: Request, res: Response) => {
    try {
      const configs = storage.getAllSheetConfigs();
      const allTasks: any[] = [];
      const promises: Promise<void>[] = [];
      const byApiId = new Map<string, any[]>();
      for (const c of configs) {
        if (!c.sheetDbId) continue;
        if (!byApiId.has(c.sheetDbId)) byApiId.set(c.sheetDbId, []);
        byApiId.get(c.sheetDbId)!.push(c);
      }
      byApiId.forEach((cfgs, apiId) => {
        for (const cfg of cfgs) {
          promises.push(
            fetchSheetTasks(apiId, cfg.sheet, cfg.sheet, cfg.source)
              .then(rows => { allTasks.push(...rows); })
          );
        }
      });
      await Promise.all(promises);

      const trStats: Record<string, { qsScores: number[]; count: number }> = {};
      const revStats: Record<string, { count: number }> = {};

      for (const t of allTasks) {
        const tr = (t.translator || "").trim();
        const rev = (t.reviewer || "").trim();
        const qs = parseFloat(t.qs || "0");

        if (tr && tr !== "XX") {
          if (!trStats[tr]) trStats[tr] = { qsScores: [], count: 0 };
          trStats[tr].count++;
          if (qs > 0) trStats[tr].qsScores.push(qs);
        }
        if (rev && rev !== "XX") {
          if (!revStats[rev]) revStats[rev] = { count: 0 };
          revStats[rev].count++;
        }
      }

      const result: Record<string, { taskCount: number; avgQs: number | null }> = {};
      for (const [code, stats] of Object.entries(trStats)) {
        result[code] = {
          taskCount: stats.count + (revStats[code]?.count || 0),
          avgQs: stats.qsScores.length > 0
            ? Math.round((stats.qsScores.reduce((a, b) => a + b, 0) / stats.qsScores.length) * 10) / 10
            : null,
        };
      }
      for (const [code, stats] of Object.entries(revStats)) {
        if (!result[code]) {
          result[code] = { taskCount: stats.count, avgQs: null };
        }
      }

      res.json(result);
    } catch (e: any) {
      res.json({});
    }
  });

  // ---- PM MANAGEMENT ----

  app.get("/api/pm-users", requireAuth, (_req: Request, res: Response) => {
    res.json(storage.getAllPmUsers());
  });

  app.post("/api/pm-users", requireAuth, (req: Request, res: Response) => {
    const { email, name, password, role } = req.body;
    if (!email || !name || !password) return res.status(400).json({ error: "Email, name, and password required" });
    const existing = storage.getPmUserByEmail(email.toLowerCase().trim());
    if (existing) return res.status(400).json({ error: "This email is already registered." });
    const user = storage.createPmUser({ email: email.toLowerCase().trim(), name, password, role: role || "pm" });
    res.json(user);
  });

  // Update PM preferences (default filter, my projects)
  app.post("/api/pm-users/preferences", requireAuth, (req: Request, res: Response) => {
    const { defaultFilter, defaultMyProjects } = req.body;
    const session = storage.getSession(req.headers.authorization!.replace("Bearer ", ""));
    if (!session) return res.status(401).json({ error: "Unauthorized" });
    const user = storage.getAllPmUsers().find(u => u.id === session.pmUserId);
    if (!user) return res.status(404).json({ error: "User not found" });
    // Update using raw SQL since we don't have a dedicated update method for these fields
    const updates: any = {};
    if (defaultFilter !== undefined) updates.defaultFilter = defaultFilter;
    if (defaultMyProjects !== undefined) updates.defaultMyProjects = defaultMyProjects ? 1 : 0;
    if (Object.keys(updates).length > 0) {
      storage.updatePmUser(user.id, updates);
    }
    res.json({ success: true });
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

  app.delete("/api/auto-assign-rules/:id", requireAuth, (req: Request, res: Response) => {
    storage.deleteAutoAssignRule(+req.params.id);
    res.json({ success: true });
  });

  // ---- ANALYTICS ----
  app.get("/api/analytics", requireAuth, async (_req: Request, res: Response) => {
    try {
      const allAssignments = storage.getAllAssignments();

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

      // By status
      const byStatus: Record<string, number> = {};
      for (const a of allAssignments) {
        byStatus[a.status] = (byStatus[a.status] || 0) + 1;
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

      res.json({
        byDay: Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b)),
        byRole, byType, byStatus,
        topFreelancers: Object.entries(topFreelancers)
          .sort(([, a], [, b]) => b.accepted - a.accepted)
          .slice(0, 10),
        totalAssignments: allAssignments.length,
        totalOffers: allOffers.length,
        avgResponseTimeMinutes: avgResponseTime,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
}

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
const SHEETDB_AMAZON = "mukq6ww3ssuk0";
const SHEETDB_APPLECARE = "v6i82rdrqa34n";
const FROM_EMAIL = "ElTurco Projects <projects@eltur.co>";
const MAGIC_LINK_EXPIRY_MINUTES = 30;
const SESSION_EXPIRY_HOURS = 72;

// Account matching map: which freelancer accounts match which sheet sources
const ACCOUNT_MATCH: Record<string, string[]> = {
  "Amazon": ["Amazon", "Amazon SeCM", "Amazon PWS"],
  "AppleCare": ["Apple"],
};

const AMAZON_TABS = [
  { tab: "non-AFT", sheet: "non-AFT" },
  { tab: "TPT", sheet: "TPT" },
  { tab: "AFT", sheet: "AFT" },
  { tab: "Non-EN Tasks", sheet: "Non-EN" },
  { tab: "Amazon DPX", sheet: "DPX" },
];
const APPLECARE_TABS = [
  { tab: "Assignments", sheet: "Assignments" },
  { tab: "RU Assignments", sheet: "RU Assignments" },
  { tab: "AR Assignments", sheet: "AR Assignments" },
];

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
// In production (deployed via Perplexity Computer), the frontend sends
// requests through a proxy.  The Referer / Origin header carries the
// real public URL the user sees (e.g. https://sites.pplx.app/...).
// We strip the path so we keep only the scheme+host+port portion.
function resolveBaseUrl(req: Request): string {
  // 1. Try Referer (most reliable — sent on every fetch from the page)
  const referer = req.headers.referer || req.headers.referrer;
  if (referer) {
    try {
      const u = new URL(referer as string);
      return u.origin; // e.g. https://sites.pplx.app
    } catch {}
  }
  // 2. Try Origin (sent on POST requests)
  const origin = req.headers.origin;
  if (origin && !origin.includes("localhost") && !origin.includes("127.0.0.1")) {
    return origin as string;
  }
  // 3. Forwarded headers (reverse-proxy setups)
  const fwdProto = req.headers["x-forwarded-proto"];
  const fwdHost  = req.headers["x-forwarded-host"];
  if (fwdProto && fwdHost) {
    return `${fwdProto}://${fwdHost}`;
  }
  // 4. Fallback to Host header (local dev)
  const proto = req.protocol || "http";
  const host  = req.headers.host || "localhost:5000";
  return `${proto}://${host}`;
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
      raw: row,
      projectId: extractProjectId(row, sheetLabel),
      account: extractAccount(row, sheetLabel),
      translator: extractTranslator(row, sheetLabel),
      reviewer: extractReviewer(row, sheetLabel),
      trDone: extractTrDone(row, sheetLabel),
      delivered: extractDelivered(row),
      deadline: extractDeadline(row, sheetLabel),
      total: extractTotal(row, sheetLabel),
      wwc: extractWWC(row, sheetLabel),
      revType: extractRevType(row),
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
  return (row["TR Deadline"] || row["Deadline"] || "").trim();
}
function extractTotal(row: any, sheet: string): string {
  return (row["Total"] || row["TWC"] || "0").toString().trim();
}
function extractWWC(row: any, sheet: string): string {
  return (row["TR WWC"] || row["WWC"] || "0").toString().trim();
}
function extractRevType(row: any): string {
  return (row["Rev Type"] || row["Rev\nType"] || "").trim();
}

// ============================================
// EMAIL TEMPLATES
// ============================================
function buildOfferEmailHtml(task: any, offer: any, assignment: any, baseUrl: string): string {
  const acceptUrl = `${baseUrl}/#/respond/${offer.token}`;
  const deadline = task.deadline || "TBD";
  const total = task.total || "N/A";
  const wwc = task.wwc || "N/A";
  const role = assignment.role === "translator" ? "Çeviri" : "Revizyon";

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<div style="max-width:600px;margin:0 auto;padding:24px">
<div style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">
  <div style="background:#1a1a2e;padding:24px 32px;color:#fff">
    <h1 style="margin:0;font-size:20px;font-weight:600">Yeni ${role} Görevi</h1>
    <p style="margin:8px 0 0;opacity:0.7;font-size:14px">ElTurco Projects</p>
  </div>
  <div style="padding:28px 32px">
    <p style="margin:0 0 16px;font-size:15px;color:#333">Merhaba <strong>${offer.freelancerName}</strong>,</p>
    <p style="margin:0 0 20px;font-size:14px;color:#555;line-height:1.6">
      Aşağıdaki ${role.toLowerCase()} görevi için uygun olup olmadığını öğrenmek istiyoruz.
    </p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 24px">
      <tr><td style="padding:10px 12px;background:#f8f9fa;font-size:13px;font-weight:600;color:#666;border-bottom:1px solid #eee;width:140px">Hesap</td><td style="padding:10px 12px;background:#f8f9fa;font-size:14px;color:#333;border-bottom:1px solid #eee">${task.account}</td></tr>
      <tr><td style="padding:10px 12px;font-size:13px;font-weight:600;color:#666;border-bottom:1px solid #eee">Kaynak / Sekme</td><td style="padding:10px 12px;font-size:14px;color:#333;border-bottom:1px solid #eee">${task.source} / ${task.sheet}</td></tr>
      <tr><td style="padding:10px 12px;background:#f8f9fa;font-size:13px;font-weight:600;color:#666;border-bottom:1px solid #eee">Proje ID</td><td style="padding:10px 12px;background:#f8f9fa;font-size:14px;color:#333;border-bottom:1px solid #eee">${task.projectId}</td></tr>
      <tr><td style="padding:10px 12px;font-size:13px;font-weight:600;color:#666;border-bottom:1px solid #eee">Deadline</td><td style="padding:10px 12px;font-size:14px;color:#e74c3c;font-weight:600;border-bottom:1px solid #eee">${deadline}</td></tr>
      <tr><td style="padding:10px 12px;background:#f8f9fa;font-size:13px;font-weight:600;color:#666;border-bottom:1px solid #eee">Toplam / WWC</td><td style="padding:10px 12px;background:#f8f9fa;font-size:14px;color:#333;border-bottom:1px solid #eee">${total} / ${wwc}</td></tr>
      <tr><td style="padding:10px 12px;font-size:13px;font-weight:600;color:#666;border-bottom:1px solid #eee">Görev Tipi</td><td style="padding:10px 12px;font-size:14px;color:#333;border-bottom:1px solid #eee">${role}</td></tr>
    </table>
    <div style="text-align:center;margin:28px 0">
      <a href="${acceptUrl}" style="display:inline-block;padding:14px 48px;background:#16a34a;color:#fff;text-decoration:none;border-radius:8px;font-size:16px;font-weight:600;letter-spacing:0.02em">Görevi Kabul Et</a>
    </div>
    <p style="margin:0;font-size:12px;color:#999;text-align:center;line-height:1.5">
      Bu link sadece size özeldir. Kabul etmek istemiyorsanız linke tıklayıp "Reddet" butonunu kullanabilirsiniz.
    </p>
  </div>
</div>
<p style="text-align:center;font-size:11px;color:#999;margin-top:16px">ElTurco Projects — projects@eltur.co</p>
</div>
</body>
</html>`;
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
  <p style="margin:0 0 24px;font-size:14px;color:#666">Merhaba ${name}, giriş yapmak için aşağıdaki butona tıkla.</p>
  <a href="${magicUrl}" style="display:inline-block;padding:14px 48px;background:#3b82f6;color:#fff;text-decoration:none;border-radius:8px;font-size:16px;font-weight:600">Giriş Yap</a>
  <p style="margin:20px 0 0;font-size:12px;color:#999">Bu link ${MAGIC_LINK_EXPIRY_MINUTES} dakika geçerlidir.</p>
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

  // Request magic link
  app.post("/api/auth/magic-link", async (req: Request, res: Response) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email required" });

    const pmUser = storage.getPmUserByEmail(email.toLowerCase().trim());
    if (!pmUser) return res.status(404).json({ error: "Bu e-posta adresi kayıtlı değil." });

    const token = generateToken();
    const expiresAt = new Date(Date.now() + MAGIC_LINK_EXPIRY_MINUTES * 60 * 1000).toISOString();
    storage.createAuthToken(token, email.toLowerCase().trim(), expiresAt);

    const baseUrl = resolveBaseUrl(req);
    const magicUrl = `${baseUrl}/#/auth/verify/${token}`;

    try {
      sendEmail([email], "ElTurco Dispatch - Giriş Linki", buildMagicLinkEmailHtml(pmUser.name, magicUrl));
      res.json({ success: true, message: "Giriş linki e-postanıza gönderildi." });
    } catch (e: any) {
      console.error("Email send error:", e);
      res.status(500).json({ error: "E-posta gönderilemedi: " + (e.message || "Bilinmeyen hata") });
    }
  });

  // Verify magic link token
  app.post("/api/auth/verify", async (req: Request, res: Response) => {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: "Token required" });

    const authToken = storage.getAuthToken(token);
    if (!authToken) return res.status(404).json({ error: "Geçersiz veya kullanılmış link." });
    if (authToken.used) return res.status(400).json({ error: "Bu link zaten kullanıldı." });
    if (new Date(authToken.expiresAt) < new Date()) return res.status(400).json({ error: "Bu linkin süresi dolmuş." });

    storage.markAuthTokenUsed(token);

    const pmUser = storage.getPmUserByEmail(authToken.email);
    if (!pmUser) return res.status(404).json({ error: "Kullanıcı bulunamadı." });

    const sessionToken = generateToken();
    const expiresAt = new Date(Date.now() + SESSION_EXPIRY_HOURS * 3600 * 1000).toISOString();
    storage.createSession(sessionToken, pmUser.id, expiresAt);

    res.json({ token: sessionToken, user: { id: pmUser.id, email: pmUser.email, name: pmUser.name, role: pmUser.role } });
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
      const freelancers = (Array.isArray(data) ? data : []).map((f: any) => ({
        id: f.id,
        fullName: f.full_name,
        resourceCode: f.resource_code,
        email: f.email,
        status: f.status,
        accounts: f.accounts || [],
        languagePairs: f.language_pairs || [],
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
      res.status(500).json({ error: "Freelancer verisi alınamadı: " + e.message });
    }
  });

  // ---- TASK ROUTES (SheetDB) ----

  app.get("/api/tasks", requireAuth, async (req: Request, res: Response) => {
    try {
      const allTasks: any[] = [];

      // Fetch in parallel
      const amazonPromises = AMAZON_TABS.map(t =>
        fetchSheetTasks(SHEETDB_AMAZON, t.tab, t.sheet, "Amazon")
      );
      const applePromises = APPLECARE_TABS.map(t =>
        fetchSheetTasks(SHEETDB_APPLECARE, t.tab, t.sheet, "AppleCare")
      );
      const results = await Promise.all([...amazonPromises, ...applePromises]);
      results.forEach(rows => allTasks.push(...rows));

      res.json(allTasks);
    } catch (e: any) {
      res.status(500).json({ error: "Görev verisi alınamadı: " + e.message });
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

  // Create assignment and send offers
  app.post("/api/assignments", requireAuth, async (req: Request, res: Response) => {
    const {
      source, sheet, projectId, account, taskDetails,
      assignmentType, role, freelancers,
      sequenceTimeoutMinutes, autoAssignReviewer,
      reviewerAssignmentType, reviewerSequenceList,
    } = req.body;

    if (!source || !projectId || !assignmentType || !role || !freelancers?.length) {
      return res.status(400).json({ error: "Eksik alanlar" });
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
      createdAt: now,
      offeredAt: now,
    });

    const baseUrl = resolveBaseUrl(req);

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
        });

        try {
          sendEmail(
            [f.email],
            `${role === "translator" ? "Çeviri" : "Revizyon"} Görevi — ${account} — ${projectId}`,
            buildOfferEmailHtml(task, offer, assignment, baseUrl)
          );
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
        });

        try {
          sendEmail(
            [first.email],
            `${role === "translator" ? "Çeviri" : "Revizyon"} Görevi — ${account} — ${projectId}`,
            buildOfferEmailHtml(task, offer, assignment, baseUrl)
          );
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
    if (!offer) return res.status(404).json({ error: "Teklif bulunamadı." });

    const assignment = storage.getAssignment(offer.assignmentId);
    if (!assignment) return res.status(404).json({ error: "Görev bulunamadı." });

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
      },
      task: taskDetails,
    });
  });

  // Accept offer
  app.post("/api/offers/:token/accept", async (req: Request, res: Response) => {
    const offer = storage.getOfferByToken(req.params.token);
    if (!offer) return res.status(404).json({ error: "Teklif bulunamadı." });
    if (offer.status !== "pending") {
      return res.status(400).json({ error: "Bu teklif artık geçerli değil.", currentStatus: offer.status });
    }

    const assignment = storage.getAssignment(offer.assignmentId);
    if (!assignment) return res.status(404).json({ error: "Görev bulunamadı." });
    if (assignment.status === "accepted" || assignment.status === "completed") {
      // Already taken by someone else
      storage.updateOffer(offer.id, { status: "withdrawn", respondedAt: new Date().toISOString() });
      return res.status(400).json({ error: "Bu görev başka bir çevirmen tarafından zaten kabul edildi." });
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

    // Update Google Sheet - write initial to TR or Rev column
    try {
      updateSheetCell(assignment, offer.freelancerCode);
    } catch (e) {
      console.error("Sheet update error:", e);
    }

    res.json({ success: true, message: "Görev kabul edildi. Teşekkürler!" });
  });

  // Reject offer
  app.post("/api/offers/:token/reject", async (req: Request, res: Response) => {
    const offer = storage.getOfferByToken(req.params.token);
    if (!offer) return res.status(404).json({ error: "Teklif bulunamadı." });
    if (offer.status !== "pending") {
      return res.status(400).json({ error: "Bu teklif artık geçerli değil.", currentStatus: offer.status });
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
            const baseUrl = resolveBaseUrl(req);
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
            });

            sendEmail(
              [nextFreelancer.email],
              `${assignment.role === "translator" ? "Çeviri" : "Revizyon"} Görevi — ${assignment.account} — ${assignment.projectId}`,
              buildOfferEmailHtml(taskDetails, newOffer, assignment, baseUrl)
            );
          }
        } catch (e) {
          console.error("Sequence advance error:", e);
        }
      } else {
        // No more freelancers in sequence
        storage.updateAssignment(assignment.id, { status: "expired" });
      }
    }

    res.json({ success: true, message: "Teklif reddedildi." });
  });

  // Mark task as completed by freelancer
  app.post("/api/offers/:token/complete", async (req: Request, res: Response) => {
    const offer = storage.getOfferByToken(req.params.token);
    if (!offer) return res.status(404).json({ error: "Teklif bulunamadı." });
    if (offer.status !== "accepted") {
      return res.status(400).json({ error: "Sadece kabul edilmiş görevler tamamlanabilir." });
    }

    const assignment = storage.getAssignment(offer.assignmentId);
    if (!assignment) return res.status(404).json({ error: "Görev bulunamadı." });

    const now = new Date().toISOString();
    storage.updateAssignment(assignment.id, { status: "completed", completedAt: now });

    // Update Google Sheet - write "Yes" to TR Done or Rev Done column
    try {
      updateSheetDone(assignment, offer.freelancerCode);
    } catch (e) {
      console.error("Sheet update error on complete:", e);
    }

    res.json({ success: true, message: "Görev tamamlandı olarak işaretlendi!" });
  });

  // ---- GOOGLE SHEETS UPDATE HELPERS ----

  function updateSheetCell(assignment: any, freelancerCode: string) {
    // We use SheetDB PATCH to update the row
    const apiId = assignment.source === "Amazon" ? SHEETDB_AMAZON : SHEETDB_APPLECARE;
    const taskDetails = JSON.parse(assignment.taskDetails || "{}");
    const projectId = assignment.projectId;
    const sheet = assignment.sheet;

    // Determine which column to update based on role
    const column = assignment.role === "translator" ? getTranslatorColumn(sheet) : getReviewerColumn(sheet);
    if (!column) return;

    // Find the sheet tab name
    const tabName = getTabName(assignment.source, sheet);
    if (!tabName) return;

    // SheetDB PATCH by searching for project ID
    const idColumn = getIdColumn(sheet);
    const url = `https://sheetdb.io/api/v1/${apiId}/${idColumn}/${encodeURIComponent(projectId)}?sheet=${encodeURIComponent(tabName)}`;

    fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: { [column]: freelancerCode } }),
    }).catch(e => console.error("SheetDB PATCH error:", e));
  }

  function updateSheetDone(assignment: any, freelancerCode: string) {
    const apiId = assignment.source === "Amazon" ? SHEETDB_AMAZON : SHEETDB_APPLECARE;
    const sheet = assignment.sheet;
    const projectId = assignment.projectId;

    const column = assignment.role === "translator" ? getTrDoneColumn(sheet) : getRevDoneColumn(sheet);
    if (!column) return;

    const tabName = getTabName(assignment.source, sheet);
    if (!tabName) return;

    const idColumn = getIdColumn(sheet);
    const url = `https://sheetdb.io/api/v1/${apiId}/${idColumn}/${encodeURIComponent(projectId)}?sheet=${encodeURIComponent(tabName)}`;

    const value = assignment.role === "reviewer" ? new Date().toISOString().slice(11, 16) : "Yes";

    fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: { [column]: value } }),
    }).catch(e => console.error("SheetDB PATCH done error:", e));
  }

  function getTranslatorColumn(sheet: string): string | null {
    if (sheet === "TPT") return "TR";
    if (sheet === "DPX") return null; // DPX has no translator
    return "TR "; // non-AFT, AFT have "TR " with trailing space, but let's check
  }
  function getReviewerColumn(sheet: string): string {
    if (sheet === "TPT") return "REV";
    return "Rev";
  }
  function getTrDoneColumn(sheet: string): string | null {
    if (sheet === "TPT") return "TR\nDone?";
    if (sheet === "DPX") return null;
    return "TR Dlvr";
  }
  function getRevDoneColumn(sheet: string): string | null {
    if (sheet === "TPT") return "Rev\nDone?";
    return "Rev Complete?";
  }
  function getIdColumn(sheet: string): string {
    if (sheet === "TPT") return "ATMS ID";
    if (sheet === "Assignments" || sheet === "RU Assignments" || sheet === "AR Assignments") return "ID";
    return "Project ID";
  }
  function getTabName(source: string, sheet: string): string | null {
    if (source === "Amazon") {
      const found = AMAZON_TABS.find(t => t.sheet === sheet);
      return found ? found.tab : null;
    }
    const found = APPLECARE_TABS.find(t => t.sheet === sheet);
    return found ? found.tab : null;
  }

  // ---- PM MANAGEMENT ----

  app.get("/api/pm-users", requireAuth, (_req: Request, res: Response) => {
    res.json(storage.getAllPmUsers());
  });

  app.post("/api/pm-users", requireAuth, (req: Request, res: Response) => {
    const { email, name, role } = req.body;
    if (!email || !name) return res.status(400).json({ error: "Email and name required" });
    const existing = storage.getPmUserByEmail(email.toLowerCase().trim());
    if (existing) return res.status(400).json({ error: "Bu e-posta zaten kayıtlı." });
    const user = storage.createPmUser({ email: email.toLowerCase().trim(), name, role: role || "pm" });
    res.json(user);
  });
}

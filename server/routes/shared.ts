/**
 * Shared utilities, middleware, and helpers used by all domain routers.
 * Extracted from the monolithic routes.ts to avoid duplication.
 */
import type { Request, Response, NextFunction } from "express";
import { storage, db } from "../storage";
import { verifyToken } from "../jwt";
import { wsBroadcast } from "../ws";
import { z } from "zod";
import { auditLog, notificationsV2 } from "@shared/schema";
import rateLimit from "express-rate-limit";

// ============================================
// CONFIG
// ============================================
export const BASE44_API = process.env.BASE44_API || "https://elts.base44.app/api/apps/694868412332f081649b2833/entities/Freelancer";
export const BASE44_KEY = process.env.BASE44_KEY || "";
export const FROM_EMAIL = process.env.FROM_EMAIL || "ElTurco Projects <projects@eltur.co>";
export const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
export const SHEETDB_API_KEY = process.env.SHEETDB_API_KEY || "";
export const MAGIC_LINK_EXPIRY_MINUTES = 30;
export const SESSION_EXPIRY_HOURS = 72;
export const SITE_PUBLIC_URL = process.env.SITE_PUBLIC_URL || "https://dispatch.eltur.co";
export const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL || "";

// ============================================
// VALIDATION
// ============================================
export function validate<T>(schema: z.ZodType<T>, data: unknown, res: Response): T | null {
  const result = schema.safeParse(data);
  if (!result.success) {
    res.status(400).json({ error: "Validation error", details: result.error.issues.map(i => i.message).join(", ") });
    return null;
  }
  return result.data;
}

// ============================================
// AUTH MIDDLEWARE
// ============================================
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "No token provided" });

  const jwtPayload = verifyToken(token);
  if (jwtPayload) {
    (req as any).pmUserId = jwtPayload.pmUserId;
    return next();
  }

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
// RBAC MIDDLEWARE
// ============================================
export const ROLES = ["admin", "gm", "operations_manager", "pm_team_lead", "vm", "quality_lead", "pm", "pc", "finans", "vendor", "client"] as const;
export type Role = typeof ROLES[number];

export const ROLE_HIERARCHY: Record<string, number> = {
  vendor: 0, client: 0, pc: 1, pm: 2, vm: 3, quality_lead: 3, finans: 3,
  pm_team_lead: 4, operations_manager: 5, admin: 6, gm: 7,
};

export function requireRole(...allowedRoles: string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const pmUserId = (req as any).pmUserId;
    if (!pmUserId) return res.status(401).json({ error: "Not authenticated" });
    const user = await storage.getUserById(pmUserId) || (await storage.getAllPmUsers()).find(u => u.id === pmUserId);
    if (!user) return res.status(404).json({ error: "User not found" });
    const userRole = (user as any).role || "pm";
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

export async function requireVendorAuth(req: Request, res: Response, next: NextFunction) {
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

// ============================================
// RATE LIMITERS
// ============================================
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: "Too many login attempts. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

export const offerLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: "Too many requests. Please slow down." },
});

export const magicLinkLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: "Too many magic link requests. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

// ============================================
// HELPERS
// ============================================
export function param(req: Request, name: string): string {
  const v = req.params[name];
  return Array.isArray(v) ? v[0] : v;
}

export function safeError(fallback: string, e: any): string {
  if (process.env.NODE_ENV === "production") return fallback;
  return e?.message || fallback;
}

export function getClientIp(req: Request): string {
  return (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || "unknown";
}

export function maskCredentials(creds: Record<string, any>): Record<string, any> {
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

export function generateToken(): string {
  const { randomUUID } = require("crypto");
  return randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
}

// ============================================
// AUDIT LOGGING
// ============================================
export async function logAudit(
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
    console.error("Audit log error:", e);
  }
}

// ============================================
// NOTIFICATIONS
// ============================================
export async function notify(type: string, title: string, message: string, metadata?: any) {
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

export async function createNotificationV2(pmUserId: number, type: string, title: string, message: string, link?: string) {
  try {
    await db.insert(notificationsV2).values({ pmUserId, type, title, message, link });
    wsBroadcast("notification" as any, { type, title, message } as any);
  } catch (e) { console.error("Notification create error:", e); }
}

// ============================================
// URL RESOLUTION
// ============================================
export function resolveBaseUrl(req: Request): string {
  const clientBase = req.body?.clientBaseUrl;
  if (clientBase && typeof clientBase === "string" && clientBase.startsWith("http")) {
    return clientBase.replace(/\/+$/, "");
  }
  const referer = req.headers.referer || req.headers.referrer;
  if (referer) {
    try {
      const u = new URL(referer as string);
      return u.origin;
    } catch {}
  }
  const origin = req.headers.origin;
  if (origin && !origin.includes("localhost") && !origin.includes("127.0.0.1")) {
    return origin as string;
  }
  const fwdProto = req.headers["x-forwarded-proto"];
  const fwdHost  = req.headers["x-forwarded-host"];
  if (fwdProto && fwdHost) {
    return `${fwdProto}://${fwdHost}`;
  }
  const proto = req.protocol || "http";
  const host  = req.headers.host || "localhost:5000";
  return `${proto}://${host}`;
}

export function buildApiBase(req: Request): string {
  const fromBody = req.body?.apiBaseUrl;
  if (fromBody && typeof fromBody === "string" && fromBody.startsWith("http")) {
    return fromBody.replace(/\/+$/, "");
  }
  const fwdProto = req.headers["x-forwarded-proto"] || req.protocol || "https";
  const fwdHost  = req.headers["x-forwarded-host"] || req.headers.host;
  if (fwdHost) return `${fwdProto}://${fwdHost}`;
  return `${req.protocol || "http"}://${req.headers.host || "localhost:5000"}`;
}

// ============================================
// EMAIL — Resend API
// ============================================
export async function sendEmail(to: string[], subject: string, html: string) {
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
// SLACK NOTIFICATIONS
// ============================================
export async function sendSlackNotification(text: string) {
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

// ============================================
// CACHE
// ============================================
interface CacheEntry<T> { data: T; timestamp: number; }
const cache: Record<string, CacheEntry<any>> = {};
export function getCached<T>(key: string, ttlMs: number): T | null {
  const entry = cache[key];
  if (entry && Date.now() - entry.timestamp < ttlMs) return entry.data as T;
  return null;
}
export function setCache<T>(key: string, data: T): void {
  cache[key] = { data, timestamp: Date.now() };
}
export function invalidateCache(key: string): void {
  delete cache[key];
}

// ============================================
// MUTEX
// ============================================
const activeLocks = new Set<string>();
export function acquireLock(key: string): boolean {
  if (activeLocks.has(key)) return false;
  activeLocks.add(key);
  return true;
}
export function releaseLock(key: string) {
  activeLocks.delete(key);
}

// ============================================
// EMAIL TEMPLATES
// ============================================
export function buildRedirectPage(targetUrl: string, message: string): string {
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

export function buildMagicLinkEmailHtml(name: string, magicUrl: string): string {
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

export function replaceVars(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? "");
}

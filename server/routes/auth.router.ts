/**
 * Auth Router — handles all authentication-related routes.
 * Extracted from the monolithic routes.ts.
 *
 * Routes:
 *   POST /auth/login
 *   GET  /auth/redirect/:token
 *   GET  /offers/redirect/:token
 *   GET  /auth/me
 *   POST /auth/logout
 *   POST /freelancer/magic-link
 *   POST /freelancer/verify/:token
 *   POST /auth/vendor-magic-link
 *   GET  /auth/vendor-verify/:token
 */
import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { storage } from "../storage";
import { createToken } from "../jwt";
import {
  requireAuth,
  requireVendorAuth,
  validate,
  param,
  loginLimiter,
  magicLinkLimiter,
  resolveBaseUrl,
  generateToken,
  safeError,
  sendEmail,
  buildMagicLinkEmailHtml,
  buildRedirectPage,
  MAGIC_LINK_EXPIRY_MINUTES,
  SESSION_EXPIRY_HOURS,
  SITE_PUBLIC_URL,
  BASE44_API,
  BASE44_KEY,
  getCached,
  setCache,
} from "./shared";

const router = Router();

// ============================================
// ZOD SCHEMA
// ============================================
const loginSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(1).max(200),
});

// ============================================
// AUTH ROUTES
// ============================================

// Email + password login
router.post("/auth/login", loginLimiter, async (req: Request, res: Response) => {
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
router.get("/auth/redirect/:token", async (req: Request, res: Response) => {
  const authToken = await storage.getAuthToken(param(req, "token"));
  if (!authToken || !authToken.clientBaseUrl) {
    return res.status(404).send("Invalid or expired link.");
  }
  const frontendUrl = `${authToken.clientBaseUrl}#/auth/verify/${param(req, "token")}`;
  res.type("html").send(buildRedirectPage(frontendUrl, "Signing you in..."));
});

// Offer redirect: freelancer email links point here
router.get("/offers/redirect/:token", async (req: Request, res: Response) => {
  const offer = await storage.getOfferByToken(param(req, "token"));
  if (!offer) {
    return res.status(404).send("Offer not found or expired.");
  }
  const base = offer.clientBaseUrl || SITE_PUBLIC_URL;
  const frontendUrl = `${base}#/respond/${param(req, "token")}`;
  res.type("html").send(buildRedirectPage(frontendUrl, "Loading task details..."));
});

// Get current user
router.get("/auth/me", requireAuth, async (req: Request, res: Response) => {
  const pmUserId = (req as any).pmUserId;
  const allUsers = await storage.getAllPmUsers();
  const user = allUsers.find(u => u.id === pmUserId);
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({ id: user.id, email: user.email, name: user.name, role: user.role });
});

router.post("/auth/logout", async (req: Request, res: Response) => {
  // JWT is stateless — logout just acknowledges. Client clears its stored token.
  // Also delete legacy DB session if it exists.
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (token) {
    try { await storage.deleteSession(token); } catch {}
  }
  res.json({ success: true });
});

// ============================================
// FREELANCER PORTAL — MAGIC LINK AUTH
// ============================================

// Magic link request — freelancer enters their email
router.post("/freelancer/magic-link", magicLinkLimiter, async (req: Request, res: Response) => {
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
router.post("/freelancer/verify/:token", async (req: Request, res: Response) => {
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

// ============================================
// VENDOR MAGIC LINK AUTH
// ============================================

router.post("/auth/vendor-magic-link", magicLinkLimiter, async (req: Request, res: Response) => {
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

router.get("/auth/vendor-verify/:token", async (req: Request, res: Response) => {
  const session = await storage.getVendorSession(param(req, "token"));
  if (!session) return res.status(404).json({ error: "Invalid or expired link" });
  if (new Date(session.expiresAt) < new Date()) {
    await storage.deleteVendorSession(param(req, "token"));
    return res.status(401).json({ error: "Link expired" });
  }
  const vendor = await storage.getVendor(session.vendorId);
  res.json({ token: param(req, "token"), vendor: vendor ? { id: vendor.id, fullName: vendor.fullName, email: vendor.email } : null });
});

export default router;

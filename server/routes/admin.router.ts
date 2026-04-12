/**
 * Admin Router — user management, entity CRUD, settings, notifications V2,
 * PM assignments, and seed QA data.
 *
 * Routes:
 *   GET    /users
 *   POST   /users
 *   PATCH  /users/:id
 *   DELETE /users/:id
 *   GET    /entities
 *   POST   /entities
 *   PATCH  /entities/:id
 *   GET    /settings
 *   PATCH  /settings/:key
 *   POST   /settings
 *   GET    /notifications-v2
 *   PATCH  /notifications-v2/:id/read
 *   POST   /notifications-v2/read-all
 *   DELETE /notifications-v2/:id
 *   GET    /pm-assignments
 *   POST   /pm-assignments
 *   DELETE /pm-assignments/:id
 *   POST   /seed-qa
 */
import { Router, Request, Response } from "express";
import { storage, db } from "../storage";
import {
  users, entities, notificationsV2, pmCustomerAssignments, customers, vendors,
  projects, jobs, qualityReports, purchaseOrders, clientInvoices, payments,
  vendorLanguagePairs, vendorRateCards,
  portalTasks as portalTasksTable,
  auditLog,
} from "@shared/schema";
import { eq, and, sql, desc } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { z } from "zod";
import {
  requireAuth,
  requireRole,
  validate,
  param,
  safeError,
  logAudit,
  getClientIp,
  createNotificationV2,
} from "./shared";

const router = Router();

// ============================================
// ZOD SCHEMA
// ============================================
const createUserSchema = z.object({
  email: z.string().email().max(255),
  name: z.string().min(1).max(200),
  role: z.string().min(1).max(50),
  password: z.string().min(8).max(200).optional(),
  initial: z.string().max(10).optional().nullable(),
  entityId: z.number().int().positive().optional().nullable(),
});

// ============================================
// USERS CRUD (admin/gm only)
// ============================================

router.get("/users", requireAuth, requireRole("admin", "gm", "operations_manager"), async (req: Request, res: Response) => {
  const allUsers = await storage.getAllUsers();
  res.json(allUsers.map((u: any) => ({ ...u, passwordHash: undefined })));
});

router.post("/users", requireAuth, requireRole("admin", "gm"), async (req: Request, res: Response) => {
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

router.patch("/users/:id", requireAuth, requireRole("admin", "gm"), async (req: Request, res: Response) => {
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

router.delete("/users/:id", requireAuth, requireRole("admin", "gm"), async (req: Request, res: Response) => {
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

// ============================================
// ENTITIES
// ============================================

router.get("/entities", requireAuth, async (_req: Request, res: Response) => {
  const allEntities = await storage.getAllEntities();
  res.json(allEntities);
});

router.post("/entities", requireAuth, async (req: Request, res: Response) => {
  try {
    const entity = await storage.createEntity(req.body);
    res.json(entity);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Failed to create entity", e) });
  }
});

router.patch("/entities/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const entity = await storage.updateEntity(+param(req, "id"), req.body);
    res.json(entity);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Failed to update entity", e) });
  }
});

// ============================================
// SETTINGS
// ============================================

router.get("/settings", requireAuth, async (_req: Request, res: Response) => {
  const allSettings = await storage.getAllSettings();
  res.json(allSettings);
});

router.patch("/settings/:key", requireAuth, async (req: Request, res: Response) => {
  try {
    const setting = await storage.upsertSetting(param(req, "key"), req.body.value, req.body.category, req.body.description);
    res.json(setting);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Internal server error", e) });
  }
});

router.post("/settings", requireAuth, async (req: Request, res: Response) => {
  try {
    const { key, value, category, description } = req.body;
    if (!key) return res.status(400).json({ error: "key is required" });
    const setting = await storage.upsertSetting(key, value ?? {}, category, description);
    res.json(setting);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Failed to create setting", e) });
  }
});

// ============================================
// NOTIFICATIONS V2
// ============================================

router.get("/notifications-v2", requireAuth, async (req: Request, res: Response) => {
  try {
    const pmUserId = (req as any).pmUserId;
    const nots = await db.select().from(notificationsV2).where(eq(notificationsV2.pmUserId, pmUserId)).orderBy(desc(notificationsV2.createdAt)).limit(50);
    const [unreadResult] = await db.select({ cnt: sql<number>`count(*)::int` }).from(notificationsV2).where(and(eq(notificationsV2.pmUserId, pmUserId), eq(notificationsV2.read, false)));
    res.json({ notifications: nots, unreadCount: unreadResult?.cnt || 0 });
  } catch (e: any) {
    res.status(500).json({ error: safeError("Failed to get notifications", e) });
  }
});

router.patch("/notifications-v2/:id/read", requireAuth, async (req: Request, res: Response) => {
  try {
    await db.update(notificationsV2).set({ read: true }).where(eq(notificationsV2.id, +param(req, "id")));
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: safeError("Failed to mark notification read", e) });
  }
});

router.post("/notifications-v2/read-all", requireAuth, async (req: Request, res: Response) => {
  try {
    const pmUserId = (req as any).pmUserId;
    await db.update(notificationsV2).set({ read: true }).where(and(eq(notificationsV2.pmUserId, pmUserId), eq(notificationsV2.read, false)));
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: safeError("Failed to mark all read", e) });
  }
});

router.delete("/notifications-v2/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    await db.update(notificationsV2).set({ read: true }).where(eq(notificationsV2.id, +param(req, "id")));
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: safeError("Failed to dismiss notification", e) });
  }
});

// ============================================
// PM ASSIGNMENTS (Phase E)
// ============================================

router.get("/pm-assignments", requireAuth, async (req: Request, res: Response) => {
  try {
    const rows = await db.select().from(pmCustomerAssignments).orderBy(desc(pmCustomerAssignments.createdAt));
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Failed to get PM assignments", e) });
  }
});

router.post("/pm-assignments", requireAuth, async (req: Request, res: Response) => {
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

router.delete("/pm-assignments/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    await db.delete(pmCustomerAssignments).where(eq(pmCustomerAssignments.id, +param(req, "id")));
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: safeError("Failed to delete PM assignment", e) });
  }
});

// ============================================
// SEED QA ENDPOINT (dev/staging only, admin role required)
// ============================================

router.post("/seed-qa", requireAuth, requireRole("admin", "gm"), async (req: Request, res: Response) => {
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

    // Seed 8 vendors
    // Clean up previous seed vendors and related data
    await db.delete(vendorLanguagePairs).where(
      sql`vendor_id IN (SELECT id FROM vendors WHERE email LIKE '%@example.com')`
    );
    await db.delete(vendorRateCards).where(
      sql`vendor_id IN (SELECT id FROM vendors WHERE email LIKE '%@example.com')`
    );
    await db.delete(qualityReports).where(
      sql`vendor_id IN (SELECT id FROM vendors WHERE email LIKE '%@example.com')`
    );
    await db.delete(vendors).where(sql`email LIKE '%@example.com'`);

    const vendorSeedData = [
      { resourceCode: "VND-001", fullName: "Ay\u015fe Kaya", email: "ayse.kaya@example.com", phone: "+90 532 111 2233", location: "Istanbul, Turkey", nativeLanguage: "Turkish", translationSpecializations: ["Technology", "Legal"], serviceTypes: ["Translation", "MTPE", "Review"], status: "Approved", combinedQualityScore: "85.00", averageQsScore: "4.20", totalReviewsCount: 12, valueIndex: "14.1667", tier: "premium", rates: [{ type: "per_word", value: 0.06, currency: "EUR", service: "Translation" }], experienceYears: 8 },
      { resourceCode: "VND-002", fullName: "Hans M\u00fcller", email: "hans.muller@example.com", phone: "+49 170 222 3344", location: "Berlin, Germany", nativeLanguage: "German", translationSpecializations: ["Automotive", "Technology"], serviceTypes: ["Translation", "Review"], status: "Approved", combinedQualityScore: "78.00", averageQsScore: "3.80", totalReviewsCount: 8, valueIndex: "9.7500", tier: "standard", rates: [{ type: "per_word", value: 0.08, currency: "EUR", service: "Translation" }], experienceYears: 12 },
      { resourceCode: "VND-003", fullName: "Marie Dupont", email: "marie.dupont@example.com", phone: "+33 6 33 44 55 66", location: "Paris, France", nativeLanguage: "French", translationSpecializations: ["Marketing", "Fashion"], serviceTypes: ["Translation", "MTPE"], status: "Approved", combinedQualityScore: "92.00", averageLqaScore: "92.00", averageQsScore: "4.60", totalReviewsCount: 15, valueIndex: "13.1429", tier: "premium", rates: [{ type: "per_word", value: 0.07, currency: "EUR", service: "Translation" }], experienceYears: 10 },
      { resourceCode: "VND-004", fullName: "Carlos Garc\u00eda", email: "carlos.garcia@example.com", phone: "+34 612 445 566", location: "Madrid, Spain", nativeLanguage: "Spanish", translationSpecializations: ["Entertainment", "Media"], serviceTypes: ["Translation", "Subtitling"], status: "Approved", combinedQualityScore: "80.00", averageQsScore: "4.00", totalReviewsCount: 10, valueIndex: "12.3077", tier: "standard", rates: [{ type: "per_word", value: 0.065, currency: "EUR", service: "Translation" }], experienceYears: 6 },
      { resourceCode: "VND-005", fullName: "Ana Silva", email: "ana.silva@example.com", phone: "+351 912 556 677", location: "Lisbon, Portugal", nativeLanguage: "Portuguese", translationSpecializations: ["Technology", "E-commerce"], serviceTypes: ["Translation", "MTPE"], status: "Approved", combinedQualityScore: "88.00", averageQsScore: "4.50", totalReviewsCount: 11, valueIndex: "16.0000", tier: "premium", rates: [{ type: "per_word", value: 0.055, currency: "EUR", service: "Translation" }], experienceYears: 7 },
      { resourceCode: "VND-006", fullName: "Mehmet Y\u0131lmaz", email: "mehmet.yilmaz@example.com", phone: "+90 533 667 7888", location: "Ankara, Turkey", nativeLanguage: "Turkish", translationSpecializations: ["Gaming", "Technology"], serviceTypes: ["Translation", "LQA"], status: "Test Sent", combinedQualityScore: "70.00", averageQsScore: "3.50", totalReviewsCount: 3, valueIndex: "14.0000", tier: "economy", rates: [{ type: "per_word", value: 0.05, currency: "EUR", service: "Translation" }], experienceYears: 3 },
      { resourceCode: "VND-007", fullName: "Sophie Weber", email: "sophie.weber@example.com", phone: "+49 171 778 8999", location: "Munich, Germany", nativeLanguage: "German", translationSpecializations: ["Medical", "Pharma"], serviceTypes: ["Translation", "Review", "LQA"], status: "Price Negotiation", combinedQualityScore: null, averageQsScore: null, totalReviewsCount: 0, valueIndex: null, tier: "standard", rates: [{ type: "per_word", value: 0.10, currency: "EUR", service: "Translation" }], experienceYears: 15 },
      { resourceCode: "VND-008", fullName: "Pierre Martin", email: "pierre.martin@example.com", phone: "+33 6 88 99 00 11", location: "Lyon, France", nativeLanguage: "French", translationSpecializations: ["Legal", "Finance"], serviceTypes: ["Translation"], status: "New Application", combinedQualityScore: null, averageQsScore: null, totalReviewsCount: 0, valueIndex: null, tier: "standard", rates: [{ type: "per_word", value: 0.09, currency: "EUR", service: "Translation" }], experienceYears: 5 },
    ];

    const vendorIds: Record<string, number> = {};
    for (const v of vendorSeedData) {
      const [inserted] = await db.insert(vendors).values({
        resourceCode: v.resourceCode, fullName: v.fullName, email: v.email, phone: v.phone,
        location: v.location, nativeLanguage: v.nativeLanguage, translationSpecializations: v.translationSpecializations,
        serviceTypes: v.serviceTypes, status: v.status, combinedQualityScore: v.combinedQualityScore,
        averageLqaScore: (v as any).averageLqaScore || null, averageQsScore: v.averageQsScore,
        totalReviewsCount: v.totalReviewsCount, valueIndex: v.valueIndex, tier: v.tier,
        currency: "EUR", rates: v.rates, experienceYears: v.experienceYears, resourceType: "Freelancer",
      }).returning({ id: vendors.id });
      vendorIds[v.fullName] = inserted.id;
    }

    // Vendor language pairs
    const langPairData: { vendorName: string; pairs: { source: string; target: string; isPrimary: boolean }[] }[] = [
      { vendorName: "Ay\u015fe Kaya", pairs: [{ source: "EN", target: "TR", isPrimary: true }, { source: "TR", target: "EN", isPrimary: false }] },
      { vendorName: "Hans M\u00fcller", pairs: [{ source: "EN", target: "DE", isPrimary: true }, { source: "DE", target: "EN", isPrimary: false }] },
      { vendorName: "Marie Dupont", pairs: [{ source: "EN", target: "FR", isPrimary: true }, { source: "FR", target: "EN", isPrimary: false }] },
      { vendorName: "Carlos Garc\u00eda", pairs: [{ source: "EN", target: "ES", isPrimary: true }, { source: "ES", target: "EN", isPrimary: false }] },
      { vendorName: "Ana Silva", pairs: [{ source: "EN", target: "PT", isPrimary: true }, { source: "PT", target: "EN", isPrimary: false }] },
      { vendorName: "Mehmet Y\u0131lmaz", pairs: [{ source: "EN", target: "TR", isPrimary: true }] },
      { vendorName: "Sophie Weber", pairs: [{ source: "EN", target: "DE", isPrimary: true }] },
      { vendorName: "Pierre Martin", pairs: [{ source: "EN", target: "FR", isPrimary: true }] },
    ];
    for (const lp of langPairData) {
      for (const pair of lp.pairs) {
        await db.insert(vendorLanguagePairs).values({ vendorId: vendorIds[lp.vendorName], sourceLanguage: pair.source, targetLanguage: pair.target, isPrimary: pair.isPrimary });
      }
    }

    // Vendor rate cards
    const rateCardData: { vendorName: string; cards: { source: string; target: string; service: string; rateType: string; rateValue: string; ratePerWord: string | null }[] }[] = [
      { vendorName: "Ay\u015fe Kaya", cards: [{ source: "EN", target: "TR", service: "Translation", rateType: "per_word", rateValue: "0.0600", ratePerWord: "0.0600" }, { source: "EN", target: "TR", service: "MTPE", rateType: "per_word", rateValue: "0.0400", ratePerWord: "0.0400" }] },
      { vendorName: "Hans M\u00fcller", cards: [{ source: "EN", target: "DE", service: "Translation", rateType: "per_word", rateValue: "0.0800", ratePerWord: "0.0800" }] },
      { vendorName: "Marie Dupont", cards: [{ source: "EN", target: "FR", service: "Translation", rateType: "per_word", rateValue: "0.0700", ratePerWord: "0.0700" }, { source: "EN", target: "FR", service: "MTPE", rateType: "per_word", rateValue: "0.0500", ratePerWord: "0.0500" }] },
      { vendorName: "Carlos Garc\u00eda", cards: [{ source: "EN", target: "ES", service: "Translation", rateType: "per_word", rateValue: "0.0650", ratePerWord: "0.0650" }] },
      { vendorName: "Ana Silva", cards: [{ source: "EN", target: "PT", service: "Translation", rateType: "per_word", rateValue: "0.0550", ratePerWord: "0.0550" }] },
      { vendorName: "Mehmet Y\u0131lmaz", cards: [{ source: "EN", target: "TR", service: "Translation", rateType: "per_word", rateValue: "0.0500", ratePerWord: "0.0500" }] },
      { vendorName: "Sophie Weber", cards: [{ source: "EN", target: "DE", service: "Translation", rateType: "per_word", rateValue: "0.1000", ratePerWord: "0.1000" }] },
      { vendorName: "Pierre Martin", cards: [{ source: "EN", target: "FR", service: "Translation", rateType: "per_word", rateValue: "0.0900", ratePerWord: "0.0900" }] },
    ];
    for (const rc of rateCardData) {
      for (const card of rc.cards) {
        await db.insert(vendorRateCards).values({ vendorId: vendorIds[rc.vendorName], sourceLanguage: card.source, targetLanguage: card.target, serviceType: card.service, rateType: card.rateType, rateValue: card.rateValue, ratePerWord: card.ratePerWord, currency: "EUR" });
      }
    }

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

    const ayseId = vendorIds["Ay\u015fe Kaya"];

    // Project 1
    const [p1] = await db.insert(projects).values({
      entityId, customerId, projectName: "Samsung Mobile App Localization", projectCode: "MAN-2026-0050",
      source: "manual", status: "in_progress", deadline: in5days,
    }).returning({ id: projects.id });

    await db.insert(jobs).values([
      { projectId: p1.id, jobCode: "MAN-2026-0050-TR", jobName: "EN>TR Translation", sourceLanguage: "EN", targetLanguage: "TR", serviceType: "Translation", status: "assigned", wordCount: 2500, vendorId: ayseId, assignedAt: now, vendorRate: "0.0600", clientRate: "0.1000", vendorTotal: "150.00", clientTotal: "250.00", deadline: in5days },
      { projectId: p1.id, jobCode: "MAN-2026-0050-DE", jobName: "EN>DE Translation", sourceLanguage: "EN", targetLanguage: "DE", serviceType: "Translation", status: "unassigned", wordCount: 2500, vendorRate: "0.0800", clientRate: "0.1200", vendorTotal: "200.00", clientTotal: "300.00", deadline: in5days },
      { projectId: p1.id, jobCode: "MAN-2026-0050-FR", jobName: "EN>FR Translation", sourceLanguage: "EN", targetLanguage: "FR", serviceType: "Translation", status: "unassigned", wordCount: 2500, vendorRate: "0.0700", clientRate: "0.1100", vendorTotal: "175.00", clientTotal: "275.00", deadline: in5days },
    ]);

    // Project 2
    const [p2] = await db.insert(projects).values({
      entityId, customerId, projectName: "Netflix Subtitle Translation", projectCode: "SYM-2026-0399",
      source: "symfonie", externalId: "SYM-2026-0399", status: "confirmed", deadline: in5days,
    }).returning({ id: projects.id });

    await db.insert(jobs).values([
      { projectId: p2.id, jobCode: "SYM-2026-0399-ES", jobName: "EN>ES Translation", sourceLanguage: "EN", targetLanguage: "ES", serviceType: "Translation", status: "unassigned", wordCount: 2500, vendorRate: "0.0650", clientRate: "0.1000", vendorTotal: "162.50", clientTotal: "250.00", deadline: in5days },
      { projectId: p2.id, jobCode: "SYM-2026-0399-PT", jobName: "EN>PT Translation", sourceLanguage: "EN", targetLanguage: "PT", serviceType: "Translation", status: "unassigned", wordCount: 2500, vendorRate: "0.0550", clientRate: "0.0900", vendorTotal: "137.50", clientTotal: "225.00", deadline: in5days },
    ]);

    // Seed notifications
    await db.delete(notificationsV2).where(
      sql`${notificationsV2.title} LIKE 'New Symfonie task: Amazon%' OR ${notificationsV2.title} LIKE 'Deadline approaching: Lionbridge%'`
    );

    await db.insert(notificationsV2).values([
      { pmUserId: 5, type: "task_incoming", title: "New Symfonie task: Amazon Product Listings", message: "A new task from Symfonie portal is awaiting your review.", read: false },
      { pmUserId: 5, type: "deadline_warning", title: "Deadline approaching: Lionbridge Legal Review (tomorrow)", message: "The Lionbridge Legal Review DE>EN task deadline is tomorrow.", read: false },
    ]);

    // Seed activity feed (audit_log)
    let auditUserId: number | null = null;
    const [existingUser] = await db.select({ id: users.id }).from(users).limit(1);
    if (existingUser) auditUserId = existingUser.id;

    await db.delete(auditLog).where(
      sql`${auditLog.entityType} IN ('vendor', 'project', 'job', 'portal_task')
      AND ${auditLog.action} IN ('vendor_created', 'vendor_approved', 'project_created', 'job_assigned', 'portal_task_received', 'vendor_stage_changed', 'quality_report_submitted')`
    );

    const auditEntries = [
      { action: "vendor_created", entityType: "vendor", entityId: vendorIds["Pierre Martin"], newData: { fullName: "Pierre Martin", email: "pierre.martin@example.com", status: "New Application" }, createdAt: new Date(now.getTime() - 2 * 3600000) },
      { action: "vendor_approved", entityType: "vendor", entityId: vendorIds["Ay\u015fe Kaya"], oldData: { status: "Test Sent" }, newData: { status: "Approved", fullName: "Ay\u015fe Kaya" }, createdAt: new Date(now.getTime() - 4 * 3600000) },
      { action: "project_created", entityType: "project", entityId: p1.id, newData: { projectName: "Samsung Mobile App Localization", source: "manual", status: "in_progress" }, createdAt: new Date(now.getTime() - 6 * 3600000) },
      { action: "project_created", entityType: "project", entityId: p2.id, newData: { projectName: "Netflix Subtitle Translation", source: "symfonie", status: "confirmed" }, createdAt: new Date(now.getTime() - 5 * 3600000) },
      { action: "job_assigned", entityType: "job", entityId: null, newData: { jobCode: "MAN-2026-0050-TR", vendorName: "Ay\u015fe Kaya", project: "Samsung Mobile App Localization" }, createdAt: new Date(now.getTime() - 3 * 3600000) },
      { action: "portal_task_received", entityType: "portal_task", entityId: null, newData: { externalId: "SYM-2026-0412", portal: "symfonie", task: "Amazon Product Listings EN>DE" }, createdAt: new Date(now.getTime() - 1 * 3600000) },
      { action: "vendor_stage_changed", entityType: "vendor", entityId: vendorIds["Mehmet Y\u0131lmaz"], oldData: { status: "New Application" }, newData: { status: "Test Sent", fullName: "Mehmet Y\u0131lmaz" }, createdAt: new Date(now.getTime() - 8 * 3600000) },
      { action: "quality_report_submitted", entityType: "vendor", entityId: vendorIds["Marie Dupont"], newData: { vendorName: "Marie Dupont", reportType: "LQA", lqaScore: 92, account: "Netflix" }, createdAt: new Date(now.getTime() - 12 * 3600000) },
    ];

    for (const entry of auditEntries) {
      await db.insert(auditLog).values({
        userId: auditUserId, action: entry.action, entityType: entry.entityType,
        entityId: entry.entityId, oldData: (entry as any).oldData || null,
        newData: entry.newData, createdAt: entry.createdAt,
      });
    }

    // Seed quality reports
    const qrData = [
      { vendorId: vendorIds["Ay\u015fe Kaya"], reportType: "QS", qsScore: "4.2", lqaScore: null, projectName: "Samsung Mobile App Localization", clientAccount: "Samsung", sourceLanguage: "EN", targetLanguage: "TR", wordCount: 3500, contentType: "Technology", jobType: "Translation", status: "completed", reviewerComments: "Excellent terminology consistency.", reportDate: new Date(now.getTime() - 7 * 86400000).toISOString().split("T")[0] },
      { vendorId: vendorIds["Hans M\u00fcller"], reportType: "QS", qsScore: "3.8", lqaScore: null, projectName: "Samsung Mobile App Localization", clientAccount: "Samsung", sourceLanguage: "EN", targetLanguage: "DE", wordCount: 3500, contentType: "Technology", jobType: "Translation", status: "completed", reviewerComments: "Good accuracy, some glossary inconsistency.", reportDate: new Date(now.getTime() - 5 * 86400000).toISOString().split("T")[0] },
      { vendorId: vendorIds["Marie Dupont"], reportType: "LQA", qsScore: null, lqaScore: "92.00", projectName: "Netflix Subtitle Translation", clientAccount: "Netflix", sourceLanguage: "EN", targetLanguage: "FR", wordCount: 5000, contentType: "Entertainment", jobType: "Translation", status: "completed", reviewerComments: "Outstanding quality.", reportDate: new Date(now.getTime() - 3 * 86400000).toISOString().split("T")[0] },
      { vendorId: vendorIds["Carlos Garc\u00eda"], reportType: "QS", qsScore: "4.0", lqaScore: null, projectName: "Netflix Subtitle Translation", clientAccount: "Netflix", sourceLanguage: "EN", targetLanguage: "ES", wordCount: 5000, contentType: "Entertainment", jobType: "Translation", status: "completed", reviewerComments: "Solid subtitle work.", reportDate: new Date(now.getTime() - 2 * 86400000).toISOString().split("T")[0] },
      { vendorId: vendorIds["Ana Silva"], reportType: "QS", qsScore: "4.5", lqaScore: null, projectName: "Netflix Subtitle Translation", clientAccount: "Netflix", sourceLanguage: "EN", targetLanguage: "PT", wordCount: 5000, contentType: "Entertainment", jobType: "Translation", status: "completed", reviewerComments: "Exceptional quality.", reportDate: new Date(now.getTime() - 1 * 86400000).toISOString().split("T")[0] },
    ];

    for (const qr of qrData) {
      await db.insert(qualityReports).values(qr);
    }

    // Update vendor account quality scores
    await db.update(vendors).set({ accountQualityScores: [{ account: "Samsung", qsAvg: 4.2, reportCount: 1 }] }).where(eq(vendors.id, vendorIds["Ay\u015fe Kaya"]));
    await db.update(vendors).set({ accountQualityScores: [{ account: "Samsung", qsAvg: 3.8, reportCount: 1 }] }).where(eq(vendors.id, vendorIds["Hans M\u00fcller"]));
    await db.update(vendors).set({ accountQualityScores: [{ account: "Netflix", lqaAvg: 92.0, reportCount: 1 }] }).where(eq(vendors.id, vendorIds["Marie Dupont"]));
    await db.update(vendors).set({ accountQualityScores: [{ account: "Netflix", qsAvg: 4.0, reportCount: 1 }] }).where(eq(vendors.id, vendorIds["Carlos Garc\u00eda"]));
    await db.update(vendors).set({ accountQualityScores: [{ account: "Netflix", qsAvg: 4.5, reportCount: 1 }] }).where(eq(vendors.id, vendorIds["Ana Silva"]));

    res.json({
      success: true,
      seeded: {
        vendors: 8,
        vendorLanguagePairs: langPairData.reduce((sum, lp) => sum + lp.pairs.length, 0),
        vendorRateCards: rateCardData.reduce((sum, rc) => sum + rc.cards.length, 0),
        portalTasks: 3,
        projects: [{ id: p1.id, name: "Samsung Mobile App Localization", jobs: 3 }, { id: p2.id, name: "Netflix Subtitle Translation", jobs: 2 }],
        notifications: 2,
        auditLogEntries: auditEntries.length,
        qualityReports: qrData.length,
      },
    });
  } catch (e: any) {
    res.status(500).json({ error: safeError("Seed failed", e) });
  }
});

export default router;

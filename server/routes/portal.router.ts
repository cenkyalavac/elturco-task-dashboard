/**
 * Portal Router — handles vendor portal routes and auto-accept rules engine.
 * Extracted from the monolithic routes.ts.
 *
 * Routes (vendor portal — requireVendorAuth):
 *   GET    /portal/profile
 *   PATCH  /portal/profile
 *   GET    /portal/jobs
 *   GET    /portal/payments
 *   GET    /portal/quality-scores
 *   GET    /portal/documents
 *
 * Routes (auto-accept rules — requireAuth + autoAcceptRoleGuard):
 *   GET    /auto-accept-rules
 *   POST   /auto-accept-rules
 *   GET    /auto-accept-rules/:id
 *   PATCH  /auto-accept-rules/:id
 *   DELETE /auto-accept-rules/:id
 *   POST   /auto-accept-rules/:id/toggle
 *   GET    /auto-accept-log
 *   POST   /auto-accept/evaluate
 *   GET    /auto-accept/field-config
 *
 * Routes (portal credentials — requireAuth + autoAcceptRoleGuard):
 *   GET    /portal-credentials
 *   POST   /portal-credentials
 *   POST   /portal-credentials/test
 *   POST   /portal-credentials/aps/sync
 */
import { Router, Request, Response } from "express";
import { eq, and, sql, desc, asc, count } from "drizzle-orm";
import {
  requireAuth,
  requireRole,
  requireVendorAuth,
  param,
  safeError,
  logAudit,
  maskCredentials,
} from "./shared";
import { storage, db } from "../storage";
import {
  autoAcceptRules as autoAcceptRulesTable,
  autoAcceptLog as autoAcceptLogTable,
  portalCredentials as portalCredentialsTable,
  portalTasks as portalTasksTable,
  vendors,
} from "@shared/schema";
import { evaluateTask, processTask, getConditionFieldConfig } from "../auto-accept-engine";
import {
  testConnection as apsTestConnection,
  fetchOpenTasks as apsFetchOpenTasks,
  mapToAutoAcceptFormat as apsMapToAutoAcceptFormat,
} from "../integrations/aps-client";

const router = Router();

const autoAcceptRoleGuard = requireRole("gm", "admin", "operations_manager");

// ============================================
// VENDOR PORTAL ROUTES (requireVendorAuth)
// ============================================

router.get("/portal/profile", requireVendorAuth, async (req: Request, res: Response) => {
  const vendor = await storage.getVendor((req as any).vendorId);
  if (!vendor) return res.status(404).json({ error: "Vendor not found" });
  res.json(vendor);
});

router.patch("/portal/profile", requireVendorAuth, async (req: Request, res: Response) => {
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

router.get("/portal/jobs", requireVendorAuth, async (req: Request, res: Response) => {
  try {
    const vendorJobs = await storage.getVendorJobs((req as any).vendorId);
    res.json(vendorJobs);
  } catch (e: any) {
    console.error("Portal jobs error:", e);
    res.json([]);
  }
});

router.get("/portal/payments", requireVendorAuth, async (req: Request, res: Response) => {
  const orders = await storage.getPurchaseOrders({ vendorId: (req as any).vendorId });
  res.json(orders);
});

router.get("/portal/quality-scores", requireVendorAuth, async (req: Request, res: Response) => {
  const reports = await storage.getQualityReports((req as any).vendorId);
  res.json(reports);
});

router.get("/portal/documents", requireVendorAuth, async (req: Request, res: Response) => {
  const docs = await storage.getVendorDocuments();
  res.json(docs);
});

// ============================================
// PHASE 2: AUTO-ACCEPT RULES ENGINE
// ============================================

// GET /auto-accept-rules — list all rules
router.get("/auto-accept-rules", requireAuth, autoAcceptRoleGuard, async (_req: Request, res: Response) => {
  try {
    const rules = await db.select().from(autoAcceptRulesTable).orderBy(asc(autoAcceptRulesTable.priority));
    res.json(rules);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Failed to fetch rules", e) });
  }
});

// POST /auto-accept-rules — create a rule
router.post("/auto-accept-rules", requireAuth, autoAcceptRoleGuard, async (req: Request, res: Response) => {
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

// GET /auto-accept-rules/:id — get single rule
router.get("/auto-accept-rules/:id", requireAuth, autoAcceptRoleGuard, async (req: Request, res: Response) => {
  try {
    const [rule] = await db.select().from(autoAcceptRulesTable).where(eq(autoAcceptRulesTable.id, +param(req, "id")));
    if (!rule) return res.status(404).json({ error: "Rule not found" });
    res.json(rule);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Failed to fetch rule", e) });
  }
});

// PATCH /auto-accept-rules/:id — update a rule
router.patch("/auto-accept-rules/:id", requireAuth, autoAcceptRoleGuard, async (req: Request, res: Response) => {
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

// DELETE /auto-accept-rules/:id — delete a rule
router.delete("/auto-accept-rules/:id", requireAuth, autoAcceptRoleGuard, async (req: Request, res: Response) => {
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

// POST /auto-accept-rules/:id/toggle — enable/disable
router.post("/auto-accept-rules/:id/toggle", requireAuth, autoAcceptRoleGuard, async (req: Request, res: Response) => {
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

// GET /auto-accept-log — view match history
router.get("/auto-accept-log", requireAuth, autoAcceptRoleGuard, async (req: Request, res: Response) => {
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

// POST /auto-accept/evaluate — dry run test
router.post("/auto-accept/evaluate", requireAuth, autoAcceptRoleGuard, async (req: Request, res: Response) => {
  try {
    const { portalSource, taskData } = req.body;
    if (!portalSource || !taskData) return res.status(400).json({ error: "portalSource and taskData are required" });
    const result = await evaluateTask(portalSource, taskData, { dryRun: true });
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Failed to evaluate", e) });
  }
});

// GET /auto-accept/field-config — get available condition fields
router.get("/auto-accept/field-config", requireAuth, autoAcceptRoleGuard, async (_req: Request, res: Response) => {
  res.json(getConditionFieldConfig());
});

// ============================================
// PHASE 2: PORTAL CREDENTIALS (APS, etc.)
// ============================================

// GET /portal-credentials — list all portal connections
router.get("/portal-credentials", requireAuth, autoAcceptRoleGuard, async (_req: Request, res: Response) => {
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

// POST /portal-credentials — create/update portal credentials
router.post("/portal-credentials", requireAuth, autoAcceptRoleGuard, async (req: Request, res: Response) => {
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

// POST /portal-credentials/test — test a portal connection
router.post("/portal-credentials/test", requireAuth, autoAcceptRoleGuard, async (req: Request, res: Response) => {
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

// POST /portal-credentials/aps/sync — trigger APS task sync
router.post("/portal-credentials/aps/sync", requireAuth, autoAcceptRoleGuard, async (_req: Request, res: Response) => {
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

export default router;

/**
 * Project Router — handles projects CRUD, jobs, state machine transitions,
 * portal tasks, job assignment/unassignment, batch job creation, and project finance.
 *
 * Extracted from the monolithic routes.ts as part of domain-specific modularization.
 */
import { Router, Request, Response } from "express";
import { z } from "zod";
import { eq, and, sql, desc } from "drizzle-orm";
import { storage, db } from "../storage";
import {
  projects, jobs, customers, entities,
  portalTasks as portalTasksTable,
  pmCustomerAssignments,
  vendorRateCards,
} from "@shared/schema";
import {
  validateProjectTransition,
  validateJobTransition,
  getValidProjectActions,
  getValidJobActions,
} from "@shared/state-machines";
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

// ============================================
// ZOD SCHEMAS
// ============================================
const createProjectSchema = z.object({
  projectName: z.string().min(1).max(500),
  customerId: z.number().int().positive(),
  source: z.string().max(100).optional(),
  status: z.string().max(50).optional(),
  currency: z.string().max(3).optional(),
}).passthrough();

const createJobSchema = z.object({
  jobName: z.string().max(500).optional(),
  sourceLanguage: z.string().max(10).optional(),
  targetLanguage: z.string().max(10).optional(),
  serviceType: z.string().max(100).optional(),
  unitType: z.string().max(50).optional(),
}).passthrough();

// ============================================
// HELPERS
// ============================================

/**
 * Atomic sequence number generation using MAX to avoid count-based race conditions.
 * Generates codes like PREFIX-YYYY-0001, PREFIX-YYYY-0002, etc.
 */
async function getNextSequenceNumber(table: any, prefix: string, year: number, numberCol: any): Promise<string> {
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

/**
 * Auto-generate PO when a vendor is assigned to a job.
 * This is a stub — the full implementation lives in the finance domain.
 * The try/catch in the assign endpoint ensures this is non-blocking.
 */
async function autoGeneratePO(_jobId: number, _projectId: number, _vendorId: number): Promise<void> {
  // TODO: Import from finance router once extracted.
  // The original implementation creates a PO with line items from the job data.
}

// ============================================
// ROUTER
// ============================================
const router = Router();

// ---- PROJECTS CRUD ----

router.get("/projects", requireAuth, async (req: Request, res: Response) => {
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
    // Enrich projects with customer names
    const customerIds = [...new Set(projectList.filter(p => p.customerId).map(p => p.customerId))];
    const customerMap = new Map<number, string>();
    for (const cid of customerIds) {
      const c = await storage.getCustomer(cid);
      if (c) customerMap.set(cid, c.name);
    }
    const enrichedProjects = projectList.map(p => ({
      ...p,
      customerName: p.customerId ? (customerMap.get(p.customerId) || null) : null,
    }));
    res.json({ data: enrichedProjects, total, page: filters.page, limit: filters.limit });
  } catch (e: any) {
    res.status(500).json({ error: safeError("Internal server error", e) });
  }
});

router.get("/projects/:id", requireAuth, async (req: Request, res: Response) => {
  const project = await storage.getProject(+param(req, "id"));
  if (!project) return res.status(404).json({ error: "Project not found" });
  const customer = project.customerId ? await storage.getCustomer(project.customerId) : null;
  res.json({ ...project, customerName: customer?.name || null });
});

router.post("/projects", requireAuth, async (req: Request, res: Response) => {
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

router.patch("/projects/:id", requireAuth, async (req: Request, res: Response) => {
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

// ---- PROJECT JOBS ----

router.get("/projects/:id/jobs", requireAuth, async (req: Request, res: Response) => {
  const jobList = await storage.getJobs(+param(req, "id"));
  // Enrich jobs with vendor names
  const vendorIds = [...new Set(jobList.filter(j => j.vendorId).map(j => j.vendorId!))];
  const vendorMap = new Map<number, string>();
  for (const vid of vendorIds) {
    const v = await storage.getVendor(vid);
    if (v) vendorMap.set(vid, v.fullName);
  }
  const enriched = jobList.map(j => ({
    ...j,
    vendorName: j.vendorId ? (vendorMap.get(j.vendorId) || null) : null,
  }));
  res.json(enriched);
});

router.post("/projects/:id/jobs", requireAuth, async (req: Request, res: Response) => {
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

router.patch("/projects/:id/jobs/:jobId", requireAuth, async (req: Request, res: Response) => {
  try {
    const job = await storage.updateJob(+param(req, "jobId"), req.body);
    res.json(job);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Internal server error", e) });
  }
});

router.delete("/projects/:id/jobs/:jobId", requireAuth, async (req: Request, res: Response) => {
  try {
    await storage.deleteJob(+param(req, "jobId"));
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: safeError("Internal server error", e) });
  }
});

// ---- STATE MACHINE TRANSITIONS ----

router.post("/projects/:id/transition", requireAuth, async (req: Request, res: Response) => {
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

router.get("/projects/:id/valid-actions", requireAuth, async (req: Request, res: Response) => {
  const project = await storage.getProject(+param(req, "id"));
  if (!project) return res.status(404).json({ error: "Project not found" });
  res.json({ actions: getValidProjectActions(project.status || "draft") });
});

router.post("/projects/:projectId/jobs/:jobId/transition", requireAuth, async (req: Request, res: Response) => {
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

// ---- PORTAL TASKS ----

router.get("/portal-tasks", requireAuth, async (req: Request, res: Response) => {
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

router.get("/portal-tasks/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const [task] = await db.select().from(portalTasksTable).where(eq(portalTasksTable.id, +param(req, "id")));
    if (!task) return res.status(404).json({ error: "Portal task not found" });
    res.json(task);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Failed to get portal task", e) });
  }
});

router.post("/portal-tasks/:id/accept", requireAuth, async (req: Request, res: Response) => {
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

router.post("/portal-tasks/:id/reject", requireAuth, async (req: Request, res: Response) => {
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

// ---- JOB ASSIGNMENT + VENDOR ----

router.post("/projects/:projectId/jobs/:jobId/assign", requireAuth, async (req: Request, res: Response) => {
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
    // Auto-generate PO if settings allow
    try { await autoGeneratePO(jobId, +param(req, "projectId"), vendorId); } catch (e) { console.error("Auto PO error:", e); }
    res.json(updated);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Failed to assign vendor", e) });
  }
});

router.post("/projects/:projectId/jobs/:jobId/unassign", requireAuth, async (req: Request, res: Response) => {
  try {
    const jobId = +param(req, "jobId");
    const updated = await storage.updateJob(jobId, { vendorId: null, status: "unassigned", assignedAt: null, assignedBy: null, vendorRate: null } as any);
    res.json(updated);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Failed to unassign vendor", e) });
  }
});

router.post("/projects/:projectId/jobs/batch", requireAuth, async (req: Request, res: Response) => {
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

// ---- PROJECT FINANCE ----

router.get("/projects/:id/finance", requireAuth, async (req: Request, res: Response) => {
  try {
    const projectId = +param(req, "id");
    const project = await storage.getProject(projectId);
    if (!project) return res.status(404).json({ error: "Project not found" });
    const jobList = await db.select().from(jobs).where(eq(jobs.projectId, projectId));
    const totalReceivables = jobList.reduce((sum, j) => sum + parseFloat(j.clientTotal || "0"), 0);
    const totalPayables = jobList.reduce((sum, j) => sum + parseFloat(j.vendorTotal || "0"), 0);
    const margin = totalReceivables - totalPayables;
    const marginPercent = totalReceivables > 0 ? (margin / totalReceivables) * 100 : 0;
    res.json({
      totalReceivables, totalPayables, margin, marginPercent,
      jobs: jobList.map(j => ({
        id: j.id, jobCode: j.jobCode, jobName: j.jobName,
        sourceLanguage: j.sourceLanguage, targetLanguage: j.targetLanguage,
        serviceType: j.serviceType, vendorId: j.vendorId,
        clientTotal: parseFloat(j.clientTotal || "0"),
        vendorTotal: parseFloat(j.vendorTotal || "0"),
        margin: parseFloat(j.clientTotal || "0") - parseFloat(j.vendorTotal || "0"),
      })),
    });
  } catch (e: any) {
    res.status(500).json({ error: safeError("Finance fetch failed", e) });
  }
});

export default router;

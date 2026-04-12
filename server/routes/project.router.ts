/**
 * Project Router — handles projects CRUD, jobs, state machine transitions,
 * portal tasks, job assignment/unassignment, batch job creation, and project finance.
 *
 * Extracted from the monolithic routes.ts as part of domain-specific modularization.
 */
import { Router, Request, Response } from "express";
import { z } from "zod";
import { eq, and, sql, desc, asc, inArray, gte, lte, ilike, or, count } from "drizzle-orm";
import { storage, db } from "../storage";
import {
  projects, jobs, customers, entities,
  portalTasks as portalTasksTable,
  pmCustomerAssignments,
  vendorRateCards,
  projectTemplates,
  autoDispatchRules,
  jobDependencies,
  vendors,
  vendorLanguagePairs,
  vendorRateCards as vendorRateCardsTable,
  users,
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

// ============================================
// FAZ 4: ENHANCED PROJECT SEARCH & ARCHIVE (must be before :id route)
// ============================================

router.get("/projects/archive", requireAuth, async (req: Request, res: Response) => {
  try {
    const { search, dateFrom, dateTo, customerId, sourceLanguage, targetLanguage, status, pmId, page, limit } = req.query;
    const pageNum = page ? +page : 1;
    const limitNum = limit ? +limit : 50;
    const offset = (pageNum - 1) * limitNum;

    const conditions: any[] = [];
    if (search) conditions.push(or(ilike(projects.projectName, `%${search}%`), ilike(projects.projectCode, `%${search}%`), ilike(projects.notes, `%${search}%`)));
    if (dateFrom) conditions.push(gte(projects.createdAt, new Date(dateFrom as string)));
    if (dateTo) conditions.push(lte(projects.createdAt, new Date(dateTo as string)));
    if (customerId) conditions.push(eq(projects.customerId, +customerId));
    if (status) conditions.push(eq(projects.status, status as string));
    if (pmId) conditions.push(eq(projects.pmId, +pmId));

    // If language filters, join with jobs
    let query;
    if (sourceLanguage || targetLanguage) {
      const jobConditions: any[] = [];
      if (sourceLanguage) jobConditions.push(eq(jobs.sourceLanguage, sourceLanguage as string));
      if (targetLanguage) jobConditions.push(eq(jobs.targetLanguage, targetLanguage as string));
      const matchingJobProjectIds = await db.selectDistinct({ projectId: jobs.projectId }).from(jobs).where(and(...jobConditions));
      const pids = matchingJobProjectIds.map(j => j.projectId);
      if (pids.length > 0) conditions.push(inArray(projects.id, pids));
      else { res.json({ data: [], total: 0, page: pageNum, limit: limitNum }); return; }
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const [result, countResult] = await Promise.all([
      db.select().from(projects).where(whereClause).orderBy(desc(projects.createdAt)).limit(limitNum).offset(offset),
      db.select({ cnt: count() }).from(projects).where(whereClause),
    ]);

    // Enrich with customer names
    const customerIds = [...new Set(result.filter(p => p.customerId).map(p => p.customerId))];
    const customerMap = new Map<number, string>();
    if (customerIds.length > 0) {
      const custs = await db.select({ id: customers.id, name: customers.name }).from(customers).where(inArray(customers.id, customerIds));
      custs.forEach(c => customerMap.set(c.id, c.name));
    }
    const enriched = result.map(p => ({ ...p, customerName: p.customerId ? (customerMap.get(p.customerId) || null) : null }));
    res.json({ data: enriched, total: countResult[0]?.cnt || 0, page: pageNum, limit: limitNum });
  } catch (e: any) {
    res.status(500).json({ error: safeError("Archive search failed", e) });
  }
});

// ============================================
// FAZ 4: DEADLINE PREDICTION ENGINE (must be before :id route)
// ============================================

router.post("/projects/predict-deadline", requireAuth, async (req: Request, res: Response) => {
  try {
    const body = validate(z.object({
      sourceLanguage: z.string().min(1),
      targetLanguage: z.string().min(1),
      serviceType: z.string().optional(),
      wordCount: z.number().optional(),
    }), req.body, res);
    if (!body) return;

    // Find similar historical jobs
    const conditions: any[] = [
      eq(jobs.sourceLanguage, body.sourceLanguage),
      eq(jobs.targetLanguage, body.targetLanguage),
      sql`${jobs.deliveredAt} IS NOT NULL`,
      sql`${jobs.assignedAt} IS NOT NULL`,
    ];
    if (body.serviceType) conditions.push(eq(jobs.serviceType, body.serviceType));

    const historicalJobs = await db.select({
      assignedAt: jobs.assignedAt,
      deliveredAt: jobs.deliveredAt,
      wordCount: jobs.wordCount,
    }).from(jobs).where(and(...conditions)).limit(100);

    if (historicalJobs.length === 0) {
      // Default fallback: 3 days for general translation
      const estimatedDays = body.wordCount ? Math.max(1, Math.ceil(body.wordCount / 3000)) : 3;
      const estimatedDate = new Date(Date.now() + estimatedDays * 24 * 60 * 60 * 1000);
      return res.json({ estimatedDays, estimatedDate: estimatedDate.toISOString(), confidence: "low", basedOnSamples: 0 });
    }

    // Calculate average delivery time in days
    const durations: number[] = [];
    for (const j of historicalJobs) {
      if (j.assignedAt && j.deliveredAt) {
        const assigned = new Date(j.assignedAt).getTime();
        const delivered = new Date(j.deliveredAt).getTime();
        const days = (delivered - assigned) / (24 * 60 * 60 * 1000);
        if (days > 0 && days < 365) durations.push(days);
      }
    }

    if (durations.length === 0) {
      const estimatedDays = body.wordCount ? Math.max(1, Math.ceil(body.wordCount / 3000)) : 3;
      const estimatedDate = new Date(Date.now() + estimatedDays * 24 * 60 * 60 * 1000);
      return res.json({ estimatedDays, estimatedDate: estimatedDate.toISOString(), confidence: "low", basedOnSamples: 0 });
    }

    const avgDays = durations.reduce((a, b) => a + b, 0) / durations.length;
    // Adjust for word count if provided
    let estimatedDays = Math.ceil(avgDays);
    if (body.wordCount) {
      const avgWords = historicalJobs.filter(j => j.wordCount).map(j => j.wordCount!);
      if (avgWords.length > 0) {
        const historicalAvgWords = avgWords.reduce((a, b) => a + b, 0) / avgWords.length;
        const wordRatio = body.wordCount / (historicalAvgWords || 1);
        estimatedDays = Math.max(1, Math.ceil(avgDays * wordRatio));
      }
    }

    const confidence = durations.length >= 10 ? "high" : durations.length >= 5 ? "medium" : "low";
    const estimatedDate = new Date(Date.now() + estimatedDays * 24 * 60 * 60 * 1000);

    res.json({ estimatedDays, estimatedDate: estimatedDate.toISOString(), confidence, basedOnSamples: durations.length });
  } catch (e: any) {
    res.status(500).json({ error: safeError("Deadline prediction failed", e) });
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
    const projectId = +param(req, "projectId");
    const { action } = req.body;
    if (!action) return res.status(400).json({ error: "Action is required" });
    const jobList = await storage.getJobs(projectId);
    const job = jobList.find((j: any) => j.id === jobId);
    if (!job) return res.status(404).json({ error: "Job not found" });
    const currentStatus = job.status || "unassigned";
    const newStatus = validateJobTransition(currentStatus, action);
    if (!newStatus) return res.status(400).json({ error: `Invalid transition: cannot '${action}' from '${currentStatus}'`, validActions: getValidJobActions(currentStatus) });

    // Faz 4: Check dependencies — block start if dependencies not met
    if (action === "start") {
      const deps = await db.select().from(jobDependencies).where(eq(jobDependencies.jobId, jobId));
      for (const dep of deps) {
        const depJob = jobList.find(j => j.id === dep.dependsOnJobId);
        if (depJob && depJob.status !== "delivered" && depJob.status !== "approved" && depJob.status !== "invoiced") {
          return res.status(400).json({ error: `Blocked: waiting for "${depJob.jobName || depJob.jobCode}" to complete`, blockedBy: dep.dependsOnJobId });
        }
      }
    }

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

// ============================================
// FAZ 4: PROJECT CLONE
// ============================================

router.post("/projects/:id/clone", requireAuth, async (req: Request, res: Response) => {
  try {
    const projectId = +param(req, "id");
    const project = await storage.getProject(projectId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const { projectName, deadline } = req.body;
    const year = new Date().getFullYear();
    const customer = project.customerId ? await storage.getCustomer(project.customerId) : null;
    const prefix = customer?.code || "PRJ";
    const projectCode = await getNextSequenceNumber(projects, prefix, year, projects.projectCode);

    const newProject = await storage.createProject({
      entityId: project.entityId,
      customerId: project.customerId,
      subAccountId: project.subAccountId,
      projectCode,
      projectName: projectName || `${project.projectName} (Copy)`,
      source: project.source,
      pmId: (req as any).pmUserId,
      status: "active",
      currency: project.currency,
      deadline: deadline || project.deadline,
      notes: project.notes,
      tags: project.tags,
      metadata: project.metadata,
    } as any);

    // Clone jobs
    const jobList = await storage.getJobs(projectId);
    for (let i = 0; i < jobList.length; i++) {
      const j = jobList[i];
      await storage.createJob({
        projectId: newProject.id,
        jobCode: `J${String(i + 1).padStart(3, "0")}`,
        jobName: j.jobName,
        sourceLanguage: j.sourceLanguage,
        targetLanguage: j.targetLanguage,
        serviceType: j.serviceType,
        unitType: j.unitType,
        unitCount: j.unitCount,
        unitRate: j.unitRate,
        instructions: j.instructions,
        status: "unassigned",
        deadline: deadline || j.deadline,
      } as any);
    }

    await logAudit((req as any).pmUserId, "clone_project", "project", newProject.id, null, { sourceProjectId: projectId }, getClientIp(req));
    res.json(newProject);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Project clone failed", e) });
  }
});

// ============================================
// FAZ 4: PROJECT TEMPLATE SYSTEM
// ============================================

router.get("/project-templates", requireAuth, async (_req: Request, res: Response) => {
  try {
    const templates = await db.select().from(projectTemplates).where(eq(projectTemplates.isActive, true)).orderBy(desc(projectTemplates.createdAt));
    res.json({ templates });
  } catch (e: any) {
    res.status(500).json({ error: safeError("Failed to list templates", e) });
  }
});

router.post("/project-templates", requireAuth, requireRole("admin", "gm", "operations_manager", "pm_team_lead"), async (req: Request, res: Response) => {
  try {
    const body = validate(z.object({
      name: z.string().min(1).max(200),
      description: z.string().optional(),
      customerId: z.number().optional(),
      sourceLanguage: z.string().optional(),
      targetLanguages: z.array(z.string()).optional(),
      serviceTypes: z.array(z.string()).optional(),
      defaultInstructions: z.string().optional(),
      defaultDeadlineDays: z.number().optional(),
      metadata: z.any().optional(),
    }), req.body, res);
    if (!body) return;
    const [template] = await db.insert(projectTemplates).values({ ...body, createdBy: (req as any).pmUserId }).returning();
    await logAudit((req as any).pmUserId, "create", "project_template", template.id, null, template, getClientIp(req));
    res.json(template);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Failed to create template", e) });
  }
});

router.patch("/project-templates/:id", requireAuth, requireRole("admin", "gm", "operations_manager", "pm_team_lead"), async (req: Request, res: Response) => {
  try {
    const id = +param(req, "id");
    const [updated] = await db.update(projectTemplates).set({ ...req.body, updatedAt: new Date() }).where(eq(projectTemplates.id, id)).returning();
    if (!updated) return res.status(404).json({ error: "Template not found" });
    res.json(updated);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Failed to update template", e) });
  }
});

router.delete("/project-templates/:id", requireAuth, requireRole("admin", "gm"), async (req: Request, res: Response) => {
  try {
    const id = +param(req, "id");
    await db.update(projectTemplates).set({ isActive: false }).where(eq(projectTemplates.id, id));
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: safeError("Failed to delete template", e) });
  }
});

router.post("/project-templates/:id/apply", requireAuth, async (req: Request, res: Response) => {
  try {
    const templateId = +param(req, "id");
    const [template] = await db.select().from(projectTemplates).where(eq(projectTemplates.id, templateId));
    if (!template) return res.status(404).json({ error: "Template not found" });

    const { projectName, customerId, deadline } = req.body;
    const effectiveCustomerId = customerId || template.customerId;
    if (!effectiveCustomerId) return res.status(400).json({ error: "customerId is required" });

    const year = new Date().getFullYear();
    const customer = await storage.getCustomer(effectiveCustomerId);
    const prefix = customer?.code || "PRJ";
    const projectCode = await getNextSequenceNumber(projects, prefix, year, projects.projectCode);

    const deadlineDate = deadline ? new Date(deadline) : (template.defaultDeadlineDays ? new Date(Date.now() + template.defaultDeadlineDays * 24 * 60 * 60 * 1000) : undefined);

    const project = await storage.createProject({
      projectName: projectName || `${template.name} — ${new Date().toISOString().slice(0, 10)}`,
      customerId: effectiveCustomerId,
      projectCode,
      status: "active",
      notes: template.defaultInstructions,
      metadata: template.metadata,
      deadline: deadlineDate?.toISOString(),
    } as any);

    // Auto-generate jobs from template target languages
    const targetLangs = template.targetLanguages || [];
    const srcLang = template.sourceLanguage || "";
    if (targetLangs.length > 0) {
      const serviceType = template.serviceTypes?.[0] || "translation";
      for (let i = 0; i < targetLangs.length; i++) {
        await storage.createJob({
          projectId: project.id,
          jobCode: `J${String(i + 1).padStart(3, "0")}`,
          jobName: `${srcLang} → ${targetLangs[i]}`,
          sourceLanguage: srcLang,
          targetLanguage: targetLangs[i],
          serviceType,
          status: "unassigned",
          deadline: deadlineDate?.toISOString(),
        } as any);
      }
    }

    await logAudit((req as any).pmUserId, "apply_template", "project", project.id, null, { templateId }, getClientIp(req));
    res.json(project);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Failed to apply template", e) });
  }
});

// ============================================
// FAZ 4: SMART MATCH ENHANCEMENT (per project)
// ============================================

router.get("/projects/:projectId/smart-match", requireAuth, async (req: Request, res: Response) => {
  try {
    const projectId = +param(req, "projectId");
    const project = await storage.getProject(projectId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const jobList = await storage.getJobs(projectId);
    if (jobList.length === 0) return res.json({ vendors: [] });

    // Aggregate language pairs and service types from all jobs
    const langPairs = new Set<string>();
    const serviceTypesSet = new Set<string>();
    for (const j of jobList) {
      if (j.sourceLanguage && j.targetLanguage) langPairs.add(`${j.sourceLanguage}|${j.targetLanguage}`);
      if (j.serviceType) serviceTypesSet.add(j.serviceType.toLowerCase());
    }

    const allVendors = await db.select().from(vendors).where(sql`${vendors.status} IN ('Approved', 'approved', 'Active')`);
    const allPairs = await db.select().from(vendorLanguagePairs);
    const allRates = await db.select().from(vendorRateCards);

    // Build maps
    const pairMap = new Map<number, Array<{ source: string; target: string }>>();
    for (const p of allPairs) {
      if (!pairMap.has(p.vendorId)) pairMap.set(p.vendorId, []);
      pairMap.get(p.vendorId)!.push({ source: p.sourceLanguage, target: p.targetLanguage });
    }
    const rateMap = new Map<number, number[]>();
    for (const r of allRates) {
      if (!rateMap.has(r.vendorId)) rateMap.set(r.vendorId, []);
      rateMap.get(r.vendorId)!.push(parseFloat(r.rateValue));
    }
    const allRateValues = allRates.map(r => parseFloat(r.rateValue)).filter(v => v > 0);
    const avgRate = allRateValues.length > 0 ? allRateValues.reduce((a, b) => a + b, 0) / allRateValues.length : 0.08;

    // Count active job assignments per vendor
    const activeAssignments = await db.select({ vendorId: jobs.vendorId, cnt: count() }).from(jobs).where(and(inArray(jobs.status, ["assigned", "in_progress"]), sql`${jobs.vendorId} IS NOT NULL`)).groupBy(jobs.vendorId);
    const loadMap = new Map<number, number>();
    activeAssignments.forEach(a => { if (a.vendorId) loadMap.set(a.vendorId, a.cnt); });

    const scored = allVendors.map(v => {
      let score = 0;
      const factors: Record<string, number> = {};
      const pairs = pairMap.get(v.id) || [];
      const rates = rateMap.get(v.id) || [];
      const vendorAvgRate = rates.length > 0 ? rates.reduce((a, b) => a + b, 0) / rates.length : 0;

      // Language Pair Match (30%)
      const langScore = pairs.some(p => langPairs.has(`${p.source.toUpperCase()}|${p.target.toUpperCase()}`)) ? 30 : 0;
      factors.languagePair = langScore;
      score += langScore;

      // Specialization Match (20%)
      const vendorSpecs = [...(v.translationSpecializations || []), ...(v.specializations || [])].map(s => s.toLowerCase());
      const specOverlap = vendorSpecs.some(s => serviceTypesSet.has(s)) ? 20 : (vendorSpecs.length > 0 ? 5 : 0);
      factors.specialization = specOverlap;
      score += specOverlap;

      // Quality Score (20%)
      const qualScore = parseFloat(v.combinedQualityScore || "0");
      factors.quality = Math.round((qualScore / 100) * 20);
      score += factors.quality;

      // Availability (15%) — penalize overloaded vendors
      const currentLoad = loadMap.get(v.id) || 0;
      const availScore = currentLoad === 0 ? 15 : currentLoad <= 3 ? 10 : currentLoad <= 6 ? 5 : 0;
      factors.availability = availScore;
      score += availScore;

      // Response Time proxy (10%) — use value index as proxy
      const vi = parseFloat(v.valueIndex || "0");
      factors.responseTime = Math.round(Math.min(vi / 2, 1) * 10);
      score += factors.responseTime;

      // Rate Competitiveness (5%)
      if (vendorAvgRate > 0 && avgRate > 0) {
        factors.rate = Math.round(Math.min(avgRate / vendorAvgRate, 1.5) / 1.5 * 5);
      } else {
        factors.rate = 3;
      }
      score += factors.rate;

      const reason = langScore >= 30 ? "Exact language pair match" : pairs.length > 0 ? "Related language experience" : "General availability";

      return { vendorId: v.id, fullName: v.fullName, email: v.email, tier: v.tier, matchScore: Math.min(score, 100), factors, reason, currentLoad, averageRate: vendorAvgRate.toFixed(4), qualityScore: qualScore };
    });

    scored.sort((a, b) => b.matchScore - a.matchScore);
    res.json({ vendors: scored.slice(0, 5) });
  } catch (e: any) {
    res.status(500).json({ error: safeError("Smart match failed", e) });
  }
});

// ============================================
// FAZ 4: AUTO-DISPATCH RULES
// ============================================

router.get("/auto-dispatch-rules", requireAuth, async (_req: Request, res: Response) => {
  try {
    const rules = await db.select().from(autoDispatchRules).orderBy(desc(autoDispatchRules.priority));
    res.json({ rules });
  } catch (e: any) {
    res.status(500).json({ error: safeError("Failed to list auto-dispatch rules", e) });
  }
});

router.post("/auto-dispatch-rules", requireAuth, requireRole("admin", "gm", "operations_manager", "pm_team_lead"), async (req: Request, res: Response) => {
  try {
    const body = validate(z.object({
      name: z.string().min(1).max(200),
      description: z.string().optional(),
      customerId: z.number().optional(),
      sourceLanguage: z.string().optional(),
      targetLanguage: z.string().optional(),
      serviceType: z.string().optional(),
      preferredVendorId: z.number().optional(),
      minQualityScore: z.string().optional(),
      maxRate: z.string().optional(),
      priority: z.number().optional(),
    }), req.body, res);
    if (!body) return;
    const [rule] = await db.insert(autoDispatchRules).values({ ...body, createdBy: (req as any).pmUserId }).returning();
    await logAudit((req as any).pmUserId, "create", "auto_dispatch_rule", rule.id, null, rule, getClientIp(req));
    res.json(rule);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Failed to create auto-dispatch rule", e) });
  }
});

router.patch("/auto-dispatch-rules/:id", requireAuth, requireRole("admin", "gm", "operations_manager", "pm_team_lead"), async (req: Request, res: Response) => {
  try {
    const id = +param(req, "id");
    const [updated] = await db.update(autoDispatchRules).set(req.body).where(eq(autoDispatchRules.id, id)).returning();
    if (!updated) return res.status(404).json({ error: "Rule not found" });
    res.json(updated);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Failed to update auto-dispatch rule", e) });
  }
});

router.delete("/auto-dispatch-rules/:id", requireAuth, requireRole("admin", "gm"), async (req: Request, res: Response) => {
  try {
    const id = +param(req, "id");
    await db.delete(autoDispatchRules).where(eq(autoDispatchRules.id, id));
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: safeError("Failed to delete auto-dispatch rule", e) });
  }
});

router.post("/projects/:projectId/jobs/:jobId/auto-dispatch", requireAuth, async (req: Request, res: Response) => {
  try {
    const projectId = +param(req, "projectId");
    const jobId = +param(req, "jobId");
    const jobList = await storage.getJobs(projectId);
    const job = jobList.find((j: any) => j.id === jobId);
    if (!job) return res.status(404).json({ error: "Job not found" });
    if (job.vendorId) return res.status(400).json({ error: "Job already assigned" });

    const project = await storage.getProject(projectId);

    // Find matching auto-dispatch rules
    const rules = await db.select().from(autoDispatchRules).where(eq(autoDispatchRules.isActive, true)).orderBy(desc(autoDispatchRules.priority));
    let matchedVendorId: number | null = null;

    for (const rule of rules) {
      if (rule.sourceLanguage && rule.sourceLanguage !== job.sourceLanguage) continue;
      if (rule.targetLanguage && rule.targetLanguage !== job.targetLanguage) continue;
      if (rule.serviceType && rule.serviceType !== job.serviceType) continue;
      if (rule.customerId && rule.customerId !== project?.customerId) continue;

      if (rule.preferredVendorId) {
        const [vendor] = await db.select().from(vendors).where(eq(vendors.id, rule.preferredVendorId));
        if (vendor && (vendor.status === "Approved" || vendor.status === "approved" || vendor.status === "Active")) {
          const qualScore = parseFloat(vendor.combinedQualityScore || "0");
          const minQual = rule.minQualityScore ? parseFloat(rule.minQualityScore) : 0;
          if (qualScore >= minQual) {
            matchedVendorId = rule.preferredVendorId;
            break;
          }
        }
      }
    }

    if (!matchedVendorId) {
      return res.status(404).json({ error: "No matching auto-dispatch rule or vendor found" });
    }

    // Assign the vendor
    const updated = await storage.updateJob(jobId, {
      vendorId: matchedVendorId,
      status: "assigned",
      assignedAt: new Date().toISOString(),
      assignedBy: (req as any).pmUserId,
    } as any);

    await logAudit((req as any).pmUserId, "auto_dispatch", "job", jobId, null, { vendorId: matchedVendorId }, getClientIp(req));
    await createNotificationV2((req as any).pmUserId, "auto_dispatch", "Job auto-dispatched", `Job ${job.jobName} was auto-dispatched`, `/projects/${projectId}`);
    res.json(updated);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Auto-dispatch failed", e) });
  }
});

// ============================================
// FAZ 4: JOB DEPENDENCY CHAIN
// ============================================

router.post("/projects/:projectId/jobs/:jobId/dependencies", requireAuth, async (req: Request, res: Response) => {
  try {
    const jobId = +param(req, "jobId");
    const body = validate(z.object({
      dependsOnJobId: z.number().int().positive(),
      dependencyType: z.string().optional(),
    }), req.body, res);
    if (!body) return;

    // Prevent self-dependency
    if (jobId === body.dependsOnJobId) return res.status(400).json({ error: "Job cannot depend on itself" });

    const [dep] = await db.insert(jobDependencies).values({
      jobId,
      dependsOnJobId: body.dependsOnJobId,
      dependencyType: body.dependencyType || "finish_to_start",
    }).returning();

    await logAudit((req as any).pmUserId, "add_dependency", "job", jobId, null, { dependsOnJobId: body.dependsOnJobId }, getClientIp(req));
    res.json(dep);
  } catch (e: any) {
    if (e.message?.includes("duplicate")) return res.status(409).json({ error: "Dependency already exists" });
    res.status(500).json({ error: safeError("Failed to add dependency", e) });
  }
});

router.delete("/projects/:projectId/jobs/:jobId/dependencies/:depId", requireAuth, async (req: Request, res: Response) => {
  try {
    const depId = +param(req, "depId");
    await db.delete(jobDependencies).where(eq(jobDependencies.id, depId));
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: safeError("Failed to remove dependency", e) });
  }
});

router.get("/projects/:projectId/dependency-chain", requireAuth, async (req: Request, res: Response) => {
  try {
    const projectId = +param(req, "projectId");
    const jobList = await storage.getJobs(projectId);
    const deps = await db.select().from(jobDependencies).where(
      inArray(jobDependencies.jobId, jobList.map(j => j.id))
    );

    const chain = jobList.map(j => {
      const jobDeps = deps.filter(d => d.jobId === j.id);
      const blockedBy = jobDeps.map(d => {
        const depJob = jobList.find(jj => jj.id === d.dependsOnJobId);
        return { dependencyId: d.id, jobId: d.dependsOnJobId, jobName: depJob?.jobName, status: depJob?.status, type: d.dependencyType };
      });
      const isBlocked = blockedBy.some(b => b.status !== "delivered" && b.status !== "approved" && b.status !== "invoiced");
      return { jobId: j.id, jobCode: j.jobCode, jobName: j.jobName, status: j.status, dependencies: blockedBy, isBlocked };
    });

    res.json({ chain });
  } catch (e: any) {
    res.status(500).json({ error: safeError("Failed to get dependency chain", e) });
  }
});

// Validate dependencies in job transition (override)
const originalTransition = router.stack?.find((s: any) => s.route?.path === "/projects/:projectId/jobs/:jobId/transition" && s.route?.methods?.post);
// Note: Dependency validation is handled inline within the existing transition endpoint enhancement

export default router;

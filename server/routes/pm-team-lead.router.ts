/**
 * PM Team Lead Router — Faz 4
 * Dashboard, team performance, reassignment for PM Team Lead role.
 */
import { Router, Request, Response } from "express";
import { z } from "zod";
import { eq, and, sql, desc, count, inArray } from "drizzle-orm";
import { db } from "../storage";
import { projects, jobs, users } from "@shared/schema";
import {
  requireAuth,
  requireRole,
  validate,
  safeError,
  logAudit,
  getClientIp,
} from "./shared";

const router = Router();

// PM Team Lead Dashboard
router.get("/pm-team-lead/dashboard", requireAuth, requireRole("pm_team_lead", "admin", "gm", "operations_manager"), async (req: Request, res: Response) => {
  try {
    // Get all PMs
    const pms = await db.select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
    }).from(users).where(eq(users.role, "pm"));

    const pmIds = pms.map(p => p.id);

    // Get project counts per PM
    const projectCounts = pmIds.length > 0
      ? await db.select({
          pmId: projects.pmId,
          total: count(),
          active: sql<number>`SUM(CASE WHEN ${projects.status} IN ('active', 'confirmed', 'in_progress') THEN 1 ELSE 0 END)::int`,
          completed: sql<number>`SUM(CASE WHEN ${projects.status} IN ('completed', 'closed') THEN 1 ELSE 0 END)::int`,
        }).from(projects).where(inArray(projects.pmId, pmIds)).groupBy(projects.pmId)
      : [];

    const countMap = new Map<number, any>();
    projectCounts.forEach((c: any) => { if (c.pmId) countMap.set(c.pmId, c); });

    // Get active job counts per PM's projects
    const activeJobCounts = pmIds.length > 0
      ? await db.select({
          pmId: projects.pmId,
          activeJobs: count(),
        }).from(jobs)
        .innerJoin(projects, eq(jobs.projectId, projects.id))
        .where(and(inArray(projects.pmId, pmIds), inArray(jobs.status, ["assigned", "in_progress"])))
        .groupBy(projects.pmId)
      : [];

    const jobMap = new Map<number, number>();
    activeJobCounts.forEach((j: any) => { if (j.pmId) jobMap.set(j.pmId, j.activeJobs); });

    // Escalation queue: overdue projects
    const overdueProjects = await db.select().from(projects)
      .where(and(
        sql`${projects.deadline} < NOW()`,
        sql`${projects.status} NOT IN ('completed', 'closed', 'cancelled', 'invoiced')`
      ))
      .orderBy(desc(projects.deadline))
      .limit(20);

    const teamWorkload = pms.map(pm => ({
      id: pm.id,
      name: pm.name,
      email: pm.email,
      projectCount: countMap.get(pm.id)?.total || 0,
      activeProjects: countMap.get(pm.id)?.active || 0,
      completedProjects: countMap.get(pm.id)?.completed || 0,
      activeJobs: jobMap.get(pm.id) || 0,
    }));

    res.json({ teamWorkload, escalationQueue: overdueProjects });
  } catch (e: any) {
    res.status(500).json({ error: safeError("Dashboard fetch failed", e) });
  }
});

// Team Performance
router.get("/pm-team-lead/team-performance", requireAuth, requireRole("pm_team_lead", "admin", "gm", "operations_manager"), async (req: Request, res: Response) => {
  try {
    const pms = await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.role, "pm"));
    const pmIds = pms.map(p => p.id);

    const performance = [];
    for (const pm of pms) {
      // Total and on-time completed projects
      const [stats] = await db.select({
        total: count(),
        completed: sql<number>`SUM(CASE WHEN ${projects.status} IN ('completed', 'closed') THEN 1 ELSE 0 END)::int`,
        onTime: sql<number>`SUM(CASE WHEN ${projects.status} IN ('completed', 'closed') AND (${projects.completedAt} <= ${projects.deadline} OR ${projects.deadline} IS NULL) THEN 1 ELSE 0 END)::int`,
      }).from(projects).where(eq(projects.pmId, pm.id));

      const completedCount = stats?.completed || 0;
      const onTimeCount = stats?.onTime || 0;
      const onTimePercent = completedCount > 0 ? Math.round((onTimeCount / completedCount) * 100) : 0;

      performance.push({
        pmId: pm.id,
        pmName: pm.name,
        totalProjects: stats?.total || 0,
        completedProjects: completedCount,
        onTimePercent,
      });
    }

    res.json({ performance });
  } catch (e: any) {
    res.status(500).json({ error: safeError("Performance fetch failed", e) });
  }
});

// Reassign project to another PM
router.post("/pm-team-lead/reassign", requireAuth, requireRole("pm_team_lead", "admin", "gm", "operations_manager"), async (req: Request, res: Response) => {
  try {
    const body = validate(z.object({
      projectId: z.number().int().positive(),
      newPmId: z.number().int().positive(),
    }), req.body, res);
    if (!body) return;

    const [old] = await db.select({ pmId: projects.pmId }).from(projects).where(eq(projects.id, body.projectId));
    const [updated] = await db.update(projects).set({ pmId: body.newPmId, updatedAt: new Date() }).where(eq(projects.id, body.projectId)).returning();
    if (!updated) return res.status(404).json({ error: "Project not found" });

    await logAudit((req as any).pmUserId, "reassign_pm", "project", body.projectId, { pmId: old?.pmId }, { pmId: body.newPmId }, getClientIp(req));
    res.json(updated);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Reassignment failed", e) });
  }
});

export default router;

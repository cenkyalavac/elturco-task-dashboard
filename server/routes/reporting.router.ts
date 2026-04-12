/**
 * Reporting Router — analytics, notification center, global search, team availability.
 *
 * Routes:
 *   GET  /analytics/filters
 *   GET  /analytics
 *   GET  /notifications
 *   POST /notifications/:id/read
 *   POST /notifications/read-all
 *   GET  /search
 *   GET  /availability/team
 */
import { Router, Request, Response } from "express";
import { storage, db } from "../storage";
import { projects, vendors, customers, clientInvoices, vendorAvailability } from "@shared/schema";
import { eq, sql, asc, and } from "drizzle-orm";
import {
  requireAuth,
  param,
  safeError,
  getCached,
  setCache,
} from "./shared";
import { getAllTasksCached, parseDeadline } from "./integration.router";

const router = Router();

// ============================================
// ANALYTICS
// ============================================

// Analytics filter options
router.get("/analytics/filters", requireAuth, async (_req: Request, res: Response) => {
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

// Main analytics endpoint
router.get("/analytics", requireAuth, async (req: Request, res: Response) => {
  try {
    // Cache analytics response for 5 min (keyed by query params)
    const cacheKey = `analytics_${req.url}`;
    const cachedAnalytics = getCached<any>(cacheKey, 300000);
    if (cachedAnalytics) return res.json(cachedAnalytics);

    const allSheetTasksRaw = await getAllTasksCached();

    // Apply filters
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

      // By month (from deadline)
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

    // Translator workload balance
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
// NOTIFICATION CENTER (V1)
// ============================================

router.get("/notifications", requireAuth, async (_req: Request, res: Response) => {
  const recent = await storage.getRecentNotifications(50);
  const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const filtered = recent.filter(n => n.createdAt >= cutoff);
  res.json({ notifications: filtered, unreadCount: await storage.getUnreadCount() });
});

router.post("/notifications/:id/read", requireAuth, async (req: Request, res: Response) => {
  await storage.markNotificationRead(+param(req, "id"));
  res.json({ success: true });
});

router.post("/notifications/read-all", requireAuth, async (_req: Request, res: Response) => {
  await storage.markAllNotificationsRead();
  res.json({ success: true });
});

// ============================================
// GLOBAL SEARCH (Cmd+K)
// ============================================

router.get("/search", requireAuth, async (req: Request, res: Response) => {
  try {
    const q = (req.query.q as string || "").trim();
    if (!q || q.length < 2) return res.json({ results: [] });
    const term = `%${q}%`;
    const [projectResults, vendorResults, customerResults, invoiceResults] = await Promise.all([
      db.select({ id: projects.id, name: projects.projectName, code: projects.projectCode, status: projects.status }).from(projects).where(sql`${projects.projectName} ILIKE ${term} OR ${projects.projectCode} ILIKE ${term}`).limit(8),
      db.select({ id: vendors.id, name: vendors.fullName, email: vendors.email, status: vendors.status }).from(vendors).where(sql`${vendors.fullName} ILIKE ${term} OR ${vendors.email} ILIKE ${term}`).limit(8),
      db.select({ id: customers.id, name: customers.name, code: customers.code, status: customers.status }).from(customers).where(sql`${customers.name} ILIKE ${term} OR ${customers.code} ILIKE ${term}`).limit(8),
      db.select({ id: clientInvoices.id, invoiceNumber: clientInvoices.invoiceNumber, total: clientInvoices.total, status: clientInvoices.status }).from(clientInvoices).where(sql`${clientInvoices.invoiceNumber} ILIKE ${term}`).limit(8),
    ]);
    res.json({
      results: [
        ...projectResults.map(p => ({ type: "project", id: p.id, label: p.name, sub: p.code, status: p.status, href: `/projects/${p.id}` })),
        ...vendorResults.map(v => ({ type: "vendor", id: v.id, label: v.name, sub: v.email, status: v.status, href: `/vendors/${v.id}` })),
        ...customerResults.map(c => ({ type: "customer", id: c.id, label: c.name, sub: c.code, status: c.status, href: `/customers/${c.id}` })),
        ...invoiceResults.map(i => ({ type: "invoice", id: i.id, label: i.invoiceNumber || `INV-${i.id}`, sub: `${i.total || 0}`, status: i.status, href: `/invoices` })),
      ],
    });
  } catch (e: any) {
    res.status(500).json({ error: safeError("Search failed", e) });
  }
});

// ============================================
// TEAM-WIDE AVAILABILITY
// ============================================

router.get("/availability/team", requireAuth, async (req: Request, res: Response) => {
  try {
    const { month, year } = req.query;
    let conditions: any[] = [];
    if (month && year) {
      const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
      const endMonth = +month === 12 ? 1 : +month + 1;
      const endYear = +month === 12 ? +year + 1 : +year;
      const endDate = `${endYear}-${String(endMonth).padStart(2, "0")}-01`;
      conditions.push(sql`${vendorAvailability.date} >= ${startDate} AND ${vendorAvailability.date} < ${endDate}`);
    }
    const query = conditions.length > 0
      ? db.select().from(vendorAvailability).where(and(...conditions))
      : db.select().from(vendorAvailability);
    const records = await query.orderBy(asc(vendorAvailability.date));
    const vendorNames = await db.select({ id: vendors.id, fullName: vendors.fullName }).from(vendors);
    const nameMap = new Map(vendorNames.map(v => [v.id, v.fullName]));
    res.json(records.map(r => ({ ...r, vendorName: nameMap.get(r.vendorId) || "Unknown" })));
  } catch (e: any) {
    res.status(500).json({ error: safeError("Team availability fetch failed", e) });
  }
});

export default router;

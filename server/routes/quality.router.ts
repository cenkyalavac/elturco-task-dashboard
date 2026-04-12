/**
 * Quality Router — Faz 6: Kalite Yönetim Sistemi (Quality Management System)
 *
 * Handles:
 *   - Legacy quality reports CRUD
 *   - LQA Scoring System (MQM-based)
 *   - LQA Dispute & Arbitration
 *   - QS (Quality Score) Scorecard
 *   - RCA (Root Cause Analysis)
 *   - Quality Trends & Reporting
 *   - Quality Alerts
 *   - Customer Feedback
 *   - Quality Dashboard
 *   - Quality Export
 *   - Document Compliance
 */
import { Router, Request, Response } from "express";
import { z } from "zod";
import { eq, and, sql, desc, asc, gte, lte, inArray } from "drizzle-orm";
import { requireAuth, requireRole, validate, param, safeError, logAudit, getClientIp } from "./shared";
import { storage, db } from "../storage";
import { qualityReports, vendors, vendorDocuments, vendorDocumentSignatures, projects, jobs, users, customers } from "@shared/schema";

const router = Router();

// ============================================
// ZOD SCHEMAS
// ============================================
const createQualityReportSchema = z.object({
  vendorId: z.number().int().positive(),
  reportType: z.enum(["LQA", "QS", "Random_QA"]),
}).passthrough();

const createLqaReportSchema = z.object({
  projectId: z.number().int().positive().optional(),
  jobId: z.number().int().positive().optional(),
  vendorId: z.number().int().positive(),
  sourceLanguage: z.string().max(10).optional(),
  targetLanguage: z.string().max(10).optional(),
  wordCount: z.number().int().positive().optional(),
  passThreshold: z.number().min(0).max(100).optional(),
  notes: z.string().optional(),
});

const createLqaErrorSchema = z.object({
  category: z.string().min(1).max(100),
  subcategory: z.string().max(100).optional(),
  severity: z.enum(["critical", "major", "minor", "preferential"]),
  segmentText: z.string().optional(),
  errorDescription: z.string().optional(),
});

const createDisputeSchema = z.object({
  errorId: z.number().int().positive().optional(),
  vendorId: z.number().int().positive(),
  disputeReason: z.string().min(1),
  vendorEvidence: z.string().optional(),
});

const resolveDisputeSchema = z.object({
  resolution: z.enum(["accepted", "rejected", "partial"]),
  qlResponse: z.string().optional(),
  newSeverity: z.enum(["critical", "major", "minor", "preferential"]).optional(),
});

const createRcaSchema = z.object({
  title: z.string().min(1).max(300),
  projectId: z.number().int().positive().optional(),
  jobId: z.number().int().positive().optional(),
  vendorId: z.number().int().positive().optional(),
  lqaReportId: z.number().int().positive().optional(),
  category: z.string().min(1).max(100),
  rootCause: z.string().min(1),
  impact: z.enum(["high", "medium", "low"]).optional(),
  correctiveAction: z.string().optional(),
  preventiveAction: z.string().optional(),
  assignedTo: z.number().int().positive().optional(),
  dueDate: z.string().optional(),
});

const updateRcaSchema = z.object({
  title: z.string().max(300).optional(),
  rootCause: z.string().optional(),
  impact: z.enum(["high", "medium", "low"]).optional(),
  correctiveAction: z.string().optional(),
  preventiveAction: z.string().optional(),
  assignedTo: z.number().int().positive().optional().nullable(),
  status: z.enum(["open", "in_progress", "implemented", "verified", "closed"]).optional(),
  dueDate: z.string().optional().nullable(),
});

const createFeedbackSchema = z.object({
  projectId: z.number().int().positive().optional(),
  customerId: z.number().int().positive().optional(),
  overallRating: z.number().int().min(1).max(5),
  accuracyRating: z.number().int().min(1).max(5).optional(),
  timelinessRating: z.number().int().min(1).max(5).optional(),
  communicationRating: z.number().int().min(1).max(5).optional(),
  comments: z.string().optional(),
});

// ============================================
// SEVERITY WEIGHTS
// ============================================
const SEVERITY_WEIGHTS: Record<string, number> = {
  critical: 5,
  major: 3,
  minor: 1,
  preferential: 0,
};

// ============================================
// HELPERS
// ============================================
function calcLqaScore(totalPenalty: number, wordCount: number): number {
  if (!wordCount || wordCount <= 0) return 100;
  return Math.max(0, 100 - (totalPenalty / wordCount) * 1000);
}

async function recalculateVendorQualityScores(vendorId: number) {
  try {
    const reports = await db.select().from(qualityReports).where(eq(qualityReports.vendorId, vendorId));
    const qsReports = reports.filter(r => r.reportType === "QS" && r.qsScore != null);
    const lqaReports = reports.filter(r => r.reportType === "LQA" && r.lqaScore != null);

    const avgQs = qsReports.length > 0
      ? qsReports.reduce((sum, r) => sum + Number(r.qsScore), 0) / qsReports.length
      : null;
    const avgLqa = lqaReports.length > 0
      ? lqaReports.reduce((sum, r) => sum + Number(r.lqaScore), 0) / lqaReports.length
      : null;

    let combined: number | null = null;
    if (avgQs != null && avgLqa != null) {
      const lqaNormalized = avgLqa / 20;
      combined = (avgQs + lqaNormalized) / 2;
    } else if (avgQs != null) {
      combined = avgQs;
    } else if (avgLqa != null) {
      combined = avgLqa / 20;
    }

    await db.update(vendors).set({
      averageQsScore: avgQs != null ? String(avgQs) : null,
      averageLqaScore: avgLqa != null ? String(avgLqa) : null,
      combinedQualityScore: combined != null ? String(combined) : null,
      totalReviewsCount: reports.length,
      updatedAt: new Date(),
    }).where(eq(vendors.id, vendorId));
  } catch (e) {
    console.error("Quality score recalculation error (non-fatal):", e);
  }
}

// ============================================
// LEGACY QUALITY REPORTS CRUD
// ============================================

router.get("/quality-reports", requireAuth, async (req: Request, res: Response) => {
  const vendorId = req.query.vendorId ? +req.query.vendorId : undefined;
  const reports = await storage.getQualityReports(vendorId);
  res.json(reports);
});

router.post("/quality-reports", requireAuth, async (req: Request, res: Response) => {
  try {
    const body = validate(createQualityReportSchema, req.body, res);
    if (!body) return;
    const report = await storage.createQualityReport(body);
    await logAudit((req as any).pmUserId, "create", "quality_report", report.id, null, report, getClientIp(req));
    if (report.vendorId && (report.qsScore != null || report.lqaScore != null)) {
      await recalculateVendorQualityScores(report.vendorId);
    }
    res.json(report);
  } catch (e: any) {
    console.error("Create quality report error:", e);
    res.status(500).json({ error: "Failed to create quality report" });
  }
});

router.patch("/quality-reports/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const id = +param(req, "id");
    const oldReport = await storage.getQualityReport(id);
    const report = await storage.updateQualityReport(id, req.body);
    await logAudit((req as any).pmUserId, "update", "quality_report", id, oldReport, report, getClientIp(req));
    if (report.vendorId && (req.body.qsScore !== undefined || req.body.lqaScore !== undefined)) {
      await recalculateVendorQualityScores(report.vendorId);
    }
    res.json(report);
  } catch (e: any) {
    console.error("Update quality report error:", e);
    res.status(500).json({ error: "Failed to update quality report" });
  }
});

router.post("/quality-reports/:id/submit", requireAuth, async (req: Request, res: Response) => {
  try {
    const id = +param(req, "id");
    const [existing] = await db.select().from(qualityReports).where(eq(qualityReports.id, id));
    if (!existing) return res.status(404).json({ error: "Quality report not found" });
    if (existing.status !== "draft") {
      return res.status(400).json({ error: `Cannot submit a report with status '${existing.status}'. Only draft reports can be submitted.` });
    }
    const report = await storage.updateQualityReport(id, {
      status: "submitted",
      submissionDate: new Date(),
      reviewDeadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    await logAudit((req as any).pmUserId, "submit", "quality_report", id, existing, report, getClientIp(req));
    if (existing.vendorId) {
      await recalculateVendorQualityScores(existing.vendorId);
    }
    res.json(report);
  } catch (e: any) {
    console.error("Submit quality report error:", e);
    res.status(500).json({ error: "Failed to submit quality report" });
  }
});

router.post("/quality-reports/:id/dispute", requireAuth, async (req: Request, res: Response) => {
  try {
    const id = +param(req, "id");
    const [existing] = await db.select().from(qualityReports).where(eq(qualityReports.id, id));
    if (!existing) return res.status(404).json({ error: "Quality report not found" });
    if (existing.status !== "submitted" && existing.status !== "pending_translator_review") {
      return res.status(400).json({ error: `Cannot dispute a report with status '${existing.status}'.` });
    }
    const { translatorComments } = req.body;
    const report = await storage.updateQualityReport(id, {
      status: "translator_disputed",
      translatorComments: translatorComments || null,
    });
    await logAudit((req as any).pmUserId, "dispute", "quality_report", id, existing, report, getClientIp(req));
    res.json(report);
  } catch (e: any) {
    console.error("Dispute quality report error:", e);
    res.status(500).json({ error: "Failed to dispute quality report" });
  }
});

// ============================================
// QUALITY ANALYTICS (Legacy)
// ============================================

router.get("/analytics/quality", requireAuth, async (req: Request, res: Response) => {
  try {
    const reports = await db.select().from(qualityReports).orderBy(desc(qualityReports.id));
    const totalReports = reports.length;
    const qsScores = reports.filter(r => r.qsScore).map(r => parseFloat(r.qsScore!));
    const lqaScores = reports.filter(r => r.lqaScore).map(r => parseFloat(r.lqaScore!));
    const avgQs = qsScores.length > 0 ? qsScores.reduce((a, b) => a + b, 0) / qsScores.length : 0;
    const avgLqa = lqaScores.length > 0 ? lqaScores.reduce((a, b) => a + b, 0) / lqaScores.length : 0;

    const vendorScores = new Map<number, { lqaSum: number; lqaCount: number; qsSum: number; qsCount: number; name: string }>();
    for (const r of reports) {
      if (!vendorScores.has(r.vendorId)) vendorScores.set(r.vendorId, { lqaSum: 0, lqaCount: 0, qsSum: 0, qsCount: 0, name: "" });
      const vs = vendorScores.get(r.vendorId)!;
      if (r.lqaScore) { vs.lqaSum += parseFloat(r.lqaScore); vs.lqaCount++; }
      if (r.qsScore) { vs.qsSum += parseFloat(r.qsScore); vs.qsCount++; }
    }
    const flaggedVendors = Array.from(vendorScores.entries()).filter(([, vs]) => {
      const avgL = vs.lqaCount > 0 ? vs.lqaSum / vs.lqaCount : 0;
      const avgQ = vs.qsCount > 0 ? (vs.qsSum / vs.qsCount) * 20 : 0;
      const combined = vs.lqaCount > 0 && vs.qsCount > 0 ? (avgL * 4 + avgQ) / 5 : (avgL || avgQ);
      return combined > 0 && combined < 70;
    }).length;

    const trendMap = new Map<string, { lqaSum: number; lqaCount: number; qsSum: number; qsCount: number }>();
    for (const r of reports) {
      const month = r.reportDate ? r.reportDate.substring(0, 7) : (r.createdAt ? new Date(r.createdAt).toISOString().substring(0, 7) : "unknown");
      if (!trendMap.has(month)) trendMap.set(month, { lqaSum: 0, lqaCount: 0, qsSum: 0, qsCount: 0 });
      const t = trendMap.get(month)!;
      if (r.lqaScore) { t.lqaSum += parseFloat(r.lqaScore); t.lqaCount++; }
      if (r.qsScore) { t.qsSum += parseFloat(r.qsScore); t.qsCount++; }
    }
    const trend = Array.from(trendMap.entries()).map(([month, d]) => ({
      month,
      avgLqa: d.lqaCount > 0 ? d.lqaSum / d.lqaCount : null,
      avgQs: d.qsCount > 0 ? d.qsSum / d.qsCount : null,
    })).sort((a, b) => a.month.localeCompare(b.month));

    const topPerformersRaw = Array.from(vendorScores.entries()).map(([vendorId, vs]) => {
      const avgL = vs.lqaCount > 0 ? vs.lqaSum / vs.lqaCount : 0;
      const avgQ = vs.qsCount > 0 ? (vs.qsSum / vs.qsCount) * 20 : 0;
      const combined = vs.lqaCount > 0 && vs.qsCount > 0 ? (avgL * 4 + avgQ) / 5 : (avgL || avgQ);
      return { vendorId, avgLqa: avgL, avgQs: vs.qsCount > 0 ? vs.qsSum / vs.qsCount : 0, combined, reviewCount: vs.lqaCount + vs.qsCount };
    }).sort((a, b) => b.combined - a.combined).slice(0, 20);
    const vendorNameMap = new Map<number, string>();
    for (const tp of topPerformersRaw) {
      if (!vendorNameMap.has(tp.vendorId)) {
        const v = await storage.getVendor(tp.vendorId);
        if (v) vendorNameMap.set(tp.vendorId, v.fullName);
      }
    }
    const topPerformers = topPerformersRaw.map(tp => ({
      ...tp,
      vendorName: vendorNameMap.get(tp.vendorId) || `Vendor #${tp.vendorId}`,
    }));

    const accountMap = new Map<string, { count: number; lqaSum: number; lqaCount: number }>();
    for (const r of reports) {
      const acct = r.clientAccount || "Unknown";
      if (!accountMap.has(acct)) accountMap.set(acct, { count: 0, lqaSum: 0, lqaCount: 0 });
      const a = accountMap.get(acct)!;
      a.count++;
      if (r.lqaScore) { a.lqaSum += parseFloat(r.lqaScore); a.lqaCount++; }
    }
    const accountBreakdown = Array.from(accountMap.entries()).map(([account, d]) => ({
      account, count: d.count, avgLqa: d.lqaCount > 0 ? d.lqaSum / d.lqaCount : null,
    }));

    res.json({ totalReports, avgQs, avgLqa, flaggedVendors, trend, topPerformers, accountBreakdown });
  } catch (e: any) {
    res.status(500).json({ error: safeError("Quality analytics failed", e) });
  }
});

// ============================================
// FAZ 6: LQA SCORING SYSTEM (MQM-based)
// ============================================

// List LQA reports
router.get("/lqa-reports", requireAuth, requireRole("quality_lead", "operations_manager"), async (req: Request, res: Response) => {
  try {
    const { vendorId, projectId, status, dateFrom, dateTo } = req.query;
    let query = `SELECT * FROM lqa_reports WHERE 1=1`;
    const params: any[] = [];
    let paramIdx = 1;
    if (vendorId) { query += ` AND vendor_id = $${paramIdx++}`; params.push(+vendorId); }
    if (projectId) { query += ` AND project_id = $${paramIdx++}`; params.push(+projectId); }
    if (status) { query += ` AND status = $${paramIdx++}`; params.push(status); }
    if (dateFrom) { query += ` AND created_at >= $${paramIdx++}`; params.push(dateFrom); }
    if (dateTo) { query += ` AND created_at <= $${paramIdx++}`; params.push(dateTo); }
    query += ` ORDER BY created_at DESC`;

    const result = await db.execute(sql.raw(query.replace(/\$(\d+)/g, (_, n) => {
      const val = params[parseInt(n) - 1];
      if (typeof val === "number") return String(val);
      return `'${String(val).replace(/'/g, "''")}'`;
    })));
    res.json(result.rows || []);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Failed to list LQA reports", e) });
  }
});

// Create LQA report
router.post("/lqa-reports", requireAuth, requireRole("quality_lead", "operations_manager"), async (req: Request, res: Response) => {
  try {
    const body = validate(createLqaReportSchema, req.body, res);
    if (!body) return;
    const evaluatorId = (req as any).pmUserId;
    const result = await db.execute(sql`
      INSERT INTO lqa_reports (project_id, job_id, vendor_id, evaluator_id, source_language, target_language, word_count, pass_threshold, notes, status)
      VALUES (${body.projectId || null}, ${body.jobId || null}, ${body.vendorId}, ${evaluatorId},
              ${body.sourceLanguage || null}, ${body.targetLanguage || null}, ${body.wordCount || null},
              ${body.passThreshold || 98.0}, ${body.notes || null}, 'draft')
      RETURNING *
    `);
    const report = (result.rows as any[])[0];
    await logAudit(evaluatorId, "create", "lqa_report", report.id, null, report, getClientIp(req));
    res.json(report);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Failed to create LQA report", e) });
  }
});

// Get LQA report with errors
router.get("/lqa-reports/:id", requireAuth, requireRole("quality_lead", "operations_manager"), async (req: Request, res: Response) => {
  try {
    const id = +param(req, "id");
    const reportResult = await db.execute(sql`SELECT * FROM lqa_reports WHERE id = ${id}`);
    if (!reportResult.rows || reportResult.rows.length === 0) return res.status(404).json({ error: "LQA report not found" });
    const report = (reportResult.rows as any[])[0];

    const errorsResult = await db.execute(sql`SELECT * FROM lqa_errors WHERE report_id = ${id} ORDER BY created_at ASC`);
    const disputesResult = await db.execute(sql`SELECT * FROM lqa_disputes WHERE report_id = ${id} ORDER BY created_at ASC`);

    res.json({ ...report, errors: errorsResult.rows || [], disputes: disputesResult.rows || [] });
  } catch (e: any) {
    res.status(500).json({ error: safeError("Failed to get LQA report", e) });
  }
});

// Update LQA report
router.patch("/lqa-reports/:id", requireAuth, requireRole("quality_lead", "operations_manager"), async (req: Request, res: Response) => {
  try {
    const id = +param(req, "id");
    const { notes, status, wordCount, passThreshold } = req.body;
    const sets: string[] = [];
    if (notes !== undefined) sets.push(`notes = '${String(notes).replace(/'/g, "''")}'`);
    if (status !== undefined) sets.push(`status = '${String(status).replace(/'/g, "''")}'`);
    if (wordCount !== undefined) sets.push(`word_count = ${Number(wordCount)}`);
    if (passThreshold !== undefined) sets.push(`pass_threshold = ${Number(passThreshold)}`);
    sets.push(`updated_at = NOW()`);

    const result = await db.execute(sql.raw(`UPDATE lqa_reports SET ${sets.join(", ")} WHERE id = ${id} RETURNING *`));
    if (!result.rows || result.rows.length === 0) return res.status(404).json({ error: "LQA report not found" });
    await logAudit((req as any).pmUserId, "update", "lqa_report", id, null, (result.rows as any[])[0], getClientIp(req));
    res.json((result.rows as any[])[0]);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Failed to update LQA report", e) });
  }
});

// Delete draft LQA report
router.delete("/lqa-reports/:id", requireAuth, requireRole("quality_lead", "operations_manager"), async (req: Request, res: Response) => {
  try {
    const id = +param(req, "id");
    const reportResult = await db.execute(sql`SELECT * FROM lqa_reports WHERE id = ${id}`);
    if (!reportResult.rows || reportResult.rows.length === 0) return res.status(404).json({ error: "LQA report not found" });
    const report = (reportResult.rows as any[])[0];
    if (report.status !== "draft") return res.status(400).json({ error: "Only draft reports can be deleted" });

    await db.execute(sql`DELETE FROM lqa_reports WHERE id = ${id}`);
    await logAudit((req as any).pmUserId, "delete", "lqa_report", id, report, null, getClientIp(req));
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: safeError("Failed to delete LQA report", e) });
  }
});

// Add error to LQA report
router.post("/lqa-reports/:id/errors", requireAuth, requireRole("quality_lead", "operations_manager"), async (req: Request, res: Response) => {
  try {
    const reportId = +param(req, "id");
    const body = validate(createLqaErrorSchema, req.body, res);
    if (!body) return;

    const penaltyPoints = SEVERITY_WEIGHTS[body.severity] || 0;
    const result = await db.execute(sql`
      INSERT INTO lqa_errors (report_id, category, subcategory, severity, segment_text, error_description, penalty_points)
      VALUES (${reportId}, ${body.category}, ${body.subcategory || null}, ${body.severity},
              ${body.segmentText || null}, ${body.errorDescription || null}, ${penaltyPoints})
      RETURNING *
    `);

    // Recalculate score
    const errorsResult = await db.execute(sql`SELECT SUM(penalty_points) as total_penalty FROM lqa_errors WHERE report_id = ${reportId}`);
    const totalPenalty = Number((errorsResult.rows as any[])[0]?.total_penalty || 0);
    const reportResult = await db.execute(sql`SELECT word_count, pass_threshold FROM lqa_reports WHERE id = ${reportId}`);
    const rpt = (reportResult.rows as any[])[0];
    const wordCount = Number(rpt?.word_count || 0);
    const threshold = Number(rpt?.pass_threshold || 98);
    const score = calcLqaScore(totalPenalty, wordCount);
    const passFail = wordCount > 0 ? (score >= threshold ? "pass" : "fail") : "pending";

    await db.execute(sql`UPDATE lqa_reports SET total_score = ${score}, pass_fail = ${passFail}, updated_at = NOW() WHERE id = ${reportId}`);

    res.json((result.rows as any[])[0]);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Failed to add LQA error", e) });
  }
});

// Remove error from LQA report
router.delete("/lqa-reports/:id/errors/:errorId", requireAuth, requireRole("quality_lead", "operations_manager"), async (req: Request, res: Response) => {
  try {
    const reportId = +param(req, "id");
    const errorId = +req.params.errorId;

    await db.execute(sql`DELETE FROM lqa_errors WHERE id = ${errorId} AND report_id = ${reportId}`);

    // Recalculate score
    const errorsResult = await db.execute(sql`SELECT SUM(penalty_points) as total_penalty FROM lqa_errors WHERE report_id = ${reportId}`);
    const totalPenalty = Number((errorsResult.rows as any[])[0]?.total_penalty || 0);
    const reportResult = await db.execute(sql`SELECT word_count, pass_threshold FROM lqa_reports WHERE id = ${reportId}`);
    const rpt = (reportResult.rows as any[])[0];
    const wordCount = Number(rpt?.word_count || 0);
    const threshold = Number(rpt?.pass_threshold || 98);
    const score = calcLqaScore(totalPenalty, wordCount);
    const passFail = wordCount > 0 ? (score >= threshold ? "pass" : "fail") : "pending";

    await db.execute(sql`UPDATE lqa_reports SET total_score = ${score}, pass_fail = ${passFail}, updated_at = NOW() WHERE id = ${reportId}`);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: safeError("Failed to remove LQA error", e) });
  }
});

// Submit LQA report (finalize)
router.post("/lqa-reports/:id/submit", requireAuth, requireRole("quality_lead", "operations_manager"), async (req: Request, res: Response) => {
  try {
    const reportId = +param(req, "id");
    const reportResult = await db.execute(sql`SELECT * FROM lqa_reports WHERE id = ${reportId}`);
    if (!reportResult.rows || reportResult.rows.length === 0) return res.status(404).json({ error: "LQA report not found" });
    const report = (reportResult.rows as any[])[0];
    if (report.status !== "draft") return res.status(400).json({ error: "Only draft reports can be submitted" });

    // Calculate final score
    const errorsResult = await db.execute(sql`SELECT SUM(penalty_points) as total_penalty FROM lqa_errors WHERE report_id = ${reportId}`);
    const totalPenalty = Number((errorsResult.rows as any[])[0]?.total_penalty || 0);
    const wordCount = Number(report.word_count || 0);
    const threshold = Number(report.pass_threshold || 98);
    const score = calcLqaScore(totalPenalty, wordCount);
    const passFail = wordCount > 0 ? (score >= threshold ? "pass" : "fail") : "pending";

    await db.execute(sql`
      UPDATE lqa_reports SET total_score = ${score}, max_score = 100, pass_fail = ${passFail},
      status = 'submitted', updated_at = NOW() WHERE id = ${reportId}
    `);

    // Check and trigger quality alerts
    if (report.vendor_id && passFail === "fail") {
      await checkAndCreateAlerts(report.vendor_id);
    }

    await logAudit((req as any).pmUserId, "submit", "lqa_report", reportId, report, { ...report, status: "submitted", total_score: score, pass_fail: passFail }, getClientIp(req));
    const updated = await db.execute(sql`SELECT * FROM lqa_reports WHERE id = ${reportId}`);
    res.json((updated.rows as any[])[0]);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Failed to submit LQA report", e) });
  }
});

// ============================================
// FAZ 6: LQA DISPUTE & ARBITRATION
// ============================================

// Create dispute
router.post("/lqa-reports/:reportId/disputes", requireAuth, async (req: Request, res: Response) => {
  try {
    const reportId = +req.params.reportId;
    const body = validate(createDisputeSchema, req.body, res);
    if (!body) return;

    const reportResult = await db.execute(sql`SELECT * FROM lqa_reports WHERE id = ${reportId}`);
    if (!reportResult.rows || reportResult.rows.length === 0) return res.status(404).json({ error: "LQA report not found" });

    let originalSeverity: string | null = null;
    if (body.errorId) {
      const errorResult = await db.execute(sql`SELECT severity FROM lqa_errors WHERE id = ${body.errorId}`);
      originalSeverity = (errorResult.rows as any[])?.[0]?.severity || null;
    }

    const result = await db.execute(sql`
      INSERT INTO lqa_disputes (report_id, error_id, vendor_id, dispute_reason, vendor_evidence, original_severity)
      VALUES (${reportId}, ${body.errorId || null}, ${body.vendorId}, ${body.disputeReason},
              ${body.vendorEvidence || null}, ${originalSeverity})
      RETURNING *
    `);

    // Update report status
    await db.execute(sql`UPDATE lqa_reports SET status = 'disputed', updated_at = NOW() WHERE id = ${reportId}`);

    await logAudit((req as any).pmUserId, "create", "lqa_dispute", (result.rows as any[])[0].id, null, (result.rows as any[])[0], getClientIp(req));
    res.json((result.rows as any[])[0]);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Failed to create dispute", e) });
  }
});

// List disputes
router.get("/disputes", requireAuth, requireRole("quality_lead", "operations_manager"), async (req: Request, res: Response) => {
  try {
    const { vendorId, resolution, reportId } = req.query;
    let conditions = `1=1`;
    if (vendorId) conditions += ` AND d.vendor_id = ${+vendorId}`;
    if (resolution) conditions += ` AND d.resolution = '${String(resolution).replace(/'/g, "''")}'`;
    if (reportId) conditions += ` AND d.report_id = ${+reportId}`;

    const result = await db.execute(sql.raw(`
      SELECT d.*, v.full_name as vendor_name
      FROM lqa_disputes d
      LEFT JOIN vendors v ON d.vendor_id = v.id
      WHERE ${conditions}
      ORDER BY d.created_at DESC
    `));
    res.json(result.rows || []);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Failed to list disputes", e) });
  }
});

// Get dispute details
router.get("/disputes/:id", requireAuth, requireRole("quality_lead", "operations_manager"), async (req: Request, res: Response) => {
  try {
    const id = +param(req, "id");
    const result = await db.execute(sql`
      SELECT d.*, v.full_name as vendor_name
      FROM lqa_disputes d
      LEFT JOIN vendors v ON d.vendor_id = v.id
      WHERE d.id = ${id}
    `);
    if (!result.rows || result.rows.length === 0) return res.status(404).json({ error: "Dispute not found" });
    res.json((result.rows as any[])[0]);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Failed to get dispute", e) });
  }
});

// Resolve dispute
router.patch("/disputes/:id/resolve", requireAuth, requireRole("quality_lead", "operations_manager"), async (req: Request, res: Response) => {
  try {
    const id = +param(req, "id");
    const body = validate(resolveDisputeSchema, req.body, res);
    if (!body) return;

    const resolvedBy = (req as any).pmUserId;
    const result = await db.execute(sql`
      UPDATE lqa_disputes SET resolution = ${body.resolution}, ql_response = ${body.qlResponse || null},
      new_severity = ${body.newSeverity || null}, resolved_by = ${resolvedBy}, resolved_at = NOW()
      WHERE id = ${id} RETURNING *
    `);
    if (!result.rows || result.rows.length === 0) return res.status(404).json({ error: "Dispute not found" });

    const dispute = (result.rows as any[])[0];

    // If accepted or partial, recalculate LQA score
    if ((body.resolution === "accepted" || body.resolution === "partial") && dispute.error_id) {
      if (body.resolution === "accepted") {
        // Remove the error
        await db.execute(sql`DELETE FROM lqa_errors WHERE id = ${dispute.error_id}`);
      } else if (body.resolution === "partial" && body.newSeverity) {
        // Update error severity
        const newPenalty = SEVERITY_WEIGHTS[body.newSeverity] || 0;
        await db.execute(sql`UPDATE lqa_errors SET severity = ${body.newSeverity}, penalty_points = ${newPenalty} WHERE id = ${dispute.error_id}`);
      }

      // Recalculate report score
      const reportId = dispute.report_id;
      const errorsResult = await db.execute(sql`SELECT SUM(penalty_points) as total_penalty FROM lqa_errors WHERE report_id = ${reportId}`);
      const totalPenalty = Number((errorsResult.rows as any[])[0]?.total_penalty || 0);
      const reportResult = await db.execute(sql`SELECT word_count, pass_threshold FROM lqa_reports WHERE id = ${reportId}`);
      const rpt = (reportResult.rows as any[])[0];
      const wordCount = Number(rpt?.word_count || 0);
      const threshold = Number(rpt?.pass_threshold || 98);
      const score = calcLqaScore(totalPenalty, wordCount);
      const passFail = wordCount > 0 ? (score >= threshold ? "pass" : "fail") : "pending";

      await db.execute(sql`UPDATE lqa_reports SET total_score = ${score}, pass_fail = ${passFail}, status = 'resolved', updated_at = NOW() WHERE id = ${reportId}`);
    } else {
      // If rejected, resolve the report
      await db.execute(sql`UPDATE lqa_reports SET status = 'resolved', updated_at = NOW() WHERE id = ${dispute.report_id}`);
    }

    await logAudit(resolvedBy, "resolve", "lqa_dispute", id, null, dispute, getClientIp(req));
    res.json(dispute);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Failed to resolve dispute", e) });
  }
});

// ============================================
// FAZ 6: QS (QUALITY SCORE) SCORECARD
// ============================================

// Get vendor QS history
router.get("/vendor-scores", requireAuth, requireRole("quality_lead", "operations_manager"), async (req: Request, res: Response) => {
  try {
    const { vendorId, period } = req.query;
    let conditions = `1=1`;
    if (vendorId) conditions += ` AND vendor_id = ${+vendorId}`;
    if (period) conditions += ` AND period = '${String(period).replace(/'/g, "''")}'`;

    const result = await db.execute(sql.raw(`
      SELECT vqs.*, v.full_name as vendor_name
      FROM vendor_quality_scores vqs
      LEFT JOIN vendors v ON vqs.vendor_id = v.id
      WHERE ${conditions}
      ORDER BY period DESC, vendor_id
    `));
    res.json(result.rows || []);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Failed to get vendor scores", e) });
  }
});

// Recalculate vendor QS for period
router.post("/recalculate-scores", requireAuth, requireRole("quality_lead", "operations_manager"), async (req: Request, res: Response) => {
  try {
    const { period } = req.body;
    const targetPeriod = period || new Date().toISOString().substring(0, 7);

    // Get all LQA reports for the period
    const reportsResult = await db.execute(sql.raw(`
      SELECT vendor_id, total_score, pass_fail
      FROM lqa_reports
      WHERE status = 'submitted' AND to_char(created_at, 'YYYY-MM') = '${String(targetPeriod).replace(/'/g, "''")}'
    `));
    const reports = (reportsResult.rows || []) as any[];

    // Get disputes for the period
    const disputesResult = await db.execute(sql.raw(`
      SELECT vendor_id, resolution
      FROM lqa_disputes
      WHERE to_char(created_at, 'YYYY-MM') = '${String(targetPeriod).replace(/'/g, "''")}'
    `));
    const disputes = (disputesResult.rows || []) as any[];

    // Group by vendor
    const vendorMap = new Map<number, { scores: number[]; passCount: number; failCount: number; disputeCount: number; acceptedDisputes: number }>();
    for (const r of reports) {
      if (!vendorMap.has(r.vendor_id)) vendorMap.set(r.vendor_id, { scores: [], passCount: 0, failCount: 0, disputeCount: 0, acceptedDisputes: 0 });
      const v = vendorMap.get(r.vendor_id)!;
      if (r.total_score != null) v.scores.push(Number(r.total_score));
      if (r.pass_fail === "pass") v.passCount++;
      if (r.pass_fail === "fail") v.failCount++;
    }
    for (const d of disputes) {
      if (!vendorMap.has(d.vendor_id)) vendorMap.set(d.vendor_id, { scores: [], passCount: 0, failCount: 0, disputeCount: 0, acceptedDisputes: 0 });
      const v = vendorMap.get(d.vendor_id)!;
      v.disputeCount++;
      if (d.resolution === "accepted") v.acceptedDisputes++;
    }

    let updated = 0;
    for (const [vendorId, data] of vendorMap.entries()) {
      const avgLqa = data.scores.length > 0 ? data.scores.reduce((a, b) => a + b, 0) / data.scores.length : null;
      const totalReports = data.passCount + data.failCount;
      const passRate = totalReports > 0 ? data.passCount / totalReports : 0;
      const disputeAcceptanceRateInverse = data.disputeCount > 0 ? 1 - (data.acceptedDisputes / data.disputeCount) : 1;

      // QS = (avg LQA score * 0.7) + (pass rate * 100 * 0.2) + (dispute acceptance rate inverse * 100 * 0.1)
      const finalQs = avgLqa != null
        ? (avgLqa * 0.7) + (passRate * 100 * 0.2) + (disputeAcceptanceRateInverse * 100 * 0.1)
        : null;

      await db.execute(sql.raw(`
        INSERT INTO vendor_quality_scores (vendor_id, period, avg_lqa_score, total_reports, pass_count, fail_count, dispute_count, accepted_disputes, final_qs)
        VALUES (${vendorId}, '${String(targetPeriod).replace(/'/g, "''")}', ${avgLqa ?? 'NULL'}, ${totalReports}, ${data.passCount}, ${data.failCount}, ${data.disputeCount}, ${data.acceptedDisputes}, ${finalQs ?? 'NULL'})
        ON CONFLICT (vendor_id, period) DO UPDATE SET
          avg_lqa_score = EXCLUDED.avg_lqa_score, total_reports = EXCLUDED.total_reports,
          pass_count = EXCLUDED.pass_count, fail_count = EXCLUDED.fail_count,
          dispute_count = EXCLUDED.dispute_count, accepted_disputes = EXCLUDED.accepted_disputes,
          final_qs = EXCLUDED.final_qs
      `));
      updated++;
    }

    res.json({ success: true, period: targetPeriod, vendorsUpdated: updated });
  } catch (e: any) {
    res.status(500).json({ error: safeError("Failed to recalculate scores", e) });
  }
});

// Vendor QS ranking
router.get("/vendor-scores/ranking", requireAuth, requireRole("quality_lead", "operations_manager"), async (req: Request, res: Response) => {
  try {
    const result = await db.execute(sql.raw(`
      SELECT DISTINCT ON (vqs.vendor_id) vqs.*, v.full_name as vendor_name
      FROM vendor_quality_scores vqs
      LEFT JOIN vendors v ON vqs.vendor_id = v.id
      WHERE vqs.final_qs IS NOT NULL
      ORDER BY vqs.vendor_id, vqs.period DESC
    `));
    const ranked = ((result.rows || []) as any[]).sort((a, b) => Number(b.final_qs) - Number(a.final_qs))
      .map((r, i, arr) => {
        const percentile = ((arr.length - i) / arr.length) * 100;
        let badge = "Average";
        if (percentile >= 90) badge = "Top 10%";
        else if (percentile >= 60) badge = "Above Average";
        else if (percentile >= 40) badge = "Average";
        else if (percentile >= 20) badge = "Below Average";
        else badge = "Critical";
        return { ...r, rank: i + 1, badge };
      });
    res.json(ranked);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Failed to get vendor ranking", e) });
  }
});

// ============================================
// FAZ 6: RCA (ROOT CAUSE ANALYSIS)
// ============================================

// List RCA reports
router.get("/rca", requireAuth, requireRole("quality_lead", "operations_manager"), async (req: Request, res: Response) => {
  try {
    const { vendorId, status, category } = req.query;
    let conditions = `1=1`;
    if (vendorId) conditions += ` AND r.vendor_id = ${+vendorId}`;
    if (status) conditions += ` AND r.status = '${String(status).replace(/'/g, "''")}'`;
    if (category) conditions += ` AND r.category = '${String(category).replace(/'/g, "''")}'`;

    const result = await db.execute(sql.raw(`
      SELECT r.*, v.full_name as vendor_name, u.name as assigned_to_name
      FROM rca_reports r
      LEFT JOIN vendors v ON r.vendor_id = v.id
      LEFT JOIN users u ON r.assigned_to = u.id
      ORDER BY r.created_at DESC
    `));
    res.json(result.rows || []);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Failed to list RCA reports", e) });
  }
});

// Create RCA report
router.post("/rca", requireAuth, requireRole("quality_lead", "operations_manager"), async (req: Request, res: Response) => {
  try {
    const body = validate(createRcaSchema, req.body, res);
    if (!body) return;
    const createdBy = (req as any).pmUserId;

    const result = await db.execute(sql`
      INSERT INTO rca_reports (title, project_id, job_id, vendor_id, lqa_report_id, category, root_cause, impact,
        corrective_action, preventive_action, assigned_to, due_date, created_by)
      VALUES (${body.title}, ${body.projectId || null}, ${body.jobId || null}, ${body.vendorId || null},
              ${body.lqaReportId || null}, ${body.category}, ${body.rootCause}, ${body.impact || null},
              ${body.correctiveAction || null}, ${body.preventiveAction || null}, ${body.assignedTo || null},
              ${body.dueDate || null}, ${createdBy})
      RETURNING *
    `);
    await logAudit(createdBy, "create", "rca_report", (result.rows as any[])[0].id, null, (result.rows as any[])[0], getClientIp(req));
    res.json((result.rows as any[])[0]);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Failed to create RCA report", e) });
  }
});

// Get RCA report
router.get("/rca/:id", requireAuth, requireRole("quality_lead", "operations_manager"), async (req: Request, res: Response) => {
  try {
    const id = +param(req, "id");
    const result = await db.execute(sql`
      SELECT r.*, v.full_name as vendor_name, u.name as assigned_to_name
      FROM rca_reports r
      LEFT JOIN vendors v ON r.vendor_id = v.id
      LEFT JOIN users u ON r.assigned_to = u.id
      WHERE r.id = ${id}
    `);
    if (!result.rows || result.rows.length === 0) return res.status(404).json({ error: "RCA report not found" });
    res.json((result.rows as any[])[0]);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Failed to get RCA report", e) });
  }
});

// Update RCA report
router.patch("/rca/:id", requireAuth, requireRole("quality_lead", "operations_manager"), async (req: Request, res: Response) => {
  try {
    const id = +param(req, "id");
    const body = validate(updateRcaSchema, req.body, res);
    if (!body) return;

    const sets: string[] = [];
    if (body.title !== undefined) sets.push(`title = '${String(body.title).replace(/'/g, "''")}'`);
    if (body.rootCause !== undefined) sets.push(`root_cause = '${String(body.rootCause).replace(/'/g, "''")}'`);
    if (body.impact !== undefined) sets.push(`impact = '${String(body.impact).replace(/'/g, "''")}'`);
    if (body.correctiveAction !== undefined) sets.push(`corrective_action = '${String(body.correctiveAction).replace(/'/g, "''")}'`);
    if (body.preventiveAction !== undefined) sets.push(`preventive_action = '${String(body.preventiveAction).replace(/'/g, "''")}'`);
    if (body.assignedTo !== undefined) sets.push(`assigned_to = ${body.assignedTo === null ? 'NULL' : body.assignedTo}`);
    if (body.dueDate !== undefined) sets.push(`due_date = ${body.dueDate === null ? 'NULL' : `'${String(body.dueDate).replace(/'/g, "''")}'`}`);
    if (body.status !== undefined) {
      sets.push(`status = '${String(body.status).replace(/'/g, "''")}'`);
      if (body.status === "closed") {
        sets.push(`closed_at = NOW()`);
        sets.push(`closed_by = ${(req as any).pmUserId}`);
      }
    }
    sets.push(`updated_at = NOW()`);

    const result = await db.execute(sql.raw(`UPDATE rca_reports SET ${sets.join(", ")} WHERE id = ${id} RETURNING *`));
    if (!result.rows || result.rows.length === 0) return res.status(404).json({ error: "RCA report not found" });
    await logAudit((req as any).pmUserId, "update", "rca_report", id, null, (result.rows as any[])[0], getClientIp(req));
    res.json((result.rows as any[])[0]);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Failed to update RCA report", e) });
  }
});

// ============================================
// FAZ 6: QUALITY TREND REPORTING
// ============================================

// Get quality trends
router.get("/trends", requireAuth, requireRole("quality_lead", "operations_manager"), async (req: Request, res: Response) => {
  try {
    const { dateFrom, dateTo } = req.query;
    const fromDate = dateFrom ? String(dateFrom) : new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10);
    const toDate = dateTo ? String(dateTo) : new Date().toISOString().substring(0, 10);

    // Monthly LQA score trend
    const monthlyResult = await db.execute(sql.raw(`
      SELECT to_char(created_at, 'YYYY-MM') as month, AVG(total_score) as avg_score, COUNT(*) as report_count
      FROM lqa_reports WHERE status IN ('submitted', 'resolved') AND created_at >= '${fromDate}' AND created_at <= '${toDate} 23:59:59'
      GROUP BY to_char(created_at, 'YYYY-MM') ORDER BY month
    `));

    // Error category distribution
    const categoryResult = await db.execute(sql.raw(`
      SELECT e.category, COUNT(*) as count, SUM(e.penalty_points) as total_penalty
      FROM lqa_errors e
      JOIN lqa_reports r ON e.report_id = r.id
      WHERE r.status IN ('submitted', 'resolved') AND r.created_at >= '${fromDate}' AND r.created_at <= '${toDate} 23:59:59'
      GROUP BY e.category ORDER BY count DESC
    `));

    // Severity distribution
    const severityResult = await db.execute(sql.raw(`
      SELECT e.severity, COUNT(*) as count
      FROM lqa_errors e
      JOIN lqa_reports r ON e.report_id = r.id
      WHERE r.status IN ('submitted', 'resolved') AND r.created_at >= '${fromDate}' AND r.created_at <= '${toDate} 23:59:59'
      GROUP BY e.severity ORDER BY count DESC
    `));

    // Dispute resolution rate
    const disputeResult = await db.execute(sql.raw(`
      SELECT to_char(created_at, 'YYYY-MM') as month,
        COUNT(*) as total_disputes,
        COUNT(*) FILTER (WHERE resolution != 'open') as resolved,
        COUNT(*) FILTER (WHERE resolution = 'accepted') as accepted
      FROM lqa_disputes
      WHERE created_at >= '${fromDate}' AND created_at <= '${toDate} 23:59:59'
      GROUP BY to_char(created_at, 'YYYY-MM') ORDER BY month
    `));

    res.json({
      monthlyTrend: monthlyResult.rows || [],
      categoryDistribution: categoryResult.rows || [],
      severityDistribution: severityResult.rows || [],
      disputeResolution: disputeResult.rows || [],
    });
  } catch (e: any) {
    res.status(500).json({ error: safeError("Failed to get quality trends", e) });
  }
});

// Quality by language pair
router.get("/trends/by-language", requireAuth, requireRole("quality_lead", "operations_manager"), async (req: Request, res: Response) => {
  try {
    const result = await db.execute(sql.raw(`
      SELECT source_language || '>' || target_language as language_pair,
        AVG(total_score) as avg_score, COUNT(*) as report_count
      FROM lqa_reports
      WHERE status IN ('submitted', 'resolved') AND source_language IS NOT NULL AND target_language IS NOT NULL
      GROUP BY source_language, target_language
      ORDER BY avg_score DESC
    `));
    res.json(result.rows || []);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Failed to get quality by language", e) });
  }
});

// Quality by vendor
router.get("/trends/by-vendor", requireAuth, requireRole("quality_lead", "operations_manager"), async (req: Request, res: Response) => {
  try {
    const result = await db.execute(sql.raw(`
      SELECT r.vendor_id, v.full_name as vendor_name, AVG(r.total_score) as avg_score, COUNT(*) as report_count
      FROM lqa_reports r
      LEFT JOIN vendors v ON r.vendor_id = v.id
      WHERE r.status IN ('submitted', 'resolved') AND r.vendor_id IS NOT NULL
      GROUP BY r.vendor_id, v.full_name
      ORDER BY avg_score DESC
    `));
    res.json(result.rows || []);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Failed to get quality by vendor", e) });
  }
});

// ============================================
// FAZ 6: QUALITY ALERT SYSTEM
// ============================================

async function checkAndCreateAlerts(vendorId: number) {
  try {
    // Check consecutive fails
    const recentResult = await db.execute(sql`
      SELECT pass_fail FROM lqa_reports
      WHERE vendor_id = ${vendorId} AND status IN ('submitted', 'resolved')
      ORDER BY created_at DESC LIMIT 3
    `);
    const recent = (recentResult.rows || []) as any[];
    if (recent.length >= 3 && recent.every(r => r.pass_fail === "fail")) {
      await db.execute(sql`
        INSERT INTO quality_alerts (vendor_id, alert_type, severity, message, threshold_value, actual_value)
        VALUES (${vendorId}, 'consecutive_fails', 'critical',
                'Vendor has 3 consecutive LQA failures', 0, 3)
      `);
    }

    // Check average QS
    const avgResult = await db.execute(sql`
      SELECT AVG(total_score) as avg_score FROM lqa_reports
      WHERE vendor_id = ${vendorId} AND status IN ('submitted', 'resolved')
      AND created_at > NOW() - INTERVAL '90 days'
    `);
    const avgScore = Number((avgResult.rows as any[])?.[0]?.avg_score || 100);
    if (avgScore < 70) {
      await db.execute(sql`
        INSERT INTO quality_alerts (vendor_id, alert_type, severity, message, threshold_value, actual_value)
        VALUES (${vendorId}, 'qs_below_threshold', 'critical',
                'Vendor average quality score dropped below 70', 70, ${avgScore})
      `);
    } else if (avgScore < 85) {
      await db.execute(sql`
        INSERT INTO quality_alerts (vendor_id, alert_type, severity, message, threshold_value, actual_value)
        VALUES (${vendorId}, 'qs_below_threshold', 'warning',
                'Vendor average quality score dropped below 85', 85, ${avgScore})
      `);
    }

    // Check dispute rate
    const disputeResult = await db.execute(sql`
      SELECT COUNT(*) as total_reports,
        (SELECT COUNT(*) FROM lqa_disputes WHERE vendor_id = ${vendorId} AND created_at > NOW() - INTERVAL '90 days') as dispute_count
      FROM lqa_reports WHERE vendor_id = ${vendorId} AND created_at > NOW() - INTERVAL '90 days'
    `);
    const dr = (disputeResult.rows as any[])?.[0];
    if (dr && Number(dr.total_reports) > 0) {
      const disputeRate = Number(dr.dispute_count) / Number(dr.total_reports);
      if (disputeRate > 0.5) {
        await db.execute(sql`
          INSERT INTO quality_alerts (vendor_id, alert_type, severity, message, threshold_value, actual_value)
          VALUES (${vendorId}, 'high_dispute_rate', 'warning',
                  'Vendor dispute rate exceeds 50%', 50, ${Math.round(disputeRate * 100)})
        `);
      }
    }
  } catch (e) {
    console.error("Alert check error (non-fatal):", e);
  }
}

// List alerts
router.get("/alerts", requireAuth, requireRole("quality_lead", "operations_manager"), async (req: Request, res: Response) => {
  try {
    const { severity, acknowledged } = req.query;
    let conditions = `1=1`;
    if (severity) conditions += ` AND a.severity = '${String(severity).replace(/'/g, "''")}'`;
    if (acknowledged !== undefined) conditions += ` AND a.acknowledged = ${acknowledged === "true"}`;

    const result = await db.execute(sql.raw(`
      SELECT a.*, v.full_name as vendor_name
      FROM quality_alerts a
      LEFT JOIN vendors v ON a.vendor_id = v.id
      WHERE ${conditions}
      ORDER BY a.created_at DESC
    `));
    res.json(result.rows || []);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Failed to list alerts", e) });
  }
});

// Acknowledge alert
router.post("/alerts/:id/acknowledge", requireAuth, requireRole("quality_lead", "operations_manager"), async (req: Request, res: Response) => {
  try {
    const id = +param(req, "id");
    const userId = (req as any).pmUserId;
    const result = await db.execute(sql`
      UPDATE quality_alerts SET acknowledged = true, acknowledged_by = ${userId}, acknowledged_at = NOW()
      WHERE id = ${id} RETURNING *
    `);
    if (!result.rows || result.rows.length === 0) return res.status(404).json({ error: "Alert not found" });
    await logAudit(userId, "acknowledge", "quality_alert", id, null, (result.rows as any[])[0], getClientIp(req));
    res.json((result.rows as any[])[0]);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Failed to acknowledge alert", e) });
  }
});

// Run alert check for all vendors
router.post("/check-alerts", requireAuth, requireRole("quality_lead", "operations_manager"), async (req: Request, res: Response) => {
  try {
    const vendorsResult = await db.execute(sql.raw(`
      SELECT DISTINCT vendor_id FROM lqa_reports WHERE vendor_id IS NOT NULL
    `));
    const vendorIds = ((vendorsResult.rows || []) as any[]).map(r => r.vendor_id);

    for (const vendorId of vendorIds) {
      await checkAndCreateAlerts(vendorId);
    }

    res.json({ success: true, vendorsChecked: vendorIds.length });
  } catch (e: any) {
    res.status(500).json({ error: safeError("Failed to check alerts", e) });
  }
});

// ============================================
// FAZ 6: CUSTOMER QUALITY FEEDBACK
// ============================================

// List feedback
router.get("/customer-feedback", requireAuth, async (req: Request, res: Response) => {
  try {
    const { projectId, customerId } = req.query;
    let conditions = `1=1`;
    if (projectId) conditions += ` AND cf.project_id = ${+projectId}`;
    if (customerId) conditions += ` AND cf.customer_id = ${+customerId}`;

    const result = await db.execute(sql.raw(`
      SELECT cf.*, c.name as customer_name, p.project_name
      FROM customer_feedback cf
      LEFT JOIN customers c ON cf.customer_id = c.id
      LEFT JOIN projects p ON cf.project_id = p.id
      WHERE ${conditions}
      ORDER BY cf.submitted_at DESC
    `));
    res.json(result.rows || []);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Failed to list feedback", e) });
  }
});

// Submit feedback
router.post("/customer-feedback", requireAuth, async (req: Request, res: Response) => {
  try {
    const body = validate(createFeedbackSchema, req.body, res);
    if (!body) return;
    const submittedBy = (req as any).pmUserId;

    const result = await db.execute(sql`
      INSERT INTO customer_feedback (project_id, customer_id, overall_rating, accuracy_rating,
        timeliness_rating, communication_rating, comments, submitted_by)
      VALUES (${body.projectId || null}, ${body.customerId || null}, ${body.overallRating},
              ${body.accuracyRating || null}, ${body.timelinessRating || null},
              ${body.communicationRating || null}, ${body.comments || null}, ${submittedBy})
      RETURNING *
    `);
    await logAudit(submittedBy, "create", "customer_feedback", (result.rows as any[])[0].id, null, (result.rows as any[])[0], getClientIp(req));
    res.json((result.rows as any[])[0]);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Failed to submit feedback", e) });
  }
});

// Feedback summary
router.get("/customer-feedback/summary", requireAuth, async (req: Request, res: Response) => {
  try {
    const result = await db.execute(sql.raw(`
      SELECT
        COUNT(*) as total_feedback,
        ROUND(AVG(overall_rating)::numeric, 2) as avg_overall,
        ROUND(AVG(accuracy_rating)::numeric, 2) as avg_accuracy,
        ROUND(AVG(timeliness_rating)::numeric, 2) as avg_timeliness,
        ROUND(AVG(communication_rating)::numeric, 2) as avg_communication,
        COUNT(*) FILTER (WHERE overall_rating >= 4) as satisfied_count,
        COUNT(*) FILTER (WHERE overall_rating <= 2) as dissatisfied_count
      FROM customer_feedback
    `));
    res.json((result.rows as any[])[0] || {});
  } catch (e: any) {
    res.status(500).json({ error: safeError("Failed to get feedback summary", e) });
  }
});

// ============================================
// FAZ 6: QUALITY DASHBOARD
// ============================================

router.get("/dashboard", requireAuth, requireRole("quality_lead", "operations_manager"), async (req: Request, res: Response) => {
  try {
    const now = new Date();
    const thisMonth = now.toISOString().substring(0, 7);

    // KPI cards
    const kpiResult = await db.execute(sql.raw(`
      SELECT
        ROUND(AVG(total_score)::numeric, 2) as avg_lqa_score,
        COUNT(*) as total_reports_this_month
      FROM lqa_reports
      WHERE to_char(created_at, 'YYYY-MM') = '${thisMonth}'
      AND status IN ('submitted', 'resolved')
    `));
    const kpi = (kpiResult.rows as any[])[0] || {};

    const disputeCountResult = await db.execute(sql.raw(`
      SELECT COUNT(*) as open_disputes FROM lqa_disputes WHERE resolution = 'open'
    `));
    const openDisputes = Number((disputeCountResult.rows as any[])?.[0]?.open_disputes || 0);

    const avgResolutionResult = await db.execute(sql.raw(`
      SELECT ROUND(AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 86400)::numeric, 1) as avg_days
      FROM lqa_disputes WHERE resolved_at IS NOT NULL
    `));
    const avgResolutionDays = Number((avgResolutionResult.rows as any[])?.[0]?.avg_days || 0);

    // Open disputes table
    const openDisputesResult = await db.execute(sql.raw(`
      SELECT d.*, v.full_name as vendor_name, r.total_score as report_score
      FROM lqa_disputes d
      LEFT JOIN vendors v ON d.vendor_id = v.id
      LEFT JOIN lqa_reports r ON d.report_id = r.id
      WHERE d.resolution = 'open'
      ORDER BY d.created_at ASC
    `));

    // RCA status
    const rcaResult = await db.execute(sql.raw(`
      SELECT
        COUNT(*) FILTER (WHERE status != 'closed') as open_count,
        COUNT(*) FILTER (WHERE status = 'closed') as closed_count,
        MIN(created_at) FILTER (WHERE status != 'closed') as oldest_open
      FROM rca_reports
    `));

    // Recent quality reports
    const recentResult = await db.execute(sql.raw(`
      SELECT r.*, v.full_name as vendor_name
      FROM lqa_reports r
      LEFT JOIN vendors v ON r.vendor_id = v.id
      ORDER BY r.created_at DESC LIMIT 10
    `));

    // Quality alerts (unacknowledged)
    const alertsResult = await db.execute(sql.raw(`
      SELECT a.*, v.full_name as vendor_name
      FROM quality_alerts a
      LEFT JOIN vendors v ON a.vendor_id = v.id
      WHERE a.acknowledged = false
      ORDER BY a.created_at DESC LIMIT 10
    `));

    // Top/bottom vendors
    const vendorRankResult = await db.execute(sql.raw(`
      SELECT r.vendor_id, v.full_name as vendor_name, ROUND(AVG(r.total_score)::numeric, 2) as avg_score, COUNT(*) as report_count
      FROM lqa_reports r
      LEFT JOIN vendors v ON r.vendor_id = v.id
      WHERE r.status IN ('submitted', 'resolved') AND r.vendor_id IS NOT NULL
      AND r.created_at > NOW() - INTERVAL '90 days'
      GROUP BY r.vendor_id, v.full_name
      HAVING COUNT(*) >= 1
      ORDER BY avg_score DESC
    `));
    const allVendorRanks = (vendorRankResult.rows || []) as any[];
    const topVendors = allVendorRanks.slice(0, 5);
    const bottomVendors = allVendorRanks.slice(-5).reverse();

    // Customer feedback summary
    const feedbackResult = await db.execute(sql.raw(`
      SELECT
        ROUND(AVG(overall_rating)::numeric, 2) as avg_rating,
        COUNT(*) as total_feedback
      FROM customer_feedback
      WHERE submitted_at > NOW() - INTERVAL '30 days'
    `));

    res.json({
      kpi: {
        avgLqaScore: Number(kpi.avg_lqa_score || 0),
        totalReportsThisMonth: Number(kpi.total_reports_this_month || 0),
        openDisputes,
        avgResolutionDays,
      },
      openDisputes: openDisputesResult.rows || [],
      rca: (rcaResult.rows as any[])[0] || {},
      recentReports: recentResult.rows || [],
      alerts: alertsResult.rows || [],
      topVendors,
      bottomVendors,
      customerFeedback: (feedbackResult.rows as any[])[0] || {},
    });
  } catch (e: any) {
    res.status(500).json({ error: safeError("Quality dashboard failed", e) });
  }
});

// ============================================
// FAZ 6: QUALITY API & EXPORT
// ============================================

// CSV export — LQA reports
router.get("/export/lqa", requireAuth, requireRole("quality_lead", "operations_manager"), async (req: Request, res: Response) => {
  try {
    const result = await db.execute(sql.raw(`
      SELECT r.id, r.vendor_id, v.full_name as vendor_name, r.project_id, r.source_language, r.target_language,
        r.word_count, r.total_score, r.pass_fail, r.status, r.created_at
      FROM lqa_reports r
      LEFT JOIN vendors v ON r.vendor_id = v.id
      ORDER BY r.created_at DESC
    `));
    const rows = (result.rows || []) as any[];

    const headers = ["ID", "Vendor ID", "Vendor Name", "Project ID", "Source Language", "Target Language", "Word Count", "Total Score", "Pass/Fail", "Status", "Created At"];
    const csv = [
      headers.join(","),
      ...rows.map(r => [r.id, r.vendor_id, `"${(r.vendor_name || "").replace(/"/g, '""')}"`, r.project_id || "", r.source_language || "", r.target_language || "", r.word_count || "", r.total_score || "", r.pass_fail || "", r.status || "", r.created_at || ""].join(","))
    ].join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=lqa-reports.csv");
    res.send(csv);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Failed to export LQA reports", e) });
  }
});

// CSV export — RCA reports
router.get("/export/rca", requireAuth, requireRole("quality_lead", "operations_manager"), async (req: Request, res: Response) => {
  try {
    const result = await db.execute(sql.raw(`
      SELECT r.id, r.title, r.vendor_id, v.full_name as vendor_name, r.category, r.impact, r.status,
        r.root_cause, r.corrective_action, r.preventive_action, r.due_date, r.created_at
      FROM rca_reports r
      LEFT JOIN vendors v ON r.vendor_id = v.id
      ORDER BY r.created_at DESC
    `));
    const rows = (result.rows || []) as any[];

    const headers = ["ID", "Title", "Vendor ID", "Vendor Name", "Category", "Impact", "Status", "Root Cause", "Corrective Action", "Preventive Action", "Due Date", "Created At"];
    const csv = [
      headers.join(","),
      ...rows.map(r => [r.id, `"${(r.title || "").replace(/"/g, '""')}"`, r.vendor_id || "", `"${(r.vendor_name || "").replace(/"/g, '""')}"`, r.category || "", r.impact || "", r.status || "", `"${(r.root_cause || "").replace(/"/g, '""')}"`, `"${(r.corrective_action || "").replace(/"/g, '""')}"`, `"${(r.preventive_action || "").replace(/"/g, '""')}"`, r.due_date || "", r.created_at || ""].join(","))
    ].join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=rca-reports.csv");
    res.send(csv);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Failed to export RCA reports", e) });
  }
});

// CSV export — vendor QS scores
router.get("/export/vendor-scores", requireAuth, requireRole("quality_lead", "operations_manager"), async (req: Request, res: Response) => {
  try {
    const result = await db.execute(sql.raw(`
      SELECT vqs.*, v.full_name as vendor_name
      FROM vendor_quality_scores vqs
      LEFT JOIN vendors v ON vqs.vendor_id = v.id
      ORDER BY vqs.period DESC, vqs.vendor_id
    `));
    const rows = (result.rows || []) as any[];

    const headers = ["ID", "Vendor ID", "Vendor Name", "Period", "Avg LQA Score", "Total Reports", "Pass Count", "Fail Count", "Dispute Count", "Accepted Disputes", "Final QS"];
    const csv = [
      headers.join(","),
      ...rows.map(r => [r.id, r.vendor_id, `"${(r.vendor_name || "").replace(/"/g, '""')}"`, r.period, r.avg_lqa_score || "", r.total_reports, r.pass_count, r.fail_count, r.dispute_count, r.accepted_disputes, r.final_qs || ""].join(","))
    ].join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=vendor-scores.csv");
    res.send(csv);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Failed to export vendor scores", e) });
  }
});

// Quality summary
router.get("/summary", requireAuth, async (req: Request, res: Response) => {
  try {
    const lqaSummary = await db.execute(sql.raw(`
      SELECT COUNT(*) as total, ROUND(AVG(total_score)::numeric, 2) as avg_score,
        COUNT(*) FILTER (WHERE pass_fail = 'pass') as pass_count,
        COUNT(*) FILTER (WHERE pass_fail = 'fail') as fail_count
      FROM lqa_reports WHERE status IN ('submitted', 'resolved')
    `));
    const rcaSummary = await db.execute(sql.raw(`
      SELECT COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'open') as open_count,
        COUNT(*) FILTER (WHERE status = 'closed') as closed_count
      FROM rca_reports
    `));
    const disputeSummary = await db.execute(sql.raw(`
      SELECT COUNT(*) as total,
        COUNT(*) FILTER (WHERE resolution = 'open') as open_count,
        COUNT(*) FILTER (WHERE resolution != 'open') as resolved_count
      FROM lqa_disputes
    `));
    const alertSummary = await db.execute(sql.raw(`
      SELECT COUNT(*) as total,
        COUNT(*) FILTER (WHERE acknowledged = false) as unacknowledged
      FROM quality_alerts
    `));
    const feedbackSummary = await db.execute(sql.raw(`
      SELECT COUNT(*) as total, ROUND(AVG(overall_rating)::numeric, 2) as avg_rating
      FROM customer_feedback
    `));

    res.json({
      lqa: (lqaSummary.rows as any[])[0] || {},
      rca: (rcaSummary.rows as any[])[0] || {},
      disputes: (disputeSummary.rows as any[])[0] || {},
      alerts: (alertSummary.rows as any[])[0] || {},
      feedback: (feedbackSummary.rows as any[])[0] || {},
    });
  } catch (e: any) {
    res.status(500).json({ error: safeError("Quality summary failed", e) });
  }
});

// ============================================
// DOCUMENT COMPLIANCE (existing)
// ============================================

router.get("/compliance", requireAuth, async (req: Request, res: Response) => {
  try {
    const docs = await db.select().from(vendorDocuments).where(eq(vendorDocuments.isActive, true));
    const sigs = await db.select().from(vendorDocumentSignatures);
    const allVendors = await db.select({ id: vendors.id, fullName: vendors.fullName, status: vendors.status }).from(vendors).where(sql`${vendors.status} IN ('Approved', 'approved', 'New Application')`);
    const totalVendors = allVendors.length;

    const documents = docs.map(doc => {
      const docSigs = sigs.filter(s => s.documentId === doc.id);
      const signedCount = docSigs.filter(s => s.status === "signed").length;
      return {
        ...doc,
        signedCount,
        totalVendors,
        compliancePercent: totalVendors > 0 ? Math.round((signedCount / totalVendors) * 100) : 0,
      };
    });

    const overallSigned = sigs.filter(s => s.status === "signed").length;
    const totalRequired = docs.length * totalVendors;
    const overallCompliance = totalRequired > 0 ? Math.round((overallSigned / totalRequired) * 100) : 0;

    res.json({ documents, overallCompliance, totalVendors, signatures: sigs });
  } catch (e: any) {
    res.status(500).json({ error: safeError("Compliance fetch failed", e) });
  }
});

router.post("/compliance/documents", requireAuth, async (req: Request, res: Response) => {
  try {
    const { title, docType, description, requiresSignature, requiredForApproval } = req.body;
    const [doc] = await db.insert(vendorDocuments).values({ title, docType, description, requiresSignature, requiredForApproval }).returning();
    res.json(doc);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Document create failed", e) });
  }
});

router.post("/compliance/signatures", requireAuth, async (req: Request, res: Response) => {
  try {
    const { documentId, vendorId, status } = req.body;
    const [sig] = await db.insert(vendorDocumentSignatures).values({
      documentId, vendorId, status: status || "signed", signedDate: new Date(),
    }).onConflictDoUpdate({
      target: [vendorDocumentSignatures.documentId, vendorDocumentSignatures.vendorId],
      set: { status: status || "signed", signedDate: new Date() },
    }).returning();
    res.json(sig);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Signature update failed", e) });
  }
});

export default router;

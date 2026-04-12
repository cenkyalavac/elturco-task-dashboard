/**
 * Quality Router — handles quality reports, analytics, and document compliance.
 * Extracted from the monolithic routes.ts.
 *
 * Routes:
 *   GET    /quality-reports
 *   POST   /quality-reports
 *   PATCH  /quality-reports/:id
 *   POST   /quality-reports/:id/submit
 *   POST   /quality-reports/:id/dispute
 *   GET    /analytics/quality
 *   GET    /compliance
 *   POST   /compliance/documents
 *   POST   /compliance/signatures
 */
import { Router, Request, Response } from "express";
import { z } from "zod";
import { eq, and, sql, desc } from "drizzle-orm";
import { requireAuth, requireRole, validate, param, safeError, logAudit, getClientIp } from "./shared";
import { storage, db } from "../storage";
import { qualityReports, vendors, vendorDocuments, vendorDocumentSignatures } from "@shared/schema";

const router = Router();

// ============================================
// ZOD SCHEMA
// ============================================
const createQualityReportSchema = z.object({
  vendorId: z.number().int().positive(),
  reportType: z.enum(["LQA", "QS", "Random_QA"]),
}).passthrough();

// ============================================
// HELPER
// ============================================
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

    // Combined score: if both exist, weighted average; otherwise use what's available
    let combined: number | null = null;
    if (avgQs != null && avgLqa != null) {
      // QS is 1-5 scale, LQA is 0-100; normalize LQA to 5-point scale
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
// QUALITY REPORTS CRUD
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

// Submit quality report for translator review
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
      reviewDeadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
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

// Dispute quality report (vendor/translator action)
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
// QUALITY ANALYTICS
// ============================================

router.get("/analytics/quality", requireAuth, async (req: Request, res: Response) => {
  try {
    const reports = await db.select().from(qualityReports).orderBy(desc(qualityReports.id));
    const totalReports = reports.length;
    const qsScores = reports.filter(r => r.qsScore).map(r => parseFloat(r.qsScore!));
    const lqaScores = reports.filter(r => r.lqaScore).map(r => parseFloat(r.lqaScore!));
    const avgQs = qsScores.length > 0 ? qsScores.reduce((a, b) => a + b, 0) / qsScores.length : 0;
    const avgLqa = lqaScores.length > 0 ? lqaScores.reduce((a, b) => a + b, 0) / lqaScores.length : 0;

    // Flagged vendors (combined < 70)
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

    // Quality trend by month
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

    // Top performers
    const topPerformersRaw = Array.from(vendorScores.entries()).map(([vendorId, vs]) => {
      const avgL = vs.lqaCount > 0 ? vs.lqaSum / vs.lqaCount : 0;
      const avgQ = vs.qsCount > 0 ? (vs.qsSum / vs.qsCount) * 20 : 0;
      const combined = vs.lqaCount > 0 && vs.qsCount > 0 ? (avgL * 4 + avgQ) / 5 : (avgL || avgQ);
      return { vendorId, avgLqa: avgL, avgQs: vs.qsCount > 0 ? vs.qsSum / vs.qsCount : 0, combined, reviewCount: vs.lqaCount + vs.qsCount };
    }).sort((a, b) => b.combined - a.combined).slice(0, 20);
    // Enrich with vendor names
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

    // Per-account breakdown
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
// DOCUMENT COMPLIANCE
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

// Document CRUD
router.post("/compliance/documents", requireAuth, async (req: Request, res: Response) => {
  try {
    const { title, docType, description, requiresSignature, requiredForApproval } = req.body;
    const [doc] = await db.insert(vendorDocuments).values({ title, docType, description, requiresSignature, requiredForApproval }).returning();
    res.json(doc);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Document create failed", e) });
  }
});

// Sign document for vendor
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

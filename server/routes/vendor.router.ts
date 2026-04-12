/**
 * Vendor domain router — handles all vendor CRUD, import, sub-resources
 * (notes, language pairs, rate cards, documents, performance, scorecard,
 * competencies, stage, CAT discounts, availability, value index), smart-match,
 * and CSV export routes.
 *
 * Extracted from the monolithic routes.ts.
 */
import { Router, Request, Response } from "express";
import multer from "multer";
import { z } from "zod";
import { eq, and, sql, desc, asc } from "drizzle-orm";
import { storage, db } from "../storage";
import {
  vendors,
  vendorLanguagePairs,
  vendorRateCards,
  vendorDocuments,
  vendorDocumentSignatures,
  vendorAvailability,
  vendorFiles,
  qualityReports,
} from "@shared/schema";
import {
  requireAuth,
  requireRole,
  validate,
  param,
  safeError,
  logAudit,
  getClientIp,
  maskCredentials,
  getCached,
  setCache,
} from "./shared";

const router = Router();

// ============================================
// ZOD SCHEMAS
// ============================================
const createVendorSchema = z.object({
  fullName: z.string().min(1).max(200),
  email: z.string().email().max(255),
  resourceCode: z.string().max(50).optional(),
  phone: z.string().max(50).optional(),
  status: z.string().max(50).optional(),
  resourceType: z.string().max(50).optional(),
  nativeLanguage: z.string().max(50).optional(),
  currency: z.string().max(3).optional(),
}).passthrough(); // Allow additional vendor fields

const createVendorNoteSchema = z.object({
  content: z.string().min(1).max(10000),
  noteType: z.enum(["info", "warning", "note"]).optional(),
  visibility: z.enum(["team", "private"]).optional(),
});

const createRateCardSchema = z.object({
  rateValue: z.any(),
  sourceLanguage: z.string().max(10).optional().nullable(),
  targetLanguage: z.string().max(10).optional().nullable(),
  serviceType: z.string().max(100).optional().nullable(),
  rateType: z.string().max(50).optional().nullable(),
  currency: z.string().max(3).optional(),
});

// ============================================
// MULTER INSTANCES
// ============================================
const csvUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const docUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ============================================
// CSV PARSING HELPERS
// ============================================
function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.trim().replace(/^"(.*)"$/, "$1"));
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values: string[] = [];
    let current = "";
    let inQuotes = false;
    for (const ch of lines[i]) {
      if (ch === '"') { inQuotes = !inQuotes; }
      else if (ch === "," && !inQuotes) { values.push(current.trim()); current = ""; }
      else { current += ch; }
    }
    values.push(current.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { if (values[idx] !== undefined) row[h] = values[idx]; });
    rows.push(row);
  }
  return rows;
}

function generateResourceCode(name: string, index: number): string {
  const prefix = name.replace(/[^a-zA-Z]/g, "").substring(0, 3).toUpperCase();
  return `${prefix || "VND"}${String(index).padStart(4, "0")}`;
}

// ============================================
// VENDORS CRUD
// ============================================
router.get("/vendors", requireAuth, async (req: Request, res: Response) => {
  try {
    const { status, search, page, limit } = req.query;
    // Look up user role for PM-scoped filtering
    const pmUserId = (req as any).pmUserId;
    const user = await storage.getUserById(pmUserId) || (await storage.getAllPmUsers()).find(u => u.id === pmUserId);
    const userRole = (user as any)?.role || "pm";
    // PM and PC users only see approved vendors
    let effectiveStatus = status as string;
    if (userRole === "pm" || userRole === "pc") {
      effectiveStatus = "Approved";
    }
    const filters = {
      status: effectiveStatus,
      search: search as string,
      page: page ? +page : 1,
      limit: limit ? +limit : 50,
    };
    const [vendorList, total] = await Promise.all([
      storage.getVendors(filters),
      storage.getVendorCount(filters),
    ]);
    res.json({ data: vendorList, total, page: filters.page, limit: filters.limit });
  } catch (e: any) {
    res.status(500).json({ error: safeError("Internal server error", e) });
  }
});

router.get("/vendors/pipeline", requireAuth, async (_req: Request, res: Response) => {
  try {
    const pipeline = await storage.getVendorsPipeline();
    res.json(pipeline);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Internal server error", e) });
  }
});

// Smart vendor match (must be before /vendors/:id to avoid route conflict)
router.get("/vendors/smart-match", requireAuth, async (req: Request, res: Response) => {
  try {
    const { source_language, target_language, service_type, specialization } = req.query;
    const allVendors = await db.select().from(vendors).where(sql`${vendors.status} IN ('Approved', 'approved', 'New Application')`);
    const allPairs = await db.select().from(vendorLanguagePairs);
    const allRates = await db.select().from(vendorRateCards);

    // Build vendor language pair map
    const pairMap = new Map<number, Array<{source: string; target: string}>>();
    for (const p of allPairs) {
      if (!pairMap.has(p.vendorId)) pairMap.set(p.vendorId, []);
      pairMap.get(p.vendorId)!.push({ source: p.sourceLanguage, target: p.targetLanguage });
    }

    // Build vendor rate map
    const rateMap = new Map<number, number[]>();
    for (const r of allRates) {
      if (!rateMap.has(r.vendorId)) rateMap.set(r.vendorId, []);
      rateMap.get(r.vendorId)!.push(parseFloat(r.rateValue));
    }

    // Calculate average rate across all vendors
    const allRateValues = allRates.map(r => parseFloat(r.rateValue)).filter(v => v > 0);
    const avgRate = allRateValues.length > 0 ? allRateValues.reduce((a, b) => a + b, 0) / allRateValues.length : 0.08;

    const scored = allVendors.map(v => {
      let score = 0;
      const breakdown: Record<string, number> = {};
      const pairs = pairMap.get(v.id) || [];
      const rates = rateMap.get(v.id) || [];
      const vendorAvgRate = rates.length > 0 ? rates.reduce((a, b) => a + b, 0) / rates.length : 0;

      // Language pair match (40%)
      const srcLang = (source_language as string || "").toUpperCase();
      const tgtLang = (target_language as string || "").toUpperCase();
      const langMatch = pairs.some(p => p.source.toUpperCase() === srcLang && p.target.toUpperCase() === tgtLang);
      breakdown.languagePair = langMatch ? 40 : 0;
      score += breakdown.languagePair;

      // Quality score (25%)
      const qualScore = parseFloat(v.combinedQualityScore || "0");
      breakdown.quality = Math.round((qualScore / 100) * 25);
      score += breakdown.quality;

      // Rate competitiveness (15%)
      if (vendorAvgRate > 0 && avgRate > 0) {
        const rateRatio = avgRate / vendorAvgRate;
        breakdown.rate = Math.round(Math.min(rateRatio, 1.5) / 1.5 * 15);
      } else {
        breakdown.rate = 8;
      }
      score += breakdown.rate;

      // Availability (10%)
      const isAvailable = v.status === "Approved" || v.status === "approved";
      breakdown.availability = isAvailable ? 10 : 0;
      score += breakdown.availability;

      // Value index (10%)
      const vi = parseFloat(v.valueIndex || "0");
      breakdown.valueIndex = Math.round(Math.min(vi / 2, 1) * 10);
      score += breakdown.valueIndex;

      // Service type bonus
      const svcType = (service_type as string || "").toLowerCase();
      if (svcType && v.serviceTypes?.some(s => s.toLowerCase() === svcType)) {
        score += 5;
        breakdown.serviceType = 5;
      }

      // Specialization bonus
      const spec = (specialization as string || "").toLowerCase();
      if (spec && (v.translationSpecializations?.some(s => s.toLowerCase().includes(spec)) || v.specializations?.some(s => s.toLowerCase().includes(spec)))) {
        score += 5;
        breakdown.specialization = 5;
      }

      return {
        id: v.id,
        fullName: v.fullName,
        email: v.email,
        status: v.status,
        tier: v.tier,
        nativeLanguage: v.nativeLanguage,
        combinedQualityScore: v.combinedQualityScore,
        valueIndex: v.valueIndex,
        averageRate: vendorAvgRate.toFixed(4),
        languagePairs: pairs,
        serviceTypes: v.serviceTypes,
        specializations: v.translationSpecializations || v.specializations,
        score,
        breakdown,
      };
    });

    // Sort by score descending, return top 30
    scored.sort((a, b) => b.score - a.score);
    res.json({ vendors: scored.slice(0, 30) });
  } catch (e: any) {
    res.status(500).json({ error: safeError("Smart match failed", e) });
  }
});

router.get("/vendors/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const vendor = await storage.getVendor(+param(req, "id"));
    if (!vendor) return res.status(404).json({ error: "Vendor not found" });
    res.json(vendor);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Internal server error", e) });
  }
});

router.post("/vendors", requireAuth, async (req: Request, res: Response) => {
  try {
    const body = validate(createVendorSchema, req.body, res);
    if (!body) return;
    // Auto-generate resource code if not provided
    if (!body.resourceCode) {
      const nameParts = (body.fullName || "").trim().split(/\s+/);
      const initials = nameParts.map((p: string) => p.charAt(0).toUpperCase()).join("").slice(0, 3);
      const allVendors = await storage.getVendors();
      const existingCodes = (allVendors as any[]).map((v: any) => v.resourceCode).filter(Boolean);
      let seq = 1;
      let code = `${initials}${String(seq).padStart(3, "0")}`;
      while (existingCodes.includes(code)) {
        seq++;
        code = `${initials}${String(seq).padStart(3, "0")}`;
      }
      body.resourceCode = code;
    }
    const vendor = await storage.createVendor(body);
    await logAudit((req as any).pmUserId, "create", "vendor", vendor.id, null, vendor, getClientIp(req));
    res.json(vendor);
  } catch (e: any) {
    console.error("Create vendor error:", e);
    res.status(500).json({ error: "Failed to create vendor" });
  }
});

router.patch("/vendors/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const id = +param(req, "id");
    const oldVendor = await storage.getVendor(id);
    const vendor = await storage.updateVendor(id, req.body);
    await logAudit((req as any).pmUserId, "update", "vendor", id, oldVendor, vendor, getClientIp(req));
    res.json(vendor);
  } catch (e: any) {
    console.error("Update vendor error:", e);
    res.status(500).json({ error: "Failed to update vendor" });
  }
});

router.delete("/vendors/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const id = +param(req, "id");
    const oldVendor = await storage.getVendor(id);
    await storage.deleteVendor(id);
    await logAudit((req as any).pmUserId, "delete", "vendor", id, oldVendor, null, getClientIp(req));
    res.json({ success: true });
  } catch (e: any) {
    console.error("Delete vendor error:", e);
    res.status(500).json({ error: "Failed to delete vendor" });
  }
});

// ============================================
// VENDOR IMPORT
// ============================================
router.post("/vendors/import", requireAuth, requireRole("vm", "gm", "admin"), csvUpload.single("file"), async (req: Request, res: Response) => {
  try {
    let vendorRows: Record<string, any>[];

    // Check if it's a file upload (CSV)
    const file = (req as any).file as Express.Multer.File | undefined;
    if (file) {
      const csvText = file.buffer.toString("utf-8");
      const parsed = parseCSV(csvText);
      if (parsed.length === 0) {
        return res.status(400).json({ error: "CSV file is empty or has no data rows" });
      }
      // Map CSV columns to vendor fields
      const fieldMap: Record<string, string> = {
        name: "fullName", full_name: "fullName", fullname: "fullName",
        email: "email", contact_person: "contactPerson", contactperson: "contactPerson",
        phone: "phone", country: "location", location: "location",
        source_languages: "sourceLanguages", sourcelanguages: "sourceLanguages",
        target_languages: "targetLanguages", targetlanguages: "targetLanguages",
        service_types: "serviceTypes", servicetypes: "serviceTypes",
        specializations: "specializations", status: "status", notes: "notes",
        resource_code: "resourceCode", resourcecode: "resourceCode",
        native_language: "nativeLanguage", nativelanguage: "nativeLanguage",
        currency: "currency", resource_type: "resourceType", resourcetype: "resourceType",
      };
      vendorRows = parsed.map((row) => {
        const mapped: Record<string, any> = {};
        for (const [csvKey, value] of Object.entries(row)) {
          const normalizedKey = csvKey.toLowerCase().replace(/[\s-]/g, "_");
          const mappedKey = fieldMap[normalizedKey] || normalizedKey;
          if (value) mapped[mappedKey] = value;
        }
        // Convert comma-separated arrays
        for (const arrField of ["sourceLanguages", "targetLanguages", "serviceTypes", "specializations"]) {
          if (typeof mapped[arrField] === "string") {
            mapped[arrField] = mapped[arrField].split(";").map((s: string) => s.trim()).filter(Boolean);
          }
        }
        return mapped;
      });
    } else if (Array.isArray(req.body)) {
      vendorRows = req.body;
    } else {
      return res.status(400).json({ error: "Provide a CSV file upload or a JSON array of vendor objects" });
    }

    // Get existing vendor count for resource code generation
    const existingCount = await storage.getVendorCount();
    const imported: number[] = [];
    const errors: { index: number; error: string }[] = [];

    for (let i = 0; i < vendorRows.length; i++) {
      const row = vendorRows[i];
      // Ensure required fields
      if (!row.fullName && !row.full_name && !row.name) {
        errors.push({ index: i, error: "Missing required field: name/fullName" });
        continue;
      }
      if (!row.email) {
        errors.push({ index: i, error: "Missing required field: email" });
        continue;
      }
      // Map alternate names
      if (!row.fullName && row.full_name) row.fullName = row.full_name;
      if (!row.fullName && row.name) row.fullName = row.name;

      // Auto-generate resource code if missing
      if (!row.resourceCode) {
        row.resourceCode = generateResourceCode(row.fullName, existingCount + imported.length + 1);
      }

      const result = createVendorSchema.safeParse(row);
      if (!result.success) {
        errors.push({ index: i, error: result.error.errors.map(e => e.message).join(", ") });
        continue;
      }
      try {
        const vendor = await storage.createVendor(result.data);
        imported.push(vendor.id);
        await logAudit((req as any).pmUserId, "import", "vendor", vendor.id, null, vendor, getClientIp(req));
      } catch (e: any) {
        errors.push({ index: i, error: e?.message || "Failed to insert vendor" });
      }
    }
    res.json({ imported: imported.length, skipped: errors.length, errors });
  } catch (e: any) {
    console.error("Vendor import error:", e);
    res.status(500).json({ error: "Failed to import vendors" });
  }
});

// ============================================
// VENDOR SUB-RESOURCES
// ============================================

// Quality reports
router.get("/vendors/:id/quality-reports", requireAuth, async (req: Request, res: Response) => {
  const reports = await storage.getQualityReports(+param(req, "id"));
  res.json(reports);
});

// Activities
router.get("/vendors/:id/activities", requireAuth, async (req: Request, res: Response) => {
  const activities = await storage.getVendorActivities(+param(req, "id"));
  res.json(activities);
});

// Notes
router.get("/vendors/:id/notes", requireAuth, async (req: Request, res: Response) => {
  const notes = await storage.getVendorNotes(+param(req, "id"));
  res.json(notes);
});

router.post("/vendors/:id/notes", requireAuth, async (req: Request, res: Response) => {
  try {
    const body = validate(createVendorNoteSchema, req.body, res);
    if (!body) return;
    const pmUserId = (req as any).pmUserId;
    const note = await storage.createVendorNote({
      vendorId: +param(req, "id"),
      content: body.content,
      noteType: body.noteType || "note",
      visibility: body.visibility || "team",
      createdBy: pmUserId,
    });
    res.json(note);
  } catch (e: any) {
    console.error("Create vendor note error:", e);
    res.status(500).json({ error: "Failed to create vendor note" });
  }
});

router.delete("/vendors/:vendorId/notes/:noteId", requireAuth, async (req: Request, res: Response) => {
  try {
    await storage.deleteVendorNote(+param(req, "noteId"));
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: "Failed to delete vendor note" });
  }
});

// Language pairs
router.get("/vendors/:id/language-pairs", requireAuth, async (req: Request, res: Response) => {
  const pairs = await storage.getVendorLanguagePairs(+param(req, "id"));
  res.json(pairs);
});

router.post("/vendors/:id/language-pairs", requireAuth, async (req: Request, res: Response) => {
  try {
    const vendorId = +param(req, "id");
    const pair = await storage.addVendorLanguagePair({ vendorId, ...req.body });
    res.status(201).json(pair);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Failed to add language pair", e) });
  }
});

router.delete("/vendors/:id/language-pairs/:pairId", requireAuth, async (req: Request, res: Response) => {
  try {
    await storage.deleteVendorLanguagePair(+param(req, "pairId"));
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: safeError("Failed to delete language pair", e) });
  }
});

// Rate cards — read
router.get("/vendors/:id/rate-cards", requireAuth, async (req: Request, res: Response) => {
  const cards = await storage.getVendorRateCards(+param(req, "id"));
  res.json(cards);
});

// Rate cards — CRUD
router.post("/vendors/:id/rate-cards", requireAuth, async (req: Request, res: Response) => {
  try {
    const vendorId = +param(req, "id");
    const body = validate(createRateCardSchema, req.body, res);
    if (!body) return;
    const rc = await storage.createVendorRateCard({ ...body, vendorId });
    await logAudit((req as any).pmUserId, "create", "vendor_rate_card", rc.id, null, rc, getClientIp(req));
    res.status(201).json(rc);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Failed to create rate card", e) });
  }
});

router.patch("/vendors/:id/rate-cards/:rcId", requireAuth, async (req: Request, res: Response) => {
  try {
    const rcId = +param(req, "rcId");
    const rc = await storage.updateVendorRateCard(rcId, req.body);
    res.json(rc);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Failed to update rate card", e) });
  }
});

router.delete("/vendors/:id/rate-cards/:rcId", requireAuth, async (req: Request, res: Response) => {
  try {
    const rcId = +param(req, "rcId");
    await storage.deleteVendorRateCard(rcId);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: safeError("Failed to delete rate card", e) });
  }
});

// Documents
router.get("/vendors/:id/documents", requireAuth, async (req: Request, res: Response) => {
  try {
    const docs = await storage.getVendorFileUploads(+param(req, "id"));
    res.json(docs);
  } catch (e: any) {
    console.error("Get vendor documents error:", e);
    res.status(500).json({ error: "Failed to get vendor documents" });
  }
});

router.post("/vendors/:id/documents", requireAuth, docUpload.single("file"), async (req: Request, res: Response) => {
  try {
    const vendorId = +param(req, "id");
    const file = (req as any).file;
    if (!file) {
      return res.status(400).json({ error: "No file uploaded" });
    }
    const docType = req.body.docType || "Other";
    // In production, upload to S3/GCS. Here we store a data URL.
    const fileUrl = `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;
    const doc = await storage.createVendorFileUpload({
      vendorId,
      fileName: file.originalname,
      fileUrl,
      docType,
      fileSize: file.size,
      mimeType: file.mimetype,
    });
    res.json(doc);
  } catch (e: any) {
    console.error("Upload vendor document error:", e);
    res.status(500).json({ error: "Failed to upload document" });
  }
});

router.delete("/vendors/:id/documents/:docId", requireAuth, async (req: Request, res: Response) => {
  try {
    await storage.deleteVendorFileUpload(+param(req, "docId"));
    res.json({ success: true });
  } catch (e: any) {
    console.error("Delete vendor document error:", e);
    res.status(500).json({ error: "Failed to delete document" });
  }
});

// Performance
router.get("/vendors/:id/performance", requireAuth, async (req: Request, res: Response) => {
  try {
    const vendorId = +param(req, "id");
    const reports = await storage.getQualityReports(vendorId);

    const qsTrend: { date: string; score: number }[] = [];
    const lqaTrend: { date: string; score: number }[] = [];
    let totalJobs = 0;
    let onTimeCount = 0;
    let totalDeliveries = 0;

    for (const r of reports) {
      const date = r.reportDate ? new Date(r.reportDate).toISOString().split("T")[0] : null;
      if (r.qsScore != null && date) {
        qsTrend.push({ date, score: Number(r.qsScore) });
      }
      if (r.lqaScore != null && date) {
        lqaTrend.push({ date, score: Number(r.lqaScore) });
      }
      const st = (r.status || "").toLowerCase();
      if (st === "completed" || st === "finalized" || st === "late") {
        totalDeliveries++;
        if (st !== "late") onTimeCount++;
      }
      totalJobs++;
    }

    const onTimeRate = totalDeliveries > 0 ? Math.round((onTimeCount / totalDeliveries) * 100) : null;

    res.json({
      qsTrend: qsTrend.sort((a, b) => a.date.localeCompare(b.date)),
      lqaTrend: lqaTrend.sort((a, b) => a.date.localeCompare(b.date)),
      onTimeRate,
      totalWordCount: 0,
      totalJobs,
      totalEarnings: 0,
    });
  } catch (e: any) {
    console.error("Get vendor performance error:", e);
    res.status(500).json({ error: "Failed to get vendor performance" });
  }
});

// ============================================
// VENDOR SCORECARD
// ============================================
router.get("/vendors/:id/scorecard", requireAuth, async (req: Request, res: Response) => {
  try {
    const vendorId = +param(req, "id");
    const reports = await db.select().from(qualityReports).where(eq(qualityReports.vendorId, vendorId)).orderBy(desc(qualityReports.id));
    const qsScores = reports.filter(r => r.qsScore).map(r => parseFloat(r.qsScore!));
    const lqaScores = reports.filter(r => r.lqaScore).map(r => parseFloat(r.lqaScore!));
    const avgQs = qsScores.length > 0 ? qsScores.reduce((a, b) => a + b, 0) / qsScores.length : 0;
    const avgLqa = lqaScores.length > 0 ? lqaScores.reduce((a, b) => a + b, 0) / lqaScores.length : 0;
    const qsScaled = avgQs * 20;
    const combined = lqaScores.length > 0 && qsScores.length > 0 ? (avgLqa * 4 + qsScaled * 1) / 5 : (avgLqa || qsScaled);

    // Trend: last 3 vs previous 3
    const last3 = reports.slice(0, 3);
    const prev3 = reports.slice(3, 6);
    const last3Avg = last3.length > 0 ? last3.reduce((s, r) => s + parseFloat(r.lqaScore || r.qsScore || "0"), 0) / last3.length : 0;
    const prev3Avg = prev3.length > 0 ? prev3.reduce((s, r) => s + parseFloat(r.lqaScore || r.qsScore || "0"), 0) / prev3.length : 0;
    const trend = last3Avg - prev3Avg;

    // Per-account breakdown
    const accountMap = new Map<string, { count: number; qsSum: number; lqaSum: number; qsCount: number; lqaCount: number }>();
    for (const r of reports) {
      const acct = r.clientAccount || "Unknown";
      if (!accountMap.has(acct)) accountMap.set(acct, { count: 0, qsSum: 0, lqaSum: 0, qsCount: 0, lqaCount: 0 });
      const a = accountMap.get(acct)!;
      a.count++;
      if (r.qsScore) { a.qsSum += parseFloat(r.qsScore); a.qsCount++; }
      if (r.lqaScore) { a.lqaSum += parseFloat(r.lqaScore); a.lqaCount++; }
    }
    const accountBreakdown = Array.from(accountMap.entries()).map(([account, d]) => ({
      account, count: d.count,
      avgQs: d.qsCount > 0 ? d.qsSum / d.qsCount : null,
      avgLqa: d.lqaCount > 0 ? d.lqaSum / d.lqaCount : null,
    }));

    res.json({ avgQs, avgLqa, combined, totalReviews: reports.length, trend, accountBreakdown, recentReports: reports.slice(0, 10) });
  } catch (e: any) {
    res.status(500).json({ error: safeError("Scorecard fetch failed", e) });
  }
});

// ============================================
// VALUE INDEX RECALCULATION
// ============================================
router.post("/vendors/recalculate-value-index", requireAuth, async (req: Request, res: Response) => {
  try {
    const allVendors = await db.select().from(vendors);
    const allRates = await db.select().from(vendorRateCards);
    const rateMap = new Map<number, number[]>();
    for (const r of allRates) {
      if (!rateMap.has(r.vendorId)) rateMap.set(r.vendorId, []);
      rateMap.get(r.vendorId)!.push(parseFloat(r.rateValue));
    }
    let updated = 0;
    for (const v of allVendors) {
      const qualScore = parseFloat(v.combinedQualityScore || "0");
      const rates = rateMap.get(v.id) || [];
      const avgRate = rates.length > 0 ? rates.reduce((a, b) => a + b, 0) / rates.length : 0;
      const valueIndex = avgRate > 0 ? (qualScore * qualScore) / (avgRate * 100) : 0;
      await db.update(vendors).set({ valueIndex: valueIndex.toFixed(4) }).where(eq(vendors.id, v.id));
      updated++;
    }
    res.json({ updated });
  } catch (e: any) {
    res.status(500).json({ error: safeError("Value index recalculation failed", e) });
  }
});

// ============================================
// VENDOR STAGE UPDATE (Pipeline)
// ============================================
router.patch("/vendors/:id/stage", requireAuth, async (req: Request, res: Response) => {
  try {
    const vendorId = +param(req, "id");
    const { status: newStatus } = req.body;
    if (!newStatus) return res.status(400).json({ error: "Status required" });
    await db.update(vendors).set({ status: newStatus, stageChangedDate: new Date(), updatedAt: new Date() }).where(eq(vendors.id, vendorId));
    await logAudit((req as any).pmUserId, "stage_change", "vendor", vendorId, null, { status: newStatus }, getClientIp(req));
    const updated = await storage.getVendor(vendorId);
    res.json(updated);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Stage update failed", e) });
  }
});

// ============================================
// VENDOR COMPETENCIES UPDATE
// ============================================
router.patch("/vendors/:id/competencies", requireAuth, async (req: Request, res: Response) => {
  try {
    const vendorId = +param(req, "id");
    const { serviceTypes, translationSpecializations, languagePairs } = req.body;
    const updates: any = { updatedAt: new Date() };
    if (serviceTypes !== undefined) updates.serviceTypes = serviceTypes;
    if (translationSpecializations !== undefined) updates.translationSpecializations = translationSpecializations;
    await db.update(vendors).set(updates).where(eq(vendors.id, vendorId));
    // Update language pairs if provided
    if (languagePairs && Array.isArray(languagePairs)) {
      await db.delete(vendorLanguagePairs).where(eq(vendorLanguagePairs.vendorId, vendorId));
      for (const lp of languagePairs) {
        if (lp.sourceLanguage && lp.targetLanguage) {
          await db.insert(vendorLanguagePairs).values({ vendorId, sourceLanguage: lp.sourceLanguage, targetLanguage: lp.targetLanguage, isPrimary: lp.isPrimary || false }).onConflictDoNothing();
        }
      }
    }
    const updated = await storage.getVendor(vendorId);
    res.json(updated);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Competencies update failed", e) });
  }
});

// ============================================
// VENDOR CAT DISCOUNT GRID
// ============================================
router.get("/vendors/:id/cat-discounts", requireAuth, async (req: Request, res: Response) => {
  const vendor = await storage.getVendor(+param(req, "id"));
  if (!vendor) return res.status(404).json({ error: "Vendor not found" });
  res.json({ catDiscounts: vendor.catDiscounts || null });
});

router.patch("/vendors/:id/cat-discounts", requireAuth, async (req: Request, res: Response) => {
  try {
    const vendorId = +param(req, "id");
    const { catDiscounts } = req.body;
    await db.update(vendors).set({ catDiscounts, updatedAt: new Date() }).where(eq(vendors.id, vendorId));
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: safeError("CAT discount update failed", e) });
  }
});

// ============================================
// VENDOR AVAILABILITY CALENDAR
// ============================================
router.get("/vendors/:id/availability", requireAuth, async (req: Request, res: Response) => {
  try {
    const vendorId = +param(req, "id");
    const { month, year } = req.query;
    let conditions: any[] = [eq(vendorAvailability.vendorId, vendorId)];
    if (month && year) {
      const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
      const endMonth = +month === 12 ? 1 : +month + 1;
      const endYear = +month === 12 ? +year + 1 : +year;
      const endDate = `${endYear}-${String(endMonth).padStart(2, "0")}-01`;
      conditions.push(sql`${vendorAvailability.date} >= ${startDate} AND ${vendorAvailability.date} < ${endDate}`);
    }
    const records = await db.select().from(vendorAvailability).where(and(...conditions)).orderBy(asc(vendorAvailability.date));
    res.json(records);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Availability fetch failed", e) });
  }
});

router.post("/vendors/:id/availability", requireAuth, async (req: Request, res: Response) => {
  try {
    const vendorId = +param(req, "id");
    const { date, status, hoursAvailable, notes } = req.body;
    const [record] = await db.insert(vendorAvailability).values({ vendorId, date, status, hoursAvailable, notes }).onConflictDoUpdate({
      target: [vendorAvailability.vendorId, vendorAvailability.date],
      set: { status, hoursAvailable, notes },
    }).returning();
    res.json(record);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Availability update failed", e) });
  }
});

router.delete("/vendors/:id/availability/:date", requireAuth, async (req: Request, res: Response) => {
  try {
    const vendorId = +param(req, "id");
    const dateStr = param(req, "date");
    await db.delete(vendorAvailability).where(and(eq(vendorAvailability.vendorId, vendorId), eq(vendorAvailability.date, dateStr)));
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: safeError("Availability delete failed", e) });
  }
});

// ============================================
// VENDOR CSV EXPORT
// ============================================
router.get("/export/vendors", requireAuth, async (_req: Request, res: Response) => {
  try {
    const data = await storage.getAllVendorsForExport();
    const rows = data.map((v: any) => ({
      resource_code: v.resourceCode || "",
      full_name: v.fullName || "",
      email: v.email || "",
      phone: v.phone || "",
      status: v.status || "",
      tier: v.tier || "",
      native_language: v.nativeLanguage || "",
      location: v.location || "",
      resource_type: v.resourceType || "",
      currency: v.currency || "",
      availability: v.availability || "",
      combined_quality_score: v.combinedQualityScore || "",
      average_lqa_score: v.averageLqaScore || "",
      average_qs_score: v.averageQsScore || "",
      nda_signed: v.ndaSigned ? "Yes" : "No",
      tested: v.tested ? "Yes" : "No",
      certified: v.certified ? "Yes" : "No",
      service_types: (v.serviceTypes || []).join("; "),
      specializations: (v.specializations || []).join("; "),
      tags: (v.tags || []).join("; "),
    }));
    const headers = Object.keys(rows[0] || {});
    const csv = [headers.join(","), ...rows.map((r: any) => headers.map(h => `"${String(r[h] || "").replace(/"/g, '""')}"`).join(","))].join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=vendors.csv");
    res.send(csv);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Export failed", e) });
  }
});

export default router;

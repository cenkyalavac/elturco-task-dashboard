/**
 * VM (Vendor Manager) domain router — Faz 3
 * Dedicated endpoints for the VM role experience:
 * - Dashboard aggregation
 * - Tinder-style application review
 * - AI application summary
 * - Capacity heat map
 * - Email templates & communication
 * - Onboarding automation
 * - VM analytics
 */
import { Router, Request, Response } from "express";
import { z } from "zod";
import { eq, and, sql, desc, asc, gte, lte, count, inArray } from "drizzle-orm";
import { db } from "../storage";
import {
  vendors,
  vendorLanguagePairs,
  vendorApplications,
  vendorStageHistory,
  vendorActivities,
  vendorFileUploads,
  vendorEmailTemplates,
  vendorEmails,
  vendorOnboardingTasks,
  quizAssignments,
  quizAttempts,
  jobs,
  users,
} from "@shared/schema";
import {
  requireAuth,
  requireRole,
  validate,
  param,
  safeError,
  logAudit,
  getClientIp,
  getCached,
  setCache,
  sendEmail,
  FROM_EMAIL,
  SITE_PUBLIC_URL,
  replaceVars,
} from "./shared";

const router = Router();

// ============================================
// 1. VM DASHBOARD
// ============================================
router.get("/vm/dashboard", requireAuth, requireRole("vm", "operations_manager"), async (req: Request, res: Response) => {
  try {
    const cached = getCached<any>("vm-dashboard", 30_000);
    if (cached) return res.json(cached);

    // Application stats
    const [totalApps] = await db.select({ count: count() }).from(vendorApplications);
    const oneWeekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const [weekApps] = await db.select({ count: count() }).from(vendorApplications)
      .where(gte(vendorApplications.submittedAt, new Date(oneWeekAgo)));
    const [pendingApps] = await db.select({ count: count() }).from(vendorApplications)
      .where(eq(vendorApplications.status, "pending"));

    // Average review time (apps that have been reviewed)
    const reviewTimeResult = await db.execute(sql`
      SELECT AVG(EXTRACT(EPOCH FROM (reviewed_at - submitted_at)) / 3600)::numeric(10,1) as avg_hours
      FROM vendor_applications WHERE reviewed_at IS NOT NULL AND submitted_at IS NOT NULL
    `);
    const avgReviewHours = reviewTimeResult.rows?.[0]?.avg_hours || 0;

    // Pipeline overview - count vendors per stage
    const pipelineResult = await db.execute(sql`
      SELECT status, COUNT(*)::int as count FROM vendors GROUP BY status ORDER BY count DESC
    `);
    const pipeline = pipelineResult.rows || [];

    // Recent activity feed (last 20)
    const recentActivity = await db.select({
      id: vendorStageHistory.id,
      vendorId: vendorStageHistory.vendorId,
      fromStage: vendorStageHistory.fromStage,
      toStage: vendorStageHistory.toStage,
      createdAt: vendorStageHistory.createdAt,
    })
      .from(vendorStageHistory)
      .orderBy(desc(vendorStageHistory.createdAt))
      .limit(20);

    // Enrich activity with vendor names
    const vendorIds = [...new Set(recentActivity.map(a => a.vendorId))];
    let vendorNameMap: Record<number, string> = {};
    if (vendorIds.length > 0) {
      const vendorNames = await db.select({ id: vendors.id, fullName: vendors.fullName })
        .from(vendors)
        .where(inArray(vendors.id, vendorIds));
      vendorNameMap = Object.fromEntries(vendorNames.map(v => [v.id, v.fullName]));
    }

    const activityFeed = recentActivity.map(a => ({
      ...a,
      vendorName: vendorNameMap[a.vendorId] || "Unknown",
    }));

    // Top 5 language pairs by active vendor count (capacity summary)
    const capacitySummary = await db.execute(sql`
      SELECT vlp.source_language, vlp.target_language, COUNT(DISTINCT vlp.vendor_id)::int as supply
      FROM vendor_language_pairs vlp
      JOIN vendors v ON v.id = vlp.vendor_id AND v.status = 'Active'
      GROUP BY vlp.source_language, vlp.target_language
      ORDER BY supply DESC LIMIT 5
    `);

    // Upcoming deadlines: expiring documents (next 30 days)
    const thirtyDaysFromNow = new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0];
    const today = new Date().toISOString().split("T")[0];
    const expiringDocs = await db.execute(sql`
      SELECT vfu.id, vfu.vendor_id, vfu.file_name, vfu.doc_type, vfu.expiry_date, v.full_name as vendor_name
      FROM vendor_file_uploads vfu
      JOIN vendors v ON v.id = vfu.vendor_id
      WHERE vfu.expiry_date IS NOT NULL
        AND vfu.expiry_date >= ${today}
        AND vfu.expiry_date <= ${thirtyDaysFromNow}
      ORDER BY vfu.expiry_date ASC LIMIT 10
    `);

    // Follow-up dates coming up
    const followUps = await db.execute(sql`
      SELECT id, full_name, follow_up_date, follow_up_note
      FROM vendors
      WHERE follow_up_date IS NOT NULL
        AND follow_up_date >= ${today}
        AND follow_up_date <= ${thirtyDaysFromNow}
      ORDER BY follow_up_date ASC LIMIT 10
    `);

    const data = {
      applicationStats: {
        total: totalApps.count,
        thisWeek: weekApps.count,
        pendingReview: pendingApps.count,
        avgReviewHours: Number(avgReviewHours),
      },
      pipeline: pipeline,
      quickActions: [
        { label: "Review Applications", href: "/vm/review-applications", count: pendingApps.count },
        { label: "Assign Quizzes", href: "/quizzes", count: 0 },
        { label: "Expiring Documents", href: "/document-compliance", count: (expiringDocs.rows || []).length },
        { label: "Smart Match", href: "/vendors", count: 0 },
      ],
      activityFeed,
      capacitySummary: capacitySummary.rows || [],
      upcomingDeadlines: {
        expiringDocuments: expiringDocs.rows || [],
        followUps: followUps.rows || [],
      },
    };

    setCache("vm-dashboard", data);
    res.json(data);
  } catch (e) {
    console.error("VM dashboard error:", e);
    res.status(500).json({ error: safeError("Failed to load VM dashboard", e) });
  }
});

// ============================================
// 2. TINDER-STYLE APPLICATION REVIEW
// ============================================

// GET pending applications
router.get("/vm/pending-applications", requireAuth, requireRole("vm", "operations_manager"), async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = (page - 1) * limit;

    const [totalResult] = await db.select({ count: count() }).from(vendorApplications)
      .where(eq(vendorApplications.status, "pending"));

    const applications = await db.select()
      .from(vendorApplications)
      .where(eq(vendorApplications.status, "pending"))
      .orderBy(asc(vendorApplications.submittedAt))
      .limit(limit)
      .offset(offset);

    res.json({
      applications,
      total: totalResult.count,
      page,
      totalPages: Math.ceil(totalResult.count / limit),
    });
  } catch (e) {
    res.status(500).json({ error: safeError("Failed to fetch pending applications", e) });
  }
});

// PATCH review application (approve/reject/skip)
router.patch("/vm/applications/:id/review", requireAuth, requireRole("vm", "operations_manager"), async (req: Request, res: Response) => {
  try {
    const id = parseInt(param(req, "id"));
    const schema = z.object({
      action: z.enum(["approve", "reject", "skip"]),
      notes: z.string().optional(),
    });
    const body = validate(schema, req.body, res);
    if (!body) return;

    const [application] = await db.select().from(vendorApplications).where(eq(vendorApplications.id, id));
    if (!application) return res.status(404).json({ error: "Application not found" });

    const pmUserId = (req as any).pmUserId;

    if (body.action === "skip") {
      return res.json({ message: "Skipped", application });
    }

    if (body.action === "reject") {
      await db.update(vendorApplications).set({
        status: "rejected",
        reviewedBy: pmUserId,
        reviewedAt: new Date(),
        notes: body.notes || application.notes,
      }).where(eq(vendorApplications.id, id));

      await logAudit(pmUserId, "application_rejected", "vendor_application", id, { status: "pending" }, { status: "rejected" }, getClientIp(req));

      return res.json({ message: "Application rejected", action: "reject" });
    }

    // Approve: create vendor record from application data
    if (body.action === "approve") {
      await db.update(vendorApplications).set({
        status: "approved",
        reviewedBy: pmUserId,
        reviewedAt: new Date(),
        notes: body.notes || application.notes,
      }).where(eq(vendorApplications.id, id));

      // Create vendor from application
      const [vendor] = await db.insert(vendors).values({
        fullName: application.fullName,
        email: application.email,
        phone: application.phone || undefined,
        location: application.location || undefined,
        website: application.website || undefined,
        nativeLanguage: application.nativeLanguage || undefined,
        serviceTypes: application.serviceTypes || [],
        specializations: application.specializations || [],
        experienceYears: application.experienceYears || undefined,
        education: application.education || undefined,
        certifications: application.certifications || [],
        cvFileUrl: application.cvFileUrl || undefined,
        currency: application.currency || "EUR",
        minimumFee: application.minimumFee || undefined,
        status: "CV Review",
      }).returning();

      // Link application to vendor
      await db.update(vendorApplications).set({ vendorId: vendor.id }).where(eq(vendorApplications.id, id));

      // Insert language pairs
      const langPairs = (application.languagePairs as any[]) || [];
      if (langPairs.length > 0) {
        await db.insert(vendorLanguagePairs).values(
          langPairs.map((lp: any) => ({
            vendorId: vendor.id,
            sourceLanguage: lp.source || lp.sourceLanguage || "",
            targetLanguage: lp.target || lp.targetLanguage || "",
          }))
        ).onConflictDoNothing();
      }

      // Record stage history
      await db.insert(vendorStageHistory).values({
        vendorId: vendor.id,
        fromStage: null,
        toStage: "CV Review",
        changedBy: pmUserId,
        notes: "Created from approved application",
      });

      await logAudit(pmUserId, "application_approved", "vendor_application", id, { status: "pending" }, { status: "approved", vendorId: vendor.id }, getClientIp(req));

      return res.json({ message: "Application approved", action: "approve", vendor });
    }
  } catch (e) {
    console.error("Review application error:", e);
    res.status(500).json({ error: safeError("Failed to review application", e) });
  }
});

// ============================================
// 3. AI APPLICATION SUMMARY
// ============================================
router.post("/vm/applications/:id/ai-summary", requireAuth, requireRole("vm", "operations_manager"), async (req: Request, res: Response) => {
  try {
    const id = parseInt(param(req, "id"));
    const [application] = await db.select().from(vendorApplications).where(eq(vendorApplications.id, id));
    if (!application) return res.status(404).json({ error: "Application not found" });

    // Check cached result
    const cacheKey = `ai-summary-${id}`;
    const cached = getCached<any>(cacheKey, 3600_000); // 1 hour cache
    if (cached) return res.json(cached);

    // Check if notes already has AI summary
    if (application.notes) {
      try {
        const parsed = JSON.parse(application.notes);
        if (parsed.aiSummary) {
          setCache(cacheKey, parsed.aiSummary);
          return res.json(parsed.aiSummary);
        }
      } catch {}
    }

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
      return res.status(503).json({ error: "AI service not configured" });
    }

    const prompt = `Analyze this translation vendor application and provide a structured assessment.

Application Data:
- Name: ${application.fullName}
- Email: ${application.email}
- Location: ${application.location || "Not specified"}
- Native Language: ${application.nativeLanguage || "Not specified"}
- Language Pairs: ${JSON.stringify(application.languagePairs || [])}
- Service Types: ${(application.serviceTypes || []).join(", ") || "Not specified"}
- Specializations: ${(application.specializations || []).join(", ") || "Not specified"}
- Experience Years: ${application.experienceYears || "Not specified"}
- Education: ${application.education || "Not specified"}
- Certifications: ${(application.certifications || []).join(", ") || "None"}
- CAT Tools: ${JSON.stringify(application.software || [])}
- Rate Per Word: ${application.ratePerWord || "Not specified"}
- Rate Per Hour: ${application.ratePerHour || "Not specified"}
- Has CV: ${application.cvFileUrl ? "Yes" : "No"}

Return a JSON object with:
{
  "profileScore": <number 0-100>,
  "strengths": [<string>, ...],
  "weaknesses": [<string>, ...],
  "recommendation": "approve" | "review" | "reject",
  "summary": "<2-3 sentence summary>"
}`;

    const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        response_format: { type: "json_object" },
      }),
    });

    if (!aiResponse.ok) {
      const err = await aiResponse.text();
      console.error("OpenAI API error:", err);
      return res.status(502).json({ error: "AI analysis failed" });
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content;
    if (!content) return res.status(502).json({ error: "Empty AI response" });

    const summary = JSON.parse(content);

    // Cache in notes
    const existingNotes = application.notes ? (() => { try { return JSON.parse(application.notes!); } catch { return {}; } })() : {};
    await db.update(vendorApplications).set({
      notes: JSON.stringify({ ...existingNotes, aiSummary: summary }),
    }).where(eq(vendorApplications.id, id));

    setCache(cacheKey, summary);
    res.json(summary);
  } catch (e) {
    console.error("AI summary error:", e);
    res.status(500).json({ error: safeError("AI summary generation failed", e) });
  }
});

// ============================================
// 4. CAPACITY HEAT MAP
// ============================================
router.get("/vm/capacity-map", requireAuth, requireRole("vm", "operations_manager"), async (req: Request, res: Response) => {
  try {
    const dateFrom = (req.query.dateFrom as string) || new Date(Date.now() - 90 * 86400000).toISOString().split("T")[0];
    const dateTo = (req.query.dateTo as string) || new Date().toISOString().split("T")[0];

    // Supply: active vendors per language pair
    const supplyResult = await db.execute(sql`
      SELECT vlp.source_language, vlp.target_language, COUNT(DISTINCT vlp.vendor_id)::int as supply
      FROM vendor_language_pairs vlp
      JOIN vendors v ON v.id = vlp.vendor_id AND v.status = 'Active'
      GROUP BY vlp.source_language, vlp.target_language
    `);

    // Demand: jobs per language pair in date range
    const demandResult = await db.execute(sql`
      SELECT source_language, target_language, COUNT(*)::int as demand
      FROM jobs
      WHERE created_at >= ${dateFrom}::date AND created_at <= ${dateTo}::date
      GROUP BY source_language, target_language
    `);

    // Build matrix
    const supplyMap: Record<string, number> = {};
    const demandMap: Record<string, number> = {};
    const allPairs = new Set<string>();
    const allSources = new Set<string>();
    const allTargets = new Set<string>();

    for (const row of (supplyResult.rows || []) as any[]) {
      const key = `${row.source_language}|${row.target_language}`;
      supplyMap[key] = row.supply;
      allPairs.add(key);
      if (row.source_language) allSources.add(row.source_language);
      if (row.target_language) allTargets.add(row.target_language);
    }

    for (const row of (demandResult.rows || []) as any[]) {
      const key = `${row.source_language}|${row.target_language}`;
      demandMap[key] = row.demand;
      allPairs.add(key);
      if (row.source_language) allSources.add(row.source_language);
      if (row.target_language) allTargets.add(row.target_language);
    }

    const matrix = Array.from(allPairs).map(key => {
      const [source, target] = key.split("|");
      const supply = supplyMap[key] || 0;
      const demand = demandMap[key] || 0;
      const ratio = demand > 0 ? supply / demand : (supply > 0 ? 999 : 0);
      return { source, target, supply, demand, ratio: Math.round(ratio * 100) / 100 };
    });

    res.json({
      matrix,
      sourceLanguages: Array.from(allSources).sort(),
      targetLanguages: Array.from(allTargets).sort(),
      dateRange: { from: dateFrom, to: dateTo },
    });
  } catch (e) {
    console.error("Capacity map error:", e);
    res.status(500).json({ error: safeError("Failed to generate capacity map", e) });
  }
});

// Drill-down: vendors for a specific language pair
router.get("/vm/capacity-map/vendors", requireAuth, requireRole("vm", "operations_manager"), async (req: Request, res: Response) => {
  try {
    const source = req.query.source as string;
    const target = req.query.target as string;
    if (!source || !target) return res.status(400).json({ error: "source and target query params required" });

    const result = await db.execute(sql`
      SELECT v.id, v.full_name, v.email, v.status, v.location, v.experience_years,
             v.combined_quality_score, v.total_reviews_count
      FROM vendors v
      JOIN vendor_language_pairs vlp ON vlp.vendor_id = v.id
      WHERE vlp.source_language = ${source} AND vlp.target_language = ${target}
        AND v.status = 'Active'
      ORDER BY v.combined_quality_score DESC NULLS LAST
    `);

    res.json({ vendors: result.rows || [] });
  } catch (e) {
    res.status(500).json({ error: safeError("Failed to fetch vendors for pair", e) });
  }
});

// ============================================
// 5. VENDOR COMMUNICATION SYSTEM
// ============================================

// Email templates CRUD
router.get("/vm/email-templates", requireAuth, requireRole("vm", "operations_manager"), async (_req: Request, res: Response) => {
  try {
    const templates = await db.select().from(vendorEmailTemplates).orderBy(asc(vendorEmailTemplates.name));
    res.json(templates);
  } catch (e) {
    res.status(500).json({ error: safeError("Failed to fetch templates", e) });
  }
});

router.post("/vm/email-templates", requireAuth, requireRole("vm", "operations_manager"), async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      name: z.string().min(1),
      subject: z.string().min(1),
      body: z.string().min(1),
      category: z.string().optional(),
    });
    const body = validate(schema, req.body, res);
    if (!body) return;

    const [template] = await db.insert(vendorEmailTemplates).values({
      ...body,
      createdBy: (req as any).pmUserId,
    }).returning();

    res.status(201).json(template);
  } catch (e) {
    res.status(500).json({ error: safeError("Failed to create template", e) });
  }
});

router.patch("/vm/email-templates/:id", requireAuth, requireRole("vm", "operations_manager"), async (req: Request, res: Response) => {
  try {
    const id = parseInt(param(req, "id"));
    const schema = z.object({
      name: z.string().min(1).optional(),
      subject: z.string().min(1).optional(),
      body: z.string().min(1).optional(),
      category: z.string().optional(),
      isActive: z.boolean().optional(),
    });
    const body = validate(schema, req.body, res);
    if (!body) return;

    const [updated] = await db.update(vendorEmailTemplates).set({
      ...body,
      updatedAt: new Date(),
    }).where(eq(vendorEmailTemplates.id, id)).returning();

    if (!updated) return res.status(404).json({ error: "Template not found" });
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: safeError("Failed to update template", e) });
  }
});

// Send email
router.post("/vm/send-email", requireAuth, requireRole("vm", "operations_manager"), async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      vendorIds: z.array(z.number()).min(1),
      subject: z.string().min(1),
      body: z.string().min(1),
      templateId: z.number().optional(),
    });
    const body = validate(schema, req.body, res);
    if (!body) return;

    const pmUserId = (req as any).pmUserId;

    // Get vendor emails
    const vendorList = await db.select({ id: vendors.id, fullName: vendors.fullName, email: vendors.email })
      .from(vendors)
      .where(inArray(vendors.id, body.vendorIds));

    const results: any[] = [];
    for (const vendor of vendorList) {
      const personalizedSubject = replaceVars(body.subject, {
        vendor_name: vendor.fullName,
        vendor_email: vendor.email,
        company_name: "El Turco Translation Services",
      });
      const personalizedBody = replaceVars(body.body, {
        vendor_name: vendor.fullName,
        vendor_email: vendor.email,
        company_name: "El Turco Translation Services",
      });

      let status = "sent";
      let resendMessageId: string | undefined;
      try {
        const emailResult = await sendEmail([vendor.email], personalizedSubject, personalizedBody);
        resendMessageId = emailResult?.id;
      } catch (e) {
        console.error(`Email send failed for vendor ${vendor.id}:`, e);
        status = "failed";
      }

      const [emailRecord] = await db.insert(vendorEmails).values({
        vendorId: vendor.id,
        templateId: body.templateId || null,
        subject: personalizedSubject,
        body: personalizedBody,
        sentBy: pmUserId,
        status,
        resendMessageId: resendMessageId || null,
      }).returning();

      results.push({ vendorId: vendor.id, vendorName: vendor.fullName, status, emailId: emailRecord.id });
    }

    await logAudit(pmUserId, "vendor_email_sent", "vendor_email", null, null, {
      vendorCount: vendorList.length,
      subject: body.subject,
    }, getClientIp(req));

    res.json({ sent: results.filter(r => r.status === "sent").length, failed: results.filter(r => r.status === "failed").length, results });
  } catch (e) {
    console.error("Send email error:", e);
    res.status(500).json({ error: safeError("Failed to send emails", e) });
  }
});

// Email history for vendor
router.get("/vendors/:id/email-history", requireAuth, requireRole("vm", "operations_manager"), async (req: Request, res: Response) => {
  try {
    const vendorId = parseInt(param(req, "id"));
    const emails = await db.select().from(vendorEmails)
      .where(eq(vendorEmails.vendorId, vendorId))
      .orderBy(desc(vendorEmails.sentAt));
    res.json(emails);
  } catch (e) {
    res.status(500).json({ error: safeError("Failed to fetch email history", e) });
  }
});

// ============================================
// 6. VENDOR ONBOARDING AUTOMATION
// ============================================

const ONBOARDING_TASKS = [
  { taskName: "Welcome email sent", taskType: "email" },
  { taskName: "NDA signed", taskType: "document" },
  { taskName: "Tax form submitted", taskType: "document" },
  { taskName: "Payment info provided", taskType: "profile" },
  { taskName: "First quiz completed", taskType: "quiz" },
  { taskName: "Profile completed", taskType: "profile" },
  { taskName: "First test task assigned", taskType: "task" },
];

// Create onboarding tasks for a vendor (called when vendor becomes Active)
async function createOnboardingTasks(vendorId: number): Promise<void> {
  const dueDate = new Date(Date.now() + 14 * 86400000).toISOString().split("T")[0]; // 2 weeks
  await db.insert(vendorOnboardingTasks).values(
    ONBOARDING_TASKS.map(task => ({
      vendorId,
      taskName: task.taskName,
      taskType: task.taskType,
      status: "pending" as const,
      dueDate,
    }))
  );
}

// Send welcome email when vendor becomes Active
async function sendWelcomeEmail(vendorId: number, pmUserId: number): Promise<void> {
  try {
    const [vendor] = await db.select().from(vendors).where(eq(vendors.id, vendorId));
    if (!vendor) return;

    // Find welcome template
    const [template] = await db.select().from(vendorEmailTemplates)
      .where(eq(vendorEmailTemplates.category, "onboarding"))
      .limit(1);

    const subject = template
      ? replaceVars(template.subject, { vendor_name: vendor.fullName, company_name: "El Turco Translation Services" })
      : `Welcome to El Turco Translation Services, ${vendor.fullName}!`;
    const body = template
      ? replaceVars(template.body, { vendor_name: vendor.fullName, vendor_email: vendor.email, company_name: "El Turco Translation Services" })
      : `<p>Welcome ${vendor.fullName}! Your account has been activated.</p>`;

    let status = "sent";
    let resendMessageId: string | undefined;
    try {
      const result = await sendEmail([vendor.email], subject, body);
      resendMessageId = result?.id;
    } catch {
      status = "failed";
    }

    await db.insert(vendorEmails).values({
      vendorId,
      subject,
      body,
      sentBy: pmUserId,
      status,
      resendMessageId: resendMessageId || null,
    });

    // Mark welcome email task as complete
    await db.update(vendorOnboardingTasks).set({
      status: "completed",
      completedAt: new Date(),
    }).where(and(
      eq(vendorOnboardingTasks.vendorId, vendorId),
      eq(vendorOnboardingTasks.taskName, "Welcome email sent"),
    ));
  } catch (e) {
    console.error("Welcome email error (non-fatal):", e);
  }
}

// Trigger onboarding (call from vendor stage change endpoints)
router.post("/vm/vendors/:id/trigger-onboarding", requireAuth, requireRole("vm", "operations_manager"), async (req: Request, res: Response) => {
  try {
    const vendorId = parseInt(param(req, "id"));
    const pmUserId = (req as any).pmUserId;

    // Check if already has onboarding tasks
    const [existing] = await db.select({ count: count() }).from(vendorOnboardingTasks)
      .where(eq(vendorOnboardingTasks.vendorId, vendorId));
    if (existing.count > 0) {
      return res.json({ message: "Onboarding already exists", alreadyCreated: true });
    }

    await createOnboardingTasks(vendorId);
    await sendWelcomeEmail(vendorId, pmUserId);

    res.json({ message: "Onboarding tasks created and welcome email sent" });
  } catch (e) {
    res.status(500).json({ error: safeError("Failed to trigger onboarding", e) });
  }
});

// GET onboarding tasks for vendor
router.get("/vendors/:id/onboarding", requireAuth, requireRole("vm", "operations_manager"), async (req: Request, res: Response) => {
  try {
    const vendorId = parseInt(param(req, "id"));
    const tasks = await db.select().from(vendorOnboardingTasks)
      .where(eq(vendorOnboardingTasks.vendorId, vendorId))
      .orderBy(asc(vendorOnboardingTasks.id));

    const completed = tasks.filter(t => t.status === "completed").length;
    res.json({ tasks, total: tasks.length, completed, progress: tasks.length > 0 ? Math.round((completed / tasks.length) * 100) : 0 });
  } catch (e) {
    res.status(500).json({ error: safeError("Failed to fetch onboarding tasks", e) });
  }
});

// PATCH update onboarding task
router.patch("/vendors/:id/onboarding/:taskId", requireAuth, requireRole("vm", "operations_manager"), async (req: Request, res: Response) => {
  try {
    const vendorId = parseInt(param(req, "id"));
    const taskId = parseInt(req.params.taskId);
    const schema = z.object({
      status: z.enum(["pending", "completed", "skipped"]),
      notes: z.string().optional(),
    });
    const body = validate(schema, req.body, res);
    if (!body) return;

    const updates: any = { status: body.status };
    if (body.status === "completed") updates.completedAt = new Date();
    if (body.notes) updates.notes = body.notes;

    const [updated] = await db.update(vendorOnboardingTasks).set(updates)
      .where(and(
        eq(vendorOnboardingTasks.id, taskId),
        eq(vendorOnboardingTasks.vendorId, vendorId),
      )).returning();

    if (!updated) return res.status(404).json({ error: "Onboarding task not found" });
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: safeError("Failed to update onboarding task", e) });
  }
});

// ============================================
// 7. VM ANALYTICS
// ============================================
router.get("/vm/analytics", requireAuth, requireRole("vm", "operations_manager"), async (req: Request, res: Response) => {
  try {
    const dateFrom = (req.query.dateFrom as string) || new Date(Date.now() - 84 * 86400000).toISOString().split("T")[0]; // 12 weeks
    const dateTo = (req.query.dateTo as string) || new Date().toISOString().split("T")[0];

    // Applications per week (last 12 weeks)
    const weeklyApps = await db.execute(sql`
      SELECT date_trunc('week', submitted_at)::date as week,
             COUNT(*)::int as count
      FROM vendor_applications
      WHERE submitted_at >= ${dateFrom}::date AND submitted_at <= ${dateTo}::date + interval '1 day'
      GROUP BY date_trunc('week', submitted_at)
      ORDER BY week ASC
    `);

    // Approval rate
    const [approvalStats] = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE status IN ('approved', 'rejected'))::int as total_reviewed,
        COUNT(*) FILTER (WHERE status = 'approved')::int as approved,
        COUNT(*) FILTER (WHERE status = 'rejected')::int as rejected
      FROM vendor_applications
      WHERE submitted_at >= ${dateFrom}::date AND submitted_at <= ${dateTo}::date + interval '1 day'
    `).then(r => r.rows || [{ total_reviewed: 0, approved: 0, rejected: 0 }]);

    const totalReviewed = Number((approvalStats as any).total_reviewed) || 0;
    const approvedCount = Number((approvalStats as any).approved) || 0;
    const approvalRate = totalReviewed > 0 ? Math.round((approvedCount / totalReviewed) * 100) : 0;

    // Average review time
    const reviewTimeResult = await db.execute(sql`
      SELECT AVG(EXTRACT(EPOCH FROM (reviewed_at - submitted_at)) / 3600)::numeric(10,1) as avg_hours
      FROM vendor_applications
      WHERE reviewed_at IS NOT NULL AND submitted_at IS NOT NULL
        AND submitted_at >= ${dateFrom}::date
    `);
    const avgReviewHours = Number(reviewTimeResult.rows?.[0]?.avg_hours) || 0;

    // Pipeline stage distribution
    const pipelineDistribution = await db.execute(sql`
      SELECT status, COUNT(*)::int as count FROM vendors GROUP BY status ORDER BY count DESC
    `);

    // Top 10 language pairs by application count
    const topLangPairs = await db.execute(sql`
      SELECT lp->>'source' as source, lp->>'target' as target, COUNT(*)::int as count
      FROM vendor_applications, jsonb_array_elements(language_pairs) as lp
      WHERE submitted_at >= ${dateFrom}::date
      GROUP BY lp->>'source', lp->>'target'
      ORDER BY count DESC
      LIMIT 10
    `);

    // Vendor churn: Active -> Inactive per month
    const churnData = await db.execute(sql`
      SELECT date_trunc('month', created_at)::date as month, COUNT(*)::int as count
      FROM vendor_stage_history
      WHERE to_stage IN ('Inactive', 'Blacklisted') AND from_stage = 'Active'
        AND created_at >= ${dateFrom}::date
      GROUP BY date_trunc('month', created_at)
      ORDER BY month ASC
    `);

    // KPI summary
    const [totalApps] = await db.select({ count: count() }).from(vendorApplications)
      .where(gte(vendorApplications.submittedAt, new Date(dateFrom)));
    const [activeVendors] = await db.select({ count: count() }).from(vendors)
      .where(eq(vendors.status, "Active"));

    res.json({
      kpis: {
        totalApplications: totalApps.count,
        approvalRate,
        avgReviewHours,
        activeVendorCount: activeVendors.count,
      },
      weeklyApplications: weeklyApps.rows || [],
      approvalStats: { totalReviewed, approved: approvedCount, rejected: Number((approvalStats as any).rejected) || 0 },
      pipelineDistribution: pipelineDistribution.rows || [],
      topLanguagePairs: topLangPairs.rows || [],
      churnData: churnData.rows || [],
      dateRange: { from: dateFrom, to: dateTo },
    });
  } catch (e) {
    console.error("VM analytics error:", e);
    res.status(500).json({ error: safeError("Failed to generate analytics", e) });
  }
});

// ============================================
// 8. VENDOR PROFILE EDIT BY VM (RBAC patch)
// ============================================
// The existing PATCH /api/vendors/:id in vendor.router.ts already handles editing.
// This endpoint ensures VM role has audit trail for profile edits.
router.patch("/vm/vendors/:id/profile", requireAuth, requireRole("vm", "operations_manager"), async (req: Request, res: Response) => {
  try {
    const vendorId = parseInt(param(req, "id"));
    const pmUserId = (req as any).pmUserId;

    const [existingVendor] = await db.select().from(vendors).where(eq(vendors.id, vendorId));
    if (!existingVendor) return res.status(404).json({ error: "Vendor not found" });

    const schema = z.object({
      fullName: z.string().optional(),
      email: z.string().email().optional(),
      phone: z.string().optional(),
      location: z.string().optional(),
      nativeLanguage: z.string().optional(),
      serviceTypes: z.array(z.string()).optional(),
      specializations: z.array(z.string()).optional(),
      experienceYears: z.number().optional(),
      rates: z.any().optional(),
      currency: z.string().optional(),
      status: z.string().optional(),
      notes: z.string().optional(),
      minimumFee: z.string().optional(),
    });
    const body = validate(schema, req.body, res);
    if (!body) return;

    // Track changes for audit trail
    const changes: { field: string; oldValue: any; newValue: any }[] = [];
    const updateData: any = {};

    for (const [key, value] of Object.entries(body)) {
      if (value !== undefined && (existingVendor as any)[key] !== value) {
        changes.push({ field: key, oldValue: (existingVendor as any)[key], newValue: value });
        updateData[key] = value;
      }
    }

    if (Object.keys(updateData).length === 0) {
      return res.json({ message: "No changes", vendor: existingVendor });
    }

    updateData.updatedAt = new Date();
    const [updated] = await db.update(vendors).set(updateData).where(eq(vendors.id, vendorId)).returning();

    // Log each change to vendorActivities
    for (const change of changes) {
      await db.insert(vendorActivities).values({
        vendorId,
        activityType: "profile_edit",
        description: `VM updated ${change.field}`,
        oldValue: String(change.oldValue ?? ""),
        newValue: String(change.newValue ?? ""),
        performedBy: pmUserId,
      });
    }

    // If status changed to Active, trigger onboarding
    if (body.status === "Active" && existingVendor.status !== "Active") {
      const [existingOnboarding] = await db.select({ count: count() }).from(vendorOnboardingTasks)
        .where(eq(vendorOnboardingTasks.vendorId, vendorId));
      if (existingOnboarding.count === 0) {
        await createOnboardingTasks(vendorId);
        await sendWelcomeEmail(vendorId, pmUserId);
      }

      // Record stage history
      await db.insert(vendorStageHistory).values({
        vendorId,
        fromStage: existingVendor.status,
        toStage: "Active",
        changedBy: pmUserId,
        notes: "Status changed by VM",
      });
    }

    await logAudit(pmUserId, "vm_vendor_profile_edit", "vendor", vendorId,
      { changes: changes.map(c => ({ field: c.field, old: c.oldValue })) },
      { changes: changes.map(c => ({ field: c.field, new: c.newValue })) },
      getClientIp(req));

    res.json(updated);
  } catch (e) {
    console.error("VM vendor profile edit error:", e);
    res.status(500).json({ error: safeError("Failed to update vendor profile", e) });
  }
});

export default router;

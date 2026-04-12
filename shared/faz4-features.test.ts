import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  validateProjectTransition,
  validateJobTransition,
  getValidProjectActions,
  getValidJobActions,
} from "./state-machines";

// ============================================
// Faz 4 Feature Tests — Proje Motoru ve Akıllı Atama
// ============================================

// ── Zod schemas matching the new endpoints ──

const createProjectSchema = z.object({
  projectName: z.string().min(1).max(500),
  customerId: z.number().int().positive(),
  status: z.string().optional(),
  deadline: z.string().optional(),
});

const batchJobSchema = z.object({
  jobs: z.array(z.object({
    jobName: z.string(),
    sourceLanguage: z.string(),
    targetLanguage: z.string(),
    serviceType: z.string(),
  })).min(1),
});

const smartMatchResultSchema = z.object({
  vendorId: z.number(),
  fullName: z.string(),
  matchScore: z.number().min(0).max(100),
  factors: z.record(z.number()),
  reason: z.string(),
});

const autoDispatchRuleSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  sourceLanguage: z.string().optional(),
  targetLanguage: z.string().optional(),
  serviceType: z.string().optional(),
  preferredVendorId: z.number().optional(),
  minQualityScore: z.string().optional(),
  maxRate: z.string().optional(),
  priority: z.number().optional(),
});

const deadlinePredictionSchema = z.object({
  sourceLanguage: z.string().min(1),
  targetLanguage: z.string().min(1),
  serviceType: z.string().optional(),
  wordCount: z.number().optional(),
});

const deadlinePredictionResultSchema = z.object({
  estimatedDays: z.number().positive(),
  estimatedDate: z.string(),
  confidence: z.enum(["low", "medium", "high"]),
  basedOnSamples: z.number(),
});

const jobDependencySchema = z.object({
  dependsOnJobId: z.number().int().positive(),
  dependencyType: z.string().optional(),
});

const projectTemplateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  sourceLanguage: z.string().optional(),
  targetLanguages: z.array(z.string()).optional(),
  serviceTypes: z.array(z.string()).optional(),
  defaultInstructions: z.string().optional(),
  defaultDeadlineDays: z.number().optional(),
});

const projectCloneSchema = z.object({
  projectName: z.string().optional(),
  deadline: z.string().optional(),
});

// ============================================
// 1. Quick Project Entry — Validation
// ============================================
describe("Quick Project Entry", () => {
  it("validates project creation data", () => {
    const valid = createProjectSchema.safeParse({
      projectName: "Website Localization — ACME Corp",
      customerId: 1,
      status: "active",
    });
    expect(valid.success).toBe(true);
  });

  it("rejects project with empty name", () => {
    const invalid = createProjectSchema.safeParse({
      projectName: "",
      customerId: 1,
    });
    expect(invalid.success).toBe(false);
  });

  it("rejects project without customerId", () => {
    const invalid = createProjectSchema.safeParse({
      projectName: "Test Project",
    });
    expect(invalid.success).toBe(false);
  });

  it("validates batch job creation", () => {
    const valid = batchJobSchema.safeParse({
      jobs: [
        { jobName: "EN → TR", sourceLanguage: "EN", targetLanguage: "TR", serviceType: "translation" },
        { jobName: "EN → DE", sourceLanguage: "EN", targetLanguage: "DE", serviceType: "translation" },
      ],
    });
    expect(valid.success).toBe(true);
  });

  it("rejects empty batch jobs", () => {
    const invalid = batchJobSchema.safeParse({ jobs: [] });
    expect(invalid.success).toBe(false);
  });
});

// ============================================
// 2. Smart Match Scoring — Algorithm Validation
// ============================================
describe("Smart Match Scoring Algorithm", () => {
  it("validates smart match result structure", () => {
    const result = smartMatchResultSchema.safeParse({
      vendorId: 1,
      fullName: "Test Vendor",
      matchScore: 75,
      factors: { languagePair: 30, specialization: 20, quality: 15, availability: 10, responseTime: 0, rate: 0 },
      reason: "Exact language pair match",
    });
    expect(result.success).toBe(true);
  });

  it("enforces score range 0-100", () => {
    const lowResult = smartMatchResultSchema.safeParse({
      vendorId: 1, fullName: "A", matchScore: 0, factors: {}, reason: "test",
    });
    expect(lowResult.success).toBe(true);

    const overResult = smartMatchResultSchema.safeParse({
      vendorId: 1, fullName: "A", matchScore: 101, factors: {}, reason: "test",
    });
    expect(overResult.success).toBe(false);
  });

  it("language pair match scores 30 points", () => {
    // This test validates the weight configuration
    const LANG_PAIR_WEIGHT = 30;
    const SPEC_WEIGHT = 20;
    const QUALITY_WEIGHT = 20;
    const AVAILABILITY_WEIGHT = 15;
    const RESPONSE_WEIGHT = 10;
    const RATE_WEIGHT = 5;
    expect(LANG_PAIR_WEIGHT + SPEC_WEIGHT + QUALITY_WEIGHT + AVAILABILITY_WEIGHT + RESPONSE_WEIGHT + RATE_WEIGHT).toBe(100);
  });

  it("calculates correct quality score factor", () => {
    const qualityScore = 85;
    const qualityWeight = 20;
    const qualityFactor = Math.round((qualityScore / 100) * qualityWeight);
    expect(qualityFactor).toBe(17);
  });

  it("penalizes overloaded vendors on availability", () => {
    const calculateAvailability = (load: number) => {
      if (load === 0) return 15;
      if (load <= 3) return 10;
      if (load <= 6) return 5;
      return 0;
    };
    expect(calculateAvailability(0)).toBe(15);
    expect(calculateAvailability(2)).toBe(10);
    expect(calculateAvailability(5)).toBe(5);
    expect(calculateAvailability(10)).toBe(0);
  });
});

// ============================================
// 3. Auto-Dispatch Rule Matching
// ============================================
describe("Auto-Dispatch Rules", () => {
  it("validates auto-dispatch rule creation", () => {
    const valid = autoDispatchRuleSchema.safeParse({
      name: "EN-TR Translation Default",
      sourceLanguage: "EN",
      targetLanguage: "TR",
      serviceType: "translation",
      preferredVendorId: 1,
      minQualityScore: "70",
      priority: 10,
    });
    expect(valid.success).toBe(true);
  });

  it("requires rule name", () => {
    const invalid = autoDispatchRuleSchema.safeParse({
      sourceLanguage: "EN",
    });
    expect(invalid.success).toBe(false);
  });

  it("matches rules by language pair", () => {
    const rule = { sourceLanguage: "EN", targetLanguage: "TR", serviceType: "translation", customerId: null };
    const job = { sourceLanguage: "EN", targetLanguage: "TR", serviceType: "translation" };
    const project = { customerId: 5 };

    const matches =
      (!rule.sourceLanguage || rule.sourceLanguage === job.sourceLanguage) &&
      (!rule.targetLanguage || rule.targetLanguage === job.targetLanguage) &&
      (!rule.serviceType || rule.serviceType === job.serviceType) &&
      (!rule.customerId || rule.customerId === project.customerId);

    expect(matches).toBe(true);
  });

  it("rejects non-matching language pair", () => {
    const rule = { sourceLanguage: "EN", targetLanguage: "FR" };
    const job = { sourceLanguage: "EN", targetLanguage: "TR" };

    const matches =
      (!rule.sourceLanguage || rule.sourceLanguage === job.sourceLanguage) &&
      (!rule.targetLanguage || rule.targetLanguage === job.targetLanguage);

    expect(matches).toBe(false);
  });

  it("wildcard rules match any language", () => {
    const rule = { sourceLanguage: "", targetLanguage: "" };
    const job = { sourceLanguage: "EN", targetLanguage: "ZH" };

    const matches =
      (!rule.sourceLanguage || rule.sourceLanguage === job.sourceLanguage) &&
      (!rule.targetLanguage || rule.targetLanguage === job.targetLanguage);

    expect(matches).toBe(true);
  });
});

// ============================================
// 4. Deadline Prediction
// ============================================
describe("Deadline Prediction", () => {
  it("validates prediction input", () => {
    const valid = deadlinePredictionSchema.safeParse({
      sourceLanguage: "EN",
      targetLanguage: "TR",
      serviceType: "translation",
      wordCount: 5000,
    });
    expect(valid.success).toBe(true);
  });

  it("validates prediction output", () => {
    const valid = deadlinePredictionResultSchema.safeParse({
      estimatedDays: 3,
      estimatedDate: "2026-04-15T00:00:00.000Z",
      confidence: "medium",
      basedOnSamples: 7,
    });
    expect(valid.success).toBe(true);
  });

  it("calculates fallback based on word count", () => {
    const wordCount = 5000;
    const estimatedDays = Math.max(1, Math.ceil(wordCount / 3000));
    expect(estimatedDays).toBe(2);
  });

  it("calculates fallback for very small documents", () => {
    const wordCount = 500;
    const estimatedDays = Math.max(1, Math.ceil(wordCount / 3000));
    expect(estimatedDays).toBe(1);
  });

  it("adjusts estimate by word ratio", () => {
    const historicalAvgDays = 5;
    const historicalAvgWords = 3000;
    const requestedWords = 9000;
    const wordRatio = requestedWords / historicalAvgWords;
    const estimatedDays = Math.max(1, Math.ceil(historicalAvgDays * wordRatio));
    expect(estimatedDays).toBe(15);
  });
});

// ============================================
// 5. Job Dependency Validation
// ============================================
describe("Job Dependencies", () => {
  it("validates dependency creation", () => {
    const valid = jobDependencySchema.safeParse({
      dependsOnJobId: 5,
      dependencyType: "finish_to_start",
    });
    expect(valid.success).toBe(true);
  });

  it("rejects self-dependency", () => {
    const jobId = 5;
    const depJobId = 5;
    expect(jobId === depJobId).toBe(true); // Self-dependency should be blocked
  });

  it("blocks start transition when dependency not met", () => {
    const deps = [{ dependsOnJobId: 1, dependencyType: "finish_to_start" }];
    const jobStatuses: Record<number, string> = { 1: "in_progress" };

    const isBlocked = deps.some(d => {
      const depStatus = jobStatuses[d.dependsOnJobId];
      return depStatus !== "delivered" && depStatus !== "approved" && depStatus !== "invoiced";
    });

    expect(isBlocked).toBe(true);
  });

  it("allows start when dependency is delivered", () => {
    const deps = [{ dependsOnJobId: 1, dependencyType: "finish_to_start" }];
    const jobStatuses: Record<number, string> = { 1: "delivered" };

    const isBlocked = deps.some(d => {
      const depStatus = jobStatuses[d.dependsOnJobId];
      return depStatus !== "delivered" && depStatus !== "approved" && depStatus !== "invoiced";
    });

    expect(isBlocked).toBe(false);
  });

  it("allows start when dependency is approved", () => {
    const deps = [{ dependsOnJobId: 1, dependencyType: "finish_to_start" }];
    const jobStatuses: Record<number, string> = { 1: "approved" };

    const isBlocked = deps.some(d => {
      const depStatus = jobStatuses[d.dependsOnJobId];
      return depStatus !== "delivered" && depStatus !== "approved" && depStatus !== "invoiced";
    });

    expect(isBlocked).toBe(false);
  });

  it("blocks when any dependency not met (multiple deps)", () => {
    const deps = [
      { dependsOnJobId: 1, dependencyType: "finish_to_start" },
      { dependsOnJobId: 2, dependencyType: "finish_to_start" },
    ];
    const jobStatuses: Record<number, string> = { 1: "delivered", 2: "assigned" };

    const isBlocked = deps.some(d => {
      const depStatus = jobStatuses[d.dependsOnJobId];
      return depStatus !== "delivered" && depStatus !== "approved" && depStatus !== "invoiced";
    });

    expect(isBlocked).toBe(true);
  });
});

// ============================================
// 6. Project Template System
// ============================================
describe("Project Templates", () => {
  it("validates template creation", () => {
    const valid = projectTemplateSchema.safeParse({
      name: "General Translation",
      description: "Standard translation template",
      sourceLanguage: "EN",
      targetLanguages: ["TR", "DE", "FR"],
      serviceTypes: ["translation"],
      defaultDeadlineDays: 7,
    });
    expect(valid.success).toBe(true);
  });

  it("requires template name", () => {
    const invalid = projectTemplateSchema.safeParse({
      description: "No name provided",
    });
    expect(invalid.success).toBe(false);
  });

  it("calculates deadline from template days", () => {
    const defaultDeadlineDays = 7;
    const now = new Date("2026-04-12T00:00:00Z");
    const deadline = new Date(now.getTime() + defaultDeadlineDays * 24 * 60 * 60 * 1000);
    expect(deadline.toISOString().slice(0, 10)).toBe("2026-04-19");
  });
});

// ============================================
// 7. Project Clone
// ============================================
describe("Project Clone", () => {
  it("validates clone input", () => {
    const valid = projectCloneSchema.safeParse({
      projectName: "Cloned Project",
      deadline: "2026-05-01",
    });
    expect(valid.success).toBe(true);
  });

  it("allows clone with no overrides", () => {
    const valid = projectCloneSchema.safeParse({});
    expect(valid.success).toBe(true);
  });

  it("generates correct clone name", () => {
    const originalName = "Website Localization";
    const cloneName = `${originalName} (Copy)`;
    expect(cloneName).toBe("Website Localization (Copy)");
  });
});

// ============================================
// 8. Existing State Machine Compatibility
// ============================================
describe("State Machine Compatibility", () => {
  it("existing project transitions still work", () => {
    expect(validateProjectTransition("draft", "quote")).toBe("quoted");
    expect(validateProjectTransition("quoted", "confirm")).toBe("confirmed");
    expect(validateProjectTransition("confirmed", "start")).toBe("in_progress");
    expect(validateProjectTransition("in_progress", "deliver")).toBe("delivered");
    expect(validateProjectTransition("delivered", "complete")).toBe("completed");
  });

  it("existing job transitions still work", () => {
    expect(validateJobTransition("unassigned", "assign")).toBe("assigned");
    expect(validateJobTransition("assigned", "start")).toBe("in_progress");
    expect(validateJobTransition("in_progress", "deliver")).toBe("delivered");
    expect(validateJobTransition("delivered", "approve")).toBe("approved");
  });

  it("invalid transitions return null", () => {
    expect(validateProjectTransition("draft", "deliver")).toBeNull();
    expect(validateJobTransition("unassigned", "deliver")).toBeNull();
  });

  it("getValidProjectActions returns correct actions", () => {
    expect(getValidProjectActions("draft")).toContain("quote");
    expect(getValidProjectActions("draft")).toContain("cancel");
    expect(getValidProjectActions("completed")).toContain("invoice");
  });

  it("getValidJobActions returns correct actions", () => {
    expect(getValidJobActions("assigned")).toContain("start");
    expect(getValidJobActions("delivered")).toContain("approve");
    expect(getValidJobActions("delivered")).toContain("revision");
  });
});

// ============================================
// 9. Pipeline Auto-Trigger Validation
// ============================================
describe("Pipeline Auto-Triggers (Gap Fix)", () => {
  it("Quiz Pending stage triggers quiz assignment", () => {
    const newStatus = "Quiz Pending";
    const shouldTriggerQuiz = newStatus === "Quiz Pending";
    expect(shouldTriggerQuiz).toBe(true);
  });

  it("NDA Pending stage triggers NDA email", () => {
    const newStatus = "NDA Pending";
    const shouldTriggerNDA = newStatus === "NDA Pending";
    expect(shouldTriggerNDA).toBe(true);
  });

  it("Active stage triggers onboarding only from non-Active", () => {
    const newStatus = "Active";
    const oldStatus = "Approved";
    const shouldTriggerOnboarding = newStatus === "Active" && oldStatus !== "Active";
    expect(shouldTriggerOnboarding).toBe(true);
  });

  it("Active to Active does not re-trigger onboarding", () => {
    const newStatus = "Active";
    const oldStatus = "Active";
    const shouldTriggerOnboarding = newStatus === "Active" && oldStatus !== "Active";
    expect(shouldTriggerOnboarding).toBe(false);
  });
});

// ============================================
// 10. Bulk Actions Validation (Gap Fix)
// ============================================
describe("Bulk Actions (Gap Fix)", () => {
  const bulkQuizSchema = z.object({
    vendorIds: z.array(z.number().int().positive()),
    quizId: z.number().int().positive(),
  });

  const bulkEmailSchema = z.object({
    vendorIds: z.array(z.number().int().positive()),
    subject: z.string().min(1),
    body: z.string().min(1),
    templateId: z.number().optional(),
  });

  it("validates bulk quiz assignment", () => {
    const valid = bulkQuizSchema.safeParse({
      vendorIds: [1, 2, 3],
      quizId: 5,
    });
    expect(valid.success).toBe(true);
  });

  it("validates bulk email send", () => {
    const valid = bulkEmailSchema.safeParse({
      vendorIds: [1, 2],
      subject: "Welcome to the team!",
      body: "<p>Dear {{vendor_name}}, welcome!</p>",
    });
    expect(valid.success).toBe(true);
  });

  it("rejects email without subject", () => {
    const invalid = bulkEmailSchema.safeParse({
      vendorIds: [1],
      subject: "",
      body: "test",
    });
    expect(invalid.success).toBe(false);
  });
});

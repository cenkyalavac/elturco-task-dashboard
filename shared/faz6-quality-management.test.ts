import { describe, it, expect } from "vitest";
import { z } from "zod";

// ============================================
// Faz 6 Feature Tests — Kalite Yönetim Sistemi
// ============================================

// ── Zod schemas matching the Faz 6 endpoints ──

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

// ── Severity weights ──
const SEVERITY_WEIGHTS: Record<string, number> = {
  critical: 5,
  major: 3,
  minor: 1,
  preferential: 0,
};

// ── LQA score calculation ──
function calcLqaScore(totalPenalty: number, wordCount: number): number {
  if (!wordCount || wordCount <= 0) return 100;
  return Math.max(0, 100 - (totalPenalty / wordCount) * 1000);
}

// ── QS Scorecard calculation ──
function calcQualityScore(avgLqa: number | null, passRate: number, disputeAcceptanceRateInverse: number): number | null {
  if (avgLqa == null) return null;
  return (avgLqa * 0.7) + (passRate * 100 * 0.2) + (disputeAcceptanceRateInverse * 100 * 0.1);
}

// ============================================
// TEST SUITES
// ============================================

describe("Faz 6: LQA Score Calculation", () => {
  it("should return 100 for zero penalty", () => {
    expect(calcLqaScore(0, 1000)).toBe(100);
  });

  it("should calculate score correctly with penalty points", () => {
    // 5 penalty points for 1000 words → 100 - (5/1000 * 1000) = 95
    expect(calcLqaScore(5, 1000)).toBe(95);
  });

  it("should calculate score for critical error in small text", () => {
    // 1 critical error (5 pts) in 100 words → 100 - (5/100 * 1000) = 50
    expect(calcLqaScore(5, 100)).toBe(50);
  });

  it("should not go below zero", () => {
    // Massive penalty → clamped at 0
    expect(calcLqaScore(500, 100)).toBe(0);
  });

  it("should return 100 for zero word count", () => {
    expect(calcLqaScore(10, 0)).toBe(100);
  });

  it("should return 100 for negative word count", () => {
    expect(calcLqaScore(10, -5)).toBe(100);
  });

  it("should handle pass threshold check — pass case", () => {
    const score = calcLqaScore(1, 1000); // 99
    expect(score).toBe(99);
    expect(score >= 98).toBe(true); // passes default threshold
  });

  it("should handle pass threshold check — fail case", () => {
    const score = calcLqaScore(3, 1000); // 97
    expect(score).toBe(97);
    expect(score >= 98).toBe(false); // fails default threshold
  });
});

describe("Faz 6: MQM Severity Weights", () => {
  it("critical should be 5 points", () => {
    expect(SEVERITY_WEIGHTS.critical).toBe(5);
  });

  it("major should be 3 points", () => {
    expect(SEVERITY_WEIGHTS.major).toBe(3);
  });

  it("minor should be 1 point", () => {
    expect(SEVERITY_WEIGHTS.minor).toBe(1);
  });

  it("preferential should be 0 points", () => {
    expect(SEVERITY_WEIGHTS.preferential).toBe(0);
  });

  it("should sum penalties correctly for mixed errors", () => {
    const errors = [
      { severity: "critical" },
      { severity: "major" },
      { severity: "minor" },
      { severity: "preferential" },
      { severity: "minor" },
    ];
    const totalPenalty = errors.reduce((sum, e) => sum + (SEVERITY_WEIGHTS[e.severity] || 0), 0);
    expect(totalPenalty).toBe(5 + 3 + 1 + 0 + 1); // 10
  });
});

describe("Faz 6: QS Scorecard Calculation", () => {
  it("should calculate QS with all components", () => {
    // avgLqa=95, passRate=0.8, disputeAcceptanceRateInverse=0.9
    const qs = calcQualityScore(95, 0.8, 0.9);
    expect(qs).not.toBeNull();
    // (95 * 0.7) + (0.8 * 100 * 0.2) + (0.9 * 100 * 0.1) = 66.5 + 16 + 9 = 91.5
    expect(qs!).toBeCloseTo(91.5, 1);
  });

  it("should return null when avgLqa is null", () => {
    const qs = calcQualityScore(null, 1.0, 1.0);
    expect(qs).toBeNull();
  });

  it("should handle perfect scores", () => {
    const qs = calcQualityScore(100, 1.0, 1.0);
    // (100 * 0.7) + (100 * 0.2) + (100 * 0.1) = 70 + 20 + 10 = 100
    expect(qs!).toBeCloseTo(100, 1);
  });

  it("should handle zero pass rate", () => {
    const qs = calcQualityScore(90, 0, 1.0);
    // (90 * 0.7) + (0) + (100 * 0.1) = 63 + 0 + 10 = 73
    expect(qs!).toBeCloseTo(73, 1);
  });

  it("should handle high dispute acceptance rate", () => {
    // disputeAcceptanceRateInverse of 0 means 100% vendor disputes accepted
    const qs = calcQualityScore(90, 0.5, 0);
    // (90 * 0.7) + (50 * 0.2) + (0 * 0.1) = 63 + 10 + 0 = 73
    expect(qs!).toBeCloseTo(73, 1);
  });
});

describe("Faz 6: Dispute Resolution and Score Recalculation", () => {
  it("should recalculate score after accepting dispute (error removed)", () => {
    // Before: 2 critical errors (10 pts) in 1000 words → score = 90
    const before = calcLqaScore(10, 1000);
    expect(before).toBe(90);

    // After accepting dispute: remove 1 critical error → 5 pts in 1000 words → score = 95
    const after = calcLqaScore(5, 1000);
    expect(after).toBe(95);
    expect(after).toBeGreaterThan(before);
  });

  it("should recalculate score after partial resolution (severity reduced)", () => {
    // Before: 1 critical (5) + 1 major (3) = 8 pts in 1000 words → 92
    const before = calcLqaScore(8, 1000);
    expect(before).toBe(92);

    // After: critical downgraded to minor → 1 + 3 = 4 pts → 96
    const after = calcLqaScore(4, 1000);
    expect(after).toBe(96);
    expect(after).toBeGreaterThan(before);
  });

  it("should not change score when dispute is rejected", () => {
    const score = calcLqaScore(10, 1000);
    // Rejection keeps all errors → same score
    const afterReject = calcLqaScore(10, 1000);
    expect(score).toBe(afterReject);
  });
});

describe("Faz 6: RCA Status Transitions", () => {
  const validTransitions: Record<string, string[]> = {
    open: ["in_progress", "closed"],
    in_progress: ["implemented", "closed"],
    implemented: ["verified", "closed"],
    verified: ["closed"],
    closed: [],
  };

  it("should allow open → in_progress", () => {
    expect(validTransitions["open"]).toContain("in_progress");
  });

  it("should allow in_progress → implemented", () => {
    expect(validTransitions["in_progress"]).toContain("implemented");
  });

  it("should allow implemented → verified", () => {
    expect(validTransitions["implemented"]).toContain("verified");
  });

  it("should allow verified → closed", () => {
    expect(validTransitions["verified"]).toContain("closed");
  });

  it("should not allow transitions from closed", () => {
    expect(validTransitions["closed"]).toHaveLength(0);
  });

  it("should allow any status to transition to closed", () => {
    for (const [status, allowed] of Object.entries(validTransitions)) {
      if (status !== "closed") {
        expect(allowed).toContain("closed");
      }
    }
  });
});

describe("Faz 6: Quality Alert Triggering Logic", () => {
  function shouldAlertQsBelowThreshold(avgScore: number): { alert: boolean; severity: string } {
    if (avgScore < 70) return { alert: true, severity: "critical" };
    if (avgScore < 85) return { alert: true, severity: "warning" };
    return { alert: false, severity: "" };
  }

  function shouldAlertConsecutiveFails(results: string[]): boolean {
    return results.length >= 3 && results.slice(0, 3).every(r => r === "fail");
  }

  function shouldAlertHighDisputeRate(totalReports: number, disputeCount: number): boolean {
    if (totalReports === 0) return false;
    return (disputeCount / totalReports) > 0.5;
  }

  it("should trigger critical alert for score below 70", () => {
    const result = shouldAlertQsBelowThreshold(65);
    expect(result.alert).toBe(true);
    expect(result.severity).toBe("critical");
  });

  it("should trigger warning alert for score below 85", () => {
    const result = shouldAlertQsBelowThreshold(80);
    expect(result.alert).toBe(true);
    expect(result.severity).toBe("warning");
  });

  it("should not trigger alert for score 85 or above", () => {
    const result = shouldAlertQsBelowThreshold(90);
    expect(result.alert).toBe(false);
  });

  it("should detect 3 consecutive fails", () => {
    expect(shouldAlertConsecutiveFails(["fail", "fail", "fail"])).toBe(true);
  });

  it("should not alert for 2 consecutive fails", () => {
    expect(shouldAlertConsecutiveFails(["fail", "fail"])).toBe(false);
  });

  it("should not alert if any pass in recent 3", () => {
    expect(shouldAlertConsecutiveFails(["fail", "pass", "fail"])).toBe(false);
  });

  it("should alert for high dispute rate", () => {
    expect(shouldAlertHighDisputeRate(10, 6)).toBe(true);
  });

  it("should not alert for normal dispute rate", () => {
    expect(shouldAlertHighDisputeRate(10, 3)).toBe(false);
  });

  it("should not alert for zero reports", () => {
    expect(shouldAlertHighDisputeRate(0, 0)).toBe(false);
  });
});

describe("Faz 6: Customer Feedback Validation", () => {
  it("should accept valid feedback with all fields", () => {
    const result = createFeedbackSchema.safeParse({
      projectId: 1,
      customerId: 2,
      overallRating: 4,
      accuracyRating: 5,
      timelinessRating: 3,
      communicationRating: 4,
      comments: "Good work overall",
    });
    expect(result.success).toBe(true);
  });

  it("should accept minimal feedback (only overall rating)", () => {
    const result = createFeedbackSchema.safeParse({
      overallRating: 3,
    });
    expect(result.success).toBe(true);
  });

  it("should reject rating below 1", () => {
    const result = createFeedbackSchema.safeParse({
      overallRating: 0,
    });
    expect(result.success).toBe(false);
  });

  it("should reject rating above 5", () => {
    const result = createFeedbackSchema.safeParse({
      overallRating: 6,
    });
    expect(result.success).toBe(false);
  });

  it("should reject missing overall rating", () => {
    const result = createFeedbackSchema.safeParse({
      comments: "No rating provided",
    });
    expect(result.success).toBe(false);
  });
});

describe("Faz 6: LQA Report Schema Validation", () => {
  it("should accept valid LQA report", () => {
    const result = createLqaReportSchema.safeParse({
      vendorId: 1,
      sourceLanguage: "EN",
      targetLanguage: "TR",
      wordCount: 5000,
      passThreshold: 98,
      notes: "Standard LQA evaluation",
    });
    expect(result.success).toBe(true);
  });

  it("should accept minimal LQA report", () => {
    const result = createLqaReportSchema.safeParse({
      vendorId: 1,
    });
    expect(result.success).toBe(true);
  });

  it("should reject missing vendorId", () => {
    const result = createLqaReportSchema.safeParse({
      sourceLanguage: "EN",
    });
    expect(result.success).toBe(false);
  });

  it("should reject invalid pass threshold", () => {
    const result = createLqaReportSchema.safeParse({
      vendorId: 1,
      passThreshold: 150,
    });
    expect(result.success).toBe(false);
  });
});

describe("Faz 6: LQA Error Schema Validation", () => {
  it("should accept valid error", () => {
    const result = createLqaErrorSchema.safeParse({
      category: "Accuracy",
      subcategory: "Mistranslation",
      severity: "critical",
      segmentText: "The cat sat on the mat",
      errorDescription: "Incorrect translation of 'cat'",
    });
    expect(result.success).toBe(true);
  });

  it("should accept minimal error", () => {
    const result = createLqaErrorSchema.safeParse({
      category: "Fluency",
      severity: "minor",
    });
    expect(result.success).toBe(true);
  });

  it("should reject invalid severity", () => {
    const result = createLqaErrorSchema.safeParse({
      category: "Accuracy",
      severity: "extreme",
    });
    expect(result.success).toBe(false);
  });

  it("should reject empty category", () => {
    const result = createLqaErrorSchema.safeParse({
      category: "",
      severity: "minor",
    });
    expect(result.success).toBe(false);
  });
});

describe("Faz 6: Dispute Schema Validation", () => {
  it("should accept valid dispute", () => {
    const result = createDisputeSchema.safeParse({
      vendorId: 1,
      disputeReason: "The error is a valid regional variant",
      vendorEvidence: "See APA style guide section 5.2",
    });
    expect(result.success).toBe(true);
  });

  it("should reject missing dispute reason", () => {
    const result = createDisputeSchema.safeParse({
      vendorId: 1,
      disputeReason: "",
    });
    expect(result.success).toBe(false);
  });

  it("should validate resolution schema", () => {
    const result = resolveDisputeSchema.safeParse({
      resolution: "accepted",
      qlResponse: "Valid point, error removed",
    });
    expect(result.success).toBe(true);
  });

  it("should reject invalid resolution", () => {
    const result = resolveDisputeSchema.safeParse({
      resolution: "maybe",
    });
    expect(result.success).toBe(false);
  });

  it("should accept partial resolution with new severity", () => {
    const result = resolveDisputeSchema.safeParse({
      resolution: "partial",
      qlResponse: "Reduced severity",
      newSeverity: "minor",
    });
    expect(result.success).toBe(true);
  });
});

describe("Faz 6: RCA Schema Validation", () => {
  it("should accept valid RCA report", () => {
    const result = createRcaSchema.safeParse({
      title: "Recurring grammar errors in Amazon translations",
      category: "Translation",
      rootCause: "Vendor lacks formal grammar training in target language",
      impact: "high",
      correctiveAction: "Provide grammar reference materials",
      preventiveAction: "Add grammar quiz to vendor onboarding",
    });
    expect(result.success).toBe(true);
  });

  it("should reject missing title", () => {
    const result = createRcaSchema.safeParse({
      title: "",
      category: "Process",
      rootCause: "Some cause",
    });
    expect(result.success).toBe(false);
  });

  it("should reject missing root cause", () => {
    const result = createRcaSchema.safeParse({
      title: "Some title",
      category: "Process",
      rootCause: "",
    });
    expect(result.success).toBe(false);
  });

  it("should accept valid status update", () => {
    const result = updateRcaSchema.safeParse({
      status: "in_progress",
      correctiveAction: "Updated action plan",
    });
    expect(result.success).toBe(true);
  });

  it("should reject invalid status", () => {
    const result = updateRcaSchema.safeParse({
      status: "cancelled",
    });
    expect(result.success).toBe(false);
  });
});

import { describe, it, expect } from "vitest";
import { z } from "zod";

// ============================================
// VM Experience Tests — Faz 3
// ============================================

// Schemas mirroring the vm.router.ts validation
const reviewActionSchema = z.object({
  action: z.enum(["approve", "reject", "skip"]),
  notes: z.string().optional(),
});

const emailTemplateSchema = z.object({
  name: z.string().min(1),
  subject: z.string().min(1),
  body: z.string().min(1),
  category: z.string().optional(),
});

const sendEmailSchema = z.object({
  vendorIds: z.array(z.number()).min(1),
  subject: z.string().min(1),
  body: z.string().min(1),
  templateId: z.number().optional(),
});

const onboardingUpdateSchema = z.object({
  status: z.enum(["pending", "completed", "skipped"]),
  notes: z.string().optional(),
});

const vmProfileEditSchema = z.object({
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

// ============================================
// 1. Application Review Actions
// ============================================
describe("Application review actions", () => {
  it("validates approve action", () => {
    const result = reviewActionSchema.safeParse({ action: "approve" });
    expect(result.success).toBe(true);
  });

  it("validates reject action with notes", () => {
    const result = reviewActionSchema.safeParse({
      action: "reject",
      notes: "Insufficient experience for the requested language pairs",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.action).toBe("reject");
      expect(result.data.notes).toBeTruthy();
    }
  });

  it("validates skip action", () => {
    const result = reviewActionSchema.safeParse({ action: "skip" });
    expect(result.success).toBe(true);
  });

  it("rejects invalid action", () => {
    const result = reviewActionSchema.safeParse({ action: "hold" });
    expect(result.success).toBe(false);
  });

  it("rejects empty action", () => {
    const result = reviewActionSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

// ============================================
// 2. Dashboard Data Aggregation Logic
// ============================================
describe("VM dashboard aggregation", () => {
  it("calculates pipeline stage counts correctly", () => {
    const vendors = [
      { status: "Active" },
      { status: "Active" },
      { status: "New Application" },
      { status: "CV Review" },
      { status: "Inactive" },
      { status: "Active" },
    ];

    const counts: Record<string, number> = {};
    for (const v of vendors) {
      counts[v.status] = (counts[v.status] || 0) + 1;
    }

    expect(counts["Active"]).toBe(3);
    expect(counts["New Application"]).toBe(1);
    expect(counts["CV Review"]).toBe(1);
    expect(counts["Inactive"]).toBe(1);
  });

  it("calculates average review time", () => {
    const reviews = [
      { submittedAt: "2024-01-01T00:00:00Z", reviewedAt: "2024-01-01T12:00:00Z" }, // 12 hours
      { submittedAt: "2024-01-02T00:00:00Z", reviewedAt: "2024-01-03T00:00:00Z" }, // 24 hours
      { submittedAt: "2024-01-03T00:00:00Z", reviewedAt: "2024-01-03T06:00:00Z" }, // 6 hours
    ];

    const totalHours = reviews.reduce((sum, r) => {
      const diff = new Date(r.reviewedAt).getTime() - new Date(r.submittedAt).getTime();
      return sum + diff / (1000 * 60 * 60);
    }, 0);

    const avgHours = totalHours / reviews.length;
    expect(avgHours).toBe(14); // (12 + 24 + 6) / 3
  });

  it("counts pending applications correctly", () => {
    const applications = [
      { status: "pending" },
      { status: "pending" },
      { status: "approved" },
      { status: "rejected" },
      { status: "pending" },
    ];

    const pendingCount = applications.filter(a => a.status === "pending").length;
    expect(pendingCount).toBe(3);
  });
});

// ============================================
// 3. Capacity Map Calculations
// ============================================
describe("Capacity map calculations", () => {
  it("calculates supply/demand ratio", () => {
    const testCases = [
      { supply: 5, demand: 2, expectedCategory: "well-covered" },     // 2.5x
      { supply: 3, demand: 3, expectedCategory: "adequate" },         // 1.0x
      { supply: 1, demand: 5, expectedCategory: "under-covered" },    // 0.2x
      { supply: 3, demand: 0, expectedCategory: "no-demand" },        // no demand
    ];

    for (const tc of testCases) {
      const ratio = tc.demand > 0 ? tc.supply / tc.demand : (tc.supply > 0 ? 999 : 0);

      let category: string;
      if (tc.demand === 0) category = "no-demand";
      else if (ratio >= 1.5) category = "well-covered";
      else if (ratio >= 0.8) category = "adequate";
      else category = "under-covered";

      expect(category).toBe(tc.expectedCategory);
    }
  });

  it("builds matrix from supply and demand data", () => {
    const supply = [
      { source: "EN", target: "TR", supply: 5 },
      { source: "EN", target: "DE", supply: 3 },
    ];
    const demand = [
      { source: "EN", target: "TR", demand: 2 },
      { source: "EN", target: "DE", demand: 4 },
      { source: "FR", target: "EN", demand: 1 },
    ];

    const supplyMap: Record<string, number> = {};
    const demandMap: Record<string, number> = {};
    const allPairs = new Set<string>();

    for (const s of supply) {
      const key = `${s.source}|${s.target}`;
      supplyMap[key] = s.supply;
      allPairs.add(key);
    }
    for (const d of demand) {
      const key = `${d.source}|${d.target}`;
      demandMap[key] = d.demand;
      allPairs.add(key);
    }

    const matrix = Array.from(allPairs).map(key => {
      const [source, target] = key.split("|");
      const s = supplyMap[key] || 0;
      const d = demandMap[key] || 0;
      const ratio = d > 0 ? s / d : (s > 0 ? 999 : 0);
      return { source, target, supply: s, demand: d, ratio };
    });

    expect(matrix).toHaveLength(3);
    const enTr = matrix.find(m => m.source === "EN" && m.target === "TR");
    expect(enTr).toBeDefined();
    expect(enTr!.supply).toBe(5);
    expect(enTr!.demand).toBe(2);
    expect(enTr!.ratio).toBe(2.5);

    const frEn = matrix.find(m => m.source === "FR" && m.target === "EN");
    expect(frEn).toBeDefined();
    expect(frEn!.supply).toBe(0);
    expect(frEn!.demand).toBe(1);
    expect(frEn!.ratio).toBe(0);
  });
});

// ============================================
// 4. Email Template Validation
// ============================================
describe("Email template CRUD validation", () => {
  it("validates complete email template", () => {
    const result = emailTemplateSchema.safeParse({
      name: "Welcome Email",
      subject: "Welcome {{vendor_name}}!",
      body: "<h1>Welcome {{vendor_name}}</h1><p>We are glad to have you.</p>",
      category: "onboarding",
    });
    expect(result.success).toBe(true);
  });

  it("rejects template with empty name", () => {
    const result = emailTemplateSchema.safeParse({
      name: "",
      subject: "Test",
      body: "Body",
    });
    expect(result.success).toBe(false);
  });

  it("rejects template with empty subject", () => {
    const result = emailTemplateSchema.safeParse({
      name: "Test",
      subject: "",
      body: "Body",
    });
    expect(result.success).toBe(false);
  });

  it("rejects template with empty body", () => {
    const result = emailTemplateSchema.safeParse({
      name: "Test",
      subject: "Subject",
      body: "",
    });
    expect(result.success).toBe(false);
  });

  it("allows template without category", () => {
    const result = emailTemplateSchema.safeParse({
      name: "Test",
      subject: "Subject",
      body: "Body",
    });
    expect(result.success).toBe(true);
  });
});

// ============================================
// 5. Send Email Validation
// ============================================
describe("Send email validation", () => {
  it("validates email with single vendor", () => {
    const result = sendEmailSchema.safeParse({
      vendorIds: [1],
      subject: "Hello",
      body: "Test body",
    });
    expect(result.success).toBe(true);
  });

  it("validates bulk email with template", () => {
    const result = sendEmailSchema.safeParse({
      vendorIds: [1, 2, 3],
      subject: "Announcement",
      body: "<p>Important update</p>",
      templateId: 5,
    });
    expect(result.success).toBe(true);
  });

  it("rejects email with empty vendorIds", () => {
    const result = sendEmailSchema.safeParse({
      vendorIds: [],
      subject: "Hello",
      body: "Body",
    });
    expect(result.success).toBe(false);
  });

  it("rejects email without subject", () => {
    const result = sendEmailSchema.safeParse({
      vendorIds: [1],
      subject: "",
      body: "Body",
    });
    expect(result.success).toBe(false);
  });
});

// ============================================
// 6. Template Variable Replacement
// ============================================
describe("Template variable replacement", () => {
  function replaceVars(template: string, vars: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? "");
  }

  it("replaces vendor_name", () => {
    const result = replaceVars("Hello {{vendor_name}}!", { vendor_name: "Jane" });
    expect(result).toBe("Hello Jane!");
  });

  it("replaces multiple variables", () => {
    const result = replaceVars(
      "Hi {{vendor_name}}, welcome to {{company_name}}. Contact us at {{vendor_email}}.",
      { vendor_name: "John", company_name: "El Turco", vendor_email: "john@test.com" }
    );
    expect(result).toBe("Hi John, welcome to El Turco. Contact us at john@test.com.");
  });

  it("handles missing variables gracefully", () => {
    const result = replaceVars("Hello {{unknown_var}}!", {});
    expect(result).toBe("Hello !");
  });

  it("handles template with no variables", () => {
    const result = replaceVars("No variables here", { vendor_name: "Jane" });
    expect(result).toBe("No variables here");
  });
});

// ============================================
// 7. Onboarding Task Creation
// ============================================
describe("Onboarding task creation", () => {
  const ONBOARDING_TASKS = [
    { taskName: "Welcome email sent", taskType: "email" },
    { taskName: "NDA signed", taskType: "document" },
    { taskName: "Tax form submitted", taskType: "document" },
    { taskName: "Payment info provided", taskType: "profile" },
    { taskName: "First quiz completed", taskType: "quiz" },
    { taskName: "Profile completed", taskType: "profile" },
    { taskName: "First test task assigned", taskType: "task" },
  ];

  it("creates 7 onboarding tasks", () => {
    expect(ONBOARDING_TASKS).toHaveLength(7);
  });

  it("all tasks have taskName and taskType", () => {
    for (const task of ONBOARDING_TASKS) {
      expect(task.taskName).toBeTruthy();
      expect(task.taskType).toBeTruthy();
    }
  });

  it("tasks include email, document, quiz, profile, and task types", () => {
    const types = new Set(ONBOARDING_TASKS.map(t => t.taskType));
    expect(types.has("email")).toBe(true);
    expect(types.has("document")).toBe(true);
    expect(types.has("quiz")).toBe(true);
    expect(types.has("profile")).toBe(true);
    expect(types.has("task")).toBe(true);
  });

  it("validates onboarding task status updates", () => {
    const validUpdate = onboardingUpdateSchema.safeParse({ status: "completed" });
    expect(validUpdate.success).toBe(true);

    const skipUpdate = onboardingUpdateSchema.safeParse({ status: "skipped", notes: "Not applicable" });
    expect(skipUpdate.success).toBe(true);

    const invalidUpdate = onboardingUpdateSchema.safeParse({ status: "cancelled" });
    expect(invalidUpdate.success).toBe(false);
  });

  it("calculates onboarding progress", () => {
    const tasks = [
      { status: "completed" },
      { status: "completed" },
      { status: "pending" },
      { status: "pending" },
      { status: "skipped" },
      { status: "pending" },
      { status: "completed" },
    ];

    const completed = tasks.filter(t => t.status === "completed").length;
    const total = tasks.length;
    const progress = Math.round((completed / total) * 100);

    expect(completed).toBe(3);
    expect(total).toBe(7);
    expect(progress).toBe(43);
  });
});

// ============================================
// 8. VM Profile Edit Validation
// ============================================
describe("VM vendor profile edit validation", () => {
  it("validates partial profile update", () => {
    const result = vmProfileEditSchema.safeParse({
      phone: "+905551234567",
      location: "Istanbul, Turkey",
    });
    expect(result.success).toBe(true);
  });

  it("validates status change", () => {
    const result = vmProfileEditSchema.safeParse({
      status: "Active",
    });
    expect(result.success).toBe(true);
  });

  it("validates complete profile update", () => {
    const result = vmProfileEditSchema.safeParse({
      fullName: "Jane Doe",
      email: "jane@example.com",
      phone: "+1234567890",
      location: "Berlin",
      nativeLanguage: "DE",
      serviceTypes: ["Translation"],
      specializations: ["Legal"],
      experienceYears: 10,
      currency: "EUR",
      notes: "Updated by VM",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid email", () => {
    const result = vmProfileEditSchema.safeParse({
      email: "not-an-email",
    });
    expect(result.success).toBe(false);
  });

  it("validates empty update (no changes)", () => {
    const result = vmProfileEditSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("detects changes between old and new values", () => {
    const existing = {
      fullName: "Jane Doe",
      email: "jane@old.com",
      phone: "+1234567890",
      location: "Berlin",
    };

    const updates = {
      email: "jane@new.com",
      location: "Munich",
    };

    const changes: { field: string; oldValue: any; newValue: any }[] = [];
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined && (existing as any)[key] !== value) {
        changes.push({ field: key, oldValue: (existing as any)[key], newValue: value });
      }
    }

    expect(changes).toHaveLength(2);
    expect(changes[0].field).toBe("email");
    expect(changes[0].oldValue).toBe("jane@old.com");
    expect(changes[0].newValue).toBe("jane@new.com");
    expect(changes[1].field).toBe("location");
    expect(changes[1].oldValue).toBe("Berlin");
    expect(changes[1].newValue).toBe("Munich");
  });
});

// ============================================
// 9. Analytics Calculations
// ============================================
describe("VM analytics calculations", () => {
  it("calculates approval rate", () => {
    const approved = 15;
    const rejected = 5;
    const totalReviewed = approved + rejected;
    const rate = totalReviewed > 0 ? Math.round((approved / totalReviewed) * 100) : 0;
    expect(rate).toBe(75);
  });

  it("handles zero reviews gracefully", () => {
    const totalReviewed = 0;
    const approved = 0;
    const rate = totalReviewed > 0 ? Math.round((approved / totalReviewed) * 100) : 0;
    expect(rate).toBe(0);
  });

  it("groups applications by week", () => {
    const applications = [
      { submittedAt: "2024-01-01T10:00:00Z" },
      { submittedAt: "2024-01-02T10:00:00Z" },
      { submittedAt: "2024-01-08T10:00:00Z" },
      { submittedAt: "2024-01-09T10:00:00Z" },
      { submittedAt: "2024-01-15T10:00:00Z" },
    ];

    function getWeekStart(date: string): string {
      const d = new Date(date);
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      d.setDate(diff);
      return d.toISOString().split("T")[0];
    }

    const weekly: Record<string, number> = {};
    for (const app of applications) {
      const week = getWeekStart(app.submittedAt);
      weekly[week] = (weekly[week] || 0) + 1;
    }

    const weeks = Object.keys(weekly);
    expect(weeks.length).toBeGreaterThanOrEqual(2);
    const total = Object.values(weekly).reduce((sum, c) => sum + c, 0);
    expect(total).toBe(5);
  });
});

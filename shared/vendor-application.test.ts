import { describe, it, expect } from "vitest";
import { z } from "zod";

// Application form validation schema (mirrors server-side)
const applicationSchema = z.object({
  fullName: z.string().min(1).max(200),
  email: z.string().email().max(255),
  phone: z.string().max(50).optional(),
  location: z.string().max(200).optional(),
  timezone: z.string().max(100).optional(),
  website: z.string().max(500).optional(),
  linkedin: z.string().max(500).optional(),
  nativeLanguage: z.string().max(50).optional(),
  languagePairs: z.array(z.object({
    source: z.string(),
    target: z.string(),
    proficiency: z.string().optional(),
  })).optional(),
  serviceTypes: z.array(z.string()).optional(),
  specializations: z.array(z.string()).optional(),
  software: z.array(z.object({
    name: z.string(),
    proficiency: z.string().optional(),
  })).optional(),
  experienceYears: z.number().int().min(0).optional(),
  education: z.string().optional(),
  certifications: z.array(z.string()).optional(),
  ratePerWord: z.any().optional(),
  ratePerHour: z.any().optional(),
  minimumFee: z.any().optional(),
  currency: z.string().max(3).optional(),
});

describe("Vendor application form validation", () => {
  it("validates a complete application", () => {
    const data = {
      fullName: "Jane Doe",
      email: "jane@example.com",
      phone: "+1234567890",
      location: "Berlin, Germany",
      timezone: "UTC+1",
      nativeLanguage: "DE",
      languagePairs: [
        { source: "DE", target: "EN", proficiency: "Professional" },
      ],
      serviceTypes: ["Translation", "Proofreading"],
      specializations: ["Legal", "Medical"],
      software: [{ name: "SDL Trados Studio", proficiency: "Expert" }],
      experienceYears: 10,
      education: "Master's",
      certifications: ["ATA Certified"],
      ratePerWord: 0.12,
      ratePerHour: 45,
      minimumFee: 30,
      currency: "EUR",
    };

    const result = applicationSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it("validates minimum required fields", () => {
    const data = {
      fullName: "John Smith",
      email: "john@example.com",
    };

    const result = applicationSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it("rejects empty name", () => {
    const data = { fullName: "", email: "test@example.com" };
    const result = applicationSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("rejects invalid email", () => {
    const data = { fullName: "Test", email: "not-an-email" };
    const result = applicationSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("rejects missing email", () => {
    const data = { fullName: "Test" };
    const result = applicationSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("validates language pairs structure", () => {
    const data = {
      fullName: "Test",
      email: "t@e.com",
      languagePairs: [
        { source: "EN", target: "FR", proficiency: "Native" },
        { source: "EN", target: "DE" },
      ],
    };
    const result = applicationSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it("rejects negative experience years", () => {
    const data = {
      fullName: "Test",
      email: "t@e.com",
      experienceYears: -1,
    };
    const result = applicationSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("accepts zero experience years", () => {
    const data = {
      fullName: "Test",
      email: "t@e.com",
      experienceYears: 0,
    };
    const result = applicationSchema.safeParse(data);
    expect(result.success).toBe(true);
  });
});

describe("Vendor pipeline stages", () => {
  const STAGES = [
    "New Application", "CV Review", "Quiz Pending", "Quiz Passed",
    "Test Task", "Interview", "NDA Pending", "Active", "Inactive", "Blacklisted",
  ];

  it("has correct number of stages", () => {
    expect(STAGES).toHaveLength(10);
  });

  it("starts with New Application", () => {
    expect(STAGES[0]).toBe("New Application");
  });

  it("ends with Blacklisted", () => {
    expect(STAGES[STAGES.length - 1]).toBe("Blacklisted");
  });

  it("contains all expected stages", () => {
    expect(STAGES).toContain("Quiz Pending");
    expect(STAGES).toContain("Quiz Passed");
    expect(STAGES).toContain("NDA Pending");
    expect(STAGES).toContain("Active");
  });
});

describe("Bulk operations validation", () => {
  it("validates bulk stage change payload", () => {
    const schema = z.object({
      vendorIds: z.array(z.number().int().positive()).min(1),
      status: z.string().min(1),
    });

    expect(schema.safeParse({ vendorIds: [1, 2, 3], status: "Active" }).success).toBe(true);
    expect(schema.safeParse({ vendorIds: [], status: "Active" }).success).toBe(false);
    expect(schema.safeParse({ vendorIds: [1], status: "" }).success).toBe(false);
  });

  it("validates bulk tag payload", () => {
    const schema = z.object({
      vendorIds: z.array(z.number().int().positive()).min(1),
      tags: z.array(z.string()),
      mode: z.enum(["add", "replace"]).optional(),
    });

    expect(schema.safeParse({ vendorIds: [1], tags: ["urgent", "review"] }).success).toBe(true);
    expect(schema.safeParse({ vendorIds: [1], tags: ["urgent"], mode: "add" }).success).toBe(true);
    expect(schema.safeParse({ vendorIds: [1], tags: ["urgent"], mode: "invalid" as any }).success).toBe(false);
  });

  it("validates bulk delete payload", () => {
    const schema = z.object({
      vendorIds: z.array(z.number().int().positive()).min(1),
    });

    expect(schema.safeParse({ vendorIds: [1, 2] }).success).toBe(true);
    expect(schema.safeParse({ vendorIds: [] }).success).toBe(false);
  });
});

describe("CAT discount grid", () => {
  const BANDS = [
    "repetitions", "match_100", "match_95_99", "match_85_94",
    "match_75_84", "match_50_74", "no_match", "machine_translation",
  ];

  it("has 8 discount bands", () => {
    expect(BANDS).toHaveLength(8);
  });

  it("validates discount values are percentages", () => {
    const discounts: Record<string, number> = {
      repetitions: 100,
      match_100: 100,
      match_95_99: 65,
      match_85_94: 40,
      match_75_84: 20,
      match_50_74: 10,
      no_match: 0,
      machine_translation: 25,
    };

    for (const [key, value] of Object.entries(discounts)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(100);
    }
  });
});

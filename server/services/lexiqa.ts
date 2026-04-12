/**
 * LexiQA Integration Service (Stub)
 *
 * Provides LexiQA API integration infrastructure.
 * If LEXIQA_API_KEY env var is set, makes real API calls; otherwise uses stubs.
 */

const LEXIQA_API_KEY = process.env.LEXIQA_API_KEY || "";
const LEXIQA_BASE_URL = process.env.LEXIQA_BASE_URL || "https://api.lexiqa.net/v1";

export interface LexiQACheckResult {
  checkId: string;
  status: "pending" | "completed" | "failed";
  errors: LexiQAError[];
}

export interface LexiQAError {
  category: string;
  subcategory: string;
  severity: "critical" | "major" | "minor" | "preferential";
  segmentText: string;
  errorDescription: string;
  penaltyPoints: number;
}

const SEVERITY_WEIGHTS: Record<string, number> = {
  critical: 5,
  major: 3,
  minor: 1,
  preferential: 0,
};

/**
 * Run a QA check on source and target files.
 * Stub: returns a mock check ID immediately.
 */
export async function runQACheck(
  sourceFile: string,
  targetFile: string,
  sourceLang: string,
  targetLang: string,
): Promise<{ checkId: string; status: string }> {
  if (LEXIQA_API_KEY) {
    try {
      const res = await fetch(`${LEXIQA_BASE_URL}/checks`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${LEXIQA_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sourceFile, targetFile, sourceLang, targetLang }),
      });
      if (!res.ok) throw new Error(`LexiQA API error: ${res.status}`);
      return await res.json();
    } catch (e) {
      console.error("LexiQA API call failed:", e);
      throw e;
    }
  }

  // Stub response
  return {
    checkId: `stub-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    status: "completed",
  };
}

/**
 * Get QA check results by check ID.
 * Stub: returns mock results.
 */
export async function getQAResults(checkId: string): Promise<LexiQACheckResult> {
  if (LEXIQA_API_KEY) {
    try {
      const res = await fetch(`${LEXIQA_BASE_URL}/checks/${checkId}`, {
        headers: { "Authorization": `Bearer ${LEXIQA_API_KEY}` },
      });
      if (!res.ok) throw new Error(`LexiQA API error: ${res.status}`);
      return await res.json();
    } catch (e) {
      console.error("LexiQA API call failed:", e);
      throw e;
    }
  }

  // Stub response
  return {
    checkId,
    status: "completed",
    errors: [],
  };
}

/**
 * Convert LexiQA results into our LQA error format.
 */
export function parseQAReport(results: LexiQACheckResult): LexiQAError[] {
  return results.errors.map(err => ({
    category: err.category || "Accuracy",
    subcategory: err.subcategory || "General",
    severity: err.severity || "minor",
    segmentText: err.segmentText || "",
    errorDescription: err.errorDescription || "",
    penaltyPoints: SEVERITY_WEIGHTS[err.severity] || 1,
  }));
}

/**
 * Check if LexiQA integration is configured.
 */
export function isLexiQAConfigured(): boolean {
  return !!LEXIQA_API_KEY;
}

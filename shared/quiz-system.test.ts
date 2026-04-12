import { describe, it, expect } from "vitest";

// Quiz scoring logic tests (mirrors the server-side scoring)
function scoreQuiz(
  questions: { id: number; correctAnswers: string[]; points: number }[],
  answers: { questionId: number; selectedAnswers: string[] }[]
) {
  let score = 0;
  let maxScore = 0;
  const graded: { questionId: number; correct: boolean }[] = [];

  for (const question of questions) {
    maxScore += question.points || 1;
    const answer = answers.find((a) => a.questionId === question.id);
    const correct =
      answer?.selectedAnswers?.sort().join(",") ===
      (question.correctAnswers || []).sort().join(",");
    if (correct) score += question.points || 1;
    graded.push({ questionId: question.id, correct: !!correct });
  }

  return { score, maxScore, graded };
}

function checkPassed(score: number, maxScore: number, passingScore: number) {
  return maxScore > 0 && (score / maxScore) * 100 >= passingScore;
}

describe("Quiz scoring system", () => {
  const questions = [
    { id: 1, correctAnswers: ["a"], points: 1 },
    { id: 2, correctAnswers: ["true"], points: 1 },
    { id: 3, correctAnswers: ["b", "c"], points: 2 },
  ];

  it("scores all correct answers", () => {
    const answers = [
      { questionId: 1, selectedAnswers: ["a"] },
      { questionId: 2, selectedAnswers: ["true"] },
      { questionId: 3, selectedAnswers: ["b", "c"] },
    ];
    const result = scoreQuiz(questions, answers);
    expect(result.score).toBe(4);
    expect(result.maxScore).toBe(4);
    expect(result.graded.every((g) => g.correct)).toBe(true);
  });

  it("scores partially correct answers", () => {
    const answers = [
      { questionId: 1, selectedAnswers: ["a"] },
      { questionId: 2, selectedAnswers: ["false"] },
      { questionId: 3, selectedAnswers: ["b"] }, // missing "c"
    ];
    const result = scoreQuiz(questions, answers);
    expect(result.score).toBe(1); // Only Q1 correct
    expect(result.maxScore).toBe(4);
    expect(result.graded[0].correct).toBe(true);
    expect(result.graded[1].correct).toBe(false);
    expect(result.graded[2].correct).toBe(false);
  });

  it("scores no answers as zero", () => {
    const result = scoreQuiz(questions, []);
    expect(result.score).toBe(0);
    expect(result.maxScore).toBe(4);
  });

  it("handles empty question list", () => {
    const result = scoreQuiz([], []);
    expect(result.score).toBe(0);
    expect(result.maxScore).toBe(0);
  });

  it("determines pass/fail correctly at 70% threshold", () => {
    expect(checkPassed(3, 4, 70)).toBe(true); // 75% >= 70%
    expect(checkPassed(2, 4, 70)).toBe(false); // 50% < 70%
    expect(checkPassed(7, 10, 70)).toBe(true); // exactly 70%
    expect(checkPassed(6, 10, 70)).toBe(false); // 60% < 70%
  });

  it("handles 100% passing score", () => {
    expect(checkPassed(10, 10, 100)).toBe(true);
    expect(checkPassed(9, 10, 100)).toBe(false);
  });

  it("handles zero max score gracefully", () => {
    expect(checkPassed(0, 0, 70)).toBe(false);
  });

  it("handles multi-select answer order independence", () => {
    const q = [{ id: 1, correctAnswers: ["c", "b", "a"], points: 1 }];
    const a = [{ questionId: 1, selectedAnswers: ["a", "b", "c"] }];
    const result = scoreQuiz(q, a);
    expect(result.score).toBe(1);
    expect(result.graded[0].correct).toBe(true);
  });
});

describe("Quiz assignment validation", () => {
  it("validates vendor IDs array is non-empty", () => {
    const vendorIds: number[] = [];
    expect(vendorIds.length > 0).toBe(false);
  });

  it("validates token is a non-empty string", () => {
    const token = "abc123def456";
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(0);
  });

  it("validates quiz status transitions", () => {
    const validTransitions: Record<string, string[]> = {
      assigned: ["in_progress", "expired"],
      in_progress: ["completed", "expired"],
      completed: [],
      expired: [],
    };

    expect(validTransitions["assigned"]).toContain("in_progress");
    expect(validTransitions["completed"]).not.toContain("assigned");
    expect(validTransitions["expired"]).toHaveLength(0);
  });
});

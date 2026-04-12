/**
 * Quiz domain router — handles quiz CRUD, question management,
 * quiz assignment to vendors, and public quiz-taking endpoints.
 *
 * Admin routes require auth; public quiz routes use token-based access.
 */
import { Router, Request, Response } from "express";
import { z } from "zod";
import { eq, and, desc, asc, sql } from "drizzle-orm";
import { db } from "../storage";
import {
  quizzes,
  quizQuestions,
  quizAssignments,
  quizAttempts,
  vendors,
} from "@shared/schema";
import {
  requireAuth,
  requireRole,
  validate,
  param,
  safeError,
  logAudit,
  getClientIp,
  generateToken,
  sendEmail,
  FROM_EMAIL,
  SITE_PUBLIC_URL,
} from "./shared";

const router = Router();

// ============================================
// ZOD SCHEMAS
// ============================================
const createQuizSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().optional(),
  category: z.string().max(100).optional(),
  timeLimit: z.number().int().positive().optional(),
  passingScore: z.number().int().min(0).max(100).optional(),
  isActive: z.boolean().optional(),
});

const createQuestionSchema = z.object({
  questionText: z.string().min(1),
  questionType: z.enum(["multiple_choice", "true_false"]).optional(),
  options: z.array(z.object({ label: z.string(), value: z.string() })).optional(),
  correctAnswers: z.array(z.string()).optional(),
  points: z.number().int().positive().optional(),
  orderIndex: z.number().int().optional(),
});

const assignQuizSchema = z.object({
  vendorIds: z.array(z.number().int().positive()).min(1),
  expiresAt: z.string().optional(),
});

const submitQuizSchema = z.object({
  answers: z.array(z.object({
    questionId: z.number().int(),
    selectedAnswers: z.array(z.string()),
  })),
});

// ============================================
// ADMIN: QUIZ CRUD
// ============================================
router.get("/quizzes", requireAuth, async (_req: Request, res: Response) => {
  try {
    const allQuizzes = await db.select().from(quizzes).orderBy(desc(quizzes.createdAt));
    // Get question counts per quiz
    const questionCounts = await db
      .select({ quizId: quizQuestions.quizId, count: sql<number>`count(*)::int` })
      .from(quizQuestions)
      .groupBy(quizQuestions.quizId);
    const countMap = new Map(questionCounts.map(q => [q.quizId, q.count]));

    // Get assignment counts per quiz
    const assignmentCounts = await db
      .select({ quizId: quizAssignments.quizId, count: sql<number>`count(*)::int` })
      .from(quizAssignments)
      .groupBy(quizAssignments.quizId);
    const assignMap = new Map(assignmentCounts.map(a => [a.quizId, a.count]));

    const result = allQuizzes.map(q => ({
      ...q,
      questionCount: countMap.get(q.id) || 0,
      assignmentCount: assignMap.get(q.id) || 0,
    }));
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Failed to fetch quizzes", e) });
  }
});

router.post("/quizzes", requireAuth, async (req: Request, res: Response) => {
  try {
    const body = validate(createQuizSchema, req.body, res);
    if (!body) return;
    const [quiz] = await db.insert(quizzes).values({
      ...body,
      createdBy: (req as any).pmUserId,
    }).returning();
    await logAudit((req as any).pmUserId, "create", "quiz", quiz.id, null, quiz, getClientIp(req));
    res.status(201).json(quiz);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Failed to create quiz", e) });
  }
});

router.get("/quizzes/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const id = +param(req, "id");
    const [quiz] = await db.select().from(quizzes).where(eq(quizzes.id, id));
    if (!quiz) return res.status(404).json({ error: "Quiz not found" });
    const questions = await db.select().from(quizQuestions).where(eq(quizQuestions.quizId, id)).orderBy(asc(quizQuestions.orderIndex));
    const assignments = await db.select().from(quizAssignments).where(eq(quizAssignments.quizId, id)).orderBy(desc(quizAssignments.assignedAt));
    res.json({ ...quiz, questions, assignments });
  } catch (e: any) {
    res.status(500).json({ error: safeError("Failed to fetch quiz", e) });
  }
});

router.patch("/quizzes/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const id = +param(req, "id");
    const [updated] = await db.update(quizzes).set({ ...req.body, updatedAt: new Date() }).where(eq(quizzes.id, id)).returning();
    if (!updated) return res.status(404).json({ error: "Quiz not found" });
    res.json(updated);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Failed to update quiz", e) });
  }
});

router.delete("/quizzes/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const id = +param(req, "id");
    await db.delete(quizzes).where(eq(quizzes.id, id));
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: safeError("Failed to delete quiz", e) });
  }
});

// ============================================
// ADMIN: QUESTIONS
// ============================================
router.get("/quizzes/:id/questions", requireAuth, async (req: Request, res: Response) => {
  try {
    const quizId = +param(req, "id");
    const questions = await db.select().from(quizQuestions).where(eq(quizQuestions.quizId, quizId)).orderBy(asc(quizQuestions.orderIndex));
    res.json(questions);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Failed to fetch questions", e) });
  }
});

router.post("/quizzes/:id/questions", requireAuth, async (req: Request, res: Response) => {
  try {
    const quizId = +param(req, "id");
    const body = validate(createQuestionSchema, req.body, res);
    if (!body) return;
    const [question] = await db.insert(quizQuestions).values({ ...body, quizId }).returning();
    res.status(201).json(question);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Failed to create question", e) });
  }
});

router.patch("/quizzes/:quizId/questions/:questionId", requireAuth, async (req: Request, res: Response) => {
  try {
    const questionId = +param(req, "questionId");
    const [updated] = await db.update(quizQuestions).set(req.body).where(eq(quizQuestions.id, questionId)).returning();
    if (!updated) return res.status(404).json({ error: "Question not found" });
    res.json(updated);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Failed to update question", e) });
  }
});

router.delete("/quizzes/:quizId/questions/:questionId", requireAuth, async (req: Request, res: Response) => {
  try {
    const questionId = +param(req, "questionId");
    await db.delete(quizQuestions).where(eq(quizQuestions.id, questionId));
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: safeError("Failed to delete question", e) });
  }
});

// Bulk reorder questions
router.put("/quizzes/:id/questions/reorder", requireAuth, async (req: Request, res: Response) => {
  try {
    const { order } = req.body; // [{id, orderIndex}]
    if (!Array.isArray(order)) return res.status(400).json({ error: "order array required" });
    for (const item of order) {
      await db.update(quizQuestions).set({ orderIndex: item.orderIndex }).where(eq(quizQuestions.id, item.id));
    }
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: safeError("Failed to reorder questions", e) });
  }
});

// ============================================
// ADMIN: ASSIGN QUIZ TO VENDORS
// ============================================
router.post("/quizzes/:id/assign", requireAuth, async (req: Request, res: Response) => {
  try {
    const quizId = +param(req, "id");
    const body = validate(assignQuizSchema, req.body, res);
    if (!body) return;

    const [quiz] = await db.select().from(quizzes).where(eq(quizzes.id, quizId));
    if (!quiz) return res.status(404).json({ error: "Quiz not found" });

    const created: any[] = [];
    for (const vendorId of body.vendorIds) {
      const token = generateToken();
      const [assignment] = await db.insert(quizAssignments).values({
        quizId,
        vendorId,
        assignedBy: (req as any).pmUserId,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
        token,
      }).returning();
      created.push(assignment);

      // Send quiz invitation email to vendor
      const [vendor] = await db.select().from(vendors).where(eq(vendors.id, vendorId));
      if (vendor?.email) {
        const quizUrl = `${SITE_PUBLIC_URL}/#/quiz/${token}`;
        await sendEmail(
          [vendor.email],
          `Quiz Assignment: ${quiz.title}`,
          `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Quiz Assignment</h2>
            <p>Dear ${vendor.fullName},</p>
            <p>You have been assigned the quiz: <strong>${quiz.title}</strong></p>
            ${quiz.description ? `<p>${quiz.description}</p>` : ""}
            ${quiz.timeLimit ? `<p>Time limit: ${quiz.timeLimit} minutes</p>` : ""}
            <p><a href="${quizUrl}" style="background: #3b82f6; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; display: inline-block; margin: 16px 0;">Take Quiz</a></p>
            <p style="color: #666; font-size: 12px;">El Turco Translation Services</p>
          </div>`
        ).catch(() => {}); // Don't fail the assignment if email fails
      }
    }

    await logAudit((req as any).pmUserId, "assign_quiz", "quiz", quizId, null, { vendorIds: body.vendorIds }, getClientIp(req));
    res.json({ assignments: created, count: created.length });
  } catch (e: any) {
    res.status(500).json({ error: safeError("Failed to assign quiz", e) });
  }
});

// ============================================
// ADMIN: VENDOR QUIZ ATTEMPTS
// ============================================
router.get("/vendors/:id/quiz-attempts", requireAuth, async (req: Request, res: Response) => {
  try {
    const vendorId = +param(req, "id");
    const attempts = await db
      .select({
        attempt: quizAttempts,
        quizTitle: quizzes.title,
        quizCategory: quizzes.category,
      })
      .from(quizAttempts)
      .innerJoin(quizzes, eq(quizAttempts.quizId, quizzes.id))
      .where(eq(quizAttempts.vendorId, vendorId))
      .orderBy(desc(quizAttempts.startedAt));
    res.json(attempts.map(a => ({ ...a.attempt, quizTitle: a.quizTitle, quizCategory: a.quizCategory })));
  } catch (e: any) {
    res.status(500).json({ error: safeError("Failed to fetch quiz attempts", e) });
  }
});

// ============================================
// PUBLIC: TAKE QUIZ
// ============================================
router.get("/quiz/:token", async (req: Request, res: Response) => {
  try {
    const token = param(req, "token");
    const [assignment] = await db.select().from(quizAssignments).where(eq(quizAssignments.token, token));
    if (!assignment) return res.status(404).json({ error: "Quiz not found or link expired" });

    // Check if expired
    if (assignment.expiresAt && new Date(assignment.expiresAt) < new Date()) {
      if (assignment.status !== "expired") {
        await db.update(quizAssignments).set({ status: "expired" }).where(eq(quizAssignments.id, assignment.id));
      }
      return res.status(410).json({ error: "This quiz link has expired" });
    }

    // Check if already completed
    if (assignment.status === "completed") {
      const [attempt] = await db.select().from(quizAttempts).where(eq(quizAttempts.assignmentId, assignment.id)).orderBy(desc(quizAttempts.completedAt)).limit(1);
      return res.json({ completed: true, score: attempt?.score, maxScore: attempt?.maxScore, passed: attempt?.passed });
    }

    const [quiz] = await db.select().from(quizzes).where(eq(quizzes.id, assignment.quizId));
    if (!quiz || !quiz.isActive) return res.status(404).json({ error: "Quiz is no longer available" });

    // Get questions without correct answers (public view)
    const questions = await db.select({
      id: quizQuestions.id,
      questionText: quizQuestions.questionText,
      questionType: quizQuestions.questionType,
      options: quizQuestions.options,
      points: quizQuestions.points,
      orderIndex: quizQuestions.orderIndex,
    }).from(quizQuestions).where(eq(quizQuestions.quizId, quiz.id)).orderBy(asc(quizQuestions.orderIndex));

    // Mark as in_progress
    if (assignment.status === "assigned") {
      await db.update(quizAssignments).set({ status: "in_progress" }).where(eq(quizAssignments.id, assignment.id));
    }

    res.json({
      quiz: {
        title: quiz.title,
        description: quiz.description,
        timeLimit: quiz.timeLimit,
        category: quiz.category,
      },
      questions,
      assignmentId: assignment.id,
    });
  } catch (e: any) {
    res.status(500).json({ error: safeError("Failed to load quiz", e) });
  }
});

router.post("/quiz/:token/submit", async (req: Request, res: Response) => {
  try {
    const token = param(req, "token");
    const body = validate(submitQuizSchema, req.body, res);
    if (!body) return;

    const [assignment] = await db.select().from(quizAssignments).where(eq(quizAssignments.token, token));
    if (!assignment) return res.status(404).json({ error: "Quiz assignment not found" });
    if (assignment.status === "completed") return res.status(400).json({ error: "Quiz already submitted" });
    if (assignment.status === "expired") return res.status(410).json({ error: "Quiz has expired" });

    // Get quiz and questions
    const [quiz] = await db.select().from(quizzes).where(eq(quizzes.id, assignment.quizId));
    if (!quiz) return res.status(404).json({ error: "Quiz not found" });

    const questions = await db.select().from(quizQuestions).where(eq(quizQuestions.quizId, quiz.id));
    const questionMap = new Map(questions.map(q => [q.id, q]));

    // Score the answers
    let score = 0;
    let maxScore = 0;
    const gradedAnswers: any[] = [];

    for (const question of questions) {
      maxScore += question.points || 1;
      const answer = body.answers.find(a => a.questionId === question.id);
      const correct = answer?.selectedAnswers?.sort().join(",") === (question.correctAnswers || []).sort().join(",");
      if (correct) score += question.points || 1;
      gradedAnswers.push({
        questionId: question.id,
        selectedAnswers: answer?.selectedAnswers || [],
        correct,
      });
    }

    const passed = quiz.passingScore ? (score / maxScore * 100) >= quiz.passingScore : score > maxScore / 2;

    // Save attempt
    const [attempt] = await db.insert(quizAttempts).values({
      assignmentId: assignment.id,
      vendorId: assignment.vendorId,
      quizId: quiz.id,
      completedAt: new Date(),
      score,
      maxScore,
      passed,
      answers: gradedAnswers,
    }).returning();

    // Update assignment status
    await db.update(quizAssignments).set({ status: "completed" }).where(eq(quizAssignments.id, assignment.id));

    res.json({
      score,
      maxScore,
      percentage: Math.round((score / maxScore) * 100),
      passed,
      passingScore: quiz.passingScore,
    });
  } catch (e: any) {
    res.status(500).json({ error: safeError("Failed to submit quiz", e) });
  }
});

export default router;

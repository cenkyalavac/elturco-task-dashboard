/**
 * Auto-Accept Rule Evaluation Engine
 *
 * Evaluates incoming portal tasks against prioritized rules.
 * Rules use AND logic — all conditions in a rule must match.
 * First matching rule (by priority ASC) wins.
 */

import { db } from "./storage";
import { autoAcceptRules, autoAcceptLog } from "@shared/schema";
import { eq, and, asc, sql } from "drizzle-orm";

// ============================================
// TYPES
// ============================================

export interface RuleCondition {
  field: string;
  operator: string;
  value: any;
}

export interface TaskData {
  project_name?: string;
  client?: string;
  source_language?: string;
  target_language?: string;
  workflow?: string;
  weighted_quantity?: number;
  deadline_offset?: string;
  pm_first_name?: string;
  pm_last_name?: string;
  name?: string;
  [key: string]: any;
}

export interface EvaluationResult {
  matched: boolean;
  ruleId: number | null;
  ruleName: string | null;
  action: string | null;
  matchedConditions: RuleCondition[];
}

// ============================================
// CONDITION EVALUATION
// ============================================

function normalizeString(val: any): string {
  return String(val ?? "").trim().toLowerCase();
}

function parseDeadlineOffset(offsetStr: string): number {
  // Convert duration strings like '1d', '2h', '30m' to minutes
  const match = String(offsetStr).match(/^(\d+(?:\.\d+)?)\s*(d|h|m)$/i);
  if (!match) return 0;
  const num = parseFloat(match[1]);
  switch (match[2].toLowerCase()) {
    case "d": return num * 24 * 60;
    case "h": return num * 60;
    case "m": return num;
    default: return 0;
  }
}

function evaluateCondition(condition: RuleCondition, taskData: TaskData): boolean {
  const { field, operator, value } = condition;
  const taskValue = taskData[field];

  switch (operator) {
    case "equals":
      return normalizeString(taskValue) === normalizeString(value);

    case "not_equals":
      return normalizeString(taskValue) !== normalizeString(value);

    case "contains":
      return normalizeString(taskValue).includes(normalizeString(value));

    case "not_contains":
      return !normalizeString(taskValue).includes(normalizeString(value));

    case "in_set": {
      const set = Array.isArray(value) ? value.map(normalizeString) : [normalizeString(value)];
      return set.includes(normalizeString(taskValue));
    }

    case "not_in_set": {
      const set = Array.isArray(value) ? value.map(normalizeString) : [normalizeString(value)];
      return !set.includes(normalizeString(taskValue));
    }

    case "gt":
      return Number(taskValue ?? 0) > Number(value);

    case "gte":
      return Number(taskValue ?? 0) >= Number(value);

    case "lt":
      return Number(taskValue ?? 0) < Number(value);

    case "lte":
      return Number(taskValue ?? 0) <= Number(value);

    case "more_than": {
      // For deadline_offset: task deadline offset must be more than the configured value
      const taskMinutes = parseDeadlineOffset(String(taskValue ?? "0m"));
      const ruleMinutes = parseDeadlineOffset(String(value));
      return taskMinutes > ruleMinutes;
    }

    case "less_than": {
      const taskMinutes = parseDeadlineOffset(String(taskValue ?? "0m"));
      const ruleMinutes = parseDeadlineOffset(String(value));
      return taskMinutes < ruleMinutes;
    }

    default:
      return false;
  }
}

// ============================================
// ENGINE
// ============================================

/**
 * Evaluate a task against all enabled rules for a given portal source.
 * Returns the first matching rule's action or null if no rules match.
 */
export async function evaluateTask(
  portalSource: string,
  taskData: TaskData,
  options: { dryRun?: boolean; taskId?: string } = {},
): Promise<EvaluationResult> {
  // Get all enabled rules for this portal source, ordered by priority ASC (lower = higher priority)
  const rules = await db
    .select()
    .from(autoAcceptRules)
    .where(
      and(
        eq(autoAcceptRules.enabled, true),
        eq(autoAcceptRules.portalSource, portalSource),
      ),
    )
    .orderBy(asc(autoAcceptRules.priority));

  for (const rule of rules) {
    const conditions = (rule.conditions as RuleCondition[]) || [];

    // All conditions must match (AND logic)
    const allMatch = conditions.length > 0 && conditions.every((c) => evaluateCondition(c, taskData));

    if (allMatch) {
      // Log the match (unless dry run)
      if (!options.dryRun) {
        try {
          await db.insert(autoAcceptLog).values({
            ruleId: rule.id,
            taskId: options.taskId || null,
            portalSource,
            taskData: taskData as any,
            actionTaken: rule.action,
          });

          // Update match count and last matched
          await db
            .update(autoAcceptRules)
            .set({
              matchCount: sql`${autoAcceptRules.matchCount} + 1`,
              lastMatchedAt: new Date(),
            })
            .where(eq(autoAcceptRules.id, rule.id));
        } catch (e) {
          // Don't let logging failures break the engine
          console.error("Auto-accept log error:", e);
        }
      }

      return {
        matched: true,
        ruleId: rule.id,
        ruleName: rule.name,
        action: rule.action,
        matchedConditions: conditions,
      };
    }
  }

  return {
    matched: false,
    ruleId: null,
    ruleName: null,
    action: null,
    matchedConditions: [],
  };
}

/**
 * Process a task through the auto-accept engine and execute the resulting action.
 * Returns the action taken.
 */
export async function processTask(
  portalSource: string,
  taskId: string,
  taskData: TaskData,
): Promise<{ action: string; ruleId: number | null; ruleName: string | null }> {
  const result = await evaluateTask(portalSource, taskData, { taskId });

  if (!result.matched) {
    // No rule matched — default to manual_review
    try {
      await db.insert(autoAcceptLog).values({
        ruleId: null,
        taskId,
        portalSource,
        taskData: taskData as any,
        actionTaken: "manual_review",
      });
    } catch (e) {
      console.error("Auto-accept log error:", e);
    }

    return { action: "manual_review", ruleId: null, ruleName: null };
  }

  return {
    action: result.action!,
    ruleId: result.ruleId,
    ruleName: result.ruleName,
  };
}

/**
 * Get the list of supported condition fields with their allowed operators.
 */
export function getConditionFieldConfig() {
  return [
    { field: "project_name", label: "Project Name", type: "string", operators: ["contains", "not_contains", "equals", "not_equals"] },
    { field: "client", label: "Client", type: "string", operators: ["equals", "contains", "not_equals", "not_contains"] },
    { field: "source_language", label: "Source Language", type: "string_set", operators: ["in_set", "not_in_set", "equals"] },
    { field: "target_language", label: "Target Language", type: "string_set", operators: ["in_set", "not_in_set", "equals"] },
    { field: "workflow", label: "Workflow", type: "string", operators: ["contains", "not_contains", "equals"] },
    { field: "weighted_quantity", label: "Weighted Word Count", type: "number", operators: ["gt", "gte", "lt", "lte"] },
    { field: "deadline_offset", label: "Deadline Offset", type: "duration", operators: ["more_than", "less_than"] },
    { field: "pm_first_name", label: "PM First Name", type: "string", operators: ["contains", "not_contains", "equals"] },
    { field: "pm_last_name", label: "PM Last Name", type: "string", operators: ["not_contains", "contains", "equals"] },
    { field: "name", label: "Task Name", type: "string", operators: ["contains", "not_contains", "equals", "not_equals"] },
  ];
}

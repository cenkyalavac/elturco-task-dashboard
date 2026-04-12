import { describe, it, expect } from "vitest";
import {
  getValidProjectActions,
  validateProjectTransition,
  getValidJobActions,
  validateJobTransition,
  PROJECT_STATES,
  JOB_STATES,
} from "./state-machines";

describe("Project state machine", () => {
  it("returns valid actions for draft state", () => {
    const actions = getValidProjectActions("draft");
    expect(actions).toContain("quote");
    expect(actions).toContain("cancel");
    expect(actions).not.toContain("deliver");
  });

  it("transitions draft -> quoted via quote action", () => {
    const next = validateProjectTransition("draft", "quote");
    expect(next).toBe("quoted");
  });

  it("rejects invalid transition (draft -> deliver)", () => {
    const next = validateProjectTransition("draft", "deliver");
    expect(next).toBeNull();
  });

  it("allows cancel from most states", () => {
    const cancellableStates = ["draft", "quoted", "confirmed", "in_progress", "delivered", "completed", "invoiced"];
    for (const state of cancellableStates) {
      expect(validateProjectTransition(state, "cancel")).toBe("cancelled");
    }
  });

  it("does not allow cancel from closed or cancelled", () => {
    expect(validateProjectTransition("closed", "cancel")).toBeNull();
    expect(validateProjectTransition("cancelled", "cancel")).toBeNull();
  });

  it("returns null for unknown action", () => {
    expect(validateProjectTransition("draft", "nonexistent")).toBeNull();
  });

  it("follows full happy-path lifecycle", () => {
    let state: string = "draft";
    const lifecycle = ["quote", "confirm", "start", "deliver", "complete", "invoice", "close"];
    for (const action of lifecycle) {
      const next = validateProjectTransition(state, action);
      expect(next).not.toBeNull();
      state = next!;
    }
    expect(state).toBe("closed");
  });
});

describe("Job state machine", () => {
  it("returns valid actions for unassigned state", () => {
    const actions = getValidJobActions("unassigned");
    expect(actions).toContain("assign");
    expect(actions).toContain("cancel");
    expect(actions).not.toContain("deliver");
  });

  it("transitions unassigned -> assigned via assign action", () => {
    const next = validateJobTransition("unassigned", "assign");
    expect(next).toBe("assigned");
  });

  it("rejects invalid transition (unassigned -> approve)", () => {
    expect(validateJobTransition("unassigned", "approve")).toBeNull();
  });

  it("allows revision from delivered back to in_progress", () => {
    expect(validateJobTransition("delivered", "revision")).toBe("in_progress");
  });

  it("follows full happy-path lifecycle", () => {
    let state: string = "unassigned";
    const lifecycle = ["assign", "start", "deliver", "approve", "invoice"];
    for (const action of lifecycle) {
      const next = validateJobTransition(state, action);
      expect(next).not.toBeNull();
      state = next!;
    }
    expect(state).toBe("invoiced");
  });
});

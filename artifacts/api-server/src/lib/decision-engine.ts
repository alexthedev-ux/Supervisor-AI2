export type SupervisorState =
  | "PLANNING"
  | "RUNNING"
  | "VALIDATING"
  | "RETRY"
  | "ESCALATING"
  | "CHECKPOINTING"
  | "RESUMING"
  | "DONE"
  | "FAILED"
  | "PAUSED";

export type DecisionInput = {
  workerReportedSuccess: boolean;
  validationPassed: boolean;
  repeatedFailure: boolean;
  attempts: number;
  maxAttempts: number;
  budgetAvailable: boolean;
  strongerWorkerAvailable: boolean;
};

export type Decision = {
  state: SupervisorState;
  reason: string;
};

export function decideNext(input: DecisionInput): Decision {
  if (!input.budgetAvailable) {
    return {
      state: "PAUSED",
      reason: "Budget exhausted before the next worker could run.",
    };
  }
  if (input.validationPassed) {
    return {
      state: "DONE",
      reason: "Independent validation passed.",
    };
  }
  if (input.repeatedFailure && input.strongerWorkerAvailable) {
    return {
      state: "ESCALATING",
      reason: "Repeated failure signature requires a new worker.",
    };
  }
  if (input.attempts < input.maxAttempts) {
    return {
      state: "RETRY",
      reason: "Validation failed within the configured retry limit.",
    };
  }
  return {
    state: "FAILED",
    reason: "Validation failed after the configured retry limit.",
  };
}

export function countAttempts(
  attempts: Array<{ id: string; status: "FAILED" | "SUCCEEDED" }>,
) {
  const unique = new Map(attempts.map((attempt) => [attempt.id, attempt]));
  return {
    total: unique.size,
    failed: [...unique.values()].filter((attempt) => attempt.status === "FAILED")
      .length,
  };
}
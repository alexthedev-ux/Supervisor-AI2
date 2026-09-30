import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import {
  budgetsTable,
  checkpointsTable,
  db,
  eventsTable,
  modelsTable,
  projectsTable,
  providersTable,
  taskAttemptsTable,
  tasksTable,
  usageTable,
  workersTable,
} from "@workspace/db";

export const TASK_STATES = {
  PLANNING: "PLANNING",
  RUNNING: "RUNNING",
  VALIDATING: "VALIDATING",
  RETRY: "RETRY",
  ESCALATING: "ESCALATING",
  CHECKPOINTING: "CHECKPOINTING",
  RESUMING: "RESUMING",
  DONE: "DONE",
  FAILED: "FAILED",
  PAUSED: "PAUSED",
} as const;

type SimulationScenario =
  | "SUCCESS_FIRST_ATTEMPT"
  | "FAIL_THEN_SUCCESS"
  | "ALWAYS_FAIL"
  | "LOOP_DETECTED"
  | "ESCALATION_SUCCESS"
  | "BUDGET_EXCEEDED"
  | "CHECKPOINT_AND_RESUME"
  | string;

const localWorker = {
  id: "worker-local",
  name: "Local Worker",
  model: "local-coding-model",
  provider: "Local OpenAI-compatible",
};
const cloudWorker = {
  id: "worker-cloud",
  name: "Escalation Worker",
  model: "cloud-coding-model",
  provider: "Cloud provider",
};

export async function ensureCatalog(): Promise<void> {
  await db
    .insert(projectsTable)
    .values({
      id: "default-project",
      name: "production / main",
      rootPath: "/workspace",
    })
    .onConflictDoNothing();

  await db
    .insert(providersTable)
    .values([
      {
        id: "provider-local",
        name: "Local OpenAI-compatible",
        kind: "Local endpoint",
        endpoint: "Configured locally",
        status: "READY",
        models: 1,
      },
      {
        id: "provider-cloud",
        name: "Cloud provider",
        kind: "OpenAI-compatible",
        endpoint: "Configured by environment",
        status: "STANDBY",
        models: 1,
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(modelsTable)
    .values([
      {
        id: "model-local",
        name: localWorker.model,
        provider: localWorker.provider,
        contextSize: 32768,
        maxOutput: 8192,
        costPer1k: 0,
        capabilities: ["terminal", "filesystem", "tests"],
      },
      {
        id: "model-cloud",
        name: cloudWorker.model,
        provider: cloudWorker.provider,
        contextSize: 128000,
        maxOutput: 16384,
        costPer1k: 0.012,
        capabilities: ["terminal", "filesystem", "tests", "browser"],
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(workersTable)
    .values([
      {
        id: localWorker.id,
        name: localWorker.name,
        type: "Coding agent",
        provider: localWorker.provider,
        model: localWorker.model,
        status: "READY",
        capabilities: ["filesystem", "terminal", "tests"],
        isLocal: true,
      },
      {
        id: cloudWorker.id,
        name: cloudWorker.name,
        type: "Escalation agent",
        provider: cloudWorker.provider,
        model: cloudWorker.model,
        status: "STANDBY",
        capabilities: ["filesystem", "terminal", "tests", "browser"],
        isLocal: false,
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(budgetsTable)
    .values({
      id: "default",
      taskLimit: 0.5,
      monthlyLimit: 50,
      creditsRemaining: 50,
    })
    .onConflictDoNothing();

  await db
    .insert(usageTable)
    .values({ id: "default" })
    .onConflictDoNothing();
}

function scenarioSteps(scenario: SimulationScenario) {
  const isBudget = scenario === "BUDGET_EXCEEDED";
  const isAlwaysFail = scenario === "ALWAYS_FAIL";
  const needsEscalation =
    scenario === "LOOP_DETECTED" ||
    scenario === "ESCALATION_SUCCESS" ||
    scenario === "CHECKPOINT_AND_RESUME";
  const needsRetry =
    scenario === "FAIL_THEN_SUCCESS" ||
    scenario === "ALWAYS_FAIL" ||
    scenario === "LOOP_DETECTED" ||
    scenario === "ESCALATION_SUCCESS" ||
    scenario === "CHECKPOINT_AND_RESUME" ||
    isBudget;

  const steps: Array<{
    action: string;
    status: string;
    message: string;
    worker?: typeof localWorker;
    attempt?: number;
    tokens?: number;
    cost?: number;
  }> = [
    {
      action: "task_started",
      status: TASK_STATES.RUNNING,
      message: "Supervisor selected a worker and started execution.",
      worker: localWorker,
    },
  ];

  if (needsRetry) {
    steps.push({
      action: "worker_started",
      status: TASK_STATES.RUNNING,
      message: "Local worker began attempt 1.",
      worker: localWorker,
      attempt: 1,
      tokens: 820,
    });
    steps.push({
      action: "worker_completed",
      status: TASK_STATES.VALIDATING,
      message: "Worker reported a result. Supervisor is validating independently.",
      worker: localWorker,
      attempt: 1,
      tokens: 1120,
      cost: 0,
    });
    steps.push({
      action: "validation_failed",
      status: TASK_STATES.RETRY,
      message: isBudget
        ? "Validation failed; next cloud attempt would exceed the task budget."
        : "Tests failed: authentication flow still returns HTTP 500.",
      worker: localWorker,
      attempt: 1,
      tokens: 1120,
      cost: 0,
    });
    if (scenario === "LOOP_DETECTED" || scenario === "ESCALATION_SUCCESS") {
      steps.push({
        action: "retry_started",
        status: TASK_STATES.RUNNING,
        message: "Retry 2/3 with the same structured task context.",
        worker: localWorker,
        attempt: 2,
        tokens: 980,
      });
      steps.push({
        action: "validation_failed",
        status: TASK_STATES.RETRY,
        message: "The same test failure returned with no meaningful progress.",
        worker: localWorker,
        attempt: 2,
        tokens: 1030,
      });
      steps.push({
        action: "loop_detected",
        status: TASK_STATES.CHECKPOINTING,
        message: "Loop detected: repeated failure signature across attempts.",
        worker: localWorker,
        attempt: 2,
      });
      steps.push({
        action: "checkpoint_created",
        status: TASK_STATES.ESCALATING,
        message: "Checkpoint created before switching workers.",
        worker: localWorker,
        attempt: 2,
      });
      steps.push({
        action: "worker_escalated",
        status: TASK_STATES.RUNNING,
        message: "Escalating to a stronger worker with a compact checkpoint.",
        worker: cloudWorker,
        attempt: 3,
        tokens: 1640,
        cost: 0.19,
      });
      steps.push({
        action: "worker_completed",
        status: TASK_STATES.VALIDATING,
        message: "Escalation worker fixed the remaining authentication path.",
        worker: cloudWorker,
        attempt: 3,
        tokens: 2080,
        cost: 0.24,
      });
    } else if (scenario === "CHECKPOINT_AND_RESUME") {
      steps.push({
        action: "checkpoint_created",
        status: TASK_STATES.RESUMING,
        message: "Checkpoint created: backend work is complete; frontend remains.",
        worker: localWorker,
        attempt: 1,
      });
      steps.push({
        action: "worker_escalated",
        status: TASK_STATES.RUNNING,
        message: "Cloud worker resumed from the checkpoint.",
        worker: cloudWorker,
        attempt: 2,
        tokens: 1860,
        cost: 0.21,
      });
      steps.push({
        action: "worker_completed",
        status: TASK_STATES.VALIDATING,
        message: "Cloud worker completed the remaining frontend changes.",
        worker: cloudWorker,
        attempt: 2,
        tokens: 2340,
        cost: 0.28,
      });
    } else if (isAlwaysFail) {
      steps.push({
        action: "retry_started",
        status: TASK_STATES.RUNNING,
        message: "Retry 2/3 with the same structured task context.",
        worker: localWorker,
        attempt: 2,
        tokens: 980,
      });
      steps.push({
        action: "validation_failed",
        status: TASK_STATES.RETRY,
        message: "Tests failed again with the same error signature.",
        worker: localWorker,
        attempt: 2,
        tokens: 1010,
      });
      steps.push({
        action: "retry_started",
        status: TASK_STATES.RUNNING,
        message: "Retry 3/3; retry limit is enforced.",
        worker: localWorker,
        attempt: 3,
        tokens: 890,
      });
      steps.push({
        action: "task_failed",
        status: TASK_STATES.FAILED,
        message: "Task failed after the configured retry limit.",
        worker: localWorker,
        attempt: 3,
        tokens: 920,
      });
    } else if (isBudget) {
      steps.push({
        action: "checkpoint_created",
        status: TASK_STATES.PAUSED,
        message: "Task checkpointed and paused before exceeding its budget.",
        worker: localWorker,
        attempt: 1,
      });
    } else {
      steps.push({
        action: "retry_started",
        status: TASK_STATES.RUNNING,
        message: "Retry 2/3 with the validation failure attached.",
        worker: localWorker,
        attempt: 2,
        tokens: 1240,
      });
      steps.push({
        action: "worker_completed",
        status: TASK_STATES.VALIDATING,
        message: "Worker completed the fix on the second attempt.",
        worker: localWorker,
        attempt: 2,
        tokens: 1560,
      });
    }
  } else {
    steps.push(
      {
        action: "worker_started",
        status: TASK_STATES.RUNNING,
        message: "Local worker began attempt 1.",
        worker: localWorker,
        attempt: 1,
        tokens: 920,
      },
      {
        action: "worker_completed",
        status: TASK_STATES.VALIDATING,
        message: "Worker reported success; Supervisor will not trust the claim alone.",
        worker: localWorker,
        attempt: 1,
        tokens: 1460,
      },
    );
  }

  if (!isAlwaysFail && !isBudget) {
    steps.push(
      {
        action: "validation_started",
        status: TASK_STATES.VALIDATING,
        message: "Running tests, health checks, and browser assertions.",
        worker: needsEscalation ? cloudWorker : localWorker,
        attempt: needsEscalation ? 3 : scenario === "FAIL_THEN_SUCCESS" ? 2 : 1,
        tokens: 420,
      },
      {
        action: "validation_passed",
        status: TASK_STATES.DONE,
        message: "Independent validation passed. The task is actually finished.",
        worker: needsEscalation ? cloudWorker : localWorker,
        attempt: needsEscalation ? 3 : scenario === "FAIL_THEN_SUCCESS" ? 2 : 1,
        tokens: 620,
        cost: needsEscalation ? 0.02 : 0,
      },
      {
        action: "task_completed",
        status: TASK_STATES.DONE,
        message: "Task completed and recorded.",
        worker: needsEscalation ? cloudWorker : localWorker,
        attempt: needsEscalation ? 3 : scenario === "FAIL_THEN_SUCCESS" ? 2 : 1,
      },
    );
  }
  return steps;
}

export async function runSimulation(taskId: string, scenario: SimulationScenario) {
  const [task] = await db.select().from(tasksTable).where(eq(tasksTable.id, taskId));
  if (!task) return undefined;

  const steps = scenarioSteps(scenario);
  const totalAttempts = Math.max(...steps.map((step) => step.attempt ?? 0), 0);
  const failedAttempts = steps.filter((step) => step.action === "validation_failed").length;
  const success = steps.some((step) => step.action === "task_completed");
  const budgetExceeded = scenario === "BUDGET_EXCEEDED";
  const finalStep = steps.at(-1);
  let cumulativeTokens = 0;
  let cumulativeCost = 0;
  const recordedAttempts = new Set<number>();

  await db
    .update(tasksTable)
    .set({
      status: TASK_STATES.RUNNING,
      currentWorker: localWorker.name,
      currentModel: localWorker.model,
      latestMessage: "Supervisor is executing the task.",
      updatedAt: new Date(),
    })
    .where(eq(tasksTable.id, taskId));

  for (const step of steps) {
    cumulativeTokens += step.tokens ?? 0;
    cumulativeCost += step.cost ?? 0;
    await db.insert(eventsTable).values({
      id: randomUUID(),
      taskId,
      timestamp: new Date(),
      worker: step.worker?.name ?? null,
      model: step.worker?.model ?? null,
      action: step.action,
      status: step.status,
      attempt: step.attempt ?? 0,
      tokens: step.tokens ?? 0,
      cost: step.cost ?? 0,
      message: step.message,
    });

    if (
      step.attempt &&
      step.attempt > 0 &&
      !recordedAttempts.has(step.attempt) &&
      ["worker_completed", "validation_failed", "task_failed"].includes(step.action)
    ) {
      recordedAttempts.add(step.attempt);
      await db.insert(taskAttemptsTable).values({
        id: randomUUID(),
        taskId,
        attempt: step.attempt,
        worker: step.worker?.name ?? localWorker.name,
        model: step.worker?.model ?? localWorker.model,
        result: step.message,
        status: step.status,
        tokens: step.tokens ?? 0,
        cost: step.cost ?? 0,
        filesChanged: ["src/auth/login.ts"],
      });
    }

    if (step.action === "checkpoint_created") {
      await db.insert(checkpointsTable).values({
        id: randomUUID(),
        taskId,
        timestamp: new Date(),
        state: step.status,
        worker: step.worker?.name ?? null,
        model: step.worker?.model ?? null,
        completedWork: ["Backend authentication path", "Database migration"],
        remainingWork: budgetExceeded
          ? ["Resume with an allowed cheaper worker"]
          : ["Run final validation"],
        blocker: budgetExceeded ? "Task budget would be exceeded" : null,
        nextAction: budgetExceeded
          ? "Wait for budget approval or resume with a cheaper worker"
          : "Resume from checkpoint with structured context",
        testsPassed: success ? 18 : 0,
        testsFailed: failedAttempts,
        tokens: cumulativeTokens,
        cost: cumulativeCost,
      });
    }
  }

  const finalStatus = finalStep?.status ?? TASK_STATES.FAILED;
  await db
    .update(tasksTable)
    .set({
      status: finalStatus,
      currentWorker: finalStep?.worker?.name ?? localWorker.name,
      currentModel: finalStep?.worker?.model ?? localWorker.model,
      attempts: totalAttempts,
      failedAttempts,
      successfulAttempts: success ? 1 : 0,
      retryCount: Math.max(totalAttempts - 1, 0),
      tokensUsed: cumulativeTokens,
      estimatedCost: cumulativeCost,
      progress: success ? 100 : budgetExceeded ? 42 : finalStatus === TASK_STATES.FAILED ? 68 : 80,
      latestMessage: finalStep?.message ?? task.latestMessage,
      updatedAt: new Date(),
    })
    .where(eq(tasksTable.id, taskId));

  const [currentUsage] = await db
    .select()
    .from(usageTable)
    .where(eq(usageTable.id, "default"));
  await db
    .update(usageTable)
    .set({
      tokensUsed: (currentUsage?.tokensUsed ?? 0) + cumulativeTokens,
      estimatedCost: (currentUsage?.estimatedCost ?? 0) + cumulativeCost,
      localRuns: (currentUsage?.localRuns ?? 0) + totalAttempts - (needsCloud(scenario) ? 1 : 0),
      cloudRuns: (currentUsage?.cloudRuns ?? 0) + (needsCloud(scenario) ? 1 : 0),
      completedTasks: (currentUsage?.completedTasks ?? 0) + (success ? 1 : 0),
    })
    .where(eq(usageTable.id, "default"));

  const [currentBudget] = await db
    .select()
    .from(budgetsTable)
    .where(eq(budgetsTable.id, "default"));
  const monthlyUsed = Math.max(
    currentBudget?.monthlyUsed ?? 0,
    (currentUsage?.estimatedCost ?? 0) + cumulativeCost,
  );
  await db
    .update(budgetsTable)
    .set({
      taskUsed: cumulativeCost,
      monthlyUsed,
      creditsRemaining: Math.max((currentBudget?.monthlyLimit ?? 50) - monthlyUsed, 0),
    })
    .where(eq(budgetsTable.id, "default"));

  return (await db.select().from(tasksTable).where(eq(tasksTable.id, taskId)))[0];
}

function needsCloud(scenario: string): boolean {
  return ["LOOP_DETECTED", "ESCALATION_SUCCESS", "CHECKPOINT_AND_RESUME"].includes(scenario);
}

export async function getTaskEvents(taskId: string) {
  return db
    .select()
    .from(eventsTable)
    .where(eq(eventsTable.taskId, taskId))
    .orderBy(eventsTable.timestamp);
}

export async function getTaskCheckpoints(taskId: string) {
  return db
    .select()
    .from(checkpointsTable)
    .where(eq(checkpointsTable.taskId, taskId))
    .orderBy(desc(checkpointsTable.timestamp));
}
import { randomUUID } from "node:crypto";
import { Router, type IRouter, type Response } from "express";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  budgetsTable,
  checkpointsTable,
  eventsTable,
  modelsTable,
  providersTable,
  tasksTable,
  usageTable,
  workersTable,
} from "@workspace/db";
import {
  CancelTaskParams,
  CreateCheckpointBody,
  CreateCheckpointParams,
  CreateTaskBody,
  GetTaskCheckpointsParams,
  GetTaskEventsParams,
  GetTaskParams,
  PauseTaskParams,
  ResumeTaskParams,
  RunSimulationBody,
  StartTaskParams,
} from "@workspace/api-zod";
import {
  ensureCatalog,
  getTaskCheckpoints,
  getTaskEvents,
  runSimulation,
  TASK_STATES,
} from "../lib/supervisor-engine";

const router: IRouter = Router();

function asIso(value: Date): string {
  return value.toISOString();
}

function toTask(task: typeof tasksTable.$inferSelect) {
  return {
    ...task,
    createdAt: asIso(task.createdAt),
    updatedAt: asIso(task.updatedAt),
  };
}

function toEvent(event: typeof eventsTable.$inferSelect) {
  return { ...event, timestamp: asIso(event.timestamp) };
}

function toCheckpoint(checkpoint: typeof checkpointsTable.$inferSelect) {
  return { ...checkpoint, timestamp: asIso(checkpoint.timestamp) };
}

async function findTask(taskId: string) {
  const [task] = await db.select().from(tasksTable).where(eq(tasksTable.id, taskId));
  return task;
}

router.get("/dashboard", async (_req, res): Promise<void> => {
  await ensureCatalog();
  const tasks = await db.select().from(tasksTable);
  const events = await db.select().from(eventsTable).orderBy(desc(eventsTable.timestamp)).limit(12);
  const [budget] = await db.select().from(budgetsTable).where(eq(budgetsTable.id, "default"));
  const [usage] = await db.select().from(usageTable).where(eq(usageTable.id, "default"));
  res.json({
    activeTasks: tasks.filter((task) => ["RUNNING", "VALIDATING", "RETRY", "ESCALATING", "RESUMING"].includes(task.status)).length,
    completedTasks: tasks.filter((task) => task.status === "DONE").length,
    failedTasks: tasks.filter((task) => task.status === "FAILED").length,
    escalationTasks: tasks.filter((task) => task.status === "ESCALATING" || task.currentWorker === "Escalation Worker").length,
    workersRunning: tasks.filter((task) => task.status === "RUNNING").length,
    tokensUsed: usage?.tokensUsed ?? tasks.reduce((sum, task) => sum + task.tokensUsed, 0),
    cloudCost: usage?.estimatedCost ?? tasks.reduce((sum, task) => sum + task.estimatedCost, 0),
    creditsRemaining: budget?.creditsRemaining ?? 50,
    recentEvents: events.map(toEvent),
  });
});

router.get("/tasks", async (_req, res): Promise<void> => {
  const tasks = await db.select().from(tasksTable).orderBy(desc(tasksTable.updatedAt));
  res.json(tasks.map(toTask));
});

router.post("/tasks", async (req, res): Promise<void> => {
  const parsed = CreateTaskBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  await ensureCatalog();
  const now = new Date();
  const taskId = randomUUID();
  const task = {
    id: taskId,
    projectId: "default-project",
    title: parsed.data.title,
    description: parsed.data.description,
    status: "PENDING",
    scenario: parsed.data.scenario,
    priority: parsed.data.priority ?? "NORMAL",
    budget: parsed.data.budget ?? 0.5,
    createdAt: now,
    updatedAt: now,
    latestMessage: "Task created and waiting to start.",
  };
  await db.insert(tasksTable).values(task);
  await db.insert(eventsTable).values({
    id: randomUUID(),
    taskId,
    timestamp: now,
    action: "task_created",
    status: "PENDING",
    attempt: 0,
    tokens: 0,
    cost: 0,
    message: "Task received by Supervisor.",
  });
  res.status(201).json(toTask(task as typeof tasksTable.$inferSelect));
});

router.get("/tasks/:taskId", async (req, res): Promise<void> => {
  const parsed = GetTaskParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const task = await findTask(parsed.data.taskId);
  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  res.json(toTask(task));
});

async function runTask(taskId: string, res: Response) {
  const task = await findTask(taskId);
  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  const result = await runSimulation(taskId, task.scenario);
  res.json(result ? toTask(result) : { error: "Task not found" });
}

router.post("/tasks/:taskId/start", async (req, res): Promise<void> => {
  const parsed = StartTaskParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  await runTask(parsed.data.taskId, res);
});

router.post("/tasks/:taskId/resume", async (req, res): Promise<void> => {
  const parsed = ResumeTaskParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  await runTask(parsed.data.taskId, res);
});

router.post("/tasks/:taskId/pause", async (req, res): Promise<void> => {
  const parsed = PauseTaskParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [task] = await db
    .update(tasksTable)
    .set({ status: TASK_STATES.PAUSED, latestMessage: "Task paused by operator.", updatedAt: new Date() })
    .where(eq(tasksTable.id, parsed.data.taskId))
    .returning();
  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  res.json(toTask(task));
});

router.post("/tasks/:taskId/cancel", async (req, res): Promise<void> => {
  const parsed = CancelTaskParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [task] = await db
    .update(tasksTable)
    .set({ status: "FAILED", latestMessage: "Task cancelled by operator.", updatedAt: new Date() })
    .where(eq(tasksTable.id, parsed.data.taskId))
    .returning();
  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  res.json(toTask(task));
});

router.get("/tasks/:taskId/events", async (req, res): Promise<void> => {
  const parsed = GetTaskEventsParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  res.json((await getTaskEvents(parsed.data.taskId)).map(toEvent));
});

router.get("/tasks/:taskId/checkpoints", async (req, res): Promise<void> => {
  const parsed = GetTaskCheckpointsParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  res.json((await getTaskCheckpoints(parsed.data.taskId)).map(toCheckpoint));
});

router.post("/tasks/:taskId/checkpoints", async (req, res): Promise<void> => {
  const params = CreateCheckpointParams.safeParse(req.params);
  const body = CreateCheckpointBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const task = await findTask(params.data.taskId);
  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  const [checkpoint] = await db
    .insert(checkpointsTable)
    .values({
      id: randomUUID(),
      taskId: task.id,
      state: task.status,
      worker: task.currentWorker,
      model: task.currentModel,
      completedWork: [],
      remainingWork: [task.latestMessage],
      blocker: body.data.blocker ?? null,
      nextAction: body.data.nextAction,
      testsPassed: 0,
      testsFailed: task.failedAttempts,
      tokens: task.tokensUsed,
      cost: task.estimatedCost,
    })
    .returning();
  res.status(201).json(toCheckpoint(checkpoint));
});

router.post("/simulation/run", async (req, res): Promise<void> => {
  const parsed = RunSimulationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  await ensureCatalog();
  const now = new Date();
  const taskId = randomUUID();
  await db.insert(tasksTable).values({
    id: taskId,
    projectId: "default-project",
    title: parsed.data.title ?? "Fix authentication bug",
    description: "Demonstrate Supervisor control over a coding task.",
    status: "PENDING",
    scenario: parsed.data.scenario,
    priority: "HIGH",
    budget: 0.5,
    createdAt: now,
    updatedAt: now,
    latestMessage: "Simulation ready to run.",
  });
  await db.insert(eventsTable).values({
    id: randomUUID(),
    taskId,
    timestamp: now,
    action: "task_created",
    status: "PENDING",
    attempt: 0,
    tokens: 0,
    cost: 0,
    message: `Simulation created: ${parsed.data.scenario}.`,
  });
  const task = await runSimulation(taskId, parsed.data.scenario);
  res.status(201).json(task ? toTask(task) : { error: "Simulation failed to initialize" });
});

router.get("/workers", async (_req, res): Promise<void> => {
  await ensureCatalog();
  res.json(await db.select().from(workersTable));
});

router.get("/models", async (_req, res): Promise<void> => {
  await ensureCatalog();
  res.json(await db.select().from(modelsTable));
});

router.get("/providers", async (_req, res): Promise<void> => {
  await ensureCatalog();
  res.json(await db.select().from(providersTable));
});

router.get("/usage", async (_req, res): Promise<void> => {
  await ensureCatalog();
  const [usage] = await db.select().from(usageTable).where(eq(usageTable.id, "default"));
  res.json(usage);
});

router.get("/budgets", async (_req, res): Promise<void> => {
  await ensureCatalog();
  const [budget] = await db.select().from(budgetsTable).where(eq(budgetsTable.id, "default"));
  res.json(budget);
});

export default router;
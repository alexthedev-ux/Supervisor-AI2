import { createInsertSchema } from "drizzle-zod";
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const projectsTable = pgTable("supervisor_projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  rootPath: text("root_path").notNull(),
  ...timestamps,
});

export const tasksTable = pgTable("supervisor_tasks", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  status: text("status").notNull(),
  scenario: text("scenario").notNull(),
  priority: text("priority").notNull().default("NORMAL"),
  currentWorker: text("current_worker"),
  currentModel: text("current_model"),
  attempts: integer("attempts").notNull().default(0),
  failedAttempts: integer("failed_attempts").notNull().default(0),
  successfulAttempts: integer("successful_attempts").notNull().default(0),
  retryCount: integer("retry_count").notNull().default(0),
  tokensUsed: integer("tokens_used").notNull().default(0),
  estimatedCost: real("estimated_cost").notNull().default(0),
  budget: real("budget").notNull().default(0.5),
  progress: integer("progress").notNull().default(0),
  latestMessage: text("latest_message").notNull().default("Task queued"),
  ...timestamps,
});

export const taskAttemptsTable = pgTable("supervisor_task_attempts", {
  id: text("id").primaryKey(),
  taskId: text("task_id").notNull(),
  attempt: integer("attempt").notNull(),
  worker: text("worker").notNull(),
  model: text("model").notNull(),
  result: text("result").notNull(),
  status: text("status").notNull(),
  tokens: integer("tokens").notNull().default(0),
  cost: real("cost").notNull().default(0),
  filesChanged: text("files_changed").array().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const eventsTable = pgTable("supervisor_events", {
  id: text("id").primaryKey(),
  taskId: text("task_id").notNull(),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
  worker: text("worker"),
  model: text("model"),
  action: text("action").notNull(),
  status: text("status").notNull(),
  attempt: integer("attempt").notNull().default(0),
  tokens: integer("tokens").notNull().default(0),
  cost: real("cost").notNull().default(0),
  message: text("message").notNull(),
});

export const checkpointsTable = pgTable("supervisor_checkpoints", {
  id: text("id").primaryKey(),
  taskId: text("task_id").notNull(),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
  state: text("state").notNull(),
  worker: text("worker"),
  model: text("model"),
  completedWork: text("completed_work").array().notNull().default([]),
  remainingWork: text("remaining_work").array().notNull().default([]),
  blocker: text("blocker"),
  nextAction: text("next_action").notNull(),
  testsPassed: integer("tests_passed").notNull().default(0),
  testsFailed: integer("tests_failed").notNull().default(0),
  tokens: integer("tokens").notNull().default(0),
  cost: real("cost").notNull().default(0),
});

export const workersTable = pgTable("supervisor_workers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  status: text("status").notNull(),
  capabilities: text("capabilities").array().notNull().default([]),
  isLocal: boolean("is_local").notNull().default(true),
});

export const modelsTable = pgTable("supervisor_models", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  provider: text("provider").notNull(),
  contextSize: integer("context_size").notNull(),
  maxOutput: integer("max_output").notNull(),
  costPer1k: real("cost_per_1k").notNull(),
  capabilities: text("capabilities").array().notNull().default([]),
});

export const providersTable = pgTable("supervisor_providers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  kind: text("kind").notNull(),
  endpoint: text("endpoint").notNull(),
  status: text("status").notNull(),
  models: integer("models").notNull().default(0),
});

export const budgetsTable = pgTable("supervisor_budgets", {
  id: text("id").primaryKey(),
  taskLimit: real("task_limit").notNull().default(0.5),
  taskUsed: real("task_used").notNull().default(0),
  monthlyLimit: real("monthly_limit").notNull().default(50),
  monthlyUsed: real("monthly_used").notNull().default(0),
  creditsRemaining: real("credits_remaining").notNull().default(50),
});

export const usageTable = pgTable("supervisor_usage", {
  id: text("id").primaryKey(),
  tokensUsed: integer("tokens_used").notNull().default(0),
  estimatedCost: real("estimated_cost").notNull().default(0),
  localRuns: integer("local_runs").notNull().default(0),
  cloudRuns: integer("cloud_runs").notNull().default(0),
  completedTasks: integer("completed_tasks").notNull().default(0),
  averageDuration: text("average_duration").notNull().default("—"),
  metadata: jsonb("metadata"),
});

export const insertTaskSchema = createInsertSchema(tasksTable);
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type Task = typeof tasksTable.$inferSelect;
export type TaskEvent = typeof eventsTable.$inferSelect;
export type Checkpoint = typeof checkpointsTable.$inferSelect;
export type Worker = typeof workersTable.$inferSelect;
export type Model = typeof modelsTable.$inferSelect;
export type Provider = typeof providersTable.$inferSelect;
# Supervisor AI

Supervisor AI is a model-agnostic orchestration and control system for AI coding agents. It accepts a software task, routes it to a worker, independently validates the result, and decides whether to finish, retry, checkpoint, escalate, pause, or fail.

## Run the project

```bash
pnpm install
pnpm --filter @workspace/db run push
pnpm --filter @workspace/api-server run dev
```

The web app runs through the managed `artifacts/supervisor-ai: web` workflow. The API is available under `/api`.

## Architecture

- **Frontend**: React + Vite dashboard in `artifacts/supervisor-ai`.
- **API**: Express routes in `artifacts/api-server/src/routes/supervisor.ts`.
- **Supervisor engine**: Explicit states, scenario routing, event creation, checkpoint creation, retries, escalation, validation outcomes, and budget accounting in `artifacts/api-server/src/lib/supervisor-engine.ts`.
- **Persistence**: PostgreSQL with Drizzle ORM in `lib/db/src/schema/supervisor.ts`.
- **Contract**: `lib/api-spec/openapi.yaml` is the source of truth; run codegen after changing it.

## Data model

The MVP persists:

- `supervisor_projects` — project context used by tasks.
- `supervisor_tasks` — current task state, counters, worker routing, progress, tokens, cost, and budget.
- `supervisor_task_attempts` — one record per unique attempt.
- `supervisor_events` — the inspectable execution timeline.
- `supervisor_checkpoints` — structured state passed between workers.
- `supervisor_workers`, `supervisor_models`, `supervisor_providers` — configurable worker catalog.
- `supervisor_budgets`, `supervisor_usage` — task and monthly budget/usage summaries.

## State machine

The engine uses named states instead of scattered strings:

`PLANNING → RUNNING → VALIDATING → DONE`

Failure paths can move through `RETRY`, `CHECKPOINTING`, `ESCALATING`, `RESUMING`, `PAUSED`, or `FAILED`. A worker claiming success never completes a task by itself; independent validation must pass first.

## Supervisor logic

1. Create or receive a task.
2. Select a local worker first when available.
3. Record every important action as an event.
4. Track total, failed, successful, and retry counts separately.
5. Validate worker output independently.
6. Detect repeated failure signatures and create a checkpoint.
7. Retry within the configured attempt limit or escalate to the stronger worker.
8. Enforce the configured task and monthly budgets before cloud spend.
9. Mark the task `DONE` only after validation passes.

## Worker interface and providers

The simulation layer uses the same shape as a generic worker adapter: worker identity, provider, model, capabilities, attempt, result, tokens, and cost. The catalog is provider/model agnostic and currently seeds local and cloud-compatible entries without claiming that an external provider is connected.

## Checkpoints and context management

A checkpoint contains the task, current state, worker/model, completed work, remaining work, blocker, next action, tests passed/failed, tokens, cost, and timestamp. A future worker can resume from this structured state instead of receiving the entire previous conversation.

## Validation

The MVP exposes the validation boundary through simulation events. Simulated validation is explicitly labeled in the UI and event messages. Real test runners and browser validators can be added behind the same boundary; no external AI credentials are required for the current demo.

## Simulation mode

Use **Create demo task** or the simulation controls to run:

- `SUCCESS_FIRST_ATTEMPT`
- `FAIL_THEN_SUCCESS`
- `ALWAYS_FAIL`
- `LOOP_DETECTED`
- `ESCALATION_SUCCESS`
- `BUDGET_EXCEEDED`
- `CHECKPOINT_AND_RESUME`

The default demo, **Fix authentication bug**, shows local execution, repeated validation failures, loop detection, checkpoint creation, escalation, stronger-worker execution, independent validation, and completion.

## API

Core endpoints include:

- `GET /api/dashboard`
- `GET/POST /api/tasks`
- `GET /api/tasks/:taskId`
- `POST /api/tasks/:taskId/start`
- `POST /api/tasks/:taskId/pause`
- `POST /api/tasks/:taskId/resume`
- `POST /api/tasks/:taskId/cancel`
- `GET /api/tasks/:taskId/events`
- `GET/POST /api/tasks/:taskId/checkpoints`
- `POST /api/simulation/run`
- `GET /api/workers`, `/api/models`, `/api/providers`
- `GET /api/usage`, `/api/budgets`

## Development checks

```bash
pnpm run typecheck
pnpm --filter @workspace/api-server run test
pnpm --filter @workspace/supervisor-ai run build
```
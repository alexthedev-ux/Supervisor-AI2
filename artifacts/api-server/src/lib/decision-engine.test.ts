import assert from "node:assert/strict";
import test from "node:test";
import { countAttempts, decideNext } from "./decision-engine.ts";

test("does not mark a worker claim as done when validation fails", () => {
  const decision = decideNext({
    workerReportedSuccess: true,
    validationPassed: false,
    repeatedFailure: false,
    attempts: 1,
    maxAttempts: 3,
    budgetAvailable: true,
    strongerWorkerAvailable: true,
  });

  assert.equal(decision.state, "RETRY");
});

test("escalates after a repeated failure signature", () => {
  const decision = decideNext({
    workerReportedSuccess: false,
    validationPassed: false,
    repeatedFailure: true,
    attempts: 2,
    maxAttempts: 3,
    budgetAvailable: true,
    strongerWorkerAvailable: true,
  });

  assert.equal(decision.state, "ESCALATING");
});

test("stops before exceeding a budget", () => {
  const decision = decideNext({
    workerReportedSuccess: false,
    validationPassed: false,
    repeatedFailure: false,
    attempts: 2,
    maxAttempts: 3,
    budgetAvailable: false,
    strongerWorkerAvailable: true,
  });

  assert.equal(decision.state, "PAUSED");
});

test("counts unique attempts separately from retry actions", () => {
  const counts = countAttempts([
    { id: "attempt-1", status: "FAILED" },
    { id: "attempt-1", status: "FAILED" },
    { id: "attempt-2", status: "SUCCEEDED" },
  ]);

  assert.equal(counts.total, 2);
  assert.equal(counts.failed, 1);
});
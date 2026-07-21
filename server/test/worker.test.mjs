import assert from "node:assert/strict";
import test from "node:test";

import { enforceReplyLayout } from "../src/worker.ts";

const email = {
  threadId: "thread-1",
  subject: "Project update",
  body: "Can you review the plan?",
  fromName: "Morgan",
  userName: "Alex",
};

test("preserves a closing sentence that begins with a sign-off word", () => {
  const result = enforceReplyLayout(
    "Hi Morgan,\n\nThanks, I will review the plan by Monday.",
    email,
  );

  assert.equal(
    result,
    "Hi Morgan,\n\nThanks, I will review the plan by Monday.\n\nBest,\n\nAlex",
  );
});

test("removes a trailing sign-off only with the expected user signature", () => {
  const result = enforceReplyLayout(
    "Hello Morgan,\n\nI will review the plan.\n\nBest regards,\n\nAlex",
    email,
  );

  assert.equal(
    result,
    "Hello Morgan,\n\nI will review the plan.\n\nBest regards,\n\nAlex",
  );
});

test("preserves unexpected text following a sign-off phrase", () => {
  const result = enforceReplyLayout(
    "Hi Morgan,\n\nPlease loop in Legal.\n\nBest regards,\n\nLegal Team",
    email,
  );

  assert.match(result, /Legal Team/);
});

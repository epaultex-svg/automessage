import assert from "node:assert/strict";
import test from "node:test";

import { enforceReplyLayout } from "../src/worker.ts";

const email = {
  threadId: "thread-1",
  subject: "Project update",
  body: "Can you join the call?",
  fromName: "Sarah",
  userName: "Alex",
};

test("preserves body text when greeting and body share one comma-ending line", () => {
  const result = enforceReplyLayout(
    "Hi Sarah, I can join the 3pm call tomorrow,\n\nBest,\n\nAlex",
    email,
  );

  assert.match(result, /I can join the 3pm call tomorrow/);
  assert.equal(
    result,
    "Hi Sarah,\n\nI can join the 3pm call tomorrow,\n\nBest,\n\nAlex",
  );
});

test("preserves multi-word body after greeting addressee on one line", () => {
  const result = enforceReplyLayout(
    "Hello team, please confirm the budget,\n\nThanks,\n\nAlex",
    email,
  );

  assert.match(result, /please confirm the budget/);
});

test("still peels a pure greeting line and rebuilds layout", () => {
  const result = enforceReplyLayout(
    "Dear Hiring Manager,\n\nI am available Friday.\n\nBest regards,\n\nAlex",
    email,
  );

  assert.equal(
    result,
    "Dear Sarah,\n\nI am available Friday.\n\nBest regards,\n\nAlex",
  );
});

test("leaves non-greeting openers intact in the body", () => {
  const result = enforceReplyLayout(
    "Looking forward to our call tomorrow,\n\nBest,\n\nAlex",
    email,
  );

  assert.match(result, /Looking forward to our call tomorrow/);
});

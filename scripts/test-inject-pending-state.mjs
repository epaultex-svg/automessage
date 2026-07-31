/**
 * Regression check for the stuck-loading inject race.
 *
 * Simulates ensureInjected(loading) followed by a fast success update before the
 * Gmail anchor exists, then confirms the eventual inject uses success — not loading.
 *
 * Run: node scripts/test-inject-pending-state.mjs
 */

let pending = null;
let pollRunning = false;
let injectedState = null;

function ensureInjected(state) {
  if (injectedState !== null) {
    pending = null;
    pollRunning = false;
    injectedState = state;
    return;
  }
  pending = state;
  if (pollRunning) return;
  pollRunning = true;
}

function updateInjectedState(state) {
  if (injectedState === null) {
    ensureInjected(state);
    return;
  }
  injectedState = state;
}

function anchorAppears() {
  if (!pollRunning || pending === null) {
    throw new Error("expected an active pending inject");
  }
  injectedState = pending;
  pending = null;
  pollRunning = false;
}

// --- scenario: loading, then fast cache hit, then anchor mounts ---
ensureInjected("loading");
updateInjectedState("success");
if (pending !== "success") {
  throw new Error(`expected pending success, got ${pending}`);
}
anchorAppears();
if (injectedState !== "success") {
  throw new Error(`expected injected success, got ${injectedState}`);
}

// --- scenario: row already present updates in place ---
updateInjectedState("error");
if (injectedState !== "error" || pending !== null) {
  throw new Error("expected in-place error update");
}

console.log("test-inject-pending-state: ok");

/**
 * Regression check: suggestion insert must target the thread reply composer,
 * not an open Compose draft elsewhere on the page.
 *
 * Mirrors the selection rules in getComposerBodyEditable / openComposerIfClosed:
 * - Prefer editables inside the reading pane
 * - Prefer the last pane match (latest message)
 * - Never treat an out-of-pane Compose editable as "already open"
 *
 * Run: node scripts/test-composer-target.mjs
 */

function pickComposerEditable(candidates) {
  const inPane = candidates.filter((c) => c.inPane);
  if (inPane.length === 0) {
    return null;
  }
  return inPane[inPane.length - 1].id;
}

function shouldOpenReply(candidates) {
  return pickComposerEditable(candidates) === null;
}

// Compose draft open + thread reply not open → must open Reply, not use Compose
{
  const candidates = [{ id: "compose-draft", inPane: false }];
  if (pickComposerEditable(candidates) !== null) {
    throw new Error("must not select Compose draft outside reading pane");
  }
  if (!shouldOpenReply(candidates)) {
    throw new Error("must open thread Reply when only Compose is open");
  }
}

// Compose draft + thread reply both open → insert into thread reply (last in pane)
{
  const candidates = [
    { id: "compose-draft", inPane: false },
    { id: "thread-reply", inPane: true },
  ];
  if (pickComposerEditable(candidates) !== "thread-reply") {
    throw new Error("must prefer reading-pane thread reply over Compose");
  }
  if (shouldOpenReply(candidates)) {
    throw new Error("must not re-click Reply when thread composer is open");
  }
}

// Multiple in-pane composers → last (latest message) wins
{
  const candidates = [
    { id: "older-reply", inPane: true },
    { id: "latest-reply", inPane: true },
    { id: "compose-draft", inPane: false },
  ];
  if (pickComposerEditable(candidates) !== "latest-reply") {
    throw new Error("must prefer last reading-pane composer");
  }
}

// Document-order first match would have been Compose if Compose came first —
// confirm we still ignore it when only Compose exists, and prefer pane when both exist
{
  const composeFirst = [
    { id: "compose-draft", inPane: false },
    { id: "thread-reply", inPane: true },
  ];
  // Naive document.querySelector equivalent
  const naiveFirst = composeFirst[0].id;
  if (naiveFirst !== "compose-draft") {
    throw new Error("test setup error");
  }
  if (pickComposerEditable(composeFirst) === naiveFirst) {
    throw new Error("must not follow naive first-match into Compose draft");
  }
}

console.log("test-composer-target: ok");

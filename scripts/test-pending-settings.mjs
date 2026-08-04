/**
 * Regression check: in-card settings must survive arriving before the suggestion
 * row is mounted (slow Gmail anchor).
 *
 * Mirrors setInCardSettings / applyPendingInCardSettings in src/gmail/inject.ts:
 * - Settings fetched while the row is absent are stashed
 * - Mount applies the stash so Save cannot persist DEFAULT_SETTINGS
 * - removeInjected clears the stash so a prior thread cannot leak values
 *
 * Run: node scripts/test-pending-settings.mjs
 */

const DEFAULT_SETTINGS = { model: "gpt-oss-120b:free", tone: "professional" };

let rowPresent = false;
let applied = null;
let pending = null;

function setInCardSettings(settings) {
  if (rowPresent) {
    applied = settings;
    pending = null;
    return;
  }
  pending = settings;
}

function applyPendingOnInject() {
  if (!pending) {
    return;
  }
  applied = pending;
  pending = null;
}

function removeInjected() {
  rowPresent = false;
  applied = null;
  pending = null;
}

function openSettingsForm() {
  return applied ?? DEFAULT_SETTINGS;
}

// --- settings arrive before anchor/row ---
rowPresent = false;
setInCardSettings({ model: "gemma-4-31b-it:free", tone: "friendly" });
if (applied !== null) {
  throw new Error("must not apply settings before row exists");
}
if (!pending || pending.tone !== "friendly") {
  throw new Error("expected pending settings while row is missing");
}

rowPresent = true;
applyPendingOnInject();
if (!applied || applied.model !== "gemma-4-31b-it:free" || applied.tone !== "friendly") {
  throw new Error("inject must apply pending settings");
}
if (pending !== null) {
  throw new Error("pending must clear after apply");
}

const form = openSettingsForm();
if (form.tone !== "friendly" || form.model !== "gemma-4-31b-it:free") {
  throw new Error("settings form must not fall back to defaults after late mount");
}

// --- row already present applies immediately ---
setInCardSettings({ model: "nemotron-3-super:free", tone: "concise" });
if (!applied || applied.tone !== "concise" || pending !== null) {
  throw new Error("expected immediate apply when row exists");
}

// --- navigation clears pending so it cannot leak ---
rowPresent = false;
applied = null;
setInCardSettings({ model: "gemma-4-31b-it:free", tone: "friendly" });
removeInjected();
if (pending !== null) {
  throw new Error("removeInjected must clear pending settings");
}
rowPresent = true;
applyPendingOnInject();
if (applied !== null) {
  throw new Error("cleared pending must not apply on next inject");
}
if (openSettingsForm().tone !== DEFAULT_SETTINGS.tone) {
  throw new Error("without fresh settings fetch, form may use defaults until refetch");
}

console.log("test-pending-settings: ok");

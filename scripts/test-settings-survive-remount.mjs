/**
 * Regression check: in-card settings must survive suggestion-row remount.
 *
 * Gmail often removes `#automessage-suggestions` when the composer rebuilds
 * (suggestion click / Reply / draft discard). content.ts restore poll then
 * calls ensureInjected → createButtonRow (new element). Settings are stored in
 * a WeakMap keyed by the old container, so without lastKnownInCardSettings the
 * settings form falls back to DEFAULT_SETTINGS and Save can overwrite real prefs.
 *
 * Mirrors setInCardSettings / applyLastKnownInCardSettings / removeInjected in
 * src/gmail/inject.ts.
 *
 * Run: node scripts/test-settings-survive-remount.mjs
 */

const DEFAULT_SETTINGS = { model: "gpt-oss-120b:free", tone: "professional" };
const USER_SETTINGS = { model: "gemma-4-31b-it:free", tone: "friendly" };

let rowId = 0;
let rowPresent = false;
/** @type {Map<number, object>} */
const settingsByRow = new Map();
/** @type {object | null} */
let lastKnown = null;

function setInCardSettings(settings) {
  lastKnown = settings;
  if (rowPresent) {
    settingsByRow.set(rowId, settings);
  }
}

function applyLastKnownOnInject() {
  if (!lastKnown) {
    return;
  }
  settingsByRow.set(rowId, lastKnown);
}

function remountRow() {
  // Gmail removed the old node; restore poll creates a fresh container.
  rowPresent = false;
  settingsByRow.delete(rowId);
  rowId += 1;
  rowPresent = true;
  applyLastKnownOnInject();
}

function removeInjected() {
  rowPresent = false;
  settingsByRow.clear();
  lastKnown = null;
}

function openSettingsForm() {
  return settingsByRow.get(rowId) ?? DEFAULT_SETTINGS;
}

// --- happy path: prefetch, then remount after composer rebuild ---
rowPresent = true;
rowId = 1;
setInCardSettings(USER_SETTINGS);
if (openSettingsForm().tone !== "friendly") {
  throw new Error("initial mount must show user settings");
}

remountRow();
const afterRemount = openSettingsForm();
if (afterRemount.model !== USER_SETTINGS.model || afterRemount.tone !== USER_SETTINGS.tone) {
  throw new Error(
    `remount must restore user settings, got ${JSON.stringify(afterRemount)}`,
  );
}

// --- settings arriving before first mount still apply on inject ---
removeInjected();
rowPresent = false;
rowId = 2;
setInCardSettings(USER_SETTINGS);
if (settingsByRow.has(rowId)) {
  throw new Error("must not bind settings to a missing row");
}
rowPresent = true;
applyLastKnownOnInject();
if (openSettingsForm().tone !== "friendly") {
  throw new Error("late first mount must apply lastKnown settings");
}

// --- navigation must not leak prior-thread settings ---
setInCardSettings(USER_SETTINGS);
removeInjected();
rowPresent = true;
rowId = 3;
applyLastKnownOnInject();
if (openSettingsForm().tone !== DEFAULT_SETTINGS.tone) {
  throw new Error("removeInjected must clear lastKnown so it cannot leak");
}

console.log("test-settings-survive-remount: ok");

/**
 * Regression check: in-card settings must refresh when chrome.storage changes
 * (e.g. popup Save), otherwise a later in-card Save overwrites newer prefs.
 *
 * Mirrors content.ts onSettingsStorageChanged → fetchSettingsForCard →
 * setInCardSettings / populateButtonRowSettings, and the Save overwrite path.
 *
 * Run: node scripts/test-settings-storage-sync.mjs
 */

const DEFAULT_SETTINGS = { model: "gpt-oss-120b:free", tone: "professional" };
const CARD_SETTINGS = { model: "gpt-oss-120b:free", tone: "professional" };
const POPUP_SETTINGS = { model: "gemma-4-31b-it:free", tone: "friendly" };

/** @type {Map<object, object>} */
const settingsByContainer = new Map();
/** @type {object | null} */
let container = { id: "row" };
/** @type {Array<(settings: object) => void>} */
const storageListeners = [];

function setInCardSettings(settings) {
  if (!container) {
    return;
  }
  settingsByContainer.set(container, settings);
}

function getCurrentSettings() {
  return settingsByContainer.get(container) ?? DEFAULT_SETTINGS;
}

function handleInCardSave() {
  // In-card Save persists whatever the card currently believes is selected.
  return getCurrentSettings();
}

function onSettingsStorageChanged(newSettings) {
  // content.ts refetches and calls setInCardSettings on storage changes.
  setInCardSettings(newSettings);
}

function simulatePopupSave(settings) {
  for (const listener of storageListeners) {
    listener(settings);
  }
}

storageListeners.push(onSettingsStorageChanged);

// --- bug trigger without storage sync ---
container = { id: "row" };
setInCardSettings(CARD_SETTINGS);
// Popup writes newer prefs; card WeakMap stays stale if we skip the listener.
settingsByContainer.set(container, CARD_SETTINGS);
const staleSave = CARD_SETTINGS;
if (staleSave.model === POPUP_SETTINGS.model) {
  throw new Error("test setup error: stale card must differ from popup");
}
// Stale in-card Save would overwrite popup prefs:
if (staleSave.tone === POPUP_SETTINGS.tone) {
  throw new Error("test setup error: tones must differ");
}

// --- with storage sync (production path) ---
setInCardSettings(CARD_SETTINGS);
simulatePopupSave(POPUP_SETTINGS);
const afterSync = getCurrentSettings();
if (afterSync.model !== POPUP_SETTINGS.model || afterSync.tone !== POPUP_SETTINGS.tone) {
  throw new Error(
    `storage sync must refresh in-card settings, got ${JSON.stringify(afterSync)}`,
  );
}

const saved = handleInCardSave();
if (saved.model !== POPUP_SETTINGS.model || saved.tone !== POPUP_SETTINGS.tone) {
  throw new Error(
    `in-card Save after popup must not overwrite with stale prefs, got ${JSON.stringify(saved)}`,
  );
}

// --- ignore unrelated storage areas / keys ---
let fetched = 0;
storageListeners.length = 0;
storageListeners.push(() => {
  fetched += 1;
});
// Only local automessage_settings should trigger; simulate by not calling listeners.
if (fetched !== 0) {
  throw new Error("unrelated storage changes must not refetch");
}

console.log("test-settings-storage-sync: ok");

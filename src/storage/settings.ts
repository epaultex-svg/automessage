import type { Settings } from "../types";
import {
  CLAUDE_HAIKU_MODEL,
  DEFAULT_SETTINGS,
  QWEN_FREE_MODEL,
} from "../types";

const LOG_PREFIX = "[Automessage/settings]";

const STORAGE_KEY = "automessage_settings";

function normalizeModel(model: string): string {
  return model === QWEN_FREE_MODEL ? CLAUDE_HAIKU_MODEL : model;
}

/**
 * Read settings from chrome.storage.local.
 * Returns DEFAULT_SETTINGS for any missing keys so callers always get a full object.
 */
export async function getSettings(): Promise<Settings> {
  return new Promise((resolve) => {
    chrome.storage.local.get(STORAGE_KEY, (result) => {
      if (chrome.runtime.lastError) {
        console.error(
          LOG_PREFIX,
          "getSettings error:",
          chrome.runtime.lastError.message,
        );
        resolve({ ...DEFAULT_SETTINGS });
        return;
      }
      const stored = result[STORAGE_KEY] as Partial<Settings> | undefined;
      const storedModel =
        stored?.model && stored.model.trim() !== ""
          ? normalizeModel(stored.model)
          : DEFAULT_SETTINGS.model;
      const merged: Settings = {
        model: storedModel,
        tone: stored?.tone ?? DEFAULT_SETTINGS.tone,
      };
      console.debug(LOG_PREFIX, "getSettings ok", {
        model: merged.model,
        tone: merged.tone,
      });
      resolve(merged);
    });
  });
}

/**
 * Merge partial settings into storage.
 */
export async function saveSettings(partial: Partial<Settings>): Promise<void> {
  const current = await getSettings();
  const next: Settings = {
    model:
      partial.model !== undefined && partial.model.trim() !== ""
        ? normalizeModel(partial.model)
        : current.model,
    tone: partial.tone ?? current.tone,
  };
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ [STORAGE_KEY]: next }, () => {
      if (chrome.runtime.lastError) {
        const msg = chrome.runtime.lastError.message ?? "storage write failed";
        console.error(LOG_PREFIX, "saveSettings error:", msg);
        reject(new Error(msg));
        return;
      }
      console.debug(LOG_PREFIX, "saveSettings ok", { model: next.model, tone: next.tone });
      resolve();
    });
  });
}

/**
 * Wipe all extension settings from storage (useful for testing / reset).
 */
export async function clearSettings(): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.remove(STORAGE_KEY, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      console.debug(LOG_PREFIX, "clearSettings ok");
      resolve();
    });
  });
}

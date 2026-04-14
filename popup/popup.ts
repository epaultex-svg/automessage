import type {
  ExtensionMessage,
  GetSettingsRequest,
  SaveSettingsRequest,
  Settings,
  TonePreset,
} from "../src/types";
import { DEFAULT_SETTINGS } from "../src/types";

const LOG_PREFIX = "[Automessage/popup]";

const TONE_OPTIONS: readonly TonePreset[] = ["professional", "friendly", "concise"];

function isSettingsResponse(msg: unknown): msg is { type: "SETTINGS_RESPONSE"; payload: Settings } {
  return (
    typeof msg === "object" &&
    msg !== null &&
    "type" in msg &&
    (msg as { type: string }).type === "SETTINGS_RESPONSE" &&
    "payload" in msg &&
    typeof (msg as { payload: unknown }).payload === "object" &&
    (msg as { payload: Settings }).payload !== null
  );
}

function isSettingsSavedResponse(
  msg: unknown
): msg is { type: "SETTINGS_SAVED"; payload: { success: boolean } } {
  return (
    typeof msg === "object" &&
    msg !== null &&
    "type" in msg &&
    (msg as { type: string }).type === "SETTINGS_SAVED"
  );
}

function parseTone(value: string): TonePreset {
  if (TONE_OPTIONS.includes(value as TonePreset)) {
    return value as TonePreset;
  }
  return DEFAULT_SETTINGS.tone;
}

document.addEventListener("DOMContentLoaded", () => {
  const apiKeyEl = document.getElementById("apiKey");
  const modelEl = document.getElementById("model");
  const toneEl = document.getElementById("tone");
  const statusEl = document.getElementById("status");
  const saveBtn = document.getElementById("saveBtn");

  if (!apiKeyEl || !modelEl || !toneEl || !statusEl || !saveBtn) {
    console.debug(LOG_PREFIX, "Missing required DOM elements");
    return;
  }

  const apiKeyInput = apiKeyEl as HTMLInputElement;
  const modelInput = modelEl as HTMLInputElement;
  const toneSelect = toneEl as HTMLSelectElement;
  const statusDiv = statusEl as HTMLDivElement;
  const saveButton = saveBtn as HTMLButtonElement;

  let statusHideTimer: ReturnType<typeof setTimeout> | undefined;

  function hideStatus(): void {
    statusDiv.textContent = "";
    statusDiv.classList.remove("is-visible", "status--error", "status--success");
  }

  function showStatus(message: string, kind: "error" | "success"): void {
    if (statusHideTimer !== undefined) {
      clearTimeout(statusHideTimer);
      statusHideTimer = undefined;
    }
    statusDiv.textContent = message;
    statusDiv.classList.remove("status--error", "status--success");
    statusDiv.classList.add("is-visible", kind === "error" ? "status--error" : "status--success");
  }

  function applySettings(s: Settings): void {
    apiKeyInput.value = s.apiKey;
    modelInput.value = s.model;
    toneSelect.value = s.tone;
  }

  const getReq: GetSettingsRequest = { type: "GET_SETTINGS" };
  console.debug(LOG_PREFIX, "Sending GET_SETTINGS");
  chrome.runtime.sendMessage(getReq as ExtensionMessage, (response: unknown) => {
    if (chrome.runtime.lastError) {
      console.debug(LOG_PREFIX, "GET_SETTINGS failed", chrome.runtime.lastError.message);
      applySettings(DEFAULT_SETTINGS);
      return;
    }
    if (isSettingsResponse(response)) {
      console.debug(LOG_PREFIX, "SETTINGS_RESPONSE received");
      applySettings(response.payload);
      return;
    }
    console.debug(LOG_PREFIX, "Unexpected GET_SETTINGS response, using defaults", response);
    applySettings(DEFAULT_SETTINGS);
  });

  saveButton.addEventListener("click", () => {
    const apiKey = apiKeyInput.value.trim();
    const model = modelInput.value.trim();
    const tone = parseTone(toneSelect.value);

    if (!apiKey) {
      showStatus("API key is required", "error");
      console.debug(LOG_PREFIX, "Save blocked: empty API key");
      return;
    }

    const saveMsg: SaveSettingsRequest = {
      type: "SAVE_SETTINGS",
      payload: { apiKey, model, tone },
    };

    console.debug(LOG_PREFIX, "Sending SAVE_SETTINGS");
    chrome.runtime.sendMessage(saveMsg as ExtensionMessage, (response: unknown) => {
      if (chrome.runtime.lastError) {
        const errMsg = chrome.runtime.lastError.message ?? "Could not save settings";
        showStatus(errMsg, "error");
        console.debug(LOG_PREFIX, "SAVE_SETTINGS failed", errMsg);
        return;
      }
      if (isSettingsSavedResponse(response) && response.payload.success === false) {
        showStatus("Could not save settings", "error");
        console.debug(LOG_PREFIX, "SAVE_SETTINGS rejected", response);
        return;
      }
      showStatus("Settings saved ✓", "success");
      console.debug(LOG_PREFIX, "SAVE_SETTINGS success");
      statusHideTimer = setTimeout(() => {
        hideStatus();
        statusHideTimer = undefined;
      }, 2000);
    });
  });
});

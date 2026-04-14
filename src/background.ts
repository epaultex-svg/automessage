/**
 * Background service worker.
 * All network calls (OpenRouter) happen here — content scripts only message us.
 * Keep this file free of any DOM access.
 */

import {
  generateReplies,
  getCached,
  setCached,
  AutomessageError,
} from "./ai/openrouter";
import { getSettings, saveSettings } from "./storage/settings";
import { hashEmail } from "./gmail/parser";
import type {
  ExtensionMessage,
  GenerateRepliesRequest,
  SaveSettingsRequest,
} from "./types";

const LOG_PREFIX = "[Automessage/background]";

// Track in-flight requests by email hash so we don't fire duplicate API calls.
const inFlight = new Set<string>();

chrome.runtime.onInstalled.addListener(() => {
  console.debug(LOG_PREFIX, "extension installed / updated");
});

chrome.runtime.onMessage.addListener(
  (
    message: ExtensionMessage,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: ExtensionMessage) => void,
  ) => {
    if (!message?.type) {
      return false;
    }

    console.debug(LOG_PREFIX, "received message", message.type);

    switch (message.type) {
      case "GENERATE_REPLIES":
        handleGenerateReplies(message, sendResponse);
        return true; // keep channel open for async response

      case "GET_SETTINGS":
        handleGetSettings(sendResponse);
        return true;

      case "SAVE_SETTINGS":
        handleSaveSettings(message, sendResponse);
        return true;

      default:
        return false;
    }
  },
);

async function handleGenerateReplies(
  message: GenerateRepliesRequest,
  sendResponse: (response: ExtensionMessage) => void,
): Promise<void> {
  const { threadId, subject, body } = message.payload;
  const hash = hashEmail(subject, body);

  // Return cached result if still fresh
  const cached = getCached(hash);
  if (cached) {
    console.debug(LOG_PREFIX, "cache hit", hash);
    sendResponse({
      type: "REPLIES_SUCCESS",
      payload: { threadId, replies: cached.replies },
    });
    return;
  }

  // Skip if already in flight for this exact content
  if (inFlight.has(hash)) {
    console.debug(LOG_PREFIX, "request already in flight, ignoring", hash);
    return;
  }

  inFlight.add(hash);

  try {
    const settings = await getSettings();
    const result = await generateReplies(message.payload, settings);

    setCached(hash, result);

    sendResponse({
      type: "REPLIES_SUCCESS",
      payload: { threadId, replies: result.replies },
    });
    console.debug(LOG_PREFIX, "generated replies ok for", threadId);
  } catch (err) {
    const msg =
      err instanceof AutomessageError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Unknown error generating replies";

    console.error(LOG_PREFIX, "generateReplies error:", msg);
    sendResponse({
      type: "REPLIES_ERROR",
      payload: { threadId, message: msg },
    });
  } finally {
    inFlight.delete(hash);
  }
}

async function handleGetSettings(
  sendResponse: (response: ExtensionMessage) => void,
): Promise<void> {
  try {
    const settings = await getSettings();
    sendResponse({ type: "SETTINGS_RESPONSE", payload: settings });
  } catch (err) {
    console.error(LOG_PREFIX, "GET_SETTINGS error:", err);
    // Respond with defaults so popup doesn't hang
    const { DEFAULT_SETTINGS } = await import("./types");
    sendResponse({ type: "SETTINGS_RESPONSE", payload: DEFAULT_SETTINGS });
  }
}

async function handleSaveSettings(
  message: SaveSettingsRequest,
  sendResponse: (response: ExtensionMessage) => void,
): Promise<void> {
  try {
    await saveSettings(message.payload);
    sendResponse({ type: "SETTINGS_SAVED", payload: { success: true } });
    console.debug(LOG_PREFIX, "settings saved");
  } catch (err) {
    console.error(LOG_PREFIX, "SAVE_SETTINGS error:", err);
    sendResponse({ type: "SETTINGS_SAVED", payload: { success: false } });
  }
}

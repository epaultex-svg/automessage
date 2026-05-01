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
  AIReplySuggestions,
  ExtensionMessage,
  GenerateRepliesRequest,
  SaveSettingsRequest,
} from "./types";

const LOG_PREFIX = "[Automessage/background]";

// Track in-flight requests by email hash so duplicate messages share the same
// API call while every Chrome message channel still receives a response.
const inFlight = new Map<string, Promise<AIReplySuggestions>>();

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
  const { threadId, subject, body, fromName, fromEmail } = message.payload;
  const hash = hashEmail(subject, body, fromName, fromEmail);

  const cached = getCached(hash);
  if (cached) {
    console.debug(LOG_PREFIX, "cache hit", hash);
    sendResponse({
      type: "REPLIES_SUCCESS",
      payload: { threadId, replies: cached.replies },
    });
    return;
  }

  let request = inFlight.get(hash);
  let ownsRequest = false;

  try {
    if (!request) {
      request = getSettings().then((settings) =>
        generateReplies(message.payload, settings),
      );
      inFlight.set(hash, request);
      ownsRequest = true;
    } else {
      console.debug(LOG_PREFIX, "joining in-flight request", hash);
    }

    const result = await request;

    setCached(hash, result);

    sendResponse({
      type: "REPLIES_SUCCESS",
      payload: { threadId, replies: outcome.replies },
    });
  } else {
    sendResponse({
      type: "REPLIES_ERROR",
      payload: { threadId, message: outcome.message },
    });
  } finally {
    if (ownsRequest && inFlight.get(hash) === request) {
      inFlight.delete(hash);
    }
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

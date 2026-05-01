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

/** Outcome of a single generate run — shared when duplicate requests dedupe. */
type GenerateFlightOutcome =
  | { ok: true; replies: AIReplySuggestions["replies"] }
  | { ok: false; message: string };

// One promise per email-hash: concurrent GENERATE_REPLIES with the same hash await
// the same flight and all receive sendResponse (never leave the channel hanging).
const inFlight = new Map<string, Promise<GenerateFlightOutcome>>();

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

  let flight = inFlight.get(hash);
  if (!flight) {
    flight = (async (): Promise<GenerateFlightOutcome> => {
      try {
        const settings = await getSettings();
        const result = await generateReplies(message.payload, settings);
        setCached(hash, result);
        console.debug(LOG_PREFIX, "generated replies ok for", threadId);
        return { ok: true, replies: result.replies };
      } catch (err) {
        const msg =
          err instanceof AutomessageError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Unknown error generating replies";

        console.error(LOG_PREFIX, "generateReplies error:", msg);
        return { ok: false, message: msg };
      }
    })().finally(() => {
      inFlight.delete(hash);
    });
    inFlight.set(hash, flight);
  } else {
    console.debug(LOG_PREFIX, "deduped concurrent request for hash", hash);
  }

  const outcome = await flight;
  if (outcome.ok) {
    sendResponse({
      type: "REPLIES_SUCCESS",
      payload: { threadId, replies: outcome.replies },
    });
  } else {
    sendResponse({
      type: "REPLIES_ERROR",
      payload: { threadId, message: outcome.message },
    });
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

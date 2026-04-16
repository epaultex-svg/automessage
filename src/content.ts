/**
 * Content script entry point.
 * Runs on https://mail.google.com/* and wires together:
 *   - Gmail thread detection (dom.ts)
 *   - Email parsing (parser.ts)
 *   - Message passing to background (background.ts)
 *   - DOM injection / UI updates (inject.ts)
 */

import { startThreadDetection } from "./gmail/dom";
import { parseCurrentThread } from "./gmail/parser";
import {
  ensureInjected,
  updateInjectedState,
  removeInjected,
  insertIntoComposer,
  setSidebarSettings,
} from "./gmail/inject";
import type {
  ExtensionMessage,
  GenerateRepliesRequest,
  GetSettingsRequest,
  SaveSettingsRequest,
  Settings,
} from "./types";

const LOG_PREFIX = "[Automessage/content]";

// Track the last thread we generated suggestions for so we don't re-request on
// every MutationObserver fire for the same open thread.
let lastGeneratedThreadId: string | null = null;

// ── Bootstrap ─────────────────────────────────────────────────────────────────

function init(): void {
  console.debug(LOG_PREFIX, "content script loaded");

  const stopDetection = startThreadDetection(onThreadChange);

  // Clean up if the content script context is ever torn down
  window.addEventListener("unload", () => {
    stopDetection();
    removeInjected();
  });
}

// ── Thread change handler ─────────────────────────────────────────────────────

function onThreadChange(threadId: string): void {
  console.debug(LOG_PREFIX, "thread changed:", threadId);

  // Always remove previous injection before re-injecting for a new thread
  if (lastGeneratedThreadId !== threadId) {
    removeInjected();
    lastGeneratedThreadId = null;
  }

  // Parse email — slight delay to let Gmail finish rendering the message body
  setTimeout(() => {
    requestSuggestions(threadId);
  }, 600);
}

// ── Core flow: parse → request → render ──────────────────────────────────────

const RETRY_DELAYS_MS = [500, 1500, 3000] as const;

function requestSuggestions(threadId: string, attempt = 0): void {
  const parsed = parseCurrentThread(threadId);

  if (!parsed) {
    const delay = RETRY_DELAYS_MS[attempt];
    if (delay !== undefined && window.location.href.includes(threadId)) {
      setTimeout(() => requestSuggestions(threadId, attempt + 1), delay);
    } else {
      console.debug(LOG_PREFIX, "parseCurrentThread returned null, aborting after retries");
    }
    return;
  }


  const callbacks = makeCallbacks(threadId);

  // Show loading state immediately
  ensureInjected({ status: "loading" }, callbacks);

  // Ask background to generate replies
  const msg: GenerateRepliesRequest = {
    type: "GENERATE_REPLIES",
    payload: parsed,
  };

  chrome.runtime.sendMessage(msg, (response: ExtensionMessage | undefined) => {
    if (chrome.runtime.lastError) {
      console.error(LOG_PREFIX, "sendMessage error:", chrome.runtime.lastError.message);
      updateInjectedState(
        {
          status: "error",
          message: "Extension error — try reloading Gmail.",
        },
        callbacks,
      );
      return;
    }

    if (!response) {
      return;
    }

    if (response.type === "REPLIES_SUCCESS") {
      lastGeneratedThreadId = response.payload.threadId;
      updateInjectedState(
        { status: "success", replies: response.payload.replies },
        callbacks,
      );
    } else if (response.type === "REPLIES_ERROR") {
      updateInjectedState(
        { status: "error", message: response.payload.message },
        callbacks,
      );
    }
  });

  // Pre-fetch settings so sidebar is ready to display
  fetchSettingsForSidebar();
}

// ── Callbacks wired into the UI ───────────────────────────────────────────────

function makeCallbacks(threadId: string) {
  return {
    onSuggestionClick: (text: string) => {
      console.debug(LOG_PREFIX, "inserting suggestion into composer");
      insertIntoComposer(text);
    },

    onRefresh: () => {
      console.debug(LOG_PREFIX, "refresh requested for", threadId);
      lastGeneratedThreadId = null;
      requestSuggestions(threadId);
    },

    onSaveSettings: (settings: Partial<Settings>) => {
      const msg: SaveSettingsRequest = {
        type: "SAVE_SETTINGS",
        payload: settings,
      };
      chrome.runtime.sendMessage(msg, (response: ExtensionMessage | undefined) => {
        if (chrome.runtime.lastError) {
          console.error(LOG_PREFIX, "SAVE_SETTINGS error:", chrome.runtime.lastError.message);
          return;
        }
        if (response?.type === "SETTINGS_SAVED" && response.payload.success) {
          console.debug(LOG_PREFIX, "settings saved, refreshing suggestions");
          // Refresh so new tone/model is used immediately
          lastGeneratedThreadId = null;
          requestSuggestions(threadId);
        }
      });
    },
  };
}

// ── Settings pre-fetch ────────────────────────────────────────────────────────

function fetchSettingsForSidebar(): void {
  const msg: GetSettingsRequest = { type: "GET_SETTINGS" };
  chrome.runtime.sendMessage(msg, (response: ExtensionMessage | undefined) => {
    if (chrome.runtime.lastError || !response) {
      return;
    }
    if (response.type === "SETTINGS_RESPONSE") {
      setSidebarSettings(response.payload);
    }
  });
}

// ── Start ─────────────────────────────────────────────────────────────────────

init();

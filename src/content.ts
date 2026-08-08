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
  setInCardSettings,
  isRowInjected,
} from "./gmail/inject";
import type {
  ExtensionMessage,
  GenerateRepliesRequest,
  GetSettingsRequest,
  SaveSettingsRequest,
  Settings,
  SuggestionState,
} from "./types";

const LOG_PREFIX = "[Automessage/content]";

// How often (ms) to check whether Gmail silently removed the suggestion row.
const RESTORE_POLL_MS = 1200;

// Track the last thread we generated suggestions for so we don't re-request on
// every MutationObserver fire for the same open thread.
let lastGeneratedThreadId: string | null = null;

// The most recent successful reply set — kept so we can restore the row without
// a new API call after a suggestion is selected or Gmail rebuilds its composer DOM.
let lastSuccessState: Extract<SuggestionState, { status: "success" }> | null = null;

// Stable reference to the callbacks for the currently active thread, stored so
// the restore poll can re-inject without creating a new callback closure.
let activeCallbacks: ReturnType<typeof makeCallbacks> | null = null;

// Interval id for the restore poll (null when no thread is active).
let restorePollId: ReturnType<typeof setInterval> | null = null;

// ── Bootstrap ─────────────────────────────────────────────────────────────────

function init(): void {
  console.debug(LOG_PREFIX, "content script loaded");

  const stopDetection = startThreadDetection(onThreadChange);

  // Clean up if the content script context is ever torn down
  window.addEventListener("unload", () => {
    stopDetection();
    removeInjected();
    clearRestorePoll();
  });
}

// ── Thread change handler ─────────────────────────────────────────────────────

function onThreadChange(threadId: string): void {
  console.debug(LOG_PREFIX, "thread changed:", threadId);

  // Always remove previous injection before re-injecting for a new thread
  if (lastGeneratedThreadId !== threadId) {
    removeInjected();
    lastGeneratedThreadId = null;
    lastSuccessState = null;
    activeCallbacks = null;
    clearRestorePoll();
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
  activeCallbacks = callbacks;

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
      updateInjectedState(
        {
          status: "error",
          message:
            "Extension did not respond — try closing and reopening the thread.",
        },
        callbacks,
      );
      return;
    }

    if (response.type === "REPLIES_SUCCESS") {
      lastGeneratedThreadId = response.payload.threadId;
      const successState = {
        status: "success" as const,
        replies: response.payload.replies,
      };
      lastSuccessState = successState;
      updateInjectedState(successState, callbacks);
      startRestorePoll(threadId);
    } else if (response.type === "REPLIES_ERROR") {
      updateInjectedState(
        { status: "error", message: response.payload.message },
        callbacks,
      );
    }
  });

  // Pre-fetch settings so the in-card form is ready to display.
  fetchSettingsForCard();
}

// ── Restore poll ──────────────────────────────────────────────────────────────

/**
 * Polls every RESTORE_POLL_MS to detect when Gmail has silently removed the
 * suggestion row (e.g. when the composer DOM is rebuilt after clicking a reply
 * or after a draft is discarded). Re-injects the last successful state without
 * issuing a new API request.
 */
function startRestorePoll(threadId: string): void {
  clearRestorePoll();
  restorePollId = setInterval(() => {
    if (!window.location.href.includes(threadId) || !lastSuccessState || !activeCallbacks) {
      clearRestorePoll();
      return;
    }
    if (!isRowInjected()) {
      console.debug(LOG_PREFIX, "suggestion row missing — restoring for", threadId);
      ensureInjected(lastSuccessState, activeCallbacks);
      // Remount creates a new container; refresh in-card settings onto it.
      fetchSettingsForCard();
    }
  }, RESTORE_POLL_MS);
}

function clearRestorePoll(): void {
  if (restorePollId !== null) {
    clearInterval(restorePollId);
    restorePollId = null;
  }
}

// ── Callbacks wired into the UI ───────────────────────────────────────────────

function makeCallbacks(threadId: string) {
  return {
    onSuggestionClick: (text: string) => {
      console.debug(LOG_PREFIX, "inserting suggestion into composer");
      insertIntoComposer(text);
      // Gmail may rebuild the reply area DOM when the composer opens, removing
      // our row. Re-assert the suggestion row after a short tick so the user
      // can still select a different reply or see the other options.
      setTimeout(() => {
        if (lastSuccessState && activeCallbacks) {
          ensureInjected(lastSuccessState, activeCallbacks);
          // Remount creates a new container; refresh in-card settings onto it.
          fetchSettingsForCard();
        }
      }, 400);
    },

    onRefresh: () => {
      console.debug(LOG_PREFIX, "refresh requested for", threadId);
      lastGeneratedThreadId = null;
      lastSuccessState = null;
      clearRestorePoll();
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
          lastGeneratedThreadId = null;
          lastSuccessState = null;
          clearRestorePoll();
          requestSuggestions(threadId);
        }
      });
    },
  };
}

// ── Settings pre-fetch ────────────────────────────────────────────────────────

function fetchSettingsForCard(): void {
  const msg: GetSettingsRequest = { type: "GET_SETTINGS" };
  chrome.runtime.sendMessage(msg, (response: ExtensionMessage | undefined) => {
    if (chrome.runtime.lastError || !response) {
      return;
    }
    if (response.type === "SETTINGS_RESPONSE") {
      setInCardSettings(response.payload);
    }
  });
}

// ── Start ─────────────────────────────────────────────────────────────────────

init();

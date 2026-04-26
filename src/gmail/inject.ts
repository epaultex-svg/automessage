/**
 * Manages all DOM injection for the suggestion row and sidebar.
 * Knows about Gmail selectors but delegates rendering to ui/buttons.ts and ui/sidebar.ts.
 *
 * Injection strategy: find a stable anchor point near the reply area, insert
 * our row just above it. Gmail's reply strip can appear in several layouts, so
 * we try multiple anchor selectors in order.
 */

import {
  createButtonRow,
  updateButtonRow,
  CONTAINER_ID,
  ButtonRowCallbacks,
} from "../ui/buttons";
import {
  createSidebar,
  populateSidebar,
  toggleSidebar,
  SIDEBAR_ID,
  SidebarCallbacks,
} from "../ui/sidebar";
import type { Settings, SuggestionState } from "../types";
import { getReplyComposerArea, getComposerBodyEditable } from "./dom";

const LOG_PREFIX = "[Automessage/inject]";

/**
 * Anchor selectors tried in order when deciding where to insert the suggestion row.
 * Comment: these selectors mirror Gmail's current DOM; they may need updating.
 */
const ANCHOR_SELECTORS = [
  ".amn",          // reply action bar (Reply / Reply All / Forward / emoji)
  ".aDh",          // reply strip container (fallback)
  ".btC",          // bottom toolbar row
  ".aic",          // action bar containing Reply button
  ".ip.adB",       // another action row in some layouts
  'div[role="main"] .nH .adn', // fallback: thread content area
] as const;

// How long to wait for anchor to appear in the DOM after thread change (ms)
const ANCHOR_WAIT_TIMEOUT_MS = 5000;
const ANCHOR_POLL_INTERVAL_MS = 250;

export interface InjectCallbacks {
  onSuggestionClick: (text: string) => void;
  onRefresh: () => void;
  onSaveSettings: (settings: Partial<Settings>) => void;
}

interface InjectedComponents {
  row: HTMLDivElement;
  sidebar: HTMLDivElement;
}

let injected: InjectedComponents | null = null;
let anchorPollTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Ensure the suggestion row is present in the DOM.
 * If it already exists for this thread, just update its state.
 * If not, wait for an anchor and inject fresh components.
 */
export function ensureInjected(
  state: SuggestionState,
  callbacks: InjectCallbacks,
): void {
  // Update in place if row already exists in the DOM
  const existing = document.getElementById(CONTAINER_ID) as HTMLDivElement | null;
  if (existing && document.contains(existing)) {
    updateButtonRow(existing, state, makeButtonCallbacks(callbacks));
    return;
  }

  // Clear any previous stale reference
  injected = null;
  clearAnchorPoll();

  waitForAnchorAndInject(state, callbacks);
}

/**
 * Update the state of an already-injected row.
 * No-op if the row isn't in the DOM.
 */
export function updateInjectedState(
  state: SuggestionState,
  callbacks: InjectCallbacks,
): void {
  const container = document.getElementById(CONTAINER_ID) as HTMLDivElement | null;
  if (!container) {
    console.debug(LOG_PREFIX, "updateInjectedState: container not found, skipping");
    return;
  }
  updateButtonRow(container, state, makeButtonCallbacks(callbacks));
}

/**
 * Returns true when the suggestion row is currently present in the live document.
 * Used by content.ts to detect when Gmail has silently removed our row.
 */
export function isRowInjected(): boolean {
  const el = document.getElementById(CONTAINER_ID);
  return el !== null && document.contains(el);
}

/**
 * Remove the injected row and sidebar from the DOM entirely.
 * Called when navigating away from a thread.
 */
export function removeInjected(): void {
  clearAnchorPoll();

  const row = document.getElementById(CONTAINER_ID);
  const sidebar = document.getElementById(SIDEBAR_ID);

  row?.remove();
  sidebar?.remove();
  injected = null;

  console.debug(LOG_PREFIX, "injection removed");
}

/**
 * Populate the inline sidebar with current settings so the user can edit them.
 */
export function setSidebarSettings(settings: Settings): void {
  const sidebar = document.getElementById(SIDEBAR_ID) as HTMLDivElement | null;
  if (sidebar) {
    populateSidebar(sidebar, settings);
  }
}

// ── Composer insertion ────────────────────────────────────────────────────────

/**
 * Click the native Gmail reply button to open the composer (if not open),
 * then insert text into the editable area.
 *
 * Note: execCommand('insertText') is deprecated but remains the most reliable
 * cross-browser way to trigger Gmail's own input handlers. InputEvent fallback
 * is provided for future-proofing.
 */
export function insertIntoComposer(text: string): void {
  // Try to open the composer if it isn't already open
  openComposerIfClosed();

  // Give Gmail a tick to render the composer before we try to type into it
  setTimeout(() => {
    const editable = getComposerBodyEditable();
    if (!editable) {
      console.error(LOG_PREFIX, "composer editable not found");
      return;
    }

    if (!(editable instanceof HTMLElement)) {
      console.error(LOG_PREFIX, "composer editable is not an HTMLElement");
      return;
    }

    editable.focus();

    // Clear any placeholder text first
    const selection = window.getSelection();
    if (selection) {
      const range = document.createRange();
      range.selectNodeContents(editable);
      selection.removeAllRanges();
      selection.addRange(range);
    }

    // Convert plain-text newlines to HTML <br> tags so Gmail's contenteditable
    // renders them as visible line breaks. Escape HTML special chars first.
    const htmlText = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n/g, "<br>");

    // insertHTML is deprecated but is the most reliable way to insert formatted
    // content into Gmail's contenteditable while triggering its own input handlers.
    const inserted = document.execCommand("insertHTML", false, htmlText);
    if (!inserted) {
      // Fallback: set innerHTML directly with the escaped HTML
      editable.innerHTML = htmlText;
      editable.dispatchEvent(new InputEvent("input", { bubbles: true }));
    }

    console.debug(LOG_PREFIX, "text inserted into composer, length:", text.length);
  }, 150);
}

// ── Private helpers ───────────────────────────────────────────────────────────

function openComposerIfClosed(): void {
  // Avoid clicking if composer is already open
  if (getComposerBodyEditable()) {
    return;
  }

  // Gmail's inline reply button (the area showing "Click here to Reply or Forward")
  // Note: this selector may need updating if Gmail changes its DOM
  const replyStubs = [
    'div[data-tooltip="Reply"]',
    'span[data-tooltip="Reply"]',
    '[aria-label="Reply"]',
    ".reply-stub",
  ];

  for (const sel of replyStubs) {
    const btn = document.querySelector<HTMLElement>(sel);
    if (btn) {
      btn.click();
      console.debug(LOG_PREFIX, "clicked reply stub:", sel);
      return;
    }
  }

  // Try the reply area itself — clicking it often opens the composer
  const area = getReplyComposerArea();
  if (area instanceof HTMLElement) {
    area.click();
    console.debug(LOG_PREFIX, "clicked reply composer area");
  }
}

function waitForAnchorAndInject(
  state: SuggestionState,
  callbacks: InjectCallbacks,
): void {
  const startedAt = Date.now();

  const attempt = () => {
    const anchor = findAnchor();

    if (anchor) {
      clearAnchorPoll();
      doInject(anchor, state, callbacks);
      return;
    }

    if (Date.now() - startedAt > ANCHOR_WAIT_TIMEOUT_MS) {
      clearAnchorPoll();
      console.debug(LOG_PREFIX, "anchor not found within timeout; giving up");
    }
  };

  attempt(); // try immediately
  if (!injected) {
    anchorPollTimer = setInterval(attempt, ANCHOR_POLL_INTERVAL_MS);
  }
}

function findAnchor(): Element | null {
  for (const sel of ANCHOR_SELECTORS) {
    // Use the LAST matching element so we target the most recent (visible)
    // message in the thread, not a collapsed earlier message.
    const all = document.querySelectorAll(sel);
    const el = all.length > 0 ? all[all.length - 1] : null;
    if (el) {
      return el;
    }
  }
  return null;
}

function doInject(
  anchor: Element,
  initialState: SuggestionState,
  callbacks: InjectCallbacks,
): void {
  const sidebarCallbacks: SidebarCallbacks = {
    onSave: callbacks.onSaveSettings,
  };

  const sidebar = createSidebar(sidebarCallbacks);

  const buttonCallbacks = makeButtonCallbacks(callbacks);
  const row = createButtonRow(buttonCallbacks);

  // Append row inside .amn so suggestion pills appear on the same flex line
  // as Reply / Reply All / Forward. The parent is display:block so inserting
  // after .amn would put the row on a separate line below the reply strip.
  anchor.appendChild(row);
  // Sidebar sits before .amn's parent so it expands as a full-width panel
  // above the reply bar without disrupting the inline button layout.
  anchor.parentElement?.insertAdjacentElement("beforebegin", sidebar);

  injected = { row, sidebar };

  // Render the actual initial state
  updateButtonRow(row, initialState, buttonCallbacks);

  console.debug(LOG_PREFIX, "injected into anchor:", anchor.className);
}

function makeButtonCallbacks(callbacks: InjectCallbacks): ButtonRowCallbacks {
  return {
    onSuggestionClick: callbacks.onSuggestionClick,
    onRefresh: callbacks.onRefresh,
    onSettingsToggle: () => {
      const sidebar = document.getElementById(SIDEBAR_ID) as HTMLDivElement | null;
      if (sidebar) {
        toggleSidebar(sidebar);
      }
    },
  };
}

function clearAnchorPoll(): void {
  if (anchorPollTimer !== null) {
    clearInterval(anchorPollTimer);
    anchorPollTimer = null;
  }
}

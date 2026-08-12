/**
 * Manages DOM injection for the suggestion row.
 * Knows about Gmail selectors but delegates rendering to ui/buttons.ts.
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
  populateButtonRowSettings,
} from "../ui/buttons";
import type { Settings, SuggestionState } from "../types";
import {
  getReplyComposerArea,
  getComposerBodyEditable,
  getLatestMessageBody,
} from "./dom";

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

const NATIVE_SUGGESTED_REPLY_SELECTORS = [
  ".mVCoBd", // outer Google Suggested reply block observed in Gmail
  ".vIQNqd", // inner Google Suggested reply card wrapper
  'div[role="toolbar"][aria-label="Suggested replies"]', // simple Gmail suggested-reply pills
] as const;
const NATIVE_SUGGESTED_REPLY_LABELS = [
  "Suggested reply",
  "Suggested replies",
] as const;
const NATIVE_SUGGESTED_REPLY_BUTTON_SELECTOR =
  'button[aria-label^="Suggested reply,"]';
const NATIVE_HIDDEN_ATTR = "data-automessage-hidden-native-suggestion";

const MESSAGE_BODY_SELECTORS = [
  ".a3s.aiL",
  ".a3s",
  ".ii.gt",
] as const;

const MESSAGE_CONTAINER_SELECTORS = [
  ".gA.gt.acV",
  ".gA.gt",
  ".adn",
  ".gs",
] as const;

const ALIGNED_FLAG_ATTR = "data-automessage-body-aligned";

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
  nativeSuggestedReply?: HTMLElement;
  nativePreviousDisplay?: string;
}

type InjectionTarget =
  | { kind: "native"; block: HTMLElement }
  | { kind: "fallback"; anchor: Element };

let injected: InjectedComponents | null = null;
let anchorPollTimer: ReturnType<typeof setInterval> | null = null;
let resizeListenerInstalled = false;
let resizeRafId: number | null = null;

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
    moveExistingRowToNativeTarget(existing);
    updateButtonRow(existing, state, makeButtonCallbacks(callbacks));
    alignRowToMessageBody(existing);
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
  alignRowToMessageBody(container);
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
 * Remove the injected row from the DOM entirely.
 * Called when navigating away from a thread.
 */
export function removeInjected(): void {
  clearAnchorPoll();
  removeResizeListener();

  const row = document.getElementById(CONTAINER_ID);

  restoreNativeSuggestedReply();
  row?.remove();
  injected = null;

  console.debug(LOG_PREFIX, "injection removed");
}

/**
 * Populate the in-card settings form with current settings so the user can edit them.
 */
export function setInCardSettings(settings: Settings): void {
  const row = document.getElementById(CONTAINER_ID) as HTMLDivElement | null;
  if (row) {
    populateButtonRowSettings(row, settings);
  }
}

// ── Composer insertion ────────────────────────────────────────────────────────

/**
 * Gmail keeps quoted history (and often the signature) inside the same
 * Message Body contenteditable as the reply draft. Suggestion insert must
 * replace only the draft prefix and leave these structural nodes intact.
 */
const COMPOSER_PRESERVE_SELECTORS = [
  ".gmail_quote",
  ".gmail_signature",
  '[data-smartmail="gmail_signature"]',
] as const;

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

    // Convert plain-text newlines to HTML <br> tags so Gmail's contenteditable
    // renders them as visible line breaks. Escape HTML special chars first.
    const htmlText = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n/g, "<br>");

    const preserveFrom = findComposerPreserveRoot(editable);
    selectComposerInsertRange(editable, preserveFrom);

    // insertHTML is deprecated but is the most reliable way to insert formatted
    // content into Gmail's contenteditable while triggering its own input handlers.
    const inserted = document.execCommand("insertHTML", false, htmlText);
    if (!inserted) {
      insertHtmlPreservingComposerSuffix(editable, htmlText, preserveFrom);
    }

    console.debug(LOG_PREFIX, "text inserted into composer, length:", text.length);
  }, 150);
}

/**
 * Earliest signature/quote node inside the reply editable, in document order.
 * Insertions replace only content before this node.
 */
function findComposerPreserveRoot(editable: HTMLElement): HTMLElement | null {
  let earliest: HTMLElement | null = null;

  for (const sel of COMPOSER_PRESERVE_SELECTORS) {
    let matches: NodeListOf<HTMLElement>;
    try {
      matches = editable.querySelectorAll(sel);
    } catch {
      continue;
    }

    for (let i = 0; i < matches.length; i++) {
      const el = matches[i];
      if (el === editable || !editable.contains(el)) {
        continue;
      }
      if (!earliest) {
        earliest = el;
        continue;
      }
      const position = earliest.compareDocumentPosition(el);
      if (position & Node.DOCUMENT_POSITION_PRECEDING) {
        earliest = el;
      }
    }
  }

  return earliest;
}

function selectComposerInsertRange(
  editable: HTMLElement,
  preserveFrom: HTMLElement | null,
): void {
  const selection = window.getSelection();
  if (!selection) {
    return;
  }

  const range = document.createRange();
  if (preserveFrom && editable.contains(preserveFrom)) {
    // Replace draft/placeholder text only; keep quote + signature nodes.
    range.setStart(editable, 0);
    range.setEndBefore(preserveFrom);
  } else {
    range.selectNodeContents(editable);
  }

  selection.removeAllRanges();
  selection.addRange(range);
}

function insertHtmlPreservingComposerSuffix(
  editable: HTMLElement,
  htmlText: string,
  preserveFrom: HTMLElement | null,
): void {
  if (!preserveFrom || !editable.contains(preserveFrom)) {
    editable.innerHTML = htmlText;
    editable.dispatchEvent(new InputEvent("input", { bubbles: true }));
    return;
  }

  const range = document.createRange();
  range.setStart(editable, 0);
  range.setEndBefore(preserveFrom);
  range.deleteContents();

  const template = document.createElement("template");
  template.innerHTML = htmlText;
  editable.insertBefore(template.content, preserveFrom);
  editable.dispatchEvent(new InputEvent("input", { bubbles: true }));
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
    const target = findInjectionTarget();

    if (target) {
      clearAnchorPoll();
      doInject(target, state, callbacks);
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

function findInjectionTarget(): InjectionTarget | null {
  const nativeBlock = findNativeSuggestedReplyBlock();
  if (nativeBlock) {
    return { kind: "native", block: nativeBlock };
  }

  const anchor = findAnchor();
  return anchor ? { kind: "fallback", anchor } : null;
}

function findNativeSuggestedReplyBlock(): HTMLElement | null {
  const selector = NATIVE_SUGGESTED_REPLY_SELECTORS.join(", ");
  const candidates = Array.from(document.querySelectorAll<HTMLElement>(selector));

  for (let i = candidates.length - 1; i >= 0; i--) {
    const candidate = candidates[i];
    if (candidate.closest(`#${CONTAINER_ID}`)) {
      continue;
    }

    if (!isNativeSuggestedReplyCandidate(candidate)) {
      continue;
    }

    return getNativeSuggestedReplyHideTarget(candidate);
  }

  return null;
}

function isNativeSuggestedReplyCandidate(candidate: HTMLElement): boolean {
  const hasSuggestedReplyLabel = NATIVE_SUGGESTED_REPLY_LABELS.some((label) => {
    return candidate.textContent?.includes(label) || candidate.getAttribute("aria-label") === label;
  });
  const hasSuggestedReplyButtons = Boolean(
    candidate.querySelector(NATIVE_SUGGESTED_REPLY_BUTTON_SELECTOR),
  );

  return hasSuggestedReplyLabel || hasSuggestedReplyButtons;
}

function getNativeSuggestedReplyHideTarget(candidate: HTMLElement): HTMLElement {
  if (candidate.matches(".mVCoBd")) {
    return candidate;
  }

  const outerCard = candidate.closest<HTMLElement>(".mVCoBd");
  if (outerCard) {
    return outerCard;
  }

  return candidate;
}

function moveExistingRowToNativeTarget(row: HTMLDivElement): void {
  const nativeBlock = findNativeSuggestedReplyBlock();

  if (!nativeBlock || nativeBlock.hasAttribute(NATIVE_HIDDEN_ATTR)) {
    return;
  }

  nativeBlock.insertAdjacentElement("beforebegin", row);
  injected = hideNativeSuggestedReply(nativeBlock, row);
  alignRowToMessageBody(row);
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
  target: InjectionTarget,
  initialState: SuggestionState,
  callbacks: InjectCallbacks,
): void {
  const buttonCallbacks = makeButtonCallbacks(callbacks);
  const row = createButtonRow(buttonCallbacks);

  if (target.kind === "native") {
    target.block.insertAdjacentElement("beforebegin", row);
    injected = hideNativeSuggestedReply(target.block, row);
  } else {
    // Append inside .amn so the fallback appears near Gmail's reply controls.
    target.anchor.appendChild(row);
    injected = { row };
  }


  // Render the actual initial state
  updateButtonRow(row, initialState, buttonCallbacks);
  alignRowToMessageBody(row);
  installResizeListener();

  console.debug(
    LOG_PREFIX,
    "injected into target:",
    target.kind === "native" ? "native suggested reply" : target.anchor.className,
  );
}

function hideNativeSuggestedReply(
  nativeBlock: HTMLElement,
  row: HTMLDivElement,
): InjectedComponents {
  const nativePreviousDisplay = nativeBlock.style.display;
  nativeBlock.setAttribute(NATIVE_HIDDEN_ATTR, "true");
  nativeBlock.style.display = "none";
  return { row, nativeSuggestedReply: nativeBlock, nativePreviousDisplay };
}

function restoreNativeSuggestedReply(): void {
  const nativeBlock =
    injected?.nativeSuggestedReply ??
    document.querySelector<HTMLElement>(`[${NATIVE_HIDDEN_ATTR}="true"]`);

  if (!nativeBlock) {
    return;
  }

  nativeBlock.style.display = injected?.nativePreviousDisplay ?? "";
  nativeBlock.removeAttribute(NATIVE_HIDDEN_ATTR);
}

function alignRowToMessageBody(row: HTMLElement): void {
  const parent = row.parentElement;
  if (!parent) {
    return;
  }

  const bodyEl = findMessageBodyForRow(row);
  if (!bodyEl) {
    row.style.removeProperty("padding-left");
    row.style.removeProperty("padding-right");
    row.removeAttribute(ALIGNED_FLAG_ATTR);
    return;
  }

  const parentRect = parent.getBoundingClientRect();
  const bodyRect = bodyEl.getBoundingClientRect();

  if (parentRect.width <= 0 || bodyRect.width <= 0) {
    return;
  }

  const leftInset = clampInset(bodyRect.left - parentRect.left, parentRect.width);
  const rightInset = clampInset(parentRect.right - bodyRect.right, parentRect.width);

  row.style.paddingLeft = `${leftInset}px`;
  row.style.paddingRight = `${rightInset}px`;
  row.setAttribute(ALIGNED_FLAG_ATTR, "true");
}

function clampInset(value: number, parentWidth: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const maxInset = Math.max(0, Math.floor(parentWidth / 2) - 1);
  return Math.max(0, Math.min(maxInset, Math.round(value)));
}

function findMessageBodyForRow(row: HTMLElement): HTMLElement | null {
  const messageContainer = findMessageContainerFromRow(row);
  if (messageContainer) {
    for (const sel of MESSAGE_BODY_SELECTORS) {
      const candidates = messageContainer.querySelectorAll<HTMLElement>(sel);
      for (let i = candidates.length - 1; i >= 0; i--) {
        const el = candidates[i];
        if (isElementVisible(el)) {
          return el;
        }
      }
    }
  }

  const fallback = getLatestMessageBody();
  if (fallback instanceof HTMLElement && isElementVisible(fallback)) {
    return fallback;
  }
  return null;
}

function findMessageContainerFromRow(row: HTMLElement): HTMLElement | null {
  const start = row.parentElement;
  if (!start) {
    return null;
  }
  for (const sel of MESSAGE_CONTAINER_SELECTORS) {
    const match = start.closest<HTMLElement>(sel);
    if (match) {
      return match;
    }
  }
  return null;
}

function isElementVisible(el: HTMLElement): boolean {
  if (!el.isConnected) {
    return false;
  }
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function installResizeListener(): void {
  if (resizeListenerInstalled || typeof window === "undefined") {
    return;
  }
  window.addEventListener("resize", scheduleRealignOnResize, { passive: true });
  resizeListenerInstalled = true;
}

function removeResizeListener(): void {
  if (!resizeListenerInstalled || typeof window === "undefined") {
    return;
  }
  window.removeEventListener("resize", scheduleRealignOnResize);
  if (resizeRafId !== null) {
    cancelAnimationFrame(resizeRafId);
    resizeRafId = null;
  }
  resizeListenerInstalled = false;
}

function scheduleRealignOnResize(): void {
  if (resizeRafId !== null) {
    return;
  }
  resizeRafId = requestAnimationFrame(() => {
    resizeRafId = null;
    const row = document.getElementById(CONTAINER_ID) as HTMLElement | null;
    if (row) {
      alignRowToMessageBody(row);
    }
  });
}

function makeButtonCallbacks(callbacks: InjectCallbacks): ButtonRowCallbacks {
  return {
    onSuggestionClick: callbacks.onSuggestionClick,
    onRefresh: callbacks.onRefresh,
    onSaveSettings: callbacks.onSaveSettings,
  };
}

function clearAnchorPoll(): void {
  if (anchorPollTimer !== null) {
    clearInterval(anchorPollTimer);
    anchorPollTimer = null;
  }
}

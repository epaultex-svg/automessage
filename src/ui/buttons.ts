/**
 * Builds and manages the AI suggestion button row injected into Gmail.
 * This module is purely presentational — it emits events but has no knowledge
 * of Gmail selectors or message passing.
 */

import type { SuggestionState } from "../types";

const LOG_PREFIX = "[Automessage/buttons]";

export const CONTAINER_ID = "automessage-suggestions";

// SVG icons (inline, no external deps)
const REFRESH_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>`;
const GEAR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>`;

export interface ButtonRowCallbacks {
  onSuggestionClick: (text: string) => void;
  onRefresh: () => void;
  onSettingsToggle: () => void;
}

/**
 * Creates the full suggestion row container and returns it.
 * The caller is responsible for inserting it into the DOM.
 */
export function createButtonRow(callbacks: ButtonRowCallbacks): HTMLDivElement {
  const container = document.createElement("div");
  container.id = CONTAINER_ID;
  container.setAttribute("role", "group");
  container.setAttribute("aria-label", "AI reply suggestions");

  renderState(container, { status: "loading" }, callbacks);
  return container;
}

/**
 * Update an existing container's contents to reflect the new state.
 * Safe to call multiple times — clears and rebuilds children.
 */
export function updateButtonRow(
  container: HTMLDivElement,
  state: SuggestionState,
  callbacks: ButtonRowCallbacks,
): void {
  renderState(container, state, callbacks);
}

// ── Private renderers ─────────────────────────────────────────────────────────

function renderState(
  container: HTMLDivElement,
  state: SuggestionState,
  callbacks: ButtonRowCallbacks,
): void {
  // Clear existing children
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }

  switch (state.status) {
    case "loading":
      renderLoadingState(container);
      break;
    case "success":
      renderSuccessState(container, state.replies, callbacks);
      break;
    case "error":
      renderErrorState(container, state.message, callbacks);
      break;
    case "idle":
      // Render nothing — container stays in DOM but is empty
      break;
    default:
      break;
  }

  console.debug(LOG_PREFIX, "rendered state:", state.status);
}

function renderLoadingState(container: HTMLDivElement): void {
  // 3 skeleton placeholder pills
  for (let i = 0; i < 3; i++) {
    const btn = document.createElement("button");
    btn.className = "am-btn am-btn--loading";
    btn.setAttribute("aria-label", "Loading suggestion…");
    btn.disabled = true;
    btn.textContent = "Loading…";
    container.appendChild(btn);
  }
}

function renderSuccessState(
  container: HTMLDivElement,
  replies: [string, string, string],
  callbacks: ButtonRowCallbacks,
): void {
  replies.forEach((reply, i) => {
    const btn = document.createElement("button");
    btn.className = "am-btn";
    btn.type = "button";
    btn.title = reply; // show full text on hover if truncated
    btn.setAttribute("aria-label", `Use reply: ${reply}`);
    btn.textContent = reply;

    btn.addEventListener("click", () => {
      console.debug(LOG_PREFIX, `suggestion ${i + 1} clicked`);
      callbacks.onSuggestionClick(reply);
    });

    btn.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        callbacks.onSuggestionClick(reply);
      }
    });

    container.appendChild(btn);
  });

  container.appendChild(makeRefreshButton(callbacks.onRefresh));
  container.appendChild(makeSettingsButton(callbacks.onSettingsToggle));
}

function renderErrorState(
  container: HTMLDivElement,
  message: string,
  callbacks: ButtonRowCallbacks,
): void {
  const err = document.createElement("span");
  err.className = "am-error";
  err.textContent = `⚠ ${message}`;
  err.title = message;
  container.appendChild(err);

  container.appendChild(makeRefreshButton(callbacks.onRefresh));
  container.appendChild(makeSettingsButton(callbacks.onSettingsToggle));
}

function makeRefreshButton(onRefresh: () => void): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.className = "am-refresh-btn";
  btn.type = "button";
  btn.title = "Regenerate suggestions";
  btn.setAttribute("aria-label", "Regenerate reply suggestions");
  btn.innerHTML = REFRESH_SVG;
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    onRefresh();
  });
  return btn;
}

function makeSettingsButton(onSettingsToggle: () => void): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.className = "am-settings-toggle";
  btn.type = "button";
  btn.title = "Automessage settings";
  btn.setAttribute("aria-label", "Open Automessage settings");
  btn.innerHTML = GEAR_SVG;
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    onSettingsToggle();
  });
  return btn;
}

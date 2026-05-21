/**
 * Builds and manages the AI suggestion button row injected into Gmail.
 * This module is purely presentational — it emits events but has no knowledge
 * of Gmail selectors or message passing.
 */

import type { AIReplyOptionTuple, Settings, SuggestionState, TonePreset } from "../types";
import { DEFAULT_SETTINGS } from "../types";

const LOG_PREFIX = "[Automessage/buttons]";

export const CONTAINER_ID = "automessage-suggestions";

// SVG icons (inline, no external deps)
const REFRESH_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>`;
const GEAR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>`;
const SUGGESTED_REPLY_SVG = `<svg enable-background="new 0 0 24 24" height="16" viewBox="0 0 24 24" width="16" focusable="false" aria-hidden="true"><g><rect fill="none" height="24" width="24"></rect></g><g><g><g><path d="M6.5 12c0-3.04 2.46-5.5 5.5-5.5-3.04 0-5.5-2.46-5.5-5.5 0 3.04-2.46 5.5-5.5 5.5 3.04 0 5.5 2.46 5.5 5.5z"></path></g><path d="M7.01 19h1.4L18.46 8.98l-1.43-1.43L7.01 17.6V19zm-2 2v-4.25L18.46 3.33c.38-.38.85-.58 1.41-.58s1.03.19 1.41.58l1.4 1.42c.38.38.57.85.57 1.4s-.19 1.02-.57 1.4L9.26 21H5.01zM18.46 8.98l-.7-.73-.73-.7 1.43 1.43z"></path></g></g></svg>`;

export interface ButtonRowCallbacks {
  onSuggestionClick: (text: string) => void;
  onRefresh: () => void;
  onSaveSettings: (settings: Partial<Settings>) => void;
}

const settingsByContainer = new WeakMap<HTMLDivElement, Settings>();
const stateByContainer = new WeakMap<HTMLDivElement, SuggestionState>();

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

export function populateButtonRowSettings(
  container: HTMLDivElement,
  settings: Settings,
): void {
  settingsByContainer.set(container, settings);
  setSettingsFormValues(container, settings);
}

// ── Private renderers ─────────────────────────────────────────────────────────

function renderState(
  container: HTMLDivElement,
  state: SuggestionState,
  callbacks: ButtonRowCallbacks,
): void {
  stateByContainer.set(container, state);

  // Clear existing children
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }

  switch (state.status) {
    case "loading":
      renderLoadingState(container, callbacks);
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

function renderLoadingState(
  container: HTMLDivElement,
  callbacks: ButtonRowCallbacks,
): void {
  const card = makeCardShell(container, callbacks);
  if (isSettingsView(container)) {
    card.appendChild(makeSettingsBody(container, callbacks));
    container.appendChild(card);
    return;
  }

  const body = document.createElement("div");
  body.className = "am-card-body";

  const tablist = document.createElement("div");
  tablist.className = "am-tabs";
  tablist.setAttribute("role", "tablist");
  tablist.setAttribute("aria-label", "Loading reply types");

  for (let i = 0; i < 3; i++) {
    const tab = document.createElement("div");
    tab.className = "am-tab am-tab--loading";
    tab.setAttribute("aria-hidden", "true");
    tab.textContent = "Loading";
    tablist.appendChild(tab);
  }

  const panel = document.createElement("div");
  panel.className = "am-reply-panel am-reply-panel--loading";
  panel.setAttribute("aria-hidden", "true");
  panel.textContent = "Loading suggested reply";

  body.appendChild(tablist);
  body.appendChild(panel);
  card.appendChild(body);
  container.appendChild(card);
}

function renderSuccessState(
  container: HTMLDivElement,
  replies: AIReplyOptionTuple,
  callbacks: ButtonRowCallbacks,
): void {
  let selectedIndex = 0;
  const card = makeCardShell(container, callbacks);
  if (isSettingsView(container)) {
    card.appendChild(makeSettingsBody(container, callbacks));
    container.appendChild(card);
    return;
  }

  const body = document.createElement("div");
  body.className = "am-card-body";

  const tablist = document.createElement("div");
  tablist.className = "am-tabs";
  tablist.setAttribute("role", "tablist");
  tablist.setAttribute("aria-label", "Suggested reply types");

  const panel = document.createElement("div");
  panel.className = "am-reply-panel";
  panel.id = "automessage-reply-panel";
  panel.setAttribute("role", "tabpanel");
  panel.tabIndex = 0;

  const tabs = replies.map((reply, i) => {
    const tab = document.createElement("button");
    tab.className = "am-tab";
    tab.type = "button";
    tab.id = `automessage-reply-tab-${i}`;
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-controls", panel.id);
    tab.textContent = reply.type;

    tab.addEventListener("click", () => {
      selectReply(i, true);
    });

    tab.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        selectReply(i, true);
        return;
      }

      const nextIndex = getNextTabIndex(e.key, i, replies.length);
      if (nextIndex !== i) {
        e.preventDefault();
        selectReply(nextIndex, true);
      }
    });

    tablist.appendChild(tab);
    return tab;
  });

  panel.addEventListener("click", () => {
    console.debug(LOG_PREFIX, `suggestion ${selectedIndex + 1} clicked`);
    callbacks.onSuggestionClick(replies[selectedIndex].text);
  });

  panel.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      callbacks.onSuggestionClick(replies[selectedIndex].text);
    }
  });

  body.appendChild(tablist);
  body.appendChild(panel);
  card.appendChild(body);
  container.appendChild(card);

  selectReply(0, false);

  function selectReply(index: number, focusTab: boolean): void {
    selectedIndex = index;
    const selectedReply = replies[index];

    tabs.forEach((tab, tabIndex) => {
      const isSelected = tabIndex === index;
      tab.classList.toggle("am-tab--active", isSelected);
      tab.setAttribute("aria-selected", String(isSelected));
      tab.tabIndex = isSelected ? 0 : -1;
    });

    panel.setAttribute("aria-labelledby", tabs[index].id);
    panel.setAttribute("aria-label", `Use ${selectedReply.type} reply`);
    panel.title = selectedReply.text;
    panel.textContent = selectedReply.text;

    if (focusTab) {
      tabs[index].focus();
    }
  }
}

function renderErrorState(
  container: HTMLDivElement,
  message: string,
  callbacks: ButtonRowCallbacks,
): void {
  const card = makeCardShell(container, callbacks);
  if (isSettingsView(container)) {
    card.appendChild(makeSettingsBody(container, callbacks));
    container.appendChild(card);
    return;
  }

  const body = document.createElement("div");
  body.className = "am-card-body";

  const err = document.createElement("span");
  err.className = "am-error";
  err.textContent = message;
  err.title = message;
  body.appendChild(err);

  card.appendChild(body);
  container.appendChild(card);
}

function makeCardShell(
  container: HTMLDivElement,
  callbacks: ButtonRowCallbacks,
): HTMLDivElement {
  const card = document.createElement("div");
  card.className = "am-card";

  const header = document.createElement("div");
  header.className = "am-card-header";

  const title = document.createElement("div");
  title.className = "am-card-title";

  const icon = document.createElement("span");
  icon.className = "am-card-icon";
  icon.innerHTML = SUGGESTED_REPLY_SVG;

  const label = document.createElement("span");
  label.className = "am-card-label";
  label.textContent = "Suggested reply";

  const controls = document.createElement("div");
  controls.className = "am-card-controls";
  controls.appendChild(makeRefreshButton(callbacks.onRefresh));
  controls.appendChild(makeSettingsButton(container, callbacks));

  title.appendChild(icon);
  title.appendChild(label);
  header.appendChild(title);
  header.appendChild(controls);
  card.appendChild(header);

  return card;
}

function makeSettingsBody(
  container: HTMLDivElement,
  callbacks: ButtonRowCallbacks,
): HTMLDivElement {
  const body = document.createElement("div");
  body.className = "am-card-body am-settings-body";

  const form = document.createElement("form");
  form.className = "am-settings-form";
  form.id = "am-settings-form";
  form.autocomplete = "off";

  form.appendChild(
    makeSettingsField(
      "am-model",
      "Model",
      [
        ["openai/gpt-oss-120b:free", "openai/gpt-oss-120b:free"],
        ["google/gemma-4-31b-it:free", "google/gemma-4-31b-it:free"],
        ["nvidia/nemotron-3-super-120b-a12b:free", "nvidia/nemotron-3-super-120b-a12b:free"],
      ],
    ),
  );
  form.appendChild(
    makeSettingsField(
      "am-tone",
      "Reply Tone",
      [
        ["professional", "Professional"],
        ["friendly", "Friendly"],
        ["concise", "Concise"],
      ],
    ),
  );

  const status = document.createElement("div");
  status.className = "am-settings-status";
  status.id = "am-settings-status";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  form.appendChild(status);

  const actions = document.createElement("div");
  actions.className = "am-settings-actions";

  const save = document.createElement("button");
  save.className = "am-save-btn";
  save.type = "submit";
  save.textContent = "Save";

  const back = document.createElement("button");
  back.className = "am-secondary-btn";
  back.type = "button";
  back.textContent = "Back";
  back.addEventListener("click", () => {
    showReplyView(container, callbacks);
  });

  actions.appendChild(save);
  actions.appendChild(back);
  form.appendChild(actions);

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    handleSettingsSave(container, form, callbacks);
    setTimeout(() => {
      showReplyView(container, callbacks);
    }, 600);
  });

  body.appendChild(form);
  setSettingsFormValues(body, getCurrentSettings(container));
  return body;
}

function makeSettingsField(
  id: string,
  labelText: string,
  options: Array<[string, string]>,
): HTMLDivElement {
  const field = document.createElement("div");
  field.className = "am-settings-field";

  const label = document.createElement("label");
  label.className = "am-settings-label";
  label.htmlFor = id;
  label.textContent = labelText;

  const select = document.createElement("select");
  select.className = "am-settings-select";
  select.id = id;

  options.forEach(([value, text]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = text;
    select.appendChild(option);
  });

  field.appendChild(label);
  field.appendChild(select);
  return field;
}

function handleSettingsSave(
  container: HTMLDivElement,
  form: HTMLFormElement,
  callbacks: ButtonRowCallbacks,
): void {
  const modelSelect = form.querySelector<HTMLSelectElement>("#am-model");
  const toneSelect = form.querySelector<HTMLSelectElement>("#am-tone");
  const status = form.querySelector<HTMLElement>("#am-settings-status");

  const model = modelSelect?.value ?? DEFAULT_SETTINGS.model;
  const tone = (toneSelect?.value ?? DEFAULT_SETTINGS.tone) as TonePreset;
  const settings: Settings = { model, tone };
  settingsByContainer.set(container, settings);

  callbacks.onSaveSettings(settings);

  if (status) {
    status.textContent = "Saved. Regenerating suggestions...";
  }

  console.debug(LOG_PREFIX, "settings saved from card");
}

function getCurrentSettings(container: HTMLDivElement): Settings {
  return settingsByContainer.get(container) ?? DEFAULT_SETTINGS;
}

function setSettingsFormValues(root: ParentNode, settings: Settings): void {
  const modelSelect = root.querySelector<HTMLSelectElement>("#am-model");
  const toneSelect = root.querySelector<HTMLSelectElement>("#am-tone");

  if (modelSelect) modelSelect.value = settings.model;
  if (toneSelect) toneSelect.value = settings.tone;
}

function isSettingsView(container: HTMLDivElement): boolean {
  return container.dataset.amView === "settings";
}

function showSettingsView(
  container: HTMLDivElement,
  callbacks: ButtonRowCallbacks,
): void {
  container.dataset.amView = "settings";
  renderState(container, getCurrentState(container), callbacks);
}

function showReplyView(
  container: HTMLDivElement,
  callbacks: ButtonRowCallbacks,
): void {
  container.dataset.amView = "replies";
  renderState(container, getCurrentState(container), callbacks);
}

function getCurrentState(container: HTMLDivElement): SuggestionState {
  return stateByContainer.get(container) ?? { status: "idle" };
}

function getNextTabIndex(key: string, currentIndex: number, tabCount: number): number {
  switch (key) {
    case "ArrowRight":
    case "ArrowDown":
      return (currentIndex + 1) % tabCount;
    case "ArrowLeft":
    case "ArrowUp":
      return (currentIndex - 1 + tabCount) % tabCount;
    case "Home":
      return 0;
    case "End":
      return tabCount - 1;
    default:
      return currentIndex;
  }
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

function makeSettingsButton(
  container: HTMLDivElement,
  callbacks: ButtonRowCallbacks,
): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.className = "am-settings-toggle";
  btn.type = "button";
  const settingsOpen = isSettingsView(container);
  btn.title = settingsOpen ? "Back to suggested replies" : "Automessage settings";
  btn.setAttribute(
    "aria-label",
    settingsOpen ? "Back to suggested replies" : "Open Automessage settings",
  );
  btn.setAttribute("aria-expanded", String(settingsOpen));
  btn.innerHTML = GEAR_SVG;
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (isSettingsView(container)) {
      showReplyView(container, callbacks);
    } else {
      showSettingsView(container, callbacks);
    }
  });
  return btn;
}

/**
 * Inline collapsible settings panel injected next to the suggestion row.
 * Sits in the Gmail page itself (not the popup) — gives quick access to settings
 * without forcing the user to open the extension popup.
 */

import type { Settings, TonePreset } from "../types";

const LOG_PREFIX = "[Automessage/sidebar]";

export const SIDEBAR_ID = "automessage-sidebar";

export interface SidebarCallbacks {
  onSave: (settings: Partial<Settings>) => void;
}

/**
 * Creates the sidebar element (initially hidden).
 * The caller manages insertion into the DOM.
 */
export function createSidebar(callbacks: SidebarCallbacks): HTMLDivElement {
  const sidebar = document.createElement("div");
  sidebar.id = SIDEBAR_ID;
  sidebar.hidden = true;

  sidebar.innerHTML = buildSidebarHTML();

  const form = sidebar.querySelector<HTMLFormElement>("#am-settings-form");
  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      handleSave(sidebar, callbacks);
    });
  }

  return sidebar;
}

/**
 * Populate the sidebar form fields with current settings.
 */
export function populateSidebar(
  sidebar: HTMLDivElement,
  settings: Settings,
): void {
  const modelSelect = sidebar.querySelector<HTMLSelectElement>("#am-model");
  const toneSelect = sidebar.querySelector<HTMLSelectElement>("#am-tone");

  if (modelSelect) modelSelect.value = settings.model;
  if (toneSelect) toneSelect.value = settings.tone;
}

/**
 * Toggle the sidebar's visibility.
 */
export function toggleSidebar(sidebar: HTMLDivElement): void {
  sidebar.hidden = !sidebar.hidden;
  console.debug(LOG_PREFIX, "sidebar toggled, hidden=", sidebar.hidden);
}

// ── Private helpers ───────────────────────────────────────────────────────────

function buildSidebarHTML(): string {
  return `
    <form id="am-settings-form" autocomplete="off">
      <div class="am-sidebar-field">
        <label class="am-sidebar-label" for="am-model">Model</label>
        <select class="am-sidebar-select" id="am-model">
          <option value="openai/gpt-4o-mini">openai/gpt-4o-mini</option>
          <option value="openai/gpt-5o-mini">openai/gpt-5o-mini</option>
          <option value="anthropic/claude-haiku-4-5">anthropic/claude-haiku-4-5</option>
        </select>
      </div>
      <div class="am-sidebar-field">
        <label class="am-sidebar-label" for="am-tone">Reply Tone</label>
        <select class="am-sidebar-select" id="am-tone">
          <option value="professional">Professional</option>
          <option value="friendly">Friendly</option>
          <option value="concise">Concise</option>
        </select>
      </div>
      <div id="am-sidebar-status" style="font-size:11px;margin-bottom:8px;min-height:14px;"></div>
      <button class="am-save-btn" type="submit">Save</button>
    </form>
  `;
}

function handleSave(
  sidebar: HTMLDivElement,
  callbacks: SidebarCallbacks,
): void {
  const modelSelect = sidebar.querySelector<HTMLSelectElement>("#am-model");
  const toneSelect = sidebar.querySelector<HTMLSelectElement>("#am-tone");
  const statusEl = sidebar.querySelector<HTMLElement>("#am-sidebar-status");

  const model = modelSelect?.value ?? "";
  const tone = (toneSelect?.value ?? "professional") as TonePreset;

  callbacks.onSave({ model, tone });

  if (statusEl) {
    statusEl.textContent = "Saved ✓";
    statusEl.style.color = "#188038";
    setTimeout(() => {
      statusEl.textContent = "";
    }, 2000);
  }

  console.debug(LOG_PREFIX, "settings saved from sidebar");
}

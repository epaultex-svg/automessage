// ─── Shared TypeScript interfaces ────────────────────────────────────────────
// All message contracts, data shapes, and enums live here so that content.ts
// and background.ts can never diverge on their shared API surface.

// ── Settings ─────────────────────────────────────────────────────────────────

export type TonePreset = "professional" | "friendly" | "concise";

export interface Settings {
  apiKey: string;
  model: string;
  tone: TonePreset;
}

export const DEFAULT_SETTINGS: Settings = {
  apiKey: "",
  model: "openai/gpt-4o-mini",
  tone: "professional",
};

// ── Parsed email data ─────────────────────────────────────────────────────────

export interface ParsedEmail {
  threadId: string; // derived from URL hash or DOM attribute
  subject: string;
  body: string; // cleaned, truncated body text of the most recent message
  fromName?: string;
  fromEmail?: string;
}

// ── AI response ───────────────────────────────────────────────────────────────

export interface AIReplySuggestions {
  replies: [string, string, string]; // exactly 3
}

// ── Chrome extension message passing ─────────────────────────────────────────
// All messages between content ↔ background follow this tagged-union pattern.

export type ExtensionMessage =
  | GenerateRepliesRequest
  | GenerateRepliesSuccess
  | GenerateRepliesError
  | GetSettingsRequest
  | GetSettingsResponse
  | SaveSettingsRequest
  | SaveSettingsResponse;

export interface GenerateRepliesRequest {
  type: "GENERATE_REPLIES";
  payload: ParsedEmail;
}

export interface GenerateRepliesSuccess {
  type: "REPLIES_SUCCESS";
  payload: {
    threadId: string;
    replies: [string, string, string];
  };
}

export interface GenerateRepliesError {
  type: "REPLIES_ERROR";
  payload: {
    threadId: string;
    message: string;
  };
}

export interface GetSettingsRequest {
  type: "GET_SETTINGS";
}

export interface GetSettingsResponse {
  type: "SETTINGS_RESPONSE";
  payload: Settings;
}

export interface SaveSettingsRequest {
  type: "SAVE_SETTINGS";
  payload: Partial<Settings>;
}

export interface SaveSettingsResponse {
  type: "SETTINGS_SAVED";
  payload: { success: boolean };
}

// ── Cache entry ───────────────────────────────────────────────────────────────

export interface CacheEntry {
  replies: [string, string, string];
  timestamp: number;
}

// ── UI state ──────────────────────────────────────────────────────────────────

export type SuggestionState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; replies: [string, string, string] }
  | { status: "error"; message: string };

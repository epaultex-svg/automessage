// ─── Shared TypeScript interfaces ────────────────────────────────────────────
// All message contracts, data shapes, and enums live here so that content.ts
// and background.ts can never diverge on their shared API surface.

// ── Settings ─────────────────────────────────────────────────────────────────

export type TonePreset = "professional" | "friendly" | "concise";

export interface Settings {
  model: string;
  tone: TonePreset;
}

export const GPT_OSS_120B_MODEL = "openai/gpt-oss-120b:free";
export const GEMMA_4_31B_MODEL = "google/gemma-4-31b-it:free";
export const NEMOTRON_3_SUPER_MODEL = "nvidia/nemotron-3-super-120b-a12b:free";
export const SUPPORTED_MODELS = [
  GPT_OSS_120B_MODEL,
  GEMMA_4_31B_MODEL,
  NEMOTRON_3_SUPER_MODEL,
] as const;
export const MODEL_OPTIONS = [
  [GPT_OSS_120B_MODEL, GPT_OSS_120B_MODEL],
  [GEMMA_4_31B_MODEL, GEMMA_4_31B_MODEL],
  [NEMOTRON_3_SUPER_MODEL, NEMOTRON_3_SUPER_MODEL],
] as const;

export const DEFAULT_SETTINGS: Settings = {
  model: GPT_OSS_120B_MODEL,
  tone: "professional",
};

// ── Parsed email data ─────────────────────────────────────────────────────────

export interface ParsedEmail {
  threadId: string; // derived from URL hash or DOM attribute
  subject: string;
  body: string; // cleaned, truncated body text of the most recent message
  userName?: string; // first name from the signed-in Gmail account, used for sign-offs
  fromName?: string;
  fromEmail?: string;
}

// ── AI response ───────────────────────────────────────────────────────────────

export interface AIReplyOption {
  type: string;
  text: string;
}

export type AIReplyOptionTuple = [AIReplyOption, AIReplyOption, AIReplyOption];

export interface AIReplySuggestions {
  replies: AIReplyOptionTuple; // exactly 3
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
    replies: AIReplyOptionTuple;
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
  replies: AIReplyOptionTuple;
  timestamp: number;
}

// ── UI state ──────────────────────────────────────────────────────────────────

export type SuggestionState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; replies: AIReplyOptionTuple }
  | { status: "error"; message: string };

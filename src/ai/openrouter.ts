import type {
  AIReplySuggestions,
  CacheEntry,
  ParsedEmail,
  Settings,
  TonePreset,
} from "../types";
import { BUNDLED_OPENROUTER_KEY } from "./bundledKey";

const LOG_PREFIX = "[Automessage/openrouter]";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

const CACHE_TTL_MS = 300_000;

const cache = new Map<string, CacheEntry>();

export class AutomessageError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "AutomessageError";
  }
}

const SYSTEM_PROMPT = `You are generating helpful email reply suggestions for a Gmail extension.
Read the email context and produce exactly 3 reply options.
Each reply should be plausible, natural, and ready to send with minimal editing.
Avoid inventing details not present in the email.
Format each reply as a proper email: include a greeting, one or more body paragraphs, and a sign-off where appropriate.
Use \\n to represent line breaks within each reply string (e.g. between greeting and body, between paragraphs, and before the sign-off).
Return valid JSON only in this exact format: {"replies": ["...", "...", "..."]}
Do not include any text outside the JSON.`;

const TONE_INSTRUCTIONS: Record<TonePreset, string> = {
  professional: "Replies should be professional and formal.",
  friendly: "Replies should be warm, friendly, and conversational.",
  concise: "Replies should be brief and to the point, but still use proper email structure with greeting and sign-off separated by line breaks.",
};

export function buildUserPrompt(email: ParsedEmail, tone: TonePreset): string {
  const toneLine = TONE_INSTRUCTIONS[tone];
  return `Email subject: ${email.subject}

Email content:
${email.body}

${toneLine}
Generate 3 distinct reply options.`;
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((item): item is string => typeof item === "string")
  );
}

export function parseAIResponse(raw: string): AIReplySuggestions {
  const tryParse = (text: string): AIReplySuggestions | null => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return null;
    }
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "replies" in parsed &&
      isStringArray((parsed as { replies: unknown }).replies)
    ) {
      const list = (parsed as { replies: string[] }).replies;
      if (list.length < 3) {
        return null;
      }
      const three = list.slice(0, 3);
      return { replies: [three[0], three[1], three[2]] };
    }
    return null;
  };

  const direct = tryParse(raw);
  if (direct) {
    return direct;
  }

  const match = raw.match(/{.*}/s);
  if (match) {
    const extracted = tryParse(match[0]);
    if (extracted) {
      return extracted;
    }
  }

  throw new AutomessageError("Could not parse AI response");
}

export function getCached(hash: string): AIReplySuggestions | null {
  const entry = cache.get(hash);
  if (!entry) {
    return null;
  }
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(hash);
    return null;
  }
  return { replies: entry.replies };
}

export function setCached(hash: string, replies: AIReplySuggestions): void {
  cache.set(hash, {
    replies: replies.replies,
    timestamp: Date.now(),
  });
}

export function clearCache(): void {
  cache.clear();
}

function validateBundledKey(): void {
  if (!BUNDLED_OPENROUTER_KEY || BUNDLED_OPENROUTER_KEY.trim() === "") {
    throw new AutomessageError(
      "No bundled API key found. The extension was built without an OPENROUTER_API_KEY.",
      "NO_API_KEY",
    );
  }
}

interface OpenRouterChatResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
}

export async function generateReplies(
  email: ParsedEmail,
  settings: Settings,
): Promise<AIReplySuggestions> {
  validateBundledKey();

  const model =
    settings.model?.trim() !== "" ? settings.model : "openai/gpt-4o-mini";

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15_000);

  const body = {
    model,
    messages: [
      { role: "system" as const, content: SYSTEM_PROMPT },
      {
        role: "user" as const,
        content: buildUserPrompt(email, settings.tone),
      },
    ],
    response_format: { type: "json_object" as const },
  };

  let response: Response;
  try {
    response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${BUNDLED_OPENROUTER_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/automessage",
        "X-Title": "Automessage Gmail Extension",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      console.error(LOG_PREFIX, "Request timed out after 15 seconds");
      throw new AutomessageError(
        "OpenRouter request timed out after 15 seconds",
        "TIMEOUT",
      );
    }
    console.error(LOG_PREFIX, "Network error", err);
    throw new AutomessageError(
      err instanceof Error ? err.message : "Network error calling OpenRouter",
      "NETWORK",
    );
  } finally {
    clearTimeout(timeoutId);
  }

  const rawText = await response.text();

  if (!response.ok) {
    let detail = rawText;
    try {
      const errJson = JSON.parse(rawText) as OpenRouterChatResponse;
      if (errJson.error?.message) {
        detail = errJson.error.message;
      }
    } catch {
      // keep rawText
    }
    console.error(LOG_PREFIX, "OpenRouter HTTP error", response.status, detail);
    throw new AutomessageError(
      `OpenRouter request failed (${response.status}): ${detail}`,
      "OPENROUTER_HTTP",
    );
  }

  let data: OpenRouterChatResponse;
  try {
    data = JSON.parse(rawText) as OpenRouterChatResponse;
  } catch {
    console.error(LOG_PREFIX, "Invalid JSON from OpenRouter", rawText);
    throw new AutomessageError("Invalid JSON response from OpenRouter");
  }

  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.trim() === "") {
    console.error(LOG_PREFIX, "Missing message content", data);
    throw new AutomessageError("OpenRouter response missing message content");
  }

  console.debug(LOG_PREFIX, "Parsed completion content length", content.length);
  return parseAIResponse(content);
}

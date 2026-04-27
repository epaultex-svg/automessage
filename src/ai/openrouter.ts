import type {
  AIReplyOption,
  AIReplyOptionTuple,
  AIReplySuggestions,
  CacheEntry,
  ParsedEmail,
  Settings,
} from "../types";
import { PROXY_URL, SHARED_TOKEN } from "./proxyConfig";

const LOG_PREFIX = "[Automessage/openrouter]";

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

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((item): item is string => typeof item === "string")
  );
}

function normalizeReplyOption(value: unknown): AIReplyOption | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const option = value as Record<string, unknown>;
  if (typeof option.type !== "string" || typeof option.text !== "string") {
    return null;
  }

  const type = option.type.trim();
  const text = option.text.trim();
  if (!type || !text) {
    return null;
  }

  return { type, text };
}

function toReplyTuple(replies: AIReplyOption[]): AIReplyOptionTuple | null {
  if (replies.length < 3) {
    return null;
  }

  const three = replies.slice(0, 3);
  return [three[0], three[1], three[2]];
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
      Array.isArray((parsed as { replies: unknown }).replies)
    ) {
      const list = (parsed as { replies: unknown[] }).replies;
      const objectReplies = list
        .map(normalizeReplyOption)
        .filter((reply): reply is AIReplyOption => reply !== null);
      const typedTuple = toReplyTuple(objectReplies);
      if (typedTuple) {
        return { replies: typedTuple };
      }

      // Backward compatibility while older proxy responses expire from cache or
      // deployments roll forward.
      if (isStringArray(list)) {
        const legacyTypes = ["Accept", "Deny", "Reschedule"] as const;
        const legacyReplies = list.slice(0, 3).map((reply, index) => ({
          type: legacyTypes[index] ?? `Option ${index + 1}`,
          text: reply.trim(),
        }));
        const legacyTuple = toReplyTuple(
          legacyReplies.filter((reply) => reply.text !== ""),
        );
        if (legacyTuple) {
          return { replies: legacyTuple };
        }
      }
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

function validateProxyConfig(): void {
  if (!PROXY_URL || PROXY_URL.trim() === "") {
    throw new AutomessageError(
      "Proxy URL not configured. The extension was built without AUTOMESSAGE_PROXY_URL.",
      "NO_PROXY_URL",
    );
  }
  if (!SHARED_TOKEN || SHARED_TOKEN.trim() === "") {
    throw new AutomessageError(
      "Shared token not configured. The extension was built without AUTOMESSAGE_SHARED_TOKEN.",
      "NO_SHARED_TOKEN",
    );
  }
}

interface ProxyResponse {
  content?: string;
  error?: string;
}

export async function generateReplies(
  email: ParsedEmail,
  settings: Settings,
): Promise<AIReplySuggestions> {
  validateProxyConfig();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15_000);

  let response: Response;
  try {
    response = await fetch(`${PROXY_URL}/v1/replies`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Automessage-Token": SHARED_TOKEN,
      },
      body: JSON.stringify({ email, settings }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      console.error(LOG_PREFIX, "Request timed out after 15 seconds");
      throw new AutomessageError(
        "Proxy request timed out after 15 seconds",
        "TIMEOUT",
      );
    }
    console.error(LOG_PREFIX, "Network error", err);
    throw new AutomessageError(
      err instanceof Error ? err.message : "Network error calling proxy",
      "NETWORK",
    );
  } finally {
    clearTimeout(timeoutId);
  }

  const rawText = await response.text();

  if (!response.ok) {
    let detail = rawText;
    try {
      const errJson = JSON.parse(rawText) as ProxyResponse;
      if (errJson.error) detail = errJson.error;
    } catch {
      // keep rawText
    }
    console.error(LOG_PREFIX, "Proxy HTTP error", response.status, detail);
    throw new AutomessageError(
      `Proxy request failed (${response.status}): ${detail}`,
      "PROXY_HTTP",
    );
  }

  let data: ProxyResponse;
  try {
    data = JSON.parse(rawText) as ProxyResponse;
  } catch {
    console.error(LOG_PREFIX, "Invalid JSON from proxy", rawText);
    throw new AutomessageError("Invalid JSON response from proxy");
  }

  if (typeof data.content !== "string" || data.content.trim() === "") {
    console.error(LOG_PREFIX, "Missing content in proxy response", data);
    throw new AutomessageError("Proxy response missing content");
  }

  console.debug(LOG_PREFIX, "Parsed proxy content length", data.content.length);
  return parseAIResponse(data.content);
}

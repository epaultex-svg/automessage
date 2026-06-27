export interface Env {
  OPENROUTER_API_KEY: string;
  AUTOMESSAGE_SHARED_TOKEN: string;
  ALLOWED_EXTENSION_ID: string;
  RATE_LIMITER: RateLimit;
}

// ── Types mirrored from the extension ────────────────────────────────────────

type TonePreset = "professional" | "friendly" | "concise";

interface ParsedEmail {
  threadId: string;
  subject: string;
  body: string;
  userName?: string;
  fromName?: string;
  fromEmail?: string;
}

interface Settings {
  model: string;
  tone: TonePreset;
}

interface RequestBody {
  email: ParsedEmail;
  settings: Settings;
}

interface OpenRouterChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
}

interface AIReplyOption {
  type: string;
  text: string;
}

interface AIReplySuggestions {
  replies: AIReplyOption[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "openai/gpt-oss-120b:free";
const GEMMA_4_31B_MODEL = "google/gemma-4-31b-it:free";
const NEMOTRON_3_SUPER_MODEL = "nvidia/nemotron-3-super-120b-a12b:free";

const ALLOWED_MODELS = new Set([
  DEFAULT_MODEL,
  GEMMA_4_31B_MODEL,
  NEMOTRON_3_SUPER_MODEL,
]);

const MODEL_ALIASES: Record<string, string> = {
  "gpt-oss-120b:free": DEFAULT_MODEL,
  "gemma-4-31b-it:free": GEMMA_4_31B_MODEL,
  "nemotron-3-super:free": NEMOTRON_3_SUPER_MODEL,
  "anthropic/claude-3-haiku": DEFAULT_MODEL,
  "openai/gpt-4o-mini": DEFAULT_MODEL,
  "qwen/qwen3-next-80b-a3b-instruct": DEFAULT_MODEL,
  "qwen/qwen3-next-80b-a3b-instruct:free": DEFAULT_MODEL,
};

const VALID_TONES: ReadonlySet<string> = new Set([
  "professional",
  "friendly",
  "concise",
]);

const KNOWN_GREETING_PHRASES = new Set([
  "dear",
  "good afternoon",
  "good evening",
  "good morning",
  "hello",
  "hey",
  "hi",
]);

const KNOWN_SIGN_OFFS = new Set([
  "all the best",
  "best",
  "best regards",
  "cordially",
  "kind regards",
  "regards",
  "respectfully",
  "sincerely",
  "thanks",
  "thank you",
  "warm regards",
]);

const BODY_MAX_LENGTH = 8_000;
const SUBJECT_MAX_LENGTH = 500;
const USER_NAME_MAX_LENGTH = 200;
const SENDER_NAME_MAX_LENGTH = 200;
const SENDER_EMAIL_MAX_LENGTH = 320;

const SYSTEM_PROMPT = `You are generating helpful email reply suggestions for a Gmail extension.
Read the email context and produce exactly 3 reply options.
Choose the 3 most likely response type labels for this email context, using concise 1-3 word labels that describe distinct reply intents.
Each reply must include one response type label and the full reply text for that intent.
Each reply should be plausible, natural, and ready to send with minimal editing.
Avoid inventing details not present in the email.
Format each reply as a proper email using this structure: "[appropriate greeting] [sender name],\\n\\n[body]\\n\\n[sign-off phrase],\\n\\n[extension user's name]".
Write each reply from the extension user's perspective, not from the sender's perspective.
Never sign off with the incoming sender's name, sender email address, or any identity copied from the incoming email.
Every reply must start with a natural greeting, such as "Hi", "Hello", or "Dear", followed by the sender name and a comma. If the sender name is unavailable, use a grammatically natural generic greeting such as "Hi there,". Every reply must end with a complete sign-off phrase followed on the next non-empty line by the extension user's name, or by "[your name here]" if their name is unknown.
Never use em dashes in replies, and use hyphens sparingly. Use commas, periods, colons, or parentheses instead.
Use \\n to represent line breaks within each reply text string (e.g. between greeting and body, between paragraphs, and before the sign-off).
Return valid JSON only in this exact format: {"replies": [{"type": "Label One", "text": "..."}, {"type": "Label Two", "text": "..."}, {"type": "Label Three", "text": "..."}]}
Do not include any text outside the JSON.`;

const TONE_INSTRUCTIONS: Record<TonePreset, string> = {
  professional: "Replies should be professional and formal.",
  friendly: "Replies should be warm, friendly, and conversational.",
  concise:
    "Replies should be brief and to the point, but still use proper email structure with greeting and sign-off separated by line breaks.",
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function corsHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Automessage-Token",
    "Access-Control-Max-Age": "86400",
  };
}

function json(
  data: unknown,
  status: number,
  origin: string,
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(origin),
    },
  });
}

function buildSenderContext(email: ParsedEmail): string {
  const fromName = email.fromName?.trim() ?? "";
  const fromEmail = email.fromEmail?.trim() ?? "";

  if (!fromName && !fromEmail) {
    return "Sender context: unavailable. Do not invent a recipient name.";
  }

  const lines = ["Sender context:"];
  if (fromName) {
    lines.push(`Sender name: ${fromName}`);
  }
  if (fromEmail) {
    lines.push(`Sender email: ${fromEmail}`);
  }
  lines.push(
    'Use the sender name only in the opening greeting, such as "Hi [sender name],", "Hello [sender name],", or "Dear [sender name],". Do not use the sender name or sender email as the reply sign-off. If the name is missing, generic, or just an email address, use "Hi there," and do not invent a name.',
  );

  return lines.join("\n");
}

function buildUserContext(email: ParsedEmail): string {
  const userName = email.userName?.trim() ?? "";

  if (!userName) {
    return "Extension user context: unavailable. Do not invent the user's name for the sign-off.";
  }

  return `Extension user context:
User name: ${userName}
Use this user name as the final line of the sign-off after a natural sign-off phrase, for example "Best,\\n\\n${userName}".`;
}

function buildUserPrompt(email: ParsedEmail, tone: TonePreset): string {
  return `Email subject: ${email.subject}

${buildUserContext(email)}

${buildSenderContext(email)}

Email content:
${email.body}

${TONE_INSTRUCTIONS[tone]}
Generate 3 distinct typed reply options.`;
}

function normalizeModel(model: string): string {
  const trimmed = model.trim();
  if (trimmed === "") {
    return DEFAULT_MODEL;
  }
  return MODEL_ALIASES[trimmed] ?? trimmed;
}

function buildUpstreamBody(email: ParsedEmail, settings: Settings) {
  return {
    model: normalizeModel(settings.model),
    messages: [
      { role: "system" as const, content: SYSTEM_PROMPT },
      { role: "user" as const, content: buildUserPrompt(email, settings.tone) },
    ],
    response_format: { type: "json_object" as const },
    max_tokens: 1030,
  };
}

function parseReplySuggestions(raw: string): AIReplySuggestions | null {
  const tryParse = (text: string): AIReplySuggestions | null => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return null;
    }

    if (typeof parsed !== "object" || parsed === null) {
      return null;
    }

    const replies = (parsed as { replies?: unknown }).replies;
    if (!Array.isArray(replies)) {
      return null;
    }

    const normalizedReplies: AIReplyOption[] = [];
    for (const reply of replies) {
      if (typeof reply !== "object" || reply === null) {
        return null;
      }
      const option = reply as { type?: unknown; text?: unknown };
      if (typeof option.type !== "string" || typeof option.text !== "string") {
        return null;
      }
      normalizedReplies.push({ type: option.type, text: option.text });
    }

    return { replies: normalizedReplies };
  };

  const direct = tryParse(raw);
  if (direct) {
    return direct;
  }

  const match = raw.match(/{.*}/s);
  return match ? tryParse(match[0]) : null;
}

function displayNameOrFallback(value: string | undefined, fallback: string): string {
  const name = value?.trim() ?? "";
  if (!name || name.includes("@")) {
    return fallback;
  }
  return name;
}

function trimBlankLines(lines: string[]): string[] {
  let start = 0;
  let end = lines.length;

  while (start < end && lines[start].trim() === "") {
    start++;
  }
  while (end > start && lines[end - 1].trim() === "") {
    end--;
  }

  return lines.slice(start, end);
}

function isGreetingLine(line: string): boolean {
  return greetingPhraseFromLine(line) !== null;
}

function greetingPhraseFromLine(line: string): string | null {
  const trimmed = line.trim();
  const lower = trimmed.toLowerCase();
  if (!lower.endsWith(",")) {
    return null;
  }

  const phrases = Array.from(KNOWN_GREETING_PHRASES).sort(
    (a, b) => b.length - a.length,
  );
  const phrase = phrases.find(
    (candidate) =>
      lower === `${candidate},` || lower.startsWith(`${candidate} `),
  );

  return phrase ? phrase[0].toUpperCase() + phrase.slice(1) : null;
}

function signOffPhraseFromLine(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 50 || trimmed.includes("@")) {
    return null;
  }

  const phrase = trimmed.includes(",")
    ? `${trimmed.split(",")[0].trim()},`
    : `${trimmed},`;

  const phraseWithoutComma = phrase.replace(/,$/, "").toLowerCase();
  return KNOWN_SIGN_OFFS.has(phraseWithoutComma) ? phrase : null;
}

function isLikelyNameLine(line: string): boolean {
  const trimmed = line.trim();
  return (
    trimmed.length > 0 &&
    trimmed.length <= 50 &&
    !trimmed.includes("@") &&
    !/[,.!?;:]/.test(trimmed)
  );
}

function removeTrailingSignOff(lines: string[]): {
  bodyLines: string[];
  signOffPhrase: string;
} {
  const nonEmptyIndexes = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => line.trim() !== "");

  if (nonEmptyIndexes.length === 0) {
    return { bodyLines: [], signOffPhrase: "Best," };
  }

  const last = nonEmptyIndexes[nonEmptyIndexes.length - 1];
  const previous = nonEmptyIndexes[nonEmptyIndexes.length - 2];
  const lastLineSignOff = signOffPhraseFromLine(last.line);
  const previousLineSignOff = previous
    ? signOffPhraseFromLine(previous.line)
    : null;

  if (previousLineSignOff && isLikelyNameLine(last.line)) {
    return {
      bodyLines: trimBlankLines(lines.slice(0, previous.index)),
      signOffPhrase: previousLineSignOff,
    };
  }

  if (lastLineSignOff) {
    return {
      bodyLines: trimBlankLines(lines.slice(0, last.index)),
      signOffPhrase: lastLineSignOff,
    };
  }

  return { bodyLines: lines, signOffPhrase: "Best," };
}

function removeEmDashes(text: string): string {
  return text.replace(/—/g, "-");
}

function enforceReplyLayout(text: string, email: ParsedEmail): string {
  const greetingName = displayNameOrFallback(email.fromName, "");
  const userName = displayNameOrFallback(email.userName, "[your name here]");

  let lines = trimBlankLines(
    removeEmDashes(text)
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .map((line) => line.trimEnd()),
  );

  let greetingPhrase = "Hi";
  if (lines.length > 0 && isGreetingLine(lines[0])) {
    greetingPhrase = greetingPhraseFromLine(lines[0]) ?? greetingPhrase;
    lines = trimBlankLines(lines.slice(1));
  }

  const { bodyLines, signOffPhrase } = removeTrailingSignOff(lines);
  const greeting = greetingName
    ? `${greetingPhrase} ${greetingName},`
    : `${greetingPhrase} there,`;

  return [greeting, "", ...bodyLines, "", signOffPhrase, "", userName].join("\n");
}

function normalizeReplyContent(raw: string, email: ParsedEmail): string {
  const suggestions = parseReplySuggestions(raw);
  if (!suggestions) {
    return raw;
  }

  return JSON.stringify({
    replies: suggestions.replies.map((reply) => ({
      type: reply.type,
      text: enforceReplyLayout(reply.text, email),
    })),
  });
}

function validateBody(body: unknown): body is RequestBody {
  if (typeof body !== "object" || body === null) return false;
  const b = body as Record<string, unknown>;

  const email = b["email"];
  if (typeof email !== "object" || email === null) return false;
  const e = email as Record<string, unknown>;
  if (typeof e["subject"] !== "string") return false;
  if (typeof e["body"] !== "string") return false;
  if (e["subject"].length > SUBJECT_MAX_LENGTH) return false;
  if (e["body"].length > BODY_MAX_LENGTH) return false;
  if (
    e["userName"] !== undefined &&
    (typeof e["userName"] !== "string" ||
      e["userName"].length > USER_NAME_MAX_LENGTH)
  ) {
    return false;
  }
  if (
    e["fromName"] !== undefined &&
    (typeof e["fromName"] !== "string" ||
      e["fromName"].length > SENDER_NAME_MAX_LENGTH)
  ) {
    return false;
  }
  if (
    e["fromEmail"] !== undefined &&
    (typeof e["fromEmail"] !== "string" ||
      e["fromEmail"].length > SENDER_EMAIL_MAX_LENGTH)
  ) {
    return false;
  }

  const settings = b["settings"];
  if (typeof settings !== "object" || settings === null) return false;
  const s = settings as Record<string, unknown>;
  if (typeof s["tone"] !== "string" || !VALID_TONES.has(s["tone"])) return false;
  if (typeof s["model"] !== "string") return false;
  const model = normalizeModel(s["model"] as string);
  if (!ALLOWED_MODELS.has(model)) return false;

  return true;
}

// ── Worker ────────────────────────────────────────────────────────────────────

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const origin = req.headers.get("Origin") ?? "";

    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(origin),
      });
    }

    const url = new URL(req.url);
    if (url.pathname !== "/v1/replies" || req.method !== "POST") {
      return json({ error: "not found" }, 404, origin);
    }

    // Origin check — limits abuse from browsers; not sufficient alone.
    const expectedOrigin = `chrome-extension://${env.ALLOWED_EXTENSION_ID}`;
    if (origin !== expectedOrigin) {
      return json({ error: "forbidden origin" }, 403, origin);
    }

    // Shared token check — the key security layer bundled into the extension.
    if (req.headers.get("X-Automessage-Token") !== env.AUTOMESSAGE_SHARED_TOKEN) {
      return json({ error: "forbidden" }, 403, origin);
    }

    // Rate limit per connecting IP (30 requests per 60 seconds).
    const ip = req.headers.get("CF-Connecting-IP") ?? "anon";
    const { success } = await env.RATE_LIMITER.limit({ key: ip });
    if (!success) {
      return json({ error: "rate limited" }, 429, origin);
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json({ error: "invalid JSON body" }, 400, origin);
    }

    if (!validateBody(body)) {
      return json({ error: "invalid request shape" }, 400, origin);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15_000);

    let upstream: Response;
    try {
      upstream = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://github.com/automessage",
          "X-Title": "Automessage Gmail Extension",
        },
        body: JSON.stringify(buildUpstreamBody(body.email, body.settings)),
        signal: controller.signal,
      });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return json({ error: "upstream timeout" }, 504, origin);
      }
      return json({ error: "upstream network error" }, 502, origin);
    } finally {
      clearTimeout(timeoutId);
    }

    const rawText = await upstream.text();

    if (!upstream.ok) {
      let detail = rawText;
      try {
        const errJson = JSON.parse(rawText) as OpenRouterChatResponse;
        if (errJson.error?.message) detail = errJson.error.message;
      } catch {
        // keep rawText
      }
      return json(
        { error: `OpenRouter error (${upstream.status}): ${detail}` },
        upstream.status,
        origin,
      );
    }

    // Parse OpenRouter response and extract the AI content string so we can
    // forward just what the extension needs, without leaking internal structure.
    let data: OpenRouterChatResponse;
    try {
      data = JSON.parse(rawText) as OpenRouterChatResponse;
    } catch {
      return json({ error: "invalid JSON from upstream" }, 502, origin);
    }

    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== "string" || content.trim() === "") {
      return json({ error: "missing content from upstream" }, 502, origin);
    }

    return json({ content: normalizeReplyContent(content, body.email) }, 200, origin);
  },
};

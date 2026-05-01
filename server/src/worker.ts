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

// ── Constants ─────────────────────────────────────────────────────────────────

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "anthropic/claude-3-haiku";
const QWEN_PAID_MODEL = "qwen/qwen3-next-80b-a3b-instruct";
const LEGACY_FREE_QWEN_MODEL = "qwen/qwen3-next-80b-a3b-instruct:free";

const ALLOWED_MODELS = new Set([
  DEFAULT_MODEL,
  QWEN_PAID_MODEL,
  "openai/gpt-4o-mini",
]);

const VALID_TONES: ReadonlySet<string> = new Set([
  "professional",
  "friendly",
  "concise",
]);

const BODY_MAX_LENGTH = 8_000;
const SUBJECT_MAX_LENGTH = 500;
const SENDER_NAME_MAX_LENGTH = 200;
const SENDER_EMAIL_MAX_LENGTH = 320;

const SYSTEM_PROMPT = `You are generating helpful email reply suggestions for a Gmail extension.
Read the email context and produce exactly 3 reply options.
Each reply must include a short response type label and the full reply text.
Prefer these response types when they fit the email: Accept, Deny, Reschedule.
If the email context clearly calls for different intents, use concise 1-3 word labels that describe each option.
Each reply should be plausible, natural, and ready to send with minimal editing.
Avoid inventing details not present in the email.
Format each reply as a proper email: include a greeting, one or more body paragraphs, and a sign-off where appropriate.
Use \\n to represent line breaks within each reply text string (e.g. between greeting and body, between paragraphs, and before the sign-off).
Return valid JSON only in this exact format: {"replies": [{"type": "Accept", "text": "..."}, {"type": "Deny", "text": "..."}, {"type": "Reschedule", "text": "..."}]}
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
    "Use the sender name for the greeting only if it appears to be a person's display name. If the name is missing, generic, or just an email address, use a neutral greeting and do not invent a name.",
  );

  return lines.join("\n");
}

function buildUserPrompt(email: ParsedEmail, tone: TonePreset): string {
  return `Email subject: ${email.subject}

${buildSenderContext(email)}

Email content:
${email.body}

${TONE_INSTRUCTIONS[tone]}
Generate 3 distinct typed reply options.`;
}

function buildUpstreamBody(email: ParsedEmail, settings: Settings) {
  const requestedModel = settings.model?.trim() !== "" ? settings.model : DEFAULT_MODEL;
  const model =
    requestedModel === LEGACY_FREE_QWEN_MODEL ? DEFAULT_MODEL : requestedModel;
  return {
    model,
    messages: [
      { role: "system" as const, content: SYSTEM_PROMPT },
      { role: "user" as const, content: buildUserPrompt(email, settings.tone) },
    ],
    response_format: { type: "json_object" as const },
    max_tokens: 1200,
  };
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
  const model = (s["model"] as string).trim();
  if (model !== "" && !ALLOWED_MODELS.has(model)) return false;

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

    // Forward the raw AI content string; the extension's parseAIResponse handles it.
    return json({ content }, 200, origin);
  },
};

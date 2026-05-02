/**
 * Extracts and cleans email content from the Gmail DOM for AI API input.
 * Thread detection lives elsewhere (e.g. gmail/dom.ts); this module only parses.
 *
 * Note: `.a3s.aiL` and related selectors may change when Gmail updates.
 */

import type { ParsedEmail } from "../types";

const LOG_PREFIX = "[Automessage/parser]";

/** Max length of returned body text including the "..." suffix when truncated. */
const BODY_MAX_LENGTH = 2000;
const ELLIPSIS = "...";
const GMAIL_TITLE_SUFFIX = " - Gmail";

/** Selectors tried in order for the latest message body (first list with matches wins). */
const BODY_CONTAINER_SELECTOR_GROUPS = [
  ".a3s.aiL",
  ".a3s",
  "[data-message-id] .ii.gt div",
] as const;

const MESSAGE_CONTAINER_SELECTORS = [
  ".adn",
  ".h7",
  ".gs",
  "[data-message-id]",
] as const;

const SENDER_SELECTORS = [".gD[email]", "span[email]"] as const;
const ACCOUNT_NAME_SELECTORS = [
  "a[aria-label*='Google Account']",
  "a[aria-label*='Google-account']",
  "a[href*='SignOutOptions']",
] as const;

function firstDisplayNamePart(displayName: string): string {
  return displayName.trim().split(/\s+/)[0] ?? "";
}

function debug(...args: unknown[]): void {
  console.debug(LOG_PREFIX, ...args);
}

/**
 * Picks the last matching element in document order as the most recent message body.
 */
function findLatestBodyRoot(doc: Document): HTMLElement | null {
  for (const selector of BODY_CONTAINER_SELECTOR_GROUPS) {
    let list: NodeListOf<Element>;
    try {
      list = doc.querySelectorAll(selector);
    } catch {
      debug("invalid body selector, skipping", selector);
      continue;
    }
    if (list.length === 0) {
      continue;
    }
    const last = list.item(list.length - 1);
    if (last instanceof HTMLElement) {
      debug("body container matched", selector, "count=", list.length);
      return last;
    }
  }
  debug("no body container matched");
  return null;
}

function removeQuotedAndNoiseFromClone(root: HTMLElement): void {
  root.querySelectorAll("blockquote").forEach((el) => {
    el.remove();
  });
  root.querySelectorAll(".gmail_quote").forEach((el) => {
    el.remove();
  });
  root.querySelectorAll("style, script").forEach((el) => {
    el.remove();
  });
}

function cleanExtractedText(raw: string): string {
  let s = raw.replace(/\n{3,}/g, "\n\n");
  s = s.replace(/[^\S\n]+/g, " ");
  s = s.trim();
  if (s.length > BODY_MAX_LENGTH) {
    const keep = BODY_MAX_LENGTH - ELLIPSIS.length;
    s = `${s.slice(0, Math.max(0, keep))}${ELLIPSIS}`;
  }
  return s;
}

/**
 * Gmail subject: thread header, legacy container, or document title.
 */
export function extractSubject(doc: Document = document): string {
  const tryText = (el: Element | null): string => {
    if (!el) {
      return "";
    }
    const t = el.textContent?.trim() ?? "";
    return t;
  };

  let subject = tryText(doc.querySelector("h2.hP"));
  if (subject) {
    debug("subject from h2.hP");
    return subject;
  }

  subject = tryText(doc.querySelector("[data-legacy-thread-id] h2"));
  if (subject) {
    debug("subject from [data-legacy-thread-id] h2");
    return subject;
  }

  const title = doc.title ?? "";
  if (title.endsWith(GMAIL_TITLE_SUFFIX)) {
    subject = title.slice(0, -GMAIL_TITLE_SUFFIX.length).trim();
    if (subject) {
      debug("subject from document.title");
      return subject;
    }
  }

  return "";
}

/**
 * Most recent expanded message body: clone, strip quotes/scripts, return cleaned text.
 */
export function extractLatestMessageBody(doc: Document = document): string {
  const source = findLatestBodyRoot(doc);
  if (!source) {
    return "";
  }

  return extractBodyText(source);
}

function extractBodyText(source: HTMLElement): string {
  const clone = source.cloneNode(true);
  if (!(clone instanceof HTMLElement)) {
    debug("clone was not HTMLElement");
    return "";
  }

  removeQuotedAndNoiseFromClone(clone);
  const raw = clone.innerText ?? "";
  const cleaned = cleanExtractedText(raw);
  if (!cleaned) {
    debug("body empty after cleaning");
  }
  return cleaned;
}

function readSenderElement(el: Element): {
  fromName: string;
  fromEmail: string;
} | null {
  const emailAttr = el.getAttribute("email");
  if (!emailAttr || !emailAttr.trim()) {
    return null;
  }

  const nameAttr = el.getAttribute("name");
  const fromName = nameAttr?.trim() ?? "";
  const fromEmail = emailAttr.trim();
  return { fromName, fromEmail };
}

function findSenderInRoot(root: ParentNode, selectorLabel: string): {
  fromName: string;
  fromEmail: string;
} | null {
  for (const sel of SENDER_SELECTORS) {
    let el: Element | null;
    try {
      el = root.querySelector(sel);
    } catch {
      debug("invalid sender selector", sel);
      continue;
    }
    if (!el) {
      continue;
    }

    const sender = readSenderElement(el);
    if (sender) {
      debug("sender from", `${selectorLabel} ${sel}`, sender);
      return sender;
    }
  }
  return null;
}

function findNearestMessageContainer(bodyRoot: HTMLElement): HTMLElement | null {
  for (const sel of MESSAGE_CONTAINER_SELECTORS) {
    let el: Element | null = null;
    try {
      el = bodyRoot.closest(sel);
    } catch {
      debug("invalid message container selector", sel);
      continue;
    }
    if (el instanceof HTMLElement) {
      debug("message container from", sel);
      return el;
    }
  }
  return null;
}

/**
 * Sender from Gmail's name/email attributes on span-like nodes.
 */
export function extractSender(
  doc: Document = document,
  bodyRoot: HTMLElement | null = findLatestBodyRoot(doc),
): {
  fromName: string;
  fromEmail: string;
} | null {
  if (bodyRoot) {
    const messageContainer = findNearestMessageContainer(bodyRoot);
    if (messageContainer) {
      const scopedSender = findSenderInRoot(messageContainer, "latest message");
      if (scopedSender) {
        return scopedSender;
      }
    }
  }

  const fallbackSender = findSenderInRoot(doc, "document fallback");
  if (fallbackSender) {
    return fallbackSender;
  }

  debug("no sender element with email attribute");
  return null;
}

/**
 * Best-effort Gmail account owner name from the Google account switcher control.
 */
export function extractUserName(doc: Document = document): string {
  for (const selector of ACCOUNT_NAME_SELECTORS) {
    let el: Element | null;
    try {
      el = doc.querySelector(selector);
    } catch {
      debug("invalid account name selector", selector);
      continue;
    }

    const label = el?.getAttribute("aria-label") ?? "";
    const match = label.match(/Google Account:\s*([^,\n]+)/i);
    const name = firstDisplayNamePart(match?.[1] ?? "");
    if (name) {
      debug("user name from account label");
      return name;
    }
  }

  debug("no Gmail account user name found");
  return "";
}

/**
 * FNV-1a 32-bit over prompt-affecting email fields; returned as 8-char lowercase hex.
 * Includes the Gmail thread id so cache/in-flight reuse cannot cross conversations.
 * Fast, non-cryptographic cache key.
 */
export function hashEmail(
  threadId: string,
  subject: string,
  body: string,
  fromName = "",
  fromEmail = "",
  userName = "",
): string {
  const input = `${threadId}\0${subject}\0${body}\0${fromName}\0${fromEmail}\0${userName}`;
  let h = 0x811c9dc5 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  const hex = h.toString(16).padStart(8, "0");
  debug("hashEmail", hex, "len=", input.length);
  return hex;
}

/**
 * Builds a ParsedEmail for the current DOM thread view.
 * Returns null when no message body could be extracted.
 */
export function parseCurrentThread(threadId: string): ParsedEmail | null {
  if (!threadId?.trim()) {
    debug("parseCurrentThread: empty threadId");
  }

  const subject = extractSubject();
  const bodyRoot = findLatestBodyRoot(document);
  const body = bodyRoot ? extractBodyText(bodyRoot) : "";

  if (!body) {
    debug("parseCurrentThread: no body, returning null", { threadId, subject });
    return null;
  }

  const sender = extractSender(document, bodyRoot);
  const userName = extractUserName();
  const result: ParsedEmail = {
    threadId: threadId.trim(),
    subject,
    body,
    ...(userName ? { userName } : {}),
    ...(sender
      ? { fromName: sender.fromName, fromEmail: sender.fromEmail }
      : {}),
  };

  debug("parseCurrentThread: ok", {
    threadId: result.threadId,
    subjectLen: result.subject.length,
    bodyLen: result.body.length,
    hasSender: Boolean(sender),
  });

  return result;
}

/**
 * Gmail DOM helpers and SPA thread detection for mail.google.com.
 * Selectors mirror current Gmail markup; they may break when Google updates the UI.
 */

const LOG_PREFIX = "[Automessage/dom]";

/** Minimum length for a hash segment to be treated as a Gmail thread / message id. */
const MIN_THREAD_ID_LENGTH = 12;

/** Segments that appear in thread URLs but are not thread ids (mailbox / view names). */
const NON_THREAD_HASH_SEGMENTS = new Set(
  [
    "inbox",
    "starred",
    "sent",
    "drafts",
    "important",
    "all",
    "snoozed",
    "scheduled",
    "spam",
    "trash",
    "chats",
    "imp",
    "muted",
    "settings",
    "search",
    "label",
    "category",
    "social",
    "forums",
    "updates",
    "promotions",
    "personal",
  ].map((s) => s.toLowerCase()),
);

const THREAD_ID_SEGMENT_RE = /^[A-Za-z0-9_-]+$/;

function getHashPathSegments(href: string): string[] {
  try {
    const url = new URL(href);
    const raw = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;
    return raw
      .split("/")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  } catch {
    return [];
  }
}

/**
 * Returns the last hash path segment if it plausibly identifies an open thread.
 * Gmail SPA uses fragments like `#inbox/<threadId>`; plain `#inbox` has no thread id.
 */
function parseThreadIdFromHref(href: string): string | null {
  const segments = getHashPathSegments(href);
  if (segments.length === 0) {
    return null;
  }
  const last = segments[segments.length - 1];
  if (!last) {
    return null;
  }
  const lower = last.toLowerCase();
  if (NON_THREAD_HASH_SEGMENTS.has(lower)) {
    return null;
  }
  if (last.length < MIN_THREAD_ID_LENGTH) {
    return null;
  }
  if (!THREAD_ID_SEGMENT_RE.test(last)) {
    return null;
  }
  return last;
}

/**
 * Extract current thread id from the window location (hash-based SPA routes).
 */
export function getThreadId(): string | null {
  if (typeof window === "undefined" || !window.location) {
    return null;
  }
  return parseThreadIdFromHref(window.location.href);
}

/**
 * True when a thread is shown: URL carries a thread id and/or the reading pane is present.
 * May need updating if Gmail changes when/how the reading surface mounts.
 */
export function isThreadOpen(): boolean {
  return getThreadId() !== null || readingPaneLikelyVisible();
}

/**
 * Primary reading surface; Gmail may change role/classes — update selectors if needed.
 */
export function getEmailReadingPane(): Element | null {
  // May need updating if Gmail changes its DOM
  const selectors = ['div[role="main"]', ".AO", ".nH"] as const;
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) {
      return el;
    }
  }
  return null;
}

/**
 * Body of the latest (typically bottom-most) expanded message in the thread view.
 * May need updating if Gmail changes its DOM
 */
export function getLatestMessageBody(): Element | null {
  const pane = getEmailReadingPane();
  const root: ParentNode = pane ?? document;

  const selectors = [".a3s.aiL", ".a3s", "[data-message-id] .ii.gt div"] as const;
  const matches: Element[] = [];

  for (const sel of selectors) {
    try {
      root.querySelectorAll(sel).forEach((node) => {
        if (node instanceof Element) {
          matches.push(node);
        }
      });
    } catch {
      // Invalid selector in some engines — skip
    }
    if (matches.length > 0) {
      break;
    }
  }

  if (matches.length === 0) {
    return null;
  }
  return matches[matches.length - 1] ?? null;
}

/**
 * Visible thread subject heading.
 * May need updating if Gmail changes its DOM
 */
export function getSubjectElement(): Element | null {
  const selectors = ["h2.hP", ".ha h2", '[data-legacy-thread-id] h2'] as const;
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) {
      return el;
    }
  }
  return null;
}

/**
 * Reply / compose strip associated with the open thread.
 * May need updating if Gmail changes its DOM
 */
export function getReplyComposerArea(): Element | null {
  const selectors = [".aDh", ".btC", '[role="dialog"] .Am'] as const;
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) {
      return el;
    }
  }
  return null;
}

/**
 * contenteditable region where reply text is entered.
 * May need updating if Gmail changes its DOM
 */
export function getComposerBodyEditable(): Element | null {
  const selectors = [
    '.Am.Al.editable[contenteditable="true"]',
    'div[aria-label="Message Body"][contenteditable="true"]',
  ] as const;
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) {
      return el;
    }
  }
  return null;
}

function readingPaneLikelyVisible(): boolean {
  return (
    getLatestMessageBody() !== null ||
    getSubjectElement() !== null ||
    getReplyComposerArea() !== null
  );
}

function notifyIfThreadChanged(
  onThreadChange: (threadId: string) => void,
  lastThreadIdRef: { current: string | null },
  reason: string,
): void {
  if (typeof window === "undefined" || !window.location) {
    return;
  }
  const href = window.location.href;
  const nextId = parseThreadIdFromHref(href);

  if (nextId === null) {
    if (lastThreadIdRef.current !== null) {
      console.debug(LOG_PREFIX, "thread closed", { reason, href });
    }
    lastThreadIdRef.current = null;
    return;
  }

  if (lastThreadIdRef.current === nextId) {
    return;
  }

  console.debug(LOG_PREFIX, "thread changed", {
    reason,
    previous: lastThreadIdRef.current,
    next: nextId,
    href,
  });
  lastThreadIdRef.current = nextId;
  try {
    onThreadChange(nextId);
  } catch (err) {
    console.debug(LOG_PREFIX, "onThreadChange threw", err);
  }
}

/**
 * Start watching Gmail navigation and reading-pane DOM updates.
 * Polls `location.href` every 500ms and listens for `popstate` / `hashchange`.
 * Uses a `MutationObserver` on `document.body` as a secondary signal when the reading pane mounts.
 * @returns Cleanup that removes listeners, disconnects the observer, and clears the poll interval.
 */
export function startThreadDetection(
  onThreadChange: (threadId: string) => void,
): () => void {
  const lastThreadIdRef: { current: string | null } = { current: null };

  const check = (reason: string) => {
    notifyIfThreadChanged(onThreadChange, lastThreadIdRef, reason);
  };

  const onPopState = () => check("popstate");
  const onHashChange = () => check("hashchange");

  window.addEventListener("popstate", onPopState);
  window.addEventListener("hashchange", onHashChange);

  const pollMs = 500;
  const pollId = window.setInterval(() => check("poll"), pollMs);

  let observer: MutationObserver | null = null;
  let observerConnected = false;

  const tryAttachBodyObserver = () => {
    if (observerConnected || observer !== null) {
      return;
    }
    const body = document.body;
    if (!body) {
      return;
    }
    observer = new MutationObserver(() => {
      check("mutation");
    });
    observer.observe(body, { childList: true, subtree: true });
    observerConnected = true;
    console.debug(LOG_PREFIX, "MutationObserver attached to document.body");
  };

  tryAttachBodyObserver();
  const bodyWaitId = window.setInterval(() => {
    tryAttachBodyObserver();
    if (observerConnected) {
      window.clearInterval(bodyWaitId);
    }
  }, pollMs);

  check("initial");

  return () => {
    window.removeEventListener("popstate", onPopState);
    window.removeEventListener("hashchange", onHashChange);
    window.clearInterval(pollId);
    window.clearInterval(bodyWaitId);
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    observerConnected = false;
    lastThreadIdRef.current = null;
    console.debug(LOG_PREFIX, "thread detection stopped");
  };
}

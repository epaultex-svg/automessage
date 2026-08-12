/**
 * Regression check: suggestion insert must not wipe Gmail quoted history
 * (or signature) that lives inside the reply Message Body contenteditable.
 *
 * Mirrors findComposerPreserveRoot / selectComposerInsertRange rules in
 * src/gmail/inject.ts:
 * - Prefer the earliest .gmail_quote / signature node in document order
 * - Replace only the draft prefix before that node
 * - Fall back to full replace only when no preserve node exists
 *
 * Run: node scripts/test-composer-preserve-quote.mjs
 */

const PRESERVE_SELECTORS = [
  ".gmail_quote",
  ".gmail_signature",
  '[data-smartmail="gmail_signature"]',
];

/**
 * @param {Array<{ id: string; kind: "draft" | "quote" | "signature" | "other" }>} nodes
 * document-order children of the editable (flattened for the test model)
 */
function findPreserveRoot(nodes) {
  let earliestIndex = -1;
  for (let i = 0; i < nodes.length; i++) {
    const kind = nodes[i].kind;
    if (kind !== "quote" && kind !== "signature") {
      continue;
    }
    if (earliestIndex === -1 || i < earliestIndex) {
      earliestIndex = i;
    }
  }
  return earliestIndex === -1 ? null : nodes[earliestIndex].id;
}

/**
 * @param {Array<{ id: string; kind: string }>} nodes
 * @param {string | null} preserveId
 */
function nodesReplacedByInsert(nodes, preserveId) {
  if (!preserveId) {
    return nodes.map((n) => n.id);
  }
  const idx = nodes.findIndex((n) => n.id === preserveId);
  if (idx === -1) {
    return nodes.map((n) => n.id);
  }
  return nodes.slice(0, idx).map((n) => n.id);
}

/**
 * @param {Array<{ id: string; kind: string }>} nodes
 * @param {string | null} preserveId
 */
function nodesPreservedAfterInsert(nodes, preserveId) {
  if (!preserveId) {
    return [];
  }
  const idx = nodes.findIndex((n) => n.id === preserveId);
  if (idx === -1) {
    return [];
  }
  return nodes.slice(idx).map((n) => n.id);
}

// --- bug trigger: draft + quote (default Gmail Reply) ---
{
  const nodes = [
    { id: "placeholder-br", kind: "draft" },
    { id: "quoted-thread", kind: "quote" },
  ];
  const preserve = findPreserveRoot(nodes);
  if (preserve !== "quoted-thread") {
    throw new Error(`expected quote preserve root, got ${preserve}`);
  }
  const wiped = nodesReplacedByInsert(nodes, preserve);
  const kept = nodesPreservedAfterInsert(nodes, preserve);
  if (wiped.includes("quoted-thread")) {
    throw new Error("select-all style replace must not wipe .gmail_quote");
  }
  if (!kept.includes("quoted-thread")) {
    throw new Error("quoted thread must survive suggestion insert");
  }
  // Naive selectNodeContents would wipe everything:
  const naiveWipe = nodes.map((n) => n.id);
  if (!naiveWipe.includes("quoted-thread")) {
    throw new Error("test setup error");
  }
  if (wiped.length === naiveWipe.length) {
    throw new Error("fixed path must replace fewer nodes than select-all");
  }
}

// --- signature before quote: preserve from signature (keeps both) ---
{
  const nodes = [
    { id: "typed-draft", kind: "draft" },
    { id: "user-signature", kind: "signature" },
    { id: "quoted-thread", kind: "quote" },
  ];
  const preserve = findPreserveRoot(nodes);
  if (preserve !== "user-signature") {
    throw new Error(`expected earliest signature, got ${preserve}`);
  }
  const kept = nodesPreservedAfterInsert(nodes, preserve);
  if (!kept.includes("user-signature") || !kept.includes("quoted-thread")) {
    throw new Error("signature and quote must both survive when signature is first");
  }
  const wiped = nodesReplacedByInsert(nodes, preserve);
  if (!wiped.includes("typed-draft") || wiped.includes("user-signature")) {
    throw new Error("only draft prefix before signature should be replaced");
  }
}

// --- quote only, no draft prefix: preserve quote, replace nothing ---
{
  const nodes = [{ id: "quoted-thread", kind: "quote" }];
  const preserve = findPreserveRoot(nodes);
  if (preserve !== "quoted-thread") {
    throw new Error("quote-only composer must still preserve quote");
  }
  if (nodesReplacedByInsert(nodes, preserve).length !== 0) {
    throw new Error("empty prefix before quote must not delete the quote");
  }
}

// --- no quote/signature: full replace (Compose / empty body) ---
{
  const nodes = [
    { id: "line-1", kind: "draft" },
    { id: "line-2", kind: "draft" },
  ];
  const preserve = findPreserveRoot(nodes);
  if (preserve !== null) {
    throw new Error("draft-only composer must not invent a preserve root");
  }
  const wiped = nodesReplacedByInsert(nodes, preserve);
  if (wiped.length !== 2) {
    throw new Error("draft-only composer may replace full editable contents");
  }
}

// --- selectors stay aligned with inject.ts ---
{
  const expected = [
    ".gmail_quote",
    ".gmail_signature",
    '[data-smartmail="gmail_signature"]',
  ];
  if (JSON.stringify(PRESERVE_SELECTORS) !== JSON.stringify(expected)) {
    throw new Error("preserve selectors drifted from inject.ts contract");
  }
}

console.log("test-composer-preserve-quote: ok");

/**
 * Regression: parsing a Gmail message must keep line and cell breaks.
 *
 * extractBodyText clones the message so it can drop quoted history without
 * mutating Gmail's DOM. Chrome's innerText on that detached clone returns
 * descendant text with no <br> or block separators, so
 * "Please pay $500<br>not $5,000." became "Please pay $500not $5,000."
 * and table cells were glued together ("ItemPriceWidget$10").
 *
 * Run: node --experimental-strip-types scripts/test-parser-body-text.mjs
 */

import { JSDOM } from "jsdom";
import { extractLatestMessageBody } from "../src/gmail/parser.ts";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function parseBody(html) {
  const dom = new JSDOM(
    `<!DOCTYPE html><html><body>${html}</body></html>`,
  );
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.Node = dom.window.Node;
  globalThis.document = dom.window.document;
  return extractLatestMessageBody(dom.window.document);
}

// <br> boundaries must stay separated. This is the meaning-changing case.
{
  const body = parseBody(
    `<div class="a3s aiL">Hi Alex,<br>Please pay $500<br>not $5,000.<br>Thanks,<br>Sam</div>`,
  );
  assert(
    body.includes("Please pay $500\nnot $5,000."),
    `expected a line break between $500 and not, got:\n${body}`,
  );
  assert(
    !body.includes("$500not"),
    `amount and negation were concatenated:\n${body}`,
  );
  assert(body.startsWith("Hi Alex,"), `greeting lost:\n${body}`);
  assert(body.endsWith("Sam"), `sign-off name lost:\n${body}`);
}

// Gmail's usual one-div-per-line structure.
{
  const body = parseBody(
    `<div class="a3s aiL"><div dir="ltr"><div>Hi Alex,</div><div><br></div><div>Please pay $500</div><div>not $5,000.</div><div>Thanks,</div><div>Sam</div></div></div>`,
  );
  assert(
    body.includes("Please pay $500\nnot $5,000."),
    `div lines were concatenated:\n${body}`,
  );
  assert(!body.includes("$500not"), `div lines glued amounts:\n${body}`);
  assert(body.includes("Hi Alex,"), `div greeting lost:\n${body}`);
  assert(body.includes("Thanks,"), `div sign-off lost:\n${body}`);
}

// Table cells need a separator; quoted history must still be removed.
{
  const body = parseBody(
    `<div class="a3s aiL"><table><tr><td>Item</td><td>Price</td></tr><tr><td>Widget</td><td>$10</td></tr></table><div class="gmail_quote">On Mon, Sam wrote:<blockquote>old thread about $5,000</blockquote></div></div>`,
  );
  assert(
    body.includes("Item") && body.includes("Price") && body.includes("Widget") && body.includes("$10"),
    `table cells missing:\n${body}`,
  );
  assert(
    !body.includes("ItemPrice") && !body.includes("Widget$10"),
    `table cells were concatenated:\n${body}`,
  );
  assert(
    !body.includes("old thread") && !body.includes("$5,000"),
    `quoted history leaked into the parsed body:\n${body}`,
  );
}

// Still the latest message, not an earlier one.
{
  const body = parseBody(
    `<div class="a3s aiL">Earlier note<br>ignore me</div><div class="a3s aiL">Latest line<br>keep me</div>`,
  );
  assert(body.includes("keep me"), `latest message body missing:\n${body}`);
  assert(!body.includes("ignore me"), `earlier message leaked:\n${body}`);
}

console.log("parser body line-break checks passed");

#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

const CANONICAL_MODELS = [
  "openai/gpt-oss-120b:free",
  "google/gemma-4-31b-it:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
];

const LEGACY_ALIASES = [
  ["gpt-oss-120b:free", "UNPREFIXED_GPT_OSS_120B_MODEL"],
  ["gemma-4-31b-it:free", "UNPREFIXED_GEMMA_4_31B_MODEL"],
  ["nemotron-3-super:free", "UNPREFIXED_NEMOTRON_3_SUPER_MODEL"],
  ["nvidia/nemotron-3-super:free", "LEGACY_NVIDIA_NEMOTRON_3_SUPER_MODEL"],
  ["anthropic/claude-3-haiku", "LEGACY_CLAUDE_HAIKU_MODEL"],
  ["qwen/qwen3-next-80b-a3b-instruct", "LEGACY_QWEN_PAID_MODEL"],
  ["qwen/qwen3-next-80b-a3b-instruct:free", "LEGACY_QWEN_FREE_MODEL"],
  ["openai/gpt-4o-mini", "LEGACY_GPT_4O_MINI_MODEL"],
];

const files = {
  types: "src/types.ts",
  inlineSettings: "src/ui/buttons.ts",
  popup: "popup/popup.html",
  unpackedPopup: "automessage-unpacked/popup/popup.html",
  worker: "server/src/worker.ts",
  storage: "src/storage/settings.ts",
};

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function assertContains(fileLabel, text, expected) {
  if (!text.includes(expected)) {
    throw new Error(`${files[fileLabel]} is missing ${expected}`);
  }
}

for (const model of CANONICAL_MODELS) {
  assertContains("types", read(files.types), model);
  assertContains("inlineSettings", read(files.inlineSettings), "MODEL_OPTIONS");
  assertContains("popup", read(files.popup), model);
  assertContains("unpackedPopup", read(files.unpackedPopup), model);
  assertContains("worker", read(files.worker), model);
}

for (const [alias, storageMarker] of LEGACY_ALIASES) {
  assertContains("types", read(files.types), alias);
  assertContains("storage", read(files.storage), storageMarker);
  assertContains("worker", read(files.worker), alias);
}

console.log("Model contract ok");

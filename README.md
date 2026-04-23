# Automessage — AI Reply Suggestions for Gmail

A Chrome extension (Manifest V3) that injects 3 AI-generated reply suggestions into any open Gmail thread. Powered by [OpenRouter](https://openrouter.ai).

---

## How it works

1. You open an email thread in Gmail.
2. The extension detects the thread, extracts the most recent message body and subject.
3. It sends that context to the background service worker, which calls the OpenRouter API.
4. Three reply suggestion buttons appear above the Gmail reply area.
5. Click a button → the text is inserted into Gmail's reply composer, ready to edit and send.

---

## Installation (unpacked extension)

### Prerequisites

- Node.js 18+ and npm
- Google Chrome (version 114+ recommended)
- A [Cloudflare account](https://dash.cloudflare.com/sign-up) (free) and an [OpenRouter API key](https://openrouter.ai/keys)

### Step 1 — Deploy the Cloudflare Worker proxy

The extension never contacts OpenRouter directly. Your API key lives only as a secret on the Worker.

```bash
cd server
npm install
npx wrangler login          # opens browser to authenticate with Cloudflare

# Store secrets — you will be prompted to paste the value for each
npx wrangler secret put OPENROUTER_API_KEY        # paste your sk-or-... key
npx wrangler secret put AUTOMESSAGE_SHARED_TOKEN  # paste: openssl rand -hex 32
npx wrangler secret put ALLOWED_EXTENSION_ID      # see step 3 below

# Deploy — note the *.workers.dev URL printed at the end
npx wrangler deploy
```

> **Getting your extension ID for `ALLOWED_EXTENSION_ID`:** load the unpacked extension first (step 3), copy the ID from `chrome://extensions`, then run `npx wrangler secret put ALLOWED_EXTENSION_ID` and redeploy.

### Step 2 — Build the extension

```bash
cd ..   # back to project root

# 1. Install dependencies
npm install

# 2. Configure the proxy
cp .env.example .env
# Edit .env and fill in:
#   AUTOMESSAGE_PROXY_URL   — the *.workers.dev URL from step 1
#   AUTOMESSAGE_SHARED_TOKEN — the same token you set on the Worker

# 3. Build (output goes to dist/)
npm run build
```

> **Security note:** The OpenRouter API key never enters the extension bundle. Only the Worker URL and the shared token are baked in at build time. If the token ever leaks, rotate it with `wrangler secret put AUTOMESSAGE_SHARED_TOKEN` and rebuild the extension — no OpenRouter key rotation needed.

### Step 3 — Load in Chrome

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **Load unpacked**
4. Select the **root folder** of this project (the one containing `manifest.json`)
5. The Automessage extension should appear with a blue envelope icon
6. Copy the extension ID shown under the extension name — you will need it for `ALLOWED_EXTENSION_ID` in step 1.

> **Note:** After any code change, run `npm run build` again and click the **↺ reload** icon on the extension card in `chrome://extensions`.

---

## Testing on Gmail

1. Open [mail.google.com](https://mail.google.com) in Chrome
2. Click into any email thread
3. Wait ~1–2 seconds — three suggestion pill buttons should appear above the reply strip
4. Click a suggestion — it inserts into Gmail's reply composer
5. Edit as needed and send normally

**Tip:** Use the **⟳ refresh** icon to regenerate suggestions with different options.  
**Tip:** Use the **⚙ gear** icon to adjust settings directly in-page without opening the popup.

---

## Development workflow

```bash
# Watch mode — rebuilds on every file save
npm run watch
```

After each rebuild, reload the extension at `chrome://extensions`.

Open the browser DevTools console on any Gmail tab — logs are prefixed with `[Automessage/...]` for easy filtering.

---

## Known limitations

| Limitation | Notes |
|---|---|
| Gmail DOM selectors | Gmail is a complex SPA. Selectors like `.a3s.aiL`, `.aDh`, and `.hP` are reverse-engineered and **may break** after Gmail updates. Check the browser console for errors if suggestions stop appearing. |
| Service worker lifecycle | MV3 service workers can be terminated by Chrome after inactivity. The in-memory reply cache is lost on termination (harmless — new suggestions are fetched on the next thread open). |
| `execCommand` deprecation | Inserting text into Gmail's composer uses `document.execCommand('insertText')`, which is deprecated but still the most reliable method for triggering Gmail's own input handlers. |
| No auto-send | By design — the extension only pre-fills the composer. You review and send manually. |
| Single-account Gmail | Tested on `mail.google.com/mail/u/0/`. Multi-account tabs (`/u/1/`, `/u/2/`) should work but are less tested. |
| OpenRouter rate limits | The extension makes one API request per unique email (deduplicated by content hash, cached 5 min). Heavy usage may hit your OpenRouter account's rate limits. |
| Worker rate limit | The proxy allows 30 requests per 60 seconds per IP. Regenerating suggestions rapidly may briefly hit this limit. |

---

## Project structure

```
Automessage/
├── manifest.json               # MV3 manifest
├── package.json
├── tsconfig.json
├── webpack.config.js
├── .env.example                # copy to .env; fill in proxy URL + shared token
├── server/                     # Cloudflare Worker proxy (deployed separately)
│   ├── package.json
│   ├── wrangler.toml
│   ├── tsconfig.json
│   └── src/
│       └── worker.ts           # POST /v1/replies — holds the OpenRouter key
├── scripts/
│   └── make-icons.js           # generates placeholder PNG icons
├── icons/                      # generated PNG icons (16, 48, 128)
├── src/
│   ├── types.ts                # shared interfaces & message contracts
│   ├── background.ts           # service worker — handles API calls
│   ├── content.ts              # content script entry point
│   ├── gmail/
│   │   ├── dom.ts              # DOM selectors + thread detection
│   │   ├── parser.ts           # email text extraction + cleaning
│   │   └── inject.ts           # injects suggestion row into Gmail DOM
│   ├── ai/
│   │   ├── openrouter.ts       # proxy client + cache (no key)
│   │   └── proxyConfig.ts      # compile-time proxy URL + token constants
│   ├── storage/
│   │   └── settings.ts         # chrome.storage read/write helpers
│   └── ui/
│       ├── buttons.ts          # suggestion button row component
│       └── sidebar.ts          # inline collapsible settings panel
├── styles/
│   └── content.css             # scoped styles for injected UI
├── popup/
│   ├── popup.html              # extension popup settings page
│   └── popup.ts                # popup script
└── dist/                       # webpack output (gitignored)
```

---

## Customising the AI model

The default model is `openai/gpt-4o-mini` (fast and cheap). You can change it in the popup or the inline settings gear. Any model available on OpenRouter works — for example:

- `anthropic/claude-3-haiku` — fast, high quality
- `google/gemini-flash-1.5` — very fast
- `meta-llama/llama-3.1-8b-instruct:free` — free tier

See the full list at [openrouter.ai/models](https://openrouter.ai/models).

---

## Future roadmap

The codebase is structured to support these features with minimal changes:

1. **Inbox prefetch** — generate suggestions for the top 5 unread emails while the inbox is open, so they appear instantly when you click in. Scaffold: `src/gmail/prefetch.ts`.

2. **"My style" mode** — scan your Sent folder for recent human-written emails, use them as few-shot examples in the AI prompt so replies sound like you. Scaffold: `src/ai/styleAnalyzer.ts`.

3. **Per-contact memory** — remember the tone/style that worked best for each contact and auto-select it. Scaffold: `src/storage/contactMemory.ts`.

4. **Style presets** — beyond professional/friendly/concise, add custom freeform tone descriptions ("like a Silicon Valley startup founder", "like a law firm partner").

5. **Side panel** — promote the inline settings gear to a proper Chrome side panel (`sidePanel` permission is already declared in the manifest).

6. **Keyboard shortcut** — open/regenerate suggestions via a configurable `chrome.commands` shortcut without touching the mouse.

---

## Privacy

- Your emails are sent to OpenRouter's API only when you open a thread (and only the most recent message body, truncated to ~8000 chars).
- Email content passes through the Cloudflare Worker proxy in transit but is not stored.
- Your OpenRouter API key never leaves the Cloudflare Worker environment and is never included in the extension bundle.
- No analytics, no telemetry.

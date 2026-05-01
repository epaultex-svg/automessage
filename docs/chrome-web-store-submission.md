# Chrome Web Store Submission Draft

This document provides draft Chrome Web Store review copy for Automessage — AI Reply Suggestions for Gmail.

## Single Purpose

Automessage generates AI-powered draft reply suggestions for the Gmail thread the user is viewing. It reads the current Gmail conversation context, requests reply suggestions from the configured AI service through a Cloudflare Worker proxy, and inserts a selected suggestion into the Gmail reply composer for the user to review and send manually.

## Permission Justifications

### `storage`

Used to save local extension settings, including selected AI model and tone. The extension uses `chrome.storage.local`; the code in this repository does not store email content, generated replies, analytics identifiers, or telemetry events.

## Host Permission Justifications

### `https://mail.google.com/*`

Required so the content script can run on Gmail, detect the currently open email thread, parse the subject, latest visible message body, and sender details when available, and insert selected draft text into the Gmail reply composer.

### `https://automessage-proxy.automessage.workers.dev/*`

Required so the Manifest V3 service worker can call the Automessage Cloudflare Worker proxy at `/v1/replies`. The proxy protects the OpenRouter API key and forwards the request to OpenRouter for AI reply generation.

## Data Usage Disclosure Guidance

For Chrome Web Store data disclosures, review should account for the following data flow:

- The extension parses Gmail subject, latest visible message body, sender name and sender email when available, and local model/tone settings.
- This data is sent to the Cloudflare Worker proxy at `/v1/replies` to generate reply suggestions.
- The Worker calls OpenRouter, which may route requests to the selected AI model provider.
- The extension stores only model and tone settings locally via `chrome.storage.local`.
- The code in this repository contains no analytics or telemetry.
- The extension does not automatically send emails.

Do not state that deployed infrastructure has zero logs unless the Cloudflare Worker, Cloudflare account settings, OpenRouter account settings, and selected model provider retention behavior have been confirmed by the operator.

## Remote Code Answer

Automessage does not load or execute remotely hosted JavaScript or other remote executable code in the extension. Extension scripts are bundled with the extension package.

Automessage does make remote HTTPS service calls to the configured Cloudflare Worker proxy and to OpenRouter through that proxy for AI processing. These calls return generated text suggestions, not executable code.

## Reviewer Notes

Automessage is limited to Gmail reply suggestion assistance. It does not send email automatically; users must select, review, edit if desired, and send replies themselves in Gmail.

The OpenRouter API key is stored as a Cloudflare Worker secret and is not bundled with the extension. The extension bundle contains the proxy URL and shared token configuration needed to call the deployed proxy.

The Worker source in this repository does not intentionally persist email content or generated replies. The operator should verify deployed Worker logging and provider retention settings before submission.

Privacy policy draft: `PRIVACY.md`.

## Pre-Submission Verification

Local checks completed:

- `npm run build:zip` completed successfully and generated `automessage.zip`.
- The ZIP includes `manifest.json`, `dist/background.js`, `dist/content.js`, `dist/popup.js`, `popup/popup.html`, `styles/content.css`, and icon assets.
- The generated JavaScript was scanned for `eval(`, `new Function`, `importScripts(`, `sourceMappingURL`, and remote script tag patterns; no matches were found.

Manual checks still needed before submission:

- Load the exact generated ZIP or unpacked build in `chrome://extensions`.
- Confirm the service worker starts without runtime errors.
- Open the popup and confirm settings load and save.
- Open Gmail, enter a thread, confirm suggestions appear, regenerate successfully, and insert into the composer.
- Confirm the deployed Cloudflare Worker `ALLOWED_EXTENSION_ID`, `AUTOMESSAGE_SHARED_TOKEN`, and OpenRouter secret match the submitted extension build.
- Confirm deployed Cloudflare/OpenRouter/model-provider logging and retention settings match the privacy policy and store disclosures.

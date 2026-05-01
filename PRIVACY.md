# Automessage Privacy Policy

Effective date: May 1, 2026

Automessage is a Chrome extension that provides AI-generated draft reply suggestions for Gmail threads. This policy explains what information the extension processes and how that information is used.

## Data Handled

Automessage processes email content only when you use the extension on an open Gmail thread. To generate reply suggestions, the extension may parse:

- The email subject.
- The latest visible message body.
- The Gmail thread identifier.
- The sender name and email address, when available in the Gmail page.
- Your Automessage settings, such as selected AI model and tone.

This information is used to request AI-generated reply suggestions. The extension does not read unrelated websites, does not read your inbox in bulk, does not access email content outside the active Gmail thread, and does not request broad browsing permissions.

## How Data Is Used

The extension sends the parsed Gmail context and selected settings to the configured Automessage Cloudflare Worker proxy endpoint at `/v1/replies`. The Worker forwards the necessary prompt content to OpenRouter so an AI model can generate reply suggestions.

Suggestions are inserted into Gmail only when you choose one. Automessage does not send emails automatically.

## Local Storage

The extension uses `chrome.storage.local` to store only local preference settings, such as the selected AI model and tone. Reply suggestions may be cached temporarily in extension memory for performance and are not permanently stored by the extension.

The code in this repository does not store email content, sender details, generated replies, analytics identifiers, or telemetry events in extension storage.

## Sharing

Email context needed to generate suggestions is shared with:

- The Cloudflare Worker proxy configured for this extension.
- OpenRouter, which routes the request to the selected AI model provider.

No analytics or telemetry sharing is present in the code in this repository.

## Analytics And Tracking

Automessage does not include analytics, advertising trackers, telemetry, or behavior tracking.

## Data Sale Or Transfer

Automessage does not sell, rent, or share personal data for advertising or unrelated purposes.

## Retention

The extension code does not persist email content. The Worker source in this repository does not intentionally store email content or generated replies. Email content passes through the Cloudflare Worker proxy in transit.

Actual logging and retention for the deployed Cloudflare Worker, Cloudflare account, OpenRouter account, and selected model provider must be confirmed by the operator of the deployed service. OpenRouter and its model providers may process submitted content according to their own policies.

## Security

The OpenRouter API key is intended to be stored only as a Cloudflare Worker secret. It is not included in the Chrome extension bundle.

Requests to the proxy use HTTPS. The extension is scoped to `https://mail.google.com/*` for Gmail page access and to the configured Automessage Worker host for reply generation.

## User Controls

You control when suggestions are used. Automessage only drafts suggestions and inserts selected text into the Gmail composer for review; you decide whether to edit or send the email.

You can change model and tone settings from the extension UI. You can stop extension processing by disabling or uninstalling Automessage. You can remove locally stored extension settings by uninstalling the extension or clearing the extension's local storage in Chrome.

## Chrome Web Store Limited Use Statement

Automessage's use and transfer of information received from Google APIs, Chrome extension APIs, and Gmail page content is limited to providing and improving the user-facing reply suggestion feature. Automessage does not use this information for advertising, does not sell this information, and does not use it to determine creditworthiness or for unrelated purposes.

The use of information received from Google APIs will adhere to the Chrome Web Store User Data Policy, including the Limited Use requirements.

## Contact

For privacy questions or deletion requests, use the support contact listed on the Chrome Web Store listing or contact the developer through the GitHub profile at https://github.com/epaultex-svg.

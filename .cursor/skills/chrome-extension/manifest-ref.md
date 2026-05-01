# Manifest V3 Key Reference

Full reference for every key supported in `manifest.json`. The only supported value for `manifest_version` is `3`.

Source: [developer.chrome.com/docs/extensions/reference/manifest](https://developer.chrome.com/docs/extensions/reference/manifest)

---

## Required by the Extensions Platform

### `manifest_version`
- **Type**: integer
- **Value**: always `3`
- **Required**: yes

### `name`
- **Type**: string (max 75 characters)
- **Required**: yes
- **Notes**: Shown in Chrome Web Store, install dialog, and `chrome://extensions`. Supports localization via `chrome.i18n`.

### `version`
- **Type**: string (dotted integer, e.g. `"1.0.0"`, `"2.4.1"`)
- **Required**: yes
- **Notes**: Used by Chrome to detect updates. Must increase monotonically for updates to be applied.

---

## Required by Chrome Web Store (strongly recommended)

### `description`
- **Type**: string (max 132 characters)
- **Notes**: Shown in Chrome Web Store listing and the user's extensions management page.

### `icons`
- **Type**: object mapping size strings to image paths
- **Recommended sizes**: `"16"`, `"32"`, `"48"`, `"128"`
- **Example**:
  ```json
  "icons": {
    "16": "icons/icon-16.png",
    "48": "icons/icon-48.png",
    "128": "icons/icon-128.png"
  }
  ```
- **Notes**: PNG recommended. The 128px icon is shown in the Web Store. The 48px icon appears on `chrome://extensions`. The 16px and 32px icons are used as favicon and context menus.

---

## Common Optional Keys

### `action`
- **Type**: object
- **Keys**:
  - `default_icon` — object mapping size strings to image paths
  - `default_title` — string; tooltip on hover
  - `default_popup` — path to an HTML file opened when the icon is clicked
- **Example**:
  ```json
  "action": {
    "default_popup": "popup.html",
    "default_icon": { "16": "icons/icon-16.png", "32": "icons/icon-32.png" },
    "default_title": "Open extension"
  }
  ```
- **Notes**: If `default_popup` is omitted, clicking the icon fires `chrome.action.onClicked`. Related API: `chrome.action`.

### `background`
- **Type**: object
- **Keys**:
  - `service_worker` — path to the JS file (required)
  - `type` — `"module"` to use ES modules in the service worker
- **Example**:
  ```json
  "background": {
    "service_worker": "sw.js",
    "type": "module"
  }
  ```
- **Notes**: The service worker is event-driven and non-persistent. There is no `"persistent"` key in MV3.

### `content_scripts`
- **Type**: array of objects
- **Object keys**:

| Key | Type | Required | Description |
|-----|------|----------|-------------|
| `matches` | string[] | yes | URL patterns where this script runs |
| `js` | string[] | no | JS files to inject |
| `css` | string[] | no | CSS files to inject |
| `run_at` | string | no | `"document_idle"` (default), `"document_start"`, `"document_end"` |
| `all_frames` | boolean | no | Inject into all frames, not just the top frame. Default: `false` |
| `exclude_matches` | string[] | no | URL patterns to exclude |
| `include_globs` | string[] | no | Glob patterns to additionally filter matches |
| `exclude_globs` | string[] | no | Glob patterns to exclude from matches |
| `match_about_blank` | boolean | no | Inject into `about:blank` frames whose parent matches. Default: `false` |
| `match_origin_as_fallback` | boolean | no | Inject into frames with `about:`, `data:`, `blob:` URLs whose origin matches. Default: `false` |
| `world` | string | no | `"ISOLATED"` (default) or `"MAIN"` (page's JS context) |

- **Example**:
  ```json
  "content_scripts": [
    {
      "matches": ["https://*.example.com/*"],
      "exclude_matches": ["*://*/*/admin/*"],
      "js": ["content.js"],
      "css": ["content.css"],
      "run_at": "document_idle"
    }
  ]
  ```

### `permissions`
- **Type**: array of strings
- **Notes**: Declares API-level permissions granted at install time. URL patterns (host access) must go in `host_permissions`, not here.
- **Example**: `["storage", "alarms", "contextMenus", "scripting", "activeTab"]`

### `host_permissions`
- **Type**: array of URL match pattern strings
- **Notes**: Grants access to specific origins for fetch, tab data, content script injection, cookies, and network request interception. Shown as an install warning.
- **Example**:
  ```json
  "host_permissions": [
    "https://*.example.com/*",
    "https://api.myservice.com/*"
  ]
  ```

### `optional_permissions`
- **Type**: array of strings
- **Notes**: Like `permissions`, but requested at runtime via `chrome.permissions.request()`. Not shown at install. Use for features the user opts into.

### `optional_host_permissions`
- **Type**: array of URL match pattern strings
- **Notes**: Like `host_permissions`, but requested at runtime.

### `web_accessible_resources`
- **Type**: array of objects
- **Object keys**:
  - `resources` — array of file paths or glob patterns (e.g., `"images/*.png"`)
  - `matches` — array of URL match patterns that can access these resources
  - `extension_ids` — array of extension IDs that can access these resources
- **Example**:
  ```json
  "web_accessible_resources": [
    {
      "resources": ["images/*.png", "fonts/*.woff"],
      "matches": ["https://example.com/*"]
    }
  ]
  ```
- **Notes**: Required if content scripts reference extension files via `chrome.runtime.getURL()`.

### `commands`
- **Type**: object mapping command names to config objects
- **Config keys**:
  - `suggested_key` — object with platform keys (`default`, `mac`, `windows`, `linux`, `chromeos`)
  - `description` — string shown in `chrome://extensions/shortcuts`
- **Example**:
  ```json
  "commands": {
    "toggle-feature": {
      "suggested_key": { "default": "Ctrl+Shift+Y", "mac": "Command+Shift+Y" },
      "description": "Toggle the feature"
    }
  }
  ```
- **Notes**: Use `chrome.commands.onCommand` listener. `_execute_action` is a reserved command that triggers `chrome.action.onClicked`.

### `content_security_policy`
- **Type**: object
- **Keys**:
  - `extension_pages` — CSP string applied to extension HTML pages (popup, options, etc.)
- **Example**:
  ```json
  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'self'"
  }
  ```
- **Notes**: MV3 forbids `unsafe-eval` and remotely hosted scripts. The default policy is already strict.

### `side_panel`
- **Type**: object
- **Keys**:
  - `default_path` — path to the HTML file shown in the side panel
- **Example**:
  ```json
  "side_panel": { "default_path": "sidepanel.html" }
  ```
- **Notes**: Also requires `"sidePanel"` in `permissions`. Use `chrome.sidePanel` API to control behavior.

### `options_ui`
- **Type**: object
- **Keys**:
  - `page` — path to the options HTML file (required)
  - `open_in_tab` — boolean; if `true`, opens in a new tab instead of embedded. Default: `false`
- **Example**:
  ```json
  "options_ui": { "page": "options.html", "open_in_tab": false }
  ```

### `options_page`
- **Type**: string (path to HTML file)
- **Notes**: Older alternative to `options_ui`; always opens in a new tab. Prefer `options_ui`.

### `declarative_net_request`
- **Type**: object
- **Keys**:
  - `rule_resources` — array of ruleset objects, each with `id`, `enabled`, and `path`
- **Example**:
  ```json
  "declarative_net_request": {
    "rule_resources": [
      { "id": "ruleset_1", "enabled": true, "path": "rules.json" }
    ]
  }
  ```
- **Notes**: Used for blocking/modifying network requests without seeing their content. Requires `"declarativeNetRequest"` permission.

---

## Rarely Used Optional Keys

### `short_name`
- **Type**: string (max 12 characters)
- **Notes**: Used in contexts where space is limited (e.g., app launcher). Falls back to a truncation of `name` if omitted.

### `version_name`
- **Type**: string (e.g., `"1.0 beta"`, `"build rc2"`)
- **Notes**: Human-readable version label shown on `chrome://extensions` instead of `version`.

### `minimum_chrome_version`
- **Type**: string (e.g., `"116"`, `"120.0.0.0"`)
- **Notes**: Users on older Chrome versions see a "Not compatible" warning and cannot install. Useful when relying on newer APIs.

### `homepage_url`
- **Type**: string (URL)
- **Notes**: Overrides the default homepage (which points to the Chrome Web Store listing). Useful for self-hosted extensions.

### `externally_connectable`
- **Type**: object
- **Keys**:
  - `matches` — URL patterns of web pages allowed to message this extension
  - `ids` — extension IDs allowed to connect
- **Example**:
  ```json
  "externally_connectable": {
    "matches": ["https://*.example.com/*"]
  }
  ```
- **Notes**: Enables `chrome.runtime.sendMessage()` calls from web pages to this extension.

### `incognito`
- **Type**: string
- **Values**:
  - `"spanning"` (default) — single extension instance covers both normal and incognito windows
  - `"split"` — separate instance in incognito mode with its own storage
  - `"not_allowed"` — extension is disabled in incognito
- **Notes**: Users can override via the extension's detail page.

### `key`
- **Type**: string (base64-encoded public key)
- **Notes**: Locks the extension to a specific ID during local development. Normally omitted; the Chrome Web Store assigns a stable ID.

### `oauth2`
- **Type**: object
- **Keys**: `client_id` (string), `scopes` (array of strings)
- **Notes**: Used with `chrome.identity.getAuthToken()` for OAuth 2.0 flows.

### `omnibox`
- **Type**: object
- **Keys**: `keyword` (string)
- **Notes**: Registers a keyword in the address bar. When the user types the keyword followed by a space, the extension handles subsequent input via `chrome.omnibox`.

### `devtools_page`
- **Type**: string (path to HTML file)
- **Notes**: Adds a panel to Chrome DevTools. Uses `chrome.devtools.*` APIs.

### `sandbox`
- **Type**: object
- **Keys**: `pages` (array of HTML file paths)
- **Notes**: Pages listed here run in a sandboxed environment without access to Chrome APIs or non-sandboxed extension pages.

### `chrome_url_overrides`
- **Type**: object
- **Keys**: `newtab`, `bookmarks`, or `history` — each pointing to an HTML file path
- **Notes**: Replaces built-in Chrome pages. Only one extension can override each page.

### `chrome_settings_overrides`
- **Type**: object
- **Keys**: `homepage`, `search_provider`, `startup_pages`
- **Notes**: Overrides Chrome settings. Requires user confirmation.

### `default_locale`
- **Type**: string (e.g., `"en"`, `"pt_BR"`)
- **Required** if the extension uses `_locales/` directory for i18n.

### `update_url`
- **Type**: string (URL)
- **Notes**: Only used for self-hosted extensions (outside Chrome Web Store). Points to an update manifest XML file.

### `storage`
- **Type**: object
- **Notes**: Declares a JSON schema for the `chrome.storage.managed` area. Used in enterprise deployments.

### `tts_engine`
- **Type**: object
- **Notes**: Registers the extension as a text-to-speech engine.

### `cross_origin_embedder_policy` / `cross_origin_opener_policy`
- **Type**: object with a `value` string
- **Notes**: Sets COEP/COOP HTTP headers for extension pages. Used when SharedArrayBuffer or advanced cross-origin isolation is needed.

---

## ChromeOS-Only Keys

| Key | Description |
|-----|-------------|
| `file_browser_handlers` | Access the ChromeOS file browser via `chrome.fileBrowserHandler` |
| `file_handlers` | Register the extension to handle specific file types |
| `file_system_provider_capabilities` | Create virtual file systems via `chrome.fileSystemProvider` |
| `input_components` | Register an Input Method Editor (IME) |

---

## URL Match Pattern Syntax

Used in `host_permissions`, `content_scripts.matches`, `web_accessible_resources.matches`, etc.

```
<scheme>://<host>/<path>
```

| Pattern | Matches |
|---------|---------|
| `https://*.example.com/*` | All HTTPS subdomains of example.com |
| `https://www.example.com/*` | Any path on www.example.com over HTTPS |
| `*://example.com/*` | HTTP and HTTPS on example.com |
| `<all_urls>` | All URLs (HTTP, HTTPS, FTP, file) — shows broad warning |
| `https://*/*` | All HTTPS URLs |
| `file:///*` | Local files (user must grant access manually) |

Schemes: `http`, `https`, `file`, `ftp`, `urn`. The `*` scheme matches `http` and `https` only.

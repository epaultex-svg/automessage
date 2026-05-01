# Chrome Extension Permissions Reference

Complete list of permissions available in Manifest V3. Declare in `manifest.json` under `permissions`, `optional_permissions`, `host_permissions`, or `optional_host_permissions`.

Source: [developer.chrome.com/docs/extensions/reference/permissions-list](https://developer.chrome.com/docs/extensions/reference/permissions-list)

---

## Permission Types

```json
{
  "permissions": ["storage", "alarms"],
  "host_permissions": ["https://*.example.com/*"],
  "optional_permissions": ["bookmarks"],
  "optional_host_permissions": ["https://*/*"]
}
```

- **`permissions`**: API access strings, granted at install
- **`host_permissions`**: URL match patterns, granted at install (may show warning)
- **`optional_permissions`**: granted at runtime via `chrome.permissions.request()`
- **`optional_host_permissions`**: URL match patterns granted at runtime

**Best practice**: prefer `optional_permissions` for anything not needed on first launch. Fewer install-time warnings improve conversion rate in the Chrome Web Store.

---

## No-Warning Permissions

Safe to declare in `permissions` without triggering an install warning.

| Permission | Unlocks | Notes |
|------------|---------|-------|
| `activeTab` | Temporary access to the active tab on user gesture | Preferred over broad `host_permissions`; grants access only while user interacts |
| `alarms` | `chrome.alarms` | Schedule periodic or delayed tasks |
| `audio` | `chrome.audio` | ChromeOS only |
| `contextMenus` | `chrome.contextMenus` | Add items to right-click menus |
| `declarativeContent` | `chrome.declarativeContent` | Show action based on page content without reading it |
| `declarativeNetRequestWithHostAccess` | `chrome.declarativeNetRequest` | Block/modify requests with host permissions |
| `declarativeNetRequestFeedback` | DNR error logging in DevTools | Unpacked extensions only; ignored in Web Store |
| `dns` | `chrome.dns` | ChromeOS only |
| `favicon` | Favicon API | Read favicon URLs of visited sites |
| `fontSettings` | `chrome.fontSettings` | |
| `gcm` | `chrome.gcm`, `chrome.instanceID` | Google Cloud Messaging |
| `identity` | `chrome.identity` (no email) | OAuth 2.0 tokens without exposing email |
| `idle` | `chrome.idle` | Detect when user is idle |
| `loginState` | `chrome.loginState` | ChromeOS only |
| `offscreen` | `chrome.offscreen` | Create hidden offscreen documents for DOM access from SW |
| `platformKeys` | `chrome.platformKeys` | ChromeOS only |
| `power` | `chrome.power` | Prevent display from sleeping |
| `printerProvider` | `chrome.printerProvider` | |
| `readingList` | `chrome.readingList` | Read and change reading list entries |
| `runtime` | `runtime.connectNative()`, `runtime.sendNativeMessage()` | Native messaging; rest of `chrome.runtime` needs no permission |
| `scripting` | `chrome.scripting` | Inject scripts/CSS programmatically; combine with `activeTab` or `host_permissions` |
| `search` | `chrome.search` | Perform browser searches |
| `sessions` | `chrome.sessions` | Access recently closed tabs/windows |
| `sidePanel` | `chrome.sidePanel` | Show/control the side panel |
| `storage` | `chrome.storage` | Persist data across sessions |
| `system.cpu` | `chrome.system.cpu` | CPU info |
| `system.display` | `chrome.system.display` | Display info |
| `system.memory` | `chrome.system.memory` | Memory info |
| `tts` | `chrome.tts` | Text-to-speech playback |
| `ttsEngine` | `chrome.ttsEngine` | Register as TTS engine |
| `unlimitedStorage` | Removes quota for `chrome.storage.local`, IndexedDB, CacheStorage | Use only if you genuinely need >10 MB |
| `userScripts` | `chrome.userScripts` | User must also enable in `chrome://extensions` |
| `vpnProvider` | `chrome.vpnProvider` | ChromeOS only |
| `wallpaper` | `chrome.wallpaper` | ChromeOS only |
| `webAuthenticationProxy` | `chrome.webAuthenticationProxy` | |

---

## Low-Warning Permissions

These show a single, relatively mild install warning.

| Permission | Warning shown to user | Unlocks |
|------------|----------------------|---------|
| `accessibilityFeatures.read` | "Read your accessibility settings" | `chrome.accessibilityFeatures` (read) |
| `accessibilityFeatures.modify` | "Change your accessibility settings" | `chrome.accessibilityFeatures` (write) |
| `bookmarks` | "Read and change your bookmarks" | `chrome.bookmarks` |
| `clipboardRead` | "Read data you copy and paste" | Web Clipboard API read |
| `clipboardWrite` | "Modify data you copy and paste" | Web Clipboard API write |
| `contentSettings` | "Change your settings that control websites' access to features such as cookies, JavaScript, plugins, geolocation, microphone, camera etc." | `chrome.contentSettings` |
| `declarativeNetRequest` | "Block content on any page" | `chrome.declarativeNetRequest` |
| `desktopCapture` | "Capture content of your screen" | `chrome.desktopCapture` |
| `downloads` | "Manage your downloads" | `chrome.downloads` |
| `downloads.open` | "Manage your downloads" | `chrome.downloads.open()` |
| `downloads.ui` | "Manage your downloads" | `chrome.downloads.setUiOptions()` |
| `geolocation` | "Detect your physical location" | Geolocation API without prompting user |
| `history` | "Read and change your browsing history on all signed-in devices" | `chrome.history` |
| `identity.email` | "Know your email address" | `chrome.identity` with email access |
| `management` | "Manage your apps, extensions, and themes" | `chrome.management` |
| `nativeMessaging` | "Communicate with cooperating native applications" | Native messaging host |
| `notifications` | "Display notifications" | `chrome.notifications` |
| `privacy` | "Change your privacy-related settings" | `chrome.privacy` |
| `system.storage` | "Identify and eject storage devices" | `chrome.system.storage` |
| `tabGroups` | "View and manage your tab groups" | `chrome.tabGroups` |
| `tabs` | "Read your browsing history" | Privileged Tab fields (url, title, favIconUrl); most `chrome.tabs` works without this |
| `topSites` | "Read a list of your most frequently visited websites" | `chrome.topSites` |
| `ttsEngine` | "Read all text spoken using synthesized speech" | TTS engine registration |
| `webNavigation` | "Read your browsing history" | `chrome.webNavigation` |

---

## High-Warning Permissions

These show alarming warnings. Use sparingly and prefer `optional_permissions` so users can grant them in context.

| Permission | Warning(s) shown to user | Unlocks |
|------------|--------------------------|---------|
| `debugger` | "Access the page debugger backend" + "Read and change all your data on all websites" | `chrome.debugger` |
| `pageCapture` | "Read and change all your data on all websites" | `chrome.pageCapture` |
| `proxy` | "Read and change all your data on all websites" | `chrome.proxy` |
| `tabCapture` | "Read and change all your data on all websites" | `chrome.tabCapture` |
| `webAuthenticationProxy` | "Read and change all your data on all websites" | `chrome.webAuthenticationProxy` |
| `sessions` + `history` | "Read and change your browsing history on all your signed-in devices" | Combined use |
| `sessions` + `tabs` | "Read your browsing history on all your signed-in devices" | Combined use |

---

## Special: `background`

```json
"permissions": ["background"]
```

Makes Chrome start up early (before user opens Chrome) and shut down late (after last window closes). Rarely needed in MV3 since service workers handle background events on-demand.

---

## Host Permissions

Declare URL patterns in `host_permissions` (not `permissions`) to grant cross-origin access:

```json
"host_permissions": [
  "https://*.example.com/*",
  "https://api.myservice.com/v2/*"
]
```

Host permissions are required for:
- `fetch()` to external origins from service worker or extension pages
- Reading sensitive `Tab` fields (url, title, favIconUrl) via `chrome.tabs`
- Programmatic content script injection via `chrome.scripting`
- `chrome.webRequest` network request monitoring
- `chrome.cookies` access
- `chrome.declarativeNetRequest` redirect/modify rules

### Match pattern quick reference

| Pattern | Covers |
|---------|--------|
| `https://example.com/*` | All paths on example.com over HTTPS |
| `https://*.example.com/*` | All subdomains |
| `*://example.com/*` | HTTP and HTTPS |
| `https://*/*` | All HTTPS URLs |
| `<all_urls>` | Everything — shows the most alarming warning |
| `file:///*` | Local files (user must manually grant) |

---

## Optional Permissions (Runtime Grant)

Request permissions at runtime using `chrome.permissions.request()`. Must be called from a user gesture (button click, etc.).

```js
// popup.js or content script
document.getElementById("enable-btn").addEventListener("click", async () => {
  const granted = await chrome.permissions.request({
    permissions: ["bookmarks"],
    origins: ["https://www.google.com/*"]
  });
  if (granted) {
    console.log("Permission granted");
  }
});
```

Check whether a permission is currently held:
```js
const hasPermission = await chrome.permissions.contains({
  permissions: ["history"]
});
```

Revoke a permission:
```js
await chrome.permissions.remove({ permissions: ["history"] });
```

---

## Permissions and `activeTab`

`"activeTab"` grants temporary access to the currently active tab when the user invokes the extension (clicks the toolbar icon, activates a keyboard shortcut, or selects a context menu item). It grants:

- Access to the tab's URL, title, and favicon
- Ability to inject scripts/CSS into the tab via `chrome.scripting`
- Ability to call `chrome.tabs.captureVisibleTab()` on the tab

`activeTab` does **not** persist — access expires when the tab navigates or the user switches tabs.

**Use `activeTab` instead of broad `host_permissions` whenever possible.** It requires no install warning and respects user privacy.

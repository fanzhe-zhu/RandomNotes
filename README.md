# RandomNotes

A Chrome (Manifest V3) extension for capturing quick, informal notes while you
browse. Highlight any text, send it to a draft, edit freely, and save when
you're ready. Optionally use Claude to summarize or restructure the result.

## Features

- **Capture from selection** — highlight text on any page and click the
  floating **+ RandomNote** button, press **Ctrl/Cmd+Shift+S**, or use the
  right‑click context menu. Each snippet is appended to your current draft as a
  blockquote with the page title attribution.
- **Draft side panel** — a persistent editor that opens on the side of your
  browser. Edit the title and body freely; nothing is saved to your notes
  library until you click **Save**.
- **Saved notes popup** — click the toolbar icon (or **Ctrl/Cmd+Shift+N**) to
  see all saved notes. Reopen any one in the side panel to keep editing, or
  delete it.
- **Summarize** — sends the draft to Claude and replaces it with a concise
  summary you can review and Save.
- **Organize** — sends the draft to Claude and rewrites it as a clean,
  structured markdown document, preserving the original information.
- **Local-first storage** — drafts and saved notes are stored in
  `chrome.storage.local`. Nothing is uploaded except calls to Anthropic when
  you click Summarize/Organize.

## Install (developer mode)

1. Open `chrome://extensions/` and enable **Developer mode**.
2. Click **Load unpacked** and select the `extension/` directory in this
   repository.
3. (Optional) Open the extension's **Options** page and paste your Anthropic
   API key. Without one, the extension still works for capture/edit/save —
   only Summarize and Organize need an API key.
4. **Reload any tabs that were already open** before you installed the
   extension — content scripts (the floating **+ RandomNote** button) only
   inject into pages loaded after install.

### Triggers

- **Floating button** — select text on a page; a small blue **+ RandomNote**
  button appears just above the selection.
- **Keyboard shortcut** — select text and press **Ctrl/Cmd+Shift+S**.
- **Right-click → Add to RandomNotes** — works on most pages. Some sites
  (e.g. claude.ai) call `preventDefault()` on `contextmenu`, which suppresses
  Chrome's native menu and any extension entries on it. Use the floating
  button or shortcut on those sites.

When a snippet lands, the extension flashes a **+1** badge on the toolbar
icon and opens the side panel with the updated draft.

### When a trigger doesn't work

Each trigger has unavoidable limits — these are platform constraints, not
bugs:

| Trigger | Fails on |
|---|---|
| Floating button | Closed Shadow DOM, sandboxed iframes, `chrome://`, Chrome Web Store, PDF viewer, `file://` (without permission), pages that set `user-select: none` |
| Keyboard shortcut | Same as above; plus another extension or the page itself binding the same key, plus selection cleared by a click/right-click |
| Right-click | Sites that call `preventDefault()` on `contextmenu` (e.g. claude.ai) — Chrome's entire native menu disappears in that case |

**Universal fallback:** if no trigger works on a particular page, copy the
text the normal way (`Ctrl/Cmd+C`) and paste directly into the side
panel's textarea.

## Layout

```
extension/
├── manifest.json
├── background/background.js     # service worker: context menu, shortcuts, AI calls
├── content/content.{js,css}     # in-page floating "+ RandomNote" button
├── sidepanel/                   # draft editor (title/body/Save/Summarize/Organize)
├── popup/                       # saved-notes browser
├── options/                     # API key + model picker
├── shared/storage.js            # draft + notes persistence helpers
├── shared/anthropic.js          # Claude API wrapper
└── icons/                       # 16/32/128 px toolbar icons
```

## Development notes

- The background script is an ES module service worker; all helpers are
  imported from `shared/`.
- The Anthropic call uses
  `anthropic-dangerous-direct-browser-access: true` since the request originates
  from the extension's background context, not arbitrary page scripts. The user
  supplies their own API key.
- Default model is Claude Haiku 4.5; Sonnet 4.6 and Opus 4.7 can be selected in
  Options.

# RandomNotes

A Chrome (Manifest V3) extension for capturing quick notes while you browse.
Highlight any text on any page, drop it into a draft with a clickable link
back to the source phrase, edit freely, and optionally have Claude summarize
or organize it.

![view](https://img.shields.io/badge/Chrome-MV3-blue) ![storage](https://img.shields.io/badge/storage-local-green)

## Install

The extension isn't on the Chrome Web Store — load it directly from this
repository.

1. **Clone the repo**
   ```bash
   git clone https://github.com/fanzhe-zhu/randomnotes.git
   cd randomnotes
   ```
2. **Open `chrome://extensions/`** in Chrome (or any Chromium browser — Edge,
   Brave, Arc).
3. Toggle **Developer mode** on (top-right corner).
4. Click **Load unpacked** and select the `extension/` directory inside the
   cloned repo (the folder that contains `manifest.json`).
5. *(Recommended)* Click the puzzle-piece icon in the Chrome toolbar and
   **pin** RandomNotes so the **RN** icon stays visible.
6. **Refresh any tabs that were already open** — the in-page floating button
   only injects into pages loaded after install.

That's it for capture/edit/save. The Summarize and Organize buttons need an
API key; see the next section.

## Add your Anthropic API key (for Summarize / Organize)

The Summarize and Organize buttons call Claude directly from your browser.
The extension does not ship a key — you supply your own.

1. Get a key from https://console.anthropic.com/ → **Settings → API Keys →
   Create Key**. Copy the `sk-ant-...` value (you only see it once).
2. Make sure your workspace has credits (**Settings → Billing**). Each
   Summarize/Organize call costs a fraction of a cent on Haiku.
3. Open the RandomNotes Options page in any of three ways:
   - Click the **RN** toolbar icon → **Settings** in the popup header, **or**
   - Right-click the **RN** icon → **Options**, **or**
   - Go to `chrome://extensions/` → RandomNotes → **Details → Extension
     options**.
4. Paste the key into **Anthropic API key**.
5. *(Optional)* Pick a different model. Default is Claude Haiku 4.5 (cheap,
   fast). Sonnet 4.6 / Opus 4.7 give higher-quality output at higher cost.
6. *(Optional)* Edit the **Summarize prompt** or **Organize prompt** to taste.
   Each has a **Reset to default** link if you want to revert.
7. Click **Save**.

The key is stored in `chrome.storage.local` on your machine only and is sent
exclusively to `https://api.anthropic.com` (the manifest's host permissions
restrict where the extension can reach).

## How to use

### 1. Capture a snippet

Select text on any web page, then trigger one of these:

| Trigger | How |
|---|---|
| **Floating button** | A small **+ RandomNote** button appears just above your selection. Click it. |
| **Keyboard shortcut** | Press **Ctrl/Cmd+Shift+S** while text is selected. |
| **Right-click menu** | Right-click → **Add to RandomNotes** |

When a snippet lands you'll see a **+1** badge flash on the toolbar icon and
a small toast in the page's bottom-right corner. The side panel auto-opens
on the right side of Chrome with the new snippet appended.

### 2. Edit / view variants

The side panel's dropdown switches between three views of the same draft:

- **Random notes** — the raw, chronologically appended snippets. Each ends
  with a clickable `[1]`, `[2]` reference. Clicking a reference opens the
  source page in a new tab and Chrome's text-fragment feature scrolls to and
  highlights the original phrase.
- **Organized** — populated when you click **Organize**. Claude restructures
  your random notes into themed sections, preserving the `[N]` references so
  they remain clickable.
- **Summary** — populated when you click **Summarize**. Claude writes a
  short overview, again preserving `[N]` references.

You can edit any view freely — edits update only the variant you're looking
at. The body is a contenteditable area; pasting strips formatting to plain
text.

### 3. Save as a named note

When you're done with a draft, click **Save note**. You'll be prompted to
name it (with a sensible default suggestion). The draft is persisted as a
named note containing **all three variants together**, then the editor
clears so the next capture starts fresh.

### 4. Manage saved notes

Click the **RN** toolbar icon (or press **Ctrl/Cmd+Shift+N**) to open the
saved-notes popup:

- **Click a row** to reopen that note in the side panel — you can keep
  editing and switch between its variants. Save again to update it in place.
- **Delete** removes a note (and clears the side panel if it was loaded
  from that note).
- **+ New note** discards or saves the current draft, then opens the side
  panel cleared and ready for a fresh capture session.
- **Continue current draft** appears only if there's an unsaved draft —
  jumps straight back into the side panel without prompting.
- **Settings** opens the Options page.

### 5. Closing the panel

If you close the side panel with an unsaved draft, Chrome's standard
"Leave site?" dialog appears as a reminder to Save first. Click **Stay** to
go back, or **Leave** — your draft is still persisted in storage either way.
You can resume it later via **Continue current draft** in the popup.

## When a trigger doesn't work

Some pages prevent capture; these are platform constraints, not bugs:

| Trigger | Fails on |
|---|---|
| Floating button | Closed Shadow DOM, sandboxed iframes, `chrome://*`, Chrome Web Store, PDF viewer, `file://` (without permission), pages with `user-select: none` |
| Keyboard shortcut | Same restricted contexts as above; plus another extension or page binding the same key |
| Right-click | Sites that call `preventDefault()` on `contextmenu` (e.g. claude.ai) — suppresses Chrome's native menu and every extension entry inside it |

**Universal fallback:** copy text with `Cmd/Ctrl+C`, then `Cmd/Ctrl+V`
directly into the side panel's textarea.

## Privacy

- Drafts and saved notes live in `chrome.storage.local` — never synced or
  uploaded.
- The only outbound network calls happen when you click **Summarize** or
  **Organize**: a single HTTPS POST to `https://api.anthropic.com/v1/messages`
  using your API key.
- The extension has no analytics, no tracking, no remote configuration.

## Layout

```
extension/
├── manifest.json
├── background/background.js     # service worker: shortcuts, menus, AI requests
├── content/content.{js,css}     # in-page selection capture + floating button
├── sidepanel/                   # draft editor with variant dropdown
├── popup/                       # saved-notes browser
├── options/                     # API key, model, prompts
├── shared/storage.js            # draft + notes persistence
├── shared/anthropic.js          # Claude API wrapper, default prompts
└── icons/                       # 16/32/128 px toolbar icons
```

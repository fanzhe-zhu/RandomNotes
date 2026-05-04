import { appendSnippetToDraft } from "../shared/storage.js";
import { summarizeText, organizeText } from "../shared/anthropic.js";

const MENU_ID = "randomnotes-add-selection";

// Run on every SW startup, not just install — ensures the action icon
// always opens the popup (not the side panel) regardless of any cached
// chrome.sidePanel.setPanelBehavior state from earlier installs.
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: false })
  .catch((err) => console.warn("[RandomNotes] setPanelBehavior failed:", err?.message));

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: "Add to RandomNotes",
    contexts: ["selection"]
  });
});

// Some sites (SPAs, slow-loading pages) end up missing the static
// content_script injection. Re-inject programmatically once the page
// finishes loading so the floating button works there. content.js
// guards itself against double-execution via window.__randomnotesLoaded.
chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.status !== "complete") return;
  const url = tab?.url || "";
  if (!/^https?:/.test(url)) return;
  chrome.scripting
    .executeScript({
      target: { tabId, allFrames: true },
      files: ["content/content.js"],
      injectImmediately: false
    })
    .catch(() => {});
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_ID || !tab?.id) return;
  const snippet = (info.selectionText || "").trim();
  if (!snippet) return;
  openPanelNow(tab.id);
  finishCapture(tab, snippet);
});

chrome.commands.onCommand.addListener((command) => {
  console.log("[RandomNotes] command:", command);
  if (command !== "capture-selection") return;
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (!tab?.id) {
      console.warn("[RandomNotes] no active tab for shortcut");
      return;
    }
    openPanelNow(tab.id);
    chrome.scripting.executeScript(
      {
        target: { tabId: tab.id, allFrames: true },
        func: () => {
          function deep() {
            const top = window.getSelection()?.toString();
            if (top && top.trim()) return top;
            const queue = [document];
            while (queue.length) {
              const root = queue.shift();
              try {
                const inner = root.getSelection?.()?.toString();
                if (inner && inner.trim()) return inner;
              } catch {}
              const els = root.querySelectorAll?.("*");
              if (!els) continue;
              for (const el of els) if (el.shadowRoot) queue.push(el.shadowRoot);
            }
            return "";
          }
          const live = (deep() || "").trim();
          if (live) return { text: live, source: "live" };
          const cache = window.__randomnotesLastSelection;
          if (cache?.text && Date.now() - (cache.ts || 0) < 30000) {
            return { text: cache.text, source: "cache" };
          }
          return { text: "", source: "none" };
        }
      },
      (results) => {
        if (chrome.runtime.lastError) {
          console.warn("[RandomNotes] executeScript error:", chrome.runtime.lastError.message);
        }
        const hits = (results || [])
          .map((r) => r?.result)
          .filter((r) => r?.text);
        const live = hits.find((r) => r.source === "live");
        const cache = hits.find((r) => r.source === "cache");
        const chosen = live || cache;
        console.log(
          "[RandomNotes] shortcut: live=" +
            !!live +
            " cache=" +
            !!cache +
            " chosen.len=" +
            (chosen?.text?.length || 0)
        );
        if (!chosen?.text) {
          flashBadge("∅", "#9ca3af");
          notifyTab(tab.id, "RandomNotes: nothing selected — highlight some text first", true);
          return;
        }
        finishCapture(tab, chosen.text.trim(), chosen.source);
      }
    );
  });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "rn:capture" && sender.tab) {
    const snippet = (msg.text || "").trim();
    if (snippet) {
      openPanelNow(sender.tab.id);
      finishCapture(sender.tab, snippet);
    }
    sendResponse({ ok: true });
    return true;
  }
  if (msg?.type === "rn:summarize") {
    summarizeText(msg.text)
      .then((text) => sendResponse({ ok: true, text }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }
  if (msg?.type === "rn:organize") {
    organizeText(msg.text)
      .then((text) => sendResponse({ ok: true, text }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }
  return false;
});

function openPanelNow(tabId) {
  try {
    chrome.sidePanel.open({ tabId });
  } catch {}
}

async function finishCapture(tab, snippet, source) {
  await appendSnippetToDraft({
    text: snippet,
    sourceUrl: tab.url,
    sourceTitle: tab.title
  });
  console.log("[RandomNotes] captured", snippet.length, "chars from", tab?.url, "source:", source || "live");
  flashBadge("+1", "#1f6feb");
  chrome.runtime.sendMessage({ type: "rn:draft-updated" }).catch(() => {});
  const suffix = source === "cache" ? " (used recent selection)" : "";
  notifyTab(tab?.id, `Added ${snippet.length} chars to RandomNotes draft${suffix}`, false);
}

function notifyTab(tabId, message, isError) {
  if (!tabId) return;
  chrome.tabs
    .sendMessage(tabId, { type: "rn:toast", message, isError })
    .catch(() => {});
}

let badgeTimer = null;
function flashBadge(text, color) {
  chrome.action.setBadgeBackgroundColor({ color });
  chrome.action.setBadgeText({ text });
  clearTimeout(badgeTimer);
  badgeTimer = setTimeout(() => {
    chrome.action.setBadgeText({ text: "" });
  }, 1500);
}

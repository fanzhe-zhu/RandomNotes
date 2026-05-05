import {
  getDraft,
  setDraft,
  clearDraft,
  saveNoteFromDraft,
  setVariant,
  VARIANT_LABEL
} from "../shared/storage.js";

const DRAFT_KEY = "rn:draft";

const variantEl = document.getElementById("variant");
const bodyEl = document.getElementById("body");
const statusEl = document.getElementById("status");
const titleEl = document.getElementById("note-title");
const saveBtn = document.getElementById("save");
const summarizeBtn = document.getElementById("summarize");
const organizeBtn = document.getElementById("organize");
const clearBtn = document.getElementById("clear");
const openSavedBtn = document.getElementById("open-saved");
const newNoteBtn = document.getElementById("new-note");

let draft = emptyDraft();
let saveTimer = null;
let lastRenderedAt = 0;
const ownWriteTimes = new Set();
let lastStoredVariants = { raw: "", organized: "", summary: "" };
let lastStoredRefsLen = 0;

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes[DRAFT_KEY]) return;
  const next = changes[DRAFT_KEY].newValue;
  if (!next) {
    draft = emptyDraft();
    snapshotStored(draft);
    render({ scrollToEnd: false });
    return;
  }
  if (ownWriteTimes.has(next.updatedAt)) {
    ownWriteTimes.delete(next.updatedAt);
    return;
  }
  if ((next.updatedAt || 0) <= lastRenderedAt) return;
  if (saveTimer != null && isCaptureAppendPattern(next)) {
    mergeCaptureAppend(next);
    return;
  }
  clearTimeout(saveTimer);
  saveTimer = null;
  draft = next;
  snapshotStored(draft);
  render({ scrollToEnd: true });
  setStatus(`Updated — viewing ${VARIANT_LABEL[draft.activeVariant] || "draft"}.`, "success");
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) refreshFromStorage();
});

window.addEventListener("beforeunload", (e) => {
  if (draft.id) return; // already attached to a saved note
  const hasContent = Object.values(draft.variants).some(
    (v) => v && htmlToText(v).trim()
  );
  if (!hasContent) return;
  e.preventDefault();
  e.returnValue = "You have an unsaved draft in RandomNotes.";
  return e.returnValue;
});

await refreshFromStorage();

variantEl.addEventListener("change", async () => {
  draft.activeVariant = variantEl.value;
  bodyEl.innerHTML = currentBody();
  updatePlaceholder();
  await persistOwnDraft();
  setStatus(`Viewing ${VARIANT_LABEL[draft.activeVariant]}.`, "");
});

bodyEl.addEventListener("input", () => {
  draft.variants[draft.activeVariant] = bodyEl.innerHTML;
  scheduleSave();
});

bodyEl.addEventListener("paste", (e) => {
  e.preventDefault();
  const text = e.clipboardData?.getData("text/plain") ?? "";
  document.execCommand("insertText", false, text);
});

saveBtn.addEventListener("click", async () => {
  const hasContent = Object.values(draft.variants).some((v) => v && htmlToText(v).trim());
  if (!hasContent) {
    setStatus("Nothing to save yet.", "error");
    return;
  }
  const suggested = suggestTitle(draft);
  const input = window.prompt("Name this note:", suggested);
  if (input === null) {
    setStatus("Save cancelled.", "");
    return;
  }
  draft.title = input.trim() || suggested;
  clearTimeout(saveTimer);
  const note = await saveNoteFromDraft(draft);
  draft = emptyDraft();
  await clearDraft();
  render({ scrollToEnd: false });
  setStatus(`Saved "${note.title}". Draft cleared — next capture starts a new note.`, "success");
});

summarizeBtn.addEventListener("click", () =>
  runAi("rn:summarize", "summary", summarizeBtn, "Summarizing…")
);
organizeBtn.addEventListener("click", () =>
  runAi("rn:organize", "organized", organizeBtn, "Reorganizing…")
);

clearBtn.addEventListener("click", async () => {
  const hasContent = Object.values(draft.variants).some(Boolean);
  if (!hasContent) return;
  const ok = confirm("Clear all variants of the current draft? Saved notes are kept.");
  if (!ok) return;
  draft = emptyDraft();
  await clearDraft();
  render({ scrollToEnd: false });
  setStatus("Draft cleared.", "");
});

openSavedBtn.addEventListener("click", () => {
  try {
    chrome.action.openPopup?.();
  } catch {}
});

newNoteBtn.addEventListener("click", async () => {
  const hasContent = Object.values(draft.variants).some((v) => v && htmlToText(v).trim());
  if (hasContent) {
    const saveFirst = confirm(
      "Save the current draft as a note before starting a new one?\n\nOK = save first.\nCancel = decide what to do with the current draft next."
    );
    if (saveFirst) {
      const suggested = suggestTitle(draft);
      const name = window.prompt("Name this note:", suggested);
      if (name === null) {
        setStatus("Kept the current draft.", "");
        return;
      }
      draft.title = name.trim() || suggested;
      clearTimeout(saveTimer);
      const note = await saveNoteFromDraft(draft);
      setStatus(`Saved "${note.title}". Starting a new note.`, "success");
    } else {
      const discard = confirm("Discard the current draft and start a new note?");
      if (!discard) {
        setStatus("Kept the current draft.", "");
        return;
      }
      setStatus("Discarded the current draft. Starting a new note.", "");
    }
  }
  draft = emptyDraft();
  await clearDraft();
  render({ scrollToEnd: false });
});

async function refreshFromStorage() {
  draft = await getDraft();
  snapshotStored(draft);
  render({ scrollToEnd: true });
}

async function persistOwnDraft() {
  draft.updatedAt = Date.now();
  ownWriteTimes.add(draft.updatedAt);
  setTimeout(() => ownWriteTimes.delete(draft.updatedAt), 10_000);
  lastRenderedAt = draft.updatedAt;
  snapshotStored(draft);
  await setDraft(draft);
}

function snapshotStored(d) {
  lastStoredVariants = {
    raw: d.variants?.raw || "",
    organized: d.variants?.organized || "",
    summary: d.variants?.summary || ""
  };
  lastStoredRefsLen = Array.isArray(d.references) ? d.references.length : 0;
}

function isCaptureAppendPattern(next) {
  const nextRefsLen = Array.isArray(next.references) ? next.references.length : 0;
  if (nextRefsLen <= lastStoredRefsLen) return false;
  if ((next.variants?.organized || "") !== lastStoredVariants.organized) return false;
  if ((next.variants?.summary || "") !== lastStoredVariants.summary) return false;
  const nextRaw = next.variants?.raw || "";
  return nextRaw.startsWith(lastStoredVariants.raw) && nextRaw.length > lastStoredVariants.raw.length;
}

function mergeCaptureAppend(next) {
  // The user is mid-edit. Capture their pending body content into local
  // state, append the new blockquote(s) directly to the DOM (preserving
  // cursor and selection), absorb the new references, then re-persist
  // so storage reflects the merged result.
  clearTimeout(saveTimer);
  saveTimer = null;
  draft.variants[draft.activeVariant] = bodyEl.innerHTML;
  const nextRaw = next.variants?.raw || "";
  const tail = nextRaw.slice(lastStoredVariants.raw.length);
  if (draft.activeVariant === "raw") {
    bodyEl.insertAdjacentHTML("beforeend", tail);
    draft.variants.raw = bodyEl.innerHTML;
    requestAnimationFrame(() => {
      bodyEl.scrollTop = bodyEl.scrollHeight;
    });
  } else {
    draft.variants.raw = nextRaw;
  }
  draft.references = Array.isArray(next.references) ? next.references : draft.references;
  void persistOwnDraft();
  setStatus(`Captured — added to your draft.`, "success");
}

function emptyDraft() {
  return {
    id: null,
    title: "",
    variants: { raw: "", organized: "", summary: "" },
    activeVariant: "raw",
    references: [],
    updatedAt: 0
  };
}

function currentBody() {
  return draft.variants[draft.activeVariant] || "";
}

function updatePlaceholder() {
  const placeholders = {
    raw: "Highlight text on any page, then click + RandomNote or press Ctrl/Cmd+Shift+S to drop it here.",
    organized: "Click Organize to generate a structured version of your random notes.",
    summary: "Click Summarize to generate a concise summary of your random notes."
  };
  bodyEl.dataset.placeholder = placeholders[draft.activeVariant] || "";
}

async function runAi(messageType, targetVariant, btn, busyLabel) {
  const sourceText = htmlToText(draft.variants.raw || "").trim();
  if (!sourceText) {
    setStatus("Nothing to process — capture or paste random notes first.", "error");
    return;
  }
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = busyLabel;
  setStatus(busyLabel, "");
  try {
    const res = await chrome.runtime.sendMessage({ type: messageType, text: sourceText });
    if (!res?.ok) throw new Error(res?.error || "Request failed.");
    draft = await setVariant(targetVariant, res.text);
    ownWriteTimes.add(draft.updatedAt);
    setTimeout(() => ownWriteTimes.delete(draft.updatedAt), 10_000);
    snapshotStored(draft);
    lastRenderedAt = draft.updatedAt;
    render({ scrollToEnd: false });
    setStatus(`Done. Viewing ${VARIANT_LABEL[targetVariant]}. Save when ready.`, "success");
  } catch (err) {
    setStatus(err.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    saveTimer = null;
    await persistOwnDraft();
  }, 250);
}

function render(opts = {}) {
  lastRenderedAt = draft.updatedAt || 0;
  variantEl.value = draft.activeVariant || "raw";
  bodyEl.innerHTML = currentBody();
  titleEl.textContent = draft.title?.trim() || "Untitled draft";
  updatePlaceholder();
  if (opts.scrollToEnd && draft.activeVariant === "raw" && bodyEl.innerHTML) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        bodyEl.scrollTop = bodyEl.scrollHeight;
      });
    });
  }
}

function setStatus(text, kind) {
  statusEl.textContent = text || "";
  statusEl.className = "rn-status" + (kind ? ` ${kind}` : "");
}

function suggestTitle(d) {
  const firstWith = d.variants.raw || d.variants.organized || d.variants.summary || "";
  const text = htmlToText(firstWith);
  const firstLine = text.split("\n").map((l) => l.trim()).find(Boolean) || "";
  const cleaned = firstLine.replace(/^>\s*/, "").replace(/^#+\s*/, "").replace(/\s*\[\d+\]\s*$/, "");
  if (!cleaned) return "Untitled note";
  return cleaned.length > 60 ? cleaned.slice(0, 57) + "…" : cleaned;
}

function htmlToText(html) {
  if (!html) return "";
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  return tmp.textContent || "";
}

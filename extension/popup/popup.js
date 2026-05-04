import {
  getNotes,
  deleteNote,
  loadNoteIntoDraft,
  getDraft,
  clearDraft,
  saveNoteFromDraft
} from "../shared/storage.js";

console.log("[RandomNotes] popup loaded");

const notesEl = document.getElementById("notes");
const emptyEl = document.getElementById("empty");
const newNoteBtn = document.getElementById("new-note");
const continueDraftBtn = document.getElementById("continue-draft");
const openOptionsBtn = document.getElementById("open-options");

let activeTabId = null;
chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  activeTabId = tab?.id ?? null;
});

render().catch((err) => {
  console.error("[RandomNotes] popup render failed:", err);
  emptyEl.textContent = "Failed to load notes: " + err.message;
});

updateContinueButton().catch(() => {});

async function updateContinueButton() {
  const draft = await getDraft();
  const hasContent = Object.values(draft.variants || {}).some(
    (v) => v && htmlToText(v).trim()
  );
  // Only relevant for a fresh draft that hasn't been saved yet. If
  // draft.id is set the user is editing a saved note in place, which
  // they can re-open from the saved-notes list below.
  const isUnsavedDraft = hasContent && !draft.id;
  continueDraftBtn.hidden = !isUnsavedDraft;
  if (isUnsavedDraft) {
    continueDraftBtn.title = "Continue editing the unsaved draft without starting a new one";
  }
}

continueDraftBtn.addEventListener("click", () => {
  if (activeTabId != null) {
    try { chrome.sidePanel.open({ tabId: activeTabId }); } catch {}
  }
  window.close();
});

newNoteBtn.addEventListener("click", async () => {
  const draft = await getDraft();
  const hasContent = Object.values(draft.variants || {}).some(
    (v) => v && htmlToText(v).trim()
  );
  if (hasContent) {
    const saveFirst = confirm(
      "Save the current draft as a note before starting a new one?\n\nOK = save first.\nCancel = decide what to do with the current draft next."
    );
    if (saveFirst) {
      const suggested = suggestTitle(draft);
      const name = window.prompt("Name this note:", suggested);
      if (name === null) return;
      draft.title = name.trim() || suggested;
      await saveNoteFromDraft(draft);
    } else {
      const discard = confirm("Discard the current draft and start a new note?");
      if (!discard) return;
    }
  }
  await clearDraft();
  if (activeTabId != null) {
    try { chrome.sidePanel.open({ tabId: activeTabId }); } catch {}
  }
  window.close();
});

openOptionsBtn.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

async function render() {
  const notes = await getNotes();
  notesEl.innerHTML = "";
  emptyEl.hidden = notes.length > 0;
  for (const note of notes) {
    notesEl.appendChild(renderNote(note));
  }
}

function renderNote(note) {
  const li = document.createElement("li");
  li.className = "rn-note";
  li.tabIndex = 0;
  li.setAttribute("role", "button");
  li.setAttribute("aria-label", `Open "${note.title}" in panel`);

  const openInPanel = () => {
    if (activeTabId != null) {
      try { chrome.sidePanel.open({ tabId: activeTabId }); } catch {}
    }
    loadNoteIntoDraft(note.id).finally(() => window.close());
  };

  li.addEventListener("click", openInPanel);
  li.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openInPanel();
    }
  });

  const title = document.createElement("div");
  title.className = "rn-note-title";
  title.textContent = note.title || "Untitled";

  const meta = document.createElement("div");
  meta.className = "rn-note-meta";
  meta.textContent = formatDate(note.updatedAt);

  const preview = document.createElement("div");
  preview.className = "rn-note-preview";
  const previewBody =
    note.variants?.raw ||
    note.variants?.organized ||
    note.variants?.summary ||
    note.body ||
    "";
  const tmp = document.createElement("div");
  tmp.innerHTML = previewBody;
  preview.textContent = (tmp.textContent || "").replace(/\s+/g, " ").slice(0, 200);

  const actions = document.createElement("div");
  actions.className = "rn-note-actions";

  const delBtn = document.createElement("button");
  delBtn.type = "button";
  delBtn.className = "rn-delete";
  delBtn.textContent = "Delete";
  delBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    if (!confirm(`Delete "${note.title}"?`)) return;
    await deleteNote(note.id);
    const draft = await getDraft();
    if (draft.id === note.id) {
      await clearDraft();
    }
    render();
  });

  actions.appendChild(delBtn);

  li.appendChild(title);
  li.appendChild(meta);
  li.appendChild(preview);
  li.appendChild(actions);
  return li;
}

function formatDate(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleString();
}

function htmlToText(html) {
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  return tmp.textContent || "";
}

function suggestTitle(d) {
  const firstWith = d.variants?.raw || d.variants?.organized || d.variants?.summary || "";
  const text = htmlToText(firstWith);
  const firstLine = text.split("\n").map((l) => l.trim()).find(Boolean) || "";
  const cleaned = firstLine.replace(/^>\s*/, "").replace(/^#+\s*/, "").replace(/\s*\[\d+\]\s*$/, "");
  if (!cleaned) return "Untitled note";
  return cleaned.length > 60 ? cleaned.slice(0, 57) + "…" : cleaned;
}

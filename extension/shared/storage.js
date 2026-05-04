const DRAFT_KEY = "rn:draft";
const NOTES_KEY = "rn:notes";

export const VARIANTS = ["raw", "organized", "summary"];
export const VARIANT_LABEL = {
  raw: "Random notes",
  organized: "Organized",
  summary: "Summary"
};

export async function getDraft() {
  const { [DRAFT_KEY]: draft } = await chrome.storage.local.get(DRAFT_KEY);
  return migrate(draft);
}

export async function setDraft(draft) {
  await chrome.storage.local.set({ [DRAFT_KEY]: draft });
}

export async function clearDraft() {
  await chrome.storage.local.remove(DRAFT_KEY);
}

export async function appendSnippetToDraft({ text, sourceUrl, sourceTitle }) {
  const draft = await getDraft();
  draft.references.push({
    url: sourceUrl || "",
    pageTitle: sourceTitle || "",
    text
  });
  const n = draft.references.length;
  const href = sourceUrl ? buildFragmentUrl(sourceUrl, text) : "";
  const linkHtml = href
    ? `<a class="rn-ref" contenteditable="false" href="${escapeAttr(href)}" data-ref="${n}" target="_blank" rel="noopener noreferrer">[${n}]</a>`
    : `<span class="rn-ref" contenteditable="false" data-ref="${n}">[${n}]</span>`;
  const block = `<blockquote class="rn-quote">${escapeText(text)} ${linkHtml}</blockquote>`;
  draft.variants.raw = draft.variants.raw
    ? `${draft.variants.raw}${block}`
    : block;
  draft.activeVariant = "raw";
  draft.updatedAt = Date.now();
  await setDraft(draft);
  return draft;
}

export async function setVariant(variantId, text) {
  const draft = await getDraft();
  if (!VARIANTS.includes(variantId)) return draft;
  draft.variants[variantId] =
    variantId === "raw" ? text : decorateRefs(text, draft.references);
  draft.activeVariant = variantId;
  draft.updatedAt = Date.now();
  await setDraft(draft);
  return draft;
}

export async function getNotes() {
  const { [NOTES_KEY]: notes } = await chrome.storage.local.get(NOTES_KEY);
  return Array.isArray(notes) ? notes.map(migrate) : [];
}

export async function saveNoteFromDraft(draft) {
  const notes = await getNotes();
  const id = draft.id || crypto.randomUUID();
  const now = Date.now();
  const existingIdx = notes.findIndex((n) => n.id === id);
  const note = {
    id,
    title: deriveTitle(draft),
    variants: { ...draft.variants },
    activeVariant: draft.activeVariant || "raw",
    references: [...(draft.references || [])],
    createdAt: existingIdx >= 0 ? notes[existingIdx].createdAt : now,
    updatedAt: now
  };
  if (existingIdx >= 0) notes[existingIdx] = note;
  else notes.unshift(note);
  await chrome.storage.local.set({ [NOTES_KEY]: notes });
  return note;
}

export async function deleteNote(id) {
  const notes = await getNotes();
  const next = notes.filter((n) => n.id !== id);
  await chrome.storage.local.set({ [NOTES_KEY]: next });
}

export async function loadNoteIntoDraft(id) {
  const notes = await getNotes();
  const note = notes.find((n) => n.id === id);
  if (!note) return null;
  const draft = {
    id: note.id,
    title: note.title || "",
    variants: { ...note.variants },
    activeVariant: note.activeVariant || "raw",
    references: [...(note.references || [])],
    updatedAt: Date.now()
  };
  await setDraft(draft);
  return draft;
}

function emptyDraft() {
  return {
    id: null,
    title: "",
    variants: { raw: "", organized: "", summary: "" },
    activeVariant: "raw",
    references: [],
    updatedAt: Date.now()
  };
}

function migrate(d) {
  if (!d) return emptyDraft();
  const variants = d.variants && typeof d.variants === "object"
    ? {
        raw: d.variants.raw || "",
        organized: d.variants.organized || "",
        summary: d.variants.summary || ""
      }
    : { raw: d.body || "", organized: "", summary: "" };
  return {
    id: d.id ?? null,
    title: d.title || "",
    variants,
    activeVariant: VARIANTS.includes(d.activeVariant) ? d.activeVariant : "raw",
    references: Array.isArray(d.references) ? d.references : [],
    createdAt: d.createdAt,
    updatedAt: d.updatedAt || Date.now()
  };
}

function deriveTitle(draft) {
  if (draft.title?.trim()) return draft.title.trim();
  const firstWith = draft.variants.raw || draft.variants.organized || draft.variants.summary || "";
  const text = htmlToText(firstWith);
  const firstLine = text.split("\n").map((l) => l.trim()).find(Boolean);
  if (!firstLine) return "Untitled note";
  const cleaned = firstLine.replace(/^>\s*/, "").replace(/^#+\s*/, "").replace(/\s*\[\d+\]\s*$/, "");
  return cleaned.length > 60 ? cleaned.slice(0, 57) + "…" : cleaned;
}

function buildFragmentUrl(url, text) {
  const normalized = String(text).replace(/\s+/g, " ").trim();
  // Text-fragment matching is whitespace-insensitive but limited; cap
  // around 300 chars and use a start,end pair when the snippet is long
  // so Chrome can match the bracket without needing the full middle.
  const base = url.split("#")[0];
  if (normalized.length <= 300) {
    return `${base}#:~:text=${encodeFragmentPart(normalized)}`;
  }
  const HEAD = 80;
  const TAIL = 80;
  const start = normalized.slice(0, HEAD);
  const end = normalized.slice(-TAIL);
  return `${base}#:~:text=${encodeFragmentPart(start)},${encodeFragmentPart(end)}`;
}

// Text fragment grammar reserves '-', ',', '&' inside the text= value;
// encodeURIComponent handles ',' and '&' but leaves '-' alone, so encode
// it explicitly. https://wicg.github.io/scroll-to-text-fragment/
function encodeFragmentPart(s) {
  return encodeURIComponent(s).replace(/-/g, "%2D");
}

function escapeText(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(s) {
  return escapeText(s).replace(/"/g, "&quot;");
}

function htmlToText(html) {
  if (!html) return "";
  if (typeof DOMParser === "undefined") {
    return String(html).replace(/<[^>]+>/g, "");
  }
  const doc = new DOMParser().parseFromString(html, "text/html");
  return doc.body.textContent || "";
}

// Wrap each [N] reference marker in AI output with a link to the
// matching capture's source URL. Keeps the markers if no reference
// exists for that index.
function decorateRefs(text, references) {
  const escaped = escapeText(text);
  return escaped.replace(/\[(\d+)\]/g, (match, num) => {
    const ref = references[Number(num) - 1];
    if (!ref || !ref.url) return match;
    const href = buildFragmentUrl(ref.url, ref.text);
    return `<a class="rn-ref" contenteditable="false" href="${escapeAttr(href)}" data-ref="${num}" target="_blank" rel="noopener noreferrer">${match}</a>`;
  });
}

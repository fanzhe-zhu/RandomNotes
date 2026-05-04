const SETTINGS_KEY = "rn:settings";
const DEFAULT_MODEL = "claude-haiku-4-5-20251001";

export const DEFAULT_SUMMARIZE_PROMPT = `Summarize the following notes.

- Length: [e.g., 3-5 sentences / one paragraph / 5 bullets]
- Audience: [e.g., just me / my team / someone unfamiliar with the topic]
- Focus: [e.g., key decisions, main arguments, action items, takeaways]
- Stay faithful to the notes — don't add information that isn't there
- If something is unclear or contradictory, note it rather than smoothing over it
- Keep the original [N] reference markers (e.g. [1], [2]) next to each claim so the reader can trace it back to its source. Do not renumber or invent reference markers.`;

export const DEFAULT_ORGANIZE_PROMPT = `I'm sharing unorganized notes. Please organize them by:
- Grouping related points under clear themes/subtopics
- Merging duplicates and overlapping ideas
- Flagging any contradictions or gaps
- Preserving all original information — don't add facts that aren't there
- Keeping the original [N] reference markers (e.g. [1], [2]) next to each fact so the reader can trace claims to sources. Do not renumber or invent reference markers.

Output as a structured outline with headings and bullets.`;

export async function getSettings() {
  const { [SETTINGS_KEY]: s } = await chrome.storage.local.get(SETTINGS_KEY);
  return {
    apiKey: s?.apiKey || "",
    model: s?.model || DEFAULT_MODEL,
    summarizePrompt: s?.summarizePrompt || DEFAULT_SUMMARIZE_PROMPT,
    organizePrompt: s?.organizePrompt || DEFAULT_ORGANIZE_PROMPT
  };
}

export async function setSettings(patch) {
  const current = await getSettings();
  const next = { ...current, ...patch };
  await chrome.storage.local.set({ [SETTINGS_KEY]: next });
  return next;
}

export async function summarizeText(text) {
  const { summarizePrompt } = await getSettings();
  return callClaude(summarizePrompt, text);
}

export async function organizeText(text) {
  const { organizePrompt } = await getSettings();
  return callClaude(organizePrompt, text);
}

async function callClaude(systemPrompt, text) {
  const { apiKey, model } = await getSettings();
  if (!apiKey) {
    throw new Error("Set your Anthropic API key in RandomNotes options first.");
  }
  if (!text || !text.trim()) {
    throw new Error("Nothing to process — the note is empty.");
  }
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true"
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: "user", content: text }]
    })
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Anthropic API error ${res.status}: ${detail.slice(0, 200)}`);
  }
  const data = await res.json();
  const out = (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  if (!out) throw new Error("Empty response from Claude.");
  return out;
}

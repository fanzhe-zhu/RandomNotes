import {
  getSettings,
  setSettings,
  DEFAULT_SUMMARIZE_PROMPT,
  DEFAULT_ORGANIZE_PROMPT
} from "../shared/anthropic.js";

const apiKeyEl = document.getElementById("apiKey");
const modelEl = document.getElementById("model");
const summarizePromptEl = document.getElementById("summarizePrompt");
const organizePromptEl = document.getElementById("organizePrompt");
const resetSummarizeBtn = document.getElementById("resetSummarize");
const resetOrganizeBtn = document.getElementById("resetOrganize");
const saveBtn = document.getElementById("save");
const statusEl = document.getElementById("status");

const current = await getSettings();
apiKeyEl.value = current.apiKey || "";
modelEl.value = current.model;
summarizePromptEl.value = current.summarizePrompt;
organizePromptEl.value = current.organizePrompt;

resetSummarizeBtn.addEventListener("click", () => {
  summarizePromptEl.value = DEFAULT_SUMMARIZE_PROMPT;
});

resetOrganizeBtn.addEventListener("click", () => {
  organizePromptEl.value = DEFAULT_ORGANIZE_PROMPT;
});

saveBtn.addEventListener("click", async () => {
  try {
    await setSettings({
      apiKey: apiKeyEl.value.trim(),
      model: modelEl.value,
      summarizePrompt: summarizePromptEl.value.trim() || DEFAULT_SUMMARIZE_PROMPT,
      organizePrompt: organizePromptEl.value.trim() || DEFAULT_ORGANIZE_PROMPT
    });
    statusEl.textContent = "Saved.";
    statusEl.className = "";
  } catch (err) {
    statusEl.textContent = err.message;
    statusEl.className = "error";
  }
});

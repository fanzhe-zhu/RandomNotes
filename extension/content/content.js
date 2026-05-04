(() => {
  if (window.__randomnotesLoaded) return;
  window.__randomnotesLoaded = true;

  const BTN_ID = "randomnotes-floating-btn";
  const TOAST_ID = "randomnotes-toast";
  const SHOW_DELAY = 180;
  let showTimer = null;
  let toastTimer = null;
  let lastSelectionText = "";
  let suppressUntil = 0;

  console.log(
    `[RandomNotes] content script loaded in ${window === window.top ? "top" : "iframe"}: ${location.href}`
  );

  function getActiveSelection() {
    const top = window.getSelection();
    if (top && top.toString().trim() && top.rangeCount > 0) {
      return { selection: top, text: top.toString(), root: document };
    }
    const queue = [document];
    while (queue.length) {
      const root = queue.shift();
      try {
        const sel = root.getSelection?.();
        if (sel && sel.toString().trim() && sel.rangeCount > 0) {
          return { selection: sel, text: sel.toString(), root };
        }
      } catch {}
      const els = root.querySelectorAll?.("*");
      if (!els) continue;
      for (const el of els) if (el.shadowRoot) queue.push(el.shadowRoot);
    }
    return null;
  }

  function getSelectionText() {
    return getActiveSelection()?.text || "";
  }

  function ensureButton() {
    let btn = document.getElementById(BTN_ID);
    if (btn) return btn;
    btn = document.createElement("button");
    btn.id = BTN_ID;
    btn.type = "button";
    btn.textContent = "+ RandomNote";
    btn.setAttribute("aria-label", "Add selection to RandomNotes");
    btn.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const text = (lastSelectionText || getSelectionText()).trim();
      hideButton();
      if (!text) return;
      try {
        await chrome.runtime.sendMessage({ type: "rn:capture", text });
      } catch (err) {
        const msg = err?.message || "send failed";
        if (/context invalidated/i.test(msg)) {
          showToast("RandomNotes was reloaded — please refresh this tab to use the button again", true);
        } else {
          showToast("RandomNotes: " + msg, true);
        }
      }
    });
    document.documentElement.appendChild(btn);
    return btn;
  }

  function hideButton() {
    const btn = document.getElementById(BTN_ID);
    if (btn) btn.style.display = "none";
  }

  function positionButton(rect) {
    const btn = ensureButton();
    btn.style.display = "block";
    const top = window.scrollY + rect.top - 36;
    const left = window.scrollX + rect.right - 110;
    btn.style.top = `${Math.max(top, window.scrollY + 4)}px`;
    btn.style.left = `${Math.max(left, window.scrollX + 4)}px`;
  }

  function tryShowButton() {
    if (Date.now() < suppressUntil) return;
    const active = getActiveSelection();
    if (!active) {
      hideButton();
      return;
    }
    const text = active.text.trim();
    if (!text) {
      hideButton();
      return;
    }
    let rect;
    try {
      rect = active.selection.getRangeAt(0).getBoundingClientRect();
    } catch {
      return;
    }
    if (!rect || (rect.width === 0 && rect.height === 0)) return;
    lastSelectionText = text;
    window.__randomnotesLastSelection = { text, ts: Date.now() };
    positionButton(rect);
  }

  function scheduleShow() {
    clearTimeout(showTimer);
    showTimer = setTimeout(tryShowButton, SHOW_DELAY);
  }

  function showToast(message, isError) {
    let toast = document.getElementById(TOAST_ID);
    if (!toast) {
      toast = document.createElement("div");
      toast.id = TOAST_ID;
      document.documentElement.appendChild(toast);
    }
    toast.textContent = message;
    toast.dataset.kind = isError ? "error" : "success";
    toast.style.display = "block";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.style.display = "none";
    }, 2400);
  }

  document.addEventListener("selectionchange", scheduleShow);
  document.addEventListener("mouseup", scheduleShow, true);
  document.addEventListener("keyup", (e) => {
    if (e.shiftKey || e.key.startsWith("Arrow")) scheduleShow();
  });

  document.addEventListener(
    "mousedown",
    (e) => {
      const btn = document.getElementById(BTN_ID);
      if (btn && e.target !== btn) {
        suppressUntil = Date.now() + 50;
        hideButton();
      }
    },
    true
  );

  window.addEventListener("scroll", hideButton, { passive: true, capture: true });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "rn:toast") {
      showToast(msg.message, msg.isError);
    }
  });

  window.__randomnotesDiagnostics = () => ({
    inFrame: window !== window.top,
    href: location.href,
    selection: getSelectionText().slice(0, 80),
    buttonExists: !!document.getElementById(BTN_ID),
    buttonDisplay: document.getElementById(BTN_ID)?.style.display
  });
})();

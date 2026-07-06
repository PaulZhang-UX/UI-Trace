const captureButton = document.getElementById("capture");
const captureInteractiveButton = document.getElementById("capture-interactive");
const captureReplicaButton = document.getElementById("capture-replica");
const exportSessionButton = document.getElementById("export-session");
const exportNormalizedButton = document.getElementById("export-normalized");
const clearSessionButton = document.getElementById("clear-session");
const clearLabel = document.getElementById("clear-label");
const replicaScopeSelect = document.getElementById("replica-scope");
const advanced = document.getElementById("advanced");
const advancedToggle = document.getElementById("advanced-toggle");
const advancedPanel = document.getElementById("advanced-panel");
const advancedChevron = document.getElementById("advanced-chevron");
const statusEl = document.getElementById("status");
const sessionCard = document.getElementById("session-card");
const sessionCountEl = document.getElementById("session-count");
const sessionHostEl = document.getElementById("session-host");
const sessionLatestEl = document.getElementById("session-latest");
const latestSeparatorEl = document.getElementById("latest-separator");
const editLatestLabelButton = document.getElementById("edit-latest-label");
const labelEditor = document.getElementById("label-editor");
const latestLabelSelect = document.getElementById("latest-label-select");
const saveLatestLabelButton = document.getElementById("save-latest-label");
const cancelLatestLabelButton = document.getElementById("cancel-latest-label");
const scopeSegmented = document.getElementById("scope-segmented");
const scopeButtons = Array.from(document.querySelectorAll("[data-scope]"));

const LABEL_OPTIONS = [
  ["default", "默认状态"],
  ["menu-open", "菜单打开"],
  ["modal-open", "弹窗打开"],
  ["sidebar-open", "侧栏展开"],
  ["selected", "选中状态"],
  ["focused", "聚焦状态"],
  ["visible-interactive-states", "可见交互状态"],
  ["screenshot-viewport", "当前可见区域截图"],
  ["screenshot-full-page", "完整页面截图"]
];
const SESSION_KEY = "reverseDesignSystemSession";
const REPLICA_SCREENSHOT_FORMAT = "jpeg";
const REPLICA_SCREENSHOT_QUALITY = 92;
const MAX_REPLICA_SCREENSHOT_HEIGHT = 12000;
const MAX_REPLICA_SCREENSHOT_SLICES = 16;
let clearConfirmTimer = null;
let labelDropdown = null;
let labelTrigger = null;
let labelTriggerText = null;
let labelOptionsPanel = null;

setupLabelDropdown();
init();

advancedToggle.addEventListener("click", () => {
  advanced.classList.toggle("open");
  const isOpen = advanced.classList.contains("open");
  advancedToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
  if (advancedPanel) advancedPanel.inert = !isOpen;
});

for (const button of scopeButtons) {
  button.addEventListener("click", () => {
    const scope = button.dataset.scope || "viewport";
    replicaScopeSelect.value = scope;
    if (scopeSegmented) scopeSegmented.classList.toggle("full-page", scope === "full-page");
    for (const item of scopeButtons) item.classList.toggle("active", item === button);
  });
}

editLatestLabelButton.addEventListener("click", async () => {
  const session = await readSession();
  if (!session.length) return;
  const latest = session[session.length - 1];
  const latestLabel = latest && latest.source ? latest.source.captureStateLabel : "";
  setLatestLabelSelection(editableCaptureLabel(latestLabel));
  openLabelEditor();
});

saveLatestLabelButton.addEventListener("click", async () => {
  const label = latestLabelSelect.value || "default";
  const session = await readSession();
  if (!session.length) {
    closeLabelEditor();
    updateSessionStatus(session);
    return;
  }
  const latest = session[session.length - 1];
  latest.source = latest.source || {};
  latest.source.captureStateLabel = label;
  latest.source.captureStateLabelSource = "manual";
  await writeSession(session);
  closeLabelEditor();
  statusEl.textContent = `已更新最新状态标签：${displayCaptureLabel(label)}。`;
  updateSessionStatus(session);
});

cancelLatestLabelButton.addEventListener("click", () => {
  closeLabelEditor();
});

clearSessionButton.addEventListener("click", async () => {
  if (clearSessionButton.dataset.confirm !== "true") {
    clearSessionButton.dataset.confirm = "true";
    if (clearLabel) clearLabel.textContent = "确认清空";
    statusEl.textContent = "再次点击清空当前会话。";
    clearTimeout(clearConfirmTimer);
    clearConfirmTimer = setTimeout(() => resetClearConfirm(), 2200);
    return;
  }

  await withBusy(clearSessionButton, "正在清空会话...", async () => {
    await writeSession([]);
    resetClearConfirm();
    statusEl.textContent = "会话已清空。";
    updateSessionStatus([]);
  });
});

captureButton.addEventListener("click", async () => {
  await withBusy(captureButton, "正在采集当前页面...", async () => {
    const payload = await extractCurrentPage();
    const session = await readSession();
    session.push(payload);
    await writeSession(session);
    statusEl.textContent = `已采集当前页面，标签：${displayCaptureLabel(payload.source && payload.source.captureStateLabel)}。`;
    updateSessionStatus(session);
  });
});

captureInteractiveButton.addEventListener("click", async () => {
  await withBusy(captureInteractiveButton, "正在采集可见交互状态...", async () => {
    const payloads = await autoCaptureVisibleInteractiveStates(getInteractiveCaptureLabel());
    const session = await readSession();
    for (const payload of payloads) session.push(payload);
    await writeSession(session);
    statusEl.textContent = `已采集 ${payloads.length} 个可见交互状态。`;
    updateSessionStatus(session);
  });
});

captureReplicaButton.addEventListener("click", async () => {
  await withBusy(captureReplicaButton, "正在采集截图参考...", async () => {
    const scope = getReplicaScope();
    const label = `screenshot-${scope}`;
    const payload = await extractCurrentPage(label, { pageSnapshotScope: scope });
    await attachReplicaVisualReferences(payload, scope);
    const session = await readSession();
    session.push(payload);
    await writeSession(session);
    const nodeCount = payload.pageSnapshot && payload.pageSnapshot.nodes ? payload.pageSnapshot.nodes.length : 0;
    const visualCount = payload.pageSnapshot && payload.pageSnapshot.visualReferences ? payload.pageSnapshot.visualReferences.length : 0;
    statusEl.textContent = `已采集截图参考：${nodeCount} 个追踪节点，${visualCount} 张截图。`;
    updateSessionStatus(session);
  });
});

exportSessionButton.addEventListener("click", async () => {
  await withBusy(exportSessionButton, "正在导出原始数据...", async () => {
    const session = await readSession();
    if (!session.length) throw new Error("No captured states in this session.");
    const merged = mergeSession(session);
    await downloadJson(merged, mergedFilename(merged));
    statusEl.textContent = `已导出 ${session.length} 个状态的原始数据。`;
  });
});

exportNormalizedButton.addEventListener("click", async () => {
  await withBusy(exportNormalizedButton, "正在导出规范化 JSON...", async () => {
    const session = await readSession();
    if (!session.length) throw new Error("No captured states in this session.");
    if (!window.ReverseDesignSystemNormalizer || !window.ReverseDesignSystemNormalizer.normalize) {
      throw new Error("Browser normalizer is not available.");
    }
    const merged = mergeSession(session);
    const normalized = window.ReverseDesignSystemNormalizer.normalize(merged, { paletteMode: "strict" });
    await downloadJson(normalized, normalizedFilename(merged));
    statusEl.textContent = `已导出 ${session.length} 个状态的规范化 JSON。`;
  });
});

async function init() {
  const session = await readSession();
  updateSessionStatus(session);
}

async function withBusy(button, message, task) {
  const buttons = [captureButton, captureInteractiveButton, captureReplicaButton, exportSessionButton, exportNormalizedButton, clearSessionButton, editLatestLabelButton].filter(Boolean);
  for (const item of buttons) item.disabled = true;
  statusEl.textContent = message;

  try {
    await task();
  } catch (error) {
    statusEl.textContent = error.message || String(error);
  } finally {
    for (const item of buttons) item.disabled = false;
    const session = await readSession();
    updateSessionStatus(session);
  }
}

async function extractCurrentPage(captureStateLabel, options = {}) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) throw new Error("No active tab found.");

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["extractor.js"]
  });

  const [result] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: async (stateLabel, extractOptions) => {
      try {
        if (!window.ReverseDesignSystemExtractor || !window.ReverseDesignSystemExtractor.extractDesignSystem) {
          return { ok: false, error: "Extractor was not available after script injection. This page may block extension scripts or use an unsupported frame context." };
        }
        const finalStateLabel = stateLabel || inferCaptureStateLabel();
        const payload = await window.ReverseDesignSystemExtractor.extractDesignSystem(Object.assign({ captureStateLabel: finalStateLabel }, extractOptions || {}));
        if (payload && payload.source) {
          payload.source.captureStateLabel = finalStateLabel;
          payload.source.captureStateLabelSource = stateLabel ? "explicit" : "auto";
        }
        return { ok: true, payload };
      } catch (error) {
        return { ok: false, error: error && error.message ? error.message : String(error) };
      }

      function inferCaptureStateLabel() {
        if (hasVisible("dialog[open], [role='dialog'], [aria-modal='true']")) return "modal-open";
        if (hasVisible("[role='menu'], [role='listbox'], [role='tree'], [data-radix-popper-content-wrapper]")) return "menu-open";
        if (hasExpandedPopup()) return "menu-open";
        if (hasFocusedControl()) return "focused";
        if (hasVisible("[aria-selected='true'], [aria-pressed='true'], input:checked")) return "selected";
        return "default";
      }

      function hasExpandedPopup() {
        const elements = Array.from(document.querySelectorAll("[aria-expanded='true']"));
        return elements.some((element) => {
          if (!isVisible(element)) return false;
          const text = stateText(element);
          return /menu|dropdown|popover|dialog|modal|more|select|filter|sort|菜单|更多|选择|筛选|排序|弹窗/.test(text);
        });
      }

      function hasFocusedControl() {
        const active = document.activeElement;
        if (!active || active === document.body || active === document.documentElement) return false;
        const tag = String(active.tagName || "").toLowerCase();
        const role = String(active.getAttribute("role") || "").toLowerCase();
        return isVisible(active) && (["input", "textarea", "select", "button"].includes(tag) || ["textbox", "combobox", "searchbox", "button"].includes(role));
      }

      function hasVisible(selector) {
        try {
          return Array.from(document.querySelectorAll(selector)).some(isVisible);
        } catch (error) {
          return false;
        }
      }

      function isVisible(element) {
        if (!element || !element.getBoundingClientRect) return false;
        const rect = element.getBoundingClientRect();
        if (rect.width < 2 || rect.height < 2) return false;
        const style = window.getComputedStyle(element);
        return style.visibility !== "hidden" && style.display !== "none" && Number(style.opacity || 1) > 0.05;
      }

      function stateText(element) {
        return [
          element.getAttribute("aria-label") || "",
          element.getAttribute("title") || "",
          element.textContent || "",
          element.id || "",
          typeof element.className === "string" ? element.className : ""
        ].join(" ").replace(/\s+/g, " ").trim().toLowerCase();
      }
    },
    args: [captureStateLabel || "", options]
  });

  if (!result || !result.result) throw new Error("Extractor did not return a payload. Try reloading the page, then capture the visible state again.");
  if (!result.result.ok) throw new Error(result.result.error || "Extractor failed in the page context.");
  return result.result.payload;
}

async function autoCaptureVisibleInteractiveStates(captureStateLabel) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) throw new Error("No active tab found.");

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["extractor.js"]
  });

  const [result] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: async (stateLabel) => {
      try {
        if (!window.ReverseDesignSystemExtractor || !window.ReverseDesignSystemExtractor.extractDesignSystem) {
          return { ok: false, error: "Extractor was not available after script injection." };
        }
        const extractor = window.ReverseDesignSystemExtractor;
        const captures = [];
        const baseLabel = stateLabel || "visible-interactive-states";
        captures.push(await extractor.extractDesignSystem({ captureStateLabel: baseLabel }));

        const candidates = findSafeInteractiveCandidates().slice(0, 10);
        let index = 1;
        for (const item of candidates) {
          const before = document.body ? document.body.innerText.slice(0, 3000) : "";
          item.element.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
          await wait(80);
          item.element.click();
          await wait(260);
          const after = document.body ? document.body.innerText.slice(0, 3000) : "";
          const expanded = item.element.getAttribute("aria-expanded");
          const changed = before !== after || expanded === "true" || item.kind === "tab" || item.kind === "details";
          if (changed) {
            captures.push(await extractor.extractDesignSystem({
              captureStateLabel: `${baseLabel}-${index}-${item.kind}`
            }));
            index += 1;
          }
          await restoreCandidate(item.element);
          await wait(120);
        }
        return { ok: true, payloads: captures };
      } catch (error) {
        return { ok: false, error: error && error.message ? error.message : String(error) };
      }

      function findSafeInteractiveCandidates() {
        const selectors = [
          "button",
          "[role='button']",
          "[aria-haspopup]",
          "[aria-expanded='false']",
          "[role='tab']",
          "summary"
        ];
        const seen = new Set();
        const result = [];
        for (const element of Array.from(document.querySelectorAll(selectors.join(",")))) {
          if (seen.has(element)) continue;
          seen.add(element);
          if (!isSafeCandidate(element)) continue;
          result.push({ element, kind: candidateKind(element) });
        }
        return result;
      }

      function isSafeCandidate(element) {
        if (!isVisible(element)) return false;
        if (element.disabled || element.getAttribute("aria-disabled") === "true") return false;
        if (element.closest("form")) return false;
        if (element.closest("[contenteditable='true']")) return false;
        const tag = element.tagName.toLowerCase();
        const type = String(element.getAttribute("type") || "").toLowerCase();
        if (tag === "a") return false;
        if (["submit", "reset", "file", "password"].includes(type)) return false;
        const text = safeText(element);
        if (/(delete|remove|destroy|submit|send|save|publish|purchase|buy|checkout|logout|sign out|log out|删除|移除|提交|发送|保存|发布|购买|退出)/i.test(text)) return false;
        const role = String(element.getAttribute("role") || "").toLowerCase();
        const hasSafeHint = element.matches("summary,[aria-haspopup],[aria-expanded='false'],[role='tab']") ||
          role === "button" ||
          /menu|dropdown|popover|modal|dialog|accordion|tab|expand|collapse|open|more|settings|filter|sort|选择|菜单|更多|筛选|排序|展开|收起|设置/.test(text);
        return hasSafeHint;
      }

      function candidateKind(element) {
        const role = String(element.getAttribute("role") || "").toLowerCase();
        const text = safeText(element).toLowerCase();
        if (element.tagName.toLowerCase() === "summary") return "details";
        if (role === "tab") return "tab";
        if (element.getAttribute("aria-haspopup")) return "popup";
        if (text.includes("accordion") || text.includes("expand") || text.includes("collapse") || text.includes("展开") || text.includes("收起")) return "accordion";
        return "interactive";
      }

      async function restoreCandidate(element) {
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        await wait(60);
        if (element && element.isConnected && element.getAttribute("aria-expanded") === "true") {
          element.click();
        }
        if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      }

      function isVisible(element) {
        const rect = element.getBoundingClientRect();
        if (rect.width < 8 || rect.height < 8) return false;
        const style = window.getComputedStyle(element);
        return style.visibility !== "hidden" && style.display !== "none" && Number(style.opacity || 1) > 0.05;
      }

      function safeText(element) {
        return [
          element.getAttribute("aria-label") || "",
          element.getAttribute("title") || "",
          element.textContent || "",
          element.id || "",
          element.className || ""
        ].join(" ").replace(/\s+/g, " ").trim().slice(0, 240);
      }

      function wait(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
      }
    },
    args: [captureStateLabel || "visible-interactive-states"]
  });

  if (!result || !result.result) throw new Error("Auto capture did not return a payload.");
  if (!result.result.ok) throw new Error(result.result.error || "Auto capture failed in the page context.");
  return result.result.payloads || [];
}

async function attachReplicaVisualReferences(payload, scope) {
  if (!payload.pageSnapshot) return;
  payload.pageSnapshot.visualReferences = [];
  payload.pageSnapshot.warnings = payload.pageSnapshot.warnings || [];
  try {
    if (scope === "full-page") {
      payload.pageSnapshot.visualReferences = await captureFullPageVisualReferences(payload.pageSnapshot);
    } else {
      payload.pageSnapshot.visualReferences = [await captureViewportVisualReference()];
    }
  } catch (error) {
    payload.pageSnapshot.warnings.push(`Screenshot visual reference failed: ${error && error.message ? error.message : String(error)}`);
  }
}

async function captureViewportVisualReference() {
  const tab = await activeTab();
  const metrics = await readPageMetrics(tab.id);
  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
    format: REPLICA_SCREENSHOT_FORMAT,
    quality: REPLICA_SCREENSHOT_QUALITY
  });
  return screenshotReference(dataUrl, {
    x: 0,
    y: 0,
    width: metrics.viewport.width,
    height: metrics.viewport.height
  }, metrics);
}

async function captureFullPageVisualReferences(snapshot) {
  const tab = await activeTab();
  const initial = await readPageMetrics(tab.id);
  const safeHeight = Math.min(
    MAX_REPLICA_SCREENSHOT_HEIGHT,
    snapshot && snapshot.frame && snapshot.frame.height ? snapshot.frame.height : initial.documentSize.height
  );
  const references = [];
  const warnings = snapshot.warnings || [];
  const viewportHeight = Math.max(1, initial.viewport.height);
  const maxScrollY = Math.max(0, initial.documentSize.height - viewportHeight);
  let y = 0;
  let lastScrollY = -1;

  try {
    while (y < safeHeight && references.length < MAX_REPLICA_SCREENSHOT_SLICES) {
      const requestedY = Math.min(y, maxScrollY);
      const metrics = await scrollPageTo(tab.id, initial.scroll.x, requestedY);
      if (metrics.scroll.y === lastScrollY && references.length > 0) break;
      lastScrollY = metrics.scroll.y;
      await delay(180);
      const settled = await readPageMetrics(tab.id);
      const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
        format: REPLICA_SCREENSHOT_FORMAT,
        quality: REPLICA_SCREENSHOT_QUALITY
      });
      references.push(screenshotReference(dataUrl, {
        x: 0,
        y: settled.scroll.y,
        width: settled.viewport.width,
        height: Math.min(settled.viewport.height, Math.max(1, safeHeight - settled.scroll.y))
      }, settled));
      y = settled.scroll.y + settled.viewport.height;
      if (settled.scroll.y >= maxScrollY) break;
    }
  } finally {
    await scrollPageTo(tab.id, initial.scroll.x, initial.scroll.y);
  }

  if (initial.documentSize.height > safeHeight) {
    warnings.push(`Screenshot references capped at ${safeHeight}px from ${initial.documentSize.height}px.`);
  }
  if (y < safeHeight && references.length >= MAX_REPLICA_SCREENSHOT_SLICES) {
    warnings.push(`Screenshot references limited to ${MAX_REPLICA_SCREENSHOT_SLICES} slices.`);
  }
  return references;
}

function screenshotReference(dataUrl, bounds, metrics) {
  return {
    kind: "screenshot",
    format: REPLICA_SCREENSHOT_FORMAT,
    dataUrl,
    bounds: {
      x: Math.round(bounds.x || 0),
      y: Math.round(bounds.y || 0),
      width: Math.round(bounds.width || 0),
      height: Math.round(bounds.height || 0)
    },
    scroll: metrics.scroll || { x: 0, y: 0 },
    devicePixelRatio: metrics.devicePixelRatio || 1
  };
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) throw new Error("No active tab found.");
  return tab;
}

async function readPageMetrics(tabId) {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const doc = document.documentElement;
      const body = document.body;
      return {
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight
        },
        documentSize: {
          width: Math.max(doc ? doc.scrollWidth || 0 : 0, body ? body.scrollWidth || 0 : 0, window.innerWidth),
          height: Math.max(doc ? doc.scrollHeight || 0 : 0, body ? body.scrollHeight || 0 : 0, window.innerHeight)
        },
        scroll: {
          x: Math.round(window.scrollX || window.pageXOffset || 0),
          y: Math.round(window.scrollY || window.pageYOffset || 0)
        },
        devicePixelRatio: window.devicePixelRatio || 1
      };
    }
  });
  if (!result || !result.result) throw new Error("Could not read page metrics.");
  return result.result;
}

async function scrollPageTo(tabId, x, y) {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: (scrollX, scrollY) => {
      window.scrollTo(scrollX || 0, scrollY || 0);
      return new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => {
          const doc = document.documentElement;
          const body = document.body;
          resolve({
            viewport: {
              width: window.innerWidth,
              height: window.innerHeight
            },
            documentSize: {
              width: Math.max(doc ? doc.scrollWidth || 0 : 0, body ? body.scrollWidth || 0 : 0, window.innerWidth),
              height: Math.max(doc ? doc.scrollHeight || 0 : 0, body ? body.scrollHeight || 0 : 0, window.innerHeight)
            },
            scroll: {
              x: Math.round(window.scrollX || window.pageXOffset || 0),
              y: Math.round(window.scrollY || window.pageYOffset || 0)
            },
            devicePixelRatio: window.devicePixelRatio || 1
          });
        }));
      });
    },
    args: [x || 0, y || 0]
  });
  if (!result || !result.result) throw new Error("Could not scroll page for screenshot capture.");
  return result.result;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getReplicaScope() {
  return replicaScopeSelect && replicaScopeSelect.value === "full-page" ? "full-page" : "viewport";
}

function getInteractiveCaptureLabel() {
  return "visible-interactive-states";
}

async function readSession() {
  const result = await chrome.storage.local.get(SESSION_KEY);
  return Array.isArray(result[SESSION_KEY]) ? result[SESSION_KEY] : [];
}

async function writeSession(session) {
  await chrome.storage.local.set({ [SESSION_KEY]: session });
}

function updateSessionStatus(session) {
  if (!session.length) {
    if (sessionCard) sessionCard.classList.add("empty");
    sessionCountEl.textContent = "尚未采集";
    sessionHostEl.textContent = "打开网页后点击采集当前页面";
    sessionLatestEl.textContent = "最新：-";
    if (latestSeparatorEl) latestSeparatorEl.style.display = "none";
    if (editLatestLabelButton) editLatestLabelButton.disabled = true;
    closeLabelEditor();
    exportNormalizedButton.disabled = true;
    exportSessionButton.disabled = true;
    clearSessionButton.disabled = true;
    return;
  }
  if (sessionCard) sessionCard.classList.remove("empty");
  const host = session[0].source && session[0].source.hostname ? session[0].source.hostname : "site";
  const latest = session[session.length - 1];
  const latestLabel = latest && latest.source ? latest.source.captureStateLabel : "";
  sessionCountEl.textContent = `已采集 ${session.length} 个状态`;
  sessionHostEl.textContent = host;
  sessionLatestEl.textContent = `最新：${displayCaptureLabel(latestLabel)}`;
  if (latestSeparatorEl) latestSeparatorEl.style.display = "";
  if (editLatestLabelButton) editLatestLabelButton.disabled = false;
  exportNormalizedButton.disabled = false;
  exportSessionButton.disabled = false;
  clearSessionButton.disabled = false;
}

function openLabelEditor() {
  if (!labelEditor) return;
  labelEditor.classList.add("open");
  labelEditor.inert = false;
  if (labelTrigger) {
    setTimeout(() => labelTrigger.focus(), 0);
  }
}

function closeLabelEditor() {
  if (!labelEditor) return;
  closeLabelOptions();
  labelEditor.classList.remove("open");
  labelEditor.inert = true;
}

function setupLabelDropdown() {
  if (!latestLabelSelect || latestLabelSelect.dataset.customized === "true") return;
  latestLabelSelect.dataset.customized = "true";
  labelDropdown = document.createElement("div");
  labelDropdown.className = "custom-label-select";

  labelTrigger = document.createElement("button");
  labelTrigger.type = "button";
  labelTrigger.className = "label-select-trigger";
  labelTrigger.setAttribute("aria-haspopup", "listbox");
  labelTrigger.setAttribute("aria-expanded", "false");
  labelTrigger.innerHTML = '<span></span><svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4 6L8 10L12 6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  labelTriggerText = labelTrigger.querySelector("span");

  labelOptionsPanel = document.createElement("div");
  labelOptionsPanel.className = "label-options";
  labelOptionsPanel.setAttribute("role", "listbox");

  for (const [value, text] of LABEL_OPTIONS) {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "label-option";
    option.dataset.label = value;
    option.setAttribute("role", "option");
    option.textContent = text;
    option.addEventListener("click", () => {
      setLatestLabelSelection(value);
      closeLabelOptions();
    });
    labelOptionsPanel.appendChild(option);
  }

  labelTrigger.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleLabelOptions();
  });

  labelDropdown.appendChild(labelTrigger);
  labelDropdown.appendChild(labelOptionsPanel);
  latestLabelSelect.insertAdjacentElement("afterend", labelDropdown);
  setLatestLabelSelection(latestLabelSelect.value || "default");

  document.addEventListener("click", (event) => {
    const clickedDropdown = labelDropdown && labelDropdown.contains(event.target);
    const clickedEditor = labelEditor && labelEditor.contains(event.target);
    const clickedEditButton = editLatestLabelButton && editLatestLabelButton.contains(event.target);
    if (!clickedDropdown) closeLabelOptions();
    if (!clickedEditor && !clickedEditButton) closeLabelEditor();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeLabelOptions();
  });
}

function setLatestLabelSelection(label) {
  if (!latestLabelSelect) return;
  const value = editableCaptureLabel(label);
  latestLabelSelect.value = value;
  if (labelTriggerText) labelTriggerText.textContent = displayCaptureLabel(value);
  if (!labelOptionsPanel) return;
  for (const option of labelOptionsPanel.querySelectorAll(".label-option")) {
    option.setAttribute("aria-selected", option.dataset.label === value ? "true" : "false");
  }
}

function toggleLabelOptions() {
  if (!labelDropdown) return;
  labelDropdown.classList.contains("open") ? closeLabelOptions() : openLabelOptions();
}

function openLabelOptions() {
  if (!labelDropdown || !labelTrigger) return;
  labelDropdown.classList.add("open");
  if (labelEditor) labelEditor.classList.add("options-open");
  labelTrigger.setAttribute("aria-expanded", "true");
}

function closeLabelOptions() {
  if (!labelDropdown || !labelTrigger) return;
  labelDropdown.classList.remove("open");
  if (labelEditor) labelEditor.classList.remove("options-open");
  labelTrigger.setAttribute("aria-expanded", "false");
}

function editableCaptureLabel(label) {
  if (!label) return "default";
  if (label.startsWith("visible-interactive-states-")) return "visible-interactive-states";
  const allowed = new Set([
    "default",
    "menu-open",
    "modal-open",
    "sidebar-open",
    "selected",
    "focused",
    "visible-interactive-states",
    "screenshot-viewport",
    "screenshot-full-page"
  ]);
  return allowed.has(label) ? label : "default";
}

function displayCaptureLabel(label) {
  const map = {
    "default": "默认状态",
    "menu-open": "菜单打开",
    "modal-open": "弹窗打开",
    "sidebar-open": "侧栏展开",
    "selected": "选中状态",
    "focused": "聚焦状态",
    "visible-interactive-states": "可见交互状态",
    "screenshot-viewport": "当前可见区域截图",
    "screenshot-full-page": "完整页面截图"
  };
  if (!label) return "默认状态";
  if (map[label]) return map[label];
  if (label.startsWith("visible-interactive-states-")) return "可见交互状态";
  return label;
}

function resetClearConfirm() {
  clearSessionButton.dataset.confirm = "false";
  if (clearLabel) clearLabel.textContent = "清空";
  clearTimeout(clearConfirmTimer);
  clearConfirmTimer = null;
}

async function downloadJson(payload, filename) {
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  await chrome.downloads.download({
    url,
    filename,
    saveAs: true
  });
}

function rawFilename(payload) {
  const host = payload.source && payload.source.hostname ? payload.source.hostname : "site";
  return `design-system-${safeName(host)}.json`;
}

function mergedFilename(payload) {
  const host = payload.source && payload.source.hostname ? payload.source.hostname : "site";
  return `design-system-${safeName(host)}.merged.json`;
}

function normalizedFilename(payload) {
  const host = payload.source && payload.source.hostname ? payload.source.hostname : "site";
  return `design-system-${safeName(host)}.merged.normalized.json`;
}

function mergeSession(session) {
  const pages = session.map((payload, index) => ({
    pageId: `page-${index + 1}`,
    data: payload,
    source: pageSource(payload, index)
  }));
  const firstSource = pages[0].source;
  const hostname = commonHostname(pages);

  return {
    version: "0.1.0-merged",
    source: {
      url: `merged://${hostname || "multiple-pages"}`,
      hostname: hostname || "multiple-pages",
      title: `Merged Reverse Design System Draft (${pages.length} states)`,
      capturedAt: new Date().toISOString(),
      viewport: firstSource.viewport || {}
    },
    sources: pages.map((page) => page.source),
    tokens: {
      colors: mergeTokens(pages, "colors", tokenValueKey),
      typography: mergeTokens(pages, "typography", typeKey),
      radii: mergeTokens(pages, "radii", tokenValueKey),
      shadows: mergeTokens(pages, "shadows", tokenValueKey),
      spacing: mergeTokens(pages, "spacing", tokenValueKey)
    },
    components: mergeComponents(pages),
    containers: mergeContainers(pages),
    assets: mergeAssets(pages),
    pageSnapshots: mergePageSnapshots(pages),
    stats: mergeStats(pages)
  };
}

function pageSource(payload, index) {
  const source = payload.source || {};
  return {
    id: `page-${index + 1}`,
    url: source.url || "",
    hostname: source.hostname || "",
    title: source.title || `State ${index + 1}`,
    capturedAt: source.capturedAt || "",
    viewport: source.viewport || {},
    captureStateLabel: source.captureStateLabel || ""
  };
}

function commonHostname(pages) {
  const hostnames = unique(pages.map((page) => page.source.hostname).filter(Boolean));
  return hostnames.length === 1 ? hostnames[0] : "";
}

function mergeTokens(pages, group, getKey) {
  const map = new Map();
  for (const page of pages) {
    const tokens = page.data.tokens && page.data.tokens[group] ? page.data.tokens[group] : [];
    for (const token of tokens) {
      const key = getKey(token);
      if (!key) continue;
      const existing = map.get(key) || cloneObject(token);
      existing.count = (existing.count || 0) + (token.count || 0);
      existing.aliases = unique((existing.aliases || []).concat([token.name].filter(Boolean)));
      existing.sources = addSource(existing.sources, page);
      map.set(key, existing);
    }
  }
  return Array.from(map.values()).sort((a, b) => (b.count || 0) - (a.count || 0));
}

function mergeComponents(pages) {
  const map = new Map();
  for (const page of pages) {
    for (const component of page.data.components || []) {
      const key = component.signature || `${component.category || "other"}|${component.name || ""}`;
      const existing = map.get(key) || baseComponent(component, page, map.size + 1);
      existing.count = (existing.count || 0) + (component.count || 0);
      existing.states = unique((existing.states || []).concat(component.states || []));
      existing.sourceComponentIds = unique((existing.sourceComponentIds || []).concat([`${page.source.id}:${component.id || "unknown"}`]));
      existing.assetRefs = uniqueAssetRefs((existing.assetRefs || []).concat(component.assetRefs || []));
      existing.sources = addSource(existing.sources, page);
      existing.examples = mergeExamples(existing.examples || [], component.examples || [], page);
      map.set(key, existing);
    }
  }
  return Array.from(map.values()).sort((a, b) => (b.count || 0) - (a.count || 0));
}

function baseComponent(component, page, index) {
  const clone = cloneObject(component);
  clone.id = `merged-component-${index}`;
  clone.name = component.name || `Component ${index}`;
  clone.category = component.category || "other";
  clone.signature = component.signature || "";
  clone.count = 0;
  clone.states = [];
  clone.examples = [];
  clone.sourceComponentIds = [];
  clone.sources = addSource([], page);
  return clone;
}

function mergeExamples(existing, examples, page) {
  const result = existing.slice();
  for (const example of examples) {
    if (result.length >= 12) break;
    const clone = cloneObject(example);
    clone.sourcePageId = page.source.id;
    clone.sourceUrl = page.source.url;
    clone.sourceTitle = page.source.title;
    clone.captureStateLabel = clone.captureStateLabel || page.source.captureStateLabel || "";
    result.push(clone);
  }
  return result;
}

function mergeContainers(pages) {
  const map = new Map();
  for (const page of pages) {
    for (const container of page.data.containers || []) {
      const key = [
        container.type || "container",
        container.tag || "",
        container.role || "",
        container.className || "",
        container.name || ""
      ].join("|");
      const existing = map.get(key) || baseContainer(container, page, map.size + 1);
      existing.count = (existing.count || 0) + (container.count || 0);
      existing.sources = addSource(existing.sources, page);
      existing.examples = mergeContainerExamples(existing.examples || [], container.examples || [], page);
      map.set(key, existing);
    }
  }
  return Array.from(map.values()).sort((a, b) => (b.count || 0) - (a.count || 0));
}

function baseContainer(container, page, index) {
  const clone = cloneObject(container);
  clone.id = `merged-container-${index}`;
  clone.count = 0;
  clone.examples = [];
  clone.sources = addSource([], page);
  return clone;
}

function mergeContainerExamples(existing, examples, page) {
  const result = existing.slice();
  for (const example of examples) {
    if (result.length >= 12) break;
    const clone = cloneObject(example);
    clone.sourcePageId = page.source.id;
    clone.sourceUrl = page.source.url;
    clone.sourceTitle = page.source.title;
    clone.captureStateLabel = clone.captureStateLabel || page.source.captureStateLabel || "";
    result.push(clone);
  }
  return result;
}

function mergeAssets(pages) {
  const map = new Map();
  for (const page of pages) {
    for (const asset of page.data.assets || []) {
      const key = `${asset.type || "unknown"}|${asset.signature || asset.src || asset.originalHref || ""}`;
      const existing = map.get(key) || cloneObject(asset);
      existing.count = (existing.count || 0) + (asset.count || 0);
      existing.sources = addSource(existing.sources, page);
      map.set(key, existing);
    }
  }
  return Array.from(map.values()).sort((a, b) => (b.count || 0) - (a.count || 0));
}

function uniqueAssetRefs(refs) {
  const seen = new Set();
  const result = [];
  for (const ref of refs || []) {
    const key = ref.signature || `${ref.type || ""}|${ref.src || ""}|${ref.spriteId || ""}`;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(ref);
  }
  return result;
}

function mergePageSnapshots(pages) {
  const snapshots = [];
  for (const page of pages) {
    const direct = page.data.pageSnapshot ? [page.data.pageSnapshot] : [];
    const existing = Array.isArray(page.data.pageSnapshots) ? page.data.pageSnapshots.map((item) => item.snapshot || item) : [];
    for (const snapshot of direct.concat(existing)) {
      if (!snapshot || !snapshot.nodes) continue;
      snapshots.push({
        sourcePageId: page.source.id,
        sourceUrl: page.source.url,
        sourceTitle: page.source.title,
        captureStateLabel: page.source.captureStateLabel || snapshot.captureStateLabel || "",
        snapshot
      });
    }
  }
  return snapshots;
}

function mergeStats(pages) {
  const stats = {
    pages: pages.length,
    scannedElements: 0,
    componentGroups: 0,
    containerCandidates: 0,
    assetCount: 0
  };
  for (const page of pages) {
    const pageStats = page.data.stats || {};
    stats.scannedElements += pageStats.scannedElements || 0;
    stats.componentGroups += pageStats.componentGroups || (page.data.components || []).length;
    stats.containerCandidates += pageStats.containerCandidates || (page.data.containers || []).length;
    stats.assetCount += pageStats.assetCount || (page.data.assets || []).length;
  }
  return stats;
}

function addSource(existing, page) {
  const sources = existing ? existing.slice() : [];
  const item = {
    id: page.source.id,
    url: page.source.url,
    title: page.source.title,
    captureStateLabel: page.source.captureStateLabel || ""
  };
  for (const source of sources) {
    if (source.id === item.id && source.url === item.url) return sources;
  }
  sources.push(item);
  return sources;
}

function tokenValueKey(token) {
  return token && token.value !== undefined ? String(token.value) : "";
}

function typeKey(token) {
  if (!token) return "";
  return [
    token.fontFamily || "",
    token.fontSize || "",
    token.fontWeight || "",
    token.lineHeight || "",
    token.letterSpacing || 0
  ].join("|");
}

function cloneObject(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

function unique(items) {
  return Array.from(new Set(items));
}

function safeName(value) {
  return String(value || "site").replace(/[^a-z0-9.-]/gi, "-");
}

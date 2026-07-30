# Editable Prompt Detail Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the existing “查看全部” prompt dialog into a non-jumping live editor on all task pages and add caret-aware `@N` reference insertion for multimodal video rows.

**Architecture:** Add one dependency-free UMD utility that owns pure selection replacement, then keep browser/session concerns inside the existing `app.js` prompt-detail component. Each row opens the panel through a typed context that delegates locking and persistence to that task page; the panel updates `row.prompt` and the compact textarea without invoking the page-wide renderer, debounces storage writes, and flushes on blur or close. Multimodal reference cards carry `@N` tokens and use one shared insertion path for click, native pointer-position drop, and selection fallback.

**Tech Stack:** Vanilla JavaScript, DOM events, browser `localStorage`/existing persistence helpers, CommonJS Node tests, PowerShell portable packaging, existing CSS.

## Global Constraints

- Apply the feature to image, image-to-video, motion imitation, avatar, multimodal video, and Vidu reference-video task pages.
- Enable reference-token insertion only for multimodal video (`type === "multi"`); all other reference cards remain read-only previews.
- Reuse `isRowLocked`, `isImageVideoRowLocked`, `isMotionRowLocked`, `isAvatarRowLocked`, `isMultiRowLocked`, and `isViduRefRowLocked`; do not create a second queue-status policy.
- Keep queued, running, and unfinished partial rows read-only while preserving prompt copy.
- Keep `row.prompt` as the only prompt source of truth; do not add a prompt copy to storage.
- Do not call the page-wide `render()` while the detail panel is being edited.
- Do not alter task IDs, task results, reference ordering, reference URLs, upload history, or provider request payload rules.
- Use UTF-8 without BOM for every created or modified text file.
- Add no runtime package dependency and no build step.
- Do not stage or modify the unrelated untracked files `runninghub-auth.cjs` and `runninghub-auth.test.cjs`.

---

### Task 1: Pure Prompt Token Insertion Utility and Portable Wiring

**Files:**
- Create: `prompt-detail-utils.js`
- Create: `prompt-detail-utils.test.cjs`
- Modify: `index.html:94-96`
- Modify: `package.json:13-15`
- Modify: `scripts/build-portable.ps1:37-79`
- Modify: `portable-package.test.cjs:7-52`

**Interfaces:**
- Consumes: plain prompt text, numeric selection bounds, and a token string.
- Produces: global/CommonJS API `ApiBatchPromptDetailUtils.insertPromptToken(text, selectionStart, selectionEnd, token) -> { value: string, caret: number }`.
- Guarantees: selection bounds are clamped to the text, reversed bounds are normalized, the selected range is replaced exactly once, and `caret` points immediately after the inserted token.

- [ ] **Step 1: Write the failing unit test**

Create `prompt-detail-utils.test.cjs`:

```js
const assert = require("node:assert/strict");
const { insertPromptToken } = require("./prompt-detail-utils.js");

assert.deepEqual(
  insertPromptToken("前景后景", 2, 2, "@1"),
  { value: "前景@1后景", caret: 4 },
  "insertion must occur at the current caret"
);
assert.deepEqual(
  insertPromptToken("把这里替换", 1, 3, "@2"),
  { value: "把@2替换", caret: 3 },
  "the token must replace the selected text"
);
assert.deepEqual(
  insertPromptToken("abcdef", 5, 2, "@3"),
  { value: "ab@3f", caret: 4 },
  "reversed selection bounds must be normalized"
);
assert.deepEqual(
  insertPromptToken("abc", -20, 99, "@4"),
  { value: "@4", caret: 2 },
  "selection bounds must be clamped to the text"
);

console.log("prompt detail utility checks passed");
```

- [ ] **Step 2: Run the unit test and verify the missing module failure**

Run:

```powershell
node prompt-detail-utils.test.cjs
```

Expected: non-zero exit with `Cannot find module './prompt-detail-utils.js'`.

- [ ] **Step 3: Implement the dependency-free UMD utility**

Create `prompt-detail-utils.js`:

```js
(function exposePromptDetailUtils(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.ApiBatchPromptDetailUtils = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createPromptDetailUtils() {
  function clampSelection(value, textLength) {
    const number = Number(value);
    if (!Number.isFinite(number)) return textLength;
    return Math.max(0, Math.min(textLength, Math.trunc(number)));
  }

  function insertPromptToken(text, selectionStart, selectionEnd, token) {
    const source = String(text ?? "");
    const replacement = String(token ?? "");
    const first = clampSelection(selectionStart, source.length);
    const second = clampSelection(selectionEnd, source.length);
    const start = Math.min(first, second);
    const end = Math.max(first, second);
    return {
      value: `${source.slice(0, start)}${replacement}${source.slice(end)}`,
      caret: start + replacement.length
    };
  }

  return { insertPromptToken };
});
```

- [ ] **Step 4: Load and distribute the utility**

In `index.html`, load the utility before `app.js` and update the prompt-editor cache key:

```html
  <script src="./model-contracts.js?v=release-20260730-h3"></script>
  <script src="./prompt-detail-utils.js?v=release-20260730-prompt-editor"></script>
  <script src="./app.js?v=release-20260730-prompt-editor"></script>
```

In `package.json`, prepend syntax checking and the new unit test to the existing test chain:

```json
"test": "node --check app.js && node --check model-contracts.js && node --check prompt-detail-utils.js && node --check server.cjs && node launcher-contract.test.cjs && node history-recovery.test.cjs && node portable-package.test.cjs && node prompt-detail-utils.test.cjs && node prompt-detail-panel.test.cjs && node compact-model-params-layout.test.cjs && node ui-layout-contract.test.cjs && node runtime-behavior.test.cjs && node dirty-row-state.test.cjs && node dirty-row-clear.test.cjs && node model-contracts.test.cjs && node queue-refresh-resume.test.cjs"
```

Add both new files to `$publicFiles` in `scripts/build-portable.ps1`:

```powershell
  "prompt-detail-utils.js",
  "prompt-detail-utils.test.cjs",
```

Add both names to `expectedFiles` in `portable-package.test.cjs`:

```js
  "prompt-detail-utils.js",
  "prompt-detail-utils.test.cjs",
```

- [ ] **Step 5: Run focused utility and package tests**

Run:

```powershell
node --check prompt-detail-utils.js
node prompt-detail-utils.test.cjs
node portable-package.test.cjs
```

Expected:

```text
prompt detail utility checks passed
portable-package checks passed
```

- [ ] **Step 6: Commit the utility and package wiring**

```powershell
git add -- prompt-detail-utils.js prompt-detail-utils.test.cjs index.html package.json scripts/build-portable.ps1 portable-package.test.cjs
git commit -m "feat: add prompt token insertion utility"
```

---

### Task 2: Typed Editable Prompt Detail Session

**Files:**
- Modify: `app.js:9-17`
- Modify: `app.js:4449-4560`
- Modify: `app.js:5183,5276,5372,5479,5573,5654`
- Modify: `styles.css:1850-1974`
- Modify: `prompt-detail-panel.test.cjs:1-22`

**Interfaces:**
- Consumes: `insertPromptToken` from Task 1, a row object, and one of `"image" | "imageVideo" | "motion" | "avatar" | "multi" | "viduRef"`.
- Produces: `createPromptDetailContext(row, type) -> { row, refs, type, isLocked(), updatePrompt(value), persist() }`.
- Produces: `openPromptDetailPanel(context)`, `schedulePromptDetailPersist()`, `flushPromptDetailPersist()`, and `closePromptDetailPanel()`.
- Preserves: existing `markRowDirty(row)`, `refreshRowSubmittedStateDisplay(row)`, and each task page’s existing persistence function.

- [ ] **Step 1: Expand the panel contract test so the current read-only implementation fails**

Replace `prompt-detail-panel.test.cjs` with:

```js
const fs = require("fs");

const app = fs.readFileSync("app.js", "utf8");
const styles = fs.readFileSync("styles.css", "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(app.includes("function createPromptDetailContext(row, type)"), "missing typed prompt detail context");
assert(app.includes("function openPromptDetailPanel(context)"), "prompt detail opener must consume a typed context");
assert(app.includes("function schedulePromptDetailPersist()"), "missing debounced prompt persistence");
assert(app.includes("function flushPromptDetailPersist()"), "missing prompt persistence flush");
assert(app.includes("function syncPromptDetailCompactTextarea(context, value)"), "missing compact textarea synchronization");
assert(app.includes("context.updatePrompt(textarea.value)"), "detail input must update the active row through its context");
assert(app.includes("markRowDirty(row)"), "detail editing must retain submitted-row dirty state");
assert(app.includes("refreshRowSubmittedStateDisplay(row)"), "detail editing must refresh dirty status without a full render");
assert(app.includes('textarea.placeholder = "暂无提示词，可在此输入";'), "empty prompt must use a placeholder");
assert(!app.includes('prompt || "无 Prompt"'), "empty prompt text must not be written into the textarea");
assert(app.includes("textarea.readOnly = locked;"), "the panel must reapply row locking");
assert(app.includes("closePromptDetailPanel()"), "overlay, button, and Escape closes must share the flush path");
assert(app.includes("copyPromptText(overlay.querySelector(\"[data-prompt-detail-prompt]\").value)"), "copy must read the live detail textarea");
assert(!app.includes("row.promptExpanded = !row.promptExpanded"), "row prompt should no longer expand inline");
assert(/<textarea class="prompt-input" data-field="prompt" rows="4"/.test(app), "row prompt textarea should remain compact");
assert(!/<textarea class="prompt-detail-prompt" data-prompt-detail-prompt readonly>/.test(app), "readonly must be assigned from active lock state, not hard-coded");
assert(styles.includes(".prompt-detail-edit-state"), "missing prompt edit-state styling");
assert(styles.includes(".prompt-detail-prompt[readonly]"), "missing locked prompt styling");

for (const type of ["image", "imageVideo", "motion", "avatar", "multi", "viduRef"]) {
  assert(app.includes(`createPromptDetailContext(row, "${type}")`), `missing ${type} prompt context binding`);
}

console.log("prompt-detail-panel checks passed");
```

- [ ] **Step 2: Run the panel contract test and verify it fails**

Run:

```powershell
node prompt-detail-panel.test.cjs
```

Expected: non-zero exit beginning with `missing typed prompt detail context`.

- [ ] **Step 3: Import the pure insertion utility and define session state**

Immediately after `MODEL_CONTRACTS` in `app.js`, add:

```js
const PROMPT_DETAIL_UTILS = globalThis.ApiBatchPromptDetailUtils;
const { insertPromptToken } = PROMPT_DETAIL_UTILS;
const PROMPT_DETAIL_SAVE_DELAY_MS = 180;
let promptDetailSession = null;
```

- [ ] **Step 4: Add task bindings and the typed context**

Add before `renderPromptDetailReference`:

```js
function promptDetailTaskBinding(type) {
  return {
    image: { isLocked: isRowLocked, persist: persistRows },
    imageVideo: { isLocked: isImageVideoRowLocked, persist: persistImageVideoRows },
    motion: { isLocked: isMotionRowLocked, persist: persistMotionRows },
    avatar: { isLocked: isAvatarRowLocked, persist: persistAvatarRows },
    multi: { isLocked: isMultiRowLocked, persist: persistMultiRows },
    viduRef: { isLocked: isViduRefRowLocked, persist: persistViduRefRows }
  }[type] || null;
}

function findRenderedTaskRow(row) {
  if (!row?.id || typeof document === "undefined") return null;
  const id = typeof CSS !== "undefined" && CSS.escape
    ? CSS.escape(row.id)
    : String(row.id).replace(/["\\]/g, "\\$&");
  return document.querySelector([
    `tr[data-row-id="${id}"]`,
    `tr[data-image-video-row-id="${id}"]`,
    `tr[data-motion-row-id="${id}"]`,
    `tr[data-avatar-row-id="${id}"]`,
    `tr[data-multi-row-id="${id}"]`,
    `tr[data-vidu-ref-row-id="${id}"]`
  ].join(","));
}

function syncPromptDetailCompactTextarea(context, value) {
  const rowElement = findRenderedTaskRow(context.row);
  const compact = rowElement?.querySelector('textarea[data-field="prompt"]');
  if (compact) compact.value = value;
}

function createPromptDetailContext(row, type) {
  const binding = promptDetailTaskBinding(type);
  if (!binding) throw new Error(`Unsupported prompt detail task type: ${type}`);
  return {
    row,
    refs: collectPromptReferences(row, type),
    type,
    isLocked: () => binding.isLocked(row),
    updatePrompt(value) {
      if (binding.isLocked(row)) return false;
      const becameDirty = markRowDirty(row);
      row.prompt = String(value ?? "");
      syncPromptDetailCompactTextarea(this, row.prompt);
      if (becameDirty) refreshRowSubmittedStateDisplay(row);
      return true;
    },
    persist: binding.persist
  };
}
```

- [ ] **Step 5: Implement debounced save, flush, close, and lock refresh**

Add before `openPromptDetailPanel`:

```js
function schedulePromptDetailPersist() {
  if (!promptDetailSession) return;
  promptDetailSession.pendingPersist = true;
  clearTimeout(promptDetailSession.persistTimer);
  promptDetailSession.persistTimer = setTimeout(flushPromptDetailPersist, PROMPT_DETAIL_SAVE_DELAY_MS);
}

function flushPromptDetailPersist() {
  if (!promptDetailSession) return;
  clearTimeout(promptDetailSession.persistTimer);
  promptDetailSession.persistTimer = 0;
  if (!promptDetailSession.pendingPersist) return;
  promptDetailSession.pendingPersist = false;
  promptDetailSession.context.persist();
}

function refreshPromptDetailLockState() {
  if (!promptDetailSession) return true;
  const { overlay, context } = promptDetailSession;
  const textarea = overlay.querySelector("[data-prompt-detail-prompt]");
  const locked = context.isLocked();
  textarea.readOnly = locked;
  overlay.classList.toggle("prompt-detail-locked", locked);
  overlay.querySelector("[data-prompt-detail-edit-state]").textContent = locked
    ? "任务处理中，仅可查看和复制"
    : "可编辑，修改会自动保存";
  overlay.querySelectorAll("[data-prompt-detail-token]").forEach(card => {
    card.draggable = context.type === "multi" && !locked;
    card.classList.toggle("prompt-detail-ref-insertable", context.type === "multi" && !locked);
  });
  return locked;
}

function closePromptDetailPanel() {
  if (!promptDetailSession) return;
  flushPromptDetailPersist();
  promptDetailSession.overlay.classList.remove("open");
  promptDetailSession = null;
}

function applyPromptDetailTextareaValue() {
  if (!promptDetailSession) return false;
  const { overlay, context } = promptDetailSession;
  const textarea = overlay.querySelector("[data-prompt-detail-prompt]");
  if (refreshPromptDetailLockState()) {
    textarea.value = String(context.row.prompt || "");
    return false;
  }
  if (!context.updatePrompt(textarea.value)) {
    textarea.value = String(context.row.prompt || "");
    refreshPromptDetailLockState();
    return false;
  }
  overlay.querySelector("[data-prompt-detail-copy]").disabled = !textarea.value.trim();
  promptDetailSession.selectionStart = textarea.selectionStart;
  promptDetailSession.selectionEnd = textarea.selectionEnd;
  schedulePromptDetailPersist();
  return true;
}
```

- [ ] **Step 6: Replace the opener and overlay markup/events**

Replace `openPromptDetailPanel(row, refs)` with:

```js
function openPromptDetailPanel(context) {
  if (promptDetailSession) flushPromptDetailPersist();
  const overlay = ensurePromptDetailOverlay();
  const textarea = overlay.querySelector("[data-prompt-detail-prompt]");
  const prompt = String(context.row.prompt || "");
  textarea.value = prompt;
  textarea.placeholder = "暂无提示词，可在此输入";
  overlay.querySelector("[data-prompt-detail-copy]").disabled = !prompt.trim();
  const refsBox = overlay.querySelector("[data-prompt-detail-refs]");
  refsBox.innerHTML = context.refs.length
    ? context.refs.map(entry => renderPromptDetailReference(entry, { insertable: context.type === "multi" })).join("")
    : `<div class="empty-drop">这一行没有参考素材</div>`;
  promptDetailSession = {
    context,
    overlay,
    pendingPersist: false,
    persistTimer: 0,
    selectionStart: prompt.length,
    selectionEnd: prompt.length,
    dragToken: ""
  };
  refreshPromptDetailLockState();
  overlay.classList.add("open");
}
```

In `ensurePromptDetailOverlay`, add an edit-state element, remove hard-coded `readonly`, and route all close operations through the flush function:

```html
<div class="prompt-detail-section-head">
  <div>
    <strong>Prompt</strong>
    <small class="prompt-detail-edit-state" data-prompt-detail-edit-state></small>
  </div>
  <button class="tiny-button" type="button" data-prompt-detail-copy>复制提示词</button>
</div>
<textarea class="prompt-detail-prompt" data-prompt-detail-prompt></textarea>
```

```js
  const textarea = overlay.querySelector("[data-prompt-detail-prompt]");
  overlay.addEventListener("click", event => {
    if (event.target === overlay) closePromptDetailPanel();
  });
  overlay.querySelector("[data-prompt-detail-close]").addEventListener("click", closePromptDetailPanel);
  overlay.querySelector("[data-prompt-detail-copy]").addEventListener("click", () => {
    copyPromptText(overlay.querySelector("[data-prompt-detail-prompt]").value);
  });
  textarea.addEventListener("input", applyPromptDetailTextareaValue);
  textarea.addEventListener("blur", flushPromptDetailPersist);
  ["select", "click", "keyup"].forEach(type => {
    textarea.addEventListener(type, () => {
      if (!promptDetailSession) return;
      promptDetailSession.selectionStart = textarea.selectionStart;
      promptDetailSession.selectionEnd = textarea.selectionEnd;
      refreshPromptDetailLockState();
    });
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && overlay.classList.contains("open")) closePromptDetailPanel();
  });
```

- [ ] **Step 7: Bind all six task pages to typed contexts**

Replace the six “查看全部” handlers with:

```js
openPromptDetailPanel(createPromptDetailContext(row, "avatar"))
openPromptDetailPanel(createPromptDetailContext(row, "motion"))
openPromptDetailPanel(createPromptDetailContext(row, "imageVideo"))
openPromptDetailPanel(createPromptDetailContext(row, "multi"))
openPromptDetailPanel(createPromptDetailContext(row, "viduRef"))
openPromptDetailPanel(createPromptDetailContext(row, "image"))
```

Retain each handler’s existing optional chaining and click listener wrapper.

- [ ] **Step 8: Add editable and locked visual states**

Add to `styles.css` near the existing prompt-detail rules:

```css
.prompt-detail-edit-state {
  display: block;
  margin-top: 3px;
  color: var(--muted);
  font-size: 12px;
  font-weight: 400;
}

.prompt-detail-prompt[readonly] {
  background: #f3f6f8;
  color: var(--muted);
  cursor: default;
}
```

- [ ] **Step 9: Run focused tests**

Run:

```powershell
node --check app.js
node prompt-detail-panel.test.cjs
node dirty-row-state.test.cjs
node dirty-row-clear.test.cjs
```

Expected:

```text
prompt-detail-panel checks passed
dirty row state checks passed
dirty row clear checks passed
```

- [ ] **Step 10: Commit the editable session**

```powershell
git add -- app.js styles.css prompt-detail-panel.test.cjs
git commit -m "feat: edit prompts in detail panel"
```

---

### Task 3: Multimodal Reference Click and Drag Insertion

**Files:**
- Modify: `app.js:4475-4555`
- Modify: `styles.css:1920-1965`
- Modify: `prompt-detail-panel.test.cjs:1-40`

**Interfaces:**
- Consumes: Task 1 `insertPromptToken`, Task 2 `promptDetailSession`, `applyPromptDetailTextareaValue`, and `refreshPromptDetailLockState`.
- Produces: `insertPromptDetailToken(token, selectionStart, selectionEnd) -> boolean`.
- Uses drag MIME type: `application/x-api-prompt-token`.
- Guarantees: click replaces the remembered selection, native text drop determines pointer-position insertion when available, fallback uses the current/remembered selection, and locked sessions mutate nothing.

- [ ] **Step 1: Add failing source contracts for click, drag, shared insertion, and lock checks**

Append to `prompt-detail-panel.test.cjs`:

```js
assert(app.includes('const PROMPT_DETAIL_TOKEN_MIME = "application/x-api-prompt-token";'), "missing prompt token drag MIME");
assert(app.includes("function insertPromptDetailToken(token, selectionStart, selectionEnd)"), "missing shared detail token insertion");
assert(app.includes("insertPromptToken(textarea.value, selectionStart, selectionEnd, token)"), "click and fallback must use the pure insertion helper");
assert(app.includes('data-prompt-detail-token="${escapeAttr(token)}"'), "multimodal reference cards must expose their token");
assert(app.includes('event.dataTransfer.setData("text/plain", token)'), "drag must offer native text insertion");
assert(app.includes("if (refreshPromptDetailLockState())"), "reference interactions must recheck the active row lock");
assert(app.includes("textarea.value !== valueBeforeDrop"), "drop must detect browser-native pointer insertion");
assert(app.includes("insertPromptDetailToken(token, textarea.selectionStart, textarea.selectionEnd)"), "drop must fall back to the textarea selection");
assert(styles.includes(".prompt-detail-ref-insertable"), "missing insertable reference styling");
assert(styles.includes(".prompt-detail-ref-dragging"), "missing dragging reference styling");
```

- [ ] **Step 2: Run the panel test and verify the first new contract fails**

Run:

```powershell
node prompt-detail-panel.test.cjs
```

Expected: non-zero exit beginning with `missing prompt token drag MIME`.

- [ ] **Step 3: Mark only multimodal reference cards as token sources**

Define the MIME constant near the prompt-detail session constants:

```js
const PROMPT_DETAIL_TOKEN_MIME = "application/x-api-prompt-token";
```

Change `renderPromptDetailReference` to accept `{ insertable = false }`, derive a token only for `@N` labels, and emit inert markup for all other task types:

```js
function renderPromptDetailReference(entry, { insertable = false } = {}) {
  const item = entry.asset || entry;
  const title = entry.label || item.name || "参考素材";
  const token = insertable && /^@\d+$/.test(title) ? title : "";
  const source = item.preview || item.url;
  const displayName = shortAssetName(item.name || item.url || "打开文件", 42);
  const media = item.type === "video"
    ? `<video src="${escapeAttr(source)}" controls preload="metadata"></video>`
    : item.type === "audio"
      ? `<audio src="${escapeAttr(item.url)}" controls preload="metadata"></audio>`
      : `<img src="${escapeAttr(source)}" loading="lazy" decoding="async" alt="">`;
  return `
    <article class="prompt-detail-ref-card"
      ${token ? `data-prompt-detail-token="${escapeAttr(token)}" draggable="true" title="点击或拖到 Prompt 中插入 ${escapeAttr(token)}"` : ""}>
      <div class="prompt-detail-ref-title">${escapeHtml(title)}</div>
      <div class="prompt-detail-ref-media">${media}</div>
      <div class="meta-line">${escapeHtml(assetMeta(item))}</div>
      <a class="url-line" href="${escapeAttr(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(displayName)}</a>
    </article>
  `;
}
```

- [ ] **Step 4: Add the shared insertion path**

Add after `applyPromptDetailTextareaValue`:

```js
function insertPromptDetailToken(token, selectionStart, selectionEnd) {
  if (!promptDetailSession || refreshPromptDetailLockState()) return false;
  const textarea = promptDetailSession.overlay.querySelector("[data-prompt-detail-prompt]");
  const result = insertPromptToken(textarea.value, selectionStart, selectionEnd, token);
  textarea.value = result.value;
  textarea.focus();
  textarea.setSelectionRange(result.caret, result.caret);
  promptDetailSession.selectionStart = result.caret;
  promptDetailSession.selectionEnd = result.caret;
  return applyPromptDetailTextareaValue();
}
```

- [ ] **Step 5: Add reference click and drag delegation**

In `ensurePromptDetailOverlay`, capture `refsBox` and add:

```js
  const refsBox = overlay.querySelector("[data-prompt-detail-refs]");
  refsBox.addEventListener("pointerdown", event => {
    const card = event.target.closest("[data-prompt-detail-token]");
    if (!card || !promptDetailSession) return;
    const textarea = overlay.querySelector("[data-prompt-detail-prompt]");
    promptDetailSession.selectionStart = textarea.selectionStart;
    promptDetailSession.selectionEnd = textarea.selectionEnd;
  });
  refsBox.addEventListener("click", event => {
    const card = event.target.closest("[data-prompt-detail-token]");
    if (!card || event.target.closest("a, button, input, textarea, select, video, audio")) return;
    if (refreshPromptDetailLockState()) return;
    insertPromptDetailToken(
      card.dataset.promptDetailToken,
      promptDetailSession.selectionStart,
      promptDetailSession.selectionEnd
    );
  });
  refsBox.addEventListener("dragstart", event => {
    const card = event.target.closest("[data-prompt-detail-token]");
    if (!card || !event.dataTransfer || refreshPromptDetailLockState()) {
      event.preventDefault();
      return;
    }
    const token = card.dataset.promptDetailToken;
    promptDetailSession.dragToken = token;
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData(PROMPT_DETAIL_TOKEN_MIME, token);
    event.dataTransfer.setData("text/plain", token);
    card.classList.add("prompt-detail-ref-dragging");
  });
  refsBox.addEventListener("dragend", event => {
    event.target.closest("[data-prompt-detail-token]")?.classList.remove("prompt-detail-ref-dragging");
    if (promptDetailSession) promptDetailSession.dragToken = "";
  });
```

- [ ] **Step 6: Preserve native pointer-position drop and implement fallback**

Add textarea drag/drop listeners in `ensurePromptDetailOverlay`:

```js
  textarea.addEventListener("dragover", event => {
    if (!promptDetailSession?.dragToken) return;
    if (refreshPromptDetailLockState()) event.preventDefault();
  });
  textarea.addEventListener("drop", event => {
    const token = event.dataTransfer?.getData(PROMPT_DETAIL_TOKEN_MIME) || promptDetailSession?.dragToken;
    if (!token) return;
    if (refreshPromptDetailLockState()) {
      event.preventDefault();
      return;
    }
    const valueBeforeDrop = textarea.value;
    setTimeout(() => {
      if (!promptDetailSession) return;
      if (textarea.value !== valueBeforeDrop) {
        applyPromptDetailTextareaValue();
      } else {
        insertPromptDetailToken(token, textarea.selectionStart, textarea.selectionEnd);
      }
      promptDetailSession.dragToken = "";
    }, 0);
  });
```

This deliberately does not call `preventDefault()` for an unlocked drop, allowing Chromium to insert the `text/plain` token at the actual pointer position. The timeout only uses the selection fallback when the browser leaves the value unchanged.

- [ ] **Step 7: Add insertable and dragging styles**

Add near `.prompt-detail-ref-card`:

```css
.prompt-detail-ref-insertable {
  cursor: copy;
  transition: border-color 120ms ease, background-color 120ms ease;
}

.prompt-detail-ref-insertable:hover {
  border-color: var(--primary);
  background: #f5f9ff;
}

.prompt-detail-ref-dragging {
  opacity: 0.55;
}
```

- [ ] **Step 8: Run focused tests**

Run:

```powershell
node --check app.js
node prompt-detail-utils.test.cjs
node prompt-detail-panel.test.cjs
node runtime-behavior.test.cjs
```

Expected:

```text
prompt detail utility checks passed
prompt-detail-panel checks passed
runtime behavior checks passed
```

- [ ] **Step 9: Commit multimodal insertion**

```powershell
git add -- app.js styles.css prompt-detail-panel.test.cjs
git commit -m "feat: insert multimodal refs in prompt editor"
```

---

### Task 4: Full Regression, Portable Build, and Browser Verification

**Files:**
- Verify: `app.js`
- Verify: `prompt-detail-utils.js`
- Verify: `index.html`
- Verify: `dist/Internal_API_Batch_Portable_v2026.07.28-engineering-package.1.zip`

**Interfaces:**
- Consumes: all deliverables from Tasks 1-3.
- Produces: a passing full test suite, a rebuildable portable ZIP, and browser evidence that the local service serves the prompt-editor scripts and panel behavior.

- [ ] **Step 1: Run the complete automated suite**

Run:

```powershell
npm test
```

Expected: exit code `0`, including:

```text
portable-package checks passed
prompt detail utility checks passed
prompt-detail-panel checks passed
runtime behavior checks passed
```

- [ ] **Step 2: Build the portable package**

Run:

```powershell
npm run package
```

Expected: exit code `0` and output ending with:

```text
Wrote D:\Codex test\APItools\multimodal-video-dev-20260609\dist\Internal_API_Batch_Portable_v2026.07.28-engineering-package.1.zip
```

- [ ] **Step 3: Verify the local service without submitting a paid generation**

Open:

```text
http://127.0.0.1:4198/?v=20260730-prompt-detail-editor
```

Verify in the browser:

1. An idle image row’s “查看全部” panel has an editable textarea.
2. Typing updates the compact row textarea while the table scroll position remains unchanged.
3. Closing and reopening shows the edited prompt.
4. A completed row changes to “有未提交修改” after the first edit.
5. A running/queued row opens read-only while “复制提示词” remains enabled for non-empty text.
6. A multimodal row reference click inserts its `@N` at the saved caret.
7. Dragging the same card to the middle of the prompt inserts at the drop location.
8. The reference list order and URLs remain unchanged.

- [ ] **Step 4: Inspect final repository scope**

Run:

```powershell
git status --short
git log -4 --oneline
```

Expected: only the pre-existing untracked `runninghub-auth.cjs` and `runninghub-auth.test.cjs` remain uncommitted; the feature commits and design/plan commits are visible.

- [ ] **Step 5: Record verification commit only if browser verification requires a correction**

If browser verification exposes a concrete defect, write a failing focused assertion first, make the smallest correction, rerun `npm test`, and commit only the files involved:

```powershell
git add -- app.js styles.css prompt-detail-panel.test.cjs prompt-detail-utils.js prompt-detail-utils.test.cjs
git commit -m "fix: stabilize prompt detail editing"
```

If no correction is required, do not create an empty commit.

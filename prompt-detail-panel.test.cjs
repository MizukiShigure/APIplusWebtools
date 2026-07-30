const fs = require("fs");

const app = fs.readFileSync("app.js", "utf8");
const styles = fs.readFileSync("styles.css", "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function functionBody(name) {
  const marker = `function ${name}(`;
  const start = app.indexOf(marker);
  assert(start >= 0, `${name} must exist`);
  const bodyStart = app.indexOf("{", start);
  let depth = 0;
  for (let index = bodyStart; index < app.length; index += 1) {
    if (app[index] === "{") depth += 1;
    if (app[index] === "}" && --depth === 0) return app.slice(bodyStart + 1, index);
  }
  throw new Error(`${name} is not closed`);
}

const openPromptDetailPanelBody = functionBody("openPromptDetailPanel");

assert(app.includes("function createPromptDetailContext(row, type)"), "missing typed prompt detail context");
assert(app.includes("function openPromptDetailPanel(context)"), "prompt detail opener must consume a typed context");
assert(app.includes("function schedulePromptDetailPersist()"), "missing debounced prompt persistence");
assert(app.includes("function flushPromptDetailPersist()"), "missing prompt persistence flush");
assert(app.includes("function syncPromptDetailCompactTextarea(context, value)"), "missing compact textarea synchronization");
assert(app.includes("context.updatePrompt(textarea.value)"), "detail input must update the active row through its context");
assert(app.includes("markRowDirty(row)"), "detail editing must retain submitted-row dirty state");
assert(app.includes("refreshRowSubmittedStateDisplay(row)"), "detail editing must refresh dirty status without a full render");
assert(app.includes('textarea.placeholder = "暂无提示词，可在此输入";'), "empty prompt must use a placeholder");
assert(!openPromptDetailPanelBody.includes('prompt || "无 Prompt"'), "empty prompt text must not be written into the textarea");
assert(app.includes("textarea.readOnly = locked;"), "the panel must reapply row locking");
assert(app.includes("closePromptDetailPanel()"), "overlay, button, and Escape closes must share the flush path");
assert(app.includes('copyPromptText(overlay.querySelector("[data-prompt-detail-prompt]").value)'), "copy must read the live detail textarea");
assert(!app.includes("row.promptExpanded = !row.promptExpanded"), "row prompt should no longer expand inline");
assert(/<textarea class="prompt-input" data-field="prompt" rows="4"/.test(app), "row prompt textarea should remain compact");
assert(!/<textarea class="prompt-detail-prompt" data-prompt-detail-prompt readonly>/.test(app), "readonly must be assigned from active lock state, not hard-coded");
assert(styles.includes(".prompt-detail-edit-state"), "missing prompt edit-state styling");
assert(styles.includes(".prompt-detail-prompt[readonly]"), "missing locked prompt styling");

for (const type of ["image", "imageVideo", "motion", "avatar", "multi", "viduRef"]) {
  assert(app.includes(`createPromptDetailContext(row, "${type}")`), `missing ${type} prompt context binding`);
}

console.log("prompt-detail-panel checks passed");

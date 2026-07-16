const fs = require("fs");

const app = fs.readFileSync("app.js", "utf8");
const styles = fs.readFileSync("styles.css", "utf8");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

assert(app.includes("function openPromptDetailPanel(row, refs)"), "missing prompt detail panel opener");
assert(app.includes("function collectPromptReferences(row, type)"), "missing prompt reference collector");
assert(app.includes("prompt-detail-overlay"), "missing prompt detail overlay markup");
assert(app.includes("data-prompt-detail-prompt"), "missing prompt detail prompt target");
assert(app.includes("data-prompt-detail-refs"), "missing prompt detail refs target");
assert(!app.includes("row.promptExpanded = !row.promptExpanded"), "row prompt should no longer expand inline");
assert(/<textarea class="prompt-input" data-field="prompt" rows="4"/.test(app), "row prompt textarea should remain compact");
assert(styles.includes(".prompt-detail-panel"), "missing prompt detail panel styles");
assert(styles.includes(".prompt-detail-refs"), "missing prompt detail refs styles");

console.log("prompt-detail-panel checks passed");

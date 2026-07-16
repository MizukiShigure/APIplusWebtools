const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const appPath = path.join(__dirname, "app.js");
const source = fs.readFileSync(appPath, "utf8");

assert.match(source, /const VALID_ROW_STATUSES = \[[^\]]*"dirty"/, "dirty must be a valid persisted row status");
assert.match(source, /function markRowDirty\(row\)/, "markRowDirty helper must exist");
assert.match(source, /row\.status = "dirty"/, "markRowDirty must switch submitted rows to dirty");
assert.match(source, /row\.taskIds = \[\]/, "dirty rows must clear stale task ids");
assert.match(source, /row\.results = \[\]/, "dirty rows must clear stale results");
assert.match(source, /function renderTaskResultCell\(row\)/, "task/result cell renderer must be centralized");
assert.match(source, /尚未提交/, "empty or dirty task/result cells must show not-submitted text");

const renderTaskResultUses = (source.match(/renderTaskResultCell\(row\)/g) || []).length;
assert.ok(renderTaskResultUses >= 7, "every task row renderer must use renderTaskResultCell");

[
  "updateRowField",
  "updateImageVideoRowField",
  "updateMotionRowField",
  "updateAvatarRowField",
  "updateMultiRowField",
  "updateViduRefRowField",
  "addAssetsToRow",
  "addRefsToMultiRow",
  "addRefsToViduRefRow",
  "addFrameToImageVideoRow",
  "addAssetToAvatarRow",
  "addAssetToMotionRow"
].forEach(name => {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} must exist`);
  const nextFunction = source.indexOf("\nfunction ", start + 1);
  const section = source.slice(start, nextFunction === -1 ? source.length : nextFunction);
  assert.match(section, /markRowDirty\(row\)/, `${name} must mark submitted rows dirty before changing inputs`);
});

console.log("dirty-row-state checks passed");

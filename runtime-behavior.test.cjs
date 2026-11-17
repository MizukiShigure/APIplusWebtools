const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");

const taskPageCatalog = source.slice(source.indexOf("const TASK_PAGES ="), source.indexOf("const state ="));
const taskPages = Function(`${taskPageCatalog}; return TASK_PAGES;`)();
const navExpression = source.match(/\$\{(TASK_PAGES\.filter\([^\n]+?)\.map\(page => navButton\(page\)\)/)[1];
const navigationPages = Function("TASK_PAGES", `return ${navExpression};`)(taskPages);
for (const id of ["subjectLibrary", "avatar", "viduVoice", "viduRef", "music", "videoEdit"]) {
  assert.ok(!navigationPages.some(page => page.id === id), `${id} must not appear in task-type navigation`);
  assert.ok(taskPages.some(page => page.id === id), `${id} legacy page metadata must remain available for history`);
}
for (const id of ["avatarWorkflow", "image", "imageVideo", "motion", "multiVideo"]) {
  assert.ok(navigationPages.some(page => page.id === id), `${id} must remain in task-type navigation`);
}
assert.ok(taskPages.some(page => page.id === "history" && page.ready), "history must remain available");

function handlerBody(selector) {
  const marker = `tr.querySelector(".${selector}").addEventListener("click", () => {`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `${selector} click handler must exist`);
  const bodyStart = source.indexOf("{", start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}" && --depth === 0) return source.slice(bodyStart + 1, index);
  }
  throw new Error(`${selector} click handler is not closed`);
}

function functionBody(name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `${name} must exist`);
  const bodyStart = source.indexOf("{", start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}" && --depth === 0) return source.slice(bodyStart + 1, index);
  }
  throw new Error(`${name} is not closed`);
}

[
  "duplicate-row",
  "duplicate-image-video-row",
  "duplicate-motion-row",
  "duplicate-avatar-row",
  "duplicate-multi-row",
  "duplicate-vidu-ref-row"
].forEach(selector => {
  assert.doesNotMatch(handlerBody(selector), /is[A-Za-z]+RowLocked\(row\)/, `${selector} must work while the source row is running`);
});

const prependRows = Function("targetRows", "newRows", functionBody("prependRows"));
const orderedRows = [{ id: "old-1" }, { id: "old-2" }];
prependRows(orderedRows, [{ id: "new-1" }, { id: "new-2" }]);
assert.deepEqual(
  orderedRows.map(row => row.id),
  ["new-1", "new-2", "old-1", "old-2"],
  "new rows must be prepended without reversing their input order"
);

const singleRowPrependCalls = source.match(/prependRows\((?:state\.(?:rows|multiRows|viduRefRows|imageVideoRows|motionRows|avatarRows)|pipeline\.rows\(\)), \[row\]\);/g) || [];
assert.equal(singleRowPrependCalls.length, 13, "all manual, history-reuse, and Agent single-row creation paths must prepend rows");
assert.doesNotMatch(
  source,
  /state\.(?:rows|multiRows|viduRefRows|imageVideoRows|motionRows|avatarRows)\.push\(row\)|pipeline\.rows\(\)\.push\(row\)/,
  "new row creation paths must not append rows"
);
assert.match(
  source,
  /const rows = prompts\.map\(prompt => createRow\([\s\S]*?prependRows\(state\.rows, rows\);/,
  "batch prompts must be created in input order and prepended as one block"
);
assert.doesNotMatch(source, /prompts\.forEach\(prompt => state\.rows\.push/, "batch prompts must not append rows");

assert.match(
  source,
  /seedance:\s*\{[\s\S]*?prepareSeedanceReferences:\s*true,[\s\S]*?kling3Omni:/,
  "only the Seedance multimodal model should opt into Seedance reference preparation"
);
const referenceUpload = functionBody("uploadReferenceFiles");
const seedanceGuardIndex = referenceUpload.indexOf("if (getMultiModel(row).prepareSeedanceReferences)");
const seedancePrepareIndex = referenceUpload.indexOf("await prepareSeedanceReferenceFile(file, meta)");
assert.ok(seedanceGuardIndex >= 0 && seedancePrepareIndex > seedanceGuardIndex, "reference upload must guard Seedance-only compression by the active model");
assert.match(
  source,
  /row\.quality = nearestQualityOption\(row\.quality, getMultiQualityOptions\(row\), getMultiQualityOptions\(row\)\[0\] \|\| ""\);/,
  "Seedance version changes must select the nearest supported quality"
);
assert.match(
  source,
  /row\.quality = nearestQualityOption\(row\.quality, getImageVideoQualityOptions\(row\), getImageVideoQualityOptions\(row\)\[0\] \|\| ""\);/,
  "Seedance image-video version changes must select the nearest supported quality"
);
assert.doesNotMatch(source, /可灵 3 Omni 已预留，待单独规则配置/, "the multimodal page must not describe Kling Omni as unavailable");
assert.match(source, /formatProviderError\(json, `HTTP \$\{response\.status\}`\)/, "HTTP failures must preserve their structured response body");
assert.doesNotMatch(source, /if \(!response\.success\) throw new Error\(response\.message \|\|/, "task failures must not discard structured provider details");

console.log("runtime behavior checks passed");

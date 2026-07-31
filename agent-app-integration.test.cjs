const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = __dirname;
const source = fs.readFileSync(path.join(root, "app.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

test("loads the task adapter before the browser worker and application", () => {
  const adapter = html.indexOf("agent-task-adapter.js");
  const runtime = html.indexOf("agent-runtime.js");
  const app = html.indexOf("app.js");
  assert.ok(adapter > -1);
  assert.ok(adapter < runtime);
  assert.ok(runtime < app);
});

test("preserves Agent identity on every enabled row constructor", () => {
  for (const name of ["createRow", "createImageVideoRow", "createMotionRow", "createMultiRow", "createAvatarRow"]) {
    const start = source.indexOf(`function ${name}(`);
    assert.ok(start > -1, `${name} exists`);
    const body = source.slice(start, source.indexOf("\n}\n", start) + 3);
    assert.match(body, /agentTaskId:/, `${name} preserves agentTaskId`);
    assert.match(body, /origin:/, `${name} preserves origin`);
    assert.match(body, /executedBy:/, `${name} preserves executedBy`);
  }
});

test("connects Agent task mapping, staged assets, cancellation, and worker startup", () => {
  assert.match(source, /function buildAgentCapabilityManifest\(/);
  assert.match(source, /async function resolveAgentTaskAssets\(/);
  assert.match(source, /async function createRowFromAgentTask\(/);
  assert.match(source, /async function executeAgentTask\(/);
  assert.match(source, /function cancelAgentTask\(/);
  assert.match(source, /async function initializeAgentWorker\(/);
  assert.match(source, /await initializeAgentWorker\(\)/);
});

test("reports row lifecycle changes through the browser worker", () => {
  assert.match(source, /function notifyAgentRow\(/);
  const updateStart = source.indexOf("function updateRowStatus(");
  const updateBody = source.slice(updateStart, source.indexOf("\n}\n", updateStart) + 3);
  assert.match(updateBody, /notifyAgentRow\(row\)/);
});

test("renders and persists history source filtering", () => {
  assert.match(source, /function renderHistoryOriginFilter\(\)/);
  assert.match(source, /id="historyOriginFilter"/);
  assert.match(source, /STORAGE_KEYS\.historyOrigin/);
  assert.match(source, /HISTORY_ORIGIN_UTILS\.matchesOrigin\(item, state\.historyOrigin\)/);
  assert.match(source, /HISTORY_ORIGIN_UTILS\.matchesOrigin\(item\.record, state\.historyOrigin\)/);
});

test("keeps different sources in separate generation groups and labels history cards", () => {
  const signatureStart = source.indexOf("function generationInputSignature(");
  const signatureBody = source.slice(signatureStart, source.indexOf("\n}\n", signatureStart) + 3);
  assert.match(signatureBody, /origin:/);
  assert.match(source, /function renderHistoryOriginBadge\(/);
  assert.match(source, /renderHistoryOriginBadge\(record\)/);
  assert.match(source, /renderHistoryOriginBadge\(item\)/);
});

test("manual history deletion and favorites emit control events", () => {
  assert.match(source, /function deleteUploadHistory[\s\S]*?deleteControlHistoryRecord/);
  assert.match(source, /function deleteGenerationResults[\s\S]*?deleteControlHistoryRecord/);
  assert.match(source, /function toggleGenerationFavorite[\s\S]*?setControlHistoryFavorite/);
  assert.match(source, /function toggleGenerationGroupFavorite[\s\S]*?setControlHistoryFavorite/);
});

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = __dirname;
const source = fs.readFileSync(path.join(root, "app.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "styles.css"), "utf8");

test("renders a compact Agent API entry and settings dialog", () => {
  assert.match(source, /function renderAgentApiStatusCard\(/);
  assert.match(source, /id="openAgentApiSettings"/);
  assert.match(source, /function renderAgentApiSettingsDialog\(/);
  assert.match(source, /class="overlay-panel agent-settings-panel"/);
  assert.match(source, /本机专用/);
  assert.match(source, /私有远程入口/);
  assert.match(source, /disabled/);
  assert.match(styles, /\.agent-settings-panel\s*\{[\s\S]*?background:\s*#fff/);
  assert.match(styles, /\.agent-settings-panel\s*\{[\s\S]*?max-height:\s*min\(/);
});

test("loads and presents real worker, queue, and token state", () => {
  assert.match(source, /controlHistoryRequest\("\/agent-auth"\)/);
  assert.match(source, /function loadAgentApiSettings\(/);
  assert.match(source, /function refreshAgentSettingsStatus\(/);
  assert.match(source, /agentWorkerStatus/);
  assert.match(source, /waiting_for_worker/);
  assert.match(source, /submission-unknown/);
  assert.match(source, /id="toggleAgentToken"/);
  assert.match(source, /id="copyAgentToken"/);
  assert.match(source, /id="rotateAgentToken"/);
});

test("supports browser labels without navigating or full-rendering on heartbeats", () => {
  assert.match(source, /id="agentBrowserLabelInput"/);
  assert.match(source, /STORAGE_KEYS\.agentBrowserLabel/);
  assert.match(source, /async function restartAgentWorker\(/);
  const statusStart = source.indexOf("onStatus(workerStatus)");
  assert.ok(statusStart > -1, "worker onStatus callback must exist");
  const statusBody = source.slice(statusStart, source.indexOf("}\n", statusStart) + 2);
  assert.match(statusBody, /refreshAgentSettingsStatus\(\)/);
  assert.doesNotMatch(statusBody, /render\(\)/);
});

test("rotates the token only through the same-origin control endpoint", () => {
  assert.match(source, /controlHistoryRequest\("\/agent-auth\/rotate",\s*\{\s*method:\s*"POST"/);
  assert.doesNotMatch(source, /fetch\([^\n]*agent-auth\/rotate/);
});

console.log("agent ui contract checks passed");

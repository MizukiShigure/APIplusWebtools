const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = __dirname;
const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");
const pageSource = fs.readFileSync(path.join(root, "index.html"), "utf8");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

function extractFunction(source, name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `missing function ${name}`);
  const signatureEnd = source.indexOf(") {", start);
  const bodyStart = signatureEnd < 0 ? -1 : signatureEnd + 2;
  assert.notEqual(bodyStart, -1, `missing body for ${name}`);
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = "";
      }
      continue;
    }
    if (char === "\"" || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  assert.fail(`unterminated function ${name}`);
}

const helperNames = [
  "validCompletionTimestamp",
  "completionTimeFromSeed",
  "clearRowCompletionTime",
  "syncRowCompletionTime",
  "formatRowCompletionTime"
];
const helperSource = helperNames.map(name => extractFunction(appSource, name)).join("\n");
const helpers = Function(`${helperSource}\nreturn { ${helperNames.join(", ")} };`)();
const {
  completionTimeFromSeed,
  clearRowCompletionTime,
  syncRowCompletionTime,
  formatRowCompletionTime
} = helpers;

const timestamp = new Date(2026, 6, 31, 14, 26).getTime();
assert.equal(formatRowCompletionTime(timestamp), "07/31 14:26");
assert.equal(formatRowCompletionTime(0), "");
assert.equal(completionTimeFromSeed({ status: "done", completedAt: timestamp }), timestamp);
assert.equal(completionTimeFromSeed({ status: "pending", completedAt: timestamp }), 0);

const row = { status: "done", completedAt: 0, lastActivityAt: timestamp };
assert.equal(syncRowCompletionTime(row, timestamp + 60000), timestamp);
assert.equal(syncRowCompletionTime(row, timestamp + 120000), timestamp);
row.status = "queued";
assert.equal(syncRowCompletionTime(row, timestamp + 180000), 0);
assert.equal(row.completedAt, 0);
row.completedAt = timestamp;
assert.equal(clearRowCompletionTime(row), 0);
assert.equal(row.completedAt, 0);

[
  "createRow",
  "createImageVideoRow",
  "createMotionRow",
  "createAvatarRow",
  "createMultiRow",
  "createViduRefRow"
].forEach(name => {
  assert.match(
    extractFunction(appSource, name),
    /completedAt:\s*completionTimeFromSeed\(seed\)/,
    `${name} must restore completedAt`
  );
});

[
  "enqueueRows",
  "enqueueImageVideoRows",
  "enqueueMotionRows",
  "enqueueAvatarRows",
  "enqueueMultiRows",
  "enqueueViduRefRows"
].forEach(name => {
  assert.match(
    extractFunction(appSource, name),
    /clearRowCompletionTime\(row\)/,
    `${name} must clear a stale completion time`
  );
});

assert.match(extractFunction(appSource, "clearSubmittedArtifacts"), /clearRowCompletionTime\(row\)/);
assert.match(extractFunction(appSource, "updateRowStatus"), /syncRowCompletionTime\(row\)/);
assert.match(extractFunction(appSource, "renderRowStatusCell"), /formatRowCompletionTime/);
assert.match(extractFunction(appSource, "renderRowStatusCell"), /status-completed-time/);
assert.match(extractFunction(appSource, "renderRowStatusCell"), /\u5b8c\u6210\u4e8e/);
assert.match(pageSource, /app\.js\?v=release-20260731-history-group-navigation/);
assert.match(packageJson.scripts.test, /node row-completion-time\.test\.cjs/);

console.log("row completion time checks passed");

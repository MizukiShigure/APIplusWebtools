const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = __dirname;
const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");
const pageSource = fs.readFileSync(path.join(root, "index.html"), "utf8");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

const start = appSource.indexOf("  midjourney: {");
const end = appSource.indexOf("\n  kontext:", start);

assert.notEqual(start, -1, "Midjourney image model configuration must exist");
assert.notEqual(end, -1, "Midjourney image model configuration must be bounded");

const modelSource = appSource.slice(start, end);

assert.match(modelSource, /endpoint:\s*"\/midjourney"/);
assert.match(modelSource, /queryEndpoint:\s*"\/midjourney_query"/);
assert.match(
  modelSource,
  /versions:\s*\[\s*\{ label: "V8\.2", value: "8\.2" \},\s*\{ label: "V8\.1", value: "8\.1" \},\s*\{ label: "V7", value: "7" \},\s*\{ label: "V6\.1", value: "6\.1" \},\s*\{ label: "Niji 7", value: "niji_7" \}\s*\]/,
  "Midjourney must default to V8.2 while retaining V8.1, V7, V6.1, and Niji 7"
);
assert.match(modelSource, /model_name:\s*row\.version/, "the selected version must be sent to the gateway");
assert.match(pageSource, /app\.js\?v=update-20261118-local-gateway/);
assert.match(packageJson.scripts.test, /node midjourney-model-versions\.test\.cjs/);

console.log("midjourney model version checks passed");

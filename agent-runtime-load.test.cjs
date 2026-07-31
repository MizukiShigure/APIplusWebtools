const assert = require("node:assert/strict");
const fs = require("node:fs");

const html = fs.readFileSync("index.html", "utf8");
const runtimeIndex = html.indexOf("agent-runtime.js");
const appIndex = html.indexOf("app.js");

assert(runtimeIndex >= 0, "index.html must load agent-runtime.js");
assert(appIndex >= 0, "index.html must load app.js");
assert(runtimeIndex < appIndex, "agent-runtime.js must load before app.js");

console.log("agent runtime load checks passed");


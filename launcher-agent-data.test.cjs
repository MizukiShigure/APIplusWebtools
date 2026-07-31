const assert = require("node:assert/strict");
const path = require("node:path");

delete require.cache[require.resolve("./ecosystem.config.cjs")];
const ecosystem = require("./ecosystem.config.cjs");
const app = ecosystem.apps[0];

assert.equal(app.env.HOST, "127.0.0.1", "PM2 Agent API must remain loopback-only");
assert.equal(
  path.resolve(app.env.API_BATCH_DATA_DIR),
  path.resolve(__dirname, "..", "APIplusWebtools-data"),
  "PM2 must keep authoritative metadata outside the Git working tree"
);
assert.equal(app.env.API_BATCH_REMOTE_ACCESS, "false", "private remote access must remain disabled by default");

console.log("launcher Agent data checks passed");


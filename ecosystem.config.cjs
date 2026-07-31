const fs = require("node:fs");
const path = require("node:path");

function resolveLauncherDataDirectory(root = __dirname, env = process.env) {
  const configured = String(env.API_BATCH_DATA_DIR || "").trim();
  if (configured) return path.resolve(configured);
  return fs.existsSync(path.join(root, ".git"))
    ? path.resolve(root, "..", "APIplusWebtools-data")
    : path.resolve(root, "data");
}

module.exports = {
  resolveLauncherDataDirectory,
  apps: [
    {
      name: "api-plus-webtools",
      script: "server.cjs",
      cwd: __dirname,
      env: {
        HOST: "127.0.0.1",
        PORT: process.env.PORT || 4198,
        API_BATCH_DATA_DIR: resolveLauncherDataDirectory(),
        API_BATCH_REMOTE_ACCESS: "false"
      },
      autorestart: true,
      watch: false
    }
  ]
};

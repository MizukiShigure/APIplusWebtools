const path = require("node:path");

module.exports = {
  apps: [
    {
      name: "api-plus-webtools",
      script: "server.cjs",
      cwd: __dirname,
      env: {
        HOST: "127.0.0.1",
        PORT: process.env.PORT || 4198,
        API_BATCH_DATA_DIR: process.env.API_BATCH_DATA_DIR || path.resolve(__dirname, "..", "APIplusWebtools-data"),
        API_BATCH_REMOTE_ACCESS: "false"
      },
      autorestart: true,
      watch: false
    }
  ]
};

module.exports = {
  apps: [
    {
      name: "api-plus-webtools",
      script: "server.cjs",
      cwd: __dirname,
      env: {
        HOST: "127.0.0.1",
        PORT: process.env.PORT || 4198
      },
      autorestart: true,
      watch: false
    }
  ]
};

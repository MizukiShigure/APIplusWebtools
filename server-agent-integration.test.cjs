const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

async function freePort() {
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

async function waitFor(check, timeout = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const result = await check();
      if (result) return result;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 80));
  }
  throw new Error("Timed out waiting for local server");
}

test("server exposes authenticated Agent routes using the configured external data directory", async t => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "api-plus-server-agent-"));
  const dataDir = path.join(root, "data");
  const port = await freePort();
  const child = spawn(process.execPath, [path.join(__dirname, "server.cjs")], {
    cwd: __dirname,
    env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), API_BATCH_DATA_DIR: dataDir },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stderr = "";
  child.stderr.on("data", chunk => { stderr += chunk.toString(); });
  t.after(async () => {
    child.kill();
    await new Promise(resolve => child.once("exit", resolve));
    await fs.promises.rm(root, { recursive: true, force: true });
  });

  await waitFor(async () => {
    const response = await fetch(`http://127.0.0.1:${port}/`);
    return response.ok;
  });
  const authFile = path.join(dataDir, "config", "agent-auth.json");
  await waitFor(() => fs.existsSync(authFile));
  const token = JSON.parse(await fs.promises.readFile(authFile, "utf8")).token;
  const response = await fetch(`http://127.0.0.1:${port}/api/agent/v1/capabilities`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  assert.equal(response.status, 200, stderr);
  assert.equal((await response.json()).localOnly, true);
});


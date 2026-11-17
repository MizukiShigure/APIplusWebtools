const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const net = require("node:net");
const { spawn } = require("node:child_process");
const crypto = require("node:crypto");
const { createPromptLibraryStore } = require("./prompt-library-store.cjs");

const record = (taskType, text, extras = {}) => ({ id: crypto.randomUUID(), kind: "record", taskType, text, usedAt: 100, ...extras });
async function temp(t) {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "prompt-library-test-"));
  t.after(() => fs.promises.rm(directory, { recursive: true, force: true }));
  return directory;
}

test("concurrent store handles merge atomic operations and preserve all task types after restart", async t => {
  const dataDir = await temp(t);
  const a = createPromptLibraryStore({ dataDir });
  const b = createPromptLibraryStore({ dataDir });
  const types = ["image", "imageVideo", "motion", "avatar", "multiVideo", "viduRef"];
  await Promise.all(Array.from({ length: 36 }, (_, i) => (i % 2 ? a : b).append([record(types[i % 6], `sample ${i}`)])));
  const restarted = createPromptLibraryStore({ dataDir });
  for (const taskType of types) assert.equal((await restarted.list(taskType)).total, 6);
  const used = record("image", "same\r\ntext", { usedAt: 900, model: "new" });
  await a.append([used]);
  await b.append([record("image", " same\ntext ", { usedAt: 20, model: "old", imported: true })]);
  await a.append([used]);
  const [entry] = (await restarted.list("image", { query: "SAME text" })).entries;
  assert.equal(entry.usedAt, 900);
  assert.equal(entry.model, "new");
  assert.equal((await restarted.list("image", { query: "SAME text" })).total, 1);
});

test("failed atomic write preserves disk state and a retry recovers", async t => {
  const dataDir = await temp(t);
  const store = createPromptLibraryStore({ dataDir });
  await store.append([record("motion", "before")]);
  let rejectRename = true;
  const io = Object.create(fs.promises);
  io.rename = async (...args) => {
    if (rejectRename) throw Object.assign(new Error("simulated disk failure"), { code: "EIO" });
    return fs.promises.rename(...args);
  };
  const failing = createPromptLibraryStore({ dataDir, fs: io });
  const pending = record("motion", "after");
  await assert.rejects(failing.append([pending]), /simulated disk failure/);
  assert.equal((await store.list("motion")).total, 1);
  rejectRename = false;
  await failing.append([pending]);
  assert.equal((await createPromptLibraryStore({ dataDir }).list("motion")).total, 2);
  assert.ok(!(await fs.promises.readdir(path.dirname(store.file))).some(name => name.endsWith(".tmp")));
});

test("invalid batches and corrupt persistence fail closed without modifying saved prompts", async t => {
  const dataDir = await temp(t);
  const store = createPromptLibraryStore({ dataDir });
  await store.append([record("image", "saved")]);
  await assert.rejects(store.append([record("image", "must not commit"), record("invalid", "x")]), /task type/i);
  await assert.rejects(store.append([record("image", " ")]));
  await assert.rejects(store.append([record("image", "x", { key: "forged" })]), /key/i);
  await assert.rejects(store.append([record("image", "x", { usedAt: -1 })]), /usedAt/);
  assert.equal((await store.list("image")).total, 1);
  await fs.promises.writeFile(store.file, "broken fixture", "utf8");
  await assert.rejects(store.append([record("image", "must not reset")]));
  assert.equal(await fs.promises.readFile(store.file, "utf8"), "broken fixture");
});

test("bounded paginated loads protect favorites and persist favorite replay clocks", async t => {
  const dataDir = await temp(t);
  const store = createPromptLibraryStore({ dataDir });
  const favorite = { ...record("avatar", "protected", { usedAt: 0 }), kind: "favorite", favorite: true, changedAt: 10 };
  await store.append([favorite]);
  for (let start = 0; start < 1010; start += 100) {
    await store.append(Array.from({ length: Math.min(100, 1010 - start) }, (_, i) => record("avatar", `sample ${start + i}`, { usedAt: start + i + 1 })));
  }
  assert.equal((await store.list("avatar")).total, 1001);
  assert.equal((await store.list("avatar")).entries.length, 100);
  assert.equal((await store.list("avatar", { favoriteOnly: true })).entries[0].text, "protected");
  assert.equal((await store.list("avatar", { offset: 1000, limit: 100 })).entries.length, 1);
  await store.append([{ ...favorite, id: crypto.randomUUID(), favorite: false, changedAt: 20 }]);
  await createPromptLibraryStore({ dataDir }).append([favorite]);
  assert.equal((await store.list("avatar", { favoriteOnly: true })).total, 0);
});

test("unchanged revisions avoid disk payload reads and cache invalidates on another handle's write", async t => {
  const dataDir = await temp(t);
  const io = Object.create(fs.promises);
  let reads = 0;
  io.readFile = (...args) => { reads++; return fs.promises.readFile(...args); };
  const store = createPromptLibraryStore({ dataDir, fs: io });
  const first = await store.append([record("image", "fixture")]);
  await store.list("image");
  reads = 0;
  assert.deepEqual(await store.list("image", { sinceRevision: first.revision }), {
    success: true, taskType: "image", unchanged: true, revision: first.revision
  });
  assert.equal(reads, 0);
  const writer = createPromptLibraryStore({ dataDir });
  await writer.append([record("motion", "external fixture")]);
  const changed = await store.list("image", { sinceRevision: first.revision });
  assert.ok(changed.revision > first.revision);
  assert.equal(changed.entries.length, 1);
  assert.ok(reads > 0);
  await assert.rejects(store.list("image", { sinceRevision: -1 }), /revision/i);
  await fs.promises.unlink(store.file);
  assert.equal((await store.list("image", { sinceRevision: changed.revision })).revision, 0);
});

async function launch(t, dataDir) {
  const socket = net.createServer();
  await new Promise(resolve => socket.listen(0, "127.0.0.1", resolve));
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  const child = spawn(process.execPath, [path.join(__dirname, "server.cjs")], {
    cwd: __dirname, env: { ...process.env, PORT: String(port), HOST: "127.0.0.1", API_BATCH_DATA_DIR: dataDir },
    stdio: "ignore", windowsHide: true
  });
  t.after(async () => {
    if (child.exitCode === null) {
      const exited = new Promise(resolve => child.once("exit", resolve));
      child.kill();
      await exited;
    }
  });
  const base = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    try { if ((await fetch(base)).ok) return base; } catch {}
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error("server did not start");
}

test("HTTP operations reuse browser sessions, reject cross-origin callers and never replace history", async t => {
  const dataDir = await temp(t);
  const base = await launch(t, dataDir);
  const route = `${base}/api/prompt-library`;
  assert.equal((await fetch(`${route}?taskType=image`)).status, 401);
  const session = await fetch(`${base}/api/control/v1/session`);
  const cookie = session.headers.get("set-cookie").split(";")[0];
  const headers = { Cookie: cookie, Origin: base, "Content-Type": "application/json" };
  const post = (body, extra = {}) => fetch(`${route}/events`, { method: "POST", headers: { ...headers, ...extra }, body: JSON.stringify(body) });
  assert.equal((await post({ events: [record("image", "blocked")] }, { Origin: "https://example.com" })).status, 403);
  assert.equal((await post({ events: [record("image", "blocked")] }, { "Sec-Fetch-Site": "cross-site" })).status, 403);
  assert.equal((await post({ entries: [] })).status, 400);
  assert.equal((await post({ events: [record("bad", "bad")] })).status, 400);
  assert.equal((await post({ events: [record("image", "ok")] }, { "Content-Type": "text/plain" })).status, 415);
  const responses = await Promise.all(Array.from({ length: 12 }, (_, i) => post({ events: [record("image", `browser ${i}`)] })));
  for (const response of responses) assert.equal(response.status, 200);
  const loaded = await fetch(`${route}?taskType=image&limit=5`, { headers });
  assert.equal(loaded.headers.get("cache-control"), "no-store");
  const body = await loaded.json();
  assert.equal(body.total, 12);
  assert.equal(body.entries.length, 5);
  assert.equal(body.nextOffset, 5);
  const unchanged = await fetch(`${route}?taskType=image&sinceRevision=${body.revision}`, { headers }).then(response => response.json());
  assert.equal(unchanged.unchanged, true);
  assert.equal(unchanged.entries, undefined);
  assert.equal((await fetch(`${route}?taskType=image&sinceRevision=bad`, { headers })).status, 400);
  assert.equal((await fetch(`${route}?taskType=motion`, { headers }).then(response => response.json())).total, 0);
  assert.equal((await fetch(route, { method: "DELETE", headers })).status, 405);
  assert.equal(fs.existsSync(path.join(dataDir, "history.json")), false);
  assert.equal((await fetch(`${base}/data/prompt-library/library.json`, { headers })).status, 403);
  assert.equal((await fetch(`${base}/api/..%2fdata%2fprompt-library%2flibrary.json`, { headers })).status, 403);
  assert.equal((await fetch(`${base}/data/prompt-library./library.json`, { headers })).status, 403);
});

test("real browser IndexedDB survives reload and merges independent browsers and same-origin tabs", {
  skip: !process.env.PROMPT_LIBRARY_PLAYWRIGHT
}, async t => {
  const { chromium } = require(process.env.PROMPT_LIBRARY_PLAYWRIGHT);
  const base = await launch(t, await temp(t));
  const browser = await chromium.launch({ headless: true, channel: process.env.PROMPT_LIBRARY_BROWSER_CHANNEL || "msedge" });
  t.after(() => browser.close());
  const first = await browser.newContext();
  const second = await browser.newContext();
  async function pageFor(context) {
    const page = await context.newPage();
    await page.goto(`${base}/prompt-library.js`);
    await initialize(page);
    return page;
  }
  async function initialize(page) {
    await page.addScriptTag({ url: `${base}/prompt-library.js` });
    await page.evaluate(async () => {
      window.client = PromptLibrary.createClient({ dbName: "prompt-library-browser-test", autoSync: false });
      await client.ready;
    });
  }
  const a = await pageFor(first);
  await a.evaluate(async () => {
    const entry = await client.record("image", "Alpha  \r\n\u4e2d\u6587", { usedAt: 12, model: "fixture" });
    await client.setFavorite("image", entry.key, true);
  });
  await a.route("**/api/prompt-library**", route => route.abort("failed"));
  assert.equal(await a.evaluate(() => client.sync().then(() => "unexpected", () => "offline")), "offline");
  await a.reload();
  await initialize(a);
  assert.equal(await a.evaluate(() => client.getEntries("image", { search: "ALPHA \u4e2d\u6587", favoriteOnly: true }).length), 1);
  await a.unroute("**/api/prompt-library**");
  const b = await pageFor(second);
  await b.evaluate(async () => { await client.record("image", "browser two", { usedAt: 20 }); await client.sync(); });
  await a.evaluate(() => client.sync());
  assert.deepEqual(await a.evaluate(() => client.getEntries("image").map(entry => entry.text)), ["browser two", "Alpha  \n\u4e2d\u6587"]);
  const sameOriginTab = await pageFor(first);
  await Promise.all([
    a.evaluate(() => client.record("motion", "tab one", { usedAt: 30 })),
    sameOriginTab.evaluate(() => client.record("viduRef", "tab two", { usedAt: 40 }))
  ]);
  await a.evaluate(() => client.sync());
  await b.evaluate(() => client.sync());
  assert.equal(await b.evaluate(() => client.getEntries("motion")[0].text), "tab one");
  assert.equal(await b.evaluate(() => client.getEntries("viduRef")[0].text), "tab two");
  const cost = await b.evaluate(async () => {
    let requests = 0;
    let fullReads = 0;
    let writes = 0;
    let hashes = 0;
    let notifications = 0;
    client.close();
    const storage = PromptLibrary.createIndexedDBStorage(indexedDB, "prompt-library-browser-test");
    const observed = { ...storage,
      read: () => { fullReads++; return storage.read(); },
      update: fn => { writes++; return storage.update(fn); }
    };
    window.client = PromptLibrary.createClient({ storage: observed, autoSync: false,
      fetch: (...args) => { requests++; return fetch(...args); }
    });
    await client.ready;
    fullReads = 0;
    client.onChange(() => notifications++);
    const digest = crypto.subtle.digest;
    crypto.subtle.digest = function (...args) { hashes++; return digest.apply(this, args); };
    try { await client.sync(); }
    finally { crypto.subtle.digest = digest; }
    return { requests, fullReads, writes, hashes, notifications };
  });
  assert.deepEqual(cost, { requests: 1, fullReads: 0, writes: 0, hashes: 0, notifications: 0 });
  assert.equal(await a.evaluate(async () => {
    const storage = PromptLibrary.createIndexedDBStorage(indexedDB, "prompt-library-browser-test");
    await storage.update(data => { data.imports.push("must-rollback"); throw new Error("rollback"); }).catch(() => {});
    const data = await storage.read();
    storage.close();
    return data.outbox.length === 0 && !data.imports.includes("must-rollback");
  }), true);
});

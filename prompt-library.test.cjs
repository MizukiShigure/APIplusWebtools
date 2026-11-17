const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const crypto = require("node:crypto");
const library = require("./prompt-library.js");

function memoryStorage() {
  let data = { state: library.createState(), outbox: [], imports: [] };
  let tail = Promise.resolve();
  let fail = false;
  const stats = { reads: 0, writes: 0, peeks: 0 };
  return {
    stats,
    failNext() { fail = true; },
    read: async () => { stats.reads++; await tail; return structuredClone(data); },
    readSync: async () => { stats.peeks++; await tail; const { state, ...metadata } = data; return structuredClone(metadata); },
    update(fn) {
      stats.writes++;
      const pending = tail.then(() => {
        if (fail) { fail = false; throw new Error("quota exceeded"); }
        const next = structuredClone(data);
        fn(next);
        data = next;
        return structuredClone(data);
      });
      tail = pending.catch(() => {});
      return pending;
    },
    close() {}
  };
}

async function event(kind, taskType, text, options = {}) {
  return library.normalizeEvent({ id: crypto.randomUUID(), kind, taskType, text,
    usedAt: 100, changedAt: 100, ...options });
}

test("UMD, normalized exact keys and AND search support Chinese without folding spaces", async () => {
  const context = vm.createContext({ crypto: crypto.webcrypto, TextEncoder });
  vm.runInContext(fs.readFileSync(require.resolve("./prompt-library.js"), "utf8"), context);
  assert.equal(typeof context.PromptLibrary.createClient, "function");
  const text = "  Alpha  B\r\n\u4e2d\u6587\rline  ";
  assert.equal(library.normalizePrompt(text), "Alpha  B\n\u4e2d\u6587\nline");
  const key = await library.keyFor("image", text);
  assert.equal(key, await context.PromptLibrary.keyFor("image", text));
  assert.equal(key, await library.keyFor("image", "Alpha  B\n\u4e2d\u6587\nline"));
  assert.notEqual(key, await library.keyFor("image", "Alpha B\n\u4e2d\u6587\nline"));
  assert.notEqual(key, await library.keyFor("motion", text));
  const entries = [{ text, usedAt: 1 }, { text: "alpha only", usedAt: 2 }];
  assert.equal(library.searchEntries(entries, "\u4e2d\u6587 ALPHA").length, 1);
  assert.equal(library.searchEntries(entries, "ALPHA missing").length, 0);
  const searchable = library.createState();
  library.applyEvent(searchable, await event("record", "image", text));
  library.applyEvent(searchable, await event("record", "image", "unrelated"));
  assert.equal(library.getEntries(searchable, "image", { search: "\u4e2d\u6587 ALPHA" }).length, 1);
  await assert.rejects(library.keyFor("unknown", "x"), /task type/i);
});

test("records, favorite clocks and imports commute without changing usage recency", async () => {
  const state = library.createState();
  const record = await event("record", "image", "sample", { usedAt: 900, model: "new" });
  const oldImport = await event("record", "image", "sample", { usedAt: 100, model: "old", imported: true });
  const favorite = await event("favorite", "image", "sample", { favorite: true, changedAt: 200 });
  const unfavorite = await event("favorite", "image", "sample", { favorite: false, changedAt: 300 });
  for (const item of [favorite, record, oldImport, unfavorite, favorite, record]) library.applyEvent(state, item);
  const [entry] = library.getEntries(state, "image");
  assert.equal(entry.usedAt, 900);
  assert.equal(entry.model, "new");
  assert.equal(entry.favorite, false);
  assert.equal(entry.imported, false);
  assert.deepEqual(library.getEntries(state, "motion"), []);
  const reversed = library.createState();
  for (const item of [unfavorite, oldImport, record, favorite]) library.applyEvent(reversed, item);
  assert.deepEqual(library.getEntries(reversed, "image"), [entry]);
});

test("retention protects favorites and old favorite retries cannot resurrect pruned entries", async () => {
  const state = library.createState();
  const favorite = await event("favorite", "image", "protected", { favorite: true });
  library.applyEvent(state, favorite);
  for (let i = 0; i < 1005; i++) {
    library.applyEvent(state, await event("record", "image", `sample ${i}`, { usedAt: i + 1 }));
  }
  assert.equal(library.getEntries(state, "image").length, 1001);
  assert.equal(library.getEntries(state, "image", { favoriteOnly: true }).length, 1);
  library.applyEvent(state, await event("favorite", "image", "protected", { favorite: false, changedAt: 200 }));
  library.applyEvent(state, favorite);
  assert.equal(library.getEntries(state, "image").length, 1000);
  assert.equal(library.getEntries(state, "image", { favoriteOnly: true }).length, 0);
});

function mockServer() {
  const state = library.createState();
  let revision = 0;
  let signature = JSON.stringify(state);
  const currentRevision = () => {
    const next = JSON.stringify(state);
    if (next !== signature) { signature = next; revision++; }
    return revision;
  };
  let fail = false;
  let loseAck = false;
  let sessionExpired = true;
  const calls = [];
  const response = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
  return {
    state, calls,
    reset() { state.entries = {}; state.clocks = {}; signature = JSON.stringify(state); revision = 0; },
    offline(value) { fail = value; },
    loseNextAck() { loseAck = true; },
    expireSession() { sessionExpired = true; },
    async fetch(url, options = {}) {
      calls.push({ url, options });
      if (fail) throw new Error("offline");
      assert.equal(options.credentials, "same-origin");
      if (url === "/api/control/v1/session") { sessionExpired = false; return response({ success: true }); }
      if (sessionExpired) return response({ success: false }, 401);
      currentRevision();
      if (options.method === "POST") {
        const body = JSON.parse(options.body);
        assert.deepEqual(Object.keys(body), ["events"]);
        for (const item of body.events) library.applyEvent(state, await library.normalizeEvent(item));
        if (loseAck) { loseAck = false; throw new Error("response lost"); }
        return response({ success: true, accepted: body.events.map(item => item.id), revision: currentRevision() });
      }
      const parsed = new URL(url, "http://localhost");
      if (parsed.searchParams.has("sinceRevision") && Number(parsed.searchParams.get("sinceRevision")) === revision) {
        return response({ success: true, unchanged: true, revision });
      }
      return response({ success: true, entries: library.getEntries(state, parsed.searchParams.get("taskType")), revision, nextOffset: null });
    }
  };
}

test("durable outbox survives reload, failed acknowledgments and another browser writer", async () => {
  const server = mockServer();
  const storage = memoryStorage();
  server.offline(true);
  let client = library.createClient({ storage, fetch: server.fetch, autoSync: false });
  await client.ready;
  const used = await client.record("image", "first", { usedAt: 42 });
  await client.setFavorite("image", used.key, true);
  await assert.rejects(client.sync(), /offline/);
  assert.equal((await storage.read()).outbox.length, 2);
  client.close();
  client = library.createClient({ storage, fetch: server.fetch, autoSync: false });
  await client.ready;
  assert.equal(client.getEntries("image")[0].favorite, true);
  assert.equal(client.getEntries("image")[0].usedAt, 42);
  server.offline(false);
  server.loseNextAck();
  await assert.rejects(client.sync(), /response lost/);
  assert.equal((await storage.read()).outbox.length, 2);
  await library.normalizeEvent({ id: crypto.randomUUID(), kind: "record", taskType: "image", text: "other browser", usedAt: 55 })
    .then(item => library.applyEvent(server.state, item));
  server.expireSession();
  await client.sync();
  assert.equal((await storage.read()).outbox.length, 0);
  assert.deepEqual(client.getEntries("image").map(item => item.text), ["other browser", "first"]);
  assert.equal(client.getEntries("image")[1].favorite, true);
  client.close();
});

test("transaction failures are surfaced without phantom entries; imports are atomic and once-only", async () => {
  const storage = memoryStorage();
  const client = library.createClient({ storage, fetch: async () => { throw new Error("offline"); }, autoSync: false });
  await client.ready;
  let changes = 0;
  const unsubscribe = client.onChange(() => { changes++; });
  storage.failNext();
  await assert.rejects(client.record("avatar", "lost"), /quota/);
  assert.equal(client.getEntries("avatar").length, 0);
  assert.equal(changes, 0);
  const imports = [{ taskType: "viduRef", text: "legacy", usedAt: 7, model: "legacy-model" }];
  storage.failNext();
  await assert.rejects(client.importOnce("legacy-v1", imports), /quota/);
  assert.equal(await client.importOnce("legacy-v1", imports), 1);
  assert.equal(await client.importOnce("legacy-v1", imports), 0);
  const [entry] = client.getEntries("viduRef");
  assert.equal(entry.usedAt, 7);
  assert.equal(entry.imported, true);
  unsubscribe();
  client.close();
});

test("two tabs preserve each other's queued events; absent IndexedDB is not silently volatile", async () => {
  const storage = memoryStorage();
  const options = { storage, fetch: async () => { throw new Error("offline"); }, autoSync: false };
  const a = library.createClient(options);
  const b = library.createClient(options);
  await Promise.all([a.ready, b.ready]);
  await Promise.all([a.record("motion", "a"), b.record("imageVideo", "b")]);
  assert.equal((await storage.read()).outbox.length, 2);
  a.close(); b.close();
  const unavailable = library.createClient({ indexedDB: null, autoSync: false });
  await assert.rejects(unavailable.ready, /IndexedDB/);
  unavailable.close();
});

test("automatic background retries eventually drain the durable outbox", async () => {
  const server = mockServer();
  server.offline(true);
  const storage = memoryStorage();
  const client = library.createClient({ storage, fetch: server.fetch, retryMs: 10, refreshMs: 100000 });
  try {
    await client.ready;
    await client.record("multiVideo", "retry test");
    await new Promise(resolve => setTimeout(resolve, 30));
    server.offline(false);
    const deadline = Date.now() + 2000;
    while ((await storage.read()).outbox.length && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal((await storage.read()).outbox.length, 0);
  } finally { client.close(); }
});

test("favoriting a locally cached entry restores its recency if another writer pruned it on the server", async () => {
  const server = mockServer();
  const client = library.createClient({ storage: memoryStorage(), fetch: server.fetch, autoSync: false });
  await client.ready;
  const entry = await client.record("image", "old favorite", { usedAt: 7, model: "preserved-model", imported: true });
  await client.sync();
  delete server.state.entries[entry.key];
  library.applyEvent(server.state, await event("record", "image", "newer retained entry", { usedAt: 1000 }));
  await client.setFavorite("image", entry.key, true);
  await client.sync();
  const [favorite] = client.getEntries("image", { favoriteOnly: true });
  assert.equal(favorite.usedAt, 7);
  assert.equal(favorite.model, "preserved-model");
  assert.equal(favorite.imported, true);
  client.close();
});

test("unchanged sync never notifies UI subscribers", async () => {
  const server = mockServer();
  const client = library.createClient({ storage: memoryStorage(), fetch: server.fetch, autoSync: false });
  await client.ready;
  const notifications = [];
  client.onChange(change => notifications.push(change));
  await client.record("motion", "sample", { usedAt: 1 });
  assert.deepEqual(notifications[0], { taskTypes: ["motion"], reason: "local" });
  notifications.length = 0;
  await client.sync();
  await client.sync();
  assert.equal(notifications.length, 0);
  client.close();
});

test("unchanged revision costs one GET with no hashing, full local reads, writes or notifications, including after reload", async t => {
  const server = mockServer();
  library.applyEvent(server.state, await event("record", "image", "cached fixture"));
  const storage = memoryStorage();
  let client = library.createClient({ storage, fetch: server.fetch, autoSync: false });
  await client.ready;
  await client.sync();
  assert.ok(server.calls.length >= 6);
  let notifications = 0;
  client.onChange(() => notifications++);
  let hashes = 0;
  const originalDigest = crypto.webcrypto.subtle.digest;
  crypto.webcrypto.subtle.digest = function (...args) { hashes++; return originalDigest.apply(this, args); };
  t.after(() => { crypto.webcrypto.subtle.digest = originalDigest; });
  server.calls.length = 0;
  storage.stats.reads = storage.stats.writes = 0;
  await client.sync();
  assert.equal(server.calls.length, 1);
  assert.match(server.calls[0].url, /sinceRevision=1/);
  assert.equal(hashes, 0);
  assert.equal(storage.stats.reads, 0);
  assert.equal(storage.stats.writes, 0);
  assert.equal(notifications, 0);
  client.close();
  client = library.createClient({ storage, fetch: server.fetch, autoSync: false });
  await client.ready;
  server.calls.length = 0;
  await client.sync();
  assert.equal(server.calls.length, 1);
  assert.equal(hashes, 0);
  client.close();
});

test("a changed revision reloads all families and commits its revision only with a complete durable snapshot", async () => {
  const server = mockServer();
  const storage = memoryStorage();
  const client = library.createClient({ storage, fetch: server.fetch, autoSync: false });
  await client.ready;
  await client.sync();
  library.applyEvent(server.state, await event("record", "viduRef", "external writer"));
  server.calls.length = 0;
  storage.failNext();
  await assert.rejects(client.sync(), /quota/);
  assert.equal(client.getEntries("viduRef").length, 0);
  server.calls.length = 0;
  await client.sync();
  assert.equal(server.calls.length, 6);
  assert.match(server.calls[0].url, /sinceRevision=0/);
  assert.equal(client.getEntries("viduRef")[0].text, "external writer");
  server.calls.length = 0;
  await client.sync();
  assert.equal(server.calls.length, 1);
  client.close();
});

for (const acknowledge of [false, true]) test(`in-flight snapshot preserves another tab's ${acknowledge ? "acknowledged" : "queued"} edit`, async () => {
  const server = mockServer();
  const storage = memoryStorage();
  let hold = false;
  let entered;
  let release;
  const blocked = new Promise(resolve => { entered = resolve; });
  const released = new Promise(resolve => { release = resolve; });
  const a = library.createClient({ storage, autoSync: false, fetch: async (url, options) => {
    const result = await server.fetch(url, options);
    if (hold && url.includes("taskType=viduRef")) { hold = false; entered(); await released; }
    return result;
  } });
  const b = library.createClient({ storage, fetch: server.fetch, autoSync: false });
  await Promise.all([a.ready, b.ready]);
  await a.sync();
  library.applyEvent(server.state, await event("record", "motion", "remote trigger"));
  hold = true;
  const pending = a.sync();
  await blocked;
  await b.record("avatar", "other tab edit");
  if (acknowledge) await b.sync();
  release();
  await pending;
  const data = await storage.read();
  assert.equal(library.getEntries(data.state, "avatar")[0].text, "other tab edit");
  assert.equal(a.getEntries("avatar")[0].text, "other tab edit");
  assert.equal(data.outbox.length, acknowledge ? 0 : 1);
  await a.sync();
  assert.equal(library.getEntries(server.state, "avatar")[0].text, "other tab edit");
  a.close(); b.close();
});

test("unexpected empty server retains acknowledged local prompts and pending events without re-uploading stale data", async () => {
  const server = mockServer();
  const storage = memoryStorage();
  let client = library.createClient({ storage, fetch: server.fetch, autoSync: false });
  await client.ready;
  await client.record("image", "acknowledged fixture");
  await client.sync();
  const saved = structuredClone(server.state);
  server.reset();
  await assert.rejects(client.sync(), /empty|revision|backward/i);
  assert.equal(client.getEntries("image")[0].text, "acknowledged fixture");
  await client.record("image", "queued fixture");
  client.close();
  client = library.createClient({ storage, fetch: server.fetch, autoSync: false });
  await client.ready;
  server.calls.length = 0;
  await assert.rejects(client.sync(), /empty|revision|backward/i);
  assert.equal((await storage.read()).outbox.length, 1);
  assert.ok(!server.calls.some(call => call.options.method === "POST"));
  Object.assign(server.state, saved);
  await client.sync();
  assert.equal(client.getEntries("image").length, 2);
  assert.equal((await storage.read()).outbox.length, 0);
  client.close();
});

test("a valid retained subset replaces the cache without resurrecting pruned entries", async () => {
  const server = mockServer();
  const client = library.createClient({ storage: memoryStorage(), fetch: server.fetch, autoSync: false });
  await client.ready;
  const old = await client.record("image", "old fixture", { usedAt: 1 });
  await client.record("image", "retained fixture", { usedAt: 2 });
  await client.sync();
  delete server.state.entries[old.key];
  server.calls.length = 0;
  await client.sync();
  assert.deepEqual(client.getEntries("image").map(entry => entry.text), ["retained fixture"]);
  assert.ok(!server.calls.some(call => call.options.method === "POST"));
  client.close();
});

test("acknowledged data is protected even when the first full snapshot never completed", async () => {
  const server = mockServer();
  const storage = memoryStorage();
  let interrupt = true;
  let client = library.createClient({ storage, autoSync: false, fetch: async (url, options) => {
    if (interrupt && url.includes("taskType=")) throw new Error("snapshot download failed");
    return server.fetch(url, options);
  } });
  await client.ready;
  await client.record("motion", "ack before interrupted snapshot");
  await assert.rejects(client.sync(), /snapshot download failed/);
  assert.equal((await storage.read()).outbox.length, 0);
  client.close();
  interrupt = false;
  server.reset();
  client = library.createClient({ storage, fetch: server.fetch, autoSync: false });
  await client.ready;
  await assert.rejects(client.sync(), /empty|revision|backward/i);
  assert.equal(client.getEntries("motion").length, 1);
  client.close();
});

test("page revisions must agree before caching; a subsequent unchanged probe is still one request", async () => {
  const server = mockServer();
  const storage = memoryStorage();
  let changeDuringPage = true;
  const client = library.createClient({ storage, autoSync: false, fetch: async (url, options) => {
    if (changeDuringPage && url.includes("taskType=motion")) {
      changeDuringPage = false;
      library.applyEvent(server.state, await event("record", "image", "concurrent page fixture"));
    }
    return server.fetch(url, options);
  } });
  await client.ready;
  await client.sync();
  assert.equal(client.getEntries("image")[0].text, "concurrent page fixture");
  assert.ok(server.calls.length > 6);
  server.calls.length = 0;
  await client.sync();
  assert.equal(server.calls.length, 1);
  client.close();
});

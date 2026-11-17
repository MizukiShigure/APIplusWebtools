const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const modulePath = path.join(__dirname, "avatar-workflow-store.cjs");
const collections = ["voices", "workflows", "images", "settings", "jobs"];
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jA2kAAAAASUVORK5CYII=", "base64");
const secret = () => `example-${crypto.randomBytes(24).toString("hex")}`;
const status = expected => error => error.status === expected;

function createStore(dataDir) {
  assert.ok(fs.existsSync(modulePath), "T1 store module must exist");
  return require(modulePath).createAvatarWorkflowStore({ dataDir });
}

async function fixture(t) {
  const dataDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "avatar-store-test-"));
  t.after(async () => {
    const resolved = path.resolve(dataDir);
    assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
    assert.ok(path.basename(resolved).startsWith("avatar-store-test-"));
    await fs.promises.rm(resolved, { recursive: true, force: true });
  });
  return { dataDir, root: path.join(dataDir, "avatar-workflow"), store: createStore(dataDir) };
}

test("synthetic credential fixtures use the approved example prefix", () => {
  assert.ok(Array.from({ length: 8 }, secret).every(value => /^example-[0-9a-f]{48}$/.test(value)),
    "Synthetic credentials must use the example- prefix");
});

test("factory exports exactly the approved asynchronous store interface", async t => {
  const { store } = await fixture(t);
  assert.deepEqual(Object.keys(require(modulePath)), ["createAvatarWorkflowStore"]);
  assert.deepEqual(Object.keys(store).sort(), ["get", "importLegacy", "list", "put", "readImage", "remove", "saveImage"].sort());
  for (const collection of collections) assert.deepEqual(await store.list(collection), []);
  assert.equal(await store.get("voices", "missing"), null);
});

test("record envelopes persist across store handles and caller objects are detached", async t => {
  const { store, dataDir, root } = await fixture(t);
  const input = { name: "Voice", options: { speed: 1 }, version: 900, createdAt: "forged", updatedAt: "forged" };
  const record = await store.put("voices", input);
  assert.match(record.id, /^[A-Za-z0-9_-]+$/);
  assert.equal(record.version, 1);
  assert.ok(Number.isFinite(Date.parse(record.createdAt)));
  assert.equal(record.updatedAt, record.createdAt);
  input.options.speed = 9;
  record.options.speed = 8;
  const reopened = createStore(dataDir);
  assert.equal((await reopened.get("voices", record.id)).options.speed, 1);
  const updated = await reopened.put("voices", { id: record.id, name: "Changed" }, { expectedVersion: 1 });
  assert.equal(updated.version, 2);
  assert.equal(updated.createdAt, record.createdAt);
  assert.equal(updated.options.speed, 1);
  assert.ok((await fs.promises.readdir(root)).includes("registry.json"));
});

test("updates, deletes and createOnly reject stale or absent versions with 409", async t => {
  const { store } = await fixture(t);
  const first = await store.put("voices", { id: "voice", name: "original" }, { createOnly: true });
  for (const options of [{}, { expectedVersion: 9 }, { createOnly: true }, { createOnly: true, expectedVersion: 1 }]) {
    await assert.rejects(store.put("voices", { id: first.id, name: "overwrite" }, options), status(409));
  }
  await assert.rejects(store.put("voices", { id: "absent" }, { expectedVersion: 1 }), status(409));
  await assert.rejects(store.remove("voices", first.id), status(409));
  await assert.rejects(store.remove("voices", first.id, { expectedVersion: 2 }), status(409));
  const removed = await store.remove("voices", first.id, { expectedVersion: 1 });
  assert.equal(removed.id, first.id);
  assert.equal(await store.get("voices", first.id), null);
  await assert.rejects(store.remove("voices", first.id, { expectedVersion: 1 }), status(409));
});

test("recreated IDs cannot accept versions issued before deletion", async t => {
  const { store } = await fixture(t);
  const first = await store.put("voices", { id: "reused" });
  await store.remove("voices", first.id, { expectedVersion: first.version });
  const recreated = await store.put("voices", { id: first.id });
  assert.ok(recreated.version > first.version);
  await assert.rejects(store.put("voices", { id: first.id }, { expectedVersion: first.version }), status(409));
});

test("same-process handles serialize writes and conditional races have one winner", async t => {
  const { store, dataDir } = await fixture(t);
  const other = createStore(dataDir);
  await Promise.all(Array.from({ length: 24 }, (_, i) => (i % 2 ? store : other).put("voices", { id: `v-${i}`, name: String(i) })));
  assert.equal((await createStore(dataDir).list("voices")).length, 24);
  const results = await Promise.allSettled([store, other].map(handle => handle.put("voices", { id: "v-0", name: "winner" }, { expectedVersion: 1 })));
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(results.find(result => result.status === "rejected").reason.status, 409);
});

test("public outputs recursively redact credential aliases and report configured flags", async t => {
  const { store } = await fixture(t);
  const values = Array.from({ length: 7 }, secret);
  const record = await store.put("workflows", {
    id: "private", apiKey: values[0], token: values[1],
    provider: { API_KEY: values[2], headers: { Authorization: values[3], "X-API-Key": values[4] } },
    nodes: [{ id: "auth", access_token: values[5], password: values[6], nodeId: "node" }]
  });
  for (const output of [record, await store.get("workflows", "private"), await store.list("workflows")]) {
    const serialized = JSON.stringify(output);
    assert.ok(values.every(value => !serialized.includes(value)), "public result must not contain credentials");
  }
  assert.equal(record.hasApiKey, true);
  assert.equal(record.hasToken, true);
  assert.equal(record.provider.hasApiKey, true);
  assert.equal(record.nodes[0].hasToken, true);
  assert.equal(record.nodes[0].nodeId, "node");
  const internal = await store.get("workflows", "private", { secrets: true });
  assert.ok(internal.apiKey === values[0] && internal.provider.API_KEY === values[2]);
  internal.provider.API_KEY = "example-changed-locally";
  assert.ok((await store.get("workflows", "private", { secrets: true })).provider.API_KEY === values[2]);
  const empty = await store.put("settings", { id: "empty", apiKey: "", token: null, hasApiKey: true });
  assert.equal(empty.hasApiKey, false);
  assert.equal(empty.hasToken, false);
  const deleted = await store.remove("workflows", "private", { expectedVersion: 1 });
  assert.ok(values.every(value => !JSON.stringify(deleted).includes(value)));
});

test("partial and public roundtrip updates retain omitted and redacted-empty credentials", async t => {
  const { store } = await fixture(t);
  const apiKey = secret();
  const token = secret();
  const saved = await store.put("settings", { id: "provider", apiKey, provider: { token, apiBase: "https://example.test" } });
  const next = await store.put("settings", { ...saved, name: "renamed", apiKey: "", provider: { token: null, apiBase: "https://changed.test" } }, { expectedVersion: 1 });
  const privateNext = await store.get("settings", saved.id, { secrets: true });
  assert.ok(privateNext.apiKey === apiKey && privateNext.provider.token === token);
  assert.equal(next.provider.apiBase, "https://changed.test");
  assert.equal(next.hasApiKey, true);
  assert.equal(next.hasToken, true);
  const newKey = secret();
  await store.put("settings", { id: saved.id, apiKey: newKey }, { expectedVersion: 2 });
  assert.ok((await store.get("settings", saved.id, { secrets: true })).apiKey === newKey);
});

test("array credentials follow stable node IDs when public arrays are reordered", async t => {
  const { store } = await fixture(t);
  const a = secret();
  const b = secret();
  const saved = await store.put("workflows", { id: "nodes", nodes: [{ id: "a", token: a }, { id: "b", token: b }] });
  await store.put("workflows", { ...saved, nodes: saved.nodes.toReversed() }, { expectedVersion: 1 });
  const internal = await store.get("workflows", saved.id, { secrets: true });
  assert.ok(internal.nodes[0].token === b && internal.nodes[1].token === a);
});

test("job snapshots keep metadata but never persist credential values", async t => {
  const { store } = await fixture(t);
  const value = secret();
  const voice = await store.put("voices", { id: "snapshot-voice", name: "Original", apiKey: value });
  const job = await store.put("jobs", { id: "job", input: { voiceId: voice.id }, snapshot: { voice: await store.get("voices", voice.id, { secrets: true }) } });
  await store.put("voices", { id: voice.id, name: "Renamed" }, { expectedVersion: 1 });
  await store.remove("voices", voice.id, { expectedVersion: 2 });
  assert.deepEqual(await store.get("jobs", job.id), job);
  const privateJob = await store.get("jobs", job.id, { secrets: true });
  assert.ok(!JSON.stringify(privateJob).includes(value));
  assert.equal(privateJob.snapshot.voice.name, "Original");
});

test("invalid collections, IDs, JSON values and options fail without changing the registry", async t => {
  const { store } = await fixture(t);
  await assert.rejects(store.list("../voices"), status(400));
  await assert.rejects(store.get("voices", "../registry.json"), status(400));
  await assert.rejects(store.put("voices", []), status(400));
  await assert.rejects(store.put("voices", { id: "__proto__" }), status(400));
  await assert.rejects(store.put("voices", JSON.parse('{"id":"x","__proto__":{"polluted":true}}')), status(400));
  await assert.rejects(store.put("voices", { id: "x", value: Infinity }), status(400));
  await assert.rejects(store.put("voices", { id: "x" }, { expectedVersion: "1" }), status(400));
  await assert.rejects(store.put("voices", { id: "x" }, { createOnly: "true" }), status(400));
  const circular = { id: "circular" };
  circular.value = circular;
  await assert.rejects(store.put("voices", circular), status(400));
  assert.deepEqual(await store.list("voices"), []);
  assert.equal({}.polluted, undefined);
});

test("Windows atomic commit survives a native temporary delete-sharing denial", { skip: process.platform !== "win32" }, async t => {
  const { store, root, dataDir } = await fixture(t);
  const record = await store.put("voices", { id: "locked", name: "before" });
  const file = path.join(root, "registry.json");
  const before = await fs.promises.readFile(file);
  const child = spawn(path.join(process.env.SystemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"), [
    "-NoProfile", "-NonInteractive", "-Command",
    "$stream = [IO.File]::Open($env:AVATAR_TEST_LOCK_FILE, 'Open', 'Read', 'ReadWrite'); " +
    "try { [Console]::WriteLine('LOCKED'); [Console]::ReadLine() | Out-Null } finally { $stream.Dispose() }"
  ], { env: { ...process.env, AVATAR_TEST_LOCK_FILE: file }, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
  const exited = new Promise(resolve => { child.once("close", resolve); child.once("error", resolve); });
  let mocked;
  try {
    await new Promise((resolve, reject) => {
      child.stdout.once("data", chunk => String(chunk).trim() === "LOCKED" ? resolve() : reject(new Error("Unexpected lock helper output")));
      child.once("error", reject);
      child.once("exit", () => reject(new Error("Lock helper exited before acquiring the file")));
    });
    const rename = fs.promises.rename;
    const sources = [];
    let denied = false;
    mocked = t.mock.method(fs.promises, "rename", async (from, to) => {
      if (to !== file) return rename(from, to);
      sources.push(from);
      if (sources.length > 1) return rename(from, to);
      try { return await rename(from, to); }
      catch (failure) {
        t.diagnostic(`native rename denial: ${failure.code}`);
        assert.equal(failure.code, "EPERM");
        denied = true;
        assert.deepEqual(await fs.promises.readFile(file), before);
        assert.equal(JSON.parse(await fs.promises.readFile(from, "utf8")).collections.voices.locked.name, "after");
        throw failure;
      } finally {
        child.stdin.end();
        await exited;
      }
    });
    const saved = await store.put("voices", { id: record.id, name: "after" }, { expectedVersion: record.version });
    assert.equal(denied, true, "the OS must actually deny the first rename");
    assert.ok(sources.length >= 2);
    assert.equal(new Set(sources).size, 1, "retry only the already-fsynced temporary file");
    assert.equal(saved.version, record.version + 1);
    assert.deepEqual(await createStore(dataDir).get("voices", record.id), saved);
    assert.ok(!(await fs.promises.readdir(root)).some(name => name.endsWith(".tmp")));
  } finally {
    mocked?.mock.restore();
    child.stdin.end();
    await exited;
  }
});

test("Windows persistent rename denial is bounded and preserves the committed registry", { skip: process.platform !== "win32" }, async t => {
  const { store, root } = await fixture(t);
  const record = await store.put("voices", { id: "denied", name: "before" });
  const file = path.join(root, "registry.json");
  const before = await fs.promises.readFile(file);
  const rename = fs.promises.rename;
  let attempts = 0;
  const mocked = t.mock.method(fs.promises, "rename", async (from, to) => {
    if (to !== file) return rename(from, to);
    attempts++;
    assert.deepEqual(await fs.promises.readFile(file), before);
    throw Object.assign(new Error("fixture permanent denial"), { code: "EPERM" });
  });
  await assert.rejects(store.put("voices", { id: record.id, name: "after" }, { expectedVersion: record.version }), status(500));
  mocked.mock.restore();
  assert.equal(attempts, 5);
  assert.deepEqual(await fs.promises.readFile(file), before);
  assert.deepEqual(await store.get("voices", record.id), record);
  assert.ok(!(await fs.promises.readdir(root)).some(name => name.endsWith(".tmp")));
  assert.equal((await store.put("voices", { id: record.id, name: "recovered" }, { expectedVersion: record.version })).version, 2);
});

test("Windows rename retry keeps conditional writes serialized without replaying the transaction", { skip: process.platform !== "win32" }, async t => {
  const { store, root, dataDir } = await fixture(t);
  const record = await store.put("voices", { id: "queued", name: "before" });
  const file = path.join(root, "registry.json");
  const before = await fs.promises.readFile(file);
  const rename = fs.promises.rename;
  const sources = [];
  const mocked = t.mock.method(fs.promises, "rename", async (from, to) => {
    if (to !== file) return rename(from, to);
    sources.push(from);
    if (sources.length <= 2) {
      assert.deepEqual(await fs.promises.readFile(file), before);
      throw Object.assign(new Error("fixture transient denial"), { code: "EPERM" });
    }
    return rename(from, to);
  });
  const results = await Promise.allSettled([
    store.put("voices", { id: record.id, name: "after" }, { expectedVersion: 1 }),
    createStore(dataDir).put("voices", { id: record.id, name: "stale" }, { expectedVersion: 1 })
  ]);
  mocked.mock.restore();
  assert.equal(results[0].status, "fulfilled");
  assert.equal(results[0].value.version, 2);
  assert.equal(results[1].status, "rejected");
  assert.equal(results[1].reason.status, 409);
  assert.equal(sources.length, 3);
  assert.equal(new Set(sources).size, 1);
  assert.deepEqual(await store.get("voices", record.id), results[0].value);
});

test("Windows rename retry refuses a destination changed into a hard link", { skip: process.platform !== "win32" }, async t => {
  const { store, root } = await fixture(t);
  const record = await store.put("voices", { id: "safe", name: "before" });
  const file = path.join(root, "registry.json");
  const linked = path.join(root, "linked.json");
  const before = await fs.promises.readFile(file);
  const rename = fs.promises.rename;
  let attempts = 0;
  const mocked = t.mock.method(fs.promises, "rename", async (from, to) => {
    if (to !== file) return rename(from, to);
    attempts++;
    if (attempts === 1) {
      await fs.promises.link(file, linked);
      throw Object.assign(new Error("fixture transient denial"), { code: "EPERM" });
    }
    return rename(from, to);
  });
  await assert.rejects(store.put("voices", { id: record.id, name: "after" }, { expectedVersion: 1 }), status(500));
  mocked.mock.restore();
  assert.equal(attempts, 1);
  assert.deepEqual(await fs.promises.readFile(file), before);
  assert.deepEqual(await fs.promises.readFile(linked), before);
  assert.ok(!(await fs.promises.readdir(root)).some(name => name.endsWith(".tmp")));
});

test("failed atomic rename preserves the committed bytes and subsequent writes recover", async t => {
  const { store, root } = await fixture(t);
  const record = await store.put("voices", { id: "atomic", name: "before" });
  const file = path.join(root, "registry.json");
  const before = await fs.promises.readFile(file);
  const rename = fs.promises.rename;
  let attempts = 0;
  const mocked = t.mock.method(fs.promises, "rename", async (from, to) => {
    if (to === file) {
      attempts++;
      throw Object.assign(new Error("fixture rename failure"), { code: "EIO" });
    }
    return rename(from, to);
  });
  await assert.rejects(store.put("voices", { id: record.id, name: "after" }, { expectedVersion: 1 }));
  mocked.mock.restore();
  assert.equal(attempts, 1, "non-contention I/O errors must not be retried");
  assert.deepEqual(await fs.promises.readFile(file), before);
  assert.ok(!(await fs.promises.readdir(root)).some(name => name.endsWith(".tmp")));
  assert.equal((await store.put("voices", { id: record.id, name: "after" }, { expectedVersion: 1 })).version, 2);
});

test("corrupt or unsupported registry data fails closed and errors do not echo private bytes", async t => {
  const { store, root } = await fixture(t);
  await store.put("voices", { id: "before" });
  const file = path.join(root, "registry.json");
  const value = secret();
  for (const raw of [`{"apiKey":"${value}",`, JSON.stringify({ schemaVersion: 999, apiKey: value })]) {
    await fs.promises.writeFile(file, raw, "utf8");
    await assert.rejects(store.put("voices", { id: "after" }), error => error.status === 500 && !error.message.includes(value));
    assert.ok((await fs.promises.readFile(file, "utf8")) === raw);
  }
});

test("album stores content-addressed files and concurrent identical uploads deduplicate", async t => {
  const { store, dataDir, root } = await fixture(t);
  const other = createStore(dataDir);
  const [image, duplicate] = await Promise.all([
    store.saveImage({ buffer: png, name: "../../portrait.png", mimeType: "image/png" }),
    other.saveImage({ buffer: png, name: "other.png", mimeType: "image/png" })
  ]);
  assert.deepEqual(image, duplicate);
  assert.equal(image.name, "portrait.png");
  assert.equal(image.sha256, crypto.createHash("sha256").update(png).digest("hex"));
  assert.equal(image.size, png.length);
  assert.equal(image.url, `/api/control/v1/avatar-workflow/images/${image.id}/content`);
  assert.deepEqual(image.voiceIds, []);
  assert.equal(image.defaultVoiceId, null);
  assert.equal((await store.list("images")).length, 1);
  assert.ok(!JSON.stringify(image).includes(root));
  assert.deepEqual(await createStore(dataDir).readImage(image.id), { buffer: png, mimeType: "image/png", name: "portrait.png" });
  assert.deepEqual(await fs.promises.readdir(path.join(root, "images")), [`${image.sha256}.png`]);
});

test("JPEG and WebP signatures are accepted with canonical MIME and safe display names", async t => {
  const { store } = await fixture(t);
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 2, 0xff, 0xd9]);
  const webp = Buffer.from("524946460c000000574542505650382000000000", "hex");
  for (const [buffer, mimeType, filename] of [[jpeg, "image/jpeg", "C:\\old\\portrait.jpg"], [webp, "image/webp", "portrait.webp\r\n"]]) {
    const image = await store.saveImage({ buffer, name: filename, mimeType });
    const content = await store.readImage(image.id);
    assert.deepEqual(content.buffer, buffer);
    assert.equal(content.mimeType, mimeType);
    assert.ok(!/[\\/\r\n]/.test(content.name));
  }
});

test("album rejects unsupported, mismatched, truncated, empty and over-20MiB input", async t => {
  const { store } = await fixture(t);
  for (const options of [
    { buffer: Buffer.from("<svg></svg>"), mimeType: "image/svg+xml" },
    { buffer: png, mimeType: "image/jpeg" },
    { buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]), mimeType: "image/png" },
    { buffer: Buffer.from("RIFF0000WEBP"), mimeType: "image/webp" },
    { buffer: Buffer.alloc(0), mimeType: "image/png" },
    { buffer: "not a buffer", mimeType: "image/png" }
  ]) await assert.rejects(store.saveImage({ name: "invalid", ...options }), error => [400, 415].includes(error.status));
  const large = Buffer.alloc(20 * 1024 * 1024 + 1);
  png.copy(large);
  await assert.rejects(store.saveImage({ buffer: large, name: "large.png", mimeType: "image/png" }), status(413));
  assert.deepEqual(await store.list("images"), []);
});

test("manual bindings validate voice references and default membership", async t => {
  const { store } = await fixture(t);
  await store.put("voices", { id: "a" });
  await store.put("voices", { id: "b" });
  const image = await store.saveImage({ buffer: png, name: "portrait.png", mimeType: "image/png" });
  for (const fields of [
    { voiceIds: ["missing"] }, { voiceIds: "a" }, { voiceIds: [3] },
    { voiceIds: ["a"], defaultVoiceId: "b" }, { defaultVoiceId: "a" }
  ]) await assert.rejects(store.put("images", { id: image.id, ...fields }, { expectedVersion: 1 }), status(400));
  const bound = await store.put("images", { id: image.id, voiceIds: ["a", "b", "a"], defaultVoiceId: "b" }, { expectedVersion: 1 });
  assert.deepEqual(bound.voiceIds, ["a", "b"]);
  assert.equal(bound.defaultVoiceId, "b");
  await assert.rejects(store.put("images", { id: image.id, voiceIds: ["a"] }, { expectedVersion: 2 }), status(400));
  const cleared = await store.put("images", { id: image.id, voiceIds: [], defaultVoiceId: null }, { expectedVersion: 2 });
  assert.equal(cleared.defaultVoiceId, null);
});

test("voice and image deletion leave job snapshots and original image bytes intact", async t => {
  const { store, root, dataDir } = await fixture(t);
  await store.put("voices", { id: "a", name: "Deleted voice" });
  await store.put("voices", { id: "b" });
  let image = await store.saveImage({ buffer: png, name: "portrait.png", mimeType: "image/png" });
  image = await store.put("images", { id: image.id, voiceIds: ["a", "b"], defaultVoiceId: "a" }, { expectedVersion: 1 });
  const job = await store.put("jobs", { id: "snapshot", snapshot: { image, voice: await store.get("voices", "a") } });
  await store.remove("voices", "a", { expectedVersion: 1 });
  const updated = await store.get("images", image.id);
  assert.deepEqual(updated.voiceIds, ["b"]);
  assert.equal(updated.defaultVoiceId, null);
  assert.equal(updated.version, 3);
  assert.deepEqual(await store.get("jobs", job.id), job);
  await store.remove("images", image.id, { expectedVersion: 3 });
  assert.deepEqual(await store.get("jobs", job.id), job);
  assert.deepEqual(await fs.promises.readFile(path.join(root, "images", `${image.sha256}.png`)), png);
  await store.remove("voices", "b", { expectedVersion: 1 });
  for (const reader of [store, createStore(dataDir)]) {
    assert.equal(await reader.get("images", image.id), null);
    assert.equal(await reader.get("images", image.id, { secrets: true }), null);
    assert.deepEqual(await reader.list("images"), []);
    assert.deepEqual(await reader.get("jobs", job.id), job);
    assert.deepEqual(await reader.readImage(job.snapshot.image.id), { buffer: png, mimeType: "image/png", name: "portrait.png" });
  }
});

test("image content cannot be redirected through IDs or writable metadata", async t => {
  const { store } = await fixture(t);
  const image = await store.saveImage({ buffer: png, name: "safe.png", mimeType: "image/png" });
  await assert.rejects(store.readImage("../registry.json"), status(400));
  await assert.rejects(store.readImage("missing"), status(404));
  await assert.rejects(store.put("images", { id: "fake", path: "../registry.json" }), status(400));
  for (const fields of [{ path: "../registry.json" }, { filePath: "C:\\private" }, { sha256: "../private" }, { mimeType: "text/plain" }, { url: "file:///private" }, { size: 1 }]) {
    await assert.rejects(store.put("images", { id: image.id, ...fields }, { expectedVersion: 1 }), status(400));
  }
  const renamed = await store.put("images", { ...image, name: "renamed.png" }, { expectedVersion: 1 });
  assert.equal((await store.readImage(image.id)).name, renamed.name);
});

test("image readers reject tampered bytes and junctions outside the content directory", async t => {
  const { store, root, dataDir } = await fixture(t);
  const image = await store.saveImage({ buffer: png, name: "safe.png", mimeType: "image/png" });
  const contentFile = path.join(root, "images", `${image.sha256}.png`);
  await fs.promises.writeFile(contentFile, Buffer.from("not the original image"));
  await assert.rejects(store.readImage(image.id), status(500));
  const outside = path.join(dataDir, "outside");
  await fs.promises.mkdir(outside);
  await fs.promises.rename(path.join(root, "images"), path.join(root, "original-images"));
  await fs.promises.symlink(outside, path.join(root, "images"), process.platform === "win32" ? "junction" : "dir");
  await fs.promises.writeFile(path.join(outside, `${image.sha256}.png`), png);
  await assert.rejects(store.readImage(image.id), status(500));
});

test("legacy imports preserve config values with deterministic IDs and private backups", async t => {
  const { store, root, dataDir } = await fixture(t);
  const apiKey = secret();
  const config = { voices: [{ voice_id: "upstream", name: "Legacy voice", apiKey, speed: 0.8 }], runningHubWorkflows: [{ workflowId: "upstream-workflow", apiKey, nodes: [{ nodeId: "7", fieldName: "prompt", fieldValue: "original" }] }] };
  const original = structuredClone(config);
  const imported = await store.importLegacy(config);
  assert.equal(imported.imported.voices.length, 1);
  assert.equal(imported.imported.workflows.length, 1);
  assert.ok(!JSON.stringify(imported).includes(apiKey));
  const voice = await store.get("voices", imported.imported.voices[0].id, { secrets: true });
  assert.ok(voice.apiKey === apiKey);
  assert.equal(voice.voice_id, "upstream");
  assert.equal(voice.speed, 0.8);
  const workflow = await store.get("workflows", imported.imported.workflows[0].id, { secrets: true });
  assert.ok(workflow.apiKey === apiKey);
  assert.deepEqual(workflow.nodes, original.runningHubWorkflows[0].nodes);
  assert.deepEqual(config, original);
  const backupFiles = await fs.promises.readdir(path.join(root, "private"));
  assert.equal(backupFiles.length, 1);
  const backup = path.join(root, "private", backupFiles[0]);
  assert.ok(JSON.stringify(JSON.parse(await fs.promises.readFile(backup, "utf8"))) === JSON.stringify(original));
  if (process.platform !== "win32") assert.equal((await fs.promises.stat(backup)).mode & 0o777, 0o600);
  const retry = await createStore(dataDir).importLegacy(config);
  assert.equal(retry.imported.voices.length, 0);
  assert.equal(retry.skipped.voices.length, 1);
  assert.deepEqual(await fs.promises.readdir(path.join(root, "private")), backupFiles);
  const second = await fixture(t);
  const reordered = { runningHubWorkflows: config.runningHubWorkflows, voices: [{ speed: 0.8, apiKey, name: "Legacy voice", voice_id: "upstream" }] };
  const repeated = await second.store.importLegacy(reordered);
  assert.equal(repeated.imported.voices[0].id, voice.id);
});

test("legacy ID collisions and empty imports never overwrite or clear current libraries", async t => {
  const { store } = await fixture(t);
  const key = secret();
  const original = await store.put("voices", { id: "existing", name: "Current", apiKey: key });
  const result = await store.importLegacy({ voices: [{ id: original.id, name: "Old", apiKey: secret() }, { id: "new-voice", name: "Added" }], runningHubWorkflows: [] });
  assert.equal(result.imported.voices.length, 1);
  assert.deepEqual(result.skipped.voices, [original.id]);
  assert.deepEqual(await store.get("voices", original.id), original);
  assert.ok((await store.get("voices", original.id, { secrets: true })).apiKey === key);
  await store.importLegacy({ voices: [], runningHubWorkflows: [] });
  assert.equal((await store.list("voices")).length, 2);
});

test("legacy backup precedes commit and a failed import can be retried without data loss", async t => {
  const { store, root } = await fixture(t);
  const config = { voices: [{ id: "imported" }], runningHubWorkflows: [] };
  const rename = fs.promises.rename;
  const mocked = t.mock.method(fs.promises, "rename", async (from, to) => {
    if (to === path.join(root, "registry.json")) {
      assert.equal((await fs.promises.readdir(path.join(root, "private"))).length, 1);
      throw Object.assign(new Error("fixture commit failure"), { code: "EIO" });
    }
    return rename(from, to);
  });
  await assert.rejects(store.importLegacy(config));
  mocked.mock.restore();
  assert.deepEqual(await store.list("voices"), []);
  assert.equal((await store.importLegacy(config)).imported.voices.length, 1);
  assert.equal((await fs.promises.readdir(path.join(root, "private"))).length, 1);
});

test("invalid legacy input aborts the whole import without touching existing data", async t => {
  const { store } = await fixture(t);
  const saved = await store.put("voices", { id: "saved" });
  for (const config of [null, { voices: "C:\\legacy.json" }, { voices: [{ id: "valid" }, null] }, { voices: [{ id: "valid" }], runningHubWorkflows: 7 }]) {
    await assert.rejects(store.importLegacy(config), status(400));
    assert.deepEqual(await store.list("voices"), [saved]);
  }
});

test("object prototype names are ordinary record IDs, not inherited records", async t => {
  const { store } = await fixture(t);
  for (const id of ["toString", "valueOf", "hasOwnProperty"]) {
    assert.equal(await store.get("voices", id), null);
    const saved = await store.put("voices", { id }, { createOnly: true });
    assert.equal(saved.version, 1);
    await store.remove("voices", id, { expectedVersion: 1 });
    assert.equal(await store.get("voices", id), null);
  }
});

test("nulling a credential-bearing container cannot implicitly erase omitted secrets", async t => {
  const { store } = await fixture(t);
  const value = secret();
  await store.put("settings", { id: "runninghub", provider: { apiKey: value, region: "test" } });
  await assert.rejects(store.put("settings", { id: "runninghub", provider: null }, { expectedVersion: 1 }), status(400));
  assert.ok((await store.get("settings", "runninghub", { secrets: true })).provider.apiKey === value);
});

test("RunningHub nodeId and fieldName identify credentials during array reordering", async t => {
  const { store } = await fixture(t);
  const a = secret();
  const b = secret();
  const record = await store.put("workflows", { id: "rh", nodes: [
    { nodeId: "1", fieldName: "first", apiKey: a },
    { nodeId: "1", fieldName: "second", apiKey: b }
  ] });
  await store.put("workflows", { ...record, nodes: record.nodes.toReversed() }, { expectedVersion: 1 });
  const internal = await store.get("workflows", record.id, { secrets: true });
  assert.ok(internal.nodes[0].apiKey === b && internal.nodes[1].apiKey === a, "credentials must stay with their original node field");
});

test("settings IDs and versioned job status updates retain the original input snapshot", async t => {
  const { store, dataDir } = await fixture(t);
  for (const id of ["runninghub", "dependencies"]) await store.put("settings", { id }, { createOnly: true });
  const snapshot = { voice: { id: "voice", name: "Snapshot voice" }, text: "original input" };
  await store.put("jobs", { id: "pending", state: "submitting", input: snapshot }, { createOnly: true });
  const finished = await store.put("jobs", { id: "pending", state: "done", result: { url: "https://example.test/result.mp4" } }, { expectedVersion: 1 });
  assert.deepEqual(finished.input, snapshot);
  assert.deepEqual(await createStore(dataDir).get("jobs", finished.id), finished);
  await assert.rejects(store.put("jobs", { id: finished.id, state: "submitting" }, { createOnly: true }), status(409));
});

test("failed album registry commit preserves existing records and retry reuses retained bytes", async t => {
  const { store, root } = await fixture(t);
  await store.put("voices", { id: "existing" });
  const rename = fs.promises.rename;
  const mocked = t.mock.method(fs.promises, "rename", async (from, to) => {
    if (to === path.join(root, "registry.json")) throw new Error("fixture failure");
    return rename(from, to);
  });
  await assert.rejects(store.saveImage({ buffer: png, mimeType: "image/png" }), status(500));
  mocked.mock.restore();
  assert.deepEqual(await store.list("images"), []);
  assert.equal((await store.list("voices")).length, 1);
  const image = await store.saveImage({ buffer: png, mimeType: "image/png" });
  assert.deepEqual((await store.readImage(image.id)).buffer, png);
  assert.equal((await fs.promises.readdir(path.join(root, "images"))).length, 1);
});

test("backup failure prevents import and retrying an import cannot resurrect deleted IDs", async t => {
  const { store, root } = await fixture(t);
  const config = { voices: [{ id: "legacy" }], runningHubWorkflows: [] };
  const rename = fs.promises.rename;
  const mocked = t.mock.method(fs.promises, "rename", async (from, to) => {
    if (path.dirname(to) === path.join(root, "private")) throw new Error("fixture backup failure");
    return rename(from, to);
  });
  await assert.rejects(store.importLegacy(config), status(500));
  mocked.mock.restore();
  assert.deepEqual(await store.list("voices"), []);
  await store.importLegacy(config);
  await store.remove("voices", "legacy", { expectedVersion: 1 });
  assert.deepEqual((await store.importLegacy(config)).skipped.voices, ["legacy"]);
  assert.deepEqual(await store.list("voices"), []);
});

test("Agent createOnly rejects tombstoned IDs in every collection without changing disk state", async t => {
  const { store, root, dataDir } = await fixture(t);
  for (const collection of collections) {
    const saved = collection === "images"
      ? await store.saveImage({ buffer: png, name: "history.png", mimeType: "image/png" })
      : await store.put(collection, { id: "reserved", name: "Original" }, { createOnly: true });
    await store.remove(collection, saved.id, { expectedVersion: saved.version });
    const before = await fs.promises.readFile(path.join(root, "registry.json"));
    const reopened = createStore(dataDir);
    for (const options of [{ createOnly: true }, { createOnly: true, expectedVersion: saved.version }]) {
      await assert.rejects(reopened.put(collection, { ...saved, name: "Agent overwrite" }, options), status(409));
    }
    assert.equal(await reopened.get(collection, saved.id), null);
    assert.deepEqual(await fs.promises.readFile(path.join(root, "registry.json")), before);
    if (collection === "images") assert.deepEqual(await reopened.readImage(saved.id), { buffer: png, mimeType: "image/png", name: "history.png" });
  }
});

test("schema-v1 registries without image tombstones remain readable and gain them on deletion", async t => {
  const { store, root, dataDir } = await fixture(t);
  const saved = await store.saveImage({ buffer: png, name: "old-schema.png", mimeType: "image/png" });
  const file = path.join(root, "registry.json");
  const older = JSON.parse(await fs.promises.readFile(file, "utf8"));
  delete older.imageTombstones;
  await fs.promises.writeFile(file, JSON.stringify(older), "utf8");
  const reopened = createStore(dataDir);
  assert.deepEqual(await reopened.get("images", saved.id), saved);
  await reopened.remove("images", saved.id, { expectedVersion: saved.version });
  const committed = JSON.parse(await fs.promises.readFile(file, "utf8"));
  assert.equal(committed.schemaVersion, 1);
  assert.equal(committed.imageTombstones?.[saved.id]?.sha256, saved.sha256);
  assert.deepEqual(await createStore(dataDir).readImage(saved.id), { buffer: png, mimeType: "image/png", name: "old-schema.png" });
});

test("failed deletion cannot partially publish a tombstone or hide an active image", async t => {
  const { store, root } = await fixture(t);
  const saved = await store.saveImage({ buffer: png, name: "atomic-delete.png", mimeType: "image/png" });
  const before = await fs.promises.readFile(path.join(root, "registry.json"));
  const rename = fs.promises.rename;
  const mocked = t.mock.method(fs.promises, "rename", async (from, to) => {
    if (to === path.join(root, "registry.json")) throw new Error("fixture deletion failure");
    return rename(from, to);
  });
  await assert.rejects(store.remove("images", saved.id, { expectedVersion: saved.version }), status(500));
  mocked.mock.restore();
  assert.deepEqual(await fs.promises.readFile(path.join(root, "registry.json")), before);
  assert.deepEqual(await store.get("images", saved.id), saved);
  await store.remove("images", saved.id, { expectedVersion: saved.version });
  assert.deepEqual((await store.readImage(saved.id)).buffer, png);
});

test("tombstone reads reject unsafe metadata and tampered retained bytes", async t => {
  const { store, root } = await fixture(t);
  const saved = await store.saveImage({ buffer: png, name: "safe.png", mimeType: "image/png" });
  await store.remove("images", saved.id, { expectedVersion: saved.version });
  const file = path.join(root, "registry.json");
  const original = JSON.parse(await fs.promises.readFile(file, "utf8"));
  assert.ok(original.imageTombstones?.[saved.id], "deleted image metadata must be retained");
  for (const patch of [{ sha256: "../registry" }, { mimeType: "text/plain" }, { id: "other" }, { version: 999 }, { name: "unsafe\r\nheader" }]) {
    const forged = structuredClone(original);
    Object.assign(forged.imageTombstones[saved.id], patch);
    await fs.promises.writeFile(file, JSON.stringify(forged), "utf8");
    await assert.rejects(store.readImage(saved.id), status(500));
  }
  await fs.promises.writeFile(file, JSON.stringify(original), "utf8");
  await fs.promises.writeFile(path.join(root, "images", `${saved.sha256}.png`), Buffer.alloc(png.length));
  await assert.rejects(store.readImage(saved.id), status(500));
});

test("reuploading retained bytes preserves version ordering and subsequent previews", async t => {
  const { store, dataDir } = await fixture(t);
  const original = await store.saveImage({ buffer: png, name: "original.png", mimeType: "image/png" });
  await store.remove("images", original.id, { expectedVersion: original.version });
  const restored = await store.saveImage({ buffer: png, name: "restored.png", mimeType: "image/png" });
  assert.equal(restored.id, original.id);
  assert.ok(restored.version > original.version);
  assert.deepEqual(await createStore(dataDir).get("images", restored.id), restored);
  await assert.rejects(store.remove("images", restored.id, { expectedVersion: original.version }), status(409));
  await store.remove("images", restored.id, { expectedVersion: restored.version });
  assert.deepEqual(await createStore(dataDir).readImage(original.id), { buffer: png, mimeType: "image/png", name: "restored.png" });
});

test("retained metadata accepts safe long names already produced by the album", async t => {
  const { store, dataDir } = await fixture(t);
  const image = await store.saveImage({ buffer: png, name: `${"a".repeat(199)}.png`, mimeType: "image/png" });
  assert.equal((await store.readImage(image.id)).name, image.name);
  await store.remove("images", image.id, { expectedVersion: image.version });
  assert.equal((await createStore(dataDir).readImage(image.id)).name, image.name);
});

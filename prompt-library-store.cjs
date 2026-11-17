const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const library = require("./prompt-library.js");

// All browser writers and store handles in this server share a per-file queue.
// Each transaction reads committed disk state, never a browser-provided snapshot.
const queues = new Map();
function serialized(file, operation) {
  const previous = queues.get(file) || Promise.resolve();
  const pending = previous.catch(() => {}).then(operation);
  queues.set(file, pending);
  pending.finally(() => { if (queues.get(file) === pending) queues.delete(file); }).catch(() => {});
  return pending;
}

function invalid(message) {
  return Object.assign(new Error(message), { status: 400 });
}

function createPromptLibraryStore({ dataDir, fs: io = fs.promises } = {}) {
  if (!dataDir) throw new Error("Prompt library data directory is required");
  const file = path.resolve(dataDir, "prompt-library", "library.json");
  let cached;

  async function read() {
    let raw;
    let signature;
    try {
      const stat = await io.stat(file, { bigint: true });
      signature = [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].join(":");
      if (cached?.signature === signature) return cached.data;
      raw = await io.readFile(file, "utf8");
    }
    catch (error) {
      cached = undefined;
      if (error.code === "ENOENT") return { version: 1, revision: 0, state: library.createState() };
      throw error;
    }
    const data = JSON.parse(raw);
    if (data.version !== 1 || !Number.isSafeInteger(data.revision) || !data.state ||
      !data.state.entries || Array.isArray(data.state.entries) || typeof data.state.entries !== "object" ||
      !data.state.clocks || Array.isArray(data.state.clocks) || typeof data.state.clocks !== "object") {
      throw new Error("Invalid prompt library storage; refusing to overwrite it");
    }
    for (const [key, entry] of Object.entries(data.state.entries)) {
      if (!entry || entry.key !== key || !library.TASK_TYPES.includes(entry.taskType) || typeof entry.text !== "string" ||
        !Number.isSafeInteger(entry.usedAt) || typeof entry.favorite !== "boolean") {
        throw new Error("Invalid prompt library entry; refusing to overwrite it");
      }
    }
    cached = { signature, data };
    return data;
  }

  async function write(data) {
    const directory = path.dirname(file);
    await io.mkdir(directory, { recursive: true });
    const temporary = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
    let handle;
    try {
      handle = await io.open(temporary, "wx", 0o600);
      await handle.writeFile(JSON.stringify(data), "utf8");
      await handle.sync();
      await handle.close();
      handle = null;
      await io.rename(temporary, file);
      // Windows does not support opening directories for fsync. The file itself
      // is flushed before its atomic rename on every platform.
      if (process.platform !== "win32") {
        const directoryHandle = await io.open(directory, "r");
        try { await directoryHandle.sync(); } finally { await directoryHandle.close(); }
      }
    } finally {
      if (handle) await handle.close().catch(() => {});
      await io.unlink(temporary).catch(error => { if (error.code !== "ENOENT") throw error; });
    }
  }

  return {
    file,
    async append(rawEvents) {
      if (!Array.isArray(rawEvents) || rawEvents.length < 1 || rawEvents.length > 100) throw invalid("Expected 1 to 100 prompt events");
      const events = [];
      for (const raw of rawEvents) events.push(await library.normalizeEvent(raw));
      return serialized(file, async () => {
        const data = structuredClone(await read());
        const before = JSON.stringify(data.state);
        for (const event of events) library.applyEvent(data.state, event);
        if (JSON.stringify(data.state) !== before) {
          data.revision++;
          await write(data);
        }
        return { success: true, accepted: events.map(event => event.id), revision: data.revision };
      });
    },
    async list(taskType, { query = "", favoriteOnly = false, offset = 0, limit = 100, sinceRevision } = {}) {
      if (!library.TASK_TYPES.includes(taskType)) throw invalid("Invalid prompt library task type");
      if (typeof query !== "string" || query.length > 1000) throw invalid("Invalid prompt search query");
      if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw invalid("Invalid prompt pagination");
      if (sinceRevision !== undefined && (!Number.isSafeInteger(sinceRevision) || sinceRevision < 0)) throw invalid("Invalid prompt revision");
      return serialized(file, async () => {
        const data = await read();
        if (sinceRevision === data.revision) return { success: true, taskType, unchanged: true, revision: data.revision };
        const entries = library.getEntries(data.state, taskType, { query, favoriteOnly });
        const nextOffset = offset + limit < entries.length ? offset + limit : null;
        return { success: true, taskType, entries: entries.slice(offset, offset + limit), total: entries.length,
          revision: data.revision, nextOffset };
      });
    }
  };
}

module.exports = { createPromptLibraryStore };

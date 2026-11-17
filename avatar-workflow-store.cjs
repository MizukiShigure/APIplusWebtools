const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const COLLECTIONS = ["voices", "workflows", "images", "settings", "jobs"];
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const EXTENSIONS = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const FLAGS = new Set(["hasApiKey", "hasToken"]);
const queues = new Map();
const own = (object, key) => Object.hasOwn(object, key);
const lookup = (object, key) => own(object, key) ? object[key] : undefined;
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const error = (status, message) => Object.assign(new Error(message), { status });
const invalid = message => error(400, message);
const corrupt = () => error(500, "Invalid avatar workflow storage; refusing to overwrite it");
const digest = value => crypto.createHash("sha256").update(value).digest("hex");

// All handles in the owning server share a queue and reread committed disk state.
function serialized(file, operation) {
  const key = process.platform === "win32" ? file.toLowerCase() : file;
  const pending = (queues.get(key) || Promise.resolve()).catch(() => {}).then(operation);
  queues.set(key, pending);
  pending.finally(() => { if (queues.get(key) === pending) queues.delete(key); }).catch(() => {});
  return pending;
}

function validId(id) {
  return typeof id === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(id) && !FORBIDDEN_KEYS.has(id);
}

function validateTarget(collection, id) {
  if (!COLLECTIONS.includes(collection)) throw invalid("Invalid avatar workflow collection");
  if (id !== undefined && !validId(id)) throw invalid("Invalid avatar workflow record ID");
}

function jsonCopy(value, ancestors = new Set(), depth = 0) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "object" || depth > 80 || ancestors.has(value)) throw invalid("Expected finite, acyclic JSON data");
  if (!Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw invalid("Expected plain JSON data");
  ancestors.add(value);
  const result = Array.isArray(value) ? [] : {};
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key)) throw invalid("Unsafe JSON property");
    result[key] = jsonCopy(child, ancestors, depth + 1);
  }
  ancestors.delete(value);
  return result;
}

function credentialKind(key) {
  const normalized = key.replace(/[^a-z0-9]/gi, "").toLowerCase();
  if (/(?:apikey|accesskey|secretkey|privatekey)$/.test(normalized)) return "hasApiKey";
  if (/(?:token|authorization|bearer|password|passwd|secret|credential|credentials|cookie)$/.test(normalized)) return "hasToken";
  return null;
}

function configured(value) {
  return value !== null && value !== undefined && value !== false && value !== "" && (typeof value !== "string" || value.trim() !== "");
}

function publicValue(value, root = false) {
  if (Array.isArray(value)) return value.map(item => publicValue(item));
  if (!object(value)) return value;
  const result = {};
  let hasApiKey = value.hasApiKey === true;
  let hasToken = value.hasToken === true;
  function collect(child) {
    if (Array.isArray(child)) child.forEach(collect);
    else if (object(child)) {
      hasApiKey ||= child.hasApiKey === true;
      hasToken ||= child.hasToken === true;
    }
  }
  for (const [key, child] of Object.entries(value)) {
    if (FLAGS.has(key)) continue;
    const kind = credentialKind(key);
    if (kind) {
      if (kind === "hasApiKey") hasApiKey ||= configured(child);
      else hasToken ||= configured(child);
    } else {
      result[key] = publicValue(child);
      collect(result[key]);
    }
  }
  if (root || hasApiKey || own(value, "hasApiKey")) result.hasApiKey = hasApiKey;
  if (root || hasToken || own(value, "hasToken")) result.hasToken = hasToken;
  return result;
}

function containsCredentials(value) {
  if (Array.isArray(value)) return value.some(containsCredentials);
  return object(value) && Object.entries(value).some(([key, child]) =>
    credentialKind(key) ? configured(child) : containsCredentials(child));
}

function arrayIdentity(item) {
  if (!object(item)) return null;
  if (own(item, "id")) return JSON.stringify(["id", item.id]);
  if (own(item, "nodeId")) return JSON.stringify(["nodeId", item.nodeId, item.fieldName ?? null]);
  return null;
}

function merge(previous, patch) {
  if ((object(previous) || Array.isArray(previous)) &&
      (Array.isArray(previous) !== Array.isArray(patch) || object(previous) !== object(patch)) && containsCredentials(previous)) {
    throw invalid("Cannot replace a credential-bearing container with a different type");
  }
  if (Array.isArray(patch)) {
    const old = Array.isArray(previous) ? previous : [];
    return patch.map((item, index) => {
      const identity = arrayIdentity(item);
      return merge(identity === null ? old[index] : old.find(candidate => arrayIdentity(candidate) === identity), item);
    });
  }
  if (!object(patch)) return patch;
  const result = object(previous) ? structuredClone(previous) : {};
  for (const [key, value] of Object.entries(patch)) {
    if (FLAGS.has(key)) continue;
    if (credentialKind(key) && !configured(value) && configured(result[key])) continue;
    result[key] = merge(result[key], value);
  }
  return result;
}

function optionsValid(options) {
  if (!object(options)) throw invalid("Invalid write options");
  if (options.expectedVersion !== undefined && (!Number.isSafeInteger(options.expectedVersion) || options.expectedVersion < 1)) throw invalid("Invalid expectedVersion");
  if (options.createOnly !== undefined && typeof options.createOnly !== "boolean") throw invalid("Invalid createOnly");
}

function checkVersion(previous, { expectedVersion, createOnly }, previouslyUsed = false) {
  if ((createOnly && previouslyUsed) || (previous ? createOnly || expectedVersion !== previous.version : expectedVersion !== undefined)) {
    throw error(409, "Avatar workflow version conflict; reload the record");
  }
}

function emptyRegistry() {
  return { schemaVersion: 1, collections: Object.fromEntries(COLLECTIONS.map(key => [key, {}])),
    versions: Object.fromEntries(COLLECTIONS.map(key => [key, {}])), imageTombstones: {} };
}

function envelope(data, collection, id, fields, previous) {
  const version = (lookup(data.versions[collection], id) || 0) + 1;
  if (!Number.isSafeInteger(version)) throw corrupt();
  const now = new Date(Math.max(Date.now(), previous ? Date.parse(previous.updatedAt) + 1 : 0)).toISOString();
  const item = { ...fields, id, version, createdAt: previous?.createdAt || now, updatedAt: now };
  data.collections[collection][id] = item;
  data.versions[collection][id] = version;
  return item;
}

function imageUrl(id) { return `/api/control/v1/avatar-workflow/images/${id}/content`; }

function safeName(name, mimeType) {
  if (name !== undefined && typeof name !== "string") throw invalid("Invalid image name");
  return (name || "").replace(/\\/g, "/").split("/").pop().replace(/[\x00-\x1f\x7f]/g, "").replace(/[<>:"|?*]/g, "_").trim().replace(/[. ]+$/g, "").slice(0, 200) || `image.${EXTENSIONS[mimeType]}`;
}

function imageMime(buffer) {
  if (buffer.length >= 24 && buffer.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")) && buffer.toString("ascii", 12, 16) === "IHDR") return "image/png";
  if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.length >= 20 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP" &&
      ["VP8 ", "VP8L", "VP8X"].includes(buffer.toString("ascii", 12, 16)) && buffer.readUInt32LE(4) + 8 === buffer.length) return "image/webp";
  throw error(415, "Expected a PNG, JPEG or WebP image signature");
}

function imageContentValid(item) {
  if (!/^[a-f0-9]{64}$/.test(item.sha256) || !own(EXTENSIONS, item.mimeType) || !Number.isSafeInteger(item.size) ||
      item.size < 1 || item.size > MAX_IMAGE_BYTES || item.url !== imageUrl(item.id) ||
      typeof item.name !== "string" || !item.name || /[\x00-\x1f\x7f\\/]/.test(item.name)) throw invalid("Invalid image content metadata");
}

function imageValid(item, voices) {
  imageContentValid(item);
  if (!Array.isArray(item.voiceIds) || item.voiceIds.some(id => !validId(id) || !own(voices, id))) throw invalid("Image voiceIds must reference existing voices");
  if (item.defaultVoiceId !== null && (!validId(item.defaultVoiceId) || !item.voiceIds.includes(item.defaultVoiceId))) throw invalid("Image defaultVoiceId must belong to voiceIds");
}

async function directory(dir) {
  await fs.promises.mkdir(dir, { recursive: true, mode: 0o700 });
  const stat = await fs.promises.lstat(dir);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw corrupt();
}

async function regularFile(file) {
  let stat;
  try { stat = await fs.promises.lstat(file); }
  catch (failure) { if (failure.code === "ENOENT") return null; throw failure; }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw corrupt();
  return stat;
}

async function atomicWrite(file, contents) {
  const temporary = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  let handle;
  try {
    handle = await fs.promises.open(temporary, "wx", 0o600);
    await handle.writeFile(contents, typeof contents === "string" ? "utf8" : undefined);
    await handle.sync();
    await handle.close();
    handle = null;
    for (let attempt = 0; ; attempt++) {
      try {
        await fs.promises.rename(temporary, file);
        break;
      } catch (failure) {
        // Windows readers can briefly deny delete sharing. Retry only the commit,
        // never the transaction, and never unlink the last committed destination.
        if (process.platform !== "win32" || failure.code !== "EPERM" || attempt >= 4) throw failure;
        await new Promise(resolve => setTimeout(resolve, 10 * 2 ** attempt));
        await directory(path.dirname(file));
        if (!await regularFile(temporary)) throw corrupt();
        await regularFile(file);
      }
    }
    if (process.platform !== "win32") {
      const parent = await fs.promises.open(path.dirname(file), "r");
      try { await parent.sync(); } finally { await parent.close(); }
    }
  } finally {
    if (handle) await handle.close().catch(() => {});
    await fs.promises.unlink(temporary).catch(failure => { if (failure.code !== "ENOENT") throw failure; });
  }
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (object(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function createAvatarWorkflowStore({ dataDir } = {}) {
  if (typeof dataDir !== "string" || !dataDir.trim()) throw invalid("Avatar workflow dataDir is required");
  const root = path.resolve(dataDir, "avatar-workflow");
  const file = path.join(root, "registry.json");
  const imageDirectory = path.join(root, "images");

  async function read() {
    if (!await regularFile(file)) return emptyRegistry();
    try {
      const data = jsonCopy(JSON.parse(await fs.promises.readFile(file, "utf8")));
      if (data.schemaVersion !== 1 || !object(data.collections) || !object(data.versions)) throw corrupt();
      if (data.imageTombstones === undefined) data.imageTombstones = {};
      if (!object(data.imageTombstones)) throw corrupt();
      for (const collection of COLLECTIONS) {
        if (!object(data.collections[collection]) || !object(data.versions[collection])) throw corrupt();
        for (const [id, version] of Object.entries(data.versions[collection])) {
          if (!validId(id) || !Number.isSafeInteger(version) || version < 1) throw corrupt();
        }
        for (const [id, item] of Object.entries(data.collections[collection])) {
          if (!validId(id) || !object(item) || item.id !== id || !Number.isSafeInteger(item.version) || item.version < 1 ||
              data.versions[collection][id] !== item.version || !Number.isFinite(Date.parse(item.createdAt)) || !Number.isFinite(Date.parse(item.updatedAt))) throw corrupt();
          if (collection === "images") imageValid(item, data.collections.voices);
        }
      }
      for (const [id, item] of Object.entries(data.imageTombstones)) {
        if (!validId(id) || !object(item) || item.id !== id || !Number.isSafeInteger(item.version) || item.version < 1 ||
            lookup(data.versions.images, id) !== item.version || own(data.collections.images, id)) throw corrupt();
        imageContentValid(item);
      }
      return data;
    } catch { throw corrupt(); }
  }

  const write = data => atomicWrite(file, JSON.stringify(data));
  const transaction = operation => serialized(file, async () => {
    try {
      await directory(root);
      return await operation(await read());
    } catch (failure) {
      if (failure.status) throw failure;
      throw error(500, "Avatar workflow storage operation failed");
    }
  });

  async function content(item) {
    await directory(imageDirectory);
    const contentFile = path.join(imageDirectory, `${item.sha256}.${EXTENSIONS[item.mimeType]}`);
    const stat = await regularFile(contentFile);
    if (!stat || stat.size !== item.size || stat.size > MAX_IMAGE_BYTES) throw corrupt();
    const buffer = await fs.promises.readFile(contentFile);
    if (digest(buffer) !== item.sha256) throw corrupt();
    return { buffer, mimeType: item.mimeType, name: item.name };
  }

  return {
    async list(collection) {
      validateTarget(collection);
      return transaction(data => Object.values(data.collections[collection]).map(item => publicValue(item, true)));
    },
    async get(collection, id, { secrets = false } = {}) {
      validateTarget(collection, id);
      if (!validId(id) || typeof secrets !== "boolean") throw invalid("Invalid read options");
      return transaction(data => {
        const item = lookup(data.collections[collection], id);
        return item ? secrets ? structuredClone(item) : publicValue(item, true) : null;
      });
    },
    async put(collection, item, options = {}) {
      validateTarget(collection);
      optionsValid(options);
      const patch = jsonCopy(item);
      if (!object(patch)) throw invalid("Expected a record object");
      const id = patch.id === undefined ? crypto.randomUUID() : patch.id;
      validateTarget(collection, id);
      const writeOptions = { ...options };
      return transaction(async data => {
        const previous = lookup(data.collections[collection], id);
        checkVersion(previous, writeOptions, own(data.versions[collection], id));
        let fields = merge(previous, patch);
        if (collection === "images") {
          if (!previous) throw invalid("Create images with saveImage");
          for (const key of ["path", "filePath", "contentPath", "filename"]) if (own(patch, key)) throw invalid("Image paths are not writable");
          for (const key of ["sha256", "mimeType", "size", "url"]) if (own(patch, key) && patch[key] !== previous[key]) throw invalid("Image content metadata is immutable");
          fields.name = safeName(fields.name, fields.mimeType);
          imageValid(fields, data.collections.voices);
          fields.voiceIds = [...new Set(fields.voiceIds)];
        }
        // Job/history snapshots never become a second credential store.
        if (collection === "jobs") fields = publicValue(fields, true);
        const saved = envelope(data, collection, id, fields, previous);
        await write(data);
        return publicValue(saved, true);
      });
    },
    async remove(collection, id, options = {}) {
      validateTarget(collection, id);
      if (!validId(id)) throw invalid("Invalid avatar workflow record ID");
      optionsValid(options);
      const writeOptions = { ...options };
      return transaction(async data => {
        const previous = lookup(data.collections[collection], id);
        checkVersion(previous, writeOptions);
        if (!previous) throw error(404, "Avatar workflow record not found");
        delete data.collections[collection][id];
        if (collection === "images") {
          const { version, name, mimeType, size, sha256, url } = previous;
          data.imageTombstones[id] = { id, version, name, mimeType, size, sha256, url };
        }
        if (collection === "voices") {
          for (const image of Object.values(data.collections.images)) {
            if (!image.voiceIds.includes(id)) continue;
            envelope(data, "images", image.id, { ...image, voiceIds: image.voiceIds.filter(voiceId => voiceId !== id),
              defaultVoiceId: image.defaultVoiceId === id ? null : image.defaultVoiceId }, image);
          }
        }
        // Keep image bytes and historical snapshots even after logical deletion.
        await write(data);
        return publicValue(previous, true);
      });
    },
    async saveImage({ buffer, name, mimeType } = {}) {
      if (!Buffer.isBuffer(buffer) || !buffer.length) throw invalid("Expected a nonempty image Buffer");
      if (buffer.length > MAX_IMAGE_BYTES) throw error(413, "Image exceeds 20 MiB");
      const bytes = Buffer.from(buffer);
      const detected = imageMime(bytes);
      if (mimeType !== detected) throw error(415, "Image MIME type does not match its signature");
      const filename = safeName(name, detected);
      const sha256 = digest(bytes);
      return transaction(async data => {
        const existing = Object.values(data.collections.images).find(item => item.sha256 === sha256);
        if (existing) { await content(existing); return publicValue(existing, true); }
        await directory(imageDirectory);
        const contentFile = path.join(imageDirectory, `${sha256}.${EXTENSIONS[detected]}`);
        const stat = await regularFile(contentFile);
        if (stat) {
          if (stat.size !== bytes.length || digest(await fs.promises.readFile(contentFile)) !== sha256) throw corrupt();
        } else await atomicWrite(contentFile, bytes);
        const id = `image-${sha256}`;
        const saved = envelope(data, "images", id, { name: filename, mimeType: detected, size: bytes.length, sha256,
          url: imageUrl(id), voiceIds: [], defaultVoiceId: null });
        delete data.imageTombstones[id];
        await write(data);
        return publicValue(saved, true);
      });
    },
    async readImage(id) {
      validateTarget("images", id);
      if (!validId(id)) throw invalid("Invalid image ID");
      return transaction(data => {
        // The caller must authenticate content routes, including historical previews.
        const item = lookup(data.collections.images, id) || lookup(data.imageTombstones, id);
        if (!item) throw error(404, "Avatar workflow image not found");
        return content(item);
      });
    },
    async importLegacy(config) {
      const original = jsonCopy(config);
      if (!object(original)) throw invalid("Expected legacy configuration object");
      const sources = { voices: original.voices ?? [], workflows: original.runningHubWorkflows ?? [] };
      for (const entries of Object.values(sources)) {
        if (!Array.isArray(entries) || entries.some(entry => !object(entry))) throw invalid("Legacy collections must contain record objects");
      }
      return transaction(async data => {
        const result = { imported: { voices: [], workflows: [] }, skipped: { voices: [], workflows: [] } };
        if (!sources.voices.length && !sources.workflows.length) return result;
        const backupDirectory = path.join(root, "private");
        await directory(backupDirectory);
        const backup = path.join(backupDirectory, `legacy-${digest(canonical(original))}.json`);
        if (!await regularFile(backup)) await atomicWrite(backup, JSON.stringify(original));
        for (const [collection, entries] of Object.entries(sources)) {
          for (const entry of entries) {
            const id = validId(entry.id) ? entry.id : `legacy-${collection}-${digest(canonical(entry))}`;
            if (own(data.collections[collection], id) || own(data.versions[collection], id)) {
              result.skipped[collection].push(id);
              continue;
            }
            const fields = merge(undefined, entry);
            if (entry.id !== undefined && entry.id !== id) fields.legacyId = entry.id;
            const saved = envelope(data, collection, id, fields);
            result.imported[collection].push(publicValue(saved, true));
          }
        }
        if (result.imported.voices.length || result.imported.workflows.length) await write(data);
        return result;
      });
    }
  };
}

module.exports = { createAvatarWorkflowStore };

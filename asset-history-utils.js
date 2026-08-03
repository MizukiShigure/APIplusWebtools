(function attachAssetHistoryUtils(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.AssetHistoryUtils = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createAssetHistoryUtils() {
  function text(value) {
    return String(value == null ? "" : value).trim();
  }

  function number(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function normalizeUrl(value) {
    const raw = text(value);
    if (!raw) return "";
    try {
      const parsed = new URL(raw);
      parsed.protocol = parsed.protocol.toLowerCase();
      parsed.hostname = parsed.hostname.toLowerCase();
      return parsed.href;
    } catch (_) {
      return raw;
    }
  }

  function normalizeHash(value) {
    const hash = text(value).toLowerCase();
    return /^[a-f0-9]{64}$/.test(hash) ? hash : "";
  }

  function mediaTypeFrom(file, meta = {}) {
    const explicit = text(meta.type).toLowerCase();
    if (["image", "video", "audio", "other"].includes(explicit)) return explicit;
    const mime = text(meta.mimeType || file?.type).toLowerCase();
    if (mime.startsWith("image/")) return "image";
    if (mime.startsWith("video/")) return "video";
    if (mime.startsWith("audio/")) return "audio";
    return "other";
  }

  function favoriteKey(item) {
    const hash = normalizeHash(item?.contentHash);
    if (hash) return `sha256:${hash}`;
    const url = normalizeUrl(item?.url);
    return url ? `url:${url}` : "";
  }

  function exactFingerprint(item) {
    const hash = normalizeHash(item?.contentHash);
    if (!hash) return "";
    const name = text(item?.originalName ?? item?.name).toLowerCase();
    const size = Math.max(0, Math.round(number(item?.originalSize ?? item?.size)));
    const mime = text(item?.originalType ?? item?.mimeType).toLowerCase();
    const width = Math.max(0, Math.round(number(item?.originalWidth ?? item?.width)));
    const height = Math.max(0, Math.round(number(item?.originalHeight ?? item?.height)));
    const durationMs = Math.max(0, Math.round(number(item?.originalDuration ?? item?.duration) * 1000));
    return JSON.stringify([name, size, mime, width, height, durationMs, hash]);
  }

  function findDuplicate(history, candidate) {
    const items = Array.isArray(history) ? history : [];
    const fingerprint = exactFingerprint(candidate);
    if (fingerprint) {
      const exact = items.find((item) => exactFingerprint(item) === fingerprint);
      return exact || null;
    }
    const url = normalizeUrl(candidate?.url);
    if (!url) return null;
    return items.find((item) => normalizeUrl(item?.url) === url) || null;
  }

  function dedupe(history) {
    const result = [];
    for (const item of Array.isArray(history) ? history : []) {
      if (!findDuplicate(result, item)) result.push(item);
    }
    return result;
  }

  function filterPicker(history, mediaType, favorites, favoritesOnly) {
    const favoriteSet = favorites instanceof Set ? favorites : new Set(favorites || []);
    return (Array.isArray(history) ? history : []).filter((item) => {
      if (mediaType && item?.type !== mediaType) return false;
      return !favoritesOnly || favoriteSet.has(favoriteKey(item));
    });
  }

  async function sha256File(file, cryptoApi = globalThis.crypto) {
    try {
      if (!file || typeof file.arrayBuffer !== "function" || !cryptoApi?.subtle?.digest) return "";
      const bytes = await file.arrayBuffer();
      const digest = await cryptoApi.subtle.digest("SHA-256", bytes);
      return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
    } catch (_) {
      return "";
    }
  }

  function uploadUrl(result) {
    if (typeof result === "string") return result;
    return text(result?.url || result?.data?.url || result?.file_url || result?.fileUrl);
  }

  async function resolveUpload(options = {}) {
    const file = options.file;
    if (!file) throw new Error("file is required");
    if (typeof options.upload !== "function") throw new Error("upload transport is required");

    const identityMeta = options.identityMeta || {};
    const uploadFile = options.uploadFile || file;
    const uploadMeta = options.uploadMeta || identityMeta;
    const contentHash = await sha256File(file, options.cryptoApi);
    const original = {
      originalName: text(file.name),
      originalSize: Math.max(0, Math.round(number(file.size))),
      originalType: text(file.type || identityMeta.mimeType),
      originalWidth: Math.max(0, Math.round(number(identityMeta.width))),
      originalHeight: Math.max(0, Math.round(number(identityMeta.height))),
      originalDuration: Math.max(0, number(identityMeta.duration)),
      contentHash
    };
    const candidate = { ...original, url: "" };
    const duplicate = contentHash ? findDuplicate(options.history, candidate) : null;
    if (duplicate) return { asset: duplicate, reused: true };

    const result = await options.upload(uploadFile);
    const url = uploadUrl(result);
    if (!url) throw new Error("upload response did not include a URL");

    const createId = typeof options.createId === "function"
      ? options.createId
      : () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const now = typeof options.now === "function" ? options.now : Date.now;
    const asset = {
      id: createId(),
      name: text(file.name || uploadFile.name) || "file",
      type: mediaTypeFrom(file, identityMeta),
      url,
      preview: url,
      width: Math.max(0, Math.round(number(uploadMeta.width))),
      height: Math.max(0, Math.round(number(uploadMeta.height))),
      duration: Math.max(0, number(uploadMeta.duration)),
      size: Math.max(0, Math.round(number(uploadFile.size ?? file.size))),
      createdAt: now(),
      ...(options.overrides || {}),
      ...original
    };
    return { asset, reused: false };
  }

  return {
    dedupe,
    exactFingerprint,
    favoriteKey,
    filterPicker,
    findDuplicate,
    normalizeUrl,
    resolveUpload,
    sha256File
  };
});

const assert = require("node:assert/strict");

const {
  dedupe,
  exactFingerprint,
  favoriteKey,
  filterPicker,
  findDuplicate,
  resolveUpload,
  sha256File
} = require("./asset-history-utils.js");

function asset(overrides = {}) {
  return {
    id: "asset-1",
    name: "portrait.png",
    type: "image",
    url: "https://cdn.example/portrait.png",
    width: 1024,
    height: 1536,
    size: 1200,
    originalName: "portrait.png",
    originalSize: 1200,
    originalType: "image/png",
    originalWidth: 1024,
    originalHeight: 1536,
    originalDuration: 0,
    contentHash: "a".repeat(64),
    ...overrides
  };
}

assert.equal(favoriteKey(asset()), `sha256:${"a".repeat(64)}`);
assert.equal(
  favoriteKey(asset({ contentHash: "", url: "  HTTPS://cdn.example/portrait.png  " })),
  "url:https://cdn.example/portrait.png"
);

const first = asset();
const sameContentDifferentUrl = asset({
  id: "asset-2",
  url: "https://cdn.example/copy.png"
});
const differentContent = asset({
  id: "asset-3",
  contentHash: "b".repeat(64)
});

assert.equal(exactFingerprint(first), exactFingerprint(sameContentDifferentUrl));
assert.notEqual(exactFingerprint(first), exactFingerprint(differentContent));
assert.equal(findDuplicate([first], sameContentDifferentUrl), first);
assert.equal(findDuplicate([first], differentContent), null);

const legacy = asset({ contentHash: "", originalName: undefined });
const legacyDifferentUrl = asset({
  id: "asset-legacy-2",
  contentHash: "",
  originalName: undefined,
  url: "https://cdn.example/legacy-copy.png"
});
const legacySameUrl = asset({
  id: "asset-legacy-3",
  contentHash: "",
  originalName: undefined
});
assert.equal(exactFingerprint(legacy), "");
assert.equal(findDuplicate([legacy], legacyDifferentUrl), null);
assert.equal(findDuplicate([legacy], legacySameUrl), legacy);

assert.deepEqual(
  dedupe([first, sameContentDifferentUrl, differentContent, legacySameUrl]).map((item) => item.id),
  ["asset-1", "asset-3"]
);

const imageFavoriteKey = favoriteKey(first);
const video = asset({
  id: "video-1",
  type: "video",
  name: "clip.mp4",
  url: "https://cdn.example/clip.mp4",
  contentHash: "c".repeat(64),
  originalName: "clip.mp4",
  originalType: "video/mp4",
  originalWidth: 1920,
  originalHeight: 1080,
  originalDuration: 4
});
assert.deepEqual(filterPicker([first, video], "image", new Set(), false), [first]);
assert.deepEqual(filterPicker([first, video], "image", new Set([imageFavoriteKey]), true), [first]);
assert.deepEqual(filterPicker([first, video], "video", new Set([imageFavoriteKey]), true), []);

(async () => {
  const bytes = new TextEncoder().encode("same upload bytes");
  const uploadFile = {
    name: "portrait.png",
    size: bytes.byteLength,
    type: "image/png",
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  };
  const hash = await sha256File(uploadFile);
  assert.match(hash, /^[a-f0-9]{64}$/);

  const existing = asset({
    contentHash: hash,
    originalSize: uploadFile.size,
    size: uploadFile.size
  });
  let uploadCalls = 0;
  const reused = await resolveUpload({
    file: uploadFile,
    identityMeta: { type: "image", width: 1024, height: 1536, duration: 0 },
    history: [existing],
    upload: async () => {
      uploadCalls += 1;
      return "https://cdn.example/new.png";
    }
  });
  assert.equal(reused.reused, true);
  assert.equal(reused.asset, existing);
  assert.equal(uploadCalls, 0);

  const freshFile = {
    ...uploadFile,
    name: "fresh.png",
    arrayBuffer: async () => new TextEncoder().encode("fresh bytes").buffer
  };
  const fresh = await resolveUpload({
    file: freshFile,
    identityMeta: { type: "image", width: 800, height: 600, duration: 0 },
    history: [existing],
    upload: async () => {
      uploadCalls += 1;
      return "https://cdn.example/fresh.png";
    },
    createId: () => "asset-fresh",
    now: () => 12345
  });
  assert.equal(fresh.reused, false);
  assert.equal(fresh.asset.id, "asset-fresh");
  assert.equal(fresh.asset.url, "https://cdn.example/fresh.png");
  assert.equal(fresh.asset.originalName, "fresh.png");
  assert.equal(fresh.asset.originalSize, uploadFile.size);
  assert.equal(fresh.asset.originalWidth, 800);
  assert.equal(fresh.asset.originalHeight, 600);
  assert.equal(fresh.asset.createdAt, 12345);
  assert.equal(uploadCalls, 1);

  console.log("asset-history-utils tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

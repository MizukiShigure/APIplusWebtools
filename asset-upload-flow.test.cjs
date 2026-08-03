const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const app = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");

assert.equal((app.match(/\/fileupload/g) || []).length, 1, "only the shared transport may call /fileupload");
assert.match(app, /async function postUploadFile\(file\)[\s\S]*?fetch\(`\$\{apiBase\(\)\}\/fileupload`/);
assert.match(app, /async function uploadLocalFileAsset\(file, options = \{\}\)[\s\S]*?ASSET_HISTORY_UTILS\.resolveUpload/);
assert.match(app, /history:\s*state\.uploadHistory/);
assert.match(app, /upload:\s*postUploadFile/);

[
  "uploadAvatarAssetFiles",
  "uploadViduVoiceFiles",
  "uploadSubjectAssets",
  "uploadMotionAssetFiles",
  "uploadSunoAssetFiles",
  "uploadImageVideoFrameFiles",
  "uploadBatchFiles",
  "uploadReferenceFiles",
  "uploadViduRefFiles",
  "uploadFiles",
  "uploadGeneratedImageBlob",
  "uploadAgentAssetFile"
].forEach((name) => {
  assert.match(
    app,
    new RegExp(`(?:async )?function ${name}\\([^]*?uploadLocalFileAsset\\(`),
    `${name} must use the shared upload adapter`
  );
});

assert.match(
  app,
  /function uploadReferenceFiles\([^]*?const originalMeta = await getFileMeta\(file\)[^]*?identityMeta:\s*originalMeta[^]*?uploadFile,[^]*?uploadMeta:\s*meta/,
  "Seedance compression must fingerprint the original while uploading the prepared file"
);
assert.match(
  app,
  /function uploadAgentAssetFile\([^]*?const originalMeta = await getFileMeta\(file\)[^]*?identityMeta:\s*originalMeta[^]*?uploadFile,[^]*?uploadMeta:\s*meta/,
  "Agent compression must fingerprint the original while uploading the prepared file"
);

console.log("asset upload flow checks passed");

const assert = require("node:assert/strict");
const contracts = require("./model-contracts.js");
const fs = require("node:fs");
const path = require("node:path");

const { KLING_3_OMNI, buildKling3OmniPayload, seedance2QualityOptions, validateKling3OmniRow } = contracts;

function row(overrides = {}) {
  return {
    prompt: "Make @1 lead into @2.",
    version: "kling-3-omni",
    size: "16:9",
    quality: "1080p",
    duration: "5",
    generateAudio: true,
    refs: [],
    ...overrides
  };
}

assert.deepEqual(KLING_3_OMNI, {
  endpoint: "/kling_3_omni_video",
  queryEndpoint: "/kling_3_omni_video_query",
  version: "kling-3-omni",
  sizes: ["16:9", "9:16", "1:1"],
  qualities: ["720p", "1080p", "4k"],
  durations: ["3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"]
});

assert.deepEqual(seedance2QualityOptions("doubao-seedance-2-0-260128"), ["480p", "720p", "1080p", "4k"]);
assert.deepEqual(seedance2QualityOptions("doubao-seedance-2-0-fast-260128"), ["480p", "720p"]);

const image = { type: "image", url: "https://cdn.example/image.png", width: 1200, height: 900, size: 1024 };
const video = { type: "video", url: "https://cdn.example/clip.mov", width: 1280, height: 720, duration: 8, fps: 30, size: 2048 };
assert.equal(validateKling3OmniRow(row({ refs: [image, video] })), "");
assert.deepEqual(buildKling3OmniPayload(row({ refs: [image, video] })), {
  contents: [
    { type: "prompt", text: "Make image_1 lead into video_1." },
    { type: "refer_image", image_url: image.url, id: "image_1" },
    { type: "feature_video", video_url: video.url, id: "video_1" }
  ],
  settings: {
    resolution: "1080p",
    duration: 5,
    audio: "original",
    multi_shot: false,
    aspect_ratio: "16:9"
  },
  options: {}
});

assert.throws(
  () => buildKling3OmniPayload(row({ refs: [video, { ...video, url: "https://cdn.example/second.mp4" }] })),
  /Kling 3 Omni 最多只能添加一个参考视频/
);

assert.equal(buildKling3OmniPayload(row({ refs: [image], generateAudio: false })).settings.audio, "off");
assert.equal(buildKling3OmniPayload(row({ refs: [image] })).settings.audio, "native");
assert.equal(buildKling3OmniPayload(row()).settings.audio, "native");

assert.match(validateKling3OmniRow(row({ prompt: "" })), /Prompt.*不能为空/);
assert.match(validateKling3OmniRow(row({ prompt: "x".repeat(3073) })), /3072/);
assert.match(validateKling3OmniRow(row({ duration: "2" })), /时长/);
assert.match(validateKling3OmniRow(row({ duration: "3.5" })), /时长/);
assert.match(validateKling3OmniRow(row({ refs: [{ type: "audio", url: "https://cdn.example/sound.mp3" }] })), /音频/);
assert.match(validateKling3OmniRow(row({ prompt: "", refs: [{ type: "audio", url: "https://cdn.example/sound.mp3" }] })), /音频/);
assert.match(validateKling3OmniRow(row({ refs: [image, video, { ...video, url: "https://cdn.example/second.mp4" }] })), /最多/);

assert.match(validateKling3OmniRow(row({ refs: [{ ...image, width: 299 }] })), /300/);
assert.match(validateKling3OmniRow(row({ refs: [{ ...image, width: 300, height: 1000 }] })), /比例/);
assert.match(validateKling3OmniRow(row({ refs: [{ ...image, size: 50 * 1024 * 1024 + 1 }] })), /50MB/);

assert.match(validateKling3OmniRow(row({ refs: [{ ...video, url: "https://cdn.example/clip.webm" }] })), /MP4.*MOV/);
assert.match(validateKling3OmniRow(row({ refs: [{ ...video, duration: 2.9 }] })), /3.*15.5/);
assert.match(validateKling3OmniRow(row({ refs: [{ ...video, width: 699 }] })), /700/);
assert.match(validateKling3OmniRow(row({ refs: [{ ...video, width: 4000, height: 3000 }] })), /像素/);
assert.match(validateKling3OmniRow(row({ refs: [{ ...video, width: 700, height: 2000 }] })), /比例/);
assert.match(validateKling3OmniRow(row({ refs: [{ ...video, fps: 23 }] })), /24.*60/);

assert.equal(validateKling3OmniRow(row({ refs: [{ type: "video", url: "https://cdn.example/upload", name: "upload" }] })), "");
assert.equal(validateKling3OmniRow(row({ refs: [{ type: "image", url: "https://cdn.example/upload", name: "upload" }] })), "");

const appSource = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
const pageSource = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
const multiVideoModelsSource = appSource.slice(
  appSource.indexOf("const MULTI_VIDEO_MODELS"),
  appSource.indexOf("const VIDU_REF_VIDEO_MODEL")
);
const seedanceModelSource = multiVideoModelsSource.split("kling3Omni:")[0];
const imageVideoModelsSource = appSource.slice(
  appSource.indexOf("const IMAGE_VIDEO_MODELS"),
  appSource.indexOf("const MULTI_VIDEO_MODELS")
);
assert.match(multiVideoModelsSource, /kling3Omni:\s*\{[\s\S]*?supportsGenerateAudio:\s*true,/);
assert.doesNotMatch(seedanceModelSource, /supportsGenerateAudio\s*:/);
assert.match(appSource, /const \{ KLING_3_OMNI, seedance2QualityOptions \} = MODEL_CONTRACTS;/, "app must consume the Seedance 2 quality contract");
assert.match(imageVideoModelsSource, /seedance:\s*\{[\s\S]*?\{ label: "Seedance 2\.0", value: "doubao-seedance-2-0-260128" \}[\s\S]*?qualitiesFor\(row\)\s*\{\s*return row\.version === "doubao-seedance-2-0-260128" \? seedance2QualityOptions\(row\.version\) : this\.qualities;\s*\}/, "mixed Seedance image-video entry must delegate 2.0 qualities to the contract");
assert.match(imageVideoModelsSource, /seedance2:\s*\{[\s\S]*?versions: \[\{ label: "Seedance 2\.0", value: "doubao-seedance-2-0-260128" \}\][\s\S]*?qualitiesFor\(row\)\s*\{\s*return seedance2QualityOptions\(row\.version\);\s*\}/, "dedicated Seedance 2 image-video entry must delegate qualities to the contract");
assert.match(seedanceModelSource, /qualitiesFor\(row\)\s*\{\s*return seedance2QualityOptions\(row\.version\);\s*\}/, "multimodal Seedance must delegate version qualities to the contract");
assert.doesNotMatch(seedanceModelSource, /qualitiesByVersion\s*:/, "multimodal Seedance must not duplicate version quality rules");
assert.match(imageVideoModelsSource, /seedance:\s*\{[\s\S]*?build\(row\)\s*\{[\s\S]*?resolution: row\.quality \|\| undefined/, "Seedance image-video requests must send the selected resolution");
assert.match(appSource, /function buildSeedance2Payload\(row\)[\s\S]*?resolution: row\.quality \|\| undefined/, "Seedance multimodal requests must send the selected resolution");
assert.match(appSource, /function renderMultiParamsCell\(row, model, disabled\)[\s\S]*?model\.supportsGenerateAudio[\s\S]*?generateAudio/);
assert.match(appSource, /function updateMultiRowField\(row, field, value, redraw = true\)\s*\{\s*if \(field === "generateAudio" && !getMultiModel\(row\)\.supportsGenerateAudio\) return;/);
assert.match(pageSource, /<script src="\.\/model-contracts\.js[^>]*><\/script>\s*<script src="\.\/app\.js/, "model contracts must load before app.js");
assert.match(appSource, /const MODEL_CONTRACTS = globalThis\.ApiBatchModelContracts;/, "app must consume the browser contract module");
assert.match(appSource, /endpoint: KLING_3_OMNI\.endpoint/, "Kling create path must come from the contract");
assert.match(appSource, /queryEndpoint: KLING_3_OMNI\.queryEndpoint/, "Kling query path must come from the contract");
assert.match(appSource, /validate\(row\)\s*\{\s*return MODEL_CONTRACTS\.validateKling3OmniRow\(row\);\s*\}/, "Kling must expose its contract validator");
assert.match(appSource, /const validationError = model\.validate\(row\);/, "queue validation must invoke the current model validator");

console.log("model-contracts checks passed");

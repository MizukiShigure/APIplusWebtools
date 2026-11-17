const assert = require("node:assert/strict");
const contracts = require("./model-contracts.js");
const fs = require("node:fs");
const path = require("node:path");

const {
  KLING_3_OMNI,
  KLING_3_OMNI_EDIT,
  MINIMAX_H3,
  SEEDANCE_2,
  buildKling3OmniPayload,
  buildKling3OmniEditPayload,
  buildMiniMaxH3FirstLastPayload,
  buildMiniMaxH3MultiPayload,
  buildSeedance2FirstLastPayload,
  formatProviderError,
  nearestQualityOption,
  seedance2QualityOptions,
  validateKling3OmniRow,
  validateKling3OmniEditRow,
  validateMiniMaxH3FirstLastRow,
  validateMiniMaxH3MultiRow
} = contracts;

function row(overrides = {}) {
  return {
    prompt: "Make @1 lead into @2.",
    version: "kling-v3-omni",
    size: "16:9",
    quality: "1080p",
    duration: "5",
    generateAudio: true,
    refs: [],
    ...overrides
  };
}

assert.deepEqual(KLING_3_OMNI, {
  endpoint: "/kling_video_omni",
  queryEndpoint: "/kling_video_omni_query",
  version: "kling-v3-omni",
  sizes: ["16:9", "9:16", "1:1"],
  qualities: ["720p", "1080p"],
  durations: ["3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"],
  defaultQuality: "1080p",
  defaultDuration: "10"
});

assert.deepEqual(seedance2QualityOptions("doubao-seedance-2-0-260128"), ["480p", "720p", "1080p", "4k"]);
assert.deepEqual(seedance2QualityOptions("doubao-seedance-2-0-fast-260128"), ["480p", "720p"]);

assert.deepEqual(SEEDANCE_2, {
  endpoint: "/seedance2",
  queryEndpoint: "/seedance2_query",
  version: "doubao-seedance-2-0-260128",
  sizes: ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"],
  qualities: ["480p", "720p", "1080p", "4k"],
  durations: ["4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"],
  defaultQuality: "1080p",
  defaultDuration: "10"
});

const seedance2FirstLastPayload = buildSeedance2FirstLastPayload({
  prompt: "Animate the portrait",
  version: SEEDANCE_2.version,
  size: "9:16",
  quality: "1080p",
  duration: "12",
  generateAudio: true,
  firstFrame: { url: "https://cdn.example/seedance-first.png" },
  lastFrame: { url: "https://cdn.example/seedance-last.png" }
});
assert.deepEqual(seedance2FirstLastPayload, {
  prompt: "Animate the portrait",
  generate_audio: true,
  ratio: "9:16",
  duration: 12,
  resolution: "1080p",
  web_search: false,
  first_frame_image: "https://cdn.example/seedance-first.png",
  last_frame_image: "https://cdn.example/seedance-last.png"
});
assert.equal(Object.hasOwn(seedance2FirstLastPayload, "model_name"), false);
assert.equal(
  buildSeedance2FirstLastPayload({ prompt: "Text only", size: "16:9", quality: "720p", duration: "4", generateAudio: false }).generate_audio,
  false
);
assert.equal(Object.hasOwn(buildSeedance2FirstLastPayload({ prompt: "Text only", size: "16:9", quality: "720p", duration: "4" }), "first_frame_image"), false);
assert.equal(nearestQualityOption("4k", ["480p", "720p"]), "720p");
assert.equal(nearestQualityOption("4k", ["480p", "720p", "1080p"]), "1080p");
assert.equal(nearestQualityOption("1080p", ["480p", "720p"]), "720p");
assert.equal(nearestQualityOption("720p", ["480p", "720p"]), "720p");
assert.equal(nearestQualityOption("", ["480p", "720p"], "720p"), "720p");

const providerError = formatProviderError({
  error: {
    message: "Resource has been exhausted",
    code: 429,
    param: "quality",
    request_id: "req-provider-123"
  }
}, "HTTP 429");
assert.match(providerError, /Resource has been exhausted/);
assert.match(providerError, /429/);
assert.match(providerError, /quality/);
assert.match(providerError, /req-provider-123/);

const image = { type: "image", url: "https://cdn.example/image.png", width: 1200, height: 900, size: 1024 };
const video = { type: "video", url: "https://cdn.example/clip.mov", width: 1280, height: 720, duration: 8, fps: 30, size: 2048 };
assert.equal(validateKling3OmniRow(row({ refs: [image, video] })), "");
assert.deepEqual(buildKling3OmniPayload(row({ refs: [image, video] })), {
  prompt: "Make <<image_1>> lead into <<video_1>>.",
  generate_mode: "multi_reference",
  reference_images: [image.url],
  reference_video: video.url,
  duration: 5,
  keep_video_sound: true,
  mode: "pro",
  aspect_ratio: "16:9",
  model_name: "kling-v3-omni",
  sound: "off"
});

assert.throws(
  () => buildKling3OmniPayload(row({ refs: [video, { ...video, url: "https://cdn.example/second.mp4" }] })),
  /Kling 3 Omni 最多只能添加一个参考视频/
);

assert.equal(
  buildKling3OmniPayload(row({ prompt: "Use @1 then @2.", refs: [video, image] })).prompt,
  "Use <<video_1>> then <<image_1>>."
);
assert.equal(buildKling3OmniPayload(row({ refs: [image], quality: "720p" })).mode, "std");
assert.deepEqual(
  {
    keepVideoSound: buildKling3OmniPayload(row({ refs: [image], generateAudio: false })).keep_video_sound,
    sound: buildKling3OmniPayload(row({ refs: [image], generateAudio: false })).sound
  },
  { keepVideoSound: false, sound: "off" }
);
assert.deepEqual(
  {
    keepVideoSound: buildKling3OmniPayload(row({ refs: [image] })).keep_video_sound,
    sound: buildKling3OmniPayload(row({ refs: [image] })).sound
  },
  { keepVideoSound: false, sound: "on" }
);
assert.deepEqual(
  {
    keepVideoSound: buildKling3OmniPayload(row()).keep_video_sound,
    sound: buildKling3OmniPayload(row()).sound
  },
  { keepVideoSound: false, sound: "on" }
);

assert.match(validateKling3OmniRow(row({ prompt: "" })), /Prompt.*不能为空/);
assert.match(validateKling3OmniRow(row({ prompt: "x".repeat(3073) })), /3072/);
assert.match(validateKling3OmniRow(row({ duration: "2" })), /时长/);
assert.match(validateKling3OmniRow(row({ duration: "3.5" })), /时长/);
assert.match(validateKling3OmniRow(row({ refs: [{ type: "audio", url: "https://cdn.example/sound.mp3" }] })), /音频/);
assert.match(validateKling3OmniRow(row({ prompt: "", refs: [{ type: "audio", url: "https://cdn.example/sound.mp3" }] })), /音频/);
assert.match(validateKling3OmniRow(row({ refs: [image, video, { ...video, url: "https://cdn.example/second.mp4" }] })), /最多/);
assert.equal(validateKling3OmniRow(row({ refs: Array.from({ length: 7 }, (_, index) => ({ ...image, url: `${image.url}?i=${index}` })) })), "");
assert.match(validateKling3OmniRow(row({ refs: Array.from({ length: 8 }, (_, index) => ({ ...image, url: `${image.url}?i=${index}` })) })), /7/);
assert.equal(validateKling3OmniRow(row({ refs: [video, ...Array.from({ length: 4 }, (_, index) => ({ ...image, url: `${image.url}?i=${index}` }))] })), "");
assert.match(validateKling3OmniRow(row({ refs: [video, ...Array.from({ length: 5 }, (_, index) => ({ ...image, url: `${image.url}?i=${index}` }))] })), /4/);

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

// The company gateway's edit branch uses source-following sentinels and does
// not serialize the multi-reference model, aspect or sound-generation fields.
assert.equal(typeof validateKling3OmniEditRow, "function", "Kling video editing needs a separate validator");
assert.equal(typeof buildKling3OmniEditPayload, "function");
assert.deepEqual(KLING_3_OMNI_EDIT, {
  endpoint: "/kling_video_omni",
  queryEndpoint: "/kling_video_omni_query",
  generateMode: "video_edit",
  qualities: ["720p", "1080p"],
  defaultQuality: "1080p",
  maxImages: 4,
  minVideoDuration: 3,
  maxVideoDuration: 10,
  minVideoEdge: 720,
  maxVideoEdge: 2160,
  maxVideoBytes: 200 * 1024 * 1024,
  maxImageBytes: 10 * 1024 * 1024
});
const editRow = (overrides = {}) => row({
  klingMode: "video_edit",
  prompt: "Edit @1 using @2.",
  refs: [video, image],
  klingKeepVideoSound: true,
  ...overrides
});
assert.equal(validateKling3OmniEditRow(editRow()), "");
assert.equal(validateKling3OmniRow(editRow({ size: "4:3", duration: "8.375" })), "");
assert.deepEqual(buildKling3OmniEditPayload(editRow({ size: "4:3", duration: "8.375" })), {
  prompt: "Edit <<video_1>> using <<image_1>>.",
  generate_mode: "video_edit",
  reference_images: [image.url],
  reference_video: video.url,
  duration: 0,
  keep_video_sound: true,
  mode: "pro",
  aspect_ratio: ""
});
assert.deepEqual(buildKling3OmniPayload(editRow()), buildKling3OmniEditPayload(editRow()));
assert.equal(buildKling3OmniEditPayload(editRow({ generateAudio: false })).keep_video_sound, true);
assert.equal(buildKling3OmniEditPayload(editRow({ klingKeepVideoSound: false })).keep_video_sound, false);
assert.equal(buildKling3OmniEditPayload(editRow({ klingKeepVideoSound: undefined })).keep_video_sound, true);
assert.equal(buildKling3OmniEditPayload(editRow({ quality: "720p" })).mode, "std");
assert.equal(buildKling3OmniEditPayload(editRow({ quality: "std" })).mode, "std");
assert.equal(buildKling3OmniEditPayload(editRow({ quality: "pro" })).mode, "pro");
assert.match(validateKling3OmniEditRow(editRow({ quality: "4k" })), /清晰度/);
assert.equal(buildKling3OmniEditPayload(editRow({ prompt: "  Edit @2 using @1.  ", refs: [image, video] })).prompt,
  "Edit <<video_1>> using <<image_1>>.");
assert.equal(buildKling3OmniEditPayload(editRow({ prompt: "Edit <<video_1>> using <<image_1>>." })).prompt,
  "Edit <<video_1>> using <<image_1>>.");
assert.match(validateKling3OmniEditRow(editRow({ prompt: "Edit @3" })), /@3.*素材/);
assert.match(validateKling3OmniEditRow(editRow({ prompt: "Edit <<video_2>>" })), /video_2.*素材/);
assert.match(validateKling3OmniEditRow(editRow({ prompt: "" })), /Prompt.*不能为空/);
assert.match(validateKling3OmniEditRow(editRow({ prompt: "x".repeat(3073) })), /3072/);
assert.match(validateKling3OmniEditRow(editRow({ refs: [] })), /必须.*一个.*视频/);
assert.match(validateKling3OmniEditRow(editRow({ refs: [image] })), /必须.*一个.*视频/);
assert.match(validateKling3OmniEditRow(editRow({ refs: [video, video] })), /只能.*一个.*视频/);
assert.match(validateKling3OmniEditRow(editRow({ refs: [video, { type: "audio", url: "https://cdn.example/a.mp3" }] })), /音频/);
assert.match(validateKling3OmniEditRow(editRow({ refs: [video, { type: "other", url: "https://cdn.example/a.dat" }] })), /素材类型/);
assert.equal(validateKling3OmniEditRow(editRow({ refs: [video, ...Array(4).fill(image)] })), "");
assert.match(validateKling3OmniEditRow(editRow({ refs: [video, ...Array(5).fill(image)] })), /4.*图片/);
assert.match(validateKling3OmniEditRow(editRow({ refs: [{ ...video, url: "" }, image] })), /URL/);
assert.match(validateKling3OmniEditRow(editRow({ refs: [{ ...video, url: "file:///source.mp4" }, image] })), /HTTP/);
assert.match(validateKling3OmniEditRow(editRow({ refs: [{ ...video, url: "https://cdn.example/a.webm" }, image] })), /MP4.*MOV/);
for (const metadata of [
  { duration: 2.999 }, { duration: 10.001 },
  { width: 719 }, { height: 719 }, { width: 2161 }, { height: 2161 },
  { size: 200 * 1024 * 1024 + 1 }
]) assert.notEqual(validateKling3OmniEditRow(editRow({ refs: [{ ...video, ...metadata }, image] })), "");
for (const metadata of [
  { duration: 3, width: 720, height: 2160 },
  { duration: 10, width: 2160, height: 720, size: 200 * 1024 * 1024 },
  { width: 1440, height: 1080 }, { width: 1080, height: 1440 }
]) assert.equal(validateKling3OmniEditRow(editRow({ refs: [{ ...video, ...metadata }, image] })), "");
for (const field of ["duration", "width", "height"]) {
  assert.match(validateKling3OmniEditRow(editRow({ refs: [{ ...video, [field]: undefined }, image] })), /元数据/);
}
assert.match(validateKling3OmniEditRow(editRow({ refs: [video, { ...image, url: "https://cdn.example/a.webp" }] })), /JPG.*PNG/);
assert.match(validateKling3OmniEditRow(editRow({ refs: [video, { ...image, width: 299 }] })), /300/);
assert.match(validateKling3OmniEditRow(editRow({ refs: [video, { ...image, width: 300, height: 751 }] })), /比例/);
assert.match(validateKling3OmniEditRow(editRow({ refs: [video, { ...image, size: 10 * 1024 * 1024 + 1 }] })), /10MB/);
assert.equal(validateKling3OmniEditRow(editRow({ refs: [video, { ...image, width: 300, height: 750, size: 10 * 1024 * 1024 }] })), "");
assert.throws(() => buildKling3OmniEditPayload(editRow({ refs: [] })), /必须.*一个.*视频/);
assert.throws(() => buildKling3OmniPayload(editRow({ refs: [] })), /必须.*一个.*视频/);
assert.deepEqual(buildKling3OmniEditPayload(editRow({ prompt: "Edit @1", refs: [video] })).reference_images, []);

assert.deepEqual(MINIMAX_H3, {
  endpoint: "/minimax_h3",
  queryEndpoint: "/minimax_h3_query",
  version: "MiniMax-H3",
  sizes: ["adaptive", "21:9", "16:9", "4:3", "1:1", "3:4", "9:16"],
  qualities: ["768P", "2K"],
  durations: ["5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"],
  defaultSize: "9:16",
  defaultQuality: "2K",
  defaultDuration: "10",
  maxRefs: 12,
  maxReferenceVideoDuration: 15
});

const h3FirstFrame = { type: "image", url: "https://cdn.example/h3-first.png" };
const h3LastFrame = { type: "image", url: "https://cdn.example/h3-last.png" };
const h3FirstLastRow = {
  prompt: "  Camera moves closer.  ",
  version: "MiniMax-H3",
  size: "9:16",
  quality: "768P",
  duration: "5",
  generateAudio: true,
  firstFrame: h3FirstFrame,
  lastFrame: h3LastFrame
};

assert.equal(validateMiniMaxH3FirstLastRow(h3FirstLastRow), "");
assert.deepEqual(buildMiniMaxH3FirstLastPayload(h3FirstLastRow), {
  prompt: "Camera moves closer.",
  model_name: "MiniMax-H3",
  generate_audio: true,
  ratio: "9:16",
  duration: 5,
  resolution: "768P",
  first_frame_image: h3FirstFrame.url,
  last_frame_image: h3LastFrame.url
});

const h3MinimalFirstLastPayload = buildMiniMaxH3FirstLastPayload({
  ...h3FirstLastRow,
  prompt: "",
  generateAudio: false,
  lastFrame: null
});
assert.equal(h3MinimalFirstLastPayload.generate_audio, false);
assert.equal("prompt" in h3MinimalFirstLastPayload, false);
assert.equal("last_frame_image" in h3MinimalFirstLastPayload, false);
assert.match(validateMiniMaxH3FirstLastRow({ ...h3FirstLastRow, firstFrame: null }), /首帧/);
assert.match(validateMiniMaxH3FirstLastRow({ ...h3FirstLastRow, version: "MiniMax-Hailuo-02" }), /版本/);
assert.match(validateMiniMaxH3FirstLastRow({ ...h3FirstLastRow, size: "2:1" }), /尺寸/);
assert.match(validateMiniMaxH3FirstLastRow({ ...h3FirstLastRow, quality: "1080P" }), /清晰度/);
assert.match(validateMiniMaxH3FirstLastRow({ ...h3FirstLastRow, duration: "4" }), /时长/);
assert.match(validateMiniMaxH3FirstLastRow({ ...h3FirstLastRow, duration: "5.5" }), /时长/);

const h3MultiImage1 = { type: "image", url: "https://cdn.example/h3-image-1.png" };
const h3MultiAudio1 = { type: "audio", url: "https://cdn.example/h3-audio-1.mp3", duration: 6 };
const h3MultiVideo1 = { type: "video", url: "https://cdn.example/h3-video-1.mp4", duration: 8 };
const h3MultiImage2 = { type: "image", url: "https://cdn.example/h3-image-2.png" };
const h3MultiRow = {
  prompt: "让@1看向@3，使用@2的声音，随后<<image_2>>挥手，保留@9。",
  version: "MiniMax-H3",
  size: "16:9",
  quality: "2K",
  duration: "15",
  generateAudio: false,
  refs: [h3MultiImage1, h3MultiAudio1, h3MultiVideo1, h3MultiImage2]
};

assert.equal(validateMiniMaxH3MultiRow(h3MultiRow), "");
assert.deepEqual(buildMiniMaxH3MultiPayload(h3MultiRow), {
  prompt: "让图片1看向视频1，使用音频1的声音，随后图片2挥手，保留@9。",
  model_name: "MiniMax-H3",
  generate_audio: false,
  ratio: "16:9",
  duration: 15,
  resolution: "2K",
  reference_images: [h3MultiImage1.url, h3MultiImage2.url],
  reference_videos: [h3MultiVideo1.url],
  reference_audios: [h3MultiAudio1.url]
});

assert.equal(validateMiniMaxH3MultiRow({ ...h3MultiRow, refs: [], prompt: "Prompt only." }), "");
assert.equal(validateMiniMaxH3MultiRow({ ...h3MultiRow, refs: [h3MultiImage1], prompt: "" }), "");
assert.equal(validateMiniMaxH3MultiRow({ ...h3MultiRow, refs: [h3MultiVideo1], prompt: "" }), "");
assert.match(validateMiniMaxH3MultiRow({ ...h3MultiRow, refs: [], prompt: "" }), /Prompt.*图片.*视频/);
assert.match(validateMiniMaxH3MultiRow({ ...h3MultiRow, refs: [h3MultiAudio1], prompt: "Use this audio." }), /音频.*图片.*视频/);

const h3TwelveImages = Array.from({ length: 12 }, (_, index) => ({
  type: "image",
  url: `https://cdn.example/h3-${index + 1}.png`
}));
assert.equal(validateMiniMaxH3MultiRow({ ...h3MultiRow, refs: h3TwelveImages }), "");
assert.match(
  validateMiniMaxH3MultiRow({
    ...h3MultiRow,
    refs: [...h3TwelveImages, { type: "image", url: "https://cdn.example/h3-13.png" }]
  }),
  /最多.*12/
);
assert.equal(validateMiniMaxH3MultiRow({
  ...h3MultiRow,
  refs: [
    { type: "video", url: "https://cdn.example/h3-a.mp4", duration: 8 },
    { type: "video", url: "https://cdn.example/h3-b.mp4", duration: 7 }
  ]
}), "");
assert.equal(validateMiniMaxH3MultiRow({
  ...h3MultiRow,
  refs: [
    { type: "video", url: "https://cdn.example/h3-a.mp4", duration: 8 },
    { type: "video", url: "https://cdn.example/h3-b.mp4", duration: 7.49 },
    { type: "audio", url: "https://cdn.example/h3-audio.mp3", duration: 14.9 }
  ]
}), "");
assert.match(validateMiniMaxH3MultiRow({
  ...h3MultiRow,
  refs: [
    { type: "video", url: "https://cdn.example/h3-a.mp4", duration: 8 },
    { type: "video", url: "https://cdn.example/h3-b.mp4", duration: 7.51 }
  ]
}), /15/);
assert.equal(validateMiniMaxH3MultiRow({
  ...h3MultiRow,
  refs: [{ type: "video", url: "https://cdn.example/h3-unknown.mp4" }]
}), "");
assert.match(validateMiniMaxH3MultiRow({ ...h3MultiRow, size: "2:1" }), /尺寸/);
assert.match(validateMiniMaxH3MultiRow({ ...h3MultiRow, quality: "1080P" }), /清晰度/);
assert.match(validateMiniMaxH3MultiRow({ ...h3MultiRow, duration: "16" }), /时长/);

const appSource = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
const pageSource = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
const multiVideoModelsSource = appSource.slice(
  appSource.indexOf("const MULTI_VIDEO_MODELS"),
  appSource.indexOf("const VIDU_REF_VIDEO_MODEL")
);
const seedanceModelSource = multiVideoModelsSource.slice(multiVideoModelsSource.indexOf("  seedance: {")).split("minimaxH3:")[0];
const imageVideoModelsSource = appSource.slice(
  appSource.indexOf("const IMAGE_VIDEO_MODELS"),
  appSource.indexOf("const MULTI_VIDEO_MODELS")
);
const legacySeedanceImageVideoSource = imageVideoModelsSource.slice(
  imageVideoModelsSource.indexOf("seedance:"),
  imageVideoModelsSource.indexOf("seedance2:")
);
assert.match(multiVideoModelsSource, /kling3Omni:\s*\{[\s\S]*?supportsGenerateAudio:\s*true,/);
assert.doesNotMatch(seedanceModelSource, /supportsGenerateAudio\s*:/);
assert.match(appSource, /const \{[^}]*KLING_3_OMNI[^}]*SEEDANCE_2[^}]*seedance2QualityOptions[^}]*\} = MODEL_CONTRACTS;/, "app must consume the Seedance 2 gateway contract");
assert.doesNotMatch(legacySeedanceImageVideoSource, /doubao-seedance-2-0-260128/, "legacy /seedance route must not offer Seedance 2.0");
assert.match(imageVideoModelsSource, /seedance2:\s*\{[\s\S]*?endpoint:\s*SEEDANCE_2\.endpoint[\s\S]*?queryEndpoint:\s*SEEDANCE_2\.queryEndpoint[\s\S]*?buildSeedance2FirstLastPayload/, "dedicated Seedance 2 image-video entry must use the /seedance2 gateway contract");
assert.match(appSource, /item\?\.model === "seedance" && item\?\.version === SEEDANCE_2\.version\s*\?\s*"seedance2"/, "saved Seedance 2.0 rows must migrate away from the legacy /seedance route");
assert.match(imageVideoModelsSource, /seedance2:\s*\{[\s\S]*?qualitiesFor\(row\)\s*\{\s*return seedance2QualityOptions\(row\.version\);\s*\}/, "dedicated Seedance 2 image-video entry must delegate qualities to the contract");
assert.match(seedanceModelSource, /qualitiesFor\(row\)\s*\{\s*return seedance2QualityOptions\(row\.version\);\s*\}/, "multimodal Seedance must delegate version qualities to the contract");
assert.doesNotMatch(seedanceModelSource, /qualitiesByVersion\s*:/, "multimodal Seedance must not duplicate version quality rules");
assert.match(imageVideoModelsSource, /seedance:\s*\{[\s\S]*?build\(row\)\s*\{[\s\S]*?resolution: row\.quality \|\| undefined/, "Seedance image-video requests must send the selected resolution");
assert.match(appSource, /function buildSeedance2Payload\(row\)[\s\S]*?resolution: row\.quality \|\| undefined/, "Seedance multimodal requests must send the selected resolution");
assert.match(appSource, /function renderMultiParamsCell\(row, model, disabled\)[\s\S]*?model\.supportsGenerateAudio[\s\S]*?generateAudio/);
assert.match(appSource, /function updateMultiRowField\(row, field, value, redraw = true\)\s*\{\s*if \(field === "generateAudio" && !getMultiModel\(row\)\.supportsGenerateAudio\) return;/);
const scripts = [...pageSource.matchAll(/<script src="\.\/([^"?]+)[^"]*"/g)].map(match => match[1]);
for (const dependency of ["model-contracts.js", "prompt-detail-utils.js", "history-origin-utils.js", "asset-history-utils.js", "agent-task-adapter.js", "agent-runtime.js", "runninghub-shared.js", "avatar-workflow-ui.js"]) {
  assert.ok(scripts.includes(dependency) && scripts.indexOf(dependency) < scripts.indexOf("app.js"), `${dependency} must load before app.js`);
}
assert.match(pageSource, /model-contracts\.js\?v=update-20261115-image-models/, "Current models must bypass cached model metadata");
assert.match(pageSource, /app\.js\?v=update-20261118-local-gateway/, "Current application fixes must bypass cached application code");
assert.match(appSource, /const MODEL_CONTRACTS = globalThis\.ApiBatchModelContracts;/, "app must consume the browser contract module");
assert.match(appSource, /endpoint: KLING_3_OMNI\.endpoint/, "Kling create path must come from the contract");
assert.match(appSource, /queryEndpoint: KLING_3_OMNI\.queryEndpoint/, "Kling query path must come from the contract");
assert.match(appSource, /validate\(row\)\s*\{\s*return MODEL_CONTRACTS\.validateKling3OmniRow\(row\);\s*\}/, "Kling must expose its contract validator");
assert.match(appSource, /const validationError = model\.validate\(row\);/, "queue validation must invoke the current model validator");
assert.match(appSource, /const \{[^}]*MINIMAX_H3[^}]*\} = MODEL_CONTRACTS;/, "app must consume the MiniMax H3 contract");
assert.match(
  imageVideoModelsSource,
  /minimaxH3:\s*\{[\s\S]*?label:\s*"海螺 H3"[\s\S]*?endpoint:\s*MINIMAX_H3\.endpoint[\s\S]*?queryEndpoint:\s*MINIMAX_H3\.queryEndpoint[\s\S]*?buildMiniMaxH3FirstLastPayload/,
  "image-to-video H3 must use the shared first/last-frame contract"
);
assert.match(
  multiVideoModelsSource,
  /minimaxH3:\s*\{[\s\S]*?label:\s*"海螺 H3"[\s\S]*?endpoint:\s*MINIMAX_H3\.endpoint[\s\S]*?queryEndpoint:\s*MINIMAX_H3\.queryEndpoint[\s\S]*?buildMiniMaxH3MultiPayload/,
  "multimodal H3 must use the shared omnireference contract"
);
assert.match(appSource, /function renderImageVideoParamsCell\(row, disabled\)[\s\S]*?model\.supportsGenerateAudio[\s\S]*?data-image-video-field="generateAudio"/);
assert.match(appSource, /function updateImageVideoRowField\(row, field, value, redraw = true\)\s*\{\s*if \(field === "generateAudio" && !getImageVideoModel\(row\)\.supportsGenerateAudio\) return;/);
assert.match(appSource, /function validateImageVideoRowBeforeQueue\(row\)[\s\S]*?model\.requiresPrompt !== false/);
assert.match(appSource, /function validateMultiRowBeforeQueue\(row\)[\s\S]*?model\.requiresPrompt !== false/);
assert.match(appSource, /size:\s*seed\.size \?\? \(config\.defaultSize \|\| config\.sizes\[0\] \|\| ""\)/);
assert.match(appSource, /quality:\s*seed\.quality \?\? \(config\.defaultQuality \|\| config\.qualities\[0\] \|\| ""\)/);
assert.match(appSource, /duration:\s*String\(seed\.duration \|\| config\.defaultDuration \|\| config\.durations\[0\] \|\| "5"\)/);
assert.match(appSource, /function appendImageVideoRowResult[\s\S]*?generateAudio:\s*row\.generateAudio !== false/);
assert.match(appSource, /function appendMultiRowResult[\s\S]*?generateAudio:\s*row\.generateAudio !== false/);
assert.match(appSource, /page === "imageVideo"[\s\S]*?generateAudio:\s*record\.generateAudio !== false/);
assert.match(appSource, /function renderOptionLabel\(value\)[\s\S]*?value === "adaptive" \? "自动" : value/);

console.log("model-contracts checks passed");

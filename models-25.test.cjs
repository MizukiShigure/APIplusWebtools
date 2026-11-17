const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const contracts = require("./model-contracts.js");

test("GPT26 and H3 Image publish distinct current gateway contracts", () => {
  assert.ok(contracts.GPT_IMAGE_26, "GPT Image 2.6 contract must exist");
  assert.ok(contracts.MINIMAX_H3_IMAGE, "MiniMax H3 Image contract must exist");
  assert.deepEqual(contracts.GPT_IMAGE_26.versions.map(v => v.value), ["gpt-image-2.6-flare", "gpt-image-2.6-sunburst"]);
  assert.deepEqual(contracts.GPT_IMAGE_26.outputFormats, ["png", "svg", "gif"]);
  assert.equal(contracts.MINIMAX_H3_IMAGE.endpoint, "/minimax_image");
  assert.equal(contracts.MINIMAX_H3_IMAGE.queryEndpoint, "/minimax_image_query");
});

test("GPT26 PNG retains explicit dimensions, render quality, transparency and references", () => {
  assert.equal(typeof contracts.buildGptImage26Payload, "function");
  const payload = contracts.buildGptImage26Payload({ prompt: "  A logo  ", version: "gpt-image-2.6-sunburst",
    size: "16:9", quality: "4K", renderQuality: "max", background: "transparent",
    outputFormat: "png", images: [{ type: "image", url: "https://example.com/ref.png" }] });
  assert.deepEqual(payload, { prompt: "A logo", model_name: "gpt-image-2.6-sunburst", refer_imgs: ["https://example.com/ref.png"],
    image_size: "3840x2160", image_quality: "max", image_background: "transparent", output_format: "png" });
  assert.equal(contracts.buildGptImage26Payload({prompt:"Logo"}).image_size, "2048x2048");
  assert.equal(contracts.buildGptImage26Payload({prompt:"Logo"}).image_quality, "high");
});

test("GPT26 SVG omits raster/GIF fields and refuses references without silently discarding them", () => {
  assert.equal(typeof contracts.buildGptImage26Payload, "function");
  const payload = contracts.buildGptImage26Payload({prompt:"Vector logo", outputFormat:"svg", frameCount:16});
  assert.equal(payload.output_format, "svg");
  assert.equal(Object.hasOwn(payload,"image_size"), false);
  assert.equal(Object.hasOwn(payload,"frame_count"), false);
  assert.throws(() => contracts.buildGptImage26Payload({prompt:"Logo",outputFormat:"svg",images:[{url:"https://example.com/ref.png"}]}), /SVG/);
});

test("GPT26 GIF uses numeric frame controls and enforces exact provider boundaries", () => {
  assert.equal(typeof contracts.buildGptImage26Payload, "function");
  const build=contracts.buildGptImage26Payload;
  const row={prompt:"A bouncing ball", outputFormat:"gif",frameSize:"512x288",frameCount:"16",frameDurationMs:"20"};
  const payload=build(row);
  assert.equal(payload.frame_size,"512x288"); assert.equal(payload.frame_count,16); assert.equal(payload.frame_duration_ms,20);
  assert.equal(Object.hasOwn(payload,"image_size"),false);
  for(const extra of [{frameCount:1},{frameCount:17},{frameCount:2.5},{frameDurationMs:10},{frameDurationMs:2001},{frameDurationMs:25},{frameSize:"2048x2048"},{outputFormat:"webp"},{version:"gpt-image-2.5-flare"}]) {
    assert.throws(()=>build({...row,...extra}), undefined, JSON.stringify(extra));
  }
  assert.equal(build({...row,frameCount:2,frameDurationMs:2000}).frame_duration_ms,2000);
});

test("H3 Image sends its own fields and supports eight images without H3 video parameters", () => {
  assert.equal(typeof contracts.buildMiniMaxH3ImagePayload, "function");
  const images=Array.from({length:8},(_,i)=>({type:"image",url:`https://example.com/${i}.png`}));
  const row={prompt:"  Scene  ",images,size:"21:9",quality:"4K"};
  assert.deepEqual(contracts.buildMiniMaxH3ImagePayload(row),{prompt:"Scene",refer_imgs:images.map(x=>x.url),model_name:"MiniMax-H3-Image",resolution:"4K",aspect_ratio:"21:9"});
  for(const extra of [{images:[...images,images[0]]},{quality:"2Kx"},{size:"adaptive"},{version:"MiniMax-H3"},{prompt:" "},{images:[{type:"video",url:"https://example.com/a.mp4"}]}]) {
    assert.throws(()=>contracts.buildMiniMaxH3ImagePayload({...row,...extra}));
  }
});
const {
  GPT_IMAGE_25, SEEDANCE_25, normalizeGptImage25Size,
  validateGptImage25Row, buildGptImage25Payload,
  validateSeedance25FirstLastRow, buildSeedance25FirstLastPayload,
  validateSeedance25MultiRow, buildSeedance25MultiPayload,
  buildSeedance25ReferenceLabels, normalizeSeedance25Prompt
} = contracts;

const ratios = ["1:1", "16:9", "9:16", "3:4", "4:3", "3:2", "2:3", "5:4", "4:5", "21:9", "2:1", "1:2", "3:1", "1:3"];
// Exact qE tables from the downloaded company ys-api-index-Bxuch17u.js.
const dimensions = {
  "1K": ["1024x1024", "1280x720", "720x1280", "864x1152", "1152x864", "1248x832", "832x1248", "1120x896", "896x1120", "1344x576", "1440x720", "720x1440", "1728x576", "576x1728"],
  "2K": ["2048x2048", "2560x1440", "1440x2560", "1728x2304", "2304x1728", "2496x1664", "1664x2496", "2240x1792", "1792x2240", "3024x1296", "2880x1440", "1440x2880", "3552x1184", "1184x3552"],
  "4K": ["2880x2880", "3840x2160", "2160x3840", "2448x3264", "3264x2448", "3504x2336", "2336x3504", "3200x2560", "2560x3200", "3696x1584", "3840x1920", "1920x3840", "3840x1280", "1280x3840"]
};
const asset = (type, index = 1, extra = {}) => ({ type, url: `https://cdn.example/${type}-${index}`, ...extra });
const assets = (type, length, extra = {}) => Array.from({ length }, (_, index) => asset(type, index + 1, extra));
const gptRow = (extra = {}) => ({ prompt: "  Studio photograph.  ", version: "gpt-image-2.5-flare", size: "16:9", quality: "2K", renderQuality: "xhigh", background: "transparent", images: [], ...extra });
const sdRow = (extra = {}) => ({ prompt: "  Camera moves closer.  ", version: "seedance2.5", size: "16:9", quality: "1080p", duration: "10", outputFormat: "mp4", generateAudio: true, refs: [], ...extra });

test("new contracts export exact routes, versions, options and local defaults", () => {
  assert.ok(GPT_IMAGE_25, "GPT_IMAGE_25 is exported");
  assert.ok(SEEDANCE_25, "SEEDANCE_25 is exported");
  assert.equal(GPT_IMAGE_25.endpoint, "/gen_img_4o");
  assert.equal(GPT_IMAGE_25.queryEndpoint, "/gen_img_4o_query");
  assert.deepEqual(GPT_IMAGE_25.versions.map(item => item.value), ["gpt-image-2.5-flare", "gpt-image-2.5-sunburst"]);
  assert.equal(GPT_IMAGE_25.version, "gpt-image-2.5-flare");
  assert.deepEqual(GPT_IMAGE_25.sizes, ratios);
  assert.deepEqual(GPT_IMAGE_25.qualities, ["1K", "2K", "4K"]);
  assert.deepEqual(GPT_IMAGE_25.renderQualities, ["low", "medium", "high", "xhigh", "max"]);
  assert.deepEqual(GPT_IMAGE_25.backgrounds, ["auto", "transparent", "opaque"]);
  assert.equal(GPT_IMAGE_25.maxImages, 4);
  assert.equal(GPT_IMAGE_25.defaultSize, "1:1");
  assert.equal(GPT_IMAGE_25.defaultQuality, "1K");
  assert.equal(GPT_IMAGE_25.defaultRenderQuality, "medium");
  assert.equal(GPT_IMAGE_25.defaultBackground, "auto");
  assert.equal(SEEDANCE_25.endpoint, "/seedance2");
  assert.equal(SEEDANCE_25.queryEndpoint, "/seedance2_query");
  assert.equal(SEEDANCE_25.version, "seedance2.5");
  assert.deepEqual(SEEDANCE_25.sizes, ["adaptive", "16:9", "4:3", "1:1", "3:4", "9:16", "21:9"]);
  assert.deepEqual(SEEDANCE_25.qualities, ["480p", "720p", "1080p"]);
  assert.deepEqual(SEEDANCE_25.durations, ["-1", ...Array.from({ length: 27 }, (_, index) => String(index + 4))]);
  assert.deepEqual(SEEDANCE_25.outputFormats, ["mp4", "mov"]);
  assert.equal(SEEDANCE_25.defaultSize, "adaptive");
  assert.equal(SEEDANCE_25.defaultQuality, "1080p");
  assert.equal(SEEDANCE_25.defaultDuration, "10");
  assert.equal(SEEDANCE_25.defaultOutputFormat, "mp4");
  assert.equal(SEEDANCE_25.maxRefs, 30);
  assert.equal(SEEDANCE_25.maxVideos, 10);
  assert.equal(SEEDANCE_25.maxAudios, 10);
  assert.equal(SEEDANCE_25.minReferenceDuration, 2);
  assert.equal(SEEDANCE_25.maxReferenceDuration, 30);
  assert.equal(SEEDANCE_25.maxReferenceVideoDuration, 30);
  assert.equal(SEEDANCE_25.maxReferenceAudioDuration, 30);
});

test("GPT maps all 14 ratios at all three resolution tiers exactly", () => {
  for (const [quality, sizes] of Object.entries(dimensions)) {
    ratios.forEach((size, index) => {
      assert.equal(normalizeGptImage25Size(size, quality), sizes[index]);
      assert.equal(buildGptImage25Payload(gptRow({ size, quality })).image_size, sizes[index]);
    });
  }
  assert.equal(normalizeGptImage25Size(), "1024x1024");
  assert.throws(() => normalizeGptImage25Size("auto", "1K"));
  assert.throws(() => normalizeGptImage25Size("1:1", "auto"));
  assert.throws(() => normalizeGptImage25Size("toString", "1K"));
  assert.throws(() => normalizeGptImage25Size("1:1", "constructor"));
});

test("GPT builds only company fields and keeps render quality independent of resolution", () => {
  assert.deepEqual(buildGptImage25Payload(gptRow({ images: [{ url: " https://cdn.example/first.png " }, asset("image", 2)] })), {
    prompt: "Studio photograph.", refer_imgs: ["https://cdn.example/first.png", "https://cdn.example/image-2"],
    model_name: "gpt-image-2.5-flare", image_size: "2560x1440", image_quality: "xhigh", image_background: "transparent"
  });
  for (const version of ["gpt-image-2.5-flare", "gpt-image-2.5-sunburst"]) {
    for (const quality of ["1K", "2K", "4K"]) {
      for (const renderQuality of ["low", "medium", "high", "xhigh", "max"]) {
        for (const background of ["auto", "transparent", "opaque"]) {
          const row = gptRow({ version, quality, renderQuality, background });
          assert.equal(validateGptImage25Row(row), "");
          const payload = buildGptImage25Payload(row);
          assert.equal(payload.model_name, version);
          assert.equal(payload.image_quality, renderQuality);
          assert.equal(payload.image_background, background);
        }
      }
    }
  }
  assert.deepEqual(buildGptImage25Payload({ prompt: "Photo." }), {
    prompt: "Photo.", refer_imgs: [], model_name: "gpt-image-2.5-flare", image_size: "1024x1024", image_quality: "medium", image_background: "auto"
  });
});

test("GPT rejects unsupported selections and malformed refs without silently truncating", () => {
  for (const extra of [
    { prompt: " " }, { version: "gpt-image-2" }, { size: "auto" }, { size: "9:21" },
    { quality: "auto" }, { quality: "low" }, { renderQuality: "4K" }, { renderQuality: "auto" },
    { background: "solid" }, { images: assets("image", 5) }, { images: [null] },
    { images: [asset("video")] }, { images: [{ url: " " }] }, { images: [{ url: {} }] }, { images: {} }
  ]) {
    const row = gptRow(extra);
    assert.notEqual(validateGptImage25Row(row), "", JSON.stringify(extra));
    assert.throws(() => buildGptImage25Payload(row), undefined, JSON.stringify(extra));
  }
  assert.equal(validateGptImage25Row(gptRow({ images: assets("image", 4) })), "");
  assert.equal(validateGptImage25Row(gptRow({ prompt: "", images: [asset("image")] })), "", "company UI permits an image-only input");
});

test("Seedance defaults apply in both modes without leaking legacy or other-mode fields", () => {
  const expected = { prompt: "Move.", model_name: "seedance2.5", ratio: "adaptive", resolution: "1080p", duration: 10, output_format: "mp4", generate_audio: true };
  assert.deepEqual(buildSeedance25FirstLastPayload({ prompt: "Move.", refs: [asset("video")], webSearch: true }), expected);
  assert.deepEqual(buildSeedance25MultiPayload({ prompt: "Move.", firstFrame: asset("image"), lastFrame: asset("image", 2), webSearch: true }), expected);
  assert.equal(validateSeedance25FirstLastRow({ prompt: "Move." }), "");
  assert.equal(validateSeedance25MultiRow({ prompt: "Move." }), "");
});

test("Seedance accepts all output options and integer durations 4 through 30", () => {
  for (const size of ["adaptive", "16:9", "4:3", "1:1", "3:4", "9:16", "21:9"]) {
    for (const quality of ["480p", "720p", "1080p"]) {
      for (let duration = 4; duration <= 30; duration += 1) {
        for (const outputFormat of ["mp4", "mov"]) {
          const row = sdRow({ size, quality, duration: String(duration), outputFormat, generateAudio: false });
          assert.equal(validateSeedance25MultiRow(row), "");
          assert.equal(validateSeedance25FirstLastRow(row), "");
          const payload = buildSeedance25MultiPayload(row);
          assert.equal(payload.duration, duration);
          assert.equal(payload.ratio, size);
          assert.equal(payload.resolution, quality);
          assert.equal(payload.output_format, outputFormat);
          assert.equal(payload.generate_audio, false);
        }
      }
    }
  }
});

test("Seedance automatic output duration submits numeric -1 without changing reference durations", () => {
  for (const duration of [-1, "-1"]) {
    const refs = [asset("video", 1, { duration: 12 }), asset("audio", 1, { duration: 8 })];
    const row = sdRow({ duration, refs, firstFrame: asset("image") });
    const before = JSON.stringify(row);
    assert.equal(validateSeedance25FirstLastRow(row), "");
    assert.equal(validateSeedance25MultiRow(row), "");
    assert.equal(buildSeedance25FirstLastPayload(row).duration, -1);
    const payload = buildSeedance25MultiPayload(row);
    assert.equal(payload.duration, -1);
    assert.deepEqual(payload.reference_videos, [refs[0].url]);
    assert.equal(JSON.stringify(row), before);
  }
  assert.notEqual(validateSeedance25MultiRow(sdRow({ duration: -1, refs: [asset("video", 1, { duration: -1 })] })), "");
});

test("Seedance requires prompt and rejects unsupported base parameters in both modes", () => {
  for (const extra of [
    { prompt: " " }, { version: "seedance2.0" }, { size: "auto" }, { quality: "4k" },
    { quality: "1080P" }, { duration: "3" }, { duration: "31" }, { duration: "-2" }, { duration: "0" },
    { duration: "4.5" }, { duration: "bad" }, { duration: "" }, { duration: Infinity },
    { outputFormat: "webm" }, { generateAudio: "false" }
  ]) {
    const row = sdRow(extra);
    assert.notEqual(validateSeedance25FirstLastRow(row), "", JSON.stringify(extra));
    assert.notEqual(validateSeedance25MultiRow(row), "", JSON.stringify(extra));
    assert.throws(() => buildSeedance25FirstLastPayload(row));
    assert.throws(() => buildSeedance25MultiPayload(row));
  }
});

test("Seedance first/last mode allows text-only and first-only, but last requires first", () => {
  const firstFrame = asset("image", 1, { url: " https://cdn.example/first.png " });
  const lastFrame = asset("image", 2);
  const payload = buildSeedance25FirstLastPayload(sdRow({ firstFrame, lastFrame, outputFormat: "mov", generateAudio: false }));
  assert.equal(payload.first_frame_image, "https://cdn.example/first.png");
  assert.equal(payload.last_frame_image, lastFrame.url);
  assert.equal(payload.output_format, "mov");
  assert.equal(payload.generate_audio, false);
  assert.equal("last_frame_image" in buildSeedance25FirstLastPayload(sdRow({ firstFrame })), false);
  for (const extra of [{ lastFrame }, { firstFrame: {} }, { firstFrame: asset("video") }, { firstFrame, lastFrame: { url: " " } }]) {
    assert.notEqual(validateSeedance25FirstLastRow(sdRow(extra)), "");
    assert.throws(() => buildSeedance25FirstLastPayload(sdRow(extra)));
  }
});

test("Seedance mixed references preserve row identity before grouping URL arrays", () => {
  const refs = [asset("audio", 1, { duration: 4 }), asset("image", 1), asset("video", 1, { duration: 8 }), asset("image", 2)];
  const labels = buildSeedance25ReferenceLabels(refs);
  assert.deepEqual(labels.map(({ token, label, type }) => ({ token, label, type })), [
    { token: "@1", label: "\u97f3\u98911", type: "audio" }, { token: "@2", label: "\u56fe\u72471", type: "image" },
    { token: "@3", label: "\u89c6\u98911", type: "video" }, { token: "@4", label: "\u56fe\u72472", type: "image" }
  ]);
  const prompt = "Use @1 with @2 then @3 and @4; keep @9 and @30.";
  const normalized = "Use \u97f3\u98911 with \u56fe\u72471 then \u89c6\u98911 and \u56fe\u72472; keep @9 and @30.";
  assert.equal(normalizeSeedance25Prompt(prompt, labels), normalized);
  const payload = buildSeedance25MultiPayload(sdRow({ prompt, refs }));
  assert.deepEqual(payload, {
    prompt: normalized, model_name: "seedance2.5", ratio: "16:9", resolution: "1080p", duration: 10,
    output_format: "mp4", generate_audio: true, reference_images: [refs[1].url, refs[3].url],
    reference_videos: [refs[2].url], reference_audios: [refs[0].url]
  });
  assert.equal(normalizeSeedance25Prompt("<<image_2>> <<video_1>> <<audio_1>>", labels), "\u56fe\u72472 \u89c6\u98911 \u97f3\u98911");
  assert.equal(normalizeSeedance25Prompt("@@ / @all", labels), "\u97f3\u98911\u3001\u56fe\u72471\u3001\u89c6\u98911\u3001\u56fe\u72472 / \u97f3\u98911\u3001\u56fe\u72471\u3001\u89c6\u98911\u3001\u56fe\u72472");
  const thirty = buildSeedance25ReferenceLabels(assets("image", 30));
  assert.equal(normalizeSeedance25Prompt("@1 @10 @30 @31", thirty), "\u56fe\u72471 \u56fe\u724710 \u56fe\u724730 @31");
  assert.deepEqual(buildSeedance25ReferenceLabels(), []);
  assert.equal(normalizeSeedance25Prompt(" @1 "), "@1");
});

test("Seedance permits audio-only and counts all refs, videos and audios separately", () => {
  const audios = assets("audio", 10, { duration: 3 });
  const videos = assets("video", 10, { duration: 3 });
  assert.equal(validateSeedance25MultiRow(sdRow({ refs: audios })), "");
  assert.deepEqual(buildSeedance25MultiPayload(sdRow({ refs: audios })).reference_audios, audios.map(item => item.url));
  assert.equal(validateSeedance25MultiRow(sdRow({ refs: [...assets("image", 10), ...videos, ...audios] })), "");
  assert.equal(validateSeedance25MultiRow(sdRow({ refs: assets("image", 30) })), "");
  for (const refs of [assets("image", 31), assets("video", 11, { duration: 2 }), assets("audio", 11, { duration: 2 })]) {
    assert.notEqual(validateSeedance25MultiRow(sdRow({ refs })), "");
    assert.throws(() => buildSeedance25MultiPayload(sdRow({ refs })));
  }
});

test("Seedance validates known per-clip and per-type aggregate durations without H3 tolerance", () => {
  for (const type of ["video", "audio"]) {
    for (const duration of [2, 30, "2", "30", 2.5, undefined, null, ""]) {
      assert.equal(validateSeedance25MultiRow(sdRow({ refs: [asset(type, 1, { duration })] })), "");
    }
    for (const duration of [0, 1.99, 30.01, -2, "bad", Infinity, NaN, true]) {
      const row = sdRow({ refs: [asset(type, 1, { duration })] });
      assert.notEqual(validateSeedance25MultiRow(row), "", `${type}: ${duration}`);
      assert.throws(() => buildSeedance25MultiPayload(row));
    }
    assert.equal(validateSeedance25MultiRow(sdRow({ refs: assets(type, 2, { duration: 15 }) })), "");
    const row = sdRow({ refs: [asset(type, 1, { duration: 15 }), asset(type, 2, { duration: 15.01 })] });
    assert.notEqual(validateSeedance25MultiRow(row), "");
    assert.throws(() => buildSeedance25MultiPayload(row));
  }
  assert.equal(validateSeedance25MultiRow(sdRow({ refs: [asset("video", 1, { duration: 30 }), asset("audio", 1, { duration: 30 })] })), "");
});

test("Seedance refuses malformed refs instead of dropping them and shifting @ tokens", () => {
  for (const invalid of [null, {}, asset("other"), asset("image", 1, { url: " " }), asset("image", 1, { url: {} })]) {
    const refs = [invalid, asset("image", 2)];
    assert.notEqual(validateSeedance25MultiRow(sdRow({ refs })), "");
    assert.throws(() => buildSeedance25MultiPayload(sdRow({ refs })));
    assert.throws(() => buildSeedance25ReferenceLabels(refs));
  }
  assert.notEqual(validateSeedance25MultiRow(sdRow({ refs: {} })), "");
  assert.equal(buildSeedance25MultiPayload(sdRow({ refs: [asset("image", 1, { url: " https://cdn.example/image.png " })] })).reference_images[0], "https://cdn.example/image.png");
});

test("new helpers do not mutate frozen rows, arrays or assets", () => {
  const image = Object.freeze(asset("image"));
  const audio = Object.freeze(asset("audio", 1, { duration: 2 }));
  const rows = [
    [Object.freeze(gptRow({ images: Object.freeze([image]) })), validateGptImage25Row, buildGptImage25Payload],
    [Object.freeze(sdRow({ firstFrame: image })), validateSeedance25FirstLastRow, buildSeedance25FirstLastPayload],
    [Object.freeze(sdRow({ refs: Object.freeze([audio, image]) })), validateSeedance25MultiRow, buildSeedance25MultiPayload]
  ];
  for (const [row, validate, build] of rows) {
    const before = JSON.stringify(row);
    assert.equal(validate(row), "");
    const payload = build(row);
    assert.equal(JSON.stringify(row), before);
    (payload.reference_images || payload.refer_imgs || []).push("https://cdn.example/new");
    assert.equal(JSON.stringify(row), before);
  }
});

test("browser export works without DOM and existing contracts remain compatible", () => {
  const context = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "model-contracts.js"), "utf8"), context);
  assert.equal(context.ApiBatchModelContracts.GPT_IMAGE_25.endpoint, "/gen_img_4o");
  assert.equal(context.ApiBatchModelContracts.SEEDANCE_25.version, "seedance2.5");
  assert.deepEqual(contracts.seedance2QualityOptions("doubao-seedance-2-0-fast-260128"), ["480p", "720p"]);
  assert.deepEqual(contracts.seedance2QualityOptions(contracts.SEEDANCE_2.version), ["480p", "720p", "1080p", "4k"]);
  assert.equal(contracts.SEEDANCE_2.version, "doubao-seedance-2-0-260128");
  assert.equal(contracts.SEEDANCE_2.defaultDuration, "10");
  assert.equal(contracts.MINIMAX_H3.defaultQuality, "2K");
  assert.equal(contracts.KLING_3_OMNI.defaultQuality, "1080p");
  assert.deepEqual(contracts.buildSeedance2FirstLastPayload(), {
    prompt: undefined, generate_audio: true, ratio: undefined, duration: 5, resolution: undefined, web_search: false
  });
});

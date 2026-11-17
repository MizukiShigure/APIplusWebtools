const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  KLING_3_OMNI,
  MINIMAX_H3,
  SEEDANCE_2,
  nearestQualityOption
} = require("./model-contracts.js");

assert.equal(SEEDANCE_2.defaultQuality, "1080p");
assert.equal(SEEDANCE_2.defaultDuration, "10");
assert.equal(MINIMAX_H3.defaultQuality, "2K");
assert.equal(MINIMAX_H3.defaultDuration, "10");
assert.equal(KLING_3_OMNI.defaultQuality, "1080p");
assert.equal(KLING_3_OMNI.defaultDuration, "10");
assert.equal(nearestQualityOption("1080P", ["std", "pro"], "pro"), "pro");

const appSource = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
const imageVideoModelsSource = appSource.slice(
  appSource.indexOf("const IMAGE_VIDEO_MODELS ="),
  appSource.indexOf("const MULTI_VIDEO_MODELS =")
);
const multiVideoModelsSource = appSource.slice(
  appSource.indexOf("const MULTI_VIDEO_MODELS ="),
  appSource.indexOf("const VIDU_REF_VIDEO_MODEL =")
);
const motionModelsSource = appSource.slice(
  appSource.indexOf("const MOTION_MODELS ="),
  appSource.indexOf("const AVATAR_MODELS =")
);

assert.match(imageVideoModelsSource, /hailuo:\s*\{[\s\S]*?defaultDuration:\s*"10"/);
assert.match(imageVideoModelsSource, /kling:\s*\{[\s\S]*?defaultQuality:\s*"pro"[\s\S]*?defaultDuration:\s*"10"/);
assert.match(imageVideoModelsSource, /seedance2:\s*\{[\s\S]*?defaultQuality:\s*SEEDANCE_2\.defaultQuality[\s\S]*?defaultDuration:\s*SEEDANCE_2\.defaultDuration/);
assert.match(multiVideoModelsSource, /seedance:\s*\{[\s\S]*?defaultQuality:\s*SEEDANCE_2\.defaultQuality[\s\S]*?defaultDuration:\s*SEEDANCE_2\.defaultDuration/);
assert.match(multiVideoModelsSource, /kling3Omni:\s*\{[\s\S]*?defaultQuality:\s*KLING_3_OMNI\.defaultQuality[\s\S]*?defaultDuration:\s*KLING_3_OMNI\.defaultDuration/);
assert.match(motionModelsSource, /kling:\s*\{[\s\S]*?defaultQuality:\s*"pro"/);

assert.match(appSource, /function createMotionRow[\s\S]*?quality:\s*seed\.quality \?\? \(config\.defaultQuality \|\| config\.qualities\[0\] \|\| ""\)/);
assert.match(appSource, /function updateMotionRowField[\s\S]*?next\.defaultQuality \|\| next\.qualities\[0\] \|\| ""/);

console.log("video model defaults checks passed");

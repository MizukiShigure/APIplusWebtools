const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildCapabilityManifest,
  createRowSeed,
  normalizeTaskType
} = require("./agent-task-adapter.js");

const catalogs = {
  image: {
    nano: {
      label: "Nano Banana",
      versions: [{ label: "Banana Pro", value: "nano_banana_2" }],
      sizes: ["1:1", "9:16"],
      qualities: ["1K", "2K"],
      maxImages: 10
    }
  },
  imageVideo: {
    kling: {
      label: "Kling",
      versions: [{ label: "Kling 3", value: "kling-v3" }],
      sizes: ["", "16:9", "9:16"],
      qualities: ["std", "pro"],
      durations: ["3", "4", "5"]
    }
  },
  motion: {
    kling: {
      label: "Kling Motion",
      versions: [{ label: "Kling 3", value: "kling-v3" }],
      sizes: ["9:16"],
      qualities: ["pro"]
    }
  },
  multiVideo: {
    seedance: {
      label: "Seedance 2.0",
      versions: [{ label: "2.0", value: "doubao-seedance-2-0" }],
      sizes: ["16:9"],
      qualities: ["720p"],
      durations: ["4", "5"]
    }
  },
  avatar: {
    kling: {
      label: "Kling Avatar",
      versions: [{ label: "Avatar", value: "kling-avatar" }],
      qualities: ["1080p"]
    }
  },
  locked: {
    music: { label: "Music", versions: [] }
  }
};

test("normalizes public task-family aliases", () => {
  assert.equal(normalizeTaskType("image-video"), "imageVideo");
  assert.equal(normalizeTaskType("multi_video"), "multiVideo");
  assert.equal(normalizeTaskType("motion"), "motion");
});

test("builds capabilities only for enabled live task families", () => {
  const manifest = buildCapabilityManifest({
    catalogs,
    enabledTaskTypes: ["image", "imageVideo", "motion", "multiVideo", "avatar"]
  });
  assert.equal(manifest.contractVersion, 1);
  assert.deepEqual(manifest.taskFamilies.map(item => item.id), [
    "image",
    "imageVideo",
    "motion",
    "multiVideo",
    "avatar"
  ]);
  assert.equal(manifest.taskFamilies.some(item => item.id === "music"), false);
  assert.equal(manifest.taskFamilies[0].models[0].versions[0].value, "nano_banana_2");
  assert.equal(manifest.taskFamilies[0].models[0].media.maxImages, 10);
});

test("maps image Agent input into the existing row seed", () => {
  const seed = createRowSeed({
    taskId: "agent-image-1",
    taskType: "image",
    origin: { type: "agent", client: "codex", id: "codex-local", label: "Codex local" },
    input: {
      prompt: "portrait",
      model: "nano",
      version: "nano_banana_2",
      assets: { images: [{ url: "https://cdn.example/ref.png", type: "image" }] },
      options: { size: "9:16", quality: "2K" },
      count: 3
    }
  }, {
    workerId: "browser-a",
    workerLabel: "Main Edge"
  });
  assert.equal(seed.taskType, "image");
  assert.equal(seed.row.agentTaskId, "agent-image-1");
  assert.equal(seed.row.model, "nano");
  assert.equal(seed.row.size, "9:16");
  assert.equal(seed.row.quality, "2K");
  assert.equal(seed.row.count, 3);
  assert.equal(seed.row.images[0].url, "https://cdn.example/ref.png");
  assert.equal(seed.row.origin.client, "codex");
  assert.deepEqual(seed.row.executedBy, { type: "browser", id: "browser-a", label: "Main Edge" });
});

test("maps each media slot to the matching existing row shape", () => {
  const asset = (name, type) => ({ url: `https://cdn.example/${name}`, type, name });
  const cases = [
    ["imageVideo", { firstFrame: asset("first.png", "image"), lastFrame: asset("last.png", "image") }, row => [row.firstFrame, row.lastFrame]],
    ["motion", { image: asset("person.png", "image"), video: asset("motion.mp4", "video") }, row => [row.image, row.video]],
    ["multiVideo", { refs: [asset("one.png", "image"), asset("sound.mp3", "audio")] }, row => row.refs],
    ["avatar", { image: asset("avatar.png", "image"), audio: asset("voice.mp3", "audio") }, row => [row.image, row.audio]]
  ];
  for (const [taskType, assets, select] of cases) {
    const seed = createRowSeed({
      taskId: `agent-${taskType}`,
      taskType,
      input: { prompt: "test", model: "kling", assets, options: { duration: 5 }, count: 1 }
    }, { workerId: "browser-a" });
    assert.equal(seed.taskType, taskType);
    assert.equal(select(seed.row).filter(Boolean).length, Array.isArray(assets.refs) ? assets.refs.length : Object.keys(assets).length);
  }
});

test("accepts the documented flat envelope as well as the input envelope", () => {
  const seed = createRowSeed({
    taskId: "flat-1",
    taskType: "image-video",
    model: "kling",
    version: "kling-v3",
    prompt: "move",
    assets: { firstFrame: { url: "https://cdn.example/first.png", type: "image" } },
    options: { ratio: "16:9", quality: "pro", duration: 5 },
    count: 2
  });
  assert.equal(seed.taskType, "imageVideo");
  assert.equal(seed.row.model, "kling");
  assert.equal(seed.row.version, "kling-v3");
  assert.equal(seed.row.size, "16:9");
  assert.equal(seed.row.duration, "5");
  assert.equal(seed.row.count, 2);
});

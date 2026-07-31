(function attachAgentTaskAdapter(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ApiBatchAgentTaskAdapter = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createAgentTaskAdapterModule() {
  "use strict";

  const TASK_TYPE_ALIASES = {
    image: "image",
    image_generation: "image",
    "image-generation": "image",
    imagevideo: "imageVideo",
    image_video: "imageVideo",
    "image-video": "imageVideo",
    motion: "motion",
    motion_imitation: "motion",
    "motion-imitation": "motion",
    multivideo: "multiVideo",
    multi_video: "multiVideo",
    "multi-video": "multiVideo",
    multimodal_video: "multiVideo",
    "multimodal-video": "multiVideo",
    avatar: "avatar",
    digital_human: "avatar",
    "digital-human": "avatar"
  };

  const TASK_LABELS = {
    image: "Image generation",
    imageVideo: "Image to video",
    motion: "Motion imitation",
    multiVideo: "Multimodal video",
    avatar: "Digital human"
  };

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function normalizeTaskType(value) {
    const raw = String(value || "").trim();
    return TASK_TYPE_ALIASES[raw] || TASK_TYPE_ALIASES[raw.toLowerCase()] || raw;
  }

  function copyChoiceArray(value) {
    if (!Array.isArray(value)) return [];
    return value.map(item => {
      if (item && typeof item === "object") {
        return {
          label: String(item.label ?? item.value ?? ""),
          value: String(item.value ?? item.label ?? "")
        };
      }
      return String(item);
    });
  }

  function modelMedia(taskType, config) {
    if (taskType === "image") {
      return { images: true, maxImages: Number(config.maxImages || 0) || null };
    }
    if (taskType === "imageVideo") {
      return { firstFrame: true, lastFrame: true };
    }
    if (taskType === "motion") {
      return { image: true, video: true };
    }
    if (taskType === "multiVideo") {
      return { refs: ["image", "video", "audio"], maxRefs: Number(config.maxRefs || 0) || null };
    }
    if (taskType === "avatar") {
      return { image: true, audio: true };
    }
    return {};
  }

  function serializeModel(taskType, id, config = {}) {
    return {
      id,
      label: String(config.label || id),
      versions: copyChoiceArray(config.versions),
      sizes: copyChoiceArray(config.sizes),
      qualities: copyChoiceArray(config.qualities),
      durations: copyChoiceArray(config.durations),
      defaults: {
        version: config.defaultVersion || config.versions?.[0]?.value || "",
        size: config.defaultSize ?? config.sizes?.[0] ?? "",
        quality: config.defaultQuality ?? config.qualities?.[0] ?? "",
        duration: String(config.defaultDuration ?? config.durations?.[0] ?? "")
      },
      media: modelMedia(taskType, config),
      cancellation: config.cancelEndpoint || config.cancelEndpoints || config.cancelEndpointCandidates
        ? "provider"
        : "local"
    };
  }

  function buildCapabilityManifest(options = {}) {
    const catalogs = options.catalogs || {};
    const enabled = Array.isArray(options.enabledTaskTypes)
      ? options.enabledTaskTypes.map(normalizeTaskType)
      : ["image", "imageVideo", "motion", "multiVideo", "avatar"];
    return {
      contractVersion: 1,
      execution: "browser-worker",
      taskFamilies: enabled
        .filter(taskType => catalogs[taskType] && typeof catalogs[taskType] === "object")
        .map(taskType => ({
          id: taskType,
          label: TASK_LABELS[taskType] || taskType,
          models: Object.entries(catalogs[taskType]).map(([id, config]) => serializeModel(taskType, id, config))
        }))
    };
  }

  function guessMediaType(value = {}) {
    const direct = String(value.type || value.mediaType || value.mime || "").toLowerCase();
    if (direct.startsWith("image")) return "image";
    if (direct.startsWith("video")) return "video";
    if (direct.startsWith("audio")) return "audio";
    const candidate = String(value.name || value.url || value.workerUrl || value.assetId || "").toLowerCase();
    if (/\.(png|jpe?g|webp|gif|bmp|avif)(?:$|[?#])/.test(candidate)) return "image";
    if (/\.(mp4|mov|mkv|webm|avi)(?:$|[?#])/.test(candidate)) return "video";
    if (/\.(mp3|m4a|wav|aac|flac|ogg)(?:$|[?#])/.test(candidate)) return "audio";
    return "other";
  }

  function normalizeAsset(value) {
    if (!value) return null;
    const source = typeof value === "string" ? { url: value } : clone(value);
    if (!source || typeof source !== "object") return null;
    const url = String(source.url || source.remoteUrl || source.publicUrl || "").trim();
    const workerUrl = String(source.workerUrl || "").trim();
    const assetId = String(source.assetId || source.id || "").trim();
    if (!url && !workerUrl && !assetId) return null;
    const nameSource = source.name || url || workerUrl || assetId || "asset";
    const name = String(nameSource).split(/[\\/]/).pop().split(/[?#]/)[0] || "asset";
    return {
      ...source,
      id: String(source.id || source.assetId || ""),
      assetId: assetId || undefined,
      name,
      url,
      preview: String(source.preview || url || ""),
      type: guessMediaType(source),
      workerUrl: workerUrl || undefined,
      createdAt: Number(source.createdAt || Date.now())
    };
  }

  function normalizeAssetList(value) {
    const list = Array.isArray(value) ? value : value ? [value] : [];
    return list.map(normalizeAsset).filter(Boolean);
  }

  function mergedEnvelope(task = {}) {
    const input = task.input && typeof task.input === "object" && !Array.isArray(task.input) ? task.input : {};
    return {
      ...task,
      ...input,
      assets: input.assets ?? task.assets ?? {},
      options: input.options ?? task.options ?? {}
    };
  }

  function taskOrigin(task = {}) {
    const source = task.origin && typeof task.origin === "object" ? task.origin : {};
    return {
      type: String(source.type || "agent"),
      client: String(source.client || "agent"),
      id: String(source.id || source.client || "agent"),
      label: String(source.label || source.client || "Agent")
    };
  }

  function baseRow(task, input, context) {
    const options = input.options || {};
    const size = options.size ?? options.ratio ?? options.aspectRatio ?? input.size ?? input.ratio;
    const quality = options.quality ?? options.resolution ?? input.quality ?? input.resolution;
    const duration = options.duration ?? options.durationSeconds ?? input.duration;
    return {
      agentTaskId: String(task.taskId || task.id || ""),
      origin: taskOrigin(task),
      executedBy: {
        type: "browser",
        id: String(context.workerId || "browser-worker"),
        label: String(context.workerLabel || context.workerId || "Browser worker")
      },
      prompt: String(input.prompt || ""),
      model: input.model ? String(input.model) : undefined,
      version: input.version ? String(input.version) : undefined,
      size: size === undefined || size === null ? undefined : String(size),
      quality: quality === undefined || quality === null ? undefined : String(quality),
      duration: duration === undefined || duration === null ? undefined : String(duration),
      count: Math.max(1, Number(input.count || options.count || 1)),
      generateAudio: options.generateAudio ?? input.generateAudio,
      autoMultiShot: Boolean(options.autoMultiShot ?? input.autoMultiShot),
      mode: options.mode ?? input.mode
    };
  }

  function firstAsset(assets, keys, type) {
    for (const key of keys) {
      const found = normalizeAssetList(assets?.[key]).find(item => !type || item.type === type);
      if (found) return found;
    }
    return null;
  }

  function createRowSeed(task = {}, context = {}) {
    const taskType = normalizeTaskType(task.taskType);
    const input = mergedEnvelope(task);
    const assets = context.assets || input.assets || {};
    const row = baseRow(task, input, context);
    if (taskType === "image") {
      row.images = normalizeAssetList(assets.images || assets.referenceImages || assets.refs)
        .filter(asset => asset.type === "image");
    } else if (taskType === "imageVideo") {
      row.firstFrame = firstAsset(assets, ["firstFrame", "image", "images"], "image");
      row.lastFrame = firstAsset(assets, ["lastFrame", "endFrame"], "image");
    } else if (taskType === "motion") {
      row.image = firstAsset(assets, ["image", "subjectImage", "images"], "image");
      row.video = firstAsset(assets, ["video", "referenceVideo", "videos"], "video");
    } else if (taskType === "multiVideo") {
      row.refs = normalizeAssetList(assets.refs || assets.references || assets.items);
    } else if (taskType === "avatar") {
      row.image = firstAsset(assets, ["image", "avatarImage", "images"], "image");
      row.audio = firstAsset(assets, ["audio", "voice", "audios"], "audio");
    } else {
      throw new Error(`Unsupported Agent task type: ${task.taskType || "empty"}`);
    }
    return { taskType, row };
  }

  return {
    buildCapabilityManifest,
    createRowSeed,
    guessMediaType,
    normalizeAsset,
    normalizeAssetList,
    normalizeTaskType
  };
});

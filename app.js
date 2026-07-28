const API_DEFAULT = "https://gateway.example/api";
const TASK_TIMEOUT_MS = 30 * 60 * 1000;
const REQUEST_TIMEOUT_MS = TASK_TIMEOUT_MS;
const POLL_INTERVAL_MS = 60 * 1000;
const REMOTE_CANCEL_TIMEOUT_MS = 8000;
const SEEDANCE_FAST_VIDEO_PIXEL_LIMIT = 2086876;
const VIDEO_COMPRESS_MARGIN = 0.995;
const VIDEO_COMPRESS_FPS = 24;
const SUNO_API_DEFAULT = "https://api.sunoapi.org/api/v1";
const MODEL_CONTRACTS = globalThis.ApiBatchModelContracts;
const { KLING_3_OMNI, formatProviderError, nearestQualityOption, seedance2QualityOptions } = MODEL_CONTRACTS;
const STORAGE_KEYS = {
  apiBase: "api_console_api_base",
  activePage: "api_console_active_page",
  historyTab: "api_console_history_tab",
  historyType: "api_console_history_type",
  historyModel: "api_console_history_model",
  historySize: "api_console_history_size",
  historySearch: "api_console_history_search",
  maxConcurrency: "api_console_max_concurrency",
  runningHubMotionConfig: "api_console_runninghub_motion_config_v1",
  imageRows: "api_console_image_rows_v2",
  imageVideoRows: "api_console_image_video_rows_v1",
  motionRows: "api_console_motion_rows_v1",
  multiVideoRows: "api_console_multi_video_rows_v1",
  viduRefRows: "api_console_vidu_ref_rows_v1",
  avatarRows: "api_console_avatar_rows_v1",
  avatarJimengCreate: "api_console_avatar_jimeng_create",
  avatarJimengQuery: "api_console_avatar_jimeng_query",
  avatarKlingCreate: "api_console_avatar_kling_create",
  avatarKlingQuery: "api_console_avatar_kling_query",
  musicTool: "api_console_music_tool",
  sunoApiMode: "api_console_suno_api_mode",
  sunoApiBase: "api_console_suno_api_base",
  sunoApiKey: "api_console_suno_api_key",
  sunoGatewayGenerate: "api_console_suno_gateway_generate",
  sunoGatewayQuery: "api_console_suno_gateway_query",
  sunoState: "api_console_suno_state_v1",
  viduVoiceState: "api_console_vidu_voice_state_v1",
  viduVoiceEndpoint: "api_console_vidu_voice_endpoint",
  subjectTab: "api_console_subject_tab",
  subjectCreateState: "api_console_subject_create_state_v1",
  subjectLibrary: "api_console_subject_library_v1",
  uploadHistory: "api_console_upload_history_v2",
  generationHistory: "api_console_generation_history_v2",
  generationFavorites: "api_console_generation_favorites_v1",
  historyFavoritesOnly: "api_console_history_favorites_only"
};

const HISTORY_TYPES = ["image", "video", "audio", "other"];
const HISTORY_PAGE_SIZE = 50;
const HISTORY_RETENTION_PER_TYPE = 1000;
const HISTORY_IDB_NAME = "api_console_history_db_v1";
const HISTORY_IDB_VERSION = 1;
const HISTORY_IDB_STORE = "history";
const HISTORY_IDB_KEYS = {
  uploadHistory: "uploadHistory",
  generationHistory: "generationHistory"
};
const LOCAL_HISTORY_BACKUP_ENDPOINT = "/api/local/history";
const VALID_ROW_STATUSES = ["pending", "queued", "running", "partial", "done", "failed", "canceled", "dirty"];
const SUBMITTABLE_ROW_STATUSES = ["pending", "failed", "canceled", "dirty"];
const RUNNINGHUB_WORKFLOW_TYPES = {
  motion: "动作模仿",
  avatar: "数字人"
};
const RUNNINGHUB_NODE_BINDINGS = {
  none: "手动固定值",
  prompt: "Prompt",
  referenceImage: "参考图片",
  referenceVideo: "参考视频",
  referenceAudio: "参考音频",
  durationSeconds: "时长秒数",
  frameLimit: "帧数上限",
  fps: "帧率",
  width: "素材宽度",
  height: "素材高度",
  ratioWidth: "比例宽",
  ratioHeight: "比例高",
  aspectRatio: "宽高比",
  size: "表格尺寸"
};
const DEFAULT_RUNNINGHUB_MOTION_CONFIG = {
  id: "rh_motion_default",
  title: "RunningHub 工作流",
  source: "manual",
  workflowType: "motion",
  webappId: "",
  endpoint: "/api/runninghub/run",
  queryEndpoint: "/api/runninghub/query",
  sourceUrl: "",
  nodeInfoList: "",
  clientId: "",
  instanceType: "plus",
  usePersonalQueue: false,
  retainSeconds: "",
  webhookUrl: "",
  zipSwitch: "1",
  poseMethod: "1",
  pose3Neck: false,
  poseStrength: "1.0000000000000002",
  cameraEnabled: false,
  cameraStrength: "1.0000000000000002",
  helmetMode: false,
  expressionStrength: "0.8000000000000002",
  chestShake: "0.20000000000000004",
  skipFrames: "0",
  frameLimit: "840",
  fps: "30",
  resolutionSelect: "2",
  customRatioEnabled: false,
  customRatioWidth: "9",
  customRatioHeight: "16"
};

const IMAGE_MODELS = {
  nano: {
    label: "Nano Banana",
    endpoint: "/nano_banana_image",
    queryEndpoint: "/nano_banana_image_query",
    async: true,
    versions: [
      { label: "Banana Pro", value: "nano_banana_2" },
      { label: "Banana 2 Flash", value: "nano_banana_2_flash" },
      { label: "Nano Banana", value: "nano_banana" }
    ],
    sizes: ["1:1", "3:4", "4:3", "16:9", "9:16", "21:9", "3:2", "2:3"],
    qualities: ["1K", "2K", "4K"],
    maxImages: 10,
    build(row) {
      return {
        prompt: row.prompt,
        image_urls: row.images.map(item => item.url),
        model_name: row.version,
        aspect_ratio: row.size || undefined,
        quality: row.quality || undefined,
        generation_count: 1,
        enable_search: false
      };
    }
  },
  seedream: {
    label: "即梦 Seedream",
    endpoint: "/seeddream",
    async: false,
    versions: [
      { label: "Seedream 5.0", value: "seedream-5.0" },
      { label: "Seedream 4.5", value: "seedream-4.5" },
      { label: "Seedream 4.0", value: "seedream-4.0" }
    ],
    sizes: ["1:1", "3:4", "4:3", "16:9", "9:16", "21:9", "3:2", "2:3"],
    qualities: ["2K", "3K", "4K"],
    maxImages: 10,
    build(row) {
      const seedreamQuality = normalizeSeedreamQuality(row.quality, row.version);
      const seedreamSize = normalizeSeedreamSize(seedreamQuality, row.version);
      const payload = {
        prompt: row.prompt,
        image_urls: row.images.map(item => item.url),
        model_name: row.version,
        quality: seedreamQuality,
        generation_count: 1
      };
      if (seedreamSize) {
        payload.size = seedreamSize;
      }
      if (row.size) {
        payload.ratio = row.size;
      }
      return payload;
    }
  },
  midjourney: {
    label: "Midjourney",
    endpoint: "/midjourney",
    queryEndpoint: "/midjourney_query",
    async: true,
    versions: [
      { label: "V7", value: "7" },
      { label: "V6.1", value: "6.1" },
      { label: "Niji 7", value: "niji_7" }
    ],
    sizes: ["1:1", "4:3", "3:4", "3:2", "2:3", "16:9", "9:16"],
    qualities: [],
    maxImages: 4,
    promptOnly: ["quality"],
    build(row) {
      return {
        prompt: withPromptHints(row),
        aspect_ratio: row.size || "1:1",
        model_name: row.version,
        reference_image_paths: row.images.map(item => item.url).slice(0, 4),
        style_reference_image_paths: [],
        character_reference_image_paths: [],
        stylize: 100,
        weird: 0,
        chaos: 0,
        enable_raw: false
      };
    }
  },
  kontext: {
    label: "Kontext Image",
    endpoint: "/kontext",
    async: false,
    versions: [{ label: "Kontext Image", value: "kontext-image" }],
    sizes: ["1:1", "3:4", "4:3", "16:9", "9:16"],
    qualities: [],
    maxImages: 1,
    promptOnly: ["quality"],
    build(row) {
      return {
        prompt: withPromptHints(row),
        image_url: row.images[0]?.url || undefined,
        action_count: 1,
        aspect_ratio: row.size || "1:1"
      };
    }
  },
  qwen: {
    label: "Qwen Image",
    endpoint: "/qwen_image_edit",
    async: false,
    versions: [{ label: "Qwen Image Edit", value: "qwen-image-edit" }],
    sizes: [],
    qualities: [],
    maxImages: 1,
    promptOnly: ["size", "quality"],
    build(row) {
      return {
        prompt: withPromptHints(row),
        image_url: row.images[0]?.url || undefined
      };
    }
  },
  gpt: {
    label: "GPT Image",
    endpoint: "/gen_img_4o",
    queryEndpoint: "/gen_img_4o_query",
    async: true,
    fixedModelName: "gpt-image-2",
    versions: [{ label: "gpt-image-2", value: "gpt-image-2" }],
    sizes: ["21:9", "16:9", "9:16", "4:3", "5:4", "1:1", "3:4", "auto"],
    qualities: ["1K", "2K", "4K", "auto"],
    maxImages: 4,
    build(row) {
      return {
        prompt: row.prompt,
        refer_imgs: row.images.map(item => item.url).slice(0, 4),
        image_quality: normalizeGptQuality(row.quality),
        image_size: normalizeGptSize(row.size, row.quality),
        model_name: row.version || "gpt-image-2"
      };
    }
  },
  klingOmni: {
    label: "Kling Omni Image",
    endpoint: "/kling_image_omni",
    queryEndpoint: "/kling_image_omni_query",
    async: true,
    versions: [{ label: "Kling Omni Image", value: "kling-omni-image" }],
    sizes: ["auto", "16:9", "9:16", "1:1", "4:3", "3:4", "3:2", "2:3", "21:9"],
    qualities: ["1k", "2k"],
    maxImages: 10,
    build(row) {
      return {
        prompt: row.prompt,
        image_paths: row.images.map(item => item.url),
        resolution: normalizeKlingResolution(row.quality),
        aspect_ratio: row.size || "1:1",
        n: 1
      };
    }
  }
};

const IMAGE_VIDEO_MODELS = {
  hailuo: {
    label: "Hailuo",
    endpoint: "/minimax_video",
    queryEndpoint: "/minimax_video_query",
    async: true,
    versions: [
      { label: "Hailuo 02", value: "MiniMax-Hailuo-02" },
      { label: "Hailuo 2.3", value: "MiniMax-Hailuo-2.3" },
      { label: "Hailuo 2.3 Fast", value: "MiniMax-Hailuo-2.3-Fast" }
    ],
    sizes: ["16:9", "9:16"],
    qualities: ["768P", "1080P"],
    durations: ["6", "10"],
    supportsTextOnly: true,
    supportsFirstFrame: true,
    supportsLastFrame(version) {
      return version === "MiniMax-Hailuo-02";
    },
    validate(row) {
      if (row.version === "MiniMax-Hailuo-2.3-Fast" && !row.firstFrame?.url) return "Hailuo 2.3 Fast 必须提供首帧图";
      return "";
    },
    build(row) {
      const aspectRatio = resolvedImageVideoSize(row);
      const payload = {
        prompt: row.prompt,
        model_name: row.version,
        resolution: row.quality || undefined,
        duration: Number(row.duration || 6),
        aspect_ratio: aspectRatio || undefined,
        ratio: aspectRatio || undefined,
        first_frame_image_path: row.firstFrame?.url || null
      };
      if (row.version === "MiniMax-Hailuo-02") payload.last_frame_image_path = row.lastFrame?.url || null;
      return payload;
    }
  },
  veo: {
    label: "Veo",
    endpoint: "/veo3",
    queryEndpoint: "/veo3_query",
    async: true,
    versions: [
      { label: "Veo 3.1", value: "veo-3.1" },
      { label: "Veo 3.1 Fast", value: "veo-3.1-fast" },
      { label: "Veo 3.0", value: "veo-3.0" }
    ],
    sizes: ["16:9", "9:16"],
    qualities: ["720p", "1080p"],
    durations: ["8"],
    supportsTextOnly: true,
    supportsFirstFrame: true,
    supportsLastFrame(version) {
      return version === "veo-3.1" || version === "veo-3.1-fast";
    },
    build(row) {
      const payload = {
        prompt: row.prompt,
        model_name: row.version,
        first_frame_image: row.firstFrame?.url || null
      };
      if (row.version === "veo-3.1" || row.version === "veo-3.1-fast") {
        payload.resolution = row.quality || undefined;
        payload.aspect_ratio = resolvedImageVideoSize(row) || undefined;
        payload.last_frame_image = row.lastFrame?.url || null;
      }
      return payload;
    }
  },
  kling: {
    label: "Kling",
    endpoint: "/kling",
    queryEndpoint: "/kling_query",
    async: true,
    versions: [
      { label: "Kling 3 Omni", value: "kling-v3-omni" },
      { label: "Kling 3", value: "kling-v3" },
      { label: "Kling 2.6", value: "kling-v2-6" },
      { label: "Kling 2.5 Turbo", value: "kling-v2-5-turbo" }
    ],
    sizes: ["16:9", "9:16", "1:1"],
    qualities: ["std", "pro"],
    durations: Array.from({ length: 13 }, (_, index) => String(index + 3)),
    supportsTextOnly: true,
    supportsFirstFrame: true,
    supportsLastFrame: true,
    supportsAutoMultiShot(row) {
      return row.version === "kling-v3" || row.version === "kling-v3-omni";
    },
    durationsFor(row) {
      return row.version === "kling-v3" || row.version === "kling-v3-omni" ? this.durations : ["5", "10"];
    },
    build(row) {
      const mode = row.quality === "pro" ? "pro" : "std";
      const aspectRatio = resolvedImageVideoSize(row);
      const payload = {
        prompt: row.prompt,
        negative_prompt: "",
        first_frame_image: row.firstFrame?.url || null,
        image_tail: row.lastFrame?.url || null,
        model_name: row.version,
        duration: Number(row.duration || 5),
        mode,
        aspect_ratio: aspectRatio || undefined,
        ratio: aspectRatio || undefined,
        generate_sound: row.lastFrame?.url ? false : true
      };
      if (this.supportsAutoMultiShot(row)) payload.auto_multi_shot = Boolean(row.autoMultiShot);
      return payload;
    }
  },
  seedance: {
    label: "Seedance",
    endpoint: "/seedance",
    queryEndpoint: "/seedance_query",
    async: true,
    versions: [
      { label: "Seedance 1.5 Pro", value: "seedance-1.5-pro" },
      { label: "Seedance 2.0", value: "doubao-seedance-2-0-260128" }
    ],
    sizes: ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"],
    qualities: ["480p", "720p", "1080p"],
    qualitiesFor(row) {
      return row.version === "doubao-seedance-2-0-260128" ? seedance2QualityOptions(row.version) : this.qualities;
    },
    durations: Array.from({ length: 12 }, (_, index) => String(index + 4)),
    supportsTextOnly: true,
    supportsFirstFrame: true,
    supportsLastFrame: true,
    build(row) {
      return {
        prompt: row.prompt,
        first_frame_image: row.firstFrame?.url || null,
        last_frame_image: row.lastFrame?.url || null,
        generate_audio: true,
        ratio: resolvedImageVideoSize(row) || undefined,
        duration: Number(row.duration || 5),
        resolution: row.quality || undefined
      };
    }
  },
  seedance2: {
    label: "Seedance 2.0",
    endpoint: "/seedance",
    queryEndpoint: "/seedance_query",
    async: true,
    versions: [{ label: "Seedance 2.0", value: "doubao-seedance-2-0-260128" }],
    sizes: ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"],
    qualities: seedance2QualityOptions("doubao-seedance-2-0-260128"),
    qualitiesFor(row) {
      return seedance2QualityOptions(row.version);
    },
    durations: Array.from({ length: 12 }, (_, index) => String(index + 4)),
    supportsTextOnly: true,
    supportsFirstFrame: true,
    supportsLastFrame: true,
    build(row) {
      return IMAGE_VIDEO_MODELS.seedance.build(row);
    }
  },
  vidu: {
    label: "Vidu",
    endpoint: "/vidu",
    queryEndpoint: "/vidu_query",
    async: true,
    versions: [
      { label: "VQ2-Turbo", value: "VQ2-Turbo" },
      { label: "VQ2-Pro", value: "VQ2-Pro" },
      { label: "VQ3-Pro", value: "VQ3-Pro" },
      { label: "VQ3-Turbo", value: "VQ3-Turbo" }
    ],
    sizes: ["16:9", "9:16", "1:1", "3:4", "4:3"],
    qualities: ["540p", "720p", "1080p"],
    durations: Array.from({ length: 16 }, (_, index) => String(index + 1)),
    supportsTextOnly: false,
    supportsFirstFrame: true,
    supportsLastFrame: true,
    sizesFor(row) {
      return row.version === "VQ2-Turbo" || row.version === "VQ2-Pro"
        ? ["16:9", "9:16", "1:1", "3:4", "4:3"]
        : ["16:9", "9:16", "1:1"];
    },
    durationsFor() {
      return Array.from({ length: 16 }, (_, index) => String(index + 1));
    },
    validate(row) {
      if (!row.firstFrame?.url) return "Vidu 图文生视频必须提供首帧图";
      return "";
    },
    build(row) {
      return {
        prompt: row.prompt,
        generate_mode: "reference_to_video",
        images: [row.firstFrame?.url, row.lastFrame?.url].filter(Boolean),
        first_frame_image: row.firstFrame?.url || "",
        last_frame_image: row.lastFrame?.url || "",
        model: row.version || "VQ2-Turbo",
        duration: Number(row.duration || 4),
        aspect_ratio: resolvedImageVideoSize(row) || undefined,
        resolution: row.quality || undefined,
        audio: row.version === "VQ3-Pro" || row.version === "VQ3-Turbo"
      };
    }
  },
  happyhorse: {
    label: "HappyHorse",
    endpoint: "/happyhorse",
    queryEndpoint: "/happyhorse_query",
    async: true,
    versions: [{ label: "HappyHorse 1.0", value: "happyhorse-1.0" }],
    sizes: ["16:9", "9:16", "1:1", "4:3", "3:4"],
    qualities: ["720P", "1080P"],
    durations: Array.from({ length: 13 }, (_, index) => String(index + 3)),
    supportsTextOnly: false,
    supportsFirstFrame: true,
    supportsLastFrame: false,
    validate(row) {
      if (!row.firstFrame?.url) return "HappyHorse 图文生视频必须提供首帧图";
      return "";
    },
    build(row) {
      const aspectRatio = resolvedImageVideoSize(row);
      return {
        capability: "i2v",
        prompt: row.prompt,
        resolution: row.quality || "720P",
        duration: Number(row.duration || 5),
        aspect_ratio: aspectRatio || undefined,
        ratio: aspectRatio || undefined,
        first_frame_image: row.firstFrame?.url || undefined
      };
    }
  }
};

const MULTI_VIDEO_MODELS = {
  seedance: {
    label: "Seedance 2.0",
    endpoint: "/seedance2",
    queryEndpoint: "/seedance2_query",
    async: true,
    versions: [
      { label: "Seedance 2.0", value: "doubao-seedance-2-0-260128" },
      { label: "Seedance 2.0 Fast", value: "doubao-seedance-2-0-fast-260128" }
    ],
    sizes: ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"],
    qualities: seedance2QualityOptions("doubao-seedance-2-0-260128"),
    qualitiesFor(row) {
      return seedance2QualityOptions(row.version);
    },
    defaultDuration: "5",
    durations: Array.from({ length: 12 }, (_, index) => String(index + 4)),
    maxRefs: 10,
    prepareSeedanceReferences: true,
    validate() {
      return "";
    },
    build(row) {
      return buildSeedance2Payload(row);
    }
  },
  kling3Omni: {
    label: "可灵 3 Omni",
    endpoint: KLING_3_OMNI.endpoint,
    queryEndpoint: KLING_3_OMNI.queryEndpoint,
    async: true,
    supportsGenerateAudio: true,
    versions: [{ label: "Kling 3 Omni", value: KLING_3_OMNI.version }],
    sizes: KLING_3_OMNI.sizes,
    qualities: KLING_3_OMNI.qualities,
    durations: KLING_3_OMNI.durations,
    maxRefs: 10,
    validate(row) {
      return MODEL_CONTRACTS.validateKling3OmniRow(row);
    },
    build(row) {
      return MODEL_CONTRACTS.buildKling3OmniPayload(row);
    }
  }
};

const VIDU_REF_VIDEO_MODEL = {
  label: "Vidu Reference",
  endpoint: "/vidu",
  queryEndpoint: "/vidu_query",
  endpointCandidates: [
    { endpoint: "/vidu_reference_to_video", queryEndpoint: "/vidu_reference_to_video_query" },
    { endpoint: "/vidu_reference", queryEndpoint: "/vidu_reference_query" },
    { endpoint: "/vidu_ref_video", queryEndpoint: "/vidu_ref_video_query" },
    { endpoint: "/vidu_ref", queryEndpoint: "/vidu_ref_query" },
    { endpoint: "/vidu", queryEndpoint: "/vidu_query" }
  ],
  async: true,
  versions: [
    { label: "VQ3-Pro", value: "VQ3-Pro" },
    { label: "VQ3-Turbo", value: "VQ3-Turbo" }
  ],
  sizes: ["16:9", "9:16", "1:1"],
  qualitiesFor(row) {
    return row.version === "VQ3-Pro" ? ["720p", "1080p"] : ["540p", "720p", "1080p"];
  },
  durationsFor(row) {
    const start = row.version === "VQ3-Pro" ? 1 : 3;
    return Array.from({ length: 17 - start }, (_, index) => String(index + start));
  },
  maxRefs: 7,
  build(row) {
    const refs = normalizeAssets(row.refs || []).filter(asset => asset.type === "image" && asset.url).slice(0, this.maxRefs);
    const imageUrls = refs.map(asset => asset.url);
    const voiceId = String(row.voiceId || "").trim();
    const subjects = refs.map((asset, index) => {
      const id = String(index + 1);
      const subject = {
        id,
        subject_id: id,
        reference_id: id,
        name: id,
        images: [asset.url]
      };
      if (voiceId) subject.voice_id = voiceId;
      return subject;
    });
    const references = refs.map((asset, index) => {
      const id = String(index + 1);
      return {
        id,
        subject_id: id,
        type: "image",
        url: asset.url,
        image: asset.url,
        image_url: asset.url
      };
    });
    const payload = {
      generate_mode: "reference_to_video",
      model: row.version,
      model_name: row.version,
      model_version: row.version,
      version: row.version,
      subjects,
      references,
      images: imageUrls,
      image_urls: imageUrls,
      reference_images: imageUrls,
      reference_image_urls: imageUrls,
      subject_images: imageUrls,
      subject_image_urls: imageUrls,
      first_frame_image: imageUrls[0] || "",
      first_frame_image_url: imageUrls[0] || "",
      last_frame_image: imageUrls[1] || "",
      last_frame_image_url: imageUrls[1] || "",
      prompt: row.prompt,
      audio: true,
      audio_type: "all",
      duration: Number(row.duration || 5),
      aspect_ratio: resolvedViduRefSize(row) || undefined,
      resolution: row.quality || "720p",
      off_peak: Boolean(row.offPeak)
    };
    if (voiceId) payload.voice_id = voiceId;
    if (String(row.seed || "").trim()) payload.seed = Number(row.seed);
    return payload;
  }
};

const MOTION_MODELS = {
  kling: {
    label: "可灵 Kling",
    endpoint: "/kling_motion_control",
    queryEndpoint: "/kling_motion_control_query",
    async: true,
    versions: [
      { label: "Kling 3.0", value: "kling-v3" },
      { label: "Kling 2.6", value: "kling-v2-6" }
    ],
    sizes: ["16:9", "9:16", "1:1"],
    qualities: ["std", "pro"],
    build(row) {
      const imageUrl = assetUrl(row.image);
      const videoUrl = assetUrl(row.video);
      return {
        prompt: row.prompt || "",
        model_name: row.version,
        image: imageUrl,
        image_url: imageUrl,
        image_path: imageUrl,
        reference_image: imageUrl,
        reference_image_url: imageUrl,
        video: videoUrl,
        video_url: videoUrl,
        video_path: videoUrl,
        reference_video: videoUrl,
        reference_video_url: videoUrl,
        motion_video_url: videoUrl,
        aspect_ratio: row.size || "16:9",
        ratio: row.size || "16:9",
        mode: row.quality || "std"
      };
    }
  },
  runninghub: {
    label: "RunningHub 动作模仿",
    get endpoint() {
      return runningHubMotionConfig().endpoint || DEFAULT_RUNNINGHUB_MOTION_CONFIG.endpoint;
    },
    get queryEndpoint() {
      return runningHubMotionConfig().queryEndpoint || DEFAULT_RUNNINGHUB_MOTION_CONFIG.queryEndpoint;
    },
    async: true,
    versions: [{ label: "RunningHub", value: "" }],
    sizes: ["16:9", "9:16", "1:1"],
    qualities: ["默认"],
    build(row) {
      return buildRunningHubMotionPayload(row);
    },
    validate(row) {
      const config = runningHubMotionConfig();
      if (!String(config.webappId || "").trim()) return "请先在全局 RunningHub 配置里填写 webappId";
      if (!String(config.endpoint || "").trim()) return "请先在全局 RunningHub 配置里填写提交接口";
      if (/^\/api\/runninghub\/run/i.test(String(config.endpoint || "")) && !runningHubMotionApiKey()) return "请先在 RunningHub 配置窗口里填写 API Key";
      return "";
    }
  },
  jimeng: {
    label: "即梦动作模仿",
    endpoint: "/jimeng_motion_control",
    queryEndpoint: "/jimeng_motion_control_query",
    endpointCandidates: [
      { endpoint: "/jimeng_motion_control", queryEndpoint: "/jimeng_motion_control_query" },
      { endpoint: "/jimeng_action_control", queryEndpoint: "/jimeng_action_control_query" },
      { endpoint: "/jimeng_motion", queryEndpoint: "/jimeng_motion_query" },
      { endpoint: "/jimeng_action", queryEndpoint: "/jimeng_action_query" },
      { endpoint: "/jimeng_video_motion", queryEndpoint: "/jimeng_video_motion_query" }
    ],
    async: true,
    versions: [
      { label: "动作模仿 2.0", value: "jimeng-motion-2.0" },
      { label: "动作模仿", value: "jimeng-motion" }
    ],
    sizes: ["16:9", "9:16", "1:1"],
    qualities: ["720p", "1080p"],
    build(row) {
      const imageUrl = assetUrl(row.image);
      const videoUrl = assetUrl(row.video);
      return {
        prompt: row.prompt || "",
        model_name: row.version,
        image: imageUrl,
        image_url: imageUrl,
        image_path: imageUrl,
        reference_image: imageUrl,
        reference_image_url: imageUrl,
        video: videoUrl,
        video_url: videoUrl,
        video_path: videoUrl,
        reference_video: videoUrl,
        reference_video_url: videoUrl,
        motion_video_url: videoUrl,
        ratio: row.size || "16:9",
        aspect_ratio: row.size || "16:9",
        resolution: row.quality || "720p"
      };
    }
  }
};

const AVATAR_MODELS = {
  jimeng: {
    label: "即梦数字人",
    endpoint: "/jimeng_avatar",
    queryEndpoint: "/jimeng_avatar_query",
    endpointCandidates: [
      { endpoint: "/jimeng_avatar", queryEndpoint: "/jimeng_avatar_query" },
      { endpoint: "/jimeng_omnihuman", queryEndpoint: "/jimeng_omnihuman_query" },
      { endpoint: "/omnihuman", queryEndpoint: "/omnihuman_query" },
      { endpoint: "/omnihuman_generate", queryEndpoint: "/omnihuman_generate_query" },
      { endpoint: "/jimeng_digital_human", queryEndpoint: "/jimeng_digital_human_query" }
    ],
    async: true,
    versions: [{ label: "OmniHuman 1.5", value: "omnihuman-1.5" }],
    build(row) {
      const imageUrl = assetUrl(row.image);
      const audioUrl = assetUrl(row.audio);
      return {
        prompt: row.prompt || "",
        model_name: row.version,
        image: imageUrl,
        image_url: imageUrl,
        image_path: imageUrl,
        reference_image: imageUrl,
        reference_image_url: imageUrl,
        input_image: imageUrl,
        audio: audioUrl,
        audio_url: audioUrl,
        audio_path: audioUrl,
        voice: audioUrl,
        voice_url: audioUrl,
        input_audio: audioUrl
      };
    }
  },
  kling: {
    label: "可灵数字人",
    endpoint: "/kling_avatar",
    queryEndpoint: "/kling_avatar_query",
    endpointCandidates: [
      { endpoint: "/kling_avatar", queryEndpoint: "/kling_avatar_query" },
      { endpoint: "/kling/avatar", queryEndpoint: "/kling/avatar_query" },
      { endpoint: "/kling_digital_human", queryEndpoint: "/kling_digital_human_query" },
      { endpoint: "/kling_avatar_video", queryEndpoint: "/kling_avatar_video_query" }
    ],
    async: true,
    versions: [{ label: "Kling Avatar", value: "kling-avatar" }],
    build(row) {
      const imageUrl = assetUrl(row.image);
      const audioUrl = assetUrl(row.audio);
      return {
        prompt: row.prompt || "",
        model_name: row.version,
        image: imageUrl,
        image_url: imageUrl,
        image_path: imageUrl,
        reference_image: imageUrl,
        reference_image_url: imageUrl,
        audio: audioUrl,
        audio_url: audioUrl,
        audio_path: audioUrl,
        voice_url: audioUrl,
        resolution: row.quality || "1080p",
        quality: row.quality || "1080p",
        mode: row.mode || "pro"
      };
    }
  }
};

const SUNO_MODELS = ["V5_5", "V5", "V4_5PLUS", "V4_5ALL", "V4_5", "V4"];
const SUNO_ADVANCED_AUDIO_MODELS = ["V5_5", "V5", "V4_5PLUS"];
const SUNO_OPERATIONS = {
  generate: {
    label: "生成音乐",
    endpoint: "/generate",
    queryEndpoint: "/generate/record-info",
    resultType: "audio"
  },
  extend: {
    label: "延长音乐",
    endpoint: "/generate/extend",
    queryEndpoint: "/generate/record-info",
    resultType: "audio"
  },
  addInstrumental: {
    label: "添加伴奏",
    endpoint: "/generate/add-instrumental",
    queryEndpoint: "/generate/record-info",
    resultType: "audio"
  },
  addVocals: {
    label: "添加人声",
    endpoint: "/generate/add-vocals",
    queryEndpoint: "/generate/record-info",
    resultType: "audio"
  },
  removeVocals: {
    label: "人声消除",
    endpoint: "/vocal-removal/generate",
    queryEndpoint: "/vocal-removal/record-info",
    resultType: "audio"
  },
  separateVocals: {
    label: "人声分离",
    endpoint: "/vocal-removal/generate",
    queryEndpoint: "/vocal-removal/record-info",
    resultType: "audio"
  },
  midi: {
    label: "音频生成 MIDI",
    endpoint: "/midi/generate",
    queryEndpoint: "/midi/record-info",
    resultType: "other"
  }
};

const VIDU_VOICE_ENDPOINT_CANDIDATES = [
  "/ent/v2/audio-clone",
  "/v2/audio-clone",
  "/vidu/ent/v2/audio-clone",
  "/vidu_audio_clone",
  "/vidu_voice_clone",
  "/vidu/audio-clone",
  "/vidu/audio_clone",
  "/vidu/voice-clone",
  "/vidu_clone_voice",
  "/audio-clone"
];

const SUBJECT_MODEL_CONFIGS = {
  vidu: {
    label: "Vidu",
    endpointCandidates: [
      "/vidu_subject_create",
      "/vidu_subject",
      "/vidu/create-subject",
      "/vidu/subject",
      "/vidu_reference_subject",
      "/vidu_entity_create"
    ],
    rules: [
      "主体图片：建议上传清晰主体图，可多张；如果后端要求单张，会优先使用第一张。",
      "主体视频：可选，用于补充主体动态/外观信息；若官方接口不支持，后端可忽略。",
      "声音：可选，用于音色主体；已克隆的 voice_id 后续可继续填到 Vidu 参考生视频。",
      "创建成功后会解析 subject_id / voice_id / resource_id 等字段并存入主体库。"
    ]
  },
  kling: {
    label: "可灵",
    endpointCandidates: [
      "/kling_subject_create",
      "/kling_subject",
      "/kling/create-subject",
      "/kling/subject",
      "/kling_character_create",
      "/kling_virtual_subject"
    ],
    rules: [
      "主体图片：建议 1-4 张清晰正脸/半身/全身图，主体不要被遮挡。",
      "主体视频：可选，建议清晰、稳定、主体完整出现。",
      "声音：可选，用于可灵音色主体；如果后端未接音色主体接口，会只返回普通主体 ID。",
      "可灵主体和可灵音色主体可能是两个不同 ID，页面会分别保存。"
    ]
  }
};

const SUBJECT_TYPES = [
  ["person", "人物"],
  ["animal", "动物"],
  ["object", "物品"],
  ["style", "风格/形象"],
  ["voice", "音色"],
  ["other", "其他"]
];

const TASK_PAGES = [
  { id: "subjectLibrary", label: "主体库", ready: true },
  { id: "viduVoice", label: "Vidu声音克隆", ready: true },
  { id: "viduRef", label: "Vidu参考生视频", ready: true },
  { id: "avatar", label: "数字人", ready: true },
  { id: "image", label: "生图", ready: true },
  { id: "imageVideo", label: "图文生视频", ready: false },
  { id: "motion", label: "动作模仿", ready: false },
  { id: "videoEdit", label: "视频编辑", ready: false },
  { id: "multiVideo", label: "多模态生视频", ready: false },
  { id: "music", label: "音乐生成", ready: false },
  { id: "history", label: "历史缓存池", ready: true }
];

const multiVideoPage = TASK_PAGES.find(page => page.id === "multiVideo");
if (multiVideoPage) {
  multiVideoPage.label = "多模态生视频";
  multiVideoPage.ready = true;
}
const imageVideoPage = TASK_PAGES.find(page => page.id === "imageVideo");
if (imageVideoPage) {
  imageVideoPage.label = "图文生视频";
  imageVideoPage.ready = true;
}

const motionPage = TASK_PAGES.find(page => page.id === "motion");
if (motionPage) {
  motionPage.label = "动作模仿";
  motionPage.ready = true;
}

const musicPage = TASK_PAGES.find(page => page.id === "music");
if (musicPage) {
  musicPage.label = "音乐生成";
  musicPage.ready = true;
}

const LOCKED_TASK_PAGE_IDS = new Set(["subjectLibrary", "viduVoice", "viduRef", "videoEdit", "music"]);
TASK_PAGES.forEach(page => {
  if (LOCKED_TASK_PAGE_IDS.has(page.id)) page.ready = false;
});

const state = {
  activePage: localStorage.getItem(STORAGE_KEYS.activePage) || "image",
  rows: normalizeRows(loadJson(STORAGE_KEYS.imageRows, null)),
  imageVideoRows: normalizeImageVideoRows(loadJson(STORAGE_KEYS.imageVideoRows, null)),
  motionRows: normalizeMotionRows(loadJson(STORAGE_KEYS.motionRows, null)),
  multiRows: normalizeMultiRows(loadJson(STORAGE_KEYS.multiVideoRows, null)),
  viduRefRows: normalizeViduRefRows(loadJson(STORAGE_KEYS.viduRefRows, null)),
  avatarRows: normalizeAvatarRows(loadJson(STORAGE_KEYS.avatarRows, null)),
  musicTool: ["suno", "minimax"].includes(localStorage.getItem(STORAGE_KEYS.musicTool)) ? localStorage.getItem(STORAGE_KEYS.musicTool) : "suno",
  sunoState: normalizeSunoState(loadJson(STORAGE_KEYS.sunoState, null)),
  viduVoiceState: normalizeViduVoiceState(loadJson(STORAGE_KEYS.viduVoiceState, null)),
  subjectTab: ["create", "library"].includes(localStorage.getItem(STORAGE_KEYS.subjectTab)) ? localStorage.getItem(STORAGE_KEYS.subjectTab) : "create",
  subjectCreateState: normalizeSubjectCreateState(loadJson(STORAGE_KEYS.subjectCreateState, null)),
  subjectLibrary: normalizeSubjectLibrary(loadJson(STORAGE_KEYS.subjectLibrary, [])),
  runningHubMotionConfig: normalizeRunningHubMotionSettings(loadJson(STORAGE_KEYS.runningHubMotionConfig, null)),
  uploadHistory: [],
  generationHistory: [],
  generationFavorites: new Set(loadJson(STORAGE_KEYS.generationFavorites, [])),
  queue: [],
  running: 0,
  imageVideoQueue: [],
  imageVideoRunning: 0,
  motionQueue: [],
  motionRunning: 0,
  multiQueue: [],
  multiRunning: 0,
  viduRefQueue: [],
  viduRefRunning: 0,
  avatarQueue: [],
  avatarRunning: 0,
  copiedImages: [],
  resumeQueue: [],
  resumeRunning: 0,
  copiedRefs: [],
  choosingRowId: null,
  assetFilter: "image",
  historyTab: ["uploads", "generations"].includes(localStorage.getItem(STORAGE_KEYS.historyTab)) ? localStorage.getItem(STORAGE_KEYS.historyTab) : "uploads",
  historyType: HISTORY_TYPES.includes(localStorage.getItem(STORAGE_KEYS.historyType)) ? localStorage.getItem(STORAGE_KEYS.historyType) : "image",
  historyModel: localStorage.getItem(STORAGE_KEYS.historyModel) || "all",
  historySize: localStorage.getItem(STORAGE_KEYS.historySize) || "all",
  historySearch: localStorage.getItem(STORAGE_KEYS.historySearch) || "",
  historyFavoritesOnly: localStorage.getItem(STORAGE_KEYS.historyFavoritesOnly) === "1",
  historyPage: 1,
  historyOpenGenerationGroup: "",
  selectedUploadIds: new Set(),
  selectedGenerationIds: new Set(),
  batchImages: [],
  batchDefaults: null,
  pasteTarget: null,
  scrollToImageRowId: null,
  scrollToImageVideoRowId: null,
  scrollToMotionRowId: null,
  scrollToMultiRowId: null,
  scrollToViduRefRowId: null,
  scrollToAvatarRowId: null,
  runningHubMotionConfigOpen: false,
  runningHubMotionConfigUrl: "",
  runningHubMotionConfigPayload: "",
  runningHubMotionConfigWorkflowType: "motion",
  runningHubMotionConfigMessage: ""
};

const app = document.querySelector("#app");
app.addEventListener("click", event => {
  const copyButton = event.target.closest(".copy-row-error");
  if (!copyButton || !app.contains(copyButton)) return;
  copyPromptText(copyButton.dataset.rowError || "");
});
const assetDialog = document.querySelector("#assetDialog");
const assetDialogGrid = document.querySelector("#assetDialogGrid");
const pasteDialog = document.querySelector("#pasteDialog");
const pasteText = document.querySelector("#pasteText");
const confirmPasteBtn = document.querySelector("#confirmPasteBtn");
const batchModel = document.querySelector("#batchModel");
const batchVersion = document.querySelector("#batchVersion");
const batchSize = document.querySelector("#batchSize");
const batchQuality = document.querySelector("#batchQuality");
const batchCount = document.querySelector("#batchCount");
const batchImageDrop = document.querySelector("#batchImageDrop");
const batchChooseAssets = document.querySelector("#batchChooseAssets");
const batchCopyImages = document.querySelector("#batchCopyImages");
const batchUploadImages = document.querySelector("#batchUploadImages");
const batchPasteImages = document.querySelector("#batchPasteImages");
const batchClearImages = document.querySelector("#batchClearImages");
const IMAGE_CLIPBOARD_PREFIX = "__API_BATCH_IMAGE_ASSETS__:";

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function normalizeRunningHubMotionConfig(value) {
  const source = value && typeof value === "object" ? value : {};
  const webappId = String(source.webappId || extractRunningHubAppId(source.sourceUrl || "", source) || DEFAULT_RUNNINGHUB_MOTION_CONFIG.webappId);
  return {
    ...DEFAULT_RUNNINGHUB_MOTION_CONFIG,
    ...source,
    id: String(source.id || `rh_motion_${webappId || Date.now()}`),
    title: String(source.title || source.name || (webappId ? `RunningHub ${webappId}` : DEFAULT_RUNNINGHUB_MOTION_CONFIG.title)),
    source: source.source || (source.nodeInfoList ? "imported" : "manual"),
    workflowType: source.workflowType || DEFAULT_RUNNINGHUB_MOTION_CONFIG.workflowType,
    webappId,
    endpoint: normalizeEndpointPath(source.endpoint || DEFAULT_RUNNINGHUB_MOTION_CONFIG.endpoint),
    queryEndpoint: normalizeEndpointPath(source.queryEndpoint || DEFAULT_RUNNINGHUB_MOTION_CONFIG.queryEndpoint),
    usePersonalQueue: Boolean(source.usePersonalQueue ?? DEFAULT_RUNNINGHUB_MOTION_CONFIG.usePersonalQueue),
    pose3Neck: Boolean(source.pose3Neck ?? DEFAULT_RUNNINGHUB_MOTION_CONFIG.pose3Neck),
    cameraEnabled: Boolean(source.cameraEnabled ?? DEFAULT_RUNNINGHUB_MOTION_CONFIG.cameraEnabled),
    helmetMode: Boolean(source.helmetMode ?? DEFAULT_RUNNINGHUB_MOTION_CONFIG.helmetMode),
    customRatioEnabled: Boolean(source.customRatioEnabled ?? DEFAULT_RUNNINGHUB_MOTION_CONFIG.customRatioEnabled)
  };
}

function normalizeRunningHubMotionSettings(value) {
  if (value && typeof value === "object" && Array.isArray(value.configs)) {
    const configs = value.configs.map(normalizeRunningHubMotionConfig);
    const fallback = normalizeRunningHubMotionConfig(null);
    const safeConfigs = configs.length ? configs : [fallback];
    const activeId = safeConfigs.some(item => item.id === value.activeId) ? value.activeId : safeConfigs[0].id;
    const apiKey = String(value.apiKey || safeConfigs.find(item => item.apiKey)?.apiKey || "");
    safeConfigs.forEach(item => { delete item.apiKey; });
    return { apiKey, activeId, configs: safeConfigs };
  }
  const migrated = normalizeRunningHubMotionConfig(value);
  const apiKey = String(value?.apiKey || "");
  delete migrated.apiKey;
  return { apiKey, activeId: migrated.id, configs: [migrated] };
}

function parseJsonLoose(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    const first = raw.indexOf("{");
    const last = raw.lastIndexOf("}");
    if (first >= 0 && last > first) {
      return JSON.parse(raw.slice(first, last + 1));
    }
    throw new Error("Payload 不是有效 JSON");
  }
}

function extractRunningHubAppId(url, payload) {
  const direct = payload?.webappId || payload?.appId || payload?.workflowId || payload?.webapp_id || "";
  if (direct) return String(direct);
  const text = String(url || "");
  const patterns = [
    /ai-detail\/(\d+)/i,
    /run\/ai-app\/(\d+)/i,
    /webappId[=/](\d+)/i,
    /appId[=/](\d+)/i,
    /(\d{10,})/
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1];
  }
  return "";
}

function normalizeRunningHubNodeInfoList(payload) {
  const list = Array.isArray(payload)
    ? payload
    : payload?.nodeInfoList || payload?.inputs || payload?.data?.nodeInfoList || payload?.data?.inputs || [];
  if (!Array.isArray(list)) return [];
  return list.map(item => {
    const normalized = {
      nodeId: String(item?.nodeId ?? item?.node_id ?? ""),
      nodeName: String(item?.nodeName ?? item?.node_name ?? ""),
      fieldName: String(item?.fieldName ?? item?.field_name ?? ""),
      fieldValue: item?.fieldValue ?? item?.field_value ?? "",
      description: String(item?.description ?? ""),
      binding: String(item?.binding || item?.dynamicBinding || "")
    };
    normalized.binding = RUNNINGHUB_NODE_BINDINGS[normalized.binding] ? normalized.binding : inferRunningHubNodeBinding(normalized);
    return normalized;
  }).filter(item => item.nodeId && item.fieldName);
}

function buildRunningHubConfigFromImport(url, payloadText, workflowType = "motion") {
  const payload = parseJsonLoose(payloadText);
  const webappId = extractRunningHubAppId(url, payload);
  if (!webappId) throw new Error("没有从网页链接或 Payload 里识别到 webappId");
  const nodeInfoList = normalizeRunningHubNodeInfoList(payload);
  if (!nodeInfoList.length) throw new Error("Payload 中没有识别到参数列表。支持直接粘贴数组，或包含 inputs/nodeInfoList 的 JSON。");
  return normalizeRunningHubMotionConfig({
    ...DEFAULT_RUNNINGHUB_MOTION_CONFIG,
    id: uid("rh_motion"),
    title: `RunningHub ${webappId}`,
    source: "imported",
    workflowType: RUNNINGHUB_WORKFLOW_TYPES[workflowType] ? workflowType : "motion",
    webappId,
    sourceUrl: String(url || ""),
    endpoint: "/api/runninghub/run",
    queryEndpoint: "/api/runninghub/query",
    clientId: String(payload.clientId || DEFAULT_RUNNINGHUB_MOTION_CONFIG.clientId),
    instanceType: String(payload.instanceType || DEFAULT_RUNNINGHUB_MOTION_CONFIG.instanceType),
    usePersonalQueue: Boolean(payload.usePersonalQueue ?? DEFAULT_RUNNINGHUB_MOTION_CONFIG.usePersonalQueue),
    retainSeconds: payload.retainSeconds ?? "",
    webhookUrl: payload.webhookUrl || "",
    nodeInfoList: JSON.stringify(nodeInfoList, null, 2)
  });
}

function runningHubMotionSettings() {
  if (!state.runningHubMotionConfig || !Array.isArray(state.runningHubMotionConfig.configs)) {
    state.runningHubMotionConfig = normalizeRunningHubMotionSettings(state.runningHubMotionConfig);
  }
  return state.runningHubMotionConfig;
}

function runningHubMotionConfig() {
  const settings = runningHubMotionSettings();
  return settings.configs.find(item => item.id === settings.activeId) || settings.configs[0];
}

function runningHubMotionApiKey() {
  return String(runningHubMotionSettings().apiKey || "");
}

function persistRunningHubMotionConfig() {
  state.runningHubMotionConfig = normalizeRunningHubMotionSettings(state.runningHubMotionConfig);
  saveJson(STORAGE_KEYS.runningHubMotionConfig, state.runningHubMotionConfig);
}

function saveJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

let historyDbPromise = null;
let localHistoryBackupTimer = 0;

function openHistoryDb() {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  if (historyDbPromise) return historyDbPromise;
  historyDbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(HISTORY_IDB_NAME, HISTORY_IDB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(HISTORY_IDB_STORE)) {
        db.createObjectStore(HISTORY_IDB_STORE, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB open failed"));
  }).catch(error => {
    console.warn("IndexedDB history storage unavailable", error);
    return null;
  });
  return historyDbPromise;
}

async function readHistoryDb(key, fallback) {
  const db = await openHistoryDb();
  if (!db) return fallback;
  return new Promise(resolve => {
    const tx = db.transaction(HISTORY_IDB_STORE, "readonly");
    const store = tx.objectStore(HISTORY_IDB_STORE);
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result ? request.result.value : fallback);
    request.onerror = () => resolve(fallback);
  });
}

async function writeHistoryDb(key, value) {
  const db = await openHistoryDb();
  if (!db) {
    const legacyKey = key === HISTORY_IDB_KEYS.uploadHistory ? STORAGE_KEYS.uploadHistory : key === HISTORY_IDB_KEYS.generationHistory ? STORAGE_KEYS.generationHistory : "";
    if (legacyKey && (!Array.isArray(value) || value.length > 0)) saveJson(legacyKey, value);
    return;
  }
  return new Promise(resolve => {
    const tx = db.transaction(HISTORY_IDB_STORE, "readwrite");
    const store = tx.objectStore(HISTORY_IDB_STORE);
    store.put({ key, value, updatedAt: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

async function readLocalHistoryBackup() {
  if (location.protocol === "file:") return { uploadHistory: [], generationHistory: [] };
  try {
    const response = await fetch(`${LOCAL_HISTORY_BACKUP_ENDPOINT}?v=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) return { uploadHistory: [], generationHistory: [] };
    const json = await response.json();
    return {
      uploadHistory: Array.isArray(json.uploadHistory) ? json.uploadHistory : [],
      generationHistory: Array.isArray(json.generationHistory) ? json.generationHistory : []
    };
  } catch (error) {
    console.warn("Local history backup unavailable", error);
    return { uploadHistory: [], generationHistory: [] };
  }
}

async function writeLocalHistoryBackup() {
  if (location.protocol === "file:") return;
  const uploadHistory = Array.isArray(state.uploadHistory) ? state.uploadHistory : [];
  const generationHistory = Array.isArray(state.generationHistory) ? state.generationHistory : [];
  if (!uploadHistory.length && !generationHistory.length) return;
  try {
    await fetch(LOCAL_HISTORY_BACKUP_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uploadHistory, generationHistory })
    });
  } catch (error) {
    console.warn("Local history backup write failed", error);
  }
}

function scheduleLocalHistoryBackup() {
  clearTimeout(localHistoryBackupTimer);
  localHistoryBackupTimer = window.setTimeout(() => {
    writeLocalHistoryBackup();
  }, 700);
}

function mergeUploadHistoryLists(...lists) {
  const map = new Map();
  normalizeAssets(lists.flat()).forEach(item => {
    if (!item || !item.url) return;
    const existing = map.get(item.url);
    if (!existing || Number(item.createdAt || 0) >= Number(existing.createdAt || 0)) {
      map.set(item.url, item);
    }
  });
  return Array.from(map.values()).sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
}

function mergeGenerationHistoryLists(...lists) {
  const map = new Map();
  normalizeGenerations(lists.flat()).forEach(record => {
    const key = record.id || [
      record.taskId,
      record.page,
      record.model,
      record.version,
      record.size,
      record.quality,
      record.duration,
      record.prompt,
      JSON.stringify(record.results || [])
    ].join("|");
    const existing = map.get(key);
    if (!existing || Number(record.createdAt || 0) >= Number(existing.createdAt || 0)) {
      map.set(key, record);
    }
  });
  return Array.from(map.values()).sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
}

function loadHistoryRecoveryCandidates(kind) {
  const lists = [];
  const knownKeys = kind === "upload"
    ? [STORAGE_KEYS.uploadHistory, "api_console_stable_single_add_row_upload_history_v2"]
    : [STORAGE_KEYS.generationHistory, "api_console_stable_single_add_row_generation_history_v2"];
  const seen = new Set();
  const inspectKey = key => {
    if (!key || seen.has(key)) return;
    seen.add(key);
    const value = readLocalStorageJsonValue(key);
    if (!Array.isArray(value)) return;
    if (kind === "upload" && looksLikeUploadHistory(value)) lists.push(value);
    if (kind === "generation" && looksLikeGenerationHistory(value)) lists.push(value);
  };
  knownKeys.forEach(inspectKey);
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (/history/i.test(key || "")) inspectKey(key);
  }
  return lists;
}

function readLocalStorageJsonValue(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function looksLikeUploadHistory(value) {
  return Array.isArray(value) && value.some(item => assetUrl(item) && !Array.isArray(item?.results) && !item?.prompt && !item?.taskId && !item?.model);
}

function looksLikeGenerationHistory(value) {
  return Array.isArray(value) && value.some(item => Array.isArray(item?.results) || item?.result || (item?.taskId && item?.prompt));
}

function pruneUploadHistory(records) {
  const counts = {};
  return normalizeAssets(records)
    .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
    .filter(item => {
      const type = HISTORY_TYPES.includes(item.type) ? item.type : "other";
      counts[type] = (counts[type] || 0) + 1;
      return counts[type] <= HISTORY_RETENTION_PER_TYPE;
    });
}

function pruneGenerationHistory(records) {
  const counts = {};
  return normalizeGenerations(records)
    .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
    .filter(record => {
      const firstResult = (record.results || []).find(Boolean);
      const type = HISTORY_TYPES.includes(guessType(typeof firstResult === "string" ? firstResult : firstResult?.url || "")) ? guessType(typeof firstResult === "string" ? firstResult : firstResult?.url || "") : "other";
      const hasFavorite = (record.results || []).some((_, index) => state.generationFavorites.has(generationResultKey(record.id, index)));
      if (hasFavorite) return true;
      counts[type] = (counts[type] || 0) + 1;
      return counts[type] <= HISTORY_RETENTION_PER_TYPE;
    });
}

function persistUploadHistory() {
  state.uploadHistory = pruneUploadHistory(state.uploadHistory);
  writeHistoryDb(HISTORY_IDB_KEYS.uploadHistory, state.uploadHistory);
  scheduleLocalHistoryBackup();
}

function persistGenerationHistory() {
  state.generationHistory = pruneGenerationHistory(state.generationHistory);
  writeHistoryDb(HISTORY_IDB_KEYS.generationHistory, state.generationHistory);
  scheduleLocalHistoryBackup();
}

async function initializeHistoryStorage() {
  const [storedUploads, storedGenerations, localBackup] = await Promise.all([
    readHistoryDb(HISTORY_IDB_KEYS.uploadHistory, null),
    readHistoryDb(HISTORY_IDB_KEYS.generationHistory, null),
    readLocalHistoryBackup()
  ]);
  const legacyUploads = loadJson(STORAGE_KEYS.uploadHistory, []);
  const legacyGenerations = loadJson(STORAGE_KEYS.generationHistory, []);
  const backupUploads = Array.isArray(localBackup.uploadHistory) ? localBackup.uploadHistory : [];
  const backupGenerations = Array.isArray(localBackup.generationHistory) ? localBackup.generationHistory : [];
  const hasUploadSource = (Array.isArray(storedUploads) && storedUploads.length > 0) || legacyUploads.length > 0 || backupUploads.length > 0;
  const hasGenerationSource = (Array.isArray(storedGenerations) && storedGenerations.length > 0) || legacyGenerations.length > 0 || backupGenerations.length > 0;
  const uploadSource = mergeUploadHistoryLists(
    Array.isArray(storedUploads) ? storedUploads : [],
    legacyUploads,
    backupUploads
  );
  const generationSource = mergeGenerationHistoryLists(
    Array.isArray(storedGenerations) ? storedGenerations : [],
    legacyGenerations,
    backupGenerations
  );
  state.uploadHistory = pruneUploadHistory(uploadSource);
  state.generationHistory = pruneGenerationHistory(generationSource);
  const writes = [];
  if (hasUploadSource || state.uploadHistory.length > 0) writes.push(writeHistoryDb(HISTORY_IDB_KEYS.uploadHistory, state.uploadHistory));
  if (hasGenerationSource || state.generationHistory.length > 0) writes.push(writeHistoryDb(HISTORY_IDB_KEYS.generationHistory, state.generationHistory));
  await Promise.all(writes);
  if (state.uploadHistory.length || state.generationHistory.length) scheduleLocalHistoryBackup();
}

async function recoverHistoryFromBrowserStorage() {
  const beforeUploads = state.uploadHistory.length;
  const beforeGenerations = state.generationHistory.length;
  const [storedUploads, storedGenerations] = await Promise.all([
    readHistoryDb(HISTORY_IDB_KEYS.uploadHistory, []),
    readHistoryDb(HISTORY_IDB_KEYS.generationHistory, [])
  ]);
  const uploadCandidates = loadHistoryRecoveryCandidates("upload");
  const generationCandidates = loadHistoryRecoveryCandidates("generation");
  state.uploadHistory = pruneUploadHistory(mergeUploadHistoryLists(
    state.uploadHistory,
    Array.isArray(storedUploads) ? storedUploads : [],
    ...uploadCandidates
  ));
  state.generationHistory = pruneGenerationHistory(mergeGenerationHistoryLists(
    state.generationHistory,
    Array.isArray(storedGenerations) ? storedGenerations : [],
    ...generationCandidates
  ));
  state.selectedUploadIds.clear();
  state.selectedGenerationIds.clear();
  const writes = [];
  if (state.uploadHistory.length > 0) writes.push(writeHistoryDb(HISTORY_IDB_KEYS.uploadHistory, state.uploadHistory));
  if (state.generationHistory.length > 0) writes.push(writeHistoryDb(HISTORY_IDB_KEYS.generationHistory, state.generationHistory));
  await Promise.all(writes);
  if (state.uploadHistory.length || state.generationHistory.length) scheduleLocalHistoryBackup();
  const restoredUploads = Math.max(0, state.uploadHistory.length - beforeUploads);
  const restoredGenerations = Math.max(0, state.generationHistory.length - beforeGenerations);
  const restoreReport = `恢复完成：上传缓存 +${restoredUploads}，生成记录 +${restoredGenerations}`;
  render();
  window.alert(restoredUploads || restoredGenerations ? restoreReport : "当前浏览器存储中没有找到可恢复的历史缓存。请确认是不是换了 localhost/127.0.0.1、端口或浏览器。");
}

async function importHistoryFromLegacyPort() {
  const legacyOrigin = "http://127.0.0.1:4173";
  if (location.origin === legacyOrigin) {
    await recoverHistoryFromBrowserStorage();
    return;
  }
  try {
    const payload = await requestLegacyHistoryBridge(legacyOrigin);
    const beforeUploads = state.uploadHistory.length;
    const beforeGenerations = state.generationHistory.length;
    state.uploadHistory = pruneUploadHistory(mergeUploadHistoryLists(
      state.uploadHistory,
      Array.isArray(payload.uploads) ? payload.uploads : []
    ));
    state.generationHistory = pruneGenerationHistory(mergeGenerationHistoryLists(
      state.generationHistory,
      Array.isArray(payload.generations) ? payload.generations : []
    ));
    state.selectedUploadIds.clear();
    state.selectedGenerationIds.clear();
    const writes = [];
    if (state.uploadHistory.length > 0) writes.push(writeHistoryDb(HISTORY_IDB_KEYS.uploadHistory, state.uploadHistory));
    if (state.generationHistory.length > 0) writes.push(writeHistoryDb(HISTORY_IDB_KEYS.generationHistory, state.generationHistory));
    await Promise.all(writes);
    if (state.uploadHistory.length || state.generationHistory.length) scheduleLocalHistoryBackup();
    const restoredUploads = Math.max(0, state.uploadHistory.length - beforeUploads);
    const restoredGenerations = Math.max(0, state.generationHistory.length - beforeGenerations);
    render();
    window.alert(restoredUploads || restoredGenerations
      ? `已从 4173 导入：上传缓存 +${restoredUploads}，生成记录 +${restoredGenerations}`
      : "4173 旧端口中没有找到可导入的历史缓存。");
  } catch (error) {
    window.alert(`无法从 4173 导入缓存：${error?.message || error}`);
  }
}

function requestLegacyHistoryBridge(origin) {
  return new Promise((resolve, reject) => {
    const iframe = document.createElement("iframe");
    iframe.style.display = "none";
    let done = false;
    let timer = 0;
    const cleanup = () => {
      window.removeEventListener("message", onMessage);
      iframe.remove();
      clearTimeout(timer);
    };
    const finish = (fn, value) => {
      if (done) return;
      done = true;
      cleanup();
      fn(value);
    };
    const onMessage = event => {
      if (event.origin !== origin) return;
      const data = event.data || {};
      if (data.type !== "api-console-history-bridge") return;
      finish(resolve, data);
    };
    timer = window.setTimeout(() => {
      finish(reject, new Error("4173 桥接页没有响应，请确认 4173 服务已启动"));
    }, 10000);
    window.addEventListener("message", onMessage);
    iframe.src = `${origin}/history-bridge.html?v=${Date.now()}`;
    document.body.appendChild(iframe);
  });
}

function uid(prefix = "id") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function defaultRows() {
  return [createRow(), createRow()];
}

function normalizeRows(value) {
  if (!Array.isArray(value) || value.length === 0) return defaultRows();
  return value.map(item => {
    const model = IMAGE_MODELS[item?.model] ? item.model : "nano";
    const config = IMAGE_MODELS[model];
    const row = createRow({
      ...item,
      model,
      images: normalizeAssets(item?.images || refsToAssets(item?.refs)),
      taskIds: Array.isArray(item?.taskIds) ? item.taskIds : item?.taskId ? [item.taskId] : [],
      results: Array.isArray(item?.results) ? item.results : item?.result ? [item.result] : []
    });
    row.version = config.versions.some(version => version.value === row.version) ? row.version : config.versions[0].value;
    row.size = config.sizes.includes(row.size) ? row.size : (config.sizes[0] || "");
    row.quality = config.qualities.includes(row.quality) ? row.quality : (config.qualities[1] || config.qualities[0] || "");
    if (model === "gpt") {
      row.version = "gpt-image-2";
      row.quality = normalizeGptQualityChoice(item?.quality || item?.version || row.quality);
      row.size = normalizeGptRatioChoice(item?.size || row.size);
    } else if (model === "seedream") {
      row.quality = normalizeSeedreamQuality(item?.quality || row.quality, row.version);
    } else if (model === "klingOmni") {
      row.quality = normalizeKlingResolution(item?.quality || row.quality);
    }
    row.status = VALID_ROW_STATUSES.includes(row.status) ? row.status : "pending";
    row.count = Math.max(1, Number(row.count || 1));
    recoverInterruptedRow(row);
    return row;
  });
}

function recoverInterruptedRow(row) {
  const wasActive = ["queued", "running", "partial"].includes(row.status);
  const wasAutoFailed = row.status === "failed" && /\u9875\u9762\u5237\u65b0(?:\u6216\u4efb\u52a1)?\u4e2d\u65ad/.test(row.error || "");
  const knownRemoteTasks = remoteTasksForRow(row);
  const wasLegacyReleased = row.status === "pending"
    && knownRemoteTasks.length > 0
    && /\u9875\u9762\u5237\u65b0\u4e2d\u65ad\u672c\u5730\u961f\u5217/.test(row.error || "");
  if (!wasActive && !wasAutoFailed && !wasLegacyReleased) return;
  const hadResults = Array.isArray(row.results) && row.results.length > 0;
  const lastActivityAt = Number(row.lastActivityAt || row.startedAt || 0);
  const isActuallyTimedOut = wasActive && lastActivityAt && Date.now() - lastActivityAt > TASK_TIMEOUT_MS;
  const completedTaskIds = new Set((Array.isArray(row.completedTaskIds) ? row.completedTaskIds : []).map(String));
  const resumableTasks = knownRemoteTasks.filter(task => !completedTaskIds.has(String(task.taskId)));
  row.queuedJobs = 0;
  row.runningJobs = 0;
  row.runToken = "";
  row.cancelRequested = false;
  row.lastActivityAt = 0;
  delete row.resumeRemoteTasks;
  delete row.recoveryMissingJobs;
  if (isActuallyTimedOut) {
    row.error = hadResults ? "\u4efb\u52a1\u8d85\u65f6\uff0c\u5269\u4f59\u4efb\u52a1\u5df2\u5224\u5b9a\u5931\u8d25" : "\u4efb\u52a1\u8d85\u65f6\uff0c\u5df2\u5224\u5b9a\u4e3a\u751f\u6210\u5931\u8d25";
    row.status = hadResults ? "partial" : "failed";
    row.totalJobs = row.totalJobs || row.count || 1;
    row.finishedJobs = Math.max(row.finishedJobs || 0, row.totalJobs);
    row.canceledJobs = 0;
    return;
  }
  if (resumableTasks.length > 0) {
    const completedCount = completedTaskIds.size;
    const requestedTotal = Math.max(Number(row.totalJobs || 0), Number(row.count || 0), completedCount + resumableTasks.length);
    const missingJobs = Math.max(0, requestedTotal - completedCount - resumableTasks.length);
    row.resumeRemoteTasks = resumableTasks;
    row.recoveryMissingJobs = missingJobs;
    row.totalJobs = requestedTotal;
    row.finishedJobs = completedCount;
    row.canceledJobs = missingJobs;
    row.queuedJobs = resumableTasks.length;
    row.status = hadResults ? "partial" : "queued";
    row.error = missingJobs > 0
      ? `\u9875\u9762\u5237\u65b0\u540e\u7ee7\u7eed\u8f6e\u8be2\u5df2\u53d6\u5f97\u4efb\u52a1 ID \u7684\u4efb\u52a1\uff1b\u53e6\u6709 ${missingJobs} \u4e2a\u672c\u5730\u4efb\u52a1\u672a\u53d6\u5f97\u4efb\u52a1 ID\uff0c\u672a\u81ea\u52a8\u91cd\u65b0\u63d0\u4ea4`
      : "";
    return;
  }
  if (hadResults) {
    row.status = "partial";
    row.error = "\u9875\u9762\u5237\u65b0\u4e2d\u65ad\u672c\u5730\u961f\u5217\uff0c\u5df2\u4fdd\u7559\u5df2\u8fd4\u56de\u7ed3\u679c\uff0c\u4f46\u6ca1\u6709\u53ef\u6062\u590d\u7684\u4efb\u52a1 ID";
    row.totalJobs = row.totalJobs || row.count || row.results.length;
    row.finishedJobs = Math.max(row.finishedJobs || row.results.length, row.results.length);
    row.canceledJobs = Math.max(0, row.totalJobs - row.finishedJobs);
  } else {
    row.status = "pending";
    row.error = "\u9875\u9762\u5237\u65b0\u4e2d\u65ad\u672c\u5730\u961f\u5217\uff0c\u672a\u53d6\u5f97\u4efb\u52a1 ID\uff0c\u5df2\u91ca\u653e\u4e3a\u5f85\u5904\u7406";
    row.totalJobs = 0;
    row.finishedJobs = 0;
    row.canceledJobs = 0;
  }
}

function refsToAssets(refs) {
  if (!Array.isArray(refs)) return [];
  return refs.filter(Boolean).map(url => ({
    id: uid("asset"),
    name: shortUrl(url),
    url,
    preview: url,
    type: "image",
    source: "legacy",
    createdAt: Date.now()
  }));
}

function normalizeAssets(value) {
  if (!Array.isArray(value)) return [];
  return value.map(item => {
    const url = assetUrl(item);
    if (!url) return null;
    return {
    id: item.id || uid("asset"),
    name: item.name || shortUrl(url),
    url,
    preview: assetUrl({ url: item.preview }) || url,
    type: item.type || guessType(url),
    width: item.width,
    height: item.height,
    duration: item.duration,
    size: item.size,
    compressedFrom: item.compressedFrom,
    source: item.source,
    createdAt: item.createdAt || Date.now()
    };
  }).filter(Boolean);
}

function assetUrl(item) {
  if (!item) return "";
  if (typeof item === "string") return item.trim();
  const candidates = [
    item.url,
    item.data,
    item.file_url,
    item.fileUrl,
    item.cdn_url,
    item.cdnUrl,
    item.download_url,
    item.downloadUrl,
    item.path
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
    if (candidate && typeof candidate === "object") {
      const nested = assetUrl(candidate);
      if (nested) return nested;
    }
  }
  return "";
}

function uploadResponseUrl(json) {
  return assetUrl(json?.data || json?.url || json?.file || json?.result || json);
}

function normalizeGenerations(value) {
  if (!Array.isArray(value)) return [];
  return value.map(item => ({
    id: item.id || uid("gen"),
    createdAt: item.createdAt || Date.now(),
    page: item.page || "",
    taskId: item.taskId || "",
    prompt: item.prompt || "",
    model: item.model || "",
    version: item.version || "",
    size: item.size || "",
    quality: item.quality || "",
    duration: item.duration || "",
    seed: item.seed || "",
    returnedSeeds: Array.isArray(item.returnedSeeds) ? item.returnedSeeds : [],
    offPeak: Boolean(item.offPeak),
    voiceId: item.voiceId || "",
    images: normalizeAssets(item.images),
    refs: normalizeAssets(item.refs),
    params: item.params || {},
    results: Array.isArray(item.results) ? item.results : item.url ? [item.url] : []
  }));
}

function normalizeSunoState(value) {
  const activeOperation = SUNO_OPERATIONS[value?.activeOperation] ? value.activeOperation : "generate";
  const operations = {};
  Object.keys(SUNO_OPERATIONS).forEach(key => {
    operations[key] = normalizeSunoOperationState(key, value?.operations?.[key]);
  });
  return { activeOperation, operations };
}

function normalizeViduVoiceState(value = {}) {
  value = value || {};
  const audio = normalizeAssets(value.audio ? [value.audio] : []).filter(asset => asset.type === "audio")[0] || null;
  const promptAudio = normalizeAssets(value.promptAudio ? [value.promptAudio] : []).filter(asset => asset.type === "audio")[0] || null;
  return {
    status: ["idle", "running", "done", "failed"].includes(value.status) ? value.status : "idle",
    audio,
    promptAudio,
    voiceId: value.voiceId || "",
    promptText: value.promptText || "",
    text: value.text || "hello, welcome to vidu API platform.",
    payload: value.payload || "",
    taskId: value.taskId || "",
    returnedVoiceId: value.returnedVoiceId || "",
    demoAudio: value.demoAudio || "",
    resultData: value.resultData || null,
    error: value.error || ""
  };
}

function normalizeSubjectCreateState(value = {}) {
  value = value || {};
  const model = SUBJECT_MODEL_CONFIGS[value.model] ? value.model : "vidu";
  const type = SUBJECT_TYPES.some(([key]) => key === value.type) ? value.type : "person";
  return {
    model,
    status: ["idle", "running", "done", "failed"].includes(value.status) ? value.status : "idle",
    tab: value.tab || "create",
    name: value.name || "",
    type,
    images: normalizeAssets(value.images || []).filter(asset => asset.type === "image"),
    videos: normalizeAssets(value.videos || []).filter(asset => asset.type === "video"),
    audio: normalizeAssets(value.audio ? [value.audio] : []).filter(asset => asset.type === "audio")[0] || null,
    note: value.note || "",
    error: value.error || "",
    resultData: value.resultData || null
  };
}

function normalizeSubjectLibrary(value) {
  if (!Array.isArray(value)) return [];
  return value.map(item => ({
    id: item.id || uid("subject"),
    createdAt: item.createdAt || Date.now(),
    name: item.name || "",
    type: item.type || "person",
    model: item.model || "",
    klingSubjectId: item.klingSubjectId || "",
    klingVoiceSubjectId: item.klingVoiceSubjectId || "",
    viduSubjectId: item.viduSubjectId || "",
    viduVoiceSubjectId: item.viduVoiceSubjectId || "",
    images: normalizeAssets(item.images || []),
    videos: normalizeAssets(item.videos || []),
    audio: normalizeAssets(item.audio ? [item.audio] : []).filter(asset => asset.type === "audio")[0] || null,
    resultData: item.resultData || null
  }));
}

function normalizeSunoOperationState(key, value = {}) {
  return {
    status: ["idle", "running", "done", "failed"].includes(value.status) ? value.status : "idle",
    taskId: value.taskId || "",
    error: value.error || "",
    resultData: value.resultData || null,
    results: Array.isArray(value.results) ? value.results : [],
    form: normalizeSunoForm(key, value.form || {})
  };
}

function normalizeSunoForm(key, form = {}) {
  const defaults = defaultSunoForm(key);
  const next = { ...defaults, ...form };
  next.model = SUNO_MODELS.includes(next.model) ? next.model : defaults.model;
  if (key === "generate") {
    if (next.mode === "lyrics") next.customMode = true;
    if (next.mode === "instrumental") {
      next.customMode = true;
      next.instrumental = true;
    }
    next.customMode = Boolean(next.customMode);
    next.instrumental = Boolean(next.instrumental);
  }
  if (key === "extend") {
    next.defaultParamFlag = Boolean(next.defaultParamFlag);
    next.continueAt = Number.isFinite(Number(next.continueAt)) ? Number(next.continueAt) : 60;
  }
  if (["removeVocals", "separateVocals"].includes(key)) {
    next.separationType = next.separationType === "split_stem" ? "split_stem" : "separate_vocal";
    if (key === "separateVocals") next.separationType = next.separationType || "split_stem";
  }
  if (["addInstrumental", "addVocals", "extend", "removeVocals", "separateVocals", "midi"].includes(key)) {
    next.sourceAudio = normalizeAssets(next.sourceAudio ? [next.sourceAudio] : []).filter(asset => asset.type === "audio")[0] || null;
  }
  return next;
}

function defaultSunoForm(key) {
  const common = {
    model: "V5_5",
    callBackUrl: "https://example.com/suno-callback",
    prompt: "",
    style: "",
    title: "",
    negativeTags: "",
    vocalGender: "",
    styleWeight: "",
    weirdnessConstraint: "",
    audioWeight: "",
    personaId: "",
    personaModel: "style_persona"
  };
  if (key === "generate") {
    return { ...common, customMode: false, instrumental: false };
  }
  if (key === "extend") {
    return { ...common, audioId: "", defaultParamFlag: false, continueAt: 60, sourceAudio: null };
  }
  if (key === "addInstrumental") {
    return { ...common, model: "V5_5", uploadUrl: "", tags: "", sourceAudio: null };
  }
  if (key === "addVocals") {
    return { ...common, model: "V5_5", uploadUrl: "", sourceAudio: null };
  }
  if (key === "removeVocals") {
    return { ...common, taskId: "", audioId: "", separationType: "separate_vocal", sourceAudio: null };
  }
  if (key === "separateVocals") {
    return { ...common, taskId: "", audioId: "", separationType: "split_stem", sourceAudio: null };
  }
  if (key === "midi") {
    return { ...common, taskId: "", audioId: "", sourceAudio: null };
  }
  return common;
}

function guessType(url) {
  if (/\.(png|jpe?g|webp|gif|svg|bmp)(\?|$)/i.test(url)) return "image";
  if (/\.(mp4|webm|mov|avi|mkv)(\?|$)/i.test(url)) return "video";
  if (/\.(mp3|wav|m4a|aac|ogg)(\?|$)/i.test(url)) return "audio";
  return "other";
}

function createRow(seed = {}) {
  const model = seed.model || "nano";
  const config = IMAGE_MODELS[model];
  return {
    id: seed.id || uid("row"),
    selected: seed.selected ?? true,
    status: seed.status || "pending",
    prompt: seed.prompt || "",
    promptExpanded: Boolean(seed.promptExpanded),
    images: seed.images || [],
    model,
    version: seed.version || config.versions[0].value,
    size: seed.size ?? (config.sizes[0] || ""),
    quality: seed.quality ?? (config.qualities[1] || config.qualities[0] || ""),
    count: Math.max(1, Number(seed.count || 1)),
    taskIds: seed.taskIds || [],
    remoteTasks: Array.isArray(seed.remoteTasks) ? seed.remoteTasks : [],
    completedTaskIds: Array.isArray(seed.completedTaskIds) ? seed.completedTaskIds : [],
    results: seed.results || [],
    error: seed.error || "",
    queuedJobs: 0,
    runningJobs: 0,
    finishedJobs: 0,
    totalJobs: 0,
    canceledJobs: 0,
    startedAt: Number(seed.startedAt || 0),
    lastActivityAt: Number(seed.lastActivityAt || 0),
    runToken: seed.runToken || "",
    cancelRequested: Boolean(seed.cancelRequested)
  };
}

function defaultMultiRows() {
  return [createMultiRow()];
}

function defaultViduRefRows() {
  return [createViduRefRow()];
}

function defaultImageVideoRows() {
  return [createImageVideoRow()];
}

function defaultMotionRows() {
  return [createMotionRow()];
}

function defaultAvatarRows() {
  return [createAvatarRow()];
}

function normalizeAvatarRows(value) {
  if (!Array.isArray(value) || value.length === 0) return defaultAvatarRows();
  return value.map(item => {
    const isRhModel = String(item?.model || "").startsWith("rh:");
    const model = isRhModel ? String(item.model) : AVATAR_MODELS[item?.model] ? item.model : "jimeng";
    const config = isRhModel
      ? { versions: [{ value: item?.version || "" }] }
      : AVATAR_MODELS[model];
    const row = createAvatarRow({
      ...item,
      model,
      image: normalizeAssets(item?.image ? [item.image] : []).filter(asset => asset.type === "image")[0] || null,
      audio: normalizeAssets(item?.audio ? [item.audio] : []).filter(asset => asset.type === "audio")[0] || null,
      taskIds: Array.isArray(item?.taskIds) ? item.taskIds : item?.taskId ? [item.taskId] : [],
      results: Array.isArray(item?.results) ? item.results : item?.result ? [item.result] : []
    });
    row.version = config.versions.some(version => version.value === row.version) ? row.version : config.versions[0].value;
    row.status = VALID_ROW_STATUSES.includes(row.status) ? row.status : "pending";
    row.count = Math.max(1, Number(row.count || 1));
    recoverInterruptedRow(row);
    return row;
  });
}

function createAvatarRow(seed = {}) {
  const model = seed.model || "jimeng";
  const config = AVATAR_MODELS[model] || AVATAR_MODELS.jimeng;
  return {
    id: seed.id || uid("avatarrow"),
    selected: seed.selected ?? true,
    status: seed.status || "pending",
    prompt: seed.prompt || "",
    promptExpanded: Boolean(seed.promptExpanded),
    image: seed.image || null,
    audio: seed.audio || null,
    model,
    version: seed.version || config.versions[0].value,
    quality: seed.quality || (model === "kling" ? "1080p" : ""),
    mode: seed.mode || (model === "kling" ? "pro" : ""),
    count: Math.max(1, Number(seed.count || 1)),
    taskIds: seed.taskIds || [],
    remoteTasks: Array.isArray(seed.remoteTasks) ? seed.remoteTasks : [],
    completedTaskIds: Array.isArray(seed.completedTaskIds) ? seed.completedTaskIds : [],
    results: seed.results || [],
    error: seed.error || "",
    queuedJobs: 0,
    runningJobs: 0,
    finishedJobs: 0,
    totalJobs: 0,
    canceledJobs: 0,
    startedAt: Number(seed.startedAt || 0),
    lastActivityAt: Number(seed.lastActivityAt || 0),
    runToken: seed.runToken || "",
    cancelRequested: Boolean(seed.cancelRequested)
  };
}

function normalizeMotionRows(value) {
  if (!Array.isArray(value) || value.length === 0) return defaultMotionRows();
  return value.map(item => {
    const isRhModel = String(item?.model || "").startsWith("rh:");
    const model = isRhModel ? String(item.model) : MOTION_MODELS[item?.model] ? item.model : "kling";
    const config = isRhModel
      ? { versions: [{ value: item?.version || "" }], sizes: ["16:9", "9:16", "1:1", ""], qualities: ["默认"] }
      : MOTION_MODELS[model];
    const row = createMotionRow({
      ...item,
      model,
      image: normalizeAssets(item?.image ? [item.image] : []).filter(asset => asset.type === "image")[0] || null,
      video: normalizeAssets(item?.video ? [item.video] : []).filter(asset => asset.type === "video")[0] || null,
      taskIds: Array.isArray(item?.taskIds) ? item.taskIds : item?.taskId ? [item.taskId] : [],
      results: Array.isArray(item?.results) ? item.results : item?.result ? [item.result] : []
    });
    row.version = config.versions.some(version => version.value === row.version) ? row.version : config.versions[0].value;
    row.size = config.sizes.includes(row.size) ? row.size : (config.sizes[0] || "");
    row.quality = config.qualities.includes(row.quality) ? row.quality : (config.qualities[0] || "");
    row.status = VALID_ROW_STATUSES.includes(row.status) ? row.status : "pending";
    row.count = Math.max(1, Number(row.count || 1));
    recoverInterruptedRow(row);
    return row;
  });
}

function createMotionRow(seed = {}) {
  const model = seed.model || "kling";
  const config = MOTION_MODELS[model] || MOTION_MODELS.kling;
  return {
    id: seed.id || uid("motionrow"),
    selected: seed.selected ?? true,
    status: seed.status || "pending",
    prompt: seed.prompt || "",
    promptExpanded: Boolean(seed.promptExpanded),
    image: seed.image || null,
    video: seed.video || null,
    model,
    version: seed.version || config.versions[0].value,
    size: seed.size ?? (config.sizes[0] || ""),
    quality: seed.quality ?? (config.qualities[0] || ""),
    count: Math.max(1, Number(seed.count || 1)),
    taskIds: seed.taskIds || [],
    remoteTasks: Array.isArray(seed.remoteTasks) ? seed.remoteTasks : [],
    completedTaskIds: Array.isArray(seed.completedTaskIds) ? seed.completedTaskIds : [],
    results: seed.results || [],
    error: seed.error || "",
    queuedJobs: 0,
    runningJobs: 0,
    finishedJobs: 0,
    totalJobs: 0,
    canceledJobs: 0,
    startedAt: Number(seed.startedAt || 0),
    lastActivityAt: Number(seed.lastActivityAt || 0),
    runToken: seed.runToken || "",
    cancelRequested: Boolean(seed.cancelRequested)
  };
}

function normalizeViduImageVideoVersion(value) {
  const map = {
    VQ2: "VQ2-Turbo",
    viduq2: "VQ2-Turbo",
    "viduq2-pro": "VQ2-Pro",
    viduq3: "VQ3-Pro",
    "viduq3-turbo": "VQ3-Turbo"
  };
  return map[value] || value;
}

function normalizeViduRefVersion(value) {
  const raw = String(value || "").trim();
  const map = {
    viduq3: "VQ3-Pro",
    "viduq3-mix": "VQ3-Pro",
    "viduq3-pro": "VQ3-Pro",
    "viduq3-turbo": "VQ3-Turbo",
    "Vidu Q3": "VQ3-Pro",
    "Vidu Q3 Mix": "VQ3-Pro",
    "Vidu Q3 Turbo": "VQ3-Turbo"
  };
  return map[raw] || raw || "VQ3-Pro";
}

function normalizeImageVideoRows(value) {
  if (!Array.isArray(value) || value.length === 0) return defaultImageVideoRows();
  return value.map(item => {
    const model = IMAGE_VIDEO_MODELS[item?.model] ? item.model : "hailuo";
    const config = IMAGE_VIDEO_MODELS[model];
    const version = model === "vidu" ? normalizeViduImageVideoVersion(item?.version) : item?.version;
    const row = createImageVideoRow({
      ...item,
      model,
      version,
      firstFrame: normalizeAssets(item?.firstFrame ? [item.firstFrame] : []).filter(asset => asset.type === "image")[0] || null,
      lastFrame: normalizeAssets(item?.lastFrame ? [item.lastFrame] : []).filter(asset => asset.type === "image")[0] || null,
      taskIds: Array.isArray(item?.taskIds) ? item.taskIds : item?.taskId ? [item.taskId] : [],
      results: Array.isArray(item?.results) ? item.results : item?.result ? [item.result] : []
    });
    row.version = config.versions.some(version => version.value === row.version) ? row.version : config.versions[0].value;
    row.size = !row.size || getImageVideoSizeOptions(row).includes(row.size) ? row.size : (getImageVideoSizeOptions(row)[0] || "");
    row.quality = getImageVideoQualityOptions(row).includes(row.quality) ? row.quality : (getImageVideoQualityOptions(row)[0] || "");
    row.duration = getImageVideoDurationOptions(row).includes(String(row.duration)) ? String(row.duration) : (getImageVideoDurationOptions(row)[0] || "5");
    if (!supportsImageVideoLastFrame(row)) row.lastFrame = null;
    if (!supportsImageVideoAutoMultiShot(row)) row.autoMultiShot = false;
    row.status = VALID_ROW_STATUSES.includes(row.status) ? row.status : "pending";
    row.count = Math.max(1, Number(row.count || 1));
    recoverInterruptedRow(row);
    return row;
  });
}

function createImageVideoRow(seed = {}) {
  const model = seed.model || "hailuo";
  const config = IMAGE_VIDEO_MODELS[model] || IMAGE_VIDEO_MODELS.hailuo;
  return {
    id: seed.id || uid("ivrow"),
    selected: seed.selected ?? true,
    status: seed.status || "pending",
    prompt: seed.prompt || "",
    promptExpanded: Boolean(seed.promptExpanded),
    firstFrame: seed.firstFrame || null,
    lastFrame: seed.lastFrame || null,
    autoMultiShot: Boolean(seed.autoMultiShot),
    model,
    version: seed.version || config.versions[0].value,
    size: seed.size ?? (config.sizes[0] || ""),
    quality: seed.quality ?? (config.qualities[0] || ""),
    duration: String(seed.duration || config.durations[0] || "5"),
    count: Math.max(1, Number(seed.count || 1)),
    taskIds: seed.taskIds || [],
    remoteTasks: Array.isArray(seed.remoteTasks) ? seed.remoteTasks : [],
    completedTaskIds: Array.isArray(seed.completedTaskIds) ? seed.completedTaskIds : [],
    results: seed.results || [],
    error: seed.error || "",
    queuedJobs: 0,
    runningJobs: 0,
    finishedJobs: 0,
    totalJobs: 0,
    canceledJobs: 0,
    startedAt: Number(seed.startedAt || 0),
    lastActivityAt: Number(seed.lastActivityAt || 0),
    runToken: seed.runToken || "",
    cancelRequested: Boolean(seed.cancelRequested)
  };
}

function normalizeMultiRows(value) {
  if (!Array.isArray(value) || value.length === 0) return defaultMultiRows();
  return value.map(item => {
    const model = MULTI_VIDEO_MODELS[item?.model] ? item.model : "seedance";
    const config = MULTI_VIDEO_MODELS[model];
    const row = createMultiRow({
      ...item,
      model,
      refs: normalizeAssets(item?.refs || item?.references || []),
      taskIds: Array.isArray(item?.taskIds) ? item.taskIds : item?.taskId ? [item.taskId] : [],
      results: Array.isArray(item?.results) ? item.results : item?.result ? [item.result] : []
    });
    row.version = config.versions.some(version => version.value === row.version) ? row.version : config.versions[0].value;
    row.size = config.sizes.includes(row.size) ? row.size : (config.sizes[0] || "");
    row.quality = getMultiQualityOptions(row).includes(row.quality) ? row.quality : (getMultiQualityOptions(row)[1] || getMultiQualityOptions(row)[0] || "");
    row.duration = config.durations.includes(String(row.duration)) ? String(row.duration) : (config.durations[0] || "5");
    row.generateAudio = item?.generateAudio !== false;
    row.status = VALID_ROW_STATUSES.includes(row.status) ? row.status : "pending";
    row.count = Math.max(1, Number(row.count || 1));
    recoverInterruptedRow(row);
    return row;
  });
}

function normalizeViduRefRows(value) {
  if (!Array.isArray(value) || value.length === 0) return defaultViduRefRows();
  return value.map(item => {
    const row = createViduRefRow({
      ...item,
      version: normalizeViduRefVersion(item?.version),
      refs: normalizeAssets(item?.refs || item?.images || []).filter(asset => asset.type === "image"),
      taskIds: Array.isArray(item?.taskIds) ? item.taskIds : item?.taskId ? [item.taskId] : [],
      results: Array.isArray(item?.results) ? item.results : item?.result ? [item.result] : []
    });
    row.version = VIDU_REF_VIDEO_MODEL.versions.some(version => version.value === row.version) ? row.version : VIDU_REF_VIDEO_MODEL.versions[0].value;
    row.size = !row.size || VIDU_REF_VIDEO_MODEL.sizes.includes(row.size) ? row.size : VIDU_REF_VIDEO_MODEL.sizes[0];
    row.quality = getViduRefQualityOptions(row).includes(row.quality) ? row.quality : (getViduRefQualityOptions(row)[0] || "720p");
    row.duration = getViduRefDurationOptions(row).includes(String(row.duration)) ? String(row.duration) : (getViduRefDurationOptions(row).includes("5") ? "5" : getViduRefDurationOptions(row)[0]);
    row.status = VALID_ROW_STATUSES.includes(row.status) ? row.status : "pending";
    row.count = Math.max(1, Number(row.count || 1));
    row.returnedSeeds = Array.isArray(row.returnedSeeds) ? row.returnedSeeds : [];
    recoverInterruptedRow(row);
    return row;
  });
}

function createViduRefRow(seed = {}) {
  return {
    id: seed.id || uid("vidurefrow"),
    selected: seed.selected ?? true,
    status: seed.status || "pending",
    prompt: seed.prompt || "",
    promptExpanded: Boolean(seed.promptExpanded),
    refs: seed.refs || [],
    model: "viduRef",
    version: seed.version || VIDU_REF_VIDEO_MODEL.versions[0].value,
    size: seed.size ?? "16:9",
    quality: seed.quality || "720p",
    duration: String(seed.duration || "5"),
    seed: seed.seed ?? "",
    returnedSeeds: Array.isArray(seed.returnedSeeds) ? seed.returnedSeeds : [],
    offPeak: Boolean(seed.offPeak),
    voiceId: seed.voiceId || "",
    count: Math.max(1, Number(seed.count || 1)),
    taskIds: seed.taskIds || [],
    remoteTasks: Array.isArray(seed.remoteTasks) ? seed.remoteTasks : [],
    completedTaskIds: Array.isArray(seed.completedTaskIds) ? seed.completedTaskIds : [],
    results: seed.results || [],
    error: seed.error || "",
    queuedJobs: 0,
    runningJobs: 0,
    finishedJobs: 0,
    totalJobs: 0,
    canceledJobs: 0,
    startedAt: Number(seed.startedAt || 0),
    lastActivityAt: Number(seed.lastActivityAt || 0),
    runToken: seed.runToken || "",
    cancelRequested: Boolean(seed.cancelRequested)
  };
}

function createMultiRow(seed = {}) {
  const model = seed.model || "seedance";
  const config = MULTI_VIDEO_MODELS[model] || MULTI_VIDEO_MODELS.seedance;
  return {
    id: seed.id || uid("mvrow"),
    selected: seed.selected ?? true,
    status: seed.status || "pending",
    prompt: seed.prompt || "",
    promptExpanded: Boolean(seed.promptExpanded),
    refs: seed.refs || [],
    model,
    version: seed.version || config.versions[0].value,
    size: seed.size ?? (config.sizes[0] || ""),
    quality: seed.quality ?? (config.qualities[1] || config.qualities[0] || ""),
    duration: String(seed.duration || config.durations[0] || "5"),
    generateAudio: seed.generateAudio !== false,
    count: Math.max(1, Number(seed.count || 1)),
    taskIds: seed.taskIds || [],
    remoteTasks: Array.isArray(seed.remoteTasks) ? seed.remoteTasks : [],
    completedTaskIds: Array.isArray(seed.completedTaskIds) ? seed.completedTaskIds : [],
    results: seed.results || [],
    error: seed.error || "",
    queuedJobs: 0,
    runningJobs: 0,
    finishedJobs: 0,
    totalJobs: 0,
    canceledJobs: 0,
    startedAt: Number(seed.startedAt || 0),
    lastActivityAt: Number(seed.lastActivityAt || 0),
    runToken: seed.runToken || "",
    cancelRequested: Boolean(seed.cancelRequested)
  };
}

function renderRunningHubWorkflowTypeOptions(selected) {
  return Object.entries(RUNNINGHUB_WORKFLOW_TYPES)
    .map(([value, label]) => `<option value="${value}" ${selected === value ? "selected" : ""}>${label}</option>`)
    .join("");
}

function renderRunningHubParamList(config) {
  const nodes = parseRunningHubNodeTemplate(config);
  if (!nodes.length) {
    return `<div class="muted-note">还没有从 payload 拉取到该工作流的独有参数。粘贴 payload 并解析后，这里才会出现节点参数。</div>`;
  }
  return `
    <div class="runninghub-node-list">
      ${nodes.map((node, index) => `
        <div class="runninghub-node-row">
          <div class="runninghub-node-meta">
            <strong>${escapeHtml(node.description || node.nodeName || node.nodeId)}</strong>
            <span>${escapeHtml(node.nodeId)} · ${escapeHtml(node.nodeName)} · ${escapeHtml(node.fieldName)}</span>
          </div>
          <select data-runninghub-node-binding="${index}">
            ${Object.entries(RUNNINGHUB_NODE_BINDINGS).map(([value, label]) => `<option value="${value}" ${node.binding === value ? "selected" : ""}>${label}</option>`).join("")}
          </select>
          <input data-runninghub-node-value="${index}" value="${escapeAttr(node.fieldValue)}" spellcheck="false">
        </div>
      `).join("")}
    </div>
  `;
}

function renderRunningHubMotionConfig() {
  const settings = runningHubMotionSettings();
  const active = runningHubMotionConfig();
  const filled = runningHubMotionApiKey() ? "已填" : "未填";
  return `
    <section class="side-config side-status-card">
      <div>
        <strong>RunningHub</strong>
        <span>${filled} API Key · ${settings.configs.length} 个配置</span>
        <span>当前：${escapeHtml(active?.title || active?.webappId || "未设置")}</span>
      </div>
      <button id="openRunningHubMotionConfigWizard" class="tiny-button" type="button">打开配置</button>
    </section>
  `;
}

function renderRunningHubMotionConfigWizard() {
  const settings = runningHubMotionSettings();
  const config = runningHubMotionConfig();
  return `
    <div class="overlay-modal" role="dialog" aria-modal="true">
      <section class="overlay-panel runninghub-wizard-panel">
        <div class="modal-head">
          <h2>RunningHub 配置</h2>
          <button id="closeRunningHubMotionConfigWizard" class="ghost-button" type="button">关闭</button>
        </div>

        <section class="config-section">
          <h3>全局授权</h3>
          <label class="field">
            <span>API Key</span>
            <input id="runningHubGlobalApiKey" type="password" value="${escapeAttr(settings.apiKey || "")}" spellcheck="false" autocomplete="off">
          </label>
        </section>

        <section class="config-section">
          <h3>配置列表</h3>
          <div class="runninghub-config-list">
            <label class="field">
              <span>当前配置</span>
              <select id="runningHubMotionActiveConfig">
                ${settings.configs.map(item => `<option value="${escapeAttr(item.id)}" ${item.id === settings.activeId ? "selected" : ""}>${escapeHtml(`RH工作流-${item.title || item.webappId || item.id}`)} · ${escapeHtml(RUNNINGHUB_WORKFLOW_TYPES[item.workflowType] || "动作模仿")}</option>`).join("")}
              </select>
            </label>
            <div class="dialog-actions">
              <button id="addRunningHubMotionConfig" class="tiny-button" type="button">新增手动配置</button>
              <button id="resetRunningHubMotionConfig" class="tiny-button" type="button">重置当前配置</button>
            </div>
          </div>
        </section>

        <section class="config-section">
          <h3>手动设置</h3>
          <div class="runninghub-config-grid">
            <label class="field">
              <span>配置名称</span>
              <input data-runninghub-motion-field="title" value="${escapeAttr(config.title || "")}" spellcheck="false">
            </label>
            <label class="field">
              <span>工作流类型</span>
              <select data-runninghub-motion-field="workflowType">
                ${renderRunningHubWorkflowTypeOptions(config.workflowType || "motion")}
              </select>
            </label>
            <label class="field wide-field">
              <span>工作流链接</span>
              <input data-runninghub-motion-field="sourceUrl" value="${escapeAttr(config.sourceUrl || "")}" spellcheck="false" placeholder="https://www.runninghub.ai/zh-cn/ai-detail/&lt;webappId&gt;">
            </label>
            <label class="field">
              <span>webappId</span>
              <input data-runninghub-motion-field="webappId" value="${escapeAttr(config.webappId)}" spellcheck="false">
            </label>
            <label class="field">
              <span>提交接口</span>
              <input data-runninghub-motion-field="endpoint" value="${escapeAttr(config.endpoint)}" spellcheck="false">
            </label>
            <label class="field">
              <span>查询接口</span>
              <input data-runninghub-motion-field="queryEndpoint" value="${escapeAttr(config.queryEndpoint)}" spellcheck="false">
            </label>
          </div>
        </section>

        <section class="config-section">
          <h3>从源网页 / Payload 拉取</h3>
          <p class="muted-note">粘贴 RunningHub AI 应用链接和 payload，系统会识别 webappId 和节点参数。节点参数拉取后才会显示，每个配置会作为对应功能页里的模型使用。</p>
          <div class="runninghub-config-grid">
            <label class="field">
              <span>导入到功能</span>
              <select id="runningHubImportWorkflowType">
                ${renderRunningHubWorkflowTypeOptions(state.runningHubMotionConfigWorkflowType || config.workflowType || "motion")}
              </select>
            </label>
            <label class="field wide-field">
              <span>AI 应用网页链接</span>
              <input id="runningHubImportUrl" value="${escapeAttr(state.runningHubMotionConfigUrl || config.sourceUrl || "")}" spellcheck="false" placeholder="https://www.runninghub.ai/zh-cn/ai-detail/&lt;webappId&gt;">
            </label>
          </div>
          <label class="field">
            <span>Payload JSON</span>
            <textarea id="runningHubImportPayload" rows="10" spellcheck="false" placeholder='{"webappId":"&lt;webappId&gt;","inputs":[...]}' >${escapeHtml(state.runningHubMotionConfigPayload || "")}</textarea>
          </label>
          <div class="dialog-actions">
            <button id="createRunningHubConfigFromPayload" class="button primary" type="button">解析为新配置</button>
          </div>
        </section>

        <section class="config-section">
          <h3>当前配置参数</h3>
          ${renderRunningHubParamList(config)}
        </section>

        ${state.runningHubMotionConfigMessage ? `<div class="inline-error">${escapeHtml(state.runningHubMotionConfigMessage)}</div>` : ""}
        <div class="dialog-actions">
          <button id="closeRunningHubMotionConfigWizardBottom" class="button" type="button">取消</button>
        </div>
      </section>
    </div>
  `;
}

function render() {
  if (LOCKED_TASK_PAGE_IDS.has(state.activePage)) {
    state.activePage = "image";
    localStorage.setItem(STORAGE_KEYS.activePage, state.activePage);
  }
  const shouldRestoreScroll = app.dataset.activePage === state.activePage && !hasPendingRowScrollTarget();
  const scrollSnapshot = shouldRestoreScroll ? captureScrollSnapshot() : null;
  app.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="sidebar-head">
          <div class="brand">
            <div class="brand-mark">AI</div>
            <div>
              <h1>Internal API Batch</h1>
              <p>内部生成任务工作台</p>
            </div>
          </div>
          <label class="field">
            <span>API Base</span>
            <input id="apiBase" type="url" spellcheck="false" value="${escapeAttr(localStorage.getItem(STORAGE_KEYS.apiBase) || API_DEFAULT)}">
          </label>
          ${renderRunningHubMotionConfig()}
        </div>
        <nav class="nav-group">
          <div class="nav-label">任务类型</div>
          ${TASK_PAGES.filter(page => page.id !== "history").map(page => navButton(page)).join("")}
          <div class="nav-label">缓存</div>
          ${navButton(TASK_PAGES.find(page => page.id === "history"))}
        </nav>
        <div class="side-actions">
          <button id="exportJsonBtn" class="button" type="button">导出 JSON</button>
          <button id="exportCsvBtn" class="button" type="button">导出 CSV</button>
          <button id="clearDoneBtn" class="button" type="button">清除完成行</button>
        </div>
      </aside>
      <main class="workspace" id="workspace"></main>
    </div>
    ${state.runningHubMotionConfigOpen ? renderRunningHubMotionConfigWizard() : ""}
  `;
  app.dataset.activePage = state.activePage;
  bindShell();
  renderPage();
  if (scrollSnapshot) restoreScrollSnapshot(scrollSnapshot);
}

function hasPendingRowScrollTarget() {
  return Boolean(
    state.scrollToImageRowId ||
    state.scrollToImageVideoRowId ||
    state.scrollToMotionRowId ||
    state.scrollToMultiRowId ||
    state.scrollToViduRefRowId ||
    state.scrollToAvatarRowId
  );
}

function captureScrollSnapshot() {
  const selectors = [".sidebar", ".workspace", ".table-wrap", ".history-content", ".modal-panel"];
  return {
    windowX: window.scrollX || 0,
    windowY: window.scrollY || 0,
    elements: selectors.flatMap(selector => Array.from(document.querySelectorAll(selector)).map((element, index) => ({
      selector,
      index,
      top: element.scrollTop || 0,
      left: element.scrollLeft || 0
    })))
  };
}

function restoreScrollSnapshot(snapshot) {
  const restore = () => {
    snapshot.elements.forEach(item => {
      const element = document.querySelectorAll(item.selector)[item.index];
      if (!element) return;
      element.scrollTop = item.top;
      element.scrollLeft = item.left;
    });
    window.scrollTo?.(snapshot.windowX || 0, snapshot.windowY || 0);
  };
  restore();
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(restore);
}

function navButton(page) {
  const isUploads = true;
  const selectedImageCount = 0;
  const locked = !page.ready;
  return `
    <button class="nav-button ${state.activePage === page.id ? "active" : ""} ${locked ? "nav-button-locked" : ""}" data-page="${page.id}" type="button" ${locked ? "disabled" : ""}>
      <span>${page.label}</span>
      <span>${page.ready ? "可用" : "待建"}</span>
    </button>
    ${!isUploads && state.historyType === "image" ? `<button id="sendSelectedGenerationImages" class="button" type="button" ${selectedImageCount ? "" : "disabled"}>选中加入上传缓存</button>` : ""}
  `;
}

function navButton(page) {
  const locked = !page.ready;
  return `
    <button class="nav-button ${state.activePage === page.id ? "active" : ""} ${locked ? "nav-button-locked" : ""}" data-page="${page.id}" type="button" ${locked ? "disabled" : ""}>
      <span>${page.label}</span>
      <span>${locked ? "锁定" : "可用"}</span>
    </button>
  `;
}

function bindShell() {
  document.querySelectorAll(".nav-button").forEach(button => {
    button.addEventListener("click", () => {
      state.activePage = button.dataset.page;
      localStorage.setItem(STORAGE_KEYS.activePage, state.activePage);
      render();
    });
  });
  document.querySelector("#apiBase").addEventListener("change", event => {
    localStorage.setItem(STORAGE_KEYS.apiBase, event.target.value.trim() || API_DEFAULT);
  });
  document.querySelector("#runningHubMotionActiveConfig")?.addEventListener("change", event => {
    const settings = runningHubMotionSettings();
    settings.activeId = event.target.value;
    persistRunningHubMotionConfig();
    render();
  });
  document.querySelector("#runningHubGlobalApiKey")?.addEventListener("input", event => {
    runningHubMotionSettings().apiKey = event.target.value.trim();
    persistRunningHubMotionConfig();
  });
  document.querySelectorAll("[data-runninghub-motion-field]").forEach(input => {
    const handler = () => {
      const field = input.dataset.runninghubMotionField;
      if (!field) return;
      const config = runningHubMotionConfig();
      const booleanFields = new Set(["usePersonalQueue", "pose3Neck", "cameraEnabled", "helmetMode", "customRatioEnabled"]);
      const endpointFields = new Set(["endpoint", "queryEndpoint"]);
      const rawValue = endpointFields.has(field) ? normalizeEndpointPath(input.value) : input.value;
      config[field] = input.type === "checkbox"
        ? input.checked
        : booleanFields.has(field)
          ? rawValue === "true"
          : rawValue;
      if (field === "sourceUrl") {
        const webappId = extractRunningHubAppId(rawValue, config);
        if (webappId) config.webappId = webappId;
      }
      if (field === "workflowType" && !RUNNINGHUB_WORKFLOW_TYPES[config.workflowType]) config.workflowType = "motion";
      persistRunningHubMotionConfig();
      if (field === "workflowType") render();
    };
    input.addEventListener(input.tagName === "INPUT" && input.type !== "checkbox" ? "input" : "change", handler);
  });
  document.querySelectorAll("[data-runninghub-node-value]").forEach(input => {
    input.addEventListener("input", () => {
      const config = runningHubMotionConfig();
      const nodes = parseRunningHubNodeTemplate(config);
      const index = Number(input.dataset.runninghubNodeValue);
      if (!nodes[index]) return;
      nodes[index].fieldValue = input.value;
      config.nodeInfoList = JSON.stringify(nodes, null, 2);
      persistRunningHubMotionConfig();
    });
  });
  document.querySelectorAll("[data-runninghub-node-binding]").forEach(select => {
    select.addEventListener("change", () => {
      const config = runningHubMotionConfig();
      const nodes = parseRunningHubNodeTemplate(config);
      const index = Number(select.dataset.runninghubNodeBinding);
      if (!nodes[index]) return;
      nodes[index].binding = RUNNINGHUB_NODE_BINDINGS[select.value] ? select.value : "none";
      config.nodeInfoList = JSON.stringify(nodes, null, 2);
      persistRunningHubMotionConfig();
      render();
    });
  });
  document.querySelector("#addRunningHubMotionConfig")?.addEventListener("click", () => {
    const settings = runningHubMotionSettings();
    const next = normalizeRunningHubMotionConfig({
      ...DEFAULT_RUNNINGHUB_MOTION_CONFIG,
      id: uid("rh_motion"),
      title: `RunningHub 配置 ${settings.configs.length + 1}`,
      source: "manual",
      workflowType: "motion",
      nodeInfoList: ""
    });
    settings.configs.push(next);
    settings.activeId = next.id;
    persistRunningHubMotionConfig();
    render();
  });
  document.querySelector("#openRunningHubMotionConfigWizard")?.addEventListener("click", () => {
    state.runningHubMotionConfigOpen = true;
    state.runningHubMotionConfigMessage = "";
    render();
  });
  document.querySelector("#closeRunningHubMotionConfigWizard")?.addEventListener("click", closeRunningHubMotionConfigWizard);
  document.querySelector("#closeRunningHubMotionConfigWizardBottom")?.addEventListener("click", closeRunningHubMotionConfigWizard);
  document.querySelector("#runningHubImportUrl")?.addEventListener("input", event => {
    state.runningHubMotionConfigUrl = event.target.value;
  });
  document.querySelector("#runningHubImportPayload")?.addEventListener("input", event => {
    state.runningHubMotionConfigPayload = event.target.value;
  });
  document.querySelector("#runningHubImportWorkflowType")?.addEventListener("change", event => {
    state.runningHubMotionConfigWorkflowType = event.target.value;
  });
  document.querySelector("#createRunningHubConfigFromPayload")?.addEventListener("click", () => {
    state.runningHubMotionConfigUrl = document.querySelector("#runningHubImportUrl")?.value || "";
    state.runningHubMotionConfigPayload = document.querySelector("#runningHubImportPayload")?.value || "";
    state.runningHubMotionConfigWorkflowType = document.querySelector("#runningHubImportWorkflowType")?.value || "motion";
    try {
      const settings = runningHubMotionSettings();
      const next = buildRunningHubConfigFromImport(
        state.runningHubMotionConfigUrl,
        state.runningHubMotionConfigPayload,
        state.runningHubMotionConfigWorkflowType
      );
      settings.configs.push(next);
      settings.activeId = next.id;
      persistRunningHubMotionConfig();
      state.runningHubMotionConfigOpen = false;
      state.runningHubMotionConfigMessage = "";
      render();
    } catch (error) {
      state.runningHubMotionConfigMessage = error.message || "解析失败";
      render();
    }
  });
  document.querySelector("#resetRunningHubMotionConfig")?.addEventListener("click", () => {
    const settings = runningHubMotionSettings();
    const index = settings.configs.findIndex(item => item.id === settings.activeId);
    const reset = normalizeRunningHubMotionConfig({ ...DEFAULT_RUNNINGHUB_MOTION_CONFIG, id: settings.activeId || DEFAULT_RUNNINGHUB_MOTION_CONFIG.id });
    if (index >= 0) settings.configs[index] = reset;
    else settings.configs = [reset];
    settings.activeId = reset.id;
    persistRunningHubMotionConfig();
    render();
  });
  document.querySelector("#exportJsonBtn").addEventListener("click", exportJson);
  document.querySelector("#exportCsvBtn").addEventListener("click", exportCsv);
  document.querySelector("#clearDoneBtn").addEventListener("click", clearDoneRows);
}

function closeRunningHubMotionConfigWizard() {
  state.runningHubMotionConfigOpen = false;
  state.runningHubMotionConfigMessage = "";
  render();
}

function clearDoneRows() {
  state.rows = state.rows.filter(row => row.status !== "done");
  persistRows();
  render();
}

function deleteSelectedRows() {
  const selectedIds = new Set(state.rows.filter(row => row.selected).map(row => row.id));
  if (!selectedIds.size) return;
  selectedIds.forEach(id => cancelQueuedJobs(id, false));
  state.rows = state.rows.filter(row => !selectedIds.has(row.id));
  persistRows();
  render();
}

function renderPage() {
  if (state.activePage === "history") {
    renderHistoryPage();
  } else if (state.activePage === "image") {
    renderImagePage();
  } else if (state.activePage === "imageVideo") {
    renderImageVideoPage();
  } else if (state.activePage === "motion") {
    renderMotionPage();
  } else if (state.activePage === "multiVideo") {
    renderMultiVideoPage();
  } else if (state.activePage === "viduRef") {
    renderViduRefPage();
  } else if (state.activePage === "viduVoice") {
    renderViduVoicePage();
  } else if (state.activePage === "subjectLibrary") {
    renderSubjectLibraryPage();
  } else if (state.activePage === "avatar") {
    renderAvatarPage();
  } else if (state.activePage === "music") {
    renderMusicPage();
  } else {
    renderPlaceholder();
  }
}

function renderPlaceholder() {
  const page = TASK_PAGES.find(item => item.id === state.activePage);
  document.querySelector("#workspace").innerHTML = `
    <section class="topbar">
      <div class="page-title">
        <h2>${page.label}</h2>
        <p>这个任务页已预留，当前先完成生图表格。</p>
      </div>
    </section>
    <section class="page-placeholder">后续按同一套队列、素材池和历史池扩展。</section>
  `;
}

function renderImagePage() {
  const workspace = document.querySelector("#workspace");
  const stats = getStats();
  workspace.innerHTML = `
    <section class="topbar">
      <div class="page-title">
        <h2>图片生成</h2>
        <p>Nano Banana、Seedream、Midjourney、Kontext Image、Qwen Image、GPT Image、Kling Omni Image</p>
      </div>
      <div class="topbar-controls">
        <label class="field compact-field">
          <span>后端最大并发</span>
          <input id="maxConcurrency" type="number" min="1" max="20" value="${getMaxConcurrency()}">
        </label>
        <label class="file-button">
          上传到缓存池
          <input id="globalUpload" type="file" multiple>
        </label>
      </div>
    </section>
    <section class="batchbar">
      <div class="stats">
        <div class="stat"><strong>${stats.total}</strong><small>总行数</small></div>
        <div class="stat"><strong>${stats.running}</strong><small>处理中</small></div>
        <div class="stat"><strong>${stats.queued}</strong><small>排队中</small></div>
        <div class="stat"><strong>${stats.done}</strong><small>已完成</small></div>
        <div class="stat"><strong>${stats.failed}</strong><small>失败</small></div>
      </div>
      <div class="topbar-controls">
        <button id="addRowBtn" class="button primary" type="button">新增行</button>
        <button id="pastePromptBtn" class="button" type="button">批量粘贴 Prompt</button>
        <button id="submitSelectedBtn" class="button success" type="button">提交选中</button>
        <button id="submitAllBtn" class="button success" type="button">提交全部待处理</button>
        <button id="cancelQueuedBtn" class="button danger" type="button">取消未开始</button>
        <button id="deleteSelectedRowsBtn" class="button danger" type="button">删除选中行</button>
        <button id="clearDonePageBtn" class="button" type="button">清除完成行</button>
      </div>
    </section>
    <section class="table-wrap">
      <table class="task-table">
        <thead>
          <tr>
            <th>序号</th>
            <th>状态</th>
            <th>Prompt</th>
            <th>图片</th>
            <th>模型</th>
            <th>参数</th>
            <th>一次生成数量</th>
            <th>任务ID 结果</th>
          </tr>
        </thead>
        <tbody>
          ${state.rows.map((row, index) => renderRow(row, index)).join("")}
        </tbody>
      </table>
    </section>
  `;
  bindImagePage();
}

function renderMultiVideoPage() {
  const workspace = document.querySelector("#workspace");
  const stats = getMultiStats();
  workspace.innerHTML = `
    <section class="topbar">
      <div class="page-title">
        <h2>多模态生视频</h2>
        <p>Seedance 2.0 与可灵 3 Omni 多模态参考；素材编号可在 Prompt 中通过 @ 引用。</p>
      </div>
      <div class="topbar-controls">
        <label class="field compact-field">
          <span>后端最大并发</span>
          <input id="multiMaxConcurrency" type="number" min="1" max="20" value="${getMaxConcurrency()}">
        </label>
        <label class="file-button">
          上传到缓存池
          <input id="multiGlobalUpload" type="file" multiple>
        </label>
      </div>
    </section>
    <section class="batchbar">
      <div class="stats">
        <div class="stat"><strong>${stats.total}</strong><small>总行数</small></div>
        <div class="stat"><strong>${stats.running}</strong><small>处理中</small></div>
        <div class="stat"><strong>${stats.queued}</strong><small>排队中</small></div>
        <div class="stat"><strong>${stats.done}</strong><small>已完成</small></div>
        <div class="stat"><strong>${stats.failed}</strong><small>失败</small></div>
      </div>
      <div class="topbar-controls">
        <button id="addMultiRowBtn" class="button primary" type="button">新增行</button>
        <button id="submitSelectedMultiBtn" class="button success" type="button">提交选中</button>
        <button id="submitAllMultiBtn" class="button success" type="button">提交全部待处理</button>
        <button id="cancelMultiQueuedBtn" class="button danger" type="button">取消未开始</button>
        <button id="deleteSelectedMultiRowsBtn" class="button danger" type="button">删除选中行</button>
        <button id="clearDoneMultiBtn" class="button" type="button">清除完成行</button>
      </div>
    </section>
    <section class="table-wrap">
      <table class="task-table multi-video-table">
        <thead>
          <tr>
            <th>序号</th>
            <th>状态</th>
            <th>Prompt</th>
            <th>参考</th>
            <th>模型</th>
            <th>参数</th>
            <th>一次生成数量</th>
            <th>任务ID 结果</th>
          </tr>
        </thead>
        <tbody>
          ${state.multiRows.map((row, index) => renderMultiVideoRow(row, index)).join("")}
        </tbody>
      </table>
    </section>
  `;
  bindMultiVideoPage();
}

function renderImageVideoPage() {
  const workspace = document.querySelector("#workspace");
  const stats = getImageVideoStats();
  workspace.innerHTML = `
    <section class="topbar">
      <div class="page-title">
        <h2>图文生视频</h2>
        <p>Hailuo、Veo、Kling、Seedance、Seedance 2.0、Vidu、HappyHorse</p>
      </div>
      <div class="topbar-controls">
        <label class="field compact-field">
          <span>后端最大并发</span>
          <input id="imageVideoMaxConcurrency" type="number" min="1" max="20" value="${getMaxConcurrency()}">
        </label>
        <label class="file-button">
          上传到缓存池
          <input id="imageVideoGlobalUpload" type="file" multiple>
        </label>
      </div>
    </section>
    <section class="batchbar">
      <div class="stats">
        <div class="stat"><strong>${stats.total}</strong><small>总行数</small></div>
        <div class="stat"><strong>${stats.running}</strong><small>处理中</small></div>
        <div class="stat"><strong>${stats.queued}</strong><small>排队中</small></div>
        <div class="stat"><strong>${stats.done}</strong><small>已完成</small></div>
        <div class="stat"><strong>${stats.failed}</strong><small>失败</small></div>
      </div>
      <div class="topbar-controls">
        <button id="addImageVideoRowBtn" class="button primary" type="button">新增行</button>
        <button id="submitSelectedImageVideoBtn" class="button success" type="button">提交选中</button>
        <button id="submitAllImageVideoBtn" class="button success" type="button">提交全部待处理</button>
        <button id="cancelImageVideoQueuedBtn" class="button danger" type="button">取消未开始</button>
        <button id="deleteSelectedImageVideoRowsBtn" class="button danger" type="button">删除选中行</button>
        <button id="clearDoneImageVideoBtn" class="button" type="button">清除完成行</button>
      </div>
    </section>
    <section class="table-wrap">
      <table class="task-table image-video-table">
        <thead>
          <tr>
            <th>序号</th>
            <th>状态</th>
            <th>Prompt</th>
            <th>首帧图</th>
            <th>尾帧图</th>
            <th>模型</th>
            <th>参数</th>
            <th>一次生成数量</th>
            <th>任务ID 结果</th>
            <th>启用自动多镜头</th>
          </tr>
        </thead>
        <tbody>
          ${state.imageVideoRows.map((row, index) => renderImageVideoRow(row, index)).join("")}
        </tbody>
      </table>
    </section>
  `;
  bindImageVideoPage();
}

function renderViduRefPage() {
  const workspace = document.querySelector("#workspace");
  const stats = getViduRefStats();
  workspace.innerHTML = `
    <section class="topbar">
      <div class="page-title">
        <h2>Vidu参考生视频</h2>
        <p>只保留 Q3 系列：VQ3-Pro / VQ3-Turbo；支持 seed、返回 seed、off_peak 非高峰、voice_id。</p>
      </div>
      <div class="topbar-controls">
        <label class="field compact-field">
          <span>后端最大并发</span>
          <input id="viduRefMaxConcurrency" type="number" min="1" max="20" value="${getMaxConcurrency()}">
        </label>
        <label class="file-button">
          上传到缓存池
          <input id="viduRefGlobalUpload" type="file" accept="image/*" multiple>
        </label>
      </div>
    </section>
    <section class="batchbar">
      <div class="stats">
        <div class="stat"><strong>${stats.total}</strong><small>总行数</small></div>
        <div class="stat"><strong>${stats.running}</strong><small>处理中</small></div>
        <div class="stat"><strong>${stats.queued}</strong><small>排队中</small></div>
        <div class="stat"><strong>${stats.done}</strong><small>已完成</small></div>
        <div class="stat"><strong>${stats.failed}</strong><small>失败</small></div>
      </div>
      <div class="topbar-controls">
        <button id="addViduRefRowBtn" class="button primary" type="button">新增行</button>
        <button id="submitSelectedViduRefBtn" class="button success" type="button">提交选中</button>
        <button id="submitAllViduRefBtn" class="button success" type="button">提交全部待处理</button>
        <button id="cancelViduRefQueuedBtn" class="button danger" type="button">取消未开始</button>
        <button id="deleteSelectedViduRefRowsBtn" class="button danger" type="button">删除选中行</button>
        <button id="clearDoneViduRefBtn" class="button" type="button">清除完成行</button>
      </div>
    </section>
    <section class="table-wrap">
      <table class="task-table vidu-ref-table">
        <thead>
          <tr>
            <th>序号</th>
            <th>状态</th>
            <th>Prompt</th>
            <th>参考图</th>
            <th>模型</th>
            <th>参数</th>
            <th>Seed</th>
            <th>非高峰</th>
            <th>语音ID</th>
            <th>一次生成数量</th>
            <th>任务ID 结果</th>
          </tr>
        </thead>
        <tbody>
          ${state.viduRefRows.map((row, index) => renderViduRefRow(row, index)).join("")}
        </tbody>
      </table>
    </section>
  `;
  bindViduRefPage();
}

function renderViduRefRow(row, index) {
  const locked = isViduRefRowLocked(row);
  const disabled = locked ? "disabled" : "";
  return `
    <tr data-vidu-ref-row-id="${row.id}" class="${locked ? "row-locked" : ""}">
      <td>
        <div class="index-action-cell">
          <div class="index-cell">
            <input class="vidu-ref-row-select" type="checkbox" ${row.selected ? "checked" : ""}>
            <strong>${index + 1}</strong>
          </div>
          <div class="row-actions">
            <button class="tiny-button submit-vidu-ref-row" type="button" ${disabled}>提交</button>
            <button class="tiny-button cancel-vidu-ref-row" type="button">取消</button>
            <button class="tiny-button duplicate-vidu-ref-row" type="button">复制行</button>
            <button class="tiny-button remove-vidu-ref-row" type="button" ${disabled}>删除</button>
          </div>
        </div>
      </td>
      <td>${renderRowStatusCell(row)}</td>
      <td>${renderPromptCell(row, disabled)}</td>
      <td>${renderViduRefPicker(row)}</td>
      <td>${renderViduRefModelCell(row, disabled)}</td>
      <td>${renderViduRefParamsCell(row, disabled)}</td>
      <td>
        <input class="seed-input" data-vidu-ref-field="seed" type="number" step="1" placeholder="随机" value="${escapeAttr(row.seed)}" ${disabled}>
        ${row.returnedSeeds?.length ? `<div class="meta-line">返回 ${row.returnedSeeds.map(seed => escapeHtml(seed)).join(" / ")}</div>` : ""}
      </td>
      <td>
        <label class="inline-check">
          <input data-vidu-ref-field="offPeak" type="checkbox" ${row.offPeak ? "checked" : ""} ${disabled}>
          开启
        </label>
      </td>
      <td>
        <input class="voice-id-input" data-vidu-ref-field="voiceId" type="text" placeholder="可不填" value="${escapeAttr(row.voiceId)}" ${disabled}>
      </td>
      <td>${renderViduRefCountControl(row)}</td>
      <td data-task-result-cell>${renderTaskResultCell(row)}</td>
    </tr>
  `;
}

function renderViduRefPicker(row) {
  const locked = isViduRefRowLocked(row);
  const disabled = locked ? "disabled" : "";
  const refs = normalizeAssets(row.refs || []).filter(asset => asset.type === "image");
  return `
    <div class="image-picker reference-picker ${locked ? "locked-picker" : ""}">
      <div class="image-drop vidu-ref-drop" data-vidu-ref-row="${row.id}" tabindex="0" title="拖入图片、选择缓存，或按 Ctrl+V 粘贴图片/素材 URL">
        ${refs.length ? refs.map(asset => renderAssetChip(asset, locked)).join("") : `<span class="empty-drop">${locked ? "生成中，素材已锁定" : "拖入图片，或选择历史缓存"}</span>`}
      </div>
      <div class="picker-actions">
        <button class="tiny-button choose-vidu-ref-assets" type="button" ${disabled}>选择</button>
        <button class="tiny-button copy-vidu-ref-assets" type="button" ${refs.length ? "" : "disabled"}>复制</button>
        <button class="tiny-button clear-vidu-ref-assets" data-clear-vidu-ref-assets type="button" ${refs.length && !locked ? "" : "disabled"}>清空</button>
        <label class="tiny-button file-button">
          上传
          <input class="vidu-ref-upload" type="file" accept="image/*" multiple ${disabled}>
        </label>
        <button class="tiny-button paste-vidu-ref-assets" type="button" ${disabled}>粘贴</button>
      </div>
    </div>
  `;
}

function renderViduRefCountControl(row) {
  const disabled = isViduRefRowLocked(row) ? "disabled" : "";
  return `
    <div class="number-control">
      <button class="vidu-ref-count-minus" type="button" ${disabled}>-</button>
      <input data-vidu-ref-field="count" type="number" min="1" step="1" value="${row.count}" ${disabled}>
      <button class="vidu-ref-count-plus" type="button" ${disabled}>+</button>
    </div>
  `;
}

function renderMotionPage() {
  const workspace = document.querySelector("#workspace");
  const stats = getMotionStats();
  workspace.innerHTML = `
    <section class="topbar">
      <div class="page-title">
        <h2>动作模仿</h2>
        <p>可灵 2.6 / 3.0， 即梦动作模仿 / 动作模仿 2.0</p>
      </div>
      <div class="topbar-controls">
        <label class="field compact-field">
          <span>后端最大并发</span>
          <input id="motionMaxConcurrency" type="number" min="1" max="20" value="${getMaxConcurrency()}">
        </label>
        <label class="file-button">
          上传到缓存池
          <input id="motionGlobalUpload" type="file" multiple>
        </label>
      </div>
    </section>
    <section class="batchbar">
      <div class="stats">
        <div class="stat"><strong>${stats.total}</strong><small>总行数</small></div>
        <div class="stat"><strong>${stats.running}</strong><small>处理中</small></div>
        <div class="stat"><strong>${stats.queued}</strong><small>排队中</small></div>
        <div class="stat"><strong>${stats.done}</strong><small>已完成</small></div>
        <div class="stat"><strong>${stats.failed}</strong><small>失败</small></div>
      </div>
      <div class="topbar-controls">
        <button id="addMotionRowBtn" class="button primary" type="button">新增行</button>
        <button id="submitSelectedMotionBtn" class="button success" type="button">提交选中</button>
        <button id="submitAllMotionBtn" class="button success" type="button">提交全部待处理</button>
        <button id="cancelMotionQueuedBtn" class="button danger" type="button">取消未开始</button>
        <button id="deleteSelectedMotionRowsBtn" class="button danger" type="button">删除选中行</button>
        <button id="clearDoneMotionBtn" class="button" type="button">清除完成行</button>
      </div>
    </section>
    <section class="table-wrap">
      <table class="task-table motion-table">
        <thead>
          <tr>
            <th>序号</th>
            <th>状态</th>
            <th>Prompt</th>
            <th>图</th>
            <th>参考视频</th>
            <th>模型</th>
            <th>参数</th>
            <th>一次生成数量</th>
            <th>任务ID 结果</th>
          </tr>
        </thead>
        <tbody>
          ${state.motionRows.map((row, index) => renderMotionRow(row, index)).join("")}
        </tbody>
      </table>
    </section>
  `;
  bindMotionPage();
}

function renderMotionRow(row, index) {
  const model = getMotionModel(row);
  const locked = isMotionRowLocked(row);
  const disabled = locked ? "disabled" : "";
  return `
    <tr data-motion-row-id="${row.id}" class="${locked ? "row-locked" : ""}">
      <td>
        <div class="index-action-cell">
          <div class="index-cell">
            <input class="motion-row-select" type="checkbox" ${row.selected ? "checked" : ""}>
            <strong>${index + 1}</strong>
          </div>
          <div class="row-actions">
            <button class="tiny-button submit-motion-row" type="button" ${disabled}>提交</button>
            <button class="tiny-button cancel-motion-row" type="button">取消</button>
            <button class="tiny-button duplicate-motion-row" type="button">复制行</button>
            <button class="tiny-button remove-motion-row" type="button" ${disabled}>删除</button>
          </div>
        </div>
      </td>
      <td>${renderRowStatusCell(row)}</td>
      <td>${renderPromptCell(row, disabled)}</td>
      <td>${renderSingleAssetPicker(row, "image", "图", "image")}</td>
      <td>${renderSingleAssetPicker(row, "video", "参考视频", "video")}</td>
      <td>${renderMotionModelCell(row, model, disabled)}</td>
      <td>${renderMotionParamsCell(row, model, disabled)}</td>
      <td>${renderMotionCountControl(row)}</td>
      <td data-task-result-cell>${renderTaskResultCell(row)}</td>
    </tr>
  `;
}

function renderSingleAssetPicker(row, field, label, type) {
  const locked = isMotionRowLocked(row);
  const disabled = locked ? "disabled" : "";
  const asset = row[field];
  const accept = type === "video" ? "video/*" : "image/*";
  return `
    <div class="image-picker frame-picker ${locked ? "locked-picker" : ""}">
      <div class="image-drop motion-drop" data-motion-asset-field="${field}" data-motion-row="${row.id}" tabindex="0">
        ${asset ? renderAssetChip(asset, locked) : `<span class="empty-drop">${locked ? "生成中，素材已锁定" : `拖入/选择/上传${label}`}</span>`}
      </div>
      <div class="picker-actions">
        <button class="tiny-button choose-motion-asset" data-motion-asset-action="${field}" data-motion-asset-type="${type}" type="button" ${disabled}>选择</button>
        <button class="tiny-button copy-motion-asset" data-motion-asset-action="${field}" type="button" ${asset ? "" : "disabled"}>复制</button>
        <button class="tiny-button clear-motion-asset" data-clear-single-asset data-motion-asset-action="${field}" type="button" ${asset && !locked ? "" : "disabled"}>清空</button>
        <label class="tiny-button file-button">
          上传
          <input class="motion-asset-upload" data-motion-asset-action="${field}" type="file" accept="${accept}" ${disabled}>
        </label>
        <button class="tiny-button paste-motion-asset" data-motion-asset-action="${field}" type="button" ${disabled}>粘贴</button>
      </div>
    </div>
  `;
}

function renderMotionCountControl(row) {
  const disabled = isMotionRowLocked(row) ? "disabled" : "";
  return `
    <div class="number-control">
      <button class="motion-count-minus" type="button" ${disabled}>-</button>
      <input data-motion-field="count" type="number" min="1" step="1" value="${row.count}" ${disabled}>
      <button class="motion-count-plus" type="button" ${disabled}>+</button>
    </div>
  `;
}

function renderAvatarPage() {
  const workspace = document.querySelector("#workspace");
  const stats = getAvatarStats();
  workspace.innerHTML = `
    <section class="topbar">
      <div class="page-title">
        <h2>数字人</h2>
        <p>即梦 OmniHuman 1.5、可灵 Avatar；当前不单独设置尺寸/清晰度，按图片素材和模型规则输出。</p>
      </div>
      <div class="topbar-controls">
        <label class="field compact-field">
          <span>后端最大并发</span>
          <input id="avatarMaxConcurrency" type="number" min="1" max="20" value="${getMaxConcurrency()}">
        </label>
        <label class="field compact-field endpoint-field">
          <span>即梦创建接口</span>
          <input id="avatarJimengCreate" type="text" spellcheck="false" value="${escapeAttr(avatarEndpoint("jimeng", "create"))}">
        </label>
        <label class="field compact-field endpoint-field">
          <span>即梦查询接口</span>
          <input id="avatarJimengQuery" type="text" spellcheck="false" value="${escapeAttr(avatarEndpoint("jimeng", "query"))}">
        </label>
        <label class="field compact-field endpoint-field">
          <span>可灵创建接口</span>
          <input id="avatarKlingCreate" type="text" spellcheck="false" value="${escapeAttr(avatarEndpoint("kling", "create"))}">
        </label>
        <label class="field compact-field endpoint-field">
          <span>可灵查询接口</span>
          <input id="avatarKlingQuery" type="text" spellcheck="false" value="${escapeAttr(avatarEndpoint("kling", "query"))}">
        </label>
        <label class="file-button">
          上传到缓存池
          <input id="avatarGlobalUpload" type="file" accept="image/*,audio/*" multiple>
        </label>
      </div>
    </section>
    <section class="batchbar">
      <div class="stats">
        <div class="stat"><strong>${stats.total}</strong><small>总行数</small></div>
        <div class="stat"><strong>${stats.running}</strong><small>处理中</small></div>
        <div class="stat"><strong>${stats.queued}</strong><small>排队中</small></div>
        <div class="stat"><strong>${stats.done}</strong><small>已完成</small></div>
        <div class="stat"><strong>${stats.failed}</strong><small>失败</small></div>
      </div>
      <div class="topbar-controls">
        <button id="addAvatarRowBtn" class="button primary" type="button">新增行</button>
        <button id="submitSelectedAvatarBtn" class="button success" type="button">提交选中</button>
        <button id="submitAllAvatarBtn" class="button success" type="button">提交全部待处理</button>
        <button id="cancelAvatarQueuedBtn" class="button danger" type="button">取消未开始</button>
        <button id="deleteSelectedAvatarRowsBtn" class="button danger" type="button">删除选中行</button>
        <button id="clearDoneAvatarBtn" class="button" type="button">清除完成行</button>
      </div>
    </section>
    <section class="table-wrap">
      <table class="task-table avatar-table">
        <thead>
          <tr>
            <th>序号</th>
            <th>状态</th>
            <th>Prompt</th>
            <th>图片</th>
            <th>音频</th>
            <th>模型</th>
            <th>一次生成数量</th>
            <th>任务ID 结果</th>
          </tr>
        </thead>
        <tbody>
          ${state.avatarRows.map((row, index) => renderAvatarRow(row, index)).join("")}
        </tbody>
      </table>
    </section>
  `;
  bindAvatarPage();
}

function renderAvatarRow(row, index) {
  const model = getAvatarModel(row);
  const locked = isAvatarRowLocked(row);
  const disabled = locked ? "disabled" : "";
  return `
    <tr data-avatar-row-id="${row.id}" class="${locked ? "row-locked" : ""}">
      <td>
        <div class="index-action-cell">
          <div class="index-cell">
            <input class="avatar-row-select" type="checkbox" ${row.selected ? "checked" : ""}>
            <strong>${index + 1}</strong>
          </div>
          <div class="row-actions">
            <button class="tiny-button submit-avatar-row" type="button" ${disabled}>提交</button>
            <button class="tiny-button cancel-avatar-row" type="button">取消</button>
            <button class="tiny-button duplicate-avatar-row" type="button">复制行</button>
            <button class="tiny-button remove-avatar-row" type="button" ${disabled}>删除</button>
          </div>
        </div>
      </td>
      <td>${renderRowStatusCell(row)}</td>
      <td>${renderPromptCell(row, disabled)}</td>
      <td>${renderAvatarAssetPicker(row, "image", "图片", "image")}</td>
      <td>${renderAvatarAssetPicker(row, "audio", "音频", "audio")}</td>
      <td>${renderAvatarModelCell(row, model, disabled)}</td>
      <td>${renderAvatarCountControl(row)}</td>
      <td data-task-result-cell>${renderTaskResultCell(row)}</td>
    </tr>
  `;
}

function renderAvatarAssetPicker(row, field, label, type) {
  const locked = isAvatarRowLocked(row);
  const disabled = locked ? "disabled" : "";
  const asset = row[field];
  const accept = type === "audio" ? "audio/*" : "image/*";
  return `
    <div class="image-picker frame-picker ${locked ? "locked-picker" : ""}">
      <div class="image-drop avatar-drop" data-avatar-asset-field="${field}" data-avatar-row="${row.id}" tabindex="0">
        ${asset ? renderAssetChip(asset, locked) : `<span class="empty-drop">${locked ? "生成中，素材已锁定" : `拖入/选择/上传${label}`}</span>`}
      </div>
      <div class="picker-actions">
        <button class="tiny-button choose-avatar-asset" data-avatar-asset-action="${field}" data-avatar-asset-type="${type}" type="button" ${disabled}>选择</button>
        <button class="tiny-button copy-avatar-asset" data-avatar-asset-action="${field}" type="button" ${asset ? "" : "disabled"}>复制</button>
        <button class="tiny-button clear-avatar-asset" data-clear-single-asset data-avatar-asset-action="${field}" type="button" ${asset && !locked ? "" : "disabled"}>清空</button>
        <label class="tiny-button file-button">
          上传
          <input class="avatar-asset-upload" data-avatar-asset-action="${field}" type="file" accept="${accept}" ${disabled}>
        </label>
        <button class="tiny-button paste-avatar-asset" data-avatar-asset-action="${field}" type="button" ${disabled}>粘贴</button>
      </div>
    </div>
  `;
}

function renderAvatarCountControl(row) {
  const disabled = isAvatarRowLocked(row) ? "disabled" : "";
  return `
    <div class="number-control">
      <button class="avatar-count-minus" type="button" ${disabled}>-</button>
      <input data-avatar-field="count" type="number" min="1" step="1" value="${row.count}" ${disabled}>
      <button class="avatar-count-plus" type="button" ${disabled}>+</button>
    </div>
  `;
}

function renderViduVoicePage() {
  const workspace = document.querySelector("#workspace");
  const voice = state.viduVoiceState;
  workspace.innerHTML = `
    <section class="topbar">
      <div class="page-title">
        <h2>Vidu声音克隆</h2>
        <p>公司中转调用 Vidu audio-clone；提交后返回克隆 ID voice_id、task_id 和试听 demo_audio。</p>
      </div>
      <div class="topbar-controls">
        <label class="file-button">
          上传到缓存池
          <input id="viduVoiceGlobalUpload" type="file" accept="audio/*" multiple>
        </label>
      </div>
    </section>
    <section class="batchbar music-settings">
      <label class="field compact-field endpoint-field">
        <span>中转接口</span>
        <input id="viduVoiceEndpoint" type="text" spellcheck="false" value="${escapeAttr(viduVoiceEndpoint())}">
      </label>
      <div class="meta-line">不用在前端填 Vidu Key，后端按 Vidu 通用 Token Header 转发。</div>
    </section>
    <section class="tool-panel vidu-voice-panel">
      <div class="suno-operation-head">
        <div>
          <h3>创建声音克隆</h3>
          <p class="meta-line">主音频支持 mp3 / m4a / wav，10 秒到 5 分钟，20MB 内；短样本音频可选，需小于 8 秒。</p>
        </div>
        <div class="suno-status-box">
          <span class="status-pill status-${sunoStatusClass(voice.status)}">${sunoStatusLabel(voice.status)}</span>
          ${voice.taskId ? `<code>${escapeHtml(voice.taskId)}</code>` : ""}
          ${voice.error ? `<div class="suno-status-error">${escapeHtml(voice.error)}</div>` : ""}
        </div>
      </div>
      <div class="suno-form-grid">
        ${renderViduVoiceAudioPicker("audio", "原始音频 audio_url", true)}
        ${renderViduVoiceAudioPicker("promptAudio", "短样本音频 prompt_audio_url", false)}
        ${renderSunoTextField("voiceId", "自定义 voice_id", voice.voiceId, "text", "如 vidu_voice_001，8-256 位，英文开头")}
        ${renderSunoTextarea("text", "预览文本 text", voice.text, "克隆声音会朗读这段文字并返回 demo_audio，1000 字以内")}
        ${renderSunoTextarea("promptText", "样本文本 prompt_text（可选）", voice.promptText, "需要和短样本音频内容一致，并以标点结尾")}
        ${renderSunoTextarea("payload", "payload（可选透传）", voice.payload)}
      </div>
      <div class="topbar-controls suno-submit-row">
        <button id="submitViduVoiceClone" class="button success" type="button" ${voice.status === "running" ? "disabled" : ""}>提交声音克隆</button>
        <button id="resetViduVoiceClone" class="button" type="button" ${voice.status === "running" ? "disabled" : ""}>清空结果</button>
      </div>
      <div class="suno-results">
        <h3>克隆 ID / 结果</h3>
        ${voice.returnedVoiceId ? `<div class="paste-help"><strong>voice_id</strong><code>${escapeHtml(voice.returnedVoiceId)}</code><button class="tiny-button" id="copyViduVoiceId" type="button">复制克隆ID</button></div>` : ""}
        ${voice.demoAudio ? `<div class="result-list">${renderResultItem(voice.demoAudio)}</div>` : ""}
        ${voice.resultData ? `<details class="suno-raw"><summary>查看原始返回</summary><pre>${escapeHtml(JSON.stringify(voice.resultData, null, 2))}</pre></details>` : ""}
      </div>
    </section>
  `;
  bindViduVoicePage();
}

function renderViduVoiceAudioPicker(field, label, required) {
  const asset = state.viduVoiceState[field];
  return `
    <div class="image-picker frame-picker">
      <label class="field-label">${label}${required ? " *" : ""}</label>
      <div class="image-drop vidu-voice-drop" data-vidu-voice-field="${field}" tabindex="0">
        ${asset ? renderAssetChip(asset, false) : `<span class="empty-drop">拖入/选择/上传音频</span>`}
      </div>
      <div class="picker-actions">
        <button class="tiny-button choose-vidu-voice-asset" data-vidu-voice-field="${field}" type="button">选择</button>
        <button class="tiny-button copy-vidu-voice-asset" data-vidu-voice-field="${field}" type="button" ${asset ? "" : "disabled"}>复制</button>
        <label class="tiny-button file-button">
          上传
          <input class="vidu-voice-upload" data-vidu-voice-field="${field}" type="file" accept="audio/*">
        </label>
        <button class="tiny-button paste-vidu-voice-asset" data-vidu-voice-field="${field}" type="button">粘贴</button>
        ${asset ? `<button class="tiny-button" data-remove-vidu-voice-asset="${field}" type="button">移除</button>` : ""}
      </div>
    </div>
  `;
}

function renderSubjectLibraryPage() {
  const workspace = document.querySelector("#workspace");
  workspace.innerHTML = `
    <section class="topbar">
      <div class="page-title">
        <h2>主体库</h2>
        <p>创建并保存 Vidu / 可灵主体 ID 与音色主体 ID，后续可以复制到对应生成任务中使用。</p>
      </div>
      <div class="topbar-controls">
        <label class="file-button">
          上传到缓存池
          <input id="subjectGlobalUpload" type="file" accept="image/*,video/*,audio/*" multiple>
        </label>
      </div>
    </section>
    <section class="batchbar">
      <div class="history-tabs">
        <button class="filter-chip ${state.subjectTab === "create" ? "active" : ""}" data-subject-tab="create" type="button">创建主体</button>
        <button class="filter-chip ${state.subjectTab === "library" ? "active" : ""}" data-subject-tab="library" type="button">主体库管理</button>
      </div>
      <div class="meta-line">当前本地保存 ${state.subjectLibrary.length} 个主体；如果后端有表格储存接口，后面可以把这里同步过去。</div>
    </section>
    ${state.subjectTab === "create" ? renderSubjectCreatePanel() : renderSubjectManagePanel()}
  `;
  bindSubjectLibraryPage();
}

function renderSubjectCreatePanel() {
  const form = state.subjectCreateState;
  const config = SUBJECT_MODEL_CONFIGS[form.model] || SUBJECT_MODEL_CONFIGS.vidu;
  return `
    <section class="tool-panel subject-create-panel">
      <div class="suno-operation-head">
        <div>
          <h3>创建主体</h3>
          <p class="meta-line">模型切换会改变素材规则说明；提交会按模型走公司中转候选接口。</p>
        </div>
        <div class="suno-status-box">
          <span class="status-pill status-${sunoStatusClass(form.status)}">${sunoStatusLabel(form.status)}</span>
          ${form.error ? `<div class="suno-status-error">${escapeHtml(form.error)}</div>` : ""}
        </div>
      </div>
      <div class="suno-form-grid">
        <label class="field">
          <span>模型</span>
          <select data-subject-field="model">
            ${Object.entries(SUBJECT_MODEL_CONFIGS).map(([key, item]) => `<option value="${key}" ${form.model === key ? "selected" : ""}>${item.label}</option>`).join("")}
          </select>
        </label>
        <label class="field">
          <span>主体名称</span>
          <input data-subject-field="name" type="text" value="${escapeAttr(form.name)}" placeholder="例如：红衣女孩 / 足球队长 / vidu_voice_001">
        </label>
        <label class="field">
          <span>主体类别</span>
          <select data-subject-field="type">
            ${SUBJECT_TYPES.map(([key, label]) => `<option value="${key}" ${form.type === key ? "selected" : ""}>${label}</option>`).join("")}
          </select>
        </label>
        <label class="field">
          <span>备注</span>
          <input data-subject-field="note" type="text" value="${escapeAttr(form.note)}" placeholder="可选，方便管理">
        </label>
      </div>
      <div class="paste-help subject-rules">
        <strong>${config.label} 素材规则</strong>
        ${config.rules.map(rule => `<span>${escapeHtml(rule)}</span>`).join("")}
      </div>
      <div class="subject-assets-grid">
        ${renderSubjectAssetPicker("images", "图片素材", "image", true)}
        ${renderSubjectAssetPicker("videos", "视频素材", "video", false)}
        ${renderSubjectAssetPicker("audio", "声音素材", "audio", false)}
      </div>
      <div class="topbar-controls suno-submit-row">
        <button id="submitSubjectCreate" class="button success" type="button" ${form.status === "running" ? "disabled" : ""}>提交创建主体</button>
        <button id="resetSubjectCreate" class="button" type="button" ${form.status === "running" ? "disabled" : ""}>清空表单</button>
      </div>
      ${form.resultData ? `<details class="suno-raw"><summary>查看原始返回</summary><pre>${escapeHtml(JSON.stringify(form.resultData, null, 2))}</pre></details>` : ""}
    </section>
  `;
}

function renderSubjectAssetPicker(field, label, type, multiple) {
  const form = state.subjectCreateState;
  const assets = field === "audio" ? (form.audio ? [form.audio] : []) : normalizeAssets(form[field] || []).filter(asset => asset.type === type);
  const accept = `${type}/*`;
  return `
    <div class="image-picker frame-picker subject-asset-picker">
      <label class="field-label">${label}${multiple ? "（可多选）" : ""}</label>
      <div class="image-drop subject-drop" data-subject-asset-field="${field}" data-subject-asset-type="${type}" tabindex="0">
        ${assets.length ? assets.map(asset => renderAssetChip(asset, false)).join("") : `<span class="empty-drop">拖入/选择/上传${label}</span>`}
      </div>
      <div class="picker-actions">
        <button class="tiny-button choose-subject-asset" data-subject-asset-field="${field}" data-subject-asset-type="${type}" type="button">选择</button>
        <button class="tiny-button copy-subject-asset" data-subject-asset-field="${field}" type="button" ${assets.length ? "" : "disabled"}>复制</button>
        <label class="tiny-button file-button">
          上传
          <input class="subject-asset-upload" data-subject-asset-field="${field}" data-subject-asset-type="${type}" type="file" accept="${accept}" ${multiple ? "multiple" : ""}>
        </label>
        <button class="tiny-button paste-subject-asset" data-subject-asset-field="${field}" data-subject-asset-type="${type}" type="button">粘贴</button>
        ${assets.length ? `<button class="tiny-button clear-subject-asset" data-subject-asset-field="${field}" type="button">清空</button>` : ""}
      </div>
    </div>
  `;
}

function renderSubjectManagePanel() {
  return `
    <section class="table-wrap subject-library-wrap">
      <table class="task-table subject-table">
        <thead>
          <tr>
            <th>主体名</th>
            <th>主体类型</th>
            <th>可灵主体id</th>
            <th>可灵音色主体id</th>
            <th>Vidu主体id</th>
            <th>Vidu音色主体id</th>
            <th>素材</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          ${state.subjectLibrary.length ? state.subjectLibrary.map(renderSubjectRecordRow).join("") : `<tr><td colspan="8" class="meta-line">还没有主体记录</td></tr>`}
        </tbody>
      </table>
    </section>
  `;
}

function renderSubjectRecordRow(item) {
  const typeLabel = SUBJECT_TYPES.find(([key]) => key === item.type)?.[1] || item.type || "";
  const assets = [...(item.images || []), ...(item.videos || []), item.audio].filter(Boolean);
  return `
    <tr data-subject-id="${item.id}">
      <td><strong>${escapeHtml(item.name || "未命名主体")}</strong><div class="meta-line">${new Date(item.createdAt).toLocaleString()}</div></td>
      <td>${escapeHtml(typeLabel)}</td>
      <td>${renderCopyableId(item.klingSubjectId)}</td>
      <td>${renderCopyableId(item.klingVoiceSubjectId)}</td>
      <td>${renderCopyableId(item.viduSubjectId)}</td>
      <td>${renderCopyableId(item.viduVoiceSubjectId)}</td>
      <td><div class="result-list">${assets.map(asset => renderAssetChip(asset, true)).join("")}</div></td>
      <td>
        <button class="tiny-button duplicate-subject-record" type="button">复用创建</button>
        <button class="tiny-button remove-subject-record" type="button">删除</button>
      </td>
    </tr>
  `;
}

function renderCopyableId(value) {
  return value ? `<code>${escapeHtml(value)}</code><button class="tiny-button copy-subject-id" data-copy-value="${escapeAttr(value)}" type="button">复制</button>` : `<span class="meta-line">空</span>`;
}

function renderMusicPage() {
  const workspace = document.querySelector("#workspace");
  const mode = sunoApiMode();
  workspace.innerHTML = `
    <section class="topbar">
      <div class="page-title">
        <h2>音乐生成</h2>
        <p>Suno 已接入；Minimax Music 先预留空白页。</p>
      </div>
      <div class="topbar-controls">
        <label class="file-button">
          上传到缓存池
          <input id="musicGlobalUpload" type="file" accept="audio/*" multiple>
        </label>
      </div>
    </section>
    <section class="batchbar music-settings">
      <div class="history-tabs">
        <button class="filter-chip ${state.musicTool === "suno" ? "active" : ""}" data-music-tool="suno" type="button">Suno</button>
        <button class="filter-chip ${state.musicTool === "minimax" ? "active" : ""}" data-music-tool="minimax" type="button">Minimax Music</button>
      </div>
      <label class="field compact-field music-api-field">
        <span>调用方式</span>
        <select id="sunoApiMode">
          <option value="gateway" ${mode === "gateway" ? "selected" : ""}>公司中转</option>
          <option value="direct" ${mode === "direct" ? "selected" : ""}>官方直连</option>
        </select>
      </label>
      ${mode === "direct" ? `
        <label class="field compact-field music-api-field">
          <span>Suno API Base</span>
          <input id="sunoApiBase" type="url" spellcheck="false" value="${escapeAttr(sunoApiBase())}">
        </label>
        <label class="field compact-field music-api-field">
          <span>Suno API Key</span>
          <input id="sunoApiKey" type="password" spellcheck="false" autocomplete="off" value="${escapeAttr(localStorage.getItem(STORAGE_KEYS.sunoApiKey) || "")}">
        </label>
      ` : `
        <label class="field compact-field music-api-field">
          <span>创建接口</span>
          <input id="sunoGatewayGenerate" type="text" spellcheck="false" value="${escapeAttr(sunoGatewayGenerateEndpoint())}">
        </label>
        <label class="field compact-field music-api-field">
          <span>查询接口</span>
          <input id="sunoGatewayQuery" type="text" spellcheck="false" value="${escapeAttr(sunoGatewayQueryEndpoint())}">
        </label>
        <div class="meta-line music-api-note">使用左侧 API Base 作为公司中转，不在网页里填写 Suno 官方 Key。</div>
      `}
    </section>
    ${state.musicTool === "suno" ? renderSunoPanel() : renderMinimaxMusicPlaceholder()}
  `;
  bindMusicPage();
}

function renderMinimaxMusicPlaceholder() {
  return `
    <section class="page-placeholder">
      <div>
        <h3>Minimax Music</h3>
        <p class="meta-line">这里先留空，后面读文档后再绑定。</p>
      </div>
    </section>
  `;
}

function renderSunoPanel() {
  const active = state.sunoState.activeOperation;
  return `
    <section class="music-layout">
      <div class="history-tabs suno-operation-tabs">
        ${Object.entries(SUNO_OPERATIONS).map(([key, item]) => `
          <button class="filter-chip ${active === key ? "active" : ""}" data-suno-operation="${key}" type="button">${item.label}</button>
        `).join("")}
      </div>
      <div class="paste-help">
        <strong>Suno API 摘要</strong>
        <span>生成音乐按 customMode 与 instrumental 两个参数组合；音频类任务通常先提交拿 taskId，再轮询 record-info。添加伴奏/人声需要可访问的音频 URL，人声消除/分离和 MIDI 依赖原任务 taskId 与 audioId。</span>
      </div>
      ${renderSunoOperation(active)}
    </section>
  `;
}

function renderSunoOperation(opKey) {
  const op = SUNO_OPERATIONS[opKey] || SUNO_OPERATIONS.generate;
  const opState = getSunoOperationState(opKey);
  return `
    <div class="suno-operation" data-suno-op="${opKey}">
      <div class="suno-operation-head">
        <div>
          <h3>${op.label}</h3>
          <p class="meta-line">${sunoOperationHint(opKey)}</p>
        </div>
        <div class="suno-status-box">
          <span class="status-pill status-${sunoStatusClass(opState.status)}">${sunoStatusLabel(opState.status)}</span>
          ${opState.taskId ? `<code>${escapeHtml(opState.taskId)}</code>` : ""}
          ${opState.error ? `<div class="suno-status-error">${escapeHtml(opState.error)}</div>` : ""}
        </div>
      </div>
      <div class="suno-form-grid">
        ${renderSunoForm(opKey, opState.form)}
      </div>
      <div class="topbar-controls suno-submit-row">
        <button id="submitSunoOperation" class="button success" type="button" ${opState.status === "running" ? "disabled" : ""}>提交 ${op.label}</button>
        <button id="resetSunoOperation" class="button" type="button" ${opState.status === "running" ? "disabled" : ""}>清空本页结果</button>
      </div>
      ${opState.error ? `<div class="paste-help suno-error">${escapeHtml(opState.error)}</div>` : ""}
      <div class="suno-results">
        <h3>任务ID / 结果</h3>
        <div class="result-list">${opState.results.map(result => renderResultItem(result)).join("")}</div>
        ${opState.resultData ? `<details class="suno-raw"><summary>查看原始返回</summary><pre>${escapeHtml(JSON.stringify(opState.resultData, null, 2))}</pre></details>` : ""}
      </div>
    </div>
  `;
}

function renderSunoForm(opKey, form) {
  if (opKey === "generate") return renderSunoGenerateForm(form);
  if (opKey === "extend") return renderSunoExtendForm(opKey, form);
  if (opKey === "addInstrumental") return renderSunoAddInstrumentalForm(opKey, form);
  if (opKey === "addVocals") return renderSunoAddVocalsForm(opKey, form);
  if (opKey === "removeVocals") return renderSunoStemForm(opKey, form, false);
  if (opKey === "separateVocals") return renderSunoStemForm(opKey, form, true);
  if (opKey === "midi") return renderSunoMidiForm(opKey, form);
  return "";
}

function renderSunoGenerateForm(form) {
  const custom = Boolean(form.customMode);
  const instrumental = Boolean(form.instrumental);
  const promptLimit = custom ? sunoGenerateLimits(form.model).prompt : 500;
  const styleLimit = sunoGenerateLimits(form.model).style;
  return `
    <div class="suno-create-shell">
      <div class="suno-create-toolbar">
        <div class="suno-segment" aria-label="customMode">
          <button class="suno-segment-button ${!custom ? "active" : ""}" data-suno-custom-mode="false" type="button">Simple</button>
          <button class="suno-segment-button ${custom ? "active" : ""}" data-suno-custom-mode="true" type="button">Advanced</button>
        </div>
        <label class="suno-model-pill">
          <span>Model</span>
          <select data-suno-field="model">
            ${SUNO_MODELS.map(model => `<option value="${model}" ${form.model === model ? "selected" : ""}>${model}</option>`).join("")}
          </select>
        </label>
      </div>
      ${custom ? `
        <div class="suno-advanced-stack">
          <div class="suno-create-card">
            <div class="suno-card-head">
              <strong>Lyrics</strong>
              <div class="suno-mini-tabs">
                <button class="suno-mini-tab ${!instrumental ? "active" : ""}" type="button" data-suno-instrumental-value="false">Write</button>
                <button class="suno-mini-tab" type="button" data-suno-focus-field="prompt">Prompt</button>
                <button class="suno-mini-tab ${instrumental ? "active" : ""}" type="button" data-suno-instrumental-value="true">Instrumental</button>
              </div>
            </div>
            ${instrumental ? `
              <div class="suno-muted-panel">Instrumental 已开启。按 Suno 文档，customMode=true 且 instrumental=true 时不会提交 prompt，只提交 style 和 title。</div>
            ` : `
              <textarea class="suno-song-textarea" data-suno-field="prompt" maxlength="${promptLimit}" placeholder="[Verse]\nThis is where you write your rhymes\nSection [tags] can help instruct your song">${escapeHtml(form.prompt || "")}</textarea>
              <div class="suno-card-foot"><span>${String(form.prompt || "").length}/${promptLimit}</span></div>
            `}
          </div>
          <div class="suno-create-card">
            <div class="suno-card-head">
              <strong>Styles</strong>
              <span>${String(form.style || "").length}/${styleLimit}</span>
            </div>
            <textarea class="suno-style-textarea" data-suno-field="style" maxlength="${styleLimit}" placeholder="exhilarating, traditional folk, emotional rock ballad, acid jazz">${escapeHtml(form.style || "")}</textarea>
            <div class="suno-suggestions">
              ${["exhilarating", "traditional folk", "boogie rock", "acid jazz"].map(item => `<button class="suno-suggestion-chip" data-suno-style-suggestion="${escapeAttr(item)}" type="button">${item}</button>`).join("")}
            </div>
          </div>
          <div class="suno-create-card suno-options-card">
            <div class="suno-card-head"><strong>More Options</strong></div>
            <div class="suno-option-row">
              <span>Vocal Gender</span>
              <div class="suno-choice-row">
                <button class="suno-choice ${form.vocalGender === "m" ? "active" : ""}" data-suno-set-field="vocalGender" data-suno-set-value="m" type="button">Male</button>
                <button class="suno-choice ${form.vocalGender === "f" ? "active" : ""}" data-suno-set-field="vocalGender" data-suno-set-value="f" type="button">Female</button>
                <button class="suno-choice ${!form.vocalGender ? "active" : ""}" data-suno-set-field="vocalGender" data-suno-set-value="" type="button">Auto</button>
              </div>
            </div>
            ${renderSunoSlider("weirdnessConstraint", "Weirdness", form.weirdnessConstraint)}
            ${renderSunoSlider("styleWeight", "Style Influence", form.styleWeight)}
            ${renderSunoSlider("audioWeight", "Audio Influence", form.audioWeight)}
            ${renderSunoTextField("negativeTags", "排除标签", form.negativeTags)}
          </div>
          <div class="suno-create-card suno-title-card">
            ${renderSunoTextField("title", "Song Title", form.title)}
          </div>
        </div>
      ` : `
        <div class="suno-create-card suno-simple-card">
          <div class="suno-card-head">
            <strong>Song Description</strong>
            <span>${String(form.prompt || "").length}/${promptLimit}</span>
          </div>
          <textarea class="suno-song-textarea" data-suno-field="prompt" maxlength="${promptLimit}" placeholder="Sweet funk song about sleepless nights">${escapeHtml(form.prompt || "")}</textarea>
          <div class="suno-card-actions">
            <button class="suno-card-pill" type="button" data-suno-quick-lyrics>+ Lyrics</button>
            <button class="suno-card-pill ${instrumental ? "active" : ""}" type="button" data-suno-instrumental-toggle>
              <span class="suno-pill-dot">${instrumental ? "✓" : ""}</span>
              Instrumental
            </button>
          </div>
          <div class="suno-suggestions">
            <span>Suggestions</span>
            ${["chopped vocal samples", "erhu", "jazz elements", "soaring vocals"].map(item => `<button class="suno-suggestion-chip" data-suno-suggestion="${escapeAttr(item)}" type="button">${item}</button>`).join("")}
          </div>
        </div>
      `}
      <div class="suno-callback-row">
        ${renderSunoTextField("callBackUrl", "回调 URL", form.callBackUrl, "url")}
      </div>
    </div>
  `;
}

function renderSunoExtendForm(opKey, form) {
  return `
    ${renderSunoTextField("audioId", "原音频 audioId", form.audioId)}
    ${renderSunoAudioPicker(opKey, "sourceAudio", "原音频预览/缓存")}
    ${renderSunoModelSelect(form.model)}
    ${renderSunoTextField("callBackUrl", "回调 URL", form.callBackUrl, "url")}
    <label class="field inline-check suno-checkbox"><input data-suno-field="defaultParamFlag" type="checkbox" ${form.defaultParamFlag ? "checked" : ""}> 使用自定义延长参数</label>
    ${renderSunoTextField("continueAt", "从第几秒继续", form.continueAt, "number")}
    ${renderSunoTextarea("prompt", "延长提示词", form.prompt, "例如：继续进入吉他 solo")}
    ${renderSunoTextField("style", "风格", form.style)}
    ${renderSunoTextField("title", "标题", form.title)}
  `;
}

function renderSunoAddInstrumentalForm(opKey, form) {
  return `
    ${renderSunoAudioPicker(opKey, "sourceAudio", "上传音频")}
    ${renderSunoTextField("uploadUrl", "音频 URL", form.uploadUrl, "url")}
    ${renderSunoAdvancedModelSelect(form.model)}
    ${renderSunoTextField("callBackUrl", "回调 URL", form.callBackUrl, "url")}
    ${renderSunoTextField("title", "标题", form.title)}
    ${renderSunoTextField("tags", "风格/标签 tags", form.tags, "text", "Pop, acoustic, female vocal...")}
    ${renderSunoTextField("negativeTags", "排除标签", form.negativeTags)}
    ${renderSunoAdvancedFields(form, true, false)}
  `;
}

function renderSunoAddVocalsForm(opKey, form) {
  return `
    ${renderSunoAudioPicker(opKey, "sourceAudio", "上传伴奏/音频")}
    ${renderSunoTextField("uploadUrl", "音频 URL", form.uploadUrl, "url")}
    ${renderSunoAdvancedModelSelect(form.model)}
    ${renderSunoTextField("callBackUrl", "回调 URL", form.callBackUrl, "url")}
    ${renderSunoTextarea("prompt", "歌词/人声提示词", form.prompt)}
    ${renderSunoTextField("title", "标题", form.title)}
    ${renderSunoTextField("style", "风格", form.style)}
    ${renderSunoTextField("negativeTags", "排除标签", form.negativeTags)}
    ${renderSunoAdvancedFields(form, true, false)}
  `;
}

function renderSunoStemForm(opKey, form, allowSplit) {
  return `
    ${renderSunoTextField("taskId", "原任务 taskId", form.taskId)}
    ${renderSunoTextField("audioId", "原音频 audioId", form.audioId)}
    ${renderSunoAudioPicker(opKey, "sourceAudio", "原音频预览/缓存")}
    ${renderSunoTextField("callBackUrl", "回调 URL", form.callBackUrl, "url")}
    ${allowSplit ? renderSunoSelect("separationType", "分离类型", form.separationType, [
      ["split_stem", "多轨分离 split_stem"],
      ["separate_vocal", "人声/伴奏 separate_vocal"]
    ]) : `<input data-suno-field="separationType" type="hidden" value="separate_vocal">`}
  `;
}

function renderSunoMidiForm(opKey, form) {
  return `
    ${renderSunoTextField("taskId", "分离任务 taskId", form.taskId)}
    ${renderSunoTextField("audioId", "音频 audioId（可选）", form.audioId)}
    ${renderSunoAudioPicker(opKey, "sourceAudio", "音频预览/缓存")}
    ${renderSunoTextField("callBackUrl", "回调 URL", form.callBackUrl, "url")}
  `;
}

function renderSunoModelSelect(value) {
  return renderSunoSelect("model", "模型", value, SUNO_MODELS.map(model => [model, model]));
}

function renderSunoAdvancedModelSelect(value) {
  return renderSunoSelect("model", "模型", value, SUNO_ADVANCED_AUDIO_MODELS.map(model => [model, model]));
}

function renderSunoAdvancedFields(form, enabled, includeNegativeTags = true) {
  if (!enabled) return "";
  return `
    ${includeNegativeTags ? renderSunoTextField("negativeTags", "排除标签", form.negativeTags) : ""}
    ${renderSunoSelect("vocalGender", "人声性别", form.vocalGender, [["", "空"], ["m", "男声"], ["f", "女声"]])}
    ${renderSunoTextField("styleWeight", "风格权重 0-1", form.styleWeight, "number")}
    ${renderSunoTextField("weirdnessConstraint", "创意偏移 0-1", form.weirdnessConstraint, "number")}
    ${renderSunoTextField("audioWeight", "音频权重 0-1", form.audioWeight, "number")}
    ${renderSunoTextField("personaId", "Persona ID（可选）", form.personaId)}
    ${renderSunoSelect("personaModel", "Persona 类型", form.personaModel, [["style_persona", "style_persona"], ["voice_persona", "voice_persona"]])}
  `;
}

function renderSunoTextField(field, label, value, type = "text", placeholder = "") {
  return `
    <label class="field">
      <span>${label}</span>
      <input data-suno-field="${field}" type="${type}" value="${escapeAttr(value ?? "")}" placeholder="${escapeAttr(placeholder)}">
    </label>
  `;
}

function renderSunoTextarea(field, label, value, placeholder = "") {
  return `
    <label class="field suno-wide">
      <span>${label}</span>
      <textarea class="prompt-input" data-suno-field="${field}" placeholder="${escapeAttr(placeholder)}">${escapeHtml(value || "")}</textarea>
    </label>
  `;
}

function renderSunoSelect(field, label, value, options) {
  return `
    <label class="field">
      <span>${label}</span>
      <select data-suno-field="${field}">
        ${options.map(([optionValue, optionLabel]) => `<option value="${escapeAttr(optionValue)}" ${String(value ?? "") === String(optionValue) ? "selected" : ""}>${escapeHtml(optionLabel)}</option>`).join("")}
      </select>
    </label>
  `;
}

function renderSunoSlider(field, label, value) {
  const numberValue = value === "" || value === undefined || value === null ? 0.5 : Math.min(1, Math.max(0, Number(value)));
  return `
    <label class="suno-option-row suno-slider-row">
      <span>${label}</span>
      <input data-suno-field="${field}" type="range" min="0" max="1" step="0.01" value="${numberValue}">
      <strong>${Math.round(numberValue * 100)}%</strong>
    </label>
  `;
}

function renderSunoAudioPicker(opKey, field, label) {
  const form = getSunoOperationState(opKey).form;
  const asset = form[field];
  return `
    <div class="image-picker frame-picker suno-wide">
      <span class="meta-line">${label}</span>
      <div class="image-drop suno-audio-drop" data-suno-op="${opKey}" data-suno-asset-field="${field}" tabindex="0">
        ${asset ? renderAssetChip(asset) : `<span class="empty-drop">拖入/选择/上传/粘贴音频</span>`}
      </div>
      <div class="picker-actions">
        <button class="tiny-button choose-suno-asset" data-suno-asset-field="${field}" type="button">选择</button>
        <button class="tiny-button copy-suno-asset" data-suno-asset-field="${field}" type="button" ${asset ? "" : "disabled"}>复制</button>
        <label class="tiny-button file-button">
          上传
          <input class="suno-asset-upload" data-suno-asset-field="${field}" type="file" accept="audio/*">
        </label>
        <button class="tiny-button paste-suno-asset" data-suno-asset-field="${field}" type="button">粘贴</button>
      </div>
    </div>
  `;
}

function renderImageVideoRow(row, index) {
  const model = getImageVideoModel(row);
  const locked = isImageVideoRowLocked(row);
  const disabled = locked ? "disabled" : "";
  if (!supportsImageVideoLastFrame(row)) row.lastFrame = null;
  return `
    <tr data-image-video-row-id="${row.id}" class="${locked ? "row-locked" : ""}">
      <td>
        <div class="index-action-cell">
          <div class="index-cell">
            <input class="image-video-row-select" type="checkbox" ${row.selected ? "checked" : ""}>
            <strong>${index + 1}</strong>
          </div>
          <div class="row-actions">
            <button class="tiny-button submit-image-video-row" type="button" ${disabled}>提交</button>
            <button class="tiny-button cancel-image-video-row" type="button">取消</button>
            <button class="tiny-button duplicate-image-video-row" type="button">复制行</button>
            <button class="tiny-button remove-image-video-row" type="button" ${disabled}>删除</button>
          </div>
        </div>
      </td>
      <td>${renderRowStatusCell(row)}</td>
      <td>${renderPromptCell(row, disabled)}</td>
      <td>${renderFramePicker(row, "firstFrame", "首帧图", true)}</td>
      <td>${renderFramePicker(row, "lastFrame", "尾帧图", supportsImageVideoLastFrame(row))}</td>
      <td>${renderImageVideoModelCell(row, model, disabled)}</td>
      <td>${renderImageVideoParamsCell(row, disabled)}</td>
      <td>${renderImageVideoCountControl(row)}</td>
      <td data-task-result-cell>${renderTaskResultCell(row)}</td>
      <td>${renderImageVideoAutoMultiShotControl(row)}</td>
    </tr>
  `;
}

function renderFramePicker(row, field, label, enabled) {
  const locked = isImageVideoRowLocked(row) || !enabled;
  const disabled = locked ? "disabled" : "";
  const asset = row[field];
  const emptyText = !enabled ? "当前模型版本不支持尾帧" : locked ? "生成中，图片已锁定" : `拖入/选择/上传${label}`;
  return `
    <div class="image-picker frame-picker ${locked ? "locked-picker" : ""}">
      <div class="image-drop frame-drop" data-frame-field="${field}" data-frame-row="${row.id}" tabindex="0">
        ${asset ? renderAssetChip(asset, locked) : `<span class="empty-drop">${emptyText}</span>`}
      </div>
      <div class="picker-actions">
        <button class="tiny-button choose-frame" data-frame-action="${field}" type="button" ${disabled}>选择</button>
        <button class="tiny-button copy-frame" data-frame-action="${field}" type="button" ${asset ? "" : "disabled"}>复制</button>
        <button class="tiny-button clear-frame" data-clear-frame="${field}" type="button" ${asset && !locked ? "" : "disabled"}>清空</button>
        <label class="tiny-button file-button">
          上传
          <input class="image-video-frame-upload" data-frame-action="${field}" type="file" accept="image/*" ${disabled}>
        </label>
        <button class="tiny-button paste-frame" data-frame-action="${field}" type="button" ${disabled}>粘贴</button>
      </div>
    </div>
  `;
}

function renderImageVideoAutoMultiShotControl(row) {
  const locked = isImageVideoRowLocked(row);
  const enabled = supportsImageVideoAutoMultiShot(row);
  if (!enabled) return `<span class="meta-line">空</span>`;
  return `
    <label class="inline-check">
      <input data-image-video-field="autoMultiShot" type="checkbox" ${row.autoMultiShot ? "checked" : ""} ${locked ? "disabled" : ""}>
      <span>开启</span>
    </label>
  `;
}

function renderImageVideoCountControl(row) {
  const disabled = isImageVideoRowLocked(row) ? "disabled" : "";
  return `
    <div class="number-control">
      <button class="image-video-count-minus" type="button" ${disabled}>-</button>
      <input data-image-video-field="count" type="number" min="1" step="1" value="${row.count}" ${disabled}>
      <button class="image-video-count-plus" type="button" ${disabled}>+</button>
    </div>
  `;
}

function renderMultiVideoRow(row, index) {
  const model = getMultiModel(row);
  const locked = isMultiRowLocked(row);
  const disabled = locked ? "disabled" : "";
  return `
    <tr data-multi-row-id="${row.id}" class="${locked ? "row-locked" : ""}">
      <td>
        <div class="index-action-cell">
          <div class="index-cell">
            <input class="multi-row-select" type="checkbox" ${row.selected ? "checked" : ""}>
            <strong>${index + 1}</strong>
          </div>
          <div class="row-actions">
            <button class="tiny-button submit-multi-row" type="button" ${disabled}>提交</button>
            <button class="tiny-button cancel-multi-row" type="button">取消</button>
            <button class="tiny-button duplicate-multi-row" type="button">复制行</button>
            <button class="tiny-button remove-multi-row" type="button" ${disabled}>删除</button>
          </div>
        </div>
      </td>
      <td>${renderRowStatusCell(row)}</td>
      <td>${renderPromptCell(row, disabled)}</td>
      <td>${renderReferencePicker(row)}</td>
      <td>${renderMultiModelCell(row, model, disabled)}</td>
      <td>${renderMultiParamsCell(row, model, disabled)}</td>
      <td>${renderMultiCountControl(row)}</td>
      <td data-task-result-cell>${renderTaskResultCell(row)}</td>
    </tr>
  `;
}

function renderReferencePicker(row) {
  row.refs = Array.isArray(row.refs) ? row.refs : [];
  const locked = isMultiRowLocked(row);
  const disabled = locked ? "disabled" : "";
  return `
    <div class="image-picker reference-picker ${locked ? "locked-picker" : ""}">
      <div class="image-drop reference-drop" data-reference-row="${row.id}" tabindex="0" title="拖入素材、选择缓存，或按 Ctrl+V 粘贴图片/素材 URL">
        ${row.refs.length ? row.refs.map(item => renderAssetChip(item, locked)).join("") : `<span class="empty-drop">${locked ? "生成中，素材已锁定" : "拖入图片/视频/音频，或选择历史缓存"}</span>`}
      </div>
      <div class="picker-actions">
        <button class="tiny-button choose-refs" type="button" ${disabled}>选择</button>
        <button class="tiny-button copy-refs" type="button" ${row.refs.length ? "" : "disabled"}>复制</button>
        <button class="tiny-button clear-refs" data-clear-multi-refs type="button" ${row.refs.length && !locked ? "" : "disabled"}>清空</button>
        <label class="tiny-button file-button">
          上传
          <input class="multi-row-upload" type="file" multiple ${disabled}>
        </label>
        <button class="tiny-button paste-refs" type="button" ${disabled}>粘贴</button>
      </div>
    </div>
  `;
}

function renderMultiCountControl(row) {
  const disabled = isMultiRowLocked(row) ? "disabled" : "";
  return `
    <div class="number-control">
      <button class="multi-count-minus" type="button" ${disabled}>-</button>
      <input data-multi-field="count" type="number" min="1" step="1" value="${row.count}" ${disabled}>
      <button class="multi-count-plus" type="button" ${disabled}>+</button>
    </div>
  `;
}

function renderRow(row, index) {
  const model = IMAGE_MODELS[row.model] || IMAGE_MODELS.nano;
  const qualityOptions = getQualityOptions(row);
  const locked = isRowLocked(row);
  const disabled = locked ? "disabled" : "";
  return `
    <tr data-row-id="${row.id}" class="${locked ? "row-locked" : ""}">
      <td>
        <div class="index-action-cell">
          <div class="index-cell">
            <input class="row-select" type="checkbox" ${row.selected ? "checked" : ""}>
            <strong>${index + 1}</strong>
          </div>
          <div class="row-actions">
            <button class="tiny-button submit-row" type="button" ${disabled}>提交</button>
            <button class="tiny-button cancel-row" type="button">取消</button>
            <button class="tiny-button duplicate-row" type="button">复制行</button>
            <button class="tiny-button remove-row" type="button" ${disabled}>删除</button>
          </div>
        </div>
      </td>
      <td>${renderRowStatusCell(row)}</td>
      <td>${renderPromptCell(row, disabled)}</td>
      <td>${renderImagePicker(row)}</td>
      <td>${renderImageModelCell(row, model, disabled)}</td>
      <td>${renderImageParamsCell(row, qualityOptions, disabled)}</td>
      <td>${renderCountControl(row)}</td>
      <td data-task-result-cell>${renderTaskResultCell(row)}</td>
    </tr>
  `;
}

function renderRowStatusCell(row) {
  const error = String(row?.error || "");
  return `
    <span class="status-pill status-${row.status}">${statusLabel(row)}</span>
    ${error ? `
      <div class="status-error-line">
        <span class="status-summary" title="${escapeAttr(error)}">${escapeHtml(error)}</span>
        <button class="tiny-button copy-row-error" data-row-error="${escapeAttr(row.error)}" type="button">复制报错信息</button>
      </div>
    ` : ""}
  `;
}

function renderTaskResultCell(row) {
  const taskIds = Array.isArray(row?.taskIds) ? row.taskIds : [];
  const results = Array.isArray(row?.results) ? row.results : [];
  const returnedSeeds = Array.isArray(row?.returnedSeeds) ? row.returnedSeeds : [];
  if (row?.status === "dirty" || (!taskIds.length && !results.length && !returnedSeeds.length)) {
    return `
      <div class="task-id-list"><span class="meta-line">尚未提交</span></div>
      <div class="result-list"></div>
    `;
  }
  return `
    <div class="task-id-list">${taskIds.map(id => `<code>${escapeHtml(id)}</code>`).join("")}</div>
    ${returnedSeeds.length ? `<div class="meta-line">Seed: ${returnedSeeds.map(seed => escapeHtml(seed)).join(" / ")}</div>` : ""}
    <div class="result-list">${results.map(result => renderResultItem(result)).join("")}</div>
  `;
}

function renderOptions(values, selected, emptyLabel) {
  const options = [`<option value="" ${selected ? "" : "selected"}>${emptyLabel}</option>`];
  values.forEach(value => {
    options.push(`<option value="${value}" ${selected === value ? "selected" : ""}>${value}</option>`);
  });
  return options.join("");
}

function renderStackedControlCell(items) {
  return `
    <div class="stacked-control-cell">
      ${items.filter(Boolean).map(item => `
        <label class="stacked-control-item">
          <span>${escapeHtml(item.label)}</span>
          ${item.control}
        </label>
      `).join("")}
    </div>
  `;
}

function renderImageModelCell(row, model, disabled) {
  return renderStackedControlCell([
    {
      label: "模型",
      control: `<select class="select-small" data-field="model" ${disabled}>
        ${Object.entries(IMAGE_MODELS).map(([key, item]) => `<option value="${key}" ${row.model === key ? "selected" : ""}>${item.label}</option>`).join("")}
      </select>`
    },
    {
      label: "版本",
      control: `<select class="select-small" data-field="version" ${disabled}>
        ${model.versions.map(version => `<option value="${version.value}" ${row.version === version.value ? "selected" : ""}>${version.label}</option>`).join("")}
      </select>`
    }
  ]);
}

function renderImageParamsCell(row, qualityOptions, disabled) {
  const model = IMAGE_MODELS[row.model] || IMAGE_MODELS.nano;
  return renderStackedControlCell([
    {
      label: "尺寸",
      control: `<select class="select-small" data-field="size" ${disabled}>
        ${renderOptions(model.sizes, row.size, "空")}
      </select>`
    },
    {
      label: "清晰度",
      control: `<select class="select-small" data-field="quality" ${disabled}>
        ${renderOptions(qualityOptions, row.quality, "空")}
      </select>`
    }
  ]);
}

function renderImageVideoModelCell(row, model, disabled) {
  return renderStackedControlCell([
    {
      label: "模型",
      control: `<select class="select-small" data-image-video-field="model" ${disabled}>
        ${Object.entries(IMAGE_VIDEO_MODELS).map(([key, item]) => `<option value="${key}" ${row.model === key ? "selected" : ""}>${item.label}</option>`).join("")}
      </select>`
    },
    {
      label: "版本",
      control: `<select class="select-small" data-image-video-field="version" ${disabled}>
        ${model.versions.map(version => `<option value="${version.value}" ${row.version === version.value ? "selected" : ""}>${version.label}</option>`).join("")}
      </select>`
    }
  ]);
}

function renderImageVideoParamsCell(row, disabled) {
  return renderStackedControlCell([
    {
      label: "尺寸",
      control: `<select class="select-small" data-image-video-field="size" ${disabled}>
        ${renderOptions(getImageVideoSizeOptions(row), row.size, "空")}
      </select>`
    },
    {
      label: "清晰度",
      control: `<select class="select-small" data-image-video-field="quality" ${disabled}>
        ${renderOptions(getImageVideoQualityOptions(row), row.quality, "空")}
      </select>`
    },
    {
      label: "时长",
      control: `<select class="select-small" data-image-video-field="duration" ${disabled}>
        ${renderOptions(getImageVideoDurationOptions(row), String(row.duration), "空")}
      </select>`
    }
  ]);
}

function renderMultiModelCell(row, model, disabled) {
  return renderStackedControlCell([
    {
      label: "模型",
      control: `<select class="select-small" data-multi-field="model" ${disabled}>
        ${Object.entries(MULTI_VIDEO_MODELS).map(([key, item]) => `<option value="${key}" ${row.model === key ? "selected" : ""}>${item.label}</option>`).join("")}
      </select>`
    },
    {
      label: "版本",
      control: `<select class="select-small" data-multi-field="version" ${disabled}>
        ${model.versions.map(version => `<option value="${version.value}" ${row.version === version.value ? "selected" : ""}>${version.label}</option>`).join("")}
      </select>`
    }
  ]);
}

function renderMultiParamsCell(row, model, disabled) {
  const controls = [
    {
      label: "尺寸",
      control: `<select class="select-small" data-multi-field="size" ${disabled}>
        ${renderOptions(model.sizes, row.size, "空")}
      </select>`
    },
    {
      label: "清晰度",
      control: `<select class="select-small" data-multi-field="quality" ${disabled}>
        ${renderOptions(getMultiQualityOptions(row), row.quality, "空")}
      </select>`
    },
    {
      label: "时长",
      control: `<select class="select-small" data-multi-field="duration" ${disabled}>
        ${renderOptions(model.durations, String(row.duration), "空")}
      </select>`
    }
  ];
  if (model.supportsGenerateAudio) {
    controls.push({
      label: "声音",
      control: `<input data-multi-field="generateAudio" type="checkbox" ${row.generateAudio ? "checked" : ""} ${disabled}>`
    });
  }
  return renderStackedControlCell(controls);
}

function renderViduRefModelCell(row, disabled) {
  return renderStackedControlCell([
    {
      label: "模型",
      control: `<div class="stacked-static-value">Vidu Q3</div>`
    },
    {
      label: "版本",
      control: `<select class="select-small" data-vidu-ref-field="version" ${disabled}>
        ${VIDU_REF_VIDEO_MODEL.versions.map(version => `<option value="${version.value}" ${row.version === version.value ? "selected" : ""}>${version.label}</option>`).join("")}
      </select>`
    }
  ]);
}

function renderViduRefParamsCell(row, disabled) {
  return renderStackedControlCell([
    {
      label: "尺寸",
      control: `<select class="select-small" data-vidu-ref-field="size" ${disabled}>
        ${renderOptions(VIDU_REF_VIDEO_MODEL.sizes, row.size, "空")}
      </select>`
    },
    {
      label: "清晰度",
      control: `<select class="select-small" data-vidu-ref-field="quality" ${disabled}>
        ${renderOptions(getViduRefQualityOptions(row), row.quality, "空")}
      </select>`
    },
    {
      label: "时长",
      control: `<select class="select-small" data-vidu-ref-field="duration" ${disabled}>
        ${renderOptions(getViduRefDurationOptions(row), String(row.duration), "空")}
      </select>`
    }
  ]);
}

function renderMotionModelCell(row, model, disabled) {
  return renderStackedControlCell([
    {
      label: "模型",
      control: `<select class="select-small" data-motion-field="model" ${disabled}>
        ${motionModelEntries().map(([key, item]) => `<option value="${key}" ${row.model === key ? "selected" : ""}>${item.label}</option>`).join("")}
      </select>`
    },
    {
      label: "版本",
      control: `<select class="select-small" data-motion-field="version" ${disabled}>
        ${model.versions.map(version => `<option value="${version.value}" ${row.version === version.value ? "selected" : ""}>${version.label}</option>`).join("")}
      </select>`
    }
  ]);
}

function renderMotionParamsCell(row, model, disabled) {
  return renderStackedControlCell([
    {
      label: "尺寸",
      control: `<select class="select-small" data-motion-field="size" ${disabled}>
        ${renderOptions(model.sizes, row.size, "空")}
      </select>`
    },
    {
      label: "清晰度",
      control: `<select class="select-small" data-motion-field="quality" ${disabled}>
        ${renderOptions(model.qualities, row.quality, "空")}
      </select>`
    }
  ]);
}

function renderAvatarModelCell(row, model, disabled) {
  return renderStackedControlCell([
    {
      label: "模型",
      control: `<select class="select-small" data-avatar-field="model" ${disabled}>
        ${avatarModelEntries().map(([key, item]) => `<option value="${key}" ${row.model === key ? "selected" : ""}>${item.label}</option>`).join("")}
      </select>`
    },
    {
      label: "版本",
      control: `<select class="select-small" data-avatar-field="version" ${disabled}>
        ${model.versions.map(version => `<option value="${version.value}" ${row.version === version.value ? "selected" : ""}>${version.label}</option>`).join("")}
      </select>`
    }
  ]);
}

function renderPromptCell(row, disabled = "") {
  const text = row.prompt || "";
  return `
    <div class="prompt-cell collapsed">
      <textarea class="prompt-input" data-field="prompt" rows="4" title="多模态页可用 @1、@2 或 @素材名 指定参考素材" ${disabled}>${escapeHtml(text)}</textarea>
      <div class="prompt-actions">
        <button class="tiny-button toggle-prompt" type="button">查看全部</button>
        <button class="tiny-button copy-prompt" type="button" ${text.trim() ? "" : "disabled"}>复制提示词</button>
        <button class="tiny-button paste-prompt" type="button" ${disabled}>粘贴提示词</button>
        <button class="tiny-button clear-prompt" type="button" ${text.trim() && !disabled ? "" : "disabled"}>清空提示词</button>
      </div>
    </div>
  `;
}
function renderCountControl(row) {
  const disabled = isRowLocked(row) ? "disabled" : "";
  return `
    <div class="number-control">
      <button class="count-minus" type="button" ${disabled}>-</button>
      <input data-field="count" type="number" min="1" step="1" value="${row.count}" ${disabled}>
      <button class="count-plus" type="button" ${disabled}>+</button>
    </div>
  `;
}

function renderImagePicker(row) {
  row.images = Array.isArray(row.images) ? row.images : [];
  const locked = isRowLocked(row);
  const disabled = locked ? "disabled" : "";
  return `
    <div class="image-picker ${locked ? "locked-picker" : ""}">
      <div class="image-drop" data-drop-row="${row.id}" tabindex="0" title="点击这里后按 Ctrl+V 可粘贴截图或复制的图片">
        ${row.images.length ? row.images.map(item => renderAssetChip(item, locked)).join("") : `<span class="empty-drop">${locked ? "生成中，素材已锁定" : "拖入图片、选择历史或粘贴图片"}</span>`}
      </div>
      <div class="picker-actions">
        <button class="tiny-button choose-assets" type="button" ${disabled}>选择</button>
        <button class="tiny-button copy-images" type="button" ${row.images.length ? "" : "disabled"}>复制</button>
        <button class="tiny-button clear-row-assets" data-clear-row-assets type="button" ${row.images.length && !locked ? "" : "disabled"}>清空</button>
        <label class="tiny-button file-button">
          上传
          <input class="row-upload" type="file" accept="image/*" multiple ${disabled}>
        </label>
        <button class="tiny-button paste-images" type="button" ${disabled}>粘贴</button>
      </div>
    </div>
  `;
}

function renderAssetChip(item, locked = false) {
  return `
    <div class="asset-chip asset-chip-${item.type || "other"}" draggable="${locked ? "false" : "true"}" data-asset-id="${item.id}">
      ${item.type === "video" ? `<video src="${escapeAttr(item.preview || item.url)}" controls preload="metadata"></video>` : item.type === "audio" ? `<audio src="${escapeAttr(item.url)}" controls preload="metadata"></audio>` : `<img src="${escapeAttr(item.preview || item.url)}" alt="">`}
      <small>${assetMeta(item)}</small>
      <button class="chip-remove" type="button" data-remove-asset="${item.id}" ${locked ? "disabled" : ""}>x</button>
    </div>
  `;
}

function collectPromptReferences(row, type) {
  const make = (asset, label) => asset ? { asset, label } : null;
  if (type === "image") return (row.images || []).map((asset, index) => make(asset, `图片 ${index + 1}`)).filter(Boolean);
  if (type === "imageVideo") return [
    make(row.firstFrame, "首帧图"),
    make(row.lastFrame, "尾帧图")
  ].filter(Boolean);
  if (type === "multi") return (row.refs || []).map((asset, index) => make(asset, `@${index + 1}`)).filter(Boolean);
  if (type === "viduRef") return (row.refs || []).map((asset, index) => make(asset, `@${index + 1}`)).filter(Boolean);
  if (type === "motion") return [
    make(row.image, "图"),
    make(row.video, "参考视频")
  ].filter(Boolean);
  if (type === "avatar") return [
    make(row.image, "图片"),
    make(row.audio, "音频")
  ].filter(Boolean);
  return [
    ...(row.images || []).map((asset, index) => make(asset, `图片 ${index + 1}`)),
    ...(row.refs || []).map((asset, index) => make(asset, `参考 ${index + 1}`)),
    make(row.image, "图片"),
    make(row.video, "视频"),
    make(row.audio, "音频")
  ].filter(Boolean);
}

function renderPromptDetailReference(entry) {
  const item = entry.asset || entry;
  const title = entry.label || item.name || "参考素材";
  const source = item.preview || item.url;
  const displayName = shortAssetName(item.name || item.url || "打开文件", 42);
  const media = item.type === "video"
    ? `<video src="${escapeAttr(source)}" controls preload="metadata"></video>`
    : item.type === "audio"
      ? `<audio src="${escapeAttr(item.url)}" controls preload="metadata"></audio>`
      : `<img src="${escapeAttr(source)}" loading="lazy" decoding="async" alt="">`;
  return `
    <article class="prompt-detail-ref-card">
      <div class="prompt-detail-ref-title">${escapeHtml(title)}</div>
      <div class="prompt-detail-ref-media">${media}</div>
      <div class="meta-line">${escapeHtml(assetMeta(item))}</div>
      <a class="url-line" href="${escapeAttr(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(displayName)}</a>
    </article>
  `;
}

function shortAssetName(value, max = 42) {
  const text = String(value || "");
  return text.length > max ? `${text.slice(0, Math.max(8, max - 14))}...${text.slice(-10)}` : text;
}

function openPromptDetailPanel(row, refs) {
  const overlay = ensurePromptDetailOverlay();
  const prompt = String(row.prompt || "");
  overlay.querySelector("[data-prompt-detail-prompt]").value = prompt || "无 Prompt";
  overlay.querySelector("[data-prompt-detail-copy]").disabled = !prompt.trim();
  const refsBox = overlay.querySelector("[data-prompt-detail-refs]");
  refsBox.innerHTML = refs.length
    ? refs.map(renderPromptDetailReference).join("")
    : `<div class="empty-drop">这一行没有参考素材</div>`;
  overlay.classList.add("open");
}

function ensurePromptDetailOverlay() {
  let overlay = document.querySelector(".prompt-detail-overlay");
  if (overlay) return overlay;
  overlay = document.createElement("div");
  overlay.className = "prompt-detail-overlay";
  overlay.innerHTML = `
    <section class="prompt-detail-panel" role="dialog" aria-modal="true" aria-label="完整提示词">
      <div class="modal-head prompt-detail-head">
        <h2>完整提示词</h2>
        <button class="button ghost-button" type="button" data-prompt-detail-close>关闭</button>
      </div>
      <div class="prompt-detail-body">
        <section class="prompt-detail-prompt-wrap">
          <div class="prompt-detail-section-head">
            <strong>Prompt</strong>
            <button class="tiny-button" type="button" data-prompt-detail-copy>复制提示词</button>
          </div>
          <textarea class="prompt-detail-prompt" data-prompt-detail-prompt readonly></textarea>
        </section>
        <section class="prompt-detail-ref-wrap">
          <div class="prompt-detail-section-head">
            <strong>参考素材</strong>
          </div>
          <div class="prompt-detail-refs" data-prompt-detail-refs></div>
        </section>
      </div>
    </section>
  `;
  overlay.addEventListener("click", event => {
    if (event.target === overlay) overlay.classList.remove("open");
  });
  overlay.querySelector("[data-prompt-detail-close]").addEventListener("click", () => overlay.classList.remove("open"));
  overlay.querySelector("[data-prompt-detail-copy]").addEventListener("click", () => {
    copyPromptText(overlay.querySelector("[data-prompt-detail-prompt]").value);
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && overlay.classList.contains("open")) overlay.classList.remove("open");
  });
  document.body.appendChild(overlay);
  return overlay;
}

function openBatchPromptDialog() {
  if (!state.batchDefaults) {
    const first = state.rows.find(row => !isRowLocked(row)) || createRow();
    state.batchDefaults = {
      model: first.model,
      version: first.version,
      size: first.size,
      quality: first.quality,
      count: Math.max(1, Number(first.count || 1))
    };
  }
  renderBatchDefaults();
  pasteDialog.showModal();
}

function renderBatchDefaults() {
  const defaults = normalizeBatchDefaults(state.batchDefaults);
  state.batchDefaults = defaults;
  const rowLike = createRow(defaults);
  batchModel.innerHTML = Object.entries(IMAGE_MODELS).map(([key, item]) => `<option value="${key}" ${defaults.model === key ? "selected" : ""}>${item.label}</option>`).join("");
  batchVersion.innerHTML = getModel(rowLike).versions.map(version => `<option value="${version.value}" ${defaults.version === version.value ? "selected" : ""}>${version.label}</option>`).join("");
  batchSize.innerHTML = renderOptions(getModel(rowLike).sizes, defaults.size, "空");
  batchQuality.innerHTML = renderOptions(getQualityOptions(rowLike), defaults.quality, "空");
  batchCount.value = defaults.count;
  renderBatchImages();
}

function renderBatchImages() {
  batchImageDrop.innerHTML = state.batchImages.length
    ? state.batchImages.map(item => renderAssetChip(item)).join("")
    : `<span class="empty-drop">批量生成行会统一带上这里的图片</span>`;
  batchCopyImages.disabled = state.batchImages.length === 0;
  batchImageDrop.querySelectorAll("[data-remove-asset]").forEach(button => {
    button.addEventListener("click", () => {
      state.batchImages = state.batchImages.filter(item => item.id !== button.dataset.removeAsset);
      renderBatchImages();
    });
  });
  batchImageDrop.querySelectorAll(".asset-chip").forEach(chip => {
    chip.addEventListener("dragstart", event => {
      const asset = state.batchImages.find(item => item.id === chip.dataset.assetId);
      event.dataTransfer.setData("application/x-api-asset", JSON.stringify(asset));
      event.dataTransfer.effectAllowed = "copy";
    });
  });
}

function normalizeBatchDefaults(defaults = {}) {
  const model = IMAGE_MODELS[defaults.model] ? defaults.model : "nano";
  const config = IMAGE_MODELS[model];
  const rowLike = {
    model,
    version: config.versions.some(item => item.value === defaults.version) ? defaults.version : config.versions[0].value,
    size: config.sizes.includes(defaults.size) ? defaults.size : (config.sizes[0] || ""),
    quality: config.qualities.includes(defaults.quality) ? defaults.quality : (config.qualities[1] || config.qualities[0] || ""),
    count: Math.max(1, Number(defaults.count || 1))
  };
  if (model === "gpt") {
    rowLike.version = "gpt-image-2";
    rowLike.quality = normalizeGptQualityChoice(defaults.quality || rowLike.quality);
    rowLike.size = normalizeGptRatioChoice(defaults.size || rowLike.size);
  } else if (model === "seedream") {
    rowLike.quality = normalizeSeedreamQuality(defaults.quality || rowLike.quality, rowLike.version);
  } else if (model === "klingOmni") {
    rowLike.quality = normalizeKlingResolution(defaults.quality || rowLike.quality);
  }
  return rowLike;
}

function readBatchDefaultsFromControls() {
  return normalizeBatchDefaults({
    model: batchModel.value,
    version: batchVersion.value,
    size: batchSize.value,
    quality: batchQuality.value,
    count: batchCount.value
  });
}

function bindBatchDefaultControls() {
  batchModel.addEventListener("change", () => {
    const previous = readBatchDefaultsFromControls();
    const config = IMAGE_MODELS[batchModel.value] || IMAGE_MODELS.nano;
    state.batchDefaults = normalizeBatchDefaults({
      model: batchModel.value,
      version: config.versions[0].value,
      size: chooseCompatibleOption(previous.size, config.sizes),
      quality: chooseCompatibleOption(previous.quality, config.qualities, config.qualities[1] || config.qualities[0] || ""),
      count: previous.count
    });
    state.batchImages = state.batchImages.slice(0, getBatchModel().maxImages);
    renderBatchDefaults();
  });
  batchVersion.addEventListener("change", () => {
    state.batchDefaults = normalizeBatchDefaults({ ...readBatchDefaultsFromControls(), version: batchVersion.value });
    renderBatchDefaults();
  });
  batchSize.addEventListener("change", () => {
    state.batchDefaults = normalizeBatchDefaults({ ...readBatchDefaultsFromControls(), size: batchSize.value });
  });
  batchQuality.addEventListener("change", () => {
    state.batchDefaults = normalizeBatchDefaults({ ...readBatchDefaultsFromControls(), quality: batchQuality.value });
  });
  batchCount.addEventListener("change", () => {
    state.batchDefaults = normalizeBatchDefaults({ ...readBatchDefaultsFromControls(), count: batchCount.value });
    batchCount.value = state.batchDefaults.count;
  });
  batchChooseAssets.addEventListener("click", () => openAssetDialog("__batch__", "image"));
  batchUploadImages.addEventListener("change", event => uploadBatchFiles(Array.from(event.target.files || [])));
  batchPasteImages.addEventListener("click", pasteClipboardToBatch);
  batchCopyImages.addEventListener("click", copyBatchImages);
  batchClearImages.addEventListener("click", () => {
    state.batchImages = [];
    renderBatchImages();
  });
  batchImageDrop.addEventListener("focus", () => {
    state.pasteTarget = { type: "batch" };
  });
  batchImageDrop.addEventListener("click", () => {
    state.pasteTarget = { type: "batch" };
    batchImageDrop.focus();
  });
  batchImageDrop.addEventListener("dragover", event => {
    event.preventDefault();
    batchImageDrop.classList.add("drag-over");
  });
  batchImageDrop.addEventListener("dragleave", () => batchImageDrop.classList.remove("drag-over"));
  batchImageDrop.addEventListener("drop", event => {
    event.preventDefault();
    batchImageDrop.classList.remove("drag-over");
    const assetText = event.dataTransfer.getData("application/x-api-asset");
    if (assetText) {
      addAssetsToBatch([JSON.parse(assetText)]);
      return;
    }
    const files = Array.from(event.dataTransfer.files || []).filter(file => file.type.startsWith("image/"));
    if (files.length) uploadBatchFiles(files);
  });
}

function renderResultItem(result) {
  const url = typeof result === "string" ? result : result.url || JSON.stringify(result);
  const type = guessType(url);
  const filename = fileNameFromUrl(url, "result");
  const token = `url:${url}`;
  return `
    <div class="result-item result-item-${escapeAttr(type)}">
      <div class="result-preview">
        ${type === "image" ? `<a href="${escapeAttr(url)}" target="_blank" rel="noreferrer"><img src="${escapeAttr(url)}" loading="lazy" decoding="async" alt=""></a>` : ""}
        ${type === "video" ? `<button class="result-video-thumb" data-open-history-video="${escapeAttr(token)}" data-video-viewer-source="result" type="button"><span>&#25773;&#25918;</span><small>${escapeHtml(filename)}</small></button>` : ""}
        ${type === "audio" ? `<audio src="${escapeAttr(url)}" controls preload="metadata"></audio>` : ""}
        ${!["image", "video", "audio"].includes(type) ? `<a class="url-line" href="${escapeAttr(url)}" target="_blank" rel="noreferrer">&#25171;&#24320;&#32467;&#26524;</a>` : ""}
      </div>
      <a class="result-url" href="${escapeAttr(url)}" target="_blank" rel="noreferrer">${escapeHtml(shortUrl(url))}</a>
      <div class="result-actions">
        ${type === "video" ? `<button class="tiny-button" data-open-history-video="${escapeAttr(token)}" data-video-viewer-source="result" type="button">&#39044;&#35272;/&#25277;&#24103;</button>` : ""}
        ${type === "image" ? `<button class="tiny-button" data-send-result-upload="${escapeAttr(url)}" type="button">加入上传缓存</button>` : ""}
        <button class="tiny-button download-link" data-download-url="${escapeAttr(url)}" data-download-name="${escapeAttr(filename)}" type="button">&#19979;&#36733;</button>
      </div>
    </div>
  `;
}

function bindImagePage() {
  document.querySelector("#maxConcurrency").addEventListener("change", event => {
    const value = Math.max(1, Number(event.target.value || 1));
    localStorage.setItem(STORAGE_KEYS.maxConcurrency, String(value));
    runQueue();
  });
  document.querySelector("#globalUpload").addEventListener("change", event => uploadFiles(Array.from(event.target.files || [])));
  document.querySelector("#addRowBtn").addEventListener("click", () => {
    const row = createRow();
    state.rows.push(row);
    state.scrollToImageRowId = row.id;
    persistRows();
    render();
  });
  document.querySelector("#pastePromptBtn").addEventListener("click", openBatchPromptDialog);
  document.querySelector("#submitSelectedBtn").addEventListener("click", () => enqueueRows(state.rows.filter(row => row.selected)));
  document.querySelector("#submitAllBtn").addEventListener("click", () => enqueueRows(state.rows.filter(row => SUBMITTABLE_ROW_STATUSES.includes(row.status))));
  document.querySelector("#cancelQueuedBtn").addEventListener("click", () => cancelQueuedJobs());
  document.querySelector("#deleteSelectedRowsBtn").addEventListener("click", deleteSelectedRows);
  document.querySelector("#clearDonePageBtn").addEventListener("click", clearDoneRows);

  document.querySelectorAll("tr[data-row-id]").forEach(tr => bindRow(tr, findRow(tr.dataset.rowId)));
  bindDownloadButtons();
  scrollToPendingImageRow();
}

function bindMultiVideoPage() {
  document.querySelector("#multiMaxConcurrency").addEventListener("change", event => {
    const value = Math.max(1, Number(event.target.value || 1));
    localStorage.setItem(STORAGE_KEYS.maxConcurrency, String(value));
    runMultiQueue();
  });
  document.querySelector("#multiGlobalUpload").addEventListener("change", event => uploadFiles(Array.from(event.target.files || [])));
  document.querySelector("#addMultiRowBtn").addEventListener("click", () => {
    const row = createMultiRow();
    state.multiRows.push(row);
    state.scrollToMultiRowId = row.id;
    persistMultiRows();
    render();
  });
  document.querySelector("#submitSelectedMultiBtn").addEventListener("click", () => enqueueMultiRows(state.multiRows.filter(row => row.selected)));
  document.querySelector("#submitAllMultiBtn").addEventListener("click", () => enqueueMultiRows(state.multiRows.filter(row => SUBMITTABLE_ROW_STATUSES.includes(row.status))));
  document.querySelector("#cancelMultiQueuedBtn").addEventListener("click", () => cancelMultiQueuedJobs());
  document.querySelector("#deleteSelectedMultiRowsBtn").addEventListener("click", deleteSelectedMultiRows);
  document.querySelector("#clearDoneMultiBtn").addEventListener("click", clearDoneMultiRows);
  document.querySelectorAll("tr[data-multi-row-id]").forEach(tr => bindMultiRow(tr, findMultiRow(tr.dataset.multiRowId)));
  bindDownloadButtons();
  scrollToPendingMultiRow();
}

function bindViduRefPage() {
  document.querySelector("#viduRefMaxConcurrency").addEventListener("change", event => {
    const value = Math.max(1, Number(event.target.value || 1));
    localStorage.setItem(STORAGE_KEYS.maxConcurrency, String(value));
    runViduRefQueue();
  });
  document.querySelector("#viduRefGlobalUpload").addEventListener("change", event => uploadViduRefFiles(Array.from(event.target.files || [])));
  document.querySelector("#addViduRefRowBtn").addEventListener("click", () => {
    const row = createViduRefRow();
    state.viduRefRows.push(row);
    state.scrollToViduRefRowId = row.id;
    persistViduRefRows();
    render();
  });
  document.querySelector("#submitSelectedViduRefBtn").addEventListener("click", () => enqueueViduRefRows(state.viduRefRows.filter(row => row.selected)));
  document.querySelector("#submitAllViduRefBtn").addEventListener("click", () => enqueueViduRefRows(state.viduRefRows.filter(row => SUBMITTABLE_ROW_STATUSES.includes(row.status))));
  document.querySelector("#cancelViduRefQueuedBtn").addEventListener("click", () => cancelViduRefQueuedJobs());
  document.querySelector("#deleteSelectedViduRefRowsBtn").addEventListener("click", deleteSelectedViduRefRows);
  document.querySelector("#clearDoneViduRefBtn").addEventListener("click", clearDoneViduRefRows);
  document.querySelectorAll("tr[data-vidu-ref-row-id]").forEach(tr => bindViduRefRow(tr, findViduRefRow(tr.dataset.viduRefRowId)));
  bindDownloadButtons();
  scrollToPendingViduRefRow();
}

function bindImageVideoPage() {
  document.querySelector("#imageVideoMaxConcurrency").addEventListener("change", event => {
    const value = Math.max(1, Number(event.target.value || 1));
    localStorage.setItem(STORAGE_KEYS.maxConcurrency, String(value));
    runImageVideoQueue();
  });
  document.querySelector("#imageVideoGlobalUpload").addEventListener("change", event => uploadFiles(Array.from(event.target.files || [])));
  document.querySelector("#addImageVideoRowBtn").addEventListener("click", () => {
    const row = createImageVideoRow();
    state.imageVideoRows.push(row);
    state.scrollToImageVideoRowId = row.id;
    persistImageVideoRows();
    render();
  });
  document.querySelector("#submitSelectedImageVideoBtn").addEventListener("click", () => enqueueImageVideoRows(state.imageVideoRows.filter(row => row.selected)));
  document.querySelector("#submitAllImageVideoBtn").addEventListener("click", () => enqueueImageVideoRows(state.imageVideoRows.filter(row => SUBMITTABLE_ROW_STATUSES.includes(row.status))));
  document.querySelector("#cancelImageVideoQueuedBtn").addEventListener("click", () => cancelImageVideoQueuedJobs());
  document.querySelector("#deleteSelectedImageVideoRowsBtn").addEventListener("click", deleteSelectedImageVideoRows);
  document.querySelector("#clearDoneImageVideoBtn").addEventListener("click", clearDoneImageVideoRows);
  document.querySelectorAll("tr[data-image-video-row-id]").forEach(tr => bindImageVideoRow(tr, findImageVideoRow(tr.dataset.imageVideoRowId)));
  bindDownloadButtons();
  scrollToPendingImageVideoRow();
}

function bindMotionPage() {
  document.querySelector("#motionMaxConcurrency").addEventListener("change", event => {
    const value = Math.max(1, Number(event.target.value || 1));
    localStorage.setItem(STORAGE_KEYS.maxConcurrency, String(value));
    runMotionQueue();
  });
  document.querySelector("#motionGlobalUpload").addEventListener("change", event => uploadFiles(Array.from(event.target.files || [])));
  document.querySelector("#addMotionRowBtn").addEventListener("click", () => {
    const row = createMotionRow();
    state.motionRows.push(row);
    state.scrollToMotionRowId = row.id;
    persistMotionRows();
    render();
  });
  document.querySelector("#submitSelectedMotionBtn").addEventListener("click", () => enqueueMotionRows(state.motionRows.filter(row => row.selected)));
  document.querySelector("#submitAllMotionBtn").addEventListener("click", () => enqueueMotionRows(state.motionRows.filter(row => SUBMITTABLE_ROW_STATUSES.includes(row.status))));
  document.querySelector("#cancelMotionQueuedBtn").addEventListener("click", () => cancelMotionQueuedJobs());
  document.querySelector("#deleteSelectedMotionRowsBtn").addEventListener("click", deleteSelectedMotionRows);
  document.querySelector("#clearDoneMotionBtn").addEventListener("click", clearDoneMotionRows);
  document.querySelectorAll("tr[data-motion-row-id]").forEach(tr => bindMotionRow(tr, findMotionRow(tr.dataset.motionRowId)));
  bindDownloadButtons();
  scrollToPendingMotionRow();
}

function bindAvatarPage() {
  document.querySelector("#avatarMaxConcurrency").addEventListener("change", event => {
    const value = Math.max(1, Number(event.target.value || 1));
    localStorage.setItem(STORAGE_KEYS.maxConcurrency, String(value));
    runAvatarQueue();
  });
  document.querySelector("#avatarJimengCreate")?.addEventListener("change", event => {
    localStorage.setItem(STORAGE_KEYS.avatarJimengCreate, normalizeEndpointPath(event.target.value.trim() || AVATAR_MODELS.jimeng.endpoint));
  });
  document.querySelector("#avatarJimengQuery")?.addEventListener("change", event => {
    localStorage.setItem(STORAGE_KEYS.avatarJimengQuery, normalizeEndpointPath(event.target.value.trim() || AVATAR_MODELS.jimeng.queryEndpoint));
  });
  document.querySelector("#avatarKlingCreate")?.addEventListener("change", event => {
    localStorage.setItem(STORAGE_KEYS.avatarKlingCreate, normalizeEndpointPath(event.target.value.trim() || AVATAR_MODELS.kling.endpoint));
  });
  document.querySelector("#avatarKlingQuery")?.addEventListener("change", event => {
    localStorage.setItem(STORAGE_KEYS.avatarKlingQuery, normalizeEndpointPath(event.target.value.trim() || AVATAR_MODELS.kling.queryEndpoint));
  });
  document.querySelector("#avatarGlobalUpload").addEventListener("change", event => uploadFiles(Array.from(event.target.files || [])));
  document.querySelector("#addAvatarRowBtn").addEventListener("click", () => {
    const row = createAvatarRow();
    state.avatarRows.push(row);
    state.scrollToAvatarRowId = row.id;
    persistAvatarRows();
    render();
  });
  document.querySelector("#submitSelectedAvatarBtn").addEventListener("click", () => enqueueAvatarRows(state.avatarRows.filter(row => row.selected)));
  document.querySelector("#submitAllAvatarBtn").addEventListener("click", () => enqueueAvatarRows(state.avatarRows.filter(row => SUBMITTABLE_ROW_STATUSES.includes(row.status))));
  document.querySelector("#cancelAvatarQueuedBtn").addEventListener("click", () => cancelAvatarQueuedJobs());
  document.querySelector("#deleteSelectedAvatarRowsBtn").addEventListener("click", deleteSelectedAvatarRows);
  document.querySelector("#clearDoneAvatarBtn").addEventListener("click", clearDoneAvatarRows);
  document.querySelectorAll("tr[data-avatar-row-id]").forEach(tr => bindAvatarRow(tr, findAvatarRow(tr.dataset.avatarRowId)));
  bindDownloadButtons();
  scrollToPendingAvatarRow();
}

function bindMusicPage() {
  document.querySelectorAll("[data-music-tool]").forEach(button => {
    button.addEventListener("click", () => {
      state.musicTool = button.dataset.musicTool;
      localStorage.setItem(STORAGE_KEYS.musicTool, state.musicTool);
      render();
    });
  });
  document.querySelector("#musicGlobalUpload")?.addEventListener("change", event => uploadFiles(Array.from(event.target.files || []), null, "audio"));
  document.querySelector("#sunoApiMode")?.addEventListener("change", event => {
    localStorage.setItem(STORAGE_KEYS.sunoApiMode, event.target.value === "direct" ? "direct" : "gateway");
    render();
  });
  document.querySelector("#sunoApiBase")?.addEventListener("change", event => {
    localStorage.setItem(STORAGE_KEYS.sunoApiBase, event.target.value.trim() || SUNO_API_DEFAULT);
  });
  document.querySelector("#sunoApiKey")?.addEventListener("change", event => {
    localStorage.setItem(STORAGE_KEYS.sunoApiKey, event.target.value.trim());
  });
  document.querySelector("#sunoGatewayGenerate")?.addEventListener("change", event => {
    localStorage.setItem(STORAGE_KEYS.sunoGatewayGenerate, normalizeEndpointPath(event.target.value.trim() || "/v1/generate"));
  });
  document.querySelector("#sunoGatewayQuery")?.addEventListener("change", event => {
    localStorage.setItem(STORAGE_KEYS.sunoGatewayQuery, normalizeEndpointPath(event.target.value.trim() || "/v1/generate/record-info"));
  });
  document.querySelectorAll("[data-suno-operation]").forEach(button => {
    button.addEventListener("click", () => {
      state.sunoState.activeOperation = button.dataset.sunoOperation;
      persistSunoState();
      render();
    });
  });
  const opKey = state.sunoState.activeOperation;
  const opState = getSunoOperationState(opKey);
  document.querySelectorAll("[data-suno-field]").forEach(input => {
    const update = () => {
      const value = input.type === "checkbox" ? input.checked : input.value;
      updateSunoField(opKey, input.dataset.sunoField, value, input.type !== "textarea");
    };
    input.addEventListener("change", update);
    if (input.tagName === "TEXTAREA") input.addEventListener("input", update);
  });
  document.querySelectorAll("[data-suno-custom-mode]").forEach(button => {
    button.addEventListener("click", () => {
      updateSunoField(opKey, "customMode", button.dataset.sunoCustomMode === "true");
      render();
    });
  });
  document.querySelector("[data-suno-instrumental-toggle]")?.addEventListener("click", () => {
    updateSunoField(opKey, "instrumental", !Boolean(getSunoOperationState(opKey).form.instrumental));
    render();
  });
  document.querySelectorAll("[data-suno-instrumental-value]").forEach(button => {
    button.addEventListener("click", () => {
      updateSunoField(opKey, "instrumental", button.dataset.sunoInstrumentalValue === "true");
      render();
    });
  });
  document.querySelectorAll("[data-suno-focus-field]").forEach(button => {
    button.addEventListener("click", () => {
      document.querySelector(`[data-suno-field="${CSS.escape(button.dataset.sunoFocusField)}"]`)?.focus();
    });
  });
  document.querySelector("[data-suno-quick-lyrics]")?.addEventListener("click", () => {
    updateSunoField(opKey, "customMode", true);
    updateSunoField(opKey, "instrumental", false);
    render();
  });
  document.querySelectorAll("[data-suno-set-field]").forEach(button => {
    button.addEventListener("click", () => {
      updateSunoField(opKey, button.dataset.sunoSetField, button.dataset.sunoSetValue);
      render();
    });
  });
  document.querySelectorAll("[data-suno-suggestion]").forEach(button => {
    button.addEventListener("click", () => {
      const form = getSunoOperationState(opKey).form;
      const next = [form.prompt, button.dataset.sunoSuggestion].filter(Boolean).join(form.prompt ? ", " : "");
      updateSunoField(opKey, "prompt", next);
      render();
    });
  });
  document.querySelectorAll("[data-suno-style-suggestion]").forEach(button => {
    button.addEventListener("click", () => {
      const form = getSunoOperationState(opKey).form;
      const next = [form.style, button.dataset.sunoStyleSuggestion].filter(Boolean).join(form.style ? ", " : "");
      updateSunoField(opKey, "style", next);
      render();
    });
  });
  document.querySelector("#submitSunoOperation")?.addEventListener("click", () => submitSunoOperation(opKey));
  document.querySelector("#resetSunoOperation")?.addEventListener("click", () => {
    state.sunoState.operations[opKey] = normalizeSunoOperationState(opKey, { form: opState.form });
    persistSunoState();
    render();
  });
  document.querySelectorAll(".choose-suno-asset").forEach(button => {
    button.addEventListener("click", () => openAssetDialog(`suno:${opKey}:${button.dataset.sunoAssetField}`, "audio"));
  });
  document.querySelectorAll(".copy-suno-asset").forEach(button => {
    button.addEventListener("click", () => {
      const asset = getSunoOperationState(opKey).form[button.dataset.sunoAssetField];
      copyReferenceAssets(asset ? [asset] : []);
    });
  });
  document.querySelectorAll(".paste-suno-asset").forEach(button => {
    button.addEventListener("click", () => pasteClipboardToSunoAsset(opKey, button.dataset.sunoAssetField));
  });
  document.querySelectorAll(".suno-asset-upload").forEach(input => {
    input.addEventListener("change", event => uploadSunoAssetFiles(Array.from(event.target.files || []), opKey, input.dataset.sunoAssetField));
  });
  document.querySelectorAll("[data-remove-asset]").forEach(button => {
    button.addEventListener("click", () => {
      removeSunoAsset(opKey, button.dataset.removeAsset);
    });
  });
  document.querySelectorAll(".suno-audio-drop").forEach(drop => {
    const field = drop.dataset.sunoAssetField;
    drop.addEventListener("focus", () => {
      state.pasteTarget = { type: "suno", opKey, field };
    });
    drop.addEventListener("click", () => {
      state.pasteTarget = { type: "suno", opKey, field };
      drop.focus();
    });
    drop.addEventListener("dragover", event => {
      event.preventDefault();
      drop.classList.add("drag-over");
    });
    drop.addEventListener("dragleave", () => drop.classList.remove("drag-over"));
    drop.addEventListener("drop", event => handleSunoAssetDrop(event, opKey, field, drop));
  });
  bindDownloadButtons();
}

function bindViduVoicePage() {
  document.querySelector("#viduVoiceEndpoint")?.addEventListener("change", event => {
    localStorage.setItem(STORAGE_KEYS.viduVoiceEndpoint, event.target.value.trim() || VIDU_VOICE_ENDPOINT_CANDIDATES[0]);
  });
  document.querySelector("#viduVoiceGlobalUpload")?.addEventListener("change", event => uploadViduVoiceFiles(Array.from(event.target.files || [])));
  document.querySelectorAll("[data-suno-field]").forEach(input => {
    input.addEventListener("change", event => updateViduVoiceField(event.target.dataset.sunoField, event.target.value));
    if (input.tagName === "TEXTAREA" || input.tagName === "INPUT") {
      input.addEventListener("input", event => updateViduVoiceField(event.target.dataset.sunoField, event.target.value, false));
    }
  });
  document.querySelectorAll(".choose-vidu-voice-asset").forEach(button => {
    button.addEventListener("click", () => openAssetDialog(`viduVoice:${button.dataset.viduVoiceField}`, "audio"));
  });
  document.querySelectorAll(".copy-vidu-voice-asset").forEach(button => {
    button.addEventListener("click", () => {
      const asset = state.viduVoiceState[button.dataset.viduVoiceField];
      copyReferenceAssets(asset ? [asset] : []);
    });
  });
  document.querySelectorAll(".paste-vidu-voice-asset").forEach(button => {
    button.addEventListener("click", () => pasteClipboardToViduVoiceAsset(button.dataset.viduVoiceField));
  });
  document.querySelectorAll(".vidu-voice-upload").forEach(input => {
    input.addEventListener("change", event => uploadViduVoiceFiles(Array.from(event.target.files || []), input.dataset.viduVoiceField));
  });
  document.querySelectorAll("[data-remove-vidu-voice-asset]").forEach(button => {
    button.addEventListener("click", () => {
      state.viduVoiceState[button.dataset.removeViduVoiceAsset] = null;
      persistViduVoiceState();
      render();
    });
  });
  document.querySelectorAll(".vidu-voice-drop").forEach(drop => {
    const field = drop.dataset.viduVoiceField;
    drop.addEventListener("focus", () => {
      state.pasteTarget = { type: "viduVoice", field };
    });
    drop.addEventListener("click", () => {
      state.pasteTarget = { type: "viduVoice", field };
      drop.focus();
    });
    drop.addEventListener("dragover", event => {
      event.preventDefault();
      drop.classList.add("drag-over");
    });
    drop.addEventListener("dragleave", () => drop.classList.remove("drag-over"));
    drop.addEventListener("drop", event => handleViduVoiceDrop(event, field, drop));
  });
  document.querySelector("#submitViduVoiceClone")?.addEventListener("click", submitViduVoiceClone);
  document.querySelector("#resetViduVoiceClone")?.addEventListener("click", () => {
    state.viduVoiceState.status = "idle";
    state.viduVoiceState.taskId = "";
    state.viduVoiceState.returnedVoiceId = "";
    state.viduVoiceState.demoAudio = "";
    state.viduVoiceState.resultData = null;
    state.viduVoiceState.error = "";
    persistViduVoiceState();
    render();
  });
  document.querySelector("#copyViduVoiceId")?.addEventListener("click", async () => {
    await navigator.clipboard.writeText(state.viduVoiceState.returnedVoiceId || "");
  });
  bindDownloadButtons();
}

function bindSubjectLibraryPage() {
  document.querySelector("#subjectGlobalUpload")?.addEventListener("change", event => uploadSubjectAssets(Array.from(event.target.files || [])));
  document.querySelectorAll("[data-subject-tab]").forEach(button => {
    button.addEventListener("click", () => {
      state.subjectTab = button.dataset.subjectTab;
      localStorage.setItem(STORAGE_KEYS.subjectTab, state.subjectTab);
      render();
    });
  });
  document.querySelectorAll("[data-subject-field]").forEach(input => {
    input.addEventListener("change", event => updateSubjectCreateField(event.target.dataset.subjectField, event.target.value));
    if (input.tagName === "INPUT") {
      input.addEventListener("input", event => updateSubjectCreateField(event.target.dataset.subjectField, event.target.value, false));
    }
  });
  document.querySelectorAll(".choose-subject-asset").forEach(button => {
    button.addEventListener("click", () => openAssetDialog(`subject:${button.dataset.subjectAssetField}:${button.dataset.subjectAssetType}`, button.dataset.subjectAssetType));
  });
  document.querySelectorAll(".copy-subject-asset").forEach(button => {
    button.addEventListener("click", () => copyReferenceAssets(subjectAssetsForField(button.dataset.subjectAssetField)));
  });
  document.querySelectorAll(".paste-subject-asset").forEach(button => {
    button.addEventListener("click", () => pasteClipboardToSubjectAsset(button.dataset.subjectAssetField, button.dataset.subjectAssetType));
  });
  document.querySelectorAll(".subject-asset-upload").forEach(input => {
    input.addEventListener("change", event => uploadSubjectAssets(Array.from(event.target.files || []), input.dataset.subjectAssetField, input.dataset.subjectAssetType));
  });
  document.querySelectorAll(".clear-subject-asset").forEach(button => {
    button.addEventListener("click", () => {
      clearSubjectAssetField(button.dataset.subjectAssetField);
      persistSubjectCreateState();
      render();
    });
  });
  document.querySelectorAll(".subject-drop").forEach(drop => {
    const field = drop.dataset.subjectAssetField;
    const type = drop.dataset.subjectAssetType;
    drop.addEventListener("focus", () => {
      state.pasteTarget = { type: "subject", field, assetType: type };
    });
    drop.addEventListener("click", () => {
      state.pasteTarget = { type: "subject", field, assetType: type };
      drop.focus();
    });
    drop.addEventListener("dragover", event => {
      event.preventDefault();
      drop.classList.add("drag-over");
    });
    drop.addEventListener("dragleave", () => drop.classList.remove("drag-over"));
    drop.addEventListener("drop", event => handleSubjectAssetDrop(event, field, type, drop));
  });
  document.querySelector("#submitSubjectCreate")?.addEventListener("click", submitSubjectCreate);
  document.querySelector("#resetSubjectCreate")?.addEventListener("click", () => {
    state.subjectCreateState = normalizeSubjectCreateState({ model: state.subjectCreateState.model });
    persistSubjectCreateState();
    render();
  });
  document.querySelectorAll(".copy-subject-id").forEach(button => {
    button.addEventListener("click", async () => {
      await navigator.clipboard.writeText(button.dataset.copyValue || "");
    });
  });
  document.querySelectorAll(".remove-subject-record").forEach(button => {
    button.addEventListener("click", () => {
      const tr = button.closest("tr[data-subject-id]");
      state.subjectLibrary = state.subjectLibrary.filter(item => item.id !== tr?.dataset.subjectId);
      persistSubjectLibrary();
      render();
    });
  });
  document.querySelectorAll(".duplicate-subject-record").forEach(button => {
    button.addEventListener("click", () => {
      const tr = button.closest("tr[data-subject-id]");
      const item = state.subjectLibrary.find(record => record.id === tr?.dataset.subjectId);
      if (!item) return;
      state.subjectCreateState = normalizeSubjectCreateState({
        model: item.model || "vidu",
        name: item.name,
        type: item.type,
        images: item.images,
        videos: item.videos,
        audio: item.audio,
        note: ""
      });
      state.subjectTab = "create";
      localStorage.setItem(STORAGE_KEYS.subjectTab, state.subjectTab);
      persistSubjectCreateState();
      render();
    });
  });
  bindDownloadButtons();
}

function bindAvatarRow(tr, row) {
  tr.querySelector(".avatar-row-select").addEventListener("change", event => {
    row.selected = event.target.checked;
    persistAvatarRows();
  });
  tr.querySelectorAll("[data-avatar-field]").forEach(input => {
    input.addEventListener("change", event => updateAvatarRowField(row, event.target.dataset.avatarField, event.target.value));
  });
  tr.querySelectorAll("[data-field]").forEach(input => {
    input.addEventListener("change", event => updateAvatarRowField(row, event.target.dataset.field, event.target.value));
    if (input.tagName === "TEXTAREA") {
      input.addEventListener("input", event => updateAvatarRowField(row, event.target.dataset.field, event.target.value, false));
    }
  });
  tr.querySelector(".toggle-prompt")?.addEventListener("click", () => openPromptDetailPanel(row, collectPromptReferences(row, "avatar")));
  tr.querySelector(".copy-prompt")?.addEventListener("click", () => copyPromptText(row.prompt));
  tr.querySelector(".paste-prompt")?.addEventListener("click", () => pastePromptTextToRow(tr, row, updateAvatarRowField, () => isAvatarRowLocked(row)));
  tr.querySelector(".clear-prompt")?.addEventListener("click", () => clearPromptForRow(row, updateAvatarRowField, () => isAvatarRowLocked(row)));
  tr.querySelector(".avatar-count-minus").addEventListener("click", () => updateAvatarRowField(row, "count", Math.max(1, row.count - 1)));
  tr.querySelector(".avatar-count-plus").addEventListener("click", () => updateAvatarRowField(row, "count", row.count + 1));
  tr.querySelectorAll(".choose-avatar-asset").forEach(button => {
    button.addEventListener("click", () => {
      if (!isAvatarRowLocked(row)) openAssetDialog(`avatar:${button.dataset.avatarAssetAction}:${row.id}`, button.dataset.avatarAssetType);
    });
  });
  tr.querySelectorAll(".copy-avatar-asset").forEach(button => {
    button.addEventListener("click", () => copyReferenceAssets(row[button.dataset.avatarAssetAction] ? [row[button.dataset.avatarAssetAction]] : []));
  });
  tr.querySelectorAll(".paste-avatar-asset").forEach(button => {
    button.addEventListener("click", () => pasteClipboardToAvatarAsset(row, button.dataset.avatarAssetAction));
  });
  tr.querySelectorAll(".clear-avatar-asset").forEach(button => {
    button.addEventListener("click", () => clearAvatarAsset(row, button.dataset.avatarAssetAction));
  });
  tr.querySelectorAll(".avatar-asset-upload").forEach(input => {
    input.addEventListener("change", event => uploadAvatarAssetFiles(Array.from(event.target.files || []), row.id, input.dataset.avatarAssetAction));
  });
  tr.querySelector(".submit-avatar-row").addEventListener("click", () => enqueueAvatarRows([row]));
  tr.querySelector(".cancel-avatar-row").addEventListener("click", () => cancelAvatarQueuedJobs(row.id));
  tr.querySelector(".duplicate-avatar-row").addEventListener("click", () => {
    state.avatarRows.splice(state.avatarRows.indexOf(row) + 1, 0, createAvatarRow({ ...row, id: undefined, status: "pending", taskIds: [], remoteTasks: [], completedTaskIds: [], results: [], error: "" }));
    persistAvatarRows();
    render();
  });
  tr.querySelector(".remove-avatar-row").addEventListener("click", () => {
    if (isAvatarRowLocked(row)) return;
    cancelAvatarQueuedJobs(row.id, false);
    state.avatarRows = state.avatarRows.filter(item => item.id !== row.id);
    persistAvatarRows();
    render();
  });
  tr.querySelectorAll("[data-remove-asset]").forEach(button => {
    button.addEventListener("click", () => {
      if (isAvatarRowLocked(row)) return;
      markRowDirty(row);
      if (row.image?.id === button.dataset.removeAsset) row.image = null;
      if (row.audio?.id === button.dataset.removeAsset) row.audio = null;
      persistAvatarRows();
      render();
    });
  });
  tr.querySelectorAll(".asset-chip").forEach(chip => {
    chip.addEventListener("dragstart", event => {
      if (isAvatarRowLocked(row)) {
        event.preventDefault();
        return;
      }
      const asset = [row.image, row.audio].filter(Boolean).find(item => item.id === chip.dataset.assetId);
      event.dataTransfer.setData("application/x-api-asset", JSON.stringify(asset));
      event.dataTransfer.effectAllowed = "copy";
    });
  });
  tr.querySelectorAll(".avatar-drop").forEach(drop => {
    const field = drop.dataset.avatarAssetField;
    drop.addEventListener("focus", () => {
      state.pasteTarget = { type: "avatar", rowId: row.id, field };
    });
    drop.addEventListener("click", () => {
      if (!isAvatarRowLocked(row)) {
        state.pasteTarget = { type: "avatar", rowId: row.id, field };
        drop.focus();
      }
    });
    drop.addEventListener("dragover", event => {
      if (isAvatarRowLocked(row)) return;
      event.preventDefault();
      drop.classList.add("drag-over");
    });
    drop.addEventListener("dragleave", () => drop.classList.remove("drag-over"));
    drop.addEventListener("drop", event => handleAvatarAssetDrop(event, row, field, drop));
  });
}

function bindMotionRow(tr, row) {
  tr.querySelector(".motion-row-select").addEventListener("change", event => {
    row.selected = event.target.checked;
    persistMotionRows();
  });
  tr.querySelectorAll("[data-motion-field]").forEach(input => {
    input.addEventListener("change", event => updateMotionRowField(row, event.target.dataset.motionField, event.target.value));
  });
  tr.querySelectorAll("[data-field]").forEach(input => {
    input.addEventListener("change", event => updateMotionRowField(row, event.target.dataset.field, event.target.value));
    if (input.tagName === "TEXTAREA") {
      input.addEventListener("input", event => updateMotionRowField(row, event.target.dataset.field, event.target.value, false));
    }
  });
  tr.querySelector(".toggle-prompt")?.addEventListener("click", () => openPromptDetailPanel(row, collectPromptReferences(row, "motion")));
  tr.querySelector(".copy-prompt")?.addEventListener("click", () => copyPromptText(row.prompt));
  tr.querySelector(".paste-prompt")?.addEventListener("click", () => pastePromptTextToRow(tr, row, updateMotionRowField, () => isMotionRowLocked(row)));
  tr.querySelector(".clear-prompt")?.addEventListener("click", () => clearPromptForRow(row, updateMotionRowField, () => isMotionRowLocked(row)));
  tr.querySelector(".motion-count-minus").addEventListener("click", () => updateMotionRowField(row, "count", Math.max(1, row.count - 1)));
  tr.querySelector(".motion-count-plus").addEventListener("click", () => updateMotionRowField(row, "count", row.count + 1));
  tr.querySelectorAll(".choose-motion-asset").forEach(button => {
    button.addEventListener("click", () => {
      if (!isMotionRowLocked(row)) openAssetDialog(`motion:${button.dataset.motionAssetAction}:${row.id}`, button.dataset.motionAssetType);
    });
  });
  tr.querySelectorAll(".copy-motion-asset").forEach(button => {
    button.addEventListener("click", () => copyReferenceAssets(row[button.dataset.motionAssetAction] ? [row[button.dataset.motionAssetAction]] : []));
  });
  tr.querySelectorAll(".paste-motion-asset").forEach(button => {
    button.addEventListener("click", () => pasteClipboardToMotionAsset(row, button.dataset.motionAssetAction));
  });
  tr.querySelectorAll(".clear-motion-asset").forEach(button => {
    button.addEventListener("click", () => clearMotionAsset(row, button.dataset.motionAssetAction));
  });
  tr.querySelectorAll(".motion-asset-upload").forEach(input => {
    input.addEventListener("change", event => uploadMotionAssetFiles(Array.from(event.target.files || []), row.id, input.dataset.motionAssetAction));
  });
  tr.querySelector(".submit-motion-row").addEventListener("click", () => enqueueMotionRows([row]));
  tr.querySelector(".cancel-motion-row").addEventListener("click", () => cancelMotionQueuedJobs(row.id));
  tr.querySelector(".duplicate-motion-row").addEventListener("click", () => {
    state.motionRows.splice(state.motionRows.indexOf(row) + 1, 0, createMotionRow({ ...row, id: undefined, status: "pending", taskIds: [], remoteTasks: [], completedTaskIds: [], results: [], error: "" }));
    persistMotionRows();
    render();
  });
  tr.querySelector(".remove-motion-row").addEventListener("click", () => {
    if (isMotionRowLocked(row)) return;
    cancelMotionQueuedJobs(row.id, false);
    state.motionRows = state.motionRows.filter(item => item.id !== row.id);
    persistMotionRows();
    render();
  });
  tr.querySelectorAll("[data-remove-asset]").forEach(button => {
    button.addEventListener("click", () => {
      if (isMotionRowLocked(row)) return;
      markRowDirty(row);
      if (row.image?.id === button.dataset.removeAsset) row.image = null;
      if (row.video?.id === button.dataset.removeAsset) row.video = null;
      persistMotionRows();
      render();
    });
  });
  tr.querySelectorAll(".asset-chip").forEach(chip => {
    chip.addEventListener("dragstart", event => {
      if (isMotionRowLocked(row)) {
        event.preventDefault();
        return;
      }
      const asset = [row.image, row.video].filter(Boolean).find(item => item.id === chip.dataset.assetId);
      event.dataTransfer.setData("application/x-api-asset", JSON.stringify(asset));
      event.dataTransfer.effectAllowed = "copy";
    });
  });
  tr.querySelectorAll(".motion-drop").forEach(drop => {
    const field = drop.dataset.motionAssetField;
    drop.addEventListener("focus", () => {
      state.pasteTarget = { type: "motion", rowId: row.id, field };
    });
    drop.addEventListener("click", () => {
      if (!isMotionRowLocked(row)) {
        state.pasteTarget = { type: "motion", rowId: row.id, field };
        drop.focus();
      }
    });
    drop.addEventListener("dragover", event => {
      if (isMotionRowLocked(row)) return;
      event.preventDefault();
      drop.classList.add("drag-over");
    });
    drop.addEventListener("dragleave", () => drop.classList.remove("drag-over"));
    drop.addEventListener("drop", event => handleMotionAssetDrop(event, row, field, drop));
  });
}

function bindImageVideoRow(tr, row) {
  tr.querySelector(".image-video-row-select").addEventListener("change", event => {
    row.selected = event.target.checked;
    persistImageVideoRows();
  });
  tr.querySelectorAll("[data-image-video-field]").forEach(input => {
    input.addEventListener("change", event => {
      const value = event.target.type === "checkbox" ? event.target.checked : event.target.value;
      updateImageVideoRowField(row, event.target.dataset.imageVideoField, value);
    });
  });
  tr.querySelectorAll("[data-field]").forEach(input => {
    input.addEventListener("change", event => updateImageVideoRowField(row, event.target.dataset.field, event.target.value));
    if (input.tagName === "TEXTAREA") {
      input.addEventListener("input", event => updateImageVideoRowField(row, event.target.dataset.field, event.target.value, false));
    }
  });
  tr.querySelector(".toggle-prompt")?.addEventListener("click", () => openPromptDetailPanel(row, collectPromptReferences(row, "imageVideo")));
  tr.querySelector(".copy-prompt")?.addEventListener("click", () => copyPromptText(row.prompt));
  tr.querySelector(".paste-prompt")?.addEventListener("click", () => pastePromptTextToRow(tr, row, updateImageVideoRowField, () => isImageVideoRowLocked(row)));
  tr.querySelector(".clear-prompt")?.addEventListener("click", () => clearPromptForRow(row, updateImageVideoRowField, () => isImageVideoRowLocked(row)));
  tr.querySelector(".image-video-count-minus").addEventListener("click", () => updateImageVideoRowField(row, "count", Math.max(1, row.count - 1)));
  tr.querySelector(".image-video-count-plus").addEventListener("click", () => updateImageVideoRowField(row, "count", row.count + 1));
  tr.querySelectorAll(".choose-frame").forEach(button => {
    button.addEventListener("click", () => {
      if (!isImageVideoRowLocked(row)) openAssetDialog(`iv:${button.dataset.frameAction}:${row.id}`, "image");
    });
  });
  tr.querySelectorAll(".copy-frame").forEach(button => {
    button.addEventListener("click", () => copyImageAssets(row[button.dataset.frameAction] ? [row[button.dataset.frameAction]] : []));
  });
  tr.querySelectorAll(".paste-frame").forEach(button => {
    button.addEventListener("click", () => pasteClipboardToImageVideoFrame(row, button.dataset.frameAction));
  });
  tr.querySelectorAll(".clear-frame").forEach(button => {
    button.addEventListener("click", () => clearImageVideoFrame(row, button.dataset.clearFrame));
  });
  tr.querySelectorAll(".image-video-frame-upload").forEach(input => {
    input.addEventListener("change", event => uploadImageVideoFrameFiles(Array.from(event.target.files || []), row.id, input.dataset.frameAction));
  });
  tr.querySelector(".submit-image-video-row").addEventListener("click", () => enqueueImageVideoRows([row]));
  tr.querySelector(".cancel-image-video-row").addEventListener("click", () => cancelImageVideoQueuedJobs(row.id));
  tr.querySelector(".duplicate-image-video-row").addEventListener("click", () => {
    state.imageVideoRows.splice(state.imageVideoRows.indexOf(row) + 1, 0, createImageVideoRow({ ...row, id: undefined, status: "pending", taskIds: [], remoteTasks: [], completedTaskIds: [], results: [], error: "" }));
    persistImageVideoRows();
    render();
  });
  tr.querySelector(".remove-image-video-row").addEventListener("click", () => {
    if (isImageVideoRowLocked(row)) return;
    cancelImageVideoQueuedJobs(row.id, false);
    state.imageVideoRows = state.imageVideoRows.filter(item => item.id !== row.id);
    persistImageVideoRows();
    render();
  });
  tr.querySelectorAll("[data-remove-asset]").forEach(button => {
    button.addEventListener("click", () => {
      if (isImageVideoRowLocked(row)) return;
      markRowDirty(row);
      const frameField = button.closest("[data-frame-field]")?.dataset.frameField;
      if (frameField === "firstFrame") {
        row.firstFrame = null;
      } else if (frameField === "lastFrame") {
        row.lastFrame = null;
      } else {
        if (row.firstFrame?.id === button.dataset.removeAsset) row.firstFrame = null;
        if (row.lastFrame?.id === button.dataset.removeAsset) row.lastFrame = null;
      }
      persistImageVideoRows();
      render();
    });
  });
  tr.querySelectorAll(".asset-chip").forEach(chip => {
    chip.addEventListener("dragstart", event => {
      if (isImageVideoRowLocked(row)) {
        event.preventDefault();
        return;
      }
      const asset = [row.firstFrame, row.lastFrame].filter(Boolean).find(item => item.id === chip.dataset.assetId);
      event.dataTransfer.setData("application/x-api-asset", JSON.stringify(asset));
      event.dataTransfer.effectAllowed = "copy";
    });
  });
  tr.querySelectorAll(".frame-drop").forEach(drop => {
    const field = drop.dataset.frameField;
    drop.addEventListener("focus", () => {
      state.pasteTarget = { type: "imageVideo", rowId: row.id, field };
    });
    drop.addEventListener("click", () => {
      if (!isImageVideoRowLocked(row)) {
        state.pasteTarget = { type: "imageVideo", rowId: row.id, field };
        drop.focus();
      }
    });
    drop.addEventListener("dragover", event => {
      if (isImageVideoRowLocked(row) || (field === "lastFrame" && !supportsImageVideoLastFrame(row))) return;
      event.preventDefault();
      drop.classList.add("drag-over");
    });
    drop.addEventListener("dragleave", () => drop.classList.remove("drag-over"));
    drop.addEventListener("drop", event => handleImageVideoFrameDrop(event, row, field, drop));
  });
}

function bindMultiRow(tr, row) {
  decorateReferenceMentions(tr);
  tr.querySelector(".multi-row-select").addEventListener("change", event => {
    row.selected = event.target.checked;
    persistMultiRows();
  });
  tr.querySelectorAll("[data-multi-field]").forEach(input => {
    input.addEventListener("change", event => {
      const value = event.target.type === "checkbox" ? event.target.checked : event.target.value;
      updateMultiRowField(row, event.target.dataset.multiField, value);
    });
  });
  tr.querySelectorAll("[data-field]").forEach(input => {
    input.addEventListener("change", event => updateMultiRowField(row, event.target.dataset.field, event.target.value));
    if (input.tagName === "TEXTAREA") {
      input.addEventListener("input", event => updateMultiRowField(row, event.target.dataset.field, event.target.value, false));
      input.addEventListener("drop", () => {
        setTimeout(() => input.dispatchEvent(new Event("input", { bubbles: true })), 0);
      });
    }
  });
  tr.querySelector(".toggle-prompt")?.addEventListener("click", () => openPromptDetailPanel(row, collectPromptReferences(row, "multi")));
  tr.querySelector(".copy-prompt")?.addEventListener("click", () => copyPromptText(row.prompt));
  tr.querySelector(".paste-prompt")?.addEventListener("click", () => pastePromptTextToRow(tr, row, updateMultiRowField, () => isMultiRowLocked(row)));
  tr.querySelector(".clear-prompt")?.addEventListener("click", () => clearPromptForRow(row, updateMultiRowField, () => isMultiRowLocked(row)));
  tr.querySelector(".multi-count-minus").addEventListener("click", () => updateMultiRowField(row, "count", Math.max(1, row.count - 1)));
  tr.querySelector(".multi-count-plus").addEventListener("click", () => updateMultiRowField(row, "count", row.count + 1));
  tr.querySelector(".choose-refs").addEventListener("click", () => {
    if (!isMultiRowLocked(row)) openAssetDialog(`multi:${row.id}`, "image");
  });
  tr.querySelector(".multi-row-upload").addEventListener("change", event => {
    if (!isMultiRowLocked(row)) uploadReferenceFiles(Array.from(event.target.files || []), row.id);
  });
  tr.querySelector(".copy-refs").addEventListener("click", () => copyReferenceAssets(row.refs || []));
  tr.querySelector(".paste-refs").addEventListener("click", () => {
    if (!isMultiRowLocked(row)) pasteClipboardToMultiRow(row);
  });
  tr.querySelector(".clear-refs")?.addEventListener("click", () => clearMultiRefs(row));
  tr.querySelector(".submit-multi-row").addEventListener("click", () => enqueueMultiRows([row]));
  tr.querySelector(".cancel-multi-row").addEventListener("click", () => cancelMultiQueuedJobs(row.id));
  tr.querySelector(".duplicate-multi-row").addEventListener("click", () => {
    state.multiRows.splice(state.multiRows.indexOf(row) + 1, 0, createMultiRow({ ...row, id: undefined, status: "pending", taskIds: [], remoteTasks: [], completedTaskIds: [], results: [], error: "" }));
    persistMultiRows();
    render();
  });
  tr.querySelector(".remove-multi-row").addEventListener("click", () => {
    if (isMultiRowLocked(row)) return;
    cancelMultiQueuedJobs(row.id, false);
    state.multiRows = state.multiRows.filter(item => item.id !== row.id);
    persistMultiRows();
    render();
  });
  tr.querySelectorAll("[data-remove-asset]").forEach(button => {
    button.addEventListener("click", () => {
      if (isMultiRowLocked(row)) return;
      markRowDirty(row);
      row.refs = row.refs.filter(item => item.id !== button.dataset.removeAsset);
      persistMultiRows();
      render();
    });
  });
  tr.querySelectorAll(".asset-chip").forEach(chip => {
    chip.addEventListener("dragstart", event => {
      if (isMultiRowLocked(row)) {
        event.preventDefault();
        return;
      }
      const asset = row.refs.find(item => item.id === chip.dataset.assetId);
      event.dataTransfer.setData("application/x-api-asset", JSON.stringify(asset));
      event.dataTransfer.effectAllowed = "copy";
    });
  });
  const drop = tr.querySelector(".reference-drop");
  drop.addEventListener("focus", () => {
    state.pasteTarget = { type: "multi", rowId: row.id };
  });
  drop.addEventListener("click", () => {
    if (!isMultiRowLocked(row)) {
      state.pasteTarget = { type: "multi", rowId: row.id };
      drop.focus();
    }
  });
  drop.addEventListener("dragover", event => {
    if (isMultiRowLocked(row)) return;
    event.preventDefault();
    drop.classList.add("drag-over");
  });
  drop.addEventListener("dragleave", () => drop.classList.remove("drag-over"));
  drop.addEventListener("drop", event => handleMultiDrop(event, row, drop));
}

function bindViduRefRow(tr, row) {
  decorateReferenceMentions(tr, ".vidu-ref-drop");
  tr.querySelector(".vidu-ref-row-select").addEventListener("change", event => {
    row.selected = event.target.checked;
    persistViduRefRows();
  });
  tr.querySelectorAll("[data-vidu-ref-field]").forEach(input => {
    input.addEventListener("change", event => {
      const value = event.target.type === "checkbox" ? event.target.checked : event.target.value;
      updateViduRefRowField(row, event.target.dataset.viduRefField, value);
    });
    if (input.tagName === "INPUT" && input.type !== "checkbox") {
      input.addEventListener("input", event => updateViduRefRowField(row, event.target.dataset.viduRefField, event.target.value, false));
    }
  });
  tr.querySelectorAll("[data-field]").forEach(input => {
    input.addEventListener("change", event => updateViduRefRowField(row, event.target.dataset.field, event.target.value));
    if (input.tagName === "TEXTAREA") {
      input.addEventListener("input", event => updateViduRefRowField(row, event.target.dataset.field, event.target.value, false));
      input.addEventListener("drop", () => {
        setTimeout(() => input.dispatchEvent(new Event("input", { bubbles: true })), 0);
      });
    }
  });
  tr.querySelector(".toggle-prompt")?.addEventListener("click", () => openPromptDetailPanel(row, collectPromptReferences(row, "viduRef")));
  tr.querySelector(".copy-prompt")?.addEventListener("click", () => copyPromptText(row.prompt));
  tr.querySelector(".paste-prompt")?.addEventListener("click", () => pastePromptTextToRow(tr, row, updateViduRefRowField, () => isViduRefRowLocked(row)));
  tr.querySelector(".clear-prompt")?.addEventListener("click", () => clearPromptForRow(row, updateViduRefRowField, () => isViduRefRowLocked(row)));
  tr.querySelector(".vidu-ref-count-minus").addEventListener("click", () => updateViduRefRowField(row, "count", Math.max(1, row.count - 1)));
  tr.querySelector(".vidu-ref-count-plus").addEventListener("click", () => updateViduRefRowField(row, "count", row.count + 1));
  tr.querySelector(".choose-vidu-ref-assets").addEventListener("click", () => {
    if (!isViduRefRowLocked(row)) openAssetDialog(`viduRef:${row.id}`, "image");
  });
  tr.querySelector(".vidu-ref-upload").addEventListener("change", event => {
    if (!isViduRefRowLocked(row)) uploadViduRefFiles(Array.from(event.target.files || []), row.id);
  });
  tr.querySelector(".copy-vidu-ref-assets").addEventListener("click", () => copyReferenceAssets(row.refs || []));
  tr.querySelector(".paste-vidu-ref-assets").addEventListener("click", () => {
    if (!isViduRefRowLocked(row)) pasteClipboardToViduRefRow(row);
  });
  tr.querySelector(".clear-vidu-ref-assets")?.addEventListener("click", () => clearViduRefAssets(row));
  tr.querySelector(".submit-vidu-ref-row").addEventListener("click", () => enqueueViduRefRows([row]));
  tr.querySelector(".cancel-vidu-ref-row").addEventListener("click", () => cancelViduRefQueuedJobs(row.id));
  tr.querySelector(".duplicate-vidu-ref-row").addEventListener("click", () => {
    state.viduRefRows.splice(state.viduRefRows.indexOf(row) + 1, 0, createViduRefRow({ ...row, id: undefined, status: "pending", taskIds: [], remoteTasks: [], completedTaskIds: [], results: [], error: "", returnedSeeds: [] }));
    persistViduRefRows();
    render();
  });
  tr.querySelector(".remove-vidu-ref-row").addEventListener("click", () => {
    if (isViduRefRowLocked(row)) return;
    cancelViduRefQueuedJobs(row.id, false);
    state.viduRefRows = state.viduRefRows.filter(item => item.id !== row.id);
    persistViduRefRows();
    render();
  });
  tr.querySelectorAll("[data-remove-asset]").forEach(button => {
    button.addEventListener("click", () => {
      if (isViduRefRowLocked(row)) return;
      markRowDirty(row);
      row.refs = row.refs.filter(item => item.id !== button.dataset.removeAsset);
      persistViduRefRows();
      render();
    });
  });
  tr.querySelectorAll(".asset-chip").forEach(chip => {
    chip.addEventListener("dragstart", event => {
      if (isViduRefRowLocked(row)) {
        event.preventDefault();
        return;
      }
      const asset = row.refs.find(item => item.id === chip.dataset.assetId);
      event.dataTransfer.setData("application/x-api-asset", JSON.stringify(asset));
      event.dataTransfer.effectAllowed = "copy";
    });
  });
  const drop = tr.querySelector(".vidu-ref-drop");
  drop.addEventListener("focus", () => {
    state.pasteTarget = { type: "viduRef", rowId: row.id };
  });
  drop.addEventListener("click", () => {
    if (!isViduRefRowLocked(row)) {
      state.pasteTarget = { type: "viduRef", rowId: row.id };
      drop.focus();
    }
  });
  drop.addEventListener("dragover", event => {
    if (isViduRefRowLocked(row)) return;
    event.preventDefault();
    drop.classList.add("drag-over");
  });
  drop.addEventListener("dragleave", () => drop.classList.remove("drag-over"));
  drop.addEventListener("drop", event => handleViduRefDrop(event, row, drop));
}

function bindRow(tr, row) {
  tr.querySelector(".row-select").addEventListener("change", event => {
    row.selected = event.target.checked;
    persistRows();
  });
  tr.querySelectorAll("[data-field]").forEach(input => {
    input.addEventListener("change", event => updateRowField(row, event.target.dataset.field, event.target.value));
    if (input.tagName === "TEXTAREA") {
      input.addEventListener("input", event => updateRowField(row, event.target.dataset.field, event.target.value, false));
    }
  });
  tr.querySelector(".toggle-prompt")?.addEventListener("click", () => openPromptDetailPanel(row, collectPromptReferences(row, "image")));
  tr.querySelector(".copy-prompt")?.addEventListener("click", () => copyPromptText(row.prompt));
  tr.querySelector(".paste-prompt")?.addEventListener("click", () => pastePromptTextToRow(tr, row, updateRowField, () => isRowLocked(row)));
  tr.querySelector(".clear-prompt")?.addEventListener("click", () => clearPromptForRow(row, updateRowField, () => isRowLocked(row)));
  tr.querySelector(".count-minus").addEventListener("click", () => updateRowField(row, "count", Math.max(1, row.count - 1)));
  tr.querySelector(".count-plus").addEventListener("click", () => updateRowField(row, "count", row.count + 1));
  tr.querySelector(".choose-assets").addEventListener("click", () => {
    if (!isRowLocked(row)) openAssetDialog(row.id, "image");
  });
  tr.querySelector(".row-upload").addEventListener("change", event => {
    if (!isRowLocked(row)) uploadFiles(Array.from(event.target.files || []), row.id, "image");
  });
  tr.querySelector(".copy-images").addEventListener("click", () => copyRowImages(row));
  tr.querySelector(".paste-images").addEventListener("click", () => {
    if (!isRowLocked(row)) pasteClipboardToRow(row);
  });
  tr.querySelector(".clear-row-assets")?.addEventListener("click", () => clearRowImages(row));
  tr.querySelector(".submit-row").addEventListener("click", () => enqueueRows([row]));
  tr.querySelector(".cancel-row").addEventListener("click", () => cancelQueuedJobs(row.id));
  tr.querySelector(".duplicate-row").addEventListener("click", () => {
    state.rows.splice(state.rows.indexOf(row) + 1, 0, createRow({ ...row, id: undefined, status: "pending", taskIds: [], remoteTasks: [], completedTaskIds: [], results: [], error: "" }));
    persistRows();
    render();
  });
  tr.querySelector(".remove-row").addEventListener("click", () => {
    if (isRowLocked(row)) return;
    cancelQueuedJobs(row.id);
    state.rows = state.rows.filter(item => item.id !== row.id);
    persistRows();
    render();
  });
  tr.querySelectorAll("[data-remove-asset]").forEach(button => {
    button.addEventListener("click", () => {
      if (isRowLocked(row)) return;
      markRowDirty(row);
      row.images = row.images.filter(item => item.id !== button.dataset.removeAsset);
      persistRows();
      render();
    });
  });
  tr.querySelectorAll(".asset-chip").forEach(chip => {
    chip.addEventListener("dragstart", event => {
      if (isRowLocked(row)) {
        event.preventDefault();
        return;
      }
      const asset = row.images.find(item => item.id === chip.dataset.assetId);
      event.dataTransfer.setData("application/x-api-asset", JSON.stringify(asset));
      event.dataTransfer.effectAllowed = "copy";
    });
  });
  const drop = tr.querySelector(".image-drop");
  drop.addEventListener("focus", () => {
    state.pasteTarget = { type: "row", rowId: row.id };
  });
  drop.addEventListener("click", () => {
    if (!isRowLocked(row)) {
      state.pasteTarget = { type: "row", rowId: row.id };
      drop.focus();
    }
  });
  drop.addEventListener("dragover", event => {
    if (isRowLocked(row)) return;
    event.preventDefault();
    drop.classList.add("drag-over");
  });
  drop.addEventListener("dragleave", () => drop.classList.remove("drag-over"));
  drop.addEventListener("drop", event => handleDrop(event, row, drop));
}

function updateRowField(row, field, value, redraw = true) {
  if (isRowLocked(row)) return;
  const becameDirty = markRowDirty(row);
  if (field === "model") {
    const next = IMAGE_MODELS[value] || IMAGE_MODELS.nano;
    const previousSize = row.size;
    const previousQuality = row.quality;
    row.model = value;
    row.version = next.versions[0].value;
    row.size = chooseCompatibleOption(previousSize, next.sizes);
    row.quality = chooseCompatibleOption(previousQuality, next.qualities, next.qualities[1] || next.qualities[0] || "");
    if (value === "seedream") row.quality = normalizeSeedreamQuality(previousQuality, row.version);
    row.images = row.images.slice(0, next.maxImages);
  } else if (field === "version") {
    row.version = value;
    if (row.model === "seedream") {
      row.quality = normalizeSeedreamQuality(row.quality, row.version);
    }
  } else if (field === "count") {
    row.count = Math.max(1, Number(value || 1));
  } else {
    row[field] = value;
  }
  persistRows();
  if (redraw) render();
  else if (becameDirty) refreshRowSubmittedStateDisplay(row);
}

function chooseCompatibleOption(current, options, fallback = "") {
  if (!options.length) return "";
  if (options.includes(current)) return current;
  if (!current) return fallback || options[0] || "";
  const ratio = parseRatio(current);
  if (!ratio) return fallback || options[0] || "";
  let best = options[0];
  let bestDistance = Number.POSITIVE_INFINITY;
  options.forEach(option => {
    const candidate = parseRatio(option);
    if (!candidate) return;
    const distance = Math.abs(candidate - ratio);
    if (distance < bestDistance) {
      best = option;
      bestDistance = distance;
    }
  });
  return best || fallback || options[0] || "";
}

function parseRatio(value) {
  if (!value || value === "auto") return null;
  const match = String(value).match(/^(\d+(?:\.\d+)?)(?::|x)(\d+(?:\.\d+)?)$/i);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  return width > 0 && height > 0 ? width / height : null;
}

function handleDrop(event, row, drop) {
  event.preventDefault();
  drop.classList.remove("drag-over");
  if (isRowLocked(row)) return;
  const assetText = event.dataTransfer.getData("application/x-api-asset");
  if (assetText) {
    const asset = JSON.parse(assetText);
    markRowDirty(row);
    row.images = mergeAssets(row.images, [asset], getModel(row).maxImages);
    persistRows();
    render();
    return;
  }
  const files = Array.from(event.dataTransfer.files || []).filter(file => file.type.startsWith("image/"));
  if (files.length) uploadFiles(files, row.id, "image");
}

function updateImageVideoRowField(row, field, value, redraw = true) {
  if (isImageVideoRowLocked(row)) return;
  const becameDirty = markRowDirty(row);
  if (field === "model") {
    const next = IMAGE_VIDEO_MODELS[value] || IMAGE_VIDEO_MODELS.hailuo;
    const previousSize = row.size;
    const previousQuality = row.quality;
    const previousDuration = row.duration;
    row.model = value;
    row.version = next.versions[0].value;
    row.size = previousSize === "" ? "" : chooseCompatibleOption(previousSize, getImageVideoSizeOptions(row), getImageVideoSizeOptions(row)[0] || "");
    row.quality = nearestQualityOption(previousQuality, getImageVideoQualityOptions(row), getImageVideoQualityOptions(row)[0] || "");
    row.duration = getImageVideoDurationOptions(row).includes(String(previousDuration)) ? String(previousDuration) : (getImageVideoDurationOptions(row)[0] || "5");
    if (!supportsImageVideoLastFrame(row)) row.lastFrame = null;
    if (!supportsImageVideoAutoMultiShot(row)) row.autoMultiShot = false;
  } else if (field === "version") {
    row.version = value;
    row.size = row.size === "" ? "" : chooseCompatibleOption(row.size, getImageVideoSizeOptions(row), getImageVideoSizeOptions(row)[0] || "");
    row.quality = nearestQualityOption(row.quality, getImageVideoQualityOptions(row), getImageVideoQualityOptions(row)[0] || "");
    row.duration = getImageVideoDurationOptions(row).includes(String(row.duration)) ? String(row.duration) : (getImageVideoDurationOptions(row)[0] || "5");
    if (!supportsImageVideoLastFrame(row)) row.lastFrame = null;
    if (!supportsImageVideoAutoMultiShot(row)) row.autoMultiShot = false;
  } else if (field === "count") {
    row.count = Math.max(1, Number(value || 1));
  } else if (field === "duration") {
    row.duration = String(value || "5");
  } else if (field === "autoMultiShot") {
    row.autoMultiShot = Boolean(value) && supportsImageVideoAutoMultiShot(row);
  } else {
    row[field] = value;
  }
  persistImageVideoRows();
  if (redraw) render();
  else if (becameDirty) refreshRowSubmittedStateDisplay(row);
}

function updateMotionRowField(row, field, value, redraw = true) {
  if (isMotionRowLocked(row)) return;
  const becameDirty = markRowDirty(row);
  if (field === "model") {
    const next = getMotionModel({ model: value });
    const previousSize = row.size;
    const previousQuality = row.quality;
    row.model = value;
    row.version = next.versions[0].value;
    row.size = chooseCompatibleOption(previousSize, next.sizes, next.sizes[0] || "");
    row.quality = chooseCompatibleOption(previousQuality, next.qualities, next.qualities[0] || "");
  } else if (field === "version") {
    row.version = value;
  } else if (field === "count") {
    row.count = Math.max(1, Number(value || 1));
  } else {
    row[field] = value;
  }
  persistMotionRows();
  if (redraw) render();
  else if (becameDirty) refreshRowSubmittedStateDisplay(row);
}

function updateAvatarRowField(row, field, value, redraw = true) {
  if (isAvatarRowLocked(row)) return;
  const becameDirty = markRowDirty(row);
  if (field === "model") {
    const next = getAvatarModel({ model: value });
    row.model = value;
    row.version = next.versions[0].value;
    row.quality = value === "kling" ? "1080p" : "";
    row.mode = value === "kling" ? "pro" : "";
  } else if (field === "version") {
    row.version = value;
  } else if (field === "count") {
    row.count = Math.max(1, Number(value || 1));
  } else {
    row[field] = value;
  }
  persistAvatarRows();
  if (redraw) render();
  else if (becameDirty) refreshRowSubmittedStateDisplay(row);
}

function handleAvatarAssetDrop(event, row, field, drop) {
  event.preventDefault();
  drop.classList.remove("drag-over");
  if (isAvatarRowLocked(row)) return;
  const assetText = event.dataTransfer.getData("application/x-api-asset");
  if (assetText) {
    addAssetToAvatarRow(row, field, [JSON.parse(assetText)]);
    return;
  }
  const expectedType = field === "audio" ? "audio" : "image";
  const files = Array.from(event.dataTransfer.files || []).filter(file => file.type.startsWith(`${expectedType}/`));
  if (files.length) uploadAvatarAssetFiles(files, row.id, field);
}

function handleMotionAssetDrop(event, row, field, drop) {
  event.preventDefault();
  drop.classList.remove("drag-over");
  if (isMotionRowLocked(row)) return;
  const assetText = event.dataTransfer.getData("application/x-api-asset");
  if (assetText) {
    addAssetToMotionRow(row, field, [JSON.parse(assetText)]);
    return;
  }
  const expectedType = field === "video" ? "video" : "image";
  const files = Array.from(event.dataTransfer.files || []).filter(file => file.type.startsWith(`${expectedType}/`));
  if (files.length) uploadMotionAssetFiles(files, row.id, field);
}

function handleImageVideoFrameDrop(event, row, field, drop) {
  event.preventDefault();
  drop.classList.remove("drag-over");
  if (isImageVideoRowLocked(row) || (field === "lastFrame" && !supportsImageVideoLastFrame(row))) return;
  const assetText = event.dataTransfer.getData("application/x-api-asset");
  if (assetText) {
    addFrameToImageVideoRow(row, field, [JSON.parse(assetText)]);
    return;
  }
  const files = Array.from(event.dataTransfer.files || []).filter(file => file.type.startsWith("image/"));
  if (files.length) uploadImageVideoFrameFiles(files, row.id, field);
}

function updateMultiRowField(row, field, value, redraw = true) {
  if (field === "generateAudio" && !getMultiModel(row).supportsGenerateAudio) return;
  if (isMultiRowLocked(row)) return;
  const becameDirty = markRowDirty(row);
  if (field === "model") {
    const next = MULTI_VIDEO_MODELS[value] || MULTI_VIDEO_MODELS.seedance;
    const previousSize = row.size;
    const previousQuality = row.quality;
    const previousDuration = row.duration;
    row.model = value;
    row.version = next.versions[0].value;
    row.size = chooseCompatibleOption(previousSize, next.sizes);
    const qualityOptions = getMultiQualityOptions(row);
    row.quality = chooseCompatibleOption(previousQuality, qualityOptions, qualityOptions[1] || qualityOptions[0] || "");
    row.duration = next.durations.includes(String(previousDuration)) ? String(previousDuration) : (next.durations[0] || "5");
    row.refs = row.refs.slice(0, next.maxRefs);
  } else if (field === "count") {
    row.count = Math.max(1, Number(value || 1));
  } else if (field === "version") {
    row.version = value;
    row.quality = nearestQualityOption(row.quality, getMultiQualityOptions(row), getMultiQualityOptions(row)[0] || "");
  } else if (field === "duration") {
    row.duration = String(value || "5");
  } else if (field === "generateAudio") {
    row.generateAudio = Boolean(value);
  } else {
    row[field] = value;
  }
  persistMultiRows();
  if (redraw) render();
  else if (becameDirty) refreshRowSubmittedStateDisplay(row);
}

function updateViduRefRowField(row, field, value, redraw = true) {
  if (isViduRefRowLocked(row)) return;
  const becameDirty = markRowDirty(row);
  if (field === "version") {
    row.version = value;
    row.quality = chooseCompatibleOption(row.quality, getViduRefQualityOptions(row), getViduRefQualityOptions(row)[0] || "720p");
    row.duration = getViduRefDurationOptions(row).includes(String(row.duration)) ? String(row.duration) : (getViduRefDurationOptions(row).includes("5") ? "5" : getViduRefDurationOptions(row)[0]);
  } else if (field === "count") {
    row.count = Math.max(1, Number(value || 1));
  } else if (field === "offPeak") {
    row.offPeak = Boolean(value);
  } else if (field === "seed") {
    row.seed = value === "" ? "" : String(Math.max(0, Math.floor(Number(value || 0))));
  } else if (field === "duration") {
    row.duration = String(value || "5");
  } else {
    row[field] = value;
  }
  persistViduRefRows();
  if (redraw) render();
  else if (becameDirty) refreshRowSubmittedStateDisplay(row);
}

function handleViduRefDrop(event, row, drop) {
  event.preventDefault();
  drop.classList.remove("drag-over");
  if (isViduRefRowLocked(row)) return;
  const assetText = event.dataTransfer.getData("application/x-api-asset");
  if (assetText) {
    addRefsToViduRefRow(row, [JSON.parse(assetText)]);
    return;
  }
  const files = Array.from(event.dataTransfer.files || []).filter(file => file.type.startsWith("image/"));
  if (files.length) uploadViduRefFiles(files, row.id);
}

function handleMultiDrop(event, row, drop) {
  event.preventDefault();
  drop.classList.remove("drag-over");
  if (isMultiRowLocked(row)) return;
  const assetText = event.dataTransfer.getData("application/x-api-asset");
  if (assetText) {
    addRefsToMultiRow(row, [JSON.parse(assetText)]);
    return;
  }
  const files = Array.from(event.dataTransfer.files || []);
  if (files.length) uploadReferenceFiles(files, row.id);
}

function bindGlobalPasteHandler() {
  document.addEventListener("paste", event => {
    if (isTextEditingTarget(event.target) && !event.target.classList?.contains("image-drop")) return;
    const target = state.pasteTarget;
    if (!target) return;
    const files = (target.type === "suno" || target.type === "viduVoice" || (target.type === "subject" && target.assetType === "audio") || (target.type === "avatar" && target.field === "audio"))
      ? getFilesFromClipboardEvent(event, "audio")
      : getImageFilesFromClipboardEvent(event);
    const text = event.clipboardData?.getData("text/plain") || "";
    const assets = parseClipboardAssets(text);
    const referenceAssets = target.type === "multi" || target.type === "viduRef" ? parseReferenceAssets(text) : [];
    const sunoAssets = target.type === "suno" ? parseReferenceAssets(text).filter(asset => asset.type === "audio") : [];
    const viduVoiceAssets = target.type === "viduVoice" ? parseReferenceAssets(text).filter(asset => asset.type === "audio") : [];
    const subjectAssets = target.type === "subject" ? parseReferenceAssets(text).filter(asset => asset.type === target.assetType) : [];
    const avatarAssets = target.type === "avatar"
      ? parseReferenceAssets(text).filter(asset => asset.type === (target.field === "audio" ? "audio" : "image"))
      : [];
    if (!files.length && !assets.length && !referenceAssets.length && !sunoAssets.length && !viduVoiceAssets.length && !subjectAssets.length && !avatarAssets.length) return;
    event.preventDefault();
    if (target.type === "batch") {
      if (files.length) uploadBatchFiles(files);
      if (assets.length) addAssetsToBatch(assets);
      return;
    }
    if (target.type === "multi") {
      const row = findMultiRow(target.rowId);
      if (!row || isMultiRowLocked(row)) return;
      if (files.length) uploadReferenceFiles(files, row.id);
      if (referenceAssets.length) addRefsToMultiRow(row, referenceAssets);
      return;
    }
    if (target.type === "viduRef") {
      const row = findViduRefRow(target.rowId);
      if (!row || isViduRefRowLocked(row)) return;
      if (files.length) uploadViduRefFiles(files, row.id);
      if (referenceAssets.length) addRefsToViduRefRow(row, referenceAssets);
      return;
    }
    if (target.type === "imageVideo") {
      const row = findImageVideoRow(target.rowId);
      if (!row || isImageVideoRowLocked(row)) return;
      if (files.length) uploadImageVideoFrameFiles(files, row.id, target.field);
      if (assets.length) addFrameToImageVideoRow(row, target.field, assets);
      return;
    }
    if (target.type === "motion") {
      const row = findMotionRow(target.rowId);
      if (!row || isMotionRowLocked(row)) return;
      if (target.field === "image" && files.length) uploadMotionAssetFiles(files, row.id, target.field);
      if (assets.length) addAssetToMotionRow(row, target.field, assets);
      return;
    }
    if (target.type === "avatar") {
      const row = findAvatarRow(target.rowId);
      if (!row || isAvatarRowLocked(row)) return;
      if (files.length) uploadAvatarAssetFiles(files, row.id, target.field);
      if (avatarAssets.length) addAssetToAvatarRow(row, target.field, avatarAssets);
      return;
    }
    if (target.type === "suno") {
      if (files.length) uploadSunoAssetFiles(files, target.opKey, target.field);
      if (sunoAssets.length) addAssetToSunoField(target.opKey, target.field, sunoAssets);
      return;
    }
    if (target.type === "viduVoice") {
      if (files.length) uploadViduVoiceFiles(files, target.field);
      if (viduVoiceAssets.length) addAssetToViduVoiceField(target.field, viduVoiceAssets);
      return;
    }
    if (target.type === "subject") {
      if (files.length) uploadSubjectAssets(files, target.field, target.assetType);
      if (subjectAssets.length) addAssetsToSubjectField(target.field, subjectAssets);
      return;
    }
    const row = findRow(target.rowId);
    if (!row || isRowLocked(row)) return;
    if (files.length) uploadFiles(files, row.id, "image");
    if (assets.length) addAssetsToRow(row, assets);
  });
}

function getFilesFromClipboardEvent(event, requiredType = "") {
  const prefix = requiredType ? `${requiredType}/` : "";
  const files = Array.from(event.clipboardData?.files || []).filter(file => !prefix || file.type.startsWith(prefix));
  if (files.length) return files;
  return Array.from(event.clipboardData?.items || [])
    .filter(item => item.kind === "file" && (!prefix || item.type.startsWith(prefix)))
    .map((item, index) => {
      const file = item.getAsFile();
      if (!file) return null;
      const ext = item.type.split("/")[1] || "bin";
      return file.name ? file : new File([file], `clipboard_paste_${Date.now()}_${index + 1}.${ext}`, { type: item.type });
    })
    .filter(Boolean);
}

function getImageFilesFromClipboardEvent(event) {
  const files = Array.from(event.clipboardData?.files || []).filter(file => file.type.startsWith("image/"));
  if (files.length) return files;
  return Array.from(event.clipboardData?.items || [])
    .filter(item => item.kind === "file" && item.type.startsWith("image/"))
    .map((item, index) => {
      const file = item.getAsFile();
      if (!file) return null;
      const ext = item.type.split("/")[1]?.replace("jpeg", "jpg") || "png";
      return file.name ? file : new File([file], `clipboard_paste_${Date.now()}_${index + 1}.${ext}`, { type: item.type });
    })
    .filter(Boolean);
}

function isTextEditingTarget(target) {
  if (!target) return false;
  const tag = target.tagName;
  return tag === "TEXTAREA" || tag === "INPUT" || target.isContentEditable;
}

async function copyPromptText(text) {
  const value = String(text || "");
  if (!value.trim()) return;
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    const area = document.createElement("textarea");
    area.value = value;
    area.style.position = "fixed";
    area.style.left = "-9999px";
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  }
}

async function pastePromptTextToRow(tr, row, updateField, isLocked) {
  if (typeof isLocked === "function" && isLocked()) return;
  const text = await readClipboardText();
  if (!text.trim()) {
    window.alert("剪贴板里没有可粘贴的文本");
    return;
  }
  updateField(row, "prompt", text, false);
  const textarea = tr.querySelector(".prompt-input");
  if (textarea) textarea.value = text;
  render();
}

function clearPromptForRow(row, updateField, isLocked) {
  if (!row || (typeof isLocked === "function" && isLocked())) return;
  if (!String(row.prompt || "").trim()) return;
  markRowDirty(row);
  updateField(row, "prompt", "", false);
  render();
}

function clearRowImages(row) {
  if (!row || isRowLocked(row) || !Array.isArray(row.images) || !row.images.length) return;
  markRowDirty(row);
  row.images = [];
  persistRows();
  render();
}

function clearImageVideoFrame(row, field) {
  if (!row || isImageVideoRowLocked(row)) return;
  if (field !== "firstFrame" && field !== "lastFrame") return;
  if (!row[field]) return;
  markRowDirty(row);
  row[field] = null;
  persistImageVideoRows();
  render();
}

function clearMotionAsset(row, field) {
  if (!row || isMotionRowLocked(row)) return;
  if (field !== "image" && field !== "video") return;
  if (!row[field]) return;
  markRowDirty(row);
  row[field] = null;
  persistMotionRows();
  render();
}

function clearAvatarAsset(row, field) {
  if (!row || isAvatarRowLocked(row)) return;
  if (field !== "image" && field !== "audio") return;
  if (!row[field]) return;
  markRowDirty(row);
  row[field] = null;
  persistAvatarRows();
  render();
}

function clearMultiRefs(row) {
  if (!row || isMultiRowLocked(row) || !Array.isArray(row.refs) || !row.refs.length) return;
  markRowDirty(row);
  row.refs = [];
  persistMultiRows();
  render();
}

function clearViduRefAssets(row) {
  if (!row || isViduRefRowLocked(row) || !Array.isArray(row.refs) || !row.refs.length) return;
  markRowDirty(row);
  row.refs = [];
  persistViduRefRows();
  render();
}

async function copyRowImages(row) {
  await copyImageAssets(row.images || []);
}

async function copyImageAssets(sourceAssets) {
  const assets = cloneAssets(sourceAssets || []);
  if (!assets.length) {
    window.alert("还没有图片可复制");
    return;
  }
  state.copiedImages = assets;
  const payload = IMAGE_CLIPBOARD_PREFIX + JSON.stringify(assets.map(asset => ({
    id: asset.id,
    name: asset.name,
    url: asset.url,
    preview: asset.preview || asset.url,
    type: asset.type || "image",
    width: asset.width,
    height: asset.height,
    size: asset.size,
    source: "copied"
  })));
  try {
    await navigator.clipboard.writeText(payload);
    window.alert(`已复制 ${assets.length} 张图片引用`);
  } catch {
    window.alert(`已复制 ${assets.length} 张图片引用到本页缓存`);
  }
}

async function pasteClipboardToRow(row) {
  if (isRowLocked(row)) return;
  state.pasteTarget = { type: "row", rowId: row.id };
  const clipboardFiles = await readClipboardImageFiles();
  if (clipboardFiles.length) {
    await uploadFiles(clipboardFiles, row.id, "image");
    return;
  }

  const text = await readClipboardText();
  const clipboardAssets = parseClipboardAssets(text);
  if (clipboardAssets.length) {
    addAssetsToRow(row, clipboardAssets);
    return;
  }

  if (state.copiedImages.length) {
    addAssetsToRow(row, cloneAssets(state.copiedImages));
    return;
  }

  const url = window.prompt("没有直接读到剪贴板图片。你也可以先点击图片框后按 Ctrl+V，或在这里粘贴图片 URL。");
  if (!url) return;
  addAssetsToRow(row, [{
    id: uid("asset"),
    name: shortUrl(url),
    url: url.trim(),
    preview: url.trim(),
    type: "image",
    source: "url",
    createdAt: Date.now()
  }]);
}

async function readClipboardImageFiles() {
  if (!navigator.clipboard?.read) return [];
  try {
    const items = await navigator.clipboard.read();
    const files = [];
    for (const item of items) {
      const imageType = item.types.find(type => type.startsWith("image/"));
      if (!imageType) continue;
      const blob = await item.getType(imageType);
      const ext = imageType.split("/")[1]?.replace("jpeg", "jpg") || "png";
      files.push(new File([blob], `clipboard_${Date.now()}_${files.length + 1}.${ext}`, { type: imageType }));
    }
    return files;
  } catch {
    return [];
  }
}

async function readClipboardText() {
  if (!navigator.clipboard?.readText) return "";
  try {
    return await navigator.clipboard.readText();
  } catch {
    return "";
  }
}

function parseClipboardAssets(text) {
  const value = String(text || "").trim();
  if (!value) return [];
  if (value.startsWith(IMAGE_CLIPBOARD_PREFIX)) {
    try {
      return normalizeAssets(JSON.parse(value.slice(IMAGE_CLIPBOARD_PREFIX.length))).filter(item => item.type === "image");
    } catch {
      return [];
    }
  }
  return value
    .split(/\s+/)
    .map(item => item.trim())
    .filter(item => /^https?:\/\/.+/i.test(item))
    .map(url => ({
      id: uid("asset"),
      name: shortUrl(url),
      url,
      preview: url,
      type: guessType(url),
      source: "url",
      createdAt: Date.now()
    }));
}

function addAssetsToRow(row, assets) {
  const imageAssets = normalizeAssets(assets).filter(asset => asset.type === "image");
  imageAssets.forEach(addUploadHistory);
  markRowDirty(row);
  row.images = mergeAssets(row.images, imageAssets, getModel(row).maxImages);
  persistRows();
  render();
}

function addAssetsToBatch(assets) {
  const imageAssets = normalizeAssets(assets).filter(asset => asset.type === "image");
  imageAssets.forEach(addUploadHistory);
  state.batchImages = mergeAssets(state.batchImages, imageAssets, getBatchModel().maxImages);
  renderBatchImages();
}

function parseReferenceAssets(text) {
  const value = String(text || "").trim();
  if (!value) return [];
  if (value.startsWith(IMAGE_CLIPBOARD_PREFIX)) {
    try {
      return normalizeAssets(JSON.parse(value.slice(IMAGE_CLIPBOARD_PREFIX.length)));
    } catch {
      return [];
    }
  }
  return value
    .split(/\s+/)
    .map(item => item.trim())
    .filter(item => /^https?:\/\/.+/i.test(item))
    .map(url => ({
      id: uid("asset"),
      name: shortUrl(url),
      url,
      preview: url,
      type: guessType(url),
      source: "url",
      createdAt: Date.now()
    }));
}

function addRefsToMultiRow(row, assets) {
  const refs = normalizeAssets(assets);
  refs.forEach(addUploadHistory);
  markRowDirty(row);
  row.refs = mergeAssets(row.refs || [], refs, getMultiModel(row).maxRefs);
  persistMultiRows();
  render();
}

function addRefsToViduRefRow(row, assets) {
  const refs = normalizeAssets(assets).filter(asset => asset.type === "image");
  refs.forEach(addUploadHistory);
  markRowDirty(row);
  row.refs = mergeAssets(row.refs || [], refs, VIDU_REF_VIDEO_MODEL.maxRefs);
  persistViduRefRows();
  render();
}

function addFrameToImageVideoRow(row, field, assets) {
  if (!row || isImageVideoRowLocked(row)) return;
  if (field === "lastFrame" && !supportsImageVideoLastFrame(row)) return;
  const asset = normalizeAssets(assets).filter(item => item.type === "image")[0];
  if (!asset) return;
  addUploadHistory(asset);
  markRowDirty(row);
  row[field] = { ...asset, id: uid(`${field}frame`) };
  persistImageVideoRows();
  render();
}

function addAssetToAvatarRow(row, field, assets) {
  if (!row || isAvatarRowLocked(row)) return;
  const expectedType = field === "audio" ? "audio" : "image";
  const asset = normalizeAssets(assets).filter(item => item.type === expectedType)[0];
  if (!asset) return;
  addUploadHistory(asset);
  markRowDirty(row);
  row[field] = asset;
  persistAvatarRows();
  render();
}

async function uploadAvatarAssetFiles(files, rowId, field) {
  const row = findAvatarRow(rowId);
  if (!row || isAvatarRowLocked(row)) return;
  const expectedType = field === "audio" ? "audio" : "image";
  const accepted = files.filter(file => file.type.startsWith(`${expectedType}/`)).slice(0, 1);
  for (const file of accepted) {
    const meta = await getFileMeta(file);
    const form = new FormData();
    form.append("file", file);
    try {
      const response = await fetch(`${apiBase()}/fileupload`, { method: "POST", body: form });
      const json = await response.json();
      const uploadedUrl = uploadResponseUrl(json);
      if (!response.ok || !uploadedUrl) throw new Error(json.message || `HTTP ${response.status}`);
      addAssetToAvatarRow(row, field, [{
        id: uid("asset"),
        name: file.name,
        url: uploadedUrl,
        preview: uploadedUrl,
        type: meta.type,
        width: meta.width,
        height: meta.height,
        duration: meta.duration,
        size: file.size,
        createdAt: Date.now()
      }]);
    } catch (error) {
      window.alert(`上传失败: ${file.name} ${error.message}`);
    }
  }
}

async function pasteClipboardToAvatarAsset(row, field) {
  if (!row || isAvatarRowLocked(row)) return;
  state.pasteTarget = { type: "avatar", rowId: row.id, field };
  const expectedType = field === "audio" ? "audio" : "image";
  if (expectedType === "image") {
    const clipboardFiles = await readClipboardImageFiles();
    if (clipboardFiles.length) {
      await uploadAvatarAssetFiles(clipboardFiles, row.id, field);
      return;
    }
  }
  const text = await readClipboardText();
  const clipboardAssets = parseReferenceAssets(text).filter(asset => asset.type === expectedType);
  if (clipboardAssets.length) {
    addAssetToAvatarRow(row, field, clipboardAssets);
    return;
  }
  const copied = cloneAssets(state.copiedRefs || []).filter(asset => asset.type === expectedType);
  if (copied.length) {
    addAssetToAvatarRow(row, field, copied);
    return;
  }
  const url = window.prompt(`没有直接读到剪贴板${expectedType === "audio" ? "音频" : "图片"}，也可以在这里粘贴 URL。`);
  if (!url) return;
  addAssetToAvatarRow(row, field, [{
    id: uid("asset"),
    name: shortUrl(url),
    url: url.trim(),
    preview: url.trim(),
    type: expectedType,
    source: "url",
    createdAt: Date.now()
  }]);
}

function viduVoiceEndpoint() {
  return normalizeEndpointPath(localStorage.getItem(STORAGE_KEYS.viduVoiceEndpoint) || VIDU_VOICE_ENDPOINT_CANDIDATES[0]);
}

function persistViduVoiceState() {
  saveJson(STORAGE_KEYS.viduVoiceState, state.viduVoiceState);
}

function updateViduVoiceField(field, value, shouldPersist = true) {
  state.viduVoiceState[field] = value;
  if (shouldPersist) persistViduVoiceState();
}

function addAssetToViduVoiceField(field, assets) {
  const asset = normalizeAssets(assets).filter(item => item.type === "audio")[0];
  if (!asset) return;
  addUploadHistory(asset);
  state.viduVoiceState[field] = asset;
  persistViduVoiceState();
  render();
}

async function uploadViduVoiceFiles(files, field = null) {
  const accepted = files.filter(file => file.type.startsWith("audio/"));
  for (const file of accepted) {
    const meta = await getFileMeta(file);
    const form = new FormData();
    form.append("file", file);
    try {
      const response = await fetch(`${apiBase()}/fileupload`, { method: "POST", body: form });
      const json = await response.json();
      const uploadedUrl = uploadResponseUrl(json);
      if (!response.ok || !uploadedUrl) throw new Error(json.message || `HTTP ${response.status}`);
      const asset = {
        id: uid("asset"),
        name: file.name,
        url: uploadedUrl,
        preview: uploadedUrl,
        type: meta.type,
        duration: meta.duration,
        size: file.size,
        createdAt: Date.now()
      };
      if (field) {
        addAssetToViduVoiceField(field, [asset]);
      } else {
        addUploadHistory(asset);
        render();
      }
    } catch (error) {
      window.alert(`上传失败: ${file.name} ${error.message}`);
    }
  }
}

async function pasteClipboardToViduVoiceAsset(field) {
  state.pasteTarget = { type: "viduVoice", field };
  const text = await readClipboardText();
  const assets = parseReferenceAssets(text).filter(asset => asset.type === "audio");
  if (assets.length) {
    addAssetToViduVoiceField(field, assets);
    return;
  }
  const copied = cloneAssets(state.copiedRefs || []).filter(asset => asset.type === "audio");
  if (copied.length) {
    addAssetToViduVoiceField(field, copied);
    return;
  }
  const url = window.prompt("没有直接读到剪贴板音频，也可以在这里粘贴音频 URL。");
  if (!url) return;
  addAssetToViduVoiceField(field, [{
    id: uid("asset"),
    name: shortUrl(url),
    url: url.trim(),
    preview: url.trim(),
    type: "audio",
    source: "url",
    createdAt: Date.now()
  }]);
}

function handleViduVoiceDrop(event, field, drop) {
  event.preventDefault();
  drop.classList.remove("drag-over");
  const assetText = event.dataTransfer.getData("application/x-api-asset");
  if (assetText) {
    addAssetToViduVoiceField(field, [JSON.parse(assetText)]);
    return;
  }
  const files = Array.from(event.dataTransfer.files || []).filter(file => file.type.startsWith("audio/"));
  if (files.length) uploadViduVoiceFiles(files, field);
}

async function submitViduVoiceClone() {
  const voice = state.viduVoiceState;
  const error = validateViduVoiceClone();
  if (error) {
    voice.status = "failed";
    voice.error = error;
    persistViduVoiceState();
    render();
    return;
  }
  const payload = compactObject({
    audio_url: assetUrl(voice.audio),
    voice_id: String(voice.voiceId || "").trim(),
    prompt_audio_url: assetUrl(voice.promptAudio),
    prompt_text: String(voice.promptText || "").trim(),
    text: String(voice.text || "").trim(),
    payload: String(voice.payload || "")
  });
  voice.status = "running";
  voice.error = "";
  voice.taskId = "";
  voice.returnedVoiceId = "";
  voice.demoAudio = "";
  voice.resultData = null;
  persistViduVoiceState();
  render();
  try {
    const response = await postViduVoiceClone(payload);
    const data = unwrapGatewayData(response);
    voice.status = "done";
    voice.resultData = data;
    voice.taskId = data.task_id || data.taskId || "";
    voice.returnedVoiceId = data.voice_id || data.voiceId || payload.voice_id || "";
    voice.demoAudio = data.demo_audio || data.demoAudio || data.audio_url || data.url || "";
    saveViduVoiceCloneToLibrary({
      name: voice.returnedVoiceId || payload.voice_id,
      voiceId: voice.returnedVoiceId || payload.voice_id,
      taskId: voice.taskId,
      audio: voice.audio,
      promptAudio: voice.promptAudio,
      demoAudio: voice.demoAudio,
      payload,
      resultData: data
    });
    if (voice.demoAudio) {
      addGenerationHistory({
        id: uid("gen"),
        createdAt: Date.now(),
        page: "viduVoice",
        taskId: voice.taskId,
        prompt: voice.text,
        model: "Vidu声音克隆",
        version: voice.returnedVoiceId,
        refs: cloneAssets([voice.audio, voice.promptAudio].filter(Boolean)),
        params: payload,
        results: [voice.demoAudio]
      });
    }
  } catch (error) {
    voice.status = "failed";
    voice.error = error.message;
  }
  persistViduVoiceState();
  render();
}

function saveViduVoiceCloneToLibrary({ name, voiceId, taskId, audio, promptAudio, demoAudio, payload, resultData }) {
  const normalizedVoiceId = String(voiceId || "").trim();
  if (!normalizedVoiceId) return;
  const existingIndex = state.subjectLibrary.findIndex(item => item.viduVoiceSubjectId === normalizedVoiceId);
  const existing = existingIndex >= 0 ? state.subjectLibrary[existingIndex] : null;
  const record = {
    id: existing?.id || uid("subject"),
    createdAt: existing?.createdAt || Date.now(),
    name: name || existing?.name || normalizedVoiceId,
    type: "voice",
    model: "vidu",
    klingSubjectId: existing?.klingSubjectId || "",
    klingVoiceSubjectId: existing?.klingVoiceSubjectId || "",
    viduSubjectId: existing?.viduSubjectId || "",
    viduVoiceSubjectId: normalizedVoiceId,
    images: existing?.images || [],
    videos: existing?.videos || [],
    audio: audio ? cloneAssets([audio])[0] : existing?.audio || null,
    resultData: compactObject({
      ...(existing?.resultData && typeof existing.resultData === "object" ? existing.resultData : {}),
      task_id: taskId || existing?.resultData?.task_id || "",
      voice_id: normalizedVoiceId,
      demo_audio: demoAudio || existing?.resultData?.demo_audio || "",
      prompt_audio_url: assetUrl(promptAudio),
      payload,
      raw: resultData
    })
  };
  if (existingIndex >= 0) state.subjectLibrary.splice(existingIndex, 1);
  state.subjectLibrary = [record, ...state.subjectLibrary];
  persistSubjectLibrary();
}

function validateViduVoiceClone() {
  const voice = state.viduVoiceState;
  if (!assetUrl(voice.audio)) return "必须提供原始音频 audio_url";
  const voiceId = String(voice.voiceId || "").trim();
  if (!/^[A-Za-z][A-Za-z0-9_-]{6,254}[A-Za-z0-9]$/.test(voiceId)) {
    return "voice_id 需 8-256 位，英文开头，只能包含字母/数字/-/_，且不能以 - 或 _ 结尾";
  }
  if (!String(voice.text || "").trim()) return "必须填写预览文本 text";
  if (String(voice.text || "").length > 1000) return "预览文本 text 不能超过 1000 字符";
  return "";
}

async function postViduVoiceClone(payload) {
  const custom = viduVoiceEndpoint();
  const candidates = [custom, ...VIDU_VOICE_ENDPOINT_CANDIDATES].filter((item, index, list) => item && list.indexOf(item) === index);
  const errors = [];
  for (const endpoint of candidates) {
    try {
      const response = await postJson(endpoint, payload, REQUEST_TIMEOUT_MS);
      if (response?.success === false) throw new Error(response.message || response.error || "提交失败");
      return response;
    } catch (error) {
      const message = String(error?.message || error);
      errors.push(`${endpoint}: ${message}`);
      if (!/404|not\s*found/i.test(message)) throw error;
    }
  }
  throw new Error(`Vidu声音克隆中转接口未找到：${errors.join("；")}`);
}

function unwrapGatewayData(response) {
  return response?.data || response?.result || response;
}

function persistSubjectCreateState() {
  saveJson(STORAGE_KEYS.subjectCreateState, state.subjectCreateState);
}

function persistSubjectLibrary() {
  saveJson(STORAGE_KEYS.subjectLibrary, state.subjectLibrary);
}

function updateSubjectCreateField(field, value, shouldPersist = true) {
  if (field === "model") state.subjectCreateState.model = SUBJECT_MODEL_CONFIGS[value] ? value : "vidu";
  else state.subjectCreateState[field] = value;
  if (shouldPersist) persistSubjectCreateState();
  if (field === "model" && shouldPersist) render();
}

function subjectAssetsForField(field) {
  const form = state.subjectCreateState;
  if (field === "audio") return form.audio ? [form.audio] : [];
  return normalizeAssets(form[field] || []);
}

function clearSubjectAssetField(field) {
  if (field === "audio") state.subjectCreateState.audio = null;
  else state.subjectCreateState[field] = [];
}

function addAssetsToSubjectField(field, assets) {
  const normalized = normalizeAssets(assets);
  if (field === "audio") {
    const asset = normalized.filter(item => item.type === "audio")[0];
    if (!asset) return;
    addUploadHistory(asset);
    state.subjectCreateState.audio = asset;
  } else {
    const expected = field === "videos" ? "video" : "image";
    const selected = normalized.filter(item => item.type === expected);
    selected.forEach(addUploadHistory);
    state.subjectCreateState[field] = mergeAssets(state.subjectCreateState[field] || [], selected, field === "images" ? 12 : 4);
  }
  persistSubjectCreateState();
  render();
}

async function uploadSubjectAssets(files, field = null, assetType = null) {
  const accepted = files.filter(file => !assetType || file.type.startsWith(`${assetType}/`));
  for (const file of accepted) {
    const meta = await getFileMeta(file);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const response = await fetch(`${apiBase()}/fileupload`, { method: "POST", body: formData });
      const json = await response.json();
      const uploadedUrl = uploadResponseUrl(json);
      if (!response.ok || !uploadedUrl) throw new Error(json.message || `HTTP ${response.status}`);
      const asset = {
        id: uid("asset"),
        name: file.name,
        url: uploadedUrl,
        preview: uploadedUrl,
        type: meta.type,
        width: meta.width,
        height: meta.height,
        duration: meta.duration,
        size: file.size,
        createdAt: Date.now()
      };
      if (field) addAssetsToSubjectField(field, [asset]);
      else {
        addUploadHistory(asset);
        render();
      }
    } catch (error) {
      window.alert(`上传失败: ${file.name} ${error.message}`);
    }
  }
}

async function pasteClipboardToSubjectAsset(field, assetType) {
  state.pasteTarget = { type: "subject", field, assetType };
  const text = await readClipboardText();
  const assets = parseReferenceAssets(text).filter(asset => asset.type === assetType);
  if (assets.length) return addAssetsToSubjectField(field, assets);
  const copied = cloneAssets(state.copiedRefs || []).filter(asset => asset.type === assetType);
  if (copied.length) return addAssetsToSubjectField(field, copied);
  const url = window.prompt(`没有直接读到剪贴板${assetType === "audio" ? "音频" : assetType === "video" ? "视频" : "图片"}，也可以在这里粘贴 URL。`);
  if (!url) return;
  addAssetsToSubjectField(field, [{
    id: uid("asset"),
    name: shortUrl(url),
    url: url.trim(),
    preview: url.trim(),
    type: assetType,
    source: "url",
    createdAt: Date.now()
  }]);
}

function handleSubjectAssetDrop(event, field, assetType, drop) {
  event.preventDefault();
  drop.classList.remove("drag-over");
  const assetText = event.dataTransfer.getData("application/x-api-asset");
  if (assetText) return addAssetsToSubjectField(field, [JSON.parse(assetText)]);
  const files = Array.from(event.dataTransfer.files || []).filter(file => file.type.startsWith(`${assetType}/`));
  if (files.length) uploadSubjectAssets(files, field, assetType);
}

async function submitSubjectCreate() {
  const form = state.subjectCreateState;
  const error = validateSubjectCreate();
  if (error) {
    form.status = "failed";
    form.error = error;
    persistSubjectCreateState();
    render();
    return;
  }
  if (form.model === "vidu" && form.type === "voice") {
    if (!assetUrl(form.audio)) {
      form.status = "failed";
      form.error = "Vidu voice clone needs an audio file";
      persistSubjectCreateState();
      render();
      return;
    }
    await submitSubjectViduVoiceClone();
    return;
  }
  const payload = buildSubjectCreatePayload(form);
  form.status = "running";
  form.error = "";
  form.resultData = null;
  persistSubjectCreateState();
  render();
  try {
    const response = await postSubjectCreate(form.model, payload);
    const data = unwrapGatewayData(response);
    const ids = extractSubjectIds(data, form.model);
    const record = {
      id: uid("subject"),
      createdAt: Date.now(),
      name: form.name,
      type: form.type,
      model: form.model,
      ...ids,
      images: cloneAssets(form.images || []),
      videos: cloneAssets(form.videos || []),
      audio: form.audio ? cloneAssets([form.audio])[0] : null,
      resultData: data
    };
    state.subjectLibrary = [record, ...state.subjectLibrary];
    form.status = "done";
    form.resultData = data;
    form.error = "";
    persistSubjectLibrary();
  } catch (error) {
    form.status = "failed";
    form.error = error.message;
  }
  persistSubjectCreateState();
  render();
}

async function submitSubjectViduVoiceClone() {
  const form = state.subjectCreateState;
  const payload = compactObject({
    audio_url: assetUrl(form.audio),
    voice_id: safeSubjectVoiceId(form.name, "vidu"),
    text: String(form.note || "hello, welcome to vidu API platform.").slice(0, 1000),
    payload: JSON.stringify(compactObject({
      source: "subject_library_voice",
      subject_name: form.name,
      subject_type: form.type
    }))
  });
  form.status = "running";
  form.error = "";
  form.resultData = null;
  persistSubjectCreateState();
  render();
  try {
    const response = await postViduVoiceClone(payload);
    const data = unwrapGatewayData(response);
    const voiceId = data.voice_id || data.voiceId || payload.voice_id || "";
    const taskId = data.task_id || data.taskId || "";
    const demoAudio = data.demo_audio || data.demoAudio || data.audio_url || data.url || "";
    saveViduVoiceCloneToLibrary({
      name: form.name || voiceId,
      voiceId,
      taskId,
      audio: form.audio,
      promptAudio: null,
      demoAudio,
      payload,
      resultData: data
    });
    form.status = "done";
    form.resultData = data;
    form.error = "";
  } catch (error) {
    form.status = "failed";
    form.error = error.message;
  }
  persistSubjectCreateState();
  render();
}

function validateSubjectCreate() {
  const form = state.subjectCreateState;
  if (!String(form.name || "").trim()) return "请填写主体名称";
  const hasVisual = (form.images || []).length || (form.videos || []).length;
  if (!hasVisual && !form.audio) return "请至少上传图片/视频/声音中的一种素材";
  if (form.type !== "voice" && !hasVisual) return "非音色主体建议至少上传图片或视频素材";
  return "";
}

function buildSubjectCreatePayload(form) {
  const imageUrls = normalizeAssets(form.images || []).map(asset => asset.url);
  const videoUrls = normalizeAssets(form.videos || []).map(asset => asset.url);
  const audioUrl = assetUrl(form.audio);
  const generatedVoiceId = safeSubjectVoiceId(form.name, form.model);
  return compactObject({
    model: form.model,
    provider: form.model,
    subject_name: form.name,
    name: form.name,
    subject_type: form.type,
    type: form.type,
    category: form.type,
    image_urls: imageUrls,
    images: imageUrls,
    reference_images: imageUrls,
    video_urls: videoUrls,
    videos: videoUrls,
    reference_videos: videoUrls,
    audio_url: audioUrl,
    voice_url: audioUrl,
    voice_id: audioUrl ? generatedVoiceId : "",
    text: audioUrl ? "This is a preview for voice cloning." : "",
    note: form.note
  });
}

async function postSubjectCreate(model, payload) {
  const config = SUBJECT_MODEL_CONFIGS[model] || SUBJECT_MODEL_CONFIGS.vidu;
  const errors = [];
  for (const endpoint of config.endpointCandidates) {
    try {
      const response = await postJson(endpoint, payload, REQUEST_TIMEOUT_MS);
      if (response?.success === false) throw new Error(response.message || response.error || "提交失败");
      return response;
    } catch (error) {
      const message = String(error?.message || error);
      errors.push(`${endpoint}: ${message}`);
      if (!/404|not\s*found/i.test(message)) throw error;
    }
  }
  throw new Error(`${config.label} 主体创建中转接口未找到：${errors.join("；")}`);
}

function extractSubjectIds(data, model) {
  const flat = flattenObject(data);
  const pick = patterns => {
    const entry = Object.entries(flat).find(([key, value]) => value && patterns.some(pattern => pattern.test(key)));
    return entry ? String(entry[1]) : "";
  };
  const subjectId = pick([/subject.*id/i, /character.*id/i, /person.*id/i, /entity.*id/i, /resource.*id/i]);
  const voiceId = pick([/voice.*subject.*id/i, /voice.*id/i, /speaker.*id/i, /audio.*id/i]);
  return {
    klingSubjectId: model === "kling" ? subjectId : "",
    klingVoiceSubjectId: model === "kling" ? voiceId : "",
    viduSubjectId: model === "vidu" ? subjectId : "",
    viduVoiceSubjectId: model === "vidu" ? voiceId : ""
  };
}

function flattenObject(value, prefix = "", out = {}) {
  if (!value || typeof value !== "object") return out;
  Object.entries(value).forEach(([key, item]) => {
    const nextKey = prefix ? `${prefix}.${key}` : key;
    if (item && typeof item === "object" && !Array.isArray(item)) flattenObject(item, nextKey, out);
    else if (Array.isArray(item)) item.forEach((child, index) => child && typeof child === "object" && flattenObject(child, `${nextKey}.${index}`, out));
    else out[nextKey] = item;
  });
  return out;
}

function safeSubjectVoiceId(name, model) {
  const base = String(name || "subject").toLowerCase().replace(/[^a-z0-9_-]+/g, "_").replace(/^[_-]+|[_-]+$/g, "");
  const prefix = /^[a-z]/.test(base) ? base : `${model || "v"}_${base}`;
  return `${prefix}_${Date.now().toString(36)}`.slice(0, 80).replace(/[_-]+$/g, "v");
}

function addAssetToMotionRow(row, field, assets) {
  if (!row || isMotionRowLocked(row)) return;
  const expectedType = field === "video" ? "video" : "image";
  const asset = normalizeAssets(assets).filter(item => item.type === expectedType)[0];
  if (!asset) return;
  addUploadHistory(asset);
  markRowDirty(row);
  row[field] = asset;
  persistMotionRows();
  render();
}

async function uploadMotionAssetFiles(files, rowId, field) {
  const row = findMotionRow(rowId);
  if (!row || isMotionRowLocked(row)) return;
  const expectedType = field === "video" ? "video" : "image";
  const accepted = files.filter(file => file.type.startsWith(`${expectedType}/`)).slice(0, 1);
  for (const file of accepted) {
    const meta = await getFileMeta(file);
    const form = new FormData();
    form.append("file", file);
    try {
      const response = await fetch(`${apiBase()}/fileupload`, { method: "POST", body: form });
      const json = await response.json();
      const uploadedUrl = uploadResponseUrl(json);
      if (!response.ok || !uploadedUrl) throw new Error(json.message || `HTTP ${response.status}`);
      addAssetToMotionRow(row, field, [{
        id: uid("asset"),
        name: file.name,
        url: uploadedUrl,
        preview: uploadedUrl,
        type: meta.type,
        width: meta.width,
        height: meta.height,
        duration: meta.duration,
        size: file.size,
        createdAt: Date.now()
      }]);
    } catch (error) {
      window.alert(`上传失败: ${file.name} ${error.message}`);
    }
  }
}

async function pasteClipboardToMotionAsset(row, field) {
  if (!row || isMotionRowLocked(row)) return;
  state.pasteTarget = { type: "motion", rowId: row.id, field };
  const expectedType = field === "video" ? "video" : "image";
  if (expectedType === "image") {
    const clipboardFiles = await readClipboardImageFiles();
    if (clipboardFiles.length) {
      await uploadMotionAssetFiles(clipboardFiles, row.id, field);
      return;
    }
  }
  const text = await readClipboardText();
  const clipboardAssets = parseClipboardAssets(text).filter(asset => asset.type === expectedType);
  if (clipboardAssets.length) {
    addAssetToMotionRow(row, field, clipboardAssets);
    return;
  }
  const url = window.prompt(`没有直接读到剪贴板${expectedType === "video" ? "视频" : "图片"}。也可以在这里粘贴 URL。`);
  if (!url) return;
  addAssetToMotionRow(row, field, [{
    id: uid("asset"),
    name: shortUrl(url),
    url: url.trim(),
    preview: url.trim(),
    type: expectedType,
    source: "url",
    createdAt: Date.now()
  }]);
}

function getSunoOperationState(opKey = state.sunoState.activeOperation) {
  const key = SUNO_OPERATIONS[opKey] ? opKey : "generate";
  if (!state.sunoState.operations[key]) {
    state.sunoState.operations[key] = normalizeSunoOperationState(key);
  }
  return state.sunoState.operations[key];
}

function updateSunoField(opKey, field, value, shouldPersist = true) {
  const opState = getSunoOperationState(opKey);
  if (["styleWeight", "weirdnessConstraint", "audioWeight"].includes(field)) {
    opState.form[field] = value === "" ? "" : Math.min(1, Math.max(0, Number(value)));
  } else if (field === "continueAt") {
    opState.form[field] = Math.max(0, Number(value || 0));
  } else {
    opState.form[field] = value;
  }
  if (field === "model" && !SUNO_ADVANCED_AUDIO_MODELS.includes(opState.form.model) && ["addInstrumental", "addVocals"].includes(opKey)) {
    opState.form.model = "V5_5";
  }
  if (shouldPersist) persistSunoState();
}

function addAssetToSunoField(opKey, field, assets) {
  const asset = normalizeAssets(assets).filter(item => item.type === "audio")[0];
  if (!asset) return;
  addUploadHistory(asset);
  const form = getSunoOperationState(opKey).form;
  form[field] = asset;
  if (field === "sourceAudio" && ["addInstrumental", "addVocals"].includes(opKey)) {
    form.uploadUrl = asset.url;
  }
  persistSunoState();
  render();
}

function removeSunoAsset(opKey, assetId) {
  const form = getSunoOperationState(opKey).form;
  Object.keys(form).forEach(key => {
    if (form[key]?.id === assetId) form[key] = null;
  });
  persistSunoState();
  render();
}

async function uploadSunoAssetFiles(files, opKey, field) {
  const accepted = files.filter(file => file.type.startsWith("audio/")).slice(0, 1);
  for (const file of accepted) {
    const meta = await getFileMeta(file);
    const form = new FormData();
    form.append("file", file);
    try {
      const response = await fetch(`${apiBase()}/fileupload`, { method: "POST", body: form });
      const json = await response.json();
      const uploadedUrl = uploadResponseUrl(json);
      if (!response.ok || !uploadedUrl) throw new Error(json.message || `HTTP ${response.status}`);
      addAssetToSunoField(opKey, field, [{
        id: uid("asset"),
        name: file.name,
        url: uploadedUrl,
        preview: uploadedUrl,
        type: meta.type,
        duration: meta.duration,
        size: file.size,
        createdAt: Date.now()
      }]);
    } catch (error) {
      window.alert(`上传失败: ${file.name} ${error.message}`);
    }
  }
}

async function pasteClipboardToSunoAsset(opKey, field) {
  state.pasteTarget = { type: "suno", opKey, field };
  const text = await readClipboardText();
  const assets = parseReferenceAssets(text).filter(asset => asset.type === "audio");
  if (assets.length) {
    addAssetToSunoField(opKey, field, assets);
    return;
  }
  if (state.copiedRefs.length) {
    addAssetToSunoField(opKey, field, cloneAssets(state.copiedRefs).filter(asset => asset.type === "audio"));
    return;
  }
  const url = window.prompt("没有直接读到剪贴板音频。也可以在这里粘贴音频 URL。");
  if (!url) return;
  addAssetToSunoField(opKey, field, [{
    id: uid("asset"),
    name: shortUrl(url),
    url: url.trim(),
    preview: url.trim(),
    type: "audio",
    source: "url",
    createdAt: Date.now()
  }]);
}

function handleSunoAssetDrop(event, opKey, field, drop) {
  event.preventDefault();
  drop.classList.remove("drag-over");
  const assetText = event.dataTransfer.getData("application/x-api-asset");
  if (assetText) {
    addAssetToSunoField(opKey, field, [JSON.parse(assetText)]);
    return;
  }
  const files = Array.from(event.dataTransfer.files || []);
  if (files.length) uploadSunoAssetFiles(files, opKey, field);
}

async function submitSunoOperation(opKey) {
  const op = SUNO_OPERATIONS[opKey];
  const opState = getSunoOperationState(opKey);
  try {
    const payload = buildSunoPayload(opKey, opState.form);
    opState.status = "running";
    opState.error = "";
    opState.taskId = "";
    opState.results = [];
    opState.resultData = null;
    persistSunoState();
    render();
    const response = await sunoPost(op.endpoint, payload);
    const task = normalizeSunoTask(response);
    if (!task.taskId) throw new Error("Suno 返回缺少 taskId");
    opState.taskId = task.taskId;
    persistSunoState();
    render();
    const resultData = await pollSunoTask(op.queryEndpoint, task.taskId, opKey);
    const results = normalizeSunoResults(resultData);
    opState.status = "done";
    opState.resultData = resultData;
    opState.results = results;
    opState.error = "";
    addGenerationHistory({
      id: uid("gen"),
      createdAt: Date.now(),
      page: "music",
      taskId: task.taskId,
      prompt: sunoHistoryPrompt(opKey, opState.form),
      model: "Suno",
      version: `${op.label} / ${opState.form.model || ""}`,
      size: "",
      quality: "",
      duration: "",
      images: [],
      refs: cloneAssets([opState.form.sourceAudio].filter(Boolean)),
      params: payload,
      results
    });
  } catch (error) {
    opState.status = "failed";
    opState.error = error.message || String(error);
  } finally {
    persistSunoState();
    render();
  }
}

function buildSunoPayload(opKey, form) {
  const errors = validateSunoForm(opKey, form);
  if (errors.length) throw new Error(errors.join("；"));
  const callback = form.callBackUrl || "https://example.com/suno-callback";
  if (opKey === "generate") {
    if (!form.customMode) {
      return compactObject({
        prompt: form.prompt,
        customMode: false,
        instrumental: Boolean(form.instrumental),
        model: form.model,
        callBackUrl: callback
      });
    }
    const payload = compactObject({
      prompt: form.instrumental ? undefined : form.prompt,
      customMode: true,
      instrumental: Boolean(form.instrumental),
      model: form.model,
      callBackUrl: callback,
      style: form.style,
      title: form.title
    });
    return withSunoOptionalParams(payload, form);
  }
  if (opKey === "extend") {
    return compactObject({
      audioId: form.audioId,
      defaultParamFlag: Boolean(form.defaultParamFlag),
      model: form.model,
      callBackUrl: callback,
      prompt: form.defaultParamFlag ? form.prompt : undefined,
      style: form.defaultParamFlag ? form.style : undefined,
      title: form.defaultParamFlag ? form.title : undefined,
      continueAt: form.defaultParamFlag ? Number(form.continueAt || 0) : undefined
    });
  }
  if (opKey === "addInstrumental") {
    return withSunoOptionalParams(compactObject({
      uploadUrl: form.uploadUrl || assetUrl(form.sourceAudio),
      title: form.title,
      tags: form.tags,
      negativeTags: form.negativeTags,
      model: form.model,
      callBackUrl: callback
    }), form);
  }
  if (opKey === "addVocals") {
    return withSunoOptionalParams(compactObject({
      uploadUrl: form.uploadUrl || assetUrl(form.sourceAudio),
      prompt: form.prompt,
      title: form.title,
      style: form.style,
      negativeTags: form.negativeTags,
      model: form.model,
      callBackUrl: callback
    }), form);
  }
  if (opKey === "removeVocals" || opKey === "separateVocals") {
    return compactObject({
      taskId: form.taskId,
      audioId: form.audioId,
      callBackUrl: callback,
      type: opKey === "removeVocals" ? "separate_vocal" : form.separationType || "split_stem"
    });
  }
  if (opKey === "midi") {
    return compactObject({
      taskId: form.taskId,
      audioId: form.audioId,
      callBackUrl: callback
    });
  }
  throw new Error("未知 Suno 功能");
}

function validateSunoForm(opKey, form) {
  const errors = [];
  if (sunoApiMode() === "direct" && !localStorage.getItem(STORAGE_KEYS.sunoApiKey)?.trim()) errors.push("请先填写 Suno API Key");
  if (!form.callBackUrl) errors.push("Suno 官方接口要求 callBackUrl");
  if (opKey === "generate") {
    const limits = sunoGenerateLimits(form.model);
    if (!form.customMode) {
      if (!form.prompt.trim()) errors.push("非自定义模式需要 prompt");
      if (form.prompt.length > 500) errors.push("非自定义模式 prompt 不能超过 500 字符");
    } else {
      if (!form.instrumental && !form.prompt.trim()) errors.push("customMode=true 且 instrumental=false 时需要 prompt");
      if (!form.style.trim()) errors.push("customMode=true 时需要 style");
      if (!form.title.trim()) errors.push("customMode=true 时需要 title");
      if (!form.instrumental && form.prompt.length > limits.prompt) errors.push(`${form.model} 的 prompt 不能超过 ${limits.prompt} 字符`);
      if (form.style.length > limits.style) errors.push(`${form.model} 的 style 不能超过 ${limits.style} 字符`);
      if (form.title.length > limits.title) errors.push(`${form.model} 的 title 不能超过 ${limits.title} 字符`);
    }
  }
  if (opKey === "extend") {
    if (!form.audioId.trim()) errors.push("延长音乐需要原 audioId");
    if (form.defaultParamFlag && (!form.prompt.trim() || !form.style.trim() || !form.title.trim())) {
      errors.push("自定义延长参数需要 prompt、style、title");
    }
  }
  if (opKey === "addInstrumental") {
    if (!(form.uploadUrl || assetUrl(form.sourceAudio))) errors.push("添加伴奏需要音频 URL 或上传音频");
    if (!form.title.trim()) errors.push("添加伴奏需要标题");
    if (!String(form.tags || "").trim()) errors.push("添加伴奏需要 tags");
    if (!String(form.negativeTags || "").trim()) errors.push("添加伴奏需要 negativeTags");
  }
  if (opKey === "addVocals") {
    if (!(form.uploadUrl || assetUrl(form.sourceAudio))) errors.push("添加人声需要音频 URL 或上传音频");
    if (!form.prompt.trim()) errors.push("添加人声需要 prompt");
    if (!form.title.trim()) errors.push("添加人声需要标题");
    if (!form.style.trim()) errors.push("添加人声需要风格");
    if (!String(form.negativeTags || "").trim()) errors.push("添加人声需要 negativeTags");
  }
  if (opKey === "removeVocals" || opKey === "separateVocals") {
    if (!form.taskId.trim()) errors.push("需要原任务 taskId");
    if (!form.audioId.trim()) errors.push("需要原音频 audioId");
  }
  if (opKey === "midi" && !form.taskId.trim()) errors.push("MIDI 生成需要音频分离任务 taskId");
  return errors;
}

function withSunoOptionalParams(payload, form) {
  ["personaId", "personaModel", "negativeTags", "vocalGender"].forEach(key => {
    if (form[key]) payload[key] = form[key];
  });
  ["styleWeight", "weirdnessConstraint", "audioWeight"].forEach(key => {
    if (form[key] !== "" && form[key] !== undefined && form[key] !== null) payload[key] = Number(form[key]);
  });
  return payload;
}

function sunoGenerateLimits(model) {
  return {
    prompt: model === "V4" ? 3000 : 5000,
    style: model === "V4" ? 200 : 1000,
    title: model === "V4" || model === "V4_5ALL" ? 80 : 100
  };
}

function compactObject(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== null && item !== ""));
}

async function sunoPost(endpoint, payload) {
  if (sunoApiMode() === "gateway") {
    return postSunoGateway(endpoint, payload);
  }
  const response = await fetch(`${sunoApiBase()}${endpoint}`, {
    method: "POST",
    headers: sunoHeaders(),
    body: JSON.stringify(payload)
  });
  return parseSunoResponse(response);
}

async function sunoGet(endpoint, params) {
  if (sunoApiMode() === "gateway") {
    return getSunoGateway(endpoint, params);
  }
  const url = new URL(`${sunoApiBase()}${endpoint}`);
  Object.entries(params || {}).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetch(url.toString(), { headers: sunoHeaders(false) });
  return parseSunoResponse(response);
}

async function postSunoGateway(endpoint, payload) {
  const errors = [];
  for (const route of sunoGatewayRoutes(endpoint)) {
    try {
      const response = await postJson(route, payload, REQUEST_TIMEOUT_MS);
      return unwrapSunoGatewayResponse(response, "公司中转返回失败");
    } catch (error) {
      const message = String(error?.message || error);
      errors.push(`${route}: ${message}`);
      if (!/404|not\s*found/i.test(message)) throw error;
    }
  }
  throw new Error(`公司中转 Suno 接口未找到：${errors.join("；")}`);
}

async function getSunoGateway(endpoint, params) {
  const queryPayload = { taskId: params?.taskId, task_id: params?.taskId };
  const errors = [];
  for (const route of sunoGatewayRoutes(endpoint)) {
    try {
      const response = isSunoGatewayGetRoute(route)
        ? await getJsonFromGateway(route, { taskId: params?.taskId })
        : await postJson(route, queryPayload, REQUEST_TIMEOUT_MS);
      return unwrapSunoGatewayResponse(response, "公司中转查询返回失败");
    } catch (error) {
      const message = String(error?.message || error);
      errors.push(`${route}: ${message}`);
      if (!/404|not\s*found/i.test(message)) throw error;
    }
  }
  throw new Error(`公司中转 Suno 查询接口未找到：${errors.join("；")}`);
}

async function getJsonFromGateway(endpoint, params) {
  const url = new URL(`${apiBase()}${endpoint}`, window.location.href);
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, value);
  });
  const response = await fetch(url.toString());
  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(text || `HTTP ${response.status}`);
  }
  if (!response.ok) throw new Error(sunoErrorMessage(json, `HTTP ${response.status}`));
  return json;
}

function isSunoGatewayGetRoute(route) {
  return /\/v1\/.+record-info/i.test(route);
}

function unwrapSunoGatewayResponse(response, fallback) {
  if (response?.success === false) throw new Error(response.message || sunoErrorMessage(response, fallback));
  if (response?.code && Number(response.code) !== 200) throw new Error(sunoErrorMessage(response, fallback));
  if (response?.success === true) return response.data ?? response;
  return response?.data ?? response;
}

function sunoGatewayRoutes(endpoint) {
  const map = {
    "/generate": [sunoGatewayGenerateEndpoint(), "/v1/generate", "/suno_generate", "/suno/generate", "/suno_music", "/suno/create"],
    "/generate/record-info": [sunoGatewayQueryEndpoint(), "/v1/generate/record-info", "/suno_generate_query", "/suno/generate_query", "/suno/record-info", "/suno_query"],
    "/generate/extend": ["/suno_extend", "/suno/extend", "/suno_generate_extend"],
    "/generate/add-instrumental": ["/suno_add_instrumental", "/suno/add_instrumental", "/suno/add-instrumental"],
    "/generate/add-vocals": ["/suno_add_vocals", "/suno/add_vocals", "/suno/add-vocals"],
    "/vocal-removal/generate": ["/suno_vocal_removal", "/suno/vocal_removal", "/suno/vocal-removal"],
    "/vocal-removal/record-info": ["/suno_vocal_removal_query", "/suno/vocal_removal_query", "/suno/vocal-removal_query"],
    "/midi/generate": ["/suno_midi", "/suno/midi", "/suno_midi_generate"],
    "/midi/record-info": ["/suno_midi_query", "/suno/midi_query", "/suno/midi-record-info"]
  };
  return [...new Set(map[endpoint] || [`/suno${endpoint.replace(/\//g, "_")}`, `/suno${endpoint}`])];
}

async function parseSunoResponse(response) {
  const text = await response.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(text || `HTTP ${response.status}`);
  }
  if (!response.ok || (json.code && Number(json.code) !== 200)) {
    throw new Error(sunoErrorMessage(json, `HTTP ${response.status}`));
  }
  return json.data ?? json;
}

function sunoErrorMessage(value, fallback = "Suno 请求失败") {
  if (!value) return fallback;
  if (typeof value === "string") return value;
  const direct = value.msg || value.message || value.errorMessage || value.error_description || value.detail;
  if (typeof direct === "string" && direct.trim()) return direct;
  if (direct && typeof direct === "object") return sunoErrorMessage(direct, fallback);
  if (value.error) return sunoErrorMessage(value.error, fallback);
  if (value.data) return sunoErrorMessage(value.data, fallback);
  try {
    return JSON.stringify(value);
  } catch {
    return fallback;
  }
}

function sunoHeaders(includeJson = true) {
  const headers = { Authorization: `Bearer ${localStorage.getItem(STORAGE_KEYS.sunoApiKey) || ""}` };
  if (includeJson) headers["Content-Type"] = "application/json";
  return headers;
}

function sunoApiBase() {
  return (localStorage.getItem(STORAGE_KEYS.sunoApiBase) || SUNO_API_DEFAULT).replace(/\/+$/, "");
}

function sunoApiMode() {
  return localStorage.getItem(STORAGE_KEYS.sunoApiMode) === "direct" ? "direct" : "gateway";
}

function sunoGatewayGenerateEndpoint() {
  const stored = normalizeEndpointPath(localStorage.getItem(STORAGE_KEYS.sunoGatewayGenerate) || "");
  if (!stored || stored === "/suno_generate") return "/v1/generate";
  return stored;
}

function sunoGatewayQueryEndpoint() {
  const stored = normalizeEndpointPath(localStorage.getItem(STORAGE_KEYS.sunoGatewayQuery) || "");
  if (!stored || stored === "/suno_generate_query") return "/v1/generate/record-info";
  return stored;
}

function normalizeEndpointPath(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      return `${parsed.pathname}${parsed.search}` || "/";
    } catch {
      return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
    }
  }
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

async function pollSunoTask(queryEndpoint, taskId, opKey) {
  const deadlineAt = Date.now() + TASK_TIMEOUT_MS;
  for (;;) {
    if (Date.now() > deadlineAt) throw new Error(`任务超过 ${Math.round(TASK_TIMEOUT_MS / 60000)} 分钟未完成，已判定为失败`);
    const data = await sunoGet(queryEndpoint, { taskId });
    const status = String(data.status || data.successFlag || data.state || "").toUpperCase();
    const opState = getSunoOperationState(opKey);
    opState.resultData = data;
    persistSunoState();
    if (["SUCCESS", "COMPLETE", "COMPLETED", "DONE"].includes(status)) return data;
    if (["FAILED", "FAIL", "ERROR", "CANCELED", "CANCELLED"].includes(status)) {
      throw new Error(data.errorMessage || data.error || data.msg || "Suno 任务失败");
    }
    await sleep(30 * 1000);
  }
}

function normalizeSunoTask(data) {
  if (typeof data === "string") return { taskId: data };
  return {
    taskId: data?.taskId || data?.task_id || data?.id || data?.data?.taskId || data?.data?.task_id || data?.result?.taskId || data?.result?.task_id || "",
    taskPath: data?.task_path || data?.taskPath || data?.data?.task_path || data?.result?.task_path || ""
  };
}

function normalizeSunoResults(data) {
  const results = [];
  const visit = value => {
    if (!value) return;
    if (typeof value === "string") {
      if (/^https?:\/\//i.test(value)) results.push(value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (typeof value !== "object") return;
    [
      "audioUrl", "audio_url", "streamAudioUrl", "stream_audio_url", "sourceAudioUrl",
      "imageUrl", "image_url", "videoUrl", "video_url", "midiUrl", "midi_url",
      "instrumentalUrl", "instrumental_url", "vocalUrl", "vocal_url",
      "drumsUrl", "bassUrl", "guitarUrl", "keyboardUrl", "percussionUrl", "stringsUrl",
      "synthUrl", "fxUrl", "brassUrl", "woodwindsUrl"
    ].forEach(key => visit(value[key]));
    ["data", "response", "sunoData", "originData", "vocal_removal_info", "separation_info", "midiData"].forEach(key => visit(value[key]));
  };
  visit(data);
  return [...new Set(results)];
}

function sunoHistoryPrompt(opKey, form) {
  if (opKey === "generate") return form.prompt || `${form.customMode ? "customMode" : "non-custom"} ${form.instrumental ? "instrumental" : "vocal"}`;
  if (opKey === "extend") return form.prompt || `extend ${form.audioId}`;
  if (opKey === "addInstrumental") return `${form.title || ""} ${form.tags || ""}`.trim();
  if (opKey === "addVocals") return form.prompt;
  return `${SunoOperationLabel(opKey)} ${form.taskId || form.audioId || ""}`.trim();
}

function SunoOperationLabel(opKey) {
  return SUNO_OPERATIONS[opKey]?.label || "Suno";
}

function sunoOperationHint(opKey) {
  const hints = {
    generate: "customMode=false 时只需要 prompt，其他参数留空；customMode=true 时按 instrumental 决定是否需要 prompt，style 和 title 必填。",
    extend: "按 Suno 文档传 audioId；开启自定义延长参数后才会附带 prompt/style/title/continueAt。",
    addInstrumental: "需要 uploadUrl、title、tags、negativeTags；上传框会自动把音频 URL 填入 uploadUrl。",
    addVocals: "需要 uploadUrl、prompt、title、style、negativeTags。",
    removeVocals: "使用 vocal-removal/generate，type 固定为 separate_vocal。",
    separateVocals: "使用 vocal-removal/generate，可选择 separate_vocal 或 split_stem。",
    midi: "使用 midi/generate，需要音频分离任务 taskId。"
  };
  return hints[opKey] || "";
}

function sunoStatusClass(status) {
  if (status === "running") return "running";
  if (status === "done") return "done";
  if (status === "failed") return "failed";
  return "pending";
}

function sunoStatusLabel(status) {
  return { idle: "待提交", running: "处理中", done: "完成", failed: "失败" }[status] || "待提交";
}

function persistSunoState() {
  saveJson(STORAGE_KEYS.sunoState, state.sunoState);
}

async function uploadImageVideoFrameFiles(files, rowId, field) {
  const row = findImageVideoRow(rowId);
  if (!row || isImageVideoRowLocked(row)) return;
  const accepted = files.filter(file => file.type.startsWith("image/")).slice(0, 1);
  for (const file of accepted) {
    const meta = await getFileMeta(file);
    const form = new FormData();
    form.append("file", file);
    try {
      const response = await fetch(`${apiBase()}/fileupload`, { method: "POST", body: form });
      const json = await response.json();
      const uploadedUrl = uploadResponseUrl(json);
      if (!response.ok || !uploadedUrl) throw new Error(json.message || `HTTP ${response.status}`);
      addFrameToImageVideoRow(row, field, [{
        id: uid("asset"),
        name: file.name,
        url: uploadedUrl,
        preview: uploadedUrl,
        type: meta.type,
        width: meta.width,
        height: meta.height,
        size: file.size,
        createdAt: Date.now()
      }]);
    } catch (error) {
      window.alert(`上传失败: ${file.name} ${error.message}`);
    }
  }
}

async function pasteClipboardToImageVideoFrame(row, field) {
  if (!row || isImageVideoRowLocked(row)) return;
  state.pasteTarget = { type: "imageVideo", rowId: row.id, field };
  const clipboardFiles = await readClipboardImageFiles();
  if (clipboardFiles.length) {
    await uploadImageVideoFrameFiles(clipboardFiles, row.id, field);
    return;
  }
  const text = await readClipboardText();
  const clipboardAssets = parseClipboardAssets(text);
  if (clipboardAssets.length) {
    addFrameToImageVideoRow(row, field, clipboardAssets);
    return;
  }
  if (state.copiedImages.length) {
    addFrameToImageVideoRow(row, field, cloneAssets(state.copiedImages));
    return;
  }
  const url = window.prompt("没有直接读到剪贴板图片。也可以在这里粘贴图片 URL。");
  if (!url) return;
  addFrameToImageVideoRow(row, field, [{
    id: uid("asset"),
    name: shortUrl(url),
    url: url.trim(),
    preview: url.trim(),
    type: "image",
    source: "url",
    createdAt: Date.now()
  }]);
}

function getBatchModel() {
  const defaults = normalizeBatchDefaults(state.batchDefaults);
  return IMAGE_MODELS[defaults.model] || IMAGE_MODELS.nano;
}

async function uploadBatchFiles(files) {
  const accepted = files.filter(file => file.type.startsWith("image/"));
  for (const file of accepted) {
    const meta = await getFileMeta(file);
    const form = new FormData();
    form.append("file", file);
    try {
      const response = await fetch(`${apiBase()}/fileupload`, { method: "POST", body: form });
      const json = await response.json();
      const uploadedUrl = uploadResponseUrl(json);
      if (!response.ok || !uploadedUrl) throw new Error(json.message || `HTTP ${response.status}`);
      addAssetsToBatch([{
        id: uid("asset"),
        name: file.name,
        url: uploadedUrl,
        preview: uploadedUrl,
        type: meta.type,
        width: meta.width,
        height: meta.height,
        duration: meta.duration,
        size: file.size,
        createdAt: Date.now()
      }]);
    } catch (error) {
      window.alert(`上传失败: ${file.name} ${error.message}`);
    }
  }
}

async function pasteClipboardToBatch() {
  state.pasteTarget = { type: "batch" };
  const clipboardFiles = await readClipboardImageFiles();
  if (clipboardFiles.length) {
    await uploadBatchFiles(clipboardFiles);
    return;
  }
  const text = await readClipboardText();
  const clipboardAssets = parseClipboardAssets(text);
  if (clipboardAssets.length) {
    addAssetsToBatch(clipboardAssets);
    return;
  }
  if (state.copiedImages.length) {
    addAssetsToBatch(cloneAssets(state.copiedImages));
    return;
  }
  batchImageDrop.focus();
  const url = window.prompt("没有直接读到剪贴板图片。你也可以先点击统一图片框后按 Ctrl+V，或在这里粘贴图片 URL。");
  if (!url) return;
  addAssetsToBatch([{
    id: uid("asset"),
    name: shortUrl(url),
    url: url.trim(),
    preview: url.trim(),
    type: "image",
    source: "url",
    createdAt: Date.now()
  }]);
}

async function copyBatchImages() {
  await copyImageAssets(state.batchImages);
}

async function uploadReferenceFiles(files, rowId) {
  const row = findMultiRow(rowId);
  if (!row || isMultiRowLocked(row)) return;
  for (const file of files) {
    let meta = await getFileMeta(file);
    let uploadFile = file;
    let compressedInfo = null;
    if (getMultiModel(row).prepareSeedanceReferences) {
      try {
        const prepared = await prepareSeedanceReferenceFile(file, meta);
        uploadFile = prepared.file;
        meta = prepared.meta;
        compressedInfo = prepared.compressedInfo;
      } catch (error) {
        window.alert(`视频自动压缩失败: ${file.name} ${error.message}`);
        continue;
      }
    }
    const form = new FormData();
    form.append("file", uploadFile);
    try {
      const response = await fetch(`${apiBase()}/fileupload`, { method: "POST", body: form });
      const json = await response.json();
      const uploadedUrl = uploadResponseUrl(json);
      if (!response.ok || !uploadedUrl) throw new Error(json.message || `HTTP ${response.status}`);
      addRefsToMultiRow(row, [{
        id: uid("asset"),
        name: uploadFile.name,
        url: uploadedUrl,
        preview: uploadedUrl,
        type: meta.type,
        width: meta.width,
        height: meta.height,
        duration: meta.duration,
        size: uploadFile.size,
        compressedFrom: compressedInfo,
        createdAt: Date.now()
      }]);
    } catch (error) {
      window.alert(`上传失败: ${file.name} ${error.message}`);
    }
  }
}

async function uploadViduRefFiles(files, rowId = null) {
  const row = rowId ? findViduRefRow(rowId) : null;
  if (rowId && (!row || isViduRefRowLocked(row))) return;
  const accepted = files.filter(file => file.type.startsWith("image/"));
  for (const file of accepted) {
    const meta = await getFileMeta(file);
    const form = new FormData();
    form.append("file", file);
    try {
      const response = await fetch(`${apiBase()}/fileupload`, { method: "POST", body: form });
      const json = await response.json();
      const uploadedUrl = uploadResponseUrl(json);
      if (!response.ok || !uploadedUrl) throw new Error(json.message || `HTTP ${response.status}`);
      const asset = {
        id: uid("asset"),
        name: file.name,
        url: uploadedUrl,
        preview: uploadedUrl,
        type: meta.type,
        width: meta.width,
        height: meta.height,
        size: file.size,
        createdAt: Date.now()
      };
      if (row) {
        addRefsToViduRefRow(row, [asset]);
      } else {
        addUploadHistory(asset);
      }
    } catch (error) {
      window.alert(`上传失败: ${file.name} ${error.message}`);
    }
  }
}

async function pasteClipboardToMultiRow(row) {
  if (isMultiRowLocked(row)) return;
  state.pasteTarget = { type: "multi", rowId: row.id };
  const clipboardFiles = await readClipboardImageFiles();
  if (clipboardFiles.length) {
    await uploadReferenceFiles(clipboardFiles, row.id);
    return;
  }
  const text = await readClipboardText();
  const refs = parseReferenceAssets(text);
  if (refs.length) {
    addRefsToMultiRow(row, refs);
    return;
  }
  if (state.copiedRefs.length) {
    addRefsToMultiRow(row, cloneAssets(state.copiedRefs));
    return;
  }
  const url = window.prompt("没有直接读到剪贴板素材。也可以在这里粘贴图片/视频/音频 URL。");
  if (!url) return;
  addRefsToMultiRow(row, [{
    id: uid("asset"),
    name: shortUrl(url),
    url: url.trim(),
    preview: url.trim(),
    type: guessType(url.trim()),
    source: "url",
    createdAt: Date.now()
  }]);
}

async function copyReferenceAssets(sourceAssets) {
  const assets = cloneAssets(sourceAssets || []);
  if (!assets.length) {
    window.alert("还没有参考素材可复制");
    return;
  }
  state.copiedRefs = assets;
  const payload = IMAGE_CLIPBOARD_PREFIX + JSON.stringify(assets.map(asset => ({
    id: asset.id,
    name: asset.name,
    url: asset.url,
    preview: asset.preview || asset.url,
    type: asset.type || guessType(asset.url),
    width: asset.width,
    height: asset.height,
    duration: asset.duration,
    size: asset.size,
    source: "copied"
  })));
  try {
    await navigator.clipboard.writeText(payload);
    window.alert(`已复制 ${assets.length} 个参考素材引用`);
  } catch {
    window.alert(`已复制 ${assets.length} 个参考素材引用到本页缓存`);
  }
}

async function pasteClipboardToViduRefRow(row) {
  if (!row || isViduRefRowLocked(row)) return;
  state.pasteTarget = { type: "viduRef", rowId: row.id };
  const clipboardFiles = await readClipboardImageFiles();
  if (clipboardFiles.length) {
    await uploadViduRefFiles(clipboardFiles, row.id);
    return;
  }
  const text = await readClipboardText();
  const refs = parseReferenceAssets(text).filter(asset => asset.type === "image");
  if (refs.length) {
    addRefsToViduRefRow(row, refs);
    return;
  }
  const copied = cloneAssets(state.copiedRefs || []).filter(asset => asset.type === "image");
  if (copied.length) {
    addRefsToViduRefRow(row, copied);
    return;
  }
  const url = window.prompt("没有直接读到剪贴板图片，也可以在这里粘贴图片 URL。");
  if (!url) return;
  addRefsToViduRefRow(row, [{
    id: uid("asset"),
    name: shortUrl(url),
    url: url.trim(),
    preview: url.trim(),
    type: "image",
    source: "url",
    createdAt: Date.now()
  }]);
}

async function uploadFiles(files, rowId = null, requiredType = null) {
  const row = rowId ? findRow(rowId) : null;
  if (row && isRowLocked(row)) return;
  const accepted = files.filter(file => !requiredType || file.type.startsWith(`${requiredType}/`));
  for (const file of accepted) {
    const meta = await getFileMeta(file);
    const form = new FormData();
    form.append("file", file);
    try {
      const response = await fetch(`${apiBase()}/fileupload`, { method: "POST", body: form });
      const json = await response.json();
      const uploadedUrl = uploadResponseUrl(json);
      if (!response.ok || !uploadedUrl) throw new Error(json.message || `HTTP ${response.status}`);
      const asset = {
        id: uid("asset"),
        name: file.name,
        url: uploadedUrl,
        preview: uploadedUrl,
        type: meta.type,
        width: meta.width,
        height: meta.height,
        duration: meta.duration,
        size: file.size,
        createdAt: Date.now()
      };
      addUploadHistory(asset);
      if (row) {
        markRowDirty(row);
        row.images = mergeAssets(row.images, [asset], getModel(row).maxImages);
        persistRows();
      }
    } catch (error) {
      window.alert(`上传失败: ${file.name} ${error.message}`);
    }
  }
  render();
}

function getFileMeta(file) {
  return new Promise(resolve => {
    const type = file.type.startsWith("image/") ? "image" : file.type.startsWith("video/") ? "video" : file.type.startsWith("audio/") ? "audio" : "other";
    const url = URL.createObjectURL(file);
    if (type === "image") {
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve({ type, width: img.naturalWidth, height: img.naturalHeight });
      };
      img.onerror = () => resolve({ type });
      img.src = url;
    } else if (type === "video" || type === "audio") {
      const media = document.createElement(type);
      media.onloadedmetadata = () => {
        const result = { type, duration: media.duration };
        if (type === "video") {
          result.width = media.videoWidth;
          result.height = media.videoHeight;
        }
        URL.revokeObjectURL(url);
        resolve(result);
      };
      media.onerror = () => resolve({ type });
      media.src = url;
    } else {
      URL.revokeObjectURL(url);
      resolve({ type });
    }
  });
}

async function prepareSeedanceReferenceFile(file, meta) {
  if (!shouldCompressSeedanceVideo(meta)) {
    return { file, meta, compressedInfo: null };
  }
  const target = getSeedanceVideoTargetSize(meta);
  const compressedFile = await compressVideoFileForSeedance(file, target);
  const compressedMeta = await getFileMeta(compressedFile);
  if (shouldCompressSeedanceVideo(compressedMeta)) {
    throw new Error(`压缩后仍超出限制，当前 ${compressedMeta.width || 0}x${compressedMeta.height || 0}`);
  }
  return {
    file: compressedFile,
    meta: compressedMeta,
    compressedInfo: {
      name: file.name,
      width: meta.width,
      height: meta.height,
      size: file.size,
      targetWidth: target.width,
      targetHeight: target.height
    }
  };
}

function shouldCompressSeedanceVideo(meta) {
  const pixels = Number(meta?.width || 0) * Number(meta?.height || 0);
  return meta?.type === "video" && pixels > SEEDANCE_FAST_VIDEO_PIXEL_LIMIT;
}

function getSeedanceVideoTargetSize(meta) {
  const width = Number(meta.width || 0);
  const height = Number(meta.height || 0);
  if (!width || !height) throw new Error("无法读取视频尺寸");
  const scale = Math.sqrt((SEEDANCE_FAST_VIDEO_PIXEL_LIMIT * VIDEO_COMPRESS_MARGIN) / (width * height));
  let targetWidth = Math.max(2, Math.floor((width * scale) / 2) * 2);
  let targetHeight = Math.max(2, Math.floor((height * scale) / 2) * 2);
  while (targetWidth * targetHeight > SEEDANCE_FAST_VIDEO_PIXEL_LIMIT) {
    if (targetWidth >= targetHeight) targetWidth = Math.max(2, targetWidth - 2);
    else targetHeight = Math.max(2, targetHeight - 2);
  }
  return { width: targetWidth, height: targetHeight };
}

function supportedVideoRecorderType() {
  const types = [
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
    "video/mp4;codecs=h264,aac",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm"
  ];
  if (!window.MediaRecorder) return "";
  return types.find(type => MediaRecorder.isTypeSupported(type)) || "";
}

function compressedVideoFileName(name, mimeType = "video/webm") {
  const base = String(name || "video").replace(/\.[^.]+$/, "") || "video";
  const ext = mimeType.includes("mp4") ? "mp4" : "webm";
  return `${base}_seedance_compressed.${ext}`;
}

function compressVideoFileForSeedance(file, target) {
  return new Promise((resolve, reject) => {
    if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) {
      reject(new Error("当前浏览器不支持本地视频压缩"));
      return;
    }
    const mimeType = supportedVideoRecorderType();
    if (!mimeType) {
      reject(new Error("当前浏览器没有可用的视频编码器"));
      return;
    }

    const sourceUrl = URL.createObjectURL(file);
    const video = document.createElement("video");
    const canvas = document.createElement("canvas");
    canvas.width = target.width;
    canvas.height = target.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      URL.revokeObjectURL(sourceUrl);
      reject(new Error("无法创建视频压缩画布"));
      return;
    }

    const chunks = [];
    let recorder = null;
    let frameId = 0;
    const cleanup = () => {
      if (frameId) cancelAnimationFrame(frameId);
      video.pause();
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(sourceUrl);
    };
    const drawFrame = () => {
      if (video.ended || video.paused) return;
      ctx.drawImage(video, 0, 0, target.width, target.height);
      frameId = requestAnimationFrame(drawFrame);
    };

    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.onloadedmetadata = async () => {
      try {
        const canvasStream = canvas.captureStream(VIDEO_COMPRESS_FPS);
        const sourceStream = video.captureStream?.();
        sourceStream?.getAudioTracks?.().forEach(track => canvasStream.addTrack(track));
        const pixels = target.width * target.height;
        const videoBitsPerSecond = Math.min(6000000, Math.max(1200000, Math.round(pixels * 2)));
        recorder = new MediaRecorder(canvasStream, { mimeType, videoBitsPerSecond });
        recorder.ondataavailable = event => {
          if (event.data && event.data.size) chunks.push(event.data);
        };
        recorder.onerror = event => {
          cleanup();
          reject(new Error(event.error?.message || "视频编码失败"));
        };
        recorder.onstop = () => {
          cleanup();
          const blob = new Blob(chunks, { type: mimeType.split(";")[0] || "video/webm" });
          if (!blob.size) {
            reject(new Error("压缩后视频为空"));
            return;
          }
          resolve(new File([blob], compressedVideoFileName(file.name, blob.type), { type: blob.type }));
        };
        recorder.start(1000);
        await video.play();
        drawFrame();
      } catch (error) {
        cleanup();
        reject(error);
      }
    };
    video.onended = () => {
      if (recorder && recorder.state !== "inactive") recorder.stop();
    };
    video.onerror = () => {
      cleanup();
      reject(new Error("无法读取视频文件"));
    };
    video.src = sourceUrl;
  });
}

function addUploadHistory(asset) {
  const normalized = normalizeAssets([asset])[0];
  if (!normalized) return;
  const withoutDuplicate = state.uploadHistory.filter(item => item.url !== normalized.url);
  const sameType = [normalized, ...withoutDuplicate.filter(item => item.type === normalized.type)].slice(0, HISTORY_RETENTION_PER_TYPE);
  const otherTypes = withoutDuplicate.filter(item => item.type !== normalized.type);
  state.uploadHistory = [...sameType, ...otherTypes].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  persistUploadHistory();
}

function openAssetDialog(rowId, filter) {
  state.choosingRowId = rowId;
  state.assetFilter = filter;
  assetDialog.showModal();
  renderAssetDialog();
}

function renderAssetDialog() {
  assetDialog.querySelectorAll(".filter-chip[data-filter]").forEach(button => {
    button.classList.toggle("active", button.dataset.filter === state.assetFilter);
    button.onclick = () => {
      state.assetFilter = button.dataset.filter;
      renderAssetDialog();
    };
  });
  const list = state.uploadHistory.filter(item => item.type === state.assetFilter);
  assetDialogGrid.innerHTML = list.length ? list.map(renderAssetCard).join("") : `<div class="meta-line">没有可选素材</div>`;
  assetDialogGrid.querySelectorAll(".asset-card").forEach(card => {
    card.addEventListener("click", () => {
      const asset = state.uploadHistory.find(item => item.id === card.dataset.assetId);
      if (String(state.choosingRowId || "").startsWith("multi:") && asset) {
        const row = findMultiRow(String(state.choosingRowId).slice(6));
        if (row) addRefsToMultiRow(row, [asset]);
        assetDialog.close();
        return;
      }
      if (String(state.choosingRowId || "").startsWith("viduRef:") && asset) {
        const row = findViduRefRow(String(state.choosingRowId).slice(8));
        if (row) addRefsToViduRefRow(row, [asset]);
        assetDialog.close();
        return;
      }
      if (String(state.choosingRowId || "").startsWith("iv:") && asset) {
        const [, field, rowId] = String(state.choosingRowId).split(":");
        const row = findImageVideoRow(rowId);
        if (row) addFrameToImageVideoRow(row, field, [asset]);
        assetDialog.close();
        return;
      }
      if (String(state.choosingRowId || "").startsWith("motion:") && asset) {
        const [, field, rowId] = String(state.choosingRowId).split(":");
        const row = findMotionRow(rowId);
        if (row) addAssetToMotionRow(row, field, [asset]);
        assetDialog.close();
        return;
      }
      if (String(state.choosingRowId || "").startsWith("avatar:") && asset) {
        const [, field, rowId] = String(state.choosingRowId).split(":");
        const row = findAvatarRow(rowId);
        if (row) addAssetToAvatarRow(row, field, [asset]);
        assetDialog.close();
        return;
      }
      if (String(state.choosingRowId || "").startsWith("suno:") && asset) {
        const [, opKey, field] = String(state.choosingRowId).split(":");
        addAssetToSunoField(opKey, field, [asset]);
        assetDialog.close();
        return;
      }
      if (String(state.choosingRowId || "").startsWith("viduVoice:") && asset) {
        const [, field] = String(state.choosingRowId).split(":");
        addAssetToViduVoiceField(field, [asset]);
        assetDialog.close();
        return;
      }
      if (String(state.choosingRowId || "").startsWith("subject:") && asset) {
        const [, field] = String(state.choosingRowId).split(":");
        addAssetsToSubjectField(field, [asset]);
        assetDialog.close();
        return;
      }
      const row = findRow(state.choosingRowId);
      if (state.choosingRowId === "__batch__" && asset) {
        state.batchImages = mergeAssets(state.batchImages, [asset], getBatchModel().maxImages);
        assetDialog.close();
        renderBatchImages();
        return;
      }
      if (row && asset) {
        markRowDirty(row);
        row.images = mergeAssets(row.images, [asset], getModel(row).maxImages);
        persistRows();
        assetDialog.close();
        render();
      }
    });
  });
}

function renderAssetCard(item) {
  return `
    <button class="asset-card" data-asset-id="${item.id}" type="button">
      ${item.type === "video" ? `<video src="${escapeAttr(item.url)}"></video>` : item.type === "audio" ? `<audio src="${escapeAttr(item.url)}" controls></audio>` : item.type === "image" ? `<img src="${escapeAttr(item.preview || item.url)}" alt="">` : `<div class="meta-line">文件</div>`}
      <strong>${escapeHtml(item.name || shortUrl(item.url))}</strong>
      <span class="meta-line">${assetMeta(item)}</span>
      <span class="url-line">${escapeHtml(shortUrl(item.url))}</span>
    </button>
  `;
}

function enqueueRows(rowsToSubmit) {
  rowsToSubmit.forEach(row => {
    if (isRowLocked(row)) return;
    if (!row.prompt.trim()) {
      row.status = "failed";
      row.error = "Prompt 不能为空";
      return;
    }
    cancelQueuedJobs(row.id);
    row.status = "queued";
    row.error = "";
    row.results = [];
    row.taskIds = [];
    row.remoteTasks = [];
    row.completedTaskIds = [];
    row.totalJobs = row.count;
    row.queuedJobs = row.count;
    row.runningJobs = 0;
    row.finishedJobs = 0;
    row.canceledJobs = 0;
    row.startedAt = Date.now();
    row.lastActivityAt = row.startedAt;
    row.runToken = uid("run");
    row.cancelRequested = false;
    for (let i = 0; i < row.count; i += 1) {
      state.queue.push({ id: uid("job"), rowId: row.id, index: i + 1, runToken: row.runToken, canceled: false });
    }
  });
  persistRows();
  render();
  runQueue();
}

function runQueue() {
  while (state.running < getMaxConcurrency()) {
    const job = state.queue.find(item => !item.canceled);
    if (!job) break;
    state.queue = state.queue.filter(item => item.id !== job.id);
    processJob(job);
  }
}

async function processJob(job) {
  const row = findRow(job.rowId);
  if (!row) return;
  state.running += 1;
  const isCurrentJob = () => row.runToken === job.runToken && !row.cancelRequested;
  row.queuedJobs = Math.max(0, row.queuedJobs - 1);
  row.runningJobs += 1;
  row.lastActivityAt = Date.now();
  updateRowStatus(row);
  persistRows();
  render();
  try {
    const model = getModel(row);
    const payload = await model.build(row);
    const response = await postJson(model.endpoint, payload, REQUEST_TIMEOUT_MS);
    if (!isCurrentJob()) return;
    row.lastActivityAt = Date.now();
    if (!response.success) throw new Error(formatProviderError(response, "提交失败"));
    if (model.async) {
      const task = normalizeTask(response.data);
      if (!task.taskId) throw new Error("接口返回缺少 task_id");
      if (payload?.apiKey) task.apiKey = payload.apiKey;
      row.taskIds.push(task.taskId);
      rememberRemoteTask(row, task, model.queryEndpoint);
      row.lastActivityAt = Date.now();
      persistRows();
      render();
      const result = await pollTask(model.queryEndpoint, task, row, job);
      if (!isCurrentJob()) return;
      appendRowResult(row, result, payload, task.taskId);
    } else {
      appendRowResult(row, response.data, payload, "");
    }
  } catch (error) {
    if (!isCurrentJob()) return;
    row.error = error.message;
  } finally {
    if (!isCurrentJob()) {
      state.running = Math.max(0, state.running - 1);
      persistRows();
      render();
      runQueue();
      return;
    }
    row.runningJobs = Math.max(0, row.runningJobs - 1);
    row.finishedJobs += 1;
    row.lastActivityAt = Date.now();
    state.running = Math.max(0, state.running - 1);
    updateRowStatus(row);
    persistRows();
    render();
    runQueue();
  }
}

async function pollTask(queryEndpoint, task, row, job) {
  const startedAt = Number(row?.startedAt || Date.now());
  const deadlineAt = startedAt + TASK_TIMEOUT_MS;
  for (;;) {
    if (Date.now() > deadlineAt) {
      throw new Error(`任务超过 ${Math.round(TASK_TIMEOUT_MS / 60000)} 分钟未完成，已判定为生成失败`);
    }
    if (row && job && (row.runToken !== job.runToken || row.cancelRequested)) {
      throw new Error("任务已取消");
    }
    const payload = { task_id: task.taskId };
    if (/runninghub\/query/i.test(queryEndpoint || "")) payload.taskId = task.taskId;
    if (task.apiKey) payload.apiKey = task.apiKey;
    if (task.taskPath) payload.task_path = task.taskPath;
    const remainingMs = Math.max(1000, deadlineAt - Date.now());
    const response = await postJson(queryEndpoint, payload, remainingMs);
    if (row) row.lastActivityAt = Date.now();
    if (!response.success) throw new Error(formatProviderError(response, "任务执行失败"));
    if (response.data) return response.data;
    await sleep(POLL_INTERVAL_MS);
  }
}

function rememberRemoteTask(row, task, queryEndpoint = "") {
  if (!row || !task?.taskId) return;
  const record = {
    taskId: task.taskId,
    taskPath: task.taskPath || "",
    queryEndpoint: queryEndpoint || "",
    apiKey: task.apiKey || ""
  };
  const existing = Array.isArray(row.remoteTasks) ? row.remoteTasks : [];
  row.remoteTasks = [
    ...existing.filter(item => String(item?.taskId || "") !== String(record.taskId)),
    record
  ];
}

function remoteTasksForRow(row) {
  const map = new Map();
  (Array.isArray(row?.remoteTasks) ? row.remoteTasks : []).forEach(item => {
    const taskId = item?.taskId || item?.task_id || item?.id;
    if (!taskId) return;
    map.set(String(taskId), {
      taskId: String(taskId),
      taskPath: item.taskPath || item.task_path || "",
      queryEndpoint: item.queryEndpoint || item.query_endpoint || "",
      apiKey: item.apiKey || item.api_key || ""
    });
  });
  (Array.isArray(row?.taskIds) ? row.taskIds : []).forEach(taskId => {
    if (!taskId || map.has(String(taskId))) return;
    map.set(String(taskId), { taskId: String(taskId), taskPath: "", queryEndpoint: "" });
  });
  return Array.from(map.values());
}

function markRemoteTaskComplete(row, taskId) {
  if (!row || !taskId) return;
  const completed = new Set((Array.isArray(row.completedTaskIds) ? row.completedTaskIds : []).map(String));
  completed.add(String(taskId));
  row.completedTaskIds = Array.from(completed);
}

function recoveredTaskPipelines() {
  return [
    {
      page: "image",
      rows: state.rows,
      find: findRow,
      model: getModel,
      append: appendRowResult,
      persist: persistRows
    },
    {
      page: "imageVideo",
      rows: state.imageVideoRows,
      find: findImageVideoRow,
      model: getImageVideoModel,
      append: appendImageVideoRowResult,
      persist: persistImageVideoRows
    },
    {
      page: "motion",
      rows: state.motionRows,
      find: findMotionRow,
      model: getMotionModel,
      append: appendMotionRowResult,
      persist: persistMotionRows
    },
    {
      page: "avatar",
      rows: state.avatarRows,
      find: findAvatarRow,
      model: getAvatarModel,
      append: appendAvatarRowResult,
      persist: persistAvatarRows
    },
    {
      page: "multiVideo",
      rows: state.multiRows,
      find: findMultiRow,
      model: getMultiModel,
      append: appendMultiRowResult,
      persist: persistMultiRows
    },
    {
      page: "viduRef",
      rows: state.viduRefRows,
      find: findViduRefRow,
      model: () => VIDU_REF_VIDEO_MODEL,
      append: appendViduRefRowResult,
      persist: persistViduRefRows
    }
  ];
}

function resumeInterruptedRemoteTasks() {
  state.resumeQueue = [];
  recoveredTaskPipelines().forEach(pipeline => {
    let changed = false;
    pipeline.rows.forEach(row => {
      const tasks = Array.isArray(row.resumeRemoteTasks) ? row.resumeRemoteTasks : [];
      if (!tasks.length) return;
      row.runToken = uid("resume");
      row.cancelRequested = false;
      row.queuedJobs = tasks.length;
      row.runningJobs = 0;
      tasks.forEach(task => {
        state.resumeQueue.push({
          id: uid("resumejob"),
          page: pipeline.page,
          rowId: row.id,
          runToken: row.runToken,
          task: { ...task }
        });
      });
      delete row.resumeRemoteTasks;
      changed = true;
    });
    if (changed) pipeline.persist();
  });
  runRecoveredTaskQueue();
}

function runRecoveredTaskQueue() {
  while (state.resumeRunning < getMaxConcurrency() && state.resumeQueue.length > 0) {
    const job = state.resumeQueue.shift();
    processRecoveredRemoteTask(job);
  }
}

async function processRecoveredRemoteTask(job) {
  const pipeline = recoveredTaskPipelines().find(item => item.page === job.page);
  const row = pipeline?.find(job.rowId);
  if (!pipeline || !row || row.runToken !== job.runToken || row.cancelRequested) {
    runRecoveredTaskQueue();
    return;
  }
  state.resumeRunning += 1;
  const isCurrentJob = () => row.runToken === job.runToken && !row.cancelRequested;
  row.queuedJobs = Math.max(0, row.queuedJobs - 1);
  row.runningJobs += 1;
  row.lastActivityAt = Date.now();
  updateRowStatus(row);
  pipeline.persist();
  render();
  try {
    const model = pipeline.model(row);
    const task = { ...job.task };
    const queryEndpoint = task.queryEndpoint || model?.queryEndpoint || "";
    if (!queryEndpoint) throw new Error("\u5df2\u53d6\u5f97\u4efb\u52a1 ID\uff0c\u4f46\u7f3a\u5c11\u67e5\u8be2\u63a5\u53e3\uff0c\u65e0\u6cd5\u6062\u590d\u8f6e\u8be2");
    if (/runninghub\/query/i.test(queryEndpoint) && !task.apiKey) task.apiKey = runningHubMotionApiKey();
    const result = await pollTask(queryEndpoint, task, row, job);
    if (!isCurrentJob()) return;
    pipeline.append(row, result, { resumed: true, task_id: task.taskId }, task.taskId);
    if (!row.recoveryMissingJobs) row.error = "";
  } catch (error) {
    if (!isCurrentJob()) return;
    row.error = error.message;
  } finally {
    if (isCurrentJob()) {
      row.runningJobs = Math.max(0, row.runningJobs - 1);
      row.finishedJobs += 1;
      row.lastActivityAt = Date.now();
      updateRowStatus(row);
      pipeline.persist();
      render();
    }
    state.resumeRunning = Math.max(0, state.resumeRunning - 1);
    runRecoveredTaskQueue();
  }
}
function cancelEndpointsForModel(model, explicitQueryEndpoint = "") {
  const endpoints = [];
  const add = value => {
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach(add);
      return;
    }
    if (typeof value === "object") {
      add(value.cancelEndpoint || value.cancel_endpoint || value.endpoint);
      return;
    }
    const normalized = normalizeEndpointPath(String(value));
    if (normalized && !endpoints.includes(normalized)) endpoints.push(normalized);
  };
  add(model?.cancelEndpoint);
  add(model?.cancelEndpoints);
  add(model?.cancelEndpointCandidates);
  (model?.endpointCandidates || []).forEach(candidate => add(candidate.cancelEndpoint || candidate.cancel_endpoint || candidate.cancel));

  const queryEndpoints = [
    explicitQueryEndpoint,
    model?.queryEndpoint,
    ...(model?.endpointCandidates || []).map(item => item.queryEndpoint)
  ].filter(Boolean);
  queryEndpoints.forEach(endpoint => {
    const normalized = normalizeEndpointPath(endpoint);
    if (/_query$/i.test(normalized)) add(normalized.replace(/_query$/i, "_cancel"));
    if (/\/query$/i.test(normalized)) add(normalized.replace(/\/query$/i, "/cancel"));
  });
  const createEndpoints = [
    model?.endpoint,
    ...(model?.endpointCandidates || []).map(item => item.endpoint)
  ].filter(Boolean);
  createEndpoints.forEach(endpoint => {
    const normalized = normalizeEndpointPath(endpoint);
    add(`${normalized}_cancel`);
    add(`${normalized}/cancel`);
  });
  return endpoints;
}

function requestRemoteCancelForRow(row, model) {
  const tasks = remoteTasksForRow(row);
  if (!tasks.length) return;
  const endpoints = cancelEndpointsForModel(model, tasks.find(item => item.queryEndpoint)?.queryEndpoint || "");
  if (!endpoints.length) return;
  row.remoteCancelRequestedAt = Date.now();
  row.remoteCancelEndpoints = endpoints;
  row.error = row.results?.length ? "已手动取消剩余任务，并尝试通知后端中止" : "已手动取消未完成任务，并尝试通知后端中止";
  tasks.forEach(task => {
    remoteCancelTask(task, endpoints).catch(error => {
      console.warn("Remote cancel failed", task.taskId, error);
    });
  });
}

async function remoteCancelTask(task, endpoints) {
  let lastError = null;
  for (const endpoint of endpoints) {
    try {
      await postCancelJson(endpoint, {
        task_id: task.taskId,
        taskId: task.taskId,
        id: task.taskId,
        ...(task.taskPath ? { task_path: task.taskPath, taskPath: task.taskPath } : {})
      });
      return true;
    } catch (error) {
      lastError = error;
      if (!/404|not\s*found/i.test(String(error?.message || error))) break;
    }
  }
  if (lastError) throw lastError;
  return false;
}

async function postCancelJson(endpoint, payload) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REMOTE_CANCEL_TIMEOUT_MS);
  try {
    const response = await fetch(`${apiBase()}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    const text = await response.text();
    let json = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { message: text };
    }
    if (!response.ok) throw new Error(json.message || json.detail?.[0]?.msg || `HTTP ${response.status}`);
    if (json && json.success === false) throw new Error(json.message || "remote cancel rejected");
    return json;
  } catch (error) {
    if (error.name === "AbortError") throw new Error("remote cancel timeout");
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function appendUniqueResults(row, urls) {
  if (!Array.isArray(row.results)) row.results = [];
  const existing = new Set(row.results.filter(Boolean).map(String));
  (Array.isArray(urls) ? urls : []).forEach(url => {
    const key = String(url || "");
    if (!key || existing.has(key)) return;
    row.results.push(url);
    existing.add(key);
  });
}

function appendRowResult(row, data, payload, taskId) {
  const urls = normalizeResults(data);
  appendUniqueResults(row, urls);
  markRemoteTaskComplete(row, taskId);
  addGenerationHistory({
    id: uid("gen"),
    createdAt: Date.now(),
    page: "image",
    taskId,
    prompt: row.prompt,
    model: getModel(row).label,
    version: row.version,
    size: row.size,
    quality: row.quality,
    images: cloneAssets(row.images),
    params: payload,
    results: urls
  });
}

function addGenerationHistory(record) {
  const taskId = String(record?.taskId || "");
  const page = String(record?.page || "");
  const history = taskId
    ? state.generationHistory.filter(item => String(item?.taskId || "") !== taskId || String(item?.page || "") !== page)
    : state.generationHistory;
  state.generationHistory = [record, ...history];
  persistGenerationHistory();
}

function enqueueImageVideoRows(rowsToSubmit) {
  rowsToSubmit.forEach(row => {
    if (isImageVideoRowLocked(row)) return;
    const validationError = validateImageVideoRowBeforeQueue(row);
    if (validationError) {
      row.status = "failed";
      row.error = validationError;
      return;
    }
    cancelImageVideoQueuedJobs(row.id, false);
    row.status = "queued";
    row.error = "";
    row.results = [];
    row.taskIds = [];
    row.remoteTasks = [];
    row.completedTaskIds = [];
    row.totalJobs = row.count;
    row.queuedJobs = row.count;
    row.runningJobs = 0;
    row.finishedJobs = 0;
    row.canceledJobs = 0;
    row.startedAt = Date.now();
    row.lastActivityAt = row.startedAt;
    row.runToken = uid("ivrun");
    row.cancelRequested = false;
    for (let i = 0; i < row.count; i += 1) {
      state.imageVideoQueue.push({ id: uid("ivjob"), rowId: row.id, index: i + 1, runToken: row.runToken, canceled: false });
    }
  });
  persistImageVideoRows();
  render();
  runImageVideoQueue();
}

function runImageVideoQueue() {
  while (state.imageVideoRunning < getMaxConcurrency()) {
    const job = state.imageVideoQueue.find(item => !item.canceled);
    if (!job) break;
    state.imageVideoQueue = state.imageVideoQueue.filter(item => item.id !== job.id);
    processImageVideoJob(job);
  }
}

async function processImageVideoJob(job) {
  const row = findImageVideoRow(job.rowId);
  if (!row) return;
  state.imageVideoRunning += 1;
  const isCurrentJob = () => row.runToken === job.runToken && !row.cancelRequested;
  row.queuedJobs = Math.max(0, row.queuedJobs - 1);
  row.runningJobs += 1;
  row.lastActivityAt = Date.now();
  updateRowStatus(row);
  persistImageVideoRows();
  render();
  try {
    const model = getImageVideoModel(row);
    const payload = model.build(row);
    const response = await postJson(model.endpoint, payload, REQUEST_TIMEOUT_MS);
    if (!isCurrentJob()) return;
    row.lastActivityAt = Date.now();
    if (!response.success) throw new Error(formatProviderError(response, "提交失败"));
    if (model.async) {
      const task = normalizeTask(response.data);
      if (!task.taskId) throw new Error("接口返回缺少 task_id");
      row.taskIds.push(task.taskId);
      rememberRemoteTask(row, task, model.queryEndpoint);
      row.lastActivityAt = Date.now();
      persistImageVideoRows();
      render();
      const result = await pollTask(model.queryEndpoint, task, row, job);
      if (!isCurrentJob()) return;
      appendImageVideoRowResult(row, result, payload, task.taskId);
    } else {
      appendImageVideoRowResult(row, response.data, payload, "");
    }
  } catch (error) {
    if (!isCurrentJob()) return;
    row.error = error.message;
  } finally {
    if (!isCurrentJob()) {
      state.imageVideoRunning = Math.max(0, state.imageVideoRunning - 1);
      persistImageVideoRows();
      render();
      runImageVideoQueue();
      return;
    }
    row.runningJobs = Math.max(0, row.runningJobs - 1);
    row.finishedJobs += 1;
    row.lastActivityAt = Date.now();
    state.imageVideoRunning = Math.max(0, state.imageVideoRunning - 1);
    updateRowStatus(row);
    persistImageVideoRows();
    render();
    runImageVideoQueue();
  }
}

function appendImageVideoRowResult(row, data, payload, taskId) {
  const urls = normalizeResults(data);
  appendUniqueResults(row, urls);
  markRemoteTaskComplete(row, taskId);
  addGenerationHistory({
    id: uid("gen"),
    createdAt: Date.now(),
    page: "imageVideo",
    taskId,
    prompt: row.prompt,
    model: getImageVideoModel(row).label,
    version: row.version,
    size: row.size,
    quality: row.quality,
    duration: row.duration,
    autoMultiShot: row.autoMultiShot,
    images: cloneAssets([row.firstFrame, row.lastFrame].filter(Boolean)),
    refs: cloneAssets([row.firstFrame, row.lastFrame].filter(Boolean)),
    firstFrame: row.firstFrame ? { ...row.firstFrame } : null,
    lastFrame: row.lastFrame ? { ...row.lastFrame } : null,
    params: payload,
    results: urls
  });
}

function cancelImageVideoQueuedJobs(rowId = null, shouldRender = true) {
  const canceled = [];
  state.imageVideoQueue = state.imageVideoQueue.filter(job => {
    const match = !rowId || job.rowId === rowId;
    if (match) canceled.push(job);
    return !match;
  });
  canceled.forEach(job => {
    const row = findImageVideoRow(job.rowId);
    if (row) {
      row.queuedJobs = Math.max(0, row.queuedJobs - 1);
      row.canceledJobs += 1;
      updateRowStatus(row);
    }
  });
  if (rowId) {
    const row = findImageVideoRow(rowId);
    if (row && isImageVideoRowLocked(row)) {
      const unfinished = Math.max(0, (row.totalJobs || row.count || 1) - row.finishedJobs - row.canceledJobs);
      row.queuedJobs = 0;
      row.runningJobs = 0;
      row.canceledJobs += unfinished;
      row.error = row.results.length ? "已手动取消剩余任务" : "已手动取消未完成任务";
      row.cancelRequested = true;
      requestRemoteCancelForRow(row, getImageVideoModel(row));
      row.runToken = "";
      row.lastActivityAt = Date.now();
      updateRowStatus(row);
    }
  }
  persistImageVideoRows();
  if (shouldRender) render();
}

function deleteSelectedImageVideoRows() {
  const selectedIds = new Set(state.imageVideoRows.filter(row => row.selected).map(row => row.id));
  if (!selectedIds.size) return;
  selectedIds.forEach(id => cancelImageVideoQueuedJobs(id, false));
  state.imageVideoRows = state.imageVideoRows.filter(row => !selectedIds.has(row.id));
  persistImageVideoRows();
  render();
}

function clearDoneImageVideoRows() {
  state.imageVideoRows = state.imageVideoRows.filter(row => row.status !== "done");
  persistImageVideoRows();
  render();
}

function enqueueMotionRows(rowsToSubmit) {
  rowsToSubmit.forEach(row => {
    if (isMotionRowLocked(row)) return;
    const validationError = validateMotionRowBeforeQueue(row);
    if (validationError) {
      row.status = "failed";
      row.error = validationError;
      return;
    }
    cancelMotionQueuedJobs(row.id, false);
    row.status = "queued";
    row.error = "";
    row.results = [];
    row.taskIds = [];
    row.remoteTasks = [];
    row.completedTaskIds = [];
    row.totalJobs = row.count;
    row.queuedJobs = row.count;
    row.runningJobs = 0;
    row.finishedJobs = 0;
    row.canceledJobs = 0;
    row.startedAt = Date.now();
    row.lastActivityAt = row.startedAt;
    row.runToken = uid("motionrun");
    row.cancelRequested = false;
    for (let i = 0; i < row.count; i += 1) {
      state.motionQueue.push({ id: uid("motionjob"), rowId: row.id, index: i + 1, runToken: row.runToken, canceled: false });
    }
  });
  persistMotionRows();
  render();
  runMotionQueue();
}

function runMotionQueue() {
  while (state.motionRunning < getMaxConcurrency()) {
    const job = state.motionQueue.find(item => !item.canceled);
    if (!job) break;
    state.motionQueue = state.motionQueue.filter(item => item.id !== job.id);
    processMotionJob(job);
  }
}

async function processMotionJob(job) {
  const row = findMotionRow(job.rowId);
  if (!row) return;
  state.motionRunning += 1;
  const isCurrentJob = () => row.runToken === job.runToken && !row.cancelRequested;
  row.queuedJobs = Math.max(0, row.queuedJobs - 1);
  row.runningJobs += 1;
  row.lastActivityAt = Date.now();
  updateRowStatus(row);
  persistMotionRows();
  render();
  try {
    const model = getMotionModel(row);
    const payload = model.build(row);
    const { response, queryEndpoint } = await postMotionCreate(model, payload);
    if (!isCurrentJob()) return;
    row.lastActivityAt = Date.now();
    if (!response.success) throw new Error(formatProviderError(response, "提交失败"));
    if (model.async) {
      const task = normalizeTask(response.data);
      if (!task.taskId) throw new Error("接口返回缺少 task_id");
      if (payload?.apiKey) task.apiKey = payload.apiKey;
      row.taskIds.push(task.taskId);
      rememberRemoteTask(row, task, queryEndpoint);
      row.lastActivityAt = Date.now();
      persistMotionRows();
      render();
      const result = await pollTask(queryEndpoint, task, row, job);
      if (!isCurrentJob()) return;
      appendMotionRowResult(row, result, payload, task.taskId);
    } else {
      appendMotionRowResult(row, response.data, payload, "");
    }
  } catch (error) {
    if (!isCurrentJob()) return;
    row.error = error.message;
  } finally {
    if (!isCurrentJob()) {
      state.motionRunning = Math.max(0, state.motionRunning - 1);
      persistMotionRows();
      render();
      runMotionQueue();
      return;
    }
    row.runningJobs = Math.max(0, row.runningJobs - 1);
    row.finishedJobs += 1;
    row.lastActivityAt = Date.now();
    state.motionRunning = Math.max(0, state.motionRunning - 1);
    updateRowStatus(row);
    persistMotionRows();
    render();
    runMotionQueue();
  }
}

async function postMotionCreate(model, payload) {
  const candidates = Array.isArray(model.endpointCandidates) && model.endpointCandidates.length
    ? model.endpointCandidates
    : [{ endpoint: model.endpoint, queryEndpoint: model.queryEndpoint }];
  const errors = [];
  for (const candidate of candidates) {
    try {
      const response = await postJson(candidate.endpoint, payload, REQUEST_TIMEOUT_MS);
      return { response, queryEndpoint: candidate.queryEndpoint || model.queryEndpoint };
    } catch (error) {
      const message = String(error?.message || error);
      errors.push(`${candidate.endpoint}: ${message}`);
      if (!/404|not\s*found/i.test(message)) throw error;
    }
  }
  throw new Error(`${model.label || "动作模仿"}中转接口未找到：${errors.join("；")}`);
}

function appendMotionRowResult(row, data, payload, taskId) {
  const urls = normalizeResults(data);
  appendUniqueResults(row, urls);
  markRemoteTaskComplete(row, taskId);
  addGenerationHistory({
    id: uid("gen"),
    createdAt: Date.now(),
    page: "motion",
    taskId,
    prompt: row.prompt,
    model: getMotionModel(row).label,
    version: row.version,
    size: row.size,
    quality: row.quality,
    images: cloneAssets([row.image].filter(Boolean)),
    refs: cloneAssets([row.image, row.video].filter(Boolean)),
    params: payload,
    results: urls
  });
}

function cancelMotionQueuedJobs(rowId = null, shouldRender = true) {
  const canceled = [];
  state.motionQueue = state.motionQueue.filter(job => {
    const match = !rowId || job.rowId === rowId;
    if (match) canceled.push(job);
    return !match;
  });
  canceled.forEach(job => {
    const row = findMotionRow(job.rowId);
    if (row) {
      row.queuedJobs = Math.max(0, row.queuedJobs - 1);
      row.canceledJobs += 1;
      updateRowStatus(row);
    }
  });
  if (rowId) {
    const row = findMotionRow(rowId);
    if (row && isMotionRowLocked(row)) {
      const unfinished = Math.max(0, (row.totalJobs || row.count || 1) - row.finishedJobs - row.canceledJobs);
      row.queuedJobs = 0;
      row.runningJobs = 0;
      row.canceledJobs += unfinished;
      row.error = row.results.length ? "已手动取消剩余任务" : "已手动取消未完成任务";
      row.cancelRequested = true;
      requestRemoteCancelForRow(row, getMotionModel(row));
      row.runToken = "";
      row.lastActivityAt = Date.now();
      updateRowStatus(row);
    }
  }
  persistMotionRows();
  if (shouldRender) render();
}

function deleteSelectedMotionRows() {
  const selectedIds = new Set(state.motionRows.filter(row => row.selected).map(row => row.id));
  if (!selectedIds.size) return;
  selectedIds.forEach(id => cancelMotionQueuedJobs(id, false));
  state.motionRows = state.motionRows.filter(row => !selectedIds.has(row.id));
  persistMotionRows();
  render();
}

function clearDoneMotionRows() {
  state.motionRows = state.motionRows.filter(row => row.status !== "done");
  persistMotionRows();
  render();
}

function enqueueAvatarRows(rowsToSubmit) {
  rowsToSubmit.forEach(row => {
    if (isAvatarRowLocked(row)) return;
    const validationError = validateAvatarRowBeforeQueue(row);
    if (validationError) {
      row.status = "failed";
      row.error = validationError;
      return;
    }
    cancelAvatarQueuedJobs(row.id, false);
    row.status = "queued";
    row.error = "";
    row.results = [];
    row.taskIds = [];
    row.remoteTasks = [];
    row.completedTaskIds = [];
    row.totalJobs = row.count;
    row.queuedJobs = row.count;
    row.runningJobs = 0;
    row.finishedJobs = 0;
    row.canceledJobs = 0;
    row.startedAt = Date.now();
    row.lastActivityAt = row.startedAt;
    row.runToken = uid("avatarrun");
    row.cancelRequested = false;
    for (let i = 0; i < row.count; i += 1) {
      state.avatarQueue.push({ id: uid("avatarjob"), rowId: row.id, index: i + 1, runToken: row.runToken, canceled: false });
    }
  });
  persistAvatarRows();
  render();
  runAvatarQueue();
}

function runAvatarQueue() {
  while (state.avatarRunning < getMaxConcurrency()) {
    const job = state.avatarQueue.find(item => !item.canceled);
    if (!job) break;
    state.avatarQueue = state.avatarQueue.filter(item => item.id !== job.id);
    processAvatarJob(job);
  }
}

async function processAvatarJob(job) {
  const row = findAvatarRow(job.rowId);
  if (!row) return;
  state.avatarRunning += 1;
  const isCurrentJob = () => row.runToken === job.runToken && !row.cancelRequested;
  row.queuedJobs = Math.max(0, row.queuedJobs - 1);
  row.runningJobs += 1;
  row.lastActivityAt = Date.now();
  updateRowStatus(row);
  persistAvatarRows();
  render();
  try {
    const model = getAvatarModel(row);
    const payload = await model.build(row);
    const { response, queryEndpoint } = await postAvatarCreate(row.model, model, payload);
    if (!isCurrentJob()) return;
    row.lastActivityAt = Date.now();
    if (!response.success) throw new Error(formatProviderError(response, "提交失败"));
    if (model.async) {
      const task = normalizeTask(response.data);
      if (!task.taskId) throw new Error("接口返回缺少 task_id");
      if (payload?.apiKey) task.apiKey = payload.apiKey;
      row.taskIds.push(task.taskId);
      rememberRemoteTask(row, task, queryEndpoint);
      row.lastActivityAt = Date.now();
      persistAvatarRows();
      render();
      const result = await pollTask(queryEndpoint, task, row, job);
      if (!isCurrentJob()) return;
      appendAvatarRowResult(row, result, payload, task.taskId);
    } else {
      appendAvatarRowResult(row, response.data, payload, "");
    }
  } catch (error) {
    if (!isCurrentJob()) return;
    row.error = error.message;
  } finally {
    if (!isCurrentJob()) {
      state.avatarRunning = Math.max(0, state.avatarRunning - 1);
      persistAvatarRows();
      render();
      runAvatarQueue();
      return;
    }
    row.runningJobs = Math.max(0, row.runningJobs - 1);
    row.finishedJobs += 1;
    row.lastActivityAt = Date.now();
    state.avatarRunning = Math.max(0, state.avatarRunning - 1);
    updateRowStatus(row);
    persistAvatarRows();
    render();
    runAvatarQueue();
  }
}

async function postAvatarCreate(modelKey, model, payload) {
  if (String(modelKey || "").startsWith("rh:")) {
    const response = await postJson(model.endpoint, payload, REQUEST_TIMEOUT_MS);
    return { response, queryEndpoint: model.queryEndpoint };
  }
  const customCreate = avatarEndpoint(modelKey, "create");
  const customQuery = avatarEndpoint(modelKey, "query");
  const customCandidate = customCreate ? [{ endpoint: customCreate, queryEndpoint: customQuery || model.queryEndpoint }] : [];
  const fallbackCandidates = Array.isArray(model.endpointCandidates) && model.endpointCandidates.length
    ? model.endpointCandidates
    : [{ endpoint: model.endpoint, queryEndpoint: model.queryEndpoint }];
  const candidates = [...customCandidate, ...fallbackCandidates]
    .filter((candidate, index, list) => list.findIndex(item => item.endpoint === candidate.endpoint) === index);
  const errors = [];
  for (const candidate of candidates) {
    try {
      const response = await postJson(candidate.endpoint, payload, REQUEST_TIMEOUT_MS);
      return { response, queryEndpoint: candidate.queryEndpoint || model.queryEndpoint };
    } catch (error) {
      const message = String(error?.message || error);
      errors.push(`${candidate.endpoint}: ${message}`);
      if (!/404|not\s*found/i.test(message)) throw error;
    }
  }
  throw new Error(`数字人中转接口未找到：${errors.join("；")}`);
}

function appendAvatarRowResult(row, data, payload, taskId) {
  const urls = normalizeResults(data);
  appendUniqueResults(row, urls);
  markRemoteTaskComplete(row, taskId);
  addGenerationHistory({
    id: uid("gen"),
    createdAt: Date.now(),
    page: "avatar",
    taskId,
    prompt: row.prompt,
    model: getAvatarModel(row).label,
    version: row.version,
    size: "",
    quality: "",
    images: cloneAssets([row.image].filter(Boolean)),
    refs: cloneAssets([row.image, row.audio].filter(Boolean)),
    params: payload,
    results: urls
  });
}

function cancelAvatarQueuedJobs(rowId = null, shouldRender = true) {
  const canceled = [];
  state.avatarQueue = state.avatarQueue.filter(job => {
    const match = !rowId || job.rowId === rowId;
    if (match) canceled.push(job);
    return !match;
  });
  canceled.forEach(job => {
    const row = findAvatarRow(job.rowId);
    if (row) {
      row.queuedJobs = Math.max(0, row.queuedJobs - 1);
      row.canceledJobs += 1;
      updateRowStatus(row);
    }
  });
  if (rowId) {
    const row = findAvatarRow(rowId);
    if (row && isAvatarRowLocked(row)) {
      const unfinished = Math.max(0, (row.totalJobs || row.count || 1) - row.finishedJobs - row.canceledJobs);
      row.queuedJobs = 0;
      row.runningJobs = 0;
      row.canceledJobs += unfinished;
      row.error = row.results.length ? "已手动取消剩余任务" : "已手动取消未完成任务";
      row.cancelRequested = true;
      requestRemoteCancelForRow(row, getAvatarModel(row));
      row.runToken = "";
      row.lastActivityAt = Date.now();
      updateRowStatus(row);
    }
  }
  persistAvatarRows();
  if (shouldRender) render();
}

function deleteSelectedAvatarRows() {
  const selectedIds = new Set(state.avatarRows.filter(row => row.selected).map(row => row.id));
  if (!selectedIds.size) return;
  selectedIds.forEach(id => cancelAvatarQueuedJobs(id, false));
  state.avatarRows = state.avatarRows.filter(row => !selectedIds.has(row.id));
  persistAvatarRows();
  render();
}

function clearDoneAvatarRows() {
  state.avatarRows = state.avatarRows.filter(row => row.status !== "done");
  persistAvatarRows();
  render();
}

function enqueueMultiRows(rowsToSubmit) {
  rowsToSubmit.forEach(row => {
    if (isMultiRowLocked(row)) return;
    if (!row.prompt.trim()) {
      row.status = "failed";
      row.error = "Prompt 不能为空";
      return;
    }
    const validationError = validateMultiRowBeforeQueue(row);
    if (validationError) {
      row.status = "failed";
      row.error = validationError;
      return;
    }
    cancelMultiQueuedJobs(row.id, false);
    row.status = "queued";
    row.error = "";
    row.results = [];
    row.taskIds = [];
    row.remoteTasks = [];
    row.completedTaskIds = [];
    row.totalJobs = row.count;
    row.queuedJobs = row.count;
    row.runningJobs = 0;
    row.finishedJobs = 0;
    row.canceledJobs = 0;
    row.startedAt = Date.now();
    row.lastActivityAt = row.startedAt;
    row.runToken = uid("mvrun");
    row.cancelRequested = false;
    for (let i = 0; i < row.count; i += 1) {
      state.multiQueue.push({ id: uid("mvjob"), rowId: row.id, index: i + 1, runToken: row.runToken, canceled: false });
    }
  });
  persistMultiRows();
  render();
  runMultiQueue();
}

function runMultiQueue() {
  while (state.multiRunning < getMaxConcurrency()) {
    const job = state.multiQueue.find(item => !item.canceled);
    if (!job) break;
    state.multiQueue = state.multiQueue.filter(item => item.id !== job.id);
    processMultiJob(job);
  }
}

async function processMultiJob(job) {
  const row = findMultiRow(job.rowId);
  if (!row) return;
  state.multiRunning += 1;
  const isCurrentJob = () => row.runToken === job.runToken && !row.cancelRequested;
  row.queuedJobs = Math.max(0, row.queuedJobs - 1);
  row.runningJobs += 1;
  row.lastActivityAt = Date.now();
  updateRowStatus(row);
  persistMultiRows();
  render();
  try {
    const model = getMultiModel(row);
    const payload = model.build(row);
    const response = await postJson(model.endpoint, payload, REQUEST_TIMEOUT_MS);
    if (!isCurrentJob()) return;
    row.lastActivityAt = Date.now();
    if (!response.success) throw new Error(formatProviderError(response, "提交失败"));
    if (model.async) {
      const task = normalizeTask(response.data);
      if (!task.taskId) throw new Error("接口返回缺少 task_id");
      row.taskIds.push(task.taskId);
      rememberRemoteTask(row, task, model.queryEndpoint);
      row.lastActivityAt = Date.now();
      persistMultiRows();
      render();
      const result = await pollTask(model.queryEndpoint, task, row, job);
      if (!isCurrentJob()) return;
      appendMultiRowResult(row, result, payload, task.taskId);
    } else {
      appendMultiRowResult(row, response.data, payload, "");
    }
  } catch (error) {
    if (!isCurrentJob()) return;
    row.error = error.message;
  } finally {
    if (!isCurrentJob()) {
      state.multiRunning = Math.max(0, state.multiRunning - 1);
      persistMultiRows();
      render();
      runMultiQueue();
      return;
    }
    row.runningJobs = Math.max(0, row.runningJobs - 1);
    row.finishedJobs += 1;
    row.lastActivityAt = Date.now();
    state.multiRunning = Math.max(0, state.multiRunning - 1);
    updateRowStatus(row);
    persistMultiRows();
    render();
    runMultiQueue();
  }
}

function appendMultiRowResult(row, data, payload, taskId) {
  const urls = normalizeResults(data);
  appendUniqueResults(row, urls);
  markRemoteTaskComplete(row, taskId);
  addGenerationHistory({
    id: uid("gen"),
    createdAt: Date.now(),
    page: "multiVideo",
    taskId,
    prompt: row.prompt,
    model: getMultiModel(row).label,
    version: row.version,
    size: row.size,
    quality: row.quality,
    duration: row.duration,
    images: cloneAssets(row.refs || []),
    refs: cloneAssets(row.refs || []),
    params: payload,
    results: urls
  });
}

function cancelMultiQueuedJobs(rowId = null, shouldRender = true) {
  const canceled = [];
  state.multiQueue = state.multiQueue.filter(job => {
    const match = !rowId || job.rowId === rowId;
    if (match) canceled.push(job);
    return !match;
  });
  canceled.forEach(job => {
    const row = findMultiRow(job.rowId);
    if (row) {
      row.queuedJobs = Math.max(0, row.queuedJobs - 1);
      row.canceledJobs += 1;
      updateRowStatus(row);
    }
  });
  if (rowId) {
    const row = findMultiRow(rowId);
    if (row && isMultiRowLocked(row)) {
      const unfinished = Math.max(0, (row.totalJobs || row.count || 1) - row.finishedJobs - row.canceledJobs);
      row.queuedJobs = 0;
      row.runningJobs = 0;
      row.canceledJobs += unfinished;
      row.error = row.results.length ? "已手动取消剩余任务" : "已手动取消未完成任务";
      row.cancelRequested = true;
      requestRemoteCancelForRow(row, getMultiModel(row));
      row.runToken = "";
      row.lastActivityAt = Date.now();
      updateRowStatus(row);
    }
  }
  persistMultiRows();
  if (shouldRender) render();
}

function deleteSelectedMultiRows() {
  const selectedIds = new Set(state.multiRows.filter(row => row.selected).map(row => row.id));
  if (!selectedIds.size) return;
  selectedIds.forEach(id => cancelMultiQueuedJobs(id, false));
  state.multiRows = state.multiRows.filter(row => !selectedIds.has(row.id));
  persistMultiRows();
  render();
}

function clearDoneMultiRows() {
  state.multiRows = state.multiRows.filter(row => row.status !== "done");
  persistMultiRows();
  render();
}

function enqueueViduRefRows(rowsToSubmit) {
  rowsToSubmit.forEach(row => {
    if (isViduRefRowLocked(row)) return;
    const validationError = validateViduRefRowBeforeQueue(row);
    if (validationError) {
      row.status = "failed";
      row.error = validationError;
      return;
    }
    cancelViduRefQueuedJobs(row.id, false);
    row.status = "queued";
    row.error = "";
    row.results = [];
    row.taskIds = [];
    row.remoteTasks = [];
    row.completedTaskIds = [];
    row.returnedSeeds = [];
    row.totalJobs = row.count;
    row.queuedJobs = row.count;
    row.runningJobs = 0;
    row.finishedJobs = 0;
    row.canceledJobs = 0;
    row.startedAt = Date.now();
    row.lastActivityAt = row.startedAt;
    row.runToken = uid("vidurefrun");
    row.cancelRequested = false;
    for (let i = 0; i < row.count; i += 1) {
      state.viduRefQueue.push({ id: uid("vidurefjob"), rowId: row.id, index: i + 1, runToken: row.runToken, canceled: false });
    }
  });
  persistViduRefRows();
  render();
  runViduRefQueue();
}

function runViduRefQueue() {
  while (state.viduRefRunning < getMaxConcurrency()) {
    const job = state.viduRefQueue.find(item => !item.canceled);
    if (!job) break;
    state.viduRefQueue = state.viduRefQueue.filter(item => item.id !== job.id);
    processViduRefJob(job);
  }
}

async function processViduRefJob(job) {
  const row = findViduRefRow(job.rowId);
  if (!row) return;
  state.viduRefRunning += 1;
  const isCurrentJob = () => row.runToken === job.runToken && !row.cancelRequested;
  row.queuedJobs = Math.max(0, row.queuedJobs - 1);
  row.runningJobs += 1;
  row.lastActivityAt = Date.now();
  updateRowStatus(row);
  persistViduRefRows();
  render();
  try {
    const payload = VIDU_REF_VIDEO_MODEL.build(row);
    const { response, queryEndpoint } = await postViduRefCreate(payload);
    if (!isCurrentJob()) return;
    row.lastActivityAt = Date.now();
    if (!response.success) throw new Error(formatProviderError(response, "提交失败"));
    appendViduRefSeed(row, extractSeed(response.data));
    const task = normalizeTask(response.data);
    if (!task.taskId) throw new Error("接口返回缺少 task_id");
    row.taskIds.push(task.taskId);
    rememberRemoteTask(row, task, queryEndpoint);
    row.lastActivityAt = Date.now();
    persistViduRefRows();
    render();
    const result = await pollTask(queryEndpoint, task, row, job);
    if (!isCurrentJob()) return;
    appendViduRefRowResult(row, result, payload, task.taskId);
  } catch (error) {
    if (!isCurrentJob()) return;
    row.error = error.message;
  } finally {
    if (!isCurrentJob()) {
      state.viduRefRunning = Math.max(0, state.viduRefRunning - 1);
      persistViduRefRows();
      render();
      runViduRefQueue();
      return;
    }
    row.runningJobs = Math.max(0, row.runningJobs - 1);
    row.finishedJobs += 1;
    row.lastActivityAt = Date.now();
    state.viduRefRunning = Math.max(0, state.viduRefRunning - 1);
    updateRowStatus(row);
    persistViduRefRows();
    render();
    runViduRefQueue();
  }
}

async function postViduRefCreate(payload) {
  const candidates = Array.isArray(VIDU_REF_VIDEO_MODEL.endpointCandidates) && VIDU_REF_VIDEO_MODEL.endpointCandidates.length
    ? VIDU_REF_VIDEO_MODEL.endpointCandidates
    : [{ endpoint: VIDU_REF_VIDEO_MODEL.endpoint, queryEndpoint: VIDU_REF_VIDEO_MODEL.queryEndpoint }];
  const errors = [];
  for (const candidate of candidates) {
    try {
      const response = await postJson(candidate.endpoint, payload, REQUEST_TIMEOUT_MS);
      if (response && response.success === false) {
        const message = String(response.message || response.error || "提交失败");
        const routeLooksWrong = /首尾帧|first.?frame|last.?frame|没有提供参考图片或首尾帧图片|参考图片/i.test(message);
        errors.push(`${candidate.endpoint}: ${message}`);
        if (routeLooksWrong) continue;
        throw new Error(message);
      }
      return { response, queryEndpoint: candidate.queryEndpoint || VIDU_REF_VIDEO_MODEL.queryEndpoint };
    } catch (error) {
      const message = String(error?.message || error);
      errors.push(`${candidate.endpoint}: ${message}`);
      const routeLooksWrong = /404|not\s*found|首尾帧|first.?frame|last.?frame|没有提供参考图片或首尾帧图片/i.test(message);
      if (!routeLooksWrong) throw error;
    }
  }
  throw new Error(`Vidu Reference 中转接口未找到或仍指向首尾帧接口：${errors.join("；")}`);
}

function appendViduRefRowResult(row, data, payload, taskId) {
  appendViduRefSeed(row, extractSeed(data));
  const urls = normalizeResults(data);
  appendUniqueResults(row, urls);
  markRemoteTaskComplete(row, taskId);
  addGenerationHistory({
    id: uid("gen"),
    createdAt: Date.now(),
    page: "viduRef",
    taskId,
    prompt: row.prompt,
    model: "Vidu参考生视频",
    version: row.version,
    size: row.size,
    quality: row.quality,
    duration: row.duration,
    seed: row.seed,
    returnedSeeds: [...row.returnedSeeds],
    offPeak: row.offPeak,
    voiceId: row.voiceId,
    images: cloneAssets(row.refs || []),
    refs: cloneAssets(row.refs || []),
    params: payload,
    results: urls
  });
}

function appendViduRefSeed(row, seed) {
  if (seed === "" || seed === null || seed === undefined) return;
  const value = String(seed);
  row.returnedSeeds = [...new Set([...(row.returnedSeeds || []), value])];
}

function cancelViduRefQueuedJobs(rowId = null, shouldRender = true) {
  const canceled = [];
  state.viduRefQueue = state.viduRefQueue.filter(job => {
    const match = !rowId || job.rowId === rowId;
    if (match) canceled.push(job);
    return !match;
  });
  canceled.forEach(job => {
    const row = findViduRefRow(job.rowId);
    if (row) {
      row.queuedJobs = Math.max(0, row.queuedJobs - 1);
      row.canceledJobs += 1;
      updateRowStatus(row);
    }
  });
  if (rowId) {
    const row = findViduRefRow(rowId);
    if (row && isViduRefRowLocked(row)) {
      const unfinished = Math.max(0, (row.totalJobs || row.count || 1) - row.finishedJobs - row.canceledJobs);
      row.queuedJobs = 0;
      row.runningJobs = 0;
      row.canceledJobs += unfinished;
      row.error = row.results.length ? "已手动取消剩余任务" : "已手动取消未完成任务";
      row.cancelRequested = true;
      requestRemoteCancelForRow(row, VIDU_REF_VIDEO_MODEL);
      row.runToken = "";
      row.lastActivityAt = Date.now();
      updateRowStatus(row);
    }
  }
  persistViduRefRows();
  if (shouldRender) render();
}

function deleteSelectedViduRefRows() {
  const selectedIds = new Set(state.viduRefRows.filter(row => row.selected).map(row => row.id));
  if (!selectedIds.size) return;
  selectedIds.forEach(id => cancelViduRefQueuedJobs(id, false));
  state.viduRefRows = state.viduRefRows.filter(row => !selectedIds.has(row.id));
  persistViduRefRows();
  render();
}

function clearDoneViduRefRows() {
  state.viduRefRows = state.viduRefRows.filter(row => row.status !== "done");
  persistViduRefRows();
  render();
}

function cancelQueuedJobs(rowId = null, shouldRender = true) {
  const canceled = [];
  state.queue = state.queue.filter(job => {
    const match = !rowId || job.rowId === rowId;
    if (match) canceled.push(job);
    return !match;
  });
  canceled.forEach(job => {
    const row = findRow(job.rowId);
    if (row) {
      row.queuedJobs = Math.max(0, row.queuedJobs - 1);
      row.canceledJobs += 1;
      updateRowStatus(row);
    }
  });
  if (rowId) {
    const row = findRow(rowId);
    if (row && isRowLocked(row)) {
      const unfinished = Math.max(0, (row.totalJobs || row.count || 1) - row.finishedJobs - row.canceledJobs);
      row.queuedJobs = 0;
      row.runningJobs = 0;
      row.canceledJobs += unfinished;
      row.error = row.results.length ? "已手动取消剩余任务" : "已手动取消未完成任务";
      row.cancelRequested = true;
      requestRemoteCancelForRow(row, getModel(row));
      row.runToken = "";
      row.lastActivityAt = Date.now();
      updateRowStatus(row);
    }
  }
  persistRows();
  if (shouldRender) render();
}

function hasSubmittedArtifacts(row) {
  return Boolean(
    (Array.isArray(row?.taskIds) && row.taskIds.length) ||
    (Array.isArray(row?.results) && row.results.length) ||
    (Array.isArray(row?.returnedSeeds) && row.returnedSeeds.length) ||
    (Array.isArray(row?.remoteTasks) && row.remoteTasks.length)
  );
}

function clearSubmittedArtifacts(row) {
  row.taskIds = [];
  row.results = [];
  row.remoteTasks = [];
  row.completedTaskIds = [];
  if (Array.isArray(row.returnedSeeds)) row.returnedSeeds = [];
  row.totalJobs = 0;
  row.queuedJobs = 0;
  row.runningJobs = 0;
  row.finishedJobs = 0;
  row.canceledJobs = 0;
  row.startedAt = 0;
  row.lastActivityAt = 0;
  row.runToken = "";
  row.cancelRequested = false;
  delete row.resumeRemoteTasks;
  delete row.recoveryMissingJobs;
  delete row.remoteCancelRequestedAt;
  delete row.remoteCancelEndpoints;
}

function markRowDirty(row) {
  if (!row || !["done", "failed", "partial", "canceled"].includes(row.status)) return false;
  if (!hasSubmittedArtifacts(row)) return false;
  clearSubmittedArtifacts(row);
  row.status = "dirty";
  row.error = "";
  return true;
}

function refreshRowSubmittedStateDisplay(row) {
  if (typeof document === "undefined" || !row?.id) return;
  const id = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(row.id) : String(row.id).replace(/["\\]/g, "\\$&");
  const tr = document.querySelector([
    `tr[data-row-id="${id}"]`,
    `tr[data-image-video-row-id="${id}"]`,
    `tr[data-motion-row-id="${id}"]`,
    `tr[data-avatar-row-id="${id}"]`,
    `tr[data-multi-row-id="${id}"]`,
    `tr[data-vidu-ref-row-id="${id}"]`
  ].join(","));
  if (!tr) return;
  const statusCell = tr.children[1];
  if (statusCell) {
    statusCell.innerHTML = renderRowStatusCell(row);
  }
  const taskCell = tr.querySelector("[data-task-result-cell]");
  if (taskCell) taskCell.innerHTML = renderTaskResultCell(row);
}

function updateRowStatus(row) {
  if (row.status === "dirty" && !row.queuedJobs && !row.runningJobs && !hasSubmittedArtifacts(row)) return;
  if (row.runningJobs > 0 && row.finishedJobs + row.canceledJobs < row.totalJobs) {
    row.status = row.finishedJobs > 0 || row.queuedJobs > 0 ? "partial" : "running";
  } else if (row.queuedJobs > 0) {
    row.status = "queued";
  } else if (row.finishedJobs >= row.totalJobs && row.results.length > 0 && !row.error) {
    row.status = "done";
  } else if (row.canceledJobs > 0 && row.finishedJobs === 0 && row.runningJobs === 0) {
    row.status = "canceled";
  } else if (row.error) {
    row.status = row.results.length ? "partial" : "failed";
  } else if (row.results.length >= row.count) {
    row.status = "done";
  } else {
    row.status = "pending";
  }
}

function statusLabel(row) {
  const progress = row.totalJobs ? ` ${row.results.length}/${row.totalJobs}` : "";
  const labels = {
    pending: "待处理",
    queued: "排队中",
    running: "处理中",
    partial: "部分处理中",
    done: "完成",
    failed: "失败",
    canceled: "已取消",
    dirty: "有未提交修改"
  };
  return `${labels[row.status] || row.status}${progress}`;
}

function renderHistoryPage() {
  const workspace = document.querySelector("#workspace");
  workspace.innerHTML = `
    <section class="topbar">
      <div class="page-title">
        <h2>历史缓存池</h2>
        <p>上传历史和生成历史按类型各保留最近 1000 条；生成缓存按相同输入合并展示。</p>
      </div>
      <div class="topbar-controls">
        <label class="file-button">
          上传文件
          <input id="historyUpload" type="file" multiple>
        </label>
        <button id="recoverHistoryStorage" class="button" type="button">尝试恢复缓存</button>
        <button id="importLegacy4173History" class="button" type="button">导入4173旧缓存</button>
        <button id="clearUploadHistory" class="button danger" type="button">清空上传历史</button>
        <button id="clearGenHistory" class="button danger" type="button">清空生成历史</button>
      </div>
    </section>
    <section class="history-layout">
      <div class="history-tabs">
        <button id="historyUploadsTab" class="filter-chip ${state.historyTab === "uploads" ? "active" : ""}" data-history-tab="uploads" type="button">上传缓存</button>
        <button id="historyGenerationsTab" class="filter-chip ${state.historyTab === "generations" ? "active" : ""}" data-history-tab="generations" type="button">生成缓存</button>
      </div>
      <div class="history-type-tabs">
        ${renderHistoryTypeTabs()}
      </div>
      <div class="history-actions">
        ${renderHistoryActions()}
      </div>
      <div class="history-content">
        ${state.historyTab === "uploads" ? renderUploadHistory() : renderGenerationHistory()}
      </div>
    </section>
  `;
  document.querySelector("#historyUpload").addEventListener("change", event => uploadFiles(Array.from(event.target.files || [])));
  document.querySelector("#recoverHistoryStorage").addEventListener("click", () => recoverHistoryFromBrowserStorage());
  document.querySelector("#importLegacy4173History").addEventListener("click", () => importHistoryFromLegacyPort());
  document.querySelector("#clearUploadHistory").addEventListener("click", () => {
    state.uploadHistory = [];
    state.selectedUploadIds.clear();
    persistUploadHistory();
    render();
  });
  document.querySelector("#clearGenHistory").addEventListener("click", () => {
    state.generationHistory = [];
    state.selectedGenerationIds.clear();
    persistGenerationHistory();
    render();
  });
  document.querySelectorAll("[data-history-tab]").forEach(button => {
    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      setHistoryTab(button.dataset.historyTab);
      render();
    });
  });
  document.querySelectorAll("[data-history-type]").forEach(button => {
    button.addEventListener("click", () => {
      state.historyType = button.dataset.historyType;
      state.historyPage = 1;
      state.historyOpenGenerationGroup = "";
      localStorage.setItem(STORAGE_KEYS.historyType, state.historyType);
      render();
    });
  });
  bindHistoryPage();
}

function setHistoryTab(tab) {
  state.activePage = "history";
  localStorage.setItem(STORAGE_KEYS.activePage, state.activePage);
  state.historyTab = tab === "generations" ? "generations" : "uploads";
  state.historyPage = 1;
  state.historyOpenGenerationGroup = "";
  if (state.historyTab === "uploads") {
    state.historyModel = "all";
    state.historyFavoritesOnly = false;
    localStorage.setItem(STORAGE_KEYS.historyModel, state.historyModel);
    localStorage.setItem(STORAGE_KEYS.historyFavoritesOnly, "0");
  }
  localStorage.setItem(STORAGE_KEYS.historyTab, state.historyTab);
}

function renderHistoryTypeTabs() {
  const counts = historyTypeCounts();
  return HISTORY_TYPES.map(type => `
    <button class="filter-chip ${state.historyType === type ? "active" : ""}" data-history-type="${type}" type="button">
      ${typeLabel(type)} <span>${counts[type] || 0}</span>
    </button>
  `).join("");
}

function historyTypeCounts() {
  if (state.historyTab === "generations") {
    return HISTORY_TYPES.reduce((acc, type) => {
      const items = generationResultItems().filter(item => item.type === type);
      acc[type] = generationInputGroupsFromItems(items).length;
      return acc;
    }, {});
  }
  const source = state.uploadHistory;
  return HISTORY_TYPES.reduce((acc, type) => {
    acc[type] = source.filter(item => item.type === type).length;
    return acc;
  }, {});
}

function renderHistoryActions() {
  const isUploads = state.historyTab === "uploads";
  const total = isUploads ? filteredUploadRecords().length : filteredGenerationInputGroups().length;
  const selectedCount = isUploads ? selectedUploadRecords().length : selectedGenerationInputGroups().length;
  const selectedImageCount = !isUploads && state.historyType === "image" ? selectedGenerationResultItems().filter(item => item.type === "image").length : 0;
  const modelFilter = isUploads ? "" : renderHistoryModelFilter();
  const sizeFilter = isUploads ? "" : renderHistorySizeFilter();
  const searchFilter = isUploads ? "" : renderHistorySearchFilter();
  const favoriteCount = isUploads ? 0 : generationResultItems().filter(item => item.type === state.historyType && state.generationFavorites.has(item.key)).length;
  return `
    ${modelFilter}
    ${sizeFilter}
    ${searchFilter}
    ${isUploads ? "" : `<button id="toggleFavoriteHistory" class="button ${state.historyFavoritesOnly ? "active" : ""}" type="button">收藏夹 ${favoriteCount}</button>`}
    <span class="meta-line">已选 ${selectedCount}/${total}</span>
    <button id="selectAllHistory" class="button" type="button" ${total ? "" : "disabled"}>全选</button>
    <button id="clearHistorySelection" class="button" type="button" ${selectedCount ? "" : "disabled"}>取消选择</button>
    <button id="saveSelectedHistory" class="button" type="button" ${selectedCount ? "" : "disabled"}>保存选中</button>
    <button id="downloadSelectedHistory" class="button" type="button" ${selectedCount ? "" : "disabled"}>${isUploads ? "下载选中文件" : "下载选中结果"}</button>
    <button id="deleteSelectedHistory" class="button danger" type="button" ${selectedCount ? "" : "disabled"}>删除选中</button>
  `;
}

function renderHistoryModelFilter() {
  const options = historyGenerationModelOptions();
  if (state.historyModel !== "all" && !options.some(item => item.value === state.historyModel)) {
    state.historyModel = "all";
    localStorage.setItem(STORAGE_KEYS.historyModel, state.historyModel);
  }
  return `
    <label class="history-model-filter">
      <span>&#27169;&#22411;</span>
      <select id="historyModelFilter">
        <option value="all">&#20840;&#37096;&#27169;&#22411;</option>
        ${options.map(item => `<option value="${escapeAttr(item.value)}" ${state.historyModel === item.value ? "selected" : ""}>${escapeHtml(item.label)}</option>`).join("")}
      </select>
    </label>
  `;
}

function renderHistorySizeFilter() {
  const options = historyGenerationSizeOptions();
  if (state.historySize !== "all" && !options.some(item => item.value === state.historySize)) {
    state.historySize = "all";
    localStorage.setItem(STORAGE_KEYS.historySize, state.historySize);
  }
  return `
    <label class="history-model-filter history-size-filter">
      <span>尺寸</span>
      <select id="historySizeFilter">
        <option value="all">全部尺寸</option>
        ${options.map(item => `<option value="${escapeAttr(item.value)}" ${state.historySize === item.value ? "selected" : ""}>${escapeHtml(item.label)}</option>`).join("")}
      </select>
    </label>
  `;
}

function renderHistorySearchFilter() {
  return `
    <label class="history-search-filter">
      <span>搜索</span>
      <input id="historyPromptSearch" type="search" value="${escapeAttr(state.historySearch || "")}" placeholder="按 Prompt 搜索">
    </label>
    <button id="applyHistoryPromptSearch" class="button" type="button">搜索</button>
    <button id="clearHistoryPromptSearch" class="button" type="button" ${state.historySearch ? "" : "disabled"}>清空</button>
  `;
}

function bindHistoryPage() {
  const historyActions = document.querySelector(".history-actions");
  if (historyActions && state.historyTab === "generations" && state.historyType === "image") {
    const selectedImageCount = selectedGenerationResultItems().filter(item => item.type === "image").length;
    const sendButton = document.createElement("button");
    sendButton.id = "sendSelectedGenerationImages";
    sendButton.className = "button";
    sendButton.type = "button";
    sendButton.textContent = "选中加入上传缓存";
    sendButton.disabled = selectedImageCount === 0;
    sendButton.addEventListener("click", () => sendGenerationImagesToUploadCache(selectedGenerationResultItems()));
    const deleteButton = historyActions.querySelector("#deleteSelectedHistory");
    historyActions.insertBefore(sendButton, deleteButton || null);
  }
  document.querySelector("#selectAllHistory")?.addEventListener("click", () => {
    if (state.historyTab === "uploads") {
      visibleUploadRecords().forEach(item => state.selectedUploadIds.add(item.id));
    } else {
      visibleGenerationResultItems().forEach(item => state.selectedGenerationIds.add(item.key));
    }
    render();
  });
  document.querySelector("#clearHistorySelection")?.addEventListener("click", () => {
    clearHistorySelection();
    render();
  });
  document.querySelector("#saveSelectedHistory")?.addEventListener("click", saveSelectedHistory);
  document.querySelector("#downloadSelectedHistory")?.addEventListener("click", downloadSelectedHistory);
  document.querySelector("#deleteSelectedHistory")?.addEventListener("click", deleteSelectedHistory);
  document.querySelectorAll("[data-history-page]").forEach(button => {
    button.addEventListener("click", () => {
      const page = Number(button.dataset.historyPage || 1);
      if (!Number.isFinite(page) || page < 1) return;
      state.historyPage = page;
      render();
    });
  });
  document.querySelector("#historyModelFilter")?.addEventListener("change", event => {
    state.historyModel = event.target.value || "all";
    state.historyPage = 1;
    state.historyOpenGenerationGroup = "";
    state.selectedGenerationIds.clear();
    localStorage.setItem(STORAGE_KEYS.historyModel, state.historyModel);
    render();
  });
  document.querySelector("#historySizeFilter")?.addEventListener("change", event => {
    state.historySize = event.target.value || "all";
    state.historyPage = 1;
    state.historyOpenGenerationGroup = "";
    state.selectedGenerationIds.clear();
    localStorage.setItem(STORAGE_KEYS.historySize, state.historySize);
    render();
  });
  document.querySelector("#historyPromptSearch")?.addEventListener("input", event => {
    state.historySearch = event.target.value || "";
    localStorage.setItem(STORAGE_KEYS.historySearch, state.historySearch);
  });
  document.querySelector("#historyPromptSearch")?.addEventListener("keydown", event => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    state.historySearch = event.target.value || "";
    state.historyPage = 1;
    state.historyOpenGenerationGroup = "";
    state.selectedGenerationIds.clear();
    localStorage.setItem(STORAGE_KEYS.historySearch, state.historySearch);
    render();
  });
  document.querySelector("#applyHistoryPromptSearch")?.addEventListener("click", () => {
    const input = document.querySelector("#historyPromptSearch");
    state.historySearch = input?.value || "";
    state.historyPage = 1;
    state.historyOpenGenerationGroup = "";
    state.selectedGenerationIds.clear();
    localStorage.setItem(STORAGE_KEYS.historySearch, state.historySearch);
    render();
  });
  document.querySelector("#clearHistoryPromptSearch")?.addEventListener("click", () => {
    if (state.historySearch) {
      state.historySearch = "";
      state.historyPage = 1;
      state.historyOpenGenerationGroup = "";
      state.selectedGenerationIds.clear();
      localStorage.setItem(STORAGE_KEYS.historySearch, "");
      render();
    }
  });
  document.querySelector("#toggleFavoriteHistory")?.addEventListener("click", () => {
    state.historyFavoritesOnly = !state.historyFavoritesOnly;
    state.historyPage = 1;
    state.historyOpenGenerationGroup = "";
    state.selectedGenerationIds.clear();
    localStorage.setItem(STORAGE_KEYS.historyFavoritesOnly, state.historyFavoritesOnly ? "1" : "0");
    render();
  });
  document.querySelectorAll("[data-upload-select]").forEach(input => {
    input.addEventListener("change", event => toggleSetValue(state.selectedUploadIds, event.target.dataset.uploadSelect, event.target.checked));
  });
  document.querySelectorAll("[data-generation-select]").forEach(input => {
    input.addEventListener("change", event => toggleSetValue(state.selectedGenerationIds, event.target.dataset.generationSelect, event.target.checked));
  });
  document.querySelectorAll("[data-generation-group-select]").forEach(input => {
    input.indeterminate = input.dataset.indeterminate === "1";
    input.addEventListener("change", event => {
      const group = findFilteredGenerationGroupById(event.target.dataset.generationGroupSelect);
      if (!group) return;
      group.items.forEach(item => toggleSetValue(state.selectedGenerationIds, item.key, event.target.checked, { render: false }));
      render();
    });
  });
  document.querySelectorAll("[data-delete-upload]").forEach(button => {
    button.addEventListener("click", () => deleteUploadHistory([button.dataset.deleteUpload]));
  });
  document.querySelectorAll("[data-delete-generation]").forEach(button => {
    button.addEventListener("click", () => deleteGenerationResults([button.dataset.deleteGeneration]));
  });
  document.querySelectorAll("[data-delete-generation-group]").forEach(button => {
    button.addEventListener("click", () => {
      const group = findFilteredGenerationGroupById(button.dataset.deleteGenerationGroup);
      if (group) deleteGenerationResults(group.items.map(item => item.key));
    });
  });
  document.querySelectorAll("[data-toggle-generation-favorite]").forEach(button => {
    button.addEventListener("click", () => toggleGenerationFavorite(button.dataset.toggleGenerationFavorite));
  });
  document.querySelectorAll("[data-toggle-generation-group-favorite]").forEach(button => {
    button.addEventListener("click", () => toggleGenerationGroupFavorite(button.dataset.toggleGenerationGroupFavorite));
  });
  document.querySelectorAll("[data-open-generation-group]").forEach(button => {
    button.addEventListener("click", () => {
      state.historyOpenGenerationGroup = state.historyOpenGenerationGroup === button.dataset.openGenerationGroup ? "" : button.dataset.openGenerationGroup;
      render();
    });
  });
  document.querySelectorAll("[data-add-generation-row]").forEach(button => {
    button.addEventListener("click", () => {
      const item = generationResultItems().find(result => result.key === button.dataset.addGenerationRow);
      if (item) addGenerationResultToPending(item);
    });
  });
  document.querySelectorAll("[data-send-generation-upload]").forEach(button => {
    button.addEventListener("click", () => {
      const item = generationResultItems().find(result => result.key === button.dataset.sendGenerationUpload);
      if (!item) return;
      sendGenerationImagesToUploadCache([item]);
      button.textContent = "已加入";
      button.disabled = true;
    });
  });
  document.querySelectorAll("[data-capture-generation-frame]").forEach(button => {
    button.addEventListener("click", () => captureGenerationVideoFrame(button.dataset.captureGenerationFrame, button));
  });
  document.querySelectorAll("[data-open-history-video], [data-open-history-media]").forEach(button => {
    if (button.dataset.viewerBound === "1") return;
    button.dataset.viewerBound = "1";
    button.addEventListener("click", () => {
      const token = button.dataset.openHistoryMedia || button.dataset.openHistoryVideo;
      openHistoryMediaViewer(token, button.dataset.videoViewerSource || "history");
    });
  });
  document.querySelectorAll("[data-toggle-generation-prompt]").forEach(button => {
    button.addEventListener("click", () => {
      const prompt = document.querySelector(`[data-generation-prompt="${CSS.escape(button.dataset.toggleGenerationPrompt)}"]`);
      if (!prompt) return;
      const expanded = prompt.classList.toggle("expanded");
      button.textContent = expanded ? "收起提示词" : "查看全部";
    });
  });
  document.querySelectorAll("[data-copy-generation-prompt]").forEach(button => {
    button.addEventListener("click", () => copyPromptText(button.dataset.copyGenerationPrompt || ""));
  });
  bindDownloadButtons();
}

function renderUploadHistory() {
  const groups = ["image", "video", "audio", "other"];
  return groups.map(type => {
    const items = state.uploadHistory.filter(item => item.type === type);
    if (!items.length) return "";
    return `
      <h3>${typeLabel(type)}</h3>
      <div class="asset-grid">${items.map(renderUploadHistoryCard).join("")}</div>
    `;
  }).join("") || `<div class="meta-line">暂无上传缓存</div>`;
}

function renderGenerationHistory() {
  const groups = ["image", "video", "audio", "other"];
  const items = generationResultItems();
  const content = groups.map(type => {
    const groupItems = items.filter(item => item.type === type);
    if (!groupItems.length) return "";
    return `
      <h3>${typeLabel(type)}</h3>
      <div class="asset-grid">${groupItems.map(renderGenerationHistoryCard).join("")}</div>
    `;
  }).join("") || `<div class="meta-line">暂无生成缓存</div>`;
  return `
    <div class="history-pool-title">
      <strong>生成结果缓存</strong>
      <span class="meta-line">每个生成结果单独成卡，和上传缓存池一样批量选择、下载、删除。</span>
    </div>
    ${content}
  `;
}

function renderHistoryPagination(totalCount) {
  const totalPages = Math.max(1, Math.ceil(totalCount / HISTORY_PAGE_SIZE));
  if (totalPages <= 1) return "";
  state.historyPage = clampHistoryPage(state.historyPage, totalPages);
  const current = state.historyPage;
  const pages = historyPaginationPages(current, totalPages);
  return `
    <div class="history-pagination">
      <button class="button" data-history-page="${current - 1}" type="button" ${current <= 1 ? "disabled" : ""}>上一页</button>
      ${pages.map(page => page === "..."
        ? `<span class="history-page-ellipsis">...</span>`
        : `<button class="button ${page === current ? "active" : ""}" data-history-page="${page}" type="button">${page}</button>`).join("")}
      <button class="button" data-history-page="${current + 1}" type="button" ${current >= totalPages ? "disabled" : ""}>下一页</button>
    </div>
  `;
}

function clampHistoryPage(page, totalPages) {
  return Math.min(Math.max(1, Number(page || 1)), Math.max(1, Number(totalPages || 1)));
}

function historyPaginationPages(current, totalPages) {
  const pageSet = new Set([1, totalPages, current, current - 1, current + 1, current - 2, current + 2]);
  for (let page = 2; page <= Math.min(7, totalPages); page += 1) pageSet.add(page);
  const pages = Array.from(pageSet).filter(page => page >= 1 && page <= totalPages).sort((a, b) => a - b);
  const output = [];
  pages.forEach(page => {
    if (output.length && page - output[output.length - 1] > 1) output.push("...");
    output.push(page);
  });
  return output;
}

function renderUploadHistoryCard(item) {
  return `
    <article class="asset-card history-asset-card">
      <div class="history-card-head">
        <label class="history-check">
          <input data-upload-select="${escapeAttr(item.id)}" type="checkbox" ${state.selectedUploadIds.has(item.id) ? "checked" : ""}>
          <a class="history-title-link" href="${escapeAttr(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.name || shortUrl(item.url))}</a>
        </label>
        <button class="tiny-button danger" data-delete-upload="${escapeAttr(item.id)}" type="button">删除</button>
      </div>
      ${item.type === "video" ? `<a class="preview-link" href="${escapeAttr(item.url)}" target="_blank" rel="noreferrer"><video src="${escapeAttr(item.url)}"></video></a>` : item.type === "audio" ? `<audio src="${escapeAttr(item.url)}" controls></audio>` : item.type === "image" ? `<a class="preview-link" href="${escapeAttr(item.url)}" target="_blank" rel="noreferrer"><img src="${escapeAttr(item.preview || item.url)}" alt=""></a>` : `<a class="url-line" href="${escapeAttr(item.url)}" target="_blank" rel="noreferrer">打开文件</a>`}
      <span class="meta-line">${assetMeta(item)}</span>
      <a class="url-line" href="${escapeAttr(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(shortUrl(item.url))}</a>
      <div class="history-card-actions">
        <button class="tiny-button download-link" data-download-url="${escapeAttr(item.url)}" data-download-name="${escapeAttr(fileNameFromUrl(item.url, "upload-file"))}" type="button">下载</button>
      </div>
    </article>
  `;
}

function renderGenerationHistoryCard(item) {
  const isImage = item.type === "image";
  const isVideo = item.type === "video";
  const isAudio = item.type === "audio";
  const filename = fileNameFromUrl(item.url, "generation-result");
  return `
    <article class="asset-card history-asset-card">
      <div class="history-card-head">
        <label class="history-check">
          <input data-generation-select="${escapeAttr(item.key)}" type="checkbox" ${state.selectedGenerationIds.has(item.key) ? "checked" : ""}>
          <a class="history-title-link" href="${escapeAttr(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(filename)}</a>
        </label>
        <button class="tiny-button danger" data-delete-generation="${escapeAttr(item.key)}" type="button">删除</button>
      </div>
      ${isVideo ? `<a class="preview-link" href="${escapeAttr(item.url)}" target="_blank" rel="noreferrer"><video src="${escapeAttr(item.url)}"></video></a>` : isAudio ? `<audio src="${escapeAttr(item.url)}" controls></audio>` : isImage ? `<a class="preview-link" href="${escapeAttr(item.url)}" target="_blank" rel="noreferrer"><img src="${escapeAttr(item.url)}" alt=""></a>` : `<a class="url-line" href="${escapeAttr(item.url)}" target="_blank" rel="noreferrer">打开结果文件</a>`}
      ${renderGenerationPromptSummary(item)}
      <span class="meta-line">${escapeHtml(item.record.model || "未知模型")} · ${escapeHtml(item.record.version || "未知版本")} · 尺寸 ${item.record.size || "空"} · 清晰度 ${item.record.quality || "空"}</span>
      <span class="meta-line">${typeLabel(item.type)} · ${new Date(item.record.createdAt).toLocaleString()}</span>
      <a class="url-line" href="${escapeAttr(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(shortUrl(item.url))}</a>
      <div class="history-card-actions">
        <button class="tiny-button download-link" data-download-url="${escapeAttr(item.url)}" data-download-name="${escapeAttr(filename)}" type="button">下载</button>
        ${item.type === "image" ? `<button class="tiny-button" data-send-generation-upload="${escapeAttr(item.key)}" type="button">加入上传缓存</button>` : ""}
        ${item.type === "video" ? `<button class="tiny-button" data-capture-generation-frame="${escapeAttr(item.key)}" type="button">抽当前帧</button>` : ""}
        <button class="tiny-button success" data-add-generation-row="${escapeAttr(item.key)}" type="button">添加到生成队列行</button>
      </div>
    </article>
  `;
}

function toggleSetValue(set, value, checked, options = {}) {
  if (checked) {
    set.add(value);
  } else {
    set.delete(value);
  }
  if (options.render !== false) render();
}

function clearHistorySelection() {
  if (state.historyTab === "uploads") {
    state.selectedUploadIds.clear();
  } else {
    state.selectedGenerationIds.clear();
  }
}

function selectedUploadRecords() {
  return state.uploadHistory.filter(item => state.selectedUploadIds.has(item.id));
}

function saveSelectedHistory() {
  const isUploads = state.historyTab === "uploads";
  const records = isUploads ? selectedUploadRecords() : selectedGenerationResultItems();
  if (!records.length) return;
  const timestamp = Date.now();
  const payload = {
    type: isUploads ? "uploadHistory" : "generationResultHistory",
    exportedAt: new Date().toISOString(),
    count: records.length,
    records: isUploads ? records : records.map(generationResultPayload)
  };
  download(`api-history-${payload.type}-${timestamp}.json`, JSON.stringify(payload, null, 2), "application/json");
  const urls = uniqueHistoryUrls(records, isUploads);
  if (urls.length) {
    download(`api-history-${payload.type}-urls-${timestamp}.txt`, urls.join("\n"), "text/plain;charset=utf-8");
  }
}

function downloadSelectedHistory() {
  const isUploads = state.historyTab === "uploads";
  const records = isUploads ? selectedUploadRecords() : selectedGenerationResultItems();
  const urls = uniqueHistoryUrls(records, isUploads);
  downloadUrlsInteractive(urls, isUploads ? "upload-file" : "generation-result");
}

function deleteSelectedHistory() {
  if (state.historyTab === "uploads") {
    deleteUploadHistory(Array.from(state.selectedUploadIds));
  } else {
    deleteGenerationResults(Array.from(state.selectedGenerationIds));
  }
}

function deleteUploadHistory(ids, options = {}) {
  const idSet = new Set(ids);
  state.uploadHistory = state.uploadHistory.filter(item => !idSet.has(item.id));
  ids.forEach(id => state.selectedUploadIds.delete(id));
  persistUploadHistory();
  if (options.render !== false) render();
}

function deleteGenerationResults(keys, options = {}) {
  const grouped = new Map();
  keys.map(parseGenerationKey).filter(Boolean).forEach(item => {
    if (!grouped.has(item.recordId)) grouped.set(item.recordId, []);
    grouped.get(item.recordId).push(item.resultIndex);
  });
  grouped.forEach((indexes, recordId) => {
    const record = state.generationHistory.find(item => item.id === recordId);
    if (!record) return;
    const removeIndexes = new Set(indexes);
    record.results = record.results.filter((_, index) => !removeIndexes.has(index));
  });
  state.generationHistory = state.generationHistory.filter(record => (record.results || []).length > 0);
  keys.forEach(key => state.selectedGenerationIds.delete(key));
  keys.forEach(key => state.generationFavorites.delete(key));
  persistGenerationHistory();
  saveJson(STORAGE_KEYS.generationFavorites, Array.from(state.generationFavorites));
  if (state.historyOpenGenerationGroup && !filteredGenerationInputGroups().some(group => group.id === state.historyOpenGenerationGroup)) {
    state.historyOpenGenerationGroup = "";
  }
  if (options.render !== false) render();
}

function addGenerationResultToPending(item) {
  const record = item.record;
  const page = generationPageFromRecord(record);
  const row = createPendingRowFromGeneration(record, page);
  if (!row) {
    window.alert("这条历史结果不属于可重新加入队列的生成表格");
    return;
  }
  addPendingRowToPage(row, page);
  render();
}

function createPendingRowFromGeneration(record, page) {
  const assets = generationAssetsFromRecord(record);
  const images = assets.filter(asset => asset.type === "image");
  const videos = assets.filter(asset => asset.type === "video");
  const audios = assets.filter(asset => asset.type === "audio");
  const common = {
    selected: true,
    status: "pending",
    prompt: record.prompt,
    version: record.version,
    size: record.size,
    quality: record.quality,
    duration: record.duration,
    count: 1,
    taskIds: [],
    results: [],
    error: ""
  };
  if (page === "image") {
    return createRow({
      ...common,
      images,
      model: modelKeyFromGeneration(record)
    });
  }
  if (page === "imageVideo") {
    const frames = imageVideoFramesFromGeneration(record, images);
    return createImageVideoRow({
      ...common,
      model: imageVideoModelKeyFromGeneration(record),
      firstFrame: frames.firstFrame,
      lastFrame: frames.lastFrame,
      autoMultiShot: Boolean(record.autoMultiShot)
    });
  }
  if (page === "motion") {
    return createMotionRow({
      ...common,
      model: motionModelKeyFromGeneration(record),
      image: images[0] || null,
      video: videos[0] || null
    });
  }
  if (page === "avatar") {
    return createAvatarRow({
      ...common,
      model: avatarModelKeyFromGeneration(record),
      image: images[0] || null,
      audio: audios[0] || null
    });
  }
  if (page === "multiVideo") {
    return createMultiRow({
      ...common,
      refs: assets,
      model: multiModelKeyFromGeneration(record),
      generateAudio: record.generateAudio !== false
    });
  }
  if (page === "viduRef") {
    return createViduRefRow({
      ...common,
      refs: images,
      version: normalizeViduRefVersion(record.version),
      seed: record.seed || "",
      returnedSeeds: Array.isArray(record.returnedSeeds) ? record.returnedSeeds : [],
      offPeak: Boolean(record.offPeak),
      voiceId: record.voiceId || ""
    });
  }
  return null;
}

function imageVideoFramesFromGeneration(record, images) {
  const used = new Set();
  const firstFrame = cloneDistinctImageVideoFrame(record.firstFrame, "first", used)
    || cloneDistinctImageVideoFrame(images[0], "first", used);
  const lastFrame = cloneDistinctImageVideoFrame(record.lastFrame, "last", used)
    || cloneDistinctImageVideoFrame(images[1], "last", used);
  return {
    firstFrame: firstFrame || null,
    lastFrame: lastFrame || null
  };
}

function cloneDistinctImageVideoFrame(asset, field, used) {
  const normalized = normalizeAssets(asset ? [asset] : []).filter(item => item.type === "image")[0];
  if (!normalized) return null;
  const key = assetUrl(normalized) || normalized.id;
  if (key && used.has(key)) return null;
  if (key) used.add(key);
  return { ...normalized, id: uid(`${field}frame`) };
}

function addPendingRowToPage(row, page) {
  if (page === "image") {
    state.rows.push(row);
    state.scrollToImageRowId = row.id;
    persistRows();
  } else if (page === "imageVideo") {
    state.imageVideoRows.push(row);
    state.scrollToImageVideoRowId = row.id;
    persistImageVideoRows();
  } else if (page === "motion") {
    state.motionRows.push(row);
    state.scrollToMotionRowId = row.id;
    persistMotionRows();
  } else if (page === "avatar") {
    state.avatarRows.push(row);
    state.scrollToAvatarRowId = row.id;
    persistAvatarRows();
  } else if (page === "multiVideo") {
    state.multiRows.push(row);
    state.scrollToMultiRowId = row.id;
    persistMultiRows();
  } else if (page === "viduRef") {
    state.viduRefRows.push(row);
    state.scrollToViduRefRowId = row.id;
    persistViduRefRows();
  }
  state.activePage = page;
  localStorage.setItem(STORAGE_KEYS.activePage, state.activePage);
}

function generationAssetsFromRecord(record) {
  return normalizeAssets([
    ...(record.refs || []),
    ...(record.images || []),
    record.firstFrame,
    record.lastFrame
  ].filter(Boolean));
}

function generationPageFromRecord(record) {
  const explicit = String(record.page || "");
  if (["image", "imageVideo", "motion", "avatar", "multiVideo", "viduRef"].includes(explicit)) return explicit;
  if (["music", "viduVoice", "subjectLibrary"].includes(explicit)) return "";
  const modelText = String(record.model || "");
  const params = record.params || {};
  const assets = generationAssetsFromRecord(record);
  if (/suno/i.test(modelText) || params.customMode !== undefined || params.instrumental !== undefined || (params.voice_id && params.audio_url)) return "";
  if (/vidu.*参考|reference/i.test(modelText) || record.voiceId || record.offPeak || record.returnedSeeds?.length) return "viduRef";
  if (/数字人|avatar|omnihuman|omni.?human/i.test(modelText) || (params.audio_url && params.image_url)) return "avatar";
  if (/动作|motion/i.test(modelText) || (params.video_url && params.image_url)) return "motion";
  if (record.firstFrame || record.lastFrame || params.first_frame_image || params.first_frame_url || params.last_frame_image || params.last_frame_url) return "imageVideo";
  if (/seedance|多模态|multi/i.test(modelText) || assets.some(asset => asset.type === "video" || asset.type === "audio")) return "multiVideo";
  return "image";
}

function modelKeyFromGeneration(record) {
  if (IMAGE_MODELS[record.model]) return record.model;
  const byLabel = Object.entries(IMAGE_MODELS).find(([, config]) => config.label === record.model);
  if (byLabel) return byLabel[0];
  const byVersion = Object.entries(IMAGE_MODELS).find(([, config]) => config.versions.some(version => version.value === record.version));
  return byVersion ? byVersion[0] : "nano";
}

function modelKeyFromMap(record, map, fallback) {
  if (map[record.model]) return record.model;
  const byLabel = Object.entries(map).find(([, config]) => config.label === record.model);
  if (byLabel) return byLabel[0];
  const byVersion = Object.entries(map).find(([, config]) => (config.versions || []).some(version => version.value === record.version));
  return byVersion ? byVersion[0] : fallback;
}

function imageVideoModelKeyFromGeneration(record) {
  return modelKeyFromMap(record, IMAGE_VIDEO_MODELS, "hailuo");
}

function motionModelKeyFromGeneration(record) {
  return modelKeyFromMap(record, MOTION_MODELS, "kling");
}

function avatarModelKeyFromGeneration(record) {
  return modelKeyFromMap(record, AVATAR_MODELS, "jimeng");
}

function multiModelKeyFromGeneration(record) {
  return modelKeyFromMap(record, MULTI_VIDEO_MODELS, "seedance");
}

function generationResultItems() {
  return state.generationHistory.flatMap(record => (record.results || []).map((result, index) => {
    const url = typeof result === "string" ? result : result?.url || JSON.stringify(result);
    return {
      key: generationResultKey(record.id, index),
      record,
      result,
      index,
      url,
      type: guessType(url)
    };
  }));
}

function selectedGenerationResultItems() {
  return generationResultItems().filter(item => state.selectedGenerationIds.has(item.key));
}

function generationResultKey(recordId, resultIndex) {
  return `${recordId}::${resultIndex}`;
}

function parseGenerationKey(key) {
  const splitAt = String(key).lastIndexOf("::");
  if (splitAt < 0) return null;
  const resultIndex = Number(String(key).slice(splitAt + 2));
  if (Number.isNaN(resultIndex)) return null;
  return {
    recordId: String(key).slice(0, splitAt),
    resultIndex
  };
}

function generationResultPayload(item) {
  return {
    id: item.key,
    createdAt: item.record.createdAt,
    taskId: item.record.taskId,
    prompt: item.record.prompt,
    model: item.record.model,
    version: item.record.version,
    size: item.record.size,
    quality: item.record.quality,
    images: item.record.images,
    params: item.record.params,
    result: item.result,
    url: item.url
  };
}

function sendGenerationImagesToUploadCache(items) {
  const imageItems = (items || []).filter(item => item?.type === "image" && item.url);
  if (!imageItems.length) {
    window.alert("没有可加入上传缓存的生成图片");
    return 0;
  }
  imageItems.forEach(item => {
    addUploadHistory({
      id: uid("asset"),
      name: fileNameFromUrl(item.url, "generated-image"),
      url: item.url,
      preview: item.url,
      type: "image",
      source: "generation",
      createdAt: Date.now()
    });
  });
  window.alert(`已加入上传缓存：${imageItems.length} 张图片`);
  return imageItems.length;
}

function sendResultImageUrlToUploadCache(url) {
  if (!url || guessType(url) !== "image") return 0;
  addUploadHistory({
    id: uid("asset"),
    name: fileNameFromUrl(url, "generated-image"),
    url,
    preview: url,
    type: "image",
    source: "generation-result",
    createdAt: Date.now()
  });
  return 1;
}

async function captureGenerationVideoFrame(key, button) {
  const item = generationResultItems().find(result => result.key === key);
  if (!item || item.type !== "video") return;
  const video = Array.from(document.querySelectorAll("[data-history-video-key]"))
    .find(node => node.dataset.historyVideoKey === key);
  if (!video) {
    window.alert("没有找到当前视频预览，请先在生成缓存的视频页操作");
    return;
  }
  try {
    if (video.readyState < 2) {
      await waitForMediaEvent(video, "loadeddata", 5000);
    }
    if (!video.videoWidth || !video.videoHeight) throw new Error("视频尺寸未读取完成");
    video.pause();
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const timeLabel = formatFrameTime(video.currentTime || 0);
    const fileName = `${fileNameFromUrl(item.url, "video").replace(/\.[^.]+$/, "")}_frame_${timeLabel}.jpg`;
    const blob = await canvasToBlob(canvas, "image/jpeg", 0.92);
    const uploadedUrl = await uploadGeneratedImageBlob(blob, fileName);
    addUploadHistory({
      id: uid("asset"),
      name: fileName,
      url: uploadedUrl,
      preview: uploadedUrl,
      type: "image",
      width: canvas.width,
      height: canvas.height,
      size: blob.size,
      source: "video-frame",
      createdAt: Date.now()
    });
    if (button) {
      button.textContent = "已抽帧";
      setTimeout(() => {
        button.textContent = "抽当前帧到上传缓存";
      }, 1400);
    }
  } catch (error) {
    window.alert(`抽帧失败：${error.message || error}\n如果视频 CDN 不允许跨域读取画面，只能先下载视频后本地上传再抽帧。`);
  }
}

async function captureHistoryVideoFrame(video, item, button) {
  if (!video || !item?.url) return;
  const originalText = button?.textContent || "";
  try {
    if (button) {
      button.disabled = true;
      button.textContent = "正在抽帧...";
    }
    if (video.readyState < 2) {
      await waitForMediaEvent(video, "loadeddata", 5000);
    }
    if (!video.videoWidth || !video.videoHeight) throw new Error("视频尺寸未读取完成");
    video.pause();
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const timeLabel = formatFrameTime(video.currentTime || 0);
    const fileName = `${fileNameFromUrl(item.url, "video").replace(/\.[^.]+$/, "")}_frame_${timeLabel}.jpg`;
    const blob = await canvasToBlob(canvas, "image/jpeg", 0.92);
    const uploadedUrl = await uploadGeneratedImageBlob(blob, fileName);
    addUploadHistory({
      id: uid("asset"),
      name: fileName,
      url: uploadedUrl,
      preview: uploadedUrl,
      type: "image",
      width: canvas.width,
      height: canvas.height,
      size: blob.size,
      source: "video-frame",
      createdAt: Date.now()
    });
    if (button) button.textContent = "已抽帧到上传缓存";
  } catch (error) {
    window.alert(`抽帧失败：${error.message || error}\n如果视频 CDN 不允许跨域读取画面，需要先下载视频再本地上传后抽帧。`);
    if (button) button.textContent = originalText || "抽当前帧到上传缓存";
  } finally {
    if (button) {
      setTimeout(() => {
        button.disabled = false;
        button.textContent = originalText || "抽当前帧到上传缓存";
      }, 1400);
    }
  }
}

function canvasToBlob(canvas, type = "image/jpeg", quality = 0.92) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error("无法导出当前帧"));
    }, type, quality);
  });
}

async function uploadGeneratedImageBlob(blob, filename) {
  const form = new FormData();
  form.append("file", new File([blob], filename, { type: blob.type || "image/jpeg" }));
  const response = await fetch(`${apiBase()}/fileupload`, { method: "POST", body: form });
  const json = await response.json().catch(() => ({}));
  const uploadedUrl = uploadResponseUrl(json);
  if (!response.ok || !uploadedUrl) throw new Error(json.message || `上传抽帧失败 HTTP ${response.status}`);
  return uploadedUrl;
}

function waitForMediaEvent(media, eventName, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("等待视频加载超时"));
    }, timeout);
    const cleanup = () => {
      clearTimeout(timer);
      media.removeEventListener(eventName, onReady);
      media.removeEventListener("error", onError);
    };
    const onReady = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("视频加载失败"));
    };
    media.addEventListener(eventName, onReady, { once: true });
    media.addEventListener("error", onError, { once: true });
    media.load?.();
  });
}

function formatFrameTime(value) {
  const total = Math.max(0, Number(value || 0));
  const minutes = Math.floor(total / 60);
  const seconds = Math.floor(total % 60);
  const millis = Math.round((total - Math.floor(total)) * 1000);
  return `${String(minutes).padStart(2, "0")}${String(seconds).padStart(2, "0")}${String(millis).padStart(3, "0")}`;
}

function uniqueHistoryUrls(records, isUploads) {
  const urls = records.flatMap(record => isUploads ? [record.url].filter(Boolean) : [record.url].filter(Boolean));
  return Array.from(new Set(urls));
}

function historyPageSlice(items) {
  const totalPages = Math.max(1, Math.ceil(items.length / HISTORY_PAGE_SIZE));
  state.historyPage = clampHistoryPage(state.historyPage, totalPages);
  const start = (state.historyPage - 1) * HISTORY_PAGE_SIZE;
  return items.slice(start, start + HISTORY_PAGE_SIZE);
}

function visibleUploadRecords() {
  return historyPageSlice(filteredUploadRecords());
}

function visibleGenerationInputGroups() {
  return historyPageSlice(filteredGenerationInputGroups());
}

function visibleGenerationResultItems() {
  return visibleGenerationInputGroups().flatMap(group => group.items);
}

function filteredUploadRecords() {
  return state.uploadHistory.filter(item => item.type === state.historyType);
}

function filteredGenerationResultItems() {
  return generationResultItems().filter(item => {
    if (item.type !== state.historyType) return false;
    if (state.historyFavoritesOnly && !state.generationFavorites.has(item.key)) return false;
    if (state.historyModel && state.historyModel !== "all" && generationModelKey(item.record) !== state.historyModel) return false;
    if (state.historySize && state.historySize !== "all" && generationSizeKey(item.record) !== state.historySize) return false;
    const keyword = String(state.historySearch || "").trim().toLowerCase();
    if (keyword && !String(item.record?.prompt || "").toLowerCase().includes(keyword)) return false;
    return true;
  });
}

function filteredGenerationInputGroups() {
  return generationInputGroupsFromItems(filteredGenerationResultItems());
}

function generationInputGroupsFromItems(items) {
  const groups = new Map();
  items.forEach(item => {
    const signature = generationInputSignature(item.record);
    const id = `g_${hashText(signature)}`;
    const existing = groups.get(id);
    if (existing) {
      existing.items.push(item);
      existing.updatedAt = Math.max(existing.updatedAt, Number(item.record.createdAt || 0));
      if (Number(item.record.createdAt || 0) > Number(existing.primary.record.createdAt || 0)) existing.primary = item;
      return;
    }
    groups.set(id, {
      id,
      signature,
      primary: item,
      items: [item],
      updatedAt: Number(item.record.createdAt || 0)
    });
  });
  return Array.from(groups.values()).sort((a, b) => b.updatedAt - a.updatedAt);
}

function findFilteredGenerationGroupById(id) {
  return filteredGenerationInputGroups().find(group => group.id === id);
}

function generationInputSignature(record) {
  const assets = generationAssetsFromRecord(record)
    .filter(asset => asset && asset.url)
    .map(asset => ({
      type: asset.type || guessType(asset.url),
      url: asset.url || "",
      name: asset.name || ""
    }));
  return stableStringify({
    page: generationPageFromRecord(record),
    prompt: String(record?.prompt || "").trim(),
    model: record?.model || "",
    version: record?.version || "",
    size: record?.size || "",
    quality: record?.quality || "",
    duration: record?.duration || "",
    count: record?.count || "",
    voiceId: record?.voiceId || "",
    offPeak: Boolean(record?.offPeak),
    assets,
    firstFrame: assetSignature(record?.firstFrame),
    lastFrame: assetSignature(record?.lastFrame)
  });
}

function assetSignature(asset) {
  if (!asset) return null;
  if (typeof asset === "string") return { url: asset };
  return {
    type: asset.type || guessType(asset.url || ""),
    url: asset.url || "",
    name: asset.name || ""
  };
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function hashText(text) {
  let hash = 2166136261;
  const input = String(text || "");
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(36);
}

function toggleGenerationFavorite(key) {
  if (!key) return;
  if (state.generationFavorites.has(key)) {
    state.generationFavorites.delete(key);
  } else {
    state.generationFavorites.add(key);
  }
  saveJson(STORAGE_KEYS.generationFavorites, Array.from(state.generationFavorites));
  render();
}

function toggleGenerationGroupFavorite(id) {
  const group = findFilteredGenerationGroupById(id);
  if (!group) return;
  const shouldFavorite = !group.items.some(item => state.generationFavorites.has(item.key));
  group.items.forEach(item => {
    if (shouldFavorite) {
      state.generationFavorites.add(item.key);
    } else {
      state.generationFavorites.delete(item.key);
    }
  });
  saveJson(STORAGE_KEYS.generationFavorites, Array.from(state.generationFavorites));
  render();
}

function generationModelKey(record) {
  return [record?.page || "", record?.model || "", record?.version || ""].join("::");
}

function generationModelLabelFromKey(key) {
  const [page, model, version] = String(key || "").split("::");
  return [pageLabel(page), model, version].filter(Boolean).join(" / ") || "Unknown";
}

function historyGenerationModelOptions() {
  const options = new Map();
  generationResultItems()
    .filter(item => item.type === state.historyType && item.record)
    .forEach(item => {
      const key = generationModelKey(item.record);
      if (!options.has(key)) options.set(key, generationModelLabelFromKey(key));
    });
  return Array.from(options.entries())
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function generationSizeKey(record) {
  const size = String(record?.size || "").trim();
  return size || "__empty__";
}

function generationSizeLabel(value) {
  return value === "__empty__" ? "空" : value;
}

function historyGenerationSizeOptions() {
  const options = new Map();
  generationResultItems()
    .filter(item => item.type === state.historyType && item.record)
    .filter(item => !state.historyModel || state.historyModel === "all" || generationModelKey(item.record) === state.historyModel)
    .forEach(item => {
      const key = generationSizeKey(item.record);
      if (!options.has(key)) options.set(key, generationSizeLabel(key));
    });
  return Array.from(options.entries())
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label, "zh-Hans-CN", { numeric: true }));
}

function selectedUploadRecords() {
  return visibleUploadRecords().filter(item => state.selectedUploadIds.has(item.id));
}

function selectedGenerationResultItems() {
  return visibleGenerationResultItems().filter(item => state.selectedGenerationIds.has(item.key));
}

function selectedGenerationInputGroups() {
  return visibleGenerationInputGroups().filter(group => group.items.some(item => state.selectedGenerationIds.has(item.key)));
}

function clearHistorySelection() {
  if (state.historyTab === "uploads") {
    visibleUploadRecords().forEach(item => state.selectedUploadIds.delete(item.id));
  } else {
    visibleGenerationResultItems().forEach(item => state.selectedGenerationIds.delete(item.key));
  }
}

function deleteSelectedHistory() {
  if (state.historyTab === "uploads") {
    deleteUploadHistory(selectedUploadRecords().map(item => item.id));
  } else {
    deleteGenerationResults(selectedGenerationResultItems().map(item => item.key));
  }
}

function renderUploadHistory() {
  const items = visibleUploadRecords();
  const total = filteredUploadRecords().length;
  if (!items.length) return `<div class="meta-line">当前${typeLabel(state.historyType)}上传缓存为空</div>`;
  return `
    <h3>${typeLabel(state.historyType)}</h3>
    <div class="asset-grid">${items.map(renderUploadHistoryCard).join("")}</div>
    ${renderHistoryPagination(total)}
  `;
}

function renderGenerationHistory() {
  const groups = visibleGenerationInputGroups();
  const total = filteredGenerationInputGroups().length;
  const content = groups.length ? `
    <h3>${typeLabel(state.historyType)}</h3>
    <div class="asset-grid generation-input-grid">${groups.map(renderGenerationInputGroupCard).join("")}</div>
    ${renderHistoryPagination(total)}
  ` : `<div class="meta-line">当前${typeLabel(state.historyType)}生成缓存为空</div>`;
  return `
    <div class="history-pool-title">
      <strong>生成结果缓存</strong>
      <span class="meta-line">当前按相同输入合并显示，展开后查看这一组全部抽卡结果。</span>
    </div>
    ${content}
  `;
}

function renderGenerationInputGroupCard(group) {
  const item = group.primary;
  const filename = fileNameFromUrl(item.url, "generation-result");
  const selected = group.items.length > 0 && group.items.every(result => state.selectedGenerationIds.has(result.key));
  const someSelected = group.items.some(result => state.selectedGenerationIds.has(result.key));
  const isFavorite = group.items.some(result => state.generationFavorites.has(result.key));
  const isOpen = state.historyOpenGenerationGroup === group.id;
  const record = item.record || {};
  return `
    <article class="asset-card history-asset-card generation-group-card ${isOpen ? "open" : ""}">
      <div class="history-card-head">
        <label class="history-check">
          <input data-generation-group-select="${escapeAttr(group.id)}" type="checkbox" ${selected ? "checked" : ""} ${someSelected && !selected ? "data-indeterminate=\"1\"" : ""}>
          <span class="history-title-link">${escapeHtml(inputGroupTitle(group))}</span>
        </label>
        <div class="history-card-tools">
          <button class="favorite-button ${isFavorite ? "active" : ""}" data-toggle-generation-group-favorite="${escapeAttr(group.id)}" type="button" title="${isFavorite ? "取消收藏" : "收藏"}">${isFavorite ? "★" : "☆"}</button>
          <button class="tiny-button danger" data-delete-generation-group="${escapeAttr(group.id)}" type="button">删除</button>
        </div>
      </div>
      ${renderHistoryPreview({ ...item, name: filename })}
      <button class="tiny-button history-group-toggle" data-open-generation-group="${escapeAttr(group.id)}" type="button">${isOpen ? "收起结果" : `查看全部 ${group.items.length} 个结果`}</button>
      ${renderGenerationPromptSummary(item)}
      <span class="meta-line">${escapeHtml(record.model || "未知模型")} · ${escapeHtml(record.version || "未知版本")} · 尺寸 ${record.size || "空"} · 清晰度 ${record.quality || "空"}</span>
      <span class="meta-line">${typeLabel(item.type)} · ${new Date(record.createdAt).toLocaleString()} · 共 ${group.items.length} 个结果</span>
      <div class="history-card-actions">
        <button class="tiny-button download-link" data-download-url="${escapeAttr(item.url)}" data-download-name="${escapeAttr(filename)}" type="button">下载首个</button>
        ${item.type === "image" ? `<button class="tiny-button" data-send-generation-upload="${escapeAttr(item.key)}" type="button">首个加入上传缓存</button>` : ""}
        <button class="tiny-button success" data-add-generation-row="${escapeAttr(item.key)}" type="button">添加到生成队列行</button>
      </div>
      ${isOpen ? `<div class="generation-group-results">${group.items.map(renderGenerationGroupResultCard).join("")}</div>` : ""}
    </article>
  `;
}

function inputGroupTitle(group) {
  const record = group.primary?.record || {};
  const prompt = String(record.prompt || "").trim();
  const prefix = `${pageLabel(generationPageFromRecord(record)) || "生成"} · ${record.model || "未知模型"}`;
  return prompt ? `${prefix} · ${prompt.slice(0, 28)}${prompt.length > 28 ? "..." : ""}` : prefix;
}

function renderGenerationGroupResultCard(item) {
  const filename = fileNameFromUrl(item.url, "generation-result");
  return `
    <div class="generation-result-mini">
      ${renderHistoryPreview({ ...item, name: filename })}
      <a class="url-line" href="${escapeAttr(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(shortUrl(item.url))}</a>
      <div class="history-card-actions">
        <button class="tiny-button download-link" data-download-url="${escapeAttr(item.url)}" data-download-name="${escapeAttr(filename)}" type="button">下载</button>
        ${item.type === "image" ? `<button class="tiny-button" data-send-generation-upload="${escapeAttr(item.key)}" type="button">加入上传缓存</button>` : ""}
        <button class="tiny-button success" data-add-generation-row="${escapeAttr(item.key)}" type="button">添加到生成队列行</button>
        <button class="tiny-button danger" data-delete-generation="${escapeAttr(item.key)}" type="button">删除</button>
      </div>
    </div>
  `;
}

function renderUploadHistoryCard(item) {
  return `
    <article class="asset-card history-asset-card">
      <div class="history-card-head">
        <label class="history-check">
          <input data-upload-select="${escapeAttr(item.id)}" type="checkbox" ${state.selectedUploadIds.has(item.id) ? "checked" : ""}>
          <a class="history-title-link" href="${escapeAttr(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.name || shortUrl(item.url))}</a>
        </label>
        <button class="tiny-button danger" data-delete-upload="${escapeAttr(item.id)}" type="button">删除</button>
      </div>
      ${renderHistoryPreview(item)}
      <span class="meta-line">${assetMeta(item)}</span>
      <a class="url-line" href="${escapeAttr(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(shortUrl(item.url))}</a>
      <div class="history-card-actions">
        <button class="tiny-button download-link" data-download-url="${escapeAttr(item.url)}" data-download-name="${escapeAttr(fileNameFromUrl(item.url, "upload-file"))}" type="button">下载</button>
      </div>
    </article>
  `;
}

function renderGenerationHistoryCard(item) {
  const filename = fileNameFromUrl(item.url, "generation-result");
  const isFavorite = state.generationFavorites.has(item.key);
  return `
    <article class="asset-card history-asset-card">
      <div class="history-card-head">
        <label class="history-check">
          <input data-generation-select="${escapeAttr(item.key)}" type="checkbox" ${state.selectedGenerationIds.has(item.key) ? "checked" : ""}>
          <a class="history-title-link" href="${escapeAttr(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(filename)}</a>
        </label>
        <button class="tiny-button danger" data-delete-generation="${escapeAttr(item.key)}" type="button">删除</button>
      </div>
      ${renderHistoryPreview({ ...item, name: filename })}
      ${renderGenerationPromptSummary(item)}
      <span class="meta-line">${escapeHtml(item.record.model || "未知模型")} · ${escapeHtml(item.record.version || "未知版本")} · 尺寸 ${item.record.size || "空"} · 清晰度 ${item.record.quality || "空"}</span>
      <span class="meta-line">${typeLabel(item.type)} · ${new Date(item.record.createdAt).toLocaleString()}</span>
      <a class="url-line" href="${escapeAttr(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(shortUrl(item.url))}</a>
      <div class="history-card-actions">
        <button class="tiny-button download-link" data-download-url="${escapeAttr(item.url)}" data-download-name="${escapeAttr(filename)}" type="button">下载</button>
        <button class="tiny-button success" data-add-generation-row="${escapeAttr(item.key)}" type="button">添加到生成队列行</button>
      </div>
    </article>
  `;
}

function renderGenerationHistoryCard(item) {
  const filename = fileNameFromUrl(item.url, "generation-result");
  const isFavorite = state.generationFavorites.has(item.key);
  return `
    <article class="asset-card history-asset-card">
      <div class="history-card-head">
        <label class="history-check">
          <input data-generation-select="${escapeAttr(item.key)}" type="checkbox" ${state.selectedGenerationIds.has(item.key) ? "checked" : ""}>
          <a class="history-title-link" href="${escapeAttr(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(filename)}</a>
        </label>
        <div class="history-card-tools">
          <button class="favorite-button ${isFavorite ? "active" : ""}" data-toggle-generation-favorite="${escapeAttr(item.key)}" type="button" title="${isFavorite ? "取消收藏" : "收藏"}">${isFavorite ? "★" : "☆"}</button>
          <button class="tiny-button danger" data-delete-generation="${escapeAttr(item.key)}" type="button">删除</button>
        </div>
      </div>
      ${renderHistoryPreview({ ...item, name: filename })}
      ${renderGenerationPromptSummary(item)}
      <span class="meta-line">${escapeHtml(item.record.model || "未知模型")} · ${escapeHtml(item.record.version || "未知版本")} · 尺寸 ${item.record.size || "空"} · 清晰度 ${item.record.quality || "空"}</span>
      <span class="meta-line">${typeLabel(item.type)} · ${new Date(item.record.createdAt).toLocaleString()}</span>
      <a class="url-line" href="${escapeAttr(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(shortUrl(item.url))}</a>
      <div class="history-card-actions">
        <button class="tiny-button download-link" data-download-url="${escapeAttr(item.url)}" data-download-name="${escapeAttr(filename)}" type="button">下载</button>
        ${item.type === "image" ? `<button class="tiny-button" data-send-generation-upload="${escapeAttr(item.key)}" type="button">加入上传缓存</button>` : ""}
        <button class="tiny-button success" data-add-generation-row="${escapeAttr(item.key)}" type="button">添加到生成队列行</button>
      </div>
    </article>
  `;
}

function renderGenerationPromptSummary(item) {
  const prompt = String(item.record.prompt || "");
  const hasPrompt = prompt.trim();
  const lineCount = prompt.split(/\r?\n/).length;
  const probablyLong = prompt.length > 120 || lineCount > 3;
  if (!hasPrompt) return `<span class="meta-line">无 Prompt</span>`;
  return `
    <div class="history-prompt-block" data-generation-prompt="${escapeAttr(item.key)}">${escapeHtml(prompt)}</div>
    <div class="history-prompt-actions">
      ${probablyLong ? `<button class="tiny-button" data-toggle-generation-prompt="${escapeAttr(item.key)}" type="button">查看全部</button>` : ""}
      <button class="tiny-button" data-copy-generation-prompt="${escapeAttr(prompt)}" type="button">复制提示词</button>
    </div>
  `;
}

function renderHistoryPreview(item) {
  if (item.type === "video") {
    return `
      <button class="history-video-thumb" data-open-history-video="${escapeAttr(historyVideoToken(item))}" type="button">
        <span class="history-video-play">▶</span>
        <span>${escapeHtml(item.name || fileNameFromUrl(item.url, "video"))}</span>
      </button>
      <button class="tiny-button" data-open-history-video="${escapeAttr(historyVideoToken(item))}" type="button">全屏预览/抽帧</button>
    `;
  }
  if (item.type === "audio") {
    return `<audio class="history-audio-preview" src="${escapeAttr(item.url)}" controls preload="metadata"></audio>`;
  }
  if (item.type === "image") {
    return `
      <a class="preview-link" href="${escapeAttr(item.url)}" target="_blank" rel="noreferrer"><img src="${escapeAttr(item.preview || item.url)}" loading="lazy" decoding="async" alt=""></a>
      ${item.key ? `<button class="tiny-button" data-send-generation-upload="${escapeAttr(item.key)}" type="button">加入上传缓存</button>` : ""}
    `;
  }
  return `<a class="url-line" href="${escapeAttr(item.url)}" target="_blank" rel="noreferrer">打开文件</a>`;
}

function renderHistoryPreview(item) {
  if (item.type === "video") {
    const token = historyVideoToken(item);
    const title = item.name || fileNameFromUrl(item.url, "video");
    return `
      <button class="history-video-thumb" data-open-history-video="${escapeAttr(token)}" type="button" title="${escapeAttr(title)}">
        <video class="history-video-poster" src="${escapeAttr(item.url)}#t=0.1" preload="metadata" muted playsinline></video>
        <span class="history-video-play">▶</span>
        <span>${escapeHtml(title)}</span>
      </button>
      <button class="tiny-button" data-open-history-video="${escapeAttr(token)}" type="button">全屏预览/抽帧</button>
    `;
  }
  if (item.type === "audio") {
    return `<audio class="history-audio-preview" src="${escapeAttr(item.url)}" controls preload="metadata"></audio>`;
  }
  if (item.type === "image") {
    if (item.key) {
      const token = historyMediaToken(item);
      const title = item.name || fileNameFromUrl(item.url, "image");
      return `
        <button class="history-image-thumb" data-open-history-media="${escapeAttr(token)}" type="button" title="${escapeAttr(title)}">
          <img src="${escapeAttr(item.preview || item.url)}" loading="lazy" decoding="async" fetchpriority="low" alt="">
        </button>
        <button class="tiny-button" data-open-history-media="${escapeAttr(token)}" type="button">全屏预览</button>
      `;
    }
    return `
      <a class="preview-link" href="${escapeAttr(item.url)}" target="_blank" rel="noreferrer"><img src="${escapeAttr(item.preview || item.url)}" loading="lazy" decoding="async" fetchpriority="low" alt=""></a>
      ${item.key ? `<button class="tiny-button" data-send-generation-upload="${escapeAttr(item.key)}" type="button">加入上传缓存</button>` : ""}
    `;
  }
  return `<a class="url-line" href="${escapeAttr(item.url)}" target="_blank" rel="noreferrer">打开文件</a>`;
}

function historyMediaToken(item) {
  if (item?.key) return `generation:${item.key}`;
  if (item?.id) return `upload:${item.id}`;
  return `url:${item?.url || ""}`;
}

function historyVideoToken(item) {
  return historyMediaToken(item);
}

function historyMediaItems(type = state.historyType) {
  const targetType = type || state.historyType;
  const source = state.historyTab === "uploads" ? filteredUploadRecords() : filteredGenerationResultItems();
  return source.filter(item => item.type === targetType && item.url).map(item => ({
    token: historyMediaToken(item),
    item,
    title: item.name || fileNameFromUrl(item.url, targetType || "media")
  }));
}

function historyVideoItems() {
  return historyMediaItems("video");
}

function findHistoryMediaByToken(token, preferredType = "") {
  const expectedType = preferredType || "";
  if (String(token || "").startsWith("url:")) {
    const url = String(token).slice(4);
    const generated = generationResultItems().find(item => (!expectedType || item.type === expectedType) && ["image", "video"].includes(item.type) && item.url === url);
    if (generated) return { token: historyMediaToken(generated), item: generated, title: fileNameFromUrl(generated.url, generated.type) };
    const uploaded = state.uploadHistory.find(item => (!expectedType || item.type === expectedType) && ["image", "video"].includes(item.type) && item.url === url);
    if (uploaded) return { token: historyMediaToken(uploaded), item: uploaded, title: uploaded.name || fileNameFromUrl(uploaded.url, uploaded.type) };
    const type = expectedType || guessType(url);
    return { token, item: { type, url, name: fileNameFromUrl(url, type || "media") }, title: fileNameFromUrl(url, type || "media") };
  }
  const current = historyMediaItems(expectedType || state.historyType).find(entry => entry.token === token);
  if (current) return current;
  const uploads = state.uploadHistory
    .filter(item => (!expectedType || item.type === expectedType) && ["image", "video"].includes(item.type) && item.url)
    .map(item => ({ token: historyMediaToken(item), item, title: item.name || fileNameFromUrl(item.url, item.type) }));
  const generated = generationResultItems()
    .filter(item => (!expectedType || item.type === expectedType) && ["image", "video"].includes(item.type) && item.url)
    .map(item => ({ token: historyMediaToken(item), item, title: fileNameFromUrl(item.url, item.type) }));
  return [...uploads, ...generated].find(entry => entry.token === token);
}

function findHistoryVideoByToken(token) {
  return findHistoryMediaByToken(token, "video");
}

function historyMediaNavigationItems(entry, source = "history") {
  const type = entry?.item?.type || state.historyType;
  const filtered = historyMediaItems(type);
  if (source !== "result" && filtered.some(item => item.token === entry?.token || item.item?.url === entry?.item?.url)) {
    return filtered;
  }
  const recordId = entry?.item?.record?.id;
  if (recordId) {
    const sourceRecord = entry.item.record;
    const sourceTime = Number(sourceRecord.createdAt || 0);
    const sameGroup = generationResultItems()
      .filter(item => item.type === type && item.url && isSameGenerationMediaGroup(item.record, sourceRecord, sourceTime))
      .map(item => ({
        token: historyMediaToken(item),
        item,
        title: fileNameFromUrl(item.url, type || "media")
      }));
    if (sameGroup.length > 1) return sameGroup;
  }
  if (filtered.length) return filtered;
  return generationResultItems()
    .filter(item => item.type === type && item.url)
    .map(item => ({
      token: historyMediaToken(item),
      item,
      title: fileNameFromUrl(item.url, type || "media")
    }));
}

function historyVideoNavigationItems(entry) {
  return historyMediaNavigationItems(entry, "history").filter(item => item.item?.type === "video");
}

function isSameGenerationMediaGroup(record, sourceRecord, sourceTime) {
  if (!record || !sourceRecord) return false;
  if (record.id === sourceRecord.id) return true;
  const sameIdentity = String(record.page || "") === String(sourceRecord.page || "")
    && String(record.prompt || "") === String(sourceRecord.prompt || "")
    && String(record.model || "") === String(sourceRecord.model || "")
    && String(record.version || "") === String(sourceRecord.version || "")
    && String(record.size || "") === String(sourceRecord.size || "")
    && String(record.quality || "") === String(sourceRecord.quality || "");
  if (!sameIdentity) return false;
  const createdAt = Number(record.createdAt || 0);
  if (!sourceTime || !createdAt) return true;
  return Math.abs(createdAt - sourceTime) <= 10 * 60 * 1000;
}

function openHistoryVideoViewer(token, source = "history") {
  openHistoryMediaViewer(token, source, "video");
}

function openHistoryMediaViewer(token, source = "history", preferredType = "") {
  const overlay = ensureHistoryVideoOverlay();
  const video = overlay.querySelector("[data-history-viewer-video]");
  const image = overlay.querySelector("[data-history-viewer-image]");
  const title = overlay.querySelector("[data-history-viewer-title]");
  const openLink = overlay.querySelector("[data-history-viewer-open]");
  const captureButton = overlay.querySelector("[data-history-viewer-capture]");
  const deleteButton = overlay.querySelector("[data-history-viewer-delete]");
  const reuseButton = overlay.querySelector("[data-history-viewer-reuse]");
  const detailPanel = overlay.querySelector("[data-history-viewer-details]");
  const prevFrameButton = overlay.querySelector("[data-history-viewer-prev-frame]");
  const nextFrameButton = overlay.querySelector("[data-history-viewer-next-frame]");
  const prevButton = overlay.querySelector("[data-history-viewer-prev]");
  const nextButton = overlay.querySelector("[data-history-viewer-next]");

  const renderToken = nextToken => {
    const firstEntry = findHistoryMediaByToken(nextToken, preferredType);
    const list = firstEntry ? historyMediaNavigationItems(firstEntry, source) : historyMediaItems(preferredType || state.historyType);
    const entry = list.find(item => item.token === nextToken || item.item?.url === firstEntry?.item?.url) || firstEntry;
    if (!entry) return;
    const isVideo = entry.item.type === "video";
    const isImage = entry.item.type === "image";
    overlay.dataset.currentToken = entry.token;
    overlay.dataset.currentSource = source;
    title.textContent = entry.title;
    openLink.href = entry.item.url;
    video.pause();
    if (isVideo) {
      image.removeAttribute("src");
      image.hidden = true;
      video.hidden = false;
      video.src = entry.item.url;
      video.load();
    } else if (isImage) {
      video.removeAttribute("src");
      video.hidden = true;
      image.hidden = false;
      image.src = entry.item.url;
      image.alt = entry.title;
    }
    captureButton.hidden = !isVideo;
    prevFrameButton.hidden = !isVideo;
    nextFrameButton.hidden = !isVideo;
    if (isVideo) captureButton.onclick = () => captureHistoryVideoFrame(video, entry.item, captureButton);
    detailPanel.innerHTML = renderHistoryMediaViewerDetails(entry.item);
    detailPanel.querySelector("[data-history-viewer-copy-prompt]")?.addEventListener("click", () => {
      copyPromptText(String(entry.item?.record?.prompt || ""));
    });
    prevFrameButton.onclick = () => stepHistoryVideoFrame(video, -1);
    nextFrameButton.onclick = () => stepHistoryVideoFrame(video, 1);
    deleteButton.textContent = isImage ? "删除图片" : "删除视频";
    deleteButton.onclick = () => deleteHistoryMediaFromViewer(entry, source);
    const canReuse = Boolean(entry.item?.record && entry.item?.key);
    reuseButton.disabled = !canReuse;
    reuseButton.onclick = () => {
      if (!canReuse) return;
      addGenerationResultToPending(entry.item);
      reuseButton.textContent = "已添加到队列";
      setTimeout(() => {
        reuseButton.textContent = "添加到原任务队列";
      }, 1200);
    };
    const index = list.findIndex(item => item.token === entry.token || item.item?.url === entry.item?.url);
    prevButton.disabled = index <= 0;
    nextButton.disabled = index < 0 || index >= list.length - 1;
    prevButton.onclick = () => {
      if (index > 0) renderToken(list[index - 1].token);
    };
    nextButton.onclick = () => {
      if (index >= 0 && index < list.length - 1) renderToken(list[index + 1].token);
    };
  };

  overlay.classList.add("open");
  renderToken(token);
  overlay.requestFullscreen?.().catch(() => {});
}

function ensureHistoryVideoOverlay() {
  let overlay = document.querySelector(".history-video-overlay");
  if (overlay && !overlay.querySelector("[data-history-viewer-image]")) {
    overlay.remove();
    overlay = null;
  }
  if (overlay) return overlay;
  overlay = document.createElement("div");
  overlay.className = "history-video-overlay";
  overlay.innerHTML = `
    <div class="history-video-viewer">
      <div class="history-video-viewer-head">
        <button class="ghost-button" data-history-viewer-prev type="button">上一个</button>
        <strong class="history-viewer-title" data-history-viewer-title></strong>
        <button class="ghost-button" data-history-viewer-next type="button">下一个</button>
        <button class="ghost-button" data-history-viewer-close type="button">关闭</button>
      </div>
      <video class="history-viewer-video" data-history-viewer-video controls crossorigin="anonymous"></video>
      <img class="history-viewer-image" data-history-viewer-image hidden alt="">
      <div class="history-video-viewer-actions">
        <button class="button" data-history-viewer-capture type="button">抽当前帧到上传缓存</button>
        <a class="ghost-button" data-history-viewer-open href="#" target="_blank" rel="noreferrer">打开原文件</a>
      </div>
    </div>
  `;
  const actionBar = overlay.querySelector(".history-video-viewer-actions");
  if (actionBar) {
    actionBar.innerHTML = `
      <button class="ghost-button" data-history-viewer-prev-frame type="button">上一帧</button>
      <button class="ghost-button" data-history-viewer-next-frame type="button">下一帧</button>
      <button class="button" data-history-viewer-capture type="button">抽当前帧到上传缓存</button>
      <button class="ghost-button" data-history-viewer-reuse type="button">添加到原任务队列</button>
      <button class="ghost-button danger" data-history-viewer-delete type="button">删除视频</button>
      <a class="ghost-button" data-history-viewer-open href="#" target="_blank" rel="noreferrer">打开原文件</a>
    `;
  }
  const viewer = overlay.querySelector(".history-video-viewer");
  if (viewer && !overlay.querySelector("[data-history-viewer-details]")) {
    viewer.insertAdjacentHTML("beforeend", `<div class="history-video-viewer-details" data-history-viewer-details></div>`);
  }
  overlay.addEventListener("click", event => {
    if (event.target === overlay) closeHistoryVideoOverlay(overlay);
  });
  overlay.querySelector("[data-history-viewer-close]").addEventListener("click", () => closeHistoryVideoOverlay(overlay));
  document.addEventListener("keydown", event => {
    if (!overlay.classList.contains("open")) return;
    if (event.key === "Escape") closeHistoryVideoOverlay(overlay);
    if (event.key === "ArrowLeft") overlay.querySelector("[data-history-viewer-prev]")?.click();
    if (event.key === "ArrowRight") overlay.querySelector("[data-history-viewer-next]")?.click();
  });
  document.body.appendChild(overlay);
  return overlay;
}

function renderHistoryMediaViewerDetails(item) {
  if (!item?.record) {
    return `
      <div class="history-viewer-detail-grid">
        <div><strong>来源</strong><span>上传缓存</span></div>
        <div><strong>文件</strong><span>${escapeHtml(item?.name || fileNameFromUrl(item?.url, item?.type || "media"))}</span></div>
      </div>
    `;
  }
  const record = item.record;
  const prompt = String(record.prompt || "").trim();
  const params = [
    ["任务类型", pageLabel(generationPageFromRecord(record))],
    ["模型", record.model || ""],
    ["模型版本", record.version || ""],
    ["尺寸", record.size || ""],
    ["清晰度", record.quality || ""],
    ["时长", record.duration ? `${record.duration}s` : ""],
    ["Seed", record.seed || (Array.isArray(record.returnedSeeds) ? record.returnedSeeds.join(", ") : "")],
    ["任务ID", record.taskId || (Array.isArray(record.taskIds) ? record.taskIds.join(", ") : "")]
  ].filter(([, value]) => String(value || "").trim());
  return `
    <div class="history-viewer-detail-grid">
      ${params.map(([label, value]) => `<div><strong>${escapeHtml(label)}</strong><span>${escapeHtml(value)}</span></div>`).join("")}
    </div>
    <div class="history-viewer-prompt">
      <div class="history-viewer-prompt-head">
        <strong>Prompt</strong>
        <button class="tiny-button" data-history-viewer-copy-prompt type="button" ${prompt ? "" : "disabled"}>复制提示词</button>
      </div>
      <pre>${escapeHtml(prompt || "无 Prompt")}</pre>
    </div>
  `;
}

function renderHistoryVideoViewerDetails(item) {
  return renderHistoryMediaViewerDetails(item);
}

function pageLabel(page) {
  const labels = {
    image: "生图",
    imageVideo: "图文生视频",
    motion: "动作模仿",
    avatar: "数字人",
    multiVideo: "多模态生视频",
    viduRef: "Vidu 参考生视频"
  };
  return labels[page] || page || "未知";
}

function deleteHistoryVideoFromViewer(token) {
  const entry = findHistoryVideoByToken(token);
  if (entry) deleteHistoryMediaFromViewer(entry, "history");
}

function deleteHistoryMediaFromViewer(entry, source = "history") {
  if (!entry) return;
  const typeLabelText = entry.item?.type === "image" ? "图片" : "视频";
  const ok = window.confirm(`确定删除当前${typeLabelText}缓存吗？`);
  if (!ok) return;
  const list = historyMediaNavigationItems(entry, source);
  const index = list.findIndex(item => item.token === entry.token || item.item?.url === entry.item?.url);
  const nextEntry = index >= 0 ? (list[index + 1] || list[index - 1] || null) : null;
  if (entry.item?.key) {
    deleteGenerationResults([entry.item.key], { render: false });
  } else if (entry.item?.id) {
    deleteUploadHistory([entry.item.id], { render: false });
  }
  render();
  if (nextEntry?.item?.url) {
    openHistoryMediaViewer(`url:${nextEntry.item.url}`, source, nextEntry.item.type);
  } else {
    closeHistoryVideoOverlay(document.querySelector(".history-video-overlay"));
  }
}

function stepHistoryVideoFrame(video, direction) {
  if (!video) return;
  const frameStep = 1 / 30;
  video.pause();
  const duration = Number.isFinite(video.duration) ? video.duration : Number.MAX_SAFE_INTEGER;
  const nextTime = Math.min(duration, Math.max(0, Number(video.currentTime || 0) + frameStep * direction));
  video.currentTime = nextTime;
}

function closeHistoryVideoOverlay(overlay) {
  const target = overlay || document.querySelector(".history-video-overlay");
  if (!target) return;
  target.querySelector("[data-history-viewer-video]")?.pause();
  target.classList.remove("open");
  if (document.fullscreenElement === target) {
    document.exitFullscreen?.().catch(() => {});
  }
}

function bindDownloadButtons() {
  document.querySelectorAll("[data-open-history-video], [data-open-history-media]").forEach(button => {
    if (button.dataset.viewerBound === "1") return;
    button.dataset.viewerBound = "1";
    button.addEventListener("click", () => {
      const token = button.dataset.openHistoryMedia || button.dataset.openHistoryVideo;
      openHistoryMediaViewer(token, button.dataset.videoViewerSource || "history");
    });
  });
  document.querySelectorAll("[data-download-url]").forEach(button => {
    button.addEventListener("click", () => {
      downloadUrlInteractive(button.dataset.downloadUrl, button.dataset.downloadName || fileNameFromUrl(button.dataset.downloadUrl));
    });
  });
  document.querySelectorAll("[data-send-result-upload]").forEach(button => {
    button.addEventListener("click", () => {
      const added = sendResultImageUrlToUploadCache(button.dataset.sendResultUpload);
      if (!added) return;
      button.textContent = "已加入";
      button.disabled = true;
    });
  });
}

async function downloadUrlsInteractive(urls, fallback = "download") {
  const list = Array.from(new Set(urls.filter(Boolean)));
  if (!list.length) return;
  if (list.length === 1) {
    await downloadUrlInteractive(list[0], fileNameFromUrl(list[0], fallback));
    return;
  }
  if (!window.showDirectoryPicker) {
    window.alert("当前浏览器不支持批量选择保存文件夹，将改用浏览器默认下载。");
    list.forEach((url, index) => setTimeout(() => triggerUrlDownload(url, fileNameFromUrl(url, fallback)), index * 120));
    return;
  }
  try {
    const directory = await window.showDirectoryPicker({ mode: "readwrite" });
    for (const url of list) {
      await saveUrlToDirectory(url, directory, fileNameFromUrl(url, fallback));
    }
  } catch (error) {
    if (error.name !== "AbortError") {
      window.alert(`批量保存失败：${error.message || error}`);
    }
  }
}

async function downloadUrlInteractive(url, filename = "download") {
  if (!url) return;
  if (!window.showSaveFilePicker) {
    triggerUrlDownload(url, filename);
    return;
  }
  try {
    const blob = await fetchUrlBlob(url);
    const handle = await window.showSaveFilePicker({
      suggestedName: filename,
      types: [{ description: "文件", accept: { [blob.type || "application/octet-stream"]: [fileExtension(filename)] } }]
    });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
  } catch (error) {
    if (error.name === "AbortError") return;
    window.alert(`无法直接保存该文件，可能是 CDN 跨域限制。将改用浏览器默认下载。\n${error.message || error}`);
    triggerUrlDownload(url, filename);
  }
}

async function saveUrlToDirectory(url, directory, filename) {
  const blob = await fetchUrlBlob(url);
  const handle = await directory.getFileHandle(safeFileName(filename), { create: true });
  const writable = await handle.createWritable();
  await writable.write(blob);
  await writable.close();
}

async function fetchUrlBlob(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.blob();
}

function triggerUrlDownload(url, filename) {
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.target = "_blank";
  link.rel = "noreferrer";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function fileNameFromUrl(url, fallback = "download") {
  try {
    const parsed = new URL(url, window.location.href);
    const name = decodeURIComponent(parsed.pathname.split("/").filter(Boolean).pop() || "");
    return safeFileName(name || `${fallback}-${Date.now()}`);
  } catch {
    return safeFileName(`${fallback}-${Date.now()}`);
  }
}

function safeFileName(value) {
  return String(value || "download").replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").slice(0, 180) || "download";
}

function fileExtension(filename) {
  const match = String(filename || "").match(/\.[a-z0-9]{1,8}$/i);
  return match ? match[0] : ".bin";
}

function normalizeTask(data) {
  if (typeof data === "string") {
    const trimmed = data.trim();
    if (trimmed.startsWith("{")) {
      try {
        return normalizeTask(JSON.parse(trimmed));
      } catch {
        return { taskId: trimmed };
      }
    }
    return { taskId: trimmed };
  }
  return {
    taskId: data?.task_id || data?.taskId || data?.id || "",
    taskPath: data?.task_path || data?.taskPath || ""
  };
}

function normalizeResults(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data.flatMap(normalizeResults);
  if (typeof data === "string") return [data];
  if (Array.isArray(data.urls)) return data.urls;
  if (Array.isArray(data.image_urls)) return data.image_urls;
  if (Array.isArray(data.video_urls)) return data.video_urls;
  if (Array.isArray(data.audio_urls)) return data.audio_urls;
  if (Array.isArray(data.results)) return data.results.flatMap(normalizeResults);
  if (data.url) return [data.url];
  if (data.image_url) return [data.image_url];
  if (data.video_url) return [data.video_url];
  if (data.audio_url) return [data.audio_url];
  return [JSON.stringify(data)];
}

function normalizeApiResponseEnvelope(json) {
  if (!json || typeof json !== "object" || Array.isArray(json) || json.success !== undefined) return json;
  const hasCode = json.code !== undefined && json.code !== null;
  const okCode = json.code === 0 || json.code === "0" || json.code === 200 || json.code === "200";
  if (hasCode && !okCode) {
    return {
      ...json,
      success: false,
      message: json.message || json.msg || json.errorMessage || json.error || `接口返回 code=${json.code}`
    };
  }
  if (okCode || json.data !== undefined || json.result !== undefined || json.task_id || json.taskId || json.id || json.url || json.video_url) {
    return {
      ...json,
      success: true,
      data: json.data ?? json.result ?? json
    };
  }
  return json;
}

function extractSeed(data) {
  if (!data) return "";
  if (typeof data !== "object") return "";
  const direct = data.seed ?? data.video_seed ?? data.videoSeed ?? data.generated_seed ?? data.generatedSeed;
  if (direct !== undefined && direct !== null && direct !== "") return direct;
  const containers = [data.data, data.result, data.response, data.output];
  for (const container of containers) {
    const seed = extractSeed(container);
    if (seed !== "") return seed;
  }
  if (Array.isArray(data.results)) {
    for (const item of data.results) {
      const seed = extractSeed(item);
      if (seed !== "") return seed;
    }
  }
  return "";
}

async function postJson(endpoint, payload, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(resolvePostEndpoint(endpoint), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    const text = await response.text();
    let json;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(text || `HTTP ${response.status}`);
    }
    if (!response.ok) throw new Error(formatProviderError(json, `HTTP ${response.status}`));
    return normalizeApiResponseEnvelope(json);
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(`任务超过 ${Math.round(TASK_TIMEOUT_MS / 60000)} 分钟未返回，已判定为生成失败`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function resolvePostEndpoint(endpoint) {
  const value = String(endpoint || "");
  if (/^https?:\/\//i.test(value)) return value;
  if (/^\/api\/runninghub\//i.test(value)) return value;
  return `${apiBase()}${value}`;
}

function apiBase() {
  return (localStorage.getItem(STORAGE_KEYS.apiBase) || API_DEFAULT).replace(/\/+$/, "");
}

function getMaxConcurrency() {
  return Math.max(1, Number(localStorage.getItem(STORAGE_KEYS.maxConcurrency) || 3));
}

function getModel(row) {
  return IMAGE_MODELS[row.model] || IMAGE_MODELS.nano;
}

function getMultiModel(row) {
  return MULTI_VIDEO_MODELS[row.model] || MULTI_VIDEO_MODELS.seedance;
}

function getMultiQualityOptions(row) {
  const model = getMultiModel(row);
  return typeof model.qualitiesFor === "function" ? model.qualitiesFor(row) : model.qualities || [];
}

function getViduRefQualityOptions(row) {
  return VIDU_REF_VIDEO_MODEL.qualitiesFor(row);
}

function getViduRefDurationOptions(row) {
  return VIDU_REF_VIDEO_MODEL.durationsFor(row);
}

function getQualityOptions(row) {
  if (row?.model === "seedream") return getSeedreamQualityOptions(row.version);
  return getModel(row).qualities;
}

function isRowLocked(row) {
  if (!row) return false;
  const hasActiveJobs = row.queuedJobs > 0 || row.runningJobs > 0;
  const partialInProgress = row.status === "partial" && row.totalJobs > 0 && row.finishedJobs + row.canceledJobs < row.totalJobs;
  return row.status === "queued" || row.status === "running" || hasActiveJobs || partialInProgress;
}

function findRow(id) {
  return state.rows.find(row => row.id === id);
}

function findMultiRow(id) {
  return state.multiRows.find(row => row.id === id);
}

function findViduRefRow(id) {
  return state.viduRefRows.find(row => row.id === id);
}

function findImageVideoRow(id) {
  return state.imageVideoRows.find(row => row.id === id);
}

function findMotionRow(id) {
  return state.motionRows.find(row => row.id === id);
}

function findAvatarRow(id) {
  return state.avatarRows.find(row => row.id === id);
}

function persistRows() {
  saveJson(STORAGE_KEYS.imageRows, state.rows);
}

function persistImageVideoRows() {
  saveJson(STORAGE_KEYS.imageVideoRows, state.imageVideoRows);
}

function persistMotionRows() {
  saveJson(STORAGE_KEYS.motionRows, state.motionRows);
}

function persistMultiRows() {
  saveJson(STORAGE_KEYS.multiVideoRows, state.multiRows);
}

function persistViduRefRows() {
  saveJson(STORAGE_KEYS.viduRefRows, state.viduRefRows);
}

function persistAvatarRows() {
  saveJson(STORAGE_KEYS.avatarRows, state.avatarRows);
}

function getStats() {
  return {
    total: state.rows.length,
    running: state.rows.filter(row => row.status === "running" || row.status === "partial").length,
    queued: state.rows.filter(row => row.status === "queued").length,
    done: state.rows.filter(row => row.status === "done").length,
    failed: state.rows.filter(row => row.status === "failed").length
  };
}

function getMultiStats() {
  return {
    total: state.multiRows.length,
    running: state.multiRows.filter(row => row.status === "running" || row.status === "partial").length,
    queued: state.multiRows.filter(row => row.status === "queued").length,
    done: state.multiRows.filter(row => row.status === "done").length,
    failed: state.multiRows.filter(row => row.status === "failed").length
  };
}

function getViduRefStats() {
  return {
    total: state.viduRefRows.length,
    running: state.viduRefRows.filter(row => row.status === "running" || row.status === "partial").length,
    queued: state.viduRefRows.filter(row => row.status === "queued").length,
    done: state.viduRefRows.filter(row => row.status === "done").length,
    failed: state.viduRefRows.filter(row => row.status === "failed").length
  };
}

function getImageVideoStats() {
  return {
    total: state.imageVideoRows.length,
    running: state.imageVideoRows.filter(row => row.status === "running" || row.status === "partial").length,
    queued: state.imageVideoRows.filter(row => row.status === "queued").length,
    done: state.imageVideoRows.filter(row => row.status === "done").length,
    failed: state.imageVideoRows.filter(row => row.status === "failed").length
  };
}

function getMotionStats() {
  return {
    total: state.motionRows.length,
    running: state.motionRows.filter(row => row.status === "running" || row.status === "partial").length,
    queued: state.motionRows.filter(row => row.status === "queued").length,
    done: state.motionRows.filter(row => row.status === "done").length,
    failed: state.motionRows.filter(row => row.status === "failed").length
  };
}

function getAvatarStats() {
  return {
    total: state.avatarRows.length,
    running: state.avatarRows.filter(row => row.status === "running" || row.status === "partial").length,
    queued: state.avatarRows.filter(row => row.status === "queued").length,
    done: state.avatarRows.filter(row => row.status === "done").length,
    failed: state.avatarRows.filter(row => row.status === "failed").length
  };
}

function getImageVideoModel(row) {
  return IMAGE_VIDEO_MODELS[row.model] || IMAGE_VIDEO_MODELS.hailuo;
}

function runningHubModelKey(config) {
  return `rh:${config.id}`;
}

function runningHubConfigByModelKey(modelKey) {
  const key = String(modelKey || "");
  if (!key.startsWith("rh:")) return null;
  const id = key.slice(3);
  return runningHubMotionSettings().configs.find(item => item.id === id) || null;
}

function runningHubWorkflowConfigs(workflowType) {
  return runningHubMotionSettings().configs.filter(config => (config.workflowType || "motion") === workflowType);
}

function runningHubModelFromConfig(config, workflowType) {
  const label = `RH工作流-${config.title || config.webappId || config.id}`;
  return {
    label,
    endpoint: config.endpoint || DEFAULT_RUNNINGHUB_MOTION_CONFIG.endpoint,
    queryEndpoint: config.queryEndpoint || DEFAULT_RUNNINGHUB_MOTION_CONFIG.queryEndpoint,
    async: true,
    versions: [{ label: config.webappId || "RunningHub", value: config.webappId || "" }],
    sizes: workflowType === "motion" ? ["16:9", "9:16", "1:1", ""] : [""],
    qualities: ["默认"],
    build(row) {
      return workflowType === "avatar"
        ? buildRunningHubAvatarPayload(row, config)
        : buildRunningHubMotionPayload(row, config);
    },
    validate() {
      if (!String(config.webappId || "").trim()) return "请先在 RunningHub 配置窗口里填写工作流链接";
      if (!String(config.endpoint || "").trim()) return "请先在 RunningHub 配置窗口里填写提交接口";
      if (/^\/api\/runninghub\/run/i.test(String(config.endpoint || "")) && !runningHubMotionApiKey()) return "请先在 RunningHub 配置窗口里填写 API Key";
      if (!parseRunningHubNodeTemplate(config).length) return "请先在 RunningHub 配置窗口粘贴 payload，拉取该工作流参数";
      return "";
    }
  };
}

function motionModelEntries() {
  const base = Object.entries(MOTION_MODELS).filter(([key]) => key !== "runninghub");
  const rh = runningHubWorkflowConfigs("motion").map(config => [runningHubModelKey(config), runningHubModelFromConfig(config, "motion")]);
  return [...base, ...rh];
}

function avatarModelEntries() {
  const base = Object.entries(AVATAR_MODELS);
  const rh = runningHubWorkflowConfigs("avatar").map(config => [runningHubModelKey(config), runningHubModelFromConfig(config, "avatar")]);
  return [...base, ...rh];
}

function getMotionModel(row) {
  const rhConfig = runningHubConfigByModelKey(row.model);
  if (rhConfig) return runningHubModelFromConfig(rhConfig, "motion");
  if (row.model === "runninghub") return runningHubModelFromConfig(runningHubMotionConfig(), "motion");
  return MOTION_MODELS[row.model] || MOTION_MODELS.kling;
}

function runningHubAssetFieldValue(asset) {
  const url = assetUrl(asset);
  const explicit = asset?.runningHubFileName || asset?.fileName || asset?.filename || asset?.name || "";
  if (explicit && !/^https?:\/\//i.test(explicit)) return explicit;
  try {
    const pathname = new URL(url).pathname;
    const filename = decodeURIComponent(pathname.split("/").filter(Boolean).pop() || "");
    return filename || url;
  } catch {
    return explicit || url;
  }
}

function parseRunningHubNodeTemplate(config) {
  if (Array.isArray(config?.nodeInfoList)) return normalizeRunningHubNodeInfoList({ nodeInfoList: config.nodeInfoList });
  const text = String(config?.nodeInfoList || "").trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    return normalizeRunningHubNodeInfoList(Array.isArray(parsed) ? { nodeInfoList: parsed } : parsed);
  } catch {
    return [];
  }
}

function runningHubBoolean(value) {
  return value ? "true" : "false";
}

function inferRunningHubNodeBinding(item) {
  const text = `${item?.nodeName || ""} ${item?.fieldName || ""} ${item?.description || ""} ${item?.fieldValue || ""}`.toLowerCase();
  if (/prompt|提示词|正向|文本/.test(text)) return "prompt";
  if (/加载帧上限|frame.?limit|max.?frame|frames?|帧数上限/.test(text)) return "frameLimit";
  if (/帧率|fps|frame.?rate/.test(text)) return "fps";
  if (/自定义比例宽|ratio.?w|ratio.?width|比例宽/.test(text)) return "ratioWidth";
  if (/自定义比例高|ratio.?h|ratio.?height|比例高/.test(text)) return "ratioHeight";
  if (/宽高比|aspect|ratio|比例/.test(text)) return "aspectRatio";
  if (/时长|duration|seconds?|time/.test(text)) return "durationSeconds";
  if (/宽度|width|(^|[^a-z])w([^a-z]|$)/.test(text)) return "width";
  if (/高度|height|(^|[^a-z])h([^a-z]|$)/.test(text)) return "height";
  if (looksLikeRunningHubVideoNode(item)) return "referenceVideo";
  if (looksLikeRunningHubAudioNode(item)) return "referenceAudio";
  if (looksLikeRunningHubImageNode(item)) return "referenceImage";
  return "none";
}

function buildRunningHubMotionInputs(row, config) {
  const template = parseRunningHubNodeTemplate(config);
  if (template.length) {
    return template.map(item => ({ ...item }));
  }
  return [
    { nodeId: "535", nodeName: "ImpactSwitch", fieldName: "select", fieldValue: String(config.zipSwitch || "1"), description: "zip不支持cn站" },
    { nodeId: "293", nodeName: "ImpactSwitch", fieldName: "select", fieldValue: String(config.poseMethod || "1"), description: "姿势计算方式" },
    { nodeId: "497", nodeName: "easy boolean", fieldName: "value", fieldValue: runningHubBoolean(config.pose3Neck), description: "姿势3,若脖子长开启（正常关闭）" },
    { nodeId: "297", nodeName: "easy float", fieldName: "value", fieldValue: String(config.poseStrength || "1.0000000000000002"), description: "姿势强度" },
    { nodeId: "370", nodeName: "easy boolean", fieldName: "value", fieldValue: runningHubBoolean(config.cameraEnabled), description: "运镜开关（默认为关闭）" },
    { nodeId: "361", nodeName: "easy float", fieldName: "value", fieldValue: String(config.cameraStrength || "1.0000000000000002"), description: "运镜强度" },
    { nodeId: "271", nodeName: "easy boolean", fieldName: "value", fieldValue: runningHubBoolean(config.helmetMode), description: "面具头盔模式" },
    { nodeId: "265", nodeName: "easy float", fieldName: "value", fieldValue: String(config.expressionStrength || "0.8000000000000002"), description: "表情强度" },
    { nodeId: "266", nodeName: "easy float", fieldName: "value", fieldValue: String(config.chestShake || "0.20000000000000004"), description: "胸部抖动幅度" },
    { nodeId: "499", nodeName: "easy int", fieldName: "value", fieldValue: String(config.skipFrames || "0"), description: "跳过前面多少帧" },
    { nodeId: "422", nodeName: "easy int", fieldName: "value", fieldValue: String(config.frameLimit || "840"), description: "加载帧上限", binding: "frameLimit" },
    { nodeId: "264", nodeName: "easy int", fieldName: "value", fieldValue: String(config.fps || "30"), description: "帧率", binding: "fps" },
    { nodeId: "470", nodeName: "ImpactSwitch", fieldName: "select", fieldValue: String(config.resolutionSelect || "2"), description: "分辨率(推荐默认)" },
    { nodeId: "452", nodeName: "easy boolean", fieldName: "value", fieldValue: runningHubBoolean(config.customRatioEnabled), description: "开启自定义比例" },
    { nodeId: "451", nodeName: "easy int", fieldName: "value", fieldValue: String(config.customRatioWidth || "9"), description: "自定义比例宽", binding: "ratioWidth" },
    { nodeId: "450", nodeName: "easy int", fieldName: "value", fieldValue: String(config.customRatioHeight || "16"), description: "自定义比例高", binding: "ratioHeight" },
    { nodeId: "275", nodeName: "VHS_LoadVideo", fieldName: "video", fieldValue: runningHubAssetFieldValue(row.video), description: "加载参考视频", binding: "referenceVideo" },
    { nodeId: "299", nodeName: "LoadImage", fieldName: "image", fieldValue: runningHubAssetFieldValue(row.image), description: "加载参考图片", binding: "referenceImage" }
  ];
}

function looksLikeRunningHubImageNode(item) {
  const text = `${item?.nodeName || ""} ${item?.fieldName || ""} ${item?.description || ""} ${item?.fieldValue || ""}`.toLowerCase();
  return /(^|[^a-z])image([^a-z]|$)|loadimage|图片|参考图|加载参考图片|\.(png|jpe?g|webp)(\?|$)/i.test(text);
}

function looksLikeRunningHubVideoNode(item) {
  const text = `${item?.nodeName || ""} ${item?.fieldName || ""} ${item?.description || ""} ${item?.fieldValue || ""}`.toLowerCase();
  return /(^|[^a-z])video([^a-z]|$)|vhs_loadvideo|视频|参考视频|加载参考视频|\.(mp4|mov|webm|m4v)(\?|$)/i.test(text);
}

function looksLikeRunningHubAudioNode(item) {
  const text = `${item?.nodeName || ""} ${item?.fieldName || ""} ${item?.description || ""} ${item?.fieldValue || ""}`.toLowerCase();
  return /(^|[^a-z])(audio|voice)([^a-z]|$)|音频|声音|音色|语音|配音|\.(mp3|wav|m4a|aac|flac)(\?|$)/i.test(text);
}

async function uploadRunningHubAsset(asset, apiKey, kind) {
  const url = assetUrl(asset);
  if (!url) return "";
  if (asset?.runningHubFileName) return asset.runningHubFileName;
  if (!String(apiKey || "").trim()) return runningHubAssetFieldValue(asset);
  const response = await fetch("/api/runninghub/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey, url, kind })
  });
  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(text || `RunningHub ${kind} 上传失败`);
  }
  if (!response.ok || json.success === false) {
    throw new Error(json.message || json.error || `RunningHub ${kind} 上传失败`);
  }
  const fileName = json.fileName || json.data?.fileName || json.data?.file_name || "";
  if (!fileName) throw new Error(`RunningHub ${kind} 上传返回缺少 fileName`);
  asset.runningHubFileName = fileName;
  return fileName;
}

function gcdNumber(a, b) {
  let x = Math.abs(Math.round(Number(a) || 0));
  let y = Math.abs(Math.round(Number(b) || 0));
  while (y) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x || 1;
}

function runningHubPrimaryAsset(assets) {
  return assets.video || assets.image || assets.audio || null;
}

function runningHubRatioFromAsset(asset, row) {
  const width = Number(asset?.width || 0);
  const height = Number(asset?.height || 0);
  if (width > 0 && height > 0) {
    const divisor = gcdNumber(width, height);
    return { width: Math.round(width / divisor), height: Math.round(height / divisor), text: `${Math.round(width / divisor)}:${Math.round(height / divisor)}` };
  }
  const match = String(row?.size || "").match(/^(\d+)\s*:\s*(\d+)$/);
  if (match) return { width: Number(match[1]), height: Number(match[2]), text: `${match[1]}:${match[2]}` };
  return { width: "", height: "", text: String(row?.size || "") };
}

function runningHubDurationSeconds(row, assets) {
  const rowDuration = Number(row?.duration || 0);
  if (rowDuration > 0) return rowDuration;
  const assetDuration = Number(assets.video?.duration || assets.audio?.duration || runningHubPrimaryAsset(assets)?.duration || 0);
  return assetDuration > 0 ? assetDuration : 0;
}

function cleanRunningHubNumber(value, fallback = "") {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Number.isInteger(number) ? String(number) : String(Number(number.toFixed(3)));
}

function buildRunningHubRuntimeContext(row, assets, uploads, config) {
  const primary = runningHubPrimaryAsset(assets);
  const ratio = runningHubRatioFromAsset(primary, row);
  const fps = Number(row?.fps || config?.fps || 30) || 30;
  const duration = runningHubDurationSeconds(row, assets);
  const width = Number(primary?.width || 0);
  const height = Number(primary?.height || 0);
  return {
    prompt: row?.prompt || "",
    referenceImage: uploads.image || "",
    referenceVideo: uploads.video || "",
    referenceAudio: uploads.audio || "",
    durationSeconds: duration > 0 ? cleanRunningHubNumber(duration) : "",
    frameLimit: duration > 0 ? String(Math.max(1, Math.ceil(duration * fps))) : "",
    fps: String(fps),
    width: width > 0 ? String(Math.round(width)) : "",
    height: height > 0 ? String(Math.round(height)) : "",
    ratioWidth: ratio.width !== "" ? String(ratio.width) : "",
    ratioHeight: ratio.height !== "" ? String(ratio.height) : "",
    aspectRatio: ratio.text || "",
    size: row?.size || ratio.text || ""
  };
}

function valueForRunningHubBinding(binding, context) {
  const key = RUNNINGHUB_NODE_BINDINGS[binding] ? binding : "none";
  if (key === "none") return undefined;
  const value = context[key];
  return value === undefined || value === null || value === "" ? undefined : String(value);
}

async function resolveRunningHubWorkflowInputs(row, config, assets = {}) {
  const apiKey = runningHubMotionApiKey();
  const uploads = {
    image: assets.image ? await uploadRunningHubAsset(assets.image, apiKey, "image") : "",
    video: assets.video ? await uploadRunningHubAsset(assets.video, apiKey, "video") : "",
    audio: assets.audio ? await uploadRunningHubAsset(assets.audio, apiKey, "audio") : ""
  };
  const context = buildRunningHubRuntimeContext(row, assets, uploads, config);
  return buildRunningHubMotionInputs(row, config).map(item => {
    const binding = item.binding || inferRunningHubNodeBinding(item);
    const boundValue = valueForRunningHubBinding(binding, context);
    if (boundValue !== undefined) return { ...item, fieldValue: boundValue };
    if (uploads.audio && looksLikeRunningHubAudioNode(item)) return { ...item, fieldValue: uploads.audio };
    if (uploads.video && looksLikeRunningHubVideoNode(item)) return { ...item, fieldValue: uploads.video };
    if (uploads.image && looksLikeRunningHubImageNode(item)) return { ...item, fieldValue: uploads.image };
    return { ...item };
  });
}

async function buildRunningHubPayload(row, config, assets) {
  const webappId = String(config.webappId || DEFAULT_RUNNINGHUB_MOTION_CONFIG.webappId);
  const nodeInfoList = await resolveRunningHubWorkflowInputs(row, config, assets);
  const common = {
    nodeInfoList,
    instanceType: String(config.instanceType || DEFAULT_RUNNINGHUB_MOTION_CONFIG.instanceType),
    usePersonalQueue: Boolean(config.usePersonalQueue)
  };
  if (String(config.retainSeconds || "").trim()) common.retainSeconds = Number(config.retainSeconds);
  if (String(config.webhookUrl || "").trim()) common.webhookUrl = String(config.webhookUrl).trim();

  if (/^\/api\/runninghub\/run/i.test(String(config.endpoint || ""))) {
    return {
      apiKey: runningHubMotionApiKey(),
      appId: webappId,
      requestBody: common,
      nodeInfoList
    };
  }

  const payload = {
    webappId,
    apiKey: runningHubMotionApiKey(),
    inputs: nodeInfoList,
    nodeInfoList,
    clientId: String(config.clientId || DEFAULT_RUNNINGHUB_MOTION_CONFIG.clientId),
    instanceType: common.instanceType,
    usePersonalQueue: common.usePersonalQueue
  };
  if (common.retainSeconds !== undefined) payload.retainSeconds = common.retainSeconds;
  if (common.webhookUrl) payload.webhookUrl = common.webhookUrl;
  return payload;
}

async function buildRunningHubMotionPayload(row, config = runningHubMotionConfig()) {
  return buildRunningHubPayload(row, config, { image: row.image, video: row.video });
}

async function buildRunningHubAvatarPayload(row, config = runningHubMotionConfig()) {
  return buildRunningHubPayload(row, config, { image: row.image, audio: row.audio });
}

function getAvatarModel(row) {
  const rhConfig = runningHubConfigByModelKey(row.model);
  if (rhConfig) return runningHubModelFromConfig(rhConfig, "avatar");
  return AVATAR_MODELS[row.model] || AVATAR_MODELS.jimeng;
}

function avatarEndpoint(modelKey, kind) {
  const normalizedModel = modelKey === "kling" ? "kling" : "jimeng";
  const keyMap = {
    jimeng: {
      create: STORAGE_KEYS.avatarJimengCreate,
      query: STORAGE_KEYS.avatarJimengQuery
    },
    kling: {
      create: STORAGE_KEYS.avatarKlingCreate,
      query: STORAGE_KEYS.avatarKlingQuery
    }
  };
  const model = AVATAR_MODELS[normalizedModel];
  const fallback = kind === "query" ? model.queryEndpoint : model.endpoint;
  return normalizeEndpointPath(localStorage.getItem(keyMap[normalizedModel][kind]) || fallback);
}

function supportsImageVideoLastFrame(row) {
  const model = getImageVideoModel(row);
  return typeof model.supportsLastFrame === "function" ? model.supportsLastFrame(row.version, row) : Boolean(model.supportsLastFrame);
}

function supportsImageVideoAutoMultiShot(row) {
  const model = getImageVideoModel(row);
  return typeof model.supportsAutoMultiShot === "function" ? model.supportsAutoMultiShot(row) : Boolean(model.supportsAutoMultiShot);
}

function getImageVideoSizeOptions(row) {
  const model = getImageVideoModel(row);
  return typeof model.sizesFor === "function" ? model.sizesFor(row) : model.sizes;
}

function resolvedImageVideoSize(row) {
  const options = (getImageVideoSizeOptions(row) || []).filter(Boolean);
  if (!options.length) return "";
  if (row.size) return chooseCompatibleOption(row.size, options, options[0] || "");
  return inferAspectOptionFromAssets([row.firstFrame, row.lastFrame], options);
}

function resolvedViduRefSize(row) {
  const options = (VIDU_REF_VIDEO_MODEL.sizes || []).filter(Boolean);
  if (!options.length) return "";
  if (row.size) return chooseCompatibleOption(row.size, options, options[0] || "");
  return inferAspectOptionFromAssets(row.refs || [], options);
}

function inferAspectOptionFromAssets(assets, options) {
  const asset = normalizeAssets(assets || []).find(item => Number(item.width) > 0 && Number(item.height) > 0);
  if (!asset) return "";
  const ratio = `${Number(asset.width)}:${Number(asset.height)}`;
  return chooseCompatibleOption(ratio, options, "");
}

function getImageVideoQualityOptions(row) {
  const model = getImageVideoModel(row);
  return typeof model.qualitiesFor === "function" ? model.qualitiesFor(row) : model.qualities;
}

function getImageVideoDurationOptions(row) {
  const model = getImageVideoModel(row);
  return typeof model.durationsFor === "function" ? model.durationsFor(row) : model.durations;
}

function isMultiRowLocked(row) {
  return isRowLocked(row);
}

function isViduRefRowLocked(row) {
  return isRowLocked(row);
}

function isImageVideoRowLocked(row) {
  return isRowLocked(row);
}

function isMotionRowLocked(row) {
  return isRowLocked(row);
}

function isAvatarRowLocked(row) {
  return isRowLocked(row);
}

function validateImageVideoRowBeforeQueue(row) {
  const resolvedSize = resolvedImageVideoSize(row);
  if (!row.size) row.size = resolvedSize;
  if (!String(row.prompt || "").trim()) return "Prompt 不能为空";
  const model = getImageVideoModel(row);
  if (!model.supportsTextOnly && !row.firstFrame?.url) {
    return `${model.label} 图文生视频必须提供首帧图，不能纯文生视频`;
  }
  if (row.lastFrame?.url && !supportsImageVideoLastFrame(row)) {
    return `${model.label} 当前模型版本不支持尾帧图，已禁用尾帧`;
  }
  if (model.supportsFirstFrame === false && row.firstFrame?.url) {
    return `${model.label} 当前模型版本不支持首帧图`;
  }
  if (!getImageVideoSizeOptions(row).includes(row.size)) return `${model.label} 不支持尺寸 ${row.size || "空"}`;
  if (!getImageVideoQualityOptions(row).includes(row.quality)) return `${model.label} 不支持清晰度 ${row.quality || "空"}`;
  if (!getImageVideoDurationOptions(row).includes(String(row.duration))) return `${model.label} 不支持时长 ${row.duration || "空"}`;
  return model.validate ? model.validate(row) || "" : "";
}

function validateMotionRowBeforeQueue(row) {
  if (!assetUrl(row.image)) return "动作模仿必须提供人物图";
  if (!assetUrl(row.video)) return "动作模仿必须提供参考视频";
  const model = getMotionModel(row);
  if (!model.sizes.includes(row.size)) return `${model.label} 不支持尺寸 ${row.size || "空"}`;
  if (!model.qualities.includes(row.quality)) return `${model.label} 不支持清晰度 ${row.quality || "空"}`;
  return model.validate ? model.validate(row) || "" : "";
}

function validateAvatarRowBeforeQueue(row) {
  if (!assetUrl(row.image)) return "数字人必须提供人物图片";
  if (!assetUrl(row.audio)) return "数字人必须提供音频";
  const model = getAvatarModel(row);
  if (!model.versions.some(version => version.value === row.version)) return `${model.label} 不支持模型版本 ${row.version || "空"}`;
  return model.validate ? model.validate(row) || "" : "";
}

function validateViduRefRowBeforeQueue(row) {
  if (!row.size) row.size = resolvedViduRefSize(row);
  if (!String(row.prompt || "").trim()) return "Prompt 不能为空";
  const refs = normalizeAssets(row.refs || []).filter(asset => asset.type === "image" && asset.url);
  if (!refs.length) return "Vidu参考生视频必须提供至少 1 张参考图";
  if (refs.length > VIDU_REF_VIDEO_MODEL.maxRefs) return `Vidu参考图最多 ${VIDU_REF_VIDEO_MODEL.maxRefs} 张`;
  if (!VIDU_REF_VIDEO_MODEL.versions.some(version => version.value === row.version)) return `Vidu 只允许 Q3 版本：VQ3-Pro / VQ3-Turbo`;
  if (!VIDU_REF_VIDEO_MODEL.sizes.includes(row.size)) return `Vidu 不支持尺寸 ${row.size || "空"}`;
  if (!getViduRefQualityOptions(row).includes(row.quality)) return `Vidu ${row.version} 不支持清晰度 ${row.quality || "空"}`;
  if (!getViduRefDurationOptions(row).includes(String(row.duration))) return `Vidu ${row.version} 不支持时长 ${row.duration || "空"}`;
  if (String(row.seed || "").trim() && !Number.isInteger(Number(row.seed))) return "Seed 必须是整数，或留空随机";
  return "";
}

function validateMultiRowBeforeQueue(row) {
  const model = getMultiModel(row);
  const validationError = model.validate(row);
  if (validationError) return validationError;
  if (!row.prompt.trim()) return "Prompt 不能为空";
  if (row.model === "seedance") {
    const oversized = normalizeAssets(row.refs || []).find(asset => {
      const pixels = Number(asset.width || 0) * Number(asset.height || 0);
      return asset.type === "video" && pixels > SEEDANCE_FAST_VIDEO_PIXEL_LIMIT;
    });
    if (oversized) {
      const pixels = Number(oversized.width || 0) * Number(oversized.height || 0);
      return `Seedance 的参考视频像素数不能超过 ${SEEDANCE_FAST_VIDEO_PIXEL_LIMIT}，当前 ${oversized.width}x${oversized.height}=${pixels}。请重新上传原视频让页面自动压缩，或先把视频压缩/裁切后再提交。`;
    }
  }
  return "";
}

function buildSeedance2Payload(row) {
  const refs = normalizeAssets(row.refs || []).filter(asset => asset.url);
  const labels = buildSeedance2ReferenceLabels(refs);
  const prompt = withSeedance2ReferenceGuide(normalizeSeedance2Prompt(row.prompt, labels), labels);
  const payload = {
    prompt: prompt || undefined,
    generate_audio: true,
    ratio: row.size || undefined,
    duration: Number(row.duration || 5),
    resolution: row.quality || undefined,
    web_search: false
  };
  const images = refs.filter(asset => asset.type === "image").map(asset => asset.url);
  const videos = refs.filter(asset => asset.type === "video").map(asset => asset.url);
  const audios = refs.filter(asset => asset.type === "audio").map(asset => asset.url);
  if (images.length) payload.reference_images = images;
  if (videos.length) {
    payload.reference_videos = videos;
    payload.video_urls = videos;
    payload.reference_video_urls = videos;
  }
  if (audios.length) payload.reference_audios = audios;
  if (row.version) payload.model_name = row.version;
  return payload;
}

function buildSeedance2ReferenceLabels(refs) {
  const counts = { image: 0, video: 0, audio: 0, other: 0 };
  return refs.map((asset, index) => {
    const type = ["image", "video", "audio"].includes(asset.type) ? asset.type : "other";
    counts[type] += 1;
    const prefix = type === "image" ? "图片" : type === "video" ? "视频" : type === "audio" ? "音频" : "素材";
    return {
      token: `@${index + 1}`,
      label: `${prefix}${counts[type]}`,
      type,
      url: asset.url,
      name: asset.name || ""
    };
  });
}

function normalizeSeedance2Prompt(prompt, labels) {
  let text = String(prompt || "").trim();
  const allLabels = labels.map(item => item.label).join("、");
  if (allLabels) {
    text = text.replace(/@@/g, allLabels).replace(/@all\b/gi, allLabels);
  }
  labels.forEach((item, index) => {
    text = text.replace(new RegExp(`@${index + 1}(?!\\d)`, "g"), item.label);
  });
  return text
    .replace(/<<image_(\d+)>>/g, "图片$1")
    .replace(/<<video_(\d+)>>/g, "视频$1")
    .replace(/<<audio_(\d+)>>/g, "音频$1");
}

function withSeedance2ReferenceGuide(prompt, labels) {
  if (!labels.some(item => item.type === "video")) return prompt;
  const guide = labels
    .filter(item => item.type === "image" || item.type === "video" || item.type === "audio")
    .map(item => `${item.token}=${item.label}`)
    .join("；");
  if (!guide) return prompt;
  return `${prompt}\n素材映射：${guide}。请严格参考提示词中指定的视频素材。`;
}

function seedanceContentItem(reference) {
  if (reference.type === "image") return { type: "image_url", image_url: { url: reference.url } };
  if (reference.type === "video") return { type: "video_url", video_url: { url: reference.url } };
  if (reference.type === "audio") return { type: "audio_url", audio_url: { url: reference.url } };
  return { type: "file_url", file_url: { url: reference.url } };
}

function buildSeedanceContent(row, references) {
  const prompt = String(row.prompt || "");
  const refs = normalizeAssets(row.refs || []).map((asset, index) => ({
    ...references[index],
    name: asset.name || "",
    index
  })).filter(item => item.url);
  if (!prompt.trim()) return refs.map(seedanceContentItem);

  const content = [];
  const used = new Set();
  const pattern = /@(\d+|[^\s@，。,.；;：:!！?？、（）()【\]\[\]<>《》]+)/g;
  let cursor = 0;
  let match;
  while ((match = pattern.exec(prompt))) {
    const before = prompt.slice(cursor, match.index);
    if (before.trim()) content.push({ type: "text", text: before });
    const ref = findSeedanceReference(match[1], refs);
    if (ref) {
      content.push(seedanceContentItem(ref));
      used.add(ref.index);
    } else {
      content.push({ type: "text", text: match[0] });
    }
    cursor = pattern.lastIndex;
  }
  const tail = prompt.slice(cursor);
  if (tail.trim()) content.push({ type: "text", text: tail });

  if (!used.size) {
    return [{ type: "text", text: prompt }, ...refs.map(seedanceContentItem)];
  }
  return content.length ? content : [{ type: "text", text: prompt }];
}

function findSeedanceReference(token, refs) {
  const raw = String(token || "").trim();
  const index = Number(raw);
  if (Number.isInteger(index) && index >= 1 && index <= refs.length) return refs[index - 1];
  const wanted = normalizeMentionToken(raw);
  return refs.find(ref => {
    const name = normalizeMentionToken(ref.name || "");
    const shortName = normalizeMentionToken(String(ref.name || "").replace(/\.[^.]+$/, ""));
    const urlName = normalizeMentionToken(fileNameFromUrl(ref.url || "", ""));
    return name === wanted || shortName === wanted || urlName === wanted;
  }) || null;
}

function normalizeMentionToken(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, "");
}

function buildSeedanceContent(row, references) {
  const prompt = String(row.prompt || "");
  const refs = normalizeAssets(row.refs || []).map((asset, index) => ({
    ...references[index],
    name: asset.name || "",
    index
  })).filter(item => item.url);
  if (!prompt.trim()) return refs.map(seedanceContentItem);

  const content = [];
  const used = new Set();
  const pattern = /@([A-Za-z0-9._-]+)/g;
  let cursor = 0;
  let match;
  while ((match = pattern.exec(prompt))) {
    const before = prompt.slice(cursor, match.index);
    if (before.trim()) content.push({ type: "text", text: before });
    const ref = findSeedanceReference(match[1], refs);
    if (ref) {
      content.push(seedanceContentItem(ref));
      used.add(ref.index);
    } else {
      content.push({ type: "text", text: match[0] });
    }
    cursor = pattern.lastIndex;
  }
  const tail = prompt.slice(cursor);
  if (tail.trim()) content.push({ type: "text", text: tail });

  if (!used.size) {
    return [{ type: "text", text: prompt }, ...refs.map(seedanceContentItem)];
  }
  return content.length ? content : [{ type: "text", text: prompt }];
}

function findSeedanceReference(token, refs) {
  const raw = String(token || "").trim();
  const index = Number(raw);
  if (Number.isInteger(index) && index >= 1 && index <= refs.length) return refs[index - 1];
  const wanted = normalizeMentionToken(raw);
  return refs.find(ref => {
    const name = normalizeMentionToken(ref.name || "");
    const shortName = normalizeMentionToken(String(ref.name || "").replace(/\.[^.]+$/, ""));
    const urlName = normalizeMentionToken(fileNameFromUrl(ref.url || "", ""));
    return name === wanted || shortName === wanted || urlName === wanted;
  }) || null;
}

function decorateReferenceMentions(tr, dropSelector = ".reference-drop") {
  const textarea = tr.querySelector(".prompt-input");
  tr.querySelectorAll(`${dropSelector} .asset-chip`).forEach((chip, index) => {
    let badge = chip.querySelector(".asset-mention");
    if (!badge) {
      chip.insertAdjacentHTML("afterbegin", `<button class="asset-mention" type="button">@${index + 1}</button>`);
      badge = chip.querySelector(".asset-mention");
    }
    badge.textContent = `@${index + 1}`;
    badge.title = "点击插入到 Prompt";
    badge.draggable = true;
    badge.ondragstart = event => {
      const token = `@${index + 1}`;
      event.stopPropagation();
      event.dataTransfer.effectAllowed = "copyMove";
      event.dataTransfer.setData("text/plain", token);
      event.dataTransfer.setData("application/x-api-mention", token);
    };
    badge.onclick = event => {
      event.preventDefault();
      event.stopPropagation();
      if (textarea && !textarea.disabled) insertMentionIntoPrompt(textarea, `@${index + 1}`);
    };
  });
}

function insertMentionIntoPrompt(textarea, token) {
  const start = textarea.selectionStart ?? textarea.value.length;
  const end = textarea.selectionEnd ?? start;
  const before = textarea.value.slice(0, start);
  const after = textarea.value.slice(end);
  const prefix = before && !/\s$/.test(before) ? " " : "";
  const suffix = after && !/^\s/.test(after) ? " " : "";
  textarea.value = `${before}${prefix}${token}${suffix}${after}`;
  const nextPos = before.length + prefix.length + token.length + suffix.length;
  textarea.focus();
  textarea.setSelectionRange(nextPos, nextPos);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

function scrollToPendingMultiRow() {
  const rowId = state.scrollToMultiRowId;
  if (!rowId) return;
  state.scrollToMultiRowId = null;
  scrollToRenderedRow(`tr[data-multi-row-id="${CSS.escape(rowId)}"]`);
}

function scrollToPendingViduRefRow() {
  const rowId = state.scrollToViduRefRowId;
  if (!rowId) return;
  state.scrollToViduRefRowId = null;
  scrollToRenderedRow(`tr[data-vidu-ref-row-id="${CSS.escape(rowId)}"]`);
}

function scrollToPendingImageVideoRow() {
  const rowId = state.scrollToImageVideoRowId;
  if (!rowId) return;
  state.scrollToImageVideoRowId = null;
  scrollToRenderedRow(`tr[data-image-video-row-id="${CSS.escape(rowId)}"]`);
}

function scrollToPendingMotionRow() {
  const rowId = state.scrollToMotionRowId;
  if (!rowId) return;
  state.scrollToMotionRowId = null;
  scrollToRenderedRow(`tr[data-motion-row-id="${CSS.escape(rowId)}"]`);
}

function scrollToPendingAvatarRow() {
  const rowId = state.scrollToAvatarRowId;
  if (!rowId) return;
  state.scrollToAvatarRowId = null;
  scrollToRenderedRow(`tr[data-avatar-row-id="${CSS.escape(rowId)}"]`);
}

function scrollToPendingImageRow() {
  const rowId = state.scrollToImageRowId;
  if (!rowId) return;
  state.scrollToImageRowId = null;
  scrollToRenderedRow(`tr[data-row-id="${CSS.escape(rowId)}"]`);
}

function scrollToRenderedRow(selector) {
  requestAnimationFrame(() => {
    const row = document.querySelector(selector);
    if (!row) return;
    row.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    row.classList.add("row-focus-flash");
    setTimeout(() => row.classList.remove("row-focus-flash"), 1400);
  });
}

function mergeAssets(existing, incoming, max) {
  const map = new Map(existing.map(item => [item.url, item]));
  incoming.forEach(item => map.set(item.url, { ...item, id: item.id || uid("asset") }));
  return Array.from(map.values()).slice(0, max);
}

function cloneAssets(items) {
  return items.map(item => ({ ...item }));
}

function withPromptHints(row) {
  const hints = [];
  const model = getModel(row);
  if (model.promptOnly?.includes("size") && row.size) hints.push(`尺寸 ${row.size}`);
  if (model.promptOnly?.includes("quality") && row.quality) hints.push(`清晰度 ${row.quality}`);
  return hints.length ? `${row.prompt}\n${hints.join("，")}` : row.prompt;
}

function normalizeGptQuality(value) {
  return {
    "1K": "low",
    "2K": "medium",
    "4K": "high",
    low: "low",
    medium: "medium",
    high: "high",
    auto: "auto"
  }[value] || "medium";
}

function normalizeGptQualityChoice(value) {
  return {
    low: "1K",
    medium: "2K",
    high: "4K",
    "1K": "1K",
    "2K": "2K",
    "4K": "4K",
    auto: "auto"
  }[value] || "2K";
}

function normalizeGptRatioChoice(value) {
  const sizeToRatio = {
    "1024x1024": "1:1",
    "2048x2048": "1:1",
    "2880x2880": "1:1",
    "2048x1152": "16:9",
    "3840x2160": "16:9",
    "2160x3840": "9:16"
  };
  const raw = String(value || "").trim();
  const lower = raw.toLowerCase();
  if (sizeToRatio[lower]) return sizeToRatio[lower];
  if (IMAGE_MODELS.gpt.sizes.includes(raw)) return raw;
  return chooseCompatibleOption(raw, IMAGE_MODELS.gpt.sizes, "1:1");
}

function normalizeGptSize(ratioValue, qualityValue) {
  const ratio = normalizeGptRatioChoice(ratioValue);
  const quality = normalizeGptQualityChoice(qualityValue);
  if (ratio === "auto" || quality === "auto") return "auto";
  const sizeMap = {
    "1K": {
      "21:9": "1568x672",
      "16:9": "1280x720",
      "9:16": "720x1280",
      "4:3": "1152x864",
      "5:4": "1120x896",
      "1:1": "1024x1024",
      "3:4": "864x1152"
    },
    "2K": {
      "21:9": "2016x864",
      "16:9": "2048x1152",
      "9:16": "1152x2048",
      "4:3": "2048x1536",
      "5:4": "2000x1600",
      "1:1": "2048x2048",
      "3:4": "1536x2048"
    },
    "4K": {
      "21:9": "3808x1632",
      "16:9": "3840x2160",
      "9:16": "2160x3840",
      "4:3": "3264x2448",
      "5:4": "3200x2560",
      "1:1": "2880x2880",
      "3:4": "2448x3264"
    }
  };
  return sizeMap[quality]?.[ratio] || "1024x1024";
}

function getSeedreamQualityOptions(version) {
  if (version === "seedream-5.0") return ["2K", "3K"];
  if (version === "seedream-4.5") return ["2K", "4K"];
  return ["1K", "2K", "4K"];
}

function normalizeSeedreamQuality(value, version) {
  const normalized = {
    "1K": "1K",
    "2K": "2K",
    "3K": "3K",
    "4K": "4K",
    "1k": "1K",
    "2k": "2K",
    "3k": "3K",
    "4k": "4K"
  }[value] || "2K";
  const options = getSeedreamQualityOptions(version);
  return options.includes(normalized) ? normalized : options[0];
}

function normalizeSeedreamSize(value, version) {
  const quality = normalizeSeedreamQuality(value, version);
  return {
    "2K": "2k",
    "3K": "3k",
    "4K": "4k"
  }[quality] || "";
}

function normalizeKlingResolution(value) {
  return {
    "1K": "1k",
    "2K": "2k",
    "1k": "1k",
    "2k": "2k"
  }[value] || "1k";
}

function assetMeta(item) {
  if (item.type === "image") return item.width && item.height ? `图片 ${item.width}x${item.height}` : "图片";
  if (item.type === "video") {
    const size = item.width && item.height ? `${item.width}x${item.height}` : "";
    const compressed = item.compressedFrom ? "已压缩" : "";
    return `视频 ${[size, formatDuration(item.duration), compressed].filter(Boolean).join(" ")}`;
  }
  if (item.type === "audio") return `音频 ${formatDuration(item.duration)}`;
  return "文件";
}

function typeLabel(type) {
  return { image: "图片", video: "视频", audio: "音频", other: "其他" }[type] || type;
}

function formatDuration(value) {
  if (!Number.isFinite(value)) return "";
  const total = Math.round(value);
  const minutes = Math.floor(total / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function shortUrl(url) {
  try {
    const parsed = new URL(url);
    const file = parsed.pathname.split("/").filter(Boolean).pop() || parsed.hostname;
    return file.length > 32 ? `${file.slice(0, 16)}...${file.slice(-10)}` : file;
  } catch {
    return String(url).slice(0, 40);
  }
}

function exportJson() {
  download(`api-console-${Date.now()}.json`, JSON.stringify({ rows: state.rows, multiRows: state.multiRows, viduRefRows: state.viduRefRows, avatarRows: state.avatarRows, subjectLibrary: state.subjectLibrary, subjectCreateState: state.subjectCreateState, uploadHistory: state.uploadHistory, generationHistory: state.generationHistory }, null, 2), "application/json");
}

function exportCsv() {
  const headers = ["index", "status", "prompt", "model", "version", "size", "quality", "count", "images", "taskIds", "results"];
  const lines = [headers.join(",")];
  state.rows.forEach((row, index) => {
    const values = {
      index: index + 1,
      ...row,
      images: row.images.map(item => item.url).join("\n"),
      taskIds: row.taskIds.join("\n"),
      results: row.results.join("\n")
    };
    lines.push(headers.map(key => csvCell(values[key] ?? "")).join(","));
  });
  download(`api-console-${Date.now()}.csv`, lines.join("\n"), "text/csv;charset=utf-8");
}

function csvCell(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function parseBatchPrompts(text) {
  const normalized = String(text || "").replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];
  return uniquePrompts(
    parsePromptBlocks(normalized) ||
    parseHTablePrompts(normalized) ||
    parseDelimitedPrompts(normalized) ||
    parseLinePrompts(normalized)
  );
}

function parsePromptBlocks(text) {
  const blocks = [];
  const tagged = /<<<PROMPT(?:\s+[^\n>]*)?\n([\s\S]*?)\nPROMPT>>>/gi;
  let match;
  while ((match = tagged.exec(text))) {
    const prompt = cleanPrompt(match[1]);
    if (prompt) blocks.push(prompt);
  }
  if (blocks.length) return blocks;

  const delimiter = /^(?:---|===)\s*PROMPT(?:\s+\S+)?\s*(?:---|===)?$/gim;
  const parts = text.split(delimiter).map(cleanPrompt).filter(Boolean);
  return parts.length > 1 ? parts : null;
}

function parseHTablePrompts(text) {
  if (!text.startsWith("{") && !text.startsWith("[")) return null;
  try {
    const data = JSON.parse(text);
    const table = Array.isArray(data) ? data[0] : data;
    if (!Array.isArray(table?.columns) || !Array.isArray(table?.rows)) return null;
    const column = choosePromptColumn(
      table.columns.map(columnItem => ({
        key: columnItem.id,
        title: columnItem.title || "",
        width: Number(columnItem.width || 0),
        values: table.rows.map(row => row?.cells?.[columnItem.id] || "")
      }))
    );
    if (!column) return null;
    return column.values.map(cleanPrompt).filter(Boolean);
  } catch {
    return null;
  }
}

function parseDelimitedPrompts(text) {
  const delimiter = text.includes("\t") ? "\t" : text.includes(",") ? "," : null;
  if (!delimiter) return null;
  const rows = parseDelimitedRows(text, delimiter);
  if (rows.length < 2) return null;
  const width = Math.max(...rows.map(row => row.length));
  if (width < 2) return null;
  const columns = Array.from({ length: width }, (_, index) => ({
    key: String(index),
    title: rows[0]?.[index] || "",
    values: rows.slice(1).map(row => row[index] || "")
  }));
  const column = choosePromptColumn(columns);
  if (!column) return null;
  const prompts = column.values.map(cleanPrompt).filter(Boolean);
  return prompts.length ? prompts : null;
}

function parseDelimitedRows(text, delimiter) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"') {
      if (quoted && next === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      row.push(cell);
      cell = "";
    } else if (char === "\n" && !quoted) {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell);
  rows.push(row);
  return rows.filter(item => item.some(cellValue => cleanPrompt(cellValue)));
}

function choosePromptColumn(columns) {
  const titled = columns.find(column => /prompt|提示|提示词|生成/i.test(column.title));
  if (titled) return titled;
  return columns
    .map(column => ({
      ...column,
      score: column.values.reduce((sum, value) => sum + cleanPrompt(value).length, 0) + Number(column.width || 0)
    }))
    .sort((a, b) => b.score - a.score)[0] || null;
}

function parseLinePrompts(text) {
  return text.split(/\n+/).map(cleanPrompt).filter(Boolean);
}

function cleanPrompt(value) {
  return String(value || "")
    .replace(/^\uFEFF/, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/^[ \t]*\|?[ \t]*prompt[ \t]*\|?[ \t]*$/i, "")
    .trim();
}

function uniquePrompts(prompts) {
  const seen = new Set();
  return prompts.filter(prompt => {
    const key = prompt.trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function showFatalError(error) {
  app.innerHTML = `
    <div class="page-placeholder" style="min-height:100vh;padding:24px;">
      <div>
        <h2>页面启动失败</h2>
        <p class="meta-line">下面是浏览器执行脚本时报出的错误，已经保留在页面上方便排查。</p>
        <pre style="white-space:pre-wrap;max-width:900px;background:#fff;border:1px solid var(--line);border-radius:8px;padding:14px;">${escapeHtml(error.stack || error.message || error)}</pre>
        <button id="resetLocalData" class="button danger" type="button">清空本页缓存并重载</button>
      </div>
    </div>
  `;
  const button = document.querySelector("#resetLocalData");
  if (button) {
    button.addEventListener("click", () => {
      Object.values(STORAGE_KEYS).forEach(key => localStorage.removeItem(key));
      if (typeof indexedDB !== "undefined") indexedDB.deleteDatabase(HISTORY_IDB_NAME);
      location.reload();
    });
  }
}

async function bootstrapApp() {
  confirmPasteBtn.addEventListener("click", () => {
    const prompts = parseBatchPrompts(pasteText.value);
    if (!prompts.length) {
      window.alert("没有识别到可导入的 Prompt");
      return;
    }
    const defaults = normalizeBatchDefaults(readBatchDefaultsFromControls());
    prompts.forEach(prompt => state.rows.push(createRow({
      ...defaults,
      prompt,
      images: cloneAssets(state.batchImages)
    })));
    pasteText.value = "";
    pasteDialog.close();
    persistRows();
    render();
  });
  bindBatchDefaultControls();
  bindGlobalPasteHandler();
  persistRows();
  persistViduRefRows();
  persistAvatarRows();
  await initializeHistoryStorage();
  resumeInterruptedRemoteTasks();
  render();
}

bootstrapApp().catch(error => showFatalError(error));

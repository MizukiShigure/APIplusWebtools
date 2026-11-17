(function exposeModelContracts(root, factory) {
  const contracts = factory();
  if (typeof module === "object" && module.exports) module.exports = contracts;
  if (root) root.ApiBatchModelContracts = contracts;
})(typeof globalThis === "undefined" ? null : globalThis, function createModelContracts() {
  const KLING_3_OMNI = {
    endpoint: "/kling_video_omni",
    queryEndpoint: "/kling_video_omni_query",
    version: "kling-v3-omni",
    sizes: ["16:9", "9:16", "1:1"],
    qualities: ["720p", "1080p"],
    durations: ["3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"],
    defaultQuality: "1080p",
    defaultDuration: "10"
  };
  // Verified against the company gateway edit form and serializer. Its edit
  // branch uses the backend's model default, rather than the multiref model.
  const KLING_3_OMNI_EDIT = {
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
  };
  const SEEDANCE_2 = {
    endpoint: "/seedance2",
    queryEndpoint: "/seedance2_query",
    version: "doubao-seedance-2-0-260128",
    sizes: ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"],
    qualities: ["480p", "720p", "1080p", "4k"],
    durations: ["4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"],
    defaultQuality: "1080p",
    defaultDuration: "10"
  };

  const MINIMAX_H3 = {
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
  };
  const MINIMAX_H3_VIDEO_METADATA_TOLERANCE = 0.5;

  const GPT_IMAGE_25 = {
    endpoint: "/gen_img_4o",
    queryEndpoint: "/gen_img_4o_query",
    version: "gpt-image-2.5-flare",
    versions: [
      { label: "gpt-image-2.5-flare", value: "gpt-image-2.5-flare" },
      { label: "gpt-image-2.5-sunburst", value: "gpt-image-2.5-sunburst" }
    ],
    sizes: ["1:1", "16:9", "9:16", "3:4", "4:3", "3:2", "2:3", "5:4", "4:5", "21:9", "2:1", "1:2", "3:1", "1:3"],
    qualities: ["1K", "2K", "4K"],
    renderQualities: ["low", "medium", "high", "xhigh", "max"],
    backgrounds: ["auto", "transparent", "opaque"],
    defaultSize: "1:1",
    defaultQuality: "1K",
    defaultRenderQuality: "medium",
    defaultBackground: "auto",
    maxImages: 4,
    // Exact company UI qE tables; these dimensions are not rounded ratio calculations.
    sizeMap: {
      "1K": {
        "1:1": "1024x1024", "16:9": "1280x720", "9:16": "720x1280", "3:4": "864x1152",
        "4:3": "1152x864", "3:2": "1248x832", "2:3": "832x1248", "5:4": "1120x896",
        "4:5": "896x1120", "21:9": "1344x576", "2:1": "1440x720", "1:2": "720x1440",
        "3:1": "1728x576", "1:3": "576x1728"
      },
      "2K": {
        "1:1": "2048x2048", "16:9": "2560x1440", "9:16": "1440x2560", "3:4": "1728x2304",
        "4:3": "2304x1728", "3:2": "2496x1664", "2:3": "1664x2496", "5:4": "2240x1792",
        "4:5": "1792x2240", "21:9": "3024x1296", "2:1": "2880x1440", "1:2": "1440x2880",
        "3:1": "3552x1184", "1:3": "1184x3552"
      },
      "4K": {
        "1:1": "2880x2880", "16:9": "3840x2160", "9:16": "2160x3840", "3:4": "2448x3264",
        "4:3": "3264x2448", "3:2": "3504x2336", "2:3": "2336x3504", "5:4": "3200x2560",
        "4:5": "2560x3200", "21:9": "3696x1584", "2:1": "3840x1920", "1:2": "1920x3840",
        "3:1": "3840x1280", "1:3": "1280x3840"
      }
    }
  };
  // Company frontend index-D8wA4rsl.js, verified 2026-11-15. Raster size
  // tables match 2.5; SVG/GIF use separate output rules and omit image_size.
  const GPT_IMAGE_26 = {
    ...GPT_IMAGE_25,
    version: "gpt-image-2.6-flare",
    versions: [
      { label: "gpt-image-2.6-flare", value: "gpt-image-2.6-flare" },
      { label: "gpt-image-2.6-sunburst", value: "gpt-image-2.6-sunburst" }
    ],
    defaultQuality: "2K",
    defaultRenderQuality: "high",
    outputFormats: ["png", "svg", "gif"],
    defaultOutputFormat: "png",
    frameSizes: ["288x288", "384x384", "512x288", "288x512", "512x512", "768x768", "1024x1024"],
    defaultFrameSize: "288x288",
    defaultFrameCount: 9,
    defaultFrameDurationMs: 200,
    fields: [
      { key: "frameSize", label: "GIF 帧尺寸", type: "select", options: ["288x288", "384x384", "512x288", "288x512", "512x512", "768x768", "1024x1024"] },
      { key: "frameCount", label: "GIF 帧数", type: "number", min: 2, max: 16, step: 1 },
      { key: "frameDurationMs", label: "每帧时长 (ms)", type: "number", min: 20, max: 2000, step: 10 }
    ],
    hint: "PNG 支持参考图；SVG 不支持参考图；GIF 使用帧尺寸、2–16 帧、每帧 20–2000ms（10 的倍数），不传 image_size。"
  };
  const MINIMAX_H3_IMAGE = {
    endpoint: "/minimax_image",
    queryEndpoint: "/minimax_image_query",
    version: "MiniMax-H3-Image",
    versions: [{ label: "MiniMax H3 Image", value: "MiniMax-H3-Image" }],
    sizes: ["1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3", "21:9", "3:1", "1:3"],
    qualities: ["1K", "2K", "4K"],
    defaultSize: "1:1",
    defaultQuality: "2K",
    maxImages: 8
  };
  const SEEDANCE_25 = {
    endpoint: "/seedance2",
    queryEndpoint: "/seedance2_query",
    version: "seedance2.5",
    sizes: ["adaptive", "16:9", "4:3", "1:1", "3:4", "9:16", "21:9"],
    qualities: ["480p", "720p", "1080p"],
    durations: ["-1", ...Array.from({ length: 27 }, (_, index) => String(index + 4))],
    outputFormats: ["mp4", "mov"],
    defaultSize: "adaptive",
    defaultQuality: "1080p",
    defaultDuration: "10",
    defaultOutputFormat: "mp4",
    maxRefs: 30,
    maxVideos: 10,
    maxAudios: 10,
    minReferenceDuration: 2,
    maxReferenceDuration: 30,
    maxReferenceVideoDuration: 30,
    maxReferenceAudioDuration: 30
  };

  function normalizeGptImage25Size(size = GPT_IMAGE_25.defaultSize, quality = GPT_IMAGE_25.defaultQuality) {
    if (!GPT_IMAGE_25.sizes.includes(size)) throw new Error("GPT Image 2.5 不支持所选尺寸");
    if (!GPT_IMAGE_25.qualities.includes(quality)) throw new Error("GPT Image 2.5 分辨率必须是 1K、2K 或 4K");
    return GPT_IMAGE_25.sizeMap[quality][size];
  }

  function gptImage25Options(row) {
    return {
      version: row.version ?? GPT_IMAGE_25.version,
      size: row.size ?? GPT_IMAGE_25.defaultSize,
      quality: row.quality ?? GPT_IMAGE_25.defaultQuality,
      renderQuality: row.renderQuality ?? GPT_IMAGE_25.defaultRenderQuality,
      background: row.background ?? GPT_IMAGE_25.defaultBackground
    };
  }

  function validateGptImage25Row(row = {}) {
    const options = gptImage25Options(row);
    if (!GPT_IMAGE_25.versions.some(item => item.value === options.version)) return "GPT Image 2.5 不支持所选版本";
    if (!GPT_IMAGE_25.sizes.includes(options.size)) return "GPT Image 2.5 不支持所选尺寸";
    if (!GPT_IMAGE_25.qualities.includes(options.quality)) return "GPT Image 2.5 分辨率必须是 1K、2K 或 4K";
    if (!GPT_IMAGE_25.renderQualities.includes(options.renderQuality)) return "GPT Image 2.5 渲染质量必须是 low、medium、high、xhigh 或 max";
    if (!GPT_IMAGE_25.backgrounds.includes(options.background)) return "GPT Image 2.5 背景必须是 auto、transparent 或 opaque";
    const images = row.images ?? [];
    if (!Array.isArray(images)) return "GPT Image 2.5 参考图片必须是数组";
    if (images.length > GPT_IMAGE_25.maxImages) return `GPT Image 2.5 最多支持 ${GPT_IMAGE_25.maxImages} 张参考图片`;
    for (const asset of images) {
      if (!asset || (asset.type !== undefined && asset.type !== "image")) return "GPT Image 2.5 仅支持图片参考";
      if (!hasModel25AssetUrl(asset)) return "GPT Image 2.5 参考图片缺少可访问 URL";
    }
    if (!String(row.prompt || "").trim() && !images.length) return "GPT Image 2.5 至少需要 Prompt 或参考图片";
    return "";
  }

  function buildGptImage25Payload(row = {}) {
    const error = validateGptImage25Row(row);
    if (error) throw new Error(error);
    const options = gptImage25Options(row);
    return {
      prompt: String(row.prompt || "").trim(),
      refer_imgs: (row.images ?? []).map(asset => asset.url.trim()),
      model_name: options.version,
      image_size: normalizeGptImage25Size(options.size, options.quality),
      image_quality: options.renderQuality,
      image_background: options.background
    };
  }

  function gptImage26Options(row) {
    return {
      ...gptImage25Options(row),
      version: row.version ?? GPT_IMAGE_26.version,
      quality: row.quality ?? GPT_IMAGE_26.defaultQuality,
      renderQuality: row.renderQuality ?? GPT_IMAGE_26.defaultRenderQuality,
      outputFormat: row.outputFormat ?? GPT_IMAGE_26.defaultOutputFormat,
      frameSize: row.frameSize ?? GPT_IMAGE_26.defaultFrameSize,
      frameCount: row.frameCount ?? GPT_IMAGE_26.defaultFrameCount,
      frameDurationMs: row.frameDurationMs ?? GPT_IMAGE_26.defaultFrameDurationMs
    };
  }

  function validateGptImage26Row(row = {}) {
    const options = gptImage26Options(row);
    if (!GPT_IMAGE_26.versions.some(item => item.value === options.version)) return "GPT Image 2.6 不支持所选版本";
    if (!GPT_IMAGE_26.outputFormats.includes(options.outputFormat)) return "GPT Image 2.6 输出格式必须是 png、svg 或 gif";
    const error = validateGptImage25Row({ ...row, ...options, version: GPT_IMAGE_25.version,
      ...(options.outputFormat !== "png" ? { size: "1:1", quality: "2K" } : {}) });
    if (error) return error.replace(/2\.5/g, "2.6");
    if (options.outputFormat === "svg" && row.images?.length) return "SVG 不支持参考图片，请先移除参考图片";
    if (options.outputFormat === "gif") {
      const count = Number(options.frameCount);
      const duration = Number(options.frameDurationMs);
      if (!GPT_IMAGE_26.frameSizes.includes(options.frameSize)) return "GIF 帧尺寸不受支持";
      if (!["number", "string"].includes(typeof options.frameCount) || !Number.isInteger(count) || count < 2 || count > 16) return "GIF 帧数必须是 2–16 的整数";
      if (!["number", "string"].includes(typeof options.frameDurationMs) || !Number.isInteger(duration) || duration < 20 || duration > 2000 || duration % 10 !== 0) return "GIF 每帧时长必须为 20–2000ms，且为 10 的倍数";
    }
    return "";
  }

  function buildGptImage26Payload(row = {}) {
    const error = validateGptImage26Row(row);
    if (error) throw new Error(error);
    const options = gptImage26Options(row);
    return {
      prompt: String(row.prompt || "").trim(),
      refer_imgs: (row.images ?? []).map(asset => asset.url.trim()),
      model_name: options.version,
      image_quality: options.renderQuality,
      image_background: options.background,
      output_format: options.outputFormat,
      ...(options.outputFormat === "png" ? { image_size: normalizeGptImage25Size(options.size, options.quality) } : {}),
      ...(options.outputFormat === "gif" ? { frame_size: options.frameSize, frame_count: Number(options.frameCount), frame_duration_ms: Number(options.frameDurationMs) } : {})
    };
  }

  function validateMiniMaxH3ImageRow(row = {}) {
    if (!String(row.prompt || "").trim()) return "MiniMax H3 Image 提示词不能为空";
    if ((row.version ?? MINIMAX_H3_IMAGE.version) !== MINIMAX_H3_IMAGE.version) return "MiniMax H3 Image 不支持所选版本";
    if (!MINIMAX_H3_IMAGE.sizes.includes(row.size ?? MINIMAX_H3_IMAGE.defaultSize)) return "MiniMax H3 Image 不支持所选尺寸";
    if (!MINIMAX_H3_IMAGE.qualities.includes(row.quality ?? MINIMAX_H3_IMAGE.defaultQuality)) return "MiniMax H3 Image 分辨率必须为 1K、2K 或 4K";
    const images = row.images ?? [];
    if (!Array.isArray(images) || images.length > MINIMAX_H3_IMAGE.maxImages) return "MiniMax H3 Image 最多支持 8 张参考图";
    if (images.some(asset => !asset || (asset.type !== undefined && asset.type !== "image") || !hasModel25AssetUrl(asset))) return "MiniMax H3 Image 参考图必须包含有效图片 URL";
    return "";
  }

  function buildMiniMaxH3ImagePayload(row = {}) {
    const error = validateMiniMaxH3ImageRow(row);
    if (error) throw new Error(error);
    return {
      prompt: String(row.prompt).trim(),
      refer_imgs: (row.images ?? []).map(asset => asset.url.trim()),
      model_name: MINIMAX_H3_IMAGE.version,
      resolution: row.quality ?? MINIMAX_H3_IMAGE.defaultQuality,
      aspect_ratio: row.size ?? MINIMAX_H3_IMAGE.defaultSize
    };
  }

  function seedance25Options(row) {
    return {
      version: row.version ?? SEEDANCE_25.version,
      size: row.size ?? SEEDANCE_25.defaultSize,
      quality: row.quality ?? SEEDANCE_25.defaultQuality,
      duration: row.duration ?? SEEDANCE_25.defaultDuration,
      outputFormat: row.outputFormat ?? SEEDANCE_25.defaultOutputFormat
    };
  }

  function validateSeedance25Base(row) {
    if (!String(row.prompt || "").trim()) return "Seedance 2.5 Prompt 不能为空";
    const options = seedance25Options(row);
    if (options.version !== SEEDANCE_25.version) return "Seedance 2.5 只支持版本 seedance2.5";
    if (!SEEDANCE_25.sizes.includes(options.size)) return "Seedance 2.5 不支持所选尺寸";
    if (!SEEDANCE_25.qualities.includes(options.quality)) return "Seedance 2.5 清晰度必须是 480p、720p 或 1080p";
    const duration = Number(options.duration);
    if (!["number", "string"].includes(typeof options.duration) || !Number.isInteger(duration) || !SEEDANCE_25.durations.includes(String(duration))) {
      return "Seedance 2.5 时长必须是自动（-1）或 4 到 30 秒的整数";
    }
    if (!SEEDANCE_25.outputFormats.includes(options.outputFormat)) return "Seedance 2.5 输出格式必须是 mp4 或 mov";
    if (row.generateAudio !== undefined && typeof row.generateAudio !== "boolean") return "Seedance 2.5 generateAudio 必须是布尔值";
    return "";
  }

  function validateSeedance25FirstLastRow(row = {}) {
    const error = validateSeedance25Base(row);
    if (error) return error;
    if (row.lastFrame && !row.firstFrame) return "Seedance 2.5 尾帧必须搭配首帧";
    for (const [name, asset] of [["首帧", row.firstFrame], ["尾帧", row.lastFrame]]) {
      if (asset === null || asset === undefined) continue;
      if (!hasModel25AssetUrl(asset)) return `Seedance 2.5 ${name}缺少可访问 URL`;
      if (asset.type !== undefined && asset.type !== "image") return `Seedance 2.5 ${name}必须是图片`;
    }
    return "";
  }

  function validateSeedance25MultiRow(row = {}) {
    return validateSeedance25Base(row) || validateSeedance25References(row.refs ?? []);
  }

  function validateSeedance25References(refs) {
    if (!Array.isArray(refs)) return "Seedance 2.5 参考素材必须是数组";
    if (refs.length > SEEDANCE_25.maxRefs) return `Seedance 2.5 参考素材最多 ${SEEDANCE_25.maxRefs} 个`;
    const counts = { video: 0, audio: 0 };
    const totals = { video: 0, audio: 0 };
    for (const asset of refs) {
      if (!asset || !["image", "video", "audio"].includes(asset.type)) return "Seedance 2.5 参考素材必须是图片、视频或音频";
      if (!hasModel25AssetUrl(asset)) return "Seedance 2.5 参考素材缺少可访问 URL";
      if (asset.type === "image") continue;
      const name = asset.type === "video" ? "视频" : "音频";
      const maxCount = asset.type === "video" ? SEEDANCE_25.maxVideos : SEEDANCE_25.maxAudios;
      counts[asset.type] += 1;
      if (counts[asset.type] > maxCount) return `Seedance 2.5 参考${name}最多 ${maxCount} 个`;
      // URL-only assets may lack metadata. Enforce duration limits whenever it is known.
      if (asset.duration === undefined || asset.duration === null || asset.duration === "") continue;
      const duration = Number(asset.duration);
      if (!["number", "string"].includes(typeof asset.duration) || !Number.isFinite(duration) || duration < SEEDANCE_25.minReferenceDuration || duration > SEEDANCE_25.maxReferenceDuration) {
        return `Seedance 2.5 单个参考${name}时长必须是 2 到 30 秒`;
      }
      totals[asset.type] += duration;
      const maxDuration = asset.type === "video" ? SEEDANCE_25.maxReferenceVideoDuration : SEEDANCE_25.maxReferenceAudioDuration;
      if (totals[asset.type] > maxDuration) return `Seedance 2.5 参考${name}总时长不能超过 ${maxDuration} 秒`;
    }
    return "";
  }

  function hasModel25AssetUrl(asset) {
    return typeof asset?.url === "string" && Boolean(asset.url.trim());
  }

  function buildSeedance25BasePayload(row) {
    const options = seedance25Options(row);
    return {
      prompt: String(row.prompt || "").trim(),
      model_name: SEEDANCE_25.version,
      generate_audio: row.generateAudio !== false,
      ratio: options.size,
      duration: Number(options.duration),
      resolution: options.quality,
      output_format: options.outputFormat
    };
  }

  function buildSeedance25FirstLastPayload(row = {}) {
    const error = validateSeedance25FirstLastRow(row);
    if (error) throw new Error(error);
    const payload = buildSeedance25BasePayload(row);
    if (row.firstFrame) payload.first_frame_image = row.firstFrame.url.trim();
    if (row.lastFrame) payload.last_frame_image = row.lastFrame.url.trim();
    return payload;
  }

  function buildSeedance25MultiPayload(row = {}) {
    const error = validateSeedance25MultiRow(row);
    if (error) throw new Error(error);
    const refs = row.refs ?? [];
    const labels = buildSeedance25ReferenceLabels(refs);
    const payload = buildSeedance25BasePayload(row);
    payload.prompt = normalizeSeedance25Prompt(row.prompt, labels);
    for (const [type, field] of [["image", "reference_images"], ["video", "reference_videos"], ["audio", "reference_audios"]]) {
      const urls = refs.filter(asset => asset.type === type).map(asset => asset.url.trim());
      if (urls.length) payload[field] = urls;
    }
    return payload;
  }

  function buildSeedance25ReferenceLabels(refs = []) {
    const error = validateSeedance25References(refs);
    if (error) throw new Error(error);
    const counts = { image: 0, video: 0, audio: 0 };
    // Never filter or sort before labeling: @N belongs to the original row position.
    return refs.map((asset, index) => {
      counts[asset.type] += 1;
      const prefix = asset.type === "image" ? "图片" : asset.type === "video" ? "视频" : "音频";
      return { token: `@${index + 1}`, label: `${prefix}${counts[asset.type]}`, type: asset.type };
    });
  }

  function normalizeSeedance25Prompt(prompt, labels = []) {
    const replacements = new Map(labels.map(item => [item.token, item.label]));
    const allLabels = labels.map(item => item.label).join("、");
    let text = String(prompt || "").trim();
    if (allLabels) text = text.replace(/@@|@all\b/gi, allLabels);
    return text
      .replace(/@(\d+)(?!\d)/g, match => replacements.get(match) || match)
      .replace(/<<image_(\d+)>>/gi, "图片$1")
      .replace(/<<video_(\d+)>>/gi, "视频$1")
      .replace(/<<audio_(\d+)>>/gi, "音频$1");
  }

  function seedance2QualityOptions(version) {
    return version === "doubao-seedance-2-0-fast-260128"
      ? ["480p", "720p"]
      : ["480p", "720p", "1080p", "4k"];
  }

  function buildSeedance2FirstLastPayload(row = {}) {
    const payload = {
      prompt: String(row.prompt || "").trim() || undefined,
      generate_audio: row.generateAudio !== false,
      ratio: row.size || undefined,
      duration: Number(row.duration || 5),
      resolution: row.quality || undefined,
      web_search: Boolean(row.webSearch)
    };
    const firstFrame = String(row.firstFrame?.url || "").trim();
    const lastFrame = String(row.lastFrame?.url || "").trim();
    if (firstFrame) payload.first_frame_image = firstFrame;
    if (lastFrame) payload.last_frame_image = lastFrame;
    return payload;
  }

  function nearestQualityOption(current, options, fallback = "") {
    const available = Array.isArray(options) ? options.filter(Boolean) : [];
    if (!available.length) return "";
    if (available.includes(current)) return current;
    const target = qualityHeight(current);
    const comparable = available.filter(option => qualityHeight(option) !== null);
    if (target !== null && comparable.length) {
      return comparable.reduce((best, option) => {
        const height = qualityHeight(option);
        if (height === null) return best;
        const distance = Math.abs(height - target);
        const bestHeight = qualityHeight(best);
        const bestDistance = bestHeight === null ? Number.POSITIVE_INFINITY : Math.abs(bestHeight - target);
        return distance < bestDistance || (distance === bestDistance && height > bestHeight) ? option : best;
      }, comparable[0]);
    }
    return available.includes(fallback) ? fallback : available[0];
  }

  function formatProviderError(value, fallback = "请求失败") {
    if (typeof value === "string") return value.trim() || fallback;
    if (!value || typeof value !== "object") return fallback;
    const nested = value.error && typeof value.error === "object" ? value.error : null;
    const message = firstText(
      value.message,
      value.msg,
      typeof value.error === "string" ? value.error : "",
      nested?.message,
      value.detail?.[0]?.msg,
      value.data?.message,
      fallback
    );
    let details = "";
    try {
      details = JSON.stringify(value);
    } catch {
      details = "";
    }
    if (!details || details === "{}") return message;
    return details.includes(message) ? details : `${message}\n${details}`;
  }

  function validateKling3OmniRow(row = {}) {
    if (row.klingMode === "video_edit") return validateKling3OmniEditRow(row);
    const refs = Array.isArray(row.refs) ? row.refs : [];
    if (refs.some(asset => asset?.type === "audio")) return "Kling 3 Omni 不支持普通音频参考，请先移除音频素材";

    const prompt = String(row.prompt || "");
    if (!prompt.trim()) return "Prompt 不能为空";
    if (prompt.length > 3072) return "Prompt 最长为 3072 个字符";
    if (row.version !== KLING_3_OMNI.version) return `Kling 3 Omni 只支持版本 ${KLING_3_OMNI.version}`;
    if (!KLING_3_OMNI.sizes.includes(row.size)) return `Kling 3 Omni 不支持尺寸 ${row.size || "空"}`;
    if (!KLING_3_OMNI.qualities.includes(row.quality)) return `Kling 3 Omni 不支持清晰度 ${row.quality || "空"}`;

    const duration = Number(row.duration);
    if (!Number.isInteger(duration) || duration < 3 || duration > 15) return "Kling 3 Omni 时长必须是 3 到 15 秒的整数";

    const videos = refs.filter(asset => asset?.type === "video");
    if (videos.length > 1) return "Kling 3 Omni 最多只能添加一个参考视频";
    const images = refs.filter(asset => asset?.type === "image");
    const maxImages = videos.length ? 4 : 7;
    if (images.length > maxImages) return `Kling 3 Omni ${videos.length ? "带视频时" : ""}最多只能添加 ${maxImages} 张参考图片`;

    for (const asset of refs) {
      if (!asset || !["image", "video"].includes(asset.type)) continue;
      if (!String(asset.url || "").trim()) return `${asset.type === "image" ? "图片" : "视频"}参考缺少可访问 URL`;
      const error = asset.type === "image" ? validateImage(asset) : validateVideo(asset);
      if (error) return error;
    }
    return "";
  }

  function buildKling3OmniPayload(row = {}) {
    if (row.klingMode === "video_edit") return buildKling3OmniEditPayload(row);
    const refs = Array.isArray(row.refs) ? row.refs : [];
    const images = refs.filter(asset => asset?.type === "image" && asset.url);
    const videos = refs.filter(asset => asset?.type === "video" && asset.url);
    if (videos.length > 1) {
      throw new Error("Kling 3 Omni 最多只能添加一个参考视频");
    }
    const maxImages = videos.length ? 4 : 7;
    if (images.length > maxImages) {
      throw new Error(`Kling 3 Omni ${videos.length ? "带视频时" : ""}最多只能添加 ${maxImages} 张参考图片`);
    }

    const referenceTokens = [];
    let imageIndex = 0;
    let videoIndex = 0;

    refs.forEach(asset => {
      if (asset?.type === "image" && asset.url) {
        imageIndex += 1;
        referenceTokens.push(`<<image_${imageIndex}>>`);
      } else if (asset?.type === "video" && asset.url) {
        videoIndex += 1;
        referenceTokens.push(`<<video_${videoIndex}>>`);
      } else {
        referenceTokens.push("");
      }
    });

    const prompt = String(row.prompt || "")
      .replace(/@(\d+)(?!\d)/g, (match, position) => referenceTokens[Number(position) - 1] || match)
      .trim();
    const generateAudio = row.generateAudio !== false;
    const hasVideo = videos.length > 0;

    return {
      prompt,
      generate_mode: "multi_reference",
      reference_images: images.map(asset => String(asset.url).trim()),
      reference_video: hasVideo ? String(videos[0].url).trim() : "",
      duration: Number(row.duration),
      keep_video_sound: hasVideo && generateAudio,
      mode: row.quality === "1080p" ? "pro" : "std",
      aspect_ratio: row.size,
      model_name: KLING_3_OMNI.version,
      sound: generateAudio && !hasVideo ? "on" : "off"
    };
  }

  function validateKling3OmniEditRow(row = {}) {
    const refs = Array.isArray(row.refs) ? row.refs : [];
    if (refs.some(asset => asset?.type === "audio")) return "Kling 视频编辑不支持音频参考，请使用保留视频声音选项";
    if (refs.some(asset => !asset || !["image", "video"].includes(asset.type))) return "Kling 视频编辑只支持图片和视频素材类型";
    const videos = refs.filter(asset => asset.type === "video");
    if (!videos.length) return "Kling 视频编辑必须提供一个源视频";
    if (videos.length !== 1) return "Kling 视频编辑只能提供一个源视频";
    const images = refs.filter(asset => asset.type === "image");
    if (images.length > KLING_3_OMNI_EDIT.maxImages) return "Kling 视频编辑最多只能添加 4 张参考图片";

    const prompt = String(row.prompt || "").trim();
    if (!prompt) return "Prompt 不能为空";
    if (prompt.length > 3072) return "Prompt 最长为 3072 个字符";
    if (![...KLING_3_OMNI_EDIT.qualities, "std", "pro"].includes(row.quality)) return `Kling 视频编辑不支持清晰度 ${row.quality || "空"}`;
    if (row.klingKeepVideoSound !== undefined && typeof row.klingKeepVideoSound !== "boolean") return "保留视频声音必须为布尔值";
    for (const asset of refs) {
      const url = String(asset.url || "").trim();
      if (!url) return `${asset.type === "video" ? "源视频" : "参考图片"}缺少可访问 URL`;
      if (!/^https?:\/\/[^\s]+$/i.test(url)) return "Kling 视频编辑素材必须使用可访问的 HTTP 或 HTTPS URL";
      const error = validateKlingEditAsset(asset);
      if (error) return error;
    }
    for (const match of prompt.matchAll(/@(\d+)(?!\d)/g)) {
      const index = Number(match[1]);
      if (index < 1 || index > refs.length) return `${match[0]} 没有对应素材，请检查参考顺序`;
    }
    for (const match of prompt.matchAll(/<<(image|video|audio)_(\d+)>>/gi)) {
      const count = match[1].toLowerCase() === "image" ? images.length : match[1].toLowerCase() === "video" ? videos.length : 0;
      if (Number(match[2]) < 1 || Number(match[2]) > count) return `${match[0]} 没有对应素材，请检查参考顺序`;
    }
    return "";
  }

  function validateKlingEditAsset(asset) {
    const format = klingEditAssetFormat(asset);
    const width = knownNumber(asset.width);
    const height = knownNumber(asset.height);
    const bytes = knownNumber(asset.size ?? asset.bytes);
    if (asset.type === "video") {
      if (format && !["mp4", "mov"].includes(format)) return "Kling 视频编辑源视频仅支持 MP4 或 MOV";
      const duration = knownNumber(asset.duration);
      if (duration === null || width === null || height === null) return "源视频缺少时长或宽高元数据，请重新上传或读取媒体元数据后再提交";
      if (duration < KLING_3_OMNI_EDIT.minVideoDuration || duration > KLING_3_OMNI_EDIT.maxVideoDuration) return "Kling 视频编辑源视频时长必须在 3 到 10 秒之间";
      if ([width, height].some(edge => edge < KLING_3_OMNI_EDIT.minVideoEdge || edge > KLING_3_OMNI_EDIT.maxVideoEdge)) return "Kling 视频编辑源视频宽高必须在 720 到 2160px 之间";
      if (bytes !== null && bytes > KLING_3_OMNI_EDIT.maxVideoBytes) return "Kling 视频编辑源视频不能超过 200MB";
    } else {
      if (format && !["jpg", "jpeg", "png"].includes(format)) return "Kling 视频编辑参考图片仅支持 JPG、JPEG 或 PNG";
      if ((width !== null && width < 300) || (height !== null && height < 300)) return "Kling 视频编辑参考图片边长必须至少为 300px";
      if (width !== null && height !== null && !withinRatio(width, height, 0.4, 2.5)) return "Kling 视频编辑参考图片比例必须在 0.4 到 2.5 之间";
      if (bytes !== null && bytes > KLING_3_OMNI_EDIT.maxImageBytes) return "Kling 视频编辑参考图片不能超过 10MB";
    }
    return "";
  }

  function klingEditAssetFormat(asset) {
    const explicit = String(asset.format || asset.extension || "").replace(/^\./, "").toLowerCase();
    if (explicit) return explicit;
    const mime = String(asset.mime || asset.mimeType || "").split(";", 1)[0].trim().toLowerCase();
    if (mime === "video/quicktime") return "mov";
    if (/^(image|video)\//.test(mime)) return mime.split("/")[1];
    for (const source of [asset.name, asset.url]) {
      const match = String(source || "").split(/[?#]/, 1)[0].match(/\.([a-z0-9]+)$/i);
      if (match) return match[1].toLowerCase();
    }
    return "";
  }

  function buildKling3OmniEditPayload(row = {}) {
    const error = validateKling3OmniEditRow(row);
    if (error) throw new Error(error);
    const refs = row.refs;
    const counts = { image: 0, video: 0 };
    const tokens = refs.map(asset => `<<${asset.type}_${++counts[asset.type]}>>`);
    return {
      prompt: String(row.prompt).trim().replace(/@(\d+)(?!\d)/g, (_, position) => tokens[Number(position) - 1]),
      generate_mode: KLING_3_OMNI_EDIT.generateMode,
      reference_images: refs.filter(asset => asset.type === "image").map(asset => asset.url.trim()),
      reference_video: refs.find(asset => asset.type === "video").url.trim(),
      // These exact sentinels match the live company gateway. They do not
      // request a zero-length video; the wrapper follows its source video.
      duration: 0,
      keep_video_sound: row.klingKeepVideoSound !== false,
      mode: ["1080p", "pro"].includes(row.quality) ? "pro" : "std",
      aspect_ratio: ""
    };
  }

  function validateMiniMaxH3FirstLastRow(row = {}) {
    if (!String(row.firstFrame?.url || "").trim()) return "MiniMax H3 首尾帧模式必须提供首帧图";
    return validateMiniMaxH3Base(row);
  }

  function validateMiniMaxH3MultiRow(row = {}) {
    const baseError = validateMiniMaxH3Base(row);
    if (baseError) return baseError;

    const refs = miniMaxH3Refs(row);
    if (refs.length > MINIMAX_H3.maxRefs) return `MiniMax H3 参考素材最多 ${MINIMAX_H3.maxRefs} 个`;
    if (refs.some(asset => !String(asset.url || "").trim())) return "MiniMax H3 参考素材缺少可访问 URL";

    const prompt = String(row.prompt || "").trim();
    const images = refs.filter(asset => asset.type === "image");
    const videos = refs.filter(asset => asset.type === "video");
    const audios = refs.filter(asset => asset.type === "audio");
    if (!prompt && !images.length && !videos.length) return "MiniMax H3 至少需要 Prompt、图片或视频中的一种";
    if (audios.length && !images.length && !videos.length) return "MiniMax H3 音频参考必须搭配图片或视频";

    const knownVideoDuration = videos.reduce((total, asset) => {
      const duration = knownNumber(asset.duration);
      return total + (duration === null ? 0 : duration);
    }, 0);
    if (knownVideoDuration > MINIMAX_H3.maxReferenceVideoDuration + MINIMAX_H3_VIDEO_METADATA_TOLERANCE) {
      return `MiniMax H3 参考视频总时长不能超过 ${MINIMAX_H3.maxReferenceVideoDuration} 秒`;
    }
    return "";
  }

  function validateMiniMaxH3Base(row) {
    if (row.version !== MINIMAX_H3.version) return `MiniMax H3 只支持版本 ${MINIMAX_H3.version}`;
    if (!MINIMAX_H3.sizes.includes(row.size)) return `MiniMax H3 不支持尺寸 ${row.size || "空"}`;
    if (!MINIMAX_H3.qualities.includes(row.quality)) return `MiniMax H3 不支持清晰度 ${row.quality || "空"}`;
    const duration = Number(row.duration);
    if (!Number.isInteger(duration) || !MINIMAX_H3.durations.includes(String(duration))) {
      return "MiniMax H3 时长必须是 5 到 15 秒的整数";
    }
    return "";
  }

  function buildMiniMaxH3FirstLastPayload(row = {}) {
    const payload = buildMiniMaxH3BasePayload(row);
    payload.first_frame_image = String(row.firstFrame?.url || "").trim();
    const lastFrame = String(row.lastFrame?.url || "").trim();
    if (lastFrame) payload.last_frame_image = lastFrame;
    return payload;
  }

  function buildMiniMaxH3MultiPayload(row = {}) {
    const refs = miniMaxH3Refs(row).filter(asset => String(asset.url || "").trim());
    const labels = buildMiniMaxH3ReferenceLabels(refs);
    const payload = buildMiniMaxH3BasePayload({
      ...row,
      prompt: normalizeMiniMaxH3Prompt(row.prompt, labels)
    });
    const images = refs.filter(asset => asset.type === "image").map(asset => asset.url);
    const videos = refs.filter(asset => asset.type === "video").map(asset => asset.url);
    const audios = refs.filter(asset => asset.type === "audio").map(asset => asset.url);
    if (images.length) payload.reference_images = images;
    if (videos.length) payload.reference_videos = videos;
    if (audios.length) payload.reference_audios = audios;
    return payload;
  }

  function buildMiniMaxH3BasePayload(row) {
    const payload = {
      model_name: MINIMAX_H3.version,
      generate_audio: row.generateAudio !== false,
      ratio: row.size,
      duration: Number(row.duration),
      resolution: row.quality
    };
    const prompt = String(row.prompt || "").trim();
    if (prompt) payload.prompt = prompt;
    return payload;
  }

  function miniMaxH3Refs(row) {
    return (Array.isArray(row.refs) ? row.refs : []).filter(asset => (
      asset && ["image", "video", "audio"].includes(asset.type)
    ));
  }

  function buildMiniMaxH3ReferenceLabels(refs) {
    const counts = { image: 0, video: 0, audio: 0 };
    return refs.map((asset, index) => {
      counts[asset.type] += 1;
      const prefix = asset.type === "image" ? "图片" : asset.type === "video" ? "视频" : "音频";
      return {
        token: `@${index + 1}`,
        label: `${prefix}${counts[asset.type]}`,
        type: asset.type
      };
    });
  }

  function normalizeMiniMaxH3Prompt(prompt, labels) {
    const replacements = new Map(labels.map((item, index) => [String(index + 1), item.label]));
    return String(prompt || "")
      .trim()
      .replace(/@(\d+)(?!\d)/g, (match, position) => replacements.get(position) || match)
      .replace(/<<image_(\d+)>>/gi, (_, position) => `图片${position}`)
      .replace(/<<video_(\d+)>>/gi, (_, position) => `视频${position}`)
      .replace(/<<audio_(\d+)>>/gi, (_, position) => `音频${position}`);
  }

  function validateImage(asset) {
    const width = knownNumber(asset.width);
    const height = knownNumber(asset.height);
    const size = knownNumber(asset.size ?? asset.bytes);
    if ((width !== null && width < 300) || (height !== null && height < 300)) return "Kling 3 Omni 图片边长必须至少为 300px";
    if (width !== null && height !== null && !withinRatio(width, height, 0.4, 2.5)) return "Kling 3 Omni 图片比例必须在 0.4 到 2.5 之间";
    if (size !== null && size > 50 * 1024 * 1024) return "Kling 3 Omni 图片文件不能超过 50MB";
    return "";
  }

  function validateVideo(asset) {
    const format = videoFormat(asset);
    const duration = knownNumber(asset.duration);
    const width = knownNumber(asset.width);
    const height = knownNumber(asset.height);
    const fps = knownNumber(asset.fps ?? asset.frameRate ?? asset.frame_rate);
    if (format && !["mp4", "mov"].includes(format)) return "Kling 3 Omni 参考视频仅支持 MP4 或 MOV";
    if (duration !== null && (duration < 3 || duration > 15.5)) return "Kling 3 Omni 参考视频时长必须在 3 到 15.5 秒之间";
    if ((width !== null && (width < 700 || width > 4553)) || (height !== null && (height < 700 || height > 4553))) return "Kling 3 Omni 参考视频宽高必须在 700 到 4553px 之间";
    if (width !== null && height !== null && width * height > 8294400) return "Kling 3 Omni 参考视频像素不能超过 8294400";
    if (width !== null && height !== null && !withinRatio(width, height, 0.4, 2)) return "Kling 3 Omni 参考视频比例必须在 0.4 到 2 之间";
    if (fps !== null && (fps < 24 || fps > 60)) return "Kling 3 Omni 参考视频帧率必须在 24 到 60fps 之间";
    return "";
  }

  function knownNumber(value) {
    if (value === "" || value === null || value === undefined) return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function qualityHeight(value) {
    const normalized = String(value || "").trim().toLowerCase();
    if (normalized === "4k") return 2160;
    const match = normalized.match(/^(\d+)p$/);
    return match ? Number(match[1]) : null;
  }

  function firstText(...values) {
    for (const value of values) {
      if (typeof value === "string" && value.trim()) return value.trim();
      if (typeof value === "number" && Number.isFinite(value)) return String(value);
    }
    return "请求失败";
  }

  function withinRatio(width, height, min, max) {
    return height > 0 && width / height >= min && width / height <= max;
  }

  function videoFormat(asset) {
    const explicit = String(asset.format || asset.extension || "").replace(/^\./, "").toLowerCase();
    if (explicit) return explicit;
    const mime = String(asset.mime || asset.mimeType || "").toLowerCase();
    if (mime === "video/mp4") return "mp4";
    if (mime === "video/quicktime") return "mov";
    if (mime.startsWith("video/")) return mime.slice("video/".length);
    const source = String(asset.name || asset.url || "").split(/[?#]/, 1)[0];
    const match = source.match(/\.([a-z0-9]+)$/i);
    return match ? match[1].toLowerCase() : "";
  }

  return {
    GPT_IMAGE_25,
    GPT_IMAGE_26,
    MINIMAX_H3_IMAGE,
    validateGptImage26Row,
    buildGptImage26Payload,
    validateMiniMaxH3ImageRow,
    buildMiniMaxH3ImagePayload,
    SEEDANCE_25,
    normalizeGptImage25Size,
    validateGptImage25Row,
    buildGptImage25Payload,
    validateSeedance25FirstLastRow,
    buildSeedance25FirstLastPayload,
    validateSeedance25MultiRow,
    buildSeedance25MultiPayload,
    buildSeedance25ReferenceLabels,
    normalizeSeedance25Prompt,
    KLING_3_OMNI,
    KLING_3_OMNI_EDIT,
    MINIMAX_H3,
    buildKling3OmniPayload,
    buildKling3OmniEditPayload,
    SEEDANCE_2,
    buildMiniMaxH3FirstLastPayload,
    buildMiniMaxH3MultiPayload,
    formatProviderError,
    buildSeedance2FirstLastPayload,
    nearestQualityOption,
    seedance2QualityOptions,
    validateKling3OmniRow,
    validateKling3OmniEditRow,
    validateMiniMaxH3FirstLastRow,
    validateMiniMaxH3MultiRow
  };
});

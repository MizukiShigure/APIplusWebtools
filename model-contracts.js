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
    durations: ["3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"]
  };
  const SEEDANCE_2 = {
    endpoint: "/seedance2",
    queryEndpoint: "/seedance2_query",
    version: "doubao-seedance-2-0-260128",
    sizes: ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"],
    qualities: ["480p", "720p", "1080p", "4k"],
    durations: ["4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"]
  };

  const MINIMAX_H3 = {
    endpoint: "/minimax_h3",
    queryEndpoint: "/minimax_h3_query",
    version: "MiniMax-H3",
    sizes: ["adaptive", "21:9", "16:9", "4:3", "1:1", "3:4", "9:16"],
    qualities: ["768P", "2K"],
    durations: ["5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"],
    defaultSize: "9:16",
    defaultQuality: "768P",
    defaultDuration: "5",
    maxRefs: 12,
    maxReferenceVideoDuration: 15
  };

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
    if (target !== null) {
      return available.reduce((best, option) => {
        const height = qualityHeight(option);
        if (height === null) return best;
        const distance = Math.abs(height - target);
        const bestHeight = qualityHeight(best);
        const bestDistance = bestHeight === null ? Number.POSITIVE_INFINITY : Math.abs(bestHeight - target);
        return distance < bestDistance || (distance === bestDistance && height > bestHeight) ? option : best;
      }, available[0]);
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
    if (knownVideoDuration > MINIMAX_H3.maxReferenceVideoDuration) {
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
    KLING_3_OMNI,
    MINIMAX_H3,
    buildKling3OmniPayload,
    SEEDANCE_2,
    buildMiniMaxH3FirstLastPayload,
    buildMiniMaxH3MultiPayload,
    formatProviderError,
    buildSeedance2FirstLastPayload,
    nearestQualityOption,
    seedance2QualityOptions,
    validateKling3OmniRow,
    validateMiniMaxH3FirstLastRow,
    validateMiniMaxH3MultiRow
  };
});

(function exposeModelContracts(root, factory) {
  const contracts = factory();
  if (typeof module === "object" && module.exports) module.exports = contracts;
  if (root) root.ApiBatchModelContracts = contracts;
})(typeof globalThis === "undefined" ? null : globalThis, function createModelContracts() {
  const KLING_3_OMNI = {
    endpoint: "/kling_3_omni_video",
    queryEndpoint: "/kling_3_omni_video_query",
    version: "kling-3-omni",
    sizes: ["16:9", "9:16", "1:1"],
    qualities: ["720p", "1080p", "4k"],
    durations: ["3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"]
  };

  function seedance2QualityOptions(version) {
    return version === "doubao-seedance-2-0-fast-260128"
      ? ["480p", "720p"]
      : ["480p", "720p", "1080p", "4k"];
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
    if (refs.filter(asset => asset?.type === "video").length > 1) {
      throw new Error("Kling 3 Omni 最多只能添加一个参考视频");
    }
    const referenceIds = [];
    let imageIndex = 0;
    let videoIndex = 0;
    const contents = [];

    refs.forEach(asset => {
      if (asset?.type === "image" && asset.url) {
        imageIndex += 1;
        referenceIds.push(`image_${imageIndex}`);
      } else if (asset?.type === "video" && asset.url) {
        videoIndex += 1;
        referenceIds.push(`video_${videoIndex}`);
      } else {
        referenceIds.push("");
      }
    });

    const prompt = String(row.prompt || "").replace(/@(\d+)(?!\d)/g, (match, position) => referenceIds[Number(position) - 1] || match);
    contents.push({ type: "prompt", text: prompt });

    let nextImage = 0;
    let nextVideo = 0;
    refs.forEach(asset => {
      if (asset?.type === "image" && asset.url) {
        nextImage += 1;
        contents.push({ type: "refer_image", image_url: asset.url, id: `image_${nextImage}` });
      }
    });
    refs.forEach(asset => {
      if (asset?.type === "video" && asset.url) {
        nextVideo += 1;
        contents.push({ type: "feature_video", video_url: asset.url, id: `video_${nextVideo}` });
      }
    });

    return {
      contents,
      settings: {
        resolution: row.quality,
        duration: Number(row.duration),
        audio: row.generateAudio === false ? "off" : nextVideo ? "original" : "native",
        multi_shot: false,
        aspect_ratio: row.size
      },
      options: {}
    };
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
    buildKling3OmniPayload,
    formatProviderError,
    nearestQualityOption,
    seedance2QualityOptions,
    validateKling3OmniRow
  };
});

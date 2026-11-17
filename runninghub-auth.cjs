"use strict";

const INVISIBLE_COPY_CHARS = /[\u200B-\u200D\u2060\uFEFF]/g;
const WRAPPING_QUOTES = /^["'`\u201c\u201d\u2018\u2019]+|["'`\u201c\u201d\u2018\u2019]+$/g;

function stripWrappingQuotes(value) {
  let next = String(value || "").trim();
  while (next && WRAPPING_QUOTES.test(next)) {
    WRAPPING_QUOTES.lastIndex = 0;
    next = next.replace(WRAPPING_QUOTES, "").trim();
  }
  return next;
}

function invalidRunningHubApiKeyError() {
  const error = new Error("RunningHub API Key \u542b\u6709\u975e\u6cd5\u5b57\u7b26\uff0c\u8bf7\u53ea\u7c98\u8d34 Key \u672c\u4f53\uff08\u4e0d\u8981\u5305\u542b Authorization\u3001Bearer\u3001\u5f15\u53f7\u6216\u6362\u884c\uff09");
  error.status = 400;
  error.code = "INVALID_RUNNINGHUB_API_KEY";
  return error;
}

function normalizeRunningHubApiKey(value) {
  let key = String(value ?? "").replace(INVISIBLE_COPY_CHARS, "").trim();
  if (!key) return "";

  for (let index = 0; index < 3; index += 1) {
    key = stripWrappingQuotes(key);
    key = key.replace(/^authorization\s*:\s*/i, "").trim();
    key = key.replace(/^(?:bearer|token)\s+/i, "").trim();
  }

  key = stripWrappingQuotes(key).replace(/[\s\u200B-\u200D\u2060\uFEFF]+/g, "");
  if (!key) return "";
  if (!/^[\x21-\x7E]+$/.test(key)) throw invalidRunningHubApiKeyError();
  return key;
}

function runningHubAuthorizationHeader(value) {
  const key = normalizeRunningHubApiKey(value);
  if (!key) {
    const error = new Error("Missing RunningHub apiKey");
    error.status = 400;
    error.code = "MISSING_RUNNINGHUB_API_KEY";
    throw error;
  }
  return `Bearer ${key}`;
}

module.exports = {
  invalidRunningHubApiKeyError,
  normalizeRunningHubApiKey,
  runningHubAuthorizationHeader
};

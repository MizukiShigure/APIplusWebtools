const assert = require("assert");

const {
  normalizeRunningHubApiKey,
  runningHubAuthorizationHeader
} = require("./runninghub-auth.cjs");

assert.strictEqual(
  normalizeRunningHubApiKey("  Authorization: Bearer rh_test-123._+/=  "),
  "rh_test-123._+/=",
  "must remove an accidentally pasted Authorization/Bearer prefix"
);

assert.strictEqual(
  normalizeRunningHubApiKey("\uFEFF\u201crh_test-\r\n123\u201d\u200B"),
  "rh_test-123",
  "must remove wrapping quotes, line breaks, and invisible copy artifacts"
);

assert.strictEqual(
  runningHubAuthorizationHeader("Bearer rh_test-123\n"),
  "Bearer rh_test-123",
  "must build a valid header from the normalized key"
);

assert.throws(
  () => normalizeRunningHubApiKey("rh_test_\u4e2d\u6587"),
  error => error?.code === "INVALID_RUNNINGHUB_API_KEY" && /Key/.test(error.message),
  "must reject unsupported non-ASCII characters with a clear validation error"
);

console.log("runninghub-auth checks passed");

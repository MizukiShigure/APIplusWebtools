const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");

function functionDeclaration(name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `${name} must exist`);
  const signatureEnd = source.indexOf(") {", start);
  assert.notEqual(signatureEnd, -1, `${name} signature must close`);
  const bodyStart = signatureEnd + 2;
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}" && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`${name} is not closed`);
}

const recoveryFactory = new Function(
  "TASK_TIMEOUT_MS",
  `${functionDeclaration("remoteTasksForRow")}\n${functionDeclaration("recoverInterruptedRow")}\nreturn recoverInterruptedRow;`
);
const recoverInterruptedRow = recoveryFactory(30 * 60 * 1000);
const remoteTasksForRow = new Function(`${functionDeclaration("remoteTasksForRow")}\nreturn remoteTasksForRow;`)();
const now = Date.now();

const resumable = {
  status: "running",
  taskIds: ["task-1"],
  remoteTasks: [{ taskId: "task-1", taskPath: "path-1", queryEndpoint: "/query-1" }],
  completedTaskIds: [],
  results: [],
  count: 1,
  totalJobs: 1,
  startedAt: now,
  lastActivityAt: now,
  error: ""
};
recoverInterruptedRow(resumable);
assert.equal(resumable.status, "queued", "a row with a remote task id must return to polling queue");
assert.deepEqual(resumable.resumeRemoteTasks.map(item => item.taskId), ["task-1"]);
assert.equal(resumable.resumeRemoteTasks[0].queryEndpoint, "/query-1");
assert.doesNotMatch(resumable.error, /\u91cd\u65b0\u63d0\u4ea4/, "resumable remote tasks must never ask for resubmission");

const credentialed = {
  taskIds: ["rh-task"],
  remoteTasks: [{ taskId: "rh-task", queryEndpoint: "/api/runninghub/query", apiKey: "<runtime-key>" }]
};
assert.equal(remoteTasksForRow(credentialed)[0].apiKey, "<runtime-key>", "remote query credentials must survive a refresh");

const legacyReleased = {
  status: "pending",
  taskIds: ["legacy-task"],
  remoteTasks: [],
  completedTaskIds: [],
  results: [],
  count: 1,
  totalJobs: 0,
  startedAt: now,
  lastActivityAt: 0,
  error: "\u9875\u9762\u5237\u65b0\u4e2d\u65ad\u672c\u5730\u961f\u5217\uff0c\u5df2\u91ca\u653e\u4e3a\u5f85\u5904\u7406\uff0c\u53ef\u91cd\u65b0\u63d0\u4ea4"
};
recoverInterruptedRow(legacyReleased);
assert.equal(legacyReleased.status, "queued", "rows released by the old refresh behavior must resume from taskIds");
assert.deepEqual(legacyReleased.resumeRemoteTasks.map(item => item.taskId), ["legacy-task"]);

const mixed = {
  status: "partial",
  taskIds: ["task-1", "task-2"],
  remoteTasks: [
    { taskId: "task-1", queryEndpoint: "/query" },
    { taskId: "task-2", queryEndpoint: "/query" }
  ],
  completedTaskIds: ["task-1"],
  results: ["https://example.com/one.png"],
  count: 3,
  totalJobs: 3,
  startedAt: now,
  lastActivityAt: now,
  error: ""
};
recoverInterruptedRow(mixed);
assert.deepEqual(mixed.resumeRemoteTasks.map(item => item.taskId), ["task-2"]);
assert.equal(mixed.finishedJobs, 1, "completed task ids must remain counted");
assert.equal(mixed.canceledJobs, 1, "jobs without a task id must not be resubmitted automatically");
assert.match(mixed.error, /1.*\u4efb\u52a1 ID/, "unknown local jobs must be explained without resubmitting");

const localOnly = {
  status: "queued",
  taskIds: [],
  remoteTasks: [],
  completedTaskIds: [],
  results: [],
  count: 1,
  totalJobs: 1,
  startedAt: now,
  lastActivityAt: now,
  error: ""
};
recoverInterruptedRow(localOnly);
assert.equal(localOnly.status, "pending", "a local-only queued job can return to pending");

assert.match(source, /await initializeHistoryStorage\(\);[\s\S]*?resumeInterruptedRemoteTasks\(\);/, "bootstrap must resume polling after history is ready");
const recoveredProcessor = functionDeclaration("processRecoveredRemoteTask");
assert.match(recoveredProcessor, /pollTask\(/, "recovered tasks must continue through the query endpoint");
assert.doesNotMatch(recoveredProcessor, /postJson\(/, "recovered tasks must never call a create endpoint");

const appendUniqueResults = new Function(`${functionDeclaration("appendUniqueResults")}\nreturn appendUniqueResults;`)();
const motionProcessor = functionDeclaration("processMotionJob");
assert.match(motionProcessor, /if \(payload\?\.apiKey\) task\.apiKey = payload\.apiKey;/, "RunningHub query credentials must be attached before persistence");

const resultRow = { results: ["https://example.com/result.png"] };
appendUniqueResults(resultRow, ["https://example.com/result.png", "https://example.com/new.png"]);
assert.deepEqual(resultRow.results, ["https://example.com/result.png", "https://example.com/new.png"]);

[
  "appendRowResult",
  "appendImageVideoRowResult",
  "appendMotionRowResult",
  "appendAvatarRowResult",
  "appendMultiRowResult",
  "appendViduRefRowResult"
].forEach(name => {
  const declaration = functionDeclaration(name);
  assert.match(declaration, /markRemoteTaskComplete\(/, `${name} must persist completed task ids`);
  assert.match(declaration, /appendUniqueResults\(/, `${name} must not duplicate recovered results`);
});

const generationState = { generationHistory: [{ page: "image", taskId: "task-1", id: "old" }] };
const addGenerationHistory = new Function(
  "state",
  "persistGenerationHistory",
  `${functionDeclaration("addGenerationHistory")}\nreturn addGenerationHistory;`
)(generationState, () => {});
addGenerationHistory({ page: "image", taskId: "task-1", id: "new" });
assert.deepEqual(generationState.generationHistory.map(item => item.id), ["new"], "a resumed task must replace its old history record");


const constructors = ["createRow", "createImageVideoRow", "createMotionRow", "createAvatarRow", "createMultiRow", "createViduRefRow"];
constructors.forEach(name => {
  const declaration = functionDeclaration(name);
  assert.match(declaration, /remoteTasks:/, `${name} must preserve remote task metadata`);
  assert.match(declaration, /completedTaskIds:/, `${name} must preserve completed task ids`);
});

const duplicateResets = source.match(/status: "pending", taskIds: \[\], remoteTasks: \[\], completedTaskIds: \[\], results: \[\]/g) || [];
assert.equal(duplicateResets.length, 6, "duplicating any queue row must not copy remote task metadata");

const clearSubmittedArtifacts = functionDeclaration("clearSubmittedArtifacts");
assert.match(clearSubmittedArtifacts, /delete row\.resumeRemoteTasks;/, "clearing a submitted row must remove transient resume jobs");
assert.match(clearSubmittedArtifacts, /delete row\.recoveryMissingJobs;/, "clearing a submitted row must remove recovery warnings");


console.log("queue refresh resume checks passed");

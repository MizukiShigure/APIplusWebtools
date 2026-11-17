const childProcess = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = __dirname;
const expectedFiles = [
  "Setup_Workbench.ps1",
  "Setup_Workbench.bat",
  "scripts/workbench-manage.cjs",
  "scripts/check-public-source.cjs",
  "workbench-manage.test.cjs",
  "workbench-sync-integration.test.cjs",
  "docs/GIT_WORKFLOW.md",
  ".gitignore",
  "AGENTS.md",
  "CHANGELOG.md",
  "CONTRIBUTING.md",
  "README.md",
  "README_START.txt",
  "Make_Portable_Package.bat",
  "Restore_Version.bat",
  "Start_API_Tool.bat",
  "Stop_API_Tool.bat",
  "Update_From_Git.bat",
  "VERSION",
  "agent-app-integration.test.cjs",
  "agent-runtime-load.test.cjs",
  "agent-runtime-reconnect.test.cjs",
  "agent-runtime.js",
  "agent-runtime.test.cjs",
  "agent-service.cjs",
  "agent-service.test.cjs",
  "agent-skill-package.test.cjs",
  "agent-task-adapter.js",
  "agent-task-adapter.test.cjs",
  "agent-headless.cjs",
  "local-media-metadata.cjs",
  "local-media-metadata.test.cjs",
  "agent-headless.test.cjs",
  "headless-client.test.cjs",
  "workbench-model-catalog.cjs",
  "workbench-model-catalog.test.cjs",
  "workbench-browser-client.js",
  "workbench-browser-client.test.cjs",
  "workbench-ui-integration.test.cjs",
  "agent-audio-adapter.test.cjs",
  "audio-models.js",
  "audio-models.test.cjs",
  "audio-workbench-ui.js",
  "audio-workbench-ui.css",
  "audio-workbench-ui.test.cjs",
  "audio-workbench-browser.test.cjs",
  "kling-edit-ui.test.cjs",
  "skill-release.test.cjs",
  "history-audit.test.cjs",
  "agent-ui-contract.test.cjs",
  "agent-worker-integration.test.cjs",
  "avatar-workflow-store.cjs",
  "avatar-workflow-store.test.cjs",
  "avatar-workflow-media.cjs",
  "avatar-workflow-media.test.cjs",
  "avatar-workflow-service.cjs",
  "avatar-workflow-service.test.cjs",
  "avatar-workflow-server.test.cjs",
  "avatar-workflow-ui.js",
  "avatar-workflow-production.js",
  "avatar-workflow-production.test.cjs",
  "avatar-workflow-production-races.test.cjs",
  "avatar-workflow-ui.css",
  "avatar-workflow-ui.test.cjs",
  "avatar-workflow-browser.test.cjs",
  "runninghub-shared.js",
  "runninghub-shared.test.cjs",
  "docs/AVATAR_WORKFLOW.md",
  "docs/superpowers/specs/2026-09-20-avatar-workflow-design.md",
  "docs/superpowers/specs/2026-09-20-avatar-independent-stages-design.md",
  "skills/api-plus-agent/references/avatar-workflow.md",
  "skills/api-plus-agent/references/portable-setup.md",
  "skills/api-plus-agent/scripts/run-workbench.ps1",
  "app.js",
  "asset-history-integration.test.cjs",
  "asset-history-utils.js",
  "asset-history-utils.test.cjs",
  "asset-picker-ui-contract.test.cjs",
  "asset-upload-flow.test.cjs",
  "compact-model-params-layout.test.cjs",
  "data/.keep",
  "dirty-row-clear.test.cjs",
  "dirty-row-state.test.cjs",
  "docs/API_INTEGRATION.md",
  "docs/ARCHITECTURE.md",
  "docs/DATA_AND_PRIVACY.md",
  "docs/DEVELOPMENT.md",
  "docs/RELEASE_CHECKLIST.md",
  "ecosystem.config.cjs",
  "history-origin-sync.test.cjs",
  "history-origin-utils.js",
  "history-recovery.test.cjs",
  "history-viewer-group-navigation.test.cjs",
  "history-bridge.html",
  "index.html",
  "launcher-agent-data.test.cjs",
  "launcher-contract.test.cjs",
  "launcher-pm2-owner.ps1",
  "launcher-port-query.ps1",
  "launcher-node.ps1",
  "portable-runtime.test.cjs",
  "docs/LOCAL_DEPLOYMENT.md",
  "docs/AGENT_DEPLOYMENT.md",
  "local-event-store.cjs",
  "local-event-store.test.cjs",
  "model-contracts.js",
  "model-contracts.test.cjs",
  "midjourney-model-versions.test.cjs",
  "package.json",
  "portable-package.test.cjs",
  "prompt-detail-utils.js",
  "prompt-detail-utils.test.cjs",
  "prompt-detail-panel.test.cjs",
  "queue-refresh-resume.test.cjs",
  "runtime/.keep",
  "row-completion-time.test.cjs",
  "runtime-behavior.test.cjs",
  "scripts/build-portable.ps1",
  "scripts/build-skills.ps1",
  "server-agent-integration.test.cjs",
  "server.cjs",
  "skills/api-plus-agent/SKILL.md",
  "skills/api-plus-agent/agents/openai.yaml",
  "skills/api-plus-agent/references/agent-api.md",
  "skills/api-plus-agent/scripts/api-plus-agent-client.mjs",
  "start_multimodal_video_dev.bat",
  "styles.css",
  "ui-layout-contract.test.cjs",
  "models-25.test.cjs",
  "models-25-integration.test.cjs",
  "asset-picker-layout.test.cjs",
  "prompt-edit-performance.test.cjs",
  "history-performance.test.cjs",
  "history-performance-browser.test.cjs",
  "prompt-library.js",
  "prompt-library-panel.js",
  "prompt-library.css",
  "prompt-library-store.cjs",
  "prompt-library.test.cjs",
  "prompt-library-store.test.cjs",
  "video-model-defaults.test.cjs",
  "runninghub-auth.cjs",
  "runninghub-auth.test.cjs",
  "docs/MODELS_AND_PROMPT_LIBRARY.md"
].sort();

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function collectFiles(directory, relative = "") {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const nextRelative = path.posix.join(relative, entry.name);
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? collectFiles(fullPath, nextRelative) : [nextRelative];
  });
}

function readPackageText(directory) {
  return collectFiles(directory)
    .map(file => `\n--- ${file} ---\n${fs.readFileSync(path.join(directory, file), "utf8")}`)
    .join("");
}

function assertNoLiteralCredentials(text) {
  const assignment = /\b(?:api[_-]?key|token|secret|client[_-]?id)\b\s*[:=]\s*(["'`])([^"'`\r\n]*)\1/gi;
  const placeholder = /^(?:|<[^>]+>|\$\{[^}]+\}|(?:your|example|placeholder|replace|changeme|xxx)[-_a-z0-9]*)$/i;
  let match;
  while ((match = assignment.exec(text))) {
    const value = match[2].trim();
    if (match[1] === "`" && value.includes("${")) continue;
    const referenceMention = /^token\s*:\s*["']@\d+["']$/i.test(match[0]);
    assert(placeholder.test(value) || referenceMention, `portable package leaked literal credential assignment: ${match[0]}`);
  }
}

function runPortableBuilder(output, packageRoot = root) {
  return childProcess.execFileSync("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", path.join(packageRoot, "scripts", "build-portable.ps1"),
    "-OutputPath", output
  ], { cwd: packageRoot, encoding: "utf8", stdio: "pipe" });
}

function expectPortableBuilderFailure(output, packageRoot = root) {
  try {
    runPortableBuilder(output, packageRoot);
  } catch (error) {
    return String(error.stderr || error.stdout || error.message);
  }
  throw new Error(`portable builder unexpectedly accepted ${output}`);
}

function quotePowerShell(value) {
  return `'${value.replace(/'/g, "''")}'`;
}

const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const changelog = fs.readFileSync(path.join(root, "CHANGELOG.md"), "utf8");
const version = fs.readFileSync(path.join(root, "VERSION"), "utf8").trim();
const builder = path.join(root, "scripts", "build-portable.ps1");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "api-tools-portable-test-"));
const outputPath = path.join(tempRoot, "portable.zip");
const expandedPath = path.join(tempRoot, "expanded");
const rebuiltOutputPath = path.join(tempRoot, "portable-rebuilt.zip");
const rebuiltExpandedPath = path.join(tempRoot, "rebuilt-expanded");
const invalidOutputPath = path.join(tempRoot, "do-not-overwrite.txt");

try {
  assert(version === "v2026.11.18-git-agent-sync.1", "VERSION must contain the release identifier");
  assert(changelog.includes(version), "changelog must include the release identifier");
  assert(packageJson.scripts.start === "node server.cjs", "package start script must launch server.cjs");
  assert(packageJson.scripts.test.includes("portable-package.test.cjs"), "package test script must verify the distributable");
  assert(fs.existsSync(builder), "portable builder is missing");

  fs.writeFileSync(invalidOutputPath, "preserve this file", "utf8");
  const invalidOutputFailure = expectPortableBuilderFailure(invalidOutputPath);
  assert(/\.zip/i.test(invalidOutputFailure), "portable builder must explain that OutputPath requires a .zip extension");
  assert(fs.readFileSync(invalidOutputPath, "utf8") === "preserve this file", "invalid portable output must not overwrite an existing non-ZIP file");

  runPortableBuilder(outputPath);

  assert(fs.existsSync(outputPath), "portable builder did not create the requested ZIP");
  childProcess.execFileSync("powershell.exe", [
    "-NoProfile",
    "-Command",
    `Expand-Archive -LiteralPath ${quotePowerShell(outputPath)} -DestinationPath ${quotePowerShell(expandedPath)} -Force`
  ], { cwd: root, encoding: "utf8", stdio: "pipe" });

  const actualFiles = collectFiles(expandedPath).sort();
  assert(JSON.stringify(actualFiles) === JSON.stringify(expectedFiles), `unexpected portable contents: ${actualFiles.join(", ")}`);
  assert(!actualFiles.some(file => /(^|\/)(?:docs\/superpowers|task_plan\.md|findings\.md|progress\.md)$/i.test(file)), "portable package must not include planning notes");
  assert(!actualFiles.some(file => /(?:agent-auth\.json|\.jsonl$|\/staging\/|\/journals?\/)/i.test(file)), "portable package must not include tokens, journals, or staged media");
  assert(!actualFiles.some(file => /(?:^|\/)(?:local-api-workbench|workbench\.zip|SKILL_RELEASE\.json)(?:\/|$)/i.test(file)), "portable workbench must not contain local-machine skills or recursive generated packages");
  for (const folder of ["data", "runtime"]) {
    const entries = fs.readdirSync(path.join(expandedPath, folder));
    assert(entries.length === 1 && entries[0] === ".keep", `${folder} must contain only .keep`);
    assert(fs.statSync(path.join(expandedPath, folder, ".keep")).size === 0, `${folder}/.keep must be empty`);
  }

  const packageText = readPackageText(expandedPath);
  const packagedApp = fs.readFileSync(path.join(expandedPath, "app.js"), "utf8");
  const restoreScript = fs.readFileSync(path.join(expandedPath, "Restore_Version.bat"), "utf8");
  const updateScript = fs.readFileSync(path.join(expandedPath, "Update_From_Git.bat"), "utf8");
  assert(packageText.includes("--- .gitignore ---"), "sensitive scan must include .gitignore");
  assert(packageText.includes("--- AGENTS.md ---"), "portable package must include Agent project instructions");
  assert(packageText.includes("--- docs/ARCHITECTURE.md ---"), "portable package must include architecture documentation");
  assert(packageText.includes("--- docs/DEVELOPMENT.md ---"), "portable package must include the development guide");
  assert(packageText.includes("--- docs/API_INTEGRATION.md ---"), "portable package must include the API integration guide");
  assert(packageText.includes("--- docs/DATA_AND_PRIVACY.md ---"), "portable package must document local data and privacy");
  assert(packageText.includes("--- docs/RELEASE_CHECKLIST.md ---"), "portable package must include release verification guidance");
  const prohibitedPatterns = [
    { name: "personal Windows profile path", pattern: /[A-Z]:\\Users\\/i },
    { name: "current Codex workspace path", pattern: /D:\\Codex test\\/i },
    { name: "GitHub token", pattern: /\b(?:ghp|github_pat)_[A-Za-z0-9_-]{16,}\b/ },
    { name: "provider secret", pattern: /\b(?:sk[-_]|rk[-_]|pk[-_])[A-Za-z0-9_-]{16,}\b/ },
    { name: "Bearer token value", pattern: /Bearer\s+(?!\$\{)[A-Za-z0-9._-]{16,}/i },
    { name: "current data artifact", pattern: /PRIVATE_PORTABLE_(?:CACHE|QUEUE|PROMPT|SUBJECT|ROUTE)_DATA/i }
  ];
  for (const { name, pattern } of prohibitedPatterns) {
    assert(!pattern.test(packageText), `portable package leaked ${name}`);
  }
  assertNoLiteralCredentials(packageText);
  assert(packagedApp.includes('const API_DEFAULT = "https://gateway.example/api";'), "portable app must retain the approved company API Base");
  for (const concreteValue of [
    "1975951975" + "441412098",
    "25c98e4ce709d417" + "93c66fef5a68744f",
    "https://www.runninghub.ai/zh-cn/ai-detail/" + "1975951975" + "441412098"
  ]) {
    assert(!packageText.includes(concreteValue), `portable package leaked concrete RunningHub data: ${concreteValue}`);
  }
  assert(packagedApp.includes('id: "rh_motion_default"'), "portable app must use a neutral RunningHub config id");
  assert(packagedApp.includes('title: "RunningHub 工作流"'), "portable app must use a neutral RunningHub config title");
  assert(packagedApp.includes('webappId: ""'), "portable app must leave RunningHub webappId blank");
  assert(packagedApp.includes('sourceUrl: ""'), "portable app must leave RunningHub sourceUrl blank");
  assert(packagedApp.includes('clientId: ""'), "portable app must leave RunningHub clientId blank");
  assert(packagedApp.includes('versions: [{ label: "RunningHub", value: "" }]'), "portable app must use a neutral RunningHub model version");
  assert(packagedApp.includes('nodeId: "535"'), "portable app must retain the approved RunningHub workflow node template");
  assert(packagedApp.includes('nodeId: "275"'), "portable app must retain the RunningHub reference-video node");
  assert(packagedApp.includes('nodeId: "299"'), "portable app must retain the RunningHub reference-image node");

  runPortableBuilder(rebuiltOutputPath, expandedPath);
  assert(fs.existsSync(rebuiltOutputPath), "packaged portable builder did not create the second-generation ZIP");
  childProcess.execFileSync("powershell.exe", [
    "-NoProfile",
    "-Command",
    `Expand-Archive -LiteralPath ${quotePowerShell(rebuiltOutputPath)} -DestinationPath ${quotePowerShell(rebuiltExpandedPath)} -Force`
  ], { cwd: expandedPath, encoding: "utf8", stdio: "pipe" });
  const rebuiltFiles = collectFiles(rebuiltExpandedPath).sort();
  assert(JSON.stringify(rebuiltFiles) === JSON.stringify(expectedFiles), `unexpected second-generation portable contents: ${rebuiltFiles.join(", ")}`);
  const rebuiltApp = fs.readFileSync(path.join(rebuiltExpandedPath, "app.js"), "utf8");
  assert(rebuiltApp.includes('const API_DEFAULT = "https://gateway.example/api";'), "second-generation portable app must retain the approved company API Base");

  assert(/if not exist "\.git"/i.test(restoreScript), "Restore_Version.bat must guard ZIP installs without .git");
  assert(/Git clone is required/i.test(restoreScript), "Restore_Version.bat must explain that a Git clone is required in a ZIP install");
  assert(/if not exist "\.git"/i.test(updateScript), "Update_From_Git.bat must guard ZIP installs without .git");
  assert(/Git clone is required/i.test(updateScript), "Update_From_Git.bat must explain that a Git clone is required in a ZIP install");
  assert(restoreScript.includes("existing version tag"), "Restore_Version.bat must request an existing tag rather than assuming a local version was published");

  console.log("portable-package checks passed");
  require("./portable-runtime.test.cjs");
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

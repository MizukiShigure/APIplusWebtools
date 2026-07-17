const childProcess = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = __dirname;
const expectedFiles = [
  ".gitignore",
  "CHANGELOG.md",
  "README.md",
  "README_START.txt",
  "Restore_Version.bat",
  "Start_API_Tool.bat",
  "Stop_API_Tool.bat",
  "Update_From_Git.bat",
  "VERSION",
  "app.js",
  "data/.keep",
  "ecosystem.config.cjs",
  "history-bridge.html",
  "index.html",
  "launcher-pm2-owner.ps1",
  "launcher-port-query.ps1",
  "model-contracts.js",
  "package.json",
  "runtime/.keep",
  "scripts/build-portable.ps1",
  "server.cjs",
  "start_multimodal_video_dev.bat",
  "styles.css"
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
    assert(placeholder.test(value), `portable package leaked literal credential assignment: ${match[0]}`);
  }
}

function runPortableBuilder(output) {
  return childProcess.execFileSync("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", builder,
    "-OutputPath", output
  ], { cwd: root, encoding: "utf8", stdio: "pipe" });
}

function expectPortableBuilderFailure(output) {
  try {
    runPortableBuilder(output);
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
const invalidOutputPath = path.join(tempRoot, "do-not-overwrite.txt");

try {
  assert(version === "v2026.07.16-omni-ui.1", "VERSION must contain the release tag");
  assert(changelog.includes("v2026.07.16-omni-ui.1"), "changelog must include the release tag");
  assert(packageJson.scripts.start === "node server.cjs", "package start script must launch server.cjs");
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
  const prohibitedPatterns = [
    { name: "personal Windows profile path", pattern: /[A-Z]:\\Users\\/i },
    { name: "current Codex workspace path", pattern: /D:\\Codex test\\/i },
    { name: "hard-coded company gateway", pattern: /gateway\.example/i },
    { name: "GitHub token", pattern: /\b(?:ghp|github_pat)_[A-Za-z0-9_-]{16,}\b/ },
    { name: "provider secret", pattern: /\b(?:sk[-_]|rk[-_]|pk[-_])[A-Za-z0-9_-]{16,}\b/ },
    { name: "Bearer token value", pattern: /Bearer\s+(?!\$\{)[A-Za-z0-9._-]{16,}/i },
    { name: "current data artifact", pattern: /PRIVATE_PORTABLE_(?:CACHE|QUEUE|PROMPT|SUBJECT|ROUTE)_DATA/i }
  ];
  for (const { name, pattern } of prohibitedPatterns) {
    assert(!pattern.test(packageText), `portable package leaked ${name}`);
  }
  assertNoLiteralCredentials(packageText);
  assert(packageText.includes('const API_DEFAULT = "";'), "portable app must start with an empty API Base");
  for (const concreteValue of [
    "1975951975441412098",
    "25c98e4ce709d41793c66fef5a68744f",
    "https://www.runninghub.ai/zh-cn/ai-detail/1975951975441412098"
  ]) {
    assert(!packageText.includes(concreteValue), `portable package leaked concrete RunningHub data: ${concreteValue}`);
  }
  assert(packagedApp.includes('id: "rh_motion_default"'), "portable app must use a neutral RunningHub config id");
  assert(packagedApp.includes('title: "RunningHub 工作流"'), "portable app must use a neutral RunningHub config title");
  assert(packagedApp.includes('webappId: ""'), "portable app must leave RunningHub webappId blank");
  assert(packagedApp.includes('sourceUrl: ""'), "portable app must leave RunningHub sourceUrl blank");
  assert(packagedApp.includes('clientId: ""'), "portable app must leave RunningHub clientId blank");
  assert(packagedApp.includes('versions: [{ label: "RunningHub", value: "" }]'), "portable app must use a neutral RunningHub model version");
  assert(/if not exist "\.git"/i.test(restoreScript), "Restore_Version.bat must guard ZIP installs without .git");
  assert(/Git clone is required/i.test(restoreScript), "Restore_Version.bat must explain that a Git clone is required in a ZIP install");
  assert(/if not exist "\.git"/i.test(updateScript), "Update_From_Git.bat must guard ZIP installs without .git");
  assert(/Git clone is required/i.test(updateScript), "Update_From_Git.bat must explain that a Git clone is required in a ZIP install");
  assert(restoreScript.includes("v2026.07.16-omni-ui.1"), "Restore_Version.bat must show the current release tag example");

  console.log("portable-package checks passed");
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

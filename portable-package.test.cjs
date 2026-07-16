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
    .filter(file => !file.endsWith("/.keep") && file !== ".gitignore")
    .map(file => `\n--- ${file} ---\n${fs.readFileSync(path.join(directory, file), "utf8")}`)
    .join("");
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

try {
  assert(version === "v2026.07.16-omni-ui.1", "VERSION must contain the release tag");
  assert(changelog.includes("v2026.07.16-omni-ui.1"), "changelog must include the release tag");
  assert(packageJson.scripts.start === "node server.cjs", "package start script must launch server.cjs");
  assert(fs.existsSync(builder), "portable builder is missing");

  childProcess.execFileSync("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", builder,
    "-OutputPath", outputPath
  ], { cwd: root, encoding: "utf8", stdio: "pipe" });

  assert(fs.existsSync(outputPath), "portable builder did not create the requested ZIP");
  childProcess.execFileSync("powershell.exe", [
    "-NoProfile",
    "-Command",
    `Expand-Archive -LiteralPath ${quotePowerShell(outputPath)} -DestinationPath ${quotePowerShell(expandedPath)} -Force`
  ], { cwd: root, encoding: "utf8", stdio: "pipe" });

  const actualFiles = collectFiles(expandedPath).sort();
  assert(JSON.stringify(actualFiles) === JSON.stringify(expectedFiles), `unexpected portable contents: ${actualFiles.join(", ")}`);
  for (const folder of ["data", "runtime"]) {
    const entries = fs.readdirSync(path.join(expandedPath, folder));
    assert(entries.length === 1 && entries[0] === ".keep", `${folder} must contain only .keep`);
    assert(fs.statSync(path.join(expandedPath, folder, ".keep")).size === 0, `${folder}/.keep must be empty`);
  }

  const packageText = readPackageText(expandedPath);
  const prohibitedPatterns = [
    { name: "personal Windows profile path", pattern: /[A-Z]:\\Users\\/i },
    { name: "current Codex workspace path", pattern: /D:\\Codex test\\/i },
    { name: "hard-coded company gateway", pattern: /gateway\.example/i },
    { name: "GitHub token", pattern: /\b(?:ghp|github_pat)_[A-Za-z0-9_-]{16,}\b/ },
    { name: "provider secret", pattern: /\b(?:sk|rk|pk)_[A-Za-z0-9_-]{16,}\b/ },
    { name: "Bearer token value", pattern: /Bearer\s+(?!\$\{)[A-Za-z0-9._-]{16,}/i },
    { name: "planning notes", pattern: /docs\/superpowers|task_plan\.md|findings\.md|progress\.md/i },
    { name: "current data artifact", pattern: /PRIVATE_PORTABLE_(?:CACHE|QUEUE|PROMPT|SUBJECT|ROUTE)_DATA/i }
  ];
  for (const { name, pattern } of prohibitedPatterns) {
    assert(!pattern.test(packageText), `portable package leaked ${name}`);
  }
  assert(packageText.includes('const API_DEFAULT = "";'), "portable app must start with an empty API Base");

  console.log("portable-package checks passed");
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

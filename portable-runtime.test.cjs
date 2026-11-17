const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = __dirname;
const read = name => fs.readFileSync(path.join(root, name), "utf8");
for (const name of ["Start_API_Tool.bat", "Stop_API_Tool.bat"]) {
  const source = read(name);
  assert(source.indexOf('if exist "%~dp0runtime\\node.exe"') < source.indexOf("where node"), `${name}: bundled runtime must take priority`);
  assert(source.includes("API_BATCH_USE_PM2"), `${name}: portable mode must be independent of global PM2`);
}
assert(read("Start_API_Tool.bat").includes("launcher-node.ps1"), "startup must use the hidden, logged launcher");
assert(read("launcher-node.ps1").includes("-WindowStyle Hidden"));
assert(read("launcher-node.ps1").includes("-RedirectStandardError"));
assert(read("scripts/build-portable.ps1").includes("NodeRuntimePath"), "builder must accept an explicit runtime");

// A full runtime build is opt-in because source-only contract tests must stay light.
const runtime = process.env.PORTABLE_TEST_NODE;
if (runtime) {
  const temp = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "api-portable-runtime-"));
  try {
    const zip = path.join(temp, "bundle.zip");
    execFileSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File",
      path.join(root, "scripts/build-portable.ps1"), "-OutputPath", zip,
      "-NodeRuntimePath", runtime, "-NodeLicensePath", process.env.PORTABLE_TEST_LICENSE], { stdio: "pipe" });
    const out = path.join(temp, "expanded");
    const quote = value => `'${value.replace(/'/g, "''")}'`;
    execFileSync("powershell.exe", ["-NoProfile", "-Command", `Expand-Archive -LiteralPath ${quote(zip)} -DestinationPath ${quote(out)}`]);
    const crypto = require("node:crypto");
    const hash = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
    assert.equal(hash(path.join(out, "runtime/node.exe")), hash(runtime));
    assert.equal(hash(path.join(out, "runtime/LICENSE")), hash(process.env.PORTABLE_TEST_LICENSE));
    assert.deepEqual(fs.readdirSync(path.join(out, "data")), [".keep"]);
    assert.deepEqual(fs.readdirSync(path.join(out, "runtime")).sort(), [".keep", "LICENSE", "node.exe"]);
    assert(fs.existsSync(path.join(out, "docs/LOCAL_DEPLOYMENT.md")));
    assert(fs.existsSync(path.join(out, "docs/AGENT_DEPLOYMENT.md")));
    const metadata = JSON.parse(fs.readFileSync(path.join(out, "PORTABLE_BUILD.json"), "utf8"));
    assert.equal(metadata.runtime.sha256.toLowerCase(), hash(runtime));
    assert.equal(metadata.runtime.arch, "x64");
    assert.equal(execFileSync(path.join(out, "runtime/node.exe"), ["-p", "process.versions.node"], { encoding: "utf8" }).trim(), metadata.runtime.version);
  } finally {
    const resolved = path.resolve(temp);
    assert.equal(path.dirname(resolved), path.resolve(require("node:os").tmpdir()));
    assert(path.basename(resolved).startsWith("api-portable-runtime-"));
    fs.rmSync(resolved, { recursive: true, force: true });
  }
}
console.log("portable runtime checks passed");

const fs = require("fs");

const app = fs.readFileSync("app.js", "utf8");
const server = fs.readFileSync("server.cjs", "utf8");
const startBat = fs.readFileSync("Start_API_Tool.bat", "utf8");
const readme = fs.readFileSync("README.md", "utf8");
const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
const changelog = fs.readFileSync("CHANGELOG.md", "utf8");
const version = fs.readFileSync("VERSION", "utf8").trim();

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(packageJson.scripts.start === "node server.cjs", "package start script must launch server.cjs");
assert(server.includes("process.env.PORT || 4198"), "server must support configurable PORT");
assert(server.includes("/api/local/history"), "server must expose local history backup API");
assert(server.includes("data") && server.includes("history.json"), "server must save disk history backup");
assert(server.includes("fallbackHistoryFile"), "server must have an AppData fallback history file");
assert(server.includes("Internal_API_Batch"), "fallback history path must be app-specific");
assert(app.includes("LOCAL_HISTORY_BACKUP_ENDPOINT"), "app must know local history backup endpoint");
assert(app.includes("readLocalHistoryBackup"), "app must load local history backup");
assert(app.includes("scheduleLocalHistoryBackup"), "app must schedule disk history backup writes");
assert(startBat.includes("if not defined PORT set \"PORT=4198\""), "launcher must support custom PORT");
assert(startBat.includes("portable-20260716"), "launcher must open portable version URL");
assert(readme.includes("data/history.json"), "readme must document disk history backup");
assert(readme.includes("git clone git@github.com:MizukiShigure/APIplusWebtools.git"), "readme must document Git install");
assert(readme.includes("Restore_Version.bat"), "readme must document version restore");
assert(version === "v2026.07.16-portable.1", "VERSION must contain the current release tag");
assert(changelog.includes("v2026.07.16-portable.1"), "changelog must include current release tag");
assert(fs.existsSync("Make_Portable_Package.bat"), "portable package script is missing");
assert(fs.existsSync("Update_From_Git.bat"), "Git update script is missing");
assert(fs.existsSync("Restore_Version.bat"), "Git restore script is missing");

console.log("portable-package checks passed");

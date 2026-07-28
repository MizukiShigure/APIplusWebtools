APIplusWebtools - direct-use and developer package

USE THE WEB TOOL
1. Double-click Start_API_Tool.bat.
2. Open http://127.0.0.1:4198/?v=release-20260728 if the browser does not open automatically.
3. Enter your own API Base and runtime configuration in the page.
4. Double-click Stop_API_Tool.bat when finished.

DEVELOP THE PROJECT
1. Read AGENTS.md and docs/DEVELOPMENT.md.
2. Run npm test.
3. Run npm start.
4. Build a privacy-clean package with npm run package.

NOTES
- Node.js 20+ is required. You may place node.exe in runtime if Node is not installed globally.
- PM2 is optional; the launcher falls back to a normal minimized Node.js process.
- Browser rows/settings use localStorage; history uses IndexedDB plus data/history.json.
- This package starts without the maintainer's cache, prompts, queues, keys, logs, or personal workflow settings.
- Company/provider calls still require network access and a compatible API Base.

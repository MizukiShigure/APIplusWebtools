Internal API Batch - local portable launcher

How to use:
1. Double-click Start_API_Tool.bat.
2. The page will open at http://127.0.0.1:4198/?v=portable-20260716.
3. When PM2 is installed, the launcher keeps the server running as the api-plus-webtools PM2 app. Otherwise it starts Node.js in a minimized window.
4. Double-click Stop_API_Tool.bat when you want to stop the local server.

Notes:
- PM2 is optional. The launcher first tries PM2, then uses the normal Node.js fallback for portable copies.
- The default port is 4198. To use another port, run `set PORT=4300` before Start_API_Tool.bat.
- Browser cache is stored in IndexedDB.
- A disk backup is also stored in data/history.json.
- Company API calls still go through the API Base configured in the page.
- If Start_API_Tool.bat says Node.js was not found, install Node.js 20+ or put node.exe in the runtime folder next to this file.

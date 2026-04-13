#!/usr/bin/env node
/**
 * Standalone usage dashboard app.
 * Double-click launch-usage.bat → opens browser → pick report → see dashboard.
 * No MCP, no terminal interaction needed.
 */
import * as http from "http";
import * as path from "path";
import * as fs from "fs";
import { buildFullData, generateHTML, findSemanticModelPath } from "./model-usage.js";

// ---------------------------------------------------------------------------
// Recent paths storage
// ---------------------------------------------------------------------------

const RECENTS_FILE = path.join(
  process.env.LOCALAPPDATA || process.env.HOME || ".",
  "powerbi-report-mcp",
  "recent-reports.json"
);

function loadRecents(): string[] {
  try {
    return JSON.parse(fs.readFileSync(RECENTS_FILE, "utf8"));
  } catch {
    return [];
  }
}

function saveRecent(reportPath: string): void {
  const recents = loadRecents().filter(p => p !== reportPath);
  recents.unshift(reportPath);
  if (recents.length > 10) recents.length = 10;
  const dir = path.dirname(RECENTS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(RECENTS_FILE, JSON.stringify(recents, null, 2), "utf8");
}

// ---------------------------------------------------------------------------
// Landing page HTML
// ---------------------------------------------------------------------------

function landingHTML(recents: string[], error?: string): string {
  const recentItems = recents.map(p => {
    const name = path.basename(p).replace(/\.Report$/, "");
    const parent = path.basename(path.dirname(p));
    return `<button class="recent" onclick="go('${p.replace(/\\/g, "\\\\")}')">
      <span class="recent-name">${name}</span>
      <span class="recent-path">${parent}/${path.basename(p)}</span>
    </button>`;
  }).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Power BI Usage Dashboard</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Segoe UI', system-ui, sans-serif;
    background: #111827;
    color: #F9FAFB;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .container {
    width: 560px;
    padding: 48px 40px;
  }
  h1 {
    font-size: 24px;
    font-weight: 700;
    margin-bottom: 6px;
  }
  .subtitle {
    color: #9CA3AF;
    font-size: 14px;
    margin-bottom: 36px;
  }
  label {
    display: block;
    font-size: 13px;
    font-weight: 500;
    color: #D1D5DB;
    margin-bottom: 8px;
  }
  .input-row {
    display: flex;
    gap: 8px;
    margin-bottom: 12px;
  }
  input[type="text"] {
    flex: 1;
    background: #1F2937;
    border: 1px solid #374151;
    border-radius: 8px;
    padding: 10px 14px;
    font-size: 14px;
    color: #F9FAFB;
    font-family: 'Consolas', 'Cascadia Code', monospace;
    outline: none;
    transition: border-color 0.15s;
  }
  input:focus { border-color: #F59E0B; }
  button.go {
    background: #F59E0B;
    color: #111827;
    border: none;
    border-radius: 8px;
    padding: 10px 24px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.15s;
  }
  button.go:hover { background: #D97706; }
  button.go:disabled { opacity: 0.5; cursor: not-allowed; }
  .hint {
    font-size: 12px;
    color: #6B7280;
    margin-bottom: 32px;
  }
  .error {
    background: #7F1D1D;
    border: 1px solid #991B1B;
    border-radius: 8px;
    padding: 10px 14px;
    font-size: 13px;
    color: #FCA5A5;
    margin-bottom: 20px;
  }
  .divider {
    border-top: 1px solid #1F2937;
    margin: 32px 0 24px;
  }
  h2 {
    font-size: 14px;
    font-weight: 500;
    color: #9CA3AF;
    margin-bottom: 12px;
  }
  .recents {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .recent {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    background: #1F2937;
    border: 1px solid #374151;
    border-radius: 8px;
    padding: 10px 14px;
    cursor: pointer;
    text-align: left;
    color: inherit;
    transition: border-color 0.15s;
    width: 100%;
  }
  .recent:hover { border-color: #F59E0B; }
  .recent-name { font-size: 14px; font-weight: 600; }
  .recent-path { font-size: 12px; color: #6B7280; margin-top: 2px; font-family: 'Consolas', monospace; }
  .spinner {
    display: none;
    margin: 20px auto;
    width: 32px;
    height: 32px;
    border: 3px solid #374151;
    border-top-color: #F59E0B;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }
  .spinner.active { display: block; }
  @keyframes spin { to { transform: rotate(360deg); } }

  .browse-btn {
    background: #374151;
    color: #D1D5DB;
    border: 1px solid #4B5563;
    border-radius: 8px;
    padding: 10px 14px;
    font-size: 13px;
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.15s, border-color 0.15s;
  }
  .browse-btn:hover { background: #4B5563; border-color: #6B7280; }
  .browse-btn:disabled { opacity: 0.5; cursor: wait; }
</style>
</head>
<body>
<div class="container">
  <h1>Usage Dashboard</h1>
  <p class="subtitle">Analyse which measures, columns, and visuals are used in your Power BI report.</p>

  ${error ? `<div class="error">${error}</div>` : ""}

  <label for="rpath">Report path</label>
  <form id="form" action="/generate" method="GET">
    <div class="input-row">
      <input type="text" id="rpath" name="path" placeholder="C:\\Projects\\Sales.Report" value="" autocomplete="off" spellcheck="false"/>
      <button type="button" class="browse-btn" id="browse-btn" onclick="pickFolder()">Browse</button>
      <button type="submit" class="go" id="btn">Analyse</button>
    </div>
  </form>
  <p class="hint">Paste the full path or browse to your .Report folder</p>

  <div class="spinner" id="spinner"></div>

  ${recents.length > 0 ? `
  <div class="divider"></div>
  <h2>Recent reports</h2>
  <div class="recents">${recentItems}</div>
  ` : ""}
</div>
<script>
function go(p) {
  document.getElementById('rpath').value = p;
  document.getElementById('form').submit();
  document.getElementById('spinner').classList.add('active');
  document.getElementById('btn').disabled = true;
}
document.getElementById('form').addEventListener('submit', function() {
  document.getElementById('spinner').classList.add('active');
  document.getElementById('btn').disabled = true;
});
window.addEventListener('pageshow', function() {
  document.getElementById('spinner').classList.remove('active');
  document.getElementById('btn').disabled = false;
});

// --- Native folder picker ---
function pickFolder() {
  var btn = document.getElementById('browse-btn');
  btn.disabled = true;
  btn.textContent = 'Opening...';
  fetch('/pick-folder')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.path) document.getElementById('rpath').value = data.path;
    })
    .catch(function() {})
    .finally(function() { btn.disabled = false; btn.textContent = 'Browse'; });
}
</script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

function parseQuery(url: string): Record<string, string> {
  const q: Record<string, string> = {};
  const idx = url.indexOf("?");
  if (idx < 0) return q;
  url.slice(idx + 1).split("&").forEach(p => {
    const [k, v] = p.split("=");
    if (k) q[decodeURIComponent(k.replace(/\+/g, " "))] = decodeURIComponent((v || "").replace(/\+/g, " "));
  });
  return q;
}

const server = http.createServer((req, res) => {
  const url = req.url || "/";
  const pathname = url.split("?")[0];

  if (pathname === "/" || pathname === "/index.html") {
    const recents = loadRecents();
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(landingHTML(recents));
    return;
  }

  if (pathname === "/pick-folder") {
    // Open native Windows folder picker dialog
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    const { exec } = require("child_process");

    if (process.platform === "win32") {
      // PowerShell folder browser dialog
      const ps = `Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.FolderBrowserDialog; $f.Description = 'Select your .Report folder'; $f.ShowNewFolderButton = $false; if($f.ShowDialog() -eq 'OK'){ $f.SelectedPath } else { '' }`;
      exec(`powershell -NoProfile -Command "${ps}"`, { timeout: 120000 }, (err: Error | null, stdout: string) => {
        const picked = (stdout || "").trim();
        res.end(JSON.stringify({ path: picked }));
      });
    } else {
      // macOS/Linux: fall back to empty (paste path instead)
      res.end(JSON.stringify({ path: "" }));
    }
    return;
  }

  if (pathname === "/generate") {
    const query = parseQuery(url);
    const reportPath = query.path?.trim();

    if (!reportPath) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(landingHTML(loadRecents(), "Please enter a report path."));
      return;
    }

    const resolved = path.resolve(reportPath);

    if (!fs.existsSync(resolved)) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(landingHTML(loadRecents(), `Path not found: ${resolved}`));
      return;
    }

    try {
      findSemanticModelPath(resolved);
    } catch (e) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(landingHTML(loadRecents(), (e as Error).message));
      return;
    }

    try {
      const data = buildFullData(resolved);
      const reportName = path.basename(resolved).replace(/\.Report$/, "");
      const html = generateHTML(data, reportName);
      saveRecent(resolved);
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
    } catch (e) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(landingHTML(loadRecents(), `Error generating dashboard: ${(e as Error).message}`));
    }
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

let port = 5679;
server.on("error", (e: NodeJS.ErrnoException) => {
  if (e.code === "EADDRINUSE") { port++; server.listen(port); }
});

server.listen(port, () => {
  const url = `http://localhost:${port}`;
  console.log(`\n  Power BI Usage Dashboard`);
  console.log(`  ${url}\n`);

  // Open in browser
  const { exec } = require("child_process");
  const cmd = process.platform === "win32"
    ? `start "" "${url}"`
    : process.platform === "darwin"
      ? `open "${url}"`
      : `xdg-open "${url}"`;
  exec(cmd);
});

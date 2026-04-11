#!/usr/bin/env node
import * as path from "path";
import { buildFullData, generateHTML, findSemanticModelPath, getUsageDir } from "./model-usage.js";
import * as fs from "fs";
import * as http from "http";

const args = process.argv.slice(2);
const watchMode = args.includes("--watch");
const reportPath = args.find(a => !a.startsWith("--"));

if (!reportPath) {
  console.error("Usage: node dist/usage-cli.js <path-to-.Report-folder> [--watch]");
  console.error("  e.g. node dist/usage-cli.js ./my-project/Sales.Report");
  console.error("       node dist/usage-cli.js ./my-project/Sales.Report --watch");
  process.exit(1);
}

const resolved = path.resolve(reportPath);
if (!fs.existsSync(resolved)) {
  console.error(`Path not found: ${resolved}`);
  process.exit(1);
}

// Find model
let modelPath: string;
try {
  modelPath = findSemanticModelPath(resolved);
} catch (e) {
  console.error(`Error: ${(e as Error).message}`);
  process.exit(1);
}

const outDir = getUsageDir(resolved);

// Build + generate
function generate(): void {
  const start = Date.now();
  const data = buildFullData(resolved);
  const reportName = path.basename(resolved).replace(/\.Report$/, "");
  const html = generateHTML(data, reportName);

  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, "index.html");
  fs.writeFileSync(outFile, html, "utf8");
  fs.writeFileSync(path.join(outDir, "timestamp.txt"), String(Date.now()), "utf8");

  const elapsed = Date.now() - start;
  const t = data.totals;
  console.log(`> Reading model...  ${t.measuresInModel} measures, ${t.columnsInModel} columns`);
  console.log(`> Reading report... ${t.pages} pages, ${t.visuals} visuals`);
  console.log(`> Dashboard: ${outFile} (${elapsed}ms)`);
}

generate();

if (watchMode) {
  // Start local HTTP server for auto-reload (XHR blocked on file:// in Chromium)
  const MIME: Record<string, string> = { ".html": "text/html", ".txt": "text/plain", ".json": "application/json", ".css": "text/css", ".js": "application/javascript" };
  const server = http.createServer((req, res) => {
    const url = req.url?.split("?")[0] || "/";
    const file = path.join(outDir, url === "/" ? "index.html" : url);
    if (!fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
    const ext = path.extname(file);
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": "no-cache, no-store, must-revalidate",
    });
    res.end(fs.readFileSync(file));
  });

  let port = 5678;
  server.on("error", (e: NodeJS.ErrnoException) => {
    if (e.code === "EADDRINUSE") { port++; server.listen(port); }
  });
  server.listen(port, () => {
    const url = `http://localhost:${port}`;
    console.log(`> Dashboard server: ${url}`);
    console.log("> Watching for changes... (Ctrl+C to stop)\n");

    // Open in browser
    const { exec } = require("child_process");
    const cmd = process.platform === "win32" ? `start "" "${url}"` : process.platform === "darwin" ? `open "${url}"` : `xdg-open "${url}"`;
    exec(cmd);
  });

  // Use fs.watch on both folders
  const watchHandler = (folder: string) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    return fs.watch(folder, { recursive: true }, (_event, filename) => {
      if (!filename) return;
      const ext = path.extname(filename);
      if (ext !== ".json" && ext !== ".tmdl" && filename !== "model.bim") return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        const ts = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
        console.log(`> [${ts}] ${filename} changed \u2192 regenerating...`);
        try {
          generate();
        } catch (e) {
          console.error(`> [${ts}] regeneration failed:`, (e as Error).message);
        }
      }, 500);
    });
  };

  watchHandler(resolved);
  watchHandler(modelPath);

  // Keep process alive
  process.on("SIGINT", () => {
    console.log("\n> Stopped watching.");
    server.close();
    process.exit(0);
  });
} else {
  // Open in browser
  const outFile = path.join(outDir, "index.html");
  const { exec } = require("child_process");
  const cmd = process.platform === "win32" ? `start "" "${outFile}"` : process.platform === "darwin" ? `open "${outFile}"` : `xdg-open "${outFile}"`;
  exec(cmd);
}

#!/usr/bin/env node
// Smoke test for the registered MCP tool surface.
//
// Spawns dist/index.js over stdio, sends `tools/list`, and asserts the
// response matches the canonical ALL_TOOLS list parsed from src/index.ts
// (plus the `load_tools` meta-tool, which is registered separately).
//
// Catches the build-drift class of bug — where source and dist diverge,
// or a tool was added to ALL_TOOLS but not registered, or vice versa.

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// 1. Parse canonical tool list from src/index.ts (ALL_TOOLS)
// ---------------------------------------------------------------------------
function parseAllTools() {
  const src = fs.readFileSync(path.join(ROOT, "src/index.ts"), "utf8");
  const m = src.match(/const ALL_TOOLS:[^=]*=\s*\[([\s\S]*?)\];/);
  if (!m) {
    console.error("FAIL: could not locate ALL_TOOLS in src/index.ts");
    process.exit(1);
  }
  const body = m[1];
  // Strip line comments before extracting names so commented-out tools
  // (e.g. parked tools) don't sneak in.
  const cleaned = body.replace(/\/\/[^\n]*/g, "");
  const names = [];
  const re = /"([a-z_][a-z0-9_]*)"/gi;
  let nm;
  while ((nm = re.exec(cleaned))) names.push(nm[1]);
  return names;
}

// ---------------------------------------------------------------------------
// 2. Spawn the server, send tools/list, collect response
// ---------------------------------------------------------------------------
function listTools() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, "dist/index.js")], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const settle = (fn, val) => { if (!settled) { settled = true; fn(val); try { child.kill(); } catch {} } };

    const timer = setTimeout(() => settle(reject, new Error("timeout waiting for tools/list response")), 10000);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
      // Try to parse line-delimited JSON-RPC messages.
      let nl;
      while ((nl = stdout.indexOf("\n")) >= 0) {
        const line = stdout.slice(0, nl);
        stdout = stdout.slice(nl + 1);
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.id === 1 && msg.result) {
            clearTimeout(timer);
            settle(resolve, msg.result);
            return;
          }
        } catch {
          // Not JSON or partial — keep buffering.
        }
      }
    });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", (err) => settle(reject, err));
    child.on("exit", (code) => {
      if (!settled) settle(reject, new Error(`server exited prematurely (code ${code})\nstderr:\n${stderr}`));
    });

    // Initialize → notifications/initialized → tools/list
    const init = {
      jsonrpc: "2.0", id: 0, method: "initialize",
      params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "tool-surface-test", version: "0" } },
    };
    const initialized = { jsonrpc: "2.0", method: "notifications/initialized" };
    const list = { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} };
    child.stdin.write(JSON.stringify(init) + "\n");
    child.stdin.write(JSON.stringify(initialized) + "\n");
    child.stdin.write(JSON.stringify(list) + "\n");
  });
}

// ---------------------------------------------------------------------------
// 3. Assert
// ---------------------------------------------------------------------------
(async () => {
  const expected = new Set(parseAllTools());
  // load_tools is registered separately as a meta-tool, always active.
  expected.add("load_tools");

  let result;
  try {
    result = await listTools();
  } catch (err) {
    console.error("FAIL: could not list tools from dist/index.js");
    console.error(err.message || err);
    process.exit(1);
  }
  if (!Array.isArray(result.tools)) {
    console.error("FAIL: tools/list response missing `tools` array");
    process.exit(1);
  }

  const surface = new Set(result.tools.map((t) => t.name));
  const missing = [...expected].filter((n) => !surface.has(n)).sort();
  const extras = [...surface].filter((n) => !expected.has(n)).sort();

  if (missing.length || extras.length) {
    console.error("FAIL: registered tool surface does not match source.");
    if (missing.length) console.error("  Missing (in source ALL_TOOLS but not in surface):", missing);
    if (extras.length) console.error("  Extras (in surface but not in source ALL_TOOLS):", extras);
    process.exit(1);
  }

  // Schema check: every tool must have inputSchema
  const noSchema = result.tools.filter((t) => !t.inputSchema).map((t) => t.name);
  if (noSchema.length) {
    console.error("FAIL: tools missing inputSchema:", noSchema);
    process.exit(1);
  }

  // Soft warn: annotations may not be echoed by all clients, so this is
  // informational rather than a hard fail.
  const noAnnot = result.tools.filter((t) => !t.annotations).map((t) => t.name);
  if (noAnnot.length) {
    console.warn(`[soft] ${noAnnot.length} tool(s) missing annotations in tools/list response: ${noAnnot.slice(0, 5).join(", ")}${noAnnot.length > 5 ? "…" : ""}`);
  }

  console.log(`✓ Tool surface OK — ${result.tools.length} tools registered, all match source ALL_TOOLS.`);
  process.exit(0);
})();

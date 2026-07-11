#!/usr/bin/env node
// Smoke test for the registered MCP tool surface.
//
// Spawns dist/index.js over stdio, sends `tools/list`, and asserts the
// response matches the canonical ALL_TOOLS list parsed from src/index.ts
// (plus the `pbir_load_tools` meta-tool, which is registered separately).
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
function listToolsAndResources() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, "dist/index.js")], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const collected = { tools: null, resources: null };
    const settle = (fn, val) => { if (!settled) { settled = true; fn(val); try { child.kill(); } catch {} } };

    const timer = setTimeout(() => settle(reject, new Error("timeout waiting for tools/list + resources/list responses")), 10000);

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
          if (msg.id === 1 && msg.result) collected.tools = msg.result;
          if (msg.id === 2 && msg.result) collected.resources = msg.result;
          if (collected.tools && collected.resources) {
            clearTimeout(timer);
            settle(resolve, collected);
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

    // Initialize → notifications/initialized → tools/list + resources/list
    const init = {
      jsonrpc: "2.0", id: 0, method: "initialize",
      params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "tool-surface-test", version: "0" } },
    };
    const initialized = { jsonrpc: "2.0", method: "notifications/initialized" };
    const list = { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} };
    const listRes = { jsonrpc: "2.0", id: 2, method: "resources/list", params: {} };
    child.stdin.write(JSON.stringify(init) + "\n");
    child.stdin.write(JSON.stringify(initialized) + "\n");
    child.stdin.write(JSON.stringify(list) + "\n");
    child.stdin.write(JSON.stringify(listRes) + "\n");
  });
}

// ---------------------------------------------------------------------------
// 3. Assert
// ---------------------------------------------------------------------------
(async () => {
  const expected = new Set(parseAllTools());
  // pbir_load_tools is registered separately as a meta-tool, always active.
  expected.add("pbir_load_tools");

  let combined;
  try {
    combined = await listToolsAndResources();
  } catch (err) {
    console.error("FAIL: could not list tools/resources from dist/index.js");
    console.error(err.message || err);
    process.exit(1);
  }
  const result = combined.tools;
  const resourcesResult = combined.resources;
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

  // Schema check: read tools listed in READ_TOOL_SCHEMAS must publish an
  // outputSchema (their response shape is known and clients should validate).
  // Mutation tools and verbose-dump reads opt out — see GENERIC_OUTPUT_SCHEMA
  // comment block in src/index.ts. We parse the keys of READ_TOOL_SCHEMAS
  // out of the source rather than importing the TS module.
  const outSchemaSrc = fs.readFileSync(path.join(ROOT, "src/helpers/outputSchemas.ts"), "utf8");
  const recordMatch = outSchemaSrc.match(/READ_TOOL_SCHEMAS[^=]*=\s*\{([\s\S]*?)\};/);
  const expectOutputSchema = new Set();
  if (recordMatch) {
    // Strip line comments first — the map body has explanatory `//` comments
    // that name tools intentionally EXCLUDED from the map (e.g. pbir_get_visual,
    // omitted because verbose:true's shape is too wide for a tight schema).
    // Without stripping, the regex below picks those names up as if they were
    // actual keys and wrongly demands an outputSchema for them too.
    const cleaned = recordMatch[1].replace(/\/\/[^\n]*/g, "");
    const re = /pbir_[a-z_]+/g;
    let mm;
    while ((mm = re.exec(cleaned))) expectOutputSchema.add(mm[0]);
  }
  const missingOutSchema = result.tools
    .filter((t) => expectOutputSchema.has(t.name) && !t.outputSchema)
    .map((t) => t.name);
  if (missingOutSchema.length) {
    console.error("FAIL: tools listed in READ_TOOL_SCHEMAS but missing outputSchema in surface:", missingOutSchema);
    process.exit(1);
  }
  const totalOutSchema = result.tools.filter((t) => !!t.outputSchema).length;
  console.log(`  outputSchema declared on ${totalOutSchema}/${result.tools.length} tools (read tools); ${result.tools.length - totalOutSchema} mutation/dump tools opt out.`);

  // Every tool should have a human title set via registerTool({title}).
  const noTitle = result.tools.filter((t) => !t.title).map((t) => t.name);
  if (noTitle.length) {
    console.warn(`[soft] ${noTitle.length} tool(s) missing title in tools/list response: ${noTitle.slice(0, 5).join(", ")}${noTitle.length > 5 ? "…" : ""}`);
  }

  // Soft warn: annotations may not be echoed by all clients, so this is
  // informational rather than a hard fail.
  const noAnnot = result.tools.filter((t) => !t.annotations).map((t) => t.name);
  if (noAnnot.length) {
    console.warn(`[soft] ${noAnnot.length} tool(s) missing annotations in tools/list response: ${noAnnot.slice(0, 5).join(", ")}${noAnnot.length > 5 ? "…" : ""}`);
  }

  console.log(`✓ Tool surface OK — ${result.tools.length} tools registered, all match source ALL_TOOLS.`);

  // -------------------------------------------------------------------
  // Resource surface — pbir-instructions + one resource per non-underscore
  // file in skills/. Catches the case where a new skill file is added but
  // the per-skill resource registration block in src/index.ts breaks.
  // -------------------------------------------------------------------
  if (!resourcesResult || !Array.isArray(resourcesResult.resources)) {
    console.error("FAIL: resources/list response missing `resources` array");
    process.exit(1);
  }
  const skillsDir = path.join(ROOT, "skills");
  const expectedSkillTopics = fs
    .readdirSync(skillsDir)
    .filter((f) => f.endsWith(".md") && !f.startsWith("_"))
    .map((f) => f.replace(/\.md$/, ""))
    .sort();
  const skillResourceUris = new Set(
    resourcesResult.resources.map((r) => r.uri).filter((u) => u.startsWith("resource://pbir-skill/"))
  );
  const missingSkill = expectedSkillTopics.filter((t) => !skillResourceUris.has(`resource://pbir-skill/${t}`));
  const extraSkill = [...skillResourceUris].filter((u) => !expectedSkillTopics.includes(u.replace("resource://pbir-skill/", "")));
  if (missingSkill.length || extraSkill.length) {
    console.error("FAIL: per-skill resource surface mismatch.");
    if (missingSkill.length) console.error("  Missing skill resources:", missingSkill);
    if (extraSkill.length) console.error("  Extra skill resources:", extraSkill);
    process.exit(1);
  }
  if (skillResourceUris.size !== expectedSkillTopics.length) {
    console.error(`FAIL: skill resource count mismatch — expected ${expectedSkillTopics.length}, got ${skillResourceUris.size}`);
    process.exit(1);
  }
  // pbir-instructions must still be present alongside the per-skill set.
  const hasInstructions = resourcesResult.resources.some((r) => r.uri === "resource://pbir-instructions");
  if (!hasInstructions) {
    console.error("FAIL: resource://pbir-instructions missing from surface");
    process.exit(1);
  }
  console.log(`✓ Resource surface OK — pbir-instructions + ${skillResourceUris.size} per-skill resources match skills/*.md.`);
  process.exit(0);
})();

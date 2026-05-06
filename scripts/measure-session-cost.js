#!/usr/bin/env node
// Session-cost profiler for the powerbi-report-mcp.
//
// Measures per-session token cost across three buckets:
//   1. Tool catalog (paid once at session start in the tools/list response)
//   2. Tool result payloads (paid per call)
//   3. Skill content (paid per pbir_guide(topic) load)
//
// Token approximation: chars / 4. This is a standard rough approximation for
// English text + JSON, accurate to within ~10-15% for our use case. For
// production-grade measurement, swap in @anthropic-ai/tokenizer — but for a
// "is this a problem?" triage, char/4 is fine. The script auto-prefers
// @anthropic-ai/tokenizer if it's already installed.
//
// Output: measurement/session-baseline.md (overwritten each run).
//
// Usage: npm run measure:session
//
// Non-destructive: skips all mutation tools. Spawns dist/index.js with
// PBIR_REPORT_PATH set to the bundled fixture so it auto-binds.

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const FIXTURE = path.join(ROOT, "evals/fixtures/sample.Report");
const OUT_DIR = path.join(ROOT, "measurement");
const OUT_FILE = path.join(OUT_DIR, "session-baseline.md");

// ---------------------------------------------------------------------------
// Tokenizer (auto-prefer @anthropic-ai/tokenizer if available; else chars/4)
// ---------------------------------------------------------------------------
let tokenize;
let tokenizerName = "chars/4 (~10-15% accuracy)";
try {
  // eslint-disable-next-line global-require
  const tk = require("@anthropic-ai/tokenizer");
  if (tk && typeof tk.countTokens === "function") {
    tokenize = (s) => tk.countTokens(String(s ?? ""));
    tokenizerName = "@anthropic-ai/tokenizer (exact)";
  }
} catch {
  // fall through
}
if (!tokenize) {
  tokenize = (s) => Math.ceil(String(s ?? "").length / 4);
}

// ---------------------------------------------------------------------------
// JSON-RPC client over stdio
// ---------------------------------------------------------------------------
function startServer() {
  const child = spawn(process.execPath, [path.join(ROOT, "dist/index.js")], {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, PBIR_REPORT_PATH: FIXTURE },
  });

  let buf = "";
  const pending = new Map();
  child.stdout.on("data", (chunk) => {
    buf += chunk.toString();
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.id != null && pending.has(msg.id)) {
          const { resolve } = pending.get(msg.id);
          pending.delete(msg.id);
          resolve(msg);
        }
      } catch {
        // ignore non-JSON or partial
      }
    }
  });
  child.stderr.on("data", () => { /* swallow */ });

  let nextId = 0;
  function send(method, params) {
    const id = ++nextId;
    const req = { jsonrpc: "2.0", id, method, params: params || {} };
    const reqStr = JSON.stringify(req);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`timeout waiting for ${method}`));
      }, 15000);
      pending.set(id, {
        resolve: (msg) => { clearTimeout(timer); resolve({ msg, reqStr }); },
      });
      child.stdin.write(reqStr + "\n");
    });
  }

  function notify(method, params) {
    const note = { jsonrpc: "2.0", method, params: params || {} };
    child.stdin.write(JSON.stringify(note) + "\n");
  }

  function close() {
    try { child.kill(); } catch { /* noop */ }
  }

  return { send, notify, close };
}

// ---------------------------------------------------------------------------
// Session sequence
// ---------------------------------------------------------------------------
async function run() {
  if (!fs.existsSync(path.join(ROOT, "dist/index.js"))) {
    console.error("dist/index.js not found — run `npm run build` first.");
    process.exit(1);
  }
  if (!fs.existsSync(FIXTURE)) {
    console.error(`Fixture not found: ${FIXTURE}`);
    process.exit(1);
  }

  const server = startServer();

  // Initialize
  await server.send("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "measure-session-cost", version: "0" },
  });
  server.notify("notifications/initialized");

  const results = {
    tokenizer: tokenizerName,
    timestamp: new Date().toISOString(),
    catalog: null,        // { totalTokens, perTool: [{name, tokens}] }
    resourceCatalog: null, // { totalTokens, count }
    calls: [],            // { step, tool, args, requestTokens, responseTokens, error }
    skills: [],           // { topic, tokens }
  };

  // Step: tools/list
  try {
    const { msg, reqStr } = await server.send("tools/list", {});
    const respStr = JSON.stringify(msg);
    const tools = msg.result?.tools || [];
    const perTool = tools
      .map((t) => ({ name: t.name, tokens: tokenize(JSON.stringify(t)) }))
      .sort((a, b) => b.tokens - a.tokens);
    results.catalog = {
      totalTokens: tokenize(respStr),
      requestTokens: tokenize(reqStr),
      toolCount: tools.length,
      perTool,
    };
  } catch (err) {
    results.catalog = { error: String(err.message || err) };
  }

  // Step: resources/list
  try {
    const { msg, reqStr } = await server.send("resources/list", {});
    const respStr = JSON.stringify(msg);
    const resources = msg.result?.resources || [];
    results.resourceCatalog = {
      totalTokens: tokenize(respStr),
      requestTokens: tokenize(reqStr),
      count: resources.length,
    };
  } catch (err) {
    results.resourceCatalog = { error: String(err.message || err) };
  }

  // Helper to call a tool & record
  async function callTool(step, name, args, notes) {
    const argSummary = JSON.stringify(args);
    const entry = { step, tool: name, args: argSummary, notes: notes || "" };
    try {
      const { msg, reqStr } = await server.send("tools/call", { name, arguments: args });
      const respStr = JSON.stringify(msg);
      entry.requestTokens = tokenize(reqStr);
      entry.responseTokens = tokenize(respStr);
      // Break down: structuredContent vs content[0].text
      const sc = msg.result?.structuredContent;
      const txt = msg.result?.content?.[0]?.text;
      entry.structuredTokens = sc ? tokenize(JSON.stringify(sc)) : 0;
      entry.textTokens = txt ? tokenize(String(txt)) : 0;
      entry.error = msg.error ? JSON.stringify(msg.error).slice(0, 200) : null;
      entry.raw = msg.result;
    } catch (err) {
      entry.error = String(err.message || err);
      entry.requestTokens = 0;
      entry.responseTokens = 0;
    }
    results.calls.push(entry);
    return entry;
  }

  // 3. pbir_get_report
  await callTool(3, "pbir_get_report", {}, "typical first call");

  // 4. pbir_list_pages slim
  const slimPages = await callTool(4, "pbir_list_pages", { slim: true }, "slim mode");

  // Extract first pageId for downstream calls
  let firstPageId = null;
  try {
    const sc = slimPages.raw?.structuredContent;
    const pages = sc?.pages || sc?.data?.pages || [];
    firstPageId = pages[0]?.id || pages[0]?.pageId || pages[0]?.name || null;
  } catch { /* noop */ }

  // 5. pbir_list_pages full + visuals
  await callTool(5, "pbir_list_pages", { slim: false, includeVisuals: true }, "full mode + visuals (cross-page)");

  // 6. pbir_list_visuals scoped
  let firstVisualId = null;
  if (firstPageId) {
    const vis = await callTool(6, "pbir_list_visuals", { pageId: firstPageId }, "page-scoped");
    try {
      const sc = vis.raw?.structuredContent;
      const visuals = sc?.visuals || sc?.data?.visuals || [];
      firstVisualId = visuals[0]?.id || visuals[0]?.visualId || visuals[0]?.name || null;
    } catch { /* noop */ }
  } else {
    results.calls.push({ step: 6, tool: "pbir_list_visuals", args: "{}", error: "skipped — no pageId from step 4", requestTokens: 0, responseTokens: 0 });
  }

  // 7. pbir_get_visual slim
  if (firstPageId && firstVisualId) {
    await callTool(7, "pbir_get_visual", { pageId: firstPageId, visualId: firstVisualId, slim: true }, "slim visual fetch");
  } else {
    results.calls.push({ step: 7, tool: "pbir_get_visual", args: "{}", error: "skipped — no visual id", requestTokens: 0, responseTokens: 0 });
  }

  // 8. pbir_get_visual verbose
  if (firstPageId && firstVisualId) {
    await callTool(8, "pbir_get_visual", { pageId: firstPageId, visualId: firstVisualId, verbose: true }, "VERBOSE worst-case");
  } else {
    results.calls.push({ step: 8, tool: "pbir_get_visual", args: "{}", error: "skipped — no visual id", requestTokens: 0, responseTokens: 0 });
  }

  // 9. pbir_get_report_theme
  await callTool(9, "pbir_get_report_theme", {}, "theme read");

  // 10. pbir_audit_theme_compliance
  await callTool(10, "pbir_audit_theme_compliance", {}, "default topN:20");

  // 11. pbir_lookup_theme_property
  await callTool(11, "pbir_lookup_theme_property", { visualType: "card" }, "schema lookup");

  // 12. pbir_guide wireframes (skill)
  // NOTE: pbir_guide has an outputSchema but returns text-only content, which
  // currently fails MCP SDK output-validation. We record that response (likely
  // an error envelope) for completeness, then ALSO fetch the same skill via
  // resources/read — both paths cost the model the same skill body, so we
  // report the resource read as the canonical skill-load cost.
  const guideW = await callTool(12, "pbir_guide", { topic: "wireframes" }, "tool path (text content)");
  const guideE = await callTool(13, "pbir_guide", { topic: "errors" }, "tool path (text content)");

  // Read the same skill bodies via the resource API for accurate skill-load
  // cost measurement.
  async function readSkill(topic) {
    try {
      const { msg, reqStr } = await server.send("resources/read", { uri: `resource://pbir-skill/${topic}` });
      const respStr = JSON.stringify(msg);
      const text = msg.result?.contents?.[0]?.text || "";
      return {
        topic,
        tokens: tokenize(respStr),
        textTokens: tokenize(text),
        requestTokens: tokenize(reqStr),
        error: msg.error ? JSON.stringify(msg.error).slice(0, 200) : null,
      };
    } catch (err) {
      return { topic, tokens: 0, textTokens: 0, error: String(err.message || err) };
    }
  }
  const skillW = await readSkill("wireframes");
  const skillE = await readSkill("errors");
  results.skills.push({ ...skillW, source: "resources/read" });
  results.skills.push({ ...skillE, source: "resources/read" });

  // 14. pbir_get_visual_types
  await callTool(14, "pbir_get_visual_types", {}, "type list");

  // 15. pbir_model_usage
  await callTool(15, "pbir_model_usage", {}, "no semantic model in fixture; measures shape");

  server.close();

  // -------------------------------------------------------------------------
  // Build report
  // -------------------------------------------------------------------------
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const md = renderReport(results);
  fs.writeFileSync(OUT_FILE, md);
  console.log(`Wrote ${path.relative(ROOT, OUT_FILE)}`);

  // Print one-line verdict to stdout
  const totals = computeTotals(results);
  console.log(`Total session: ${totals.total} tokens; catalog ${totals.catalogPct}% (${totals.catalog} tok); calls ${totals.callsTotal} tok; skills ${totals.skillsTotal} tok.`);
}

// ---------------------------------------------------------------------------
// Totals + report rendering
// ---------------------------------------------------------------------------
function computeTotals(r) {
  const catalog = r.catalog?.totalTokens || 0;
  const resourceCatalog = r.resourceCatalog?.totalTokens || 0;
  // Skill calls (steps 12 & 13) are split out; everything else is "calls".
  const skillSteps = new Set([12, 13]);
  const callsTotal = r.calls
    .filter((c) => !skillSteps.has(c.step))
    .reduce((s, c) => s + (c.responseTokens || 0), 0);
  const skillsTotal = r.skills.reduce((s, c) => s + (c.tokens || 0), 0);
  const total = catalog + resourceCatalog + callsTotal + skillsTotal;
  const pct = (n) => (total > 0 ? ((n / total) * 100).toFixed(1) : "0");
  return {
    catalog, resourceCatalog, callsTotal, skillsTotal, total,
    catalogPct: pct(catalog),
    resourcePct: pct(resourceCatalog),
    callsPct: pct(callsTotal),
    skillsPct: pct(skillsTotal),
  };
}

function renderReport(r) {
  const t = computeTotals(r);
  const top10 = (r.catalog?.perTool || []).slice(0, 10);
  const catalogTotal = r.catalog?.totalTokens || 1;

  const skillSteps = new Set([12, 13]);
  const callRows = r.calls.map((c) => {
    const tok = c.responseTokens != null ? c.responseTokens : "[ERROR]";
    const err = c.error ? ` (err: ${String(c.error).slice(0, 60)})` : "";
    return `| ${c.step} | ${c.tool} | \`${truncate(c.args, 40)}\` | ${tok} | ${escapePipe(c.notes || "")}${err} |`;
  }).join("\n");

  const top10Rows = top10.map((t, i) => {
    const pct = ((t.tokens / catalogTotal) * 100).toFixed(1);
    return `| ${i + 1} | ${t.name} | ${t.tokens} | ${pct}% |`;
  }).join("\n");

  // Find biggest non-skill response
  const biggestCall = r.calls
    .filter((c) => !skillSteps.has(c.step) && c.responseTokens != null)
    .sort((a, b) => (b.responseTokens || 0) - (a.responseTokens || 0))[0];

  const biggestCatalog = top10[0];

  // Verdict
  const catalogPctNum = parseFloat(t.catalogPct);
  let verdict;
  if (catalogPctNum > 30) verdict = "**dominates** (>30%) — Tier C (selective consolidation) recommended.";
  else if (catalogPctNum >= 10) verdict = "**middling** (10-30%) — Tier B (sharpen call patterns) recommended.";
  else verdict = "**not the bottleneck** (<10%) — skip catalog optimization; focus on call payloads.";

  return `# Session Cost Baseline — v0.9.5

Measurement run: ${r.timestamp}
Token approximation: ${r.tokenizer}
Fixture: evals/fixtures/sample.Report

## Summary

| Bucket | Tokens | % of total |
|--------|-------:|-----------:|
| Tool catalog (tools/list) | ${t.catalog} | ${t.catalogPct}% |
| Resource catalog (resources/list) | ${t.resourceCatalog} | ${t.resourcePct}% |
| Tool result payloads (${r.calls.length - r.skills.length} calls) | ${t.callsTotal} | ${t.callsPct}% |
| Skill content loaded (${r.skills.length} guide calls) | ${t.skillsTotal} | ${t.skillsPct}% |
| **Total per representative session** | **${t.total}** | **100%** |

Catalog tool count: ${r.catalog?.toolCount ?? "?"}
Resource count: ${r.resourceCatalog?.count ?? "?"}

## Top 10 most-expensive tools in the catalog

| Rank | Tool | Catalog tokens | % of catalog |
|------|------|---------------:|-------------:|
${top10Rows}

## Per-call result sizes

| Step | Tool | Args summary | Tokens | Notes |
|------|------|--------------|-------:|-------|
${callRows}

## Skill load costs

| Topic | Tokens | Text tokens | Source | Notes |
|-------|-------:|------------:|--------|-------|
${r.skills.map((s) => `| ${s.topic} | ${s.tokens} | ${s.textTokens} | ${s.source || "tool"} | ${s.error ? `err: ${String(s.error).slice(0, 60)}` : "skill body"} |`).join("\n")}

## Interpretation

Catalog accounts for ${t.catalogPct}% of the representative session's token cost (${t.catalog} of ${t.total} total). The most-expensive single tool entry in the catalog is **${biggestCatalog?.name ?? "n/a"}** at ${biggestCatalog?.tokens ?? 0} tokens (${biggestCatalog ? ((biggestCatalog.tokens / catalogTotal) * 100).toFixed(1) : 0}% of catalog). The most-expensive call response in this sequence is **${biggestCall?.tool ?? "n/a"}** (step ${biggestCall?.step ?? "?"}) at ${biggestCall?.responseTokens ?? 0} tokens. Verdict: ${verdict}
`;
}

function truncate(s, n) { s = String(s ?? ""); return s.length > n ? s.slice(0, n - 1) + "…" : s; }
function escapePipe(s) { return String(s).replace(/\|/g, "\\|"); }

run().catch((err) => {
  console.error("FAIL:", err.message || err);
  process.exit(1);
});

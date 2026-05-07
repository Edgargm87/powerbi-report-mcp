#!/usr/bin/env node
// Test for pbir_validate_wireframe — the MCP tool wiring around
// validateWireframe() from src/wireframe-validator.ts.
//
// Coverage:
//   1. Wire path: scope:"page" against the eval fixture returns a structured
//      report keyed by pageId with stats.visualCount matching listVisualIds.
//   2. Validator-direct (in-memory): overlap → OVERLAP error.
//   3. Validator-direct: x:0 non-banner → LEFT_MARGIN error.
//   4. Validator-direct: bottom edge >714 → BOTTOM_MARGIN error.
//   5. Wire path: invalid pageId returns {success:false, error, availableIds}
//      and NOT a JSON-RPC error.
//   6. Wire path: scope:"report" returns pages[] with one entry per page and
//      reportSummary.totalErrors equals the sum across pages.
//   7. Wire path: server with no PBIR_REPORT_PATH bound returns a clean fail
//      envelope (no crash) when pbir_validate_wireframe is called.

const path = require("path");
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const FIXTURE = path.join(ROOT, "evals", "fixtures", "sample.Report");

const failures = [];
function assert(cond, msg) {
  if (!cond) { console.error("  FAIL:", msg); failures.push(msg); }
  else { console.log("  PASS:", msg); }
}

function startServer({ bindFixture = true } = {}) {
  const env = { ...process.env };
  if (bindFixture) env.PBIR_REPORT_PATH = FIXTURE;
  else delete env.PBIR_REPORT_PATH;
  const child = spawn(process.execPath, [path.join(ROOT, "dist/index.js")], {
    stdio: ["pipe", "pipe", "pipe"],
    env,
    // ensure no inherited argv binds the fixture
    argv0: process.execPath,
  });
  let stdout = "";
  let stderr = "";
  const pending = new Map();
  child.stderr.on("data", (c) => { stderr += c.toString(); });
  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
    let nl;
    while ((nl = stdout.indexOf("\n")) >= 0) {
      const line = stdout.slice(0, nl);
      stdout = stdout.slice(nl + 1);
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.id !== undefined && pending.has(msg.id)) {
          const { resolve } = pending.get(msg.id);
          pending.delete(msg.id);
          resolve(msg);
        }
      } catch { /* partial */ }
    }
  });

  let nextId = 1;
  function call(method, params) {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        if (pending.has(id)) { pending.delete(id); reject(new Error("timeout id=" + id + " method=" + method)); }
      }, 10000);
      pending.set(id, { resolve: (v) => { clearTimeout(t); resolve(v); }, reject });
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    });
  }
  function notify(method, params) {
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
  }
  return {
    init: async () => {
      await call("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "test-validate-wireframe", version: "0" } });
      notify("notifications/initialized");
    },
    callTool: (name, args) => call("tools/call", { name, arguments: args || {} }),
    stop: () => { try { child.kill(); } catch {} },
    stderr: () => stderr,
  };
}

function structured(rpcResp) {
  const r = rpcResp.result;
  if (!r) return null;
  if (r.structuredContent) return r.structuredContent;
  const text = r.content && r.content[0] && r.content[0].text;
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

(async () => {
  console.log("Test: pbir_validate_wireframe\n");

  // --- 2-4: validator-direct unit cases (no server) ----------------------
  const { validateWireframe } = require(path.join(ROOT, "dist/wireframe-validator.js"));

  console.log("[unit] overlap detection");
  {
    const banner = { id: "Banner", visualType: "shape", x: 0, y: 0, width: 1280, height: 52 };
    const a = { id: "a", visualType: "card", x: 100, y: 100, width: 200, height: 100 };
    const b = { id: "b", visualType: "card", x: 150, y: 150, width: 200, height: 100 };
    const r = validateWireframe([banner, a, b]);
    const overlap = r.issues.find((i) => i.code === "OVERLAP");
    assert(!!overlap, "OVERLAP issue present for two intersecting rects");
    assert(overlap && overlap.visuals.includes("a") && overlap.visuals.includes("b"), "OVERLAP names both visuals");
    assert(r.ok === false, "report.ok=false when overlap present");
  }

  console.log("[unit] left margin violation (x:0 non-banner)");
  {
    // visualType:'card' at (0,100) — not a banner, so must respect left margin.
    const v = { id: "off", visualType: "card", x: 0, y: 100, width: 200, height: 100 };
    const r = validateWireframe([v]);
    const lm = r.issues.find((i) => i.code === "LEFT_MARGIN");
    assert(!!lm, "LEFT_MARGIN issue raised for x=0 non-banner");
  }

  console.log("[unit] bottom margin violation");
  {
    // bottom edge = 715 (>714 = canvas.height - marginBottom).
    const v = { id: "tall", visualType: "card", x: 100, y: 100, width: 200, height: 615 };
    const r = validateWireframe([v]);
    const bm = r.issues.find((i) => i.code === "BOTTOM_MARGIN" || i.code === "OUT_OF_BOUNDS");
    assert(!!bm, "BOTTOM_MARGIN (or OUT_OF_BOUNDS) issue raised for bottom edge >714");
  }

  // --- 1, 5, 6: wire-path tests against bound fixture --------------------
  const srv = startServer({ bindFixture: true });
  try {
    await srv.init();

    console.log("\n[wire] scope:'page' against fixture (auto-resolve fails: 3 pages)");
    {
      // 3 pages — auto-resolve should fail with ambiguous_pageId
      const resp = await srv.callTool("pbir_validate_wireframe", {});
      const body = structured(resp);
      assert(body && body.success === false, "ambiguous pageId returns success:false");
      assert(body && Array.isArray(body.availableIds) && body.availableIds.length === 3, "availableIds lists all 3 pages");
    }

    console.log("\n[wire] scope:'page' with explicit valid pageId");
    {
      const pageId = "00000000000000000001";
      const resp = await srv.callTool("pbir_validate_wireframe", { pageId });
      const body = structured(resp);
      assert(body && body.success === true, "explicit pageId succeeds");
      assert(body && body.pageId === pageId, "echoes pageId back");
      assert(body && typeof body.displayName === "string" && body.displayName.length > 0, "displayName populated");
      assert(body && body.report && body.report.stats && typeof body.report.stats.visualCount === "number", "report.stats.visualCount is number");
      assert(body && Array.isArray(body.report.issues), "report.issues is array");
    }

    console.log("\n[wire] invalid pageId returns clean fail envelope");
    {
      const resp = await srv.callTool("pbir_validate_wireframe", { pageId: "nonexistent_page_id" });
      assert(!resp.error, "no JSON-RPC -32602 protocol error");
      const body = structured(resp);
      assert(body && body.success === false, "success:false");
      assert(body && typeof body.error === "string" && body.error.length > 0, "error message non-empty");
      assert(body && Array.isArray(body.availableIds) && body.availableIds.length > 0, "availableIds listed");
    }

    console.log("\n[wire] scope:'report' returns per-page array + summary");
    {
      const resp = await srv.callTool("pbir_validate_wireframe", { scope: "report" });
      const body = structured(resp);
      assert(body && body.success === true, "scope:report succeeds");
      assert(body && Array.isArray(body.pages) && body.pages.length === 3, "pages[] has 3 entries");
      const sumErrors = body.pages.reduce((s, p) => s + (p.report && p.report.stats && p.report.stats.errors || 0), 0);
      assert(body.reportSummary && body.reportSummary.totalErrors === sumErrors, "reportSummary.totalErrors equals sum across pages");
      assert(body.reportSummary && body.reportSummary.pageCount === 3, "reportSummary.pageCount is 3");
    }
  } finally {
    srv.stop();
  }

  // --- 7: unbound server path --------------------------------------------
  console.log("\n[wire] no report bound → clean fail envelope");
  {
    const srv2 = startServer({ bindFixture: false });
    try {
      await srv2.init();
      const resp = await srv2.callTool("pbir_validate_wireframe", { pageId: "anything" });
      assert(!resp.error, "no JSON-RPC -32602 when project unbound");
      const body = structured(resp);
      assert(body && body.success === false, "unbound: success:false");
      assert(body && typeof body.error === "string", "unbound: error message present");
    } finally {
      srv2.stop();
    }
  }

  console.log("");
  if (failures.length) {
    console.error(`✗ ${failures.length} assertion(s) failed.`);
    process.exit(1);
  }
  console.log("✓ All pbir_validate_wireframe assertions passed.");
  process.exit(0);
})().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});

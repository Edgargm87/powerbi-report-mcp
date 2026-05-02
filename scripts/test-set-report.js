#!/usr/bin/env node
// Regression test for pbir_set_report -32602 outputSchema rejection.
//
// Bug: GENERIC_OUTPUT_SCHEMA at src/index.ts:272 was a flat zod shape
// `{success, error?}` that the MCP SDK serialized into a strict JSON Schema
// with additionalProperties:false. Any handler that returned a payload with
// extra fields (e.g. pbir_set_report returning {success, reportPath}) tripped
// MCP error -32602 "Structured content does not match the tool's output schema:
// data must NOT have additional properties" — and the bind side-effect never
// committed.
//
// This test spawns dist/index.js, calls pbir_set_report with the eval fixture,
// and asserts the response is a clean success envelope (no protocol error,
// success:true, side effect visible to pbir_get_report). Then verifies bogus
// paths return a clean fail() envelope (not a protocol error). Also smoke-
// tests pbir_get_visual_types which historically hit the same generic-schema
// regression.
//
// Must FAIL on the pre-fix build and PASS on the fixed build.

const path = require("path");
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const FIXTURE = path.join(ROOT, "evals", "fixtures", "sample.Report");
const BOGUS = process.platform === "win32" ? "C:\\nope\\not.Report" : "/nope/not.Report";

const failures = [];
function assert(cond, msg) {
  if (!cond) { console.error("  FAIL:", msg); failures.push(msg); }
  else { console.log("  PASS:", msg); }
}

// Spawn the server and provide a one-shot RPC sender so each call can be
// awaited individually (avoids racing pbir_get_report ahead of pbir_set_report).
function startServer() {
  const child = spawn(process.execPath, [path.join(ROOT, "dist/index.js")], {
    stdio: ["pipe", "pipe", "pipe"],
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
      pending.set(id, { resolve, reject });
      const t = setTimeout(() => {
        if (pending.has(id)) { pending.delete(id); reject(new Error("timeout id=" + id + " method=" + method)); }
      }, 10000);
      const _r = resolve;
      pending.set(id, { resolve: (v) => { clearTimeout(t); _r(v); }, reject });
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    });
  }
  function notify(method, params) {
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
  }

  return {
    init: async () => {
      await call("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "test-set-report", version: "0" } });
      notify("notifications/initialized");
    },
    callTool: (name, args) => call("tools/call", { name, arguments: args || {} }),
    listTools: () => call("tools/list", {}),
    stop: () => { try { child.kill(); } catch {} },
    stderr: () => stderr,
  };
}

(async () => {
  console.log("Regression: pbir_set_report outputSchema rejection (-32602)\n");

  const srv = startServer();
  try {
    await srv.init();

    // First, inspect the published outputSchema. The bug is that the
    // GENERIC_OUTPUT_SCHEMA is serialized with additionalProperties:false —
    // any MCP client that validates structuredContent against the published
    // schema (Claude Code does, our internal RPC roundtrip doesn't) rejects
    // the response with -32602. Catch the bug at the schema layer.
    const tl = await srv.listTools();
    const tools = (tl.result && tl.result.tools) || [];
    function schemaOf(name) {
      const t = tools.find((x) => x.name === name);
      return t && t.outputSchema;
    }
    function permitsExtras(schema) {
      // Permissive iff:
      //   - no schema is published (tool opts out of structured-output validation), OR
      //   - additionalProperties is anything other than literal `false`.
      // Strict client (Claude Code) only rejects with -32602 when a schema
      // IS published AND additionalProperties:false rules out the response.
      if (!schema) return true;
      if (typeof schema !== "object") return true;
      return schema.additionalProperties !== false;
    }
    const setReportSchema = schemaOf("pbir_set_report");
    const getVisualTypesSchema = schemaOf("pbir_get_visual_types");

    const r1 = await srv.callTool("pbir_set_report", { path: FIXTURE });
    const r2 = await srv.callTool("pbir_get_report", {});
    const r3 = await srv.callTool("pbir_set_report", { path: BOGUS });
    const r4 = await srv.callTool("pbir_get_visual_types", {});
    // v0.9.2: rebind to the fixture (the bogus call cleared connection?
    // No — connectReport on bogus fails so binding survived). Re-bind
    // defensively before the list-pages probe to keep the test
    // independent of internal connection-state semantics.
    await srv.callTool("pbir_set_report", { path: FIXTURE });
    const r5 = await srv.callTool("pbir_list_pages", { slim: true });

    // 1: pbir_set_report's published outputSchema must permit extra fields.
    // The handler returns {success, reportPath} — if additionalProperties:false
    // is published, strict MCP clients (e.g. Claude Code) reject the call
    // with -32602 before the side effect commits.
    assert(permitsExtras(setReportSchema),
      "pbir_set_report outputSchema permits additional properties (got additionalProperties=" + (setReportSchema && setReportSchema.additionalProperties) + ")");

    // 2: pbir_set_report response is not a protocol error at all
    assert(!r1.error, "pbir_set_report(valid path) has no JSON-RPC error");

    // 3: result is not isError
    const res1 = r1.result || {};
    assert(res1.isError !== true, "pbir_set_report(valid path) result.isError !== true");

    // 4: structuredContent.success === true
    const sc1 = res1.structuredContent || {};
    assert(sc1.success === true, "pbir_set_report(valid path) structuredContent.success === true (got: " + JSON.stringify(sc1) + ")");

    // 5: side effect committed — pbir_get_report shows the bound path
    assert(!r2.error, "pbir_get_report has no JSON-RPC error");
    const sc2 = (r2.result || {}).structuredContent || {};
    const reportedPath = sc2.reportPath || "";
    assert(reportedPath && reportedPath !== "No report connected" && reportedPath.toLowerCase().includes("sample.report"),
      "pbir_get_report after set returns the bound fixture path (got: " + JSON.stringify(reportedPath) + ")");

    // 6: bogus path returns a clean fail() envelope, not -32602
    assert(!r3.error || r3.error.code !== -32602,
      "pbir_set_report(bogus path) does not return -32602 (got: " + (r3.error ? JSON.stringify(r3.error) : "no error") + ")");
    const res3 = r3.result || {};
    const sc3 = res3.structuredContent || {};
    assert(res3.isError === true && sc3.success === false && typeof sc3.error === "string" && sc3.error.length > 0,
      "pbir_set_report(bogus path) is a clean fail envelope ({success:false, error:'...', isError:true})");

    // 7: dual-emit invariant — content[0].text AND structuredContent both present on success
    const c1 = (res1.content && res1.content[0]) || {};
    assert(c1.type === "text" && typeof c1.text === "string" && c1.text.length > 0 && Object.keys(sc1).length > 0,
      "pbir_set_report(valid) dual-emits content[0].text + structuredContent");

    // 8: pbir_get_visual_types — same generic-schema bug class. The handler
    // returns a {success, visualTypes:[...]} payload, so the published
    // schema must also permit extras.
    assert(permitsExtras(getVisualTypesSchema),
      "pbir_get_visual_types outputSchema permits additional properties (got additionalProperties=" + (getVisualTypesSchema && getVisualTypesSchema.additionalProperties) + ")");
    // And the call itself must not crash.
    assert(!r4.error, "pbir_get_visual_types call returns no JSON-RPC error");

    // 9 (v0.9.2): pbir_get_report includes hasSemanticModel.
    // The eval fixture has no .SemanticModel sibling — must be false.
    assert(typeof sc2.hasSemanticModel === "boolean",
      "pbir_get_report includes hasSemanticModel:boolean (got: " + JSON.stringify(sc2.hasSemanticModel) + ")");
    assert(sc2.hasSemanticModel === false,
      "pbir_get_report hasSemanticModel===false on fixture without .SemanticModel sibling");

    // 10 (v0.9.2): pbir_list_pages slim entries include width + height,
    // and the response carries top-level totalVisualCount.
    const sc5 = (r5.result || {}).structuredContent || {};
    const firstPage = (sc5.pages && sc5.pages[0]) || {};
    assert(typeof firstPage.width === "number" && typeof firstPage.height === "number",
      "pbir_list_pages slim entry includes width + height (got: " + JSON.stringify({ w: firstPage.width, h: firstPage.height }) + ")");
    assert(typeof sc5.totalVisualCount === "number" && sc5.totalVisualCount >= 0,
      "pbir_list_pages response includes totalVisualCount:number (got: " + JSON.stringify(sc5.totalVisualCount) + ")");
    // Also sanity-check: totalVisualCount equals the sum across the visible
    // slice (here the fixture has 3 pages — fits in one page so the sum
    // matches across the visible slice and the full set).
    const visibleSum = (sc5.pages || []).reduce((acc, p) => acc + (p.visualCount || 0), 0);
    assert(sc5.totalVisualCount === visibleSum,
      "pbir_list_pages totalVisualCount === sum of visible page visualCount (fixture fits in one page)");
  } catch (err) {
    console.error("FATAL: " + (err.message || err));
    console.error("stderr:\n" + srv.stderr());
    srv.stop();
    process.exit(1);
  }
  srv.stop();

  console.log("");
  if (failures.length) {
    console.error("FAIL: " + failures.length + " assertion(s) failed.");
    process.exit(1);
  } else {
    console.log("OK: " + (failures.length === 0 ? "all assertions passed." : "see failures."));
    process.exit(0);
  }
})();

#!/usr/bin/env node
// Smoke test for pbir_list_visuals + pbir_list_pages pagination.
//
// Builds a synthetic in-memory page with 200 fake visuals, captures the
// registered handler by intercepting server.tool() during registerVisualTools()
// and registerReportTools(), then exercises the limit/offset boundary cases.

const path = require("path");

const { registerVisualTools } = require("../dist/tools/visuals.js");
const { registerReportTools } = require("../dist/tools/report.js");
const { invalidateAll } = require("../dist/helpers/readCache.js");

// ---------------------------------------------------------------------------
// Mocks — the minimum surface area visuals/report.ts touches via ctx.project.
// ---------------------------------------------------------------------------
function buildFakeVisuals(n) {
  const out = {};
  for (let i = 0; i < n; i++) {
    const id = `v${String(i).padStart(4, "0")}`;
    out[id] = {
      name: id,
      visual: {
        visualType: "card",
        visualContainerObjects: undefined,
      },
      position: { x: 0, y: 0, width: 100, height: 60, z: i, tabOrder: i },
      filterConfig: { filters: [] },
    };
  }
  return out;
}

// 200-visual fixture with three types: 50 card, 50 slicer, 100 tableEx.
function buildMixedTypeVisuals() {
  const out = {};
  let i = 0;
  const make = (count, type) => {
    for (let k = 0; k < count; k++, i++) {
      const id = `v${String(i).padStart(4, "0")}`;
      out[id] = {
        name: id,
        visual: { visualType: type, visualContainerObjects: undefined },
        position: { x: 0, y: 0, width: 100, height: 60, z: i, tabOrder: i },
        filterConfig: { filters: [] },
      };
    }
  };
  make(50, "card");
  make(50, "slicer");
  make(100, "tableEx");
  return out;
}

function buildMockProject({ pageId, visuals, pages = [] }) {
  return {
    listVisualIds: (pid) => (pid === pageId ? Object.keys(visuals) : []),
    getVisual: (pid, vid) => visuals[vid],
    getPagesMetadata: () => ({
      pageOrder: pages.map((p) => p.id),
      activePageName: pages[0]?.id,
    }),
    getPage: (pid) => pages.find((p) => p.id === pid),
  };
}

// Capture the handler registered for a given tool name by stubbing server.tool.
function captureHandler(register, toolName, ctx) {
  let captured = null;
  const fakeServer = {
    tool: (name, _desc, _schema, _annOrHandler, handler) => {
      const realHandler = handler ?? _annOrHandler;
      if (name === toolName) captured = realHandler;
    },
  };
  register(fakeServer, ctx);
  if (!captured) throw new Error(`handler for ${toolName} not captured`);
  return captured;
}

function parseEnvelope(env) {
  if (!env || !Array.isArray(env.content) || !env.content[0]) {
    throw new Error("envelope missing content");
  }
  return JSON.parse(env.content[0].text);
}

let pass = 0;
let fail = 0;
function assertEq(label, got, expected) {
  const ok = JSON.stringify(got) === JSON.stringify(expected);
  if (ok) {
    console.log(`  ✓ ${label}`);
    pass++;
  } else {
    console.log(`  ✗ ${label}\n      expected ${JSON.stringify(expected)}\n      got      ${JSON.stringify(got)}`);
    fail++;
  }
}

// ---------------------------------------------------------------------------
// Test 1 — pbir_list_visuals pagination across 200 fake visuals
// ---------------------------------------------------------------------------
console.log("\n═══════════════════════════════════════════════════════════════════");
console.log("  pagination — pbir_list_visuals");
console.log("═══════════════════════════════════════════════════════════════════");

(async () => {
  const PAGE_ID = "pageA";
  const visuals = buildFakeVisuals(200);
  const project = buildMockProject({ pageId: PAGE_ID, visuals });
  const ctx = { getReportPath: () => "/fake/report", connectReport: () => ({ success: true }), project };

  // Visuals — fresh handler + fresh cache for each call to avoid hits.
  invalidateAll();
  const visualsHandler = captureHandler(registerVisualTools, "pbir_list_visuals", ctx);

  invalidateAll();
  let env = await visualsHandler({ pageId: PAGE_ID, slim: true, limit: 100, offset: 0 });
  let body = parseEnvelope(env);
  assertEq("list_visuals offset:0 returns 100 items", body.visuals.length, 100);
  assertEq("list_visuals offset:0 total=200", body.total, 200);
  assertEq("list_visuals offset:0 truncated=true", body.truncated, true);
  assertEq("list_visuals offset:0 nextOffset=100", body.nextOffset, 100);
  assertEq("list_visuals offset:0 first id v0000", body.visuals[0].id, "v0000");
  // Canonical aliases must mirror legacy fields.
  assertEq("list_visuals offset:0 total_count=total", body.total_count, body.total);
  assertEq("list_visuals offset:0 has_more=truncated", body.has_more, body.truncated);
  assertEq("list_visuals offset:0 next_offset=nextOffset", body.next_offset, body.nextOffset);

  invalidateAll();
  env = await visualsHandler({ pageId: PAGE_ID, slim: true, limit: 100, offset: 100 });
  body = parseEnvelope(env);
  assertEq("list_visuals offset:100 returns 100 items", body.visuals.length, 100);
  assertEq("list_visuals offset:100 total=200", body.total, 200);
  assertEq("list_visuals offset:100 truncated=false", body.truncated, false);
  assertEq("list_visuals offset:100 nextOffset=null", body.nextOffset, null);
  assertEq("list_visuals offset:100 first id v0100", body.visuals[0].id, "v0100");
  assertEq("list_visuals offset:100 total_count=total", body.total_count, body.total);
  assertEq("list_visuals offset:100 has_more=truncated", body.has_more, body.truncated);
  assertEq("list_visuals offset:100 next_offset=nextOffset", body.next_offset, body.nextOffset);

  invalidateAll();
  env = await visualsHandler({ pageId: PAGE_ID, slim: true, limit: 100, offset: 200 });
  body = parseEnvelope(env);
  assertEq("list_visuals offset:200 returns 0 items", body.visuals.length, 0);
  assertEq("list_visuals offset:200 truncated=false", body.truncated, false);
  assertEq("list_visuals offset:200 total=200", body.total, 200);

  // ------------------------------------------------------------------
  // Test 1b (v0.9.2) — pbir_list_visuals visualType filter
  // ------------------------------------------------------------------
  console.log("\n═══════════════════════════════════════════════════════════════════");
  console.log("  filter — pbir_list_visuals visualType");
  console.log("═══════════════════════════════════════════════════════════════════");

  const mixedVisuals = buildMixedTypeVisuals();
  const mixedProject = buildMockProject({ pageId: PAGE_ID, visuals: mixedVisuals });
  const mixedCtx = { getReportPath: () => "/fake/report", connectReport: () => ({ success: true }), project: mixedProject };
  invalidateAll();
  const mixedHandler = captureHandler(registerVisualTools, "pbir_list_visuals", mixedCtx);

  invalidateAll();
  env = await mixedHandler({ pageId: PAGE_ID, slim: true, visualType: "slicer", limit: 100, offset: 0 });
  body = parseEnvelope(env);
  assertEq("filter slicer returns 50 items (full set)", body.visuals.length, 50);
  assertEq("filter slicer total=50 (filtered count, not 200)", body.total, 50);
  assertEq("filter slicer truncated=false", body.truncated, false);
  assertEq("filter slicer all entries type==='slicer'", body.visuals.every((v) => v.type === "slicer"), true);

  invalidateAll();
  env = await mixedHandler({ pageId: PAGE_ID, slim: true, visualType: "slicer", limit: 10, offset: 0 });
  body = parseEnvelope(env);
  assertEq("filter slicer limit:10 returns 10 items", body.visuals.length, 10);
  assertEq("filter slicer limit:10 total=50 (still reflects filtered set)", body.total, 50);
  assertEq("filter slicer limit:10 truncated=true", body.truncated, true);
  assertEq("filter slicer limit:10 nextOffset=10", body.nextOffset, 10);

  invalidateAll();
  env = await mixedHandler({ pageId: PAGE_ID, slim: true, visualType: "tableEx", limit: 500, offset: 0 });
  body = parseEnvelope(env);
  assertEq("filter tableEx returns 100 items", body.visuals.length, 100);
  assertEq("filter tableEx total=100", body.total, 100);

  invalidateAll();
  env = await mixedHandler({ pageId: PAGE_ID, slim: true, visualType: "nonexistentType", limit: 100, offset: 0 });
  body = parseEnvelope(env);
  assertEq("filter nonexistentType returns 0 items (no error)", body.visuals.length, 0);
  assertEq("filter nonexistentType total=0", body.total, 0);
  assertEq("filter nonexistentType truncated=false", body.truncated, false);

  // ------------------------------------------------------------------
  // Test 2 — pbir_list_pages pagination + pageId-shortcut bypass
  // ------------------------------------------------------------------
  console.log("\n═══════════════════════════════════════════════════════════════════");
  console.log("  pagination — pbir_list_pages");
  console.log("═══════════════════════════════════════════════════════════════════");

  // Build 25 fake pages, no visuals on each — exercises pages-array slicing.
  const pages = [];
  for (let i = 0; i < 25; i++) {
    pages.push({
      id: `p${String(i).padStart(3, "0")}`,
      displayName: `Page ${i}`,
      width: 1280,
      height: 720,
      displayOption: "FitToPage",
    });
  }
  const pagesProject = {
    listVisualIds: () => [],
    getVisual: () => undefined,
    getPagesMetadata: () => ({ pageOrder: pages.map((p) => p.id), activePageName: pages[0].id }),
    getPage: (pid) => pages.find((p) => p.id === pid),
  };
  const pagesCtx = { getReportPath: () => "/fake/report", connectReport: () => ({ success: true }), project: pagesProject };

  invalidateAll();
  const pagesHandler = captureHandler(registerReportTools, "pbir_list_pages", pagesCtx);

  invalidateAll();
  env = await pagesHandler({ slim: true, includeVisuals: false, limit: 10, offset: 0 });
  body = parseEnvelope(env);
  assertEq("list_pages offset:0 returns 10 pages", body.pages.length, 10);
  assertEq("list_pages offset:0 total=25", body.total, 25);
  assertEq("list_pages offset:0 truncated=true", body.truncated, true);
  assertEq("list_pages offset:0 nextOffset=10", body.nextOffset, 10);
  assertEq("list_pages offset:0 total_count=total", body.total_count, body.total);
  assertEq("list_pages offset:0 has_more=truncated", body.has_more, body.truncated);
  assertEq("list_pages offset:0 next_offset=nextOffset", body.next_offset, body.nextOffset);
  // v0.9.2: slim mode now includes width/height per page (cheap, common
  // lookup that previously forced an extra slim:false call).
  assertEq("list_pages slim entry has width", body.pages[0].width, 1280);
  assertEq("list_pages slim entry has height", body.pages[0].height, 720);
  // v0.9.2: top-level totalVisualCount sums visualCount across the FULL
  // page set (not just the visible slice). Mock pages have 0 visuals each.
  assertEq("list_pages totalVisualCount sum across full set", body.totalVisualCount, 0);

  invalidateAll();
  env = await pagesHandler({ slim: true, includeVisuals: false, limit: 10, offset: 20 });
  body = parseEnvelope(env);
  assertEq("list_pages offset:20 returns 5 pages", body.pages.length, 5);
  assertEq("list_pages offset:20 truncated=false", body.truncated, false);
  assertEq("list_pages offset:20 nextOffset=null", body.nextOffset, null);
  assertEq("list_pages offset:20 total_count=total", body.total_count, body.total);
  assertEq("list_pages offset:20 has_more=truncated", body.has_more, body.truncated);
  assertEq("list_pages offset:20 next_offset=nextOffset", body.next_offset, body.nextOffset);

  // pageId shortcut — pagination should be ignored.
  invalidateAll();
  env = await pagesHandler({ slim: true, includeVisuals: false, pageId: "p005", limit: 10, offset: 999 });
  body = parseEnvelope(env);
  assertEq("list_pages pageId-shortcut returns 1 page", body.pages.length, 1);
  assertEq("list_pages pageId-shortcut total=1", body.total, 1);
  assertEq("list_pages pageId-shortcut truncated=false", body.truncated, false);
  assertEq("list_pages pageId-shortcut nextOffset=null", body.nextOffset, null);
  assertEq("list_pages pageId-shortcut total_count=total", body.total_count, body.total);
  assertEq("list_pages pageId-shortcut has_more=truncated", body.has_more, body.truncated);
  assertEq("list_pages pageId-shortcut next_offset=nextOffset", body.next_offset, body.nextOffset);

  console.log("\n═══════════════════════════════════════════════════════════════════");
  console.log(`  ${pass} passed, ${fail} failed`);
  console.log("═══════════════════════════════════════════════════════════════════");
  process.exit(fail === 0 ? 0 : 1);
})().catch((err) => {
  console.error("FAIL:", err);
  process.exit(1);
});

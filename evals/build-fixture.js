#!/usr/bin/env node
// Deterministic fixture builder for evals/fixtures/sample.Report.
//
// Strategy:
//   1. Patch crypto.randomBytes BEFORE loading the MCP source so generateId()
//      produces a stable counter-based hex string (e.g. "00000000000000000001").
//   2. Scaffold a bare .Report skeleton on disk (definition/report.json,
//      version.json, pages/pages.json with empty pageOrder).
//   3. Capture each MCP tool handler by stubbing server.tool during
//      registration, then drive the build with the same code paths a real
//      LLM would: pbir_create_page x3, pbir_add_visual (batch) x10 across the
//      pages, pbir_set_report_theme, pbir_add_bookmark x2, pbir_add_page_filter x2.
//   4. Result lands in evals/fixtures/sample.Report — small, frozen, reproducible.
//
// Re-run with:
//   rm -rf evals/fixtures/sample.Report && node evals/build-fixture.js
// Output should be byte-identical across runs.

const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

// --- 1. Deterministic ID patch ------------------------------------------------
let idCounter = 0;
const realRandomBytes = crypto.randomBytes;
crypto.randomBytes = function patchedRandomBytes(n) {
  if (n === 10) {
    idCounter += 1;
    const hex = idCounter.toString(16).padStart(20, "0");
    return Buffer.from(hex, "hex");
  }
  return realRandomBytes(n);
};

// Patch Date.now so theme filename suffix is reproducible.
Date.now = () => 0;

// --- 2. Scaffold bare .Report skeleton ---------------------------------------
const FIXTURE_DIR = path.resolve(__dirname, "fixtures", "sample.Report");
if (fs.existsSync(FIXTURE_DIR)) {
  fs.rmSync(FIXTURE_DIR, { recursive: true, force: true });
}
const DEFN = path.join(FIXTURE_DIR, "definition");
fs.mkdirSync(path.join(DEFN, "pages"), { recursive: true });

fs.writeFileSync(
  path.join(DEFN, "report.json"),
  JSON.stringify(
    {
      $schema:
        "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/report/3.2.0/schema.json",
      themeCollection: {
        baseTheme: {
          name: "CY26SU02",
          reportVersionAtImport: { visual: "2.6.0", report: "3.1.0", page: "2.3.0" },
          type: "SharedResources",
        },
      },
      resourcePackages: [
        {
          name: "SharedResources",
          type: "SharedResources",
          items: [
            { name: "CY26SU02", path: "BaseThemes/CY26SU02.json", type: "BaseTheme" },
          ],
        },
      ],
      settings: {
        useStylableVisualContainerHeader: true,
        exportDataMode: "AllowSummarized",
      },
    },
    null,
    2
  )
);

fs.writeFileSync(
  path.join(DEFN, "version.json"),
  JSON.stringify(
    {
      $schema:
        "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/versionMetadata/1.0.0/schema.json",
      version: "2.0.0",
    },
    null,
    2
  )
);

fs.writeFileSync(
  path.join(DEFN, "pages", "pages.json"),
  JSON.stringify(
    {
      $schema:
        "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/pagesMetadata/1.0.0/schema.json",
      pageOrder: [],
      activePageName: "",
    },
    null,
    2
  )
);

// --- 3. Capture MCP tool handlers --------------------------------------------
const { PbirProject } = require("../dist/pbir.js");
const { registerReportTools } = require("../dist/tools/report.js");
const { registerVisualTools } = require("../dist/tools/visuals.js");
const { registerThemeTools } = require("../dist/tools/themes.js");
const { registerFilterTools } = require("../dist/tools/filters.js");
const { registerBookmarkTools } = require("../dist/tools/bookmarks.js");
const { invalidateAll } = require("../dist/helpers/readCache.js");

let project = new PbirProject(FIXTURE_DIR);
const ctx = {
  getReportPath: () => FIXTURE_DIR,
  connectReport: (p) => {
    project = new PbirProject(p);
    return { success: true, reportPath: p };
  },
  project,
};

const handlers = {};
const fakeServer = {
  tool: (name, _desc, _schema, annOrHandler, handler) => {
    handlers[name] = handler ?? annOrHandler;
  },
};
registerReportTools(fakeServer, ctx);
registerVisualTools(fakeServer, ctx);
registerThemeTools(fakeServer, ctx);
registerFilterTools(fakeServer, ctx);
registerBookmarkTools(fakeServer, ctx);

async function call(toolName, args) {
  invalidateAll();
  const env = await handlers[toolName](args);
  const text = env?.content?.[0]?.text ?? "{}";
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text };
  }
  if (body?.success === false) {
    throw new Error(`${toolName} failed: ${body.error}`);
  }
  // Reload project so subsequent reads see disk writes
  ctx.project = new PbirProject(FIXTURE_DIR);
  Object.setPrototypeOf(ctx, null);
  return body;
}

// Make ctx.project a getter so tools always see the latest project instance.
let liveProject = project;
Object.defineProperty(ctx, "project", {
  get: () => liveProject,
  configurable: true,
});
function reload() {
  liveProject = new PbirProject(FIXTURE_DIR);
}

async function main() {
  // 3 pages
  const overview = await call("pbir_create_page", { displayName: "Overview" });
  reload();
  const products = await call("pbir_create_page", { displayName: "Products" });
  reload();
  const detail = await call("pbir_create_page", { displayName: "Detail" });
  reload();

  const overviewId = overview.pageId || overview.id;
  const productsId = products.pageId || products.id;
  const detailId = detail.pageId || detail.id;

  // Set Overview as active so canvas/page metadata questions are answerable.
  await call("pbir_set_active_page", { pageId: overviewId });
  reload();

  // 10 visuals — Overview gets 4, Products 4, Detail 2
  // Visuals — use add_visual's batch mode (one call per page).
  // No bindings: fixture has no .SemanticModel sibling, so binding validator
  // is a no-op and tools that walk bindings see "unbound" gracefully.
  // strictLayout:false because we deliberately stay below margins to keep
  // questions stable, but don't want a layout reject blocking the build.
  await call("pbir_add_visual", {
    pageId: overviewId,
    strictLayout: false,
    visuals: [
      { visualType: "card",        x: 20,  y: 20,  width: 200, height: 100, title: "Total Sales" },
      { visualType: "card",        x: 240, y: 20,  width: 200, height: 100, title: "Total Units" },
      { visualType: "columnChart", x: 20,  y: 140, width: 600, height: 360, title: "Sales by Month" },
      { visualType: "slicer",      x: 640, y: 140, width: 300, height: 360 },
    ],
  });
  reload();
  await call("pbir_add_visual", {
    pageId: productsId,
    strictLayout: false,
    visuals: [
      { visualType: "table",       x: 20,  y: 20,  width: 800, height: 400, title: "Product Catalog" },
      { visualType: "columnChart", x: 20,  y: 440, width: 400, height: 260, title: "Top 10 Products" },
      { visualType: "lineChart",   x: 440, y: 440, width: 400, height: 260, title: "Sales Trend" },
      { visualType: "slicer",      x: 840, y: 20,  width: 300, height: 680 },
    ],
  });
  reload();
  await call("pbir_add_visual", {
    pageId: detailId,
    strictLayout: false,
    visuals: [
      { visualType: "card",      x: 20,  y: 20, width: 240, height: 120, title: "Selected Product" },
      { visualType: "lineChart", x: 280, y: 20, width: 800, height: 600, title: "Detail Trend" },
    ],
  });
  reload();

  // Theme — small palette of 4 colors
  await call("pbir_set_report_theme", {
    name: "EvalTheme",
    dataColors: ["#1F77B4", "#FF7F0E", "#2CA02C", "#D62728"],
  });
  reload();

  // 2 bookmarks
  await call("pbir_add_bookmark", { displayName: "Default View" });
  reload();
  await call("pbir_add_bookmark", { displayName: "Filtered View" });
  reload();

  // 2 page filters (Categorical on a couple of fields)
  await call("pbir_add_page_filter", {
    pageId: overviewId,
    filterType: "categorical",
    entity: "Sales",
    property: "Region",
  });
  reload();
  await call("pbir_add_page_filter", {
    pageId: productsId,
    filterType: "categorical",
    entity: "Products",
    property: "Category",
  });
  reload();

  console.log("Fixture built at:", FIXTURE_DIR);
  const stats = (() => {
    let count = 0;
    let bytes = 0;
    function walk(dir) {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else { count += 1; bytes += fs.statSync(p).size; }
      }
    }
    walk(FIXTURE_DIR);
    return { count, bytes };
  })();
  console.log(`  Files: ${stats.count}    Bytes: ${stats.bytes}`);
}

main().catch((err) => {
  console.error("FAIL:", err);
  process.exit(1);
});

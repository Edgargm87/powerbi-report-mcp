<!-- doc-version: 2.0 | Last updated: 2026-04-26 -->
# PBIR Wireframe Scaffolder — Cowork artifact source

A two-tab Cowork artifact for inspecting the bound `.Report` and scaffolding
new pages from the 5 canonical wireframe layouts (A–E) defined in
`skills/wireframes.md` and validated by `src/wireframe-validator.ts`.

## How to use

In a **Cowork** session (Cowork is the only host that exposes the
`mcp__cowork__create_artifact` API — Claude Code does not), say:

> Read `artifacts/README.md` from `powerbi-report-mcp` and create the
> wireframe scaffolder artifact from the HTML source in there.

Cowork will call `mcp__cowork__create_artifact` once with the HTML payload
in the fenced block below.

The artifact assumes the `powerbi-report-mcp` MCP server is connected to
the same Cowork session and that a `.Report` is bound (via
`PBIR_REPORT_PATH` env var or `pbir_set_report`).

## Recovery copy invariant

When the artifact is iterated in Cowork via `mcp__cowork__update_artifact`,
Cowork **must mirror-edit this file in the same turn** so the code block
below stays in lock-step with what's actually rendering. Drift here means
future recreates from this README will get a stale version.

## Notes on what was probed (response shapes the artifact relies on)

Probed against `evals/fixtures/sample.Report` from Claude Code. All MCP
calls return `{ structuredContent, content: [{ type: "text", text: "..." }] }`;
the artifact prefers `structuredContent` and falls back to parsing
`content[0].text`. Field-name gotchas (these differ from the brief's
informal sketch):

- **`pbir_list_pages({ includeVisuals: true, slim: false })`** returns
  `{ pages: [{ id, displayName, visualCount, isActive, hidden, width,
  height, displayOption, visuals: [{ id, type, x, y, w, h, title? }] }],
  canvas: {...}, total, total_count, has_more, ... }`. Note the
  per-visual entries use the short keys `type` / `w` / `h` (NOT
  `visualType` / `width` / `height`).
- **`pbir_get_visual({ pageId, visualId })`** (slim default) returns
  `{ id, type, x, y, w, h, title, filterCount }`.
- **`pbir_get_report()`** returns `{ reportPath }`.
- **`pbir_create_page({ displayName })`** — takes `displayName` (NOT
  `pageId`); returns `{ success, pageId, displayName, type, ... }`.
- **`pbir_add_visual({ pageId, visuals: [{ visualType, x, y, width,
  height, title? }] })`** — note `visualType` / `width` / `height` (full
  names, unlike the list_pages response). Returns
  `{ success, pageId, created: [visualIds] }`.
- **`pbir_delete_page({ pageId })`** returns `{ success, deletedPageId }`.
- **`pbir_reload_report({ confirm: true })`** — destructive: closes and
  reopens PBI Desktop. Without `confirm: true`, returns a save-first
  warning instead of acting. The artifact always passes `confirm: true`
  when invoked from the top-bar Reload button (the tooltip warns the user).

These tool shapes are still valid as of the v2 rewrite. The v2 rewrite
itself (React → vanilla JS) was forced by Cowork sandbox limits — the
artifact runtime blocks Babel/JSX transpilation and disallows React, so
the v1 source could never have actually instantiated.

## Source

```html
<style>
  :root {
    color-scheme: light;
    --bg: #ffffff;
    --panel: #f6f7f9;
    --fg: #1a1a1a;
    --muted: #6b6b6b;
    --border: #e1e4e8;
    --accent: #3a7bd5;
    --danger: #c0392b;
    --success: #2e8b57;
    --warning: #b8860b;
    --canvas-bg: #fafbfc;
    --canvas-grid: rgba(0,0,0,0.08);
    /* type palette — distinct hues, light fills with darker borders */
    --type-card: #4a90e2;
    --type-columnChart: #50c878;
    --type-barChart: #2ecc71;
    --type-lineChart: #e67e22;
    --type-pieChart: #d35400;
    --type-donutChart: #c0392b;
    --type-slicer: #9b59b6;
    --type-tableEx: #34495e;
    --type-table: #34495e;
    --type-pivotTable: #2c3e50;
    --type-gauge: #16a085;
    --type-treemap: #8e44ad;
    --type-funnel: #d4ac0d;
    --type-shape: #95a5a6;
    --type-default: #7f8c8d;
  }
  * { box-sizing: border-box; }
  #root {
    color: var(--fg);
    background: var(--bg);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 13px;
    line-height: 1.4;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }
  .topbar {
    display: flex; align-items: center; gap: 12px;
    padding: 8px 12px;
    border-bottom: 1px solid var(--border);
    background: var(--panel);
  }
  .topbar h1 { margin: 0; font-size: 14px; font-weight: 600; }
  .tabs { display: flex; gap: 4px; }
  .tab-btn {
    padding: 6px 14px; border: 1px solid var(--border);
    background: #fff; color: var(--fg);
    border-radius: 6px; cursor: pointer; font-size: 13px;
  }
  .tab-btn.active { background: var(--accent); color: #fff; border-color: var(--accent); }
  .spacer { flex: 1; }
  button {
    padding: 6px 12px; border: 1px solid var(--border);
    background: #fff; color: var(--fg);
    border-radius: 6px; cursor: pointer; font-size: 13px;
    font-family: inherit;
  }
  button:hover:not(:disabled) { background: #eef0f3; }
  button:disabled { opacity: 0.5; cursor: not-allowed; }
  button.primary { background: var(--accent); color: #fff; border-color: var(--accent); }
  .tab-content { flex: 1; padding: 12px; }
  .empty {
    padding: 24px; text-align: center; color: var(--muted);
    border: 1px dashed var(--border); border-radius: 8px; margin: 24px;
    background: var(--panel);
  }
  .empty code {
    background: #fff; padding: 1px 5px; border-radius: 3px;
    font-size: 12px; border: 1px solid var(--border);
  }
  .inspect-controls {
    display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
    margin-bottom: 8px;
  }
  .page-tabs { display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 8px; }
  .page-tab {
    padding: 4px 10px; border: 1px solid var(--border);
    background: #fff; color: var(--fg);
    border-radius: 4px; cursor: pointer; font-size: 12px;
  }
  .page-tab.active { background: var(--accent); color: #fff; border-color: var(--accent); }
  .page-tab.hidden { opacity: 0.5; font-style: italic; }
  .inspect-body { display: flex; gap: 12px; align-items: flex-start; flex-wrap: wrap; }
  .canvas-wrap {
    border: 1px solid var(--border); border-radius: 6px; overflow: hidden;
    background: var(--canvas-bg);
  }
  .side-panel {
    flex: 1; min-width: 240px; max-width: 360px;
    border: 1px solid var(--border); border-radius: 6px;
    padding: 10px; background: var(--panel);
    font-size: 12px;
  }
  .side-panel h3 { margin: 0 0 6px; font-size: 13px; }
  .side-panel dl { margin: 0; display: grid; grid-template-columns: 70px 1fr; gap: 2px 8px; }
  .side-panel dt { color: var(--muted); }
  .side-panel dd { margin: 0; font-family: monospace; font-size: 11px; word-break: break-all; }
  .swatch { width: 12px; height: 12px; display: inline-block; vertical-align: middle; border-radius: 2px; margin-right: 4px; }
  .layout-grid {
    display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 12px;
  }
  .layout-card {
    border: 1px solid var(--border); border-radius: 8px; padding: 10px;
    cursor: pointer; background: var(--panel);
    transition: transform 0.1s, border-color 0.1s;
  }
  .layout-card:hover { border-color: var(--accent); transform: translateY(-1px); }
  .layout-card h3 { margin: 0 0 4px; font-size: 13px; }
  .layout-card p { margin: 0 0 6px; color: var(--muted); font-size: 11px; }
  .layout-card svg { display: block; width: 100%; height: auto; background: var(--canvas-bg); border-radius: 4px; }
  .modal-backdrop {
    position: fixed; inset: 0; background: rgba(0,0,0,0.5);
    display: flex; align-items: center; justify-content: center; z-index: 100;
  }
  .modal {
    background: #fff; color: #1a1a1a;
    padding: 16px; border-radius: 8px; width: 460px; max-width: 90vw;
    max-height: 90vh; overflow-y: auto;
  }
  .modal h2 { margin: 0 0 12px; font-size: 16px; }
  .field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 10px; }
  .field label { font-size: 12px; color: #555; }
  .field input, .field select {
    padding: 6px 8px; border: 1px solid #ccc; border-radius: 4px; font-size: 13px;
    font-family: inherit;
  }
  .field-error { color: var(--danger); font-size: 11px; margin-top: 2px; }
  .slot-row {
    display: grid; grid-template-columns: 90px 1fr; gap: 8px; align-items: center;
    margin-bottom: 4px;
  }
  .slot-row span { font-family: monospace; font-size: 11px; color: #666; }
  .slot-list {
    max-height: 220px; overflow-y: auto; border: 1px solid #eee;
    border-radius: 4px; padding: 6px;
  }
  .modal-actions {
    display: flex; gap: 8px; justify-content: flex-end; margin-top: 12px;
  }
  .checkbox-row { display: flex; align-items: center; gap: 6px; margin-bottom: 10px; font-size: 12px; }
  .toast {
    position: fixed; bottom: 16px; right: 16px;
    padding: 10px 14px; border-radius: 6px; max-width: 360px;
    color: #fff; font-size: 12px; z-index: 200;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
  }
  .toast.error { background: var(--danger); }
  .toast.success { background: var(--success); }
  .toast.warning { background: var(--warning); }
  .build-progress { font-size: 12px; color: var(--muted); margin-top: 8px; }
  .build-progress .step { padding: 2px 0; }
  .build-progress .step.ok::before { content: "[ok] "; color: var(--success); font-weight: 600; }
  .build-progress .step.fail::before { content: "[x] "; color: var(--danger); font-weight: 600; }
  .build-progress .step.pending::before { content: "[..] "; color: var(--muted); }
  .error-banner {
    padding: 8px 12px; background: #fdecea; color: var(--danger);
    border-bottom: 1px solid #f5c6cb; font-size: 12px;
  }
  [data-tip] { position: relative; }
  [data-tip]:hover::after {
    content: attr(data-tip);
    position: absolute; top: calc(100% + 4px); right: 0;
    background: #222; color: #fff; padding: 6px 10px; border-radius: 4px;
    font-size: 11px; max-width: 260px; width: max-content;
    z-index: 50; pointer-events: none; white-space: normal;
  }
</style>
<div id="root"></div>
<script>
(function () {
  "use strict";

  // ─────────────────────────────────────────────────────────────────────────
  // LAYOUTS
  //
  // Source of truth: skills/wireframes.md (Layouts A–E) — coordinates also
  // appear in scripts/test-wireframe-validator.js as the positive test cases
  // for src/wireframe-validator.ts. All boxes pass strict validation
  // (15px L/R margins, 6px bottom margin, 5px gaps, banner exempt).
  //
  // If the canonical layouts in skills/wireframes.md change, update this
  // constant in lock-step.
  // ─────────────────────────────────────────────────────────────────────────
  var LAYOUTS = [
    {
      id: "A",
      name: "Dashboard (5 KPIs + 2 Charts + 3 Details)",
      description: "Banner, 5-card KPI row, two-up chart row, three-up detail row",
      boxes: [
        { x: 0,    y: 0,   w: 1280, h: 52,  defaultType: "shape",       label: "Banner" },
        { x: 15,   y: 57,  w: 246,  h: 90,  defaultType: "card",        label: "Card 1" },
        { x: 266,  y: 57,  w: 246,  h: 90,  defaultType: "card",        label: "Card 2" },
        { x: 517,  y: 57,  w: 246,  h: 90,  defaultType: "card",        label: "Card 3" },
        { x: 768,  y: 57,  w: 246,  h: 90,  defaultType: "card",        label: "Card 4" },
        { x: 1019, y: 57,  w: 246,  h: 90,  defaultType: "card",        label: "Card 5" },
        { x: 15,   y: 152, w: 622,  h: 280, defaultType: "columnChart", label: "Chart Left" },
        { x: 642,  y: 152, w: 623,  h: 280, defaultType: "lineChart",   label: "Chart Right" },
        { x: 15,   y: 437, w: 413,  h: 277, defaultType: "tableEx",     label: "Detail 1" },
        { x: 433,  y: 437, w: 413,  h: 277, defaultType: "tableEx",     label: "Detail 2" },
        { x: 851,  y: 437, w: 414,  h: 277, defaultType: "tableEx",     label: "Detail 3" }
      ]
    },
    {
      id: "B",
      name: "Analysis (Slicers + Chart + KPI Sidebar + Table)",
      description: "Three slicers, 2/3 chart with 4 KPI sidebar, full-width table",
      boxes: [
        { x: 0,   y: 0,   w: 1280, h: 52,  defaultType: "shape",       label: "Banner" },
        { x: 15,  y: 57,  w: 413,  h: 60,  defaultType: "slicer",      label: "Slicer 1" },
        { x: 433, y: 57,  w: 413,  h: 60,  defaultType: "slicer",      label: "Slicer 2" },
        { x: 851, y: 57,  w: 414,  h: 60,  defaultType: "slicer",      label: "Slicer 3" },
        { x: 15,  y: 122, w: 830,  h: 380, defaultType: "columnChart", label: "Main Chart" },
        { x: 850, y: 122, w: 415,  h: 93,  defaultType: "card",        label: "KPI 1" },
        { x: 850, y: 220, w: 415,  h: 93,  defaultType: "card",        label: "KPI 2" },
        { x: 850, y: 318, w: 415,  h: 93,  defaultType: "card",        label: "KPI 3" },
        { x: 850, y: 416, w: 415,  h: 86,  defaultType: "card",        label: "KPI 4" },
        { x: 15,  y: 507, w: 1250, h: 207, defaultType: "tableEx",     label: "Table" }
      ]
    },
    {
      id: "C",
      name: "KPI Summary (6 Cards + Wide Chart)",
      description: "Two rows of 3 cards above a full-width chart",
      boxes: [
        { x: 0,   y: 0,   w: 1280, h: 52,  defaultType: "shape",       label: "Banner" },
        { x: 15,  y: 57,  w: 413,  h: 120, defaultType: "card",        label: "Card 1" },
        { x: 433, y: 57,  w: 413,  h: 120, defaultType: "card",        label: "Card 2" },
        { x: 851, y: 57,  w: 414,  h: 120, defaultType: "card",        label: "Card 3" },
        { x: 15,  y: 182, w: 413,  h: 120, defaultType: "card",        label: "Card 4" },
        { x: 433, y: 182, w: 413,  h: 120, defaultType: "card",        label: "Card 5" },
        { x: 851, y: 182, w: 414,  h: 120, defaultType: "card",        label: "Card 6" },
        { x: 15,  y: 307, w: 1250, h: 407, defaultType: "columnChart", label: "Chart" }
      ]
    },
    {
      id: "D",
      name: "Sidebar Nav (Rail + KPIs + 2 Charts + Table)",
      description: "160px nav rail, 4 KPIs, two-up chart row, detail table",
      boxes: [
        { x: 0,   y: 0,   w: 1280, h: 52,  defaultType: "shape",       label: "Banner" },
        { x: 15,  y: 57,  w: 160,  h: 657, defaultType: "slicer",      label: "Nav Rail" },
        { x: 180, y: 57,  w: 267,  h: 90,  defaultType: "card",        label: "KPI 1" },
        { x: 452, y: 57,  w: 268,  h: 90,  defaultType: "card",        label: "KPI 2" },
        { x: 725, y: 57,  w: 267,  h: 90,  defaultType: "card",        label: "KPI 3" },
        { x: 997, y: 57,  w: 268,  h: 90,  defaultType: "card",        label: "KPI 4" },
        { x: 180, y: 152, w: 540,  h: 280, defaultType: "columnChart", label: "Chart Left" },
        { x: 725, y: 152, w: 540,  h: 280, defaultType: "lineChart",   label: "Chart Right" },
        { x: 180, y: 437, w: 1085, h: 277, defaultType: "tableEx",     label: "Detail" }
      ]
    },
    {
      id: "E",
      name: "3x3 Tile Grid (9 Equal Tiles)",
      description: "Banner over a 3x3 grid of equal tiles",
      boxes: [
        { x: 0,   y: 0,   w: 1280, h: 52,  defaultType: "shape", label: "Banner" },
        { x: 15,  y: 57,  w: 413,  h: 215, defaultType: "card",  label: "Tile 1" },
        { x: 433, y: 57,  w: 413,  h: 215, defaultType: "card",  label: "Tile 2" },
        { x: 851, y: 57,  w: 414,  h: 215, defaultType: "card",  label: "Tile 3" },
        { x: 15,  y: 277, w: 413,  h: 215, defaultType: "card",  label: "Tile 4" },
        { x: 433, y: 277, w: 413,  h: 215, defaultType: "card",  label: "Tile 5" },
        { x: 851, y: 277, w: 414,  h: 215, defaultType: "card",  label: "Tile 6" },
        { x: 15,  y: 497, w: 413,  h: 215, defaultType: "card",  label: "Tile 7" },
        { x: 433, y: 497, w: 413,  h: 215, defaultType: "card",  label: "Tile 8" },
        { x: 851, y: 497, w: 414,  h: 215, defaultType: "card",  label: "Tile 9" }
      ]
    }
  ];

  var VISUAL_TYPES = [
    "card", "columnChart", "barChart", "lineChart", "pieChart", "donutChart",
    "slicer", "tableEx", "pivotTable", "gauge", "treemap", "funnel", "shape"
  ];

  var TYPE_COLORS = {
    card: "var(--type-card)",
    columnChart: "var(--type-columnChart)",
    barChart: "var(--type-barChart)",
    lineChart: "var(--type-lineChart)",
    pieChart: "var(--type-pieChart)",
    donutChart: "var(--type-donutChart)",
    slicer: "var(--type-slicer)",
    tableEx: "var(--type-tableEx)",
    table: "var(--type-table)",
    pivotTable: "var(--type-pivotTable)",
    gauge: "var(--type-gauge)",
    treemap: "var(--type-treemap)",
    funnel: "var(--type-funnel)",
    shape: "var(--type-shape)"
  };
  function colorFor(type) { return TYPE_COLORS[type] || "var(--type-default)"; }

  var CANVAS_W = 1280, CANVAS_H = 720, SCALE = 0.625;
  var VIEW_W = CANVAS_W * SCALE, VIEW_H = CANVAS_H * SCALE; // 800x450
  var SVG_NS = "http://www.w3.org/2000/svg";

  // ─────────────────────────────────────────────────────────────────────────
  // MCP wrapper — handles structuredContent vs content[0].text fallback.
  // The MCP returns { structuredContent, content: [...] }; structuredContent
  // is preferred when present, else parse the JSON-stringified text block.
  // Note the asymmetry probed above: pbir_list_pages emits per-visual
  // entries with short keys (type/w/h), pbir_add_visual takes the full
  // names (visualType/width/height). Critical to keep straight.
  //
  // Cowork's mcp_tools allowlist is keyed by fully-qualified tool names
  // (mcp__<server>__<tool>). Call sites use bare names for readability;
  // callMcp prepends the prefix so the runtime allowlist match succeeds.
  // ─────────────────────────────────────────────────────────────────────────
  var MCP_PREFIX = "mcp__powerbi-report-mcp__";
  async function callMcp(name, args) {
    if (!window.cowork || typeof window.cowork.callMcpTool !== "function") {
      throw new Error("Cowork MCP bridge unavailable (window.cowork.callMcpTool missing).");
    }
    var fqn = name.indexOf("mcp__") === 0 ? name : MCP_PREFIX + name;
    var result = await window.cowork.callMcpTool(fqn, args || {});
    if (result && result.isError) {
      var msg = (result.content && result.content[0] && result.content[0].text) || "MCP error";
      throw new Error(name + ": " + msg);
    }
    if (result && result.structuredContent !== undefined && result.structuredContent !== null) {
      return result.structuredContent;
    }
    if (result && result.content && result.content[0] && result.content[0].text) {
      try { return JSON.parse(result.content[0].text); } catch (e) { return result.content[0].text; }
    }
    return result;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // State + render orchestrator
  // ─────────────────────────────────────────────────────────────────────────
  var state = {
    tab: "inspect",            // "inspect" | "build"
    pages: [],
    activePageId: null,
    selectedVisual: null,
    visualDetail: null,
    pollMs: 0,                 // 0 | 2000 | 5000
    reloadingPbi: false,
    building: false,
    buildModalLayout: null,    // null | layout object
    buildProgress: [],
    error: null,
    toast: null,
    reportPath: null,
    reportConnected: false,
    loading: false,
    lastRefreshedAt: null,     // Date.now() of last successful refresh
    pagesSig: ""               // signature of last pages payload — used to flag "no changes"
  };
  var pollTimer = null;
  var toastTimer = null;
  var root = null;

  function setState(patch) {
    Object.assign(state, patch);
    render();
  }

  function showToast(kind, msg, ttl) {
    if (toastTimer) { clearTimeout(toastTimer); toastTimer = null; }
    setState({ toast: { kind: kind, msg: msg } });
    toastTimer = setTimeout(function () {
      toastTimer = null;
      setState({ toast: null });
    }, ttl || 4000);
  }

  // Tiny DOM helpers — reduce verbosity vs. raw createElement
  function el(tag, props, children) {
    var node = document.createElement(tag);
    if (props) {
      for (var k in props) {
        if (k === "className") node.className = props[k];
        else if (k === "style") Object.assign(node.style, props[k]);
        else if (k.indexOf("on") === 0 && typeof props[k] === "function") {
          node.addEventListener(k.slice(2).toLowerCase(), props[k]);
        } else if (k === "dataset") {
          for (var dk in props[k]) node.dataset[dk] = props[k][dk];
        } else if (k === "html") {
          node.innerHTML = props[k];
        } else if (props[k] === false || props[k] == null) {
          // skip
        } else if (props[k] === true) {
          node.setAttribute(k, "");
        } else {
          node.setAttribute(k, props[k]);
        }
      }
    }
    appendChildren(node, children);
    return node;
  }
  function svgEl(tag, props, children) {
    var node = document.createElementNS(SVG_NS, tag);
    if (props) {
      for (var k in props) {
        if (k.indexOf("on") === 0 && typeof props[k] === "function") {
          node.addEventListener(k.slice(2).toLowerCase(), props[k]);
        } else if (k === "style") {
          Object.assign(node.style, props[k]);
        } else if (props[k] != null && props[k] !== false) {
          node.setAttribute(k, props[k]);
        }
      }
    }
    appendChildren(node, children);
    return node;
  }
  function appendChildren(node, children) {
    if (children == null) return;
    if (!Array.isArray(children)) children = [children];
    for (var i = 0; i < children.length; i++) {
      var c = children[i];
      if (c == null || c === false) continue;
      if (typeof c === "string" || typeof c === "number") {
        node.appendChild(document.createTextNode(String(c)));
      } else {
        node.appendChild(c);
      }
    }
  }

  function fmtTime(ts) {
    if (!ts) return "—";
    var d = new Date(ts);
    function pad(n) { return n < 10 ? "0" + n : "" + n; }
    return pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Renderers
  // ─────────────────────────────────────────────────────────────────────────
  function renderTopBar() {
    var inspectBtn = el("button", {
      className: "tab-btn" + (state.tab === "inspect" ? " active" : ""),
      onclick: function () { setState({ tab: "inspect" }); }
    }, "Inspect");
    var buildBtn = el("button", {
      className: "tab-btn" + (state.tab === "build" ? " active" : ""),
      onclick: function () { setState({ tab: "build" }); }
    }, "Build");
    var reloadBtn = el("button", {
      "data-tip": "Closes and reopens the .pbip in PBI Desktop so JSON edits appear. Save unsaved PBI Desktop work first.",
      disabled: state.reloadingPbi,
      onclick: handleReloadPbi
    }, state.reloadingPbi ? "Reloading..." : "Reload PBI Desktop");
    return el("div", { className: "topbar" }, [
      el("h1", null, "PBIR Wireframe Scaffolder"),
      el("div", { className: "tabs" }, [inspectBtn, buildBtn]),
      el("div", { className: "spacer" }),
      reloadBtn
    ]);
  }

  function renderEmptyState() {
    var refreshBtn = el("button", { onclick: init }, "Refresh");
    return el("div", { className: "empty" }, [
      "No report bound. Connect one with ",
      el("code", null, "pbir_set_report"),
      " or set ",
      el("code", null, "PBIR_REPORT_PATH"),
      ", then click Refresh.",
      el("div", { style: { marginTop: "8px" } }, refreshBtn)
    ]);
  }

  function renderInspectTab() {
    if (!state.pages || state.pages.length === 0) {
      return el("div", { className: "empty" }, [
        "No pages found. Either no report is bound, or the report is empty.",
        el("br"),
        "Bind a report via ",
        el("code", null, "pbir_set_report"),
        " or set ",
        el("code", null, "PBIR_REPORT_PATH"),
        "."
      ]);
    }
    var activePage = null;
    for (var i = 0; i < state.pages.length; i++) {
      if (state.pages[i].id === state.activePageId) { activePage = state.pages[i]; break; }
    }
    if (!activePage) activePage = state.pages[0];

    // Controls row
    var refreshBtn = el("button", {
      disabled: state.loading,
      onclick: refresh
    }, state.loading ? "Refreshing..." : "Refresh");

    var pollSelect = el("select", {
      onchange: function (e) { setState({ pollMs: Number(e.target.value) }); }
    });
    [[0, "Off"], [2000, "2s"], [5000, "5s"]].forEach(function (pair) {
      var opt = el("option", { value: pair[0] }, pair[1]);
      if (pair[0] === state.pollMs) opt.selected = true;
      pollSelect.appendChild(opt);
    });

    var controls = el("div", { className: "inspect-controls" }, [
      refreshBtn,
      el("span", { style: { color: "var(--muted)" } }, "Auto-poll:"),
      pollSelect,
      el("span", { style: { color: "var(--muted)", fontSize: "11px" } },
        state.lastRefreshedAt ? "Updated " + fmtTime(state.lastRefreshedAt) : ""),
      el("span", { style: { color: "var(--muted)", marginLeft: "auto" } },
        activePage.visualCount + " visuals - " + activePage.width + "x" + activePage.height)
    ]);

    // Page tabs
    var pageTabs = el("div", { className: "page-tabs" });
    state.pages.forEach(function (p) {
      var cls = "page-tab" + (p.id === activePage.id ? " active" : "") + (p.hidden ? " hidden" : "");
      var tab = el("button", {
        className: cls,
        onclick: function () {
          setState({ activePageId: p.id, selectedVisual: null, visualDetail: null });
        }
      }, p.displayName + (p.hidden ? " (hidden)" : ""));
      pageTabs.appendChild(tab);
    });

    // Canvas
    var canvasWrap = el("div", { className: "canvas-wrap" }, renderInspectCanvas(activePage.visuals || []));
    var sidePanel = renderSidePanel();

    var body = el("div", { className: "inspect-body" }, [canvasWrap, sidePanel]);
    return el("div", { className: "tab-content" }, [controls, pageTabs, body]);
  }

  function renderInspectCanvas(visuals) {
    var svg = svgEl("svg", {
      width: VIEW_W, height: VIEW_H,
      viewBox: "0 0 " + CANVAS_W + " " + CANVAS_H
    });
    svg.appendChild(svgEl("rect", {
      x: 0, y: 0, width: CANVAS_W, height: CANVAS_H, fill: "var(--canvas-bg)"
    }));
    // margin guides — 15px L, 1265px R, 714px bottom
    [
      [15, 0, 15, CANVAS_H],
      [1265, 0, 1265, CANVAS_H]
    ].forEach(function (g) {
      svg.appendChild(svgEl("line", {
        x1: g[0], y1: g[1], x2: g[2], y2: g[3],
        stroke: "var(--canvas-grid)", "stroke-dasharray": "4 4"
      }));
    });
    svg.appendChild(svgEl("line", {
      x1: 0, y1: 714, x2: CANVAS_W, y2: 714,
      stroke: "var(--canvas-grid)", "stroke-dasharray": "4 4"
    }));

    var selId = state.selectedVisual ? state.selectedVisual.id : null;
    visuals.forEach(function (v) {
      var t = v.type || v.visualType || "default";
      var isSel = v.id === selId;
      var g = svgEl("g", {
        style: { cursor: "pointer" },
        onclick: function () { handleVisualClick(v); }
      });
      g.appendChild(svgEl("rect", {
        x: v.x, y: v.y, width: v.w, height: v.h,
        fill: colorFor(t),
        "fill-opacity": isSel ? 0.85 : 0.55,
        stroke: isSel ? "#000" : "rgba(0,0,0,0.4)",
        "stroke-width": isSel ? 3 : 1
      }));
      var label = svgEl("text", {
        x: v.x + 8, y: v.y + 22,
        fill: "#fff", "font-size": 16, "font-weight": "600",
        style: { pointerEvents: "none" }
      });
      label.textContent = t + " - " + (v.title || "—");
      g.appendChild(label);
      svg.appendChild(g);
    });
    return svg;
  }

  function renderSidePanel() {
    var panel = el("div", { className: "side-panel" });
    if (!state.selectedVisual) {
      panel.appendChild(el("h3", null, "Visual details"));
      panel.appendChild(el("p", { style: { color: "var(--muted)", margin: 0 } },
        "Click a visual on the canvas to inspect it."));
      return panel;
    }
    var v = state.visualDetail || state.selectedVisual;
    var head = el("h3", null, [
      el("span", { className: "swatch", style: { background: colorFor(v.type) } }),
      String(v.type || "")
    ]);
    var dl = el("dl");
    function row(k, val) {
      dl.appendChild(el("dt", null, k));
      dl.appendChild(el("dd", null, val == null ? "—" : String(val)));
    }
    row("id", v.id);
    row("title", v.title || "—");
    row("x, y", v.x + ", " + v.y);
    row("w x h", v.w + " x " + v.h);
    if (v.filterCount !== undefined) row("filters", v.filterCount);
    panel.appendChild(head);
    panel.appendChild(dl);
    return panel;
  }

  function renderBuildTab() {
    var grid = el("div", { className: "layout-grid" });
    LAYOUTS.forEach(function (l) {
      var card = el("div", {
        className: "layout-card",
        onclick: function () { openBuildModal(l); }
      }, [
        el("h3", null, "Layout " + l.id + " - " + l.name.split(" (")[0]),
        el("p", null, l.description),
        renderLayoutPreview(l)
      ]);
      grid.appendChild(card);
    });
    var intro = el("p", { style: { color: "var(--muted)", marginTop: 0 } }, [
      "Pick a canonical layout. Visuals are scaffolded with no bindings — bind them later via PBI Desktop or ",
      el("code", null, "pbir_update_visual_bindings"),
      "."
    ]);
    return el("div", { className: "tab-content" }, [intro, grid]);
  }

  function renderLayoutPreview(layout) {
    var svg = svgEl("svg", {
      viewBox: "0 0 " + CANVAS_W + " " + CANVAS_H,
      width: 200, height: 112
    });
    svg.appendChild(svgEl("rect", {
      x: 0, y: 0, width: CANVAS_W, height: CANVAS_H, fill: "var(--canvas-bg)"
    }));
    layout.boxes.forEach(function (b) {
      svg.appendChild(svgEl("rect", {
        x: b.x, y: b.y, width: b.w, height: b.h,
        fill: colorFor(b.defaultType), "fill-opacity": 0.6,
        stroke: "rgba(0,0,0,0.3)", "stroke-width": 2
      }));
    });
    return svg;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Build modal — uses transient local state held on the modal element so
  // typing in inputs doesn't trigger a full re-render mid-keystroke.
  // ─────────────────────────────────────────────────────────────────────────
  function renderBuildModal(layout) {
    var existingNames = state.pages.map(function (p) { return p.displayName; });
    var nameSet = {};
    existingNames.forEach(function (n) { nameSet[n.toLowerCase()] = true; });
    var n = 1;
    while (nameSet[("page " + n).toLowerCase()]) n++;
    var initialName = "Page " + n;

    // Local form state — kept on closures so typing doesn't re-render.
    var form = {
      pageName: initialName,
      slotTypes: layout.boxes.map(function (b) { return b.defaultType; }),
      autoReload: true
    };

    var nameError = null;
    function computeNameError() {
      var t = form.pageName.trim();
      if (!t) return "Page name is required.";
      for (var i = 0; i < existingNames.length; i++) {
        if (existingNames[i].toLowerCase() === t.toLowerCase()) {
          return "A page with this name already exists.";
        }
      }
      return null;
    }
    nameError = computeNameError();

    var nameErrorEl = el("div", { className: "field-error" }, nameError || "");
    if (!nameError) nameErrorEl.style.display = "none";

    var confirmBtn;

    var nameInput = el("input", {
      type: "text", value: form.pageName,
      disabled: state.building
    });
    nameInput.addEventListener("input", function (e) {
      form.pageName = e.target.value;
      var err = computeNameError();
      nameErrorEl.textContent = err || "";
      nameErrorEl.style.display = err ? "" : "none";
      if (confirmBtn) confirmBtn.disabled = state.building || !!err;
    });

    var slotList = el("div", { className: "slot-list" });
    layout.boxes.forEach(function (b, i) {
      var sel = el("select", { disabled: state.building });
      VISUAL_TYPES.forEach(function (t) {
        var opt = el("option", { value: t }, t);
        if (t === form.slotTypes[i]) opt.selected = true;
        sel.appendChild(opt);
      });
      sel.addEventListener("change", function (e) { form.slotTypes[i] = e.target.value; });
      slotList.appendChild(el("div", { className: "slot-row" }, [
        el("span", null, b.label),
        sel
      ]));
    });

    var autoReloadCb = el("input", {
      id: "auto-reload", type: "checkbox", disabled: state.building
    });
    autoReloadCb.checked = true;
    autoReloadCb.addEventListener("change", function (e) { form.autoReload = e.target.checked; });

    var cancelBtn = el("button", {
      disabled: state.building,
      onclick: function () { setState({ buildModalLayout: null, buildProgress: [] }); }
    }, "Cancel");

    confirmBtn = el("button", {
      className: "primary",
      disabled: state.building || !!nameError,
      onclick: function () {
        handleBuild(layout, {
          pageName: form.pageName.trim(),
          slotTypes: form.slotTypes.slice(),
          autoReload: form.autoReload
        });
      }
    }, state.building ? "Building..." : "Build page");

    var progressEl = null;
    if (state.buildProgress && state.buildProgress.length > 0) {
      progressEl = el("div", { className: "build-progress" });
      state.buildProgress.forEach(function (p) {
        progressEl.appendChild(el("div", { className: "step " + p.status },
          p.label + (p.error ? " — " + p.error : "")));
      });
    }

    var modal = el("div", { className: "modal" }, [
      el("h2", null, "Build: Layout " + layout.id + " — " + layout.name),
      el("div", { className: "field" }, [
        el("label", null, "Page display name"),
        nameInput,
        nameErrorEl
      ]),
      el("div", { className: "field" }, [
        el("label", null, "Visual type per slot (" + layout.boxes.length + " visuals)"),
        slotList
      ]),
      el("div", { className: "checkbox-row" }, [
        autoReloadCb,
        el("label", { for: "auto-reload" }, "Auto-reload PBI Desktop after build")
      ]),
      progressEl,
      el("div", { className: "modal-actions" }, [cancelBtn, confirmBtn])
    ]);
    modal.addEventListener("click", function (e) { e.stopPropagation(); });

    var backdrop = el("div", {
      className: "modal-backdrop",
      onclick: function () {
        if (!state.building) setState({ buildModalLayout: null, buildProgress: [] });
      }
    }, modal);
    return backdrop;
  }

  function renderToast() {
    return el("div", { className: "toast " + state.toast.kind }, state.toast.msg);
  }

  function renderErrorBanner() {
    return el("div", { className: "error-banner" }, "Error: " + state.error);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Main render — rebuild from scratch each time.
  // ~30 elements at peak, well under 1ms.
  // ─────────────────────────────────────────────────────────────────────────
  function render() {
    if (!root) return;
    root.innerHTML = "";
    root.appendChild(renderTopBar());
    if (state.error) root.appendChild(renderErrorBanner());
    if (!state.reportConnected) {
      root.appendChild(renderEmptyState());
    } else if (state.tab === "inspect") {
      root.appendChild(renderInspectTab());
    } else {
      root.appendChild(renderBuildTab());
    }
    if (state.buildModalLayout) {
      root.appendChild(renderBuildModal(state.buildModalLayout));
    }
    if (state.toast) {
      root.appendChild(renderToast());
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Handlers
  // ─────────────────────────────────────────────────────────────────────────
  async function refresh(opts) {
    opts = opts || {};
    setState({ loading: true });
    try {
      var rep = await callMcp("pbir_get_report", {});
      var connected = !!(rep && rep.reportPath && rep.reportPath !== "No report connected");
      var lp = connected
        ? await callMcp("pbir_list_pages", { includeVisuals: true, slim: false })
        : { pages: [] };
      var list = (lp && lp.pages) || [];
      var nextActive = state.activePageId;
      var hasPrev = false;
      for (var i = 0; i < list.length; i++) {
        if (list[i].id === nextActive) { hasPrev = true; break; }
      }
      if (!hasPrev) {
        var active = null;
        for (var j = 0; j < list.length; j++) {
          if (list[j].isActive) { active = list[j]; break; }
        }
        nextActive = active ? active.id : (list[0] ? list[0].id : null);
      }
      var newSig = JSON.stringify(list);
      var firstLoad = !state.pagesSig;
      var changed = !firstLoad && newSig !== state.pagesSig;
      setState({
        reportConnected: connected,
        reportPath: connected ? rep.reportPath : null,
        pages: list,
        activePageId: nextActive,
        lastRefreshedAt: Date.now(),
        pagesSig: newSig,
        loading: false,
        error: null
      });
      if (!opts.silent) {
        var msg = firstLoad ? "Refreshed" : (changed ? "Refreshed — pages updated" : "Refreshed — no changes");
        showToast("success", msg, 1500);
      }
    } catch (e) {
      setState({ loading: false, error: null });
      showToast("error", e.message || String(e));
    }
  }

  async function handleVisualClick(v) {
    setState({ selectedVisual: v, visualDetail: null });
    try {
      var detail = await callMcp("pbir_get_visual", {
        pageId: state.activePageId, visualId: v.id
      });
      // Only update if still the same selection
      if (state.selectedVisual && state.selectedVisual.id === v.id) {
        setState({ visualDetail: detail });
      }
    } catch (e) {
      showToast("error", "pbir_get_visual: " + e.message);
    }
  }

  async function handleReloadPbi() {
    setState({ reloadingPbi: true });
    try {
      await callMcp("pbir_reload_report", { confirm: true });
      showToast("success", "PBI Desktop reload requested.");
    } catch (e) {
      showToast("error", "Reload failed: " + e.message);
    } finally {
      setState({ reloadingPbi: false });
    }
  }

  function openBuildModal(layout) {
    setState({ buildModalLayout: layout, buildProgress: [] });
  }

  async function handleBuild(layout, opts) {
    var pageName = opts.pageName, slotTypes = opts.slotTypes, autoReload = opts.autoReload;
    var progress = [
      { label: 'Create page "' + pageName + '"', status: "pending" },
      { label: "Add " + layout.boxes.length + " visuals", status: "pending" }
    ];
    if (autoReload) progress.push({ label: "Reload PBI Desktop", status: "pending" });
    setState({ building: true, buildProgress: progress.slice() });

    var newPageId = null;
    try {
      var cp = await callMcp("pbir_create_page", { displayName: pageName });
      newPageId = cp && cp.pageId;
      progress[0] = Object.assign({}, progress[0], { status: "ok" });
      setState({ buildProgress: progress.slice() });

      var visuals = layout.boxes.map(function (b, i) {
        return {
          visualType: slotTypes[i],
          x: b.x, y: b.y, width: b.w, height: b.h,
          title: b.label
        };
      });
      await callMcp("pbir_add_visual", { pageId: newPageId, visuals: visuals });
      progress[1] = Object.assign({}, progress[1], { status: "ok" });
      setState({ buildProgress: progress.slice() });

      if (autoReload) {
        try {
          await callMcp("pbir_reload_report", { confirm: true });
          progress[2] = Object.assign({}, progress[2], { status: "ok" });
        } catch (e) {
          progress[2] = Object.assign({}, progress[2], { status: "fail", error: e.message });
        }
        setState({ buildProgress: progress.slice() });
      }

      showToast("success", 'Page "' + pageName + '" built with ' + visuals.length + " visuals.");
      setState({
        buildModalLayout: null,
        buildProgress: [],
        building: false
      });
      await refresh({ silent: true });
      setState({ activePageId: newPageId, tab: "inspect" });
    } catch (e) {
      var idx = -1;
      for (var i = 0; i < progress.length; i++) {
        if (progress[i].status === "pending") { idx = i; break; }
      }
      if (idx >= 0) progress[idx] = Object.assign({}, progress[idx], { status: "fail", error: e.message });
      setState({ buildProgress: progress.slice(), building: false });
      showToast("error", e.message || String(e));
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Polling — pause when the artifact tab is hidden (Page Visibility API).
  // ─────────────────────────────────────────────────────────────────────────
  function syncPollTimer() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    if (state.pollMs > 0) {
      pollTimer = setInterval(function () {
        if (!document.hidden && state.reportConnected && !state.loading && !state.building) {
          refresh({ silent: true });
        }
      }, state.pollMs);
    }
  }
  // Wrap setState so any change to pollMs re-syncs the timer.
  var _setState = setState;
  setState = function (patch) {
    var pollChanged = "pollMs" in patch && patch.pollMs !== state.pollMs;
    _setState(patch);
    if (pollChanged) syncPollTimer();
  };
  document.addEventListener("visibilitychange", function () {
    // Timer keeps running; the tick guards on document.hidden itself.
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Bootstrap
  // ─────────────────────────────────────────────────────────────────────────
  async function init() {
    root = document.getElementById("root");
    setState({ error: null });
    try {
      var report = await callMcp("pbir_get_report", {});
      if (report && report.reportPath && report.reportPath !== "No report connected") {
        setState({ reportConnected: true, reportPath: report.reportPath });
        await refresh({ silent: true });
      } else {
        setState({ reportConnected: false });
      }
    } catch (e) {
      setState({ reportConnected: false, error: e.message });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
</script>
```

## Follow-ups parked for v2

- **Wireframe validator warnings footer** — `src/wireframe-validator.ts` is
  not exposed via an MCP tool, so per-page warnings can't be shown without
  a new tool (or running validation client-side, duplicating geometry). Add
  `pbir_validate_wireframe` (or surface validator output on `pbir_list_pages`)
  before wiring the warnings footer.
- **Field bindings UI.** Visuals are scaffolded empty by design. Add a model
  field picker once we see whether users want it.
- **Click warning → highlight visual.** Depends on the warnings footer above.

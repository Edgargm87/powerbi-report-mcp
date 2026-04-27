<!-- doc-version: 1.0 | Last updated: 2026-04-26 -->
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

## Source

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>PBIR Wireframe Scaffolder</title>
<style>
  :root {
    --bg: transparent;
    --fg: var(--cowork-fg, #1a1a1a);
    --muted: var(--cowork-muted, #6b6b6b);
    --border: var(--cowork-border, rgba(0,0,0,0.12));
    --panel: var(--cowork-panel, rgba(0,0,0,0.03));
    --accent: var(--cowork-accent, #3a7bd5);
    --danger: #c0392b;
    --success: #2e8b57;
    --warning: #b8860b;
    --canvas-bg: #fafbfc;
    --canvas-grid: rgba(0,0,0,0.05);
    /* type palette — 12 visual types */
    --type-card: #4a90e2;
    --type-columnChart: #50c878;
    --type-barChart: #2ecc71;
    --type-lineChart: #e67e22;
    --type-pieChart: #d35400;
    --type-donutChart: #c0392b;
    --type-slicer: #9b59b6;
    --type-tableEx: #34495e;
    --type-pivotTable: #2c3e50;
    --type-gauge: #16a085;
    --type-treemap: #8e44ad;
    --type-funnel: #d4ac0d;
    --type-shape: #95a5a6;
    --type-table: #34495e;
    --type-default: #7f8c8d;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--bg);
    color: var(--fg);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 13px;
    line-height: 1.4;
  }
  .app { display: flex; flex-direction: column; min-height: 100vh; }
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
    background: transparent; color: var(--fg);
    border-radius: 6px; cursor: pointer; font-size: 13px;
  }
  .tab-btn.active { background: var(--accent); color: #fff; border-color: var(--accent); }
  .spacer { flex: 1; }
  button {
    padding: 6px 12px; border: 1px solid var(--border);
    background: var(--panel); color: var(--fg);
    border-radius: 6px; cursor: pointer; font-size: 13px;
  }
  button:hover:not(:disabled) { background: rgba(0,0,0,0.06); }
  button:disabled { opacity: 0.5; cursor: not-allowed; }
  button.primary { background: var(--accent); color: #fff; border-color: var(--accent); }
  button.danger { background: var(--danger); color: #fff; border-color: var(--danger); }
  .tab-content { flex: 1; padding: 12px; }
  .empty {
    padding: 24px; text-align: center; color: var(--muted);
    border: 1px dashed var(--border); border-radius: 8px; margin: 24px;
  }
  .empty code {
    background: var(--panel); padding: 1px 5px; border-radius: 3px;
    font-size: 12px;
  }
  /* Inspect tab */
  .inspect-controls {
    display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
    margin-bottom: 8px;
  }
  .page-tabs { display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 8px; }
  .page-tab {
    padding: 4px 10px; border: 1px solid var(--border);
    background: transparent; border-radius: 4px; cursor: pointer;
    font-size: 12px;
  }
  .page-tab.active { background: var(--accent); color: #fff; border-color: var(--accent); }
  .page-tab.hidden { opacity: 0.5; font-style: italic; }
  .inspect-body { display: flex; gap: 12px; align-items: flex-start; }
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
  /* Build tab */
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
  /* Modal */
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
  }
  .field-error { color: var(--danger); font-size: 11px; margin-top: 2px; }
  .slot-row {
    display: grid; grid-template-columns: 80px 1fr; gap: 8px; align-items: center;
    margin-bottom: 4px;
  }
  .slot-row span { font-family: monospace; font-size: 11px; color: #666; }
  .modal-actions {
    display: flex; gap: 8px; justify-content: flex-end; margin-top: 12px;
  }
  .checkbox-row { display: flex; align-items: center; gap: 6px; margin-bottom: 10px; font-size: 12px; }
  /* Toast */
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
  .build-progress .step.ok::before { content: "✓ "; color: var(--success); }
  .build-progress .step.fail::before { content: "✗ "; color: var(--danger); }
  .build-progress .step.pending::before { content: "… "; color: var(--muted); }
  /* Tooltip */
  [data-tip] { position: relative; }
  [data-tip]:hover::after {
    content: attr(data-tip);
    position: absolute; top: calc(100% + 4px); right: 0;
    background: #222; color: #fff; padding: 4px 8px; border-radius: 4px;
    font-size: 11px; white-space: nowrap; max-width: 240px; white-space: normal;
    width: max-content; z-index: 50; pointer-events: none;
  }
</style>
</head>
<body>
<div id="root"></div>
<script type="text/babel">
  const { useState, useEffect, useCallback, useMemo, useRef } = React;

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
  const LAYOUTS = [
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
        { x: 851,  y: 437, w: 414,  h: 277, defaultType: "tableEx",     label: "Detail 3" },
      ],
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
        { x: 15,  y: 507, w: 1250, h: 207, defaultType: "tableEx",     label: "Table" },
      ],
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
        { x: 15,  y: 307, w: 1250, h: 407, defaultType: "columnChart", label: "Chart" },
      ],
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
        { x: 180, y: 437, w: 1085, h: 277, defaultType: "tableEx",     label: "Detail" },
      ],
    },
    {
      id: "E",
      name: "3×3 Tile Grid (9 Equal Tiles)",
      description: "Banner over a 3×3 grid of equal tiles",
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
        { x: 851, y: 497, w: 414,  h: 215, defaultType: "card",  label: "Tile 9" },
      ],
    },
  ];

  const VISUAL_TYPES = [
    "card", "columnChart", "barChart", "lineChart", "pieChart", "donutChart",
    "slicer", "tableEx", "pivotTable", "gauge", "treemap", "funnel", "shape",
  ];

  const TYPE_COLORS = {
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
    shape: "var(--type-shape)",
  };
  function colorFor(type) { return TYPE_COLORS[type] || "var(--type-default)"; }

  const CANVAS_W = 1280, CANVAS_H = 720, SCALE = 0.625;
  const VIEW_W = CANVAS_W * SCALE, VIEW_H = CANVAS_H * SCALE; // 800×450

  // ─────────────────────────────────────────────────────────────────────────
  // MCP wrapper
  // ─────────────────────────────────────────────────────────────────────────
  async function callMcp(name, args) {
    if (!window.cowork || typeof window.cowork.callMcpTool !== "function") {
      throw new Error("Cowork MCP bridge unavailable (window.cowork.callMcpTool missing).");
    }
    const result = await window.cowork.callMcpTool(name, args || {});
    if (result && result.isError) {
      const msg = (result.content && result.content[0] && result.content[0].text) || "MCP error";
      throw new Error(`${name}: ${msg}`);
    }
    if (result && result.structuredContent !== undefined && result.structuredContent !== null) {
      return result.structuredContent;
    }
    if (result && result.content && result.content[0] && result.content[0].text) {
      try { return JSON.parse(result.content[0].text); } catch { return result.content[0].text; }
    }
    return result;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Top bar
  // ─────────────────────────────────────────────────────────────────────────
  function TopBar({ tab, onTabChange, onReload, reloading }) {
    return (
      <div className="topbar">
        <h1>PBIR Wireframe Scaffolder</h1>
        <div className="tabs">
          <button className={`tab-btn ${tab === "inspect" ? "active" : ""}`} onClick={() => onTabChange("inspect")}>Inspect</button>
          <button className={`tab-btn ${tab === "build" ? "active" : ""}`} onClick={() => onTabChange("build")}>Build</button>
        </div>
        <div className="spacer" />
        <button
          onClick={onReload}
          disabled={reloading}
          data-tip="Closes and reopens the .pbip in PBI Desktop so JSON edits appear. Save unsaved PBI Desktop work first."
        >
          {reloading ? "Reloading…" : "Reload PBI Desktop"}
        </button>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Inspect tab
  // ─────────────────────────────────────────────────────────────────────────
  function InspectCanvas({ visuals, selectedId, onClick }) {
    return (
      <div className="canvas-wrap">
        <svg width={VIEW_W} height={VIEW_H} viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}>
          <rect x={0} y={0} width={CANVAS_W} height={CANVAS_H} fill="var(--canvas-bg)" />
          {/* margin guides */}
          <line x1={15}   y1={0} x2={15}   y2={CANVAS_H} stroke="var(--canvas-grid)" strokeDasharray="4 4" />
          <line x1={1265} y1={0} x2={1265} y2={CANVAS_H} stroke="var(--canvas-grid)" strokeDasharray="4 4" />
          <line x1={0} y1={714} x2={CANVAS_W} y2={714} stroke="var(--canvas-grid)" strokeDasharray="4 4" />
          {(visuals || []).map((v) => {
            const t = v.type || v.visualType || "default";
            const isSel = v.id === selectedId;
            return (
              <g key={v.id} onClick={() => onClick(v)} style={{ cursor: "pointer" }}>
                <rect
                  x={v.x} y={v.y} width={v.w} height={v.h}
                  fill={colorFor(t)} fillOpacity={isSel ? 0.85 : 0.55}
                  stroke={isSel ? "#000" : "rgba(0,0,0,0.3)"}
                  strokeWidth={isSel ? 3 : 1}
                />
                <text
                  x={v.x + 8} y={v.y + 22}
                  fill="#fff" fontSize={16} fontWeight="600"
                  style={{ pointerEvents: "none" }}
                >
                  {t} · {v.title || "—"}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    );
  }

  function SidePanel({ visual, detail }) {
    if (!visual) {
      return (
        <div className="side-panel">
          <h3>Visual details</h3>
          <p style={{ color: "var(--muted)", margin: 0 }}>Click a visual on the canvas to inspect it.</p>
        </div>
      );
    }
    const v = detail || visual;
    return (
      <div className="side-panel">
        <h3>
          <span className="swatch" style={{ background: colorFor(v.type) }}></span>
          {v.type}
        </h3>
        <dl>
          <dt>id</dt><dd>{v.id}</dd>
          <dt>title</dt><dd>{v.title || "—"}</dd>
          <dt>x, y</dt><dd>{v.x}, {v.y}</dd>
          <dt>w × h</dt><dd>{v.w} × {v.h}</dd>
          {v.filterCount !== undefined && (<><dt>filters</dt><dd>{v.filterCount}</dd></>)}
        </dl>
      </div>
    );
  }

  function InspectTab({ pages, activePageId, onPageChange, selectedVisual, visualDetail, onVisualClick, pollMs, onPollChange, onRefresh, loading }) {
    if (!pages || pages.length === 0) {
      return (
        <div className="empty">
          No pages found. Either no report is bound, or the report is empty.<br/>
          Bind a report via <code>pbir_set_report</code> or set <code>PBIR_REPORT_PATH</code>.
        </div>
      );
    }
    const activePage = pages.find(p => p.id === activePageId) || pages[0];
    return (
      <div>
        <div className="inspect-controls">
          <button onClick={onRefresh} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</button>
          <span style={{ color: "var(--muted)" }}>Auto-poll:</span>
          <select value={pollMs} onChange={(e) => onPollChange(Number(e.target.value))}>
            <option value={0}>Off</option>
            <option value={2000}>2s</option>
            <option value={5000}>5s</option>
          </select>
          <span style={{ color: "var(--muted)", marginLeft: "auto" }}>
            {activePage.visualCount} visuals · {activePage.width}×{activePage.height}
          </span>
        </div>
        <div className="page-tabs">
          {pages.map(p => (
            <button
              key={p.id}
              className={`page-tab ${p.id === activePage.id ? "active" : ""} ${p.hidden ? "hidden" : ""}`}
              onClick={() => onPageChange(p.id)}
            >
              {p.displayName} {p.hidden ? "(hidden)" : ""}
            </button>
          ))}
        </div>
        <div className="inspect-body">
          <InspectCanvas
            visuals={activePage.visuals || []}
            selectedId={selectedVisual ? selectedVisual.id : null}
            onClick={onVisualClick}
          />
          <SidePanel visual={selectedVisual} detail={visualDetail} />
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Build tab
  // ─────────────────────────────────────────────────────────────────────────
  function LayoutPreview({ layout, w = 200, h = 112 }) {
    return (
      <svg viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`} width={w} height={h}>
        <rect x={0} y={0} width={CANVAS_W} height={CANVAS_H} fill="var(--canvas-bg)" />
        {layout.boxes.map((b, i) => (
          <rect
            key={i}
            x={b.x} y={b.y} width={b.w} height={b.h}
            fill={colorFor(b.defaultType)} fillOpacity={0.6}
            stroke="rgba(0,0,0,0.3)" strokeWidth={2}
          />
        ))}
      </svg>
    );
  }

  function BuildModal({ layout, existingNames, onCancel, onConfirm, building, progress }) {
    const initialName = useMemo(() => {
      let n = 1;
      const set = new Set((existingNames || []).map(x => x.toLowerCase()));
      while (set.has(`page ${n}`.toLowerCase())) n++;
      return `Page ${n}`;
    }, [existingNames]);
    const [pageName, setPageName] = useState(initialName);
    const [slotTypes, setSlotTypes] = useState(layout.boxes.map(b => b.defaultType));
    const [autoReload, setAutoReload] = useState(true);

    const nameError = useMemo(() => {
      if (!pageName.trim()) return "Page name is required.";
      if ((existingNames || []).some(x => x.toLowerCase() === pageName.trim().toLowerCase())) {
        return "A page with this name already exists.";
      }
      return null;
    }, [pageName, existingNames]);

    return (
      <div className="modal-backdrop" onClick={building ? undefined : onCancel}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <h2>Build: Layout {layout.id} — {layout.name}</h2>
          <div className="field">
            <label>Page display name</label>
            <input
              type="text" value={pageName}
              onChange={(e) => setPageName(e.target.value)}
              disabled={building}
            />
            {nameError && <div className="field-error">{nameError}</div>}
          </div>
          <div className="field">
            <label>Visual type per slot ({layout.boxes.length} visuals)</label>
            <div style={{ maxHeight: 220, overflowY: "auto", border: "1px solid #eee", borderRadius: 4, padding: 6 }}>
              {layout.boxes.map((b, i) => (
                <div key={i} className="slot-row">
                  <span>{b.label}</span>
                  <select
                    value={slotTypes[i]}
                    onChange={(e) => {
                      const next = slotTypes.slice();
                      next[i] = e.target.value;
                      setSlotTypes(next);
                    }}
                    disabled={building}
                  >
                    {VISUAL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>
          <div className="checkbox-row">
            <input
              id="auto-reload" type="checkbox"
              checked={autoReload}
              onChange={(e) => setAutoReload(e.target.checked)}
              disabled={building}
            />
            <label htmlFor="auto-reload">Auto-reload PBI Desktop after build</label>
          </div>
          {progress && progress.length > 0 && (
            <div className="build-progress">
              {progress.map((p, i) => (
                <div key={i} className={`step ${p.status}`}>{p.label}{p.error ? ` — ${p.error}` : ""}</div>
              ))}
            </div>
          )}
          <div className="modal-actions">
            <button onClick={onCancel} disabled={building}>Cancel</button>
            <button
              className="primary"
              disabled={building || !!nameError}
              onClick={() => onConfirm({ pageName: pageName.trim(), slotTypes, autoReload })}
            >
              {building ? "Building…" : "Build page"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  function BuildTab({ layouts, onPick }) {
    return (
      <div>
        <p style={{ color: "var(--muted)", marginTop: 0 }}>
          Pick a canonical layout. Visuals are scaffolded with no bindings — bind them later
          via PBI Desktop or <code>pbir_update_visual_bindings</code>.
        </p>
        <div className="layout-grid">
          {layouts.map(l => (
            <div key={l.id} className="layout-card" onClick={() => onPick(l)}>
              <h3>Layout {l.id} — {l.name.split(" (")[0]}</h3>
              <p>{l.description}</p>
              <LayoutPreview layout={l} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // App
  // ─────────────────────────────────────────────────────────────────────────
  function App() {
    const [hasCowork, setHasCowork] = useState(typeof window !== "undefined" && !!window.cowork);
    const [reportPath, setReportPath] = useState(null);
    const [tab, setTab] = useState("inspect");
    const [pages, setPages] = useState([]);
    const [activePageId, setActivePageId] = useState(null);
    const [selectedVisual, setSelectedVisual] = useState(null);
    const [visualDetail, setVisualDetail] = useState(null);
    const [pollMs, setPollMs] = useState(0);
    const [loading, setLoading] = useState(false);
    const [reloadingPbi, setReloadingPbi] = useState(false);
    const [toast, setToast] = useState(null);
    const [pickedLayout, setPickedLayout] = useState(null);
    const [building, setBuilding] = useState(false);
    const [buildProgress, setBuildProgress] = useState([]);
    const initialLoadRef = useRef(false);

    const showToast = useCallback((kind, msg, ttl = 4000) => {
      setToast({ kind, msg });
      setTimeout(() => setToast(null), ttl);
    }, []);

    const refresh = useCallback(async () => {
      if (!hasCowork) return;
      setLoading(true);
      try {
        const rep = await callMcp("pbir_get_report", {});
        setReportPath(rep && rep.reportPath ? rep.reportPath : null);
        const lp = await callMcp("pbir_list_pages", { includeVisuals: true, slim: false });
        const list = (lp && lp.pages) || [];
        setPages(list);
        setActivePageId(prev => {
          if (prev && list.some(p => p.id === prev)) return prev;
          const active = list.find(p => p.isActive);
          return active ? active.id : (list[0] ? list[0].id : null);
        });
      } catch (e) {
        showToast("error", e.message || String(e));
      } finally {
        setLoading(false);
      }
    }, [hasCowork, showToast]);

    // Initial load
    useEffect(() => {
      if (!hasCowork || initialLoadRef.current) return;
      initialLoadRef.current = true;
      refresh();
    }, [hasCowork, refresh]);

    // Poll loop with visibility pause
    useEffect(() => {
      if (!hasCowork || !pollMs) return;
      let timer = null;
      const tick = () => {
        if (!document.hidden) refresh();
      };
      timer = setInterval(tick, pollMs);
      const onVis = () => { /* tick will check hidden itself */ };
      document.addEventListener("visibilitychange", onVis);
      return () => {
        if (timer) clearInterval(timer);
        document.removeEventListener("visibilitychange", onVis);
      };
    }, [hasCowork, pollMs, refresh]);

    const handleVisualClick = useCallback(async (v) => {
      setSelectedVisual(v);
      setVisualDetail(null);
      try {
        const detail = await callMcp("pbir_get_visual", { pageId: activePageId, visualId: v.id });
        setVisualDetail(detail);
      } catch (e) {
        showToast("error", `pbir_get_visual: ${e.message}`);
      }
    }, [activePageId, showToast]);

    const handleReloadPbi = useCallback(async () => {
      setReloadingPbi(true);
      try {
        await callMcp("pbir_reload_report", { confirm: true });
        showToast("success", "PBI Desktop reload requested.");
      } catch (e) {
        showToast("error", `Reload failed: ${e.message}`);
      } finally {
        setReloadingPbi(false);
      }
    }, [showToast]);

    const handleBuild = useCallback(async ({ pageName, slotTypes, autoReload }) => {
      setBuilding(true);
      const progress = [
        { label: `Create page "${pageName}"`, status: "pending" },
        { label: `Add ${pickedLayout.boxes.length} visuals`, status: "pending" },
      ];
      if (autoReload) progress.push({ label: "Reload PBI Desktop", status: "pending" });
      setBuildProgress(progress);
      let newPageId = null;
      try {
        const cp = await callMcp("pbir_create_page", { displayName: pageName });
        newPageId = cp && cp.pageId;
        progress[0] = { ...progress[0], status: "ok" };
        setBuildProgress([...progress]);

        const visuals = pickedLayout.boxes.map((b, i) => ({
          visualType: slotTypes[i],
          x: b.x, y: b.y, width: b.w, height: b.h,
          title: b.label,
        }));
        await callMcp("pbir_add_visual", { pageId: newPageId, visuals });
        progress[1] = { ...progress[1], status: "ok" };
        setBuildProgress([...progress]);

        if (autoReload) {
          try {
            await callMcp("pbir_reload_report", { confirm: true });
            progress[2] = { ...progress[2], status: "ok" };
          } catch (e) {
            progress[2] = { ...progress[2], status: "fail", error: e.message };
          }
          setBuildProgress([...progress]);
        }
        showToast("success", `Page "${pageName}" built with ${visuals.length} visuals.`);
        setPickedLayout(null);
        setBuildProgress([]);
        await refresh();
        setActivePageId(newPageId);
        setTab("inspect");
      } catch (e) {
        const idx = progress.findIndex(p => p.status === "pending");
        if (idx >= 0) progress[idx] = { ...progress[idx], status: "fail", error: e.message };
        setBuildProgress([...progress]);
        showToast("error", e.message || String(e));
      } finally {
        setBuilding(false);
      }
    }, [pickedLayout, refresh, showToast]);

    if (!hasCowork) {
      return (
        <div className="app">
          <TopBar tab={tab} onTabChange={() => {}} onReload={() => {}} reloading={false} />
          <div className="empty">
            This artifact requires Cowork. Open it inside a Cowork session — it talks to the
            <code>powerbi-report-mcp</code> server through <code>window.cowork.callMcpTool</code>.
          </div>
        </div>
      );
    }

    return (
      <div className="app">
        <TopBar
          tab={tab}
          onTabChange={setTab}
          onReload={handleReloadPbi}
          reloading={reloadingPbi}
        />
        <div className="tab-content">
          {!reportPath && !loading && (
            <div className="empty">
              No report bound. Connect one with <code>pbir_set_report</code> or set
              <code>PBIR_REPORT_PATH</code>, then click Refresh.
              <div style={{ marginTop: 8 }}>
                <button onClick={refresh}>Refresh</button>
              </div>
            </div>
          )}
          {reportPath && tab === "inspect" && (
            <InspectTab
              pages={pages}
              activePageId={activePageId}
              onPageChange={(id) => { setActivePageId(id); setSelectedVisual(null); setVisualDetail(null); }}
              selectedVisual={selectedVisual}
              visualDetail={visualDetail}
              onVisualClick={handleVisualClick}
              pollMs={pollMs}
              onPollChange={setPollMs}
              onRefresh={refresh}
              loading={loading}
            />
          )}
          {reportPath && tab === "build" && (
            <BuildTab layouts={LAYOUTS} onPick={setPickedLayout} />
          )}
        </div>
        {pickedLayout && (
          <BuildModal
            layout={pickedLayout}
            existingNames={pages.map(p => p.displayName)}
            onCancel={() => { setPickedLayout(null); setBuildProgress([]); }}
            onConfirm={handleBuild}
            building={building}
            progress={buildProgress}
          />
        )}
        {toast && (
          <div className={`toast ${toast.kind}`}>{toast.msg}</div>
        )}
      </div>
    );
  }

  ReactDOM.render(<App />, document.getElementById("root"));
</script>
</body>
</html>
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

# Power BI Report Builder

Build Power BI reports from natural language. This plugin bundles the `powerbi-report-mcp` server, which writes directly into a `.pbip` (Power BI Project) folder in PBIR format — pages, visuals, themes, layouts, slicers, formatting — so you can scaffold, edit, and theme reports just by describing what you want.

## Quick start

1. Install this plugin in Claude Cowork.
2. Open a `.pbip` Power BI Project folder in Power BI Desktop (File > Save As > "Power BI Project (folder)").
3. In Cowork, point at the report and start describing what you want:
   - "Build me a sales dashboard for the last 4 quarters."
   - "Add a KPI strip with revenue, margin, and orders to page 2."
   - "Make this report look more professional."
   - "Wireframe a layout for a customer churn report."

The first time you ask, the agent will request the path to your `.pbip` folder and call `set_report` to connect.

## What you can build

- **Pages**: create, rename, duplicate, reorder, set visibility, set page-level filters and backgrounds.
- **Visuals**: cards, KPIs, line/column/bar/pie charts, tables, matrices, slicers, gauges, custom shapes, SVG visuals — 20+ types.
- **Layouts**: validated 1280x720 / 1920x1080 page geometry, the `layout_grid` tool for grid-based placement, 5 pre-validated layout patterns.
- **Themes**: full report theme JSON, per-visual theme overrides, conditional formatting, datapoint colors.
- **Bookmarks, filters, sort orders, visual interactions** — everything the PBIR format supports.

## What's included

- The full Power BI Report MCP server, bundled and ready to run offline (no `npm install` required).
- 3 native Cowork skills that auto-trigger when you ask to build, wireframe, or design a report.
- 13 additional knowledge skills accessible inside the MCP via the `guide(topic)` tool — covering visuals, formatting, themes, calculations, slicers, filters, errors, token usage, and more.

## Requirements

- A `.pbip` (Power BI Project) folder. In Power BI Desktop: File > Save As > "Power BI Project (folder)".
- Power BI Desktop open on the same project (so you can refresh and see results).
- Node.js 18+ available on your machine (Cowork bundles this).

## How it works

The plugin runs the MCP server as a subprocess in the background. The 3 native skills (build / wireframe / design) auto-load when you mention relevant phrases and route you to the right MCP tools. For deeper knowledge on any topic — visuals, formatting, themes, calculations — call `guide("topic-name")` inside the MCP.

## Source

TODO: link the upstream `powerbi-report-mcp` repo here once the public URL is set.

## License

MIT

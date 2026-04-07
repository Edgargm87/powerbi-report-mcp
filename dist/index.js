#!/usr/bin/env node
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const mcp_js_1 = require("@modelcontextprotocol/sdk/server/mcp.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const zod_1 = require("zod");
const pbir_js_1 = require("./pbir.js");
const report_js_1 = require("./tools/report.js");
const visuals_js_1 = require("./tools/visuals.js");
const format_js_1 = require("./tools/format.js");
const bindings_js_1 = require("./tools/bindings.js");
const themes_js_1 = require("./tools/themes.js");
const filters_js_1 = require("./tools/filters.js");
const bulk_js_1 = require("./tools/bulk.js");
// Visual calculations parked — not registering until PBI Desktop supports programmatic creation
// import { registerCalculationTools } from "./tools/calculations.js";
// --- Tool loading modes ---
// Default: only load core tools (~9) to reduce token overhead for LLM clients.
// Set MCP_TOOLS=all to load all tools at startup.
const DEFAULT_TOOLS = new Set([
    "list_pages",
    "list_visuals",
    "create_page",
    "add_visual",
    "get_visual",
    "format_visual",
    "update_visual_bindings",
    "set_report_theme",
    "bulk_bind",
]);
const ALL_TOOLS = {
    // Report management
    set_report: "Connect to a different Power BI report",
    get_report: "Get report metadata",
    list_pages: "List all pages (DEFAULT)",
    create_page: "Create a new page (DEFAULT)",
    rename_page: "Rename a page",
    delete_page: "Delete a page",
    reorder_pages: "Reorder pages",
    set_active_page: "Set the active page",
    set_page_visibility: "Show or hide a page",
    get_report_settings: "Get report-level settings",
    update_report_settings: "Update report-level settings",
    update_page_size: "Change page dimensions",
    auto_layout: "Auto-arrange visuals on a page",
    duplicate_page: "Duplicate an entire page",
    get_page_summary: "Get a detailed page summary",
    reload_report: "Reload report from disk",
    // Visuals
    list_visuals: "List visuals on a page (DEFAULT)",
    get_visual: "Inspect a visual's full config (DEFAULT)",
    get_visual_types: "List available visual types",
    add_visual: "Add one or more visuals (DEFAULT)",
    delete_visual: "Delete a visual",
    move_visual: "Move or resize a visual",
    duplicate_visual: "Duplicate a visual",
    change_visual_type: "Change a visual's type",
    // Formatting
    format_visual: "Format visual properties (DEFAULT)",
    set_visual_title: "Set a visual's title",
    set_datapoint_colors: "Set data point colors",
    set_conditional_format: "Apply conditional formatting",
    apply_theme: "Apply a theme JSON to the report",
    // Themes
    set_report_theme: "Set the report theme (DEFAULT)",
    get_report_theme: "Get the current theme JSON",
    remove_report_theme: "Remove the custom theme",
    diff_report_theme: "Diff current vs default theme",
    list_report_themes: "List available themes",
    // Bindings
    update_visual_bindings: "Update data bindings (DEFAULT)",
    // Bulk
    bulk_bind: "Rebind multiple visuals at once (DEFAULT)",
    bulk_delete_visuals: "Delete multiple visuals",
    bulk_update_format: "Format multiple visuals at once",
    // Filters
    list_filters: "List filters on a page or visual",
    add_page_filter: "Add a page-level filter",
    remove_filter: "Remove a filter",
    clear_filters: "Clear all filters",
    // Calculations — PARKED: visual calculations don't render when written programmatically
    // list_visual_calculations, add_visual_calculation, delete_visual_calculation
};
// --- Discover .Report folder ---
function findReportFolder(basePath) {
    if (fs.existsSync(basePath) && fs.statSync(basePath).isDirectory()) {
        if (basePath.endsWith(".Report") && fs.existsSync(path.join(basePath, "definition"))) {
            return basePath;
        }
        const entries = fs.readdirSync(basePath, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isDirectory() && entry.name.endsWith(".Report")) {
                const candidate = path.join(basePath, entry.name);
                if (fs.existsSync(path.join(candidate, "definition"))) {
                    return candidate;
                }
            }
        }
    }
    return null;
}
// --- Process stability ---
process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));
process.on("uncaughtException", (err) => console.error("[uncaughtException]", err));
process.on("unhandledRejection", (reason) => console.error("[unhandledRejection]", reason));
// --- Tool handler wrapper — returns isError response instead of crashing ---
function safe(fn
// eslint-disable-next-line @typescript-eslint/no-explicit-any
) {
    return async (args) => {
        try {
            return await fn(args);
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return {
                content: [{ type: "text", text: JSON.stringify({ success: false, error: msg }) }],
                isError: true,
            };
        }
    };
}
// --- Main ---
async function main() {
    let reportPath = null;
    let _project = null;
    // Proxy that auto-validates — all existing project.xxx calls work unchanged
    const project = new Proxy({}, {
        get(_target, prop) {
            if (!_project) {
                throw new Error("No report connected. Use the set_report tool to connect to a .Report folder first.");
            }
            const val = _project[prop];
            return typeof val === "function" ? val.bind(_project) : val;
        },
    });
    function connectReport(targetPath) {
        const resolved = findReportFolder(path.resolve(targetPath));
        if (!resolved) {
            return { success: false, error: `No .Report folder found at: ${targetPath}` };
        }
        reportPath = resolved;
        _project = new pbir_js_1.PbirProject(reportPath);
        console.error(`Connected to report: ${reportPath}`);
        return { success: true, reportPath };
    }
    // Connect to initial report if provided as CLI arg
    const reportArg = process.argv[2];
    if (reportArg) {
        const result = connectReport(reportArg);
        if (!result.success) {
            console.error(result.error);
            console.error("Starting without a report. Use set_report tool to connect.");
        }
    }
    else {
        console.error("No report path provided. Use set_report tool to connect to a report.");
    }
    const server = new mcp_js_1.McpServer({
        name: "powerbi-report-mcp",
        version: "0.4.9",
    });
    // Determine tool loading mode
    const loadAll = (process.env.MCP_TOOLS || "").toLowerCase() === "all";
    const activeTools = new Set(loadAll ? Object.keys(ALL_TOOLS) : DEFAULT_TOOLS);
    // Store deferred tool registrations so load_tools can activate them later
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const deferredTools = new Map();
    // Auto-wrap all tool handlers with safe() and filter by active set
    const _tool = server.tool.bind(server);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    server.tool = (name, desc, schema, handler) => {
        const safeHandler = safe(handler);
        if (activeTools.has(name)) {
            _tool(name, desc, schema, safeHandler);
        }
        else {
            // Store for on-demand activation
            deferredTools.set(name, { desc, schema, handler: safeHandler });
        }
    };
    // Build shared context
    const ctx = {
        getReportPath: () => reportPath,
        connectReport,
        project,
    };
    // Register tools from modules (filtered by activeTools)
    (0, report_js_1.registerReportTools)(server, ctx);
    (0, visuals_js_1.registerVisualTools)(server, ctx);
    (0, format_js_1.registerFormatTools)(server, ctx);
    (0, bindings_js_1.registerBindingTools)(server, ctx);
    (0, themes_js_1.registerThemeTools)(server, ctx);
    (0, filters_js_1.registerFilterTools)(server, ctx);
    (0, bulk_js_1.registerBulkTools)(server, ctx);
    // registerCalculationTools(server, ctx); // PARKED
    // Meta tool: load_tools — lists available on-demand tools and activates them
    _tool("load_tools", "List available on-demand tools, or activate specific tools by name. Use without arguments to see what's available. Pass tool names to activate them for this session.", {
        tools: zod_1.z
            .array(zod_1.z.string())
            .optional()
            .describe("Tool names to activate. Omit to list available on-demand tools."),
    }, safe(async ({ tools }) => {
        if (!tools || tools.length === 0) {
            // List available on-demand tools
            const available = [...deferredTools.entries()].map(([name, { desc }]) => ({
                name,
                description: desc.slice(0, 80),
            }));
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            success: true,
                            activeCount: activeTools.size,
                            availableCount: available.length,
                            available,
                            hint: "Call load_tools with tool names to activate them.",
                        }),
                    },
                ],
            };
        }
        // Activate requested tools
        const activated = [];
        const notFound = [];
        for (const name of tools) {
            const entry = deferredTools.get(name);
            if (entry) {
                _tool(name, entry.desc, entry.schema, entry.handler);
                activeTools.add(name);
                deferredTools.delete(name);
                activated.push(name);
            }
            else if (activeTools.has(name)) {
                activated.push(`${name} (already active)`);
            }
            else {
                notFound.push(name);
            }
        }
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({ success: true, activated, notFound }),
                },
            ],
        };
    }));
    // PBIR instructions resource
    server.resource("pbir-instructions", "resource://pbir-instructions", () => ({
        contents: [
            {
                uri: "resource://pbir-instructions",
                mimeType: "text/markdown",
                text: PBIR_INSTRUCTIONS,
            },
        ],
    }));
    const transport = new stdio_js_1.StdioServerTransport();
    console.error("Power BI Report MCP Server starting...");
    console.error(`Report path: ${reportPath || "none (use set_report to connect)"}`);
    console.error(`Version: 0.4.9`);
    console.error(`Tools mode: ${loadAll ? "all" : "default"} (${activeTools.size} active, ${deferredTools.size} on-demand)`);
    console.error(loadAll ? "" : "Tip: Set MCP_TOOLS=all to load all tools at startup, or use the load_tools tool.");
    await server.connect(transport);
}
// --- PBIR instructions resource ---
const PBIR_INSTRUCTIONS = `# Power BI Report (PBIR) Format Guide

You are working with Power BI reports in the PBIR (Power BI Report) format — a folder-based JSON structure.

## Report Structure
\`\`\`
{Name}.Report/
├── definition/
│   ├── report.json          # Report settings, themes, visual styles
│   ├── version.json         # Format version
│   └── pages/
│       ├── pages.json       # Page order and active page
│       └── {pageId}/
│           ├── page.json    # Page display name, size, options
│           └── visuals/
│               └── {visualId}/
│                   └── visual.json  # Visual type, position, data bindings, filters
├── definition.pbir          # Reference to the semantic model
└── StaticResources/         # Themes and static assets
\`\`\`

## Visual Types — Power BI Naming Convention
Power BI uses non-obvious names for column/bar charts. Always use the correct visualType:

| What you want | visualType to use |
|---|---|
| Stacked column chart | columnChart |
| Clustered column chart | clusteredColumnChart |
| 100% stacked column chart | hundredPercentStackedColumnChart |
| Stacked bar chart (horizontal) | barChart |
| Clustered bar chart (horizontal) | clusteredBarChart |
| 100% stacked bar chart (horizontal) | hundredPercentStackedBarChart |

Other common types: lineChart, areaChart, stackedAreaChart, pieChart, donutChart, scatterChart,
lineClusteredColumnComboChart, lineStackedColumnComboChart, ribbonChart, waterfallChart,
pivotTable, tableEx, card, cardVisual, multiRowCard, kpi, gauge, slicer, treemap, map, filledMap,
decompositionTreeVisual, funnel, textbox, shape, image, actionButton

## Data Binding

### Bucket Names by Visual Type
- Stacked/clustered bar/column charts: Category (axis), Y (values), Series (stack/legend breakdown)
- Line/area charts: Category (axis), Y (values), Y2 (secondary axis), Series (legend)
- **Combo charts** (lineStackedColumnComboChart, lineClusteredColumnComboChart): Category, **ColumnY**, **LineY**, Series
- Tables/matrix: Rows, Columns, Values
- Cards (card, multiRowCard): Values
- cardVisual: Data
- cardNew: Fields
- Slicers: Values
- KPI: Indicator, TrendLine, Goal
- **Scatter: Details** (not Category!), X, Y, Size, Series
- Gauge: Y, MinValue, MaxValue, TargetValue
- azureMap: Category, Size
- funnelChart: Category, Y

**Series bucket** — for stacked charts (columnChart, barChart) this is the field that defines each
stack segment. Always bind a dimension column (e.g. Segment, Country) to Series to get a
proper stacked chart.

### Field Types
- **column**: Direct column reference (for axes, categories, slicers)
- **aggregation**: Aggregated column (Sum, Avg, Count, Min, Max, etc.)
- **measure**: DAX measure reference

### Table[Column] Shorthand
Instead of passing separate entity and property, you can use the shorthand notation:
\`\`\`json
{ "field": "Sales[Net Price]", "type": "measure" }
{ "field": "Date[Year]", "type": "column" }
{ "field": "financials[Gross Sales]", "type": "aggregation", "aggregation": "Sum" }
\`\`\`
Both formats are equivalent and can be mixed in the same bindings array.

## Tips
- Use auto_layout to quickly arrange visuals in a grid
- Use duplicate_visual to clone and modify existing visuals
- Visual z-order controls layering (higher z = on top)
- Use batch mode in add_visual (visuals array) to create multiple visuals in one call
`;
main().catch(console.error);

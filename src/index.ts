import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as fs from "fs";
import * as path from "path";
import { PbirProject } from "./pbir.js";
import type { ServerContext } from "./context.js";
import { registerReportTools } from "./tools/report.js";
import { registerVisualTools } from "./tools/visuals.js";
import { registerFormatTools } from "./tools/format.js";
import { registerBindingTools } from "./tools/bindings.js";
import { registerThemeTools } from "./tools/themes.js";
import { registerFilterTools } from "./tools/filters.js";
import { registerBookmarkTools } from "./tools/bookmarks.js";

// --- Discover .Report folder ---
function findReportFolder(basePath: string): string | null {
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
function safe<T extends Record<string, unknown>>(
  fn: (args: T) => Promise<unknown>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
): (args: T) => Promise<any> {
  return async (args: T) => {
    try {
      return await fn(args);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ success: false, error: msg }) }],
        isError: true,
      };
    }
  };
}

// --- Main ---
async function main() {
  let reportPath: string | null = null;
  let _project: PbirProject | null = null;

  // Proxy that auto-validates — all existing project.xxx calls work unchanged
  const project = new Proxy({} as PbirProject, {
    get(_target, prop) {
      if (!_project) {
        throw new Error(
          "No report connected. Use the set_report tool to connect to a .Report folder first."
        );
      }
      const val = (_project as unknown as Record<string | symbol, unknown>)[prop];
      return typeof val === "function" ? (val as Function).bind(_project) : val;
    },
  });

  function connectReport(targetPath: string): { success: boolean; reportPath?: string; error?: string } {
    const resolved = findReportFolder(path.resolve(targetPath));
    if (!resolved) {
      return { success: false, error: `No .Report folder found at: ${targetPath}` };
    }
    reportPath = resolved;
    _project = new PbirProject(reportPath);
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
  } else {
    console.error("No report path provided. Use set_report tool to connect to a report.");
  }

  const server = new McpServer({
    name: "powerbi-report-mcp",
    version: "0.4.0",
  });

  // Auto-wrap all tool handlers with safe() for error resilience
  const _tool = server.tool.bind(server);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server as any).tool = (name: string, desc: string, schema: unknown, handler: (args: any) => Promise<any>) =>
    _tool(name, desc, schema as Record<string, unknown>, safe(handler));

  // Build shared context
  const ctx: ServerContext = {
    getReportPath: () => reportPath,
    connectReport,
    project,
  };

  // Register tools from modules
  registerReportTools(server, ctx);
  registerVisualTools(server, ctx);
  registerFormatTools(server, ctx);
  registerBindingTools(server, ctx);
  registerThemeTools(server, ctx);
  registerFilterTools(server, ctx);
  registerBookmarkTools(server, ctx);

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

  const transport = new StdioServerTransport();
  console.error("Power BI Report MCP Server starting...");
  console.error(`Report path: ${reportPath || "none (use set_report to connect)"}`);
  console.error("Version: 0.4.0");
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

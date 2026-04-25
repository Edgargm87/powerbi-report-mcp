import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import * as fs from "fs";
import * as path from "path";
import { z } from "zod";
import { PbirProject } from "./pbir.js";
import type { ServerContext } from "./context.js";
import { registerReportTools } from "./tools/report.js";
import { registerVisualTools } from "./tools/visuals.js";
import { registerFormatTools } from "./tools/format.js";
import { registerBindingTools } from "./tools/bindings.js";
import { registerThemeTools } from "./tools/themes.js";
import { registerFilterTools } from "./tools/filters.js";
import { registerBulkTools } from "./tools/bulk.js";
import { registerModelUsageTool, findSemanticModelPath, startWatchers } from "./model-usage.js";
import { registerBookmarkTools } from "./tools/bookmarks.js";
import { registerGuideTool, buildSkillsIndexBanner } from "./tools/guide.js";
import { registerLayoutGridTool } from "./tools/layoutGrid.js";
import { registerThemeLookupTool } from "./tools/themeLookup.js";
import { DEFAULT_TOOLS } from "./default-tools.js";
// Visual calculations parked — not registering until PBI Desktop supports programmatic creation
// import { registerCalculationTools } from "./tools/calculations.js";

// --- Tool loading modes ---
// Default: load ALL tools at startup (~7,500 tokens of schemas). This matches
// reality — most MCP clients (notably Claude Desktop) snapshot the tool catalog
// at session start and don't handle `tools/list_changed`, so lazy activation via
// `load_tools` is effectively dead weight there.
//
// Set MCP_TOOLS=minimal to opt into the tiered mode (12 default tools + 42
// on-demand via load_tools). Worth it only for long Claude Code sessions where
// the ~7,500 token savings compounds against a tight context budget.
//
// The DEFAULT_TOOLS set lives in src/default-tools.ts (single source of truth
// shared with scripts/audit-skill-coverage.js).

// Names only — descriptions are set at registration sites and shipped to the LLM from there.
// Keeping a separate description map here just drifts; this list exists solely to filter
// which tools are active vs deferred via load_tools.
const ALL_TOOLS: readonly string[] = [
  // Report management
  "set_report",
  "get_report",
  "list_pages",
  "create_page",
  "rename_page",
  "delete_page",
  "reorder_pages",
  "set_active_page",
  "set_page_visibility",
  "get_report_settings",
  "update_report_settings",
  "update_page_size",
  "auto_layout",
  "duplicate_page",
  "reload_report",
  "set_filter_pane",
  "set_page_background",
  "set_visual_interaction",
  "manage_extension_measures",
  // Visuals
  "list_visuals",
  "get_visual",
  "get_visual_types",
  "add_visual",
  "delete_visual",
  "move_visual",
  "duplicate_visual",
  "change_visual_type",
  // Formatting
  "format_visual",
  "set_visual_title",
  "set_datapoint_colors",
  "set_conditional_format",
  "set_visual_sort",
  "apply_theme",
  // Themes
  "set_report_theme",
  "get_report_theme",
  "remove_report_theme",
  "diff_report_theme",
  "list_report_themes",
  "audit_theme_compliance",
  "lookup_theme_property",
  // Bindings
  "update_visual_bindings",
  // Bulk
  "bulk_bind",
  "bulk_delete_visuals",
  "bulk_update_format",
  // Filters
  "list_filters",
  "add_page_filter",
  "remove_filter",
  "clear_filters",
  // Model usage
  "model_usage",
  // Bookmarks
  "list_bookmarks",
  "add_bookmark",
  "delete_bookmark",
  "rename_bookmark",
  // Guide (knowledge layer)
  "guide",
  // Layout
  "layout_grid",
  // Calculations — PARKED: visual calculations don't render when written programmatically
];

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
  fn: (args: T) => Promise<CallToolResult>
): (args: T) => Promise<CallToolResult> {
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

    // Start model_usage watchers + initial dashboard generation (non-blocking)
    try {
      const modelPath = findSemanticModelPath(reportPath);
      startWatchers(reportPath, modelPath);
      setTimeout(() => {
        try {
          const { regenerate } = require("./model-usage.js");
          regenerate();
        } catch { /* silent */ }
      }, 100);
    } catch { /* No .SemanticModel found — skip watchers silently */ }

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
    version: "0.6.2",
  });

  // Determine tool loading mode
  // Default: all tools (matches most clients that don't refresh tool catalog).
  // Opt-in minimal mode: MCP_TOOLS=minimal (12 default tools, rest via load_tools).
  // Legacy: MCP_TOOLS=all is still accepted and behaves as default.
  const mode = (process.env.MCP_TOOLS || "").toLowerCase();
  const loadMinimal = mode === "minimal";
  const loadAll = !loadMinimal;
  const activeTools = new Set<string>(loadAll ? ALL_TOOLS : DEFAULT_TOOLS);

  // Store deferred tool registrations so load_tools can activate them later
  type ToolHandler = (args: Record<string, unknown>) => Promise<CallToolResult>;
  const deferredTools: Map<string, { desc: string; schema: unknown; handler: ToolHandler; annotations?: Record<string, unknown> }> = new Map();

  // Auto-wrap all tool handlers with safe() and filter by active set.
  // Accepts both 4-arg `(name, desc, schema, handler)` and 5-arg
  // `(name, desc, schema, annotations, handler)` — the SDK supports both
  // overloads; the 5-arg form attaches MCP tool annotations (readOnlyHint,
  // destructiveHint, idempotentHint, openWorldHint) for clients that surface
  // them.
  const _tool = server.tool.bind(server) as unknown as (
    name: string,
    desc: string,
    schema: Record<string, unknown>,
    annotationsOrHandler: unknown,
    handler?: ToolHandler
  ) => void;
  type WrappedTool = (
    name: string,
    desc: string,
    schema: unknown,
    annotationsOrHandler: unknown,
    handler?: ToolHandler
  ) => void;
  (server as unknown as { tool: WrappedTool }).tool = (name, desc, schema, annotationsOrHandler, handler) => {
    const hasAnnotations = typeof annotationsOrHandler === "object" && annotationsOrHandler !== null;
    const realHandler = (hasAnnotations ? handler! : (annotationsOrHandler as ToolHandler));
    const annotations = hasAnnotations ? (annotationsOrHandler as Record<string, unknown>) : undefined;
    const safeHandler = safe(realHandler);
    if (activeTools.has(name)) {
      if (annotations) {
        _tool(name, desc, schema as Record<string, unknown>, annotations, safeHandler);
      } else {
        _tool(name, desc, schema as Record<string, unknown>, safeHandler);
      }
    } else {
      // Store for on-demand activation. Annotations are passed when the
      // deferred tool is later activated via load_tools.
      deferredTools.set(name, { desc, schema, handler: safeHandler, annotations });
    }
  };

  // Build shared context
  const ctx: ServerContext = {
    getReportPath: () => reportPath,
    connectReport,
    project,
  };

  // Register tools from modules (filtered by activeTools)
  registerReportTools(server, ctx);
  registerVisualTools(server, ctx);
  registerFormatTools(server, ctx);
  registerBindingTools(server, ctx);
  registerThemeTools(server, ctx);
  registerFilterTools(server, ctx);
  registerBulkTools(server, ctx);
  registerBookmarkTools(server, ctx);
  registerGuideTool(server, ctx);
  registerLayoutGridTool(server, ctx);
  registerThemeLookupTool(server);
  registerModelUsageTool(server, ctx);
  // registerCalculationTools(server, ctx); // PARKED

  // Meta tool: load_tools — lists available on-demand tools and activates them
  _tool(
    "load_tools",
    "List on-demand tools (no args) or activate by name (pass `tools` array).",
    {
      tools: z
        .array(z.string())
        .optional()
        .describe("Tool names to activate. Omit to list available on-demand tools."),
    },
    { openWorldHint: false } as Record<string, unknown>,
    safe(async ({ tools }: { tools?: string[] }) => {
      if (!tools || tools.length === 0) {
        // List available on-demand tools
        const available = [...deferredTools.entries()].map(([name, { desc }]) => ({
          name,
          description: desc.slice(0, 80),
        }));
        return {
          content: [
            {
              type: "text" as const,
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
      const activated: string[] = [];
      const notFound: string[] = [];
      for (const name of tools) {
        const entry = deferredTools.get(name);
        if (entry) {
          if (entry.annotations) {
            _tool(name, entry.desc, entry.schema as Record<string, unknown>, entry.annotations, entry.handler);
          } else {
            _tool(name, entry.desc, entry.schema as Record<string, unknown>, entry.handler);
          }
          activeTools.add(name);
          deferredTools.delete(name);
          activated.push(name);
          console.error(`[load_tools] Activated: ${name}`);
        } else if (activeTools.has(name)) {
          activated.push(`${name} (already active)`);
        } else {
          notFound.push(name);
        }
      }
      console.error(`[load_tools] ${activated.length} activated, ${deferredTools.size} remaining on-demand`);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              activated,
              notFound,
              refreshHint: "A tools/list_changed notification was sent. If the activated tools don't appear, your MCP client may not support dynamic tool refresh — set MCP_TOOLS=all in the server config to load all tools at startup instead.",
            }),
          },
        ],
      };
    })
  );

  // PBIR instructions resource — base guide + live skills index banner
  // (banner lists every skill with a summary and inlines wireframes/report-design).
  server.resource("pbir-instructions", "resource://pbir-instructions", () => ({
    contents: [
      {
        uri: "resource://pbir-instructions",
        mimeType: "text/markdown",
        text: `${PBIR_INSTRUCTIONS}\n\n${buildSkillsIndexBanner()}`,
      },
    ],
  }));

  const transport = new StdioServerTransport();
  console.error("Power BI Report MCP Server starting...");
  console.error(`Report path: ${reportPath || "none (use set_report to connect)"}`);
  console.error(`Version: 0.6.2`);
  console.error(`Tools mode: ${loadAll ? "all" : "minimal"} (${activeTools.size} active, ${deferredTools.size} on-demand)`);
  console.error(loadAll ? "Tip: Set MCP_TOOLS=minimal to load only the 12 core tools (saves ~7,500 tokens; use load_tools to activate the rest on demand)." : "Tip: unset MCP_TOOLS or set it to 'all' to load every tool at startup.");
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
│   ├── pages/
│   │   ├── pages.json       # Page order and active page
│   │   └── {pageId}/
│   │       ├── page.json    # Page display name, size, options
│   │       └── visuals/
│   │           └── {visualId}/
│   │               └── visual.json  # Visual type, position, data bindings, filters
│   └── reportExtensions.json # Extension measures (report-level DAX) — DELETE if empty
├── CustomVisuals/           # Private custom visuals (optional)
├── definition.pbir          # Reference to the semantic model (byPath for local PBIP, byConnection for remote/thin report)
└── StaticResources/         # Themes and static assets
\`\`\`

**definition.pbir** has two connection variants:
- \`byPath\` — local PBIP project, references a relative path like \`../MyModel.SemanticModel\`
- \`byConnection\` — remote/thin report with a connection string to a published dataset

## Knowledge layer — call \`guide(topic)\`
For visualType names, bucket bindings, canvas/layout rules, and formatting gotchas, call
\`guide(topic)\` — topics are discovered live from skills/*.md (wireframes, visuals, slicers,
formatting, themes, themes-per-visual, shapes, filters, svg-visuals, calculations, pages,
report-design, report, elicitation, token-usage). Start with \`guide("wireframes")\` when
building a fresh page; canvas constants and layout formulas live there.

## Unsupported / non-obvious surface
- **Visual interactions** — \`set_visual_interaction\` for cross-filter/cross-highlight (\`visualInteractions\` in page.json).
- **Sort definitions** — \`sortDefinition\` in visual query controls default sort order. Not exposed as a tool.
- **Extension measures** — \`manage_extension_measures\` for report-level DAX (\`reportExtensions.json\`). WARNING: file auto-deletes when empty; empty \`entities: []\` crashes PBI Desktop.
- **Bookmarks** — \`list_bookmarks\`, \`add_bookmark\`, \`delete_bookmark\`, \`rename_bookmark\`.
- **Filter pane visibility** — \`set_filter_pane\` (\`objects.outspacePane\` in report.json).

## Tips
- Batch \`add_visual\` via the \`visuals\` array to create multiple visuals in one call.
- When building a fresh page from scratch, prefer \`layout_grid\` with \`planOnly:true\` over guessing pixel coords. The server computes exact x/y/w/h per cell (remainder distributed), so the layout is guaranteed to pass strict validation.
- \`duplicate_visual\` clones and is often faster than re-specifying a near-duplicate.
`;

main().catch(console.error);

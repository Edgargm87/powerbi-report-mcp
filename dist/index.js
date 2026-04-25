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
const model_usage_js_1 = require("./model-usage.js");
const bookmarks_js_1 = require("./tools/bookmarks.js");
const guide_js_1 = require("./tools/guide.js");
const layoutGrid_js_1 = require("./tools/layoutGrid.js");
const themeLookup_js_1 = require("./tools/themeLookup.js");
const default_tools_js_1 = require("./default-tools.js");
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
const ALL_TOOLS = [
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
function safe(fn) {
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
        // Start model_usage watchers + initial dashboard generation (non-blocking)
        try {
            const modelPath = (0, model_usage_js_1.findSemanticModelPath)(reportPath);
            (0, model_usage_js_1.startWatchers)(reportPath, modelPath);
            setTimeout(() => {
                try {
                    const { regenerate } = require("./model-usage.js");
                    regenerate();
                }
                catch { /* silent */ }
            }, 100);
        }
        catch { /* No .SemanticModel found — skip watchers silently */ }
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
        version: "0.6.2",
    });
    // Determine tool loading mode
    // Default: all tools (matches most clients that don't refresh tool catalog).
    // Opt-in minimal mode: MCP_TOOLS=minimal (12 default tools, rest via load_tools).
    // Legacy: MCP_TOOLS=all is still accepted and behaves as default.
    const mode = (process.env.MCP_TOOLS || "").toLowerCase();
    const loadMinimal = mode === "minimal";
    const loadAll = !loadMinimal;
    const activeTools = new Set(loadAll ? ALL_TOOLS : default_tools_js_1.DEFAULT_TOOLS);
    const deferredTools = new Map();
    // Auto-wrap all tool handlers with safe() and filter by active set.
    // Accepts both 4-arg `(name, desc, schema, handler)` and 5-arg
    // `(name, desc, schema, annotations, handler)` — the SDK supports both
    // overloads; the 5-arg form attaches MCP tool annotations (readOnlyHint,
    // destructiveHint, idempotentHint, openWorldHint) for clients that surface
    // them.
    const _tool = server.tool.bind(server);
    server.tool = (name, desc, schema, annotationsOrHandler, handler) => {
        const hasAnnotations = typeof annotationsOrHandler === "object" && annotationsOrHandler !== null;
        const realHandler = (hasAnnotations ? handler : annotationsOrHandler);
        const annotations = hasAnnotations ? annotationsOrHandler : undefined;
        const safeHandler = safe(realHandler);
        if (activeTools.has(name)) {
            if (annotations) {
                _tool(name, desc, schema, annotations, safeHandler);
            }
            else {
                _tool(name, desc, schema, safeHandler);
            }
        }
        else {
            // Store for on-demand activation. Annotations are passed when the
            // deferred tool is later activated via load_tools.
            deferredTools.set(name, { desc, schema, handler: safeHandler, annotations });
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
    (0, bookmarks_js_1.registerBookmarkTools)(server, ctx);
    (0, guide_js_1.registerGuideTool)(server, ctx);
    (0, layoutGrid_js_1.registerLayoutGridTool)(server, ctx);
    (0, themeLookup_js_1.registerThemeLookupTool)(server);
    (0, model_usage_js_1.registerModelUsageTool)(server, ctx);
    // registerCalculationTools(server, ctx); // PARKED
    // Meta tool: load_tools — lists available on-demand tools and activates them
    _tool("load_tools", "List on-demand tools (no args) or activate by name (pass `tools` array).", {
        tools: zod_1.z
            .array(zod_1.z.string())
            .optional()
            .describe("Tool names to activate. Omit to list available on-demand tools."),
    }, { openWorldHint: false }, safe(async ({ tools }) => {
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
                if (entry.annotations) {
                    _tool(name, entry.desc, entry.schema, entry.annotations, entry.handler);
                }
                else {
                    _tool(name, entry.desc, entry.schema, entry.handler);
                }
                activeTools.add(name);
                deferredTools.delete(name);
                activated.push(name);
                console.error(`[load_tools] Activated: ${name}`);
            }
            else if (activeTools.has(name)) {
                activated.push(`${name} (already active)`);
            }
            else {
                notFound.push(name);
            }
        }
        console.error(`[load_tools] ${activated.length} activated, ${deferredTools.size} remaining on-demand`);
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({
                        success: true,
                        activated,
                        notFound,
                        refreshHint: "A tools/list_changed notification was sent. If the activated tools don't appear, your MCP client may not support dynamic tool refresh — set MCP_TOOLS=all in the server config to load all tools at startup instead.",
                    }),
                },
            ],
        };
    }));
    // PBIR instructions resource — read live from skills/_overview.md so prose
    // edits don't require a TypeScript rebuild. The leading underscore marks it
    // as meta (sorts to top in dir listings, hidden from guide() topic list).
    server.resource("pbir-instructions", "resource://pbir-instructions", () => {
        // dist/index.js → projectRoot is one level up; src/index.ts under ts-node also.
        // (guide.ts uses two levels because it's in dist/tools/.)
        const skillsDir = path.join(__dirname, "..", "skills");
        const overviewPath = path.join(skillsDir, "_overview.md");
        let overview = "";
        try {
            overview = fs.readFileSync(overviewPath, "utf8");
        }
        catch (err) {
            console.error("[pbir-instructions] failed to read _overview.md", err);
            overview = "(skills/_overview.md not found)";
        }
        return {
            contents: [
                {
                    uri: "resource://pbir-instructions",
                    mimeType: "text/markdown",
                    text: `${overview}\n\n${(0, guide_js_1.buildSkillsIndexBanner)()}`,
                },
            ],
        };
    });
    const transport = new stdio_js_1.StdioServerTransport();
    console.error("Power BI Report MCP Server starting...");
    console.error(`Report path: ${reportPath || "none (use set_report to connect)"}`);
    console.error(`Version: 0.6.2`);
    console.error(`Tools mode: ${loadAll ? "all" : "minimal"} (${activeTools.size} active, ${deferredTools.size} on-demand)`);
    console.error(loadAll ? "Tip: Set MCP_TOOLS=minimal to load only the 12 core tools (saves ~7,500 tokens; use load_tools to activate the rest on demand)." : "Tip: unset MCP_TOOLS or set it to 'all' to load every tool at startup.");
    await server.connect(transport);
}
// PBIR instructions live in skills/_overview.md and are read live by the
// `pbir-instructions` resource handler above. Editing the prose no longer
// requires a TypeScript rebuild.
main().catch(console.error);

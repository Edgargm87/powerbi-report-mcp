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
import { READ_TOOL_SCHEMAS } from "./helpers/outputSchemas.js";
// Visual calculations parked — not registering until PBI Desktop supports programmatic creation
// import { registerCalculationTools } from "./tools/calculations.js";

// --- Tool loading modes ---
// Default: load ALL tools at startup (~7,500 tokens of schemas). This matches
// reality — most MCP clients (notably Claude Desktop) snapshot the tool catalog
// at session start and don't handle `tools/list_changed`, so lazy activation via
// `pbir_load_tools` is effectively dead weight there.
//
// Set MCP_TOOLS=minimal to opt into the tiered mode (12 default tools + 42
// on-demand via pbir_load_tools). Worth it only for long Claude Code sessions where
// the ~7,500 token savings compounds against a tight context budget.
//
// The DEFAULT_TOOLS set lives in src/default-tools.ts (single source of truth
// shared with scripts/audit-skill-coverage.js).

// Names only — descriptions are set at registration sites and shipped to the LLM from there.
// Keeping a separate description map here just drifts; this list exists solely to filter
// which tools are active vs deferred via pbir_load_tools.
const ALL_TOOLS: readonly string[] = [
  // Report management
  "pbir_set_report",
  "pbir_get_report",
  "pbir_list_pages",
  "pbir_create_page",
  "pbir_rename_page",
  "pbir_delete_page",
  "pbir_reorder_pages",
  "pbir_set_active_page",
  "pbir_set_page_visibility",
  "pbir_get_report_settings",
  "pbir_update_report_settings",
  "pbir_update_page_size",
  "pbir_auto_layout",
  "pbir_duplicate_page",
  "pbir_reload_report",
  "pbir_set_filter_pane",
  "pbir_set_page_background",
  "pbir_set_visual_interaction",
  "pbir_manage_extension_measures",
  // Visuals
  "pbir_list_visuals",
  "pbir_get_visual",
  "pbir_get_visual_types",
  "pbir_add_visual",
  "pbir_delete_visual",
  "pbir_move_visual",
  "pbir_duplicate_visual",
  "pbir_change_visual_type",
  // Formatting
  "pbir_format_visual",
  "pbir_set_visual_title",
  "pbir_set_datapoint_colors",
  "pbir_set_conditional_format",
  "pbir_set_visual_sort",
  "pbir_apply_theme",
  // Themes
  "pbir_set_report_theme",
  "pbir_get_report_theme",
  "pbir_remove_report_theme",
  "pbir_diff_report_theme",
  "pbir_list_report_themes",
  "pbir_audit_theme_compliance",
  "pbir_lookup_theme_property",
  // Bindings
  "pbir_update_visual_bindings",
  // Bulk
  "pbir_bulk_bind",
  "pbir_bulk_delete_visuals",
  "pbir_bulk_update_format",
  // Filters
  "pbir_list_filters",
  "pbir_add_page_filter",
  "pbir_remove_filter",
  "pbir_clear_filters",
  // Model usage
  "pbir_model_usage",
  // Bookmarks
  "pbir_list_bookmarks",
  "pbir_add_bookmark",
  "pbir_delete_bookmark",
  "pbir_rename_bookmark",
  // Guide (knowledge layer)
  "pbir_guide",
  // Layout
  "pbir_layout_grid",
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

// --- Tool handler wrapper — returns isError response instead of crashing,
// and back-fills `structuredContent` for any handler that returned a legacy
// content-only envelope. This guarantees the dual-emit contract from
// helpers/mcpResult.ts holds across every tool, including the 100+ inline
// `content: [{...}]` returns scattered across the tool modules.
function safe<T extends Record<string, unknown>>(
  fn: (args: T) => Promise<CallToolResult>
): (args: T) => Promise<CallToolResult> {
  return async (args: T) => {
    let result: CallToolResult;
    try {
      result = await fn(args);
    } catch (err) {
      // Log full error (stack + cause) to stderr for local debugging.
      // The client-facing payload stays clean — just `err.message`.
      console.error("[tool error]", err);
      const msg = err instanceof Error ? err.message : String(err);
      const body = { success: false, error: msg };
      return {
        content: [{ type: "text" as const, text: JSON.stringify(body) }],
        structuredContent: body,
        isError: true,
      } as CallToolResult;
    }
    return ensureStructured(result);
  };
}

/**
 * Back-fill `structuredContent` from `content[0].text` when the underlying
 * handler returned a JSON-stringified text envelope but not the modern
 * structured form. Leaves raw-text payloads (non-JSON) alone — those are
 * intentional (pbir_model_usage HTML, pbir_get_visual full PBIR dump).
 */
function ensureStructured(result: CallToolResult): CallToolResult {
  if (!result || typeof result !== "object") return result;
  if ((result as { structuredContent?: unknown }).structuredContent) return result;
  const content = (result as { content?: unknown[] }).content;
  if (!Array.isArray(content) || content.length === 0) return result;
  const first = content[0] as { type?: string; text?: string } | undefined;
  if (!first || first.type !== "text" || typeof first.text !== "string") return result;
  const text = first.text.trim();
  if (!text || (text[0] !== "{" && text[0] !== "[")) return result;
  try {
    const parsed = JSON.parse(first.text);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      (result as { structuredContent?: unknown }).structuredContent = parsed;
    }
  } catch {
    // Not JSON — leave as-is.
  }
  return result;
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
          "No report connected. Use the pbir_set_report tool to connect to a .Report folder first."
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

    // Start pbir_model_usage watchers + initial dashboard generation (non-blocking)
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

  // Connect to initial report if provided as CLI arg, or via PBIR_REPORT_PATH
  // env var (headless / eval mode). CLI arg wins when both are set.
  const reportArg = process.argv[2] ?? process.env.PBIR_REPORT_PATH;
  if (reportArg) {
    const source = process.argv[2] ? "argv" : "PBIR_REPORT_PATH";
    const result = connectReport(reportArg);
    if (!result.success) {
      console.error(`[${source}] ${result.error}`);
      console.error("Starting without a report. Use pbir_set_report tool to connect.");
    }
  } else {
    console.error("No report path provided. Use pbir_set_report tool to connect to a report.");
  }

  const server = new McpServer({
    name: "powerbi-report-mcp",
    version: "0.9.5",
  });

  // Determine tool loading mode
  // Default: all tools (matches most clients that don't refresh tool catalog).
  // Opt-in minimal mode: MCP_TOOLS=minimal (12 default tools, rest via pbir_load_tools).
  // Legacy: MCP_TOOLS=all is still accepted and behaves as default.
  const mode = (process.env.MCP_TOOLS || "").toLowerCase();
  const loadMinimal = mode === "minimal";
  const loadAll = !loadMinimal;
  const activeTools = new Set<string>(loadAll ? ALL_TOOLS : DEFAULT_TOOLS);

  // Store deferred tool registrations so pbir_load_tools can activate them later
  type ToolHandler = (args: Record<string, unknown>) => Promise<CallToolResult>;
  const deferredTools: Map<string, { desc: string; schema: unknown; handler: ToolHandler; annotations?: Record<string, unknown> }> = new Map();

  // Mutation tools and verbose-dump reads opt OUT of structured-output
  // validation by registering with no outputSchema at all.
  //
  // History: v0.8.0 → v0.9.0 shipped a flat `{success, error?}` ZodRawShape
  // here as a generic fallback. The MCP SDK serialises a flat ZodRawShape
  // into a strict JSON Schema with `additionalProperties: false`, which
  // rejected every handler that returned extra fields (e.g. pbir_set_report's
  // `{success, reportPath}`) with -32602 in strict clients (Claude Code).
  // The bind side-effect never committed because the protocol error fired
  // before the response was delivered.
  //
  // A "loose" generic schema is impossible at the ZodRawShape layer — the
  // SDK always closes the top-level object. Per-tool schemas in
  // helpers/outputSchemas.ts work because they're handcrafted and only cover
  // read tools where the response shape is known. For everything else, the
  // honest answer is "no declared output schema" — clients still receive
  // structuredContent, they just don't validate it. Read tools that DO
  // declare a schema continue to validate against the tightened shape.
  const GENERIC_OUTPUT_SCHEMA: undefined = undefined;

  // snake_case tool name → human Title Case for the registerTool `title`
  // field, e.g. pbir_list_pages → "List Pages", pbir_set_report → "Set Report".
  // Uses a small acronym map so common acronyms render correctly.
  const ACRONYMS = new Set(["dax", "id", "url", "svg", "html", "json", "kpi"]);
  function humanTitle(name: string): string {
    const stripped = name.replace(/^pbir_/, "");
    return stripped.split("_").map((w) => {
      if (!w) return w;
      if (ACRONYMS.has(w.toLowerCase())) return w.toUpperCase();
      return w[0].toUpperCase() + w.slice(1);
    }).join(" ");
  }

  // Modern entrypoint — server.registerTool({title, description, inputSchema,
  // outputSchema, annotations}, handler). This replaces the deprecated
  // 4/5-arg server.tool() form and is required for outputSchema support.
  const registerToolRaw = server.registerTool.bind(server) as unknown as (
    name: string,
    config: {
      title?: string;
      description?: string;
      inputSchema?: Record<string, unknown>;
      outputSchema?: Record<string, unknown>;
      annotations?: Record<string, unknown>;
    },
    cb: ToolHandler
  ) => void;

  function doRegister(name: string, desc: string, schema: unknown, annotations: Record<string, unknown> | undefined, handler: ToolHandler) {
    // Per-tool tightened outputSchema overrides the generic envelope when
    // present (read tools where the response shape is well-known). Mutation
    // tools and verbose-dump tools fall back to GENERIC_OUTPUT_SCHEMA.
    const tightened = READ_TOOL_SCHEMAS[name];
    const outputSchema = (tightened ?? GENERIC_OUTPUT_SCHEMA) as unknown as Record<string, unknown> | undefined;
    registerToolRaw(name, {
      title: humanTitle(name),
      description: desc,
      inputSchema: (schema as Record<string, unknown>) || undefined,
      outputSchema,
      annotations,
    }, handler);
  }

  // Back-compat shim — every tool module still calls server.tool(name, desc,
  // schema, [annotations,] handler). Route those calls through registerTool
  // under the hood and apply safe()/active-set filtering as before.
  type WrappedTool = (
    name: string,
    desc: string,
    schema: unknown,
    annotationsOrHandler: unknown,
    handler?: ToolHandler
  ) => void;
  const _tool: WrappedTool = (name, desc, schema, annotationsOrHandler, handler) => {
    const hasAnnotations = typeof annotationsOrHandler === "object" && annotationsOrHandler !== null;
    const realHandler = (hasAnnotations ? handler! : (annotationsOrHandler as ToolHandler));
    const annotations = hasAnnotations ? (annotationsOrHandler as Record<string, unknown>) : undefined;
    const safeHandler = safe(realHandler);
    if (activeTools.has(name)) {
      doRegister(name, desc, schema, annotations, safeHandler);
    } else {
      // Store for on-demand activation. Annotations are passed when the
      // deferred tool is later activated via pbir_load_tools.
      deferredTools.set(name, { desc, schema, handler: safeHandler, annotations });
    }
  };
  (server as unknown as { tool: WrappedTool }).tool = _tool;

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

  // Meta tool: pbir_load_tools — lists available on-demand tools and activates
  // them. Pre-register in the active set so the shim's gating accepts it; the
  // shim turns this into a server.registerTool call under the hood.
  activeTools.add("pbir_load_tools");
  _tool(
    "pbir_load_tools",
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
                hint: "Call pbir_load_tools with tool names to activate them.",
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
          // Handler is already safe()-wrapped from the deferred entry.
          doRegister(name, entry.desc, entry.schema, entry.annotations, entry.handler);
          activeTools.add(name);
          deferredTools.delete(name);
          activated.push(name);
          console.error(`[pbir_load_tools] Activated: ${name}`);
        } else if (activeTools.has(name)) {
          activated.push(`${name} (already active)`);
        } else {
          notFound.push(name);
        }
      }
      console.error(`[pbir_load_tools] ${activated.length} activated, ${deferredTools.size} remaining on-demand`);
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

  // PBIR instructions resource — read live from skills/_overview.md so prose
  // edits don't require a TypeScript rebuild. The leading underscore marks it
  // as meta (sorts to top in dir listings, hidden from guide() topic list).
  const skillsDir = path.join(__dirname, "..", "skills");
  server.resource("pbir-instructions", "resource://pbir-instructions", () => {
    // dist/index.js → projectRoot is one level up; src/index.ts under ts-node also.
    // (guide.ts uses two levels because it's in dist/tools/.)
    const overviewPath = path.join(skillsDir, "_overview.md");
    let overview = "";
    try {
      overview = fs.readFileSync(overviewPath, "utf8");
    } catch (err) {
      console.error("[pbir-instructions] failed to read _overview.md", err);
      overview = "(skills/_overview.md not found)";
    }
    return {
      contents: [
        {
          uri: "resource://pbir-instructions",
          mimeType: "text/markdown",
          text: `${overview}\n\n${buildSkillsIndexBanner()}`,
        },
      ],
    };
  });

  // Per-skill resources — one resource://pbir-skill/{topic} per non-underscore
  // file in skills/. Lets resource-aware clients (Claude Desktop @-picker,
  // Cowork) surface individual skills natively without going through
  // pbir_guide(topic). Read live from disk on every request so prose edits
  // don't require a server restart.
  try {
    const skillFiles = fs
      .readdirSync(skillsDir)
      .filter((f) => f.endsWith(".md") && !f.startsWith("_"));
    for (const filename of skillFiles) {
      const topic = filename.replace(/\.md$/, "");
      const uri = `resource://pbir-skill/${topic}`;
      server.resource(`pbir-skill-${topic}`, uri, () => {
        const filePath = path.join(skillsDir, filename);
        let body = "";
        try {
          body = fs.readFileSync(filePath, "utf8");
        } catch (err) {
          console.error(`[pbir-skill/${topic}] failed to read ${filename}`, err);
          body = `(skills/${filename} not readable)`;
        }
        return {
          contents: [
            { uri, mimeType: "text/markdown", text: body },
          ],
        };
      });
    }
    console.error(`Registered ${skillFiles.length} per-skill resources under resource://pbir-skill/{topic}`);
  } catch (err) {
    console.error("[pbir-skill] failed to enumerate skills/ — per-skill resources not registered", err);
  }

  const transport = new StdioServerTransport();
  console.error("Power BI Report MCP Server starting...");
  console.error(`Report path: ${reportPath || "none (use pbir_set_report to connect)"}`);
  console.error(`Version: 0.9.5`);
  console.error(`Tools mode: ${loadAll ? "all" : "minimal"} (${activeTools.size} active, ${deferredTools.size} on-demand)`);
  console.error(loadAll ? "Tip: Set MCP_TOOLS=minimal to load only the 12 core tools (saves ~7,500 tokens; use pbir_load_tools to activate the rest on demand)." : "Tip: unset MCP_TOOLS or set it to 'all' to load every tool at startup.");
  await server.connect(transport);
}

// PBIR instructions live in skills/_overview.md and are read live by the
// `pbir-instructions` resource handler above. Editing the prose no longer
// requires a TypeScript rebuild.

main().catch(console.error);

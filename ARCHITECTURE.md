<!-- doc-version: 1.2 | Last updated: 2026-04-12 -->
# Architecture: powerbi-report-mcp

## 1. Overview

`powerbi-report-mcp` is an MCP (Model Context Protocol) server that enables AI agents to create and modify Power BI reports in PBIR format. It communicates over **stdio** using the `@modelcontextprotocol/sdk`, making it agent-agnostic -- any MCP-compatible client (Claude Code, Copilot, custom agents) can drive it.

The server exposes 54 tools for page management, visual creation, data binding, formatting, theming, filtering, bulk operations, and model usage analysis. All tool inputs are validated with Zod schemas. All tool handlers are wrapped in a `safe()` error boundary so that failures return structured `isError` responses instead of crashing the process.

**Key dependencies:** `@modelcontextprotocol/sdk` (MCP protocol), `zod` (schema validation). No Power BI SDK is used -- the server reads and writes PBIR JSON files directly on disk.

---

## 2. Folder Structure

```
src/
  index.ts              Main entry point. Creates the MCP server, wires up tool
                        registration, smart tool loading, the safe() wrapper,
                        report discovery, and the PBIR instructions resource.

  context.ts            ServerContext interface -- the shared dependency bag passed
                        to every tool module (report path, connectReport, project proxy).

  pbir.ts               PbirProject class (file I/O abstraction), TypeScript types
                        for PBIR JSON structures, field reference builders,
                        aggregation mapping, and visual bucket definitions.

  model-usage.ts        Model usage analysis. Cross-references the semantic model
                        (TMDL or BIM) with the report (visual.json bindings) to
                        determine where every measure and column is used.
                        Exports: buildFullData(), generateHTML(), registerModelUsageTool(),
                        findSemanticModelPath(), invalidateCache(), startWatchers().

  usage-cli.ts          Standalone CLI entry point for model usage.
                        One-shot mode: generates HTML dashboard and opens in browser.
                        Watch mode (--watch): generates + HTTP server + fs.watch with
                        auto-regeneration on file changes.

  helpers/
    createVisual.ts     Visual creation logic: parseFieldSpec(), createAndSaveVisual(),
                        Zod schemas (FieldSpecSchema, VisualSpecSchema, etc.),
                        visual-type-specific object builders (slicer, shape, textbox,
                        image, actionButton).

    formatting.ts       buildFormattingProps() -- converts key-value pairs to PBIR
                        literal format. applyFormattingToTarget() -- merges formatting
                        into objects/visualContainerObjects. applyDataColors() --
                        sets data point colors with metadata or data selectors.

    defaults.ts         THEME_PRESETS -- named theme configurations (dark, light,
                        corporate, blue-purple) with container formatting, slicer
                        overrides, and data color palettes.

  tools/
    report.ts           Page and report management tools (19 tools).
    visuals.ts          Visual CRUD tools (8 tools).
    format.ts           Formatting and conditional formatting tools (4 tools).
    bindings.ts         Data binding tools (1 tool).
    themes.ts           Report-level theme tools (5 tools).
    filters.ts          Filter tools (4 tools).
    bulk.ts             Bulk operations (3 tools).
    bookmarks.ts        Bookmark CRUD (4 tools).
    guide.ts            Knowledge layer (1 tool). Serves domain knowledge
                        on demand — topics: svg-visuals, report-design.
    calculations.ts     Visual calculations (3 tools, parked -- PBI Desktop
                        doesn't render programmatically-created visual calcs).
```

---

## 3. PBIR Format

Power BI PBIR (Power BI Report) is a folder-based JSON format. Each entity -- report, page, visual -- lives in its own directory with a JSON definition file:

```
{Name}.Report/
  definition/
    report.json              Report settings, theme references, visual styles
    version.json             Format version metadata
    pages/
      pages.json             Page ordering and active page pointer
      {pageId}/
        page.json            Page display name, dimensions, visibility
        visuals/
          {visualId}/
            visual.json      Visual type, position, query state, formatting,
                             filters, objects, container objects
  definition.pbir            Semantic model reference
  StaticResources/
    RegisteredResources/
      {themeName}.json       Custom theme JSON files
```

**IDs** are 20-character hex strings generated via `crypto.randomBytes(10)`.

A `visual.json` file contains:
- `position` -- x, y, z, width, height, tabOrder
- `visual.visualType` -- the Power BI visual type string (e.g. `columnChart`, `barChart`)
- `visual.query.queryState` -- data bindings organized by bucket (Category, Y, Series, etc.)
- `visual.objects` -- visual-level formatting (axes, legend, labels, data points)
- `visual.visualContainerObjects` -- container-level formatting (title, background, border)
- `filterConfig.filters` -- array of visual-scoped filters

Pages have a similar structure with `filterConfig` for page-level filters.

---

## 4. Core Abstraction: PbirProject

`PbirProject` (in `src/pbir.ts`) wraps all file system operations behind a typed API. It takes a `.Report` folder path and provides:

**Path helpers** -- computed properties and methods that build file paths:

```ts
project.reportJsonPath      // .Report/definition/report.json
project.pagesJsonPath       // .Report/definition/pages/pages.json
project.pageJsonPath(id)    // .Report/definition/pages/{id}/page.json
project.visualJsonPath(p,v) // .Report/definition/pages/{p}/visuals/{v}/visual.json
```

**Read operations:**

```ts
project.getReport()              // ReportDefinition
project.getPagesMetadata()       // PagesMetadata (page order, active page)
project.getPage(pageId)          // PageDefinition
project.getVisual(pageId, vId)   // VisualDefinition
project.listPageIds()            // string[] from pages.json pageOrder
project.listVisualIds(pageId)    // string[] from directory listing
```

**Write operations:**

```ts
project.saveReport(report)
project.savePagesMetadata(meta)
project.savePage(pageId, page)
project.saveVisual(pageId, visualId, visual)
project.deletePage(pageId)       // rm -rf the page directory
project.deleteVisual(pageId, vId)
```

**Theme/resource helpers:**

```ts
project.saveRegisteredResource(filename, data)  // StaticResources/RegisteredResources/
project.readRegisteredResource(filename)
project.listRegisteredResources()
project.deleteRegisteredResource(filename)
```

The class also includes bookmark helpers (`getBookmarksMetadata`, `saveBookmark`, etc.).

**Lazy initialization via Proxy:** In `index.ts`, the actual `PbirProject` instance is wrapped in a `Proxy`. Any property access on the proxy checks whether a report has been connected. If not, it throws a clear error directing the user to call `pbir_set_report` first. This means tool handlers can use `ctx.project.getPage(...)` without null checks -- the proxy handles it.

---

## 5. Tool Registration

### Registration Pattern

Each tool module exports a `register*Tools(server, ctx)` function that calls `server.tool()` for each tool it provides:

```ts
server.tool(
  "tool_name",           // unique tool identifier
  "Description...",      // shown to the LLM
  { /* Zod schema */ },  // input validation
  async (args) => { ... } // handler
);
```

### The safe() Wrapper

Every tool handler is automatically wrapped with `safe()` before registration. The `server.tool` method is monkey-patched in `index.ts` to intercept all registrations:

```ts
(server as any).tool = (name, desc, schema, handler) => {
  const safeHandler = safe(handler);
  if (activeTools.has(name)) {
    _tool(name, desc, schema, safeHandler);
  } else {
    deferredTools.set(name, { desc, schema, handler: safeHandler });
  }
};
```

`safe()` catches any exception thrown by the handler and returns a structured error response:

```ts
function safe<T>(fn: (args: T) => Promise<unknown>) {
  return async (args: T) => {
    try {
      return await fn(args);
    } catch (err) {
      return {
        content: [{ type: "text", text: JSON.stringify({ success: false, error: msg }) }],
        isError: true,
      };
    }
  };
}
```

### Smart Tool Loading

To reduce token overhead for LLM clients, the server loads only a default subset of 11 tools at startup. The remaining tools are stored in `deferredTools` and can be activated on demand.

**DEFAULT_TOOLS** (always loaded):
`pbir_set_report`, `pbir_list_pages`, `pbir_list_visuals`, `pbir_create_page`, `pbir_add_visual`, `pbir_get_visual`, `pbir_format_visual`, `pbir_update_visual_bindings`, `pbir_set_report_theme`, `pbir_bulk_bind`, `pbir_model_usage`

**ALL_TOOLS** -- a map of every tool name to its description (54 tools total).

**Activation mechanisms:**

1. **`pbir_load_tools` meta-tool** -- always registered (bypasses the filter). Called with no arguments, it lists available on-demand tools. Called with tool names, it activates them by moving entries from `deferredTools` into the live server:

   ```ts
   _tool(name, entry.desc, entry.schema, entry.handler);
   activeTools.add(name);
   deferredTools.delete(name);
   ```

2. **`MCP_TOOLS=all` environment variable** -- when set, all tools load at startup. The check:

   ```ts
   const loadAll = (process.env.MCP_TOOLS || "").toLowerCase() === "all";
   const activeTools = new Set(loadAll ? Object.keys(ALL_TOOLS) : DEFAULT_TOOLS);
   ```

---

## 6. Tool Modules

### report.ts (19 tools)

| Tool | Purpose |
|------|---------|
| `pbir_set_report` | Connect to a `.Report` folder (or parent `.pbip` directory) |
| `pbir_get_report` | Show the currently connected report path |
| `pbir_list_pages` | List pages with slim/full mode |
| `pbir_create_page` | Create a new page with name, dimensions, display option |
| `pbir_rename_page` | Rename an existing page |
| `pbir_delete_page` | Delete a page and all its visuals |
| `pbir_reorder_pages` | Set page order array |
| `pbir_set_active_page` | Set which page opens by default |
| `pbir_set_page_visibility` | Show/hide a page in the navigation pane |
| `pbir_get_report_settings` | Read report-level settings and theme config |
| `pbir_update_report_settings` | Merge settings into report.json (validated key whitelist) |
| `pbir_update_page_size` | Change page width/height/displayOption |
| `pbir_auto_layout` | Auto-arrange visuals in a grid |
| `pbir_duplicate_page` | Deep-clone a page with all visuals |
| `pbir_reload_report` | Kill PBI Desktop and reopen the .pbip file |
| `pbir_set_filter_pane` | Show/hide and expand/collapse the filter pane |
| `pbir_set_page_background` | Set page canvas background color and/or wallpaper |
| `pbir_set_visual_interaction` | Set cross-filter/highlight interaction between visuals |
| `pbir_manage_extension_measures` | Add, list, or remove report-level DAX measures |

### visuals.ts (8 tools)

| Tool | Purpose |
|------|---------|
| `pbir_get_visual_types` | List all visual types and their bucket names |
| `pbir_list_visuals` | List visuals on a page (slim/full mode) |
| `pbir_get_visual` | Inspect a visual's config (slim: bindings summary; full: raw JSON) |
| `pbir_add_visual` | Create one or more visuals (batch mode required — pass a `visuals` array) |
| `pbir_delete_visual` | Delete a visual |
| `pbir_move_visual` | Move/resize a visual |
| `pbir_duplicate_visual` | Clone a visual, optionally to another page |
| `pbir_change_visual_type` | Change a visual's type while keeping bindings |

### format.ts (4 tools)

| Tool | Purpose |
|------|---------|
| `pbir_set_visual_title` | Set title text, visibility, font, size, alignment |
| `pbir_format_visual` | Apply formatting categories to visual or container objects |
| `pbir_set_datapoint_colors` | Set series or category data point colors |
| `pbir_set_conditional_format` | Apply rules-based or gradient conditional formatting |
| `pbir_apply_theme` | Apply a named theme preset to all visuals on a page |

### bindings.ts (1 tool)

| Tool | Purpose |
|------|---------|
| `pbir_update_visual_bindings` | Replace a visual's data bindings entirely, rebuild sort and filters |

### themes.ts (5 tools)

| Tool | Purpose |
|------|---------|
| `pbir_set_report_theme` | Write a custom theme JSON to StaticResources and wire it into report.json |
| `pbir_get_report_theme` | Read the current base and custom theme |
| `pbir_remove_report_theme` | Unlink the custom theme from report.json |
| `pbir_diff_report_theme` | Compare a proposed theme against the current one |
| `pbir_list_report_themes` | List theme files in StaticResources |

### filters.ts (4 tools)

| Tool | Purpose |
|------|---------|
| `pbir_list_filters` | List filters on a page or visual |
| `pbir_add_page_filter` | Add categorical, topN, or relativeDate filters |
| `pbir_remove_filter` | Remove a specific filter by name |
| `pbir_clear_filters` | Remove all filters from a page or visual |

### bulk.ts (3 tools)

| Tool | Purpose |
|------|---------|
| `pbir_bulk_delete_visuals` | Delete multiple visuals in one call |
| `pbir_bulk_update_format` | Apply the same formatting to multiple visuals |
| `pbir_bulk_bind` | Rebind multiple visuals in one call |

### model-usage.ts (1 tool, default)

| Tool | Purpose |
|------|---------|
| `pbir_model_usage` | Cross-reference semantic model (TMDL/BIM) with report visuals — shows where every measure and column is used, DAX dependencies, unused fields, and per-page breakdown. Also generates an HTML dashboard. |

**Key functions:**

- `findSemanticModelPath(reportPath)` -- locates the sibling `.SemanticModel` folder via `definition.pbir` or directory scan
- `parseTmdlModel(modelPath)` / `parseBimModel(modelPath)` -- dual-format model parsing (TMDL text files or BIM JSON)
- `parseDaxDependencies(dax, allMeasureNames)` -- regex-based measure reference detection in DAX expressions
- `scanReportBindings(reportPath)` -- walks all visual.json files via `PbirProject`, extracts queryState and filterConfig bindings (Measure, Column, Aggregation, HierarchyLevel)
- `buildFullData(reportPath)` -- builds complete usage data with counts, dependencies, reverse dependencies, page data
- `generateHTML(data, reportName)` -- produces self-contained HTML dashboard (dark theme, 5 tabs: Measures, Columns, Pages, Lineage, Unused)
- `invalidateCache()` -- called by 9 visual-modifying tools to trigger background regeneration
- `startWatchers(reportPath, modelPath)` -- `fs.watch` on both folders with 500ms debounce

**Standalone CLI** (`usage-cli.ts`):
- One-shot: `npm run usage <path>` -- generates dashboard, opens in browser
- Watch: `npm run usage:watch <path>` -- HTTP server + file watchers with auto-regeneration

### bookmarks.ts (4 tools)

| Tool | Purpose |
|------|---------|
| `pbir_list_bookmarks` | List all bookmarks in the report |
| `pbir_add_bookmark` | Create a new bookmark with optional page navigation |
| `pbir_delete_bookmark` | Delete a bookmark by ID |
| `pbir_rename_bookmark` | Rename an existing bookmark |

### guide.ts (1 tool)

| Tool | Purpose |
|------|---------|
| `pbir_guide` | Serve domain knowledge on demand — topics: `svg-visuals`, `report-design` |

The guide tool provides focused, actionable knowledge to help AI agents make better decisions when orchestrating multi-tool workflows. Topics include SVG visual DAX templates, binding rules, and report design principles. New topics can be added by extending the `topics` map in `registerGuideTool()`.

### calculations.ts (3 tools, parked)

`list_visual_calculations`, `add_visual_calculation`, `delete_visual_calculation` -- visual calculation CRUD using `NativeVisualCalculation` projections. Parked because PBI Desktop does not render programmatically-created visual calculations.

---

## 7. Helpers

### createVisual.ts

**`parseFieldSpec(spec)`** -- Converts a field specification to a PBIR `FieldRef`. Supports two formats:

- **Shorthand:** `{ field: "Sales[Net Price]", type: "measure" }` -- parsed via regex `/^(.+)\[(.+)\]$/`
- **Explicit:** `{ entity: "Sales", property: "Net Price", type: "measure" }`

Maps `type` to the correct builder: `measureRef()`, `aggregationRef()`, or `columnRef()`.

**`createAndSaveVisual(project, pageId, spec, baseZ)`** -- The core visual creation function. Steps:

1. Generate a random visual ID
2. Normalize visual type (`basicShape` -> `shape`)
3. Set default dimensions (slicers get 168x65, others 280x280)
4. Build `queryState` from bindings -- for each bucket, map field specs to projections with `queryRef` and `nativeQueryRef`
5. Build sort definition from Category (or Values for slicers)
6. Build visual-type-specific `objects` (slicer mode, shape fill/text, textbox paragraphs, image URL, action button config)
7. Set `howCreated: "InsertVisualButton"` for actionButton, pageNavigator, image types
8. Apply default Segoe UI 8pt font to title (container) and axes/legend/labels (visual)
9. Apply inline `containerFormat`, `visualFormat`, and `dataColors` if provided
10. Build auto-filters from the query state
11. Write `visual.json` via `project.saveVisual()`

**Zod schemas** exported for reuse: `FieldSpecSchema`, `BucketBindingSchema`, `FormatCategorySchema`, `DataColorSchema`, `VisualSpecSchema`.

### formatting.ts

**`buildFormattingProps(properties)`** -- Converts a flat `Record<string, string | number | boolean>` into PBIR literal expressions:

- Strings starting with `#` become `{ solid: { color: { expr: { Literal: { Value: "'#AABBCC'" } } } } }` (color format)
- Numbers get the `D` suffix: `{ expr: { Literal: { Value: "8D" } } }`
- Booleans become `"true"` / `"false"` literals
- Other strings get single-quoted: `{ expr: { Literal: { Value: "'Segoe UI'" } } }`

**`applyFormattingToTarget(targetObj, formatting)`** -- Merges an array of `{ category, properties }` into a PBIR objects dictionary. If a category already exists, its first entry's properties are spread-merged. Otherwise a new entry is created.

**`applyDataColors(visual, colors, defaultTransparency?, categoryEntity?, categoryProperty?)`** -- Sets `dataPoint` entries in `visual.objects`. Two selector modes:

- **Metadata selector** (default, for series-based charts): `{ selector: { metadata: seriesName } }`
- **Data selector** (for category-based charts, when `categoryEntity`/`categoryProperty` provided): uses `scopeId.Comparison` with the category column expression

### defaults.ts

`THEME_PRESETS` -- A record of named theme configurations. Each preset contains:

- `containerFormat` -- title font, background, border, visual header, drop shadow, padding
- `slicerContainerFormat` (optional) -- override for slicer visuals
- `chartVisualFormat` (optional) -- visual-level formatting for chart types
- `dataColors` -- array of 10 hex color strings for data series

Available presets: `dark`, `light`, `corporate`, `blue-purple`.

---

## 8. Data Flow

A typical tool call follows this path:

```
MCP Client (e.g. Claude Code)
  |
  | JSON-RPC over stdio
  v
McpServer (index.ts)
  |
  | Zod validation of input schema
  v
safe() wrapper
  |
  | try/catch around handler
  v
Tool handler (e.g. tools/visuals.ts :: pbir_add_visual)
  |
  | Reads current state via ctx.project (PbirProject)
  v
PbirProject
  |
  | fs.readFileSync / fs.writeFileSync
  v
PBIR JSON files on disk
  |
  v
Tool handler builds response
  |
  | { content: [{ type: "text", text: JSON.stringify({...}) }] }
  v
MCP Client receives result
```

**Concrete example -- `pbir_add_visual`:**

1. Client sends `pbir_add_visual` with `pageId`, `visualType`, `bindings`, position params
2. Zod validates all inputs (including nested `BucketBindingSchema` and `FieldSpecSchema`)
3. Handler reads existing visuals to determine the next z-order value
4. Calls `createAndSaveVisual()` which:
   - Parses field specs into PBIR `FieldRef` objects
   - Builds the `queryState` object
   - Constructs the full `VisualDefinition`
   - Writes `visual.json` to `pages/{pageId}/visuals/{visualId}/visual.json`
5. Returns `{ success: true, pageId, created: [{ visualId, visualType }] }`

---

## 9. Schema Validation

All tool inputs are validated using **Zod** schemas. Notable patterns:

### z.preprocess for string-to-array coercion

MCP clients sometimes serialize arrays as JSON strings. Several tools use `z.preprocess` to handle both formats:

```ts
// In report.ts (pbir_reorder_pages)
pageOrder: z.preprocess(
  (v) => typeof v === "string" ? JSON.parse(v) : v,
  z.array(z.string())
)

// In bulk.ts (generic helper)
function parseArray<T>(schema: z.ZodType<T>) {
  return z.preprocess(
    (val) => (typeof val === "string" ? JSON.parse(val) : val),
    z.array(schema)
  );
}
```

### z.coerce.boolean

Used in `pbir_set_page_visibility` to accept both actual booleans and string `"true"/"false"`:

```ts
hidden: z.coerce.boolean().describe("true to hide the page, false to show it")
```

### Nested schemas

`pbir_add_visual` composes multiple schemas: `BucketBindingSchema` contains `FieldSpecSchema`, and the batch mode uses `VisualSpecSchema` which includes `FormatCategorySchema` and `DataColorSchema`.

### Field specification validation

`FieldSpecSchema` validates that either `field` (shorthand like `"Sales[Amount]"`) or both `entity` and `property` are provided. The actual parsing and validation of the shorthand regex happens at runtime in `parseFieldSpec()`.

---

## 10. Error Handling

### safe() wrapper

Every tool handler is wrapped with `safe()`, which catches any thrown error and returns an MCP-compliant error response:

```ts
{
  content: [{ type: "text", text: '{"success":false,"error":"..."}' }],
  isError: true
}
```

This prevents the MCP server process from crashing on individual tool failures. The LLM client sees a structured error it can reason about and retry.

### PbirProject proxy guard

The `project` object in `index.ts` is a Proxy that throws if no report is connected:

```ts
const project = new Proxy({} as PbirProject, {
  get(_target, prop) {
    if (!_project) {
      throw new Error("No report connected. Use the pbir_set_report tool...");
    }
    // ...
  },
});
```

This error is caught by `safe()` and returned as an `isError` response.

### Process stability handlers

```ts
process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));
process.on("uncaughtException", (err) => console.error("[uncaughtException]", err));
process.on("unhandledRejection", (reason) => console.error("[unhandledRejection]", reason));
```

Uncaught exceptions and unhandled rejections are logged to stderr but do not kill the process. SIGINT/SIGTERM exit cleanly.

### Validation errors

Zod validation errors are thrown before the handler executes. These are caught by `safe()` and returned as structured errors. Some tools also perform manual validation (e.g. `pbir_update_report_settings` checks keys against a whitelist, filter tools validate required fields for each filter type) and return early with `{ success: false, error: "..." }`.

### Per-item error collection in bulk operations

Bulk tools (`pbir_bulk_delete_visuals`, `pbir_bulk_update_format`, `pbir_bulk_bind`) process items in a loop with individual try/catch blocks. Failures for individual items are collected in an `errors` array and returned alongside successful results, so one bad visual ID does not abort the entire batch.

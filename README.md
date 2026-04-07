# Power BI Report MCP Server

**Version 0.4.9** — An agent-agnostic MCP (Model Context Protocol) server that lets any AI assistant programmatically create, edit, and format Power BI reports in PBIR format. Zero vendor lock-in — works with Claude, OpenAI, GitHub Copilot, Cursor, Windsurf, Continue.dev, and any MCP-compatible client.

---

## Quick Start

### 1. Build the server

```bash
cd powerbi-report-mcp
npm install
npm run build
```

> **Deploying on another machine?** The `dist/` folder is committed — no build step needed. Just clone and run:
> ```bash
> npm install        # restore node_modules only
> node dist/index.js # run directly — no build required
> ```

### 2. Configure your MCP client

**Claude Desktop (Windows)**
`%LOCALAPPDATA%\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Roaming\Claude\claude_desktop_config.json`

**Claude Code**
`.claude/settings.json` or `claude mcp add`

**Cursor**
`~/.cursor/mcp.json` or `.cursor/mcp.json` in project root

**Cline (VS Code)**
Settings → Cline → MCP Servers

```json
{
  "mcpServers": {
    "powerbi-report-mcp": {
      "command": "node",
      "args": ["C:\\path\\to\\powerbi-report-mcp\\dist\\index.js"]
    }
  }
}
```

> The report path is **no longer required** in config. Use the `set_report` tool at runtime to connect to any report. You can still pass a path as a second argument as a default.

#### Tool Loading Modes

By default, only **9 core tools** are loaded to reduce token overhead (~2,700 tokens vs ~14,600). The LLM can activate additional tools on-demand via the `load_tools` meta-tool.

To load **all tools** at startup (e.g. on your dev machine), add an `env` block:

```json
{
  "mcpServers": {
    "powerbi-report-mcp": {
      "command": "node",
      "args": ["C:\\path\\to\\powerbi-report-mcp\\dist\\index.js"],
      "env": { "MCP_TOOLS": "all" }
    }
  }
}
```

| Mode | Active Tools | Token Overhead | Use Case |
|------|-------------|----------------|----------|
| **Default** (no env) | 9 + `load_tools` | ~2,700 | Other machines, faster responses |
| **`MCP_TOOLS=all`** | 42 + `load_tools` | ~13,000 | Dev machine, full access |

### 3. Connect to a report

```
Connect to C:\Projects\Sales.Report
```

Or pass a default path in the config args:
```json
"args": ["C:\\path\\to\\dist\\index.js", "C:\\Projects\\Sales.Report"]
```

### 4. Restart your MCP client

After changing config or rebuilding, restart the client to pick up the new MCP process.

---

## Tools Reference

### Default Tools (loaded at startup — 9 tools)

These tools are always available and cover ~90% of report-building workflows:

| Tool | Category | Description |
|------|----------|-------------|
| `list_pages` | Report | List all pages (slim mode — id, name, visualCount, hidden) |
| `list_visuals` | Visuals | List all visuals on a page (slim mode — id, type, x, y, w, h, title) |
| `create_page` | Report | Create a new page (name, width, height, display option) |
| `add_visual` | Visuals | Add one or many visuals with data bindings, formatting, and colors in one call |
| `get_visual` | Visuals | Get visual details (slim mode — type/position/bindings/title; `slim=false` for full JSON) |
| `format_visual` | Format | Apply any formatting (axes, legend, labels, borders, background, etc.) |
| `update_visual_bindings` | Binding | Replace data bindings on an existing visual |
| `set_report_theme` | Themes | Apply a custom JSON theme to the whole report |
| `bulk_bind` | Bulk | Rebind multiple visuals in one call |
| `load_tools` | Meta | List and activate on-demand tools mid-session |

### On-Demand Tools (activate via `load_tools`)

Call `load_tools()` to list available tools, or `load_tools(["tool_name"])` to activate specific ones.

**Report Management**
| Tool | Description |
|------|-------------|
| `set_report` | Connect to a report at runtime — switch without restarting |
| `get_report` | Show which report is currently connected |
| `reload_report` | Close and reopen the report in Power BI Desktop |
| `get_report_settings` | Read report-level settings and theme config |
| `update_report_settings` | Merge new settings into the report |
| `get_page_summary` | All pages + their visuals in one call |
| `delete_page` | Delete a page and all its visuals |
| `rename_page` | Rename an existing page |
| `duplicate_page` | Clone an entire page including all visuals |
| `reorder_pages` | Set the page order |
| `set_active_page` | Set which page opens by default |
| `update_page_size` | Change page dimensions and display mode |
| `set_page_visibility` | Show or hide a page from the navigation pane |
| `auto_layout` | Arrange all visuals into an automatic grid |

**Visual Management**
| Tool | Description |
|------|-------------|
| `delete_visual` | Remove a visual from a page |
| `duplicate_visual` | Clone a visual (optionally to another page) |
| `move_visual` | Reposition and resize a visual |
| `change_visual_type` | Swap visual type while keeping data bindings |
| `get_visual_types` | List all supported visual types and their data buckets |

**Formatting**
| Tool | Description |
|------|-------------|
| `set_visual_title` | Set title text, font, size, alignment, visibility |
| `set_datapoint_colors` | Set per-series or per-category data point colors with optional transparency |
| `set_conditional_format` | Rules-based or gradient conditional formatting on background/title color |
| `apply_theme` | Apply a named theme preset to all visuals on a page |

**Themes**
| Tool | Description |
|------|-------------|
| `get_report_theme` | Get the current base and custom theme with full JSON content |
| `remove_report_theme` | Unlink the custom theme (revert to default) |
| `list_report_themes` | List all theme files stored in StaticResources |
| `diff_report_theme` | Compare a proposed theme JSON against the current |

**Filters**
| Tool | Description |
|------|-------------|
| `list_filters` | List filters on a page or visual (slim mode — field as `Table[Column]` string) |
| `add_page_filter` | Add a categorical, TopN, or relative date filter to a page |
| `remove_filter` | Remove a filter by name |
| `clear_filters` | Remove all filters from a page or visual |

**Bulk Operations**
| Tool | Description |
|------|-------------|
| `bulk_delete_visuals` | Delete multiple visuals in one call |
| `bulk_update_format` | Format multiple visuals in one call |

Field shorthand: `"field": "Table[Column]"` — or use explicit `entity` + `property`.
Field types: **column** (raw), **aggregation** (Sum/Avg/Count/Min/Max/Median/etc.), **measure** (DAX measure)

### Disabled Tools (parked)

These tools are not registered in any mode pending further investigation:

| Tool | Status | Notes |
|------|--------|-------|
| `list_visual_calculations` | Parked | `NativeVisualCalculation` format correct but not rendering programmatically |
| `add_visual_calculation` | Parked | Same — visual calculations parked until PBI Desktop supports it |
| `delete_visual_calculation` | Parked | Same |
| `list_bookmarks` | Parked | Bookmark tools registered in code but not exposed |
| `add_bookmark` | Parked | Same |
| `rename_bookmark` | Parked | Same |
| `delete_bookmark` | Parked | Same |

---

## Batch add_visual

Create multiple visuals in a single tool call using the `visuals` array. Each visual supports inline `containerFormat`, `visualFormat`, and `dataColors`.

```json
{
  "pageId": "abc123",
  "visuals": [
    {
      "visualType": "shape",
      "x": 10, "y": 10, "width": 1260, "height": 40,
      "shapeType": "rectangle",
      "fillColor": "#1F3864",
      "textContent": "Sales Dashboard",
      "textColor": "#FFFFFF",
      "textBold": true,
      "textSize": 14,
      "textAlign": "center"
    },
    {
      "visualType": "card",
      "x": 10, "y": 60, "width": 300, "height": 100,
      "title": "Gross Sales",
      "bindings": [
        { "bucket": "Values", "fields": [{ "field": "financials[Gross Sales]", "type": "aggregation", "aggregation": "Sum" }] }
      ]
    },
    {
      "visualType": "lineChart",
      "x": 10, "y": 170, "width": 620, "height": 240,
      "title": "Sales by Month",
      "bindings": [
        { "bucket": "Category", "fields": [{ "field": "Date[Month]", "type": "column" }] },
        { "bucket": "Y",        "fields": [{ "field": "Sales[Revenue]", "type": "measure" }] }
      ],
      "visualFormat": [
        { "category": "categoryAxis", "properties": { "labelColor": "#333333" } }
      ],
      "dataColors": [{ "color": "#0078D4" }]
    }
  ]
}
```

---

## Conditional Formatting (`set_conditional_format`)

Apply data-driven background or title color to a visual:

**Rules-based** (green if profit > 0, red otherwise):
```json
{
  "pageId": "abc123",
  "visualId": "xyz",
  "property": "background",
  "formatType": "rules",
  "entity": "financials",
  "property2": "Profit",
  "isMeasure": false,
  "rules": [
    { "comparisonKind": 1, "value": 0, "color": "#00B050" }
  ],
  "defaultColor": "#FF0000"
}
```

**Gradient** (white → blue scale, with optional mid-point):
```json
{
  "formatType": "gradient",
  "entity": "financials", "property2": "Sales", "isMeasure": false,
  "minColor": "#FF6B6B", "midColor": "#FFD93D", "maxColor": "#6BCB77"
}
```

ComparisonKind: `0`=Equal, `1`=GT, `2`=GTE, `3`=LT, `4`=LTE, `5`=NotEqual

---

## Page-Level Filters (`add_page_filter`)

**Categorical** — include specific values:
```json
{ "pageId": "abc", "filterType": "categorical", "entity": "Store", "property": "Region", "values": ["East", "West"] }
```

**TopN** — top 10 products by revenue:
```json
{ "pageId": "abc", "filterType": "topN", "entity": "Product", "property": "Name", "n": 10, "topNDirection": "Top", "orderByEntity": "Sales", "orderByProperty": "Revenue", "orderByIsMeasure": true }
```

**Relative date** — last 12 months:
```json
{ "pageId": "abc", "filterType": "relativeDate", "entity": "Date", "property": "Date", "period": "months", "count": 12, "dateDirection": "last" }
```

---

## Report-Level Themes (`set_report_theme`)

Applies globally to all visuals — no individual visual files are touched:

```json
{
  "name": "Corporate Brand",
  "dataColors": ["#0078D4", "#00BCF2", "#00B294", "#FF8C00", "#E81123"],
  "background": "#FFFFFF",
  "foreground": "#1F3864",
  "tableAccent": "#0078D4"
}
```

Theme files are saved to `StaticResources/RegisteredResources/` and wired into `report.json` automatically.

---

## Page Themes (`apply_theme`)

Apply a preset to all visuals on one page:

| Theme | Style |
|-------|-------|
| `dark` | Near-black background, GitHub-style blues/greens |
| `light` | White background, soft blues |
| `corporate` | White background, professional blues |
| `blue-purple` | White background, indigo/violet palette |

```json
{ "pageId": "abc123", "theme": "dark", "applyDataColors": true }
```

---

## Supported Visual Types

### Charts

| Type | Data Buckets |
|------|-------------|
| `barChart` | Category, Y, Series, Gradient |
| `stackedBarChart` | Category, Y, Series |
| `clusteredBarChart` | Category, Y, Series, Gradient |
| `hundredPercentStackedBarChart` | Category, Y, Series |
| `columnChart` | Category, Y, Series, Gradient |
| `clusteredColumnChart` | Category, Y, Series, Gradient |
| `hundredPercentStackedColumnChart` | Category, Y, Series |
| `lineChart` | Category, Y, Y2, Series |
| `areaChart` | Category, Y, Y2, Series |
| `stackedAreaChart` | Category, Y, Series |
| `hundredPercentStackedAreaChart` | Category, Y, Series |
| `lineClusteredColumnComboChart` | Category, ColumnY, LineY, Series |
| `lineStackedColumnComboChart` | Category, ColumnY, LineY, Series |
| `ribbonChart` | Category, Y, Series |
| `waterfallChart` | Category, Y, Breakdown |
| `scatterChart` | Details, X, Y, Size, Series |
| `pieChart` | Category, Y, Series |
| `donutChart` | Category, Y, Series |
| `funnelChart` | Category, Y |
| `treemap` | Group, Values, Details |

### Maps

| Type | Data Buckets |
|------|-------------|
| `azureMap` | Location, Size, Legend |
| `map` | Category, Size, Series |
| `filledMap` | Location, Legend, Values |

### Tables & Matrices

| Type | Data Buckets |
|------|-------------|
| `tableEx` | Values |
| `pivotTable` | Rows, Columns, Values |

### Cards & KPIs

| Type | Data Buckets |
|------|-------------|
| `card` | Values |
| `cardNew` | Values |
| `cardVisual` | Data, Rows |
| `multiRowCard` | Values |
| `kpi` | Indicator, TrendLine, Goal |
| `gauge` | Y, MinValue, MaxValue, TargetValue |

### Slicers

| Type | Data Buckets | Notes |
|------|-------------|-------|
| `slicer` | Values | `Basic` (list) or `Dropdown` mode |
| `listSlicer` | Values | Always-expanded checkbox list |
| `textSlicer` | Values | Free-text search box |
| `advancedSlicerVisual` | Values | Range / between slicer |

### Decorative & Navigation

| Type | Notes |
|------|-------|
| `textbox` | Set text via `textContent` |
| `shape` | rectangle, rectangleRounded, line, tab variants |
| `basicShape` | |
| `image` | |
| `actionButton` | |
| `pageNavigator` | |
| `decompositionTreeVisual` | Buckets: Analyze, ExplainBy |

---

## Formatting Reference

### `target = "container"` — Visual Chrome

| Category | Key Properties |
|----------|---------------|
| `title` | `text`, `show`, `fontSize`, `fontFamily`, `alignment`, `fontColor`, `titleWrap` |
| `background` | `show`, `color` (hex), `transparency` (0–100) |
| `border` | `show`, `color` (hex), `width`, `radius` |
| `padding` | `top`, `bottom`, `left`, `right` |
| `dropShadow` | `show`, `position` (`Outer`/`Inner`) |
| `visualHeader` | `show` — hide the hover toolbar |

### `target = "visual"` — Visual Content

| Category | Key Properties | Applies To |
|----------|---------------|-----------|
| `categoryAxis` | `show`, `labelColor`, `fontSize`, `gridlineColor` | Bar, column, line, area, combo |
| `valueAxis` | `show`, `labelColor`, `fontSize`, `gridlineColor` | Bar, column, line, area, combo |
| `legend` | `show`, `position`, `labelColor`, `fontSize` | Charts with Series |
| `labels` | `show`, `color`, `fontSize`, `labelDisplayUnits` | Most chart types |
| `lineStyles` | `strokeWidth`, `lineChartType` (`curved`/`step`/`straight`) | Line, area, combo |
| `dataPoint` | `fillTransparency` (0–100) | Most chart types |
| `plotArea` | `transparency` | Charts |
| `grid` | `fontSize` | Table, pivot |
| `header` | `show`, `fontFamily`, `textSize` | Slicer |
| `items` | `fontFamily`, `textSize` | Slicer |

Hex colors starting with `#` are automatically wrapped in PBIR format.

---

## PBIR Folder Structure

```
MyProject.Report/
  definition/
    report.json              # Report settings, theme config, resourcePackages
    version.json             # Format version
    pages/
      pages.json             # Page order and active page
      {pageId}/
        page.json            # Page name, size, visibility, filters
        visuals/
          {visualId}/
            visual.json      # Visual type, position, bindings, formatting
    bookmarks/
      bookmarks.json         # Bookmark order
      {bookmarkId}/
        bookmark.json        # Bookmark state
  StaticResources/
    RegisteredResources/     # Custom theme JSON files
  definition.pbir            # Semantic model reference
```

Key rules:
- `visualContainerObjects` (title, background, border) goes **inside** the `visual` object
- `objects` (axes, legend, labels) also goes **inside** the `visual` object
- Color format: `{ solid: { color: { expr: { Literal: { Value: "'#XXXXXX'" } } } } }`
- Numbers use `D` suffix (handled automatically by the server)

---

## Example: Build a Dashboard in Minimal Calls

```
1. set_report          → connect to target .Report
2. create_page         → "Sales Dashboard" (1280×720)
3. add_visual (batch)  → shapes (wireframe) first, then data visuals on top
4. set_report_theme    → apply brand colors globally
5. add_page_filter     → optional: last 12 months relative date filter
6. reload_report       → open in Power BI Desktop
```

A typical 10-visual dashboard can be built in **4–6 tool calls** using batch mode.

---

## Tips

- Always read the semantic model first (`powerbi-modeling-mcp`) to get exact table/column names before binding
- Use `set_report` to switch between reports mid-session without restarting
- Add wireframe shapes **before** data visuals so z-order is correct
- Use `Table[Column]` shorthand in bindings: `"field": "financials[Gross Sales]"`
- `duplicate_page` clones an entire page with all visuals — great for template pages
- `set_report_theme` applies globally; `apply_theme` applies per-page presets
- `format_visual` merges with existing formatting — safe to call incrementally
- `set_page_visibility: hidden=true` for drillthrough pages
- TopN filters are **visual-level only** — use the `visualId` param on `add_page_filter`
- For category-based charts (bar/column/pie with no Series), use `categoryEntity` + `categoryProperty` on `set_datapoint_colors`
- `barChart` = stacked bar, `clusteredBarChart` = clustered bar — there is no `stackedBarChart` type
- Gradient conditional formatting uses `FillRule` in `objects.values` — not container background
- All tools return `{ success: false, error: "..." }` on failure — the server never crashes

---

## Known Issues

| Feature | Status | Notes |
|---------|--------|-------|
| Visual calculations | Disabled | `NativeVisualCalculation` format identified but not rendering when written programmatically. Tools removed from registration. |
| Bookmarks | Disabled | Tools registered in code but not exposed. Removed from registration. |

---

## Agent-Agnostic — Works with Any MCP Client

This server has **zero vendor-specific dependencies**. It uses only the open `@modelcontextprotocol/sdk` and `zod` — no Anthropic, OpenAI, or other AI SDK imports. Any agent that speaks MCP over stdio can connect.

| Client | MCP Support | Config Location |
|--------|-------------|-----------------|
| **Claude Desktop** | Native | `%LOCALAPPDATA%\...\Claude\claude_desktop_config.json` |
| **Claude Code** | Native | `.claude/settings.json` or `claude mcp add` |
| **OpenAI ChatGPT** | Via MCP bridge | MCP plugin/tool integration |
| **GitHub Copilot** | VS Code agent mode | `.vscode/mcp.json` |
| **Cursor** | Native | `~/.cursor/mcp.json` |
| **Windsurf** | Native | MCP settings |
| **Continue.dev** | Native | `~/.continue/config.json` |
| **Cline (VS Code)** | Native | Settings → Cline → MCP Servers |
| **Custom agents** | `@modelcontextprotocol/sdk` | Programmatic client |

For models without native MCP support, use `mcp-proxy` to expose the server over HTTP/SSE.

---

## Token Overhead

### Default Mode (9 tools)

Only core tools are loaded at startup, dramatically reducing per-turn token cost:

| Tool | Schema Tokens |
|------|--------------|
| `list_pages` | ~150 |
| `list_visuals` | ~150 |
| `create_page` | ~200 |
| `add_visual` | ~1,200 |
| `get_visual` | ~200 |
| `format_visual` | ~350 |
| `update_visual_bindings` | ~350 |
| `set_report_theme` | ~500 |
| `bulk_bind` | ~300 |
| `load_tools` | ~100 |
| **Total** | **~2,700** |

### All Tools Mode (`MCP_TOOLS=all` — 42 tools)

| Category | Tools | Schema Tokens | Avg/Tool | Heaviest Tool |
|----------|-------|--------------|----------|---------------|
| Report Ops | 16 | ~3,290 | 206 | `auto_layout` (300) |
| Visual Ops | 8 | ~2,800 | 350 | `add_visual` (1,200) |
| Format Ops | 5 | ~2,100 | 420 | `set_conditional_format` (800) |
| Filter Ops | 4 | ~1,600 | 400 | `add_page_filter` (1,000) |
| Theme Ops | 5 | ~1,150 | 230 | `set_report_theme` (500) |
| Bulk Ops | 3 | ~900 | 300 | `bulk_update_format` (350) |
| Binding Ops | 1 | ~350 | 350 | `update_visual_bindings` (350) |
| **Total** | **42** | **~13,000** | **~310** | |

> **Note:** Visual calculation tools (3) and bookmark tools (4) are parked and not included in either mode.

### Token Savings: Default vs All

| Mode | Tools | Schema Tokens | Reduction |
|------|-------|--------------|-----------|
| Default | 9 + load_tools | ~2,700 | **82% less** |
| All | 42 + load_tools | ~13,000 | baseline |

**Key efficiency patterns:**

| Operation | Efficient | Tokens | vs N Calls | Tokens |
|-----------|-----------|--------|------------|--------|
| Add 6 visuals | 1× `add_visual` batch | ~200 | 6× `add_visual` | ~360 |
| Format 10 visuals | 1× `bulk_update_format` | ~60 | 10× `format_visual` | ~600 |
| Get all pages + visuals | 1× `get_page_summary` | ~120 | `list_pages` + N× `list_visuals` | ~300+ |
| Style entire page | 1× `apply_theme` | ~80 | N× `format_visual` | ~60×N |

### Report Build Cost — 10 Pages, ~60 Visuals

**Base: theme + batch visuals only (22 calls)**

| Step | Tool | Calls | I/O Tokens |
|------|------|-------|-----------|
| Connect | `set_report` | 1 | 50 |
| Theme | `set_report_theme` | 1 | 180 |
| Pages | `create_page` ×10 | 10 | 500 |
| Visuals | `add_visual` batch(6) ×10 | 10 | 7,200 |
| **Subtotal** | | **22** | **~8,000** |
| + Schema overhead (one-time) | | | 14,600 |
| + LLM reasoning (~12 turns) | | | ~2,400 |
| + Context growth | | | ~3,000 |
| **Total** | | | **~28,000** |

**Adding layers on top (incremental cost per layer):**

| Layer | Tool | Calls | +Tokens | Running Total |
|-------|------|-------|---------|---------------|
| Base | theme + visuals | 22 | — | **~28,000** |
| +Page themes | `apply_theme` ×10 | +10 | +1,800 | ~30,000 |
| +Bulk formatting | `bulk_update_format` ×10 | +10 | +3,700 | ~34,000 |
| +Data colors | `set_datapoint_colors` ×20 | +20 | +5,400 | ~40,000 |
| +Conditional format | `set_conditional_format` ×10 | +10 | +3,200 | ~44,000 |
| +Page filters | `add_page_filter` ×10 | +10 | +3,000 | ~47,000 |
| +Individual titles | `set_visual_title` ×60 | +60 | +6,600 | ~54,000 |
| **Fully styled** | | **142** | | **~54,000** |

> **Pro tip:** Use inline `title`, `dataColors`, and `containerFormat` in `add_visual` batch to skip separate title/color/format calls — a fully styled report in **~22 calls / ~32K tokens**.

**Efficient vs naive approach:**

| Approach | Calls | Tokens | Savings |
|----------|-------|--------|---------|
| Batch + bulk (recommended) | 22–32 | ~28–32K | baseline |
| Per-visual calls (naive) | 300+ | ~120K | 2–4× more expensive |

### Estimated API Cost (pricing as of April 2026)

Based on ~19K input / ~9K output tokens (base) and ~30K input / ~24K output tokens (fully styled):

| Model | Input $/1M | Output $/1M | Base Report | Fully Styled |
|-------|-----------|-------------|-------------|--------------|
| GPT-4o-mini | $0.15 | $0.60 | **$0.01** | $0.02 |
| GPT-4.1-mini | $0.40 | $1.60 | **$0.02** | $0.05 |
| GPT-4.1 | $2.00 | $8.00 | **$0.11** | $0.25 |
| GPT-4o | $2.50 | $10.00 | **$0.14** | $0.32 |
| Claude Haiku 3.5 | $0.80 | $4.00 | **$0.05** | $0.12 |
| Claude Sonnet 4 | $3.00 | $15.00 | **$0.19** | $0.45 |
| Claude Opus 4 | $15.00 | $75.00 | **$0.96** | $2.25 |

> A 10-page, 60-visual report costs **$0.01–$2.25** depending on model. Sweet spot: **Sonnet or GPT-4.1 at $0.11–$0.45** for a fully styled report.

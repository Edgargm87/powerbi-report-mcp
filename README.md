# Power BI Report MCP Server

**Version 0.4.0** — An MCP (Model Context Protocol) server that lets AI assistants programmatically create, edit, and format Power BI reports in PBIR format. Works with Claude Desktop, Claude Code, Cursor, Cline, and any MCP-compatible client.

---

## Quick Start

### 1. Build the server

```bash
cd powerbi-report-mcp
npm install
npm run build
```

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

### Report Connection

| Tool | Description |
|------|-------------|
| `set_report` | Connect to a report at runtime — switch without restarting |
| `get_report` | Show which report is currently connected |
| `reload_report` | Close and reopen the report in Power BI Desktop |
| `get_report_settings` | Read report-level settings and theme config |
| `update_report_settings` | Merge new settings into the report |

### Page Management

| Tool | Description |
|------|-------------|
| `list_pages` | List all pages with IDs, names, sizes, visual counts, hidden state |
| `create_page` | Create a new page (name, width, height, display option) |
| `delete_page` | Delete a page and all its visuals |
| `rename_page` | Rename an existing page |
| `duplicate_page` | Clone an entire page including all visuals |
| `reorder_pages` | Set the page order |
| `set_active_page` | Set which page opens by default |
| `update_page_size` | Change page dimensions and display mode |
| `set_page_visibility` | Show or hide a page from the navigation pane |
| `auto_layout` | Arrange all visuals into an automatic grid |

### Visual Management

| Tool | Description |
|------|-------------|
| `add_visual` | Add one or many visuals with data bindings, formatting, and colors in one call |
| `delete_visual` | Remove a visual from a page |
| `duplicate_visual` | Clone a visual (optionally to another page) |
| `move_visual` | Reposition and resize a visual |
| `change_visual_type` | Swap visual type while keeping data bindings |
| `list_visuals` | List all visuals on a page with types and positions |
| `get_visual` | Get the full JSON definition of a visual |
| `get_visual_types` | List all supported visual types and their data buckets |

### Data Binding

| Tool | Description |
|------|-------------|
| `update_visual_bindings` | Replace data bindings on an existing visual |

Field shorthand: `"field": "Table[Column]"` — or use explicit `entity` + `property`.
Field types: **column** (raw), **aggregation** (Sum/Avg/Count/Min/Max/Median/etc.), **measure** (DAX measure)

### Formatting

| Tool | Description |
|------|-------------|
| `format_visual` | Apply any formatting (axes, legend, labels, borders, background, etc.) |
| `set_visual_title` | Set title text, font, size, alignment, visibility |
| `set_datapoint_colors` | Set per-series data point colors |
| `set_conditional_format` | Rules-based or gradient conditional formatting on background/title color |
| `apply_theme` | Apply a named theme preset to all visuals on a page |

### Report-Level Themes

| Tool | Description |
|------|-------------|
| `set_report_theme` | Apply a custom JSON theme to the whole report (saved to StaticResources) |
| `get_report_theme` | Get the current base and custom theme with full JSON content |
| `remove_report_theme` | Unlink the custom theme (revert to default) |
| `list_report_themes` | List all theme files stored in StaticResources |
| `diff_report_theme` | Compare a proposed theme JSON against the current — shows added/removed/changed keys |

### Filters

| Tool | Description |
|------|-------------|
| `list_filters` | List all filters on a page or visual |
| `add_page_filter` | Add a categorical, TopN, or relative date filter to a page |
| `remove_filter` | Remove a filter by name |
| `clear_filters` | Remove all filters from a page or visual |

### Bookmarks

| Tool | Description |
|------|-------------|
| `list_bookmarks` | List all bookmarks in the report |
| `add_bookmark` | Create a new bookmark (optionally targeting a page) |
| `rename_bookmark` | Rename a bookmark |
| `delete_bookmark` | Delete a bookmark |

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

**Gradient** (white → blue scale):
```json
{
  "formatType": "gradient",
  "entity": "Sales", "property2": "Total",
  "minColor": "#FFFFFF", "maxColor": "#0078D4"
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
| `dataPoint` | `transparency` | Most chart types |
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
- All tools return `{ success: false, error: "..." }` on failure — the server never crashes

---

## Connecting Other AI Models

| Client | Config location |
|--------|----------------|
| Claude Desktop | `%LOCALAPPDATA%\...\Claude\claude_desktop_config.json` |
| Claude Code | `.claude/settings.json` or `claude mcp add` |
| Cursor | `~/.cursor/mcp.json` |
| Cline (VS Code) | Settings → Cline → MCP Servers |
| Continue.dev | `~/.continue/config.json` |

For models without native MCP support, use `mcp-proxy` to expose the server over HTTP/SSE.

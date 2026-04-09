<!-- doc-version: 1.0 | Last updated: 2026-04-09 -->
<p align="center">
  <h1 align="center">Power BI Report MCP Server</h1>
  <p align="center">
    Build Power BI reports with natural language — through any AI assistant.
  </p>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License"></a>
  <img src="https://img.shields.io/badge/version-0.5.0-green.svg" alt="Version">
  <img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg" alt="Node.js">
  <img src="https://img.shields.io/badge/MCP-1.12-purple.svg" alt="MCP SDK">
  <img src="https://img.shields.io/badge/Power%20BI-PBIR-yellow.svg" alt="PBIR Format">
  <img src="https://img.shields.io/badge/tools-47-orange.svg" alt="47 Tools">
</p>

<p align="center">
  <code>Claude</code> &middot; <code>OpenAI</code> &middot; <code>GitHub Copilot</code> &middot; <code>Cursor</code> &middot; <code>Windsurf</code> &middot; <code>Continue.dev</code> &middot; <code>Cline</code> &middot; <code>Any MCP Client</code>
</p>

---

> **"Create an executive summary page with 6 KPI cards, a revenue trend line chart, and a bar chart by country"**
>
> One prompt. One batch call. Full page in Power BI Desktop.

---

## What is this?

The first open-source **MCP server for Power BI report authoring**. It connects any AI assistant to Power BI's PBIR (Power BI Report) file format, turning natural language into real report pages — cards, charts, tables, themes, filters, and formatting.

No REST API keys. No Power BI service. Just local files + your AI assistant.

```
You: "Build me a sales dashboard with KPIs, trend charts, and a detail table"

AI:  create_page → add_visual (batch: 12 visuals) → set_report_theme → done.
     Open in Power BI Desktop. ✓
```

---

## Why MCP?

**MCP (Model Context Protocol)** is an open standard that lets AI assistants call external tools. Instead of the AI generating code for you to run, it directly executes operations through the MCP server.

```mermaid
graph LR
    subgraph AI["AI Assistant"]
        LLM["Claude, GPT,<br/>Copilot, Cursor..."]
    end

    subgraph MCP["Two MCP Servers"]
        direction TB
        MODEL["powerbi-modeling-mcp<br/><i>Tables, columns, measures, DAX</i>"]
        REPORT["powerbi-report-mcp<br/><i>Pages, visuals, themes, filters</i>"]
    end

    subgraph Files["Power BI Project"]
        direction TB
        SEM[".SemanticModel<br/><i>TMDL / measures</i>"]
        REP[".Report<br/><i>PBIR / visual.json</i>"]
    end

    PBI["Power BI<br/>Desktop"]

    LLM <-->|"stdio / MCP"| MODEL
    LLM <-->|"stdio / MCP"| REPORT
    MODEL <-->|"read"| SEM
    REPORT <-->|"read/write"| REP
    REP -->|"open .pbip"| PBI
```

**The typical workflow:**

```
1. Query the model   --> "What tables and measures are available?"    (modeling-mcp)
2. Build the report  --> "Create a dashboard with those measures"     (report-mcp)
3. Open in Desktop   --> Ctrl+Shift+F5 to refresh
```

> Both servers run simultaneously as MCP tools. The AI queries the semantic model for exact table/column/measure names, then uses those to build correctly-bound report pages — no guessing, no broken fields.

**Zero vendor lock-in** — built on `@modelcontextprotocol/sdk` + `zod`. No Anthropic, OpenAI, or Microsoft SDK imports.

---

## How It Compares

| | **This MCP Server** | **Manual PBI Desktop** | **Power BI REST API** | **pbi-tools** |
|---|---|---|---|---|
| **Input** | Natural language | Mouse clicks | REST calls + auth | CLI commands |
| **Speed** | 10-page report in minutes | Hours | Hours (code-heavy) | Minutes (extract/deploy) |
| **Auth required** | None (local files) | None | Azure AD + Service Principal | None |
| **AI-native** | Yes (MCP) | No | No | No |
| **Format** | PBIR (file-based) | PBIX (binary) | Cloud-only | PBIX ↔ folder |
| **Creates visuals** | Yes | Yes | Limited | No (metadata only) |
| **Themes & formatting** | Yes | Yes | Limited | No |
| **Filters** | Yes | Yes | Yes | No |
| **Works offline** | Yes | Yes | No | Yes |

---

## Quick Start

> Full walkthrough: **[docs/quickstart.md](docs/quickstart.md)**

### 1. Install

```bash
git clone https://github.com/jonathan-pap/powerbi-report-mcp.git
cd powerbi-report-mcp
npm install
npm run build
```

### 2. Configure your MCP client

<details>
<summary><b>Claude Desktop</b></summary>

File: `%LOCALAPPDATA%\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Roaming\Claude\claude_desktop_config.json`

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
</details>

<details>
<summary><b>Claude Code</b></summary>

```bash
claude mcp add powerbi-report-mcp node dist/index.js
```
</details>

<details>
<summary><b>Cursor</b></summary>

File: `~/.cursor/mcp.json`

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
</details>

<details>
<summary><b>GitHub Copilot (VS Code)</b></summary>

File: `.vscode/mcp.json`

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
</details>

<details>
<summary><b>Other MCP clients</b></summary>

Any client that supports MCP over stdio. Use `mcp-proxy` for HTTP/SSE bridges.
</details>

### 3. Connect and build

```
Connect to C:\Projects\Sales.Report
Create a page called "Overview" with 4 KPI cards and a bar chart by country
```

### 4. Open in Power BI Desktop

Open the `.pbip` file — or if already open, press `Ctrl+Shift+F5` to refresh.

---

## Smart Tool Loading

By default, only **10 core tools** are loaded to keep token overhead low. The LLM activates more tools on-demand via `load_tools`.

```mermaid
graph TD
    subgraph DEFAULT["10 Default Tools -- loaded at startup"]
        A1[set_report] --- A2[list_pages] --- A3[list_visuals] --- A4[create_page] --- A5[add_visual]
        B1[get_visual] --- B2[format_visual] --- B3[update_visual_bindings] --- B4[set_report_theme] --- B5[bulk_bind]
    end

    LT[load_tools -- always available]

    subgraph ONDEMAND["37 On-Demand Tools -- activate mid-session"]
        C1[delete_page] --- C2[rename_page] --- C3[duplicate_page] --- C4[move_visual] --- C5[delete_visual]
        D1[set_datapoint_colors] --- D2[set_conditional_format] --- D3[add_page_filter] --- D4[set_visual_sort] --- D5[...]
    end

    DEFAULT --> LT --> ONDEMAND

    style DEFAULT fill:#1a7f37,color:#fff
    style ONDEMAND fill:#333,color:#ccc
    style LT fill:#0078D4,color:#fff
```

| Mode | Tools | Token Overhead | Use Case |
|------|-------|----------------|----------|
| `default` | 10 + `load_tools` | **~2,900 tokens** | Production / shared machines |
| `MCP_TOOLS=all` | 47 + `load_tools` | ~14,000 tokens | Dev machine / full access |

Load all tools at startup with:

```json
"env": { "MCP_TOOLS": "all" }
```

---

## Tool Reference

### Default Tools

| Tool | Description |
|------|-------------|
| `set_report` | Connect to a `.Report` folder at runtime |
| `list_pages` | List all pages (id, name, visual count) |
| `list_visuals` | List visuals on a page (id, type, position, title) |
| `create_page` | Create a new page |
| `add_visual` | Add one or many visuals with bindings, formatting, colors |
| `get_visual` | Inspect a visual's config and bindings |
| `format_visual` | Format axes, legend, labels, borders, background |
| `update_visual_bindings` | Replace data bindings on a visual |
| `set_report_theme` | Apply a custom JSON theme to the whole report |
| `bulk_bind` | Rebind multiple visuals in one call |
| `load_tools` | List and activate on-demand tools |

### On-Demand Tools (37)

<details>
<summary><b>Report & Page Management</b> — 16 tools</summary>

| Tool | Description |
|------|-------------|
| `get_report` | Show connected report path |
| `reload_report` | Reopen report in PBI Desktop |
| `get_report_settings` | Read report-level settings |
| `update_report_settings` | Merge new report settings |
| `get_page_summary` | All pages + visuals in one call |
| `delete_page` | Delete a page and its visuals |
| `rename_page` | Rename a page |
| `duplicate_page` | Clone a page with all visuals |
| `reorder_pages` | Set page order |
| `set_active_page` | Set default page on open |
| `update_page_size` | Change page dimensions |
| `set_page_visibility` | Show/hide from navigation |
| `auto_layout` | Auto-arrange visuals in a grid |
| `set_filter_pane` | Show/hide and expand/collapse the filter pane |
| `set_visual_interaction` | Set cross-filter/highlight interaction between visuals |
| `manage_extension_measures` | Add, list, or remove report-level DAX measures |
</details>

<details>
<summary><b>Visual Management</b> — 5 tools</summary>

| Tool | Description |
|------|-------------|
| `delete_visual` | Remove a visual |
| `duplicate_visual` | Clone a visual |
| `move_visual` | Reposition and resize |
| `change_visual_type` | Swap type, keep bindings |
| `get_visual_types` | List all visual types and buckets |
</details>

<details>
<summary><b>Formatting & Colors</b> — 6 tools</summary>

| Tool | Description |
|------|-------------|
| `set_visual_title` | Set title text, font, alignment |
| `set_datapoint_colors` | Per-series or per-category colors |
| `set_conditional_format` | Rules-based or gradient formatting |
| `set_visual_sort` | Set or change sort order (column/measure, ascending/descending) |
| `apply_theme` | Apply a preset theme to a page |
| `audit_theme_compliance` | Scan visuals for formatting overrides conflicting with theme |
</details>

<details>
<summary><b>Themes</b> — 4 tools</summary>

| Tool | Description |
|------|-------------|
| `get_report_theme` | Get current theme JSON |
| `remove_report_theme` | Revert to default theme |
| `list_report_themes` | List stored theme files |
| `diff_report_theme` | Compare proposed vs current theme |
</details>

<details>
<summary><b>Filters</b> — 4 tools</summary>

| Tool | Description |
|------|-------------|
| `list_filters` | List page or visual filters |
| `add_page_filter` | Add categorical, TopN, relative date, or advanced filter |
| `remove_filter` | Remove a filter by name |
| `clear_filters` | Remove all filters |
</details>

<details>
<summary><b>Bulk Operations</b> — 2 tools</summary>

| Tool | Description |
|------|-------------|
| `bulk_delete_visuals` | Delete multiple visuals |
| `bulk_update_format` | Format multiple visuals |
</details>

---

## Batch Mode — Build Pages Fast

Create an entire page in a single `add_visual` call:

```json
{
  "pageId": "abc123",
  "visuals": [
    {
      "visualType": "shape", "shapeType": "rectangle",
      "x": 0, "y": 0, "width": 1280, "height": 50,
      "fillColor": "#1F3864", "textContent": "Sales Dashboard",
      "textColor": "#FFFFFF", "textBold": true, "textSize": 20
    },
    {
      "visualType": "card",
      "x": 10, "y": 60, "width": 300, "height": 100,
      "title": "Revenue",
      "bindings": [
        { "bucket": "Fields", "fields": [{ "field": "Sales[Revenue]", "type": "measure" }] }
      ]
    },
    {
      "visualType": "clusteredBarChart",
      "x": 10, "y": 170, "width": 620, "height": 260,
      "title": "Revenue by Country",
      "bindings": [
        { "bucket": "Category", "fields": [{ "field": "Store[Country]", "type": "column" }] },
        { "bucket": "Y", "fields": [{ "field": "Sales[Revenue]", "type": "measure" }] }
      ],
      "dataColors": [{ "color": "#0078D4" }]
    }
  ]
}
```

> **One call creates the banner, KPI card, and chart — with data bindings, titles, and colors.**

---

## Supported Visual Types

> Full reference: **[docs/visual-types.md](docs/visual-types.md)**

### Naming Gotchas

```
barChart              = Stacked bar       (NOT clustered)
columnChart           = Stacked column    (NOT clustered)
clusteredBarChart     = Clustered bar     ✓
clusteredColumnChart  = Clustered column  ✓
stackedBarChart       = DOES NOT EXIST    ✗ (use barChart)
scatterChart          = Uses "Details" bucket, NOT "Category"
Combo charts          = Use "ColumnY" + "LineY", NOT "Y" + "Y2"
```

### Quick Reference

| Category | Types |
|----------|-------|
| **Bar/Column** | `barChart` · `clusteredBarChart` · `columnChart` · `clusteredColumnChart` · `hundredPercentStackedBarChart` · `hundredPercentStackedColumnChart` |
| **Line/Area** | `lineChart` · `areaChart` · `stackedAreaChart` · `hundredPercentStackedAreaChart` |
| **Combo** | `lineClusteredColumnComboChart` · `lineStackedColumnComboChart` |
| **Pie/Donut** | `pieChart` · `donutChart` · `funnelChart` · `treemap` |
| **Tables** | `tableEx` · `pivotTable` (matrix) |
| **Cards** | `card` · `cardVisual` · `multiRowCard` · `kpi` · `gauge` |
| **Slicers** | `slicer` (Basic/Dropdown) · `listSlicer` · `textSlicer` · `advancedSlicerVisual` |
| **Maps** | `azureMap` · `map` · `filledMap` |
| **Scatter** | `scatterChart` |
| **Other** | `ribbonChart` · `waterfallChart` · `decompositionTreeVisual` |
| **Decorative** | `textbox` · `shape` · `image` · `actionButton` · `pageNavigator` |

---

## Formatting

```
format_visual(target="auto")          → auto-routes to container or visual (default)
format_visual(target="container")     → title, background, border, padding, shadow
format_visual(target="visual")        → axes, legend, labels, line styles, data points
```

<details>
<summary><b>Container properties</b> (visual chrome)</summary>

| Category | Properties |
|----------|-----------|
| `title` | `text`, `show`, `fontSize`, `fontFamily`, `alignment`, `fontColor` |
| `background` | `show`, `color`, `transparency` |
| `border` | `show`, `color`, `width`, `radius` |
| `padding` | `top`, `bottom`, `left`, `right` |
| `dropShadow` | `show`, `position` |
| `visualHeader` | `show` |
</details>

<details>
<summary><b>Visual properties</b> (chart content)</summary>

| Category | Properties | Applies To |
|----------|-----------|-----------|
| `categoryAxis` | `show`, `labelColor`, `fontSize` | Bar, column, line, combo |
| `valueAxis` | `show`, `labelColor`, `fontSize` | Bar, column, line, combo |
| `legend` | `show`, `position`, `labelColor` | Charts with Series |
| `labels` | `show`, `color`, `fontSize` | Most charts |
| `lineStyles` | `strokeWidth`, `lineChartType` | Line, area, combo |
| `dataPoint` | `fillTransparency` | Most charts |
</details>

> Hex colors starting with `#` are automatically wrapped in PBIR format.

---

## Themes & Conditional Formatting

### Report-Level Theme

```json
{
  "name": "Corporate Brand",
  "dataColors": ["#0078D4", "#00BCF2", "#00B294", "#FF8C00", "#E81123"],
  "background": "#FFFFFF",
  "foreground": "#1F3864",
  "tableAccent": "#0078D4"
}
```

### Gradient Conditional Format

```json
{
  "formatType": "gradient",
  "entity": "Sales", "property2": "Revenue", "isMeasure": true,
  "minColor": "#FF6B6B", "midColor": "#FFD93D", "maxColor": "#6BCB77"
}
```

### Page Themes (presets)

`dark` · `light` · `corporate` · `blue-purple`

---

## Filters

```json
// Categorical — include specific values
{ "filterType": "categorical", "entity": "Store", "property": "Region", "values": ["East", "West"] }

// TopN — top 10 products (visual-level only)
{ "filterType": "topN", "entity": "Product", "property": "Name", "n": 10,
  "topNDirection": "Top", "orderByEntity": "Sales", "orderByProperty": "Revenue",
  "orderByIsMeasure": true, "visualId": "xyz" }

// Relative date — last 12 months
{ "filterType": "relativeDate", "entity": "Date", "property": "Date",
  "period": "months", "count": 12, "dateDirection": "last" }
```

---

## Architecture

```
powerbi-report-mcp/
├── src/
│   ├── index.ts              # Server entry, smart tool loading, safe() wrapper
│   ├── pbir.ts               # PbirProject — PBIR file I/O abstraction
│   ├── context.ts            # ServerContext interface
│   ├── tools/
│   │   ├── report.ts         # Page & report management (19 tools)
│   │   ├── visuals.ts        # Visual CRUD (8 tools)
│   │   ├── format.ts         # Formatting, sort & colors (6 tools)
│   │   ├── bindings.ts       # Data binding (1 tool)
│   │   ├── themes.ts         # Report themes (6 tools)
│   │   ├── filters.ts        # Page/visual filters (4 tools)
│   │   └── bulk.ts           # Bulk operations (3 tools)
│   └── helpers/
│       ├── createVisual.ts   # Visual creation engine
│       ├── formatting.ts     # PBIR formatting builder
│       └── defaults.ts       # Theme presets
├── dist/                     # Compiled JS (committed for no-build deploy)
├── pbi report/               # Sample report (financials model)
├── docs/                     # Guides and references
└── skills/                   # LLM skill documents
```

> Full details: **[ARCHITECTURE.md](ARCHITECTURE.md)**

### Data Flow

```mermaid
sequenceDiagram
    actor User
    participant AI as AI Assistant
    participant Model as powerbi-modeling-mcp
    participant Report as powerbi-report-mcp
    participant PBI as Power BI Desktop

    User->>AI: "Create a sales dashboard with KPIs and a chart by country"
    AI->>Model: What measures are on the Sales table?
    Model-->>AI: Net Revenue, Net Profit, Margin %, Orders, Units Sold
    AI->>Report: create_page("Sales Dashboard")
    Report-->>AI: pageId: abc123
    AI->>Report: add_visual(batch: 6 cards + 2 charts + table)
    Report-->>AI: 9 visuals created
    AI->>Report: set_report_theme({ dataColors: [...] })
    Report-->>AI: theme applied
    AI-->>User: Done! Open .pbip in Power BI Desktop
    User->>PBI: Ctrl+Shift+F5
```

---

## PBIR Folder Structure

```
MyProject.Report/
  definition/
    report.json                 # Report settings, theme config
    pages/
      pages.json                # Page order and active page
      {pageId}/
        page.json               # Page name, size, visibility
        visuals/
          {visualId}/
            visual.json         # Type, position, bindings, formatting
  StaticResources/
    RegisteredResources/        # Custom theme JSON files
  definition.pbir               # Semantic model reference
```

---

## Token Efficiency

| Mode | Tools Loaded | Tokens/Turn | Cost per 10-Page Report |
|------|-------------|-------------|------------------------|
| **Default** | 10 | ~2,900 | $0.01 – $0.45 |
| **All** | 47 | ~14,000 | $0.02 – $2.50 |

<details>
<summary><b>Detailed API cost breakdown (April 2026 pricing)</b></summary>

| Model | Input $/1M | Output $/1M | Base Report | Fully Styled |
|-------|-----------|-------------|-------------|--------------|
| GPT-4o-mini | $0.15 | $0.60 | **$0.01** | $0.02 |
| GPT-4.1-mini | $0.40 | $1.60 | **$0.02** | $0.05 |
| GPT-4.1 | $2.00 | $8.00 | **$0.11** | $0.25 |
| GPT-4o | $2.50 | $10.00 | **$0.14** | $0.32 |
| Claude Haiku 3.5 | $0.80 | $4.00 | **$0.05** | $0.12 |
| Claude Sonnet 4 | $3.00 | $15.00 | **$0.19** | $0.45 |
| Claude Opus 4 | $15.00 | $75.00 | **$0.96** | $2.25 |
</details>

<details>
<summary><b>Batch vs naive efficiency</b></summary>

| Approach | Calls | Tokens |
|----------|-------|--------|
| Batch + bulk (recommended) | 22–32 | ~28–32K |
| Per-visual calls (naive) | 300+ | ~120K |

Use `add_visual` batch mode + inline `title`, `dataColors`, `containerFormat` to build fully styled pages in minimal calls.
</details>

---

## Compatible Clients

| Client | Support | Config |
|--------|---------|--------|
| **Claude Desktop** | Native | `claude_desktop_config.json` |
| **Claude Code** | Native | `claude mcp add` |
| **GitHub Copilot** | VS Code agent mode | `.vscode/mcp.json` |
| **Cursor** | Native | `~/.cursor/mcp.json` |
| **Windsurf** | Native | MCP settings |
| **Continue.dev** | Native | `~/.continue/config.json` |
| **Cline** | Native | VS Code settings |
| **OpenAI ChatGPT** | Via MCP bridge | `mcp-proxy` |
| **Custom agents** | `@modelcontextprotocol/sdk` | Programmatic |

---

## Documentation

| Doc | Description |
|-----|-------------|
| **[docs/quickstart.md](docs/quickstart.md)** | 5-minute setup guide |
| **[docs/example-prompts.md](docs/example-prompts.md)** | 15 example prompts |
| **[docs/visual-types.md](docs/visual-types.md)** | Visual type reference + formatting containers per type |
| **[docs/wireframes.md](docs/wireframes.md)** | Layout guide — zones, spacing, 3 sample layouts with exact positions |
| **[docs/pbir-gotchas.md](docs/pbir-gotchas.md)** | PBIR schema discoveries |
| **[ARCHITECTURE.md](ARCHITECTURE.md)** | Codebase architecture |
| **[CONTRIBUTING.md](CONTRIBUTING.md)** | How to contribute |
| **[CHANGELOG.md](CHANGELOG.md)** | Version history |

---

## Known Issues

| Feature | Status | Notes |
|---------|--------|-------|
| Visual calculations | Disabled | Correct PBIR format identified but not rendering programmatically |
| Bookmarks | Disabled | Tools in code but not registered |

---

## Tips

- Pair with **[powerbi-modeling-mcp](https://github.com/nicholasgma/powerbi-modeling-mcp)** to query the semantic model for exact table/column names before binding
- Use `Table[Column]` shorthand in bindings: `"field": "Sales[Revenue]"`
- `barChart` = stacked bar, `clusteredBarChart` = clustered — there is no `stackedBarChart`
- Add shapes **before** data visuals for correct z-order layering
- `format_visual` merges with existing formatting — safe to call incrementally
- TopN filters are **visual-level only** — pass `visualId` to `add_page_filter`
- All tools return `{ success: false, error: "..." }` on failure — the server never crashes

---

## License

[MIT](LICENSE) — use it however you want.

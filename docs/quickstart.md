# 5-Minute Quickstart

Go from zero to a working Power BI report page in 5 minutes using an AI assistant and the powerbi-report-mcp server.

---

## Prerequisites

- **Node.js 18+** installed
- **Power BI Desktop** (April 2025 or later) with PBIR format enabled:
  File > Options > Preview features > **Store reports using PBIR format**
- **An MCP-compatible client** -- Claude Desktop, Claude Code, Cursor, Cline, GitHub Copilot, or any other MCP client

---

## Step 1: Clone and Build (1 min)

```bash
git clone https://github.com/user/powerbi-report-mcp.git
cd powerbi-report-mcp
npm install
npm run build
```

**Alternative -- deploy without building:** The `dist/` folder is committed to the repo, so you can skip the build step. Just clone and install dependencies:

```bash
npm install
node dist/index.js
```

---

## Step 2: Configure Your MCP Client (1 min)

Add the server to your MCP client config. Replace `C:\\path\\to` with the actual path to your cloned repo.

### Claude Desktop

Config file: `%LOCALAPPDATA%\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Roaming\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "powerbi-report-mcp": {
      "command": "node",
      "args": [
        "C:\\path\\to\\powerbi-report-mcp\\dist\\index.js",
        "C:\\path\\to\\pbi report\\training.Report"
      ]
    }
  }
}
```

### Claude Code

```bash
claude mcp add powerbi-report-mcp -- node "C:\path\to\powerbi-report-mcp\dist\index.js" "C:\path\to\pbi report\training.Report"
```

### Cursor

Config file: `~/.cursor/mcp.json` or `.cursor/mcp.json` in your project root.

```json
{
  "mcpServers": {
    "powerbi-report-mcp": {
      "command": "node",
      "args": [
        "C:\\path\\to\\powerbi-report-mcp\\dist\\index.js",
        "C:\\path\\to\\pbi report\\training.Report"
      ]
    }
  }
}
```

### Load all tools at startup (optional)

By default, only 10 core tools are loaded to keep token overhead low (~2,900 tokens). To load all 42 tools at startup, add an `env` block:

```json
{
  "mcpServers": {
    "powerbi-report-mcp": {
      "command": "node",
      "args": [
        "C:\\path\\to\\powerbi-report-mcp\\dist\\index.js",
        "C:\\path\\to\\pbi report\\training.Report"
      ],
      "env": { "MCP_TOOLS": "all" }
    }
  }
}
```

The second argument (the report path) is optional. You can omit it and connect at runtime instead (see Step 3).

**Restart your MCP client** after saving the config.

---

## Step 3: Connect to the Sample Report (30 sec)

The repo includes a sample report at `pbi report/training.Report` with a `financials` table containing: Country, Segment, Product, Units Sold, Gross Sales, Profit, Date, Month Number, Month Name, Year.

If you set the report path in config (Step 2), you are already connected. Verify by asking:

> List pages

If you did not set a path in config, connect at runtime:

> Connect to C:\path\to\pbi report\training.Report

You should see a list of existing pages in the report.

---

## Step 4: Create a Page and Add Visuals (2 min)

Ask your AI assistant to build an entire page in one shot:

> Create a page called "Sales Overview" with a dark blue banner titled "Sales Overview" in white bold text, 3 KPI cards for Sum of Gross Sales, Sum of Profit, and Sum of Units Sold, and a clustered bar chart showing Gross Sales by Country.

Behind the scenes, this triggers two tool calls:

1. `create_page` -- creates a 1280x720 page named "Sales Overview"
2. `add_visual` (batch mode) -- creates all 5 visuals in a single call:
   - A `shape` rectangle banner (dark blue background, white bold title text)
   - Three `card` visuals bound to `financials[Gross Sales]`, `financials[Profit]`, and `financials[Units Sold]` (all with Sum aggregation)
   - A `clusteredBarChart` with Category = `financials[Country]` and Y = `financials[Gross Sales]` (Sum)

**Expected result:** A page with 5 visuals -- a banner across the top, three KPI cards in a row below it, and a bar chart underneath.

---

## Step 5: Preview in Power BI Desktop (30 sec)

1. Open the `.pbip` file (in the parent folder of the `.Report` folder) in Power BI Desktop
2. If Power BI Desktop is already open with the report, press **Ctrl+Shift+F5** to refresh and pick up the changes
3. Navigate to the "Sales Overview" page

You should see the banner, three KPI cards with aggregated values, and a bar chart breaking down Gross Sales by Country.

---

## What's Next?

- **More prompts:** See [example-prompts.md](example-prompts.md) for a full library of prompts covering charts, formatting, conditional formatting, filters, theming, and multi-page reports.
- **Full tool reference:** See the [README](../README.md) for all 42 tools, formatting options, and supported visual types.
- **Smart tool loading:** By default, 10 core tools are loaded. Use `load_tools` mid-session to activate additional tools (filters, themes, conditional formatting, etc.) on demand without restarting.
- **Semantic model queries:** Pair with [powerbi-modeling-mcp](https://github.com/user/powerbi-modeling-mcp) to query your data model, inspect tables and columns, and write DAX -- all from the same AI conversation.

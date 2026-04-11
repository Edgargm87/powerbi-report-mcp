<!-- doc-version: 1.1 | Last updated: 2026-04-11 -->
# Contributing to powerbi-report-mcp

Thanks for your interest in contributing to the Power BI Report MCP server. This guide covers everything you need to get started, add features, and test your changes.

---

## 1. Getting Started

### Prerequisites

- **Node.js 18+** and **npm**
- **Power BI Desktop** with PBIR format enabled (File > Options > Preview features > enable "Power BI Report format (PBIR)")
- A `.pbip` project with a `.Report` folder to test against

### Setup

```bash
git clone <repo-url>
cd powerbi-report-mcp
npm install
npm run build
```

The `build` script runs `tsc` and prepends a shebang line to `dist/index.js` so it can run as a CLI tool.

---

## 2. Dev Setup

### Running the server locally

```bash
npm run build
npm start -- "C:/path/to/your/project.Report"
```

Or for development with `ts-node`:

```bash
npm run dev -- "C:/path/to/your/project.Report"
```

The server communicates over stdio using the MCP protocol. You do not interact with it directly in a terminal -- it needs an MCP client.

### MCP client configuration

Add the server to your MCP client config (e.g., Claude Desktop, Claude Code `settings.json`):

```json
{
  "mcpServers": {
    "powerbi-report-mcp": {
      "command": "node",
      "args": ["C:/path/to/powerbi-report-mcp/dist/index.js", "C:/path/to/your/project.Report"]
    }
  }
}
```

To load all tools at startup instead of just the default set, add an `env` key:

```json
{
  "env": { "MCP_TOOLS": "all" }
}
```

### Testing changes

The workflow is: edit source, rebuild, restart MCP client.

1. Make your code changes in `src/`.
2. Run `npm run build`.
3. Restart your MCP client (or reconnect the server) so it picks up the new build.
4. Test the tool against a real Power BI report.

---

## 3. Project Structure

```
src/
  index.ts              # Server setup, tool loading modes, safe() wrapper, main()
  context.ts            # ServerContext interface shared by all tool modules
  pbir.ts               # PbirProject class — reads/writes PBIR JSON files on disk
  model-usage.ts        # Model usage analysis — cross-references model ↔ report
  usage-cli.ts          # Standalone CLI for model usage (one-shot + watch mode)
  tools/
    report.ts           # Page and report management tools
    visuals.ts          # Visual CRUD tools (add, delete, move, duplicate, etc.)
    format.ts           # Formatting and conditional formatting tools
    bindings.ts         # Data binding tools
    themes.ts           # Theme management tools
    filters.ts          # Page and visual filter tools
    bulk.ts             # Bulk operations (bind, format, delete)
    bookmarks.ts        # Bookmark tools (parked)
    calculations.ts     # Visual calculation tools (parked)
  helpers/
    createVisual.ts     # Visual creation logic, field parsing, Zod schemas
    formatting.ts       # Formatting property builders
    defaults.ts         # Theme presets (dark, light, corporate, blue-purple)
```

For a deeper dive into architecture and data flow, see `ARCHITECTURE.md`.

---

## 4. How to Add a New Tool

### Step 1: Write the tool

Create a new file in `src/tools/` or add to an existing one. Each tool file exports a register function:

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ServerContext } from "../context.js";

export function registerMyTools(server: McpServer, ctx: ServerContext): void {
  server.tool(
    "my_tool_name",
    "Short description of what this tool does.",
    {
      // Zod schema for parameters
      pageId: z.string().describe("The page ID"),
      slim: z.boolean().optional().default(true).describe("Slim mode"),
    },
    async ({ pageId, slim }) => {
      // Use ctx.project to read/write PBIR data
      const page = ctx.project.getPage(pageId);
      return {
        content: [{ type: "text", text: JSON.stringify({ success: true, page }) }],
      };
    }
  );
}
```

Key patterns to follow:

- **`server.tool(name, description, zodSchema, handler)`** -- all four arguments required.
- The `safe()` wrapper is applied automatically by the patched `server.tool` in `index.ts` -- you do not need to wrap your handler manually.
- Use **`z.preprocess`** for array parameters that MCP clients may serialize as JSON strings:
  ```typescript
  bindings: z.preprocess(
    (v) => (typeof v === "string" ? JSON.parse(v) : v),
    z.array(BindingSchema)
  )
  ```
- Use **`z.coerce.boolean()`** for boolean params that may arrive as strings.
- Return `{ content: [{ type: "text", text: JSON.stringify(...) }] }` for all responses.

### Step 2: Register in index.ts

Import your register function and call it alongside the others:

```typescript
import { registerMyTools } from "./tools/myfile.js";

// In main(), after the other register calls:
registerMyTools(server, ctx);
```

### Step 3: Add to the tool catalog

Add your tool to the `ALL_TOOLS` record in `index.ts` with a short description:

```typescript
const ALL_TOOLS: Record<string, string> = {
  // ... existing tools ...
  my_tool_name: "Short description for the load_tools listing",
};
```

### Step 4: Decide on default vs. on-demand

Tools in the `DEFAULT_TOOLS` set are loaded at startup. On-demand tools are available via `load_tools`.

**Criteria for default:** the tool is used in more than 50% of typical sessions. The current defaults are the core workflow tools (connect, list, create, add, format, bind, theme).

If your tool is specialized (e.g., filters, conditional formatting, bookmarks), leave it as on-demand. Add it to `DEFAULT_TOOLS` only if it becomes part of the standard workflow.

### Step 5: Update documentation

- Add the tool to the tool reference table in `README.md`.
- If the tool introduces a new concept, consider adding a skill file in `skills/`.

---

## 5. Testing Process

There is no automated test suite. All testing is manual UAT (User Acceptance Testing) against a real Power BI report.

### How to run tests

1. Connect to a test report using `set_report`.
2. Create a dedicated test page (e.g., `create_page` with a name like "Test-YourFeature").
3. Exercise your tool with representative inputs.
4. Open the report in Power BI Desktop -- save and reload to verify the PBIR JSON is valid.
5. Clean up: delete test pages when done.

### Documenting results

Record your test results in `tests.md` following the existing format:

- A results table with columns: `#`, `Tool(s)`, `Input / Target`, `Result`, `Notes`.
- A bugs table if you found and fixed issues during testing.
- Observations section for anything noteworthy.

See the existing UAT rounds in `tests.md` for examples. Each round is dated and lists the pages under test, results, and any bugs found.

---

## 6. QA Expectations

Before submitting a change, verify these:

- **PBI Desktop round-trip**: Save the report, close PBI Desktop, reopen the `.pbip` file. The report must load without errors. If PBI Desktop shows a schema error or blank page, the PBIR JSON is invalid.
- **PBIR schema compliance**: Check that generated JSON matches the structure PBI Desktop writes. When in doubt, apply the same change manually in PBI Desktop, save, and read back the JSON it wrote.
- **Slim mode responses**: If your tool returns data, include a `slim` parameter (default `true`) that returns only essential fields. Full PBIR JSON can be 500-800 tokens per visual -- slim responses should aim for under 100.
- **Error cases**: Test with missing pages, invalid IDs, disconnected reports. Handlers should return `{ success: false, error: "..." }` rather than crashing the server.
- **Array/boolean serialization**: MCP clients sometimes send arrays as JSON strings and booleans as `"true"`/`"false"`. Use `z.preprocess` and `z.coerce` to handle this.

---

## 7. Code Style

- **TypeScript strict mode** is enabled (`"strict": true` in `tsconfig.json`). Do not bypass it.
- **Zod** for all parameter validation. Every tool parameter gets a Zod schema with `.describe()`.
- **`safe()` wrapper**: Applied automatically to all tool handlers via the patched `server.tool` in `index.ts`. It catches exceptions and returns `isError` responses instead of crashing.
- **`z.preprocess`** for any array parameter -- MCP clients may serialize arrays as JSON strings.
- **`z.coerce.boolean()`** for boolean parameters that may arrive as strings.
- **ES2022** target, **Node16** module resolution.
- Keep tool descriptions concise -- they are included in every MCP session and consume tokens.

---

## 8. PBIR Gotchas

Power BI's PBIR format has many undocumented behaviors and naming conventions that are not obvious. See `docs/pbir-gotchas.md` for a collection of known pitfalls.

The single most important rule: **Power BI Desktop is the authority on valid PBIR JSON.** If you are unsure about the correct structure for something:

1. Do it manually in Power BI Desktop.
2. Save the report.
3. Read the JSON files it wrote.
4. Match that structure exactly in your code.

This "apply manually, read back JSON" method has been the most reliable way to discover correct formats throughout this project (see B04, B07, B08, B09, B12, B13 in `tests.md` for examples).

---

## 9. Commit and PR Guidelines

### Commit messages

Follow conventional commit style, consistent with the format used in `CHANGELOG.md`:

```
fix: set_datapoint_colors uses fillTransparency instead of transparency (B13)
feat: add duplicate_page tool with cross-page visual copy
refactor: extract field parsing into helpers/createVisual.ts
```

### What to include

- Describe **what** changed and **why**.
- Reference bug IDs (B01, B02, etc.) if fixing a known issue.
- Include test results: which UAT tests you ran, pass/fail, any new bugs found.
- If you changed PBIR output, note whether you verified the round-trip with PBI Desktop.

### PR description

- List the tools added or changed.
- Summarize any PBIR format discoveries (these are valuable for the team).
- Note any new entries needed in `CHANGELOG.md`.

---

## 10. Known Parked Features

The following features are intentionally parked. Do not attempt to fix or re-enable them without reading the prior investigation in `tests.md` and `CHANGELOG.md`.

### Visual Calculations

Tools: `add_visual_calculation`, `list_visual_calculations`, `delete_visual_calculation`

Status: Code exists in `src/tools/calculations.ts` but is not registered. The correct PBIR JSON format was identified (`NativeVisualCalculation` projections in `queryState.Values.projections[]`), but calculations written via file edit do not render in PBI Desktop. This likely requires internal PBI Desktop state initialization that cannot be triggered through file manipulation alone. See B14 in `tests.md`.

### Bookmarks

Tools: `list_bookmarks`, `add_bookmark`, `rename_bookmark`, `delete_bookmark`

Status: Code exists in `src/tools/bookmarks.ts` but is not imported in `index.ts`. Bookmarks were registered in earlier versions but are not currently loaded in MCP sessions. The import line is commented out in `index.ts`.

If you want to investigate either of these, start by reading the relevant bug entries and UAT rounds in `tests.md` to understand what was already tried.

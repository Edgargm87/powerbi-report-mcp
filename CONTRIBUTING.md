<!-- doc-version: 1.4 | Last updated: 2026-04-15 -->
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
npm run hooks:install    # enable pre-commit audit + validator gates
```

The `build` script runs `tsc` and prepends a shebang line to `dist/index.js` so it can run as a CLI tool.

`hooks:install` points `core.hooksPath` at the `.githooks/` directory in the repo so every commit runs the skill-coverage audit and the wireframe-validator suite. See [section 6](#6-qa-expectations) for what the gates enforce.

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
    bookmarks.ts        # Bookmark CRUD tools
    guide.ts            # Knowledge layer (svg-visuals, report-design topics)
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

Tools are loaded into two tiers:

- **Default (loaded at startup)**: the 12 core workflow tools. Listed in `src/default-tools.ts` — this file is the **single source of truth** for the default set and is read by both the runtime (`src/index.ts`) and the skill-coverage audit (`scripts/audit-skill-coverage.js`).
- **On-demand (activated via `load_tools`)**: everything else. Not counted against session schema overhead unless activated.

**Criteria for default:** the tool is used in more than 50% of typical sessions and is part of the happy-path workflow (connect → orient → create page → add visuals → format → bind → theme → reload). Specialized tools (filters, conditional formatting, bookmarks, theme audit, etc.) stay on-demand.

To promote a tool to default, add its name to the exported `DEFAULT_TOOLS` set in `src/default-tools.ts`. Don't duplicate the list anywhere else.

### Step 5: Update documentation (MANDATORY — enforced by CI)

Every registered tool **must** have a backtick-wrapped mention (`` `tool_name` ``) in at least one `skills/*.md` file. The `scripts/audit-skill-coverage.js --strict` gate fails the pre-commit hook and CI if any tool has zero coverage.

- **Default tools**: the mention should be meaningful — a parameter table, an example call, or a workflow snippet. Default tools are in every session; their skill doc is the LLM's primary reference.
- **On-demand tools**: a single example call with the key parameters is usually enough.
- New concept? Add a new `skills/<topic>.md` file. The `guide` tool discovers topics live from disk — no code change needed.
- Add the tool to the tool reference table in `README.md`.

Run `npm run audit` locally to see which tools are covered and by which skill files. The audit now tags default tools with `[DEFAULT]` in its output.

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

### Automated gates (run on every commit + in CI)

These are enforced by the pre-commit hook (`npm run hooks:install`) and by `.github/workflows/ci.yml`. Both must pass or the commit / PR is blocked:

| Gate | Command | What it checks |
|---|---|---|
| Build | `npm run build` | TypeScript compiles cleanly (strict mode) |
| Skill coverage | `npm run audit:strict` | Every registered tool has a backtick mention in at least one `skills/*.md` file. Breaks out default vs on-demand tiers. Exits 1 on any miss. |
| Wireframe validator | `npm run test:wireframe` | All 5 canonical layouts (A–E) still pass validation; all 8 negative cases still fail as expected. 13/13 required. |
| Binding validator | `npm run test:binding` | 25 assertions for the field-reference validator (table lookup, type mismatch, parse errors, suggestions, mode resolution). |

Run all four in one shot with `npm run test:all`.

### `scripts/` folder structure

| Path | Purpose | Runs in CI? |
|---|---|---|
| `scripts/audit-skill-coverage.js` | Skill coverage audit | ✅ yes |
| `scripts/test-wireframe-validator.js` | Wireframe validator test suite | ✅ yes |
| `scripts/test-binding-validator.js` | Binding validator test suite | ✅ yes |
| `scripts/install-hooks.js` | Git hooks installer | manual |
| `scripts/test-skill-layouts.js` | Skill doc layout harness | manual |
| `scripts/dev-only/` | **Dev-only helper scripts** (Python). No runtime or CI dependency — these were used to generate test fixtures and are inert to everything in `src/` and `dist/`. |

If a pre-commit gate fails and you genuinely need to skip it for an emergency, use `git commit --no-verify` — but CI runs the same gates on the push, so a broken commit won't survive the PR.

**First time seeing a red ✗ on a commit or PR?** See [`docs/ci-checks.md`](docs/ci-checks.md) for a walkthrough of how the GitHub Actions check system works — trigger chain, how to read the job view, how to find the failing step, and how to reproduce the failure locally. It's written for contributors who've never set up a CI workflow before.

### Manual QA (unchanged — no automation replaces PBI Desktop round-trip)

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

If you want to investigate visual calculations, start by reading the relevant bug entries and UAT rounds in `tests.md` to understand what was already tried.

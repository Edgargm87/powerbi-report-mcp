# MCP Client Configs

Ready-to-use config files for each AI client. Copy the one you need, update the path, and you're connected.

> Both servers are included: **powerbi-report-mcp** (this repo) and **powerbi-modeling-mcp** (semantic model). Remove the modeling entry if you don't need it.

## Setup

**1. Update the paths** in your chosen config file:
- Replace `C:\\path\\to\\powerbi-report-mcp` with the actual report-mcp install location
- Replace `C:\\path\\to\\powerbi-modeling-mcp` with the actual modeling-mcp install location (the VS Code extension installs to `%USERPROFILE%\.vscode\extensions\analysis-services.powerbi-modeling-mcp-*\`)

**2. Copy to the right location:**

| File | Client | Copy to |
|------|--------|---------|
| `claude-desktop.json` | Claude Desktop | `%LOCALAPPDATA%\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Roaming\Claude\claude_desktop_config.json` |
| `cursor.json` | Cursor | `~/.cursor/mcp.json` |
| `vscode-copilot.json` | GitHub Copilot | `.vscode/mcp.json` (in your project root) |
| `windsurf.json` | Windsurf | `~/.windsurf/mcp.json` |
| `continue-dev.json` | Continue.dev | `~/.continue/config.json` (merge into `mcpServers`) |
| `cline.json` | Cline | VS Code Settings → Cline MCP Servers |

**3. Claude Code** (CLI — no config file needed):

```bash
claude mcp add powerbi-report-mcp node C:\path\to\powerbi-report-mcp\dist\index.js
claude mcp add powerbi-modeling-mcp C:\path\to\powerbi-modeling-mcp\server\powerbi-modeling-mcp.exe
```

## Optional: Pre-connect to a report

Add the report path as a second argument to skip the `set_report` step:

```json
"args": ["C:\\path\\to\\powerbi-report-mcp\\dist\\index.js", "C:\\path\\to\\MyReport.Report"]
```

## Optional: Load all tools at startup

Add an `env` block to load all 54 tools instead of the default 11:

```json
"powerbi-report-mcp": {
  "command": "node",
  "args": ["C:\\path\\to\\powerbi-report-mcp\\dist\\index.js"],
  "env": { "MCP_TOOLS": "all" }
}
```

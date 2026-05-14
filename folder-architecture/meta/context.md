# Meta Context

## When this folder is loaded

Load this room at session start (orient yourself + activate on-demand tools)
and any time you need to look up domain knowledge or visualType catalogs.

## Tools in this room

- `pbir_guide` — Fetch a topic from `knowledge/` (the 17 skills)
- `pbir_load_tools` — List or activate on-demand tools
- `pbir_get_visual_types` — Catalog of valid visualTypes (slim by default)

## Pipeline / ordering

Session start:

1. `pbir_load_tools()` (no args) to see what's available beyond the 13 defaults
2. `pbir_load_tools(tools:[...])` to activate the ones you need
3. `pbir_guide('elicitation')` / `pbir_guide('wireframes')` / `pbir_guide('report-design')` for orientation

## Cross-references

- `pbir_guide` reads from `knowledge/*.md` directly (mirrored from `skills/*.md`)
- `pbir_load_tools` controls which tools in the other rooms are even callable
- `pbir_get_visual_types` populates the `visualType` field for `pbir_add_visual`

## Gotchas

- **`pbir_load_tools` may not refresh in every client** — some LLM harnesses
  snapshot the tool catalog at startup. If activated tools don't appear, set
  `MCP_TOOLS=all` in the server config to skip lazy-loading.
- **`pbir_guide` topics are discovered live** from `skills/*.md` on disk —
  prose edits don't need a server restart. Files starting with `_` (like
  `_overview.md`) are meta and excluded from the public topic list.
- **`pbir_get_visual_types(verbose:true)` is heavy** (~1,200 tokens) — slim
  returns just `{types[], count}` (~150 tokens).

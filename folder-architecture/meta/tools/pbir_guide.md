# pbir_guide

> Domain knowledge for Power BI report development. Topics discovered live from `skills/*.md` — call with `topic:'list'` to enumerate.

## Inputs

| Param | Type | Required | Description |
|-------|------|:--------:|-------------|
| topic | string | yes | Topic key (or `list` / `topics` to enumerate) |

Topic keys are lowercased + space → dash normalized.

## Output (list)

```jsonc
{ "success": true, "topics": ["calculations","elicitation","errors","filters","formatting","pages",...] }
```

## Output (topic)

```text
<full markdown body of skills/<topic>.md>
```

## Behavior

- `readOnlyHint: true`
- Path-traversal guard: only `/^[a-zA-Z0-9_-]+$/` topic keys accepted
- Strips leading HTML comments (doc-version, summary) before serving
- Files starting with `_` are hidden from the public list (e.g. `_overview.md`
  → served as the `pbir-instructions` MCP resource instead)

## Categorization note

Lives in `src/tools/guide.ts`. Filed under `meta/` because it's the orient-by-topic
entry point, not a tool that mutates a report.

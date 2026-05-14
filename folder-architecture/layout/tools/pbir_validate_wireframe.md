# pbir_validate_wireframe

> Validate a page's (or the whole report's) layout against the wireframe rules — margins, gaps, overlap, off-canvas, banner geometry. Returns errors + warnings per visual plus stats (visual count, coverage, bottom edge). Read-only. Pair with `pbir_audit_theme_compliance` for full project verification.

## Inputs

| Param | Type | Required | Default | Description |
|-------|------|:--------:|:-------:|-------------|
| pageId | string | no (auto-resolved when scope:`page`) | — | Ignored when scope:`report` |
| scope | enum `page` \| `report` | no | `page` | |

## Output (scope:page)

```jsonc
{
  "scope": "page",
  "pageId": "...",
  "displayName": "...",
  "report": { "stats": {...}, "errors": [...], "warnings": [...] }
}
```

## Output (scope:report)

```jsonc
{
  "scope": "report",
  "pages": [ { "pageId":"...", "displayName":"...", "report": {...} } ],
  "reportSummary": { "totalErrors": N, "totalWarnings": M, "pagesWithErrors": K, "pageCount": P }
}
```

## Behavior

- `readOnlyHint: true`
- Returns `fail("page_not_found", {availableIds, hint})` on bad pageId — clean
  envelope, not a JSON-RPC -32602.
- Runs `validateWireframe()` against the geometric rule set in
  `src/wireframe-validator.ts`.

## What's NOT replicable in markdown

The rule set: margin checks, gap checks, overlap detection (rectangle
intersection), off-canvas detection, banner-geometry rules. Each is a small
function but collectively they're the layout contract — markdown can describe
the rules but only code can apply them to coordinate data.

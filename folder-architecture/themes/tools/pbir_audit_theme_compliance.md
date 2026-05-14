# pbir_audit_theme_compliance

> Audit visuals on a page for theme overrides. Returns summary header + topN findings (default 20). `topN:0` = all.

## Inputs

| Param | Type | Required | Default | Description |
|-------|------|:--------:|:-------:|-------------|
| pageId | string | yes | — | |
| verbose | boolean | no | false | Include override category names per visual |
| topN | number | no | 20 | Max findings (`0` = all) |

## Output

```jsonc
{
  "success": true,
  "pageId": "...",
  "totalVisuals": N,
  "compliantVisuals": M,
  "overrideVisuals": K,
  "totalFindings": K,
  "categoriesAffected": C,
  "byCode": { "background": 3, "labels": 2 },
  "summary": [ { "visualId":"...", "type":"...", "title":"...", "overrides":["background","labels"] } ]
  // OR "details" when verbose:true
}
```

## Behavior

- `readOnlyHint: true`
- Ignores `data`/`selection`/`general` (slicer/textbox internal config) on objects
- Ignores `title` on container (commonly per-visual; not drift)
- Rolls up to `byCode` for quick scanning

## Gotchas

- `title` overrides on container are intentionally excluded — almost every
  visual sets a title. If you genuinely want title drift, inspect with
  `pbir_get_visual(verbose:true)`.

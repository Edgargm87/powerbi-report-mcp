# pbir_set_visual_interaction

> Set cross-filter interaction (`Filter` / `Highlight` / `NoFilter`) from a source visual to a target visual.

## Inputs

| Param | Type | Required | Description |
|-------|------|:--------:|-------------|
| pageId | string | yes | |
| source | string | yes | Source visual ID |
| target | string | yes | Target visual ID |
| type | enum `Filter` \| `Highlight` \| `NoFilter` | yes | |

## Output

```jsonc
{ "success": true, "pageId":"...", "source":"...", "target":"...", "interactionType":"Filter" }
```

## Behavior

- `idempotentHint: true`
- Upserts into `page.visualInteractions[]` matched on `(source, target)`
- Invalidates: `page:<id>`

## Categorization note

Lives in `report.ts` but operates per-page on a `source`/`target` visual pair —
filed under `visuals/` here. Could equally live in `filters/`.

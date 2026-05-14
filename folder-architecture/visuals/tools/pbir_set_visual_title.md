# pbir_set_visual_title

> Set or update the title of a visual. Can set text, visibility, font, size, alignment.

## Inputs

| Param | Type | Required | Description |
|-------|------|:--------:|-------------|
| pageId | string | no (auto-resolved) | |
| visualId | string | yes | |
| title | string | no | |
| show | boolean | no | |
| fontSize | number | no | |
| fontFamily | string | no | PBI font stack |
| alignment | enum `left` \| `center` \| `right` | no | |
| titleWrap | boolean | no | |

## Output

```jsonc
{ "success": true, "pageId": "...", "visualId": "...", "title": "...", "show": true }
```

## Behavior

- `idempotentHint: true`
- Merges into existing `visualContainerObjects.title[0].properties`
- Writes PBIR literal expressions (`{ expr: { Literal: { Value: ... } } }`)
- Invalidates: `page:<id>`

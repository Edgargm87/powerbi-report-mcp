# pbir_set_page_visibility

> Show or hide a page in the navigation pane. Hidden pages still work for drillthrough.

## Inputs

| Param | Type | Required | Description |
|-------|------|:--------:|-------------|
| pageId | string | no (auto-resolved) | Page ID |
| hidden | boolean | yes | Coerced from string `"true"`/`"false"` |

## Output

```jsonc
{ "success": true, "pageId": "...", "hidden": true }
```

## Behavior

- `idempotentHint: true`
- Sets `page.visibility = "HiddenInViewMode"` when hidden:true, deletes it when false
- Invalidates: `pages`, `page:<id>`

## Gotchas

- Hidden pages still execute drillthrough and bookmark navigation; only the
  page tab is suppressed.

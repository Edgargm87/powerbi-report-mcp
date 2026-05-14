# pbir_update_page_size

> Update the page dimensions.

## Inputs

| Param | Type | Required | Description |
|-------|------|:--------:|-------------|
| pageId | string | no (auto-resolved) | |
| width | number | no | |
| height | number | no | |
| displayOption | enum `FitToPage` \| `FitToWidth` \| `ActualSize` | no | |

## Output

```jsonc
{ "success": true, "pageId": "...", "width": 1280, "height": 720 }
```

## Behavior

- Mutation: yes (partial — only provided fields update)
- Invalidates: `pages`, `page:<id>`

## Gotchas

- Standard canvas is 1280×720. Changing it invalidates layout-grid math that
  assumed those constants — re-run `pbir_validate_wireframe`.

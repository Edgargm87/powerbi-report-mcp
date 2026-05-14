# pbir_set_active_page

> Set which page is active (shown on open).

## Inputs

| Param | Type | Required | Description |
|-------|------|:--------:|-------------|
| pageId | string | no (auto-resolved when only one page) | Page ID |

## Output

```jsonc
{ "success": true, "activePageName": "..." }
```

## Behavior

- Mutation: yes
- `idempotentHint: true`
- Invalidates: `pages`

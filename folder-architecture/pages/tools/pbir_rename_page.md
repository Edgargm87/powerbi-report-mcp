# pbir_rename_page

> Rename an existing page.

## Inputs

| Param | Type | Required | Description |
|-------|------|:--------:|-------------|
| pageId | string | no (auto-resolved when only one page) | Page ID |
| displayName | string | yes | New display name |

## Output

```jsonc
{ "success": true, "pageId": "...", "displayName": "..." }
```

## Behavior

- Mutation: yes
- Read-only: no
- Invalidates: `pages`, `page:<id>`

## See also

- `../context.md`

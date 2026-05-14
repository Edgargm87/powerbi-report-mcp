# pbir_reorder_pages

> Set the page order.

## Inputs

| Param | Type | Required | Description |
|-------|------|:--------:|-------------|
| pageOrder | string[] | yes | Array of page IDs in desired order. Accepts JSON-stringified array. |

## Output

```jsonc
{ "success": true, "pageOrder": ["...", "..."] }
```

## Validation

`pageOrder` must be a **permutation** of the existing IDs — same length, same
set, no duplicates. Mismatch returns a `fail()` with `{existing, supplied}`
context BEFORE any write.

## Behavior

- Mutation: yes
- Idempotent if the order is already correct (no-op write)
- Invalidates: `pages`

## See also

- `../context.md`

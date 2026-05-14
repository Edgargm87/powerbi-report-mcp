# pbir_diff_report_theme

> Compare a proposed theme JSON against the currently applied theme and return what would be added, removed, or changed. Useful for previewing theme changes before applying.

## Inputs

| Param | Type | Required | Description |
|-------|------|:--------:|-------------|
| theme | object | yes | Proposed theme JSON to compare against the current theme |

## Output

```jsonc
{
  "currentTheme": "Name1700000000000.json" | "(none)",
  "summary": { "added": 1, "removed": 0, "changed": 2, "unchanged": 5 },
  "added": { /* keys present only in proposed */ },
  "removed": ["keysOnlyInCurrent"],
  "changed": { "key": { "from": "...", "to": "..." } }
}
```

## Behavior

- `readOnlyHint: true`
- JSON.stringify equality per top-level key — nested change detection isn't recursive

# pbir_add_page_filter

> Add a filter to a page or visual. Omit `visualId` for page-level. `topN` requires `visualId`. Types: `categorical` / `topN` / `relativeDate` / `advanced`.

## Inputs

| Param | Type | Required | Description |
|-------|------|:--------:|-------------|
| pageId | string | no (auto-resolved) | |
| visualId | string | conditionally | Required for topN |
| filterType | enum `categorical` \| `topN` \| `relativeDate` \| `advanced` | yes | |
| entity | string | yes | Table |
| property | string | yes | Column |
| values | string[] | categorical | |
| n | number | topN | |
| topNDirection | enum `Top` \| `Bottom` | no (default `Top`) | |
| orderByEntity | string | topN | |
| orderByProperty | string | topN | |
| orderByIsMeasure | boolean | no (default false) | |
| period | enum `days` \| `weeks` \| `months` \| `quarters` \| `years` | relativeDate | |
| count | number | relativeDate | |
| dateDirection | enum `last` \| `next` | no (default `last`) | |
| operator | string | advanced | `Equals/NotEquals/GreaterThan(OrEqual)/LessThan(OrEqual)/Contains/DoesNotContain/StartsWith/DoesNotStartWith/IsBlank/IsNotBlank` |
| value | string \| number | advanced (most operators) | |
| logicalOperator | enum `And` \| `Or` | no | Compound |
| operator2 | string | with logicalOperator | |
| value2 | string \| number | with logicalOperator | |

## Output

```jsonc
{ "success": true, "filterId":"...", "filterType":"categorical", "entity":"...", "property":"...", "scope":"page" | "visual" }
```

## Behavior

- Mutation: yes (appends to `filterConfig.filters[]`)
- Invalidates: `page:<id>`

## Validation

- `topN` without `visualId` → fail
- `topN` missing `n` / `orderByEntity` / `orderByProperty` → fail
- `advanced` missing `operator` → fail
- `relativeDate` missing `period` / `count` → fail

## What's NOT replicable in markdown

The PBIR filter JSON shapes (Subquery for topN, DateAdd/DateSpan trees for
relativeDate, Contains/Comparison/Not for advanced) are several hundred lines
of code in `filters.ts`. Markdown can describe input semantics but not generate
the output JSON.

# pbir_set_conditional_format

> Apply conditional formatting to a visual container background or title font. `formatType: rules / gradient / clear`. `ComparisonKind: 0=Eq, 1=GT, 2=GTE, 3=LT, 4=LTE, 5=NEq`.

## Inputs

| Param | Type | Required | Default | Description |
|-------|------|:--------:|:-------:|-------------|
| pageId | string | no (auto-resolved) | — | |
| visualId | string | yes | — | |
| property | enum `background` \| `title` | no | `background` | |
| formatType | enum `rules` \| `gradient` \| `clear` | yes | — | |
| entity | string | conditionally | — | Driving table |
| property2 | string | conditionally | — | Driving column/measure |
| isMeasure | boolean | no | true | |
| rules | `Rule[]` | conditionally (rules) | — | `{ comparisonKind, value, color }` ordered, first match wins |
| defaultColor | string (hex) | no | — | |
| minColor | string | conditionally (gradient) | — | |
| maxColor | string | conditionally (gradient) | — | |
| midColor | string | no | — | Optional 3-stop |

## Output

```jsonc
{ "success": true, "property":"background", "formatType":"rules", "entity":"...", "field":"..." }
```

## Behavior

- `clear`: deletes the property entry; no entity/property2 needed
- `rules`: writes a `Conditional.Cases[]` expression into `visualContainerObjects.{background|title}`
- `gradient`: writes a `FillRule.linearGradient2`/`linearGradient3` into `objects.values[]`
  (NOT visualContainerObjects — gradients live on the values selector)
- Invalidates: `page:<id>`

## Gotchas

- Columns require `Aggregation(Sum)` not raw `Column` projection in conditional expressions.
- `property: title` only changes title font color via `fontColor`; background uses `color`.

# pbir_get_visual_types

> List available visual types. Default returns slim type list (~150 tokens). Pass `verbose:true` for per-type data-role bucket metadata (~1,200 tokens).

## Inputs

| Param | Type | Required | Default | Description |
|-------|------|:--------:|:-------:|-------------|
| verbose | boolean | no | false | If true, return `{type: [buckets...]}` map |

## Output (slim)

```jsonc
{ "success": true, "types": ["barChart","card","slicer","tableEx","...","..."], "count": N }
```

## Output (verbose)

The full `VISUAL_BUCKETS` map keyed by visualType → bucket-name array.

## Behavior

- `readOnlyHint: true`
- Pure data from `VISUAL_BUCKETS` in `src/pbir.ts`

## Categorization note

Lives in `src/tools/visuals.ts` but is a discovery / catalog tool, not a
visual-CRUD tool. Filed under `meta/` here.

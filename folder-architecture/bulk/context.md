# Bulk Context

## When this folder is loaded

Load this room when you need to apply the same operation across many visuals
in one call: rebinding, deleting, or formatting. Skip when you're operating on
a small number — use the single-visual tools instead to keep responses small.

## Tools in this room

- `pbir_bulk_bind` — Rebind multiple visuals; supports `continueOnError`
- `pbir_bulk_delete_visuals` — Delete many visuals at once
- `pbir_bulk_update_format` — Apply the same FormatCategory payload to many visuals

## Pipeline / ordering

1. `pbir_list_visuals(visualType:'...')` to narrow scope before fanning out
2. `pbir_bulk_*` with `confirmBulk:true` when `>5` items
3. Inspect `errors[]` (and `perEntryBindingErrors[]` for bulk_bind) afterwards

## Cross-references

- Reads `knowledge/visuals.md` for binding semantics
- Reads `knowledge/formatting.md` for FormatCategory payload
- Reads `knowledge/themes-per-visual.md` to pick the right properties per type

## Safety gates (CODE-only, not replicable in markdown)

Two layers in every bulk tool:

1. **Soft gate** — `BULK_CONFIRM_THRESHOLD = 5`. `>5` items requires
   `confirmBulk: true`. Returns a structured `confirmBulkRequired:true`
   envelope when the LLM forgets.
2. **Hard cap** — `BULK_MAX_ITEMS = 1000`. Returns `fail()` with
   `reason: "bulk_size_limit_exceeded"`. Cannot be bypassed; agent must chunk.

These gates exist because an agent that pipes `pbir_list_visuals` output
straight into `pbir_bulk_delete_visuals` can wipe a page with one tool call
and zero second thoughts.

## Gotchas

- **`continueOnError` only on `pbir_bulk_bind`** — the others abort the whole
  batch on first error.
- **Inventory validation strategy** flips between batch mode (default,
  pre-flight failure) and per-entry mode (`continueOnError:true`, individual
  fails reported in `perEntryBindingErrors`).
- **`pbir_bulk_update_format` defaults to `target:visual`** — most format
  categories live in `objects`. Pass `target:container` for title/background/etc.

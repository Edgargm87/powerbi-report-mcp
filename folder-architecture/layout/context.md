# Layout Context

## When this folder is loaded

Load this room at the start of any "build a page" workflow, and again before
delivery to validate. Skip when you're only changing a single visual's position
(`visuals/pbir_move_visual` is the right tool).

## Tools in this room

- `pbir_layout_grid` — Deterministic rows×cols grid scaffolder
- `pbir_validate_wireframe` — Audit layout against margins/gaps/overlap rules

## Pipeline / ordering

Build:

1. `knowledge/wireframes.md` for canvas geometry + grid-shape selection
2. `pbir_layout_grid(planOnly:true)` to preview
3. `pbir_layout_grid(planOnly:false)` to commit

Validate:

1. `pbir_validate_wireframe(scope:'report')` for a full audit
2. Fix individual visuals with `visuals/pbir_move_visual`
3. Re-validate

## Cross-references

- Reads `knowledge/wireframes.md` heavily — canvas constants live there
- Reads `knowledge/errors.md` for common layout error codes
- Pairs with `visuals/pbir_add_visual` (which also runs the layout validator internally)

## Canvas constants (CODE-only — replicated here for visibility)

```
canvas:        1280 × 720
marginLeft:    20    (knowledge/wireframes.md treats this as 15 in some places — read the live constants)
marginRight:   20
marginTop:     ?     (banner-aware)
marginBottom:  6
gap:           5
banner:        first content row when reserveBannerRow:true
```

The authoritative values live in `src/helpers/layoutValidation.ts` and
`src/tools/layoutGrid.ts` (`CANVAS` constant). Markdown can mirror the rules;
only the validator enforces them.

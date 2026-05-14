# pbir_move_visual

> Move and/or resize a visual on a page.

## Inputs

| Param | Type | Required | Description |
|-------|------|:--------:|-------------|
| pageId | string | no (auto-resolved) | |
| visualId | string | yes | |
| x | number | no | |
| y | number | no | |
| width | number | no | |
| height | number | no | |
| z | number | no | z-order (also sets `tabOrder`) |

## Output

```jsonc
{ "success": true, "position": { "x": 0, "y": 0, "width": 280, "height": 280, "z": 1000, "tabOrder": 1000 } }
```

## Behavior

- Only provided fields update
- `z` updates both `position.z` and `position.tabOrder`
- Invalidates: `page:<id>`

## Gotchas

- No layout validation runs here — call `pbir_validate_wireframe` after batched moves.

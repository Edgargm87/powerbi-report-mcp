# pbir_set_page_background

> Set the page canvas background and/or wallpaper. Hex color (`#0D1117`). Transparency 0-100.

## Inputs

| Param | Type | Required | Default | Description |
|-------|------|:--------:|:-------:|-------------|
| pageId | string | no (auto-resolved) | — | |
| color | string | no | — | Canvas background hex |
| transparency | number (0-100) | no | 0 | |
| wallpaperColor | string | no | — | Color behind the canvas |
| wallpaperTransparency | number (0-100) | no | 0 | |
| clear | boolean | no | — | Remove all background/wallpaper settings |

## Output

```jsonc
{ "success": true, "pageId": "...", "background": "#...", "wallpaper": "#..." }
```

## Behavior

- `idempotentHint: true`
- Writes PBIR `solid.color` + `transparency` literals into `page.objects.background` and `page.objects.wallpaper`
- `clear:true` deletes both entries and removes the `objects` map if empty

## Gotchas

- The wallpaper is the area *behind* the canvas (gutter); the background is
  the canvas itself.
- Transparency is encoded as `${val}D` literal — PBIR-specific format.

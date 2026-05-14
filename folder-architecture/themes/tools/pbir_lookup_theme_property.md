# pbir_lookup_theme_property

> Query the bundled Power BI theme schema for valid `visualStyles` property names. No args = list visual types; +visualType = list categories; +category = list properties with types/enums.

## Inputs

| Param | Type | Required | Description |
|-------|------|:--------:|-------------|
| visualType | string | no | e.g. `barChart`, `card`, `slicer`. Omit to list all visualTypes. |
| category | string | no | e.g. `labels`, `legend`, `title`. Omit to list all categories for the visualType. |
| propertyFilter | string | no | Case-insensitive substring filter on property name. |

## Output (no args)

```jsonc
{ "schemaFile": "...", "visualTypes": ["barChart","card","slicer", ...], "count": N }
```

## Output (visualType only)

```jsonc
{ "schemaFile": "...", "visualType": "barChart", "categories": [{"category":"labels","propertyCount":12}], "count": N }
```

## Output (visualType + category)

```jsonc
{
  "schemaFile": "...",
  "visualType": "barChart",
  "category": "labels",
  "properties": [{"name":"fontSize","type":"number","enum":null}, ...],
  "count": N,
  "note": "Inline formatting overrides the report theme..."
}
```

## Behavior

- `readOnlyHint: true`
- Walks the 1.2 MB bundled PBI theme schema (`src/helpers/themeSchema.ts`)
- Same code path that powers the `pbir_format_visual` typo catcher

## What's NOT replicable in markdown

The schema walker reads `definitions["visual-<type>"]`, resolves `$ref` chains,
and summarizes union types into a flat `{name, type, enum}` shape. The schema
itself is too large to inline in this folder — only code can lookup against it.

## In the default tool set

This tool is one of the 13 default-loaded tools because the typo-catcher and
the format guidance both depend on it.

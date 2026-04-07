import type { VisualDefinition } from "../pbir.js";

// --- Build formatting props in PBIR literal format ---
export function buildFormattingProps(
  properties: Record<string, string | number | boolean>
): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (typeof value === "string" && value.startsWith("#")) {
      props[key] = { solid: { color: { expr: { Literal: { Value: `'${value}'` } } } } };
    } else {
      let literalValue: string;
      if (typeof value === "boolean") {
        literalValue = value ? "true" : "false";
      } else if (typeof value === "number") {
        literalValue = `${value}D`;
      } else {
        literalValue = `'${value}'`;
      }
      props[key] = { expr: { Literal: { Value: literalValue } } };
    }
  }
  return props;
}

// --- Apply formatting array to a target object ---
export function applyFormattingToTarget(
  targetObj: Record<string, unknown>,
  formatting: Array<{ category: string; properties: Record<string, string | number | boolean> }>
): void {
  for (const fmt of formatting) {
    const props = buildFormattingProps(fmt.properties);
    const existing = (targetObj as Record<string, unknown[]>)[fmt.category];
    if (Array.isArray(existing) && existing.length > 0) {
      const existingProps = (existing[0] as { properties: Record<string, unknown> }).properties || {};
      (existing[0] as { properties: Record<string, unknown> }).properties = { ...existingProps, ...props };
    } else {
      (targetObj as Record<string, unknown[]>)[fmt.category] = [{ properties: props }];
    }
  }
}

// --- Apply data colors to a visual ---
// selector mode:
//   metadata: for series-based charts (Series bucket) — selector = { metadata: seriesName }
//   data:     for category-based charts (Category bucket, no Series) — selector = { data: [scopeId Comparison] }
//             requires categoryEntity + categoryProperty to build the expression
export function applyDataColors(
  visual: VisualDefinition,
  colors: Array<{ color: string; seriesName?: string }>,
  defaultTransparency?: number,
  categoryEntity?: string,
  categoryProperty?: string,
): void {
  if (!visual.visual.objects) {
    visual.visual.objects = {};
  }
  const useDataSelector = !!(categoryEntity && categoryProperty);
  const dataPoints: unknown[] = [];
  for (const c of colors) {
    const entry: Record<string, unknown> = {
      properties: {
        fill: { solid: { color: { expr: { Literal: { Value: `'${c.color}'` } } } } },
      },
    };
    if (c.seriesName) {
      if (useDataSelector) {
        entry.selector = {
          data: [{
            scopeId: {
              Comparison: {
                ComparisonKind: 0,
                Left: { Column: { Expression: { SourceRef: { Entity: categoryEntity } }, Property: categoryProperty } },
                Right: { Literal: { Value: `'${c.seriesName}'` } },
              },
            },
          }],
        };
      } else {
        entry.selector = { metadata: c.seriesName };
      }
    }
    dataPoints.push(entry);
  }
  if (defaultTransparency !== undefined) {
    dataPoints.push({
      properties: {
        transparency: { expr: { Literal: { Value: `${defaultTransparency}D` } } },
      },
    });
  }
  (visual.visual.objects as Record<string, unknown[]>).dataPoint = dataPoints;
}

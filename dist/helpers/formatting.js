"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildFormattingProps = buildFormattingProps;
exports.applyFormattingToTarget = applyFormattingToTarget;
exports.applyDataColors = applyDataColors;
// --- Build formatting props in PBIR literal format ---
function buildFormattingProps(properties) {
    const props = {};
    for (const [key, value] of Object.entries(properties)) {
        if (typeof value === "string" && value.startsWith("#")) {
            props[key] = { solid: { color: { expr: { Literal: { Value: `'${value}'` } } } } };
        }
        else {
            let literalValue;
            if (typeof value === "boolean") {
                literalValue = value ? "true" : "false";
            }
            else if (typeof value === "number") {
                literalValue = `${value}D`;
            }
            else {
                literalValue = `'${value}'`;
            }
            props[key] = { expr: { Literal: { Value: literalValue } } };
        }
    }
    return props;
}
// --- Apply formatting array to a target object ---
function applyFormattingToTarget(targetObj, formatting) {
    for (const fmt of formatting) {
        const props = buildFormattingProps(fmt.properties);
        const existing = targetObj[fmt.category];
        if (Array.isArray(existing) && existing.length > 0) {
            const existingProps = existing[0].properties || {};
            existing[0].properties = { ...existingProps, ...props };
        }
        else {
            targetObj[fmt.category] = [{ properties: props }];
        }
    }
}
// --- Apply data colors to a visual ---
// selector mode:
//   metadata: for series-based charts (Series bucket) — selector = { metadata: seriesName }
//   data:     for category-based charts (Category bucket, no Series) — selector = { data: [scopeId Comparison] }
//             requires categoryEntity + categoryProperty to build the expression
function applyDataColors(visual, colors, defaultTransparency, categoryEntity, categoryProperty) {
    if (!visual.visual.objects) {
        visual.visual.objects = {};
    }
    const useDataSelector = !!(categoryEntity && categoryProperty);
    const dataPoints = [];
    for (const c of colors) {
        const entry = {
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
            }
            else {
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
    visual.visual.objects.dataPoint = dataPoints;
}

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VisualSpecSchema = exports.DataColorSchema = exports.FormatCategorySchema = exports.BucketBindingSchema = exports.FieldSpecSchema = exports.SLICER_VISUAL_TYPES = exports.INSERT_BUTTON_VISUAL_TYPES = exports.NO_DATA_VISUAL_TYPES = void 0;
exports.parseFieldSpec = parseFieldSpec;
exports.createAndSaveVisual = createAndSaveVisual;
const zod_1 = require("zod");
const pbir_js_1 = require("../pbir.js");
const formatting_js_1 = require("./formatting.js");
/** Visual types that have no data binding and no default font formatting */
exports.NO_DATA_VISUAL_TYPES = new Set([
    "textbox", "basicShape", "shape", "image", "actionButton", "pageNavigator",
]);
/** Visual types that require howCreated: "InsertVisualButton" in the JSON */
exports.INSERT_BUTTON_VISUAL_TYPES = new Set(["actionButton", "pageNavigator", "image"]);
/** All slicer visual types */
exports.SLICER_VISUAL_TYPES = new Set(["slicer", "listSlicer", "textSlicer", "advancedSlicerVisual"]);
// --- Zod schemas (exported for use in tools) ---
exports.FieldSpecSchema = zod_1.z.object({
    field: zod_1.z
        .string()
        .optional()
        .describe("Shorthand: 'Table[Column]' or 'Table[Measure]' (e.g. 'Sales[Net Price]')"),
    entity: zod_1.z
        .string()
        .optional()
        .describe("Table/entity name (e.g. 'financials'). Use either 'field' shorthand or both entity+property."),
    property: zod_1.z
        .string()
        .optional()
        .describe("Column or measure name (e.g. 'Gross Sales'). Use either 'field' shorthand or both entity+property."),
    type: zod_1.z
        .enum(["column", "measure", "aggregation"])
        .describe("'column' for raw column, 'aggregation' for aggregated column, 'measure' for DAX measure"),
    aggregation: zod_1.z
        .string()
        .optional()
        .describe("Aggregation function: Sum, Avg, Count, Min, Max, CountNonNull, Median, StandardDeviation, Variance"),
});
exports.BucketBindingSchema = zod_1.z.object({
    bucket: zod_1.z.string().describe("Data role bucket name (e.g. 'Category', 'Y', 'Series', 'Values', 'Rows')"),
    fields: zod_1.z.array(exports.FieldSpecSchema).describe("Fields to bind to this bucket"),
});
exports.FormatCategorySchema = zod_1.z.object({
    category: zod_1.z.string().describe("Formatting category"),
    properties: zod_1.z
        .record(zod_1.z.string(), zod_1.z.union([zod_1.z.string(), zod_1.z.number(), zod_1.z.boolean()]))
        .describe("Property key-value pairs"),
});
exports.DataColorSchema = zod_1.z.object({
    color: zod_1.z.string().describe("Hex color like '#CD191C'"),
    seriesName: zod_1.z.string().optional().describe("Series metadata selector"),
});
exports.VisualSpecSchema = zod_1.z.object({
    visualType: zod_1.z.string().describe("The visual type"),
    x: zod_1.z.number().optional().default(0).describe("X position"),
    y: zod_1.z.number().optional().default(0).describe("Y position"),
    width: zod_1.z.number().optional().default(280).describe("Width"),
    height: zod_1.z.number().optional().default(280).describe("Height"),
    bindings: zod_1.z.array(exports.BucketBindingSchema).optional().describe("Data bindings"),
    autoFilters: zod_1.z.boolean().optional().default(true),
    slicerMode: zod_1.z.enum(["Basic", "Dropdown"]).optional(),
    shapeType: zod_1.z
        .enum(["rectangle", "rectangleRounded", "line", "tabCutCorner", "tabCutTopCorners", "tabRoundCorner", "tabRoundTopCorners"])
        .optional(),
    shapeRotation: zod_1.z.number().optional().default(0),
    fillColor: zod_1.z
        .string()
        .optional()
        .describe("Fill color for shapes (hex, e.g. '#D9D9D9'). Defaults to #D9D9D9 if not provided."),
    textContent: zod_1.z.string().optional().describe("Text label displayed inside a shape or textbox"),
    textColor: zod_1.z.string().optional().describe("Text color (hex, e.g. '#595959')"),
    textAlign: zod_1.z
        .enum(["left", "center", "right"])
        .optional()
        .describe("Horizontal text alignment inside shape/textbox"),
    textSize: zod_1.z.number().optional().describe("Font size in pt (e.g. 10)"),
    textBold: zod_1.z.boolean().optional().describe("Bold text"),
    title: zod_1.z.string().optional(),
    containerFormat: zod_1.z
        .array(exports.FormatCategorySchema)
        .optional()
        .describe("Inline container formatting (title, background, border, padding, dropShadow, visualHeader)"),
    visualFormat: zod_1.z
        .array(exports.FormatCategorySchema)
        .optional()
        .describe("Inline visual formatting (axes, legend, labels, lineStyles, etc.)"),
    dataColors: zod_1.z
        .array(exports.DataColorSchema)
        .optional()
        .describe("Inline data point colors"),
});
// --- Parse field specification — supports Table[Column] shorthand ---
function parseFieldSpec(spec) {
    let entity;
    let property;
    if (spec.field) {
        // Parse "Table[Column]" notation
        const match = spec.field.match(/^(.+)\[(.+)\]$/);
        if (match) {
            entity = match[1].trim();
            property = match[2].trim();
        }
        else {
            throw new Error(`Invalid field shorthand: "${spec.field}". Expected format: 'Table[Column]' (e.g. 'Sales[Net Price]').`);
        }
    }
    else if (spec.entity && spec.property) {
        entity = spec.entity;
        property = spec.property;
    }
    else {
        throw new Error("Field spec must include either 'field' (e.g. 'Table[Column]') or both 'entity' and 'property'.");
    }
    if (spec.type === "measure") {
        return (0, pbir_js_1.measureRef)(entity, property);
    }
    if (spec.type === "aggregation") {
        const func = pbir_js_1.AggregationFunction[spec.aggregation || "Sum"] ?? 0;
        return (0, pbir_js_1.aggregationRef)(entity, property, func);
    }
    return (0, pbir_js_1.columnRef)(entity, property);
}
// --- Create a single visual and save it ---
function createAndSaveVisual(project, pageId, spec, baseZ) {
    const visualId = (0, pbir_js_1.generateId)();
    const { x = 0, y = 0, width: rawWidth, height: rawHeight, bindings, autoFilters = true, slicerMode, shapeType, shapeRotation = 0, fillColor, textContent, textColor, textAlign, textSize, textBold, title, containerFormat, visualFormat, dataColors, } = spec;
    // Normalise basicShape → shape
    const visualType = spec.visualType === "basicShape" ? "shape" : spec.visualType;
    const slicerDefaultTypes = new Set(["slicer", "listSlicer", "textSlicer", "advancedSlicerVisual"]);
    const width = rawWidth ?? (slicerDefaultTypes.has(visualType) ? 168 : 280);
    const height = rawHeight ?? (slicerDefaultTypes.has(visualType) ? 65 : 280);
    const zVal = baseZ;
    // Build query state from bindings
    const queryState = {};
    if (bindings && bindings.length > 0) {
        for (const binding of bindings) {
            let bucketName = binding.bucket;
            if (bucketName === "Fields") {
                const validBuckets = pbir_js_1.VISUAL_BUCKETS[visualType];
                if (validBuckets && validBuckets.length > 0 && !validBuckets.includes("Fields")) {
                    bucketName = validBuckets[0];
                }
            }
            const projections = binding.fields.map((fieldSpec, i) => {
                const field = parseFieldSpec(fieldSpec);
                const isFirst = i === 0 &&
                    (bucketName === "Category" || (exports.SLICER_VISUAL_TYPES.has(visualType) && bucketName === "Values"));
                return {
                    field,
                    queryRef: (0, pbir_js_1.buildQueryRef)(field),
                    nativeQueryRef: (0, pbir_js_1.buildNativeQueryRef)(field),
                    ...(isFirst ? { active: true } : {}),
                };
            });
            queryState[bucketName] = { projections };
        }
    }
    // Build sort definition
    let sortDefinition;
    // Category bucket (most charts) or Details bucket (scatterChart)
    const categoryBucket = queryState.Category ?? queryState.Details;
    if (categoryBucket?.projections?.[0]) {
        sortDefinition = {
            sort: [
                {
                    field: JSON.parse(JSON.stringify(categoryBucket.projections[0].field)),
                    direction: "Ascending",
                },
            ],
            isDefaultSort: true,
        };
    }
    if (!sortDefinition && exports.SLICER_VISUAL_TYPES.has(visualType) && queryState.Values?.projections?.[0]) {
        sortDefinition = {
            sort: [
                {
                    field: JSON.parse(JSON.stringify(queryState.Values.projections[0].field)),
                    direction: "Ascending",
                },
            ],
        };
    }
    // Build visual objects (for slicers, shapes, textboxes)
    let visualObjects;
    if (visualType === "slicer") {
        const mode = slicerMode || "Dropdown";
        // Dropdown: add strictSingleSelect=true (matches PBI default for dropdowns)
        // Basic: just set mode, no extra selection properties
        visualObjects =
            mode === "Dropdown"
                ? {
                    data: [{ properties: { mode: { expr: { Literal: { Value: `'${mode}'` } } } } }],
                    selection: [
                        {
                            properties: {
                                strictSingleSelect: { expr: { Literal: { Value: "true" } } },
                            },
                        },
                    ],
                }
                : {
                    data: [{ properties: { mode: { expr: { Literal: { Value: `'${mode}'` } } } } }],
                };
    }
    else if (visualType === "shape") {
        const tile = shapeType || "rectangle";
        const color = fillColor || "#D9D9D9";
        const shapeObjs = {
            shape: [{ properties: { tileShape: { expr: { Literal: { Value: `'${tile}'` } } } } }],
            rotation: [
                {
                    properties: {
                        shapeAngle: { expr: { Literal: { Value: `${shapeRotation}L` } } },
                    },
                },
            ],
            fill: [
                {
                    properties: {
                        fillColor: { solid: { color: { expr: { Literal: { Value: `'${color}'` } } } } },
                    },
                    selector: { id: "default" },
                },
            ],
            outline: [{ properties: { show: { expr: { Literal: { Value: "false" } } } } }],
        };
        if (textContent) {
            const textStyle = {};
            if (textColor)
                textStyle.color = textColor;
            if (textBold)
                textStyle.fontWeight = "bold";
            if (textSize)
                textStyle.fontSize = `${textSize}pt`;
            shapeObjs.general = [
                {
                    properties: {
                        paragraphs: [
                            {
                                textRuns: [
                                    {
                                        value: textContent,
                                        ...(Object.keys(textStyle).length ? { textStyle } : {}),
                                    },
                                ],
                                horizontalTextAlignment: textAlign || "center",
                            },
                        ],
                    },
                },
            ];
        }
        visualObjects = shapeObjs;
    }
    else if (visualType === "textbox") {
        const text = textContent || "";
        const textStyle = {};
        if (textColor)
            textStyle.color = textColor;
        if (textBold)
            textStyle.fontWeight = "bold";
        if (textSize)
            textStyle.fontSize = `${textSize}pt`;
        visualObjects = {
            general: [
                {
                    properties: {
                        paragraphs: [
                            {
                                textRuns: [
                                    {
                                        value: text,
                                        ...(Object.keys(textStyle).length ? { textStyle } : {}),
                                    },
                                ],
                                horizontalTextAlignment: textAlign || "left",
                            },
                        ],
                    },
                },
            ],
        };
    }
    const visual = {
        $schema: "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/visualContainer/2.7.0/schema.json",
        name: visualId,
        position: { x, y, z: zVal, height, width, tabOrder: zVal },
        visual: {
            visualType,
            ...(Object.keys(queryState).length > 0
                ? { query: { queryState, ...(sortDefinition ? { sortDefinition } : {}) } }
                : {}),
            ...(visualObjects ? { objects: visualObjects } : {}),
            ...(exports.INSERT_BUTTON_VISUAL_TYPES.has(visualType) ? { visualContainerObjects: {} } : {}),
            drillFilterOtherVisuals: true,
        },
        ...(exports.INSERT_BUTTON_VISUAL_TYPES.has(visualType) ? { howCreated: "InsertVisualButton" } : {}),
    };
    // Add title
    if (title) {
        visual.visual.visualContainerObjects = {
            title: [{ properties: { text: { expr: { Literal: { Value: `'${title}'` } } } } }],
        };
    }
    // Apply default font (fontSize 8, Segoe UI) to title — overridable by containerFormat
    if (!visual.visual.visualContainerObjects)
        visual.visual.visualContainerObjects = {};
    (0, formatting_js_1.applyFormattingToTarget)(visual.visual.visualContainerObjects, [
        {
            category: "title",
            properties: {
                fontSize: 8,
                fontFamily: "'Segoe UI', wf_segoe-ui_normal, helvetica, arial, sans-serif",
            },
        },
    ]);
    // Apply inline container formatting
    if (containerFormat && containerFormat.length > 0) {
        (0, formatting_js_1.applyFormattingToTarget)(visual.visual.visualContainerObjects, containerFormat);
    }
    // Apply default font to visual-level objects (axes, labels, legend for charts; items/header for slicers)
    const defaultVisualFont = {
        fontSize: 8,
        fontFamily: "'Segoe UI', wf_segoe-ui_normal, helvetica, arial, sans-serif",
    };
    const slicerTypes = new Set(["slicer", "listSlicer", "textSlicer", "advancedSlicerVisual"]);
    if (!exports.NO_DATA_VISUAL_TYPES.has(visualType)) {
        if (!visual.visual.objects)
            visual.visual.objects = {};
        if (slicerTypes.has(visualType)) {
            (0, formatting_js_1.applyFormattingToTarget)(visual.visual.objects, [
                {
                    category: "items",
                    properties: {
                        textSize: 8,
                        fontFamily: "'Segoe UI', wf_segoe-ui_normal, helvetica, arial, sans-serif",
                    },
                },
                {
                    category: "header",
                    properties: {
                        textSize: 8,
                        fontFamily: "'Segoe UI', wf_segoe-ui_normal, helvetica, arial, sans-serif",
                    },
                },
            ]);
        }
        else {
            (0, formatting_js_1.applyFormattingToTarget)(visual.visual.objects, [
                { category: "categoryAxis", properties: defaultVisualFont },
                { category: "valueAxis", properties: defaultVisualFont },
                { category: "labels", properties: defaultVisualFont },
                { category: "legend", properties: defaultVisualFont },
            ]);
        }
    }
    // Apply inline visual formatting
    if (visualFormat && visualFormat.length > 0) {
        if (!visual.visual.objects)
            visual.visual.objects = {};
        (0, formatting_js_1.applyFormattingToTarget)(visual.visual.objects, visualFormat);
    }
    // Apply inline data colors
    if (dataColors && dataColors.length > 0) {
        (0, formatting_js_1.applyDataColors)(visual, dataColors);
    }
    // Add auto-filters
    if (autoFilters && Object.keys(queryState).length > 0) {
        visual.filterConfig = { filters: (0, pbir_js_1.buildAutoFilters)(queryState) };
    }
    project.saveVisual(pageId, visualId, visual);
    return { visualId, visualType };
}

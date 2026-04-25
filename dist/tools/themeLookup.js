"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerThemeLookupTool = registerThemeLookupTool;
const zod_1 = require("zod");
const path = __importStar(require("path"));
const themeSchema_js_1 = require("../helpers/themeSchema.js");
// ---------------------------------------------------------------------------
// pbir_lookup_theme_property — discovery surface over the bundled PBI theme schema.
// See src/helpers/themeSchema.ts for the shared walker (also used by the
// pbir_format_visual validator).
// ---------------------------------------------------------------------------
function registerThemeLookupTool(server) {
    server.tool("pbir_lookup_theme_property", "Query the bundled Power BI theme schema for valid visualStyles property names. No args = list visual types; +visualType = list categories; +category = list properties with types/enums.", {
        visualType: zod_1.z
            .string()
            .optional()
            .describe("e.g. 'barChart', 'card', 'slicer'. Omit to list all visualTypes."),
        category: zod_1.z
            .string()
            .optional()
            .describe("e.g. 'labels', 'legend', 'title'. Omit to list all categories for the visualType."),
        propertyFilter: zod_1.z
            .string()
            .optional()
            .describe("Case-insensitive substring filter on property name."),
    }, { "readOnlyHint": true, "openWorldHint": false }, async ({ visualType, category, propertyFilter }) => {
        const { schema, file } = (0, themeSchema_js_1.loadSchema)();
        const schemaFilename = path.basename(file);
        if (!visualType) {
            const defs = schema.definitions || {};
            const types = Object.keys(defs)
                .filter((k) => k.startsWith("visual-"))
                .map((k) => k.slice("visual-".length))
                .sort();
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({ schemaFile: schemaFilename, visualTypes: types, count: types.length }, null, 2),
                    },
                ],
            };
        }
        const cats = (0, themeSchema_js_1.getCategoriesForVisualType)(schema, visualType);
        if (cats.size === 0) {
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            success: false,
                            error: `Unknown visualType: "${visualType}". Call pbir_lookup_theme_property with no arguments to list valid types.`,
                            schemaFile: schemaFilename,
                        }, null, 2),
                    },
                ],
                isError: true,
            };
        }
        if (!category) {
            const catList = [...cats.entries()]
                .map(([name, props]) => ({ category: name, propertyCount: Object.keys(props).length }))
                .sort((a, b) => a.category.localeCompare(b.category));
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({ schemaFile: schemaFilename, visualType, categories: catList, count: catList.length }, null, 2),
                    },
                ],
            };
        }
        const catProps = cats.get(category);
        if (!catProps && category !== "*") {
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            success: false,
                            error: `Category "${category}" not found on visualType "${visualType}".`,
                            availableCategories: [...cats.keys()].sort(),
                            schemaFile: schemaFilename,
                        }, null, 2),
                    },
                ],
                isError: true,
            };
        }
        const merged = { ...(catProps || {}) };
        const filter = propertyFilter?.toLowerCase();
        const rows = Object.entries(merged)
            .filter(([name]) => !filter || name.toLowerCase().includes(filter))
            .map(([name, spec]) => ({ name, ...(0, themeSchema_js_1.summarizePropertySpec)(schema, spec) }))
            .sort((a, b) => a.name.localeCompare(b.name));
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({
                        schemaFile: schemaFilename,
                        visualType,
                        category,
                        properties: rows,
                        count: rows.length,
                        note: "Inline formatting (pbir_add_visual containerFormat/visualFormat, pbir_format_visual) overrides the report theme. Properties are valid both in per-visual formatting and under theme.visualStyles[type][category][0].",
                    }, null, 2),
                },
            ],
        };
    });
}

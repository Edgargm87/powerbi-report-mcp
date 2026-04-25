"use strict";
// ---------------------------------------------------------------------------
// Shared theme-schema helpers
//
// Centralises the logic that walks the bundled PBI theme JSON Schema so both
// `lookup_theme_property` (discovery) and `format_visual` (validation) see the
// same view of valid visualType → category → property combinations.
//
// The schema is the source of truth for every `visualStyles[type][category]`
// property name. Inline `format_visual` writes the same property names into
// `visual.objects[category][0].properties` / `visualContainerObjects[...]`,
// so the same valid set applies.
// ---------------------------------------------------------------------------
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
exports.loadSchema = loadSchema;
exports.getCategoriesForVisualType = getCategoriesForVisualType;
exports.summarizePropertySpec = summarizePropertySpec;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
let cachedSchema = null;
let cachedSchemaFile = null;
let cachedCategoryMaps = null;
function findSchemaFile() {
    // dist/helpers/themeSchema.js at runtime → walk up to project root → schemas/
    const here = __dirname;
    const candidates = [
        path.join(here, "..", "..", "schemas"),
        path.join(here, "..", "..", "..", "schemas"),
    ];
    for (const dir of candidates) {
        if (!fs.existsSync(dir))
            continue;
        const files = fs
            .readdirSync(dir)
            .filter((f) => /^reportThemeSchema-[\d.]+\.json$/.test(f))
            .sort()
            .reverse();
        if (files.length > 0)
            return path.join(dir, files[0]);
    }
    throw new Error("No reportThemeSchema-*.json found under schemas/. Run: node scripts/refresh-theme-schema.js");
}
function loadSchema() {
    if (!cachedSchema || !cachedSchemaFile) {
        const file = findSchemaFile();
        cachedSchema = JSON.parse(fs.readFileSync(file, "utf8"));
        cachedSchemaFile = file;
        cachedCategoryMaps = new Map();
    }
    return { schema: cachedSchema, file: cachedSchemaFile };
}
function resolveRef(schema, ref) {
    if (!ref.startsWith("#/"))
        return null;
    const parts = ref.slice(2).split("/");
    let node = schema;
    for (const p of parts) {
        if (node && typeof node === "object" && p in node) {
            node = node[p];
        }
        else {
            return null;
        }
    }
    return node;
}
function getCategoriesForVisualType(schema, visualType) {
    // Memoise per visualType — the lookup is called every format_visual write
    if (!cachedCategoryMaps)
        cachedCategoryMaps = new Map();
    const hit = cachedCategoryMaps.get(visualType);
    if (hit)
        return hit;
    const result = new Map();
    const defs = schema.definitions || {};
    const def = defs[`visual-${visualType}`];
    if (!def) {
        cachedCategoryMaps.set(visualType, result);
        return result;
    }
    const walk = (node) => {
        if (!node || typeof node !== "object")
            return;
        const obj = node;
        if (typeof obj.$ref === "string") {
            walk(resolveRef(schema, obj.$ref));
            return;
        }
        if (Array.isArray(obj.allOf)) {
            for (const a of obj.allOf)
                walk(a);
        }
        const props = obj.properties;
        if (!props)
            return;
        for (const [catName, catSpec] of Object.entries(props)) {
            if (!catSpec || typeof catSpec !== "object")
                continue;
            const spec = catSpec;
            let items = spec.items;
            if (items && typeof items.$ref === "string") {
                items = resolveRef(schema, items.$ref);
            }
            const itemProps = items?.properties;
            if (!itemProps)
                continue;
            const existing = result.get(catName) || {};
            result.set(catName, { ...existing, ...itemProps });
        }
    };
    walk(def);
    cachedCategoryMaps.set(visualType, result);
    return result;
}
function summarizePropertySpec(schema, spec) {
    if (!spec || typeof spec !== "object")
        return { type: "unknown" };
    let node = spec;
    if (typeof node.$ref === "string") {
        const resolved = resolveRef(schema, node.$ref);
        if (resolved && typeof resolved === "object") {
            node = { ...resolved, ...node };
            delete node.$ref;
        }
    }
    const out = {
        type: Array.isArray(node.type) ? node.type.join("|") : node.type || "unknown",
    };
    if (typeof node.title === "string")
        out.title = node.title;
    if (typeof node.description === "string")
        out.description = node.description;
    if (Array.isArray(node.oneOf)) {
        const vals = [];
        for (const o of node.oneOf) {
            if (typeof o.const === "string" || typeof o.const === "number" || typeof o.const === "boolean") {
                vals.push(String(o.const));
            }
        }
        if (vals.length > 0)
            out.enum = vals;
    }
    const refStr = spec.$ref;
    if (refStr) {
        if (refStr.endsWith("/fill"))
            out.type = "color";
        else if (refStr.endsWith("/fontSize"))
            out.type = "number (fontSize)";
    }
    return out;
}

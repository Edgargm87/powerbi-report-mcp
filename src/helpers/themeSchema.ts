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

import * as fs from "fs";
import * as path from "path";

export type CategoryMap = Map<string, Record<string, unknown>>;

let cachedSchema: Record<string, unknown> | null = null;
let cachedSchemaFile: string | null = null;
let cachedCategoryMaps: Map<string, CategoryMap> | null = null;

function findSchemaFile(): string {
  // dist/helpers/themeSchema.js at runtime → walk up to project root → schemas/
  const here = __dirname;
  const candidates = [
    path.join(here, "..", "..", "schemas"),
    path.join(here, "..", "..", "..", "schemas"),
  ];
  for (const dir of candidates) {
    if (!fs.existsSync(dir)) continue;
    const files = fs
      .readdirSync(dir)
      .filter((f) => /^reportThemeSchema-[\d.]+\.json$/.test(f))
      .sort()
      .reverse();
    if (files.length > 0) return path.join(dir, files[0]);
  }
  throw new Error(
    "No reportThemeSchema-*.json found under schemas/. Run: node scripts/refresh-theme-schema.js"
  );
}

export function loadSchema(): { schema: Record<string, unknown>; file: string } {
  if (!cachedSchema || !cachedSchemaFile) {
    const file = findSchemaFile();
    cachedSchema = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
    cachedSchemaFile = file;
    cachedCategoryMaps = new Map();
  }
  return { schema: cachedSchema, file: cachedSchemaFile };
}

function resolveRef(schema: Record<string, unknown>, ref: string): unknown {
  if (!ref.startsWith("#/")) return null;
  const parts = ref.slice(2).split("/");
  let node: unknown = schema;
  for (const p of parts) {
    if (node && typeof node === "object" && p in (node as Record<string, unknown>)) {
      node = (node as Record<string, unknown>)[p];
    } else {
      return null;
    }
  }
  return node;
}

export function getCategoriesForVisualType(
  schema: Record<string, unknown>,
  visualType: string
): CategoryMap {
  // Memoise per visualType — the lookup is called every format_visual write
  if (!cachedCategoryMaps) cachedCategoryMaps = new Map();
  const hit = cachedCategoryMaps.get(visualType);
  if (hit) return hit;

  const result: CategoryMap = new Map();
  const defs = (schema as { definitions?: Record<string, unknown> }).definitions || {};
  const def = defs[`visual-${visualType}`];
  if (!def) {
    cachedCategoryMaps.set(visualType, result);
    return result;
  }

  const walk = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    const obj = node as Record<string, unknown>;

    if (typeof obj.$ref === "string") {
      walk(resolveRef(schema, obj.$ref));
      return;
    }
    if (Array.isArray(obj.allOf)) {
      for (const a of obj.allOf) walk(a);
    }
    const props = obj.properties as Record<string, unknown> | undefined;
    if (!props) return;

    for (const [catName, catSpec] of Object.entries(props)) {
      if (!catSpec || typeof catSpec !== "object") continue;
      const spec = catSpec as Record<string, unknown>;
      let items = spec.items as Record<string, unknown> | undefined;
      if (items && typeof items.$ref === "string") {
        items = resolveRef(schema, items.$ref) as Record<string, unknown> | undefined;
      }
      const itemProps = items?.properties as Record<string, unknown> | undefined;
      if (!itemProps) continue;

      const existing = result.get(catName) || {};
      result.set(catName, { ...existing, ...itemProps });
    }
  };

  walk(def);
  cachedCategoryMaps.set(visualType, result);
  return result;
}

export function summarizePropertySpec(
  schema: Record<string, unknown>,
  spec: unknown
): { type: string; enum?: string[]; description?: string; title?: string } {
  if (!spec || typeof spec !== "object") return { type: "unknown" };
  let node = spec as Record<string, unknown>;

  if (typeof node.$ref === "string") {
    const resolved = resolveRef(schema, node.$ref);
    if (resolved && typeof resolved === "object") {
      node = { ...(resolved as Record<string, unknown>), ...node };
      delete node.$ref;
    }
  }

  const out: { type: string; enum?: string[]; description?: string; title?: string } = {
    type: Array.isArray(node.type) ? (node.type as string[]).join("|") : (node.type as string) || "unknown",
  };
  if (typeof node.title === "string") out.title = node.title;
  if (typeof node.description === "string") out.description = node.description;
  if (Array.isArray(node.oneOf)) {
    const vals: string[] = [];
    for (const o of node.oneOf as Array<Record<string, unknown>>) {
      if (typeof o.const === "string" || typeof o.const === "number" || typeof o.const === "boolean") {
        vals.push(String(o.const));
      }
    }
    if (vals.length > 0) out.enum = vals;
  }

  const refStr = (spec as Record<string, unknown>).$ref as string | undefined;
  if (refStr) {
    if (refStr.endsWith("/fill")) out.type = "color";
    else if (refStr.endsWith("/fontSize")) out.type = "number (fontSize)";
  }

  return out;
}


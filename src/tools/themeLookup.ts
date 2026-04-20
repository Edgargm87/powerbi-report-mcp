import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as fs from "fs";
import * as path from "path";

// ---------------------------------------------------------------------------
// Theme-schema lookup
//
// The bundled Power BI theme JSON Schema (schemas/reportThemeSchema-<ver>.json)
// is the source of truth for every format_visual / add_visual inline-format /
// set_report_theme property name. Agents can call lookup_theme_property to
// discover:
//   - which visualTypes the schema knows about
//   - which categories (labels, legend, dataPoint, title, etc.) exist per type
//   - which properties exist per category, with their JSON type / enum values
//
// Why: without this tool the agent guesses category/property names, gets them
// wrong, and writes invalid theme blocks that PBI silently ignores.
// ---------------------------------------------------------------------------

let cachedSchema: Record<string, unknown> | null = null;
let cachedSchemaFile: string | null = null;

function findSchemaFile(): string {
  // dist/tools/themeLookup.js at runtime → walk up to project root → schemas/
  const candidates = [
    path.join(__dirname, "..", "..", "schemas"),
    path.join(__dirname, "..", "..", "..", "schemas"),
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

function loadSchema(): { schema: Record<string, unknown>; file: string } {
  if (!cachedSchema || !cachedSchemaFile) {
    const file = findSchemaFile();
    cachedSchema = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
    cachedSchemaFile = file;
  }
  return { schema: cachedSchema, file: cachedSchemaFile };
}

// Resolve a local $ref (#/definitions/xxx) one level deep
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

type CategoryMap = Map<string, Record<string, unknown>>;

// For a visualType, collect every category → property-map by walking its allOf.
function getCategoriesForVisualType(
  schema: Record<string, unknown>,
  visualType: string
): CategoryMap {
  const result: CategoryMap = new Map();
  const defs = (schema as { definitions?: Record<string, unknown> }).definitions || {};
  const def = defs[`visual-${visualType}`];
  if (!def) return result;

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
      // Category shape: { type: "array", items: { properties: {...} } }
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
  return result;
}

function summarizePropertySpec(
  schema: Record<string, unknown>,
  spec: unknown
): { type: string; enum?: string[]; description?: string; title?: string } {
  if (!spec || typeof spec !== "object") return { type: "unknown" };
  let node = spec as Record<string, unknown>;

  // Resolve $ref once (e.g. fill, fontSize)
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

  // enum via oneOf: [{ const: "X", title: "..." }, ...]
  if (Array.isArray(node.oneOf)) {
    const vals: string[] = [];
    for (const o of node.oneOf as Array<Record<string, unknown>>) {
      if (typeof o.const === "string" || typeof o.const === "number" || typeof o.const === "boolean") {
        vals.push(String(o.const));
      }
    }
    if (vals.length > 0) out.enum = vals;
  }

  // Infer known semantic type from $ref name
  const refStr = (spec as Record<string, unknown>).$ref as string | undefined;
  if (refStr) {
    if (refStr.endsWith("/fill")) out.type = "color";
    else if (refStr.endsWith("/fontSize")) out.type = "number (fontSize)";
  }

  return out;
}

export function registerThemeLookupTool(server: McpServer): void {
  server.tool(
    "lookup_theme_property",
    [
      "Query the bundled Power BI theme JSON Schema — source of truth for valid",
      "visualStyles property names. Use before calling format_visual, set_report_theme,",
      "or passing visualFormat/containerFormat on add_visual to confirm the category+property",
      "combination is real. Without a visualType: lists all 48 visual types. With visualType:",
      "lists that type's categories. With visualType + category: lists every property (name,",
      "JSON type, enum values, description).",
    ].join(" "),
    {
      visualType: z
        .string()
        .optional()
        .describe("e.g. 'barChart', 'card', 'slicer'. Omit to list all visualTypes."),
      category: z
        .string()
        .optional()
        .describe("e.g. 'labels', 'legend', 'title'. Omit to list all categories for the visualType."),
      propertyFilter: z
        .string()
        .optional()
        .describe("Case-insensitive substring filter on property name."),
    },
    async ({ visualType, category, propertyFilter }) => {
      const { schema, file } = loadSchema();
      const schemaFilename = path.basename(file);

      // Mode 1: no visualType → list all types
      if (!visualType) {
        const defs = (schema as { definitions?: Record<string, unknown> }).definitions || {};
        const types = Object.keys(defs)
          .filter((k) => k.startsWith("visual-"))
          .map((k) => k.slice("visual-".length))
          .sort();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                { schemaFile: schemaFilename, visualTypes: types, count: types.length },
                null,
                2
              ),
            },
          ],
        };
      }

      const cats = getCategoriesForVisualType(schema, visualType);
      if (cats.size === 0) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: false,
                  error: `Unknown visualType: "${visualType}". Call lookup_theme_property with no arguments to list valid types.`,
                  schemaFile: schemaFilename,
                },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      }

      // Mode 2: visualType, no category → list categories with their property counts
      if (!category) {
        const catList = [...cats.entries()]
          .map(([name, props]) => ({ category: name, propertyCount: Object.keys(props).length }))
          .sort((a, b) => a.category.localeCompare(b.category));
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                { schemaFile: schemaFilename, visualType, categories: catList, count: catList.length },
                null,
                2
              ),
            },
          ],
        };
      }

      // Mode 3: visualType + category → list properties for the named category.
      // Note: the schema also has a "*" bag listing every property name the
      // visualType accepts across all categories combined — we do NOT merge it
      // into named categories because that would wildly over-report (barChart.*
      // has 255 props; barChart.labels actually has ~20). Query category "*"
      // explicitly to see the full bag.
      const catProps = cats.get(category);
      if (!catProps && category !== "*") {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: false,
                  error: `Category "${category}" not found on visualType "${visualType}".`,
                  availableCategories: [...cats.keys()].sort(),
                  schemaFile: schemaFilename,
                },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      }

      const merged: Record<string, unknown> = { ...(catProps || {}) };
      const filter = propertyFilter?.toLowerCase();
      const rows = Object.entries(merged)
        .filter(([name]) => !filter || name.toLowerCase().includes(filter))
        .map(([name, spec]) => ({ name, ...summarizePropertySpec(schema, spec) }))
        .sort((a, b) => a.name.localeCompare(b.name));

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                schemaFile: schemaFilename,
                visualType,
                category,
                properties: rows,
                count: rows.length,
                note:
                  "Inline formatting (add_visual containerFormat/visualFormat, format_visual) overrides the report theme. Properties are valid both in per-visual formatting and under theme.visualStyles[type][category][0].",
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );
}

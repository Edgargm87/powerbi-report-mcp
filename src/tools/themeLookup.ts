import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as path from "path";
import {
  loadSchema,
  getCategoriesForVisualType,
  summarizePropertySpec,
} from "../helpers/themeSchema.js";

// ---------------------------------------------------------------------------
// pbir_lookup_theme_property — discovery surface over the bundled PBI theme schema.
// See src/helpers/themeSchema.ts for the shared walker (also used by the
// pbir_format_visual validator).
// ---------------------------------------------------------------------------

export function registerThemeLookupTool(server: McpServer): void {
  server.tool(
    "pbir_lookup_theme_property",
    "Query the bundled Power BI theme schema for valid visualStyles property names. No args = list visual types; +visualType = list categories; +category = list properties with types/enums.",
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
    {"readOnlyHint":true,"openWorldHint":false},
    async ({ visualType, category, propertyFilter }) => {
      const { schema, file } = loadSchema();
      const schemaFilename = path.basename(file);

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
                  error: `Unknown visualType: "${visualType}". Call pbir_lookup_theme_property with no arguments to list valid types.`,
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
                  "Inline formatting (pbir_add_visual containerFormat/visualFormat, pbir_format_visual) overrides the report theme. Properties are valid both in per-visual formatting and under theme.visualStyles[type][category][0].",
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

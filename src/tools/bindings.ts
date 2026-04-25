import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { BucketBindingSchema } from "../helpers/createVisual.js";
import type { FieldSpecInput } from "../helpers/createVisual.js";
import type { ServerContext } from "../context.js";
import { requireProject } from "../context.js";
import { invalidateCache } from "../model-usage.js";
import { runBindingValidation, attachBindingValidationMetadata } from "../helpers/bindingValidation.js";
import { applyBindingsToVisual } from "../helpers/bindingApply.js";
import { resolvePageId } from "../helpers/resolvePage.js";
import { invalidateScope } from "../helpers/readCache.js";

export function registerBindingTools(server: McpServer, ctx: ServerContext): void {
  // ============================================================
  // TOOL: update_visual_bindings
  // ============================================================
  server.tool(
    "update_visual_bindings",
    `Update the data bindings of an existing visual. Replaces the query state entirely. Supports Table[Column] shorthand: use { "field": "Sales[Net Price]", "type": "measure" } as an alternative to separate entity/property fields.`,
    {
      pageId: z.string().describe("The page ID"),
      visualId: z.string().describe("The visual ID"),
      bindings: z.preprocess((v) => typeof v === "string" ? JSON.parse(v) : v, z.array(BucketBindingSchema)).describe("New data bindings"),
      autoFilters: z.boolean().optional().default(true),
      strictBindings: z
        .boolean()
        .optional()
        .describe(
          "Binding validation: true=strict (default, fail on unknown field), false=warn (proceed with warnings). Omit for env default."
        ),
    },
    {"openWorldHint":false},
    async ({ pageId, visualId, bindings, autoFilters, strictBindings }) => {
      const _g = requireProject(ctx); if (_g) return _g;
      // Binding validation — before any write.
      const validationBindings = bindings.map((b) => ({
        bucket: b.bucket,
        fields: b.fields as FieldSpecInput[],
      }));
      const validation = runBindingValidation(ctx.project, validationBindings, strictBindings);
      if (!validation.proceed) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: false,
                  error: "binding_validation_failed",
                  bindingErrors: validation.errors,
                  mode: validation.mode,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      const visual = ctx.project.getVisual(pageId, visualId);
      applyBindingsToVisual(
        visual,
        bindings.map((b) => ({ bucket: b.bucket, fields: b.fields as FieldSpecInput[] })),
        { autoFilters: autoFilters ?? true }
      );

      ctx.project.saveVisual(pageId, visualId, visual);
      invalidateCache();
      invalidateScope(`page:${pageId}`);
      const response: Record<string, unknown> = { success: true, visualId };
      attachBindingValidationMetadata(response, validation);
      return {
        content: [{ type: "text", text: JSON.stringify(response) }],
      };
    }
  );
}

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { generateId, VISUAL_BUCKETS } from "../pbir.js";
import type { VisualDefinition } from "../pbir.js";
import {
  VisualSpecSchema,
  BucketBindingSchema,
  FormatCategorySchema,
  DataColorSchema,
  createAndSaveVisual,
} from "../helpers/createVisual.js";
import type { VisualSpec, FieldSpecInput } from "../helpers/createVisual.js";
import type { ServerContext } from "../context.js";
import { invalidateCache } from "../model-usage.js";
import { runBindingValidation, isNoteworthySkip } from "../helpers/bindingValidation.js";
import { extractVisualTitle } from "../helpers/extractTitle.js";
import { runLayoutValidation, getCanvasSummary } from "../helpers/layoutValidation.js";
import type { WireframeVisual } from "../wireframe-validator.js";

export function registerVisualTools(server: McpServer, ctx: ServerContext): void {
  // ============================================================
  // TOOL: get_visual_types
  // ============================================================
  server.tool(
    "get_visual_types",
    "Get a list of available visual types and their data role buckets",
    {},
    async () => {
      return { content: [{ type: "text", text: JSON.stringify(VISUAL_BUCKETS, null, 2) }] };
    }
  );

  // ============================================================
  // TOOL: list_visuals
  // ============================================================
  server.tool(
    "list_visuals",
    "List all visuals on a page. Slim mode (default) returns id, type, x, y, w, h and title if set. Set slim=false for full position object and filter count.",
    {
      pageId: z.string().describe("The page ID"),
      slim: z.boolean().optional().default(true).describe("Slim mode (default true) — flat short keys, omits z/tabOrder/filterCount to reduce token usage"),
    },
    async ({ pageId, slim }) => {
      const visualIds = ctx.project.listVisualIds(pageId);
      const visuals = visualIds.map((id) => {
        const v = ctx.project.getVisual(pageId, id);
        const titleValue = extractVisualTitle(v.visual.visualContainerObjects);

        if (slim) {
          const entry: Record<string, unknown> = {
            id,
            type: v.visual.visualType,
            x: v.position.x,
            y: v.position.y,
            w: v.position.width,
            h: v.position.height,
          };
          if (titleValue) entry.title = titleValue;
          return entry;
        }

        return {
          id,
          visualType: v.visual.visualType,
          position: v.position,
          title: titleValue,
          filterCount: v.filterConfig?.filters?.length ?? 0,
        };
      });
      return { content: [{ type: "text", text: JSON.stringify(visuals, null, 2) }] };
    }
  );

  // ============================================================
  // TOOL: get_visual
  // ============================================================
  server.tool(
    "get_visual",
    "Get visual details. Slim mode (default) returns type, position, bindings summary, title, filterCount. Set slim=false for the full raw PBIR JSON.",
    {
      pageId: z.string().describe("The page ID"),
      visualId: z.string().describe("The visual ID"),
      slim: z.boolean().optional().default(true).describe("Slim mode (default true) — summary instead of full JSON"),
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ pageId, visualId, slim }) => {
      const visual = ctx.project.getVisual(pageId, visualId);

      if (!slim) {
        return { content: [{ type: "text", text: JSON.stringify(visual, null, 2) }] };
      }

      // Extract title
      const titleValue = extractVisualTitle(visual.visual.visualContainerObjects);

      // Extract bindings as Table[Field] strings
      const bindings: Record<string, string[]> = {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const qs = (visual.visual.query as any)?.queryState;
      if (qs) {
        for (const [bucket, state] of Object.entries(qs)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const projs: any[] = (state as any)?.projections ?? [];
          bindings[bucket] = projs.map((p) => {
            const f = p.field;
            if (f?.Column) return `${f.Column.Expression?.SourceRef?.Entity}[${f.Column.Property}]`;
            if (f?.Measure) return `${f.Measure.Expression?.SourceRef?.Entity}[${f.Measure.Property}]`;
            if (f?.Aggregation?.Expression?.Column) {
              const col = f.Aggregation.Expression.Column;
              return `${col.Expression?.SourceRef?.Entity}[${col.Property}]`;
            }
            return "(unknown)";
          });
        }
      }

      const result: Record<string, unknown> = {
        id: visual.name,
        type: visual.visual.visualType,
        x: visual.position.x,
        y: visual.position.y,
        w: visual.position.width,
        h: visual.position.height,
      };
      if (titleValue) result.title = titleValue;
      if (Object.keys(bindings).length > 0) result.bindings = bindings;
      result.filterCount = visual.filterConfig?.filters?.length ?? 0;

      // Slicer-specific surface area: mode + selection state.
      // Detection rules:
      //   slicerMode    ← objects.data[0].properties.mode.expr.Literal.Value (strip quotes)
      //                   defaults: slicer→"Dropdown", listSlicer/textSlicer→n/a
      //   multiSelect   ← objects.selection[0].properties.singleSelect.expr.Literal.Value
      //                     "false" → multiSelect=true
      //                     "true"  → multiSelect=false
      //                     absent  → infer from PBI default (Dropdown=false, Basic/listSlicer=true)
      const SLICER_TYPES = new Set(["slicer", "listSlicer", "textSlicer", "advancedSlicerVisual"]);
      const vType = visual.visual.visualType;
      if (SLICER_TYPES.has(vType)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const objs = visual.visual.objects as any;
        let slicerMode: string | undefined;
        if (vType === "slicer") {
          const modeLit = objs?.data?.[0]?.properties?.mode?.expr?.Literal?.Value;
          if (typeof modeLit === "string") {
            slicerMode = modeLit.replace(/^'|'$/g, "");
          } else {
            slicerMode = "Dropdown"; // PBI default
          }
          result.slicerMode = slicerMode;
        }
        const singleLit = objs?.selection?.[0]?.properties?.singleSelect?.expr?.Literal?.Value;
        let multiSelect: boolean;
        if (singleLit === "true") {
          multiSelect = false;
        } else if (singleLit === "false") {
          multiSelect = true;
        } else {
          // No explicit setting — apply PBI default for the variant
          multiSelect = vType === "slicer" ? slicerMode !== "Dropdown" : true;
        }
        result.multiSelect = multiSelect;
      }

      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ============================================================
  // TOOL: add_visual (single + batch mode)
  // ============================================================
  server.tool(
    "add_visual",
    "Add one or more visuals to a page. Single mode: top-level params. Batch mode: 'visuals' array. Inline containerFormat/visualFormat/dataColors = 0 extra format calls. Chart naming: columnChart=stacked column (Series=stack), barChart=stacked bar (Series=stack), clusteredColumnChart=clustered column, clusteredBarChart=clustered bar. Call get_visual_types for full type list.",
    {
      pageId: z.string().describe("The page ID to add the visual(s) to"),
      // Single mode params
      visualType: z.string().optional().describe("Visual type for single mode"),
      x: z.number().optional().default(0),
      y: z.number().optional().default(0),
      width: z.number().optional().default(280),
      height: z.number().optional().default(280),
      bindings: z.array(BucketBindingSchema).optional(),
      autoFilters: z.boolean().optional().default(true),
      slicerMode: z.enum(["Basic", "Dropdown"]).optional(),
      multiSelect: z
        .boolean()
        .optional()
        .describe(
          "Slicer selection mode (slicer/listSlicer). true=multi-select, false=single-select. Omit for PBI default."
        ),
      shapeType: z
        .enum(["rectangle", "rectangleRounded", "line", "tabCutCorner", "tabCutTopCorners", "tabRoundCorner", "tabRoundTopCorners"])
        .optional(),
      shapeRotation: z.number().optional().default(0),
      fillColor: z.string().optional(),
      textContent: z.string().optional(),
      textColor: z.string().optional(),
      textAlign: z.enum(["left", "center", "right"]).optional(),
      textSize: z.number().optional(),
      textBold: z.boolean().optional(),
      title: z.string().optional(),
      strictBindings: z
        .boolean()
        .optional()
        .describe(
          "Binding validation: true=strict (fail on unknown field, default), false=warn (proceed with warnings). Omit for env default (MCP_BINDING_VALIDATION)."
        ),
      strictLayout: z
        .boolean()
        .optional()
        .describe(
          "Layout validation: true=strict (default, reject overflow/overlap/margin violations), false=warn (proceed with warnings). Omit for env default (MCP_LAYOUT_VALIDATION). Canvas is 1280x720 with 15px L/R and 6px bottom margins, 5px gaps."
        ),
      containerFormat: z.array(FormatCategorySchema).optional().describe("Inline container formatting"),
      visualFormat: z.array(FormatCategorySchema).optional().describe("Inline visual formatting"),
      dataColors: z.array(DataColorSchema).optional().describe("Inline data point colors"),
      // Image params
      imageUrl: z.string().optional().describe("Image URL (image visual only)"),
      imageScaling: z.enum(["fit", "fill", "normal"]).optional().describe("Image scaling (default fit)"),
      // actionButton params
      buttonText: z.string().optional().describe("Button label (actionButton only)"),
      buttonAction: z
        .enum(["pageNavigation", "URL", "bookmark", "back"])
        .optional()
        .describe("Button action type"),
      buttonActionTarget: z
        .string()
        .optional()
        .describe("Action target: page ID for pageNavigation, URL for URL, bookmark ID for bookmark"),
      // Batch mode
      visuals: z
        .array(VisualSpecSchema)
        .optional()
        .describe("Array of visuals to add (batch mode). When provided, top-level visual params are ignored."),
    },
    async (params) => {
      const { pageId } = params;

      const existingVisuals = ctx.project.listVisualIds(pageId);
      let maxZ = 0;
      for (const vid of existingVisuals) {
        const v = ctx.project.getVisual(pageId, vid);
        if (v.position.z > maxZ) maxZ = v.position.z;
      }

      let specs: VisualSpec[];
      if (params.visuals && params.visuals.length > 0) {
        specs = params.visuals as VisualSpec[];
      } else if (params.visualType) {
        specs = [
          {
            visualType: params.visualType,
            x: params.x,
            y: params.y,
            width: params.width,
            height: params.height,
            bindings: params.bindings as VisualSpec["bindings"],
            autoFilters: params.autoFilters,
            slicerMode: params.slicerMode as VisualSpec["slicerMode"],
            multiSelect: params.multiSelect,
            shapeType: params.shapeType,
            shapeRotation: params.shapeRotation,
            fillColor: params.fillColor,
            textContent: params.textContent,
            textColor: params.textColor,
            textAlign: params.textAlign as VisualSpec["textAlign"],
            textSize: params.textSize,
            textBold: params.textBold,
            title: params.title,
            containerFormat: params.containerFormat as VisualSpec["containerFormat"],
            visualFormat: params.visualFormat as VisualSpec["visualFormat"],
            dataColors: params.dataColors as VisualSpec["dataColors"],
            imageUrl: params.imageUrl,
            imageScaling: params.imageScaling as VisualSpec["imageScaling"],
            buttonText: params.buttonText,
            buttonAction: params.buttonAction as VisualSpec["buttonAction"],
            buttonActionTarget: params.buttonActionTarget,
          },
        ];
      } else {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: false,
                error: "Provide either 'visualType' (single) or 'visuals' array (batch)",
              }),
            },
          ],
        };
      }

      // Binding validation (strict / warn / off).
      // Flatten bindings across every spec in the call so one validator pass
      // covers the whole batch. Fields with no bindings (shapes, text,
      // buttons, images) contribute nothing and are skipped.
      const allBindings: Array<{ bucket: string; fields: FieldSpecInput[] }> = [];
      for (const spec of specs) {
        if (spec.bindings) {
          for (const b of spec.bindings) {
            allBindings.push({
              bucket: b.bucket,
              fields: b.fields as FieldSpecInput[],
            });
          }
        }
      }
      const validation = runBindingValidation(ctx.project, allBindings, params.strictBindings);
      if (!validation.proceed) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: false,
                  error: validation.message,
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

      // Layout validation — run against EVERY visual that will be on the
      // page after this call completes. Existing visuals + the new specs.
      // Validator needs the full picture to spot overlaps/alignment.
      const existingWireframe: WireframeVisual[] = existingVisuals.map((vid) => {
        const v = ctx.project.getVisual(pageId, vid);
        return {
          id: vid,
          visualType: v.visual.visualType,
          x: v.position.x,
          y: v.position.y,
          width: v.position.width,
          height: v.position.height,
          title: extractVisualTitle(v.visual.visualContainerObjects) || undefined,
        };
      });
      const newWireframe: WireframeVisual[] = specs.map((s, i) => ({
        id: `__pending_${i}`,
        visualType: s.visualType,
        x: s.x ?? 0,
        y: s.y ?? 0,
        width: s.width ?? 280,
        height: s.height ?? 280,
        title: s.title,
      }));
      const layoutValidation = runLayoutValidation(
        [...existingWireframe, ...newWireframe],
        params.strictLayout
      );
      if (!layoutValidation.proceed) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: false,
                  error: "layout_validation_failed",
                  hint: "Set strictLayout:false to proceed with warnings, or fix the positions per `suggestion`. Canvas constants echoed for grounding.",
                  mode: layoutValidation.mode,
                  canvas: layoutValidation.canvas,
                  layoutErrors: layoutValidation.errors,
                  layoutWarnings: layoutValidation.warnings,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      const results: Array<{ visualId: string; visualType: string }> = [];
      for (let i = 0; i < specs.length; i++) {
        const result = createAndSaveVisual(ctx.project, pageId, specs[i], maxZ + (i + 1) * 1000);
        results.push(result);
      }

      invalidateCache();
      const response: Record<string, unknown> = {
        success: true,
        pageId,
        created: results,
        canvas: getCanvasSummary(),
      };
      if (validation.errors.length > 0) {
        response.bindingWarnings = validation.errors;
        response.bindingWarningMessage = validation.message;
      }
      if (isNoteworthySkip(validation.skipReason)) {
        response.bindingValidation = {
          skipped: validation.skipReason,
          note: "Bindings were NOT checked against the semantic model. Double-check field names — a typo will load silently and render nothing.",
        };
      }
      if (layoutValidation.warnings.length > 0) {
        response.layoutWarnings = layoutValidation.warnings;
      }
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(response, null, 2),
          },
        ],
      };
    }
  );

  // ============================================================
  // TOOL: delete_visual
  // ============================================================
  server.tool(
    "delete_visual",
    "Delete a visual from a page",
    {
      pageId: z.string().describe("The page ID"),
      visualId: z.string().describe("The visual ID to delete"),
    },
    async ({ pageId, visualId }) => {
      ctx.project.deleteVisual(pageId, visualId);
      invalidateCache();
      return {
        content: [{ type: "text", text: JSON.stringify({ success: true, deletedVisualId: visualId }) }],
      };
    }
  );

  // ============================================================
  // TOOL: move_visual
  // ============================================================
  server.tool(
    "move_visual",
    "Move and/or resize a visual on a page",
    {
      pageId: z.string().describe("The page ID"),
      visualId: z.string().describe("The visual ID"),
      x: z.number().optional().describe("New X position"),
      y: z.number().optional().describe("New Y position"),
      width: z.number().optional().describe("New width"),
      height: z.number().optional().describe("New height"),
      z: z.number().optional().describe("New z-order (layer)"),
    },
    async ({ pageId, visualId, x, y, width, height, z }) => {
      const visual = ctx.project.getVisual(pageId, visualId);
      if (x !== undefined) visual.position.x = x;
      if (y !== undefined) visual.position.y = y;
      if (width !== undefined) visual.position.width = width;
      if (height !== undefined) visual.position.height = height;
      if (z !== undefined) {
        visual.position.z = z;
        visual.position.tabOrder = z;
      }
      ctx.project.saveVisual(pageId, visualId, visual);
      return {
        content: [{ type: "text", text: JSON.stringify({ success: true, position: visual.position }) }],
      };
    }
  );

  // ============================================================
  // TOOL: duplicate_visual
  // ============================================================
  server.tool(
    "duplicate_visual",
    "Duplicate an existing visual, optionally to a different page or position",
    {
      pageId: z.string().describe("Source page ID"),
      visualId: z.string().describe("Visual ID to duplicate"),
      targetPageId: z.string().optional().describe("Target page ID (defaults to same page)"),
      offsetX: z.number().optional().default(20).describe("X offset for the duplicate"),
      offsetY: z.number().optional().default(20).describe("Y offset for the duplicate"),
    },
    async ({ pageId, visualId, targetPageId, offsetX, offsetY }) => {
      const original = ctx.project.getVisual(pageId, visualId);
      const newId = generateId();
      const target = targetPageId || pageId;

      const duplicate: VisualDefinition = JSON.parse(JSON.stringify(original));
      duplicate.name = newId;
      duplicate.position.x += offsetX;
      duplicate.position.y += offsetY;
      duplicate.position.z += 1000;
      duplicate.position.tabOrder += 1000;

      if (duplicate.filterConfig?.filters) {
        for (const f of duplicate.filterConfig.filters) {
          f.name = generateId();
        }
      }

      ctx.project.saveVisual(target, newId, duplicate);
      invalidateCache();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ success: true, newVisualId: newId, targetPageId: target }),
          },
        ],
      };
    }
  );

  // ============================================================
  // TOOL: change_visual_type
  // ============================================================
  server.tool(
    "change_visual_type",
    "Change the visual type of an existing visual (e.g. barChart to columnChart) while keeping data bindings",
    {
      pageId: z.string().describe("The page ID"),
      visualId: z.string().describe("The visual ID"),
      visualType: z.string().describe("The new visual type"),
    },
    async ({ pageId, visualId, visualType }) => {
      const visual = ctx.project.getVisual(pageId, visualId);
      visual.visual.visualType = visualType;
      ctx.project.saveVisual(pageId, visualId, visual);
      invalidateCache();
      return {
        content: [{ type: "text", text: JSON.stringify({ success: true, visualId, visualType }) }],
      };
    }
  );
}

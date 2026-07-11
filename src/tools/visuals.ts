import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { generateId, VISUAL_BUCKETS } from "../pbir.js";
import type { VisualDefinition, QueryState, Projection } from "../pbir.js";
import {
  VisualSpecSchema,
  createAndSaveVisual,
  beginBindingAutoCorrections,
  drainBindingAutoCorrections,
} from "../helpers/createVisual.js";
import type { VisualSpec, FieldSpecInput } from "../helpers/createVisual.js";
import type { ServerContext } from "../context.js";
import { requireProject } from "../context.js";
import { invalidateCache } from "../model-usage.js";
import { runBindingValidation, attachBindingValidationMetadata } from "../helpers/bindingValidation.js";
import {
  checkCustomVisualsAvailable,
  getRegisteredCustomVisuals,
} from "../helpers/customVisualValidation.js";
import { extractVisualTitle } from "../helpers/extractTitle.js";
import { runLayoutValidation } from "../helpers/layoutValidation.js";
import { validateFormatTypos } from "../helpers/themeIndex.js";
import { resolvePageId } from "../helpers/resolvePage.js";
import { cachedRead, invalidateScope } from "../helpers/readCache.js";
import type { WireframeVisual } from "../wireframe-validator.js";

export function registerVisualTools(server: McpServer, ctx: ServerContext): void {
  // ============================================================
  // TOOL: pbir_get_visual_types
  // ============================================================
  server.tool(
    "pbir_get_visual_types",
    "List available visual types. Default returns slim type list (~150 tokens). Pass verbose:true for per-type data-role bucket metadata (~1,200 tokens).",
    {
      verbose: z
        .boolean()
        .optional()
        .describe("If true, return the full {type: [buckets...]} map. Default false returns {types:[...], count}."),
    },
    {"readOnlyHint":true,"openWorldHint":false},
    async ({ verbose }: { verbose?: boolean }) => {
      if (verbose) {
        return { content: [{ type: "text", text: JSON.stringify(VISUAL_BUCKETS, null, 2) }] };
      }
      const types = Object.keys(VISUAL_BUCKETS).sort();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ success: true, types, count: types.length }),
          },
        ],
      };
    }
  );

  // ============================================================
  // TOOL: pbir_list_custom_visuals
  // ============================================================
  server.tool(
    "pbir_list_custom_visuals",
    "List custom visuals (AppSource/organizational, e.g. 'htmlContent<32-hex-guid>') actually registered/installed in the connected report. Only these visualTypes can be safely used by pbir_add_visual / pbir_change_visual_type — anything else fails to render in Desktop even though the PBIR JSON is valid.",
    {},
    { readOnlyHint: true, openWorldHint: false },
    async () => {
      const _g = requireProject(ctx); if (_g) return _g;
      const registered = getRegisteredCustomVisuals(ctx.project);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ success: true, customVisuals: registered, count: registered.length }),
          },
        ],
      };
    }
  );

  // ============================================================
  // TOOL: pbir_list_visuals
  // ============================================================
  server.tool(
    "pbir_list_visuals",
    "List visuals on a page (paginated). Default slim returns id/type/x/y/w/h/title. slim:false includes filterCount. Use limit/offset to page through large pages. Use `visualType` to filter for cross-page sweeps in combination with `pbir_list_pages` per-page iteration.",
    {
      pageId: z.string().optional().describe("Page ID. Auto-resolved when only one page exists."),
      slim: z.boolean().optional().default(true),
      visualType: z.string().optional().describe("Return only visuals matching this type (e.g. 'slicer', 'tableEx'). Case-sensitive. Filtered before pagination — `total` reflects filtered count."),
      limit: z.number().int().min(1).max(500).default(100).describe("Max items to return. Default 100."),
      offset: z.number().int().min(0).default(0).describe("Items to skip. Use with limit for paging."),
    },
    {"readOnlyHint":true,"openWorldHint":false},
    async ({ pageId, slim, visualType, limit, offset }) => {
      const _g = requireProject(ctx); if (_g) return _g;
      const r = resolvePageId(ctx.project, pageId);
      if (!r.resolved) return r.errorResponse;
      pageId = r.pageId;
      const finalPageId = pageId;
      const finalLimit = limit ?? 100;
      const finalOffset = offset ?? 0;
      return cachedRead("pbir_list_visuals", { pageId: finalPageId, slim, visualType, limit: finalLimit, offset: finalOffset }, [`page:${finalPageId}`], () => {
      const visualIds = ctx.project.listVisualIds(finalPageId);
      const allVisualsUnfiltered = visualIds.map((id) => {
        const v = ctx.project.getVisual(finalPageId, id);
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
      // visualType filter (v0.9.2). Filter BEFORE pagination so `total` is
      // the filtered count and pagination math stays correct. The slim
      // entry uses `type`; the verbose entry uses `visualType` — check
      // both to handle either projection. Case-sensitive per the param doc.
      const allVisuals = visualType
        ? allVisualsUnfiltered.filter((v) => {
            const t = (v as { type?: string; visualType?: string }).type
              ?? (v as { type?: string; visualType?: string }).visualType;
            return t === visualType;
          })
        : allVisualsUnfiltered;
      const total = allVisuals.length;
      const sliced = allVisuals.slice(finalOffset, finalOffset + finalLimit);
      const truncated = total > finalOffset + sliced.length;
      const nextOffset = truncated ? finalOffset + sliced.length : null;
      // Canonical aliases (has_more/next_offset/total_count) ship alongside
      // the legacy fields per MCP best-practices doc.
      return {
        visuals: sliced,
        total,
        total_count: total,
        truncated,
        has_more: truncated,
        nextOffset,
        next_offset: nextOffset,
      };
      });
    }
  );

  // ============================================================
  // TOOL: pbir_get_visual
  // ============================================================
  server.tool(
    "pbir_get_visual",
    "Get visual details. Default returns id/type/position/title/bindings summary. verbose:true returns full PBIR JSON.",
    {
      pageId: z.string().optional().describe("Page ID. Auto-resolved when only one page exists."),
      visualId: z.string().describe("The visual ID"),
      verbose: z.boolean().optional().describe("Full raw PBIR JSON (heavy)."),
      slim: z.boolean().optional().describe("Deprecated alias for !verbose."),
    },
    {"readOnlyHint":true,"openWorldHint":false},
    async ({ pageId, visualId, verbose, slim }) => {
      const _g = requireProject(ctx); if (_g) return _g;
      const r = resolvePageId(ctx.project, pageId);
      if (!r.resolved) return r.errorResponse;
      pageId = r.pageId;
      const finalPageId = pageId;
      // Default = slim. verbose:true OR legacy slim:false → full JSON.
      const wantFull = verbose === true || slim === false;
      return cachedRead(
        "pbir_get_visual",
        { pageId: finalPageId, visualId, verbose: wantFull },
        [`page:${finalPageId}`],
        () => {
      const visual = ctx.project.getVisual(finalPageId, visualId);
      if (wantFull) {
        return visual;
      }

      // Extract title
      const titleValue = extractVisualTitle(visual.visual.visualContainerObjects);

      // Extract bindings as Table[Field] strings
      const bindings: Record<string, string[]> = {};
      const qs: QueryState | undefined = visual.visual.query?.queryState;
      if (qs) {
        for (const [bucket, state] of Object.entries(qs)) {
          const projs: Projection[] = state?.projections ?? [];
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
        const objs = visual.visual.objects as Record<string, unknown> | undefined;
        const dataArr = objs?.data as Array<{ properties?: { mode?: { expr?: { Literal?: { Value?: unknown } } } } }> | undefined;
        const selectionArr = objs?.selection as Array<{ properties?: { singleSelect?: { expr?: { Literal?: { Value?: unknown } } } } }> | undefined;
        let slicerMode: string | undefined;
        if (vType === "slicer") {
          const modeLit = dataArr?.[0]?.properties?.mode?.expr?.Literal?.Value;
          if (typeof modeLit === "string") {
            slicerMode = modeLit.replace(/^'|'$/g, "");
          } else {
            slicerMode = "Dropdown"; // PBI default
          }
          result.slicerMode = slicerMode;
        }
        const singleLit = selectionArr?.[0]?.properties?.singleSelect?.expr?.Literal?.Value;
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

      return result;
        }
      );
    }
  );

  // ============================================================
  // TOOL: pbir_add_visual (single + batch mode)
  // ============================================================
  server.tool(
    "pbir_add_visual",
    "Add visuals to a page via `visuals: [...]` batch. Inline containerFormat/visualFormat/dataColors per entry avoids extra pbir_format_visual calls. Stacked charts need a Series binding; 'KPI card' = `card` with one measure; scatter uses `Category` bucket. Use pbir_lookup_theme_property for valid category/property names.",
    {
      pageId: z.string().optional().describe("Auto-resolved when only one page exists."),
      visuals: z.array(VisualSpecSchema),
      strictBindings: z
        .boolean()
        .optional()
        .describe("true=strict, false=warn. Omit for env default."),
      strictLayout: z
        .boolean()
        .optional()
        .describe("true=strict, false=warn. Canvas 1280x720, 15px L/R / 6px bottom margins, 5px gaps. Omit for env default."),
      strictCustomVisual: z
        .boolean()
        .optional()
        .describe("true=strict (default), false=warn. Blocks visualTypes that look like a custom visual (e.g. 'htmlContent<32-hex-guid>') but aren't registered in this report's publicCustomVisuals. Use pbir_list_custom_visuals to see what's installed."),
      includeTypes: z
        .boolean()
        .optional()
        .describe("Return [{visualId,visualType}] instead of flat id list."),
    },
    {"openWorldHint":false},
    async (params) => {
      const _g = requireProject(ctx); if (_g) return _g;
      const r = resolvePageId(ctx.project, params.pageId);
      if (!r.resolved) return r.errorResponse;
      const pageId = r.pageId;

      const existingVisuals = ctx.project.listVisualIds(pageId);
      let maxZ = 0;
      for (const vid of existingVisuals) {
        const v = ctx.project.getVisual(pageId, vid);
        if (v.position.z > maxZ) maxZ = v.position.z;
      }

      const specs: VisualSpec[] = params.visuals as VisualSpec[];

      // Cheap typo catcher — flag misspelled category/property names against
      // the bundled schema BEFORE we burn binding/layout cycles. Always-on,
      // no opt-out. Unknown visualType → no-op (schema lag tolerance).
      const typoIssues: Array<{ visualIndex: number } & ReturnType<typeof validateFormatTypos>[number]> = [];
      for (let i = 0; i < specs.length; i++) {
        const s = specs[i];
        const entries = [
          ...(s.containerFormat ?? []),
          ...(s.visualFormat ?? []),
        ];
        if (entries.length === 0) continue;
        const issues = validateFormatTypos(s.visualType, entries);
        for (const issue of issues) typoIssues.push({ visualIndex: i, ...issue });
      }
      if (typoIssues.length > 0) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: false,
                  error: "format_typo",
                  issues: typoIssues.map(({ visualIndex, category, prop, didYouMean }) => ({
                    visualIndex,
                    cat: category,
                    ...(prop ? { prop } : {}),
                    didYouMean,
                  })),
                },
                null,
                2
              ),
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

      // Custom-visual availability check (strict / warn / off). Catches the
      // exact failure mode we hit building the Fintra/colleague dashboards:
      // binding to a custom visualType that isn't registered in THIS report's
      // publicCustomVisuals produces a well-formed but dead visual in Desktop.
      const customVisualCheck = checkCustomVisualsAvailable(
        ctx.project,
        specs.map((s) => s.visualType),
        params.strictCustomVisual
      );
      if (!customVisualCheck.proceed) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: false,
                  error: "custom_visual_not_registered",
                  hint: "These visualTypes aren't installed in this report. Set strictCustomVisual:false to proceed anyway, or install the visual in Desktop first. Use pbir_list_custom_visuals to see what's registered.",
                  mode: customVisualCheck.mode,
                  unregistered: customVisualCheck.unregistered,
                  registered: customVisualCheck.registered,
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
      beginBindingAutoCorrections();
      for (let i = 0; i < specs.length; i++) {
        const result = createAndSaveVisual(
          ctx.project,
          pageId,
          specs[i],
          maxZ + (i + 1) * 1000,
          validation.inventory
        );
        results.push(result);
      }
      const corrections = drainBindingAutoCorrections();

      invalidateCache();
      invalidateScope(`page:${pageId}`);
      // Slim by default: ship a flat string[] of ids. The 150-token canvas
      // object only ships when the LLM asks for it on pbir_create_page or when
      // layout validation fails — sending it on every successful add is
      // pure carry-forward bloat.
      const response: Record<string, unknown> = {
        success: true,
        pageId,
        created: params.includeTypes
          ? results
          : results.map((r) => r.visualId),
      };
      if (corrections.length > 0) response.bindingAutoCorrections = corrections;
      attachBindingValidationMetadata(response, validation);
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
  // TOOL: pbir_delete_visual
  // ============================================================
  server.tool(
    "pbir_delete_visual",
    "Permanently delete one visual from a page. Irreversible. To remove several at once, use `pbir_bulk_delete_visuals`.",
    {
      pageId: z.string().optional().describe("Page ID. Auto-resolved when only one page exists."),
      visualId: z.string().describe("The visual ID to delete"),
    },
    {"destructiveHint":true,"openWorldHint":false},
    async ({ pageId, visualId }) => {
      const _g = requireProject(ctx); if (_g) return _g;
      const r = resolvePageId(ctx.project, pageId);
      if (!r.resolved) return r.errorResponse;
      pageId = r.pageId;
      ctx.project.deleteVisual(pageId, visualId);
      invalidateCache();
      invalidateScope(`page:${pageId}`);
      return {
        content: [{ type: "text", text: JSON.stringify({ success: true, deletedVisualId: visualId }) }],
      };
    }
  );

  // ============================================================
  // TOOL: pbir_move_visual
  // ============================================================
  server.tool(
    "pbir_move_visual",
    "Move, resize, and/or change the stacking (z) order of a visual on a page. x/y/width/height/z are all optional — only the ones you pass are changed.",
    {
      pageId: z.string().optional().describe("Page ID. Auto-resolved when only one page exists."),
      visualId: z.string().describe("The visual ID"),
      x: z.number().optional(),
      y: z.number().optional(),
      width: z.number().optional(),
      height: z.number().optional(),
      z: z.number().optional().describe("z-order"),
    },
    {"openWorldHint":false},
    async ({ pageId, visualId, x, y, width, height, z }) => {
      const _g = requireProject(ctx); if (_g) return _g;
      const r = resolvePageId(ctx.project, pageId);
      if (!r.resolved) return r.errorResponse;
      pageId = r.pageId;
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
      invalidateScope(`page:${pageId}`);
      return {
        content: [{ type: "text", text: JSON.stringify({ success: true, position: visual.position }) }],
      };
    }
  );

  // ============================================================
  // TOOL: pbir_duplicate_visual
  // ============================================================
  server.tool(
    "pbir_duplicate_visual",
    "Duplicate an existing visual, optionally to a different page or position",
    {
      pageId: z.string().describe("Source page ID"),
      visualId: z.string().describe("Visual ID to duplicate"),
      targetPageId: z.string().optional().describe("Target page ID (defaults to same page)"),
      offsetX: z.number().optional().default(20).describe("X offset for the duplicate"),
      offsetY: z.number().optional().default(20).describe("Y offset for the duplicate"),
    },
    {"openWorldHint":false},
    async ({ pageId, visualId, targetPageId, offsetX, offsetY }) => {
      const _g = requireProject(ctx); if (_g) return _g;
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
      invalidateScope(`page:${target}`);
      if (target !== pageId) invalidateScope(`page:${pageId}`);
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
  // TOOL: pbir_change_visual_type
  // ============================================================
  server.tool(
    "pbir_change_visual_type",
    "Change the visual type of an existing visual (e.g. barChart to columnChart) while keeping data bindings",
    {
      pageId: z.string().describe("The page ID"),
      visualId: z.string().describe("The visual ID"),
      visualType: z.string().describe("The new visual type"),
      strictCustomVisual: z
        .boolean()
        .optional()
        .describe("true=strict (default), false=warn. Blocks switching to a custom visualType that isn't registered in this report's publicCustomVisuals. Use pbir_list_custom_visuals to see what's installed."),
    },
    {"openWorldHint":false},
    async ({ pageId, visualId, visualType, strictCustomVisual }) => {
      const _g = requireProject(ctx); if (_g) return _g;
      const customVisualCheck = checkCustomVisualsAvailable(ctx.project, [visualType], strictCustomVisual);
      if (!customVisualCheck.proceed) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: false,
                  error: "custom_visual_not_registered",
                  hint: "This visualType isn't installed in this report. Set strictCustomVisual:false to proceed anyway, or install the visual in Desktop first. Use pbir_list_custom_visuals to see what's registered.",
                  mode: customVisualCheck.mode,
                  unregistered: customVisualCheck.unregistered,
                  registered: customVisualCheck.registered,
                },
                null,
                2
              ),
            },
          ],
        };
      }
      const visual = ctx.project.getVisual(pageId, visualId);
      visual.visual.visualType = visualType;
      ctx.project.saveVisual(pageId, visualId, visual);
      invalidateCache();
      invalidateScope(`page:${pageId}`);
      return {
        content: [{ type: "text", text: JSON.stringify({ success: true, visualId, visualType }) }],
      };
    }
  );
}

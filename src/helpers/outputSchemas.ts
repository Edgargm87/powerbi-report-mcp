// ═══════════════════════════════════════════════════════════════════════════════
// Per-tool outputSchema overrides for read tools.
//
// The default registration in src/index.ts applies a loose `{success, error?}`
// envelope to every tool. That satisfies the MCP structured-output contract but
// gives clients zero hint about the actual response shape. This map ships
// tighter zod schemas for the read tools where the shape is well-known —
// clients (Claude Desktop, Cowork, etc.) can use them to render structured
// previews and validate parsed payloads.
//
// Rules of the road:
//   • Every schema uses .passthrough() — adding a new field on the server
//     never breaks an existing schema.
//   • Almost every property is .optional() — handlers vary slim/verbose modes,
//     pagination metadata, cache markers, etc.
//   • Both bare payloads (e.g. cachedRead returns `{pages: [...]}` with no
//     `success: true`) and the fail() envelope (`{success: false, error}`)
//     must validate. We accept both by making `success`/`error` optional and
//     leaving the rest open.
//   • `_cache: "hit"` marker added by readCache.ts is allowed (string).
//
// Mutation tools and tools that emit raw non-JSON text (pbir_guide markdown,
// pbir_get_visual verbose PBIR dump, pbir_get_visual_types VISUAL_BUCKETS
// array dump, pbir_get_report_settings raw report) keep the loose envelope —
// they're either too noisy or not even a JSON object.
// ═══════════════════════════════════════════════════════════════════════════════

import { z } from "zod";

// Common building blocks ------------------------------------------------------

/** Fields that may appear on any read response: success/error envelope + cache hit marker. */
const envelope = {
  success: z.boolean().optional(),
  error: z.string().optional(),
  _cache: z.string().optional(),
};

/** Canvas summary returned by report-level reads — kept loose. */
const canvasSchema = z.object({}).passthrough().optional();

/** Slim page entry. */
const pageEntrySchema = z
  .object({
    id: z.string().optional(),
    displayName: z.string().optional(),
    visualCount: z.number().optional(),
    isActive: z.boolean().optional(),
    hidden: z.boolean().optional(),
    width: z.number().optional(),
    height: z.number().optional(),
    displayOption: z.string().optional(),
    visuals: z.array(z.object({}).passthrough()).optional(),
  })
  .passthrough();

/** Slim visual entry. */
const visualEntrySchema = z
  .object({
    id: z.string().optional(),
    type: z.string().optional(),
    visualType: z.string().optional(),
    x: z.number().optional(),
    y: z.number().optional(),
    w: z.number().optional(),
    h: z.number().optional(),
    title: z.string().optional(),
    position: z.object({}).passthrough().optional(),
    filterCount: z.number().optional(),
  })
  .passthrough();

// Per-tool schemas ------------------------------------------------------------

const listPagesSchema = z
  .object({
    ...envelope,
    pages: z.array(pageEntrySchema).optional(),
    pageCount: z.number().optional(),
    total: z.number().optional(),
    total_count: z.number().optional(),
    totalVisualCount: z.number().optional(),
    truncated: z.boolean().optional(),
    has_more: z.boolean().optional(),
    nextOffset: z.number().nullable().optional(),
    next_offset: z.number().nullable().optional(),
    canvas: canvasSchema,
  })
  .passthrough();

const listVisualsSchema = z
  .object({
    ...envelope,
    pageId: z.string().optional(),
    visualCount: z.number().optional(),
    visuals: z.array(visualEntrySchema).optional(),
    canvas: canvasSchema,
    total: z.number().optional(),
    total_count: z.number().optional(),
    truncated: z.boolean().optional(),
    has_more: z.boolean().optional(),
    nextOffset: z.number().nullable().optional(),
    next_offset: z.number().nullable().optional(),
  })
  .passthrough();

const getVisualSchema = z
  .object({
    ...envelope,
    id: z.string().optional(),
    name: z.string().optional(),
    type: z.string().optional(),
    visualType: z.string().optional(),
    x: z.number().optional(),
    y: z.number().optional(),
    w: z.number().optional(),
    h: z.number().optional(),
    title: z.string().optional(),
    bindings: z.record(z.string(), z.array(z.string())).optional(),
    filterCount: z.number().optional(),
    slicerMode: z.string().optional(),
    multiSelect: z.boolean().optional(),
  })
  .passthrough();

const getReportSchema = z
  .object({
    ...envelope,
    reportPath: z.string().optional(),
    hasSemanticModel: z.boolean().optional(),
  })
  .passthrough();

const listFiltersSchema = z
  .object({
    ...envelope,
    scope: z.string().optional(),
    count: z.number().optional(),
    filters: z.array(z.object({}).passthrough()).optional(),
  })
  .passthrough();

const listBookmarksSchema = z
  .object({
    ...envelope,
    count: z.number().optional(),
    bookmarks: z
      .array(z.object({ id: z.string(), displayName: z.string() }).passthrough())
      .optional(),
  })
  .passthrough();

const listCustomVisualsSchema = z
  .object({
    ...envelope,
    customVisuals: z.array(z.string()).optional(),
    count: z.number().optional(),
  })
  .passthrough();

const listReportThemesSchema = z
  .object({
    ...envelope,
    themeFiles: z
      .array(
        z
          .object({
            filename: z.string().optional(),
            name: z.string().optional(),
            keys: z.array(z.string()).optional(),
          })
          .passthrough()
      )
      .optional(),
  })
  .passthrough();

const getReportThemeSchema = z
  .object({
    ...envelope,
    baseTheme: z.string().nullable().optional(),
    customTheme: z.string().nullable().optional(),
    customThemeContent: z.unknown().optional(),
  })
  .passthrough();

const lookupThemePropertySchema = z
  .object({
    ...envelope,
    schemaFile: z.string().optional(),
    visualTypes: z.array(z.string()).optional(),
    visualType: z.string().optional(),
    categories: z.array(z.object({}).passthrough()).optional(),
    category: z.string().optional(),
    properties: z.array(z.object({}).passthrough()).optional(),
    count: z.number().optional(),
    availableCategories: z.array(z.string()).optional(),
    note: z.string().optional(),
  })
  .passthrough();

const auditThemeComplianceSchema = z
  .object({
    ...envelope,
    pageId: z.string().optional(),
    totalVisuals: z.number().optional(),
    compliantVisuals: z.number().optional(),
    overrideVisuals: z.number().optional(),
    totalFindings: z.number().optional(),
    categoriesAffected: z.number().optional(),
    byCode: z.record(z.string(), z.number()).optional(),
    truncated: z.boolean().optional(),
    returned: z.number().optional(),
    hint: z.string().optional(),
    summary: z.array(z.object({}).passthrough()).optional(),
    details: z.array(z.object({}).passthrough()).optional(),
  })
  .passthrough();

const diffReportThemeSchema = z
  .object({
    ...envelope,
    currentTheme: z.string().optional(),
    summary: z.object({}).passthrough().optional(),
    added: z.record(z.string(), z.unknown()).optional(),
    removed: z.array(z.string()).optional(),
    changed: z.record(z.string(), z.object({}).passthrough()).optional(),
  })
  .passthrough();

const modelUsageSchema = z
  .object({
    ...envelope,
    measures: z.array(z.object({}).passthrough()).optional(),
    columns: z.array(z.object({}).passthrough()).optional(),
    pages: z.array(z.object({}).passthrough()).optional(),
    hiddenPages: z.array(z.string()).optional(),
    unused: z.object({}).passthrough().optional(),
    totals: z.object({}).passthrough().optional(),
    dashboardPath: z.string().optional(),
    cached: z.boolean().optional(),
    timestamp: z.number().optional(),
    parseWarnings: z.array(z.string()).optional(),
  })
  .passthrough();

// Note: pbir_guide is intentionally NOT in READ_TOOL_SCHEMAS below.
// The tool returns markdown text content (skill body) — there is no
// structured JSON shape to validate. Declaring an outputSchema here
// caused the SDK to reject every successful call with "Output validation
// error" (the handler emits content[0].text only, no structuredContent).
// Text-content tools opt out of structured-output validation.

const wireframeIssueSchema = z
  .object({
    severity: z.string().optional(),
    code: z.string().optional(),
    message: z.string().optional(),
    visuals: z.array(z.string()).optional(),
  })
  .passthrough();

const wireframeReportSchema = z
  .object({
    ok: z.boolean().optional(),
    issues: z.array(wireframeIssueSchema).optional(),
    stats: z
      .object({
        visualCount: z.number().optional(),
        errors: z.number().optional(),
        warnings: z.number().optional(),
        coverage: z.number().optional(),
        bottomEdge: z.number().optional(),
        rightEdge: z.number().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

const validateWireframeSchema = z
  .object({
    ...envelope,
    scope: z.string().optional(),
    pageId: z.string().optional(),
    displayName: z.string().optional(),
    report: wireframeReportSchema.optional(),
    pages: z
      .array(
        z
          .object({
            pageId: z.string().optional(),
            displayName: z.string().optional(),
            report: wireframeReportSchema.optional(),
          })
          .passthrough()
      )
      .optional(),
    reportSummary: z
      .object({
        totalErrors: z.number().optional(),
        totalWarnings: z.number().optional(),
        pagesWithErrors: z.number().optional(),
        pageCount: z.number().optional(),
      })
      .passthrough()
      .optional(),
    availableIds: z.array(z.string()).optional(),
    hint: z.string().optional(),
  })
  .passthrough();

const loadToolsSchema = z
  .object({
    ...envelope,
    activeCount: z.number().optional(),
    availableCount: z.number().optional(),
    available: z
      .array(z.object({ name: z.string(), description: z.string() }).passthrough())
      .optional(),
    activated: z.array(z.string()).optional(),
    notFound: z.array(z.string()).optional(),
    hint: z.string().optional(),
    refreshHint: z.string().optional(),
  })
  .passthrough();

// Map shape: tool name → flat shape object suitable for registerTool({outputSchema}).
// MCP SDK expects a record of zod schemas, NOT a top-level z.object — `.shape` on
// a ZodObject returns exactly that record. Each entry below is shipped as the
// per-tool override; tools not in the map fall back to GENERIC_OUTPUT_SCHEMA.
//
// Deferred / left loose (and why):
//   • pbir_get_visual_types     — returns a raw VISUAL_BUCKETS array dump (not a JSON object)
//   • pbir_get_visual (verbose) — returns full raw PBIR JSON; shape too variable
//   • pbir_get_report_settings  — returns the raw report object verbatim
//   • pbir_guide                — returns markdown text content (no JSON shape to validate);
//                                  declaring a schema here caused "Output validation error"
//                                  on every successful call (handler emits content[0].text only)
//   • all mutation tools         — noisier shapes; loose envelope is fine

export const READ_TOOL_SCHEMAS: Record<string, Record<string, z.ZodTypeAny>> = {
  pbir_list_pages: listPagesSchema.shape,
  pbir_list_visuals: listVisualsSchema.shape,
  // pbir_get_visual intentionally omitted: verbose:true returns the full raw
  // PBIR JSON, whose shape is far wider than getVisualSchema (slim mode only).
  // Exporting `.shape` for the tightened map loses the `.passthrough()` that
  // lives on the ZodObject wrapper, so the SDK's JSON-Schema conversion ends
  // up with additionalProperties:false and verbose calls fail output
  // validation with "must NOT have additional properties". Leaving this tool
  // out of the map falls back to GENERIC_OUTPUT_SCHEMA (undefined = no
  // validation), matching the documented intent above and how
  // pbir_get_report_settings / pbir_guide are already handled.
  pbir_get_report: getReportSchema.shape,
  pbir_list_filters: listFiltersSchema.shape,
  pbir_list_bookmarks: listBookmarksSchema.shape,
  pbir_list_custom_visuals: listCustomVisualsSchema.shape,
  pbir_list_report_themes: listReportThemesSchema.shape,
  pbir_get_report_theme: getReportThemeSchema.shape,
  pbir_lookup_theme_property: lookupThemePropertySchema.shape,
  pbir_audit_theme_compliance: auditThemeComplianceSchema.shape,
  pbir_diff_report_theme: diffReportThemeSchema.shape,
  pbir_model_usage: modelUsageSchema.shape,
  pbir_validate_wireframe: validateWireframeSchema.shape,
  // Note: the guide tool is intentionally absent — see deferred-list comment
  // below ("returns markdown text content, no structured shape to validate").
  pbir_load_tools: loadToolsSchema.shape,
};

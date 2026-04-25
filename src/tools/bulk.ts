import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  BucketBindingSchema,
  FormatCategorySchema,
} from "../helpers/createVisual.js";
import type { FieldSpecInput } from "../helpers/createVisual.js";
import { applyFormattingToTarget } from "../helpers/formatting.js";
import type { ServerContext } from "../context.js";
import { requireProject } from "../context.js";
import { invalidateCache } from "../model-usage.js";
import { runBindingValidation, attachBindingValidationMetadata } from "../helpers/bindingValidation.js";
import { applyBindingsToVisual } from "../helpers/bindingApply.js";
import { fail } from "../helpers/mcpResult.js";
import { resolvePageId } from "../helpers/resolvePage.js";
import { invalidateScope } from "../helpers/readCache.js";

// Helper: accept both a real array and a JSON-stringified array (MCP serialisation quirk).
// The explicit `z.ZodType<T[]>` return cast is required because `z.preprocess` widens
// the output to `unknown` under strict mode — which breaks downstream `z.infer` chains
// (e.g. `bindings: parseArray(...)` would destructure as `unknown` instead of `T[]`).
function parseArray<T>(schema: z.ZodType<T>): z.ZodType<T[]> {
  return z.preprocess(
    (val) => (typeof val === "string" ? JSON.parse(val) : val),
    z.array(schema)
  ) as unknown as z.ZodType<T[]>;
}

// ---------------------------------------------------------------------------
// Safety gates for bulk operations — two layers, different jobs.
//
// 1. BULK_CONFIRM_THRESHOLD (soft gate, UX-focused)
//    An agent that calls `list_visuals` and then pipes every id straight
//    into `bulk_delete_visuals` can wipe an entire page in one call with no
//    second thought. The gate forces the agent to explicitly acknowledge the
//    size of the operation when it crosses a threshold — matching the pattern
//    in MinaSaad1/pbi-cli where every bulk command requires an explicit
//    filter flag to prevent accidental mass operations. Bypassable via
//    confirmBulk:true.
//
// 2. BULK_MAX_ITEMS (hard cap, safety-focused)
//    A 1000-visual page is already pathological — a 10,000-id array is
//    almost certainly a malformed input (accidental unbounded JSON, copy
//    error, or outright abuse). We cap at 1000 regardless of confirmBulk so
//    a runaway call can't consume the whole server tick writing thousands
//    of files. Cannot be bypassed — agent must chunk.
// ---------------------------------------------------------------------------
const BULK_CONFIRM_THRESHOLD = 5;
const BULK_MAX_ITEMS = 1000;

function bulkSafetyError(verb: string, count: number) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          success: false,
          error: `Safety gate: this call would ${verb} ${count} visuals (threshold ${BULK_CONFIRM_THRESHOLD}). ` +
            `Set confirmBulk: true to proceed, or reduce the list to ≤${BULK_CONFIRM_THRESHOLD} items.`,
          count,
          threshold: BULK_CONFIRM_THRESHOLD,
          confirmBulkRequired: true,
        }),
      },
    ],
    isError: true as const,
  };
}

/**
 * Hard ceiling for bulk operations. Returned before any mutation runs — the
 * agent must split the work into smaller batches. This is NOT bypassable
 * with confirmBulk (that's the soft gate's job).
 */
function bulkSizeLimitError(verb: string, count: number) {
  return fail(
    `Bulk size limit: this call would ${verb} ${count} visuals, exceeding the hard cap of ${BULK_MAX_ITEMS}. ` +
      `Split into batches of ≤${BULK_MAX_ITEMS}. A page with that many visuals is almost always a misconfiguration — ` +
      `consider using list_visuals + filter logic before calling a bulk tool.`,
    { count, limit: BULK_MAX_ITEMS, reason: "bulk_size_limit_exceeded" }
  );
}

export function registerBulkTools(server: McpServer, ctx: ServerContext): void {
  // ============================================================
  // TOOL: bulk_delete_visuals
  // ============================================================
  server.tool(
    "bulk_delete_visuals",
    "Delete multiple visuals from a page. Set confirmBulk:true when >5.",
    {
      pageId: z.string().optional().describe("Page ID. Auto-resolved when only one page exists."),
      visualIds: parseArray(z.string()),
      confirmBulk: z.coerce.boolean().optional().default(false)
        .describe(`Required when >${BULK_CONFIRM_THRESHOLD}.`),
    },
    {"destructiveHint":true,"openWorldHint":false},
    async ({ pageId, visualIds, confirmBulk }) => {
      const _g = requireProject(ctx); if (_g) return _g;
      const rp = resolvePageId(ctx.project, pageId);
      if (!rp.resolved) return rp.errorResponse;
      pageId = rp.pageId;
      if (visualIds.length > BULK_MAX_ITEMS) {
        return bulkSizeLimitError("delete", visualIds.length);
      }
      if (visualIds.length > BULK_CONFIRM_THRESHOLD && !confirmBulk) {
        return bulkSafetyError("delete", visualIds.length);
      }

      const deleted: string[] = [];
      const errors: string[] = [];

      for (const vid of visualIds) {
        try {
          ctx.project.deleteVisual(pageId, vid);
          deleted.push(vid);
        } catch (err) {
          errors.push(`${vid}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      invalidateCache();
      invalidateScope(`page:${pageId}`);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ success: true, deleted: deleted.length, ids: deleted, errors }),
          },
        ],
      };
    }
  );

  // ============================================================
  // TOOL: bulk_update_format
  // ============================================================
  server.tool(
    "bulk_update_format",
    "Apply the same formatting to multiple visuals. target='container' (title/background/border) or 'visual' (axes/legend/labels). Set confirmBulk:true when >5.",
    {
      pageId: z.string().optional().describe("Page ID. Auto-resolved when only one page exists."),
      visualIds: parseArray(z.string()),
      formatting: parseArray(FormatCategorySchema),
      target: z.enum(["visual", "container"]).optional().default("visual"),
      confirmBulk: z.coerce.boolean().optional().default(false)
        .describe(`Required when >${BULK_CONFIRM_THRESHOLD}.`),
    },
    {"openWorldHint":false},
    async ({ pageId, visualIds, formatting, target, confirmBulk }) => {
      const _g = requireProject(ctx); if (_g) return _g;
      const rp = resolvePageId(ctx.project, pageId);
      if (!rp.resolved) return rp.errorResponse;
      pageId = rp.pageId;
      if (visualIds.length > BULK_MAX_ITEMS) {
        return bulkSizeLimitError("format", visualIds.length);
      }
      if (visualIds.length > BULK_CONFIRM_THRESHOLD && !confirmBulk) {
        return bulkSafetyError("format", visualIds.length);
      }

      const updated: string[] = [];
      const errors: string[] = [];

      for (const vid of visualIds) {
        try {
          const visual = ctx.project.getVisual(pageId, vid);
          const targetObj =
            target === "container"
              ? (visual.visual.visualContainerObjects ??= {})
              : (visual.visual.objects ??= {});
          applyFormattingToTarget(targetObj as Record<string, unknown>, formatting);
          ctx.project.saveVisual(pageId, vid, visual);
          updated.push(vid);
        } catch (err) {
          errors.push(`${vid}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      invalidateScope(`page:${pageId}`);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ success: true, updated: updated.length, ids: updated, errors }),
          },
        ],
      };
    }
  );

  // ============================================================
  // TOOL: bulk_bind
  // ============================================================
  server.tool(
    "bulk_bind",
    "Rebind multiple visuals in one call. Replaces existing bindings. Set confirmBulk:true when >5. continueOnError:true validates per-entry — bad bindings don't abort the batch.",
    {
      pageId: z.string().optional().describe("Page ID. Auto-resolved when only one page exists."),
      updates: parseArray(
        z.object({
          visualId: z.string(),
          bindings: parseArray(BucketBindingSchema),
        })
      ).describe("[{visualId, bindings}]"),
      autoFilters: z.boolean().optional().default(true),
      confirmBulk: z.coerce.boolean().optional().default(false)
        .describe(`Required when >${BULK_CONFIRM_THRESHOLD}.`),
      continueOnError: z.coerce.boolean().optional().default(false)
        .describe("Per-entry validation; bad bindings don't abort the batch."),
      strictBindings: z.boolean().optional().describe("true=strict (default), false=warn."),
    },
    {"openWorldHint":false},
    async ({ pageId, updates, autoFilters, confirmBulk, continueOnError, strictBindings }) => {
      const _g = requireProject(ctx); if (_g) return _g;
      const rp = resolvePageId(ctx.project, pageId);
      if (!rp.resolved) return rp.errorResponse;
      pageId = rp.pageId;
      if (updates.length > BULK_MAX_ITEMS) {
        return bulkSizeLimitError("rebind", updates.length);
      }
      if (updates.length > BULK_CONFIRM_THRESHOLD && !confirmBulk) {
        return bulkSafetyError("rebind", updates.length);
      }

      // Validation strategy:
      //   - default  : batch-level. A single unknown field in strict mode
      //                fails the whole call before any write.
      //   - continueOnError : per-entry. Each update is validated in isolation
      //                and bad entries are reported in `errors` while good
      //                entries still write.
      let validation: ReturnType<typeof runBindingValidation>;
      if (!continueOnError) {
        const allBindings: Array<{ bucket: string; fields: FieldSpecInput[] }> = [];
        for (const { bindings } of updates) {
          for (const b of bindings) {
            allBindings.push({ bucket: b.bucket, fields: b.fields as FieldSpecInput[] });
          }
        }
        validation = runBindingValidation(ctx.project, allBindings, strictBindings);
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
                    hint: "Retry with continueOnError:true to apply the valid entries and get a per-visual error report.",
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }
      } else {
        // Run a dry validation to capture mode/skipReason for the response,
        // but don't gate on it — per-entry validation drives write decisions.
        validation = runBindingValidation(ctx.project, [], strictBindings);
      }

      const updated: string[] = [];
      const errors: string[] = [];
      const perEntryBindingErrors: Array<{ visualId: string; errors: unknown[] }> = [];

      for (const { visualId, bindings } of updates) {
        try {
          // Per-entry validation when continueOnError is set.
          if (continueOnError) {
            const entryBindings = bindings.map((b) => ({
              bucket: b.bucket,
              fields: b.fields as FieldSpecInput[],
            }));
            const entryValidation = runBindingValidation(ctx.project, entryBindings, strictBindings);
            if (!entryValidation.proceed) {
              errors.push(`${visualId}: binding_validation_failed`);
              perEntryBindingErrors.push({ visualId, errors: entryValidation.errors });
              continue;
            }
          }
          const visual = ctx.project.getVisual(pageId, visualId);
          applyBindingsToVisual(
            visual,
            bindings.map((b) => ({ bucket: b.bucket, fields: b.fields as FieldSpecInput[] })),
            { autoFilters: autoFilters ?? true }
          );
          ctx.project.saveVisual(pageId, visualId, visual);
          updated.push(visualId);
        } catch (err) {
          errors.push(`${visualId}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      invalidateCache();
      invalidateScope(`page:${pageId}`);
      const bulkResponse: Record<string, unknown> = {
        success: true,
        updated: updated.length,
        ids: updated,
        errors,
        ...(perEntryBindingErrors.length > 0 ? { perEntryBindingErrors } : {}),
      };
      attachBindingValidationMetadata(bulkResponse, validation);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(bulkResponse),
          },
        ],
      };
    }
  );
}

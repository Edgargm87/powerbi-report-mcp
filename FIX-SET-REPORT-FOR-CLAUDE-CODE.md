# powerbi-report-mcp — fix `pbir_set_report` outputSchema bug

A real bug in v0.8.2 that the eval suite missed because evals bind via
`PBIR_REPORT_PATH` env var, never exercising `pbir_set_report`.

---

## Symptom

Calling `pbir_set_report` with a valid path returns:

```
MCP error -32602: Structured content does not match the tool's output schema:
data must NOT have additional properties
```

The bind side-effect does NOT take place. `pbir_get_report` afterward
returns `{ reportPath: "No report connected" }`. Same shape on any path,
valid or not (validation never gets that far — the response shape is
rejected before the side-effect commits).

---

## Root cause

`src/index.ts:272`:

```ts
const GENERIC_OUTPUT_SCHEMA = { success: z.boolean(), error: z.string().optional() } as const;
```

This is the fallback outputSchema applied to every tool not in
`READ_TOOL_SCHEMAS` (per `doRegister()` at `src/index.ts:302-315`). The
preceding comment at line 265-272 claims the schema permits any extra
keys via `.passthrough()`:

```ts
// (.passthrough() permits any extra keys)
```

**It doesn't.** The flat shape gets wrapped by the MCP SDK into a strict
JSON Schema where `additionalProperties: false`. Any handler that returns
structured content with fields beyond `{success, error}` fails validation.

The handler for `pbir_set_report` at `src/tools/report.ts:29-45` returns
the result of `connectReport()` (defined at `src/index.ts:209-231`), which
includes `reportPath` on success:

```ts
return { success: true, reportPath };
```

The `safe()` wrapper backfills `structuredContent` from
`content[0].text`. That structuredContent is `{success: true, reportPath:
"..."}`. The `reportPath` field is the rejected "additional property".

Per-tool schemas in `src/helpers/outputSchemas.ts` work because each calls
`.passthrough()` explicitly. The generic envelope claims to do the same
in a comment but doesn't in code.

---

## Fix

Two changes, one place:

### 1. Make `GENERIC_OUTPUT_SCHEMA` actually permit extra fields

In `src/index.ts` near line 272, replace the flat shape with something
that round-trips to JSON Schema with `additionalProperties: true` (or
unset). The MCP SDK's expected shape for `outputSchema` is a flat object
of zod types, but that's where the strictness comes from — investigate
whether passing a full `z.object(...).passthrough()` (cast to the SDK's
expected type) actually works, or whether you need a different
mechanism.

Possible shapes to try, in order of cleanness:

```ts
// Option A: full zod object cast (cleanest if SDK accepts it)
const GENERIC_OUTPUT_SCHEMA = z.object({
  success: z.boolean(),
  error: z.string().optional(),
}).passthrough();
// then: const outputSchema = ... as unknown as Record<string, unknown>;

// Option B: z.record catchall on the flat shape
const GENERIC_OUTPUT_SCHEMA = {
  success: z.boolean(),
  error: z.string().optional(),
}; // — and at registration, wrap in z.object(shape).passthrough() before passing

// Option C: drop outputSchema entirely on mutation tools
// — pass undefined to registerTool when the tool isn't in READ_TOOL_SCHEMAS
```

Pick whichever the MCP SDK actually honours. Verify with the regression
test below — the test must fail before the fix and pass after.

The comment block at `src/index.ts:265-272` should match whatever the
code actually does. If you go with Option C, rewrite the comment to
explain that mutation tools opt out of structured-output validation.

### 2. Update the per-tool overrides in `src/helpers/outputSchemas.ts` if needed

`pbir_set_report`'s response shape is `{success, reportPath?, error?}`.
Optionally add a tightened schema for it in `READ_TOOL_SCHEMAS` (despite
the variable name — "READ" is a misnomer if mutation tools are added):

```ts
"pbir_set_report": z.object({
  success: z.boolean(),
  reportPath: z.string().optional(),
  error: z.string().optional(),
}).passthrough(),
```

Only add this if the generic fix in #1 doesn't already cover it. The
generic fix is the structural fix; this is decorative.

---

## Regression test (mandatory)

Add `scripts/test-set-report.js`. Wire into `npm run test:all`.

The test must:

1. Spawn `dist/index.js` over stdio (use the same harness style as
   `scripts/test-tool-surface.js`).
2. Call `pbir_set_report` with the eval fixture path
   (`evals/fixtures/sample.Report` resolved to absolute).
3. Assert the response did NOT error (`isError !== true`, no `-32602`).
4. Assert the response contains `success: true` in `structuredContent`.
5. Call `pbir_get_report` and assert `reportPath` is the bound absolute
   path (NOT `"No report connected"`).
6. Call `pbir_set_report` with a bogus path (e.g. `C:\nope\not.Report`).
7. Assert the response is a clean `fail()` envelope (`success: false`,
   `error` non-empty), not a -32602 protocol error.
8. Exit non-zero on any assertion failure.

Add to `package.json` scripts:

```json
"test:set-report": "node scripts/test-set-report.js"
```

And include in `test:all`:

```json
"test:all": "... && npm run test:set-report"
```

---

## Drop-in task for Claude Code

```
In powerbi-report-mcp:

Real bug in v0.8.2 that the eval missed: pbir_set_report fails with
"Structured content does not match the tool's output schema: data must
NOT have additional properties" because GENERIC_OUTPUT_SCHEMA at
src/index.ts:272 doesn't actually permit extra keys despite the comment
claiming it does. The bind side-effect doesn't run; pbir_get_report
afterward returns "No report connected".

Read FIX-SET-REPORT-FOR-CLAUDE-CODE.md end-to-end first.

Step 1 — reproduce locally:
  - Build: npm run build
  - Run dist/index.js with PBIR_REPORT_PATH unset
  - Issue a tools/call for pbir_set_report with an absolute path to
    evals/fixtures/sample.Report
  - Confirm the -32602 error and that pbir_get_report afterward shows
    "No report connected"

Step 2 — fix GENERIC_OUTPUT_SCHEMA at src/index.ts:272. Pick whichever
of the three options in the brief actually works with the installed MCP
SDK (1.12.x). The fix must allow {success, reportPath, error?} — and
any other extra fields a mutation handler might return — to pass
structured-content validation. Update the comment block at line 265-272
to match what the code actually does.

Step 3 — verify pbir_set_report now succeeds. The dual-emit invariant
must still hold (content[0].text + structuredContent both present).

Step 4 — write scripts/test-set-report.js per the brief's "Regression
test" section. Eight assertions. Wire into package.json scripts (test:
set-report and test:all).

Step 5 — verify nothing else broke:
  - npm run test:all  (the new test:set-report runs as part of this)
  - npm run audit:strict
  - The artifact at artifacts/README.md does not need to change — it
    talks to the MCP via tools, the fix is below the tool layer.

Step 6 — bump version to v0.8.3 (patch — bug fix, no feature change):
  - package.json
  - plugin/.claude-plugin/plugin.json (current 0.2.2 → 0.2.3)
  - CHANGELOG.md entry: "Fix pbir_set_report -32602 outputSchema
    rejection. GENERIC_OUTPUT_SCHEMA now actually passthrough as the
    comment block always claimed. Eval missed this because evals bind
    via PBIR_REPORT_PATH env var, never the tool. New
    scripts/test-set-report.js wired into test:all closes the
    regression."

Constraints:
- Do NOT change the artifact source. The bug is in src/, not in the
  artifact.
- Do NOT relax validation on tools that already have tightened
  per-tool schemas in READ_TOOL_SCHEMAS. The fix is to the *generic*
  fallback, not to the tightened ones.
- The new test must fail BEFORE your fix and pass AFTER — verify both.
```

---

## Acceptance criteria

- `pbir_set_report` with a valid path: `success: true`, no -32602, side-
  effect commits, `pbir_get_report` afterward shows the bound path.
- `pbir_set_report` with an invalid path: clean `fail()` envelope with
  `isError: true`, structured `{success: false, error: "..."}`. Not a
  protocol-level -32602.
- `npm run test:all` green, including the new `test:set-report`.
- `npm run audit:strict` still 100%.
- The new test fails on the pre-fix code (verify by running it before
  the fix, then after).
- v0.8.3 published in `package.json`, `plugin/.claude-plugin/plugin.json`,
  CHANGELOG.

---

## After the fix lands

**Do you need to re-run the eval?** Short answer: **yes**, but only as
sanity coverage — there's no scenario where this specific fix would
*regress* eval accuracy (the eval doesn't call `pbir_set_report` and
the fix is loosening, not tightening, structured-output validation).
But:

- If Option A or B (loosening generic schema) is taken, every mutation
  tool's response validation changes. Re-running eval (Opus, ~13
  minutes, ~$3) is cheap insurance against an "I broke something I
  didn't anticipate" scenario.
- If Option C (drop outputSchema on non-read tools) is taken, the
  surface area of the change is bigger and re-running is more important.
- The new `test:set-report` covers this specific bug going forward, so
  re-running the eval is *not* needed to validate the fix itself —
  it's needed to validate nothing else regressed.

Recommendation: re-run the Opus eval after the fix as the release-gate
sanity check. If it stays at 10/10, ship v0.8.3. If anything regresses,
flag and investigate before shipping.

---

## What this brief deliberately does NOT cover

- **A wider audit of every mutation tool's response shape.** The fix
  closes the latent class, but I'm not asking you to walk every handler
  and verify it returns clean shapes. The eval + new test is the safety
  net.
- **Renaming `READ_TOOL_SCHEMAS` to something more honest** if you add
  `pbir_set_report` to it. Defer; that's a cosmetic refactor.
- **Adding artifact-side error reporting** for the -32602 case. The
  artifact already shows MCP error toasts via `callMcp()`'s error path;
  no UI change needed.

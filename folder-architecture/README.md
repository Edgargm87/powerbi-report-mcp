# folder-architecture/

An experiment: what would `powerbi-report-mcp` look like if represented entirely
as a 3-Layer Folder Architecture (per the AI_Folder_Architecture.pdf framework)?

## What this is

A mirror of the entire MCP surface (56 tools + 17 skills) as markdown files
organized into the Layer 1/2/3 pattern:

- `claude.md` — master routing table (Layer 1)
- `<room>/context.md` — per-domain knowledge (Layer 2)
- `<room>/tools/<tool>.md` — individual tool contracts (Layer 3)
- `knowledge/` — shared cross-cutting skills (the existing 17 topics)

## What this is NOT

- **Not a replacement** for the running MCP server.
- **Not a runnable system** on its own.
- **Not** intended to be kept in lockstep with `src/` on every commit. Drift is
  expected; refresh manually when the experiment is referenced.

## Why this exists

To answer the question: *"could we extract everything to markdown?"*

Short answer: yes for descriptions and patterns (already done in `skills/`);
no for validators, JSON construction, layout math, theme schema lookup,
and atomic file I/O — those need code. This folder makes that boundary
explicit and visible.

See `claude.md` "How the layers actually work in the real MCP" for the mapping.

## How to refresh

The tool contracts here were extracted from `src/tools/*.ts` at version
v0.9.6 (commit `08eda17`). To refresh after MCP changes:

1. Re-extract per-tool descriptions from `registerTool(...)` calls
2. Re-extract input/output schemas from zod definitions
3. Update routing table in `claude.md` if tools were added/removed
4. Update `BACKLOG.md` and `CHANGELOG.md` references if relevant

No automation provided — this is a snapshot, not a generated artifact.

## Provenance

Snapshot taken at v0.9.6 (commit `08eda17`). 56 tools across 11 rooms,
plus 17 shared knowledge skills (`knowledge/`, derived from `skills/`).

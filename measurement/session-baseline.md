# Session Cost Baseline — v0.9.4

Measurement run: 2026-05-06T18:42:11.150Z
Token approximation: chars/4 (~10-15% accuracy)
Fixture: evals/fixtures/sample.Report

## Summary

| Bucket | Tokens | % of total |
|--------|-------:|-----------:|
| Tool catalog (tools/list) | 14509 | 54.8% |
| Resource catalog (resources/list) | 341 | 1.3% |
| Tool result payloads (11 calls) | 5702 | 21.5% |
| Skill content loaded (2 guide calls) | 5936 | 22.4% |
| **Total per representative session** | **26488** | **100%** |

Catalog tool count: 56
Resource count: 18

## Top 10 most-expensive tools in the catalog

| Rank | Tool | Catalog tokens | % of catalog |
|------|------|---------------:|-------------:|
| 1 | pbir_add_visual | 1405 | 9.7% |
| 2 | pbir_layout_grid | 747 | 5.1% |
| 3 | pbir_list_pages | 646 | 4.5% |
| 4 | pbir_bulk_bind | 534 | 3.7% |
| 5 | pbir_list_visuals | 512 | 3.5% |
| 6 | pbir_update_visual_bindings | 494 | 3.4% |
| 7 | pbir_add_page_filter | 464 | 3.2% |
| 8 | pbir_model_usage | 440 | 3.0% |
| 9 | pbir_format_visual | 385 | 2.7% |
| 10 | pbir_lookup_theme_property | 379 | 2.6% |

## Per-call result sizes

| Step | Tool | Args summary | Tokens | Notes |
|------|------|--------------|-------:|-------|
| 3 | pbir_get_report | `{}` | 98 | typical first call |
| 4 | pbir_list_pages | `{"slim":true}` | 487 | slim mode |
| 5 | pbir_list_pages | `{"slim":false,"includeVisuals":true}` | 1376 | full mode + visuals (cross-page) |
| 6 | pbir_list_visuals | `{"pageId":"00000000000000000001"}` | 374 | page-scoped |
| 7 | pbir_get_visual | `{"pageId":"00000000000000000001","visua…` | 95 | slim visual fetch |
| 8 | pbir_get_visual | `{"pageId":"00000000000000000001","visua…` | 1156 | VERBOSE worst-case |
| 9 | pbir_get_report_theme | `{}` | 125 | theme read |
| 10 | pbir_audit_theme_compliance | `{}` | 94 | default topN:20 |
| 11 | pbir_lookup_theme_property | `{"visualType":"card"}` | 662 | schema lookup |
| 12 | pbir_guide | `{"topic":"wireframes"}` | 52 | tool path (may error: outputSchema mismatch) |
| 13 | pbir_guide | `{"topic":"errors"}` | 52 | tool path (may error: outputSchema mismatch) |
| 14 | pbir_get_visual_types | `{}` | 1166 | type list |
| 15 | pbir_model_usage | `{}` | 69 | no semantic model in fixture; measures shape |

## Skill load costs

| Topic | Tokens | Text tokens | Source | Notes |
|-------|-------:|------------:|--------|-------|
| wireframes | 4681 | 4503 | resources/read | skill body |
| errors | 1255 | 1201 | resources/read | skill body |

## Interpretation

Catalog accounts for 54.8% of the representative session's token cost (14509 of 26488 total). The most-expensive single tool entry in the catalog is **pbir_add_visual** at 1405 tokens (9.7% of catalog). The most-expensive call response in this sequence is **pbir_list_pages** (step 5) at 1376 tokens. Verdict: **dominates** (>30%) — Tier C (selective consolidation) recommended.

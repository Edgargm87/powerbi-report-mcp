<!-- doc-version: 2.0 | Last updated: 2026-04-20 -->
<!-- summary: Build-first protocol — default is "just build it", elicitation scales with scope. Trigger matrix, bypass phrases, session memory, scaled checkpoints. Read to decide whether to ask anything at all. -->
# Skill: Elicitation — Ask Only When The Work Is Big

## The default is BUILD

Asking questions feels safe but it has a cost: every unnecessary question trains the user to dread asking for things. The default response to any request is **build it**. Elicitation is the exception, not the rule, and it scales with the scope of the work — not with the perceived risk.

## Trigger matrix — what gets asked, based on scope

| Request scope | Example user prompt | Questions to ask |
|---|---|---|
| **Atomic change** — 1 visual, 1 property | "Add a card for Total Revenue", "Change that title to Q4", "Sort by descending" | **Zero.** Build it. |
| **Small build** — 2–3 visuals on an existing page | "Add a KPI strip to page 2", "Put a trend chart next to the card" | **Zero.** Pick sensible defaults from `model_usage`, build. Show result. |
| **Page build** — 4–7 visuals, new page | "Build me a sales page", "Make a Q4 review page" | **One question** — the single biggest missing signal (usually: audience, or the 2–3 must-have measures). |
| **Dashboard build** — 8+ visuals, or multi-page | "Build me a full sales dashboard", "Three-page P&L report" | **The 5-signal form** in one batch. |
| **Blank report, no prompt context** | User connects via `set_report` and says "what can you do?" | Offer the menu. Don't auto-build. |

Four rules that keep this honest:

1. **Count visuals in your head before you ask anything.** If the answer is ≤3, don't ask.
2. **Modifications never trigger elicitation.** If `list_pages` shows existing content and the user's request is a tweak, build it. The existing page is the spec.
3. **One signal is one question.** Never ask for audience + purpose + measures in one message when only one is missing.
4. **Ask for the blocker, not the nice-to-have.** If you can't pick a headline measure, ask for it. Don't ask about branding you could get from the theme.

## Bypass phrases — always skip elicitation

If the user's prompt contains any of these, go straight to building. No questions, no confirmations before the first `add_visual`:

- "just build it" / "just do it"
- "go" / "proceed"
- "fast mode" / "skip questions"
- "use defaults" / "your call" / "surprise me"
- "quick" / "quickly" / "rough version"
- any explicit "skip the X" / "don't ask"

Treat these as the user's opt-out. Honour it even if the work is a full dashboard.

## The 5-signal form — only for dashboard-scope work

Reserved for 8+ visuals or multi-page builds where guessing wrong wastes ≥15 minutes. One batch, numbered, with defaults so the user can reply "defaults" and be done:

```
Dashboard-scope build, five quick questions (reply "defaults" to skip):

1. Audience — executive, analyst, ops, external?          (default: executive)
2. Purpose — monitor / explore / tell a story / audit?    (default: monitor)
3. Must-include measures — which 2–4 are non-negotiable?  (default: top from model_usage)
4. Layout — KPI strip / summary-detail / drill / sidebar? (default: KPI strip)
5. Brand — hex colors, or theme defaults?                 (default: theme)
```

## Session memory — never re-ask

Once the user has answered any elicitation question in a session, **those answers stick for the rest of the session**. Subsequent page builds don't re-ask — they reuse the answers silently. The only reset is a new `set_report` to a different report path.

If the user's answer was partial ("executive, don't care about the rest"), the remaining signals fall back to defaults — they don't get re-asked either.

## The `report-spec.md` shortcut

If a `report-spec.md` file sits next to the `.pbip`, it pre-populates all 5 signals. The agent reads it on `set_report` and skips elicitation entirely unless the user's request contradicts it. Minimal shape:

```markdown
# Report Spec

**Audience:** finance leadership
**Purpose:** monthly P&L review
**Measures:**
- Sales[Total Revenue]
- Sales[Gross Margin %]
- Sales[Net Income]
**Layout:** KPI strip top, trend below, variance table bottom
**Brand:** navy (#1A365D) + gold (#D4A017), Segoe UI
```

This is the power-user's path: one file, one time, no questions ever.

## Checkpoints — also scaled by scope

Checkpoints (show work, wait for go-ahead) have the same scope rule as elicitation. More visuals = more cost if you build the wrong thing = more worth pausing for.

| Page size | C1 (plan) | C2 (skeleton) | C3 (data review) |
|---|---|---|---|
| **1–3 visuals** | skip | skip | optional — offer a `reload_report` and stop |
| **4–7 visuals** | **yes** — one message, confirm plan | skip | optional |
| **8+ visuals or multi-page** | **yes** | **yes** — `get_page_summary`, confirm before binding | **yes** — confirm after binding, before polish |

"Optional" means: mention the step exists, but don't block. "Yes" means: actually pause and wait for a reply.

## What still matters

Elicitation exists for one reason: **stop the agent from silently building the wrong thing on a large job**. That failure mode costs hours. Every other scenario — small asks, modifications, power users — elicitation is pure friction and must stay out of the way.

If you're ever tempted to ask "just to be safe", re-read the trigger matrix. If the scope doesn't qualify, don't ask.

## Related files

- `skills/report-design.md` — the 6-step mental model + checkpoint discipline (principles)
- `skills/wireframes.md` — the 5 validated layouts you pick from if you do ask question 4
- `skills/visuals.md` — what to actually build once you've decided

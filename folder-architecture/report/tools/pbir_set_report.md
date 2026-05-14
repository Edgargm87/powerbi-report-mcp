# pbir_set_report

> Connect to a different Power BI report (`.Report` folder or parent `.pbip` project folder). Use this to switch reports mid-session without restarting the server.

## Inputs

| Param | Type | Required | Description |
|-------|------|:--------:|-------------|
| path | string | yes | Absolute path to a `.Report` folder or parent containing a `.pbip` project |

## Output

Two `content` entries:

1. JSON result envelope from `ctx.connectReport(path)` (success + resolved paths)
2. The connect-time skills-index banner (from `buildSkillsIndexBanner()`)

## Behavior

- Mutation: yes (server state — current report binding)
- Full cache invalidate (every scope drops)
- Side-channels skills index so clients without the `pbir-instructions` resource still receive it

## In the default tool set

One of the 13 default-loaded tools (the most obvious one — required to bind anything).

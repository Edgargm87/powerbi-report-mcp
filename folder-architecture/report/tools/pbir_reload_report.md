# pbir_reload_report

> Reload the report in Power BI Desktop by closing and reopening the .pbip file. SAFETY: closes `PBIDesktop.exe`, so any unsaved work in Desktop (including modeling-MCP measures/relationships not yet flushed by Desktop autosave) is LOST. Requires `confirm:true` to proceed.

## Inputs

| Param | Type | Required | Default | Description |
|-------|------|:--------:|:-------:|-------------|
| confirm | boolean | no | false | Must be true to actually reload |

## Output (confirm:false)

```jsonc
{
  "success": false,
  "requiresConfirmation": true,
  "warning": "About to close PBI Desktop. Unsaved work will be lost ... Save first: ...",
  "nextAction": "Retry with confirm: true once the user has saved PBI Desktop."
}
```

## Output (confirm:true, success)

```jsonc
{ "success": true, "message": "Reopening Foo.pbip in Power BI Desktop" }
```

## Behavior

- `destructiveHint: true`
- Two-step: `taskkill /IM PBIDesktop.exe /F` (ignored if not running), 3-second
  pause, then `cmd.exe /c start "" <pbipPath>` with shell:false argv
- Validates `.pbip` filename against `/^[\w\-. ()]+\.pbip$/i` to reject shell metacharacters

## What's NOT replicable in markdown

- Process control: taskkill + spawn
- Shell-injection defense
- Asynchronous PBI Desktop file-lock release

## In the default tool set

One of the 13 default-loaded tools (lazy-loaded clients can't invoke a deferred
reload tool — see the inline rationale in `default-tools.ts`).

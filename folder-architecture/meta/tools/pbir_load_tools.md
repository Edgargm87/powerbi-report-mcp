# pbir_load_tools

> List on-demand tools (no args) or activate by name (pass `tools` array).

## Inputs

| Param | Type | Required | Description |
|-------|------|:--------:|-------------|
| tools | string[] | no | Names to activate. Omit to list available on-demand tools. |

## Output (list)

```jsonc
{
  "success": true,
  "activeCount": N,
  "availableCount": M,
  "available": [ { "name": "pbir_...", "description": "<first 80 chars>" } ],
  "hint": "Call pbir_load_tools with tool names to activate them."
}
```

## Output (activate)

```jsonc
{
  "success": true,
  "activated": ["pbir_..."],
  "notFound": [],
  "refreshHint": "A tools/list_changed notification was sent. If the activated tools don't appear, your MCP client may not support dynamic tool refresh — set MCP_TOOLS=all in the server config to load all tools at startup instead."
}
```

## Behavior

- Sends an MCP `notifications/tools/list_changed` after activation
- Activated tools move from the deferred map to the active set; can be invoked
  on the same session if the client honors the refresh

## What's NOT replicable in markdown

The deferred-tool registry, the `doRegister` shim, and the `notifications/tools/list_changed`
emission are pure runtime mechanics.

## In the default tool set

Always active (pre-registered before any other tool to bootstrap discovery).
Not in `DEFAULT_TOOLS` because it's a meta-tool added separately.

# Cursor + Chrome DevTools MCP

Connect Cursor to a live Chrome instance so the agent can capture screenshots,
inspect elements, read console logs, and exercise portal flows against a running
dev server — without guessing from code alone.

This repo ships a project-scoped MCP entry in [`.cursor/mcp.json`](../../.cursor/mcp.json).
Reload MCP servers in **Cursor → Settings → MCP** after pulling.

## What you get

- **Screenshots** of the page the agent is debugging
- **DOM inspection** (selectors, layout, accessibility tree)
- **Console / network** visibility for live errors
- **Browser automation** on the tab Chrome DevTools MCP controls

Use this for ship-gate **in-depth feature testing** on localhost (see
[`docs/ship-gate.md`](../ship-gate.md)), not as a substitute for unit tests.

PropLane local URLs by agent branch:

| Branch / worktree | URL |
| --- | --- |
| `cursor-2` (this sandbox) | http://localhost:3011 |
| `cursor-1` | http://localhost:3010 |
| Integration (`prakrit`) | http://localhost:3000 |

Open the right port before asking the agent to test a flow.

## Easiest setup (let Cursor configure it)

1. Open **Cursor Chat** and paste:

   > Install the Chrome DevTools MCP and enable it for me.

2. Cursor will add or refresh the MCP server in your settings.

3. On **macOS**, grant **Full Disk Access** to Cursor if prompted:
   **System Settings → Privacy & Security → Full Disk Access**.

4. Open the tab you want to inspect in Chrome. For `--autoConnect`, Chrome
   may prompt you to allow the debugging connection — approve it.

5. In Cursor, confirm **chrome-devtools** shows as connected under
   **Settings → MCP**.

## Already configured in this repo

`.cursor/mcp.json` includes:

```json
"chrome-devtools": {
  "command": "npx",
  "args": ["-y", "chrome-devtools-mcp@latest", "--autoConnect"]
}
```

`--autoConnect` attaches to your running Chrome when possible (signed-in
sessions, real cookies). If connection fails, see manual options below.

**Prerequisites:** Node.js 20+ (LTS), Chrome stable, npm/npx on your PATH.

## Manual setup

1. **Cursor → Settings → Tools & MCP → New MCP Server** (or edit
   `.cursor/mcp.json` / `~/.cursor/mcp.json`).

2. Add the `chrome-devtools` block above.

3. Save and use **Refresh** on the MCP server list.

### Connect to a specific Chrome debug port

Launch Chrome with remote debugging, then point the MCP server at it:

```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222
```

```json
"args": ["-y", "chrome-devtools-mcp@latest", "--browserUrl=http://127.0.0.1:9222"]
```

## Verify it works

Ask the agent, for example:

> Open http://localhost:3011/portal and take a screenshot of the manager dashboard.

Or:

> Check the performance of https://developers.chrome.com

The agent should use Chrome DevTools MCP tools (not only static code search).

## Security

The agent can see and interact with whatever is in the connected browser —
including authenticated portal sessions. Do not point it at production accounts
you would not want automated actions on, and avoid pasting secrets into chat.

## Official references

- [Get started with Chrome DevTools for agents](https://developer.chrome.com/docs/devtools/agents/get-started)
- [Configuration flags](https://developer.chrome.com/docs/devtools/agents/get-started/configuration)
- [chrome-devtools-mcp on GitHub](https://github.com/ChromeDevTools/chrome-devtools-mcp)

## Related tooling in this fleet

- **Playwright MCP** (also in `.cursor/mcp.json`) — headless Chromium automation
  with allowed origins for localhost and staging; good for scripted flows.
- **`chrome-devtools-axi`** (Firstmate) — CLI browser helper used by agents in
  the broader fleet; MCP is the in-IDE path inside Cursor.

Pick **Chrome DevTools MCP** when you need the agent to inspect *your* live Chrome
tab (console errors, layout, signed-in state). Pick **Playwright MCP** when you
want a clean automated browser without attaching to an existing window.

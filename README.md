# Cloudflare MCP Connector for WorkBuddy & dsh

[English](README.md) | [中文](README.zh-CN.md)

[![npm](https://img.shields.io/npm/v/dsh-cf-mcp.svg)](https://www.npmjs.com/package/dsh-cf-mcp)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Ready-to-use configs for connecting the **Cloudflare official API MCP** (Code Mode, `https://mcp.cloudflare.com/mcp`) to your AI agent client. Once connected, the agent gets 3 tools: `docs` (doc search), `search` (OpenAPI spec search), `execute` (JS sandbox runner).

| Directory | Client | What's inside |
|---|---|---|
| [`workbuddy/`](workbuddy/) | **WorkBuddy** | `mcp.json` — copy, paste your token, done |
| [`dsh/`](dsh/) | **DeepSeek Harness (dsh)** | Config **plus a required patch** — skip step 2 below and tools silently fail to register |
| [`skill/`](skill/) | **Any agent** | `SKILL.md` — teaches the agent to request missing permissions on 403 instead of guessing |

## Step 1 — Get an API token

1. Open the Cloudflare dashboard → top-right account switch → **Manage Account** → **Account API Tokens** → **Create Token**;
2. Pick a **permission template** instead of picking rows one by one from the English, prefix-matched dropdowns (easy to get wrong):
   - **"Write all resources"** — full account write. Fine for a personal dev account; don't use this on a production one;
   - **"Edit zone DNS"** — DNS records only;
   - **"Edit Cloudflare Workers"** — Workers / KV / R2;
3. Rename the token to something recognizable (e.g. `workbuddy-mcp`) and set a **TTL** — don't pick "no expiry": an expiring token is a 1-minute re-create, a leaked eternal token is a breach;
4. **Leave Client IP Address Filtering empty** — behind a proxy/VPN your egress IP changes, and a pinned IP will 401 mysteriously weeks later;
5. Create → copy the token (shown **only once**, `cfat_` prefix).

Least-privilege alternative: a **User API Token** (dashboard → My Profile → API Tokens → Create Custom Token). Add only the rows you need (start with Account Settings Read + Zone Read), and add more later by **editing the same token** — editing does not rotate the secret and takes effect immediately. The endpoint accepts both token types; only the permission scope differs.

## Step 2 — Connect your client

### WorkBuddy

1. Copy `workbuddy/mcp.json` into your WorkBuddy user config (details in [`workbuddy/README.md`](workbuddy/README.md));
2. Paste your token into the `Authorization: Bearer` header — plaintext is the only option there (user-level config has no env-var placeholders); revoke/rotate from the dashboard anytime;
3. Restart and trust the new MCP server.

### dsh

Published on npm: **[dsh-cf-mcp](https://www.npmjs.com/package/dsh-cf-mcp)**

```bash
plugin_manager install_bundle dsh-cf-mcp
```

One install gives you all three pieces:

| What | How |
|---|---|
| MCP connection | the bundle's patch inserts the `mcp-cloudflare` row |
| Tool-registration fix | applied automatically on load (rewrites one call site in `dsh-mcp-client`, backing it up first) |
| Permission skill | written to `~/.dsh/skills/cloudflare-token-permission/SKILL.md` |

1. Set the environment variable **before launching dsh**: `CLOUDFLARE_API_TOKEN` (read via a `!!js` tag — **no secret on disk**);
2. **Restart dsh.** The three tools appear once the patch runs;
3. If you later upgrade `@deepseek-ai/dsh-mcp-client`, its file is replaced — the patch is re-applied on the next plugin load, or run it by hand:

```bash
node node_modules/dsh-cf-mcp/apply-schema-fix.mjs
```

Both automatic steps can be turned off in the bundle config:

```yaml
- id: mcp-cloudflare
  name: 'dsh-cf-mcp'
  config:
    patchClient: false    # don't touch dsh-mcp-client
    installSkill: false   # don't write the skill file
```

> **This plugin modifies another package.** It rewrites one `inputSchema:` call site inside `@deepseek-ai/dsh-mcp-client` to strip a JSON-Schema keyword (`$schema`) the harness rejects, saving `index.js.bak-schema-fix` first. It is idempotent, and it helps every MCP server you connect, not just Cloudflare — but you should know it touches a file outside its own package.

### Any other agent

Drop [`skill/SKILL.md`](skill/SKILL.md) into the client's skills directory (`~/.workbuddy/skills/cloudflare-token-permission/` or `~/.dsh/skills/`). It hard-wires one rule: on 403 / insufficient-permission, never guess, never retry blindly, never route around — **ask the user to add the permission**, then verify via the read-only echo (`GET /zones` returns each zone's permission list).

## Step 3 — Verify it works

Handshake test without booting the client (run from the client's own `node_modules`):

```js
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const t = new StreamableHTTPClientTransport(new URL("https://mcp.cloudflare.com/mcp"), {
  requestInit: { headers: { Authorization: "Bearer <YOUR_TOKEN>" } },
});
const c = new Client({ name: "probe", version: "1.0.0" });
await c.connect(t);
console.log((await c.listTools()).tools.map(x => x.name)); // ["docs","search","execute"]
await c.close();
```

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| dsh: "MCP connected", 0 tools, no error | Cloudflare's `inputSchema` carries `$schema`, which dsh's whitelist rejects — the failure is silently swallowed. Run `dsh/apply-schema-fix.mjs` and restart |
| 401 weeks after setup | Client IP filtering was pinned while behind a VPN/proxy — recreate the token with IP filtering left empty |
| 403 insufficient permission | Edit the token and add the missing permission row (editing doesn't rotate the secret), or install `skill/SKILL.md` so the agent requests the missing permission from the user |
| Token leaked | Revoke it from the dashboard, create a new one, paste into the client |

> The `mcp.cloudflare.com/mcp` endpoint enforces OAuth, but both clients' MCP connectors use static Bearer tokens instead — that's the supported workaround, and the official docs confirm both user tokens and account tokens work.

## License

MIT

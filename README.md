# Cloudflare MCP Connector for WorkBuddy & dsh

[English](README.md) | [中文](README.zh-CN.md)

Working configs for connecting the **Cloudflare official API MCP** (Code Mode, `https://mcp.cloudflare.com/mcp`) to two AI agent clients:

| Directory | Client | Notes |
|---|---|---|
| [`workbuddy/`](workbuddy/) | **WorkBuddy** | Plug-and-play `mcp.json`. Token in plaintext (the only option there). |
| [`dsh/`](dsh/) | **DeepSeek Harness (dsh)** | Needs **one patch** — read the gotcha below, it's a silent failure. |
| [`skill/`](skill/) | **Any agent** | Drop-in `SKILL.md`: teaches your agent to **ask you for permissions** instead of guessing when a call comes back 403. |

Both expose the same 3 tools: `docs` (doc search), `search` (OpenAPI spec search), `execute` (JS sandbox runner).

## The silent-failure gotcha (dsh)

Without the patch, dsh shows **"MCP connected" but zero tools registered** — with no visible error. Root cause chain:

1. Cloudflare's tool `inputSchema` carries `"$schema": "https://json-schema.org/draft/2020-12/schema"`.
2. `dsh-mcp-client` passes the schema **as-is** to `ctx.tools.register`.
3. dsh's `assertSupportedJsonSchema` whitelists only `type/oneOf/properties/required/additionalProperties/items/enum/const` — **`$schema` is not supported** → throws `JsonSchemaError`.
4. The plugin catches it via `registrationFailure: "contain"` and **silently swallows** it, leaving a single error log line.

**Fix**: run [`dsh/apply-schema-fix.mjs`](dsh/apply-schema-fix.mjs) to strip unsupported keywords before registration (idempotent, backs up first). Details in [`dsh/README.md`](dsh/README.md).

## Token setup

### Get a token — Account API Token (recommended, proven path)

1. Open the Cloudflare dashboard → top-right account switch → **Manage Account** → **Account API Tokens** → **Create Token**.
2. Pick a **template** instead of fighting the permission dropdowns — permissions there are English-only and the dropdown is prefix-matched, which is easy to get wrong:
   - **"Write all resources"** — full account write. Fine for a personal dev account; don't use this on a production one.
   - **"Edit zone DNS"** — DNS records only.
   - **"Edit Cloudflare Workers"** — Workers / KV / R2.
3. Rename the token to something recognizable (e.g. `workbuddy-mcp`), set a **TTL** (don't pick "no expiry" — an expiring token is a 1-minute re-create, a leaked eternal token is a breach).
4. **Leave Client IP Address Filtering empty.** Behind a proxy/VPN your egress IP changes — a pinned IP will 401 mysteriously weeks later.
5. Create → copy the token (shown **only once**, `cfat_` prefix).

### Supplementing permissions — User API Token (least-privilege option)

If the account token is more than you want to hand out, create a **User API Token** instead: dashboard → **My Profile** → **API Tokens** → *Create Custom Token*, and add only the rows you need (e.g. Account Settings Read + Zone Read to start; add `DNS`/`Workers Scripts` **Edit** rows later by editing the same token — editing does **not** rotate the secret, and takes effect immediately). Both token types are accepted by the endpoint; permission scope is what differs.

### Token handling per client

- **WorkBuddy**: `mcp.json` headers, **plaintext** — its user-level config does not support env-var placeholders. Revoke/rotate from the dashboard anytime.
- **dsh**: `cordis.patch.yml` reads `CLOUDFLARE_API_TOKEN` via `!!js` tag — **no secret on disk**. Set the env var before launching dsh.

### Let the agent handle permission gaps

Bundle [`skill/SKILL.md`](skill/) into your client (copy to `~/.workbuddy/skills/cloudflare-token-permission/` or `~/.dsh/skills/`). It hard-wires one rule for the agent: **on 403 / insufficient-permission, never guess, never retry blindly, never route around — ask the user to add the permission**, then verify it landed via the read-only permission echo (`GET /zones` returns each zone's permission list).

> The `mcp.cloudflare.com/mcp` endpoint enforces OAuth, but both clients' MCP connectors use static Bearer tokens instead — that's the supported workaround, and the official docs confirm both user tokens and account tokens work.

## Verify it works

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

## License

MIT

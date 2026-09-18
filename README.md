# Cloudflare MCP Connector for WorkBuddy & dsh

[English](README.md) | [中文](README.zh-CN.md)

Working configs for connecting the **Cloudflare official API MCP** (Code Mode, `https://mcp.cloudflare.com/mcp`) to two AI agent clients:

| Directory | Client | Notes |
|---|---|---|
| [`workbuddy/`](workbuddy/) | **WorkBuddy** | Plug-and-play `mcp.json`. Token in plaintext (the only option there). |
| [`dsh/`](dsh/) | **DeepSeek Harness (dsh)** | Needs **one patch** — read the gotcha below, it's a silent failure. |

Both expose the same 3 tools: `docs` (doc search), `search` (OpenAPI spec search), `execute` (JS sandbox runner).

## The silent-failure gotcha (dsh)

Without the patch, dsh shows **"MCP connected" but zero tools registered** — with no visible error. Root cause chain:

1. Cloudflare's tool `inputSchema` carries `"$schema": "https://json-schema.org/draft/2020-12/schema"`.
2. `dsh-mcp-client` passes the schema **as-is** to `ctx.tools.register`.
3. dsh's `assertSupportedJsonSchema` whitelists only `type/oneOf/properties/required/additionalProperties/items/enum/const` — **`$schema` is not supported** → throws `JsonSchemaError`.
4. The plugin catches it via `registrationFailure: "contain"` and **silently swallows** it, leaving a single error log line.

**Fix**: run [`dsh/apply-schema-fix.mjs`](dsh/apply-schema-fix.mjs) to strip unsupported keywords before registration (idempotent, backs up first). Details in [`dsh/README.md`](dsh/README.md).

## Token setup

1. Create a token at https://dash.cloudflare.com/profile/api-tokens (Custom Token).
2. Start read-only (Account Settings Read + Zone Read); add Edit permissions for DNS/Workers only when needed.
3. Restrict Zone Resources to specific domains. Don't pick "no expiry".
4. **Leave Client IP Filtering empty** if you're behind a proxy/VPN — a pinned IP will 401 mysteriously later.

Token handling per client:

- **WorkBuddy**: `mcp.json` headers, **plaintext** — its user-level config does not support env-var placeholders. Revoke/rotate from the dashboard anytime.
- **dsh**: `cordis.patch.yml` reads `CLOUDFLARE_API_TOKEN` via `!!js` tag — **no secret on disk**. Set the env var before launching dsh.

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

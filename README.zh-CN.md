# Cloudflare MCP 连接器（WorkBuddy & dsh 双端）

[English](README.md) | [中文](README.zh-CN.md)

接入 **Cloudflare 官方 API MCP**（Code Mode，`https://mcp.cloudflare.com/mcp`）的两套实测可用配置：

| 目录 | 客户端 | 说明 |
|---|---|---|
| [`workbuddy/`](workbuddy/) | **WorkBuddy** | 即插即用的 `mcp.json`，令牌明文落盘（那边不支持环境变量，别无选择） |
| [`dsh/`](dsh/) | **DeepSeek Harness (dsh)** | **必须打一个补丁**——不打会静默失败，见下 |

两端暴露同样的 3 个工具：`docs`（文档检索）、`search`（OpenAPI spec 搜索）、`execute`（JS 沙箱执行器）。

## dsh 的静默失败坑（重点）

不打补丁时，dsh 表现为 **「MCP 连接成功但 0 个工具注册」**，且**不报错**。真因链条：

1. Cloudflare 返回的 tool `inputSchema` 带 `"$schema": "https://json-schema.org/draft/2020-12/schema"`。
2. `dsh-mcp-client` 把 schema **原样**交给 `ctx.tools.register`。
3. dsh 的 `assertSupportedJsonSchema` 只白名单 `type/oneOf/properties/required/additionalProperties/items/enum/const`，**`$schema` 不受支持** → 抛 `JsonSchemaError`。
4. 异常被 `registrationFailure: "contain"` **静默吞掉**，日志只剩一行 error。

**修法**：运行 [`dsh/apply-schema-fix.mjs`](dsh/apply-schema-fix.mjs)，注册前剥离不受支持的 schema 关键字（幂等，先备份）。详见 [`dsh/README.md`](dsh/README.md)。

## 令牌准备

1. 到 https://dash.cloudflare.com/profile/api-tokens 「创建自定义令牌」
2. 起步只读（账户设置 Read + 区域 Read），要动 DNS/Workers 再加 Edit
3. 区域资源限制到具体域名，TTL 别选无期限
4. **客户端 IP 筛选留空**——走代理/VPN 时填了固定 IP，之后会莫名 401

各端令牌处理：

- **WorkBuddy**：`mcp.json` 的 `headers` 里**明文**写（用户级配置不支持环境变量占位符）。泄露了随时去控制台吊销换新。
- **dsh**：`cordis.patch.yml` 用 `!!js` 标签从环境变量 `CLOUDFLARE_API_TOKEN` 读取，**令牌不落盘**。启动 dsh 前设好环境变量。

> `mcp.cloudflare.com/mcp` 端点强制 OAuth，但两端的 MCP 连接器都走静态 Bearer Token——官方文档明确用户令牌和账户令牌都支持，这是可行的一等路径。

## 验证连通

不启动客户端直接测（在客户端自己的 `node_modules` 里跑）：

```js
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const t = new StreamableHTTPClientTransport(new URL("https://mcp.cloudflare.com/mcp"), {
  requestInit: { headers: { Authorization: "Bearer <你的令牌>" } },
});
const c = new Client({ name: "probe", version: "1.0.0" });
await c.connect(t);
console.log((await c.listTools()).tools.map(x => x.name)); // ["docs","search","execute"]
await c.close();
```

## 许可

MIT

# Cloudflare MCP 连接器（WorkBuddy & dsh 双端）

[English](README.md) | [中文](README.zh-CN.md)

接入 **Cloudflare 官方 API MCP**（Code Mode，`https://mcp.cloudflare.com/mcp`）的两套实测可用配置：

| 目录 | 客户端 | 说明 |
|---|---|---|
| [`workbuddy/`](workbuddy/) | **WorkBuddy** | 即插即用的 `mcp.json`，令牌明文落盘（那边不支持环境变量，别无选择） |
| [`dsh/`](dsh/) | **DeepSeek Harness (dsh)** | **必须打一个补丁**——不打会静默失败，见下 |
| [`skill/`](skill/) | **任何 agent** | 即装即用的 `SKILL.md`：让 agent 在碰到 403 时**找你补权限**，而不是瞎猜乱试 |

两端暴露同样的 3 个工具：`docs`（文档检索）、`search`（OpenAPI spec 搜索）、`execute`（JS 沙箱执行器）。

## dsh 的静默失败坑（重点）

不打补丁时，dsh 表现为 **「MCP 连接成功但 0 个工具注册」**，且**不报错**。真因链条：

1. Cloudflare 返回的 tool `inputSchema` 带 `"$schema": "https://json-schema.org/draft/2020-12/schema"`。
2. `dsh-mcp-client` 把 schema **原样**交给 `ctx.tools.register`。
3. dsh 的 `assertSupportedJsonSchema` 只白名单 `type/oneOf/properties/required/additionalProperties/items/enum/const`，**`$schema` 不受支持** → 抛 `JsonSchemaError`。
4. 异常被 `registrationFailure: "contain"` **静默吞掉**，日志只剩一行 error。

**修法**：运行 [`dsh/apply-schema-fix.mjs`](dsh/apply-schema-fix.mjs)，注册前剥离不受支持的 schema 关键字（幂等，先备份）。详见 [`dsh/README.md`](dsh/README.md)。

## 令牌准备

### 获取令牌 —— 账户 API 令牌（推荐，实测通路）

1. 打开 Cloudflare 控制台 → 右上角切到目标账户 →「**管理账户**」→「**账户 API 令牌**」→「创建令牌」。
2. 直接点**权限模板**，别一格一格跟权限下拉搏斗——那个下拉里的权限名全是英文原文、还是前缀匹配，很容易选错：
   - **「Write all resources」**——全账户可写。个人开发者测试账户无所谓，生产账户别这么干。
   - **「Edit zone DNS」**——只管解析记录。
   - **「Edit Cloudflare Workers」**——Workers / KV / R2。
3. 令牌名称改成认得出的（比如 `workbuddy-mcp`），**TTL** 给个期限（别选「无期限」——过期了重建只要一分钟，泄漏一个永不过期的令牌是事故）。
4. **客户端 IP 地址筛选留空**。走代理/VPN 时出口 IP 会变，固定 IP 过几周会莫名其妙 401。
5. 创建 → 复制令牌（**只显示一次**，`cfat_` 前缀）。

### 补充权限 —— 用户 API 令牌（最小权限路线）

不想给账户级令牌的话，改用**用户 API 令牌**：控制台 →「我的个人资料」→「API 令牌」→「创建自定义令牌」，按需逐行加权限（起步只读：账户设置 Read + 区域 Read；之后要加 Edit 直接**编辑同一个令牌**——编辑**不换密钥**，改完立即生效）。端点两种令牌都认，区别只在权限范围。

### 各端令牌处理

- **WorkBuddy**：`mcp.json` 的 `headers` 里**明文**写（用户级配置不支持环境变量占位符）。泄露了随时去控制台吊销换新。
- **dsh**：`cordis.patch.yml` 用 `!!js` 标签从环境变量 `CLOUDFLARE_API_TOKEN` 读取，**令牌不落盘**。启动 dsh 前设好环境变量。

### 让 agent 自己处理权限缺口

把 [`skill/SKILL.md`](skill/) 装进客户端（复制到 `~/.workbuddy/skills/cloudflare-token-permission/` 或 `~/.dsh/skills/`）。它给 agent 钉死一条规矩：**碰到 403 / 权限不足，不许瞎猜、不许盲目重试、不许绕路——找用户加权限**，加完用只读的权限回显（`GET /zones` 会返回每个 zone 的权限清单）验证是否生效。

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

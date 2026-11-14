# Cloudflare MCP 连接器（WorkBuddy & dsh 双端）

[English](README.md) | [中文](README.zh-CN.md)

接入 **Cloudflare 官方 API MCP**（Code Mode，`https://mcp.cloudflare.com/mcp`）的即用配置。接入后 agent 获得同样 3 个工具：`docs`（文档检索）、`search`（OpenAPI spec 搜索）、`execute`（JS 沙箱执行器）。

[![npm](https://img.shields.io/npm/v/@shifu-hu/dsh-cloudflare-mcp.svg)](https://www.npmjs.com/package/@shifu-hu/dsh-cloudflare-mcp)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

| 目录 | 客户端 | 内容 |
|---|---|---|
| [`workbuddy/`](workbuddy/) | **WorkBuddy** | `mcp.json` —— 复制、贴令牌、完成 |
| [`dsh/`](dsh/) | **DeepSeek Harness (dsh)** | 配置 **外加一个必打补丁**——跳过下面第 2 步，工具会静默注册失败 |
| [`skill/`](skill/) | **任何 agent** | `SKILL.md` —— 让 agent 碰到 403 时向用户申请补权限，而不是瞎猜乱试 |

## 第 1 步 —— 获取 API 令牌

1. 打开 Cloudflare 控制台 → 右上角切到目标账户 →「**管理账户**」→「**账户 API 令牌**」→「创建令牌」；
2. 直接选**权限模板**，不必在英文原文、前缀匹配的权限下拉里逐项挑选（很容易选错）：
   - **「Write all resources」**——全账户可写。个人开发者测试账户无所谓，生产账户别这么干；
   - **「Edit zone DNS」**——只管解析记录；
   - **「Edit Cloudflare Workers」**——Workers / KV / R2；
3. 令牌名称改成认得出的（比如 `workbuddy-mcp`），**TTL 给个期限**——别选「无期限」：过期了重建只要一分钟，泄漏一个永不过期的令牌是事故；
4. **客户端 IP 地址筛选留空**——走代理/VPN 时出口 IP 会变，固定 IP 过几周会莫名其妙 401；
5. 创建 → 复制令牌（**只显示一次**，`cfat_` 前缀）。

最小权限路线：改用**用户 API 令牌**（控制台 →「我的个人资料」→「API 令牌」→「创建自定义令牌」）。按需逐行加权限（起步只读：账户设置 Read + 区域 Read），之后要加直接**编辑同一个令牌**——编辑**不换密钥**，改完立即生效。端点两种令牌都认，区别只在权限范围。

## 第 2 步 —— 接入你的客户端

### WorkBuddy

1. 把 `workbuddy/mcp.json` 复制进 WorkBuddy 用户级配置（细节见 [`workbuddy/README.md`](workbuddy/README.md)）；
2. 把令牌贴进 `Authorization: Bearer` 请求头——那边只支持明文（用户级配置没有环境变量占位符）；泄漏了随时去控制台吊销换新；
3. 重启并信任新的 MCP 服务器。

### dsh

已发布到 npm：**[@shifu-hu/dsh-cloudflare-mcp](https://www.npmjs.com/package/@shifu-hu/dsh-cloudflare-mcp)**

```bash
plugin_manager install_bundle @shifu-hu/dsh-cloudflare-mcp
```

一次安装同时装好三样：

| 内容 | 方式 |
|---|---|
| MCP 连接 | bundle 的 patch 插入 `mcp-cloudflare` 条目 |
| 工具注册修复 | 加载时自动执行（改写 `dsh-mcp-client` 的一个调用点，先备份） |
| 权限 skill | 写入 `~/.dsh/skills/cloudflare-token-permission/SKILL.md` |

1. **启动 dsh 前**设好环境变量：`CLOUDFLARE_API_TOKEN`（由 `!!js` 标签读取，**令牌不落盘**）；
2. **重启 dsh**，补丁执行后三个工具即出现；
3. 若之后升级了 `@deepseek-ai/dsh-mcp-client`，其文件会被覆盖——插件下次加载会自动重打，也可手动执行：

```bash
node node_modules/@shifu-hu/dsh-cloudflare-mcp/apply-schema-fix.mjs
```

两步自动行为都可以在 bundle 配置里关掉：

```yaml
- id: mcp-cloudflare
  name: '@shifu-hu/dsh-cloudflare-mcp'
  config:
    patchClient: false    # 不改 dsh-mcp-client
    installSkill: false   # 不写 skill 文件
```

> **本插件会修改另一个包。** 它改写 `@deepseek-ai/dsh-mcp-client` 里的一处 `inputSchema:` 调用，剥离 harness 不接受的 JSON-Schema 关键字（`$schema`），改写前备份为 `index.js.bak-schema-fix`。幂等，且对你接的**所有** MCP server 都有帮助——但它确实动了自身包外的文件，你需要知情。

### 其他 agent

把 [`skill/SKILL.md`](skill/SKILL.md) 放进客户端技能目录（`~/.workbuddy/skills/cloudflare-token-permission/` 或 `~/.dsh/skills/`）。它给 agent 钉死一条规矩：碰到 403 / 权限不足，不许瞎猜、不许盲目重试、不许绕路——**找用户加权限**，加完用只读回显验证（`GET /zones` 会返回每个 zone 的权限清单）。

## 第 3 步 —— 验证连通

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

## 常见问题

| 现象 | 原因 / 处理 |
|---|---|
| dsh：「MCP 连接成功」、0 个工具、不报错 | Cloudflare 的 `inputSchema` 带 `$schema`，dsh 的白名单不认——异常被静默吞掉。跑 `dsh/apply-schema-fix.mjs` 后重启 |
| 用了几周后 401 | 建令牌时在走代理/VPN 的情况下固定了 IP——重建一个 IP 筛选留空的令牌 |
| 403 权限不足 | 编辑令牌补上缺的权限行（编辑不换密钥），或装 `skill/SKILL.md` 让 agent 向用户申请补权限 |
| 令牌泄漏 | 控制台吊销，新建一个，重新贴进客户端 |

> `mcp.cloudflare.com/mcp` 端点强制 OAuth，但两端的 MCP 连接器都走静态 Bearer Token——官方文档明确用户令牌和账户令牌都支持，这是可行的一等路径。

## 许可

MIT

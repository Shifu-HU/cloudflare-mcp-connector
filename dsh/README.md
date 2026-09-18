# Cloudflare MCP 连接器配置（dsh 版）

Cloudflare 官方 API MCP（**Code Mode**）接入 DeepSeek Harness 的连接器配置。

与 `../workbuddy/` 同一个端点、同一套工具；区别在于 dsh 这边**令牌不落盘**，
并且多了**一个必须打的补丁**（否则会静默失败，见下）。

## 目录内容

| 文件 | 作用 |
|---|---|
| `cordis.patch.yml` | dsh profile 的 MCP 配置段（令牌走环境变量） |
| `apply-schema-fix.mjs` | **必打补丁**：修 `dsh-mcp-client` 无法注册 Cloudflare 工具的问题 |

## 为什么需要那个补丁（实测结论）

不打补丁的话，你的 dsh 会表现为「MCP 连上了但一个工具都没有」，
而且**不报错**——这正是最难查的地方。真因链条：

1. Cloudflare 返回的每个 tool `inputSchema` 都带
   `"$schema": "https://json-schema.org/draft/2020-12/schema"`。
2. `dsh-mcp-client` 把该 schema **原样**交给 `ctx.tools.register`。
3. dsh 的 `assertSupportedJsonSchema` 只接受
   `type/oneOf/properties/required/additionalProperties/items/enum/const` + 注解，
   **`$schema` 是不支持关键字** → 抛 `JsonSchemaError`。
4. 该异常被插件 catch 后按 `registrationFailure: "contain"` **静默吞掉**，
   只留一行 error 日志 → **0 个工具注册，连接却显示成功**。

实跑未打补丁的原版，日志就是这一行：

```
[error] mcp-client(cloudflare): tool registration failed, no tools registered:
JsonSchemaError: unsupported JSON schema: schema.$schema is not a supported keyword
        (subset: type/oneOf/properties/required/additionalProperties/items/enum/const + annotations)
```

> ⚠️ 注意：配置里的 `failOnStartupError: true` **救不了这个故障**。
> 那个开关只在 `client.connect` 握手失败时生效；本例握手是成功的，
> 坏在之后的注册阶段。加了它只会让你以为排查过了。

补丁做的事：注册前递归剥离不受支持的 schema 关键字（保留
`type/properties/required/additionalProperties/items/enum/const` 与描述注解）。
它对你接的**所有** MCP server 都更健壮，不只 Cloudflare。

## 使用步骤

### 1. 设置令牌（不要写进配置文件）

PowerShell：

```powershell
# 当前会话临时生效
$env:CLOUDFLARE_API_TOKEN="你的令牌"

# 或永久写入用户环境变量（新开终端生效）
setx CLOUDFLARE_API_TOKEN "你的令牌"
```

### 2. 追加配置

把 `cordis.patch.yml` 里的条目追加到
`~/.dsh/profiles/<你的profile>/cordis.patch.yml` 的**顶层列表末尾**
（注意是 list 元素，缩进与同级条目对齐）。

### 3. 打补丁

```powershell
node apply-schema-fix.mjs
```

自动探测 `~/.dsh/profiles/*/node_modules/@deepseek-ai/dsh-mcp-client/lib`；
也可显式指定目录。幂等，重复运行安全，会先备份成 `index.js.bak-schema-fix`。

### 4. 重启 dsh

配置和补丁都是**启动时加载**，必须重启 dsh 生效。

### 5. 验证

在 dsh 对话里直接问「你现在有哪些工具」，应能看到：

- `mcp__cloudflare__docs`
- `mcp__cloudflare__search`
- `mcp__cloudflare__execute`

## 获取 API Token

**主路径 —— 账户 API 令牌**（实测通路）：

1. Cloudflare 控制台 →「管理账户」→「账户 API 令牌」→「创建令牌」
2. 直接点**权限模板**（`Write all resources` / `Edit zone DNS` / `Edit Cloudflare Workers`），别一格一格选——权限名全是英文原文且前缀匹配，很容易选错
3. 令牌改名成认得出的（如 `workbuddy-mcp`），TTL 给个期限，别选无期限
4. **客户端 IP 筛选留空**（走代理/VPN 的话填了会莫名 401）
5. 创建后令牌只显示一次，设进环境变量（见上）

**补充权限 —— 用户 API 令牌**（最小权限路线）：控制台 →「我的个人资料」→「API 令牌」→「创建自定义令牌」，按需逐行加；后续加权限直接编辑同一令牌（不换密钥，立即生效）。端点两种令牌都认。

> 配套给 agent 装上 [`../skill/`](../skill/) 里的 SKILL.md，agent 碰到 403 会来找你要权限而不是瞎试。

> dsh 支持 `!!js` 从环境变量读令牌，所以**不像 WorkBuddy 那样需要明文落盘**。
> 但环境变量本身仍是明文，别把它提交进 git。

## 工具清单

| 工具 | 说明 |
|---|---|
| `docs` | Cloudflare 文档检索，参数 `{ query: "..." }` |
| `search` | OpenAPI spec 搜索（Code Mode，参数是 JS async 函数） |
| `execute` | 执行 `cloudflare.request()` 等（Code Mode，JS 在 CF 服务端沙箱跑） |

工具名规则：`mcp__cloudflare__<name>`。权限范围由你的 Token 决定。

### Code Mode 注意

`search` / `execute` 的参数是 `{ code: "<JS async arrow function>" }`，
**JS 代码在 Cloudflare 服务端沙箱里执行**，不是查询字符串。
函数签名没把握时先调 `docs`。

## 已知坑

- **该端点强制 OAuth**，而 `dsh-mcp-client` 不走 OAuth —— 静态 Bearer Token 是唯一路径。
- **升级 dsh-mcp-client 会覆盖补丁**，故障原样复发。升级后重跑 `apply-schema-fix.mjs` 即可。
- 端点在海外的，本机需能直连 `mcp.cloudflare.com`；必要时给 dsh 进程设
  `HTTPS_PROXY`（如 `http://127.0.0.1:7890`）。
- 插件**断开不自动重连**：改完配置/网络波动后，重启 dsh 最稳。

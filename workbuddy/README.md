# Cloudflare MCP 连接器配置（WorkBuddy 实测可用版）

Cloudflare 官方 API MCP（Code Mode）接入 WorkBuddy 的连接器配置。本配置已实测打通：`connect` → `listTools`（docs / search / execute）→ 真实工具调用。

## 使用方法

1. 复制 `mcp.json` 内容到你的 `~/.workbuddy/mcp.json`（已有配置则合并进 `mcpServers`，别覆盖其它 server）
2. 把 `YOUR_CLOUDFLARE_API_TOKEN` 换成你自己的令牌

## 获取 API Token

**主路径 —— 账户 API 令牌**（实测通路）：

1. Cloudflare 控制台 →「管理账户」→「账户 API 令牌」→「创建令牌」
2. 直接点**权限模板**（`Write all resources` / `Edit zone DNS` / `Edit Cloudflare Workers`），别一格一格选——权限名全是英文原文且前缀匹配，很容易选错
3. 令牌改名成认得出的（如 `workbuddy-mcp`），TTL 给个期限，别选无期限
4. **客户端 IP 筛选留空**（走代理/VPN 的话填了会莫名 401）
5. 创建后令牌只显示一次，替换下面 `mcp.json` 里的占位符

**补充权限 —— 用户 API 令牌**（最小权限路线）：控制台 →「我的个人资料」→「API 令牌」→「创建自定义令牌」，按需逐行加；后续加权限直接编辑同一令牌（不换密钥，立即生效）。端点两种令牌都认。

> 配套给 agent 装上 [`../skill/`](../skill/) 里的 SKILL.md，agent 碰到 403 会来找你要权限而不是瞎试。

> ⚠️ 令牌在本文件里是**明文**（WorkBuddy 用户级 mcp.json 不支持环境变量占位符）。泄露了就去令牌页 Remove，一分钟换新的。

## 首次启用

- WorkBuddy：重启客户端 → 连接器管理 → 自定义连接器里找到 `cloudflare-api` → 点「信任」→ 状态变绿即用
- 走 OAuth 授权的话，WorkBuddy 客户端默认回调是自定义协议深链，部分厂商（含 Cloudflare）只收 HTTPS/环回地址会拒绝——**直接用静态 Bearer Token 是绕开这个坑的稳妥做法**

## 工具清单

| 工具 | 说明 |
|---|---|
| `docs` | Cloudflare 文档检索 |
| `search` | OpenAPI spec 搜索（Code Mode，参数是 JS async 函数） |
| `execute` | 执行 `cloudflare.request()` 等（Code Mode，JS 在 CF 服务端沙箱跑） |

工具名规则：`mcp__cloudflare-api__<name>`。权限范围由你的 Token 决定。

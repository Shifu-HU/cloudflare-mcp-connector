# Cloudflare MCP 连接器配置（WorkBuddy 实测可用版）

Cloudflare 官方 API MCP（Code Mode）接入 WorkBuddy 的连接器配置。本配置已实测打通：`connect` → `listTools`（docs / search / execute）→ 真实工具调用。

## 使用方法

1. 复制 `mcp.json` 内容到你的 `~/.workbuddy/mcp.json`（已有配置则合并进 `mcpServers`，别覆盖其它 server）
2. 把 `YOUR_CLOUDFLARE_API_TOKEN` 换成你自己的令牌

## 获取 API Token

1. 打开 https://dash.cloudflare.com/profile/api-tokens
2. 「创建令牌」→「创建自定义令牌」
3. 权限按需勾选（起步建议只读：账户设置 Read + 区域 Read；要动 DNS/Workers 再加 Edit）
4. 区域资源建议限制到特定域名，TTL 别选无期限
5. **客户端 IP 筛选留空**（走代理/VPN 的话填了会莫名 401）

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

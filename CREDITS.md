# 授权与来源

## 本仓库内容

| 内容 | 说明 |
|---|---|
| `dsh/cordis.patch.yml` | Cloudflare 官方 MCP 端点的接入配置 |
| `dsh/apply-schema-fix.mjs`、`lib/index.js` | 本项目的修补逻辑（原创） |
| `workbuddy/mcp.json` | 同端点的 WorkBuddy 配置 |
| `skill/SKILL.md` | 面向 agent 的权限守门规则（原创） |

以上由 **Shifu-HU** 编写，MIT 许可（见 `LICENSE`）。

## 第三方

| 名称 | 归属 | 许可 |
|---|---|---|
| Cloudflare API MCP 端点 `mcp.cloudflare.com/mcp` | Cloudflare, Inc. | 由其服务条款约束 |
| `@deepseek-ai/dsh-mcp-client` | DeepSeek | 随 the agent runtime 分发 |

本项目**不包含**上述第三方的代码，仅提供指向其端点的配置。

## 商标

Cloudflare 是其权利人的商标。本项目为第三方集成配置，与 Cloudflare, Inc. 无隶属关系，也未获其背书。

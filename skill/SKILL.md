---
name: cloudflare-token-permission
description: Cloudflare MCP 权限守门规则（WorkBuddy / dsh 双端通用）。当 Cloudflare API/MCP 调用返回 403 或权限不足，或需要令牌尚未授予的权限才能完成用户要求时使用。规则要求 agent 停下来找用户补权限，禁止瞎猜、禁止盲目重试、禁止绕路。含权限回显验证法（只读无副作用）、控制台操作指引（中英文界面差异）、工具不可见 ≠ 权限问题的分诊表、破坏性操作确认红线。触发词：Cloudflare 403、insufficient permission、权限不足、无法访问某 CF 资源、令牌权限、需要 CF 权限。
---

# Cloudflare 令牌权限守门

## 硬性规则（先读这个）

1. **令牌权限是用户有意设定的安全边界，不是障碍。** 用户的 Cloudflare 账户（域名、DNS、Workers）动不得，权限没有就不做。
2. 调用返回 **403 / insufficient permissions / authentication error（且令牌 verify 为 active）** → 这是权限不足。**唯一正确动作：向用户申请补权限**，说清楚三件事——要哪个权限组（英文名）、为什么需要、加在哪个令牌上。
   - dsh 侧可以直接用 `ask_user_question` 工具把这三件事问出来。
3. **禁止**：反复重试碰运气、用公开/未认证接口绕过、自作主张建议用户直接上「Write all resources」（除非用户自己提出）、伪造或降低操作范围蒙混过关。
4. **禁止把「没权限」当成「技术上做不到」就悄悄放弃**——必须明确告诉用户缺哪个权限、卡在哪一步。

## 第一步：确认是「权限问题」还是「令牌问题」

| 现象 | 结论 | 动作 |
|---|---|---|
| `401 invalid_token` / `malformed` | 令牌无效（过期/吊销/抄错） | 让用户检查令牌状态，不是权限问题 |
| verify 返回 `active`，但业务调用 403 | **权限不足** | 走下面的申请流程 |

验证令牌状态（只读）：

- 用户令牌（`cfut_`）：`GET https://api.cloudflare.com/client/v4/user/tokens/verify`
- 账户令牌（`cfat_`）：`GET https://api.cloudflare.com/client/v4/accounts/{account_id}/tokens/verify`

## 第二步：回显当前权限（只读、无副作用，先做这个再开口要）

```
GET https://api.cloudflare.com/client/v4/zones?per_page=10
Authorization: Bearer <令牌>
```

返回里每个 zone 自带 `permissions` 数组，**回显该令牌在此 zone 的全部权限**：
`#zone:read`、`#dns_records:edit`、`#worker:read`、`#cache_purge:edit`……

把「要做的操作需要的权限组」和这份清单对照，缺哪个一目了然。账户级操作用 `GET /accounts` 看账户范围。

## 第三步：给用户的补权限指引（照抄给用户）

**主路径（账户令牌，`cfat_`）**：
1. Cloudflare 控制台 →「管理账户」→「账户 API 令牌」→ 找到令牌 →「编辑」
2. 权限区点「添加更多」→ 第 1 格选范围（账户/区域）→ 第 2 格打**英文名** → 第 3 格选「编辑」
3. 「继续以显示摘要」→「更新令牌」。**编辑不换密钥，改完立即生效**，agent 侧配置不用动。

**用户令牌（`cfut_`）**：「我的个人资料」→「API 令牌」→ 找到令牌 →「编辑」，其余相同。

**常用权限组英文名**（第 2 格搜索用）：

| 要干嘛 | 搜这个 |
|---|---|
| 增删改解析记录 | `DNS` |
| 清缓存 | `Cache Purge` |
| 部署/删 Worker | `Workers Scripts` |
| KV 读写 | `Workers KV Storage` |
| R2 读写 | `Workers R2 Storage` |
| D1 数据库 | `D1` |
| 区域设置 | `Zone Settings` |

**控制台坑（主动告诉用户，省一轮来回）**：
- 中文控制台只翻了界面框架，**权限名全是英文原文**，打中文搜不出来。
- 权限下拉是**前缀匹配**，`acc` 会把 `Access:` 开头的一起带出来；打到 `account s` 才收敛到 `Account Settings`。
- 选完扫一眼第 3 格有没有出现「编辑」——第 3 格选项跟着第 2 格变，可用来确认第 2 格选对了。
- **客户端 IP 筛选保持空**（用户走 VPN，出口 IP 会变）；TTL 别选无期限。

用户说加完了 → 重打第二步的 `/zones` 回显，确认目标 `#xxx:edit` 出现，再继续干活。

## dsh 专属：工具命名与「看不见 ≠ 没权限」

三个工具在两端叫法不同，别混：

| 客户端 | 工具形态 |
|---|---|
| WorkBuddy | `cloudflare-api` 连接器 → `docs` / `search` / `execute` |
| dsh | MCP 工具名 `mcp__cloudflare__docs` / `__search` / `__execute` |

**在 dsh 里，如果问「你有哪些工具」看不到 `mcp__cloudflare__*` —— 这大概率不是权限问题，别套用本技能。** 先按接入问题查这两点：

1. **插件补丁还在不在**：`dsh-mcp-client/lib/index.js` 里应能搜到 `sanitizeSchema`。
   升级 dsh-mcp-client 会**覆盖掉**这个补丁，故障原样复发。
2. **改过配置后有没有重启 dsh**：配置和补丁都是启动时加载的。

确认是接入问题的话，让用户跑 `apply-schema-fix.mjs` 并重启，而不是去控制台加权限（加了也没用）。

## 红线

- **破坏性写操作**（删 DNS 记录、删 Worker、改 SSL/Zone Settings、清空 R2）即使权限够，也要先列出目标资源向用户确认再动手。dsh 侧用 `ask_user_question` 确认。
- 权限与令牌的任何变更**由用户在控制台亲手完成**，agent 只提供指引和验证，不碰凭据本身。
- 令牌轮换/吊销后，两处**独立存放**的配置都要同步换：
  - WorkBuddy：`~/.workbuddy/mcp.json` 的 `headers`
  - dsh：`~/.dsh/profiles/*/cordis.patch.yml` 的 `Authorization`（或环境变量 `CLOUDFLARE_API_TOKEN`）

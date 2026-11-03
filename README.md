# ticketodo

企业内部的 ticket 与 todo：按「重要 × 紧急」四象限排优先级（P0–P3），只用企业账号（authentik，OIDC）
登录，带管理员、站内通知与只追加的审计。单镜像 + Helm chart 部署。

## 规则一览

|  | 紧急 | 不紧急 |
| --- | --- | --- |
| **重要** | **P0** 立即做 | **P1** 计划做 |
| **不重要** | **P2** 委派做 | **P3** 有空做 |

- **ticket** 交给别人处理：建单时**必须**指定负责人（不存在没人负责的单），全员可见。
  只能指派给登录过 ticketodo 的人。**改派只有当前负责人或管理员**，改派不改状态。
- **todo** 是自己的事：负责人恒为本人，只有本人与管理员看得到。可以转成 ticket（单号不变，转之前的
  记录别人看不到）。
- **状态**：待处理 → 处理中 → 已解决 → 已关闭。负责人推进到「已解决」，提单人确认关闭或打回重做；
  提单人也能撤回、重开。todo 没有「已解决」，本人直接完成。
- **编辑**：ticket 的提单人、负责人；todo 的本人。**管理员能看、能改一切**（含别人的 todo）。
- **删除**是软删（ticket 提单人、todo 本人、管理员），管理员在回收站恢复。
- **单号** `TK-YYYYMMDD-NNNN`：北京日期 + 当日序号，ticket 与 todo 共用。
- **期望完成日期**按北京时间算逾期；已解决、已关闭的不算。

## 功能

- 四象限看板：拖到别的象限即改优先级（键盘也能拖）；「需要我处理 / 我提的 / 全部」三个视角；
  顶部概览「逾期 / 今天到期 / 待我确认关闭 / 进行中」，点开就是对应筛选的列表
- 列表：类型、状态、优先级、标签、负责人、提单人都能多选筛选，期望完成可选「已逾期 / 今天 / 7 天内 /
  未设」或任意日期范围；点表头按优先级、期望完成、单号（创建）、更新时间排序（默认 P0 在前、同级里快到期
  的在前）。筛选与排序都写在地址栏，链接可以直接发给同事
- 详情：状态操作、编辑、改派、转 ticket、删除；描述与评论支持 Markdown，评论里 `@` 人
- 站内通知：被指派、状态变更、新评论、被 @、即将到期、已逾期（侧栏未读数 30 秒刷新）
- 管理后台：授予 / 撤销管理员、标签改名 / 合并 / 删除、回收站、审计查询

## 架构

```
浏览器 ──▶ Next.js（App Router · tRPC · better-auth）──▶ PostgreSQL
               │                                   ▲
               └─ OIDC ──▶ authentik ──▶ dingorg（钉钉）│
CronJob dueremind（每天 09:00 北京）────────────────┘
```

pnpm · Next.js 16 · React 19 · TypeScript · tRPC 11 · drizzle · PostgreSQL · better-auth ·
Tailwind 4 · shadcn/ui · Biome。一个镜像三个入口：`node server.js`（web）、
`node dist/bin/migrate.cjs`（迁移）、`node dist/bin/cron/dueremind.cjs`（到期提醒）。

## 快速开始（本地开发）

```bash
# 1. PostgreSQL：给 ticketodo 一个空库（开发库）和一个测试库（集成测试会改写它，别指向开发库）
cp .env.example .env            # 填 DATABASE_URL、TEST_DATABASE_URL、BETTER_AUTH_SECRET 与 authentik 三项

# 2. 依赖、建表、起服务
pnpm install
pnpm db:migrate
pnpm dev                        # http://localhost:3000
```

缺了或填错 env，服务启动即退出并列出全部问题（只列变量名与规则，不回显值）。

## authentik 配置清单

在 authentik 里建一个 **OAuth2/OpenID Provider** 和对应的 **Application**：

| 项 | 值 |
| --- | --- |
| Client type | Confidential |
| Redirect URIs | `https://<ticketodo 域名>/api/auth/callback/authentik`（本地加一条 `http://localhost:3000/api/auth/callback/authentik`） |
| **Signing Key** | **必须选一个 RS256 证书**。不选的话 authentik 用 HS256 且不发布 JWKS，ticketodo 拒绝注册这个登录方式 |
| Scopes | `openid`、`email`、`profile` |
| Subject mode | 默认（hashed user id）或 user UUID。⚠️ 别用 username / email：它们一变，同一个人就成了新用户 |

`.env` 里的三项：`AUTHENTIK_DISCOVERY_URL` = `https://<authentik>/application/o/<应用 slug>/.well-known/openid-configuration`，
`AUTHENTIK_CLIENT_ID` / `AUTHENTIK_CLIENT_SECRET` 照 Provider 页面填。

- 身份只认 OIDC 的 `sub`：邮箱、姓名、头像每次登录从 authentik 同步。没有邮箱的人也能登录。
- **第一个管理员**：`BOOTSTRAP_ADMIN_EMAILS` 里的人登录即成为管理员，**只在系统里还没有管理员时生效**
  （记一条 `admin.bootstrap` 审计）。之后在「成员与管理员」页授予 / 撤销，至少保留一名。
- 登出只退出 ticketodo，不连带退出 authentik 的单点登录会话。
- 会话 7 天、活跃时自动续期。离职的人在 authentik / dingorg 侧被拒后无法再次登录，但已有会话要等
  过期；需要立刻踢人时，到库里删掉他在 `ticketodo_session` 的行。

## 审计

写操作、登录 / 登出 / 登录失败、首次登录建档、权限变更、越权被拒（`status = failure`）都记进
`ticketodo_audit_log`，带字段级前后值（`details.changes`）与 `request_id`（与日志的 `reqId` 同值，
也在响应头 `x-request-id` 里）。表上有触发器拒绝 UPDATE / DELETE / TRUNCATE。

管理后台「审计日志」可按动作前缀、单号、结果、日期查。直接查库：

```sql
-- 某张单的全部记录（含评论）
SELECT at, actor_name, action, status, details FROM ticketodo_audit_log
WHERE target_name = 'TK-20261103-0001' ORDER BY id;

-- 最近的越权尝试
SELECT at, actor_name, action, target_name, details->>'summary', ip FROM ticketodo_audit_log
WHERE status = 'failure' ORDER BY id DESC LIMIT 50;
```

`ip` 只在对外地址是 https（前面有代理）时记，取 `X-Forwarded-For`；直连的 http 环境不记（Next 拿不到
socket 地址，又不能信来件的头）。

## 日志

stdout 一行一个 JSON（pino），级别是字符串、时间 ISO。每个 tRPC 调用一行（变更 info、查询 debug），带
`reqId`、`path`、`durationMs`。SQL 参数、OAuth token 与回调里的 code 不进日志。`LOG_LEVEL` 调级别。

## 部署（K8s / Helm）

```bash
# 1. 先建 Secret（chart 不自建，且必须先于 chart 存在：迁移 hook 要用）
kubectl create namespace ticketodo
kubectl create secret generic ticketodo-app -n ticketodo \
  --from-literal=DATABASE_URL='postgresql://...' \
  --from-literal=BETTER_AUTH_SECRET="$(openssl rand -base64 32)" \
  --from-literal=AUTHENTIK_CLIENT_SECRET='...'

# 2. 填 values（ingress.host 与 authentik 两项）后部署发版号 X.Y.Z 的 chart
cp charts/ticketodo/values.example.yaml values.prod.yaml
helm upgrade --install ticketodo oci://ghcr.io/yupanzi/charts/ticketodo --version X.Y.Z \
  -n ticketodo -f values.prod.yaml --wait --timeout 10m
```

部署未发版的本地改动时，把 OCI 地址换成 `./charts/ticketodo`、去掉 `--version`。⚠️ GHCR 的 package
不继承仓库的公开可见性：镜像与 chart 第一次发布后要到 GitHub 的 package 设置里改成 Public。

产出：Deployment（2 副本）+ Service + Ingress + 迁移 Job（`pre-install,pre-upgrade` hook，失败则整次
升级中止）+ CronJob `dueremind`。需要 Kubernetes ≥ 1.27（CronJob `timeZone`；更老的集群删掉
`timeZone` 并把 schedule 改成 UTC）。

- `BETTER_AUTH_URL` 从 `ingress.host` 派生；它是 https 时才信任 `X-Forwarded-For` / `X-Request-ID`。
  ⚠️ 前提是代理覆盖（而非透传）这些头，且不可绕过代理直连。
- 每个 Pod 只拿自己用得到的凭证：web 三个，迁移与 cron 只有 `DATABASE_URL`。
- ⚠️ **改了 Secret 必须 bump `values.secretVersion`**，否则常驻进程还拿着旧值。⚠️ 换
  `BETTER_AUTH_SECRET` 会让全员掉线，已加密存储的 OAuth token 也解不开（不影响再次登录）。
- `DATABASE_URL` 的 `sslmode` 与 psql 同义，密码要 URL 编码。连 RDS 写 `?sslmode=require`。
- 与别的项目共用一个库也行：表、枚举、索引都带 `ticketodo_` 前缀，迁移记录在
  `public.ticketodo_migrations`。
- 登录限流在进程内存里，多副本各算各的。

## 版本与发布

push 到 `master` 后 CI 的 release job 按 Conventional Commits 算版本：`feat` → minor，`fix` / `perf`
→ patch，其余不发版。版本号、CHANGELOG、tag、GitHub Release、镜像 `ghcr.io/yupanzi/ticketodo` 与
chart `oci://ghcr.io/yupanzi/charts/ticketodo` 都由它出，别手改版本号、别手打 tag。
版本从 0.1.0 起（基线 tag `v0.0.0`）。

## 常用命令

```bash
pnpm dev                 # 本地开发
pnpm check               # Biome（lint + 格式）；check:write 自动修
pnpm typecheck           # next typegen + tsc
pnpm test                # vitest；集成测试要 TEST_DATABASE_URL
pnpm build               # next build（standalone）+ tsup 打 bin 入口；构建期不需要任何 env
pnpm db:generate         # 改 schema 后生成迁移（逐行读生成的 SQL 再提交）
pnpm db:migrate          # 本地迁移
pnpm dueremind           # 手动跑一次到期提醒
pnpm release:dry         # 预览下一个版本号（需对仓库有写权限的 GITHUB_TOKEN）
```

## License

MIT

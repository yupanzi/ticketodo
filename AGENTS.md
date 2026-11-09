# CLAUDE.md

规范与地图。系统是什么、怎么接入、怎么部署见 `README.md`；规则的理由在所指代码的注释里，改之前先读那里。
Next 16 的 API 以 `node_modules/next/dist/docs/` 为准（`AGENTS.md` 由 `next dev` 维护，别删）。

## 边界

ticket 与 todo 的记录、流转、通知与审计。登录只走 authentik（OIDC），外部依赖只有 Postgres。
以下刻意不存在，加之前先问：

- 附件、邮件 / 钉钉通知（通知只有站内；要加钉钉就在 `insertNotifications` 之后加一个投递通道）
- 团队 / 项目分组（只有全局标签）、停用用户、邮箱密码登录、对外 REST API
- 「未指派」的 ticket 与认领：ticket 建单必须指定负责人

## 地图

```
src/
├── domain/          纯逻辑、无 IO，前后端共用：priority · status（状态机）· policy（权限矩阵）
│                    · item-code · due（北京时间）· item-list（列表排序与到期筛选的词表）· diff
│                    · notify（收件人）· mention · identity · audit · schedule（日历月格、甘特区间、视角）
├── server/
│   ├── env.ts       环境变量（web / task 两个子集，惰性求值）
│   ├── log.ts       pino 根 logger · err 序列化与 SQL 参数脱敏
│   ├── resources.ts 审计动作串 · advisory lock 键 · 迁移表名 · cookie 前缀（不 import 任何东西）
│   ├── request.ts   x-request-id 的取舍
│   ├── startup.ts   web 进程启动时校验 env，不过就退出
│   ├── db/          createDb / getDb · libpq-url · schema/
│   ├── auth/        options（唯一的 better-auth 配置）· index（getAuth）· hooks（登录审计、种子管理员）
│   │                · session（RSC 取会话）· cli（只给 `auth generate` 对照 schema）
│   ├── audit/       auditInTx（随事务）· recordAuditSafe（吞错）
│   ├── services/    业务写读：item · comment · tag · user · notification · due-remind · audit-query
│   │                · visibility（canView 的 SQL 版）· item-code（取号）
│   ├── errors.ts    AppError（服务层不依赖 tRPC）
│   └── api/         trpc.ts（context · 中间件 · procedure）· context.ts（从请求拼）· root.ts · routers/
├── trpc/            query-client · react（客户端 Provider）· server（RSC 预取）
├── app/             sign-in · (app)/{看板, items, items/new, items/[code], calendar, gantt,
│                    notifications, admin/*}
│                    · api/{auth, trpc, healthz}
├── lib/             format（日期显示，一律北京时间）· item-filters（列表筛选 ⇄ 地址栏）· auth-client
├── components/      layout（PageHeader · Panel · EmptyState · Field · PropertyList）· chip · badges
│                    · date-picker（唯一的日期输入）· list-filters（分面筛选）· app-shell（侧栏）
│                    · item-cache（改单后的缓存规则）· page-skeleton（各路由 loading.tsx 的骨架）
│                    · item-calendar · item-gantt
│                    · 各页组件；ui/ 是 shadcn 生成后调过尺寸的（Biome 不查）
├── proxy.ts         定 x-request-id；页面无会话 cookie 去登录页
├── instrumentation.ts  启动校验 · onRequestError 走 pino
├── bin/             migrate · cron/dueremind（tsup 打成自包含 cjs）
└── test/            集成测试 helper（测试库、伪造会话的 caller）
drizzle/             迁移（0001 是手写的审计只追加触发器）
deploy/              values.example.yaml：通用 chart dockerhelm 的部署 values（web + 迁移 hook + CronJob）
```

## 不要无意改回的权衡

### 身份与认证（`server/auth/`）

- **身份只认 account 的 (providerId, sub)**，库里有唯一索引。⚠️ 别开 `accountLinking`、别把
  `emailVerified` 设成 true、别加 `trustedProviders`：authentik 不保证邮箱唯一与已验证。
- **`requireIdTokenVerification: true` 别关**：authentik 没选签名密钥时宁可登录不了，也不能不验签。
- discovery 拉取失败时 better-auth 把 provider 记为待发现，下次点登录自动重试：**别自己再加重试**。
- **种子管理员只在系统内无管理员时生效**，授予与审计同一事务，与授予 / 撤销共用 advisory lock。
- **OAuth token 一个都不落库**（`hooks.ts` 的 account before hook 置空）：本应用不调 authentik 的 API、
  不做 provider 登出。⚠️ 别以为 `encryptOAuthTokens` 够了：它只加密 access / refresh token，id_token
  照样明文落库。
- **不开 `session.cookieCache`**：开了撤销管理员要等缓存过期。
- **cookie 前缀 `ticketodo`**（`resources.ts`），`proxy.ts` 判断会话 cookie 读同一个值。
- ⚠️ **better-auth 的配置只在 `authOptions` 里**：`getAuth` 与 `cli.ts` 共用；模块顶层别建实例。
- hooks 里每个都自己吞错：抛出会让 OAuth 回调重定向到错误页，等于谁都登录不了。
- **升 better-auth 时 `@better-auth/core` 一起升到同一版本**（审计取 IP 复用它的 `getIP`），并用
  `pnpm dlx auth@<版本> generate --config src/server/auth/cli.ts --output /tmp/x.ts` 对照
  `schema/auth.ts` 补列（别直接覆盖：前缀、时区、枚举会丢）。

### 权限与可见性

- **`domain/policy.ts` 是唯一判据**：服务端判权、前端决定按钮都读它。前端判断只是体验，服务端必判。
- **看不见的一律 NOT_FOUND、不记审计**；看得见但不让做才 FORBIDDEN，并记 failure 审计。别把前者
  改成 FORBIDDEN：单号是顺序的，FORBIDDEN 等于告诉别人那张 todo 存在。
- ⚠️ **`services/visibility.ts` 与 `canView` 同一口径**，改一处改两处；`visibility.integration.test.ts`
  对照两者。
- **改派只有当前负责人与管理员**（提单人不行），todo 没有改派，已关闭的不改派。
- **定级与排期由接收方定**（`canPlan`：优先级、计划开始日期）：负责人与管理员；提单人能编辑别的字段，
  改不了这两项。服务端只在它们真变了时判（编辑表单会带上原值）。改派保留；todo 转给别人变回待定级。
- **ticket 必须有负责人**：库里 `assignee_id NOT NULL`，todo 由 CHECK 约束负责人 = 本人。

### 条目与单号

- **单号在建单事务里按 `(now() AT TIME ZONE 'Asia/Shanghai')::date` 取**，随事务回滚无空号。
  ⚠️ 别换成 sequence（不回滚，留空号），别在应用里算日期（跨零点与 `created_at` 对不上）。
- **`APP_TIMEZONE` 不做成可配**：单号日期、逾期、到期提醒、显示都用它。
- 每个写操作在事务里先 `SELECT … FOR UPDATE` 锁行，再判权、过状态机、算 diff。
- **要与审计 `at` 比较的时间戳取库的 `now()`**（`convertedAt`）：应用时钟比事务开始晚几毫秒，
  时间线截断会把「转换」那条自己截掉。
- 编辑带 `expectedUpdatedAt`，别人先改了就 CONFLICT；只改标签也要刷新 `updatedAt`。
- **列表分页是 keyset**（`listItems`）：排序键末位必须是 id；游标只传 id，排序值由服务端按 text 现查。
  ⚠️ 别把排序值塞进游标：`updated_at` 是微秒，经 JS Date 截成毫秒会漏行。游标行看不见就返回空页。
- date 列一律 `mode: "string"`：转成 Date 会被时区挪一天。
- **priority 为 null = 待定级**，只有 ticket 会有（todo 由 CHECK 保证）。排序用 `priorityRank`
  （coalesce 成文本）：⚠️ 别直接排可空列，keyset 的 `=` / `>` 遇 NULL 得 NULL，翻页漏行。

### 审计（`server/audit/`、`drizzle/0001_*`）

- **业务写用 `auditInTx`，写不进去整笔回滚**；只有登录类与越权被拒用 `recordAuditSafe`。
- **时间线就是审计**：`timeline` 只选白名单列（无 ip / ua / request_id）、只要 success、排除
  `comment.*`（改过 / 删了的评论正文不能借审计漏出去）。非管理员看不到 todo 转换之前的记录。
- **表只追加**（触发器）。回填类迁移在迁移里 `DISABLE TRIGGER`、改完再 `ENABLE`。测试删不掉
  审计：断言按 `(target_type, target_id)` 限定，别只按 id（条目、标签的 id 会撞）。
- ⚠️ **`actor_type` 是 PG 枚举，只加不删**。来件能控制的值（ip、OAuth 的 error 码）截断或白名单后
  才进审计。
- 动作串集中在 `resources.ts` 的 `AUDIT_ACTIONS`；变更 procedure 用 `.meta({ audit })` 声明自己的动作。

### 日志与错误

- **全进程一个 pino 根 logger**，Error 只放 `err` 键；别用 `console.*`。better-auth 的日志也接到它。
- **tRPC 500 只回「服务器内部错误 + 请求 id」**（`errorFormatter`）：原始 message 可能带 SQL。
- `next dev` 的请求日志关掉（`logging.incomingRequests: false`）：回调 URL 带 OAuth code；生产不逐请求
  打日志。⚠️ 别改成 `{ ignore: [正则] }`：Next 16.4 下开发页面会无限重载。
- `x-request-id` 只在信任代理时沿用来件的（`request.ts`），否则新生成。

### 通知

- 收件人规则在 `domain/notify.ts`：不通知操作者，一人一条；todo 只会通知到所有者。
- Markdown 渲染是 GFM（`remark-gfm`），不开 raw HTML。
- **@ 由服务端从正文解析**，只认库里存在且看得见这张单的人；编辑只通知新加的 @。
- 到期提醒去重靠**部分**唯一索引（`dedupe_key IS NOT NULL`），`ON CONFLICT` 要带同样的谓词。
  ⚠️ 别改成 `NULLS NOT DISTINCT`：会把评论、状态通知也去重掉。

### 界面（`app/globals.css`、`components/`）

- **字号与尺寸是 token**：`@theme` 把 `text-sm` 定为 15px 正文（xs 13 · base 16 · lg 17 · xl 20 ·
  2xl 24），控件高 36px（`h-9`）。别在组件里写 `text-[14px]` 这类魔法数，要调就调 token。
- **黑白，不加品牌色**：颜色只表达语义——红 = P0 / 逾期 / 危险，琥珀 = 紧急不重要 / 快到期，绿 =
  已解决。优先级「重要 = 实心、紧急 = 暖色」：P0 红实心 · P1 黑实心 · P2 琥珀浅底 · P3 描边（`badges.tsx`）。
- **`--canvas` 是页面底色，`--background` 是控件底色**：别把 `--background` 调灰，outline 按钮与输入框
  会跟着变灰。
- **一屏只有一个主按钮**（`variant="default"`），其余 outline / ghost；详情页状态操作由 `emphasisOf`
  挑主次。
- 页面一律 `PageHeader` + `Panel`（表格用 `Panel flush`，表头 `bg-muted/40`），小标签一律 `Chip`：
  别再手搓卡片与 badge。
- **日期输入只用 `date-picker.tsx`**（`DatePicker` / `DateRangePicker` / `AppCalendar`），别用
  `<input type="date">`；显示只走 `lib/format.ts`。值一律 `YYYY-MM-DD`，与 Date 的互转只在 date-picker 里。
- 表格筛选用 `list-filters.tsx` 的分面按钮，排序点表头；状态都进地址栏（`lib/item-filters.ts`）。
- ⚠️ **`ui/` 改过尺寸**（button · input · select · tabs · toggle · table · badge · command ·
  input-group · calendar）：`shadcn add` 提示覆盖已有文件时一律拒绝；要升级某个组件先 diff，再把尺寸改回 token。

### 交互快慢（用户到服务器一个往返就是几百毫秒，慢在往返次数与没反馈，不在服务器）

- **每个路由都有 `loading.tsx`**（`page-skeleton.tsx`）：没有它点链接毫无反馈，Next 也不预取动态页面。
  新页面一并加，骨架网格与真实页面一致。
- **页面数据在 RSC 里预取**（`HydrateClient`），别留给客户端挂载后再查（多一个串行往返）。预取的 key
  必须与客户端一致：列表入参走 `listQueryInput`，看板视角走 `DEFAULT_BOARD_SCOPE`。
- **改单的 mutation 回最新数据**（item 回详情、评论回列表），客户端用 `useItemCache` 换上；状态变更乐观
  更新（按钮集合用 `itemPermissions` 现算）。⚠️ 后台刷新别 await：按钮会多转一个往返。
- **筛选、翻月写地址栏用 `window.history.replaceState`**：⚠️ 别用 `router.replace`，服务端会把整页连同
  预取再渲染一遍，每改一次白查一次库。

### 构建期与运行时

- ⚠️ **构建期零 env**：模块顶层别读 env、别建 better-auth / pg 实例（`getServerEnv` / `getDb` /
  `getAuth` 都是惰性的）。`getSession` 里**先 `await headers()` 再 `getAuth()`**，反过来写预渲染时
  先读 env，镜像构建失败。CI 去掉 env 跑 `pnpm build` 守着它。
- **env 不合法时 web 进程退出**（`server/startup.ts` 的 `process.exit`）：别改成 throw，Next 只打一行
  日志、进程不退，Pod 一直不 ready。
- pg 连接池挂 `globalThis`（dev HMR 与各 bundle 共用）。
- `server-only` 只在 RSC 用到的模块里 import；tsup 与 vitest 都把它 alias 成空模块。

## 部署

- **chart 用通用的 dockerhelm**（`oci://ghcr.io/yupanzi/charts/dockerhelm`），本仓库只有
  `deploy/values.example.yaml`，各项的理由写在它的注释里。缺能力就给 dockerhelm 加通用字段，别在本仓库
  再长一个 chart、别为 ticketodo 开特例。dockerhelm 的版本钉在 `ci.yml` 与 README「部署」两处，一起改。
- **一个镜像三个入口**，command 必须显式给；占位 CMD 报错退出 64，别删也别换成能跑的默认值。
- bin 入口用 tsup 打成 **cjs、依赖全打进去**（standalone 只追踪 web 进程的依赖）；`pg-native`、
  `pg-cloudflare` external。改了入口要同时改 `tsup.config.ts`、Dockerfile 注释与部署 values 的 command。
- **`HOSTNAME=0.0.0.0` 在 Dockerfile 与部署 values 都要有**：k8s 会把它设成 Pod 名。
- **端口固定 3000**：Dockerfile 的 `PORT`、部署 values 的 `containerPort`。
- **Secret 不进 values**（预先建好 `ticketodo-app`）；凭证按 Pod 写 `secretKeyRef`：web 三个，迁移与
  cron 只有 `DATABASE_URL`，别换成 `envFrom` 整个 Secret。⚠️ 改了 Secret 必须 bump `pod.annotations` 的
  `ticketodo.io/secret-version`。
- **容器不设 `TZ`**，北京时间在代码里显式算。
- deploy 不进 CI。写完 Dockerfile 一定 `docker run` 一次三个入口。

## 版本与发布

- **版本号只由 semantic-release 出**（`ci.yml` 的 release job）：别手改 `package.json` 的
  版本号，别手打 tag。基线 tag `v0.0.0` 是唯一的例外（让首发是 0.1.0）。
- ⚠️ **0.x 期间别用 `!` / `BREAKING CHANGE:`**：semantic-release 会直接发 1.0.0。
- preset 是 `conventionalcommits`；`conventional-changelog-conventionalcommits` 钉在 9.x（理由见
  dingorg）。release job 别设 `GIT_AUTHOR_*`；`prepare` 的 `|| true` 别删。
- 镜像在 `.releaserc.json` 的 `publishCmd` 里推；部署哪个版本只看 `--set image.tag`。

## 写代码时

- **schema 改动**：改 `src/server/db/schema/*.ts` → `pnpm db:generate` → 逐行读生成的 SQL → 一并提交。
  ⚠️ pgEnum、索引、约束、函数名手写 `ticketodo_` 前缀（`createTable` 只管表名）。
- **新增环境变量**：`server/env.ts`（放进对的子集）+ `.env.example`；非敏感的进
  `deploy/values.example.yaml` 的 `container.env`，敏感的进 Secret，并给用到它的每个 Pod 写 `secretKeyRef`。
- **新增变更**：服务层一个事务里「锁行 → 判权 → 改 → `auditInTx` → 通知」，procedure 加
  `.meta({ audit })`，权限规则先写进 `domain/policy.ts` 并补矩阵测试。
- **列表新增筛选维度**：`listItems` + router 的 zod → `lib/item-filters.ts` 的 parse / toSearch（补
  往返测试）→ `items-table.tsx` 工具栏。
- 类型 import 一律 `import type`（`verbatimModuleSyntax`）；相对 import 不写扩展名。
- `pnpm-workspace.yaml` 归 pnpm 管（`allowBuilds` 删不得）：Biome 不查。
- 升 pnpm 用 `corepack use pnpm@<版本>`。新包刚发布时 pnpm 12 的 `minimumReleaseAge` 会拦，显式装
  才会写进 `minimumReleaseAgeExclude`。

## 验证

```bash
pnpm check && pnpm typecheck
pnpm vitest run --reporter=verbose   # 确认集成测试是 passed 而非 skipped（要 TEST_DATABASE_URL）
mv .env /tmp/x && pnpm build; mv /tmp/x .env   # 构建期零 env
```

- **哨兵**：权限矩阵 `domain/policy.test.ts` · 状态机 `domain/status.test.ts` · 可见性两版一致
  `services/visibility.integration.test.ts` · API 全流程 `server/api/item.integration.test.ts`
  （NOT_FOUND 不泄露、改派权限、并发取号、时间线白名单、审计只追加）· 登录 hook 与种子管理员
  `server/auth/hooks.integration.test.ts` · 到期提醒 `services/due-remind.integration.test.ts`
  · 脱敏 `server/log.test.ts` · sslmode `server/db/index.test.ts`。
- **端到端**：本地用 mock OIDC 或真实 authentik 走「登录 → 建 ticket（选负责人）→ 对方收到通知 → 负责人定级 →
  开始处理 → 评论 @ → 标记已解决 → 提单人确认关闭 → 拖象限 → 审计查到 diff」；日志里 grep 不到
  `code=` 与 token。
- **镜像**：无入口 exit 64；`migrate.cjs` 迁移成功；`server.js` 缺 env exit 1、齐了 `/api/healthz`
  200；`dueremind.cjs` exit 0。
- **界面**：Chrome DevTools 看 1440 与 390 两个宽度。dev 页面不跟着源码变（改过 `ui/` 或开着 dev 跑了
  `pnpm build`）：停 dev、删 `.next/dev` 再起。
- **部署 values**：跑 `ci.yml` check job 里那条 `helm template`，看 web 拿三个凭证、迁移与 cron 只拿
  `DATABASE_URL`，`BETTER_AUTH_URL` 由 `ingress.hostname` 派生。

## 注释纪律

写 WHY 不写 WHAT，一条理由一两行。不写历史与过程；要防回退就写成规则：「别加回 X：理由」。
同一条理由只写一处，别处引用。中英按上下文混写。

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

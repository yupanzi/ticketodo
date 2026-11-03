# syntax=docker/dockerfile:1
#
# 单镜像、多入口，由容器的 command 决定跑哪个：
#
#   docker build -t <repo>/ticketodo:<tag> .
#   # 拉不到 Docker Hub 时换基础镜像源：--build-arg NODE_IMAGE=public.ecr.aws/docker/library/node:24-alpine
#
#   常驻：  node server.js
#   迁移：  node dist/bin/migrate.cjs
#   cron：  node dist/bin/cron/dueremind.cjs

ARG NODE_IMAGE=node:24-alpine

# ---------- 构建 ----------
FROM ${NODE_IMAGE} AS build
# Next 官方 Dockerfile 的做法：部分原生依赖在 musl 上要它
RUN apk add --no-cache libc6-compat && corepack enable
WORKDIR /app
# pnpm-workspace.yaml 必须拷：pnpm 的配置（allowBuilds）在里面，缺了 install 失败
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
	pnpm install --frozen-lockfile
COPY . .
# 构建期不需要任何 env：env 在 instrumentation.ts 里运行时校验
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

# ---------- 运行时 ----------
# standalone 自带追踪出来的 node_modules，bin 入口是自包含 bundle：运行时不需要 pnpm 与完整依赖
FROM ${NODE_IMAGE} AS runner
WORKDIR /app
# 别删 NODE_ENV：BETTER_AUTH_URL 只在非 production 时有默认值，镜像里缺了要启动失败。
# HOSTNAME 必须显式给：k8s 把它设成 Pod 名，server.js 就只听 Pod IP，127.0.0.1 的探活与 port-forward 都连不上
ENV NODE_ENV=production \
	NEXT_TELEMETRY_DISABLED=1 \
	HOSTNAME=0.0.0.0 \
	PORT=3000
# 不设 TZ，一律 UTC。北京时间的计算在代码里显式做（Asia/Shanghai）
RUN addgroup -S app && adduser -S app -G app

COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
COPY --from=build --chown=app:app /app/dist ./dist
# 迁移入口按 `./drizzle` 相对工作目录找 SQL
COPY --chown=app:app drizzle ./drizzle

USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
	CMD wget -qO- http://127.0.0.1:3000/api/healthz || exit 1

# ⚠️ 占位 CMD，报错并 exit 64：忘记指定入口要明确失败。也不能不写——会继承 node 的
# CMD，非 TTY 下静默 exit 0，Job 被当成「成功完成」
CMD ["node", "-e", "console.error('[ticketodo] 必须显式指定入口：node server.js | dist/bin/migrate.cjs | dist/bin/cron/dueremind.cjs'); process.exit(64)"]

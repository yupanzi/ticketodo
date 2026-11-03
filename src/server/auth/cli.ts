import { betterAuth } from "better-auth";

import { createDb } from "~/server/db";
import { parseEnv, serverEnvSchema } from "~/server/env";

import { authOptions } from "./options";

/**
 * 只给 better-auth CLI 对照 schema 用（不进镜像、不被应用 import）：
 *   pnpm dlx auth@<better-auth 版本> generate --config src/server/auth/cli.ts --output /tmp/auth-schema.ts
 * 生成结果与 `~/server/db/schema/auth.ts` 对照，缺列手工补；别直接覆盖（前缀、时区、枚举会丢）。
 * 占位 env 只为让构造器跑起来，不连库。
 */
export const auth = betterAuth(
	authOptions(
		parseEnv(serverEnvSchema, {
			DATABASE_URL: "postgresql://cli@localhost:5432/cli",
			BETTER_AUTH_SECRET: "cli-placeholder-secret-0123456789abcdef",
			BETTER_AUTH_URL: "http://localhost:3000",
			AUTHENTIK_DISCOVERY_URL:
				"https://authentik.invalid/application/o/ticketodo/.well-known/openid-configuration",
			AUTHENTIK_CLIENT_ID: "cli",
			AUTHENTIK_CLIENT_SECRET: "cli",
		}),
		createDb("postgresql://cli@localhost:5432/cli"),
	),
);

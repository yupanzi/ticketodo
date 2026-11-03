import type { BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { isAPIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { genericOAuth } from "better-auth/plugins";

import { profileEmail, profileImage, profileName } from "~/domain/identity";
import type { Database } from "~/server/db";
import { account, session, user, verification } from "~/server/db/schema";
import { type ServerEnv, trustsProxyHeaders } from "~/server/env";
import { logger } from "~/server/log";
import { AUTH_COOKIE_PREFIX } from "~/server/resources";

import { authHooks } from "./hooks";

/** 回调地址 `/api/auth/callback/<它>`，authentik 里登记的 redirect URI 跟着它走 */
export const AUTH_PROVIDER_ID = "authentik";

/**
 * 审计取 IP 与 better-auth 记会话 IP 必须同一套规则（`@better-auth/core` 的 `getIP` 读的就是它）。
 * 不信任代理时宁可不记，也不记来件能伪造的值。
 */
export function ipOptions(env: ServerEnv): Pick<BetterAuthOptions, "advanced"> {
	return {
		advanced: {
			ipAddress: trustsProxyHeaders(env)
				? { ipAddressHeaders: ["x-forwarded-for"] }
				: { disableIpTracking: true },
		},
	};
}

/**
 * 唯一的 better-auth 配置构造器：web 进程（`getAuth`）与 schema 生成（`cli.ts`）共用。
 * 不在模块顶层建实例：`next build` 会 import 路由模块，那时没有 env。
 */
export function authOptions(env: ServerEnv, db: Database) {
	const ip = ipOptions(env);
	return {
		appName: "ticketodo",
		baseURL: env.BETTER_AUTH_URL,
		secret: env.BETTER_AUTH_SECRET,
		database: drizzleAdapter(db, {
			provider: "pg",
			schema: { user, session, account, verification },
		}),
		// 只走 authentik
		emailAndPassword: { enabled: false },
		user: {
			additionalFields: {
				// input: false：用户自己改不了，只经管理后台与种子管理员
				role: {
					type: ["member", "admin"],
					required: false,
					defaultValue: "member",
					input: false,
				},
			},
		},
		session: {
			// 别开：开了之后撤销管理员要等缓存过期才生效
			cookieCache: { enabled: false },
		},
		account: {
			encryptOAuthTokens: true,
			// ⚠️ 别开：authentik 不保证邮箱唯一与已验证，按邮箱合并账号等于让别人接管
			accountLinking: { enabled: false },
		},
		advanced: {
			...ip.advanced,
			cookiePrefix: AUTH_COOKIE_PREFIX,
		},
		telemetry: { enabled: false },
		logger: {
			level: logger.isLevelEnabled("debug") ? "debug" : "info",
			// 只转 message 与 Error（走 err 序列化器脱敏）；其余参数可能带用户与 token，不转
			log: (level, message, ...args) => {
				const err = args.find((a) => a instanceof Error);
				logger[level]({ src: "better-auth", ...(err ? { err } : {}) }, message);
			},
		},
		onAPIError: {
			// 回调失败带 ?error= 回到登录页显示
			errorURL: "/sign-in",
			onError: (err) => {
				if (isAPIError(err)) return;
				logger.error({ err, src: "better-auth" }, "认证接口内部错误");
			},
		},
		...authHooks(db, env, ip),
		plugins: [
			genericOAuth({
				config: [
					{
						providerId: AUTH_PROVIDER_ID,
						name: "企业账号",
						discoveryUrl: env.AUTHENTIK_DISCOVERY_URL,
						clientId: env.AUTHENTIK_CLIENT_ID,
						clientSecret: env.AUTHENTIK_CLIENT_SECRET,
						scopes: ["openid", "email", "profile"],
						// 身份取自 id_token 的 sub：discovery 没给 JWKS（authentik 没选签名密钥）就不注册，
						// 而不是悄悄退化成不验签
						requireIdTokenVerification: true,
						// 每次登录同步姓名、邮箱、头像
						overrideUserInfo: true,
						// 登出只退本应用，不连带打掉整个 SSO 会话
						disableProviderLogout: true,
						mapProfileToUser: (profile) => ({
							name: profileName(profile),
							email: profileEmail(profile),
							image: profileImage(profile),
							emailVerified: false,
						}),
					},
				],
			}),
			// 必须放最后
			nextCookies(),
		],
	} satisfies BetterAuthOptions;
}

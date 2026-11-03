import { z } from "zod";

import { LOG_LEVELS } from "~/server/log";

const database = {
	DATABASE_URL: z.url(),
};

// `~/server/log` 在 import 时就读它，这里只负责校验：填错是启动失败，而不是静默回落 info
const logging = {
	LOG_LEVEL: z.enum(LOG_LEVELS).default("info"),
};

const commaList = z
	.string()
	.default("")
	.transform((raw) =>
		raw
			.split(",")
			.map((v) => v.trim().toLowerCase())
			.filter(Boolean),
	);

const auth = {
	/** 会话 cookie 签名与 OAuth token 加密的密钥。换了它全员掉线 */
	BETTER_AUTH_SECRET: z
		.string()
		.min(32, "至少 32 个字符：openssl rand -base64 32"),

	/**
	 * 对外可达的 origin，回调地址由它拼出（`/api/auth/callback/authentik`）。只收 origin，且必须是
	 * 规范写法：authentik 逐字比对 redirect URI。
	 */
	BETTER_AUTH_URL: z.string().superRefine((raw, ctx) => {
		let url: URL | undefined;
		try {
			url = new URL(raw);
		} catch {}
		const ok =
			url !== undefined &&
			(url.protocol === "https:" || url.protocol === "http:") &&
			url.origin === raw;
		if (!ok)
			ctx.addIssue({
				code: "custom",
				message:
					"只填 origin，如 https://ticketodo.example.com：不带路径与结尾 /、域名小写、不写默认端口",
			});
	}),

	AUTHENTIK_DISCOVERY_URL: z
		.url()
		.refine(
			(v) => v.endsWith("/.well-known/openid-configuration"),
			"填完整的 discovery 地址：https://<authentik>/application/o/<slug>/.well-known/openid-configuration",
		),
	AUTHENTIK_CLIENT_ID: z.string().min(1),
	AUTHENTIK_CLIENT_SECRET: z.string().min(1),

	/** 系统里还没有管理员时，这些邮箱的人登录即成为管理员。逗号分隔，比较时忽略大小写 */
	BOOTSTRAP_ADMIN_EMAILS: commaList.pipe(
		z.array(z.email("只写邮箱；多个用逗号分隔")),
	),
};

/** migrate / due-remind：只要数据库，不拿任何认证凭证 */
export const taskEnvSchema = z.object({ ...logging, ...database });
export type TaskEnv = z.infer<typeof taskEnvSchema>;

/** 常驻 web 进程 */
export const serverEnvSchema = z.object({ ...logging, ...database, ...auth });
export type ServerEnv = z.infer<typeof serverEnvSchema>;

/** 本机开发时外部地址就是 `next dev` 的监听地址 */
const DEV_ORIGIN = "http://localhost:3000";

/**
 * 是否信任 `x-forwarded-*`（来源 IP、请求 id），从 `BETTER_AUTH_URL` 推、不单独配：本服务只说
 * http，对外是 https 就说明前面必有终结 TLS 的代理；对外是 http 就是直连，信任的话来件能伪造审计
 * 里的来源 IP。better-auth 的 IP 记录与审计取 IP 必须都读它。
 * 前提：代理覆盖（而非透传）`x-forwarded-*`，且不可绕过代理直连。
 */
export function trustsProxyHeaders(
	env: Pick<ServerEnv, "BETTER_AUTH_URL">,
): boolean {
	return new URL(env.BETTER_AUTH_URL).protocol === "https:";
}

/** `.env` 里留空的变量当作没设，报「缺失」而不是「不合法」 */
function emptyStringAsUndefined(source: unknown): unknown {
	if (typeof source !== "object" || source === null) return source;
	return Object.fromEntries(
		Object.entries(source as Record<string, unknown>).map(([k, v]) => [
			k,
			v === "" ? undefined : v,
		]),
	);
}

/** ⚠️ 只带路径与规则，永远不带值：会进启动日志，而值里有 secret */
export function formatIssues(error: z.ZodError): string {
	return error.issues
		.map((i) => `  ${i.path.join(".") || "(root)"}: ${i.message}`)
		.join("\n");
}

export function parseEnv<T extends z.ZodType>(
	schema: T,
	source: unknown = process.env,
): z.infer<T> {
	const result = schema.safeParse(emptyStringAsUndefined(source));
	if (!result.success) {
		throw new Error(`环境变量校验失败:\n${formatIssues(result.error)}`);
	}
	return result.data;
}

// 不用 NodeJS.ProcessEnv：Next 把其中的 NODE_ENV 声明成必填
type EnvSource = Record<string, string | undefined>;

/**
 * 非 production 时 `BETTER_AUTH_URL` 可以不写。镜像里 `NODE_ENV=production`（Dockerfile）：缺了照样
 * 启动失败，而不是带着 localhost 的回调地址跑起来、全员登录失败。
 */
export function withDevDefaults(source: EnvSource): EnvSource {
	if (source.NODE_ENV === "production" || source.BETTER_AUTH_URL) return source;
	return { ...source, BETTER_AUTH_URL: DEV_ORIGIN };
}

// 惰性求值：`next build` 会 import 每个路由模块，模块顶层读 env 会让无 env 的镜像构建失败
let serverEnv: ServerEnv | undefined;
let taskEnv: TaskEnv | undefined;

export function getServerEnv(): ServerEnv {
	serverEnv ??= parseEnv(serverEnvSchema, withDevDefaults(process.env));
	return serverEnv;
}

export function getTaskEnv(): TaskEnv {
	taskEnv ??= parseEnv(taskEnvSchema);
	return taskEnv;
}

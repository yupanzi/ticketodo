import { describe, expect, it } from "vitest";

import {
	parseEnv,
	serverEnvSchema,
	taskEnvSchema,
	trustsProxyHeaders,
	withDevDefaults,
} from "./env";

const CLIENT_SECRET = "authentik-client-secret-0123456789abcdef";

const TASK_ENV = {
	DATABASE_URL: "postgresql://u:p@localhost:5432/db",
};

const SERVER_ENV = {
	...TASK_ENV,
	BETTER_AUTH_SECRET: "s".repeat(32),
	BETTER_AUTH_URL: "http://localhost:3000",
	AUTHENTIK_DISCOVERY_URL:
		"https://sso.example.com/application/o/ticketodo/.well-known/openid-configuration",
	AUTHENTIK_CLIENT_ID: "ticketodo",
	AUTHENTIK_CLIENT_SECRET: CLIENT_SECRET,
};

describe("serverEnvSchema", () => {
	it("合法配置能解析，BOOTSTRAP_ADMIN_EMAILS 缺省为空", () => {
		const parsed = parseEnv(serverEnvSchema, SERVER_ENV);
		expect(parsed.BOOTSTRAP_ADMIN_EMAILS).toEqual([]);
		expect(parsed.LOG_LEVEL).toBe("info");
	});

	it("报错只带变量名与规则，不回显值", () => {
		let message = "";
		try {
			parseEnv(serverEnvSchema, {
				...SERVER_ENV,
				BETTER_AUTH_SECRET: CLIENT_SECRET.slice(0, 10),
			});
		} catch (err) {
			message = (err as Error).message;
		}
		expect(message).toContain("BETTER_AUTH_SECRET");
		expect(message).not.toContain(CLIENT_SECRET.slice(0, 10));
	});

	it("discovery 地址必须是完整的 .well-known 地址", () => {
		expect(() =>
			parseEnv(serverEnvSchema, {
				...SERVER_ENV,
				AUTHENTIK_DISCOVERY_URL:
					"https://sso.example.com/application/o/ticketodo/",
			}),
		).toThrow(/AUTHENTIK_DISCOVERY_URL/);
	});

	it("留空等于没设：报缺失", () => {
		expect(() =>
			parseEnv(serverEnvSchema, { ...SERVER_ENV, AUTHENTIK_CLIENT_ID: "" }),
		).toThrow(/AUTHENTIK_CLIENT_ID/);
	});
});

describe("BOOTSTRAP_ADMIN_EMAILS", () => {
	const emails = (raw: string) =>
		parseEnv(serverEnvSchema, { ...SERVER_ENV, BOOTSTRAP_ADMIN_EMAILS: raw })
			.BOOTSTRAP_ADMIN_EMAILS;

	it("逗号分隔、去空白、转小写", () => {
		expect(emails(" Alice@Corp.com , bob@corp.com,")).toEqual([
			"alice@corp.com",
			"bob@corp.com",
		]);
	});

	it("写成别的是启动失败，而不是静默没有种子管理员", () => {
		expect(() => emails("alice")).toThrow(/BOOTSTRAP_ADMIN_EMAILS/);
	});
});

describe("BETTER_AUTH_URL", () => {
	const parse = (BETTER_AUTH_URL: string) =>
		serverEnvSchema.safeParse({ ...SERVER_ENV, BETTER_AUTH_URL });

	it.each(["https://ticketodo.example.com", "http://localhost:3000"])(
		"%s：合法",
		(origin) => {
			expect(parse(origin).success).toBe(true);
		},
	);

	// authentik 逐字比对 redirect URI：同一个地址只认一种写法
	it.each([
		["带路径", "https://ticketodo.example.com/app"],
		["结尾带 /", "https://ticketodo.example.com/"],
		["写了默认端口", "https://ticketodo.example.com:443"],
		["域名大写", "https://Ticketodo.example.com"],
		["不是 URL", "ticketodo.example.com"],
	])("%s：拒绝", (_, origin) => {
		expect(parse(origin).success).toBe(false);
	});
});

describe("withDevDefaults", () => {
	const DEV = "http://localhost:3000";

	it("非 production 没写：取本机地址", () => {
		expect(withDevDefaults({}).BETTER_AUTH_URL).toBe(DEV);
		expect(withDevDefaults({ BETTER_AUTH_URL: "" }).BETTER_AUTH_URL).toBe(DEV);
	});

	// 镜像里 NODE_ENV=production：缺了要启动失败，不能带着 localhost 的回调地址跑起来
	it("production 没写：不补，启动校验报缺失", () => {
		const { BETTER_AUTH_URL: _, ...rest } = SERVER_ENV;
		const source = withDevDefaults({ ...rest, NODE_ENV: "production" });
		expect(source.BETTER_AUTH_URL).toBeUndefined();
		expect(() => parseEnv(serverEnvSchema, source)).toThrow(/BETTER_AUTH_URL/);
	});
});

describe("taskEnvSchema", () => {
	it("只要库，不要任何认证凭证", () => {
		expect(parseEnv(taskEnvSchema, TASK_ENV).DATABASE_URL).toBe(
			TASK_ENV.DATABASE_URL,
		);
	});
});

describe("trustsProxyHeaders", () => {
	it("https origin：前面必有终结 TLS 的代理 → 信任", () => {
		expect(
			trustsProxyHeaders({ BETTER_AUTH_URL: "https://ticketodo.example.com" }),
		).toBe(true);
	});

	it("http origin：直连 → 不信任，来件伪造不了审计 IP", () => {
		expect(
			trustsProxyHeaders({ BETTER_AUTH_URL: "http://localhost:3000" }),
		).toBe(false);
	});
});

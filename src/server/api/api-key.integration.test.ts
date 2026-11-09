import { createHash } from "node:crypto";

import { ORPCError } from "@orpc/server";
import { eq, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { API_KEY_PATTERN } from "~/domain/api-key";
import { apiKeys, auditLogs } from "~/server/db/schema";
import { getServerEnv } from "~/server/env";
import { actor } from "~/test/api";
import { hasTestDb, testDb } from "~/test/db";

import { handleApiRequest } from "./http";
import { API_PREFIX } from "./openapi";

// HTTP 入口要读 web 的 env；CI 只配了数据库，其余给测试值（getServerEnv 是惰性的）
process.env.BETTER_AUTH_SECRET ||= "test-secret-test-secret-test-secret!";
process.env.AUTHENTIK_DISCOVERY_URL ||=
	"https://authentik.invalid/application/o/t/.well-known/openid-configuration";
process.env.AUTHENTIK_CLIENT_ID ||= "test";
process.env.AUTHENTIK_CLIENT_SECRET ||= "test";

type Actor = Awaited<ReturnType<typeof actor>>;

async function codeOf<T>(p: Promise<T>): Promise<string | undefined> {
	try {
		await p;
		return undefined;
	} catch (err) {
		return err instanceof ORPCError ? err.code : "NOT_ORPC";
	}
}

/** 像 AI 那样调：真的 HTTP 请求体与 Bearer，经 `/api/v1` 的唯一入口 */
async function call(
	token: string,
	method: string,
	path: string,
	body?: unknown,
	headers: Record<string, string> = {},
) {
	const res = await handleApiRequest(
		new Request(`http://localhost${API_PREFIX}${path}`, {
			method,
			headers: {
				authorization: `Bearer ${token}`,
				...(body === undefined ? {} : { "content-type": "application/json" }),
				...headers,
			},
			body: body === undefined ? undefined : JSON.stringify(body),
		}),
	);
	const text = await res.text();
	// biome-ignore lint/suspicious/noExplicitAny: 测试里按需取字段
	return { status: res.status, body: (text ? JSON.parse(text) : null) as any };
}

async function issue(
	who: Actor,
	level: "read" | "write" | "admin",
	ttlDays: number | null = null,
) {
	return who.api.apiKey.create({ name: `${level} key`, level, ttlDays });
}

describe.skipIf(!hasTestDb)("API key", () => {
	let member: Actor;
	let other: Actor;
	let admin: Actor;

	beforeAll(async () => {
		member = await actor({ name: "签 key 的人" });
		other = await actor({ name: "同事" });
		admin = await actor({ name: "管理员", role: "admin" });
	});

	it("签发：明文只回这一次，库里只有哈希", async () => {
		const { key, token } = await issue(member, "write");
		expect(token).toMatch(API_KEY_PATTERN);
		expect(token.startsWith(key.start)).toBe(true);
		const [row] = await testDb()
			.select()
			.from(apiKeys)
			.where(eq(apiKeys.id, key.id));
		expect(row?.hash).toBe(createHash("sha256").update(token).digest("hex"));
		expect(JSON.stringify(row)).not.toContain(token);
		const listed = await member.api.apiKey.list();
		expect(listed.find((k) => k.id === key.id)).not.toHaveProperty("token");
	});

	it("只读 key：GET 放行（query 里的数组、数字照常解析），写被拒", async () => {
		const { token } = await issue(member, "read");
		const list = await call(
			token,
			"GET",
			"/items?statuses[]=open&statuses[]=in_progress&limit=5",
		);
		expect(list.status).toBe(200);
		expect(list.body.items.length).toBeLessThanOrEqual(5);
		const created = await call(token, "POST", "/items", {
			type: "todo",
			title: "x",
			priority: "P3",
		});
		expect(created.status).toBe(403);
		expect(created.body.message).toContain("只读");
	});

	it("读写 key 以签发人身份建单、评论；审计、时间线、评论都标出 key", async () => {
		const { key, token } = await issue(member, "write");
		const created = await call(token, "POST", "/items", {
			type: "ticket",
			title: "AI 建的单",
			assigneeId: other.user.id,
		});
		expect(created.status).toBe(201);
		const { code, id, reporter } = created.body.item;
		expect(reporter.id).toBe(member.user.id);

		const [audit] = await testDb()
			.select()
			.from(auditLogs)
			.where(
				sql`${auditLogs.targetType} = 'item' AND ${auditLogs.targetId} = ${String(id)}`,
			);
		expect(audit?.apiKeyId).toBe(key.id);
		expect(audit?.apiKeyName).toBe(key.name);

		const timeline = await call(token, "GET", `/items/${code}/timeline`);
		expect(timeline.body[0].apiKeyName).toBe(key.name);

		const comments = await call(token, "POST", `/items/${code}/comments`, {
			body: "我来跟进",
		});
		expect(comments.status).toBe(201);
		expect(comments.body.at(-1).apiKeyName).toBe(key.name);

		// 同事在浏览器里看到的也是这样
		const seen = await other.api.comment.list({ code });
		expect(seen.at(-1)?.apiKeyName).toBe(key.name);
	});

	it("管理员签的读写 key 按成员判权：管理接口 403、别人的 todo 404", async () => {
		const { token } = await issue(admin, "write");
		expect((await call(token, "GET", "/admin/users")).status).toBe(403);
		const {
			item: { code },
		} = await other.api.item.create({
			type: "todo",
			title: "私事",
			priority: "P2",
		});
		expect((await admin.api.item.get({ code })).item.title).toBe("私事");
		expect((await call(token, "GET", `/items/${code}`)).status).toBe(404);
	});

	it("管理员级 key：只有管理员能签；签发人被撤销管理员后直接 403", async () => {
		expect(await codeOf(issue(member, "admin"))).toBe("FORBIDDEN");
		const boss = await actor({ name: "临时管理员", role: "admin" });
		const { token } = await issue(boss, "admin");
		expect((await call(token, "GET", "/admin/users")).status).toBe(200);
		const me = await call(token, "GET", "/users/me");
		expect(me.body.role).toBe("admin");
		expect(me.body.apiKey.level).toBe("admin");

		await testDb().execute(
			sql`UPDATE ticketodo_user SET role = 'member' WHERE id = ${boss.user.id}`,
		);
		const after = await call(token, "GET", "/users/me");
		expect(after.status).toBe(403);
		expect(after.body.message).toContain("已不是管理员");
	});

	it("key 管理只认浏览器：key 调不了 /api-keys", async () => {
		const { token } = await issue(member, "write");
		expect((await call(token, "GET", "/api-keys")).status).toBe(403);
		expect(
			(
				await call(token, "POST", "/api-keys", {
					name: "x",
					level: "write",
					ttlDays: null,
				})
			).status,
		).toBe(403);
	});

	it("重新签发：id 不变、旧密钥立即失效；撤销、过期都失效", async () => {
		const first = await issue(member, "read", 30);
		const rotated = await member.api.apiKey.rotate({ id: first.key.id });
		expect(rotated.key.id).toBe(first.key.id);
		expect(rotated.token).not.toBe(first.token);
		expect((await call(first.token, "GET", "/users/me")).status).toBe(401);
		expect((await call(rotated.token, "GET", "/users/me")).status).toBe(200);
		// 只有本人能重新签发，管理员也不行
		expect(await codeOf(admin.api.apiKey.rotate({ id: first.key.id }))).toBe(
			"FORBIDDEN",
		);

		await admin.api.admin.revokeApiKey({ id: first.key.id });
		expect((await call(rotated.token, "GET", "/users/me")).status).toBe(401);
		expect(
			(await member.api.apiKey.list()).some((k) => k.id === first.key.id),
		).toBe(false);

		const expiring = await issue(member, "read", 1);
		await testDb()
			.update(apiKeys)
			.set({ expiresAt: sql`now() - interval '1 second'` })
			.where(eq(apiKeys.id, expiring.key.id));
		const res = await call(expiring.token, "GET", "/users/me");
		expect(res.status).toBe(401);
		expect(res.body.message).toContain("API key");
	});

	it("别人的 key 看不见也撤不掉", async () => {
		const { key } = await issue(member, "read");
		expect(await codeOf(other.api.apiKey.revoke({ id: key.id }))).toBe(
			"NOT_FOUND",
		);
	});

	it("无效 key 401；未知接口 404；OpenAPI 文档要认证", async () => {
		expect((await call("tk_nope", "GET", "/items")).status).toBe(401);
		const { token } = await issue(member, "read");
		const missing = await call(token, "GET", "/nope");
		expect(missing.status).toBe(404);
		const spec = await call(token, "GET", "/openapi.json");
		expect(spec.status).toBe(200);
		expect(spec.body.paths["/items/{code}/transition"]).toBeDefined();
		expect(spec.body.servers[0].url).toBe(
			`${getServerEnv().BETTER_AUTH_URL}${API_PREFIX}`,
		);
		const anonymous = await handleApiRequest(
			new Request(`http://localhost${API_PREFIX}/openapi.json`),
		);
		expect(anonymous.status).toBe(401);
	});
});

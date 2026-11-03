import { betterAuth } from "better-auth";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { user } from "~/server/db/schema";
import { parseEnv, serverEnvSchema } from "~/server/env";
import { AUDIT_ACTIONS } from "~/server/resources";
import { auditsFor, hasTestDb, testDb, uniq } from "~/test/db";

import { AUTH_PROVIDER_ID, authOptions } from "./options";

/** 真实的 better-auth 实例 + 测试库；OIDC 往返绕过，直接用 internalAdapter 建用户与会话（照样触发 hook） */
async function authWith(bootstrapEmails: string[] = []) {
	const env = parseEnv(serverEnvSchema, {
		DATABASE_URL: process.env.DATABASE_URL,
		BETTER_AUTH_SECRET: "test-secret-0123456789abcdefghijklmnop",
		BETTER_AUTH_URL: "http://localhost:3000",
		AUTHENTIK_DISCOVERY_URL:
			"https://authentik.invalid/application/o/ticketodo/.well-known/openid-configuration",
		AUTHENTIK_CLIENT_ID: "test",
		AUTHENTIK_CLIENT_SECRET: "test",
		BOOTSTRAP_ADMIN_EMAILS: bootstrapEmails.join(","),
	});
	const auth = betterAuth(authOptions(env, testDb()));
	return (await auth.$context).internalAdapter;
}

type Adapter = Awaited<ReturnType<typeof authWith>>;

/** 与真实登录同一条建档路径：来源是 authentik 的 OAuth */
function signUp(adapter: Adapter, u: { name: string; email: string }) {
	return adapter.createUser(u, {
		method: "oauth",
		oauth: { providerId: AUTH_PROVIDER_ID },
	});
}

async function roleOf(id: string) {
	const [row] = await testDb()
		.select({ role: user.role })
		.from(user)
		.where(eq(user.id, id));
	return row?.role;
}

describe.skipIf(!hasTestDb)("登录类 hook", () => {
	it("首次登录建档与登录都进审计，actor 是本人", async () => {
		const adapter = await authWith();
		const created = await signUp(adapter, {
			name: "张三",
			email: `${uniq("zs")}@corp.test`,
		});
		await adapter.createSession(created.id);

		const rows = await auditsFor("user", created.id);
		expect(rows.map((r) => r.action)).toEqual([
			AUDIT_ACTIONS.userCreate,
			AUDIT_ACTIONS.authSignIn,
		]);
		for (const r of rows) {
			expect(r.actorType).toBe("user");
			expect(r.actorId).toBe(created.id);
			expect(r.actorName).toBe("张三");
		}
	});

	it("种子管理员：系统里没有管理员时生效一次，授予与审计同在", async () => {
		// 测试库专用：先把「没有管理员」这个前提造出来
		await testDb()
			.update(user)
			.set({ role: "member" })
			.where(eq(user.role, "admin"));
		const first = `${uniq("boot1")}@corp.test`;
		const second = `${uniq("boot2")}@corp.test`;
		const adapter = await authWith([first, second.toUpperCase()]);

		const a = await signUp(adapter, { name: "甲", email: first });
		await adapter.createSession(a.id);
		expect(await roleOf(a.id)).toBe("admin");
		const [bootstrap] = await auditsFor("user", a.id, [
			AUDIT_ACTIONS.adminBootstrap,
		]);
		expect(bootstrap?.actorType).toBe("system");
		expect(bootstrap?.details?.changes?.role).toEqual({
			from: "member",
			to: "admin",
		});

		// 名单里的第二个人：已经有管理员了，不再生效
		const b = await signUp(adapter, { name: "乙", email: second });
		await adapter.createSession(b.id);
		expect(await roleOf(b.id)).toBe("member");
		expect(
			await auditsFor("user", b.id, [AUDIT_ACTIONS.adminBootstrap]),
		).toEqual([]);

		// 同一人再次登录：不重复记
		await adapter.createSession(a.id);
		expect(
			await auditsFor("user", a.id, [AUDIT_ACTIONS.adminBootstrap]),
		).toHaveLength(1);
	});

	it("不在名单里的人登录不会被提升", async () => {
		await testDb()
			.update(user)
			.set({ role: "member" })
			.where(eq(user.role, "admin"));
		const adapter = await authWith([`${uniq("other")}@corp.test`]);
		const c = await signUp(adapter, {
			name: "丙",
			email: `${uniq("c")}@corp.test`,
		});
		await adapter.createSession(c.id);
		expect(await roleOf(c.id)).toBe("member");
	});
});

import { createCaller } from "~/server/api/root";
import { createContext } from "~/server/api/trpc";
import type { AuthSession } from "~/server/auth";

import { createUser, testDb, uniq } from "./db";

type TestUser = Awaited<ReturnType<typeof createUser>>;

/** 以某人的身份调 tRPC：绕过 HTTP 与 OIDC，会话是伪造的，其余（中间件、服务、库）都是真的 */
export function callerAs(u: TestUser) {
	const now = new Date();
	const session = {
		session: {
			id: uniq("s"),
			userId: u.id,
			token: uniq("t"),
			expiresAt: new Date(now.getTime() + 3_600_000),
			createdAt: now,
			updatedAt: now,
			ipAddress: "127.0.0.1",
			userAgent: "vitest",
		},
		user: u,
	} as unknown as AuthSession;
	return createCaller(
		createContext({
			db: testDb(),
			session,
			meta: {
				reqId: uniq("req"),
				ip: "127.0.0.1",
				userAgent: "vitest",
				method: "POST",
				path: "/api/trpc/test",
			},
		}),
	);
}

/** 建人并拿到他的 caller */
export async function actor(
	opts: { name?: string; role?: "member" | "admin" } = {},
) {
	const u = await createUser(opts);
	return { user: u, api: callerAs(u) };
}

import { createContext, type Principal } from "~/server/api/context";
import { createApiClient } from "~/server/api/router";

import { createUser, testDb, uniq } from "./db";

type TestUser = Awaited<ReturnType<typeof createUser>>;

/**
 * 以某人的身份调 API：绕过 HTTP 与 OIDC，身份是伪造的，其余（中间件、服务、库）都是真的。
 * 带 apiKey 时就是这个人签的 key 在调（级别规则照常生效）。
 */
export function callerAs(u: TestUser, apiKey: Principal["apiKey"] = null) {
	return createApiClient(
		createContext({
			db: testDb(),
			principal: {
				user: {
					id: u.id,
					name: u.name,
					role: u.role === "admin" ? "admin" : "member",
				},
				apiKey,
			},
			apiKeyRejected: false,
			meta: {
				reqId: uniq("req"),
				ip: "127.0.0.1",
				userAgent: "vitest",
				method: "POST",
				path: "/api/v1/test",
			},
		}),
	);
}

/** 建人并拿到他的 client */
export async function actor(
	opts: { name?: string; role?: "member" | "admin" } = {},
) {
	const u = await createUser(opts);
	return { user: u, api: callerAs(u) };
}

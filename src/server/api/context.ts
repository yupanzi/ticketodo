import { getIP } from "@better-auth/core/utils/ip";

import { getAuth } from "~/server/auth";
import { ipOptions } from "~/server/auth/options";
import { getDb } from "~/server/db";
import { getServerEnv } from "~/server/env";
import { REQUEST_ID_HEADER } from "~/server/request";

import { type Context, createContext } from "./trpc";

/**
 * 从 HTTP 请求拼 tRPC context。IP 与 better-auth 记会话用同一套规则；请求 id 是 proxy 定的
 * （proxy 没跑到时兜底新生成）。
 */
export async function contextFromHeaders(
	headers: Headers,
	request: { method: string; path: string },
): Promise<Context> {
	const env = getServerEnv();
	return createContext({
		db: getDb(),
		session: await getAuth().api.getSession({ headers }),
		meta: {
			reqId: headers.get(REQUEST_ID_HEADER) ?? crypto.randomUUID(),
			ip: getIP(headers, ipOptions(env)),
			userAgent: headers.get("user-agent"),
			method: request.method,
			path: request.path,
		},
	});
}

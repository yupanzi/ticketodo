import { getIP } from "@better-auth/core/utils/ip";
import type { Logger } from "pino";

import { API_KEY_PREFIX, type ApiKeyLevel } from "~/domain/api-key";
import type { UserRole } from "~/domain/policy";
import { getAuth } from "~/server/auth";
import { ipOptions } from "~/server/auth/options";
import { type Database, getDb } from "~/server/db";
import { getServerEnv } from "~/server/env";
import { logger } from "~/server/log";
import { REQUEST_ID_HEADER } from "~/server/request";
import { verifyApiKey } from "~/server/services/api-key";

/**
 * API 的初始 context，只由纯值组成：HTTP 请求在 `contextFromHeaders` 里解析，RSC 与测试直接构造。
 */

export interface RequestMeta {
	reqId: string;
	ip: string | null;
	userAgent: string | null;
	method: string;
	path: string;
}

/** 这个请求代表谁：浏览器登录态，或某个 API key（以签发人的身份） */
export interface Principal {
	user: { id: string; name: string; role: UserRole };
	apiKey: { id: string; name: string; level: ApiKeyLevel } | null;
}

export interface Context {
	db: Database;
	/** null = 未登录，或 Bearer key 无效 */
	principal: Principal | null;
	/** 带了 Bearer 但校验没过：401 的文案据此说清楚是 key 的问题 */
	apiKeyRejected: boolean;
	meta: RequestMeta;
	/** 带 reqId 的 child logger，与审计的 request_id 同值 */
	log: Logger;
}

export function createContext(input: Omit<Context, "log">): Context {
	return { ...input, log: logger.child({ reqId: input.meta.reqId }) };
}

/**
 * Bearer 优先：带了 `Authorization` 就只认 API key（不再看 cookie），免得无效 key 悄悄落回某人的
 * 浏览器会话。
 */
async function resolvePrincipal(
	db: Database,
	headers: Headers,
	log: Logger,
): Promise<Pick<Context, "principal" | "apiKeyRejected">> {
	const authorization = headers.get("authorization");
	if (authorization !== null) {
		const token = /^Bearer\s+(\S+)$/i.exec(authorization.trim())?.[1];
		const verified =
			token?.startsWith(API_KEY_PREFIX) && (await verifyApiKey(db, token, log));
		if (!verified) return { principal: null, apiKeyRejected: true };
		return {
			principal: { user: verified.user, apiKey: verified.key },
			apiKeyRejected: false,
		};
	}
	const session = await getAuth().api.getSession({ headers });
	if (!session) return { principal: null, apiKeyRejected: false };
	const { user } = session;
	return {
		principal: {
			user: {
				id: user.id,
				name: user.name,
				role: user.role === "admin" ? "admin" : "member",
			},
			apiKey: null,
		},
		apiKeyRejected: false,
	};
}

/**
 * 从 HTTP 请求拼 context。IP 与 better-auth 记会话用同一套规则；请求 id 是 proxy 定的
 * （proxy 没跑到时兜底新生成）。
 */
export async function contextFromHeaders(
	headers: Headers,
	request: { method: string; path: string },
): Promise<Context> {
	const env = getServerEnv();
	const db = getDb();
	const meta: RequestMeta = {
		reqId: headers.get(REQUEST_ID_HEADER) ?? crypto.randomUUID(),
		ip: getIP(headers, ipOptions(env)),
		userAgent: headers.get("user-agent"),
		method: request.method,
		path: request.path,
	};
	const log = logger.child({ reqId: meta.reqId });
	return { db, meta, log, ...(await resolvePrincipal(db, headers, log)) };
}

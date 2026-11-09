import { implement, ORPCError, ValidationError } from "@orpc/server";
import { z } from "zod";

import { contract } from "~/contract";
import { apiKeyActorRole, apiKeyAllowsMethod } from "~/domain/api-key";
import { type AuditSource, recordAuditSafe } from "~/server/audit/record";
import { AppError, forbidden } from "~/server/errors";
import type { AuditAction } from "~/server/resources";
import type { ServiceContext } from "~/server/services/context";

import type { Context, Principal, RequestMeta } from "./context";

/** 实现契约的起点：每个接口在 `./routers` 里用 `os.<路径>.use(guard(…)).handler(…)` 实现 */
export const os = implement(contract).$context<Context>();

function sourceOf(meta: RequestMeta, principal: Principal): AuditSource {
	return {
		ip: meta.ip,
		userAgent: meta.userAgent,
		method: meta.method,
		path: meta.path,
		requestId: meta.reqId,
		apiKeyId: principal.apiKey?.id ?? null,
		apiKeyName: principal.apiKey?.name ?? null,
	};
}

/** 接口声明的方法（不是请求的方法）：RSC 与测试在进程内调用时也按它判 */
function declaredMethod(procedure: {
	"~orpc": { route: { method?: string } };
}): string {
	return procedure["~orpc"].route.method ?? "POST";
}

interface GuardOptions {
	/** 越权被拒（FORBIDDEN）时记 failure 审计的动作；只给变更接口 */
	audit?: AuditAction;
	admin?: true;
	/** 只认浏览器登录：API key 不能管理 API key，否则泄露的 key 能自己续命 */
	browserOnly?: true;
}

/**
 * 认证与 key 级别都在这里判，往下只剩一个 `svc.actor`：服务层与 `policy.ts` 不知道请求来自浏览器
 * 还是 AI。key 的规则见 `~/domain/api-key`。
 */
export function guard(opts: GuardOptions = {}) {
	return os.middleware(async ({ context, procedure, next }) => {
		const principal = context.principal;
		if (!principal)
			throw new ORPCError("UNAUTHORIZED", {
				message: context.apiKeyRejected
					? "API key 无效、已撤销或已过期"
					: "请先登录",
			});
		const { user, apiKey } = principal;
		let role = user.role;
		if (apiKey) {
			if (!apiKeyAllowsMethod(apiKey.level, declaredMethod(procedure)))
				throw new ORPCError("FORBIDDEN", {
					message: "只读 API key 只能调用 GET 接口",
				});
			const keyRole = apiKeyActorRole(apiKey.level, user.role);
			if (!keyRole)
				throw new ORPCError("FORBIDDEN", {
					message:
						"这个管理员级 API key 的签发人已不是管理员，key 不能再用；请签发读写级的 key",
				});
			role = keyRole;
		}
		const svc: ServiceContext = {
			db: context.db,
			actor: { id: user.id, name: user.name, role },
			source: sourceOf(context.meta, principal),
			log: context.log,
		};
		try {
			if (opts.browserOnly && apiKey)
				throw forbidden("API key 不能管理 API key，请在浏览器里操作");
			if (opts.admin && role !== "admin") throw forbidden("需要管理员权限");
			return await next({ context: { svc, principal } });
		} catch (err) {
			// 看不见的是 NOT_FOUND、不记；看得见但不让做才记
			if (opts.audit && err instanceof AppError && err.code === "FORBIDDEN")
				await recordAuditSafe(context.db, {
					action: opts.audit,
					status: "failure",
					actorType: "user",
					actorId: user.id,
					actorName: user.name,
					...err.target,
					details: { summary: err.message },
					...svc.source,
				});
			throw err;
		}
	});
}

/**
 * 错误统一在这里成形，HTTP 与进程内调用（RSC、测试）共用：
 * - AppError → 同名 ORPCError（服务层不依赖 oRPC，cron 也调它）
 * - 入参校验失败 → 400，message 写清哪个字段，AI 照着改就行
 * - 其余 → 500。⚠️ 原始 message 可能带 SQL 与参数：只回通用文案与请求 id，详情（err）只进日志
 */
function normalizeError(err: unknown, context: Context, path: string): unknown {
	if (err instanceof AppError)
		return new ORPCError(err.code, { message: err.message, cause: err });
	if (err instanceof ORPCError) {
		if (err.code === "BAD_REQUEST" && err.cause instanceof ValidationError) {
			const issues = new z.ZodError(err.cause.issues as z.core.$ZodIssue[]);
			return new ORPCError("BAD_REQUEST", {
				message: `参数不合法：${z.prettifyError(issues)}`,
				data: z.flattenError(issues),
				cause: err.cause,
			});
		}
		if (err.code !== "INTERNAL_SERVER_ERROR") return err;
	}
	context.log.error(
		{ err: err instanceof ORPCError ? (err.cause ?? err) : err, path },
		"API 内部错误",
	);
	return new ORPCError("INTERNAL_SERVER_ERROR", {
		message: `服务器内部错误（请求 id：${context.meta.reqId}）`,
	});
}

/** 每次调用一行日志：写 info、读 debug（铃铛 30s 轮询，info 会刷屏） */
export async function apiInterceptor({
	context,
	path,
	procedure,
	next,
}: {
	context: Context;
	path: readonly string[];
	procedure: { "~orpc": { route: { method?: string } } };
	next: () => Promise<unknown>;
}): Promise<unknown> {
	const start = performance.now();
	const name = path.join(".");
	const method = declaredMethod(procedure);
	const fields = () => ({
		path: name,
		method,
		durationMs: Math.round(performance.now() - start),
		apiKeyId: context.principal?.apiKey?.id,
	});
	try {
		const output = await next();
		context.log[method === "GET" ? "debug" : "info"](fields(), "api");
		return output;
	} catch (err) {
		const normalized = normalizeError(err, context, name);
		if (
			normalized instanceof ORPCError &&
			normalized.code !== "INTERNAL_SERVER_ERROR"
		)
			context.log.info({ ...fields(), code: normalized.code }, "api 拒绝");
		throw normalized;
	}
}

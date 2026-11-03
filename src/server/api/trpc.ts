import { initTRPC, TRPCError } from "@trpc/server";
import type { Logger } from "pino";
import superjson from "superjson";
import { ZodError, z } from "zod";
import { type AuditSource, recordAuditSafe } from "~/server/audit/record";
import type { AuthSession } from "~/server/auth";
import type { Database } from "~/server/db";
import { AppError } from "~/server/errors";
import { logger } from "~/server/log";
import type { AuditAction } from "~/server/resources";
import type { ServiceContext } from "~/server/services/context";

/**
 * tRPC 的组装（T3 的结构）。context 只由纯值组成：请求解析在 `./context.ts`，测试直接构造。
 */

export interface RequestMeta {
	reqId: string;
	ip: string | null;
	userAgent: string | null;
	method: string;
	path: string;
}

export interface Context {
	db: Database;
	session: AuthSession | null;
	meta: RequestMeta;
	/** 带 reqId 的 child logger，与审计的 request_id 同值 */
	log: Logger;
}

export function createContext(input: Omit<Context, "log">): Context {
	return { ...input, log: logger.child({ reqId: input.meta.reqId }) };
}

/** 每个变更声明自己的审计动作：越权被拒时用它记 failure */
interface Meta {
	audit?: AuditAction;
}

const t = initTRPC
	.context<Context>()
	.meta<Meta>()
	.create({
		transformer: superjson,
		errorFormatter({ shape, error, ctx }) {
			// ⚠️ 500 的原始 message 可能带 SQL 与参数：只回通用文案与请求 id，详情进日志
			const internal = error.code === "INTERNAL_SERVER_ERROR";
			return {
				...shape,
				message: internal
					? `服务器内部错误（请求 id：${ctx?.meta.reqId ?? "-"}）`
					: shape.message,
				data: {
					...shape.data,
					stack: undefined,
					zodError:
						error.cause instanceof ZodError
							? z.flattenError(error.cause)
							: null,
				},
			};
		},
	});

export const createTRPCRouter = t.router;
export const createCallerFactory = t.createCallerFactory;

function sourceOf(meta: RequestMeta): AuditSource {
	return {
		ip: meta.ip,
		userAgent: meta.userAgent,
		method: meta.method,
		path: meta.path,
		requestId: meta.reqId,
	};
}

/** 每次调用一行日志：变更 info、查询 debug（铃铛 30s 轮询，info 会刷屏） */
const observe = t.middleware(async ({ ctx, path, type, next }) => {
	const start = performance.now();
	const result = await next();
	const durationMs = Math.round(performance.now() - start);
	if (result.ok) {
		ctx.log[type === "mutation" ? "info" : "debug"](
			{ path, type, durationMs },
			"trpc",
		);
	} else if (result.error.code !== "INTERNAL_SERVER_ERROR") {
		// 500 由 route handler 的 onError 带 err 记
		ctx.log.info(
			{ path, type, durationMs, code: result.error.code },
			"trpc 拒绝",
		);
	}
	return result;
});

/** AppError → 同名 TRPCError；越权的变更写 failure 审计（看不见的 NOT_FOUND 不记） */
const mapErrors = t.middleware(async ({ ctx, type, meta, next }) => {
	const result = await next();
	if (result.ok || !(result.error.cause instanceof AppError)) return result;
	const appError = result.error.cause;
	if (
		type === "mutation" &&
		appError.code === "FORBIDDEN" &&
		meta?.audit &&
		ctx.session
	) {
		await recordAuditSafe(ctx.db, {
			action: meta.audit,
			status: "failure",
			actorType: "user",
			actorId: ctx.session.user.id,
			actorName: ctx.session.user.name,
			...appError.target,
			details: { summary: appError.message },
			...sourceOf(ctx.meta),
		});
	}
	throw new TRPCError({
		code: appError.code,
		message: appError.message,
		cause: appError,
	});
});

export const publicProcedure = t.procedure.use(observe).use(mapErrors);

export const protectedProcedure = publicProcedure.use(({ ctx, next }) => {
	if (!ctx.session)
		throw new TRPCError({ code: "UNAUTHORIZED", message: "请先登录" });
	const { user } = ctx.session;
	const svc: ServiceContext = {
		db: ctx.db,
		actor: {
			id: user.id,
			name: user.name,
			role: user.role === "admin" ? "admin" : "member",
		},
		source: sourceOf(ctx.meta),
		log: ctx.log,
	};
	return next({ ctx: { ...ctx, session: ctx.session, svc } });
});

export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
	if (ctx.svc.actor.role !== "admin")
		throw new AppError("FORBIDDEN", "需要管理员权限");
	return next();
});

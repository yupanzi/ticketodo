/**
 * 服务层的业务错误，不依赖 tRPC（cron 也调服务层）。tRPC 中间件把它翻成同名的 TRPCError 码，
 * FORBIDDEN 的变更顺带写一条 failure 审计（target 取这里带的）。
 */

export type AppErrorCode =
	| "NOT_FOUND"
	| "FORBIDDEN"
	| "CONFLICT"
	| "BAD_REQUEST";

export interface AuditTarget {
	targetType: string;
	targetId?: string | null;
	targetName?: string | null;
}

export class AppError extends Error {
	constructor(
		readonly code: AppErrorCode,
		message: string,
		readonly target?: AuditTarget,
	) {
		super(message);
		this.name = "AppError";
	}
}

/** 看不见与不存在说法一样：别人的 todo 不能被单号探测出来 */
export function notFound(what = "条目"): AppError {
	return new AppError("NOT_FOUND", `${what}不存在，或你没有权限查看`);
}

export function forbidden(message: string, target?: AuditTarget): AppError {
	return new AppError("FORBIDDEN", message, target);
}

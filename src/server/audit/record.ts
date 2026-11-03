import {
	type AuditActorType,
	type AuditDetails,
	type AuditStatus,
	normalizeIp,
	normalizeRequestPath,
} from "~/domain/audit";
import type { Database, Executor } from "~/server/db";
import { auditLogs } from "~/server/db/schema";
import { logger } from "~/server/log";
import type { AuditAction } from "~/server/resources";

/** 请求来源。tRPC context 与 better-auth hook 各自组装 */
export interface AuditSource {
	ip?: string | null;
	userAgent?: string | null;
	method?: string | null;
	path?: string | null;
	requestId?: string | null;
}

export interface AuditEntry extends AuditSource {
	action: AuditAction;
	/** 缺省 success */
	status?: AuditStatus;

	actorType: AuditActorType;
	actorId?: string | null;
	actorName?: string | null;

	/** 缺省取 `action` 的首段 */
	targetType?: string;
	targetId?: string | null;
	targetName?: string | null;

	details?: AuditDetails;
}

function toRow(entry: AuditEntry): typeof auditLogs.$inferInsert {
	return {
		action: entry.action,
		status: entry.status ?? "success",
		actorType: entry.actorType,
		actorId: entry.actorId ?? null,
		actorName: entry.actorName ?? null,
		targetType: entry.targetType ?? entry.action.split(".")[0] ?? "unknown",
		targetId: entry.targetId ?? null,
		targetName: entry.targetName ?? null,
		ip: normalizeIp(entry.ip),
		userAgent: entry.userAgent ?? null,
		method: entry.method ?? null,
		path: normalizeRequestPath(entry.path),
		requestId: entry.requestId ?? null,
		details: entry.details ?? null,
	};
}

/**
 * 随业务事务写：写不进去就抛，整笔回滚。别改成吞错——时间线就是审计，吞了等于改了数据却没留痕。
 */
export async function auditInTx(
	tx: Executor,
	entry: AuditEntry,
): Promise<void> {
	await tx.insert(auditLogs).values(toRow(entry));
}

/**
 * 不在业务事务里的事件（登录、登出、越权被拒）。整个函数体在 try 里：审计写失败不能把已成功的
 * 操作反打成 500。
 */
export async function recordAuditSafe(
	db: Database,
	entry: AuditEntry,
): Promise<void> {
	try {
		await db.insert(auditLogs).values(toRow(entry));
	} catch (err) {
		// 审计丢了只剩这一行，生产要配告警
		logger.error(
			{ reqId: entry.requestId, action: entry.action, err },
			"写入审计失败",
		);
	}
}

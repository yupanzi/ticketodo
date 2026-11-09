import { and, desc, eq, gte, like, lt, lte, type SQL } from "drizzle-orm";

import type { AuditStatus } from "~/domain/audit";
import { parseItemCode } from "~/domain/item-code";
import type { Executor } from "~/server/db";
import { auditLogs } from "~/server/db/schema";

export interface AuditFilters {
	from?: Date;
	to?: Date;
	actorId?: string;
	/** 前缀匹配：`item.` 查全部条目动作 */
	action?: string;
	status?: AuditStatus;
	/** 单号，或 targetType:targetId */
	target?: string;
	/** 某个 API key 做过的全部操作（key 泄露时查） */
	apiKeyId?: string;
	cursor?: number;
	limit: number;
}

export type AuditRow = typeof auditLogs.$inferSelect;

/** 管理后台的审计查询：全部列都给（含 ip、user agent、request id） */
export async function queryAudit(
	db: Executor,
	f: AuditFilters,
): Promise<{ rows: AuditRow[]; nextCursor: number | null }> {
	const conds: (SQL | undefined)[] = [];
	if (f.from) conds.push(gte(auditLogs.at, f.from));
	if (f.to) conds.push(lte(auditLogs.at, f.to));
	if (f.actorId) conds.push(eq(auditLogs.actorId, f.actorId));
	if (f.action) {
		const escaped = f.action.replace(/[\\%_]/g, (c) => `\\${c}`);
		conds.push(like(auditLogs.action, `${escaped}%`));
	}
	if (f.status) conds.push(eq(auditLogs.status, f.status));
	if (f.apiKeyId) conds.push(eq(auditLogs.apiKeyId, f.apiKeyId));
	const target = f.target?.trim();
	if (target) {
		if (parseItemCode(target)) {
			// 条目与它的评论都以单号作 target_name
			conds.push(eq(auditLogs.targetName, target.toUpperCase()));
		} else {
			const [type, id] = target.split(":");
			conds.push(eq(auditLogs.targetType, type ?? ""));
			if (id) conds.push(eq(auditLogs.targetId, id));
		}
	}
	if (f.cursor) conds.push(lt(auditLogs.id, f.cursor));
	const rows = await db
		.select()
		.from(auditLogs)
		.where(and(...conds))
		.orderBy(desc(auditLogs.id))
		.limit(f.limit + 1);
	const page = rows.slice(0, f.limit);
	return {
		rows: page,
		nextCursor: rows.length > f.limit ? (page.at(-1)?.id ?? null) : null,
	};
}

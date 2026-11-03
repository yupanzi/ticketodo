import { sql } from "drizzle-orm";

import { APP_TIMEZONE } from "~/domain/due";
import type { NotificationKind } from "~/domain/notify";
import { auditInTx } from "~/server/audit/record";
import type { Database, Tx } from "~/server/db";
import { items, notifications } from "~/server/db/schema";
import { AUDIT_ACTIONS } from "~/server/resources";

/**
 * 到期提醒（CronJob 每天跑一次）。只看进行中的条目，收件人是负责人。
 * - due_soon：今天或明天到期；overdue：已过期
 * - dedupe_key = 期望完成日期：同一日期只提醒一次，改了日期重新提醒，漏跑的下次补上
 * 「今天」在 SQL 里按北京时间算，与列表的逾期筛选同一口径。
 */

const today = sql`(now() AT TIME ZONE ${APP_TIMEZONE})::date`;

async function remind(
	tx: Tx,
	kind: Extract<NotificationKind, "due_soon" | "overdue">,
	window: ReturnType<typeof sql>,
): Promise<number> {
	// ⚠️ ON CONFLICT 要带上部分唯一索引的谓词，PG 才认得出是哪个索引
	const result = await tx.execute(sql`
		INSERT INTO ${notifications}
			(recipient_id, item_id, actor_id, kind, payload, dedupe_key)
		SELECT
			${items.assigneeId}, ${items.id}, NULL, ${kind},
			jsonb_build_object(
				'code', ${items.code}, 'title', ${items.title},
				'itemType', ${items.type}, 'dueDate', ${items.dueDate}::text
			),
			${items.dueDate}::text
		FROM ${items}
		WHERE ${items.deletedAt} IS NULL
			AND ${items.status} IN ('open', 'in_progress')
			AND ${items.dueDate} IS NOT NULL
			AND ${window}
		ON CONFLICT (recipient_id, item_id, kind, dedupe_key)
			WHERE dedupe_key IS NOT NULL
			DO NOTHING`);
	return result.rowCount ?? 0;
}

export async function runDueRemind(
	db: Database,
): Promise<{ dueSoon: number; overdue: number }> {
	return db.transaction(async (tx) => {
		const dueSoon = await remind(
			tx,
			"due_soon",
			sql`${items.dueDate} BETWEEN ${today} AND ${today} + 1`,
		);
		const overdue = await remind(
			tx,
			"overdue",
			sql`${items.dueDate} < ${today}`,
		);
		await auditInTx(tx, {
			action: AUDIT_ACTIONS.notifyDueRemind,
			actorType: "system",
			targetType: "notify",
			details: { counts: { dueSoon, overdue } },
		});
		return { dueSoon, overdue };
	});
}

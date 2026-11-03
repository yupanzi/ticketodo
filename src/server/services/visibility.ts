import { and, eq, isNull, or, type SQL } from "drizzle-orm";

import { type Actor, isAdmin } from "~/domain/policy";
import { items } from "~/server/db/schema";

/**
 * `canView` 的 SQL 版（不含回收站）：列表、看板、搜索、计数都走它。⚠️ 与 `~/domain/policy` 的
 * canView 必须同一口径，改一处要改两处；`visibility.integration.test.ts` 对照两者。
 */
export function visibleItemsWhere(actor: Actor): SQL {
	const notDeleted = isNull(items.deletedAt);
	if (isAdmin(actor)) return notDeleted;
	return and(
		notDeleted,
		or(eq(items.type, "ticket"), eq(items.reporterId, actor.id)),
	) as SQL;
}

import { sql } from "drizzle-orm";

import { APP_TIMEZONE } from "~/domain/due";
import { formatItemCode } from "~/domain/item-code";
import type { Tx } from "~/server/db";
import { itemCodeSeq } from "~/server/db/schema";

/**
 * 在建单事务里取号。日期在 SQL 里算：`now()` 是事务开始时间，单号日期与 created_at 必然一致，
 * 跨北京零点也不会错位。行锁持有到提交，同日并发建单排队取号。
 */
export async function nextItemCode(tx: Tx): Promise<string> {
	const day = sql<string>`(now() AT TIME ZONE ${APP_TIMEZONE})::date`;
	const [row] = await tx
		.insert(itemCodeSeq)
		.values({ day, last: 1 })
		.onConflictDoUpdate({
			target: itemCodeSeq.day,
			set: { last: sql`${itemCodeSeq.last} + 1` },
		})
		.returning({ day: itemCodeSeq.day, last: itemCodeSeq.last });
	if (!row) throw new Error("取单号失败");
	return formatItemCode(row.day, row.last);
}

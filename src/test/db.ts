import { randomUUID } from "node:crypto";

import { and, eq, inArray } from "drizzle-orm";

import { type Database, getDb } from "~/server/db";
import { auditLogs, type UserRole, user } from "~/server/db/schema";

/** 集成测试只跑在 TEST_DATABASE_URL 上（vitest.config.ts 把它换成 DATABASE_URL）；没配就跳过 */
export const hasTestDb = Boolean(process.env.TEST_DATABASE_URL);

export function testDb(): Database {
	return getDb();
}

/** 每次跑都用新 id / 邮箱：审计只追加删不掉，测试数据只能靠唯一值区分 */
export function uniq(prefix: string): string {
	return `${prefix}-${randomUUID().slice(0, 8)}`;
}

export async function createUser(
	opts: { name?: string; email?: string; role?: UserRole } = {},
) {
	const id = uniq("u");
	const [row] = await testDb()
		.insert(user)
		.values({
			id,
			name: opts.name ?? id,
			email: opts.email ?? `${id}@test.invalid`,
			role: opts.role ?? "member",
		})
		.returning();
	if (!row) throw new Error("插入测试用户失败");
	return row;
}

/** 条目、标签都是从 1 起的整数 id，只按 target_id 查会串：要带上 target_type */
export async function auditsFor(
	targetType: "item" | "user" | "comment" | "tag",
	targetId: string | number,
	actions?: string[],
) {
	return testDb()
		.select()
		.from(auditLogs)
		.where(
			and(
				eq(auditLogs.targetType, targetType),
				eq(auditLogs.targetId, String(targetId)),
				actions ? inArray(auditLogs.action, actions) : undefined,
			),
		)
		.orderBy(auditLogs.id);
}

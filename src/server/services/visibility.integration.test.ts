import { and, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { type Actor, canView } from "~/domain/policy";
import { items } from "~/server/db/schema";
import { hasTestDb, testDb } from "~/test/db";
import { actor } from "~/test/trpc";

import { visibleItemsWhere } from "./visibility";

/** `visibleItemsWhere`（SQL）与 `canView`（domain）必须同一口径：同一批条目逐个对照 */
describe.skipIf(!hasTestDb)("visibleItemsWhere 与 canView 一致", () => {
	it("ticket / 自己的 todo / 别人的 todo / 已删除，对成员与管理员", async () => {
		const owner = await actor();
		const other = await actor();
		const admin = await actor({ role: "admin" });

		const codes = [
			(
				await owner.api.item.create({
					type: "ticket",
					title: "t",
					priority: "P0",
					assigneeId: other.user.id,
				})
			).code,
			(
				await owner.api.item.create({
					type: "todo",
					title: "d",
					priority: "P1",
				})
			).code,
		];
		const deleted = (
			await owner.api.item.create({ type: "todo", title: "x", priority: "P3" })
		).code;
		await owner.api.item.delete({ code: deleted });
		codes.push(deleted);

		const rows = await testDb()
			.select()
			.from(items)
			.where(inArray(items.code, codes));
		expect(rows).toHaveLength(3);

		for (const u of [owner.user, other.user, admin.user]) {
			const a: Actor = { id: u.id, role: u.role };
			const bySql = await testDb()
				.select({ id: items.id })
				.from(items)
				.where(and(inArray(items.code, codes), visibleItemsWhere(a)));
			const sqlIds = new Set(bySql.map((r) => r.id));
			for (const row of rows) {
				// 回收站（已删除）只在管理员的回收站接口里出现，不进普通列表：SQL 版不含它
				const expected = canView(a, row) && row.deletedAt === null;
				expect(sqlIds.has(row.id), `${u.role} 看 ${row.code}`).toBe(expected);
			}
		}
		// 防呆：确实存在「看不见」的情形
		const [ownTodo] = rows.filter(
			(r) => r.type === "todo" && r.deletedAt === null,
		);
		if (!ownTodo) throw new Error("应有未删除的 todo");
		expect(canView({ id: other.user.id, role: "member" }, ownTodo)).toBe(false);
	});
});

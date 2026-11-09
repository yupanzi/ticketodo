import { and, eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { addDays, todayInAppTz } from "~/domain/due";
import { items, notifications } from "~/server/db/schema";
import { hasTestDb, testDb } from "~/test/db";
import { actor } from "~/test/trpc";

import { runDueRemind } from "./due-remind";

describe.skipIf(!hasTestDb)("到期提醒", () => {
	it("今明到期 → due_soon、已过期 → overdue；只算进行中；重跑不重复；改期重新提醒", async () => {
		const reporter = await actor();
		const owner = await actor();
		const today = todayInAppTz();
		const make = async (dueDate: string, title: string) => {
			const { code } = await reporter.api.item.create({
				type: "ticket",
				title,
				assigneeId: owner.user.id,
				dueDate,
			});
			return code;
		};
		const soon = await make(addDays(today, 1), "明天到期");
		const late = await make(addDays(today, -3), "已逾期");
		const later = await make(addDays(today, 5), "还早");
		const resolved = await make(addDays(today, -1), "已解决的不提醒");
		await owner.api.item.transition({ code: resolved, to: "resolved" });
		const deleted = await make(today, "删了的不提醒");
		await reporter.api.item.delete({ code: deleted });

		const mine = async () => {
			const rows = await testDb()
				.select({ code: items.code, kind: notifications.kind })
				.from(notifications)
				.innerJoin(items, eq(items.id, notifications.itemId))
				.where(
					and(
						eq(notifications.recipientId, owner.user.id),
						inArray(notifications.kind, ["due_soon", "overdue"]),
					),
				);
			return rows.map((r) => `${r.code}:${r.kind}`).sort();
		};

		await runDueRemind(testDb());
		expect(await mine()).toEqual(
			[`${late}:overdue`, `${soon}:due_soon`].sort(),
		);
		expect(later).toBeTruthy();

		// 重跑：唯一索引挡住重复
		await runDueRemind(testDb());
		expect(await mine()).toHaveLength(2);

		// 改期：新日期再提醒一次
		await reporter.api.item.update({ code: soon, dueDate: today });
		await runDueRemind(testDb());
		expect((await mine()).filter((x) => x === `${soon}:due_soon`)).toHaveLength(
			2,
		);
	});
});

import { TRPCError } from "@trpc/server";
import { and, eq, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { formatMention } from "~/domain/mention";
import { auditLogs, notifications } from "~/server/db/schema";
import { AUDIT_ACTIONS } from "~/server/resources";
import { auditsFor, hasTestDb, testDb } from "~/test/db";
import { actor } from "~/test/trpc";

type Actor = Awaited<ReturnType<typeof actor>>;

async function codeOf<T>(p: Promise<T>): Promise<string | undefined> {
	try {
		await p;
		return undefined;
	} catch (err) {
		return err instanceof TRPCError ? err.code : "NOT_TRPC";
	}
}

async function notificationsOf(userId: string) {
	return testDb()
		.select()
		.from(notifications)
		.where(eq(notifications.recipientId, userId))
		.orderBy(notifications.id);
}

async function newTicket(by: Actor, assignee: Actor, extra = {}) {
	const { code } = await by.api.item.create({
		type: "ticket",
		title: "打印机坏了",
		priority: "P0",
		assigneeId: assignee.user.id,
		...extra,
	});
	return code;
}

describe.skipIf(!hasTestDb)("item API", () => {
	let reporter: Actor;
	let assignee: Actor;
	let other: Actor;
	let bystander: Actor;
	let admin: Actor;

	beforeAll(async () => {
		reporter = await actor({ name: "提单人" });
		assignee = await actor({ name: "负责人" });
		other = await actor({ name: "接手人" });
		bystander = await actor({ name: "旁人" });
		admin = await actor({ name: "管理员", role: "admin" });
	});

	describe("建单", () => {
		it("ticket 不指定负责人建不了", async () => {
			expect(
				await codeOf(
					// @ts-expect-error 故意漏掉 assigneeId
					reporter.api.item.create({
						type: "ticket",
						title: "x",
						priority: "P1",
					}),
				),
			).toBe("BAD_REQUEST");
		});

		it("指派给别人：单号格式、审计、负责人收到「指派给你」", async () => {
			const code = await newTicket(reporter, assignee, {
				tags: ["网络", "网络 "],
			});
			expect(code).toMatch(/^TK-\d{8}-\d{4,}$/);

			const { item } = await reporter.api.item.byCode({ code });
			expect(item.assignee.id).toBe(assignee.user.id);
			expect(item.tags.map((t) => t.name)).toEqual(["网络"]);

			const audits = await auditsFor("item", item.id);
			expect(audits.map((a) => a.action)).toEqual([AUDIT_ACTIONS.itemCreate]);
			expect(audits[0]?.actorId).toBe(reporter.user.id);

			const inbox = await notificationsOf(assignee.user.id);
			expect(inbox.at(-1)).toMatchObject({ kind: "assigned", itemId: item.id });
			expect(await notificationsOf(reporter.user.id)).toEqual([]);
		});

		it("todo 的负责人恒为本人，忽略传入的人", async () => {
			const { code } = await reporter.api.item.create({
				type: "todo",
				title: "写周报",
				priority: "P1",
			});
			const { item } = await reporter.api.item.byCode({ code });
			expect(item.assignee.id).toBe(reporter.user.id);
		});

		it("20 个并发建单：单号不重复、序号连续", async () => {
			const codes = await Promise.all(
				Array.from({ length: 20 }, () =>
					reporter.api.item
						.create({ type: "todo", title: "并发", priority: "P3" })
						.then((r) => r.code),
				),
			);
			const seqs = codes
				.map((c) => Number(c.split("-")[2]))
				.sort((a, b) => a - b);
			expect(new Set(codes).size).toBe(20);
			expect((seqs.at(-1) ?? 0) - (seqs[0] ?? 0)).toBe(19);
		});
	});

	describe("可见性", () => {
		it("别人的 todo：旁人 NOT_FOUND 且不记审计，管理员看得到", async () => {
			const { code } = await reporter.api.item.create({
				type: "todo",
				title: "私事",
				priority: "P2",
			});
			expect(await codeOf(bystander.api.item.byCode({ code }))).toBe(
				"NOT_FOUND",
			);
			expect(
				await codeOf(bystander.api.item.transition({ code, to: "closed" })),
			).toBe("NOT_FOUND");
			const failures = await testDb()
				.select()
				.from(auditLogs)
				.where(
					and(
						eq(auditLogs.actorId, bystander.user.id),
						eq(auditLogs.status, "failure"),
					),
				);
			expect(failures).toEqual([]);

			expect((await admin.api.item.byCode({ code })).item.title).toBe("私事");
			const list = await bystander.api.item.list({ q: code });
			expect(list.items).toEqual([]);
		});
	});

	describe("改派", () => {
		it("提单人改派：FORBIDDEN 并记 failure 审计", async () => {
			const code = await newTicket(reporter, assignee);
			expect(
				await codeOf(
					reporter.api.item.assign({ code, assigneeId: other.user.id }),
				),
			).toBe("FORBIDDEN");
			const { item } = await admin.api.item.byCode({ code });
			const [failure] = await auditsFor("item", item.id, [
				AUDIT_ACTIONS.itemAssign,
			]);
			expect(failure).toMatchObject({
				status: "failure",
				actorId: reporter.user.id,
				targetName: code,
			});
		});

		it("负责人转给别人：状态不变，新负责人与提单人都收到通知", async () => {
			const code = await newTicket(reporter, assignee);
			await assignee.api.item.transition({ code, to: "in_progress" });
			await assignee.api.item.assign({ code, assigneeId: other.user.id });

			const { item } = await other.api.item.byCode({ code });
			expect(item.assignee.id).toBe(other.user.id);
			expect(item.status).toBe("in_progress");
			expect((await notificationsOf(other.user.id)).at(-1)?.kind).toBe(
				"assigned",
			);
			const reporterInbox = await notificationsOf(reporter.user.id);
			expect(reporterInbox.at(-1)?.itemId).toBe(item.id);

			// 原负责人不再是负责人，不能再转
			expect(
				await codeOf(
					assignee.api.item.assign({ code, assigneeId: assignee.user.id }),
				),
			).toBe("FORBIDDEN");
		});

		it("管理员可以改派；不能指派给不存在的人", async () => {
			const code = await newTicket(reporter, assignee);
			await admin.api.item.assign({ code, assigneeId: bystander.user.id });
			expect((await admin.api.item.byCode({ code })).item.assignee.id).toBe(
				bystander.user.id,
			);
			expect(
				await codeOf(admin.api.item.assign({ code, assigneeId: "nobody" })),
			).toBe("BAD_REQUEST");
		});
	});

	describe("状态流", () => {
		it("负责人推进到已解决，提单人确认关闭；负责人不能自己关", async () => {
			const code = await newTicket(reporter, assignee);
			await assignee.api.item.transition({ code, to: "in_progress" });
			await assignee.api.item.transition({ code, to: "resolved" });
			expect(
				await codeOf(assignee.api.item.transition({ code, to: "closed" })),
			).toBe("FORBIDDEN");
			await reporter.api.item.transition({ code, to: "closed" });

			const { item } = await reporter.api.item.byCode({ code });
			expect(item.status).toBe("closed");
			expect(item.resolvedAt).toBeInstanceOf(Date);
			expect(item.closedAt).toBeInstanceOf(Date);

			const events = await reporter.api.item.timeline({ code });
			expect(events.map((e) => e.summary)).toEqual([
				"创建 Ticket",
				"开始处理",
				"标记已解决",
				"确认关闭",
			]);
		});

		it("重开清掉上一轮的完成时间", async () => {
			const code = await newTicket(reporter, assignee);
			await assignee.api.item.transition({ code, to: "resolved" });
			await reporter.api.item.transition({ code, to: "closed" });
			await reporter.api.item.transition({ code, to: "open" });
			const { item } = await reporter.api.item.byCode({ code });
			expect(item.resolvedAt).toBeNull();
			expect(item.closedAt).toBeNull();
		});
	});

	describe("编辑", () => {
		it("字段级 diff 进审计与时间线；标签按 {id,name} 记", async () => {
			const code = await newTicket(reporter, assignee);
			await assignee.api.item.update({
				code,
				title: "打印机又坏了",
				priority: "P1",
				tags: ["硬件"],
			});
			const events = await reporter.api.item.timeline({ code });
			const changes = events.at(-1)?.changes;
			expect(changes?.title).toEqual({
				from: "打印机坏了",
				to: "打印机又坏了",
			});
			expect(changes?.priority).toEqual({ from: "P0", to: "P1" });
			expect(changes?.tags?.to).toEqual([
				{ id: expect.any(Number), name: "硬件" },
			]);
		});

		it("没变化不记审计", async () => {
			const code = await newTicket(reporter, assignee);
			await reporter.api.item.update({ code, title: "打印机坏了" });
			expect(await reporter.api.item.timeline({ code })).toHaveLength(1);
		});

		it("别人先改了：带旧版本号的保存 CONFLICT", async () => {
			const code = await newTicket(reporter, assignee);
			const { item } = await reporter.api.item.byCode({ code });
			await assignee.api.item.update({ code, priority: "P2" });
			expect(
				await codeOf(
					reporter.api.item.update({
						code,
						title: "覆盖",
						expectedUpdatedAt: item.updatedAt,
					}),
				),
			).toBe("CONFLICT");
		});

		it("旁人不能编辑 ticket", async () => {
			const code = await newTicket(reporter, assignee);
			expect(
				await codeOf(bystander.api.item.update({ code, title: "改了" })),
			).toBe("FORBIDDEN");
		});
	});

	describe("时间线", () => {
		it("只有白名单列，不含 ip / ua / 评论审计", async () => {
			const code = await newTicket(reporter, assignee);
			await bystander.api.comment.add({ code, body: "我也遇到了" });
			const events = await bystander.api.item.timeline({ code });
			expect(events.map((e) => e.action)).toEqual([AUDIT_ACTIONS.itemCreate]);
			expect(Object.keys(events[0] ?? {}).sort()).toEqual(
				["action", "actorName", "at", "changes", "id", "summary"].sort(),
			);
		});
	});

	describe("todo 转 ticket", () => {
		it("要指定负责人；此前的历史非管理员看不到", async () => {
			const { code } = await reporter.api.item.create({
				type: "todo",
				title: "私下记的事",
				priority: "P1",
			});
			await reporter.api.item.update({ code, title: "私下记的事（细节）" });
			await reporter.api.item.convert({ code, assigneeId: assignee.user.id });

			const { item } = await bystander.api.item.byCode({ code });
			expect(item.type).toBe("ticket");
			expect(item.code).toBe(code);
			const seen = await bystander.api.item.timeline({ code });
			expect(seen.map((e) => e.action)).toEqual([AUDIT_ACTIONS.itemConvert]);
			expect((await admin.api.item.timeline({ code })).length).toBe(3);
			expect((await notificationsOf(assignee.user.id)).at(-1)?.itemId).toBe(
				item.id,
			);
		});
	});

	describe("删除与恢复", () => {
		it("提单人软删 → 列表与详情消失；管理员回收站恢复", async () => {
			const code = await newTicket(reporter, assignee);
			expect(await codeOf(assignee.api.item.delete({ code }))).toBe(
				"FORBIDDEN",
			);
			await reporter.api.item.delete({ code });
			expect(await codeOf(assignee.api.item.byCode({ code }))).toBe(
				"NOT_FOUND",
			);
			expect((await assignee.api.item.list({ q: code })).items).toEqual([]);
			expect((await admin.api.item.trash()).some((i) => i.code === code)).toBe(
				true,
			);
			expect(await codeOf(reporter.api.item.restore({ code }))).toBe(
				"FORBIDDEN",
			);
			await admin.api.item.restore({ code });
			expect(
				(await assignee.api.item.byCode({ code })).item.deletedAt,
			).toBeNull();
		});
	});

	describe("看板", () => {
		it("mine：我负责的进行中 + 我提的等我确认的", async () => {
			const working = await newTicket(reporter, assignee);
			const waiting = await newTicket(assignee, other);
			await other.api.item.transition({ code: waiting, to: "resolved" });
			const board = await assignee.api.item.board({ scope: "mine" });
			const codes = board.map((i) => i.code);
			expect(codes).toContain(working);
			expect(codes).toContain(waiting);
		});
	});

	describe("逾期筛选", () => {
		it("期望完成日期早于北京今天、仍在进行中的才算", async () => {
			const overdue = await newTicket(reporter, assignee, {
				dueDate: "2000-01-01",
			});
			const future = await newTicket(reporter, assignee, {
				dueDate: "2999-01-01",
			});
			const codes = (
				await reporter.api.item.list({ overdue: true, limit: 100 })
			).items.map((i) => i.code);
			expect(codes).toContain(overdue);
			expect(codes).not.toContain(future);
		});
	});

	describe("评论与 @", () => {
		it("被 @ 且看得见的人收「提到了你」，其余相关人收「新评论」", async () => {
			const code = await newTicket(reporter, assignee);
			await bystander.api.comment.add({
				code,
				body: `${formatMention("接手人", other.user.id)} 帮忙看下`,
			});
			expect((await notificationsOf(other.user.id)).at(-1)?.kind).toBe(
				"mentioned",
			);
			expect((await notificationsOf(reporter.user.id)).at(-1)?.kind).toBe(
				"commented",
			);
		});

		it("todo 里 @ 看不见它的人：不通知", async () => {
			const { code } = await reporter.api.item.create({
				type: "todo",
				title: "自己的事",
				priority: "P3",
			});
			const before = (await notificationsOf(bystander.user.id)).length;
			await reporter.api.comment.add({
				code,
				body: `${formatMention("旁人", bystander.user.id)} 不该收到`,
			});
			expect(await notificationsOf(bystander.user.id)).toHaveLength(before);
		});

		it("编辑评论只通知新加的 @；只能改自己的", async () => {
			const code = await newTicket(reporter, assignee);
			const { id } = await reporter.api.comment.add({
				code,
				body: `${formatMention("负责人", assignee.user.id)} 先看`,
			});
			const assigneeBefore = (await notificationsOf(assignee.user.id)).length;
			await reporter.api.comment.edit({
				id,
				body: `${formatMention("负责人", assignee.user.id)} ${formatMention("接手人", other.user.id)} 一起看`,
			});
			expect(await notificationsOf(assignee.user.id)).toHaveLength(
				assigneeBefore,
			);
			expect((await notificationsOf(other.user.id)).at(-1)?.kind).toBe(
				"mentioned",
			);
			expect(
				await codeOf(assignee.api.comment.edit({ id, body: "篡改" })),
			).toBe("FORBIDDEN");
		});
	});

	describe("通知", () => {
		it("未读数、单条已读、全部已读", async () => {
			const me = await actor({ name: "收件人" });
			await newTicket(reporter, me);
			await newTicket(reporter, me);
			expect(await me.api.notification.unreadCount()).toBe(2);
			const [first] = (await me.api.notification.list({})).items;
			if (!first) throw new Error("应有通知");
			await me.api.notification.markRead({ ids: [first.id] });
			expect(await me.api.notification.unreadCount()).toBe(1);
			await me.api.notification.markAllRead();
			expect(await me.api.notification.unreadCount()).toBe(0);
		});
	});

	describe("管理员", () => {
		it("成员调管理接口 FORBIDDEN", async () => {
			expect(await codeOf(bystander.api.admin.users())).toBe("FORBIDDEN");
			expect(
				await codeOf(
					bystander.api.admin.setRole({
						userId: bystander.user.id,
						role: "admin",
					}),
				),
			).toBe("FORBIDDEN");
		});

		it("授予与撤销进审计；最后一名管理员撤不掉", async () => {
			await testDb().execute(
				sql`UPDATE ticketodo_user SET role = 'member' WHERE role = 'admin'`,
			);
			const solo = await actor({ name: "唯一管理员", role: "admin" });
			expect(
				await codeOf(
					solo.api.admin.setRole({ userId: solo.user.id, role: "member" }),
				),
			).toBe("CONFLICT");

			const next = await actor({ name: "新管理员" });
			await solo.api.admin.setRole({ userId: next.user.id, role: "admin" });
			await solo.api.admin.setRole({ userId: solo.user.id, role: "member" });
			const actions = (await auditsFor("user", next.user.id)).map(
				(a) => a.action,
			);
			expect(actions).toContain(AUDIT_ACTIONS.adminGrant);
			expect(
				(await auditsFor("user", solo.user.id)).map((a) => a.action),
			).toContain(AUDIT_ACTIONS.adminRevoke);
		});

		it("审计查询按单号能查到条目与评论", async () => {
			const code = await newTicket(reporter, assignee);
			await bystander.api.comment.add({ code, body: "顶" });
			const { rows } = await admin.api.admin.audit({ target: code });
			expect(rows.map((r) => r.action).sort()).toEqual(
				[AUDIT_ACTIONS.commentCreate, AUDIT_ACTIONS.itemCreate].sort(),
			);
			expect(rows[0]?.ip).toBe("127.0.0.1");
		});
	});

	describe("审计只追加", () => {
		it("UPDATE / DELETE 被触发器拒绝", async () => {
			await expect(
				testDb().execute(
					sql`UPDATE ticketodo_audit_log SET action = 'x' WHERE id = (SELECT max(id) FROM ticketodo_audit_log)`,
				),
			).rejects.toThrow();
			await expect(
				testDb().execute(
					sql`DELETE FROM ticketodo_audit_log WHERE id = (SELECT max(id) FROM ticketodo_audit_log)`,
				),
			).rejects.toThrow();
		});
	});
});

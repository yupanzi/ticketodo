import { describe, expect, it } from "vitest";

import { recipientsFor } from "./notify";

const ticket = { type: "ticket" as const, reporterId: "r", assigneeId: "a" };
const todo = { type: "todo" as const, reporterId: "o", assigneeId: "o" };

describe("recipientsFor", () => {
	it("建单指派给别人：负责人收「指派给你」，提单人自己不收", () => {
		expect(
			recipientsFor({ kind: "assigned", actorId: "r", item: ticket }),
		).toEqual([{ recipientId: "a", kind: "assigned" }]);
	});

	it("负责人把单转给别人：新负责人收指派，提单人知会", () => {
		expect(
			recipientsFor({
				kind: "assigned",
				actorId: "a",
				item: { ...ticket, assigneeId: "b" },
			}),
		).toEqual([
			{ recipientId: "b", kind: "assigned" },
			{ recipientId: "r", kind: "status_changed" },
		]);
	});

	it("状态变更：通知另一方，不通知操作者", () => {
		expect(
			recipientsFor({ kind: "status_changed", actorId: "a", item: ticket }),
		).toEqual([{ recipientId: "r", kind: "status_changed" }]);
	});

	it("自己指派给自己的单子：没人可通知", () => {
		expect(
			recipientsFor({
				kind: "status_changed",
				actorId: "r",
				item: { ...ticket, assigneeId: "r" },
			}),
		).toEqual([]);
	});

	it("todo：只有管理员替人改时才通知所有者", () => {
		expect(
			recipientsFor({ kind: "status_changed", actorId: "o", item: todo }),
		).toEqual([]);
		expect(
			recipientsFor({ kind: "status_changed", actorId: "adm", item: todo }),
		).toEqual([{ recipientId: "o", kind: "status_changed" }]);
	});

	it("评论：被 @ 的收「提到了你」，其余相关人收「新评论」，一人一条", () => {
		expect(
			recipientsFor({
				kind: "commented",
				actorId: "x",
				item: ticket,
				mentionedIds: ["a", "y", "x"],
			}),
		).toEqual([
			{ recipientId: "a", kind: "mentioned" },
			{ recipientId: "y", kind: "mentioned" },
			{ recipientId: "r", kind: "commented" },
		]);
	});
});

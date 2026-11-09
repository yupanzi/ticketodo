import { describe, expect, it } from "vitest";

import type { ItemStatus } from "./item";
import {
	type Actor,
	allowedStatuses,
	canAssign,
	canComment,
	canConvert,
	canDelete,
	canDeleteComment,
	canEdit,
	canEditComment,
	canRestore,
	canSetPriority,
	canView,
	type ItemRef,
} from "./policy";

const reporter: Actor = { id: "r", role: "member" };
const assignee: Actor = { id: "a", role: "member" };
const bystander: Actor = { id: "x", role: "member" };
const admin: Actor = { id: "adm", role: "admin" };

function ticket(over: Partial<ItemRef> = {}): ItemRef {
	return {
		type: "ticket",
		status: "open",
		reporterId: "r",
		assigneeId: "a",
		deletedAt: null,
		...over,
	};
}

function todo(over: Partial<ItemRef> = {}): ItemRef {
	return {
		type: "todo",
		status: "open",
		reporterId: "r",
		assigneeId: "r",
		deletedAt: null,
		...over,
	};
}

const deleted = { deletedAt: new Date() };

describe("canView", () => {
	it("ticket 全员可见", () => {
		for (const a of [reporter, assignee, bystander, admin])
			expect(canView(a, ticket())).toBe(true);
	});

	it("todo 只有本人与管理员", () => {
		expect(canView(reporter, todo())).toBe(true);
		expect(canView(admin, todo())).toBe(true);
		expect(canView(bystander, todo())).toBe(false);
	});

	it("已删除的只有管理员（回收站）", () => {
		expect(canView(reporter, ticket(deleted))).toBe(false);
		expect(canView(admin, ticket(deleted))).toBe(true);
	});
});

describe("canEdit", () => {
	it("ticket：提单人、负责人、管理员", () => {
		expect(canEdit(reporter, ticket())).toBe(true);
		expect(canEdit(assignee, ticket())).toBe(true);
		expect(canEdit(admin, ticket())).toBe(true);
		expect(canEdit(bystander, ticket())).toBe(false);
	});

	it("todo：本人与管理员", () => {
		expect(canEdit(reporter, todo())).toBe(true);
		expect(canEdit(admin, todo())).toBe(true);
		expect(canEdit(bystander, todo())).toBe(false);
	});

	it("已删除的谁都不能改（管理员先恢复）", () => {
		expect(canEdit(admin, ticket(deleted))).toBe(false);
	});
});

describe("canSetPriority（定级由接收方定）", () => {
	it("ticket：负责人与管理员；提单人能编辑但不能改优先级", () => {
		expect(canSetPriority(assignee, ticket())).toBe(true);
		expect(canSetPriority(admin, ticket())).toBe(true);
		expect(canEdit(reporter, ticket())).toBe(true);
		expect(canSetPriority(reporter, ticket())).toBe(false);
		expect(canSetPriority(bystander, ticket())).toBe(false);
	});

	it("提单人自己就是负责人时可以", () => {
		expect(canSetPriority(reporter, ticket({ assigneeId: "r" }))).toBe(true);
	});

	it("todo：本人与管理员", () => {
		expect(canSetPriority(reporter, todo())).toBe(true);
		expect(canSetPriority(admin, todo())).toBe(true);
		expect(canSetPriority(bystander, todo())).toBe(false);
	});

	it("改派后跟着新负责人走", () => {
		const reassigned = ticket({ assigneeId: "x" });
		expect(canSetPriority(bystander, reassigned)).toBe(true);
		expect(canSetPriority(assignee, reassigned)).toBe(false);
	});

	it("已删除的谁都不能改", () => {
		expect(canSetPriority(admin, ticket(deleted))).toBe(false);
		expect(canSetPriority(assignee, ticket(deleted))).toBe(false);
	});
});

describe("canAssign（改派）", () => {
	it("只有当前负责人与管理员；提单人不行", () => {
		expect(canAssign(assignee, ticket())).toBe(true);
		expect(canAssign(admin, ticket())).toBe(true);
		expect(canAssign(reporter, ticket())).toBe(false);
		expect(canAssign(bystander, ticket())).toBe(false);
	});

	it("todo 没有改派，管理员也不行", () => {
		expect(canAssign(admin, todo())).toBe(false);
		expect(canAssign(reporter, todo())).toBe(false);
	});

	it("已关闭的不改派（先重开）", () => {
		expect(canAssign(admin, ticket({ status: "closed" }))).toBe(false);
	});
});

describe("allowedStatuses", () => {
	const sorted = (s: ItemStatus[]) => [...s].sort();

	it.each<[string, Actor, ItemRef, ItemStatus[]]>([
		["负责人 · 待处理", assignee, ticket(), ["in_progress", "resolved"]],
		[
			"负责人 · 处理中",
			assignee,
			ticket({ status: "in_progress" }),
			["open", "resolved"],
		],
		["负责人 · 已解决：等提单人", assignee, ticket({ status: "resolved" }), []],
		["提单人 · 待处理：只能撤回", reporter, ticket(), ["closed"]],
		[
			"提单人 · 已解决：确认或打回",
			reporter,
			ticket({ status: "resolved" }),
			["closed", "in_progress"],
		],
		["提单人 · 已关闭：重开", reporter, ticket({ status: "closed" }), ["open"]],
		["旁人什么都不能", bystander, ticket(), []],
		[
			"管理员 · 待处理：图里所有出边",
			admin,
			ticket(),
			["closed", "in_progress", "resolved"],
		],
		[
			"自己指派给自己：两种身份都有",
			reporter,
			ticket({ assigneeId: "r" }),
			["closed", "in_progress", "resolved"],
		],
		["todo · 本人：不经已解决", reporter, todo(), ["closed", "in_progress"]],
		["todo · 已关闭：重开", reporter, todo({ status: "closed" }), ["open"]],
		["todo · 旁人", bystander, todo(), []],
		["已删除", admin, ticket(deleted), []],
	])("%s", (_, actor, item, expected) => {
		expect(sorted(allowedStatuses(actor, item))).toEqual(sorted(expected));
	});

	it("管理员也走不出图外的边（已关闭不能直接到已解决）", () => {
		expect(allowedStatuses(admin, ticket({ status: "closed" }))).toEqual([
			"open",
		]);
	});
});

describe("删除与恢复", () => {
	it("ticket：提单人与管理员能删，负责人不能", () => {
		expect(canDelete(reporter, ticket())).toBe(true);
		expect(canDelete(admin, ticket())).toBe(true);
		expect(canDelete(assignee, ticket())).toBe(false);
	});

	it("todo：本人与管理员", () => {
		expect(canDelete(reporter, todo())).toBe(true);
		expect(canDelete(bystander, todo())).toBe(false);
	});

	it("恢复只有管理员，且只对已删除的", () => {
		expect(canRestore(admin, ticket(deleted))).toBe(true);
		expect(canRestore(reporter, ticket(deleted))).toBe(false);
		expect(canRestore(admin, ticket())).toBe(false);
	});
});

describe("canConvert（todo → ticket）", () => {
	it("本人与管理员，未关闭的 todo", () => {
		expect(canConvert(reporter, todo())).toBe(true);
		expect(canConvert(admin, todo())).toBe(true);
		expect(canConvert(bystander, todo())).toBe(false);
		expect(canConvert(reporter, todo({ status: "closed" }))).toBe(false);
		expect(canConvert(reporter, ticket())).toBe(false);
	});
});

describe("评论", () => {
	it("看得见就能评论；已关闭能，已删除不能", () => {
		expect(canComment(bystander, ticket())).toBe(true);
		expect(canComment(bystander, ticket({ status: "closed" }))).toBe(true);
		expect(canComment(bystander, todo())).toBe(false);
		expect(canComment(admin, ticket(deleted))).toBe(false);
	});

	it("改评论只有作者；删评论作者与管理员", () => {
		const c = { authorId: "x", deletedAt: null };
		expect(canEditComment(bystander, c)).toBe(true);
		expect(canEditComment(admin, c)).toBe(false);
		expect(canDeleteComment(admin, c)).toBe(true);
		expect(canDeleteComment(reporter, c)).toBe(false);
	});
});

import { describe, expect, it } from "vitest";

import { diffFields, hasChanges } from "./diff";

describe("diffFields", () => {
	const before = {
		title: "旧标题",
		priority: "P1",
		dueDate: null as string | null,
		tags: [{ id: 1, name: "后端" }],
		updatedAt: "x",
	};

	it("只比白名单字段、只记变了的", () => {
		const changes = diffFields(
			before,
			{ title: "新标题", priority: "P1", updatedAt: "y" },
			["title", "priority", "dueDate", "tags"],
		);
		expect(changes).toEqual({ title: { from: "旧标题", to: "新标题" } });
	});

	it("null 与 undefined 视为同一个「没有」", () => {
		expect(
			hasChanges(diffFields(before, { dueDate: undefined }, ["dueDate"])),
		).toBe(false);
		expect(diffFields(before, { dueDate: "2026-11-05" }, ["dueDate"])).toEqual({
			dueDate: { from: null, to: "2026-11-05" },
		});
	});

	it("数组按值比较", () => {
		expect(
			hasChanges(
				diffFields(before, { tags: [{ id: 1, name: "后端" }] }, ["tags"]),
			),
		).toBe(false);
		expect(diffFields(before, { tags: [] }, ["tags"]).tags).toEqual({
			from: [{ id: 1, name: "后端" }],
			to: [],
		});
	});
});

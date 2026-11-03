import { describe, expect, it } from "vitest";

import { findEdge, statusTimestamps } from "./status";

const NOW = new Date("2026-11-03T08:00:00Z");

describe("findEdge", () => {
	it("每条边都有时间线用的动作名", () => {
		expect(findEdge("ticket", "resolved", "closed")?.label).toBe("确认关闭");
		expect(findEdge("ticket", "open", "closed")?.label).toBe("撤回");
		expect(findEdge("todo", "in_progress", "closed")?.label).toBe("完成");
	});

	it("todo 没有「已解决」", () => {
		expect(findEdge("todo", "open", "resolved")).toBeUndefined();
		expect(findEdge("todo", "in_progress", "resolved")).toBeUndefined();
	});

	it("不存在原地踏步的边", () => {
		for (const s of ["open", "in_progress", "resolved", "closed"] as const)
			expect(findEdge("ticket", s, s)).toBeUndefined();
	});
});

describe("statusTimestamps", () => {
	it("进已解决记 resolvedAt，进已关闭记 closedAt", () => {
		expect(statusTimestamps("in_progress", "resolved", NOW)).toEqual({
			resolvedAt: NOW,
		});
		expect(statusTimestamps("resolved", "closed", NOW)).toEqual({
			closedAt: NOW,
		});
	});

	it("打回、重开时清掉上一轮的时间", () => {
		expect(statusTimestamps("resolved", "in_progress", NOW)).toEqual({
			resolvedAt: null,
		});
		expect(statusTimestamps("closed", "open", NOW)).toEqual({
			closedAt: null,
			resolvedAt: null,
		});
	});

	it("撤回只记关闭时间", () => {
		expect(statusTimestamps("open", "closed", NOW)).toEqual({ closedAt: NOW });
	});
});

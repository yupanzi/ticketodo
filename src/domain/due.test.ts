import { describe, expect, it } from "vitest";

import {
	addDays,
	dueLabel,
	dueState,
	endOfMonth,
	nextMonday,
	todayInAppTz,
	weekdayOf,
} from "./due";

describe("todayInAppTz", () => {
	// 容器是 UTC：北京时间零点前后最容易算错
	it("UTC 15:59 还是北京当天，16:00 已是第二天", () => {
		expect(todayInAppTz(new Date("2026-11-02T15:59:59Z"))).toBe("2026-11-02");
		expect(todayInAppTz(new Date("2026-11-02T16:00:00Z"))).toBe("2026-11-03");
	});
});

describe("addDays", () => {
	it("跨月、跨年、闰年", () => {
		expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
		expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
		expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
	});
});

describe("日期快捷项", () => {
	// 2026-11-01 是周日
	it("weekdayOf：0 是周日", () => {
		expect(weekdayOf("2026-11-01")).toBe(0);
		expect(weekdayOf("2026-11-02")).toBe(1);
		expect(weekdayOf("2026-11-07")).toBe(6);
	});

	it("nextMonday：严格晚于当天，周一当天是 7 天后", () => {
		expect(nextMonday("2026-11-01")).toBe("2026-11-02");
		expect(nextMonday("2026-11-02")).toBe("2026-11-09");
		expect(nextMonday("2026-11-07")).toBe("2026-11-09");
		expect(nextMonday("2026-12-29")).toBe("2027-01-04");
	});

	it("endOfMonth：大小月、闰年二月", () => {
		expect(endOfMonth("2026-11-03")).toBe("2026-11-30");
		expect(endOfMonth("2026-12-31")).toBe("2026-12-31");
		expect(endOfMonth("2028-02-10")).toBe("2028-02-29");
		expect(endOfMonth("2027-02-10")).toBe("2027-02-28");
	});
});

describe("dueState", () => {
	const today = "2026-11-03";

	it.each([
		["2026-11-02", "overdue"],
		["2026-11-03", "due_soon"],
		["2026-11-04", "due_soon"],
		["2026-11-05", "normal"],
	] as const)("期望 %s → %s", (due, state) => {
		expect(dueState(due, "in_progress", today)).toBe(state);
	});

	it("已解决、已关闭、没设日期的不算", () => {
		expect(dueState("2026-11-01", "resolved", today)).toBeNull();
		expect(dueState("2026-11-01", "closed", today)).toBeNull();
		expect(dueState(null, "open", today)).toBeNull();
	});
});

describe("dueLabel", () => {
	it("逾期 N 天 / 今天 / 明天，其余交给调用方显示日期", () => {
		expect(dueLabel("2026-11-01", "2026-11-03")).toBe("逾期 2 天");
		expect(dueLabel("2026-11-03", "2026-11-03")).toBe("今天到期");
		expect(dueLabel("2026-11-04", "2026-11-03")).toBe("明天到期");
		expect(dueLabel("2026-11-09", "2026-11-03")).toBeNull();
		// 跨月
		expect(dueLabel("2026-10-31", "2026-11-01")).toBe("逾期 1 天");
	});
});

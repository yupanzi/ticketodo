import { describe, expect, it } from "vitest";

import { addDays, dueState, todayInAppTz } from "./due";

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

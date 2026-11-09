import { describe, expect, it } from "vitest";

import {
	calendarSearch,
	ganttSearch,
	parseGanttStart,
	parseMonth,
	parseScheduleScope,
} from "./schedule-params";

const TODAY = "2026-11-11";
const params = (search: string) =>
	Object.fromEntries(new URLSearchParams(search.slice(1)));

describe("日历、甘特 ⇄ 地址栏", () => {
	it("默认值不写进地址栏", () => {
		expect(calendarSearch("2026-11", "assigned", TODAY)).toBe("");
		expect(ganttSearch("2026-11-02", "assigned", TODAY)).toBe("");
	});

	it("写出去再读回来不变", () => {
		const cal = params(calendarSearch("2027-03", "reported", TODAY));
		expect(parseMonth(cal.month, TODAY)).toBe("2027-03");
		expect(parseScheduleScope(cal.scope)).toBe("reported");
		const gantt = params(ganttSearch("2026-12-07", "all", TODAY));
		expect(parseGanttStart(gantt.from, TODAY)).toBe("2026-12-07");
		expect(parseScheduleScope(gantt.scope)).toBe("all");
	});

	it("手改的非法值回落默认，不抛", () => {
		expect(parseMonth("2026-13", TODAY)).toBe("2026-11");
		expect(parseMonth(["2027-01", "2027-02"], TODAY)).toBe("2026-11");
		expect(parseScheduleScope("mine")).toBe("assigned");
		// Date 会把 2-30 顺延成 3 月 2 日、13 月是 Invalid Date
		expect(parseGanttStart("2026-02-30", TODAY)).toBe("2026-11-02");
		expect(parseGanttStart("2026-13-01", TODAY)).toBe("2026-11-02");
	});

	it("甘特的起点对齐到周一", () => {
		expect(parseGanttStart("2026-11-19", TODAY)).toBe("2026-11-16");
	});
});

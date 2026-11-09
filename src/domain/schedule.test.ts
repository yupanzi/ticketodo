import { describe, expect, it } from "vitest";

import {
	defaultGanttStart,
	ganttRange,
	ganttSpan,
	monthGrid,
	monthGridRange,
	shiftMonth,
	startOfWeek,
} from "./schedule";

describe("月历", () => {
	it("周一开头：周日属于前一周", () => {
		expect(startOfWeek("2026-11-09")).toBe("2026-11-09"); // 周一
		expect(startOfWeek("2026-11-15")).toBe("2026-11-09"); // 周日
		expect(startOfWeek("2026-11-01")).toBe("2026-10-26"); // 周日
	});

	it("格子从 1 号所在周的周一到月末所在周的周日，按周切开", () => {
		const weeks = monthGrid("2026-11");
		expect(weeks).toHaveLength(6); // 11 月 1 日是周日
		expect(weeks[0]?.[0]).toBe("2026-10-26");
		expect(weeks.at(-1)?.[6]).toBe("2026-12-06");
		for (const w of weeks) expect(w).toHaveLength(7);
		expect(monthGridRange("2026-11")).toEqual({
			from: "2026-10-26",
			to: "2026-12-06",
		});
	});

	it("恰好四周的二月也照样按周排", () => {
		// 2027-02-01 是周一，28 天正好 4 周
		expect(monthGrid("2027-02")).toHaveLength(4);
	});

	it("跨年翻月", () => {
		expect(shiftMonth("2026-12", 1)).toBe("2027-01");
		expect(shiftMonth("2027-01", -1)).toBe("2026-12");
	});
});

describe("甘特", () => {
	it("默认从上周一开始，共 6 周", () => {
		expect(defaultGanttStart("2026-11-11")).toBe("2026-11-02");
		expect(ganttRange("2026-11-02")).toEqual({
			from: "2026-11-02",
			to: "2026-12-13",
		});
	});

	it("从起点画到期望完成", () => {
		expect(
			ganttSpan({
				spanStart: "2026-11-03",
				startDate: null,
				dueDate: "2026-11-20",
			}),
		).toEqual({ start: "2026-11-03", end: "2026-11-20", late: false });
	});

	it("计划开始晚于期望完成：两头对调，标 late", () => {
		expect(
			ganttSpan({
				spanStart: "2026-11-25",
				startDate: "2026-11-25",
				dueDate: "2026-11-20",
			}),
		).toEqual({ start: "2026-11-20", end: "2026-11-25", late: true });
	});

	it("建单日已经晚于期望完成（补录的单）不算排不过来", () => {
		expect(
			ganttSpan({
				spanStart: "2026-11-03",
				startDate: null,
				dueDate: "2026-11-01",
			}),
		).toEqual({ start: "2026-11-01", end: "2026-11-03", late: false });
	});
});

import { addDays, endOfMonth, weekdayOf } from "./due";

/**
 * 日历与甘特：日期一律 `YYYY-MM-DD` / `YYYY-MM` 字符串，按 UTC 算，与运行环境时区无关（同 `due.ts`）。
 */

/** 日历与甘特的视角：按人分。看板的 mine 还含「等我确认关闭」，这里只看负责与提出 */
export const SCHEDULE_SCOPES = ["assigned", "reported", "all"] as const;
export type ScheduleScope = (typeof SCHEDULE_SCOPES)[number];
export const DEFAULT_SCHEDULE_SCOPE: ScheduleScope = "assigned";

/** 一次最多查多少天：一屏月历最多 6 周、甘特 6 周，留点余量 */
export const SCHEDULE_MAX_DAYS = 62;

export function shiftMonth(month: string, n: number): string {
	const d = new Date(`${month}-01T00:00:00Z`);
	d.setUTCMonth(d.getUTCMonth() + n);
	return d.toISOString().slice(0, 7);
}

/** 周一开头 */
export function startOfWeek(day: string): string {
	return addDays(day, -((weekdayOf(day) + 6) % 7));
}

/**
 * 月历的格子首尾：从 1 号所在周的周一，到月末所在周的周日（5 或 6 周）。
 * 前后补的是相邻月的日子，照样显示当天到期的单；查询也按这个区间取。
 */
export function monthGridRange(month: string): { from: string; to: string } {
	const first = `${month}-01`;
	return {
		from: startOfWeek(first),
		to: addDays(startOfWeek(endOfMonth(first)), 6),
	};
}

/** 月历要画的格子，按周切开 */
export function monthGrid(month: string): string[][] {
	const { from, to } = monthGridRange(month);
	const weeks: string[][] = [];
	for (let day = from; day <= to; day = addDays(day, 7))
		weeks.push(Array.from({ length: 7 }, (_, i) => addDays(day, i)));
	return weeks;
}

// ---------- 甘特 ----------

/** 一屏看 6 周 */
export const GANTT_DAYS = 42;

/** 默认窗口从上周一开始：回看一周，主要往后看 */
export function defaultGanttStart(today: string): string {
	return addDays(startOfWeek(today), -7);
}

export function ganttRange(start: string): { from: string; to: string } {
	return { from: start, to: addDays(start, GANTT_DAYS - 1) };
}

/**
 * 甘特条的起止（含两端）。`spanStart` 由服务端算（计划开始，没排就是建单日，见 `ganttItems`），
 * 与它筛窗口的口径是同一个表达式。起点晚于期望完成：两头对调画出来；若是排的计划开始晚了，
 * 标 `late`（排不过来），补录的单建单日晚于期望完成不算。
 */
export function ganttSpan(item: {
	spanStart: string;
	startDate: string | null;
	dueDate: string;
}): { start: string; end: string; late: boolean } {
	const { spanStart: start, dueDate: due } = item;
	return start <= due
		? { start, end: due, late: false }
		: { start: due, end: start, late: item.startDate !== null };
}

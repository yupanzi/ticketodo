import { addDays, endOfMonth, weekdayOf } from "./due";

/**
 * 日历与甘特：日期一律 `YYYY-MM-DD` / `YYYY-MM` 字符串，按 UTC 算，与运行环境时区无关（同 `due.ts`）。
 */

/** 日历与甘特的视角：按人分。看板的 mine 还含「等我确认关闭」，这里只看负责与提出 */
export const SCHEDULE_SCOPES = ["assigned", "reported", "all"] as const;
export type ScheduleScope = (typeof SCHEDULE_SCOPES)[number];
export const DEFAULT_SCHEDULE_SCOPE: ScheduleScope = "assigned";

/** 一次最多查多少天：一屏月历 6 周、甘特 8 周，留点余量 */
export const SCHEDULE_MAX_DAYS = 62;

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** 地址栏的 `?month=`：不合法就回落到今天所在的月 */
export function parseMonth(raw: string | undefined, today: string): string {
	return raw && MONTH.test(raw) ? raw : today.slice(0, 7);
}

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
 * 月历要画的格子：从 1 号所在周的周一，到月末所在周的周日，按周切开（5 或 6 周）。
 * 前后补的是相邻月的日子，照样显示当天到期的单。
 */
export function monthGrid(month: string): string[][] {
	const first = `${month}-01`;
	const last = addDays(startOfWeek(endOfMonth(first)), 6);
	const weeks: string[][] = [];
	for (let day = startOfWeek(first); day <= last; day = addDays(day, 7))
		weeks.push(Array.from({ length: 7 }, (_, i) => addDays(day, i)));
	return weeks;
}

/** 月历要查的区间：与 `monthGrid` 的首尾一致 */
export function monthGridRange(month: string): { from: string; to: string } {
	const weeks = monthGrid(month);
	return {
		from: weeks[0]?.[0] ?? `${month}-01`,
		to: weeks.at(-1)?.[6] ?? endOfMonth(`${month}-01`),
	};
}

// ---------- 甘特 ----------

/** 一屏看 6 周 */
export const GANTT_DAYS = 42;

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** 合法的 `YYYY-MM-DD`：Date 会把 2-30 悄悄顺延成 3 月 2 日、13 月则是 Invalid Date，都不算 */
function isDay(raw: string): boolean {
	if (!DAY.test(raw)) return false;
	const d = new Date(`${raw}T00:00:00Z`);
	return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === raw;
}

/** 地址栏的 `?from=`：对齐到周一；没给或不合法就从上周一开始（回看一周，主要往后看） */
export function parseGanttStart(
	raw: string | undefined,
	today: string,
): string {
	return raw && isDay(raw) ? startOfWeek(raw) : defaultGanttStart(today);
}

export function defaultGanttStart(today: string): string {
	return addDays(startOfWeek(today), -7);
}

export function ganttRange(start: string): { from: string; to: string } {
	return { from: start, to: addDays(start, GANTT_DAYS - 1) };
}

/**
 * 甘特条的起止（含两端）：起点是计划开始，没排就用建单日。起点晚于期望完成说明排不过来：
 * 两头对调画出来，并标 `late`。
 */
export function ganttSpan(item: {
	startDate: string | null;
	dueDate: string;
	createdDay: string;
}): { start: string; end: string; late: boolean } {
	const start = item.startDate ?? item.createdDay;
	return start <= item.dueDate
		? { start, end: item.dueDate, late: false }
		: { start: item.dueDate, end: start, late: item.startDate !== null };
}

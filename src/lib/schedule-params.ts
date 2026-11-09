import { isDay } from "~/domain/due";
import {
	DEFAULT_SCHEDULE_SCOPE,
	defaultGanttStart,
	ganttRange,
	monthGridRange,
	SCHEDULE_SCOPES,
	type ScheduleScope,
	startOfWeek,
} from "~/domain/schedule";

/**
 * 日历与甘特的地址栏参数（同 `item-filters.ts`）：页面的服务端预取与组件读写地址栏都走这里，
 * 预取的查询 key 才与客户端一致，链接才能原样读回。
 */

type Param = string | string[] | undefined;
const one = (v: Param) => (typeof v === "string" ? v : undefined);

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** 只认合法值，其余回落默认（链接可能是手改的） */
export function parseScheduleScope(raw: Param): ScheduleScope {
	return SCHEDULE_SCOPES.find((s) => s === one(raw)) ?? DEFAULT_SCHEDULE_SCOPE;
}

/** `?month=`：不合法就回落到今天所在的月 */
export function parseMonth(raw: Param, today: string): string {
	const v = one(raw);
	return v && MONTH.test(v) ? v : today.slice(0, 7);
}

/** `?from=`：对齐到周一；不合法就回落到默认窗口 */
export function parseGanttStart(raw: Param, today: string): string {
	const v = one(raw);
	return v && isDay(v) ? startOfWeek(v) : defaultGanttStart(today);
}

/** `[参数名, 值, 默认值]` → `?…`：与默认相同的不写 */
function toQuery(entries: [string, string, string][]): string {
	const q = new URLSearchParams(
		entries.filter(([, v, d]) => v !== d).map(([k, v]) => [k, v]),
	);
	const s = q.toString();
	return s ? `?${s}` : "";
}

export function calendarSearch(
	month: string,
	scope: ScheduleScope,
	today: string,
): string {
	return toQuery([
		["month", month, today.slice(0, 7)],
		["scope", scope, DEFAULT_SCHEDULE_SCOPE],
	]);
}

export function ganttSearch(
	start: string,
	scope: ScheduleScope,
	today: string,
): string {
	return toQuery([
		["from", start, defaultGanttStart(today)],
		["scope", scope, DEFAULT_SCHEDULE_SCOPE],
	]);
}

export const calendarQueryInput = (month: string, scope: ScheduleScope) => ({
	...monthGridRange(month),
	scope,
});

export const ganttQueryInput = (start: string, scope: ScheduleScope) => ({
	...ganttRange(start),
	scope,
});

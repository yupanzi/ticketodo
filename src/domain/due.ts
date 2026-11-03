import { ACTIVE_STATUSES, type ItemStatus } from "./item";

/**
 * 「今天」「逾期」都按北京时间算。容器一律 UTC（不设 TZ），所以时区必须显式给；SQL 里的过滤用
 * `(now() AT TIME ZONE APP_TIMEZONE)::date`，与这里同一个常量。
 * ⚠️ 别做成可配：单号里的日期也是它，改了同一天会出现两种日期前缀。
 */
export const APP_TIMEZONE = "Asia/Shanghai";

const DAY_FORMAT = new Intl.DateTimeFormat("en-CA", {
	timeZone: APP_TIMEZONE,
	year: "numeric",
	month: "2-digit",
	day: "2-digit",
});

/** `YYYY-MM-DD`（en-CA 的日期格式恰好是它） */
export function todayInAppTz(now: Date = new Date()): string {
	return DAY_FORMAT.format(now);
}

export function addDays(day: string, n: number): string {
	const d = new Date(`${day}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + n);
	return d.toISOString().slice(0, 10);
}

export type DueState = "overdue" | "due_soon" | "normal";

/**
 * 只对进行中的条目有意义：已解决等提单人确认、已关闭的不算逾期。
 * due_soon = 今天或明天到期（与到期提醒同一口径）。
 */
export function dueState(
	dueDate: string | null,
	status: ItemStatus,
	today: string,
): DueState | null {
	if (!dueDate || !(ACTIVE_STATUSES as readonly ItemStatus[]).includes(status))
		return null;
	if (dueDate < today) return "overdue";
	if (dueDate <= addDays(today, 1)) return "due_soon";
	return "normal";
}

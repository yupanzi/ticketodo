import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";

import { APP_TIMEZONE, todayInAppTz, weekdayOf } from "~/domain/due";

// 显示一律北京时间：与「今天」「逾期」「单号日期」同一口径，不随浏览器时区变
const DATE_TIME = new Intl.DateTimeFormat("zh-CN", {
	timeZone: APP_TIMEZONE,
	year: "numeric",
	month: "2-digit",
	day: "2-digit",
	hour: "2-digit",
	minute: "2-digit",
	hour12: false,
});

export function formatDateTime(d: Date): string {
	return DATE_TIME.format(d);
}

export function formatRelative(d: Date): string {
	return formatDistanceToNow(d, { locale: zhCN, addSuffix: true });
}

/** `YYYY-MM-DD` → `10月1日`（北京时间的今年省略年份） */
export function formatDay(day: string): string {
	const [y, m, d] = day.split("-").map(Number);
	return day.slice(0, 4) === todayInAppTz().slice(0, 4)
		? `${m}月${d}日`
		: `${y}年${m}月${d}日`;
}

const WEEKDAY = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

/** `10月1日 周四`：选日期时带上星期，排期一眼看出是不是周末 */
export function formatDayWeek(day: string): string {
	return `${formatDay(day)} ${WEEKDAY[weekdayOf(day)]}`;
}

/** 起止日期：两端、只有起、只有止 */
export function formatDayRange(r: { from?: string; to?: string }): string {
	if (r.from && r.to)
		return r.from === r.to
			? formatDay(r.from)
			: `${formatDay(r.from)} – ${formatDay(r.to)}`;
	if (r.from) return `${formatDay(r.from)} 起`;
	if (r.to) return `至 ${formatDay(r.to)}`;
	return "";
}

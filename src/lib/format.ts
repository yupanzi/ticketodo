import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";

import { APP_TIMEZONE } from "~/domain/due";

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

/** `YYYY-MM-DD` → `10月1日`（同年省略年份） */
export function formatDay(day: string): string {
	const [y, m, d] = day.split("-").map(Number);
	const thisYear = new Date().getFullYear();
	return y === thisYear ? `${m}月${d}日` : `${y}年${m}月${d}日`;
}

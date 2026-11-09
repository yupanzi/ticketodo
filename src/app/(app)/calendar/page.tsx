import type { Metadata } from "next";

import { ItemCalendar } from "~/components/item-calendar";
import { todayInAppTz } from "~/domain/due";
import {
	DEFAULT_SCHEDULE_SCOPE,
	monthGridRange,
	parseMonth,
	SCHEDULE_SCOPES,
} from "~/domain/schedule";
import { getQueryClient, HydrateClient, trpc } from "~/trpc/server";

export const metadata: Metadata = { title: "日历" };

/** `?month=2026-11&scope=reported`：链接里带着看的是哪个月、谁的 */
export default async function CalendarPage({
	searchParams,
}: PageProps<"/calendar">) {
	const params = await searchParams;
	const month = parseMonth(
		typeof params.month === "string" ? params.month : undefined,
		todayInAppTz(),
	);
	const scope =
		SCHEDULE_SCOPES.find((s) => s === params.scope) ?? DEFAULT_SCHEDULE_SCOPE;
	// 与 ItemCalendar 的查询同一个 key：月格首尾 + 视角
	await getQueryClient().prefetchQuery(
		trpc.item.calendar.queryOptions({ ...monthGridRange(month), scope }),
	);
	return (
		<HydrateClient>
			<ItemCalendar initialMonth={month} initialScope={scope} />
		</HydrateClient>
	);
}

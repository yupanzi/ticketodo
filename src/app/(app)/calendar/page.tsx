import type { Metadata } from "next";

import { ItemCalendar } from "~/components/item-calendar";
import { todayInAppTz } from "~/domain/due";
import {
	calendarQueryInput,
	parseMonth,
	parseScheduleScope,
} from "~/lib/schedule-params";
import { getQueryClient, HydrateClient, orpc } from "~/orpc/server";

export const metadata: Metadata = { title: "日历视图" };

/** `?month=2026-11&scope=reported`：链接里带着看的是哪个月、谁的 */
export default async function CalendarPage({
	searchParams,
}: PageProps<"/calendar">) {
	const params = await searchParams;
	const month = parseMonth(params.month, todayInAppTz());
	const scope = parseScheduleScope(params.scope);
	await getQueryClient().prefetchQuery(
		orpc.view.calendar.queryOptions({
			input: calendarQueryInput(month, scope),
		}),
	);
	return (
		<HydrateClient>
			<ItemCalendar initialMonth={month} initialScope={scope} />
		</HydrateClient>
	);
}

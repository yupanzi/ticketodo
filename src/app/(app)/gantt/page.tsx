import type { Metadata } from "next";

import { ItemGantt } from "~/components/item-gantt";
import { todayInAppTz } from "~/domain/due";
import {
	ganttQueryInput,
	parseGanttStart,
	parseScheduleScope,
} from "~/lib/schedule-params";
import { getQueryClient, HydrateClient, trpc } from "~/trpc/server";

export const metadata: Metadata = { title: "甘特图" };

/** `?from=2026-11-02&scope=reported`：链接里带着看的是哪几周、谁的 */
export default async function GanttPage({ searchParams }: PageProps<"/gantt">) {
	const params = await searchParams;
	const start = parseGanttStart(params.from, todayInAppTz());
	const scope = parseScheduleScope(params.scope);
	await getQueryClient().prefetchQuery(
		trpc.item.gantt.queryOptions(ganttQueryInput(start, scope)),
	);
	return (
		<HydrateClient>
			<ItemGantt initialScope={scope} initialStart={start} />
		</HydrateClient>
	);
}

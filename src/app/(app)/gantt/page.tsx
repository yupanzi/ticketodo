import type { Metadata } from "next";

import { ItemGantt } from "~/components/item-gantt";
import { todayInAppTz } from "~/domain/due";
import {
	DEFAULT_SCHEDULE_SCOPE,
	ganttRange,
	parseGanttStart,
	SCHEDULE_SCOPES,
} from "~/domain/schedule";
import { getQueryClient, HydrateClient, trpc } from "~/trpc/server";

export const metadata: Metadata = { title: "甘特图" };

/** `?from=2026-11-02&scope=reported`：链接里带着看的是哪几周、谁的 */
export default async function GanttPage({ searchParams }: PageProps<"/gantt">) {
	const params = await searchParams;
	const start = parseGanttStart(
		typeof params.from === "string" ? params.from : undefined,
		todayInAppTz(),
	);
	const scope =
		SCHEDULE_SCOPES.find((s) => s === params.scope) ?? DEFAULT_SCHEDULE_SCOPE;
	// 与 ItemGantt 的查询同一个 key：窗口首尾 + 视角
	await getQueryClient().prefetchQuery(
		trpc.item.gantt.queryOptions({ ...ganttRange(start), scope }),
	);
	return (
		<HydrateClient>
			<ItemGantt initialScope={scope} initialStart={start} />
		</HydrateClient>
	);
}

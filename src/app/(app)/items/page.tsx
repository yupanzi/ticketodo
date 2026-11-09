import type { Metadata } from "next";

import { ItemsTable } from "~/components/items-table";
import {
	listQueryInput,
	nextListCursor,
	parseListFilters,
} from "~/lib/item-filters";
import { getQueryClient, HydrateClient, trpc } from "~/trpc/server";

export const metadata: Metadata = { title: "全部单子" };

export default async function ItemsPage({ searchParams }: PageProps<"/items">) {
	const initial = parseListFilters(await searchParams);
	// 第一页与标签随页面下发，理由同看板页
	const qc = getQueryClient();
	await Promise.all([
		qc.prefetchInfiniteQuery(
			trpc.item.list.infiniteQueryOptions(listQueryInput(initial), {
				getNextPageParam: nextListCursor,
			}),
		),
		qc.prefetchQuery(trpc.tag.list.queryOptions()),
	]);
	return (
		<HydrateClient>
			<ItemsTable initial={initial} />
		</HydrateClient>
	);
}

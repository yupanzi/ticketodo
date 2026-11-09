import type { Metadata } from "next";

import { ItemsTable } from "~/components/items-table";
import { listInfiniteOptions, parseListFilters } from "~/lib/item-filters";
import { getQueryClient, HydrateClient, orpc } from "~/orpc/server";

export const metadata: Metadata = { title: "全部单子" };

export default async function ItemsPage({ searchParams }: PageProps<"/items">) {
	const initial = parseListFilters(await searchParams);
	// 第一页与标签随页面下发，理由同看板页
	const qc = getQueryClient();
	await Promise.all([
		qc.prefetchInfiniteQuery(
			orpc.item.list.infiniteOptions(listInfiniteOptions(initial)),
		),
		qc.prefetchQuery(orpc.tag.list.queryOptions()),
	]);
	return (
		<HydrateClient>
			<ItemsTable initial={initial} />
		</HydrateClient>
	);
}

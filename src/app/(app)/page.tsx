import type { Metadata } from "next";

import { QuadrantBoard } from "~/components/quadrant-board";
import { DEFAULT_BOARD_SCOPE } from "~/domain/item-list";
import { getQueryClient, HydrateClient, orpc } from "~/orpc/server";

export const metadata: Metadata = { title: "象限看板" };

export default async function BoardPage() {
	// 数据随页面下发：不预取的话，页面到了客户端才开始查，导航要串行等两个往返
	const qc = getQueryClient();
	await Promise.all([
		qc.prefetchQuery(
			orpc.view.board.queryOptions({ input: { scope: DEFAULT_BOARD_SCOPE } }),
		),
		qc.prefetchQuery(orpc.view.summary.queryOptions()),
	]);
	return (
		<HydrateClient>
			<QuadrantBoard />
		</HydrateClient>
	);
}

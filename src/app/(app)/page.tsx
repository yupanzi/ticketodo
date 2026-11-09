import { QuadrantBoard } from "~/components/quadrant-board";
import { DEFAULT_BOARD_SCOPE } from "~/domain/item-list";
import { getQueryClient, HydrateClient, trpc } from "~/trpc/server";

export default async function BoardPage() {
	// 数据随页面下发：不预取的话，页面到了客户端才开始查，导航要串行等两个往返
	const qc = getQueryClient();
	await Promise.all([
		qc.prefetchQuery(
			trpc.item.board.queryOptions({ scope: DEFAULT_BOARD_SCOPE }),
		),
		qc.prefetchQuery(trpc.item.summary.queryOptions()),
	]);
	return (
		<HydrateClient>
			<QuadrantBoard />
		</HydrateClient>
	);
}

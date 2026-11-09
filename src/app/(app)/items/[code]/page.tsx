import type { Metadata } from "next";

import { ItemDetail } from "~/components/item-detail";
import { getQueryClient, HydrateClient, trpc } from "~/trpc/server";

export async function generateMetadata({
	params,
}: PageProps<"/items/[code]">): Promise<Metadata> {
	return { title: (await params).code };
}

export default async function ItemPage({ params }: PageProps<"/items/[code]">) {
	const { code } = await params;
	// 详情、时间线、评论都在服务端取好：首屏不闪，也不用到了客户端再串行查两趟。
	// 看不见的单子预取失败，客户端照常显示 NOT_FOUND
	const qc = getQueryClient();
	await Promise.all([
		qc.prefetchQuery(trpc.item.byCode.queryOptions({ code })),
		qc.prefetchQuery(trpc.item.timeline.queryOptions({ code })),
		qc.prefetchQuery(trpc.comment.list.queryOptions({ code })),
	]);
	return (
		<HydrateClient>
			<ItemDetail code={code} />
		</HydrateClient>
	);
}

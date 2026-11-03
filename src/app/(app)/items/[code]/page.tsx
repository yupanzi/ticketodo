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
	// 详情先在服务端取好，首屏不闪；看不见的单子预取失败，客户端照常显示 NOT_FOUND
	await getQueryClient().prefetchQuery(trpc.item.byCode.queryOptions({ code }));
	return (
		<HydrateClient>
			<ItemDetail code={code} />
		</HydrateClient>
	);
}

import type { Metadata } from "next";

import { ApiKeys } from "~/components/api-keys";
import { getQueryClient, HydrateClient, orpc } from "~/orpc/server";

export const metadata: Metadata = { title: "接口密钥" };

export default async function ApiKeysPage() {
	await getQueryClient().prefetchQuery(orpc.apiKey.list.queryOptions());
	return (
		<HydrateClient>
			<ApiKeys />
		</HydrateClient>
	);
}

import type { Metadata } from "next";

import { AdminApiKeys } from "~/components/admin-api-keys";
import { getQueryClient, HydrateClient, orpc } from "~/orpc/server";

export const metadata: Metadata = { title: "密钥管理" };

export default async function AdminApiKeysPage() {
	await getQueryClient().prefetchQuery(orpc.admin.apiKeys.queryOptions());
	return (
		<HydrateClient>
			<AdminApiKeys />
		</HydrateClient>
	);
}

import type { Metadata } from "next";

import { AdminAudit } from "~/components/admin-audit";

export const metadata: Metadata = { title: "审计日志" };

export default async function Page({
	searchParams,
}: PageProps<"/admin/audit">) {
	const { apiKeyId } = await searchParams;
	return (
		<AdminAudit
			apiKeyId={typeof apiKeyId === "string" ? apiKeyId : undefined}
		/>
	);
}

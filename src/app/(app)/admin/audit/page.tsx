import type { Metadata } from "next";

import { AdminAudit } from "~/components/admin-audit";

export const metadata: Metadata = { title: "审计日志" };

export default function Page() {
	return <AdminAudit />;
}

import type { Metadata } from "next";

import { AdminUsers } from "~/components/admin-users";

export const metadata: Metadata = { title: "成员管理" };

export default function Page() {
	return <AdminUsers />;
}

import type { Metadata } from "next";

import { AdminUsers } from "~/components/admin-users";

export const metadata: Metadata = { title: "成员与管理员" };

export default function Page() {
	return <AdminUsers />;
}
